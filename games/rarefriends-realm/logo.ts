/**
 * The Realm's logo, drawn in pixels like everything else in it: a shield on a moonlit night, holding Friendhollow
 * Castle, whose keep is a Rare Friend's head (its two battlements the ears, two windows the eyes, the gate its mouth),
 * beside or under the words RAREFRIENDS REALM in the Realm's own pixel letters. The game's title screen draws it, and
 * scripts/logo.mjs writes it out as SVG and PNG for the preview site (and its favicon).
 */
type Pixels = Map<string, string>;
const PALETTE = {
  ink: "#161616", gold: "#f2e28f", goldDark: "#b8963e", night: "#232842", nightLow: "#30395e", star: "#f2e28f",
  wall: "#efede7", wallShade: "#c9c3b4", crimson: "#b8322c", hill: "#6f9a58", hillDark: "#4f7440", moon: "#efe6c8",
} as const;
const key = (x: number, y: number) => `${x},${y}`;
const put = (pixels: Pixels, x: number, y: number, color: string) => pixels.set(key(x, y), color);

/** A pixel shape's outline: every empty pixel beside a filled one (not diagonally) goes ink. */
function outline(pixels: Pixels, color: string = PALETTE.ink) {
  const add: [number, number][] = [];
  for (const k of pixels.keys()) {
    const [x, y] = k.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!pixels.has(key(x + dx, y + dy))) add.push([x + dx, y + dy]);
  }
  for (const [x, y] of add) put(pixels, x, y, color);
}

// ---------- The emblem: 32 × 32 ----------
/** The shield's width row by row: flat-topped, straight-sided, then curving to its point. */
const SHIELD_ROWS: readonly [number, number][] = [
  ...Array.from({ length: 19 }, () => [2, 29] as [number, number]),
  [2, 29], [3, 28], [3, 28], [4, 27], [5, 26], [6, 25], [7, 24], [8, 23], [10, 21], [12, 19], [14, 17],
];
function shieldMask(): Set<string> {
  const mask = new Set<string>();
  SHIELD_ROWS.forEach(([left, right], row) => { for (let x = left; x <= right; x++) mask.add(key(x, row + 1)); });
  return mask;
}
function erode(mask: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const k of mask) { const [x, y] = k.split(",").map(Number); if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => mask.has(key(x + dx, y + dy)))) out.add(k); }
  return out;
}
/** A filled shape: a list of rectangles [x, y, w, h], plus single pixels. */
type Shape = { rects: readonly (readonly [number, number, number, number])[]; dots?: readonly (readonly [number, number])[]; color: string };
/**
 * Friendhollow Castle, each part its own outlined shape so they read apart: two stone towers (one flying the crown's
 * pennant), and between them the keep, a Friend's head: two ears for battlements, two eyes for windows, a gate for a
 * mouth. Drawn back to front.
 */
const TOWERS: Shape[] = [
  { rects: [[2, 8, 3, 8], [2, 7, 1, 1], [4, 7, 1, 1]], color: PALETTE.wallShade },
  { rects: [[15, 8, 3, 8], [15, 7, 1, 1], [17, 7, 1, 1]], color: PALETTE.wallShade },
];
const KEEP: Shape = { rects: [[6, 3, 8, 13], [6, 1, 1, 2], [7, 2, 1, 1], [13, 1, 1, 2], [12, 2, 1, 1]], color: PALETTE.wall };
const KEEP_DETAIL: [number, number, string][] = [
  // Eyes (windows) and the gate (a mouth, arched).
  ...[[7, 6], [8, 6], [7, 7], [8, 7], [11, 6], [12, 6], [11, 7], [12, 7]].map(([x, y]) => [x, y, PALETTE.ink] as [number, number, string]),
  ...[[9, 12], [10, 12], [8, 13], [9, 13], [10, 13], [11, 13], [8, 14], [9, 14], [10, 14], [11, 14], [8, 15], [9, 15], [10, 15], [11, 15]].map(([x, y]) => [x, y, PALETTE.ink] as [number, number, string]),
  // The towers' arrow slits, and the pennant on the left tower.
  [3, 10, PALETTE.ink], [3, 11, PALETTE.ink], [16, 10, PALETTE.ink], [16, 11, PALETTE.ink],
  [3, 3, PALETTE.goldDark], [3, 4, PALETTE.goldDark], [3, 5, PALETTE.goldDark], [3, 6, PALETTE.goldDark], [2, 3, PALETTE.crimson], [1, 3, PALETTE.crimson], [2, 4, PALETTE.crimson],
];
function shapePixels(shape: Shape): Pixels {
  const pixels: Pixels = new Map();
  for (const [x, y, w, h] of shape.rects) for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) put(pixels, x + dx, y + dy, shape.color);
  for (const [x, y] of shape.dots ?? []) put(pixels, x, y, shape.color);
  outline(pixels);
  return pixels;
}
function emblem(): Pixels {
  const pixels: Pixels = new Map(), m0 = shieldMask(), m1 = erode(m0), m2 = erode(m1), m3 = erode(m2), m4 = erode(m3);
  for (const k of m0) pixels.set(k, PALETTE.ink);
  for (const k of m1) pixels.set(k, PALETTE.gold);
  for (const k of m2) pixels.set(k, PALETTE.gold);
  for (const k of m3) pixels.set(k, PALETTE.ink);
  // The night inside, lighter towards the horizon, with its stars and a crescent moon.
  for (const k of m4) { const y = Number(k.split(",")[1]); pixels.set(k, y >= 17 ? PALETTE.nightLow : PALETTE.night); }
  const inside = (x: number, y: number) => m4.has(key(x, y));
  for (const [x, y] of [[7, 6], [11, 5], [20, 8], [8, 11], [25, 13], [14, 7]]) if (inside(x, y)) put(pixels, x, y, PALETTE.star);
  for (const [x, y] of [[22, 5], [23, 5], [24, 6], [24, 7], [24, 8], [23, 9], [22, 9], [21, 6], [21, 7], [21, 8], [22, 6], [22, 7], [22, 8], [23, 6], [23, 7], [23, 8]])
    if (inside(x, y)) put(pixels, x, y, PALETTE.moon);
  for (const [x, y] of [[22, 6], [22, 7], [22, 8], [23, 7]]) put(pixels, x, y, PALETTE.night); // the moon's shadow side: a crescent
  // The castle, standing on its hill: towers, then the keep over them, then the windows, gate and pennant.
  const ox = 6, oy = 6, castle: Pixels = new Map();
  for (const shape of [...TOWERS, KEEP]) for (const [k, color] of shapePixels(shape)) castle.set(k, color);
  for (const [x, y, color] of KEEP_DETAIL) put(castle, x, y, color);
  for (const [k, color] of castle) { const [x, y] = k.split(",").map(Number); if (inside(x + ox, y + oy)) put(pixels, x + ox, y + oy, color); }
  for (const k of m4) {
    const [x, y] = k.split(",").map(Number), ground = 22 + Math.round(Math.abs(x - 15.5) / 5);
    if (y >= ground) pixels.set(k, y === ground ? PALETTE.hill : PALETTE.hillDark);
  }
  return pixels;
}

// ---------- The words ----------
const BIG: Record<string, readonly string[]> = {
  R: ["#####.", "##..##", "##..##", "#####.", "##.##.", "##..##", "##..##"],
  E: ["######", "##....", "##....", "#####.", "##....", "##....", "######"],
  A: [".####.", "##..##", "##..##", "######", "##..##", "##..##", "##..##"],
  L: ["##....", "##....", "##....", "##....", "##....", "##....", "######"],
  M: ["##...##", "###.###", "#######", "##.#.##", "##...##", "##...##", "##...##"],
};
const SMALL: Record<string, readonly string[]> = {
  R: ["##.", "#.#", "##.", "#.#", "#.#"], A: [".#.", "#.#", "###", "#.#", "#.#"], E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."], I: ["###", ".#.", ".#.", ".#.", "###"], N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
  D: ["##.", "#.#", "#.#", "#.#", "##."], S: [".##", "#..", ".#.", "..#", "##."],
};
/** Lay out a word in a pixel font at (x, y), each font pixel `scale` pixels square, `gap` columns between letters. */
function word(pixels: Pixels, text: string, font: Record<string, readonly string[]>, x: number, y: number, scale: number, gap: number, color: string): number {
  for (const letter of text) {
    const glyph = font[letter];
    glyph.forEach((row, gy) => [...row].forEach((cell, gx) => {
      if (cell === "#") for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) put(pixels, x + gx * scale + sx, y + gy * scale + sy, color);
    }));
    x += (glyph[0].length + gap) * scale;
  }
  return x;
}
const wordWidth = (text: string, font: Record<string, readonly string[]>, scale: number, gap: number) =>
  [...text].reduce((sum, letter) => sum + (font[letter][0].length + gap) * scale, 0) - gap * scale;
/** RAREFRIENDS over REALM, gold with an ink outline and a drop shadow, its left edge at x. */
function words(pixels: Pixels, x: number, y: number, centre?: number) {
  const smallW = wordWidth("RAREFRIENDS", SMALL, 1, 2), bigW = wordWidth("REALM", BIG, 2, 1), width = Math.max(smallW, bigW);
  const sx = centre !== undefined ? Math.round(centre - smallW / 2) : x + Math.round((width - smallW) / 2);
  const bx = centre !== undefined ? Math.round(centre - bigW / 2) : x + Math.round((width - bigW) / 2);
  const small: Pixels = new Map(), big: Pixels = new Map();
  word(small, "RAREFRIENDS", SMALL, sx, y, 1, 2, PALETTE.wall);
  word(big, "REALM", BIG, bx, y + 8, 2, 1, PALETTE.gold);
  // The drop shadow first (one pixel down and right of the outline), then the outline, then the letters.
  for (const layer of [small, big]) {
    const outlined: Pixels = new Map(layer); outline(outlined);
    for (const [k] of outlined) { const [px, py] = k.split(",").map(Number); if (!pixels.has(key(px + 1, py + 1))) put(pixels, px + 1, py + 1, PALETTE.ink); }
    for (const [k, color] of outlined) pixels.set(k, color);
  }
  // A gold-dark lower half on the big letters, like the game's coin glint.
  for (const [k, color] of big) { const py = Number(k.split(",")[1]); if (color === PALETTE.gold && py >= y + 8 + 8) pixels.set(k, PALETTE.goldDark); }
  return width;
}

export type LogoKind = "emblem" | "horizontal" | "stacked";
/** The logo's pixels, positioned from (0, 0), with its size. */
export function logoPixels(kind: LogoKind): { pixels: Pixels; width: number; height: number } {
  const pixels = emblem();
  if (kind === "emblem") return { pixels, width: 32, height: 32 };
  if (kind === "horizontal") { const width = words(pixels, 38, 6); return { pixels, width: 38 + width + 2, height: 32 }; }
  const moved: Pixels = new Map(), w = 80;
  for (const [k, color] of pixels) { const [x, y] = k.split(",").map(Number); moved.set(key(x + (w - 32) / 2, y), color); }
  words(moved, 0, 36, w / 2);
  return { pixels: moved, width: w, height: 36 + 8 + 14 + 3 };
}
/** The logo as an SVG document, each logo pixel `scale` units square: one path per colour, its runs merged. */
export function logoSvg(kind: LogoKind, scale = 1, title = "RareFriends Realm"): string {
  const { pixels, width, height } = logoPixels(kind), runs = new Map<string, string[]>();
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      const color = pixels.get(key(x, y));
      if (!color) { x++; continue; }
      let end = x + 1; while (end < width && pixels.get(key(end, y)) === color) end++;
      (runs.get(color) ?? runs.set(color, []).get(color)!).push(`M${x} ${y}h${end - x}v1h-${end - x}z`); x = end;
    }
  }
  const paths = [...runs].map(([color, d]) => `<path fill="${color}" d="${d.join("")}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * scale}" height="${height * scale}" shape-rendering="crispEdges" role="img" aria-label="${title}"><title>${title}</title>${paths}</svg>`;
}
