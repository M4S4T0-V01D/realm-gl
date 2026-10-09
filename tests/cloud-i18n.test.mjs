// Everything cloud saves says, in every language: each sentence the cloud panel, dialogs, chip and chat can show,
// with its numbers, times and names filled in, is fully translated.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGUAGES, translate, untranslated } from "../games/rarefriends-realm/i18n.ts";

const read = name => readFileSync(new URL(`../games/rarefriends-realm/${name}`, import.meta.url), "utf8");
/** The UI text in a source file's string literals (sentences and labels, with sample values for ${…}). */
function texts(source, pick) {
  const out = new Set();
  for (const match of source.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    let text = match[1] ?? match[2];
    if (!text || !pick(text)) continue;
    text = text.replace(/\$\{ago\([^}]*\)\}/g, "5 min ago").replace(/\$\{minutes\}/g, "5").replace(/\$\{Math\.floor\(minutes \/ 60\)\}/g, "3").replace(/\$\{Math\.floor\(minutes \/ 1440\)\}/g, "2")
      .replace(/\$\{friendId\}/g, "7730").replace(/\$\{summary\.where\}/g, "Friendhollow").replace(/\$\{short\([^}]*\)\}/g, "0x1234…abcd").replace(/\$\{summary\.\w+\}/g, "42");
    if (/\$\{/.test(text)) continue;
    out.add(text);
  }
  return out;
}
const sentence = text => /^[A-Z☁·]/.test(text) && /[a-z]/.test(text) && !/^(realm-|rarefriends-realm:|M\d|data-|0x)/.test(text) && !/^[A-Z_]+$/.test(text);

test("cloud saves are translated: panel, dialogs, chip, chat and title", () => {
  const ui = texts(read("cloudui.tsx"), sentence);
  // index.tsx: the cloud lines only (chat notes, chip, saved text, title).
  const game = [...texts(read("index.tsx"), sentence)].filter(text => /cloud|Cloud|☁|Back online|Couldn't reach/.test(text));
  const panel = [...texts(read("panels.tsx"), sentence)].filter(text => /cloud/.test(text));
  const all = [...ui, ...game, ...panel, "☁ Saved to the cloud just now.", "☁ Saved to the cloud 3 h ago.", "Saved 2 days ago", "Last synced 5 min ago", "Played 12 h"];
  assert.ok(all.length > 40, `found the cloud texts (${all.length})`);
  for (const { id } of LANGUAGES.filter(language => language.dictionary)) {
    const left = [...new Set(all.flatMap(text => untranslated(text, id)))];
    assert.deepEqual(left.slice(0, 8), [], `${id}: still in English`);
  }
  // Spot checks: placeholders filled in the right place.
  assert.equal(translate("☁ Saved to the cloud 5 min ago.", "ja"), "☁ クラウドに保存しました(5分前)。");
  assert.equal(translate("The cloud has no save for Friend #7730, but this browser has one. Put it back in the cloud?", "es"), "La nube no tiene guardado del Friend #7730, pero este navegador sí. ¿Lo devolvemos a la nube?");
  assert.equal(translate("Total level 1234", "ko"), "총 레벨 1234");
});
