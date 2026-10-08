/**
 * Your Friend has a voice. It reacts to the world now and then, in its family's own manner: a Skeleton is dry, a Colossus
 * blunt, a Hoverer curious, a Mask says little, a Sparkling Friend can't contain itself. Lines are chosen from what's
 * actually going on (where you are, the weather, the hour, what's near, what you're doing) and from what you've lived
 * (first times, old haunts, how you've spent your days), never from a random pool. A cooldown keeps it from chattering;
 * a setting (Friend speech: full, reduced, rare, off) keeps it quiet if you'd rather; the lines that matter still land.
 *
 * Output: a word over your Friend's head and a line in chat as "<name>: …"; on "full", other players nearby hear it too.
 */
import { FAMILY_NAMES, MONSTERS, SKILL_NAMES, item, levelForXp, type Skill } from "./data.ts";
import { CHATTER, PLAIN, SHARED_CHATTER, SKILL_LINES, VOICES, type FriendEvent } from "./friendlines.ts";
import { addXp, emit, message, type Game, type Player } from "./state.ts";
import { T, isUnderground, objectAtTile, regionAt, terrainAt } from "./world.ts";
import { playerName, presenceLevel } from "./presence.ts";
import { currentLanguage, translate } from "./i18n.ts";
import { TABLE_LANGUAGES } from "./lang/table.ts";
import { FRIEND } from "./lang/friend.ts";

export type FriendSpeech = "full" | "reduced" | "rare" | "off";
export type { FriendEvent } from "./friendlines.ts";
/** How far apart lines are, by setting (ticks), and which events still speak on "rare". */
const GAP: Record<FriendSpeech, number> = { full: 40, reduced: 120, rare: 400, off: Infinity };
const IMPORTANT = new Set<FriendEvent>(["region", "dragon", "boss", "death", "quest", "mastery", "hollow", "fellowship", "mount", "levelup"]);
/** Each event's own cooldown (ticks), so the same kind of remark doesn't come round too soon. */
const EVENT_GAP: Partial<Record<FriendEvent, number>> = { creature: 300, creature_again: 600, undead: 400, grave: 900, altar: 900, statue: 900, fight: 200, hurt: 150, tired: 500, mine: 700, chop: 700, bones: 600, mountain: 1500, sea: 1500, idle: 900, friend_near: 1500, outfit: 600, rain: 800, night: 1600, storm: 1200, fog: 1200, dawn: 1600, snow: 1500, lava: 1200, swamp: 1500, desert: 1500, village: 1200, ruin: 1200, water: 1800, full_pack: 600, coins: 1500, shop: 900, bank: 900, pet: 1200, levelup: 50 };
/** Memories: lines that only exist because of what you've lived. Checked before the family's own, at Presence 30 and up. */
function memoryLine(game: Game, event: FriendEvent, name: string | null): string | null {
  const p = game.player, level = presenceLevel(p), f = p.firsts;
  if (level < 30) return null;
  if (event === "dragon_again" && f.first_dragon && game.rng() < 0.5) return "That was our first dragon, once. We used to be afraid of these.";
  if (event === "revisit" && name && p.quests.hazels_quiver === 2 && name === "Fernwick" && game.rng() < 0.6) return "Fernwick again. Hazel still owes us those arrows.";
  if (event === "revisit" && name === "Highcairn" && (p.quests.dawn_vigil ?? 0) >= 2 && game.rng() < 0.5) return "Dawnhold's over the ridge. We kept the vigil there.";
  if (event === "underground" && f.first_death && game.rng() < 0.3) return "Last time somewhere like this, we didn't come back the first try.";
  if (event === "boss" && f.first_boss && game.rng() < 0.5) return "Remember the first one? We shook for an hour.";
  if (event === "region" && level >= 50) {
    const t = tendencies(game);
    if (t.explorer >= 20 && game.rng() < 0.4) return "We've never been down this road. Good.";
  }
  return null;
}
/** Invisible leanings from how you've spent your days, for the odd remark at Presence 50 and up. */
export function tendencies(game: Game) {
  const p = game.player;
  return {
    explorer: Object.keys(p.visited).length, warrior: Math.floor(p.kills / 50), scholar: Math.floor((levelForXp(p.xp.magic) + levelForXp(p.xp.sigilcraft)) / 10),
    collector: Math.floor(Object.keys(p.outfits).length / 5), crafter: Math.floor((levelForXp(p.xp.smithing) + levelForXp(p.xp.crafting) + levelForXp(p.xp.apothecary)) / 15), faithful: Math.floor(levelForXp(p.xp.prayer) / 10),
  };
}
function tendencyLine(game: Game): string | null {
  if (presenceLevel(game.player) < 50) return null;
  const t = tendencies(game), best = Object.entries(t).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 5 || game.rng() > 0.3) return null;
  return { explorer: "What's beyond that hill?", warrior: "Something's nearby. I can feel it.", scholar: "There's a sigil in that pattern, if you look.", collector: "We don't have one of those yet.", crafter: "That would make a fine handle.", faithful: "We should light the altar before we leave." }[best[0]] ?? null;
}

/**
 * A line as it's said, in the player's language (lang/friend.ts has every line in every language): the names filled in,
 * translated where the game knows them (a creature, a region, a skill), a player's own Friend's name left as it is.
 */
export function spoken(line: string, fill: Record<string, string>, language = currentLanguage()) {
  const column = TABLE_LANGUAGES.indexOf(language as typeof TABLE_LANGUAGES[number]);
  let out = (column >= 0 ? FRIEND[line]?.[column] : undefined) ?? line;
  for (const [key, value] of Object.entries(fill)) out = out.split(`{${key}}`).join(key === "friend" || key === "n" || !value ? value : translate(value, language));
  out = out.replace(/ {2,}/g, " ").trim();
  // A creature's name is written small ("a grumblin"), so where one starts a sentence it takes a capital.
  return out.replace(/(^|[.!?…]\s+)(\p{Ll})/gu, (_, before: string, letter: string) => before + letter.toLocaleUpperCase(language === "en" ? undefined : language));
}
/** Say something, if it's time. Returns the line said, or null. */
export function friendSays(game: Game, event: FriendEvent, name: string | null = null, n = 0): string | null {
  const p = game.player, mode = game.friendSpeech;
  if (mode === "off") return null;
  if (mode === "rare" && !IMPORTANT.has(event)) return null;
  if (game.tick - p.friendLast < GAP[mode] && !IMPORTANT.has(event)) return null;
  const gap = EVENT_GAP[event]; if (gap && game.tick - (p.friendEventAt[event] ?? -1e9) < gap) return null;
  const voice = VOICES[p.familyId] ?? PLAIN;
  let line = memoryLine(game, event, name) ?? (event === "idle" ? tendencyLine(game) : null);
  if (!line && event === "idle" && game.rng() < 0.6) { const bank = [...(CHATTER[p.familyId] ?? []), ...SHARED_CHATTER]; line = bank[Math.floor(game.rng() * bank.length)]; }
  if (!line) { const pool = voice[event] ?? PLAIN[event] ?? []; if (!pool.length) return null; line = pool[Math.floor(game.rng() * pool.length)]; }
  line = spoken(line, { name: name ?? "", n: String(n), friend: p.name ?? `#${p.friendId}`, region: regionAt(game.world, p.x, p.y).name });
  p.friendLast = game.tick; p.friendEventAt[event] = game.tick;
  message(game, `${playerName(p)}: ${line}`, "public");
  emit(game, { type: "friend", text: line, share: mode === "full", tick: game.tick });
  return line;
}
/** Working a skill: a word about it, now and then, in the family's manner or everyone's. */
export function friendWorks(game: Game, skill: Skill) {
  const p = game.player, mode = game.friendSpeech;
  if (mode === "off" || mode === "rare") return null;
  if (game.tick - (p.friendEventAt[`skill_${skill}`] ?? -1e9) < 700 || game.tick - p.friendLast < GAP[mode]) return null;
  const lines = SKILL_LINES[skill]; if (!lines) return null;
  const pool = [...lines.shared, ...(lines.family[p.familyId] ?? []), ...(lines.family[p.familyId] ?? [])];
  if (!pool.length || game.rng() > 0.5) return null;
  const line = spoken(pool[Math.floor(game.rng() * pool.length)], { skill: SKILL_NAMES[skill] });
  p.friendLast = game.tick; p.friendEventAt[`skill_${skill}`] = game.tick;
  message(game, `${playerName(p)}: ${line}`, "public"); emit(game, { type: "friend", text: line, share: mode === "full", tick: game.tick });
  return line;
}
/** A first time, remembered forever (the day it happened); the first of some things is worth Presence. */
export function remember(game: Game, key: string) {
  const p = game.player;
  if (p.firsts[key]) return false;
  p.firsts[key] = Math.floor(Date.now() / 86_400_000);
  addXp(game, "presence", 10, { raw: true });
  return true;
}

/** Looking around: what's near, where we are, what the sky's doing. Called every few ticks. */
export function friendTick(game: Game) {
  const p = game.player, here = regionAt(game.world, p.x, p.y), region = here.id;
  // Regions: the first time, and coming back.
  if (p.friendRegion !== region) {
    const was = p.friendRegion; p.friendRegion = region;
    if (was !== null && region !== "coast") {
      if (region === "hollow_depths") { remember(game, "first_hollow"); friendSays(game, "hollow"); }
      else if ((p.visited[region] ?? 0) >= game.tick - 10) friendSays(game, "region", here.name);
      else if (presenceLevel(p) >= 10) friendSays(game, "revisit", here.name);
      else if (isUnderground(p.y)) friendSays(game, "underground");
      else if (["ironreach", "drakespine", "greyhorn", "frostpeak"].includes(region)) friendSays(game, "mountain");
      else if (["saltmarrow", "pale_isles"].includes(region)) friendSays(game, "sea");
    }
  }
  // The sky.
  if (game.ambient.night !== p.friendNight) { p.friendNight = game.ambient.night; if (!isUnderground(p.y)) friendSays(game, p.friendNight ? "night" : "dawn"); }
  if (game.ambient.rain !== p.friendRain) { p.friendRain = game.ambient.rain; if (p.friendRain && !isUnderground(p.y)) friendSays(game, game.ambient.storm ? "storm" : "rain"); }
  if (game.ambient.fog && game.tick % 50 === 0 && !isUnderground(p.y)) friendSays(game, "fog");
  // The ground underfoot and the place you're in, now and then.
  if (game.tick % 25 === 0 && !isUnderground(p.y)) {
    const t = terrainAt(game.world, p.x, p.y), r = here.danger === 0 && !["coast", "friendhollow"].includes(region) && region !== p.friendVillage;
    if (t === T.SNOW) friendSays(game, "snow"); else if (t === T.LAVA || (t === T.ASH && game.rng() < 0.2)) friendSays(game, "lava"); else if (t === T.SWAMP) friendSays(game, "swamp"); else if (t === T.SAND && region === "pale_dunes") friendSays(game, "desert");
    if (r) { p.friendVillage = region; friendSays(game, "village"); }
    if (game.rng() < 0.05) { const near = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => objectNear(game, p.x + dx, p.y + dy)).find(o => o && o.kind === "decor" && (o.decor === "ruin_wall" || o.decor === "pillar" || o.decor === "rubble")); if (near) friendSays(game, "ruin"); }
  }
  // What's near: the nearest aggressive creature in view, met for the first time or for the hundredth.
  if (game.tick % 10 === 0 && p.combat === null) {
    let best: { id: string; d: number } | null = null;
    for (const monster of game.monsters) {
      if (monster.dead || !monster.def.aggressive) continue;
      const d = Math.max(Math.abs(monster.x - p.x), Math.abs(monster.y - p.y));
      if (d <= 6 && (!best || d < best.d)) best = { id: monster.def.id, d };
    }
    if (best && best.id !== p.friendSeen) {
      p.friendSeen = best.id;
      const def = MONSTERS[best.id], kills = p.killLog[best.id] ?? 0, name = def.name.toLowerCase().replace(/\b(rrr|fff)\b/g, word => word.toUpperCase()).replace(/\braria\b/g, "Raria");
      if (def.breath) { if (remember(game, "first_dragon") || kills < 3) friendSays(game, "dragon"); else friendSays(game, "dragon_again"); }
      else if (def.undead) friendSays(game, "undead");
      else if (kills >= 50) friendSays(game, "creature_again", name, kills);
      else if (!p.friendKinds[best.id]) { p.friendKinds[best.id] = 1; friendSays(game, "creature", name); }
    }
    // Graves, altars and the Old Friend, when you stand by them.
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [0, -2], [0, 2], [-2, 0], [2, 0]] as const) {
      const object = objectNear(game, p.x + dx, p.y + dy);
      if (!object) continue;
      if (object.kind === "altar") { friendSays(game, "altar"); break; }
      if (object.kind === "decor" && object.decor === "grave") { friendSays(game, "grave"); break; }
      if (object.kind === "decor" && object.decor === "old_friend") { friendSays(game, "statue"); break; }
    }
  }
  // Another Friend walking with you.
  if (p.follower !== null && game.tick % 500 === 0) friendSays(game, "friend_near");
  // Nothing much happening: now and then, a thought.
  if (game.tick % 400 === 0 && p.combat === null && !p.activity && game.rng() < 0.25) friendSays(game, "idle");
}
const objectNear = (game: Game, x: number, y: number) => objectAtTile(game.world, x, y);
/** The Friend's family, for NPCs who notice. */
export const familyOf = (player: Player) => FAMILY_NAMES[player.familyId];
export const familyName = (family: number) => FAMILY_NAMES[family];
/** Which equipment counts as a strange outfit worth a remark: a regional set from somewhere far, or a mask of a monster. */
export function outfitRemark(game: Game, id: string) {
  const def = item(id);
  if (def.icon.shape === "mask" || id === "grumblin_head" || id.startsWith("drakehide_hood")) friendSays(game, "outfit");
}
