/**
 * Canvas renderer: the Realm in greyscale ink with faded accent colours, on a 2.5D isometric grid.
 * Draws in a 960 × 640 logical view; the caller scales the canvas for the device.
 */
import type { GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { MONSTERS, COURSES, ROCKS, isItem, item, levelForXp, mountDef, petDef, regionalSetOf, type Coat, type Icon } from "./data.ts";
import { herbDef } from "./apothecary.ts";
import { doorwaysOf, dressWorld } from "./facades.ts";
import type { RealmGL } from "./gl.ts";
const isPet = (id: string) => !!petDef(id);
import { NPCS } from "./content.ts";
import { TICK_MS, attackSpeed, riding, type Facing, type Game, type Monster, type Npc, type Projectile } from "./state.ts";
import { npcOverhead, veiled, type Pick } from "./engine.ts";
import { gloomAt, inDeadwood, DUNGEON_Y, FLOOR_Y, OVERWORLD_H, REGIONS, STOREY, T, W, H, complexAt, cornerHeight, floorAt, groundHeight, inBounds, isUnderground, objectAtTile, onLevel, realPoint, type Building, type DecorKind, type Floor, type World, type WorldObject } from "./world.ts";
import { itemArt } from "./icons.ts";
import type { PeerView } from "./social.ts";
import type { Strike, Weather } from "./weather.ts";
import { emoteMotion, emoteParticles, type Motion } from "./emotes.ts";
import { drawPixels, pixelArt, shadeHex } from "./pixel.ts";
import { CARVINGS, CARVING_REACH } from "./data.ts";
import { TEX_PER_HEIGHT, TEX_PER_TILE, beginTextures, groundTexture, textureStats, shingleTexture, texturedQuad, texturedTriangle, wallTexture, PANE, type GroundStyle, type WallStyle } from "./textures.ts";
import { campfireLogs, decorArt, fireArt, rockArt, treeArt , herbArt } from "./scenery.ts";
import { beginSprites, recordSprites, noteSprite, replaySprites, stampSprites, type SpriteDraw } from "./pixel.ts";
import { spellArt } from "./spellart.ts";
import { SADDLE, mountArt, type MountView } from "./mountart.ts";
import { petArt } from "./petart.ts";
import { burst, drawCloudShadows, drawEffects, hush, playerPose, puff, treeShake, updateEffects, type Pose } from "./effects.ts";
import { gloomSky, LightField, hexRgb, rgbCss, skyFor, type PointLight, type RGB , resetLighting } from "./lighting.ts";
import { FIGURE_K, drawAuras, drawFigure, figureArt, heldTip, type Held } from "./wardrobe.ts";
import { homeRect } from "./housing.ts";
import { creatureSprite, friendSprite, type Mask } from "./sprites.ts";

/** The logical view size; the game sets it to match the frame (960 × 640 is the reference). */
export const VIEW = { width: 960, height: 640 };
export const INK = "#161616", PAPER = "#efede7";
export const TILE_W = 64, TILE_H = 32;
const C = {
  rose: "#d8b6b4", sage: "#b4c3ab", blue: "#afbccb", butter: "#e2d7ad", lavender: "#c6bed4", amber: "#e3c9a0", wood: "#9c8672",
  dark: "#3b3a38", mid: "#6d6b67", line: "#bdb9b0", light: "#f7f5f0",
};
const TERRAIN_COLORS: Record<number, string> = {
  [T.GRASS]: "#cdd3c3", [T.DARK_GRASS]: "#bcc4b1", [T.PATH]: "#dcd0b8", [T.COBBLE]: "#d7d4cd", [T.SAND]: "#e8dfc6", [T.WATER]: "#b1c0cf",
  [T.DEEP]: "#95a7bb", [T.SWAMP]: "#adb29c", [T.SNOW]: "#d3dbe5", [T.STONE]: "#c8c5be", [T.WOOD]: "#cdb9a0", [T.GRAVEL]: "#bfb8ad",
  [T.DUNGEON]: "#5d5c63", [T.BRIDGE]: "#ab9278", [T.CLIFF]: "#8f8a83", [T.WALL]: "#a9a59e", [T.FARMLAND]: "#bca787", [T.ICE]: "#dfe7ec", [T.CARPET]: "#c9a3a3",
  [T.ASH]: "#8e8a86", [T.LAVA]: "#d98a5c", [T.BRICK]: "#9a4e42",
};
/** Pixel ground textures by terrain (water and lava keep their animated detail instead). */
const GROUND_STYLE: Partial<Record<number, GroundStyle>> = {
  [T.GRASS]: "grass", [T.DARK_GRASS]: "lush", [T.PATH]: "dirt", [T.GRAVEL]: "gravel", [T.COBBLE]: "cobble", [T.STONE]: "flag", [T.SAND]: "sand", [T.SNOW]: "snow",
  [T.WOOD]: "plank", [T.BRIDGE]: "plank", [T.FARMLAND]: "furrow", [T.DUNGEON]: "dungeon", [T.ICE]: "ice", [T.CARPET]: "carpet", [T.ASH]: "ash", [T.SWAMP]: "swamp", [T.BRICK]: "brick",
};
/** Terrain classes for inked edges: a line is drawn where the class changes. */
const EDGE_CLASS: Record<number, number> = {
  [T.GRASS]: 1, [T.DARK_GRASS]: 1, [T.PATH]: 2, [T.COBBLE]: 3, [T.SAND]: 4, [T.WATER]: 5, [T.DEEP]: 5, [T.SWAMP]: 6, [T.SNOW]: 7,
  [T.STONE]: 8, [T.WOOD]: 9, [T.GRAVEL]: 10, [T.DUNGEON]: 11, [T.BRIDGE]: 12, [T.CLIFF]: 13, [T.WALL]: 14, [T.FARMLAND]: 15, [T.ICE]: 16, [T.CARPET]: 17, [T.ASH]: 18, [T.LAVA]: 19, [T.BRICK]: 20,
};

/** The camera: a point in tiles, zoom, rotation (radians, 0 = the classic view) and pitch (screen squash, 0.5 = classic). */
export type Camera = { x: number; y: number; zoom: number; angle: number; pitch: number; base?: number };
export const PITCH = { min: 0.13, max: 0.74, classic: 0.5 } as const;
export const ZOOM = { min: 0.55, max: 3, classic: 0.8 } as const;
/** How far the land is drawn, and where the haze begins (tiles from the camera). */
const DRAW_DISTANCE = 72, HAZE_START = 48;
/** Decorations too small to matter in the far distance. */
const SMALL_DECOR = new Set(["flowers", "reeds", "lily", "rubble", "bush", "hay", "crate", "barrel", "bones"]);
export type ClickMarker = { x: number; y: number; at: number; red: boolean };
export type Firework = { at: number; color: string };
export type Scene = {
  game: Game; now: number; tickAt: number; camera: Camera; friend: GenerationSprites | null; follower: GenerationSprites | null;
  /**
   * WebGL (gl.ts): when there is one, the ground and the walls are drawn on the GPU, the frame given to renderScene is a
   * transparent layer for everything else (composited over the GPU's picture with the light), and what's drawn after
   * the light (projectiles, rain, names and bars) goes on `ui`, the top canvas.
   */
  gl?: RealmGL | null; ui?: CanvasRenderingContext2D;
  canonical: ReadonlyMap<number, GenerationSprites>; hoverTile: { x: number; y: number } | null; marker: ClickMarker | null;
  /** First steps: where the guide's arrow points. */
  guideTarget?: { x: number; y: number; lift?: number } | null;
  /** Low graphics: no pixel textures, ambient life, cloud shadows, footprints or fog, lighter rain, a shorter view. */
  low?: boolean;
  /** Nameplates over players: everything, the name alone, or none. */
  nameplates?: "full" | "name" | "off";
  reducedMotion: boolean; hits: HitSplat[]; fireworks: Firework[]; chat: { text: string; until: number } | null; projectiles: readonly Projectile[];
  /** Plays a sound effect (swing impacts are timed by the animation). */
  sfx?: (name: string, gain?: number) => void;
  /** Time of day, 0–1 (0 midnight, 0.5 noon), or null for always day. */
  time?: number | null;
  /** Rain, storms and fog (from weather.ts), and the latest lightning strike with the wall-clock time. */
  weather?: Weather | null; strike?: Strike | null; wallMs?: number;
  /** Other players, and their Friends' art once it has loaded. */
  peers?: readonly PeerView[]; peerSprites?: (id: number) => GenerationSprites | null;
  /** Items other players dropped from their packs (anyone may take them). */
  peerDrops?: readonly { owner: number; u: number; id: string; n: number; x: number; y: number }[];
};
/** How dark it is (0 day … 1 deep night) and how warm the light is (dawn and dusk), for a time of day. */
export function daylight(time: number | null | undefined) {
  if (time === null || time === undefined) return { dark: 0, warm: 0, label: "Day" };
  const sun = -Math.cos(time * Math.PI * 2), dark = Math.max(0, Math.min(1, (0.25 - sun) / 0.75)), warm = Math.max(0, 1 - Math.abs(sun - 0.08) / 0.32);
  return { dark, warm, label: sun > 0.3 ? "Day" : sun < -0.3 ? "Night" : time < 0.5 ? "Dawn" : "Dusk" };
}
/** A hex colour at an alpha, for gradients. */
const hexA = (hex: string, alpha: number) => { const n = parseInt(hex.slice(1, 7), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`; };

// ---------- Lighting passes ----------
/**
 * The light on screen: a half-resolution buffer (light changes slowly, and every sprite has an ink edge) holding the
 * ground's light with the sun's shadows in it. As each object is drawn, back to front, it cuts its exact silhouette out
 * of the buffer and fills the hole with the light where it stands; the buffer is then multiplied over the frame once.
 */
const field = new LightField();
let fieldKeyPrev = "", fieldFrame = 0;
let lightBuffer: HTMLCanvasElement | null = null, shadowBuffer: HTMLCanvasElement | null = null;
/**
 * The distance haze, the same way: how clearly each pixel is seen (white clear, grey hazy), laid on the land by its
 * distance from the camera and cut by each object at its own distance, so a mountain near you is never hazed because
 * it rises high up the screen. `hazeTint` turns it into the haze's colour, added over the frame.
 */
let hazeBuffer: HTMLCanvasElement | null = null, hazeTint: HTMLCanvasElement | null = null;

function buffers(target: CanvasRenderingContext2D, scale: number) {
  const make = (canvas: HTMLCanvasElement | null, w: number, h: number) => { canvas ??= document.createElement("canvas"); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } return canvas; };
  lightBuffer = make(lightBuffer, Math.ceil(VIEW.width * scale), Math.ceil(VIEW.height * scale));
  shadowBuffer = make(shadowBuffer, lightBuffer.width, lightBuffer.height);
  hazeBuffer = make(hazeBuffer, lightBuffer.width, lightBuffer.height); hazeTint = make(hazeTint, lightBuffer.width, lightBuffer.height);
  return { light: lightBuffer.getContext("2d")!, shadow: shadowBuffer.getContext("2d")!, haze: hazeBuffer.getContext("2d")!, hazeTint: hazeTint.getContext("2d")! };
}
/**
 * Overlays (health bars, names, speech, hit splats, quest markers) are UI, not things in the world: while objects are
 * drawn they're queued and drawn afterwards straight onto the frame, unlit. While shadows are drawn they're dropped.
 */
let uiQueue: (() => void)[] | null = null, uiTarget: CanvasRenderingContext2D | null = null, uiMuted = false;
function ui(ctx: CanvasRenderingContext2D, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (uiMuted) return;
  if (uiQueue && uiTarget) { const target = uiTarget; uiQueue.push(() => draw(target)); } else draw(ctx);
}
export type HitSplat = { on: "player" | "monster" | "peer"; uid?: number; damage: number; at: number };
type Hit = { x: number; y: number; w: number; h: number; pick: Pick };

// ---------- Projection ----------
/** Rotate a world offset by the camera angle. */
function rotate(camera: Camera, dx: number, dy: number) {
  const c = Math.cos(camera.angle), s = Math.sin(camera.angle);
  return { rx: dx * c - dy * s, ry: dx * s + dy * c };
}
/** Heights shrink as the camera looks more from above. */
const liftScale = (camera: Camera) => Math.sqrt(1 - camera.pitch * camera.pitch) / Math.sqrt(0.75);
/** The ground under the scene (set each frame), so everything stands on the hills. */
let ground: World | null = null;
export function setGround(world: World | null) { ground = world; }
const groundAt = (x: number, y: number) => ground ? groundHeight(ground, x, y) : 0;
/** The storey you're on (set each frame): clicks land on its floor. */
let viewFloor: Floor | null = null;
/** World point → screen, standing on the ground (`lift` is extra height above it). Stored upper-storey tiles are drawn on their building, a storey up per level. */
export function toScreen(camera: Camera, x: number, y: number, lift = 0) {
  if (y >= FLOOR_Y - 0.5 && ground) { const floor = floorAt(ground, x, y); if (floor) { x -= floor.dx; y -= floor.dy; lift += floor.level * STOREY; } }
  const { rx, ry } = rotate(camera, x - camera.x, y - camera.y), half = TILE_W / 2, height = lift + groundAt(x, y) - (camera.base ?? 0);
  return { x: (rx - ry) * half * camera.zoom + VIEW.width / 2, y: ((rx + ry) * half * camera.pitch - height * liftScale(camera)) * camera.zoom + VIEW.height / 2 };
}
/** Screen → the tile under it, allowing for hills (a few refinement steps). Upstairs, it's the floor you're on where it covers. */
export function toTile(camera: Camera, sx: number, sy: number, floors = true) {
  const half = TILE_W / 2, c = Math.cos(-camera.angle), s = Math.sin(-camera.angle);
  const solve = (lift: number) => {
    let x = camera.x, y = camera.y;
    for (let step = 0; step < 4; step++) {
      const height = step ? groundAt(x, y) + lift - (camera.base ?? 0) : 0;
      const a = (sx - VIEW.width / 2) / (camera.zoom * half), b = (sy - VIEW.height / 2 + height * liftScale(camera) * camera.zoom) / (camera.zoom * half * camera.pitch);
      const rx = (a + b) / 2, ry = (b - a) / 2;
      x = camera.x + rx * c - ry * s; y = camera.y + rx * s + ry * c;
    }
    return { x: Math.round(x), y: Math.round(y) };
  };
  if (floors && viewFloor && ground) {
    const up = solve(viewFloor.level * STOREY), stored = onLevel(ground, up.x, up.y, viewFloor.level, viewFloor.complex);
    if (stored.x !== up.x || stored.y !== up.y) return stored;
  }
  return solve(0);
}
/** Draw order: further from the camera first. */
export function depthOf(camera: Camera, x: number, y: number) {
  let level = 0;
  if (y >= FLOOR_Y - 0.5 && ground) { const floor = floorAt(ground, x, y); if (floor) { x -= floor.dx; y -= floor.dy; level = floor.level; } }
  const { rx, ry } = rotate(camera, x, y); return rx + ry + level * 0.002;
}
/** The screen facing of a world heading, for sprites. */
export function screenFacing(camera: Camera, heading: { x: number; y: number }): Facing {
  const { rx, ry } = rotate(camera, heading.x, heading.y), sx = rx - ry, sy = rx + ry;
  return Math.abs(sx) >= Math.abs(sy) ? (sx > 0 ? "right" : "left") : (sy > 0 ? "down" : "up");
}
/** Screen angle of world north (for the compass). */
export function northAngle(camera: Camera) { const { rx, ry } = rotate(camera, 0, -1); return Math.atan2((rx + ry) * camera.pitch, rx - ry); }
const hash = (x: number, y: number) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h ^= h >>> 13; return ((Math.imul(h, 1103515245) >>> 0) % 10000) / 10000; };

// ---------- Sprites ----------
const maskCache = new Map<string, HTMLCanvasElement>();
/** One-bit mask with a one-pixel white halo, at 1 canvas pixel per sprite pixel (scaled up without smoothing). */
function maskCanvas(rows: Mask, ink: string, mirror = false): HTMLCanvasElement {
  const key = `${ink}|${mirror ? 1 : 0}|${rows.join("")}`;
  let canvas = maskCache.get(key);
  if (canvas) { maskCache.delete(key); maskCache.set(key, canvas); return canvas; }
  const height = rows.length, width = rows[0]?.length ?? 16;
  canvas = document.createElement("canvas"); canvas.width = width + 2; canvas.height = height + 2;
  const ctx = canvas.getContext("2d")!;
  const on = (x: number, y: number) => y >= 0 && y < height && x >= 0 && x < width && rows[y][mirror ? width - 1 - x : x] === "#";
  ctx.fillStyle = "#fff";
  for (let y = -1; y <= height; y++) for (let x = -1; x <= width; x++) {
    if (on(x, y)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (on(x + dx, y + dy)) { ctx.fillRect(x + 1, y + 1, 1, 1); dx = 2; dy = 2; }
  }
  ctx.fillStyle = ink;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (on(x, y)) ctx.fillRect(x + 1, y + 1, 1, 1);
  if (maskCache.size > 800) maskCache.delete(maskCache.keys().next().value!);
  maskCache.set(key, canvas);
  return canvas;
}
export function friendRows(sprites: GenerationSprites, facing: Facing, walking: boolean, frame: number): Mask {
  const vertical = sprites.familyId === 6 && (facing === "up" || facing === "down");
  return sprites.clips[walking ? "walk" : "idle"][vertical ? "right" : facing][frame % 8].rows;
}
/** Draw a mask so its feet sit on (x, y). `px` is screen pixels per sprite pixel. */
function drawMask(ctx: CanvasRenderingContext2D, rows: Mask, x: number, y: number, px: number, ink = INK, mirror = false, alpha = 1) {
  const canvas = maskCanvas(rows, ink, mirror), w = canvas.width * px, h = canvas.height * px;
  ctx.globalAlpha = alpha;
  ctx.drawImage(canvas, Math.round(x - w / 2), Math.round(y - h + px), Math.round(w), Math.round(h));
  ctx.globalAlpha = 1;
  // (Noted like pixel art, so a Friend's light, haze and shadow are its silhouette laid again, not a whole redraw.)
  noteSprite(canvas, Math.round(x - w / 2), Math.round(y - h + px), Math.round(w), Math.round(h), alpha);
  return { x: x - w / 2, y: y - h + px, w, h };
}
const FACES_LEFT = new Set([101, 102, 108, 115, 116, 118, 119, 121]);

// ---------- Primitives ----------
/**
 * While objects are drawn again only for their shape (their shadow, or their hole in the light buffer), ink outlines are
 * left off: the shape is the same and strokes are the slowest thing to draw.
 */
let bare = false;
function poly(ctx: CanvasRenderingContext2D, points: readonly (readonly [number, number])[], fill: string | null, stroke: string | null = INK, width = 1) {
  ctx.beginPath(); points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke && !bare) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string | null, stroke: string | null = INK, width = 1) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke && !bare) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
/** The Old Friend's likeness (a procedural Friend, the same for every altar) and the long carved beard laid over its face. */
const OLD_FRIEND = friendSprite(5, 7730);
/** The Wise Friend (Raria's): a Mask-family Rare Friend, and where its eyes are (for the blindfold). */
const WISE_FRIEND = friendSprite(1, 4242);
const WISE_EYES = (() => {
  const rows = WISE_FRIEND.idle;
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row], first = line.indexOf("#"), last = line.lastIndexOf("#");
    if (first >= 0 && line.slice(first, last + 1).includes(".")) return { row, x0: first, x1: last };
  }
  return { row: 5, x0: 3, x1: 12 };
})();
const OLD_FRIEND_BEARD: Mask = Object.freeze([
  "................", "................", "................", "................", "................", "................", "................", "................",
  ".....######.....", "....########....", "....########....", ".....######.....", "......####......", ".......##.......", "................", "................",
]);
/** How each Wayfaring obstacle is drawn: a span laid across the gap, a climb, a swing, a wall or a stone. */
type ObstacleLook = { kind: "span"; color: string; dark: string; width: number; rails?: boolean } | { kind: "climb"; color: string; dark: string; height: number }
  | { kind: "swing"; color: string; dark: string } | { kind: "wall"; color: string; dark: string; height?: number } | { kind: "stone"; color: string; dark: string };
const OBSTACLE_LOOKS: Record<string, ObstacleLook> = {
  "Log balance": { kind: "span", color: "#9c8672", dark: "#7a6553", width: 7 }, "Balance beam": { kind: "span", color: "#c8c5be", dark: "#9a968f", width: 3 },
  "Rope bridge": { kind: "span", color: "#9c8672", dark: "#6d5a48", width: 5, rails: true }, "Snow bridge": { kind: "span", color: "#eef3f6", dark: "#b9c6cf", width: 7 },
  "Ruin ledge": { kind: "span", color: "#c9b48a", dark: "#8f7a56", width: 5 }, "Ice ledge": { kind: "span", color: "#cfe6f0", dark: "#8fb4c4", width: 5 }, "Glacier slide": { kind: "span", color: "#bcdce8", dark: "#7fa8ba", width: 9 },
  "Obstacle net": { kind: "climb", color: "#9c8672", dark: "#8a7563", height: 34 }, "Icicle climb": { kind: "climb", color: "#d8ecf4", dark: "#8fb4c4", height: 40 }, "Rope ladder": { kind: "climb", color: "#9c8672", dark: "#6d5a48", height: 38 },
  "Rope swing": { kind: "swing", color: "#9c8672", dark: "#8a7563" }, "Palm swing": { kind: "swing", color: "#8a6a46", dark: "#6d5a48" },
  "Low wall": { kind: "wall", color: "#c8c5be", dark: "#9a968f" }, "Sandstone wall": { kind: "wall", color: "#d9c39a", dark: "#a8906a", height: 18 }, "Collapsed arch": { kind: "wall", color: "#c9b48a", dark: "#8f7a56", height: 24 },
  "Stepping stone": { kind: "stone", color: "#a39e96", dark: "#6d6b67" },
};
function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
/** Textures are drawn when they're big enough to see (zoomed out, flat colours are the same at a fraction of the cost). */
let texturesOn = true;
/** While set, boxes go to the GPU (gl.ts) instead of the canvas, and cut their outline out of the canvas layer. */
let capturing: RealmGL | null = null;
const rgbCache = new Map<string, readonly number[]>();
/** A CSS colour ("#rrggbb" or "rgb(r,g,b)") as 0–1 channels. */
function rgbOf(color: string): readonly number[] {
  let known = rgbCache.get(color);
  if (known) return known;
  if (color.startsWith("#")) { const n = parseInt(color.slice(1, 7), 16); known = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  else { const m = color.match(/[\d.]+/g) ?? ["0", "0", "0"]; known = [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255]; }
  rgbCache.set(color, known);
  return known;
}
/**
 * A box for the GPU: where it really stands (upstairs boxes are moved down to their real place and lifted), its face
 * textures (the same pixel art the canvas would have drawn) and colours; and its outline cut out of the canvas layer so
 * the GPU's box shows through, anything drawn before it (behind it) hidden. Lit windows still glow at night.
 */
function captureBox(ctx: CanvasRenderingContext2D, camera: Camera, x: number, y: number, w: number, d: number, h: number, top: string, left: string, right: string, lift: number, pattern: WallStyle | null) {
  const gl = capturing!;
  let rx = x, ry = y, rlift = lift;
  if (y >= FLOOR_Y - 0.5 && ground) { const floor = floorAt(ground, x, y); if (floor) { rx -= floor.dx; ry -= floor.dy; rlift += floor.level * STOREY; } }
  const variant = Math.abs(Math.floor(x * 7 + y * 13)) % 4;
  const face = (fill: string) => pattern && fill.startsWith("#") ? gl.wallLayers.layer(wallTexture(pattern, fill, variant)) : -1;
  const lid = pattern === "cap" && top.startsWith("#") ? gl.wallLayers.layer(wallTexture("cap", top, variant)) : -1;
  gl.addBox(rx, ry, w, d, rlift, h, face(left), face(right), lid, rgbOf(top), rgbOf(left), rgbOf(right));
  const hull = boxHull(camera, x, y, w, d, h, lift);
  ctx.save(); ctx.globalCompositeOperation = "destination-out"; ctx.globalAlpha = 1; ctx.fillStyle = "#000";
  ctx.beginPath(); hull.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fill(); ctx.restore();
  // Windows lit from inside, where their glass lands on screen (for the light pass, as the canvas renderer does).
  if (!bare && (pattern === "window_lit" || pattern === "timber_window_lit")) {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y - d / 2, y1 = y + d / 2;
    for (const [ax, ay, bx, by, nx, ny] of [[x0, y1, x1, y1, 0, 1], [x1, y1, x1, y0, 1, 0], [x1, y0, x0, y0, 0, -1], [x0, y0, x0, y1, -1, 0]] as const) {
      const { rx: fx, ry: fy } = rotate(camera, nx, ny);
      if (fx + fy <= 0.001) continue;
      const length = Math.hypot(bx - ax, by - ay), o = toScreen(camera, ax, ay, lift + h), across = toScreen(camera, bx, by, lift + h), down = toScreen(camera, ax, ay, lift);
      const cols = Math.max(1, Math.round(length * TEX_PER_TILE)), rows = Math.max(1, Math.min(24, Math.round(h * TEX_PER_HEIGHT))), topRow = PANE.top(pattern === "timber_window_lit");
      const at = (u: number, v: number): [number, number] => [o.x + (across.x - o.x) * u / cols + (down.x - o.x) * v / rows, o.y + (across.y - o.y) * u / cols + (down.y - o.y) * v / rows];
      if (rows >= topRow + PANE.h) emitted.push([at(PANE.x0, topRow), at(PANE.x0 + PANE.w, topRow), at(PANE.x0 + PANE.w, topRow + PANE.h), at(PANE.x0, topRow + PANE.h)]);
    }
  }
}
// ---------- The GPU's ground ----------
const CHUNK = 32;
/** A terrain's texture for the GPU: its colour with its pixel texture over it, one per variant (cached, so each is one texture layer). */
const groundLayerCanvas = new Map<number, HTMLCanvasElement>();
function groundLayer(glr: RealmGL, terrain: number, variant: number) {
  const key = terrain * 4 + variant;
  let canvas = groundLayerCanvas.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas"); canvas.width = TEX_PER_TILE; canvas.height = TEX_PER_TILE;
    const c = canvas.getContext("2d")!, color = TERRAIN_COLORS[terrain] ?? "#cccccc", style = GROUND_STYLE[terrain];
    c.fillStyle = color; c.fillRect(0, 0, TEX_PER_TILE, TEX_PER_TILE);
    if (style) c.drawImage(groundTexture(style, color, variant), 0, 0);
    groundLayerCanvas.set(key, canvas);
  }
  return glr.groundLayers.layer(canvas);
}
/** The ground of one chunk (CHUNK × CHUNK tiles) for the GPU: four vertices a tile (see GROUND_FLOATS in gl.ts). */
function groundChunkMesh(glr: RealmGL, world: World, cx: number, cy: number): Float32Array {
  const out: number[] = [];
  for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++) for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
    if (!inBounds(x, y)) continue;
    const terrain = world.tiles[y * W + x];
    if (terrain === T.VOID) continue;
    const hA = cornerHeight(world, x, y), hB = cornerHeight(world, x + 1, y), hC = cornerHeight(world, x + 1, y + 1), hD = cornerHeight(world, x, y + 1);
    const slope = Math.max(-0.22, Math.min(0.22, ((hA + hD) - (hB + hC) + (hA + hB) - (hD + hC)) * 0.011));
    const shadeAmount = (hash(x, y) - 0.5) * 0.035 + slope - (inDeadwood(world, x, y) ? 0.3 : 0);
    const layer = groundLayer(glr, terrain, Math.floor(hash(y, x) * 4)), mine = EDGE_CLASS[terrain];
    const edgeTo = (nx: number, ny: number) => { const other = inBounds(nx, ny) ? world.tiles[ny * W + nx] : T.VOID; return !(other === T.VOID || EDGE_CLASS[other] === mine || other === T.WALL || other === T.CLIFF); };
    const edges = (edgeTo(x, y - 1) ? 1 : 0) | (edgeTo(x + 1, y) ? 2 : 0) | (edgeTo(x, y + 1) ? 4 : 0) | (edgeTo(x - 1, y) ? 8 : 0);
    const kind = terrain === T.WATER ? 1 : terrain === T.DEEP ? 2 : terrain === T.LAVA ? 3 : 0;
    for (const [dx, dy, h, u, v] of [[-0.5, -0.5, hA, 0, 0], [0.5, -0.5, hB, 1, 0], [0.5, 0.5, hC, 1, 1], [-0.5, 0.5, hD, 0, 1]] as const) out.push(x + dx, y + dy, h, u, v, layer, shadeAmount, edges, kind);
  }
  return new Float32Array(out);
}
/** The chunks the view needs, built (and sent to the GPU) the first time they're asked for. */
function groundChunks(glr: RealmGL, game: Game, x0: number, y0: number, x1: number, y1: number): string[] {
  const world = game.world, version = game.worldVersion ?? 0, keys: string[] = [];
  glr.setHeights(world.heights, W, H);
  for (let cy = Math.floor(Math.max(0, y0) / CHUNK); cy <= Math.floor(Math.min(H - 1, y1) / CHUNK); cy++) for (let cx = Math.floor(Math.max(0, x0) / CHUNK); cx <= Math.floor(Math.min(W - 1, x1) / CHUNK); cx++) {
    const key = `${cx},${cy},${version}`;
    if (!glr.hasChunk(key)) glr.setChunk(key, groundChunkMesh(glr, world, cx, cy));
    keys.push(key);
  }
  return keys;
}
/** Cut a polygon out of the canvas layer (where the GPU's ground shows through). */
function punch(ctx: CanvasRenderingContext2D, points: readonly (readonly [number, number])[]) {
  ctx.save(); ctx.globalCompositeOperation = "destination-out"; ctx.globalAlpha = 1; ctx.fillStyle = "#000";
  ctx.beginPath(); points.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fill(); ctx.restore();
}
/** An isometric box on a tile footprint (w, d in tiles) and height h (world px). With a `pattern`, its faces are pixel-art textured. */
function box(ctx: CanvasRenderingContext2D, camera: Camera, x: number, y: number, w: number, d: number, h: number, top: string, left: string, right: string, lift = 0, stroke: string | null = INK, pattern: WallStyle | null = null, hidden?: (nx: number, ny: number) => boolean) {
  if (capturing) { captureBox(ctx, camera, x, y, w, d, h, top, left, right, lift, pattern); return; }
  const p = (px: number, py: number, z: number) => { const s = toScreen(camera, px, py, z); return [s.x, s.y] as const; };
  const q = (px: number, py: number, z: number) => toScreen(camera, px, py, z);
  const x0 = x - w / 2, x1 = x + w / 2, y0 = y - d / 2, y1 = y + d / 2, variant = Math.abs(Math.floor(x * 7 + y * 13)) % 4;
  const edges = new Path2D(), outline = (points: readonly (readonly [number, number])[]) => { points.forEach(([px, py], i) => i ? edges.lineTo(px, py) : edges.moveTo(px, py)); edges.closePath(); };
  // The four sides with their outward normals; draw the ones facing the camera, shaded by which way they face on screen.
  const sides: [number, number, number, number, number, number][] = [[x0, y1, x1, y1, 0, 1], [x1, y1, x1, y0, 1, 0], [x1, y0, x0, y0, 0, -1], [x0, y0, x0, y1, -1, 0]];
  for (const [ax, ay, bx, by, nx, ny] of sides) {
    const { rx, ry } = rotate(camera, nx, ny);
    if (rx + ry <= 0.001 || hidden?.(nx, ny)) continue;
    const fill = rx - ry < 0 ? left : right, corners = [p(ax, ay, lift), p(bx, by, lift), p(bx, by, lift + h), p(ax, ay, lift + h)] as const;
    if (pattern && texturesOn && fill.startsWith("#") && Math.abs(corners[1][0] - corners[0][0]) + Math.abs(corners[3][1] - corners[0][1]) > 10) {
      const length = Math.hypot(bx - ax, by - ay);
      const o = q(ax, ay, lift + h), across = q(bx, by, lift + h), down = q(ax, ay, lift);
      texturedQuad(ctx, wallTexture(pattern, fill, variant), o, across, down, length * TEX_PER_TILE, h * TEX_PER_HEIGHT);
      // A window lit from inside: where its glass landed on screen, so the light pass can let it shine.
      if (!bare && (pattern === "window_lit" || pattern === "timber_window_lit")) {
        const cols = Math.max(1, Math.round(length * TEX_PER_TILE)), rows = Math.max(1, Math.min(24, Math.round(h * TEX_PER_HEIGHT))), top = PANE.top(pattern === "timber_window_lit");
        const at = (u: number, v: number): [number, number] => [o.x + (across.x - o.x) * u / cols + (down.x - o.x) * v / rows, o.y + (across.y - o.y) * u / cols + (down.y - o.y) * v / rows];
        if (rows >= top + PANE.h) emitted.push([at(PANE.x0, top), at(PANE.x0 + PANE.w, top), at(PANE.x0 + PANE.w, top + PANE.h), at(PANE.x0, top + PANE.h)]);
      }
    } else poly(ctx, corners, fill, null);
    outline(corners);
  }
  const lid = [p(x0, y0, lift + h), p(x1, y0, lift + h), p(x1, y1, lift + h), p(x0, y1, lift + h)] as const;
  if (pattern && texturesOn && pattern === "cap" && top.startsWith("#")) texturedQuad(ctx, wallTexture("cap", top, variant), q(x0, y0, lift + h), q(x1, y0, lift + h), q(x0, y1, lift + h), w * TEX_PER_TILE, d * TEX_PER_TILE);
  else poly(ctx, lid, top, null);
  outline(lid);
  // Every face's ink edge in one stroke (shared edges would otherwise be drawn twice, and each stroke is a draw call).
  if (stroke && !bare) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(edges); }
}

// ---------- Terrain ----------
const CONTOUR = 10;
/** Shaded terrain fills, cached (the same few hundred colours every frame). */
const fillCache = new Map<number, string>();
const terrainFill = (terrain: number, variation: number) => {
  const key = terrain * 1000 + Math.round((variation + 0.5) * 400);
  let fill = fillCache.get(key);
  if (!fill) { fill = shade(TERRAIN_COLORS[terrain] ?? "#cccccc", variation); fillCache.set(key, fill); }
  return fill;
};
const isWaterTerrain = (terrain: number) => terrain === T.WATER || terrain === T.DEEP;
/**
 * The tiles x0–x1, y0–y1 back to front for the camera's angle (packed as index into the rectangle), so a hill or a
 * snowy peak is never painted over by the land behind it however the camera is turned. A counting sort on depth.
 */
let orderBuffer = new Int32Array(0), orderKeys = new Int32Array(0), orderCounts = new Int32Array(0);
function terrainOrder(camera: Camera, x0: number, y0: number, x1: number, y1: number) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1, n = w * h, c = Math.cos(camera.angle), s = Math.sin(camera.angle), wx = c + s, wy = c - s;
  if (orderBuffer.length < n) { orderBuffer = new Int32Array(n); orderKeys = new Int32Array(n); }
  const base = Math.min(0, wx * (w - 1)) + Math.min(0, wy * (h - 1)), span = Math.abs(wx) * (w - 1) + Math.abs(wy) * (h - 1), buckets = Math.ceil(span * 4) + 2;
  if (orderCounts.length < buckets + 1) orderCounts = new Int32Array(buckets + 1);
  const counts = orderCounts.fill(0, 0, buckets + 1);
  for (let j = 0, k = 0; j < h; j++) for (let i = 0; i < w; i++, k++) { const key = Math.round((wx * i + wy * j - base) * 4); orderKeys[k] = key; counts[key + 1]++; }
  for (let b = 1; b <= buckets; b++) counts[b] += counts[b - 1];
  for (let k = 0; k < n; k++) orderBuffer[counts[orderKeys[k]]++] = k;
  return orderBuffer.subarray(0, n);
}
/**
 * One ground tile drawn again, as the terrain pass drew it (fill, pixel texture, inked edges and contours): for a ridge
 * that has to cover something standing behind it. Returns its corners on screen.
 */
function groundTile(ctx: CanvasRenderingContext2D, scene: Scene, x: number, y: number, draw = true): [number, number][] {
  const { camera, game } = scene, world = game.world, z = camera.zoom, terrain = world.tiles[y * W + x];
  const flat = (dx: number, dy: number) => { const { rx, ry } = rotate(camera, dx, dy); return { x: (rx - ry) * TILE_W / 2 * z, y: (rx + ry) * TILE_W / 2 * camera.pitch * z }; };
  const ex = flat(0.5, 0), ey = flat(0, 0.5), lifted = liftScale(camera) * z, { x: sx, y: sy } = toScreen(camera, x, y);
  const hA = cornerHeight(world, x, y), hB = cornerHeight(world, x + 1, y), hC = cornerHeight(world, x + 1, y + 1), hD = cornerHeight(world, x, y + 1), hMid = (hA + hB + hC + hD) / 4;
  const ax = sx - ex.x - ey.x, ay = sy - ex.y - ey.y - (hA - hMid) * lifted, bx = sx + ex.x - ey.x, by = sy + ex.y - ey.y - (hB - hMid) * lifted;
  const cx = sx + ex.x + ey.x, cy = sy + ex.y + ey.y - (hC - hMid) * lifted, dx = sx - ex.x + ey.x, dy = sy - ex.y + ey.y - (hD - hMid) * lifted;
  const corners: [number, number][] = [[ax, ay], [bx, by], [cx, cy], [dx, dy]];
  if (!draw) return corners;
  const slope = Math.max(-0.22, Math.min(0.22, ((hA + hD) - (hB + hC) + (hA + hB) - (hD + hC)) * 0.011));
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath();
  ctx.fillStyle = terrainFill(terrain, (hash(x, y) - 0.5) * 0.035 + slope - (inDeadwood(world, x, y) ? 0.3 : 0)); ctx.fill();
  const style = GROUND_STYLE[terrain], hh = TILE_W / 2 * z * camera.pitch;
  if (texturesOn && style && hh >= 5) texturedQuad(ctx, groundTexture(style, TERRAIN_COLORS[terrain], Math.floor(hash(y, x) * 4)), { x: ax, y: ay }, { x: bx, y: by }, { x: dx, y: dy }, TEX_PER_TILE, TEX_PER_TILE);
  if (bare) return corners;
  const edges = new Path2D(), contours = new Path2D(), mine = EDGE_CLASS[terrain];
  const edge = (nx: number, ny: number, px: number, py: number, qx: number, qy: number) => {
    const other = inBounds(nx, ny) ? world.tiles[ny * W + nx] : T.VOID;
    if (other === T.VOID || EDGE_CLASS[other] === mine || other === T.WALL || other === T.CLIFF) return;
    edges.moveTo(px, py); edges.lineTo(qx, qy);
  };
  edge(x, y - 1, ax, ay, bx, by); edge(x + 1, y, bx, by, cx, cy); edge(x, y + 1, cx, cy, dx, dy); edge(x - 1, y, dx, dy, ax, ay);
  const hs = [hA, hB, hC, hD], lo = Math.floor(Math.min(...hs) / CONTOUR), hi = Math.floor(Math.max(...hs) / CONTOUR);
  for (let level = lo + 1; level <= hi; level++) {
    const at = level * CONTOUR, cross: [number, number][] = [];
    for (let e = 0; e < 4; e++) { const h0 = hs[e], h1 = hs[(e + 1) % 4]; if ((h0 < at) !== (h1 < at)) { const t = (at - h0) / (h1 - h0), [x0, y0] = corners[e], [x1, y1] = corners[(e + 1) % 4]; cross.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); } }
    for (let k = 0; k + 1 < cross.length; k += 2) { contours.moveTo(cross[k][0], cross[k][1]); contours.lineTo(cross[k + 1][0], cross[k + 1][1]); }
  }
  ctx.strokeStyle = "rgba(22,22,22,0.16)"; ctx.lineWidth = 1; ctx.stroke(contours);
  ctx.strokeStyle = "rgba(22,22,22,0.55)"; ctx.lineWidth = Math.max(0.8, z); ctx.stroke(edges);
  return corners;
}
/**
 * The ground: fills, pixel textures, inked edges and contours (`still`), and the water and lava that move (`motion`).
 * Tiles are culled to the view plus `pad` screen pixels; `from`–`to` is the slice of the back-to-front order to draw
 * (the terrain cache paints itself over a few frames).
 */
function drawTerrain(ctx: CanvasRenderingContext2D, scene: Scene, camera: Camera, x0: number, y0: number, x1: number, y1: number, pad = 0, mode: "all" | "still" | "motion" = "all", from = 0, to = 1) {
  const { game, now } = scene, world = game.world, z = camera.zoom, hw = TILE_W / 2 * z, hh = hw * camera.pitch;
  const animate = !scene.reducedMotion, t = animate ? now / 1000 : 0;
  if (mode === "motion" && !animate) return;
  // Screen offsets of half a tile along world x and y: tile corners are centre ± ex ± ey at any camera angle.
  const flat = (dx: number, dy: number) => { const { rx, ry } = rotate(camera, dx, dy); return { x: (rx - ry) * TILE_W / 2 * z, y: (rx + ry) * TILE_W / 2 * camera.pitch * z }; };
  const o = { x: 0, y: 0 }, px = flat(0.5, 0), py = flat(0, 0.5);
  const ex = { x: px.x - o.x, y: px.y - o.y }, ey = { x: py.x - o.x, y: py.y - o.y }, ls = liftScale(camera);
  // Inked edges and contour lines go into two paths, stroked once per depth row as the ground is laid back to front:
  // stroked all at the end they showed through any rising ground nearer the camera (worst on white snow, where the
  // hills behind drew their lines straight across the snowfield). Texture is left off tiles too small or far to show it.
  let edges = new Path2D(), contours = new Path2D(), pending = false, row = -1;
  const small = hh < 5, near = scene.low ? 16 : 34;
  const flush = () => {
    if (!pending) return;
    ctx.strokeStyle = "rgba(22,22,22,0.16)"; ctx.lineWidth = 1; ctx.stroke(contours);
    ctx.strokeStyle = "rgba(22,22,22,0.55)"; ctx.lineWidth = Math.max(0.8, z); ctx.stroke(edges);
    edges = new Path2D(); contours = new Path2D(); pending = false;
  };
  const order = terrainOrder(camera, x0, y0, x1, y1), kEnd = Math.round(order.length * to);
  for (let k = Math.round(order.length * from); k < kEnd; k++) {
    const packed = order[k], x = x0 + packed % (x1 - x0 + 1), y = y0 + Math.floor(packed / (x1 - x0 + 1));
    if (mode !== "motion" && orderKeys[packed] !== row) { flush(); row = orderKeys[packed]; }
    if (!inBounds(x, y)) continue;
    const terrain = world.tiles[y * W + x];
    if (terrain === T.VOID) continue;
    // Water and lava move: the cached ground leaves them to the frame.
    const moving = animate && (terrain === T.WATER || terrain === T.DEEP || terrain === T.LAVA);
    if (mode === "motion" && !moving) continue;
    const { x: sx, y: sy } = toScreen(camera, x, y);
    if (sx < -hw * 2 - pad || sx > VIEW.width + hw * 2 + pad || sy < -hh * 2 - pad || sy > VIEW.height + hh * 4 + pad) continue;
    // Corner heights lift each corner off the tile centre; slopes facing the north-west light are brighter.
    const hA = cornerHeight(world, x, y), hB = cornerHeight(world, x + 1, y), hC = cornerHeight(world, x + 1, y + 1), hD = cornerHeight(world, x, y + 1), hMid = (hA + hB + hC + hD) / 4;
    const slope = Math.max(-0.22, Math.min(0.22, ((hA + hD) - (hB + hC) + (hA + hB) - (hD + hC)) * 0.011));
    // The Deadwood's ground is darker than anywhere: the wood's own earth, and no sun has reached it in an age.
    const variation = (hash(x, y) - 0.5) * 0.035 + slope - (inDeadwood(world, x, y) ? 0.3 : 0), lifted = ls * z;
    const ax = sx - ex.x - ey.x, ay = sy - ex.y - ey.y - (hA - hMid) * lifted, bx = sx + ex.x - ey.x, by = sy + ex.y - ey.y - (hB - hMid) * lifted;
    const cx = sx + ex.x + ey.x, cy = sy + ex.y + ey.y - (hC - hMid) * lifted, dx = sx - ex.x + ey.x, dy = sy - ex.y + ey.y - (hD - hMid) * lifted;
    if (mode !== "motion") {
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath();
      ctx.fillStyle = terrainFill(terrain, variation); ctx.fill();
    }
    // Texture details.
    const h = hash(y, x), detailed = !small && Math.abs(x - camera.x) + Math.abs(y - camera.y) < near, style = GROUND_STYLE[terrain];
    if (detailed && (mode === "still" ? moving : mode === "motion" ? !moving : false)) { /* the other pass draws it */ }
    else if (detailed && texturesOn && style) {
      // Pixel texture mapped onto the tile (corners a, b along x, d along y), in the same style as the buildings.
      texturedQuad(ctx, groundTexture(style, TERRAIN_COLORS[terrain], Math.floor(h * 4)), { x: ax, y: ay }, { x: bx, y: by }, { x: dx, y: dy }, TEX_PER_TILE, TEX_PER_TILE);
    } else if (detailed) {
      ctx.strokeStyle = "rgba(22,22,22,0.22)"; ctx.fillStyle = "rgba(22,22,22,0.18)"; ctx.lineWidth = Math.max(0.6, z * 0.8);
      switch (terrain) {
        case T.GRASS: case T.DARK_GRASS:
          if (h < (terrain === T.DARK_GRASS ? 0.55 : 0.3)) {
            const ox = (h - 0.25) * hw * 1.4, oy = (hash(x + 3, y) - 0.5) * hh;
            ctx.beginPath(); ctx.moveTo(sx + ox - 2 * z, sy + oy); ctx.lineTo(sx + ox - 1 * z, sy + oy - 4 * z); ctx.moveTo(sx + ox + 1 * z, sy + oy); ctx.lineTo(sx + ox + 2 * z, sy + oy - 5 * z); ctx.stroke();
          }
          break;
        case T.PATH: case T.SAND: case T.GRAVEL: case T.SNOW:
          if (h < 0.6) { ctx.fillRect(sx + (h - 0.3) * hw, sy + (hash(x, y + 5) - 0.5) * hh, 1.5 * z, 1.5 * z); ctx.fillRect(sx - (h - 0.2) * hw * 0.8, sy - (hash(x + 9, y) - 0.5) * hh * 0.8, 1.2 * z, 1.2 * z); }
          break;
        case T.COBBLE: case T.STONE: case T.BRICK:
          ctx.beginPath(); ctx.moveTo(sx - hw / 2, sy - hh / 2); ctx.lineTo(sx + hw / 2, sy + hh / 2); ctx.moveTo(sx + hw / 2, sy - hh / 2); ctx.lineTo(sx - hw / 2, sy + hh / 2); ctx.stroke();
          break;
        case T.WOOD: case T.BRIDGE:
          ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(sx - hw / 2 + i * hw / 3, sy - hh / 2 - i * hh / 3 + hh / 6); ctx.lineTo(sx + hw / 2 + i * hw / 3, sy + hh / 2 - i * hh / 3 - hh / 6); } ctx.stroke();
          break;
        case T.FARMLAND:
          ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(sx - hw * 0.6 + i * hw * 0.35, sy + i * hh * 0.35 - hh * 0.3); ctx.lineTo(sx + hw * 0.1 + i * hw * 0.35, sy + i * hh * 0.35 + hh * 0.3); } ctx.stroke();
          break;
        case T.WATER: case T.DEEP: {
          ctx.strokeStyle = terrain === T.DEEP ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.45)";
          const phase = Math.sin(t * 1.6 + x * 0.9 + y * 0.6) * 3 * z;
          if (h < 0.5) { ctx.beginPath(); ctx.moveTo(sx - 8 * z + phase, sy - 2 * z); ctx.quadraticCurveTo(sx + phase, sy - 5 * z, sx + 8 * z + phase, sy - 2 * z); ctx.stroke(); }
          break;
        }
        case T.LAVA: {
        const glowing = 0.5 + Math.sin(t * 2 + x * 1.3 + y * 0.7) * 0.5;
        ctx.fillStyle = `rgba(250,${200 + Math.round(glowing * 40)},120,${0.25 + glowing * 0.35})`; ctx.beginPath(); ctx.ellipse(sx + (h - 0.5) * hw * 0.6, sy, 7 * z, 3 * z, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case T.ASH: if (h < 0.4) { ctx.fillStyle = "rgba(22,22,22,0.22)"; ctx.fillRect(sx + (h - 0.2) * hw, sy + (hash(x + 2, y) - 0.5) * hh, 2 * z, 1.5 * z); } break;
      case T.SWAMP: if (h < 0.35) ellipse(ctx, sx + (h - 0.2) * hw, sy, 5 * z, 2.5 * z, "rgba(60,70,50,0.18)", null); break;
        case T.DUNGEON: if (h < 0.25) { ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.moveTo(sx - 6 * z, sy); ctx.lineTo(sx, sy + 2 * z); ctx.lineTo(sx + 4 * z, sy - 1 * z); ctx.stroke(); } break;
        case T.CARPET: ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.moveTo(sx, sy - hh * 0.6); ctx.lineTo(sx + hw * 0.6, sy); ctx.lineTo(sx, sy + hh * 0.6); ctx.lineTo(sx - hw * 0.6, sy); ctx.closePath(); ctx.stroke(); break;
      }
    }
    if (mode === "motion") continue;
    // Inked edges where the terrain class changes.
    const mine = EDGE_CLASS[terrain];
    const edge = (nx: number, ny: number, ax: number, ay: number, bx: number, by: number) => {
      const other = inBounds(nx, ny) ? world.tiles[ny * W + nx] : T.VOID;
      if (other === T.VOID || EDGE_CLASS[other] === mine || other === T.WALL || other === T.CLIFF) return;
      edges.moveTo(ax, ay); edges.lineTo(bx, by); pending = true;
    };
    edge(x, y - 1, ax, ay, bx, by);
    edge(x + 1, y, bx, by, cx, cy);
    edge(x, y + 1, cx, cy, dx, dy);
    edge(x - 1, y, dx, dy, ax, ay);
    // Contour lines every CONTOUR pixels of height (marching squares on the tile), like a topographic map.
    if (!isWaterTerrain(terrain) && !small) {
      const lo = Math.floor(Math.min(hA, hB, hC, hD) / CONTOUR), hi = Math.floor(Math.max(hA, hB, hC, hD) / CONTOUR);
      if (hi > lo) {
        const pts: [number, number][] = [[ax, ay], [bx, by], [cx, cy], [dx, dy]], hs = [hA, hB, hC, hD];
        for (let level = lo + 1; level <= hi; level++) {
          const at = level * CONTOUR, cross: [number, number][] = [];
          for (let e = 0; e < 4; e++) {
            const h0 = hs[e], h1 = hs[(e + 1) % 4];
            if ((h0 < at) !== (h1 < at)) { const t = (at - h0) / (h1 - h0), [x0, y0] = pts[e], [x1, y1] = pts[(e + 1) % 4]; cross.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); }
          }
          for (let k = 0; k + 1 < cross.length; k += 2) { contours.moveTo(cross[k][0], cross[k][1]); contours.lineTo(cross[k + 1][0], cross[k + 1][1]); pending = true; }
        }
      }
    }
  }
  if (mode === "motion") return;
  flush();
}

// ---------- Terrain cache ----------
/**
 * The ground doesn't change from frame to frame while you walk: the camera only slides. So the still parts of the
 * terrain (fills, textures, edges, contours) are painted once onto a canvas a little bigger than the view, and each
 * frame that canvas is laid down at the camera's offset; only the water and lava are drawn live over it. When the
 * camera turns, zooms or tilts the ground is drawn straight to the frame as before. A slide past a third of the
 * margin starts a fresh canvas, painted a quarter per frame so there's no hitch, and swapped in when it's done.
 */
const TERRAIN_PAD = 160;
const TERRAIN_STEPS = 4;
type GroundSnap = { camera: Camera; key: string; world: World };
type GroundCanvas = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; snap: GroundSnap; range: [number, number, number, number]; step: number };
let groundReady: GroundCanvas | null = null, groundBuild: GroundCanvas | null = null, groundKeyPrev = "";
/** Canvases not in use (two at most: the one shown and the one being painted swap over and over). */
const groundSpare: [HTMLCanvasElement, CanvasRenderingContext2D][] = [];
const groundCanvas = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const spare = groundSpare.pop();
  if (spare) return spare;
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d")!;
  return [canvas, ctx];
};
const dropGround = (ground: GroundCanvas | null) => { if (ground && groundSpare.length < 2) groundSpare.push([ground.canvas, ground.ctx]); };
/** The tiles the view (plus `pad` screen pixels) can see, clamped to `reach` tiles from the camera. */
function tileRange(camera: Camera, reach: number, pad = 0): [number, number, number, number] {
  const corners = [toTile(camera, -pad, -pad, false), toTile(camera, VIEW.width + pad, -pad, false), toTile(camera, -pad, VIEW.height + pad, false), toTile(camera, VIEW.width + pad, VIEW.height + pad, false)];
  const cx = Math.round(camera.x), cy = Math.round(camera.y);
  const x0 = Math.max(cx - reach, Math.min(...corners.map(c => c.x)) - 2), x1 = Math.min(cx + reach, Math.max(...corners.map(c => c.x)) + 3);
  const y0 = Math.max(cy - reach, Math.min(...corners.map(c => c.y)) - 2), y1 = Math.min(cy + reach, Math.max(...corners.map(c => c.y)) + 3);
  return [x0, y0, x1, y1];
}
/** Where a point painted at the snapshot's camera lands now: the camera's slide (and its rise) on screen. */
function groundShift(now: Camera, snap: Camera) {
  const { rx, ry } = rotate(now, snap.x - now.x, snap.y - now.y), half = TILE_W / 2 * now.zoom;
  return { dx: (rx - ry) * half, dy: (rx + ry) * half * now.pitch + ((now.base ?? 0) - (snap.base ?? 0)) * liftScale(now) * now.zoom };
}
function startGround(scene: Scene, snap: GroundSnap, reach: number): GroundCanvas {
  const [canvas, ctx] = groundCanvas();
  const w = VIEW.width + TERRAIN_PAD * 2, h = VIEW.height + TERRAIN_PAD * 2;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); ctx.setTransform(1, 0, 0, 1, TERRAIN_PAD, TERRAIN_PAD);
  return { canvas, ctx, snap, range: tileRange(snap.camera, reach, TERRAIN_PAD), step: 0 };
}
/** Paint the next slice of a ground canvas; true when it's complete. */
function paintGround(target: CanvasRenderingContext2D, scene: Scene, build: GroundCanvas, steps: number) {
  const [x0, y0, x1, y1] = build.range;
  // Textured quads compose with the canvas's base transform: the build canvas's while painting it, the frame's after.
  beginTextures(build.ctx);
  while (steps-- > 0 && build.step < TERRAIN_STEPS) { drawTerrain(build.ctx, scene, build.snap.camera, x0, y0, x1, y1, TERRAIN_PAD, "still", build.step / TERRAIN_STEPS, (build.step + 1) / TERRAIN_STEPS); build.step++; }
  beginTextures(target);
  return build.step >= TERRAIN_STEPS;
}
/** The ground for this frame: from the cache where it can be, drawn fresh where it can't. */
function drawGround(target: CanvasRenderingContext2D, scene: Scene, x0: number, y0: number, x1: number, y1: number, reach: number) {
  const { camera, game } = scene, world = game.world;
  const key = `${camera.angle.toFixed(4)}|${camera.zoom.toFixed(3)}|${camera.pitch.toFixed(3)}|${VIEW.width}x${VIEW.height}|${scene.low ? 1 : 0}${texturesOn ? 1 : 0}${scene.reducedMotion ? 1 : 0}|${game.worldVersion ?? 0}|${viewFloor ? `${viewFloor.complex}:${viewFloor.level}` : ""}`;
  const snapOf = (): GroundSnap => ({ camera: { ...camera }, key, world });
  const usable = (ground: GroundCanvas | null) => {
    if (!ground || ground.snap.key !== key || ground.snap.world !== world) return null;
    const { dx, dy } = groundShift(camera, ground.snap.camera);
    return Math.abs(dx) <= TERRAIN_PAD && Math.abs(dy) <= TERRAIN_PAD ? { dx, dy } : null;
  };
  // A build under way carries on while it's still wanted (one slice a frame), and takes over once it's whole.
  if (groundBuild && (groundBuild.snap.key !== key || groundBuild.snap.world !== world)) { dropGround(groundBuild); groundBuild = null; }
  if (groundBuild && paintGround(target, scene, groundBuild, 1)) { dropGround(groundReady); groundReady = groundBuild; groundBuild = null; }
  let fit = usable(groundReady);
  if (!fit) {
    if (key !== groundKeyPrev) {
      // Turning, zooming or tilting: straight to the frame, as every frame would differ.
      groundKeyPrev = key; dropGround(groundReady); dropGround(groundBuild); groundReady = groundBuild = null;
      drawTerrain(target, scene, camera, x0, y0, x1, y1); RENDER_PROFILE.groundCached = 0; return;
    }
    // Settled, but nothing cached yet: paint the canvas a slice a frame (drawing straight to the frame meanwhile), so
    // the frames after a turn or a zoom carry a quarter of the work each rather than one of them all of it.
    if (!groundBuild) { groundBuild = startGround(scene, snapOf(), reach); if (paintGround(target, scene, groundBuild, 1)) { dropGround(groundReady); groundReady = groundBuild; groundBuild = null; } }
    fit = usable(groundReady);
    if (!fit) { drawTerrain(target, scene, camera, x0, y0, x1, y1); RENDER_PROFILE.groundCached = 0; return; }
  }
  groundKeyPrev = key;
  target.imageSmoothingEnabled = false;
  target.drawImage(groundReady!.canvas, Math.round(fit.dx) - TERRAIN_PAD, Math.round(fit.dy) - TERRAIN_PAD);
  drawTerrain(target, scene, camera, x0, y0, x1, y1, 0, "motion");
  RENDER_PROFILE.groundCached = 1;
  // Slid a good way: start on a canvas centred where the camera is now.
  if (!groundBuild && (Math.abs(fit.dx) > TERRAIN_PAD / 3 || Math.abs(fit.dy) > TERRAIN_PAD / 3)) groundBuild = startGround(scene, snapOf(), reach);
}

// ---------- Footprints ----------
/** Prints left in snow and sand (a pair of paw prints, or a mount's hoofprints), fading over a while. */
type Print = { x: number; y: number; hx: number; hy: number; at: number; hoof: boolean; snow: boolean };
const prints: Print[] = [];
const PRINT_MS = 14_000;
export function addPrint(x: number, y: number, hx: number, hy: number, hoof: boolean, snow: boolean) {
  if (prints.length > 160) prints.shift();
  prints.push({ x, y, hx, hy, at: performance.now(), hoof, snow });
}
function drawPrints(ctx: CanvasRenderingContext2D, camera: Camera, now: number) {
  while (prints.length && now - prints[0].at > PRINT_MS) prints.shift();
  const z = camera.zoom;
  for (const print of prints) {
    if (Math.abs(print.x - camera.x) + Math.abs(print.y - camera.y) > 40) continue;
    const fade = 1 - (now - print.at) / PRINT_MS, length = Math.hypot(print.hx, print.hy) || 1, fx = print.hx / length, fy = print.hy / length, sx = -fy, sy = fx;
    const color = print.snow ? `rgba(104,120,150,${(0.6 * fade).toFixed(3)})` : `rgba(112,86,52,${(0.55 * fade).toFixed(3)})`;
    // Two marks side by side, one a little ahead of the other (or a mount's four hooves).
    const marks: [number, number][] = print.hoof ? [[0.14, 0.18], [-0.14, 0.02], [0.14, -0.14], [-0.14, -0.3]] : [[0.12, 0.1], [-0.12, -0.12]];
    for (const [side, ahead] of marks) {
      const p = toScreen(camera, print.x + sx * side + fx * ahead, print.y + sy * side + fy * ahead);
      if (print.hoof) { ctx.strokeStyle = color; ctx.lineWidth = 1.6 * z; ctx.beginPath(); ctx.ellipse(p.x, p.y, 3.2 * z, 1.8 * z, 0, Math.PI * 0.1, Math.PI * 0.9, true); ctx.stroke(); }
      else { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(p.x, p.y, 3.4 * z, 1.9 * z, 0, 0, Math.PI * 2); ctx.fill(); for (const toe of [-2.6, 0, 2.6]) ctx.fillRect(p.x + toe * z - 0.8 * z, p.y - 3.4 * z, 1.6 * z, 1.4 * z); }
    }
  }
}

// ---------- Objects ----------
/** How far from the camera (tiles) sprites cast their own shadows; beyond it the haze hides them. */
const SHADOW_REACH = 30;
/** Decorations lying flat on the ground: they cast no shadow. */
const FLAT_DECOR = new Set(["flowers", "lily", "rubble", "reeds", "grave", "bones"]);
/** Pixel art scale: two world pixels per art pixel. */
const ART = 2;
/** Trees drawn as scenery was: palms, pines and dead trees keep their old look, and show a stump when they're cut. */
const DECOR_TREES: Partial<Record<string, DecorKind>> = { palm: "palm", pine: "pine", deadwood: "dead_tree" };
function drawTree(ctx: CanvasRenderingContext2D, scene: Scene, object: WorldObject, depleted: boolean, alpha: number, shake: number) {
  const camera = scene.camera, z = camera.zoom, { x: sx, y: sy } = toScreen(camera, object.x, object.y), variant = Math.floor(hash(object.x, object.y) * 4);
  const asDecor = DECOR_TREES[object.tree!];
  if (asDecor) {
    if (depleted) { box(ctx, camera, object.x, object.y, 0.45, 0.45, 8, "#9c8672", "#8a7563", "#7a6553"); return { x: sx - 12 * z, y: sy - 14 * z, w: 24 * z, h: 20 * z }; }
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(shake * z, 0);
    const rect = drawDecor(ctx, scene, { ...object, kind: "decor", decor: asDecor }, alpha);
    ctx.restore(); return rect;
  }
  if (Math.abs(object.x - camera.x) + Math.abs(object.y - camera.y) < HAZE_START) ellipse(ctx, sx, sy + 1 * z, (depleted ? 9 : 17) * z, (depleted ? 4 : 7) * z, "rgba(22,22,22,0.14)", null);
  return drawPixels(ctx, treeArt(object.tree!, variant, depleted), sx + shake * z, sy + 3 * z, ART * z, alpha);
}
function drawRock(ctx: CanvasRenderingContext2D, camera: Camera, object: WorldObject, depleted: boolean) {
  const z = camera.zoom, { x: sx, y: sy } = toScreen(camera, object.x, object.y), rock = ROCKS[object.rock!];
  ellipse(ctx, sx, sy + 2 * z, 18 * z, 6 * z, "rgba(22,22,22,0.14)", null);
  return drawPixels(ctx, rockArt(rock.color, Math.floor(hash(object.x, object.y) * 3), depleted), sx, sy + 5 * z, ART * z);
}
function drawSpot(ctx: CanvasRenderingContext2D, camera: Camera, object: WorldObject, now: number, reduced: boolean) {
  const z = camera.zoom, { x: sx, y: sy } = toScreen(camera, object.x, object.y), t = reduced ? 0.5 : (now / 1400 + hash(object.x, object.y)) % 1;
  ellipse(ctx, sx, sy, 20 * z, 9 * z, object.spot === "deep" ? "rgba(40,60,90,0.35)" : "rgba(60,90,120,0.22)", null);
  for (const phase of [t, (t + 0.33) % 1, (t + 0.66) % 1]) {
    ctx.globalAlpha = 1 - phase; ctx.beginPath(); ctx.ellipse(sx, sy, (4 + phase * 18) * z, (2 + phase * 9) * z, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(22,22,22,0.35)"; ctx.lineWidth = 2.6 * z; ctx.stroke(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4 * z; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (!reduced && Math.sin(now / 500 + object.x * 7) > 0.75) { ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * z; ctx.beginPath(); ctx.arc(sx + 4 * z, sy + 2 * z, 6 * z, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  if (!reduced) for (let i = 0; i < 3; i++) { const b = (now / 600 + i / 3) % 1; ellipse(ctx, sx + (i - 1) * 5 * z, sy - b * 10 * z, 1.5 * z, 1.5 * z, "rgba(255,255,255,0.8)", null); }
  return { x: sx - 18 * z, y: sy - 12 * z, w: 36 * z, h: 22 * z };
}
/**
 * A small roof for a structure smaller than a building (a coop, a windmill's cap): a gable prism with its ridge along x,
 * or a four-sided cone, its faces drawn back to front, shingled like the buildings' roofs.
 */
function miniRoof(ctx: CanvasRenderingContext2D, camera: Camera, cx: number, cy: number, w: number, d: number, base: number, rise: number, color: string, kind: "gable" | "cone", gable = "#b88a5e") {
  type V = readonly [number, number, number];
  const X0 = cx - w / 2, X1 = cx + w / 2, Y0 = cy - d / 2, Y1 = cy + d / 2, top = base + rise;
  const A: V = [X0, Y0, base], B: V = [X1, Y0, base], C: V = [X1, Y1, base], D: V = [X0, Y1, base];
  const at = ([x, y, h]: V) => toScreen(camera, x, y, h), P = (v: V) => { const s = at(v); return [s.x, s.y] as const; };
  const centre = (points: V[]) => depthOf(camera, points.reduce((sum, v) => sum + v[0], 0) / points.length, points.reduce((sum, v) => sum + v[1], 0) / points.length) + points.reduce((sum, v) => sum + v[2], 0) / points.length * 0.0001;
  const lit = (nx: number, ny: number) => { const { rx, ry } = rotate(camera, nx, ny); return rx - ry < 0; };
  type Face = { points: V[]; draw: () => void };
  const faces: Face[] = [];
  if (kind === "gable") {
    const R0: V = [X0, cy, top], R1: V = [X1, cy, top], rows = Math.hypot(d / 2 * TEX_PER_TILE, rise * TEX_PER_HEIGHT), cols = w * TEX_PER_TILE;
    const slope = (e0: V, e1: V, r0: V, r1: V, ny: number) => ({ points: [e0, e1, r1, r0], draw: () => {
      const fill = shadeHex(color, lit(0, ny) ? 0.06 : -0.08);
      if (texturesOn) texturedQuad(ctx, shingleTexture(fill, Math.max(1, Math.round(cols)), Math.max(1, Math.round(rows))), at(r0), at(r1), at(e0), cols, rows);
      poly(ctx, [e0, e1, r1, r0].map(P), texturesOn ? null : fill, INK, 1.1);
    } });
    faces.push(slope(A, B, R0, R1, -1), slope(D, C, R0, R1, 1));
    faces.push({ points: [A, D, R0], draw: () => poly(ctx, [A, D, R0].map(P), shadeHex(gable, lit(-1, 0) ? 0.05 : -0.1), INK, 1.1) });
    faces.push({ points: [B, C, R1], draw: () => poly(ctx, [B, C, R1].map(P), shadeHex(gable, lit(1, 0) ? 0.05 : -0.1), INK, 1.1) });
  } else {
    const apex: V = [cx, cy, top], slant = Math.hypot(w / 2 * TEX_PER_TILE, rise * TEX_PER_HEIGHT);
    for (const [a, b, nx, ny] of [[A, B, 0, -1], [B, C, 1, 0], [C, D, 0, 1], [D, A, -1, 0]] as const) faces.push({ points: [a, b, apex], draw: () => {
      const fill = shadeHex(color, lit(nx, ny) ? 0.06 : -0.08), [pa, pb, pc] = [a, b, apex].map(at);
      if (texturesOn) texturedTriangle(ctx, shingleTexture(fill, Math.max(1, Math.round(w * TEX_PER_TILE)), Math.max(1, Math.round(slant))), pa, pb, pc, w * TEX_PER_TILE, slant);
      poly(ctx, [a, b, apex].map(P), texturesOn ? null : fill, INK, 1.1);
    } });
  }
  faces.sort((a, b) => centre(a.points) - centre(b.points)).forEach(face => face.draw());
}
/** The side of a small structure that faces the camera most (its outward normal on the ground). */
function frontSide(camera: Camera) {
  let face = [0, 1], best = -Infinity;
  for (const [nx, ny] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { const { rx, ry } = rotate(camera, nx, ny); if (rx + ry > best) { best = rx + ry; face = [nx, ny]; } }
  return face as [number, number];
}
/** A henhouse on stilts: plank walls, a shingled gable roof, a pop-hole on the front with a ramp down, straw and an egg. */
function drawCoop(ctx: CanvasRenderingContext2D, camera: Camera, ox: number, oy: number, hit: (h: number, w?: number) => { x: number; y: number; w: number; h: number }) {
  const legs: [number, number][] = [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]];
  legs.sort((a, b) => depthOf(camera, ox + a[0], oy + a[1]) - depthOf(camera, ox + b[0], oy + b[1]));
  for (const [dx, dy] of legs) box(ctx, camera, ox + dx, oy + dy, 0.08, 0.08, 9, "#6f5440", "#7a5b40", "#5a4030");
  box(ctx, camera, ox, oy, 0.74, 0.58, 17, "#c9a47a", "#b88a5e", "#9c7650", 9, INK, "plank");
  miniRoof(ctx, camera, ox, oy, 0.9, 0.76, 26, 13, "#b0673e", "gable", "#c9a47a");
  // The pop-hole on the side facing you, and a slatted ramp down to the ground.
  const [nx, ny] = frontSide(camera), fx = ox + nx * (nx ? 0.37 : 0.29), fy = oy + ny * (ny ? 0.29 : 0.37), tx = -ny, ty = nx;
  const at = (u: number, out: number, lift: number) => { const p = toScreen(camera, fx + tx * u + nx * out, fy + ty * u + ny * out, lift); return [p.x, p.y] as const; };
  poly(ctx, [at(-0.08, 0, 10), at(0.08, 0, 10), at(0.08, 0, 19), at(0, 0, 21), at(-0.08, 0, 19)], "#2c2420", INK, 1);
  poly(ctx, [at(-0.07, 0, 10), at(0.07, 0, 10), at(0.07, 0.42, 0), at(-0.07, 0.42, 0)], "#a88562", INK, 1);
  for (let k = 1; k < 5; k++) { const a = at(-0.07, k * 0.085, 10 - k * 2.4), b = at(0.07, k * 0.085, 10 - k * 2.4); ctx.strokeStyle = "#6f5440"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  const straw = toScreen(camera, fx + nx * 0.5 + tx * 0.28, fy + ny * 0.5 + ty * 0.28, 0), z = camera.zoom;
  ellipse(ctx, straw.x, straw.y, 7 * z, 3 * z, "#e2d7ad", null); ellipse(ctx, straw.x + 2 * z, straw.y - 1.5 * z, 2 * z, 2.6 * z, "#f7f3ea", INK, 0.8);
  return hit(46);
}
/** A tower windmill: a tapering stone tower with a door, a shingled cap, and four lattice sails turning on the side facing you. */
function drawWindmill(ctx: CanvasRenderingContext2D, scene: Scene, ox: number, oy: number) {
  const { camera, now } = scene, z = camera.zoom, stone = "#d7d4cd";
  box(ctx, camera, ox, oy, 1.5, 1.5, 34, stone, "#c8c5be", "#b3aea6", 0, INK, "brick");
  box(ctx, camera, ox, oy, 1.25, 1.25, 30, "#dcd9d2", "#cdc9c1", "#b9b4ac", 34, INK, "brick");
  box(ctx, camera, ox, oy, 1.05, 1.05, 18, "#e6dccb", "#d9ccb4", "#c6b89e", 64, INK, "plank");
  miniRoof(ctx, camera, ox, oy, 1.25, 1.25, 82, 30, "#7a5b40", "cone");
  const [nx, ny] = frontSide(camera), tx = -ny, ty = nx;
  // The door at the foot, and a window up the tower.
  const face = (reach: number, u: number, lift: number) => { const p = toScreen(camera, ox + nx * reach + tx * u, oy + ny * reach + ty * u, lift); return [p.x, p.y] as const; };
  poly(ctx, [face(0.76, -0.16, 0), face(0.76, 0.16, 0), face(0.76, 0.16, 18), face(0.76, 0, 23), face(0.76, -0.16, 18)], "#6f5440", INK, 1.1);
  poly(ctx, [face(0.64, -0.1, 44), face(0.64, 0.1, 44), face(0.64, 0.1, 54), face(0.64, -0.1, 54)], "#5d6f84", INK, 1);
  // Sails: four lattice frames of canvas on long spars, turning slowly.
  const hub = toScreen(camera, ox + nx * 0.62, oy + ny * 0.62, 74), spin = scene.reducedMotion ? 0.35 : now / 1900, L = 62 * z, W = 11 * z;
  const lean = rotate(camera, nx, ny), squash = Math.max(0.35, Math.min(1, Math.abs(lean.rx - lean.ry) / 1.42 + 0.35));
  for (let i = 0; i < 4; i++) {
    const a = spin + i * Math.PI / 2, ux = Math.cos(a) * squash, uy = Math.sin(a), px = -Math.sin(a) * squash, py = Math.cos(a);
    const pt = (along: number, across: number) => [hub.x + ux * along + px * across, hub.y + uy * along + py * across] as const;
    poly(ctx, [pt(L * 0.2, 0), pt(L, 0), pt(L, W), pt(L * 0.2, W)], "#f3eee3", INK, 1);
    ctx.strokeStyle = "#8a7563"; ctx.lineWidth = Math.max(0.8, z * 0.8); ctx.beginPath();
    for (let k = 1; k < 5; k++) { const [a1, b1] = pt(L * (0.2 + k * 0.16), 0), [a2, b2] = pt(L * (0.2 + k * 0.16), W); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); }
    const [m1, m2] = pt(L * 0.2, W / 2), [m3, m4] = pt(L, W / 2); ctx.moveTo(m1, m2); ctx.lineTo(m3, m4); ctx.stroke();
    ctx.strokeStyle = "#5a4030"; ctx.lineWidth = 2.4 * z; ctx.beginPath(); ctx.moveTo(hub.x, hub.y); const [e1, e2] = pt(L * 1.04, 0); ctx.lineTo(e1, e2); ctx.stroke();
  }
  ellipse(ctx, hub.x, hub.y, 4.5 * z, 4.5 * z, "#5a4030", INK, 1.2);
  return { x: hub.x - L - 10 * z, y: hub.y - L - 50 * z, w: (L + 10 * z) * 2, h: L * 2 + 130 * z };
}
/** A brick smelting furnace: a plinth, a squat tapering kiln, a chimney with smoke, and an arched mouth full of fire facing you. */
/**
 * The side of a box (w × d tiles, centred on the tile) that faces the camera most, as a drawing frame: at(u, lift) is a
 * point on that side, u running across it from −½ to ½, at a height above the ground. Long sides are preferred, so a
 * bookcase shows its shelves rather than its end.
 */
function faceFrame(camera: Camera, ox: number, oy: number, w: number, d: number) {
  let best = -Infinity, pick: readonly [number, number] = [0, 1];
  for (const n of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) { const { rx, ry } = rotate(camera, n[0], n[1]); const score = (rx + ry) * (n[1] !== 0 ? w : d); if (score > best) { best = score; pick = n; } }
  const [nx, ny] = pick, half = ny !== 0 ? d / 2 : w / 2, width = ny !== 0 ? w : d, fx = ox + nx * (half + 0.005), fy = oy + ny * (half + 0.005), tx = -ny, ty = nx;
  return { width, nx, ny, at: (u: number, lift: number) => { const p = toScreen(camera, fx + tx * u * width, fy + ty * u * width, lift); return [p.x, p.y] as const; } };
}
const quad = (at: (u: number, lift: number) => readonly [number, number], u0: number, u1: number, l0: number, l1: number) => [at(u0, l0), at(u1, l0), at(u1, l1), at(u0, l1)] as const;
const BOOK_COLORS = ["#8a2f2b", "#3d4f9c", "#2f7d68", "#c9a84a", "#6b2fbf", "#4a3a2c", "#b87333", "#efe6c8", "#5a4a6e", "#9a2f2b"];
/** A bookcase (or a dresser of bottles, or a cabinet of sigils): a dark frame, shelves, and what's on them, deterministic per tile. */
function drawShelf(ctx: CanvasRenderingContext2D, scene: Scene, object: WorldObject) {
  const { camera, now } = scene, z = camera.zoom, ox = object.x, oy = object.y, name = object.name ?? "";
  const kind = /sigil|rune|glyph|orb/i.test(name) ? "sigils" : /tonic|tincture|potion|bottle|jar|herb|remed|apothec|draught|ink\b/i.test(name) ? "bottles" : /clothes|veil|cloth|wear|tabard|hide|fur/i.test(name) ? "cloth" : /bow|arrow|shaft/i.test(name) ? "bows" : "books";
  const wood = /law|ledger|register|book of/i.test(name) ? "#3b2a52" : "#6b4a2c";
  box(ctx, camera, ox, oy, 0.86, 0.3, 38, shade(wood, 0.12), shade(wood, -0.05), shade(wood, -0.15));
  const f = faceFrame(camera, ox, oy, 0.86, 0.3), at = f.at;
  poly(ctx, quad(at, -0.44, 0.44, 2, 36), shade(wood, -0.35), null);
  for (const lift of [2, 13, 24, 35]) poly(ctx, quad(at, -0.45, 0.45, lift - 0.8, lift + 1.2), shade(wood, 0.25), INK, 0.6);
  for (const u of [-0.45, 0.45]) poly(ctx, quad(at, u - 0.035, u + 0.035, 0, 37), shade(wood, 0.05), INK, 0.6);
  for (let row = 0; row < 3; row++) {
    const base = 3.2 + row * 11, seed = (i: number) => hash(ox * 31 + row * 7 + i, oy * 17 + i * 3);
    let u = -0.4, i = 0;
    while (u < 0.38 && i < 14) {
      const r = seed(i);
      if (kind === "books") {
        const w = 0.045 + r * 0.05, h = 6 + Math.floor(seed(i + 20) * 3.5), color = BOOK_COLORS[Math.floor(seed(i + 40) * BOOK_COLORS.length)];
        if (r < 0.08) { u += 0.06; i++; continue; }
        poly(ctx, quad(at, u, Math.min(0.4, u + w), base, base + h), color, INK, 0.5);
        if (w > 0.07) poly(ctx, quad(at, u + w * 0.2, u + w * 0.8, base + h * 0.7, base + h * 0.78), "#e2c46a", null);
        u += w + 0.008;
      } else if (kind === "bottles") {
        const w = 0.07, h = 4 + Math.floor(r * 4), color = ["#7fbf8f", "#c96f6f", "#8fa3c9", "#e2c46a", "#b39ad8", "#9fd6d0"][Math.floor(seed(i + 9) * 6)];
        poly(ctx, quad(at, u, u + w, base, base + h), color, INK, 0.5); poly(ctx, quad(at, u + w * 0.3, u + w * 0.7, base + h, base + h + 2), shade(color, -0.2), INK, 0.5);
        poly(ctx, quad(at, u + w * 0.15, u + w * 0.3, base + 1, base + h - 1), "rgba(255,255,255,0.55)", null);
        u += w + 0.04 + r * 0.04;
      } else if (kind === "sigils") {
        const color = ["#cfc7e6", "#e2d49e", "#9fb4d0", "#d99a82", "#9fbf9a", "#b9a8c9", "#d0b27c"][Math.floor(r * 7)], [cxp, cyp] = at(u + 0.04, base + 4);
        const pulse = scene.reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(now / 400 + ox + row * 2 + i);
        ellipse(ctx, cxp, cyp, 5.5 * z, 4.5 * z, `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${0.3 + pulse * 0.35})`, null);
        poly(ctx, [at(u + 0.04, base + 0.5), at(u + 0.085, base + 4), at(u + 0.04, base + 7.5), at(u - 0.005, base + 4)], color, INK, 0.8);
        poly(ctx, [at(u + 0.04, base + 2.5), at(u + 0.06, base + 4), at(u + 0.04, base + 5.5), at(u + 0.02, base + 4)], "#ffffff", null);
        u += 0.11;
      } else if (kind === "cloth") {
        const color = BOOK_COLORS[Math.floor(r * BOOK_COLORS.length)], w = 0.14;
        for (let k = 0; k < 3; k++) poly(ctx, quad(at, u, u + w, base + k * 2, base + k * 2 + 2), shade(color, k * 0.08), INK, 0.5);
        u += w + 0.04;
      } else {
        // A bow standing in the rack: a curved stave and its string.
        const stave = BOOK_COLORS[[6, 5, 3, 0][Math.floor(r * 4)]], arc = [0, 2.2, 4.5, 6.8, 9].map((l, k) => at(u + [0, 0.03, 0.045, 0.03, 0][k], base + l));
        ctx.strokeStyle = INK; ctx.lineWidth = 3.2 * z; ctx.beginPath(); arc.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
        ctx.strokeStyle = stave; ctx.lineWidth = 1.8 * z; ctx.stroke();
        ctx.strokeStyle = "#efede7"; ctx.lineWidth = 0.7 * z; ctx.beginPath(); ctx.moveTo(arc[0][0], arc[0][1]); ctx.lineTo(arc[4][0], arc[4][1]); ctx.stroke();
        u += 0.11;
      }
      i++;
    }
  }
  // A carved crest along the top.
  poly(ctx, quad(at, -0.36, 0.36, 37, 39.5), shade(wood, 0.18), INK, 0.6);
}
/** A table on four legs, with something on it. */
function drawTable(ctx: CanvasRenderingContext2D, scene: Scene, object: WorldObject) {
  const { camera } = scene, z = camera.zoom, ox = object.x, oy = object.y, top = "#c9ad8c";
  for (const [dx, dy] of [[-0.34, -0.24], [0.34, -0.24], [-0.34, 0.24], [0.34, 0.24]] as const) box(ctx, camera, ox + dx, oy + dy, 0.07, 0.07, 10, "#7a6553", "#6b5848", "#5a4a3c");
  box(ctx, camera, ox, oy, 0.84, 0.62, 2.5, top, "#9c8672", "#8a7563", 10);
  const r = hash(ox * 3, oy * 5), s = toScreen(camera, ox, oy, 12.5);
  if (r < 0.33) { ellipse(ctx, s.x - 4 * z, s.y, 3.6 * z, 1.8 * z, "#efede7", INK, 0.6); ellipse(ctx, s.x + 5 * z, s.y - 1 * z, 1.6 * z, 1.6 * z, "#8a5a3c", INK, 0.6); }
  else if (r < 0.66) { box(ctx, camera, ox - 0.1, oy, 0.22, 0.16, 2, "#3d4f9c", "#2f3d7a", "#26315f", 12.5); box(ctx, camera, ox + 0.15, oy + 0.05, 0.16, 0.12, 1.5, "#efe6c8", "#d8cfb6", "#c4bba2", 12.5); }
  else { ellipse(ctx, s.x, s.y - 2 * z, 2.4 * z, 3 * z, "#b39ad8", INK, 0.6); ellipse(ctx, s.x + 6 * z, s.y, 2 * z, 1.2 * z, "#e2c46a", INK, 0.6); }
}
/** An anvil on its block: a squat waist, a flat face with a horn out to one side. */
function drawAnvil(ctx: CanvasRenderingContext2D, scene: Scene, object: WorldObject) {
  const { camera } = scene, z = camera.zoom, ox = object.x, oy = object.y;
  box(ctx, camera, ox, oy, 0.46, 0.46, 7, "#8a7563", "#7a6553", "#6b5848");
  box(ctx, camera, ox, oy, 0.3, 0.24, 5, "#5a5856", "#4a4846", "#3e3c3a", 7);
  box(ctx, camera, ox, oy, 0.56, 0.3, 5, "#9ea3ad", "#7a7772", "#65625e", 12);
  const a = toScreen(camera, ox + 0.28, oy - 0.1, 17), b = toScreen(camera, ox + 0.28, oy + 0.1, 17), c = toScreen(camera, ox + 0.28, oy, 12.5), tip = toScreen(camera, ox + 0.5, oy, 16);
  poly(ctx, [[a.x, a.y], [b.x, b.y], [tip.x, tip.y]], "#b4b8bf", INK, 0.8); poly(ctx, [[b.x, b.y], [c.x, c.y], [tip.x, tip.y]], "#7a7772", INK, 0.8);
  const hl = toScreen(camera, ox - 0.1, oy, 17); ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = z; ctx.beginPath(); ctx.moveTo(hl.x - 6 * z, hl.y); ctx.lineTo(hl.x + 4 * z, hl.y - 1 * z); ctx.stroke();
}
/** A cooking range: a brick stove with a fire mouth, an iron top, a pot that steams, and a stovepipe. */
function drawRange(ctx: CanvasRenderingContext2D, scene: Scene, object: WorldObject, flicker: number) {
  const { camera, now } = scene, z = camera.zoom, ox = object.x, oy = object.y;
  box(ctx, camera, ox, oy, 0.84, 0.72, 17, "#8f6a5a", "#9a7766", "#7d5b4c", 0, INK, "brick");
  box(ctx, camera, ox, oy, 0.9, 0.78, 3, "#3e3c3a", "#4a4846", "#2f2d2b", 17);
  const f = faceFrame(camera, ox, oy, 0.84, 0.72), at = f.at;
  const arch: (readonly [number, number])[] = [at(-0.2, 2), at(-0.2, 9)];
  for (let i = 1; i < 6; i++) { const a = Math.PI - i * Math.PI / 6; arch.push(at(Math.cos(a) * 0.2, 9 + Math.sin(a) * 4)); }
  arch.push(at(0.2, 9), at(0.2, 2));
  poly(ctx, arch, "#1e1412", INK, 1);
  const [mx, my] = at(0, 4), glow = ctx.createRadialGradient(mx, my, 0, mx, my, 12 * z);
  glow.addColorStop(0, `rgba(255,190,110,${0.8 + flicker * 0.2})`); glow.addColorStop(1, "rgba(200,70,40,0)");
  ctx.save(); ctx.beginPath(); arch.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip();
  ctx.fillStyle = glow; ctx.fillRect(mx - 14 * z, my - 16 * z, 28 * z, 20 * z);
  drawPixels(ctx, fireArt(scene.reducedMotion ? 0 : Math.floor(now / 110 + ox * 3) % 8, 7, 9, 2), mx, my + 4 * z, ART * z * 0.7);
  ctx.restore();
  poly(ctx, quad(at, -0.3, 0.3, 12.5, 14), "#5a5856", INK, 0.6);
  // The pot on the hob, and its steam; a kettle beside it; the stovepipe at the back.
  const pot = toScreen(camera, ox - 0.12, oy, 20);
  ellipse(ctx, pot.x, pot.y + 2 * z, 7 * z, 5.5 * z, "#3a3836", INK, 1); ellipse(ctx, pot.x, pot.y - 1 * z, 6 * z, 2.4 * z, "#c9a84a", INK, 0.8);
  const kettle = toScreen(camera, ox + 0.22, oy + 0.1, 20); ellipse(ctx, kettle.x, kettle.y, 3.5 * z, 3 * z, "#8b8e92", INK, 0.8);
  const px = ox - f.nx * 0.28 + (f.ny !== 0 ? 0.28 : 0), py = oy - f.ny * 0.25 + (f.nx !== 0 ? 0.25 : 0);
  box(ctx, camera, px, py, 0.12, 0.12, 24, "#3e3c3a", "#4a4846", "#2f2d2b", 20);
  if (!scene.reducedMotion) for (let i = 0; i < 3; i++) { const k = ((now / 1500) + i / 3 + hash(ox, oy)) % 1; ellipse(ctx, pot.x + Math.sin(k * 6 + i) * 3 * z, pot.y - 4 * z - k * 22 * z, (2 + k * 4) * z, (1.5 + k * 3) * z, `rgba(240,240,240,${0.5 * (1 - k)})`, null); }
}
function drawFurnace(ctx: CanvasRenderingContext2D, scene: Scene, object: WorldObject, flicker: number, hit: (h: number, w?: number) => { x: number; y: number; w: number; h: number }) {
  const { camera, now } = scene, z = camera.zoom, ox = object.x, oy = object.y, stone = "#8f8a83";
  box(ctx, camera, ox, oy, 0.96, 0.96, 7, "#6d6b67", "#7a7772", "#65625e", 0, INK, "brick");
  box(ctx, camera, ox, oy, 0.8, 0.8, 24, stone, shade(stone, 0.06), shade(stone, -0.06), 7, INK, "brick");
  box(ctx, camera, ox, oy, 0.62, 0.62, 7, "#7a7772", shade(stone, 0.02), shade(stone, -0.1), 31, INK, "brick");
  // The mouth, on the side facing the camera: a dark arch with fire inside and a glowing sill.
  let face = [0, 1], best = -Infinity;
  for (const [nx, ny] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { const { rx, ry } = rotate(camera, nx, ny); if (rx + ry > best) { best = rx + ry; face = [nx, ny]; } }
  const [nx, ny] = face, fx = ox + nx * 0.405, fy = oy + ny * 0.405, tx = -ny, ty = nx;
  const at = (u: number, lift: number) => { const p = toScreen(camera, fx + tx * u, fy + ty * u, lift); return [p.x, p.y] as const; };
  const arch: (readonly [number, number])[] = [at(-0.22, 8), at(-0.22, 20)];
  for (let i = 1; i < 6; i++) { const a = Math.PI - i * Math.PI / 6; arch.push(at(Math.cos(a) * 0.22, 20 + Math.sin(a) * 7)); }
  arch.push(at(0.22, 20), at(0.22, 8));
  poly(ctx, arch, "#241816", INK, 1.2);
  const mouth = toScreen(camera, fx, fy, 8), glow = ctx.createRadialGradient(mouth.x, mouth.y, 0, mouth.x, mouth.y, 16 * z);
  glow.addColorStop(0, `rgba(255,190,110,${0.75 + flicker * 0.25})`); glow.addColorStop(1, "rgba(200,70,40,0)");
  ctx.save(); ctx.beginPath(); arch.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip();
  ctx.fillStyle = glow; ctx.fillRect(mouth.x - 20 * z, mouth.y - 30 * z, 40 * z, 32 * z);
  drawPixels(ctx, fireArt(scene.reducedMotion ? 0 : Math.floor(now / 110 + ox * 3) % 8, 9, 11, 3 + (ox % 2)), mouth.x, mouth.y + 1 * z, ART * z * 0.9);
  ctx.restore();
  // A stone lintel over the arch, and the glowing sill under it.
  box(ctx, camera, fx - nx * 0.02, fy - ny * 0.02, Math.abs(tx) * 0.56 + Math.abs(nx) * 0.1, Math.abs(ty) * 0.56 + Math.abs(ny) * 0.1, 3, "#a39e96", "#9a958d", "#86817a", 27);
  poly(ctx, [at(-0.24, 8), at(0.24, 8), at(0.24, 6.5), at(-0.24, 6.5)], `rgba(240,150,80,${0.55 + flicker * 0.35})`, null);
  // The chimney, and smoke.
  const cx = ox - nx * 0.12, cy = oy - ny * 0.12;
  box(ctx, camera, cx, cy, 0.3, 0.3, 20, "#6d6b67", "#77746f", "#5f5c58", 38, INK, "brick");
  box(ctx, camera, cx, cy, 0.38, 0.38, 3, "#57555a", "#65625e", "#4f4d4a", 58);
  if (!scene.reducedMotion) {
    const top = toScreen(camera, cx, cy, 61);
    for (let i = 0; i < 4; i++) { const k = ((now / 1800) + i / 4 + hash(ox, oy)) % 1; ellipse(ctx, top.x + Math.sin(k * 5 + i) * 4 * z + k * 8 * z, top.y - k * 34 * z, (3 + k * 7) * z, (2.5 + k * 5) * z, `rgba(120,116,112,${(0.45 * (1 - k)).toFixed(3)})`, null); }
  }
  return hit(64, 44);
}
/** A bank booth: a planked counter with an overhanging top, a glass screen with brass bars between carved posts, a rose lintel with a gold coin, and a ledger and coins on the counter. */
function drawBankBooth(ctx: CanvasRenderingContext2D, scene: Scene, object: WorldObject, hit: (h: number, w?: number) => { x: number; y: number; w: number; h: number }) {
  const { camera } = scene, z = camera.zoom, ox = object.x, oy = object.y, wood = "#9c7a58", woodDark = "#7a5a40", brass = "#c9a24a";
  box(ctx, camera, ox, oy, 0.88, 0.58, 16, "#b89c86", wood, woodDark, 0, INK, "plank");
  box(ctx, camera, ox, oy, 0.98, 0.68, 3, "#e8dcc0", "#cdb9a0", "#b89c86", 16);
  for (const px of [-0.44, 0.44]) box(ctx, camera, ox + px, oy, 0.08, 0.08, 20, woodDark, wood, woodDark, 19);
  box(ctx, camera, ox, oy, 0.8, 0.04, 17, "rgba(214,230,240,0.55)", "rgba(200,220,235,0.45)", "rgba(185,205,222,0.45)", 19, null);
  for (const px of [-0.2, 0, 0.2]) box(ctx, camera, ox + px, oy, 0.025, 0.05, 17, brass, brass, shade(brass, -0.2), 19, null);
  box(ctx, camera, ox, oy, 0.98, 0.14, 6, shade(C.rose, 0.08), C.rose, shade(C.rose, -0.12), 38);
  box(ctx, camera, ox, oy, 1.0, 0.16, 1.5, brass, brass, shade(brass, -0.2), 44);
  const emblem = toScreen(camera, ox, oy, 41);
  ellipse(ctx, emblem.x, emblem.y, 3.2 * z, 2.4 * z, brass, INK, 1);
  // A ledger and a little stack of coins on the counter.
  box(ctx, camera, ox - 0.2, oy + 0.14, 0.22, 0.16, 2, "#f4efe2", "#8a4a3a", "#7a3a2a", 19);
  const coins = toScreen(camera, ox + 0.22, oy + 0.16, 19);
  for (let i = 0; i < 3; i++) ellipse(ctx, coins.x, coins.y - i * 1.4 * z, 3 * z, 1.5 * z, i === 2 ? "#f2e28f" : brass, INK, 0.8);
  return hit(50);
}
// ---------- The fountain in Hollow Square ----------
/** Pixel water for the fountain, 32 × 32 in four frames: rippling blues, light caustics that drift, and wishing coins on the bottom. */
const fountainWater = (frame: number, red = false) => pixelArt(`fountain-water:${frame}:${red ? "red" : ""}`, 32, 32, p => {
  const n = (x: number, y: number, s: number) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 1442695041, 1274126177); h ^= h >>> 13; return ((Math.imul(h, 1103515245) >>> 0) % 1000) / 1000; };
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5), wave = Math.sin(d * 0.9 - frame * Math.PI / 2) + Math.sin((x + y) * 0.35 + frame * 0.8) * 0.5;
    p.set(x, y, red ? (wave > 1.05 ? "#d4625a" : wave > 0.45 ? "#a8342e" : wave > -0.6 ? "#8a2f2b" : "#6e2320") : (wave > 1.05 ? "#bcd6ec" : wave > 0.45 ? "#8fb5d6" : wave > -0.6 ? "#7aa3c9" : "#6a93bc"));
  }
  // Coins tossed in for luck, and a glint or two on the surface.
  for (const [x, y] of [[7, 20], [22, 9], [24, 23], [11, 8], [18, 26]] as const) { p.set(x, y, "#d9a93f"); p.set(x + 1, y, "#f2d27a"); }
  for (let i = 0; i < 5; i++) { const x = Math.floor(n(i, frame, 3) * 30) + 1, y = Math.floor(n(i, frame, 7) * 30) + 1; p.set(x, y, "#ffffff"); p.set(x + 1, y, "#e6f2fb"); }
});
/** An eight-sided ring of points around (cx, cy), in world tiles. */
const octagonAt = (cx: number, cy: number, r: number): [number, number][] => Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + i * Math.PI / 4; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
/**
 * The sides of an eight-sided prism that face the camera, in stone texture: its outside (`inward` false), or the inside of
 * its far wall (`inward` true, a basin seen over its rim).
 */
function prismSides(ctx: CanvasRenderingContext2D, camera: Camera, pts: [number, number][], lift: number, h: number, left: string, right: string, inward: boolean, cx: number, cy: number) {
  const q = (px: number, py: number, lz: number) => toScreen(camera, px, py, lz);
  const edges = new Path2D();
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], mx = (ax + bx) / 2 - cx, my = (ay + by) / 2 - cy, len = Math.hypot(mx, my) || 1;
    const nx = (inward ? -mx : mx) / len, ny = (inward ? -my : my) / len, { rx, ry } = rotate(camera, nx, ny);
    if (rx + ry <= 0.001) continue;
    const fill = rx - ry < 0 ? left : right, o = q(ax, ay, lift + h), across = q(bx, by, lift + h), down = q(ax, ay, lift), foot = q(bx, by, lift);
    const corners = [[down.x, down.y], [foot.x, foot.y], [across.x, across.y], [o.x, o.y]] as const;
    if (texturesOn && Math.abs(across.x - o.x) + Math.abs(down.y - o.y) > 8) texturedQuad(ctx, wallTexture("brick", fill, i % 4), o, across, down, Math.hypot(bx - ax, by - ay) * TEX_PER_TILE, h * TEX_PER_HEIGHT);
    else poly(ctx, corners, fill, null);
    corners.forEach(([px, py], k) => k ? edges.lineTo(px, py) : edges.moveTo(px, py)); edges.closePath();
  }
  if (!bare) { ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke(edges); }
}
/** A flat ring (a basin's or bowl's rim) between two octagons at one height. */
function rimTop(ctx: CanvasRenderingContext2D, camera: Camera, outer: [number, number][], inner: [number, number][], lift: number, fill: string) {
  const path = new Path2D(), trace = (pts: [number, number][]) => { pts.forEach(([px, py], i) => { const s = toScreen(camera, px, py, lift); i ? path.lineTo(s.x, s.y) : path.moveTo(s.x, s.y); }); path.closePath(); };
  trace(outer); trace(inner);
  ctx.fillStyle = fill; ctx.fill(path, "evenodd");
  if (!bare) { ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke(path); }
}
/**
 * Hollow Square's fountain: a wide eight-sided basin of stone holding pixel water (ripples, drifting light, a few wishing
 * coins), a column carrying a bowl that spills over its lip in falling streams, and a jet at the top whose droplets arc
 * down into the bowl. Everything turns with the camera, and the moving water stills with reduced motion.
 */
function drawFountain(ctx: CanvasRenderingContext2D, scene: Scene, cx: number, cy: number, red = false) {
  const { camera } = scene, z = camera.zoom, now = scene.reducedMotion ? 0 : scene.now, S = (x: number, y: number, h: number) => toScreen(camera, x, y, h);
  const STONE_L = "#cfcbc3", STONE_R = "#b7b2aa", RIM = "#e2ded5", WATER_H = 7, RIM_H = 13;
  // Water, or blood: the pools, the streams, the drops, the splashes, the jet and the rings.
  const POOL = red ? "#8a2f2b" : "#9cc0de", STREAM = red ? "rgba(176,52,46,0.9)" : "rgba(214,232,246,0.85)", DROP = red ? "#e07a72" : "#ffffff", DROP2 = red ? "#b8463f" : "#cfe4f5", SPLASH = red ? "rgba(224,122,114,0.9)" : "rgba(255,255,255,0.9)", JET = red ? "rgba(196,66,60,0.95)" : "rgba(230,242,251,0.95)", RING = red ? "212,98,90" : "255,255,255";
  const outer = octagonAt(cx, cy, 0.98), inner = octagonAt(cx, cy, 0.8), dim = (hex: string) => shadeHex(hex, -0.1);
  // The water, clipped to the basin, with its pixels laid across it.
  const surface = inner.map(([px, py]) => S(px, py, WATER_H));
  ctx.save(); ctx.beginPath(); surface.forEach((s, i) => i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y)); ctx.closePath(); ctx.clip();
  const frame = Math.floor(now / 260) % 4;
  if (texturesOn) texturedQuad(ctx, fountainWater(frame, red), S(cx - 0.8, cy - 0.8, WATER_H), S(cx + 0.8, cy - 0.8, WATER_H), S(cx - 0.8, cy + 0.8, WATER_H), 32, 32);
  else { ctx.fillStyle = red ? "#8a2f2b" : "#7aa3c9"; ctx.fill(); }
  // Rings spreading from where the streams land.
  if (!bare) for (let k = 0; k < 3; k++) {
    const t = ((now / 1400 + k / 3) % 1), r = 0.42 + t * 0.36;
    ctx.strokeStyle = `rgba(${RING},${(0.55 * (1 - t)).toFixed(3)})`; ctx.lineWidth = Math.max(1, 1.2 * z); ctx.beginPath();
    for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 2, s = S(cx + Math.cos(a) * r, cy + Math.sin(a) * r, WATER_H); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }
    ctx.stroke();
  }
  ctx.restore();
  // The inside of the basin's far wall, above the water.
  prismSides(ctx, camera, inner, WATER_H, RIM_H - WATER_H, dim(STONE_L), dim(STONE_R), true, cx, cy);
  // Falling water from the bowl: streams on the far side go behind the column, the near ones in front.
  const BOWL_H = 30, BOWL_R = 0.46, streams = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4 + Math.PI / 8);
  const stream = (a: number) => {
    const lip = S(cx + Math.cos(a) * BOWL_R, cy + Math.sin(a) * BOWL_R, BOWL_H), land = S(cx + Math.cos(a) * 0.6, cy + Math.sin(a) * 0.6, WATER_H);
    ctx.strokeStyle = STREAM; ctx.lineWidth = Math.max(1.5, 2.6 * z);
    ctx.beginPath(); ctx.moveTo(lip.x, lip.y); ctx.quadraticCurveTo(lip.x + (land.x - lip.x) * 0.9, lip.y + (land.y - lip.y) * 0.2, land.x, land.y); ctx.stroke();
    // Pixel drops sliding down the stream, and a splash where it lands.
    for (let k = 0; k < 3; k++) {
      const t = ((now / 600 + k / 3 + a) % 1), u = 1 - t, px = u * u * lip.x + 2 * u * t * (lip.x + (land.x - lip.x) * 0.9) + t * t * land.x, py = u * u * lip.y + 2 * u * t * (lip.y + (land.y - lip.y) * 0.2) + t * t * land.y;
      ctx.fillStyle = DROP; ctx.fillRect(Math.round(px - z), Math.round(py - z), Math.max(1, 2 * z), Math.max(1, 2 * z));
    }
    const splash = (now / 180 + a * 3) % 2 < 1;
    ctx.fillStyle = SPLASH;
    for (const [dx, dy] of splash ? [[-3, -1], [3, -1], [0, -3]] : [[-2, -2], [2, -2], [-4, 0], [4, 0]]) ctx.fillRect(Math.round(land.x + dx * z), Math.round(land.y + dy * z), Math.max(1, 1.6 * z), Math.max(1, 1.6 * z));
  };
  const behind = (a: number) => { const { rx, ry } = rotate(camera, Math.cos(a), Math.sin(a)); return rx + ry < 0; };
  streams.filter(behind).forEach(stream);
  // The column, the bowl (stone outside, brimming water inside) and the top: a small cup with the jet.
  const column = octagonAt(cx, cy, 0.17);
  prismSides(ctx, camera, column, WATER_H, BOWL_H - 4 - WATER_H, STONE_L, STONE_R, false, cx, cy);
  const bowlOut = octagonAt(cx, cy, BOWL_R), bowlIn = octagonAt(cx, cy, BOWL_R - 0.1), foot = octagonAt(cx, cy, 0.24);
  prismSides(ctx, camera, foot, BOWL_H - 7, 3, STONE_L, STONE_R, false, cx, cy);
  prismSides(ctx, camera, bowlOut, BOWL_H - 4, 4, STONE_L, STONE_R, false, cx, cy);
  const pool = bowlIn.map(([px, py]) => S(px, py, BOWL_H - 0.5));
  poly(ctx, pool.map(s => [s.x, s.y] as const), POOL, null);
  rimTop(ctx, camera, bowlOut, bowlIn, BOWL_H, RIM);
  const stem = octagonAt(cx, cy, 0.08), cupOut = octagonAt(cx, cy, 0.2), cupIn = octagonAt(cx, cy, 0.13), TOP_H = 44;
  prismSides(ctx, camera, stem, BOWL_H, TOP_H - 3 - BOWL_H, STONE_L, STONE_R, false, cx, cy);
  prismSides(ctx, camera, cupOut, TOP_H - 3, 3, STONE_L, STONE_R, false, cx, cy);
  poly(ctx, cupIn.map(([px, py]) => { const s = S(px, py, TOP_H - 0.5); return [s.x, s.y] as const; }), POOL, null);
  rimTop(ctx, camera, cupOut, cupIn, TOP_H, RIM);
  // The jet: a spout of water, and droplets arcing out and down into the bowl.
  const jet = S(cx, cy, TOP_H), peak = S(cx, cy, TOP_H + 16 + (scene.reducedMotion ? 0 : Math.sin(now / 160) * 1.5));
  ctx.strokeStyle = JET; ctx.lineWidth = Math.max(1.5, 2.4 * z); ctx.beginPath(); ctx.moveTo(jet.x, jet.y); ctx.lineTo(peak.x, peak.y); ctx.stroke();
  for (let i = 0; i < 14; i++) {
    const t = (now / 900 + i / 14) % 1, a = i * 2.39996, r = 0.08 + t * 0.34, h = TOP_H + 16 + t * 14 - t * t * (TOP_H + 30 - BOWL_H);
    const d = S(cx + Math.cos(a) * r, cy + Math.sin(a) * r, h);
    ctx.fillStyle = i % 3 ? DROP : DROP2; ctx.fillRect(Math.round(d.x - z), Math.round(d.y - z), Math.max(1, 2 * z), Math.max(1, 2 * z));
  }
  streams.filter(a => !behind(a)).forEach(stream);
  // The basin's rim and its outside, in front of it all.
  rimTop(ctx, camera, outer, inner, RIM_H, RIM);
  prismSides(ctx, camera, outer, 0, RIM_H, STONE_L, STONE_R, false, cx, cy);
  const c = S(cx, cy, 0);
  return { x: c.x - 42 * z, y: c.y - 72 * z, w: 84 * z, h: 94 * z };
}

function drawStation(ctx: CanvasRenderingContext2D, scene: Scene, object: WorldObject): { x: number; y: number; w: number; h: number } {
  const { camera, now, game } = scene, z = camera.zoom, { x: sx, y: sy } = toScreen(camera, object.x, object.y), ox = object.x, oy = object.y;
  const flicker = scene.reducedMotion ? 0.5 : (Math.sin(now / 90 + ox) + 1) / 2;
  const hit = (h: number, w = 40) => ({ x: sx - w / 2 * z, y: sy - h * z, w: w * z, h: (h + 12) * z });
  switch (object.kind) {
    case "range": drawRange(ctx, scene, object, flicker); return hit(44);
    case "board": {
      // A bar's job board: a wooden board on two legs, notices pinned all over it, the odd one curling.
      for (const side of [-0.38, 0.38]) box(ctx, camera, ox + side, oy, 0.1, 0.1, 30, "#6b4a2c", "#7a5636", "#5f4128");
      box(ctx, camera, ox, oy, 0.92, 0.12, 22, "#8a6a4a", "#9c7a58", "#7a5a40", 16, INK, "plank");
      const face = (u: number, h: number) => { const p = toScreen(camera, ox + u, oy, h); return [p.x, p.y] as [number, number]; };
      const notes: [number, number, string][] = [[-0.3, 33, "#f1ead6"], [-0.05, 31, "#efe0b0"], [0.22, 34, "#f3eee2"], [-0.22, 23, "#e9dcc0"], [0.12, 24, "#f1ead6"], [0.33, 25, "#ead6d0"]];
      for (const [u, h, paper] of notes) {
        const a = face(u - 0.09, h + 4), b = face(u + 0.09, h + 4), c = face(u + 0.09, h - 3), d = face(u - 0.09, h - 3);
        poly(ctx, [a, b, c, d], paper, "rgba(22,22,22,0.5)", 0.8);
        ctx.fillStyle = "#a8403a"; ctx.fillRect((a[0] + b[0]) / 2 - 0.8 * z, (a[1] + b[1]) / 2 - 0.4 * z, 1.6 * z, 1.6 * z);
        ctx.strokeStyle = "rgba(60,50,40,0.5)"; ctx.lineWidth = 0.7 * z; ctx.beginPath();
        for (const k of [0.3, 0.55, 0.8]) { const l = [a[0] + (d[0] - a[0]) * k, a[1] + (d[1] - a[1]) * k], r = [b[0] + (c[0] - b[0]) * k - 1.5 * z, b[1] + (c[1] - b[1]) * k]; ctx.moveTo(l[0] + 1 * z, l[1]); ctx.lineTo(r[0], r[1]); }
        ctx.stroke();
      }
      return hit(44);
    }
    case "furnace": return drawFurnace(ctx, scene, object, flicker, hit);
    case "anvil": drawAnvil(ctx, scene, object); return hit(24);
    case "bank": return drawBankBooth(ctx, scene, object, hit);
    case "wheel": {
      // A spinning wheel: a stool-like frame, a big spoked wheel, and the spindle with a hank of wool.
      box(ctx, camera, ox, oy, 0.7, 0.3, 8, "#9c7a58", "#8a6a50", "#7a5a40");
      for (const leg of [-0.28, 0.28]) box(ctx, camera, ox + leg, oy, 0.08, 0.08, 18, "#7a5a40", "#8a6a50", "#6a4a30", 8);
      const hub = toScreen(camera, ox + 0.08, oy, 26), r = 11 * z, spin = scene.reducedMotion ? 0 : now / 900;
      ellipse(ctx, hub.x, hub.y, r, r * 0.95, null, INK, 2.4 * Math.max(0.6, z)); ellipse(ctx, hub.x, hub.y, r, r * 0.95, null, "#9c7a58", 1.2 * Math.max(0.6, z));
      ctx.strokeStyle = "#8a6a50"; ctx.lineWidth = 1.2 * Math.max(0.6, z); ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = spin + k * Math.PI / 3; ctx.moveTo(hub.x, hub.y); ctx.lineTo(hub.x + Math.cos(a) * r, hub.y + Math.sin(a) * r * 0.95); }
      ctx.stroke(); ellipse(ctx, hub.x, hub.y, 2 * z, 2 * z, "#6a4a30", INK, 1);
      const spindle = toScreen(camera, ox - 0.3, oy, 16); ellipse(ctx, spindle.x, spindle.y, 4.5 * z, 3.2 * z, "#efeae0", INK, 1);
      return hit(40);
    }
    case "altar": box(ctx, camera, ox, oy, 0.9, 0.6, 16, PAPER, "#d6d3cc", "#c8c5be"); box(ctx, camera, ox, oy, 0.4, 0.62, 2, C.rose, C.rose, shade(C.rose, -0.1), 16);
      ellipse(ctx, sx, sy - 26 * z, 3 * z, 3 * z, `rgba(226,215,173,${0.5 + flicker * 0.5})`, null); return hit(30);
    case "ladder": {
      const down = object.action?.includes("down");
      // The Ring's arena gates: iron, in the courtyard wall, their portcullis down while a match is on.
      if (object.look === "gate") return drawIronGate(ctx, camera, ox, oy, object.axis ?? "ew", !!game.arena, false, z, hit);
      if (object.look === "stairs") {
        // A spiral stair round a newel post: steps rising, or a stairwell going down.
        const c = (dx: number, dy: number, lift = 0) => { const p = toScreen(camera, ox + dx, oy + dy, lift); return [p.x, p.y] as const; };
        if (down) poly(ctx, [c(-0.42, -0.42), c(0.42, -0.42), c(0.42, 0.42), c(-0.42, 0.42)], "#2b2a2e", INK, 1.2);
        const steps = Array.from({ length: down ? 3 : 7 }, (_, i) => { const a = (down ? Math.PI : 0) + i * 0.8, r = 0.24; return { i, x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r }; });
        steps.sort((a, b) => depthOf(camera, a.x, a.y) - depthOf(camera, b.x, b.y));
        const post = () => box(ctx, camera, ox, oy, 0.14, 0.14, down ? 14 : 52, "#b89c86", "#9c8672", "#8a7563");
        let posted = false;
        for (const step of steps) {
          if (!posted && depthOf(camera, step.x, step.y) > depthOf(camera, ox, oy)) { post(); posted = true; }
          box(ctx, camera, step.x, step.y, 0.4, 0.4, down ? 3 : 6, "#d7d4cd", "#c8c5be", "#b3aea6", down ? 0 : step.i * 6);
        }
        if (!posted) post();
        return hit(down ? 22 : 54, 46);
      }
      if (down) { ellipse(ctx, sx, sy, 20 * z, 10 * z, "#161616", INK); ctx.strokeStyle = "#9c8672"; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.moveTo(sx - 5 * z, sy + 2 * z); ctx.lineTo(sx - 5 * z, sy - 14 * z); ctx.moveTo(sx + 5 * z, sy + 2 * z); ctx.lineTo(sx + 5 * z, sy - 14 * z); for (let i = 0; i < 4; i++) { ctx.moveTo(sx - 5 * z, sy - i * 4 * z); ctx.lineTo(sx + 5 * z, sy - i * 4 * z); } ctx.stroke(); return hit(20, 44); }
      ctx.strokeStyle = "#8a7563"; ctx.lineWidth = 2.5 * z; ctx.beginPath(); ctx.moveTo(sx - 7 * z, sy); ctx.lineTo(sx - 5 * z, sy - 50 * z); ctx.moveTo(sx + 7 * z, sy); ctx.lineTo(sx + 5 * z, sy - 50 * z);
      for (let i = 1; i < 7; i++) { ctx.moveTo(sx - 7 * z, sy - i * 7 * z); ctx.lineTo(sx + 7 * z, sy - i * 7 * z); } ctx.stroke(); return hit(54, 24);
    }
    case "stall": {
      const color = { bakery: C.amber, silk: C.lavender, gem: C.blue, fish: C.sage }[object.stall!] ?? C.rose, empty = game.depleted.has(object.id);
      box(ctx, camera, ox, oy, 0.9, 0.7, 14, "#cdb9a0", "#9c8672", "#8a7563");
      if (!empty) for (let i = 0; i < 3; i++) ellipse(ctx, sx + (i - 1) * 8 * z, sy - 16 * z, 3.5 * z, 2.5 * z, shade(color, -0.1), INK, 0.8);
      for (const px of [-14, 14]) { ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * z; ctx.beginPath(); ctx.moveTo(sx + px * z, sy - 14 * z); ctx.lineTo(sx + px * z, sy - 38 * z); ctx.stroke(); }
      poly(ctx, [[sx - 22 * z, sy - 36 * z], [sx, sy - 48 * z], [sx + 22 * z, sy - 36 * z], [sx, sy - 26 * z]], color);
      for (let i = -1; i <= 1; i += 2) poly(ctx, [[sx + i * 4 * z, sy - 44 * z], [sx + i * 14 * z, sy - 38 * z], [sx + i * 10 * z, sy - 33 * z]], PAPER, null);
      return hit(50, 48);
    }
    case "obstacle": {
      const to = object.to!, a = toScreen(camera, ox, oy), b = toScreen(camera, to.x - Math.sign(to.x - ox) * 0.5, to.y - Math.sign(to.y - oy) * 0.5);
      // Each obstacle's look, by name: spans (a log, beam, bridge or ledge laid across the gap), climbs (a net, ladder or icicles), swings, walls and stones.
      const look = OBSTACLE_LOOKS[object.name] ?? { kind: "wall", color: "#c8c5be", dark: "#9a968f" };
      if (look.kind === "span") {
        ctx.strokeStyle = INK; ctx.lineWidth = (look.width + 2) * z; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(a.x, a.y - 3 * z); ctx.lineTo(b.x, b.y - 3 * z); ctx.stroke();
        ctx.strokeStyle = look.color; ctx.lineWidth = look.width * z; ctx.stroke(); ctx.lineCap = "butt";
        if (look.rails) { ctx.strokeStyle = look.dark; ctx.lineWidth = 1.5 * z; for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(a.x, a.y - 3 * z + side * 6 * z); ctx.lineTo(b.x, b.y - 3 * z + side * 6 * z); ctx.stroke(); } }
      } else if (look.kind === "climb") {
        box(ctx, camera, ox + 1, oy, 0.1, 1, look.height, look.color, look.dark, look.dark);
        ctx.strokeStyle = "rgba(22,22,22,0.6)"; ctx.lineWidth = 1; const n = toScreen(camera, ox + 1, oy);
        for (let i = 0; i < Math.floor(look.height / 7); i++) { ctx.beginPath(); ctx.moveTo(n.x - 14 * z, n.y - i * 7 * z - 4 * z); ctx.lineTo(n.x + 14 * z, n.y - i * 7 * z + 4 * z); ctx.stroke(); }
      } else if (look.kind === "swing") {
        box(ctx, camera, ox, oy, 0.2, 0.2, 60, look.color, look.dark, look.dark);
        const top = toScreen(camera, ox + 1.5, oy, 60), swing = Math.sin(now / 500) * 10 * z;
        ctx.strokeStyle = look.dark; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(top.x + swing, top.y + 44 * z); ctx.stroke();
        if (object.name === "Palm swing") for (let i = 0; i < 5; i++) { const ang = -Math.PI / 2 + (i - 2) * 0.55; ctx.strokeStyle = "#5f8a4a"; ctx.lineWidth = 3 * z; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(top.x + Math.cos(ang) * 18 * z, top.y + Math.sin(ang) * 10 * z + 4 * z); ctx.stroke(); }
      } else if (look.kind === "wall") box(ctx, camera, ox + 1, oy, 0.4, 1, look.height ?? 14, look.color, shade(look.color, -0.12), look.dark);
      else if (look.kind === "stone") ellipse(ctx, sx, sy, 16 * z, 8 * z, look.color, INK);
      if (object.name !== "Stepping stone") box(ctx, camera, ox, oy, 0.5, 0.5, 3, "#c8c5be", "#a9a59e", "#9a968f");
      return hit(36, 48);
    }
    case "fountain": {
      const master = objectAtTile(game.world, ox - 1, oy)?.kind !== "fountain" && objectAtTile(game.world, ox, oy - 1)?.kind !== "fountain";
      if (!master) return hit(0, 0);
      return drawFountain(ctx, scene, ox + 0.5, oy + 0.5, /blood/i.test(object.name));
    }
    case "mill": box(ctx, camera, ox, oy, 0.7, 0.7, 12, "#cdb9a0", "#9c8672", "#8a7563"); poly(ctx, [[sx - 12 * z, sy - 30 * z], [sx + 12 * z, sy - 30 * z], [sx + 4 * z, sy - 14 * z], [sx - 4 * z, sy - 14 * z]], "#b89c86"); return hit(34);
    case "dairy_cow": {
      const cow = creatureSprite(101), frame = Math.floor(now / 1200 + ox) % 2 ? cow.step : cow.idle;
      drawMask(ctx, frame, sx, sy + 2 * z, 2.2 * z, INK, false); ellipse(ctx, sx - 9 * z, sy - 13 * z, 2 * z, 2 * z, C.butter);
      return { x: sx - 26 * z, y: sy - 40 * z, w: 52 * z, h: 44 * z };
    }
    case "herb": {
      // A herb patch: a tuft of leaves (or caps) in the herb's colour, with a flower on the uncommon ones; picked bare, just stalks.
      const def = herbDef(object.herb!), color = def?.color ?? "#7fa86a", accent = def?.accent ?? "#e2d49e", bare = game.depleted.has(object.id);
      // The pixel-art patch (the leaves bob as the wind moves them), drawn like the trees and bushes.
      const art = herbArt(def?.shape ?? "herb", color, accent, Math.floor(hash(ox, oy) * 4), !!def && def.rarity !== "common", bare), bob = scene.reducedMotion || bare ? 0 : Math.sin(now / 900 + ox) * 0.6 * z;
      ellipse(ctx, sx, sy + 1 * z, 12 * z, 4 * z, "rgba(22,22,22,0.12)", null);
      return drawPixels(ctx, art, sx, sy + 2 * z + bob, ART * z);
    }
    case "still": {
      // A copper still: a round pot on a brick hearth, a tall neck, a pipe coiling down to a flask.
      box(ctx, camera, ox, oy, 0.9, 0.7, 10, "#8a6446", "#7a5a3e", "#6d5040");
      ellipse(ctx, sx, sy - 22 * z, 12 * z, 11 * z, "#c9803f", INK, 1.5); ctx.fillStyle = "#c9803f"; ctx.fillRect(sx - 3 * z, sy - 42 * z, 6 * z, 14 * z); ctx.strokeStyle = INK; ctx.strokeRect(sx - 3 * z, sy - 42 * z, 6 * z, 14 * z);
      ctx.strokeStyle = "#e0a060"; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.moveTo(sx, sy - 42 * z); ctx.quadraticCurveTo(sx + 16 * z, sy - 44 * z, sx + 16 * z, sy - 20 * z); ctx.lineTo(sx + 16 * z, sy - 10 * z); ctx.stroke();
      ellipse(ctx, sx + 16 * z, sy - 7 * z, 5 * z, 6 * z, "#9fb4d0", INK, 1);
      if (!scene.reducedMotion) ellipse(ctx, sx + Math.sin(now / 600) * 2 * z, sy - (46 + (now / 40) % 10) * z, 3 * z, 2 * z, "rgba(240,240,240,0.35)", null);
      return hit(50, 40);
    }
    case "wheat": {
      if (game.depleted.has(object.id)) { ctx.strokeStyle = "#8a7563"; ctx.lineWidth = 1; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(sx + i * 5 * z, sy); ctx.lineTo(sx + i * 5 * z, sy - 4 * z); ctx.stroke(); } return hit(8); }
      for (let i = -2; i <= 2; i++) { const sway = Math.sin(now / 700 + i + ox) * 2 * z; ctx.strokeStyle = "#b89c6a"; ctx.lineWidth = 1.2 * z; ctx.beginPath(); ctx.moveTo(sx + i * 4 * z, sy + (i % 2) * 2 * z); ctx.lineTo(sx + i * 4 * z + sway, sy - 18 * z); ctx.stroke(); ellipse(ctx, sx + i * 4 * z + sway, sy - 20 * z, 1.8 * z, 4 * z, C.butter, INK, 0.6); }
      return hit(26, 26);
    }
    case "coop": return drawCoop(ctx, camera, ox, oy, hit);
    case "gate": {
      // The Hollow gate: black iron, its portcullis down and shadow seething between the bars until the quest opens it.
      const sealed = !!object.requires?.quest && (game.player.quests[object.requires.quest] ?? 0) < 1;
      const result = drawIronGate(ctx, camera, ox, oy, object.axis ?? "ns", sealed, true, z, hit);
      if (sealed) { ctx.fillStyle = `rgba(20,20,30,${0.35 + flicker * 0.25})`; const g = toScreen(camera, ox, oy); ctx.fillRect(g.x - 10 * z, g.y - 44 * z, 20 * z, 44 * z); }
      return result;
    }
    case "casket": box(ctx, camera, ox, oy, 0.8, 0.5, 14, C.rose, shade(C.rose, -0.08), shade(C.rose, -0.14)); box(ctx, camera, ox, oy, 0.8, 0.5, 6, C.butter, shade(C.butter, -0.1), shade(C.butter, -0.15), 14);
      ellipse(ctx, sx, sy - 30 * z - flicker * 3 * z, 2.5 * z, 2.5 * z, "#fff", null); return hit(30);
    case "sign": if (object.icon) return drawShopSign(ctx, scene, object, sx, sy, hit);
      ctx.strokeStyle = INK; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 28 * z); ctx.stroke();
      poly(ctx, [[sx - 14 * z, sy - 30 * z], [sx + 14 * z, sy - 26 * z], [sx + 14 * z, sy - 16 * z], [sx - 14 * z, sy - 20 * z]], "#e2d7ad"); return hit(34, 30);
    case "tanning": ctx.strokeStyle = "#8a7563"; ctx.lineWidth = 2 * z; ctx.strokeRect(sx - 12 * z, sy - 30 * z, 24 * z, 26 * z); poly(ctx, [[sx - 9 * z, sy - 27 * z], [sx + 9 * z, sy - 27 * z], [sx + 7 * z, sy - 8 * z], [sx - 7 * z, sy - 8 * z]], "#e8d9c8"); return hit(32, 30);
    case "sigil_altar": {
      // A stone plinth ringed by standing stones, with the sigil's orb floating over it.
      const color = object.sigil ? item(object.sigil).icon.color : "#c7d3dc", bob = scene.reducedMotion ? 0 : Math.sin(now / 500 + ox) * 3 * z;
      const stones = [0, 1, 2, 3].map(i => { const a = i * Math.PI / 2 + Math.PI / 4; return { x: ox + Math.cos(a) * 0.36, y: oy + Math.sin(a) * 0.36 }; }).sort((a, b) => depthOf(camera, a.x, a.y) - depthOf(camera, b.x, b.y));
      ellipse(ctx, sx, sy, 22 * z, 10 * z, `${color}55`, null);
      for (const stone of stones.slice(0, 2)) box(ctx, camera, stone.x, stone.y, 0.14, 0.14, 22, "#b3aea6", "#9a958e", "#86817a");
      box(ctx, camera, ox, oy, 0.5, 0.5, 10, "#c8c5be", "#a9a59e", "#9a968f");
      ellipse(ctx, sx, sy - 30 * z + bob, 13 * z, 13 * z, `${color}44`, null); ellipse(ctx, sx, sy - 30 * z + bob, 6 * z, 6 * z, color, INK, 1.2); ellipse(ctx, sx - 2 * z, sy - 32 * z + bob, 1.6 * z, 1.6 * z, "#ffffff", null);
      for (const stone of stones.slice(2)) box(ctx, camera, stone.x, stone.y, 0.14, 0.14, 22, "#b3aea6", "#9a958e", "#86817a");
      return hit(44, 44);
    }
    case "well": box(ctx, camera, ox, oy, 0.9, 0.9, 12, "#3b3a38", "#c8c5be", "#b9b5ae");
      for (const px of [-12, 12]) { ctx.strokeStyle = "#8a7563"; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.moveTo(sx + px * z, sy - 12 * z); ctx.lineTo(sx + px * z, sy - 36 * z); ctx.stroke(); }
      poly(ctx, [[sx - 18 * z, sy - 34 * z], [sx, sy - 46 * z], [sx + 18 * z, sy - 34 * z], [sx, sy - 26 * z]], "#9c8672"); return hit(48);
    default: return hit(20);
  }
}
function drawDecor(ctx: CanvasRenderingContext2D, scene: Scene, object: WorldObject, alpha: number) {
  const { camera, now } = scene, z = camera.zoom, { x: sx, y: sy } = toScreen(camera, object.x, object.y), ox = object.x, oy = object.y, h = hash(ox, oy);
  const hit = (height: number, w = 36) => ({ x: sx - w / 2 * z, y: sy - height * z, w: w * z, h: (height + 10) * z });
  const frame = object.decor === "torch" ? Math.floor(now / 160 + ox) % 2 : object.decor === "reeds" ? Math.floor(now / 900 + ox) % 2 : 0;
  if (object.decor === "banner") return drawFriendBanner(ctx, scene, object, sx, sy, hit, alpha);
  // (The Wise Friend's statues are carved in the world, below, not stood up as a picture.)
  const carvedStatue = object.decor === "wise_friend" || object.decor === "god_dusk";
  const art = carvedStatue ? null : scene.reducedMotion || object.decor !== "torch" ? decorArt(object.decor!, Math.floor(h * 3), frame) : decorArt("torch", 0, frame);
  if (art) {
    if (object.decor === "torch" || object.decor === "lamp") ellipse(ctx, sx, sy - (object.decor === "lamp" ? 54 : 36) * z, 16 * z, 11 * z, `rgba(242,220,160,${0.16 + Math.sin(now / 300 + ox) * 0.04})`, null);
    else ellipse(ctx, sx, sy + 1 * z, art.width * z * 0.8, 4 * z, "rgba(22,22,22,0.12)", null);
    const rect = drawPixels(ctx, art, sx, sy + 2 * z, ART * z, alpha);
    // A torch's flame is the pixel fire, flickering.
    if (object.decor === "torch") drawPixels(ctx, fireArt(scene.reducedMotion ? 0 : Math.floor(now / 110 + ox * 5) % 8, 9, 13, 4 + (ox % 3)), sx, sy - 22 * z, ART * z, alpha);
    return rect;
  }
  ctx.globalAlpha = alpha;
  try {
    switch (object.decor) {
      case "flowers": for (let i = 0; i < 4; i++) { const fx = sx + (hash(ox + i, oy) - 0.5) * 30 * z, fy = sy + (hash(ox, oy + i) - 0.5) * 12 * z; ctx.strokeStyle = "#8e9887"; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 5 * z); ctx.stroke(); ellipse(ctx, fx, fy - 6 * z, 2.2 * z, 2.2 * z, [C.rose, C.butter, C.lavender, PAPER][(i + Math.floor(h * 4)) % 4], INK, 0.6); } return hit(10);
      case "bush": ellipse(ctx, sx, sy - 7 * z, 13 * z, 9 * z, "#aab69f"); ellipse(ctx, sx + 5 * z, sy - 11 * z, 7 * z, 5 * z, "#b9c5ae"); return hit(18);
      case "boulder": poly(ctx, [[sx - 12 * z, sy + 2 * z], [sx - 9 * z, sy - 10 * z], [sx + 3 * z, sy - 14 * z], [sx + 12 * z, sy - 4 * z], [sx + 8 * z, sy + 4 * z]], "#b3aea6"); return hit(16);
      case "lamp": ctx.strokeStyle = INK; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 42 * z); ctx.stroke(); box(ctx, camera, ox, oy, 0.2, 0.2, 10, "#e2d7ad", "#f4ecc8", "#e8dcae", 40);
        ellipse(ctx, sx, sy - 46 * z, 14 * z, 10 * z, `rgba(242,230,180,${0.18 + Math.sin(now / 400 + ox) * 0.05})`, null); return hit(54, 20);
      case "bench": box(ctx, camera, ox, oy, 0.9, 0.35, 8, "#b89c86", "#9c8672", "#8a7563"); return hit(14);
      case "crate": box(ctx, camera, ox, oy, 0.55, 0.55, 18, "#cdb9a0", "#b89c86", "#a88f74"); return hit(26);
      case "barrel": ellipse(ctx, sx, sy - 18 * z, 9 * z, 4 * z, "#b89c86"); ctx.fillStyle = "#a88f74"; ctx.fillRect(sx - 9 * z, sy - 18 * z, 18 * z, 18 * z); ctx.strokeStyle = INK; ctx.strokeRect(sx - 9 * z, sy - 18 * z, 18 * z, 18 * z); ellipse(ctx, sx, sy - 18 * z, 9 * z, 4 * z, "#b89c86"); return hit(26, 22);
      case "tent": poly(ctx, [[sx - 30 * z, sy + 4 * z], [sx, sy - 34 * z], [sx + 30 * z, sy + 4 * z], [sx, sy + 12 * z]], "#bfb49c"); poly(ctx, [[sx - 5 * z, sy + 10 * z], [sx, sy - 10 * z], [sx + 5 * z, sy + 10 * z]], "#3b3a38"); return hit(38, 60);
      case "cactus": ctx.fillStyle = "#a9b59c"; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.fillRect(sx - 4 * z, sy - 30 * z, 8 * z, 30 * z); ctx.strokeRect(sx - 4 * z, sy - 30 * z, 8 * z, 30 * z); ctx.fillRect(sx + 4 * z, sy - 20 * z, 7 * z, 4 * z); ctx.fillRect(sx + 8 * z, sy - 28 * z, 4 * z, 10 * z); ctx.strokeRect(sx + 8 * z, sy - 28 * z, 4 * z, 10 * z); return hit(34, 24);
      case "pine": for (let i = 0; i < 3; i++) poly(ctx, [[sx, sy - (58 - i * 14) * z], [sx + (18 - i) * z, sy - (22 - i * 14) * z + 6 * z], [sx - (18 - i) * z, sy - (22 - i * 14) * z + 6 * z]], i === 0 ? "#f3f2ee" : shade("#9aa594", i * 0.04)); return hit(60, 36);
      case "dead_tree": ctx.strokeStyle = "#3b3a38"; ctx.lineWidth = 3 * z; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 34 * z); ctx.moveTo(sx, sy - 22 * z); ctx.lineTo(sx - 12 * z, sy - 34 * z); ctx.moveTo(sx, sy - 28 * z); ctx.lineTo(sx + 10 * z, sy - 40 * z); ctx.stroke(); return hit(42, 30);
      case "monument": {
        // A creature carved in stone: whole on a plinth, toppled and lying, broken off at the waist, or sunk to the chest.
        const def = MONSTERS[object.monster ?? ""], state = object.state ?? "whole", STONE = "#8f8a83";
        if (!def) return hit(20);
        const rows = creatureSprite(def.art).idle, big = (def.size ?? 1) > 1, px = (big ? 3 : 2.4) * z, hh = rows.length;
        if (state === "toppled") {
          const lying = rows[0].split("").map((_, x) => rows.map(row => row[x]).reverse().join(""));
          ellipse(ctx, sx, sy + 1 * z, 20 * z, 7 * z, "rgba(22,22,22,0.14)", null);
          drawPixels(ctx, decorArt("rubble", 1)!, sx - 14 * z, sy + 2 * z, ART * z);
          drawMask(ctx, lying, sx, sy + 2 * z, px, STONE);
          return hit(hh * px / z * 0.6, 40);
        }
        if (state === "buried") {
          const cut = Math.round(hh * 0.55), top = rows.slice(0, cut);
          ellipse(ctx, sx, sy + 1 * z, 14 * z, 5 * z, "rgba(60,50,40,0.28)", null);
          drawMask(ctx, top, sx, sy + 2 * z, px, STONE);
          return hit(cut * px / z, 30);
        }
        box(ctx, camera, ox, oy, 0.9, 0.9, 6, "#d7d4cd", "#c8c5be", "#b9b5ae");
        if (state === "broken") {
          const cut = Math.round(hh * 0.4), stump = rows.map((row, i) => i < cut ? ".".repeat(row.length) : row);
          drawMask(ctx, stump, sx, sy - 6 * z, px, STONE);
          drawPixels(ctx, decorArt("rubble", 0)!, sx + 12 * z, sy + 3 * z, ART * z);
          return hit((hh - cut) * px / z + 12, 30);
        }
        drawMask(ctx, rows, sx, sy - 6 * z, px, STONE);
        return hit(hh * px / z + 12, 30);
      }
      case "statue": box(ctx, camera, ox, oy, 0.8, 0.8, 12, "#d7d4cd", "#c8c5be", "#b9b5ae");
        if (scene.friend) drawMask(ctx, friendRows(scene.friend, "down", false, 0), sx, sy - 12 * z, 3.4 * z, "#8f8a83"); return hit(70, 50);
      case "wise_friend": case "god_dusk": {
        // The Wise Friend, as Raria carves it: a Rare Friend in ivory on a stepped plinth, a mantle on its shoulders and a
        // circlet of gold, blindfolded, the book of the Law open in its hands, and behind its head the open eye that
        // sees for it. The Order of Dusk carves it in dark stone, hooded, a censer smoking at its feet.
        const dusk = object.decor === "god_dusk";
        const stone = dusk ? ["#5e5174", "#4b405f", "#3b3150"] : ["#efeadc", "#ddd6c4", "#c7bfab"];
        const plinth = dusk ? ["#4a3f5c", "#3b3150", "#2e2640"] : ["#d8d2c2", "#c4bdab", "#aea795"];
        box(ctx, camera, ox, oy, 1.0, 1.0, 8, plinth[0], plinth[1], plinth[2], 0, INK, "brick");
        box(ctx, camera, ox, oy, 0.8, 0.8, 9, plinth[0], plinth[1], plinth[2], 8, INK, "brick");
        box(ctx, camera, ox, oy, 0.86, 0.86, 3, shadeHex(plinth[0], 0.04), plinth[1], plinth[2], 17, INK, null);
        // A band of gold round the plinth, the First Law cut in it.
        box(ctx, camera, ox, oy, 0.81, 0.81, 2, "#e2b84a", "#c9a24a", "#a8862e", 12, null, null);
        const foot = toScreen(camera, ox, oy, 20), px = 4 * z, rows = WISE_FRIEND.idle, w = rows[0].length * px, height = rows.length * px;
        const left = foot.x - w / 2, topY = foot.y - height + px, at = (col: number, row: number) => [left + col * px, topY + row * px] as const;
        // The eye behind the head: a gilded disc, an almond eye open on it.
        const [ex, ey] = at(8, 3.5);
        ellipse(ctx, ex, ey, 7.5 * px, 7.5 * px, dusk ? "rgba(138,106,176,0.4)" : "rgba(226,184,74,0.5)", dusk ? "#6a5a86" : "#b8902e", 1.6);
        for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; ctx.strokeStyle = dusk ? "rgba(138,106,176,0.6)" : "rgba(201,162,74,0.75)"; ctx.lineWidth = 1.2 * z; ctx.beginPath(); ctx.moveTo(ex + Math.cos(a) * 7.8 * px, ey + Math.sin(a) * 7.8 * px); ctx.lineTo(ex + Math.cos(a) * 9 * px, ey + Math.sin(a) * 9 * px); ctx.stroke(); }
        // The open eye, high on the disc: the Wise Friend's eyes are bound, and it sees all the same.
        { const eyeY = ey - 5.4 * px, eyeW = 2.6 * px;
          poly(ctx, [[ex - eyeW, eyeY], [ex - eyeW * 0.5, eyeY - eyeW * 0.42], [ex + eyeW * 0.5, eyeY - eyeW * 0.42], [ex + eyeW, eyeY], [ex + eyeW * 0.5, eyeY + eyeW * 0.42], [ex - eyeW * 0.5, eyeY + eyeW * 0.42]], dusk ? "#c6bed4" : "#fbf6e6", dusk ? "#6a5a86" : "#9a7424", 1.2);
          ellipse(ctx, ex, eyeY, eyeW * 0.34, eyeW * 0.34, dusk ? "#3b2a52" : "#4a6aa8", INK, 1); }
        // The mantle: falling from the shoulders to the plinth, behind the body.
        poly(ctx, [at(1.5, 6), at(14.5, 6), at(16, 16), at(0, 16)], stone[1], INK, 1.2);
        poly(ctx, [at(1.5, 6), at(4, 6), at(3, 16), at(0, 16)], stone[2], null);
        ctx.strokeStyle = dusk ? "#8a6ab0" : "#c9a24a"; ctx.lineWidth = Math.max(1, 1.2 * z); ctx.beginPath();
        for (const [a, b] of [[at(14.5, 6), at(16, 16)], [at(1.5, 6), at(0, 16)], [at(0, 15.6), at(16, 15.6)]] as const) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
        ctx.stroke();
        // The Friend itself.
        drawMask(ctx, rows, foot.x, foot.y, px, stone[0]);
        // Carved round: the side away from the light in shadow.
        ctx.save(); ctx.beginPath(); ctx.rect(foot.x + px * 0.5, topY - px * 2, w, height + px * 2); ctx.clip();
        drawMask(ctx, rows, foot.x, foot.y, px, stone[1]); ctx.restore();
        // The blindfold across its eyes, knotted at the side, its tails falling.
        const [bx0, by0] = at(WISE_EYES.x0 - 0.4, WISE_EYES.row - 0.2), [bx1] = at(WISE_EYES.x1 + 1.4, WISE_EYES.row);
        poly(ctx, [[bx0, by0], [bx1, by0], [bx1, by0 + px * 1.6], [bx0, by0 + px * 1.6]], dusk ? "#2a2238" : "#3b2a52", INK, 1);
        poly(ctx, [[bx1, by0 + px * 0.4], [bx1 + px * 1.4, by0 + px * 2.6], [bx1 + px * 0.8, by0 + px * 2.9], [bx1 - px * 0.2, by0 + px * 1.2]], dusk ? "#2a2238" : "#3b2a52", INK, 1);
        if (dusk) {
          // The hood, deep over the head.
          poly(ctx, [at(8, -1.6), at(14.5, 4.5), at(14.5, 8), at(12.5, 6), at(3.5, 6), at(1.5, 8), at(1.5, 4.5)], "#3b3150", INK, 1.3);
          poly(ctx, [at(8, -1.6), at(14.5, 4.5), at(14.5, 8), at(12.5, 6), at(8, 3)], "#2e2640", null);
        } else {
          // The circlet: a band of gold with three points.
          const [cx0, cy0] = at(5, 1.2), [cx1] = at(11, 1.2);
          ctx.strokeStyle = "#c9a24a"; ctx.lineWidth = Math.max(1.5, 1.4 * z); ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx1, cy0); ctx.stroke();
          for (const col of [6, 8, 10]) { const [qx, qy] = at(col, 1.2); poly(ctx, [[qx - px * 0.5, qy], [qx, qy - px * 1.3], [qx + px * 0.5, qy]], "#e2b84a", INK, 0.8); }
        }
        // The book of the Law, open in its hands.
        const [kx, ky] = at(8, 10.4);
        poly(ctx, [[kx - 3.6 * px, ky - 0.6 * px], [kx, ky + 0.4 * px], [kx, ky + 3 * px], [kx - 3.6 * px, ky + 2 * px]], "#f7f3e8", INK, 1);
        poly(ctx, [[kx + 3.6 * px, ky - 0.6 * px], [kx, ky + 0.4 * px], [kx, ky + 3 * px], [kx + 3.6 * px, ky + 2 * px]], "#efe9da", INK, 1);
        ctx.strokeStyle = "rgba(60,50,40,0.55)"; ctx.lineWidth = 0.8 * z; ctx.beginPath();
        for (const k of [0.9, 1.5, 2.1]) { ctx.moveTo(kx - 3 * px, ky - 0.2 * px + k * px * 0.85); ctx.lineTo(kx - 0.6 * px, ky + 0.6 * px + k * px * 0.85); ctx.moveTo(kx + 0.6 * px, ky + 0.6 * px + k * px * 0.85); ctx.lineTo(kx + 3 * px, ky - 0.2 * px + k * px * 0.85); }
        ctx.stroke();
        if (dusk) {
          // A censer on its chain at the foot of the plinth, smoking.
          const c = toScreen(camera, ox + 0.42, oy + 0.42, 22);
          ellipse(ctx, c.x, c.y, 2.6 * z, 2 * z, "#c9a24a", INK, 1);
          if (!bare && !scene.reducedMotion && Math.random() < 0.04) puff(ox + 0.42, oy + 0.42, 28);
        }
        return hit(110, 64);
      }
      case "old_friend": {
        // The Old Friend, the one every altar is raised to: a bearded Rare Friend carved in pale stone on a stepped plinth, a sun disc behind its head.
        box(ctx, camera, ox, oy, 0.9, 0.9, 8, "#cfcbc3", "#bdb9b1", "#aaa69e"); box(ctx, camera, ox, oy, 0.7, 0.7, 16, "#d7d4cd", "#c8c5be", "#b9b5ae");
        const top = sy - 16 * z, px = 3.6 * z;
        ellipse(ctx, sx, top - 14 * px, 7 * px, 7 * px, "rgba(232,228,214,0.55)", "#b9b5ae", 1.5);
        drawMask(ctx, OLD_FRIEND.idle, sx, top, px, "#9a958d");
        drawMask(ctx, OLD_FRIEND_BEARD, sx, top, px, "#e8e4d6");
        return hit(84, 56);
      }
      case "grave": box(ctx, camera, ox, oy, 0.3, 0.6, 18, "#c8c5be", "#a9a59e", "#9a968f"); return hit(24, 24);
      case "canopy": {
        // A slab of the old roof over the Ring's walk, up on its pillars; it turns see-through over you.
        box(ctx, camera, ox, oy, 1.02, 1.02, 7, "#b3a798", "#a09486", "#8b8073", 46, INK, "brick");
        return hit(56, 40);
      }
      case "bell": {
        // A great bell in its frame: two oak posts and a beam, the bronze bell hung from it, swaying a little.
        const swing = scene.reducedMotion ? 0 : Math.sin(now / 1100 + ox) * 0.07;
        for (const side of [-0.46, 0.46]) box(ctx, camera, ox + side, oy, 0.14, 0.14, 66, "#6b4a2c", "#7a5636", "#5f4128");
        const pivot = toScreen(camera, ox, oy, 62);
        ctx.save(); ctx.translate(pivot.x, pivot.y); ctx.rotate(swing);
        const b = (px: number, py: number) => [px * z, py * z] as [number, number];
        poly(ctx, [b(-4, 2), b(4, 2), b(7, 8), b(9, 26), b(17, 40), b(-17, 40), b(-9, 26), b(-7, 8)], "#b08d4a", INK, 1.4);
        poly(ctx, [b(-4, 2), b(0, 2), b(-2, 8), b(-4, 26), b(-11, 39), b(-17, 40), b(-9, 26), b(-7, 8)], "#c9a85e", null);
        ellipse(ctx, 0, 40 * z, 17 * z, 4 * z, "#7d6230", INK);
        ellipse(ctx, 0, 44 * z, 3.5 * z, 3.5 * z, "#4a3a22", INK);
        ctx.strokeStyle = INK; ctx.lineWidth = 1 * z; ctx.beginPath(); ctx.moveTo(-9 * z, 26 * z); ctx.lineTo(9 * z, 26 * z); ctx.stroke();
        ctx.restore();
        box(ctx, camera, ox, oy, 1.1, 0.18, 8, "#7a5636", "#6b4a2c", "#5f4128", 62);
        return hit(74, 44);
      }
      case "hearth": {
        // A stone hearth: a low block of masonry with a fire burning in its mouth and a warm glow on the floor.
        box(ctx, camera, ox, oy, 0.9, 0.55, 16, "#9f9a92", "#8a857d", "#767169", 0, INK, "brick");
        const mouth = toScreen(camera, ox, oy + 0.28, 2);
        ctx.fillStyle = "#1e1c22"; ctx.fillRect(mouth.x - 7 * z, mouth.y - 12 * z, 14 * z, 11 * z);
        ellipse(ctx, mouth.x, mouth.y + 4 * z, 20 * z, 8 * z, `rgba(240,200,150,${0.16 + (scene.reducedMotion ? 0 : Math.sin(now / 300 + ox) * 0.04)})`, null);
        drawPixels(ctx, fireArt(scene.reducedMotion ? 0 : Math.floor(now / 110 + ox * 5) % 8, 11, 14, 6), mouth.x, mouth.y - 1 * z, ART * z, alpha);
        return hit(24, 40);
      }
      case "tomb": {
        // A stone tomb: a low chest of weathered blocks with a heavier lid, pushed a little askew on some.
        const askew = hash(ox + 2, oy + 9) < 0.3 ? 0.12 : 0;
        box(ctx, camera, ox, oy, 0.84, 0.5, 9, "#aaa59d", "#8f8a82", "#7d7870", 0, INK, "brick");
        box(ctx, camera, ox + askew, oy - askew * 0.5, 0.94, 0.6, 3, "#c3bfb7", "#a9a59e", "#9a968f", 9);
        if (askew) box(ctx, camera, ox - 0.2, oy, 0.3, 0.3, 1, "#1e1c22", "#1e1c22", "#1e1c22", 9, null);
        return hit(18, 40);
      }
      case "crypt": {
        // A family crypt: a squat stone house for the dead, a stepped roof, a black door, a lintel with the frost in it.
        box(ctx, camera, ox, oy, 1.3, 1.1, 30, "#9f9a92", "#8a857d", "#767169", 0, INK, "brick");
        box(ctx, camera, ox, oy, 1.1, 0.9, 7, "#b3aea6", "#9a958d", "#8a857d", 30, INK);
        box(ctx, camera, ox, oy, 0.7, 0.5, 5, "#c3bfb7", "#a9a59e", "#9a968f", 37, INK);
        const door = (dx: number, zz: number) => { const s = toScreen(camera, ox + dx, oy + 0.56, zz); return [s.x, s.y] as const; };
        poly(ctx, [door(-0.22, 0), door(0.22, 0), door(0.22, 19), door(0, 23), door(-0.22, 19)], "#1e1c22", "#3b3a38");
        if (hash(ox, oy + 3) < 0.5) { const s = toScreen(camera, ox, oy + 0.56, 26); ellipse(ctx, s.x, s.y, 3.5 * z, 3.5 * z, "#f3f2ee", "#8a857d", 1); }
        return hit(48, 56);
      }
      case "obelisk": {
        // An obelisk nobody remembers raising, carved all over with the symbol from the standing stones.
        box(ctx, camera, ox, oy, 0.5, 0.5, 6, "#b3aea6", "#9a958d", "#8a857d", 0, INK);
        box(ctx, camera, ox, oy, 0.32, 0.32, 40, "#c3bfb7", "#a9a59e", "#8f8a82", 6, INK);
        const tip = toScreen(camera, ox, oy, 56), a = toScreen(camera, ox - 0.16, oy + 0.16, 46), b = toScreen(camera, ox + 0.16, oy + 0.16, 46), c = toScreen(camera, ox + 0.16, oy - 0.16, 46);
        poly(ctx, [[a.x, a.y], [b.x, b.y], [tip.x, tip.y]], "#a9a59e"); poly(ctx, [[b.x, b.y], [c.x, c.y], [tip.x, tip.y]], "#8f8a82");
        ctx.strokeStyle = "#6f6b64"; ctx.lineWidth = Math.max(1, z); for (let i = 0; i < 4; i++) { const s = toScreen(camera, ox, oy + 0.16, 14 + i * 7); ctx.beginPath(); ctx.moveTo(s.x - 3 * z, s.y); ctx.lineTo(s.x + 3 * z, s.y); ctx.stroke(); }
        return hit(62, 26);
      }
      case "stake": {
        // A palisade standing in the world (not a picture turned to face you): sharpened logs from this stake to the next
        // along the line (up to two tiles east or south), lashed with rope, each log a little different.
        const world = scene.game.world, isStake = (dx: number, dy: number) => objectAtTile(world, ox + dx, oy + dy)?.decor === "stake";
        const links = ([[1, 0], [2, 0], [0, 1], [0, 2]] as const).filter(([dx, dy]) => isStake(dx, dy) && !(dx === 2 && isStake(1, 0)) && !(dy === 2 && isStake(0, 1)));
        const joined = links.length > 0 || isStake(-1, 0) || isStake(-2, 0) || isStake(0, -1) || isStake(0, -2);
        const logs: [number, number][] = [[ox, oy]];
        for (const [dx, dy] of links) { const len = Math.abs(dx + dy); for (let k = 1; k < len * 3; k++) logs.push([ox + dx * k / (len * 3), oy + dy * k / (len * 3)]); }
        if (!joined) logs.push([ox - 0.28, oy + 0.08], [ox + 0.28, oy - 0.06]);
        logs.sort((a, b) => { const ra = rotate(camera, a[0], a[1]), rb = rotate(camera, b[0], b[1]); return (ra.rx + ra.ry) - (rb.rx + rb.ry); });
        const w = 6 * z;
        for (const [px, py] of logs) {
          const r = hash(Math.round(px * 8), Math.round(py * 8)), h = 21 + r * 7, base = toScreen(camera, px, py, 0), top = toScreen(camera, px, py, h), bark = r < 0.33 ? "#7a6553" : r < 0.66 ? "#8a7563" : "#6f5d4c";
          poly(ctx, [[base.x - w / 2, base.y], [base.x + w / 2, base.y], [top.x + w / 2, top.y], [top.x - w / 2, top.y]], bark, INK, 0.8);
          poly(ctx, [[top.x - w / 2, top.y], [top.x + w / 2, top.y], [top.x, top.y - 7 * z]], "#d8c4a4", INK, 0.8);
          for (const ring of [0.3, 0.62]) { const yy = base.y + (top.y - base.y) * ring; ctx.strokeStyle = "rgba(22,22,22,0.35)"; ctx.lineWidth = 0.8 * z; ctx.beginPath(); ctx.moveTo(base.x - w / 2 + (top.x - base.x) * ring, yy); ctx.lineTo(base.x + w / 2 + (top.x - base.x) * ring, yy); ctx.stroke(); }
          ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 0.8 * z; ctx.beginPath(); ctx.moveTo(base.x - w * 0.2, base.y - 2 * z); ctx.lineTo(top.x - w * 0.2, top.y + 1 * z); ctx.stroke();
        }
        ctx.lineWidth = 1.4 * z; ctx.strokeStyle = "#e8d4b0";
        for (const [dx, dy] of links) for (const lift of [8, 15]) { const a = toScreen(camera, ox, oy, lift), b = toScreen(camera, ox + dx, oy + dy, lift); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        return hit(34, 34);
      }
      case "fence": {
        const world = scene.game.world, same = (dx: number, dy: number) => objectAtTile(world, ox + dx, oy + dy)?.decor === "fence";
        ctx.strokeStyle = "#8a7563"; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 14 * z);
        for (const [dx, dy] of [[1, 0], [0, 1]] as const) if (same(dx, dy)) { const n = toScreen(camera, ox + dx, oy + dy); for (const lift of [5, 11]) { ctx.moveTo(sx, sy - lift * z); ctx.lineTo(n.x, n.y - lift * z); } }
        ctx.stroke(); return hit(16, 20);
      }
      case "reeds": ctx.strokeStyle = "#8e9887"; ctx.lineWidth = 1.2 * z; ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(sx + i * 3 * z, sy); ctx.lineTo(sx + i * 4 * z + Math.sin(now / 600 + i) * 2 * z, sy - (12 + (i % 2) * 4) * z); } ctx.stroke(); return hit(16, 20);
      case "table": drawTable(ctx, scene, object); return hit(18);
      case "shelf": drawShelf(ctx, scene, object); return hit(44);
      case "pillar": box(ctx, camera, ox, oy, 0.45, 0.45, 50, "#d7d4cd", "#c8c5be", "#b9b5ae"); return hit(56, 26);
      case "rubble": for (let i = 0; i < 3; i++) box(ctx, camera, ox + (hash(ox + i, oy) - 0.5) * 0.5, oy + (hash(ox, oy + i) - 0.5) * 0.5, 0.25, 0.25, 6, "#c8c5be", "#a9a59e", "#9a968f"); return hit(12);
      case "snowman": ellipse(ctx, sx, sy - 9 * z, 11 * z, 9 * z, "#fff"); ellipse(ctx, sx, sy - 24 * z, 8 * z, 7 * z, "#fff"); ellipse(ctx, sx - 3 * z, sy - 25 * z, 1.2 * z, 1.2 * z, INK, null); ellipse(ctx, sx + 3 * z, sy - 25 * z, 1.2 * z, 1.2 * z, INK, null); return hit(34, 26);
      case "lily": ellipse(ctx, sx, sy, 7 * z, 3.5 * z, "#a9b59c"); ellipse(ctx, sx + 2 * z, sy - 1 * z, 2 * z, 1.5 * z, C.rose, null); return hit(6, 16);
      case "torch": { ctx.strokeStyle = "#8a7563"; ctx.lineWidth = 2.5 * z; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 22 * z); ctx.stroke(); const f = scene.reducedMotion ? 0 : Math.sin(now / 80 + ox * 3) * 2 * z;
        ellipse(ctx, sx, sy - 34 * z, 18 * z, 12 * z, "rgba(240,200,150,0.15)", null); void f; drawPixels(ctx, fireArt(scene.reducedMotion ? 0 : Math.floor(now / 110 + ox * 5) % 8, 9, 13, 5), sx, sy - 20 * z, ART * z); return hit(38, 20); }
      case "palm": ctx.strokeStyle = "#9c8672"; ctx.lineWidth = 4 * z; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + 6 * z, sy - 24 * z, sx + 2 * z, sy - 46 * z); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2 + Math.sin(now / 900) * 0.06, tipX = sx + 2 * z + Math.cos(a) * 26 * z, tipY = sy - 44 * z + Math.sin(a) * 10 * z + 8 * z;
          const midX = sx + 2 * z + Math.cos(a) * 14 * z, midY = sy - 50 * z + Math.sin(a) * 6 * z, nx = -Math.sin(a) * 5 * z, ny = Math.cos(a) * 2 * z;
          poly(ctx, [[sx + 2 * z, sy - 46 * z], [midX + nx, midY + ny], [tipX, tipY], [midX - nx, midY - ny]], i % 2 ? "#a9b59c" : "#b4c3ab");
        }
        return hit(56, 40);
      case "hay": box(ctx, camera, ox, oy, 0.7, 0.5, 14, "#e2d7ad", "#d6c58f", "#c9b77f"); return hit(20);
      case "ruin_wall": {
        // A crumbling stretch of old wall: weathered brick to its own height, a jagged broken top, moss (sand-bleached in
        // the dunes, snow-capped up north) on what's left.
        const terrain = scene.game.world.tiles[oy * W + ox], sand = terrain === T.SAND, snow = terrain === T.SNOW, height = object.height ?? 20;
        const [top, left, right] = sand ? ["#e0cfa6", "#d2bf92", "#bda97c"] : ["#b9b4ab", "#a39e95", "#8f8a82"];
        const cap = snow ? "#f3f2ee" : sand ? "#ead9b0" : "#9fae8a", lower = height * (0.55 + hash(ox + 3, oy) * 0.25);
        box(ctx, camera, ox, oy, 1, 1, lower, top, left, right, 0, INK, "brick");
        // The broken top: one or two blocks left standing, off-centre.
        const bx = ox + (hash(ox, oy + 5) - 0.5) * 0.45, by = oy + (hash(ox + 7, oy) - 0.5) * 0.45;
        box(ctx, camera, bx, by, 0.55, 0.62, height - lower, cap, left, right, lower, INK, "brick");
        if (hash(ox, oy + 11) < 0.5) box(ctx, camera, ox - (bx - ox), oy - (by - oy), 0.34, 0.34, 5 + hash(ox + 1, oy + 1) * 6, cap, left, right, lower, INK);
        return hit(height + 8, 40);
      }
      case "windmill": return drawWindmill(ctx, scene, ox, oy);
      case "boat": poly(ctx, [[sx - 22 * z, sy - 4 * z], [sx + 22 * z, sy - 4 * z], [sx + 14 * z, sy + 6 * z], [sx - 14 * z, sy + 6 * z]], "#9c8672"); return hit(12, 44);
      case "chest": box(ctx, camera, ox, oy, 0.6, 0.45, 14, "#9c8672", "#8a7563", "#7a6553"); return hit(20);
      case "bed": box(ctx, camera, ox, oy, 0.7, 0.9, 10, "#9c8672", "#8a7563", "#7a6553"); box(ctx, camera, ox, oy + 0.08, 0.64, 0.66, 3, C.lavender, shade(C.lavender, -0.08), shade(C.lavender, -0.14), 10);
        box(ctx, camera, ox, oy - 0.3, 0.5, 0.2, 3, PAPER, "#d6d3cc", "#c8c5be", 10); box(ctx, camera, ox, oy - 0.42, 0.7, 0.08, 26, "#9c8672", "#8a7563", "#7a6553"); return hit(26);
      case "throne": {
        // Carved and gilded, with a tall rose back on the north side of its tile.
        const parts = [{ x: ox, y: oy - 0.3, draw: () => { box(ctx, camera, ox, oy - 0.3, 0.72, 0.14, 50, C.rose, shade(C.rose, -0.08), shade(C.rose, -0.14)); box(ctx, camera, ox, oy - 0.3, 0.8, 0.18, 5, C.butter, shade(C.butter, -0.1), shade(C.butter, -0.16), 50); } },
          { x: ox, y: oy + 0.05, draw: () => { box(ctx, camera, ox, oy + 0.05, 0.72, 0.6, 14, "#b8964f", "#a3843f", "#8f7334"); box(ctx, camera, ox, oy + 0.05, 0.62, 0.52, 4, C.rose, shade(C.rose, -0.08), shade(C.rose, -0.14), 14); } }];
        parts.sort((a, b) => depthOf(camera, a.x, a.y) - depthOf(camera, b.x, b.y)).forEach(part => part.draw());
        const top = toScreen(camera, ox, oy - 0.3, 58); poly(ctx, [[top.x - 6 * z, top.y + 4 * z], [top.x - 6 * z, top.y - 3 * z], [top.x - 3 * z, top.y], [top.x, top.y - 5 * z], [top.x + 3 * z, top.y], [top.x + 6 * z, top.y - 3 * z], [top.x + 6 * z, top.y + 4 * z]], C.butter, INK, 1);
        return hit(64, 40);
      }
      case "armour":
        box(ctx, camera, ox, oy, 0.4, 0.4, 3, "#8a7563", "#7a6553", "#6a5543");
        box(ctx, camera, ox, oy, 0.3, 0.16, 18, "#9fa2a6", "#8b8e92", "#76797d", 3); box(ctx, camera, ox, oy, 0.42, 0.24, 18, "#c9c2b6", "#b3ac9f", "#9d968a", 21);
        ellipse(ctx, sx, sy - 46 * z, 7 * z, 7.5 * z, "#c9c2b6"); ctx.fillStyle = INK; ctx.fillRect(sx - 4 * z, sy - 47 * z, 8 * z, 1.8 * z);
        poly(ctx, [[sx, sy - 54 * z], [sx + 3 * z, sy - 62 * z], [sx + 5 * z, sy - 53 * z]], C.rose, INK, 0.8); return hit(62, 26);
      default: return hit(10);
    }
  } finally { ctx.globalAlpha = 1; }
}
/** A shop sign: a post with an arm, and a board on two chains painted with what's sold inside (swaying a little). */
function drawShopSign(ctx: CanvasRenderingContext2D, scene: Scene, object: WorldObject, sx: number, sy: number, hit: (h: number, w?: number) => { x: number; y: number; w: number; h: number }) {
  const z = scene.camera.zoom, swing = scene.reducedMotion ? 0 : Math.sin(scene.now / 900 + object.x * 1.7) * 0.05;
  box(ctx, scene.camera, object.x, object.y, 0.12, 0.12, 50, "#8a6a50", "#7a5b40", "#6a4d35");
  const top = sy - 48 * z;
  ctx.strokeStyle = INK; ctx.lineWidth = 3.2 * z; ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(sx + 22 * z, top); ctx.stroke();
  ctx.strokeStyle = "#8a6a50"; ctx.lineWidth = 1.6 * z; ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(sx + 22 * z, top); ctx.stroke();
  ctx.save(); ctx.translate(sx + 12 * z, top); ctx.rotate(swing);
  ctx.strokeStyle = "#3b3a38"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8 * z, 0); ctx.lineTo(-8 * z, 5 * z); ctx.moveTo(8 * z, 0); ctx.lineTo(8 * z, 5 * z); ctx.stroke();
  const w = 26 * z, h = 22 * z;
  ctx.fillStyle = INK; ctx.fillRect(-w / 2 - 1.5 * z, 4 * z, w + 3 * z, h + 3 * z);
  ctx.fillStyle = "#c9a47a"; ctx.fillRect(-w / 2, 5.5 * z, w, h);
  ctx.fillStyle = "#b88a5e"; for (let i = 1; i < 4; i++) ctx.fillRect(-w / 2, 5.5 * z + i * h / 4, w, 1);
  ctx.strokeStyle = "#7a5b40"; ctx.lineWidth = 1.2 * z; ctx.strokeRect(-w / 2 + 2 * z, 7.5 * z, w - 4 * z, h - 4 * z);
  if (object.icon === "__horse") { const art = mountArt(mountDef("chestnut_horse")!.coat, "side", -1, false); drawPixels(ctx, art, 0, 5.5 * z + h - 3 * z, (h - 6 * z) / art.height); }
  else if (object.icon && isItem(object.icon)) drawIcon(ctx, item(object.icon).icon, 0, 5.5 * z + h / 2, 18 * z);
  ctx.restore();
  return hit(60, 44);
}
/** A banner of your own Friend, in the scenery's pixel style: a pole with a gold finial, a deep red cloth with gold trim and
 * a notched hem that sways, and your Friend's own sprite in a pale roundel. */
function friendBannerArt(rows: readonly string[] | null, frame: number) {
  return pixelArt(`friend-banner:${frame}:${rows ? rows.join("") : "none"}`, 26, 46, p => {
    p.rect(3, 2, 2, 44, "#4a3526"); p.rect(3, 2, 1, 44, "#6f5440"); p.disc(4, 1.5, 2, 1.5, "#e2c46a", null);
    p.rect(3, 4, 21, 2, "#3b2a22");
    const sway = frame ? 1 : 0, cloth = "#b84f55", dark = "#8e3a40", gold = "#e2c46a";
    p.poly([[5, 6], [23 + sway, 6], [23 + sway, 36], [14 + sway, 31], [5, 36]], cloth, null);
    p.line(22 + sway, 6, 22 + sway, 35, dark); for (let y = 10; y < 32; y += 7) p.line(6, y + sway, 7, y + sway, dark);
    p.line(6, 7, 6, 34, gold); p.line(21 + sway, 7, 21 + sway, 34, gold); p.line(6, 7, 21 + sway, 7, gold);
    // The roundel, and your Friend in it (its sprite, pixel for pixel, shrunk to fit if it's big).
    const cx = 14 + sway / 2, cy = 19;
    p.disc(cx, cy, 8.5, 8.5, gold, null); p.disc(cx, cy, 7.5, 7.5, "#f3e6d8", null);
    if (rows?.length) {
      const h = rows.length, w = rows[0].length, scale = Math.max(1, Math.ceil(Math.max(w, h) / 13));
      for (let y = 0; y < h; y += scale) for (let x = 0; x < w; x += scale) if (rows[y][x] === "#") p.set(Math.round(cx - w / scale / 2 + x / scale), Math.round(cy - h / scale / 2 + y / scale + 1), "#161616");
    } else p.disc(cx, cy, 3, 4, "#161616", null);
    p.outline();
  });
}
function drawFriendBanner(ctx: CanvasRenderingContext2D, scene: Scene, object: WorldObject, sx: number, sy: number, hit: (h: number, w?: number) => { x: number; y: number; w: number; h: number }, alpha = 1) {
  const z = scene.camera.zoom, frame = scene.reducedMotion ? 0 : Math.floor(scene.now / 700 + object.x) % 2;
  const rows = scene.friend ? friendRows(scene.friend, "down", false, 0) : null;
  ellipse(ctx, sx, sy + 1 * z, 10 * z, 4 * z, "rgba(22,22,22,0.12)", null);
  drawPixels(ctx, friendBannerArt(rows, frame), sx + 9 * z, sy + 2 * z, ART * z, alpha);
  return hit(96, 40);
}
function drawIcon(ctx: CanvasRenderingContext2D, icon: Icon, x: number, y: number, size: number) {
  const art = itemArt(icon); drawPixels(ctx, art, x, y + size / 2, size / art.width);
}

// ---------- Distance haze ----------
/** A soft sky haze over the far distance (visible when the camera looks low across the land). */

// ---------- Buildings ----------
const WALL_H = 42;
/** Floors inside buildings (a wall face onto one of these, under a roof, can't be seen). */
const INDOOR_FLOORS = new Set<number>([T.WOOD, T.STONE, T.CARPET]);
const roofAlpha = new Map<number, number>();
/** How far your Friend has faded into the Veilweave hood's veil (eased: slow to fade, quick to reappear). */
let veilShown = 0;
/** Draw a figure crouched (sneaking): squashed a little toward its feet. */
function crouched<T>(ctx: CanvasRenderingContext2D, on: boolean, x: number, feetY: number, draw: () => T): T {
  if (!on) return draw();
  ctx.save(); ctx.translate(x, feetY); ctx.scale(1.05, 0.84); ctx.translate(-x, -feetY);
  const out = draw(); ctx.restore(); return out;
}
/** How lit windows are (0 by day, 1 at night), and the glowing shapes (screen polygons) the drawable being drawn gave off. */
let windowGlow = 0;
const emitted: [number, number][][] = [];
/** Paint what a drawable gave off (lit glass, flames) into the light buffer: it shines instead of taking the dark. */
function paintEmitted(lb: CanvasRenderingContext2D, light: RGB, strength: number, emitted: readonly [number, number][][]) {
  if (!emitted.length) return;
  lb.globalCompositeOperation = "source-over";
  lb.fillStyle = rgbCss([light[0] + (1 - light[0]) * strength, light[1] + (0.95 - light[1]) * strength, light[2] + (0.84 - light[2]) * strength]);
  lb.beginPath();
  for (const shape of emitted) { shape.forEach(([px, py], i) => i ? lb.lineTo(px, py) : lb.moveTo(px, py)); lb.closePath(); }
  lb.fill();
}
/** A small polygon around a point (a flame's glow in the light buffer). */
const blob = (x: number, y: number, rx: number, ry: number): [number, number][] => Array.from({ length: 8 }, (_, i) => [x + Math.cos(i * Math.PI / 4) * rx, y + Math.sin(i * Math.PI / 4) * ry]);

/**
 * Lights inside buildings: every room (on the ground or up a storey, not on an open roof) gets hanging lanterns about every
 * four tiles, or iron chandeliers in the big halls, placed once per world. Keyed by stored tile index.
 */
type RoomLight = { big: boolean };
const roomLightCache = new WeakMap<World, Map<number, RoomLight>>(), seenVersion = new WeakMap<World, number>();
function roomLights(world: World) {
  const cached = roomLightCache.get(world);
  if (cached) return cached;
  const lights = new Map<number, RoomLight>(), seen = new Uint8Array(W * H);
  const open = (x: number, y: number) => { const t = world.tiles[y * W + x]; return t !== T.WALL && t !== T.VOID && t !== T.WATER; };
  const indoor = (x: number, y: number) => {
    if (!inBounds(x, y) || !open(x, y)) return false;
    if (y >= FLOOR_Y) { const floor = floorAt(world, x, y), owner = floor ? world.buildingAt[(y - floor.dy) * W + x - floor.dx] : 0; return !!floor && owner > 0 && floor.level < (world.buildings[owner - 1].storeys ?? 1); }
    return !isUnderground(y) && world.buildingAt[y * W + x] > 0;
  };
  const blocked = (x: number, y: number) => { const id = world.objectAt[y * W + x]; return id >= 0 && world.objects[id].blocks; };
  for (let start = 0; start < W * H; start++) {
    const sx = start % W, sy = Math.floor(start / W);
    if (seen[start] || !indoor(sx, sy)) continue;
    // One room: the indoor tiles joined to this one (doorways join rooms into one; the lattice still spreads the lights).
    const room: number[] = [start], keys = new Set<number>([start]);
    seen[start] = 1;
    for (let i = 0; i < room.length; i++) {
      const x = room[i] % W, y = Math.floor(room[i] / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, key = ny * W + nx; if (!seen[key] && indoor(nx, ny)) { seen[key] = 1; room.push(key); keys.add(key); } }
    }
    if (room.length < 4) continue;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const key of room) { const x = key % W, y = Math.floor(key / W); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, nx = Math.max(1, Math.round(bw / 4)), ny = Math.max(1, Math.round(bh / 4));
    const wallDistance = (x: number, y: number) => { for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!keys.has((y + dy) * W + x + dx)) return r - 1; return 3; };
    let placed = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const tx = Math.floor(x0 + (i + 0.5) * bw / nx), ty = Math.floor(y0 + (j + 0.5) * bh / ny);
      // The nearest room tile to the lattice point, preferring one with nothing standing on it.
      let best = -1, bestScore = Infinity;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const key = (ty + dy) * W + tx + dx;
        if (!keys.has(key)) continue;
        const score = Math.hypot(dx, dy) + (blocked(tx + dx, ty + dy) ? 2 : 0);
        if (score < bestScore) { bestScore = score; best = key; }
      }
      if (best < 0 || lights.has(best)) continue;
      lights.set(best, { big: room.length >= 120 && wallDistance(best % W, Math.floor(best / W)) >= 2 });
      placed++;
    }
    if (!placed) { const key = room[Math.floor(room.length / 2)]; lights.set(key, { big: false }); }
  }
  roomLightCache.set(world, lights);
  return lights;
}
type RoofVertex = [number, number, number];
/** The roof's corners (with an overhang) and its ridge, in world coordinates and height. */
function roofGeometry(building: Building) {
  const o = 0.3, X0 = building.x0 - 0.5 - o, X1 = building.x1 + 0.5 + o, Y0 = building.y0 - 0.5 - o, Y1 = building.y1 + 0.5 + o;
  const alongX = X1 - X0 >= Y1 - Y0, half = (alongX ? Y1 - Y0 : X1 - X0) / 2, rise = building.roof === "cone" ? building.spire ?? 118 : Math.max(20, Math.min(48, half * 11));
  const base = WALL_H * (building.storeys ?? 1) + (building.tall ?? 0), top = base + rise, mid = alongX ? (Y0 + Y1) / 2 : (X0 + X1) / 2;
  const A: RoofVertex = [X0, Y0, base], B: RoofVertex = [X1, Y0, base], C: RoofVertex = [X1, Y1, base], D: RoofVertex = [X0, Y1, base];
  // A hipped roof's ridge stops short of the ends by half the span (a square one comes to a point).
  const inset = building.hip ? Math.min(half, (alongX ? X1 - X0 : Y1 - Y0) / 2) : 0;
  const R0: RoofVertex = alongX ? [X0 + inset, mid, top] : [mid, Y0 + inset, top], R1: RoofVertex = alongX ? [X1 - inset, mid, top] : [mid, Y1 - inset, top];
  const apex: RoofVertex = [(X0 + X1) / 2, (Y0 + Y1) / 2, top];
  return { A, B, C, D, R0, R1, apex, alongX, base, top, X0, X1, Y0, Y1 };
}
/** Whether a roof slope (eave e0–e1, rising to r0) faces the light, so it can be drawn a shade lighter. */
function rotateLit(camera: Camera, e0: RoofVertex, r0: RoofVertex) {
  // The slope's outward normal on the ground plane points from the ridge towards the eave.
  const { rx, ry } = rotate(camera, e0[0] - r0[0], e0[1] - r0[1]);
  return rx - ry < 0;
}
/** How many storeys high a city's rampart stands at a wall tile (0 when the wall is no rampart's). */
const rampartAt = (world: World, x: number, y: number) => {
  for (const r of world.ramparts ?? []) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && (x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1)) return r.storeys;
  return 0;
};
/**
 * A gilded dome on a drum (a hall of state): a hemisphere of `radius` tiles standing at `base`, in facets (ribbed, lit
 * on the side towards the light), with a little lantern and a gold ball on top.
 */
function drawDome(ctx: CanvasRenderingContext2D, camera: Camera, cx: number, cy: number, radius: number, base: number, now: number, reduced: boolean) {
  const RINGS = 5, SEGMENTS = 14, HEIGHT = radius * 32 * 0.95, P = ([x, y, h]: RoofVertex) => { const s = toScreen(camera, x, y, h); return [s.x, s.y] as const; };
  const ring = (k: number): RoofVertex[] => {
    const phi = k / RINGS * Math.PI / 2, r = radius * Math.cos(phi), h = base + HEIGHT * Math.sin(phi);
    return Array.from({ length: SEGMENTS }, (_, i) => { const a = i / SEGMENTS * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, h] as RoofVertex; });
  };
  const rings = Array.from({ length: RINGS + 1 }, (_, k) => ring(k));
  const faces: { points: RoofVertex[]; depth: number; fill: string }[] = [];
  for (let k = 0; k < RINGS; k++) for (let i = 0; i < SEGMENTS; i++) {
    const a = rings[k][i], b = rings[k][(i + 1) % SEGMENTS], c = rings[k + 1][(i + 1) % SEGMENTS], d = rings[k + 1][i];
    const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy, { rx, ry } = rotate(camera, mx, my);
    // Facing the camera (else hidden behind the near side); lit to the left like the walls, and brighter towards the top.
    if (rx + ry < -0.05 * radius && k < RINGS - 1) continue;
    const light = (rx - ry < 0 ? 0.1 : -0.06) + k * 0.025;
    faces.push({ points: [a, b, c, d], depth: depthOf(camera, cx + mx, cy + my) + k * 0.001, fill: shadeHex("#c9a24a", light) });
  }
  faces.sort((p, q) => p.depth - q.depth);
  for (const face of faces) poly(ctx, face.points.map(P), face.fill, "rgba(60,40,10,0.55)", 0.8);
  // Ribs from the drum to the crown, on the near side.
  ctx.strokeStyle = "rgba(90,60,18,0.6)"; ctx.lineWidth = 1;
  for (let i = 0; i < SEGMENTS; i += 2) {
    const { rx, ry } = rotate(camera, Math.cos(i / SEGMENTS * Math.PI * 2), Math.sin(i / SEGMENTS * Math.PI * 2));
    if (rx + ry < 0) continue;
    ctx.beginPath(); rings.forEach((r, k) => { const [x, y] = P(r[i]); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
  }
  // The lantern: a little white drum with a gold cap, and a ball.
  const top = base + HEIGHT;
  box(ctx, camera, cx, cy, 0.5, 0.5, 12, "#eee8db", "#e0d8c7", "#cbc2af", top - 2, INK, null);
  const capBase = top + 10, cap = P([cx, cy, capBase + 10]);
  poly(ctx, [P([cx - 0.32, cy - 0.32, capBase]), P([cx + 0.32, cy - 0.32, capBase]), P([cx + 0.32, cy + 0.32, capBase]), P([cx - 0.32, cy + 0.32, capBase])], "#c9a24a", INK, 1);
  const glint = reduced ? 0 : Math.sin(now / 700) * 0.5 + 0.5;
  poly(ctx, [P([cx - 0.3, cy + 0.3, capBase]), P([cx + 0.3, cy + 0.3, capBase]), cap], shadeHex("#c9a24a", 0.08), INK, 1);
  ellipse(ctx, cap[0], cap[1] - 4 * camera.zoom, 3.2 * camera.zoom, 3.2 * camera.zoom, `rgb(${232 + glint * 20},${196 + glint * 30},${92 + glint * 40})`, INK, 1);
}
/** A shop's awning colours: red, green, blue, plum, ochre and teal, each with cream. */
const AWNINGS = [["#c0504a", "#f1e6d0"], ["#4f8a5a", "#efe6c8"], ["#4a6aa8", "#f0ecdf"], ["#8a5aa8", "#efe3c4"], ["#c8862e", "#fbefd6"], ["#3f8a8a", "#eef0e6"]] as const;
/** A doorway (one or more open tiles side by side in one wall): where its wall's outer face is, which way is out, and its span along the wall. */
type DoorGroup = { nx: number; ny: number; face: number; lo: number; hi: number };
const frontDoorCache = new WeakMap<Building, DoorGroup[]>();
/** A building's front doors, grouped into doorways (cached: the world doesn't change shape). */
function frontDoors(world: World, building: Building): DoorGroup[] {
  const cached = frontDoorCache.get(building);
  if (cached) return cached;
  const groups: DoorGroup[] = [];
  for (const d of doorwaysOf(world, building)) {
    const along = d.ny !== 0 ? d.x : d.y, face = d.ny !== 0 ? d.y + d.ny * 0.5 : d.x + d.nx * 0.5;
    const group = groups.find(g => g.nx === d.nx && g.ny === d.ny && g.face === face && along >= g.lo - 0.5 && along <= g.hi + 0.5);
    if (group) { group.lo = Math.min(group.lo, along - 0.5); group.hi = Math.max(group.hi, along + 0.5); }
    else groups.push({ nx: d.nx, ny: d.ny, face, lo: along - 0.5, hi: along + 0.5 });
  }
  frontDoorCache.set(building, groups);
  return groups;
}
/** Carvings drawn lately (to crumble the ones that go), and a frame count. */
const seenCarvings = new Map<number, { x: number; y: number; color: string; frame: number }>();
let frameNo = 0;
/** A carved figure in a wood's colour: a head with a face cut in, a body ringed with carving, on a little plinth; cracked near its end. */
function carvingArt(color: string, cracked: boolean): HTMLCanvasElement {
  return pixelArt(`carving:${color}:${cracked ? 1 : 0}`, 12, 22, p => {
    const dark = shadeHex(color, -0.3), light = shadeHex(color, 0.14);
    p.rect(1, 19, 10, 3, shadeHex(color, -0.18)); p.rect(1, 19, 10, 1, shadeHex(color, -0.05));
    p.poly([[2, 19], [10, 19], [9, 9], [3, 9]], color, INK);
    p.disc(6, 6, 4, 4.4, light, INK);
    p.set(4, 6, dark); p.set(8, 6, dark); p.rect(5, 8, 3, 1, dark);
    for (const y of [12, 15, 17]) p.rect(3, y, 7, 1, dark);
    p.rect(4, 10, 1, 8, light);
    if (cracked) { p.line(7, 2, 5, 9, INK); p.line(5, 9, 8, 14, INK); p.line(4, 15, 3, 19, INK); }
  });
}
/** Whether a tile lies on a building's outline. */
const edgeOf = (building: Building, x: number, y: number) => x === building.x0 || x === building.x1 || y === building.y0 || y === building.y1;
/** How far a palace's keep and its spire rise above the top of its roof. */
const keepHeight = (building: Building) => building.keep ? building.keep.storeys * WALL_H + building.keep.spire : 0;
/** A palace roof: hipped slopes up to a keep in the middle, storeys of windowed stone, then a tall spire with a pennant. */
function drawKeepRoof(ctx: CanvasRenderingContext2D, camera: Camera, building: Building, g: ReturnType<typeof roofGeometry>, now: number, reduced: boolean) {
  const keep = building.keep!, P = ([x, y, h]: RoofVertex) => { const s = toScreen(camera, x, y, h); return [s.x, s.y] as const; };
  const cx = g.apex[0], cy = g.apex[1], half = keep.size / 2;
  const inner: RoofVertex[] = [[cx - half, cy - half, g.top], [cx + half, cy - half, g.top], [cx + half, cy + half, g.top], [cx - half, cy + half, g.top]];
  const ring = [g.A, g.B, g.C, g.D];
  const slope = (outer: RoofVertex[], top: RoofVertex[], color: string) => {
    const faces = outer.map((a, i) => {
      const b = outer[(i + 1) % outer.length], { rx, ry } = rotate(camera, a[1] - b[1], b[0] - a[0]);
      return { points: [a, b, top[(i + 1) % top.length], top[i]], fill: shadeHex(color, rx - ry < 0 ? 0.06 : -0.08) };
    });
    const centre = (points: RoofVertex[]) => depthOf(camera, (points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2);
    faces.sort((a, b) => centre(a.points) - centre(b.points));
    for (const face of faces) {
      const [a, b, c, d] = face.points.map(P).map(([x, y]) => ({ x, y }));
      const side = Math.hypot(face.points[1][0] - face.points[0][0], face.points[1][1] - face.points[0][1]);
      const run = Math.hypot((face.points[0][0] + face.points[1][0] - face.points[2][0] - face.points[3][0]) / 2, (face.points[0][1] + face.points[1][1] - face.points[2][1] - face.points[3][1]) / 2);
      const slant = Math.hypot(run * TEX_PER_TILE, (face.points[2][2] - face.points[0][2]) * TEX_PER_HEIGHT);
      if (texturesOn) {
        // Clip to the slope, and lay the shingles over the parallelogram from its eave up to its top edge.
        const up = { x: (c.x + d.x - a.x - b.x) / 2, y: (c.y + d.y - a.y - b.y) / 2 };
        ctx.save(); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.clip();
        texturedQuad(ctx, shingleTexture(face.fill, Math.round(side * TEX_PER_TILE), Math.round(slant)), { x: a.x + up.x, y: a.y + up.y }, { x: b.x + up.x, y: b.y + up.y }, a, side * TEX_PER_TILE, slant);
        ctx.restore();
      }
      poly(ctx, face.points.map(P), texturesOn ? null : face.fill, INK, 1.2);
    }
  };
  slope(ring, inner, building.color);
  // The keep: a ring of stone tiles, storey on storey, the far ones first; faces turned inwards are never seen.
  const tiles: [number, number][] = [];
  for (let i = 0; i < keep.size; i++) for (let j = 0; j < keep.size; j++) if (i === 0 || j === 0 || i === keep.size - 1 || j === keep.size - 1) tiles.push([cx - half + 0.5 + i, cy - half + 0.5 + j]);
  tiles.sort((a, b) => depthOf(camera, a[0], a[1]) - depthOf(camera, b[0], b[1]));
  const within = (x: number, y: number) => Math.abs(x - cx) < half && Math.abs(y - cy) < half;
  for (let k = 0; k < keep.storeys; k++) for (const [x, y] of tiles) {
    const lit = windowGlow > 0.02 && hash(x * 5 + 3, y + k * 11) < 0.8, pattern: WallStyle = hash(x, y + k * 7) < 0.45 ? (lit ? "window_lit" : "window") : "brick";
    box(ctx, camera, x, y, 1, 1, WALL_H, "#b9b4ab", "#a39e95", "#8f8a82", g.top + k * WALL_H, INK, pattern, (nx, ny) => within(x + nx, y + ny));
  }
  // A string course and a parapet with merlons round the keep's top, then the spire, overhanging the walls a little.
  const crown = g.top + keep.storeys * WALL_H;
  box(ctx, camera, cx, cy, keep.size + 0.2, keep.size + 0.2, 5, "#b9b4ab", "#aaa59c", "#968f87", crown, INK, null);
  if (keep.dome) { drawDome(ctx, camera, cx, cy, half + 0.1, crown + 5, now, reduced); return; }
  const o = half + 0.25, eave: RoofVertex[] = [[cx - o, cy - o, crown + 5], [cx + o, cy - o, crown + 5], [cx + o, cy + o, crown + 5], [cx - o, cy + o, crown + 5]];
  const peak: RoofVertex = [cx, cy, crown + 5 + keep.spire];
  slope(eave, [peak, peak, peak, peak], building.color);
  const [px, py] = P(peak), [qx, qy] = P([cx, cy, peak[2] + 26]), wave = reduced ? 0 : Math.sin(now / 260 + g.X0) * 2;
  ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
  poly(ctx, [[qx, qy], [qx + 18 * camera.zoom, qy + 4 * camera.zoom + wave], [qx, qy + 9 * camera.zoom]], C.butter, INK, 1);
}
function roofHull(camera: Camera, building: Building) {
  const g = roofGeometry(building), points = building.roof === "flat" ? [g.A, g.B, g.C, g.D].map(([x, y]) => [x, y, g.base + 12] as RoofVertex).concat([g.A, g.B, g.C, g.D])
    : building.roof === "cone" ? [g.A, g.B, g.C, g.D, [g.apex[0], g.apex[1], g.top + 22 + keepHeight(building)] as RoofVertex] : [g.A, g.B, g.C, g.D, g.R0, g.R1];
  const screen = points.map(([x, y, h]) => { const s = toScreen(camera, x, y, h); return [s.x, s.y] as [number, number]; });
  // Convex hull (monotone chain).
  screen.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const point of screen) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop(); lower.push(point); }
  for (const point of [...screen].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop(); upper.push(point); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function pointInPolygon(x: number, y: number, polygon: readonly [number, number][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** One tile of a flat roof: a slab at the top of the walls, with a merlon on every other edge tile. */
function flatRoofTile(ctx: CanvasRenderingContext2D, camera: Camera, building: Building, x: number, y: number, edge: boolean, alpha: number, covered?: (nx: number, ny: number) => boolean) {
  const base = WALL_H * (building.storeys ?? 1), color = building.color;
  ctx.globalAlpha = alpha;
  // The roof's sides only show at its edges: a side against more of the same roof is covered by it.
  box(ctx, camera, x, y, 1, 1, 5, shadeHex(color, 0.08), shadeHex(color, -0.06), shadeHex(color, -0.14), base, "rgba(22,22,22,0.35)", "cap", covered);
  if (edge) box(ctx, camera, x, y, 1, 1, 4, shadeHex(color, 0.12), shadeHex(color, -0.04), shadeHex(color, -0.12), base + 5, INK, "brick");
  if (edge && (x + y) % 2 === 0) box(ctx, camera, x, y, 0.6, 0.6, 8, shadeHex(color, 0.14), shadeHex(color, -0.04), shadeHex(color, -0.12), base + 9, INK, "brick");
  ctx.globalAlpha = 1;
}
function drawRoof(ctx: CanvasRenderingContext2D, camera: Camera, building: Building, alpha: number, now: number, reduced: boolean) {
  const g = roofGeometry(building), P = ([x, y, h]: RoofVertex) => { const s = toScreen(camera, x, y, h); return [s.x, s.y] as const; };
  ctx.globalAlpha = alpha;
  if (building.roof === "flat") {
    // A flat roof with battlements.
    const cx = (g.X0 + g.X1) / 2, cy = (g.Y0 + g.Y1) / 2;
    box(ctx, camera, cx, cy, g.X1 - g.X0, g.Y1 - g.Y0, 5, shade(building.color, 0.08), shade(building.color, -0.06), shade(building.color, -0.14), g.base);
    const merlon = (x: number, y: number) => box(ctx, camera, x, y, 0.42, 0.42, 8, shade(building.color, 0.12), shade(building.color, -0.04), shade(building.color, -0.12), g.base + 5);
    const sides: [number, number][] = [];
    for (let x = g.X0 + 0.3; x <= g.X1 - 0.2; x += 1.2) sides.push([x, g.Y0 + 0.25], [x, g.Y1 - 0.25]);
    for (let y = g.Y0 + 1.5; y <= g.Y1 - 1.3; y += 1.2) sides.push([g.X0 + 0.25, y], [g.X1 - 0.25, y]);
    sides.sort((a, b) => depthOf(camera, a[0], a[1]) - depthOf(camera, b[0], b[1])).forEach(([x, y]) => merlon(x, y));
    ctx.globalAlpha = 1;
    return;
  }
  if (building.roof === "cone" && building.keep) { drawKeepRoof(ctx, camera, building, g, now, reduced); ctx.globalAlpha = 1; return; }
  if (building.roof === "cone") {
    // A pointed tower roof: four slates to a peak, with a pennant.
    // Lit faces are lighter; each is tiled in shingles.
    // A round tower's cone has eight sides, sitting just outside its round wall; others are four-sided.
    const ring: RoofVertex[] = building.round
      ? Array.from({ length: 8 }, (_, i) => { const a = (i + 0.5) / 8 * Math.PI * 2, r = ((g.X1 - g.X0) / 2 - 0.15) / Math.cos(Math.PI / 8); return [g.apex[0] + Math.cos(a) * r, g.apex[1] + Math.sin(a) * r, g.base] as RoofVertex; })
      : [g.A, g.B, g.C, g.D];
    const faces = ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length], { rx, ry } = rotate(camera, (a[1] - b[1]), (b[0] - a[0])), lit = rx - ry < 0;
      return { points: [a, b, g.apex], fill: shadeHex(building.color, lit ? 0.06 : -0.08) };
    });
    const centre = (points: RoofVertex[]) => depthOf(camera, (points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2);
    faces.sort((a, b) => centre(a.points) - centre(b.points));
    const side = Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]), slant = Math.hypot((g.X1 - g.X0) * TEX_PER_TILE / 2, (g.top - g.base) * TEX_PER_HEIGHT);
    for (const face of faces) {
      const [a, b, c] = face.points.map(P).map(([x, y]) => ({ x, y }));
      if (texturesOn) texturedTriangle(ctx, shingleTexture(face.fill, Math.round(side * TEX_PER_TILE), Math.round(slant)), a, b, c, side * TEX_PER_TILE, slant);
      poly(ctx, face.points.map(P), texturesOn ? null : face.fill, INK, 1.2);
    }
    const [px, py] = P(g.apex), [qx, qy] = P([g.apex[0], g.apex[1], g.top + 20]), wave = reduced ? 0 : Math.sin(now / 260 + g.X0) * 2;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
    poly(ctx, [[qx, qy], [qx + 14 * camera.zoom, qy + 3 * camera.zoom + wave], [qx, qy + 7 * camera.zoom]], C.butter, INK, 1);
    ctx.globalAlpha = 1;
    return;
  }
  const color = building.color, gable = building.walls === "stone" ? "#b9b4ab" : building.walls === "marble" ? "#eee8db" : "#e6dcc6";
  // The ends: gable walls, or on a hipped roof more slopes of shingle.
  const endA = building.hip ? shadeHex(color, 0.02) : gable, endB = building.hip ? shadeHex(color, -0.1) : shade(gable, -0.08);
  // (The second slope, on the high-x / high-y side, is the one a chimney stands on.)
  const faces: { points: RoofVertex[]; fill: string; slope?: [RoofVertex, RoofVertex, RoofVertex, RoofVertex]; chimney?: boolean }[] = g.alongX
    ? [{ points: [g.A, g.B, g.R1, g.R0], fill: shade(color, 0.07), slope: [g.A, g.B, g.R1, g.R0] }, { points: [g.D, g.C, g.R1, g.R0], fill: shade(color, -0.07), slope: [g.D, g.C, g.R1, g.R0], chimney: true },
      { points: [g.A, g.D, g.R0], fill: endA }, { points: [g.B, g.C, g.R1], fill: endB }]
    : [{ points: [g.A, g.D, g.R1, g.R0], fill: shade(color, 0.07), slope: [g.A, g.D, g.R1, g.R0] }, { points: [g.B, g.C, g.R1, g.R0], fill: shade(color, -0.07), slope: [g.B, g.C, g.R1, g.R0], chimney: true },
      { points: [g.A, g.B, g.R0], fill: endA }, { points: [g.D, g.C, g.R1], fill: endB }];
  // A chimney rises out of its slope: it starts where the roof meets its downhill side (not down at the eaves, where it
  // would show through the roof), and is drawn straight after its own slope so nearer roof faces cover its foot.
  let slopesDrawn = 0, ridgeDrawn = false;
  const ridge = () => { if (ridgeDrawn) return; ridgeDrawn = true; const [rx0, ry0] = P(g.R0), [rx1, ry1] = P(g.R1); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(rx0, ry0); ctx.lineTo(rx1, ry1); ctx.stroke(); };
  const chimney = () => {
    if (!building.chimney) return;
    // On the nearer slope, the ridge goes behind the chimney.
    if (slopesDrawn === 2) ridge();
    const cx = g.alongX ? g.X1 - 1.4 : (g.X0 + g.X1) / 2 + 0.6, cy = g.alongX ? (g.Y0 + g.Y1) / 2 + 0.6 : g.Y1 - 1.4, w = 0.55;
    const half = (g.alongX ? g.Y1 - g.Y0 : g.X1 - g.X0) / 2, off = Math.abs(g.alongX ? cy - (g.Y0 + g.Y1) / 2 : cx - (g.X0 + g.X1) / 2) + w / 2;
    const foot = g.top - (g.top - g.base) * Math.min(1, off / half) - 2;
    box(ctx, camera, cx, cy, w, w, g.top + 6 - foot, "#8f8a83", "#a39e96", "#7c7771", foot, INK, "brick");
    box(ctx, camera, cx, cy, w + 0.12, w + 0.12, 2.5, "#a39e96", "#8f8a83", "#6d6964", g.top + 6, INK);
    if (!reduced && Math.random() < 0.06) puff(cx, cy, g.top + 10);
  };
  const span = g.alongX ? g.X1 - g.X0 : g.Y1 - g.Y0, across = g.alongX ? g.Y1 - g.Y0 : g.X1 - g.X0, slopeRows = Math.hypot(across * TEX_PER_TILE / 2, (g.top - g.base) * TEX_PER_HEIGHT);
  const centre = (points: RoofVertex[]) => depthOf(camera, points.reduce((sum, v) => sum + v[0], 0) / points.length, points.reduce((sum, v) => sum + v[1], 0) / points.length);
  faces.sort((a, b) => centre(a.points) - centre(b.points));
  const at = (v: RoofVertex) => { const [x, y] = P(v); return { x, y }; };
  for (const face of faces) {
    if (face.slope) slopesDrawn++;
    if (!texturesOn) { poly(ctx, face.points.map(P), face.fill, INK, 1.2); if (face.chimney) chimney(); continue; }
    if (face.slope) {
      // Shingles run along the ridge, from the ridge down to the eave.
      const [e0, e1, r1, r0] = face.slope, shingles = shingleTexture(shadeHex(color, rotateLit(camera, e0, r0) ? 0.06 : -0.08), Math.round(span * TEX_PER_TILE), Math.round(slopeRows));
      if (!building.hip) texturedQuad(ctx, shingles, at(r0), at(r1), at(e0), span * TEX_PER_TILE, slopeRows);
      else {
        // Hipped: the slope narrows to the ridge, so lay the shingles over the whole eave's width and clip to the slope.
        const up = [(r0[0] + r1[0] - e0[0] - e1[0]) / 2, (r0[1] + r1[1] - e0[1] - e1[1]) / 2, (r0[2] + r1[2] - e0[2] - e1[2]) / 2];
        const lift = (v: RoofVertex): RoofVertex => [v[0] + up[0], v[1] + up[1], v[2] + up[2]];
        ctx.save(); ctx.beginPath(); face.points.map(P).forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.clip();
        texturedQuad(ctx, shingles, at(lift(e0)), at(lift(e1)), at(e0), span * TEX_PER_TILE, slopeRows);
        ctx.restore();
      }
    } else if (building.hip) {
      // A hipped end: shingles, from its eave up to the ridge's end.
      const [a, b, c] = face.points.map(at), endSpan = Math.hypot(face.points[1][0] - face.points[0][0], face.points[1][1] - face.points[0][1]);
      texturedTriangle(ctx, shingleTexture(face.fill, Math.round(endSpan * TEX_PER_TILE), Math.round(slopeRows)), a, b, c, endSpan * TEX_PER_TILE, slopeRows);
    } else {
      const [a, b, c] = face.points.map(at);
      texturedTriangle(ctx, wallTexture(building.walls === "stone" ? "brick" : building.walls === "plank" ? "plank" : "timber", face.fill.startsWith("#") ? face.fill : gable), a, b, c, across * TEX_PER_TILE, (g.top - g.base) * TEX_PER_HEIGHT);
    }
    poly(ctx, face.points.map(P), null, INK, 1.2);
    if (face.chimney) chimney();
  }
  ridge();
  ctx.globalAlpha = 1;
}

// ---------- Characters ----------
function interpolate(entity: { x: number; y: number; prev: { x: number; y: number }; moved: number }, game: Game, alpha: number) {
  if (entity.moved !== game.tick) return { x: entity.x, y: entity.y, moving: false };
  return { x: entity.prev.x + (entity.x - entity.prev.x) * alpha, y: entity.prev.y + (entity.y - entity.prev.y) * alpha, moving: alpha < 1 };
}
/** A health bar: green over red, ink outline. `label` (a level) sits to its left. */
const WEAKNESS_COLORS: Record<string, string> = { fire: "#e9a07a", water: "#8fa3c9", wind: "#e6ecef", earth: "#a89479", holy: "#f2e28f" }, WEAKNESS_GLYPH: Record<string, string> = { fire: "F", water: "W", wind: "A", earth: "E", holy: "✚" };
function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, fraction: number, z: number, width = 30, label?: string) { ui(ctx, ctx => {
  const w = width * z, h = 4.5 * Math.max(0.85, z), left = x - w / 2;
  ctx.fillStyle = "#cf6e6e"; ctx.fillRect(left, y, w, h);
  ctx.fillStyle = "#86c47f"; ctx.fillRect(left, y, w * Math.max(0, Math.min(1, fraction)), h);
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(left, y, w, h);
  if (label) {
    ctx.font = `bold ${Math.round(9 * Math.max(0.9, z))}px ui-monospace, Menlo, Consolas, monospace`; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeText(label, left - 3, y + h / 2); ctx.fillStyle = "#f2e28f"; ctx.fillText(label, left - 3, y + h / 2);
  }
}); }
function splat(ctx: CanvasRenderingContext2D, x: number, y: number, damage: number, z: number, age: number) { ui(ctx, ctx => {
  const r = 9 * Math.max(0.8, z), rise = age * 10 * z;
  ellipse(ctx, x, y - rise, r, r * 0.9, damage > 0 ? "#c98f95" : "#9fb4d0", INK, 1.4);
  ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(11 * Math.max(0.85, z))}px ui-monospace, Menlo, Consolas, monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeText(String(Math.max(0, damage)), x, y - rise + 0.5); ctx.fillText(String(Math.max(0, damage)), x, y - rise + 0.5);
}); }
/**
 * A nameplate over a Friend: the name large and bright, the fellowship tag under it, the token id small, muted and a
 * little transparent (an unnamed Friend shows just "#id"). Titles are kept for Examine, so a full square stays readable.
 */
function nameplate(ctx: CanvasRenderingContext2D, x: number, bottom: number, name: string | null, tag: string | null, id: number, z: number, color = "#ffffff", mode: "full" | "name" | "off" = "full"): number {
  if (mode === "off") return 0;
  if (mode === "name") {
    // The name alone (or the token number when there's no name yet), with nothing under it.
    const scale = Math.max(0.9, Math.min(1.4, z));
    ui(ctx, ctx => { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.strokeStyle = INK; ctx.font = `bold ${Math.round(name ? 13 : 11)}px ui-monospace, Menlo, Consolas, monospace`.replace(/^bold (\d+)px/, (_, size) => `bold ${Math.round(Number(size) * scale)}px`); ctx.lineWidth = 3.5; ctx.strokeText(name ?? `#${id}`, x, bottom); ctx.fillStyle = color; ctx.fillText(name ?? `#${id}`, x, bottom); });
    return Math.round(14 * scale);
  }
  const scaleH = Math.max(0.9, Math.min(1.4, z)), height = name ? Math.round((10 + (tag ? 11 : 0) + 14) * scaleH) : Math.round((12 + (tag ? 12 : 0)) * scaleH);
  ui(ctx, ctx => {
    const scale = Math.max(0.9, Math.min(1.4, z)), mono = "ui-monospace, Menlo, Consolas, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.strokeStyle = INK;
    let y = bottom;
    if (name) {
      ctx.font = `${Math.round(9 * scale)}px ${mono}`; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.72; ctx.strokeText(`(${id})`, x, y); ctx.fillStyle = "#d9d5cc"; ctx.fillText(`(${id})`, x, y); ctx.globalAlpha = 1; y -= Math.round(10 * scale);
      if (tag) { ctx.font = `bold ${Math.round(10 * scale)}px ${mono}`; ctx.lineWidth = 3; ctx.strokeText(`[${tag}]`, x, y); ctx.fillStyle = "#f2e28f"; ctx.fillText(`[${tag}]`, x, y); y -= Math.round(11 * scale); }
      ctx.font = `bold ${Math.round(13 * scale)}px ${mono}`; ctx.lineWidth = 3.5; ctx.strokeText(name, x, y); ctx.fillStyle = color; ctx.fillText(name, x, y);
    } else {
      ctx.font = `bold ${Math.round(11 * scale)}px ${mono}`; ctx.lineWidth = 3; ctx.strokeText(`#${id}`, x, y); ctx.fillStyle = color; ctx.fillText(`#${id}`, x, y);
      if (tag) { y -= Math.round(12 * scale); ctx.font = `bold ${Math.round(10 * scale)}px ${mono}`; ctx.strokeText(`[${tag}]`, x, y); ctx.fillStyle = "#f2e28f"; ctx.fillText(`[${tag}]`, x, y); }
    }
  });
  return height;
}
function overheadText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#f2e28f") { ui(ctx, ctx => {
  ctx.font = "bold 13px ui-monospace, Menlo, Consolas, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
}); }
// ---------- Scene ----------
/**
 * Something in the world, drawn back to front. `at` is where it stands (tiles) and how high up it's lit (world px): it's
 * tinted by the light there. Without `at` it's drawn as it is (fires, beams: things that give light). `size` bounds it
 * on screen (world px up, to the side and down from its feet; `rect` for odd shapes), `cast` makes it throw a shadow in
 * the sun, and `min` keeps it readable in the dark.
 */
type Drawable = {
  depth: number; draw: () => void;
  at?: { x: number; y: number; h?: number }; size?: readonly [number, number, number]; rect?: () => [number, number, number, number]; cast?: boolean; min?: number;
  /** A light of its own choosing (the haze takes the sky's). */
  light?: RGB;
  /** On Low, its outline on screen (walls, roofs, cliffs): filled with its light instead of cutting it from the light. */
  hull?: () => [number, number][] | null;
  /** Scenery (trees, rocks, decorations) isn't checked for hills in front of it: there's too much of it to be worth it. */
  scenery?: boolean;
  /** Drawn as pixel art alone: its shadow and its hole in the light are the same sprites laid again, not a second drawing. */
  sprite?: boolean;
  /** Its hull is exactly what it draws (a box, a ground quad): High lights it by the hull too. */
  exact?: boolean;
  /** It gives off its own light (a lantern): it takes the light round it and adds its glow, with no hole of its own. */
  glows?: boolean;
  /** Set by the frame's draw: off screen (skipped), its screen box, the sprites it laid, and the glow it gave off. */
  skip?: boolean; box?: [number, number, number, number]; sprites?: SpriteDraw[] | null; emitted?: [number, number][][] | null; tag?: string;
};
let lastHits: Hit[] = [];
/** Picks under a point, topmost first, from the last frame. */
export function pickAt(x: number, y: number): Pick[] {
  const out: Pick[] = [];
  for (let i = lastHits.length - 1; i >= 0; i--) {
    const hit = lastHits[i];
    if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h && !out.some(p => p.kind === hit.pick.kind && p.id === hit.pick.id)) out.push(hit.pick);
  }
  return out;
}
let lastFrame = 0;
/** A tile of an upper floor: flagstones, boards or carpet, lifted to its storey. */
function floorTile(ctx: CanvasRenderingContext2D, camera: Camera, x: number, y: number, terrain: number) {
  const c = (dx: number, dy: number) => { const s = toScreen(camera, x + dx, y + dy); return [s.x, s.y] as const; };
  const color = shade(TERRAIN_COLORS[terrain] ?? "#c4c1ba", (hash(x, y) - 0.5) * 0.035);
  poly(ctx, [c(-0.5, -0.5), c(0.5, -0.5), c(0.5, 0.5), c(-0.5, 0.5)], color, "rgba(22,22,22,0.16)", 1);
  ctx.strokeStyle = terrain === T.CARPET ? "rgba(255,255,255,0.35)" : "rgba(22,22,22,0.14)"; ctx.lineWidth = 1; ctx.beginPath();
  if (terrain === T.WOOD) for (const t of [-0.17, 0.17]) { const [ax, ay] = c(-0.5, t), [bx, by] = c(0.5, t); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
  else if (terrain === T.CARPET) { const [ax, ay] = c(0, -0.32), [bx, by] = c(0.32, 0), [cx, cy] = c(0, 0.32), [dx, dy] = c(-0.32, 0); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath(); }
  else { const [ax, ay] = c(-0.5, 0), [bx, by] = c(0.5, 0); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
  ctx.stroke();
}
/** Eased height of the storey you're on, so the camera rises with you up the stairs. */
let liftNow = 0;
/** Where each frame's drawing time goes (rolling averages, ms), for the performance check. */
export const RENDER_PROFILE: Record<string, number> = {};
let profileAt = 0;
const lap = (name: string) => { const t = performance.now(); RENDER_PROFILE[name] = (RENDER_PROFILE[name] ?? 0) * 0.95 + (t - profileAt) * 0.05; profileAt = t; };
export function renderScene(target: CanvasRenderingContext2D, scene: Scene) {
  profileAt = performance.now();
  // (The first time a world is drawn, its buildings get their fronts: banks, shops, inns.)
  dressWorld(scene.game.world);
  // What everything draws on: the frame, or (while objects cut their light, or cast their shadows) a light buffer.
  let ctx = target;
  const { game, camera, now } = scene, world = game.world, z = camera.zoom;
  const alpha = Math.max(0, Math.min(1, (now - scene.tickAt) / TICK_MS));
  const underground = isUnderground(game.player.y);
  const dt = Math.min(0.05, Math.max(0, (now - (lastFrame || now)) / 1000)); lastFrame = now;
  // Where you really are: the storey (level) and the building complex you're in, if any.
  const here = realPoint(world, game.player.x, game.player.y), floor = floorAt(world, game.player.x, game.player.y), level = here.level;
  const inside = floor ? floor.complex : complexAt(world, here.x, here.y);
  const liftGoal = level * STOREY; liftNow = scene.reducedMotion || Math.abs(liftGoal - liftNow) > STOREY * 2 ? liftGoal : liftNow + (liftGoal - liftNow) * Math.min(1, dt * 8);
  setGround(world); viewFloor = floor; camera.base = groundHeight(world, camera.x, camera.y) + liftNow;
  const low = !!scene.low, reach = low ? 44 : DRAW_DISTANCE;
  texturesOn = z >= 0.7; beginTextures(ctx);
  const project = (x: number, y: number, lift = 0) => toScreen(camera, x, y, lift);
  updateEffects(game, camera, dt, scene.reducedMotion || low, 34 / Math.max(0.5, z));
  // With WebGL the sky and the ground are the GPU's (gl.ts): this layer starts clear.
  const glr = scene.gl ?? null;
  if (glr) ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  else if (underground) { ctx.fillStyle = "#0e0e10"; ctx.fillRect(0, 0, VIEW.width, VIEW.height); }
  else { const sky = ctx.createLinearGradient(0, 0, 0, VIEW.height); sky.addColorStop(0, "#b9c7d6"); sky.addColorStop(1, "#dcdfda"); ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW.width, VIEW.height); }
  // Visible tile bounds. Low camera angles see a long way: draw out to DRAW_DISTANCE and let the haze take the rest.
  const [x0, y0, x1, y1] = tileRange(camera, reach);
  const glChunks = glr ? groundChunks(glr, game, x0, y0, x1, y1) : [];
  if (glr) glr.clearBoxes();
  lap("setup"); if (!glr) drawGround(ctx, scene, x0, y0, x1, y1, reach); lap("terrain"); RENDER_PROFILE.groundQuads = textureStats.frame;
  // The sky's light for the time of day and the weather; the sun's share of it decides how dark shadows are.
  const weather = scene.weather ?? null, sky = gloomSky(skyFor(scene.time, weather, underground), gloomAt(world, game.player.x, game.player.y)), lit = true;
  windowGlow = underground ? 0 : Math.max(0, Math.min(1, (sky.night - 0.3) / 0.45));
  if ((seenVersion.get(world) ?? 0) !== (game.worldVersion ?? 0)) { seenVersion.set(world, game.worldVersion ?? 0); roomLightCache.delete(world); resetLighting(world); }
  const rooms = roomLights(world);
  const sunShare = (sky.sun[0] + sky.sun[1] + sky.sun[2]) / Math.max(0.01, sky.sun[0] + sky.sun[1] + sky.sun[2] + sky.ambient[0] + sky.ambient[1] + sky.ambient[2]);
  if (!low) { ctx.globalAlpha = Math.min(1, sunShare * 2.2); drawCloudShadows(ctx, project, camera, now, z, underground, scene.reducedMotion); ctx.globalAlpha = 1; drawPrints(ctx, camera, now); }
  const hits: Hit[] = [], drawables: Drawable[] = [], lights: PointLight[] = [], blockers: [number, number, number][] = [];
  // Lamps, torches, fires and spells are point lights in the world (upstairs, at the real place): `lift` is the flame's
  // height, `radius` its reach (screen px at zoom 1). By day they hardly show.
  const lightK = 0.18 + 0.82 * sky.night;
  const glow = (x: number, y: number, lift: number, radius: number, color?: string, strength = 1, flicker = false) => {
    if (y >= FLOOR_Y - 0.5) ({ x, y } = realPoint(world, x, y));
    if (x < x0 - 10 || x > x1 + 10 || y < y0 - 10 || y > y1 + 10) return;
    const wobble = flicker && !scene.reducedMotion ? 1 + Math.sin(now / 90 + x * 1.7 + y) * 0.07 + Math.sin(now / 37 + x * 3.1) * 0.04 : 1;
    lights.push({ x, y, h: lift, r: radius / 32 * 1.15, rgb: hexRgb(color ?? "#e89a4f"), k: strength * wobble * lightK });
  };
  const player = game.player, pp = interpolate(player, game, alpha), playerDepth = depthOf(camera, pp.x, pp.y), depth = (x: number, y: number) => depthOf(camera, x, y);
  const me = toScreen(camera, pp.x, pp.y), meTop = me.y - 60 * z;
  const coversPlayer = (x: number, y: number) => { const at = toScreen(camera, x, y); return Math.abs(at.x - me.x) < 34 * z && at.y > meTop && at.y - 95 * z < me.y; };
  const playerFacing = screenFacing(camera, player.heading);
  /** Ground tiles under the storey you stand on are covered: nothing there is drawn but the outer walls. */
  const covered = (x: number, y: number) => level > 0 && inside !== null && complexAt(world, x, y) === inside;
  /** An outer wall of your building (it shows on every storey below you). */
  const outerWall = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => complexAt(world, x + dx, y + dy) !== inside);
  /** Whether something standing on a tile is drawn: your storey only, and nothing under it. */
  const shown = (x: number, y: number, margin = 0) => {
    if (y >= FLOOR_Y - 0.5) { const on = floorAt(world, x, y); return !!on && !!floor && on.complex === floor.complex && on.level === level; }
    return x >= x0 - margin && x <= x1 && y >= y0 - margin && y <= y1 && !covered(Math.round(x), Math.round(y));
  };
  // Hover highlight and click marker.
  const tileOutline = (tx: number, ty: number, color: string) => { const c = (dx: number, dy: number) => { const s = toScreen(camera, tx + dx, ty + dy); return [s.x, s.y] as const; }; poly(ctx, [c(-0.5, -0.5), c(0.5, -0.5), c(0.5, 0.5), c(-0.5, 0.5)], null, color, 1.5); };
  /** A wall tile: storeys of brick (with windows on buildings), cut low when it stands between you and the camera inside. */
  const wall = (x: number, y: number, storeys: number, cut: boolean, near: boolean, windows: boolean, battlement = false, style: Building["walls"] = "stone", tall = 0, joined?: (nx: number, ny: number) => boolean, crown = false) => {
    if (crown) tall += 17;
    const d = depth(x, y), dungeon = isUnderground(y), timber = style === "timber";
    // Under a roof you can see, a wall's inward faces can't be seen: skip them (they're half the work).
    const owner = !dungeon && inBounds(x, y) ? world.buildingAt[y * W + x] : 0, roofed = owner > 0 && (roofAlpha.get(owner - 1) ?? 0) > 0.95 && !cut;
    // (Only faces onto a real floor inside: a round tower's footprint square has open ground in its corners.)
    const inward = roofed ? (nx: number, ny: number) => { const tx = x + nx, ty = y + ny; return inBounds(tx, ty) && world.buildingAt[ty * W + tx] === owner && INDOOR_FLOORS.has(world.tiles[ty * W + tx]); } : undefined;
    const hidden = inward && joined ? (nx: number, ny: number) => inward(nx, ny) || joined(nx, ny) : inward ?? joined;
    drawables.push({ depth: d, at: { x, y, h: 20 }, size: [(cut ? 9 : dungeon ? 34 : storeys * WALL_H + tall) + 24, 52, 30],
      exact: true, hull: () => near ? null : boxHull(camera, x, y, 1, 1, cut ? 9 : dungeon ? 34 : battlement ? 22 : storeys * WALL_H + tall), draw: () => {
      // (On the GPU unless it's see-through: a wall you're standing behind.)
      capturing = glr && !near && ctx === target ? glr : null;
      ctx.globalAlpha = near ? 0.3 : 1;
      const [top, left, right] = dungeon ? ["#4a4950", "#3a3940", "#2f2e35"] : timber ? ["#8a6a50", "#e6dcc6", "#cfc4ab"] : style === "plank" ? ["#8a6a50", "#b89c7e", "#9c8266"] : style === "marble" ? ["#eee8db", "#e0d8c7", "#cbc2af"] : ["#b9b4ab", "#a39e95", "#8f8a82"];
      const plain: WallStyle = dungeon ? "dungeon" : timber ? "timber" : style === "plank" ? "plank" : "brick";
      // At night most windows glow with the lamps inside.
      const glazed = (k: number): WallStyle => windowGlow > 0.02 && hash(x * 5 + 3, y + k * 11) < 0.8 ? (timber ? "timber_window_lit" : "window_lit") : timber ? "timber_window" : "window";
      if (dungeon) box(ctx, camera, x, y, 1, 1, 34, top, left, right, 0, INK, "dungeon");
      else if (cut) box(ctx, camera, x, y, 1, 1, 9, top, left, right, 0, INK, plain);
      else if (battlement) { box(ctx, camera, x, y, 1, 1, 12, top, left, right, 0, INK, "brick"); if ((Math.round(x) + Math.round(y)) % 2 === 0) box(ctx, camera, x, y, 0.62, 0.62, 10, top, left, right, 12, INK, "brick"); }
      else {
        for (let k = 0; k < storeys; k++) box(ctx, camera, x, y, 1, 1, WALL_H, top, left, right, k * WALL_H, INK, windows && hash(x, y + k * 7) < 0.34 ? glazed(k) : plain, hidden);
        // A tower taller than its floors: more wall above, with a string course of stone between.
        // A rampart: a wall-walk's coping, and a merlon on every other tile.
        if (crown) { box(ctx, camera, x, y, 1.06, 1.06, 5, top, shadeHex(left, 0.06), shadeHex(right, 0.06), storeys * WALL_H, INK, "brick", hidden); if ((Math.round(x) + Math.round(y)) % 2 === 0) box(ctx, camera, x, y, 0.62, 0.62, 12, top, left, right, storeys * WALL_H + 5, INK, "brick"); }
        else if (tall) { box(ctx, camera, x, y, 1.04, 1.04, 4, top, shadeHex(left, 0.06), shadeHex(right, 0.06), storeys * WALL_H, INK, null, hidden); box(ctx, camera, x, y, 1, 1, tall - 4, top, left, right, storeys * WALL_H + 4, INK, windows && hash(x, y + 91) < 0.28 ? glazed(storeys) : plain, hidden); }
      }
      ctx.globalAlpha = 1; capturing = null;
    } });
  };
  /**
   * A lantern hanging from the rafters (or an iron chandelier of six candles in a big hall), lighting the room. They hang
   * high, above a Friend's head, and one that still lands over your Friend on screen turns see-through.
   */
  const LAMP_H = 52, RAFTER_H = STOREY + 22;
  const roomLight = (x: number, y: number, big: boolean) => {
    glow(x, y, 40, big ? 240 : 190, "#f3b262", big ? 1.25 : 1.05, true);
    drawables.push({ depth: depth(x, y) + 0.2, at: { x, y, h: LAMP_H }, size: [RAFTER_H + 24, 36, 12], glows: true, draw: () => {
      const ceiling = toScreen(camera, x, y, RAFTER_H), flick = scene.reducedMotion ? 0 : Math.sin(now / 70 + x * 3.1 + y) * 0.5 * z;
      const lamp = toScreen(camera, x, y, LAMP_H), overMe = Math.abs(lamp.x - me.x) < 30 * z && lamp.y > me.y - 80 * z && lamp.y < me.y + 8 * z;
      if (overMe) ctx.globalAlpha = 0.25;
      ctx.strokeStyle = "#2e2823"; ctx.lineWidth = Math.max(1, 1.2 * z);
      if (!big) {
        const s = lamp;
        ctx.beginPath(); ctx.moveTo(ceiling.x, ceiling.y); ctx.lineTo(s.x, s.y - 11 * z); ctx.stroke();
        poly(ctx, [[s.x - 4.5 * z, s.y - 8 * z], [s.x + 4.5 * z, s.y - 8 * z], [s.x, s.y - 12 * z]], "#3b332c", INK, 1);
        poly(ctx, [[s.x - 3.5 * z, s.y - 8 * z], [s.x + 3.5 * z, s.y - 8 * z], [s.x + 3.5 * z, s.y + 1 * z], [s.x - 3.5 * z, s.y + 1 * z]], "#ffd98a", INK, 1);
        ctx.fillStyle = "#6b4a2c"; ctx.fillRect(s.x - 0.5 * z, s.y - 8 * z, 1 * z, 9 * z);
        ellipse(ctx, s.x, s.y - 3.5 * z + flick, 1.5 * z, 2.3 * z, "#fff3c4", null);
        poly(ctx, [[s.x - 4.5 * z, s.y + 1 * z], [s.x + 4.5 * z, s.y + 1 * z], [s.x + 3 * z, s.y + 3 * z], [s.x - 3 * z, s.y + 3 * z]], "#3b332c", INK, 1);
        if (!bare && !overMe) emitted.push(blob(s.x, s.y - 3.5 * z, 4 * z, 5.5 * z));
        ctx.globalAlpha = 1;
        return;
      }
      // Chains from the ceiling to an iron ring, candles around it (the ring turns with the camera like the world does).
      const ring = Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3; return toScreen(camera, x + Math.cos(a) * 0.36, y + Math.sin(a) * 0.36, LAMP_H); });
      for (const k of [0, 2, 4]) { ctx.beginPath(); ctx.moveTo(ceiling.x, ceiling.y); ctx.lineTo(ring[k].x, ring[k].y); ctx.stroke(); }
      ctx.lineWidth = Math.max(1.5, 2.4 * z); ctx.strokeStyle = "#2e2823"; ctx.beginPath(); ring.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
      ctx.lineWidth = Math.max(0.8, 1 * z); ctx.strokeStyle = "#5a4c3e"; ctx.stroke();
      for (const [i, p] of ring.entries()) {
        ctx.fillStyle = "#efe6cf"; ctx.fillRect(p.x - 1.2 * z, p.y - 6 * z, 2.4 * z, 6 * z);
        const f = scene.reducedMotion ? 0 : Math.sin(now / 60 + i * 1.9 + x) * 0.6 * z;
        ellipse(ctx, p.x, p.y - 8 * z + f, 1.4 * z, 2.4 * z, "#ffd26b", null); ellipse(ctx, p.x, p.y - 7.6 * z + f, 0.7 * z, 1.2 * z, "#fff6d0", null);
        if (!bare && !overMe) emitted.push(blob(p.x, p.y - 8 * z, 3 * z, 4 * z));
      }
      ctx.globalAlpha = 1;
    } });
  };
  /** A world object on a tile (trees, rocks, stations, decor). Out in the haze, the smallest decorations are left off. */
  const object = (x: number, y: number) => {
    const room = rooms.get(y * W + x);
    if (room) roomLight(x, y, room.big);
    const object = objectAtTile(world, x, y);
    if (!object || object.name === "__removed") return;
    if (object.kind === "decor" && SMALL_DECOR.has(object.decor!) && Math.abs(x - camera.x) + Math.abs(y - camera.y) > HAZE_START) return;
    if (object.decor === "lamp") glow(x, y, 48, 150, "#f2b261", 0.9); else if (object.decor === "torch") glow(x, y, 32, 130, "#ef9a4c", 1, true); else if (object.decor === "hearth") glow(x, y, 14, 170, "#f0a050", 1, true);
    else if (object.kind === "furnace" || object.kind === "range") glow(x, y, 16, 110); else if (object.kind === "altar") glow(x, y, 26, 70); else if (object.kind === "fountain" && objectAtTile(world, x - 1, y)?.kind !== "fountain" && objectAtTile(world, x, y - 1)?.kind !== "fountain") glow(x + 0.5, y + 0.5, 12, 110, "#a9d4f2", 0.55); else if (object.kind === "sigil_altar") glow(x, y, 30, 90);
    // The fountain is 2 × 2: sorted by its centre (a little forward, for its rim), not its back tile, so Friends beside it
    // stand behind its rim rather than on it, at any camera angle.
    const fountainMaster = object.kind === "fountain" && objectAtTile(world, x - 1, y)?.kind !== "fountain" && objectAtTile(world, x, y - 1)?.kind !== "fountain";
    const d = fountainMaster ? depth(x + 0.5, y + 0.5) + 0.3 : depth(x, y) + (object.kind === "wheat" || object.kind === "spot" ? -0.4 : 0);
    const flat = object.kind === "spot" || (object.kind === "decor" && FLAT_DECOR.has(object.decor!));
    const sprite = object.kind === "tree" || object.kind === "rock" || (object.kind === "decor" && object.decor !== "banner");
    drawables.push({ depth: d, at: { x, y }, cast: !flat, sprite, scenery: object.kind === "tree" || object.kind === "rock" || object.kind === "decor" || object.kind === "spot", size: object.decor === "windmill" ? [320, 140, 40] : object.kind === "tree" ? [260, 110, 40] : [200, 110, 40], draw: () => {
      let rect: { x: number; y: number; w: number; h: number };
      const tall = object.kind === "tree" || (object.kind === "decor" && (["pine", "windmill", "palm", "pillar", "tent", "crypt", "obelisk", "canopy", "wise_friend", "god_dusk"].includes(object.decor!) || (object.decor === "ruin_wall" && (object.height ?? 0) > 34)));
      // Anything tall in front of your Friend that covers it on screen turns see-through (works at any angle and zoom).
      const fade = tall && d > playerDepth + 0.3 && coversPlayer(x, y) ? 0.35 : 1;
      if (object.kind === "tree") rect = drawTree(ctx, scene, object, game.depleted.has(object.id), fade, scene.reducedMotion ? 0 : treeShake(game, object.id, now));
      else if (object.kind === "rock") rect = drawRock(ctx, camera, object, game.depleted.has(object.id));
      else if (object.kind === "spot") rect = drawSpot(ctx, camera, object, now, scene.reducedMotion);
      else if (object.kind === "decor") rect = drawDecor(ctx, scene, object, fade);
      else rect = drawStation(ctx, scene, object);
      if (object.kind !== "decor" || object.decor === "chest") hits.push({ ...rect, pick: { kind: "object", id: object.id } });
    } });
  };
  // Static objects, walls and cliffs on the ground.
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inBounds(x, y)) continue;
    const terrain = world.tiles[y * W + x];
    if (terrain === T.WALL) {
      const owner = world.buildingAt[y * W + x], building = owner ? world.buildings[owner - 1] : null, mine = inside !== null && complexAt(world, x, y) === inside;
      if (mine && level > 0 && !outerWall(x, y)) continue;
      const d = depth(x, y), cut = mine && level === 0 && d > playerDepth - 0.5;
      const faded = (tx: number, ty: number) => Math.abs(tx - pp.x) + Math.abs(ty - pp.y) < 7 && depth(tx, ty) > playerDepth + 0.5 && !floor;
      const near = !mine && faded(x, y);
      // A side against the next tile of the same wall is covered by it (seen from outside, where both stand whole).
      const joined = mine || near ? undefined : (nx: number, ny: number) => {
        const tx = x + nx, ty = y + ny;
        return inBounds(tx, ty) && world.tiles[ty * W + tx] === T.WALL && world.buildingAt[ty * W + tx] === owner && !(inside !== null && complexAt(world, tx, ty) === inside) && !faded(tx, ty);
      };
      // Tall buildings show every storey from outside; inside, only the storey you're on (and the ones below).
      // A city's rampart stands storeys high, battlemented, wherever no building owns the wall.
      const rampart = building || mine ? 0 : rampartAt(world, x, y);
      wall(x, y, mine ? 1 : building?.storeys ?? (rampart || 1), cut, near, !!owner && !cut, false, building?.walls ?? "stone", mine ? 0 : building?.tall ?? 0, joined, rampart > 0);
      // Walls not under a roof cast their own shadows (a building's are cast whole).
      if (!building || building.roof === "none") blockers.push([x, y, (building?.storeys ?? (rampart || 1)) * WALL_H]);
    } else if (y < FLOOR_Y && !isUnderground(y) && world.buildingAt[y * W + x] && (world.buildings[world.buildingAt[y * W + x] - 1].storeys ?? 1) > 1 && edgeOf(world.buildings[world.buildingAt[y * W + x] - 1], x, y)
      && !(inside !== null && complexAt(world, x, y) === inside) && !(Math.abs(x - pp.x) + Math.abs(y - pp.y) < 7 && depth(x, y) > playerDepth + 0.5 && !floor)) {
      // A doorway in a tall building is one storey high: the wall carries on above it.
      const building = world.buildings[world.buildingAt[y * W + x] - 1], h = ((building.storeys ?? 1) - 1) * WALL_H + (building.tall ?? 0);
      drawables.push({ depth: depth(x, y), at: { x, y, h: WALL_H + 20 }, size: [h + WALL_H + 24, 52, 30], exact: true, hull: () => boxHull(camera, x, y, 1, 1, h, WALL_H), draw: () => {
        capturing = glr && ctx === target ? glr : null;
        box(ctx, camera, x, y, 1, 1, 6, "#b9b4ab", "#b3ada4", "#9d978e", WALL_H, INK, null);
        box(ctx, camera, x, y, 1, 1, h - 6, "#b9b4ab", "#a39e95", "#8f8a82", WALL_H + 6, INK, hash(x, y + 5) < 0.4 ? (windowGlow > 0.02 ? "window_lit" : "window") : "brick");
        capturing = null;
      } });
    } else if (terrain === T.CLIFF) { drawables.push({ depth: depth(x, y), at: { x, y }, size: [60, 52, 30], exact: true, hull: () => boxHull(camera, x, y, 1, 1, 22 + hash(x, y) * 10), draw: () => { capturing = glr && ctx === target ? glr : null; box(ctx, camera, x, y, 1, 1, 22 + hash(x, y) * 10, "#a39e96", "#8f8a83", "#7c7771"); capturing = null; } }); blockers.push([x, y, 28]); }
    if (!covered(x, y)) object(x, y);
  }
  // The storeys you've climbed: outer walls of the ones below, and the floor you stand on with its walls and furniture.
  if (floor) for (const storey of world.floors) {
    if (storey.complex !== floor.complex || storey.level > level) continue;
    for (let ry = storey.y0; ry <= storey.y1; ry++) for (let rx = storey.x0; rx <= storey.x1; rx++) {
      const x = rx + storey.dx, y = ry + storey.dy, terrain = world.tiles[y * W + x];
      if (terrain === T.VOID) continue;
      const owner = world.buildingAt[ry * W + rx], building = owner ? world.buildings[owner - 1] : null;
      if (terrain === T.WALL) {
        if (storey.level < level && !outerWall(rx, ry)) continue;
        // On the roof, the keep's walls are battlements; the towers carry on up. Walls of the part you're in (the keep, or a
        // tower you've stepped into) drop to a cutaway between you and the camera.
        const battlement = (building?.storeys ?? 1) <= storey.level, yours = !!building && here.x >= building.x0 && here.x <= building.x1 && here.y >= building.y0 && here.y <= building.y1;
        wall(x, y, 1, storey.level === level && !battlement && yours && depth(x, y) > playerDepth - 0.5, false, !!owner, battlement, building?.walls ?? "stone");
        continue;
      }
      if (storey.level !== level) continue;
      drawables.push({ depth: depth(x, y) - 0.45, at: { x, y, h: 4 }, size: [20, 52, 30], tag: "floor", draw: () => floorTile(ctx, camera, x, y, terrain) });
      object(x, y);
    }
  }
  // Craftwork's carvings: a figure on a faint ring of its wood's colour showing how far it reaches; it shakes and cracks as it
  // nears its end, and crumbles to dust when it goes.
  for (const carving of game.carvings) {
    if (!shown(carving.x, carving.y)) continue;
    const def = CARVINGS.find(entry => entry.id === carving.id);
    if (!def) continue;
    seenCarvings.set(carving.uid, { x: carving.x, y: carving.y, color: def.color, frame: frameNo });
    const age = (game.tick + alpha - carving.placed) / Math.max(1, carving.until - carving.placed), fading = Math.max(0, (age - 0.85) / 0.15);
    drawables.push({ depth: depth(carving.x, carving.y) - 0.35, at: { x: carving.x, y: carving.y, h: 2 }, size: [30, 140, 70], scenery: true, draw: () => {
      // The reach, as a ring of light on the ground.
      ctx.save(); ctx.globalAlpha = 0.5 * (1 - fading * 0.7) * (scene.reducedMotion ? 1 : 0.85 + Math.sin(now / 500 + carving.uid) * 0.15);
      ctx.strokeStyle = shadeHex(def.color, 0.25); ctx.lineWidth = 2.5 * z; ctx.setLineDash([6 * z, 4 * z]); ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2, q = toScreen(camera, carving.x + Math.cos(a) * CARVING_REACH, carving.y + Math.sin(a) * CARVING_REACH); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
      ctx.stroke(); ctx.restore();
    } });
    drawables.push({ depth: depth(carving.x, carving.y), at: { x: carving.x, y: carving.y }, cast: true, sprite: true, size: [80, 40, 20], draw: () => {
      const s = toScreen(camera, carving.x, carving.y), shake = fading && !scene.reducedMotion ? Math.sin(now / 40 + carving.uid) * 1.4 * fading * z : 0;
      drawPixels(ctx, carvingArt(def.color, fading > 0.4), s.x + shake, s.y + 2 * z, ART * z * 1.3);
    } });
  }
  // Carvings gone since last frame crumble into dust where they stood.
  for (const [uid, seen] of seenCarvings) {
    if (game.carvings.some(carving => carving.uid === uid)) continue;
    if (seen.frame >= frameNo - 2) { burst("dust", seen.x, seen.y, 14, 14, seen.color, { speed: 0.9, up: 30, life: 1.2, size: 3 }); burst("chip", seen.x, seen.y, 20, 8, shadeHex(seen.color, -0.2), { speed: 1.4, up: 60, life: 0.9, size: 2 }); }
    seenCarvings.delete(uid);
  }
  frameNo++;
  // Fires.
  for (const fire of game.fires) {
    if (!shown(fire.x, fire.y)) continue;
    glow(fire.x, fire.y, 8, 160, "#f08a3c", 1, true);
    drawables.push({ depth: depth(fire.x, fire.y), draw: () => {
      const s = toScreen(camera, fire.x, fire.y), frame = scene.reducedMotion ? 0 : Math.floor(now / 110 + fire.uid * 3) % 8;
      // A small fire sitting in a pile of logs.
      ellipse(ctx, s.x, s.y - 6 * z, 16 * z, 11 * z, "rgba(240,170,110,0.16)", null);
      drawPixels(ctx, campfireLogs(fire.uid), s.x, s.y + 5 * z, ART * z * 0.78);
      drawPixels(ctx, fireArt(frame, 12, 17, fire.uid % 3 + 1), s.x, s.y - 2 * z, ART * z);
      hits.push({ x: s.x - 24 * z, y: s.y - 36 * z, w: 48 * z, h: 42 * z, pick: { kind: "fire", id: fire.uid } });
    } });
  }
  // Ground items.
  const groundTiles = new Map<string, typeof game.ground>();
  for (const entry of game.ground) {
    if (!shown(entry.x, entry.y)) continue;
    const key = `${entry.x},${entry.y}`; const list = groundTiles.get(key) ?? []; list.push(entry); groundTiles.set(key, list);
  }
  for (const list of groundTiles.values()) {
    const rare = list.some(entry => entry.rare);
    if (rare) glow(list[0].x, list[0].y, 20, 90, "#f2d56b", 0.9, true);
    if (rare) drawables.push({ depth: depth(list[0].x, list[0].y) - 0.31, draw: () => {
        // A rare drop: a pulsing golden beam rising from it, with motes drifting up.
        const s = toScreen(camera, list[0].x, list[0].y), pulse = scene.reducedMotion ? 0.8 : 0.7 + Math.sin(now / 260) * 0.3, height = 170 * z, width = 16 * z;
        const beam = ctx.createLinearGradient(0, s.y, 0, s.y - height);
        beam.addColorStop(0, `rgba(255,214,90,${(0.85 * pulse).toFixed(3)})`); beam.addColorStop(0.5, `rgba(255,214,90,${(0.45 * pulse).toFixed(3)})`); beam.addColorStop(1, "rgba(255,226,120,0)");
        ctx.fillStyle = beam; ctx.fillRect(s.x - width / 2, s.y - height, width, height);
        ctx.fillStyle = `rgba(255,252,230,${(0.8 * pulse).toFixed(3)})`; ctx.fillRect(s.x - width / 6, s.y - height * 0.8, width / 3, height * 0.8);
        ctx.strokeStyle = `rgba(200,150,40,${(0.5 * pulse).toFixed(3)})`; ctx.lineWidth = 1; ctx.strokeRect(s.x - width / 2, s.y - height * 0.7, width, height * 0.7);
        ellipse(ctx, s.x, s.y, 18 * z, 7 * z, `rgba(255,226,120,${(0.35 * pulse).toFixed(3)})`, null);
        if (!scene.reducedMotion) for (let i = 0; i < 5; i++) { const k = ((now / 1600) + i / 5) % 1; ctx.fillStyle = `rgba(255,255,255,${(1 - k).toFixed(3)})`; ctx.fillRect(s.x + Math.sin(i * 2.3 + now / 400) * width * 0.6, s.y - k * height, 2 * z, 2 * z); }
    } });
    drawables.push({ depth: depth(list[0].x, list[0].y) - 0.3, at: { x: list[0].x, y: list[0].y, h: 4 }, size: [40, 50, 20], min: 0.6, draw: () => {
      list.slice(0, 4).forEach((entry, index) => {
        const s = toScreen(camera, entry.x, entry.y), ox = (index % 2 ? 7 : -7) * z, oy = (index > 1 ? 4 : -2) * z, size = 22 * z;
        drawIcon(ctx, item(entry.id).icon, s.x + ox, s.y + oy - 4 * z, size);
        hits.push({ x: s.x + ox - size / 2, y: s.y + oy - 4 * z - size / 2, w: size, h: size, pick: { kind: "ground", id: entry.uid } });
      });
    } });
  }
  // Other players' drops, drawn like your own; "pground" picks index into scene.peerDrops.
  (scene.peerDrops ?? []).forEach((drop, index) => {
    if (!shown(drop.x, drop.y) || !isItem(drop.id)) return;
    drawables.push({ depth: depth(drop.x, drop.y) - 0.29, at: { x: drop.x, y: drop.y, h: 4 }, size: [40, 50, 20], min: 0.6, draw: () => {
      const s = toScreen(camera, drop.x, drop.y), size = 22 * z, ox = ((index % 3) - 1) * 5 * z;
      drawIcon(ctx, item(drop.id).icon, s.x + ox, s.y - 3 * z, size);
      hits.push({ x: s.x + ox - size / 2, y: s.y - 3 * z - size / 2, w: size, h: size, pick: { kind: "pground", id: index } });
    } });
  });
  // NPCs.
  for (const npc of game.npcs) {
    if (!shown(npc.x, npc.y)) continue;
    const at = interpolate(npc, game, alpha);
    drawables.push({ depth: depth(at.x, at.y) + 0.1, at, cast: true, sprite: true, size: [170, 90, 30], tag: "npc", draw: () => drawNpc(ctx, scene, npc, at, hits) });
  }
  // Monsters.
  for (const monster of game.monsters) {
    if (monster.dead || !shown(monster.x, monster.y, 2)) continue;
    const at = interpolate(monster, game, alpha), size = monster.def.size ?? 1;
    const center = { x: at.x + (size - 1) / 2, y: at.y + (size - 1) / 2 };
    drawables.push({ depth: depth(center.x, center.y) + (size - 1) / 2 + 0.1, at: center, cast: true, sprite: true, size: [80 + 90 * size, 40 + 50 * size, 20 + 10 * size], draw: () => drawMonster(ctx, scene, monster, at, hits) });
  }
  // Other players, walking their own adventures through yours.
  const home = game.player.home ? homeRect(game.player.home.tier) : null;
  for (const peer of scene.peers ?? []) {
    if (home && peer.x > home.x0 && peer.x < home.x1 && peer.y > home.y0 && peer.y < home.y1) continue; // your home is yours alone
    if (!shown(peer.x, peer.y)) continue;
    drawables.push({ depth: depth(peer.x, peer.y) + 0.12, at: { x: peer.x, y: peer.y }, cast: true, size: [190, 100, 30], draw: () => drawPeer(ctx, scene, peer, hits) });
    // A match they're fighting in the Ring: its creatures, as they stand, for anyone watching from the concourse.
    if (peer.p.arena && !game.arena) for (const foe of peer.p.arena.foes) {
      const def = MONSTERS[foe.id];
      if (!def || !shown(foe.x, foe.y, 2)) continue;
      const ghost: Monster = { uid: foe.u, def, x: foe.x, y: foe.y, prev: { x: foe.x, y: foe.y }, spawn: { x: foe.x, y: foe.y }, hp: foe.hp, heading: { x: Math.sign(peer.x - foe.x) || 1, y: Math.sign(peer.y - foe.y) || 1 }, target: true, attackTimer: 0, respawnAt: 0, dead: false, wander: 0, moved: 0, retreat: 0, curses: {}, arena: true };
      const size = def.size ?? 1, center = { x: foe.x + (size - 1) / 2, y: foe.y + (size - 1) / 2 };
      drawables.push({ depth: depth(center.x, center.y) + (size - 1) / 2 + 0.1, at: center, cast: true, sprite: true, size: [80 + 90 * size, 40 + 50 * size, 20 + 10 * size], draw: () => { const count = hits.length; drawMonster(ctx, scene, ghost, { x: foe.x, y: foe.y, moving: false }, hits); hits.length = count; } });
    }
  }
  // Your follower: an owned Friend walking the tiles you leave behind, animated like any NPC.
  const petOut = game.player.petOut;
  if ((scene.follower || petOut) && game.pet && (shown(game.pet.x, game.pet.y) || realPoint(world, game.pet.x, game.pet.y).level === level)) {
    const pet = game.pet, at = interpolate(pet, game, alpha);
    drawables.push({ depth: depth(at.x, at.y) + 0.05, at, cast: true, size: [90, 60, 20], draw: () => {
      const s = toScreen(camera, at.x, at.y), facing = screenFacing(camera, pet.heading);
      ellipse(ctx, s.x, s.y, 11 * z, 4.5 * z, "rgba(22,22,22,0.16)", null);
      if (petOut) drawPet(ctx, petOut, s.x, s.y, facing, at.moving, now, z, scene.reducedMotion);
      else if (game.player.followerWorn.length) {
        // Dressed from your wardrobe: the same pieces, drawn the same way, with their auras.
        const rows = friendRows(scene.follower!, facing, at.moving, at.moving ? Math.floor(now / 90) % 8 : 0), px = 2.6 * z;
        drawAuras(ctx, game.player.followerWorn, s.x, s.y, px, now + 1300, scene.reducedMotion, "back");
        drawFigure(ctx, figureArt(rows, game.player.followerWorn, facing, scene.reducedMotion ? 0 : Math.floor(now / 520) % 4), s.x, s.y + 2 * z, px);
        drawAuras(ctx, game.player.followerWorn, s.x, s.y, px, now + 1300, scene.reducedMotion, "front");
      }
      else drawMask(ctx, friendRows(scene.follower!, facing, at.moving, at.moving ? Math.floor(now / 90) % 8 : 0), s.x, s.y + 2 * z, 2.6 * z);
    } });
  }
  if (scene.hoverTile && floor) { const hover = scene.hoverTile; drawables.push({ depth: depth(hover.x, hover.y) - 0.4, draw: () => tileOutline(hover.x, hover.y, "rgba(22,22,22,0.35)") }); }
  // Roofs are lit from the open sky above, whatever is at their foot.
  const roofRect = (building: Building): [number, number, number, number] => {
    const hull = roofHull(camera, building), xs = hull.map(p => p[0]), ys = hull.map(p => p[1]);
    return [Math.min(...xs) - 12 * z, Math.min(...ys) - ((building.spire ?? 0) + 60) * z, Math.max(...xs) + 12 * z, Math.max(...ys) + 8 * z];
  };
  // The player.
  const pose = playerPose(game, now, project, scene.reducedMotion, scene.sfx);
  // Roofs: every building's roof, fading out when you walk in or when it would hide you. In a castle, the only roofs
  // left are the towers' above the storey you stand on, from outside them.
  if (!underground) world.buildings.forEach((building, index) => {
    if (building.roof === "none" || building.x1 < x0 - 4 || building.x0 > x1 + 4 || building.y1 < y0 - 4 || building.y0 > y1 + 4) return;
    const front = Math.max(depth(building.x0, building.y0), depth(building.x1, building.y0), depth(building.x0, building.y1), depth(building.x1, building.y1)) + 0.5;
    const complex = building.complex ?? `#${index + 1}`, within = here.x >= building.x0 && here.x <= building.x1 && here.y >= building.y0 && here.y <= building.y1;
    const shows = complex !== inside || (level > 0 && level === (building.storeys ?? 1) - 1 && !within);
    const fade = () => {
      const hull = roofHull(camera, building), me = toScreen(camera, pp.x, pp.y, 20);
      const target = !shows ? 0 : playerDepth < front && pointInPolygon(me.x, me.y, hull) ? 0.22 : 1;
      const current = roofAlpha.get(index) ?? target, next = scene.reducedMotion ? target : current + (target - current) * Math.min(1, dt * 9);
      roofAlpha.set(index, next);
      return next;
    };
    if (building.roof === "flat") {
      // Flat roofs are laid tile by tile, sorted with the walls, and only over this building's own tiles (so a keep's
      // battlements never cut across its towers).
      const alphaNow = fade();
      if (alphaNow <= 0.02) return;
      const own = (x: number, y: number) => inBounds(x, y) && world.buildingAt[y * W + x] === index + 1;
      for (let y = building.y0; y <= building.y1; y++) for (let x = building.x0; x <= building.x1; x++) {
        if (!own(x, y)) continue;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !own(x + dx, y + dy) && complexAt(world, x + dx, y + dy) !== complex);
        const covered = (nx: number, ny: number) => own(x + nx, y + ny);
        // (A box: lit by its outline, slab and coping; the merlons on top take the light behind them.)
        drawables.push({ depth: depth(x, y) + 0.45, at: { x, y, h: (building.storeys ?? 1) * WALL_H + 8 }, size: [(building.storeys ?? 1) * WALL_H + 40, 52, 30], exact: true,
          hull: () => alphaNow > 0.95 ? boxHull(camera, x, y, 1, 1, edge ? 9 : 5, (building.storeys ?? 1) * WALL_H) : null, draw: () => flatRoofTile(ctx, camera, building, x, y, edge, alphaNow, covered) });
      }
      return;
    }
    drawables.push({ depth: front, at: { x: (building.x0 + building.x1) / 2, y: (building.y0 + building.y1) / 2, h: (building.storeys ?? 1) * WALL_H + 24 }, rect: () => roofRect(building),
      hull: () => (roofAlpha.get(index) ?? 0) > 0.95 ? roofHull(camera, building) : null, draw: () => { const next = fade(); if (next > 0.02) drawRoof(ctx, camera, building, next, now, scene.reducedMotion); } });
  });
  // ---------- Fronts: shops' awnings and signs, inns' signs, banks' and halls' columns and pediments ----------
  if (!underground && level === 0) for (const building of world.buildings) {
    if (!building.facade || building.x1 < x0 - 4 || building.x0 > x1 + 4 || building.y1 < y0 - 4 || building.y0 > y1 + 4) continue;
    const doors = frontDoors(world, building);
    if (!doors.length) continue;
    if (building.facade === "shop" || building.facade === "inn") for (const group of doors) shopFront(building, group);
    else grandFront(building, doors[0]);
  }
  /**
   * A shop's front at one doorway: a striped awning over it (shops), and an iron bracket beside it with a hanging board
   * painted with what's sold there (an inn's with a tankard). The awning turns see-through when you stand under it.
   */
  function shopFront(building: Building, group: DoorGroup) {
    const { nx, ny, lo: dlo, hi: dhi, face } = group, alongX = ny !== 0, min = (alongX ? building.x0 : building.y0) - 0.5, max = (alongX ? building.x1 : building.y1) + 0.5;
    const pt = (a: number, out: number, h: number): RoofVertex => alongX ? [a, face + ny * out, h] : [face + nx * out, a, h];
    const P = (v: RoofVertex) => { const q = toScreen(camera, v[0], v[1], v[2]); return [q.x, q.y] as const; };
    const lo = Math.max(min + 0.2, dlo - 0.75), hi = Math.min(max - 0.2, dhi + 0.75), mid = (lo + hi) / 2;
    const [ax, ay] = alongX ? [mid, face + ny * 0.9] : [face + nx * 0.9, mid];
    const palette = AWNINGS[Math.floor(hash(building.x0, building.y0 + 3) * AWNINGS.length)];
    if (building.facade === "shop") drawables.push({ depth: depth(ax, ay) + 0.05, at: { x: ax, y: ay, h: 34 }, size: [70, 80, 30], draw: () => {
      const HT = WALL_H * 0.95, HB = WALL_H * 0.6, D = 0.72, n = Math.max(3, Math.round((hi - lo) / 0.36));
      ctx.globalAlpha = Math.hypot(pp.x - ax, pp.y - ay) < 1.6 ? 0.4 : 1;
      // The cheeks at the ends, then the stripes, then the scalloped valance along the front.
      for (const a of [lo, hi]) poly(ctx, [P(pt(a, 0, HT)), P(pt(a, D, HB)), P(pt(a, 0, HB))], shadeHex(palette[0], -0.18), INK, 1);
      for (let i = 0; i < n; i++) {
        const a0 = lo + (hi - lo) * i / n, a1 = lo + (hi - lo) * (i + 1) / n, fill = palette[i % 2];
        poly(ctx, [P(pt(a0, 0, HT)), P(pt(a1, 0, HT)), P(pt(a1, D, HB)), P(pt(a0, D, HB))], fill, null);
        poly(ctx, [P(pt(a0, D, HB)), P(pt(a1, D, HB)), P(pt((a0 + a1) / 2, D, HB - 5))], shadeHex(fill, -0.1), null);
      }
      poly(ctx, [P(pt(lo, 0, HT)), P(pt(hi, 0, HT)), P(pt(hi, D, HB)), P(pt(lo, D, HB))], null, INK, 1.2);
      ctx.globalAlpha = 1;
    } });
    // The sign, beside the door on whichever side has wall to hang it from.
    const at = dhi + 1.1 < max - 0.3 ? dhi + 1.1 : dlo - 1.1;
    if (at < min + 0.3) return;
    const [sx, sy] = alongX ? [at, face + ny * 0.4] : [face + nx * 0.4, at];
    drawables.push({ depth: depth(sx, sy) + 0.05, at: { x: sx, y: sy, h: 40 }, size: [70, 40, 20], draw: () => {
      const HS = WALL_H * 1.08;
      ctx.strokeStyle = "#2e2823"; ctx.lineWidth = Math.max(1, 1.6 * z);
      const [b0x, b0y] = P(pt(at, 0, HS)), [b1x, b1y] = P(pt(at, 0.66, HS)), [b2x, b2y] = P(pt(at, 0, HS - 10));
      ctx.beginPath(); ctx.moveTo(b0x, b0y); ctx.lineTo(b1x, b1y); ctx.moveTo(b2x, b2y); ctx.lineTo(...P(pt(at, 0.42, HS))); ctx.stroke();
      const board = [P(pt(at, 0.14, HS - 3)), P(pt(at, 0.6, HS - 3)), P(pt(at, 0.6, HS - 19)), P(pt(at, 0.14, HS - 19))];
      for (const [hx, hy] of [board[0], board[1]]) { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, hy - 3 * z); ctx.stroke(); }
      poly(ctx, board, building.facade === "inn" ? "#6b4a2c" : palette[0], INK, 1.2);
      const cxs = board.reduce((sum, p) => sum + p[0], 0) / 4, cys = board.reduce((sum, p) => sum + p[1], 0) / 4;
      // What's sold, on a little plaque that always faces you (an inn: a tankard).
      ellipse(ctx, cxs, cys, 8 * z, 8 * z, "#efe6cf", INK, 1);
      if (building.facade === "inn") {
        poly(ctx, [[cxs - 3.5 * z, cys - 4 * z], [cxs + 2.5 * z, cys - 4 * z], [cxs + 2.5 * z, cys + 4 * z], [cxs - 3.5 * z, cys + 4 * z]], "#c9a24a", INK, 1);
        ctx.beginPath(); ctx.arc(cxs + 3.2 * z, cys, 2.4 * z, -Math.PI / 2, Math.PI / 2); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
        ellipse(ctx, cxs - 0.5 * z, cys - 4.5 * z, 3.6 * z, 1.6 * z, "#fbf6e6", null);
      } else if (building.sign && isItem(building.sign)) drawIcon(ctx, item(building.sign).icon, cxs, cys, 13 * z);
    } });
  }
  /**
   * A bank's or a hall of state's front: marble columns along the wall with the door, a band of entablature over them,
   * and a pediment on top (a gold coin in a bank's, a gilded sun in a hall's), standing in front of the roof.
   */
  function grandFront(building: Building, door: DoorGroup) {
    const { nx, ny, face } = door, alongX = ny !== 0, min = (alongX ? building.x0 : building.y0) - 0.5, max = (alongX ? building.x1 : building.y1) + 0.5;
    const H = WALL_H * (building.storeys ?? 1) + (building.tall ?? 0), length = max - min, mid = (min + max) / 2;
    const pt = (a: number, out: number, h: number): RoofVertex => alongX ? [a, face + ny * out, h] : [face + nx * out, a, h];
    const P = (v: RoofVertex) => { const q = toScreen(camera, v[0], v[1], v[2]); return [q.x, q.y] as const; };
    const [fx, fy] = alongX ? [mid, face] : [face, mid], facing = depth(fx + nx, fy + ny) > depth(fx, fy);
    const marble = ["#eee8db", "#e0d8c7", "#cbc2af"] as const;
    // Columns at the joints between wall tiles, except across the doorway.
    for (let a = Math.ceil(min + 0.5) + 0.5; a <= max - 1; a++) {
      if (a > door.lo && a < door.hi) continue;
      const [cx, cy] = alongX ? [a, face + ny * 0.3] : [face + nx * 0.3, a];
      drawables.push({ depth: depth(cx, cy), at: { x: cx, y: cy, h: H / 2 }, size: [H + 30, 30, 20], draw: () => {
        box(ctx, camera, cx, cy, 0.4, 0.4, 5, ...marble, 0, INK, null);
        box(ctx, camera, cx, cy, 0.26, 0.26, H - 10, ...marble, 5, INK, null);
        box(ctx, camera, cx, cy, 0.42, 0.42, 5, ...marble, H - 5, INK, null);
      } });
    }
    const roofFront = Math.max(depth(building.x0, building.y0), depth(building.x1, building.y0), depth(building.x0, building.y1), depth(building.x1, building.y1)) + 0.5;
    drawables.push({ depth: facing ? roofFront + 0.02 : depth(fx, fy) - 0.2, at: { x: fx, y: fy, h: H + 20 }, rect: () => {
      const a = P(pt(min, 0.6, H)), b = P(pt(max, 0.6, H)), c = P(pt(mid, 0.6, H + 60));
      return [Math.min(a[0], b[0]) - 10, Math.min(a[1], b[1], c[1]) - 10, Math.max(a[0], b[0]) + 10, Math.max(a[1], b[1]) + 10];
    }, draw: () => {
      const E = 7, rise = Math.min(42, 10 + length * 2.4), base = H + E;
      // The entablature: a band of marble the length of the front, then the pediment's triangle and its tympanum.
      const [bx, by] = alongX ? [mid, face + ny * 0.3] : [face + nx * 0.3, mid];
      box(ctx, camera, bx, by, alongX ? length : 0.6, alongX ? 0.6 : length, E, ...marble, H, INK, null);
      const left = P(pt(min + 0.05, 0.6, base)), right = P(pt(max - 0.05, 0.6, base)), apex = P(pt(mid, 0.6, base + rise));
      poly(ctx, [left, right, apex], marble[1], INK, 1.4);
      const inset = (p: readonly [number, number], k: number) => [p[0] + ((left[0] + right[0] + apex[0]) / 3 - p[0]) * k, p[1] + ((left[1] + right[1] + apex[1]) / 3 - p[1]) * k] as [number, number];
      poly(ctx, [inset(left, 0.22), inset(right, 0.22), inset(apex, 0.3)], marble[2], "rgba(22,22,22,0.4)", 1);
      const cxs = (left[0] + right[0] + apex[0]) / 3, cys = (left[1] + right[1] + apex[1]) / 3 + 2 * z, r = Math.min(9, rise * 0.22) * z;
      if (building.facade === "bank") {
        ellipse(ctx, cxs, cys, r, r, "#e2b84a", INK, 1.2); ellipse(ctx, cxs, cys, r * 0.62, r * 0.62, null, "#9a7424", 1.2);
      } else {
        ctx.strokeStyle = "#c9a24a"; ctx.lineWidth = Math.max(1, 1.4 * z); ctx.beginPath();
        for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; ctx.moveTo(cxs + Math.cos(t) * r * 0.7, cys + Math.sin(t) * r * 0.7); ctx.lineTo(cxs + Math.cos(t) * r * 1.3, cys + Math.sin(t) * r * 1.3); }
        ctx.stroke(); ellipse(ctx, cxs, cys, r * 0.62, r * 0.62, "#e2b84a", INK, 1);
      }
    } });
  }
  const veilTarget = veiled(game) ? 1 : 0;
  veilShown = scene.reducedMotion ? veilTarget : veilShown + (veilTarget - veilShown) * Math.min(1, dt * (veilTarget ? 1.4 : 8));
  drawables.push({ depth: playerDepth + 0.15, at: pp, cast: true, size: [200, 120, 40], draw: () => {
    // Wayfaring: glide from the start to the landing with a hop.
    let at = pp;
    if (player.activity?.kind === "obstacle") { const a = player.activity, total = world.objects[a.objectId].obstacle?.ticks ?? 3, k = Math.max(0, Math.min(1, 1 - (a.timer - alpha) / total)); at = { x: a.from.x + (a.to.x - a.from.x) * k, y: a.from.y + (a.to.y - a.from.y) * k, moving: true }; }
    const emote = player.emote && game.tick < player.emote.until ? player.emote : null, emoteT = emote ? (game.tick - emote.start + alpha) * TICK_MS / 1000 : 0;
    const motion = emote ? emoteMotion(emote.id, emoteT, playerFacing, scene.reducedMotion) : null;
    const mount = riding(player), walking = at.moving || (!!player.path.length && alpha < 1);
    const s = toScreen(camera, at.x, at.y, pose.hop + (motion?.hop ?? 0) + (mount ? riderLift(camera) : 0)), feet = toScreen(camera, at.x, at.y), px = 3.2 * z;
    const facing: Facing = motion?.facing ?? (pose.target ? (pose.side < 0 ? "left" : "right") : playerFacing);
    if (emote) { const capeColor = player.equipment.cape && isItem(player.equipment.cape) ? item(player.equipment.cape).icon.color : undefined; emoteParticles(emote.id, emoteT, at.x, at.y, scene.reducedMotion, capeColor); if (emote.id === "skillcape" || emote.id === "friendship") skillcapeRays(ctx, feet.x, feet.y - 30 * z, z, now, capeColor ?? "#e2d49e", scene.reducedMotion);
      if (emote.id === "friendship" && !scene.reducedMotion) for (let i = 0; i < 3; i++) { const a = now / 500 + i * 2.1, hx = feet.x + Math.cos(a) * 26 * z, hy = feet.y - 44 * z + Math.sin(a) * 10 * z; heart(ctx, hx, hy, 5 * z); } }
    ctx.globalAlpha = 1 - veilShown * 0.8;
    ellipse(ctx, feet.x, feet.y, (mount ? 32 : 15) * z, (mount ? 10 : 6) * z, "rgba(22,22,22,0.2)", "rgba(255,255,255,0.75)", 1.5);
    ctx.globalAlpha = 1;
    if (mount) drawMount(ctx, mount.coat, facing, walking, now + 0, feet.x, feet.y, z, true, scene.reducedMotion);
    const bodyY = s.y - pose.bob * z;
    // Your Friend with its worn pieces composited into the same pixel frame (leaning and squashing for emotes).
    const restoreMotion = applyMotion(ctx, motion, s.x, s.y);
    drawAuras(ctx, player.worn, s.x, bodyY, px, now, scene.reducedMotion, "back");
    const stride = walking ? Math.floor(now / 80) % 8 : 0, cloth = scene.reducedMotion ? 0 : walking ? stride % 4 : Math.floor(now / 520) % 4;
    // What's in the hand, and how it moves: a tool at work, a weapon mid-swing, or the weapon at rest (all in the figure).
    const holding = heldPose(scene, pose);
    const dressed = [...player.worn, ...(player.equipment.cape ? [player.equipment.cape] : []), ...(player.equipment.head ? [player.equipment.head] : []), ...(player.equipment.shield ? [player.equipment.shield] : []), ...(player.equipment.weapon ? [player.equipment.weapon] : []), ...(player.equipment.neck ? [player.equipment.neck] : []), ...(player.equipment.body ? [player.equipment.body] : []), ...(player.equipment.legs ? [player.equipment.legs] : []), ...(player.equipment.hands ? [player.equipment.hands] : []), ...(player.equipment.feet ? [player.equipment.feet] : [])];
    if (scene.friend) {
      // Sneaking: crouched and a little faded. Veiled: all but gone, with a faint shimmer where you stand.
      const shown = pose.alpha * (1 - 0.84 * veilShown) * (player.sneak ? 0.8 : 1);
      const art = figureArt(friendRows(scene.friend, facing, walking && !mount, mount ? 0 : stride), dressed, facing, cloth, INK, holding), rect = crouched(ctx, player.sneak && !mount, s.x, bodyY + 2 * z, () => drawFigure(ctx, art, s.x, bodyY + 2 * z, px, shown)), tip = heldTip(art);
      if (veilShown > 0.4 && !bare) for (let i = 0; i < 4; i++) {
        const t = ((now / 1600 + i / 4) % 1), a = i * 1.7 + now / 900;
        ctx.fillStyle = `rgba(200,192,240,${(0.5 * veilShown * Math.sin(t * Math.PI)).toFixed(3)})`;
        ctx.fillRect(Math.round(s.x + Math.cos(a) * 9 * z), Math.round(bodyY - (8 + t * 30) * z), Math.max(1, 2 * z), Math.max(1, 2 * z));
      }
      if (pose.line && pose.target && tip) fishingLine(ctx, scene, rect.x + tip.x * px / FIGURE_K, rect.y + tip.y * px / FIGURE_K, project(pose.target.x, pose.target.y));
    }
    else ellipse(ctx, s.x, bodyY - 20 * z, 12 * z, 16 * z, INK);
    drawAuras(ctx, player.worn, s.x, bodyY, px, now, scene.reducedMotion, "front");
    if (mount) drawMountHead(ctx, mount.coat, facing, walking, now, feet.x, feet.y, z, scene.reducedMotion);
    restoreMotion();
    const plateH = player.name || player.fellowship ? nameplate(ctx, s.x, s.y - 52 * z, player.name, player.fellowship?.tag ?? null, player.friendId, z, "#e8e5de", scene.nameplates) : 0;
    if (motion?.text) overheadText(ctx, motion.text, s.x, s.y - 60 * z - plateH, "#ffffff");
    // Health bars only while fighting: yours when you're in combat or something's attacking you.
    if (player.combat !== null || game.monsters.some(monster => monster.target && !monster.dead)) hpBar(ctx, s.x, s.y - 62 * z, player.hp / maxHpOf(game), z);
    for (const hit of scene.hits.filter(entry => entry.on === "player" && now - entry.at < 1100)) splat(ctx, s.x, s.y - 30 * z, hit.damage, z, (now - hit.at) / 1100);
    if (scene.chat && scene.chat.until > now) overheadText(ctx, scene.chat.text, s.x, s.y - 56 * z - plateH);
    if (player.stunned > 0) ui(ctx, ctx => { for (let i = 0; i < 3; i++) { const a = now / 200 + i * 2.1; ellipse(ctx, s.x + Math.cos(a) * 12 * z, s.y - 56 * z + Math.sin(a) * 3 * z, 2 * z, 2 * z, C.butter); } });
    ui(ctx, ctx => { for (const firework of scene.fireworks) {
      const age = (now - firework.at) / 2200;
      if (age < 0 || age > 1) continue;
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = age * 60 * z; ellipse(ctx, s.x + Math.cos(a) * r, s.y - 40 * z + Math.sin(a) * r * 0.7 - age * 20 * z, 2.5 * z * (1 - age), 2.5 * z * (1 - age), [C.rose, C.butter, C.blue, C.sage][i % 4], null); }
    } });
  } });
  // Your own small light (a lantern familiar or a lantern-bearing mount carries a bigger one), and spells in flight.
  const lantern = player.worn.includes("lantern_familiar") || !!riding(player)?.light;
  glow(pp.x, pp.y, 26, lantern ? 130 : underground ? 80 : 64, "#f2c690", lantern ? 0.8 : 0.5);
  for (const projectile of scene.projectiles) {
    const flight = projectileFlight(projectile, game.tick, alpha);
    if (!flight || projectile.style === "arrow" || projectile.style === "bolt") continue;
    if (projectile.style === "fire") glow(flight.x, flight.y, 34, 190, "#f08a4b", 1.2);
    else glow(flight.x, flight.y, 26, 150, (MAGIC_LOOKS[projectile.element ?? ""] ?? { glow: projectile.color }).glow, 1.1);
  }
  lap("gather");
  // Hills and snowy ridges: the ground is drawn first, under everything, so rising ground between the camera and
  // something standing behind it (a Friend, a tree, a house on lower land) is drawn again in depth order to cover it.
  // Skipped when the land in view is flat, and for scenery; the heights come from one table per frame.
  if (!underground) {
    const vw = x1 - x0 + 1, vh = y1 - y0 + 1, tops = new Float32Array(vw * vh);
    let lowest = Infinity, highest = -Infinity;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const h = inBounds(tx, ty) ? Math.max(cornerHeight(world, tx, ty), cornerHeight(world, tx + 1, ty), cornerHeight(world, tx + 1, ty + 1), cornerHeight(world, tx, ty + 1)) : 0;
      tops[(ty - y0) * vw + tx - x0] = h; if (h < lowest) lowest = h; if (h > highest) highest = h;
    }
    if (highest - lowest > 6) {
      const c = Math.cos(camera.angle), sn = Math.sin(camera.angle), fx = c + sn, fy = c - sn, fl = Math.hypot(fx, fy) || 1, ux = fx / fl, uy = fy / fl;
      // A tile k steps nearer the camera sits k × `step` lower on screen; it only reaches up over something's feet if its
      // ground rises more than that (in screen terms).
      const step = Math.SQRT1_2 * TILE_W * camera.pitch, rise = liftScale(camera), slack = TILE_W * camera.pitch * 0.6;
      const ridges = new Set<number>();
      for (const drawable of drawables) {
        const at = drawable.at;
        if (!at || drawable.scenery || drawable.depth === Infinity || at.y >= FLOOR_Y - 0.5 || isUnderground(at.y)) continue;
        const feet = groundHeight(world, at.x, at.y);
        if ((highest - feet) * rise <= step - slack) continue;
        for (let k = 1; k <= 8; k++) {
          if ((highest - feet) * rise <= k * step - slack) break;
          for (const side of [-0.6, 0, 0.6]) {
            const tx = Math.round(at.x + ux * k - uy * side), ty = Math.round(at.y + uy * k + ux * side);
            if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
            const key = ty * W + tx;
            if (ridges.has(key) || (tops[(ty - y0) * vw + tx - x0] - feet) * rise <= k * step - slack) continue;
            const terrain = world.tiles[key];
            if (terrain !== T.WALL && terrain !== T.VOID && terrain !== T.CLIFF) ridges.add(key);
          }
        }
      }
      for (const key of ridges) {
        const tx = key % W, ty = (key - tx) / W;
        drawables.push({ depth: depth(tx, ty) - 0.45, at: { x: tx, y: ty, h: 2 }, size: [70, 50, 30], exact: true, hull: () => groundTile(ctx, scene, tx, ty, false), draw: () => { if (glr && ctx === target) punch(ctx, groundTile(ctx, scene, tx, ty, false)); else groundTile(ctx, scene, tx, ty); } });
      }
    }
  }
  drawables.sort((a, b) => a.depth - b.depth);

  // ---------- Light ----------
  // The light is laid at half the screen's resolution (a quarter on Low: light is soft, so it hardly shows).
  const LS = low ? 0.25 : 0.5, bufs = buffers(target, LS), ls = liftScale(camera);
  // Low keeps High's light (a coarser field, drawn in bigger patches) and the buildings' shadows, without the
  // silhouettes every sprite throws, the far haze and the cloud shadows.
  // The field changes slowly (the sky drifts, flames flicker): it's rebuilt when the view, the lights, the sky or the
  // world changed, and otherwise every other frame.
  // (Its range snaps outward to a 4-tile grid, so a walk doesn't change it every step.)
  const fx0 = Math.floor(x0 / 4) * 4, fy0 = Math.floor(y0 / 4) * 4, fx1 = Math.ceil((x1 + 1) / 4) * 4 - 1, fy1 = Math.min(FLOOR_Y - 1, Math.ceil((y1 + 1) / 4) * 4 - 1);
  const fieldKey = `${fx0},${fy0},${fx1},${fy1},${lights.length},${low ? 1 : 0},${game.worldVersion ?? 0},${Math.round((sky.sun[0] + sky.sun[1] + sky.sun[2] + sky.ambient[0] + sky.ambient[1] + sky.ambient[2]) * 40)},${Math.round(sky.night * 40)}`;
  fieldFrame++;
  // (Flames flicker, so a field with point lights in it is rebuilt every other frame; one lit by the sky alone only
  // drifts with the time of day, so every eighth.)
  if (fieldKey !== fieldKeyPrev || field.world !== world || (lights.length > 0 ? (fieldFrame & 1) === 0 : (fieldFrame & 7) === 0)) { field.build(world, TERRAIN_COLORS, sky, lights, fx0, fy0, fx1, fy1, low ? 1 : 2); fieldKeyPrev = fieldKey; }
  lap("light field");
  // The ground's light: the sky where there's no ground, the light map laid on the land, then the sun's shadows.
  const lb = bufs.light;
  lb.setTransform(LS, 0, 0, LS, 0, 0); lb.globalCompositeOperation = "source-over";
  lb.fillStyle = rgbCss(field.skyLight()), lb.fillRect(0, 0, VIEW.width, VIEW.height);
  field.drawGround(lb, (x, y) => toScreen(camera, x, y), (i, j) => cornerHeight(world, i, j), low);
  lap("light map");
  // ---------- Objects, each in the light where it stands ----------
  const lightOn = (drawable: Drawable): RGB | null => {
    const at = drawable.at;
    if (lit && drawable.light) return drawable.light.map(v => Math.min(1, v)) as RGB;
    if (!lit || !at) return null;
    const real = at.y >= FLOOR_Y - 0.5 ? realPoint(world, at.x, at.y) : at, light = field.at(real.x, real.y, at.h ?? 16), min = drawable.min ?? 0;
    return [Math.min(1, Math.max(min, light[0])), Math.min(1, Math.max(min, light[1])), Math.min(1, Math.max(min, light[2]))];
  };
  const rectOf = (drawable: Drawable): [number, number, number, number] => {
    if (drawable.rect) return drawable.rect();
    const at = drawable.at!, s = toScreen(camera, at.x, at.y), [up, side, down] = drawable.size ?? [240, 120, 40];
    return [s.x - side * z, s.y - up * z * Math.max(1, ls), s.x + side * z, s.y + down * z];
  };
  // The hover outline is UI: never dimmed.
  if (scene.hoverTile && !floor) { const hover = scene.hoverTile, s = toScreen(camera, hover.x, hover.y);
    drawables.unshift({ depth: -Infinity, light: [1, 1, 1], rect: () => [s.x - 50 * z, s.y - 30 * z, s.x + 50 * z, s.y + 30 * z], draw: () => tileOutline(hover.x, hover.y, "rgba(22,22,22,0.35)") }); }
  uiQueue = []; uiTarget = scene.ui ?? target;
  // Last of all, over the land: particles and birds in the light where you are, then the ground fog in the sky's (a fog
  // bank at night is a dim blue, not a white glow). Sparks and fireflies give their own light, later.
  const screen = (): [number, number, number, number] => [0, 0, VIEW.width, VIEW.height];
  drawables.push({ depth: Infinity, at: { x: here.x, y: here.y, h: 40 }, rect: screen, draw: () => drawEffects(ctx, project, world, now, z, "lit") });
  if (weather && weather.fog > 0.02) drawables.push({ depth: Infinity, light: field.skyLight().map(v => v * 1.08) as RGB, rect: screen, draw: () => {
    if (weather && weather.fog > 0.02 && !scene.reducedMotion && !low) drawFog(ctx, camera, weather.fog, now);
    else if (weather && weather.fog > 0.02) { ctx.fillStyle = `rgba(232,235,238,${(weather.fog * 0.25).toFixed(3)})`; ctx.fillRect(0, 0, VIEW.width, VIEW.height); }
  } });
  // ---------- The frame: everything in depth order ----------
  // Whatever falls wholly off the screen is skipped (the view's tile range is a box around a turned screen). Pixel-art
  // scenery notes the sprites it lays, so its shadow and its hole in the light are those sprites again, not a redraw.
  beginSprites();
  const kinds: Record<string, number> = { n_sprite: 0, n_hull: 0, n_floor: 0, n_npc: 0, n_at: 0, n_rect: 0 };
  for (const drawable of drawables) {
    drawable.skip = false; drawable.sprites = null; drawable.emitted = null;
    if (drawable.at && drawable.depth !== Infinity) {
      const box = rectOf(drawable), margin = 48 * z;
      if (box[2] < -margin || box[0] > VIEW.width + margin || box[3] < -margin || box[1] > VIEW.height + margin) { drawable.skip = true; continue; }
      drawable.box = box;
    }
    emitted.length = 0;
    const rec: SpriteDraw[] | null = drawable.sprite ? [] : null;
    kinds[drawable.sprite ? "n_sprite" : drawable.hull ? "n_hull" : drawable.tag ? `n_${drawable.tag}` : drawable.at ? "n_at" : "n_rect"]++;
    recordSprites(rec); drawable.draw(); recordSprites(null);
    if (rec && rec.length) drawable.sprites = rec;
    if (emitted.length) drawable.emitted = emitted.slice();
  }
  for (const [k, v] of Object.entries(kinds)) RENDER_PROFILE[k] = (RENDER_PROFILE[k] ?? v) * 0.9 + v * 0.1;
  lap("draw");
  const sunPower = (sky.sun[0] + sky.sun[1] + sky.sun[2]) / 3;
  if (sunPower > 0.02 && !floor) {
    const sb = bufs.shadow, reach = Math.min(4, 1 / sky.tanE) / 32;
    sb.setTransform(1, 0, 0, 1, 0, 0); sb.globalCompositeOperation = "source-over"; sb.clearRect(0, 0, sb.canvas.width, sb.canvas.height);
    sb.setTransform(LS, 0, 0, LS, 0, 0); sb.fillStyle = "#000";
    // Boxes (buildings, walls, cliffs): the footprint swept along the sun to where its top's shadow lands.
    const shadowBox = (ax: number, ay: number, bx: number, by: number, height: number) => {
      const ox = sky.dirX * height * reach, oy = sky.dirY * height * reach, points: [number, number][] = [];
      for (const [px, py] of [[ax, ay], [bx, ay], [bx, by], [ax, by]]) { const g = toScreen(camera, px, py), t = toScreen(camera, px + ox, py + oy); points.push([g.x, g.y], [t.x, t.y]); }
      const hull = convexHull(points);
      sb.beginPath(); hull.forEach(([px, py], i) => i ? sb.lineTo(px, py) : sb.moveTo(px, py)); sb.closePath(); sb.fill();
    };
    if (!underground) for (const building of world.buildings) {
      if (building.roof === "none" || building.x1 < x0 - 12 || building.x0 > x1 + 12 || building.y1 < y0 - 12 || building.y0 > y1 + 12) continue;
      shadowBox(building.x0 - 0.5, building.y0 - 0.5, building.x1 + 0.5, building.y1 + 0.5, (building.storeys ?? 1) * WALL_H + (building.tall ?? 0) + (building.roof === "flat" ? 0 : 26) + (building.spire ?? 0) * 0.35);
      // A palace's keep and spire throw their own, longer shadow.
      if (building.keep) { const kx = (building.x0 + building.x1) / 2, ky = (building.y0 + building.y1) / 2, kh = building.keep.size / 2; shadowBox(kx - kh, ky - kh, kx + kh, ky + kh, (building.storeys ?? 1) * WALL_H + (building.spire ?? 0) + building.keep.storeys * WALL_H + building.keep.spire * 0.35); }
    }
    for (const [bx, by, height] of blockers) shadowBox(bx - 0.5, by - 0.5, bx + 0.5, by + 0.5, height);
    // Everything else throws its own silhouette: drawn again, squashed flat onto the ground and slanted away from the sun.
    if (!low) {
      // A sprite is flat, so its height is laid along the sun's direction and its width across it (as if it had depth).
      const along = rotate(camera, sky.dirX, sky.dirY), across = rotate(camera, -sky.dirY, sky.dirX), perPx = reach / (ls * z), perW = 1 / (TILE_W / 2 * z);
      const kx = (along.rx - along.ry) * TILE_W / 2 * z * perPx, ky = (along.rx + along.ry) * TILE_W / 2 * camera.pitch * z * perPx;
      let px = (across.rx - across.ry) * TILE_W / 2 * z * perW, py = (across.rx + across.ry) * TILE_W / 2 * camera.pitch * z * perW;
      if (px < 0) { px = -px; py = -py; }
      const saved = texturesOn; texturesOn = false; bare = true; hush.on = true; uiMuted = true; ctx = sb;
      for (const drawable of drawables) {
        if (!drawable.cast || !drawable.at || Math.abs(drawable.at.x - camera.x) + Math.abs(drawable.at.y - camera.y) > SHADOW_REACH) continue;
        const foot = toScreen(camera, drawable.at.x, drawable.at.y), count = hits.length;
        sb.setTransform(LS * px, LS * py, -LS * kx, -LS * ky, LS * (foot.x - foot.x * px + foot.y * kx), LS * (foot.y - foot.x * py + foot.y * ky));
        if (drawable.sprites) replaySprites(sb, drawable.sprites); else drawable.draw();
        hits.length = count;
      }
      ctx = target; texturesOn = saved; bare = false; hush.on = false; uiMuted = false;
    }
    // The shadows keep the sky's light and lose the sun's.
    sb.setTransform(1, 0, 0, 1, 0, 0); sb.globalAlpha = 1; sb.globalCompositeOperation = "source-in";
    const skyLit = field.skyLight(), share = (c: number) => Math.min(1, (sky.ambient[c] * 0.92 + sky.sun[c] * 0.12) / Math.min(1, skyLit[c]));
    sb.fillStyle = rgbCss([share(0), share(1), share(2)]); sb.fillRect(0, 0, sb.canvas.width, sb.canvas.height);
    lb.setTransform(1, 0, 0, 1, 0, 0); lb.globalCompositeOperation = "multiply"; lb.drawImage(sb.canvas, 0, 0); lb.globalCompositeOperation = "source-over";
  }
  // The haze on the land (Low doesn't draw far enough to need it, and there's none underground).
  const hb = bufs.haze, hazy = !low && !underground && field.buildHaze(here.x, here.y, HAZE_START, DRAW_DISTANCE - 4);
  let hazeBottom = -Infinity;
  /** Whether any of the ground behind the top of a screen rect is out in the haze. */
  const overHaze = (rect: [number, number, number, number]) => {
    for (const sx of [rect[0], (rect[0] + rect[2]) / 2, rect[2]]) { const t = toTile(camera, sx, rect[1], false); if (Math.hypot(t.x - here.x, t.y - here.y) > HAZE_START - 1) return true; }
    return false;
  };
  if (hazy) {
    hb.setTransform(LS, 0, 0, LS, 0, 0); hb.globalCompositeOperation = "source-over"; hb.imageSmoothingEnabled = true;
    hb.fillStyle = "#fff"; hb.fillRect(0, 0, VIEW.width, VIEW.height);
    field.drawGround(hb, (x, y) => toScreen(camera, x, y), (i, j) => cornerHeight(world, i, j), false, field.haze);
    hb.imageSmoothingEnabled = false;
    // How far down the screen hazed land reaches: only things reaching above that line need to cut the haze.
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, at = toScreen(camera, here.x + Math.cos(a) * HAZE_START, here.y + Math.sin(a) * HAZE_START); hazeBottom = Math.max(hazeBottom, at.y); }
  }
  lap("shadows");
  const applyLight = () => {
    target.save(); target.globalCompositeOperation = "multiply"; target.imageSmoothingEnabled = !low;
    target.drawImage(lb.canvas, 0, 0, VIEW.width, VIEW.height); target.restore();
  };
  lb.setTransform(LS, 0, 0, LS, 0, 0); lb.imageSmoothingEnabled = false;

  lap("ground light");
  const litBy = drawables.map(drawable => drawable.skip ? null : lightOn(drawable));
  lap("light samples");
  // ---------- Each thing in the light where it stands ----------
  let tLight = 0, tHaze = 0, cuts = 0;
  drawables.forEach((drawable, index) => {
    if (drawable.skip || !lit) return;
    const glow = drawable.emitted;
    if (low) {
      // Low lights walls, roofs and cliffs by their outlines (one fill each); everything else takes the light behind it.
      const hull = drawable.hull?.();
      if (hull && hull.length > 2) { lb.fillStyle = rgbCss(litBy[index] ?? [1, 1, 1]); lb.beginPath(); hull.forEach(([hx, hy], i) => i ? lb.lineTo(hx, hy) : lb.moveTo(hx, hy)); lb.closePath(); lb.fill(); }
      if (glow) paintEmitted(lb, litBy[index] ?? [1, 1, 1], Math.max(0.35, windowGlow), glow);
      return;
    }
    // The same drawing again, as a hole in the light buffer, filled with this thing's light.
    const light = litBy[index] ?? [1, 1, 1] as RGB, rect = drawable.box ?? (drawable.rect || drawable.at ? rectOf(drawable) : screen());
    if (drawable.glows) { if (glow) paintEmitted(lb, light, Math.max(0.35, windowGlow), glow); return; }
    const count = hits.length, saved = texturesOn;
    const t1 = performance.now();
    // Walls, cliffs and ridge tiles are exactly their outlines on screen: one fill of their light each.
    const hull = drawable.sprites || !drawable.exact ? null : drawable.hull?.();
    if (hull && hull.length > 2) {
      lb.globalCompositeOperation = "source-over"; lb.fillStyle = rgbCss(light); lb.beginPath(); hull.forEach(([hx, hy], i) => i ? lb.lineTo(hx, hy) : lb.moveTo(hx, hy)); lb.closePath(); lb.fill();
    }
    else if (drawable.sprites) {
      // Pixel art: its silhouette in its light, laid over the buffer (the light is quantised, so sprites share tints).
      lb.globalCompositeOperation = "source-over";
      stampSprites(lb, drawable.sprites, `rgb(${Math.round(light[0] * 25) * 10},${Math.round(light[1] * 25) * 10},${Math.round(light[2] * 25) * 10})`);
      cuts++;
    } else {
      lb.globalCompositeOperation = "destination-out";
      ctx = lb; texturesOn = false; bare = true; hush.on = true; uiMuted = true;
      drawable.draw();
      hits.length = count; texturesOn = saved; bare = false; hush.on = false; uiMuted = false; ctx = target;
      lb.globalAlpha = 1; lb.globalCompositeOperation = "destination-over"; lb.fillStyle = rgbCss(light); lb.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
      lb.globalCompositeOperation = "source-over";
    }
    if (glow) paintEmitted(lb, light, Math.max(0.35, windowGlow), glow);
    tLight += performance.now() - t1; const t2 = performance.now();
    // And into the haze, at its own distance (near things over far land stay clear).
    // (It only needs a haze of its own where it stands in front of hazy ground: zoomed out, the haze's ring can reach
    // the bottom of the screen, but what's behind most things is still clear.)
    if (hazy && rect[1] < hazeBottom && overHaze(rect)) {
      const at = drawable.at && drawable.at.y < FLOOR_Y - 0.5 ? drawable.at : here, far = Math.hypot(at.x - here.x, at.y - here.y);
      const t = Math.max(0, Math.min(1, (far - HAZE_START) / (DRAW_DISTANCE - 4 - HAZE_START))), clear = Math.round(255 * (1 - 0.97 * t * t * (3 - 2 * t)));
      if (hull && hull.length > 2) { hb.globalCompositeOperation = "source-over"; hb.fillStyle = `rgb(${clear},${clear},${clear})`; hb.beginPath(); hull.forEach(([hx, hy], i) => i ? hb.lineTo(hx, hy) : hb.moveTo(hx, hy)); hb.closePath(); hb.fill(); }
      else if (drawable.sprites) { const c = Math.round(clear / 15) * 15; hb.globalCompositeOperation = "source-over"; stampSprites(hb, drawable.sprites, `rgb(${c},${c},${c})`); }
      else {
        hb.globalCompositeOperation = "destination-out";
        texturesOn = false; bare = true; hush.on = true; uiMuted = true; ctx = hb;
        drawable.draw();
        hits.length = count; texturesOn = saved; bare = false; hush.on = false; uiMuted = false; ctx = target;
        hb.globalAlpha = 1; hb.globalCompositeOperation = "destination-over"; hb.fillStyle = `rgb(${clear},${clear},${clear})`; hb.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
        hb.globalCompositeOperation = "source-over";
      }
    }
    tHaze += performance.now() - t2;
  });
  for (const [k, v] of [["obj_light", tLight], ["obj_haze", tHaze], ["obj_cuts", cuts]] as const) RENDER_PROFILE[k] = (RENDER_PROFILE[k] ?? v) * 0.9 + v * 0.1;
  lap("obj_passes");
  // Anything that strayed outside its bounds is left as it is; then the light goes over the frame.
  if (lit && !low) { lb.globalCompositeOperation = "destination-over"; lb.fillStyle = "#fff"; lb.fillRect(0, 0, VIEW.width, VIEW.height); lb.globalCompositeOperation = "source-over"; }
  if (hazy) {
    // The frame is seen through the haze: its light is dimmed by how hazy each pixel is, and the haze's own colour (in
    // the sky's light) is added where it's hazy.
    hb.setTransform(1, 0, 0, 1, 0, 0); hb.globalCompositeOperation = "destination-over"; hb.fillStyle = "#fff"; hb.fillRect(0, 0, hb.canvas.width, hb.canvas.height); hb.globalCompositeOperation = "source-over";
    lb.setTransform(1, 0, 0, 1, 0, 0); lb.globalCompositeOperation = "multiply"; lb.drawImage(hb.canvas, 0, 0); lb.globalCompositeOperation = "source-over";
    const tint = bufs.hazeTint, sky = field.skyLight();
    tint.setTransform(1, 0, 0, 1, 0, 0); tint.globalCompositeOperation = "source-over"; tint.fillStyle = "#fff"; tint.fillRect(0, 0, tint.canvas.width, tint.canvas.height);
    tint.globalCompositeOperation = "difference"; tint.drawImage(hb.canvas, 0, 0);
    tint.globalCompositeOperation = "multiply"; tint.fillStyle = rgbCss([207 / 255 * Math.min(1, sky[0] * 1.08), 215 / 255 * Math.min(1, sky[1] * 1.08), 220 / 255 * Math.min(1, sky[2] * 1.08)]); tint.fillRect(0, 0, tint.canvas.width, tint.canvas.height);
    tint.globalCompositeOperation = "source-over";
  }
  lap("haze_comp");
  if (glr) {
    // The GPU draws its part (sky, ground, walls), lays this layer over it, and lights and hazes the lot; what's drawn
    // from here on (unlit) goes on the top canvas.
    glr.drawWorld({ x: camera.x, y: camera.y, zoom: camera.zoom, angle: camera.angle, pitch: camera.pitch, base: camera.base ?? 0 }, VIEW, glChunks, scene.reducedMotion ? 0 : now / 1000, underground);
    glr.present(target.canvas, lit ? lb.canvas : null, hazy ? bufs.hazeTint.canvas : null);
    if (scene.ui) ctx = scene.ui;
    RENDER_PROFILE.gl_boxes = glr.boxTotal;
  } else applyLight();
  lap("apply_light");
  if (hazy && !glr) { target.save(); target.globalCompositeOperation = "lighter"; target.imageSmoothingEnabled = true; target.drawImage(bufs.hazeTint.canvas, 0, 0, VIEW.width, VIEW.height); target.restore(); }
  const overlays = uiQueue; uiQueue = null; uiTarget = null;
  lap("objects");
  // Projectiles: spells fly as glowing comets with sparks (by element), arrows turn in flight, dragonfire roars; all of
  // them light the ground in the dark.
  for (const projectile of scene.projectiles) {
    const flight = projectileFlight(projectile, game.tick, alpha);
    if (!flight) continue;
    const progress = flight.progress;
    const shot = projectile.style === "arrow" || projectile.style === "bolt";
    const lift0 = projectile.style === "fire" ? 34 : 28, lift1 = 24, arc = projectile.style === "bolt" ? 5 : projectile.style === "arrow" ? 14 : projectile.style === "fire" ? 6 : 20;
    const at = (t: number) => { const a = toScreen(camera, projectile.from.x, projectile.from.y, lift0), b = toScreen(camera, projectile.to.x, projectile.to.y, lift1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * arc * z }; };
    const head = at(progress), wx = flight.x, wy = flight.y;
    const look = MAGIC_LOOKS[projectile.element ?? ""] ?? { core: "#ffffff", glow: projectile.color, spark: projectile.color };
    if (!castFlashed.has(projectile) && !shot) {
      castFlashed.add(projectile);
      if (!scene.reducedMotion) burst("spark", projectile.from.x, projectile.from.y, lift0, 8, projectile.style === "fire" ? "#ffd27a" : look.spark, { speed: 0.6, up: 30, life: 0.5, size: 2 });
    }
    if (progress > 0.94 && !impacted.has(projectile)) {
      impacted.add(projectile);
      if (!scene.reducedMotion && !shot) {
        burst("spark", projectile.to.x, projectile.to.y, lift1, 16, projectile.style === "fire" ? "#ffb060" : look.spark, { speed: 1.3, up: 50, life: 0.7, size: 2.5 });
        burst("ring", projectile.to.x, projectile.to.y, 2, 1, projectile.style === "fire" ? "#f08a4b" : look.glow, { speed: 0, up: 0, life: 0.6, size: 2 });
      }
    }
    if (shot) {
      // A shaft pointed along its flight, head first (a bolt is short, stubby and flies flatter).
      const next = at(Math.min(1, progress + 0.04)), angle = Math.atan2(next.y - head.y, next.x - head.x), len = (projectile.style === "bolt" ? 8 : 13) * z;
      ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(angle);
      ctx.strokeStyle = INK; ctx.lineWidth = 3.4 * Math.max(0.8, z); ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(len * 0.4, 0); ctx.stroke();
      ctx.strokeStyle = "#9c7a5c"; ctx.lineWidth = 1.6 * Math.max(0.8, z); ctx.stroke();
      poly(ctx, [[len * 0.4, -3 * z], [len * 0.9, 0], [len * 0.4, 3 * z]], projectile.color, INK, 1);
      poly(ctx, [[-len, 0], [-len - 3 * z, -3 * z], [-len + 4 * z, 0], [-len - 3 * z, 3 * z]], "#f7f5f0", INK, 1);
      ctx.restore();
      continue;
    }
    ctx.globalCompositeOperation = "lighter";
    if (projectile.style === "fire") {
      // Dragonfire: a rolling ball of flame with a smoky tail.
      for (let k = 7; k >= 0; k--) {
        const t = progress - k * 0.045;
        if (t < 0) continue;
        const p = at(t), flick = scene.reducedMotion ? 0 : Math.sin(now / 45 + k * 1.7) * 2 * z, r = (13 - k * 1.2) * z + flick;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.6);
        g.addColorStop(0, `rgba(255,236,160,${0.7 - k * 0.07})`); g.addColorStop(0.45, `rgba(240,130,60,${0.55 - k * 0.06})`); g.addColorStop(1, "rgba(120,40,20,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      if (!scene.reducedMotion && Math.random() < 0.7) burst("spark", wx, wy, lift0, 1, Math.random() < 0.5 ? "#ffd27a" : "#f08a4b", { speed: 0.25, up: 20, life: 0.5, size: 2 });
      continue;
    }
    // A spell, shaped by its element: a flame, a wave, a whirlwind, a boulder, a curse's smoke, or a star.
    const ahead = at(Math.min(1, progress + 0.05)), angle = Math.atan2(ahead.y - head.y, ahead.x - head.x);
    ctx.globalCompositeOperation = "source-over";
    drawSpell(ctx, projectile.element ?? "", look, head, angle, at, progress, z, scene.reducedMotion ? 0 : now);
    if (!scene.reducedMotion) {
      const trail = SPELL_TRAILS[projectile.element ?? ""] ?? SPELL_TRAILS.moon;
      if (Math.random() < trail.chance) burst(trail.kind, wx, wy, 24 + Math.random() * 6, 1, Math.random() < 0.5 ? look.spark : look.glow, { speed: trail.speed, up: trail.up, life: trail.life, size: trail.size, gravity: trail.gravity });
    }
  }
  drawEffects(ctx, project, world, now, z, "glowing");
  lap("projectiles");
  // UI over the world: health bars, names, speech, hit splats.
  for (const draw of overlays) draw();
  // Rain over everything, and lightning on top of that.
  if (weather && weather.rain > 0.02) drawRain(ctx, weather.rain * (low ? 0.35 : 1), scene.reducedMotion ? 0 : now, sky.night);
  if (scene.strike && scene.wallMs !== undefined && !underground && weather?.storm) drawLightning(ctx, scene.strike, scene.wallMs, scene.reducedMotion);
  lap("rain+lightning");
  // A soft vignette outdoors, for depth.
  drawEffects(ctx, project, world, now, z, "bright");
  if (!underground) { const v = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.45, VIEW.width / 2, VIEW.height / 2, VIEW.width * 0.72); v.addColorStop(0, "rgba(14,16,28,0)"); v.addColorStop(1, `rgba(14,16,28,${(0.16 + sky.night * 0.2).toFixed(3)})`); ctx.fillStyle = v; ctx.fillRect(0, 0, VIEW.width, VIEW.height); }
  lap("vignette");
  // First steps: a golden arrow bobbing over where to go, or at the screen's edge pointing towards it.
  if (scene.guideTarget) {
    const target = scene.guideTarget, at = toScreen(camera, target.x, target.y, 58 + (target.lift ?? 0)), bob = scene.reducedMotion ? 0 : Math.sin(now / 220) * 5 * Math.max(0.8, z), m = 34;
    const inside = at.x > m && at.x < VIEW.width - m && at.y > m && at.y < VIEW.height - m;
    // The guide's card covers the top-left corner: an arrow that would land under it drops just below it.
    const clear = (y: number, x: number) => x < 300 && y < 170 ? 178 : y;
    ctx.save(); ctx.lineJoin = "round";
    if (inside) {
      ctx.translate(at.x, clear(at.y, at.x) + bob);
      ctx.beginPath(); ctx.moveTo(-11, -18); ctx.lineTo(11, -18); ctx.lineTo(11, -2); ctx.lineTo(19, -2); ctx.lineTo(0, 16); ctx.lineTo(-19, -2); ctx.lineTo(-11, -2); ctx.closePath();
    } else {
      const cx = VIEW.width / 2, cy = VIEW.height / 2, a = Math.atan2(at.y - cy, at.x - cx), t = Math.min((cx - m) / Math.abs(Math.cos(a) || 1e-6), (cy - m) / Math.abs(Math.sin(a) || 1e-6));
      const ex = cx + Math.cos(a) * t, ey = cy + Math.sin(a) * t;
      ctx.translate(ex, clear(ey, ex)); ctx.rotate(a - Math.PI / 2); ctx.translate(0, bob * 0.6);
      ctx.beginPath(); ctx.moveTo(-9, -14); ctx.lineTo(9, -14); ctx.lineTo(9, 0); ctx.lineTo(16, 0); ctx.lineTo(0, 15); ctx.lineTo(-16, 0); ctx.lineTo(-9, 0); ctx.closePath();
    }
    ctx.fillStyle = "#f2d56b"; ctx.fill(); ctx.strokeStyle = "#161616"; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillRect(-7, -15, 3, 12);
    ctx.restore();
  }
  // Click marker: an old-school cross, yellow for walking, red for actions.
  if (scene.marker && now - scene.marker.at < 450) {
    const s = toScreen(camera, scene.marker.x, scene.marker.y), k = 1 - (now - scene.marker.at) / 450, r = 8 * z * (0.6 + k * 0.4);
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s.x - r, s.y - r / 2); ctx.lineTo(s.x + r, s.y + r / 2); ctx.moveTo(s.x + r, s.y - r / 2); ctx.lineTo(s.x - r, s.y + r / 2); ctx.stroke();
    ctx.strokeStyle = scene.marker.red ? "#e07a7a" : "#f2e28f"; ctx.lineWidth = 2; ctx.stroke();
  }
  lastHits = hits;
}
/** Where a projectile is in its flight (0–1) and over which point of the world, or null when it isn't in the air. */
function projectileFlight(projectile: Projectile, tick: number, alpha: number) {
  // Spells take a little longer in the air than a tick, so the comet is seen crossing.
  const span = Math.max(projectile.style === "magic" ? 1.5 : 1, projectile.end - projectile.start + 1), progress = (tick - projectile.start + alpha) / span;
  if (progress < 0 || progress > 1) return null;
  return { progress, x: projectile.from.x + (projectile.to.x - projectile.from.x) * progress, y: projectile.from.y + (projectile.to.y - projectile.from.y) * progress };
}
/** The convex hull of some points (monotone chain), for shadows of boxes. */
/** The outline on screen of a box on a tile footprint (w × d tiles, h high, from `lift`). */
/**
 * An iron gate set in a wall that runs along `axis`: two stone posts and a lintel over them, and between them a
 * portcullis of bars (down to the ground while `closed`, drawn up with its spikes hanging when open). `dark` makes it
 * black iron in black stone.
 */
function drawIronGate(ctx: CanvasRenderingContext2D, camera: Camera, ox: number, oy: number, axis: "ew" | "ns", closed: boolean, dark: boolean, z: number, hit: (w: number, h?: number) => { x: number; y: number; w: number; h: number }) {
  const along = axis === "ew" ? { x: 1, y: 0 } : { x: 0, y: 1 }, H = 56;
  const stone: [string, string, string] = dark ? ["#4a4850", "#3b3a40", "#2f2e33"] : ["#d7d4cd", "#c8c5be", "#b3aea6"], iron = dark ? "#141318" : "#3b3a38";
  const posts = [-0.42, 0.42].map(t => ({ x: ox + along.x * t, y: oy + along.y * t })).sort((a, b) => depthOf(camera, a.x, a.y) - depthOf(camera, b.x, b.y));
  const at = (t: number, lift: number) => toScreen(camera, ox + along.x * t, oy + along.y * t, lift);
  box(ctx, camera, posts[0].x, posts[0].y, 0.26, 0.26, H, ...stone);
  // The bars, from the ground (or, raised, from head height) up under the lintel, with two crossbars.
  const foot = closed ? 0 : 26;
  ctx.strokeStyle = iron; ctx.lineWidth = 2.2 * z; ctx.lineCap = "round"; ctx.beginPath();
  for (let i = 0; i <= 5; i++) { const t = -0.34 + i * 0.136, a = at(t, foot), b = at(t, H - 2); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  for (const lift of [foot + 7, H - 11]) { const a = at(-0.34, lift), b = at(0.34, lift); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  ctx.stroke(); ctx.lineCap = "butt";
  // Spikes at the bars' feet when it's up; studs along the crossbars.
  if (!closed) { ctx.fillStyle = iron; for (let i = 0; i <= 5; i++) { const t = -0.34 + i * 0.136, a = at(t, foot), b = at(t, foot - 5); poly(ctx, [[a.x - 1.6 * z, a.y], [a.x + 1.6 * z, a.y], [b.x, b.y]], iron, null); } }
  box(ctx, camera, ox, oy, axis === "ew" ? 1.1 : 0.26, axis === "ew" ? 0.26 : 1.1, 7, ...stone, H);
  box(ctx, camera, posts[1].x, posts[1].y, 0.26, 0.26, H, ...stone);
  return hit(56, 72);
}
function boxHull(camera: Camera, x: number, y: number, w: number, d: number, h: number, lift = 0) {
  const points: [number, number][] = [];
  for (const [px, py] of [[x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]]) for (const z of [lift, lift + h]) { const s = toScreen(camera, px, py, z); points.push([s.x, s.y]); }
  return convexHull(points);
}
function convexHull(points: [number, number][]) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const p of sorted) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
/** How each element's spells look in flight. */
const MAGIC_LOOKS: Record<string, { core: string; glow: string; spark: string }> = {
  wind: { core: "#ffffff", glow: "#bfe4f2", spark: "#ffffff" }, water: { core: "#e6f2ff", glow: "#5f9be0", spark: "#bfe0ff" },
  earth: { core: "#f0dcae", glow: "#b08850", spark: "#d8c49a" }, fire: { core: "#fff2b0", glow: "#f08a4b", spark: "#ffd27a" },
  hollow: { core: "#efe2ff", glow: "#8a62c8", spark: "#c7a8f0" }, moon: { core: "#ffffff", glow: "#c6bed4", spark: "#efe2ff" }, gold: { core: "#fff6c8", glow: "#e2c46a", spark: "#fff0a0" },
};
const castFlashed = new WeakSet<object>(), impacted = new WeakSet<object>();
/** What each element leaves behind it in the air. */
const SPELL_TRAILS: Record<string, { kind: "spark" | "puff" | "drop" | "dust" | "glow"; chance: number; speed: number; up: number; life: number; size: number; gravity?: number }> = {
  fire: { kind: "spark", chance: 0.95, speed: 0.25, up: 30, life: 0.5, size: 2.5, gravity: -20 }, water: { kind: "drop", chance: 0.8, speed: 0.3, up: 25, life: 0.45, size: 2 },
  wind: { kind: "dust", chance: 0.6, speed: 0.5, up: 5, life: 0.4, size: 1.5 }, earth: { kind: "dust", chance: 0.9, speed: 0.3, up: 4, life: 0.6, size: 2.5 },
  hollow: { kind: "puff", chance: 0.5, speed: 0.1, up: 8, life: 0.6, size: 3 }, moon: { kind: "spark", chance: 0.7, speed: 0.3, up: 10, life: 0.5, size: 2 },
};
type Screen = { x: number; y: number };
/** Draw a spell's body at `head`, flying along `angle` (radians on screen): its pixel sprite (a small torch flame for fire, a droplet, a whirl, a boulder, a curse, a star), turned to its flight, in a soft glow. `now` is 0 with reduced motion. */
function drawSpell(ctx: CanvasRenderingContext2D, element: string, look: { core: string; glow: string; spark: string }, head: Screen, angle: number, _at: (t: number) => Screen, _progress: number, z: number, now: number) {
  const radius = (element === "earth" ? 14 : element === "wind" ? 18 : 22) * z * 1.4, g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, radius);
  g.addColorStop(0, hexA(look.glow, element === "earth" ? 0.25 : 0.45)); g.addColorStop(1, hexA(look.glow, 0));
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(head.x, head.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const art = spellArt(element, now ? Math.floor(now / 85) : 0, look.core), k = ART * z * (element === "fire" ? 1.15 : 1);
  ctx.save(); ctx.translate(head.x, head.y);
  // Sprites point down (front at the bottom): turn them to the flight. The whirl and the star spin in place.
  if (element === "fire" || element === "water" || element === "hollow" || element === "earth") ctx.rotate(angle - Math.PI / 2);
  ctx.imageSmoothingEnabled = false;
  const front = element === "fire" || element === "water" || element === "hollow" ? 0.72 : 0.5;
  ctx.drawImage(art, -art.width * k / 2, -art.height * k * front, art.width * k, art.height * k);
  ctx.restore();
}
const maxHpOf = (game: Game) => levelForXp(game.player.xp.hitpoints);
/** A pet with its feet on (x, y): hopping as it walks, bobbing (or flickering) when it waits. */
function drawPet(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, facing: Facing, moving: boolean, now: number, z: number, reduced: boolean) {
  const frame = reduced ? 0 : Math.floor(now / (moving ? 140 : 480)) % 2, hop = moving && !reduced ? Math.abs(Math.sin(now / 140)) * 4 * z : 0, float = id === "mote" || id === "bubbles" ? 10 * z : 0;
  const art = petArt(id, frame);
  if (facing === "left") { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); drawPixels(ctx, art, 0, y + 2 * z - hop - float, ART * z * 1.5); ctx.restore(); }
  else drawPixels(ctx, art, x, y + 2 * z - hop - float, ART * z * 1.5);
}
/** How far a rider sits above the ground (world pixels, for toScreen's lift): on the saddle, legs astride. */
/** Mounts are drawn a little larger than the scenery's pixel scale, so a Friend on top doesn't hide its horse. */
const MOUNT_SCALE = 1.35;
const riderLift = (camera: Camera) => (SADDLE - 4) * ART * MOUNT_SCALE / liftScale(camera);
/** A mount standing or walking with its hooves on (x, y), turned to a screen facing. */
function drawMount(ctx: CanvasRenderingContext2D, coat: Coat, facing: Facing, moving: boolean, now: number, x: number, y: number, z: number, saddle: boolean, reduced: boolean) {
  const view: MountView = facing === "down" ? "front" : facing === "up" ? "back" : "side", frame = moving && !reduced ? Math.floor(now / 110) % 4 : -1;
  // Ridden towards you, the head is drawn after the rider (see drawMountHead); otherwise the whole mount at once.
  const art = mountArt(coat, view, frame, saddle, saddle && view === "front" ? "body" : "all");
  if (facing === "left") { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); drawPixels(ctx, art, 0, y + 2 * z, ART * z * MOUNT_SCALE); ctx.restore(); }
  else drawPixels(ctx, art, x, y + 2 * z, ART * z * MOUNT_SCALE);
}
/** A ridden mount's head and neck, over its rider, when it faces you. */
function drawMountHead(ctx: CanvasRenderingContext2D, coat: Coat, facing: Facing, moving: boolean, now: number, x: number, y: number, z: number, reduced: boolean) {
  if (facing !== "down") return;
  drawPixels(ctx, mountArt(coat, "front", moving && !reduced ? Math.floor(now / 110) % 4 : -1, true, "head"), x, y + 2 * z, ART * z * MOUNT_SCALE);
}
/**
 * What your Friend holds this frame and at what angle (radians forward from the resting pose), or null for the weapon at
 * rest: a tool at work (chopping, mining, hammering, a rod cast out, food over the fire), or the weapon swinging on the tick
 * an attack lands: a wind-up, a strike and a follow-through; a staff lifts as a spell leaves it; a bow flexes.
 */
function heldPose(scene: Scene, pose: Pose): Held | null {
  const player = scene.game.player, alpha = Math.max(0, Math.min(1, (scene.now - scene.tickAt) / TICK_MS)), still = scene.reducedMotion;
  if (pose.tool && isItem(pose.tool)) {
    const shape = item(pose.tool).icon.shape;
    if (shape === "axe" || shape === "pickaxe" || shape === "hammer") return { id: pose.tool, angle: still ? 0.4 : (pose.angle + 0.4) * 1.15 };
    if (shape === "rod" || shape === "harpoon" || shape === "net") return { id: pose.tool, angle: 0.55 + (still ? 0 : (pose.angle + 0.9) * 0.8) };
    return { id: pose.tool, angle: 0.5 + (still ? 0 : pose.angle * 0.4) };
  }
  const weaponId = player.equipment.weapon;
  if (!weaponId || !isItem(weaponId) || player.combat === null || still || player.attackTimer !== attackSpeed(player)) return null;
  const equip = item(weaponId).equip;
  if (equip?.staff) return { id: weaponId, angle: Math.sin(Math.min(1, alpha * 1.4) * Math.PI) * 0.7 };
  if (equip?.bow) return { id: weaponId, angle: -Math.sin(alpha * Math.PI) * 0.3 };
  const a = alpha, angle = a < 0.28 ? -a / 0.28 * 1.0 : a < 0.62 ? -1.0 + (a - 0.28) / 0.34 * 2.7 : 1.7 - (a - 0.62) / 0.38 * 1.7;
  return { id: weaponId, angle };
}
/** A fishing line from the rod's tip (screen) to a bobber on the spot. */
function fishingLine(ctx: CanvasRenderingContext2D, scene: Scene, tipX: number, tipY: number, spot: { x: number; y: number }) {
  const bob = scene.reducedMotion ? 0 : Math.sin(scene.now / 300) * 1.5;
  ctx.strokeStyle = "rgba(22,22,22,0.7)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.quadraticCurveTo((tipX + spot.x) / 2, Math.max(tipY, spot.y) + 10, spot.x, spot.y - 2 + bob); ctx.stroke();
  ctx.fillStyle = "#cf6e6e"; ctx.fillRect(spot.x - 1.5, spot.y - 4 + bob, 3, 3); ctx.fillStyle = "#ffffff"; ctx.fillRect(spot.x - 1.5, spot.y - 5 + bob, 3, 1);
}
/** Another player's hands: a tool for what they're doing (their game only says what, not with which tool), or their weapon swinging. */
const PEER_TOOLS: Record<string, string> = { woodcut: "pewter_axe", mine: "pewter_pickaxe", fish: "fishing_rod", produce: "hammer", firemake: "tinderbox", cook: "raw_minnows" };
function peerHeld(scene: Scene, peer: PeerView): Held | null {
  if (scene.reducedMotion || !peer.p.activity) return null;
  const t = (scene.now + peer.p.id * 97) / 1000, tool = PEER_TOOLS[peer.p.activity];
  if (tool && isItem(tool)) {
    const shape = item(tool).icon.shape, phase = (t / 0.78) % 1, chop = phase < 0.65 ? -1.1 + phase / 0.65 * 0.3 : -0.8 + (phase - 0.65) / 0.35 * 1.9;
    return { id: tool, angle: shape === "rod" ? 0.55 + Math.sin(t * 2) * 0.1 : shape === "axe" || shape === "pickaxe" || shape === "hammer" ? (chop + 0.4) * 1.15 : 0.5 + Math.sin(t * 5) * 0.15 };
  }
  if (peer.p.activity === "combat" && peer.p.weapon && isItem(peer.p.weapon)) {
    const a = (t / 2.4) % 1, equip = item(peer.p.weapon).equip;
    if (equip?.staff || equip?.bow) return { id: peer.p.weapon, angle: Math.max(0, Math.sin(a * Math.PI * 2)) * (equip.staff ? 0.7 : -0.3) };
    return { id: peer.p.weapon, angle: a < 0.12 ? -a / 0.12 : a < 0.26 ? -1 + (a - 0.12) / 0.14 * 2.7 : a < 0.42 ? 1.7 - (a - 0.26) / 0.16 * 1.7 : 0 };
  }
  return null;
}
function drawNpc(ctx: CanvasRenderingContext2D, scene: Scene, npc: Npc, at: { x: number; y: number; moving: boolean }, hits: Hit[]) {
  const { camera, now, game } = scene, z = camera.zoom, s = toScreen(camera, at.x, at.y), def = NPCS[npc.id];
  ellipse(ctx, s.x, s.y, 12 * z, 4.5 * z, "rgba(22,22,22,0.16)", null);
  let rect;
  const horse = mountDef(def.mount);
  if (horse) {
    // A paddock horse: its coat, no saddle, walking when it wanders.
    const facing = screenFacing(camera, npc.heading), view = facing === "down" ? "front" : facing === "up" ? "back" : "side";
    drawMount(ctx, horse.coat, facing, at.moving, now + npc.uid * 37, s.x, s.y, z, false, scene.reducedMotion);
    const size = ART * z * MOUNT_SCALE; rect = { x: s.x - (view === "side" ? 17 : 10) * size, y: s.y - 28 * size, w: (view === "side" ? 34 : 20) * size, h: 28 * size };
    hits.push({ ...rect, pick: { kind: "npc", id: npc.uid } });
    return;
  }
  if ("canonical" in def.art) {
    const sprites = scene.canonical.get(def.art.canonical);
    rect = sprites ? drawMask(ctx, friendRows(sprites, screenFacing(camera, npc.heading), at.moving, at.moving ? Math.floor(now / 90) % 8 : 0), s.x, s.y + 2 * z, 2.8 * z) : drawMask(ctx, friendSprite(5, 1).idle, s.x, s.y + 2 * z, 2.8 * z);
  } else {
    const set = friendSprite(def.art.family, def.art.seed + (npc.id === "villager" || npc.id.endsWith("_villager") || npc.id === "banker" || npc.id === "guard" ? npc.uid : 0));
    const frame = at.moving && Math.floor(now / 160) % 2 ? set.step : set.idle, bob = !scene.reducedMotion && def.art.family === 5 ? Math.sin(now / 400 + npc.uid) * 2 * z : 0;
    const regalia = npc.id === "villager" ? citizenLook(npc.uid) : npc.id.endsWith("_villager") ? regionalLook(npc.id.slice(0, -9), npc.uid) : NPC_WEAR[npc.id];
    // The King wears his crown and cape, and the guards their helms, red capes and battleaxes, like your own gear.
    if (regalia) rect = drawFigure(ctx, figureArt(frame, regalia, screenFacing(camera, npc.heading), scene.reducedMotion ? 0 : Math.floor(now / 520) % 4), s.x, s.y + 2 * z - bob, 2.6 * z);
    else rect = drawMask(ctx, frame, s.x, s.y + 2 * z - bob, 2.6 * z, INK, screenFacing(camera, npc.heading) === "left");
  }
  hits.push({ ...rect, pick: { kind: "npc", id: npc.uid } });
  const questMarker = questMarkerFor(game, npc.id);
  if (questMarker) { const bob = scene.reducedMotion ? 0 : Math.sin(now / 300) * 2 * z; ui(ctx, ctx => poly(ctx, [[s.x - 5 * z, s.y - 58 * z + bob], [s.x + 5 * z, s.y - 58 * z + bob], [s.x, s.y - 50 * z + bob]], questMarker)); }
  const said = npcOverhead(game, npc.uid);
  if (said) overheadText(ctx, said, s.x, s.y - 50 * z, "#f2e28f");
}
/** What some NPCs wear, composited into their sprite like your own gear: the King's regalia, and the guards' helms, battleaxes and red capes. */
const NPC_WEAR: Record<string, readonly string[]> = {
  // The four Orders: commanders in Paladin plate, quartermasters and guards in Knight.
  ...Object.fromEntries((["diamond", "ink", "sol", "hood", "ember", "dusk"] as const).flatMap(order => [
    [`${order}_commander`, [`${order}_paladin_helm`, `${order}_paladin_body`, `${order}_paladin_legs`, `${order}_paladin_boots`, `${order}_cape`, `${order}_paladin_mace`]],
    [`${order}_quartermaster`, [`${order}_knight_body`, `${order}_knight_legs`, `${order}_knight_boots`, `${order}_cape`]],
    [`${order}_guard`, [`${order}_knight_helm`, `${order}_knight_body`, `${order}_knight_legs`, `${order}_knight_boots`, `${order}_knight_kite`, `${order}_knight_mace`]],
  ])),
  maiden_matriarch: ["maiden_veil", "maiden_mail", "maiden_skirt", "maiden_boots", "vigil_spear"], maiden_trader: ["maiden_veil", "maiden_mail", "maiden_skirt", "maiden_boots"],
  // Return of Raria: the royal household, the Regiment, the Order of Dusk's prior, the Federation, BarkReach and Hollowmere's soldiers.
  queen_rara: ["royal_circlet", "ceremonial_standard", "rarian_skirts"], king_pell: ["royal_circlet", "law_book", "rarian_tabard"],
  dusk_prior: ["dusk_paladin_helm", "dusk_paladin_body", "dusk_paladin_legs", "dusk_cape", "dusk_paladin_staff", "dusk_lantern"],
  raria_gate_captain: ["rrr_helm", "rrr_cuirass", "rrr_greaves", "rrr_boots", "rrr_banner", "rarian_halberd"], rrr_officer: ["rrr_helm", "rrr_cuirass", "rrr_greaves", "rrr_boots", "rrr_banner", "rarian_greatsword"],
  rrr_soldier: ["rrr_helm", "rrr_cuirass", "rrr_greaves", "rrr_boots", "rrr_heater", "rarian_spear"], raria_clerk: ["rarian_veil", "rarian_tabard", "law_book"], raria_assessor: ["rarian_veil", "rarian_tabard", "rarian_skirts", "law_book"],
  raria_chaplain: ["wise_cowl", "wise_vestment", "wise_skirts", "faith_banner"], raria_sigilist: ["wise_cowl", "rarian_tabard", "sigil_frame", "rarian_staff"], raria_armourer: ["rrr_cuirass", "rrr_gauntlets", "rarian_tabard"],
  raria_clothier: ["rarian_veil", "rarian_tabard", "rarian_skirts", "rarian_mantle"], raria_provisioner: ["rarian_veil", "rarian_tabard"],
  fellow_free: ["fff_wizard_hat", "fff_mage_coat", "fff_cape_elite", "fff_staff"], fff_gatewarden: ["fff_hood", "fff_reinforced_robe", "fff_cape_wizard", "fff_wand", "fff_spellward"],
  fff_archwizard: ["fff_wizard_hat", "fff_wizard_robe", "fff_cape_wizard", "fff_staff"], fff_ranger_captain: ["fff_ranger_hood", "fff_ranger_jerkin", "fff_ranger_chaps", "fff_cape_ranger", "fff_longbow"],
  fff_artificer: ["fff_goggles", "fff_apron", "fff_cape_artisan", "fff_tinker_hammer"], fff_armourer: ["fff_helm", "fff_cuirass", "fff_cape_knight", "fff_sword", "fff_heater"], fff_librarian: ["fff_hood", "fff_mage_coat", "fff_cape_wizard", "fff_spellbook"],
  fff_outfitter: ["fff_cap", "fff_tunic", "fff_cape_artisan"], fff_knight_asleep: ["fff_helm", "fff_cuirass", "fff_cape_knight"], fff_wizard_arguing: ["fff_wizard_hat", "fff_battle_robe", "fff_cape_wizard", "fff_wand"], fff_ranger: ["fff_ranger_hood", "fff_ranger_jerkin", "fff_cape_ranger", "fff_longbow"],
  barkreach_foreman: ["woodsman_cap", "woodsman_jerkin", "woodsman_breeches", "woodsman_boots", "moonsilver_axe"], barkreach_bowyer: ["woodsman_cap", "woodsman_jerkin", "redwood_bow"], barkreach_outfitter: ["woodsman_jerkin", "woodsman_breeches"],
  barkreach_ranger: ["woodsman_cap", "woodsman_jerkin", "woodsman_breeches", "ironbark_bow"], barkreach_hunter: ["woodsman_cap", "woodsman_jerkin", "woodsman_boots", "redwood_war_bow"],
  hollowmere_officer: ["moonsilver_helm", "moonsilver_cuirass", "hollowmere_cape", "moonsilver_greatsword"], hollowmere_soldier: ["blackiron_helm", "blackiron_cuirass", "hollowmere_cape", "blackiron_battleaxe"], hollowmere_lieutenant: ["ashsteel_helm", "ashsteel_cuirass", "hollowmere_cape", "ashsteel_greatsword"],
  lawgate_governor: ["royal_circlet", "rarian_tabard", "rarian_mantle", "law_book"], lawgate_innkeeper: ["rarian_veil", "rarian_tabard"], raria_innkeeper: ["rarian_veil", "rarian_tabard", "rarian_skirts"],
  vesper_abbess: ["dusk_paladin_helm", "dusk_paladin_body", "dusk_cape", "dusk_lantern"], ranger_warden: ["ranger_royal_hood", "ranger_royal_coat", "ranger_royal_leggings", "rangers_longbow"],
  candlemere_reeve: ["rarian_tabard", "felt_wide_hat", "law_book"], candlemere_trader: ["rarian_veil", "rarian_tabard"], crownlands_villager: ["straw_wide_hat", "rarian_tabard"], greyford_warden: ["rrr_helm", "rrr_cuirass", "rarian_tabard", "rarian_halberd"],
  antler_captain: ["woodsman_cap", "woodsman_jerkin", "woodsman_breeches", "woodsman_boots", "ironbark_war_bow"], barkholm_elder: ["woodsman_jerkin", "leather_hood"], peak_hermit: ["wise_cowl", "wise_vestment"],
  hollowmere_scout: ["hollowmere_cape", "willow_bow"], hollowmere_messenger: ["hollowmere_cape"], west_watcher: ["pilgrim_cape"],
  king: ["paper_crown", "blue_cape"],
  guard: ["blackiron_helm", "blackiron_cuirass", "crimson_cape", "blackiron_battleaxe"],
  royal_guard: ["ashsteel_helm", "ashsteel_cuirass", "ashsteel_greaves", "crimson_cape", "ashsteel_battleaxe"],
  captain: ["moonsilver_helm", "moonsilver_cuirass", "crimson_cape", "moonsilver_greatsword", "rosestone_pendant"],
  // The Order of the Dawn: white and gold.
  dawn_knight: ["dawnplate_helm", "dawnplate_cuirass", "dawnplate_greaves", "dawn_cape", "dawnsteel_sword", "dawnplate_shield"],
  grandmaster: ["dawn_cape", "radiant_greatsword", "friends_charm"],
  quartermaster: ["pewter_helm", "dawn_cape", "vigil_spear"],
  chaplain: ["dawn_cape", "dawn_staff", "friends_charm"],
  // Townsfolk dressed for their trades (tools, never weapons).
  miner: ["leather_hood", "pewter_pickaxe"], axel: ["forest_feathered_cap", "blackiron_axe"], rowan: ["leather_wide_hat", "forest_cape", "ashsteel_axe"],
  birch: ["straw_wide_hat", "pewter_axe"], fisher: ["straw_wide_hat", "teal_cape"], miller: ["straw_wide_hat"], mountain_guide: ["felt_wide_hat", "russet_cape", "pewter_pickaxe"],
  cook: ["snow_cape"], tailor: ["plum_wizard_hat", "bordered_cape", "sagestone_amulet"], shop_general: ["russet_feathered_cap"], innkeeper: ["crimson_cape"],
  kettle_keeper: ["felt_wide_hat"], cairn_trader: ["royal_feathered_cap", "halved_cape"], trader_frost: ["leather_hood", "snow_cape"],
  // The wider world's villagers, each in their region's own clothes.
  gravesend_keeper: ["mourners_hood", "gravesend_coat", "ashen_trousers", "lantern_cape"], gravesend_clothier: ["mourners_hood", "gravesend_coat", "ashen_trousers"], gravesend_trader: ["gravesend_coat", "ashen_trousers", "lantern_cape"],
  saltmarrow_harbour: ["souwester", "oilskin_coat", "sailors_trousers", "sea_cape"], saltmarrow_fishmonger: ["souwester", "oilskin_coat", "sailors_trousers", "knife"], saltmarrow_clothier: ["oilskin_coat", "sailors_trousers", "sea_cape"],
  hollyhock_apothecary: ["herbalists_hat", "gardeners_apron", "hollyhock_skirt", "leaf_cape"], hollyhock_clothier: ["herbalists_hat", "gardeners_apron", "hollyhock_skirt"],
  dyemoor_dyer: ["dyers_turban", "moorland_frock", "dyemoor_cloak"], dyemoor_clothier: ["dyers_turban", "moorland_frock", "madder_trousers", "dyemoor_cloak"], dyemoor_tailor: ["dyers_turban", "madder_trousers", "dyemoor_cloak"],
  tallgrass_huntmaster: ["trackers_hood", "tallgrass_longcoat", "wildsmans_trousers", "pelt_cape", "yew_bow"], tallgrass_outfitter: ["trackers_hood", "tallgrass_longcoat", "wildsmans_trousers", "oak_bow"], tallgrass_clothier: ["tallgrass_longcoat", "wildsmans_trousers", "pelt_cape"],
  cragmaw_foreman: ["fur_hood", "ironreach_greatcoat", "quilted_trousers", "climbers_cape", "moonsilver_pickaxe"], cragmaw_armourer: ["ironreach_greatcoat", "quilted_trousers", "rarite_gauntlets", "hammer"], cragmaw_ore: ["fur_hood", "ironreach_greatcoat", "quilted_trousers"], cragmaw_clothier: ["ironreach_greatcoat", "quilted_trousers", "climbers_cape"],
  quillhaven_archivist: ["scholars_cap_quill", "archivist_robe", "inkstained_trousers", "librarians_cape"], quillhaven_scribe: ["scholars_cap_quill", "archivist_robe", "inkstained_trousers"], quillhaven_clothier: ["archivist_robe", "inkstained_trousers", "librarians_cape"],
  ashfall_trader: ["drakehide_hood", "ember_coat", "scorched_trousers", "scorched_cloak"],
};
/** A village's people dress in its own clothes: a stable pick of its hat, top, legs and cape from their uid. */
const regionalWear = new Map<number, readonly string[]>();
function regionalLook(region: string, uid: number): readonly string[] {
  let look = regionalWear.get(uid);
  if (look) return look;
  const set = regionalSetOf(region), roll = (salt: number) => hash(uid * 13 + salt, uid * 7 + salt * 3);
  if (!set) return [];
  const piece = (slot: string) => set.pieces.find(entry => entry.slot === slot)?.id;
  look = [...(roll(1) < 0.75 ? [piece("head")] : []), ...(roll(3) < 0.9 ? [piece("body")] : []), ...(roll(5) < 0.7 ? [piece("legs")] : []), ...(roll(7) < 0.4 ? [piece("cape")] : [])].filter((id): id is string => !!id);
  regionalWear.set(uid, look);
  return look;
}
/**
 * A villager's own look, the same every time you meet them (from their uid): most wear a hat, a shirt, tunic or dress
 * and trousers or a skirt, some a cape, a few an amulet, and now and then one carries an axe or a pickaxe (never a weapon).
 */
const CITIZEN_HATS = ["scholar_hat", "crimson_wizard_hat", "emerald_wizard_hat", "midnight_wizard_hat", "plum_wizard_hat", "golden_wizard_hat", "crimson_feathered_cap", "forest_feathered_cap",
  "royal_feathered_cap", "russet_feathered_cap", "straw_wide_hat", "felt_wide_hat", "leather_wide_hat", "leather_hood", "paper_crown"];
const CITIZEN_CAPES = ["crimson_cape", "royal_cape", "forest_cape", "snow_cape", "plum_cape", "golden_cape", "russet_cape", "teal_cape", "rose_cape", "team_cape",
  "striped_cape", "halved_cape", "chevron_cape", "quartered_cape", "starry_cape", "pilgrim_cape"];
const CITIZEN_TOOLS = ["pewter_axe", "blackiron_axe", "pewter_pickaxe", "blackiron_pickaxe"];
const CITIZEN_TOPS = ["linen_shirt", "sky_shirt", "scarlet_shirt", "moss_shirt", "mustard_shirt", "charcoal_shirt", "blush_shirt", "oak_shirt", "forest_tunic", "royal_tunic", "wine_tunic", "sand_tunic",
  "crimson_dress", "sapphire_dress", "emerald_dress", "lavender_dress", "golden_dress", "rose_dress"];
const CITIZEN_BOTTOMS = ["brown_trousers", "black_trousers", "navy_trousers", "grey_trousers", "olive_trousers", "cream_trousers", "red_skirt", "blue_skirt", "green_skirt", "plum_skirt"];
const citizenWear = new Map<number, readonly string[]>();
function citizenLook(uid: number): readonly string[] {
  let look = citizenWear.get(uid);
  if (look) return look;
  const roll = (salt: number) => hash(uid * 13 + salt, uid * 7 + salt * 3), pick = <T,>(list: readonly T[], salt: number) => list[Math.floor(roll(salt) * list.length) % list.length];
  look = [...(roll(1) < 0.8 ? [pick(CITIZEN_HATS, 2)] : []), ...(roll(3) < 0.4 ? [pick(CITIZEN_CAPES, 4)] : []),
    ...(roll(5) < 0.15 ? [pick(["moonstone_amulet", "sagestone_amulet", "rosestone_amulet"], 6)] : []), ...(roll(7) < 0.2 ? [pick(CITIZEN_TOOLS, 8)] : []),
    ...(roll(9) < 0.7 ? [pick(CITIZEN_TOPS, 10)] : []), ...(roll(11) < 0.6 ? [pick(CITIZEN_BOTTOMS, 12)] : [])];
  citizenWear.set(uid, look);
  return look;
}
/** Another player: their Friend (canonical art once loaded, family art until then), wardrobe, cape and weapon, a name tag (green for friends) and their chat. */
function drawPeer(ctx: CanvasRenderingContext2D, scene: Scene, peer: PeerView, hits: Hit[]) {
  const { camera, now } = scene, z = camera.zoom, turned = screenFacing(camera, { x: peer.p.hx, y: peer.p.hy || 1 });
  const mount = mountDef(peer.p.mount), motion = peer.p.emote ? emoteMotion(peer.p.emote, peer.emoteT, turned, scene.reducedMotion) : null;
  const s = toScreen(camera, peer.x, peer.y, (motion?.hop ?? 0) + (mount ? riderLift(camera) : 0)), feet = toScreen(camera, peer.x, peer.y), facing = motion?.facing ?? turned;
  if (peer.p.emote) emoteParticles(peer.p.emote, peer.emoteT, peer.x, peer.y, scene.reducedMotion, peer.p.cape && isItem(peer.p.cape) ? item(peer.p.cape).icon.color : undefined);
  const sprites = scene.peerSprites?.(peer.p.id) ?? null, stride = peer.moving ? Math.floor(now / 80) % 8 : 0;
  const rows = sprites ? friendRows(sprites, facing, peer.moving && !mount, mount ? 0 : stride) : peer.moving && Math.floor(now / 160) % 2 ? friendSprite(peer.p.family, peer.p.id).step : friendSprite(peer.p.family, peer.p.id).idle;
  const px = 3.2 * z, worn = [...peer.p.worn, ...(peer.p.cape ? [peer.p.cape] : []), ...(peer.p.head ? [peer.p.head] : []), ...(peer.p.shield ? [peer.p.shield] : []), ...(peer.p.weapon ? [peer.p.weapon] : []), ...(peer.p.neck ? [peer.p.neck] : []), ...(peer.p.body ? [peer.p.body] : []), ...(peer.p.legs ? [peer.p.legs] : []), ...(peer.p.hands ? [peer.p.hands] : []), ...(peer.p.feet ? [peer.p.feet] : [])], cloth = scene.reducedMotion ? 0 : peer.moving ? stride % 4 : Math.floor(now / 520) % 4;
  ellipse(ctx, feet.x, feet.y, (mount ? 32 : 15) * z, (mount ? 10 : 6) * z, "rgba(22,22,22,0.18)", peer.friend ? "rgba(159,224,168,0.9)" : "rgba(255,255,255,0.6)", 1.5);
  if (peer.p.pet && isPet(peer.p.pet)) { const behind = toScreen(camera, peer.x - (peer.p.hx || 0) * 0.9, peer.y - (peer.p.hy || 1) * 0.9); drawPet(ctx, peer.p.pet, behind.x, behind.y, facing, peer.moving, now + peer.p.id * 71, z, scene.reducedMotion); }
  if (mount) drawMount(ctx, mount.coat, facing, peer.moving, now, feet.x, feet.y, z, true, scene.reducedMotion);
  const restoreMotion = applyMotion(ctx, motion, s.x, s.y);
  drawAuras(ctx, worn, s.x, s.y, px, now, scene.reducedMotion, "back");
  const rect = crouched(ctx, !!peer.p.sneak, s.x, s.y + 2 * z, () => drawFigure(ctx, figureArt(rows, worn, facing, cloth, INK, peerHeld(scene, peer)), s.x, s.y + 2 * z, px, peer.p.veiled ? 0.16 : peer.p.sneak ? 0.8 : 1));
  drawAuras(ctx, worn, s.x, s.y, px, now, scene.reducedMotion, "front");
  if (mount) drawMountHead(ctx, mount.coat, facing, peer.moving, now, feet.x, feet.y, z, scene.reducedMotion);
  restoreMotion();
  hits.push({ ...rect, pick: { kind: "peer", id: peer.p.id } });
  if (peer.p.fight) hpBar(ctx, s.x, rect.y - 22, peer.p.hp / Math.max(1, peer.p.maxHp), z);
  const tagY = rect.y - (peer.p.hp < peer.p.maxHp || peer.p.fight ? 26 : 2);
  const plateH = nameplate(ctx, s.x, tagY, peer.p.name ?? null, peer.p.tag ?? null, peer.p.id, z, peer.friend ? "#9fe0a8" : "#ffffff", scene.nameplates);
  if (peer.said) overheadText(ctx, peer.said, s.x, tagY - plateH - 6);
  else if (motion?.text) overheadText(ctx, motion.text, s.x, tagY - plateH - 6, "#ffffff");
}
/** Lean and squash a figure about its feet for an emote; returns the undo. */
function applyMotion(ctx: CanvasRenderingContext2D, motion: Motion | null, x: number, feetY: number) {
  if (!motion || (motion.lean === 0 && motion.squash === 1)) return () => {};
  ctx.save(); ctx.translate(x, feetY); ctx.rotate(motion.lean); ctx.scale(1 + (1 - motion.squash) * 0.4, motion.squash); ctx.translate(-x, -feetY);
  return () => ctx.restore();
}
// ---------- Weather ----------
let fogPuff: HTMLCanvasElement | null = null;
/** Ground fog: soft white banks laid on the ground in world space, drifting slowly. */
function drawFog(ctx: CanvasRenderingContext2D, camera: Camera, amount: number, now: number) {
  if (!fogPuff) {
    fogPuff = document.createElement("canvas"); fogPuff.width = fogPuff.height = 128;
    const f = fogPuff.getContext("2d")!, g = f.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(236,239,242,0.9)"); g.addColorStop(0.5, "rgba(236,239,242,0.45)"); g.addColorStop(1, "rgba(236,239,242,0)");
    f.fillStyle = g; f.fillRect(0, 0, 128, 128);
  }
  const drift = now / 9000, step = 3.5, cx = Math.floor(camera.x / step) * step, cy = Math.floor(camera.y / step) * step, z = camera.zoom;
  for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) {
    const wx = cx + i * step + Math.sin(drift + j * 1.3) * 1.2 + drift * 1.5, wy = cy + j * step + Math.cos(drift * 0.7 + i) * 0.8;
    const density = hash(Math.round(cx / step) + i, Math.round(cy / step) + j);
    if (density < 0.25) continue;
    const at = toScreen(camera, wx, wy, 4), w = step * TILE_W * 1.35 * z, h = w * (0.35 + camera.pitch * 0.55);
    if (at.x < -w || at.x > VIEW.width + w || at.y < -h || at.y > VIEW.height + h) continue;
    ctx.globalAlpha = Math.min(0.85, amount * (0.35 + density * 0.55));
    ctx.drawImage(fogPuff, at.x - w / 2, at.y - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
}
/** Rain: slanted streaks falling across the screen, and splashes on the ground. */
function drawRain(ctx: CanvasRenderingContext2D, amount: number, now: number, dark: number) {
  const streaks = Math.round(260 * amount), t = now / 1000;
  ctx.strokeStyle = `rgba(${dark > 0.4 ? "170,185,210" : "205,215,230"},${(0.38 + amount * 0.2).toFixed(2)})`; ctx.lineWidth = 1.2; ctx.beginPath();
  for (let i = 0; i < streaks; i++) {
    const speed = 900 + hash(i, 3) * 500, len = 10 + hash(i, 5) * 10;
    const y = ((hash(i, 1) * VIEW.height + t * speed) % (VIEW.height + 40)) - 20, x = ((hash(i, 2) * (VIEW.width + 200) - t * speed * 0.28) % (VIEW.width + 200) + VIEW.width + 200) % (VIEW.width + 200) - 100;
    ctx.moveTo(x, y); ctx.lineTo(x - len * 0.28, y + len);
  }
  ctx.stroke();
  // Splashes: little rings that pop up and fade.
  ctx.strokeStyle = `rgba(220,228,240,${(0.35 * amount).toFixed(2)})`; ctx.lineWidth = 1;
  const beat = Math.floor(now / 140);
  for (let i = 0; i < 40 * amount; i++) {
    const x = hash(beat * 97 + i, 11) * VIEW.width, y = hash(beat * 89 + i, 12) * VIEW.height, r = 2 + hash(i, 13) * 3;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
  }
}
/** A lightning strike: a white flash across the sky, and a forked bolt for a moment. */
function drawLightning(ctx: CanvasRenderingContext2D, strike: Strike, ms: number, reduced: boolean) {
  const age = ms - strike.at;
  if (age < 0 || age > 900) return;
  const flash = age < 80 ? 0.55 : age < 140 ? 0.15 : age < 220 ? 0.4 : Math.max(0, 0.3 * (1 - (age - 220) / 680));
  ctx.fillStyle = `rgba(235,240,255,${(reduced ? flash * 0.3 : flash).toFixed(3)})`; ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  if (reduced || age > 260) return;
  // The bolt: a jagged path from the top of the sky with a fork or two.
  let seed = strike.seed; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const bolt = (x0: number, y0: number, y1: number, width: number) => {
    const points: [number, number][] = [[x0, y0]]; let x = x0;
    for (let y = y0; y < y1; y += 14 + rand() * 18) { x += (rand() - 0.5) * 38; points.push([x, y]); }
    for (const [color, w] of [["rgba(160,190,255,0.5)", width * 4], ["#ffffff", width]] as const) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); points.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke(); }
    return points;
  };
  const main = bolt(strike.x * VIEW.width, -10, strike.y * VIEW.height, 2.6);
  for (let f = 0; f < 2; f++) { const from = main[Math.floor(main.length * (0.3 + rand() * 0.4))]; if (from) bolt(from[0], from[1], from[1] + 60 + rand() * 90, 1.4); }
}
/** A little pixel heart. */
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = "#e7677a"; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x, y + r); ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.8, y - r * 1.4, x, y - r * 0.5); ctx.bezierCurveTo(x + r * 0.8, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r); ctx.fill(); ctx.stroke();
}
/** The skillcape emote: rays of the cape's colour turning behind you. */
function skillcapeRays(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, now: number, color: string, reduced: boolean) {
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const turn = reduced ? 0 : now / 900;
  for (let i = 0; i < 10; i++) {
    const a = turn + i * Math.PI / 5, r = 70 * z;
    ctx.fillStyle = hexA(color, 0.28); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a - 0.1) * r, y + Math.sin(a - 0.1) * r * 0.8); ctx.lineTo(x + Math.cos(a + 0.1) * r, y + Math.sin(a + 0.1) * r * 0.8); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function questMarkerFor(game: Game, npcId: string): string | null {
  const q = game.player.quests;
  const starts: Record<string, string> = { candlemere_reeve: "candlemere_tithe", antler_captain: "heartwood_elder", hollowmere_officer: "west_watch", raria_gate_captain: "rrr_truce", fff_gatewarden: "fff_truce", barkreach_foreman: "barkreach_heartwood", fff_ranger_captain: "fff_rangers", fff_wizard_arguing: "fff_toaster", cook: "friends_feast", captain: "grumblin_trouble", smith: "cold_forge", priest: "hollow_whispers", glimmer: "lost_glimmer", hazel: "hazels_quiver",
    gravesend_keeper: "gravesend_lanterns", saltmarrow_harbour: "saltmarrow_tithe", hollyhock_apothecary: "hollyhock_errand", dyemoor_dyer: "dyemoor_dye", tallgrass_huntmaster: "tallgrass_tracks", cragmaw_foreman: "cragmaw_shaft", quillhaven_archivist: "quillhaven_folio", ashfall_trader: "ashfall_embers" };
  const quest = starts[npcId];
  if (quest && !q[quest]) return C.butter;
  if (npcId === "glimmer" && (q.lost_glimmer ?? 0) >= 2 && (q.hollow_whispers ?? 0) >= 4 && !q.hollow_king) return C.rose;
  return null;
}
function drawMonster(ctx: CanvasRenderingContext2D, scene: Scene, monster: Monster, at: { x: number; y: number; moving: boolean }, hits: Hit[]) {
  const { camera, now, game } = scene, z = camera.zoom, size = monster.def.size ?? 1, center = { x: at.x + (size - 1) / 2, y: at.y + (size - 1) / 2 };
  const s = toScreen(camera, center.x, center.y), px = (size === 1 ? 2.6 : size === 2 ? 4.4 : 6.2) * z * (monster.def.id === "chicken" || monster.def.id === "ink_rat" ? 0.75 : monster.def.id === "cow" ? 0.85 : monster.def.id === "sheep" ? 0.7 : monster.def.id === "stone_golem" ? 1.25 : monster.def.id === "forest_spider" ? 0.8 : 1);
  ellipse(ctx, s.x, s.y, 12 * z * size, 4.5 * z * size, "rgba(22,22,22,0.18)", null);
  // A shorn sheep looks shorn until its fleece grows back.
  const set = creatureSprite(monster.def.shear && (monster.shorn ?? 0) > game.tick ? monster.def.shear.art : monster.def.art), frame = at.moving && Math.floor(now / 150) % 2 ? set.step : set.idle;
  const facing = screenFacing(camera, monster.heading), faceLeft = FACES_LEFT.has(monster.def.art), mirror = faceLeft ? facing === "right" || facing === "down" : facing === "left" || facing === "up";
  if (monster.def.boss && !scene.reducedMotion) { const pulse = 1 + Math.sin(now / 300) * 0.08; ellipse(ctx, s.x, s.y - 40 * z, 48 * z * pulse, 36 * z * pulse, "rgba(20,20,30,0.25)", null); }
  const hover = monster.def.id === "shade" || monster.def.id === "hollow_king" ? Math.sin(now / 350 + monster.uid) * 3 * z : 0;
  const rect = drawMask(ctx, frame, s.x, s.y + 2 * z - hover, px, monster.def.ink ?? INK, mirror);
  hits.push({ ...rect, pick: { kind: "monster", id: monster.uid } });
  const recent = scene.hits.filter(entry => entry.on === "monster" && entry.uid === monster.uid && now - entry.at < 1100);
  // Health and level show while it's fighting: attacking you, your target, in another player's fight, or hit lately.
  const fighting = monster.target || game.player.combat === monster.uid || scene.hits.some(entry => entry.on === "monster" && entry.uid === monster.uid && now - entry.at < 4000)
    || (scene.peers ?? []).some(peer => peer.p.fight?.u === monster.uid);
  if (fighting) {
    hpBar(ctx, s.x, rect.y - 8 * z, monster.hp / monster.def.hp, z, 24 + 10 * size, `${monster.def.level}`);
    // Its weakness: a little coloured orb beside the bar (fire, water, wind, earth or holy light).
    if (monster.def.weakness) { const w = (24 + 10 * size) * z, ex = s.x + w / 2 + 6 * z, ey = rect.y - 8 * z + 2.25 * Math.max(0.85, z); ui(ctx, ctx => { ctx.fillStyle = WEAKNESS_COLORS[monster.def.weakness!] ?? "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ex, ey, 4 * Math.max(0.85, z), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = INK; ctx.font = `bold ${Math.round(6 * Math.max(0.85, z))}px ui-monospace, monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(WEAKNESS_GLYPH[monster.def.weakness!] ?? "?", ex, ey + 0.5); }); }
  }
  for (const hit of recent) splat(ctx, s.x, s.y - rect.h / 2, hit.damage, z, (now - hit.at) / 1100);
  void game;
}

// ---------- Minimap and world map ----------
/** Map colours: clearer than the land's pastels, so roads, water, walls and floors read at a glance. */
const MAP_COLORS: Record<number, [number, number, number]> = {
  [T.VOID]: [14, 14, 16], [T.GRASS]: [150, 178, 122], [T.DARK_GRASS]: [118, 150, 98], [T.PATH]: [214, 186, 136], [T.COBBLE]: [196, 190, 178], [T.SAND]: [232, 212, 158],
  [T.WATER]: [96, 142, 196], [T.DEEP]: [66, 108, 170], [T.SWAMP]: [118, 130, 94], [T.SNOW]: [246, 246, 242], [T.STONE]: [176, 172, 164], [T.WOOD]: [184, 146, 104],
  [T.GRAVEL]: [168, 158, 142], [T.DUNGEON]: [84, 82, 92], [T.BRIDGE]: [150, 108, 70], [T.CLIFF]: [96, 90, 82], [T.WALL]: [34, 32, 30], [T.FARMLAND]: [176, 142, 90],
  [T.ICE]: [204, 224, 238], [T.CARPET]: [196, 118, 118], [T.ASH]: [112, 106, 102], [T.LAVA]: [226, 112, 64], [T.BRICK]: [150, 72, 60],
};
let mapImage: HTMLCanvasElement | null = null;
/** The whole world, one pixel per tile (built once). */
export function worldImage(world: World): HTMLCanvasElement {
  if (mapImage) return mapImage;
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!, image = ctx.createImageData(W, H);
  // Upper storeys aren't on the map: it shows the ground.
  for (let i = 0; i < W * H; i++) {
    if (i >= W * FLOOR_Y) { image.data.set([...MAP_COLORS[T.VOID], 255], i * 4); continue; }
    let [r, g, b] = MAP_COLORS[world.tiles[i]] ?? [128, 128, 128];
    const object = world.objects[world.objectAt[i]];
    if (object?.kind === "tree") [r, g, b] = [78, 116, 70];
    else if (object?.kind === "rock") [r, g, b] = [128, 112, 98];
    image.data.set([r, g, b, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  return mapImage = canvas;
}
export type MapIcon = { x: number; y: number; glyph: string; label: string };
export function mapIcons(world: World): MapIcon[] {
  const icons: MapIcon[] = [], seen = new Set<string>();
  const add = (x: number, y: number, glyph: string, label: string, spacing = 6) => {
    const key = `${glyph}:${Math.round(x / spacing)}:${Math.round(y / spacing)}`;
    if (seen.has(key)) return; seen.add(key); icons.push({ x, y, glyph, label });
  };
  for (const object of world.objects) {
    if (object.kind === "bank") add(object.x, object.y, "$", "Bank");
    else if (object.kind === "furnace") add(object.x, object.y, "▲", "Furnace");
    else if (object.kind === "anvil") add(object.x, object.y, "⚒", "Anvil");
    else if (object.kind === "range") add(object.x, object.y, "♨", "Cooking range");
    else if (object.kind === "altar") add(object.x, object.y, "✚", "Altar");
    else if (object.kind === "spot") add(object.x, object.y, "≈", "Fishing", 10);
    else if (object.kind === "rock") add(object.x, object.y, "⛏", "Mining", 14);
    else if (object.y >= FLOOR_Y) continue;
    else if (object.look === "stairs") add(object.x, object.y, "♜", "Friendhollow Castle", 12);
    else if (object.kind === "ladder" || object.kind === "gate") add(object.x, object.y, "▼", object.name);
    else if (object.kind === "stall") add(object.x, object.y, "✋", "Market stalls");
    else if (object.kind === "obstacle" && object.obstacle && COURSES[object.obstacle.course]) add(object.x, object.y, "➶", COURSES[object.obstacle.course].name, 30);
    else if (object.kind === "casket") add(object.x, object.y, "◆", "Rare Caskets");
    else if (object.kind === "sigil_altar") add(object.x, object.y, "◈", object.name);
  }
  for (const spawn of world.spawns) {
    if (spawn.y >= FLOOR_Y) continue;
    const def = spawn.kind === "npc" ? NPCS[spawn.id] : null;
    if (def?.shop) add(spawn.x, spawn.y, "¤", def.name);
    if (spawn.kind === "npc" && spawn.id === "stablemaster") add(spawn.x, spawn.y, "♞", "Stables");
    if (spawn.kind === "npc" && ["cook", "captain", "smith", "priest", "glimmer", "hazel", "gravesend_keeper", "saltmarrow_harbour", "hollyhock_apothecary", "dyemoor_dyer", "tallgrass_huntmaster", "cragmaw_foreman", "quillhaven_archivist", "ashfall_trader"].includes(spawn.id)) add(spawn.x, spawn.y, "!", `Quest: ${def!.name}`);
  }
  return icons;
}
/** The minimap: the world turned to match the camera (45° plus its rotation), centred on the player. */
export function renderMinimap(ctx: CanvasRenderingContext2D, game: Game, size: number, scale: number, angle: number, peers: readonly PeerView[] = [], guideTarget: { x: number; y: number } | null = null) {
  dressWorld(game.world);
  const world = game.world, image = worldImage(world), player = realPoint(world, game.player.x, game.player.y);
  ctx.save(); ctx.clearRect(0, 0, size, size);
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "#0e0e10"; ctx.fillRect(0, 0, size, size);
  const turn = Math.PI / 4 + angle, cos = Math.cos(turn), sin = Math.sin(turn);
  ctx.translate(size / 2, size / 2); ctx.rotate(turn); ctx.scale(scale, scale); ctx.translate(-player.x - 0.5, -player.y - 0.5);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0);
  // Dots for what's on your storey.
  const dot = (sx: number, sy: number, color: string, r = 0.9) => {
    const { x, y, level } = realPoint(world, sx, sy);
    if (level !== player.level || Math.abs(x - player.x) >= 40 || Math.abs(y - player.y) >= 40) return;
    ctx.fillStyle = "#161616"; ctx.fillRect(x + 0.5 - r / 2 - 0.25, y + 0.5 - r / 2 - 0.25, r + 0.5, r + 0.5);
    ctx.fillStyle = color; ctx.fillRect(x + 0.5 - r / 2, y + 0.5 - r / 2, r, r);
  };
  for (const entry of game.ground) dot(entry.x, entry.y, "#e0463c", 1);
  for (const npc of game.npcs) dot(npc.x, npc.y, "#f5e04a", 1.3);
  for (const monster of game.monsters) if (!monster.dead) dot(monster.x, monster.y, "#f5e04a", 1.3);
  if (game.pet) dot(game.pet.x, game.pet.y, "#ffffff", 1.3);
  if (guideTarget) dot(guideTarget.x, guideTarget.y, "#f2d56b", 2.2);
  // Other players: white, friends green.
  for (const peer of peers) dot(Math.round(peer.x), Math.round(peer.y), peer.friend ? "#7fe08f" : "#ffffff", 1.6);
  ctx.restore();
  // Map icons, drawn upright.
  ctx.save(); ctx.font = "bold 11px ui-monospace, Menlo, Consolas, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const icon of iconsCache ??= mapIcons(world)) {
    const dx = icon.x - player.x, dy = icon.y - player.y, rx = (dx * cos - dy * sin) * scale, ry = (dx * sin + dy * cos) * scale;
    if (Math.hypot(rx, ry) > size / 2 - 9) continue;
    ctx.fillStyle = ICON_FILLS[icon.glyph] ?? PAPER; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(size / 2 + rx, size / 2 + ry, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.fillText(icon.glyph, size / 2 + rx, size / 2 + ry + 0.5);
  }
  // You: a white arrow facing your direction.
  ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(size / 2, size / 2, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
/** Minimap click → world tile (the inverse of the minimap's turn). */
export function minimapTile(game: Game, dx: number, dy: number, scale: number, angle: number) {
  const turn = -(Math.PI / 4 + angle), cos = Math.cos(turn), sin = Math.sin(turn), x = dx / scale, y = dy / scale, here = realPoint(game.world, game.player.x, game.player.y);
  return onLevel(game.world, Math.round(here.x + x * cos - y * sin), Math.round(here.y + x * sin + y * cos), here.level);
}
let iconsCache: MapIcon[] | null = null;
/** Icon backgrounds by kind, so a bank or a quest stands out from a shop. */
const ICON_FILLS: Record<string, string> = { "◈": "#c6bed4", "$": "#f2d56b", "!": "#f5e04a", "¤": "#ffffff", "◆": "#e7a9b0", "♜": "#c6bed4", "▼": "#b7b2aa", "⛏": "#d8c4a8", "≈": "#9fc1e6", "♨": "#f0b48a", "▲": "#f0b48a", "⚒": "#c8c5be", "✚": "#ffffff", "✋": "#e8d4c0", "➶": "#b4d3a0", "♞": "#e2b56a" };
/** The world map: the whole Realm turned to match the camera, with labels. Returns the transform for clicks. */
export function renderWorldMap(ctx: CanvasRenderingContext2D, game: Game, width: number, height: number, focus: { x: number; y: number; zoom: number }, underground: boolean) {
  dressWorld(game.world);
  const world = game.world, image = worldImage(world), player = realPoint(world, game.player.x, game.player.y);
  ctx.save(); ctx.fillStyle = "#1a1a1d"; ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2); ctx.rotate(Math.PI / 4); ctx.scale(focus.zoom, focus.zoom); ctx.translate(-focus.x, -focus.y);
  ctx.imageSmoothingEnabled = false;
  if (underground) ctx.drawImage(image, 0, DUNGEON_Y, W, FLOOR_Y - DUNGEON_Y, 0, DUNGEON_Y, W, FLOOR_Y - DUNGEON_Y); else ctx.drawImage(image, 0, 0, W, OVERWORLD_H, 0, 0, W, OVERWORLD_H);
  ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 1 / focus.zoom;
  ctx.beginPath(); ctx.arc(player.x + 0.5, player.y + 0.5, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  const toMap = (x: number, y: number) => {
    const dx = (x - focus.x) * focus.zoom, dy = (y - focus.y) * focus.zoom;
    return { x: width / 2 + (dx - dy) * Math.SQRT1_2, y: height / 2 + (dx + dy) * Math.SQRT1_2 };
  };
  ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // Zoomed right out (the whole continent), only quests, banks and the ways underground are marked, and labels shrink.
  const far = focus.zoom < 1;
  for (const icon of iconsCache ??= mapIcons(world)) {
    if (isUnderground(icon.y) !== underground) continue;
    if (far && !["!", "$", "▼"].includes(icon.glyph)) continue;
    const p = toMap(icon.x, icon.y);
    ctx.font = "bold 11px ui-monospace, Menlo, Consolas, monospace"; ctx.fillStyle = PAPER; ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = INK; ctx.fillText(icon.glyph, p.x, p.y + 0.5);
  }
  for (const region of REGIONS) {
    if (!!region.underground !== underground || region.id === "coast") continue;
    const p = toMap(region.label.x, region.label.y);
    ctx.font = `bold ${far ? 11 : 15}px ui-monospace, Menlo, Consolas, monospace`; ctx.strokeStyle = INK; ctx.lineWidth = far ? 3 : 4; ctx.strokeText(region.name, p.x, p.y - 14); ctx.fillStyle = "#f2e28f"; ctx.fillText(region.name, p.x, p.y - 14);
  }
  const you = toMap(player.x + 0.5, player.y + 0.5);
  ctx.font = "bold 12px ui-monospace, Menlo, Consolas, monospace"; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeText("You", you.x, you.y - 12); ctx.fillStyle = "#fff"; ctx.fillText("You", you.x, you.y - 12);
  ctx.restore();
  return (sx: number, sy: number) => {
    const rx = (sx - width / 2) / focus.zoom, ry = (sy - height / 2) / focus.zoom;
    return onLevel(world, Math.round(focus.x + (rx + ry) * Math.SQRT1_2 - 0.5), Math.round(focus.y + (ry - rx) * Math.SQRT1_2 - 0.5), player.level);
  };
}
