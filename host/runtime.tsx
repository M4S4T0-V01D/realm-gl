/**
 * Trusted runtime page for RareFriends Realm.
 *
 * This is the SDK's own GameHost: wallet connection, owned-Friend picker, fresh eligibility check,
 * simulated ledger, confirmations and the sandboxed frame. It adds three things for the game:
 *  1. A read-only discovery of the connected account's eligible Friends with the SDK's `readOwnedFriends`,
 *     so your other owned Friends can follow you in the Realm.
 *  2. Per-wallet saves. The sandbox has no storage, so this trusted page keeps each wallet's adventure
 *     in its own localStorage, keyed by wallet address and Friend.
 *  3. Playing together (host/net.ts): other players' Friends, chat and a friends list, peer to peer. Only Friend IDs
 *     travel, and everything received is validated before the game sees it.
 *  4. Cloud saves (host/cloud.ts): once the wallet signs in (a message, never a transaction), the browser save is
 *     mirrored to the Realm's save service, so the adventure follows the wallet to any device. Nothing else changes:
 *     the browser save still comes first, and play carries on if the cloud can't be reached.
 *  5. Sharing the adventurer card. On the player's click, it uses the share sheet, clipboard, a download or an
 *     X post link. The sandbox has none of these powers.
 * All of them reach the sandboxed game only over postMessage, when it asks. The watcher session only uses
 * `eth_accounts`; the one signature (cloud sign-in) is asked for only when the player chooses it in the game.
 * GameHost still owns connection and selection.
 */
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { GameHost } from "@rarefriends/friendsdk/runtime";
import { parseChanceGame } from "@rarefriends/friendsdk/game";
import { readOwnedFriends } from "@rarefriends/friendsdk/owned";
import { createFriendWalletSession } from "@rarefriends/friendsdk/wallet";
import { GENERATION_SPRITE_MANIFEST } from "@rarefriends/friendsdk/sprites";
import { createClient, http } from "viem";
import { getBlockNumber, getChainId, getLogs, readContract } from "viem/actions";
import {
  CLOUD_ACTION, CLOUD_STATE, type CloudAction, FEEDBACK_REQUEST, FEEDBACK_RESULT, FULLSCREEN_REQUEST, FULLSCREEN_STATE, JOIN_INVITE, TEXT_COPY, TEXT_COPY_RESULT, HOST_HELLO, HOST_STATE, SAVE_ELSEWHERE, SAVE_EXPORT, SAVE_EXPORT_RESULT, SAVE_WRITE, SHARE_REQUEST, SHARE_RESULT, type FeedbackOutcome, type FeedbackTarget, type ShareAction, type ShareOutcome,
} from "../games/rarefriends-realm/roster.ts";
import { CloudSync } from "./cloud.ts";
import { NET_ACT, NET_CHAT, NET_ONLINE, NET_PRESENCE, NET_SOCIAL } from "../games/rarefriends-realm/net.ts";
import { NetHub } from "./net.ts";
import gameJson from "../games/rarefriends-realm/game.json";
import { FEEDBACK_REPO } from "../games/rarefriends-realm/feedback.ts";
import "@rarefriends/friendsdk/frame.css";
import "@rarefriends/friendsdk/runtime.css";

/**
 * A read-only RPC client with just the four reads roster discovery needs, like the SDK's own preview client, so the
 * page carries no transaction-sending actions (FriendSDK v0.1.4 preview builds).
 */
function createRosterClient(): Parameters<typeof readOwnedFriends>[0] {
  const client = createClient({ transport: http(GENERATION_SPRITE_MANIFEST.rpcUrl), cacheTime: 0, pollingInterval: 1_000 });
  return {
    getBlockNumber: parameters => getBlockNumber(client, parameters),
    getChainId: () => getChainId(client),
    getLogs: parameters => getLogs(client, parameters),
    readContract: parameters => readContract(client, parameters),
  } as Parameters<typeof readOwnedFriends>[0];
}

const definition = parseChanceGame(gameJson);
/** One save per wallet and Friend: each of your Friends has its own adventure. */
const saveKey = (account: string, friend: string) => `rarefriends-realm:save:v1:${account.toLowerCase()}:${friend}`;
function readSave(account: string, friend: string | null): unknown {
  if (!friend) return null;
  try { const raw = localStorage.getItem(saveKey(account, friend)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeSave(account: string, friend: string, save: unknown) {
  try { const raw = JSON.stringify(save); if (raw.length < 200_000) localStorage.setItem(saveKey(account, friend), raw); } catch { /* Storage full or blocked: play continues unsaved. */ }
}

function download(image: Blob, filename: string) {
  const url = URL.createObjectURL(image), link = document.createElement("a");
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
async function copyImage(image: Blob) {
  try { await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]); return true; } catch { return false; }
}
/** Runs inside the click's user activation, which the browser passes up from the game frame. */
async function share(action: ShareAction, text: string, image: Blob, filename: string): Promise<ShareOutcome> {
  if (action === "copy") return await copyImage(image) ? "copied" : "failed";
  if (action === "save") { download(image, filename); return "saved"; }
  // Phones: the share sheet can send the picture and the text straight to the X app.
  const file = new File([image], filename, { type: "image/png" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file], text })) {
    try { await navigator.share({ files: [file], text }); return "shared"; }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") return "cancelled"; }
  }
  // Desktop: X post links can't carry images, so copy the picture (or save it), then open the prefilled post.
  const copied = await copyImage(image);
  if (!copied) download(image, filename);
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  return copied ? "copied-and-opened" : "saved-and-opened";
}

function RealmHost() {
  useEffect(() => {
    const session = createFriendWalletSession(), client = createRosterClient();
    let account: string | null = null, controller: AbortController | null = null, roster: string[] | null = null, friend: string | null = null;
    // One tab saves at a time: the newest tab for a wallet and Friend takes over, and older tabs stop writing.
    const tab = Math.random().toString(36).slice(2), saves = typeof BroadcastChannel === "function" ? new BroadcastChannel("rarefriends-realm:saves") : null;
    let superseded = false, cloud: CloudSync | null = null;
    const claim = () => { superseded = false; if (account && friend) saves?.postMessage({ key: saveKey(account, friend), tab }); };
    if (saves) saves.onmessage = event => {
      if (!account || !friend || event.data?.tab === tab || event.data?.key !== saveKey(account, friend)) return;
      superseded = true; frames().forEach(target => target.postMessage({ type: SAVE_ELSEWHERE }, "*"));
    };
    const frames = () => [...document.querySelectorAll("iframe")].flatMap(frame => frame.contentWindow ? [frame.contentWindow] : []);
    // Nothing is sent until this wallet's roster is known, so the game can match it to its verified manager.
    const owns = (id: unknown) => !!roster?.some(entry => entry.split(":")[0] === String(id));
    // The game's starting save waits for the cloud to be checked (a few seconds at most); after that, it's the browser's.
    const send = (target: Window) => {
      if (!account || !roster || (cloud && !cloud.started())) return;
      target.postMessage({ type: HOST_STATE, ids: roster, save: owns(friend) ? readSave(account, friend) : null }, "*");
      if (cloud) target.postMessage({ type: CLOUD_STATE, state: cloud.current() }, "*");
    };
    /** One cloud sync per wallet and owned Friend, made when both are known. */
    const ensureCloud = () => {
      if (!account || !roster || !friend || !owns(friend)) { cloud?.dispose(); cloud = null; return; }
      if (cloud && cloud.account === account && cloud.friend === friend) return;
      cloud?.dispose();
      const me = account, them = friend, ids = roster;
      cloud = new CloudSync(me, them, {
        readSave: () => readSave(me, them) as Record<string, unknown> | null,
        writeSave: save => writeSave(me, them, save),
        deliver: (save, replace) => frames().forEach(target => target.postMessage({ type: HOST_STATE, ids, save, ...(replace ? { replace: true } : {}) }, "*")),
        state: state => frames().forEach(target => target.postMessage({ type: CLOUD_STATE, state }, "*")),
        provider: () => session.getProvider(),
        origin: () => window.location.origin,
        reload: () => window.location.reload(),
      });
      void cloud.open();
    };
    const broadcast = () => frames().forEach(send);
    // Playing together: tests (navigator.webdriver) meet over a same-origin channel, everyone else peer to peer.
    const hub = new NetHub(message => frames().forEach(target => target.postMessage(message, "*")), navigator.webdriver);
    const sync = () => hub.setPlayer(account, account && roster && owns(friend) ? Number(friend) : null);
    const check = () => {
      const snapshot = session.getSnapshot();
      const next = snapshot.status === "connected" ? snapshot.account : null;
      if (next === account) return;
      account = next; controller?.abort(); roster = null; superseded = false; cloud?.dispose(); cloud = null; sync();
      if (!next) return;
      const current = controller = new AbortController();
      // Discovery can hit public-RPC rate limits, so keep retrying for about a minute before giving up (the game then
      // plays unsaved). Saves start as soon as it succeeds, even mid-play.
      const discover = (attempt: number): void => {
        void readOwnedFriends(client, next, { signal: current.signal })
          .then(result => { if (!current.signal.aborted) { roster = result.friends.map(owned => `${owned.id}:${owned.generation}`); claim(); ensureCloud(); broadcast(); sync(); } })
          .catch(() => { if (!current.signal.aborted && attempt < 8) setTimeout(() => discover(attempt + 1), Math.min(10_000, 1500 * (attempt + 1))); });
      };
      discover(0);
    };
    // Only the game frame we host may ask or save. Saves are accepted only for a Friend in this wallet's roster.
    const receive = (event: MessageEvent) => {
      if (!event.source || !frames().includes(event.source as Window)) return;
      if (event.data?.type === HOST_HELLO) {
        friend = /^[0-9]{1,15}$/.test(String(event.data.friend)) ? String(event.data.friend) : null; claim(); ensureCloud(); send(event.source as Window); sync();
        // A fellowship invitation in the page's link (?join=…) goes to the game once it's listening.
        const join = new URLSearchParams(window.location.search).get("join");
        if (join && /^[A-Za-z0-9_-]{8,600}$/.test(join)) (event.source as Window).postMessage({ type: JOIN_INVITE, token: join }, "*");
      }
      else if (event.data?.type === NET_PRESENCE) hub.presence(event.data.presence);
      else if (event.data?.type === NET_CHAT) hub.chat(event.data.text, event.data.to);
      else if (event.data?.type === NET_ACT) hub.act(event.data.act, event.data.to);
      else if (event.data?.type === NET_SOCIAL && typeof event.data.op === "string" && typeof event.data.id === "number") hub.changeSocial(event.data.op, event.data.id);
      else if (event.data?.type === NET_ONLINE) hub.setOnline(event.data.on === true);
      else if (event.data?.type === SAVE_EXPORT && (event.data.action === "copy" || event.data.action === "download") && typeof event.data.text === "string"
        && /^RFR1-[0-9]{1,15}-[0-9a-z]{1,8}-[A-Za-z0-9_-]{8,200000}$/.test(event.data.text)) {
        // Your save code, copied or downloaded on your click (the sandbox can do neither).
        const source = event.source as Window, text = event.data.text as string, friendId = text.split("-")[1];
        const done = (result: string) => source.postMessage({ type: SAVE_EXPORT_RESULT, result }, "*");
        if (event.data.action === "download") { download(new Blob([text], { type: "text/plain" }), `rarefriends-realm-friend-${friendId}-save.txt`); done("saved"); }
        else void navigator.clipboard.writeText(text).then(() => done("copied"), () => { download(new Blob([text], { type: "text/plain" }), `rarefriends-realm-friend-${friendId}-save.txt`); done("saved"); });
      }
      else if (event.data?.type === SAVE_WRITE && account && owns(event.data.friend) && String(event.data.friend) === friend) {
        // A restored save code takes this Friend's saves back from any other tab.
        if (event.data.claim === true) claim();
        if (!superseded) {
          writeSave(account, friend, event.data.save);
          const importHash = typeof event.data.importHash === "string" && /^[0-9a-f]{64}$/.test(event.data.importHash) ? event.data.importHash : null;
          if (event.data.save && typeof event.data.save === "object") cloud?.queue(event.data.save, event.data.important === true, event.data.claim === true ? importHash : null);
        }
      }
      else if (event.data?.type === CLOUD_ACTION && cloud) {
        // The player's choices about cloud saves, from the game's buttons.
        const action = event.data.action as CloudAction;
        if (action === "verify") void cloud.signIn();
        else if (action === "sign-out") cloud.signOut();
        else if (action === "import") void cloud.importLocal(event.data.replacing === true);
        else if (action === "skip-import") cloud.skipImport();
        else if (action === "keep-cloud") cloud.keepCloud();
        else if (action === "keep-local") void cloud.keepLocal();
        else if (action === "retry") cloud.retry();
        else if (action === "reload") window.location.reload();
        // Logging out: up now, as an exit (never held back by the every-few-seconds limit).
        else if (action === "flush" && !superseded) void cloud.flush(true);
      }
      else if (event.data?.type === TEXT_COPY && typeof event.data.text === "string" && event.data.text.length <= 1000) {
        const source = event.source as Window;
        void navigator.clipboard.writeText(event.data.text).then(() => source.postMessage({ type: TEXT_COPY_RESULT, result: "copied" }, "*"), () => source.postMessage({ type: TEXT_COPY_RESULT, result: "failed" }, "*"));
      }
      else if (event.data?.type === FULLSCREEN_REQUEST) {
        // Full screen for the game frame, on the player's click (the sandbox may not ask for it itself).
        const frame = [...document.querySelectorAll("iframe")].find(entry => entry.contentWindow === event.source);
        const target = frame?.closest<HTMLElement>(".rf-game-frame") ?? frame?.parentElement ?? document.documentElement;
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        else void target.requestFullscreen?.().catch(() => undefined);
      }
      else if (event.data?.type === FEEDBACK_REQUEST && ["both", "github", "x"].includes(event.data.target) && typeof event.data.post === "string" && event.data.post.length <= 600
        && typeof event.data.title === "string" && event.data.title.length <= 200 && typeof event.data.body === "string" && event.data.body.length <= 6000) {
        // Player feedback, on the player's click: the GitHub issue first (it holds the details), then the X post. Some
        // browsers allow one new tab per click; the game offers the post on its own if the second is refused.
        const source = event.source as Window, target = event.data.target as FeedbackTarget;
        const open = (url: string) => { const opened = window.open(url, "_blank"); if (opened) { try { opened.opener = null; } catch { /* cross-origin already */ } } return !!opened; };
        const github = target !== "x" && open(`https://github.com/${FEEDBACK_REPO}/issues/new?${new URLSearchParams({ title: event.data.title, body: event.data.body, labels: "player-feedback" })}`);
        const x = target !== "github" && open(`https://x.com/intent/post?text=${encodeURIComponent(event.data.post)}`);
        const result: FeedbackOutcome = target === "both" ? (github && x ? "both" : github ? "x-blocked" : x ? "x" : "failed") : target === "github" ? (github ? "github" : "failed") : (x ? "x" : "failed");
        source.postMessage({ type: FEEDBACK_RESULT, result }, "*");
      }
      else if (event.data?.type === SHARE_REQUEST && ["post", "copy", "save"].includes(event.data.action) && event.data.image instanceof Blob
        && event.data.image.type === "image/png" && event.data.image.size < 5_000_000 && typeof event.data.text === "string" && event.data.text.length <= 1000) {
        const source = event.source as Window, action = event.data.action as ShareAction;
        const filename = /^[a-z0-9-]{1,60}\.png$/.test(event.data.filename) ? event.data.filename : "rarefriends-realm-card.png";
        void share(action, event.data.text, event.data.image, filename).catch((): ShareOutcome => "failed")
          .then(result => source.postMessage({ type: SHARE_RESULT, action, result }, "*"));
      }
    };
    window.addEventListener("message", receive);
    const fullscreen = () => { for (const frame of frames()) frame.postMessage({ type: FULLSCREEN_STATE, on: !!document.fullscreenElement }, "*"); };
    document.addEventListener("fullscreenchange", fullscreen);
    const unsubscribe = session.subscribe(check); check();
    // Pick up a connection made through GameHost even if the wallet emits no accountsChanged event.
    const poll = setInterval(() => { if (session.getSnapshot().status !== "connected") void session.refresh(); }, 2500);
    const bye = () => { if (!superseded) void cloud?.flush(true); hub.dispose(); };
    window.addEventListener("pagehide", bye);
    return () => { clearInterval(poll); unsubscribe(); window.removeEventListener("message", receive); document.removeEventListener("fullscreenchange", fullscreen); window.removeEventListener("pagehide", bye); hub.dispose(); saves?.close(); controller?.abort(); cloud?.dispose(); session.dispose(); };
  }, []);
  // The same wide layout as games/rarefriends-realm/host.css, set on the wrapper as HOST_INTEGRATION.md describes.
  return (
    // The SDK's own frame: a 960 × 640 viewport (3:2), which the game's stage fills exactly.
    <div>
      <style>{".rf-frame-wallet-balance { display: none; }"}</style>
      <GameHost definition={definition} frameUrl="./game.html" />
      <p style={{ margin: "10px auto 0", maxWidth: 1280, textAlign: "center", font: "13px ui-monospace, Menlo, Consolas, monospace" }}>
        <a href="./preview/#trailer">▶ Watch the trailer</a> · <a href="./preview/">About the game</a> · <a href="./preview/guides.html">Skill guides</a>
      </p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<RealmHost />);
