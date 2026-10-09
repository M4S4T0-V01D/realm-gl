/**
 * Cloud saves for the trusted host page (cloud/src/worker.ts is the other side).
 *
 * The sandboxed game never sees a wallet, a token or the network: it asks this page (CLOUD_ACTION) and is told what
 * happened (CLOUD_STATE). This page keeps the browser save exactly as before and, once the wallet has signed in once,
 * mirrors it to the cloud: loaded when the game starts, uploaded every 90 seconds while it changes, sooner after a
 * milestone, and once more when the page closes. Every upload names the cloud version it builds on, so an older copy
 * can never overwrite a newer one: the player is asked instead. When the cloud can't be reached, the browser save
 * carries on and uploads resume by themselves.
 */
import { stringToHex } from "viem";
import type { CloudConflict, CloudState } from "../games/rarefriends-realm/roster.ts";

export const CLOUD_URL = "https://rarefriends-realm-saves.masato-void.workers.dev";
type Provider = { request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> };
type Session = { token: string; address: string; expiresAt: number };
/** What this browser last agreed with the cloud: the version, and the save it was (by hash). */
type Meta = { cloudVersion: number; syncedHash: string; at: number };
type Save = Record<string, unknown>;

const SESSION_KEY = (account: string) => `rarefriends-realm:cloud:v1:session:${account.toLowerCase()}`;
const META_KEY = (account: string, friend: string) => `rarefriends-realm:save:v1:${account.toLowerCase()}:${friend}:cloud`;
const BACKUP_KEY = (account: string, friend: string) => `rarefriends-realm:save:v1:${account.toLowerCase()}:${friend}:backup`;
const AUTO_MS = 90_000, EVENT_MS = 12_000, LOAD_TIMEOUT_MS = 7_000;

const store = {
  get<T>(key: string): T | null { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; } },
  set(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } },
  remove(key: string) { try { localStorage.removeItem(key); } catch { /* blocked */ } },
};
export async function hashSave(save: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(save)));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function gzip(text: string) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The only message this page will ever ask a wallet to sign: the Realm's sign-in, for this site and this wallet, word
 * for word (cloud/src/worker.ts `challengeMessage`). Anything else from the server is refused before the wallet sees it.
 */
export function isSignInMessage(message: string, origin: string, account: string) {
  const lines = message.split("\n"), host = new URL(origin).host, time = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
  return lines.length === 11 && lines[0] === `${host} wants you to sign in with your Ethereum account:` && lines[1].toLowerCase() === account.toLowerCase() && lines[2] === ""
    && lines[3] === "Sign in to RareFriends Realm cloud saves. This proves you own this wallet so your adventure can be saved online. It is not a transaction and costs nothing."
    && lines[4] === "" && lines[5] === `URI: ${origin}` && lines[6] === "Version: 1" && lines[7] === "Chain ID: 4663" && /^Nonce: [A-Za-z0-9]{8,32}$/.test(lines[8])
    && time.test(lines[9].replace(/^Issued At: /, "")) && lines[9].startsWith("Issued At: ") && time.test(lines[10].replace(/^Expiration Time: /, "")) && lines[10].startsWith("Expiration Time: ");
}

type Io = {
  readSave(): Save | null;
  writeSave(save: Save): void;
  /** Tell the game what the save is (at start), or replace it (a conflict resolved on the title screen). */
  deliver(save: Save | null, replace: boolean): void;
  state(state: CloudState): void;
  provider(): Provider | null;
  /** This page's origin (the sign-in message names it). */
  origin(): string;
  reload(): void;
};

/** One wallet and Friend's cloud sync. Made fresh whenever the wallet or Friend changes. */
export class CloudSync {
  private session: Session | null;
  private meta: Meta | null;
  private status: CloudState = { status: "off" };
  private pending: { save: Save; important: boolean; claim: string | null } | null = null;
  private lastUpload = 0; private timer: ReturnType<typeof setTimeout> | null = null; private backoff = 0;
  private uploading = false; private paused = false; private disposed = false; private delivered = false;
  private conflict: CloudConflict | null = null;
  readonly account: string; readonly friend: string; private readonly io: Io; private readonly base: string; private readonly http: typeof fetch;
  constructor(account: string, friend: string, io: Io, base = CLOUD_URL, http: typeof fetch = (...args) => fetch(...args)) {
    this.account = account; this.friend = friend; this.io = io; this.base = base; this.http = http;
    const session = store.get<Session>(SESSION_KEY(account));
    this.session = session && session.expiresAt > Date.now() + 60_000 && session.address.toLowerCase() === account.toLowerCase() ? session : null;
    this.meta = store.get<Meta>(META_KEY(account, friend));
  }
  dispose() { this.disposed = true; if (this.timer) clearTimeout(this.timer); }
  /** Whether the game has been given its starting save yet. */
  started() { return this.delivered; }
  current() { return this.status; }
  private set(state: CloudState) { this.status = { ...state, address: this.session?.address ?? this.account }; if (!this.disposed) this.io.state(this.status); }
  private give(save: Save | null, replace = false) { if (!this.delivered || replace) { this.delivered = true; this.io.deliver(save, replace); } }

  private async api(method: string, path: string, init: { body?: BodyInit; type?: string; keepalive?: boolean; json?: unknown } = {}) {
    const headers: Record<string, string> = {};
    if (this.session) headers.authorization = `Bearer ${this.session.token}`;
    let body = init.body;
    if (init.json !== undefined) { body = JSON.stringify(init.json); headers["content-type"] = "application/json"; }
    else if (init.type) headers["content-type"] = init.type;
    const response = await this.http(`${this.base}${path}`, { method, headers, body, keepalive: init.keepalive, cache: "no-store" });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { status: response.status, data };
  }

  /** Start: decide which save the game gets (cloud, browser or a question for the player). */
  async open() {
    const local = this.io.readSave();
    if (!this.session) { this.set({ status: "unverified" }); this.give(local); return; }
    this.set({ status: "loading" });
    let result: Awaited<ReturnType<CloudSync["api"]>> | null = null;
    try { result = await Promise.race([this.api("GET", `/v1/characters/${this.friend}`), new Promise<null>(resolve => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS))]); }
    catch { result = null; }
    if (this.disposed) return;
    if (!result || result.status >= 500) { this.set({ status: "offline" }); this.give(local); this.retryOpen(); return; }
    if (result.status === 401) { this.forget(); this.set({ status: "unverified", error: "expired" }); this.give(local); return; }
    if (result.status === 404) {
      // Nothing in the cloud yet. A browser save made before cloud saves (or before signing in) is offered for import;
      // with no browser save either, this is a new character and its first save creates it.
      if (local && !this.meta) { this.set({ status: "import", importable: local }); this.paused = true; }
      else if (local && this.meta) { this.set({ status: "import", importable: local, lost: true }); this.paused = true; }
      else this.set({ status: "saved", version: 0 });
      this.give(local); return;
    }
    if (result.status !== 200) { this.set({ status: "offline" }); this.give(local); this.retryOpen(); return; }
    const cloud = result.data.save as Save, version = Number(result.data.version), updatedAt = Number(result.data.updatedAt), owned = result.data.owned !== false;
    const cloudHash = await hashSave(cloud);
    if (!local) { this.adopt(cloud, version, cloudHash); this.set({ status: owned ? "saved" : "not-owner", version, savedAt: updatedAt }); this.give(cloud); return; }
    const localHash = await hashSave(local), dirty = !this.meta || localHash !== this.meta.syncedHash;
    if (localHash === cloudHash) { this.adopt(cloud, version, cloudHash); this.set({ status: owned ? "saved" : "not-owner", version, savedAt: updatedAt }); this.give(local); return; }
    if (this.meta && this.meta.cloudVersion === version && dirty) {
      // Played on this device since the last upload (offline, or closed before it went): this device's is newer.
      this.set({ status: owned ? "saving" : "not-owner", version, savedAt: updatedAt }); this.give(local);
      if (owned) this.queue(local, true, null); return;
    }
    if (this.meta && this.meta.cloudVersion <= version && !dirty) { this.adopt(cloud, version, cloudHash); this.set({ status: owned ? "saved" : "not-owner", version, savedAt: updatedAt }); this.give(cloud); return; }
    // Both changed (or this browser's save predates cloud saves): ask, keeping both.
    this.conflict = { cloud, cloudAt: updatedAt, cloudVersion: version, local, localAt: this.meta?.at ?? null, where: "start" };
    this.paused = true; this.set({ status: "conflict", conflict: this.conflict }); this.give(local);
  }
  private retryOpen() { this.schedule(() => { if (!this.delivered || this.status.status === "offline") void this.reconnect(); }, 30_000); }
  /** Back online after starting offline: check the cloud didn't move on meanwhile, then upload. */
  private async reconnect() {
    try {
      const result = await this.api("GET", `/v1/characters/${this.friend}`);
      if (result.status === 401) { this.forget(); this.set({ status: "unverified", error: "expired" }); return; }
      if (result.status >= 500) { this.retryOpen(); return; }
      const version = result.status === 404 ? 0 : Number(result.data.version);
      if (result.status === 404 && !this.meta) { const local = this.io.readSave(); if (local) { this.paused = true; this.set({ status: "import", importable: local }); return; } }
      if ((this.meta?.cloudVersion ?? 0) !== version) { await this.conflictFrom(result.status === 404 ? null : result.data, "play"); return; }
      this.set({ status: "saving", version }); const local = this.io.readSave(); if (local) this.queue(local, true, null);
    } catch { this.retryOpen(); }
  }
  private adopt(save: Save, version: number, hash: string) {
    this.io.writeSave(save); this.meta = { cloudVersion: version, syncedHash: hash, at: Date.now() }; store.set(META_KEY(this.account, this.friend), this.meta);
  }
  private forget() { this.session = null; store.remove(SESSION_KEY(this.account)); }

  /** Sign in: the server's message, signed by the wallet (no transaction), for a session token. */
  async signIn() {
    const provider = this.io.provider();
    if (!provider) { this.set({ status: "unverified", error: "no-wallet" }); return; }
    this.set({ status: "signing" });
    try {
      const challenge = await this.api("POST", "/v1/auth/challenge", { json: { address: this.account } });
      if (challenge.status !== 200 || typeof challenge.data.message !== "string") throw new Error("challenge");
      if (!isSignInMessage(challenge.data.message, this.io.origin(), this.account)) throw new Error("unexpected message");
      const signature = await provider.request({ method: "personal_sign", params: [stringToHex(challenge.data.message), this.account] });
      const verified = await this.api("POST", "/v1/auth/verify", { json: { message: challenge.data.message, signature } });
      if (verified.status !== 200 || typeof verified.data.token !== "string") throw new Error("verify");
      this.session = { token: verified.data.token, address: String(verified.data.address), expiresAt: Number(verified.data.expiresAt) };
      store.set(SESSION_KEY(this.account), this.session);
      this.delivered = true; // the game is already running: what's loaded now arrives as a resolution, not a start
      await this.reopenAfterSignIn();
    } catch (error) {
      const rejected = typeof error === "object" && error !== null && (error as { code?: unknown }).code === 4001;
      this.set({ status: "unverified", error: rejected ? "cancelled" : "failed" });
    }
  }
  private async reopenAfterSignIn() {
    const result = await this.api("GET", `/v1/characters/${this.friend}`).catch(() => null);
    if (!result || result.status >= 500) { this.set({ status: "offline" }); this.retryOpen(); return; }
    const local = this.io.readSave();
    if (result.status === 404) {
      if (local) { this.paused = true; this.set({ status: "import", importable: local }); }
      else this.set({ status: "saved", version: 0 });
      return;
    }
    const cloud = result.data.save as Save, version = Number(result.data.version), hash = await hashSave(cloud);
    if (!local || hash === await hashSave(local)) { this.adopt(cloud, version, hash); this.set({ status: "saved", version, savedAt: Number(result.data.updatedAt) }); if (!local) this.give(cloud, true); return; }
    await this.conflictFrom(result.data, "start");
  }
  private async conflictFrom(data: Record<string, unknown> | null, where: "start" | "play") {
    const local = this.io.readSave();
    if (!data) { if (local) { this.paused = true; this.set({ status: "import", importable: local, lost: true }); } return; }
    this.conflict = { cloud: data.save as Save, cloudAt: Number(data.updatedAt), cloudVersion: Number(data.version), local, localAt: this.meta?.at ?? null, where };
    this.paused = true; this.set({ status: "conflict", conflict: this.conflict });
  }
  signOut() {
    const token = this.session?.token;
    if (token) void this.api("POST", "/v1/auth/logout").catch(() => undefined);
    this.forget(); this.paused = false; this.set({ status: "unverified" });
  }

  // ---------- The player's answers ----------
  /** Bring this browser's adventure up to the cloud (the first time, or replacing the cloud's after a question). */
  async importLocal(replacing = false) {
    const local = this.io.readSave();
    if (!local) return;
    // Keep a copy aside until the cloud confirms it has it.
    store.set(BACKUP_KEY(this.account, this.friend), { save: local, at: Date.now() });
    const hash = await hashSave(local), base = replacing ? (this.conflict?.cloudVersion ?? this.meta?.cloudVersion ?? 0) : 0;
    this.set({ status: "saving" });
    const result = await this.put(local, base, "import", hash);
    if (result === "ok") { store.remove(BACKUP_KEY(this.account, this.friend)); this.paused = false; this.conflict = null; this.set({ ...this.status, status: "saved", imported: true }); }
  }
  /** Keep the cloud's adventure: this browser's goes aside as a backup, and the game loads the cloud's. */
  keepCloud() {
    const conflict = this.conflict;
    if (!conflict) return;
    const local = this.io.readSave();
    if (local) store.set(BACKUP_KEY(this.account, this.friend), { save: local, at: Date.now() });
    void hashSave(conflict.cloud).then(hash => {
      this.adopt(conflict.cloud, conflict.cloudVersion, hash); this.conflict = null; this.paused = false;
      this.set({ status: "saved", version: conflict.cloudVersion, savedAt: conflict.cloudAt });
      if (conflict.where === "start") this.give(conflict.cloud, true); else this.io.reload();
    });
  }
  /** Keep this browser's adventure: it replaces the cloud's (which the server keeps in its history). */
  async keepLocal() {
    const conflict = this.conflict, local = this.io.readSave();
    if (!conflict || !local) return;
    this.set({ status: "saving" });
    const result = await this.put(local, conflict.cloudVersion, "takeover", null);
    if (result === "ok") { this.conflict = null; this.paused = false; }
  }
  skipImport() { this.set({ status: "local-only" }); }
  retry() { this.paused = this.status.status === "conflict" || this.status.status === "import"; if (this.status.status === "offline" || this.status.status === "error") { this.backoff = 0; void this.reconnect(); } }

  // ---------- Saving ----------
  /** A save from the game (already in the browser). `important` after a milestone; `claim` the hash of a restored save code. */
  queue(save: Save, important: boolean, claim: string | null) {
    this.pending = { save, important: important || !!claim || this.pending?.important === true, claim: claim ?? this.pending?.claim ?? null };
    if (!this.session || this.disposed) return;
    if (claim) { void this.flush(); return; }
    if (this.paused || this.uploading) return;
    const wait = Math.max(0, (this.pending.important ? EVENT_MS : AUTO_MS) - (Date.now() - this.lastUpload));
    this.schedule(() => void this.flush(), Math.max(wait, this.backoff));
  }
  private schedule(run: () => void, ms: number) { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => { this.timer = null; if (!this.disposed) run(); }, ms); }
  async flush(exit = false) {
    const pending = this.pending;
    if (!pending || !this.session || this.uploading) return;
    if (this.paused && !pending.claim) return;
    const hash = await hashSave(pending.save);
    if (!pending.claim && this.meta?.syncedHash === hash) { this.pending = null; return; }
    this.pending = null;
    const base = pending.claim ? (this.conflict?.cloudVersion ?? this.meta?.cloudVersion ?? 0) : (this.meta?.cloudVersion ?? 0);
    await this.put(pending.save, base, pending.claim ? "import" : exit ? "exit" : pending.important ? "event" : "auto", pending.claim, exit, hash);
  }
  private async put(save: Save, baseVersion: number, reason: string, importHash: string | null, exit = false, hash?: string): Promise<"ok" | "failed"> {
    this.uploading = true; this.lastUpload = Date.now();
    const saveHash = hash ?? await hashSave(save);
    try {
      const body = await gzip(JSON.stringify({ baseVersion, save, reason, ...(importHash ? { importHash } : {}) }));
      if (!exit) this.set({ ...this.status, status: "saving" });
      const result = await this.api("PUT", `/v1/characters/${this.friend}`, { body: body as BodyInit, type: "application/x-realm-save", keepalive: exit && body.byteLength < 60_000 });
      if (result.status === 200) {
        this.backoff = 0;
        this.meta = { cloudVersion: Number(result.data.version), syncedHash: saveHash, at: Date.now() }; store.set(META_KEY(this.account, this.friend), this.meta);
        this.set({ status: "saved", version: this.meta.cloudVersion, savedAt: Number(result.data.updatedAt), ...(result.data.duplicate ? { duplicate: true } : {}) });
        return "ok";
      }
      if (result.status === 401) { this.forget(); this.set({ status: "unverified", error: "expired" }); return "failed"; }
      if (result.status === 403) { this.paused = true; this.set({ status: "not-owner" }); return "failed"; }
      if (result.status === 409) { const latest = await this.api("GET", `/v1/characters/${this.friend}`).catch(() => null); if (latest?.status === 200 && await hashSave(latest.data.save) === saveHash) { this.adopt(save, Number(latest.data.version), saveHash); this.set({ status: "saved", version: Number(latest.data.version), savedAt: Number(latest.data.updatedAt) }); return "ok"; } await this.conflictFrom(latest?.status === 200 ? latest.data : null, "play"); return "failed"; }
      if (result.status === 429) { this.pending ??= { save, important: false, claim: importHash }; this.schedule(() => void this.flush(), Number(result.data.retryAfterMs ?? 10_000) + 500); return "failed"; }
      if (result.status === 422 || result.status === 413) { this.set({ status: "error", error: String(result.data.error ?? "rejected") }); return "failed"; }
      throw new Error(`status ${result.status}`);
    } catch {
      // Offline or the service is down: the browser save is safe; try again, waiting longer each time (up to 5 minutes).
      this.pending ??= { save, important: false, claim: importHash };
      this.backoff = Math.min(300_000, this.backoff ? this.backoff * 2 : 15_000);
      this.set({ status: "offline" }); this.schedule(() => void this.flush(), this.backoff);
      return "failed";
    } finally { this.uploading = false; }
  }
}
