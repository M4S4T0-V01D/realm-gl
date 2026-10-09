/**
 * Presence: the mark you leave upon the world. A skill earned by living in the Realm rather than grinding one thing:
 * discovering regions, finishing quests, felling bosses, rare finds, your Friend's company, the clothes you're seen
 * in, the people you talk to, the emotes you learn, and the name and fellowship you carry. Shown as a character
 * profile rather than a skill guide (panels.tsx), with titles to choose from as it grows.
 *
 * Naming: every Friend is a token, immutable; its name is the player's and can change. The name is shown large over
 * the Friend, the fellowship tag under it, the token id small and faded. The Namekeeper in Friendhollow renames.
 */
import { FAMILY_NAMES, REGIONAL_CLOTHING, SKILLS, SKILL_NAMES, WARDROBE, isItem, item, levelForXp, type Skill } from "./data.ts";
import { addXp, count, message, sound, take, type Game, type Player } from "./state.ts";
import { REGIONS, regionAt, type RegionId } from "./world.ts";

/** Presence XP is "raw": it ignores XP relics and rates, so it's earned at one pace for everyone. */
/** Presence comes slowly: half the pace the rest of the Realm is earned at, since it should take longest of all. */
export const PRESENCE_RATE = 0.5;
/** Presence XP, at the slow rate; a Wanderer's cloak adds a fifth, a Cape of Renown a third. */
export function presenceXp(game: Game, amount: number) {
  const cape = game.player.equipment.cape, more = cape === "cape_of_renown" ? 1.3 : cape === "wanderers_cloak" ? 1.2 : 1;
  addXp(game, "presence", amount * PRESENCE_RATE * more, { raw: true });
}
export const presenceLevel = (player: Player) => levelForXp(player.xp.presence);

// ---------- Names and fellowships ----------
export const NAME_MIN = 2, NAME_MAX = 16, RENAME_COST = 1000, FELLOWSHIP_COST = 5000, FELLOWSHIP_JOIN_COST = 500, FELLOWSHIP_RENAME_COST = 2500;
/** A legal name: 2–16 characters of letters, digits, spaces, apostrophes, hyphens or underscores, trimmed, not only digits (that's the token's job). */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < NAME_MIN || name.length > NAME_MAX || !/^[A-Za-z0-9 '_-]+$/.test(name) || /^\d+$/.test(name)) return null;
  return name;
}
/** A fellowship tag: 2–5 capitals or digits. */
export function cleanTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tag = raw.trim().toUpperCase();
  return /^[A-Z0-9]{2,5}$/.test(tag) ? tag : null;
}
/** "M4S4T0 (13530)" for chat, menus and the card; the nameplate draws the parts separately. */
export const displayName = (name: string | null, id: number) => name ? `${name} (${id})` : `Friend #${id}`;
export const playerName = (player: Player) => displayName(player.name, player.friendId);
/** Name your Friend. The first naming is free and worth Presence; renames cost coins at the Namekeeper. */
export function nameFriend(game: Game, raw: string, paid = false): boolean {
  const player = game.player, name = cleanName(raw);
  if (!name) { message(game, `A name is ${NAME_MIN} to ${NAME_MAX} letters, digits, spaces, apostrophes, hyphens or underscores.`, "warn"); return false; }
  if (player.name && paid) {
    if (count(player, "coins") < RENAME_COST) { message(game, `The Namekeeper asks ${RENAME_COST.toLocaleString()} coins to change a name.`, "warn"); return false; }
    take(player, "coins", RENAME_COST);
  }
  const first = !player.name;
  player.name = name; game.ui.naming = null;
  if (first) { presenceXp(game, 150); message(game, `Your Friend is named ${name}. #${player.friendId} is who it is; ${name} is who it's becoming.`, "quest"); sound(game, "quest"); }
  else message(game, `Your Friend is now known as ${name} (#${player.friendId}).`, "quest");
  return true;
}
/** Found (or join, by declaring) a fellowship: a name and a tag shown under yours. Everyone online wearing the same tag is your fellowship, as far as the Realm can tell. */
export function joinFellowship(game: Game, rawName: string, rawTag: string, look?: { logo?: string; banner?: string; colors?: string[]; since?: number }): boolean {
  const player = game.player, name = cleanName(rawName), tag = cleanTag(rawTag);
  if (!name || !tag) { message(game, "A fellowship needs a name (2–16 characters) and a tag of 2–5 capitals or digits.", "warn"); return false; }
  // Founding one costs the registrar's fee; joining one a fellow invited you to costs a tenth of it.
  if (!player.fellowship) {
    const cost = look ? FELLOWSHIP_JOIN_COST : FELLOWSHIP_COST;
    if (count(player, "coins") < cost) { message(game, `${look ? "Joining" : "Founding"} a fellowship costs ${cost.toLocaleString()} coins (the Realm's registrar is not cheap).`, "warn"); return false; }
    take(player, "coins", cost); presenceXp(game, 120);
  }
  player.fellowship = { name, tag, since: look?.since ?? Math.floor(Date.now() / 86_400_000), ...(look?.logo ? { logo: look.logo } : {}), ...(look?.banner ? { banner: look.banner } : {}), ...(look?.colors ? { colors: look.colors } : {}) };
  message(game, `You stand with ${name} [${tag}].`, "quest"); sound(game, "quest");
  return true;
}
/** Rename your fellowship (the tag stays: it's what the Realm knows it by). The registrar charges for the ink. */
export function renameFellowship(game: Game, rawName: string): boolean {
  const player = game.player, name = cleanName(rawName);
  if (!player.fellowship) return false;
  if (!name) { message(game, "A fellowship needs a name of 2–16 letters, digits, spaces, apostrophes, dashes or underscores.", "warn"); return false; }
  if (name === player.fellowship.name) return false;
  if (count(player, "coins") < FELLOWSHIP_RENAME_COST) { message(game, `Renaming a fellowship costs ${FELLOWSHIP_RENAME_COST.toLocaleString()} coins.`, "warn"); return false; }
  take(player, "coins", FELLOWSHIP_RENAME_COST);
  message(game, `${player.fellowship.name} is now ${name} [${player.fellowship.tag}].`, "quest"); sound(game, "quest");
  player.fellowship = { ...player.fellowship, name };
  return true;
}
/** The look your fellowship wears on cards: an emblem, a banner style and two colours (free to change). */
export function setFellowshipLook(game: Game, look: { logo?: string; banner?: string; colors?: string[] }) {
  const player = game.player;
  if (!player.fellowship) return false;
  player.fellowship = { ...player.fellowship, ...look };
  return true;
}
export function leaveFellowship(game: Game) {
  const player = game.player;
  if (!player.fellowship) return;
  message(game, `You leave ${player.fellowship.name}.`); player.fellowship = null;
}

// ---------- Titles ----------
export type TitleDef = { id: string; name: string; level?: number; quest?: string; skill?: Skill; text: string };
export const TITLES: readonly TitleDef[] = [
  { id: "newcomer", name: "Newcomer", level: 1, text: "Everyone starts somewhere." },
  { id: "wanderer", name: "Wanderer of the Realm", level: 10, text: "Presence 10." },
  { id: "traveller", name: "Traveller", level: 25, text: "Presence 25." },
  { id: "adventurer", name: "Adventurer", level: 40, text: "Presence 40." },
  { id: "seasoned", name: "Seasoned Adventurer", level: 60, text: "Presence 60." },
  { id: "legend", name: "Legend of the Realm", level: 80, text: "Presence 80." },
  { id: "presence", name: "Presence of the Realm", level: 99, text: "Presence 99." },
  { id: "kingslayer", name: "Kingslayer", quest: "hollow_king", text: "End the Hollow King's reign." },
  { id: "paladin", name: "Knight-Paladin", quest: "dawn_against_hollow", text: "Seal the Hollow's gate with the Order." },
  { id: "dragonfriend", name: "Dragonfriend", quest: "ashfall_embers", text: "Clear Ashfall's passes for Ember Tamsin." },
  { id: "lanternkeeper", name: "Lanternkeeper", quest: "gravesend_lanterns", text: "Light Gravesend's lanterns." },
  { id: "tithed", name: "Sea-tithed", quest: "saltmarrow_tithe", text: "Pay the Salt Tithe." },
  { id: "brewer", name: "Master Brewer", skill: "apothecary", level: 99, text: "Apothecary 99." },
  { id: "wayfarer", name: "Wayfarer", skill: "agility", level: 99, text: "Wayfaring 99." },
  { id: "slayer", name: "Warden's Own", skill: "slayer", level: 99, text: "Pursuance 99." },
];
export function unlockedTitles(game: Game): TitleDef[] {
  const player = game.player;
  return TITLES.filter(title => title.quest ? (player.quests[title.quest] ?? 0) >= 2 : title.skill ? levelForXp(player.xp[title.skill]) >= (title.level ?? 99) : presenceLevel(player) >= (title.level ?? 1));
}
export function chooseTitle(game: Game, id: string | null) {
  const player = game.player;
  if (id && !unlockedTitles(game).some(title => title.id === id)) { message(game, "You haven't earned that title yet.", "warn"); return false; }
  player.title = id; return true;
}
export const titleName = (id: string | null) => TITLES.find(title => title.id === id)?.name ?? null;

// ---------- What earns Presence ----------
/** Entering a region for the first time: more for dangerous places. */
export function onRegionEntered(game: Game, id: RegionId) {
  const player = game.player;
  if (player.visited[id]) return;
  const region = REGIONS.find(entry => entry.id === id)!;
  player.visited[id] = game.tick + 1;
  if (id === "coast" || id === "friendhollow") return;
  presenceXp(game, 100 + 60 * region.danger);
  message(game, `You discover ${region.name}.`, "quest");
}
/** Talking to someone for the first time. */
export function onNpcTalked(game: Game, npcId: string) {
  if (game.player.talked[npcId]) return;
  game.player.talked[npcId] = 1; presenceXp(game, 8);
}
export function onEmoteUsed(game: Game, id: string) {
  if (game.player.emotesUsed[id]) return;
  game.player.emotesUsed[id] = 1; presenceXp(game, 15);
}
/** Wearing a piece of clothing or wardrobe for the first time (expression). */
export function onWorn(game: Game, id: string) {
  const player = game.player;
  if (player.outfits[id] || !isItem(id)) return;
  const def = item(id), regional = REGIONAL_CLOTHING.some(set => set.pieces.some(piece => piece.id === id)), wardrobe = WARDROBE.some(piece => piece.id === id);
  if (!regional && !wardrobe && !def.equip?.bonuses && !def.mastery) return;
  player.outfits[id] = 1; presenceXp(game, regional ? 25 : 10);
}
export const onQuestCompleted = (game: Game, points: number) => presenceXp(game, 120 * points);
export const onBossFelled = (game: Game, worldBoss: boolean) => presenceXp(game, worldBoss ? 400 : 200);
export const onRareFind = (game: Game) => presenceXp(game, 40);
export const onAchievement = (game: Game) => presenceXp(game, 80);
/** Time with your Friend walking behind you: a little Presence every three hundred ticks. */
export function onFriendTime(game: Game) {
  const player = game.player;
  if (player.follower === null) return;
  player.friendTicks++;
  if (player.friendTicks % 300 === 0) presenceXp(game, 3);
}

// ---------- The profile ----------
export type Reputation = "Unknown" | "Known" | "Trusted" | "Honored";
/** Which region each quest belongs to (for reputation). */
export const QUEST_REGIONS: Record<string, RegionId> = {
  friends_feast: "friendhollow", grumblin_trouble: "friendhollow", cold_forge: "emberforge", hollow_whispers: "friendhollow", lost_glimmer: "friendhollow", hollow_king: "hollow_depths", hazels_quiver: "fernwick",
  dawn_vigil: "highcairn", greyhorn_light: "highcairn", pilgrims_road: "highcairn", restless_crypt: "highcairn", dawn_against_hollow: "highcairn",
  gravesend_lanterns: "gravesend", saltmarrow_tithe: "saltmarrow", hollyhock_errand: "hollyhock", dyemoor_dye: "dyemoor", tallgrass_tracks: "tallgrass", cragmaw_shaft: "cragmaw", quillhaven_folio: "quillhaven", ashfall_embers: "ashfall",
  name_worth_knowing: "friendhollow", known_hall: "quillhaven", the_remembered: "friendhollow", mages_satchel: "wizards_tower",
};
/** Dawnhold's people live in Highcairn's region; a few settlements are their own. */
export const REPUTATION_PLACES: readonly { id: RegionId; name: string }[] = [
  { id: "friendhollow", name: "Friendhollow" }, { id: "fernwick", name: "Fernwick" }, { id: "emberforge", name: "Emberforge" }, { id: "highcairn", name: "Highcairn & Dawnhold" }, { id: "oasis", name: "The Oasis" },
  { id: "gravesend", name: "Gravesend" }, { id: "saltmarrow", name: "Saltmarrow" }, { id: "hollyhock", name: "Hollyhock" }, { id: "dyemoor", name: "Dyemoor" }, { id: "tallgrass", name: "Tallgrass" }, { id: "cragmaw", name: "Cragmaw" }, { id: "quillhaven", name: "Quillhaven" }, { id: "deadwood", name: "The Deadwood" }, { id: "ashfall", name: "Ashfall" },
];
/** A region's regard for you: its quests done (three points each) and its people spoken to (one each). */
export function reputation(game: Game, id: RegionId): { score: number; rank: Reputation } {
  const player = game.player;
  let score = 0;
  for (const [quest, region] of Object.entries(QUEST_REGIONS)) if (region === id && (player.quests[quest] ?? 0) >= 2) score += 3;
  for (const spawn of game.world.spawns) if (spawn.kind === "npc" && player.talked[spawn.id] && regionAt(game.world, spawn.x, spawn.y).id === id) score += 1;
  return { score, rank: score >= 8 ? "Honored" : score >= 4 ? "Trusted" : score >= 1 ? "Known" : "Unknown" };
}
/** The look you're known for, from what you wear. */
export function styleName(game: Game): string {
  const player = game.player, worn = Object.values(player.equipment).filter((id): id is string => !!id);
  const regional = new Map<string, number>();
  for (const id of worn) { const set = REGIONAL_CLOTHING.find(entry => entry.pieces.some(piece => piece.id === id)); if (set) regional.set(set.region, (regional.get(set.region) ?? 0) + 1); }
  const top = [...regional.entries()].sort((a, b) => b[1] - a[1])[0];
  const STYLE: Record<string, string> = { gravesend: "Deadwood Wanderer", saltmarrow: "Saltmarrow Sailor", hollyhock: "Vale Herbalist", dyemoor: "Dyemoor Dandy", tallgrass: "Wilds Tracker", cragmaw: "Ironreach Climber", quillhaven: "Quillhaven Scholar", ashfall: "Ashfall Survivor" };
  if (top && top[1] >= 2) return STYLE[top[0]];
  const cape = player.equipment.cape ? item(player.equipment.cape) : null;
  if (cape?.mastery) return cape.mastery.skill === "all" ? "Grandmaster" : `Master of ${SKILL_NAMES[cape.mastery.skill]}`;
  if (worn.filter(id => id.startsWith("dawnplate_") || id === "dawn_cape").length >= 2) return "Knight of the Dawn";
  if (worn.filter(id => id.startsWith("vigil_")).length >= 3) return "Keeper of the Vigil";
  if (worn.filter(id => id.startsWith("acolyte_")).length >= 3) return "Acolyte of the Dawn";
  if (worn.filter(id => id.startsWith("heartguard_")).length >= 4) return "Heartguard";
  if (worn.filter(id => id.startsWith("wayfarer_")).length >= 3) return "Wayfarer";
  const metal = worn.map(id => id.split("_")[0]).find(prefix => ["pewter", "blackiron", "ashsteel", "moonsilver", "glimmer", "rarite", "frostsilver", "gloomsteel", "wyrmscale", "hollowsteel", "cindersteel", "ashenheart"].includes(prefix));
  if (metal && worn.filter(id => id.startsWith(`${metal}_`)).length >= 3) return `${metal[0].toUpperCase()}${metal.slice(1)} Knight`;
  if (worn.some(id => id.endsWith("_robe") || id.endsWith("_wizard_hat"))) return "Wandering Wizard";
  return top ? STYLE[top[0]] : "Friendhollow Local";
}
export function favouriteSkill(game: Game): Skill {
  return [...SKILLS].filter(skill => skill !== "hitpoints").sort((a, b) => levelForXp(game.player.xp[b]) - levelForXp(game.player.xp[a]))[0];
}
export function homeRegion(game: Game): string {
  const top = Object.entries(game.player.regionTicks).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  return (top && REGIONS.find(region => region.id === top[0])?.name) ?? "Friendhollow";
}
export type Profile = {
  name: string | null; friendId: number; family: string; fellowship: { name: string; tag: string } | null; title: string | null; level: number;
  style: string; favourite: { skill: Skill; level: number }; home: string; weapon: string | null;
  reputations: { name: string; rank: Reputation; score: number }[]; emotesKnown: number; outfitsWorn: number; regionsSeen: number; peopleMet: number; friendTicks: number;
};
export function profile(game: Game): Profile {
  const player = game.player, favourite = favouriteSkill(game);
  return {
    name: player.name, friendId: player.friendId, family: FAMILY_NAMES[player.familyId], fellowship: player.fellowship, title: titleName(player.title), level: presenceLevel(player),
    style: styleName(game), favourite: { skill: favourite, level: levelForXp(player.xp[favourite]) }, home: homeRegion(game), weapon: player.equipment.weapon ? item(player.equipment.weapon).name : null,
    reputations: REPUTATION_PLACES.map(place => ({ name: place.name, ...reputation(game, place.id) })),
    emotesKnown: Object.keys(player.emotesUsed).length, outfitsWorn: Object.keys(player.outfits).length, regionsSeen: Object.keys(player.visited).length, peopleMet: Object.keys(player.talked).length, friendTicks: player.friendTicks,
  };
}
