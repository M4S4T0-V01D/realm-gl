/**
 * Game state and the small helpers every system shares: inventory, bank, equipment, experience and messages.
 */
import { unbakeWorld } from "./bake.ts";
import {
  EQUIP_SLOTS, FAMILY_NAMES, MAX_XP, MONSTERS, mountDef, PRAYERS, RELICS, SKILLS, SKILL_NAMES, WAYFARER_SET, XP_RATE, XP_TABLE, item, levelForXp,
  type Bonuses, type EquipSlot, type Item, type MonsterDef, type Skill, type SpotKind, type WardrobeId,
 isItem } from "./data.ts";
import { createWorld, type World } from "./world.ts";
import type { Daily } from "./daily.ts";
import type { Lore, Track } from "./pursuance.ts";
import { LATEST_UPDATE } from "./updates.ts";

export const TICK_MS = 600;
/** Referrals: +15% XP for an hour of play, for both Friends, and 250 coins each. */
export const REFERRAL_BOOST = 0.15, REFERRAL_TICKS = 6000, REFERRAL_COINS = 250;
/** Referral rewards a player can collect in any 24 hours (more wait until the next day you're online together). */
export const REFERRALS_PER_DAY = 5, DAY_MS = 86_400_000;
export const INVENTORY_SIZE = 28;
export const BANK_SIZE = 400;
export type Slot = { id: string; n: number };
/** A bank slot: an item, how many, and the bank tab it's filed in (0 or missing: the main tab). */
export type BankSlot = Slot & { tab?: number };
/** Bank tabs besides the main one. */
export const BANK_TABS = 9;
/** Screen facing of a sprite; the renderer derives it from a world heading and the camera angle. */
export type Facing = "up" | "down" | "left" | "right";
export type Point = { x: number; y: number };
export type CombatStyle = "accurate" | "aggressive" | "defensive" | "controlled";

/** What the player is doing once they reach their target. */
export type Target =
  | { kind: "object"; id: number; option: string; use?: number }
  | { kind: "npc"; uid: number; option: string; use?: number }
  | { kind: "monster"; uid: number; option: string; spell?: string }
  | { kind: "ground"; uid: number; option: string; spell?: string }
  | { kind: "fire"; uid: number; option: string; use?: number }
  | { kind: "track"; uid: number; option: string };
export type Activity =
  | { kind: "woodcut"; objectId: number; timer: number }
  | { kind: "mine"; objectId: number; timer: number }
  | { kind: "thieve_stall"; objectId: number; timer: number }
  | { kind: "fish"; objectId: number; timer: number; spot: SpotKind }
  | { kind: "cook"; source: "range" | "fire"; sourceId: number; raw: string; timer: number; left: number }
  | { kind: "produce"; recipe: Recipe; timer: number; left: number }
  | { kind: "obstacle"; objectId: number; timer: number; from: Point; to: Point }
  | { kind: "teleport"; to: Point; timer: number; spell: string }
  | { kind: "firemake"; slot: number; timer: number }
  /** Offering bones of one kind at an altar, one after another, until the pack has none left. */
  | { kind: "offer"; objectId: number; timer: number; bones: string }
  /** Picking a herb patch (Apothecary). */
  | { kind: "gather"; objectId: number; timer: number };
/** Timed crafting at a station or from the inventory. */
export type Recipe = {
  skill: Skill; label: string; level: number; xp: number; ticks: number; station?: "furnace" | "anvil" | "wheel" | "still" | "none";
  inputs: Readonly<Record<string, number>>; outputs: Readonly<Record<string, number>>; tools?: readonly string[]; chance?: number; coins?: number;
};

export type Player = {
  x: number; y: number; prev: Point; heading: Point; moved: number;
  path: Point[]; run: boolean; energy: number;
  /** Sneaking (Stealth): walking softly past aggressive monsters, on run energy. Not saved. */
  sneak: boolean;
  xp: Record<Skill, number>; hp: number; prayer: number;
  inventory: (Slot | null)[]; equipment: Partial<Record<EquipSlot, string>>; bank: BankSlot[];
  style: CombatStyle; autocast: string | null; prayers: string[];
  target: Target | null; activity: Activity | null; combat: number | null;
  attackTimer: number; eatTimer: number; stunned: number; regenTimer: number;
  quests: Record<string, number>; questData: Record<string, number>;
  wardrobe: WardrobeId[]; worn: WardrobeId[]; follower: number | null;
  courseStep: number; kills: number; deaths: number; overhead: { text: string; until: number } | null; music: string[];
  familyId: number; friendId: number; relics: number[]; followerGeneration: number | null; tutorial: number;
  /** First steps: the guided start's current step (its length when done, -1 when skipped). */
  guide: number;
  lastHitBy: number | null; created: number; queuedSpell: string | null; castTimer: number;
  /** Referrals: the Friend whose code you used, the Friends who used yours, and ticks of referral XP boost left. */
  referredBy: number | null; referrals: number[]; boostTicks: number;
  /** Inkcoal kept in the inkcoal satchel, and sigil stones in the sigil stone box. */
  coalBag: number; stoneBox: number;
  /** The sigil satchel's contents: sigil id → count. */
  sigilBag: Record<string, number>;
  /** Each belt's contents (belt id → item id → count). Only the worn belt is in reach. */
  belts: Record<string, Record<string, number>>;
  /** Wardrobe pieces your follower wears. */
  followerWorn: WardrobeId[];
  /** Bones kept in the ossuary bag, by kind. */
  boneBag: Record<string, number>;
  /** Apothecary: skill boosts from drinks (wear off a point at a time), poison on you, poison on your weapon, protections (ticks), and a Friend mixture's effect. */
  boosts: Partial<Record<Skill, number>>; boostTimer: number;
  poison: { damage: number; left: number; timer: number } | null;
  weaponPoison: { weapon: string; damage: number; charges: number; weaken: boolean } | null;
  antidoteUntil: number; antifireUntil: number; stealthUntil: number; tonicUntil: number;
  /** A ward on you (a spell's), and the tick it ends; healing over time (so much a tick), and the tick it ends. */
  ward: { defence: number; flat: number; reduce: number } | null; wardUntil: number; renew: number; renewUntil: number;
  mixture: { family: number; until: number } | null;
  /** Presence: your Friend's name (the token id never changes), fellowship and title; the regions you've found and lived in, people met, emotes learnt, outfits worn, ticks with your Friend behind you. */
  name: string | null; fellowship: Fellowship | null; title: string | null;
  visited: Partial<Record<string, number>>; regionTicks: Partial<Record<string, number>>; talked: Partial<Record<string, 1>>; emotesUsed: Partial<Record<string, 1>>; outfits: Partial<Record<string, 1>>; friendTicks: number;
  /** Your Friend's voice: first times it remembers (the day), creature kinds it has remarked on, and the bookkeeping that keeps it from chattering (not saved). */
  firsts: Partial<Record<string, number>>; friendKinds: Partial<Record<string, 1>>; rumours: Partial<Record<string, 1>>;
  friendLast: number; friendEventAt: Partial<Record<string, number>>; friendRegion: string | null; friendNight: boolean; friendRain: boolean; friendSeen: string | null; combatSaid: number | null; friendVillage: string | null;
  /** When (wall-clock ms) your recent referrals were credited: at most REFERRALS_PER_DAY in any 24 hours. */
  referralTimes: number[];
  /** You've been told today's referral limit is reached (not saved). */
  referralCapNoted?: boolean;
  /** Mounts you own from the stables, and the one you're riding. */
  mounts: string[]; mount: string | null;
  /** Players you've met online, for the hiscores; and your achievements (id → the UTC day you earned it). */
  met: Record<number, { total: number; combat: number; seen: number }>; achievements: Record<string, number>;
  /** Pets you've found, and the one following you. */
  pets: string[]; petOut: string | null;
  /** Kills by monster, for achievements. */
  killLog: Record<string, number>;
  /** Your Pursuance journal: what you know of each creature (pursuance.ts). */
  lore: Record<string, Lore>;
  /** Tracks you've read: their maker, shown on your map until then. */
  trail: { id: string; until: number } | null;
  /** Counts for achievements and bragging: duels won and lost, trades made, daily chests opened. */
  stats: Record<string, number>;
  /** The daily streak and challenges, and the newest update you've seen in the log. */
  daily: Daily; seenUpdate: number;
  /** Work orders by patron NPC. */
  orders: Record<string, WorkOrder>;
  /** The adventurer card's chosen style (background, frame, skills panel, font, ink, layout). */
  card: Record<string, string>;
  /** Return of Raria: the Adventurer Cards you've found (card id → the UTC day), and whether you keep the Wise Friend's Law (Raria's Magic and Faith in place of the Old Friend's). */
  cards: Record<string, number>; rarian: boolean;
  /** Your home, if you hold a deed, and the ticks of Well Rested left after sleeping in it. */
  home: Home | null; restedTicks: number;
  /** A level-up to celebrate (not saved): other players see its fireworks while it lasts. */
  celebrate?: { skill: Skill; level: number; until: number };
  /** The mount you rode last (not saved), for the ride button. */
  lastMount?: string;
  /** The emote you're performing, and the tick it ends (not saved). */
  emote?: { id: string; start: number; until: number } | null;
  /** Friends from your friends list playing near you right now (not saved): +5% XP while any are. */
  nearFriends?: number;
  /** Party members within thirty tiles, and fellowship members within twelve (not saved). */
  nearParty?: number; nearFellows?: number;
};
export type Monster = {
  uid: number; def: MonsterDef; x: number; y: number; prev: Point; spawn: Point; hp: number; heading: Point;
  /** A sheared sheep: the tick its wool has grown back. */
  shorn?: number;
  target: boolean; attackTimer: number; respawnAt: number; dead: boolean; wander: number; moved: number; retreat: number;
  /** The tick it last came back to life (shared fights ignore reports from its previous life for a moment). */
  /** You've wounded it (a world boss you helped fight pays you loot, whoever lands the last blow). */
  mine?: boolean;
  bornAt?: number;
  /** Curses and Bind: the tick each wears off. */
  curses: Partial<Record<"attack" | "strength" | "defence" | "bound", number>>;
  /** Weapon poison on it: doses left, and ticks to the next. */
  poison?: { damage: number; left: number; timer: number } | null;
  /** Another creature it's fighting (the Realm's wars: skirmish.ts), by uid. */
  foe?: number | null;
  /** A soldier's fighting self: the soldier's own uid, and how long it has stood with nothing to fight. */
  twinOf?: number; idle?: number;
  /** Done fighting: put back as the soldier after this tick. */
  sheathe?: boolean;
  /** A marked creature (pursuance.ts): half as hardy again, with a trophy. */
  marked?: boolean;
  /** Summoned for a match in the Rare Friends Ring: it hunts you from the start and never comes back. */
  arena?: boolean;
};
export type Npc = { uid: number; id: string; x: number; y: number; prev: Point; spawn: Point; wander: number; heading: Point; moved: number; busy: number;
  /** A soldier fighting: the uid of its fighting self (skirmish.ts), while it's out; the soldier itself is put away meanwhile. */
  drawn?: number | null };
/** An item on the ground. `shared` ones (dropped from your pack) other players see and may pick up. */
export type GroundItem = { uid: number; id: string; n: number; x: number; y: number; expires: number; shared?: boolean; rare?: boolean };
export type Fire = { uid: number; x: number; y: number; expires: number };
/** Something flying: a spell (glowing, by element), an arrow, or dragonfire. */
export type Projectile = { from: Point; to: Point; start: number; end: number; color: string; style?: "magic" | "arrow" | "bolt" | "fire"; element?: string };
export type GameEvent =
  | { type: "hit"; on: "player" | "monster"; uid?: number; damage: number; tick: number }
  | { type: "xp"; skill: Skill; amount: number; tick: number }
  | { type: "level"; skill: Skill; level: number; tick: number }
  | { type: "sound"; name: SoundName; tick: number }
  | { type: "projectile"; projectile: Projectile }
  | { type: "death"; tick: number }
  | { type: "quest"; quest: string; tick: number }
  | { type: "cast"; spell: string; tick: number }
  /** Your Friend said something: show it over its head, and (share) tell other players nearby. */
  | { type: "friend"; text: string; share: boolean; tick: number }
  | { type: "creature"; id: string; action: "attack" | "hurt" | "death" | "aggro"; x: number; y: number; tick: number }
  | { type: "swing"; weapon: "slash" | "stab" | "crush" | "punch"; tick: number };
export type SoundName =
  | "chop" | "mine" | "splash" | "catch" | "fire" | "sizzle" | "burn" | "smelt" | "anvil" | "hit" | "miss" | "hurt" | "eat" | "bury" | "coins"
  | "pickup" | "drop" | "door" | "level" | "quest" | "spell" | "teleport" | "death" | "stun" | "jump" | "click" | "equip" | "kill" | "pray" | "fell" | "bow"
  | "whinny" | "hoof" | "rare" | "duel";
export type Message = { text: string; tone: "game" | "info" | "warn" | "quest" | "level" | "npc" | "public" | "private"; tick: number };

/** A Craftwork carving set down in the world: what it is, where, and when it crumbles (not saved: it'd crumble anyway). */
export type Carving = { uid: number; id: string; x: number; y: number; placed: number; until: number };
export type Game = {
  /** Bumped whenever the world is rebuilt in part (a home painted in), so renderers drop their caches. */
  worldVersion?: number;
  world: World; tick: number; player: Player; monsters: Monster[]; npcs: Npc[]; ground: GroundItem[]; fires: Fire[]; carvings: Carving[];
  /** What you've sold to each shop that it doesn't normally stock (you can buy it back until you leave). */
  shopStock: Record<string, Slot[]>;
  /** A match under way in the Rare Friends Ring: which, and the creatures summoned for it. */
  arena: { match: string; name: string; uids: number[]; startedAt: number; coins: number; marks: number; level: number } | null;
  depleted: Map<number, number>; herbPicks: Map<number, number>; messages: Message[];
  /** What the sky is doing (set by the page each frame; the engine only reads it) and how much your Friend talks. */
  ambient: { night: boolean; rain: boolean; storm?: boolean; fog?: boolean }; friendSpeech: "full" | "reduced" | "rare" | "off"; events: GameEvent[]; rng: () => number; nextUid: number;
  dialogue: Dialogue | null; ui: { shop: string | null; bank: boolean; production: ProductionMenu | null; lamp: number | null; naming: "first" | "rename" | null; fellowship?: boolean; home?: boolean; join?: Fellowship | null; /** A purchase with simulated RF waiting for the player's word: what it does and how many caskets it costs. */ rfAction?: { kind: "slayer-complete" | "slayer-reroll"; caskets: number; text: string } | null };
  held: { dx: number; dy: number } | null; autoRetaliate: boolean; playTicks: number;
  overheads: Map<number, { text: string; until: number }>;
  /** Creatures' tracks lying round you (pursuance.ts), and the set you read last. */
  tracks: Track[]; trackRead?: { id: string; tick: number };
  /** Your owned-Friend follower, walking the tiles you leave behind. */
  pet: Pet | null; trail: Point[];
  /** Stealth: aggressive monsters you're slipping past unseen (uid → tick they came in range), and when each last paid XP. */
  sneakingPast: Map<number, number>; sneakPaid: Map<number, number>;
};
export type Pet = { x: number; y: number; prev: Point; heading: Point; moved: number };
/** Your home on Homestead Row: its size, its looks, and what's in it (slot id → furnishing id). */
export type Home = { tier: 1 | 2 | 3; walls: string; floor: string; roof: string; garden: string; furniture: Record<string, string> };
/** A fellowship as you've declared it: its name and tag, and the look it wears on your cards (an emblem, a banner style, two colours). */
export type Fellowship = { name: string; tag: string; logo?: string; banner?: string; /** Field, mark, and two accents (two to four hex colours). */ colors?: string[]; /** The UTC day it was founded (as far as you know), and the fellows you have seen online (id → day). */ since?: number; seen?: Record<number, number> };
/** A patron's work order for a day: what to bring, how many, what it pays, and whether it's filled. */
export type WorkOrder = { day: number; item: string; n: number; pay: number; xp: number; done: 0 | 1 };
export type DialogueLine = { who: "npc" | "player"; text: string; npc?: string };
export type Dialogue = {
  npc: string; lines: DialogueLine[]; index: number;
  options?: { label: string; then: () => Dialogue | null }[];
  onEnd?: () => void;
};
export type ProductionMenu = { title: string; recipes: Recipe[] };

export function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let sharedWorld: World | null = null;
/**
 * The world is immutable after generation, so every game shares one copy: unbaked from the build's bake when there is
 * one (much quicker than generating it: see bake.ts), generated otherwise.
 */
export function realmWorld(): World {
  if (sharedWorld) return sharedWorld;
  const holder = globalThis as { __REALM_WORLD__?: string }, baked = holder.__REALM_WORLD__;
  if (baked) {
    try { sharedWorld = unbakeWorld(baked); } catch { sharedWorld = null; }
    delete holder.__REALM_WORLD__;
  }
  return sharedWorld ??= createWorld();
}

export function createPlayer(world: World, familyId: number, friendId: number): Player {
  const spawn = world.places.spawn, xp = Object.fromEntries(SKILLS.map(skill => [skill, 0])) as Record<Skill, number>;
  xp.hitpoints = XP_TABLE[10];
  const inventory: (Slot | null)[] = Array(INVENTORY_SIZE).fill(null);
  ["pewter_axe", "pewter_pickaxe", "small_net", "tinderbox", "pewter_dagger", "minnows", "minnows", "bread"].forEach((id, index) => { inventory[index] = { id, n: 1 }; });
  inventory[8] = { id: "coins", n: 25 };
  return {
    x: spawn.x, y: spawn.y, prev: { ...spawn }, heading: { x: 1, y: 1 }, moved: 0, path: [], run: false, energy: 100, sneak: false,
    xp, hp: 10, prayer: 1, inventory, equipment: {}, bank: [{ id: "coins", n: 50 }],
    style: "accurate", autocast: null, prayers: [], target: null, activity: null, combat: null,
    attackTimer: 0, eatTimer: 0, stunned: 0, regenTimer: 0, quests: {}, questData: {},
    wardrobe: [], worn: [], follower: null, courseStep: -1, kills: 0, deaths: 0, overhead: null, music: ["theme"],
    familyId: Math.max(0, Math.min(FAMILY_NAMES.length - 1, familyId)), friendId, relics: [0, 0, 0, 0], followerGeneration: null, tutorial: 0, guide: 0, referredBy: null, referrals: [], boostTicks: 0, coalBag: 0, stoneBox: 0, boneBag: {}, sigilBag: {}, belts: {}, followerWorn: [], orders: {}, card: { bg: "paper", frame: "rose", skills: "boxes", font: "mono", ink: "ink", layout: "classic" }, cards: {}, rarian: false, home: null, restedTicks: 0, ward: null, wardUntil: 0, renew: 0, renewUntil: 0, boosts: {}, boostTimer: 0, poison: null, weaponPoison: null, antidoteUntil: 0, antifireUntil: 0, stealthUntil: 0, tonicUntil: 0, mixture: null, name: null, fellowship: null, title: null, visited: {}, regionTicks: {}, talked: {}, emotesUsed: {}, outfits: {}, friendTicks: 0, firsts: {}, friendKinds: {}, rumours: {}, friendLast: -1e9, friendEventAt: {}, friendRegion: null, friendNight: false, friendRain: false, friendSeen: null, combatSaid: null, friendVillage: null, referralTimes: [], mounts: [], mount: null, met: {}, achievements: {}, pets: [], petOut: null, killLog: {}, lore: {}, trail: null, stats: {}, daily: { day: -1, streak: 0, best: 0, challengeDay: -1, challenges: [], base: [], claimed: [], chest: false, rerolls: 0 }, seenUpdate: LATEST_UPDATE,
    lastHitBy: null, created: Date.now(), queuedSpell: null, castTimer: 0,
  };
}

export function createGame(options: { familyId: number; friendId: number; rng?: () => number; world?: World }): Game {
  const world = options.world ?? realmWorld(), rng = options.rng ?? Math.random;
  const game: Game = {
    world, tick: 0, player: createPlayer(world, options.familyId, options.friendId), monsters: [], npcs: [], ground: [], fires: [], carvings: [], shopStock: {},
    depleted: new Map(), herbPicks: new Map(), ambient: { night: false, rain: false }, friendSpeech: "full", sneakingPast: new Map(), sneakPaid: new Map(), messages: [], events: [], rng, nextUid: 1, dialogue: null, ui: { shop: null, bank: false, production: null, lamp: null, naming: null },
    held: null, autoRetaliate: true, playTicks: 0, overheads: new Map(), tracks: [], pet: null, trail: [], arena: null,
  };
  for (const spawn of world.spawns) {
    const uid = game.nextUid++, at = { x: spawn.x, y: spawn.y };
    if (spawn.kind === "monster") {
      const def = MONSTERS[spawn.id];
      game.monsters.push({ uid, def, x: at.x, y: at.y, prev: { ...at }, spawn: at, hp: def.hp, heading: { x: 1, y: 1 }, target: false, attackTimer: 0, respawnAt: 0, dead: false, wander: spawn.wander ?? def.wander, moved: 0, retreat: 0, curses: {} });
    } else game.npcs.push({ uid, id: spawn.id, x: at.x, y: at.y, prev: { ...at }, spawn: at, wander: spawn.wander ?? 0, heading: { x: 1, y: 1 }, moved: 0, busy: 0 });
  }
  message(game, "Welcome to the Realm. Talk to the Realm Guide by the fountain if you get lost.", "info");
  return game;
}

// ---------- Messages and events ----------
export function message(game: Game, text: string, tone: Message["tone"] = "game") {
  game.messages.push({ text, tone, tick: game.tick });
  if (game.messages.length > 120) game.messages.splice(0, game.messages.length - 120);
}
export function emit(game: Game, event: GameEvent) {
  game.events.push(event);
  if (game.events.length > 200) game.events.splice(0, game.events.length - 200);
}
export const sound = (game: Game, name: SoundName) => emit(game, { type: "sound", name, tick: game.tick });

// ---------- Experience ----------
/** Your level in a skill, with any Apothecary boost (never below 1). */
export const level = (game: Game, skill: Skill) => Math.max(1, levelForXp(game.player.xp[skill]) + (game.player.boosts[skill] ?? 0));
/** A Friend mixture in effect for your own family. */
export const mixtureOn = (game: Game, family: number) => !!game.player.mixture && game.player.mixture.family === family && game.player.mixture.until > game.tick && game.player.familyId === family;
export function totalLevel(player: Player) { return SKILLS.reduce((sum, skill) => sum + levelForXp(player.xp[skill]), 0); }
export function totalXp(player: Player) { return SKILLS.reduce((sum, skill) => sum + Math.floor(player.xp[skill]), 0); }
export function combatLevel(player: Player) {
  const L = (skill: Skill) => levelForXp(player.xp[skill]);
  const base = 0.25 * (L("defence") + L("hitpoints") + Math.floor(L("prayer") / 2));
  const melee = 0.325 * (L("attack") + L("strength")), magic = 0.325 * Math.floor(1.5 * L("magic")), ranged = 0.325 * Math.floor(1.5 * L("ranged"));
  return Math.floor(base + Math.max(melee, magic, ranged));
}
/** XP multiplier from the realm rate, kept Rare Relics and your follower's generation. */
export function xpMultiplier(player: Player) {
  const plain = Math.min(RELICS[0].max, player.relics[0] ?? 0) * RELICS[0].xpPer, golden = (player.relics[3] ?? 0) > 0 ? RELICS[3].xpPer : 0;
  const rested = player.restedTicks > 0 && player.home ? [0.05, 0.07, 0.1][player.home.tier - 1] : 0, company = ((player.nearParty ?? 0) > 0 ? 0.1 : 0) + ((player.nearFellows ?? 0) > 0 ? 0.05 : 0);
  return XP_RATE * (1 + plain + golden + followerBonus(player) + ((player.nearFriends ?? 0) > 0 ? 0.05 : 0) + (player.boostTicks > 0 ? REFERRAL_BOOST : 0) + (riding(player)?.xp ?? 0) + rested + company);
}
/** The mount you're riding, if any. */
export function riding(player: Player) { return mountDef(player.mount); }
/**
 * The early levels go a little slower, so levelling up means something from the start: about half speed at level 1,
 * three-quarters at 15, and the full Realm rate from level 30 up (fixed rewards such as lamps are unaffected).
 */
/** Combat skills: the rest (gathering and making) start slower still below level 10. */
const COMBAT_XP = new Set<string>(["attack", "strength", "defence", "hitpoints", "ranged", "magic"]);
/**
 * The early levels are slower: about half speed at level 1, full speed from 30. Gathering and making skills (fishing,
 * cooking, woodcutting…) start slower still, at under a third, catching up with the rest by level 10.
 */
export const earlyXp = (skillLevel: number, skill?: string) => {
  if (skillLevel >= 30) return 1;
  if (skill && !COMBAT_XP.has(skill) && skillLevel < 10) return 0.3 + (Math.max(1, skillLevel) - 1) * ((0.5 + 10 / 60) - 0.3) / 9;
  return 0.5 + skillLevel / 60;
};
/** Owned-Friend followers: Gen 1 +5% XP … Gen 5 and later +1%. */
export function followerBonus(player: Player) {
  if (player.follower === null) return 0;
  const generation = player.followerGeneration ?? 6;
  return [0.05, 0.05, 0.04, 0.03, 0.02, 0.01, 0.01][Math.max(0, Math.min(6, generation))] ?? 0.01;
}
/** Award XP (already scaled by the caller with `scaled`) and announce level-ups. */
export function addXp(game: Game, skill: Skill, base: number, options: { raw?: boolean } = {}) {
  const player = game.player, before = levelForXp(player.xp[skill]);
  const amount = options.raw ? base : base * xpMultiplier(player) * earlyXp(before, skill) * (mixtureOn(game, 7) ? 1.15 : 1);
  if (amount <= 0) return;
  player.xp[skill] = Math.min(MAX_XP, player.xp[skill] + amount);
  emit(game, { type: "xp", skill, amount, tick: game.tick });
  const after = levelForXp(player.xp[skill]);
  if (after > before) {
    if (skill === "hitpoints") player.hp += after - before;
    if (skill === "prayer") player.prayer += after - before;
    message(game, `Congratulations, you've just advanced your ${SKILL_NAMES[skill]} level. You are now level ${after}.`, "level");
    if (after === 99) message(game, `You've mastered ${SKILL_NAMES[skill]}! The Keeper of Capes in Friendhollow Castle has a cape with your name on it.`, "quest");
    emit(game, { type: "level", skill, level: after, tick: game.tick });
    player.celebrate = { skill, level: after, until: game.tick + 6 };
    sound(game, "level");
  }
}

// ---------- Inventory ----------
export const freeSlots = (player: Player) => player.inventory.filter(slot => slot === null).length;
export function count(player: Player, id: string) {
  return player.inventory.reduce((sum, slot) => sum + (slot?.id === id ? slot.n : 0), 0);
}
export const has = (player: Player, id: string, n = 1) => count(player, id) >= n;
export function hasTool(player: Player, id: string) { return has(player, id) || Object.values(player.equipment).includes(id); }
/** Whether `n` of an item would fit. */
export function canHold(player: Player, id: string, n = 1) {
  const definition = item(id);
  if (definition.stackable) return player.inventory.some(slot => slot?.id === id) || freeSlots(player) > 0;
  return freeSlots(player) >= n;
}
/** Add items; returns how many didn't fit. */
export function give(player: Player, id: string, n = 1): number {
  const definition = item(id);
  if (definition.stackable) {
    const slot = player.inventory.find(entry => entry?.id === id);
    if (slot) { slot.n = Math.min(2_147_483_647, slot.n + n); return 0; }
    const index = player.inventory.indexOf(null);
    if (index < 0) return n;
    player.inventory[index] = { id, n }; return 0;
  }
  let left = n;
  while (left > 0) {
    const index = player.inventory.indexOf(null);
    if (index < 0) break;
    player.inventory[index] = { id, n: 1 }; left--;
  }
  return left;
}
/** Give, or drop what doesn't fit at the player's feet. */
export function giveOrDrop(game: Game, id: string, n = 1) {
  const left = give(game.player, id, n);
  if (left > 0) { dropItem(game, id, left, game.player.x, game.player.y); message(game, "Your inventory is full, so it falls to the ground.", "warn"); }
}
export function take(player: Player, id: string, n = 1): boolean {
  if (count(player, id) < n) return false;
  let left = n;
  for (let index = player.inventory.length - 1; index >= 0 && left > 0; index--) {
    const slot = player.inventory[index];
    if (slot?.id !== id) continue;
    const used = Math.min(slot.n, left);
    slot.n -= used; left -= used;
    if (slot.n <= 0) player.inventory[index] = null;
  }
  return true;
}
export function dropItem(game: Game, id: string, n: number, x: number, y: number, ticks = 200, shared = false) {
  const definition = item(id), existing = definition.stackable ? game.ground.find(entry => entry.id === id && entry.x === x && entry.y === y && !!entry.shared === shared) : undefined;
  if (existing) { existing.n += n; existing.expires = game.tick + ticks; return; }
  if (definition.stackable) game.ground.push({ uid: game.nextUid++, id, n, x, y, expires: game.tick + ticks, shared });
  else for (let i = 0; i < Math.min(n, 28); i++) game.ground.push({ uid: game.nextUid++, id, n: 1, x, y, expires: game.tick + ticks, shared });
  if (game.ground.length > 400) game.ground.splice(0, game.ground.length - 400);
}

// ---------- The inkcoal satchel ----------
export const SATCHEL = "inkcoal_satchel", SATCHEL_SIZE = 120, STONE_BOX = "sigil_box", STONE_BOX_SIZE = 120;
/** Worn on your back or carried, the satchel catches the inkcoal you mine and feeds the furnace. */
export const hasSatchel = (player: Player) => player.equipment.cape === SATCHEL || has(player, SATCHEL);
/** Carried in your pack, the sigil stone box catches the stones you mine and empties itself into the altar. */
export const hasStoneBox = (player: Player) => has(player, STONE_BOX);
// ---------- The sigil satchel: a mage's bag ----------
export const SIGIL_BAG = "sigil_satchel", SIGIL_BAG_SIZE = 2000;
/** Worn on your back or carried, the sigil satchel holds every kind of sigil and your spells draw from it. */
export const hasSigilBag = (player: Player) => player.equipment.cape === SIGIL_BAG || has(player, SIGIL_BAG);
export const isSigil = (id: string) => id.endsWith("_sigil");
/** How many of a sigil you can cast with: your pack plus the satchel. */
export const sigilStock = (player: Player, id: string) => count(player, id) + (hasSigilBag(player) ? player.sigilBag[id] ?? 0 : 0);
/** Spend sigils, from the satchel first. */
export function useSigils(player: Player, id: string, n: number) {
  if (hasSigilBag(player)) { const fromBag = Math.min(n, player.sigilBag[id] ?? 0); if (fromBag > 0) { player.sigilBag[id] = (player.sigilBag[id] ?? 0) - fromBag; if (!player.sigilBag[id]) delete player.sigilBag[id]; } n -= fromBag; }
  if (n > 0) take(player, id, n);
}
/** Put sigils of one kind in the satchel (as many as fit); returns how many went in. */
export function sigilBagAdd(player: Player, id: string, n: number) {
  const room = Math.max(0, SIGIL_BAG_SIZE - (player.sigilBag[id] ?? 0)), moved = Math.min(n, room);
  if (moved > 0) player.sigilBag[id] = (player.sigilBag[id] ?? 0) + moved;
  return moved;
}
export const sigilBagTotal = (player: Player) => Object.values(player.sigilBag).reduce((sum, n) => sum + n, 0);
// ---------- Belts: a trade's small things at your waist ----------
export type BeltDef = { id: string; name: string; group: (id: string) => string | null; caps: Record<string, number> };
export const BELTS: readonly BeltDef[] = [
  { id: "apothecary_belt", name: "Apothecary's belt", caps: { potion: 40, herb: 20, water: 20 },
    group: id => item(id).potion ? "potion" : id.startsWith("clean_") || id.startsWith("ground_") ? "herb" : id === "vial_of_water" ? "water" : null },
  { id: "fletchers_belt", name: "Fletcher's belt", caps: { shaft: 500, feather: 500, headless: 500, heads: 300, string: 50 },
    group: id => id === "arrow_shaft" ? "shaft" : id === "feather" ? "feather" : id === "headless_arrow" ? "headless" : id.endsWith("_arrowheads") ? "heads" : id === "bowstring" ? "string" : null },
];
export const beltDef = (id: string | undefined | null) => BELTS.find(belt => belt.id === id) ?? null;
/** The belt you're wearing, if any. */
export const wornBelt = (player: Player) => beltDef(player.equipment.belt);
export const beltContents = (player: Player, beltId: string) => player.belts[beltId] ?? (player.belts[beltId] = {});
const beltGroupTotal = (contents: Record<string, number>, belt: BeltDef, group: string) => Object.entries(contents).reduce((sum, [id, n]) => sum + (belt.group(id) === group ? n : 0), 0);
/** Put an item in a belt (as many as its group has room for); returns how many went in. */
export function beltAdd(player: Player, belt: BeltDef, id: string, n: number) {
  const group = belt.group(id); if (!group) return 0;
  const contents = beltContents(player, belt.id), room = Math.max(0, belt.caps[group] - beltGroupTotal(contents, belt, group)), moved = Math.min(n, room);
  if (moved > 0) contents[id] = (contents[id] ?? 0) + moved;
  return moved;
}
const beltStock = (player: Player, id: string) => { const belt = wornBelt(player); return belt && belt.group(id) ? player.belts[belt.id]?.[id] ?? 0 : 0; };
function beltUse(player: Player, id: string, n: number) {
  const belt = wornBelt(player); if (!belt) return n;
  const contents = beltContents(player, belt.id), from = Math.min(n, contents[id] ?? 0);
  if (from > 0) { contents[id] -= from; if (!contents[id]) delete contents[id]; }
  return n - from;
}
/** The containers you can carry: what each holds, where its count lives, and how many fit. */
export const CONTAINERS = [
  { item: SATCHEL, holds: "inkcoal", size: SATCHEL_SIZE, key: "coalBag" as const, carried: hasSatchel },
  { item: STONE_BOX, holds: "sigil_stone", size: STONE_BOX_SIZE, key: "stoneBox" as const, carried: hasStoneBox },
];
/** Fill a carried container from the bank; returns how many moved. */
export function fillFromBank(player: Player, containerItem: string) {
  const box = CONTAINERS.find(entry => entry.item === containerItem), entry = box && player.bank.find(slot => slot.id === box.holds);
  if (!box || !entry) return 0;
  const n = Math.min(entry.n, box.size - player[box.key]);
  if (n <= 0) return 0;
  player[box.key] += n; entry.n -= n;
  if (entry.n <= 0) { player.bank.splice(player.bank.indexOf(entry), 1); compactBankTabs(player); }
  return n;
}
/** Tip a container's contents into the bank; returns how many moved. */
export function emptyToBank(player: Player, containerItem: string) {
  const box = CONTAINERS.find(entry => entry.item === containerItem), n = box ? player[box.key] : 0;
  if (!box || n <= 0) return 0;
  const entry = player.bank.find(slot => slot.id === box.holds);
  if (!entry && player.bank.length >= BANK_SIZE) return 0;
  if (entry) entry.n += n; else player.bank.push({ id: box.holds, n });
  player[box.key] = 0;
  return n;
}
// ---------- Worn sets ----------
/** How many pieces of a set (the Wayfarer's outfit, a Slayer set) you're wearing: ids that start with `prefix_`. */
export const setPieces = (player: Player, prefix: string) => Object.values(player.equipment).filter(id => !!id && id.startsWith(`${prefix}_`)).length;
/** The Wayfarer's outfit: how many of its four pieces are worn. */
export const wayfarerPieces = (player: Player) => WAYFARER_SET.filter(id => Object.values(player.equipment).includes(id)).length;
/** Pieces of a Slayer set worn, and whether the whole set is on. */
export const slayerSetWorn = (player: Player, set: string) => setPieces(player, set);
export const fullSlayerSet = (player: Player, set: string) => setPieces(player, set) >= 3;
// ---------- The ossuary bag ----------
export const BONE_BAG = "bone_bag", BONE_BAG_SIZE = 60;
/** Keep (or set down) the Wise Friend's Law (Return of Raria): Raria's Magic and Faith in place of the Old Friend's. Active prayers end either way; the old book is closed, not lost. */
export function setLaw(game: Game, keep: boolean) {
  const player = game.player;
  if (player.rarian === keep) return;
  player.rarian = keep; player.prayers = []; if (player.autocast) player.autocast = null;
  message(game, keep ? "You keep the Wise Friend's Law. Your Magic is Raria's edicts now, and your Faith its commandments and rites; the Old Friend's book is closed." : "You set the Law down. The Old Friend's book opens again, and Raria's closes.", "quest");
  sound(game, "quest");
}
/** Worn on the back or carried in your pack, the ossuary bag catches the bones you pick up and empties itself onto an altar. */
export const hasBoneBag = (player: Player) => has(player, BONE_BAG) || player.equipment.cape === BONE_BAG;
/** You own one at all (worn, in your pack or the bank): Sister Maren hands one over otherwise. */
export const ownsBoneBag = (player: Player) => hasBoneBag(player) || player.bank.some(slot => slot.id === BONE_BAG);
/** How many bones the bag holds in all. */
export const bagBones = (player: Player) => Object.values(player.boneBag).reduce((sum, n) => sum + n, 0);
/** Put bones of one kind in the bag (as many as fit); returns how many went in. */
export function bagAdd(player: Player, id: string, n: number) {
  const room = Math.max(0, BONE_BAG_SIZE - bagBones(player)), moved = Math.min(n, room);
  if (moved > 0) player.boneBag[id] = (player.boneBag[id] ?? 0) + moved;
  return moved;
}
/** Take the bag's contents out (clearing it): [bone id, count] pairs, the biggest kinds first. */
export function bagTakeAll(player: Player) {
  const out = Object.entries(player.boneBag).filter(([, n]) => n > 0).sort((a, b) => (item(b[0]).bones ?? 0) - (item(a[0]).bones ?? 0));
  player.boneBag = {};
  return out;
}
/** How many of an item you can use in a recipe: your pack, plus the satchel's inkcoal. */
export const stock = (player: Player, id: string) => count(player, id) + (id === "inkcoal" && hasSatchel(player) ? player.coalBag : 0) + (id === "sigil_stone" && hasStoneBox(player) ? player.stoneBox : 0) + beltStock(player, id);
/** Use up items for a recipe, taking inkcoal from the satchel first. */
export function useUp(player: Player, id: string, n: number) {
  if (id === "inkcoal" && hasSatchel(player)) { const fromBag = Math.min(n, player.coalBag); player.coalBag -= fromBag; n -= fromBag; }
  if (id === "sigil_stone" && hasStoneBox(player)) { const fromBox = Math.min(n, player.stoneBox); player.stoneBox -= fromBox; n -= fromBox; }
  n = beltUse(player, id, n);
  if (n > 0) take(player, id, n);
}

// ---------- Bank ----------
/** Add to the bank: onto the item's existing stack, or as a new slot at the end of `tab`. */
function bankAdd(player: Player, id: string, n: number, tab = 0) {
  const entry = player.bank.find(bank => bank.id === id);
  if (entry) { entry.n += n; return; }
  const slot: BankSlot = tab ? { id, n, tab } : { id, n }, last = player.bank.map(bank => bank.tab ?? 0).lastIndexOf(tab);
  if (tab && last >= 0) player.bank.splice(last + 1, 0, slot); else player.bank.push(slot);
}
export function bankDeposit(player: Player, slotIndex: number, n = Infinity, tab = 0) {
  const slot = player.inventory[slotIndex];
  if (!slot) return false;
  const moving = Math.min(n, count(player, slot.id)), id = slot.id;
  if (!player.bank.some(entry => entry.id === id) && player.bank.length >= BANK_SIZE) return false;
  take(player, id, moving);
  bankAdd(player, id, moving, tab);
  return true;
}
export function bankDepositAll(player: Player, tab = 0) {
  for (let index = 0; index < player.inventory.length; index++) if (player.inventory[index]) bankDeposit(player, index, Infinity, tab);
}
export function bankDepositWorn(player: Player, tab = 0) {
  for (const slot of EQUIP_SLOTS) {
    const id = player.equipment[slot];
    if (!id) continue;
    bankAdd(player, id, 1, tab);
    delete player.equipment[slot];
  }
  if (player.autocast && !isStaffEquipped(player)) player.autocast = null;
}
export function bankWithdraw(player: Player, id: string, n: number) {
  const entry = player.bank.find(bank => bank.id === id);
  if (!entry) return 0;
  const definition = item(id), room = definition.stackable ? (canHold(player, id) ? entry.n : 0) : freeSlots(player);
  const moving = Math.max(0, Math.min(n, entry.n, room));
  if (!moving) return 0;
  give(player, id, moving); entry.n -= moving;
  if (entry.n <= 0) { player.bank.splice(player.bank.indexOf(entry), 1); compactBankTabs(player); }
  return moving;
}
/** The bank tabs in use besides the main one, in order (1, 2, 3…). */
export const bankTabs = (player: Player) => [...new Set(player.bank.map(slot => slot.tab ?? 0).filter(tab => tab > 0))].sort((a, b) => a - b);
/** Renumber tabs so they run 1, 2, 3… with no gaps (a tab disappears when it's emptied). */
export function compactBankTabs(player: Player) {
  const tabs = bankTabs(player);
  for (const slot of player.bank) { const tab = slot.tab ?? 0; if (tab) slot.tab = tabs.indexOf(tab) + 1; else delete slot.tab; }
}
/** The bank in display order: the main tab first, then each tab in turn, each in its own order. */
export const bankInOrder = (player: Player) => [...player.bank].sort((a, b) => (a.tab ?? 0) - (b.tab ?? 0));
/** Move a bank item to just before another (taking that item's tab), or to the end of `tab` when `before` is null. Tab "new" opens a new tab. */
export function bankMove(player: Player, id: string, before: string | null, tab?: number | "new") {
  const from = player.bank.findIndex(slot => slot.id === id);
  if (from < 0 || id === before) return false;
  const [moving] = player.bank.splice(from, 1);
  const target = before ? player.bank.find(slot => slot.id === before) : undefined;
  let newTab = target ? target.tab ?? 0 : tab === "new" ? Math.min(BANK_TABS, (bankTabs(player).at(-1) ?? 0) + 1) : tab ?? moving.tab ?? 0;
  if (tab === "new" && bankTabs(player).length >= BANK_TABS) newTab = BANK_TABS;
  if (newTab) moving.tab = newTab; else delete moving.tab;
  if (target) player.bank.splice(player.bank.indexOf(target), 0, moving);
  else { const last = player.bank.map(slot => slot.tab ?? 0).lastIndexOf(newTab); player.bank.splice(last + 1, 0, moving); }
  compactBankTabs(player);
  return true;
}

// ---------- Equipment ----------
export function bonuses(player: Player): Bonuses {
  const total: Bonuses = { attack: 0, strength: 0, defence: 0, ranged: 0, magic: 0, prayer: 0 };
  for (const id of Object.values(player.equipment)) {
    const equip = id ? item(id).equip : undefined;
    if (!equip) continue;
    for (const key of Object.keys(total) as (keyof Bonuses)[]) total[key] += equip.bonuses[key] ?? 0;
  }
  total.defence += riding(player)?.defence ?? 0;
  total.strength += heft(player) + renown(player);
  // Wildfur, the Ring's highest tier: below a third of your health, every piece's strength counts twice.
  if (player.hp < maxHp(player) * 0.35) for (const id of Object.values(player.equipment)) if (id?.startsWith("wildfur_")) total.strength += item(id).equip?.bonuses.strength ?? 0;
  if (player.ward) total.defence += Math.round(total.defence * player.ward.defence) + player.ward.flat;
  return total;
}
/** A heavy weapon: a two-handed melee weapon (greatsword, battleaxe, war hammer, maul…), not a bow or a staff. */
export const isHeavy = (equip: NonNullable<Item["equip"]> | undefined) => !!equip?.twoHanded && !equip.bow && !equip.staff;
/** Heft: a heavy weapon's strength bonus grows with your Strength, 1% for every two levels (half as much again at 99). */
export function heft(player: Player) {
  const equip = player.equipment.weapon ? item(player.equipment.weapon).equip : undefined;
  if (!isHeavy(equip)) return 0;
  return Math.floor((equip!.bonuses.strength ?? 0) * levelForXp(player.xp.strength) / 200);
}
/** The Blade of Renown: its strength grows with your Presence, one for every four levels. */
export const renown = (player: Player) => player.equipment.weapon === "blade_of_renown" ? Math.floor(levelForXp(player.xp.presence) / 4) : 0;
/** Everything you wear, in kilograms. */
export const wornWeight = (player: Player) => Math.round(Object.values(player.equipment).reduce((sum, id) => sum + (id && isItem(id) ? item(id).weight ?? 0 : 0), 0) * 10) / 10;
export const weapon = (player: Player) => player.equipment.weapon ? item(player.equipment.weapon) : null;
export const isStaffEquipped = (player: Player) => !!weapon(player)?.equip?.staff;
export const attackSpeed = (player: Player) => weapon(player)?.equip?.speed ?? 4;
/** Active prayer multipliers. */
export function prayerBoost(player: Player) {
  const boost = { attack: 0, strength: 0, defence: 0, magic: 0, protect: false };
  for (const id of player.prayers) {
    const prayer = PRAYERS.find(entry => entry.id === id);
    if (!prayer) continue;
    boost.attack = Math.max(boost.attack, prayer.effect.attack ?? 0);
    boost.strength = Math.max(boost.strength, prayer.effect.strength ?? 0);
    boost.defence = Math.max(boost.defence, prayer.effect.defence ?? 0);
    boost.magic = Math.max(boost.magic, prayer.effect.magic ?? 0);
    boost.protect ||= !!prayer.effect.protect;
  }
  return boost;
}
/** Heartguard pieces worn: each adds a hitpoint and quickens healing; all nine make food heal more. */
export const heartguardPieces = (player: Player) => setPieces(player, "heartguard");
export const maxHp = (player: Player) => levelForXp(player.xp.hitpoints) + heartguardPieces(player);
export const maxPrayer = (player: Player) => levelForXp(player.xp.prayer);
