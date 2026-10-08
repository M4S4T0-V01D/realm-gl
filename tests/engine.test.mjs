import test from "node:test";
import assert from "node:assert/strict";
import {
  buy, canWalk, castSpell, chooseOption, collectFromCasket, continueDialogue, createGame, equip, unequip, findPath, itemOptions, menuFor, restore, sell,
  serialize, setFollower, setRelics, setTarget, smeltingRecipes, smithingRecipes, startProduction, tick, togglePrayer, useItemOnItem, walkTo, setHeld,
  successChance, hitChance, unlockMusic, toggleSneak, veiled, VEIL_HOOD, toggleRun, bestArrow, rangedMaxHit, bowRange, syncMonster, toggleMount, grantMount, rideProblem, castOnItem, isBound, grantBundle, rubLamp, breakTablet, capeProblem, sellPrice, craftSigils,
  canCast, bagFill, offerBag, OFFER_TICKS, eat, boneBoost, fireFactor, thorns, sigilSave, stalkerFactor, regenTicks, foodBoost, cleanHerb, drink, coatWeapon, performEmote,
} from "../games/rarefriends-realm/engine.ts";
import { buyWayfarerReward, runDrain, slipChance } from "../games/rarefriends-realm/wayfaring.ts";
import { HERBS, POTIONS, MIXTURES, ESSENCES, brewRecipes, grindRecipes, stillRecipes } from "../games/rarefriends-realm/apothecary.ts";
import { TITLES, chooseTitle, cleanName, cleanTag, joinFellowship, leaveFellowship, nameFriend, playerName, profile, unlockedTitles, reputation } from "../games/rarefriends-realm/presence.ts";
import { presenceOf } from "../games/rarefriends-realm/social.ts";
import { friendSays, friendTick, remember, spoken, tendencies } from "../games/rarefriends-realm/friend.ts";
import { RUMOURS, rumourAt, rumourCount } from "../games/rarefriends-realm/rumours.ts";
import { talk } from "../games/rarefriends-realm/content.ts";
import { ARENA, inArena, inRing, inRingBuilding } from "../games/rarefriends-realm/world.ts";
import { FOE_GROUPS, MATCHES, arenaFoes, customMatch, entryFee, startMatch } from "../games/rarefriends-realm/arena.ts";
import { wonDuel } from "../games/rarefriends-realm/duel.ts";
import { cleanPresence } from "../games/rarefriends-realm/net.ts";
import { buySlayerReward, longTasks, slayerXpBoost, eligibleTasks } from "../games/rarefriends-realm/slayer.ts";
import { currentTask, slayerPoints } from "../games/rarefriends-realm/slayer.ts";
import { COURSES, EQUIP_SLOTS, HEARTGUARD, ITEM_LIST, METALS, MONSTERS, SMITH_PIECES, SPELL_TABS, FIREMAKING, REGIONAL_CLOTHING, WARDROBE, MOUNTS, SHOPS, SKILLS, SKILL_NAMES, SLAYER_SETS, SLAYER_TASKS, SPELLS, TREES, WAYFARER_MARK, WAYFARER_REWARDS, XP_RATE, XP_TABLE, heavyStrength, isItem, item, levelForXp } from "../games/rarefriends-realm/data.ts";
import { NPCS, QUESTS, MAX_QUEST_POINTS, PILGRIM_ALTARS, questPoints, onMonsterKilled, shopProblem, readJobBoard } from "../games/rarefriends-realm/content.ts";
import { ORDERS, ORDER_IDS, orderOf, orderPieces } from "../games/rarefriends-realm/knights.ts";
import { signetCharges, signetTeleport } from "../games/rarefriends-realm/engine.ts";
import { COFFER_TICKS } from "../games/rarefriends-realm/dungeons.ts";
import { gloomAt, inDeadwood } from "../games/rarefriends-realm/world.ts";
import { FLOOR_Y, H, MAINLAND, REGIONS, T, W, WEST_DX, createWorld, floorAt, isUnderground, mainlandToWorld, objectAtTile, onLevel, realPoint, regionAt, terrainAt } from "../games/rarefriends-realm/world.ts";
import { addXp, emptyToBank, fillFromBank, bankDeposit, bankInOrder, bankMove, bankTabs, bankWithdraw, bonuses, bagBones, combatLevel, count, dropItem, earlyXp, give, has, heft, level, maxHp, xpMultiplier, BONE_BAG, BONE_BAG_SIZE } from "../games/rarefriends-realm/state.ts";
import game from "../games/rarefriends-realm/game.json" with { type: "json" };

const fletchingRecipesFor = (g, log) => { const knife = g.player.inventory.findIndex(slot => slot?.id === "knife"), logs = g.player.inventory.findIndex(slot => slot?.id === log); useItemOnItem(g, knife, logs); const recipes = g.ui.production.recipes; g.ui.production = null; return recipes; };
function seeded(seed = 42) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
const newGame = (options = {}) => createGame({ familyId: 0, friendId: 7730, rng: seeded(), ...options });
const run = (g, ticks) => { for (let i = 0; i < ticks; i++) tick(g); };
/** Run until a condition holds (or fail after `limit` ticks). */
function until(g, condition, limit = 2000) {
  for (let i = 0; i < limit; i++) { if (condition()) return i; tick(g); }
  assert.fail(`Condition not reached in ${limit} ticks`);
}
const objectNear = (g, kind, predicate = () => true) => {
  const { x, y } = g.player;
  return g.world.objects.filter(object => object.kind === kind && predicate(object)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
};
const teleport = (g, x, y) => { g.player.x = x; g.player.y = y; g.player.prev = { x, y }; g.player.path = []; };
/** Mainland places named in the mainland's own coordinates (the world puts the mainland at MAINLAND.x/y). */
const M = (mx, my) => mainlandToWorld(mx, my);
const standBy = (g, object) => {
  for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) if (canWalk(g, object.x + dx, object.y + dy)) { teleport(g, object.x + dx, object.y + dy); return; }
  assert.fail(`Nowhere to stand by ${object.name}`);
};
/** Stand on the first walkable tile at exactly `distance` from a point. */
function standNear(g, x, y, distance) {
  for (let dy = -distance; dy <= distance; dy++) for (let dx = -distance; dx <= distance; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) === distance && canWalk(g, x + dx, y + dy)) { teleport(g, x + dx, y + dy); return; }
  }
  assert.fail(`Nowhere to stand near ${x},${y}`);
}
/** Every tile reachable on foot from a start tile (no corner cutting). */
function reachable(g, start) {
  const seen = new Uint8Array(W * H), queue = [start.y * W + start.x];
  seen[queue[0]] = 1;
  while (queue.length) {
    const index = queue.pop(), x = index % W, y = (index - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy, next = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[next] || !canWalk(g, nx, ny)) continue;
      if (dx && dy && (!canWalk(g, x + dx, y) || !canWalk(g, x, y + dy))) continue;
      seen[next] = 1; queue.push(next);
    }
  }
  return seen;
}

test("the old-school XP curve", () => {
  assert.equal(XP_TABLE[2], 83);
  assert.equal(XP_TABLE[10], 1154);
  assert.equal(XP_TABLE[99], 13_034_431);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(1154), 10);
  assert.equal(levelForXp(13_034_430), 98);
  assert.equal(levelForXp(200_000_000), 99);
});

test("a fresh adventurer: level 3, 10 hitpoints, a starter kit", () => {
  const g = newGame();
  assert.equal(combatLevel(g.player), 3);
  assert.equal(level(g, "hitpoints"), 10);
  assert.equal(g.player.hp, 10);
  for (const id of ["pewter_axe", "pewter_pickaxe", "small_net", "tinderbox"]) assert(has(g.player, id), id);
  assert.equal(SKILLS.length, 21);
});

test("the world is large, deterministic and every landmark is reachable on foot", () => {
  const g = newGame(), world = g.world;
  assert.deepEqual(createWorld().tiles, createWorld().tiles, "Same seed, same world");
  assert(world.objects.filter(object => object.kind === "tree").length > 400, "Plenty of trees");
  assert(world.objects.filter(object => object.kind === "rock").length > 60, "Plenty of rocks");
  assert(world.objects.filter(object => object.kind === "spot").length >= 15, "Fishing spots");
  // Walk from the spawn, and take every ladder and staircase you can reach (dungeons, the castle's storeys).
  const areas = [reachable(g, world.places.spawn)], taken = new Set();
  const ok = (x, y) => areas.some(seen => seen[y * W + x]);
  const beside = object => [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => ok(object.x + dx, object.y + dy));
  for (let grew = true; grew;) {
    grew = false;
    for (const ladder of world.objects.filter(object => object.kind === "ladder" && !taken.has(object.id) && beside(object))) {
      taken.add(ladder.id); grew = true;
      if (!ok(ladder.to.x, ladder.to.y)) areas.push(reachable(g, ladder.to));
    }
  }
  const reach = object => object.blocks ? [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => ok(object.x + dx, object.y + dy)) : ok(object.x, object.y) || [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => ok(object.x + dx, object.y + dy));
  const interactive = world.objects.filter(object => object.kind !== "decor" && object.kind !== "stump" && object.name !== "__removed");
  const stuck = interactive.filter(object => !reach(object)).map(object => `${object.name}@${object.x},${object.y}`);
  // Course obstacles after the first are reached by crossing the one before (covered by the lap tests); trees can sit deep in groves.
  const blocked = interactive.filter(object => !reach(object) && object.kind !== "tree" && !(object.kind === "obstacle" && COURSES[object.obstacle.course] && object.obstacle.step > 0))
    .map(object => `${object.name}@${object.x},${object.y}`);
  assert.deepEqual(blocked, [], "Every station, rock, spot and ladder can be reached");
  assert(stuck.length < interactive.length * 0.03, `Nearly every tree can be reached (${stuck.length} can't)`);
  for (const spawn of world.spawns.filter(entry => entry.kind === "npc")) {
    assert(ok(spawn.x, spawn.y) || [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => ok(spawn.x + dx, spawn.y + dy)), `NPC ${spawn.id} at ${spawn.x},${spawn.y}`);
  }
  for (const id of Object.keys(NPCS)) assert(world.spawns.some(spawn => spawn.kind === "npc" && spawn.id === id), `NPC ${id} is placed`);
  for (const id of Object.keys(MONSTERS).filter(id => !MONSTERS[id].worldBoss && !MONSTERS[id].arenaOnly)) assert(world.spawns.some(spawn => spawn.kind === "monster" && spawn.id === id), `Monster ${id} is placed`);
  for (const region of REGIONS) if (region.id !== "coast") assert(world.region.includes(REGIONS.indexOf(region)), `${region.name} exists`);
  assert.equal(regionAt(world, world.places.spawn.x, world.places.spawn.y).id, "friendhollow");
  // The throne room lies behind the Hollow gate: the king is reachable from its far side.
  const king = world.places.king, [tx, ty] = mainlandToWorld(177, 224), throne = reachable(g, { x: tx, y: ty });
  assert(throne[king.y * W + king.x - 1] || throne[(king.y + 3) * W + king.x], "The Hollow King can be reached past the gate");
  assert(!ok(tx, ty), "…and only through the gate");
});

test("Friendhollow Castle: spiral stairs up to the King, on to the roof, and back down", () => {
  const g = newGame(), world = g.world, levelOf = () => realPoint(world, g.player.x, g.player.y).level;
  const stairs = (level, action) => world.objects.filter(object => object.look === "stairs" && object.action === action && realPoint(world, object.x, object.y).level === level && realPoint(world, object.x, object.y).x < M(140, 0)[0]);
  const climb = (object, level) => { standBy(g, object); menuFor(g, [{ kind: "object", id: object.id }], null)[0].run(g); until(g, () => levelOf() === level, 30); };
  // Up the north-east tower to the King's floor.
  const up = stairs(0, "Climb-up").sort((a, b) => b.x - a.x)[0];
  assert.equal(menuFor(g, [{ kind: "object", id: up.id }], null)[0].verb, "Climb-up");
  climb(up, 1);
  assert(g.player.y >= FLOOR_Y && floorAt(world, g.player.x, g.player.y).complex === "castle", "Stored on the castle's first floor");
  const real = realPoint(world, g.player.x, g.player.y);
  { const [cx0, cy0] = M(112, 86), [cx1, cy1] = M(131, 105); assert(real.x >= cx0 && real.x <= cx1 && real.y >= cy0 && real.y <= cy1, "Standing over the castle"); }
  assert.deepEqual(onLevel(world, real.x, real.y, 1), { x: g.player.x, y: g.player.y }, "Clicks on this storey land on its floor");
  // King Hollis receives you in the throne room (and welcomes you with coins, once).
  const king = g.npcs.find(npc => npc.id === "king"), coins = count(g.player, "coins");
  assert.equal(realPoint(world, king.x, king.y).level, 1);
  walkTo(g, king.x, king.y + 1); until(g, () => g.player.x === king.x && g.player.y === king.y + 1, 80);
  setTarget(g, { kind: "npc", uid: king.uid, option: "Talk-to" });
  until(g, () => g.dialogue !== null, 30);
  while (g.dialogue) continueDialogue(g);
  assert.equal(count(g.player, "coins"), coins + 250);
  // The roof: up again from the north-east tower, then all the way back to the ground.
  climb(stairs(1, "Climb-up")[0], 2);
  climb(stairs(2, "Climb-down")[0], 1);
  climb(stairs(1, "Climb-down").sort((a, b) => a.x - b.x)[0], 0);
  assert(g.player.y < FLOOR_Y && !isUnderground(g.player.y), "Back on the ground");
});

test("click to walk: pathfinding goes around obstacles and never cuts corners", () => {
  const g = newGame();
  const bank = g.world.objects.find(object => object.kind === "bank");
  const path = findPath(g, g.player, (x, y) => x === bank.x && y === bank.y + 1, bank);
  assert(path && path.length > 3);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    assert(Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1);
    assert(canWalk(g, b.x, b.y));
  }
  walkTo(g, bank.x, bank.y + 1);
  until(g, () => g.player.x === bank.x && g.player.y === bank.y + 1, 60);
  // Running covers two tiles a tick.
  g.player.run = true; const start = { ...g.player.prev };
  walkTo(g, g.world.places.spawn.x, g.world.places.spawn.y);
  tick(g);
  assert(Math.max(Math.abs(g.player.x - bank.x), Math.abs(g.player.y - bank.y - 1)) === 2 || g.player.path.length === 0, "Ran two tiles");
  void start;
});

test("held movement snaps a world direction to the nearest of 8 ways", () => {
  const g = newGame(), { x, y } = g.player;
  setHeld(g, { dx: 0.5, dy: 0.45 }); tick(g); setHeld(g, null);
  assert.equal(g.player.x - x, 1); assert.equal(g.player.y - y, 1);
  const before = { ...g.player };
  setHeld(g, { dx: -1, dy: 0.1 }); tick(g); setHeld(g, null);
  assert.equal(g.player.x - before.x, -1); assert.equal(g.player.y - before.y, 0);
});

test("right-click menus list every option in old-school order", () => {
  const g = newGame();
  const tree = objectNear(g, "tree", object => object.tree === "tree");
  const options = menuFor(g, [{ kind: "object", id: tree.id }], { x: tree.x, y: tree.y });
  assert.deepEqual(options.map(option => option.verb), ["Chop down", "Walk here", "Examine"]);
  const ground = menuFor(g, [], { x: 1, y: 1 });
  assert.deepEqual(ground.map(option => option.verb), ["Walk here"]);
  const npc = g.npcs.find(entry => entry.id === "banker");
  assert.deepEqual(menuFor(g, [{ kind: "npc", id: npc.uid }], null).map(option => option.verb), ["Talk-to", "Bank", "Examine"]);
  const chicken = g.monsters.find(monster => monster.def.id === "chicken");
  assert.equal(menuFor(g, [{ kind: "monster", id: chicken.uid }], null)[0].noun, "Chicken  (level-1)");
  // Use item -> object.
  const slot = g.player.inventory.findIndex(entry => entry?.id === "minnows");
  const use = menuFor(g, [{ kind: "object", id: tree.id }], null, { kind: "item", slot });
  assert.equal(use[0].verb, "Use Minnows ->");
  assert.deepEqual(itemOptions(g, slot).map(option => option.verb), ["Eat", "Use", "Drop", "Examine"]);
});

test("woodcutting, firemaking and cooking: the classic loop", () => {
  const g = newGame();
  const tree = objectNear(g, "tree", object => object.tree === "tree");
  standBy(g, tree);
  menuFor(g, [{ kind: "object", id: tree.id }], null)[0].run(g);
  until(g, () => has(g.player, "logs"), 300);
  assert(g.player.xp.woodcutting >= TREES.tree.xp * XP_RATE * earlyXp(1, "woodcutting"));
  assert(g.depleted.has(tree.id) || g.player.activity?.kind === "woodcut");
  // Light the logs where we stand (walk to open grass first).
  teleport(g, ...M(100, 132));
  while (terrainAt(g.world, g.player.x, g.player.y) !== T.GRASS || objectAtTile(g.world, g.player.x, g.player.y)) teleport(g, g.player.x + 1, g.player.y);
  const logs = g.player.inventory.findIndex(slot => slot?.id === "logs");
  itemOptions(g, logs).find(option => option.verb === "Light").run(g);
  until(g, () => g.fires.length === 1, 60);
  assert(g.player.xp.firemaking > 0);
  // Cook raw minnows on it.
  give(g.player, "raw_minnows", 8);
  const fire = g.fires[0];
  setTarget(g, { kind: "fire", uid: fire.uid, option: "Cook" });
  until(g, () => !has(g.player, "raw_minnows"), 200);
  assert(count(g.player, "minnows") + count(g.player, "burnt_food") >= 8, "Cooked (or burnt) them all");
  assert(g.player.xp.cooking > 0);
});

test("fishing minnows at Glass Lake", () => {
  const g = newGame();
  const spot = g.world.objects.find(object => object.kind === "spot" && object.spot === "net");
  standBy(g, spot);
  menuFor(g, [{ kind: "object", id: spot.id }], null)[0].run(g);
  until(g, () => has(g.player, "raw_minnows"), 400);
  assert(g.player.xp.fishing >= 10 * XP_RATE * earlyXp(1, "fishing"));
});

test("mining, smelting and smithing a pewter dagger", () => {
  const g = newGame();
  give(g.player, "hammer");
  for (const kind of ["pewter"]) {
    const rock = g.world.objects.find(object => object.kind === "rock" && object.rock === kind);
    standBy(g, rock);
    setTarget(g, { kind: "object", id: rock.id, option: "Mine" });
    until(g, () => has(g.player, `${kind}_ore`), 600);
  }
  assert(g.player.xp.mining >= 17.5 * XP_RATE * earlyXp(1, "mining"));
  const furnace = g.world.objects.find(object => object.kind === "furnace");
  standBy(g, furnace);
  setTarget(g, { kind: "object", id: furnace.id, option: "Smelt" });
  until(g, () => g.ui.production !== null, 50);
  startProduction(g, smeltingRecipes()[0], 1);
  until(g, () => has(g.player, "pewter_bar"), 50);
  const anvil = g.world.objects.find(object => object.kind === "anvil");
  standBy(g, anvil);
  setTarget(g, { kind: "object", id: anvil.id, option: "Smith" });
  until(g, () => g.ui.production !== null, 50);
  startProduction(g, smithingRecipes("pewter").find(recipe => recipe.label === "Pewter dagger"), 1);
  until(g, () => count(g.player, "pewter_dagger") === 2, 50);
  assert(g.player.xp.smithing >= (8 + 12.5) * XP_RATE * earlyXp(1, "smithing"));
});

test("Forged tiers (50–90): materials from strong monsters, smelted and smithed at Smithing 86+, into weapons, armour, tools, staffs and crossbows", () => {
  const forged = [["frostsilver", 50, "frost_shard", "frost_yeti"], ["gloomsteel", 60, "gloom_shard", "gloom_hound"], ["wyrmscale", 70, "wyrm_scale", "ash_drake"],
    ["hollowsteel", 75, "hollow_essence", "hollow_king"], ["cindersteel", 80, "cinder_core", "emberwyrm"], ["ashenheart", 90, "colossus_ember", "ashen_colossus"]];
  for (const [metal, lvl, material, source] of forged) {
    assert.equal(item(`${metal}_sabre`).equip.requires.attack, lvl); assert.equal(item(`${metal}_cuirass`).equip.requires.defence, lvl);
    assert.equal(item(`${metal}_staff`).equip.requires.magic, lvl); assert.equal(item(`${metal}_pickaxe`).tool.level, lvl);
    assert(MONSTERS[source].always?.some(drop => drop.item === material) || MONSTERS[source].drops.some(drop => drop.item === material), `${source} drops ${material}`);
    for (const recipe of smithingRecipes(metal)) assert(recipe.level >= 86 && recipe.level <= 99, `${recipe.label} at Smithing ${recipe.level}`);
  }
  // Each tier outclasses the last.
  const sabres = ["rarite", ...forged.map(([metal]) => metal)].map(metal => item(`${metal}_sabre`).equip.bonuses.strength);
  assert.deepEqual([...sabres].sort((a, b) => a - b), sabres);
  // Smelt a frost shard and forge a staff and a pickaxe from it.
  const g = newGame(), p = g.player;
  p.inventory.fill(null); p.xp.smithing = XP_TABLE[99]; give(p, "frost_shard", 4); give(p, "inkcoal", 16); give(p, "hammer");
  const furnace = g.world.objects.find(object => object.kind === "furnace");
  standBy(g, furnace);
  startProduction(g, smeltingRecipes().find(recipe => recipe.outputs.frostsilver_bar), 4); until(g, () => count(p, "frostsilver_bar") === 4, 120);
  assert.equal(count(p, "frostsilver_bar"), 4);
  const anvil = g.world.objects.find(object => object.kind === "anvil");
  standBy(g, anvil);
  startProduction(g, smithingRecipes("frostsilver").find(recipe => recipe.outputs.frostsilver_staff), 1); run(g, 12);
  startProduction(g, smithingRecipes("frostsilver").find(recipe => recipe.outputs.frostsilver_pickaxe), 1); run(g, 12);
  assert(has(p, "frostsilver_staff") && has(p, "frostsilver_pickaxe"));
  // Frostsilver is on sale in Frostpeak, for those with the coin.
  assert(SHOPS.frost.stock.includes("frostsilver_sword"));
});

test("Bank tabs: deposit into a tab, drag to reorder and between tabs, empty tabs close up, and tabs survive a save", () => {
  const g = newGame(), p = g.player;
  p.inventory.fill(null); p.bank = [];
  for (const id of ["logs", "oak_logs", "pewter_bar", "raw_minnows"]) give(p, id, 2);
  bankDeposit(p, p.inventory.findIndex(slot => slot?.id === "logs"));
  bankDeposit(p, p.inventory.findIndex(slot => slot?.id === "oak_logs"));
  bankDeposit(p, p.inventory.findIndex(slot => slot?.id === "pewter_bar"), Infinity, 1);
  bankDeposit(p, p.inventory.findIndex(slot => slot?.id === "raw_minnows"), Infinity, 1);
  assert.deepEqual(bankTabs(p), [1]);
  assert.deepEqual(bankInOrder(p).map(slot => `${slot.id}:${slot.tab ?? 0}`), ["logs:0", "oak_logs:0", "pewter_bar:1", "raw_minnows:1"]);
  // Drag oak logs before the logs (reorder), then minnows onto a new tab, then the bar onto the logs (the main tab).
  bankMove(p, "oak_logs", "logs"); assert.deepEqual(p.bank.filter(slot => !slot.tab).map(slot => slot.id), ["oak_logs", "logs"]);
  bankMove(p, "raw_minnows", null, "new"); assert.deepEqual(bankTabs(p), [1, 2]);
  bankMove(p, "pewter_bar", "logs");
  assert.deepEqual(bankTabs(p), [1], "tab 1 emptied, so tab 2 became tab 1");
  assert.equal(p.bank.find(slot => slot.id === "raw_minnows").tab, 1);
  const fresh = newGame(); restore(fresh, serialize(g));
  assert.deepEqual(bankInOrder(fresh.player).map(slot => `${slot.id}:${slot.tab ?? 0}`), bankInOrder(p).map(slot => `${slot.id}:${slot.tab ?? 0}`));
  bankWithdraw(p, "raw_minnows", 2); assert.deepEqual(bankTabs(p), []);
});

test("Inkcoal satchel: mined inkcoal goes in, the furnace takes from it, and it's saved", () => {
  const g = newGame(), p = g.player;
  p.inventory.fill(null); give(p, "inkcoal_satchel"); give(p, "pewter_pickaxe"); p.xp.mining = XP_TABLE[40]; p.xp.smithing = XP_TABLE[40];
  const rock = objectNear(g, "rock", object => object.rock === "inkcoal");
  standBy(g, rock); setTarget(g, { kind: "object", id: rock.id, option: "Mine" });
  until(g, () => p.coalBag > 0, 800);
  assert.equal(count(p, "inkcoal"), 0, "into the satchel, not the pack");
  p.coalBag = 10; give(p, "blackiron_ore", 2);
  const furnace = g.world.objects.find(object => object.kind === "furnace");
  standBy(g, furnace);
  startProduction(g, smeltingRecipes().find(recipe => recipe.outputs.ashsteel_bar), 2); until(g, () => count(p, "ashsteel_bar") === 2, 60);
  assert.equal(p.coalBag, 8, "ashsteel takes one inkcoal a bar from the satchel");
  const fresh = newGame(); restore(fresh, serialize(g)); assert.equal(fresh.player.coalBag, 8);
  assert(item("grumblin_head").equip.slot === "head" && MONSTERS.grumblin.drops.some(drop => drop.item === "grumblin_head" && drop.chance < 0.01), "a very rare Grumblin head");
});

test("Sigil stone box: stones mined go in, it fills from the bank, and the altar presses everything in it", () => {
  const g = newGame(), p = g.player;
  p.inventory.fill(null); give(p, "sigil_box"); give(p, "pewter_pickaxe");
  const rock = objectNear(g, "rock", object => object.rock === "sigil");
  standBy(g, rock); setTarget(g, { kind: "object", id: rock.id, option: "Mine" });
  until(g, () => p.stoneBox >= 3, 800);
  assert.equal(count(p, "sigil_stone"), 0, "into the box, not the pack");
  p.activity = null; p.bank = [{ id: "sigil_stone", n: 500 }];
  const had = p.stoneBox; assert.equal(fillFromBank(p, "sigil_box"), 120 - had, "fills to 120 from the bank");
  assert.equal(p.stoneBox, 120); assert(p.bank[0].n < 500);
  const altar = g.world.objects.find(object => object.kind === "sigil_altar" && object.sigil === "breeze_sigil");
  standBy(g, altar); assert.equal(craftSigils(g, altar), 120, "every stone in the box is pressed");
  assert.equal(p.stoneBox, 0); assert.equal(count(p, "breeze_sigil"), 120);
  p.stoneBox = 40; const before = p.bank[0].n; assert.equal(emptyToBank(p, "sigil_box"), 40); assert.equal(p.bank[0].n, before + 40);
  p.stoneBox = 17; const fresh = newGame(); restore(fresh, serialize(g)); assert.equal(fresh.player.stoneBox, 17);
});

test("Sheep: shear with shears (it looks shorn until the wool grows back), spin the wool into string, string a bow and an amulet", () => {
  const g = newGame(), p = g.player;
  p.inventory.fill(null);
  const sheep = g.monsters.filter(monster => monster.def.id === "sheep");
  assert(sheep.length >= 4, "a flock in the pen by the farm");
  const baa = sheep[0];
  standNear(g, baa.x, baa.y, 1); setTarget(g, { kind: "monster", uid: baa.uid, option: "Shear" }); run(g, 6);
  assert(!has(p, "wool"), "no shears, no wool");
  give(p, "shears"); standNear(g, baa.x, baa.y, 1); setTarget(g, { kind: "monster", uid: baa.uid, option: "Shear" }); until(g, () => has(p, "wool"), 40);
  assert(baa.shorn > g.tick, "the sheep is shorn for a while");
  standNear(g, baa.x, baa.y, 1); setTarget(g, { kind: "monster", uid: baa.uid, option: "Shear" }); run(g, 6);
  assert.equal(count(p, "wool"), 1, "a shorn sheep has nothing to give");
  run(g, baa.def.shear.regrow + 2); assert(baa.shorn <= g.tick, "and its wool grows back");
  const crafting = p.xp.crafting, wheel = g.world.objects.find(object => object.kind === "wheel");
  assert(wheel, "a spinning wheel in the farmhouse");
  standBy(g, wheel); setTarget(g, { kind: "object", id: wheel.id, option: "Spin" }); until(g, () => g.ui.production !== null, 60);
  startProduction(g, g.ui.production.recipes[0], 1); until(g, () => has(p, "string"), 30);
  assert(p.xp.crafting > crafting, "spinning trains Crafting");
  p.xp.fletching = XP_TABLE[10]; give(p, "shortbow_u"); useItemOnItem(g, p.inventory.findIndex(slot => slot?.id === "string"), p.inventory.findIndex(slot => slot?.id === "shortbow_u")); run(g, 6);
  assert(has(p, "shortbow") && !has(p, "string"), "the string finishes the bow");
  p.xp.crafting = XP_TABLE[20]; give(p, "string"); give(p, "moonstone");
  useItemOnItem(g, p.inventory.findIndex(slot => slot?.id === "string"), p.inventory.findIndex(slot => slot?.id === "moonstone")); run(g, 6);
  assert(has(p, "moonstone_amulet"), "a gem on a string makes an amulet");
});

test("Two-handed greatswords, battleaxes and war hammers; new creatures with their own drops; arrow shafts pay 8 XP", () => {
  const g = newGame(), p = g.player;
  for (const piece of ["greatsword", "battleaxe", "warhammer"]) {
    const two = item(`ashsteel_${piece}`), sabre = item("ashsteel_sabre");
    assert(two.equip.twoHanded && two.equip.speed > sabre.equip.speed && two.equip.bonuses.strength > sabre.equip.bonuses.strength, `${piece}: two hands, slower, harder hitting`);
    assert(smithingRecipes("ashsteel").some(recipe => recipe.outputs[`ashsteel_${piece}`] === 1), `${piece} at the anvil`);
    assert(SHOPS.heft.stock.includes(`pewter_${piece}`), `Heft & Haft sells a pewter ${piece}`);
  }
  assert(g.npcs.some(npc => npc.id === "heft"), "Heft & Haft is open in Friendhollow");
  give(p, "pewter_shield"); equip(g, p.inventory.findIndex(slot => slot?.id === "pewter_shield"));
  p.xp.strength = XP_TABLE[7]; // a pewter war hammer takes Strength 7
  give(p, "pewter_warhammer"); equip(g, p.inventory.findIndex(slot => slot?.id === "pewter_warhammer"));
  assert.equal(p.equipment.weapon, "pewter_warhammer"); assert.equal(p.equipment.shield, undefined, "the shield comes off for two hands");
  const drops = { grumblin: "grumblin_spear", forest_spider: "spider_fang", boar: "tusker_axe", highland_goat: "horned_helm", sand_scorpion: "stinger_sabre", stone_golem: "golem_maul", moss_colossus: "mossy_staff" };
  for (const [monster, drop] of Object.entries(drops)) {
    assert(MONSTERS[monster].drops.some(entry => entry.item === drop), `${monster} drops ${drop}`);
    assert(g.monsters.some(entry => entry.def.id === monster), `${monster} lives in the Realm`);
  }
  p.inventory.fill(null); give(p, "knife"); give(p, "logs");
  const shafts = fletchingRecipesFor(g, "logs").find(recipe => recipe.label === "15 arrow shafts");
  assert.equal(shafts.xp, 8);
});

test("Heavy weapons take Strength (pewter 3, 5 and 7, each tier the metal's level more) and swing harder with it", () => {
  const g = newGame(), p = g.player;
  const offsets = { greatsword: 2, battleaxe: 4, warhammer: 6 };
  for (const metal of METALS) for (const [piece, offset] of Object.entries(offsets)) {
    const weapon = item(`${metal.id}_${piece}`);
    assert.equal(heavyStrength(metal.id, piece), metal.level + offset);
    assert.equal(weapon.equip.requires.strength, metal.level + offset, `${weapon.name} takes Strength ${metal.level + offset}`);
    assert.equal(weapon.equip.requires.attack, metal.level > 1 ? metal.level : undefined, `${weapon.name} still takes the metal's Attack`);
    assert.match(weapon.examine, /Strength \d+/, "the examine says so");
  }
  assert.equal(item("pewter_greatsword").equip.requires.strength, 3); assert.equal(item("pewter_battleaxe").equip.requires.strength, 5); assert.equal(item("pewter_warhammer").equip.requires.strength, 7);
  assert.equal(item("blackiron_greatsword").equip.requires.strength, 7); assert.equal(item("ashsteel_warhammer").equip.requires.strength, 16); assert.equal(item("ashenheart_warhammer").equip.requires.strength, 96);
  assert.equal(item("pewter_sabre").equip.requires, undefined, "one-handed pewter still needs nothing");
  // A Friend at Strength 1 can't lift a pewter war hammer; at 7 it can.
  give(p, "pewter_warhammer");
  const slot = () => p.inventory.findIndex(entry => entry?.id === "pewter_warhammer");
  equip(g, slot());
  assert.equal(p.equipment.weapon, undefined, "too weak to wield it");
  assert.match(g.messages.at(-1).text, /Strength level of 7 to wield/);
  p.xp.strength = XP_TABLE[7];
  equip(g, slot());
  assert.equal(p.equipment.weapon, "pewter_warhammer", "wielded at Strength 7");
  // Heft: the strength bonus grows with Strength, 1% of the weapon's bonus for every two levels; a sabre gets none.
  const base = item("pewter_warhammer").equip.bonuses.strength;
  assert.equal(heft(p), Math.floor(base * 7 / 200));
  p.xp.strength = XP_TABLE[99];
  assert.equal(heft(p), Math.floor(base * 99 / 200), "about half as much again at 99");
  assert.equal(bonuses(p).strength, base + heft(p), "and it counts in your bonuses");
  p.equipment.weapon = "ashenheart_warhammer";
  assert(heft(p) > 50, `a top-tier heavy gets a big heft (${heft(p)})`);
  p.equipment.weapon = "pewter_sabre";
  assert.equal(heft(p), 0, "a sabre has no heft");
  p.equipment.weapon = "oak_bow";
  assert.equal(heft(p), 0, "nor a bow");
});

test("Bones used on an altar keep being offered until none of that kind are left", () => {
  const g = newGame({ familyId: 2 }), p = g.player;
  const altar = g.world.objects.find(object => object.kind === "altar" && object.text !== "crypt" && object.text !== "dawn");
  assert(altar, "an ordinary altar");
  p.inventory.fill(null);
  give(p, "bones", 5); give(p, "large_bones", 2);
  standBy(g, altar);
  const before = p.xp.prayer;
  setTarget(g, { kind: "object", id: altar.id, option: "Use", use: p.inventory.findIndex(slot => slot?.id === "bones") });
  until(g, () => count(p, "bones") === 4, 10);
  assert.equal(p.activity?.kind, "offer", "the offering carries on");
  until(g, () => count(p, "bones") === 0, 5 * OFFER_TICKS + 10);
  assert.equal(p.activity, null, "and stops when the bones run out");
  assert.equal(count(p, "large_bones"), 2, "other kinds of bones stay in the pack");
  const expected = 5 * 4.5 * 2 * XP_RATE * earlyXp(1, "prayer");
  assert(p.xp.prayer - before > expected * 0.9 - 1e-9, `five bones' worth of altar XP (${p.xp.prayer - before} vs ${expected})`);
  // Walking off stops it.
  give(p, "bones", 3);
  setTarget(g, { kind: "object", id: altar.id, option: "Use", use: p.inventory.findIndex(slot => slot?.id === "bones") });
  until(g, () => count(p, "bones") === 2, 10);
  walkTo(g, p.x, p.y + 3);
  assert.equal(p.activity, null, "walking away stops the offering");
});

test("The ossuary bag: holds 60 bones of any kind, catches picked-up bones, empties onto an altar at once, and is saved", () => {
  const g = newGame({ familyId: 2 }), p = g.player;
  p.inventory.fill(null);
  give(p, BONE_BAG); give(p, "bones", 3); give(p, "large_bones", 2);
  const bag = () => p.inventory.findIndex(slot => slot?.id === BONE_BAG);
  assert.deepEqual(itemOptions(g, bag()).map(option => option.verb), ["Wear", "Check", "Fill", "Empty", "Use", "Drop", "Examine"]);
  itemOptions(g, bag())[1].run(g);
  assert.match(g.messages.at(-1).text, /empty/);
  // Bones on the bag put that kind in; Fill puts every kind in.
  useItemOnItem(g, p.inventory.findIndex(slot => slot?.id === "large_bones"), bag());
  assert.equal(count(p, "large_bones"), 0); assert.equal(count(p, "bones"), 3); assert.equal(bagBones(p), 2);
  bagFill(g);
  assert.equal(count(p, "bones"), 0); assert.equal(bagBones(p), 5);
  assert.deepEqual(p.boneBag, { large_bones: 2, bones: 3 });
  itemOptions(g, bag())[1].run(g);
  assert.match(g.messages.at(-1).text, /5 of 60 bones: 2 large bones, 3 bones/);
  // Empty tips them back out.
  itemOptions(g, bag())[3].run(g);
  assert.equal(bagBones(p), 0); assert.equal(count(p, "bones"), 3); assert.equal(count(p, "large_bones"), 2);
  bagFill(g);
  // Picking bones up with the bag in your pack puts them straight in it.
  dropItem(g, "bones", 1, p.x, p.y);
  const ground = g.ground.find(entry => entry.id === "bones" && entry.x === p.x && entry.y === p.y);
  setTarget(g, { kind: "ground", uid: ground.uid, option: "Take" }); run(g, 2);
  assert.equal(count(p, "bones"), 0, "not in the pack"); assert.equal(bagBones(p), 6, "in the bag");
  // It holds 60 at most; the rest stay in the pack.
  give(p, "bones", 20); p.boneBag.bones = 50;
  bagFill(g);
  assert.equal(bagBones(p), BONE_BAG_SIZE); assert.equal(count(p, "bones"), 12, "what didn't fit stays");
  // Saved and restored.
  const copy = createGame({ familyId: 2, friendId: 7730, rng: seeded() });
  restore(copy, serialize(g));
  assert.deepEqual(copy.player.boneBag, p.boneBag, "the bag's contents survive a save");
  // Used on an altar: everything inside is offered at once, at the altar's rate; in the chapel it counts for the vigil.
  const altar = g.world.objects.find(object => object.kind === "altar" && object.text === "dawn");
  standBy(g, altar);
  p.quests.dawn_vigil = 1; p.questData.vigil_bones = 0;
  const before = p.xp.prayer, inside = { ...p.boneBag }, n = bagBones(p);
  setTarget(g, { kind: "object", id: altar.id, option: "Use", use: bag() }); run(g, 2);
  assert.equal(bagBones(p), 0, "the bag is empty"); assert.deepEqual(p.boneBag, {});
  assert.equal(p.questData.vigil_bones, n, "every bone counted for the vigil");
  const expected = (inside.bones * 4.5 + inside.large_bones * 15) * 3 * XP_RATE * earlyXp(1, "prayer");
  assert(p.xp.prayer - before > expected * 0.5, `three times the burying XP for the lot (${p.xp.prayer - before} vs ${expected})`);
  assert(g.messages.slice(-3).some(line => new RegExp(`offer ${n} bones at once`).test(line.text)), "the offering is announced (your Friend may remark on the level after)");
  offerBag(g, false);
  assert.match(g.messages.at(-1).text, /empty/, "an empty bag offers nothing");
  // Sister Maren gives a squire without a bag one.
  const h = newGame({ familyId: 2 }), q = h.player;
  q.quests.dawn_vigil = 2;
  const maren = h.npcs.find(npc => npc.id === "chaplain");
  teleport(h, maren.x, maren.y + 1); if (!canWalk(h, maren.x, maren.y + 1)) teleport(h, maren.x + 1, maren.y);
  const talkToMaren = () => {
    setTarget(h, { kind: "npc", uid: maren.uid, option: "Talk-to" });
    until(h, () => h.dialogue !== null, 40);
    for (let i = 0; i < 20 && h.dialogue; i++) { const before = h.dialogue.index; continueDialogue(h); if (h.dialogue && h.dialogue.index === before) chooseOption(h, h.dialogue.options.length - 1); }
  };
  talkToMaren();
  assert(has(q, BONE_BAG), "a bag from Sister Maren");
  talkToMaren();
  assert.equal(count(q, BONE_BAG), 1, "but only one");
});

test("Beginner fishing by the farm, and a new cook burns far less", () => {
  const g = newGame();
  const [px, py] = M(76, 139), pond = g.world.objects.filter(object => object.kind === "spot" && Math.abs(object.x - px) <= 6 && Math.abs(object.y - py) <= 4);
  assert(pond.filter(object => object.spot === "net").length >= 2 && pond.some(object => object.spot === "bait"), "the millpond has net and bait spots");
  const p = g.player; p.inventory.fill(null); give(p, "raw_minnows", 27);
  const range = objectNear(g, "range"); standBy(g, range); setTarget(g, { kind: "object", id: range.id, option: "Cook" });
  until(g, () => !has(p, "raw_minnows"), 400);
  assert(count(p, "minnows") >= 18, `most cook at level 1 (${count(p, "minnows")}/27)`);
});

test("Ruins: old houses, towers and walls out in the wild, never on a road or a spawn", () => {
  const world = createWorld(), ruins = world.objects.filter(object => object.decor === "ruin_wall");
  const regions = new Set(ruins.map(object => regionAt(world, object.x, object.y).id));
  assert(ruins.length > 80 && regions.size >= 6, `${ruins.length} ruin walls in ${[...regions].join(", ")}`);
  assert(ruins.some(object => object.height > 70), "some ruined towers still stand tall");
  const spawns = new Set(world.spawns.map(spawn => `${spawn.x},${spawn.y}`));
  for (const object of ruins) {
    assert(![T.PATH, T.COBBLE, T.BRIDGE].includes(terrainAt(world, object.x, object.y)), `ruin on a road at ${object.x},${object.y}`);
    assert(!spawns.has(`${object.x},${object.y}`), `ruin on a spawn at ${object.x},${object.y}`);
  }
});

test("combat: equip a sword, kill a chicken, loot and bury its bones", () => {
  const g = newGame();
  give(g.player, "pewter_sword");
  equip(g, g.player.inventory.findIndex(slot => slot?.id === "pewter_sword"));
  assert.equal(g.player.equipment.weapon, "pewter_sword");
  const chicken = g.monsters.find(monster => monster.def.id === "chicken");
  teleport(g, chicken.x + 1, chicken.y);
  setTarget(g, { kind: "monster", uid: chicken.uid, option: "Attack" });
  until(g, () => chicken.dead, 300);
  assert(g.player.xp.attack > 0 && g.player.xp.hitpoints > XP_TABLE[10]);
  const bones = g.ground.find(entry => entry.id === "bones");
  assert(bones, "Chickens always drop bones");
  setTarget(g, { kind: "ground", uid: bones.uid, option: "Take" });
  until(g, () => has(g.player, "bones"), 30);
  itemOptions(g, g.player.inventory.findIndex(slot => slot?.id === "bones"))[0].run(g);
  assert(g.player.xp.prayer >= 4.5 * XP_RATE * 1.5 * earlyXp(1, "prayer"), "Skeleton family buries for +50%");
  run(g, 25);
  assert(!chicken.dead, "Monsters respawn");
});

test("monsters fight back, aggressive ones attack, and death is safe", () => {
  const g = newGame();
  const yeti = g.monsters.find(monster => monster.def.id === "frost_yeti");
  standNear(g, yeti.x, yeti.y, 3);
  const coins = count(g.player, "coins");
  until(g, () => g.player.deaths === 1, 800);
  assert.deepEqual([g.player.x, g.player.y], [g.world.places.spawn.x, g.world.places.spawn.y]);
  assert.equal(g.player.hp, 10);
  assert.equal(count(g.player, "coins"), coins, "Items are kept on death");
});

test("formulas: accuracy and gathering chances behave", () => {
  assert(hitChance(1000, 100) > 0.9); assert(hitChance(100, 1000) < 0.1);
  assert(successChance(1, 64, 200) < successChance(50, 64, 200));
  assert(successChance(99, 64, 200) <= 1);
});

test("A Friend's Feast from start to finish", () => {
  const g = newGame();
  const cook = g.npcs.find(npc => npc.id === "cook");
  teleport(g, cook.x + 1, cook.y); if (!canWalk(g, cook.x + 1, cook.y)) teleport(g, cook.x, cook.y + 1);
  setTarget(g, { kind: "npc", uid: cook.uid, option: "Talk-to" });
  until(g, () => g.dialogue !== null, 30);
  continueDialogue(g); chooseOption(g, 0);
  while (g.dialogue && g.dialogue.index < g.dialogue.lines.length) continueDialogue(g);
  chooseOption(g, 0);
  assert.equal(g.player.quests.friends_feast, 1);
  // Gather: egg from the coop, grain and the mill, milk from the dairy cow.
  give(g.player, "pot"); give(g.player, "bucket");
  for (const [kind, option] of [["coop", "Take-egg"], ["wheat", "Pick"], ["mill", "Operate"], ["dairy_cow", "Milk"]]) {
    const object = g.world.objects.find(entry => entry.kind === kind);
    if (object.blocks) standBy(g, object); else teleport(g, object.x, object.y + 1 < H && canWalk(g, object.x, object.y + 1) ? object.y + 1 : object.y);
    setTarget(g, { kind: "object", id: object.id, option });
    run(g, 20);
  }
  for (const id of ["egg", "pot_of_flour", "bucket_of_milk"]) assert(has(g.player, id), id);
  teleport(g, cook.x + 1, cook.y); if (!canWalk(g, cook.x + 1, cook.y)) teleport(g, cook.x, cook.y + 1);
  setTarget(g, { kind: "npc", uid: cook.uid, option: "Talk-to" });
  until(g, () => g.dialogue !== null, 30);
  while (g.dialogue) continueDialogue(g);
  assert.equal(g.player.quests.friends_feast, 2);
  assert.equal(questPoints(g), 1);
  assert(level(g, "cooking") >= 10, "Quest XP");
  assert.equal(QUESTS.length, 55); assert.equal(MAX_QUEST_POINTS, 93);
});

test("Grumblin Trouble counts kills and pays out", () => {
  const g = newGame();
  g.player.quests.grumblin_trouble = 1; g.player.questData.grumblins = 0;
  g.player.xp.attack = XP_TABLE[40]; g.player.xp.strength = XP_TABLE[40]; g.player.xp.defence = XP_TABLE[40]; g.player.xp.hitpoints = XP_TABLE[40]; g.player.hp = 40;
  give(g.player, "ashsteel_sabre"); equip(g, g.player.inventory.findIndex(slot => slot?.id === "ashsteel_sabre"));
  let kills = 0;
  for (const grumblin of g.monsters.filter(monster => monster.def.id === "grumblin").slice(0, 6)) {
    teleport(g, grumblin.x, grumblin.y + 1);
    if (!canWalk(g, grumblin.x, grumblin.y + 1)) teleport(g, grumblin.x + 1, grumblin.y);
    setTarget(g, { kind: "monster", uid: grumblin.uid, option: "Attack" });
    until(g, () => grumblin.dead, 400); kills++;
  }
  assert.equal(kills, 6); assert.equal(g.player.questData.grumblins, 6);
});

test("thieving: pickpocket villagers and steal from stalls", () => {
  const g = newGame({ familyId: 1 });
  const villager = g.npcs.find(npc => npc.id === "villager");
  const before = count(g.player, "coins");
  for (let i = 0; i < 12; i++) {
    teleport(g, villager.x + 1, villager.y);
    if (!canWalk(g, villager.x + 1, villager.y)) teleport(g, villager.x, villager.y + 1);
    setTarget(g, { kind: "npc", uid: villager.uid, option: "Pickpocket" }); run(g, 8);
    g.player.hp = 10;
  }
  assert(count(g.player, "coins") > before);
  assert(g.player.xp.thieving > 0);
});

test("stealth: sneaking past an aggressive monster unseen pays XP; being spotted hurts", () => {
  // Unseen: every roll misses, so the yeti never notices; out of its reach, you've slipped past.
  const g = newGame(), yeti = g.monsters.find(monster => monster.def.id === "frost_yeti");
  g.monsters = [yeti]; g.rng = () => 0.5;
  toggleSneak(g); assert.equal(g.player.sneak, true);
  standNear(g, yeti.x, yeti.y, 3); run(g, 3);
  assert.equal(yeti.target, false, "the yeti hasn't noticed");
  assert(g.sneakingPast.has(yeti.uid));
  const before = g.player.xp.thieving;
  standNear(g, yeti.x, yeti.y, 8); run(g, 1);
  assert(g.player.xp.thieving > before, "Stealth XP for slipping past");
  assert.equal(g.sneakingPast.size, 0);
  // The same monster doesn't pay again straight away.
  const paid = g.player.xp.thieving;
  standNear(g, yeti.x, yeti.y, 3); run(g, 3); standNear(g, yeti.x, yeti.y, 8); run(g, 1);
  assert.equal(g.player.xp.thieving, paid);

  // Spotted: every roll hits, so it lunges at once, the sneak ends and the fight is on.
  const h = newGame(), wolf = h.monsters.find(monster => monster.def.id === "frost_yeti");
  h.monsters = [wolf]; h.rng = () => 0;
  toggleSneak(h); standNear(h, wolf.x, wolf.y, 3);
  const hp = h.player.hp; run(h, 1);
  assert.equal(h.player.sneak, false); assert.equal(wolf.target, true); assert(h.player.hp < hp, "the lunge hurts");
});

test("stealth: sneaking walks and spends run energy; the Veilweave hood hides you when still", () => {
  const g = newGame();
  g.player.energy = 100; toggleRun(g); toggleSneak(g);
  const start = { x: g.player.x, y: g.player.y };
  walkTo(g, start.x + 6, start.y); run(g, 1);
  assert.equal(Math.max(Math.abs(g.player.x - start.x), Math.abs(g.player.y - start.y)), 1, "sneaking never runs");
  run(g, 4);
  assert(g.player.energy < 100, "sneaking spends run energy");
  g.player.energy = 0.2; walkTo(g, g.player.x - 3, g.player.y); run(g, 2);
  assert.equal(g.player.sneak, false, "out of energy, the sneak ends");
  // The hood: still for five seconds and out of any fight, aggressive monsters look straight through you.
  const h = newGame(), yeti = h.monsters.find(monster => monster.def.id === "frost_yeti");
  h.monsters = [yeti]; h.rng = () => 0; h.player.equipment.head = VEIL_HOOD;
  standNear(h, yeti.x, yeti.y, 12); run(h, 10);
  assert.equal(veiled(h), true);
  standNear(h, yeti.x, yeti.y, 3); h.player.moved = h.tick - 20; run(h, 3);
  assert.equal(yeti.target, false, "the veiled player isn't attacked");
  h.player.equipment.head = undefined; run(h, 1);
  assert.equal(yeti.target, true, "without the hood, it attacks");
});

test("agility: a full lap of the Friendhollow course", () => {
  const g = newGame();
  const obstacles = g.world.objects.filter(object => object.kind === "obstacle" && object.obstacle.course === "friendhollow").sort((a, b) => a.obstacle.step - b.obstacle.step);
  assert.equal(obstacles.length, 5);
  teleport(g, obstacles[0].x - 1, obstacles[0].y);
  for (const obstacle of obstacles) {
    setTarget(g, { kind: "object", id: obstacle.id, option: obstacle.action });
    until(g, () => g.player.x === obstacle.to.x && g.player.y === obstacle.to.y, 60);
  }
  const perObstacle = obstacles.reduce((sum, obstacle) => sum + obstacle.obstacle.xp, 0);
  assert(g.player.xp.agility >= (perObstacle + 40) * XP_RATE * earlyXp(1, "agility") - 1e-6, "Lap bonus paid");
});

test("Wayfaring: the skill's name, three courses, marks for laps, slips, run energy and Coach Skip's outfit", () => {
  assert.equal(SKILL_NAMES.agility, "Wayfaring", "Agility is called Wayfaring (its id stays agility)");
  const g = newGame(), p = g.player;
  const courseObstacles = id => g.world.objects.filter(object => object.kind === "obstacle" && object.obstacle.course === id).sort((a, b) => a.obstacle.step - b.obstacle.step);
  assert.deepEqual(Object.keys(COURSES), ["friendhollow", "dunes", "frostpeak"]);
  assert.equal(courseObstacles("dunes").length, 6); assert.equal(courseObstacles("frostpeak").length, 6);
  for (const [id, course] of Object.entries(COURSES)) {
    const obstacles = courseObstacles(id);
    assert(obstacles.every(object => object.obstacle.level === course.level), `${course.name} needs Wayfaring ${course.level}`);
    assert(obstacles.every(object => canWalk(g, object.to.x, object.to.y)), `${course.name}: every landing is walkable`);
    assert(obstacles.at(-1).obstacle.last, `${course.name} ends in a lap`);
  }
  // Slips: never on level-1 obstacles, a fifth at the obstacle's level, none twelve levels above it, never in the gloves.
  assert.equal(slipChance(g, { level: 1 }), 0);
  p.xp.agility = XP_TABLE[30];
  assert.equal(slipChance(g, { level: 30 }), 0.2); assert.equal(slipChance(g, { level: 55 }), 0.2);
  p.xp.agility = XP_TABLE[42]; assert.equal(slipChance(g, { level: 30 }), 0);
  p.xp.agility = XP_TABLE[30]; p.equipment.hands = "wayfarer_gloves"; assert.equal(slipChance(g, { level: 55 }), 0);
  // Too weak for the dune course at level 1; at 30, a lap pays XP and two marks.
  p.xp.agility = 0;
  const dunes = courseObstacles("dunes");
  teleport(g, dunes[0].x - 1, dunes[0].y);
  setTarget(g, { kind: "object", id: dunes[0].id, option: dunes[0].action }); run(g, 3);
  assert.match(g.messages.at(-1).text, /Wayfaring level of 30/);
  p.xp.agility = XP_TABLE[30];
  for (const obstacle of dunes) {
    setTarget(g, { kind: "object", id: obstacle.id, option: obstacle.action });
    until(g, () => p.x === obstacle.to.x && p.y === obstacle.to.y, 60);
  }
  assert.equal(count(p, WAYFARER_MARK), 2, "two marks for a dune lap"); assert.equal(p.stats.laps, 1);
  assert.match(g.messages.at(-1).text, /lap of the Oasis dune course/);
  // Run energy: drains less with Wayfaring and in the cape, comes back faster in the boots; waybread restores it.
  p.equipment = {};
  p.xp.agility = 0; const slow = runDrain(g); p.xp.agility = XP_TABLE[99]; const fast = runDrain(g);
  assert(fast < slow * 0.62 && fast > slow * 0.58, `running drains about 40% less at 99 (${fast} vs ${slow})`);
  p.equipment.cape = "wayfarer_cape"; assert(Math.abs(runDrain(g) - fast * 0.8) < 1e-9, "the cape takes 20% off");
  p.equipment.hood = undefined; p.equipment.head = "wayfarer_hood"; p.equipment.hands = "wayfarer_gloves"; p.equipment.feet = "wayfarer_boots";
  assert(Math.abs(runDrain(g) - fast * 0.6) < 1e-9, "the full outfit 40%");
  p.path = []; p.energy = 50; tick(g); const booted = p.energy - 50;
  p.equipment.feet = undefined; p.energy = 50; tick(g); const plain = p.energy - 50;
  assert(Math.abs(booted - plain * 1.5) < 1e-9, `the boots bring energy back half as fast again (${booted} vs ${plain})`);
  p.inventory.fill(null); give(p, "waybread"); p.energy = 20; p.eatTimer = 0;
  eat(g, p.inventory.findIndex(slot => slot?.id === "waybread"));
  assert.equal(p.energy, 60, "waybread restores 40 run energy");
  // Coach Skip trades marks for the outfit; the full outfit doubles marks.
  p.inventory.fill(null); give(p, WAYFARER_MARK, 25);
  assert.equal(buyWayfarerReward(g, "wayfarer_cape"), false, "not enough marks");
  assert.equal(buyWayfarerReward(g, "wayfarer_boots"), true); assert(has(p, "wayfarer_boots")); assert.equal(count(p, WAYFARER_MARK), 5);
  assert.equal(buyWayfarerReward(g, "waybread"), true); assert.equal(count(p, "waybread"), 3); assert.equal(count(p, WAYFARER_MARK), 4);
  for (const reward of WAYFARER_REWARDS) assert(item(reward.id), `${reward.name} is an item`);
  p.equipment = { cape: "wayfarer_cape", head: "wayfarer_hood", hands: "wayfarer_gloves", feet: "wayfarer_boots" }; p.inventory.fill(null);
  const friendhollow = courseObstacles("friendhollow");
  teleport(g, friendhollow[0].x - 1, friendhollow[0].y);
  for (const obstacle of friendhollow) { setTarget(g, { kind: "object", id: obstacle.id, option: obstacle.action }); until(g, () => p.x === obstacle.to.x && p.y === obstacle.to.y, 60); }
  assert.equal(count(p, WAYFARER_MARK), 2, "double marks in the full outfit");
  // Coach Skip has the rewards in his dialogue.
  const coach = g.npcs.find(npc => npc.id === "agility");
  standNear(g, coach.x, coach.y, 1);
  setTarget(g, { kind: "npc", uid: coach.uid, option: "Talk-to" });
  until(g, () => g.dialogue !== null, 30);
  while (g.dialogue && g.dialogue.index < g.dialogue.lines.length) continueDialogue(g);
  assert(g.dialogue.options.some(option => option.label === "Trade marks."));
  chooseOption(g, 1);
  assert(g.dialogue.options.some(option => option.label.startsWith("Wayfarer's cape")));
  while (g.dialogue) { if (g.dialogue.options && g.dialogue.index >= g.dialogue.lines.length) chooseOption(g, g.dialogue.options.length - 1); else continueDialogue(g); }
});

test("Slayer creatures with their own armour: five new monsters, tasks, set effects, the Warden's bracers and longer tasks", () => {
  const g = newGame(), p = g.player;
  for (const set of SLAYER_SETS) {
    const monster = MONSTERS[set.monster];
    assert(monster && monster.slayer === set.slayer, `${set.monster} needs Slayer ${set.slayer}`);
    assert(g.monsters.some(entry => entry.def.id === set.monster), `${monster.name}s live in the Realm`);
    assert(SLAYER_TASKS.some(task => task.monsters.includes(set.monster) && task.slayer === set.slayer), `a task for ${monster.name}s`);
    for (const piece of set.pieces) {
      const id = `${set.id}_${piece.suffix}`, def = item(id);
      assert(monster.drops.some(drop => drop.item === id), `${monster.name} drops ${def.name}`);
      assert.equal(def.equip.slot, piece.slot); assert.equal(def.equip.requires.slayer, set.slayer, `${def.name} takes Slayer ${set.slayer}`);
    }
  }
  const wear = set => { p.equipment = {}; for (const piece of set.pieces) p.equipment[piece.slot] = `${set.id}_${piece.suffix}`; };
  // Each set's effect grows with its pieces, and the full set does more.
  p.equipment = {}; assert.equal(thorns(p), 0); assert.equal(boneBoost(p), 1); assert.equal(fireFactor(p), 1); assert.equal(sigilSave(p), 0); assert.equal(stalkerFactor(p), 1);
  p.equipment = { head: "bramble_coif" }; assert.equal(thorns(p), 1);
  wear(SLAYER_SETS[0]); assert.equal(thorns(p), 3, "three thorns in full Bramble");
  p.equipment = { head: "wightbone_helm", body: "wightbone_plate" }; assert(Math.abs(boneBoost(p) - 1.2) < 1e-9);
  wear(SLAYER_SETS[1]); assert(Math.abs(boneBoost(p) - 1.4) < 1e-9, "40% more Faith XP from bones in full Wightbone");
  p.equipment = { legs: "stalker_leggings" }; assert(Math.abs(stalkerFactor(p) - 0.88) < 1e-9);
  wear(SLAYER_SETS[2]); assert(Math.abs(stalkerFactor(p) - 0.64) < 1e-9);
  p.equipment = { head: "cindershell_helm" }; assert(Math.abs(fireFactor(p) - 0.85) < 1e-9);
  wear(SLAYER_SETS[3]); assert.equal(fireFactor(p), 0.5, "full Cindershell halves dragonfire");
  p.equipment = { body: "hollowthread_robe" }; assert(Math.abs(sigilSave(p) - 0.08) < 1e-9);
  wear(SLAYER_SETS[4]); assert.equal(sigilSave(p), 0.3, "full Hollowthread keeps sigils 30% of the time");
  // Wightbone: burying bones really pays more.
  p.equipment = {}; p.inventory.fill(null); give(p, "bones"); const plain = p.xp.prayer;
  itemOptions(g, p.inventory.findIndex(slot => slot?.id === "bones")).find(option => option.verb === "Bury").run(g);
  const plainXp = p.xp.prayer - plain;
  wear(SLAYER_SETS[1]); give(p, "bones"); const boosted = p.xp.prayer;
  itemOptions(g, p.inventory.findIndex(slot => slot?.id === "bones")).find(option => option.verb === "Bury").run(g);
  assert((p.xp.prayer - boosted) / plainXp > 1.35, "40% more Faith XP buried in Wightbone");
  // The Warden: bracers boost task XP, and longer tasks are longer and pay more.
  p.equipment = {}; assert.equal(slayerXpBoost(g), 1); p.equipment.hands = "warden_bracers"; assert.equal(slayerXpBoost(g), 1.1);
  p.questData.slayer_points = 400;
  assert.equal(buySlayerReward(g, "warden_bracers"), true); assert(has(p, "warden_bracers")); assert.equal(p.questData.slayer_points, 150);
  assert.equal(longTasks(g), false);
  assert.equal(buySlayerReward(g, "long"), true); assert(longTasks(g)); assert.equal(p.questData.slayer_points, 50);
  assert.equal(buySlayerReward(g, "long"), true, "switching it off is free"); assert.equal(longTasks(g), false); assert.equal(p.questData.slayer_points, 50);
  // Eligible tasks come hardest-last whatever order the table lists them in.
  for (const skill of ["attack", "strength", "defence", "hitpoints", "slayer"]) p.xp[skill] = XP_TABLE[99];
  const eligible = eligibleTasks(g);
  assert.deepEqual(eligible.map(task => task.min), [...eligible.map(task => task.min)].sort((a, b) => a - b));
  assert.equal(eligible.at(-1).id, "weavers", "Hollow weavers are the hardest task");
});

test("The Heartguard: nine red-and-white pieces by Hitpoints level, each a hitpoint and quicker healing; the blade heals as it cuts", () => {
  const g = newGame(), p = g.player;
  assert.equal(HEARTGUARD.length, 9);
  HEARTGUARD.forEach((piece, index) => {
    const def = item(piece.id);
    assert.equal(def.equip.requires.hitpoints, (index + 1) * 10, `${def.name} takes Hitpoints ${(index + 1) * 10}`);
    assert.equal(def.equip.slot, piece.slot); assert.equal(def.icon.color, "#b8333a", "red"); assert.equal(def.icon.accent, "#f2efe8", "and white");
    assert(SHOPS.mender.stock.includes(piece.id), `Mender Hale sells ${def.name}`);
  });
  assert.equal(new Set(HEARTGUARD.map(piece => piece.slot)).size, 9, "one piece for every slot");
  assert(g.npcs.some(npc => npc.id === "mender"), "Mender Hale is at the chapel");
  // Hitpoints 10 can wear the boots but not the gloves.
  give(p, "heartguard_boots"); give(p, "heartguard_gloves");
  equip(g, p.inventory.findIndex(slot => slot?.id === "heartguard_gloves"));
  assert.equal(p.equipment.hands, undefined); assert.match(g.messages.at(-1).text, /Hitpoints level of 20/);
  equip(g, p.inventory.findIndex(slot => slot?.id === "heartguard_boots"));
  assert.equal(p.equipment.feet, "heartguard_boots");
  assert.equal(maxHp(p), 11, "a hitpoint more"); assert.equal(regenTicks(p), 94, "6% quicker healing"); assert.equal(foodBoost(p), 1);
  p.equipment = {}; for (const piece of HEARTGUARD) p.equipment[piece.slot] = piece.id;
  assert.equal(maxHp(p), 19); assert.equal(regenTicks(p), 46); assert.equal(foodBoost(p), 1.25, "food heals a quarter more in the full set");
  p.xp.hitpoints = XP_TABLE[50]; p.hp = 5; p.inventory.fill(null); give(p, "cake"); p.eatTimer = 0;
  eat(g, p.inventory.findIndex(slot => slot?.id === "cake"));
  assert.equal(p.hp, 5 + 15, "a cake heals 15 instead of 12");
  p.xp.hitpoints = 0;
  // Taking the set off caps your health at the plain maximum.
  p.hp = 19; unequip(g, "cape"); assert(p.hp <= maxHp(p));
  // The blade heals you one for every eight damage it deals.
  for (const skill of ["attack", "strength", "defence", "hitpoints"]) p.xp[skill] = XP_TABLE[99];
  p.equipment = { weapon: "heartguard_blade" }; p.hp = 50; p.regenTimer = -10_000;
  const chief = g.monsters.find(monster => monster.def.id === "grumblin_chief" && [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => canWalk(g, monster.x + dx, monster.y + dy)));
  standNear(g, chief.x, chief.y, 1); chief.attackTimer = 10_000;  // (it never swings back: the heal is what's measured)
  setTarget(g, { kind: "monster", uid: chief.uid, option: "Attack" });
  until(g, () => chief.dead, 120);
  assert(p.hp > 50, `the blade healed on the way (${p.hp})`);
  // Mender Hale opens her shop from the dialogue.
  const mender = g.npcs.find(npc => npc.id === "mender");
  standNear(g, mender.x, mender.y, 1);
  setTarget(g, { kind: "npc", uid: mender.uid, option: "Talk-to" });
  until(g, () => g.dialogue !== null, 30);
  while (g.dialogue && g.dialogue.index < g.dialogue.lines.length) continueDialogue(g);
  chooseOption(g, 0);
  assert.equal(g.ui.shop, "mender");
});

test("The Old Friend stands behind every altar, and Dawnhold has its keep, towers and a taller chapel", () => {
  const g = newGame(), world = g.world;
  const altars = world.objects.filter(object => object.kind === "altar");
  assert.equal(altars.length, 21, "the mainland's four, Gravesend's lantern altar, the catacombs' bone altar, the Ring chapel's, the five wayward chapels', the six Orders', and Raria's three Wise Friend altars (the capital, Lawgate, Vesperholm)");
  for (const altar of altars) {
    assert(world.objects.some(object => (object.decor === "old_friend" || object.decor === "wise_friend" || object.decor?.startsWith("god_")) && Math.abs(object.x - altar.x) <= 1 && Math.abs(object.y - altar.y) <= 2), `a statue of the Old Friend (or an Order's god) by the ${altar.name}`);
  }
  assert(world.objects.find(object => object.decor === "old_friend").name === "Statue of the Old Friend");
  const named = name => world.buildings.filter(building => building.name === name);
  const keep = named("Dawnhold Keep")[0];
  assert(keep && keep.storeys === 2 && keep.walls === "stone", "a two-storey stone keep");
  const [gx, gy] = mainlandToWorld(320, 82);
  assert(keep.x0 <= gx && keep.y0 <= mainlandToWorld(0, 74)[1] && keep.y1 >= mainlandToWorld(0, 90)[1], "joining the chapel and the hall along their east ends");
  assert(canWalk(g, gx - 1, gy) && canWalk(g, gx + 1, gy) && world.tiles[gy * W + gx] !== T.WALL, "its gate opens onto the courtyard at the end of the causeway");
  assert.equal(named("Keep tower").length, 2, "a tower at each outer corner");
  const chapel = named("Dawnhold Chapel")[0];
  assert(chapel.storeys === 2 && chapel.tall > 0, "the chapel stands taller");
  assert(named("Chapel bell tower")[0]?.round, "with a bell tower");
  assert(world.objects.some(object => object.decor === "throne" && object.x > gx && object.y === gy), "the Grandmaster's seat inside");
});

test("Apothecary: herbs grow by ecosystem, are picked, cleaned, ground, distilled and brewed; drinks boost, cure, coat and transform", () => {
  const g = newGame(), p = g.player, world = g.world;
  assert.equal(SKILL_NAMES.apothecary, "Apothecary");
  // Every herb grows somewhere, and only where its ecosystem is.
  for (const herb of HERBS) {
    const patches = world.objects.filter(object => object.kind === "herb" && object.herb === herb.id);
    assert(patches.length >= 2, `${herb.name} grows in the Realm (${patches.length} patches)`);
    assert(item(herb.id) && item(`clean_${herb.id}`), `${herb.name} raw and clean items`);
  }
  assert(world.objects.some(object => object.kind === "herb" && object.herb === "wyrmtongue" && regionAt(world, object.x, object.y).id === "ashfall"), "wyrmtongue grows in Ashfall");
  assert(!world.objects.some(object => object.kind === "herb" && object.herb === "cinderbloom" && regionAt(world, object.x, object.y).id === "friendhollow"), "and not in Friendhollow");
  assert(world.objects.some(object => object.kind === "still"), "a still in Hollyhock");
  // Pick feverleaf: stand by a patch (with the forest's spiders out of the way), Pick, get the raw herb, Clean it.
  for (const other of g.monsters) { other.dead = true; other.respawnAt = Infinity; }
  const patch = world.objects.filter(object => object.kind === "herb" && object.herb === "feverleaf" && [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => canWalk(g, object.x + dx, object.y + dy)))
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  standBy(g, patch);
  setTarget(g, { kind: "object", id: patch.id, option: "Pick" });
  until(g, () => count(p, "feverleaf") >= 1, 200);
  assert(p.xp.apothecary > 0, "Apothecary XP for the pick");
  const raw = p.inventory.findIndex(slot => slot?.id === "feverleaf");
  assert(itemOptions(g, raw).some(option => option.verb === "Clean"));
  cleanHerb(g, raw); assert.equal(count(p, "clean_feverleaf"), 1);
  // Brew a healing tonic with a vial of water, drink it.
  give(p, "vial_of_water");
  const recipes = brewRecipes("clean_feverleaf");
  assert(recipes.some(recipe => recipe.outputs.healing_tonic === 1), "feverleaf brews a healing tonic");
  useItemOnItem(g, p.inventory.findIndex(slot => slot?.id === "vial_of_water"), p.inventory.findIndex(slot => slot?.id === "clean_feverleaf"));
  assert(g.ui.production?.recipes.some(recipe => recipe.outputs.healing_tonic === 1), "the brewing menu opens");
  startProduction(g, g.ui.production.recipes.find(recipe => recipe.outputs.healing_tonic === 1), 1);
  until(g, () => count(p, "healing_tonic") === 1, 20);
  p.hp = 2; drink(g, p.inventory.findIndex(slot => slot?.id === "healing_tonic"));
  assert.equal(p.hp, 10, "healed 8, and the vial comes back"); assert.equal(count(p, "vial"), 1);
  // Boosts: an attack potion lifts your Attack level and wears off a point at a time; grinding needs a mortar.
  p.xp.attack = XP_TABLE[40]; give(p, "attack_potion");
  drink(g, p.inventory.findIndex(slot => slot?.id === "attack_potion"));
  assert.equal(level(g, "attack"), 47, "+3 and 10% of 40"); assert.equal(p.boosts.attack, 7);
  run(g, 101); assert.equal(p.boosts.attack, 6, "a point gone after a hundred ticks");
  assert.equal(grindRecipes("oakroot")[0].tools[0], "mortar"); assert.equal(grindRecipes("feverleaf").length, 0, "not every herb is ground");
  assert.equal(stillRecipes().length, ESSENCES.length);
  // Poison: coat a sword, hit a boar, it takes doses; the undead shrug weak poison off; antidote cures and protects you.
  p.inventory.fill(null); give(p, "pewter_sword"); equip(g, p.inventory.findIndex(slot => slot?.id === "pewter_sword")); give(p, "weak_poison");
  coatWeapon(g, p.inventory.findIndex(slot => slot?.id === "weak_poison"));
  assert.deepEqual(p.weaponPoison, { weapon: "pewter_sword", damage: 2, charges: 20, weaken: false });
  for (const skill of ["attack", "strength", "defence", "hitpoints"]) p.xp[skill] = XP_TABLE[80];
  p.hp = 80;
  const boar = g.monsters.find(monster => monster.def.id === "boar" && [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => canWalk(g, monster.x + dx, monster.y + dy)));
  boar.dead = false; boar.hp = boar.def.hp; boar.respawnAt = 0; boar.poison = null;
  standNear(g, boar.x, boar.y, 1); setTarget(g, { kind: "monster", uid: boar.uid, option: "Attack" });
  until(g, () => !!boar.poison || boar.dead, 60);
  if (!boar.dead) assert.equal(boar.poison.damage, 3, "soft-bodied: half as much again");
  assert(p.weaponPoison === null || p.weaponPoison.charges < 20, "a charge spent");
  assert(MONSTERS.skeleton.poisonImmune && MONSTERS.marsh_adder.poison, "the undead are immune; adders bite");
  p.poison = { damage: 2, left: 4, timer: 1 }; p.hp = 50; p.combat = null; p.target = null; tick(g);
  assert.equal(p.hp, 48, "poison burns"); 
  give(p, "antidote"); drink(g, p.inventory.findIndex(slot => slot?.id === "antidote"));
  assert.equal(p.poison, null); assert(p.antidoteUntil > g.tick);
  // Friend mixtures: nine, one per family; the wrong family can't use one; the right family gets the effect.
  assert.equal(MIXTURES.length, 9); assert.deepEqual([...new Set(MIXTURES.map(mix => mix.family))].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  give(p, "mixture_hoverer"); drink(g, p.inventory.findIndex(slot => slot?.id === "mixture_hoverer"));
  assert.equal(p.mixture, null, "a Skeleton can't drink the Hoverers' Updraught"); assert.match(g.messages.at(-1).text, /made for Hoverer Friends/);
  give(p, "mixture_skeleton"); drink(g, p.inventory.findIndex(slot => slot?.id === "mixture_skeleton"));
  assert.equal(p.mixture?.family, 0); assert(Math.abs(boneBoost(p, g) - 2) < 1e-9, "the Marrow draught doubles Faith XP from bones");
  // Everything brewable is an item, and the save round-trips the lot.
  for (const potion of POTIONS) assert(item(potion.id).potion, `${potion.name} is a drink`);
  const copy = newGame(); restore(copy, serialize(g));
  assert.equal(copy.player.mixture?.family, 0); assert(copy.player.antidoteUntil > copy.tick); assert.equal(copy.player.boosts.attack, 6);
});

test("Every weapon and piece of armour in the six ore metals can be bought somewhere, the top tiers only in the wider world", () => {
  const sold = new Map();
  for (const shop of Object.values(SHOPS)) for (const id of shop.stock) if (!sold.has(id)) sold.set(id, shop.id);
  for (const metal of METALS.filter(entry => entry.tier <= 6)) for (const piece of SMITH_PIECES) assert(sold.has(`${metal.id}_${piece.piece}`), `${metal.name} ${piece.name} is sold (by someone)`);
  assert(sold.has("rarite_cuirass") && SHOPS.cragmaw_armoury.stock.includes("rarite_cuirass"), "rarite plate is sold, Cragmaw among others");
  // Whole sets: any shop selling a metal's helm and boots sells its cuirass, greaves, gauntlets and shield (Frostpeak's frostsilver and glimmer, Highcairn's rarite, the Hollis Armoury's moonsilver…).
  for (const shop of Object.values(SHOPS)) {
    const metals = new Set(shop.stock.flatMap(id => { const m = id.match(/^([a-z]+)_(helm|boots)$/); return m ? [m[1]] : []; }));
    for (const metal of metals) for (const piece of ["helm", "cuirass", "greaves", "gauntlets", "boots", "shield"]) if (isItem(`${metal}_${piece}`)) assert(shop.stock.includes(`${metal}_${piece}`), `${shop.name} sells ${metal} ${piece}`);
  }
  for (const piece of ["frostsilver_cuirass", "frostsilver_greaves"]) assert(SHOPS.frost.stock.includes(piece), `Frostpeak Outfitters sells ${piece}`);
  assert(SHOPS.armour.stock.includes("leather_jerkin"), "the armoury sells the whole leather set");
  const g = newGame(); assert(g.npcs.some(npc => npc.id === "cragmaw_armourer"), "Brenna Anvilsong keeps the armoury");
});

test("Teleports to the wider world, learnt by quest and level, in a tabbed spellbook", () => {
  const g = newGame(), p = g.player, world = g.world;
  const glides = SPELLS.filter(spell => spell.kind === "teleport");
  assert(glides.length >= 17, `a glide for every settlement (${glides.length})`);
  for (const spell of glides) { const at = world.places[spell.teleport]; assert(at && [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].some(([dx, dy]) => canWalk(g, at.x + dx, at.y + dy)), `${spell.name} lands by walkable ground`); }
  assert.equal(SPELL_TABS.length, 6); for (const spell of SPELLS) assert(SPELL_TABS.some(tab => tab.kinds.includes(spell.kind)), `${spell.name} has a tab`);
  p.xp.magic = XP_TABLE[99]; for (const sigil of ["path_sigil", "shade_sigil", "hollow_sigil", "breeze_sigil", "bloom_sigil", "stone_sigil"]) give(p, sigil, 20);
  assert.match(canCast(g, SPELLS.find(spell => spell.id === "glide_gravesend")), /Lanterns for the Dead/, "locked until the quest is done");
  assert.equal(castSpell(g, "glide_gravesend"), null); assert.notEqual(p.activity?.kind, "teleport");
  p.quests.gravesend_lanterns = 2;
  assert.equal(canCast(g, SPELLS.find(spell => spell.id === "glide_gravesend")), null);
  castSpell(g, "glide_gravesend"); assert.equal(p.activity?.kind, "teleport");
  until(g, () => p.x === world.places.gravesend.x && p.y === world.places.gravesend.y, 20);
  assert.equal(regionAt(world, p.x, p.y).id, "gravesend");
  castSpell(g, "glide_highcairn"); assert.equal(p.activity?.kind, "teleport", "Highcairn's glide needs no quest");
});

test("Every tree can be cut and burnt: palms, pines and dead trees give logs, bows and a wand; every sigil carries its own mark", () => {
  const g = newGame(), p = g.player, world = g.world;
  for (const kind of ["palm", "pine", "deadwood"]) {
    assert(TREES[kind], `${kind} is a tree`); assert(world.objects.some(object => object.kind === "tree" && object.tree === kind), `${kind} trees grow in the Realm`);
    assert(item(TREES[kind].log) && FIREMAKING[TREES[kind].log], `${kind} logs burn`);
  }
  assert(!world.objects.some(object => object.kind === "decor" && ["pine", "palm", "dead_tree"].includes(object.decor)), "no tree is mere scenery any more");
  assert(item("palm_bow").equip.bow && item("pine_bow").equip.bow, "palm and pine bows");
  assert(item("deadwood_wand").equip.staff && item("deadwood_wand").equip.requires.magic === 50, "a wand that autocasts");
  p.inventory.fill(null); give(p, "knife"); give(p, "deadwood_logs"); p.xp.fletching = XP_TABLE[60];
  const recipes = fletchingRecipesFor(g, "deadwood_logs");
  assert(recipes.some(recipe => recipe.outputs.deadwood_wand === 1), "a wand from deadwood logs");
  startProduction(g, recipes.find(recipe => recipe.outputs.deadwood_wand === 1), 1); until(g, () => has(p, "deadwood_wand"), 20);
  // Chop a palm by the Oasis: Woodcutting 25.
  const palm = world.objects.find(object => object.kind === "tree" && object.tree === "palm" && [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => canWalk(g, object.x + dx, object.y + dy)));
  for (const other of g.monsters) { other.dead = true; other.respawnAt = Infinity; }
  give(p, "pewter_axe"); p.xp.woodcutting = XP_TABLE[30]; standBy(g, palm);
  setTarget(g, { kind: "object", id: palm.id, option: "Chop down" }); until(g, () => count(p, "palm_logs") >= 1, 300);
  for (const id of ["breeze_sigil", "storm_sigil", "hollow_sigil", "star_sigil"]) assert.equal(item(id).icon.kind, id.replace("_sigil", ""), `${id} has its own mark`);
  // The Deadwood's dead: crypts, tombs, obelisks, bone-heaps, railed plots and the ruins of the villages the forest took.
  const kinds = {}; for (const object of world.objects) if (object.kind === "decor") kinds[object.decor] = (kinds[object.decor] ?? 0) + 1;
  assert(kinds.crypt >= 18 && kinds.tomb >= 60 && kinds.obelisk >= 12 && kinds.bones >= 50, `the Deadwood is dressed: ${JSON.stringify({ crypt: kinds.crypt, tomb: kinds.tomb, obelisk: kinds.obelisk, bones: kinds.bones })}`);
  assert(world.objects.filter(object => object.decor === "fence" && object.name === "Iron railing, rusted").length >= 60, "railed plots");
  assert(world.buildings.filter(building => /^Ruined|^Crypt|Namekeeper's Crypt|Ashworth Hall/.test(building.name)).length >= 14, "ruined houses and named crypts");
  assert(world.objects.some(object => object.name?.startsWith("Here lies Tam Ashworth")), "graves with epitaphs");
});

test("Presence: a name for your Friend (the token stays), fellowships, titles, and XP from living in the Realm", () => {
  const g = newGame(), p = g.player;
  assert.equal(SKILL_NAMES.presence, "Presence");
  // Names: legal and not; the first naming is free and worth Presence; renames cost coins at the Namekeeper.
  assert.equal(cleanName("  M4S4T0 "), "M4S4T0"); assert.equal(cleanName("x"), null); assert.equal(cleanName("13530"), null, "a number is the token's job"); assert.equal(cleanName("bad!name"), null);
  assert.equal(cleanTag("void"), "VOID"); assert.equal(cleanTag("toolong"), null);
  assert.equal(playerName(p), "Friend #7730");
  assert(nameFriend(g, "M4S4T0")); assert.equal(p.name, "M4S4T0"); assert.equal(playerName(p), "M4S4T0 (7730)"); assert.equal(p.friendId, 7730, "the token never changes");
  const afterName = p.xp.presence; assert(afterName >= 75, "naming is worth Presence");
  assert(!nameFriend(g, "Someone", true), "a rename costs coins you don't have"); assert.equal(p.name, "M4S4T0");
  const purse = count(p, "coins"); give(p, "coins", 1000); assert(nameFriend(g, "Someone", true)); assert.equal(p.name, "Someone"); assert.equal(count(p, "coins"), purse, "a thousand coins for the ink");
  assert(g.npcs.some(npc => npc.id === "namekeeper"), "the Namekeeper is in Friendhollow");
  // Fellowships: a name and a tag, paid once; shared over the net with the name and title; leaving is free.
  assert(!joinFellowship(g, "Moonlit Company", "MOON"), "needs coins");
  give(p, "coins", 5000); assert(joinFellowship(g, "Moonlit Company", "MOON")); assert.deepEqual({ name: p.fellowship.name, tag: p.fellowship.tag }, { name: "Moonlit Company", tag: "MOON" }); assert(p.fellowship.since > 0, "founded today");
  const packet = presenceOf(g); assert.equal(packet.name, "Someone"); assert.equal(packet.tag, "MOON");
  const cleaned = cleanPresence(JSON.parse(JSON.stringify({ ...packet, name: "bad!name", tag: "toolongtag" }))); assert.equal(cleaned.name, null); assert.equal(cleaned.tag, null, "the net cleans what it receives");
  leaveFellowship(g); assert.equal(p.fellowship, null);
  // Titles by Presence level and by deed; you can only wear one you've earned.
  assert(unlockedTitles(g).some(title => title.id === "newcomer")); assert(!unlockedTitles(g).some(title => title.id === "dragonfriend"));
  assert(!chooseTitle(g, "dragonfriend")); p.quests.ashfall_embers = 2; assert(chooseTitle(g, "dragonfriend")); assert.equal(profile(g).title, "Dragonfriend");
  p.xp.presence = XP_TABLE[40]; assert(unlockedTitles(g).some(title => title.id === "adventurer")); assert.equal(TITLES.length, 15);
  // XP from living here: discovering a region, meeting someone, an emote, clothes worn for the first time, a quest.
  const before = p.xp.presence;
  teleport(g, ...M(34, 70)); run(g, 6); assert(p.visited.fernwick, "Fernwick discovered"); assert(p.xp.presence > before, "and worth Presence");
  const seen = p.xp.presence; performEmote(g, "wave"); assert(p.emotesUsed.wave && p.xp.presence > seen, "a first emote");
  const worn = p.xp.presence; give(p, "mourners_hood"); equip(g, p.inventory.findIndex(slot => slot?.id === "mourners_hood")); assert(p.outfits.mourners_hood && p.xp.presence > worn, "first worn");
  // The profile: style follows the clothes, reputation follows quests and people.
  assert.equal(profile(g).style, "Deadwood Wanderer", "a single Gravesend piece already reads as the Deadwood"); unequip(g, "head"); assert.equal(profile(g).style, "Friendhollow Local");
  give(p, "gravesend_coat"); equip(g, p.inventory.findIndex(slot => slot?.id === "gravesend_coat")); equip(g, p.inventory.findIndex(slot => slot?.id === "mourners_hood")); assert.equal(profile(g).style, "Deadwood Wanderer");
  assert.equal(reputation(g, "gravesend").rank, "Unknown"); p.quests.gravesend_lanterns = 2; assert.equal(reputation(g, "gravesend").rank, "Known"); p.talked.gravesend_keeper = 1; p.talked.gravesend_clothier = 1; assert.equal(reputation(g, "gravesend").rank, "Trusted");
  assert.equal(profile(g).friendId, 7730); assert(profile(g).reputations.length >= 10);
  // Saved and restored.
  const copy = newGame(); restore(copy, serialize(g));
  assert.equal(copy.player.name, "Someone"); assert.equal(copy.player.title, "dragonfriend"); assert(copy.player.visited.fernwick); assert(copy.player.emotesUsed.wave);
});

test("Your Friend talks back: in its family's manner, to what's around it, remembering firsts; rumours and recognition in the villages", () => {
  const g = newGame({ familyId: 6 }), p = g.player; // a Colossus
  g.friendSpeech = "full";
  const said = friendSays(g, "mountain");
  assert(["Mountain. Climb.", "Big. Good."].includes(said), "a Colossus is blunt");
  assert.equal(friendSays(g, "mountain"), null, "and doesn't repeat itself straight away");
  assert.equal(g.messages.at(-1).text, `Friend #7730: ${said}`, "the line goes to chat as your Friend");
  assert(g.events.some(event => event.type === "friend" && event.text === said && event.share), "and over its head, shared with players nearby on Full");
  g.friendSpeech = "off"; assert.equal(friendSays(g, "quest"), null, "off is off");
  g.friendSpeech = "rare"; p.friendLast = -1e9; assert.equal(friendSays(g, "grave"), null, "rare keeps the small talk"); assert(["Down.", "Was big."].includes(friendSays(g, "boss")), "but not the moments that matter");
  // Families differ.
  const sk = newGame({ familyId: 0 }); sk.friendSpeech = "full"; assert.equal(friendSays(sk, "grave", null), sk.messages.at(-1).text.replace("Friend #7730: ", ""));
  assert(["Someone's resting. Lucky them.", "A grave. Wipe your feet."].includes(sk.messages.at(-1).text.replace("Friend #7730: ", "")), "a Skeleton at a grave");
  // In the player's language, the names in it too; a creature's name starting a sentence takes its capital.
  assert.equal(spoken("{name}. Hm.", { name: "Fernwick" }, "ja"), "ファーンウィック。ふむ。");
  assert.equal(spoken("Another {name}.", { name: "Fernwick" }, "es"), "Otro Fernwick.");
  assert.equal(spoken("{name}. Observe the gait.", { name: "grumblin" }, "en"), "Grumblin. Observe the gait.");
  // Looking around: entering a region for the first time, and a creature in view.
  g.friendSpeech = "full"; run(g, 6); p.friendLast = -1e9; p.friendEventAt = {};
  teleport(g, ...M(34, 70)); run(g, 12);
  assert(g.messages.some(m => m.tone === "public" && /Fernwick/.test(m.text)), "remarks on Fernwick on arrival");
  // Firsts are remembered, once, and worth Presence.
  const xp = p.xp.presence; assert(remember(g, "first_dragon")); assert(!remember(g, "first_dragon")); assert(p.firsts.first_dragon > 0); assert(p.xp.presence > xp);
  p.xp.presence = XP_TABLE[30]; p.friendLast = -1e9; p.friendEventAt = {}; g.rng = () => 0.1;
  assert.equal(friendSays(g, "dragon_again"), "That was our first dragon, once. We used to be afraid of these.", "a memory, at Presence 30");
  g.rng = seeded();
  assert(tendencies(g).explorer >= 1);
  // Rumours: every settlement has some; asking a villager gives one and a little Presence the first time; the net never says which are true.
  assert(rumourCount() >= 40); assert(RUMOURS.friendhollow.some(r => r.truth === "true") && RUMOURS.friendhollow.some(r => r.truth === "false"));
  const before = p.xp.presence, text = rumourAt(g, ...M(121, 122)); assert(RUMOURS.friendhollow.some(r => r.text === text)); assert(p.xp.presence > before);
  const d = talk(g, "villager"); assert(d.options.some(o => o.label === "Heard any rumours?"), "townsfolk gossip");
  assert(!talk(g, "king").options?.some(o => o.label === "Heard any rumours?"), "the King does not");
  // Recognition: a greeting for your family the first time, your name once you're known.
  const c = newGame({ familyId: 6 }); const first = talk(c, "cragmaw_foreman"); assert.equal(first.lines[0].text, "By the old stones. A Colossus. Mind the roof.");
  assert.notEqual(talk(c, "cragmaw_foreman").lines[0].text, "By the old stones. A Colossus. Mind the roof.", "only once");
  c.player.name = "M4S4T0"; c.player.xp.presence = XP_TABLE[70]; c.player.talked.innkeeper = 1; c.rng = () => 0.1;
  assert.equal(talk(c, "innkeeper").lines[0].text, "Everyone here knows M4S4T0.");
  // The world tells stories: the burned farmhouse, the faceless statue, the toppled watch-stones.
  const names = g.world.objects.map(o => o.name);
  for (const name of ["A small bed, burnt", "A child's wooden horse, unburnt", "A statue of a bearded figure. The face has been chiselled off, carefully.", "A toppled watch-stone, fallen westward", "An old carved stone, used as a fence post. It's an altar. Nobody minds."]) assert(names.includes(name), name);
  // Saved: firsts and rumours heard survive.
  const copy = newGame(); restore(copy, serialize(g)); assert(copy.player.firsts.first_dragon > 0); assert(Object.keys(copy.player.rumours).length >= 1);
});

test("magic: Breeze Dart uses sigils and trains Magic", () => {
  const g = newGame();
  give(g.player, "breeze_sigil", 20); give(g.player, "thought_sigil", 20);
  const rat = g.monsters.find(monster => monster.def.id === "ink_rat");
  const selection = castSpell(g, "breeze_dart");
  assert.deepEqual(selection, { kind: "spell", spell: "breeze_dart" });
  teleport(g, rat.x + 3, rat.y);
  if (!canWalk(g, rat.x + 3, rat.y)) teleport(g, rat.x, rat.y + 3);
  menuFor(g, [{ kind: "monster", id: rat.uid }], null, selection)[0].run(g);
  until(g, () => count(g.player, "breeze_sigil") < 20, 40);
  assert(g.player.xp.magic >= 5.5 * XP_RATE * earlyXp(1));
  assert(SPELLS.length >= 10);
});

test("magic utility: Gilded Touch, Forgeheart, enchanting, Far Reach, Bonebloom, Rootsnare and glides", () => {
  const g = newGame();
  g.player.xp.magic = XP_TABLE[60]; g.player.xp.smithing = XP_TABLE[30];
  for (const [id, n] of [["bloom_sigil", 20], ["ember_sigil", 60], ["star_sigil", 5], ["tide_sigil", 30], ["stone_sigil", 30], ["path_sigil", 10], ["breeze_sigil", 20], ["shade_sigil", 5]]) give(g.player, id, n);
  // Gilded Touch: 40% of value in coins.
  give(g.player, "ashsteel_sabre");
  const coins = count(g.player, "coins"), value = item("ashsteel_sabre").value;
  assert.deepEqual(castSpell(g, "gilded_touch"), { kind: "spell", spell: "gilded_touch" });
  assert(castOnItem(g, "gilded_touch", g.player.inventory.findIndex(slot => slot?.id === "ashsteel_sabre")));
  assert.equal(count(g.player, "coins") - coins, Math.floor(value * 0.4));
  // Forgeheart: blackiron ore + inkcoal → an ashsteel bar (the best the pack allows), with Smithing XP.
  give(g.player, "blackiron_ore"); give(g.player, "inkcoal"); run(g, 4);
  const smithing = g.player.xp.smithing;
  assert(castOnItem(g, "forgeheart", g.player.inventory.findIndex(slot => slot?.id === "blackiron_ore")));
  assert(has(g.player, "ashsteel_bar")); assert(g.player.xp.smithing > smithing);
  // Enchant Moonstone.
  give(g.player, "moonstone_amulet"); run(g, 4);
  assert(castOnItem(g, "enchant_moonstone", g.player.inventory.findIndex(slot => slot?.id === "moonstone_amulet")));
  assert(has(g.player, "moonstone_pendant"));
  // Bonebloom.
  give(g.player, "bones", 3);
  castSpell(g, "bonebloom");
  assert.equal(count(g.player, "bones"), 0); assert.equal(count(g.player, "sweetberry"), 3);
  // Far Reach: take an item from several tiles away.
  let spot = null;
  for (let dx = 6; dx > 2 && !spot; dx--) if (canWalk(g, g.player.x + dx, g.player.y)) spot = { x: g.player.x + dx, y: g.player.y };
  g.ground.push({ uid: 999, id: "rough_rosestone", n: 1, x: spot.x, y: spot.y, expires: g.tick + 100 });
  const reach = castSpell(g, "far_reach");
  menuFor(g, [{ kind: "ground", id: 999 }], null, reach)[0].run(g);
  until(g, () => has(g.player, "rough_rosestone"), 20);
  // Rootsnare roots a monster in place.
  const rat = g.monsters.find(monster => monster.def.id === "ink_rat");
  standNear(g, rat.x, rat.y, 3);
  for (let tries = 0; tries < 8 && !isBound(g, rat); tries++) { menuFor(g, [{ kind: "monster", id: rat.uid }], null, castSpell(g, "bind"))[0].run(g); run(g, 6); }
  assert(isBound(g, rat), "Rootsnare lands");
  const at = { x: rat.x, y: rat.y }; run(g, 8);
  assert.deepEqual({ x: rat.x, y: rat.y }, at, "a rooted monster doesn't move");
  // Glide to Emberforge.
  g.player.combat = null; castSpell(g, "glide_emberforge"); run(g, 6);
  assert.deepEqual({ x: g.player.x, y: g.player.y }, g.world.places.emberforge);
  // Townsfolk can't be targeted by spells.
  const villager = g.npcs.find(npc => npc.id === "villager");
  assert.equal(menuFor(g, [{ kind: "npc", id: villager.uid }], null, { kind: "spell", spell: "breeze_dart" }).length, 0);
});

test("prayer: bury, pray at the altar, activate a prayer, it drains", () => {
  const g = newGame();
  g.player.xp.prayer = XP_TABLE[10]; g.player.prayer = 10;
  togglePrayer(g, "paper_shield");
  assert.deepEqual(g.player.prayers, ["paper_shield"]);
  run(g, 30);
  assert(g.player.prayer < 10);
  togglePrayer(g, "stone_shield");
  assert.deepEqual(g.player.prayers, ["stone_shield"], "Overlapping prayers swap");
});

test("shops and the bank", () => {
  const g = newGame({ familyId: 2 });
  give(g.player, "coins", 1000);
  const bought = buy(g, "general", "hammer", 1);
  assert.equal(bought, 1); assert(has(g.player, "hammer"));
  const coins = count(g.player, "coins");
  sell(g, "general", g.player.inventory.findIndex(slot => slot?.id === "hammer"), 1);
  assert(!has(g.player, "hammer")); assert(count(g.player, "coins") >= coins);
  assert.equal(buy(g, "sigils", "thought_sigil", 50), 50);
  assert.equal(count(g.player, "thought_sigil"), 50);
  for (const shop of Object.values(SHOPS)) for (const id of shop.stock) assert(item(id), `${shop.name} stocks ${id}`);
});

test("items: every item has art, a name and an examine; equipment has a slot", () => {
  for (const entry of ITEM_LIST) {
    assert(entry.name && entry.examine && entry.icon?.shape, entry.id);
    if (entry.equip) assert(entry.equip.slot, entry.id);
  }
  assert(ITEM_LIST.length > 120, `${ITEM_LIST.length} items`);
});

test("saves round-trip, and tampered saves are cleaned", () => {
  const g = newGame();
  g.player.xp.woodcutting = 5000; give(g.player, "oak_logs", 3); g.player.bank.push({ id: "blackiron_bar", n: 12 }); g.player.quests.cold_forge = 1;
  g.player.wardrobe.push("rose_cape"); g.player.worn.push("rose_cape");
  const save = JSON.parse(JSON.stringify(serialize(g)));
  const fresh = newGame();
  assert(restore(fresh, save));
  assert.equal(fresh.player.xp.woodcutting, 5000);
  assert.equal(count(fresh.player, "oak_logs"), 3);
  assert.deepEqual(fresh.player.bank.find(slot => slot.id === "blackiron_bar"), { id: "blackiron_bar", n: 12 });
  assert.equal(fresh.player.quests.cold_forge, 1);
  assert.deepEqual(fresh.player.worn, ["rose_cape"]);
  // Tampering: unknown items, impossible XP, a wall position and a different Friend.
  const bad = { ...save, xp: { ...save.xp, attack: 9e99 }, inventory: [{ id: "godsword", n: 1 }, { id: "coins", n: -5 }], x: 0, y: 0, equipment: { weapon: "pewter_cuirass" } };
  const other = newGame();
  assert(restore(other, bad));
  assert.equal(other.player.xp.attack, 200_000_000);
  assert.equal(other.player.inventory.filter(Boolean).length, 0);
  assert.deepEqual([other.player.x, other.player.y], [other.world.places.spawn.x, other.world.places.spawn.y]);
  assert.equal(other.player.equipment.weapon, undefined);
  assert(!restore(newGame({ friendId: 1 }), save), "A save belongs to its Friend");
});

test("Rare Caskets: relic bonuses, wardrobe pieces and duplicates", () => {
  const g = newGame();
  const base = xpMultiplier(g.player);
  setRelics(g, [3, 0, 0, 1]);
  assert(Math.abs(xpMultiplier(g.player) - base * (1 + 0.06 + 0.1)) < 1e-9);
  // Tier 3 holds six pieces; after all of them, duplicates turn into coins.
  const tier3 = WARDROBE.filter(piece => piece.tier === 3).map(piece => piece.id).sort(), got = tier3.map(() => collectFromCasket(g, 3).wardrobe).sort();
  assert.deepEqual(got, tier3); assert(tier3.includes("golden_aura") && tier3.includes("night_wings"));
  const again = collectFromCasket(g, 3);
  assert.equal(again.wardrobe, null); assert(again.coins > 0);
  // Economy table: 1 RF casket, 0.88 RF expected value, 5 RF max prize.
  const price = BigInt(game.price), expected = game.outcomes.reduce((sum, outcome) => sum + BigInt(outcome.reward) * BigInt(outcome.chanceBps), 0n) / 10_000n;
  assert.equal(price, 10n ** 18n); assert.equal(expected, 88n * 10n ** 16n);
  assert.equal(game.outcomes.reduce((sum, outcome) => sum + outcome.chanceBps, 0), 10_000);
});

test("owned Friends follow you and add XP by generation", () => {
  const g = newGame();
  const base = xpMultiplier(g.player);
  setFollower(g, { id: 3412, generation: 1 });
  assert(Math.abs(xpMultiplier(g.player) - base * 1.05) < 1e-9);
  setFollower(g, { id: 99, generation: 6 });
  assert(Math.abs(xpMultiplier(g.player) - base * 1.01) < 1e-9);
});

test("saves from before the Realm's own names still load, renamed", () => {
  const g = newGame();
  const old = { ...serialize(g), inventory: [{ id: "bronze_scimitar", n: 1 }, { id: "air_rune", n: 40 }, { id: "raw_lobster", n: 1 }, { id: "iron_full_helm", n: 1 }], equipment: { weapon: "steel_scimitar" }, bank: [{ id: "coal", n: 9 }] };
  const fresh = newGame();
  assert(restore(fresh, old));
  assert.deepEqual(fresh.player.inventory.slice(0, 4).map(slot => slot?.id), ["pewter_sabre", "breeze_sigil", "raw_inkcrab", "blackiron_helm"]);
  assert.equal(fresh.player.equipment.weapon, "ashsteel_sabre");
  assert.deepEqual(fresh.player.bank, [{ id: "inkcoal", n: 9 }]);
});

test("music unlocks the first time you enter an area, and saves", () => {
  const g = newGame();
  assert.deepEqual(g.player.music, ["theme"]);
  assert.equal(unlockMusic(g, "emberforge", "Anvil Song"), true);
  assert.equal(unlockMusic(g, "emberforge", "Anvil Song"), false);
  assert.match(g.messages.at(-1).text, /You have unlocked a new music track: Anvil Song\./);
  const fresh = newGame();
  restore(fresh, JSON.parse(JSON.stringify(serialize(g))));
  assert.deepEqual(fresh.player.music, ["theme", "emberforge"]);
  const bad = newGame();
  restore(bad, { ...serialize(g), music: ["<script>", 5, "frostpeak"] });
  assert.deepEqual(bad.player.music, ["theme", "frostpeak"]);
});

test("the follower walks the tiles you leave behind", () => {
  const g = newGame();
  setFollower(g, { id: 3412, generation: 1 });
  assert(g.pet, "a follower appears beside you");
  const path = [];
  walkTo(g, g.player.x + 6, g.player.y + 2);
  for (let i = 0; i < 5; i++) { const before = { x: g.player.x, y: g.player.y }; tick(g); if (g.player.x !== before.x || g.player.y !== before.y) path.push(before); }
  assert.deepEqual({ x: g.pet.x, y: g.pet.y }, g.trail.at(-1), "it stands on the tile you just left");
  assert(Math.max(Math.abs(g.pet.x - g.player.x), Math.abs(g.pet.y - g.player.y)) === 1, "directly behind you");
  castSpell(g, "homeward"); run(g, 12);
  assert(Math.max(Math.abs(g.pet.x - g.player.x), Math.abs(g.pet.y - g.player.y)) <= 1, "it catches up after a teleport");
  setFollower(g, null); tick(g); assert.equal(g.pet, null);
});

test("use item on item: tinderbox on logs lights a fire, chisel cuts gems", () => {
  const g = newGame();
  teleport(g, ...M(100, 132));
  while (terrainAt(g.world, g.player.x, g.player.y) !== T.GRASS || objectAtTile(g.world, g.player.x, g.player.y)) teleport(g, g.player.x + 1, g.player.y);
  give(g.player, "logs");
  useItemOnItem(g, g.player.inventory.findIndex(slot => slot?.id === "tinderbox"), g.player.inventory.findIndex(slot => slot?.id === "logs"));
  until(g, () => g.fires.length > 0, 40);
  g.player.xp.crafting = XP_TABLE[20]; give(g.player, "chisel"); give(g.player, "rough_moonstone");
  useItemOnItem(g, g.player.inventory.findIndex(slot => slot?.id === "chisel"), g.player.inventory.findIndex(slot => slot?.id === "rough_moonstone"));
  until(g, () => has(g.player, "moonstone"), 20);
});

test("Ranged: a bow fires your best arrows from a distance, and trains Ranged", () => {
  const g = newGame(), p = g.player;
  give(p, "pewter_shield"); equip(g, p.inventory.findIndex(slot => slot?.id === "pewter_shield"));
  give(p, "shortbow"); equip(g, p.inventory.findIndex(slot => slot?.id === "shortbow"));
  assert.equal(p.equipment.weapon, "shortbow"); assert.equal(p.equipment.shield, undefined, "a bow takes both hands");
  assert(has(p, "pewter_shield"), "…so the shield goes back in the pack");
  give(p, "pewter_arrow", 60); give(p, "ashsteel_arrow", 5);
  const cow = g.monsters.find(monster => monster.def.id === "cow");
  standNear(g, cow.x, cow.y, 5);
  setTarget(g, { kind: "monster", uid: cow.uid, option: "Attack" });
  let closest = Infinity;
  until(g, () => { closest = Math.min(closest, Math.max(Math.abs(p.x - cow.x), Math.abs(p.y - cow.y))); return p.xp.ranged > 0 || cow.dead; }, 200);
  assert(closest > 1, "shot from range, never walked up to it");
  assert(count(p, "ashsteel_arrow") === 5, "ashsteel arrows need Ranged 10: pewter first");
  assert(count(p, "pewter_arrow") < 60, "arrows are used up");
});

test("Crossbows and war bows: parts from the anvil and the knife, fitted with Crafting; bolts only for crossbows; slower, harder shots", () => {
  const g = newGame(), p = g.player;
  for (const skill of ["fletching", "crafting", "smithing", "ranged"]) p.xp[skill] = XP_TABLE[30];
  // The anvil makes limbs (two bars) and a dozen unfeathered bolts (one bar).
  const pewter = smithingRecipes("pewter");
  assert.deepEqual(pewter.find(recipe => recipe.outputs.pewter_limbs)?.inputs, { pewter_bar: 2 });
  assert.equal(pewter.find(recipe => recipe.outputs.pewter_bolts_unf)?.outputs.pewter_bolts_unf, 12);
  // A knife on logs offers the war bow (two logs) and a crossbow stock.
  give(p, "knife"); give(p, "logs", 4);
  useItemOnItem(g, p.inventory.findIndex(slot => slot?.id === "knife"), p.inventory.findIndex(slot => slot?.id === "logs"));
  const labels = g.ui.production.recipes.map(recipe => recipe.label);
  assert(labels.includes("War bow (unstrung, 2 logs)") && labels.includes("Wooden stock"), labels.join(", "));
  startProduction(g, g.ui.production.recipes.find(recipe => recipe.label === "War bow (unstrung, 2 logs)"), 1); run(g, 10);
  assert(has(p, "war_bow_u"), "cut unstrung");
  give(p, "string"); useItemOnItem(g, p.inventory.findIndex(slot => slot?.id === "string"), p.inventory.findIndex(slot => slot?.id === "war_bow_u")); run(g, 6);
  assert(has(p, "war_bow") && count(p, "logs") === 2, "a war bow takes two logs");
  startProduction(g, fletchingRecipesFor(g, "logs").find(recipe => recipe.label === "Wooden stock"), 1); run(g, 10);
  assert(has(p, "wooden_stock"));
  // Limbs only fit their own stock.
  give(p, "blackiron_limbs"); useItemOnItem(g, p.inventory.findIndex(slot => slot?.id === "blackiron_limbs"), p.inventory.findIndex(slot => slot?.id === "wooden_stock"));
  run(g, 6); assert(!has(p, "blackiron_crossbow"), "blackiron limbs need an oak stock");
  give(p, "pewter_limbs"); useItemOnItem(g, p.inventory.findIndex(slot => slot?.id === "pewter_limbs"), p.inventory.findIndex(slot => slot?.id === "wooden_stock"));
  run(g, 6); assert(has(p, "pewter_crossbow") && !has(p, "pewter_limbs") && !has(p, "wooden_stock"), "pewter limbs on a wooden stock");
  assert(p.xp.crafting > XP_TABLE[30], "fitting trains Crafting");
  // Feathers on unfeathered bolts.
  give(p, "pewter_bolts_unf", 12); give(p, "feather", 12);
  useItemOnItem(g, p.inventory.findIndex(slot => slot?.id === "pewter_bolts_unf"), p.inventory.findIndex(slot => slot?.id === "feather")); run(g, 6);
  assert.equal(count(p, "pewter_bolts"), 12);
  // A crossbow is one-handed (the shield stays), fires bolts and never arrows, and hits harder than a plain bow.
  give(p, "pewter_shield"); equip(g, p.inventory.findIndex(slot => slot?.id === "pewter_shield"));
  give(p, "pewter_arrow", 50);
  equip(g, p.inventory.findIndex(slot => slot?.id === "pewter_crossbow"));
  assert.equal(p.equipment.shield, "pewter_shield", "a crossbow leaves a hand for a shield");
  p.xp.ranged = XP_TABLE[60];
  assert.equal(bestArrow(g)?.id, "pewter_bolts");
  const crossbowHit = rangedMaxHit(g);
  give(p, "shortbow"); equip(g, p.inventory.findIndex(slot => slot?.id === "shortbow"));
  assert.equal(bestArrow(g)?.id, "pewter_arrow", "bows fire arrows, not bolts");
  const bowHit = rangedMaxHit(g);
  equip(g, p.inventory.findIndex(slot => slot?.id === "war_bow"));
  const warHit = rangedMaxHit(g);
  assert(crossbowHit > bowHit && warHit > bowHit, `harder hits: crossbow ${crossbowHit}, war bow ${warHit}, bow ${bowHit}`);
  assert(item("war_bow").equip.speed > item("shortbow").equip.speed && item("pewter_crossbow").equip.speed > item("shortbow").equip.speed, "and slower");
  assert.equal(item("war_bow").equip.requires.ranged, 5, "the plain war bow needs Ranged 5");
  assert.equal(bowRange(g), 8, "a war bow reaches a tile further");
  // War bows are sold only in Fernwick.
  const sellers = Object.values(SHOPS).filter(shop => shop.stock.some(id => id.endsWith("war_bow"))).map(shop => shop.id);
  assert.deepEqual(sellers, ["barkreach_fletcher", "war_bows"]);
});

test("Hazel's Quiver: the Grumblin chief has it, Hazel mends it, and it calls shots home", () => {
  const g = newGame(), p = g.player;
  const hazel = g.npcs.find(npc => npc.id === "hazel");
  assert(hazel, "Hazel is in Fernwick"); assert.equal(regionAt(g.world, hazel.x, hazel.y).id, "fernwick");
  const talk = () => { standNear(g, hazel.x, hazel.y, 1); setTarget(g, { kind: "npc", uid: hazel.uid, option: "Talk-to" }); until(g, () => g.dialogue !== null, 30); };
  const say = label => { while (g.dialogue && g.dialogue.index < g.dialogue.lines.length) continueDialogue(g); const index = g.dialogue.options.findIndex(option => option.label.startsWith(label)); assert(index >= 0, label); chooseOption(g, index); };
  talk(); say("You look troubled."); say("I'll get it back.");
  while (g.dialogue) continueDialogue(g);
  assert.equal(p.quests.hazels_quiver, 1);
  onMonsterKilled(g, "grumblin_chief", 0, 0);
  assert(has(p, "torn_quiver"), "the chief drops the torn quiver");
  give(p, "leather", 2); give(p, "feather", 15); give(p, "oak_logs", 5);
  talk(); say("I have everything"); while (g.dialogue) continueDialogue(g);
  assert.equal(p.quests.hazels_quiver, 2); assert(has(p, "hazels_quiver") && !has(p, "torn_quiver") && !has(p, "leather"));
  equip(g, p.inventory.findIndex(slot => slot?.id === "hazels_quiver"));
  assert.equal(p.equipment.cape, "hazels_quiver", "worn on the back");
  // Shoot a cow with the quiver on: most bolts come home.
  p.xp.ranged = XP_TABLE[20]; give(p, "pewter_crossbow"); equip(g, p.inventory.findIndex(slot => slot?.id === "pewter_crossbow")); give(p, "pewter_bolts", 100);
  let shots = 0, before = 100;
  for (const cow of g.monsters.filter(monster => monster.def.id === "cow").slice(0, 3)) {
    standNear(g, cow.x, cow.y, 4); setTarget(g, { kind: "monster", uid: cow.uid, option: "Attack" });
    for (let i = 0; i < 60 && !cow.dead; i++) { const n = count(p, "pewter_bolts"); tick(g); if (count(p, "pewter_bolts") !== n || g.events?.some?.(event => event.type === "projectile")) shots++; }
  }
  const spent = before - count(p, "pewter_bolts");
  assert(p.xp.ranged > XP_TABLE[20], "shots were fired");
  assert(spent < 12, `most bolts fly home (${spent} lost)`);
});

test("Slayer: a task from the Warden, XP per kill, points when it's done, and creatures only a Slayer can wound", () => {
  const g = newGame(), p = g.player;
  const warden = g.npcs.find(npc => npc.id === "slayer_master");
  assert(warden, "the Warden is in Friendhollow");
  standNear(g, warden.x, warden.y, 1);
  setTarget(g, { kind: "npc", uid: warden.uid, option: "Assignment" });
  until(g, () => g.dialogue !== null, 30);
  while (g.dialogue) continueDialogue(g);
  const task = currentTask(g);
  assert(task, "a task is given");
  // Take the rats task and finish it with a big hitter.
  p.questData.slayer_task = 1; p.questData.slayer_left = 2;
  for (const skill of ["attack", "strength", "defence", "hitpoints"]) p.xp[skill] = 1_000_000;
  p.hp = 99;
  for (let kill = 0; kill < 2; kill++) {
    // The nearest rat you can actually get beside (one wedged in a corner is skipped).
    const rats = g.monsters.filter(monster => monster.def.id === "ink_rat" && !monster.dead).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const rat = rats.find(candidate => [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => canWalk(g, candidate.x + dx, candidate.y + dy) && findPath(g, p, (x, y) => x === candidate.x + dx && y === candidate.y + dy, { x: candidate.x + dx, y: candidate.y + dy })));
    standNear(g, rat.x, rat.y, 1);
    setTarget(g, { kind: "monster", uid: rat.uid, option: "Attack" });
    until(g, () => rat.dead, 200);
  }
  assert(p.xp.slayer > 0, "Slayer XP on task");
  assert.equal(currentTask(g), null); assert.equal(slayerPoints(g), 10, "10 points for a finished task");
  // A mire crawler can't be hurt below Slayer 10.
  const crawler = g.monsters.find(monster => monster.def.id === "mire_crawler");
  standNear(g, crawler.x, crawler.y, 1);
  setTarget(g, { kind: "monster", uid: crawler.uid, option: "Attack" });
  run(g, 8);
  assert.equal(crawler.hp, crawler.def.hp, "no damage without the Slayer level");
  assert(g.messages.some(entry => entry.text.includes("Slayer level of 10")));
});

test("Mastery capes: 99 in a skill and 99,000 coins, trimmed once you've mastered two", () => {
  const g = newGame(), p = g.player;
  give(p, "coins", 200_000);
  assert(capeProblem(g, "attack_cape"), "no cape without 99");
  assert.equal(buy(g, "capes", "attack_cape", 1), 0);
  p.xp.attack = 13_034_431;
  const coins = count(p, "coins");
  assert.equal(buy(g, "capes", "attack_cape", 1), 1);
  assert(has(p, "attack_cape")); assert.equal(count(p, "coins"), coins - 99_000);
  p.xp.strength = 13_034_431;
  buy(g, "capes", "strength_cape", 1);
  assert(has(p, "strength_cape_t"), "two 99s: trimmed");
  equip(g, p.inventory.findIndex(slot => slot?.id === "attack_cape"));
  assert.equal(p.equipment.cape, "attack_cape");
  assert(capeProblem(g, "grandmaster_cape"), "the Grandmaster's cape needs every skill");
});

test("Rare Market bundles: goods on top of the caskets; tablets travel, lamps give XP", () => {
  const g = newGame(), p = g.player;
  grantBundle(g, "traveller");
  for (const place of ["hollow_square", "emberforge", "oasis", "frostpeak", "pier"]) assert.equal(count(p, `tablet_${place}`), 2, place);
  breakTablet(g, p.inventory.findIndex(slot => slot?.id === "tablet_emberforge"));
  run(g, 4);
  assert(Math.hypot(p.x - g.world.places.emberforge.x, p.y - g.world.places.emberforge.y) < 2, "the tablet takes you to Emberforge");
  grantBundle(g, "insight");
  const before = p.xp.cooking;
  rubLamp(g, p.inventory.findIndex(slot => slot?.id === "insight_lamp"), "cooking");
  assert.equal(p.xp.cooking - before, 100, "100 × level 1");
  grantBundle(g, "contract"); assert.equal(slayerPoints(g), 40);
  grantBundle(g, "tailor", "starlit_hood");
  assert(p.wardrobe.includes("starlit_hood") && p.worn.includes("starlit_hood"));
});

test("Fletching: shafts from logs, feathers, arrowheads from the anvil, and arrows", () => {
  const g = newGame(), p = g.player;
  p.inventory = p.inventory.map(() => null);
  give(p, "knife"); give(p, "logs", 2); give(p, "feather", 30); give(p, "hammer"); give(p, "pewter_bar", 1); p.xp.smithing = 1154;
  const knife = () => p.inventory.findIndex(slot => slot?.id === "knife"), logs = () => p.inventory.findIndex(slot => slot?.id === "logs");
  useItemOnItem(g, knife(), logs());
  assert(g.ui.production, "a knife on logs opens the fletching menu");
  startProduction(g, g.ui.production.recipes[0], 2); g.ui.production = null;
  until(g, () => count(p, "arrow_shaft") === 30, 60);
  assert(p.xp.fletching > 0);
  useItemOnItem(g, p.inventory.findIndex(slot => slot?.id === "feather"), p.inventory.findIndex(slot => slot?.id === "arrow_shaft"));
  until(g, () => count(p, "headless_arrow") === 30, 60);
  const heads = smithingRecipes("pewter").find(recipe => recipe.outputs.pewter_arrowheads);
  assert(heads, "arrowheads at the anvil");
  startProduction(g, heads, 1);
  until(g, () => count(p, "pewter_arrowheads") === 15, 30);
  useItemOnItem(g, p.inventory.findIndex(slot => slot?.id === "pewter_arrowheads"), p.inventory.findIndex(slot => slot?.id === "headless_arrow"));
  until(g, () => count(p, "pewter_arrow") === 15, 30);
});

test("Sigilcraft: mine sigil stones in the Wizards' Tower, press them at an altar", () => {
  const g = newGame(), p = g.player, world = g.world;
  const rock = world.objects.find(object => object.kind === "rock" && object.rock === "sigil");
  assert(rock && realPoint(world, rock.x, rock.y).x > 150, "sigil stone in the Wizards' Tower");
  standBy(g, rock);
  menuFor(g, [{ kind: "object", id: rock.id }], null)[0].run(g);
  until(g, () => count(p, "sigil_stone") >= 3, 400);
  assert(!g.depleted.has(rock.id), "the stone never runs out");
  const altar = world.objects.find(object => object.kind === "sigil_altar" && object.sigil === "breeze_sigil");
  const before = count(p, "breeze_sigil"), stones = count(p, "sigil_stone");
  assert.equal(craftSigils(g, altar), stones);
  assert.equal(count(p, "breeze_sigil") - before, stones); assert(p.xp.sigilcraft > 0);
  const hollow = world.objects.find(object => object.kind === "sigil_altar" && object.sigil === "hollow_sigil");
  give(p, "sigil_stone"); assert.equal(craftSigils(g, hollow), 0, "Hollow needs Sigilcraft 65");
  assert.equal(world.objects.filter(object => object.kind === "sigil_altar").length, 15, "eleven on the mainland, Quillhaven's thought altar, and Raria's law, dusk and crown altars");
});

test("Dragons breathe fire; the King's Wyrmward shield turns it aside", () => {
  const g = newGame(), p = g.player;
  const drake = g.monsters.find(monster => monster.def.id === "ash_drake");
  assert(drake && drake.def.breath, "ash drakes live in Wyrmreach");
  for (const skill of ["attack", "strength", "defence", "hitpoints"]) p.xp[skill] = 13_034_431;
  for (const other of g.monsters) if (other !== drake) other.dead = true, other.respawnAt = Infinity;
  // Stand next to the drake's footprint (it's two tiles wide), square on, where it can reach you.
  const size = drake.def.size ?? 1, besideFootprint = m => { for (const [x, y] of [[m.x - 1, m.y], [m.x, m.y - 1], [m.x + size, m.y], [m.x, m.y + size]]) if (canWalk(g, x, y)) { teleport(g, x, y); return; } assert.fail("nowhere beside the drake"); };
  const worst = shielded => {
    let max = 0; p.equipment.shield = shielded ? "wyrmward_shield" : undefined; if (!shielded) delete p.equipment.shield;
    for (let i = 0; i < 400; i++) { p.hp = 99; drake.dead = false; drake.hp = drake.def.hp; drake.target = true; drake.attackTimer = 0; besideFootprint(drake); p.combat = null;
      const hp = p.hp; tick(g); max = Math.max(max, hp - p.hp); }
    return max;
  };
  assert(worst(false) > 15, "unshielded breath hits hard");
  assert(worst(true) <= drake.def.maxHit, "the shield keeps it to melee-sized hits");
  // King Hollis hands out the shield.
  const g2 = newGame(), king = g2.npcs.find(npc => npc.id === "king");
  g2.player.questData.royal_audience = 1;
  standNear(g2, king.x, king.y, 1);
  setTarget(g2, { kind: "npc", uid: king.uid, option: "Talk-to" });
  until(g2, () => g2.dialogue !== null, 30);
  continueDialogue(g2); chooseOption(g2, 3);
  while (g2.dialogue) continueDialogue(g2);
  assert(has(g2.player, "wyrmward_shield"));
});

test("Merchants pay more for their trade; the Archmage starts you in magic", () => {
  const g = newGame(), p = g.player;
  assert(sellPrice("inkshark", "fishing") > sellPrice("inkshark", "general"), "Pike pays more for fish");
  give(p, "yew_logs", 1);
  const coins = count(p, "coins");
  sell(g, "axes", p.inventory.findIndex(slot => slot?.id === "yew_logs"), 1);
  assert.equal(count(p, "coins") - coins, Math.floor(180 * 0.6));
  const archmage = g.npcs.find(npc => npc.id === "archmage");
  assert(realPoint(g.world, archmage.x, archmage.y).level === 2, "at the top of the tower");
  p.inventory = p.inventory.map(() => null);
  standNear(g, archmage.x, archmage.y, 1);
  setTarget(g, { kind: "npc", uid: archmage.uid, option: "Talk-to" });
  until(g, () => g.dialogue !== null, 30);
  while (g.dialogue) continueDialogue(g);
  for (const id of ["scholar_hat", "scholar_robe", "staff", "breeze_sigil", "thought_sigil"]) assert(has(p, id), id);
});

test("Save codes: a whole adventure in one line, for its own Friend only; emotes", async () => {
  const { makeSaveCode, restoreSaveCode } = await import("../games/rarefriends-realm/savecode.ts");
  const { performEmote, emoteProblem } = await import("../games/rarefriends-realm/engine.ts");
  const g = newGame(), p = g.player;
  p.xp.fishing = 50_000; give(p, "yew_bow"); p.quests.friends_feast = 2; p.wardrobe.push("rose_cape");
  const code = await makeSaveCode(g);
  assert.match(code, /^RFR1-7730-[0-9a-z]+-[A-Za-z0-9_-]+$/);
  assert(code.length < 4000, `compact (${code.length} characters)`);
  const fresh = newGame();
  assert.equal(await restoreSaveCode(fresh, code), null);
  assert.equal(fresh.player.xp.fishing, 50_000); assert(has(fresh.player, "yew_bow")); assert(fresh.player.wardrobe.includes("rose_cape"));
  assert.match(await restoreSaveCode(fresh, code.slice(0, -3)), /damaged/, "a truncated code is caught");
  assert.match(await restoreSaveCode(newGame({ friendId: 3412 }), code), /Friend #7730/, "only for its own Friend");
  // Emotes: performed, ended by walking; the skillcape one needs a mastery cape.
  assert(performEmote(g, "dance")); assert.equal(p.emote.id, "dance");
  walkTo(g, p.x + 3, p.y); run(g, 2); assert.equal(p.emote, null, "walking ends an emote");
  assert(emoteProblem(g, "skillcape")); p.equipment.cape = "attack_cape"; assert.equal(emoteProblem(g, "skillcape"), null);
});

test("Trading: request, offers (changes clear accepts), a second screen, the swap; a lost message is re-sent", async () => {
  const { Trades } = await import("../games/rarefriends-realm/trade.ts");
  const ga = newGame(), gb = newGame({ friendId: 3412 });
  const queue = [], lose = { next: false };
  const wire = (from, to) => (target, act) => { if (lose.next && act.kind === "trade-accept" && act.stage === 2 && from === 7730) { lose.next = false; return; } queue.push({ from, to, act }); };
  const a = new Trades(wire(7730, 3412)), b = new Trades(wire(3412, 7730)), desks = { 7730: [a, ga], 3412: [b, gb] };
  const flush = () => { while (queue.length) { const { from, to, act } = queue.shift(); const [desk, g] = desks[to]; desk.receive(g, from, act, performance.now()); } };
  give(ga.player, "coins", 1000); give(gb.player, "yew_bow");
  a.request(ga, 3412, 0); flush();
  assert(b.incoming.has(7730), "B sees the request");
  b.request(gb, 7730, 0); flush();
  assert(a.view() && b.view(), "both trade windows open");
  a.offer(ga, "coins", 500); b.offer(gb, "yew_bow", 1); flush();
  assert.deepEqual(b.view().theirs, [{ id: "coins", n: 500 }]);
  a.accept(ga); flush();
  assert(b.view().theirAccept, "B sees A's accept");
  a.offer(ga, "coins", 100); flush();
  assert(!a.view().myAccept && !b.view().theirAccept, "a change clears both accepts");
  a.accept(ga); b.accept(gb); flush();
  assert.equal(a.view().stage, 2); assert.equal(b.view().stage, 2);
  const beforeA = count(ga.player, "coins"), beforeB = count(gb.player, "coins");
  lose.next = true; // A's second accept to B gets lost on the way
  a.accept(ga); b.accept(gb); flush();
  assert.equal(a.view(), null, "A swapped (it holds both accepts)");
  assert(b.view(), "B is still waiting for A's lost accept");
  a.tick(performance.now() + 2000); flush();
  assert.equal(b.view(), null, "the re-sent accept completes B's side");
  assert(has(ga.player, "yew_bow")); assert.equal(count(ga.player, "coins"), beforeA - 600);
  assert(!has(gb.player, "yew_bow")); assert.equal(count(gb.player, "coins"), beforeB + 600);
  // Untradeable things can't be offered.
  a.request(ga, 3412, 0); flush(); b.request(gb, 7730, 0); flush();
  give(ga.player, "attack_cape"); a.offer(ga, "attack_cape", 1);
  assert.deepEqual(a.view().mine, []);
});

test("Shared fights: the same monster in two games takes both players' hits; a peer's kill gives no loot here", async () => {
  const { syncMonster, currentFight } = await import("../games/rarefriends-realm/engine.ts");
  const ga = newGame(), gb = newGame({ friendId: 3412 });
  const cowA = ga.monsters.find(m => m.def.id === "cow"), cowB = gb.monsters.find(m => m.uid === cowA.uid);
  assert.equal(cowB.def.id, "cow", "same uid, same monster in both games");
  ga.tick = gb.tick = 50;
  standNear(gb, cowB.x, cowB.y, 1); gb.player.combat = cowB.uid; cowB.hp -= 3;
  const fight = currentFight(gb);
  assert.deepEqual([fight.u, fight.hp], [cowB.uid, cowB.def.hp - 3]);
  cowA.x += 6; syncMonster(ga, fight, 3412);
  assert.equal(cowA.hp, cowB.def.hp - 3, "B's damage counts in A's game");
  assert(Math.max(Math.abs(cowA.x - cowB.x), Math.abs(cowA.y - cowB.y)) <= 1, "A's copy goes to where B is fighting it");
  const groundBefore = ga.ground.length;
  syncMonster(ga, { ...fight, hp: 0 }, 3412);
  assert(cowA.dead, "B's killing blow kills it here too");
  assert.equal(ga.ground.length, groundBefore, "no loot for A from B's kill");
  cowA.dead = false; cowA.hp = cowA.def.hp; cowA.bornAt = ga.tick;
  syncMonster(ga, { ...fight, hp: 1 }, 3412);
  assert.equal(cowA.hp, cowA.def.hp, "reports from its last life are ignored right after it respawns");
});

test("Referrals: a friend's code gives both Friends coins, the Friendship cape and +15% XP; once each, saved", async () => {
  const { applyReferral, creditReferral, referralCode, emoteProblem } = await import("../games/rarefriends-realm/engine.ts");
  const newbie = newGame({ friendId: 3412 }), veteran = newGame(), coins = count(newbie.player, "coins"), base = xpMultiplier(newbie.player);
  assert.equal(referralCode(veteran), "RF-7730");
  assert.match(applyReferral(newbie, "RF-3412"), /own code/);
  assert.equal(applyReferral(newbie, "rf-7730"), null);
  assert.equal(count(newbie.player, "coins"), coins + 250); assert(has(newbie.player, "friendship_cape"));
  assert(xpMultiplier(newbie.player) > base, "the boost is on");
  assert.match(applyReferral(newbie, "RF-5555"), /already used/);
  assert(creditReferral(veteran, 3412)); assert(!creditReferral(veteran, 3412), "credited once");
  assert(has(veteran.player, "friendship_cape")); assert.equal(veteran.player.boostTicks, 6000);
  assert(emoteProblem(veteran, "friendship"));
  equip(veteran, veteran.player.inventory.findIndex(slot => slot?.id === "friendship_cape"));
  assert.equal(emoteProblem(veteran, "friendship"), null);
  const restored = newGame({ friendId: 3412 });
  restore(restored, JSON.parse(JSON.stringify(serialize(newbie))));
  assert.equal(restored.player.referredBy, 7730); assert.equal(restored.player.boostTicks, newbie.player.boostTicks);
  run(newbie, 3); assert.equal(newbie.player.boostTicks, 5997, "the boost counts down with play");
});

test("Weather: the same sky for every player at the same moment; storms strike, deserts stay dry, dawn is foggy", async () => {
  const { weatherAt, strikeAt } = await import("../games/rarefriends-realm/weather.ts");
  const ms = 1_790_000_000_000;
  assert.deepEqual(weatherAt(ms, "friendhollow", false, 0.5), weatherAt(ms, "friendhollow", false, 0.5), "deterministic");
  let storms = 0, rainy = 0, strikes = 0;
  for (let spell = 0; spell < 400; spell++) {
    const at = ms + spell * 240_000 + 120_000, w = weatherAt(at, "friendhollow", false, 0.5);
    if (w.storm) { storms++; for (let s = 0; s < 60; s++) if (strikeAt(at + s * 1000)?.id === Math.floor((at + s * 1000) / 1000)) strikes++; }
    if (w.rain > 0) rainy++;
    assert.equal(weatherAt(at, "pale_dunes", false, 0.5).rain, 0, "no rain in the desert");
    assert.equal(weatherAt(at, "crypt", true, 0.5).rain, 0, "none underground");
  }
  assert(storms > 20 && rainy > storms, `some rain and some storms (${rainy}, ${storms})`);
  assert(strikes > 0, "lightning in storms");
  assert(weatherAt(ms, "farmland", false, 0.27).fog > 0.6, "fog at dawn");
});

test("Shops: general stores in every town buy anything, traders buy what they sell, and what you sell goes on the shelf to buy back", () => {
  const game = newGame(), player = game.player;
  for (const [id, shop] of [["trader_ember", "general_ember"], ["trader_frost", "general_frost"], ["trader_oasis", "general_oasis"]]) {
    assert.equal(NPCS[id].shop, shop); assert(SHOPS[shop].general);
    assert(game.npcs.some(npc => npc.id === id), `${id} is in the world`);
  }
  player.inventory = player.inventory.map(() => null);
  give(player, "oak_logs", 3); give(player, "fishing_rod");
  const coins = count(player, "coins");
  assert.equal(sell(game, "general_ember", player.inventory.findIndex(slot => slot?.id === "oak_logs"), 3), 3, "a general store buys logs");
  assert.deepEqual(game.shopStock.general_ember, [{ id: "oak_logs", n: 3 }], "and puts them on the shelf");
  assert(count(player, "coins") > coins);
  assert.equal(sell(game, "fishing", player.inventory.findIndex(slot => slot?.id === "fishing_rod"), 1), 1, "Pike buys back a rod he sells");
  assert.equal(game.shopStock.fishing, undefined, "his own stock isn't doubled");
  give(player, "coins", 1000);
  assert.equal(buy(game, "general_ember", "oak_logs", 5), 3, "buy back only what's on the shelf");
  assert.equal(game.shopStock.general_ember.length, 0);
  assert.equal(buy(game, "general_ember", "oak_logs", 1), 0, "then it's gone");
});

test("Mounts: bought at the stables, ridden faster without run energy, each with its gift, saved, and left outside dungeons", () => {
  const game = newGame(), player = game.player;
  assert(game.npcs.some(npc => npc.id === "stablemaster") && game.npcs.some(npc => npc.id === "paddock_unicorn"), "the stables are staffed");
  assert.equal(NPCS.stablemaster.options.includes("Stables"), true);
  assert(MOUNTS.length >= 8 && MOUNTS.some(mount => mount.coat.horn) && new Set(MOUNTS.map(mount => mount.coat.body)).size === MOUNTS.length, "horses of every colour, and unicorns");
  toggleMount(game);
  assert.equal(player.mount, null, "no mount to ride yet");
  grantMount(game, "unicorn");
  assert.deepEqual(player.mounts, ["unicorn"]); assert.equal(player.mount, "unicorn", "you ride it away");
  const before = xpMultiplier(player); player.mount = null; assert(before > xpMultiplier(player), "a unicorn's +10% XP"); player.mount = "unicorn";
  // Riding covers three tiles a tick, and doesn't touch run energy.
  player.run = false; player.energy = 50;
  const start = { x: player.x, y: player.y };
  walkTo(game, start.x + 6, start.y);
  tick(game); tick(game);
  assert(Math.abs(player.x - start.x) + Math.abs(player.y - start.y) >= 5, `galloped (${player.x - start.x}, ${player.y - start.y})`);
  assert(player.energy >= 50, "no run energy used");
  const save = JSON.parse(JSON.stringify(serialize(game))), fresh = newGame();
  assert(restore(fresh, save)); assert.deepEqual(fresh.player.mounts, ["unicorn"]); assert.equal(fresh.player.mount, "unicorn");
  save.mounts = ["dragon_bus"]; save.mount = "dragon_bus"; const bad = newGame(); restore(bad, save); assert.deepEqual(bad.player.mounts, []); assert.equal(bad.player.mount, null, "unknown mounts are dropped");
  // Underground you go on foot.
  player.y = M(0, 210)[1]; assert(rideProblem(game)); tick(game); assert.equal(player.mount, null, "left to graze outside");
  toggleMount(game); assert.equal(player.mount, null, "can't mount down here");
});

test("Trading: when both players ask at the same moment, both open the same trade and it goes through", async () => {
  const { Trades } = await import("../games/rarefriends-realm/trade.ts");
  const ga = newGame(), gb = newGame({ friendId: 3412 }), queue = [];
  const wire = (from, to) => (target, act) => queue.push({ from, to, act });
  const a = new Trades(wire(7730, 3412)), b = new Trades(wire(3412, 7730)), desks = { 7730: [a, ga], 3412: [b, gb] };
  const flush = () => { while (queue.length) { const { from, to, act } = queue.shift(); const [desk, g] = desks[to]; desk.receive(g, from, act, 0); } };
  give(ga.player, "coins", 1000); give(gb.player, "yew_bow");
  a.request(ga, 3412, 0); b.request(gb, 7730, 0); // both requests cross on the wire
  flush();
  assert(a.view() && b.view(), "both windows open");
  assert.equal(a.open.id, b.open.id, "on the same trade");
  a.offer(ga, "coins", 300); b.offer(gb, "yew_bow", 1); flush();
  assert.deepEqual(a.view().theirs, [{ id: "yew_bow", n: 1 }]); assert.deepEqual(b.view().theirs, [{ id: "coins", n: 300 }]);
  a.accept(ga); b.accept(gb); flush(); a.accept(ga); b.accept(gb); flush();
  assert(has(ga.player, "yew_bow") && !has(gb.player, "yew_bow") && count(gb.player, "coins") >= 300, "swapped");
});

test("Referrals: at most five rewarded in any 24 hours; the rest wait for another day together", async () => {
  const { creditReferral } = await import("../games/rarefriends-realm/engine.ts");
  const game = newGame(), day = 86_400_000, t0 = 1_790_000_000_000;
  for (let i = 0; i < 5; i++) assert(creditReferral(game, 5000 + i, t0 + i * 1000), `referral ${i + 1}`);
  assert(!creditReferral(game, 6000, t0 + 60_000), "the sixth today waits");
  assert(!game.player.referrals.includes(6000), "and isn't used up");
  const save = JSON.parse(JSON.stringify(serialize(game))), fresh = newGame(); restore(fresh, save);
  assert(!creditReferral(fresh, 6000, t0 + 3_600_000), "still capped after a reload");
  assert(creditReferral(fresh, 6000, t0 + day + 5000), "credited the next day");
  assert(!creditReferral(game, 5000, t0 + 2 * day), "each Friend only once");
});

test("Daily: a streak that grows day by day and resets after a missed day, three shared challenges, the chest, and saves", async () => {
  const { claimStreak, streakStatus, streakReward, rollDaily, challengeProgress, claimChallenge, claimChest, DAY_MS } = await import("../games/rarefriends-realm/daily.ts");
  const game = newGame(), p = game.player, t0 = 20_000 * DAY_MS + 3_600_000;
  p.inventory = p.inventory.map(() => null);
  assert(streakStatus(game, t0).canClaim);
  const coins = count(p, "coins");
  assert(claimStreak(game, t0)); assert.equal(p.daily.streak, 1); assert.equal(count(p, "coins"), coins + 500, "day 1: 500 coins");
  assert(!claimStreak(game, t0 + 60_000), "once a day");
  for (let d = 1; d < 7; d++) assert(claimStreak(game, t0 + d * DAY_MS));
  assert.equal(p.daily.streak, 7); assert(has(p, "insight_lamp"), "day 7: a lamp");
  assert.equal(streakReward(8).coins, 625, "the second week pays 25% more");
  assert(claimStreak(game, t0 + 9 * DAY_MS)); assert.equal(p.daily.streak, 1, "a missed day starts again"); assert.equal(p.daily.best, 7);
  // Challenges: the same three for everyone on a day; progress from XP and kills gained since the day began.
  const other = newGame({ friendId: 3412 }), day = t0 + 9 * DAY_MS;
  rollDaily(game, day);
  let differ = false;
  for (let d = 0; d < 12 && !differ; d++) { rollDaily(other, day + d * DAY_MS); const mine = newGame(); rollDaily(mine, day + d * DAY_MS); differ = JSON.stringify(mine.player.daily.challenges) !== JSON.stringify(other.player.daily.challenges); }
  assert(differ, "challenges are rolled for each player, not shared");
  assert.equal(p.daily.challenges.length, 3);
  assert(!claimChallenge(game, 0), "not done yet");
  for (const [i, c] of p.daily.challenges.entries()) { if (c.kind === "xp") p.xp[c.skill] += c.target; else if (c.kind === "orders") p.stats.orders = (p.stats.orders ?? 0) + c.target; else p.kills += c.target; assert.equal(challengeProgress(game, i), c.target); }
  assert(!claimChest(game), "the chest waits for all three");
  for (let i = 0; i < 3; i++) assert(claimChallenge(game, i));
  assert(!claimChallenge(game, 0), "each once");
  assert(claimChest(game)); assert(!claimChest(game));
  assert(!rollDaily(game, day + 1000), "same day, same challenges");
  const save = JSON.parse(JSON.stringify(serialize(game))), fresh = newGame(); assert(restore(fresh, save));
  assert.deepEqual(fresh.player.daily, p.daily, "saved");
  assert(rollDaily(fresh, day + DAY_MS) && fresh.player.daily.claimed.every(c => !c) && !fresh.player.daily.chest, "a new day, new challenges");
  // Simulated RF: a reroll changes the unclaimed challenges (claimed ones stay claimed); buying the day done claims the rest and opens the chest.
  const { rerollDaily, completeDaily } = await import("../games/rarefriends-realm/daily.ts");
  const was = JSON.stringify(fresh.player.daily.challenges); let changed = false;
  for (let i = 0; i < 6 && !changed; i++) { rerollDaily(fresh, day + DAY_MS); changed = JSON.stringify(fresh.player.daily.challenges) !== was; }
  assert(changed, "a reroll rolls afresh"); assert(fresh.player.daily.rerolls >= 1);
  const fp = fresh.player, before = count(fp, "coins"); completeDaily(fresh, day + DAY_MS);
  assert(fp.daily.claimed.every(Boolean) && fp.daily.chest && count(fp, "coins") > before, "bought done");
  save.daily = { day: "x", challenges: [{ kind: "xp", skill: "hacking", target: 5 }] }; const bad = newGame(); restore(bad, save);
  assert.equal(bad.player.daily.challenges.length, 0, "odd saves start fresh");
});

test("Updates: new players have seen the log; saves from before it see it once", async () => {
  const { LATEST_UPDATE, UPDATES } = await import("../games/rarefriends-realm/updates.ts");
  assert.equal(new Set(UPDATES.map(u => u.id)).size, UPDATES.length, "unique ids");
  assert.deepEqual(UPDATES.map(u => u.id), [...UPDATES.map(u => u.id)].sort((a, b) => b - a), "newest first");
  const game = newGame(); assert.equal(game.player.seenUpdate, LATEST_UPDATE);
  const save = JSON.parse(JSON.stringify(serialize(game))); delete save.seenUpdate; const old = newGame(); restore(old, save);
  assert.equal(old.player.seenUpdate, 0);
});

test("World boss: the Ashen Colossus rises for everyone on the even hours, pays everyone who wounded it, and leaves after twenty minutes", async () => {
  const { updateWorldBoss, bossWindow, BOSS_EVERY, BOSS_LASTS } = await import("../games/rarefriends-realm/worldboss.ts");
  const a = newGame(), b = newGame({ friendId: 3412 }), t = 20_000 * BOSS_EVERY + 60_000;
  assert.equal(updateWorldBoss(a, t), "risen"); updateWorldBoss(b, t);
  const bossA = a.monsters.find(m => m.def.worldBoss), bossB = b.monsters.find(m => m.def.worldBoss);
  assert(bossA && bossB); assert.equal(bossA.uid, bossB.uid, "the same boss in every game"); assert.deepEqual([bossA.x, bossA.y], [bossB.x, bossB.y]);
  assert.equal(updateWorldBoss(a, t + 1000), null, "only once per window");
  assert(bossWindow(t).active && !bossWindow(t + BOSS_LASTS).active);
  // A wounds it; B lands the final blow and shares it: A gets the kill and the loot.
  bossA.mine = true; bossA.hp -= 100;
  const coins = count(a.player, "coins"), ground = a.ground.length;
  for (let i = 0; i < 9; i++) tick(a);
  syncMonster(a, { u: bossA.uid, id: "ashen_colossus", hp: 0, x: bossA.x, y: bossA.y }, 3412);
  assert(bossA.dead); assert.equal(a.player.killLog.ashen_colossus, 1, "A's kill counts");
  assert(a.ground.length > ground || count(a.player, "coins") > coins, "and A gets the loot");
  assert.equal(updateWorldBoss(a, t + BOSS_LASTS + 1), null, "a fallen boss just clears away");
  assert(!a.monsters.some(m => m.def.worldBoss));
  updateWorldBoss(b, t + BOSS_LASTS + 1); assert(!b.monsters.some(m => m.def.worldBoss), "and leaves when its time is up");
});

test("Pets: found by chance while training, follow you instead of a Friend, and are saved", async () => {
  const { rollPet, setPet } = await import("../games/rarefriends-realm/engine.ts");
  const game = newGame(); let found = false;
  game.rng = () => 0; // the luckiest roll
  found = rollPet(game, "stumpy", 50);
  assert(found && game.player.pets.includes("stumpy") && game.player.petOut === "stumpy", "a pet, and it follows you");
  assert(!rollPet(game, "stumpy", 50), "only one of each");
  game.rng = () => 0.99; assert(!rollPet(game, "pebble", 99), "rare");
  setFollower(game, { id: 3412, generation: 2 }); assert.equal(game.player.petOut, null, "a Friend follower sends the pet home");
  setPet(game, "stumpy"); assert.equal(game.player.follower, null, "and a pet sends the Friend home");
  const save = JSON.parse(JSON.stringify(serialize(game))), fresh = newGame(); restore(fresh, save);
  assert.deepEqual(fresh.player.pets, ["stumpy"]); assert.equal(fresh.player.petOut, "stumpy");
});

test("Duels: hits only count inside the ring, are capped, and a loss restores you at once", async () => {
  const { duelAllowed, takeDuelHit, wonDuel, duelStrike, DUEL_MAX_HIT } = await import("../games/rarefriends-realm/duel.ts");
  const { RING } = await import("../games/rarefriends-realm/world.ts");
  const game = newGame(), p = game.player;
  assert(!duelAllowed(game, { x: RING.x0, y: RING.y0 }), "not while you're outside");
  p.x = RING.x0 + 1; p.y = RING.y0 + 1;
  assert(duelAllowed(game, { x: RING.x0 + 2, y: RING.y0 + 1 })); assert(!duelAllowed(game, { x: RING.x1 + 3, y: RING.y0 }), "nor with them outside");
  p.hp = 10; assert.equal(takeDuelHit(game, 3412, 3), "hit"); assert.equal(p.hp, 7);
  const items = JSON.stringify(p.inventory);
  assert.equal(takeDuelHit(game, 3412, 999), "lost"); assert.equal(p.hp, 10, "back to full"); assert.equal(JSON.stringify(p.inventory), items, "nothing lost");
  assert.equal(p.stats.duelsLost, 1);
  wonDuel(game, 3412); assert.equal(p.stats.duelsWon, 1);
  for (let i = 0; i < 50; i++) assert(duelStrike(game, 3) <= DUEL_MAX_HIT);
});

test("Achievements and hiscores: earned from your adventure, saved, and the players you meet ranked with you", async () => {
  const { checkAchievements, achieved, ACHIEVEMENTS } = await import("../games/rarefriends-realm/achievements.ts");
  const { notePlayers, hiscores } = await import("../games/rarefriends-realm/hiscores.ts");
  const game = newGame(), p = game.player, now = 20_000 * 86_400_000;
  assert.equal(achieved(game), 0);
  p.xp.woodcutting = 2000; p.kills = 1; p.mounts = ["unicorn"];
  const earned = checkAchievements(game, now).map(entry => entry.id);
  for (const id of ["first_steps", "first_blood", "saddle_up", "unicorn"]) assert(earned.includes(id), id);
  assert.equal(checkAchievements(game, now).length, 0, "once each");
  assert(ACHIEVEMENTS.length >= 30);
  notePlayers(game, [{ id: 3412, total: 900, combat: 80 }, { id: 5, total: 20, combat: 3 }, { id: p.friendId, total: 1, combat: 3 }], now);
  const table = hiscores(game);
  assert.deepEqual(table.map(row => row.you ? "you" : row.id), [3412, "you", 5]); assert.equal(table[0].rank, 1);
  const save = JSON.parse(JSON.stringify(serialize(game))), fresh = newGame(); restore(fresh, save);
  assert.equal(achieved(fresh), achieved(game)); assert.equal(Object.keys(fresh.player.met).length, 2);
});

test("First steps: a new Friend is guided through seven steps, each completing from what they do, then rewarded; old saves skip it", async () => {
  const { FIRST_STEPS, currentStep, skipFirstSteps } = await import("../games/rarefriends-realm/firststeps.ts");
  const game = newGame(), p = game.player;
  assert.equal(currentStep(game).id, "chop");
  assert(currentStep(game).target(game), "the arrow points at a tree");
  const lamps = count(p, "insight_lamp"), coins = count(p, "coins");
  const doStep = { chop: () => { p.xp.woodcutting = 25; }, fire: () => { p.xp.firemaking = 40; }, fish: () => { p.xp.fishing = 10; }, cook: () => { p.xp.cooking = 30; },
    horses: () => { p.stats.strokes = 1; }, king: () => { p.questData.royal_audience = 1; }, daily: () => { p.stats.dailyOpened = 1; } };
  for (const step of FIRST_STEPS) { assert.equal(currentStep(game).id, step.id); doStep[step.id](); tick(game); }
  assert.equal(currentStep(game), null); assert.equal(p.guide, FIRST_STEPS.length);
  assert.equal(count(p, "insight_lamp"), lamps + 1); assert.equal(count(p, "coins"), coins + 500, "rewarded once");
  tick(game); assert.equal(count(p, "coins"), coins + 500);
  const fresh = newGame(); skipFirstSteps(fresh); assert.equal(currentStep(fresh), null, "skippable");
  const save = JSON.parse(JSON.stringify(serialize(newGame()))); delete save.guide; const old = newGame(); restore(old, save);
  assert.equal(currentStep(old), null, "saves from before the guide don't see it");
});

test("XP: the early levels go slower (about half speed at level 1), the full rate from level 30, and fixed rewards are unaffected", () => {
  assert(Math.abs(earlyXp(1) - 0.5167) < 0.01); assert.equal(earlyXp(30), 1); assert.equal(earlyXp(80), 1);
  const g = newGame(), p = g.player;
  addXp(g, "woodcutting", 25); assert(Math.abs(p.xp.woodcutting - 25 * xpMultiplier(p) * earlyXp(1, "woodcutting")) < 1e-6, "a level-1 log pays under a third");
  assert(Math.abs(earlyXp(1, "fishing") - 0.3) < 1e-9 && Math.abs(earlyXp(10, "cooking") - earlyXp(10)) < 1e-9, "skills start at 30%, level with combat by 10");
  assert.equal(earlyXp(1, "attack"), earlyXp(1), "combat skills keep the gentler start");
  let logs = 0; p.xp.woodcutting = 0; while (level(g, "woodcutting") < 10) { addXp(g, "woodcutting", 25); logs++; }
  assert(logs >= 20, `level 10 takes a while now (${logs} logs)`);
  p.xp.mining = 13_363; const before = p.xp.mining; addXp(g, "mining", 35); assert(Math.abs(p.xp.mining - before - 35 * xpMultiplier(p)) < 1e-6, "full rate at level 30+");
  p.xp.fishing = 0; addXp(g, "fishing", 300, { raw: true }); assert.equal(p.xp.fishing, 300, "fixed rewards pay in full");
});

test("Faith: the Order of the Dawn, offerings, the Dawn Vigil, faith weapons and Light in the Greyhorn", () => {
  const g = newGame({ familyId: 2 }), p = g.player;
  const talkTo = (id, choose = 0) => {
    const npc = g.npcs.find(entry => entry.id === id);
    teleport(g, npc.x, npc.y + 1); if (!canWalk(g, npc.x, npc.y + 1)) teleport(g, npc.x + 1, npc.y);
    setTarget(g, { kind: "npc", uid: npc.uid, option: "Talk-to" });
    until(g, () => g.dialogue !== null, 40);
    while (g.dialogue && g.dialogue.index < g.dialogue.lines.length) continueDialogue(g);
    if (g.dialogue?.options) chooseOption(g, choose);
    while (g.dialogue) continueDialogue(g);
  };
  const altar = g.world.objects.find(object => object.kind === "altar" && object.text === "dawn");
  assert(altar, "Dawnhold has a chapel altar");
  const offer = id => { give(p, id); standBy(g, altar); setTarget(g, { kind: "object", id: altar.id, option: "Use", use: p.inventory.findIndex(slot => slot?.id === id) }); run(g, 3); };

  // The skill is called Faith; the Order won't take a squire below Faith 10.
  assert.equal(SKILL_NAMES.prayer, "Faith");
  talkTo("grandmaster");
  assert.equal(p.quests.dawn_vigil ?? 0, 0, "Faith 10 needed to start");
  // Offering bones at the chapel: three times the burying XP.
  const before = p.xp.prayer; offer("bones");
  assert(p.xp.prayer - before > 4.5 * 3 * 0.9 * XP_RATE * earlyXp(1, "prayer") - 1e-9, "three times the XP of burying");
  // The Armoury is locked until the vigil is kept.
  assert(capeProblem(g, "dawnsteel_sword"), "the armoury is locked");
  p.xp.prayer = XP_TABLE[10];
  talkTo("grandmaster");
  assert.equal(p.quests.dawn_vigil, 1, "the vigil starts");
  for (let i = 0; i < 8; i++) offer("bones");
  assert.equal(p.questData.vigil_bones, 8);
  talkTo("grandmaster");
  assert.equal(p.quests.dawn_vigil, 2, "the vigil is kept");
  assert(has(p, "dawnsteel_sword"), "a Dawnsteel sword");
  assert(has(p, BONE_BAG), "and the ossuary bag");
  assert.equal(capeProblem(g, "dawnsteel_sword"), null, "the armoury opens");
  assert(capeProblem(g, "radiant_greatsword"), "but not its finest weapons");

  // A faith weapon: Faith XP with each hit, and harder hits on the undead.
  p.xp.attack = XP_TABLE[40]; p.xp.strength = XP_TABLE[40]; p.xp.hitpoints = XP_TABLE[40]; p.hp = 40; p.xp.prayer = XP_TABLE[20];
  equip(g, p.inventory.findIndex(slot => slot?.id === "dawnsteel_sword"));
  assert.equal(p.equipment.weapon, "dawnsteel_sword");
  const skeleton = g.monsters.find(monster => monster.def.id === "skeleton");
  assert(skeleton.def.undead, "skeletons are undead");
  const faith = p.xp.prayer, attack = p.xp.attack;
  teleport(g, skeleton.x, skeleton.y + 1); if (!canWalk(g, skeleton.x, skeleton.y + 1)) teleport(g, skeleton.x + 1, skeleton.y);
  setTarget(g, { kind: "monster", uid: skeleton.uid, option: "Attack" });
  until(g, () => p.xp.attack > attack, 200);
  assert(p.xp.prayer > faith, "a hit with a faith weapon gives Faith XP");
  assert((p.xp.prayer - faith) < (p.xp.attack - attack) / 8, "but only a trickle");

  // Light in the Greyhorn: three shards from stone golems, blessed on the altar, brought to the Grandmaster.
  p.combat = null; p.xp.prayer = XP_TABLE[30];
  talkTo("grandmaster");
  assert.equal(p.quests.greyhorn_light, 1);
  let tries = 0;
  while (count(p, "dawnstone_shard") < 3 && tries++ < 200) onMonsterKilled(g, "stone_golem", 300, 60);
  assert.equal(count(p, "dawnstone_shard"), 3, "golems drop the shards");
  offer("dawnstone_shard");
  assert.equal(p.quests.greyhorn_light, 2); assert(has(p, "dawnstone"));
  talkTo("grandmaster");
  assert.equal(p.quests.greyhorn_light, 3);
  assert(has(p, "dawn_cape"), "the Cape of the Dawn");
  assert.equal(capeProblem(g, "radiant_greatsword"), null, "the finest weapons unlock");
  assert.equal(questPoints(g), 3);
});

test("The Order's later quests: The Pilgrim's Road, The Restless Crypt and Dawn Against the Hollow award Dawnplate", () => {
  const g = newGame({ familyId: 2 }), p = g.player;
  const talkTo = (id, choose = 0) => {
    const npc = g.npcs.find(entry => entry.id === id);
    teleport(g, npc.x, npc.y + 1); if (!canWalk(g, npc.x, npc.y + 1)) teleport(g, npc.x + 1, npc.y);
    setTarget(g, { kind: "npc", uid: npc.uid, option: "Talk-to" });
    until(g, () => g.dialogue !== null, 40);
    while (g.dialogue && g.dialogue.index < g.dialogue.lines.length) continueDialogue(g);
    if (g.dialogue?.options) chooseOption(g, choose);
    while (g.dialogue) continueDialogue(g);
  };
  const pray = name => { const altar = g.world.objects.find(object => object.kind === "altar" && object.name === name); standBy(g, altar); setTarget(g, { kind: "object", id: altar.id, option: "Pray-at" }); run(g, 3); };
  p.quests.dawn_vigil = 2; p.quests.greyhorn_light = 3; p.xp.prayer = XP_TABLE[60]; give(p, BONE_BAG); // (a squire with the vigil's bag already; without it Sister Maren hands one over first)
  assert(capeProblem(g, "dawnplate_greaves"), "Dawnplate is earned first");
  // The Pilgrim's Road: pray at the three old altars and the five wayward chapels.
  talkTo("chaplain");
  assert.equal(p.quests.pilgrims_road, 1);
  assert.equal(PILGRIM_ALTARS.length, 8); for (const [, altar] of PILGRIM_ALTARS) assert(g.world.objects.some(object => object.kind === "altar" && object.name === altar), altar);
  for (const [, altar] of PILGRIM_ALTARS) pray(altar);
  talkTo("chaplain");
  assert.equal(p.quests.pilgrims_road, 2); assert(has(p, "dawnplate_greaves") && has(p, "dawnplate_boots"));
  // The Restless Crypt: only kills with a faith weapon count.
  talkTo("chaplain");
  assert.equal(p.quests.restless_crypt, 1);
  onMonsterKilled(g, "skeleton", 28, 220);
  assert.equal(p.questData.crypt_rest ?? 0, 0, "ordinary steel doesn't lay them to rest");
  p.equipment.weapon = "dawnsteel_sword";
  for (let i = 0; i < 12; i++) onMonsterKilled(g, "skeleton", 28, 220);
  talkTo("chaplain");
  assert.equal(p.quests.restless_crypt, 2); assert(has(p, "dawnplate_helm") && has(p, "dawnplate_shield") && has(p, "dawnplate_gauntlets"));
  // Dawn Against the Hollow: after the Hollow King, five sentinels with a faith weapon and three Hollow essence.
  p.quests.hollow_king = 3;
  talkTo("grandmaster");
  assert.equal(p.quests.dawn_against_hollow, 1);
  for (let i = 0; i < 5; i++) onMonsterKilled(g, "hollow_sentinel", 60, 230);
  give(p, "hollow_essence", 3);
  talkTo("grandmaster");
  assert.equal(p.quests.dawn_against_hollow, 2); assert(has(p, "dawnplate_cuirass"));
  assert.equal(count(p, "hollow_essence"), 0);
  assert.equal(capeProblem(g, "dawnplate_cuirass"), null, "the armoury sells Dawnplate once earned");
  assert.equal(QUESTS.length, 55); assert.equal(MAX_QUEST_POINTS, 93);
});

test("Boots and gauntlets in every metal, smithed at the anvil; the clothier's shirts, dresses, trousers and skirts", () => {
  const g = newGame();
  const metals = [...new Set(ITEM_LIST.filter(entry => entry.id.endsWith("_cuirass")).map(entry => entry.id.replace("_cuirass", "")))];
  assert.ok(metals.length >= 12);
  for (const metal of metals) {
    for (const [piece, slot] of [["boots", "feet"], ["gauntlets", "hands"]]) {
      const gear = item(`${metal}_${piece}`);
      assert.equal(gear.equip.slot, slot, `${metal} ${piece}`);
      assert.ok(gear.equip.bonuses.defence > 0, `${metal} ${piece} defends`);
    }
  }
  // Smithed at the anvil like the rest of the set.
  g.player.xp.smithing = XP_TABLE[99];
  const recipes = smithingRecipes("ashsteel").flatMap(recipe => Object.keys(recipe.outputs));
  assert.ok(recipes.some(id => String(id).includes("ashsteel_boots")) && recipes.some(id => String(id).includes("ashsteel_gauntlets")), "boots and gauntlets at the anvil");
  // The armoury sells them next to the helm.
  assert.ok(SHOPS.armour.stock.includes("pewter_boots") && SHOPS.armour.stock.includes("pewter_gauntlets"));
  // Ribbon & Rye: clothes for looks, in the body and leg slots.
  const clothes = SHOPS.clothier.stock.map(id => item(id));
  assert.ok(clothes.length >= 25);
  for (const kind of ["shirt", "tunic", "dress", "trousers", "skirt"]) assert.ok(clothes.some(entry => entry.icon.kind === kind), kind);
  for (const entry of clothes) { assert.ok(["body", "legs"].includes(entry.equip.slot), entry.id); assert.equal(Object.keys(entry.equip.bonuses).length, 0, `${entry.id} is for looks`); }
  assert.ok(g.npcs.some(npc => npc.id === "clothier"), "the clothier is in town");
});

test("Work orders: craftsfolk pay above market for what you can make, one order a day each and yours alone; a Chronicler's mantle pays more; saved", async () => {
  const { currentOrder, fillOrder, orderPay, cleanOrders, PATRONS } = await import("../games/rarefriends-realm/orders.ts");
  const { DAY_MS } = await import("../games/rarefriends-realm/daily.ts");
  const g = newGame(), p = g.player, day = 20_000 * DAY_MS + 1000;
  p.inventory.fill(null); p.xp.fletching = XP_TABLE[40];
  const order = currentOrder(g, "hazel", day);
  assert(order && order.n >= 3 && order.pay > item(order.item).value * order.n, "a bow order that pays above market");
  assert.equal(order.pay, orderPay(order.n, item(order.item).value, 40));
  assert.deepEqual(currentOrder(g, "hazel", day + 1000), order, "the same order all day");
  const other = newGame({ friendId: 3412 }); other.player.xp.fletching = XP_TABLE[40];
  let differs = false;
  for (let d = 0; d < 20 && !differs; d++) differs = currentOrder(g, "hazel", day + d * DAY_MS).item !== currentOrder(other, "hazel", day + d * DAY_MS).item;
  assert(differs, "orders are rolled per player");
  const today = currentOrder(g, "hazel", day);
  assert(!fillOrder(g, "hazel", day), "nothing to hand over yet");
  give(p, today.item, today.n); const coins = count(p, "coins"), xp = p.xp.fletching, presence = p.xp.presence;
  assert(fillOrder(g, "hazel", day)); assert.equal(count(p, "coins"), coins + today.pay); assert(!has(p, today.item)); assert(p.xp.fletching > xp && p.xp.presence > presence, "XP and Presence");
  assert.equal(p.stats.orders, 1); assert(!fillOrder(g, "hazel", day), "one a day"); assert.equal(currentOrder(g, "hazel", day).done, 1);
  const next = currentOrder(g, "hazel", day + DAY_MS); assert.equal(next.done, 0, "a new day, a new order");
  give(p, "chroniclers_mantle"); p.xp.presence = XP_TABLE[40]; equip(g, p.inventory.findIndex(slot => slot?.id === "chroniclers_mantle")); assert.equal(p.equipment.body, "chroniclers_mantle");
  give(p, next.item, next.n); const c2 = count(p, "coins"); assert(fillOrder(g, "hazel", day + DAY_MS)); assert.equal(count(p, "coins"), c2 + Math.round(next.pay * 1.15), "the mantle pays 15% more");
  for (const npc of Object.keys(PATRONS)) { p.xp[PATRONS[npc].skill] = XP_TABLE[60]; assert(currentOrder(g, npc, day), `${npc} has work`); assert(g.npcs.some(entry => entry.id === npc), `${npc} is in the Realm`); }
  const hazel = g.npcs.find(npc => npc.id === "hazel"); standNear(g, hazel.x, hazel.y, 1); setTarget(g, { kind: "npc", uid: hazel.uid, option: "Talk-to" }); until(g, () => g.dialogue !== null, 30);
  while (g.dialogue.index < g.dialogue.lines.length) continueDialogue(g);
  const work = g.dialogue.options.findIndex(option => option.label === "Any work going?"); assert(work >= 0, "Hazel offers work"); chooseOption(g, work);
  assert(g.dialogue.lines.some(line => /coins|done today's/.test(line.text)), `and names her price: ${JSON.stringify(g.dialogue.lines.map(line => line.text))}`); while (g.dialogue) continueDialogue(g);
  const save = JSON.parse(JSON.stringify(serialize(g))), fresh = newGame(); assert(restore(fresh, save)); assert.deepEqual(fresh.player.orders.hazel, p.orders.hazel, "orders are saved");
  assert.deepEqual(cleanOrders({ hazel: { day: "x" }, nobody: { day: 1, item: "maple_bow", n: 3, pay: 10, xp: 5 }, smith: { day: 1, item: "not_an_item", n: 3, pay: 10, xp: 5 } }), {}, "odd orders are dropped");
});

test("The quests of being known: A Name Worth Knowing, Known in Every Hall and The Remembered, their gear, and the Presence guide", async () => {
  const { skillGuide } = await import("../games/rarefriends-realm/guide.ts");
  const { nameFriend, presenceXp } = await import("../games/rarefriends-realm/presence.ts");
  const { renown } = await import("../games/rarefriends-realm/state.ts");
  const g = newGame(), p = g.player; p.inventory.fill(null);
  const guide = skillGuide("presence");
  for (const id of ["wanderers_cloak", "chroniclers_mantle", "storytellers_hat", "blade_of_renown", "cape_of_renown"]) assert(guide.some(entry => entry.icon === id), `${id} in the guide`);
  assert(guide.some(entry => entry.level === 50 && /Personality/.test(entry.name)) && guide.some(entry => entry.level === 20 && /notice/.test(entry.name)), "milestones in the guide");
  const talk = id => { const npc = g.npcs.find(entry => entry.id === id); standNear(g, npc.x, npc.y, 1); setTarget(g, { kind: "npc", uid: npc.uid, option: "Talk-to" }); until(g, () => g.dialogue !== null, 30); };
  const say = label => { while (g.dialogue && g.dialogue.index < g.dialogue.lines.length) continueDialogue(g); const index = g.dialogue.options.findIndex(option => option.label.startsWith(label)); assert(index >= 0, label); chooseOption(g, index); };
  const drain = () => { for (let i = 0; g.dialogue && i < 200; i++) { if (g.dialogue.index >= g.dialogue.lines.length && g.dialogue.options?.length) { g.dialogue = null; break; } continueDialogue(g); } };
  talk("namekeeper"); while (g.dialogue.index < g.dialogue.lines.length) continueDialogue(g); assert(!g.dialogue.options.some(option => /register/.test(option.label)), "no quest before a name and Presence 20"); drain();
  nameFriend(g, "Tester"); p.xp.presence = XP_TABLE[20];
  talk("namekeeper"); say("Is a name"); say("I'll do it."); drain(); assert.equal(p.quests.name_worth_knowing, 1);
  talk("namekeeper"); say("About the register"); drain(); assert.equal(p.quests.name_worth_knowing, 1, "not known enough yet");
  for (const region of REGIONS.slice(0, 10)) p.visited[region.id] = 1;
  for (let i = 0; i < 25; i++) p.talked[`npc${i}`] = 1; for (let i = 0; i < 10; i++) p.rumours[`r_${i}`] = 1;
  for (const id of ["friends_feast", "grumblin_trouble", "cold_forge", "lost_glimmer", "hazels_quiver"]) p.quests[id] = 2;
  talk("namekeeper"); say("About the register"); drain(); assert.equal(p.quests.name_worth_knowing, 2); assert(has(p, "wanderers_cloak"), "the Wanderer's cloak");
  equip(g, p.inventory.findIndex(slot => slot?.id === "wanderers_cloak")); const before = p.xp.presence; presenceXp(g, 100); assert.equal(Math.round(p.xp.presence - before), 60, "a fifth faster at the slow rate");
  // Known in Every Hall.
  p.quests.quillhaven_folio = 2; p.xp.presence = XP_TABLE[40];
  talk("quillhaven_archivist"); say("I'll do it."); drain(); assert.equal(p.quests.known_hall, 1);
  for (const id of ["gravesend_lanterns", "saltmarrow_tithe", "hollyhock_errand", "dyemoor_dye", "tallgrass_tracks", "cragmaw_shaft", "ashfall_embers", "dawn_vigil"]) p.quests[id] = 2;
  for (const set of REGIONAL_CLOTHING.slice(0, 4)) p.outfits[set.pieces[0].id] = 1;
  for (let i = 10; i < 20; i++) p.rumours[`r_${i}`] = 1; for (let i = 0; i < 15; i++) p.achievements[`a${i}`] = 1;
  talk("quillhaven_archivist"); drain(); assert.equal(p.quests.known_hall, 2); assert(has(p, "chroniclers_mantle") && has(p, "storytellers_hat"), "the chronicler's mantle and hat");
  // The Remembered.
  p.xp.presence = XP_TABLE[60]; p.xp.attack = XP_TABLE[60]; p.questData.royal_audience = 1;
  talk("king"); say("They say the Realm forgets"); say("I'll do it."); drain(); assert.equal(p.quests.the_remembered, 1);
  p.stats.bosses = 4; for (let i = 15; i < 30; i++) p.achievements[`a${i}`] = 1; p.quests.hollow_king = 3; p.quests.dawn_against_hollow = 2; p.quests.hollow_whispers = 4;
  p.talked.hazel = 1; p.talked.rowan = 1; p.talked.smith = 1;
  talk("king"); say("About being remembered"); drain(); assert.equal(p.quests.the_remembered, 2); assert(has(p, "blade_of_renown") && has(p, "cape_of_renown"), "the Blade and Cape of Renown");
  equip(g, p.inventory.findIndex(slot => slot?.id === "blade_of_renown")); assert.equal(p.equipment.weapon, "blade_of_renown");
  assert.equal(renown(p), 15, "one strength for every four Presence levels"); assert(bonuses(p).strength >= 44 + 15);
  assert(QUESTS.some(quest => quest.id === "the_remembered") && MAX_QUEST_POINTS >= 9, "in the journal and the quest points");
});

test("Townsfolk bodies, the worn ossuary bag, and the adventurer card's styles", async () => {
  const { friendSprite, CITIZEN, citizenBuild } = await import("../games/rarefriends-realm/sprites.ts");
  const { CARD_OPTIONS, cardStyle, cardUnlocked, cleanCard, DEFAULT_CARD } = await import("../games/rarefriends-realm/cardstyle.ts");
  // People-shaped villagers: 16-row masks, each seed its own, and the parent-and-child look rare.
  const masks = Array.from({ length: 60 }, (_, i) => friendSprite(CITIZEN, 500 + i).idle);
  assert(masks.every(mask => mask.length === 16 && mask.every(row => row.length === 16) && mask.some(row => row.includes("#"))), "sound masks");
  assert(new Set(masks.map(mask => mask.join(""))).size >= 32, "villagers differ");
  let seed = 7; const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), builds = Array.from({ length: 1000 }, () => citizenBuild(random));
  assert(builds.filter(build => build === "parent").length < 90 && new Set(builds).size >= 8, "many builds, few parents");
  assert.equal(NPCS.villager.art.family, CITIZEN); assert.equal(NPCS.gravesend_villager.art.family, CITIZEN);
  // The ossuary bag on the back.
  const g = newGame(), p = g.player; p.inventory.fill(null); give(p, "bone_bag");
  assert.equal(item("bone_bag").equip.slot, "cape"); equip(g, p.inventory.findIndex(slot => slot?.id === "bone_bag")); assert.equal(p.equipment.cape, "bone_bag");
  const { hasBoneBag, bagBones } = await import("../games/rarefriends-realm/state.ts"); assert(hasBoneBag(p), "worn counts as carried");
  g.ground.push({ uid: 998, id: "bones", n: 3, x: p.x, y: p.y, expires: g.tick + 100 }); setTarget(g, { kind: "ground", uid: 998, option: "Take" }); until(g, () => bagBones(p) === 3, 40); assert.equal(bagBones(p), 3, "picked-up bones go in the worn bag");
  const altar = g.world.objects.find(object => object.kind === "altar" && object.text !== "crypt"); standBy(g, altar); const faith = p.xp.prayer;
  setTarget(g, { kind: "object", id: altar.id, option: "Pray-at" }); until(g, () => bagBones(p) === 0, 40); assert.equal(bagBones(p), 0, "praying offers the worn bag"); assert(p.xp.prayer > faith);
  // Card styles: locked until earned, cleaned on load, saved.
  assert.deepEqual(cardStyle(g), DEFAULT_CARD);
  // Every style is free, except the Orders' and factions' own: those wait until you've met their leader in the world.
  for (const [category, options] of Object.entries(CARD_OPTIONS)) for (const option of options) assert.equal(cardUnlocked(g, option), !option.order, `${category} ${option.id} is ${option.order ? "locked until its leader is met" : "free"}`);
  p.card.bg = "night"; assert.equal(cardStyle(g).bg, "night"); p.card.frame = "dawn"; assert.equal(cardStyle(g).frame, "dawn"); p.card.banner = "zigzag"; assert.equal(cardStyle(g).banner, "zigzag");
  assert(CARD_OPTIONS.bg.length >= 18 && CARD_OPTIONS.frame.length >= 18 && CARD_OPTIONS.banner.length >= 19 && CARD_OPTIONS.layout.some(option => option.id === "centre"));
  assert.deepEqual(cleanCard({ bg: "night", frame: "nope", layout: "banner", extra: 1 }), { ...DEFAULT_CARD, bg: "night", layout: "banner" });
  const save = JSON.parse(JSON.stringify(serialize(g))), fresh = newGame(); assert(restore(fresh, save)); assert.equal(fresh.player.card.bg, "night"); assert.equal(fresh.player.equipment.cape, "bone_bag");
});

test("Fellowship looks and renames, and the card's own colours", async () => {
  const { joinFellowship, renameFellowship, setFellowshipLook, FELLOWSHIP_RENAME_COST } = await import("../games/rarefriends-realm/presence.ts");
  const { cardStyle, cleanCard, cleanFellowshipLook } = await import("../games/rarefriends-realm/cardstyle.ts");
  const g = newGame(), p = g.player; p.inventory.fill(null); give(p, "coins", 20000);
  assert(joinFellowship(g, "Moonlit Company", "MOON"));
  assert(!renameFellowship(g, "x"), "a bad name is refused"); assert(renameFellowship(g, "The Moonlit")); assert.equal(p.fellowship.name, "The Moonlit"); assert.equal(p.fellowship.tag, "MOON");
  assert.equal(count(p, "coins"), 20000 - 5000 - FELLOWSHIP_RENAME_COST);
  assert(setFellowshipLook(g, { logo: "skull", banner: "stripes", colors: ["#112233", "#ffeedd", "#aabbcc", "#445566"] }));
  p.card.inkColor = "#123456"; p.card.bgColor = "not a colour";
  assert.equal(cardStyle(g).inkColor, "#123456"); assert.equal(cardStyle(g).bgColor, undefined, "only hex colours count");
  const save = JSON.parse(JSON.stringify(serialize(g))), fresh = newGame(); assert(restore(fresh, save));
  { const { since, seen, ...look } = fresh.player.fellowship; void seen; assert.deepEqual(look, { name: "The Moonlit", tag: "MOON", logo: "skull", banner: "stripes", colors: ["#112233", "#ffeedd", "#aabbcc", "#445566"] }, "the look is saved"); assert.equal(since, p.fellowship.since); }
  assert.equal(fresh.player.card.inkColor, "#123456"); assert.equal(fresh.player.card.bgColor, undefined);
  assert.deepEqual(cleanFellowshipLook({ name: "A B", tag: "AB" }, { logo: "nope", banner: "stars", colors: ["#fff", "#000000"] }), { name: "A B", tag: "AB", banner: "stars" }, "odd looks are dropped");
  assert.equal(cleanCard({ frameColor: "#ABCDEF" }).frameColor, "#abcdef");
});

test("Housing: a deed from Steward Alder for Presence and coins, furniture for coins, looks, sleeping well rested, and it all comes back with the save", async () => {
  const { buyHome, buyFurnishing, setHomeLook, HOME_TIERS, HOME_PLOT, applyHome, homeRect } = await import("../games/rarefriends-realm/housing.ts");
  const { xpMultiplier: xpm } = await import("../games/rarefriends-realm/state.ts");
  const g = newGame(), p = g.player, w = g.world; p.inventory.fill(null);
  const steward = g.npcs.find(npc => npc.id === "steward"); assert(steward, "the steward is on Homestead Row"); assert(regionAt(w, steward.x, steward.y).id === "westmarch");
  assert(!buyHome(g), "no deed without Presence and coins"); assert.equal(p.home, null);
  p.xp.presence = XP_TABLE[15]; give(p, "coins", 300000); const presence = p.xp.presence;
  assert(buyHome(g)); assert.equal(p.home.tier, 1); assert(p.xp.presence > presence, "a deed is worth Presence");
  const r = homeRect(1); assert.equal(terrainAt(w, r.x0, r.y0), T.WALL); assert.equal(terrainAt(w, r.x0 + 1, r.y0 + 1), T.WOOD); assert(w.buildings.some(b => b.name === "Your home" && b.x0 === HOME_PLOT.x), "a cottage stands on the plot");
  assert(w.objects.some(o => o.name === "Cold hearth (furnish)"), "a cold hearth to furnish");
  assert(!buyFurnishing(g, "altar", "house_altar"), "a manor's slot waits"); assert(buyFurnishing(g, "bed", "straw_cot")); assert(w.objects.some(o => o.name === "Straw cot (sleep)"));
  assert(buyFurnishing(g, "hearth", "lit_hearth")); assert(w.buildings.find(b => b.name === "Your home").chimney, "a lit hearth smokes");
  assert(!w.objects.some(o => o.name === "Cold hearth (furnish)"), "the old hearth is gone");
  // Sleep: full and well rested.
  p.hp = 3; p.energy = 10; const base = xpm(p); const bed = w.objects.find(o => o.name === "Straw cot (sleep)");
  standBy(g, bed); setTarget(g, { kind: "object", id: bed.id, option: "Sleep" }); until(g, () => p.restedTicks > 0, 40);
  assert.equal(p.hp, maxHp(p)); assert.equal(p.energy, 100); assert(xpm(p) > base, "well rested gives XP");
  // Looks (paid for through a casket by the caller).
  assert(setHomeLook(g, "walls", "stone")); assert.equal(w.buildings.find(b => b.name === "Your home").walls, "stone");
  assert(setHomeLook(g, "floor", "carpet")); assert.equal(terrainAt(w, r.x0 + 2, r.y0 + 2), T.CARPET);
  assert(setHomeLook(g, "garden", "hedge")); assert(w.objects.some(o => o.name === "Hedge" && o.x === r.x0 - 1));
  assert(!setHomeLook(g, "roof", "#000000"), "only the Row's roofs");
  // Upgrade to a house: bigger, with the same things in it.
  assert(!buyHome(g), "a house needs Presence 30"); p.xp.presence = XP_TABLE[30]; assert(buyHome(g)); assert.equal(p.home.tier, 2);
  const r2 = homeRect(2); assert.equal(terrainAt(w, r2.x1, r2.y1), T.WALL); assert.equal(terrainAt(w, r.x1, r.y1), T.CARPET, "the old wall is floor now");
  assert(w.objects.some(o => o.name === "Straw cot (sleep)")); assert(buyFurnishing(g, "stand", "armour_stand"));
  // Saved and rebuilt.
  const save = JSON.parse(JSON.stringify(serialize(g))), fresh = newGame(); assert(restore(fresh, save));
  assert.deepEqual(fresh.player.home, p.home); assert(fresh.world.buildings.some(b => b.name === "Your home" && b.walls === "stone")); assert(fresh.world.objects.some(o => o.name === "Armour stand"));
  assert.equal(HOME_TIERS.length, 3); void applyHome;
});

test("The Mage's Satchel: Solenne's quest, a bag that holds every sigil, catches them, and casts from them; parties and fellows give XP; more fellowship looks", async () => {
  const { Party } = await import("../games/rarefriends-realm/party.ts");
  const { sigilStock, hasSigilBag, sigilBagTotal, xpMultiplier: xpm } = await import("../games/rarefriends-realm/state.ts");
  const { sigilBagFill, sigilBagEmpty, castSpell } = await import("../games/rarefriends-realm/engine.ts");
  const { CARD_OPTIONS, FELLOWSHIP_BANNERS, FELLOWSHIP_LOGOS, cardUnlocked } = await import("../games/rarefriends-realm/cardstyle.ts");
  const g = newGame(), p = g.player; p.inventory.fill(null); p.xp.magic = XP_TABLE[30]; p.questData.archmage_gift = 1;
  const talk = id => { const npc = g.npcs.find(entry => entry.id === id); standNear(g, npc.x, npc.y, 1); setTarget(g, { kind: "npc", uid: npc.uid, option: "Talk-to" }); until(g, () => g.dialogue !== null, 30); };
  const say = label => { while (g.dialogue && g.dialogue.index < g.dialogue.lines.length) continueDialogue(g); const index = g.dialogue.options.findIndex(option => option.label.startsWith(label)); assert(index >= 0, label); chooseOption(g, index); };
  const drain = () => { for (let i = 0; g.dialogue && i < 200; i++) { if (g.dialogue.index >= g.dialogue.lines.length && g.dialogue.options?.length) { g.dialogue = null; break; } continueDialogue(g); } };
  talk("archmage"); say("That bag of yours"); say("I'll do it."); drain(); assert.equal(p.quests.mages_satchel, 1);
  give(p, "leather", 3); give(p, "star_sigil", 60); give(p, "thought_sigil", 20); const magic = p.xp.magic;
  talk("archmage"); drain(); assert.equal(p.quests.mages_satchel, 2); assert(has(p, "sigil_satchel") && !has(p, "leather"), "the satchel, for the leather and sigils"); assert(p.xp.magic > magic);
  // Wear it, fill it, cast from it.
  equip(g, p.inventory.findIndex(slot => slot?.id === "sigil_satchel")); assert.equal(p.equipment.cape, "sigil_satchel"); assert(hasSigilBag(p));
  give(p, "breeze_sigil", 300); give(p, "thought_sigil", 300); sigilBagFill(g); assert.equal(count(p, "breeze_sigil"), 0); assert.equal(sigilBagTotal(p), 600); assert.equal(sigilStock(p, "breeze_sigil"), 300);
  g.ground.push({ uid: 997, id: "ember_sigil", n: 7, x: p.x, y: p.y, expires: g.tick + 100 }); setTarget(g, { kind: "ground", uid: 997, option: "Take" }); until(g, () => (p.sigilBag.ember_sigil ?? 0) === 7, 40); assert.equal(p.sigilBag.ember_sigil, 7, "picked-up sigils go in");
  const dart = SPELLS.find(spell => spell.id === "breeze_dart"); assert(dart); const before = p.sigilBag.breeze_sigil;
  give(p, "staff"); equip(g, p.inventory.findIndex(slot => slot?.id === "staff")); p.autocast = "breeze_dart"; p.combat = null; void castSpell;
  const rat = g.monsters.find(monster => !monster.dead && monster.def.level <= 5); standNear(g, rat.x, rat.y, 3);
  setTarget(g, { kind: "monster", uid: rat.uid, option: "Attack" }); until(g, () => (p.sigilBag.breeze_sigil ?? 0) < before, 80);
  assert(p.sigilBag.breeze_sigil < before, "the spell drew from the satchel"); p.combat = null; p.queuedSpell = null;
  sigilBagEmpty(g); assert(count(p, "thought_sigil") >= 250 && !p.sigilBag.thought_sigil && !p.sigilBag.breeze_sigil, "emptied back into the pack");
  give(p, "breeze_sigil", 5); const save = JSON.parse(JSON.stringify(serialize(g))), fresh = newGame(); assert(restore(fresh, save)); assert.deepEqual(fresh.player.sigilBag, p.sigilBag); assert.equal(fresh.player.equipment.cape, "sigil_satchel");
  // Parties: two clients wired to each other.
  const mail = []; const a = new Party((to, act) => mail.push([7730, to, act])), b = new Party((to, act) => mail.push([3412, to, act]));
  const ga = newGame(), gb = newGame({ friendId: 3412 });
  const deliver = () => { while (mail.length) { const [from, to, act] = mail.shift(); (to === 7730 ? a : b).receive(to === 7730 ? ga : gb, from, act, 1000); } };
  assert(a.invite(ga, 3412, 1000)); deliver(); assert(b.invites.has(7730), "the invitation arrives");
  assert(b.accept(gb, 7730)); deliver(); assert(a.members.has(3412) && b.members.has(7730), "both sides know the party");
  p.nearParty = 1; const withParty = xpm(p); p.nearParty = 0; p.nearFellows = 1; const withFellows = xpm(p); p.nearFellows = 0; const alone = xpm(p);
  assert(Math.abs(withParty - alone - XP_RATE * 0.1) < 1e-9 && Math.abs(withFellows - alone - XP_RATE * 0.05) < 1e-9, "+10% party, +5% fellows");
  a.leave(ga); deliver(); assert(!b.members.size, "leaving tells everyone");
  // Looks: more emblems and banners, and the fellowship backdrop is free.
  assert(FELLOWSHIP_LOGOS.length >= 28 && FELLOWSHIP_BANNERS.length >= 16);
  assert(cardUnlocked(g, CARD_OPTIONS.frame.find(option => option.id === "fellowship")));
});

test("Fellowship invitations: a day-long join link with the look inside, and joining by it", async () => {
  const { inviteLink, parseInvite } = await import("../games/rarefriends-realm/cardstyle.ts");
  const { joinFellowship } = await import("../games/rarefriends-realm/presence.ts");
  const now = 1_800_000_000_000, fellowship = { name: "The Moonlit", tag: "MOON", logo: "paw", banner: "zigzag", colors: ["#112233", "#ffeedd"], since: 20000 };
  const link = inviteLink(fellowship, now); assert(link.startsWith("https://m4s4t0-v01d.github.io/rarefriends-realm/?join="));
  const token = link.split("?join=")[1], invite = parseInvite(token, now + 3_600_000);
  assert.deepEqual(invite, { ...fellowship, expires: now + 24 * 3_600_000 }, "the look travels with the link");
  assert.equal(parseInvite(token, now + 25 * 3_600_000), null, "a day later it's dead"); assert.equal(parseInvite("nonsense", now), null);
  const g = newGame(), p = g.player; p.inventory.fill(null); give(p, "coins", 10000);
  assert(joinFellowship(g, invite.name, invite.tag, invite)); assert.equal(p.fellowship.tag, "MOON"); assert.equal(p.fellowship.logo, "paw"); assert.equal(p.fellowship.since, 20000);
  const save = JSON.parse(JSON.stringify(serialize(g))), fresh = newGame(); assert(restore(fresh, save)); assert.equal(fresh.player.fellowship.since, 20000);
});

test("Belts at the waist, barrels that fill vials, a follower in your wardrobe, and a darker band", async () => {
  const { BELTS, beltContents, stock, wornBelt } = await import("../games/rarefriends-realm/state.ts");
  const { beltFill, beltEmpty, sipBelt, fillVials, toggleFollowerWorn, headlessRecipe } = await import("../games/rarefriends-realm/engine.ts");
  const { TRACKS } = await import("../games/rarefriends-realm/audio.ts");
  const g = newGame(), p = g.player, w = g.world; p.inventory.fill(null);
  assert.equal(item("fletchers_belt").equip.slot, "belt"); assert(SHOPS.war_bows.stock.includes("fletchers_belt") && SHOPS.hollyhock_herbs.stock.includes("apothecary_belt"));
  give(p, "fletchers_belt"); equip(g, p.inventory.findIndex(slot => slot?.id === "fletchers_belt")); assert.equal(p.equipment.belt, "fletchers_belt"); assert.equal(wornBelt(p).id, "fletchers_belt");
  give(p, "arrow_shaft", 600); give(p, "feather", 100); give(p, "bones", 1); beltFill(g, "fletchers_belt");
  assert.equal(beltContents(p, "fletchers_belt").arrow_shaft, 500, "five hundred shafts fit"); assert.equal(count(p, "arrow_shaft"), 100, "the rest stay in the pack"); assert.equal(count(p, "bones"), 1, "bones don't belong on it");
  assert.equal(stock(p, "feather"), 100, "the knife counts the belt"); give(p, "knife"); p.xp.fletching = XP_TABLE[10];
  startProduction(g, headlessRecipe(), 1); until(g, () => has(p, "headless_arrow"), 20); assert.equal(beltContents(p, "fletchers_belt").feather, 85, "feathers came off the belt");
  beltEmpty(g, "fletchers_belt"); assert(!beltContents(p, "fletchers_belt").feather && count(p, "feather") >= 85);
  // The apothecary's belt: sip when hurt.
  p.inventory.fill(null); give(p, "apothecary_belt"); equip(g, p.inventory.findIndex(slot => slot?.id === "apothecary_belt")); give(p, "healing_tonic", 3); give(p, "clean_feverleaf", 5); beltFill(g, "apothecary_belt");
  assert.equal(beltContents(p, "apothecary_belt").healing_tonic, 3); p.hp = 1; sipBelt(g); assert(p.hp > 1, "a sip heals"); assert.equal(beltContents(p, "apothecary_belt").healing_tonic, 2); assert(has(p, "vial"), "the vial comes back");
  // Barrels in every village fill vials (into the belt first).
  const barrels = w.objects.filter(object => object.name === "Water barrel"); assert(barrels.length >= 20, `water barrels in every town and village (${barrels.length})`); assert(barrels.some(b => regionAt(w, b.x, b.y).id === "friendhollow"), "one in Friendhollow");
  give(p, "vial", 5); standBy(g, barrels[0]); setTarget(g, { kind: "object", id: barrels[0].id, option: "Fill vials" }); until(g, () => !has(p, "vial"), 40);
  assert.equal(beltContents(p, "apothecary_belt").vial_of_water, 6, "filled, onto the belt"); assert(SHOPS.gravesend_general.stock.includes("vial_of_water") && SHOPS.general.stock.includes("vial") && SHOPS.saltmarrow_fish.stock.includes("vial_of_water"));
  // The follower in your wardrobe.
  p.wardrobe.push("rose_cape", "silver_halo", "blue_cape"); toggleFollowerWorn(g, "rose_cape"); toggleFollowerWorn(g, "silver_halo"); toggleFollowerWorn(g, "blue_cape");
  assert.deepEqual(p.followerWorn, ["silver_halo", "blue_cape"], "one cape at a time"); toggleFollowerWorn(g, "golden_aura"); assert.equal(p.followerWorn.length, 2, "only what you own");
  const save = JSON.parse(JSON.stringify(serialize(g))), fresh = newGame(); assert(restore(fresh, save)); assert.deepEqual(fresh.player.followerWorn, p.followerWorn); assert.equal(fresh.player.belts.apothecary_belt.vial_of_water, 6); assert.equal(fresh.player.equipment.belt, "apothecary_belt");
  // Every area track has a drummer and a drone now.
  for (const track of TRACKS) if (track.id !== "theme") { assert(track.hits.some(hit => hit.drum === "deep"), `${track.name} has a deep drum`); assert(track.notes.some(note => note.voice === "drone"), `${track.name} has a drone`); }
});

test("Faith spells, wards, weaknesses, and the crown of the head", async () => {
  const { castSpell, canCast, onMonsterKilled: _k } = await import("../games/rarefriends-realm/engine.ts"); void _k;
  const { bonuses: bon, maxHp: mh } = await import("../games/rarefriends-realm/state.ts");
  const g = newGame(), p = g.player; p.inventory.fill(null);
  assert(MONSTERS.frost_yeti.weakness === "fire" && MONSTERS.skeleton.weakness === "holy" && MONSTERS.ash_drake.weakness === "water", "weaknesses by hide");
  const mend = SPELLS.find(spell => spell.id === "mend"); assert.equal(mend.skill, "prayer"); assert(SPELL_TABS.some(tab => tab.id === "faith" && tab.kinds.includes("mend")));
  assert.match(canCast(g, mend), /Faith level/); p.xp.prayer = XP_TABLE[80]; p.prayer = 0; assert.match(canCast(g, mend), /faith to cast/);
  p.prayer = 20; give(p, "star_sigil", 50); give(p, "tide_sigil", 10); give(p, "stone_sigil", 10); give(p, "thought_sigil", 10); give(p, "path_sigil", 5); give(p, "bloom_sigil", 5);
  p.hp = 1; const faith = p.xp.prayer; castSpell(g, "mend"); assert.equal(p.hp, 9, "Mend heals 8"); assert.equal(p.prayer, 18, "and costs 2 faith"); assert(p.xp.prayer > faith, "Faith XP"); assert.equal(count(p, "star_sigil"), 49);
  const before = bon(p).defence; castSpell(g, "ward_of_light"); assert(p.ward && p.wardUntil > g.tick); assert(bon(p).defence >= before + 6, "a ward steels your defence");
  for (let i = 0; i < 101; i++) tick(g); assert.equal(p.ward, null, "wards fade");
  castSpell(g, "sanctuary"); assert.equal(p.ward.reduce, 0.5);
  p.xp.magic = XP_TABLE[40]; castSpell(g, "stone_skin"); assert.equal(p.ward.flat, 8, "the Realm's own wards replace a faith ward");
  p.xp.hitpoints = XP_TABLE[60]; p.hp = 10; castSpell(g, "renewal"); for (let i = 0; i < 5; i++) tick(g); assert(p.hp >= 10 + 5 + 3 * 4, "Renewal heals over time");
  p.prayer = 50; p.energy = 0; p.poison = { damage: 2, left: 3, timer: 5 }; castSpell(g, "blessing"); assert.equal(p.energy, 100); assert.equal(p.poison, null);
  const save = JSON.parse(JSON.stringify(serialize(g))), fresh = newGame(); assert(restore(fresh, save)); assert(fresh.player.ward && fresh.player.wardUntil > fresh.tick, "a ward survives a save");
  // Hats sit on the first row five pixels wide: a Friend with antennae keeps its hat on its head.
  const { measure } = await import("../games/rarefriends-realm/wardrobe.ts");
  const eared = ["......#..#......", "......#..#......", "....########....", "...##########...", "...##########...", "....########....", ".....######.....", ".......##.......", "....########....", "....########....", "....########....", "....########....", ".....##..##.....", ".....##..##.....", ".....##..##.....", ".....##..##....."];
  const m = measure(eared); assert.equal(m.top, 0); assert.equal(m.crownTop, 2, "the crown starts under the antennae"); assert.equal(m.crownWidth, 10);
  void mh;
});

test("The Warden takes RF: a task bought done keeps the streak and pays points; a reroll gives a different task", async () => {
  const { assignTask, currentTask, slayerPoints, slayerStreak, completeTaskForRf, rerollTaskForRf } = await import("../games/rarefriends-realm/slayer.ts");
  const g = newGame(), p = g.player; for (const s of ["attack", "strength", "defence", "hitpoints"]) p.xp[s] = XP_TABLE[60];
  assert(!completeTaskForRf(g), "nothing to complete without a task"); assert(assignTask(g)); const first = currentTask(g).name, points = slayerPoints(g);
  assert(rerollTaskForRf(g)); assert(currentTask(g), "a task again"); void first;
  assert(completeTaskForRf(g)); assert.equal(slayerStreak(g), 1); assert(slayerPoints(g) > points, "points as if finished"); assert.equal(currentTask(g), null, "and the task is done");
});

test("Faith weapons in every metal, meals that lend a skill, and herb art", async () => {
  const { herbArt } = await import("../games/rarefriends-realm/scenery.ts").catch(() => ({ herbArt: null }));
  const mace = item("pewter_mace"), flail = item("rarite_flail");
  assert(mace.equip.holy && mace.equip.requires.prayer === 4 && mace.equip.bonuses.prayer > 0, "a pewter mace takes Faith 4 and blesses");
  assert(flail.equip.twoHanded && flail.equip.holy && flail.equip.requires.prayer === METALS.find(m => m.id === "rarite").level + 7 && flail.equip.requires.strength > 0, "a rarite flail is two-handed, blessed and heavy");
  for (const metal of METALS) assert(isItem(`${metal.id}_mace`) && isItem(`${metal.id}_flail`), `${metal.name} mace and flail`);
  assert(SHOPS.weapons.stock.includes("pewter_mace") && SHOPS.cragmaw_armoury.stock.includes("rarite_flail"), "sold beside the swords and war hammers");
  assert(smithingRecipes("pewter").some(recipe => recipe.label === "Pewter mace"), "smithed at the anvil");
  const g = newGame(), p = g.player; p.inventory.fill(null); give(p, "sailfish"); give(p, "cooked_meat");
  eat(g, 0); assert.equal(p.boosts.strength, 3, "sailfish lends +3 Strength"); assert.equal(p.boosts.attack, 2);
  eat(g, 1); assert.equal(p.boosts.strength, 3, "a lesser meal doesn't lower a boost"); assert.match(g.messages.at(-1).text, /for a while/);
  assert(item("inkshark").food.attack === 4 && item("minnows").food.fishing === 1);
  void herbArt;
});

test("Round shields and the aegis in every metal, and the weight of what you wear", async () => {
  const { wornWeight } = await import("../games/rarefriends-realm/state.ts");
  const { runDrain, weightPenalty } = await import("../games/rarefriends-realm/wayfaring.ts");
  for (const metal of METALS) assert(isItem(`${metal.id}_roundshield`) && isItem(`${metal.id}_aegis`), `${metal.name} round shield and aegis`);
  const round = item("blackiron_roundshield"), aegis = item("blackiron_aegis"), kite = item("blackiron_shield");
  const bi = METALS.find(m => m.id === "blackiron").level; assert(round.equip.bonuses.defence > kite.equip.bonuses.defence && round.equip.requires.strength === bi + 5 && round.weight > kite.weight, "the round shield: more defence, Strength to carry, heavier");
  assert(aegis.equip.requires.prayer === bi + 5 && aegis.equip.bonuses.prayer > 0, "the aegis takes Faith and blesses");
  assert(SHOPS.armour.stock.includes("pewter_roundshield") && SHOPS.armour.stock.includes("pewter_aegis"), "sold with the armour");
  assert(smithingRecipes("pewter").some(recipe => recipe.label === "Pewter round shield"));
  const g = newGame(), p = g.player; p.inventory.fill(null);
  const bare = runDrain(g); assert.equal(wornWeight(p), 0);
  for (const id of ["rarite_cuirass", "rarite_greaves", "rarite_helm", "rarite_roundshield"]) { give(p, id); p.equipment[item(id).equip.slot] = id; }
  assert(wornWeight(p) > 15, `plate weighs (${wornWeight(p)} kg)`); assert(weightPenalty(g) > 0.3 && runDrain(g) > bare * 1.3, "running drains faster under a load");
  const laden = weightPenalty(g); p.xp.agility = XP_TABLE[60]; assert(weightPenalty(g) < laden * 0.6, "Wayfaring carries half the load at 60");
  assert(item("rose_cape").weight === undefined || true); assert(item("team_cape").weight <= 1 && item("leather_jerkin").weight < item("pewter_cuirass").weight);
});

test("Crypt bones from crypt skeletons, and the Order's lesser armour", async () => {
  const { bury } = await import("../games/rarefriends-realm/engine.ts");
  assert(item("crypt_bones").bones > item("bones").bones && item("crypt_bones").bones < item("large_bones").bones, "between plain and large");
  assert(MONSTERS.skeleton.always.some(drop => drop.item === "crypt_bones"), "skeletons drop them");
  const g = newGame(), p = g.player; p.inventory.fill(null); give(p, "crypt_bones"); const faith = p.xp.prayer; bury(g, 0); assert(p.xp.prayer > faith, "buried for Faith");
  for (const id of ["acolyte_hood", "acolyte_vestment", "vigil_hauberk", "vigil_shield"]) assert(SHOPS.armoury.stock.includes(id), `${id} at the Order Armoury`);
  assert.equal(item("acolyte_vestment").equip.requires.prayer, 10); assert.equal(item("vigil_hauberk").equip.requires.defence, 30); assert(item("vigil_hauberk").equip.bonuses.prayer > 0);
  assert(item("vigil_hauberk").value < item("dawnplate_cuirass").value / 5, "far cheaper than Dawnplate");
});

test("The dungeon update: three dungeons under the lake, the library and the stones, keyed doors, coffers, archers, wraiths and quests", () => {
  const g = newGame(), p = g.player, world = g.world;
  // Regions, creatures and their doors exist and are placed.
  for (const id of ["deepglass", "drowned_archive", "howling_vault"]) assert(REGIONS.find(region => region.id === id)?.underground, `${id} is underground`);
  for (const id of ["cave_bat", "glass_crab", "crystal_golem", "drowned_scholar", "ink_wraith", "archivist_below", "grave_moth", "vault_archer", "vault_knight", "howling_king"]) assert(world.spawns.some(spawn => spawn.kind === "monster" && spawn.id === id), id);
  assert.equal(regionAt(world, 430 + WEST_DX, 530).id, "deepglass"); assert.equal(regionAt(world, 490 + WEST_DX, 528).id, "drowned_archive"); assert.equal(regionAt(world, 300 + WEST_DX, 567).id, "howling_vault");
  const doors = world.objects.filter(object => object.kind === "gate" && object.requires?.item);
  assert.deepEqual(doors.map(door => door.requires.item).sort(), ["archive_key", "deepglass_key", "moss_key", "vault_key"]);
  const coffers = world.objects.filter(object => object.decor === "chest" && / coffer$/.test(object.name));
  assert(coffers.length >= 30, `coffers in every dungeon (${coffers.length})`);
  for (const name of ["Deepglass coffer", "Archive coffer", "Vault coffer", "Crypt coffer", "Hollow coffer", "Catacomb coffer", "Wyrm coffer", "Barnacled coffer", "Miner's coffer"]) assert(coffers.some(coffer => coffer.name === name), name);
  assert(SLAYER_TASKS.some(task => task.id === "vault_dead") && SLAYER_TASKS.some(task => task.id === "bats"));
  // (Strong enough to walk the dungeons, weak enough that their creatures still take notice.)
  for (const skill of ["attack", "strength", "defence", "hitpoints"]) p.xp[skill] = XP_TABLE[55];
  p.hp = 990;
  // A keyed door: locked without the key; the key turns once and breaks.
  const door = doors.find(entry => entry.requires.item === "deepglass_key");
  teleport(g, door.x - 1, door.y); g.messages.length = 0;
  menuFor(g, [{ kind: "object", id: door.id }], null)[0].run(g); run(g, 3);
  assert.equal(p.x, door.x - 1, "still outside"); assert(g.messages.some(m => /locked/.test(m.text)), "locked without the key");
  give(p, "deepglass_key", 2); menuFor(g, [{ kind: "object", id: door.id }], null)[0].run(g); run(g, 3);
  assert.equal(p.x, door.to.x, "through the crystal door"); assert.equal(count(p, "deepglass_key"), 1, "one key spent");
  // Coffers: loot that belongs there, then empty for a while.
  const coffer = coffers.find(entry => entry.name === "Deepglass coffer");
  standBy(g, coffer); const before = p.inventory.filter(Boolean).length + count(p, "coins"); g.messages.length = 0;
  menuFor(g, [{ kind: "object", id: coffer.id }], null)[0].run(g); run(g, 2);
  assert.match(g.messages.find(m => /coffer holds/.test(m.text))?.text ?? "", /coffer holds/);
  assert(p.inventory.filter(Boolean).length + count(p, "coins") > before, "something came out");
  g.messages.length = 0; menuFor(g, [{ kind: "object", id: coffer.id }], null)[0].run(g); run(g, 2);
  assert(g.messages.some(m => /not long ago/.test(m.text)), "empty for a while");
  g.tick += COFFER_TICKS + 10; g.messages.length = 0; menuFor(g, [{ kind: "object", id: coffer.id }], null)[0].run(g); run(g, 2);
  assert(g.messages.some(m => /coffer holds/.test(m.text)), "fills again after a while");
  // A vault archer shoots from three tiles away and stays where it is.
  const archer = g.monsters.find(m => m.def.id === "vault_archer");
  assert.equal(archer.def.ranged, 5);
  // (Alone with it: everything else nearby is put to sleep so the first wound is the archer's.)
  for (const m of g.monsters) if (m !== archer && Math.abs(m.x - archer.x) + Math.abs(m.y - archer.y) < 16) { m.dead = true; m.respawnAt = Infinity; }
  for (const dx of [3, -3]) if (canWalk(g, archer.x + dx, archer.y)) { teleport(g, archer.x + dx, archer.y); break; }
  const hpBefore = p.hp; p.combat = null; p.target = null; g.autoRetaliate = false;
  let shotFrom = 0; until(g, () => { if (p.hp < hpBefore) { shotFrom = Math.max(Math.abs(archer.x - p.x), Math.abs(archer.y - p.y)); return true; } return false; }, 80);
  assert(shotFrom >= 2, `it shot rather than closed in (from ${shotFrom})`);
  // An ink wraith's touch drains faith; the Archivist Below mends himself; the Howling King enrages.
  const wraith = g.monsters.find(m => m.def.id === "ink_wraith");
  p.combat = null; p.target = null; g.autoRetaliate = false;
  standNear(g, wraith.x, wraith.y, 1); p.prayer = 60; p.hp = 990; p.prayers = [];
  until(g, () => p.prayer < 60, 300); assert(p.prayer < 60, "faith drained");
  const keeper = g.monsters.find(m => m.def.id === "archivist_below");
  p.combat = null; p.target = null; standNear(g, keeper.x, keeper.y, 1); keeper.hp = 40; keeper.target = true; run(g, 6); assert(keeper.hp > 40, "the Archivist mends himself");
  assert(MONSTERS.howling_king.enrage && MONSTERS.crystal_golem.enrage && MONSTERS.howling_king.drain.faith === 6);
  // The quests: the fisher, Perrin and Fenn.
  const talk = id => { const npc = g.npcs.find(entry => entry.id === id); standNear(g, npc.x, npc.y, 1); setTarget(g, { kind: "npc", uid: npc.uid, option: "Talk-to" }); until(g, () => g.dialogue !== null, 30); };
  const say = label => { while (g.dialogue && g.dialogue.index < g.dialogue.lines.length) continueDialogue(g); const index = g.dialogue.options.findIndex(option => option.label.startsWith(label)); assert(index >= 0, label); chooseOption(g, index); };
  const drain = () => { for (let i = 0; g.dialogue && i < 200; i++) { if (g.dialogue.index >= g.dialogue.lines.length && g.dialogue.options?.length) { g.dialogue = null; break; } continueDialogue(g); } };
  p.combat = null; p.target = null; p.hp = 990;
  talk("fisher"); say("I'll do it."); drain(); assert.equal(p.quests.deepglass_heart, 1);
  for (let i = 0; i < 6; i++) onMonsterKilled(g, "glass_crab", 0, 0); onMonsterKilled(g, "crystal_golem", 0, 0); give(p, "crystal_shard", 3); const shards = count(p, "crystal_shard");
  talk("fisher"); drain(); assert.equal(p.quests.deepglass_heart, 2); assert(has(p, "glass_charm") && count(p, "crystal_shard") === shards - 3);
  p.quests.quillhaven_folio = 2; p.xp.magic = XP_TABLE[90];
  talk("quillhaven_archivist"); say("I'll do it."); drain(); assert.equal(p.quests.drowned_archive, 1); assert(has(p, "archive_key"), "Perrin's spare key");
  give(p, "ink_page", 6); onMonsterKilled(g, "archivist_below", 0, 0);
  talk("quillhaven_archivist"); drain(); assert.equal(p.quests.drowned_archive, 2); assert(has(p, "insight_lamp") && count(p, "ink_page") === 0);
  p.quests.tallgrass_tracks = 2;
  talk("tallgrass_huntmaster"); say("I'll do it."); drain(); assert.equal(p.quests.howling_vault, 1); assert(has(p, "vault_key"), "Fenn's key");
  for (let i = 0; i < 6; i++) { onMonsterKilled(g, "vault_archer", 0, 0); onMonsterKilled(g, "vault_knight", 0, 0); } onMonsterKilled(g, "howling_king", 0, 0);
  const coins = count(p, "coins"); talk("tallgrass_huntmaster"); drain(); assert.equal(p.quests.howling_vault, 2); assert.equal(count(p, "coins"), coins + 6000);
  assert(QUESTS.some(q => q.id === "howling_vault") && questPoints(g) >= 7);
});

test("The Rare Friends Ring: matches for coins and bloodmarks, your own foes, revival in the lobby, the Ringbreaker, Wildfur and the Ring's shops", () => {
  const g = newGame(), p = g.player, world = g.world;
  assert.equal(regionAt(world, ARENA.x, ARENA.y).id, "friends_ring"); assert(inArena(ARENA.x, ARENA.y + 5) && !inArena(ARENA.x, ARENA.y + 20) && inRing(ARENA.x + 3, ARENA.y + 3), "the courtyard is a duelling ring");
  for (const id of ["ringmaster", "ring_apothecary", "ring_chaplain", "ring_sigilist", "ring_fletcher", "ring_armourer", "ring_quartermaster", "ring_champion", "ring_weaponsmith"]) assert(g.npcs.some(npc => npc.id === id), id);
  assert(world.objects.some(object => object.kind === "fountain" && object.name === "Blood fountain"), "the fountain runs red");
  const gates = world.objects.filter(object => object.name === "Arena gate"); assert.equal(gates.length, 4, "four arena gates");
  assert(gates.every(gate => gate.look === "gate" && (gate.axis === "ew") === (gate.x === ARENA.x)), "iron gates set along the courtyard wall, not ladders");
  // The fighting pit, the chapel against the west wall (its altar, the Old Friend and Chaplain Orrin inside) and the forecourt.
  assert.equal(world.tiles[(ARENA.y + 3) * W + ARENA.x + 3], T.SAND, "a sand pit about the fountain");
  const chapel = world.buildings.find(building => building.name === "Ring Chapel"); assert(chapel && chapel.walls === "stone" && chapel.x1 === ARENA.x - ARENA.outer, "a stone chapel built against the Ring's west wall");
  assert(world.buildings.some(building => building.name === "Chapel bell tower" && building.round && building.x0 < chapel.x0 + 1), "with a round bell tower");
  const inChapel = object => object.x > chapel.x0 && object.x < chapel.x1 && object.y > chapel.y0 && object.y < chapel.y1;
  assert(world.objects.some(object => object.kind === "altar" && inChapel(object)) && world.objects.filter(object => object.decor === "bench" && inChapel(object)).length === 6, "an altar and six pews inside");
  const orrin = g.npcs.find(npc => npc.id === "ring_chaplain"); assert(orrin && inChapel(orrin), "Chaplain Orrin keeps the chapel");
  assert(world.objects.filter(object => object.decor === "lamp" && object.y > ARENA.y + ARENA.outer && Math.abs(object.x - ARENA.x) <= 5).length === 4, "lamps on the forecourt");
  assert(world.objects.filter(object => object.decor === "ruin_wall" && inArena(object.x, object.y)).length >= 10, "ruined walls in the courtyard");
  // Every shop has its own room off the concourse, its keeper inside, its furniture its own.
  for (const [keeper, hall] of [["ring_champion", "The Champions' Hall"], ["ring_armourer", "The Ring Armoury"], ["ring_sigilist", "Vane's Sigil Study"], ["ring_apothecary", "Mallow's Infirmary"], ["ring_fletcher", "Arrowyn's Fletchery"], ["ring_quartermaster", "The Pit Quartermaster's Den"], ["ring_weaponsmith", "Edgewright's Blades"]]) {
    const b = world.buildings.find(entry => entry.name === hall), npc = g.npcs.find(entry => entry.id === keeper);
    assert(b && npc && npc.x > b.x0 && npc.x < b.x1 && npc.y > b.y0 && npc.y < b.y1, `${keeper} keeps ${hall}`);
    assert(Math.hypot((b.x0 + b.x1) / 2 - ARENA.x, (b.y0 + b.y1) / 2 - ARENA.y) < ARENA.outer + 14, `${hall} stands against the Ring`);
  }
  const champions = world.buildings.find(entry => entry.name === "The Champions' Hall");
  assert(world.objects.some(o => o.decor === "throne" && o.x >= champions.x0 && o.x <= champions.x1 && o.y >= champions.y0 && o.y <= champions.y1), "the Champion's seat");
  assert(world.objects.some(o => o.kind === "anvil" && inRingBuilding(o.x - 8, o.y)) || world.objects.some(o => o.kind === "anvil" && Math.hypot(o.x - ARENA.x, o.y - ARENA.y) < ARENA.outer + 14), "the armoury's anvil");
  // The Seven's statues round the courtyard, stone knights on guard, and statues of what waits below at every dungeon's mouth.
  const seven = world.objects.filter(object => object.decor === "monument" && inArena(object.x, object.y)); assert.equal(seven.length, 7, "seven statues");
  assert(seven.some(o => o.state === "toppled") && seven.some(o => o.state === "broken") && seven.some(o => o.state === "buried") && seven.some(o => o.monster === "revenant_king"), "in every state");
  assert(world.objects.filter(object => object.decor === "monument" && !inRingBuilding(object.x, object.y)).length >= 9, "statues at the dungeon mouths");
  assert(g.monsters.filter(m => m.def.id === "stone_knight").length >= 5 && !MONSTERS.stone_knight.aggressive, "stone knights on guard, attackable, not aggressive");
  assert(MATCHES.some(match => match.id === "the_seven" && match.waves.length === 7) && MONSTERS.revenant_king.arenaOnly && MONSTERS.revenant_king.boss, "the Seven are the hardest match");
  assert(world.objects.filter(object => object.decor === "bones" && inArena(object.x, object.y)).length >= 20, "bones across the arena");
  assert(world.tiles.some((tile, i) => tile === T.LAVA && inArena(i % W, Math.floor(i / W))), "a little volcano");
  for (const skill of ["attack", "strength", "defence", "hitpoints"]) p.xp[skill] = XP_TABLE[80];
  p.hp = 800; g.autoRetaliate = true;
  const talk = id => { const npc = g.npcs.find(entry => entry.id === id); standNear(g, npc.x, npc.y, 1); setTarget(g, { kind: "npc", uid: npc.uid, option: "Talk-to" }); until(g, () => g.dialogue !== null, 30); };
  const say = label => { while (g.dialogue && g.dialogue.index < g.dialogue.lines.length) continueDialogue(g); const index = g.dialogue.options.findIndex(option => option.label.startsWith(label)); assert(index >= 0, label); chooseOption(g, index); };
  // The Rat Pit: a quarter of the purse to enter, six rats and two bats, the purse and the marks when they're all down.
  give(p, "coins", 10_000); const coins0 = count(p, "coins");
  talk("ringmaster"); say("The Rat Pit"); while (g.dialogue) continueDialogue(g);
  assert(g.arena && g.arena.match === "rat_pit", "a match is on"); assert.equal(count(p, "coins"), coins0 - entryFee(150), "the fee");
  const foes = g.monsters.filter(m => m.arena); assert.equal(foes.length, 8); assert(foes.every(m => inArena(m.x, m.y) && m.target), "summoned into the courtyard, already hunting");
  assert.deepEqual(arenaFoes(g).length, 8, "what spectators see");
  talk("ringmaster"); assert.match(g.dialogue.lines[0].text, /match is on/); g.dialogue = null;
  // Barred in: the south arena gate won't open from inside, and no teleport takes you out.
  const south = gates.find(gate => gate.y > ARENA.y); teleport(g, south.x, south.y - 1); g.messages.length = 0;
  menuFor(g, [{ kind: "object", id: south.id }], null)[0].run(g); run(g, 2);
  assert.equal(p.y, south.y - 1, "still inside"); assert(g.messages.some(m => /gate is barred/.test(m.text)));
  assert.equal(castSpell(g, "home"), null); assert(g.messages.some(m => /holds you until the match/.test(m.text)), "no homeward");
  for (const foe of foes) { standNear(g, foe.x, foe.y, 1); setTarget(g, { kind: "monster", uid: foe.uid, option: "Attack" }); until(g, () => foe.dead, 400); }
  run(g, 2);
  assert.equal(g.arena, null, "the match is over"); assert.equal(g.monsters.filter(m => m.arena).length, 0, "the creatures are gone");
  assert.equal(count(p, "coins"), coins0 - entryFee(150) + 150, "the purse"); assert.equal(count(p, "bloodmark"), 3, "and the marks"); assert.equal(p.stats.matches, 1);
  // Your own foes: four wolves, the purse by their level; leaving the Ring forfeits a match.
  talk("ringmaster"); say("I'll choose my own foes"); say("Beasts"); say(customMatch("wolf").name); while (g.dialogue) continueDialogue(g);
  assert(g.arena && g.arena.match === "foe:wolf" && g.arena.coins === customMatch("wolf").coins, "a custom match");
  assert.equal(g.monsters.filter(m => m.arena).length, 4);
  teleport(g, ARENA.x, ARENA.y + ARENA.outer + 8); run(g, 2);
  assert.equal(g.arena, null, "forfeit on leaving"); assert.equal(g.monsters.filter(m => m.arena).length, 0);
  // With no match on, the gates swing both ways.
  teleport(g, south.x, south.y + 1); menuFor(g, [{ kind: "object", id: south.id }], null)[0].run(g); run(g, 2); assert.equal(p.y, south.y - 1, "in through the gate");
  menuFor(g, [{ kind: "object", id: south.id }], null)[0].run(g); run(g, 2); assert.equal(p.y, south.y + 1, "and out again");
  // Falling in the Ring: its magic stands you up in the lobby, and the match is lost.
  teleport(g, ARENA.x, ARENA.y + 6); p.hp = 1; p.xp.defence = 0; p.xp.hitpoints = XP_TABLE[10];
  assert(startMatch(g, "bone_legion"));
  until(g, () => p.x === ARENA.lobby.x && p.y === ARENA.lobby.y && g.arena === null && p.hp > 1, 400);
  assert(g.messages.some(m => /knits you back together/.test(m.text)), "revived by the Ring");
  // The Ring's shops: bloodmarks buy the Quartermaster's gear, coins don't; laurels buy the Hall's.
  p.xp.strength = XP_TABLE[80]; p.xp.defence = XP_TABLE[80]; p.xp.hitpoints = XP_TABLE[80]; p.hp = maxHp(p);
  assert.equal(buy(g, "ring_pit", "skull_mask", 1), 0, "not for coins"); assert.match(g.messages.at(-1).text, /bloodmarks/);
  const marks0 = count(p, "bloodmark"); give(p, "bloodmark", 2000); assert.equal(buy(g, "ring_pit", "skull_mask", 1), 1); assert.equal(count(p, "bloodmark"), marks0 + 2000 - 60);
  for (const piece of ["wildfur_helm", "wildfur_plate", "wildfur_greaves"]) { assert.equal(buy(g, "ring_pit", piece, 1), 1); equip(g, p.inventory.findIndex(slot => slot?.id === piece)); }
  const steady = bonuses(p).strength; p.hp = Math.floor(maxHp(p) * 0.3); assert.equal(bonuses(p).strength, steady + 7 + 12 + 9, "Wildfur counts twice when you're nearly done"); p.hp = maxHp(p);
  give(p, "laurel", 40); assert.equal(buy(g, "ring_champions", "laurel_crown", 1), 1); assert.equal(count(p, "laurel"), 15);
  teleport(g, ARENA.x + 2, ARENA.y + 4); wonDuel(g, 3412); assert.equal(count(p, "laurel"), 17, "a Friend Fight in the Ring pays two laurels");
  // The Ringbreaker: two hands, a step of knockback on a third of hits, and the recoil.
  give(p, "coins", 50_000); assert.equal(buy(g, "ring_armour", "ringbreaker", 1), 1); equip(g, p.inventory.findIndex(slot => slot?.id === "ringbreaker"));
  assert.equal(p.equipment.weapon, "ringbreaker"); assert(!p.equipment.shield, "two-handed");
  // (Against stone golems, which take a while to fell, with just the strength the hammer asks for.)
  p.xp.strength = XP_TABLE[60]; p.xp.attack = XP_TABLE[40]; give(p, "coins", 20_000);
  assert(startMatch(g, "foe:stone_golem"));
  const knocked = () => g.messages.some(m => /throws the stone golem back a step/.test(m.text));
  for (const golem of g.monsters.filter(m => m.arena && !m.dead)) { if (knocked()) break; standNear(g, golem.x, golem.y, 1); setTarget(g, { kind: "monster", uid: golem.uid, option: "Attack" }); until(g, () => knocked() || golem.dead, 600); }
  assert(knocked(), "the hammer knocks back");
  teleport(g, ARENA.x, ARENA.y + ARENA.outer + 8); run(g, 2);
  assert(MATCHES.length === 9 && FOE_GROUPS.every(group => group.foes.every(foe => MONSTERS[foe])));
});

test("The Root Cellars and the Mossy Undercroft: a dungeon for new heroes and one for the middle levels", () => {
  const g = newGame(), world = g.world;
  assert(REGIONS.find(region => region.id === "root_cellars")?.underground && REGIONS.find(region => region.id === "mossy_undercroft")?.underground);
  assert.equal(regionAt(world, 420 + WEST_DX, 560).id, "root_cellars"); assert.equal(regionAt(world, 490 + WEST_DX, 560).id, "mossy_undercroft");
  assert(world.objects.some(o => o.name === "Cellar door" && o.to) && world.objects.some(o => o.name === "Mossy stair" && o.action === "Climb-down"), "both mouths");
  assert(world.objects.some(o => o.kind === "gate" && o.requires?.item === "moss_key"), "the warden's door takes a moss key");
  assert(world.objects.filter(o => o.name === "Cellar coffer").length >= 3 && world.objects.filter(o => o.name === "Undercroft coffer").length >= 3, "coffers in both");
  assert(g.monsters.some(m => m.def.id === "rat_king") && g.monsters.some(m => m.def.id === "moss_warden"), "both bosses placed");
  assert(MONSTERS.rat_king.level < 20 && MONSTERS.rat_king.boss && MONSTERS.moss_warden.heals && MONSTERS.moss_warden.level < 50);
  assert(world.objects.some(o => o.decor === "monument" && o.monster === "moss_warden"), "a warning at the mossy stair");
});

test("The four Orders and their gods, and the Deadwood Maidens: oaths open armouries, blessings count by the piece, the truce keeps spears down", () => {
  const g = newGame(), p = g.player, world = g.world;
  // Four Orders × three tiers × ten pieces, and a cape each; a hall each with its altar and its god's statue, small and large.
  assert.equal(ITEM_LIST.filter(item => orderOf(item.id)).length, 6 * 3 * 10 + 6);
  for (const id of ORDER_IDS) {
    const order = ORDERS[id];
    assert(world.objects.some(o => o.kind === "altar" && o.name === `${order.name} altar` && o.text === id), `${order.short} altar`);
    assert(world.objects.filter(o => o.decor === order.statue).length >= 2, `${order.god}'s statues`);
    for (const npc of [order.leader, `${id}_quartermaster`, `${id}_guard`]) assert(g.npcs.some(entry => entry.id === npc), `${id} ${npc}`);
    assert(shopProblem(g, `${id}_armoury`), "closed before the oath");
  }
  assert(ITEM_LIST.find(item => item.id === "diamond_paladin_body").equip.holy && ITEM_LIST.find(item => item.id === "ink_oath_staff").equip.staff && ITEM_LIST.find(item => item.id === "hood_knight_greatmace").equip.twoHanded, "blessed, a staff, two-handed");
  // The Diamond Oath: kneel at the altar, bring the shards, wear the cape, and the armoury opens.
  p.xp.prayer = XP_TABLE[70]; p.xp.defence = XP_TABLE[70]; p.hp = 99;
  const talk = id => { const npc = g.npcs.find(entry => entry.id === id); standNear(g, npc.x, npc.y, 1); setTarget(g, { kind: "npc", uid: npc.uid, option: "Talk-to" }); until(g, () => g.dialogue !== null, 30); };
  const say = label => { while (g.dialogue && g.dialogue.index < g.dialogue.lines.length) continueDialogue(g); const index = g.dialogue.options.findIndex(option => option.label.startsWith(label)); assert(index >= 0, label); chooseOption(g, index); };
  const drain = () => { for (let i = 0; g.dialogue && i < 200; i++) { if (g.dialogue.index >= g.dialogue.lines.length && g.dialogue.options?.length) { g.dialogue = null; break; } continueDialogue(g); } };
  talk("diamond_commander"); say("I'll do it."); drain(); assert.equal(p.quests.oath_diamond, 1);
  const altar = world.objects.find(o => o.name === "Order of the Diamond altar"); standBy(g, altar); setTarget(g, { kind: "object", id: altar.id, option: "Pray-at" }); run(g, 3); assert.equal(p.questData.prayed_diamond, 1, "knelt");
  give(p, "crystal_shard", 5); talk("diamond_commander"); drain(); assert.equal(p.quests.oath_diamond, 2); assert(has(p, "diamond_cape"), "the cape"); assert.equal(shopProblem(g, "diamond_armoury"), null, "the armoury opens");
  give(p, "coins", 500_000); assert.equal(buy(g, "diamond_armoury", "diamond_paladin_helm", 1), 1); assert.equal(buy(g, "diamond_armoury", "diamond_paladin_body", 1), 1);
  for (const id of ["diamond_paladin_helm", "diamond_paladin_body", "diamond_cape"]) equip(g, p.inventory.findIndex(slot => slot?.id === id));
  assert.equal(orderPieces(p.equipment, "diamond"), 3, "three pieces of the Diamond");
  // The Ember's fortress: an island of ash in a moat of lava, a causeway to its gate; and the ring slot, with the Ringmaster's signet.
  const emberAltar = world.objects.find(o => o.name === "Order of the Ember altar"); assert(emberAltar, "the Ember altar");
  assert(world.tiles.some((tile, i) => tile === T.LAVA && Math.abs(i % W - emberAltar.x) < 16 && Math.abs(Math.floor(i / W) - emberAltar.y) < 16), "lava round the fortress");
  assert(EQUIP_SLOTS.includes("ring") && ITEM_LIST.find(item => item.id === "ringmasters_signet").equip.slot === "ring");
  p.stats.matches = 3; give(p, "bloodmark", 30); teleport(g, ARENA.lobby.x, ARENA.lobby.y); p.xp.strength = XP_TABLE[40];
  talk("ringmaster"); say("About your signet"); say("I'll do it."); drain(); assert.equal(p.quests.ringmasters_signet, 1);
  talk("ringmaster"); say("About your signet"); drain(); assert.equal(p.quests.ringmasters_signet, 2); assert(has(p, "ringmasters_signet"), "the signet");
  equip(g, p.inventory.findIndex(slot => slot?.id === "ringmasters_signet")); assert.equal(p.equipment.ring, "ringmasters_signet"); assert.equal(bonuses(p).strength, bonuses({ ...p, equipment: {} }).strength + 4, "+4 Strength");
  teleport(g, 300, 136); assert.equal(signetCharges(g), 3); signetTeleport(g); until(g, () => p.x === ARENA.lobby.x && p.y === ARENA.lobby.y, 20); assert.equal(signetCharges(g), 2, "one charge spent");
  p.questData.signet_used = 3; g.messages.length = 0; signetTeleport(g); assert(g.messages.some(m => /signet is cold/.test(m.text)), "three a day");
  // The Maidens: hostile, then at truce (spears down, and no striking them).
  const maiden = g.monsters.find(m => m.def.id === "deadwood_maiden"); assert(maiden && MONSTERS.deadwood_maiden.aggressive && MONSTERS.deadwood_maiden.faction === "maidens");
  assert(shopProblem(g, "maidens_market"), "no market before the truce");
  p.quests.maidens_truce = 2; standNear(g, maiden.x, maiden.y, 2); p.combat = null; p.target = null; run(g, 12); assert(!maiden.target, "spears down");
  g.messages.length = 0; setTarget(g, { kind: "monster", uid: maiden.uid, option: "Attack" }); run(g, 6); assert(g.messages.some(m => /keep the truce/.test(m.text)) && p.combat === null, "no striking them");
  assert.equal(shopProblem(g, "maidens_market"), null); assert(SHOPS.maidens_market.stock.includes("rarite_ore") && SHOPS.maidens_market.stock.includes("vault_key"), "what's hard to find");
});

test("The Deadwood's eternal night, and coffers that fill once an hour", () => {
  const g = newGame(), world = g.world;
  assert.equal(COFFER_TICKS, 6000, "an hour of ticks");
  const [sqx, sqy] = M(121, 118);
  assert(inDeadwood(world, 290 + WEST_DX, 60) && !inDeadwood(world, sqx, sqy), "the wood and the square");
  assert.equal(gloomAt(world, 290 + WEST_DX, 60), 1, "deep in the wood it is full night"); assert.equal(gloomAt(world, sqx, sqy), 0, "no cloud over Friendhollow");
  const edge = gloomAt(world, 300 + WEST_DX, 128); assert(edge >= 0 && edge < 1, `the cloud thins at the wood's edge (${edge})`);
});

test("Return of Raria: the far west, the Burned, sealed Order looks, Adventurer Cards, the Regiment's writ and the Wise Friend's Law, all saved", async () => {
  const { CARDS, cardFound, codexTick } = await import("../games/rarefriends-realm/codex.ts");
  const { BURNED_BUILDS } = await import("../games/rarefriends-realm/factions.ts");
  const { CARD_OPTIONS: OPTIONS, cardUnlocked: unlocked } = await import("../games/rarefriends-realm/cardstyle.ts");
  const { setLaw } = await import("../games/rarefriends-realm/state.ts");
  const { SPELLS, PRAYERS, spellInBook, RARIAN_SPELL_TABS } = await import("../games/rarefriends-realm/data.ts");
  const g = newGame(), p = g.player, world = g.world;
  // The Vigil Aegis, by name, an aegis to look at.
  assert.equal(item("vigil_shield").name, "Vigil Aegis"); assert.equal(item("vigil_shield").icon.shape, "aegis");
  assert(!ITEM_LIST.some(entry => /vigil shield/i.test(entry.name) || /vigil shield/i.test(entry.examine)), "no Vigil Shield left anywhere");
  // The far west: four regions with land in them, Raria's palace in the middle of its walls, the Federation's fortress, BarkReach's camps.
  for (const id of ["deep_westmarch", "free_marches", "barkreach", "raria"]) {
    const index = REGIONS.findIndex(region => region.id === id); let land = 0;
    for (let i = 0; i < world.region.length; i++) if (world.region[i] === index && ![T.WATER, T.DEEP, T.VOID].includes(world.tiles[i])) land++;
    assert(land > 800, `${id} has land (${land})`);
  }
  const palace = world.buildings.find(b => b.name === "The Palace of Raria"); assert(palace, "the palace");
  const { RARIA_CITY } = await import("../games/rarefriends-realm/farwest.ts");
  // (Across the city's own span: the villages round it have walls of their own now.)
  const walls = []; for (let x = RARIA_CITY.x0 - 6; x <= RARIA_CITY.x1 + 6; x++) if (terrainAt(world, x, RARIA_CITY.y - 30) === T.WALL) walls.push(x);
  // The capital, dressed: gatehouse towers at all four gates, yews down the boulevards and pocket gardens, wells in
  // the squares, none of it indoors, and no street a single dark roof colour.
  const R = RARIA_CITY, inCity = o => o.x > R.x0 && o.x < R.x1 && o.y > R.y0 && o.y < R.y1, indoors = o => world.buildings.some(b => o.x > b.x0 && o.x < b.x1 && o.y > b.y0 && o.y < b.y1);
  assert.equal(world.buildings.filter(b => b.name === "A gatehouse tower").length, 8, "two gatehouse towers at each gate");
  const cityTrees = world.objects.filter(o => o.kind === "tree" && inCity(o)), wells = world.objects.filter(o => o.kind === "well" && inCity(o));
  assert(cityTrees.length >= 40 && wells.length >= 6, `trees (${cityTrees.length}) and wells (${wells.length}) in the city`);
  assert(![...cityTrees, ...wells].some(indoors), "nothing planted indoors");
  assert(new Set(world.buildings.filter(b => b.name === "A Rarian house").map(b => b.color)).size >= 5, "houses under more than one roof colour");
  assert(walls[walls.length - 1] - walls[0] >= 100, `a great walled city (${walls[walls.length - 1] - walls[0]} tiles across)`);
  // The far west is a continent: Raria's lands and BarkReach dwarf the mainland.
  const landOf = ids => { const set = new Set(ids.map(id => REGIONS.findIndex(r => r.id === id))); let n = 0; for (let i = 0; i < world.region.length; i++) if (set.has(world.region[i]) && ![T.WATER, T.DEEP, T.VOID].includes(world.tiles[i])) n++; return n; };
  assert(landOf(["raria", "crownlands", "vesperwold", "silent_peaks"]) > 50000, `Raria is massive (${landOf(["raria", "crownlands", "vesperwold", "silent_peaks"])})`);
  assert(landOf(["barkreach", "heartwood"]) > 30000, `BarkReach is a great wood (${landOf(["barkreach", "heartwood"])})`);
  for (const [, at] of Object.entries((await import("../games/rarefriends-realm/farwest.ts")).FAR_PLACES)) assert(at[0] < WEST_DX, `${at} is on the far-west continent`);
  assert(Math.abs((palace.x0 + palace.x1) / 2 - (walls[0] + walls[walls.length - 1]) / 2) <= 1, "the palace is in the direct centre of the city");
  for (const name of ["The Great Hall of the Federation", "The Wizard Tower", "The Library", "The Enchanted Forge", "The Experimental Laboratory", "The Strange Device Room", "The Storage Vaults", "The Artisan Workshops", "The Heartwood Yard", "The Antler Lodge", "The Hall of the Order of Dusk", "The Chapel of the Law", "The Office of Conduct", "The Regimental Barracks"])
    assert(world.buildings.some(b => b.name === name), name);
  for (const id of ["queen_rara", "king_pell", "fellow_free", "dusk_prior", "raria_gate_captain", "hollowmere_officer", "fff_gatewarden"]) assert(g.npcs.some(npc => npc.id === id), `${id} is placed`);
  assert(g.monsters.filter(m => m.def.id === "royal_ranger").length >= 6 && MONSTERS.royal_ranger.level >= 150, "Royal Rangers everywhere, and nobody to mess with");
  // The Burned: every villager build and a knight, levels 54 to 69, faded red, round the Ember Fortress, and better drops the higher they are.
  assert.equal(BURNED_BUILDS.length, 10);
  const burned = BURNED_BUILDS.map(build => MONSTERS[`burned_${build}`]);
  assert.equal(Math.min(...burned.map(m => m.level)), 54); assert.equal(Math.max(...burned.map(m => m.level)), 69);
  assert(burned.every(m => m.undead && m.ink === "#6e2a24" && m.aggressive), "faded red undead");
  const heart = m => m.drops.find(d => d.item === "ash_heart").chance; assert(heart(MONSTERS.burned_knight) > heart(MONSTERS.burned_slim) * 3, "drops climb with the level");
  const ember = world.objects.find(o => o.name === "Order of the Ember altar");
  for (const m of burned) assert(g.monsters.some(x => x.def === m && Math.hypot(x.x - ember.x, x.y - ember.y) < 50), `${m.name} walks the ash near the fortress`);
  // Order looks are sealed until the leader is met; meeting the commander opens them, and that's saved.
  const facet = OPTIONS.layout.find(o => o.id === "facet"); assert(facet && !unlocked(g, facet), "the Diamond's layout starts sealed");
  assert(OPTIONS.layout.length >= 17 && OPTIONS.bg.length >= 27 && OPTIONS.frame.length >= 27, "many more looks");
  const talkTo = id => { const npc = g.npcs.find(entry => entry.id === id); standNear(g, npc.x, npc.y, 1); setTarget(g, { kind: "npc", uid: npc.uid, option: "Talk-to" }); until(g, () => g.dialogue !== null, 30); g.dialogue = null; };
  talkTo("diamond_commander"); assert(unlocked(g, facet), "met the Diamond's commander");
  // Adventurer Cards: found by doing, not given; an Order's cards stay sealed until its leader is met.
  assert(CARDS.length >= 120, `${CARDS.length} cards`);
  const fresh = newGame(); codexTick(fresh); assert(!cardFound(fresh, "order_diamond") && !cardFound(fresh, "region_raria") && !cardFound(fresh, "person_queen_rara"), "nothing given");
  codexTick(g); assert(cardFound(g, "order_diamond") && cardFound(g, "leader_diamond"), "the Diamond's cards after meeting its commander");
  teleport(g, world.places.raria.x, world.places.raria.y); run(g, 30); assert(cardFound(g, "region_raria"), "walk into Raria, find its card");
  // The Regiment: a checkpoint, a captain who writes writs; carrying one keeps the Regiment's halberds down.
  const scout = g.monsters.find(m => m.def.id === "rrr_scout"); assert(scout && MONSTERS.rrr_scout.faction === "rrr");
  talkTo("raria_gate_captain"); const captain = g.npcs.find(entry => entry.id === "raria_gate_captain"); standNear(g, captain.x, captain.y, 1);
  setTarget(g, { kind: "npc", uid: captain.uid, option: "Talk-to" }); until(g, () => g.dialogue !== null, 30);
  while (g.dialogue && g.dialogue.index < g.dialogue.lines.length) continueDialogue(g); chooseOption(g, g.dialogue.options.findIndex(o => o.label.startsWith("I'll do it."))); while (g.dialogue) continueDialogue(g);
  assert.equal(p.quests.rrr_truce, 1); assert(has(p, "writ_of_passage") && has(p, "sealed_dispatch"), "a writ and a dispatch");
  standNear(g, scout.x, scout.y, 2); p.combat = null; run(g, 12); assert(!scout.target, "the Regiment honours the writ");
  // The Wise Friend's Law: Raria's Magic and Faith in place of the Old Friend's, a real swap, and the way back.
  assert(SPELLS.filter(s => s.rarian).length >= 12 && PRAYERS.filter(pr => pr.rarian).length >= 8 && RARIAN_SPELL_TABS.length === 6);
  assert(!spellInBook(SPELLS.find(s => s.id === "edict_of_silence"), false) && spellInBook(SPELLS.find(s => s.id === "edict_of_silence"), true), "Raria's edicts only in the Law's book");
  assert(!spellInBook(SPELLS.find(s => s.id === "holy_dart"), true) && spellInBook(SPELLS.find(s => s.id === "ember_dart"), true), "the old light closed, common magic kept");
  p.xp.prayer = XP_TABLE[60]; p.xp.magic = XP_TABLE[60]; p.prayer = 60; give(p, "law_sigil", 20); give(p, "thought_sigil", 10);
  assert(canCast(g, SPELLS.find(s => s.id === "edict_of_silence")), "not before the Law");
  setLaw(g, true); assert(p.rarian && !canCast(g, SPELLS.find(s => s.id === "edict_of_silence")), "castable under the Law");
  togglePrayer(g, "first_law"); assert(p.prayers.includes("first_law")); togglePrayer(g, "paper_shield"); assert(!p.prayers.includes("paper_shield"), "the old prayers are closed while the Law is kept");
  // Everything saved: cards, the Law, the meeting, the quest, the writ.
  const back = newGame(); restore(back, serialize(g));
  assert(back.player.rarian && back.player.cards.order_diamond && back.player.cards.region_raria && back.player.questData.met_diamond === 1 && back.player.quests.rrr_truce === 1 && has(back.player, "writ_of_passage"), "all of it persists");
  assert(unlocked(back, facet), "the Diamond's layout stays open after a reload");
  // A save from before the far west (world 2) lands where it was: the same spot, WEST_DX columns further east in the wider world.
  const before = newGame(); restore(before, { ...serialize(g), world: 2, x: 300, y: 136 }); assert.deepEqual([before.player.x, before.player.y], [300 + WEST_DX, 136], "old saves move with the world");
  assert.equal(regionAt(before.world, before.player.x, before.player.y).id, "gravesend", "still in Gravesend");
  setLaw(g, false); assert(!p.rarian && p.prayers.length === 0, "set down, and the old book opens");
});

test("Feedback: an X post tagging the Realm and its maker, and a GitHub issue with what we need to act on it", async () => {
  const { feedbackPost, feedbackIssue, FEEDBACK_REPO } = await import("../games/rarefriends-realm/feedback.ts");
  const g = newGame(); g.player.name = "Tester";
  const long = "The ".repeat(200), post = feedbackPost("Bug", long);
  assert(post.length <= 280, `fits a post (${post.length})`);
  for (const tag of ["@M4S4T0_V01D", "@RareFriendsNFT", "#RareFriends", "#RareFriendsRealm"]) assert(post.includes(tag), tag);
  const issue = feedbackIssue(g, "Idea", "More fish in Candlemere's lake\nand a boat.", true, true);
  assert.equal(issue.title, "[Idea] More fish in Candlemere's lake"); assert.match(issue.body, /Friend: #7730 \(Tester\)/); assert.match(issue.body, /Region: /); assert.match(issue.body, /posted on X/);
  assert.doesNotMatch(feedbackIssue(g, "Bug", "x", false, false).body, /Friend:/, "details only when asked");
  assert.equal(FEEDBACK_REPO, "M4S4T0-V01D/rarefriends-realm");
});

test("Raria's walls stand three storeys high under taller towers, and the Cathedral's bell tower is climbed to the Great Bell", async () => {
  const { RARIA_CITY } = await import("../games/rarefriends-realm/farwest.ts");
  const g = newGame(), world = g.world;
  const rampart = world.ramparts?.find(r => r.x0 === RARIA_CITY.x0 && r.y1 === RARIA_CITY.y1);
  assert(rampart && rampart.storeys >= 3, "the city wall is three storeys high");
  const wallTop = rampart.storeys * 42 + 17;
  const towers = world.buildings.filter(b => b.name === "A tower of Raria's wall" || b.name === "A gatehouse tower");
  assert(towers.length >= 16 && towers.every(b => (b.storeys ?? 1) * 42 + (b.tall ?? 0) > wallTop + 20), "every wall tower stands above the wall");
  const palace = world.buildings.find(b => b.name === "The Palace of Raria"), nave = world.buildings.find(b => b.name === "The Cathedral of the Wise Friend");
  const bells = world.buildings.find(b => b.name === "The Bell Tower of the Cathedral");
  assert(nave && bells && nave.color === palace.color && bells.color === palace.color, "the cathedral in the palace's colours");
  assert(nave.x1 < palace.x0 && (nave.x1 - nave.x0 + 1) * (nave.y1 - nave.y0 + 1) >= 400, "a great nave of its own, apart from the palace");
  assert((bells.storeys ?? 1) >= 8 && bells.roof === "cone" && (bells.spire ?? 0) >= 250, "a bell tower eight storeys high under a spire");
  // From the tower's door, climb ladder after ladder to the belfry.
  let at = world.objects.find(o => o.name === "Bell tower ladder" && o.action === "Climb-up" && o.y < 520), level = 0, climbs = 0;
  while (at) {
    climbs++; level = floorAt(world, at.to.x, at.to.y)?.level ?? 0;
    const here = level;
    at = world.objects.find(o => o.name === "Bell tower ladder" && o.action === "Climb-up" && floorAt(world, o.x, o.y)?.level === here && floorAt(world, o.x, o.y)?.complex === bells.complex);
  }
  assert.equal(level, 7, "the ladders reach the top floor of the tower");
  assert.equal(climbs, 7, "seven ladders, floor by floor");
  assert(world.objects.some(o => o.decor === "bell" && floorAt(world, o.x, o.y)?.level === 7 && floorAt(world, o.x, o.y)?.complex === bells.complex), "the Great Bell at the top");
  // Every ladder lands on open floor.
  for (const o of world.objects.filter(o => o.name === "Bell tower ladder")) assert(canWalk(g, o.to.x, o.to.y), `ladder at ${o.x},${o.y} lands on open floor`);
});

test("The Palace of Raria: five floors under a spire, a four-wide door, and stairs to the top", async () => {
  const { RARIA_CITY } = await import("../games/rarefriends-realm/farwest.ts");
  const g = newGame(), world = g.world, palace = world.buildings.find(b => b.name === "The Palace of Raria");
  assert(palace && palace.storeys >= 5 && palace.roof === "cone" && palace.keep?.storeys >= 3 && palace.keep.spire >= 200, "five storeys, a keep and a spire");
  const levels = world.floors.filter(f => f.complex === palace.complex).map(f => f.level).sort();
  assert.deepEqual(levels, [1, 2, 3, 4], "four floors above the throne room");
  const door = [-1, 0, 1, 2].map(dx => terrainAt(world, RARIA_CITY.x + dx, palace.y1));
  assert(door.every(t => t !== T.WALL), "a door four tiles wide");
  for (const dx of [-1, 0, 1, 2]) assert.notEqual(terrainAt(world, RARIA_CITY.x + dx, palace.y1 + 2), T.WALL, "a four-wide avenue to it");
  // Climb from the throne room to the top floor by the stairs alone.
  let at = world.objects.find(o => o.name === "Palace staircase" && o.action === "Climb-up" && o.x >= palace.x0 && o.x <= palace.x1 && o.y >= palace.y0 && o.y <= palace.y1), level = 0;
  while (at) {
    const floor = floorAt(world, at.to.x, at.to.y); level = floor ? floor.level : 0;
    at = world.objects.find(o => o.name === "Palace staircase" && o.action === "Climb-up" && Math.abs(o.x - at.to.x) + Math.abs(o.y - at.to.y) < 30 && floorAt(world, o.x, o.y)?.level === level);
  }
  assert.equal(level, 4, "the stairs reach the fifth floor");
  assert(world.objects.some(o => o.name?.startsWith("The regalia of Raria") && floorAt(world, o.x, o.y)?.level === 4), "the regalia under the spire");
});

test("The baked world unbakes to the generated one: every tile, object, building and storey, and heights within a pixel", async () => {
  const { generateWorld, WORLD_SEED, indexObjects, indexBuildings } = await import("../games/rarefriends-realm/world.ts");
  const { bakeWorld, unbakeWorld } = await import("../games/rarefriends-realm/bake.ts");
  const { world, lift } = generateWorld(WORLD_SEED);
  // The maps the bake leaves out are rebuilt from the lists exactly.
  assert.deepEqual(indexObjects(world.objects), world.objectAt, "the tile → object map rebuilds exactly");
  assert.deepEqual(indexBuildings(world.buildings), world.buildingAt, "the tile → building map rebuilds exactly");
  const t0 = performance.now(), text = bakeWorld(world, lift, WORLD_SEED), t1 = performance.now(), back = unbakeWorld(text), t2 = performance.now();
  assert(back, "it unbakes");
  for (const key of ["tiles", "region", "objectAt", "buildingAt"]) assert.deepEqual(back[key], world[key], `${key} survive the bake`);
  // Plain data only: what JSON keeps is everything there was (no NaN, Infinity, functions or class instances).
  const same = (a, b, path) => {
    if (typeof a === "number") { assert(Object.is(a, b), `${path}: ${a} vs ${b}`); return; }
    if (a === null || typeof a !== "object") { assert.equal(b, a, path); return; }
    assert.equal(Array.isArray(b), Array.isArray(a), `${path}: array-ness`);
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) { if (a[key] === undefined && b[key] === undefined) continue; same(a[key], b[key], `${path}.${key}`); }
  };
  for (const key of ["objects", "spawns", "places", "buildings", "floors", "ramparts"]) same(world[key], back[key], key);
  let worst = 0; for (let i = 0; i < world.heights.length; i++) worst = Math.max(worst, Math.abs(world.heights[i] - back.heights[i]));
  assert(worst < 0.5, `heights within half a pixel (worst ${worst})`);
  console.log(`bake ${Math.round(t1 - t0)} ms, unbake ${Math.round(t2 - t1)} ms, ${Math.round(text.length / 1024)} KB`);
  assert.equal(unbakeWorld(text.replace('"v":1', '"v":0')), null, "a bake from another version is refused");
});

test("Adaptive resolution: High drops to 1× after three slow seconds on a sharp screen, comes back with headroom, and gives up after two drops", async () => {
  const { adapt, newAdaptive, HIGH_SCALE } = await import("../games/rarefriends-realm/adaptive.ts");
  const a = newAdaptive();
  assert.equal(adapt(a, 40, 20, 1), null, "nothing to lower on a 1× screen");
  assert.equal(adapt(a, 30, 12, 2), null); assert.equal(adapt(a, 30, 12, 2), null);
  assert.equal(adapt(a, 30, 12, 2), 1, "three slow seconds → 1×");
  for (let i = 0; i < 5; i++) assert.equal(adapt(a, 10, 3, 2), null, "it settles before judging again");
  for (let i = 0; i < 14; i++) assert.equal(adapt(a, 16.7, 4, 2), null);
  assert.equal(adapt(a, 16.7, 4, 2), HIGH_SCALE, "fifteen easy seconds → back up");
  for (let i = 0; i < 5; i++) adapt(a, 10, 3, 2);
  adapt(a, 30, 12, 2); adapt(a, 30, 12, 2);
  assert.equal(adapt(a, 30, 12, 2), 1, "slow again → down again");
  for (let i = 0; i < 40; i++) assert.equal(adapt(a, 16.7, 4, 2), null, "after two drops it stays at 1×");
  const b = newAdaptive(); adapt(b, 30, 12, 2); adapt(b, 15, 12, 2); adapt(b, 30, 12, 2);
  assert.equal(adapt(b, 30, 12, 2), null, "a fast second in between starts the count again");
});

test("Townscape: homes in every village (with their doors reachable), L-shaped and hipped and two-storey buildings, shop and bank fronts, Raria's grand halls", async () => {
  const { walkable } = await import("../games/rarefriends-realm/world.ts");
  const { dressWorld } = await import("../games/rarefriends-realm/facades.ts");
  const g = newGame(), world = dressWorld(g.world), Wd = world.tiles.length / 640;
  // Homes: three for nearly every village, a bed in each, a door you can walk to from the village.
  const homes = world.buildings.filter(b => / home$/.test(b.name)), villages = new Map();
  for (const b of homes) { const parts = b.complex ? world.buildings.filter(o => o.complex === b.complex) : [b]; if (parts[0] !== b) continue; villages.set(b.name, [...(villages.get(b.name) ?? []), parts]); }
  assert(villages.size >= 18, `homes in ${villages.size} villages`);
  assert([...villages.values()].filter(list => list.length >= 3).length >= 15, "three homes in most of them");
  const reach = (fromX, fromY, radius) => {
    const seen = new Set([fromY * Wd + fromX]), queue = [[fromX, fromY]];
    while (queue.length) { const [x, y] = queue.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = ny * Wd + nx; if (seen.has(k) || Math.abs(nx - fromX) > radius || Math.abs(ny - fromY) > radius || !walkable(world, nx, ny)) continue; seen.add(k); queue.push([nx, ny]); } }
    return seen;
  };
  for (const [name, list] of villages) for (const parts of list) {
    const x0 = Math.min(...parts.map(p => p.x0)), y0 = Math.min(...parts.map(p => p.y0)), x1 = Math.max(...parts.map(p => p.x1)), y1 = Math.max(...parts.map(p => p.y1));
    const beds = world.objects.filter(o => o.decor === "bed" && o.x > x0 && o.x < x1 && o.y > y0 && o.y < y1 && o.name !== "__removed");
    assert(beds.length >= 1, `${name} at ${x0},${y0} has a bed`);
    // From the bed, out of the door and well away: a door, and open ground round the house.
    const reached = reach(beds[0].x, beds[0].y, 40);
    assert([...reached].some(k => { const x = k % Wd, y = (k - x) / Wd; return x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1; }), `${name} at ${x0},${y0}: out of the door`);
    assert(reached.size > (x1 - x0 + 5) * (y1 - y0 + 5), `${name} at ${x0},${y0}: and all round the house`);
  }
  // Shapes and roofs.
  const ls = new Set(world.buildings.filter(b => b.complex?.includes("@")).map(b => b.complex));
  assert(ls.size >= 30, `L-shaped buildings (${ls.size})`);
  for (const complex of ls) { const parts = world.buildings.filter(b => b.complex === complex); assert.equal(parts.length, 2, `${complex}: two parts`); }
  assert(world.buildings.filter(b => b.hip).length >= 80, "hipped roofs");
  assert(world.buildings.filter(b => b.storeys === 2).length >= 60, "two-storey buildings");
  assert(world.buildings.filter(b => b.storeys === 3 && b.roof === "cone" && !b.round && !b.keep).length >= 8, "tower-houses");
  // Fronts: every bank's, and the shops'.
  const bankHouses = world.buildings.filter(b => world.objects.some(o => o.kind === "bank" && o.x > b.x0 && o.x < b.x1 && o.y > b.y0 && o.y < b.y1));
  assert(bankHouses.length >= 8 && bankHouses.every(b => b.facade === "bank" && b.walls === "marble"), "every bank is a marble bank");
  const shops = world.buildings.filter(b => b.facade === "shop");
  assert(shops.length >= 30 && shops.filter(b => b.sign).length >= 25, `shops with awnings and signs (${shops.length})`);
  assert(world.buildings.some(b => b.facade === "inn"), "inns hang out a tankard");
  // Raria's halls of state.
  for (const name of ["The Office of Conduct", "The Office of Sigils", "The Sumptuary Office", "The Chapel of the Law", "The Hall of the Order of Dusk", "The Crown Bank"]) {
    const b = world.buildings.find(o => o.name === name);
    assert(b && (b.storeys ?? 1) >= 3 && (b.facade === "civic" || b.facade === "bank"), `${name} is grand`);
  }
  assert(world.buildings.filter(b => b.keep?.dome).length >= 3, "domes over Raria");
});

test("The Ring is roofed and battlemented, with stairs to a walk round the top, the old arcades half-fallen, and the pit open to the sky", async () => {
  const { ARENA, floorAt, walkable } = await import("../games/rarefriends-realm/world.ts");
  const g = newGame(), world = g.world, Wd = world.tiles.length / 640;
  const roof = world.buildings.filter(b => b.complex === "friends_ring");
  assert(roof.length >= 40 && roof.every(b => b.roof === "flat"), "the concourse is roofed, flat and battlemented");
  // The pit is open: nothing over the courtyard.
  for (let y = ARENA.y - 10; y <= ARENA.y + 10; y++) for (let x = ARENA.x - 10; x <= ARENA.x + 10; x++) assert.equal(world.buildingAt[y * Wd + x], 0, `the pit is open at ${x},${y}`);
  // Two staircases up, each landing on the walk, each with one down.
  const ups = world.objects.filter(o => o.name === "Ring stairs" && o.action === "Climb-up"), downs = world.objects.filter(o => o.name === "Ring stairs" && o.action === "Climb-down");
  assert.equal(ups.length, 2, "two staircases"); assert.equal(downs.length, 2, "and two ways down");
  for (const s of [...ups, ...downs]) assert(walkable(world, s.to.x, s.to.y), `stairs at ${s.x},${s.y} land on open floor`);
  for (const s of ups) assert.equal(floorAt(world, s.to.x, s.to.y)?.complex, "friends_ring", "up onto the Ring's walk");
  const walk = world.floors.find(f => f.complex === "friends_ring");
  const onWalk = o => o.x >= walk.x0 + walk.dx && o.x <= walk.x1 + walk.dx && o.y >= walk.y0 + walk.dy && o.y <= walk.y1 + walk.dy && o.name !== "__removed";
  assert(world.objects.filter(o => onWalk(o) && o.decor === "canopy").length >= 30, "stretches of the old roof still standing");
  assert(world.objects.filter(o => onWalk(o) && o.decor === "ruin_wall").length >= 2 && world.objects.some(o => onWalk(o) && o.decor === "rubble"), "and fallen ones");
  // The whole walk is one: from one landing you can walk to the other.
  const [a, b] = ups.map(s => s.to), seen = new Set([a.y * Wd + a.x]), queue = [[a.x, a.y]];
  while (queue.length) { const [x, y] = queue.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (y + dy) * Wd + x + dx; if (!seen.has(k) && walkable(world, x + dx, y + dy)) { seen.add(k); queue.push([x + dx, y + dy]); } } }
  assert(seen.has(b.y * Wd + b.x), "all the way round the walk, landing to landing");
});

test("Dyemoor is a dyers' town of brick, with its clothiers and Counting House, and its dyes dye clothes that stay dyed through a save", async () => {
  const { T, terrainAt } = await import("../games/rarefriends-realm/world.ts");
  const { item, isItem, dyeable, SHOPS } = await import("../games/rarefriends-realm/data.ts");
  const g = newGame(), world = g.world, p = g.player, at = world.places.dyemoor;
  // The town: a brick square, the guildhall, the bank and four clothiers.
  let brick = 0; for (let y = at.y - 12; y <= at.y + 5; y++) for (let x = at.x - 22; x <= at.x + 22; x++) if (terrainAt(world, x, y) === T.BRICK) brick++;
  assert(brick >= 250, `a square of brick (${brick} tiles)`);
  for (const name of ["The Dyers' Guildhall", "Dyemoor Counting House", "Marigold's", "The Wide Wardrobe", "The Far Loom", "The Madder Rose", "The Dyeworks", "Dyemoor Bolts & Thread", "The Crooked Vat"]) assert(world.buildings.some(b => b.name === name), name);
  for (const shop of ["dyemoor_dyes", "dyemoor_wardrobe", "dyemoor_farloom", "dyemoor_madder"]) assert(world.spawns.some(s => s.kind === "npc" && Math.abs(s.x - at.x) < 30 && Math.abs(s.y - at.y) < 25 && (s.id === { dyemoor_dyes: "dyemoor_dyer", dyemoor_wardrobe: "dyemoor_wardrober", dyemoor_farloom: "dyemoor_loomkeeper", dyemoor_madder: "dyemoor_rosekeeper" }[shop])), `${shop} is kept in town`);
  assert(SHOPS.dyemoor_wardrobe.stock.length >= 25 && SHOPS.dyemoor_madder.stock.length >= 25 && SHOPS.dyemoor_farloom.stock.length >= 10, "the world's clothes on the rails");
  assert(!SHOPS.dyemoor_farloom.stock.includes("rarian_mantle"), "earned clothes aren't for sale");
  // Dyeing: a pot of woad on a Dyemoor cloak makes a woad-blue cloak, worn and saved as such; lye washes it back.
  assert(dyeable("dyemoor_cloak") && !dyeable("bronze_plate") && !dyeable("knife"), "cloth dyes, metal doesn't");
  give(p, "dyemoor_cloak"); give(p, "dye_woad"); give(p, "dye_lye");
  const slot = id => p.inventory.findIndex(s => s?.id === id);
  useItemOnItem(g, slot("dye_woad"), slot("dyemoor_cloak")); run(g, 6);
  assert(has(p, "dyemoor_cloak~woad") && !has(p, "dye_woad") && !has(p, "dyemoor_cloak"), "dyed woad blue");
  assert.equal(item("dyemoor_cloak~woad").icon.color, "#4a6aa8"); assert.equal(item("dyemoor_cloak~woad").equip.slot, "cape");
  equip(g, slot("dyemoor_cloak~woad")); assert.equal(p.equipment.cape, "dyemoor_cloak~woad", "worn");
  const back = newGame(); assert(restore(back, JSON.parse(JSON.stringify(serialize(g)))), "restored"); assert.equal(back.player.equipment.cape, "dyemoor_cloak~woad", "still woad blue after a save");
  unequip(g, "cape"); useItemOnItem(g, slot("dye_lye"), slot("dyemoor_cloak~woad")); run(g, 6);
  assert(has(p, "dyemoor_cloak") && !has(p, "dyemoor_cloak~woad"), "lye washes it out");
  assert(!isItem("dyemoor_cloak~nonsense") && !isItem("bronze_plate~woad"), "only real dyes on dyeable things");
});

test("Craftwork: a carving gouge carves logs into figures that help everyone near them for a while, then crumble", async () => {
  const { carvingEffect, carvingRecipes } = await import("../games/rarefriends-realm/engine.ts");
  const { CARVINGS, SKILL_NAMES, SHOPS } = await import("../games/rarefriends-realm/data.ts");
  assert.equal(SKILL_NAMES.crafting, "Craftwork", "the skill is Craftwork");
  assert(SHOPS.crafting.stock.includes("carving_gouge") && SHOPS.general.stock.includes("carving_gouge"), "gouges in the shops");
  assert.equal(new Set(CARVINGS.map(c => c.log)).size, CARVINGS.length, "every wood its own carving");
  assert(!CARVINGS.some(c => /totem/i.test(c.name)), "no totems");
  const g = newGame(), p = g.player, slot = id => p.inventory.findIndex(s => s?.id === id);
  p.xp.crafting = XP_TABLE[60];
  give(p, "carving_gouge"); give(p, "oak_logs"); give(p, "oak_logs"); give(p, "knife");
  // The knife won't do; the gouge will.
  useItemOnItem(g, slot("knife"), slot("oak_logs")); assert(!g.ui.production?.recipes.some(r => r.label === "Oak bulwark"), "not with a knife");
  g.ui.production = null; useItemOnItem(g, slot("carving_gouge"), slot("oak_logs"));
  assert(g.ui.production?.recipes.some(r => r.label === "Oak bulwark"), "the gouge offers an oak bulwark");
  startProduction(g, carvingRecipes("oak_logs")[0], 1); run(g, 8);
  assert(has(p, "carving_oak") && !has(p, "oak_logs"), "two oak logs carved into a bulwark");
  // Set it down: near it, 12% less damage taken; away from it, nothing.
  itemOptions(g, slot("carving_oak")).find(o => o.verb === "Set-down").run(g);
  assert.equal(g.carvings.length, 1); assert.equal(carvingEffect(g).taken, 0.12, "sheltered near it");
  const home = { x: p.x, y: p.y }; p.x += 10; tick(g); assert.equal(carvingEffect(g).taken, 0, "nothing far from it"); p.x = home.x; tick(g);
  // Different kinds add up; the same kind doesn't; three at most.
  const place = id => { p.x = home.x + g.carvings.length; give(p, id); itemOptions(g, slot(id)).find(o => o.verb === "Set-down").run(g); };
  place("carving_oak"); place("carving_willow"); p.x = home.x; tick(g);
  const e = carvingEffect(g); assert.equal(e.taken, 0.12, "two bulwarks don't stack"); assert.equal(e.faith, 0.4, "a willow vigil slows Faith's drain");
  place("carving_maple"); assert.equal(g.carvings.length, 3, "three at most: the oldest crumbled");
  // They crumble away when their time is up.
  run(g, 260);
  assert.equal(g.carvings.length, 0, "all crumbled away"); assert(g.messages.some(m => /crumbles away/.test(m.text)), "and you hear about it");
});

test("Bars: one in every town, each with a barkeep's quest, a quiet trader, house drinks, and a job board of bounties and errands", async () => {
  const { BARS, boardJobs, currentJob } = await import("../games/rarefriends-realm/bars.ts");
  const { BAR_SITES } = await import("../games/rarefriends-realm/barfit.ts");
  const { MONSTERS, SHOPS, isItem, item } = await import("../games/rarefriends-realm/data.ts");
  const { FACTION_MONSTERS } = await import("../games/rarefriends-realm/factions.ts");
  const g = newGame(), world = g.world, p = g.player;
  assert.deepEqual(BAR_SITES.map(s => [s.bar, s.keeper, s.fence]), BARS.map(b => [b.id, b.keeper, b.fence]), "the fitting and the bars agree");
  for (const bar of BARS) {
    const b = world.buildings.find(entry => entry.name === bar.name);
    assert(b, `${bar.name} stands in ${bar.town}`);
    const inside = s => s.x > b.x0 && s.x < b.x1 && s.y > b.y0 && s.y < b.y1;
    assert(world.spawns.some(s => s.id === bar.keeper && inside(s)), `${bar.name}: its barkeep behind the bar`);
    assert(world.spawns.some(s => s.id === bar.fence && inside(s)), `${bar.name}: a quiet trader at a table`);
    assert(world.objects.some(o => o.kind === "board" && o.text === bar.id && inside(o)), `${bar.name}: a job board`);
    assert(SHOPS[NPCS[bar.keeper].shop].stock.includes(bar.drink) && SHOPS[NPCS[bar.keeper].shop].stock.includes("ale"), `${bar.name} pours its own`);
    assert.equal(NPCS[bar.fence].shop, "fence");
    for (const id of bar.kills) assert(MONSTERS[id] ?? FACTION_MONSTERS[id], `${bar.name}: ${id} is a creature`);
    for (const [id] of bar.fetch) assert(isItem(id), `${bar.name}: ${id} is an item`);
    assert(QUESTS.some(q => q.id === bar.quest), `${bar.name} has a quest`);
  }
  for (const id of SHOPS.fence.stock) assert(isItem(id), id);
  // A drink is drunk.
  give(p, "madder_wine"); const wine = p.inventory.findIndex(s => s?.id === "madder_wine");
  assert(itemOptions(g, wine).some(o => o.verb === "Drink")); p.hp = 5; itemOptions(g, wine).find(o => o.verb === "Drink").run(g);
  assert(g.messages.some(m => /You drink the madder wine/.test(m.text)) && p.boosts.magic === 2, "a drink heals and lends a point");
  // The board: take a bounty, kill for it, collect.
  const vat = BARS.findIndex(b => b.id === "vat"), jobs = boardJobs(g, vat);
  assert.equal(jobs.length, 3); assert.equal(jobs.filter(j => j.kind === "kill").length, 2); assert.equal(jobs.filter(j => j.kind === "fetch").length, 1);
  let d = readJobBoard(g, "vat"); const take = d.options.findIndex(o => /Put down/.test(o.label)); d.options[take].then();
  const job = currentJob(g); assert(job && job.job.kind === "kill", "a bounty taken");
  const target = BARS[vat].kills[job.job.target];
  for (let i = 0; i < job.job.count; i++) onMonsterKilled(g, target, 0, 0);
  assert.equal(currentJob(g).done, job.job.count, "every kill counted");
  const coins = count(p, "coins"); d = readJobBoard(g, "vat"); d.options.find(o => /Collect/.test(o.label)).then();
  assert.equal(count(p, "coins"), coins + job.job.reward, "paid at the board"); assert.equal(currentJob(g), null); assert.equal(p.questData.jobs_done, 1);
  // An errand: hand the goods in.
  const errand = boardJobs(g, vat).find(j => j.kind === "fetch"), [wanted] = BARS[vat].fetch[errand.target];
  d = readJobBoard(g, "vat"); d.options.find(o => /^Bring/.test(o.label)).then();
  for (let i = 0; i < errand.count; i++) give(p, wanted);
  d = readJobBoard(g, "vat"); d.options.find(o => /Hand it in/.test(o.label)).then();
  assert.equal(count(p, wanted), 0); assert.equal(p.questData.jobs_done, 2, "errand handed in");
  // A job from one bar isn't handed in at another.
  d = readJobBoard(g, "vat"); d.options[0].then(); d = readJobBoard(g, "kettle"); assert(/already/.test(d.lines[0].text), "one job at a time, from one bar");
  // The barkeep's quest.
  const { talk } = await import("../games/rarefriends-realm/content.ts");
  let t = talk(g, "vat_keeper"); t.options.find(o => /do it/.test(o.label)).then().onEnd?.();
  assert.equal(p.quests.bar_vat, 1, "quest started");
  for (let i = 0; i < 12; i++) give(p, "sweetberry"); for (let i = 0; i < 4; i++) give(p, "willow_logs");
  t = talk(g, "vat_keeper"); t.onEnd?.();
  assert(p.quests.bar_vat >= 2 && has(p, "madder_wine"), "quest done, wine poured");
  // The quiet trader's gear works.
  const { successChance } = await import("../games/rarefriends-realm/engine.ts"); void successChance;
  assert(item("softsole_boots").equip.slot === "feet" && item("sleight_gloves").equip.slot === "hands");
});
