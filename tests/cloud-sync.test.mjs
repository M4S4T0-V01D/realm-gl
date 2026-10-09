// The host's side of cloud saves (host/cloud.ts) against the real Worker: which save the game starts with, the
// one-time sign-in, uploads that never go backwards, conflicts asked rather than guessed, legacy imports, failures
// that keep the browser save and recover, expired sessions, and each wallet keeping its own sign-in.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { hexToString } from "viem";
import { createApp, chainFor } from "../cloud/src/worker.ts";
import { CloudSync, hashSave } from "../host/cloud.ts";

const ORIGIN = "https://m4s4t0-v01d.github.io", BASE = "https://saves.test";
const alice = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const bob = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

// The browser's storage, shared by the "devices" made from one store (each test makes its own).
function storage() { const map = new Map(); return { getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), map }; }
function server() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../cloud/schema.sql", import.meta.url), "utf8"));
  const statement = (sql, values = []) => ({ bind: (...next) => statement(sql, next), first: async () => sqlite.prepare(sql).get(...values) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...values) }), run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }), sql, values });
  const db = { prepare: sql => statement(sql), async batch(list) { sqlite.exec("BEGIN"); try { const out = list.map(s => ({ meta: { changes: Number(sqlite.prepare(s.sql).run(...s.values).changes) } })); sqlite.exec("COMMIT"); return out; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
  let clock = Date.parse("2026-10-09T12:00:00Z"), down = false;
  const owners = new Map([[7730, alice.address]]);
  const app = createApp({ db, origins: [ORIGIN], chainId: 4663, clock: () => clock, chain: { ownerOf: async f => owners.get(f) ?? null, verify: chainFor({ RPC_URL: "http://127.0.0.1:9", COLLECTION: "0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D" }).verify } });
  // What a browser's fetch to the Worker does (with the page's Origin); "down" makes the service unreachable.
  const http = async (url, init = {}) => {
    if (down) throw new TypeError("Failed to fetch");
    const response = await app.fetch(new Request(url, { ...init, headers: { ...init.headers, origin: ORIGIN } }));
    return response;
  };
  return { sqlite, owners, http, advance: ms => { clock += ms; }, setDown: value => { down = value; }, row: (friend = 7730, address = alice.address) => sqlite.prepare("SELECT version, save, imported_at FROM characters WHERE address = ? AND friend_id = ?").get(address, friend) };
}
/** One device: its storage, the game's save in it, what it was told, and a wallet that signs as `account`. */
function device(srv, store, account = alice, friend = "7730") {
  const key = `rarefriends-realm:save:v1:${account.address.toLowerCase()}:${friend}`;
  const seen = { delivered: [], states: [], reloads: 0 };
  globalThis.localStorage = store;
  const sync = new CloudSync(account.address, friend, {
    readSave: () => { globalThis.localStorage = store; const raw = store.getItem(key); return raw ? JSON.parse(raw) : null; },
    writeSave: save => store.setItem(key, JSON.stringify(save)),
    deliver: (save, replace) => seen.delivered.push({ save, replace }),
    state: state => seen.states.push(state),
    provider: () => ({ request: async ({ method, params }) => { assert.equal(method, "personal_sign"); return account.signMessage({ message: hexToString(params[0]) }); } }),
    reload: () => { seen.reloads++; },
    origin: () => ORIGIN,
  }, BASE, srv.http);
  const last = () => seen.states.at(-1);
  const play = (xp, name = "Tester") => { const save = { v: 1, friendId: Number(friend), xp: { attack: xp, hitpoints: 1154 }, name, inventory: [], bank: [] }; store.setItem(key, JSON.stringify(save)); return save; };
  return { sync, seen, last, play, key };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 30));

test("a new character: unverified until the player signs in once, then its saves go up and come back on another device", async () => {
  const srv = server(), phone = storage();
  const a = device(srv, phone);
  await a.sync.open();
  assert.equal(a.last().status, "unverified"); assert.deepEqual(a.seen.delivered, [{ save: null, replace: false }], "a new player starts at once");
  await a.sync.signIn();
  assert.equal(a.last().status, "saved"); assert.equal(a.last().version, 0);
  const save = a.play(5000);
  a.sync.queue(save, true, null); await a.sync.flush();
  assert.equal(a.last().status, "saved"); assert.equal(a.last().version, 1);
  assert.equal(JSON.parse(srv.row().save).xp.attack, 5000);
  // The session stays for next time: a reload on this device goes straight to the cloud.
  const again = device(srv, phone); await again.sync.open();
  assert.equal(again.last().status, "saved"); assert.equal(again.seen.delivered[0].save.xp.attack, 5000);
  // Another device: nothing in its browser; after signing in, the cloud's adventure replaces the empty start.
  const laptop = device(srv, storage());
  await laptop.sync.open(); assert.equal(laptop.last().status, "unverified");
  await laptop.sync.signIn();
  assert.equal(laptop.last().status, "saved");
  assert.deepEqual(laptop.seen.delivered.at(-1), { save: JSON.parse(srv.row().save), replace: true });
});

test("returning player: an unchanged browser save takes the cloud's newer one; one played offline uploads; both changed asks", async () => {
  const srv = server(), phone = storage(), laptop = storage();
  const a = device(srv, phone); await a.sync.open(); await a.sync.signIn(); a.sync.queue(a.play(1000), true, null); await a.sync.flush();
  const b = device(srv, laptop); await b.sync.open(); await b.sync.signIn(); // takes version 1
  srv.advance(60_000); b.sync.queue(b.play(3000), true, null); await b.sync.flush();
  assert.equal(srv.row().version, 2);
  // The phone hasn't played since: it starts on the laptop's newer adventure.
  const a2 = device(srv, phone); await a2.sync.open();
  assert.equal(a2.seen.delivered[0].save.xp.attack, 3000); assert.equal(a2.last().status, "saved");
  // The phone plays offline (no upload), then comes back: its unsynced progress is newer and goes up.
  srv.advance(60_000); a2.play(3500);
  const a3 = device(srv, phone); await a3.sync.open();
  assert.equal(a3.seen.delivered[0].save.xp.attack, 3500); await a3.sync.flush(); await settle();
  assert.equal(JSON.parse(srv.row().save).xp.attack, 3500);
  // Now both change without syncing: the next start asks, and neither is lost.
  srv.advance(60_000); const b2 = device(srv, laptop); await b2.sync.open(); b2.sync.queue(b2.play(4000), true, null); await b2.sync.flush();
  srv.advance(60_000); a3.play(3900);
  const a4 = device(srv, phone); await a4.sync.open();
  assert.equal(a4.last().status, "conflict"); assert.equal(a4.last().conflict.cloud.xp.attack, 4000); assert.equal(a4.last().conflict.local.xp.attack, 3900);
  assert.equal(a4.seen.delivered[0].save.xp.attack, 3900, "until the player answers, this browser's is kept");
  // Keep the cloud's: the browser's goes to a backup, and the game is handed the cloud's.
  a4.sync.keepCloud(); await settle();
  assert.deepEqual(a4.seen.delivered.at(-1), { save: { v: 1, friendId: 7730, xp: { attack: 4000, hitpoints: 1154 }, name: "Tester", inventory: [], bank: [] }, replace: true });
  assert.equal(JSON.parse(phone.getItem(`${a4.key}:backup`)).save.xp.attack, 3900);
});

test("a conflict during play: an older device can't overwrite; keeping this one takes over (the cloud keeps the other)", async () => {
  const srv = server();
  const a = device(srv, storage()); await a.sync.open(); await a.sync.signIn(); a.sync.queue(a.play(1000), true, null); await a.sync.flush();
  const b = device(srv, storage()); await b.sync.open(); await b.sync.signIn();
  srv.advance(60_000); b.sync.queue(b.play(2000), true, null); await b.sync.flush();
  srv.advance(60_000); a.sync.queue(a.play(1500), true, null); await a.sync.flush();
  assert.equal(a.last().status, "conflict"); assert.equal(a.last().conflict.where, "play");
  assert.equal(JSON.parse(srv.row().save).xp.attack, 2000, "the older device didn't overwrite");
  // Further saves wait for the answer.
  srv.advance(60_000); a.sync.queue(a.play(1600), true, null); await a.sync.flush();
  assert.equal(srv.row().version, 2);
  await a.sync.keepLocal();
  assert.equal(a.last().status, "saved"); assert.equal(JSON.parse(srv.row().save).xp.attack, 1600); assert.equal(srv.row().version, 3);
  // Had it chosen the cloud's instead, the game reloads into it.
  srv.advance(60_000); b.sync.queue(b.play(2100), true, null); await b.sync.flush();
  assert.equal(b.last().status, "conflict");
  b.sync.keepCloud(); await settle(); assert.equal(b.seen.reloads, 1);
});

test("legacy import: a save from before cloud saves is offered, goes up once, keeps a backup until confirmed, and can't be duplicated", async () => {
  const srv = server(), phone = storage();
  const a = device(srv, phone); a.play(9_000_000, "Old Timer");
  await a.sync.open(); await a.sync.signIn();
  assert.equal(a.last().status, "import"); assert.equal(a.last().importable.name, "Old Timer");
  // Not uploaded behind the player's back: saves wait until they choose.
  a.sync.queue(a.play(9_000_100, "Old Timer"), true, null); await a.sync.flush();
  assert.equal(srv.row(), undefined);
  // The cloud is down the first time: the backup stays, nothing is half-done.
  srv.setDown(true); await a.sync.importLocal();
  assert.equal(a.last().status, "offline"); assert.ok(phone.getItem(`${a.key}:backup`), "backup kept while unconfirmed");
  srv.setDown(false); await a.sync.importLocal();
  assert.equal(a.last().status, "saved"); assert.equal(a.last().imported, true);
  assert.equal(srv.row().version, 1); assert.notEqual(srv.row().imported_at, null);
  assert.equal(phone.getItem(`${a.key}:backup`), null, "backup cleared once the cloud has it");
  // A restored save code is an import too; the same code twice changes nothing.
  srv.advance(60_000);
  const code = a.play(9_500_000, "Old Timer"), hash = await hashSave({ code: "RFR1-7730-abc-xyz" });
  a.sync.queue(code, false, hash); await settle(); await a.sync.flush();
  assert.equal(srv.row().version, 2);
  a.sync.queue(code, false, hash); await settle(); await a.sync.flush();
  assert.equal(srv.row().version, 2, "the same import again changes nothing");
});

test("failures keep the browser save and recover: offline backs off and retries; a refused or unowned save stops; an expired session asks again", async () => {
  const srv = server(), phone = storage();
  const a = device(srv, phone); await a.sync.open(); await a.sync.signIn(); a.sync.queue(a.play(1000), true, null); await a.sync.flush();
  // Offline: the save stays in the browser; uploads resume when the service is back.
  srv.advance(60_000); srv.setDown(true); a.sync.queue(a.play(1200), true, null); await a.sync.flush();
  assert.equal(a.last().status, "offline"); assert.equal(JSON.parse(phone.getItem(a.key)).xp.attack, 1200);
  srv.setDown(false); await a.sync.flush();
  assert.equal(a.last().status, "saved"); assert.equal(JSON.parse(srv.row().save).xp.attack, 1200);
  // Impossible progress is refused, and said so.
  srv.advance(60_000); a.sync.queue(a.play(150_000_000), true, null); await a.sync.flush();
  assert.equal(a.last().status, "error");
  // The Friend changes hands: cloud saving stops; the browser save is untouched.
  srv.advance(60_000); srv.owners.set(7730, bob.address); srv.advance(6 * 60_000);
  a.sync.queue(a.play(1300), true, null); await a.sync.flush();
  assert.equal(a.last().status, "not-owner"); assert.equal(JSON.parse(phone.getItem(a.key)).xp.attack, 1300);
  // An expired session goes back to "verify", without losing anything.
  srv.owners.set(7730, alice.address); srv.sqlite.exec("DELETE FROM sessions");
  const a2 = device(srv, phone); await a2.sync.open();
  assert.equal(a2.last().status, "unverified"); assert.equal(a2.last().error, "expired");
  assert.equal(a2.seen.delivered[0].save.xp.attack, 1300);
});

test("each wallet keeps its own sign-in: switching wallets never reuses another's session or saves", async () => {
  const srv = server(), phone = storage();
  srv.owners.set(3412, bob.address);
  const a = device(srv, phone, alice); await a.sync.open(); await a.sync.signIn();
  const b = device(srv, phone, bob, "3412"); await b.sync.open();
  assert.equal(b.last().status, "unverified", "Bob's wallet isn't signed in by Alice's session");
  await b.sync.signIn(); b.sync.queue(b.play(700), true, null); await b.sync.flush();
  assert.equal(srv.row(3412, bob.address).version, 1);
  assert.equal(srv.row(3412, alice.address), undefined);
  // Signing out of one leaves the other signed in.
  b.sync.signOut(); await settle();
  const a2 = device(srv, phone, alice); await a2.sync.open(); assert.notEqual(a2.last().status, "unverified");
  const b2 = device(srv, phone, bob, "3412"); await b2.sync.open(); assert.equal(b2.last().status, "unverified");
});

test("the wallet is only ever asked to sign the Realm's own sign-in message", async () => {
  const { isSignInMessage } = await import("../host/cloud.ts");
  const { challengeMessage } = await import("../cloud/src/worker.ts");
  const good = challengeMessage(ORIGIN, alice.address, 4663, "abcDEF123456789", Date.parse("2026-10-09T12:00:00Z"), Date.parse("2026-10-09T12:10:00Z"));
  assert.ok(isSignInMessage(good, ORIGIN, alice.address.toLowerCase()));
  assert.ok(!isSignInMessage(good, "https://evil.example", alice.address), "another site");
  assert.ok(!isSignInMessage(good, ORIGIN, bob.address), "another wallet");
  assert.ok(!isSignInMessage(good.replace("costs nothing.", "costs nothing. Also approve 1000 RF."), ORIGIN, alice.address), "anything added");
  assert.ok(!isSignInMessage(`${good}\nResources:\n- https://evil.example`, ORIGIN, alice.address), "extra lines");
  // A server sending anything else gets no signature: the sign-in fails before the wallet is asked.
  const srv = server(); let asked = 0;
  globalThis.localStorage = storage();
  const sync = new CloudSync(alice.address, "7730", { readSave: () => null, writeSave() {}, deliver() {}, state() {}, reload() {}, origin: () => ORIGIN,
    provider: () => ({ request: async () => { asked++; return "0x"; } }) }, BASE, async (url, init) => url.endsWith("/challenge") ? new Response(JSON.stringify({ message: good.replace("Version: 1", "Version: 1\nTransfer: everything") }), { status: 200 }) : srv.http(url, init));
  await sync.signIn();
  assert.equal(asked, 0); assert.equal(sync.current().status, "unverified");
});
