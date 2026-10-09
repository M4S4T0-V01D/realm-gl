// The Realm's wars (skirmish.ts): every soldier can be fought and fights, sides at odds fight where they meet, and a
// creature a soldier cuts down leaves nothing unless you'd wounded it.
import test from "node:test";
import assert from "node:assert/strict";
import { menuFor, tick } from "../games/rarefriends-realm/engine.ts";
import { createGame } from "../games/rarefriends-realm/state.ts";
import { MONSTERS } from "../games/rarefriends-realm/data.ts";
import { NPCS } from "../games/rarefriends-realm/content.ts";
import { SOLDIERS, TWIN_BASE, hostile, sideOf } from "../games/rarefriends-realm/skirmish.ts";

const seeded = (seed = 11) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const fresh = () => { const game = createGame({ familyId: 1, friendId: 7, rng: seeded() }); game.player.x = 5; game.player.y = 5; return game; };
const run = (game, n) => { for (let i = 0; i < n; i++) { tick(game); game.events.length = 0; } };
/** Put a creature of `id` beside (dx, dy from) a point, alive and full of health, and return it. */
function placeBeside(game, id, at, dx = 1, dy = 0) {
  const monster = game.monsters.find(entry => entry.def.id === id && entry.twinOf === undefined);
  Object.assign(monster, { x: at.x + dx, y: at.y + dy, prev: { x: at.x + dx, y: at.y + dy }, spawn: { x: at.x + dx, y: at.y + dy }, dead: false, hp: monster.def.hp, target: false, foe: null, retreat: 0 });
  return monster;
}
/** Clear every other creature from round a point, so a test fight is only the one we set up. */
function clearAround(game, at, r = 14, keep = []) {
  for (const monster of game.monsters) if (!keep.includes(monster) && Math.max(Math.abs(monster.x - at.x), Math.abs(monster.y - at.y)) <= r) { monster.dead = true; monster.respawnAt = 1e9; }
}

test("every soldier has a fighting self that looks and reads like it, and a side", () => {
  for (const [id, def] of Object.entries(SOLDIERS)) {
    assert.ok(NPCS[id], `${id} is a person in the Realm`);
    assert.equal(def.name, NPCS[id].name); assert.equal(def.examine, NPCS[id].examine);
    assert.equal(def.look, id); assert.equal(MONSTERS[id], def, `${id} is a creature too`);
    assert.ok(sideOf(def), `${id} fights for someone`);
  }
  for (const id of ["guard", "hollowmere_soldier", "royal_guard", "dawn_knight", "diamond_guard", "ember_guard", "dusk_guard", "rrr_soldier", "fff_ranger", "barkreach_ranger", "maidens_villager"]) assert.ok(SOLDIERS[id], `${id} can be fought`);
  // The wars: the Regiment and the Federation, Hollowmere and the Regiment and its deserters; everyone against the wild and the dead.
  assert.ok(hostile("rrr", "fff") && hostile("fff", "rrr") && hostile("hollowmere", "rrr") && hostile("hollowmere", "deserter") && hostile("order", "dead") && hostile("maidens", "wild"));
  assert.ok(!hostile("hollowmere", "order") && !hostile("wild", "dead") && !hostile("wild", "wild") && !hostile("rrr", "raria"));
  assert.equal(sideOf(MONSTERS.chicken), null, "chickens fight nobody");
  assert.equal(sideOf(MONSTERS.rrr_footman), "rrr"); assert.equal(sideOf(MONSTERS.fff_picket), "fff"); assert.equal(sideOf(MONSTERS.skeleton), "dead"); assert.equal(sideOf(MONSTERS.wolf), "wild");
});

test("you can attack a soldier: it draws steel, its comrades rally, and it falls and comes back to its post", () => {
  const game = fresh(), npc = game.npcs.find(entry => entry.id === "hollowmere_soldier"), comrade = game.npcs.find(entry => entry.id === "hollowmere_soldier" && entry !== npc && Math.max(Math.abs(entry.x - npc.x), Math.abs(entry.y - npc.y)) <= 7);
  clearAround(game, npc);
  Object.assign(game.player, { x: npc.x + 1, y: npc.y, prev: { x: npc.x + 1, y: npc.y } });
  for (const s of ["attack", "strength", "defence", "hitpoints"]) game.player.xp[s] = 13_034_431; game.player.hp = 99;
  const menu = menuFor(game, [{ kind: "npc", id: npc.uid }], null);
  assert.deepEqual(menu.map(option => option.verb), ["Talk-to", "Attack", "Examine"]);
  assert.match(menu[1].noun, /Hollowmere soldier {2}\(level-42\)/);
  menu[1].run(game);
  const twin = game.monsters.find(monster => monster.uid === TWIN_BASE + npc.uid);
  assert.ok(twin && npc.drawn === twin.uid, "the soldier drew steel");
  assert.equal(twin.def.look, "hollowmere_soldier");
  assert.equal(menuFor(game, [{ kind: "npc", id: npc.uid }], null).length, 0, "the soldier itself is put away meanwhile");
  run(game, 4);
  assert.ok(twin.target, "it fights you");
  if (comrade) assert.ok(comrade.drawn && game.monsters.find(monster => monster.uid === comrade.drawn)?.target, "its comrade came to help");
  for (let i = 0; i < 400 && !twin.dead; i++) { game.player.hp = 99; tick(game); game.events.length = 0; }
  assert.ok(twin.dead, "it fell");
  assert.ok(game.ground.some(entry => entry.id === "bones"), "a soldier you fell leaves its bones");
  assert.ok((game.player.killLog.hollowmere_soldier ?? 0) >= 1);
  run(game, twin.def.respawn + 5);
  assert.ok(!npc.drawn && !game.monsters.includes(twin), "it's back at its post");
  assert.equal(npc.x, npc.spawn.x); assert.equal(npc.y, npc.spawn.y);
});

test("soldiers draw on the wild and the dead that come near, and what they cut down leaves nothing", () => {
  const game = fresh(), npc = game.npcs.find(entry => entry.id === "dawn_knight");
  clearAround(game, npc);
  const skeleton = placeBeside(game, "skeleton", npc, 2, 0);
  run(game, 6);
  const twin = game.monsters.find(monster => monster.uid === TWIN_BASE + npc.uid);
  assert.ok(twin && twin.foe === skeleton.uid, "the knight drew on the skeleton");
  const before = game.ground.length;
  for (let i = 0; i < 300 && !skeleton.dead && !twin.dead; i++) { tick(game); game.events.length = 0; }
  assert.ok(skeleton.dead || twin.dead, "one of them fell");
  assert.equal(game.ground.length, before, "nothing dropped for you");
  assert.equal(game.player.kills, 0, "and it isn't your kill");
  // With nothing left to fight, the knight puts its steel away.
  run(game, 30);
  if (!twin.dead) assert.ok(!npc.drawn, "the knight sheathed");
});

test("the Regiment and the Federation fight where they meet; one you wounded is yours however it falls", () => {
  const game = fresh(), footman = game.monsters.find(monster => monster.def.id === "rrr_footman");
  clearAround(game, footman, 14, [footman]);
  const picket = placeBeside(game, "fff_picket", footman, 3, 0);
  run(game, 4);
  assert.ok(footman.foe === picket.uid || picket.foe === footman.uid, "they found each other");
  // You put an arrow in the picket from out of the way: when the Regiment finishes it, the drop is yours.
  picket.mine = true;
  for (let i = 0; i < 400 && !picket.dead && !footman.dead; i++) { tick(game); game.events.length = 0; }
  assert.ok(picket.dead || footman.dead);
  if (picket.dead) assert.ok(game.ground.some(entry => entry.id === "bones" && Math.abs(entry.x - picket.x) <= 1), "the picket's bones are yours");
});

test("a soldier another player is fighting comes out here too (shared fights)", async () => {
  const { syncMonster } = await import("../games/rarefriends-realm/engine.ts");
  const game = fresh(), npc = game.npcs.find(entry => entry.id === "rrr_soldier");
  syncMonster(game, { u: TWIN_BASE + npc.uid, id: "rrr_soldier", hp: 40, x: npc.x, y: npc.y }, 99);
  const twin = game.monsters.find(monster => monster.uid === TWIN_BASE + npc.uid);
  assert.ok(twin && npc.drawn === twin.uid, "the same soldier, by the same uid");
});
