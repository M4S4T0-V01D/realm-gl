// Paint the preview page's parallax backdrops with the game's own pixel art (walls, shingles, trees, decor and fire from
// games/rarefriends-realm), as PNG tiles in site/preview/media/bg. Run after changing them: node scripts/preview-backdrops.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Enough of a canvas for Pixels.toCanvas(): the art is read back from the image data it puts.
globalThis.document = { createElement: () => { const c = { width: 0, height: 0, data: null, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData: img => { c.data = img.data; } }) }; return c; } };
globalThis.window = globalThis;
const { Pixels, shadeHex } = await import("../games/rarefriends-realm/pixel.ts");
const { wallTexture, shingleTexture } = await import("../games/rarefriends-realm/textures.ts");
const { treeArt, decorArt, fireArt, rockArt } = await import("../games/rarefriends-realm/scenery.ts");
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "../site/preview/media/bg");
mkdirSync(out, { recursive: true });

/** Stamp a canvas (from the game's painters) into a Pixels buffer at (x, y), skipping transparent pixels. */
const stamp = (p, art, x, y) => { const d = new Uint32Array(art.data.buffer); for (let j = 0; j < art.height; j++) for (let i = 0; i < art.width; i++) { const v = d[j * art.width + i]; if (v >>> 24) p.set(x + i, y + j, v); } };
/** Tile a canvas across a box. */
const tile = (p, art, x0, y0, w, h) => { for (let y = y0; y < y0 + h; y += art.height) for (let x = x0; x < x0 + w; x += art.width) { const d = new Uint32Array(art.data.buffer); for (let j = 0; j < art.height && y + j < y0 + h; j++) for (let i = 0; i < art.width && x + i < x0 + w; i++) p.set(x + i, y + j, d[j * art.width + i]); } };
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = buf => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cc]); };
function save(name, p) {
  const raw = Buffer.alloc((p.w * 4 + 1) * p.h), bytes = new Uint8Array(p.data.buffer);
  for (let y = 0; y < p.h; y++) { raw[y * (p.w * 4 + 1)] = 0; Buffer.from(bytes.buffer, y * p.w * 4, p.w * 4).copy(raw, y * (p.w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(p.w, 0); ihdr.writeUInt32BE(p.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(path.join(out, name), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
  console.log(`${name} ${p.w}×${p.h}`);
}

// ---------- The castle wall behind the trailer: stone courses, battlements along the top, arrow slits, a banner or two ----------
{
  const W = 240, H = 192, stone = "#4b4a52", p = new Pixels(W, H), random = rng(3);
  tile(p, wallTexture("brick", stone, 2), 0, 20, W, H - 20);
  // Merlons: 24 wide every 48, the gaps open to the sky; a darker string course under them.
  for (let x = 0; x < W; x += 48) { tile(p, wallTexture("cap", shadeHex(stone, 0.06), 1), x, 0, 24, 20); p.rect(x, 0, 24, 1, shadeHex(stone, 0.2)); p.rect(x, 0, 1, 20, shadeHex(stone, 0.12)); p.rect(x + 23, 0, 1, 20, shadeHex(stone, -0.25)); }
  p.rect(0, 20, W, 2, shadeHex(stone, -0.3)); p.rect(0, 22, W, 1, shadeHex(stone, 0.1));
  // Arrow slits, and the odd darker stone.
  for (const x of [36, 132, 204]) { p.rect(x, 60, 3, 16, "#111113"); p.rect(x - 1, 58, 5, 2, shadeHex(stone, -0.2)); p.rect(x - 1, 76, 5, 2, shadeHex(stone, 0.1)); }
  for (let i = 0; i < 14; i++) p.rect(Math.floor(random() * W / 8) * 8 + 1, 24 + Math.floor(random() * 42) * 4 + 1, 7, 3, shadeHex(stone, -0.12));
  save("castle.png", p);
  const plain = new Pixels(48, 72); tile(plain, wallTexture("brick", stone, 2), 0, 0, 48, 72); save("stone.png", plain);
}
// ---------- Torches: the bracket, and eight frames of the game's own fire ----------
{
  const frames = 8, art = fireArt(0, 18, 26, 2), p = new Pixels(art.width * frames, art.height + 14);
  for (let f = 0; f < frames; f++) stamp(p, fireArt(f, 18, 26, 2), f * art.width, 0);
  save("fire.png", p);
  const bracket = new Pixels(18, 16);
  bracket.rect(7, 0, 4, 10, "#5a4030"); bracket.rect(8, 0, 2, 10, "#7a5a40"); bracket.rect(5, 9, 8, 3, "#3b3a38"); bracket.rect(6, 12, 6, 4, "#2a2a2c"); bracket.rect(6, 12, 1, 4, "#4a4a4e");
  save("bracket.png", bracket);
}
// ---------- The night sky: a gradient strip, a tile of stars, and a strip of drifting clouds ----------
{
  const H = 640, p = new Pixels(8, H), top = [14, 16, 30], mid = [44, 34, 64], low = [120, 64, 64], horizon = [196, 120, 80];
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1), c = t < 0.55 ? mix(top, mid, t / 0.55) : t < 0.85 ? mix(mid, low, (t - 0.55) / 0.3) : mix(low, horizon, (t - 0.85) / 0.15);
    for (let x = 0; x < 8; x++) p.set(x, y, `#${c.map(v => v.toString(16).padStart(2, "0")).join("")}`);
  }
  save("sky.png", p);
  const S = 256, stars = new Pixels(S, S), random = rng(11);
  for (let i = 0; i < 70; i++) { const x = Math.floor(random() * S), y = Math.floor(random() * S), big = random() > 0.85; stars.set(x, y, big ? "#f2e28f" : random() > 0.5 ? "#e8e5de" : "#9fa8c2"); if (big) { stars.set(x + 1, y, "#e8e5de"); stars.set(x - 1, y, "#e8e5de"); stars.set(x, y + 1, "#e8e5de"); stars.set(x, y - 1, "#e8e5de"); } }
  save("stars.png", stars);
  const CW = 512, CH = 400, clouds = new Pixels(CW, CH), cr = rng(5);
  const cloud = (cx, cy, w, color) => { for (let i = 0; i < 7; i++) { const a = cr() * Math.PI * 2, d = cr() * 0.5; clouds.disc(cx + Math.cos(a) * w * d, cy + Math.sin(a) * w * 0.3 * d, w * (0.3 + cr() * 0.25), w * (0.12 + cr() * 0.1), color, null); } clouds.disc(cx, cy + w * 0.08, w * 0.55, w * 0.14, shadeHex(color, -0.12), null); };
  for (const [x, y, w, c] of [[70, 40, 60, "#6b6782"], [330, 95, 90, "#5e5a74"], [460, 180, 70, "#6b6782"], [150, 230, 50, "#56526a"], [500, 320, 55, "#5e5a74"], [260, 360, 75, "#605c78"]]) { cloud(x, y, w, c); if (x + w > CW) cloud(x - CW, y, w, c); if (y + w * 0.3 > CH) cloud(x, y - CH, w, c); }
  save("clouds.png", clouds);
  // The moon at the top of the page: a pale disc lit from the right, its terminator darker, a few craters.
  const M = 40, moon = new Pixels(M, M), r = 18, c = M / 2 - 0.5;
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
    if (d > r) continue;
    const lit = (dx * 0.6 - dy * 0.4) / r;
    moon.set(x, y, d > r - 1 ? "#cfc9b8" : lit > 0.25 ? "#f4efdc" : lit > -0.35 ? "#e6dfc6" : "#c9c1a8");
  }
  for (const [x, y, cr] of [[13, 14, 3], [24, 11, 2], [22, 24, 4], [11, 25, 2], [29, 19, 1.5]]) for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { const d = Math.hypot(i, j); if (d <= cr) moon.set(x + i, y + j, d > cr - 1 ? "#bdb59c" : "#d3cbb2"); }
  save("moon.png", moon);
}
// ---------- Houses and the world: a lamplit street of timber houses, trees between, hills behind ----------
{
  const W = 640, H = 220, p = new Pixels(W, H), ground = 196, random = rng(8);
  // Hills behind the roofs, two ranges.
  for (let x = 0; x < W; x++) { const h1 = 60 + Math.sin(x / 70) * 14 + Math.sin(x / 23) * 5, h2 = 36 + Math.sin(x / 50 + 2) * 12 + Math.sin(x / 17) * 4; p.rect(x, ground - h1, 1, h1, "#2a3038"); p.rect(x, ground - h2, 1, h2, "#343c42"); }
  // Trees along the back, behind the houses.
  for (const [kind, x, v] of [["oak", 10, 1], ["tree", 118, 2], ["yew", 250, 3], ["tree", 372, 4], ["oak", 470, 5], ["yew", 590, 6]]) { const t = treeArt(kind, v, false); stamp(p, t, x, ground - t.height + 2); }
  // The houses: two storeys of timber with lit windows, a shingled roof, a chimney.
  const house = (x, w, storeys, roof, plaster) => {
    const wallH = storeys * 24, top = ground - wallH, wall = wallTexture("timber_window_lit", plaster, 1), plain = wallTexture("timber", plaster, 1);
    for (let s = 0; s < storeys; s++) for (let i = 0; i < w; i += 16) tile(p, (i / 16) % 2 ? wall : plain, x + i, top + s * 24, Math.min(16, w - i), 24);
    // A door on the ground floor.
    p.rect(x + 3, ground - 11, 7, 11, "#4a3a2e"); p.rect(x + 4, ground - 10, 5, 10, "#5a4030"); p.set(x + 8, ground - 6, "#e2c46a");
    // The roof: a gable of shingles, overhanging the walls, its ridge and a chimney.
    const rise = Math.round(w * 0.38), sh = shingleTexture(roof, w + 8, rise + 2);
    for (let r = 0; r <= rise; r++) { const inset = Math.round((1 - r / rise) * (w / 2 + 4)); const y = top - rise + r; const d = new Uint32Array(sh.data.buffer); for (let i = inset; i < w + 8 - inset; i++) p.set(x - 4 + i, y, d[r * sh.width + i]); }
    p.rect(x - 4, top, w + 8, 1, shadeHex(roof, -0.3));
    p.rect(x + w - 10, top - rise + 4, 5, 10, "#5a5a60"); p.rect(x + w - 11, top - rise + 3, 7, 2, "#6a6a70");
    p.line(x - 4, top, x + w / 2, top - rise - 1, "#161616"); p.line(x + w / 2, top - rise - 1, x + w + 4, top, "#161616");
  };
  house(40, 64, 2, "#7b5c68", "#e2d7ad"); house(150, 48, 1, "#5e6b7a", "#efede7"); house(290, 80, 2, "#8a5e52", "#e8e5de"); house(420, 56, 2, "#6b7a5e", "#e2d7ad"); house(540, 64, 1, "#7b5c68", "#efede7");
  // Lamp posts between, and the street.
  for (const x of [120, 250, 395, 515]) { const lamp = decorArt("lamp", 1); if (lamp) stamp(p, lamp, x, ground - lamp.height + 1); }
  p.rect(0, ground, W, H - ground, "#3a3733"); for (let y = ground; y < H; y += 3) for (let x = (y % 6 ? 0 : 3); x < W; x += 6) p.rect(x, y, 5, 2, random() > 0.5 ? "#44403b" : "#3f3b36");
  p.rect(0, ground, W, 1, "#161616");
  save("town.png", p);
}
// ---------- The forest's edge: trees and rocks on a dark floor, for the explore section ----------
{
  const W = 640, H = 120, p = new Pixels(W, H), ground = 112, random = rng(21);
  for (let x = 0; x < W; x++) { const h = 30 + Math.sin(x / 60 + 1) * 10 + Math.sin(x / 19) * 4; p.rect(x, ground - h, 1, h, "#2a3330"); }
  const kinds = ["oak", "tree", "maple", "yew", "tree", "oak", "willow", "tree"];
  for (let i = 0; i < 14; i++) { const t = treeArt(kinds[i % kinds.length], i + 3, false), x = Math.round(i * 46 + random() * 20); stamp(p, t, x, ground - t.height + 3 + Math.round(random() * 6)); }
  for (const [x, v] of [[90, 1], [330, 2], [560, 3]]) { const r = rockArt("stone", v, false); if (r) stamp(p, r, x, ground - r.height + 2); }
  for (const [x, v] of [[200, 2], [470, 4]]) { const b = decorArt("bush", v); if (b) stamp(p, b, x, ground - b.height + 2); }
  p.rect(0, ground, W, H - ground, "#2d3a2a"); p.rect(0, ground, W, 1, "#161616");
  save("forest.png", p);
}
// ---------- The dungeon: dark stone with chains and a barred window (a tile), and a floor strip with bones and barrels ----------
{
  const W = 320, H = 192, stone = "#34333a", p = new Pixels(W, H), random = rng(13);
  tile(p, wallTexture("dungeon", stone, 3), 0, 0, W, H);
  // A barred window, high up.
  p.rect(140, 24, 34, 28, "#0c0c10"); for (let x = 146; x < 174; x += 8) p.rect(x, 24, 3, 28, "#4a4a4e"); p.rect(138, 22, 38, 2, shadeHex(stone, 0.12)); p.rect(138, 52, 38, 2, shadeHex(stone, -0.2));
  // Chains hanging from rings.
  for (const [x, len] of [[48, 70], [262, 54]]) { p.rect(x - 3, 10, 7, 3, "#5a5a60"); for (let y = 13; y < 13 + len; y += 4) { p.rect(x - 1, y, 3, 3, (y / 4) % 2 ? "#6a6a70" : "#4e4e54"); p.set(x, y + 1, "#2a2a2e"); } p.rect(x - 2, 13 + len, 5, 4, "#5a5a60"); }
  save("dungeon.png", p);
  const FH = 56, floor = 28, f = new Pixels(W, FH);
  tile(f, wallTexture("dungeon", stone, 3), 0, floor - 24, W, 24);
  f.rect(0, floor, W, FH - floor, "#26252b"); for (let y = floor; y < FH; y += 6) for (let x = (y % 12 ? 0 : 7); x < W; x += 14) { f.rect(x, y, 13, 5, shadeHex("#2b2a31", (random() - 0.5) * 0.1)); f.rect(x, y, 13, 1, "#35343b"); }
  f.rect(0, floor, W, 1, "#161616");
  for (const [kind, x, v] of [["bones", 20, 1], ["barrel", 200, 2], ["crate", 222, 1], ["bones", 290, 3], ["rubble", 100, 2], ["chest", 60, 1]]) { const a = decorArt(kind, v); if (a) stamp(f, a, x, floor - a.height + 3); }
  save("dungeon-floor.png", f);
}
