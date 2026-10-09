// Cloud saves in the real game (built, hosted, played in Chromium), against the real Worker (run here on SQLite):
// signing in from the game's own button (a real signature, a message, no transaction), a new character's saves going
// up, a second device picking the adventure up, two devices playing at once (asked, never overwritten), a legacy
// browser save imported once, the cloud going down and coming back, and the cloud text in another language.
// Screenshots go to artifacts/cloud-*.png.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";
import { decodeFunctionData, encodeEventTopics, encodeFunctionResult, hexToString, padHex, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createGameServer } from "@rarefriends/friendsdk/serve";
import { GENERATION_SPRITE_MANIFEST } from "@rarefriends/friendsdk/sprites";
import { createArtworkFixture, installFixture } from "../node_modules/@rarefriends/friendsdk/scripts/browser-fixture.mjs";
import { createApp, chainFor } from "../cloud/src/worker.ts";
import { CLOUD_URL } from "../host/cloud.ts";

const COLLECTION = "0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D";
const ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function balanceOf(address account) view returns (uint256)", "function ownerOf(uint256 tokenId) view returns (address)",
  "function generation(uint256 tokenId) view returns (uint8)", "function tokenBoundAccount(uint256 tokenId) view returns (address)",
]);
// The test player: a real key, so the sign-in is a real signature the Worker checks.
const player = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const SAVE_KEY = `rarefriends-realm:save:v1:${player.address.toLowerCase()}:7730`;

/** The save service: a fresh database each time it's made. */
function service(origin) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../cloud/schema.sql", import.meta.url), "utf8"));
  const statement = (sql, values = []) => ({ bind: (...next) => statement(sql, next), first: async () => sqlite.prepare(sql).get(...values) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...values) }), run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }), sql, values });
  const db = { prepare: sql => statement(sql), async batch(list) { sqlite.exec("BEGIN"); try { const out = list.map(s => ({ meta: { changes: Number(sqlite.prepare(s.sql).run(...s.values).changes) } })); sqlite.exec("COMMIT"); return out; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
  const app = createApp({ db, origins: [origin], chainId: 4663, chain: { ownerOf: async friend => friend === 7730 ? player.address : null, verify: chainFor({ RPC_URL: "http://127.0.0.1:9", COLLECTION }).verify } });
  return { app, row: () => sqlite.prepare("SELECT version, save, imported_at FROM characters WHERE friend_id = 7730").get() ?? null, sqlite };
}

const outdir = await mkdtemp(join(tmpdir(), "realm-cloud-"));
await mkdir("./artifacts", { recursive: true });
let browser, server;
const errors = [];
try {
  execFileSync("node", ["scripts/build.mjs", "--outdir", join(outdir, "dist")], { stdio: "inherit" });
  server = createGameServer(join(outdir, "dist"));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cloud = service(origin), cloudDown = false;
  const artworkCall = await createArtworkFixture();
  browser = await chromium.launch({ headless: true });

  /** Wait until the cloud's version has stopped changing (a logout's last upload has landed). */
  const settled = async () => { let last = -1, same = 0; for (let i = 0; i < 120 && same < 12; i++) { const v = cloud.row()?.version ?? 0; same = v === last ? same + 1 : 0; last = v; await new Promise(r => setTimeout(r, 500)); } return last; };
  /** A device: its own browser storage, the wallet (signing as the test player), the chain and the save service. */
  async function device(name, seed = null) {
    const context = await browser.newContext({ viewport: { width: 1320, height: 900 } });
    if (seed) await context.addInitScript(([key, value]) => { if (window === window.top && !localStorage.getItem("seeded")) { localStorage.setItem(key, value); localStorage.setItem("seeded", "1"); } }, [SAVE_KEY, seed]);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
    const fixture = await installFixture(page, origin, { artworkCall });
    page.on("request", request => { if (process.env.DEBUG_RPC && request.url().includes("robinhood")) console.log("RPC", request.postData()?.slice(0, 300)); });
    await page.exposeFunction("__realmSign", hex => player.signMessage({ message: hexToString(hex) }));
    await page.addInitScript(me => {
      if (window !== window.top) return;
      const wallet = window.ethereum, original = wallet.request.bind(wallet);
      wallet.request = async ({ method, params }) => {
        if (method === "personal_sign") { window.__friendWalletTest.state.requests.push(method); return window.__realmSign(params[0]); }
        const result = await original({ method, params });
        return (method === "eth_accounts" || method === "eth_requestAccounts") && Array.isArray(result) && result.length ? [me] : result;
      };
    }, player.address);
    // The chain: the test player owns Friend #7730.
    await page.route("https://rpc.mainnet.chain.robinhood.com/**", async route => {
      const request = route.request().method() === "POST" ? route.request().postDataJSON() : null;
      if (!request || Array.isArray(request)) return route.fallback();
      const reply = result => route.fulfill({ json: { jsonrpc: "2.0", id: request.id, result }, headers: { "access-control-allow-origin": "*" } });
      const me = padHex(player.address.toLowerCase(), { size: 32 }), topics = request.params?.[0]?.topics ?? [];
      // Transfers out of the wallet: none. Transfers in: Friend #7730.
      if (request.method === "eth_getLogs" && topics[1]?.toLowerCase() === me) return reply([]);
      if (request.method === "eth_getLogs" && topics[2]?.toLowerCase() === me)
        return reply([{ address: COLLECTION, blockNumber: `0x${(GENERATION_SPRITE_MANIFEST.transferStartBlock + 1n).toString(16)}`, blockHash: padHex("0x10", { size: 32 }), data: "0x", logIndex: "0x0", transactionHash: padHex("0x77", { size: 32 }), transactionIndex: "0x0", removed: false,
          topics: encodeEventTopics({ abi: ABI, eventName: "Transfer", args: { from: "0x0000000000000000000000000000000000000000", to: player.address, tokenId: 7730n } }) }]);
      if (request.method === "eth_call" && request.params[0].to.toLowerCase() === COLLECTION.toLowerCase()) {
        const { functionName, args } = decodeFunctionData({ abi: ABI, data: request.params[0].data });
        const value = functionName === "balanceOf" ? 1n : functionName === "ownerOf" ? player.address : functionName === "generation" ? 1 : functionName === "tokenBoundAccount" ? "0x3333333333333333333333333333333333333333" : undefined;
        if (value !== undefined && (functionName === "balanceOf" || args[0] === 7730n)) return reply(encodeFunctionResult({ abi: ABI, functionName, result: value }));
      }
      return route.fallback();
    });
    // The save service, at its real address.
    await page.route(`${CLOUD_URL}/**`, async route => {
      if (cloudDown) return route.abort("internetdisconnected");
      const request = route.request(), method = request.method();
      const response = await cloud.app.fetch(new Request(request.url(), { method, headers: await request.allHeaders(), body: method === "GET" || method === "HEAD" ? undefined : request.postDataBuffer() }));
      const body = Buffer.from(await response.arrayBuffer());
      if (process.env.DEBUG_CLOUD) console.log("CLOUD", method, new URL(request.url()).pathname, response.status, body.toString().slice(0, 160));
      if (process.env.DEBUG_CLOUD && method === "PUT" && response.status !== 200) { const { gunzipSync } = await import("node:zlib"); const sent = JSON.parse(gunzipSync(request.postDataBuffer()).toString()); console.log("SENT xp", JSON.stringify(sent.save?.xp), "keys", Object.keys(sent)); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
    });
    const game = page.frameLocator("iframe");
    const frame = () => page.frames().find(entry => entry !== page.mainFrame() && entry.url() !== "about:blank");
    const state = (fn, arg) => frame().evaluate(fn, arg);
    const until = async (fn, timeout = 30_000, what = String(fn)) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await page.waitForTimeout(200); } assert.fail(`${name}: timed out waiting for ${what}`); };
    const enter = async () => {
      await page.goto(origin);
      await page.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).click();
      await page.getByRole("button", { name: /^Friend #7730\b/ }).click({ timeout: 15_000 }).catch(async error => { console.log("fixture errors", fixture.errors, await page.locator("body").innerText()); throw error; });
      await game.locator('.realm-game[data-phase="title"]').waitFor();
    };
    const cloudIs = status => game.locator(`.realm-cloud[data-cloud="${status}"]`).first().waitFor({ timeout: 30_000 });
    /** Progress that counts as a milestone (a level), so the save goes up within seconds. */
    const train = xp => state(xp => { const g = window.__realm.game(); g.player.xp.woodcutting += xp; window.__realm.refresh(); }, xp);
    const openSettings = async () => { await game.locator('[aria-label="Settings"]').first().click(); await game.getByRole("button", { name: "⏻ Save and log out" }).waitFor(); };
    const shot = file => page.locator(".rf-game-frame").screenshot({ path: `./artifacts/${file}.png` });
    return { context, page, game, state, until, enter, cloudIs, train, shot, openSettings, signs: () => page.evaluate(() => window.__friendWalletTest.state.requests.filter(method => method === "personal_sign").length) };
  }

  // ---------- A new character: verify once, then saves go up by themselves ----------
  const a = await device("first device");
  await a.enter();
  await a.cloudIs("unverified");
  assert.equal(await a.signs(), 0, "nothing is signed until the player asks");
  await a.shot("cloud-title-unverified");
  await a.game.getByRole("button", { name: "☁ Verify wallet" }).click();
  await a.cloudIs("saved");
  assert.equal(await a.signs(), 1, "one signature: the sign-in message");
  await a.game.getByRole("button", { name: "Begin your adventure" }).click();
  await a.game.getByLabel("Name").fill("Cloudy");
  await a.game.getByRole("button", { name: "Name my Friend" }).click();
  await a.game.locator('.realm-game[data-phase="playing"]').waitFor();
  await a.train(60_000);
  await a.until(() => { const row = cloud.row(); return row && JSON.parse(row.save).xp.woodcutting >= 60_000; }, 40_000, "the first cloud save");
  assert.equal(JSON.parse(cloud.row().save).name, "Cloudy");
  await a.page.waitForTimeout(1500); await a.shot("cloud-playing");
  // The first device logs out (its last save goes up) and waits on the title screen.
  await a.openSettings();
  await a.game.getByRole("button", { name: "⏻ Save and log out" }).click();
  await a.game.locator('.realm-game[data-phase="title"]').waitFor();
  const loggedOut = await settled();

  // ---------- Another device: the same adventure, after one sign-in there ----------
  const b = await device("second device");
  await b.enter();
  await b.cloudIs("unverified");
  await b.game.getByRole("button", { name: "☁ Verify wallet" }).click();
  await b.cloudIs("saved");
  await b.until(async () => (await b.state(() => window.__realm.game().player.name)) === "Cloudy", 20_000, "the cloud's adventure on the second device");
  await b.game.getByRole("button", { name: "Continue your adventure" }).waitFor();
  await b.shot("cloud-title-second-device");

  // ---------- Both play: the second saves first; the first, still on its older copy, is asked, not overwritten ----------
  await b.game.getByRole("button", { name: "Continue your adventure" }).click();
  await b.game.locator('.realm-game[data-phase="playing"]').waitFor();
  await b.train(200_000);
  await b.until(() => cloud.row().version > loggedOut && JSON.parse(cloud.row().save).xp.woodcutting >= 260_000, 40_000, "the second device's save");
  await b.openSettings();
  await b.game.getByRole("button", { name: "⏻ Save and log out" }).click();
  await b.game.locator('.realm-game[data-phase="title"]').waitFor();
  const afterB = await settled();
  await a.game.getByRole("button", { name: "Continue your adventure" }).click();
  await a.game.locator('.realm-game[data-phase="playing"]').waitFor();
  await a.train(30_000);
  await a.game.getByRole("dialog", { name: "Two versions of this adventure" }).waitFor({ timeout: 40_000 });
  assert.equal(cloud.row().version, afterB, "the first device didn't overwrite the newer save");
  await a.shot("cloud-conflict");
  await a.game.getByRole("button", { name: "Keep this browser's" }).click();
  await a.until(() => cloud.row().version > afterB, 20_000, "the takeover");
  assert.ok(JSON.parse(cloud.row().save).xp.woodcutting < 260_000, "this browser's adventure was kept");
  await a.cloudIs("saved");

  // ---------- The cloud goes down and comes back ----------
  cloudDown = true;
  await a.train(500_000);
  await a.game.locator('.realm-cloud-chip[data-cloud="offline"]').waitFor({ timeout: 40_000 });
  assert.ok(JSON.parse(await a.page.evaluate(key => localStorage.getItem(key), SAVE_KEY)).xp.woodcutting >= 500_000, "the browser save kept going");
  await a.shot("cloud-offline");
  cloudDown = false;
  await a.game.locator(".realm-cloud-chip").click();
  await a.game.getByRole("button", { name: "Try again" }).click();
  await a.until(() => JSON.parse(cloud.row().save).xp.woodcutting >= 500_000, 40_000, "the upload after coming back");
  await a.cloudIs("saved");
  await a.shot("cloud-settings");

  // ---------- In another language ----------
  await a.state(() => window.__realm.language("ja"));
  await a.until(async () => /クラウド/.test(await a.game.locator(".realm-cloud-line").first().innerText()), 10_000, "the cloud line in Japanese");
  await a.shot("cloud-settings-ja");
  await a.state(() => window.__realm.language("en"));

  // ---------- A legacy browser save, from before cloud saves: imported once ----------
  const legacy = await a.page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
  cloud = service(origin); // a cloud that has never seen this character
  const c = await device("old browser", legacy);
  await c.enter();
  await c.game.getByRole("button", { name: "Continue your adventure" }).waitFor();
  await c.cloudIs("unverified");
  await c.game.getByRole("button", { name: "☁ Verify wallet" }).click();
  await c.game.getByRole("dialog", { name: "Bring your adventure to the cloud" }).waitFor();
  await c.shot("cloud-import");
  assert.equal(cloud.row(), null, "nothing is uploaded before the player chooses");
  await c.game.getByRole("dialog", { name: "Bring your adventure to the cloud" }).getByRole("button", { name: "☁ Import to the cloud" }).click();
  await c.until(() => cloud.row() !== null, 20_000, "the import");
  assert.equal(cloud.row().version, 1); assert.notEqual(cloud.row().imported_at, null);
  assert.equal(JSON.parse(cloud.row().save).name, "Cloudy");
  await c.cloudIs("saved");
  assert.equal(await c.page.evaluate(key => localStorage.getItem(`${key}:backup`), SAVE_KEY), null, "the backup is cleared once the cloud has it");

  assert.deepEqual(errors, [], "browser errors");
  console.log("PASS cloud saves: sign-in from the game, new character, second device, conflict asked and taken over, offline and back, Japanese, legacy import");
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await rm(outdir, { recursive: true, force: true });
}
