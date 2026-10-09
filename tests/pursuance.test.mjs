// Pursuance (pursuance.ts, slayer.ts): a creature's facts learnt once each, by eye, in the fight, by study, on the
// trail or from the Warden; mastery; tracks; marked creatures; contracts of three kinds; and the journal saved safely.
import test from "node:test";
import assert from "node:assert/strict";
import { menuFor, restore, serialize, tick } from "../games/rarefriends-realm/engine.ts";
import { createGame, give, count } from "../games/rarefriends-realm/state.ts";
import { MONSTERS, SKILL_NAMES, XP_TABLE } from "../games/rarefriends-realm/data.ts";
import { eyeLevel, examineCreature, inspectTrack, knows, learn, lore, mastery, masteryBoost, maxHpOf, onAttacked, onKilled, onPoison, onWeakSpot, research, researchCost, rollMarked, trackTick } from "../games/rarefriends-realm/pursuance.ts";
import { assignTask, contractKind, currentTask, taskText } from "../games/rarefriends-realm/slayer.ts";
import { talk } from "../games/rarefriends-realm/content.ts";

const seeded = (seed = 5) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const fresh = () => createGame({ familyId: 1, friendId: 7, rng: seeded() });
const setLevel = (game, n) => { game.player.xp.slayer = XP_TABLE[n]; };
const creature = (game, id) => game.monsters.find(monster => monster.def.id === id);

test("the skill is Pursuance, still saved as slayer", () => {
  assert.equal(SKILL_NAMES.slayer, "Pursuance");
  assert.ok(!Object.values(SKILL_NAMES).includes("Slayer"));
});

test("examine: a first look writes it in your journal (once), and your eye judges more as your Pursuance grows", () => {
  const game = fresh(), wolf = creature(game, "wolf");
  const first = examineCreature(game, wolf), xp = game.player.xp.slayer;
  assert.ok(knows(game, "wolf", "seen") && xp > 0, "seen, and some XP for it");
  assert.ok(!knows(game, "wolf", "weakness"), "a novice can't see its weakness");
  assert.match(first, /more to learn/);
  examineCreature(game, wolf);
  assert.equal(game.player.xp.slayer, xp, "looking again pays nothing");
  setLevel(game, eyeLevel(wolf.def, "weakness"));
  const later = examineCreature(game, wolf);
  assert.ok(knows(game, "wolf", "temper") && knows(game, "wolf", "defences") && knows(game, "wolf", "weakness"), "now you can judge it by eye");
  assert.match(later, /attacks on sight/);
});

test("in the fight: a weak spot found by spell, the dead by faith, poison tried, and each trick it uses on you", () => {
  const game = fresh(), salamander = creature(game, "ember_salamander") ?? creature(game, "bark_lurker");
  assert.ok(!knows(game, salamander.def.id, "weakness"));
  onWeakSpot(game, salamander);
  assert.ok(knows(game, salamander.def.id, "weakness"), "a spell of its element bit deep");
  assert.ok(game.messages.some(entry => entry.text.includes("is weak to")));
  const skeleton = creature(game, "skeleton");
  onPoison(game, skeleton);
  assert.ok(knows(game, "skeleton", "weakness"), "poison can't touch the dead: now you know");
  const adder = Object.values(MONSTERS).find(def => def.poison && !def.boss);
  const it = game.monsters.find(monster => monster.def.id === adder.id);
  onAttacked(game, it, { poisoned: true });
  assert.ok(knows(game, adder.id, "temper"), "it attacked you: you know how it fights");
  assert.ok(lore(game, adder.id).a > 0, "and its venom");
});

test("by study: kills teach where it lives, its guard and its weakness; mastery comes with kills and knowledge", () => {
  const game = fresh(), wolf = creature(game, "wolf");
  setLevel(game, 30);
  for (let n = 1; n <= 10; n++) { game.player.killLog.wolf = n; onKilled(game, wolf, ["large_bones", "frost_shard"]); }
  assert.ok(knows(game, "wolf", "habitat") && knows(game, "wolf", "defences") && knows(game, "wolf", "weakness"));
  assert.deepEqual(lore(game, "wolf").d.sort(), ["frost_shard", "large_bones"], "the drops you've seen");
  assert.equal(mastery(game, "wolf"), 1, "Familiar at 10 with its weakness known");
  assert.ok(masteryBoost(game, "wolf") > 1);
  assert.ok(game.messages.some(entry => entry.text.includes("familiar with the Frost wolf")));
  const xp = game.player.xp.slayer;
  onKilled(game, wolf, ["large_bones"]);
  assert.ok(game.player.xp.slayer === xp, "nothing new, nothing paid");
});

test("tracks: they lie near you on the way to something you can read, and reading one teaches you and shows the trail", () => {
  const game = fresh(), wolf = creature(game, "wolf");
  setLevel(game, 40);
  Object.assign(game.player, { x: wolf.x - 12, y: wolf.y, prev: { x: wolf.x - 12, y: wolf.y } });
  for (let i = 0; i < 400 && !game.tracks.length; i++) { game.tick++; trackTick(game); }
  assert.ok(game.tracks.length > 0, "tracks appeared");
  const track = game.tracks[0], before = game.player.xp.slayer;
  assert.ok(MONSTERS[track.id].level <= 40 + 15, "only what your level can read");
  const menu = menuFor(game, [{ kind: "track", id: track.uid }], null);
  assert.deepEqual(menu.map(option => option.verb), ["Inspect", "Examine"]);
  inspectTrack(game, track.uid);
  assert.ok(game.player.xp.slayer > before && knows(game, track.id, "habitat"));
  assert.equal(game.player.trail.id, track.id, "its kind is marked on your map");
  assert.ok(game.messages.some(entry => /^Fresh .* tracks, heading (north|south|east|west)/.test(entry.text)));
});

test("marked creatures: stronger, a trophy and XP when you put one down; the Warden pays for trophies", () => {
  const game = fresh(), wolf = creature(game, "wolf");
  game.rng = () => 0; rollMarked(game, wolf);
  assert.ok(wolf.marked && wolf.hp === maxHpOf(wolf) && maxHpOf(wolf) > wolf.def.hp);
  assert.match(menuFor(game, [{ kind: "monster", id: wolf.uid }], null)[0].noun, /^Marked Frost wolf/);
  game.player.killLog.wolf = 1; onKilled(game, wolf, []);
  assert.equal(lore(game, "wolf").m, 1); assert.ok(!wolf.marked);
  give(game.player, "hunters_trophy", 3);
  const reply = talk(game, "slayer_master:trophies");
  assert.ok(reply);
  assert.equal(count(game.player, "hunters_trophy"), 0); assert.equal(game.player.questData.slayer_points, 18);
});

test("the Warden's research tells you everything about a creature you've met, for points", () => {
  const game = fresh(), wraith = creature(game, "dusk_wraith");
  examineCreature(game, wraith);
  game.player.questData.slayer_points = 1;
  assert.equal(research(game, "dusk_wraith"), false, "not enough points");
  game.player.questData.slayer_points = 100;
  assert.equal(research(game, "dusk_wraith"), true);
  assert.equal(game.player.questData.slayer_points, 100 - researchCost(wraith.def));
  for (const fact of ["temper", "habitat", "weakness", "defences", "abilities"]) assert.ok(knows(game, "dusk_wraith", fact), fact);
});

test("contracts: put them down, read their tracks, or study them", () => {
  const game = fresh();
  for (const s of ["attack", "strength", "defence", "hitpoints"]) game.player.xp[s] = 13_034_431;
  setLevel(game, 60);
  const kinds = new Set();
  for (let i = 0; i < 60; i++) { game.player.questData.slayer_left = 0; assignTask(game, true); kinds.add(contractKind(game)); assert.ok(currentTask(game)); }
  assert.deepEqual([...kinds].sort(), ["kill", "study", "track"]);
  // A study contract ends when you know how it fights, its guard and its weakness.
  while (contractKind(game) !== "study") assignTask(game, true);
  const id = currentTask(game).monsters[0];
  assert.match(taskText(game), /learn how/);
  for (const fact of ["temper", "weakness", "defences"]) learn(game, id, fact, true);
  assert.equal(currentTask(game), null, "studied: the contract's done");
  assert.ok(game.player.questData.slayer_points >= 10);
});

test("the journal saves, and a tampered one is cleaned", () => {
  const game = fresh(), wolf = creature(game, "wolf");
  examineCreature(game, wolf); lore(game, "wolf").d.push("frost_shard");
  const save = JSON.parse(JSON.stringify(serialize(game)));
  const again = fresh();
  assert.ok(restore(again, save));
  assert.ok(knows(again, "wolf", "seen")); assert.deepEqual(again.player.lore.wolf.d, ["frost_shard"]);
  save.lore = { wolf: { k: 9999, a: -4, d: ["frost_shard", "not_an_item", 7], t: "x", m: 1e12 }, not_a_creature: { k: 1 }, chicken: "nope" };
  const cleaned = fresh();
  assert.ok(restore(cleaned, save));
  assert.deepEqual(Object.keys(cleaned.player.lore), ["wolf"]);
  assert.deepEqual(cleaned.player.lore.wolf, { k: 63, a: 0, d: ["frost_shard"], t: 0, m: 1e6, r: 0 });
});

test("only a weakness you know shows, and a soldier you fight is in the journal too", () => {
  const game = fresh(), npc = game.npcs.find(entry => entry.id === "hollowmere_soldier");
  Object.assign(game.player, { x: npc.x + 1, y: npc.y, prev: { x: npc.x + 1, y: npc.y } });
  const attack = menuFor(game, [{ kind: "npc", id: npc.uid }], null).find(option => option.verb === "Attack");
  attack.run(game);
  const twin = game.monsters.find(monster => monster.twinOf === npc.uid);
  const text = examineCreature(game, twin);
  assert.match(text, /^A soldier of the Kingdom of Hollowmere/);
  assert.ok(knows(game, "hollowmere_soldier", "seen"));
  for (let i = 0; i < 5; i++) tick(game);
});

test("Pursuance speaks every language: examine, discoveries, tracks, contracts, the Warden and the journal", async () => {
  const { LANGUAGES, untranslated } = await import("../games/rarefriends-realm/i18n.ts");
  const { knownLines, MASTERY, habitats, pursuable } = await import("../games/rarefriends-realm/pursuance.ts");
  const { SLAYER_TASKS } = await import("../games/rarefriends-realm/data.ts");
  const game = fresh(), texts = new Set();
  game.player.questData.slayer_points = 9999; setLevel(game, 99);
  // Every creature, everything known: what Examine and the journal say, and every line learning it prints.
  for (const def of Object.values(MONSTERS).filter(pursuable)) {
    const monster = game.monsters.find(entry => entry.def.id === def.id) ?? { def, uid: -1 };
    game.messages.length = 0;
    texts.add(examineCreature(game, monster)); learn(game, def.id, "habitat"); learn(game, def.id, "abilities"); onWeakSpot(game, monster); onPoison(game, monster);
    game.player.killLog[def.id] = 150; onKilled(game, { ...monster, marked: true }, []);
    for (const line of knownLines(game, def)) texts.add(line);
    for (const region of habitats(game, def.id)) texts.add(region);
    for (const entry of game.messages) texts.add(entry.text);
    texts.add(`Marked ${def.name}`);
  }
  for (const tier of MASTERY) texts.add(tier);
  // Tracks, every way they can head.
  for (const way of ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]) texts.add(`Fresh Frost wolf tracks, heading ${way}.`);
  // Contracts of every kind on every creature, and the Warden's talk.
  for (const task of SLAYER_TASKS) for (const kind of [0, 1, 2]) {
    Object.assign(game.player.questData, { slayer_task: SLAYER_TASKS.indexOf(task) + 1, slayer_left: 5, slayer_kind: kind });
    texts.add(taskText(game));
  }
  game.messages.length = 0;
  for (let i = 0; i < 30; i++) { game.player.questData.slayer_left = 0; assignTask(game, true); }
  for (const entry of game.messages) texts.add(entry.text);
  for (const key of ["slayer_master", "slayer_master:research", "slayer_master:trophies", "slayer_master:rewards"]) {
    const reply = talk(game, key);
    for (const line of reply?.lines ?? []) texts.add(typeof line === "string" ? line : line.text);
    for (const option of reply?.options ?? []) texts.add(option.label);
  }
  texts.delete("");
  for (const lang of LANGUAGES.map(entry => entry.id).filter(id => id !== "en")) {
    const left = [...texts].flatMap(text => untranslated(text, lang));
    assert.deepEqual([...new Set(left)].slice(0, 12), [], `${lang}: still in English`);
  }
});
