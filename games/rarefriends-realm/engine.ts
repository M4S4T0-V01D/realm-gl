/**
 * The Realm's rules: a 0.6 s game tick, pathfinding, skills, combat, monsters, menus, shops and saves.
 * Pure TypeScript over the Game state, so it runs the same in the browser and in node tests.
 */
import {
  ARMOURY_FIRST, ARMOURY_LATER, DAWNPLATE_QUEST, COOKING, CRAFTING, CROSSBOWS, FORGED_STAFF_MAGIC, LIMBS_OFFSET, metalLevel, STOCKS, WAR_BOWS, EMOTES, EQUIP_SLOTS, MOUNTS, PETS, mountDef, FLETCH_ARROWS, FLETCH_BOWS, SIGILCRAFT, STAFF_SIGILS, itemCategory, sigilsPerStone, FAMILY_NAMES, FIREMAKING, FISHING_SPOTS, GEM_CUTTING, METALS, MONSTERS, PRAYERS, RELICS, RF_BUNDLES, ROCKS, SHOPS, SHOP_BUY,
  FLETCH_WANDS, SHOP_SELL, SKILLS, SKILL_NAMES, SMELTING, SMITH_PIECES, SMITH_XP, SPELLS, TREES, WARDROBE, XP_TABLE, isItem, item, levelForXp, smithLevel, COURSES, WAYFARER_MARK, WAYFARER_REWARDS,
  type EquipSlot, type MetalId, type Skill, type Spell, type SpotKind, type WardrobeId, DYES, baseOf, dyeOf, dyeable, CARVINGS, CARVING_REACH, CARVINGS_AT_ONCE, type CarvingEffect } from "./data.ts";
import { cleanDaily } from "./daily.ts";
import { searchChest } from "./dungeons.ts";
import { arenaRevive, arenaTick } from "./arena.ts";
import { orderPieces } from "./knights.ts";
import { cleanOrders } from "./orders.ts";
import { cleanCard, cleanFellowshipLook } from "./cardstyle.ts";
import { applyHome, cleanHome, sleep } from "./housing.ts";
import { FIRST_STEPS, updateFirstSteps } from "./firststeps.ts";
import { cleanMet } from "./hiscores.ts";
import { addSlayerPoints, slayerBoost, slayerKill, slayerProblem, taskText } from "./slayer.ts";
import { runDrain, slipChance } from "./wayfaring.ts";
import { HERBS, brewRecipes, grindRecipes, herbDef, stillRecipes } from "./apothecary.ts";
import { friendSays, friendTick, friendWorks, outfitRemark, remember } from "./friend.ts";
import { presenceXp, cleanName, cleanTag, onAchievement as presenceAchievement, onBossFelled, onEmoteUsed, onFriendTime, onNpcTalked, onRareFind, onRegionEntered, onWorn } from "./presence.ts";
import { NPCS, QUESTS, readJobBoard, consecrateDawnstone, onAltarPrayed, examineItem, npcDef, onBonesOffered, onMonsterKilled, questDone, searchWell, shopProblem, talk, tanHides, useCryptAltar } from "./content.ts";
import { onWestTick, westTruce } from "./raria.ts";
import { codexTick } from "./codex.ts";
import { SOLDIERLY, SOLDIERS, TWIN_BASE, hostile, sideOf } from "./skirmish.ts";
import { examineCreature, inspectTrack, knows, learnTrick, masteryBoost, maxHpOf, onAttacked, onKilled, onPoison, onWeakSpot, rollMarked, trackTick } from "./pursuance.ts";
import {
  BANK_SIZE, BANK_TABS, DAY_MS, SATCHEL, SATCHEL_SIZE, STONE_BOX, STONE_BOX_SIZE, BONE_BAG, BONE_BAG_SIZE, bagAdd, bagBones, bagTakeAll, hasBoneBag, SIGIL_BAG, BELTS, beltAdd, beltContents, beltDef, wornBelt, SIGIL_BAG_SIZE, hasSigilBag, isSigil, sigilBagAdd, sigilBagTotal, sigilStock, useSigils, setPieces, wayfarerPieces, fullSlayerSet, heartguardPieces, mixtureOn, compactBankTabs, hasSatchel, hasStoneBox, stock, useUp, INVENTORY_SIZE, REFERRAL_COINS, REFERRALS_PER_DAY, REFERRAL_TICKS, addXp, attackSpeed, bonuses, canHold, count, dropItem, emit, freeSlots, give, giveOrDrop, has, hasTool, isStaffEquipped,
  level, maxHp, maxPrayer, message, prayerBoost, riding, sound, take, weapon, combatLevel, createGame,
  type Activity, type CombatStyle, type Dialogue, type Game, type Monster, type Npc, type Player, type Point, type Recipe, type Slot, type BankSlot, type Target,
 type WorkOrder,
} from "./state.ts";
import { FLOOR_Y, MAINLAND, T, W, WEST_DX, H, inArena, inBounds, inRingBuilding, isUnderground, isWater, mainlandToWorld, objectAtTile, realPoint, regionAt, terrainAt, tileIndex, walkable, type WorldObject } from "./world.ts";

export { createGame };

// ---------- Movement ----------
export function fireAt(game: Game, x: number, y: number) { return game.fires.find(fire => fire.x === x && fire.y === y) ?? null; }
export function canWalk(game: Game, x: number, y: number) { return walkable(game.world, x, y) && !fireAt(game, x, y); }
function canStep(game: Game, x: number, y: number, dx: number, dy: number) {
  if (!canWalk(game, x + dx, y + dy)) return false;
  if (dx && dy) return canWalk(game, x + dx, y) && canWalk(game, x, y + dy);
  return true;
}
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]] as const;
const RADIUS = 104, SPAN = RADIUS * 2 + 1;
const parents = new Int32Array(SPAN * SPAN);
/**
 * Breadth-first search (8 directions, no corner cutting) from the player to any goal tile. When no goal is reachable,
 * walks to the reachable tile closest to `near`, like the old-school client does.
 */
export function findPath(game: Game, from: Point, goal: (x: number, y: number) => boolean, near?: Point): Point[] | null {
  const ox = from.x - RADIUS, oy = from.y - RADIUS;
  parents.fill(-1);
  const startIndex = RADIUS * SPAN + RADIUS, queue = new Int32Array(SPAN * SPAN);
  let head = 0, tail = 0, best = startIndex, bestDistance = near ? Math.hypot(from.x - near.x, from.y - near.y) : Infinity;
  queue[tail++] = startIndex; parents[startIndex] = startIndex;
  if (goal(from.x, from.y)) return [];
  let found = -1;
  while (head < tail) {
    const index = queue[head++], lx = index % SPAN, ly = (index - lx) / SPAN, x = lx + ox, y = ly + oy;
    for (const [dx, dy] of DIRS) {
      const nx = lx + dx, ny = ly + dy;
      if (nx < 0 || ny < 0 || nx >= SPAN || ny >= SPAN) continue;
      const next = ny * SPAN + nx;
      if (parents[next] >= 0 || !canStep(game, x, y, dx, dy)) continue;
      parents[next] = index; queue[tail++] = next;
      if (goal(x + dx, y + dy)) { found = next; break; }
      if (near) { const distance = Math.hypot(x + dx - near.x, y + dy - near.y); if (distance < bestDistance) { bestDistance = distance; best = next; } }
    }
    if (found >= 0) break;
  }
  const end = found >= 0 ? found : near && best !== startIndex ? best : -1;
  if (end < 0) return null;
  const path: Point[] = [];
  for (let index = end; index !== startIndex; index = parents[index]) path.push({ x: (index % SPAN) + ox, y: Math.floor(index / SPAN) + oy });
  return path.reverse();
}
/** A world-space heading toward (dx, dy); kept when the step is zero. */
function headingTo(dx: number, dy: number, current: Point): Point {
  return dx || dy ? { x: Math.sign(dx), y: Math.sign(dy) } : current;
}
function face(game: Game, x: number, y: number) {
  const player = game.player;
  player.heading = headingTo(x - player.x, y - player.y, player.heading);
}
function moveTo(game: Game, x: number, y: number) {
  const player = game.player;
  game.trail.push({ x: player.x, y: player.y }); if (game.trail.length > 8) game.trail.shift();
  player.prev = { x: player.x, y: player.y }; player.heading = headingTo(x - player.x, y - player.y, player.heading);
  player.x = x; player.y = y; player.moved = game.tick;
}
function stopAll(game: Game) {
  const player = game.player;
  player.path = []; player.target = null; player.activity = null; player.combat = null;
}
/** Click-to-walk. Cancels whatever the player was doing. */
export function walkTo(game: Game, x: number, y: number) {
  if (game.player.stunned > 0) { message(game, "You're stunned!", "warn"); return false; }
  stopAll(game); closeInterfaces(game);
  const path = findPath(game, game.player, (px, py) => px === x && py === y, { x, y });
  if (!path) return false;
  game.player.path = path;
  return true;
}
/** Held movement direction as a world-space vector (the UI converts WASD for the current camera angle). */
export function setHeld(game: Game, held: { dx: number; dy: number } | null) {
  if (held && (held.dx || held.dy)) {
    if (!game.held) { stopAll(game); closeInterfaces(game); }
    game.held = held;
  } else game.held = null;
}
export function closeInterfaces(game: Game) {
  game.ui.bank = false; game.ui.shop = null; game.ui.production = null; game.dialogue = null;
}

// ---------- Targets and reach ----------
const footprint = (monster: Monster) => monster.def.size ?? 1;
function adjacentTo(x: number, y: number, tx: number, ty: number, size = 1) {
  // Cardinal adjacency to a size × size footprint whose corner is (tx, ty).
  const insideX = x >= tx && x < tx + size, insideY = y >= ty && y < ty + size;
  return (insideX && (y === ty - 1 || y === ty + size)) || (insideY && (x === tx - 1 || x === tx + size));
}
const chebyshev = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const monsterByUid = (game: Game, uid: number) => game.monsters.find(monster => monster.uid === uid && !monster.dead) ?? null;
export const npcByUid = (game: Game, uid: number) => game.npcs.find(npc => npc.uid === uid && !npc.drawn) ?? null;
function targetPoint(game: Game, target: Target): (Point & { size?: number; object?: WorldObject }) | null {
  switch (target.kind) {
    case "object": { const object = game.world.objects[target.id]; return object ? { x: object.x, y: object.y, object } : null; }
    case "npc": { const npc = npcByUid(game, target.uid); return npc ? { x: npc.x, y: npc.y } : null; }
    case "monster": { const monster = monsterByUid(game, target.uid); return monster ? { x: monster.x, y: monster.y, size: footprint(monster) } : null; }
    case "ground": { const ground = game.ground.find(entry => entry.uid === target.uid); return ground ? { x: ground.x, y: ground.y } : null; }
    case "fire": { const fire = game.fires.find(entry => entry.uid === target.uid); return fire ? { x: fire.x, y: fire.y } : null; }
    case "track": { const track = game.tracks.find(entry => entry.uid === target.uid); return track ? { x: track.x, y: track.y } : null; }
  }
}
function magicRange(target: Target) { return target.kind === "monster" && (target.spell || target.option === "Attack") ? 8 : 0; }
/** A bow's reach (Longrange adds two), or 0 for melee. */
export function bowRange(game: Game) { const bow = weapon(game.player)?.equip?.bow; return bow ? bow.range + (game.player.style === "defensive" ? 2 : 0) : 0; }
/** Tiles between a point and the nearest tile of a size × size footprint (0 inside it). */
function reachGap(at: Point, x: number, y: number, size = 1) { const { gx, gy } = gapTo(at, x, y, size); return Math.max(gx, gy); }
function inReach(game: Game, target: Target, at: Point, point: Point & { size?: number; object?: WorldObject }) {
  if (target.kind === "monster" && castingSpell(game, target)) return chebyshev(at, point) <= magicRange(target) && chebyshev(at, point) >= 1;
  if (target.kind === "monster" && target.option === "Attack" && bowRange(game)) { const gap = reachGap(at, point.x, point.y, point.size ?? 1); return gap >= 1 && gap <= bowRange(game); }
  if (target.kind === "ground" && target.spell) return chebyshev(at, point) <= 8;
  if (target.kind === "ground") return at.x === point.x && at.y === point.y || (!canWalk(game, point.x, point.y) && adjacentTo(at.x, at.y, point.x, point.y));
  if (target.kind === "object" && point.object && !point.object.blocks) return chebyshev(at, point) <= 1;
  // Tracks are read standing over them or beside them.
  if (target.kind === "track") return chebyshev(at, point) <= 1;
  return adjacentTo(at.x, at.y, point.x, point.y, point.size ?? 1);
}
function castingSpell(game: Game, target: Target): Spell | null {
  if (target.kind !== "monster") return null;
  const id = target.spell ?? (target.option === "Attack" ? game.player.autocast : null);
  return id ? SPELLS.find(spell => spell.id === id) ?? null : null;
}
/** Start walking to a target and act on arrival. */
export function setTarget(game: Game, target: Target) {
  const player = game.player;
  if (player.stunned > 0) { message(game, "You're stunned!", "warn"); return; }
  closeInterfaces(game);
  player.activity = null; player.combat = null; player.target = target; game.held = null;
  routeToTarget(game);
}
function routeToTarget(game: Game) {
  const player = game.player, target = player.target;
  if (!target) return;
  const point = targetPoint(game, target);
  if (!point) { player.target = null; return; }
  if (inReach(game, target, player, point)) { player.path = []; return; }
  const path = findPath(game, player, (x, y) => inReach(game, target, { x, y }, point), point);
  player.path = path ?? [];
  if (!path) { message(game, "I can't reach that!", "warn"); player.target = null; }
}

// ---------- Menus ----------
/** Something under the pointer. "peer" is another player (its id is their Friend ID). */
export type Pick = { kind: "monster" | "npc" | "object" | "ground" | "fire" | "peer" | "pground" | "track"; id: number };
export type MenuOption = { verb: string; noun: string; tone: "object" | "npc" | "monster" | "item" | "plain" | "level"; run: (game: Game) => void };
export type Selection = { kind: "item"; slot: number } | { kind: "spell"; spell: string } | null;
const OBJECT_EXAMINE: Partial<Record<string, string>> = {
  range: "A hot range. Good for cooking.", furnace: "A red hot furnace.", anvil: "Used for smithing.", bank: "A place to keep your things safe.",
  altar: "An altar to the Old Friend.", fountain: "The water sparkles.", mill: "Grain goes in, flour comes out.", dairy_cow: "Fat and full of milk.",
  wheat: "Some ripe wheat.", coop: "Feathers everywhere.", casket: "A chest of Rare Caskets, sold for simulated $RAREFRIENDS.", tanning: "Hides stretched out to dry.",
  well: "A deep stone well.", sign: "A signpost.", herb: "A patch of herbs. An apothecary would know which.", still: "A copper still. Clean herbs go in; their essence comes out.", sigil_altar: "An old altar. Press sigil stones into it to make sigils.", stump: "This tree has been cut down.", spot: "Ripples on the water.", gate: "An old gate, sealed with shadow.",
};
function objectOptions(game: Game, object: WorldObject): string[] {
  if (game.depleted.has(object.id) && (object.kind === "tree" || object.kind === "rock" || object.kind === "stall" || object.kind === "wheat")) return [];
  switch (object.kind) {
    case "tree": return ["Chop down"];
    case "herb": return ["Pick"];
    case "still": return ["Distil"];
    case "rock": return ["Mine", "Prospect"];
    case "spot": { const spot = FISHING_SPOTS[object.spot!]; return object.spot === "bait" ? ["Bait", "Net"] : object.spot === "lure" ? ["Lure", "Bait"] : object.spot === "cage" ? ["Cage", "Harpoon"] : [spot.action]; }
    case "range": return ["Cook"];
    case "furnace": return ["Smelt"];
    case "wheel": return ["Spin"];
    case "anvil": return ["Smith"];
    case "bank": return ["Bank"];
    case "altar": return object.text === "crypt" ? ["Pray-at", "Search"] : ["Pray-at"];
    case "ladder": case "obstacle": case "gate": return [object.action ?? "Use"];
    case "stall": return ["Steal-from"];
    case "mill": return ["Operate"];
    case "dairy_cow": return ["Milk"];
    case "wheat": return ["Pick"];
    case "coop": return ["Take-egg"];
    case "casket": return ["Open-caskets"];
    case "sign": return ["Read"];
    case "board": return ["Read"];
    case "tanning": return ["Tan"];
    case "well": return ["Search"];
    case "sigil_altar": return ["Craft-sigil"];
    case "decor": return object.name.endsWith("(sleep)") ? ["Sleep"] : object.name.endsWith("(fill)") || object.name === "Water barrel" ? ["Fill vials"] : object.name.endsWith("(furnish)") ? ["Warm-up", "Furnish"] : object.decor === "chest" && !object.name.startsWith("Chest") ? ["Search"] : [];
    default: return [];
  }
}
const objectName = (game: Game, object: WorldObject) => object.kind === "tree" && game.depleted.has(object.id) ? "Tree stump" : object.kind === "rock" && game.depleted.has(object.id) ? "Rocks" : object.name;
/** Every option for the things under the pointer, in old-school order. The first one is the left-click action. */
export function menuFor(game: Game, picks: readonly Pick[], tile: Point | null, selection: Selection = null): MenuOption[] {
  const out: MenuOption[] = [], player = game.player;
  const used = selection?.kind === "item" ? player.inventory[selection.slot] : null;
  const spell = selection?.kind === "spell" ? SPELLS.find(entry => entry.id === selection.spell) : null;
  const useLabel = used ? `Use ${item(used.id).name} ->` : spell ? `Cast ${spell.name} ->` : null;
  for (const pick of picks) {
    if (pick.kind === "monster") {
      const monster = monsterByUid(game, pick.id);
      if (!monster) continue;
      const noun = `${monster.marked ? `Marked ${monster.def.name}` : monster.def.name}  (level-${monster.def.level})`;
      if (spell) { if (spell.target === "monster") out.push({ verb: useLabel!, noun, tone: "monster", run: g => setTarget(g, { kind: "monster", uid: monster.uid, option: "Cast", spell: spell.id }) }); continue; }
      if (used) { out.push({ verb: useLabel!, noun, tone: "monster", run: g => message(g, "Nothing interesting happens.") }); continue; }
      if (monster.def.shear) out.push({ verb: "Shear", noun: monster.def.name, tone: "monster", run: g => setTarget(g, { kind: "monster", uid: monster.uid, option: "Shear" }) });
      out.push({ verb: "Attack", noun, tone: "monster", run: g => setTarget(g, { kind: "monster", uid: monster.uid, option: "Attack" }) });
      out.push({ verb: "Examine", noun: monster.def.name, tone: "monster", run: g => message(g, examineCreature(g, monster)) });
    } else if (pick.kind === "npc") {
      const npc = npcByUid(game, pick.id);
      if (!npc) continue;
      const def = npcDef(npc.id);
      if (spell) continue;
      if (used && selection?.kind === "item") { out.push({ verb: useLabel!, noun: def.name, tone: "npc", run: g => setTarget(g, { kind: "npc", uid: npc.uid, option: "Use", use: selection.slot }) }); continue; }
      for (const option of def.options) out.push({ verb: option, noun: def.name, tone: "npc", run: g => setTarget(g, { kind: "npc", uid: npc.uid, option }) });
      // Every soldier can be fought: it draws steel, and its comrades with it.
      const soldier = SOLDIERS[npc.id];
      if (soldier) out.push({ verb: "Attack", noun: `${def.name}  (level-${soldier.level})`, tone: "npc", run: g => attackSoldier(g, npc.uid) });
      out.push({ verb: "Examine", noun: def.name, tone: "npc", run: g => message(g, def.examine) });
    } else if (pick.kind === "object") {
      const object = game.world.objects[pick.id];
      if (!object || object.name === "__removed") continue;
      const name = objectName(game, object);
      if (useLabel && selection?.kind === "item") { out.push({ verb: useLabel, noun: name, tone: "object", run: g => setTarget(g, { kind: "object", id: object.id, option: "Use", use: selection.slot }) }); continue; }
      if (useLabel) continue;
      for (const option of objectOptions(game, object)) out.push({ verb: option, noun: name, tone: "object", run: g => setTarget(g, { kind: "object", id: object.id, option }) });
      out.push({ verb: "Examine", noun: name, tone: "object", run: g => message(g, examineObject(g, object)) });
    } else if (pick.kind === "ground") {
      const ground = game.ground.find(entry => entry.uid === pick.id);
      if (!ground) continue;
      const noun = ground.n > 1 ? `${item(ground.id).name} (${ground.n})` : item(ground.id).name;
      if (spell?.target === "ground") { out.push({ verb: useLabel!, noun, tone: "item", run: g => setTarget(g, { kind: "ground", uid: ground.uid, option: "Cast", spell: spell.id }) }); continue; }
      if (useLabel) continue;
      out.push({ verb: "Take", noun, tone: "item", run: g => setTarget(g, { kind: "ground", uid: ground.uid, option: "Take" }) });
      out.push({ verb: "Examine", noun: item(ground.id).name, tone: "item", run: g => message(g, examineItem(ground.id)) });
    } else if (pick.kind === "track") {
      const track = game.tracks.find(entry => entry.uid === pick.id);
      if (!track || useLabel) continue;
      out.push({ verb: "Inspect", noun: "Tracks", tone: "object", run: g => setTarget(g, { kind: "track", uid: track.uid, option: "Inspect" }) });
      out.push({ verb: "Examine", noun: "Tracks", tone: "object", run: g => message(g, "Tracks in the ground. Something passed this way.") });
    } else if (pick.kind === "fire") {
      const fire = game.fires.find(entry => entry.uid === pick.id);
      if (!fire) continue;
      if (useLabel && selection?.kind === "item") { out.push({ verb: useLabel, noun: "Fire", tone: "object", run: g => setTarget(g, { kind: "fire", uid: fire.uid, option: "Use", use: selection.slot }) }); continue; }
      out.push({ verb: "Cook-at", noun: "Fire", tone: "object", run: g => setTarget(g, { kind: "fire", uid: fire.uid, option: "Cook" }) });
      out.push({ verb: "Examine", noun: "Fire", tone: "object", run: g => message(g, "A crackling fire.") });
    }
  }
  if (tile) {
    const walk: MenuOption = { verb: "Walk here", noun: "", tone: "plain", run: g => { walkTo(g, tile.x, tile.y); } };
    // Old-school rule: on bare ground, Walk here is the left-click; over things, their first option is.
    const firstReal = out.findIndex(option => option.verb !== "Examine");
    if (firstReal === 0) out.splice(1, 0, walk); else out.unshift(walk);
  }
  return out;
}
function examineObject(game: Game, object: WorldObject): string {
  if (object.kind === "tree") return game.depleted.has(object.id) ? "This tree has been cut down." : `A ${object.name.toLowerCase()}. Woodcutting level ${TREES[object.tree!].level}.`;
  if (object.kind === "rock") return game.depleted.has(object.id) ? "There is currently no ore available in this rock." : `A rock. Mining level ${ROCKS[object.rock!].level}.`;
  if (object.kind === "spot") return `A ${object.name.toLowerCase()}. ${FISHING_SPOTS[object.spot!].catches.map(entry => `${item(entry.fish).name.replace("Raw ", "")} at ${entry.level}`).join(", ")}.`;
  if (object.kind === "obstacle") return `${object.name}. Wayfaring level ${object.obstacle!.level}.`;
  if (object.kind === "stall") return `A ${object.name.toLowerCase()}. Stealth level ${STALLS[object.stall!].level}.`;
  if (object.kind === "decor") return DECOR_EXAMINE[object.decor!] ?? "Nothing special.";
  if (object.kind === "sign") return object.text ?? "A signpost.";
  return OBJECT_EXAMINE[object.kind] ?? object.name;
}
const DECOR_EXAMINE: Partial<Record<string, string>> = {
  statue: "A statue of the First Friend. It looks a lot like yours.", windmill: "Its sails creak in the wind.", snowman: "A Friend made of snow. Its carrot is a pinecone.",
  tent: "Smells of Grumblin.", grave: "Here lies a Friend.", chest: "An old chest.", boat: "It's seen better days.", pillar: "Old stone. Older than the Realm.",
  fence: "A wooden fence.", pine: "A snowy pine.", cactus: "Don't hug it.", palm: "Coconuts, out of reach.", torch: "It flickers.", banner: "The banner of Friendhollow Castle.",
  throne: "Carved oak, gilded, and a cushion somebody sat on too long.", armour: "An empty suit of ashsteel armour. Probably empty.", bed: "Very soft. No time for naps.",
};

// ---------- Inventory actions ----------
export type ItemOption = { verb: string; run: (game: Game) => Selection | void };
export function itemOptions(game: Game, slotIndex: number): ItemOption[] {
  const slot = game.player.inventory[slotIndex];
  if (!slot) return [];
  const definition = item(slot.id), out: ItemOption[] = [];
  if (definition.heal) out.push({ verb: definition.drink ? "Drink" : "Eat", run: g => eat(g, slotIndex) });
  if (definition.bones) out.push({ verb: "Bury", run: g => bury(g, slotIndex) });
  if (herbDef(slot.id)) out.push({ verb: "Clean", run: g => cleanHerb(g, slotIndex) });
  if (definition.potion?.poison) out.push({ verb: "Coat-weapon", run: g => coatWeapon(g, slotIndex) });
  else if (definition.potion) out.push({ verb: "Drink", run: g => drink(g, slotIndex) });
  if (definition.equip) out.push({ verb: definition.equip.slot === "weapon" || definition.equip.slot === "shield" ? "Wield" : "Wear", run: g => equip(g, slotIndex) });
  if (FIREMAKING[slot.id]) out.push({ verb: "Light", run: g => lightFire(g, slotIndex) });
  if (CARVINGS.some(carving => carving.id === slot.id)) out.push({ verb: "Set-down", run: g => setCarving(g, slotIndex) });
  if (slot.id === "glimmer_shard") out.push({ verb: "Look-at", run: g => message(g, "The shard hums. Old Glimmer will want it back.") });
  if (definition.tablet) out.push({ verb: "Break", run: g => breakTablet(g, slotIndex) });
  if (slot.id === "insight_lamp") out.push({ verb: "Rub", run: g => { g.ui.lamp = slotIndex; } });
  if (slot.id === "ringmasters_signet") out.push({ verb: "Teleport", run: signetTeleport });
  if (slot.id === "slayer_gem") out.push({ verb: "Check", run: g => message(g, taskText(g)) });
  if (slot.id === SATCHEL) out.push({ verb: "Check", run: satchelCheck }, { verb: "Fill", run: satchelFill }, { verb: "Empty", run: satchelEmpty });
  if (slot.id === SIGIL_BAG) out.push({ verb: "Check", run: sigilBagCheck }, { verb: "Fill", run: sigilBagFill }, { verb: "Empty", run: sigilBagEmpty });
  if (beltDef(slot.id)) out.push({ verb: "Check", run: g => beltCheck(g, slot.id) }, { verb: "Fill", run: g => beltFill(g, slot.id) }, { verb: "Empty", run: g => beltEmpty(g, slot.id) });
  if (slot.id === STONE_BOX) out.push({ verb: "Check", run: boxCheck }, { verb: "Fill", run: boxFill }, { verb: "Empty", run: boxEmpty });
  if (slot.id === BONE_BAG) out.push({ verb: "Check", run: bagCheck }, { verb: "Fill", run: bagFill }, { verb: "Empty", run: bagEmpty });
  out.push({ verb: "Use", run: () => ({ kind: "item", slot: slotIndex }) });
  out.push({ verb: "Drop", run: g => drop(g, slotIndex) });
  out.push({ verb: "Examine", run: g => message(g, slot.n >= 100_000 ? `${slot.n.toLocaleString()} x ${definition.name}` : definition.examine) });
  return out;
}
export function satchelCheck(game: Game) { message(game, `Your inkcoal satchel holds ${game.player.coalBag} of ${SATCHEL_SIZE} inkcoal.`); }
/** Put all the inkcoal in your pack into the satchel. */
export function satchelFill(game: Game) {
  const player = game.player, n = Math.min(count(player, "inkcoal"), SATCHEL_SIZE - player.coalBag);
  if (!n) { message(game, count(player, "inkcoal") ? "Your satchel is full." : "You have no inkcoal to put in the satchel."); return; }
  take(player, "inkcoal", n); player.coalBag += n; message(game, `You fill the satchel with ${n} inkcoal (${player.coalBag}/${SATCHEL_SIZE}).`); sound(game, "pickup");
}
/** Tip as much inkcoal as fits back into your pack. */
export function satchelEmpty(game: Game) {
  const player = game.player, n = Math.min(player.coalBag, freeSlots(player));
  if (!player.coalBag) { message(game, "Your satchel is empty."); return; }
  if (!n) { message(game, "You have no room in your pack.", "warn"); return; }
  player.coalBag -= n; give(player, "inkcoal", n); message(game, `You take ${n} inkcoal out of the satchel (${player.coalBag} left).`); sound(game, "pickup");
}
export function boxCheck(game: Game) { message(game, `Your sigil stone box holds ${game.player.stoneBox} of ${STONE_BOX_SIZE} sigil stones.`); }
/** Put all the sigil stones in your pack into the box. */
export function boxFill(game: Game) {
  const player = game.player, n = Math.min(count(player, "sigil_stone"), STONE_BOX_SIZE - player.stoneBox);
  if (!n) { message(game, count(player, "sigil_stone") ? "Your sigil stone box is full." : "You have no sigil stones to put in the box."); return; }
  take(player, "sigil_stone", n); player.stoneBox += n; message(game, `You fill the box with ${n} sigil stones (${player.stoneBox}/${STONE_BOX_SIZE}).`); sound(game, "pickup");
}
/** Take as many stones out as your pack has room for. */
export function boxEmpty(game: Game) {
  const player = game.player, n = Math.min(player.stoneBox, freeSlots(player));
  if (!player.stoneBox) { message(game, "Your sigil stone box is empty."); return; }
  if (!n) { message(game, "You have no room in your pack.", "warn"); return; }
  player.stoneBox -= n; give(player, "sigil_stone", n); message(game, `You take ${n} sigil stones out of the box (${player.stoneBox} left).`); sound(game, "pickup");
}
const bagText = (player: Player) => Object.entries(player.boneBag).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${item(id).name.toLowerCase()}`).join(", ");
export function bagCheck(game: Game) {
  const n = bagBones(game.player);
  message(game, n ? `Your ossuary bag holds ${n} of ${BONE_BAG_SIZE} bones: ${bagText(game.player)}.` : `Your ossuary bag is empty (it holds ${BONE_BAG_SIZE} bones).`);
}
/** Put bones from your pack into the bag: one kind, or every kind, as many as fit. */
export function bagFill(game: Game, kind?: string) {
  const player = game.player;
  let moved = 0;
  for (let index = 0; index < player.inventory.length; index++) {
    const slot = player.inventory[index];
    if (!slot || !item(slot.id).bones || (kind && slot.id !== kind)) continue;
    const n = bagAdd(player, slot.id, slot.n);
    if (!n) continue;
    if (n >= slot.n) player.inventory[index] = null; else slot.n -= n;
    moved += n;
  }
  if (!moved) { message(game, bagBones(player) >= BONE_BAG_SIZE ? "Your ossuary bag is full." : "You have no bones to put in the bag."); return; }
  message(game, `You put ${moved} bones in the ossuary bag (${bagBones(player)}/${BONE_BAG_SIZE}).`); sound(game, "pickup");
}
/** Tip as many bones as your pack has room for back out of the bag. */
export function bagEmpty(game: Game) {
  const player = game.player;
  if (!bagBones(player)) { message(game, "Your ossuary bag is empty."); return; }
  let moved = 0;
  for (const [id, n] of Object.entries(player.boneBag)) {
    const out = Math.min(n, freeSlots(player));
    if (out <= 0) continue;
    give(player, id, out); player.boneBag[id] = n - out; moved += out;
    if (!player.boneBag[id]) delete player.boneBag[id];
  }
  if (!moved) { message(game, "You have no room in your pack.", "warn"); return; }
  message(game, `You take ${moved} bones out of the ossuary bag (${bagBones(player)} left).`); sound(game, "pickup");
}
/** Tip the whole ossuary bag onto an altar: every bone inside is offered at once. */
// ---------- Belts ----------
const beltText = (contents: Record<string, number>) => Object.entries(contents).filter(([, n]) => n > 0).map(([id, n]) => `${n.toLocaleString()} ${item(id).name.toLowerCase()}`).join(", ");
export function beltCheck(game: Game, beltId: string) {
  const belt = beltDef(beltId); if (!belt) return;
  const contents = beltContents(game.player, beltId), total = Object.values(contents).reduce((sum, n) => sum + n, 0);
  message(game, total ? `Your ${belt.name.toLowerCase()} holds ${beltText(contents)}.` : `Your ${belt.name.toLowerCase()} is empty.`);
}
/** Put everything the belt takes from your pack into it (or one kind). */
export function beltFill(game: Game, beltId: string, only?: string) {
  const player = game.player, belt = beltDef(beltId); if (!belt) return;
  let moved = 0;
  const totals = new Map<string, number>();
  for (const slot of player.inventory) if (slot && (!only || slot.id === only) && belt.group(slot.id)) totals.set(slot.id, (totals.get(slot.id) ?? 0) + slot.n);
  for (const [id, total] of totals) { const n = beltAdd(player, belt, id, total); if (n > 0) { take(player, id, n); moved += n; } }
  message(game, moved ? `You tuck ${moved.toLocaleString()} things into the ${belt.name.toLowerCase()}: ${beltText(beltContents(player, beltId))}.` : `Nothing in your pack fits the ${belt.name.toLowerCase()}, or it's full.`); if (moved) sound(game, "pickup");
}
export function beltEmpty(game: Game, beltId: string) {
  const player = game.player, belt = beltDef(beltId); if (!belt) return;
  const contents = beltContents(player, beltId); let moved = 0;
  for (const [id, n] of Object.entries(contents)) { if (n <= 0) continue; const given = n - give(player, id, n); if (given > 0) { contents[id] -= given; moved += given; if (!contents[id]) delete contents[id]; } }
  message(game, moved ? `You take ${moved.toLocaleString()} things out of the ${belt.name.toLowerCase()}.` : "The belt is empty, or your pack is full."); if (moved) sound(game, "pickup");
}
/** Sip from the apothecary's belt: a healing draught when you're hurt, else the first potion in it. */
export function sipBelt(game: Game) {
  const player = game.player, belt = wornBelt(player);
  if (!belt || belt.id !== "apothecary_belt") { message(game, "You need an apothecary's belt on to sip from it.", "warn"); return; }
  const contents = beltContents(player, belt.id), potions = Object.keys(contents).filter(id => contents[id] > 0 && item(id).potion && !item(id).potion!.poison);
  const pick = (player.hp < maxHp(player) ? potions.find(id => item(id).potion!.heal) : null) ?? potions[0];
  if (!pick) { message(game, "There's no potion on your belt."); return; }
  const effect = item(pick).potion!;
  if (effect.mixture && effect.mixture.family !== player.familyId) { message(game, "That mixture isn't for your Friend's family.", "warn"); return; }
  contents[pick]--; if (!contents[pick]) delete contents[pick]; give(player, "vial");
  applyPotion(game, pick);
}
/** A water barrel in a village: every empty vial you carry (and the apothecary's belt) fills up. */
export function fillVials(game: Game) {
  const player = game.player, vials = count(player, "vial");
  if (!vials) { message(game, "You have no empty vials to fill."); return; }
  take(player, "vial", vials); let left = vials;
  const belt = wornBelt(player); if (belt) left -= beltAdd(player, belt, "vial_of_water", left);
  if (left > 0) give(player, "vial_of_water", left);
  message(game, `You fill ${vials} vial${vials === 1 ? "" : "s"} from the barrel.`); sound(game, "pickup");
}
// ---------- The sigil satchel ----------
const sigilBagText = (player: Player) => Object.entries(player.sigilBag).filter(([, n]) => n > 0).map(([id, n]) => `${n.toLocaleString()} ${item(id).name.toLowerCase().replace(" sigil", "")}`).join(", ");
export function sigilBagCheck(game: Game) {
  const total = sigilBagTotal(game.player);
  message(game, total ? `Your sigil satchel holds ${total.toLocaleString()} sigils: ${sigilBagText(game.player)} (${SIGIL_BAG_SIZE.toLocaleString()} of each kind at most).` : `Your sigil satchel is empty (it holds ${SIGIL_BAG_SIZE.toLocaleString()} of every kind of sigil).`);
}
/** Put every sigil in your pack (or one kind) into the satchel. */
export function sigilBagFill(game: Game, only?: string) {
  const player = game.player; let moved = 0;
  for (const slot of player.inventory) {
    if (!slot || !isSigil(slot.id) || (only && slot.id !== only)) continue;
    const n = sigilBagAdd(player, slot.id, slot.n); if (n > 0) { take(player, slot.id, n); moved += n; }
  }
  if (!moved) { message(game, only ? "The satchel has no room for more of those." : "You have no sigils to put in the satchel (or it's full of the kinds you carry)."); return; }
  message(game, `You put ${moved.toLocaleString()} sigils in the satchel: ${sigilBagText(player)}.`); sound(game, "pickup");
}
export function sigilBagEmpty(game: Game) {
  const player = game.player; let moved = 0;
  for (const [id, n] of Object.entries(player.sigilBag)) { if (n <= 0) continue; const given = n - give(player, id, n); if (given > 0) { player.sigilBag[id] -= given; moved += given; if (!player.sigilBag[id]) delete player.sigilBag[id]; } }
  message(game, moved ? `You take ${moved.toLocaleString()} sigils out of the satchel.` : "Your satchel is empty, or your pack is full."); if (moved) sound(game, "pickup");
}
export function offerBag(game: Game, chapel: boolean) {
  const player = game.player, bones = bagTakeAll(player), n = bones.reduce((sum, [, count]) => sum + count, 0);
  if (!n) { message(game, "Your ossuary bag is empty."); return; }
  const bonus = (player.familyId === 0 ? 1.5 : 1) * (chapel ? 3 : 2) * boneBoost(player, game);
  let xp = 0;
  for (const [id, count] of bones) { xp += item(id).bones! * bonus * count; for (let i = 0; i < count; i++) onBonesOffered(game, chapel); }
  addXp(game, "prayer", xp); sound(game, "pray");
  message(game, `You tip the ossuary bag onto the altar and offer ${n} bones at once${chapel ? ". The candles flare" : ""}.`);
  player.activity = null;
}
// ---------- Apothecary: cleaning, drinking, coating and poison ----------
/** Clean a raw herb: a little XP, and the herb is ready to brew or grind. */
export function cleanHerb(game: Game, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex], herb = slot && herbDef(slot.id);
  if (!slot || !herb) return;
  if (level(game, "apothecary") < herb.level) { message(game, `You need an Apothecary level of ${herb.level} to clean ${herb.name.toLowerCase()}.`, "warn"); return; }
  player.inventory[slotIndex] = { id: `clean_${herb.id}`, n: 1 };
  addXp(game, "apothecary", Math.round(herb.xp * 0.4)); message(game, `You clean the ${herb.name.toLowerCase()}.`); sound(game, "click");
}
/** A boost's size: flat plus a share of your level. */
const boostAmount = (game: Game, skill: Skill, [flat, share]: readonly [number, number]) => flat + Math.floor(levelForXp(game.player.xp[skill]) * share);
export function drink(game: Game, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex], effect = slot && item(slot.id).potion;
  if (!slot || !effect || effect.poison) return;
  if (effect.mixture && effect.mixture.family !== player.familyId) { message(game, `This mixture was made for ${FAMILY_NAMES[effect.mixture.family]} Friends. Yours is a ${FAMILY_NAMES[player.familyId]}; it would do nothing.`, "warn"); return; }
  take(player, slot.id); give(player, "vial");
  applyPotion(game, slot.id);
}
/** What a potion does once it's down: the effects, and the message. */
export function applyPotion(game: Game, id: string) {
  const player = game.player, effect = item(id).potion!, slot = { id };
  const notes: string[] = [];
  if (effect.heal) { const before = player.hp; player.hp = Math.min(maxHp(player), player.hp + effect.heal); if (player.hp > before) notes.push(`heals ${player.hp - before}`); }
  if (effect.energy) { player.energy = Math.min(100, player.energy + effect.energy); notes.push("restores your run energy"); }
  if (effect.faith) { player.prayer = Math.min(maxPrayer(player), player.prayer + Math.round(maxPrayer(player) * effect.faith)); notes.push("restores your faith"); }
  if (effect.boost) for (const [skill, amount] of Object.entries(effect.boost) as [Skill, readonly [number, number]][]) {
    const boost = boostAmount(game, skill, amount);
    player.boosts[skill] = Math.max(player.boosts[skill] ?? 0, boost); notes.push(`+${boost} ${SKILL_NAMES[skill]}`);
  }
  if (effect.antidote) { player.poison = null; player.antidoteUntil = game.tick + effect.antidote; notes.push("cures poison and keeps it off"); }
  if (effect.antifire) { player.antifireUntil = game.tick + effect.antifire; notes.push("shields you from dragonfire"); }
  if (effect.stealth) { player.stealthUntil = game.tick + effect.stealth; notes.push("softens your step"); }
  if (effect.tonic) { player.tonicUntil = game.tick + effect.tonic; notes.push("quickens your second wind"); }
  if (effect.mixture) { player.stats.mixtures = (player.stats.mixtures ?? 0) + 1; friendSays(game, "mixture"); player.mixture = { family: effect.mixture.family, until: game.tick + effect.mixture.ticks }; notes.push(`your ${FAMILY_NAMES[player.familyId]} nature comes to the surface`); emit(game, { type: "cast", spell: "mixture", tick: game.tick }); presenceXp(game, 50); }
  message(game, `You drink the ${item(slot.id).name.toLowerCase()}. It ${notes.join(", ") || "tastes of very little"}.`); sound(game, "eat");
}
/** Coat your wielded melee weapon with a poison. */
export function coatWeapon(game: Game, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex], poison = slot && item(slot.id).potion?.poison, weapon = player.equipment.weapon;
  if (!slot || !poison) return;
  const held = weapon ? item(weapon).equip : undefined;
  if (!weapon || !held || held.staff || held.bow) { message(game, "You need to be wielding a melee weapon to coat it.", "warn"); return; }
  take(player, slot.id); give(player, "vial");
  player.weaponPoison = { weapon, damage: poison.damage, charges: poison.charges, weaken: !!poison.weaken };
  message(game, `You coat your ${item(weapon).name.toLowerCase()} with ${item(slot.id).name.toLowerCase()}: ${poison.charges} poisoned hits.`); sound(game, "click");
}
/** A melee hit from a coated weapon poisons the creature, if poison takes on it. */
function applyWeaponPoison(game: Game, monster: Monster) {
  const player = game.player, coat = player.weaponPoison;
  if (!coat || coat.weapon !== player.equipment.weapon || coat.charges <= 0) return;
  coat.charges--; if (coat.charges <= 0) { player.weaponPoison = null; message(game, "The poison on your weapon has worn off."); }
  onPoison(game, monster);
  if (monster.def.poisonImmune && !coat.weaken) return;
  const damage = Math.round(coat.damage * (monster.def.poisonWeak ?? 1));
  monster.poison = { damage, left: 4, timer: 8 };
  if (coat.weaken) monster.curses.defence = game.tick + 40;
  addXp(game, "apothecary", 2);
}
/** A venomous creature's bite. */
function poisonPlayer(game: Game, damage: number) {
  const player = game.player;
  if (player.antidoteUntil > game.tick) return;
  if (!player.poison) message(game, "You've been poisoned! An antidote would cure it.", "warn");
  player.poison = { damage, left: 4, timer: 10 };
}
/** Ticks between regenerated hitpoints: 100, 50 for Cellular Friends, 6% fewer for each Heartguard piece worn. */
export const regenTicks = (player: Player) => Math.round((player.familyId === 3 ? 50 : 100) * (1 - 0.06 * heartguardPieces(player)));
/** Food heals a quarter more in the full Heartguard set. */
export const foodBoost = (player: Player, game?: Game) => (heartguardPieces(player) >= 9 ? 1.25 : 1) * (game && mixtureOn(game, 2) ? 1.5 : 1);
export function eat(game: Game, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex];
  if (!slot || !item(slot.id).heal) return;
  if (player.eatTimer > 0) return;
  const heal = Math.round(item(slot.id).heal! * foodBoost(player, game)), before = player.hp;
  player.hp = Math.min(maxHp(player), player.hp + heal);
  const energy = item(slot.id).energy ?? 0;
  if (energy) player.energy = Math.min(100, player.energy + energy);
  if (slot.id === "cake") { player.inventory[slotIndex] = null; } else take(player, slot.id);
  player.eatTimer = 3; if (player.combat !== null) player.attackTimer = Math.max(player.attackTimer, 3);
  // A good meal lends a skill a little for a while (a point wears off every minute).
  const lent: string[] = [];
  for (const [skill, amount] of Object.entries(item(slot.id).food ?? {}) as [Skill, number][]) { if (!amount) continue; player.boosts[skill] = Math.max(player.boosts[skill] ?? 0, amount); lent.push(`+${amount} ${SKILL_NAMES[skill]}`); }
  message(game, `You ${item(slot.id).drink ? "drink" : "eat"} the ${item(slot.id).name.toLowerCase()}.${energy ? " The spring comes back into your step." : player.hp > before ? " It heals some health." : ""}${lent.length ? ` ${lent.join(", ")} for a while.` : ""}`); sound(game, "eat");
}
/** Wightbone armour: 10% more Faith XP from bones a piece, 40% in the full set. */
export const boneBoost = (player: Player, game?: Game) => (1 + (fullSlayerSet(player, "wightbone") ? 0.4 : 0.1 * setPieces(player, "wightbone"))) * (game && mixtureOn(game, 0) ? 2 : 1);
export function bury(game: Game, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex];
  if (!slot || !item(slot.id).bones) return;
  player.inventory[slotIndex] = null;
  const bonus = (player.familyId === 0 ? 1.5 : 1) * boneBoost(player, game);
  addXp(game, "prayer", item(slot.id).bones! * bonus); message(game, "You dig a hole in the ground… You bury the bones."); sound(game, "bury");
  player.activity = null;
}
/**
 * Offer bones at an altar: twice the Faith XP of burying them, three times at the Dawnhold chapel (where the Order's
 * vigil counts them).
 */
export function offerBones(game: Game, slotIndex: number, chapel: boolean) {
  const player = game.player, slot = player.inventory[slotIndex];
  if (!slot || !item(slot.id).bones) return;
  player.inventory[slotIndex] = null;
  const bonus = (player.familyId === 0 ? 1.5 : 1) * (chapel ? 3 : 2) * boneBoost(player, game);
  addXp(game, "prayer", item(slot.id).bones! * bonus); sound(game, "pray");
  message(game, chapel ? "You offer the bones on the chapel altar. The candles flare." : "You offer the bones on the altar.");
  onBonesOffered(game, chapel);
}
/** Ticks between bones offered at an altar. */
export const OFFER_TICKS = 2;
/** Use bones on an altar: the first goes at once, then one more of that kind every couple of ticks until the pack has none left. */
export function startOffering(game: Game, object: WorldObject, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex];
  if (!slot || !item(slot.id).bones) return;
  const bones = slot.id;
  offerBones(game, slotIndex, object.text === "dawn");
  player.activity = has(player, bones) ? { kind: "offer", objectId: object.id, timer: OFFER_TICKS, bones } : null; friendWorks(game, "prayer");
}
function offerTick(game: Game, activity: Extract<Activity, { kind: "offer" }>) {
  const player = game.player, object = game.world.objects[activity.objectId], slotIndex = player.inventory.findIndex(slot => slot?.id === activity.bones);
  if (!object || slotIndex < 0) { player.activity = null; return; }
  offerBones(game, slotIndex, object.text === "dawn");
  if (has(player, activity.bones)) activity.timer = OFFER_TICKS; else player.activity = null;
}
export function drop(game: Game, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex];
  if (!slot) return;
  player.inventory[slotIndex] = null;
  // Tradeable things you drop are shared: other players see them and can pick them up.
  dropItem(game, slot.id, slot.n, player.x, player.y, 200, item(slot.id).tradeable !== false); sound(game, "drop");
}
export function equip(game: Game, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex];
  if (!slot) return;
  const definition = item(slot.id), equip = definition.equip;
  if (!equip) return;
  for (const [skill, needed] of Object.entries(equip.requires ?? {}) as [Skill, number][]) {
    if (level(game, skill) < needed) { message(game, `You need a ${SKILL_NAMES[skill]} level of ${needed} to ${equip.slot === "weapon" ? "wield" : "wear"} this.`, "warn"); return; }
  }
  const previous = player.equipment[equip.slot];
  // Bows take both hands: wielding one takes off your shield, and a shield takes off a bow.
  const shieldOff = equip.slot === "weapon" && equip.twoHanded ? player.equipment.shield : undefined;
  const weaponOff = equip.slot === "shield" && player.equipment.weapon && item(player.equipment.weapon).equip?.twoHanded ? player.equipment.weapon : undefined;
  if ((shieldOff || weaponOff) && previous && freeSlots(player) === 0) { message(game, "You need a free inventory space to do that.", "warn"); return; }
  player.inventory[slotIndex] = previous ? { id: previous, n: 1 } : null;
  player.equipment[equip.slot] = slot.id; onWorn(game, slot.id); outfitRemark(game, slot.id);
  if (shieldOff) { delete player.equipment.shield; give(player, shieldOff); }
  if (weaponOff) { delete player.equipment.weapon; give(player, weaponOff); }
  if (equip.slot === "weapon" && player.autocast && !equip.staff) player.autocast = null;
  sound(game, "equip");
}
export function unequip(game: Game, slot: EquipSlot) {
  const player = game.player, id = player.equipment[slot];
  if (!id) return;
  if (freeSlots(player) === 0) { message(game, "You don't have enough free inventory space to do that.", "warn"); return; }
  give(player, id); delete player.equipment[slot];
  if (slot === "weapon") player.autocast = null;
  player.hp = Math.min(player.hp, maxHp(player));
  sound(game, "equip");
}
export function swapSlots(game: Game, a: number, b: number) {
  const inventory = game.player.inventory;
  if (a === b || a < 0 || b < 0 || a >= INVENTORY_SIZE || b >= INVENTORY_SIZE) return;
  [inventory[a], inventory[b]] = [inventory[b], inventory[a]];
}
/** Item on item. */
export function useItemOnItem(game: Game, a: number, b: number) {
  const player = game.player, first = player.inventory[a], second = player.inventory[b];
  if (!first || !second || a === b) return;
  const pair = (x: string, y: string) => (first.id === x && second.id === y) || (first.id === y && second.id === x);
  const other = (id: string) => (first.id === id ? second : first);
  if (first.id === "tinderbox" || second.id === "tinderbox") {
    const logs = first.id === "tinderbox" ? b : a;
    if (FIREMAKING[player.inventory[logs]!.id]) { lightFire(game, logs); return; }
  }
  // Craftwork: a carving gouge on logs carves a figure from two of them.
  if (first.id === "carving_gouge" || second.id === "carving_gouge") {
    const recipes = carvingRecipes(other("carving_gouge").id);
    if (recipes.length) { game.ui.production = { title: "What would you like to carve?", recipes }; return; }
    message(game, "The gouge is for carving logs."); return;
  }
  if (first.id === "needle" || second.id === "needle") {
    if (other("needle").id === "leather" || other("needle").id === "drakehide") { openCrafting(game); return; }
  }
  // Fletching: a knife on logs, feathers on shafts, heads on headless arrows.
  if (first.id === "knife" || second.id === "knife") {
    const log = other("knife").id, bow = FLETCH_BOWS.find(entry => entry.log === log) ?? FLETCH_WANDS.find(entry => entry.log === log);
    if (bow) { game.ui.production = { title: "What would you like to fletch?", recipes: fletchingRecipes(log) }; return; }
  }
  if (pair("inkcoal", SATCHEL)) { satchelFill(game); return; }
  if ((first.id === SIGIL_BAG || second.id === SIGIL_BAG) && isSigil(other(SIGIL_BAG).id)) { sigilBagFill(game, other(SIGIL_BAG).id); return; }
  for (const belt of BELTS) if ((first.id === belt.id || second.id === belt.id) && belt.group(other(belt.id).id)) { beltFill(game, belt.id, other(belt.id).id); return; }
  if (first.id === "mortar" || second.id === "mortar") {
    const clean = other("mortar").id;
    if (clean.startsWith("clean_") && grindRecipes(clean.slice(6)).length) { game.ui.production = { title: "Grind the herb?", recipes: grindRecipes(clean.slice(6)) }; return; }
  }
  if (first.id === "vial_of_water" || second.id === "vial_of_water") {
    const recipes = brewRecipes(other("vial_of_water").id);
    if (recipes.length) { game.ui.production = { title: "What would you like to brew?", recipes }; return; }
  }
  if (pair("sigil_stone", STONE_BOX)) { boxFill(game); return; }
  if ((first.id === BONE_BAG || second.id === BONE_BAG) && item(other(BONE_BAG).id).bones) { bagFill(game, other(BONE_BAG).id); return; }
  // String on an unstrung bow finishes it; on a cut gem it makes an amulet.
  if (first.id === "string" || second.id === "string") {
    const other2 = other("string").id;
    if (other2.endsWith("_u")) { const recipe = stringingRecipe(other2); if (recipe) { startProduction(game, recipe, 28); return; } }
    const amulet = AMULETS.find(entry => entry.gem === other2);
    if (amulet) { startProduction(game, amuletRecipe(amulet.gem), 28); return; }
  }
  if (pair("feather", "arrow_shaft")) { startProduction(game, headlessRecipe(), 100); return; }
  // Crossbows: feathers on unfeathered bolts, and metal limbs on a stock.
  const blanks = [first.id, second.id].find(id => id.endsWith("_bolts_unf"));
  if (blanks && (first.id === "feather" || second.id === "feather")) { startProduction(game, boltRecipe(blanks.replace("_bolts_unf", "") as MetalId), 100); return; }
  const limbs = [first.id, second.id].find(id => id.endsWith("_limbs")), stock = [first.id, second.id].find(id => id.endsWith("_stock"));
  if (limbs && stock) {
    const metal = limbs.replace("_limbs", ""), bow = CROSSBOWS.find(entry => entry.metal === metal);
    if (!bow || bow.stock !== stock) {
      message(game, bow ? `${item(limbs).name} need ${/^[aeiou]/i.test(item(bow.stock).name) ? "an" : "a"} ${item(bow.stock).name.toLowerCase()}.` : "Those don't fit together.", "warn"); return;
    }
    startProduction(game, crossbowRecipe(bow.metal), 28); return;
  }
  const heads = [first.id, second.id].find(id => id.endsWith("_arrowheads"));
  if (heads && (first.id === "headless_arrow" || second.id === "headless_arrow")) { startProduction(game, arrowRecipe(heads.replace("_arrowheads", "") as MetalId), 100); return; }
  if (first.id === "chisel" || second.id === "chisel") {
    const gem = other("chisel").id;
    if (GEM_CUTTING[gem]) { const cut = GEM_CUTTING[gem]; startProduction(game, { skill: "crafting", label: item(cut.cut).name, level: cut.level, xp: cut.xp, ticks: 2, inputs: { [gem]: 1 }, outputs: { [cut.cut]: 1 }, tools: ["chisel"] }, 28); return; }
  }
  if (pair("grain", "pot")) { message(game, "You need to grind the grain at the mill first."); return; }
  // Dyemoor's dyes: a pot of dye on cloth or leather clothing dyes it; lye washes it back.
  const pot = [first.id, second.id].find(id => id.startsWith("dye_"));
  if (pot) {
    const cloth = other(pot).id, recipe = dyeRecipe(pot, cloth);
    if (typeof recipe === "string") { message(game, recipe, "warn"); return; }
    startProduction(game, recipe, 1); return;
  }
  message(game, "Nothing interesting happens.");
}
/** Dyeing (Craftwork): a pot of dye and a piece of clothing make the piece in the dye's colour (lye: its own again), or why not. */
export function dyeRecipe(pot: string, cloth: string): Recipe | string {
  if (!dyeable(cloth)) return "Only cloth and leather clothing takes a dye: hoods and hats, coats, tunics and dresses, trousers and skirts, gloves, boots and capes.";
  const base = baseOf(cloth), current = dyeOf(cloth);
  if (pot === "dye_lye") {
    if (!current) return "That's the colour it was made in already.";
    return { skill: "crafting", label: `Wash the dye out of the ${item(base).name.toLowerCase()}`, level: 1, xp: 6, ticks: 2, inputs: { [pot]: 1, [cloth]: 1 }, outputs: { [base]: 1 } };
  }
  const dye = DYES.find(entry => `dye_${entry.id}` === pot);
  if (!dye) return "That isn't a dye.";
  if (current?.id === dye.id) return `It's ${dye.name.toLowerCase()} already.`;
  return { skill: "crafting", label: `Dye the ${item(base).name.toLowerCase()} ${dye.name.toLowerCase()}`, level: 1, xp: 14, ticks: 2, inputs: { [pot]: 1, [cloth]: 1 }, outputs: { [`${base}~${dye.id}`]: 1 } };
}

// ---------- Craftwork: carvings ----------
/** What a log can be carved into with a gouge (two logs a figure). */
export function carvingRecipes(log: string): Recipe[] {
  return CARVINGS.filter(carving => carving.log === log).map(carving => ({ skill: "crafting" as const, label: carving.name, level: carving.level, xp: carving.xp, ticks: 4, inputs: { [log]: 2 }, outputs: { [carving.id]: 1 }, tools: ["carving_gouge"] }));
}
/** Set a carving down where you stand: it helps everyone near it until it crumbles. You keep three at most. */
export function setCarving(game: Game, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex], def = CARVINGS.find(carving => carving.id === slot?.id);
  if (!slot || !def) return;
  if (game.carvings.some(carving => carving.x === player.x && carving.y === player.y)) { message(game, "There's a carving standing here already.", "warn"); return; }
  if (isWater(terrainAt(game.world, player.x, player.y))) { message(game, "It would only float away.", "warn"); return; }
  take(player, def.id, 1);
  if (game.carvings.length >= CARVINGS_AT_ONCE) crumble(game, game.carvings[0]);
  game.carvings.push({ uid: game.nextUid++, id: def.id, x: player.x, y: player.y, placed: game.tick, until: game.tick + def.ticks });
  message(game, `You set the ${def.name.toLowerCase()} down. Near it, ${def.text}.`); sound(game, "pickup");
}
function crumble(game: Game, carving: Game["carvings"][number]) {
  game.carvings = game.carvings.filter(entry => entry !== carving);
  const def = CARVINGS.find(entry => entry.id === carving.id);
  if (def && Math.hypot(game.player.x - carving.x, game.player.y - carving.y) < 30) message(game, `Your ${def.name.toLowerCase()} crumbles away.`);
}
const NO_CARVINGS: Required<CarvingEffect> = { regen: 1, energy: 1, taken: 0, dealt: 0, magic: 0, accuracy: 0, faith: 0, foes: 0 };
let carvedTick = -1, carvedGame: Game | null = null, carvedAt = "", carved: Required<CarvingEffect> = NO_CARVINGS;
/**
 * The help you're getting from carvings near you (within CARVING_REACH): each kind counts once, and the kinds add up
 * (healing and run energy the fastest of them; damage taken, Faith's drain and creatures' aim each to at most 45% off).
 */
export function carvingEffect(game: Game): Required<CarvingEffect> {
  const player = game.player, key = `${player.x},${player.y},${game.carvings.length}`;
  if (carvedGame === game && carvedTick === game.tick && carvedAt === key) return carved;
  carvedGame = game; carvedTick = game.tick; carvedAt = key;
  if (!game.carvings.length) return carved = NO_CARVINGS;
  const near = new Map<string, CarvingEffect>();
  for (const carving of game.carvings) if (Math.hypot(player.x - carving.x, player.y - carving.y) <= CARVING_REACH) near.set(carving.id, CARVINGS.find(entry => entry.id === carving.id)?.effect ?? {});
  if (!near.size) return carved = NO_CARVINGS;
  const total = { ...NO_CARVINGS };
  for (const effect of near.values()) {
    total.regen = Math.max(total.regen, effect.regen ?? 1); total.energy = Math.max(total.energy, effect.energy ?? 1);
    total.taken += effect.taken ?? 0; total.dealt += effect.dealt ?? 0; total.magic += effect.magic ?? 0; total.accuracy += effect.accuracy ?? 0;
    total.faith += effect.faith ?? 0; total.foes += effect.foes ?? 0;
  }
  total.taken = Math.min(0.45, total.taken); total.faith = Math.min(0.6, total.faith); total.foes = Math.min(0.45, total.foes);
  total.dealt = Math.min(0.3, total.dealt); total.magic = Math.min(0.3, total.magic); total.accuracy = Math.min(0.3, total.accuracy);
  return carved = total;
}

// ---------- Firemaking ----------
const NO_FIRE = new Set<number>([T.WOOD, T.STONE, T.CARPET, T.BRIDGE, T.WALL, T.COBBLE, T.BRICK]);
export function lightFire(game: Game, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex];
  if (!slot || !FIREMAKING[slot.id]) return;
  if (!hasTool(player, "tinderbox")) { message(game, "You need a tinderbox to light a fire.", "warn"); return; }
  const needed = FIREMAKING[slot.id].level;
  if (level(game, "firemaking") < needed) { message(game, `You need a Firemaking level of ${needed} to burn ${item(slot.id).name.toLowerCase()}.`, "warn"); return; }
  if (NO_FIRE.has(terrainAt(game.world, player.x, player.y)) || objectAtTile(game.world, player.x, player.y) || fireAt(game, player.x, player.y)) { message(game, "You can't light a fire here.", "warn"); return; }
  stopAll(game);
  player.activity = { kind: "firemake", slot: slotIndex, timer: 2 }; friendWorks(game, "firemaking");
  message(game, "You attempt to light the logs.");
}

// ---------- Production ----------
export function recipeProblem(game: Game, recipe: Recipe): string | null {
  const player = game.player;
  if (level(game, recipe.skill) < recipe.level) return `You need a ${SKILL_NAMES[recipe.skill]} level of ${recipe.level} to make that.`;
  for (const tool of recipe.tools ?? []) if (!hasTool(player, tool)) return `You need a ${item(tool).name.toLowerCase()} to do that.`;
  for (const [id, n] of Object.entries(recipe.inputs)) if (stock(player, id) < n) return `You don't have enough ${item(id).name.toLowerCase()} to make that.`;
  if (recipe.coins && count(player, "coins") < recipe.coins) return "You don't have enough coins.";
  return null;
}
export function startProduction(game: Game, recipe: Recipe, n: number) {
  const problem = recipeProblem(game, recipe);
  game.ui.production = null;
  if (problem) { message(game, problem, "warn"); return; }
  game.player.activity = { kind: "produce", recipe, timer: 1, left: n }; friendWorks(game, recipe.skill);
}
export function smeltingRecipes(): Recipe[] {
  return METALS.map(metal => {
    const smelt = SMELTING[metal.id];
    return { skill: "smithing", label: `${metal.name} bar`, level: smelt.level, xp: smelt.xp, ticks: 4, station: "furnace", inputs: smelt.ores, outputs: { [`${metal.id}_bar`]: 1 }, chance: smelt.chance } satisfies Recipe;
  });
}
export function smithingRecipes(metal: MetalId): Recipe[] {
  const name = METALS.find(entry => entry.id === metal)!.name;
  return [...SMITH_PIECES.map(piece => ({
    skill: "smithing" as const, label: `${name} ${piece.name}`, level: smithLevel(metal, piece.piece), xp: SMITH_XP[metal] * piece.bars,
    ticks: 5, station: "anvil" as const, inputs: { [`${metal}_bar`]: piece.bars }, outputs: { [`${metal}_${piece.piece}`]: 1 }, tools: ["hammer"],
  })),
  // Arrowheads for Fletching: fifteen from a bar.
  { skill: "smithing" as const, label: `15 ${name.toLowerCase()} arrowheads`, level: metalLevel(metal, 5), xp: SMITH_XP[metal], ticks: 4, station: "anvil" as const,
    inputs: { [`${metal}_bar`]: 1 }, outputs: { [`${metal}_arrowheads`]: 15 }, tools: ["hammer"] },
  // Crossbow parts: twelve unfeathered bolts from a bar, and limbs from two.
  { skill: "smithing" as const, label: `12 unfeathered ${name.toLowerCase()} bolts`, level: metalLevel(metal, 3), xp: SMITH_XP[metal], ticks: 4, station: "anvil" as const,
    inputs: { [`${metal}_bar`]: 1 }, outputs: { [`${metal}_bolts_unf`]: 12 }, tools: ["hammer"] },
  { skill: "smithing" as const, label: `${name} limbs`, level: metalLevel(metal, LIMBS_OFFSET), xp: SMITH_XP[metal] * 2, ticks: 5, station: "anvil" as const,
    inputs: { [`${metal}_bar`]: 2 }, outputs: { [`${metal}_limbs`]: 1 }, tools: ["hammer"] },
  // Forged metals also make a staff.
  ...(FORGED_STAFF_MAGIC[metal] ? [{ skill: "smithing" as const, label: `${name} staff`, level: metalLevel(metal, 10), xp: SMITH_XP[metal] * 2, ticks: 5, station: "anvil" as const,
    inputs: { [`${metal}_bar`]: 2 }, outputs: { [`${metal}_staff`]: 1 }, tools: ["hammer"] }] : [])];
}
// ---------- Sigilcraft ----------
/** Press every sigil stone you carry into this altar's sigil. */
export function craftSigils(game: Game, object: WorldObject) {
  const player = game.player, entry = SIGILCRAFT.find(row => row.sigil === object.sigil);
  if (!entry) return 0;
  if (level(game, "sigilcraft") < entry.level) { message(game, `You need a Sigilcraft level of ${entry.level} to press ${item(entry.sigil).name.toLowerCase()}s.`, "warn"); return 0; }
  const stones = stock(player, "sigil_stone");
  if (!stones) { message(game, "You need sigil stones. Mine them in the Wizards' Tower.", "warn"); return 0; }
  const each = sigilsPerStone(level(game, "sigilcraft"), entry.level), made = stones * each;
  useUp(player, "sigil_stone", stones); give(player, entry.sigil, made);
  addXp(game, "sigilcraft", entry.xp * stones); sound(game, "spell");
  emit(game, { type: "cast", spell: "sigilcraft", tick: game.tick });
  message(game, `You press ${made} ${item(entry.sigil).name.toLowerCase()}s${each > 1 ? ` (${each} per stone)` : ""}.`);
  rollPet(game, "mote", level(game, "sigilcraft"));
  return made;
}
/** Fletching: arrow shafts (15 a log) or a bow from one kind of log. */
export function fletchingRecipes(log: string): Recipe[] {
  const bow = FLETCH_BOWS.find(entry => entry.log === log), wand = FLETCH_WANDS.find(entry => entry.log === log);
  if (!bow) return [
    { skill: "fletching", label: "15 arrow shafts", level: 1, xp: 8, ticks: 3, inputs: { [log]: 1 }, outputs: { arrow_shaft: 15 }, tools: ["knife"] },
    ...(wand ? [{ skill: "fletching" as const, label: item(wand.wand).name, level: wand.level, xp: wand.xp, ticks: 4, inputs: { [log]: 1 }, outputs: { [wand.wand]: 1 }, tools: ["knife"] }] : []),
  ];
  return [
    { skill: "fletching", label: "15 arrow shafts", level: 1, xp: 8, ticks: 3, inputs: { [log]: 1 }, outputs: { arrow_shaft: 15 }, tools: ["knife"] },
    { skill: "fletching", label: item(`${bow.bow}_u`).name, level: bow.level, xp: bow.xp / 2, ticks: 3, inputs: { [log]: 1 }, outputs: { [`${bow.bow}_u`]: 1 }, tools: ["knife"] },
    ...WAR_BOWS.filter(war => war.log === log).map(war => ({ skill: "fletching" as const, label: `${war.name} (unstrung, 2 logs)`, level: war.fletch, xp: war.xp / 2, ticks: 4, inputs: { [log]: 2 }, outputs: { [`${war.id}_u`]: 1 }, tools: ["knife"] })),
    ...STOCKS.filter(stock => stock.log === log).map(stock => ({ skill: "fletching" as const, label: stock.name, level: stock.level, xp: stock.xp, ticks: 3, inputs: { [log]: 1 }, outputs: { [stock.id]: 1 }, tools: ["knife"] })),
  ];
}
/** Fletching: a string on an unstrung bow (or war bow) finishes it, for the other half of its XP. */
export function stringingRecipe(unstrung: string): Recipe | null {
  const id = unstrung.replace(/_u$/, ""), bow = FLETCH_BOWS.find(entry => entry.bow === id), war = WAR_BOWS.find(entry => entry.id === id);
  if (!bow && !war) return null;
  return { skill: "fletching", label: `String the ${item(id).name.toLowerCase()}`, level: bow ? bow.level : war!.fletch, xp: (bow ? bow.xp : war!.xp) / 2, ticks: 2, inputs: { [unstrung]: 1, string: 1 }, outputs: { [id]: 1 } };
}
/** Crafting at a spinning wheel: wool into string. */
export const spinningRecipes = (): Recipe[] => [{ skill: "crafting", label: "String", level: 1, xp: 5, ticks: 3, station: "wheel", inputs: { wool: 1 }, outputs: { string: 1 } }];
/** Crafting: a cut gem on a string makes an amulet (the Enchant spells turn moonstone and rosestone ones into pendants). */
export const AMULETS = [{ gem: "moonstone", amulet: "moonstone_amulet", level: 16, xp: 30 }, { gem: "sagestone", amulet: "sagestone_amulet", level: 23, xp: 45 }, { gem: "rosestone", amulet: "rosestone_amulet", level: 31, xp: 60 }] as const;
export function amuletRecipe(gem: string): Recipe {
  const entry = AMULETS.find(row => row.gem === gem)!;
  return { skill: "crafting", label: item(entry.amulet).name, level: entry.level, xp: entry.xp, ticks: 2, inputs: { [gem]: 1, string: 1 }, outputs: { [entry.amulet]: 1 } };
}
/** Shearing a sheep: wool for your pack, and the sheep looks shorn until its fleece grows back. */
export function shear(game: Game, monster: Monster) {
  const player = game.player, def = monster.def.shear;
  if (!def) return;
  if (!hasTool(player, "shears")) { message(game, "You need some shears to shear this sheep. Any general store sells them.", "warn"); return; }
  if ((monster.shorn ?? 0) > game.tick) { message(game, "This sheep has already been shorn. Its wool will grow back."); return; }
  if (!freeSlots(player)) { message(game, "You haven't got room for the wool.", "warn"); return; }
  monster.shorn = game.tick + def.regrow; give(player, def.item);
  message(game, "You shear the sheep. Baa!"); sound(game, "pickup");
  creature(game, monster, "hurt");
}
/** Fletching: feathers on a dozen unfeathered bolts. */
export function boltRecipe(metal: MetalId): Recipe {
  const tier = FLETCH_ARROWS[metal], name = METALS.find(entry => entry.id === metal)!.name;
  return { skill: "fletching", label: `12 ${name.toLowerCase()} bolts`, level: Math.min(99, tier.level + 4), xp: tier.xp * 12, ticks: 2, inputs: { [`${metal}_bolts_unf`]: 12, feather: 12 }, outputs: { [`${metal}_bolts`]: 12 } };
}
/** Crafting: metal limbs fixed to their stock make a crossbow. */
export function crossbowRecipe(metal: MetalId): Recipe {
  const bow = CROSSBOWS.find(entry => entry.metal === metal)!;
  return { skill: "crafting", label: item(`${metal}_crossbow`).name, level: bow.craft, xp: bow.xp, ticks: 3, inputs: { [`${metal}_limbs`]: 1, [bow.stock]: 1 }, outputs: { [`${metal}_crossbow`]: 1 } };
}
export const headlessRecipe = (): Recipe => ({ skill: "fletching", label: "15 headless arrows", level: 1, xp: 15, ticks: 2, inputs: { arrow_shaft: 15, feather: 15 }, outputs: { headless_arrow: 15 } });
export function arrowRecipe(metal: MetalId): Recipe {
  const tier = FLETCH_ARROWS[metal], name = METALS.find(entry => entry.id === metal)!.name;
  return { skill: "fletching", label: `15 ${name.toLowerCase()} arrows`, level: tier.level, xp: tier.xp * 15, ticks: 2, inputs: { headless_arrow: 15, [`${metal}_arrowheads`]: 15 }, outputs: { [`${metal}_arrow`]: 15 } };
}
export function craftingRecipes(): Recipe[] {
  return CRAFTING.map(entry => ({ skill: "crafting" as const, label: item(entry.product).name, level: entry.level, xp: entry.xp, ticks: 3, inputs: { [entry.hide ?? "leather"]: entry.leather, thread: 1 }, outputs: { [entry.product]: 1 }, tools: ["needle"] }));
}
function openCrafting(game: Game) { game.ui.production = { title: "What would you like to make?", recipes: craftingRecipes() }; }
function openSmithing(game: Game) {
  const player = game.player, metals = METALS.filter(metal => has(player, `${metal.id}_bar`));
  if (!hasTool(player, "hammer")) { message(game, "You need a hammer to work the metal with.", "warn"); return; }
  if (!metals.length) { message(game, "You should select an item from your inventory and use it on the anvil. You don't have any bars.", "warn"); return; }
  const metal = [...metals].sort((a, b) => b.tier - a.tier).find(entry => level(game, "smithing") >= SMELTING[entry.id].level) ?? metals[0];
  game.ui.production = { title: `What would you like to make with ${metal.name.toLowerCase()}?`, recipes: smithingRecipes(metal.id) };
}

// ---------- Interactions on arrival ----------
function interact(game: Game) {
  const player = game.player, target = player.target!;
  const point = targetPoint(game, target);
  if (!point) { player.target = null; return; }
  face(game, point.x, point.y);
  player.target = null;
  if (target.kind === "monster") {
    const monster = monsterByUid(game, target.uid);
    if (!monster) return;
    if (target.option === "Shear") { shear(game, monster); return; }
    player.combat = monster.uid; player.lastHitBy = null;
    if (target.spell) player.autocast = isStaffEquipped(player) ? player.autocast : null;
    player.queuedSpell = target.spell ?? null;
    return;
  }
  if (target.kind === "track") { inspectTrack(game, target.uid); return; }
  if (target.kind === "ground") {
    const index = game.ground.findIndex(entry => entry.uid === target.uid);
    if (index < 0) return;
    const ground = game.ground[index];
    if (target.spell) { telegrab(game, target.spell, index); return; }
    // With the sigil satchel on your back or in your pack, sigils you pick up go straight into it while it has room.
    if (isSigil(ground.id) && hasSigilBag(player) && (player.sigilBag[ground.id] ?? 0) + ground.n <= SIGIL_BAG_SIZE) {
      sigilBagAdd(player, ground.id, ground.n); game.ground.splice(index, 1); sound(game, "pickup");
      message(game, `You put the ${item(ground.id).name.toLowerCase()} in your sigil satchel (${(player.sigilBag[ground.id] ?? 0).toLocaleString()}).`);
      return;
    }
    // With the ossuary bag in your pack, bones you pick up go straight into it while it has room.
    if (item(ground.id).bones && hasBoneBag(player) && bagBones(player) + ground.n <= BONE_BAG_SIZE) {
      bagAdd(player, ground.id, ground.n); game.ground.splice(index, 1); sound(game, "pickup");
      message(game, `You put the ${item(ground.id).name.toLowerCase()} in your ossuary bag (${bagBones(player)}/${BONE_BAG_SIZE}).`);
      return;
    }
    if (!canHold(player, ground.id, ground.n)) { message(game, "You don't have enough inventory space to hold that item.", "warn"); return; }
    give(player, ground.id, ground.n); game.ground.splice(index, 1); sound(game, "pickup");
    if (item(ground.id).bones) friendSays(game, "bones");
    return;
  }
  if (target.kind === "fire") {
    const raw = target.use !== undefined ? player.inventory[target.use]?.id : firstRaw(game);
    startCooking(game, "fire", target.uid, raw);
    return;
  }
  if (target.kind === "npc") { interactNpc(game, target.uid, target.option, target.use); return; }
  interactObject(game, point.object!, target.option, target.use);
}
const firstRaw = (game: Game) => game.player.inventory.find(slot => slot && COOKING[slot.id])?.id;
function startCooking(game: Game, source: "range" | "fire", sourceId: number, raw: string | undefined) {
  if (!raw || !COOKING[raw]) { message(game, raw ? "You can't cook that." : "You don't have anything to cook.", "warn"); return; }
  const recipe = COOKING[raw];
  if (level(game, "cooking") < recipe.level) { message(game, `You need a Cooking level of ${recipe.level} to cook this.`, "warn"); return; }
  game.player.activity = { kind: "cook", source, sourceId, raw, timer: 1, left: count(game.player, raw) }; friendWorks(game, "cooking");
}

export const STALLS = {
  bakery: { level: 5, xp: 16, respawn: 4, loot: [["bread", 0.7], ["cake", 0.3]] },
  silk: { level: 20, xp: 24, respawn: 8, loot: [["silk", 1]] },
  fish: { level: 42, xp: 42, respawn: 12, loot: [["raw_inkcrab", 0.6], ["raw_sailfish", 0.4]] },
  gem: { level: 75, xp: 160, respawn: 30, loot: [["rough_moonstone", 0.65], ["rough_sagestone", 0.25], ["rough_rosestone", 0.1]] },
} as const;

function interactObject(game: Game, object: WorldObject, option: string, use?: number) {
  const player = game.player;
  if (use !== undefined) { useItemOnObject(game, object, use); return; }
  switch (object.kind) {
    case "sigil_altar": craftSigils(game, object); return;
    case "herb": {
      const herb = herbDef(object.herb!)!;
      if (game.depleted.has(object.id)) { message(game, "This patch has been picked clean. It will grow back."); return; }
      if (level(game, "apothecary") < herb.level) { message(game, `You need an Apothecary level of ${herb.level} to pick ${herb.name.toLowerCase()}.`, "warn"); return; }
      if (!freeSlots(player)) { message(game, "Your inventory is too full to hold any more herbs.", "warn"); return; }
      player.activity = { kind: "gather", objectId: object.id, timer: 2 }; message(game, `You search the ${herb.name.toLowerCase()} patch…`); friendWorks(game, "apothecary"); return;
    }
    case "still": game.ui.production = { title: "What would you like to distil?", recipes: stillRecipes() }; return;
    case "tree": {
      const tree = TREES[object.tree!], axe = bestTool(game, "axe");
      if (level(game, "woodcutting") < tree.level) { message(game, `You need a Woodcutting level of ${tree.level} to chop down this tree.`, "warn"); return; }
      if (!axe) { message(game, "You do not have an axe which you have the Woodcutting level to use.", "warn"); return; }
      if (!freeSlots(player)) { message(game, "Your inventory is too full to hold any more logs.", "warn"); return; }
      player.activity = { kind: "woodcut", objectId: object.id, timer: 3 }; message(game, "You swing your axe at the tree."); if (!friendWorks(game, "woodcutting")) friendSays(game, "chop"); return;
    }
    case "rock": {
      const rock = ROCKS[object.rock!];
      if (option === "Prospect") { message(game, `This rock contains ${rock.ore === "rough_moonstone" ? "gems" : item(rock.ore).name.toLowerCase().replace(" ore", "")}.`); return; }
      if (level(game, "mining") < rock.level) { message(game, `You need a Mining level of ${rock.level} to mine this rock.`, "warn"); return; }
      if (!bestTool(game, "pickaxe")) { message(game, "You need a pickaxe to mine this rock. You do not have a pickaxe which you have the Mining level to use.", "warn"); return; }
      if (!freeSlots(player)) { message(game, "Your inventory is too full to hold any more ore.", "warn"); return; }
      player.activity = { kind: "mine", objectId: object.id, timer: 3 }; message(game, "You swing your pickaxe at the rock."); if (!friendWorks(game, "mining")) friendSays(game, "mine"); return;
    }
    case "spot": {
      const kind: SpotKind = option === "Net" ? "net" : option === "Bait" ? "bait" : option === "Lure" ? "lure" : option === "Cage" ? "cage" : object.spot === "deep" ? "deep" : option === "Harpoon" ? "harpoon" : object.spot!;
      const spot = FISHING_SPOTS[kind], lowest = Math.min(...spot.catches.map(entry => entry.level));
      if (level(game, "fishing") < lowest) { message(game, `You need a Fishing level of at least ${lowest} to fish here.`, "warn"); return; }
      if (!hasTool(player, spot.tool)) { message(game, `You need a ${item(spot.tool).name.toLowerCase()} to fish here.`, "warn"); return; }
      if (spot.bait && !has(player, spot.bait)) { message(game, `You don't have any ${item(spot.bait).name.toLowerCase()}s.`, "warn"); return; }
      if (!freeSlots(player)) { message(game, "You can't carry any more fish.", "warn"); return; }
      player.activity = { kind: "fish", objectId: object.id, timer: 4, spot: kind }; message(game, spot.tool === "small_net" ? "You cast out your net…" : "You attempt to catch a fish."); sound(game, "splash"); friendWorks(game, "fishing"); return;
    }
    case "range": startCooking(game, "range", object.id, firstRaw(game)); return;
    case "furnace": game.ui.production = { title: "What would you like to smelt?", recipes: smeltingRecipes() }; return;
    case "wheel": game.ui.production = { title: "What would you like to spin?", recipes: spinningRecipes() }; return;
    case "anvil": openSmithing(game); return;
    case "bank": game.ui.bank = true; sound(game, "click"); friendSays(game, "bank"); return;
    case "altar":
      if (option === "Search" && object.text === "crypt") { useCryptAltar(game); return; }
      if (object.text === "crypt" && player.quests.hollow_whispers === 2) { useCryptAltar(game); return; }
      onAltarPrayed(game, object);
      // An ossuary bag worn on the back empties itself onto the altar as you pray.
      if (player.equipment.cape === BONE_BAG && bagBones(player) > 0) offerBag(game, object.text === "dawn");
      if (player.prayer >= maxPrayer(player)) { message(game, "Your faith is already full."); return; }
      player.prayer = maxPrayer(player); message(game, "You pray to the Old Friend. Your faith is restored."); sound(game, "pray"); return;
    case "ladder":
      // The Ring's arena gates: you step through to the tile across; barred from inside while a match is on.
      if (object.name === "Arena gate") {
        if (game.arena && inArena(player.x, player.y)) { message(game, "The gate is barred. The Ring holds you until the match is done, one way or the other.", "warn"); return; }
        travel(game, { x: object.x + Math.sign(object.x - player.x), y: object.y + Math.sign(object.y - player.y) }, "The iron gate swings, and shuts behind you."); return;
      }
      travel(game, object.to!, `You ${object.action?.toLowerCase().replace("-", " ") ?? "climb"} the ${object.name.toLowerCase()}.`); return;
    case "gate": {
      const questOk = !object.requires?.quest || (player.quests[object.requires.quest] ?? 0) >= 1;
      if (!questOk) { message(game, "The gate is sealed with shadow. Something must be done before it opens.", "warn"); return; }
      const through = player.x < object.x ? object.to! : { x: object.x - 1, y: object.y };
      // A locked door: the key for it turns once and breaks (the dungeon's creatures and coffers hold more).
      if (object.requires?.item) {
        if (!has(player, object.requires.item)) { message(game, `${object.name} is locked. It wants a ${item(object.requires.item).name.toLowerCase()}, and the creatures and coffers down here have them.`, "warn"); return; }
        take(player, object.requires.item, 1); sound(game, "click");
        travel(game, through, `The ${item(object.requires.item).name.toLowerCase()} turns, and breaks in the lock. The door swings open.`); return;
      }
      travel(game, through, "The shadow parts, and you pass through the gate."); return;
    }
    case "obstacle": {
      const obstacle = object.obstacle!;
      if (level(game, "agility") < obstacle.level) { message(game, `You need a Wayfaring level of ${obstacle.level} to attempt this.`, "warn"); return; }
      player.activity = { kind: "obstacle", objectId: object.id, timer: obstacle.ticks, from: { x: player.x, y: player.y }, to: object.to! }; friendWorks(game, "agility");
      message(game, `You ${object.action?.toLowerCase().replace("-", " ")} the ${object.name.toLowerCase()}…`); sound(game, "jump"); return;
    }
    case "stall": {
      const stall = STALLS[object.stall!];
      if (level(game, "thieving") < stall.level) { message(game, `You need a Stealth level of ${stall.level} to steal from this stall.`, "warn"); return; }
      if (!freeSlots(player)) { message(game, "Your inventory is too full.", "warn"); return; }
      player.activity = { kind: "thieve_stall", objectId: object.id, timer: 2 }; friendWorks(game, "thieving"); return;
    }
    case "mill":
      if (!has(player, "grain")) { message(game, "You need some grain to put in the hopper.", "warn"); return; }
      if (!has(player, "pot")) { message(game, "You need an empty pot to collect the flour.", "warn"); return; }
      take(player, "grain"); take(player, "pot"); give(player, "pot_of_flour"); message(game, "You operate the mill. Flour pours into your pot."); sound(game, "click"); return;
    case "dairy_cow":
      if (!has(player, "bucket")) { message(game, "You need a bucket to milk the cow.", "warn"); return; }
      take(player, "bucket"); give(player, "bucket_of_milk"); message(game, "You milk the cow."); sound(game, "splash"); return;
    case "wheat":
      if (!freeSlots(player)) { message(game, "Your inventory is full.", "warn"); return; }
      give(player, "grain"); game.depleted.set(object.id, game.tick + 30); message(game, "You pick some grain."); sound(game, "pickup"); return;
    case "coop":
      if (!freeSlots(player)) { message(game, "Your inventory is full.", "warn"); return; }
      give(player, "egg"); message(game, "You take an egg from the coop."); sound(game, "pickup"); return;
    case "casket": game.ui.shop = "__caskets"; sound(game, "click"); return;
    case "sign": message(game, object.text ?? "The sign is blank.", "info"); return;
    case "board": game.dialogue = readJobBoard(game, object.text ?? ""); return;
    case "tanning": tanHides(game); return;
    case "well": searchWell(game); return;
    case "decor":
      if (object.name.endsWith("(sleep)")) { sleep(game); return; }
      if (object.name.endsWith("(fill)") || object.name === "Water barrel") { fillVials(game); return; }
      if (object.name.endsWith("(furnish)")) { if (option === "Furnish") { game.ui.home = true; sound(game, "click"); } else message(game, "You warm your hands at the hearth. Home."); return; }
      if (object.decor === "chest") searchChest(game, object); return;
    default: message(game, examineObject(game, object));
  }
}
function useItemOnObject(game: Game, object: WorldObject, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex];
  if (!slot) return;
  if ((object.kind === "range") && COOKING[slot.id]) { startCooking(game, "range", object.id, slot.id); return; }
  if (object.kind === "furnace" && (slot.id.endsWith("_ore") || slot.id === "inkcoal")) { interactObject(game, object, "Smelt"); return; }
  if (object.kind === "anvil" && slot.id.endsWith("_bar")) {
    const metal = slot.id.replace("_bar", "") as MetalId;
    if (!hasTool(player, "hammer")) { message(game, "You need a hammer to work the metal with.", "warn"); return; }
    game.ui.production = { title: `What would you like to make with ${metal}?`, recipes: smithingRecipes(metal) }; return;
  }
  if (object.kind === "mill" && slot.id === "grain") { interactObject(game, object, "Operate"); return; }
  if (object.kind === "dairy_cow" && slot.id === "bucket") { interactObject(game, object, "Milk"); return; }
  if (object.kind === "altar" && object.text === "crypt" && slot.id === "crypt_key") { useCryptAltar(game); return; }
  if (object.kind === "altar" && object.text === "dawn" && slot.id === "dawnstone_shard") { consecrateDawnstone(game); return; }
  if (object.kind === "altar" && slot.id === BONE_BAG) { offerBag(game, object.text === "dawn"); return; }
  if (object.kind === "altar" && item(slot.id).bones) { startOffering(game, object, slotIndex); return; }
  if (object.kind === "bank") { bankDepositSlot(game, slotIndex); return; }
  if (object.kind === "sigil_altar" && slot.id === "sigil_stone") { craftSigils(game, object); return; }
  if (object.kind === "well" && slot.id === "bucket") { message(game, "You fill the bucket… then think better of drinking from it, and pour it back."); return; }
  message(game, "Nothing interesting happens.");
}
function bankDepositSlot(game: Game, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex];
  if (!slot) return;
  const id = slot.id, n = count(player, id);
  take(player, id, n);
  const entry = player.bank.find(bank => bank.id === id);
  if (entry) entry.n += n; else if (player.bank.length < BANK_SIZE) player.bank.push({ id, n }); else { give(player, id, n); message(game, "Your bank is full.", "warn"); return; }
  message(game, `You deposit your ${item(id).name.toLowerCase()}.`); sound(game, "coins");
}
function interactNpc(game: Game, uid: number, option: string, use?: number) {
  const npc = npcByUid(game, uid), player = game.player;
  if (!npc) return;
  const def = npcDef(npc.id);
  npc.busy = 6; npc.heading = headingTo(player.x - npc.x, player.y - npc.y, npc.heading);
  if (use !== undefined) {
    const slot = player.inventory[use];
    if (slot?.id === "cowhide" && npc.id === "tanner") { tanHides(game); return; }
    message(game, "Nothing interesting happens."); return;
  }
  if (option === "Talk-to") { game.dialogue = talk(game, npc.id); sound(game, "click"); return; }
  if (option === "Trade" && def.shop) { const problem = shopProblem(game, def.shop); if (problem) { message(game, problem, "warn"); return; } game.ui.shop = def.shop; sound(game, "click"); friendSays(game, "shop"); return; }
  if (option === "Talk-to" || option === "Assignment") onNpcTalked(game, npc.id);
  if (option === "Bank") { game.ui.bank = true; sound(game, "click"); return; }
  if (option === "Caskets") { game.ui.shop = "__caskets"; sound(game, "click"); return; }
  if (option === "Rare-market") { game.ui.shop = "__market"; sound(game, "click"); return; }
  if (option === "Stables") { game.ui.shop = "__stable"; sound(game, "click"); return; }
  if (option === "Stroke") { player.stats.strokes = (player.stats.strokes ?? 0) + 1; message(game, npc.id === "paddock_unicorn" ? "The unicorn lowers its horn and lets you stroke its mane. It's very soft." : "The horse nuzzles your pockets for an apple."); sound(game, "click"); return; }
  if (option === "Assignment" || option === "Rewards") { game.dialogue = talk(game, `${npc.id}:${option.toLowerCase()}`); sound(game, "click"); return; }
  if (option === "Tan-hides") { tanHides(game); return; }
  if (option === "Pickpocket" && def.pickpocket) { pickpocket(game, npc, def.pickpocket); return; }
}
function pickpocket(game: Game, npc: Npc, pick: NonNullable<ReturnType<typeof npcDef>["pickpocket"]>) {
  const player = game.player, thieving = level(game, "thieving");
  if (thieving < pick.level) { message(game, `You need a Stealth level of ${pick.level} to pickpocket this.`, "warn"); return; }
  if (!freeSlots(player) && !has(player, "coins")) { message(game, "Your inventory is too full.", "warn"); return; }
  const mask = player.familyId === 1 ? 0.1 : 0, chance = Math.min(0.95, 0.55 + (thieving - pick.level) * 0.02 + mask + 0.02 * orderPieces(player.equipment, "hood") + (player.equipment.hands === "sleight_gloves" ? 0.06 : 0));
  message(game, `You attempt to pick the ${npcDef(npc.id).name.toLowerCase()}'s pocket.`);
  if (game.rng() < chance) {
    const silver = Math.min(RELICS[1].max, player.relics[1] ?? 0) * RELICS[1].coinsPer + (riding(player)?.coins ?? 0);
    const coins = Math.round((pick.coins[0] + Math.floor(game.rng() * (pick.coins[1] - pick.coins[0] + 1))) * (1 + silver));
    give(player, "coins", coins); addXp(game, "thieving", pick.xp); sound(game, "coins");
    for (const [id, p] of pick.extra ?? []) if (game.rng() < p && freeSlots(player)) give(player, id);
    message(game, `You pick the ${npcDef(npc.id).name.toLowerCase()}'s pocket.`);
  } else {
    const stun = player.familyId === 1 ? Math.ceil(pick.stun / 2) : pick.stun;
    player.stunned = stun; player.path = []; damagePlayer(game, 1 + Math.floor(game.rng() * pick.damage), null);
    npcSay(game, npc, "What do you think you're doing?");
    message(game, "You fail to pick the pocket. You've been stunned!", "warn"); sound(game, "stun");
  }
}
export function npcOverhead(game: Game, uid: number) { const entry = game.overheads.get(uid); return entry && entry.until > game.tick ? entry.text : null; }
function npcSay(game: Game, npc: Npc, text: string) { game.overheads.set(npc.uid, { text, until: game.tick + 5 }); }
function travel(game: Game, to: { x: number; y: number }, text: string) {
  const player = game.player;
  stopAll(game);
  player.prev = { x: to.x, y: to.y }; player.x = to.x; player.y = to.y; player.moved = game.tick - 10;
  game.trail = [];
  for (const monster of game.monsters) monster.target = false;
  message(game, text); sound(game, "door");
}

// ---------- Tools ----------
function bestTool(game: Game, kind: "axe" | "pickaxe") {
  const player = game.player, skill = kind === "axe" ? "woodcutting" : "mining", owned = [...player.inventory.map(slot => slot?.id), player.equipment.weapon];
  let best: { tier: number; id: string } | null = null;
  for (const id of owned) {
    const tool = id ? item(id).tool : undefined;
    if (tool?.kind === kind && level(game, skill) >= tool.level && (!best || tool.tier > best.tier)) best = { tier: tool.tier, id: id! };
  }
  return best;
}
/** The old-school gathering roll: interpolate between `low` at level 1 and `high` at level 99, out of 256. */
export function successChance(skillLevel: number, low: number, high: number) {
  const clamped = Math.max(1, Math.min(99, skillLevel));
  return Math.min(1, (1 + Math.floor(low * (99 - clamped) / 98 + high * (clamped - 1) / 98 + 0.5)) / 256);
}

// ---------- Tick ----------
export function tick(game: Game) {
  updateFirstSteps(game);
  game.tick++; game.playTicks++;
  arenaTick(game);
  const player = game.player;
  if (player.stunned > 0) player.stunned--;
  if (player.eatTimer > 0) player.eatTimer--;
  if (player.castTimer > 0) player.castTimer--;
  if (player.attackTimer > 0) player.attackTimer--;
  if (player.overhead && player.overhead.until <= game.tick) player.overhead = null;
  movePlayer(game);
  rideUpkeep(game);
  if (player.boostTicks > 0) { player.boostTicks--; if (player.boostTicks === 0) message(game, "Your referral XP boost has run out. Refer another friend for more!"); }
  if (player.restedTicks > 0) { player.restedTicks--; if (player.restedTicks === 0) message(game, "You no longer feel well rested."); }
  if (player.ward && game.tick >= player.wardUntil) { player.ward = null; message(game, "Your ward fades."); }
  if (player.renew > 0 && game.tick < player.renewUntil && player.hp < maxHp(player)) player.hp = Math.min(maxHp(player), player.hp + player.renew);
  if (player.renew > 0 && game.tick >= player.renewUntil) player.renew = 0;
  // An emote ends when it's done, or when you walk off.
  if (player.emote && (game.tick >= player.emote.until || player.moved === game.tick || player.combat !== null || player.activity)) player.emote = null;
  updatePet(game);
  if (player.target && !player.path.length) {
    const point = targetPoint(game, player.target);
    if (!point) player.target = null;
    else if (inReach(game, player.target, player, point)) interact(game);
    else routeToTarget(game);
  }
  runActivity(game);
  playerCombat(game);
  skirmishScan(game);
  trackTick(game);
  for (const monster of game.monsters) monsterTick(game, monster);
  for (const twin of game.monsters.filter(monster => monster.sheathe)) sheathe(game, twin);
  for (const npc of game.npcs) if (!npc.drawn) npcTick(game, npc);
  upkeep(game);
}
function movePlayer(game: Game) {
  const player = game.player;
  if (player.stunned > 0) return;
  // Held keys walk one screen direction at a time.
  if (game.held) {
    // Held keys give a world-space direction (the UI turns screen keys into it for the camera angle); snap to 8 ways.
    const octant = Math.round(Math.atan2(game.held.dy, game.held.dx) / (Math.PI / 4)), tx = Math.round(Math.cos(octant * Math.PI / 4)), ty = Math.round(Math.sin(octant * Math.PI / 4));
    const mount = riding(player), steps = mount ? mount.speed : player.run && !player.sneak && player.energy >= 1 ? 2 : 1, start = { x: player.x, y: player.y };
    let moved = 0;
    for (let i = 0; i < steps; i++) {
      const options: [number, number][] = [[tx, ty], [tx, 0], [0, ty]];
      const step = options.find(([sx, sy]) => (sx || sy) && canStep(game, player.x, player.y, sx, sy));
      if (!step) break;
      moveTo(game, player.x + step[0], player.y + step[1]); moved++;
    }
    if (moved) player.prev = start;
    if (moved >= 2 && !mount) drainRun(game);
    if (moved && player.sneak) drainSneak(game);
    return;
  }
  if (!player.path.length) return;
  const mount = riding(player), steps = mount ? mount.speed : player.run && !player.sneak && player.energy >= 1 && player.path.length > 1 ? 2 : 1, start = { x: player.x, y: player.y };
  for (let i = 0; i < steps && player.path.length; i++) {
    const next = player.path[0];
    if (!canStep(game, player.x, player.y, next.x - player.x, next.y - player.y)) {
      const destination = player.path[player.path.length - 1];
      const repath = findPath(game, player, (x, y) => x === destination.x && y === destination.y, destination);
      player.path = repath ?? [];
      break;
    }
    player.path.shift(); moveTo(game, next.x, next.y);
  }
  if (player.x !== start.x || player.y !== start.y) player.prev = start;
  if (!mount && Math.max(Math.abs(player.x - start.x), Math.abs(player.y - start.y)) >= 2) drainRun(game);
  if (player.sneak && (player.x !== start.x || player.y !== start.y)) drainSneak(game);
}
function drainRun(game: Game) {
  const player = game.player, drain = mixtureOn(game, 5) ? 0 : runDrain(game);
  player.energy = Math.max(0, player.energy - drain);
  if (player.energy <= 0) { player.run = false; message(game, "You're out of run energy.", "warn"); friendSays(game, "tired"); }
}
// ---------- Stealth: sneaking ----------
/** The rare hood of the Stealth update: stand still in it for five seconds and you all but vanish. */
export const VEIL_HOOD = "veilweave_hood";
/** Sneaking walks (never runs) and spends run energy faster than running; the better your Stealth, the softer it goes. */
function drainSneak(game: Game) {
  const player = game.player, cost = Math.max(0.35, 1.1 - level(game, "thieving") * 0.0077) * (player.familyId === 5 ? 0.6 : 1) * (fullSlayerSet(player, "stalker") ? 2 / 3 : 1) * (player.equipment.feet === "softsole_boots" ? 0.6 : 1);
  player.energy = Math.max(0, player.energy - cost);
  if (player.energy <= 0) { player.sneak = false; message(game, "You're too tired to keep sneaking.", "warn"); }
}
export function toggleSneak(game: Game) {
  const player = game.player;
  if (!player.sneak && player.mount) { message(game, "You can't sneak on horseback.", "warn"); return; }
  if (!player.sneak && player.energy < 5) { message(game, "You're too tired to sneak. Catch your breath first.", "warn"); return; }
  player.sneak = !player.sneak; sound(game, "click");
  message(game, player.sneak ? "You drop low and tread softly. Aggressive monsters may not notice you, but it's tiring." : "You stop sneaking.");
}
const veilCache = new WeakMap<Game, { tick: number; on: boolean }>();
/**
 * Wearing the Veilweave hood, still for five seconds (9 ticks) and out of any fight: you've faded almost to nothing, and
 * aggressive monsters can't see you at all.
 */
export function veiled(game: Game) {
  const cached = veilCache.get(game);
  if (cached && cached.tick === game.tick) return cached.on;
  const player = game.player;
  const on = player.equipment.head === VEIL_HOOD && game.tick - player.moved >= 9 && player.combat === null && !player.activity && !game.monsters.some(monster => monster.target && !monster.dead);
  veilCache.set(game, { tick: game.tick, on });
  return on;
}
/** Whether an aggressive monster in range notices you sneaking this tick: its level against your Stealth, how close you are, and whether you're moving. */
function spots(game: Game, monster: Monster) {
  const player = game.player, gap = chebyshev(monster, player);
  let chance = Math.max(0.01, Math.min(0.35, 0.06 + (monster.def.level - level(game, "thieving")) * 0.004));
  chance *= [2, 2, 1.4, 1, 0.7][gap] ?? 0.7;
  if (game.tick - player.moved > 1) chance *= 0.4;
  if (player.equipment.head === VEIL_HOOD) chance *= 0.5;
  if (player.familyId === 1) chance *= 0.8;
  chance *= stalkerFactor(player);
  if (player.stealthUntil > game.tick) chance *= 2 / 3;
  if (mixtureOn(game, 1)) chance *= 0.15;
  return game.rng() < chance;
}
/** The Stalker's set: 12% harder to notice a piece. */
export const stalkerFactor = (player: Player) => 1 - 0.12 * setPieces(player, "stalker");
/** Caught: the monster lunges at once (a hit you can't answer), and the fight is on. */
function caughtSneaking(game: Game, monster: Monster) {
  const player = game.player;
  game.sneakingPast.delete(monster.uid);
  player.sneak = false; monster.target = true; creature(game, monster, "aggro");
  let hit = Math.max(1, Math.round(monster.def.maxHit * (0.35 + game.rng() * 0.4)));
  if (prayerBoost(player).protect) hit = Math.floor(hit * (monster.def.boss ? 0.4 : 0));
  message(game, `The ${monster.def.name.toLowerCase()} spots you sneaking and lunges before you can react!`, "warn");
  monster.attackTimer = monster.def.speed;
  damagePlayer(game, hit, monster);
}
/** Out of an aggressive monster's reach without being seen: Stealth XP (once in a while per monster), and a slim chance at the hood. */
function slippedPast(game: Game, monster: Monster) {
  const player = game.player, since = game.sneakingPast.get(monster.uid)!;
  game.sneakingPast.delete(monster.uid);
  if (game.tick - since < 2 || game.tick - (game.sneakPaid.get(monster.uid) ?? -1e9) < 150) return;
  game.sneakPaid.set(monster.uid, game.tick);
  addXp(game, "thieving", Math.round(6 + monster.def.level * 0.9));
  player.stats.sneaks = (player.stats.sneaks ?? 0) + 1;
  message(game, `You slip past the ${monster.def.name.toLowerCase()} unseen.`);
  const ownsHood = [...player.inventory.map(slot => slot?.id), ...player.bank.map(slot => slot.id), player.equipment.head].includes(VEIL_HOOD);
  if (!ownsHood && level(game, "thieving") >= 60 && monster.def.level >= 38 && game.rng() < 1 / 150) {
    giveOrDrop(game, VEIL_HOOD); sound(game, "rare");
    message(game, "In the shadows where the monster couldn't see you, you find a hood woven from the dark itself: a Veilweave hood!", "info");
  }
}
export function toggleRun(game: Game) {
  const player = game.player;
  if (!player.run && player.energy < 1) { message(game, "You don't have enough energy left to run!", "warn"); return; }
  player.run = !player.run;
}

function runActivity(game: Game) {
  const player = game.player, activity = player.activity;
  if (!activity || player.path.length) return;
  if (--activity.timer > 0) return;
  switch (activity.kind) {
    case "woodcut": return woodcutTick(game, activity);
    case "mine": return mineTick(game, activity);
    case "fish": return fishTick(game, activity);
    case "cook": return cookTick(game, activity);
    case "produce": return produceTick(game, activity);
    case "firemake": return firemakeTick(game, activity);
    case "thieve_stall": return stallTick(game, activity);
    case "obstacle": return obstacleTick(game, activity);
    case "offer": return offerTick(game, activity);
    case "gather": return gatherTick(game, activity);
    case "teleport": {
      player.activity = null;
      const place = activity.spell.startsWith("tablet:") ? activity.spell.slice(7) : SPELLS.find(spell => spell.id === activity.spell)?.teleport ?? "hollow_square";
      travel(game, activity.to, `You teleport to ${TELEPORT_NAMES[place] ?? "Friendhollow"}.`); sound(game, "teleport");
    }
  }
}
function gatherBonus(game: Game) { return 1 + Math.min(RELICS[2].max, game.player.relics[2] ?? 0) * RELICS[2].gatherPer + (riding(game.player)?.gather ?? 0); }
/** Picking a herb patch: a chance each couple of ticks by level, a few picks before it's bare, and the Division brew's doubling. */
function gatherTick(game: Game, activity: Extract<Activity, { kind: "gather" }>) {
  const player = game.player, object = game.world.objects[activity.objectId], herb = herbDef(object.herb!)!;
  if (game.depleted.has(object.id)) { player.activity = null; return; }
  activity.timer = 2;
  const chance = Math.min(0.95, successChance(level(game, "apothecary"), 40 + herb.level * 2, 220 + herb.level * 2) * gatherBonus(game));
  if (game.rng() >= chance) return;
  give(player, herb.id); addXp(game, "apothecary", herb.xp); presenceXp(game, 0.5);
  if (mixtureOn(game, 3) && game.rng() < 0.25 && freeSlots(player)) { give(player, herb.id); message(game, "The Division brew splits the pick in two."); }
  message(game, `You pick some ${herb.name.toLowerCase()}.`); sound(game, "pickup");
  const picked = (game.herbPicks.get(object.id) ?? 0) + 1; game.herbPicks.set(object.id, picked);
  if (picked >= herb.picks) { game.herbPicks.delete(object.id); game.depleted.set(object.id, game.tick + herb.respawn + Math.floor(game.rng() * herb.respawn)); player.activity = null; return; }
  if (!freeSlots(player)) { message(game, "Your inventory is too full to hold any more herbs.", "warn"); player.activity = null; }
}
function woodcutTick(game: Game, activity: Extract<Activity, { kind: "woodcut" }>) {
  const player = game.player, object = game.world.objects[activity.objectId], tree = TREES[object.tree!], axe = bestTool(game, "axe");
  if (game.depleted.has(object.id) || !axe) { player.activity = null; return; }
  activity.timer = 4; // the chop sound plays on the swing animation
  const chance = Math.min(0.95, successChance(level(game, "woodcutting"), tree.low, tree.high) * (1 + 0.18 * (axe.tier - 1)) * gatherBonus(game));
  if (game.rng() >= chance) return;
  give(player, tree.log); addXp(game, "woodcutting", tree.xp);
  if (player.familyId === 4 && game.rng() < 0.08 && freeSlots(player)) { give(player, tree.log); message(game, "Lopsided luck! You get an extra log."); }
  message(game, `You get some ${item(tree.log).name.toLowerCase()}.`);
  rollPet(game, "stumpy", level(game, "woodcutting"));
  if (game.rng() < tree.deplete) { game.depleted.set(object.id, game.tick + tree.respawn + Math.floor(game.rng() * tree.respawn)); player.activity = null; sound(game, "fell"); return; }
  if (!freeSlots(player)) { message(game, "Your inventory is too full to hold any more logs.", "warn"); player.activity = null; }
}
function mineTick(game: Game, activity: Extract<Activity, { kind: "mine" }>) {
  const player = game.player, object = game.world.objects[activity.objectId], rock = ROCKS[object.rock!], pick = bestTool(game, "pickaxe");
  if (game.depleted.has(object.id) || !pick) { player.activity = null; return; }
  activity.timer = 4; // the pick sound plays on the swing animation
  const gemOdds = (player.familyId === 7 ? 3 : 1) / 256;
  if (game.rng() < gemOdds && freeSlots(player)) {
    const gem = ["rough_moonstone", "rough_moonstone", "rough_sagestone", "rough_rosestone"][Math.floor(game.rng() * 4)];
    give(player, gem); message(game, `You just found ${item(gem).name.toLowerCase().startsWith("uncut e") ? "an" : "a"} ${item(gem).name.replace("Uncut ", "").toLowerCase()}!`);
  }
  const chance = Math.min(0.95, successChance(level(game, "mining"), rock.low, rock.high) * (1 + 0.2 * (pick.tier - 1)) * gatherBonus(game));
  if (game.rng() >= chance) return;
  const ore = object.rock === "gem" ? ["rough_moonstone", "rough_moonstone", "rough_sagestone", "rough_rosestone"][Math.floor(game.rng() * 4)] : rock.ore;
  // Inkcoal goes into the satchel while there's room.
  // Inkcoal goes into the satchel, and sigil stones into their box, while there's room.
  const bagged = ore === "inkcoal" && hasSatchel(player) && player.coalBag < SATCHEL_SIZE, boxed = ore === "sigil_stone" && hasStoneBox(player) && player.stoneBox < STONE_BOX_SIZE;
  if (bagged) player.coalBag++; else if (boxed) player.stoneBox++; else give(player, ore);
  addXp(game, "mining", rock.xp);
  if (player.familyId === 4 && game.rng() < 0.08 && freeSlots(player)) { give(player, ore); message(game, "Lopsided luck! You mine a second piece."); }
  if (object.rock === "sigil") {
    if (boxed && player.stoneBox === STONE_BOX_SIZE) message(game, `Your sigil stone box is full (${STONE_BOX_SIZE}).`);
    if (!freeSlots(player) && !(hasStoneBox(player) && player.stoneBox < STONE_BOX_SIZE)) { message(game, "Your inventory is too full to hold any more sigil stones.", "warn"); player.activity = null; }
    return;
  }
  message(game, bagged ? `You put the inkcoal in your satchel (${player.coalBag}/${SATCHEL_SIZE}).` : `You manage to mine some ${item(ore).name.toLowerCase().replace(" ore", "")}.`);
  rollPet(game, "pebble", level(game, "mining"));
  game.depleted.set(object.id, game.tick + rock.respawn + Math.floor(game.rng() * rock.respawn * 0.5));
  player.activity = null;
}
function fishTick(game: Game, activity: Extract<Activity, { kind: "fish" }>) {
  const player = game.player, spot = FISHING_SPOTS[activity.spot];
  activity.timer = 5;
  if (!hasTool(player, spot.tool) || (spot.bait && !has(player, spot.bait))) { message(game, "You have run out of bait.", "warn"); player.activity = null; return; }
  if (!freeSlots(player)) { message(game, "You can't carry any more fish.", "warn"); player.activity = null; return; }
  sound(game, "splash");
  for (const entry of spot.catches) {
    if (level(game, "fishing") < entry.level) continue;
    if (game.rng() >= Math.min(0.95, successChance(level(game, "fishing"), entry.low, entry.high) * gatherBonus(game))) continue;
    if (spot.bait) take(player, spot.bait);
    give(player, entry.fish); addXp(game, "fishing", entry.xp); sound(game, "catch");
    if (player.familyId === 4 && game.rng() < 0.08 && freeSlots(player)) give(player, entry.fish);
    message(game, `You catch ${entry.fish === "raw_minnows" ? "some minnows" : `a ${item(entry.fish).name.replace("Raw ", "").toLowerCase()}`}.`);
    rollPet(game, "bubbles", level(game, "fishing"));
    return;
  }
}
function cookTick(game: Game, activity: Extract<Activity, { kind: "cook" }>) {
  const player = game.player, recipe = COOKING[activity.raw];
  if (activity.source === "fire" && !game.fires.some(fire => fire.uid === activity.sourceId)) { message(game, "The fire has gone out."); player.activity = null; return; }
  if (!has(player, activity.raw) || activity.left <= 0) { player.activity = null; return; }
  activity.timer = 4; activity.left--;
  take(player, activity.raw);
  const cooking = level(game, "cooking"), span = Math.max(1, recipe.stopBurn - recipe.level);
  // About one in five burns at the recipe's own level (a touch more on an open fire), easing off quickly and to none at its stop-burn level.
  const left = Math.max(0, 1 - (cooking - recipe.level) / span), burn = cooking >= recipe.stopBurn ? 0 : 0.2 * left ** 1.5 + (activity.source === "fire" ? 0.03 : 0);
  if (game.rng() < burn) { give(player, "burnt_food"); message(game, `You accidentally burn the ${item(recipe.cooked).name.toLowerCase()}.`); sound(game, "burn"); }
  else { give(player, recipe.cooked); addXp(game, "cooking", recipe.xp); message(game, `You successfully cook ${item(recipe.cooked).name.toLowerCase()}.`); sound(game, "sizzle"); }
  if (!has(player, activity.raw)) player.activity = null;
}
function produceTick(game: Game, activity: Extract<Activity, { kind: "produce" }>) {
  const player = game.player, recipe = activity.recipe;
  if (activity.left <= 0) { player.activity = null; return; }
  const problem = recipeProblem(game, recipe);
  if (problem) { if (activity.left > 0 && activity.timer <= 0) message(game, problem, "warn"); player.activity = null; return; }
  activity.timer = recipe.ticks; activity.left--;
  for (const [id, n] of Object.entries(recipe.inputs)) useUp(player, id, n);
  if (recipe.coins) take(player, "coins", recipe.coins);
  sound(game, recipe.station === "anvil" ? "anvil" : recipe.station === "furnace" ? "smelt" : "click");
  if (recipe.chance !== undefined && game.rng() >= recipe.chance + level(game, recipe.skill) * 0.004) { message(game, "The ore is too impure and you fail to refine it."); return; }
  for (const [id, n] of Object.entries(recipe.outputs)) give(player, id, n);
  if (recipe.skill === "apothecary" && Object.keys(recipe.outputs).some(id => item(id).potion)) { player.stats.brews = (player.stats.brews ?? 0) + 1; presenceXp(game, 1); }
  addXp(game, recipe.skill, recipe.xp);
  message(game, recipe.station === "furnace" ? `You retrieve a bar of ${recipe.label.replace(" bar", "").toLowerCase()}.` : `You make ${aOrAn(recipe.label)} ${recipe.label.toLowerCase()}.`);
}
const aOrAn = (word: string) => /^[aeiou]/i.test(word) ? "an" : "a";
function firemakeTick(game: Game, activity: Extract<Activity, { kind: "firemake" }>) {
  const player = game.player, slot = player.inventory[activity.slot];
  if (!slot || !FIREMAKING[slot.id]) { player.activity = null; return; }
  const fm = FIREMAKING[slot.id], chance = Math.min(0.95, 0.35 + (level(game, "firemaking") - fm.level) * 0.03 + 0.1);
  if (game.rng() >= chance) { activity.timer = 2; return; }
  player.inventory[activity.slot] = null; player.activity = null;
  game.fires.push({ uid: game.nextUid++, x: player.x, y: player.y, expires: game.tick + 60 + Math.floor(game.rng() * 60) });
  addXp(game, "firemaking", fm.xp); message(game, "The fire catches and the logs begin to burn."); sound(game, "fire");
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) if (canWalk(game, player.x + dx, player.y + dy)) { moveTo(game, player.x + dx, player.y + dy); break; }
}
function stallTick(game: Game, activity: Extract<Activity, { kind: "thieve_stall" }>) {
  const player = game.player, object = game.world.objects[activity.objectId], stall = STALLS[object.stall!];
  player.activity = null;
  if (game.depleted.has(object.id)) { message(game, "The stall is empty right now."); return; }
  if (!freeSlots(player)) return;
  let roll = game.rng(), loot: string = stall.loot[0][0];
  for (const [id, p] of stall.loot) { if (roll < p) { loot = id; break; } roll -= p; }
  give(player, loot); addXp(game, "thieving", stall.xp); game.depleted.set(object.id, game.tick + stall.respawn);
  message(game, `You steal ${aOrAn(item(loot).name)} ${item(loot).name.toLowerCase()} from the stall.`); sound(game, "pickup");
}
// ---------- Wayfaring ----------
/** Wayfaring XP, +10% in the Wayfarer's hood. */
const wayfaringXp = (game: Game, xp: number) => addXp(game, "agility", xp * (game.player.equipment.head === "wayfarer_hood" ? 1.1 : 1));
function obstacleTick(game: Game, activity: Extract<Activity, { kind: "obstacle" }>) {
  const player = game.player, object = game.world.objects[activity.objectId], obstacle = object.obstacle!;
  player.activity = null;
  if (game.rng() < slipChance(game, obstacle)) {
    // A slip: you fall back where you started, hurt a little, and the lap is broken.
    const hurt = Math.min(player.hp - 1, 1 + Math.floor(obstacle.level / 10));
    if (hurt > 0) damagePlayer(game, hurt, null);
    player.courseStep = -1;
    message(game, `You slip on the ${object.name.toLowerCase()} and fall!`, "warn"); sound(game, "hurt"); return;
  }
  player.prev = { x: player.x, y: player.y }; player.x = activity.to.x; player.y = activity.to.y; player.moved = game.tick;
  wayfaringXp(game, obstacle.xp);
  const course = COURSES[obstacle.course];
  if (!course) { message(game, "You make it across."); return; }
  if (obstacle.step === player.courseStep + 1 || obstacle.step === 0) player.courseStep = obstacle.step;
  else player.courseStep = -1;
  if (obstacle.last && player.courseStep === obstacle.step) {
    wayfaringXp(game, obstacle.lapXp ?? course.lapXp); player.courseStep = -1;
    const marks = course.marks * (wayfarerPieces(player) >= 4 ? 2 : 1);
    give(player, WAYFARER_MARK, marks); player.stats.laps = (player.stats.laps ?? 0) + 1;
    message(game, `You complete a lap of the ${course.name}! You find ${marks} Wayfarer's mark${marks > 1 ? "s" : ""}.`, "level"); sound(game, "level");
  } else message(game, "…you make it.");
}

/** Hollowthread robes: an 8% chance a piece that a spell keeps its sigils, 30% in the full set. */
export const sigilSave = (player: Player, game?: Game) => Math.min(0.9, Math.max(fullSlayerSet(player, "hollowthread") ? 0.3 : 0.08 * setPieces(player, "hollowthread"), game && mixtureOn(game, 8) ? 0.5 : 0) + 0.05 * orderPieces(player.equipment, "ink"));
// ---------- Combat ----------
const STYLE_BONUS: Record<CombatStyle, { attack: number; strength: number; defence: number }> = {
  accurate: { attack: 3, strength: 0, defence: 0 }, aggressive: { attack: 0, strength: 3, defence: 0 },
  defensive: { attack: 0, strength: 0, defence: 3 }, controlled: { attack: 1, strength: 1, defence: 1 },
};
export function hitChance(attackRoll: number, defenceRoll: number) {
  return attackRoll > defenceRoll ? 1 - (defenceRoll + 2) / (2 * (attackRoll + 1)) : attackRoll / (2 * (defenceRoll + 1));
}
/** Faith XP per point of damage dealt with a faith weapon: a trickle (combat skills get 4), so Faith stays hard to train. */
export const FAITH_PER_HIT = 0.25;
export function playerMaxHit(game: Game) {
  const player = game.player, boost = prayerBoost(player), style = STYLE_BONUS[player.style];
  const effective = Math.floor(level(game, "strength") * (1 + boost.strength)) + style.strength + 8;
  return Math.floor(0.5 + effective * (bonuses(player).strength + 64) / 640) + (player.familyId === 6 ? 1 : 0) + (mixtureOn(game, 6) ? 3 : 0);
}
export function playerAccuracy(game: Game, monster: Monster, factor = 1) {
  const player = game.player, boost = prayerBoost(player), style = STYLE_BONUS[player.style];
  const attack = (Math.floor(level(game, "attack") * (1 + boost.attack)) + style.attack + 8) * (bonuses(player).attack + 64) * factor * (1 + carvingEffect(game).accuracy);
  const defence = (monster.def.defence * cursed(game, monster, "defence") + 9) * (monster.def.defenceBonus + 64);
  return hitChance(attack, defence);
}
function spellCost(game: Game, spell: Spell) {
  const sigils = { ...spell.sigils } as Record<string, number>;
  const staff = STAFF_SIGILS[game.player.equipment.weapon ?? ""];
  if (staff) delete sigils[staff];
  return sigils;
}
export function canCast(game: Game, spell: Spell) {
  if (level(game, spell.skill ?? "magic") < spell.level) return `You need a ${spell.skill === "prayer" ? "Faith" : "Magic"} level of ${spell.level} to cast this spell.`;
  if (spell.faith && game.player.prayer < faithCost(game, spell)) return `You need ${spell.faith} faith to cast this spell. Pray at an altar.`;
  if (spell.quest && !questDone(game, spell.quest)) return `You haven't learnt that glide yet: it comes with ${QUESTS.find(entry => entry.id === spell.quest)?.name ?? "a quest"}.`;
  if (spell.rarian && !game.player.rarian) return "That is Raria's: keep the Wise Friend's Law (Prior Caul, in Raria) to cast it.";
  if (!spell.rarian && spell.skill === "prayer" && game.player.rarian) return "You keep the Wise Friend's Law: its rites stand in place of the Old Friend's light until you set it down.";
  for (const [sigil, n] of Object.entries(spellCost(game, spell))) if (sigilStock(game.player, sigil) < n) return "You do not have enough sigils to cast this spell.";
  return null;
}
function playerCombat(game: Game) {
  const player = game.player;
  if (player.combat === null) return;
  const monster = monsterByUid(game, player.combat);
  if (!monster) { player.combat = null; player.queuedSpell = null; return; }
  const spellId = player.queuedSpell ?? player.autocast, spell = spellId ? SPELLS.find(entry => entry.id === spellId && entry.target === "monster") ?? null : null;
  // A faith weapon hurts the undead more (more accurate, harder hitting).
  const holy = !!weapon(player)?.equip?.holy, range = spell ? 0 : bowRange(game);
  let boost = slayerBoost(game, monster.def.id) * masteryBoost(game, monster.def.id) * (holy && monster.def.undead ? 1.2 : 1) * (1 + carvingEffect(game).dealt);
  const within = (x: number, y: number) => spell ? chebyshev({ x, y }, monster) <= 8 && chebyshev({ x, y }, monster) >= 1
    : range ? reachGap({ x, y }, monster.x, monster.y, footprint(monster)) >= 1 && reachGap({ x, y }, monster.x, monster.y, footprint(monster)) <= range
    : adjacentTo(x, y, monster.x, monster.y, footprint(monster));
  if (!within(player.x, player.y)) {
    if (!player.path.length || player.path.length > 20) player.path = findPath(game, player, within, monster) ?? [];
    return;
  }
  player.path = []; face(game, monster.x, monster.y);
  if (player.attackTimer > 0) return;
  const unwoundable = slayerProblem(game, monster.def.id) ?? (monster.def.faction && (questDone(game, `${monster.def.faction}_truce`) || westTruce(game, monster.def.faction)) ? (monster.def.faction === "rrr" ? "The Regiment honours your writ. Draw on them and it won't." : monster.def.faction === "fff" ? "The Federation knows your name. It would rather keep knowing it." : "They keep the truce with you, and you keep it with them.") : null);
  if (unwoundable) { message(game, unwoundable, "warn"); player.combat = null; player.queuedSpell = null; return; }
  // A sneak attack: striking a monster that hasn't noticed you, from sneaking, lands harder and truer (more with Stealth).
  if (player.sneak && !monster.target) {
    player.sneak = false; boost *= 1.25 + level(game, "thieving") * 0.0025;
    addXp(game, "thieving", Math.round(8 + monster.def.level * 0.5));
    message(game, `You strike the ${monster.def.name.toLowerCase()} from the shadows!`);
  }
  if (!monster.target) rally(game, monster);
  monster.target = true;
  if (!spell && range) { rangedAttack(game, monster, boost); return; }
  if (spell) {
    const problem = canCast(game, spell);
    if (problem) { message(game, problem, "warn"); player.combat = null; player.queuedSpell = null; player.autocast = null; return; }
    const echo = (player.familyId === 8 && game.rng() < 0.2) || game.rng() < sigilSave(player, game);
    if (!echo) for (const [sigil, n] of Object.entries(spellCost(game, spell))) useSigils(player, sigil, n);
    payFaith(game, spell);
    player.attackTimer = 5;
    // Its weakness: a spell of the element its hide gives way to lands truer and harder; holy light hurts the undead more.
    if (monster.def.weakness === spell.element) { boost *= 1.33; onWeakSpot(game, monster); }
    // The Old Friend's light and the Wise Friend's rites both burn the dead (the Dusk's last rite as hard as Banishment).
    if ((spell.element === "holy" || (spell.rarian && spell.kind === "smite")) && monster.def.undead) boost *= spell.kind === "smite" && (spell.id === "banishment" || spell.id === "rite_of_dusk") ? 2 : 1.5;
    const castSkill: Skill = spell.skill ?? "magic";
    const prayers = prayerBoost(player), accuracy = (Math.floor(level(game, castSkill) * (1 + prayers.magic)) + 8) * (bonuses(player).magic + bonuses(player).prayer * (castSkill === "prayer" ? 2 : 0) + 64) * (player.familyId === 8 ? 1.1 : 1) * boost;
    const defence = ((monster.def.magicDef ?? monster.def.defence) * cursed(game, monster, "defence") + 9) * (monster.def.defenceBonus + 64);
    emit(game, { type: "projectile", projectile: { from: { x: player.x, y: player.y }, to: { x: monster.x, y: monster.y }, start: game.tick, end: game.tick + 1, color: SPELL_COLORS[spell.id] ?? ELEMENT_COLORS[spell.element] ?? "#c7d3dc", style: "magic", element: spell.element } });
    sound(game, "spell");
    if (!spell.maxHit) {
      // Curses and Bind: a magic accuracy roll, then an effect instead of damage.
      player.queuedSpell = null; player.combat = null;
      if (game.rng() >= hitChance(accuracy, defence)) { message(game, "Your spell had no effect."); emit(game, { type: "hit", on: "monster", uid: monster.uid, damage: -1, tick: game.tick }); return; }
      addXp(game, castSkill, spell.xp);
      if (spell.kind === "bind") { monster.curses.bound = game.tick + 16; message(game, `The ${monster.def.name.toLowerCase()} is rooted to the spot.`); }
      else if (spell.curse) { monster.curses[spell.curse.stat] = game.tick + 100; message(game, `You ${spell.name.toLowerCase()} the ${monster.def.name.toLowerCase()}.`); }
      return;
    }
    const hit = game.rng() < hitChance(accuracy * (1 + carvingEffect(game).accuracy), defence) ? Math.floor(game.rng() * (Math.floor(spell.maxHit! * boost * (1 + carvingEffect(game).magic)) + 1)) : -1;
    addXp(game, castSkill, spell.xp);
    if (hit > 0) { addXp(game, castSkill, hit * 2); addXp(game, "hitpoints", hit * 1.33); if (holy) addXp(game, "prayer", hit * FAITH_PER_HIT * (1 + 0.04 * orderPieces(player.equipment, "sol"))); }
    damageMonster(game, monster, Math.max(0, hit), hit < 0);
    player.queuedSpell = null;
    if (!player.autocast) player.combat = null;
    return;
  }
  player.attackTimer = attackSpeed(player);
  const hit = game.rng() < playerAccuracy(game, monster, boost) ? Math.floor(game.rng() * (Math.floor(playerMaxHit(game) * boost) + 1)) : -1;
  const damage = Math.max(0, Math.min(hit, monster.hp));
  if (damage > 0) {
    const xp = damage * 4;
    if (player.style === "accurate") addXp(game, "attack", xp);
    else if (player.style === "aggressive") addXp(game, "strength", xp);
    else if (player.style === "defensive") addXp(game, "defence", xp);
    else { addXp(game, "attack", xp / 3); addXp(game, "strength", xp / 3); addXp(game, "defence", xp / 3); }
    addXp(game, "hitpoints", damage * 1.33);
    if (holy) addXp(game, "prayer", damage * FAITH_PER_HIT * (1 + 0.04 * orderPieces(player.equipment, "sol")));
    // A faith weapon burning the dead: if holy light is what it fears, now you know.
    if (holy && monster.def.undead && monster.def.weakness === "holy") onWeakSpot(game, monster);
  }
  emit(game, { type: "swing", weapon: weaponSound(player.equipment.weapon), tick: game.tick });
  sound(game, hit > 0 ? "hit" : "miss");
  damageMonster(game, monster, Math.max(0, hit), hit < 0, true);
  // The Ringbreaker: one blow in three throws the creature back a step, and the recoil costs the wielder 1 to 4 health.
  if (hit > 0 && player.equipment.weapon === "ringbreaker" && monster.hp > 0 && !monster.dead && game.rng() < 0.33) {
    const dx = Math.sign(monster.x - player.x), dy = Math.sign(monster.y - player.y);
    if ((dx || dy) && monsterCanStep(game, monster, dx, dy) && !isBound(game, monster)) {
      moveMonster(game, monster, monster.x + dx, monster.y + dy); monster.attackTimer = Math.max(monster.attackTimer, 3);
      const recoil = 1 + Math.floor(game.rng() * 4);
      player.hp = Math.max(1, player.hp - recoil); emit(game, { type: "hit", on: "player", damage: recoil, tick: game.tick });
      message(game, `The Ringbreaker throws the ${monster.def.name.replace(/^The /, "").toLowerCase()} back a step. The recoil takes ${recoil} of your health.`);
    }
  }
  // The Lopsided elixir: one blow in five lands twice. The Order of the Sol's weird luck: 1% a piece.
  if (hit > 0 && monster.hp > 0 && ((mixtureOn(game, 4) && game.rng() < 0.2) || game.rng() < 0.01 * orderPieces(player.equipment, "sol"))) { damageMonster(game, monster, hit, false, true); message(game, "Your blow lands twice."); }
}
// ---------- Ranged ----------
/** The best arrows in your pack that your Ranged level can use. */
/** The strongest ammunition in your pack that your weapon fires (arrows for bows, bolts for crossbows) and your Ranged level allows. */
export function bestArrow(game: Game) {
  let best: { id: string; strength: number } | null = null;
  const bolts = !!weapon(game.player)?.equip?.bow?.bolts;
  for (const slot of game.player.inventory) {
    const ammo = slot ? item(slot.id).ammo : undefined;
    if (ammo && !!ammo.bolt === bolts && ammo.level <= level(game, "ranged") && (!best || ammo.strength > best.strength)) best = { id: slot!.id, strength: ammo.strength };
  }
  return best;
}
/** Styles with a bow: Accurate (+3 accuracy), Rapid (a tick faster), Longrange (+2 reach, Defence XP). */
export function rangedMaxHit(game: Game, arrowStrength = bestArrow(game)?.strength ?? 0) {
  const effective = level(game, "ranged") + (game.player.style === "accurate" ? 3 : 0) + 8, punch = weapon(game.player)?.equip?.bow?.strength ?? 0;
  return Math.floor(0.5 + effective * (arrowStrength + punch + 64) / 640);
}
function rangedAttack(game: Game, monster: Monster, boost: number) {
  const player = game.player, arrow = bestArrow(game);
  const bolts = !!weapon(player)?.equip?.bow?.bolts;
  if (!arrow) { message(game, bolts ? "You have no bolts you can use. Fletch & Feather in Friendhollow and Hazel in Fernwick sell them." : "You have no arrows you can use. Fletch & Feather in Friendhollow sells them.", "warn"); player.combat = null; return; }
  take(player, arrow.id, 1);
  player.attackTimer = Math.max(2, attackSpeed(player) - (player.style === "aggressive" ? 1 : 0));
  const accuracy = (level(game, "ranged") + (player.style === "accurate" ? 3 : 0) + 8) * (bonuses(player).ranged + 64) * boost * (1 + carvingEffect(game).accuracy);
  const defence = (monster.def.defence * cursed(game, monster, "defence") + 9) * (monster.def.defenceBonus + 64);
  const hit = game.rng() < hitChance(accuracy, defence) ? Math.floor(game.rng() * (Math.floor(rangedMaxHit(game, arrow.strength) * boost) + 1)) : -1;
  const damage = Math.max(0, Math.min(hit, monster.hp));
  if (damage > 0) {
    if (player.style === "defensive") { addXp(game, "ranged", damage * 2); addXp(game, "defence", damage * 2); } else addXp(game, "ranged", damage * 4);
    addXp(game, "hitpoints", damage * 1.33);
  }
  emit(game, { type: "projectile", projectile: { from: { x: player.x, y: player.y }, to: { x: monster.x, y: monster.y }, start: game.tick, end: game.tick + 1, color: item(arrow.id).icon.color, style: bolts ? "bolt" : "arrow" } });
  sound(game, "bow");
  // Hazel's quiver calls most shots home; otherwise most arrows can be picked up again where they land.
  if (player.equipment.cape === "hazels_quiver" && game.rng() < 0.8) give(player, arrow.id, 1);
  else if (game.rng() < 0.6) dropItem(game, arrow.id, 1, monster.x, monster.y, 150);
  damageMonster(game, monster, Math.max(0, hit), hit < 0);
}
const SPELL_COLORS: Record<string, string> = { breeze_dart: "#dfe6ea", tide_dart: "#9fb4d0", stone_dart: "#a89479", ember_dart: "#e3a58c", breeze_lance: "#eef2f4", tide_lance: "#8fa3c9", ember_lance: "#e39a7c", breeze_burst: "#ffffff", ember_burst: "#f0a080" };
function damageMonster(game: Game, monster: Monster, damage: number, missed: boolean, melee = false) {
  const dealt = Math.min(damage, monster.hp), player = game.player;
  monster.hp -= dealt;
  if (dealt > 0) monster.mine = true;
  if (melee && dealt > 0) applyWeaponPoison(game, monster);
  // The Heartguard blade: every eight damage it deals heals you one.
  if (dealt >= 4 && player.equipment.weapon === "heartguard_blade" && player.hp < maxHp(player)) player.hp = Math.min(maxHp(player), player.hp + Math.max(1, Math.round(dealt / 8)));
  emit(game, { type: "hit", on: "monster", uid: monster.uid, damage: missed ? -1 : dealt, tick: game.tick });
  if (monster.attackTimer <= 0) monster.attackTimer = 1;
  if (monster.hp <= 0) killMonster(game, monster);
  else if (dealt > 0) creature(game, monster, "hurt");
}
function killMonster(game: Game, monster: Monster) {
  const player = game.player;
  monster.dead = true; monster.target = false; monster.respawnAt = game.tick + monster.def.respawn;
  if (player.combat === monster.uid) player.combat = null;
  player.kills++; player.killLog[monster.def.id] = (player.killLog[monster.def.id] ?? 0) + 1; sound(game, "kill"); creature(game, monster, "death");
  if (monster.def.boss || monster.def.worldBoss) { onBossFelled(game, !!monster.def.worldBoss); friendSays(game, "boss"); remember(game, "first_boss"); player.stats.bosses = (player.stats.bosses ?? 0) + 1; }
  if (monster.def.breath) remember(game, "first_dragon");
  const at = { x: monster.x, y: monster.y }, silver = Math.min(RELICS[1].max, player.relics[1] ?? 0) * RELICS[1].coinsPer + (riding(player)?.coins ?? 0) + 0.04 * orderPieces(player.equipment, "hood");
  const roll = (drop: { item: string; min: number; max: number }) => {
    const n = drop.min + Math.floor(game.rng() * (drop.max - drop.min + 1));
    dropItem(game, drop.item, drop.item === "coins" ? Math.round(n * (1 + silver)) : n, at.x, at.y);
  };
  const dropped: string[] = [];
  for (const drop of monster.def.always ?? []) { roll(drop); dropped.push(drop.item); }
  // A marked creature's trophy, under a beam of light like any rare find.
  if (monster.marked) { dropItem(game, "hunters_trophy", 1, at.x, at.y); for (const entry of game.ground) if (entry.id === "hunters_trophy" && entry.x === at.x && entry.y === at.y) entry.rare = true; sound(game, "rare"); }
  for (const drop of monster.def.drops) if (game.rng() < drop.chance) {
    dropped.push(drop.item);
    const before = game.ground.length;
    roll(drop);
    // A rare or valuable drop: a beam of light over it, a chime, and a line in the chat.
    if (drop.item !== "coins" && (drop.chance <= 0.05 || item(drop.item).value >= 1500)) {
      for (const entry of game.ground.slice(before)) entry.rare = true;
      const found = game.ground.find(entry => entry.id === drop.item && entry.x === at.x && entry.y === at.y); if (found) found.rare = true;
      message(game, `Valuable drop: ${item(drop.item).name}!`, "quest"); sound(game, "rare"); onRareFind(game); remember(game, "first_rare"); friendSays(game, "rare");
    }
  }
  if (monster.def.breath) rollPet(game, "emberling", monster.def.id === "emberwyrm" ? 400 : 99);
  if (monster.def.worldBoss) rollPet(game, "cinderkin", 99);
  onMonsterKilled(game, monster.def.id, at.x, at.y);
  onKilled(game, monster, dropped);
  slayerKill(game, monster.def.id);
}
/** Cindershell armour: dragonfire burns 15% less a piece, half in the full set. */
export const fireFactor = (player: Player, game?: Game) => (1 - 0.05 * orderPieces(player.equipment, "ember")) * (fullSlayerSet(player, "cindershell") ? 0.5 : 1 - 0.15 * setPieces(player, "cindershell")) * (game && player.antifireUntil > game.tick ? 0.5 : 1);
/** Bramble armour: thorns. A creature that hits you in melee takes 1 damage back a piece. */
export const thorns = (player: Player) => setPieces(player, "bramble");
function damagePlayer(game: Game, damage: number, from: Monster | null) {
  const player = game.player;
  if (player.ward?.reduce && game.tick < player.wardUntil && damage > 0) damage = Math.max(0, Math.round(damage * (1 - player.ward.reduce)));
  // A carving's shelter (an oak bulwark, a yew warden…).
  if (damage > 0 && game.carvings.length) { const taken = carvingEffect(game).taken; if (taken) damage = Math.max(0, Math.round(damage * (1 - taken))); }
  // The Order of the Diamond's steadfast blessing: 2% of a creature's blow turned aside for every piece worn.
  if (from && damage > 0) { const diamond = orderPieces(player.equipment, "diamond"); if (diamond) damage = Math.max(0, Math.round(damage * (1 - 0.02 * diamond))); }
  player.hp = Math.max(0, player.hp - damage);
  emit(game, { type: "hit", on: "player", damage, tick: game.tick });
  if (damage > 0) sound(game, "hurt");
  if (damage > 0 && player.hp > 0 && player.hp < maxHp(player) * 0.3) friendSays(game, "hurt");
  const prick = from && damage > 0 && from.def.attackStyle !== "magic" ? Math.min(thorns(player), from.hp - 1) : 0;
  if (prick > 0) { from!.hp -= prick; emit(game, { type: "hit", on: "monster", uid: from!.uid, damage: prick, tick: game.tick }); }
  if (from && game.autoRetaliate && player.combat === null && !player.path.length && !player.target && (!player.activity || player.activity.kind !== "obstacle")) {
    player.activity = null; player.combat = from.uid; player.attackTimer = Math.max(player.attackTimer, 1);
  }
  if (player.hp <= 0) die(game);
}
function die(game: Game) {
  const player = game.player, spawn = game.world.places.spawn;
  message(game, "Oh dear, you are dead!", "warn"); emit(game, { type: "death", tick: game.tick }); remember(game, "first_death"); friendSays(game, "death"); sound(game, "death");
  player.deaths++; stopAll(game); closeInterfaces(game); player.prayers = []; player.hp = maxHp(player); player.energy = 100;
  for (const monster of game.monsters) monster.target = false;
  // Fallen in the Rare Friends Ring: its magic revives you in the lobby instead.
  if (inRingBuilding(player.x, player.y)) { arenaRevive(game); player.moved = game.tick - 10; player.stunned = 0; return; }
  player.prev = { ...spawn }; player.x = spawn.x; player.y = spawn.y; player.moved = game.tick - 10; player.stunned = 0;
  message(game, "You wake up by the Friendhollow fountain. Your items are safe: the Realm is kind to new heroes.", "info");
}
function monsterTick(game: Game, monster: Monster) {
  // Poison on the creature: four doses, eight ticks apart.
  if (monster.poison && !monster.dead && --monster.poison.timer <= 0) {
    monster.poison.timer = 8; monster.poison.left--;
    damageMonster(game, monster, monster.poison.damage, false);
    if (monster.poison.left <= 0 || monster.hp <= 0) monster.poison = null;
    if (monster.hp <= 0) return;
  }
  const player = game.player;
  if (monster.dead) {
    game.sneakingPast.delete(monster.uid);
    if (monster.arena) return;
    // A fallen soldier is back at its post when its time comes round.
    if (monster.twinOf !== undefined) { if (game.tick >= monster.respawnAt) monster.sheathe = true; return; }
    if (game.tick >= monster.respawnAt) {
      monster.dead = false; monster.hp = monster.def.hp; monster.curses = {}; monster.bornAt = game.tick; monster.x = monster.spawn.x; monster.y = monster.spawn.y; monster.prev = { ...monster.spawn }; monster.target = false; monster.foe = null;
      rollMarked(game, monster);
    }
    return;
  }
  if (monster.attackTimer > 0) monster.attackTimer--;
  const sameLayer = isUnderground(monster.spawn.y) === isUnderground(player.y) && realPoint(game.world, monster.spawn.x, monster.spawn.y).level === realPoint(game.world, player.x, player.y).level;
  // Aggression: attack players whose combat level is at most twice the monster's, unless they're sneaking past unseen
  // (each tick the monster may notice them) or veiled by the Veilweave hood (it can't).
  // Light feet: with Stealth 50 they only notice you (not sneaking) from 3 tiles, with 80 from 2.
  const stealth = level(game, "thieving"), reach = player.sneak ? 4 : stealth >= 80 ? 2 : stealth >= 50 ? 3 : 4;
  // A creature summoned for a match always comes for you, however strong you are.
  if (monster.arena && !monster.target && sameLayer) monster.target = true;
  // A people at truce with you keep their spears down.
  const truce = !!monster.def.faction && (questDone(game, `${monster.def.faction}_truce`) || westTruce(game, monster.def.faction));
  if (truce && monster.target) { monster.target = false; monster.retreat = 2; }
  const wouldAttack = !truce && !monster.target && monster.def.aggressive && sameLayer && chebyshev(monster, player) <= reach && combatLevel(player) <= monster.def.level * 2;
  if (wouldAttack && veiled(game)) { /* It looks straight through you. */ }
  else if (wouldAttack && player.sneak) { if (spots(game, monster)) caughtSneaking(game, monster); else if (!game.sneakingPast.has(monster.uid)) game.sneakingPast.set(monster.uid, game.tick); }
  else if (wouldAttack) { game.sneakingPast.delete(monster.uid); monster.target = true; creature(game, monster, "aggro"); }
  else if (!monster.target && game.sneakingPast.has(monster.uid)) slippedPast(game, monster);
  // It mends itself while it's hurt (the Archivist Below reads itself whole again).
  if (monster.def.heals && monster.hp < maxHpOf(monster) / 2 && game.tick % 5 === 0) { monster.hp = Math.min(maxHpOf(monster), monster.hp + monster.def.heals); if (monster.target) learnTrick(game, monster.def.id, "heals"); }
  if (monster.target) {
    monster.idle = 0;
    const leash = Math.max(Math.abs(monster.x - monster.spawn.x), Math.abs(monster.y - monster.spawn.y));
    if (!monster.arena && (!sameLayer || leash > monster.wander + 12 || chebyshev(monster, player) > 16)) { monster.target = false; monster.retreat = 6; return; }
    // An archer shoots from where it stands once you're in its range; everything else closes in.
    const reach = monster.def.ranged ?? 0, shooting = reach > 0 && chebyshev(monster, player) <= reach;
    if (shooting || adjacentTo(player.x, player.y, monster.x, monster.y, footprint(monster))) {
      if (monster.attackTimer <= 0) {
        // Below a third of its health an enraged thing hits half as hard again, and faster.
        const enraged = !!monster.def.enrage && monster.hp <= maxHpOf(monster) / 3;
        monster.attackTimer = Math.max(2, monster.def.speed - (enraged ? 1 : 0));
        const boost = prayerBoost(player), style = STYLE_BONUS[player.style];
        let breathed = false;
        const attack = (monster.def.attack * cursed(game, monster, "attack") + 9) * (monster.def.attackBonus + 64);
        const defence = (Math.floor(level(game, "defence") * (1 + boost.defence)) + style.defence + 8) * (bonuses(player).defence + 64);
        // (A deadwood dread near you puts creatures off their stroke.)
        let hit = game.rng() < hitChance(attack * (1 - carvingEffect(game).foes), defence) ? Math.floor(game.rng() * (Math.floor(monster.def.maxHit * cursed(game, monster, "strength") * (enraged ? 1.5 : 1)) + 1)) : 0;
        if (boost.protect) hit = Math.floor(hit * (monster.def.boss ? 0.4 : 0));
        if (shooting && !adjacentTo(player.x, player.y, monster.x, monster.y, footprint(monster))) emit(game, { type: "projectile", projectile: { from: { x: monster.x, y: monster.y }, to: { x: player.x, y: player.y }, start: game.tick, end: game.tick + 1, color: "#8a7a5a", style: "arrow" } });
        // Dragonfire: a third of a dragon's attacks are breath, which only a Wyrmward shield turns aside.
        if (monster.def.breath && game.rng() < 0.33) {
          breathed = true;
          const shielded = player.equipment.shield === "wyrmward_shield";
          hit = Math.floor(game.rng() * ((shielded ? 4 : monster.def.breath) + 1) * fireFactor(player, game));
          emit(game, { type: "projectile", projectile: { from: { x: monster.x, y: monster.y }, to: { x: player.x, y: player.y }, start: game.tick, end: game.tick + 1, color: "#e9733f", style: "fire" } });
          sound(game, "fire");
          message(game, shielded ? "Your shield absorbs most of the dragon's breath." : "You're horribly burnt by the dragonfire! A Wyrmward shield would help.", shielded ? "game" : "warn");
        }
        creature(game, monster, "attack");
        damagePlayer(game, hit, monster);
        const poisoned = hit > 0 && !!monster.def.poison && game.rng() < monster.def.poison.chance;
        if (poisoned) poisonPlayer(game, monster.def.poison!.damage);
        // A wraith's touch takes faith (or wind) with the blood.
        if (hit > 0 && monster.def.drain) {
          if (monster.def.drain.faith) player.prayer = Math.max(0, player.prayer - monster.def.drain.faith);
          if (monster.def.drain.energy) player.energy = Math.max(0, player.energy - monster.def.drain.energy);
          if (game.rng() < 0.3) message(game, `The ${monster.def.name.replace(/^The /, "").toLowerCase()}'s touch drains your ${monster.def.drain.faith ? "faith" : "strength to run"}.`, "warn");
        }
        // What it just did to you, you know now.
        onAttacked(game, monster, { shooting: shooting && !adjacentTo(player.x, player.y, monster.x, monster.y, footprint(monster)), poisoned, drained: hit > 0 && !!monster.def.drain, breath: breathed, enraged });
      }
      return;
    }
    stepMonsterToward(game, monster, player);
    return;
  }
  // Another creature to fight (the Realm's wars).
  if (monster.foe != null && foeFight(game, monster)) return;
  // A soldier with nothing left to fight puts its steel away.
  if (monster.twinOf !== undefined && ++monster.idle! >= 15) { monster.sheathe = true; return; }
  // Idle wandering.
  if (monster.retreat > 0) { monster.retreat--; stepMonsterToward(game, monster, monster.spawn); return; }
  if (game.rng() < 0.12 && !isBound(game, monster)) {
    const dx = Math.floor(game.rng() * 3) - 1, dy = Math.floor(game.rng() * 3) - 1, nx = monster.x + dx, ny = monster.y + dy;
    if (Math.abs(nx - monster.spawn.x) <= monster.wander && Math.abs(ny - monster.spawn.y) <= monster.wander && monsterCanStep(game, monster, dx, dy)) moveMonster(game, monster, nx, ny);
  }
}
// ---------- The Realm's wars: soldiers, their twins, and creatures fighting creatures (skirmish.ts) ----------
const onLayer = (game: Game, a: Monster | Npc, b: Monster | Npc) => isUnderground(a.spawn.y) === isUnderground(b.spawn.y) && realPoint(game.world, a.spawn.x, a.spawn.y).level === realPoint(game.world, b.spawn.x, b.spawn.y).level;
/** Only what happens near you makes a sound or a mark (far battles would drown out everything else). */
const nearYou = (game: Game, at: Point) => chebyshev(at, game.player) <= 18;
/** A soldier draws steel: its fighting self comes out where it stands, and the soldier is put away until it's done. */
export function drawSteel(game: Game, npc: Npc): Monster | null {
  const def = SOLDIERS[npc.id];
  if (!def) return null;
  const uid = TWIN_BASE + npc.uid, out = game.monsters.find(monster => monster.uid === uid);
  if (out) return out.dead ? null : out;
  const at = { x: npc.x, y: npc.y };
  const twin: Monster = { uid, def, x: at.x, y: at.y, prev: { ...at }, spawn: { ...npc.spawn }, hp: def.hp, heading: { ...npc.heading }, target: false, attackTimer: 2, respawnAt: 0, dead: false,
    wander: Math.max(4, npc.wander), moved: 0, retreat: 0, curses: {}, twinOf: npc.uid, idle: 0, bornAt: game.tick, foe: null };
  game.monsters.push(twin); npc.drawn = uid;
  return twin;
}
/** The fight's over (or it fell and its time has come round): the soldier is back, where it stood or at its post. */
function sheathe(game: Game, twin: Monster) {
  const index = game.monsters.indexOf(twin);
  if (index >= 0) game.monsters.splice(index, 1);
  if (game.player.combat === twin.uid) { game.player.combat = null; game.player.queuedSpell = null; }
  game.sneakingPast.delete(twin.uid);
  for (const monster of game.monsters) if (monster.foe === twin.uid) monster.foe = null;
  const npc = game.npcs.find(entry => entry.uid === twin.twinOf);
  if (!npc) return;
  npc.drawn = null;
  const home = !twin.dead && Math.max(Math.abs(twin.x - npc.spawn.x), Math.abs(twin.y - npc.spawn.y)) <= npc.wander;
  const at = home ? { x: twin.x, y: twin.y } : npc.spawn;
  npc.prev = { ...at }; npc.x = at.x; npc.y = at.y; npc.heading = { ...twin.heading }; npc.moved = game.tick;
}
/** You draw on a soldier: it draws on you, and so do its comrades nearby. */
function attackSoldier(game: Game, uid: number) {
  const npc = npcByUid(game, uid);
  if (!npc) return;
  const twin = drawSteel(game, npc);
  if (twin) setTarget(game, { kind: "monster", uid: twin.uid, option: "Attack" });
}
/** The soldiers of a side near one you've struck take up the fight against you. */
function rally(game: Game, struck: Monster) {
  const side = sideOf(struck.def);
  if (!side || !SOLDIERLY.has(side)) return;
  for (const npc of game.npcs) {
    if (npc.drawn || SOLDIERS[npc.id]?.side !== side || chebyshev(npc, struck) > 7 || !onLayer(game, npc, struck)) continue;
    const twin = drawSteel(game, npc);
    if (twin) { twin.target = true; twin.foe = null; }
  }
  for (const other of game.monsters) if (other !== struck && !other.dead && !other.target && sideOf(other.def) === side && chebyshev(other, struck) <= 7 && onLayer(game, other, struck)) { other.target = true; other.foe = null; }
}
/** Soldiers look for a fight among the creatures round them; the wild and the dead go for soldiers that come close. */
function skirmishScan(game: Game) {
  const CELL = 8, grid = new Map<number, Monster[]>(), cell = (x: number, y: number) => Math.floor(x / CELL) * 4096 + Math.floor(y / CELL);
  for (const monster of game.monsters) if (!monster.dead && !monster.arena && sideOf(monster.def)) { const key = cell(monster.x, monster.y); (grid.get(key) ?? grid.set(key, []).get(key)!).push(monster); }
  const nearest = (at: Point, range: number, fits: (monster: Monster) => boolean) => {
    let best: Monster | null = null, bestDistance = range + 1;
    for (let cx = Math.floor((at.x - range) / CELL); cx <= Math.floor((at.x + range) / CELL); cx++) for (let cy = Math.floor((at.y - range) / CELL); cy <= Math.floor((at.y + range) / CELL); cy++) {
      for (const monster of grid.get(cx * 4096 + cy) ?? []) { const distance = chebyshev(at, monster); if (distance < bestDistance && fits(monster)) { best = monster; bestDistance = distance; } }
    }
    return best;
  };
  for (const monster of game.monsters) {
    if (monster.dead || monster.arena || monster.foe != null || monster.target || monster.retreat > 0 || (monster.uid + game.tick) % 3) continue;
    const side = sideOf(monster.def), range = !side ? 0 : SOLDIERLY.has(side) ? 6 : monster.def.aggressive ? 3 : 0;
    if (!range) continue;
    const foe = nearest(monster, range, other => other !== monster && hostile(side, sideOf(other.def)) && (SOLDIERLY.has(side!) || SOLDIERLY.has(sideOf(other.def)!)) && onLayer(game, monster, other));
    if (foe) { monster.foe = foe.uid; monster.idle = 0; }
  }
  for (const npc of game.npcs) {
    const soldier = SOLDIERS[npc.id];
    if (!soldier || npc.drawn || (npc.uid + game.tick) % 3) continue;
    const foe = nearest(npc, 5, other => hostile(soldier.side, sideOf(other.def)) && onLayer(game, npc, other));
    if (!foe) continue;
    const twin = drawSteel(game, npc);
    if (twin) { twin.foe = foe.uid; if (foe.foe == null && !foe.target) foe.foe = twin.uid; }
  }
}
/** Fight the creature it's set on: close in (or shoot), and strike. False when the fight's off. */
function foeFight(game: Game, monster: Monster): boolean {
  const foe = game.monsters.find(entry => entry.uid === monster.foe);
  const leash = Math.max(Math.abs(monster.x - monster.spawn.x), Math.abs(monster.y - monster.spawn.y));
  if (!foe || foe.dead || chebyshev(monster, foe) > 12 || leash > monster.wander + 10 || !onLayer(game, monster, foe)) { monster.foe = null; monster.retreat = 4; return false; }
  monster.idle = 0;
  const reach = monster.def.ranged ?? 0, shooting = reach > 0 && chebyshev(monster, foe) <= reach;
  if (shooting || adjacentTo(monster.x, monster.y, foe.x, foe.y, footprint(foe))) { if (monster.attackTimer <= 0) strike(game, monster, foe); return true; }
  stepMonsterToward(game, monster, foe, foe);
  return true;
}
/** One creature's blow on another: the same rolls as against you, magic against magic defence. */
function strike(game: Game, attacker: Monster, victim: Monster) {
  const enraged = !!attacker.def.enrage && attacker.hp <= attacker.def.hp / 3, magic = attacker.def.attackStyle === "magic";
  attacker.attackTimer = Math.max(2, attacker.def.speed - (enraged ? 1 : 0));
  attacker.heading = headingTo(victim.x - attacker.x, victim.y - attacker.y, attacker.heading);
  const attack = (attacker.def.attack * cursed(game, attacker, "attack") + 9) * (attacker.def.attackBonus + 64);
  const defence = ((magic ? victim.def.magicDef ?? victim.def.defence : victim.def.defence) * cursed(game, victim, "defence") + 9) * (victim.def.defenceBonus + 64);
  const hit = game.rng() < hitChance(attack, defence) ? Math.floor(game.rng() * (Math.floor(attacker.def.maxHit * cursed(game, attacker, "strength") * (enraged ? 1.5 : 1)) + 1)) : -1;
  const dealt = Math.max(0, Math.min(hit, victim.hp));
  victim.hp -= dealt;
  if (nearYou(game, attacker)) {
    if (magic || !adjacentTo(attacker.x, attacker.y, victim.x, victim.y, footprint(victim)))
      emit(game, { type: "projectile", projectile: { from: { x: attacker.x, y: attacker.y }, to: { x: victim.x, y: victim.y }, start: game.tick, end: game.tick + 1, color: magic ? "#9fb4d0" : "#8a7a5a", style: magic ? "magic" : "arrow" } });
    creature(game, attacker, "attack");
    emit(game, { type: "hit", on: "monster", uid: victim.uid, damage: hit < 0 ? -1 : dealt, tick: game.tick });
  }
  // Struck, it turns on whoever struck it (unless it's busy with you).
  if (!victim.target && victim.foe == null) { victim.foe = attacker.uid; victim.idle = 0; }
  if (victim.hp > 0) return;
  // You wounded it, so it's yours whoever finished it; otherwise it simply falls (and leaves nothing).
  if (victim.mine) { attacker.foe = null; killMonster(game, victim); return; }
  victim.dead = true; victim.target = false; victim.foe = null; victim.respawnAt = game.tick + victim.def.respawn; attacker.foe = null;
  if (game.player.combat === victim.uid) { game.player.combat = null; game.player.queuedSpell = null; }
  if (nearYou(game, victim)) creature(game, victim, "death");
}
function monsterCanStep(game: Game, monster: Monster, dx: number, dy: number) {
  const size = footprint(monster);
  for (let oy = 0; oy < size; oy++) for (let ox = 0; ox < size; ox++) {
    if (!canStep(game, monster.x + ox, monster.y + oy, dx, dy)) return false;
    if (size === 1 && game.player.x === monster.x + dx && game.player.y === monster.y + dy) return false;
  }
  return true;
}
/** Gap between a point and a size × size footprint (0 = touching or inside). */
function gapTo(point: Point, x: number, y: number, size: number) {
  const gx = point.x < x ? x - point.x : point.x >= x + size ? point.x - (x + size - 1) : 0;
  const gy = point.y < y ? y - point.y : point.y >= y + size ? point.y - (y + size - 1) : 0;
  return { gx, gy, inside: gx === 0 && gy === 0 };
}
/**
 * Old-school "dumb" pathing: take the single step that brings the monster closest to its target, never onto the player.
 * Monsters don't search around walls, so they can get stuck behind things (safespots work).
 */
function creature(game: Game, monster: Monster, action: "attack" | "hurt" | "death" | "aggro") {
  emit(game, { type: "creature", id: monster.def.id, action, x: monster.x, y: monster.y, tick: game.tick });
}
/** What a weapon sounds like when it swings. */
function weaponSound(id: string | undefined): "slash" | "stab" | "crush" | "punch" {
  if (!id) return "punch";
  if (id.includes("dagger")) return "stab";
  if (id.includes("sword") || id.includes("sabre")) return "slash";
  return "crush";
}
/** A curse's multiplier on a monster stat (1 when uncursed). */
function cursed(game: Game, monster: Monster, stat: "attack" | "strength" | "defence") {
  const until = monster.curses[stat];
  if (!until || until <= game.tick) return 1;
  return 1 - (SPELLS.find(spell => spell.curse?.stat === stat)?.curse?.amount ?? 0);
}
export const isBound = (game: Game, monster: Monster) => (monster.curses.bound ?? 0) > game.tick;
function stepMonsterToward(game: Game, monster: Monster, target: Point, avoid?: Monster) {
  if (isBound(game, monster)) return;
  const size = footprint(monster), player = game.player;
  const score = (x: number, y: number) => { const { gx, gy } = gapTo(target, x, y, size); return Math.max(gx, gy) * 10 + Math.min(gx, gy) * 3; };
  let best: [number, number] | null = null, bestScore = score(monster.x, monster.y);
  for (const [dx, dy] of DIRS) {
    const nx = monster.x + dx, ny = monster.y + dy;
    if (gapTo(player, nx, ny, size).inside) continue;
    if (avoid && reachGap({ x: nx, y: ny }, avoid.x, avoid.y, footprint(avoid)) === 0) continue;
    if (!monsterCanStep(game, monster, dx, dy)) continue;
    const value = score(nx, ny) + (dx && dy ? 1 : 0);
    if (value < bestScore) { bestScore = value; best = [dx, dy]; }
  }
  if (best) moveMonster(game, monster, monster.x + best[0], monster.y + best[1]);
}
function moveMonster(game: Game, monster: Monster, x: number, y: number) {
  monster.prev = { x: monster.x, y: monster.y }; monster.heading = headingTo(x - monster.x, y - monster.y, monster.heading);
  monster.x = x; monster.y = y; monster.moved = game.tick;
}
function npcTick(game: Game, npc: Npc) {
  if (npc.busy > 0) { npc.busy--; return; }
  if (!npc.wander || game.rng() > 0.08) return;
  const dx = Math.floor(game.rng() * 3) - 1, dy = Math.floor(game.rng() * 3) - 1, nx = npc.x + dx, ny = npc.y + dy;
  if (Math.abs(nx - npc.spawn.x) > npc.wander || Math.abs(ny - npc.spawn.y) > npc.wander || !canStep(game, npc.x, npc.y, dx, dy)) return;
  if (nx === game.player.x && ny === game.player.y) return;
  npc.prev = { x: npc.x, y: npc.y }; npc.heading = headingTo(dx, dy, npc.heading); npc.x = nx; npc.y = ny; npc.moved = game.tick;
}
function upkeep(game: Game) {
  const player = game.player;
  for (const [id, until] of game.depleted) if (game.tick >= until) game.depleted.delete(id);
  if (game.fires.length) game.fires = game.fires.filter(fire => fire.expires > game.tick);
  for (const carving of game.carvings) if (carving.until <= game.tick) crumble(game, carving);
  if (game.ground.length) game.ground = game.ground.filter(entry => entry.expires > game.tick);
  // Hitpoints regenerate slowly; Cellular Friends regrow twice as fast, and every Heartguard piece quickens it by 6% (the Hearth cordial, three times as fast).
  if (++player.regenTimer >= Math.round(regenTicks(player) / (mixtureOn(game, 2) ? 3 : 1) / carvingEffect(game).regen)) { player.regenTimer = 0; if (player.hp < maxHp(player)) player.hp++; }
  // Poison on you: four doses, ten ticks apart; an antidote ends it.
  if (player.poison && --player.poison.timer <= 0) {
    player.poison.timer = 10; player.poison.left--;
    damagePlayer(game, Math.min(player.poison.damage, Math.max(0, player.hp - 1)), null); message(game, "The poison burns.", "warn");
    if (player.poison.left <= 0) { player.poison = null; message(game, "The poison has run its course."); }
  }
  // Drinks wear off a point at a time.
  if (++player.boostTimer >= 100) {
    player.boostTimer = 0;
    for (const skill of Object.keys(player.boosts) as Skill[]) { const b = player.boosts[skill] ?? 0; if (b > 0) player.boosts[skill] = b - 1; if ((player.boosts[skill] ?? 0) <= 0) delete player.boosts[skill]; }
  }
  if (player.mixture && player.mixture.until <= game.tick) { player.mixture = null; message(game, "The mixture's effect fades."); }
  // Presence: the region you're in (discovered once, lived in by the tick), and time with your Friend behind you.
  if (game.tick % 5 === 0) { const here = regionAt(game.world, player.x, player.y).id; onRegionEntered(game, here); player.regionTicks[here] = (player.regionTicks[here] ?? 0) + 5; }
  onFriendTime(game);
  if (game.tick % 5 === 0 && player.hp > 0) friendTick(game);
  if (game.tick % 10 === 3) onWestTick(game);
  if (game.tick % 20 === 7) codexTick(game);
  if (game.tick % 50 === 0) friendMilestones(game);
  if (game.events.some(event => event.type === "level" && event.tick === game.tick && event.skill !== "presence")) friendSays(game, "levelup");
  if (player.combat !== null && player.combatSaid !== player.combat) { player.combatSaid = player.combat; friendSays(game, "fight"); }
  // Prayer drains while prayers are active.
  if (player.prayers.length) {
    const resist = 1 + bonuses(player).prayer / 30;
    // The Order of Dusk's quiet: each piece worn makes the Law's commandments drain 5% slower.
    const dusk = player.rarian ? 1 - 0.05 * Math.min(10, orderPieces(player.equipment, "dusk")) : 1;
    const drain = player.prayers.reduce((sum, id) => sum + (PRAYERS.find(prayer => prayer.id === id)?.drain ?? 0), 0) / resist * dusk * (1 - carvingEffect(game).faith);
    player.prayer = Math.max(0, player.prayer - drain);
    if (player.prayer <= 0) { player.prayers = []; message(game, "You have run out of faith. Pray at an altar to restore it.", "warn"); }
  }
  const moving = player.path.length > 0 || !!game.held, spending = moving && (player.run || player.sneak);
  if (!spending || player.mount) player.energy = Math.min(100, player.energy + (0.25 + level(game, "agility") / 110) * (player.equipment.feet === "wayfarer_boots" ? 1.5 : 1) * (player.tonicUntil > game.tick ? 2 : 1) * carvingEffect(game).energy);
}

// ---------- Prayer, magic, style ----------
export function togglePrayer(game: Game, id: string) {
  const player = game.player, prayer = PRAYERS.find(entry => entry.id === id);
  if (!prayer) return;
  if (player.prayers.includes(id)) { player.prayers = player.prayers.filter(entry => entry !== id); sound(game, "click"); return; }
  if (level(game, "prayer") < prayer.level) { message(game, `You need a Faith level of ${prayer.level} to use ${prayer.name}.`, "warn"); return; }
  if (prayer.rarian && !player.rarian) { message(game, "That is a commandment of the Wise Friend's Law. Prior Caul in Raria keeps the Law for those who ask.", "warn"); return; }
  if (!prayer.rarian && player.rarian) { message(game, "You keep the Wise Friend's Law: its commandments stand in place of the old prayers until you set it down.", "warn"); return; }
  if (player.prayer < 1) { message(game, "You need to restore your faith at an altar.", "warn"); return; }
  // Only one prayer per stat: turn off overlapping ones.
  const keys = Object.keys(prayer.effect);
  player.prayers = player.prayers.filter(other => !Object.keys(PRAYERS.find(entry => entry.id === other)?.effect ?? {}).some(key => keys.includes(key)));
  player.prayers.push(id); sound(game, "pray");
}
/**
 * Clicking a spell. Self spells (teleports, Bonebloom) cast straight away. Damage spells autocast with a staff,
 * otherwise they arm "Cast X ->" like curses and Rootsnare (monsters), item spells (Gilded/Golden Touch, Forgeheart, enchanting) and
 * Far Reach (ground items).
 */
export function castSpell(game: Game, id: string): Selection {
  const player = game.player, spell = SPELLS.find(entry => entry.id === id);
  if (!spell) return null;
  const problem = canCast(game, spell);
  if (problem && spell.id !== "home") { message(game, problem, "warn"); return null; }
  if (spell.target === "self") {
    if (spell.kind === "bloom") { bonebloom(game, spell); return null; }
    if (spell.ward || spell.heal) { castOnSelf(game, spell); return null; }
    if (isUnderground(player.y) && spell.id !== "home") { message(game, "A dark force stops you from teleporting underground.", "warn"); return null; }
    if (game.arena) { message(game, "The Ring's magic holds you until the match is done. No glide, no homeward, no second chances.", "warn"); return null; }
    if (player.combat !== null && spell.id === "home") { message(game, "You can't use Homeward during combat.", "warn"); return null; }
    stopAll(game); closeInterfaces(game);
    for (const [sigil, n] of Object.entries(spellCost(game, spell))) useSigils(player, sigil, n);
    player.activity = { kind: "teleport", to: game.world.places[spell.teleport ?? "hollow_square"], timer: spell.id === "home" ? 10 : 3, spell: spell.id };
    if (spell.xp) addXp(game, "magic", spell.xp);
    message(game, spell.id === "home" ? "You begin to channel home…" : "You feel the Realm fold around you…"); sound(game, "spell");
    return null;
  }
  if (spell.maxHit && (isStaffEquipped(player) || (spell.skill === "prayer" && !!weapon(player)?.equip?.holy))) {
    player.autocast = player.autocast === spell.id ? null : spell.id;
    message(game, player.autocast ? `Autocasting ${spell.name}. Attack to cast it; click it again to stop.` : "Autocast off.");
    return null;
  }
  return { kind: "spell", spell: spell.id };
}
/** The Ringmaster's signet: three teleports to the Ring's lobby a day (the day turns at midnight UTC). */
export const SIGNET_PER_DAY = 3;
export function signetCharges(game: Game) {
  const day = Math.floor(Date.now() / 86_400_000);
  if (game.player.questData.signet_day !== day) { game.player.questData.signet_day = day; game.player.questData.signet_used = 0; }
  return SIGNET_PER_DAY - (game.player.questData.signet_used ?? 0);
}
export function signetTeleport(game: Game) {
  const player = game.player;
  if (!has(player, "ringmasters_signet") && player.equipment.ring !== "ringmasters_signet") return;
  if (game.arena) { message(game, "The Ring's magic holds you until the match is done. No signet takes you out.", "warn"); return; }
  if (isUnderground(player.y)) { message(game, "A dark force stops you from teleporting underground.", "warn"); return; }
  if (player.combat !== null) { message(game, "You can't use the signet during combat.", "warn"); return; }
  if (signetCharges(game) <= 0) { message(game, "The signet is cold. It carries you three times a day, and the day turns at midnight.", "warn"); return; }
  player.questData.signet_used = (player.questData.signet_used ?? 0) + 1;
  stopAll(game); closeInterfaces(game);
  player.activity = { kind: "teleport", to: game.world.places.ring, timer: 3, spell: "tablet:ring" };
  message(game, `The signet warms, and the Ring's magic folds the Realm around you… (${signetCharges(game)} left today)`); sound(game, "spell");
}
const TELEPORT_NAMES: Record<string, string> = { ring: "the Rare Friends Ring", raria: "Raria, before the palace", fff_fortress: "the FFF Fortress", barkreach: "BarkReach", hollow_square: "Friendhollow", emberforge: "Emberforge", oasis: "the Oasis", frostpeak: "Frostpeak", pier: "Pike's Pier", fernwick: "Fernwick", highcairn: "Highcairn", dawnhold: "Dawnhold", gravesend: "Gravesend", saltmarrow: "Saltmarrow", hollyhock: "Hollyhock", dyemoor: "Dyemoor", tallgrass: "Tallgrass", cragmaw: "Cragmaw", quillhaven: "Quillhaven", ashfall: "Ember Tamsin's camp at Ashfall" };
const ELEMENT_COLORS: Record<string, string> = { wind: "#e6ecef", water: "#8fa3c9", earth: "#a89479", fire: "#e9a07a", hollow: "#6d6b67", moon: "#c6bed4", gold: "#e2d49e", home: "#e8d4c0", holy: "#f2e28f", law: "#cfc7e6", dusk: "#8a6ab0" };
/** Faith spells spend faith as well as sigils. */
/** Faith a spell costs: the Order of Dusk's gear takes 4% off a rite of the Wise Friend for every piece worn. */
export const faithCost = (game: Game, spell: Spell) => !spell.faith ? 0 : spell.rarian ? spell.faith * (1 - 0.04 * Math.min(10, orderPieces(game.player.equipment, "dusk"))) : spell.faith;
function payFaith(game: Game, spell: Spell) { if (spell.faith) game.player.prayer = Math.max(0, game.player.prayer - faithCost(game, spell)); }
/** Wards, mending and blessings: cast on yourself, paid in sigils (and faith), XP to the spell's skill. */
function castOnSelf(game: Game, spell: Spell) {
  const player = game.player, notes: string[] = [];
  payRunes(game, spell); payFaith(game, spell);
  if (spell.ward) { player.ward = { defence: spell.ward.defence ?? 0, flat: spell.ward.flat ?? 0, reduce: spell.ward.reduce ?? 0 }; player.wardUntil = game.tick + spell.ward.ticks; notes.push(spell.ward.reduce ? `turns ${Math.round(spell.ward.reduce * 100)}% of every blow aside` : "steels your defence"); }
  if (spell.heal) {
    const before = player.hp;
    if (spell.heal.now) player.hp = Math.min(maxHp(player), player.hp + spell.heal.now);
    if (spell.heal.perTick && spell.heal.ticks) { player.renew = spell.heal.perTick; player.renewUntil = game.tick + spell.heal.ticks; notes.push(`keeps healing you`); }
    if (spell.heal.energy) { player.energy = Math.min(100, player.energy + spell.heal.energy); notes.push("restores your run energy"); }
    if (spell.heal.cure) { player.poison = null; notes.push("cures poison"); }
    if (player.hp > before) notes.unshift(`heals ${player.hp - before}`);
  }
  addXp(game, spell.skill ?? "magic", spell.xp);
  message(game, `You cast ${spell.name}. It ${notes.join(", ") || "settles over you"}.`); sound(game, "spell");
  emit(game, { type: "projectile", projectile: { from: { x: player.x, y: player.y }, to: { x: player.x, y: player.y - 0.01 }, start: game.tick, end: game.tick + 1, color: SPELL_COLORS[spell.id] ?? ELEMENT_COLORS[spell.element] ?? "#f2e28f", style: "magic", element: spell.element } });
}
function payRunes(game: Game, spell: Spell) { for (const [sigil, n] of Object.entries(spellCost(game, spell))) useSigils(game.player, sigil, n); }
function bonebloom(game: Game, spell: Spell) {
  const player = game.player, slots = player.inventory.map((slot, index) => slot?.id === "bones" ? index : -1).filter(index => index >= 0);
  if (!slots.length) { message(game, "You aren't holding any bones!", "warn"); return; }
  payRunes(game, spell);
  for (const index of slots) player.inventory[index] = { id: "sweetberry", n: 1 };
  addXp(game, "magic", spell.xp); sound(game, "spell");
  message(game, `Your ${slots.length > 1 ? `${slots.length} bones bloom` : "bone blooms"} into sweetberries.`);
}
/** Item spells: Gilded and Golden Touch, Forgeheart and enchanting, cast on an inventory slot. */
export function castOnItem(game: Game, spellId: string, slotIndex: number) {
  const player = game.player, spell = SPELLS.find(entry => entry.id === spellId), slot = player.inventory[slotIndex];
  if (!spell || spell.target !== "item" || !slot) return false;
  if (player.castTimer > 0) return false;
  const problem = canCast(game, spell);
  if (problem) { message(game, problem, "warn"); return false; }
  const definition = item(slot.id);
  if (spell.kind === "alchemy") {
    if (slot.id === "coins") { message(game, "Coins are already made of gold.", "warn"); return false; }
    if (definition.tradeable === false) { message(game, "You can't cast that on this item.", "warn"); return false; }
    const coins = Math.max(1, Math.floor(definition.value * (spell.id === "golden_touch" ? 0.6 : 0.4)));
    payRunes(game, spell); take(player, slot.id, 1); give(player, "coins", coins);
    message(game, `The ${definition.name.toLowerCase()} turns into ${coins} coins.`); sound(game, "coins");
  } else if (spell.kind === "superheat") {
    const metal = METALS.slice().reverse().find(entry => SMELTING[entry.id].ores[slot.id] !== undefined && Object.entries(SMELTING[entry.id].ores).every(([id, n]) => stock(player, id) >= n) && level(game, "smithing") >= SMELTING[entry.id].level);
    if (!metal) { message(game, slot.id.endsWith("_ore") || slot.id === "inkcoal" ? "You need the right ores (and Smithing level) for Forgeheart to work." : "Forgeheart only works on ore.", "warn"); return false; }
    payRunes(game, spell);
    for (const [id, n] of Object.entries(SMELTING[metal.id].ores)) useUp(player, id, n);
    give(player, `${metal.id}_bar`); addXp(game, "smithing", SMELTING[metal.id].xp);
    message(game, `The ore melts into a ${metal.name.toLowerCase()} bar.`); sound(game, "smelt");
  } else if (spell.kind === "enchant") {
    const recipe = spell.id === "enchant_moonstone" ? ["moonstone_amulet", "moonstone_pendant"] : ["rosestone_amulet", "rosestone_pendant"];
    if (slot.id !== recipe[0]) { message(game, `This spell works on a ${item(recipe[0]).name.toLowerCase()} (a cut gem on a string).`, "warn"); return false; }
    payRunes(game, spell); take(player, recipe[0], 1); give(player, recipe[1]);
    message(game, `The ${item(recipe[0]).name.toLowerCase()} glows and becomes a ${item(recipe[1]).name.toLowerCase()}.`); sound(game, "spell");
  }
  addXp(game, "magic", spell.xp); player.castTimer = 3; player.activity = null;
  emit(game, { type: "cast", spell: spell.id, tick: game.tick });
  return true;
}
function telegrab(game: Game, spellId: string, index: number) {
  const player = game.player, spell = SPELLS.find(entry => entry.id === spellId)!, ground = game.ground[index];
  const problem = canCast(game, spell);
  if (problem) { message(game, problem, "warn"); return; }
  if (!canHold(player, ground.id, ground.n)) { message(game, "You don't have enough inventory space to hold that item.", "warn"); return; }
  payRunes(game, spell); give(player, ground.id, ground.n); game.ground.splice(index, 1);
  addXp(game, "magic", spell.xp); sound(game, "spell");
  emit(game, { type: "projectile", projectile: { from: { x: ground.x, y: ground.y }, to: { x: player.x, y: player.y }, start: game.tick, end: game.tick + 1, color: "#e6ecef", style: "magic", element: "wind" } });
}
export function setStyle(game: Game, style: CombatStyle) { game.player.style = style; }
// ---------- Referrals ----------
/** Your referral code: give it to a friend who hasn't played yet. */
export const referralCode = (game: Game) => `RF-${game.player.friendId}`;
const hasItem = (game: Game, id: string) => has(game.player, id) || game.player.bank.some(slot => slot.id === id) || Object.values(game.player.equipment).includes(id);
function referralReward(game: Game) {
  const player = game.player;
  player.boostTicks += REFERRAL_TICKS; giveOrDrop(game, "coins", REFERRAL_COINS);
  if (!hasItem(game, "friendship_cape")) giveOrDrop(game, "friendship_cape");
  sound(game, "quest");
}
/** Use a friend's referral code, once. Returns an error message, or null when it worked. */
export function applyReferral(game: Game, code: string) {
  const player = game.player, match = /^\s*(?:RF-?)?\s*#?(\d{1,15})\s*$/i.exec(code), id = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) return "That isn't a referral code. They look like RF-1234.";
  if (id === player.friendId) return "That's your own code! Give it to a friend instead.";
  if (player.referredBy !== null) return `You've already used Friend #${player.referredBy}'s code.`;
  if (player.referrals.includes(id)) return `Friend #${id} used your code, so you can't use theirs.`;
  player.referredBy = id; referralReward(game);
  message(game, `Referral used! You and Friend #${id} each get 250 coins, a Friendship cape and +15% XP for an hour of play. They get theirs next time you're both online.`, "quest");
  return null;
}
/**
 * A player who used our code is online with us: reward us (once per Friend, and at most five Friends in any 24 hours;
 * past that, they're credited the next time we're online together after the day has rolled on).
 */
export function creditReferral(game: Game, from: number, now = Date.now()) {
  const player = game.player;
  if (from === player.friendId || player.referrals.includes(from) || player.referredBy === from || player.referrals.length >= 500) return false;
  player.referralTimes = player.referralTimes.filter(at => now - at < DAY_MS && at <= now);
  if (player.referralTimes.length >= REFERRALS_PER_DAY) {
    if (!player.referralCapNoted) { player.referralCapNoted = true; message(game, `Friend #${from} used your referral code! You've had ${REFERRALS_PER_DAY} referral rewards today; theirs will be waiting next time you're both online tomorrow.`, "info"); }
    return false;
  }
  player.referralCapNoted = false;
  player.referrals.push(from); player.referralTimes.push(now); referralReward(game);
  message(game, `Friend #${from} joined with your referral code! +250 coins, +15% XP for an hour of play${player.referrals.length === 1 ? ", and a Friendship cape" : ""}.`, "quest");
  return true;
}

// ---------- Shared fights ----------
/** The monster you're fighting right now, to tell other players (the same monster has the same uid in every game). */
export function currentFight(game: Game) {
  const player = game.player, monster = (player.combat !== null ? monsterByUid(game, player.combat) : null) ?? game.monsters.find(entry => entry.target && !entry.dead) ?? null;
  return monster ? { u: monster.uid, id: monster.def.id, hp: monster.hp, x: monster.x, y: monster.y } : null;
}
/**
 * Another player is fighting a monster: our copy takes the lower of the two HPs (so both players' hits count), and
 * if it isn't fighting us it walks over to where theirs is. If their hits finish it, it dies here without loot for us.
 */
export function syncMonster(game: Game, fight: { u: number; id: string; hp: number; x: number; y: number }, by: number) {
  let monster = game.monsters.find(entry => entry.uid === fight.u && entry.def.id === fight.id);
  if (!monster && fight.u >= TWIN_BASE) { const npc = game.npcs.find(entry => entry.uid === fight.u - TWIN_BASE && SOLDIERS[entry.id]?.id === fight.id); monster = npc ? drawSteel(game, npc) ?? undefined : undefined; }
  if (!monster || monster.dead || game.tick - (monster.bornAt ?? -99) < 8) return;
  if (!monster.target) {
    const far = Math.max(Math.abs(monster.x - fight.x), Math.abs(monster.y - fight.y));
    if (far > 3) { monster.prev = { x: fight.x, y: fight.y }; monster.x = fight.x; monster.y = fight.y; }
    else if (far > 0) stepMonsterToward(game, monster, { x: fight.x, y: fight.y });
  }
  const hp = Math.max(0, Math.min(monster.def.hp, Math.floor(fight.hp)));
  if (hp >= monster.hp) return;
  emit(game, { type: "hit", on: "monster", uid: monster.uid, damage: monster.hp - hp, tick: game.tick });
  monster.hp = hp;
  if (hp > 0) return;
  // A world boss pays everyone who wounded it.
  if (monster.def.worldBoss && monster.mine) { message(game, `Friend #${by} lands the final blow, and the ${monster.def.name.replace(/^The /, "")} falls!`, "quest"); killMonster(game, monster); return; }
  monster.dead = true; monster.target = false; monster.respawnAt = game.tick + monster.def.respawn;
  if (game.player.combat === monster.uid) { game.player.combat = null; game.player.queuedSpell = null; }
  creature(game, monster, "death");
  message(game, `Friend #${by} finished off the ${monster.def.name.toLowerCase()}.`);
}

// ---------- Emotes ----------
/** Why you can't perform an emote (null if you can). */
export function emoteProblem(game: Game, id: string) {
  const emote = EMOTES.find(entry => entry.id === id);
  if (!emote) return "You don't know that emote.";
  if (emote.id === "skillcape" && !item(game.player.equipment.cape ?? "coins").mastery) return "You need to be wearing a mastery cape to perform this emote.";
  if (emote.id === "friendship" && game.player.equipment.cape !== "friendship_cape") return "You need to be wearing the Friendship cape to perform this emote.";
  return null;
}
/** Perform an emote: you stop where you are for its length. */
export function performEmote(game: Game, id: string) {
  const player = game.player, problem = emoteProblem(game, id), emote = EMOTES.find(entry => entry.id === id);
  if (problem || !emote) { message(game, problem ?? "You can't do that.", "warn"); return false; }
  if (player.combat !== null) { message(game, "You're a bit busy for that.", "warn"); return false; }
  player.path = []; player.activity = null; player.target = null;
  player.emote = { id, start: game.tick, until: game.tick + emote.ticks }; onEmoteUsed(game, id);
  if (id === "skillcape") sound(game, "quest"); else if (id === "cheer" || id === "jump") sound(game, "level");
  return true;
}

// ---------- Dialogue ----------
/** Click to continue: the next line, then the options (if any), then the end. */
export function continueDialogue(game: Game) {
  const dialogue = game.dialogue;
  if (!dialogue || dialogueAtOptions(dialogue)) return;
  if (dialogue.index < dialogue.lines.length - 1 || dialogue.options?.length) { dialogue.index++; return; }
  game.dialogue = null; dialogue.onEnd?.();
}
export function chooseOption(game: Game, index: number) {
  const dialogue = game.dialogue;
  const option = dialogue?.options?.[index];
  if (!dialogue || !option || !dialogueAtOptions(dialogue)) return;
  game.dialogue = null;
  const next = option.then();
  if (next) game.dialogue = next;
}
/** Options show after the last line has been read. */
export const dialogueAtOptions = (dialogue: Dialogue) => dialogue.index >= dialogue.lines.length && !!dialogue.options?.length;

// ---------- Shops ----------
export function buyPrice(game: Game, id: string) { const fixed = item(id).price; return fixed ?? Math.max(1, Math.ceil(item(id).value * SHOP_BUY * (game.player.familyId === 2 ? 0.9 : 1))); }
/** Skills at 99. */
export const masteredSkills = (game: Game) => SKILLS.filter(skill => level(game, skill) >= 99);
/** Why you can't buy a mastery cape yet (null if you can). */
/** Why you can't buy something from a shop yet (a mastery cape before 99, the Order's weapons before its quests), or null. */
export function capeProblem(game: Game, id: string) {
  if ((ARMOURY_FIRST as readonly string[]).includes(id) && !questDone(game, "dawn_vigil")) return "The Order only arms those who've kept the Dawn Vigil.";
  if ((ARMOURY_LATER as readonly string[]).includes(id) && !questDone(game, "greyhorn_light")) return "The Order keeps these for those who brought the Dawnstone home.";
  if (DAWNPLATE_QUEST[id] && !questDone(game, DAWNPLATE_QUEST[id])) return "Dawnplate is earned in the Order's service before it's sold.";
  const mastery = item(id).mastery;
  if (!mastery) return null;
  if (mastery.skill === "all") return masteredSkills(game).length === SKILLS.length ? null : "The Grandmaster's cape is for Friends who've mastered every skill.";
  return level(game, mastery.skill) >= 99 ? null : `You need level 99 ${SKILL_NAMES[mastery.skill]} for this cape.`;
}
function buyCape(game: Game, id: string) {
  const player = game.player, mastery = item(id).mastery!, problem = capeProblem(game, id), price = buyPrice(game, id);
  if (problem) { message(game, problem, "warn"); return 0; }
  if (count(player, "coins") < price) { message(game, `A mastery cape costs ${price.toLocaleString()} coins.`, "warn"); return 0; }
  if (freeSlots(player) === 0) { message(game, "You don't have enough inventory space.", "warn"); return 0; }
  // Master more than one skill and your capes come trimmed.
  const given = mastery.skill !== "all" && masteredSkills(game).length > 1 ? `${mastery.skill}_cape_t` : id;
  take(player, "coins", price); give(player, given);
  message(game, `The Keeper of Capes hands you the ${item(given).name}. Wear it with pride.`, "quest"); sound(game, "quest");
  return 1;
}
/** What a shop pays: merchants pay more for the goods they deal in. */
export function sellPrice(id: string, shopId?: string) {
  const shop = shopId ? SHOPS[shopId] : undefined, special = shop?.buys?.includes(itemCategory(id));
  return Math.floor(item(id).value * (special ? shop!.rate ?? SHOP_SELL : SHOP_SELL));
}
/** Whether a shop will buy an item. */
export const shopBuys = (shopId: string, id: string) => { const shop = SHOPS[shopId]; return !!shop && (shop.general || shop.stock.includes(id) || !!shop.buys?.includes(itemCategory(id))); };
export function buy(game: Game, shopId: string, id: string, n: number) {
  const shop = SHOPS[shopId], player = game.player;
  const sold = game.shopStock[shopId]?.find(slot => slot.id === id);
  if (!shop || (!shop.stock.includes(id) && !sold)) return 0;
  if (item(id).mastery) return buyCape(game, id);
  const locked = capeProblem(game, id);
  if (locked) { message(game, locked, "warn"); return 0; }
  if (!shop.stock.includes(id)) n = Math.min(n, sold!.n);
  const price = buyPrice(game, id), stackable = !!item(id).stackable, currency = shop.currency ?? "coins";
  let bought = 0;
  while (bought < n && count(player, currency) >= price && canHold(player, id)) {
    if (!stackable && freeSlots(player) === 0) break;
    take(player, currency, price); give(player, id); bought++;
    if (stackable && bought < n) {
      const more = Math.min(n - bought, Math.floor(count(player, currency) / price));
      if (more > 0) { take(player, currency, price * more); give(player, id, more); bought += more; }
      break;
    }
  }
  if (sold && !shop.stock.includes(id) && bought) { sold.n -= bought; if (sold.n <= 0) game.shopStock[shopId] = game.shopStock[shopId].filter(slot => slot !== sold); }
  if (!bought) message(game, count(player, currency) < price ? `You don't have enough ${item(currency).name.toLowerCase()}s.` : "You don't have enough inventory space.", "warn");
  else sound(game, "coins");
  return bought;
}
export function sell(game: Game, shopId: string, slotIndex: number, n: number) {
  const shop = SHOPS[shopId], player = game.player, slot = player.inventory[slotIndex];
  if (!shop || !slot) return 0;
  const definition = item(slot.id);
  if (slot.id === "coins" || definition.tradeable === false) { message(game, "You can't sell this item.", "warn"); return 0; }
  if (!shopBuys(shopId, slot.id)) { message(game, "You can't sell this item to this shop.", "warn"); return 0; }
  const id = slot.id, selling = Math.min(n, count(player, id)), price = sellPrice(id, shopId);
  take(player, id, selling); if (price * selling > 0) give(player, "coins", price * selling);
  // It goes on the shop's shelves, where you can buy it back.
  if (!shop.stock.includes(id) && selling > 0) {
    const shelf = game.shopStock[shopId] ??= [], entry = shelf.find(slot => slot.id === id);
    if (entry) entry.n += selling; else if (shelf.length < 40) shelf.push({ id, n: selling });
  }
  sound(game, "coins");
  return selling;
}

// ---------- Tablets and lamps ----------
const TABLET_PLACES = { hollow_square: "hollow_square", emberforge: "emberforge", oasis: "oasis", frostpeak: "frostpeak", pier: "pier" } as const;
export function breakTablet(game: Game, slotIndex: number) {
  const player = game.player, slot = player.inventory[slotIndex], place = slot ? item(slot.id).tablet : undefined;
  if (!slot || !place) return;
  if (isUnderground(player.y)) { message(game, "A dark force stops you from teleporting underground.", "warn"); return; }
  stopAll(game); closeInterfaces(game); take(player, slot.id, 1);
  player.activity = { kind: "teleport", to: game.world.places[TABLET_PLACES[place]], timer: 2, spell: `tablet:${place}` };
  message(game, "You break the tablet. The Realm folds around you…"); sound(game, "spell");
}
/** Rub a lamp of insight: 100 × your level in a skill of your choice. */
export function rubLamp(game: Game, slotIndex: number, skill: Skill) {
  const player = game.player;
  game.ui.lamp = null;
  if (player.inventory[slotIndex]?.id !== "insight_lamp") return 0;
  const xp = 100 * level(game, skill);
  take(player, "insight_lamp", 1); addXp(game, skill, xp, { raw: true });
  message(game, `The lamp glows. You gain ${xp.toLocaleString()} ${SKILL_NAMES[skill]} XP.`, "level");
  return xp;
}

// ---------- Rare Market (RF bundles, simulated) ----------
/** Wardrobe pieces the Tailor's pick can give: up to Moonlit tier, ones you don't have yet. */
export const tailorChoices = (game: Game) => WARDROBE.filter(piece => piece.tier <= 2 && !game.player.wardrobe.includes(piece.id));
/** Hand over a bundle's goods (its caskets were already bought through the simulated ledger). */
export function grantBundle(game: Game, id: string, pick?: string) {
  const player = game.player, bundle = RF_BUNDLES.find(entry => entry.id === id);
  if (!bundle) return false;
  switch (bundle.id) {
    case "traveller": for (const place of Object.keys(TABLET_PLACES)) giveOrDrop(game, `tablet_${place}`, 2); break;
    case "hamper": giveOrDrop(game, "inkshark", 10); giveOrDrop(game, "cake", 5); break;
    case "insight": giveOrDrop(game, "insight_lamp"); break;
    case "contract": addSlayerPoints(game, 40); break;
    case "archer": giveOrDrop(game, "maple_bow"); giveOrDrop(game, "moonsilver_arrow", 300); break;
    case "sigils": for (const sigil of ["breeze_sigil", "tide_sigil", "stone_sigil", "ember_sigil", "thought_sigil"]) giveOrDrop(game, sigil, 300); giveOrDrop(game, "hollow_sigil", 30); break;
    case "fletcher": giveOrDrop(game, "arrow_shaft", 600); giveOrDrop(game, "feather", 600); giveOrDrop(game, "ashsteel_arrowheads", 300); break;
    case "dragonslayer": giveOrDrop(game, "wyrmward_shield"); giveOrDrop(game, "drakehide_vest"); giveOrDrop(game, "inkshark", 20); giveOrDrop(game, "rarite_arrow", 200); break;
    case "tailor": {
      const piece = tailorChoices(game).find(entry => entry.id === pick) ?? tailorChoices(game)[0];
      if (piece) { player.wardrobe.push(piece.id); toggleWorn(game, piece.id); message(game, `Wardrobe unlocked: ${piece.name}!`, "level"); }
      else giveOrDrop(game, "coins", 5000);
      break;
    }
  }
  player.questData.rf_bundles = (player.questData.rf_bundles ?? 0) + 1;
  message(game, `Rare Market: ${bundle.name} delivered, with ${bundle.caskets} Rare Casket${bundle.caskets > 1 ? "s" : ""} to open.`, "quest"); sound(game, "coins");
  return true;
}

// ---------- Rare Caskets (RF chance game, simulated) ----------
export function setRelics(game: Game, counts: readonly number[]) { game.player.relics = [0, 1, 2, 3].map(index => Math.max(0, Math.min(99, counts[index] ?? 0))); }
/** Each opened casket grants a wardrobe piece of its tier (or coins for duplicates). */
export function collectFromCasket(game: Game, tier: number): { wardrobe: WardrobeId | null; coins: number } {
  const player = game.player, options = WARDROBE.filter(entry => entry.tier === tier && !player.wardrobe.includes(entry.id));
  if (options.length) {
    const pick = options[Math.floor(game.rng() * options.length)];
    player.wardrobe.push(pick.id); if (!player.worn.some(id => WARDROBE.find(entry => entry.id === id)?.kind === pick.kind)) player.worn.push(pick.id);
    message(game, `Wardrobe unlocked: ${pick.name}!`, "level"); return { wardrobe: pick.id, coins: 0 };
  }
  const coins = [250, 600, 1500, 5000][tier] ?? 250;
  giveOrDrop(game, "coins", coins); message(game, `A duplicate wardrobe piece turns into ${coins} coins.`); return { wardrobe: null, coins };
}
/** Dress your follower from your own wardrobe: one piece of each kind. */
export function toggleFollowerWorn(game: Game, id: WardrobeId) {
  const player = game.player, entry = WARDROBE.find(piece => piece.id === id);
  if (!entry || !player.wardrobe.includes(id)) return;
  if (player.followerWorn.includes(id)) { player.followerWorn = player.followerWorn.filter(worn => worn !== id); return; }
  player.followerWorn = player.followerWorn.filter(worn => WARDROBE.find(piece => piece.id === worn)?.kind !== entry.kind);
  player.followerWorn.push(id);
}
export function toggleWorn(game: Game, id: WardrobeId) {
  const player = game.player, entry = WARDROBE.find(piece => piece.id === id);
  if (!entry || !player.wardrobe.includes(id)) return;
  if (player.worn.includes(id)) { player.worn = player.worn.filter(worn => worn !== id); return; }
  player.worn = player.worn.filter(worn => WARDROBE.find(piece => piece.id === worn)?.kind !== entry.kind);
  player.worn.push(id);
}

// ---------- Followers (owned Friends) ----------
export type OwnedFriend = { id: number; generation: number | null };
export function setFollower(game: Game, friend: OwnedFriend | null) {
  const player = game.player;
  player.follower = friend?.id ?? null; player.followerGeneration = friend?.generation ?? null; game.pet = null;
  if (friend) player.petOut = null;
  if (friend) updatePet(game);
  if (friend) message(game, `Friend #${friend.id} follows you now.`, "info");
}

// ---------- Pets ----------
/** A chance at a pet on a successful action (luckier at higher levels: up to three times the odds at 99). */
export function rollPet(game: Game, id: string, skillLevel: number) {
  const pet = PETS.find(entry => entry.id === id), player = game.player;
  if (!pet || player.pets.includes(id) || game.rng() >= (1 + Math.min(99, skillLevel) / 50) / pet.odds) return false;
  player.pets.push(id);
  message(game, `You have a funny feeling like you're being followed... ${pet.name} has joined you!`, "quest"); sound(game, "rare");
  if (player.follower === null && !player.petOut) { player.petOut = id; game.pet = null; updatePet(game); }
  return true;
}
/** Call a pet you've found to follow you (instead of a Friend), or send it home. */
export function setPet(game: Game, id: string | null) {
  const player = game.player;
  if (id && !player.pets.includes(id)) return;
  player.petOut = id; game.pet = null;
  if (id) { player.follower = null; player.followerGeneration = null; updatePet(game); message(game, `${PETS.find(pet => pet.id === id)!.name} follows you now.`, "info"); }
}

// ---------- Mounts ----------
/** Why you can't ride here (null if you can): not underground, and not upstairs. */
export function rideProblem(game: Game) {
  const player = game.player;
  if (isUnderground(player.y)) return "There's no room to ride down here.";
  if (player.y >= FLOOR_Y) return "You can't ride a horse up the stairs.";
  return null;
}
/** Get on a mount you own (the last one you rode, or `id`), or off the one you're on. */
/** A first ride, and a first 99, are things your Friend remembers. */
function friendMilestones(game: Game) {
  const player = game.player, mastered = masteredSkills(game).length;
  if (mastered > (player.stats.mastered ?? 0)) { player.stats.mastered = mastered; remember(game, "first_99"); friendSays(game, "mastery"); }
}
export function toggleMount(game: Game, id?: string) {
  const player = game.player;
  if (player.mount && (!id || id === player.mount)) { message(game, `You climb down from your ${mountDef(player.mount)!.name.toLowerCase()}.`); player.mount = null; sound(game, "click"); return; }
  const choice = id ?? player.lastMount ?? player.mounts[0];
  if (!choice || !player.mounts.includes(choice)) { message(game, "You don't own a mount. The Friendhollow stables sell them.", "warn"); return; }
  const problem = rideProblem(game);
  if (problem) { message(game, problem, "warn"); return; }
  player.mount = choice; player.lastMount = choice; player.emote = null; player.sneak = false;
  remember(game, "first_mount"); friendSays(game, "mount");
  message(game, `You mount your ${mountDef(choice)!.name.toLowerCase()}.`); sound(game, "whinny");
}
/** A new mount from the stables (bought with RF); you ride it straight away where you can. */
export function grantMount(game: Game, id: string) {
  const player = game.player, mount = mountDef(id);
  if (!mount) return;
  if (!player.mounts.includes(id)) player.mounts.push(id);
  message(game, `The stablemaster leads out your ${mount.name.toLowerCase()}. ${mount.text}`, "quest"); sound(game, "level");
  if (!rideProblem(game)) { player.mount = id; player.lastMount = id; }
}
/** While riding: climb down where a horse can't go, and a gentle mount's healing. */
function rideUpkeep(game: Game) {
  const player = game.player, mount = riding(player);
  if (!mount) return;
  if (rideProblem(game)) { player.mount = null; message(game, `You leave your ${mount.name.toLowerCase()} to graze and go on foot.`); return; }
  if (mount.heal && game.tick % mount.heal === 0 && player.hp > 0 && player.hp < maxHp(player)) player.hp++;
}

/**
 * The follower walks like an old-school pet: it steps onto the tile you just left (two when you run),
 * waits beside you when you stop, and finds its way back to your side after a teleport.
 */
function updatePet(game: Game) {
  const player = game.player;
  if (player.follower === null && !player.petOut) { game.pet = null; return; }
  const pet = game.pet;
  const beside = () => {
    const behind = game.trail[game.trail.length - 1];
    if (behind && Math.max(Math.abs(behind.x - player.x), Math.abs(behind.y - player.y)) === 1 && canWalk(game, behind.x, behind.y)) return behind;
    for (const [dx, dy] of [[-player.heading.x, -player.heading.y], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if ((dx || dy) && canWalk(game, player.x + dx, player.y + dy)) return { x: player.x + dx, y: player.y + dy };
    return { x: player.x, y: player.y };
  };
  if (!pet) { const at = beside(); game.pet = { x: at.x, y: at.y, prev: { ...at }, heading: { ...player.heading }, moved: 0 }; return; }
  const far = Math.max(Math.abs(pet.x - player.x), Math.abs(pet.y - player.y));
  if (far > 4) { const at = beside(); pet.prev = { ...at }; pet.x = at.x; pet.y = at.y; pet.moved = game.tick - 10; return; }
  if (player.moved === game.tick && game.trail.length) {
    const target = game.trail[game.trail.length - 1];
    if (target.x !== pet.x || target.y !== pet.y) {
      pet.prev = { x: pet.x, y: pet.y }; pet.heading = headingTo(target.x - pet.x, target.y - pet.y, pet.heading);
      pet.x = target.x; pet.y = target.y; pet.moved = game.tick;
    }
  } else if (far === 0) {
    const at = beside(); pet.prev = { x: pet.x, y: pet.y }; pet.x = at.x; pet.y = at.y; pet.moved = game.tick;
  } else if (player.moved !== game.tick) pet.heading = headingTo(player.x - pet.x, player.y - pet.y, pet.heading);
}

// ---------- Saves ----------
export const SAVE_VERSION = 1;
export type SaveData = {
  v: 1; friendId: number; x: number; y: number; run: boolean;
  /** 2: positions are in the wider world's coordinates (older saves are in the mainland's own, and are moved on load). */
  world?: number; energy: number; xp: Record<string, number>; hp: number; prayer: number;
  inventory: (Slot | null)[]; equipment: Record<string, string>; bank: BankSlot[]; style: CombatStyle; autocast: string | null;
  quests: Record<string, number>; questData: Record<string, number>; wardrobe: string[]; worn: string[]; follower: number | null; followerGeneration: number | null;
  kills: number; deaths: number; tutorial: number; guide?: number; created: number; playTicks: number; retaliate: boolean; music: string[];
  met?: unknown; achievements?: Record<string, number>; pets?: string[]; petOut?: string | null; killLog?: Record<string, number>; lore?: Record<string, unknown>; stats?: Record<string, number>; referredBy?: number | null; referrals?: number[]; referralTimes?: number[]; boostTicks?: number; coalBag?: number; stoneBox?: number; boneBag?: Record<string, number>;
  boosts?: Record<string, number>; poison?: { damage: number; left: number; timer: number } | null; weaponPoison?: { weapon: string; damage: number; charges: number; weaken: boolean } | null;
  antidoteUntil?: number; antifireUntil?: number; stealthUntil?: number; tonicUntil?: number; mixture?: { family: number; until: number } | null;
  firsts?: Record<string, number>; friendKinds?: Record<string, 1>; rumours?: Record<string, 1>; orders?: Record<string, WorkOrder>; card?: Record<string, string>; cards?: Record<string, number>; rarian?: boolean; home?: unknown; restedTicks?: number; sigilBag?: Record<string, number>; ward?: { defence: number; flat: number; reduce: number } | null; wardUntil?: number; renew?: number; renewUntil?: number; belts?: Record<string, Record<string, number>>; followerWorn?: string[];
  name?: string | null; fellowship?: { name: string; tag: string; logo?: string; banner?: string; colors?: string[] } | null; title?: string | null; visited?: Record<string, number>; regionTicks?: Record<string, number>; talked?: Record<string, 1>; emotesUsed?: Record<string, 1>; outfits?: Record<string, 1>; friendTicks?: number; mounts?: string[]; mount?: string | null; daily?: unknown; seenUpdate?: number;
};
export function serialize(game: Game): SaveData {
  const player = game.player;
  return {
    v: 1, world: 3, friendId: player.friendId, x: player.x, y: player.y, run: player.run, energy: Math.round(player.energy), xp: { ...player.xp }, hp: player.hp, prayer: Math.round(player.prayer * 10) / 10,
    inventory: player.inventory.map(slot => slot ? { ...slot } : null), equipment: { ...player.equipment } as Record<string, string>, bank: player.bank.map(slot => ({ ...slot })),
    style: player.style, autocast: player.autocast, quests: { ...player.quests }, questData: { ...player.questData }, wardrobe: [...player.wardrobe], worn: [...player.worn],
    follower: player.follower, followerGeneration: player.followerGeneration, kills: player.kills, deaths: player.deaths, tutorial: player.tutorial, guide: player.guide, created: player.created,
    playTicks: game.playTicks, retaliate: game.autoRetaliate, music: [...player.music],
    referredBy: player.referredBy, referrals: [...player.referrals], referralTimes: [...player.referralTimes], boostTicks: player.boostTicks, coalBag: player.coalBag, stoneBox: player.stoneBox, boneBag: { ...player.boneBag }, boosts: { ...player.boosts }, poison: player.poison ? { ...player.poison } : null, weaponPoison: player.weaponPoison ? { ...player.weaponPoison } : null,
    antidoteUntil: Math.max(0, player.antidoteUntil - game.tick), antifireUntil: Math.max(0, player.antifireUntil - game.tick), stealthUntil: Math.max(0, player.stealthUntil - game.tick), tonicUntil: Math.max(0, player.tonicUntil - game.tick), mixture: player.mixture ? { family: player.mixture.family, until: Math.max(0, player.mixture.until - game.tick) } : null,
    firsts: { ...player.firsts } as Record<string, number>, friendKinds: { ...player.friendKinds } as Record<string, 1>, rumours: { ...player.rumours } as Record<string, 1>, orders: { ...player.orders }, card: { ...player.card }, cards: { ...player.cards }, rarian: player.rarian, home: player.home ? { ...player.home, furniture: { ...player.home.furniture } } : null, restedTicks: player.restedTicks, sigilBag: { ...player.sigilBag }, ward: player.ward ? { ...player.ward } : null, wardUntil: Math.max(0, player.wardUntil - game.tick), renew: player.renew, renewUntil: Math.max(0, player.renewUntil - game.tick), belts: Object.fromEntries(Object.entries(player.belts).map(([id, contents]) => [id, { ...contents }])), followerWorn: [...player.followerWorn],
    name: player.name, fellowship: player.fellowship ? { ...player.fellowship } : null, title: player.title, visited: { ...player.visited } as Record<string, number>, regionTicks: { ...player.regionTicks } as Record<string, number>, talked: { ...player.talked } as Record<string, 1>, emotesUsed: { ...player.emotesUsed } as Record<string, 1>, outfits: { ...player.outfits } as Record<string, 1>, friendTicks: player.friendTicks, mounts: [...player.mounts], mount: player.mount, met: JSON.parse(JSON.stringify(player.met)), achievements: { ...player.achievements }, pets: [...player.pets], petOut: player.petOut, killLog: { ...player.killLog }, lore: Object.fromEntries(Object.entries(player.lore).map(([id, entry]) => [id, { ...entry, d: [...entry.d] }])), stats: { ...player.stats }, daily: JSON.parse(JSON.stringify(player.daily)), seenUpdate: player.seenUpdate,
  };
}
/** Every quest the Realm has (so a save keeps them all: the hand-kept list this used to be lost the dungeon, Ring, Orders and Maidens quests on reload). */
const QUEST_IDS = QUESTS.map(quest => quest.id);
const int = (value: unknown, min: number, max: number, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
/** Item and spell ids from saves made before the Realm's own names (old id → new id). */
const RENAMED: Record<string, string> = {
  uncut_sapphire: "rough_moonstone", uncut_emerald: "rough_sagestone", uncut_ruby: "rough_rosestone", sapphire: "moonstone", emerald: "sagestone", ruby: "rosestone",
  amulet_of_strength: "rosestone_pendant", amulet_of_accuracy: "moonstone_pendant", holy_symbol: "friends_charm", staff_of_air: "breeze_staff",
  wizard_hat: "scholar_hat", wizard_robe: "scholar_robe", big_bones: "large_bones", leather_body: "leather_jerkin", leather_cowl: "leather_hood",
  leather_vambraces: "leather_bracers", leather_chaps: "leather_leggings", lobster_pot: "crab_pot", banana: "sweetberry", copper_ore: "pewter_ore", tin_ore: "pewter_ore",
  iron_ore: "blackiron_ore", coal: "inkcoal", mithril_ore: "moonsilver_ore", adamantite_ore: "glimmer_ore", raw_shark: "raw_inkshark", shark: "inkshark",
  air_rune: "breeze_sigil", water_rune: "tide_sigil", earth_rune: "stone_sigil", fire_rune: "ember_sigil", mind_rune: "thought_sigil", chaos_rune: "storm_sigil",
  law_rune: "path_sigil", death_rune: "hollow_sigil", nature_rune: "bloom_sigil", cosmic_rune: "star_sigil", body_rune: "shade_sigil",
  wind_strike: "breeze_dart", water_strike: "tide_dart", earth_strike: "stone_dart", fire_strike: "ember_dart", wind_bolt: "breeze_lance", water_bolt: "tide_lance",
  fire_bolt: "ember_lance", wind_blast: "breeze_burst", fire_blast: "ember_burst",
};
const RENAMED_PART: Record<string, string> = {
  bronze: "pewter", iron: "blackiron", steel: "ashsteel", mithril: "moonsilver", adamant: "glimmer", scimitar: "sabre", platebody: "cuirass", platelegs: "greaves", kiteshield: "shield",
  shrimps: "minnows", sardine: "perch", herring: "carp", trout: "char", salmon: "grayling", lobster: "inkcrab", swordfish: "sailfish",
};
export function migrateId(id: string) {
  if (isItem(String(id)) || SPELLS.some(spell => spell.id === id)) return id;
  return RENAMED[id] ?? id.replace("_full_helm", "_helm").split("_").map(part => RENAMED_PART[part] ?? part).join("_");
}
const slotOf = (value: unknown, maxN = 2_147_483_647): Slot | null => {
  if (!value || typeof value !== "object") return null;
  const { n } = value as { id?: unknown; n?: unknown }, raw = (value as { id?: unknown }).id, id = typeof raw === "string" ? migrateId(raw) : raw;
  if (!isItem(id) || typeof n !== "number" || !Number.isFinite(n) || n < 1) return null;
  const amount = int(n, 1, maxN, 0);
  if (!amount) return null;
  return { id, n: item(id).stackable ? amount : 1 };
};
/**
 * Restore a save onto a fresh game for the same Friend. Every field is checked: unknown items, impossible numbers or
 * a position you can't stand on are dropped or reset, so a tampered save can't break the game.
 */
export function restore(game: Game, raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const save = raw as Partial<SaveData>;
  if (save.v !== 1) return false;
  const player = game.player;
  if (typeof save.friendId === "number" && save.friendId !== player.friendId) return false;
  for (const skill of SKILLS) player.xp[skill] = typeof save.xp?.[skill] === "number" ? Math.max(0, Math.min(200_000_000, save.xp[skill])) : player.xp[skill];
  player.xp.hitpoints = Math.max(XP_TABLE[10], player.xp.hitpoints);
  player.hp = int(save.hp, 1, maxHp(player), maxHp(player));
  player.prayer = Math.max(0, Math.min(maxPrayer(player), typeof save.prayer === "number" ? save.prayer : maxPrayer(player)));
  player.inventory = Array.from({ length: INVENTORY_SIZE }, (_, index) => slotOf(save.inventory?.[index]));
  player.equipment = {};
  for (const slot of EQUIP_SLOTS) {
    const saved = save.equipment?.[slot], id = typeof saved === "string" ? migrateId(saved) : saved;
    if (isItem(id) && item(id).equip?.slot === slot) player.equipment[slot] = id;
  }
  const bank: BankSlot[] = [];
  for (const entry of Array.isArray(save.bank) ? save.bank.slice(0, BANK_SIZE) : []) {
    const slot = slotOf(entry);
    if (!slot) continue;
    const existing = bank.find(other => other.id === slot.id), tab = int((entry as BankSlot).tab, 0, BANK_TABS, 0);
    if (existing) existing.n += slot.n; else bank.push({ id: slot.id, n: int((entry as Slot).n, 1, 2_147_483_647, 1), ...(tab ? { tab } : {}) });
  }
  player.bank = bank; compactBankTabs(player);
  // Saves from before the wider world kept positions in the mainland's own coordinates: move them with it.
  let x = int(save.x, 0, W - 1, -1), y = int(save.y, 0, H - 1, -1);
  // 3: the far west grew the world WEST_DX columns on its west side; 2: the wider world before it; older: the mainland's own frame.
  if (save.world === 2) x += WEST_DX;
  else if (save.world !== 3 && x >= 0 && x < MAINLAND.w && y >= 0 && y < MAINLAND.h + MAINLAND.dungeonRows + MAINLAND.floorRows) [x, y] = mainlandToWorld(x, y);
  if (inBounds(x, y) && walkable(game.world, x, y)) { player.x = x; player.y = y; player.prev = { x, y }; }
  player.run = !!save.run; player.energy = int(save.energy, 0, 100, 100);
  player.style = (["accurate", "aggressive", "defensive", "controlled"] as const).includes(save.style as CombatStyle) ? save.style as CombatStyle : "accurate";
  const autocast = typeof save.autocast === "string" ? migrateId(save.autocast) : null;
  player.autocast = autocast && SPELLS.some(spell => spell.id === autocast && spell.maxHit) && isStaffEquipped(player) ? autocast : null;
  player.quests = {}; player.questData = {};
  for (const id of QUEST_IDS) { const value = int(save.quests?.[id], 0, 4, 0); if (value) player.quests[id] = value; }
  for (const [key, value] of Object.entries(save.questData ?? {})) if (/^[a-z_]{1,24}$/.test(key)) player.questData[key] = int(value, 0, 1000, 0);
  player.wardrobe = (save.wardrobe ?? []).filter((id): id is WardrobeId => WARDROBE.some(entry => entry.id === id)).filter((id, index, list) => list.indexOf(id) === index);
  player.worn = (save.worn ?? []).filter((id): id is WardrobeId => player.wardrobe.includes(id as WardrobeId));
  player.follower = typeof save.follower === "number" && Number.isSafeInteger(save.follower) && save.follower > 0 ? save.follower : null;
  player.followerGeneration = player.follower !== null ? int(save.followerGeneration, 1, 255, 6) : null;
  player.kills = int(save.kills, 0, 1e9, 0); player.deaths = int(save.deaths, 0, 1e9, 0); player.tutorial = int(save.tutorial, 0, 100, 0);
  // Saves from before the guided start have played already: it counts as done.
  player.guide = save.guide === undefined ? FIRST_STEPS.length : int(save.guide, -1, FIRST_STEPS.length, FIRST_STEPS.length);
  player.created = int(save.created, 0, 1e15, Date.now());
  game.playTicks = int(save.playTicks, 0, 1e10, 0); game.autoRetaliate = save.retaliate !== false;
  player.music = ["theme", ...(Array.isArray(save.music) ? save.music : []).filter((id): id is string => typeof id === "string" && /^[a-z_]{1,24}$/.test(id) && id !== "theme")].slice(0, 32);
  const friendNumber = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value < 1e15 && value !== player.friendId ? value : null;
  player.referredBy = friendNumber(save.referredBy);
  player.referrals = [...new Set((Array.isArray(save.referrals) ? save.referrals : []).map(friendNumber).filter((id): id is number => id !== null))].slice(0, 500);
  player.boostTicks = int(save.boostTicks, 0, REFERRAL_TICKS * 50, 0);
  player.coalBag = int(save.coalBag, 0, SATCHEL_SIZE, 0);
  player.stoneBox = int(save.stoneBox, 0, STONE_BOX_SIZE, 0);
  player.boneBag = {};
  for (const [id, n] of Object.entries(save.boneBag && typeof save.boneBag === "object" ? save.boneBag : {})) {
    if (isItem(id) && item(id).bones) bagAdd(player, id, int(n, 0, BONE_BAG_SIZE, 0));
  }
  // Apothecary: boosts, poisons and protections (saved as ticks left; the game's own tick starts over).
  player.boosts = {};
  for (const [skill, n] of Object.entries(save.boosts && typeof save.boosts === "object" ? save.boosts : {})) if ((SKILLS as readonly string[]).includes(skill) && int(n, 0, 40, 0) > 0) player.boosts[skill as Skill] = int(n, 0, 40, 0);
  const sp = save.poison; player.poison = sp && typeof sp === "object" && int(sp.left, 0, 4, 0) > 0 ? { damage: int(sp.damage, 1, 20, 1), left: int(sp.left, 1, 4, 1), timer: int(sp.timer, 1, 10, 10) } : null;
  const wp = save.weaponPoison; player.weaponPoison = wp && typeof wp === "object" && typeof wp.weapon === "string" && isItem(wp.weapon) && int(wp.charges, 0, 30, 0) > 0 ? { weapon: wp.weapon, damage: int(wp.damage, 1, 20, 1), charges: int(wp.charges, 1, 30, 1), weaken: !!wp.weaken } : null;
  player.antidoteUntil = game.tick + int(save.antidoteUntil, 0, 1000, 0); player.antifireUntil = game.tick + int(save.antifireUntil, 0, 1000, 0);
  player.stealthUntil = game.tick + int(save.stealthUntil, 0, 1000, 0); player.tonicUntil = game.tick + int(save.tonicUntil, 0, 1000, 0);
  const mx = save.mixture; player.mixture = mx && typeof mx === "object" && int(mx.until, 0, 1000, 0) > 0 ? { family: int(mx.family, 0, FAMILY_NAMES.length - 1, 0), until: game.tick + int(mx.until, 0, 1000, 0) } : null;
  // Presence.
  player.name = cleanName(save.name); const fs = save.fellowship; player.fellowship = fs && typeof fs === "object" && cleanName(fs.name) && cleanTag(fs.tag) ? cleanFellowshipLook({ name: cleanName(fs.name)!, tag: cleanTag(fs.tag)! }, fs) : null;
  player.title = typeof save.title === "string" && /^[a-z_]{1,24}$/.test(save.title) ? save.title : null;
  const keyed = <T,>(raw: unknown, value: (v: unknown) => T | null, limit = 400): Partial<Record<string, T>> => Object.fromEntries(Object.entries(raw && typeof raw === "object" ? raw as Record<string, unknown> : {}).filter(([key]) => /^[a-z0-9_]{1,32}$/.test(key)).slice(0, limit).flatMap(([key, v]) => { const clean = value(v); return clean === null ? [] : [[key, clean]]; }));
  player.visited = keyed(save.visited, v => typeof v === "number" ? int(v, 1, 1e9, 1) : null); player.regionTicks = keyed(save.regionTicks, v => typeof v === "number" ? int(v, 0, 1e9, 0) : null);
  player.talked = keyed(save.talked, () => 1 as const); player.emotesUsed = keyed(save.emotesUsed, () => 1 as const); player.outfits = keyed(save.outfits, () => 1 as const, 2000);
  player.friendTicks = int(save.friendTicks, 0, 1e9, 0);
  player.firsts = keyed(save.firsts, v => typeof v === "number" ? int(v, 0, 1e6, 0) : null); player.friendKinds = keyed(save.friendKinds, () => 1 as const); player.rumours = keyed(save.rumours, () => 1 as const);
  player.referralTimes = (Array.isArray(save.referralTimes) ? save.referralTimes : []).filter((at): at is number => typeof at === "number" && Number.isFinite(at) && at > 0).slice(-REFERRALS_PER_DAY);
  player.mounts = MOUNTS.filter(mount => Array.isArray(save.mounts) && save.mounts.includes(mount.id)).map(mount => mount.id);
  player.mount = typeof save.mount === "string" && player.mounts.includes(save.mount) ? save.mount : null;
  player.daily = cleanDaily(save.daily, SKILLS); player.orders = cleanOrders(save.orders); player.card = cleanCard(save.card); player.cards = Object.fromEntries(Object.entries(save.cards && typeof save.cards === "object" ? save.cards : {}).filter(([id, day]) => /^[a-z0-9_]{1,40}$/.test(id) && typeof day === "number" && Number.isFinite(day)).slice(0, 2000).map(([id, day]) => [id, Math.max(0, Math.floor(day))])); player.rarian = save.rarian === true; player.home = cleanHome(save.home); player.restedTicks = int(save.restedTicks, 0, 100000, 0); applyHome(game);
  player.sigilBag = {}; for (const [id, n] of Object.entries(save.sigilBag ?? {})) if (isItem(id) && isSigil(id)) { const v = int(n, 0, SIGIL_BAG_SIZE, 0); if (v) player.sigilBag[id] = v; }
  player.ward = save.ward && typeof save.ward === "object" ? { defence: Math.max(0, Math.min(1, Number(save.ward.defence) || 0)), flat: int(save.ward.flat, 0, 100, 0), reduce: Math.max(0, Math.min(0.9, Number(save.ward.reduce) || 0)) } : null; player.wardUntil = game.tick + int(save.wardUntil, 0, 1000, 0); if (!int(save.wardUntil, 0, 1000, 0)) player.ward = null;
  player.renew = int(save.renew, 0, 50, 0); player.renewUntil = game.tick + int(save.renewUntil, 0, 1000, 0);
  player.belts = {}; for (const belt of BELTS) { const raw = save.belts?.[belt.id]; if (!raw || typeof raw !== "object") continue; for (const [id, n] of Object.entries(raw)) if (isItem(id) && belt.group(id)) beltAdd(player, belt, id, int(n, 0, 100000, 0)); }
  player.followerWorn = (save.followerWorn ?? []).filter((id): id is WardrobeId => player.wardrobe.includes(id as WardrobeId));
  player.met = cleanMet(save.met);
  player.achievements = Object.fromEntries(Object.entries(save.achievements && typeof save.achievements === "object" ? save.achievements : {}).filter(([id, day]) => /^[a-z0-9_]{1,32}$/.test(id) && typeof day === "number" && Number.isFinite(day)).slice(0, 100).map(([id, day]) => [id, Math.floor(day as number)]));
  player.pets = PETS.filter(pet => Array.isArray(save.pets) && save.pets.includes(pet.id)).map(pet => pet.id);
  player.petOut = typeof save.petOut === "string" && player.pets.includes(save.petOut) && player.follower === null ? save.petOut : null;
  player.stats = Object.fromEntries(Object.entries(save.stats && typeof save.stats === "object" ? save.stats : {}).filter(([key, n]) => /^[a-zA-Z]{1,24}$/.test(key) && typeof n === "number" && Number.isFinite(n)).slice(0, 40).map(([key, n]) => [key, Math.max(0, Math.min(1e9, Math.floor(n as number)))]));
  player.killLog = Object.fromEntries(Object.entries(save.killLog && typeof save.killLog === "object" ? save.killLog : {}).filter(([id, n]) => id in MONSTERS && typeof n === "number" && Number.isFinite(n)).map(([id, n]) => [id, Math.max(0, Math.min(1e7, Math.floor(n as number)))]));
  // The Pursuance journal: creatures that exist, facts and tricks as bits, drops that are items (forty at most), counts kept sane.
  player.lore = Object.fromEntries(Object.entries(save.lore && typeof save.lore === "object" ? save.lore : {}).filter(([id, entry]) => id in MONSTERS && entry && typeof entry === "object").slice(0, 600).map(([id, raw]) => {
    const entry = raw as Record<string, unknown>, n = (value: unknown, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
    return [id, { k: n(entry.k, 63), a: n(entry.a, 255), d: Array.isArray(entry.d) ? entry.d.filter((drop): drop is string => typeof drop === "string" && isItem(drop)).slice(0, 40) : [], t: n(entry.t, 1e6), m: n(entry.m, 1e6), r: n(entry.r, 3) }];
  }));
  // Saves from before the update log see it from the start.
  player.seenUpdate = int(save.seenUpdate, 0, 1e6, 0);
  return true;
}

// ---------- Music unlocks ----------
/** Visiting an area unlocks its track, old-school style. Returns true the first time. */
export function unlockMusic(game: Game, id: string, name: string) {
  if (game.player.music.includes(id)) return false;
  game.player.music.push(id);
  message(game, `You have unlocked a new music track: ${name}.`, "info");
  return true;
}

// ---------- Queries for the UI ----------
export const skillLevels = (game: Game) => Object.fromEntries(SKILLS.map(skill => [skill, level(game, skill)])) as Record<Skill, number>;
export const regionName = (game: Game) => regionAt(game.world, game.player.x, game.player.y).name;
export function nextLevelXp(xp: number) { const current = levelForXp(xp); return current >= 99 ? null : XP_TABLE[current + 1]; }
export const familyName = (game: Game) => FAMILY_NAMES[game.player.familyId];
export { NPCS, questDone, isWater, tileIndex };
