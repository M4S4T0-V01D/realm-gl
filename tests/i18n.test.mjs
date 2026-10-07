// The Realm in other languages: every language has the whole interface, and the skill guides, the recipe book, every
// item's name and the tips leave nothing in English. A new item, guide entry or tip needs its row in lang/table.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, translate, untranslated } from "../games/rarefriends-realm/i18n.ts";
import { TABLE, TABLE_LANGUAGES } from "../games/rarefriends-realm/lang/table.ts";
import { recipeBook, skillGuide } from "../games/rarefriends-realm/guide.ts";
import { FAMILY_PERKS, ITEM_LIST, SKILLS, SKILL_NAMES } from "../games/rarefriends-realm/data.ts";
import { FIRST_STEPS } from "../games/rarefriends-realm/firststeps.ts";

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
