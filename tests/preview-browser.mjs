// Preview page check: builds /preview/ and confirms the floating button plays the main theme and a jukebox track
// at an audible level after a click (desktop) or tap (phone), and stops again. Then, in every language, that the picker
// switches the page and nothing on the main page, the lore or the skill guides is left in English (every video, every
// picture, every skill), except the names that stay as they are.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { guideStrings } from "../scripts/preview-lang.mjs";
import { TABLE_LANGUAGES } from "../games/rarefriends-realm/lang/table.ts";

const dir = path.join(await mkdtemp(path.join(tmpdir(), "realm-preview-")), "preview");
execFileSync("node", ["scripts/build-preview.mjs", "--outdir", dir], { stdio: "inherit" });
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".mp4": "video/mp4", ".jpg": "image/jpeg" };
const server = createServer(async (request, response) => {
  const file = path.join(dir, request.url.split("?")[0].replace(/^\/preview\/?/, "/").replace(/\/$/, "/index.html"));
  const body = await readFile(file).catch(() => null);
  if (!body) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }); response.end(body);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ args: ["--autoplay-policy=document-user-activation-required"] });
try {
  for (const [name, viewport, touch] of [["desktop", { width: 1280, height: 800 }, false], ["phone", { width: 390, height: 780 }, true]]) {
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, reducedMotion: "reduce" });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      const Native = window.AudioContext, probes = window.__probe = [];
      window.AudioContext = class extends Native {
        constructor(...args) { super(...args); const analyser = this.createAnalyser(); analyser.fftSize = 2048; probes.push({ context: this, analyser, sum: 0, count: 0 }); }
      };
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (target, ...rest) {
        const probe = target instanceof AudioDestinationNode && probes.find(item => item.context === target.context);
        if (probe) connect.call(this, probe.analyser);
        return connect.call(this, target, ...rest);
      };
      setInterval(() => { for (const probe of probes) { const data = new Float32Array(2048); probe.analyser.getFloatTimeDomainData(data);
        probe.sum += data.reduce((sum, value) => sum + value * value, 0) / data.length; probe.count++; } }, 40);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/preview/`);
    /** Average output level since the last call. */
    const level = () => page.evaluate(() => Math.max(0, ...window.__probe.map(probe => { const rms = Math.sqrt(probe.sum / Math.max(1, probe.count)); probe.sum = 0; probe.count = 0; return rms; })));
    const button = page.locator("#music");
    assert.equal(await button.getAttribute("aria-pressed"), "false");
    assert.equal(await page.evaluate(() => window.__probe.length), 0, "no audio before a gesture");
    await (touch ? button.tap() : button.click());
    await page.waitForTimeout(1000); await level(); await page.waitForTimeout(2500);
    assert.equal(await button.getAttribute("aria-pressed"), "true");
    assert.match(await button.innerText(), /RareFriends Realm/);
    const playing = await level();
    assert.ok(playing > 0.03, `${name}: main theme too quiet (${playing})`);
    // The jukebox has every track; switching plays the new one.
    assert.equal(await page.locator("#jukebox button").count(), 57);
    const forge = page.locator('#jukebox button[data-track="emberforge"]');
    await forge.scrollIntoViewIfNeeded(); await (touch ? forge.tap() : forge.click());
    await page.waitForTimeout(2500); await level(); await page.waitForTimeout(2000);
    assert.equal(await forge.getAttribute("aria-pressed"), "true");
    assert.match(await button.innerText(), /Anvil Song/);
    assert.ok(await level() > 0.02, `${name}: Anvil Song too quiet`);
    await (touch ? button.tap() : button.click());
    await page.waitForTimeout(1200); await level(); await page.waitForTimeout(800);
    assert.equal(await button.getAttribute("aria-pressed"), "false");
    assert.ok(await level() < 0.002, `${name}: music kept playing after stop`);
    // The trailer sits at the top: served, muted until asked, and "Watch with sound" unmutes it.
    const trailer = page.locator("#trailer-video");
    assert.ok((await trailer.boundingBox()).y < (await page.locator(".hero h1").boundingBox()).y, `${name}: the trailer is above the hero`);
    const size = await page.evaluate(async () => (await fetch("media/trailer.mp4")).headers.get("content-length") ?? (await (await fetch("media/trailer.mp4")).arrayBuffer()).byteLength);
    assert.ok(Number(size) > 1_000_000, `${name}: trailer served (${size} bytes)`);
    assert.equal(await trailer.evaluate(video => video.muted), true);
    await page.evaluate(() => window.scrollTo(0, 0));
    const sound = page.locator("#trailer-sound");
    await (touch ? sound.tap() : sound.click());
    assert.equal(await trailer.evaluate(video => video.muted), false, `${name}: unmuted`);
    assert.equal(await sound.isHidden(), true);
    // The video carousel: the newest update first, the reel of what's next under it, and "next" moving on to the trailer.
    assert.match(await trailer.getAttribute("src"), /update-languages\.mp4$/, `${name}: the newest update plays first`);
    assert.equal(await page.locator("#trailer-reel button").count(), 9, `${name}: the reel shows the other nine videos`);
    await page.locator("#trailer-next").click();
    assert.match(await trailer.getAttribute("src"), /update-webgl\.mp4$/, `${name}: next plays the update before it`);
    assert.equal(await trailer.evaluate(video => video.muted), false, `${name}: sound stays on from one video to the next`);
    // The picture galleries: every figure of the two grids in a filmstrip, the stage showing the one chosen, wrapping round.
    const galleries = page.locator(".gallery");
    assert.equal(await galleries.count(), 2, `${name}: two picture galleries`);
    const thumbs = galleries.first().locator(".strip button");
    assert.ok(await thumbs.count() >= 30, `${name}: the update gallery holds every picture (${await thumbs.count()})`);
    await galleries.first().scrollIntoViewIfNeeded();
    await galleries.first().locator(".arrow.prev").click();
    assert.equal(await thumbs.last().getAttribute("aria-current"), "true", `${name}: previous from the first wraps to the last`);
    await thumbs.nth(2).click();
    assert.equal(await galleries.first().locator(".stage img").getAttribute("src"), await thumbs.nth(2).locator("img").getAttribute("src"), `${name}: a thumbnail puts its picture on the stage`);
    // The skill guides page: a skill's unlocks, the recipe book and its search.
    await page.goto(`http://127.0.0.1:${server.address().port}/preview/guides.html#woodcutting`);
    await page.getByRole("heading", { name: "Woodcutting" }).waitFor();
    assert.ok(await page.locator("#guide tbody tr").count() >= 10, `${name}: woodcutting unlocks`);
    await page.getByRole("button", { name: /Recipe book/ }).click();
    await page.getByRole("heading", { name: "Recipe book" }).waitFor();
    assert.ok(await page.locator("#guide tbody tr").count() > 80, `${name}: the recipe book`);
    await page.getByRole("searchbox", { name: "Search recipes" }).fill("rosestone");
    const found = await page.locator("#guide tbody tr").count();
    assert.ok(found >= 1 && found <= 6, `${name}: recipe search (${found})`);
    if (name === "desktop") { await page.getByRole("button", { name: /Magic/ }).click(); await page.screenshot({ path: "./artifacts/site-guides.png" }); }
    assert.deepEqual(errors, []);
    await context.close();
  }
  // Every language: the picker switches the page, and nothing is left in English but the names that stay as they are
  // (the brand, and the game's own names where the game keeps them in English).
  const keep = new Set(["RareFriends Realm", "<i>⚔</i> RareFriends Realm", "⚔ RareFriends Realm", "RareFriends<span>Realm</span>", "$RAREFRIENDS", "RF", "@RareFriendsNFT #RareFriends #RareFriendsRealm", ...guideStrings()]);
  const base = `http://127.0.0.1:${server.address().port}/preview/`;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" }), page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base);
  await page.locator(".lang-pick select").selectOption("ja");
  await page.waitForFunction(() => window.realmLanguage() === "ja");
  assert.equal(await page.locator('.bar nav a[href="#new"]').innerText(), "新着情報", "the picker switches the page");
  assert.equal(await page.evaluate(() => document.documentElement.lang), "ja");
  await page.locator(".lang-pick select").selectOption("en");
  await page.waitForFunction(() => window.realmLanguage() === "en");
  assert.equal(await page.locator('.bar nav a[href="#new"]').innerText(), "What's new", "and back to English");
  for (const lang of TABLE_LANGUAGES) {
    const left = new Set(), look = async () => { for (const text of await page.evaluate(() => window.realmUntranslated())) if (!keep.has(text)) left.add(text); };
    await page.goto(`${base}?lang=${lang}`); await page.waitForFunction(lang => window.realmLanguage() === lang, lang); await look();
    for (let i = 0; i < 9; i++) { await page.locator("#trailer-next").click(); await look(); }
    for (const gallery of await page.locator(".gallery").all()) for (const thumb of await gallery.locator(".strip button").all()) { await thumb.click(); await look(); }
    await page.goto(`${base}lore.html?lang=${lang}`); await page.waitForFunction(lang => window.realmLanguage() === lang, lang); await look();
    await page.goto(`${base}guides.html?lang=${lang}`); await page.waitForFunction(lang => window.realmLanguage() === lang, lang);
    for (const button of await page.locator("#picker button").all()) { await button.click(); await look(); }
    assert.deepEqual([...left], [], `${lang}: nothing left in English`);
  }
  assert.deepEqual(errors, []);
  await context.close();
} finally { await browser.close(); server.close(); }
console.log("PASS preview page: the video carousel at the top and the picture galleries; main theme and jukebox; skill guides and recipe book; every language, all of it");
