// The old WebGL address forwards to the one Realm in WebGL mode (redirect/, published at /realm-gl/): the game with
// ?renderer=webgl and every other parameter (a fellowship invitation) and the hash kept; the preview pages to the
// Realm's preview pages; anything else to the game.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const root = new URL("../redirect/", import.meta.url).pathname;
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://x").pathname;
  if (!path.startsWith("/realm-gl/")) { response.writeHead(404).end(); return; }
  let file = path.slice("/realm-gl/".length) || "index.html";
  if (file.endsWith("/")) file += "index.html";
  try { const body = await readFile(join(root, file)); response.writeHead(200, { "content-type": extname(file) === ".js" ? "text/javascript" : "text/html" }).end(body); }
  catch { response.writeHead(404, { "content-type": "text/html" }).end(await readFile(join(root, "404.html"))); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const forwarded = async path => {
    const page = await browser.newPage();
    let landed = null;
    await page.route("https://m4s4t0-v01d.github.io/**", route => { landed = route.request().url(); return route.fulfill({ body: "<p>the Realm</p>", contentType: "text/html" }); });
    await page.goto(`${origin}${path}`);
    for (let i = 0; i < 50 && !landed; i++) await page.waitForTimeout(100);
    // (The hash never travels in the request; the page's own address has it.)
    await page.waitForURL(/^https:\/\/m4s4t0-v01d\.github\.io\//, { timeout: 5000 }).catch(() => undefined);
    const url = landed ? page.url() : null;
    await page.close();
    return url;
  };
  assert.equal(await forwarded("/realm-gl/"), "https://m4s4t0-v01d.github.io/rarefriends-realm/?renderer=webgl", "the game, in WebGL");
  assert.equal(await forwarded("/realm-gl/?join=AbCdEf12345#chat"), "https://m4s4t0-v01d.github.io/rarefriends-realm/?join=AbCdEf12345&renderer=webgl#chat", "an invitation and the hash kept");
  assert.equal(await forwarded("/realm-gl/?renderer=normal"), "https://m4s4t0-v01d.github.io/rarefriends-realm/?renderer=webgl", "the old WebGL address always means WebGL");
  assert.equal(await forwarded("/realm-gl/preview/"), "https://m4s4t0-v01d.github.io/rarefriends-realm/preview/", "the preview page");
  assert.equal(await forwarded("/realm-gl/preview/guides.html"), "https://m4s4t0-v01d.github.io/rarefriends-realm/preview/guides.html", "a preview subpage (through the 404 page)");
  assert.equal(await forwarded("/realm-gl/something-old"), "https://m4s4t0-v01d.github.io/rarefriends-realm/?renderer=webgl", "anything else: the game");
  console.log("PASS forwarding: the old WebGL address opens the one Realm in WebGL (invitations kept), and its preview pages the Realm's");
} finally { await browser.close(); server.close(); }
