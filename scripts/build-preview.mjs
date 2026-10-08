// Build the shareable /preview/ page: copy the page and screenshots, and bundle its music player
// (the game's procedural audio) into music.js, the skill guides page into guides.js, and the language picker into
// lang.js with a dictionary per language in lang/.
import { build } from "esbuild";
import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSiteLanguages } from "./preview-lang.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2), index = args.indexOf("--outdir");
const outdir = path.resolve(index >= 0 ? args[index + 1] : path.join(root, "games/rarefriends-realm/.friendsdk/preview"));

await mkdir(path.join(outdir, "img"), { recursive: true });
await cp(path.join(root, "site/preview/index.html"), path.join(outdir, "index.html"));
await cp(path.join(root, "site/preview/guides.html"), path.join(outdir, "guides.html"));
await cp(path.join(root, "site/preview/lore.html"), path.join(outdir, "lore.html"));
for (const file of await readdir(path.join(root, "docs"))) if (file.endsWith(".png")) await cp(path.join(root, "docs", file), path.join(outdir, "img", file));
// The trailer and its poster.
await cp(path.join(root, "site/preview/media"), path.join(outdir, "media"), { recursive: true });
await cp(path.join(root, "site/preview/fellowships"), path.join(outdir, "fellowships"), { recursive: true });
await build({
  entryPoints: [path.join(root, "site/preview/music.ts")], outfile: path.join(outdir, "music.js"),
  bundle: true, format: "iife", platform: "browser", target: "es2022", minify: true, logLevel: "warning",
});
// The skill guides page: the game's guide data and pixel icons, rendered in the browser.
await build({
  entryPoints: [path.join(root, "site/preview/guides.ts")], outfile: path.join(outdir, "guides.js"),
  bundle: true, format: "iife", platform: "browser", target: "es2022", minify: true, logLevel: "warning",
});
// The language picker on every page, and each language's dictionary (scripts/preview-lang.mjs).
await build({
  entryPoints: [path.join(root, "site/preview/lang.ts")], outfile: path.join(outdir, "lang.js"),
  bundle: true, format: "iife", platform: "browser", target: "es2022", minify: true, logLevel: "warning",
});
await writeSiteLanguages(outdir);
console.log(`Built ${outdir}`);
