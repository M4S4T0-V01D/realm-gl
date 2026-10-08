// The preview site's dictionaries (see site/preview/lang.ts): for each of the game's languages, lang/<id>.json holds the
// site's own words (the tables in site/preview/lang/, one row per English text with its translations in the game's
// TABLE_LANGUAGES order) and everything the skill guides page shows from the game's data (skill
// names, every guide entry, the recipe book and item names) and the soundtrack's names, translated by the game's own
// table so the two always agree.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
// The engine first: the content modules import each other in a circle that only resolves from here.
await import("../games/rarefriends-realm/engine.ts");
const { LANGUAGES, translate } = await import("../games/rarefriends-realm/i18n.ts");
const { recipeBook, skillGuide } = await import("../games/rarefriends-realm/guide.ts");
const { SKILLS, SKILL_NAMES, item } = await import("../games/rarefriends-realm/data.ts");
const { TABLE_LANGUAGES } = await import("../games/rarefriends-realm/lang/table.ts");
const { TRACKS } = await import("../games/rarefriends-realm/audio.ts");
/** The site's own tables, page by page. */
export const SITE_PARTS = ["common", "news", "gallery", "gallery2", "features", "more", "lore", "lore2"];
export async function siteTable() {
  const table = {};
  for (const part of SITE_PARTS) Object.assign(table, (await import(`../site/preview/lang/${part}.ts`)).default);
  return table;
}

/** The game's English the site shows: the skill guides page, and the soundtrack's names in the jukebox. */
export function guideStrings() {
  const out = new Set();
  for (const skill of SKILLS) { out.add(SKILL_NAMES[skill]); for (const entry of skillGuide(skill)) { out.add(entry.name); out.add(entry.detail); } }
  for (const recipe of recipeBook()) { out.add(recipe.label); out.add(recipe.where); out.add(`${SKILL_NAMES[recipe.skill]} · ${recipe.xp} XP · ${recipe.where}`); for (const id of Object.keys(recipe.inputs)) out.add(item(id).name); }
  for (const track of TRACKS) out.add(track.name);
  return [...out].filter(text => /[A-Za-z]/.test(text));
}
/** Every language's dictionary, by id (English has none). */
export async function siteDictionaries() {
  const out = {}, game = guideStrings(), table = await siteTable();
  for (const { id } of LANGUAGES) {
    if (id === "en") continue;
    const dictionary = {};
    for (const english of game) { const there = translate(english, id); if (there !== english) dictionary[english] = there; }
    const column = TABLE_LANGUAGES.indexOf(id);
    for (const [english, row] of Object.entries(table)) dictionary[english] = row[column];
    out[id] = dictionary;
  }
  return out;
}
export async function writeSiteLanguages(outdir) {
  await mkdir(path.join(outdir, "lang"), { recursive: true });
  for (const [id, dictionary] of Object.entries(await siteDictionaries())) await writeFile(path.join(outdir, "lang", `${id}.json`), JSON.stringify(dictionary));
}
