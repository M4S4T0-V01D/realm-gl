// Cloud saves (cloud/src/worker.ts): signing in with a wallet, one character per wallet and Friend, versions that
// never go backwards, ownership on chain, imports that can't be applied twice, history for recovery, and the save
// checks. The Worker runs here against SQLite (the same SQL D1 runs) with real wallet signatures.
import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { createApp, chainFor, LIMITS } from "../cloud/src/worker.ts";

const ORIGIN = "https://m4s4t0-v01d.github.io";
const alice = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const bob = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

/** D1's API over SQLite, enough for the Worker. */
function d1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../cloud/schema.sql", import.meta.url), "utf8"));
  const statement = (sql, values = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
    sql, values,
  });
  return {
    sqlite,
    prepare: sql => statement(sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const out = statements.map(s => ({ meta: { changes: Number(sqlite.prepare(s.sql).run(...s.values).changes) } })); sqlite.exec("COMMIT"); return out; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
}
function world() {
  const db = d1(), owners = new Map([[7730, alice.address], [3412, bob.address]]);
  let clock = Date.parse("2026-10-09T12:00:00Z");
  const real = chainFor({ RPC_URL: "http://127.0.0.1:9", COLLECTION: "0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D" });
  const app = createApp({ db, origins: [ORIGIN], chainId: 4663, clock: () => clock, chain: { ownerOf: async friend => owners.get(friend) ?? null, verify: real.verify } });
  const call = async (method, path, { body, token, origin = ORIGIN, gzip = false } = {}) => {
    const headers = { ...(origin ? { origin } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) };
    let payload;
    if (body !== undefined) { const text = JSON.stringify(body); payload = gzip ? gzipSync(text) : text; headers["content-type"] = gzip ? "application/x-realm-save" : "application/json"; }
    const response = await app.fetch(new Request(`https://saves.example${path}`, { method, headers, body: payload }));
    return { status: response.status, body: await response.json().catch(() => null), headers: response.headers };
  };
  const signIn = async account => {
    const challenge = await call("POST", "/v1/auth/challenge", { body: { address: account.address } });
    assert.equal(challenge.status, 200);
    const signature = await account.signMessage({ message: challenge.body.message });
    const verified = await call("POST", "/v1/auth/verify", { body: { message: challenge.body.message, signature } });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    return verified.body.token;
  };
  const save = (friend, xp = 1000, extra = {}) => ({ v: 1, friendId: friend, xp: { attack: xp, hitpoints: 1154 }, inventory: [null, { id: "logs", n: 1 }], bank: [], name: "Tester", ...extra });
  const put = (token, friend, baseVersion, data, reason = "auto", importHash) => call("PUT", `/v1/characters/${friend}`, { token, gzip: true, body: { baseVersion, save: data, reason, ...(importHash ? { importHash } : {}) } });
  return { db, owners, call, signIn, save, put, advance: ms => { clock += ms; } };
}

test("signing in: a signature over the issued challenge makes a session; replays, other signers and edits don't", async () => {
  const w = world();
  // Only the Realm's own page may ask.
  assert.equal((await w.call("POST", "/v1/auth/challenge", { body: { address: alice.address }, origin: "https://evil.example" })).status, 403);
  const challenge = await w.call("POST", "/v1/auth/challenge", { body: { address: alice.address } });
  assert.match(challenge.body.message, /^m4s4t0-v01d\.github\.io wants you to sign in with your Ethereum account:\n0x/);
  assert.match(challenge.body.message, /It is not a transaction and costs nothing/);
  assert.match(challenge.body.message, /Chain ID: 4663/);
  // Someone else's signature over Alice's challenge fails.
  const wrong = await bob.signMessage({ message: challenge.body.message });
  assert.equal((await w.call("POST", "/v1/auth/verify", { body: { message: challenge.body.message, signature: wrong } })).status, 401);
  // That challenge is now spent, even though the signature was wrong.
  const fresh = await w.call("POST", "/v1/auth/challenge", { body: { address: alice.address } });
  const signature = await alice.signMessage({ message: fresh.body.message });
  // An edited message (even with a matching signature over the edit) isn't the one issued.
  const edited = fresh.body.message.replace("costs nothing", "costs nothing!"), editedSig = await alice.signMessage({ message: edited });
  assert.equal((await w.call("POST", "/v1/auth/verify", { body: { message: edited, signature: editedSig } })).status, 401);
  const ok = await w.call("POST", "/v1/auth/verify", { body: { message: fresh.body.message, signature } });
  assert.equal(ok.status, 200); assert.equal(ok.body.address, alice.address); assert.match(ok.body.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal((await w.call("POST", "/v1/auth/verify", { body: { message: fresh.body.message, signature } })).status, 401, "a challenge works once");
  // Expired challenges fail.
  const late = await w.call("POST", "/v1/auth/challenge", { body: { address: alice.address } });
  w.advance(LIMITS.challengeMs + 1000);
  assert.equal((await w.call("POST", "/v1/auth/verify", { body: { message: late.body.message, signature: await alice.signMessage({ message: late.body.message }) } })).status, 401);
  // Only the token's hash is stored.
  assert.equal(w.db.sqlite.prepare("SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?").get(ok.body.token).n, 0);
  // No token, a made-up token, or a logged-out token: no saves.
  assert.equal((await w.call("GET", "/v1/characters/7730")).status, 401);
  assert.equal((await w.call("GET", "/v1/characters/7730", { token: "x".repeat(43) })).status, 401);
  assert.equal((await w.call("POST", "/v1/auth/logout", { token: ok.body.token })).status, 200);
  assert.equal((await w.call("GET", "/v1/characters/7730", { token: ok.body.token })).status, 401);
});

test("a character saves, loads, and an older save can never overwrite a newer one", async () => {
  const w = world(), token = await w.signIn(alice);
  assert.equal((await w.call("GET", "/v1/characters/7730", { token })).status, 404);
  const first = await w.put(token, 7730, 0, w.save(7730, 1000));
  assert.equal(first.status, 200); assert.equal(first.body.version, 1);
  const loaded = await w.call("GET", "/v1/characters/7730", { token });
  assert.equal(loaded.body.version, 1); assert.equal(loaded.body.save.xp.attack, 1000); assert.equal(loaded.body.owned, true);
  w.advance(60_000);
  assert.equal((await w.put(token, 7730, 1, w.save(7730, 5000))).body.version, 2);
  // A second device still on version 1 is told about the newer save instead of overwriting it.
  w.advance(60_000);
  const stale = await w.put(token, 7730, 1, w.save(7730, 1200));
  assert.equal(stale.status, 409); assert.equal(stale.body.version, 2);
  assert.equal((await w.call("GET", "/v1/characters/7730", { token })).body.save.xp.attack, 5000);
  // Two first saves racing for the same new character: one wins, the other gets a conflict.
  w.owners.set(9001, alice.address);
  const [a, b] = await Promise.all([w.put(token, 9001, 0, w.save(9001)), w.put(token, 9001, 0, w.save(9001))]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], "racing first saves: one wins, one is told");
  // Saving too often is slowed down (milestone saves aren't).
  assert.equal((await w.put(token, 7730, 2, w.save(7730, 5100))).status, 200);
  w.advance(1000);
  assert.equal((await w.put(token, 7730, 3, w.save(7730, 5200))).status, 429);
  assert.equal((await w.put(token, 7730, 3, w.save(7730, 5200), "event")).status, 200);
});

test("ownership: only the Friend's owner can save it; a Friend's new owner starts their own character; nothing transfers silently", async () => {
  const w = world(), aliceToken = await w.signIn(alice), bobToken = await w.signIn(bob);
  assert.equal((await w.put(aliceToken, 7730, 0, w.save(7730, 4000))).status, 200);
  // Bob can't write Alice's Friend, and can't see Alice's character (his own namespace is empty).
  assert.equal((await w.put(bobToken, 7730, 0, w.save(7730))).status, 403);
  assert.equal((await w.call("GET", "/v1/characters/7730", { token: bobToken })).status, 404);
  // The Friend moves to Bob (cache expires): Bob starts fresh on it; Alice keeps hers, readable and exportable, but can't write.
  w.owners.set(7730, bob.address); w.advance(LIMITS.ownerCacheMs + 1000);
  const bobs = await w.put(bobToken, 7730, 0, w.save(7730, 100));
  assert.equal(bobs.status, 200); assert.equal(bobs.body.version, 1);
  assert.equal((await w.put(aliceToken, 7730, 1, w.save(7730, 4100))).status, 403);
  const hers = await w.call("GET", "/v1/characters/7730", { token: aliceToken });
  assert.equal(hers.status, 200); assert.equal(hers.body.save.xp.attack, 4000); assert.equal(hers.body.owned, false);
  // And if the Friend comes back to Alice, she carries on where she was.
  w.owners.set(7730, alice.address); w.advance(LIMITS.ownerCacheMs + 1000);
  assert.equal((await w.put(aliceToken, 7730, 1, w.save(7730, 4100))).status, 200);
  // When the chain can't be read and nothing is cached, writes wait (the client keeps the save locally).
  w.owners.delete(3412); w.advance(LIMITS.ownerCacheMs + 1000);
  assert.equal((await w.put(bobToken, 3412, 0, w.save(3412))).status, 503);
});

test("imports: a legacy save goes up once; the same import again changes nothing", async () => {
  const w = world(), token = await w.signIn(alice), legacy = w.save(7730, 50_000_000);
  const hash = createHash("sha256").update(JSON.stringify(legacy)).digest("hex");
  // An import needs its hash; it may jump a lot of XP at once (it was earned before cloud saves existed).
  assert.equal((await w.put(token, 7730, 0, legacy, "import")).status, 400);
  const first = await w.put(token, 7730, 0, legacy, "import", hash);
  assert.equal(first.status, 200); assert.equal(first.body.version, 1);
  const again = await w.put(token, 7730, 1, legacy, "import", hash);
  assert.equal(again.status, 200); assert.equal(again.body.duplicate, true); assert.equal(again.body.version, 1);
  assert.notEqual((await w.call("GET", "/v1/characters/7730", { token })).body.importedAt, null);
  // An import onto an existing character must name its version (the player chose to replace it); a stale one conflicts.
  w.advance(60_000);
  const other = w.save(7730, 60_000_000), otherHash = createHash("sha256").update(JSON.stringify(other)).digest("hex");
  assert.equal((await w.put(token, 7730, 0, other, "import", otherHash)).status, 409);
  assert.equal((await w.put(token, 7730, 1, other, "import", otherHash)).body.version, 2);
  // A failed import isn't remembered as done.
  const third = w.save(7730, 70_000_000), thirdHash = createHash("sha256").update(JSON.stringify(third)).digest("hex");
  assert.equal((await w.put(token, 7730, 1, third, "import", thirdHash)).status, 409);
  assert.equal(w.db.sqlite.prepare("SELECT COUNT(*) AS n FROM imports WHERE hash = ?").get(thirdHash).n, 0);
});

test("save checks: the wrong Friend, wrong shape, oversized or impossible saves are refused", async () => {
  const w = world(), token = await w.signIn(alice);
  assert.equal((await w.put(token, 7730, 0, w.save(3412))).status, 422, "another Friend's save");
  assert.equal((await w.put(token, 7730, 0, { ...w.save(7730), v: 2 })).status, 422, "unknown version");
  assert.equal((await w.put(token, 7730, 0, w.save(7730, 300_000_000))).status, 422, "impossible XP");
  assert.equal((await w.put(token, 7730, 0, w.save(7730, 10, { inventory: new Array(65).fill(null) }))).status, 422, "impossible inventory");
  assert.equal((await w.put(token, 7730, 0, w.save(7730, 10, { name: "x".repeat(5000) }))).status, 422, "giant text");
  assert.equal((await w.put(token, 7730, 0, w.save(7730, 10, { junk: "y".repeat(3000).split("").map(() => "z".repeat(150)) }))).status, 413, "oversized");
  assert.equal((await w.put(token, 7730, 0, w.save(7730, 10, { constructor: 1 }))).status, 422, "prototype-ish keys");
  // Progress has to fit the time since the last save.
  assert.equal((await w.put(token, 7730, 0, w.save(7730, 1000))).status, 200);
  w.advance(60_000);
  assert.equal((await w.put(token, 7730, 1, w.save(7730, 1000 + LIMITS.xpSlack + 60 * LIMITS.xpPerSecond + 50_000))).status, 422);
  assert.equal((await w.put(token, 7730, 1, w.save(7730, 1000 + 150_000))).status, 200);
});

test("history: earlier versions are kept for recovery and can be brought back", async () => {
  const w = world(), token = await w.signIn(alice);
  let version = 0;
  for (const xp of [1000, 2000, 3000, 4000]) { const r = await w.put(token, 7730, version, w.save(7730, xp)); assert.equal(r.status, 200); version = r.body.version; w.advance(LIMITS.historyGapMs + 1000); }
  const history = await w.call("GET", "/v1/characters/7730/history", { token });
  assert.deepEqual(history.body.versions.map(v => v.version), [3, 2, 1]);
  const restored = await w.call("POST", "/v1/characters/7730/restore", { token, body: { version: 2 } });
  assert.equal(restored.body.version, 5);
  assert.equal((await w.call("GET", "/v1/characters/7730", { token })).body.save.xp.attack, 2000);
  // The version that was replaced by the restore is kept too.
  assert.ok((await w.call("GET", "/v1/characters/7730/history", { token })).body.versions.some(v => v.version === 4));
});

test("CORS: the Realm's page gets answers; other sites are refused", async () => {
  const w = world();
  const ok = await w.call("GET", "/v1/health");
  assert.equal(ok.headers.get("access-control-allow-origin"), ORIGIN);
  const evil = await w.call("GET", "/v1/health", { origin: "https://evil.example" });
  assert.equal(evil.status, 403); assert.equal(evil.headers.get("access-control-allow-origin"), null);
});
