"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import { expectedReward, maximumPrize, type GamePlay, type GameSnapshot } from "@rarefriends/friendsdk/game";
import { createFriendReader, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { mountArt } from "./mountart.ts";
import { fireworks as launchFireworks } from "./effects.ts";
import { FAMILY_NAMES, FAMILY_PERKS, MOUNTS, RELICS, RF_BUNDLES, SKILL_COLORS, SKILL_ICONS, SPELLS, WARDROBE, isItem, item, type Skill } from "./data.ts";
import { QUESTS, questPoints, MAX_QUEST_POINTS } from "./content.ts";
import { TICK_MS, attackSpeed, combatLevel, createGame, giveOrDrop, message, totalLevel, type Game, type Projectile } from "./state.ts";
import {
  chooseOption, closeInterfaces, collectFromCasket, creditReferral, emoteProblem, performEmote, syncMonster, continueDialogue, grantBundle, menuFor, tailorChoices, unlockMusic, restore, serialize, setFollower, setHeld, setRelics, tick, toggleRun, toggleSneak, toggleMount, grantMount, walkTo, type OwnedFriend, type Selection,
} from "./engine.ts";
import { PITCH, RENDER_PROFILE, VIEW, ZOOM, addPrint, daylight, minimapTile, northAngle, pickAt, renderMinimap, renderScene, toScreen, toTile, type Camera, type ClickMarker, type Firework, type HitSplat } from "./render.ts";
import {
  BankModal, CardsModal, CarvingBuffs, FeedbackModal, ChatBox, ContextMenu, DailyModal, FellowshipModal, HomeModal, JoinModal, RfActionModal, FirstStepsCard, GuideModal, TradeModal, DialogueBox, FriendPortrait, HelpModal, LampModal, NamingModal, LevelUpBox, Modal, Orbs, PixelIcon, ProductionBox, ShopModal, SidePanel, TABS, WorldMapModal,
  cancelLongPress, longPress, rightClick, type MenuEntry, type Settings, type Tab,
} from "./panels.tsx";
import { REGULAR_SPRITES } from "./regulars.ts";
import { NET_ACT, NET_ACT_IN, NET_CHAT, NET_CHAT_IN, NET_ONLINE, NET_PRESENCE, NET_SOCIAL, NET_STATE, cleanAct, cleanChat, cleanId, cleanPresence, type Act, type NetState, type Presence } from "./net.ts";
import { Players, presenceOf } from "./social.ts";
import { Trades } from "./trade.ts";
import { FELLOW_RANGE, PARTY_RANGE, Party, nearby } from "./party.ts";
import { makeSaveCode, restoreSaveCode } from "./savecode.ts";
import { strikeAt, weatherAt, type Weather } from "./weather.ts";
import { FEEDBACK_REQUEST, FEEDBACK_RESULT, FULLSCREEN_REQUEST, FULLSCREEN_STATE, JOIN_INVITE, TEXT_COPY, TEXT_COPY_RESULT, HOST_HELLO, HOST_STATE, SAVE_ELSEWHERE, SAVE_EXPORT, SAVE_EXPORT_RESULT, SAVE_WRITE, SHARE_REQUEST, SHARE_RESULT, parseRoster, type ShareAction, type ShareOutcome } from "./roster.ts";
import { RealmAudio, trackFor, trackById, type SfxName, type TrackId } from "./audio.ts";
import { recruitText, renderCard, renderFellowshipCard, shareText } from "./card.ts";
import { feedbackIssue, feedbackPost, type FeedbackKind } from "./feedback.ts";
import { CARD_CATEGORY_NAMES, CARD_COLOR_KEYS, CARD_COLOR_NAMES, CARD_OPTIONS, cardRequirement, cardUnlocked, fellowshipArt, parseInvite, type CardCategory } from "./cardstyle.ts";
import { dailyWaiting, rollDaily, streakStatus } from "./daily.ts";
import { FIRST_STEPS, currentStep, skipFirstSteps } from "./firststeps.ts";
import { updateWorldBoss } from "./worldboss.ts";
import { checkAchievements } from "./achievements.ts";
import { notePlayers } from "./hiscores.ts";
import { duelAllowed, duelReach, duelStrike, takeDuelHit, wonDuel } from "./duel.ts";
import { LATEST_UPDATE } from "./updates.ts";
import type { DailyTab } from "./panels.tsx";
import { skillArt } from "./icons.ts";
import { playerName } from "./presence.ts";
import { T, groundHeight, isUnderground, isWater, mainlandToWorld, realPoint, regionAt, terrainAt, type World } from "./world.ts";
/** The Hollow King's throne room (its own music), in world coordinates. */
const THRONE = { x: mainlandToWorld(177, 212)[0], y0: mainlandToWorld(177, 212)[1], y1: mainlandToWorld(177, 236)[1] };
import { burst } from "./effects.ts";
import { textureStats } from "./textures.ts";
import { adapt, newAdaptive } from "./adaptive.ts";
import { RealmGL } from "./gl.ts";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";

/**
 * Simulated $RAREFRIENDS, shown the Realm's way: the ledger counts whole tokens (a casket is one, the preview wallet holds
 * twenty), and the Realm shows every amount a thousand times finer, so a casket reads 1,000 RF and a purse 20,000: prices
 * in the hundreds and thousands, as a game's should. The host's own balance line is hidden so the two never disagree.
 */
export const RF_DISPLAY_DECIMALS = 15;
const rf = (value: bigint) => `${formatGameAmount(value, RF_DISPLAY_DECIMALS)} RF`;
type Phase = "loading" | "title" | "playing" | "failed";
type Modal = "caskets" | "map" | "card" | "cards" | "help" | "feedback" | null;
type XpDrop = { id: number; skill: Skill; amount: number; at: number };
type CasketResult = { play: bigint; outcomeId: number; wardrobe: string | null; coins: number; redeemed: boolean };
const CANONICAL = new Map<number, GenerationSprites>(REGULAR_SPRITES.map(sprites => [Number(sprites.tokenId), sprites]));
/** WASD walks in screen directions; the arrow keys turn and tilt the camera. */
const KEY_DIRECTIONS: Record<string, [number, number]> = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
const CAMERA_KEYS = new Set(["arrowleft", "arrowright", "arrowup", "arrowdown"]);
const TURN_SPEED = 1.9, TILT_SPEED = 0.45;
/** The camera angle that puts world north at the top of the screen (the compass). */
const NORTH = -Math.PI / 4;
/** A Realm day lasts 24 minutes. Automated test runs stay at noon unless they set the time. */
const DAY_MS = 24 * 60_000;
let fixedTime: number | null = typeof navigator !== "undefined" && navigator.webdriver ? 0.5 : null;
/** Weather from the real clock (tests stay clear unless they set one). */
/** The world boss's clock: the real one, except in automated runs, where a test sets it (null: no boss). */
let bossClock: (() => number) | null = typeof navigator !== "undefined" && navigator.webdriver ? null : () => Date.now();
/** How long drawing a frame takes (a rolling average, ms), and the real frame interval (for the performance check). */
const perf = { ms: 0, frames: 0, interval: 16.7, lastFrame: 0 };
/**
 * Graphics are High unless you choose Low in Settings (they never change by themselves; an old "auto" setting is High).
 * Canvas pixels per CSS pixel: Low draws at 1×, High at up to 1.5× on high-DPI screens (the pixel art is scaled up
 * crisply either way, and 1.5× has about half the pixels of 2× to light and shade).
 */
const isLow = (settings: Settings) => settings.graphics === "low";
/** High's resolution, lowered when the machine can't keep up (see adaptive.ts). */
const adaptive = newAdaptive();
let fixedWeather: Weather | null = typeof navigator !== "undefined" && navigator.webdriver ? { rain: 0, storm: false, fog: 0 } : null;
let lastThunder = -1;
const timeOfDay = () => fixedTime ?? ((Date.now() / DAY_MS + 0.3) % 1);
const DEFAULT_SETTINGS: Settings = { music: true, sfx: true, musicVolume: 0.7, sfxVolume: 0.8, zoom: 0.8, shiftDrop: false, autoMusic: true, dayNight: true };
/** Settings are kept in this browser (so High stays High next time); anything missing or odd falls back to the default. */
const SETTINGS_KEY = "realm-settings";
function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
    const flag = (key: keyof Settings) => typeof raw[key] === "boolean" ? raw[key] as boolean : DEFAULT_SETTINGS[key] as boolean;
    const unit = (key: "musicVolume" | "sfxVolume") => typeof raw[key] === "number" && Number.isFinite(raw[key]) ? Math.max(0, Math.min(1, raw[key] as number)) : DEFAULT_SETTINGS[key];
    return {
      music: flag("music"), sfx: flag("sfx"), musicVolume: unit("musicVolume"), sfxVolume: unit("sfxVolume"), shiftDrop: flag("shiftDrop"), autoMusic: flag("autoMusic"),
      zoom: typeof raw.zoom === "number" && Number.isFinite(raw.zoom) ? Math.max(ZOOM.min, Math.min(ZOOM.max, raw.zoom)) : DEFAULT_SETTINGS.zoom,
      dayNight: typeof raw.dayNight === "boolean" ? raw.dayNight : true, weather: typeof raw.weather === "boolean" ? raw.weather : undefined,
      graphics: raw.graphics === "low" ? "low" : "high",
      friendSpeech: (["full", "reduced", "rare", "off"] as const).find(level => level === raw.friendSpeech) ?? "full",
      nameplates: (["full", "name", "off"] as const).find(level => level === raw.nameplates) ?? "full",
    };
  } catch { return DEFAULT_SETTINGS; }
}
function saveSettings(settings: Settings) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage blocked: settings last for this visit */ } }

/** RareFriends Realm. The SDK runtime supplies wallet connection, the verified owned Friend and the fixed (simulated) RF client. */
export default function RareFriendsRealm({ friendId, client, paused }: GameComponentProps) {
  const root = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), minimap = useRef<HTMLCanvasElement>(null);
  /** The GPU's canvas, under the top one (gl.ts), and its renderer (null without WebGL2: the canvas renderer draws alone). */
  const glCanvas = useRef<HTMLCanvasElement>(null), glr = useRef<RealmGL | null | undefined>(undefined);
  const game = useRef<Game | null>(null), friend = useRef<GenerationSprites | null>(null), audio = useRef<RealmAudio | null>(null);
  const followerSprites = useRef(new Map<number, GenerationSprites>()), loadingSprites = useRef(new Set<number>());
  const camera = useRef<Camera>({ x: mainlandToWorld(121, 121)[0], y: mainlandToWorld(121, 121)[1], zoom: DEFAULT_SETTINGS.zoom, angle: 0, pitch: PITCH.classic }), cameraGoal = useRef<{ angle: number; pitch: number } | null>(null),
    compass = useRef<HTMLButtonElement>(null), orbit = useRef<{ x: number; y: number; angle: number; pitch: number } | null>(null), miniZoom = useRef(3.2), tickAt = useRef(0), hits = useRef<HitSplat[]>([]), fireworks = useRef<Firework[]>([]);
  const projectiles = useRef<Projectile[]>([]), marker = useRef<ClickMarker | null>(null), hoverTile = useRef<{ x: number; y: number } | null>(null), chat = useRef<{ text: string; until: number } | null>(null);
  const held = useRef(new Set<string>()), linked = useRef(false), elsewhere = useRef(false), lastSave = useRef(""), region = useRef(""), epoch = useRef(0), pointer = useRef<{ x: number; y: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("loading"), [status, setStatus] = useState("Waking your Friend and unfolding the Realm…");
  const [, setVersion] = useState(0), [tab, setTab] = useState<Tab>("inventory"), [selection, setSelection] = useState<Selection>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entries: MenuEntry[] } | null>(null), [modal, setModal] = useState<Modal>(null);
  /** The daily popup's open tab (null when closed). */
  const [dailyTab, setDailyTab] = useState<DailyTab | null>(null);
  const [hover, setHover] = useState(""), [toast, setToast] = useState<{ title: string; sub?: string } | null>(null), [drops, setDrops] = useState<XpDrop[]>([]);
  const [levelUps, setLevelUps] = useState<{ skill: Skill; level: number }[]>([]), [quest, setQuest] = useState<string | null>(null), [dead, setDead] = useState(false);
  const [settings, setSettingsState] = useState<Settings>(loadSettings), [roster, setRoster] = useState<OwnedFriend[]>([]), [rosterState, setRosterState] = useState<"waiting" | "ready" | "none">("waiting");
  const [hosted, setHosted] = useState<"waiting" | "linked" | "none" | "elsewhere">("waiting"), [hasSave, setHasSave] = useState<{ total: number; combat: number; qp: number; where: string } | null>(null);
  const [tailorPick, setTailorPick] = useState(""), [backupStatus, setBackupStatus] = useState(""), [guide, setGuide] = useState<{ skill: Skill | null } | null>(null);
  // Playing together: other players (from the host), who you're following, and a whisper to start in the chat box.
  const players = useRef(new Players()), following = useRef<number | null>(null);
  // Trades, and other players' drops we've asked to take (owner:uid) or are walking to.
  const sendAct = (to: number, act: Act) => window.parent.postMessage({ type: NET_ACT, to, act }, "*");
  const party = useRef(new Party(sendAct, id => players.current.name(id))), trades = useRef(new Trades(sendAct)), asked = useRef(new Set<string>()), walkingTo = useRef<{ owner: number; u: number; x: number; y: number } | null>(null);
  const [netState, setNetState] = useState<NetState>(players.current.state), [whisper, setWhisper] = useState<{ text: string; at: number } | null>(null);
  const lastMinimapPoint = useRef<React.MouseEvent<HTMLCanvasElement> | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null), [busy, setBusy] = useState(false), [casketError, setCasketError] = useState(""), [reveal, setReveal] = useState<CasketResult[] | null>(null);
  const [size, setSize] = useState({ width: 960, height: 640, scale: 1 }), [sideOpen, setSideOpen] = useState(true), [fullscreen, setFullscreen] = useState(false), [pip, setPip] = useState(false), [shareStatus, setShareStatus] = useState(""), [feedbackStatus, setFeedbackStatus] = useState(""), [cardUrl, setCardUrl] = useState<string | null>(null);
  const pendingSave = useRef<unknown>(null), cardBlob = useRef<Blob | null>(null), resizeRef = useRef<() => void>(() => {}), saveNow = useRef<(claim?: boolean) => void>(() => {});
  /** Logged out: back on the title screen with the adventure saved. */
  const [loggedOut, setLoggedOut] = useState(false);
  const live = useRef({ paused, phase, modal, menu, selection, settings }); live.current = { paused, phase, modal, menu, selection, settings };
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  /** Fireworks over a point (a level-up), with a pop for each burst; and the peers' level-ups already celebrated. */
  /** A duel in the sparring ring: who you're fighting and when you swing next; who you last dueled; their last hit on you. */
  const duel = useRef<{ target: number; nextSwing: number } | null>(null), lastDuel = useRef<{ with: number; at: number } | null>(null), duelHits = useRef(new Map<number, number>());
  const peerEmotes = useRef(new Map<number, string | null>()), achievementsChecked = useRef(false);
  const celebrated = useRef(new Set<string>()), peerSpots = useRef(new Map<number, { x: number; y: number }>());
  const celebrate = (x: number, y: number, colors: readonly string[]) => {
    const world = game.current?.world;
    if (!world) return;
    for (const delay of launchFireworks(world, x, y, colors)) window.setTimeout(() => audio.current?.sfx("pop", 0.8), delay * 1000);
  };

  // ---------- Layout: a logical stage scaled to fit the frame ----------
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth || 960, height = node.clientHeight || 640;
      // A fixed 960 × 640 stage (the SDK's viewport), scaled to fit the frame and centred in it.
      const scale = Math.min(width / 960, height / 640);
      const logical = { width: 960, height: 640, scale };
      VIEW.width = logical.width; VIEW.height = logical.height; setSize(logical); setSideOpen(logical.width >= 900 || logical.height >= 560);
      const view = canvas.current;
      // Low graphics draws at one pixel per CSS pixel (a sharp screen at 2× costs four times the pixels).
      const low = isLow(live.current.settings);
      if (view) { const ratio = low ? 1 : Math.min(window.devicePixelRatio || 1, adaptive.cap); view.width = Math.round(logical.width * scale * ratio); view.height = Math.round(logical.height * scale * ratio); }
      if (view && glCanvas.current) { glCanvas.current.width = view.width; glCanvas.current.height = view.height; }
    };
    const observer = new ResizeObserver(measure); observer.observe(node); measure(); resizeRef.current = measure;
    return () => observer.disconnect();
  }, [phase, settings.graphics]);

  // ---------- Audio ----------
  const setSettings = useCallback((next: Settings) => {
    if (next.autoMusic && !live.current.settings.autoMusic) region.current = ""; // back to the area's own track on the next tick
    // Choosing a graphics level yourself: Auto measures afresh, and High or Low never change on their own.
    setSettingsState(next); saveSettings(next); camera.current.zoom = next.zoom;
    const player = audio.current;
    if (player) { player.setMusic(next.music); player.setSfx(next.sfx); player.setVolumes(next.musicVolume, next.sfxVolume); player.unlock(); }
  }, []);
  useEffect(() => {
    const wake = () => {
      const player = audio.current, s = live.current.settings;
      if (!player) return;
      const was = player.ready; player.setMusic(s.music); player.setSfx(s.sfx); player.setVolumes(s.musicVolume, s.sfxVolume); player.unlock();
      if (!was) setTimeout(() => setVersion(value => value + 1), 150);
    };
    const events = ["pointerup", "click", "keydown", "touchend"] as const;
    for (const name of events) window.addEventListener(name, wake, { capture: true, passive: true });
    return () => { for (const name of events) window.removeEventListener(name, wake, { capture: true }); };
  }, []);

  // ---------- Load: canonical artwork, the world, the host link ----------
  useEffect(() => {
    const version = ++epoch.current;
    audio.current?.dispose(); audio.current = new RealmAudio(); audio.current.play("theme");
    setPhase("loading"); setStatus("Waking your Friend and unfolding the Realm…"); setHosted("waiting"); setHasSave(null); setRoster([]); setRosterState("waiting");
    linked.current = false; elsewhere.current = false; lastSave.current = ""; pendingSave.current = null; followerSprites.current = new Map(); game.current = null; friend.current = null;
    const applyHost = (data: { ids?: unknown; save?: unknown }) => {
      const state = game.current, parsed = parseRoster(data.ids, friendId);
      if (!state || parsed === null) return;
      setRoster(parsed.others); setRosterState(parsed.others.length ? "ready" : "none");
      if (state.player.follower !== null) { const follower = parsed.others.find(entry => entry.id === state.player.follower); setFollower(state, follower ?? null); if (follower) loadFriendSprite(follower.id); }
      if (!linked.current) {
        linked.current = true; setHosted("linked");
        if (data.save && (live.current.phase !== "playing" || state.playTicks < 100)) {
          const probe = createGame({ familyId: state.player.familyId, friendId: Number(friendId) });
          if (restore(probe, data.save)) {
            restore(state, data.save);
            setHasSave({ total: totalLevel(state.player), combat: combatLevel(state.player), qp: questPoints(state), where: regionAt(state.world, state.player.x, state.player.y).name });
            if (live.current.phase === "playing") { message(state, "Welcome back! This wallet's adventure has been restored.", "info"); const at = realPoint(state.world, state.player.x, state.player.y); camera.current.x = at.x; camera.current.y = at.y; }
          }
        }
      }
      refresh();
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (event.data?.type === FULLSCREEN_STATE) { setFullscreen(event.data.on === true); return; }
      if (event.data?.type === TEXT_COPY_RESULT) { setShareStatus(event.data.result === "copied" ? "Post text copied." : "Couldn't copy from this browser."); return; }
      if (event.data?.type === JOIN_INVITE) {
        // A fellowship invitation in the link you arrived by: ask once the adventure is up.
        const invite = parseInvite(event.data.token), state = game.current;
        if (invite && state && state.player.fellowship?.tag !== invite.tag) { state.ui.join = invite; refresh(); }
        return;
      }
      if (event.data?.type === FEEDBACK_RESULT) {
        const messages: Record<string, string> = { both: "Thank you! Your issue is open on GitHub (press Submit new issue there) and your post is ready on X (press Post).", github: "Thank you! Your issue is open on GitHub: press Submit new issue there.",
          x: "Thank you! Your post is ready on X: press Post.", "x-blocked": "Your issue is open on GitHub (press Submit new issue there). Your browser held back the X tab: press X only to post it too.", failed: "Your browser blocked the new tab. Allow pop-ups for the Realm and try again." };
        setFeedbackStatus(messages[event.data.result as string] ?? messages.failed); return;
      }
      if (event.data?.type === SHARE_RESULT) {
        const messages: Record<ShareOutcome, string> = {
          shared: "Shared! Pick X in your share sheet to post it.", cancelled: "Share cancelled.", failed: "Couldn't share from this browser. Try Save picture.",
          "copied-and-opened": "Picture copied and X opened: paste it into your post (Ctrl/Cmd+V), then press Post.",
          "saved-and-opened": "Picture saved and X opened: attach it to your post, then press Post.", copied: "Adventurer card copied as a picture.", saved: "Adventurer card saved as a picture.",
        };
        setShareStatus(messages[event.data.result as ShareOutcome] ?? messages.failed); return;
      }
      // A newer tab took over this Friend's saves: stop saving here, so this older adventure can't overwrite it.
      if (event.data?.type === SAVE_ELSEWHERE) {
        if (!elsewhere.current) { elsewhere.current = true; setHosted("elsewhere"); const state = game.current; if (state) { message(state, "This adventure is now open in another tab or window, so this one has stopped saving. Reload this page to continue here.", "info"); refresh(); } }
        return;
      }
      if (event.data?.type === SAVE_EXPORT_RESULT) {
        setBackupStatus(event.data.result === "copied" ? "Save code copied. Paste it somewhere safe (a note, an email to yourself)." : event.data.result === "saved" ? "Save file downloaded. Keep it somewhere safe." : "Couldn't copy from this browser. Try Download save file.");
        return;
      }
      if (event.data?.type === NET_STATE) {
        // Checked again here (the host already has): only well-formed players, at most 60.
        const d = event.data as Record<string, unknown>, ids = (list: unknown) => Array.isArray(list) ? list.map(cleanId).filter((id): id is number => id !== null) : [];
        const peers = (Array.isArray(d.peers) ? d.peers : []).map(cleanPresence).filter((p): p is Presence => !!p).slice(0, 60);
        const status = d.status === "online" || d.status === "connecting" ? d.status : "offline", was = players.current.state.status;
        const next: NetState = { status, peers, friends: ids(d.friends), ignored: ids(d.ignored), players: typeof d.players === "number" ? Math.max(0, Math.min(999, Math.floor(d.players))) : peers.length,
          paths: (() => { const p = d.paths as { relays?: unknown; direct?: unknown } | undefined, n = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(99, Math.floor(v))) : 0; return p && typeof p === "object" ? { relays: n(p.relays), direct: n(p.direct) } : undefined; })() };
        players.current.update(next, performance.now()); setNetState(next);
        // Other players' steps leave prints in snow and sand too.
        for (const peer of peers) {
          const last = peerSpots.current.get(peer.id);
          if (last && (last.x !== peer.x || last.y !== peer.y) && game.current && Math.abs(peer.x - game.current.player.x) + Math.abs(peer.y - game.current.player.y) < 30) stepMarks(game.current.world, last, peer, !!peer.mount, reducedMotion);
          peerSpots.current.set(peer.id, { x: peer.x, y: peer.y });
        }
        // A friend near you starts an emote: if you're standing idle, your Friend joins in.
        for (const peer of peers) {
          const before = peerEmotes.current.get(peer.id) ?? null, state = game.current;
          peerEmotes.current.set(peer.id, peer.emote);
          if (!peer.emote || peer.emote === before || !state || !next.friends.includes(peer.id)) continue;
          const me = state.player, idle = !me.path.length && !me.activity && me.combat === null && !(me.emote && state.tick < me.emote.until) && !duel.current;
          if (idle && Math.max(Math.abs(peer.x - me.x), Math.abs(peer.y - me.y)) <= 6 && !emoteProblem(state, peer.emote)) { performEmote(state, peer.emote); message(state, `You join in with ${players.current.name(peer.id)}!`); }
        }
        // Other players' level-ups: their fireworks go up over them, once each.
        for (const peer of peers) if (peer.celebrate && !celebrated.current.has(`${peer.id}:${peer.celebrate}`)) {
          celebrated.current.add(`${peer.id}:${peer.celebrate}`);
          if (game.current && Math.max(Math.abs(peer.x - game.current.player.x), Math.abs(peer.y - game.current.player.y)) <= 20 && !reducedMotion) celebrate(peer.x, peer.y, SKILL_COLORS[peer.celebrate.replace(/_\d+$/, "") as Skill] ?? ["#e2d7ad", "#d8b6b4"]);
        }
        for (const peer of peers.slice(0, 30)) loadFriendSpriteRef.current?.(peer.id);
        if (game.current && was !== "online" && status === "online") message(game.current, "You're online: other players in the Realm can see your Friend and your public chat.", "info");
        return;
      }
      if (event.data?.type === NET_ACT_IN) {
        const from = cleanId(event.data.from), act = cleanAct(event.data.act), state = game.current;
        if (from === null || !act || !state) return;
        if (act.kind.startsWith("trade")) trades.current.receive(state, from, act, performance.now());
        else if (act.kind.startsWith("party")) party.current.receive(state, from, act, performance.now());
        else if (act.kind === "take" && act.u !== undefined) {
          // Someone wants something we dropped: first come, first served.
          const index = state.ground.findIndex(entry => entry.shared && entry.uid === act.u);
          if (index < 0) sendAct(from, { kind: "gone", u: act.u });
          else { const [entry] = state.ground.splice(index, 1); sendAct(from, { kind: "give", u: entry.uid, id: entry.id, n: entry.n }); }
        } else if (act.kind === "give" && act.u !== undefined && act.id && act.n && asked.current.delete(`${from}:${act.u}`) && isItem(act.id) && item(act.id).tradeable !== false) {
          giveOrDrop(state, act.id, act.n); message(state, `You pick up ${act.n > 1 ? `${act.n.toLocaleString()} × ` : ""}${item(act.id).name.toLowerCase()} (dropped by Friend #${from}).`);
          audio.current?.sfx("pickup");
        } else if (act.kind === "duel-hit" && act.n !== undefined) {
          // A duel hit: only inside the ring, at most one every two ticks from each player, and capped.
          const them = players.current.state.peers.find(peer => peer.id === from), last = duelHits.current.get(from) ?? -99;
          if (!them || !duelAllowed(state, them) || state.tick - last < 2) return;
          duelHits.current.set(from, state.tick); lastDuel.current = { with: from, at: performance.now() };
          const result = takeDuelHit(state, from, act.n);
          if (result === "lost") { sendAct(from, { kind: "duel-won", u: state.tick }); duel.current = null; }
          else if (!duel.current && state.autoRetaliate) duel.current = { target: from, nextSwing: state.tick + 1 };
          refresh();
        } else if (act.kind === "duel-won") {
          if (lastDuel.current?.with === from && performance.now() - lastDuel.current.at < 30_000) {
            wonDuel(state, from); duel.current = null; lastDuel.current = null;
            if (!reducedMotion) celebrate(state.player.x, state.player.y, ["#e2c46a", "#cf6e6e", "#ffffff"]);
          }
          refresh();
        } else if (act.kind === "gone" && act.u !== undefined && asked.current.delete(`${from}:${act.u}`)) message(state, "Too late: someone else took it.");
        refresh(); return;
      }
      if (event.data?.type === NET_CHAT_IN) {
        const from = cleanId(event.data.from), text = cleanChat(event.data.text), state = game.current;
        if (from === null || !text || !state) return;
        const whispered = event.data.private === true;
        message(state, `${whispered ? "From " : ""}${players.current.name(from)}: ${text}`, whispered ? "private" : "public");
        if (!whispered) players.current.say(from, text, performance.now());
        refresh(); return;
      }
      if (event.data?.type !== HOST_STATE) return;
      if (game.current) applyHost(event.data); else pendingSave.current = event.data;
    };
    window.addEventListener("message", receive);
    const hostTimer = setTimeout(() => { if (!linked.current && version === epoch.current) { setHosted("none"); setRosterState("none"); } }, 3500);
    void Promise.all([createFriendReader().read(friendId), client.read()]).then(([sprites, value]) => {
      if (version !== epoch.current) return;
      friend.current = sprites;
      const state = createGame({ familyId: sprites.familyId, friendId: Number(friendId) });
      game.current = state; camera.current = { x: state.world.places.spawn.x, y: state.world.places.spawn.y, zoom: live.current.settings.zoom, angle: 0, pitch: PITCH.classic };
      setRelics(state, value.inventory.map(amount => Number(amount > 99n ? 99n : amount))); setSnapshot(value);
      setPhase("title");
      // Automated browser tests only (navigator.webdriver): a handle for driving the camera and state.
      if (navigator.webdriver) (window as unknown as { __realm?: unknown }).__realm = {
        game: () => game.current, camera: () => ({ ...camera.current }), refresh: () => refresh(),
        /** Other players as drawn now, and whether we're online. */
        peers: () => players.current.view(performance.now()).map(peer => ({ id: peer.p.id, x: peer.p.x, y: peer.p.y, friend: peer.friend, said: peer.said, emote: peer.p.emote })), net: () => players.current.state.status,
        drops: () => players.current.drops(),
        takeDrop: (index: number) => { const drop = players.current.drops()[index]; if (drop) { walkingTo.current = { owner: drop.owner, u: drop.u, x: drop.x, y: drop.y }; } },
        /** Fix the time of day (0 midnight … 0.5 noon), or null to follow the clock. */
        time: (value: number | null) => { fixedTime = value; },
        /** Fix the weather ({ rain, storm, fog }), or null to follow the clock. */
        weather: (value: Weather | null) => { fixedWeather = value; },
        fireworks: () => { const state = game.current; if (state) celebrate(state.player.x, state.player.y, ["#e7a9b0", "#ebc26b", "#9fc6f0", "#b4d4a0"]); },
        graphics: (level: "auto" | "high" | "low") => setSettings({ ...live.current.settings, graphics: level === "low" ? "low" : "high" }),
        /** How much your Friend talks (recordings keep it quiet). */
        speech: (level: "full" | "reduced" | "rare" | "off") => setSettings({ ...live.current.settings, friendSpeech: level }),
        perf: () => ({ ms: Math.round(perf.ms * 100) / 100, fps: Math.round(1000 / perf.interval), quads: textureStats.last, parts: Object.fromEntries(Object.entries(RENDER_PROFILE).map(([k, v]) => [k, Math.round(v * 10) / 10])), low: isLow(live.current.settings), scale: canvas.current ? Math.round(canvas.current.width / canvas.current.getBoundingClientRect().width * 100) / 100 : 0, cap: adaptive.cap }),
        boss: (ms: number | null) => { bossClock = ms === null ? null : () => ms; const state = game.current; if (state && ms !== null) { updateWorldBoss(state, ms); refresh(); } },
        view: (zoom: number, pitch: number, angle = 0) => { setSettings({ ...live.current.settings, zoom }); camera.current.pitch = pitch; camera.current.angle = angle; cameraGoal.current = null; },
        screenOf: (x: number, y: number) => {
          const view = canvas.current!.getBoundingClientRect(), point = toScreen(camera.current, x, y);
          return { x: view.left + point.x * view.width / VIEW.width, y: view.top + point.y * view.height / VIEW.height };
        },
      };
      if (pendingSave.current) { applyHost(pendingSave.current as { ids?: unknown; save?: unknown }); pendingSave.current = null; }
      window.parent.postMessage({ type: HOST_HELLO, friend: friendId.toString() }, "*");
    }).catch(() => { if (version === epoch.current) { setPhase("failed"); setStatus("Your Friend's artwork couldn't be loaded. Check your connection and try again."); } });
    return () => { clearTimeout(hostTimer); window.removeEventListener("message", receive); audio.current?.dispose(); audio.current = null; };
  }, [friendId, client]);

  const loadFriendSpriteRef = useRef<((id: number) => void) | null>(null);
  const loadFriendSprite = useCallback((id: number) => {
    if (followerSprites.current.has(id) || loadingSprites.current.has(id)) return;
    loadingSprites.current.add(id);
    const version = epoch.current;
    void createFriendReader().read(BigInt(id)).then(sprites => { if (version === epoch.current) { followerSprites.current.set(id, sprites); refresh(); } })
      .catch(() => { /* Keep the stand-in art. */ }).finally(() => loadingSprites.current.delete(id));
  }, [refresh]);
  loadFriendSpriteRef.current = loadFriendSprite;

  // ---------- Saving (through the trusted host, per wallet) ----------
  useEffect(() => {
    // A claim (after restoring a save code) saves at once and takes this Friend's saves back from any other tab.
    const save = (claim?: unknown) => {
      const state = game.current, claiming = claim === true;
      if (!state || !linked.current || (elsewhere.current && !claiming) || live.current.phase !== "playing") return;
      const data = serialize(state), raw = JSON.stringify(data);
      if (raw === lastSave.current && !claiming) return;
      if (elsewhere.current) { elsewhere.current = false; setHosted("linked"); }
      lastSave.current = raw; window.parent.postMessage({ type: SAVE_WRITE, friend: friendId.toString(), save: data, ...(claiming ? { claim: true } : {}) }, "*");
    };
    saveNow.current = save;
    const timer = setInterval(save, 5000);
    window.addEventListener("pagehide", save);
    return () => { clearInterval(timer); window.removeEventListener("pagehide", save); save(); };
  }, [friendId]);

  // ---------- The loop: game ticks, events, camera, drawing ----------
  useEffect(() => {
    if (phase !== "title" && phase !== "playing") return;
    // The frame is opaque (the sky or the dark is painted under everything), which is cheaper to put on screen.
    // WebGL first: with it, the top canvas is see-through (names and bars over the GPU's picture); without it, opaque.
    if (glr.current === undefined) glr.current = glCanvas.current ? RealmGL.create(glCanvas.current, navigator.webdriver) : null;
    const gpu = glr.current, node = canvas.current, ctx = node?.getContext("2d", { alpha: !!gpu }), mini = minimap.current?.getContext("2d");
    if (!node || !ctx) return;
    // The world's layer for the GPU to lay over its picture (everything the canvas renderer still draws), off screen.
    const layer = gpu ? document.createElement("canvas") : null, layerCtx = layer?.getContext("2d") ?? null;
    let frame = 0, lastHud = 0, dropId = 0, lastFrame = 0, lastAdapt = 0;
    tickAt.current = performance.now();
    const loop = (now: number, viaTimer = false) => {
      if (!viaTimer) frame = requestAnimationFrame(loop);
      const state = game.current;
      if (!state) return;
      const { paused: isPaused, phase: current } = live.current;
      if (current === "playing" && !isPaused) {
        if (now - tickAt.current > TICK_MS * 6) tickAt.current = now - TICK_MS;
        while (now - tickAt.current >= TICK_MS) {
          const guideBefore = state.player.guide;
          tick(state); tickAt.current += TICK_MS;
          if (state.player.guide !== guideBefore) { refresh(); if (state.player.guide === FIRST_STEPS.length && !reducedMotion) celebrate(state.player.x, state.player.y, ["#f2d56b", "#e7a9b0", "#9fc6f0", "#b4d4a0"]); }
          if (state.tick % 50 === 0) rollDaily(state, Date.now()); // a new UTC day brings new challenges
          if (state.tick % 10 === 0 && bossClock) updateWorldBoss(state, bossClock());
          if (state.tick % 10 === 5) {
            // Achievements: the first check after you arrive catches up quietly; later ones celebrate.
            const earned = checkAchievements(state, Date.now(), !achievementsChecked.current); achievementsChecked.current = true;
            if (earned.length && !reducedMotion && earned.length < 4) celebrate(state.player.x, state.player.y, ["#f2d56b", "#e2c46a", "#ffffff"]);
          }
          if (state.tick % 25 === 0 && players.current.state.peers.length) notePlayers(state, players.current.state.peers, Date.now());
          // A duel: close in, then swing on your weapon's speed; the other game applies the hit.
          if (duel.current) {
            const them = players.current.state.peers.find(peer => peer.id === duel.current!.target), me = state.player;
            if (!them || !duelAllowed(state, them)) { if (them) message(state, "The duel is off: you both need to be inside the ring."); duel.current = null; }
            else {
              const far = Math.max(Math.abs(them.x - me.x), Math.abs(them.y - me.y)), reach = duelReach(state);
              if (far === 0) { if (!me.path.length) walkTo(state, them.x + 1, them.y); }
              else if (far > reach) { if (!me.path.length) walkTo(state, them.x, them.y); }
              else {
                me.path = []; me.heading = { x: Math.sign(them.x - me.x), y: Math.sign(them.y - me.y) };
                if (state.tick >= duel.current.nextSwing) {
                  const damage = duelStrike(state, them.combat);
                  sendAct(them.id, { kind: "duel-hit", n: damage, u: state.tick }); lastDuel.current = { with: them.id, at: performance.now() };
                  hits.current.push({ on: "peer", uid: them.id, damage: damage || -1, at: performance.now() });
                  audio.current?.sfx(damage ? "hit" : "miss"); duel.current.nextSwing = state.tick + attackSpeed(me);
                }
              }
            }
          }
          // Playing together: tell the others where we are, follow whoever we're following, and count friends nearby.
          if (players.current.state.status !== "offline") window.parent.postMessage({ type: NET_PRESENCE, presence: presenceOf(state) }, "*");
          state.player.nearFriends = players.current.nearFriends(state);
          if (state.player.fellowship && state.tick % 10 === 0) { const tag = state.player.fellowship.tag, day = Math.floor(Date.now() / 86_400_000), seen = state.player.fellowship.seen ?? (state.player.fellowship.seen = {}); for (const peer of players.current.state.peers) if (peer.tag === tag) seen[peer.id] = day; }
          { const peers = players.current.state.peers, tag = state.player.fellowship?.tag ?? null; state.player.nearParty = nearby(state, peers, peer => party.current.members.has(peer.id), PARTY_RANGE); state.player.nearFellows = tag ? nearby(state, peers, peer => peer.tag === tag && !party.current.members.has(peer.id), FELLOW_RANGE) : 0; party.current.tidy(performance.now()); }
          // Shared fights: other players' hits on the same monsters (near us, on our layer) count here too.
          // Referrals: a player who used our code is online with us.
          for (const peer of players.current.state.peers) if (peer.referredBy === state.player.friendId) creditReferral(state, peer.id);
          for (const peer of players.current.state.peers) if (peer.fight && Math.max(Math.abs(peer.x - state.player.x), Math.abs(peer.y - state.player.y)) <= 24) syncMonster(state, peer.fight, peer.id);
          trades.current.tick(now);
          const target = walkingTo.current;
          if (target && Math.max(Math.abs(target.x - state.player.x), Math.abs(target.y - state.player.y)) <= 0) {
            walkingTo.current = null;
            if (players.current.drops().some(drop => drop.owner === target.owner && drop.u === target.u)) { asked.current.add(`${target.owner}:${target.u}`); sendAct(target.owner, { kind: "take", u: target.u }); }
            else message(state, "It's gone.");
          }
          if (following.current !== null) {
            const them = players.current.get(following.current);
            if (!them) { message(state, "They've gone out of sight."); following.current = null; }
            else if (Math.max(Math.abs(them.x - state.player.x), Math.abs(them.y - state.player.y)) > 1 && !state.player.path.length) walkTo(state, them.x - them.hx, them.y - them.hy);
          }
          const fresh = state.events.splice(0);
          const xp = new Map<Skill, number>();
          for (const event of fresh) {
            if (event.type === "hit") hits.current.push({ on: event.on, uid: event.uid, damage: event.damage, at: now });
            else if (event.type === "xp") xp.set(event.skill, (xp.get(event.skill) ?? 0) + event.amount);
            else if (event.type === "level") {
              setLevelUps(list => [...list, { skill: event.skill, level: event.level }]); fireworks.current.push({ at: now, color: "#e2d7ad" });
              if (!reducedMotion) celebrate(state.player.x, state.player.y, SKILL_COLORS[event.skill]);
            }
            else if (event.type === "sound") audio.current?.sfx(event.name);
            else if (event.type === "swing") audio.current?.sfx(event.weapon);
            else if (event.type === "creature") audio.current?.creature(event.id, event.action, nearness(state, event.x, event.y));
            else if (event.type === "projectile") projectiles.current.push(event.projectile);
            else if (event.type === "death") { setDead(true); setTimeout(() => setDead(false), 2600); }
            else if (event.type === "quest") setQuest(event.quest);
            else if (event.type === "friend") { chat.current = { text: event.text, until: performance.now() + 4000 }; if (event.share && players.current.state.status === "online") window.parent.postMessage({ type: NET_CHAT, text: event.text }, "*"); }
          }
          if (xp.size) setDrops(list => [...list.filter(drop => now - drop.at < 1800), ...[...xp].map(([skill, amount]) => ({ id: ++dropId, skill, amount, at: now }))]);
          hits.current = hits.current.filter(hit => now - hit.at < 1300); projectiles.current = projectiles.current.filter(p => p.end >= state.tick - 1);
          fireworks.current = fireworks.current.filter(entry => now - entry.at < 2400);
          // Area music and the region banner.
          const here = regionAt(state.world, state.player.x, state.player.y), throne = state.player.x >= THRONE.x && state.player.y >= THRONE.y0 && state.player.y <= THRONE.y1;
          const key = `${here.id}:${throne}`;
          if (key !== region.current) {
            region.current = key;
            const track = trackById(trackFor(here.id, throne));
            unlockMusic(state, track.id, track.name);
            if (live.current.settings.autoMusic) audio.current?.play(track.id);
            setToast({ title: throne ? "The Throne Room" : here.name, sub: trackById(trackFor(here.id, throne)).name });
          }
          // Footsteps on whatever is underfoot (two when running).
          if (state.player.moved === state.tick) {
            const step = stepSound(state), strides = Math.max(Math.abs(state.player.x - state.player.prev.x), Math.abs(state.player.y - state.player.prev.y));
            // Riding: a clip-clop for every tile the mount covers (three a tick at a unicorn's canter).
            if (state.player.mount) for (let i = 0; i < strides; i++) setTimeout(() => audio.current?.sfx("hoof", 0.9), (TICK_MS / strides) * i);
            else { audio.current?.sfx(step, 0.8); if (strides > 1) setTimeout(() => audio.current?.sfx(step, 0.8), TICK_MS / 2); }
            stepMarks(state.world, state.player.prev, state.player, !!state.player.mount, reducedMotion);
          }
          ambience(state);
          // Held keys walk, turned to match the camera.
          setHeld(state, heldDirection(held.current, camera.current.angle));
          refresh();
        }
      }
      // Camera: follow the player, or drift and turn slowly over Friendhollow on the title screen.
      const player = state.player, dt = Math.min(0.05, (now - (lastFrame || now)) / 1000); lastFrame = now;
      if (current === "title") {
        const t = now / 14000; camera.current.x = 121 + Math.cos(t) * 9; camera.current.y = 118 + Math.sin(t) * 9; camera.current.zoom = 0.85;
        camera.current.angle = reducedMotion ? 0 : Math.sin(now / 21000) * 0.6; camera.current.pitch = PITCH.classic;
      } else {
        // Arrow keys turn and tilt; the compass eases back to north.
        const keys = held.current, cam = camera.current;
        if (!isPaused) {
          const turn = (keys.has("arrowright") ? 1 : 0) - (keys.has("arrowleft") ? 1 : 0), tilt = (keys.has("arrowup") ? 1 : 0) - (keys.has("arrowdown") ? 1 : 0);
          if (turn || tilt) cameraGoal.current = null;
          cam.angle += turn * TURN_SPEED * dt; cam.pitch = clampPitch(cam.pitch + tilt * TILT_SPEED * dt);
        }
        const goal = cameraGoal.current;
        if (goal) { cam.angle += (goal.angle - cam.angle) * 0.18; cam.pitch += (goal.pitch - cam.pitch) * 0.18; if (Math.abs(goal.angle - cam.angle) < 0.002 && Math.abs(goal.pitch - cam.pitch) < 0.002) { cam.angle = goal.angle; cam.pitch = goal.pitch; cameraGoal.current = null; } }
        if (compass.current) compass.current.style.transform = `rotate(${northAngle(cam) * 180 / Math.PI + 90}deg)`;
        const alpha = Math.min(1, (now - tickAt.current) / TICK_MS), moved = player.moved === state.tick;
        // Follow where you really are (upstairs, the storey's tiles stand over the building).
        const { x: tx, y: ty } = realPoint(state.world, moved ? player.prev.x + (player.x - player.prev.x) * alpha : player.x, moved ? player.prev.y + (player.y - player.prev.y) * alpha : player.y);
        camera.current.x += (tx - camera.current.x) * 0.35; camera.current.y += (ty - camera.current.y) * 0.35; camera.current.zoom = live.current.settings.zoom;
      }
      const ratio = node.width / VIEW.width;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.imageSmoothingEnabled = false;
      if (layer && layerCtx) {
        if (layer.width !== node.width || layer.height !== node.height) { layer.width = node.width; layer.height = node.height; }
        layerCtx.setTransform(ratio, 0, 0, ratio, 0, 0); layerCtx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, VIEW.width, VIEW.height);
      }
      const drawStart = performance.now();
      const step = current === "playing" ? currentStep(state) : null, guideTarget = step?.target?.(state) ?? null;
      renderScene(layerCtx ?? ctx, {
        gl: gpu, ui: layerCtx ? ctx : undefined,
        guideTarget,
        low: isLow(live.current.settings), nameplates: live.current.settings.nameplates ?? "full",
        game: state, now, tickAt: tickAt.current, camera: camera.current, friend: friend.current,
        follower: player.follower !== null ? followerSprites.current.get(player.follower) ?? null : null, canonical: CANONICAL,
        hoverTile: current === "playing" ? hoverTile.current : null, marker: marker.current, reducedMotion, hits: hits.current, fireworks: fireworks.current, chat: chat.current,
        projectiles: projectiles.current, sfx: (name, gain) => audio.current?.sfx(name as SfxName, gain),
        time: current === "playing" && live.current.settings.dayNight !== false ? timeOfDay() : null,
        ...(() => {
          if (current !== "playing" || live.current.settings.weather === false) return { weather: null, strike: null };
          const wall = Date.now(), here = regionAt(state.world, state.player.x, state.player.y).id, below = isUnderground(state.player.y);
          const weather = fixedWeather ?? weatherAt(wall, here, below, live.current.settings.dayNight !== false ? timeOfDay() : null), strike = weather.storm ? strikeAt(wall) : null;
          // What the sky is doing, for your Friend's remarks, and how much it talks.
          state.ambient = { night: live.current.settings.dayNight !== false && daylight(timeOfDay()).label === "Night", rain: weather.rain > 0.3, storm: weather.storm, fog: weather.fog > 0.4 };
          state.friendSpeech = live.current.settings.friendSpeech ?? "full";
          // Thunder follows the flash (a second or two later, as if the storm were a little way off).
          if (strike && strike.id !== lastThunder) { lastThunder = strike.id; setTimeout(() => audio.current?.sfx("thunder", 0.9), 500 + (strike.seed % 1500)); }
          return { weather, strike, wallMs: wall };
        })(),
        peers: current === "playing" ? players.current.view(now) : [], peerSprites: id => followerSprites.current.get(id) ?? null,
        peerDrops: current === "playing" ? players.current.drops() : [],
      });
      // Frame cost, for the performance check.
      const cost = performance.now() - drawStart; perf.ms = perf.frames++ ? perf.ms * 0.95 + cost * 0.05 : cost;
      // The real frame rate (it counts the GPU's work too); hitches and hidden tabs are left out.
      const gap = now - perf.lastFrame; perf.lastFrame = now;
      if (gap > 0 && gap < 250 && document.visibilityState === "visible") perf.interval = perf.interval * 0.97 + gap * 0.03;
      // Once a second, High checks it's keeping up, and draws fewer pixels if it isn't.
      if (now - lastAdapt > 1000 && document.visibilityState === "visible") {
        lastAdapt = now;
        if (!isLow(live.current.settings) && adapt(adaptive, perf.interval, perf.ms, window.devicePixelRatio || 1) !== null) resizeRef.current?.();
      }
      if (mini && current === "playing" && now - lastHud > 90) {
        lastHud = now; const size = mini.canvas.width;
        renderMinimap(mini, state, size, miniZoom.current * (size / 152), camera.current.angle, players.current.view(now), guideTarget);
      }
    };
    frame = requestAnimationFrame(loop);
    // In the background (a hidden tab) frames stop, so a picture-in-picture window keeps going on a timer instead.
    const timer = setInterval(() => { if (document.hidden && document.pictureInPictureElement) loop(performance.now(), true); }, 50);
    const stop = () => { held.current.clear(); if (game.current) setHeld(game.current, null); };
    window.addEventListener("blur", stop); document.addEventListener("visibilitychange", stop);
    return () => { cancelAnimationFrame(frame); clearInterval(timer); window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", stop); };
  }, [phase, reducedMotion, refresh]);
  useEffect(() => { if (paused && game.current) { held.current.clear(); setHeld(game.current, null); setMenu(null); } }, [paused]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3400); return () => clearTimeout(timer); }, [toast]);
  // Level-up messages step aside on their own after a few seconds, so long skilling sessions don't pile them up.
  useEffect(() => { if (!levelUps.length) return; const timer = setTimeout(() => setLevelUps(list => list.slice(1)), 6000); return () => clearTimeout(timer); }, [levelUps]);

  // ---------- Sound: distance, footsteps, the world's ambience ----------
  const ambientClock = useRef({ fire: 0, forge: 0, water: 0, wild: 4, creature: 5, rain: 0 });
  /** Called once per tick: crackling fires, the forge, water, regional wildlife and idle monster calls, all by distance. */
  const ambience = (state: Game) => {
    const player = audio.current, clock = ambientClock.current, me = state.player;
    if (!player) return;
    for (const key of Object.keys(clock) as (keyof typeof clock)[]) clock[key] -= TICK_MS / 1000;
    const nearest = (points: Iterable<{ x: number; y: number }>) => { let best = Infinity; for (const p of points) best = Math.min(best, Math.hypot(p.x - me.x, p.y - me.y)); return best; };
    if (clock.rain <= 0) {
      const wall = Date.now(), weather = live.current.settings.weather === false ? null : fixedWeather ?? weatherAt(wall, regionAt(state.world, me.x, me.y).id, isUnderground(me.y), null);
      player.setRain(weather ? weather.rain : 0);
      clock.rain = 0.6;
    }
    if (clock.fire <= 0) {
      const fires = [...state.fires, ...state.world.objects.filter(o => o.decor === "torch" && Math.abs(o.x - me.x) < 8 && Math.abs(o.y - me.y) < 8)], d = nearest(fires);
      if (d < 8) player.sfx("crackle", Math.max(0, 1 - d / 8) * (state.fires.length ? 1 : 0.5));
      clock.fire = 0.3 + Math.random() * 0.4;
    }
    if (clock.forge <= 0) {
      const d = nearest(state.world.objects.filter(o => (o.kind === "furnace" || o.kind === "range") && Math.abs(o.x - me.x) < 8 && Math.abs(o.y - me.y) < 8));
      if (d < 7) player.sfx("forge", Math.max(0, 1 - d / 7));
      clock.forge = 1.2 + Math.random();
    }
    if (clock.water <= 0) {
      let d = Infinity;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (isWater(terrainAt(state.world, me.x + dx, me.y + dy))) d = Math.min(d, Math.hypot(dx, dy));
      if (d < 5) player.sfx("water", Math.max(0, 1 - d / 5) * 0.9);
      clock.water = 2.4 + Math.random() * 1.5;
    }
    if (clock.wild <= 0) {
      const region = regionAt(state.world, me.x, me.y).id;
      const call: SfxName | null = isUnderground(me.y) ? "drip" : region === "murkmire" ? "frog" : region === "frostpeak" || region === "pale_dunes" ? "wind" : region === "glass_lake" || region === "coast" ? (Math.random() < 0.5 ? "gull" : "bird") : region === "oasis" || region === "ashen_hills" || region === "emberforge" ? null : "bird";
      if (call) player.sfx(call, 0.5 + Math.random() * 0.4);
      clock.wild = 3 + Math.random() * 6;
    }
    if (clock.creature <= 0) {
      const near = state.monsters.filter(m => !m.dead && Math.hypot(m.x - me.x, m.y - me.y) < 10);
      if (near.length) { const m = near[Math.floor(Math.random() * near.length)]; player.creature(m.def.id, "idle", nearness(state, m.x, m.y) * 0.7); }
      clock.creature = 4 + Math.random() * 5;
    }
  };

  // ---------- Input ----------
  const logicalPoint = (clientX: number, clientY: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) * VIEW.width / rect.width, y: (clientY - rect.top) * VIEW.height / rect.height };
  };
  const optionsAt = (x: number, y: number) => {
    const state = game.current!, tile = toTile(camera.current, x, y), picks = pickAt(x, y);
    const options = menuFor(state, picks.filter(pick => pick.kind !== "peer"), tile, live.current.selection);
    // Other players: Follow, Add-friend, Message, Wave, Ignore, Examine (after the first option, so a left-click still walks).
    const peers = picks.filter(pick => pick.kind === "peer").flatMap(pick => { const p = players.current.get(pick.id); return p ? [p] : []; });
    const social = peers.flatMap(p => {
      const noun = `${players.current.name(p.id)} (level-${p.combat})`, friend = players.current.isFriend(p.id);
      return [
        { verb: "Follow", noun, tone: "plain" as const, run: () => { following.current = p.id; message(state, `You follow ${players.current.name(p.id)}.`); } },
        ...(duelAllowed(state, p) ? [{ verb: "Fight", noun, tone: "monster" as const, run: () => { duel.current = { target: p.id, nextSwing: state.tick }; lastDuel.current = { with: p.id, at: performance.now() }; message(state, `You square up to Friend #${p.id}. May the best Friend win!`); audio.current?.sfx("duel"); refresh(); } }] : []),
        { verb: "Trade with", noun, tone: "plain" as const, run: () => { if (Math.max(Math.abs(p.x - state.player.x), Math.abs(p.y - state.player.y)) > 12) message(state, "You need to be closer to trade.", "warn"); else trades.current.request(state, p.id, performance.now()); refresh(); } },
        { verb: friend ? "Remove-friend" : "Add-friend", noun, tone: "plain" as const, run: () => { window.parent.postMessage({ type: NET_SOCIAL, op: friend ? "remove" : "add", id: p.id }, "*"); message(state, friend ? `${players.current.name(p.id)} removed from your friends list.` : `${players.current.name(p.id)} added to your friends list.`); } },
        { verb: "Message", noun, tone: "plain" as const, run: () => setWhisper({ text: `@${p.id} `, at: performance.now() }) },
        party.current.members.has(p.id) ? { verb: "Leave-party", noun, tone: "plain" as const, run: () => { party.current.leave(state); refresh(); } } : { verb: "Invite-to-party", noun, tone: "plain" as const, run: () => { party.current.invite(state, p.id, performance.now()); refresh(); } },
        { verb: "Wave", noun, tone: "plain" as const, run: () => { state.player.heading = { x: Math.sign(p.x - state.player.x), y: Math.sign(p.y - state.player.y) || 1 }; performEmote(state, "wave"); refresh(); } },
        { verb: "Ignore", noun, tone: "plain" as const, run: () => { window.parent.postMessage({ type: NET_SOCIAL, op: "ignore", id: p.id }, "*"); message(state, `You won't see ${players.current.name(p.id)} or their chat any more.`); } },
        { verb: "Examine", noun, tone: "plain" as const, run: () => message(state, `${players.current.name(p.id)}${p.title ? `, ${p.title}` : ""}${p.tag ? ` of [${p.tag}]` : ""}: combat level ${p.combat}, total level ${p.total}${p.region ? `, in ${p.region}` : ""}.`) },
      ];
    });
    // Other players' drops: Take.
    const dropped = picks.filter(pick => pick.kind === "pground").flatMap(pick => { const drop = players.current.drops()[pick.id]; return drop ? [drop] : []; });
    const takes = dropped.map(drop => ({ verb: "Take", noun: `${isItem(drop.id) ? item(drop.id).name : drop.id}${drop.n > 1 ? ` (${drop.n.toLocaleString()})` : ""}`, tone: "item" as const,
      run: () => { walkTo(state, drop.x, drop.y); walkingTo.current = { owner: drop.owner, u: drop.u, x: drop.x, y: drop.y }; } }));
    return [...takes, ...(options.length ? [options[0], ...social, ...options.slice(1)] : social)];
  };
  const act = (x: number, y: number) => {
    const state = game.current;
    if (!state || live.current.paused) return;
    const options = optionsAt(x, y), first = options[0], tile = toTile(camera.current, x, y);
    if (!first) return;
    if (first.verb !== "Follow") following.current = null;
    if (first.verb !== "Fight") duel.current = null;
    first.run(state);
    marker.current = { x: tile.x, y: tile.y, at: performance.now(), red: first.verb !== "Walk here" };
    if (live.current.selection) setSelection(null);
    audio.current?.sfx("click"); refresh();
  };
  const openContext = (x: number, y: number) => {
    const state = game.current;
    if (!state || live.current.paused) return;
    const tile = toTile(camera.current, x, y);
    setMenu({ x, y, entries: optionsAt(x, y).map(option => ({ verb: option.verb, noun: option.noun, tone: option.tone, run: () => {
      if (option.verb !== "Follow" && option.verb !== "Examine") following.current = null;
      if (option.verb !== "Fight" && option.verb !== "Examine") duel.current = null;
      option.run(state); marker.current = { x: tile.x, y: tile.y, at: performance.now(), red: option.verb !== "Walk here" };
      if (live.current.selection) setSelection(null); refresh();
    } })) });
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!game.current || phase !== "playing") return;
    const p = logicalPoint(event.clientX, event.clientY); pointer.current = p;
    // Middle-button drag turns (left/right) and tilts (up/down) the camera.
    if (orbit.current && event.buttons & 4) {
      const start = orbit.current; cameraGoal.current = null;
      camera.current.angle = start.angle + (p.x - start.x) * 0.009; camera.current.pitch = clampPitch(start.pitch - (p.y - start.y) * 0.0018);
      return;
    }
    hoverTile.current = toTile(camera.current, p.x, p.y);
    const options = optionsAt(p.x, p.y), first = options[0], more = options.length - 1;
    const text = first ? `${first.verb}${first.noun ? ` ${first.noun}` : ""}${more > 0 ? ` / ${more} more option${more > 1 ? "s" : ""}` : ""}` : "";
    if (text !== hover) setHover(text);
  };
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== "playing") return;
    canvas.current?.focus({ preventScroll: true });
    const p = logicalPoint(event.clientX, event.clientY);
    if (event.button === 1) { event.preventDefault(); orbit.current = { x: p.x, y: p.y, angle: camera.current.angle, pitch: camera.current.pitch }; canvas.current?.setPointerCapture(event.pointerId); return; }
    if (event.pointerType === "touch") { longPress(() => openContext(p.x, p.y)); touchStart.current = { ...p, at: performance.now() }; return; }
    if (event.button === 0) { setMenu(null); act(p.x, p.y); }
  };
  const touchStart = useRef<{ x: number; y: number; at: number } | null>(null);
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button === 1) { orbit.current = null; return; }
    if (event.pointerType !== "touch" || !touchStart.current) return;
    const start = touchStart.current; touchStart.current = null; cancelLongPress();
    if (performance.now() - start.at < 450 && !menu) act(start.x, start.y);
  };
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const state = game.current, target = event.target as HTMLElement | null;
      if (!state || live.current.phase !== "playing" || live.current.paused) return;
      if (target?.dataset.chat === "true" || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") { if (event.key === "Escape") target.blur(); return; }
      const key = event.key.toLowerCase();
      if (KEY_DIRECTIONS[key]) { held.current.add(key); setHeld(state, heldDirection(held.current, camera.current.angle)); event.preventDefault(); return; }
      if (CAMERA_KEYS.has(key)) { held.current.add(key); event.preventDefault(); return; }
      const fn = /^f(10|[1-9])$/.exec(key);
      if (fn) { setTab(TABS[Number(fn[1]) - 1].id); setSideOpen(true); event.preventDefault(); return; }
      if (key === "escape") { setMenu(null); setModal(null); setDailyTab(null); setGuide(null); setSelection(null); closeInterfaces(state); setLevelUps([]); refresh(); return; }
      if (key === " " || key === "spacebar") {
        if (live.current.phase === "playing") {
          if (levelUpsRef.current.length && !state.dialogue) setLevelUps(list => list.slice(1));
          else if (state.dialogue) { continueDialogue(state); refresh(); }
          event.preventDefault();
        }
        return;
      }
      if (/^[1-5]$/.test(key) && state.dialogue) { chooseOption(state, Number(key) - 1); refresh(); return; }
      if (key === "r") { toggleRun(state); refresh(); return; }
      if (key === "c") { toggleSneak(state); refresh(); return; }
      if (key === "h") { toggleMount(state); refresh(); return; }
      if (key === "m") { setModal(modal => modal === "map" ? null : "map"); return; }
      if (key === "enter") { (root.current?.querySelector("[data-chat]") as HTMLInputElement | null)?.focus(); event.preventDefault(); return; }
      const hot: Record<string, Tab> = { i: "inventory", k: "skills", l: "quests", p: "prayer", n: "magic", o: "equipment" };
      if (hot[key]) { setTab(hot[key]); setSideOpen(true); }
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!held.current.delete(key)) return;
      if (game.current) setHeld(game.current, heldDirection(held.current, camera.current.angle));
    };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [refresh]);
  const levelUpsRef = useRef(levelUps); levelUpsRef.current = levelUps;

  const onMinimap = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const state = game.current, node = minimap.current;
    if (!state || !node || paused) return;
    const rect = node.getBoundingClientRect(), size = node.width, scale = miniZoom.current * (size / 152);
    const { x, y } = minimapTile(state, (event.clientX - rect.left) * size / rect.width - size / 2, (event.clientY - rect.top) * size / rect.height - size / 2, scale, camera.current.angle);
    walkTo(state, x, y); marker.current = { x, y, at: performance.now(), red: false }; refresh();
  };
  const say = (text: string) => {
    const state = game.current;
    if (!state) return;
    // "/p hello" goes to your party, each member privately.
    const toParty = /^\/p(?:arty)?\s+(.+)$/i.exec(text);
    if (toParty) {
      const words = cleanChat(toParty[1]) ?? "";
      if (!words) return;
      if (!party.current.members.size) { message(state, "You're not in a party. Right-click a player to invite them.", "warn"); refresh(); return; }
      message(state, `[Party] ${playerName(state.player)}: ${words}`, "private");
      for (const id of party.current.members) if (players.current.get(id)) window.parent.postMessage({ type: NET_CHAT, text: `[Party] ${words}`, to: id }, "*");
      refresh(); return;
    }
    // "@1234 hello" whispers to Friend #1234; anything else is said out loud, to everyone near enough to see you.
    const whispered = /^@(\d{1,15})\s+(.+)$/.exec(text);
    if (whispered) {
      const to = Number(whispered[1]), words = cleanChat(whispered[2]) ?? "";
      if (!words) return;
      if (!players.current.get(to)) message(state, `${players.current.name(to)} isn't online.`, "warn");
      else { message(state, `To ${players.current.name(to)}: ${words}`, "private"); window.parent.postMessage({ type: NET_CHAT, text: words, to }, "*"); }
      refresh(); return;
    }
    // Said as everyone else will see it (links stripped).
    const words = cleanChat(text) ?? "";
    if (!words) return;
    message(state, `${playerName(state.player)}: ${words}`, "public");
    if (players.current.state.status === "online") window.parent.postMessage({ type: NET_CHAT, text: words }, "*");
    chat.current = { text: words, until: performance.now() + 3500 }; refresh();
  };

  // ---------- Log out: save now and step back to the title screen ----------
  const logOut = () => {
    const state = game.current;
    if (!state) return;
    saveNow.current(); held.current.clear(); setHeld(state, null);
    const player = state.player;
    setHasSave({ total: totalLevel(player), combat: combatLevel(player), qp: questPoints(state), where: regionAt(state.world, player.x, player.y).name });
    setMenu(null); setModal(null); setDailyTab(null); setSelection(null); setLoggedOut(true); setPhase("title");
    audio.current?.play("theme");
  };
  // ---------- Title ----------
  const begin = () => {
    setLoggedOut(false);
    const state = game.current;
    if (!state) return;
    // A new Friend is asked for its name as it arrives (over the Realm, so nothing waits on it).
    if (!state.player.name && !hasSave) state.ui.naming = "first";
    audio.current?.unlock(); setPhase("playing"); region.current = ""; tickAt.current = performance.now();
    const at = realPoint(state.world, state.player.x, state.player.y);
    camera.current = { x: at.x, y: at.y, zoom: settings.zoom, angle: 0, pitch: PITCH.classic };
    if (!hasSave) { state.dialogue = null; message(state, "Tip: talk to the Realm Guide by the fountain, or right-click anything to see what you can do.", "info"); }
    // The daily popup greets you: today's streak reward if it's waiting, otherwise what's new since you last played.
    // (Automated runs open it from its button instead, so it never covers the world they click on.)
    rollDaily(state, Date.now());
    if (!navigator.webdriver) {
      if (streakStatus(state, Date.now()).canClaim) setDailyTab("daily");
      else if (state.player.seenUpdate < LATEST_UPDATE) setDailyTab("updates");
    }
    setTimeout(() => canvas.current?.focus({ preventScroll: true }), 50);
  };

  // ---------- Rare Caskets (simulated RF through the SDK client) ----------
  const refreshSnapshot = useCallback(async () => {
    const value = await client.read(); setSnapshot(value);
    if (game.current) setRelics(game.current, value.inventory.map(amount => Number(amount > 99n ? 99n : amount)));
    return value;
  }, [client]);
  const casket = async (task: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setCasketError("");
    try { await task(); await refreshSnapshot(); after?.(); } catch (error) { setCasketError(error instanceof Error ? error.message : "That didn't work. Try again."); } finally { setBusy(false); }
  };
  const openCaskets = async () => {
    const state = game.current;
    if (!state) return;
    await casket(async () => {
      const current = await client.read(), pending = current.plays.filter(play => play.outcomeId === null);
      const plays: readonly GamePlay[] = pending.length ? pending : await client.play(current.consumables > 5n ? 5n : current.consumables);
      const results: CasketResult[] = [];
      for (const play of plays) {
        const settled = await client.settle(play.id);
        if (settled.outcomeId === null) continue;
        const collected = collectFromCasket(state, settled.outcomeId - 1);
        results.push({ play: settled.id, outcomeId: settled.outcomeId, wardrobe: collected.wardrobe, coins: collected.coins, redeemed: false });
      }
      setReveal(results); audio.current?.sfx(results.some(result => result.outcomeId >= 3) ? "quest" : "level");
    });
    refresh();
  };

  // ---------- Adventurer card ----------
  const drawCard = (state: Game) => {
    const paint = (art: Parameters<typeof renderCard>[2]) => {
      if (game.current !== state) return;
      const picture = renderCard(state, friend.current, art, state.player.follower !== null ? followerSprites.current.get(state.player.follower) ?? null : null);
      picture.toBlob(blob => { if (!blob) return; cardBlob.current = blob; setCardUrl(url => { if (url) URL.revokeObjectURL(url); return URL.createObjectURL(blob); }); });
    };
    // The fellowship's logo and background come from the site's fellowships folder; draw at once and again when they arrive.
    if (state.player.fellowship) fellowshipArt(state.player.fellowship.tag).then(paint, () => paint(null)); else paint(null);
  };
  // ---------- Picture in picture: the game canvas mirrored into a floating window (view only; the game keeps running here) ----------
  const pipVideo = useRef<HTMLVideoElement>(null);
  const togglePip = async () => {
    const video = pipVideo.current, view = canvas.current, state = game.current;
    if (!video || !view) return;
    try {
      if (document.pictureInPictureElement) { await document.exitPictureInPicture(); setPip(false); return; }
      const source = view as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };
      if (!source.captureStream || !("requestPictureInPicture" in video)) throw new Error("unsupported");
      video.srcObject = source.captureStream(30); await video.play(); await video.requestPictureInPicture(); setPip(true);
    } catch { if (state) { message(state, "Picture in picture isn't available in this browser.", "warn"); refresh(); } }
  };
  useEffect(() => {
    const video = pipVideo.current; if (!video) return;
    const on = () => setPip(true), off = () => { setPip(false); const stream = video.srcObject as MediaStream | null; stream?.getTracks().forEach(track => track.stop()); video.srcObject = null; };
    video.addEventListener("enterpictureinpicture", on); video.addEventListener("leavepictureinpicture", off);
    return () => { video.removeEventListener("enterpictureinpicture", on); video.removeEventListener("leavepictureinpicture", off); };
  }, []);
  const openCard = () => {
    const state = game.current;
    if (!state) return;
    drawCard(state);
    setShareStatus(""); setModal("card");
  };
  const shareBlob = (action: ShareAction, blob: Blob, text: string, filename: string) => {
    if (hosted !== "linked") { setShareStatus("Sharing needs the Realm's own host page (the Pages link)."); return; }
    window.parent.postMessage({ type: SHARE_REQUEST, action, text, image: blob, filename }, "*");
    setShareStatus("Working…");
  };
  const share = (action: ShareAction) => {
    const state = game.current, blob = cardBlob.current;
    if (!state || !blob) return;
    shareBlob(action, blob, shareText(state), `rarefriends-realm-${state.player.friendId}.png`);
  };
  /** Player feedback through the host: a GitHub issue with the details, and an X post tagging the Realm's maker. */
  const sendFeedback = (target: "both" | "github" | "x", kind: FeedbackKind, text: string, details: boolean) => {
    const state = game.current; if (!state) return;
    if (hosted !== "linked") { setFeedbackStatus("Feedback needs the Realm's own host page (the Pages link)."); return; }
    const issue = feedbackIssue(state, kind, text, details, target !== "github");
    window.parent.postMessage({ type: FEEDBACK_REQUEST, target, post: feedbackPost(kind, text), title: issue.title, body: issue.body }, "*");
    setFeedbackStatus("Opening…");
  };
  const copyText = (text: string) => { if (hosted !== "linked") { setShareStatus("Copying needs the Realm's own host page."); return; } window.parent.postMessage({ type: TEXT_COPY, text }, "*"); setShareStatus("Working…"); };
  /** The fellowship's recruitment card and post, shared through the host. */
  const recruit = (action: ShareAction | "copy-text") => {
    const state = game.current; if (!state?.player.fellowship) return;
    if (action === "copy-text") { copyText(recruitText(state)); return; }
    const paint = (art: Parameters<typeof renderFellowshipCard>[1]) => renderFellowshipCard(state, art).toBlob(blob => { if (blob) shareBlob(action, blob, recruitText(state), `rarefriends-realm-${state.player.fellowship!.tag.toLowerCase()}-recruiting.png`); });
    fellowshipArt(state.player.fellowship.tag).then(paint, () => paint(null));
  };

  // ---------- Render ----------
  const state = game.current, player = state?.player;
  // Speech blips as each dialogue line appears, pitched to the speaker.
  const line = state?.dialogue ? state.dialogue.lines[Math.min(state.dialogue.index, state.dialogue.lines.length - 1)] : null;
  const lineKey = state?.dialogue && line && state.dialogue.index < state.dialogue.lines.length ? `${state.dialogue.npc}|${state.dialogue.index}|${line.text.length}` : "";
  useEffect(() => {
    if (!lineKey || !line || !state) return;
    const who = line.who === "player" ? `${state.player.friendId}` : state.dialogue!.npc;
    audio.current?.speak([...who].reduce((sum, char) => sum + char.charCodeAt(0), 0), Math.ceil(line.text.split(" ").length / 3));
  }, [lineKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const definition = client.definition, pending = snapshot?.plays.filter(play => play.outcomeId === null).length ?? 0;
  const savedText = hosted === "linked" ? "Your adventure saves automatically for this wallet on this device." : hosted === "waiting" ? "Connecting saves…"
    : hosted === "elsewhere" ? "Not saving: this adventure is open in another tab or window. Reload this page to continue here."
    : "Saves are off: this wallet's Friends couldn't be looked up yet (reload to try again), or this host doesn't provide saves (use the Realm's own page).";
  return (
    <div ref={root} className="realm-game" data-phase={phase} data-tick={state?.tick ?? 0} data-region={state ? regionAt(state.world, state.player.x, state.player.y).id : ""}
      data-total={player ? totalLevel(player) : 0} data-hp={player?.hp ?? 0} data-quests={state ? questPoints(state) : 0} data-hosted={hosted}
      onContextMenu={event => event.preventDefault()}>
      <div ref={stage} className="realm-stage" style={{ width: size.width, height: size.height, left: `calc(50% - ${size.width * size.scale / 2}px)`, top: `calc(50% - ${size.height * size.scale / 2}px)`, transform: `scale(${size.scale})`, "--toolbar": `${Math.ceil(54 / size.scale)}px` } as CSSProperties}>
        <canvas ref={glCanvas} className="realm-gl" aria-hidden="true" />
        <canvas ref={canvas} className="realm-view" tabIndex={0} aria-label="The Realm. Left-click to act, right-click for options, WASD to walk."
          style={{ width: size.width, height: size.height }}
          onPointerMove={onPointerMove} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { cancelLongPress(); orbit.current = null; }}
          onMouseDown={event => { if (event.button === 1) event.preventDefault(); }} onAuxClick={event => event.preventDefault()}
          onPointerLeave={() => { hoverTile.current = null; setHover(""); }}
          onContextMenu={event => { event.preventDefault(); const p = logicalPoint(event.clientX, event.clientY); openContext(p.x, p.y); }}
          onWheel={event => { if (phase === "playing") setSettings({ ...settings, zoom: Math.max(ZOOM.min, Math.min(ZOOM.max, settings.zoom * (event.deltaY < 0 ? 1.08 : 0.93))) }); }} />

        {phase === "playing" && state && player && <>
          <div className="realm-hover" aria-hidden="true">{hover}</div>
          <CarvingBuffs game={state} />
          <div className="realm-topright">
            <Orbs game={state} openMenu={(x, y, entries) => setMenu({ x, y, entries })} onRun={() => { toggleRun(state); refresh(); }} onSneak={() => { toggleSneak(state); refresh(); }} onRide={id => { toggleMount(state, id); refresh(); }} onMap={() => setModal("map")} onZoom={delta => setSettings({ ...settings, zoom: Math.max(ZOOM.min, Math.min(ZOOM.max, settings.zoom * (delta > 0 ? 1.15 : 0.87))) })}
              onRotate={delta => { const from = cameraGoal.current?.angle ?? camera.current.angle; cameraGoal.current = { angle: from + delta, pitch: cameraGoal.current?.pitch ?? camera.current.pitch }; }} />
            <div className="realm-minimap">
              <canvas ref={minimap} width={180} height={180} onClick={onMinimap}
                {...rightClick((x, y, entries) => setMenu({ x, y, entries }), () => [{ verb: "Walk here", noun: "", run: () => { const at = lastMinimapPoint.current; if (at) onMinimap(at); } }])}
                onMouseDown={event => { lastMinimapPoint.current = { clientX: event.clientX, clientY: event.clientY } as React.MouseEvent<HTMLCanvasElement>; }} aria-label="Minimap: click to walk, scroll to zoom"
                onWheel={event => { miniZoom.current = Math.max(1.6, Math.min(7, miniZoom.current * (event.deltaY < 0 ? 1.15 : 0.87))); }} />
              <button type="button" className="realm-pip" title={pip ? "Close the picture-in-picture window" : "Picture in picture: the Realm in a floating window"} aria-label={pip ? "Close picture in picture" : "Picture in picture"} aria-pressed={pip} onClick={() => void togglePip()}>▣</button>
              <video ref={pipVideo} className="realm-pip-video" muted playsInline aria-hidden="true" />
              <button type="button" className="realm-fullscreen" title={fullscreen ? "Leave full screen" : "Full screen"} aria-label={fullscreen ? "Leave full screen" : "Full screen"} aria-pressed={fullscreen}
                onClick={() => window.parent.postMessage({ type: FULLSCREEN_REQUEST }, "*")}>{fullscreen ? "↙" : "↗"}</button>
              <button type="button" ref={compass} className="realm-compass" title="Face north" aria-label="Compass: face north"
                {...rightClick((x, y, entries) => setMenu({ x, y, entries }), () => ([["North", 0], ["East", -Math.PI / 2], ["South", Math.PI], ["West", Math.PI / 2]] as const).map(([name, turn]) => ({ verb: `Look ${name}`, noun: "", run: () => {
                  const from = cameraGoal.current?.angle ?? camera.current.angle, goal = NORTH + turn; cameraGoal.current = { angle: goal + Math.round((from - goal) / (Math.PI * 2)) * Math.PI * 2, pitch: cameraGoal.current?.pitch ?? camera.current.pitch }; } })))}
                onClick={() => { const from = cameraGoal.current?.angle ?? camera.current.angle; cameraGoal.current = { angle: NORTH + Math.round((from - NORTH) / (Math.PI * 2)) * Math.PI * 2, pitch: cameraGoal.current?.pitch ?? camera.current.pitch }; }}><i aria-hidden="true">▲</i><b>N</b></button>
              <button type="button" className="realm-feedback-btn" aria-label="Send feedback" title="Send feedback: a bug, an idea, anything" onClick={() => { setFeedbackStatus(""); setModal("feedback"); }}>💬</button>
              <button type="button" className="realm-logout-btn" aria-label="Save and log out" title="Save and log out" onClick={logOut}
                {...rightClick((x, y, entries) => setMenu({ x, y, entries }), () => [{ verb: "Save-and-log-out", noun: "", run: logOut }])}>⏻</button>
              <button type="button" className="realm-daily-btn" aria-label={`Daily streak and updates${dailyWaiting(state, Date.now()) || state.player.seenUpdate < LATEST_UPDATE ? " (something new)" : ""}`} title="Daily streak and updates"
                onClick={() => setDailyTab(dailyWaiting(state, Date.now()) || state.player.seenUpdate >= LATEST_UPDATE ? "daily" : "updates")}
                {...rightClick((x, y, entries) => setMenu({ x, y, entries }), () => [{ verb: "Open", noun: "Daily streak", run: () => setDailyTab("daily") }, { verb: "Open", noun: "Updates", run: () => setDailyTab("updates") }])}>
                🔥{(dailyWaiting(state, Date.now()) || state.player.seenUpdate < LATEST_UPDATE) && <i className="realm-dot" />}</button>
              {netState.status !== "offline" && <span className="realm-online" title={`Players in the Realm right now${netState.paths ? ` · ${netState.paths.relays} relay${netState.paths.relays === 1 ? "" : "s"} connected, ${netState.paths.direct} on a direct link` : ""}`} onClick={() => setTab("friends")}>{netState.status === "online" ? `● ${netState.players} online` : "○ connecting"}</span>}
              {settings.dayNight !== false && (() => { const light = daylight(timeOfDay()); return <span className="realm-clock" title="Time of day">{light.label === "Night" ? "☾" : light.label === "Day" ? "☀" : "◐"} {light.label}</span>; })()}
            </div>
          </div>
          <div className="realm-drops" aria-hidden="true">
            {drops.map(drop => <span key={drop.id} style={{ animationDuration: reducedMotion ? "0s" : undefined }}><PixelIcon art={skillArt(drop.skill)} size={24} /> +{Math.round(drop.amount).toLocaleString()}</span>)}
          </div>
          {phase === "playing" && currentStep(state) && <FirstStepsCard game={state} onSkip={() => { skipFirstSteps(state); refresh(); }} openMenu={(x, y, entries) => setMenu({ x, y, entries })} />}
          {toast && <div className="realm-toast" role="status"><b>{toast.title}</b>{toast.sub && <small>♪ {toast.sub}</small>}</div>}
          {dead && <div className="realm-dead" role="alert">Oh dear, you are dead!</div>}

          <div className="realm-bottom">
            {state.dialogue ? <DialogueBox game={state} sprites={friend.current} canonical={CANONICAL} refresh={refresh} />
              : levelUps.length ? <LevelUpBox skill={levelUps[0].skill} level={levelUps[0].level} onClose={() => setLevelUps(list => list.slice(1))} />
              : state.ui.production ? <ProductionBox game={state} refresh={refresh} openMenu={(x, y, entries) => setMenu({ x, y, entries })} />
              : <ChatBox messages={state.messages} onSend={say} prefill={whisper} />}
          </div>
          <SidePanel open={sideOpen} setOpen={setSideOpen} game={state} tab={tab} setTab={setTab} selection={selection} setSelection={setSelection} openMenu={(x, y, entries) => setMenu({ x, y, entries })}
            refresh={refresh} roster={roster} rosterState={rosterState} friendSprites={followerSprites.current} loadFriend={loadFriendSprite}
            net={netState} onSocial={(op, id) => window.parent.postMessage({ type: NET_SOCIAL, op, id }, "*")} onWhisper={id => setWhisper({ text: `@${id} `, at: performance.now() })}
            onOnline={on => window.parent.postMessage({ type: NET_ONLINE, on }, "*")} backupStatus={backupStatus} openGuide={skill => setGuide({ skill })}
            party={{ members: [...party.current.members], onLeave: () => { party.current.leave(state); refresh(); }, onInvite: id => { party.current.invite(state, id, performance.now()); refresh(); } }}
            onLogout={logOut} fullscreen={fullscreen} onFullscreen={() => window.parent.postMessage({ type: FULLSCREEN_REQUEST }, "*")} pip={pip} onPip={() => void togglePip()}
            onExportSave={action => { const state = game.current; if (state) void makeSaveCode(state).then(text => window.parent.postMessage({ type: SAVE_EXPORT, action, text }, "*")); }}
            onRestoreSave={async code => { const state = game.current; if (!state) return "The game isn't ready."; const error = await restoreSaveCode(state, code);
              if (!error) {
                const at = realPoint(state.world, state.player.x, state.player.y); camera.current.x = at.x; camera.current.y = at.y; message(state, "Your adventure has been restored from a save code.", "info");
                if (linked.current) saveNow.current(true);
                else message(state, "Saves aren't connected yet, so this restore isn't saved: keep playing in this tab and it saves once they connect. If Settings still says saves are off, reload the page and restore the code again.", "info");
              } return error; }} settings={settings} setSettings={setSettings}
            friend={friend.current} trackName={audio.current?.trackName ?? ""} trackId={audio.current?.trackId ?? ""} playTrack={id => { audio.current?.play(id as TrackId); audio.current?.unlock(); setSettings({ ...settings, autoMusic: false }); }} openCard={openCard} openCards={() => setModal("cards")} openFeedback={() => { setFeedbackStatus(""); setModal("feedback"); }} openHelp={() => setModal("help")} paused={paused} saved={savedText}
            relicCounts={snapshot?.inventory.map(Number) ?? [0, 0, 0, 0]} openCaskets={() => setModal("caskets")} />
          {selection && <div className="realm-selection" role="status">{selection.kind === "item" ? `Use ${player.inventory[selection.slot] ? itemName(player.inventory[selection.slot]!.id) : "item"} ->` : `Cast ${SPELLS.find(spell => spell.id === selection.spell)?.name ?? "spell"} ->`} pick a target <button type="button" onClick={() => setSelection(null)}>Cancel</button></div>}

          {state.ui.bank && <BankModal game={state} refresh={refresh} onClose={() => { state.ui.bank = false; refresh(); }} openMenu={(x, y, entries) => setMenu({ x, y, entries })} />}
          <LampModal game={state} refresh={refresh} />
          <NamingModal game={state} refresh={refresh} />
          {guide && <GuideModal game={state} skill={guide.skill} onSkill={skill => setGuide({ skill })} onClose={() => setGuide(null)} />}
          <FellowshipModal key={`${state.ui.fellowship ? 1 : 0}:${state.player.fellowship?.name ?? ""}`} game={state} refresh={refresh} onRecruit={recruit} shareStatus={shareStatus} />
          <JoinModal game={state} refresh={refresh} />
          <RfActionModal game={state} refresh={refresh} onRf={(caskets, after) => void casket(() => client.buy(BigInt(caskets)), () => { after(); audio.current?.sfx("coins"); })} rfPrice={caskets => rf(definition.price * BigInt(caskets))} rfBusy={busy || paused} />
          <HomeModal game={state} refresh={refresh} onRf={(caskets, after) => void casket(() => client.buy(BigInt(caskets)), () => { after(); audio.current?.sfx("coins"); })} rfPrice={caskets => rf(definition.price * BigInt(caskets))} rfBusy={busy || paused} />
          {(() => { const view = trades.current.view(); return view ? <TradeModal game={state} view={view} openMenu={(x, y, entries) => setMenu({ x, y, entries })}
            onOffer={(id, n) => { trades.current.offer(state, id, n); refresh(); }} onAccept={() => { trades.current.accept(state); refresh(); }} onDecline={() => { trades.current.decline(state); refresh(); }} /> : null; })()}
          {party.current.invites.size > 0 && <div className="realm-trade-requests" role="status">
            {[...party.current.invites.keys()].map(from => <div key={from}><span>{players.current.name(from)} invites you to a party.</span>
              <button type="button" className="realm-primary" onClick={() => { party.current.accept(state, from); refresh(); }}>Join</button>
              <button type="button" onClick={() => { party.current.decline(from); refresh(); }}>Decline</button></div>)}
          </div>}
          {!trades.current.view() && trades.current.incoming.size > 0 && <div className="realm-trade-requests" role="status">
            {[...trades.current.incoming.keys()].map(from => <div key={from}><span>{players.current.name(from)} wants to trade.</span>
              <button type="button" className="realm-primary" onClick={() => { trades.current.request(state, from, performance.now()); refresh(); }}>Trade</button>
              <button type="button" onClick={() => { const entry = trades.current.incoming.get(from); if (entry) sendAct(from, { kind: "trade-decline", trade: entry.trade }); trades.current.incoming.delete(from); refresh(); }}>Decline</button></div>)}
          </div>}
          {state.ui.shop === "__market" && (
            <Modal title="Rare Market" onClose={() => { state.ui.shop = null; refresh(); }} wide>
              <p className="realm-sim">Simulated $RAREFRIENDS. No real tokens, contracts or transactions. Balance: <b>{snapshot ? rf(snapshot.rfBalance) : "…"}</b></p>
              <p className="realm-market-intro">RF buys one thing, the <b>Rare Casket</b>, so every bundle buys caskets (open them at any casket chest) and adds its goods on top. Traders in Friendhollow, Emberforge, the Oasis, Frostpeak and on Pike's Pier.</p>
              <ul className="realm-market">{RF_BUNDLES.map(bundle => {
                const choices = bundle.id === "tailor" ? tailorChoices(state) : [], pick = choices.some(piece => piece.id === tailorPick) ? tailorPick : choices[0]?.id ?? "";
                return <li key={bundle.id}><div><b>{bundle.name}</b><small>{bundle.text} Includes {bundle.caskets} Rare Casket{bundle.caskets > 1 ? "s" : ""}.</small></div>
                  {bundle.id === "tailor" && (choices.length ? <select aria-label="Wardrobe piece" value={pick} onChange={event => setTailorPick(event.target.value)}>{choices.map(piece => <option key={piece.id} value={piece.id}>{piece.name}</option>)}</select> : <small>You own them all!</small>)}
                  <button type="button" className="realm-primary" disabled={busy || paused || (bundle.id === "tailor" && !choices.length)}
                    {...rightClick((x, y, entries) => setMenu({ x, y, entries }), () => [{ verb: "Examine", noun: bundle.name, run: () => { message(state, `${bundle.name}: ${bundle.text}`); refresh(); } }])}
                    onClick={() => void casket(() => client.buy(BigInt(bundle.caskets)), () => { grantBundle(state, bundle.id, pick); audio.current?.sfx("coins"); refresh(); })}>Buy · {rf(definition.price * BigInt(bundle.caskets))}</button></li>;
              })}</ul>
              {casketError && <p className="realm-error" role="alert">{casketError}</p>}
              <div className="realm-buttons"><button type="button" onClick={() => { state.ui.shop = "__caskets"; refresh(); }}>Open your caskets ({(snapshot?.consumables ?? 0n).toString()} waiting)</button></div>
            </Modal>
          )}
          {state.ui.shop === "__stable" && (
            <Modal title="Friendhollow Stables" onClose={() => { state.ui.shop = null; refresh(); }} wide>
              <p className="realm-sim">Simulated $RAREFRIENDS. No real tokens, contracts or transactions. Balance: <b>{snapshot ? rf(snapshot.rfBalance) : "…"}</b></p>
              <p className="realm-market-intro">Every mount gallops without using run energy (unicorns go faster still) and has a gift of its own. Like the Rare Market, RF buys Rare Caskets and the mount comes with them. Ride or dismount with the saddle button by your run orb, or <b>H</b>.</p>
              <ul className="realm-market stable">{MOUNTS.map(mount => {
                const owned = state.player.mounts.includes(mount.id), ridingNow = state.player.mount === mount.id;
                return <li key={mount.id}><PixelIcon art={mountArt(mount.coat, "side", -1, true)} size={58} label={mount.name} />
                  <div><b>{mount.name}</b><small>{mount.text} {owned ? "Yours." : `Includes ${mount.caskets} Rare Caskets.`}</small></div>
                  {owned ? <button type="button" aria-pressed={ridingNow} onClick={() => { toggleMount(state, mount.id); refresh(); }}>{ridingNow ? "Dismount" : "Ride"}</button>
                    : <button type="button" className="realm-primary" disabled={busy || paused}
                      {...rightClick((x, y, entries) => setMenu({ x, y, entries }), () => [{ verb: "Examine", noun: mount.name, run: () => { message(state, `${mount.name}: ${mount.text}`); refresh(); } }])}
                      onClick={() => void casket(() => client.buy(BigInt(mount.caskets)), () => { grantMount(state, mount.id); audio.current?.sfx("coins"); refresh(); })}>Buy · {rf(definition.price * BigInt(mount.caskets))}</button>}</li>;
              })}</ul>
              {casketError && <p className="realm-error" role="alert">{casketError}</p>}
            </Modal>
          )}
          {state.ui.shop && state.ui.shop !== "__caskets" && state.ui.shop !== "__market" && state.ui.shop !== "__stable" && <ShopModal game={state} shopId={state.ui.shop} refresh={refresh} openMenu={(x, y, entries) => setMenu({ x, y, entries })} onClose={() => { state.ui.shop = null; refresh(); }} />}
          {(modal === "caskets" || state.ui.shop === "__caskets") && (
            <Modal title="Rare Caskets" onClose={() => { setModal(null); state.ui.shop = null; setReveal(null); refresh(); }} wide>
              <p className="realm-sim">Simulated $RAREFRIENDS. No real tokens, contracts or transactions. Balance: <b>{snapshot ? rf(snapshot.rfBalance) : "…"}</b></p>
              <p>Each casket costs <b>{rf(definition.price)}</b> and holds a <b>Rare Relic</b> (keep it for a bonus, or redeem it for RF) plus a <b>wardrobe piece</b> for your Friend. Duplicates become coins.</p>
              <table className="realm-odds">
                <thead><tr><th>Relic</th><th>Chance</th><th>RF value</th><th>Kept bonus</th><th>Wardrobe</th></tr></thead>
                <tbody>{definition.outcomes.map((outcome, index) => <tr key={outcome.name}><td>{outcome.name}</td><td>{(outcome.chanceBps / 100).toFixed(0)}%</td><td>{rf(outcome.reward)}</td><td>{RELICS[index].text}</td>
                  <td>{WARDROBE.filter(piece => piece.tier === index).map(piece => piece.name).join(", ")}</td></tr>)}</tbody>
              </table>
              <p className="realm-note">Expected value {rf(expectedReward(definition))} per casket · top prize {rf(maximumPrize(definition))} · every casket reserves its backing, so redemptions stay funded.</p>
              <div className="realm-buttons">
                <button type="button" className="realm-primary" disabled={busy || paused} onClick={() => void casket(() => client.buy(1n), () => audio.current?.sfx("coins"))}>Buy 1 · {rf(definition.price)}</button>
                <button type="button" disabled={busy || paused} onClick={() => void casket(() => client.buy(5n), () => audio.current?.sfx("coins"))}>Buy 5 · {rf(definition.price * 5n)}</button>
                <button type="button" className="realm-primary" disabled={busy || paused || (!snapshot?.consumables && !pending)} onClick={() => void openCaskets()}>Open {Math.min(5, Number(snapshot?.consumables ?? 0n) + pending) || ""} casket{(Number(snapshot?.consumables ?? 0n) + pending) === 1 ? "" : "s"}</button>
              </div>
              {casketError && <p className="realm-error" role="alert">{casketError}</p>}
              {reveal && <div className="realm-reveal">{reveal.map(result => {
                const outcome = definition.outcomes[result.outcomeId - 1], piece = WARDROBE.find(entry => entry.id === result.wardrobe);
                return <div key={result.play.toString()} className={`tier-${result.outcomeId}`}><b>{outcome.name}</b><small>{piece ? `Wardrobe: ${piece.name}` : `+${result.coins} coins`}</small>
                  <button type="button" disabled={busy || result.redeemed} onClick={() => void casket(() => client.redeem(result.outcomeId, 1n), () => { setReveal(list => list?.map(item => item.play === result.play ? { ...item, redeemed: true } : item) ?? null); audio.current?.sfx("coins"); })}>{result.redeemed ? "Redeemed" : `Redeem · ${rf(outcome.reward)}`}</button></div>;
              })}</div>}
              <h3>Your relics</h3>
              <ul className="realm-relics">{definition.outcomes.map((outcome, index) => <li key={outcome.name}><b>{outcome.name} × {(snapshot?.inventory[index] ?? 0n).toString()}</b><small>{RELICS[index].text}{(snapshot?.inventory[index] ?? 0n) > 0n ? " · active" : ""}</small>
                <button type="button" disabled={busy || paused || !snapshot || snapshot.inventory[index] === 0n} onClick={() => void casket(() => client.redeem(index + 1, 1n))}>Redeem · {rf(outcome.reward)}</button></li>)}</ul>
            </Modal>
          )}
          {modal === "cards" && <CardsModal game={state} onClose={() => setModal(null)} />}
          {modal === "feedback" && <FeedbackModal onClose={() => setModal(null)} onSend={sendFeedback} status={feedbackStatus} />}
          {modal === "map" && <WorldMapModal game={state} onClose={() => setModal(null)} onTravel={(x, y) => { setModal(null); walkTo(state, x, y); marker.current = { x, y, at: performance.now(), red: false }; refresh(); }} />}
          {modal === "help" && <HelpModal onClose={() => setModal(null)} onFeedback={() => { setFeedbackStatus(""); setModal("feedback"); }} />}
          {dailyTab && <DailyModal game={state} tab={dailyTab} onTab={setDailyTab} onClose={() => setDailyTab(null)} refresh={refresh} openMenu={(x, y, entries) => setMenu({ x, y, entries })}
            onRf={(caskets, after) => void casket(() => client.buy(BigInt(caskets)), () => { after(); audio.current?.sfx("coins"); })} rfPrice={caskets => rf(definition.price * BigInt(caskets))} rfBusy={busy || paused} />}
          {modal === "card" && (
            <Modal title="Adventurer card" onClose={() => setModal(null)} wide>
              {cardUrl && <img className="realm-card" src={cardUrl} alt={`Adventurer card: Friend #${player.friendId}, total level ${totalLevel(player)}, combat ${combatLevel(player)}`} />}
              <div className="realm-buttons">
                <button type="button" className="realm-primary" onClick={() => share("post")}>Post to X</button>
                <button type="button" onClick={() => share("copy")}>Copy picture</button>
                <button type="button" onClick={() => share("save")}>Save picture</button>
                <button type="button" onClick={() => setModal("cards")}>Adventurer Cards</button>
              </div>
              {shareStatus && <p className="realm-note" role="status">{shareStatus}</p>}
              <div className="realm-card-styles">
                {/* One dropdown a style (there are too many styles for rows of buttons): locked ones show what opens them. */}
                <div className="realm-card-selects">
                  {(Object.keys(CARD_OPTIONS) as CardCategory[]).map(category => {
                    const current = CARD_OPTIONS[category].some(entry => entry.id === player.card[category]) ? player.card[category]! : CARD_OPTIONS[category][0].id;
                    return <label key={category} className="realm-card-select"><span>{CARD_CATEGORY_NAMES[category]}</span>
                      <select value={current} onChange={event => { player.card[category] = event.target.value; drawCard(state); refresh(); }}>
                        {CARD_OPTIONS[category].map(option => { const open = cardUnlocked(state, option);
                          return <option key={option.id} value={option.id} disabled={!open} title={open ? option.text ?? option.name : `Locked: ${cardRequirement(option)}`}>{open ? option.name : `🔒 ${option.name} (${cardRequirement(option)})`}</option>; })}
                      </select></label>;
                  })}
                </div>
                <div className="realm-graphics realm-card-row" aria-label="Custom colours">
                  <span>Your colours:</span>
                  {CARD_COLOR_KEYS.map(key => <label key={key} className="realm-color">{CARD_COLOR_NAMES[key].replace(" colour", "")} <input type="color" value={player.card[key] ?? ({ bgColor: "#efede7", frameColor: "#d8b6b4", accentColor: "#e2c46a", bannerColor: "#2a2a30", inkColor: "#161616" } as Record<string, string>)[key]} aria-label={CARD_COLOR_NAMES[key]}
                    onChange={event => { player.card[key] = event.target.value; drawCard(state); refresh(); }} /></label>)}
                  <button type="button" className="realm-dark" disabled={!CARD_COLOR_KEYS.some(key => player.card[key])} onClick={() => { for (const key of CARD_COLOR_KEYS) delete player.card[key]; drawCard(state); refresh(); }}>Use the presets</button>
                </div>
                <p className="realm-muted">Every style is free: the card is yours. Your own colours override the ink, background and backdrop presets; the accent and banner colours paint your own header banner. Fellowship logos and backgrounds come from the site's fellowships folder: see preview/fellowships/README on the site.</p>
              </div>
              <p className="realm-note">Post text: “{shareText(state)}”</p>
            </Modal>
          )}
          {quest && (
            <Modal title="Quest complete!" onClose={() => setQuest(null)}>
              <div className="realm-quest-done"><span aria-hidden="true">✦</span><h3>{QUESTS.find(entry => entry.id === quest)?.name}</h3>
                <p>Quest points: <b>{questPoints(state)}</b> / {MAX_QUEST_POINTS}</p>
                <ul className="realm-quest-rewards">{QUESTS.find(entry => entry.id === quest)?.rewards.map(reward => <li key={reward}>{reward}</li>)}</ul>
                <button type="button" className="realm-primary" onClick={() => setQuest(null)}>Continue</button></div>
            </Modal>
          )}
          {menu && <ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} />}
          {paused && <div className="realm-paused" role="status">Paused</div>}
        </>}

        {phase === "title" && state && player && (
          <div className="realm-title">
            <div className="realm-logo"><small>An old-school adventure for your Rare Friend</small><h1>RareFriends<span>Realm</span></h1></div>
            <div className="realm-title-card">
              <FriendPortrait sprites={friend.current} size={96} worn={[...player.worn, ...(["cape", "head", "shield", "weapon", "neck", "body", "legs", "hands", "feet"] as const).flatMap(slot => player.equipment[slot] ? [player.equipment[slot]!] : [])]} />
              <div>
                <h2>{player.name ? <>{player.name} <small className="realm-title-id">({player.friendId})</small></> : <>Friend #{player.friendId}</>}</h2>
                <p><b>{FAMILY_NAMES[player.familyId]}</b>: {FAMILY_PERKS[player.familyId].title}. {FAMILY_PERKS[player.familyId].text}</p>
                {loggedOut && <p className="realm-logged-out" role="status">{hosted === "linked" ? <>✓ <b>Saved and logged out.</b></> : <b>Logged out.</b>} {hosted === "linked" ? "Your adventure is safe in this browser for this wallet and Friend. Continue any time." : hosted === "elsewhere" ? "This tab stopped saving because the adventure is open in another tab: continue there, or reload this page." : "Saves weren't connected: copy a save code from Settings next time to keep your progress."} For an extra copy on any device, use Settings → Copy save code.</p>}
                {hasSave ? <p className="realm-save">Saved adventure: total level <b>{hasSave.total}</b> · combat <b>{hasSave.combat}</b> · <b>{hasSave.qp}</b> quest points · in {hasSave.where}</p>
                  : hosted === "waiting" ? <p className="realm-muted">Looking for this wallet's saved adventure…</p> : <p className="realm-muted">A new adventure: 19 skills, 7 quests, one large world.</p>}
              </div>
            </div>
            <div className="realm-buttons center">
              <button type="button" className="realm-primary big" onClick={begin}>{hasSave ? "Continue your adventure" : "Begin your adventure"}</button>
              {audio.current?.ready || !settings.music
                ? <button type="button" onClick={() => { const next = { ...settings, music: !settings.music }; setSettings(next); }} aria-pressed={settings.music}>{settings.music ? "♪ Music on" : "♪ Music off"}</button>
                : <button type="button" onClick={() => setSettings({ ...settings })}>♪ Start the music</button>}
              <button type="button" onClick={() => setModal("help")}>How to play</button>
            </div>
            <p className="realm-title-foot">Now playing: {trackById("theme").name} · Simulated $RAREFRIENDS · Saves per wallet on this device</p>
            {modal === "help" && <HelpModal onClose={() => setModal(null)} onFeedback={() => { setFeedbackStatus(""); setModal("feedback"); }} />}
          </div>
        )}
        {(phase === "loading" || phase === "failed") && (
          <div className="realm-status" role="status">
            <span className="realm-status-glyph" aria-hidden="true">⚔</span>
            <p>{status}</p>
            {phase === "failed" && <button type="button" onClick={() => location.reload()}>Try again</button>}
          </div>
        )}
      </div>
    </div>
  );
}
const itemName = (id: string) => item(id).name;
/** How loud something at (x, y) is for you (1 beside you, 0 twelve tiles away). */
function nearness(state: Game, x: number, y: number) { return Math.max(0, 1 - Math.hypot(x - state.player.x, y - state.player.y) / 12); }
/**
 * Marks a step leaves on each tile it crosses: prints in snow and sand (hoofprints when riding), a splash in the bog,
 * and a puff of dust from a mount's hooves.
 */
function stepMarks(world: World, from: { x: number; y: number }, to: { x: number; y: number }, hoof: boolean, reduced: boolean) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  if (!steps || steps > 4) return;
  const hx = Math.sign(to.x - from.x), hy = Math.sign(to.y - from.y);
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(from.x + (to.x - from.x) * i / steps), y = Math.round(from.y + (to.y - from.y) * i / steps), terrain = terrainAt(world, x, y), ground = groundHeight(world, x, y);
    if (terrain === T.SNOW || terrain === T.SAND) addPrint(x, y, hx, hy, hoof, terrain === T.SNOW);
    if (reduced) continue;
    if (terrain === T.SWAMP) { burst("drop", x, y, ground + 2, 5, "#bcd0c4", { speed: 0.6, up: 34, life: 0.6, size: 1.6 }); burst("ring", x, y, ground, 1, "#ffffff", { speed: 0, up: 0, gravity: 0, life: 1 }); }
    else if (terrain === T.SNOW) burst("flake", x, y, ground + 2, hoof ? 4 : 2, "#ffffff", { speed: 0.5, up: 18, life: 0.6, size: 1.6, gravity: 60 });
    else if (hoof || terrain === T.SAND) burst("dust", x, y, ground + 1, hoof ? 3 : 1, terrain === T.SAND ? "#d9c9a3" : "#c8c1b4", { speed: 0.5, up: 10, life: 0.8, size: hoof ? 3 : 2, gravity: 10 });
  }
}
function stepSound(state: Game): SfxName {
  const terrain = terrainAt(state.world, state.player.x, state.player.y);
  if (terrain === T.WOOD || terrain === T.BRIDGE || terrain === T.CARPET) return "step_wood";
  if (terrain === T.COBBLE || terrain === T.STONE || terrain === T.DUNGEON || terrain === T.GRAVEL) return "step_stone";
  if (terrain === T.SAND) return "step_sand";
  if (terrain === T.SNOW || terrain === T.ICE) return "step_snow";
  if (terrain === T.SWAMP) return "step_swamp";
  return "step_grass";
}
const clampPitch = (pitch: number) => Math.max(PITCH.min, Math.min(PITCH.max, pitch));
/** Held WASD as a world direction: screen up/down/left/right, turned back through the camera's angle. */
function heldDirection(keys: ReadonlySet<string>, angle: number) {
  let sx = 0, sy = 0;
  for (const key of keys) { const direction = KEY_DIRECTIONS[key]; if (direction) { sx += direction[0]; sy += direction[1]; } }
  if (!sx && !sy) return null;
  const rx = (sx + sy) / 2, ry = (sy - sx) / 2, c = Math.cos(-angle), s = Math.sin(-angle);
  return { dx: rx * c - ry * s, dy: rx * s + ry * c };
}
