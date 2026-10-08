// The preview site in the Realm's languages (site/preview/lang.ts): the picker offers the game's languages, and every
// row of the site's tables has every language, with the same placeholders and the same markup as the English, so a
// translated block keeps its links and bold names. tests/preview-browser.mjs checks that nothing on the pages is left in
// English.
import test from "node:test";
import assert from "node:assert/strict";
import { SITE_LANGUAGES } from "../site/preview/languages.ts";
import { siteTable, siteDictionaries } from "../scripts/preview-lang.mjs";
import { LANGUAGES } from "../games/rarefriends-realm/i18n.ts";
import { TABLE_LANGUAGES } from "../games/rarefriends-realm/lang/table.ts";

test("the site offers the game's languages, by the same ids and names", () => {
  assert.deepEqual(SITE_LANGUAGES.map(lang => [lang.id, lang.name]), LANGUAGES.map(lang => [lang.id, lang.name]));
});

test("every row of the site's tables has every language, with the English's placeholders and markup", async () => {
  const holes = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
  const tags = text => [...text.matchAll(/<(\/?[a-z]+)(?:\s[^>]*)?>/g)].map(m => m[1]).sort().join();
  const links = text => [...text.matchAll(/href="([^"]*)"/g)].map(m => m[1]).join();
  for (const [english, row] of Object.entries(await siteTable())) {
    assert.equal(row.length, TABLE_LANGUAGES.length, english);
    row.forEach((text, i) => {
      const lang = TABLE_LANGUAGES[i];
      assert.ok(text.trim(), `${lang} has "${english}"`);
      assert.equal(holes(text), holes(english), `${lang} keeps the placeholders of "${english}"`);
      assert.equal(tags(text), tags(english), `${lang} keeps the markup of "${english}"`);
      assert.equal(links(text), links(english), `${lang} keeps the links of "${english}"`);
    });
  }
});

test("each language's dictionary has the site's words and the game's guide, recipe and track names", async () => {
  const dictionaries = await siteDictionaries();
  assert.deepEqual(Object.keys(dictionaries).sort(), [...TABLE_LANGUAGES].sort());
  for (const [lang, dictionary] of Object.entries(dictionaries)) {
    assert.ok(dictionary["What's new"], `${lang}: the site's own words`);
    assert.ok(dictionary["Recipe book"], `${lang}: the guides page`);
    assert.ok(dictionary["Attack"], `${lang}: the game's skill names`);
  }
});
