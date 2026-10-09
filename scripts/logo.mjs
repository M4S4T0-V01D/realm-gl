// Writes the Realm's logo (games/rarefriends-realm/logo.ts) out for the preview site: SVGs for the header and the
// favicon, and PNGs for sharing (the emblem at 512 px, both lockups on transparent ground, and a 1200 × 630 card).
//   node scripts/logo.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { logoPixels, logoSvg } from "../games/rarefriends-realm/logo.ts";

const out = new URL("../site/preview/media/logo/", import.meta.url);
await mkdir(out, { recursive: true });
const files = { "realm-emblem.svg": logoSvg("emblem"), "realm-logo.svg": logoSvg("horizontal"), "realm-logo-stacked.svg": logoSvg("stacked") };
for (const [name, svg] of Object.entries(files)) await writeFile(new URL(name, out), svg + "\n");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const png = async (kind, scale, name) => {
    const { width, height } = logoPixels(kind);
    await page.setViewportSize({ width: width * scale, height: height * scale });
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${logoSvg(kind, scale)}`);
    await page.screenshot({ path: new URL(name, out).pathname, omitBackground: true });
  };
  await png("emblem", 16, "realm-emblem-512.png");
  await png("emblem", 6, "realm-emblem-192.png");
  await png("horizontal", 8, "realm-logo.png");
  await png("stacked", 8, "realm-logo-stacked.png");
  // A card for links shared on social sites: the stacked logo on the site's night sky.
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<style>html,body{margin:0;width:1200px;height:630px;display:grid;place-items:center;background:radial-gradient(circle at 70% 20%,#30395e,#141729 70%)}</style>${logoSvg("stacked", 7)}`);
  await page.screenshot({ path: new URL("realm-card.png", out).pathname });
} finally { await browser.close(); }
console.log("logo written to site/preview/media/logo/");
