/**
 * A tiny pixel painter for the Realm's art: polygons, discs and thick lines rasterized with no anti-aliasing onto a
 * small grid, then an ink outline and (optionally) a white halo, like the canonical Rare Friends sprites.
 * The result is a canvas meant to be drawn scaled up with image smoothing off.
 */
export const INK = "#161616";

const cache = new Map<string, HTMLCanvasElement>();
function rgba(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16), a = hex.length > 7 ? parseInt(hex.slice(7, 9), 16) : 255;
  return ((a << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0;
}
export function shadeHex(hex: string, amount: number) {
  const n = parseInt(hex.slice(1, 7), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

export class Pixels {
  readonly data: Uint32Array; readonly w: number; readonly h: number;
  constructor(w: number, h: number) { this.w = w; this.h = h; this.data = new Uint32Array(w * h); }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number) { return this.inside(x, y) ? this.data[y * this.w + x] : 0; }
  set(x: number, y: number, color: string | number) {
    x = Math.round(x); y = Math.round(y);
    if (this.inside(x, y)) this.data[y * this.w + x] = typeof color === "number" ? color : rgba(color);
  }
  rect(x: number, y: number, w: number, h: number, color: string) {
    const c = rgba(color);
    for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) this.set(i, j, c);
  }
  /** Thick line (square brush). */
  line(x0: number, y0: number, x1: number, y1: number, color: string, width = 1) {
    const c = rgba(color), steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2)), r = (width - 1) / 2;
    for (let s = 0; s <= steps; s++) {
      const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
      for (let j = Math.round(y - r); j <= Math.round(y + r); j++) for (let i = Math.round(x - r); i <= Math.round(x + r); i++) this.set(i, j, c);
    }
  }
  polyline(points: readonly (readonly [number, number])[], color: string, width = 1) {
    for (let i = 0; i + 1 < points.length; i++) this.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], color, width);
  }
  /** Filled polygon, with an ink edge unless `stroke` is null. */
  poly(points: readonly (readonly [number, number])[], fill: string | null, stroke: string | null = INK) {
    if (fill) {
      const c = rgba(fill), ys = points.map(p => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
        const cy = y + 0.5, xs: number[] = [];
        for (let i = 0; i < points.length; i++) {
          const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
          if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + (cy - ay) * (bx - ax) / (by - ay));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
      }
    }
    if (stroke) for (let i = 0; i < points.length; i++) { const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length]; this.line(ax, ay, bx, by, stroke); }
  }
  /** Filled ellipse; `stroke` draws its rim. `shadow` dithers a darker lower-right. */
  disc(cx: number, cy: number, rx: number, ry: number, fill: string, stroke: string | null = INK, shadow?: string) {
    const c = rgba(fill), s = stroke ? rgba(stroke) : 0, d = shadow ? rgba(shadow) : 0;
    const inside = (x: number, y: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (!inside(x, y)) continue;
      const rim = stroke && (!inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1));
      if (rim) { this.set(x, y, s); continue; }
      const lower = (x + 0.5 - cx) / rx + (y + 0.5 - cy) / ry;
      this.set(x, y, shadow && lower > 0.35 && BAYER[y & 3][x & 3] < (lower - 0.35) * 22 ? d : c);
    }
  }
  /** Dither a colour over pixels already painted with `match` (or any non-empty pixel), by a 0..1 density function. */
  dither(color: string, density: (x: number, y: number) => number, match?: string) {
    const c = rgba(color), m = match ? rgba(match) : 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const v = this.data[y * this.w + x];
      if (!v || (m && v !== m)) continue;
      if (BAYER[y & 3][x & 3] / 16 < density(x, y)) this.data[y * this.w + x] = c;
    }
  }
  /** Ink edge around the whole silhouette (outside pixels next to a filled one). */
  outline(color = INK) {
    const c = rgba(color), copy = this.data.slice();
    const filled = (x: number, y: number) => this.inside(x, y) && copy[y * this.w + x] !== 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (copy[y * this.w + x]) continue;
      if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) this.data[y * this.w + x] = c;
    }
  }
  /** One-pixel white halo, as on the canonical sprites. */
  halo(color = "#ffffff") {
    const c = rgba(color), copy = this.data.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (copy[y * this.w + x]) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && this.inside(x + dx, y + dy) && copy[(y + dy) * this.w + x + dx]) { near = true; break; }
      if (near) this.data[y * this.w + x] = c;
    }
  }
  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas"); canvas.width = this.w; canvas.height = this.h;
    const ctx = canvas.getContext("2d")!, image = ctx.createImageData(this.w, this.h);
    new Uint32Array(image.data.buffer).set(this.data);
    ctx.putImageData(image, 0, 0);
    return canvas;
  }
}
/** Paint once and cache by key. */
export function pixelArt(key: string, w: number, h: number, paint: (p: Pixels) => void): HTMLCanvasElement {
  let canvas = cache.get(key);
  // Least recently used goes first: a hit moves to the back of the queue.
  if (canvas) { cache.delete(key); cache.set(key, canvas); return canvas; }
  const p = new Pixels(w, h);
  paint(p);
  canvas = p.toCanvas();
  if (cache.size > 1500) cache.delete(cache.keys().next().value!);
  cache.set(key, canvas);
  return canvas;
}
/** One pixel-art draw as it landed on screen, so the same sprite can be laid again (as a shadow, or a hole in the light). */
export type SpriteDraw = { art: HTMLCanvasElement; x: number; y: number; w: number; h: number; alpha: number };
let recording: SpriteDraw[] | null = null;
/** Every drawPixels call is noted in `list` until recording stops (null). */
export function recordSprites(list: SpriteDraw[] | null) { recording = list; }
/** Note a draw made some other way (a Friend's mask) as if it were pixel art, while recording. */
export function noteSprite(art: HTMLCanvasElement, x: number, y: number, w: number, h: number, alpha = 1) { if (recording) recording.push({ art, x, y, w, h, alpha }); }
/**
 * Art scaled up once and kept, so a frame's hundreds of sprites are plain copies (a scaled draw costs more wherever the
 * canvas is drawn in software). A size is only kept once it's been asked for in two frames (zooming asks for a new size
 * every frame), and a frame makes a few at most, so settling after a zoom never hitches.
 */
const scaled = new WeakMap<HTMLCanvasElement, { last: number; copies: Map<number, HTMLCanvasElement> }>();
let scaledThisFrame = 0;
const SCALED_PER_FRAME = 48, SCALED_PER_ART = 2;
/** Call once a frame: lets a few more scaled copies be made. */
export function beginSprites() { scaledThisFrame = 0; }
function scaledArt(art: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  if (w === art.width && h === art.height) return art;
  const key = w * 65536 + h;
  let entry = scaled.get(art);
  if (!entry) { entry = { last: key, copies: new Map() }; scaled.set(art, entry); return art; }
  const copy = entry.copies.get(key);
  if (copy) return copy;
  if (entry.last !== key || scaledThisFrame >= SCALED_PER_FRAME) { entry.last = key; return art; }
  scaledThisFrame++;
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!; ctx.imageSmoothingEnabled = false; ctx.drawImage(art, 0, 0, w, h);
  if (entry.copies.size >= SCALED_PER_ART) entry.copies.delete(entry.copies.keys().next().value!);
  entry.copies.set(key, canvas);
  return canvas;
}
/**
 * Where pixel art can go instead of a canvas (the GPU, with WebGL): given the canvas it was to be drawn on, the art, its
 * box there and its alpha, it takes the sprite (true) or leaves it to be drawn as usual (false).
 */
export type SpriteSink = (ctx: CanvasRenderingContext2D, art: HTMLCanvasElement, x: number, y: number, w: number, h: number, alpha: number) => boolean;
let sink: SpriteSink | null = null;
export function sendSprites(to: SpriteSink | null) { sink = to; }
/** Offer a sprite to the sink (see SpriteSink): true if it took it. */
export function sinkSprite(ctx: CanvasRenderingContext2D, art: HTMLCanvasElement, x: number, y: number, w: number, h: number, alpha: number) { return !!sink && sink(ctx, art, x, y, w, h, alpha); }
/** Draw pixel art with its bottom-centre on (x, y), `scale` screen pixels per art pixel. */
export function drawPixels(ctx: CanvasRenderingContext2D, art: HTMLCanvasElement, x: number, y: number, scale: number, alpha = 1, anchorY = 1) {
  const w = art.width * scale, h = art.height * scale, dx = Math.round(x - w / 2), dy = Math.round(y - h * anchorY), dw = Math.round(w), dh = Math.round(h);
  if (!(sink && sink(ctx, art, dx, dy, dw, dh, alpha))) {
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha;
    ctx.drawImage(scaledArt(art, dw, dh), dx, dy, dw, dh);
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = smoothing;
  }
  if (recording) recording.push({ art, x: dx, y: dy, w: dw, h: dh, alpha });
  return { x: x - w / 2, y: y - h * anchorY, w, h };
}
/**
 * A sprite's silhouette in one flat colour (its light, or how clear of the haze it is), kept by art, size and colour:
 * laid over the light buffer with one draw, it puts the sprite's own light where the sprite is, as cutting a hole and
 * filling it would, without the change of composite mode each sprite would otherwise cost. Colours are quantised by
 * the caller, so a frame of scenery under one sky shares a handful of them.
 */
const tints = new Map<string, HTMLCanvasElement>();
const artIds = new WeakMap<HTMLCanvasElement, number>();
let nextArtId = 1;
const TINTS_MAX = 1200;
export function tintedSprite(art: HTMLCanvasElement, w: number, h: number, css: string): HTMLCanvasElement {
  let id = artIds.get(art);
  if (!id) { id = nextArtId++; artIds.set(art, id); }
  const key = `${id}:${w}:${h}:${css}`;
  let canvas = tints.get(key);
  if (canvas) { tints.delete(key); tints.set(key, canvas); return canvas; }
  canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!; ctx.imageSmoothingEnabled = false; ctx.drawImage(art, 0, 0, w, h);
  ctx.globalCompositeOperation = "source-in"; ctx.fillStyle = css; ctx.fillRect(0, 0, w, h);
  if (tints.size >= TINTS_MAX) tints.delete(tints.keys().next().value!);
  tints.set(key, canvas);
  return canvas;
}
/** Lay recorded sprites again as flat silhouettes of one colour (source-over). */
export function stampSprites(ctx: CanvasRenderingContext2D, list: readonly SpriteDraw[], css: string) {
  ctx.imageSmoothingEnabled = false;
  for (const s of list) {
    if (s.alpha !== 1) ctx.globalAlpha = s.alpha;
    ctx.drawImage(tintedSprite(s.art, s.w, s.h, css), s.x, s.y);
    if (s.alpha !== 1) ctx.globalAlpha = 1;
  }
}
/** Lay recorded sprites again on another canvas (the same art at the same places). */
export function replaySprites(ctx: CanvasRenderingContext2D, list: readonly SpriteDraw[]) {
  ctx.imageSmoothingEnabled = false;
  for (const s of list) {
    if (s.alpha !== 1) ctx.globalAlpha = s.alpha;
    ctx.drawImage(scaledArt(s.art, s.w, s.h), s.x, s.y, s.w, s.h);
    if (s.alpha !== 1) ctx.globalAlpha = 1;
  }
}
