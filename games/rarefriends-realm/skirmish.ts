/**
 * Soldiers and their wars. Every soldier in the Realm can be fought, and every one of them fights: Hollowmere's
 * soldiers and guards, the Orders' knights, the Regiment, the Federation's rangers, BarkReach's rangers and the
 * Deadwood Maidens draw steel on the wild things and the dead that come near them, and on the soldiers of the sides
 * they're at odds with. The Regiment and the Federation fight wherever they meet; Hollowmere fights the Regiment and its
 * own deserters.
 *
 * A soldier you can talk to stays a person until it draws: then it becomes a creature in its own clothes (its twin, a
 * monster whose `look` is the soldier's own), fights, and sheathes again when there's nothing left to fight, or comes
 * back to its post after a while if it fell. The twin's uid comes from the soldier's own (TWIN_BASE + its uid), so
 * players fighting the same soldier together see the same one.
 */
import type { Drop, MonsterDef } from "./data.ts";

/** Which side a creature fights for. Wild things and the dead fight every soldier; peaceful beasts fight nobody. */
export type Side = "hollowmere" | "order" | "raria" | "rrr" | "fff" | "barkreach" | "maidens" | "deserter" | "wild" | "dead";
/** Who each side draws on (it's mutual: if either side lists the other, they fight). */
const ENEMIES: Record<Side, readonly Side[]> = {
  hollowmere: ["rrr", "deserter", "wild", "dead"],
  order: ["wild", "dead"],
  raria: ["fff", "wild", "dead"],
  rrr: ["fff", "hollowmere", "wild", "dead"],
  fff: ["rrr", "raria", "wild", "dead"],
  barkreach: ["wild", "dead"],
  maidens: ["wild", "dead"],
  deserter: ["hollowmere"],
  wild: [],
  dead: [],
};
export const hostile = (a: Side | null, b: Side | null) => !!a && !!b && a !== b && (ENEMIES[a].includes(b) || ENEMIES[b].includes(a));
/** Sides that go looking for a fight (soldiers); the wild and the dead only fight soldiers that come close. */
export const SOLDIERLY: ReadonlySet<Side> = new Set(["hollowmere", "order", "raria", "rrr", "fff", "barkreach", "maidens", "deserter"]);

/** A soldier twin's uid: its soldier's uid plus this. */
export const TWIN_BASE = 1_000_000;

const coins = (min: number, max: number, chance: number): Drop => ({ item: "coins", min, max, chance });
const one = (id: string, chance: number, min = 1, max = min): Drop => ({ item: id, min, max, chance });
type Stats = Pick<MonsterDef, "level" | "hp" | "attack" | "strength" | "defence" | "attackBonus" | "defenceBonus" | "maxHit" | "speed"> & Partial<MonsterDef>;
/** The soldiers' names and what Examine says of them: the same as the people they are (content.ts, raria.ts). */
const NAMES: Record<string, readonly [string, string]> = {
  guard: ["Hall guard", "He looks bored."],
  hollowmere_soldier: ["Hollowmere soldier", "A soldier of the Kingdom of Hollowmere, in the crown's crimson. Walks the road and watches the west."],
  royal_guard: ["Royal guard", "Guards the King. Takes it very seriously."],
  dawn_knight: ["Knight of the Dawn", "A knight of the Order of the Dawn, on watch."],
  diamond_guard: ["Diamond knight", "A knight of the Order of the Diamond, in its colours."],
  ink_guard: ["Ink knight", "A knight of the Order of the Ink, in its colours."],
  sol_guard: ["Sol knight", "A knight of the Order of the Sol, in its colours."],
  hood_guard: ["Hood knight", "A knight of the Order of the Hood, in its colours."],
  ember_guard: ["Ember knight", "A knight of the Order of the Ember, in its colours."],
  dusk_guard: ["Dusk knight", "A knight of the Order of Dusk, hooded, at the cemetery. Counting."],
  rrr_soldier: ["RRR soldier", "A soldier of the Rare Realm Regiment, in the city, in step with the one across the street."],
  fff_ranger: ["FFF ranger", "A Federation ranger in a green cape with FFF across the back. Off picket, mostly."],
  barkreach_ranger: ["BarkReach ranger", "A ranger of the Antler Lodge. Has seen the Regiment's scouts in the north of the wood, and the Federation's pickets in the west, and likes neither."],
  maidens_villager: ["Deadwood Maiden", "A Maiden off watch. Still armed."],
};
const soldier = (id: string, side: Side, stats: Stats, drops: readonly Drop[]): [string, MonsterDef & { side: Side }] =>
  // Name and examine are the soldier's own, word for word (so they read the same, in every language).
  [id, { id, name: NAMES[id][0], examine: NAMES[id][1], respawn: 90, wander: 4, art: 172, aggressive: false, always: [one("bones", 1)], drops, look: id, side, ...stats }];
/** The Orders' hall knights: each Order's Knight tier, dropped now and then. */
const orderKnight = (order: string) => soldier(`${order}_guard`, "order",
  { level: 66, hp: 88, attack: 60, strength: 58, defence: 64, magicDef: 40, attackBonus: 42, defenceBonus: 48, maxHit: 10, speed: 5 },
  [coins(60, 300, 0.7), one(`${order}_knight_helm`, 0.008), one(`${order}_knight_kite`, 0.006), one(`${order}_knight_mace`, 0.006), one("faith_potion", 0.08)]);
/**
 * Every soldier's fighting self, by the soldier's NPC id. Levels follow their place: the hall guard is a town watchman,
 * Hollowmere's soldiers march the border, the King's own guard and the Orders' knights are among the Realm's best.
 */
export const SOLDIERS: Record<string, MonsterDef & { side: Side }> = Object.fromEntries([
  soldier("guard", "hollowmere", { level: 24, hp: 30, attack: 22, strength: 20, defence: 22, attackBonus: 12, defenceBonus: 16, maxHit: 4, speed: 4 },
    [coins(10, 60, 0.7), one("pewter_sword", 0.03), one("pewter_helm", 0.03), one("bread", 0.2)]),
  soldier("hollowmere_soldier", "hollowmere", { level: 42, hp: 52, attack: 40, strength: 38, defence: 40, attackBonus: 26, defenceBonus: 30, maxHit: 7, speed: 4 },
    [coins(30, 180, 0.7), one("blackiron_sword", 0.04), one("blackiron_helm", 0.03), one("blackiron_shield", 0.02), one("crimson_cape", 0.006), one("bread", 0.25)]),
  soldier("royal_guard", "hollowmere", { level: 72, hp: 100, attack: 66, strength: 64, defence: 70, magicDef: 36, attackBonus: 46, defenceBonus: 54, maxHit: 12, speed: 5, respawn: 150 },
    [coins(120, 600, 0.8), one("ashsteel_battleaxe", 0.02), one("ashsteel_helm", 0.03), one("crimson_cape", 0.02)]),
  soldier("dawn_knight", "order", { level: 60, hp: 80, attack: 56, strength: 52, defence: 58, magicDef: 36, attackBonus: 38, defenceBonus: 44, maxHit: 9, speed: 5 },
    [coins(60, 280, 0.7), one("faith_potion", 0.08), one("ashsteel_helm", 0.02)]),
  ...["diamond", "ink", "sol", "hood", "ember"].map(orderKnight),
  soldier("dusk_guard", "raria", { level: 66, hp: 86, attack: 60, strength: 56, defence: 62, magicDef: 50, attackBonus: 40, defenceBonus: 46, maxHit: 10, speed: 5 },
    [coins(60, 300, 0.7), one("dusk_knight_helm", 0.008), one("dusk_knight_mace", 0.006), one("dusk_sigil", 0.15, 1, 4)]),
  soldier("rrr_soldier", "rrr", { level: 62, hp: 76, attack: 58, strength: 54, defence: 56, magicDef: 24, attackBonus: 36, defenceBonus: 40, maxHit: 9, speed: 4, faction: "rrr" },
    [coins(60, 280, 0.75), one("rarian_sword", 0.03), one("rrr_helm", 0.012), one("rrr_gauntlets", 0.012), one("law_sigil", 0.12, 2, 5)]),
  soldier("fff_ranger", "fff", { level: 58, hp: 64, attack: 50, strength: 46, defence: 48, magicDef: 30, attackBonus: 32, defenceBonus: 28, maxHit: 8, speed: 4, ranged: 5, faction: "fff" },
    [coins(40, 220, 0.7), one("fff_broadheads", 0.3, 6, 16), one("fff_ranger_bracers", 0.012), one("fff_ranger_hood", 0.01)]),
  soldier("barkreach_ranger", "barkreach", { level: 50, hp: 60, attack: 46, strength: 42, defence: 44, attackBonus: 30, defenceBonus: 26, maxHit: 8, speed: 4, ranged: 5 },
    [coins(30, 160, 0.7), one("broadhead_arrow", 0.3, 4, 12), one("stag_antler", 0.15), one("redwood_logs", 0.2)]),
  soldier("maidens_villager", "maidens", { level: 56, hp: 68, attack: 50, strength: 46, defence: 50, magicDef: 30, attackBonus: 34, defenceBonus: 30, maxHit: 9, speed: 4, faction: "maidens" },
    [coins(40, 200, 0.7), one("maiden_veil", 0.006), one("maiden_boots", 0.006)]),
]);

/** The side a creature fights for. */
export function sideOf(def: MonsterDef): Side | null {
  const own = (def as MonsterDef & { side?: Side }).side;
  if (own) return own;
  if (def.arenaOnly || def.worldBoss || def.boss) return null;
  if (def.faction === "rrr" || def.faction === "fff" || def.faction === "maidens") return def.faction;
  if (def.id === "royal_ranger") return "raria";
  if (def.id === "deserter") return "deserter";
  if (def.undead) return "dead";
  return def.aggressive ? "wild" : null;
}
