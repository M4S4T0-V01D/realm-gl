/**
 * RareFriends Realm content: skills, the XP curve, items, equipment, monsters, NPCs, shops, recipes and family perks.
 * Everything here is plain data so the engine and the tests can share it.
 */

// ---------- Skills and experience ----------
export const SKILLS = [
  "attack", "strength", "defence", "ranged", "hitpoints", "magic", "prayer", "sigilcraft", "woodcutting", "fletching", "fishing",
  "cooking", "firemaking", "mining", "smithing", "crafting", "thieving", "agility", "slayer", "apothecary", "presence",
] as const;
export type Skill = typeof SKILLS[number];
export const SKILL_NAMES: Record<Skill, string> = {
  attack: "Attack", strength: "Strength", defence: "Defence", ranged: "Ranged", hitpoints: "Hitpoints", magic: "Magic", prayer: "Faith",
  woodcutting: "Woodcutting", fishing: "Fishing", cooking: "Cooking", firemaking: "Firemaking", mining: "Mining",
  smithing: "Smithing", crafting: "Craftwork", thieving: "Stealth", agility: "Wayfaring", slayer: "Slayer",
  sigilcraft: "Sigilcraft", fletching: "Fletching", apothecary: "Apothecary", presence: "Presence",
};
/** Each skill's colour: its mastery cape, and its trim. */
export const SKILL_COLORS: Record<Skill, [string, string]> = {
  attack: ["#c98f95", "#e2d49e"], strength: ["#8fbf9a", "#e2d49e"], defence: ["#8fa3c9", "#efede7"], ranged: ["#a5a67d", "#efede7"],
  hitpoints: ["#e8e4dc", "#cf6e6e"], magic: ["#6f7ea6", "#e2d49e"], prayer: ["#efede7", "#e2d49e"], woodcutting: ["#8e9f7a", "#c49a74"],
  fishing: ["#8fb3c9", "#efede7"], cooking: ["#9c7aa6", "#e8d4c0"], firemaking: ["#e9a07a", "#e2d49e"], mining: ["#8b8e92", "#c9c2b6"],
  smithing: ["#6d6b67", "#e3a58c"], crafting: ["#b89c86", "#efede7"], thieving: ["#6d6b8a", "#c6bed4"], agility: ["#8f9cb2", "#efede7"],
  slayer: ["#3b3a38", "#cf6e6e"], sigilcraft: ["#c6bed4", "#6f7ea6"], fletching: ["#7d9a86", "#e8d4c0"], apothecary: ["#8fbf9a", "#c98f95"], presence: ["#e2d49e", "#6e4a8a"],
};
/** Small glyphs for XP drops and the skills tab (drawn as text). */
export const SKILL_ICONS: Record<Skill, string> = {
  attack: "⚔", strength: "✊", defence: "⛨", hitpoints: "♥", magic: "✦", prayer: "✚", woodcutting: "🪓", fishing: "🐟",
  cooking: "🍳", firemaking: "🔥", mining: "⛏", smithing: "⚒", crafting: "✂", thieving: "👣", agility: "➶", ranged: "➹", slayer: "☠", sigilcraft: "◈", fletching: "➴", apothecary: "⚗", presence: "✧",
};
export const MAX_LEVEL = 99;
/** The classic old-school curve: XP needed for each level, index = level. */
export const XP_TABLE: readonly number[] = (() => {
  const table = [0, 0];
  let points = 0;
  for (let level = 1; level < MAX_LEVEL; level++) {
    points += Math.floor(level + 300 * 2 ** (level / 7));
    table.push(Math.floor(points / 4));
  }
  return table;
})();
export const MAX_XP = 200_000_000;
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= XP_TABLE[level + 1]) level++;
  return level;
}
/** Realm rate: every XP reward in the game is multiplied by this so a short session still feels like progress. */
export const XP_RATE = 3;

// ---------- Families ----------
export const FAMILY_NAMES = ["Skeleton", "Mask", "Family", "Cellular", "Asymmetry", "Hoverer", "Colossus", "Sparkling", "Hollow"] as const;
export type FamilyPerk = { title: string; text: string };
export const FAMILY_PERKS: readonly FamilyPerk[] = [
  { title: "Bone collector", text: "Burying bones gives 50% more Faith XP." },
  { title: "Many faces", text: "Pickpocketing succeeds more often, stuns are shorter, and you're harder to spot while sneaking." },
  { title: "Big family", text: "Shops charge you 10% less." },
  { title: "Regrowth", text: "Hitpoints regenerate twice as fast." },
  { title: "Lopsided luck", text: "8% chance to gather a second resource." },
  { title: "Featherweight", text: "Run energy drains 40% slower." },
  { title: "Colossal swing", text: "+1 max hit in melee." },
  { title: "Glimmer eye", text: "Finds gems three times as often while mining." },
  { title: "Echo magic", text: "+10% magic accuracy, and 1 in 5 spells keeps its sigils." },
];

import { APOTHECARY_ITEMS, type PotionEffect } from "./apothecary.ts";
import { ORDER_IDS, orderGear, orderStock } from "./knights.ts";
import { FACTION_MONSTERS, factionGear } from "./factions.ts";
import { SOLDIERS } from "./skirmish.ts";
// ---------- Items ----------
export type EquipSlot = "head" | "cape" | "neck" | "weapon" | "body" | "shield" | "legs" | "hands" | "feet" | "belt" | "ring";
export const EQUIP_SLOTS: readonly EquipSlot[] = ["head", "cape", "neck", "weapon", "body", "shield", "legs", "hands", "feet", "belt", "ring"];
export type Bonuses = { attack: number; strength: number; defence: number; ranged: number; magic: number; prayer: number };
/** An item's picture: a shape in a colour; `kind` picks a variant of the shape (a fish's species, an ore's veins…). */
export type Icon = { shape: IconShape; color: string; accent?: string; kind?: string };
export type IconShape =
  | "gouge" | "carving" | "mug" | "bottle" | "drumstick" | "steak" | "coins" | "axe" | "pickaxe" | "sword" | "dagger" | "sabre" | "helm" | "body" | "legs" | "shield" | "boots" | "gloves" | "cape"
  | "amulet" | "log" | "fish" | "ore" | "bar" | "bones" | "sigil" | "staff" | "net" | "rod" | "harpoon" | "pot" | "bucket" | "egg" | "flour"
  | "milk" | "tinderbox" | "hammer" | "knife" | "needle" | "thread" | "chisel" | "gem" | "hide" | "leather" | "meat" | "feather" | "bait"
  | "cake" | "bread" | "berries" | "key" | "wheat" | "lamp" | "scroll" | "silk" | "hood" | "bracer" | "burnt" | "hat" | "crown" | "orb" | "trophy"
  | "bow" | "arrow" | "tablet" | "arrowheads" | "material" | "quiver" | "satchel" | "mask" | "stonebox" | "wool" | "string" | "shears" | "greatsword" | "battleaxe" | "warhammer" | "mace" | "flail" | "roundshield" | "aegis" | "spear" | "warbow" | "crossbow" | "bolts" | "limbs" | "stock" | "herb" | "mushroom" | "vial" | "mortar" | "ring";
export type Item = {
  id: string; name: string; examine: string; value: number; icon: Icon;
  stackable?: boolean; tradeable?: boolean;
  /** Food that does more than heal: a skill boost that wears off a point a minute. */
  food?: Partial<Record<Skill, number>>;
  /** What it weighs worn (kg): running drains faster under a load, less so with Wayfaring. */
  weight?: number;
  equip?: { slot: EquipSlot; bonuses: Partial<Bonuses>; requires?: Partial<Record<Skill, number>>; speed?: number; twoHanded?: boolean; staff?: boolean;
    /** A bow or crossbow: its reach, the extra punch it gives each shot, and whether it fires bolts (crossbows) or arrows. */
    bow?: { range: number; strength?: number; bolts?: boolean };
    /** A faith weapon (the Order of the Dawn's): each hit gives a little Faith XP, and it hurts the undead more. */
    holy?: boolean };
  heal?: number; bones?: number; tool?: { kind: "axe" | "pickaxe"; tier: number; level: number };
  /** Drunk, not eaten (the bars' ales and wines). */
  drink?: boolean;
  /** Run energy restored when eaten (waybread). */
  energy?: number;
  /** A drink (Apothecary): what it does. */
  potion?: PotionEffect;
  /** Arrows (fired by any bow) or bolts (by any crossbow), from your pack. */
  ammo?: { strength: number; level: number; bolt?: boolean };
  /** A fixed shop price (instead of value × markup). */
  price?: number;
  /** A mastery cape: the skill it's for (all skills for the Grandmaster's), and whether it's trimmed. */
  mastery?: { skill: Skill | "all"; trimmed: boolean };
  /** Break to teleport (a Realm tablet). */
  tablet?: "hollow_square" | "emberforge" | "oasis" | "frostpeak" | "pier";
};

export const METALS = [
  { id: "pewter", name: "Pewter", level: 1, tier: 1, color: "#a4a7aa", value: 10 },
  { id: "blackiron", name: "Blackiron", level: 5, tier: 2, color: "#5f5e66", value: 35 },
  { id: "ashsteel", name: "Ashsteel", level: 10, tier: 3, color: "#c9c2b6", value: 120 },
  { id: "moonsilver", name: "Moonsilver", level: 20, tier: 4, color: "#9fabc2", value: 380 },
  { id: "glimmer", name: "Glimmer", level: 30, tier: 5, color: "#d9cf9a", value: 900 },
  { id: "rarite", name: "Rarite", level: 40, tier: 6, color: "#d8b6b4", value: 2400 },
  // Forged metals (levels 50–90): smelted from what the Realm's strongest creatures drop, not from ore, at Smithing 86 and up.
  { id: "frostsilver", name: "Frostsilver", level: 50, tier: 7, color: "#bcd8e8", value: 4200 },
  { id: "gloomsteel", name: "Gloomsteel", level: 60, tier: 8, color: "#6d5f8c", value: 6500 },
  { id: "wyrmscale", name: "Wyrmscale", level: 70, tier: 9, color: "#6f9468", value: 9500 },
  { id: "hollowsteel", name: "Hollowsteel", level: 75, tier: 10, color: "#d6cff0", value: 12000 },
  { id: "cindersteel", name: "Cindersteel", level: 80, tier: 11, color: "#d0643f", value: 15000 },
  { id: "ashenheart", name: "Ashenheart", level: 90, tier: 12, color: "#8a817c", value: 22000 },
] as const;
/** The monster-dropped material each forged metal is smelted from (one per bar, with inkcoal). */
export const FORGE_MATERIALS: Partial<Record<MetalId, { id: string; name: string; kind: string; examine: string; value: number }>> = {
  frostsilver: { id: "frost_shard", name: "Frost shard", kind: "crystal", examine: "A shard of never-melting ice from a Frost yeti. Smelted, it makes frostsilver.", value: 1800 },
  gloomsteel: { id: "gloom_shard", name: "Gloom shard", kind: "dark", examine: "A splinter of solid shadow from a gloom hound. Smelted, it makes gloomsteel.", value: 2800 },
  wyrmscale: { id: "wyrm_scale", name: "Wyrm scale", kind: "scale", examine: "A drake's scale, harder than rarite. Smelted, it makes wyrmscale.", value: 4200 },
  hollowsteel: { id: "hollow_essence", name: "Hollow essence", kind: "wisp", examine: "Something the Hollow left behind, cold and weightless. Smelted, it makes hollowsteel.", value: 5400 },
  cindersteel: { id: "cinder_core", name: "Cinder core", kind: "core", examine: "The still-burning heart of a cinder drake. Smelted, it makes cindersteel.", value: 6800 },
  ashenheart: { id: "colossus_ember", name: "Colossus ember", kind: "ember", examine: "An ember from the Ashen Colossus. It never goes out. Smelted, it makes ashenheart.", value: 10000 },
};
/** Each forged metal's glow: the accent on its weapons, armour and bars. */
export const FORGE_GLOW: Partial<Record<MetalId, string>> = { frostsilver: "#eef9ff", gloomsteel: "#b49ae0", wyrmscale: "#c9e07a", hollowsteel: "#ffffff", cindersteel: "#ffcf6a", ashenheart: "#f08a4b" };
/** Forged metals' staffs (smithed, two bars): magic weapons for the high tiers. */
export const FORGED_STAFF_MAGIC: Partial<Record<MetalId, number>> = { frostsilver: 26, gloomsteel: 32, wyrmscale: 38, hollowsteel: 42, cindersteel: 46, ashenheart: 54 };
export type MetalId = typeof METALS[number]["id"];
/** Smithable pieces: bars used, smithing level offset over the metal's base, and relative strength. */
export const SMITH_PIECES = [
  { piece: "dagger", name: "dagger", bars: 1, offset: 0, shape: "dagger", slot: "weapon", att: 4, str: 3, def: 0, speed: 4 },
  { piece: "axe", name: "axe", bars: 1, offset: 1, shape: "axe", slot: "weapon", att: 3, str: 4, def: 0, speed: 5 },
  { piece: "sword", name: "sword", bars: 1, offset: 4, shape: "sword", slot: "weapon", att: 6, str: 5, def: 0, speed: 4 },
  { piece: "pickaxe", name: "pickaxe", bars: 2, offset: 5, shape: "pickaxe", slot: "weapon", att: 3, str: 4, def: 0, speed: 5 },
  { piece: "helm", name: "helm", bars: 2, offset: 7, shape: "helm", slot: "head", att: 0, str: 0, def: 5, speed: 0 },
  { piece: "sabre", name: "sabre", bars: 2, offset: 5, shape: "sabre", slot: "weapon", att: 9, str: 8, def: 0, speed: 4 },
  { piece: "greaves", name: "greaves", bars: 3, offset: 16, shape: "legs", slot: "legs", att: 0, str: 0, def: 11, speed: 0 },
  { piece: "shield", name: "shield", bars: 3, offset: 12, shape: "shield", slot: "shield", att: 0, str: 0, def: 12, speed: 0 },
  { piece: "cuirass", name: "cuirass", bars: 5, offset: 18, shape: "body", slot: "body", att: 0, str: 0, def: 20, speed: 0 },
  { piece: "gauntlets", name: "gauntlets", bars: 1, offset: 2, shape: "gloves", slot: "hands", att: 1, str: 0, def: 3, speed: 0 },
  { piece: "boots", name: "boots", bars: 1, offset: 3, shape: "boots", slot: "feet", att: 0, str: 0, def: 3, speed: 0 },
  // Two-handed weapons: a tick slower than a sword, much harder hitting, and no shield. Each takes Strength to lift
  // (`strength` over the metal's level: pewter 3, 5 and 7), and swings harder the stronger you are (see `heft`).
  { piece: "greatsword", name: "greatsword", bars: 3, offset: 10, shape: "greatsword", slot: "weapon", att: 10, str: 13, def: 0, speed: 5, twoHanded: true, strength: 2 },
  { piece: "battleaxe", name: "battleaxe", bars: 3, offset: 9, shape: "battleaxe", slot: "weapon", att: 8, str: 14, def: 0, speed: 5, twoHanded: true, strength: 4 },
  { piece: "warhammer", name: "war hammer", bars: 3, offset: 11, shape: "warhammer", slot: "weapon", att: 6, str: 16, def: 0, speed: 5, twoHanded: true, strength: 6 },
  // Faith weapons: blessed at the Dawnhold chapel, so they take Faith to wield (the metal's level and 3, or 7 for the
  // two-handed flail), hurt the undead more, give a little Faith XP a hit, and carry a faith bonus. Sold with the swords.
  { piece: "mace", name: "mace", bars: 2, offset: 6, shape: "mace", slot: "weapon", att: 7, str: 9, def: 0, speed: 4, faith: 3 },
  { piece: "flail", name: "flail", bars: 3, offset: 12, shape: "flail", slot: "weapon", att: 7, str: 15, def: 0, speed: 5, twoHanded: true, strength: 4, faith: 7 },
  // Shields beyond the kite: a round shield, bigger and heavier (Strength to carry, the best defence a metal gives), and
  // the aegis, a tall tower shield square at the foot, blessed at Dawnhold (Faith to carry, a faith bonus).
  { piece: "roundshield", name: "round shield", bars: 4, offset: 14, shape: "roundshield", slot: "shield", att: 0, str: 0, def: 17, speed: 0, strength: 5 },
  { piece: "aegis", name: "aegis", bars: 3, offset: 13, shape: "aegis", slot: "shield", att: 0, str: 0, def: 13, speed: 0, faith: 5 },
] as const;
/** What each forged piece weighs in pewter (kg); heavier metals weigh a little more a tier. */
const PIECE_WEIGHT: Record<string, number> = { dagger: 0.6, axe: 1.2, sword: 1.4, pickaxe: 1.6, helm: 1.8, sabre: 1.6, greaves: 3.5, shield: 3, cuirass: 6, gauntlets: 0.8, boots: 1, greatsword: 3.2, battleaxe: 3.6, warhammer: 4, mace: 1.8, flail: 3.4, roundshield: 6, aegis: 3.5 };
/** The Strength a metal's heavy weapon (greatsword, battleaxe, war hammer) takes to wield. */
export function heavyStrength(metal: MetalId, piece: SmithPiece) {
  const entry = SMITH_PIECES.find(row => row.piece === piece);
  return entry && "strength" in entry ? METALS.find(row => row.id === metal)!.level + entry.strength : 0;
}
export type SmithPiece = typeof SMITH_PIECES[number]["piece"];
export const SMITHING_BASE: Record<MetalId, number> = { pewter: 1, blackiron: 15, ashsteel: 30, moonsilver: 50, glimmer: 70, rarite: 85,
  frostsilver: 86, gloomsteel: 88, wyrmscale: 90, hollowsteel: 92, cindersteel: 94, ashenheart: 96 };

/** Each fish's colours: raw (its own) and cooked (browned). */
const FISH_COLORS: Record<string, [string, string]> = {
  minnows: ["#b9c4cc", "#d2a36c"], perch: ["#9fb07a", "#c99a5a"], carp: ["#d9a441", "#c98b45"], char: ["#b98f86", "#c7875a"],
  grayling: ["#9aa3b5", "#c49a6c"], inkcrab: ["#4f6680", "#d9774a"], sailfish: ["#5f86b4", "#c2915c"], inkshark: ["#7d8894", "#b89068"],
};
const ITEMS: Item[] = [
  { id: "coins", name: "Coins", examine: "Lovely money!", value: 1, stackable: true, icon: { shape: "coins", color: "#d9c27a" } },
  // Tools
  { id: "small_net", name: "Small fishing net", examine: "Useful for catching small fish.", value: 5, icon: { shape: "net", color: "#9a8f80" } },
  { id: "fishing_rod", name: "Fishing rod", examine: "Useful for catching perch and carp.", value: 5, icon: { shape: "rod", color: "#9c8672" } },
  { id: "fly_rod", name: "Fly fishing rod", examine: "Useful for catching grayling and char.", value: 5, icon: { shape: "rod", color: "#6d6b67" } },
  { id: "harpoon", name: "Harpoon", examine: "Useful for catching really big fish.", value: 45, icon: { shape: "harpoon", color: "#8b8e92" } },
  { id: "crab_pot", name: "Crab pot", examine: "Useful for catching inkcrabs.", value: 20, icon: { shape: "pot", color: "#9c8672" } },
  { id: "fishing_bait", name: "Fishing bait", examine: "For use with a fishing rod.", value: 3, stackable: true, icon: { shape: "bait", color: "#b69a85" } },
  { id: "feather", name: "Feather", examine: "Used for fly fishing.", value: 2, stackable: true, icon: { shape: "feather", color: "#f2efe8" } },
  { id: "tinderbox", name: "Tinderbox", examine: "Useful for lighting a fire.", value: 1, icon: { shape: "tinderbox", color: "#8b7a66" } },
  { id: "hammer", name: "Hammer", examine: "Good for hitting things.", value: 1, icon: { shape: "hammer", color: "#8b8e92" } },
  { id: "knife", name: "Knife", examine: "A dangerous looking knife.", value: 6, icon: { shape: "knife", color: "#b9bfc6" } },
  { id: "needle", name: "Needle", examine: "Used with a thread to make clothes.", value: 1, icon: { shape: "needle", color: "#c3c6cb" } },
  { id: "thread", name: "Thread", examine: "Used with a needle to make clothes.", value: 1, stackable: true, icon: { shape: "thread", color: "#efede7" } },
  { id: "chisel", name: "Chisel", examine: "Good if you have a bit of sculpting to do.", value: 1, icon: { shape: "chisel", color: "#8b8e92" } },
  { id: "pot", name: "Pot", examine: "This pot is empty.", value: 1, icon: { shape: "pot", color: "#b89c86" } },
  { id: "bucket", name: "Bucket", examine: "It's a wooden bucket.", value: 2, icon: { shape: "bucket", color: "#9c8672" } },
  // Quest and cooking ingredients
  { id: "egg", name: "Egg", examine: "A nice fresh egg.", value: 4, icon: { shape: "egg", color: "#f7f5f0" } },
  { id: "grain", name: "Grain", examine: "Some wheat heads.", value: 2, icon: { shape: "wheat", color: "#e2d7ad" } },
  { id: "pot_of_flour", name: "Pot of flour", examine: "There is flour in this pot.", value: 14, icon: { shape: "flour", color: "#f7f5f0" } },
  { id: "bucket_of_milk", name: "Bucket of milk", examine: "It's a bucket of milk.", value: 6, icon: { shape: "milk", color: "#f7f5f0" } },
  // Logs
  { id: "logs", name: "Logs", examine: "A number of wooden logs.", value: 4, icon: { shape: "log", color: "#9c8672" } },
  { id: "oak_logs", name: "Oak logs", examine: "Logs cut from an oak tree.", value: 20, icon: { shape: "log", color: "#b59c7d" } },
  { id: "willow_logs", name: "Willow logs", examine: "Logs cut from a willow tree.", value: 32, icon: { shape: "log", color: "#a5a67d" } },
  { id: "maple_logs", name: "Maple logs", examine: "Logs cut from a maple tree.", value: 70, icon: { shape: "log", color: "#c49a74" } },
  { id: "yew_logs", name: "Yew logs", examine: "Logs cut from a yew tree.", value: 180, icon: { shape: "log", color: "#7d6b5c" } },
  { id: "ash_logs", name: "Ashwood logs", examine: "Pale logs that hum faintly. From the Frostpeak ashwoods.", value: 400, icon: { shape: "log", color: "#d6d3cc" } },
  { id: "palm_logs", name: "Palm logs", examine: "Fibrous logs that burn hot and quick. Springy enough for a bow.", value: 50, icon: { shape: "log", color: "#c9b48a" } },
  { id: "pine_logs", name: "Pine logs", examine: "Resinous logs from the high slopes. They crackle.", value: 120, icon: { shape: "log", color: "#8a6446", accent: "#4f5234" } },
  { id: "deadwood_logs", name: "Deadwood logs", examine: "Grey, light, unnaturally dry. They burn with a pale flame, and a wand cut from one holds a charge.", value: 300, icon: { shape: "log", color: "#9a958d", accent: "#4a3a60" } },
  // Ores and bars
  { id: "pewter_ore", name: "Pewter ore", examine: "Soft grey ore. Smelts straight into pewter.", value: 3, icon: { shape: "ore", kind: "pewter", color: "#a4a7aa" } },
  { id: "blackiron_ore", name: "Blackiron ore", examine: "This needs refining.", value: 17, icon: { shape: "ore", kind: "blackiron", color: "#8c6f62" } },
  { id: "inkcoal", name: "Inkcoal", examine: "Hmm, a non-renewable energy source!", value: 45, icon: { shape: "ore", kind: "inkcoal", color: "#3b3a38" } },
  { id: "moonsilver_ore", name: "Moonsilver ore", examine: "This needs refining.", value: 160, icon: { shape: "ore", kind: "moonsilver", color: "#7d8fb8" } },
  { id: "glimmer_ore", name: "Glimmer ore", examine: "This needs refining.", value: 400, icon: { shape: "ore", kind: "glimmer", color: "#86a98b" } },
  { id: "rarite_ore", name: "Rarite ore", examine: "Pale rose ore that only forms where Friends dream.", value: 1100, icon: { shape: "ore", kind: "rarite", color: "#d8b6b4" } },
  { id: "clay", name: "Clay", examine: "Some hard dry clay.", value: 2, icon: { shape: "ore", kind: "clay", color: "#d7c3a5" } },
  ...Object.values(FORGE_MATERIALS).map(material => ({ id: material!.id, name: material!.name, examine: material!.examine, value: material!.value,
    icon: { shape: "material" as const, color: METALS.find(metal => FORGE_MATERIALS[metal.id]?.id === material!.id)!.color, kind: material!.kind } })),
  ...METALS.map(metal => ({ id: `${metal.id}_bar`, name: `${metal.name} bar`, examine: `It's a bar of ${metal.id === "rarite" ? "rarite" : metal.id}.`, value: metal.value, icon: { accent: FORGE_GLOW[metal.id], shape: "bar" as const, color: metal.color } })),
  // Gems
  { id: "rough_moonstone", name: "Rough moonstone", examine: "A rough moonstone.", value: 50, icon: { shape: "gem", color: "#8fa3c9", accent: "#6d6b67" } },
  { id: "rough_sagestone", name: "Rough sagestone", examine: "A rough sagestone.", value: 100, icon: { shape: "gem", color: "#8fbf9a", accent: "#6d6b67" } },
  { id: "rough_rosestone", name: "Rough rosestone", examine: "A rough rosestone.", value: 200, icon: { shape: "gem", color: "#c98f95", accent: "#6d6b67" } },
  { id: "moonstone", name: "Moonstone", examine: "This looks valuable.", value: 250, icon: { shape: "gem", color: "#8fa3c9" } },
  { id: "sagestone", name: "Sagestone", examine: "This looks valuable.", value: 500, icon: { shape: "gem", color: "#8fbf9a" } },
  { id: "rosestone", name: "Rosestone", examine: "This looks valuable.", value: 1000, icon: { shape: "gem", color: "#c98f95" } },
  // Fish and food
  ...([
    ["minnows", "Minnows", 3, 5], ["perch", "Perch", 4, 8], ["carp", "Carp", 5, 15], ["char", "Char", 7, 25],
    ["grayling", "Grayling", 9, 50], ["inkcrab", "Inkcrab", 12, 150], ["sailfish", "Sailfish", 14, 250], ["inkshark", "Inkshark", 20, 600],
  ] as const).flatMap(([id, name, heal, value]) => [
    { id: `raw_${id}`, name: `Raw ${name.toLowerCase()}`, examine: `I should try cooking this.`, value: Math.round(value * 0.6), icon: { shape: "fish" as const, kind: id, color: FISH_COLORS[id][0] } },
    { id, name, examine: `Some nicely cooked ${name.toLowerCase()}.`, value, heal, icon: { shape: "fish" as const, kind: id, color: FISH_COLORS[id][1], accent: id === "inkcrab" ? undefined : "#5a3520" } },
  ]),
  { id: "raw_chicken", name: "Raw chicken", examine: "I need to cook this first.", value: 2, icon: { shape: "drumstick", color: "#efc4b8" } },
  { id: "cooked_chicken", name: "Cooked chicken", examine: "Mmm, this looks tasty.", value: 5, heal: 3, icon: { shape: "drumstick", color: "#c7843f", accent: "#6a3a1c" } },
  { id: "raw_beef", name: "Raw beef", examine: "I need to cook this first.", value: 2, icon: { shape: "steak", color: "#c9606a" } },
  { id: "cooked_meat", name: "Cooked meat", examine: "Mmm, this looks tasty.", value: 5, heal: 3, icon: { shape: "steak", color: "#8a5634", accent: "#3e2416" } },
  { id: "bread", name: "Bread", examine: "Nice crispy bread.", value: 12, heal: 5, icon: { shape: "bread", color: "#d9b584" } },
  { id: "cake", name: "Cake", examine: "A plain sponge cake.", value: 50, heal: 12, icon: { shape: "cake", color: "#f1e2c8", accent: "#d8b6b4" } },
  { id: "burnt_food", name: "Burnt food", examine: "Oops!", value: 1, icon: { shape: "burnt", color: "#3b3a38" } },
  // Bones and drops
  { id: "bones", name: "Bones", examine: "Bones are for burying!", value: 5, bones: 4.5, icon: { shape: "bones", kind: "small", color: "#f2efe8" } },
  { id: "crypt_bones", name: "Crypt bones", examine: "Grey, cracked bones from a crypt skeleton. They were a Friend once; the Old Friend takes them gladly.", value: 25, bones: 9, icon: { shape: "bones", kind: "crypt", color: "#c9c4b8", accent: "#6d6b67" } },
  { id: "large_bones", name: "Large bones", examine: "Ew, it's a pile of bones.", value: 60, bones: 15, icon: { shape: "bones", kind: "large", color: "#e7e1d3" } },
  { id: "drake_bones", name: "Drake bones", examine: "Heavy, and still warm.", value: 900, bones: 72, icon: { shape: "bones", kind: "dragon", color: "#d9c9a8", accent: "#8a4a3a" } },
  { id: "drakehide", name: "Drakehide", examine: "A scaled hide from an ash drake. A crafter could stitch it.", value: 700, icon: { shape: "hide", color: "#6f8a5c", accent: "#3b3a38" } },
  { id: "wyrm_heart", name: "Wyrm heart", examine: "It still glows. Collectors in the Oasis pay a fortune for these.", value: 60_000, icon: { shape: "orb", color: "#e3734f", accent: "#f2e28f" } },
  { id: "sigil_stone", name: "Sigil stone", examine: "A pale, blank stone. An altar can press a sigil into it.", value: 6, icon: { shape: "ore", color: "#d9d4e6" } },
  // Fletching
  { id: "arrow_shaft", name: "Arrow shafts", examine: "Wooden shafts, ready for feathers.", value: 1, stackable: true, icon: { shape: "arrow", color: "#9c8672", accent: "shaft" } },
  { id: "headless_arrow", name: "Headless arrows", examine: "Fletched shafts. They need arrowheads.", value: 2, stackable: true, icon: { shape: "arrow", color: "#efede7", accent: "headless" } },
  ...METALS.map((metal, index) => ({ id: `${metal.id}_arrowheads`, name: `${metal.name} arrowheads`, examine: `Arrowheads smithed from ${metal.id}.`, value: [1, 3, 6, 12, 24, 55, 80, 120, 180, 230, 290, 420][index], stackable: true,
    icon: { shape: "arrowheads" as const, color: metal.color } })),
  { id: "ink_bones", name: "Ink bones", examine: "Bones stained black. They feel lighter than they should.", value: 250, bones: 50, icon: { shape: "bones", kind: "ink", color: "#4a4644", accent: "#8a62c8" } },
  { id: "cowhide", name: "Cowhide", examine: "I should take this to the tanner.", value: 8, icon: { shape: "hide", color: "#efede7", accent: "#3b3a38" } },
  { id: "leather", name: "Leather", examine: "It's a piece of leather.", value: 15, icon: { shape: "leather", color: "#b58b6b" } },
  // Sigils
  ...([
    ["breeze_sigil", "Breeze sigil", "#c7d3dc"], ["tide_sigil", "Tide sigil", "#9fb4d0"], ["stone_sigil", "Stone sigil", "#a89479"],
    ["ember_sigil", "Ember sigil", "#d99a82"], ["thought_sigil", "Thought sigil", "#d6c58f"], ["storm_sigil", "Storm sigil", "#d0b27c"],
    ["path_sigil", "Path sigil", "#8fa0c9"], ["hollow_sigil", "Hollow sigil", "#6d6b67"], ["bloom_sigil", "Bloom sigil", "#9fbf9a"],
    ["star_sigil", "Star sigil", "#e2d49e"], ["shade_sigil", "Shade sigil", "#b9a8c9"],
    // Raria's sigils (Return of Raria): pressed at the Law altar, the Dusk altar and the Crown altar in the city.
    ["law_sigil", "Law sigil", "#cfc7e6"], ["dusk_sigil", "Dusk sigil", "#6b5a8a"], ["crown_sigil", "Crown sigil", "#e6c46a"],
  ] as const).map(([id, name, color]) => ({ id, name, examine: "Used for magic spells.", value: { path_sigil: 60, hollow_sigil: 70, storm_sigil: 35, bloom_sigil: 45, star_sigil: 25, shade_sigil: 4, thought_sigil: 3, law_sigil: 30, dusk_sigil: 55, crown_sigil: 80 }[id as string] ?? 2, stackable: true, icon: { shape: "sigil" as const, color, kind: id.replace("_sigil", "") } })),
  { id: "sweetberry", name: "Sweetberries", examine: "A handful of pale berries. They used to be a bone.", value: 2, heal: 2, icon: { shape: "berries", color: "#c6bed4" } },
  // Stealth loot (pickpocketing and stalls)
  { id: "silk", name: "Silk", examine: "It's a sheet of silk.", value: 30, icon: { shape: "silk", color: "#e9e1ef" } },
  // Quest items
  { id: "crypt_key", name: "Crypt key", examine: "A cold blackiron key from the Murkmire crypt.", value: 0, tradeable: false, icon: { shape: "key", color: "#8b8e92" } },
  { id: "glimmer_shard", name: "Glimmer shard", examine: "A shard of the lost Glimmer. It hums when you face north.", value: 0, tradeable: false, icon: { shape: "gem", color: "#e2d7ad", accent: "#161616" } },
  { id: "forge_ember", name: "Forge ember", examine: "An ember that never cools. Emberforge's heart.", value: 0, tradeable: false, icon: { shape: "orb", color: "#e3a58c" } },
  { id: "hollow_crown", name: "Hollow crown", examine: "The crown of the Hollow King. It weighs nothing at all.", value: 0, tradeable: false, icon: { shape: "crown", color: "#efede7", accent: "#161616" } },
  { id: "realm_scroll", name: "Realm scroll", examine: "A map fragment of the Realm.", value: 0, tradeable: false, icon: { shape: "scroll", color: "#efe3c4" } },
];

// ---------- Wayfaring: courses, marks and the Wayfarer's outfit ----------
/** The Realm's Wayfaring courses: a lap of every obstacle in order pays the lap XP and some Wayfarer's marks. */
export const COURSES: Record<string, { name: string; level: number; lapXp: number; marks: number }> = {
  friendhollow: { name: "Friendhollow course", level: 1, lapXp: 40, marks: 1 },
  dunes: { name: "Oasis dune course", level: 30, lapXp: 120, marks: 2 },
  frostpeak: { name: "Frostpeak ice course", level: 55, lapXp: 240, marks: 3 },
};
export const WAYFARER_MARK = "wayfarer_mark";
/** What Coach Skip trades Wayfarer's marks for. */
export const WAYFARER_REWARDS = [
  { id: "waybread", name: "3 waybread", cost: 1, gives: 3, text: "Eat one for 40 run energy (and a little health)." },
  { id: "wayfarer_boots", name: "Wayfarer's boots", cost: 20, gives: 1, text: "Run energy comes back half as fast again (Wayfaring 20)." },
  { id: "wayfarer_gloves", name: "Wayfarer's gloves", cost: 25, gives: 1, text: "You never slip on an obstacle (Wayfaring 30)." },
  { id: "wayfarer_hood", name: "Wayfarer's hood", cost: 30, gives: 1, text: "+10% Wayfaring XP (Wayfaring 40)." },
  { id: "wayfarer_cape", name: "Wayfarer's cape", cost: 40, gives: 1, text: "Running drains 20% less energy; the full outfit 40%, and laps pay double marks (Wayfaring 50)." },
] as const;
export const WAYFARER_SET = ["wayfarer_boots", "wayfarer_gloves", "wayfarer_hood", "wayfarer_cape"] as const;

// ---------- Slayer armour: sets only the Warden's creatures drop ----------
export type SlayerSetDef = {
  id: string; name: string; monster: string; slayer: number; wear: Partial<Record<Skill, number>>; color: string; accent: string; effect: string; each: string;
  pieces: readonly { slot: EquipSlot; suffix: string; shape: IconShape; bonuses: Partial<Bonuses> }[];
};
export const SLAYER_SETS: readonly SlayerSetDef[] = [
  { id: "bramble", name: "Bramble", monster: "thornback", slayer: 15, wear: { defence: 20 }, color: "#6f7a4a", accent: "#c9d08a",
    effect: "Thorns: a creature that hits you in melee takes 1 damage back for every piece worn.", each: "1 thorn damage back",
    pieces: [{ slot: "head", suffix: "coif", shape: "hood", bonuses: { ranged: 4, defence: 8 } }, { slot: "body", suffix: "vest", shape: "body", bonuses: { ranged: 10, defence: 20 } }, { slot: "legs", suffix: "chaps", shape: "legs", bonuses: { ranged: 7, defence: 14 } }] },
  { id: "wightbone", name: "Wightbone", monster: "cairn_wight", slayer: 35, wear: { defence: 35 }, color: "#d9d2bf", accent: "#7a8a6a",
    effect: "Bones buried or offered give 10% more Faith XP a piece (40% in the full set), and faith drains slower.", each: "+10% Faith XP from bones",
    pieces: [{ slot: "head", suffix: "helm", shape: "helm", bonuses: { defence: 12, prayer: 3 } }, { slot: "body", suffix: "plate", shape: "body", bonuses: { defence: 30, prayer: 5 } }, { slot: "legs", suffix: "greaves", shape: "legs", bonuses: { defence: 22, prayer: 4 } }] },
  { id: "stalker", name: "Stalker's", monster: "dune_stalker", slayer: 45, wear: { defence: 40 }, color: "#8c7a5a", accent: "#3b3a38",
    effect: "Monsters are 12% less likely to notice you sneaking a piece; in the full set, sneaking costs a third less energy.", each: "12% harder to notice while sneaking",
    pieces: [{ slot: "head", suffix: "hood", shape: "hood", bonuses: { ranged: 6, defence: 10 } }, { slot: "body", suffix: "jerkin", shape: "body", bonuses: { ranged: 14, defence: 26 } }, { slot: "legs", suffix: "leggings", shape: "legs", bonuses: { ranged: 10, defence: 18 } }] },
  { id: "cindershell", name: "Cindershell", monster: "ember_salamander", slayer: 60, wear: { defence: 55 }, color: "#8a3f2e", accent: "#f0a050",
    effect: "Dragonfire burns 15% less a piece, and the full set halves it.", each: "15% less dragonfire",
    pieces: [{ slot: "head", suffix: "helm", shape: "helm", bonuses: { defence: 16, strength: 2, magic: -3 } }, { slot: "body", suffix: "plate", shape: "body", bonuses: { defence: 40, strength: 4, magic: -8 } }, { slot: "legs", suffix: "greaves", shape: "legs", bonuses: { defence: 30, strength: 3, magic: -5 } }] },
  { id: "hollowthread", name: "Hollowthread", monster: "hollow_weaver", slayer: 75, wear: { magic: 60 }, color: "#3a3550", accent: "#b49ae0",
    effect: "Each piece gives spells an 8% chance to keep their sigils; the full set, 30%.", each: "8% chance a spell keeps its sigils",
    pieces: [{ slot: "head", suffix: "hood", shape: "hood", bonuses: { magic: 8, defence: 6 } }, { slot: "body", suffix: "robe", shape: "body", bonuses: { magic: 14, defence: 12 } }, { slot: "legs", suffix: "skirt", shape: "legs", bonuses: { magic: 10, defence: 9 } }] },
];
export const slayerSetOf = (id: string) => SLAYER_SETS.find(set => set.pieces.some(piece => `${set.id}_${piece.suffix}` === id));
function slayerGear(): Item[] {
  return SLAYER_SETS.flatMap(set => set.pieces.map((piece, index) => ({
    id: `${set.id}_${piece.suffix}`, name: `${set.name} ${piece.suffix}`, value: [3000, 6000, 4500][index] * set.slayer / 15,
    examine: `${set.name} armour, dropped by ${MONSTER_NAMES[set.monster] ?? set.monster}s. ${set.effect}`,
    icon: { shape: piece.shape, color: set.color, accent: set.accent },
    equip: { slot: piece.slot, bonuses: piece.bonuses, requires: { slayer: set.slayer, ...set.wear } },
  })));
}
const MONSTER_NAMES: Record<string, string> = { thornback: "thornback", cairn_wight: "cairn wight", dune_stalker: "dune stalker", ember_salamander: "ember salamander", hollow_weaver: "Hollow weaver" };

// ---------- Heartguard: red-and-white armour earned with Hitpoints ----------
/** The Heartguard set, sold by Mender Hale at the Friendhollow chapel: a piece for every ten Hitpoints levels, 10 to 90. */
export const HEARTGUARD = [
  { id: "heartguard_boots", name: "Heartguard boots", level: 10, slot: "feet" as const, shape: "boots" as const, bonuses: { defence: 3 }, price: 800 },
  { id: "heartguard_gloves", name: "Heartguard gloves", level: 20, slot: "hands" as const, shape: "gloves" as const, bonuses: { attack: 1, defence: 3 }, price: 1500 },
  { id: "heartguard_helm", name: "Heartguard helm", level: 30, slot: "head" as const, shape: "helm" as const, bonuses: { defence: 9 }, price: 3000 },
  { id: "heartguard_greaves", name: "Heartguard greaves", level: 40, slot: "legs" as const, shape: "legs" as const, bonuses: { defence: 15 }, price: 5000 },
  { id: "heartguard_shield", name: "Heartguard shield", level: 50, slot: "shield" as const, shape: "shield" as const, bonuses: { defence: 20 }, price: 8000 },
  { id: "heartguard_amulet", name: "Heartguard amulet", level: 60, slot: "neck" as const, shape: "amulet" as const, bonuses: { defence: 4, strength: 3, prayer: 2 }, price: 12000 },
  { id: "heartguard_cape", name: "Heartguard cape", level: 70, slot: "cape" as const, shape: "cape" as const, bonuses: { defence: 6 }, price: 18000 },
  { id: "heartguard_plate", name: "Heartguard plate", level: 80, slot: "body" as const, shape: "body" as const, bonuses: { defence: 38, magic: -6 }, price: 30000 },
  { id: "heartguard_blade", name: "Heartguard blade", level: 90, slot: "weapon" as const, shape: "sword" as const, bonuses: { attack: 42, strength: 40 }, price: 60000 },
] as const;
export const HEARTGUARD_RED = "#b8333a", HEARTGUARD_WHITE = "#f2efe8";
function heartguardGear(): Item[] {
  return HEARTGUARD.map(piece => ({
    id: piece.id, name: piece.name, value: Math.round(piece.price * 0.6), price: piece.price,
    examine: piece.id === "heartguard_blade" ? "The Heartguard's red-and-white blade: every eight damage it deals heals you one (Hitpoints 90)."
      : `Red-and-white Heartguard armour (Hitpoints ${piece.level}). Each piece adds a hitpoint and quickens your healing; the full set makes food heal more.`,
    icon: { shape: piece.shape, color: HEARTGUARD_RED, accent: HEARTGUARD_WHITE, ...(piece.shape === "amulet" ? { kind: "strung" } : {}) },
    equip: { slot: piece.slot, bonuses: piece.bonuses, requires: { hitpoints: piece.level }, ...(piece.slot === "weapon" ? { speed: 4 } : {}) },
  }));
}

// ---------- Equipment ----------
function metalGear(): Item[] {
  const out: Item[] = [];
  for (const metal of METALS) {
    const tier = metal.tier, scale = [1, 1.5, 2.2, 3.1, 4.3, 5.8, 6.8, 7.8, 8.9, 9.5, 10.2, 11.6][tier - 1];
    for (const piece of SMITH_PIECES) {
      const id = `${metal.id}_${piece.piece}`, name = `${metal.name} ${piece.name}`;
      const bonuses: Partial<Bonuses> = {};
      if (piece.att) bonuses.attack = Math.round(piece.att * scale);
      if (piece.str) bonuses.strength = Math.round(piece.str * scale);
      if (piece.def) bonuses.defence = Math.round(piece.def * scale);
      if (piece.slot === "body" || piece.slot === "legs" || piece.slot === "head") bonuses.magic = -Math.round(piece.def * 0.8);
      const isTool = piece.piece === "axe" || piece.piece === "pickaxe";
      const requireSkill: Skill = piece.slot === "weapon" ? "attack" : "defence";
      // Heavy two-handers need Strength as well as Attack: pewter 3, 5 and 7, and the metal's level more for each tier up.
      const heavy = heavyStrength(metal.id, piece.piece);
      const requires: Partial<Record<Skill, number>> = {};
      if (metal.level > 1) requires[requireSkill] = metal.level;
      if (heavy) requires.strength = heavy;
      const faith = "faith" in piece ? metal.level + piece.faith : 0;
      if (faith) { requires.prayer = faith; bonuses.prayer = Math.round(2 + tier * 0.7); }
      if (piece.piece === "roundshield") bonuses.magic = -Math.round(piece.def * 0.5);
      const weight = Math.round((PIECE_WEIGHT[piece.piece] ?? 1) * (1 + tier * 0.08) * 10) / 10;
      out.push({
        id, name, examine: isTool ? `A ${piece.name} made of ${metal.id}.` : faith ? `A ${metal.id} ${piece.name}, blessed at Dawnhold. Faith ${faith} to wield${heavy ? `, Strength ${heavy} and two hands` : ""}; it hurts the undead more and gives a little Faith with every hit.` : heavy ? `A ${metal.id} ${piece.name}. Two hands and Strength ${heavy} to swing it, and it hits harder the stronger you are.` : `A ${metal.id} ${piece.name}.`,
        value: Math.round(metal.value * piece.bars * 1.6 + 10),
        icon: { shape: piece.shape as IconShape, color: metal.color, accent: faith ? DAWN_GOLD : FORGE_GLOW[metal.id] },
        equip: {
          slot: piece.slot as EquipSlot, bonuses,
          requires: Object.keys(requires).length ? requires : undefined,
          speed: piece.speed || undefined, twoHanded: "twoHanded" in piece ? piece.twoHanded : undefined, holy: faith ? true : undefined,
        },
        tool: isTool ? { kind: piece.piece as "axe" | "pickaxe", tier, level: metal.level } : undefined,
        weight,
      });
    }
    const magic = FORGED_STAFF_MAGIC[metal.id];
    if (magic) out.push({
      id: `${metal.id}_staff`, name: `${metal.name} staff`, examine: `A staff forged of ${metal.id}, humming with power.`, value: Math.round(metal.value * 2 * 1.6 + 10),
      icon: { shape: "staff", color: metal.color, accent: FORGE_GLOW[metal.id], kind: "forged" },
      equip: { slot: "weapon", bonuses: { attack: tier, strength: tier + 2, magic }, requires: { magic: metal.level }, speed: 5, staff: true },
    });
  }
  return out;
}
const OTHER_GEAR: Item[] = [
  { id: "leather_gloves", name: "Leather gloves", examine: "These will keep my hands warm!", value: 6, icon: { shape: "gloves", color: "#b58b6b" }, equip: { slot: "hands", bonuses: { defence: 1 } } },
  { id: "leather_boots", name: "Leather boots", examine: "Comfortable leather boots.", value: 6, icon: { shape: "boots", color: "#9c7a5f" }, equip: { slot: "feet", bonuses: { defence: 1 } } },
  { id: "leather_hood", name: "Leather hood", examine: "Better than no armour!", value: 24, icon: { shape: "hood", color: "#b58b6b" }, equip: { slot: "head", bonuses: { defence: 2 } } },
  { id: "leather_bracers", name: "Leather bracers", examine: "These should protect my arms.", value: 18, icon: { shape: "bracer", color: "#9c7a5f" }, equip: { slot: "hands", bonuses: { attack: 1, defence: 2 } } },
  { id: "leather_jerkin", name: "Leather jerkin", examine: "Better than no armour!", value: 21, icon: { shape: "body", color: "#b58b6b" }, equip: { slot: "body", bonuses: { defence: 8, magic: 2 } } },
  { id: "leather_leggings", name: "Leather leggings", examine: "Better than no armour!", value: 20, icon: { shape: "legs", color: "#9c7a5f" }, equip: { slot: "legs", bonuses: { defence: 4, magic: 1 } } },
  { id: "scholar_hat", name: "Scholar's hat", examine: "A silly pointed hat.", value: 2, icon: { shape: "hat", color: "#6f7ea6" }, equip: { slot: "head", bonuses: { magic: 2 } } },
  { id: "scholar_robe", name: "Scholar's robe", examine: "I can do magic better in this.", value: 15, icon: { shape: "body", color: "#6f7ea6" }, equip: { slot: "body", bonuses: { magic: 3 } } },
  { id: "staff", name: "Staff", examine: "It's a slightly magical stick.", value: 15, icon: { shape: "staff", color: "#9c8672" }, equip: { slot: "weapon", bonuses: { attack: 2, strength: 3, magic: 4 }, speed: 5, staff: true } },
  { id: "scholar_skirt", name: "Scholar's skirt", examine: "Starry, and very comfortable.", value: 12, icon: { shape: "legs", color: "#6f7ea6" }, equip: { slot: "legs", bonuses: { magic: 2 } } },
  { id: "tide_staff", name: "Tide staff", examine: "A magical staff. Provides unlimited tide sigils.", value: 1500, icon: { shape: "staff", color: "#9fb4d0" }, equip: { slot: "weapon", bonuses: { attack: 4, strength: 5, magic: 10 }, speed: 5, staff: true, requires: { magic: 10 } } },
  { id: "stone_staff", name: "Stone staff", examine: "A magical staff. Provides unlimited stone sigils.", value: 1500, icon: { shape: "staff", color: "#a89479" }, equip: { slot: "weapon", bonuses: { attack: 4, strength: 5, magic: 10 }, speed: 5, staff: true, requires: { magic: 10 } } },
  { id: "ember_staff", name: "Ember staff", examine: "A magical staff. Provides unlimited ember sigils.", value: 1500, icon: { shape: "staff", color: "#e9a07a" }, equip: { slot: "weapon", bonuses: { attack: 4, strength: 5, magic: 10 }, speed: 5, staff: true, requires: { magic: 10 } } },
  { id: "deadwood_wand", name: "Deadwood wand", examine: "A wand of grey deadwood. It holds a charge the way the Deadwood holds its dead: quietly, and for a long time. Autocasts like a staff.", value: 2400, icon: { shape: "staff", color: "#9a958d", accent: "#8a62c8", kind: "wand" },
    equip: { slot: "weapon", bonuses: { attack: 6, strength: 2, magic: 18 }, requires: { magic: 50 }, speed: 4, staff: true } },
  // Presence gear: earned by the long quests of being known (the Namekeeper, Archivist Perrin, King Hollis).
  { id: "wanderers_cloak", name: "Wanderer's cloak", examine: "A travelling cloak with a stitch from every village you've passed through. Presence grows a fifth faster in it.", value: 0, tradeable: false,
    icon: { shape: "cape", color: "#7a6a52", accent: "#e2c46a" }, equip: { slot: "cape", bonuses: { defence: 4, prayer: 2 }, requires: { presence: 20 } } },
  { id: "storytellers_hat", name: "Storyteller's hat", examine: "A wide hat with a quill in the band. People lean in when you wear it.", value: 0, tradeable: false,
    icon: { shape: "hat", color: "#4a3f5c", accent: "#e2c46a" }, equip: { slot: "head", bonuses: { defence: 6, magic: 3 }, requires: { presence: 40 } } },
  { id: "chroniclers_mantle", name: "Chronicler's mantle", examine: "Deep blue, inked with the symbol from the stones. Patrons pay 15% more for work orders brought in it.", value: 0, tradeable: false,
    icon: { shape: "body", color: "#2f3a6b", accent: "#e2c46a" }, equip: { slot: "body", bonuses: { defence: 14, magic: 5 }, requires: { presence: 40 } } },
  { id: "blade_of_renown", name: "Blade of Renown", examine: "A sword with your name on the blade, cut the day the Realm remembered you. Its strength grows with your Presence.", value: 0, tradeable: false,
    icon: { shape: "sword", color: "#e8e5de", accent: "#e2c46a" }, equip: { slot: "weapon", bonuses: { attack: 50, strength: 44 }, requires: { presence: 60, attack: 60 }, speed: 4 } },
  { id: "cape_of_renown", name: "Cape of Renown", examine: "Gold on black, with the Realm's crown at the clasp. Presence grows a third faster in it.", value: 0, tradeable: false,
    icon: { shape: "cape", color: "#1c1b1f", accent: "#e2c46a", kind: "cross" }, equip: { slot: "cape", bonuses: { defence: 8, prayer: 4, attack: 2, strength: 2 }, requires: { presence: 60 } } },
  { id: "wyrmward_shield", name: "Wyrmward shield", examine: "King Hollis's gift. Dragonfire slides right off it.", value: 200, icon: { shape: "shield", color: "#c9c2b6", accent: "#cf6e6e" }, equip: { slot: "shield", bonuses: { defence: 8 } } },
  // ---------- The dungeon update: keys, curios and what the three new bosses leave behind ----------
  { id: "deepglass_key", name: "Deepglass key", examine: "A key of blue lake-glass. It will break in the lock it was made for.", value: 0, stackable: true, icon: { shape: "key", color: "#8fd3e8" } },
  { id: "archive_key", name: "Archive key", examine: "An iron key gone green with the wet, for the sealed reading room under Quillhaven. One turn is all it has left.", value: 0, stackable: true, icon: { shape: "key", color: "#5e7a6a" } },
  { id: "vault_key", name: "Vault key", examine: "A heavy bronze key from under the standing stones. It opens the Howling King's door, once.", value: 0, stackable: true, icon: { shape: "key", color: "#9a7a3e" } },
  { id: "crystal_shard", name: "Crystal shard", examine: "A shard of Glass Lake's crystal, cold and faintly lit.", value: 400, stackable: true, icon: { shape: "gem", color: "#8fd3e8", accent: "#ffffff" } },
  { id: "ink_page", name: "Ink-stained page", examine: "A page from the flooded floor of the Quillhaven library. The ink has run, but Perrin could read it.", value: 60, stackable: true, icon: { shape: "scroll", color: "#d9d2bf", accent: "#2c2a3e" } },
  { id: "grave_dust", name: "Grave dust", examine: "Dust from under the standing stones. Apothecaries and the Order both want it, for different reasons.", value: 150, stackable: true, icon: { shape: "material", color: "#8a8577" } },
  { id: "bat_wing", name: "Bat wing", examine: "A leathery wing from a cave bat.", value: 25, stackable: true, icon: { shape: "feather", color: "#3a3340" } },
  { id: "glassbrand", name: "Glassbrand", examine: "A sabre of lake-glass from the Crystal Golem's heart. Light bends along its edge.", value: 24_000, weight: 3, icon: { shape: "sabre", color: "#9fd8ea", accent: "#ffffff" }, equip: { slot: "weapon", bonuses: { attack: 44, strength: 40, magic: 4 }, speed: 4, requires: { attack: 45 } } },
  { id: "crystal_shield", name: "Crystal shield", examine: "A shield grown from the Crystal Golem's shell. Spells skid off it.", value: 18_000, weight: 4, icon: { shape: "shield", color: "#9fd8ea", accent: "#5f7f8f" }, equip: { slot: "shield", bonuses: { defence: 24, magic: 8 }, requires: { defence: 40 } } },
  { id: "glass_charm", name: "Lakeglass charm", examine: "A charm of Glass Lake crystal on a cord. The Old fisher says the lake looks after its own.", value: 3000, icon: { shape: "amulet", color: "#8fd3e8", accent: "#ffffff" }, equip: { slot: "neck", bonuses: { magic: 4, defence: 3, prayer: 1 } } },
  { id: "inkbound_tome", name: "Inkbound tome", examine: "The Archivist Below's own book, bound in something that was once a scholar. Held off-hand, it reads your spells back to you louder.", value: 30_000, weight: 1, icon: { shape: "tablet", color: "#2c2a3e", accent: "#b49ae0" }, equip: { slot: "shield", bonuses: { magic: 18, defence: 4 }, requires: { magic: 55 } } },
  { id: "archivist_cowl", name: "Archivist's cowl", examine: "The cowl of the library's first keeper, dry for the first time in centuries.", value: 20_000, weight: 1, icon: { shape: "hood", color: "#2c2a3e", accent: "#8fa3c4" }, equip: { slot: "head", bonuses: { magic: 10, defence: 8 }, requires: { magic: 55 } } },
  { id: "drowned_staff", name: "Drowned staff", examine: "A staff of black driftwood with ink still running down it.", value: 36_000, weight: 2, icon: { shape: "staff", color: "#2c2a3e", accent: "#5e7a6a" }, equip: { slot: "weapon", bonuses: { attack: 10, strength: 10, magic: 26 }, speed: 5, staff: true, requires: { magic: 60 } } },
  { id: "vaultsteel_blade", name: "Vaultsteel blade", examine: "The Howling King's own greatsword, black and cold and heavier than it looks.", value: 90_000, weight: 9, icon: { shape: "greatsword", color: "#3a3740", accent: "#9a7a3e" }, equip: { slot: "weapon", bonuses: { attack: 56, strength: 60 }, speed: 6, twoHanded: true, requires: { attack: 75 } } },
  { id: "vault_helm", name: "Vault helm", examine: "A horned helm from under the stones. Something in it still hates the sun.", value: 40_000, weight: 4, icon: { shape: "helm", color: "#3a3740", accent: "#9a7a3e" }, equip: { slot: "head", bonuses: { defence: 38, strength: 3 }, requires: { defence: 70 } } },
  { id: "vault_plate", name: "Vault plate", examine: "Vaultsteel plate, dented by whatever killed its first owner. Nothing since has got through.", value: 80_000, weight: 12, icon: { shape: "body", color: "#3a3740", accent: "#9a7a3e" }, equip: { slot: "body", bonuses: { defence: 66, strength: 5 }, requires: { defence: 70 } } },
  // ---------- The Rare Friends Ring: its two currencies, won in the arena, and what they buy ----------
  { id: "bloodmark", name: "Bloodmark", examine: "A coin of dark iron stamped with a ring, paid out at the Rare Friends Ring for every match won. The Pit Quartermaster takes nothing else.", value: 0, stackable: true, tradeable: false, icon: { shape: "coins", color: "#8a2f2b", accent: "#d9d2bf" } },
  { id: "laurel", name: "Laurel", examine: "A leaf of beaten gold, given at the Rare Friends Ring to a Friend who beats another in a Friend Fight. The Champions' Hall takes nothing else.", value: 0, stackable: true, tradeable: false, icon: { shape: "coins", color: "#c9a93a", accent: "#7a9a3e" } },
  { id: "pitfighter_helm", name: "Pitfighter helm", examine: "A leather pit helm with iron studs. The Ring's first tier: for those who can take a hit and give one back.", value: 6000, price: 40, weight: 2, icon: { shape: "helm", color: "#6b4a3a", accent: "#c9b48a" }, equip: { slot: "head", bonuses: { defence: 14, strength: 3 }, requires: { strength: 40, defence: 40 } } },
  { id: "pitfighter_plate", name: "Pitfighter plate", examine: "Hardened leather over iron plates, cut for swinging. The Ring's first tier.", value: 14_000, price: 90, weight: 7, icon: { shape: "body", color: "#6b4a3a", accent: "#c9b48a" }, equip: { slot: "body", bonuses: { defence: 32, strength: 6 }, requires: { strength: 40, defence: 40 } } },
  { id: "pitfighter_greaves", name: "Pitfighter greaves", examine: "Studded leather greaves. The Ring's first tier.", value: 9000, price: 60, weight: 4, icon: { shape: "legs", color: "#6b4a3a", accent: "#c9b48a" }, equip: { slot: "legs", bonuses: { defence: 22, strength: 4 }, requires: { strength: 40, defence: 40 } } },
  { id: "ringsteel_helm", name: "Ringsteel helm", examine: "A full helm of ringsteel, the Ring's own alloy, with a red crest. The second tier.", value: 20_000, price: 120, weight: 4, icon: { shape: "helm", color: "#5a5e6b", accent: "#cf6e6e" }, equip: { slot: "head", bonuses: { defence: 24, strength: 5 }, requires: { strength: 60, defence: 60 } } },
  { id: "ringsteel_plate", name: "Ringsteel plate", examine: "Ringsteel plate with a red sash, heavy and sure. The second tier.", value: 44_000, price: 260, weight: 11, icon: { shape: "body", color: "#5a5e6b", accent: "#cf6e6e" }, equip: { slot: "body", bonuses: { defence: 50, strength: 9 }, requires: { strength: 60, defence: 60 } } },
  { id: "ringsteel_greaves", name: "Ringsteel greaves", examine: "Ringsteel greaves. The second tier.", value: 30_000, price: 180, weight: 7, icon: { shape: "legs", color: "#5a5e6b", accent: "#cf6e6e" }, equip: { slot: "legs", bonuses: { defence: 36, strength: 7 }, requires: { strength: 60, defence: 60 } } },
  { id: "wildfur_helm", name: "Wildfur helm", examine: "A horned helm wrapped in wolf fur, the Ring's highest honour. Wildfur fights hardest when its wearer is nearly done: below a third of your health, every piece's strength counts twice.", value: 70_000, price: 400, weight: 4, icon: { shape: "helm", color: "#7a5b40", accent: "#d9d2bf" }, equip: { slot: "head", bonuses: { defence: 34, strength: 7 }, requires: { strength: 80, defence: 80 } } },
  { id: "wildfur_plate", name: "Wildfur plate", examine: "Iron scale under a mantle of fur, barbarian-cut, the Ring's highest honour. Below a third of your health its strength counts twice.", value: 140_000, price: 800, weight: 12, icon: { shape: "body", color: "#7a5b40", accent: "#d9d2bf" }, equip: { slot: "body", bonuses: { defence: 66, strength: 12 }, requires: { strength: 80, defence: 80 } } },
  { id: "wildfur_greaves", name: "Wildfur greaves", examine: "Fur-wrapped greaves of iron scale, the Ring's highest honour. Below a third of your health their strength counts twice.", value: 100_000, price: 600, weight: 8, icon: { shape: "legs", color: "#7a5b40", accent: "#d9d2bf" }, equip: { slot: "legs", bonuses: { defence: 46, strength: 9 }, requires: { strength: 80, defence: 80 } } },
  { id: "skull_mask", name: "Skull mask", examine: "A bone-white mask shaped like a skull, as the pit fighters wear. The Ring's creatures leave plenty of material.", value: 5000, price: 60, weight: 1, icon: { shape: "mask", color: "#e8e2d2", accent: "#161616" }, equip: { slot: "head", bonuses: { defence: 4, strength: 2 }, requires: { strength: 20 } } },
  { id: "horned_skull_mask", name: "Horned skull mask", examine: "A skull mask with a boar's tusks and a ram's horns. Nobody in the Ring argues with it.", value: 12_000, price: 150, weight: 2, icon: { shape: "mask", color: "#d9d2bf", accent: "#6b4a3a" }, equip: { slot: "head", bonuses: { defence: 8, strength: 3 }, requires: { strength: 50 } } },
  { id: "bloodmark_cape", name: "Bloodmark cape", examine: "A cape dyed the red of the Ring's fountain, worn by those who've fought a hundred matches, or bought their way to looking like it.", value: 16_000, price: 200, weight: 1, icon: { shape: "cape", color: "#8a2f2b", accent: "#d9d2bf" }, equip: { slot: "cape", bonuses: { strength: 4, defence: 6 }, requires: { strength: 50 } } },
  { id: "champions_cape", name: "Champion's cape", examine: "Gold on green, the cape of a Friend who beats other Friends in the Ring. Laurels only.", value: 30_000, price: 30, weight: 1, icon: { shape: "cape", color: "#7a9a3e", accent: "#c9a93a" }, equip: { slot: "cape", bonuses: { strength: 5, defence: 8, attack: 3 }, requires: { attack: 50 } } },
  { id: "laurel_crown", name: "Laurel crown", examine: "A crown of golden leaves. The Ring gives it to no one; the Champions' Hall sells it for laurels.", value: 24_000, price: 25, weight: 1, icon: { shape: "crown", color: "#c9a93a", accent: "#7a9a3e" }, equip: { slot: "head", bonuses: { defence: 6, strength: 3, attack: 3 }, requires: { attack: 50 } } },
  { id: "duelists_gauntlets", name: "Duelist's gauntlets", examine: "Gauntlets with a gold leaf on each knuckle, for Friends who settle things in the Ring.", value: 15_000, price: 15, weight: 1, icon: { shape: "gloves", color: "#5a5e6b", accent: "#c9a93a" }, equip: { slot: "hands", bonuses: { strength: 4, attack: 4 }, requires: { attack: 40 } } },
  { id: "gilded_skull_mask", name: "Gilded skull mask", examine: "A skull mask leafed in gold, the mark of a champion of Friend Fights.", value: 40_000, price: 40, weight: 1, icon: { shape: "mask", color: "#c9a93a", accent: "#161616" }, equip: { slot: "head", bonuses: { defence: 10, strength: 5 }, requires: { strength: 60 } } },
  { id: "ringbreaker", name: "Ringbreaker", examine: "The Ring's own warhammer: a great hammer face on one side of the head, a block of iron on the other, and a spike rising from the middle like the haft carried on. Two hands. One blow in three throws what it hits back a step, and the recoil costs you a little blood.", value: 60_000, price: 45_000, weight: 11, icon: { shape: "warhammer", color: "#5a5e6b", accent: "#8a2f2b", kind: "ringbreaker" }, equip: { slot: "weapon", bonuses: { attack: 30, strength: 58 }, speed: 7, twoHanded: true, requires: { strength: 60, attack: 30, hitpoints: 40 } } },
  { id: "moss_key", name: "Moss key", examine: "A bronze key furred with moss, for the warden's door under the Mossy Ruins. It turns once.", value: 0, stackable: true, icon: { shape: "key", color: "#6f7a4a" } },
  { id: "mossguard_shield", name: "Mossguard shield", examine: "The Moss Warden's shield, stone under moss, lighter than it looks.", value: 9000, weight: 4, icon: { shape: "shield", color: "#6f7a4a", accent: "#c9d08a" }, equip: { slot: "shield", bonuses: { defence: 18, magic: 2 }, requires: { defence: 35 } } },
  { id: "ringmasters_signet", name: "Ringmaster's signet", examine: "A heavy iron ring stamped with the Ring. Rub it and the Ring's magic carries you to its lobby, three times a day (the day turns at midnight, by the Realm's clock), and it lends the hand that wears it some of the pit's strength.", value: 20_000, weight: 0, tradeable: false, icon: { shape: "ring", color: "#5a5e6b", accent: "#8a2f2b" }, equip: { slot: "ring", bonuses: { strength: 4 }, requires: { strength: 30 } } },
  { id: "howling_cape", name: "Howling cape", examine: "A cape of grey wool from under the stones. In a wind it makes the noise The Wilds are afraid of.", value: 30_000, weight: 1, icon: { shape: "cape", color: "#4a4650", accent: "#b8b2a6" }, equip: { slot: "cape", bonuses: { defence: 9, ranged: 6, strength: 3 }, requires: { defence: 60 } } },
  { id: "drakehide_bracers", name: "Drakehide bracers", examine: "Scaled drakehide bracers.", value: 2500, icon: { shape: "bracer", color: "#6f8a5c" }, equip: { slot: "hands", bonuses: { ranged: 9, defence: 7 }, requires: { ranged: 50 } } },
  { id: "drakehide_chaps", name: "Drakehide chaps", examine: "Scaled drakehide chaps.", value: 5000, icon: { shape: "legs", color: "#6f8a5c" }, equip: { slot: "legs", bonuses: { ranged: 14, defence: 20 }, requires: { ranged: 50 } } },
  { id: "drakehide_vest", name: "Drakehide vest", examine: "Scaled drakehide. Light, and nearly fireproof.", value: 7500, icon: { shape: "body", color: "#6f8a5c" }, equip: { slot: "body", bonuses: { ranged: 22, defence: 32 }, requires: { ranged: 50 } } },
  { id: "breeze_staff", name: "Breeze staff", examine: "A magical staff. Provides unlimited breeze sigils.", value: 1500, icon: { shape: "staff", color: "#c7d3dc" }, equip: { slot: "weapon", bonuses: { attack: 4, strength: 5, magic: 10 }, speed: 5, staff: true, requires: { magic: 10 } } },
  { id: "moonlit_staff", name: "Moonlit staff", examine: "A staff with a small moon floating at its tip.", value: 9000, icon: { shape: "staff", color: "#9fabc2", accent: "#e2d7ad" }, equip: { slot: "weapon", bonuses: { attack: 8, strength: 8, magic: 20 }, speed: 5, staff: true, requires: { magic: 30 } } },
  { id: "rosestone_pendant", name: "Rosestone pendant", examine: "An enchanted rosestone amulet.", value: 3000, icon: { shape: "amulet", color: "#c98f95" }, equip: { slot: "neck", bonuses: { strength: 10 } } },
  { id: "moonstone_pendant", name: "Moonstone pendant", examine: "An enchanted moonstone amulet.", value: 1200, icon: { shape: "amulet", color: "#8fa3c9" }, equip: { slot: "neck", bonuses: { attack: 4 } } },
  { id: "friends_charm", name: "Old Friend's charm", examine: "A blessed symbol of the Old Friend.", value: 300, icon: { shape: "amulet", color: "#efede7" }, equip: { slot: "neck", bonuses: { prayer: 8 } } },
  { id: "team_cape", name: "Wanderer's cape", examine: "A plain travelling cape.", value: 50, icon: { shape: "cape", color: "#8f8a82" }, equip: { slot: "cape", bonuses: { defence: 1 } } },
  { id: "veilweave_hood", name: "Veilweave hood", examine: "Woven from the dark between two torches. Stand still in it and you all but vanish.", value: 0, tradeable: false,
    icon: { shape: "hood", color: "#2f2c3d", accent: "#8f8ab8" }, equip: { slot: "head", bonuses: { defence: 5, ranged: 3 }, requires: { thieving: 70 } } },
  { id: "hollow_cape", name: "Cape of the Hollow", examine: "Proof that you ended the Hollow King's reign.", value: 0, tradeable: false, icon: { shape: "cape", color: "#161616", accent: "#d8b6b4" }, equip: { slot: "cape", bonuses: { attack: 4, strength: 4, defence: 4, magic: 4, prayer: 4 } } },
  { id: "realm_crown", name: "Crown of the Realm", examine: "Worn by the Friend who ended the Hollow King's reign.", value: 0, tradeable: false, icon: { shape: "crown", color: "#e2d49e" }, equip: { slot: "head", bonuses: { defence: 6, prayer: 4 } } },
];

// ---------- Ranged: bows by wood, arrows by metal, hunter's hides ----------
export const BOWS = [
  { id: "shortbow", name: "Shortbow", level: 1, ranged: 8, value: 50, color: "#9c8672" },
  { id: "oak_bow", name: "Oak bow", level: 5, ranged: 14, value: 160, color: "#b59c7d" },
  { id: "willow_bow", name: "Willow bow", level: 20, ranged: 20, value: 320, color: "#a5a67d" },
  { id: "palm_bow", name: "Palm bow", level: 25, ranged: 24, value: 480, color: "#c9b48a" },
  { id: "maple_bow", name: "Maple bow", level: 30, ranged: 29, value: 640, color: "#c49a74" },
  { id: "pine_bow", name: "Pine bow", level: 35, ranged: 36, value: 1000, color: "#8a6446" },
  { id: "yew_bow", name: "Yew bow", level: 40, ranged: 47, value: 1600, color: "#7d6b5c" },
  { id: "ashwood_bow", name: "Ashwood bow", level: 50, ranged: 69, value: 3200, color: "#d6d3cc" },
  { id: "redwood_bow", name: "Redwood bow", level: 55, ranged: 78, value: 5200, color: "#8a3a2a" },
  { id: "ironbark_bow", name: "Ironbark bow", level: 65, ranged: 94, value: 12000, color: "#6d6b67" },
  { id: "gloomfang_bow", name: "Gloomfang bow", level: 60, ranged: 88, value: 40000, color: "#4a4458" },
] as const;
/** War bows: a heavier bow from two logs of each wood. Slower to draw than the plain bow, but every arrow lands harder, and it reaches a tile further. */
export const WAR_BOWS = [
  { id: "war_bow", name: "War bow", log: "logs", level: 5, ranged: 12, strength: 16, fletch: 10, xp: 12, value: 140, color: "#9c8672" },
  { id: "oak_war_bow", name: "Oak war bow", log: "oak_logs", level: 10, ranged: 18, strength: 18, fletch: 25, xp: 36, value: 420, color: "#b59c7d" },
  { id: "willow_war_bow", name: "Willow war bow", log: "willow_logs", level: 25, ranged: 26, strength: 22, fletch: 40, xp: 70, value: 850, color: "#a5a67d" },
  { id: "maple_war_bow", name: "Maple war bow", log: "maple_logs", level: 35, ranged: 36, strength: 26, fletch: 55, xp: 105, value: 1700, color: "#c49a74" },
  { id: "yew_war_bow", name: "Yew war bow", log: "yew_logs", level: 45, ranged: 56, strength: 32, fletch: 70, xp: 140, value: 4200, color: "#7d6b5c" },
  { id: "ashwood_war_bow", name: "Ashwood war bow", log: "ash_logs", level: 55, ranged: 80, strength: 38, fletch: 85, xp: 175, value: 8400, color: "#d6d3cc" },
  { id: "redwood_war_bow", name: "Redwood war bow", log: "redwood_logs", level: 60, ranged: 86, strength: 40, fletch: 88, xp: 190, value: 11000, color: "#8a3a2a" },
  { id: "ironbark_war_bow", name: "Ironbark war bow", log: "ironbark_logs", level: 70, ranged: 100, strength: 46, fletch: 93, xp: 240, value: 24000, color: "#6d6b67" },
] as const;
/** Crossbow stocks, carved from logs with a knife (Fletching). */
export const STOCKS = [
  { id: "wooden_stock", name: "Wooden stock", value: 12, log: "logs", level: 9, xp: 6, color: "#9c8672" },
  { id: "oak_stock", name: "Oak stock", value: 40, log: "oak_logs", level: 24, xp: 16, color: "#b59c7d" },
  { id: "willow_stock", name: "Willow stock", value: 64, log: "willow_logs", level: 39, xp: 22, color: "#a5a67d" },
  { id: "maple_stock", name: "Maple stock", value: 130, log: "maple_logs", level: 54, xp: 32, color: "#c49a74" },
  { id: "yew_stock", name: "Yew stock", value: 320, log: "yew_logs", level: 69, xp: 50, color: "#7d6b5c" },
  { id: "ashwood_stock", name: "Ashwood stock", value: 700, log: "ash_logs", level: 84, xp: 70, color: "#d6d3cc" },
] as const;
/**
 * Crossbows: metal limbs (two bars at the anvil) fixed to a wooden stock with Crafting. One-handed, so a shield fits;
 * slower than a bow, and each bolt hits harder. They fire bolts, never arrows.
 */
export const CROSSBOWS: readonly { metal: MetalId; stock: string; level: number; ranged: number; strength: number; craft: number; xp: number; value: number }[] = [
  { metal: "pewter", stock: "wooden_stock", level: 1, ranged: 12, strength: 10, craft: 8, xp: 12, value: 140 },
  { metal: "blackiron", stock: "oak_stock", level: 10, ranged: 20, strength: 12, craft: 18, xp: 22, value: 380 },
  { metal: "ashsteel", stock: "oak_stock", level: 20, ranged: 28, strength: 14, craft: 28, xp: 34, value: 900 },
  { metal: "moonsilver", stock: "willow_stock", level: 30, ranged: 38, strength: 18, craft: 42, xp: 50, value: 2000 },
  { metal: "glimmer", stock: "maple_stock", level: 40, ranged: 54, strength: 22, craft: 56, xp: 70, value: 4600 },
  { metal: "rarite", stock: "yew_stock", level: 45, ranged: 70, strength: 26, craft: 70, xp: 95, value: 11000 },
  { metal: "frostsilver", stock: "yew_stock", level: 50, ranged: 80, strength: 28, craft: 76, xp: 120, value: 22000 },
  { metal: "gloomsteel", stock: "yew_stock", level: 60, ranged: 90, strength: 30, craft: 80, xp: 140, value: 34000 },
  { metal: "wyrmscale", stock: "ashwood_stock", level: 70, ranged: 102, strength: 33, craft: 84, xp: 165, value: 50000 },
  { metal: "hollowsteel", stock: "ashwood_stock", level: 75, ranged: 110, strength: 35, craft: 88, xp: 185, value: 64000 },
  { metal: "cindersteel", stock: "ashwood_stock", level: 80, ranged: 118, strength: 38, craft: 92, xp: 205, value: 80000 },
  { metal: "ashenheart", stock: "ashwood_stock", level: 90, ranged: 134, strength: 42, craft: 96, xp: 240, value: 120000 },
];
/** Crossbow limbs: two bars each, a few Smithing levels over the metal's dagger. */
export const LIMBS_OFFSET = 6;
const ARROW_STRENGTH = [7, 10, 16, 22, 31, 49, 56, 64, 72, 78, 84, 96], BOLT_STRENGTH = [9, 13, 20, 28, 39, 61, 68, 76, 86, 92, 100, 114];
/** Every bow before it's strung: cut from logs with a knife, finished with a string. */
const UNSTRUNG: Item[] = [
  ...BOWS.filter(bow => bow.id !== "gloomfang_bow").map(bow => ({ id: `${bow.id}_u`, name: `${bow.name} (unstrung)`, examine: "A bow without its string. Use a string on it.", value: Math.round(bow.value * 0.5),
    icon: { shape: "bow" as const, color: bow.color, kind: "unstrung" } })),
  ...WAR_BOWS.map(bow => ({ id: `${bow.id}_u`, name: `${bow.name} (unstrung)`, examine: "A war bow without its string. Use a string on it.", value: Math.round(bow.value * 0.5),
    icon: { shape: "warbow" as const, color: bow.color, kind: "unstrung" } })),
];
const RANGED_GEAR: Item[] = [
  ...UNSTRUNG,
  ...BOWS.map(bow => ({
    id: bow.id, name: bow.name, value: bow.value, icon: { shape: "bow" as const, color: bow.color, accent: bow.id === "gloomfang_bow" ? "#cf6e6e" : undefined },
    examine: bow.id === "gloomfang_bow" ? "Strung with something that howls when you draw it." : `A bow of ${bow.id === "shortbow" ? "plain" : bow.name.split(" ")[0].toLowerCase()} wood.`,
    equip: { slot: "weapon" as const, bonuses: { ranged: bow.ranged }, requires: bow.level > 1 ? { ranged: bow.level } : undefined, speed: 4, twoHanded: true, bow: { range: 7 } },
  })),
  ...WAR_BOWS.map(bow => ({
    id: bow.id, name: bow.name, value: bow.value, icon: { shape: "warbow" as const, color: bow.color },
    examine: `A tall ${bow.id === "war_bow" ? "" : `${bow.name.split(" ")[0].toLowerCase()} `}bow, hard to draw. Slower than a plain bow, but every arrow lands harder.`,
    equip: { slot: "weapon" as const, bonuses: { ranged: bow.ranged }, requires: { ranged: bow.level }, speed: 5, twoHanded: true, bow: { range: 8, strength: bow.strength } },
  })),
  ...STOCKS.map(stock => ({ id: stock.id, name: stock.name, value: stock.value, icon: { shape: "stock" as const, color: stock.color },
    examine: "A carved crossbow stock. It needs metal limbs." })),
  ...METALS.map(metal => ({ id: `${metal.id}_limbs`, name: `${metal.name} limbs`, value: Math.round(metal.value * 3.2 + 10), icon: { shape: "limbs" as const, color: metal.color },
    examine: `Crossbow limbs of ${metal.id}. Fix them to the right stock.` })),
  ...CROSSBOWS.map(bow => {
    const metal = METALS.find(entry => entry.id === bow.metal)!, stock = STOCKS.find(entry => entry.id === bow.stock)!;
    return {
      id: `${bow.metal}_crossbow`, name: `${metal.name} crossbow`, value: bow.value, icon: { shape: "crossbow" as const, color: metal.color, accent: stock.color },
      examine: `${metal.name} limbs on ${stock.name.toLowerCase().replace(" stock", "")} stock. Fires bolts: slower than a bow, harder hitting, and one-handed, so a shield fits.`,
      equip: { slot: "weapon" as const, bonuses: { ranged: bow.ranged }, requires: bow.level > 1 ? { ranged: bow.level } : undefined, speed: 5, bow: { range: 7, strength: bow.strength, bolts: true } },
    };
  }),
  ...METALS.map((metal, index) => ({
    id: `${metal.id}_bolts`, name: `${metal.name} bolts`, examine: `Stubby bolts with ${metal.id} tips. Any crossbow fires them.`, value: [4, 8, 16, 32, 64, 140, 220, 320, 460, 580, 720, 1100][index], stackable: true,
    icon: { shape: "bolts" as const, color: metal.color }, ammo: { strength: BOLT_STRENGTH[index], level: metal.level, bolt: true },
  })),
  ...METALS.map((metal, index) => ({
    id: `${metal.id}_bolts_unf`, name: `Unfeathered ${metal.id} bolts`, examine: "Bolts straight off the anvil. Feathers will fly them true.", value: [1, 3, 6, 12, 24, 55, 90, 130, 190, 240, 300, 440][index], stackable: true,
    icon: { shape: "bolts" as const, color: metal.color, accent: "unf" },
  })),
  ...METALS.map((metal, index) => ({
    id: `${metal.id}_arrow`, name: `${metal.name} arrows`, examine: `Arrows with ${metal.id} heads.`, value: [3, 6, 12, 24, 48, 110, 180, 260, 380, 480, 600, 900][index], stackable: true,
    icon: { shape: "arrow" as const, color: metal.color }, ammo: { strength: ARROW_STRENGTH[index], level: metal.level },
  })),
  // A very rare Grumblin drop, worn over your Friend's head.
  { id: "grumblin_head", name: "Grumblin head", examine: "A Grumblin's head, hollowed out and surprisingly comfy. It still grumbles a little.", value: 5000,
    icon: { shape: "mask", color: "#8e9a7a", accent: "#e2c46a" }, equip: { slot: "head", bonuses: { defence: 3, attack: 1 } } },
  // Creature drops: weapons and gear you can only get from particular monsters.
  { id: "grumblin_spear", name: "Grumblin spear", examine: "Crude, sharp, and still faintly grumbling.", value: 220, icon: { shape: "spear", color: "#9aa3a8", accent: "#6d5a48" }, equip: { slot: "weapon", bonuses: { attack: 9, strength: 7 }, requires: { attack: 5 }, speed: 4 } },
  { id: "spider_fang", name: "Spider-fang dagger", examine: "A spider's fang set in a grip. Quick, and nasty.", value: 900, icon: { shape: "dagger", color: "#e8e4da" }, equip: { slot: "weapon", bonuses: { attack: 13, strength: 9 }, requires: { attack: 10 }, speed: 3 } },
  { id: "tusker_axe", name: "Tusker axe", examine: "A great axe with a boar's tusks for blades. Two hands.", value: 1400, icon: { shape: "battleaxe", color: "#e8dcc0" }, equip: { slot: "weapon", bonuses: { attack: 15, strength: 26 }, requires: { attack: 15 }, speed: 5, twoHanded: true } },
  { id: "horned_helm", name: "Horned helm", examine: "A helm with a mountain goat's horns. Headbutts not included.", value: 800, icon: { shape: "helm", color: "#8a8680", accent: "#e8dcc0", kind: "horned" }, equip: { slot: "head", bonuses: { defence: 13, strength: 2 }, requires: { defence: 15 } } },
  { id: "stinger_sabre", name: "Stinger sabre", examine: "Curved like a scorpion's tail, and about as friendly.", value: 4000, icon: { shape: "sabre", color: "#d9a441", accent: "#8a4a3a" }, equip: { slot: "weapon", bonuses: { attack: 31, strength: 27 }, requires: { attack: 25 }, speed: 4 } },
  { id: "golem_maul", name: "Golem maul", examine: "A stone golem's fist on a haft. Two hands, and then some.", value: 12000, icon: { shape: "warhammer", color: "#8f8a83", accent: "#c9e07a" }, equip: { slot: "weapon", bonuses: { attack: 26, strength: 58 }, requires: { attack: 40 }, speed: 5, twoHanded: true } },
  { id: "mossy_staff", name: "Mossy staff", examine: "Moss still grows on it, and something hums in the moss.", value: 6000, icon: { shape: "staff", color: "#7f9a5c", accent: "#c9e07a" }, equip: { slot: "weapon", bonuses: { attack: 6, strength: 6, magic: 22 }, requires: { magic: 30 }, speed: 5, staff: true } },
  { id: "mossblade", name: "Mossblade", examine: "A sword grown over with moss. It cuts better for it.", value: 8000, icon: { shape: "sword", color: "#8fa87a", accent: "#c9e07a" }, equip: { slot: "weapon", bonuses: { attack: 37, strength: 31 }, requires: { attack: 35 }, speed: 4 } },
  // Sheep, wool and string: shear a sheep, spin the wool into string at a spinning wheel, string bows and amulets with it.
  { id: "shears", name: "Shears", examine: "For shearing sheep.", value: 8, icon: { shape: "shears", color: "#b9bfc6" } },
  { id: "wool", name: "Wool", examine: "Fresh off a sheep. A spinning wheel would turn it into string.", value: 4, icon: { shape: "wool", color: "#efeae0" } },
  { id: "string", name: "String", examine: "Spun wool. It strings bows, amulets and necklaces.", value: 12, icon: { shape: "string", color: "#e8dcc0" } },
  { id: "moonstone_amulet", name: "Moonstone amulet", examine: "A moonstone on a string. The Enchant Moonstone spell would wake it.", value: 320, icon: { shape: "amulet", color: "#8fa3c9", kind: "strung" }, equip: { slot: "neck", bonuses: { attack: 1, magic: 1 } } },
  { id: "sagestone_amulet", name: "Sagestone amulet", examine: "A sagestone on a string. Calm and green.", value: 600, icon: { shape: "amulet", color: "#8fbf9a", kind: "strung" }, equip: { slot: "neck", bonuses: { defence: 2, magic: 2 } } },
  { id: "rosestone_amulet", name: "Rosestone amulet", examine: "A rosestone on a string. The Enchant Rosestone spell would wake it.", value: 1200, icon: { shape: "amulet", color: "#c98f95", kind: "strung" }, equip: { slot: "neck", bonuses: { strength: 2, magic: 2 } } },
  // The sigil stone box: carried in your pack, it holds 120 sigil stones and the altar takes them all.
  { id: "sigil_box", name: "Sigil stone box", examine: "A carved box that holds 120 sigil stones. Carry it to an altar and every stone inside is pressed.", value: 1500,
    icon: { shape: "stonebox", color: "#9c7a58", accent: "#b49ae0" } },
  // Wayfaring: Coach Skip's marks, waybread and the Wayfarer's outfit (each piece with its own knack).
  { id: "wayfarer_mark", name: "Wayfarer's mark", examine: "A brass token stamped with a boot: one for every lap of a course. Coach Skip trades his outfit for them.", value: 0, stackable: true, tradeable: false, icon: { shape: "coins", color: "#c9a24a", kind: "mark" } },
  { id: "waybread", name: "Waybread", examine: "A dense travellers' loaf. Eat it and the spring comes back into your step (40 run energy).", value: 30, heal: 2, energy: 40, icon: { shape: "bread", color: "#c9a06a", accent: "#7a4a22" } },
  { id: "wayfarer_boots", name: "Wayfarer's boots", examine: "Soft, springy boots. Run energy comes back half as fast again.", value: 2000, tradeable: false, icon: { shape: "boots", color: "#7a8a9a", accent: "#e8e5de" }, equip: { slot: "feet", bonuses: { defence: 2 }, requires: { agility: 20 } } },
  { id: "wayfarer_gloves", name: "Wayfarer's gloves", examine: "Grippy leather gloves. You never slip on an obstacle in these.", value: 2500, tradeable: false, icon: { shape: "gloves", color: "#7a8a9a", accent: "#e8e5de" }, equip: { slot: "hands", bonuses: { defence: 2 }, requires: { agility: 30 } } },
  { id: "wayfarer_hood", name: "Wayfarer's hood", examine: "A light hood that keeps the wind out of your eyes. +10% Wayfaring XP.", value: 3000, tradeable: false, icon: { shape: "hood", color: "#7a8a9a", accent: "#e8e5de" }, equip: { slot: "head", bonuses: { defence: 3 }, requires: { agility: 40 } } },
  { id: "wayfarer_cape", name: "Wayfarer's cape", examine: "A short travelling cape. Running drains 20% less energy; with the whole outfit, 40%, and laps pay double marks.", value: 4000, tradeable: false, icon: { shape: "cape", color: "#7a8a9a", accent: "#e8e5de" }, equip: { slot: "cape", bonuses: { defence: 3 }, requires: { agility: 50 } } },
  // The Warden's bracers (a Slayer reward): more Slayer XP on task.
  { id: "warden_bracers", name: "Warden's bracers", examine: "Dark leather bracers stamped with the Warden's mark. +10% Slayer XP on task.", value: 15000, tradeable: false, icon: { shape: "bracer", color: "#3b3a38", accent: "#cf6e6e" }, equip: { slot: "hands", bonuses: { attack: 2, ranged: 2, defence: 3 }, requires: { slayer: 30 } } },
  // The ossuary bag (the Dawn Vigil's reward): carried in your pack, it holds 60 bones of any kind, catches the bones you pick up, and an altar takes them all at once.
  { id: "bone_bag", name: "Ossuary bag", examine: "A linen bag blessed by the Order of the Dawn. Worn on the back or carried, it holds 60 bones of any kind, catches the bones you pick up, and an altar takes every one at once (pray at one while wearing it).", value: 1200, tradeable: false,
    icon: { shape: "satchel", color: "#d8cdb6", accent: "#f2efe8", kind: "bones" }, equip: { slot: "cape", bonuses: { prayer: 2 } } },
  // The inkcoal satchel: worn on your back (or carried), it catches mined inkcoal and feeds the furnace.
  // Belts: worn at the waist, each holds a trade's small things so your pack stays free and the work never stops for want of them.
  { id: "apothecary_belt", name: "Apothecary's belt", examine: "Loops and pouches for 40 potions, 20 clean or ground herbs and 20 vials of water. Brewing draws from it; Sip drinks the potion you need.", value: 2500, tradeable: false,
    icon: { shape: "leather", color: "#6a4a2e", accent: "#8fbf9a", kind: "belt" }, equip: { slot: "belt", bonuses: {} } },
  { id: "fletchers_belt", name: "Fletcher's belt", examine: "Pouches for 500 arrow shafts, 500 feathers, 500 headless arrows, 300 arrowheads and 50 bowstrings. The knife reaches into it.", value: 2500, tradeable: false,
    icon: { shape: "leather", color: "#6a4a2e", accent: "#c49a74", kind: "belt" }, equip: { slot: "belt", bonuses: {} } },
  { id: "sigil_satchel", name: "Sigil satchel", examine: "A mage's bag: purple, with gold stars. Worn on the back or carried, it holds 2,000 sigils of every kind, catches the sigils you pick up, and your spells draw from it.", value: 6000, tradeable: false,
    icon: { shape: "satchel", color: "#5a3a9a", accent: "#e2c46a", kind: "stars" }, equip: { slot: "cape", bonuses: { magic: 3 }, requires: { magic: 30 } } },
  { id: "inkcoal_satchel", name: "Inkcoal satchel", examine: "A stout leather pack for your back. It holds 120 inkcoal, fills itself as you mine, and the furnace reaches into it.", value: 2500,
    icon: { shape: "satchel", color: "#8a6446", accent: "#3b3a38" }, equip: { slot: "cape", bonuses: { defence: 1 } } },
  // Hazel's quiver (the Fernwick quest's reward): worn on your back, and most shots fly home to it.
  { id: "hazels_quiver", name: "Hazel's quiver", examine: "Hazel's grandmother's quiver, restitched. Four arrows or bolts in five fly home to it after the shot.", value: 1200, tradeable: false,
    icon: { shape: "quiver", color: "#8a5a3a", accent: "#c9a24a" }, equip: { slot: "cape", bonuses: { ranged: 4, defence: 1 } } },
  { id: "torn_quiver", name: "Torn quiver", examine: "Hazel's family quiver, ripped and muddy, with Grumblin teeth marks. Hazel will want this back.", value: 0, tradeable: false,
    icon: { shape: "quiver", color: "#6d5a48", accent: "torn" } },
  { id: "hunter_coif", name: "Hunter's coif", examine: "A soft leather coif. Keeps the hair out of your eyes.", value: 40, icon: { shape: "hood", color: "#a5a67d" }, equip: { slot: "head", bonuses: { ranged: 3, defence: 2 } } },
  { id: "hunter_vest", name: "Hunter's vest", examine: "Stitched for drawing a bow all day.", value: 90, icon: { shape: "body", color: "#a5a67d" }, equip: { slot: "body", bonuses: { ranged: 8, defence: 6 } } },
  { id: "hunter_chaps", name: "Hunter's chaps", examine: "Hard-wearing leather chaps.", value: 70, icon: { shape: "legs", color: "#8e8f6a" }, equip: { slot: "legs", bonuses: { ranged: 5, defence: 4 } } },
  { id: "hunter_bracers", name: "Hunter's bracers", examine: "They take the sting out of a bowstring.", value: 45, icon: { shape: "bracer", color: "#8e8f6a" }, equip: { slot: "hands", bonuses: { ranged: 4, defence: 2 } } },
  { id: "frosthide_coif", name: "Frosthide coif", examine: "Frost-wolf hide, still cold.", value: 900, icon: { shape: "hood", color: "#c7d3dc" }, equip: { slot: "head", bonuses: { ranged: 6, defence: 8 }, requires: { ranged: 30 } } },
  { id: "frosthide_vest", name: "Frosthide vest", examine: "Frost-wolf hide, laced tight.", value: 2400, icon: { shape: "body", color: "#c7d3dc" }, equip: { slot: "body", bonuses: { ranged: 15, defence: 22 }, requires: { ranged: 30 } } },
  { id: "frosthide_chaps", name: "Frosthide chaps", examine: "Frost-wolf hide chaps.", value: 1600, icon: { shape: "legs", color: "#afbccb" }, equip: { slot: "legs", bonuses: { ranged: 10, defence: 14 }, requires: { ranged: 30 } } },
  { id: "frosthide_bracers", name: "Frosthide bracers", examine: "Frost-wolf hide bracers.", value: 800, icon: { shape: "bracer", color: "#afbccb" }, equip: { slot: "hands", bonuses: { ranged: 7, defence: 5 }, requires: { ranged: 30 } } },
];

// ---------- Slayer, mastery capes, tablets and lamps ----------
const MASTERY_BONUS: Partial<Bonuses> = { attack: 4, strength: 4, defence: 9, ranged: 4, magic: 4, prayer: 4 };
const OTHER_ITEMS: Item[] = [
  { id: "slayer_gem", name: "Warden's gem", examine: "Tells you your Slayer task when you look into it.", value: 1, icon: { shape: "gem", color: "#6d8a8f", accent: "#161616" } },
  { id: "slayer_helm", name: "Warden's helm", examine: "A dark helm that knows your task. +15% accuracy and damage on it.", value: 12000, tradeable: false,
    icon: { shape: "helm", color: "#3b3a38", accent: "#cf6e6e" }, equip: { slot: "head", bonuses: { defence: 12, ranged: 3, magic: 3 }, requires: { defence: 10, slayer: 20 } } },
  ...SKILLS.flatMap(skill => [false, true].map(trimmed => ({
    id: `${skill}_cape${trimmed ? "_t" : ""}`, name: `${SKILL_NAMES[skill]} mastery cape${trimmed ? " (t)" : ""}`, value: 0, price: 99_000, tradeable: false,
    examine: `The cape of a true master of ${SKILL_NAMES[skill]}.${trimmed ? " Trimmed: this Friend has mastered more than one skill." : ""}`,
    icon: { shape: "cape" as const, color: SKILL_COLORS[skill][0], accent: SKILL_COLORS[skill][1], kind: trimmed ? "mantle_t" : "mantle" },
    mastery: { skill, trimmed }, equip: { slot: "cape" as const, bonuses: MASTERY_BONUS, requires: { [skill]: 99 } },
  }))),
  { id: "grandmaster_cape", name: "Grandmaster's cape", examine: "Every skill, mastered. The Realm has run out of things to teach you.", value: 0, price: 1_700_000, tradeable: false,
    icon: { shape: "cape", color: "#e2d49e", accent: "#d8b6b4", kind: "mantle_t" }, mastery: { skill: "all", trimmed: true },
    equip: { slot: "cape", bonuses: { attack: 8, strength: 8, defence: 14, ranged: 8, magic: 8, prayer: 8 } } },
  ...([["hollow_square", "Friendhollow"], ["emberforge", "Emberforge"], ["oasis", "Oasis"], ["frostpeak", "Frostpeak"], ["pier", "Pier"]] as const).map(([place, name]) => ({
    id: `tablet_${place}`, name: `${name} tablet`, examine: `Break it to travel to ${name === "Pier" ? "Pike's Pier" : name}.`, value: 120, stackable: true, tablet: place,
    icon: { shape: "tablet" as const, color: { hollow_square: "#e8d4c0", emberforge: "#e9a07a", oasis: "#e2d49e", frostpeak: "#c7d3dc", pier: "#8fa3c9" }[place] },
  })),
  { id: "friendship_cape", name: "Friendship cape", examine: "Given to Friends who bring Friends. Wear it for the Friendship emote.", value: 0, tradeable: false,
    icon: { shape: "cape", color: "#e7a9b0", accent: "#f7f5f0" }, equip: { slot: "cape", bonuses: { attack: 2, strength: 2, defence: 4, ranged: 2, magic: 2, prayer: 2 } } },
  { id: "insight_lamp", name: "Lamp of insight", examine: "Rub it to gain experience in a skill of your choice.", value: 0, tradeable: false, icon: { shape: "lamp", color: "#e2d49e" } },
];

// ---------- Tailoring: capes in solid colours and patterns, and hats (Threadneedle Tailors on Market Street) ----------
/** Solid capes: [id part, name, colour]. */
const SOLID_CAPES = [
  ["crimson", "Crimson", "#b0443c"], ["royal", "Royal blue", "#3f5d9a"], ["forest", "Forest green", "#4f7a4a"], ["midnight", "Midnight", "#2a2a33"],
  ["snow", "Snow white", "#ecebe6"], ["plum", "Plum", "#6e4a8a"], ["golden", "Golden", "#c9a24a"], ["russet", "Russet", "#8a5a3a"], ["teal", "Teal", "#3f8a86"], ["rose", "Rose", "#d98fa6"],
] as const;
/** Patterned capes: [id, name, colour, pattern colour, pattern (patterns.ts), examine]. */
const PATTERN_CAPES = [
  ["striped_cape", "Striped cape", "#b0443c", "#e2c46a", "stripes", "Crimson and gold, in bold stripes."],
  ["halved_cape", "Halved cape", "#3f5d9a", "#ecebe6", "halves", "Half royal blue, half white. Very heraldic."],
  ["chevron_cape", "Chevron cape", "#4f7a4a", "#e2c46a", "chevron", "A golden chevron on forest green."],
  ["quartered_cape", "Quartered cape", "#2a2a33", "#ecebe6", "quartered", "Black and white, in quarters."],
  ["bordered_cape", "Bordered cape", "#6e4a8a", "#e2c46a", "border", "Plum, bordered in gold thread."],
  ["starry_cape", "Starry cape", "#2a2a44", "#f2e28f", "stars", "Midnight blue, sewn with little stars."],
  ["pilgrim_cape", "Pilgrim's cape", "#ecebe6", "#b0443c", "cross", "White with a red cross, for long roads."],
] as const;
/** Pointed wizard's hats in colours ([id part, name, colour, band]), feathered caps and wide-brimmed hats. */
const WIZARD_HATS = [
  ["crimson", "Crimson", "#9a3e3a", "#e2c46a"], ["emerald", "Emerald", "#3f7a58", "#e2c46a"], ["midnight", "Midnight", "#2a2a44", "#c6bed4"],
  ["plum", "Plum", "#6e4a8a", "#e2c46a"], ["ashen", "Ashen", "#5f5e66", "#cf6e6e"], ["golden", "Golden", "#c9a24a", "#6f5440"],
] as const;
const CAPS = [["crimson", "Crimson", "#9a3e3a", "#ecebe6"], ["forest", "Forest", "#4f7a4a", "#e2c46a"], ["royal", "Royal", "#3f5d9a", "#e7a9b0"], ["russet", "Russet", "#8a5a3a", "#8fbf9a"]] as const;
const WIDE_HATS = [["straw", "Straw", "#d8c48a", "#9a3e3a"], ["felt", "Felt", "#5f5a52", "#b0443c"], ["leather", "Leather", "#8a6446", "#3b3a38"]] as const;
const TAILORING: Item[] = [
  ...SOLID_CAPES.map(([key, name, color]): Item => ({ id: `${key}_cape`, name: `${name} cape`, examine: `A ${name.toLowerCase()} woollen cape.`, value: 120, icon: { shape: "cape", color }, equip: { slot: "cape", bonuses: { defence: 1 } } })),
  ...PATTERN_CAPES.map(([id, name, color, accent, kind, examine]): Item => ({ id, name, examine, value: 400, icon: { shape: "cape", color, accent, kind }, equip: { slot: "cape", bonuses: { defence: 1 } } })),
  ...WIZARD_HATS.map(([key, name, color, accent]): Item => ({ id: `${key}_wizard_hat`, name: `${name} wizard hat`, examine: "A pointed hat. Very wizardly.", value: 90, icon: { shape: "hat", color, accent }, equip: { slot: "head", bonuses: { magic: 2 } } })),
  ...CAPS.map(([key, name, color, accent]): Item => ({ id: `${key}_feathered_cap`, name: `${name} feathered cap`, examine: "A soft cap with a jaunty feather.", value: 70, icon: { shape: "hat", color, accent, kind: "feathered" }, equip: { slot: "head", bonuses: { ranged: 1 } } })),
  ...WIDE_HATS.map(([key, name, color, accent]): Item => ({ id: `${key}_wide_hat`, name: `${name} traveller's hat`, examine: "A wide brim for sun and rain.", value: 60, icon: { shape: "hat", color, accent, kind: "wide" }, equip: { slot: "head", bonuses: { defence: 1 } } })),
];
export const TAILOR_STOCK = TAILORING.map(entry => entry.id);

// ---------- Regional clothing: every settlement of the wider world dresses its own way ----------
/** A region's clothes: [id, name, slot shape/kind, colour, accent, examine]. Sold by the village clothier and worn by its people. */
export type RegionalSet = { region: string; shop: string; pieces: readonly { id: string; name: string; slot: EquipSlot; shape: IconShape; kind?: string; color: string; accent: string; examine: string; value: number }[] };
export const REGIONAL_CLOTHING: readonly RegionalSet[] = [
  { region: "maidens", shop: "maidens_market", pieces: [
    { id: "maiden_veil", name: "Maiden's veil", slot: "head", shape: "hood", color: "#3a3330", accent: "#9a2f2b", examine: "A dark veil edged in red, as the Deadwood Maidens wear against the dust of the dead.", value: 400 },
    { id: "maiden_mail", name: "Maiden's mail", slot: "body", shape: "body", kind: "tunic", color: "#3a3330", accent: "#9a2f2b", examine: "A short mail shirt under a dark tabard, red at the hem.", value: 1200 },
    { id: "maiden_skirt", name: "Maiden's skirt", slot: "legs", shape: "legs", color: "#2b2624", accent: "#9a2f2b", examine: "A split riding skirt of dark wool.", value: 700 },
    { id: "maiden_boots", name: "Maiden's boots", slot: "feet", shape: "boots", color: "#2b2624", accent: "#9a2f2b", examine: "Soft boots for quiet feet in dead leaves.", value: 300 },
  ] },
  { region: "gravesend", shop: "gravesend_clothier", pieces: [
    { id: "mourners_hood", name: "Mourner's hood", slot: "head", shape: "hood", color: "#3b3a40", accent: "#d9d2bf", examine: "A deep charcoal hood, bone-white at the hem. Gravesend wears it for everyone the Deadwood took.", value: 90 },
    { id: "gravesend_coat", name: "Gravesend coat", slot: "body", shape: "body", kind: "tunic", color: "#3b3a40", accent: "#d9d2bf", examine: "A long dark coat with bone buttons.", value: 180 },
    { id: "ashen_trousers", name: "Ashen trousers", slot: "legs", shape: "legs", kind: "trousers", color: "#55525a", accent: "#3b3a40", examine: "Grey as the Deadwood's grass.", value: 70 },
    { id: "lantern_cape", name: "Lantern-bearer's cape", slot: "cape", shape: "cape", color: "#4a3a60", accent: "#f2e28f", examine: "The gravekeepers' purple cape, a lantern stitched in gold on the back.", value: 240 },
  ] },
  { region: "saltmarrow", shop: "saltmarrow_clothier", pieces: [
    { id: "souwester", name: "Sou'wester", slot: "head", shape: "hat", kind: "wide", color: "#e2b84a", accent: "#8a5a2a", examine: "A fisher's oilskin hat. The rain runs straight off the back.", value: 80 },
    { id: "oilskin_coat", name: "Oilskin coat", slot: "body", shape: "body", kind: "tunic", color: "#2f5a66", accent: "#e2b84a", examine: "Waxed canvas the colour of deep water.", value: 170 },
    { id: "sailors_trousers", name: "Sailor's trousers", slot: "legs", shape: "legs", kind: "trousers", color: "#2f4266", accent: "#ecebe6", examine: "Navy, with a white stripe down the leg.", value: 70 },
    { id: "sea_cape", name: "Weathered sea cape", slot: "cape", shape: "cape", color: "#5f8a96", accent: "#ecebe6", examine: "Salt-stiff and sun-faded. It has seen storms.", value: 220 },
  ] },
  { region: "hollyhock", shop: "hollyhock_clothier", pieces: [
    { id: "herbalists_hat", name: "Herbalist's hat", slot: "head", shape: "hat", kind: "wide", color: "#6f8f5a", accent: "#e7a9b0", examine: "A wide green hat with a hollyhock tucked in the band.", value: 80 },
    { id: "gardeners_apron", name: "Gardener's apron", slot: "body", shape: "body", kind: "tunic", color: "#8fbf9a", accent: "#ecebe6", examine: "A sage tunic under a linen apron, pockets full of seeds.", value: 160 },
    { id: "hollyhock_skirt", name: "Hollyhock skirt", slot: "legs", shape: "legs", kind: "skirt", color: "#c98f95", accent: "#6f8f5a", examine: "Rose pink, printed with leaves.", value: 80 },
    { id: "leaf_cape", name: "Leaf-pinned cape", slot: "cape", shape: "cape", color: "#4f7a4a", accent: "#e2d49e", examine: "A green cape pinned with a brass leaf.", value: 200 },
  ] },
  { region: "dyemoor", shop: "dyemoor_clothier", pieces: [
    { id: "dyers_turban", name: "Dyer's turban", slot: "head", shape: "hat", color: "#6e4a8a", accent: "#e2c46a", examine: "Wound from a bolt of the moor's own indigo.", value: 90 },
    { id: "moorland_frock", name: "Moorland frock", slot: "body", shape: "body", kind: "dress", color: "#3f3f7a", accent: "#e2c46a", examine: "Dyemoor indigo, cut to swing. The dye never runs.", value: 220 },
    { id: "madder_trousers", name: "Madder trousers", slot: "legs", shape: "legs", kind: "trousers", color: "#a8403a", accent: "#6e4a8a", examine: "Dyed red with madder root.", value: 80 },
    { id: "dyemoor_cloak", name: "Dyemoor cloak", slot: "cape", shape: "cape", color: "#6e4a8a", accent: "#a8403a", examine: "A cloak in the dyers' two colours, indigo and madder.", value: 260 },
  ] },
  { region: "tallgrass", shop: "tallgrass_clothier", pieces: [
    { id: "trackers_hood", name: "Tracker's hood", slot: "head", shape: "hood", color: "#9a8a5a", accent: "#4f5234", examine: "Tan leather, soft enough not to rustle.", value: 80 },
    { id: "tallgrass_longcoat", name: "Tallgrass longcoat", slot: "body", shape: "body", kind: "tunic", color: "#6f7248", accent: "#9a8a5a", examine: "Olive wool that vanishes in long grass.", value: 170 },
    { id: "wildsmans_trousers", name: "Wildsman's trousers", slot: "legs", shape: "legs", kind: "trousers", color: "#5a4230", accent: "#9a8a5a", examine: "Patched at the knee from crawling.", value: 70 },
    { id: "pelt_cape", name: "Pelt cape", slot: "cape", shape: "cape", color: "#8a6446", accent: "#d8c9a8", examine: "Wolf pelt, the fur turned in.", value: 220 },
  ] },
  { region: "cragmaw", shop: "cragmaw_clothier", pieces: [
    { id: "fur_hood", name: "Fur-lined hood", slot: "head", shape: "hood", color: "#6d5a48", accent: "#ecebe6", examine: "Goat fur against the Ironreach wind.", value: 90 },
    { id: "ironreach_greatcoat", name: "Ironreach greatcoat", slot: "body", shape: "body", kind: "tunic", color: "#55525a", accent: "#ecebe6", examine: "Heavy grey wool, fur at the collar, soot at the cuffs.", value: 200 },
    { id: "quilted_trousers", name: "Quilted trousers", slot: "legs", shape: "legs", kind: "trousers", color: "#4a4a50", accent: "#8a8780", examine: "Stitched in squares and stuffed with wool.", value: 80 },
    { id: "climbers_cape", name: "Climber's cape", slot: "cape", shape: "cape", color: "#b0443c", accent: "#ecebe6", examine: "Red, so they can find you in the snow.", value: 220 },
  ] },
  { region: "quillhaven", shop: "quillhaven_clothier", pieces: [
    { id: "scholars_cap_quill", name: "Quillhaven cap", slot: "head", shape: "hat", color: "#2f4266", accent: "#e2c46a", examine: "A flat scholar's cap with a gold tassel.", value: 90 },
    { id: "archivist_robe", name: "Archivist's robe", slot: "body", shape: "body", color: "#2f4266", accent: "#e2c46a", examine: "A long blue robe, ink on both sleeves.", value: 220 },
    { id: "inkstained_trousers", name: "Inkstained trousers", slot: "legs", shape: "legs", kind: "trousers", color: "#3b3a40", accent: "#2f4266", examine: "They were grey once.", value: 70 },
    { id: "librarians_cape", name: "Librarian's cape", slot: "cape", shape: "cape", color: "#8fa3c9", accent: "#e2c46a", examine: "Pale blue, with a quill embroidered on the back.", value: 220 },
  ] },
  { region: "ashfall", shop: "ashfall_trader", pieces: [
    { id: "drakehide_hood", name: "Drakehide hood", slot: "head", shape: "hood", color: "#6f8a5c", accent: "#e3734f", examine: "Scaled hide over the head and shoulders. Warm in a way you can't quite trust.", value: 400 },
    { id: "ember_coat", name: "Ember-stitched coat", slot: "body", shape: "body", kind: "tunic", color: "#3b3a38", accent: "#f0a050", examine: "Black leather stitched with glowing orange thread.", value: 600 },
    { id: "scorched_trousers", name: "Scorched trousers", slot: "legs", shape: "legs", kind: "trousers", color: "#5a4230", accent: "#3b3a38", examine: "Singed at every hem. Fashionable, in Ashfall.", value: 240 },
    { id: "scorched_cloak", name: "Scorched cloak", slot: "cape", shape: "cape", color: "#8a3f2e", accent: "#f0a050", examine: "A dramatic red cloak burnt ragged at the edge. It has met a dragon.", value: 900 },
  ] },
  // Return of Raria: what the far west wears.
  { region: "raria", shop: "raria_clothier", pieces: [
    { id: "rarian_veil", name: "Rarian veil", slot: "head", shape: "hood", color: "#3b2a52", accent: "#d8d6e4", examine: "A dusk-violet veil with a silver edge, worn by Rarian citizens in the street. It covers the hair; the Law says the hair is nobody's business.", value: 500 },
    { id: "rarian_tabard", name: "Rarian tabard", slot: "body", shape: "body", kind: "tunic", color: "#3b2a52", accent: "#d8d6e4", examine: "A violet tabard with the closed eye in silver on the breast, as every Rarian wears on the Wise Friend's days, which is all of them.", value: 1400 },
    { id: "rarian_skirts", name: "Rarian skirts", slot: "legs", shape: "legs", color: "#2a2238", accent: "#d8d6e4", examine: "Long dusk skirts, silver at the hem, cut to kneel in.", value: 800 },
    { id: "rarian_slippers", name: "Rarian slippers", slot: "feet", shape: "boots", color: "#2a2238", accent: "#d8d6e4", examine: "Soft violet slippers. Raria's streets are swept twice a day.", value: 300 },
    { id: "rarian_mantle", name: "Rarian mantle", slot: "cape", shape: "cape", kind: "eye", color: "#3b2a52", accent: "#d8d6e4", examine: "A violet mantle with the Wise Friend's closed eye in silver on the back. Worn to chapel, which is daily.", value: 1200 },
  ] },
  { region: "fff", shop: "fff_outfitter", pieces: [
    { id: "fff_cap", name: "Federation cap", slot: "head", shape: "hat", color: "#2f7d68", accent: "#d9a93f", examine: "A verdigris cap with a brass FFF pin, worn at whatever angle the wearer likes, which is the point.", value: 400 },
    { id: "fff_tunic", name: "Federation tunic", slot: "body", shape: "body", kind: "tunic", color: "#2f7d68", accent: "#b87333", examine: "A green tunic with copper buttons, none of which match, all of which work.", value: 1200 },
    { id: "fff_trousers", name: "Patched trousers", slot: "legs", shape: "legs", color: "#6b4a2c", accent: "#4fa58a", examine: "Brown trousers patched in verdigris leather at the knee, the Federation's uniform insofar as it has one.", value: 700 },
    { id: "fff_workboots", name: "Federation workboots", slot: "feet", shape: "boots", color: "#4a3a2c", accent: "#b87333", examine: "Copper-toed boots. Two of the artisans have lost a toe to a device; nobody else will.", value: 400 },
  ] },
  { region: "barkreach", shop: "barkreach_outfitter", pieces: [
    { id: "woodsman_cap", name: "Woodsman's cap", slot: "head", shape: "hat", color: "#5a3a2a", accent: "#8a3a2a", examine: "A redwood-dyed leather cap with a greatstag's antler tip for a pin, as BarkReach's loggers wear.", value: 400 },
    { id: "woodsman_jerkin", name: "Woodsman's jerkin", slot: "body", shape: "body", kind: "tunic", color: "#5a3a2a", accent: "#d8cfb6", examine: "A thick leather jerkin, resin-stained, with an axe loop at the hip.", value: 1100 },
    { id: "woodsman_breeches", name: "Woodsman's breeches", slot: "legs", shape: "legs", color: "#4a3a2c", accent: "#8a3a2a", examine: "Heavy breeches for BarkReach's brambles.", value: 700 },
    { id: "woodsman_boots", name: "Woodsman's boots", slot: "feet", shape: "boots", color: "#3a2a1c", accent: "#8a3a2a", examine: "Hobnailed boots. The redwoods are slippery when it rains, which is always.", value: 400 },
  ] },
];
const REGIONAL_ITEMS: Item[] = REGIONAL_CLOTHING.flatMap(set => set.pieces.map((piece): Item => ({
  id: piece.id, name: piece.name, examine: piece.examine, value: piece.value, icon: { shape: piece.shape, color: piece.color, accent: piece.accent, ...(piece.kind ? { kind: piece.kind } : {}) },
  equip: { slot: piece.slot, bonuses: piece.slot === "cape" ? { defence: 1 } : {} },
})));
export const regionalSetOf = (region: string) => REGIONAL_CLOTHING.find(set => set.region === region);

// ---------- Clothing: shirts, tunics, dresses, trousers and skirts (Ribbon & Rye Clothiers on Market Street) ----------
/** [id part, name, colour, trim]: worn for looks (no combat bonuses). */
const SHIRTS = [["linen", "Linen", "#ecebe6", "#b8a88a"], ["sky", "Sky blue", "#8fb2d6", "#ecebe6"], ["scarlet", "Scarlet", "#b0443c", "#e2c46a"], ["moss", "Moss green", "#6f8f5a", "#d8c9a8"],
  ["mustard", "Mustard", "#d6b04a", "#6f5440"], ["charcoal", "Charcoal", "#3b3a40", "#9fabc2"], ["blush", "Blush", "#e7a9b0", "#ecebe6"], ["oak", "Oak brown", "#8a6446", "#e2c46a"]] as const;
const TUNICS = [["forest", "Forest", "#4f7a4a", "#8a6446"], ["royal", "Royal", "#3f5d9a", "#e2c46a"], ["wine", "Wine", "#7a2e3a", "#d8c9a8"], ["sand", "Sand", "#d8c48a", "#8a5a3a"]] as const;
const DRESSES = [["crimson", "Crimson", "#b0443c", "#e2c46a"], ["sapphire", "Sapphire", "#3f5d9a", "#ecebe6"], ["emerald", "Emerald", "#3f7a58", "#e2c46a"], ["lavender", "Lavender", "#b8a6d6", "#ecebe6"],
  ["midnight", "Midnight", "#2a2a44", "#c6bed4"], ["golden", "Golden", "#d6b04a", "#ecebe6"], ["rose", "Rose", "#d98fa6", "#ecebe6"]] as const;
const TROUSERS = [["brown", "Brown", "#7a5a3e", "#5a4230"], ["black", "Black", "#2e2d33", "#555"], ["navy", "Navy", "#2f4266", "#1f2c44"], ["grey", "Grey", "#8a8780", "#6d6b67"], ["olive", "Olive", "#6f7248", "#4f5234"], ["cream", "Cream", "#e6dcc0", "#b8a88a"]] as const;
const SKIRTS = [["red", "Red", "#b0443c", "#ecebe6"], ["blue", "Blue", "#3f5d9a", "#ecebe6"], ["green", "Green", "#4f7a4a", "#e2c46a"], ["black", "Black", "#2e2d33", "#b0443c"], ["plum", "Plum", "#6e4a8a", "#e2c46a"]] as const;
const CLOTHING: Item[] = [
  ...SHIRTS.map(([key, name, color, accent]): Item => ({ id: `${key}_shirt`, name: `${name} shirt`, examine: "A soft shirt with a laced collar.", value: 40, icon: { shape: "body", color, accent, kind: "shirt" }, equip: { slot: "body", bonuses: {} } })),
  ...TUNICS.map(([key, name, color, accent]): Item => ({ id: `${key}_tunic`, name: `${name} tunic`, examine: "A long tunic, belted at the waist.", value: 60, icon: { shape: "body", color, accent, kind: "tunic" }, equip: { slot: "body", bonuses: {} } })),
  ...DRESSES.map(([key, name, color, accent]): Item => ({ id: `${key}_dress`, name: `${name} dress`, examine: "A dress that sweeps the ground.", value: 120, icon: { shape: "body", color, accent, kind: "dress" }, equip: { slot: "body", bonuses: {} } })),
  ...TROUSERS.map(([key, name, color, accent]): Item => ({ id: `${key}_trousers`, name: `${name} trousers`, examine: "Sturdy trousers.", value: 35, icon: { shape: "legs", color, accent, kind: "trousers" }, equip: { slot: "legs", bonuses: {} } })),
  ...SKIRTS.map(([key, name, color, accent]): Item => ({ id: `${key}_skirt`, name: `${name} skirt`, examine: "A skirt that swirls when you turn.", value: 50, icon: { shape: "legs", color, accent, kind: "skirt" }, equip: { slot: "legs", bonuses: {} } })),
];
export const CLOTHIER_STOCK = CLOTHING.map(entry => entry.id);

// ---------- Faith: the Order of the Dawn's weapons, cape and relics ----------
const DAWN_GOLD = "#e2c46a";
const FAITH_GEAR: Item[] = [
  { id: "dawnsteel_sword", name: "Dawnsteel sword", examine: "A knight's sword of the Order of the Dawn. Pale steel, gold at the hilt.", value: 4000, icon: { shape: "sword", color: "#e8e4d6", accent: DAWN_GOLD },
    equip: { slot: "weapon", bonuses: { attack: 22, strength: 20, prayer: 3 }, requires: { attack: 20, prayer: 20 }, speed: 4, holy: true } },
  { id: "vigil_spear", name: "Vigil spear", examine: "Carried on the long night watches of the Order. Its point catches the first light.", value: 9000, icon: { shape: "spear", color: "#e8e4d6", accent: DAWN_GOLD },
    equip: { slot: "weapon", bonuses: { attack: 34, strength: 30, defence: 4, prayer: 4 }, requires: { attack: 30, prayer: 30 }, speed: 5, holy: true } },
  { id: "radiant_greatsword", name: "Radiant greatsword", examine: "Two hands, and a blade that seems to hold the morning in it.", value: 40000, icon: { shape: "greatsword", color: "#f2eedc", accent: DAWN_GOLD },
    equip: { slot: "weapon", bonuses: { attack: 60, strength: 68, prayer: 6 }, requires: { attack: 50, strength: 40, prayer: 45 }, speed: 6, twoHanded: true, holy: true } },
  { id: "sunforged_warhammer", name: "Sunforged warhammer", examine: "Forged at dawn, quenched in holy water. The undead hate the sound of it.", value: 90000, icon: { shape: "warhammer", color: "#f2e3b0", accent: "#b0443c" },
    equip: { slot: "weapon", bonuses: { attack: 70, strength: 86, prayer: 8 }, requires: { attack: 60, strength: 55, prayer: 60 }, speed: 6, twoHanded: true, holy: true } },
  { id: "acolyte_staff", name: "Acolyte's staff", examine: "A novice's staff of the Order, topped with a little sunburst.", value: 2500, icon: { shape: "staff", color: "#d8c9a8", accent: DAWN_GOLD },
    equip: { slot: "weapon", bonuses: { attack: 3, strength: 4, magic: 10, prayer: 3 }, requires: { magic: 15, prayer: 15 }, speed: 5, staff: true, holy: true } },
  { id: "dawn_staff", name: "Dawn staff", examine: "A chaplain's staff. Spells cast through it burn the dead.", value: 15000, icon: { shape: "staff", color: "#efe6c8", accent: DAWN_GOLD },
    equip: { slot: "weapon", bonuses: { attack: 6, strength: 8, magic: 20, prayer: 5 }, requires: { magic: 40, prayer: 40 }, speed: 5, staff: true, holy: true } },
  { id: "first_light_staff", name: "Staff of the First Light", examine: "The Grandmaster's own design. It glows faintly, even in daylight.", value: 70000, icon: { shape: "staff", color: "#fff6d8", accent: "#f2e28f" },
    equip: { slot: "weapon", bonuses: { attack: 10, strength: 12, magic: 32, prayer: 8 }, requires: { magic: 65, prayer: 70 }, speed: 5, staff: true, holy: true } },
  { id: "dawn_cape", name: "Cape of the Dawn", examine: "White and gold: a knight of the Order of the Dawn.", value: 0, tradeable: false, icon: { shape: "cape", color: "#ecebe6", accent: DAWN_GOLD, kind: "cross" },
    equip: { slot: "cape", bonuses: { defence: 3, prayer: 6 } } },
  // Dawnplate: the Order's own armour, gold with white trim, for knights who've earned it (Defence 70, Faith 60).
  { id: "dawnplate_helm", name: "Dawnplate helm", examine: "Gold, with a white crest. The Order's finest helm.", value: 32000, icon: { shape: "helm", color: "#d9b866", accent: "#f7f5f0" },
    equip: { slot: "head", bonuses: { defence: 47, magic: -3, prayer: 4 }, requires: { defence: 70, prayer: 60 } } },
  { id: "dawnplate_cuirass", name: "Dawnplate cuirass", examine: "A breastplate of gold, trimmed in white. It seems to catch the first light even at dusk.", value: 96000, icon: { shape: "body", color: "#d9b866", accent: "#f7f5f0" },
    equip: { slot: "body", bonuses: { defence: 190, magic: -12, prayer: 6 }, requires: { defence: 70, prayer: 60 } } },
  { id: "dawnplate_greaves", name: "Dawnplate greaves", examine: "Gold greaves, white at the knee.", value: 48000, icon: { shape: "legs", color: "#d9b866", accent: "#f7f5f0" },
    equip: { slot: "legs", bonuses: { defence: 102, magic: -7, prayer: 4 }, requires: { defence: 70, prayer: 60 } } },
  { id: "dawnplate_gauntlets", name: "Dawnplate gauntlets", examine: "Gold gauntlets, white at the cuff.", value: 24000, icon: { shape: "gloves", color: "#d9b866", accent: "#f7f5f0" },
    equip: { slot: "hands", bonuses: { attack: 4, defence: 26, prayer: 3 }, requires: { defence: 70, prayer: 60 } } },
  { id: "dawnplate_boots", name: "Dawnplate boots", examine: "Gold boots that ring on stone.", value: 24000, icon: { shape: "boots", color: "#d9b866", accent: "#f7f5f0" },
    equip: { slot: "feet", bonuses: { defence: 26, prayer: 3 }, requires: { defence: 70, prayer: 60 } } },
  { id: "dawnplate_shield", name: "Dawnplate shield", examine: "A gold heater shield with the Order's white sun.", value: 48000, icon: { shape: "shield", color: "#d9b866", accent: "#f7f5f0" },
    equip: { slot: "shield", bonuses: { defence: 112, prayer: 4 }, requires: { defence: 70, prayer: 60 } } },
  { id: "dawnstone_shard", name: "Dawnstone shard", examine: "A shard of the Order's lost relic. Warm, like a stone left in the sun.", value: 0, tradeable: false, icon: { shape: "gem", color: "#f2e3b0", accent: DAWN_GOLD } },
  { id: "dawnstone", name: "Dawnstone", examine: "The Order of the Dawn's relic, whole again and blessed.", value: 0, tradeable: false, icon: { shape: "orb", color: "#fff2c0" } },
];
/** What the Order's armoury sells: the first weapons once you've kept the Dawn Vigil, the rest after Light in the Greyhorn. */
export const ARMOURY_FIRST = ["dawnsteel_sword", "vigil_spear", "acolyte_staff", "acolyte_hood", "acolyte_vestment", "acolyte_leggings", "acolyte_gloves", "acolyte_sandals"] as const;
export const ARMOURY_LATER = ["radiant_greatsword", "sunforged_warhammer", "dawn_staff", "first_light_staff", "vigil_helm", "vigil_hauberk", "vigil_greaves", "vigil_gauntlets", "vigil_boots", "vigil_shield"] as const;
/** The Order's lesser armour: an acolyte's vestments (cloth, cheap, Faith 10) and the Vigil's mail (Defence 30, Faith 30), for those not yet fit for Dawnplate. */
const ORDER_ARMOUR: Item[] = [
  { id: "acolyte_hood", name: "Acolyte's hood", examine: "White linen, a gold sun stitched at the brow. The Order's novices wear it on the night watches.", value: 300, icon: { shape: "hood", color: "#efe9d8", accent: DAWN_GOLD }, equip: { slot: "head", bonuses: { defence: 4, prayer: 2 }, requires: { prayer: 10 } } },
  { id: "acolyte_vestment", name: "Acolyte's vestment", examine: "A quilted white vestment with a gold hem.", value: 900, icon: { shape: "body", color: "#efe9d8", accent: DAWN_GOLD, kind: "robe" }, equip: { slot: "body", bonuses: { defence: 11, prayer: 3 }, requires: { prayer: 10 } } },
  { id: "acolyte_leggings", name: "Acolyte's leggings", examine: "White linen leggings, gold at the hem.", value: 600, icon: { shape: "legs", color: "#efe9d8", accent: DAWN_GOLD }, equip: { slot: "legs", bonuses: { defence: 7, prayer: 2 }, requires: { prayer: 10 } } },
  { id: "acolyte_gloves", name: "Acolyte's gloves", examine: "Thin white gloves.", value: 200, icon: { shape: "gloves", color: "#efe9d8", accent: DAWN_GOLD }, equip: { slot: "hands", bonuses: { defence: 2, prayer: 1 }, requires: { prayer: 10 } } },
  { id: "acolyte_sandals", name: "Acolyte's sandals", examine: "Sandals for a chapel floor.", value: 200, icon: { shape: "boots", color: "#d8cfb6", accent: DAWN_GOLD }, equip: { slot: "feet", bonuses: { defence: 2, prayer: 1 }, requires: { prayer: 10 } } },
  { id: "vigil_helm", name: "Vigil helm", examine: "Pale steel with a gold sun on the brow: the helm of the Order's night watch.", value: 3200, icon: { shape: "helm", color: "#cfd3d8", accent: DAWN_GOLD }, equip: { slot: "head", bonuses: { defence: 17, magic: -2, prayer: 3 }, requires: { defence: 30, prayer: 30 } } },
  { id: "vigil_hauberk", name: "Vigil hauberk", examine: "A mail shirt of pale steel, blessed at the Dawnhold altar.", value: 9600, icon: { shape: "body", color: "#cfd3d8", accent: DAWN_GOLD }, equip: { slot: "body", bonuses: { defence: 52, magic: -5, prayer: 4 }, requires: { defence: 30, prayer: 30 } } },
  { id: "vigil_greaves", name: "Vigil greaves", examine: "Mail greaves of pale steel.", value: 4800, icon: { shape: "legs", color: "#cfd3d8", accent: DAWN_GOLD }, equip: { slot: "legs", bonuses: { defence: 31, magic: -3, prayer: 3 }, requires: { defence: 30, prayer: 30 } } },
  { id: "vigil_gauntlets", name: "Vigil gauntlets", examine: "Mail gauntlets, gold at the cuff.", value: 2400, icon: { shape: "gloves", color: "#cfd3d8", accent: DAWN_GOLD }, equip: { slot: "hands", bonuses: { attack: 2, defence: 8, prayer: 2 }, requires: { defence: 30, prayer: 30 } } },
  { id: "vigil_boots", name: "Vigil boots", examine: "Steel-toed boots for the long watch.", value: 2400, icon: { shape: "boots", color: "#cfd3d8", accent: DAWN_GOLD }, equip: { slot: "feet", bonuses: { defence: 8, prayer: 2 }, requires: { defence: 30, prayer: 30 } } },
  { id: "vigil_shield", name: "Vigil Aegis", examine: "The Vigil Aegis: a tall pale-steel shield with the Order's sun blazed across it, carried by those who keep the watch. There is only one pattern of it, and every one is blessed at the Dawnhold altar by name.", value: 4800, icon: { shape: "aegis", color: "#cfd3d8", accent: DAWN_GOLD }, equip: { slot: "shield", bonuses: { defence: 34, prayer: 3 }, requires: { defence: 30, prayer: 30 } } },
];
/** Dawnplate, sold once the quest that awards each piece is done. */
export const DAWNPLATE_QUEST: Record<string, string> = { dawnplate_greaves: "pilgrims_road", dawnplate_boots: "pilgrims_road", dawnplate_helm: "restless_crypt",
  dawnplate_shield: "restless_crypt", dawnplate_gauntlets: "restless_crypt", dawnplate_cuirass: "dawn_against_hollow" };

/**
 * Craftwork's woodcarving. A carving gouge on two logs carves a figure from them, each wood its own, to set down
 * where you stand: for a while everyone fighting near it (four tiles) is helped the way that wood helps, then it
 * crumbles away. The effects of different carvings add up; two of the same kind don't. You can keep three set down
 * at once (a fourth crumbles the oldest).
 * - regen: hitpoints come back this many times as fast; energy: run energy comes back this many times as fast;
 * - taken: this share less damage taken; dealt: this share more damage dealt (and its accuracy); magic: this share more
 *   with spells; accuracy: this share more accurate; faith: the Law's commandments drain this share slower;
 * - foes: creatures' blows land this share less often.
 */
export type CarvingEffect = { regen?: number; energy?: number; taken?: number; dealt?: number; magic?: number; accuracy?: number; faith?: number; foes?: number };
export const CARVINGS = [
  { id: "carving_hearth", log: "logs", name: "Hearthwood figure", level: 3, xp: 22, ticks: 120, color: "#b49a80", effect: { regen: 2 }, text: "wounds close twice as fast" },
  { id: "carving_oak", log: "oak_logs", name: "Oak bulwark", level: 15, xp: 42, ticks: 150, color: "#b59c7d", effect: { taken: 0.12 }, text: "12% less damage taken" },
  { id: "carving_palm", log: "palm_logs", name: "Palm wellspring", level: 25, xp: 60, ticks: 160, color: "#c9a874", effect: { energy: 2.5, regen: 1.5 }, text: "run energy and hitpoints come back faster" },
  { id: "carving_willow", log: "willow_logs", name: "Willow vigil", level: 30, xp: 72, ticks: 180, color: "#a8a070", effect: { faith: 0.4 }, text: "Faith drains 40% slower" },
  { id: "carving_pine", log: "pine_logs", name: "Pine sentinel", level: 35, xp: 84, ticks: 180, color: "#8e7a58", effect: { accuracy: 0.12 }, text: "12% more accurate" },
  { id: "carving_maple", log: "maple_logs", name: "Maple fury", level: 45, xp: 104, ticks: 200, color: "#b97a4a", effect: { dealt: 0.1 }, text: "10% more damage dealt" },
  { id: "carving_redwood", log: "redwood_logs", name: "Redwood hearth", level: 52, xp: 128, ticks: 220, color: "#9a3e2e", effect: { regen: 3, taken: 0.06 }, text: "wounds close three times as fast, and 6% less damage taken" },
  { id: "carving_deadwood", log: "deadwood_logs", name: "Deadwood dread", level: 55, xp: 138, ticks: 220, color: "#6e6a62", effect: { foes: 0.2 }, text: "creatures' blows land 20% less often" },
  { id: "carving_yew", log: "yew_logs", name: "Yew warden", level: 60, xp: 165, ticks: 240, color: "#8a5a3a", effect: { taken: 0.2 }, text: "20% less damage taken" },
  { id: "carving_ironbark", log: "ironbark_logs", name: "Ironbark rampart", level: 68, xp: 215, ticks: 280, color: "#7a7d80", effect: { taken: 0.22, dealt: 0.05 }, text: "22% less damage taken, 5% more dealt" },
  { id: "carving_ash", log: "ash_logs", name: "Ashwood seer", level: 72, xp: 240, ticks: 300, color: "#c9c2b4", effect: { faith: 0.3, magic: 0.15 }, text: "Faith drains 30% slower, 15% more damage with spells" },
] as const satisfies readonly { id: string; log: string; name: string; level: number; xp: number; ticks: number; color: string; effect: CarvingEffect; text: string }[];
export type CarvingId = typeof CARVINGS[number]["id"];
/** How far a carving's help reaches (tiles), and how many you can keep set down. */
export const CARVING_REACH = 4, CARVINGS_AT_ONCE = 3;
const CARVING_ITEMS: Item[] = [
  { id: "carving_gouge", name: "Carving gouge", examine: "A curved woodcarver's gouge. Use it on logs to carve them (Craftwork).", value: 24, icon: { shape: "gouge", color: "#a9acb0" } },
  ...CARVINGS.map(c => ({ id: c.id, name: c.name, examine: `A figure carved from ${c.log.replace("_logs", "").replace(/^logs$/, "plain")} wood. Set it down and, near it, ${c.text}. It lasts about ${Math.round(c.ticks * 0.6 / 60 * 10) / 10} minutes, then crumbles.`, value: Math.round(15 + c.level * 3), icon: { shape: "carving" as const, color: c.color, accent: shadeColor(c.color) } })),
];
function shadeColor(hex: string) { const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(v * 0.68))); return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, "0")).join("")}`; }
/** The bars' drinks and stew, and the quiet traders' Stealth gear (bars.ts). */
/** The drinks (and the stew every barkeep keeps hot). A drink heals a little and lends a skill a point or two. */
const BAR_ITEMS: Item[] = [
  { id: "ale", name: "Ale", examine: "A tankard of the Realm's ordinary ale. Heals 2, and +1 Strength for a while.", value: 4, heal: 2, food: { strength: 1 }, drink: true, icon: { shape: "mug", color: "#c98a3a", accent: "#f2ead6" } },
  { id: "barkeeps_stew", name: "Barkeep's stew", examine: "Whatever was going, stewed all day. Heals 12.", value: 30, heal: 12, icon: { shape: "pot", color: "#8a5a3a", accent: "#c9a074" } },
  { id: "sleepy_stout", name: "Sleepy stout", examine: "The Sleepy Friend's own: dark, thick and dangerous before noon. Heals 4, +2 Strength.", value: 12, heal: 4, food: { strength: 2 }, drink: true, icon: { shape: "mug", color: "#3b2a1e", accent: "#e8dcc4" } },
  { id: "lawful_beer", name: "Lawful small beer", examine: "The Seventh Prayer's: one measure, brewed to the Law's strength exactly. Heals 3, +2 Defence.", value: 12, heal: 3, food: { defence: 2 }, drink: true, icon: { shape: "mug", color: "#d9c27a", accent: "#f7f2e2" } },
  { id: "madder_wine", name: "Madder wine", examine: "The Crooked Vat's: red as the vats, and it goes to your head. Heals 4, +2 Magic.", value: 14, heal: 4, food: { magic: 2 }, drink: true, icon: { shape: "bottle", color: "#8a2a2a", accent: "#d9b84a" } },
  { id: "hounds_bite", name: "Hound's bite", examine: "The Obedient Hound's whiskey, smoked over pine. Heals 3, +2 Attack.", value: 14, heal: 3, food: { attack: 2 }, drink: true, icon: { shape: "bottle", color: "#a8742e", accent: "#4a3560" } },
  { id: "cairn_porter", name: "Cairn porter", examine: "The Stone Kettle's porter, for miners. Heals 4, +3 Mining.", value: 12, heal: 4, food: { mining: 3 }, drink: true, icon: { shape: "mug", color: "#4a3a2c", accent: "#e8dcc4" } },
  { id: "free_cider", name: "Free cider", examine: "The Free Pour's cider: the Federation insists it's free; the barkeep insists on payment. Heals 4, +2 Ranged.", value: 12, heal: 4, food: { ranged: 2 }, drink: true, icon: { shape: "bottle", color: "#c9b04a", accent: "#2f7d68" } },
  // The quiet traders' goods.
  { id: "sleight_gloves", name: "Sleight gloves", examine: "Thin black gloves with nothing in the fingertips. Pickpocketing in them is a little surer.", value: 1800, icon: { shape: "gloves", color: "#2a2830", accent: "#5a566a" },
    equip: { slot: "hands", bonuses: { attack: 1, defence: 1 }, requires: { thieving: 20 } } },
  { id: "softsole_boots", name: "Softsole boots", examine: "Boots that make no sound at all. Sneaking in them costs much less run energy.", value: 2600, icon: { shape: "boots", color: "#3a3640", accent: "#6a6680" },
    equip: { slot: "feet", bonuses: { defence: 2 }, requires: { thieving: 30 } } },
];

/** A bar's shop: the house drink and ale, stew and bread, and potions for the road (bars.ts has the bars). */
const barStock = (drink: string) => [drink, "ale", "barkeeps_stew", "bread", "cake", "cooked_meat", "healing_tonic", "energy_draught", "antidote", "strength_potion", "defence_potion"];

/**
 * Dyemoor's dyes. A pot of dye used on cloth or leather clothing (a hood, a hat, a coat, a tunic, trousers or a skirt,
 * gloves, boots, a cape) dyes it: the same piece, in the dye's colour, its trim kept. Lye washes the dye out again.
 * A dyed piece is an item of its own, `<piece>~<dye>`, made on demand by `item()` (so it can be worn, banked, traded
 * and saved like any other).
 */
export const DYES = [
  { id: "madder", name: "Madder red", color: "#a8403a" }, { id: "woad", name: "Woad blue", color: "#4a6aa8" }, { id: "indigo", name: "Indigo", color: "#2f3a6e" },
  { id: "weld", name: "Weld yellow", color: "#d9b84a" }, { id: "saffron", name: "Saffron", color: "#d07a2a" }, { id: "rose", name: "Rose", color: "#d48a9a" },
  { id: "lichen", name: "Lichen purple", color: "#6e4a8a" }, { id: "moss", name: "Moss green", color: "#4f7a4a" }, { id: "teal", name: "Kingfisher teal", color: "#3f8a8a" },
  { id: "walnut", name: "Walnut brown", color: "#6b4a2c" }, { id: "sable", name: "Sable black", color: "#2a2830" }, { id: "chalk", name: "Chalk white", color: "#ece6d8" },
] as const;
export type DyeId = typeof DYES[number]["id"];
const DYE_POTS: Item[] = [
  ...DYES.map(dye => ({ id: `dye_${dye.id}`, name: `Pot of ${dye.name.toLowerCase()} dye`, examine: `${dye.name}, from the Dyeworks at Dyemoor. Use it on cloth or leather clothing to dye it.`, value: 60, icon: { shape: "pot" as const, color: dye.color, accent: "#6b4a2c" } })),
  { id: "dye_lye", name: "Pot of lye", examine: "Washes the dye out of anything you've dyed, back to the colour it was made in.", value: 30, icon: { shape: "pot", color: "#dcd8c8", accent: "#6b4a2c" } },
];
/** Whether a piece of clothing can be dyed: cloth or leather worn on the head, body, legs, hands, feet or back (not metal, not a mastery cape). */
const DYE_SHAPES = new Set<IconShape>(["hood", "hat", "body", "legs", "gloves", "boots", "cape", "bracer"]);
export function dyeable(id: string): boolean {
  const base = baseOf(id), found = ITEM_MAP.get(base);
  if (!found?.equip || !DYE_SHAPES.has(found.icon.shape) || found.mastery || ["quiver", "satchel"].includes(found.icon.shape)) return false;
  if (METALS.some(metal => base.startsWith(`${metal.id}_`)) || /_(plate|cuirass|chainbody|helm|greaves)$|oath|knight|paladin|hauberk|_mail|dawnplate|vigil|heartguard/.test(base)) return false;
  return true;
}
/** The undyed piece a (maybe dyed) item is. */
export const baseOf = (id: string) => id.includes("~") ? id.slice(0, id.indexOf("~")) : id;
/** The dye on an item, if it's been dyed. */
export const dyeOf = (id: string) => id.includes("~") ? DYES.find(dye => dye.id === id.slice(id.indexOf("~") + 1)) ?? null : null;
const DYED = new Map<string, Item>();
function dyedItem(id: string): Item | undefined {
  const known = DYED.get(id);
  if (known) return known;
  const tilde = id.indexOf("~");
  if (tilde < 0) return undefined;
  const base = ITEM_MAP.get(id.slice(0, tilde)), dye = DYES.find(entry => entry.id === id.slice(tilde + 1));
  if (!base || !dye || !dyeable(base.id)) return undefined;
  const made: Item = { ...base, id, name: `${base.name} (${dye.name.toLowerCase()})`, examine: `${base.examine} Dyed ${dye.name.toLowerCase()} at Dyemoor.`, icon: { ...base.icon, color: dye.color } };
  DYED.set(id, made);
  return made;
}
export const ITEM_LIST: readonly Item[] = Object.freeze([...ITEMS, ...DYE_POTS, ...CARVING_ITEMS, ...BAR_ITEMS, ...metalGear(), ...OTHER_GEAR, ...RANGED_GEAR, ...OTHER_ITEMS, ...TAILORING, ...CLOTHING, ...FAITH_GEAR, ...ORDER_ARMOUR, ...orderGear(), ...slayerGear(), ...heartguardGear(), ...REGIONAL_ITEMS, ...APOTHECARY_ITEMS, ...factionGear()]);
const ITEM_MAP = new Map(ITEM_LIST.map(item => [item.id, item]));
export function item(id: string): Item {
  const found = ITEM_MAP.get(id) ?? dyedItem(id);
  if (!found) throw new Error(`Unknown item ${id}`);
  return found;
}
export const isItem = (id: unknown): id is string => typeof id === "string" && (ITEM_MAP.has(id) || !!dyedItem(id));

// ---------- Gathering ----------
export type TreeKind = "tree" | "oak" | "willow" | "maple" | "yew" | "ashwood" | "palm" | "pine" | "deadwood" | "redwood" | "ironbark";
export const TREES: Record<TreeKind, { name: string; level: number; xp: number; log: string; low: number; high: number; deplete: number; respawn: number }> = {
  tree: { name: "Tree", level: 1, xp: 25, log: "logs", low: 64, high: 200, deplete: 1, respawn: 12 },
  oak: { name: "Oak tree", level: 15, xp: 37.5, log: "oak_logs", low: 32, high: 100, deplete: 1 / 8, respawn: 14 },
  willow: { name: "Willow tree", level: 30, xp: 67.5, log: "willow_logs", low: 16, high: 50, deplete: 1 / 8, respawn: 14 },
  maple: { name: "Maple tree", level: 45, xp: 100, log: "maple_logs", low: 8, high: 25, deplete: 1 / 8, respawn: 50 },
  yew: { name: "Yew tree", level: 60, xp: 175, log: "yew_logs", low: 4, high: 12, deplete: 1 / 8, respawn: 100 },
  ashwood: { name: "Ashwood tree", level: 70, xp: 250, log: "ash_logs", low: 3, high: 9, deplete: 1 / 10, respawn: 150 },
  // The wider world's trees: every tree in the Realm can be cut and burnt.
  palm: { name: "Palm tree", level: 25, xp: 55, log: "palm_logs", low: 20, high: 60, deplete: 1 / 8, respawn: 30 },
  pine: { name: "Pine tree", level: 35, xp: 80, log: "pine_logs", low: 14, high: 45, deplete: 1 / 8, respawn: 40 },
  deadwood: { name: "Dead tree", level: 55, xp: 150, log: "deadwood_logs", low: 6, high: 18, deplete: 1 / 8, respawn: 90 },
  // BarkReach (Return of Raria): red-hearted redwoods and the grey ironbarks an axe bounces off.
  redwood: { name: "Redwood tree", level: 52, xp: 135, log: "redwood_logs", low: 6, high: 20, deplete: 1 / 8, respawn: 80 },
  ironbark: { name: "Ironbark tree", level: 68, xp: 230, log: "ironbark_logs", low: 3, high: 10, deplete: 1 / 10, respawn: 140 },
};
export type RockKind = "pewter" | "clay" | "blackiron" | "inkcoal" | "moonsilver" | "glimmer" | "rarite" | "gem" | "sigil";
export const ROCKS: Record<RockKind, { name: string; level: number; xp: number; ore: string; low: number; high: number; respawn: number; color: string }> = {
  sigil: { name: "Sigil stone", level: 1, xp: 5, ore: "sigil_stone", low: 200, high: 400, respawn: 0, color: "#d9d4e6" },
  clay: { name: "Clay rocks", level: 1, xp: 5, ore: "clay", low: 128, high: 400, respawn: 2, color: "#d7c3a5" },
  pewter: { name: "Pewter rocks", level: 1, xp: 17.5, ore: "pewter_ore", low: 100, high: 350, respawn: 4, color: "#a4a7aa" },
  blackiron: { name: "Blackiron rocks", level: 15, xp: 35, ore: "blackiron_ore", low: 96, high: 350, respawn: 9, color: "#5f5e66" },
  inkcoal: { name: "Inkcoal rocks", level: 30, xp: 50, ore: "inkcoal", low: 16, high: 100, respawn: 40, color: "#3b3a38" },
  gem: { name: "Gem rocks", level: 40, xp: 65, ore: "rough_moonstone", low: 28, high: 70, respawn: 60, color: "#9fabc2" },
  moonsilver: { name: "Moonsilver rocks", level: 55, xp: 80, ore: "moonsilver_ore", low: 4, high: 50, respawn: 100, color: "#7d8fb8" },
  glimmer: { name: "Glimmer rocks", level: 70, xp: 95, ore: "glimmer_ore", low: 2, high: 25, respawn: 200, color: "#d9cf9a" },
  rarite: { name: "Rarite rocks", level: 85, xp: 125, ore: "rarite_ore", low: 1, high: 18, respawn: 400, color: "#d8b6b4" },
};
export type SpotKind = "net" | "bait" | "lure" | "cage" | "harpoon" | "deep";
export type Catch = { fish: string; level: number; xp: number; low: number; high: number };
export const FISHING_SPOTS: Record<SpotKind, { name: string; action: string; tool: string; bait?: string; catches: readonly Catch[] }> = {
  net: { name: "Fishing spot", action: "Net", tool: "small_net", catches: [{ fish: "raw_minnows", level: 1, xp: 10, low: 48, high: 256 }] },
  bait: { name: "Fishing spot", action: "Bait", tool: "fishing_rod", bait: "fishing_bait", catches: [
    { fish: "raw_carp", level: 10, xp: 30, low: 24, high: 128 }, { fish: "raw_perch", level: 5, xp: 20, low: 32, high: 192 }] },
  lure: { name: "Rod fishing spot", action: "Lure", tool: "fly_rod", bait: "feather", catches: [
    { fish: "raw_grayling", level: 30, xp: 70, low: 16, high: 96 }, { fish: "raw_char", level: 20, xp: 50, low: 32, high: 192 }] },
  cage: { name: "Fishing spot", action: "Cage", tool: "crab_pot", catches: [{ fish: "raw_inkcrab", level: 40, xp: 90, low: 6, high: 95 }] },
  harpoon: { name: "Fishing spot", action: "Harpoon", tool: "harpoon", catches: [{ fish: "raw_sailfish", level: 50, xp: 100, low: 4, high: 48 }] },
  deep: { name: "Deep fishing spot", action: "Harpoon", tool: "harpoon", catches: [{ fish: "raw_inkshark", level: 76, xp: 110, low: 3, high: 40 }] },
};
/** Cooking: level, XP and the level at which you stop burning (on a range). */
export const COOKING: Record<string, { cooked: string; level: number; xp: number; stopBurn: number }> = {
  raw_minnows: { cooked: "minnows", level: 1, xp: 30, stopBurn: 12 },
  raw_chicken: { cooked: "cooked_chicken", level: 1, xp: 30, stopBurn: 14 },
  raw_beef: { cooked: "cooked_meat", level: 1, xp: 30, stopBurn: 14 },
  raw_perch: { cooked: "perch", level: 1, xp: 40, stopBurn: 22 },
  raw_carp: { cooked: "carp", level: 5, xp: 50, stopBurn: 32 },
  raw_char: { cooked: "char", level: 15, xp: 70, stopBurn: 44 },
  raw_grayling: { cooked: "grayling", level: 25, xp: 90, stopBurn: 52 },
  raw_inkcrab: { cooked: "inkcrab", level: 40, xp: 120, stopBurn: 74 },
  raw_sailfish: { cooked: "sailfish", level: 45, xp: 140, stopBurn: 86 },
  raw_inkshark: { cooked: "inkshark", level: 80, xp: 210, stopBurn: 99 },
};
export const FIREMAKING: Record<string, { level: number; xp: number }> = {
  logs: { level: 1, xp: 40 }, oak_logs: { level: 15, xp: 60 }, willow_logs: { level: 30, xp: 90 },
  maple_logs: { level: 45, xp: 135 }, yew_logs: { level: 60, xp: 202.5 }, ash_logs: { level: 70, xp: 280 },
  palm_logs: { level: 25, xp: 80 }, pine_logs: { level: 35, xp: 110 }, deadwood_logs: { level: 55, xp: 180 }, redwood_logs: { level: 52, xp: 170 }, ironbark_logs: { level: 68, xp: 260 },
};
/** Smelting: ores in, bar out. Blackiron has a 50% success rate without a ring (like the classic furnace). */
export const SMELTING: Record<MetalId, { level: number; xp: number; ores: Readonly<Record<string, number>>; chance?: number }> = {
  pewter: { level: 1, xp: 8, ores: { pewter_ore: 1 } },
  blackiron: { level: 15, xp: 13, ores: { blackiron_ore: 1 }, chance: 0.6 },
  ashsteel: { level: 30, xp: 18, ores: { blackiron_ore: 1, inkcoal: 1 } },
  moonsilver: { level: 50, xp: 30, ores: { moonsilver_ore: 1, inkcoal: 2 } },
  glimmer: { level: 70, xp: 38, ores: { glimmer_ore: 1, inkcoal: 3 } },
  rarite: { level: 85, xp: 50, ores: { rarite_ore: 1, inkcoal: 4 } },
  frostsilver: { level: 86, xp: 60, ores: { frost_shard: 1, inkcoal: 4 } },
  gloomsteel: { level: 88, xp: 70, ores: { gloom_shard: 1, inkcoal: 4 } },
  wyrmscale: { level: 90, xp: 80, ores: { wyrm_scale: 1, inkcoal: 5 } },
  hollowsteel: { level: 92, xp: 88, ores: { hollow_essence: 1, inkcoal: 5 } },
  cindersteel: { level: 94, xp: 96, ores: { cinder_core: 1, inkcoal: 6 } },
  ashenheart: { level: 96, xp: 110, ores: { colossus_ember: 1, inkcoal: 6 } },
};
export const SMITH_XP: Record<MetalId, number> = { pewter: 12.5, blackiron: 25, ashsteel: 37.5, moonsilver: 50, glimmer: 62.5, rarite: 75,
  frostsilver: 85, gloomsteel: 95, wyrmscale: 105, hollowsteel: 115, cindersteel: 125, ashenheart: 140 };
/** The Smithing level for something `offset` levels over a metal's base (forged metals squeeze their pieces into the last few levels). */
export function metalLevel(metal: MetalId, offset: number) {
  const forged = METALS.find(entry => entry.id === metal)!.tier > 6;
  return Math.min(99, SMITHING_BASE[metal] + Math.round(offset * (forged ? 0.25 : 1)));
}
export function smithLevel(metal: MetalId, piece: SmithPiece) {
  return metalLevel(metal, SMITH_PIECES.find(entry => entry.piece === piece)!.offset);
}
export const CRAFTING = [
  { product: "leather_gloves", level: 1, xp: 13.8, leather: 1 },
  { product: "leather_boots", level: 7, xp: 16.25, leather: 1 },
  { product: "leather_hood", level: 9, xp: 18.5, leather: 1 },
  { product: "leather_bracers", level: 11, xp: 22, leather: 1 },
  { product: "leather_jerkin", level: 14, xp: 25, leather: 1 },
  { product: "leather_leggings", level: 18, xp: 27, leather: 1 },
  { product: "inkcoal_satchel", level: 28, xp: 65, leather: 3 },
  { product: "drakehide_bracers", level: 57, xp: 62, leather: 1, hide: "drakehide" },
  { product: "drakehide_chaps", level: 60, xp: 124, leather: 2, hide: "drakehide" },
  { product: "drakehide_vest", level: 63, xp: 186, leather: 3, hide: "drakehide" },
] as { product: string; level: number; xp: number; leather: number; hide?: string }[];
/** Fletching: a knife on logs makes arrow shafts or a bow; shafts and feathers make headless arrows; heads finish them. */
export const FLETCH_BOWS = [
  { log: "logs", bow: "shortbow", level: 5, xp: 5 }, { log: "oak_logs", bow: "oak_bow", level: 20, xp: 16.5 },
  { log: "willow_logs", bow: "willow_bow", level: 35, xp: 33 }, { log: "maple_logs", bow: "maple_bow", level: 50, xp: 50 },
  { log: "yew_logs", bow: "yew_bow", level: 65, xp: 67.5 }, { log: "ash_logs", bow: "ashwood_bow", level: 80, xp: 83 },
  { log: "palm_logs", bow: "palm_bow", level: 40, xp: 40 }, { log: "pine_logs", bow: "pine_bow", level: 52, xp: 55 },
  { log: "redwood_logs", bow: "redwood_bow", level: 70, xp: 95 }, { log: "ironbark_logs", bow: "ironbark_bow", level: 85, xp: 125 },
] as const;
/** Wands: a magic weapon fletched from a log that holds a charge (deadwood). One-handed, a staff for autocasting, no sigils of its own. */
export const FLETCH_WANDS = [{ log: "deadwood_logs", wand: "deadwood_wand", level: 58, xp: 70 }] as const;
/** Arrow tiers: Fletching level and XP per arrow. Arrowheads come from the anvil (15 per bar). */
export const FLETCH_ARROWS: Record<MetalId, { level: number; xp: number }> = {
  pewter: { level: 1, xp: 1.3 }, blackiron: { level: 15, xp: 2.5 }, ashsteel: { level: 30, xp: 5 }, moonsilver: { level: 45, xp: 7.5 }, glimmer: { level: 60, xp: 10 }, rarite: { level: 75, xp: 12.5 },
  frostsilver: { level: 80, xp: 15 }, gloomsteel: { level: 84, xp: 17.5 }, wyrmscale: { level: 88, xp: 20 }, hollowsteel: { level: 91, xp: 22 }, cindersteel: { level: 93, xp: 24 }, ashenheart: { level: 95, xp: 27 },
};
/** Sigilcraft: the altar for each sigil, the level it needs and XP per stone. Higher levels press more sigils per stone. */
export const SIGILCRAFT = [
  { sigil: "breeze_sigil", level: 1, xp: 5 }, { sigil: "thought_sigil", level: 2, xp: 5.5 }, { sigil: "tide_sigil", level: 5, xp: 6 },
  { sigil: "stone_sigil", level: 9, xp: 6.5 }, { sigil: "ember_sigil", level: 14, xp: 7 }, { sigil: "shade_sigil", level: 20, xp: 7.5 },
  { sigil: "star_sigil", level: 27, xp: 8 }, { sigil: "storm_sigil", level: 35, xp: 8.5 }, { sigil: "bloom_sigil", level: 44, xp: 9 },
  { sigil: "law_sigil", level: 38, xp: 8.7 }, { sigil: "dusk_sigil", level: 52, xp: 9.3 }, { sigil: "crown_sigil", level: 60, xp: 9.6 },
  { sigil: "path_sigil", level: 54, xp: 9.5 }, { sigil: "hollow_sigil", level: 65, xp: 10.5 },
] as const;
/** Sigils per stone at your Sigilcraft level: one more for every 11 levels past the altar's. */
export const sigilsPerStone = (level: number, needed: number) => Math.min(6, 1 + Math.floor(Math.max(0, level - needed) / 11));
/** Staffs that stand in for a sigil. */
export const STAFF_SIGILS: Record<string, string> = { breeze_staff: "breeze_sigil", tide_staff: "tide_sigil", stone_staff: "stone_sigil", ember_staff: "ember_sigil" };
export const GEM_CUTTING: Record<string, { cut: string; level: number; xp: number }> = {
  rough_moonstone: { cut: "moonstone", level: 20, xp: 50 },
  rough_sagestone: { cut: "sagestone", level: 27, xp: 67.5 },
  rough_rosestone: { cut: "rosestone", level: 34, xp: 85 },
};

// ---------- Magic and prayer ----------
export type SpellKind = "strike" | "bolt" | "blast" | "curse" | "bind" | "teleport" | "alchemy" | "superheat" | "grab" | "enchant" | "bloom" | "ward" | "smite" | "mend" | "aegis" | "bless";
export type SpellTarget = "monster" | "item" | "ground" | "self";
export type Spell = {
  id: string; name: string; level: number; xp: number; sigils: Readonly<Record<string, number>>; kind: SpellKind; element: string; target: SpellTarget;
  maxHit?: number; teleport?: TeleportPlace; curse?: { stat: "attack" | "strength" | "defence"; amount: number };
  /** A spell learnt by deed: castable only once this quest is complete. */
  quest?: string;
  /** Raria's own (Return of Raria): an edict, judgement, vigil, office, summons or rite of the Wise Friend, castable only while you keep the Law. */
  rarian?: boolean;
  /** Faith spells: the level is a Faith level and each cast spends this much faith. */
  skill?: "prayer"; faith?: number;
  /** A ward on yourself: more defence (a fraction of your bonus plus a flat amount), less damage taken (a fraction), for so many ticks. */
  ward?: { defence?: number; flat?: number; reduce?: number; ticks: number };
  /** Healing: at once, and/or so much a tick for so many ticks. */
  heal?: { now?: number; perTick?: number; ticks?: number; energy?: number; cure?: boolean };
  description: string;
};
/** Everywhere a teleport can land (the keys of World["places"] that spells use). */
export type TeleportPlace = "hollow_square" | "emberforge" | "oasis" | "frostpeak" | "pier" | "fernwick" | "highcairn" | "dawnhold" | "gravesend" | "saltmarrow" | "hollyhock" | "dyemoor" | "tallgrass" | "cragmaw" | "quillhaven" | "ashfall" | "raria" | "fff_fortress" | "barkreach";
/** The spellbook's tabs: which kinds go where. */
export const SPELL_TABS: readonly { id: string; name: string; kinds: readonly SpellKind[] }[] = [
  { id: "combat", name: "Combat", kinds: ["strike", "bolt", "blast"] }, { id: "curses", name: "Curses", kinds: ["curse", "bind"] },
  { id: "wards", name: "Wards", kinds: ["ward"] },
  { id: "utility", name: "Utility", kinds: ["alchemy", "superheat", "grab", "enchant", "bloom"] }, { id: "teleports", name: "Teleports", kinds: ["teleport"] },
  { id: "faith", name: "Faith", kinds: ["smite", "mend", "aegis", "bless"] },
];
/** The same book under the Wise Friend's Law (Return of Raria): Raria's names for the tabs, its own spells among the Realm's, and its rites in place of the Old Friend's light. */
export const RARIAN_SPELL_TABS: readonly { id: string; name: string; kinds: readonly SpellKind[] }[] = [
  { id: "combat", name: "Edicts", kinds: ["strike", "bolt", "blast"] }, { id: "curses", name: "Judgements", kinds: ["curse", "bind"] },
  { id: "wards", name: "Vigils", kinds: ["ward"] },
  { id: "utility", name: "Offices", kinds: ["alchemy", "superheat", "grab", "enchant", "bloom"] }, { id: "teleports", name: "Summons", kinds: ["teleport"] },
  { id: "faith", name: "Rites", kinds: ["smite", "mend", "aegis", "bless"] },
];
/** Whether a spell belongs in the book you keep: the Realm's common magic is in both; the Old Friend's light only in the old book, Raria's edicts and rites only in the Law's. */
export const spellInBook = (spell: Spell, rarian: boolean) => rarian ? !(spell.skill === "prayer" && !spell.rarian) : !spell.rarian;
/** The Realm's spellbook, in level order: combat, curses, utility and teleports. */
export const SPELLS: readonly Spell[] = [
  { id: "home", name: "Homeward", level: 1, xp: 0, sigils: {}, kind: "teleport", element: "home", target: "self", teleport: "hollow_square", description: "Return to Friendhollow. Slow to cast, free, and not in combat." },
  { id: "breeze_dart", name: "Breeze Dart", level: 1, xp: 5.5, sigils: { breeze_sigil: 1, thought_sigil: 1 }, kind: "strike", element: "wind", target: "monster", maxHit: 2, description: "A basic air missile." },
  { id: "muddle", name: "Muddle", level: 3, xp: 13, sigils: { shade_sigil: 1, tide_sigil: 3, stone_sigil: 2 }, kind: "curse", element: "hollow", target: "monster", curse: { stat: "attack", amount: 0.1 }, description: "Lowers a monster's accuracy by 10% for a minute." },
  { id: "tide_dart", name: "Tide Dart", level: 5, xp: 7.5, sigils: { tide_sigil: 1, breeze_sigil: 1, thought_sigil: 1 }, kind: "strike", element: "water", target: "monster", maxHit: 4, description: "A basic water missile." },
  { id: "enchant_moonstone", name: "Enchant Moonstone", level: 7, xp: 17.5, sigils: { star_sigil: 1, tide_sigil: 1 }, kind: "enchant", element: "water", target: "item", description: "Turns a moonstone amulet (a moonstone on a string) into a moonstone pendant." },
  { id: "stone_dart", name: "Stone Dart", level: 9, xp: 9.5, sigils: { stone_sigil: 2, breeze_sigil: 1, thought_sigil: 1 }, kind: "strike", element: "earth", target: "monster", maxHit: 6, description: "A basic earth missile." },
  { id: "wilt", name: "Wilt", level: 11, xp: 21, sigils: { shade_sigil: 1, tide_sigil: 3, stone_sigil: 2 }, kind: "curse", element: "hollow", target: "monster", curse: { stat: "strength", amount: 0.1 }, description: "Lowers a monster's strength by 10% for a minute." },
  { id: "ember_dart", name: "Ember Dart", level: 13, xp: 11.5, sigils: { ember_sigil: 3, breeze_sigil: 2, thought_sigil: 1 }, kind: "strike", element: "fire", target: "monster", maxHit: 8, description: "A basic fire missile." },
  { id: "bonebloom", name: "Bonebloom", level: 15, xp: 25, sigils: { bloom_sigil: 1, stone_sigil: 2, tide_sigil: 2 }, kind: "bloom", element: "earth", target: "self", description: "Turns every bone in your pack into sweetberries." },
  { id: "breeze_lance", name: "Breeze Lance", level: 17, xp: 13.5, sigils: { breeze_sigil: 2, storm_sigil: 1 }, kind: "bolt", element: "wind", target: "monster", maxHit: 9, description: "A low level air missile." },
  { id: "bind", name: "Rootsnare", level: 20, xp: 30, sigils: { bloom_sigil: 2, stone_sigil: 3, tide_sigil: 3 }, kind: "bind", element: "earth", target: "monster", description: "Roots a monster in place for ten seconds." },
  { id: "gilded_touch", name: "Gilded Touch", level: 21, xp: 31, sigils: { bloom_sigil: 1, ember_sigil: 3 }, kind: "alchemy", element: "fire", target: "item", description: "Turns an item into coins: 40% of its value." },
  { id: "tide_lance", name: "Tide Lance", level: 23, xp: 16.5, sigils: { tide_sigil: 2, breeze_sigil: 2, storm_sigil: 1 }, kind: "bolt", element: "water", target: "monster", maxHit: 10, description: "A low level water missile." },
  { id: "glide_friendhollow", name: "Glide to Friendhollow", level: 25, xp: 35, sigils: { path_sigil: 1, breeze_sigil: 3, ember_sigil: 1 }, kind: "teleport", element: "moon", target: "self", teleport: "hollow_square", description: "Teleports you to Friendhollow square." },
  { id: "curse", name: "Brittle", level: 27, xp: 29, sigils: { shade_sigil: 1, tide_sigil: 2, stone_sigil: 3 }, kind: "curse", element: "hollow", target: "monster", curse: { stat: "defence", amount: 0.12 }, description: "Lowers a monster's defence by 12% for a minute." },
  { id: "glide_emberforge", name: "Glide to Emberforge", level: 31, xp: 41, sigils: { path_sigil: 1, breeze_sigil: 3, stone_sigil: 1 }, kind: "teleport", element: "fire", target: "self", teleport: "emberforge", description: "Teleports you to Emberforge." },
  { id: "far_reach", name: "Far Reach", level: 33, xp: 43, sigils: { path_sigil: 1, breeze_sigil: 1 }, kind: "grab", element: "wind", target: "ground", description: "Takes an item from the ground up to eight tiles away." },
  { id: "ember_lance", name: "Ember Lance", level: 35, xp: 22.5, sigils: { ember_sigil: 4, breeze_sigil: 3, storm_sigil: 1 }, kind: "bolt", element: "fire", target: "monster", maxHit: 12, description: "A low level fire missile." },
  { id: "glide_oasis", name: "Glide to the Oasis", level: 37, xp: 48, sigils: { path_sigil: 1, breeze_sigil: 1, ember_sigil: 2 }, kind: "teleport", element: "gold", target: "self", teleport: "oasis", description: "Teleports you to the Oasis in the Pale Dunes." },
  { id: "breeze_burst", name: "Breeze Burst", level: 41, xp: 25.5, sigils: { breeze_sigil: 3, hollow_sigil: 1 }, kind: "blast", element: "wind", target: "monster", maxHit: 13, description: "A medium level air missile." },
  { id: "forgeheart", name: "Forgeheart", level: 43, xp: 53, sigils: { bloom_sigil: 1, ember_sigil: 4 }, kind: "superheat", element: "fire", target: "item", description: "Melts ore into a bar in your hands, no furnace needed (and trains Smithing)." },
  { id: "glide_frostpeak", name: "Glide to Frostpeak", level: 45, xp: 55.5, sigils: { path_sigil: 2, tide_sigil: 2, breeze_sigil: 2 }, kind: "teleport", element: "water", target: "self", teleport: "frostpeak", description: "Teleports you to the Frostpeak lodge." },
  { id: "glide_pier", name: "Glide to the Pier", level: 48, xp: 58, sigils: { path_sigil: 2, tide_sigil: 3 }, kind: "teleport", element: "water", target: "self", teleport: "pier", description: "Teleports you to Pike's Pier on Glass Lake." },
  // The wider world's glides: each learnt by doing the place's own quest (the sigils are the easy part).
  { id: "glide_fernwick", name: "Glide to Fernwick", level: 28, xp: 38, sigils: { path_sigil: 1, breeze_sigil: 2, bloom_sigil: 1 }, kind: "teleport", element: "moon", target: "self", teleport: "fernwick", quest: "hazels_quiver", description: "Teleports you to Fernwick in the Whisperwood. Learnt from Hazel, after her quiver." },
  { id: "glide_hollyhock", name: "Glide to Hollyhock", level: 38, xp: 48, sigils: { path_sigil: 1, bloom_sigil: 2, tide_sigil: 1 }, kind: "teleport", element: "moon", target: "self", teleport: "hollyhock", quest: "hollyhock_errand", description: "Teleports you to Hollyhock in the Thistle Vale. Learnt at Mother Yarrow's bench." },
  { id: "glide_saltmarrow", name: "Glide to Saltmarrow", level: 40, xp: 50, sigils: { path_sigil: 1, tide_sigil: 3 }, kind: "teleport", element: "water", target: "self", teleport: "saltmarrow", quest: "saltmarrow_tithe", description: "Teleports you to the Saltmarrow docks. Learnt from the harbourmaster, after the tithe." },
  { id: "glide_gravesend", name: "Glide to Gravesend", level: 42, xp: 52, sigils: { path_sigil: 1, shade_sigil: 2, hollow_sigil: 1 }, kind: "teleport", element: "shadow", target: "self", teleport: "gravesend", quest: "gravesend_lanterns", description: "Teleports you to Gravesend at the Deadwood's edge. Learnt from Warden Mira, after the lanterns." },
  { id: "glide_dyemoor", name: "Glide to Dyemoor", level: 44, xp: 54, sigils: { path_sigil: 1, tide_sigil: 1, star_sigil: 1 }, kind: "teleport", element: "moon", target: "self", teleport: "dyemoor", quest: "dyemoor_dye", description: "Teleports you to Dyemoor on the Thistle. Learnt from Master Dyer Vell." },
  { id: "glide_tallgrass", name: "Glide to Tallgrass", level: 50, xp: 60, sigils: { path_sigil: 2, breeze_sigil: 2, stone_sigil: 1 }, kind: "teleport", element: "wind", target: "self", teleport: "tallgrass", quest: "tallgrass_tracks", description: "Teleports you to the Tallgrass hunters' camp. Learnt from Huntmaster Fenn." },
  { id: "glide_highcairn", name: "Glide to Highcairn", level: 52, xp: 62, sigils: { path_sigil: 2, stone_sigil: 2, breeze_sigil: 1 }, kind: "teleport", element: "stone", target: "self", teleport: "highcairn", description: "Teleports you to Highcairn's square in the Greyhorn." },
  { id: "glide_dawnhold", name: "Glide to Dawnhold", level: 55, xp: 66, sigils: { path_sigil: 2, star_sigil: 2 }, kind: "teleport", element: "gold", target: "self", teleport: "dawnhold", quest: "dawn_vigil", description: "Teleports you to Dawnhold's courtyard. The Order teaches it to squires who kept the vigil." },
  { id: "glide_cragmaw", name: "Glide to Cragmaw", level: 58, xp: 70, sigils: { path_sigil: 2, stone_sigil: 3 }, kind: "teleport", element: "stone", target: "self", teleport: "cragmaw", quest: "cragmaw_shaft", description: "Teleports you to Cragmaw in the Ironreach pass. Learnt from Foreman Pike." },
  { id: "glide_quillhaven", name: "Glide to Quillhaven", level: 62, xp: 74, sigils: { path_sigil: 2, thought_sigil: 3, star_sigil: 1 }, kind: "teleport", element: "moon", target: "self", teleport: "quillhaven", quest: "quillhaven_folio", description: "Teleports you to the Quillhaven library. Learnt from Archivist Quill." },
  { id: "glide_ashfall", name: "Glide to Ashfall", level: 75, xp: 90, sigils: { path_sigil: 3, ember_sigil: 3, hollow_sigil: 1 }, kind: "teleport", element: "fire", target: "self", teleport: "ashfall", quest: "ashfall_embers", description: "Teleports you to Ember Tamsin's camp at the edge of Ashfall. Learnt from her, after the drakes." },
  { id: "enchant_rosestone", name: "Enchant Rosestone", level: 49, xp: 59, sigils: { star_sigil: 1, ember_sigil: 5 }, kind: "enchant", element: "fire", target: "item", description: "Turns a rosestone amulet (a rosestone on a string) into a rosestone pendant." },
  { id: "golden_touch", name: "Golden Touch", level: 55, xp: 65, sigils: { bloom_sigil: 1, ember_sigil: 5 }, kind: "alchemy", element: "gold", target: "item", description: "Turns an item into coins: 60% of its value." },
  { id: "ember_burst", name: "Ember Burst", level: 59, xp: 34.5, sigils: { ember_sigil: 5, breeze_sigil: 4, hollow_sigil: 1 }, kind: "blast", element: "fire", target: "monster", maxHit: 16, description: "A medium level fire missile." },
  // ---------- Wards: the Realm's own magic turned to defence ----------
  { id: "stone_skin", name: "Stone Skin", level: 20, xp: 30, sigils: { stone_sigil: 3, thought_sigil: 1 }, kind: "ward", element: "earth", target: "self", ward: { defence: 0.15, flat: 8, ticks: 100 }, description: "Your skin takes on the stillness of stone: +15% defence bonus and +8 for a minute." },
  { id: "tide_shield", name: "Tide Shield", level: 40, xp: 48, sigils: { tide_sigil: 3, thought_sigil: 2 }, kind: "ward", element: "water", target: "self", ward: { reduce: 0.25, ticks: 50 }, description: "A skin of water turns a quarter of every blow aside for half a minute." },
  { id: "storm_cloak", name: "Storm Cloak", level: 55, xp: 66, sigils: { storm_sigil: 2, breeze_sigil: 3 }, kind: "ward", element: "wind", target: "self", ward: { defence: 0.3, flat: 12, ticks: 100 }, description: "Wind wraps you: +30% defence bonus and +12 for a minute." },
  { id: "hollow_veil", name: "Hollow Veil", level: 75, xp: 90, sigils: { hollow_sigil: 2, shade_sigil: 3 }, kind: "ward", element: "hollow", target: "self", ward: { reduce: 0.4, defence: 0.2, ticks: 60 }, description: "The Hollow's own stillness: two fifths of every blow turned aside and +20% defence, for thirty-six seconds." },
  // ---------- Faith: the Old Friend's light, cast at a Faith level and paid for in faith ----------
  { id: "mend", name: "Mend", level: 5, xp: 12, sigils: { star_sigil: 1 }, kind: "mend", element: "holy", target: "self", skill: "prayer", faith: 2, heal: { now: 8 }, description: "A touch of the Old Friend's light: heals 8. Costs 2 faith." },
  { id: "holy_dart", name: "Holy Dart", level: 10, xp: 11, sigils: { star_sigil: 1, breeze_sigil: 1 }, kind: "smite", element: "holy", target: "monster", skill: "prayer", faith: 1, maxHit: 8, description: "A dart of light (max hit 8, half as much again against the undead). Costs 1 faith a cast." },
  { id: "ward_of_light", name: "Ward of Light", level: 15, xp: 24, sigils: { star_sigil: 2 }, kind: "aegis", element: "holy", target: "self", skill: "prayer", faith: 3, ward: { defence: 0.2, flat: 6, ticks: 100 }, description: "Light settles on your shoulders: +20% defence bonus and +6 for a minute. Costs 3 faith." },
  { id: "greater_mend", name: "Greater Mend", level: 30, xp: 36, sigils: { star_sigil: 2, tide_sigil: 1 }, kind: "mend", element: "holy", target: "self", skill: "prayer", faith: 4, heal: { now: 20 }, description: "Heals 20. Costs 4 faith." },
  { id: "smite", name: "Smite", level: 35, xp: 28, sigils: { star_sigil: 2, ember_sigil: 1 }, kind: "smite", element: "holy", target: "monster", skill: "prayer", faith: 2, maxHit: 16, description: "A hammer of light (max hit 16, half as much again against the undead). Costs 2 faith a cast." },
  { id: "sanctuary", name: "Sanctuary", level: 45, xp: 54, sigils: { star_sigil: 3, stone_sigil: 1 }, kind: "aegis", element: "holy", target: "self", skill: "prayer", faith: 6, ward: { reduce: 0.5, ticks: 50 }, description: "Half of every blow falls on the light instead of you, for half a minute. Costs 6 faith." },
  { id: "blessing", name: "Blessing", level: 50, xp: 60, sigils: { star_sigil: 2, path_sigil: 1 }, kind: "bless", element: "holy", target: "self", skill: "prayer", faith: 4, heal: { now: 6, energy: 100, cure: true }, description: "Run energy restored, poison cured, and a little healing. Costs 4 faith." },
  { id: "radiance", name: "Radiance", level: 60, xp: 44, sigils: { star_sigil: 3, ember_sigil: 2 }, kind: "smite", element: "holy", target: "monster", skill: "prayer", faith: 3, maxHit: 24, description: "A burst of the Old Friend's light (max hit 24, half as much again against the undead). Costs 3 faith a cast." },
  { id: "renewal", name: "Renewal", level: 70, xp: 84, sigils: { star_sigil: 3, bloom_sigil: 1 }, kind: "mend", element: "holy", target: "self", skill: "prayer", faith: 6, heal: { now: 5, perTick: 3, ticks: 20 }, description: "Heals 5 now and 3 a tick for twenty ticks. Costs 6 faith." },
  // ---------- The Wise Friend's Law (Return of Raria): Raria's edicts, judgements, vigils, offices, summons and rites ----------
  { id: "edict_of_silence", name: "Edict of Silence", level: 20, xp: 20, sigils: { law_sigil: 2, thought_sigil: 1 }, kind: "strike", element: "law", target: "monster", maxHit: 12, rarian: true, description: "A Rarian edict spoken at a creature: a bolt of grey law that strikes it quiet (max hit 12)." },
  { id: "edict_of_ash", name: "Edict of Ash", level: 42, xp: 36, sigils: { law_sigil: 3, ember_sigil: 2 }, kind: "bolt", element: "fire", target: "monster", maxHit: 20, rarian: true, description: "The Law's sentence for what will not obey: fire, pronounced (max hit 20)." },
  { id: "edict_of_dusk", name: "Edict of Dusk", level: 64, xp: 52, sigils: { law_sigil: 3, dusk_sigil: 2 }, kind: "blast", element: "dusk", target: "monster", maxHit: 30, rarian: true, description: "The Order of Dusk's edict: a burst of violet dark that takes the light out of a creature (max hit 30)." },
  { id: "judgement_of_weakness", name: "Judgement of Weakness", level: 30, xp: 26, sigils: { law_sigil: 2, shade_sigil: 1 }, kind: "curse", element: "law", target: "monster", curse: { stat: "strength", amount: 0.1 }, rarian: true, description: "A judgement read over a creature: its strength is found wanting (−10%)." },
  { id: "judgement_of_stillness", name: "Judgement of Stillness", level: 50, xp: 40, sigils: { law_sigil: 3, dusk_sigil: 1 }, kind: "bind", element: "dusk", target: "monster", rarian: true, description: "The Law holds a creature where it stands for a time." },
  { id: "vigil_of_law", name: "Vigil of the Law", level: 25, xp: 32, sigils: { law_sigil: 2, stone_sigil: 1 }, kind: "ward", element: "law", target: "self", ward: { defence: 0.2, flat: 10, ticks: 100 }, rarian: true, description: "A Rarian vigil kept over yourself: +20% defence bonus and +10 for a minute and a half." },
  { id: "vigil_of_dusk", name: "Vigil of Dusk", level: 55, xp: 58, sigils: { dusk_sigil: 2, law_sigil: 2 }, kind: "ward", element: "dusk", target: "self", ward: { reduce: 0.3, ticks: 80 }, rarian: true, description: "The Order of Dusk's vigil: a third of the damage you take is turned aside for eighty ticks." },
  { id: "office_of_tithes", name: "Office of Tithes", level: 40, xp: 48, sigils: { law_sigil: 2, ember_sigil: 1 }, kind: "alchemy", element: "law", target: "item", rarian: true, description: "The Crown's office: an item in your pack is assessed and turned to coin, the tithe already taken." },
  { id: "summons_to_raria", name: "Summons to Raria", level: 35, xp: 38, sigils: { law_sigil: 2, path_sigil: 1 }, kind: "teleport", element: "law", target: "self", teleport: "raria", rarian: true, description: "The Law summons you to Raria's square, before the palace." },
  { id: "rite_of_censure", name: "Rite of Censure", level: 20, xp: 16, sigils: { dusk_sigil: 1, law_sigil: 1 }, kind: "smite", element: "dusk", target: "monster", skill: "prayer", faith: 2, maxHit: 12, rarian: true, description: "A rite of the Wise Friend spoken against a creature (max hit 12, half as much again against the undead). Costs 2 faith." },
  { id: "rite_of_mending", name: "Rite of Mending", level: 32, xp: 38, sigils: { law_sigil: 2, tide_sigil: 1 }, kind: "mend", element: "law", target: "self", skill: "prayer", faith: 4, heal: { now: 22 }, rarian: true, description: "The Law mends what obeys it: heals 22 at once. Costs 4 faith." },
  { id: "rite_of_the_keeper", name: "Rite of the Keeper", level: 48, xp: 56, sigils: { dusk_sigil: 2, stone_sigil: 1 }, kind: "aegis", element: "dusk", target: "self", skill: "prayer", faith: 6, ward: { defence: 0.25, flat: 10, reduce: 0.2, ticks: 120 }, rarian: true, description: "The Keeper's own rite: +25% defence bonus, +10, and a fifth of damage turned aside for two minutes. Costs 6 faith." },
  { id: "rite_of_obedience", name: "Rite of Obedience", level: 55, xp: 62, sigils: { law_sigil: 2, dusk_sigil: 1 }, kind: "bless", element: "law", target: "self", skill: "prayer", faith: 4, heal: { now: 8, energy: 25, cure: true }, rarian: true, description: "Obedience is rewarded: 8 health, a quarter of your run energy, and any poison cleared. Costs 4 faith." },
  { id: "rite_of_dusk", name: "Rite of Dusk", level: 72, xp: 58, sigils: { dusk_sigil: 3, law_sigil: 2 }, kind: "smite", element: "dusk", target: "monster", skill: "prayer", faith: 4, maxHit: 30, rarian: true, description: "The last rite of the Order of Dusk, pronounced over a creature (max hit 30, half as much again against the undead). Costs 4 faith." },
  { id: "banishment", name: "Banishment", level: 80, xp: 60, sigils: { star_sigil: 4, hollow_sigil: 1 }, kind: "smite", element: "holy", target: "monster", skill: "prayer", faith: 5, maxHit: 32, description: "Light that unmakes (max hit 32, twice that against the undead). Costs 5 faith a cast." },
];
export type Prayer = { id: string; name: string; level: number; drain: number; effect: Partial<{ attack: number; strength: number; defence: number; magic: number; protect: boolean }>; description: string;
  /** A commandment of the Wise Friend's Law (Return of Raria): kept only while you keep the Law, in place of the Old Friend's prayers. */
  rarian?: boolean };
export const PRAYERS: readonly Prayer[] = [
  { id: "paper_shield", name: "Paper Shield", level: 1, drain: 1 / 12, effect: { defence: 0.05 }, description: "+5% Defence" },
  { id: "warm_heart", name: "Warm Heart", level: 4, drain: 1 / 12, effect: { strength: 0.05 }, description: "+5% Strength" },
  { id: "clear_ink", name: "Clear Ink", level: 7, drain: 1 / 12, effect: { attack: 0.05 }, description: "+5% Attack" },
  { id: "quiet_mind", name: "Quiet Mind", level: 9, drain: 1 / 12, effect: { magic: 0.05 }, description: "+5% Magic" },
  { id: "stone_shield", name: "Stone Shield", level: 10, drain: 1 / 6, effect: { defence: 0.1 }, description: "+10% Defence" },
  { id: "bright_heart", name: "Bright Heart", level: 13, drain: 1 / 6, effect: { strength: 0.1 }, description: "+10% Strength" },
  { id: "sharp_ink", name: "Sharp Ink", level: 16, drain: 1 / 6, effect: { attack: 0.1 }, description: "+10% Attack" },
  { id: "deep_mind", name: "Deep Mind", level: 27, drain: 1 / 6, effect: { magic: 0.1 }, description: "+10% Magic" },
  { id: "mountain_shield", name: "Mountain Shield", level: 28, drain: 1 / 3, effect: { defence: 0.15 }, description: "+15% Defence" },
  { id: "burning_heart", name: "Burning Heart", level: 31, drain: 1 / 3, effect: { strength: 0.15 }, description: "+15% Strength" },
  { id: "perfect_ink", name: "Perfect Ink", level: 34, drain: 1 / 3, effect: { attack: 0.15 }, description: "+15% Attack" },
  { id: "friends_ward", name: "Friend's Ward", level: 37, drain: 1 / 3, effect: { protect: true }, description: "Blocks most melee damage" },
  // ---------- The Wise Friend's commandments (Return of Raria): kept in place of the prayers while you keep the Law ----------
  { id: "first_law", name: "The First Law: Obey", level: 1, drain: 1 / 10, effect: { defence: 0.08 }, description: "+8% Defence", rarian: true },
  { id: "second_law", name: "The Second Law: Endure", level: 8, drain: 1 / 10, effect: { strength: 0.08 }, description: "+8% Strength", rarian: true },
  { id: "third_law", name: "The Third Law: Strike True", level: 14, drain: 1 / 10, effect: { attack: 0.08 }, description: "+8% Attack", rarian: true },
  { id: "fourth_law", name: "The Fourth Law: Know", level: 22, drain: 1 / 10, effect: { magic: 0.08 }, description: "+8% Magic", rarian: true },
  { id: "queens_peace", name: "The Queen's Peace", level: 33, drain: 1 / 4, effect: { defence: 0.18 }, description: "+18% Defence", rarian: true },
  { id: "keepers_silence", name: "The Keeper's Silence", level: 40, drain: 1 / 3, effect: { protect: true }, description: "Blocks most melee damage", rarian: true },
  { id: "wise_hand", name: "The Wise Hand", level: 52, drain: 2 / 5, effect: { attack: 0.18, strength: 0.18 }, description: "+18% Attack and Strength", rarian: true },
  { id: "dusk_mantle", name: "The Mantle of Dusk", level: 70, drain: 1 / 2, effect: { attack: 0.15, strength: 0.15, defence: 0.15, magic: 0.15 }, description: "+15% Attack, Strength, Defence and Magic", rarian: true },
];

// ---------- Monsters ----------
export type Drop = { item: string; min: number; max: number; chance: number };
export type MonsterDef = {
  id: string; name: string; level: number; hp: number; attack: number; strength: number; defence: number; magicDef?: number;
  /** The element its hide is weak to: spells of that element land truer and harder (a third again). Shown beside its health bar. */
  weakness?: "fire" | "water" | "wind" | "earth" | "holy";
  attackBonus: number; defenceBonus: number; maxHit: number; speed: number; aggressive?: boolean; size?: number;
  respawn: number; wander: number; examine: string; always?: readonly Drop[]; drops: readonly Drop[]; art: number; ink?: string;
  attackStyle?: "melee" | "magic"; boss?: boolean; slayerXp?: number;
  /** A sheep: shear it (with shears) for this item; it grows back in `regrow` ticks, drawn meanwhile as `art`. */
  shear?: { item: string; regrow: number; art: number };
  /** A world boss: it rises on a schedule for everyone at once, and everyone who wounds it gets loot. */
  worldBoss?: boolean;
  /** The Slayer level needed to wound it. */
  slayer?: number;
  /** Undead (skeletons, shades, the Hollow): faith weapons hurt them more. */
  undead?: boolean;
  /** Dragonfire: its top hit when it breathes (a Wyrmward shield turns it to a few points). */
  breath?: number;
  /** A venomous creature: each hit it lands may poison you (this much damage, four times, every ten ticks). */
  poison?: { damage: number; chance: number };
  /** How weapon poison takes: more than 1 for soft-bodied creatures, and none at all for the undead and stone (only wraith poison touches the undead). */
  poisonWeak?: number; poisonImmune?: boolean;
  /** An archer: it shoots from this many tiles away rather than closing in. */
  ranged?: number;
  /** A wraith: each hit it lands drains this much faith (or run energy) as well. */
  drain?: { faith?: number; energy?: number };
  /** It mends itself this much every few ticks while below half health. */
  heals?: number;
  /** Below a third of its health it enrages: it hits half as hard again and faster. */
  enrage?: boolean;
  /** Met only in the Rare Friends Ring (summoned for a match), never placed in the world. */
  arenaOnly?: boolean;
  /** A people, not a beast: hostile until their quest is done, then at peace with you (and not to be attacked). */
  faction?: string;
  /** A soldier's fighting self: drawn in that NPC's own looks (skirmish.ts). */
  look?: string;
  /** The side it fights for in the Realm's wars, where that isn't plain from the rest (skirmish.ts). */
  side?: import("./skirmish.ts").Side;
};
const coins = (min: number, max: number, chance: number): Drop => ({ item: "coins", min, max, chance });
const one = (id: string, chance: number, min = 1, max = min): Drop => ({ item: id, min, max, chance });
export const MONSTERS: Record<string, MonsterDef> = {
  // Return of Raria: the Regiment, the Federation's pickets, the Royal Rangers, BarkReach's wild things, the deserters and the Burned.
  ...FACTION_MONSTERS,
  // Every soldier's fighting self, for when it draws steel (skirmish.ts).
  ...SOLDIERS,
  chicken: { id: "chicken", name: "Chicken", level: 1, hp: 3, attack: 1, strength: 1, defence: 1, attackBonus: 0, defenceBonus: 0, maxHit: 1, speed: 4, respawn: 20, wander: 4, examine: "Yep, definitely a chicken.",
    always: [one("bones", 1), one("raw_chicken", 1)], drops: [one("feather", 0.6, 5, 15)], art: 100 },
  cow: { id: "cow", name: "Cow", level: 2, hp: 8, attack: 1, strength: 1, defence: 1, attackBonus: 0, defenceBonus: 0, maxHit: 1, speed: 4, respawn: 25, wander: 5, examine: "Converts grass to beef.",
    always: [one("bones", 1), one("cowhide", 1), one("raw_beef", 1)], drops: [], art: 101 },
  sheep: { id: "sheep", name: "Sheep", level: 1, hp: 5, attack: 1, strength: 1, defence: 1, attackBonus: 0, defenceBonus: 0, maxHit: 1, speed: 4, respawn: 25, wander: 3, examine: "Baa. A fleece like that wants shearing.",
    always: [one("bones", 1)], drops: [one("wool", 0.5)], art: 115, shear: { item: "wool", regrow: 90, art: 116 } },
  forest_spider: { id: "forest_spider", name: "Forest spider", level: 12, hp: 16, attack: 10, strength: 10, defence: 8, attackBonus: 6, defenceBonus: 4, maxHit: 2, speed: 4, respawn: 30, wander: 5, examine: "Eight eyes, all of them on you.", aggressive: true,
    always: [one("bones", 1)], drops: [one("spider_fang", 0.04), coins(5, 40, 0.5), one("silk", 0.2), one("pewter_arrow", 0.15, 3, 8)], art: 117 },
  boar: { id: "boar", poisonWeak: 1.5, name: "Wild boar", level: 16, hp: 22, attack: 14, strength: 16, defence: 10, attackBonus: 6, defenceBonus: 6, maxHit: 3, speed: 5, respawn: 30, wander: 5, examine: "Tusks first, questions later.",
    always: [one("bones", 1), one("raw_beef", 1)], drops: [one("tusker_axe", 0.03), one("cowhide", 0.4), coins(5, 30, 0.3)], art: 118 },
  highland_goat: { id: "highland_goat", name: "Highland goat", level: 22, hp: 26, attack: 18, strength: 16, defence: 16, attackBonus: 8, defenceBonus: 10, maxHit: 3, speed: 4, respawn: 30, wander: 6, examine: "It climbed up there somehow.",
    always: [one("bones", 1)], drops: [one("horned_helm", 0.04), one("wool", 0.35), one("raw_beef", 0.5), coins(10, 60, 0.3)], art: 119 },
  sand_scorpion: { id: "sand_scorpion", name: "Sand scorpion", level: 30, hp: 34, attack: 26, strength: 24, defence: 24, attackBonus: 14, defenceBonus: 18, maxHit: 5, speed: 4, respawn: 35, wander: 5, examine: "Its tail is always raised. Always.", aggressive: true,
    always: [one("bones", 1)], drops: [one("stinger_sabre", 0.03), coins(20, 120, 0.5), one("rough_sagestone", 0.03), one("moonsilver_arrow", 0.08, 5, 12)], art: 121 },
  stone_golem: { id: "stone_golem", poisonImmune: true, name: "Stone golem", level: 45, hp: 62, attack: 36, strength: 38, defence: 44, attackBonus: 20, defenceBonus: 40, maxHit: 7, speed: 6, respawn: 60, wander: 3, examine: "A heap of mountain that got up.", aggressive: true,
    always: [one("large_bones", 1)], drops: [one("golem_maul", 0.02), one("glimmer_ore", 0.25), one("rarite_ore", 0.06), one("moonsilver_ore", 0.3), coins(40, 240, 0.4)], art: 120 },
  ink_rat: { id: "ink_rat", name: "Ink rat", level: 1, hp: 2, attack: 1, strength: 1, defence: 1, attackBonus: 0, defenceBonus: 0, maxHit: 1, speed: 4, respawn: 15, wander: 6, examine: "A rat made of spilled ink. It squeaks in monochrome.",
    always: [one("bones", 1)], drops: [coins(1, 4, 0.3)], art: 102 },
  grumblin: { id: "grumblin", name: "Grumblin", level: 5, hp: 7, attack: 4, strength: 4, defence: 1, attackBonus: 2, defenceBonus: 0, maxHit: 2, speed: 4, respawn: 25, wander: 6, examine: "An ugly, grumbling green-grey creature.", aggressive: true,
    always: [one("bones", 1)], drops: [one("grumblin_spear", 0.03), one("grumblin_head", 0.002), coins(2, 25, 0.45), one("breeze_sigil", 0.1, 3, 8), one("thought_sigil", 0.08, 2, 6), one("pewter_dagger", 0.04), one("pewter_helm", 0.03), one("fishing_bait", 0.08, 5, 15), one("tide_sigil", 0.05, 2, 6), one("pewter_arrow", 0.12, 4, 12), one("shortbow", 0.02)], art: 103 },
  grumblin_chief: { id: "grumblin_chief", name: "Grumblin chief", level: 13, hp: 20, attack: 10, strength: 11, defence: 8, attackBonus: 6, defenceBonus: 5, maxHit: 3, speed: 4, respawn: 50, wander: 3, examine: "The loudest Grumblin. That's how they choose.", aggressive: true,
    always: [one("bones", 1)], drops: [one("grumblin_spear", 0.12), one("grumblin_head", 0.02), coins(20, 80, 0.6), one("blackiron_sabre", 0.05), one("stone_sigil", 0.1, 5, 12), one("blackiron_helm", 0.05), one("rough_moonstone", 0.03)], art: 104 },
  bandit: { id: "bandit", name: "Dune bandit", level: 22, hp: 28, attack: 20, strength: 20, defence: 16, attackBonus: 12, defenceBonus: 12, maxHit: 4, speed: 4, respawn: 40, wander: 5, examine: "A Friend who took a wrong turn in life.", aggressive: true,
    always: [one("bones", 1)], drops: [coins(20, 120, 0.7), one("ashsteel_dagger", 0.05), one("storm_sigil", 0.08, 2, 6), one("rough_sagestone", 0.02), one("path_sigil", 0.02, 1, 2), one("ashsteel_arrow", 0.1, 5, 15), one("willow_bow", 0.02)], art: 105 },
  swamp_lurker: { id: "swamp_lurker", name: "Swamp lurker", level: 16, hp: 22, attack: 14, strength: 14, defence: 12, attackBonus: 8, defenceBonus: 8, maxHit: 3, speed: 5, respawn: 35, wander: 4, examine: "Mostly mouth, partly mud.", aggressive: true,
    always: [one("bones", 1)], drops: [coins(5, 50, 0.5), one("tide_sigil", 0.12, 6, 18), one("raw_char", 0.1), one("rough_moonstone", 0.02)], art: 106 },
  skeleton: { id: "skeleton", undead: true, poisonImmune: true, name: "Crypt skeleton", level: 25, hp: 29, attack: 22, strength: 22, defence: 20, attackBonus: 14, defenceBonus: 16, maxHit: 4, speed: 4, respawn: 40, wander: 4, examine: "It rattles when it walks. It used to be a Friend.", aggressive: true,
    always: [one("crypt_bones", 1)], drops: [coins(10, 90, 0.6), one("blackiron_greaves", 0.03), one("storm_sigil", 0.06, 3, 7), one("hollow_sigil", 0.02, 1, 3), one("ashsteel_helm", 0.03)], art: 107 },
  wolf: { id: "wolf", name: "Frost wolf", level: 32, hp: 40, attack: 30, strength: 28, defence: 26, attackBonus: 18, defenceBonus: 18, maxHit: 5, speed: 4, respawn: 40, wander: 6, examine: "Its breath freezes as it growls.", aggressive: true,
    always: [one("large_bones", 1)], drops: [one("frost_shard", 0.03), coins(20, 110, 0.4), one("rough_rosestone", 0.02), one("moonsilver_ore", 0.05), one("frosthide_bracers", 0.02), one("moonsilver_arrow", 0.06, 5, 12)], art: 108 },
  moss_colossus: { id: "moss_colossus", name: "Moss colossus", level: 42, hp: 60, attack: 32, strength: 34, defence: 30, attackBonus: 20, defenceBonus: 22, maxHit: 7, speed: 6, respawn: 60, wander: 3, examine: "A Colossus-family giant, grown over with moss.", size: 2,
    always: [one("large_bones", 1)], drops: [one("mossy_staff", 0.03), one("mossblade", 0.03), coins(30, 250, 0.6), one("moonsilver_sword", 0.03), one("path_sigil", 0.06, 1, 3), one("rough_sagestone", 0.04), one("ashsteel_cuirass", 0.02)], art: 109 },
  frost_yeti: { id: "frost_yeti", name: "Frost yeti", level: 55, hp: 85, attack: 50, strength: 52, defence: 45, attackBonus: 30, defenceBonus: 32, maxHit: 10, speed: 5, respawn: 60, wander: 4, examine: "Every footstep is an avalanche.", aggressive: true, size: 2,
    always: [one("large_bones", 1)], drops: [one("frost_shard", 0.3), one("frostsilver_helm", 0.012), one("frostsilver_sabre", 0.008), coins(80, 400, 0.6), one("glimmer_sabre", 0.02), one("hollow_sigil", 0.08, 2, 5), one("glimmer_ore", 0.06), one("rough_rosestone", 0.04), one("rosestone_pendant", 0.004)], art: 110 },
  shade: { id: "shade", undead: true, poisonImmune: true, name: "Shade", level: 38, hp: 45, attack: 32, strength: 30, defence: 34, magicDef: 10, attackBonus: 20, defenceBonus: 26, maxHit: 6, speed: 4, respawn: 40, wander: 4, examine: "A shadow with no Friend to belong to.", aggressive: true,
    always: [one("ink_bones", 1)], drops: [one("gloom_shard", 0.05), coins(40, 220, 0.6), one("hollow_sigil", 0.06, 2, 6), one("moonsilver_helm", 0.03), one("rough_rosestone", 0.02)], art: 111, ink: "#2c2b3a" },
  hollow_sentinel: { id: "hollow_sentinel", undead: true, poisonImmune: true, name: "Hollow sentinel", level: 64, hp: 95, attack: 60, strength: 60, defence: 58, attackBonus: 40, defenceBonus: 48, maxHit: 12, speed: 5, respawn: 50, wander: 3, examine: "Armour with nothing inside. It still remembers how to fight.", aggressive: true,
    always: [one("ink_bones", 1)], drops: [one("gloom_shard", 0.08), one("hollow_essence", 0.2), one("gloomsteel_shield", 0.008), coins(100, 600, 0.7), one("glimmer_cuirass", 0.02), one("rarite_ore", 0.03), one("hollow_sigil", 0.1, 4, 9), one("path_sigil", 0.08, 2, 5)], art: 112, ink: "#1d1d26" },
  hollow_king: { id: "hollow_king", undead: true, poisonImmune: true, name: "The Hollow King", level: 92, hp: 250, attack: 80, strength: 82, defence: 70, magicDef: 50, attackBonus: 60, defenceBonus: 70, maxHit: 18, speed: 5, respawn: 100, wander: 2, examine: "A crown floating over an empty ring of shadow.", aggressive: true, size: 3, boss: true,
    always: [one("ink_bones", 1), coins(1000, 3000, 1)], drops: [one("hollow_essence", 1, 3, 5), one("hollowsteel_sabre", 0.1), one("hollowsteel_helm", 0.08), one("hollowsteel_staff", 0.06), one("rarite_sabre", 0.12), one("rarite_helm", 0.1), one("moonlit_staff", 0.08), one("rarite_bar", 0.3, 1, 3), one("rosestone_pendant", 0.1)], art: 113, ink: "#111" },
};
Object.assign(MONSTERS, {
  mire_crawler: { id: "mire_crawler", name: "Mire crawler", level: 18, hp: 26, attack: 16, strength: 15, defence: 14, attackBonus: 10, defenceBonus: 10, maxHit: 3, speed: 4, respawn: 30, wander: 4, slayer: 10,
    examine: "Something with too many legs, living under the Murkmire mud. Only a Slayer knows where to hit it.", aggressive: true,
    always: [one("bones", 1)], drops: [coins(10, 60, 0.5), one("bloom_sigil", 0.1, 2, 5), one("blackiron_arrow", 0.15, 8, 20), one("rough_sagestone", 0.03), one("oak_bow", 0.03)], art: 106, ink: "#3d4a36" },
  frost_wisp: { id: "frost_wisp", name: "Frost wisp", level: 36, hp: 44, attack: 30, strength: 28, defence: 30, magicDef: 18, attackBonus: 18, defenceBonus: 22, maxHit: 5, speed: 4, respawn: 35, wander: 5, slayer: 30,
    examine: "A shiver with a face. Blows straight through anyone who hasn't learnt the trick of it.", aggressive: true,
    always: [one("ink_bones", 1)], drops: [one("frost_shard", 0.06), coins(30, 180, 0.6), one("star_sigil", 0.12, 4, 10), one("glimmer_arrow", 0.1, 5, 12), one("frosthide_coif", 0.03), one("frosthide_chaps", 0.02), one("rough_rosestone", 0.03)], art: 111, ink: "#5c7f9e" },
  gloom_hound: { id: "gloom_hound", name: "Gloom hound", level: 58, hp: 80, attack: 52, strength: 54, defence: 46, attackBonus: 32, defenceBonus: 34, maxHit: 9, speed: 4, respawn: 45, wander: 5, slayer: 50,
    examine: "A hound made of the dark between two torches.", aggressive: true,
    always: [one("ink_bones", 1)], drops: [one("gloom_shard", 0.3), one("gloomsteel_sword", 0.01), one("gloomsteel_helm", 0.01), coins(100, 500, 0.7), one("gloomfang_bow", 0.012), one("rarite_arrow", 0.08, 5, 15), one("frosthide_vest", 0.02), one("hollow_sigil", 0.1, 3, 8), one("rarite_ore", 0.03)], art: 108, ink: "#2e2440" },
  // The Warden's creatures: only a Slayer of the right level can wound them, and each drops its own armour.
  thornback: { id: "thornback", poisonWeak: 1.5, name: "Thornback", level: 28, hp: 38, attack: 22, strength: 24, defence: 20, attackBonus: 12, defenceBonus: 14, maxHit: 5, speed: 5, respawn: 40, wander: 5, slayer: 15,
    examine: "A boar grown over with brambles. Every hit on it costs you a scratch.", aggressive: true,
    always: [one("bones", 1)], drops: [one("bramble_coif", 0.015), one("bramble_vest", 0.012), one("bramble_chaps", 0.012), coins(20, 120, 0.5), one("cowhide", 0.3), one("oak_logs", 0.2, 1, 3), one("rough_sagestone", 0.03), one("ashsteel_arrow", 0.12, 5, 15)], art: 122 },
  cairn_wight: { id: "cairn_wight", undead: true, poisonImmune: true, name: "Cairn wight", level: 48, hp: 60, attack: 40, strength: 38, defence: 42, magicDef: 20, attackBonus: 24, defenceBonus: 30, maxHit: 7, speed: 5, respawn: 45, wander: 4, slayer: 35,
    examine: "The old highland dead, up and walking in what they were buried in.", aggressive: true,
    always: [one("large_bones", 1)], drops: [one("wightbone_helm", 0.014), one("wightbone_plate", 0.01), one("wightbone_greaves", 0.012), coins(50, 260, 0.6), one("moonsilver_ore", 0.2), one("hollow_sigil", 0.1, 2, 6), one("rough_rosestone", 0.03), one("glimmer_helm", 0.02)], art: 123, ink: "#4a4a44" },
  dune_stalker: { id: "dune_stalker", poisonWeak: 1.5, name: "Dune stalker", level: 56, hp: 70, attack: 50, strength: 46, defence: 44, attackBonus: 30, defenceBonus: 32, maxHit: 8, speed: 4, respawn: 45, wander: 6, slayer: 45,
    examine: "A long, low cat the colour of the sand. You only see it when it wants you to.", aggressive: true,
    always: [one("bones", 1)], drops: [one("stalker_hood", 0.014), one("stalker_jerkin", 0.01), one("stalker_leggings", 0.012), coins(60, 320, 0.6), one("cowhide", 0.3, 1, 2), one("glimmer_arrow", 0.12, 5, 15), one("rough_rosestone", 0.04), one("glimmer_sabre", 0.015)], art: 124, ink: "#8a7a58" },
  ember_salamander: { id: "ember_salamander", name: "Ember salamander", level: 70, hp: 92, attack: 62, strength: 60, defence: 54, magicDef: 30, attackBonus: 36, defenceBonus: 40, maxHit: 10, speed: 5, respawn: 50, wander: 4, slayer: 60, breath: 20,
    examine: "A salamander the size of a cart, with a furnace in its belly.", aggressive: true,
    always: [one("large_bones", 1)], drops: [one("cindershell_helm", 0.014), one("cindershell_plate", 0.01), one("cindershell_greaves", 0.012), coins(80, 420, 0.65), one("cinder_core", 0.08), one("inkcoal", 0.3, 2, 6), one("rarite_ore", 0.05), one("ember_sigil", 0.15, 4, 10)], art: 125, ink: "#a0462a" },
  // The Ashen Hills mine by Friendhollow is a beginner's place: its salamanders are the young ones. The cart-sized adults keep to the deep mine.
  ember_salamander_young: { id: "ember_salamander_young", name: "Ember salamander", level: 7, hp: 10, attack: 6, strength: 6, defence: 4, magicDef: 2, attackBonus: 3, defenceBonus: 2, maxHit: 2, speed: 5, respawn: 30, wander: 4,
    examine: "A young ember salamander, no bigger than a dog. Its belly glows like a coal.", aggressive: false,
    always: [one("bones", 1)], drops: [coins(3, 30, 0.5), one("inkcoal", 0.2, 1, 3), one("ember_sigil", 0.15, 2, 6), one("pewter_ore", 0.1, 1, 2), one("cinder_core", 0.005)], art: 125, ink: "#c2603c" },
  hollow_weaver: { id: "hollow_weaver", undead: true, poisonImmune: true, name: "Hollow weaver", level: 88, hp: 120, attack: 74, strength: 70, defence: 66, magicDef: 60, attackBonus: 44, defenceBonus: 52, maxHit: 13, speed: 5, respawn: 55, wander: 3, slayer: 75, attackStyle: "magic",
    examine: "It spins the dark into thread. The thread is looking at you.", aggressive: true,
    always: [one("ink_bones", 1)], drops: [one("hollowthread_hood", 0.014), one("hollowthread_robe", 0.01), one("hollowthread_skirt", 0.012), coins(150, 700, 0.7), one("hollow_essence", 0.15), one("gloom_shard", 0.1), one("hollow_sigil", 0.15, 5, 12), one("shade_sigil", 0.12, 4, 10), one("rosestone_pendant", 0.005)], art: 126, ink: "#2a2438" },
  // Venomous creatures (Apothecary's reason to brew antidotes): adders in the bogs, spiders in the dark.
  marsh_adder: { id: "marsh_adder", name: "Marsh adder", level: 24, hp: 30, attack: 20, strength: 14, defence: 18, attackBonus: 14, defenceBonus: 10, maxHit: 3, speed: 4, respawn: 40, wander: 5, poison: { damage: 2, chance: 0.4 }, poisonWeak: 1.5,
    examine: "A black-and-yellow snake as long as you are tall. Its bite is worse than it looks, and it looks bad.", aggressive: true,
    always: [one("bones", 1)], drops: [one("bogcap", 0.4), one("marshroot", 0.25), one("blackgill", 0.03), coins(10, 60, 0.5), one("antidote", 0.05)], art: 127, ink: "#4a4a2a" },
  cave_spider: { id: "cave_spider", name: "Cave spider", level: 44, hp: 48, attack: 38, strength: 30, defence: 34, attackBonus: 22, defenceBonus: 22, maxHit: 5, speed: 4, respawn: 45, wander: 4, poison: { damage: 3, chance: 0.5 }, poisonWeak: 1.5,
    examine: "A spider the size of a dog, pale from the dark. Its fangs drip.", aggressive: true,
    always: [one("bones", 1)], drops: [one("blackgill", 0.1), one("ghostcap", 0.2), coins(30, 160, 0.6), one("antidote", 0.08), one("spider_fang", 0.03)], art: 128, ink: "#d9d4e6" },
  ash_drake: { id: "ash_drake", name: "Ash drake", level: 68, hp: 90, attack: 58, strength: 60, defence: 56, magicDef: 40, attackBonus: 34, defenceBonus: 40, maxHit: 9, speed: 5, respawn: 45, wander: 5, breath: 32, size: 2,
    examine: "A young dragon, all ash and appetite. Mind the breath.", aggressive: true,
    always: [one("drake_bones", 1), one("drakehide", 1)], drops: [one("wyrm_scale", 0.3), one("wyrmscale_helm", 0.01), coins(200, 900, 0.7), one("rarite_ore", 0.06), one("hollow_sigil", 0.1, 5, 15), one("path_sigil", 0.08, 3, 8), one("rough_rosestone", 0.05), one("rarite_arrow", 0.08, 8, 20)], art: 114, ink: "#3b3a38" },
  cinder_drake: { id: "cinder_drake", name: "Cinder drake", level: 86, hp: 125, attack: 76, strength: 80, defence: 72, magicDef: 56, attackBonus: 44, defenceBonus: 52, maxHit: 12, speed: 5, respawn: 55, wander: 4, breath: 45, size: 2,
    examine: "Its scales crack like cooling lava.", aggressive: true,
    always: [one("drake_bones", 1), one("drakehide", 1, 1, 2)], drops: [one("wyrm_scale", 0.35, 1, 2), one("cinder_core", 0.08), one("wyrmscale_sabre", 0.01), one("wyrmscale_shield", 0.008), coins(500, 1800, 0.75), one("rarite_bar", 0.08, 1, 2), one("drakehide_bracers", 0.02), one("rarite_sabre", 0.01), one("hollow_sigil", 0.12, 8, 20)], art: 114, ink: "#6b2a22" },
  emberwyrm: { id: "emberwyrm", name: "Old Cinder", level: 148, hp: 340, attack: 110, strength: 112, defence: 96, magicDef: 70, attackBonus: 70, defenceBonus: 80, maxHit: 20, speed: 5, respawn: 120, wander: 2, breath: 65, size: 3, boss: true,
    examine: "The oldest dragon in the Realm. The mountain is warm because she sleeps in it.", aggressive: true,
    always: [one("drake_bones", 1, 3, 3), coins(3000, 9000, 1)], drops: [one("cinder_core", 1, 1, 3), one("colossus_ember", 0.1), one("cindersteel_sabre", 0.08), one("cindersteel_shield", 0.06), one("wyrm_heart", 0.25), one("drakehide_vest", 0.08), one("drakehide_chaps", 0.1), one("rarite_helm", 0.1), one("rarite_bar", 0.4, 2, 5), one("gloomfang_bow", 0.02)], art: 114, ink: "#161616" },
  ashen_colossus: { id: "ashen_colossus", name: "The Ashen Colossus", level: 210, hp: 1500, attack: 120, strength: 118, defence: 110, magicDef: 90, attackBonus: 70, defenceBonus: 70, maxHit: 18, speed: 6, respawn: 99_999, wander: 1,
    size: 3, boss: true, worldBoss: true, aggressive: true, examine: "A Colossus-family giant of cinder and ash. It wakes every two hours, and it takes a crowd to put it back to sleep.",
    always: [one("large_bones", 1, 2, 4), coins(4000, 12_000, 1), one("rarite_bar", 1, 1, 3)], drops: [one("colossus_ember", 1, 2, 4), one("ashenheart_sabre", 0.04), one("ashenheart_helm", 0.05), one("ashenheart_staff", 0.03), one("wyrm_heart", 0.3), one("rarite_helm", 0.12), one("drakehide_vest", 0.1), one("gloomfang_bow", 0.04), one("rough_rosestone", 0.25, 1, 3), one("insight_lamp", 0.2)],
    art: 109, ink: "#5a1f14" },
} satisfies Record<string, MonsterDef>);
// ---------- The dungeon update: what lives under the lake, the library and the stones ----------
Object.assign(MONSTERS, {
  cave_bat: { id: "cave_bat", poisonWeak: 1.5, name: "Cave bat", level: 9, hp: 12, attack: 8, strength: 6, defence: 5, attackBonus: 6, defenceBonus: 2, maxHit: 2, speed: 3, respawn: 20, wander: 6, aggressive: true,
    examine: "A bat the size of a cat, and about as fond of you.", always: [one("bat_wing", 1)], drops: [coins(2, 14, 0.5), one("bones", 0.3), one("breeze_sigil", 0.15, 2, 5)], art: 129, ink: "#2b2630" },
  glass_crab: { id: "glass_crab", poisonImmune: true, name: "Glass crab", level: 21, hp: 32, attack: 14, strength: 16, defence: 30, attackBonus: 8, defenceBonus: 40, maxHit: 4, speed: 5, respawn: 35, wander: 4, weakness: "earth",
    examine: "A crab with a shell of lake-glass. You can see its insides working.", always: [one("crystal_shard", 0.35)], drops: [coins(12, 70, 0.6), one("bloom_sigil", 0.15, 2, 5), one("rough_sagestone", 0.03), one("deepglass_key", 0.04), one("tide_sigil", 0.12, 2, 4)], art: 130, ink: "#5f7f8f" },
  crystal_golem: { id: "crystal_golem", poisonImmune: true, name: "The Crystal Golem", level: 55, hp: 140, attack: 46, strength: 50, defence: 48, magicDef: 10, attackBonus: 30, defenceBonus: 36, maxHit: 10, speed: 6, respawn: 120, wander: 2, size: 2, boss: true, aggressive: true, enrage: true, weakness: "earth",
    examine: "The lake's own heart, walking. The light goes through it and comes out wrong.",
    always: [one("crystal_shard", 1, 2, 4), coins(300, 900, 1)], drops: [one("glassbrand", 0.08), one("crystal_shield", 0.06), one("rough_sagestone", 0.3), one("glimmer_ore", 0.25, 1, 3), one("insight_lamp", 0.02), one("stone_sigil", 0.5, 6, 14), one("deepglass_key", 0.2)], art: 131, ink: "#7aa6b8" },
  drowned_scholar: { id: "drowned_scholar", undead: true, poisonImmune: true, name: "Drowned scholar", level: 36, hp: 45, attack: 30, strength: 24, defence: 26, magicDef: 30, attackBonus: 20, defenceBonus: 18, maxHit: 6, speed: 5, respawn: 40, wander: 4, aggressive: true, attackStyle: "magic", weakness: "fire",
    examine: "Still reading. Still wet. It hasn't noticed it drowned.", always: [one("bones", 1)], drops: [one("ink_page", 0.45), one("thought_sigil", 0.25, 3, 6), one("shade_sigil", 0.15, 2, 4), coins(30, 160, 0.6), one("archive_key", 0.03), one("grave_dust", 0.2)], art: 132, ink: "#3b4a5e" },
  ink_wraith: { id: "ink_wraith", undead: true, poisonImmune: true, name: "Ink wraith", level: 52, hp: 62, attack: 44, strength: 40, defence: 38, magicDef: 45, attackBonus: 28, defenceBonus: 26, maxHit: 7, speed: 4, respawn: 50, wander: 5, aggressive: true, slayer: 40, weakness: "holy", drain: { faith: 4 },
    examine: "What's left when the ink outlives the writer. Its touch takes your faith.", drops: [one("shade_sigil", 0.3, 4, 8), one("hollow_sigil", 0.15, 2, 5), one("grave_dust", 0.4, 1, 2), coins(60, 300, 0.6), one("archive_key", 0.05), one("rough_rosestone", 0.03), one("ink_page", 0.2)], art: 133, ink: "#1e1a2e" },
  archivist_below: { id: "archivist_below", undead: true, poisonImmune: true, name: "The Archivist Below", level: 74, hp: 190, attack: 60, strength: 55, defence: 52, magicDef: 60, attackBonus: 40, defenceBonus: 40, maxHit: 12, speed: 5, respawn: 150, wander: 2, boss: true, aggressive: true, attackStyle: "magic", heals: 8, weakness: "fire",
    examine: "The library's first keeper, who went down to the flooded floor and kept on keeping it.",
    always: [one("ink_page", 1, 2, 2), one("grave_dust", 1, 2, 5), coins(600, 1600, 1)], drops: [one("inkbound_tome", 0.07), one("archivist_cowl", 0.06), one("drowned_staff", 0.05), one("thought_sigil", 0.6, 10, 25), one("insight_lamp", 0.03), one("hollow_essence", 0.1), one("archive_key", 0.25)], art: 134, ink: "#2c2a3e" },
  grave_moth: { id: "grave_moth", poisonWeak: 1.5, name: "Grave moth", level: 33, hp: 30, attack: 28, strength: 22, defence: 20, attackBonus: 16, defenceBonus: 10, maxHit: 4, speed: 3, respawn: 30, wander: 6, aggressive: true, slayer: 20, weakness: "fire", poison: { damage: 2, chance: 0.3 },
    examine: "A moth as broad as a shield, dusted with something you shouldn't breathe.", drops: [one("grave_dust", 0.5), one("bloom_sigil", 0.2, 2, 5), coins(20, 110, 0.5), one("bat_wing", 0.2), one("vault_key", 0.02)], art: 135, ink: "#6a6350" },
  vault_archer: { id: "vault_archer", undead: true, poisonImmune: true, name: "Vault archer", level: 47, hp: 55, attack: 42, strength: 36, defence: 34, attackBonus: 26, defenceBonus: 22, maxHit: 7, speed: 5, respawn: 45, wander: 4, aggressive: true, slayer: 45, weakness: "holy", ranged: 5,
    examine: "Buried with its bow. It still has the bow.", always: [one("large_bones", 1)], drops: [one("blackiron_arrow", 0.5, 10, 30), one("vault_key", 0.04), one("grave_dust", 0.3), one("moonsilver_ore", 0.15), coins(50, 240, 0.6), one("path_sigil", 0.1, 2, 5)], art: 136, ink: "#3f3b36" },
  vault_knight: { id: "vault_knight", undead: true, poisonImmune: true, name: "Vault knight", level: 62, hp: 85, attack: 52, strength: 50, defence: 58, magicDef: 20, attackBonus: 32, defenceBonus: 45, maxHit: 9, speed: 6, respawn: 55, wander: 4, aggressive: true, slayer: 45, weakness: "holy",
    examine: "Buried in its armour, under a stone with its name on. The name's worn off. The armour hasn't.", always: [one("large_bones", 1)], drops: [one("vault_key", 0.06), one("glimmer_cuirass", 0.02), one("rarite_ore", 0.05), one("grave_dust", 0.4, 1, 2), coins(80, 400, 0.65), one("vault_helm", 0.004), one("hollow_sigil", 0.12, 2, 5)], art: 137, ink: "#2f2d33" },
  howling_king: { id: "howling_king", undead: true, poisonImmune: true, name: "The Howling King", level: 96, hp: 280, attack: 84, strength: 86, defence: 76, magicDef: 40, attackBonus: 60, defenceBonus: 70, maxHit: 19, speed: 5, respawn: 200, wander: 2, size: 2, boss: true, aggressive: true, enrage: true, weakness: "holy", drain: { faith: 6 },
    examine: "The one the stones were raised for. The Wilds' game won't cross the ring because of what's under it.",
    always: [one("large_bones", 1, 2, 3), coins(1200, 3600, 1), one("grave_dust", 1, 3, 8)], drops: [one("vaultsteel_blade", 0.08), one("vault_helm", 0.07), one("vault_plate", 0.05), one("howling_cape", 0.06), one("rarite_bar", 0.3, 1, 3), one("hollow_essence", 0.15), one("insight_lamp", 0.04), one("vault_key", 0.3)], art: 138, ink: "#1b1a20" },
} satisfies Record<string, MonsterDef>);
// ---------- The Ring's guards, and the Seven: revenant and skeletal knights of the ages before the Ringmaker ----------
const SEVEN_DROPS = (extra: Drop[]): Drop[] => [coins(400, 1400, 0.8), one("rarite_bar", 0.25, 1, 2), one("hollow_essence", 0.2), one("insight_lamp", 0.04), one("grave_dust", 0.6, 2, 5), one("star_sigil", 0.4, 6, 14), ...extra];
Object.assign(MONSTERS, {
  stone_knight: { id: "stone_knight", poisonImmune: true, name: "Stone knight", level: 70, hp: 110, attack: 55, strength: 50, defence: 72, magicDef: 30, attackBonus: 30, defenceBonus: 60, maxHit: 10, speed: 6, respawn: 80, wander: 1, weakness: "earth",
    examine: "A knight of stone from ages before the Ringmaker, set to guard the Ring. It stands until a blade is drawn on it.", drops: [coins(100, 400, 0.7), one("stone_sigil", 0.3, 4, 10), one("glimmer_ore", 0.2, 1, 2), one("rough_sagestone", 0.05), one("rough_rosestone", 0.03), one("ringsteel_helm", 0.005)], art: 139, ink: "#6f6b66" },
  revenant_warden: { id: "revenant_warden", undead: true, poisonImmune: true, arenaOnly: true, name: "Revenant warden", level: 98, hp: 160, attack: 80, strength: 74, defence: 86, magicDef: 40, attackBonus: 50, defenceBonus: 70, maxHit: 15, speed: 5, respawn: 999, wander: 2, aggressive: true, weakness: "holy",
    examine: "The first of the Seven: a warden of the old kings, sword and shield, who never left his post.", always: [one("large_bones", 1)], drops: SEVEN_DROPS([one("vault_helm", 0.03)]), art: 140, ink: "#3a3a44" },
  revenant_lancer: { id: "revenant_lancer", undead: true, poisonImmune: true, arenaOnly: true, name: "Revenant lancer", level: 102, hp: 150, attack: 86, strength: 80, defence: 70, magicDef: 35, attackBonus: 56, defenceBonus: 50, maxHit: 17, speed: 5, respawn: 999, wander: 2, aggressive: true, weakness: "holy", ranged: 2,
    examine: "The second of the Seven: a lancer whose spear reaches two tiles, as it did on the field where he fell.", always: [one("large_bones", 1)], drops: SEVEN_DROPS([one("vault_plate", 0.02)]), art: 141, ink: "#403a3a" },
  revenant_hexer: { id: "revenant_hexer", undead: true, poisonImmune: true, arenaOnly: true, name: "Revenant hexer", level: 100, hp: 140, attack: 78, strength: 70, defence: 64, magicDef: 90, attackBonus: 48, defenceBonus: 44, maxHit: 16, speed: 5, respawn: 999, wander: 2, aggressive: true, attackStyle: "magic", weakness: "holy", drain: { faith: 6 },
    examine: "The third of the Seven: a hexer of the old court. Its curses take your faith with your blood.", always: [one("large_bones", 1)], drops: SEVEN_DROPS([one("drowned_staff", 0.02), one("thought_sigil", 0.6, 10, 25)]), art: 142, ink: "#2e2a3e" },
  skeletal_champion: { id: "skeletal_champion", undead: true, poisonImmune: true, arenaOnly: true, name: "Skeletal champion", level: 105, hp: 180, attack: 92, strength: 90, defence: 76, magicDef: 30, attackBonus: 60, defenceBonus: 56, maxHit: 20, speed: 6, respawn: 999, wander: 2, aggressive: true, weakness: "holy", enrage: true,
    examine: "The fourth of the Seven: a champion with a greatsword as long as you are, who fights harder the nearer he is to a second death.", always: [one("large_bones", 1)], drops: SEVEN_DROPS([one("vaultsteel_blade", 0.03)]), art: 143, ink: "#44403c" },
  skeletal_bowmaster: { id: "skeletal_bowmaster", undead: true, poisonImmune: true, arenaOnly: true, name: "Skeletal bowmaster", level: 99, hp: 140, attack: 88, strength: 72, defence: 60, magicDef: 30, attackBonus: 58, defenceBonus: 40, maxHit: 16, speed: 4, respawn: 999, wander: 2, aggressive: true, weakness: "holy", ranged: 6,
    examine: "The fifth of the Seven: a bowmaster who shoots from across the courtyard and never misses twice.", always: [one("large_bones", 1)], drops: SEVEN_DROPS([one("blackiron_arrow", 0.8, 20, 60), one("howling_cape", 0.02)]), art: 144, ink: "#3c3a36" },
  bone_juggernaut: { id: "bone_juggernaut", undead: true, poisonImmune: true, arenaOnly: true, name: "Bone juggernaut", level: 110, hp: 320, attack: 84, strength: 96, defence: 96, magicDef: 50, attackBonus: 50, defenceBonus: 80, maxHit: 22, speed: 7, respawn: 999, wander: 2, aggressive: true, weakness: "holy", size: 2, heals: 6,
    examine: "The sixth of the Seven: a juggernaut of many knights' bones, knitting itself back together as you cut it.", always: [one("large_bones", 1, 2, 3)], drops: SEVEN_DROPS([one("rarite_bar", 0.5, 2, 4), one("wildfur_helm", 0.01)]), art: 145, ink: "#2f2d2b" },
  revenant_king: { id: "revenant_king", undead: true, poisonImmune: true, arenaOnly: true, name: "The Revenant King", level: 120, hp: 400, attack: 100, strength: 100, defence: 92, magicDef: 70, attackBonus: 70, defenceBonus: 80, maxHit: 24, speed: 5, respawn: 999, wander: 2, aggressive: true, boss: true, weakness: "holy", size: 2, enrage: true, drain: { faith: 8 }, heals: 5,
    examine: "The last of the Seven: the king the others followed, crowned in the ages before the Ringmaker. He enrages, he drains, he mends. The Ring's hardest fight.", always: [one("large_bones", 1, 2, 4), coins(2000, 6000, 1)], drops: SEVEN_DROPS([one("vaultsteel_blade", 0.06), one("vault_plate", 0.05), one("wildfur_plate", 0.015), one("gilded_skull_mask", 0.03)]), art: 146, ink: "#26242c" },
} satisfies Record<string, MonsterDef>);
// ---------- The Root Cellars and the Mossy Undercroft: a dungeon for new heroes, and one for the middle of the road ----------
Object.assign(MONSTERS, {
  rat_king: { id: "rat_king", poisonWeak: 1.5, name: "The Rat King", level: 14, hp: 60, attack: 14, strength: 12, defence: 10, attackBonus: 10, defenceBonus: 8, maxHit: 4, speed: 4, respawn: 90, wander: 2, boss: true, aggressive: true, enrage: true, weakness: "fire",
    examine: "Rats knotted together by their tails into one furious thing, under the farms. The first boss a hero meets.", always: [one("bones", 1, 2, 3), coins(60, 200, 1)], drops: [one("oak_bow", 0.06), one("breeze_sigil", 0.5, 5, 12), one("bloom_sigil", 0.3, 3, 8), one("pewter_arrow", 0.4, 10, 25), one("insight_lamp", 0.01), one("blackiron_ore", 0.3, 1, 3)], art: 147, ink: "#4a3f3a" },
  moss_warden: { id: "moss_warden", poisonImmune: true, name: "The Moss Warden", level: 45, hp: 120, attack: 40, strength: 38, defence: 48, magicDef: 20, attackBonus: 26, defenceBonus: 36, maxHit: 8, speed: 5, respawn: 120, wander: 2, boss: true, aggressive: true, heals: 4, weakness: "fire",
    examine: "A warden of the old vaults under the Mossy Ruins, stone under a century of moss, mending itself with the damp.", always: [one("large_bones", 1), coins(200, 700, 1)], drops: [one("mossguard_shield", 0.08), one("moss_key", 0.3), one("rough_sagestone", 0.2), one("rough_rosestone", 0.08), one("glimmer_ore", 0.3, 1, 3), one("stone_sigil", 0.5, 6, 14), one("insight_lamp", 0.02)], art: 148, ink: "#4f5e3e" },
} satisfies Record<string, MonsterDef>);
// ---------- The Deadwood Maidens: a people of the east Deadwood, hostile until their truce is kept ----------
Object.assign(MONSTERS, {
  deadwood_maiden: { id: "deadwood_maiden", name: "Deadwood maiden", level: 58, hp: 70, attack: 52, strength: 46, defence: 50, magicDef: 30, attackBonus: 34, defenceBonus: 30, maxHit: 9, speed: 4, respawn: 60, wander: 3, aggressive: true, faction: "maidens", ranged: 3, weakness: "fire",
    examine: "A spearwoman of the Deadwood Maidens, who hold the east of the wood against the dead and against everyone else. Keep the truce and she keeps hers.",
    drops: [coins(40, 200, 0.6), one("blackiron_arrow", 0.3, 8, 20), one("grave_dust", 0.3), one("deadwood_logs", 0.4, 1, 3), one("bloom_sigil", 0.2, 3, 6)], art: 149, ink: "#3a3330" },
} satisfies Record<string, MonsterDef>);
export function combatLevelOf(monster: MonsterDef) { return monster.level; }

// ---------- Emotes ----------
/** Emotes: how long they play (ticks), and what unlocks the special ones. */
export const EMOTES = [
  { id: "wave", name: "Wave", ticks: 4 }, { id: "bow", name: "Bow", ticks: 4 }, { id: "dance", name: "Dance", ticks: 7 }, { id: "cheer", name: "Cheer", ticks: 5 },
  { id: "clap", name: "Clap", ticks: 4 }, { id: "laugh", name: "Laugh", ticks: 5 }, { id: "cry", name: "Cry", ticks: 5 }, { id: "think", name: "Think", ticks: 5 },
  { id: "jump", name: "Jump for joy", ticks: 4 }, { id: "yes", name: "Yes", ticks: 3 }, { id: "no", name: "No", ticks: 3 }, { id: "spin", name: "Spin", ticks: 4 },
  { id: "flex", name: "Flex", ticks: 4 },
  { id: "skillcape", name: "Skillcape", ticks: 8, needs: "a mastery cape (wear one)" },
  { id: "friendship", name: "Friendship", ticks: 8, needs: "the Friendship cape (wear it): refer a friend, or use a friend's code" },
] as const;
export type EmoteId = typeof EMOTES[number]["id"];

// ---------- Slayer ----------
/** Tasks the Warden hands out: the creatures that count, how many, and the combat level you need for them. */
export const SLAYER_TASKS = [
  { id: "rats", name: "ink rats", monsters: ["ink_rat"], min: 1, amount: [12, 20] },
  { id: "cows", name: "cows", monsters: ["cow"], min: 1, amount: [10, 18] },
  { id: "grumblins", name: "Grumblins", monsters: ["grumblin", "grumblin_chief"], min: 3, amount: [15, 30] },
  { id: "lurkers", name: "swamp lurkers", monsters: ["swamp_lurker"], min: 12, amount: [15, 30] },
  { id: "crawlers", name: "mire crawlers", monsters: ["mire_crawler"], min: 15, amount: [15, 30], slayer: 10 },
  { id: "bandits", name: "dune bandits", monsters: ["bandit"], min: 20, amount: [20, 40] },
  { id: "skeletons", name: "crypt skeletons", monsters: ["skeleton"], min: 22, amount: [20, 40] },
  { id: "wolves", name: "frost wolves", monsters: ["wolf"], min: 28, amount: [20, 40] },
  { id: "wisps", name: "frost wisps", monsters: ["frost_wisp"], min: 30, amount: [20, 40], slayer: 30 },
  { id: "colossi", name: "moss colossi", monsters: ["moss_colossus"], min: 38, amount: [15, 35] },
  { id: "shades", name: "shades", monsters: ["shade"], min: 40, amount: [20, 40] },
  { id: "yetis", name: "frost yetis", monsters: ["frost_yeti"], min: 50, amount: [15, 30] },
  { id: "hounds", name: "gloom hounds", monsters: ["gloom_hound"], min: 55, amount: [20, 40], slayer: 50 },
  { id: "thornbacks", name: "thornbacks", monsters: ["thornback"], min: 24, amount: [15, 30], slayer: 15 },
  { id: "wights", name: "cairn wights", monsters: ["cairn_wight"], min: 42, amount: [15, 35], slayer: 35 },
  { id: "stalkers", name: "dune stalkers", monsters: ["dune_stalker"], min: 50, amount: [15, 35], slayer: 45 },
  { id: "salamanders", name: "ember salamanders", monsters: ["ember_salamander"], min: 64, amount: [15, 30], slayer: 60 },
  { id: "weavers", name: "Hollow weavers", monsters: ["hollow_weaver"], min: 80, amount: [10, 25], slayer: 75 },
  { id: "sentinels", name: "hollow sentinels", monsters: ["hollow_sentinel"], min: 60, amount: [20, 40] },
  { id: "drakes", name: "drakes", monsters: ["ash_drake", "cinder_drake"], min: 70, amount: [10, 25] },
  { id: "bats", name: "cave bats", monsters: ["cave_bat"], min: 5, amount: [15, 30] },
  { id: "crabs", name: "glass crabs", monsters: ["glass_crab"], min: 18, amount: [15, 30] },
  { id: "moths", name: "grave moths", monsters: ["grave_moth"], min: 28, amount: [15, 30], slayer: 20 },
  { id: "drowned", name: "drowned scholars", monsters: ["drowned_scholar"], min: 32, amount: [15, 35] },
  { id: "wraiths", name: "ink wraiths", monsters: ["ink_wraith"], min: 48, amount: [15, 30], slayer: 40 },
  { id: "vault_dead", name: "the vault dead", monsters: ["vault_archer", "vault_knight"], min: 55, amount: [15, 35], slayer: 45 },
] as const;
export type SlayerTask = typeof SLAYER_TASKS[number];
/** What Slayer points buy from the Warden. */
export const SLAYER_REWARDS = [
  { id: "skip", name: "Cancel my task", cost: 30, text: "A new task, and your streak stays." },
  { id: "slayer_helm", name: "Warden's helm", cost: 150, text: "+15% accuracy and damage on task (Slayer 20, Defence 10)." },
  { id: "gloomfang_bow", name: "Gloomfang bow", cost: 600, text: "The Warden's own bow (Ranged 60)." },
  { id: "insight_lamp", name: "Lamp of insight", cost: 100, text: "Experience in a skill of your choice." },
  { id: "warden_bracers", name: "Warden's bracers", cost: 250, text: "+10% Slayer XP on task (Slayer 30)." },
  { id: "long", name: "Longer tasks", cost: 100, text: "Tasks half as long again, and they pay half as many points again. Buy it again to turn it off." },
] as const;

// ---------- NPCs, shops ----------
/** Kinds of goods merchants buy. */
export type Category = "fish" | "logs" | "ore" | "bar" | "gem" | "hide" | "bow" | "arrow" | "sigil" | "armour" | "weapon" | "magic" | "food" | "bones" | "jewellery" | "other";
export function itemCategory(id: string): Category {
  const it = item(id), shape = it.icon.shape, slot = it.equip?.slot;
  if (shape === "fish") return "fish";
  if (shape === "log") return "logs";
  if (id === "sigil_stone" || shape === "sigil") return "sigil";
  if (shape === "ore" || shape === "material") return "ore";
  if (shape === "bar") return "bar";
  if (shape === "gem" && id !== "slayer_gem") return "gem";
  if (shape === "hide" || shape === "leather" || id.startsWith("drakehide") || id.startsWith("leather_") || id.startsWith("hunter_") || id.startsWith("frosthide")) return "hide";
  if (shape === "bow" || shape === "warbow" || shape === "crossbow" || shape === "limbs" || shape === "stock") return "bow";
  if (shape === "arrow" || shape === "arrowheads" || shape === "bolts") return "arrow";
  if (it.equip?.staff || id.startsWith("scholar")) return "magic";
  if (shape === "amulet" || id === "wyrm_heart") return "jewellery";
  if (slot === "weapon") return "weapon";
  if (slot && slot !== "cape") return "armour";
  if (it.heal) return "food";
  if (it.bones) return "bones";
  return "other";
}
export type ShopDef = { id: string; name: string; stock: readonly string[]; general?: boolean; buys?: readonly Category[]; rate?: number;
  /** What it's paid in when not coins (the Ring's bloodmarks and laurels): an item id. Such shops buy nothing back. */
  currency?: string };
/** Clothes that are only had by earning them (quest rewards, the rarest drops): never on a clothier's rail. */
const QUEST_CLOTHES = new Set(["maiden_veil", "rarian_mantle", "scorched_cloak"]);
export const SHOPS: Record<string, ShopDef> = {
  // The four Orders' quartermasters (open once their oath is sworn), and the Deadwood Maidens' market (once the truce is kept).
  diamond_armoury: { id: "diamond_armoury", name: "The Diamond Armoury", buys: ["weapon", "armour"], rate: 0.5, stock: orderStock("diamond") },
  // Return of Raria: the Federation's shops at the FFF Fortress (open once the Federation knows your name), Raria's (once you hold a writ), the Order of Dusk's, and BarkReach's.
  fff_armoury: { id: "fff_armoury", name: "The Federation Armoury", buys: ["weapon", "armour", "bow", "arrow"], rate: 0.55, stock: ["fff_sword", "fff_greatsword", "fff_glaive", "fff_mace", "fff_tower_shield", "fff_heater", "fff_helm", "fff_cuirass", "fff_greaves", "fff_gauntlets", "fff_boots", "fff_warcaster_plate", "fff_skirmisher_jerkin",
    "fff_longbow", "fff_repeater", "fff_arcane_bow", "fff_ranger_hood", "fff_ranger_jerkin", "fff_ranger_chaps", "fff_ranger_bracers", "fff_broadheads", "fff_bolts", "fff_cape_knight", "fff_cape_ranger"] },
  fff_arcanum: { id: "fff_arcanum", name: "The Wizard Tower's Arcanum", buys: ["magic", "sigil"], rate: 0.55, stock: ["fff_wizard_robe", "fff_reinforced_robe", "fff_battle_robe", "fff_mage_coat", "fff_wizard_hat", "fff_hood", "fff_spellward", "fff_arcane_shield", "fff_staff", "fff_wand", "fff_spellbook", "fff_cape_magical", "fff_device_pack", "fff_tinker_ring", "fff_focus_amulet", "fff_cape_wizard",
    "breeze_sigil", "thought_sigil", "tide_sigil", "stone_sigil", "ember_sigil", "storm_sigil", "star_sigil", "shade_sigil", "bloom_sigil"] },
  fff_workshop: { id: "fff_workshop", name: "The Artisan Workshops", buys: ["ore", "bar", "logs", "gem", "other"], rate: 0.6, stock: ["fff_tinker_hammer", "fff_goggles", "fff_apron", "fff_cape_artisan", "hammer", "knife", "chisel", "needle", "thread", "tinderbox", "inkcoal", "moonsilver_bar", "ashsteel_bar", "blackiron_bar", "moonsilver_limbs", "ashsteel_limbs", "ashwood_stock", "pine_logs", "ash_logs", "stag_antler", "vial"] },
  fff_outfitter: { id: "fff_outfitter", name: "Free Clothes", buys: [], rate: 0.5, stock: ["fff_cap", "fff_tunic", "fff_trousers", "fff_workboots"] },
  raria_armoury: { id: "raria_armoury", name: "The Regimental Stores", buys: ["weapon", "armour"], rate: 0.5, stock: ["rrr_helm", "rrr_cuirass", "rrr_greaves", "rrr_gauntlets", "rrr_boots", "rrr_heater", "rrr_banner", "rarian_sword", "rarian_greatsword", "rarian_spear", "rarian_halberd", "rarian_dagger", "rarian_crossbow", "rarian_bow", "moonsilver_bolts", "moonsilver_arrow"] },
  raria_faith: { id: "raria_faith", name: "The Chapel of the Law's Stores", buys: ["bones"], rate: 0.5, stock: ["wise_cowl", "wise_vestment", "wise_skirts", "wise_sandals", "wise_pavise", "rarian_mace", "faith_banner", "ritual_scroll_case", "law_book", "faith_potion", "law_sigil"] },
  raria_mage: { id: "raria_mage", name: "The Office of Sigils", buys: ["sigil", "magic"], rate: 0.5, stock: ["rarian_staff", "sigil_frame", "law_sigil", "dusk_sigil", "crown_sigil", "thought_sigil", "stone_sigil", "ember_sigil", "shade_sigil", "tide_sigil", "path_sigil"] },
  raria_inn: { id: "raria_inn", name: "The Seventh Prayer", buys: ["food"], rate: 0.5, stock: [...barStock("lawful_beer"), "cooked_chicken", "bucket_of_milk", "egg"] },
  // The bars (bars.ts): each barkeep's, and the quiet traders' (the same goods in every bar).
  bar_vat: { id: "bar_vat", name: "The Crooked Vat", buys: ["food"], rate: 0.5, stock: barStock("madder_wine") },
  bar_hound: { id: "bar_hound", name: "The Obedient Hound", buys: ["food"], rate: 0.5, stock: barStock("hounds_bite") },
  bar_freepour: { id: "bar_freepour", name: "The Free Pour", buys: ["food"], rate: 0.5, stock: barStock("free_cider") },
  fence: { id: "fence", name: "The quiet trader", buys: ["other"], rate: 0.6, stock: ["sleight_gloves", "softsole_boots", "stealth_draught", "veilweave_hood", "weak_poison", "antidote"] },
  vesper_reliquary: { id: "vesper_reliquary", name: "The Abbey Reliquary", buys: ["bones"], rate: 0.6, stock: ["dusk_sigil", "law_sigil", "shade_sigil", "wise_cowl", "wise_vestment", "wise_skirts", "wise_sandals", "law_book", "ritual_scroll_case", "faith_potion"] },
  raria_clothier: { id: "raria_clothier", name: "The Sumptuary Office", buys: [], rate: 0.5, stock: ["rarian_veil", "rarian_tabard", "rarian_skirts", "rarian_slippers", "rarian_mantle"] },
  raria_general: { id: "raria_general", name: "The Provisioner of the Crown", general: true, buys: ["food", "other", "fish"], rate: 0.5, stock: ["bread", "cake", "pot", "bucket", "tinderbox", "knife", "hammer", "vial"] },
  dusk_armoury: { id: "dusk_armoury", name: "The Dusk Armoury", buys: ["weapon", "armour"], rate: 0.5, stock: orderStock("dusk") },
  woods_end_post: { id: "woods_end_post", name: "The Wood's End Trading Post", general: true, buys: ["logs", "hide", "food", "arrow", "bow", "other"], rate: 0.55, stock: ["bread", "cooked_meat", "cooked_chicken", "pewter_arrow", "blackiron_arrow", "broadhead_arrow", "arrow_shaft", "feather", "string", "knife", "tinderbox", "pewter_axe", "blackiron_axe", "hammer", "bucket", "vial", "leather", "cowhide", "stag_antler", "redwood_logs"] },
  barkreach_fletcher: { id: "barkreach_fletcher", name: "The Antler and Bow", buys: ["bow", "arrow", "logs"], rate: 0.55, stock: ["redwood_bow", "ironbark_bow", "redwood_war_bow", "broadhead_arrow", "arrow_shaft", "feather", "string", "redwood_logs", "ironbark_logs", "stag_antler"] },
  barkreach_lumber: { id: "barkreach_lumber", name: "The Heartwood Yard", buys: ["logs"], rate: 0.7, stock: ["pewter_axe", "blackiron_axe", "ashsteel_axe", "moonsilver_axe", "redwood_logs", "ironbark_logs", "logs", "oak_logs", "tinderbox"] },
  barkreach_outfitter: { id: "barkreach_outfitter", name: "Resin and Hide", buys: ["hide"], rate: 0.5, stock: ["woodsman_cap", "woodsman_jerkin", "woodsman_breeches", "woodsman_boots", "cowhide", "leather"] },
  ink_armoury: { id: "ink_armoury", name: "The Ink Armoury", buys: ["weapon", "armour"], rate: 0.5, stock: orderStock("ink") },
  sol_armoury: { id: "sol_armoury", name: "The Sol Armoury", buys: ["weapon", "armour"], rate: 0.5, stock: orderStock("sol") },
  hood_armoury: { id: "hood_armoury", name: "The Hood Armoury", buys: ["weapon", "armour"], rate: 0.5, stock: orderStock("hood") },
  ember_armoury: { id: "ember_armoury", name: "The Ember Armoury", buys: ["weapon", "armour"], rate: 0.5, stock: orderStock("ember") },
  maidens_market: { id: "maidens_market", name: "The Maidens' Market", buys: ["bones", "logs"], rate: 0.6, stock: ["rarite_ore", "hollow_essence", "gloom_shard", "wyrm_scale", "cinder_core", "crystal_shard", "grave_dust", "ink_page", "hollow_sigil", "star_sigil", "path_sigil", "shade_sigil", "vault_key", "archive_key", "deepglass_key", "moss_key", "antidote", "deadwood_logs", "maiden_veil", "maiden_mail", "maiden_skirt", "maiden_boots"] },
  // The Rare Friends Ring's concourse: everything a fighter needs, and two shops that take only what the Ring pays out.
  ring_potions: { id: "ring_potions", name: "The Ring Apothecary", buys: ["food"], rate: 0.5, stock: ["healing_tonic", "saltwort_tonic", "attack_potion", "strength_potion", "defence_potion", "ranged_potion", "magic_potion", "faith_potion", "energy_draught", "antidote", "bread", "cooked_meat", "sailfish"] },
  ring_faith: { id: "ring_faith", name: "The Ring Chapel Stores", buys: ["bones"], rate: 0.5, stock: ["faith_potion", "star_sigil", "bloom_sigil", "shade_sigil", "acolyte_hood", "acolyte_vestment", "acolyte_leggings", "acolyte_gloves", "acolyte_sandals", "pewter_mace", "blackiron_mace", "ashsteel_mace", "pewter_aegis", "blackiron_aegis"] },
  ring_mage: { id: "ring_mage", name: "The Ring Sigil Stall", buys: ["sigil", "magic"], rate: 0.5, stock: ["breeze_sigil", "tide_sigil", "stone_sigil", "ember_sigil", "thought_sigil", "shade_sigil", "star_sigil", "path_sigil", "breeze_staff", "tide_staff", "stone_staff", "ember_staff", "sigil_box"] },
  ring_range: { id: "ring_range", name: "The Ring Fletchery", buys: ["bow", "arrow"], rate: 0.5, stock: ["shortbow", "oak_bow", "willow_bow", "maple_bow", "yew_bow", "pewter_arrow", "blackiron_arrow", "ashsteel_arrow", "moonsilver_arrow", "glimmer_arrow", "hunter_coif", "hunter_vest", "hunter_chaps", "hunter_bracers"] },
  ring_armour: { id: "ring_armour", name: "The Ring Armoury", buys: ["weapon", "armour"], rate: 0.5, stock: ["pewter_helm", "pewter_boots", "pewter_sword", "blackiron_helm", "blackiron_boots", "blackiron_sword", "ashsteel_helm", "ashsteel_boots", "ashsteel_sword", "moonsilver_helm", "moonsilver_boots", "moonsilver_sword", "glimmer_helm", "glimmer_boots", "glimmer_sword", "ringbreaker"] },
  ring_weapons: { id: "ring_weapons", name: "Edgewright's Blades", buys: ["weapon"], rate: 0.5, stock: ["pewter", "blackiron", "ashsteel", "moonsilver", "glimmer"].flatMap(metal => ["dagger", "sword", "sabre", "greatsword", "battleaxe", "warhammer"].map(piece => `${metal}_${piece}`)) },
  ring_pit: { id: "ring_pit", name: "The Pit Quartermaster", currency: "bloodmark", stock: ["skull_mask", "horned_skull_mask", "bloodmark_cape", "pitfighter_helm", "pitfighter_plate", "pitfighter_greaves", "ringsteel_helm", "ringsteel_plate", "ringsteel_greaves", "wildfur_helm", "wildfur_plate", "wildfur_greaves"] },
  ring_champions: { id: "ring_champions", name: "The Champions' Hall", currency: "laurel", stock: ["duelists_gauntlets", "laurel_crown", "champions_cape", "gilded_skull_mask"] },
  // The wider world's villages: a clothier in each, and the shop its trade is built on.
  gravesend_clothier: { id: "gravesend_clothier", name: "Mira's Mourning Wear", buys: ["other"], rate: 0.5, stock: REGIONAL_CLOTHING.find(set => set.region === "gravesend")!.pieces.map(piece => piece.id) },
  saltmarrow_clothier: { id: "saltmarrow_clothier", name: "The Oilskin Locker", buys: ["other"], rate: 0.5, stock: REGIONAL_CLOTHING.find(set => set.region === "saltmarrow")!.pieces.map(piece => piece.id) },
  hollyhock_herbs: { id: "hollyhock_herbs", name: "Mother Yarrow's Bench", buys: ["other"], rate: 0.6, stock: ["vial_of_water", "vial", "mortar", "feverleaf", "saltwort", "healing_tonic", "antidote"] },
  hollyhock_clothier: { id: "hollyhock_clothier", name: "Petal & Pocket", buys: ["other"], rate: 0.5, stock: REGIONAL_CLOTHING.find(set => set.region === "hollyhock")!.pieces.map(piece => piece.id) },
  // Dyemoor, the dyers' town: the dyes themselves, and three more clothiers selling what the rest of the Realm wears.
  dyemoor_dyes: { id: "dyemoor_dyes", name: "The Dyeworks: dyes", buys: ["other"], rate: 0.4, stock: [...DYES.map(dye => `dye_${dye.id}`), "dye_lye"] },
  dyemoor_wardrobe: { id: "dyemoor_wardrobe", name: "The Wide Wardrobe", buys: ["other"], rate: 0.5,
    stock: REGIONAL_CLOTHING.filter(set => ["maidens", "gravesend", "saltmarrow", "hollyhock", "tallgrass", "cragmaw", "quillhaven", "ashfall"].includes(set.region)).flatMap(set => set.pieces.map(piece => piece.id)).filter(id => !QUEST_CLOTHES.has(id)) },
  dyemoor_farloom: { id: "dyemoor_farloom", name: "The Far Loom", buys: ["other"], rate: 0.5,
    stock: REGIONAL_CLOTHING.filter(set => ["raria", "fff", "barkreach"].includes(set.region)).flatMap(set => set.pieces.map(piece => piece.id)).filter(id => !QUEST_CLOTHES.has(id)) },
  dyemoor_madder: { id: "dyemoor_madder", name: "The Madder Rose", buys: ["other"], rate: 0.5, stock: CLOTHING.map(entry => entry.id).filter(id => /_(shirt|tunic|dress|trousers|skirt|wide_hat|feathered_cap|wizard_hat)$/.test(id)) },
  dyemoor_clothier: { id: "dyemoor_clothier", name: "The Dyeworks", buys: ["other"], rate: 0.5, stock: REGIONAL_CLOTHING.find(set => set.region === "dyemoor")!.pieces.map(piece => piece.id) },
  tallgrass_clothier: { id: "tallgrass_clothier", name: "Hide & Seek Outfitters", buys: ["other"], rate: 0.5, stock: REGIONAL_CLOTHING.find(set => set.region === "tallgrass")!.pieces.map(piece => piece.id) },
  cragmaw_clothier: { id: "cragmaw_clothier", name: "The Warm Hearth", buys: ["other"], rate: 0.5, stock: REGIONAL_CLOTHING.find(set => set.region === "cragmaw")!.pieces.map(piece => piece.id) },
  quillhaven_clothier: { id: "quillhaven_clothier", name: "Quillhaven Vestry", buys: ["other"], rate: 0.5, stock: REGIONAL_CLOTHING.find(set => set.region === "quillhaven")!.pieces.map(piece => piece.id) },
  ashfall_trader: { id: "ashfall_trader", name: "Tamsin's Embers", buys: ["ore", "other"], rate: 0.5, stock: [...REGIONAL_CLOTHING.find(set => set.region === "ashfall")!.pieces.map(piece => piece.id), "cooked_meat", "bread", "inkcoal"] },
  gravesend_general: { id: "gravesend_general", name: "The Last Lantern", general: true, stock: ["tinderbox", "bones", "large_bones", "bread", "cooked_meat", "hammer", "knife", "moonsilver_cuirass", "moonsilver_greaves", "moonsilver_helm"] },
  // Cragmaw's armoury: the Ironreach smiths work glimmer and rarite into everything, the only place that sells the lot. Worth the journey.
  cragmaw_armoury: { id: "cragmaw_armoury", name: "Ironreach Armoury", buys: ["weapon", "armour", "bar"], rate: 0.65, stock: [...SMITH_PIECES.map(piece => `glimmer_${piece.piece}`), ...SMITH_PIECES.map(piece => `rarite_${piece.piece}`)] },
  saltmarrow_fish: { id: "saltmarrow_fish", name: "Saltmarrow Fish Market", buys: ["fish"], rate: 0.7, stock: ["small_net", "fishing_rod", "fly_rod", "harpoon", "crab_pot", "fishing_bait", "feather", "raw_sailfish", "raw_inkcrab", "inkshark", "sailfish"] },
  cragmaw_ore: { id: "cragmaw_ore", name: "Cragmaw Ore Exchange", buys: ["ore", "bar"], rate: 0.75, stock: ["hammer", "blackiron_pickaxe", "ashsteel_pickaxe", "moonsilver_pickaxe", "blackiron_ore", "inkcoal", "moonsilver_ore", "blackiron_bar", "ashsteel_bar", "inkcoal_satchel"] },
  tallgrass_hunting: { id: "tallgrass_hunting", name: "Tallgrass Hunting Post", buys: ["hide", "bow", "arrow"], rate: 0.6, stock: ["shortbow", "oak_bow", "willow_bow", "pewter_arrow", "blackiron_arrow", "ashsteel_arrow", "hunter_coif", "hunter_vest", "hunter_chaps", "hunter_bracers", "leather", "cowhide"] },
  quillhaven_sigils: { id: "quillhaven_sigils", name: "The Quillhaven Scriptorium", buys: ["sigil", "magic"], rate: 0.65, stock: ["sigil_box", "breeze_sigil", "tide_sigil", "stone_sigil", "ember_sigil", "thought_sigil", "shade_sigil", "star_sigil", "path_sigil", "staff", "scholar_hat", "scholar_robe", "scholar_skirt"] },
  dyemoor_tailor: { id: "dyemoor_tailor", name: "Dyemoor Bolts & Thread", buys: ["other"], rate: 0.5, stock: ["needle", "thread", "wool", "string", "silk", ...TAILOR_STOCK.filter(id => id.endsWith("_cape")).slice(0, 10)] },
  mender: { id: "mender", name: "Hale's Infirmary", buys: ["food"], rate: 0.5, stock: [...HEARTGUARD.map(piece => piece.id), "bread", "cake", "waybread"] },
  general: { id: "general", name: "Friendhollow General Store", general: true, stock: ["shears", "pot", "bucket", "tinderbox", "hammer", "knife", "chisel", "needle", "thread", "small_net", "pewter_axe", "pewter_pickaxe", "bread", "team_cape"] },
  general_ember: { id: "general_ember", name: "Emberforge General Store", general: true, stock: ["pot", "bucket", "tinderbox", "hammer", "knife", "chisel", "pewter_pickaxe", "pewter_axe", "bread", "cooked_meat"] },
  general_frost: { id: "general_frost", name: "Frostpeak Trading Post", general: true, stock: ["pot", "bucket", "tinderbox", "hammer", "knife", "needle", "thread", "pewter_axe", "bread", "cooked_meat", "fishing_bait"] },
  general_oasis: { id: "general_oasis", name: "Oasis Sundries", general: true, stock: ["pot", "bucket", "tinderbox", "knife", "chisel", "needle", "thread", "small_net", "fishing_bait", "bread"] },
  fishing: { id: "fishing", name: "Pike's Tackle", buys: ["fish"], rate: 0.6, stock: ["small_net", "fishing_rod", "fly_rod", "harpoon", "crab_pot", "fishing_bait", "feather", "raw_minnows"] },
  axes: { id: "axes", name: "Axel's Axes", buys: ["logs"], rate: 0.6, stock: ["pewter_axe", "blackiron_axe", "ashsteel_axe", "moonsilver_axe", "pewter_pickaxe", "blackiron_pickaxe", "ashsteel_pickaxe", "moonsilver_pickaxe"] },
  swords: { id: "swords", name: "Emberforge Arms", buys: ["ore", "bar", "weapon", "armour"], rate: 0.55, stock: ["pewter_sword", "blackiron_sword", "ashsteel_sword", "pewter_sabre", "blackiron_sabre", "ashsteel_sabre", "moonsilver_sabre", "pewter_shield", "blackiron_shield", "blackiron_helm", "blackiron_gauntlets", "blackiron_boots", "ashsteel_helm", "ashsteel_gauntlets", "ashsteel_boots", "blackiron_cuirass"] },
  sigils: { id: "sigils", name: "Runa's Sigils", buys: ["sigil", "magic"], rate: 0.6, stock: ["sigil_box", "breeze_sigil", "tide_sigil", "stone_sigil", "ember_sigil", "thought_sigil", "shade_sigil", "storm_sigil", "bloom_sigil", "star_sigil", "path_sigil", "hollow_sigil", "staff", "breeze_staff", "scholar_hat", "scholar_robe"] },
  armoury: { id: "armoury", name: "The Order Armoury", buys: ["weapon"], rate: 0.5, stock: [...ARMOURY_FIRST, ...ARMOURY_LATER, ...Object.keys(DAWNPLATE_QUEST)] },
  clothier: { id: "clothier", name: "Ribbon & Rye Clothiers", buys: ["armour"], rate: 0.5, stock: CLOTHIER_STOCK },
  tailor: { id: "tailor", name: "Threadneedle Tailors", buys: ["armour"], rate: 0.5, stock: ["team_cape", ...TAILOR_STOCK, "scholar_hat"] },
  crafting: { id: "crafting", name: "Tessa's Tannery", buys: ["hide"], rate: 0.6, stock: ["needle", "thread", "chisel", "carving_gouge", "leather", "leather_gloves", "leather_boots"] },
  oasis: { id: "oasis", name: "Oasis Bazaar", buys: ["gem", "jewellery", "food"], rate: 0.7, stock: ["cake", "bread", "inkshark", "sailfish", "silk", "rough_moonstone", "friends_charm", "moonstone_pendant"] },
  frost: { id: "frost", name: "Frostpeak Outfitters", stock: ["inkcrab", "sailfish", "glimmer_pickaxe", "glimmer_axe", "glimmer_sabre", "glimmer_helm", "glimmer_gauntlets", "glimmer_boots", "glimmer_shield", "hollow_sigil", "path_sigil", "frosthide_coif", "frosthide_bracers", "glimmer_arrow",
    "rarite_pickaxe", "rarite_axe", "frostsilver_pickaxe", "frostsilver_axe", "frostsilver_sword", "frostsilver_helm", "frostsilver_gauntlets", "frostsilver_boots", "frostsilver_shield", "frostsilver_arrow", "frostsilver_bolts"] },
  armour: { id: "armour", name: "Hollis Armoury", buys: ["armour"], rate: 0.55, stock: ["pewter_helm", "pewter_gauntlets", "pewter_boots", "pewter_cuirass", "pewter_greaves", "pewter_shield", "blackiron_helm", "blackiron_gauntlets", "blackiron_boots", "blackiron_cuirass", "blackiron_greaves", "blackiron_shield",
    "ashsteel_helm", "ashsteel_gauntlets", "ashsteel_boots", "ashsteel_cuirass", "ashsteel_greaves", "ashsteel_shield", "moonsilver_helm", "moonsilver_gauntlets", "moonsilver_boots", "moonsilver_shield", "leather_gloves", "leather_boots"] },
  weapons: { id: "weapons", name: "Edge & Hilt", buys: ["weapon"], rate: 0.55, stock: ["pewter_dagger", "pewter_sword", "pewter_sabre", "blackiron_dagger", "blackiron_sword", "blackiron_sabre", "ashsteel_dagger", "ashsteel_sword", "ashsteel_sabre",
    "moonsilver_dagger", "moonsilver_sword", "moonsilver_sabre", "glimmer_sword"] },
  archery: { id: "archery", name: "Fletch & Feather", buys: ["bow", "arrow", "logs"], rate: 0.6, stock: ["string", "knife", "arrow_shaft", "headless_arrow", "shortbow", "oak_bow", "willow_bow", "maple_bow", "yew_bow", "pewter_arrow", "blackiron_arrow", "ashsteel_arrow", "moonsilver_arrow",
    "pewter_crossbow", "blackiron_crossbow", "ashsteel_crossbow", "pewter_bolts", "blackiron_bolts", "ashsteel_bolts",
    "hunter_coif", "hunter_vest", "hunter_chaps", "hunter_bracers", "feather"] },
  general_highcairn: { id: "general_highcairn", name: "Highcairn Stores", general: true, stock: ["shears", "pot", "bucket", "tinderbox", "hammer", "knife", "chisel", "needle", "thread", "bread", "cooked_meat", "fishing_rod", "feather"] },
  kettle: { id: "kettle", name: "The Stone Kettle", buys: ["fish", "food"], rate: 0.55, stock: [...barStock("cairn_porter"), "char", "grayling", "sailfish"] },
  cairn_forge: { id: "cairn_forge", name: "Highcairn Forge", buys: ["ore", "bar", "weapon", "armour"], rate: 0.6, stock: ["hammer", "moonsilver_pickaxe", "glimmer_pickaxe", "rarite_pickaxe", "inkcoal", "moonsilver_bar", "glimmer_bar", "glimmer_helm", "glimmer_gauntlets", "glimmer_boots", "glimmer_shield", "rarite_helm", "rarite_gauntlets", "rarite_boots", "inkcoal_satchel"] },
  heft: { id: "heft", name: "Heft & Haft", buys: ["weapon"], rate: 0.55, stock: ["pewter_greatsword", "pewter_battleaxe", "pewter_warhammer", "blackiron_greatsword", "blackiron_battleaxe", "blackiron_warhammer",
    "ashsteel_greatsword", "ashsteel_battleaxe", "ashsteel_warhammer", "moonsilver_greatsword", "moonsilver_battleaxe", "moonsilver_warhammer", "glimmer_greatsword"] },
  mine_supplies: { id: "mine_supplies", name: "Old miner's supplies", buys: ["ore"], rate: 0.5, stock: ["pewter_pickaxe", "blackiron_pickaxe", "ashsteel_pickaxe", "moonsilver_pickaxe", "inkcoal_satchel", "hammer", "bread"] },
  // Fernwick, the woodcutters' village: the only place that sells war bows, and the best price for logs.
  war_bows: { id: "war_bows", name: "Hazel's War Bows", buys: ["bow", "arrow"], rate: 0.6, stock: ["string", "war_bow", "oak_war_bow", "willow_war_bow", "maple_war_bow", "yew_war_bow",
    "moonsilver_crossbow", "wooden_stock", "oak_stock", "willow_stock", "pewter_bolts", "blackiron_bolts", "ashsteel_bolts", "moonsilver_bolts", "pewter_arrow", "blackiron_arrow", "ashsteel_arrow", "feather", "knife"] },
  timber: { id: "timber", name: "Fernwick Timber Yard", buys: ["logs"], rate: 0.75, stock: ["pewter_axe", "blackiron_axe", "ashsteel_axe", "moonsilver_axe", "knife", "tinderbox", "logs", "oak_logs", "willow_logs", "bread", "cooked_meat"] },
  slayer: { id: "slayer", name: "The Warden's Lodge", stock: ["slayer_gem", "inkcrab", "sailfish", "tablet_hollow_square", "blackiron_arrow", "ashsteel_arrow", "leather_boots"] },
  inn: { id: "inn", name: "The Sleepy Friend", buys: ["fish", "food"], rate: 0.55, stock: [...barStock("sleepy_stout"), "cooked_chicken", "carp", "grayling"] },
  wizards: { id: "wizards", name: "The Tower Stores", buys: ["sigil", "magic"], rate: 0.6, stock: ["sigil_box", "breeze_sigil", "tide_sigil", "stone_sigil", "ember_sigil", "thought_sigil", "shade_sigil", "star_sigil",
    "staff", "breeze_staff", "tide_staff", "stone_staff", "ember_staff", "scholar_hat", "scholar_robe", "scholar_skirt", "tablet_hollow_square"] },
  bones: { id: "bones", name: "Bone Collector", buys: ["bones", "hide"], rate: 0.65, stock: ["bones", "large_bones"] },
  capes: { id: "capes", name: "The Keeper of Capes", stock: [...SKILLS.map(skill => `${skill}_cape`), "grandmaster_cape"] },
};
/**
 * Whole sets: any shop that sells a helm and boots of a metal sells its cuirass, greaves, gauntlets and shield too (and a
 * shop with two pieces of leather sells all of it). Nobody should have to walk the Realm for the chest and legs.
 */
const SET_PIECES = ["helm", "cuirass", "greaves", "gauntlets", "boots", "shield", "roundshield", "aegis"] as const, LEATHER_SET = ["leather_hood", "leather_jerkin", "leather_leggings", "leather_bracers", "leather_gloves", "leather_boots"];
for (const shop of Object.values(SHOPS)) {
  const stock = [...shop.stock], metals = new Set<string>();
  for (const id of stock) { const m = id.match(/^([a-z]+)_(helm|cuirass|greaves|gauntlets|boots|shield)$/); if (m) metals.add(m[1]); }
  for (const metal of metals) for (const piece of SET_PIECES) { const id = `${metal}_${piece}`; if (isItem(id) && !stock.includes(id)) stock.push(id); }
  if (stock.filter(id => LEATHER_SET.includes(id)).length >= 2) for (const id of LEATHER_SET) if (isItem(id) && !stock.includes(id)) stock.push(id);
  (shop as { stock: readonly string[] }).stock = stock;
}
// Belts where their trades are taught, and vials of water (and empty vials) in every village's store, so brewers never run dry.
const addStock = (ids: readonly string[], items: readonly string[]) => { for (const id of ids) { const shop = SHOPS[id]; if (!shop) continue; const stock = [...shop.stock]; for (const item of items) if (!stock.includes(item)) stock.push(item); (shop as { stock: readonly string[] }).stock = stock; } };
addStock(["hollyhock_herbs", "mender"], ["apothecary_belt"]);
addStock(["war_bows", "archery", "tallgrass_hunting"], ["fletchers_belt"]);
// Faith weapons sell beside the swords and war hammers of their metal.
for (const shop of Object.values(SHOPS)) { const stock = [...shop.stock]; for (const id of shop.stock) { const m = id.match(/^([a-z]+)_(sword|warhammer)$/); if (!m) continue; const holy = `${m[1]}_${m[2] === "sword" ? "mace" : "flail"}`; if (isItem(holy) && !stock.includes(holy)) stock.push(holy); } (shop as { stock: readonly string[] }).stock = stock; }
addStock(["general", "general_ember", "general_frost", "general_oasis", "general_highcairn", "gravesend_general", "saltmarrow_fish", "hollyhock_herbs", "dyemoor_tailor", "tallgrass_hunting", "cragmaw_ore", "quillhaven_sigils", "kettle", "frost", "wizards", "ashfall_trader"], ["vial_of_water", "vial"]);
// Craftwork: a carving gouge in every general store (and Tessa's), and the logs to carve at BarkReach's trading post.
addStock(["general", "general_ember", "general_frost", "general_oasis", "general_highcairn", "gravesend_general"], ["carving_gouge"]);
// ---------- Pets ----------
/** Little companions found by chance while you train (1 in `odds` per action, luckier at higher levels). */
export type PetDef = { id: string; name: string; from: string; odds: number; text: string };
export const PETS: readonly PetDef[] = [
  { id: "stumpy", name: "Stumpy", from: "Woodcutting", odds: 700, text: "A tree stump with ideas above its station, and a leaf on top." },
  { id: "pebble", name: "Pebble", from: "Mining", odds: 700, text: "A rock that followed you home. It sparkles when it's happy." },
  { id: "bubbles", name: "Bubbles", from: "Fishing", odds: 700, text: "A tiny fish in its own floating bubble." },
  { id: "mote", name: "Mote", from: "Sigilcraft", odds: 250, text: "A speck of sigil light that likes your company." },
  { id: "emberling", name: "Emberling", from: "Dragons", odds: 60, text: "A baby drake. Mostly harmless. Mostly." },
  { id: "cinderkin", name: "Cinderkin", from: "The Ashen Colossus", odds: 6, text: "A chip off the old Colossus, still warm." },
];
export const petDef = (id: string | null | undefined) => PETS.find(pet => pet.id === id);

// ---------- Mounts (the Friendhollow stables) ----------
/** A horse's coat: body, mane and tail, hooves, and markings. */
export type Coat = { body: string; mane: string; hoof: string; socks?: string; blaze?: string; pattern?: "dapple" | "piebald" | "stars"; horn?: string; rainbow?: boolean };
/**
 * Mounts, bought from the stablemaster with simulated RF (each buys Rare Caskets, like the Rare Market's bundles, and the
 * mount comes with them). Riding carries you `speed` tiles a tick without run energy, and each mount has its own gifts.
 */
export type MountDef = {
  id: string; name: string; caskets: number; speed: 2 | 3; coat: Coat; text: string;
  xp?: number; gather?: number; coins?: number; defence?: number; heal?: number; light?: boolean;
};
export const MOUNTS: readonly MountDef[] = [
  { id: "chestnut_horse", name: "Chestnut horse", caskets: 2, speed: 2, coat: { body: "#b0673e", mane: "#6f3a24", hoof: "#3b2a22", blaze: "#f3ece0" },
    text: "A steady gallop: two tiles a tick without tiring." },
  { id: "piebald_pony", name: "Piebald pony", caskets: 2, speed: 2, coat: { body: "#f3efe6", mane: "#3b3a38", hoof: "#3b3a38", pattern: "piebald" }, heal: 20,
    text: "Gallops without tiring, and a cuddle mends you: 1 HP every 12 seconds." },
  { id: "bay_horse", name: "Bay horse", caskets: 3, speed: 2, coat: { body: "#8a4f33", mane: "#2e2522", hoof: "#2e2522", socks: "#2e2522" }, gather: 0.05,
    text: "Gallops without tiring, and carries your tools: gather 5% faster." },
  { id: "grey_horse", name: "Dapple grey", caskets: 3, speed: 2, coat: { body: "#c9c7c2", mane: "#8a8782", hoof: "#57555a", pattern: "dapple" }, coins: 0.1,
    text: "Gallops without tiring, and has a nose for loot: +10% coins from drops and pickpocketing." },
  { id: "palomino", name: "Palomino", caskets: 4, speed: 2, coat: { body: "#e2b56a", mane: "#f6ecd6", hoof: "#6f5440", socks: "#f6ecd6" }, xp: 0.05,
    text: "Gallops without tiring, and everyone learns a little faster in golden company: +5% XP." },
  { id: "black_warhorse", name: "Black warhorse", caskets: 4, speed: 2, coat: { body: "#3a3638", mane: "#1d1b1c", hoof: "#1d1b1c", blaze: "#e8e4da" }, defence: 8,
    text: "Gallops without tiring, and never flinches: +8 Defence bonus while you ride." },
  { id: "unicorn", name: "Unicorn", caskets: 6, speed: 3, coat: { body: "#f7f5f0", mane: "#e7a9b0", hoof: "#c9c2b6", horn: "#ebc26b", rainbow: true }, xp: 0.1, heal: 10,
    text: "Canters three tiles a tick, +10% XP, and its horn mends you: 1 HP every 6 seconds." },
  { id: "moon_unicorn", name: "Moonlit unicorn", caskets: 8, speed: 3, coat: { body: "#3d4263", mane: "#c6d4f0", hoof: "#23263a", horn: "#dfe7f5", pattern: "stars" }, xp: 0.1, gather: 0.1, light: true,
    text: "Canters three tiles a tick, +10% XP, gathers 10% faster, and lights the dark around you." },
];
export const mountDef = (id: string | null | undefined) => MOUNTS.find(mount => mount.id === id);

/** Buy price multipliers. */
export const SHOP_BUY = 1.3, SHOP_SELL = 0.4;

// ---------- Casket (the RF chance game) ----------
/** Kept Rare Relic bonuses, one per casket tier (index = outcome id − 1). */
export const RELICS = [
  { name: "Plain Relic", text: "+2% XP in every skill per relic (max 5)", xpPer: 0.02, max: 5 },
  { name: "Silver Relic", text: "+10% coins from drops and pickpockets per relic (max 3)", coinsPer: 0.1, max: 3 },
  { name: "Moonlit Relic", text: "Gather 10% faster per relic (max 3)", gatherPer: 0.1, max: 3 },
  { name: "Golden Relic", text: "+10% XP and a golden aura while kept", xpPer: 0.1, max: 1 },
] as const;
/**
 * Rare Market bundles. The simulated economy has one thing RF can buy (the Rare Casket), so every bundle buys caskets
 * (open them any time at a casket chest) and adds guaranteed goods on top.
 */
export const RF_BUNDLES = [
  { id: "traveller", name: "Traveller's satchel", caskets: 1, text: "Two of every Realm tablet: break one to travel to Friendhollow, Emberforge, the Oasis, Frostpeak or the Pier." },
  { id: "hamper", name: "Hero's hamper", caskets: 1, text: "Ten inksharks and five cakes, for the Hollow Depths." },
  { id: "insight", name: "Lamp of insight", caskets: 2, text: "Rub it for experience in a skill of your choice (100 × your level)." },
  { id: "contract", name: "Slayer's contract", caskets: 2, text: "40 Slayer points from the Warden." },
  { id: "archer", name: "Archer's quiver", caskets: 2, text: "A maple bow and 300 moonsilver arrows." },
  { id: "tailor", name: "Tailor's pick", caskets: 3, text: "Choose any wardrobe piece up to Moonlit tier, straight onto your Friend." },
  { id: "sigils", name: "Sigil sack", caskets: 1, text: "300 each of breeze, tide, stone, ember and thought sigils, and 30 hollow sigils." },
  { id: "fletcher", name: "Fletcher's crate", caskets: 1, text: "600 arrow shafts, 600 feathers and 300 ashsteel arrowheads." },
  { id: "dragonslayer", name: "Dragonslayer's kit", caskets: 3, text: "A Wyrmward shield, a drakehide vest, 20 inksharks and 200 rarite arrows, for Wyrmreach." },
] as const;
export type RfBundle = typeof RF_BUNDLES[number];
/** RF-exclusive wardrobe: every casket grants one of these, drawn on your Friend. */
export const WARDROBE = [
  { id: "rose_cape", name: "Rose cape", tier: 0, kind: "cape", color: "#d8b6b4" },
  { id: "sage_scarf", name: "Sage scarf", tier: 0, kind: "scarf", color: "#b4c3ab" },
  { id: "paper_crown", name: "Paper crown", tier: 0, kind: "hat", color: "#e6d7b0" },
  { id: "butter_bow", name: "Butter bow", tier: 0, kind: "bow", color: "#e2d49e" },
  { id: "silver_halo", name: "Silver halo", tier: 1, kind: "halo", color: "#d6d9dd" },
  { id: "blue_cape", name: "Moonblue cape", tier: 1, kind: "cape", color: "#9fabc2" },
  { id: "lantern_familiar", name: "Lantern familiar", tier: 1, kind: "lantern", color: "#f2e28f" },
  { id: "moon_wisps", name: "Moon wisps", tier: 2, kind: "aura", color: "#afbccb" },
  { id: "starlit_hood", name: "Starlit hood", tier: 2, kind: "hat", color: "#6f7ea6" },
  { id: "ink_wings", name: "Ink wings", tier: 2, kind: "wings", color: "#5a5963" },
  { id: "golden_aura", name: "Golden aura", tier: 3, kind: "aura", color: "#e2d49e" },
  { id: "rarite_crown", name: "Rarite crown", tier: 3, kind: "hat", color: "#d8b6b4" },
  // The wider world's wardrobe: twelve more pieces for the caskets to hold.
  { id: "ember_scarf", name: "Ember scarf", tier: 0, kind: "scarf", color: "#f0a050" },
  { id: "sky_bow", name: "Sky bow", tier: 0, kind: "bow", color: "#9fc6f0" },
  { id: "plum_cape", name: "Plum cape", tier: 0, kind: "cape", color: "#a98cc4" },
  { id: "moss_bow", name: "Moss bow", tier: 0, kind: "bow", color: "#8e9887" },
  { id: "sea_cape", name: "Sea cape", tier: 1, kind: "cape", color: "#4f8aa8" },
  { id: "rose_halo", name: "Rose halo", tier: 1, kind: "halo", color: "#e7a9b0" },
  { id: "ash_scarf", name: "Ash scarf", tier: 1, kind: "scarf", color: "#8f8a82" },
  { id: "hollow_wisps", name: "Hollow wisps", tier: 2, kind: "aura", color: "#8a62c8" },
  { id: "dawn_halo", name: "Dawn halo", tier: 2, kind: "halo", color: "#e2c46a" },
  { id: "ember_wings", name: "Ember wings", tier: 2, kind: "wings", color: "#cf5836" },
  { id: "snow_cape", name: "Snow cape", tier: 2, kind: "cape", color: "#f3f2ee" },
  { id: "void_aura", name: "Void aura", tier: 3, kind: "aura", color: "#5a3a9a" },
  { id: "night_wings", name: "Night wings", tier: 3, kind: "wings", color: "#1d2a52" },
  { id: "deadwood_crown", name: "Deadwood crown", tier: 3, kind: "hat", color: "#4a5a40" },
  { id: "starfall_cape", name: "Starfall cape", tier: 3, kind: "cape", color: "#1c1b2a" },
] as const;
export type WardrobeId = typeof WARDROBE[number]["id"];
/** What each creature's hide gives way to: cold things to fire, fiery things to water, stone to wind, bogs to fire, and the dead to holy light. */
const WEAKNESS: Record<string, MonsterDef["weakness"]> = {
  frost_yeti: "fire", frost_wisp: "fire", ash_drake: "water", cinder_drake: "water", emberwyrm: "water", ember_salamander: "water", ember_salamander_young: "water", ashen_colossus: "water",
  stone_golem: "wind", moss_colossus: "fire", swamp_lurker: "fire", mire_crawler: "fire", marsh_adder: "fire", forest_spider: "fire", cave_spider: "fire", thornback: "fire", wolf: "fire", grumblin: "fire", grumblin_chief: "fire",
  bandit: "earth", sand_scorpion: "water", dune_stalker: "water", highland_goat: "earth",
  skeleton: "holy", shade: "holy", cairn_wight: "holy", hollow_sentinel: "holy", hollow_king: "holy", hollow_weaver: "holy", gloom_hound: "holy",
};
for (const [id, weakness] of Object.entries(WEAKNESS)) if (MONSTERS[id]) (MONSTERS[id] as { weakness?: MonsterDef["weakness"] }).weakness = weakness;
/** What a good meal does for you: every meat and fish lends a skill a little, wearing off a point a minute. */
const FOOD_EFFECTS: Record<string, Partial<Record<Skill, number>>> = {
  cooked_chicken: { attack: 1 }, cooked_meat: { strength: 2 }, bread: { defence: 1 }, cake: { defence: 2, hitpoints: 0 }, sweetberry: { ranged: 1 }, waybread: { agility: 3 },
  minnows: { fishing: 1 }, perch: { fishing: 2 }, carp: { cooking: 2 }, char: { woodcutting: 2, fishing: 1 }, grayling: { agility: 2, ranged: 2 },
  inkcrab: { defence: 3, mining: 2 }, sailfish: { strength: 3, attack: 2 }, inkshark: { attack: 4, strength: 4, defence: 2 },
};
for (const [id, food] of Object.entries(FOOD_EFFECTS)) { const entry = ITEM_LIST.find(item => item.id === id); if (entry) (entry as { food?: Partial<Record<Skill, number>> }).food = Object.fromEntries(Object.entries(food).filter(([, n]) => n)); }
/** What the rest of the wardrobe weighs: anything worn that isn't forged. Clothes and capes are light; leather, hide and bone armour sit between. */
for (const entry of ITEM_LIST) {
  if (!entry.equip || entry.weight !== undefined) continue;
  if (entry.id.startsWith("wayfarer_")) { (entry as { weight?: number }).weight = 0; continue; } // the Wayfarer's outfit weighs nothing: that's the point of it
  const slot = entry.equip.slot, heavy = /plate|cuirass|greaves|helm|shield|greatsword|warhammer|battleaxe|flail/.test(entry.id);
  const base = slot === "body" ? (heavy ? 5 : 1.5) : slot === "legs" ? (heavy ? 3 : 1) : slot === "shield" ? (heavy ? 3 : 2) : slot === "head" ? (heavy ? 1.6 : 0.4) : slot === "weapon" ? (heavy ? 3 : 1.2) : slot === "cape" ? 0.6 : slot === "belt" ? 0.8 : 0.5;
  (entry as { weight?: number }).weight = base;
}
