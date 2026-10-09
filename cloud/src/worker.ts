/**
 * RareFriends Realm cloud saves: a Cloudflare Worker over D1.
 *
 * It stores characters; it is not a game server. Multiplayer stays peer to peer and never touches it.
 *
 *   POST /v1/auth/challenge  { address }             → { message, nonce, expiresAt }   a sign-in message (EIP-4361 style)
 *   POST /v1/auth/verify     { message, signature }  → { token, address, expiresAt }  the wallet signed it: a session
 *   POST /v1/auth/logout                              (Bearer) ends the session
 *   GET  /v1/characters                               (Bearer) this wallet's characters
 *   GET  /v1/characters/:friend                       (Bearer) { version, updatedAt, save, owned }
 *   PUT  /v1/characters/:friend  gzip JSON { baseVersion, save, reason, importHash? }
 *                                                     (Bearer) → { version, updatedAt } | 409 { version, updatedAt }
 *   GET  /v1/characters/:friend/history               (Bearer) earlier versions kept for recovery
 *   POST /v1/characters/:friend/restore { version }   (Bearer) bring an earlier version back as the newest
 *
 * Rules: a session is made only from a valid signature over a single-use challenge for this site; a character is the
 * pair (wallet, Friend); writing needs the wallet to own the Friend on chain right now; every write names the version
 * it was based on, so an older save can never overwrite a newer one (409 instead); saves are size- and shape-checked
 * and their progress has to be possible in the time since the last save. See cloud/README.md for the policies.
 */
import { BaseError, ContractFunctionRevertedError, HttpRequestError, createPublicClient, getAddress, http, isAddress, parseAbi, recoverMessageAddress, zeroAddress, type Hex } from "viem";

// ---------- Storage (the subset of D1 used here, so tests can supply SQLite) ----------
export type Statement = { bind(...values: unknown[]): Statement; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; run(): Promise<{ meta: { changes: number } }> };
export type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<{ meta: { changes: number } }[]> };
export type Chain = {
  /** The wallet that owns a Friend now, or null if it can't be read. */
  ownerOf(friend: number): Promise<string | null>;
  /** Whether `signature` is `address` signing `message` (plain wallets, and contract wallets through EIP-1271/6492). */
  verify(address: string, message: string, signature: string): Promise<boolean>;
};
export type Env = { DB: Database; RPC_URL: string; COLLECTION: string; CHAIN_ID: string; ORIGINS: string };

export const LIMITS = {
  /** A save's JSON, at most (today's saves are 20–90 KB). */
  saveBytes: 400_000,
  /** The gzip request body, at most. */
  bodyBytes: 200_000,
  challengeMs: 10 * 60_000,
  sessionMs: 30 * 24 * 3_600_000,
  /** Automatic saves at most this often per character (the client sends every 90 s, sooner after milestones). */
  minWriteGapMs: 8_000,
  /** A copy of the previous version is kept at least this often, and on every import, takeover and restore. */
  historyGapMs: 10 * 60_000,
  historyKeep: 12,
  ownerCacheMs: 5 * 60_000,
  /** The most XP a character can plausibly earn per second of real time between saves (generous: ~10.8M an hour). */
  xpPerSecond: 3_000,
  xpSlack: 2_000_000,
  maxXpPerSkill: 200_000_000,
} as const;
const REASONS = new Set(["auto", "event", "import", "takeover", "exit"]);

// ---------- Helpers ----------
const now = () => Date.now();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
const randomToken = (bytes = 32) => { const b = crypto.getRandomValues(new Uint8Array(bytes)); return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const iso = (ms: number) => new Date(ms).toISOString();

/** The sign-in message. Everything the server checks is in it, readable by the player in their wallet. */
export function challengeMessage(origin: string, address: string, chainId: number, nonce: string, issued: number, expires: number) {
  return `${new URL(origin).host} wants you to sign in with your Ethereum account:\n${address}\n\n`
    + "Sign in to RareFriends Realm cloud saves. This proves you own this wallet so your adventure can be saved online. It is not a transaction and costs nothing.\n\n"
    + `URI: ${origin}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${iso(issued)}\nExpiration Time: ${iso(expires)}`;
}
function parseMessage(message: string) {
  const lines = message.split("\n"), field = (name: string) => lines.find(line => line.startsWith(`${name}: `))?.slice(name.length + 2) ?? null;
  return { domain: /^(.+) wants you to sign in with your Ethereum account:$/.exec(lines[0] ?? "")?.[1] ?? null, address: lines[1] ?? null, uri: field("URI"), chainId: field("Chain ID"), nonce: field("Nonce") };
}

/** Every number in an object tree, summed for the XP check. */
const sumXp = (xp: unknown) => !xp || typeof xp !== "object" ? 0 : Object.values(xp as Record<string, unknown>).reduce<number>((sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0);
/**
 * The server's check of a save. The game itself re-checks every field when it loads one (engine.ts `restore`), so this
 * keeps out what could hurt storage or other players' expectations: the wrong Friend, wrong shape, oversized or
 * impossible values. It can't make a client-side game cheat-proof, and doesn't pretend to (see README).
 */
export function validateSave(save: unknown, friend: number): { ok: true; totalXp: number } | { ok: false; reason: string } {
  if (!save || typeof save !== "object" || Array.isArray(save)) return { ok: false, reason: "not a save" };
  const s = save as Record<string, unknown>;
  if (s.v !== 1) return { ok: false, reason: "unknown save version" };
  if (s.friendId !== friend) return { ok: false, reason: "this save is for another Friend" };
  if (!s.xp || typeof s.xp !== "object" || Array.isArray(s.xp)) return { ok: false, reason: "no skills" };
  const xp = Object.entries(s.xp as Record<string, unknown>);
  if (xp.length > 60 || xp.some(([key, value]) => !/^[a-z_]{2,24}$/.test(key) || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > LIMITS.maxXpPerSkill)) return { ok: false, reason: "impossible skill experience" };
  if (s.inventory !== undefined && (!Array.isArray(s.inventory) || s.inventory.length > 64)) return { ok: false, reason: "impossible inventory" };
  if (s.bank !== undefined && (!Array.isArray(s.bank) || s.bank.length > 5_000)) return { ok: false, reason: "impossible bank" };
  // Shape: plain JSON, sensible keys, no deep or giant structures.
  let nodes = 0;
  const walk = (value: unknown, depth: number): string | null => {
    if (++nodes > 200_000) return "too large";
    if (depth > 8) return "too deeply nested";
    if (typeof value === "string") return value.length > 4_000 ? "text too long" : null;
    if (typeof value === "number") return Number.isFinite(value) ? null : "not a number";
    if (value === null || typeof value === "boolean") return null;
    if (Array.isArray(value)) { if (value.length > 10_000) return "list too long"; for (const entry of value) { const bad = walk(entry, depth + 1); if (bad) return bad; } return null; }
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > 10_000) return "too many fields";
      for (const [key, entry] of entries) { if (key.length > 64 || key === "__proto__" || key === "constructor" || key === "prototype") return "bad field name"; const bad = walk(entry, depth + 1); if (bad) return bad; }
      return null;
    }
    return "not plain data";
  };
  const shape = walk(save, 0);
  if (shape) return { ok: false, reason: shape };
  return { ok: true, totalXp: Math.round(sumXp(s.xp)) };
}

async function gunzipJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > LIMITS.bodyBytes) throw new HttpError(413, "too large");
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > LIMITS.bodyBytes) throw new HttpError(413, "too large");
  const gzipped = request.headers.get("content-encoding") === "gzip" || request.headers.get("content-type") === "application/x-realm-save";
  let text: string;
  if (gzipped) {
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip")), reader = stream.getReader(), parts: Uint8Array[] = [];
    let total = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > LIMITS.saveBytes + 10_000) throw new HttpError(413, "too large"); parts.push(value); }
    const all = new Uint8Array(total); let at = 0; for (const part of parts) { all.set(part, at); at += part.byteLength; }
    text = new TextDecoder().decode(all);
  } else text = new TextDecoder().decode(raw);
  try { return JSON.parse(text); } catch { throw new HttpError(400, "not JSON"); }
}
class HttpError extends Error {
  status: number; extra: Record<string, unknown>;
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) { super(message); this.status = status; this.extra = extra; }
}

// ---------- The app ----------
export function createApp({ db, chain, clock = now, origins, chainId }: { db: Database; chain: Chain; clock?: () => number; origins: string[]; chainId: number }) {
  const cors = (origin: string | null): Record<string, string> => origin && origins.includes(origin)
    ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "access-control-allow-headers": "authorization,content-type,content-encoding", "access-control-max-age": "600", vary: "origin" } : { vary: "origin" };
  const json = (origin: string | null, status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...cors(origin), ...headers } });

  async function session(request: Request) {
    const token = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!token) throw new HttpError(401, "sign in");
    const row = await db.prepare("SELECT address, expires_at FROM sessions WHERE token_hash = ?").bind(await sha256(token)).first<{ address: string; expires_at: number }>();
    if (!row || row.expires_at < clock()) throw new HttpError(401, "sign in again");
    return { address: row.address, token };
  }
  async function owns(address: string, friend: number) {
    const cached = await db.prepare("SELECT address, checked_at FROM owners WHERE friend_id = ?").bind(friend).first<{ address: string; checked_at: number }>();
    if (cached && clock() - cached.checked_at < LIMITS.ownerCacheMs) return cached.address === address;
    const owner = await chain.ownerOf(friend);
    if (!owner) { if (cached) return cached.address === address; throw new HttpError(503, "the chain couldn't be read; your save is kept on this device", { retry: true }); }
    const normal = getAddress(owner);
    await db.prepare("INSERT INTO owners (friend_id, address, checked_at) VALUES (?, ?, ?) ON CONFLICT(friend_id) DO UPDATE SET address = excluded.address, checked_at = excluded.checked_at").bind(friend, normal, clock()).run();
    return normal === address;
  }
  const friendOf = (text: string) => { const id = Number(text); if (!/^[0-9]{1,15}$/.test(text) || !Number.isSafeInteger(id)) throw new HttpError(400, "bad Friend"); return id; };

  async function route(request: Request, url: URL, origin: string | null): Promise<Response> {
    const path = url.pathname, method = request.method;
    if (path === "/v1/health") return json(origin, 200, { ok: true });
    // ---------- Sign in ----------
    if (path === "/v1/auth/challenge" && method === "POST") {
      if (!origin || !origins.includes(origin)) throw new HttpError(403, "this site can't sign in here");
      const body = await request.json().catch(() => null) as { address?: unknown } | null;
      if (!body || typeof body.address !== "string" || !isAddress(body.address)) throw new HttpError(400, "bad address");
      const address = getAddress(body.address), nonce = randomToken(16).replace(/[^A-Za-z0-9]/g, "").slice(0, 17).padEnd(17, "0"), issued = clock(), expires = issued + LIMITS.challengeMs;
      await db.batch([
        db.prepare("DELETE FROM nonces WHERE expires_at < ?").bind(issued),
        db.prepare("INSERT INTO nonces (nonce, address, origin, expires_at) VALUES (?, ?, ?, ?)").bind(nonce, address, origin, expires),
      ]);
      return json(origin, 200, { message: challengeMessage(origin, address, chainId, nonce, issued, expires), nonce, expiresAt: expires });
    }
    if (path === "/v1/auth/verify" && method === "POST") {
      if (!origin || !origins.includes(origin)) throw new HttpError(403, "this site can't sign in here");
      const body = await request.json().catch(() => null) as { message?: unknown; signature?: unknown } | null;
      if (!body || typeof body.message !== "string" || body.message.length > 2_000 || typeof body.signature !== "string" || !/^0x[0-9a-fA-F]{130,20000}$/.test(body.signature)) throw new HttpError(400, "bad sign-in");
      const parsed = parseMessage(body.message);
      if (!parsed.nonce || !parsed.address || !isAddress(parsed.address)) throw new HttpError(400, "bad sign-in");
      const address = getAddress(parsed.address);
      const row = await db.prepare("SELECT address, origin, expires_at, used FROM nonces WHERE nonce = ?").bind(parsed.nonce).first<{ address: string; origin: string; expires_at: number; used: number }>();
      if (!row || row.used || row.expires_at < clock() || row.address !== address || row.origin !== origin) throw new HttpError(401, "that sign-in has expired: try again");
      // The message must be exactly the one issued (nothing added, nothing changed).
      const issuedAt = Date.parse(/Issued At: (.+)/.exec(body.message)?.[1] ?? "");
      if (body.message !== challengeMessage(origin, address, chainId, parsed.nonce, issuedAt, row.expires_at)) throw new HttpError(401, "that sign-in doesn't match");
      // Single use: claim the nonce before anything else, so a replay loses even if it races.
      const claimed = await db.prepare("UPDATE nonces SET used = 1 WHERE nonce = ? AND used = 0").bind(parsed.nonce).run();
      if (!claimed.meta.changes) throw new HttpError(401, "that sign-in was already used");
      if (!await chain.verify(address, body.message, body.signature)) throw new HttpError(401, "the signature doesn't match this wallet");
      const token = randomToken(32), at = clock(), expires = at + LIMITS.sessionMs;
      await db.batch([
        db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(at),
        db.prepare("INSERT INTO sessions (token_hash, address, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), address, at, expires),
      ]);
      return json(origin, 200, { token, address, expiresAt: expires });
    }
    if (path === "/v1/auth/logout" && method === "POST") {
      const { token } = await session(request);
      await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
      return json(origin, 200, { ok: true });
    }
    // ---------- Characters ----------
    if (path === "/v1/characters" && method === "GET") {
      const { address } = await session(request);
      const rows = await db.prepare("SELECT friend_id, version, updated_at, total_xp FROM characters WHERE address = ? ORDER BY updated_at DESC").bind(address).all<{ friend_id: number; version: number; updated_at: number; total_xp: number }>();
      return json(origin, 200, { characters: rows.results.map(row => ({ friend: row.friend_id, version: row.version, updatedAt: row.updated_at, totalXp: row.total_xp })) });
    }
    const match = /^\/v1\/characters\/([^/]+)(\/history|\/restore)?$/.exec(path);
    if (match) {
      const friend = friendOf(match[1]), { address } = await session(request), part = match[2] ?? "";
      if (part === "" && method === "GET") {
        const row = await db.prepare("SELECT version, save, updated_at, imported_at FROM characters WHERE address = ? AND friend_id = ?").bind(address, friend).first<{ version: number; save: string; updated_at: number; imported_at: number | null }>();
        if (!row) return json(origin, 404, { error: "no cloud save yet", version: 0 });
        // Your own character is always yours to read and export, even after the Friend has moved to another wallet.
        let owned: boolean | null = null; try { owned = await owns(address, friend); } catch { owned = null; }
        return json(origin, 200, { version: row.version, updatedAt: row.updated_at, importedAt: row.imported_at, save: JSON.parse(row.save), owned });
      }
      if (part === "" && method === "PUT") {
        const body = await gunzipJson(request) as { baseVersion?: unknown; save?: unknown; reason?: unknown; importHash?: unknown };
        const baseVersion = body?.baseVersion, reason = typeof body?.reason === "string" && REASONS.has(body.reason) ? body.reason : "auto";
        if (typeof baseVersion !== "number" || !Number.isSafeInteger(baseVersion) || baseVersion < 0) throw new HttpError(400, "bad version");
        const importHash = reason === "import" && typeof body.importHash === "string" && /^[0-9a-f]{64}$/.test(body.importHash) ? body.importHash : null;
        if (reason === "import" && !importHash) throw new HttpError(400, "an import needs its hash");
        const checked = validateSave(body.save, friend);
        if (!checked.ok) throw new HttpError(422, `save rejected: ${checked.reason}`);
        const text = JSON.stringify(body.save);
        if (text.length > LIMITS.saveBytes) throw new HttpError(413, "save too large");
        if (!await owns(address, friend)) throw new HttpError(403, "this wallet doesn't own this Friend now, so it can't save over it");
        const at = clock();
        const current = await db.prepare("SELECT version, updated_at, total_xp FROM characters WHERE address = ? AND friend_id = ?").bind(address, friend).first<{ version: number; updated_at: number; total_xp: number }>();
        if (importHash) {
          const done = await db.prepare("SELECT version FROM imports WHERE address = ? AND friend_id = ? AND hash = ?").bind(address, friend, importHash).first<{ version: number }>();
          if (done) return json(origin, 200, { version: current?.version ?? done.version, updatedAt: current?.updated_at ?? at, duplicate: true });
        }
        if ((current?.version ?? 0) !== baseVersion) throw new HttpError(409, "a newer save exists", { version: current?.version ?? 0, updatedAt: current?.updated_at ?? null });
        if (current && reason === "auto" && at - current.updated_at < LIMITS.minWriteGapMs) throw new HttpError(429, "saving too often", { retryAfterMs: LIMITS.minWriteGapMs - (at - current.updated_at) });
        // Progress has to be possible in the time since the last save (imports and takeovers are the player's explicit choice).
        if (current && reason !== "import" && reason !== "takeover") {
          const allowed = LIMITS.xpSlack + LIMITS.xpPerSecond * Math.max(0, (at - current.updated_at) / 1000);
          if (checked.totalXp - current.total_xp > allowed) throw new HttpError(422, "save rejected: more progress than the time since the last save allows");
        }
        const version = baseVersion + 1, statements: Statement[] = [];
        if (!current) statements.push(db.prepare("INSERT INTO characters (address, friend_id, version, save, size, total_xp, created_at, updated_at, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(address, friend, version, text, text.length, checked.totalXp, at, at, importHash ? at : null));
        else {
          // Keep the version being replaced (every so often, and always before an import or takeover).
          const last = await db.prepare("SELECT MAX(saved_at) AS at FROM history WHERE address = ? AND friend_id = ?").bind(address, friend).first<{ at: number | null }>();
          if (reason === "import" || reason === "takeover" || !last?.at || at - last.at >= LIMITS.historyGapMs) {
            statements.push(db.prepare("INSERT OR REPLACE INTO history (address, friend_id, version, save, saved_at, reason) SELECT address, friend_id, version, save, ?, ? FROM characters WHERE address = ? AND friend_id = ? AND version = ?").bind(at, reason, address, friend, baseVersion));
            statements.push(db.prepare("DELETE FROM history WHERE address = ? AND friend_id = ? AND version NOT IN (SELECT version FROM history WHERE address = ? AND friend_id = ? ORDER BY version DESC LIMIT ?)").bind(address, friend, address, friend, LIMITS.historyKeep));
          }
          statements.push(db.prepare(`UPDATE characters SET version = ?, save = ?, size = ?, total_xp = ?, updated_at = ?${importHash ? ", imported_at = ?" : ""} WHERE address = ? AND friend_id = ? AND version = ?`)
            .bind(...[version, text, text.length, checked.totalXp, at, ...(importHash ? [at] : []), address, friend, baseVersion]));
        }
        // The import is recorded only if the write itself landed (same transaction, after it).
        if (importHash) statements.push(db.prepare("INSERT OR IGNORE INTO imports (address, friend_id, hash, version, at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE address = ? AND friend_id = ? AND version = ? AND updated_at = ?)")
          .bind(address, friend, importHash, version, at, address, friend, version, at));
        let results: { meta: { changes: number } }[];
        try { results = await db.batch(statements); }
        catch { const now2 = await db.prepare("SELECT version, updated_at FROM characters WHERE address = ? AND friend_id = ?").bind(address, friend).first<{ version: number; updated_at: number }>(); throw new HttpError(409, "a newer save exists", { version: now2?.version ?? 0, updatedAt: now2?.updated_at ?? null }); }
        const write = results[current ? statements.length - (importHash ? 2 : 1) : 0];
        if (!write?.meta.changes) { const now2 = await db.prepare("SELECT version, updated_at FROM characters WHERE address = ? AND friend_id = ?").bind(address, friend).first<{ version: number; updated_at: number }>(); throw new HttpError(409, "a newer save exists", { version: now2?.version ?? 0, updatedAt: now2?.updated_at ?? null }); }
        return json(origin, 200, { version, updatedAt: at });
      }
      if (part === "/history" && method === "GET") {
        const rows = await db.prepare("SELECT version, saved_at, reason, LENGTH(save) AS size FROM history WHERE address = ? AND friend_id = ? ORDER BY version DESC").bind(address, friend).all<{ version: number; saved_at: number; reason: string; size: number }>();
        return json(origin, 200, { versions: rows.results.map(row => ({ version: row.version, savedAt: row.saved_at, reason: row.reason, size: row.size })) });
      }
      if (part === "/restore" && method === "POST") {
        const body = await request.json().catch(() => null) as { version?: unknown } | null;
        if (!body || typeof body.version !== "number") throw new HttpError(400, "bad version");
        if (!await owns(address, friend)) throw new HttpError(403, "this wallet doesn't own this Friend now");
        const old = await db.prepare("SELECT save FROM history WHERE address = ? AND friend_id = ? AND version = ?").bind(address, friend, body.version).first<{ save: string }>();
        const current = await db.prepare("SELECT version, save, total_xp FROM characters WHERE address = ? AND friend_id = ?").bind(address, friend).first<{ version: number; save: string; total_xp: number }>();
        if (!old || !current) throw new HttpError(404, "no such version");
        const at = clock(), version = current.version + 1, checked = validateSave(JSON.parse(old.save), friend);
        if (!checked.ok) throw new HttpError(422, "that version can't be restored");
        await db.batch([
          db.prepare("INSERT OR REPLACE INTO history (address, friend_id, version, save, saved_at, reason) VALUES (?, ?, ?, ?, ?, 'restore')").bind(address, friend, current.version, current.save, at),
          db.prepare("UPDATE characters SET version = ?, save = ?, size = ?, total_xp = ?, updated_at = ? WHERE address = ? AND friend_id = ? AND version = ?").bind(version, old.save, old.save.length, checked.totalXp, at, address, friend, current.version),
        ]);
        return json(origin, 200, { version, updatedAt: at });
      }
    }
    throw new HttpError(404, "not found");
  }

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url), origin = request.headers.get("origin");
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
      // Browsers only: a request from a page that isn't the Realm's is refused outright.
      if (origin && !origins.includes(origin)) return json(origin, 403, { error: "this site can't use Realm cloud saves" });
      try { return await route(request, url, origin); }
      catch (error) {
        if (error instanceof HttpError) return json(origin, error.status, { error: error.message, ...error.extra });
        console.error(error);
        return json(origin, 500, { error: "the save service had a problem; your save is kept on this device", retry: true });
      }
    },
  };
}

// ---------- The chain: ownership reads and signature checks on Robinhood Chain ----------
export function chainFor(env: Pick<Env, "RPC_URL" | "COLLECTION">): Chain {
  const client = createPublicClient({ transport: http(env.RPC_URL, { timeout: 8_000, retryCount: 3, retryDelay: 400 }) });
  const abi = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)"]);
  return {
    async ownerOf(friend) {
      try { return await client.readContract({ address: env.COLLECTION as `0x${string}`, abi, functionName: "ownerOf", args: [BigInt(friend)] }); }
      catch (error) {
        // A Friend that doesn't exist reverts: nobody owns it. Anything else is the chain being unreachable.
        if (error instanceof BaseError && error.walk(e => e instanceof ContractFunctionRevertedError)) return zeroAddress;
        const http = error instanceof BaseError ? error.walk(e => e instanceof HttpRequestError) as HttpRequestError | null : null;
        console.warn("ownerOf failed", friend, http ? `status ${http.status} ${String(http.details).slice(0, 200)}` : error instanceof Error ? error.message.slice(0, 300) : error);
        return null;
      }
    },
    async verify(address, message, signature) {
      try { if (getAddress(await recoverMessageAddress({ message, signature: signature as Hex })) === getAddress(address)) return true; } catch { /* not a plain signature: try contract wallets */ }
      try { return await client.verifyMessage({ address: address as `0x${string}`, message, signature: signature as Hex }); } catch { return false; }
    },
  };
}

export default {
  fetch(request: Request, env: Env) {
    return createApp({ db: env.DB, chain: chainFor(env), origins: env.ORIGINS.split(",").map(origin => origin.trim()), chainId: Number(env.CHAIN_ID) }).fetch(request);
  },
};
