/**
 * Pursuance (the skill that was Slayer; its id in saves and code is still "slayer"): knowing the Realm's dangerous
 * creatures, and using it. What you know of each creature is kept in your Pursuance journal (player.lore), a fact at a
 * time, and every fact is learnt once, by doing something:
 *
 * - by eye: Examine a creature and, if your Pursuance is high enough for one of its level, you can judge how it fights,
 *   how it guards itself, even what it's weak to;
 * - in the fight: it attacks you (how it fights), it poisons you, drains you, breathes fire, mends itself, rages (each
 *   one of its tricks); your spell of its weak element bites deep, your faith weapon burns the dead, your poison takes
 *   or doesn't (its weakness);
 * - by study: put enough of them down and you know where they live, how they guard themselves, what they're weak to;
 * - on the trail: read a creature's tracks (where it lives), and follow them;
 * - from the Warden, who will tell you what she knows, for points.
 *
 * Each new fact pays Pursuance XP (the more dangerous the creature, the more); nothing pays twice. Knowing a creature
 * well and having put enough of them down makes you better against it (mastery: Familiar, Seasoned, Expert), and only
 * a weakness you know shows beside a creature's health. Tracks lie near you for creatures your level can read, and lead
 * towards them; now and then a creature comes back marked, stronger, with a trophy the Warden pays for.
 */
import { MONSTERS, item, type MonsterDef } from "./data.ts";
import { addXp, level, message, sound, type Game, type Monster, type Point } from "./state.ts";
import { REGIONS, isUnderground, regionAt, walkable } from "./world.ts";
import { contractLearnt, contractQuarry, contractTrackRead } from "./slayer.ts";

// ---------- What there is to know ----------
export const FACTS = ["seen", "temper", "habitat", "weakness", "defences", "abilities"] as const;
export type Fact = typeof FACTS[number];
const BIT: Record<Fact, number> = { seen: 1, temper: 2, habitat: 4, weakness: 8, defences: 16, abilities: 32 };
/** A creature's tricks, each learnt on its own. */
export const TRICKS = ["poison", "drain_faith", "drain_energy", "breath", "heals", "enrage", "ranged", "magic"] as const;
export type Trick = typeof TRICKS[number];
const TRICK_BIT = Object.fromEntries(TRICKS.map((trick, index) => [trick, 1 << index])) as Record<Trick, number>;
export function tricksOf(def: MonsterDef): Trick[] {
  const out: Trick[] = [];
  if (def.poison) out.push("poison");
  if (def.drain?.faith) out.push("drain_faith");
  if (def.drain?.energy) out.push("drain_energy");
  if (def.breath) out.push("breath");
  if (def.heals) out.push("heals");
  if (def.enrage) out.push("enrage");
  if (def.ranged) out.push("ranged");
  if (def.attackStyle === "magic") out.push("magic");
  return out;
}
/** What you know of one creature: facts (bits), tricks (bits), the drops you've seen, tracks read and marked ones felled. */
export type Lore = { k: number; a: number; d: string[]; t: number; m: number; /** The mastery rank already announced. */ r?: number };
export function lore(game: Game, id: string): Lore { return game.player.lore[id] ?? (game.player.lore[id] = { k: 0, a: 0, d: [], t: 0, m: 0 }); }
export const knows = (game: Game, id: string, fact: Fact) => ((game.player.lore[id]?.k ?? 0) & BIT[fact]) !== 0;
export const knowsTrick = (game: Game, id: string, trick: Trick) => ((game.player.lore[id]?.a ?? 0) & TRICK_BIT[trick]) !== 0;
/** Creatures worth a journal page (not the peaceful farm animals, which there's nothing to learn about). */
export const pursuable = (def: MonsterDef | undefined) => !!def && !def.shear && def.id !== "chicken" && def.id !== "cow";

/** XP for learning one fact about a creature: more for the dangerous ones, and the weakness most of all. */
const FACT_WEIGHT: Record<Fact, number> = { seen: 0.5, temper: 0.6, habitat: 0.8, weakness: 1.5, defences: 1, abilities: 0.4 };
const factXp = (def: MonsterDef, fact: Fact) => Math.round((6 + def.level * 1.2) * FACT_WEIGHT[fact]);
const LEARNT: Record<Exclude<Fact, "seen" | "abilities">, string> = {
  temper: "Pursuance: you've learnt how the {x} fights.",
  habitat: "Pursuance: you've learnt where the {x} lives.",
  weakness: "Pursuance: you've learnt what the {x} is weak to.",
  defences: "Pursuance: you've learnt how the {x} guards itself.",
};
const say = (game: Game, line: string, def: MonsterDef, tone: Parameters<typeof message>[2] = "game") => message(game, line.replace("{x}", def.name), tone);

/** Learn a fact about a creature (once): XP, and a line in the chat. True if it was new. */
export function learn(game: Game, id: string, fact: Fact, quiet = false): boolean {
  const def = MONSTERS[id];
  if (!pursuable(def)) return false;
  const entry = lore(game, id);
  if (entry.k & BIT[fact]) return false;
  entry.k |= BIT[fact];
  addXp(game, "slayer", factXp(def, fact));
  if (!quiet) {
    if (fact === "seen") say(game, "New in your Pursuance journal: {x}.", def, "quest");
    else if (fact !== "abilities") say(game, LEARNT[fact], def);
  }
  // Knowing all its tricks is knowing its tricks.
  if (fact === "abilities") for (const trick of tricksOf(def)) entry.a |= TRICK_BIT[trick];
  masteryCheck(game, id);
  contractLearnt(game);
  return true;
}
/** Learn one of a creature's tricks by meeting it (once). */
export function learnTrick(game: Game, id: string, trick: Trick) {
  const def = MONSTERS[id];
  if (!pursuable(def) || !tricksOf(def).includes(trick)) return;
  const entry = lore(game, id);
  if (entry.a & TRICK_BIT[trick]) return;
  entry.a |= TRICK_BIT[trick];
  addXp(game, "slayer", Math.round((6 + def.level * 1.2) * FACT_WEIGHT.abilities));
  say(game, TRICK_LINES[trick], def);
  if (tricksOf(def).every(each => entry.a & TRICK_BIT[each])) { entry.k |= BIT.abilities; masteryCheck(game, id); }
}
const TRICK_LINES: Record<Trick, string> = {
  poison: "Pursuance: the {x}'s bite is venomous.", drain_faith: "Pursuance: the {x}'s touch drains faith.", drain_energy: "Pursuance: the {x}'s touch drains your strength to run.",
  breath: "Pursuance: the {x} breathes fire.", heals: "Pursuance: the {x} mends itself when hurt.", enrage: "Pursuance: the {x} rages when badly hurt.",
  ranged: "Pursuance: the {x} shoots from a distance.", magic: "Pursuance: the {x} fights with spells.",
};

// ---------- Mastery ----------
export const MASTERY = ["Novice", "Familiar", "Seasoned", "Expert"] as const;
/** How well you know a creature: kills and knowledge together (Familiar: 10 put down and its weakness known; Seasoned: 50 and how it guards itself; Expert: 150 and everything). */
export function mastery(game: Game, id: string): number {
  const kills = game.player.killLog[id] ?? 0, k = game.player.lore[id]?.k ?? 0, all = FACTS.every(fact => k & BIT[fact] || (fact === "abilities" && !tricksOf(MONSTERS[id]).length));
  if (kills >= 150 && all) return 3;
  if (kills >= 50 && k & BIT.weakness && k & BIT.defences) return 2;
  if (kills >= 10 && k & BIT.weakness) return 1;
  return 0;
}
/** Accuracy and damage against a creature you've mastered. */
export const masteryBoost = (game: Game, id: string) => [1, 1.02, 1.04, 1.06][mastery(game, id)];
const MASTERED: readonly string[] = ["", "Pursuance: you're now familiar with the {x}.", "Pursuance: you're now seasoned against the {x}.", "Pursuance: you're now an expert on the {x}."];
function masteryCheck(game: Game, id: string) {
  const def = MONSTERS[id], now = mastery(game, id), entry = game.player.lore[id], had = entry?.r ?? 0;
  if (!entry || now <= had) return;
  entry.r = now;
  addXp(game, "slayer", (10 + def.level) * [0, 5, 15, 40][now]);
  say(game, MASTERED[now], def, "quest"); sound(game, "quest");
}

// ---------- What a creature tells you ----------
/** Pursuance levels to judge a creature by eye: how it fights from a quarter of its level, its guard from half, its weakness from four fifths. */
export const eyeLevel = (def: MonsterDef, fact: "temper" | "defences" | "weakness") => Math.max(1, Math.min(99, Math.round(def.level * { temper: 0.25, defences: 0.5, weakness: 0.8 }[fact])));
const ELEMENT_NAMES: Record<string, string> = { fire: "fire", water: "water", wind: "wind", earth: "earth", holy: "holy light" };
/** What you know of how it fights, its weakness, its guard and its tricks, a sentence each, by fact. */
export function knownByFact(game: Game, def: MonsterDef): { temper: string[]; weakness: string[]; defences: string[]; abilities: string[] } {
  const id = def.id, out = { temper: [] as string[], weakness: [] as string[], defences: [] as string[], abilities: [] as string[] };
  if (knows(game, id, "temper")) out.temper.push(def.aggressive ? "It attacks on sight." : "It leaves you be unless you strike first.");
  if (knows(game, id, "weakness")) {
    out.weakness.push(def.weakness ? `Weak to ${ELEMENT_NAMES[def.weakness]}.` : "It has no particular weakness.");
    if (def.undead) out.weakness.push("Faith weapons and holy light hurt it more.");
    if (def.poisonImmune) out.weakness.push("Poison can't touch it."); else if ((def.poisonWeak ?? 1) > 1) out.weakness.push("Poison takes hard on it.");
  }
  if (knows(game, id, "defences")) {
    const magic = def.magicDef ?? def.defence;
    out.defences.push(magic < def.defence * 0.8 ? "Spells find it easier than steel." : magic > def.defence * 1.2 ? "Steel and arrows find it easier than spells." : "It guards against steel and spells alike.");
  }
  for (const trick of tricksOf(def)) if (knowsTrick(game, id, trick)) out.abilities.push(TRICK_FACTS[trick]);
  return out;
}
export function knownLines(game: Game, def: MonsterDef): string[] {
  const known = knownByFact(game, def);
  return [...known.temper, ...known.weakness, ...known.defences, ...known.abilities];
}
const TRICK_FACTS: Record<Trick, string> = {
  poison: "Its bite is venomous.", drain_faith: "Its touch drains faith.", drain_energy: "Its touch drains your strength to run.", breath: "It breathes fire.",
  heals: "It mends itself when hurt.", enrage: "It rages when badly hurt.", ranged: "It shoots from a distance.", magic: "It fights with spells.",
};
/** Examine a creature: what it is, then what you know of it (and what your eye can judge now, learnt as you look). */
export function examineCreature(game: Game, monster: Monster): string {
  const def = monster.def;
  if (!pursuable(def)) return def.examine;
  learn(game, def.id, "seen");
  const skill = level(game, "slayer");
  for (const fact of ["temper", "defences", "weakness"] as const) if (skill >= eyeLevel(def, fact)) learn(game, def.id, fact);
  const lines = [def.examine, ...knownLines(game, def)];
  if (FACTS.some(fact => !knows(game, def.id, fact) && !(fact === "abilities" && !tricksOf(def).length))) lines.push("There's more to learn about it in your Pursuance journal.");
  return lines.join(" ");
}

// ---------- Learning in the fight ----------
/** It attacked you: you know how it fights now, and whichever of its tricks it used. */
export function onAttacked(game: Game, monster: Monster, used: { shooting?: boolean; poisoned?: boolean; drained?: boolean; breath?: boolean; enraged?: boolean }) {
  const id = monster.def.id;
  learn(game, id, "temper");
  if (used.shooting) learnTrick(game, id, "ranged");
  if (monster.def.attackStyle === "magic") learnTrick(game, id, "magic");
  if (used.poisoned) learnTrick(game, id, "poison");
  if (used.drained) learnTrick(game, id, monster.def.drain?.faith ? "drain_faith" : "drain_energy");
  if (used.breath) learnTrick(game, id, "breath");
  if (used.enraged) learnTrick(game, id, "enrage");
}
/** Your spell of its weak element bit deep (or your faith burnt the dead): now you know. */
export function onWeakSpot(game: Game, monster: Monster) {
  const def = monster.def;
  if (!pursuable(def) || knows(game, def.id, "weakness")) return;
  message(game, `The ${def.name} is weak to ${ELEMENT_NAMES[def.weakness ?? "holy"]}!`, "quest");
  learn(game, def.id, "weakness", true);
}
/** Your poisoned weapon met it: it took (hard, on the soft-bodied) or it didn't (the dead and stone) – either way, now you know. */
export function onPoison(game: Game, monster: Monster) {
  const def = monster.def;
  if (!pursuable(def) || knows(game, def.id, "weakness") || (!def.poisonImmune && (def.poisonWeak ?? 1) <= 1)) return;
  message(game, def.poisonImmune ? `Your poison can't touch the ${def.name}.` : `Your poison takes hard on the ${def.name}.`, "quest");
  learn(game, def.id, "weakness", true);
}
/** It kills and its kind: one more of them put down, and what that teaches (where they live at 3, how they guard at 5, the weakness at 10 with the Pursuance to see it, every trick at 25), and the drops. */
export function onKilled(game: Game, monster: Monster, drops: readonly string[]) {
  const def = monster.def, id = def.id, kills = game.player.killLog[id] ?? 0, entry = lore(game, id);
  if (!pursuable(def)) return;
  learn(game, id, "seen", true); learn(game, id, "temper");
  if (kills >= 3) learn(game, id, "habitat");
  if (kills >= 5) learn(game, id, "defences");
  if (kills >= 10 && level(game, "slayer") >= Math.round(def.level / 3)) learn(game, id, "weakness");
  if (kills >= 25 && tricksOf(def).length) learn(game, id, "abilities");
  for (const drop of drops) if (drop !== "coins" && !entry.d.includes(drop) && entry.d.length < 40) entry.d.push(drop);
  if (monster.marked) {
    entry.m++; monster.marked = false;
    addXp(game, "slayer", def.level * 4);
    say(game, "Pursuance: a marked {x}, put down. Its trophy is yours.", def, "quest");
  }
  masteryCheck(game, id);
}

// ---------- Where a creature lives ----------
/** The regions a creature is found in (from where it's placed in the world), most of it first. */
export function habitats(game: Game, id: string): string[] {
  const counts = new Map<string, number>();
  for (const monster of game.monsters) if (monster.def.id === id && monster.twinOf === undefined) {
    const name = regionAt(game.world, monster.spawn.x, monster.spawn.y)?.name;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 4);
}
export const REGION_NAMES = REGIONS.map(region => region.name);

// ---------- Tracks ----------
export type Track = { uid: number; x: number; y: number; id: string; heading: Point; until: number };
/** The creatures your Pursuance can read the tracks of: up to fifteen levels above it. */
export const readable = (game: Game, def: MonsterDef) => pursuable(def) && !def.boss && !def.worldBoss && !def.arenaOnly && !def.look && def.level <= level(game, "slayer") + 15;
const DIRECTIONS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"] as const;
const direction = (dx: number, dy: number) => DIRECTIONS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
/**
 * Every few seconds, if few tracks lie round you, a creature nearby that you could read leaves a set: a few tiles from
 * you, on the way to it, pointing its way. They fade after a while (and three at most lie round you at once).
 */
export function trackTick(game: Game) {
  const player = game.player;
  if (game.tick % 20 !== 0 || isUnderground(player.y) && game.rng() < 0.5) return;
  game.tracks = game.tracks.filter(track => track.until > game.tick);
  if (game.tracks.filter(track => Math.max(Math.abs(track.x - player.x), Math.abs(track.y - player.y)) <= 16).length >= 2 || game.tracks.length >= 3) return;
  const candidates = game.monsters.filter(monster => !monster.dead && !monster.arena && readable(game, monster.def) && !monster.target
    && Math.max(Math.abs(monster.x - player.x), Math.abs(monster.y - player.y)) >= 7 && Math.max(Math.abs(monster.x - player.x), Math.abs(monster.y - player.y)) <= 28
    && isUnderground(monster.spawn.y) === isUnderground(player.y));
  if (!candidates.length || game.rng() > 0.6) return;
  // On a track contract, the tracks lean the way of what you're after.
  const wanted = contractQuarry(game), sought = wanted ? candidates.filter(monster => wanted.includes(monster.def.id)) : [];
  const pool = sought.length && game.rng() < 0.75 ? sought : candidates, quarry = pool[Math.floor(game.rng() * pool.length)];
  // A few tiles out from you, on the way to it.
  for (let attempt = 0; attempt < 6; attempt++) {
    const k = 0.25 + game.rng() * 0.3, x = Math.round(player.x + (quarry.x - player.x) * k + (game.rng() * 4 - 2)), y = Math.round(player.y + (quarry.y - player.y) * k + (game.rng() * 4 - 2));
    if (!walkable(game.world, x, y) || (x === player.x && y === player.y) || game.tracks.some(track => track.x === x && track.y === y)) continue;
    game.tracks.push({ uid: game.nextUid++, x, y, id: quarry.def.id, heading: { x: Math.sign(quarry.x - x), y: Math.sign(quarry.y - y) }, until: game.tick + 260 });
    return;
  }
}
/** Read a set of tracks: what made them and which way it went, where it lives, Pursuance XP, and its trail on your map. */
export function inspectTrack(game: Game, uid: number) {
  const index = game.tracks.findIndex(track => track.uid === uid);
  if (index < 0) return;
  const track = game.tracks[index], def = MONSTERS[track.id], entry = lore(game, track.id), quarry = nearestOf(game, track.id, track);
  game.tracks.splice(index, 1);
  const towards = quarry ? direction(quarry.x - track.x, quarry.y - track.y) : direction(track.heading.x, track.heading.y);
  message(game, `Fresh ${def.name} tracks, heading ${towards}.`);
  entry.t++;
  addXp(game, "slayer", Math.round((4 + def.level * 0.5) * (entry.t === 1 ? 4 : 1)));
  learn(game, track.id, "seen", true); learn(game, track.id, "habitat");
  game.player.trail = { id: track.id, until: game.tick + 150 };
  contractTrackRead(game, track.id);
  game.trackRead = { id: track.id, tick: game.tick };
}
export function nearestOf(game: Game, id: string, from: Point): Monster | null {
  let best: Monster | null = null, bestDistance = Infinity;
  for (const monster of game.monsters) if (!monster.dead && monster.def.id === id) { const distance = Math.max(Math.abs(monster.x - from.x), Math.abs(monster.y - from.y)); if (distance < bestDistance) { best = monster; bestDistance = distance; } }
  return best;
}

// ---------- Marked creatures ----------
/** One creature in a hundred and fifty comes back marked: half as hardy again, and it drops a trophy. */
export function rollMarked(game: Game, monster: Monster) {
  const def = monster.def;
  monster.marked = !def.boss && !def.worldBoss && !def.arenaOnly && !def.look && def.level >= 10 && pursuable(def) && game.rng() < 1 / 150;
  if (monster.marked) monster.hp = maxHpOf(monster);
}
export const maxHpOf = (monster: Monster) => monster.marked ? Math.round(monster.def.hp * 1.5) : monster.def.hp;
/** A hunter's trophy is worth this many points to the Warden. */
export const TROPHY_POINTS = 6;
/** Research: what the Warden charges in points to tell you all she knows of a creature. */
export const researchCost = (def: MonsterDef) => 5 + Math.round(def.level / 5);
/** Creatures you've met that still hold something back (the ones you met last, first): what the Warden can tell you about. */
export function researchable(game: Game): MonsterDef[] {
  return Object.keys(game.player.lore).map(id => MONSTERS[id]).filter(def => pursuable(def) && knows(game, def.id, "seen")
    && FACTS.some(fact => fact !== "seen" && !knows(game, def.id, fact) && !(fact === "abilities" && !tricksOf(def).length))).reverse();
}
/** The Warden tells you what she knows: where it lives, how it fights and guards, what it's weak to, and its tricks. */
export function research(game: Game, id: string): boolean {
  const def = MONSTERS[id], cost = researchCost(def), points = game.player.questData.slayer_points ?? 0;
  if (points < cost) { message(game, `You need ${cost} Pursuance points for that. You have ${points}.`, "warn"); return false; }
  game.player.questData.slayer_points = points - cost;
  for (const fact of ["temper", "habitat", "defences", "weakness"] as const) learn(game, id, fact);
  if (tricksOf(def).length) learn(game, id, "abilities");
  return true;
}
/** Every drop of an item, for the journal (its name). */
export const dropName = (id: string) => item(id).name;
