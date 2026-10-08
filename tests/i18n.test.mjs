// The Realm in other languages: every language has the whole interface, and the skill guides, the recipe book, every
// item's name, the tips, what people say, the quests, the world's things and signs, and what the game tells you leave
// nothing in English. A new item, guide entry, tip, line of dialogue, quest, sign or message needs its row in lang/table.ts.
import test from "node:test";
import assert from "node:assert/strict";
// The engine first: the content modules import each other in a circle that only resolves from here.
import { menuFor } from "../games/rarefriends-realm/engine.ts";
import { LANGUAGES, translate, untranslated } from "../games/rarefriends-realm/i18n.ts";
import { TABLE, TABLE_LANGUAGES } from "../games/rarefriends-realm/lang/table.ts";
import { recipeBook, skillGuide } from "../games/rarefriends-realm/guide.ts";
import { FAMILY_PERKS, ITEM_LIST, MONSTERS, SKILLS, SKILL_NAMES } from "../games/rarefriends-realm/data.ts";
import { FIRST_STEPS } from "../games/rarefriends-realm/firststeps.ts";
import { NPCS, QUESTS, talk } from "../games/rarefriends-realm/content.ts";
import { createGame } from "../games/rarefriends-realm/state.ts";
import { RUMOURS } from "../games/rarefriends-realm/rumours.ts";
import { FOE_GROUPS, MATCHES } from "../games/rarefriends-realm/arena.ts";
import { TITLES } from "../games/rarefriends-realm/presence.ts";

const languages = LANGUAGES.filter(lang => lang.dictionary).map(lang => lang.id);

test("every language's dictionary has the same phrases", () => {
  const reference = Object.keys(LANGUAGES.find(lang => lang.id === "ja").dictionary).sort();
  for (const lang of LANGUAGES) if (lang.dictionary) assert.deepEqual(Object.keys(lang.dictionary).sort(), reference, `${lang.id} has the same keys as ja`);
});

test("the shared table has every language, with the same placeholders as the English", () => {
  assert.deepEqual([...TABLE_LANGUAGES].sort(), [...languages].sort());
  const holes = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
  for (const [english, row] of Object.entries(TABLE)) {
    assert.equal(row.length, TABLE_LANGUAGES.length, english);
    row.forEach((text, i) => {
      assert.ok(text.trim(), `${english}: ${TABLE_LANGUAGES[i]} is empty`);
      assert.equal(holes(text), holes(english), `${english}: ${TABLE_LANGUAGES[i]} keeps the placeholders`);
    });
  }
});

test("the skill guides, the recipe book, item names and tips are translated in every language", () => {
  const texts = new Set([
    ...SKILLS.flatMap(skill => skillGuide(skill).flatMap(entry => [entry.name, entry.detail])),
    ...SKILLS.map(skill => `${SKILL_NAMES[skill]} guide`),
    ...recipeBook().flatMap(recipe => [recipe.label, `${SKILL_NAMES[recipe.skill]} · ${recipe.xp} XP · ${recipe.where}${recipe.chance ? ` · ${Math.round(recipe.chance * 100)}% success` : ""}`]),
    ...ITEM_LIST.map(item => item.name),
    ...FIRST_STEPS.flatMap(step => [step.title, step.text]),
    ...FAMILY_PERKS.flatMap(perk => [perk.title, perk.text]),
  ]);
  for (const lang of languages) {
    const left = [...texts].flatMap(text => untranslated(text, lang));
    assert.deepEqual([...new Set(left)].slice(0, 10), [], `${lang}: still in English`);
  }
});

test("translations fill in numbers and names, and keep lists and players' words apart", () => {
  assert.equal(translate("15 pewter arrows", "ja"), "ピューターの矢×15");
  assert.equal(translate("2 blackiron ore + 1 inkcoal", "es"), "2 mineral de hierro negro + 1 carbón de tinta");
  assert.equal(translate("Wield (+12 attack, +21 strength)", "ja"), "装備 (攻撃+12、筋力+21)");
  assert.equal(translate("Linen shirt (madder red)", "es"), "Camisa de lino (rojo rubia)");
  assert.equal(translate("Day 6: 100 × breeze sigil, 100 × tide sigil", "ru"), "День 6: печать Ветра ×100, печать Прилива ×100");
  // A player's or a Friend family's name is left as it is; an unknown phrase stays English rather than half-translated.
  assert.equal(translate("Your Friend is named Pip. #12 is who it is; Pip is who it's becoming.", "es"), "Tu Friend se llama Pip. #12 es quien es; Pip es quien está llegando a ser.");
  assert.equal(translate("Hide the box", "ja"), "Hide the box");
});

test("what people say, the quests and the rumours are translated in every language", () => {
  const texts = new Set();
  // Everyone's name and what you see when you examine them, then everything they say, two answers deep, on a new game.
  for (const npc of Object.values(NPCS)) [npc.name, npc.examine, ...(npc.options ?? [])].forEach(text => texts.add(text));
  const walk = (dialogue, depth) => {
    if (!dialogue) return;
    dialogue.lines.forEach(line => texts.add(line.text));
    for (const option of dialogue.options ?? []) { texts.add(option.label); if (depth) walk(option.then(), depth - 1); }
  };
  for (const id of Object.keys(NPCS)) walk(talk(createGame({ familyId: 1, friendId: 7 }), id), 2);
  // Every quest's name, requirements, rewards and journal, before, during and after.
  const game = createGame({ familyId: 1, friendId: 7 });
  for (const quest of QUESTS) {
    [quest.name, quest.start, ...(quest.requirements ?? []), ...(quest.rewards ?? [])].filter(Boolean).forEach(text => texts.add(text));
    for (const stage of [0, 1, 2]) { game.player.quests[quest.id] = stage; quest.journal(game).forEach(line => texts.add(line)); }
    delete game.player.quests[quest.id];
  }
  Object.values(RUMOURS).flat().forEach(rumour => texts.add(typeof rumour === "string" ? rumour : rumour.text));
  MATCHES.forEach(match => { texts.add(match.name); texts.add(match.text); });
  FOE_GROUPS.forEach(group => texts.add(group.name));
  TITLES.forEach(title => { texts.add(title.name); texts.add(title.text); });
  Object.values(MONSTERS).forEach(monster => texts.add(monster.name));
  for (const lang of languages) {
    const left = [...texts].flatMap(text => untranslated(text, lang));
    assert.deepEqual([...new Set(left)].slice(0, 10), [], `${lang}: still in English`);
  }
});

test("dialogue fills in numbers and each Order's name", () => {
  assert.equal(translate("Laid to rest: 4/12", "es"), "Puestos a descansar: 4/12");
  assert.equal(translate("Commander of the Order of the Ink. Swears in those who prove their faith.", "pt-BR"), "Comandante da Ordem da Tinta. Toma o juramento de quem prova sua fé.");
  assert.equal(translate("A knight of the Order of the Diamond, in its colours.", "ru"), "Рыцарь Ордена Алмаза, в его цветах.");
  assert.equal(translate("Mind the spiders in the hedges.", "ja"), "生け垣の蜘蛛に気をつけて。");
});

test("the world's things, what Examine says of them, and the signs are translated in every language", () => {
  const game = createGame({ familyId: 1, friendId: 7 }), texts = new Set();
  game.world.objects.forEach((object, id) => {
    if (!object) return;
    if (object.kind === "sign" && object.text) texts.add(object.text);
    for (const option of menuFor(game, [{ kind: "object", id }], null)) {
      texts.add(option.verb); texts.add(option.noun);
      if (option.verb === "Examine") { const before = game.messages.length; option.run(game); game.messages.slice(before).forEach(message => texts.add(message.text)); }
    }
  });
  for (const monster of game.monsters) for (const option of menuFor(game, [{ kind: "monster", id: monster.uid }], null)) { texts.add(option.verb); texts.add(option.noun); }
  texts.delete("");
  for (const lang of languages) {
    const left = [...texts].flatMap(text => untranslated(text, lang));
    assert.deepEqual([...new Set(left)].slice(0, 10), [], `${lang}: still in English`);
  }
});

test("what Examine says of everything you carry and everything you fight is translated in every language", () => {
  const texts = new Set([...ITEM_LIST.map(item => item.examine), ...Object.values(MONSTERS).map(monster => monster.examine)].filter(Boolean));
  for (const lang of languages) {
    const left = [...texts].flatMap(text => untranslated(text, lang));
    assert.deepEqual([...new Set(left)].slice(0, 10), [], `${lang}: still in English`);
  }
});

test("the game's messages put their numbers and things in place, a sentence at a time", () => {
  assert.equal(translate("You need a Strength level of 40 to wield this.", "ja"), "これを装備するには筋力レベル40が必要だ。");
  assert.equal(translate("You fill the satchel with 12 inkcoal (40/100).", "es"), "Llenas la bolsa con 12 de carbón de tinta (40/100).");
  assert.equal(translate("You eat the cake. It heals some health.", "ja"), "ケーキを食べた。体力が少し回復した。");
  assert.equal(translate("You teleport to the Rare Friends Ring.", "ko"), "레어 프렌즈 링(으)로 순간이동했다.");
  assert.equal(translate("Hollis Armoury.", "es"), "Armería Hollis.");
  assert.equal(translate("Hollis Armoury.", "ja"), "ホリス武具店");
});
