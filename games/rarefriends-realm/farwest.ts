/**
 * Return of Raria: the far west, a second continent west of everything the Realm knew, built in world coordinates in
 * the WEST_DX columns the world grew by (see world.ts).
 *
 * The Kingdom of Raria fills its north and middle: the walled capital round the palace in its exact centre, the
 * Crownlands' farms and lake town, the Vesperwold's dark hills with the Order of Dusk's abbey and the Royal Rangers'
 * hold, the Silent Peaks in the north-west with their blindfolded watchers, and the Crown Road east across it all to
 * Lawgate on the eastern march by the Drakespine. BarkReach's great wood fills the south, the Heartwood at its oldest
 * west end. Between them lie the Greyfields, where the Regiment's Fort Ordinance and the Federation's forward camp face
 * each other across a battlefield, and the roads east to Deep Westmarch and the Free Marches.
 */
import { FLOOR_Y, OVERWORLD_H, T, WEST_DX, isWater, regionIndex, type DecorKind, type Floor, type GenContext, type RegionId, type World, type worldTools } from "./world.ts";
import type { RockKind, TreeKind } from "./data.ts";

type Tools = ReturnType<typeof worldTools>;
type Pt = readonly [number, number];
function mulberry(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeNoise(seed: number, scale: number) {
  const r = mulberry(seed), size = 64, grid = Array.from({ length: size * size }, () => r());
  const at = (x: number, y: number) => grid[((y % size + size) % size) * size + ((x % size + size) % size)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}
/** The capital's centre, its walls, and the far west's towns (world coordinates). */
export const RARIA_CITY = { x: 205, y: 190, x0: 145, y0: 128, x1: 265, y1: 252 } as const;
export const FAR_PLACES = {
  vesperholm: [130, 74], rangers_hold: [282, 70], candlemere: [338, 170], greyford: [214, 300], fort_ordinance: [322, 318], freecamp: [392, 352], battlefield: [262, 328],
  sawyers_rest: [230, 405], antler_lodge: [128, 380], stags_rest: [302, 455], woods_end: [388, 420], barkholm: [96, 452], hidden_glade: [56, 404], blind_shrine: [44, 58], elder: [52, 446],
} as const;

export function buildFarWest(ctx: GenContext, t: Tools, places: World["places"], floors: Floor[]) {
  const { get, put, add, decor, npc, building, clearAt, fillRect, monsters, monster, tree, rock, scatter, inBounds, tileIndex, shoreSpots, road, river } = t;
  const OH = OVERWORLD_H, X1 = WEST_DX + 90, W = ctx.W, random = ctx.random;
  const n1 = makeNoise(7001, 26), n2 = makeNoise(7002, 9), n3 = makeNoise(7003, 4), rn = makeNoise(7004, 16);
  const ridge = (x: number, y: number) => 1 - Math.abs(rn(x, y) * 2 - 1);
  const occupied = (x: number, y: number) => ctx.objectAt[tileIndex(x, y)] >= 0 || ctx.spawns.some(spawn => spawn.x === x && spawn.y === y);
  const walkable = (tt: number) => tt === T.GRASS || tt === T.DARK_GRASS || tt === T.PATH || tt === T.COBBLE || tt === T.SAND || tt === T.STONE || tt === T.WOOD || tt === T.GRAVEL || tt === T.FARMLAND || tt === T.SNOW || tt === T.BRIDGE || tt === T.CARPET || tt === T.SWAMP;
  const nearFree = (x: number, y: number, limit = 8): [number, number] => {
    for (let r = 0; r <= limit; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy; if (!inBounds(nx, ny)) continue;
      if (walkable(get(nx, ny)) && !occupied(nx, ny)) return [nx, ny];
    }
    return [x, y];
  };
  const put2 = (x: number, y: number, kind: DecorKind, name?: string, blocks = true) => { const [dx, dy] = nearFree(x, y, 3); decor(dx, dy, kind, blocks, name); };
  const npcAt = (id: string, x: number, y: number, wander = 0) => { const [nx, ny] = nearFree(x, y, 4); npc(id, nx, ny, wander); };
  const monsterAt = (id: string, x: number, y: number, wander?: number) => { const [nx, ny] = nearFree(x, y, 4); monster(id, nx, ny, wander); };
  const sign = (x: number, y: number, label: string, text: string, icon?: string) => { const [sx, sy] = nearFree(x, y, 3); add({ kind: "sign", x: sx, y: sy, blocks: true, name: label, text, icon }); };
  const ground = (cx: number, cy: number, rx: number, ry: number, paving: number | null, square = 0) => {
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      if (!inBounds(x, y)) continue;
      clearAt(x, y);
      const tt = get(x, y);
      if (tt === T.CLIFF || tt === T.SWAMP || tt === T.VOID || tt === T.SNOW || isWater(tt) || tt === T.WALL) put(x, y, T.GRASS);
      for (let i = ctx.spawns.length - 1; i >= 0; i--) if (ctx.spawns[i].x === x && ctx.spawns[i].y === y) ctx.spawns.splice(i, 1);
    }
    if (paving !== null && square > 0) fillRect(cx - square, cy - Math.ceil(square * 0.75), cx + square, cy + Math.ceil(square * 0.75), paving);
  };
  const palisade = (x0: number, y0: number, x1: number, y1: number, gap: "n" | "s" | "e" | "w", name = "Stake wall") => {
    const gx = Math.floor((x0 + x1) / 2), gy = Math.floor((y0 + y1) / 2);
    for (let x = x0; x <= x1; x += 2) { if (!(gap === "n" && Math.abs(x - gx) <= 1)) put2(x, y0, "stake", name); if (!(gap === "s" && Math.abs(x - gx) <= 1)) put2(x, y1, "stake", name); }
    for (let y = y0 + 2; y < y1; y += 2) { if (!(gap === "w" && Math.abs(y - gy) <= 1)) put2(x0, y, "stake", name); if (!(gap === "e" && Math.abs(y - gy) <= 1)) put2(x1, y, "stake", name); }
  };

  // ---------- 1. Land: a continent west of the old west coast, joined to Deep Westmarch, the Free Marches and Lawgate ----------
  const land = new Uint8Array(X1 * OH), was = new Uint8Array(X1 * OH);
  for (let y = 0; y < OH; y++) for (let x = 0; x < X1; x++) { const tt = get(x, y); if (!isWater(tt) && tt !== T.VOID) { land[y * X1 + x] = 1; was[y * X1 + x] = 1; } }
  const landBlob = (cx: number, cy: number, rx: number, ry: number, wobble = 0.5) => {
    for (let y = Math.max(0, Math.floor(cy - ry * 1.5)); y <= Math.min(OH - 1, cy + ry * 1.5); y++) for (let x = Math.max(0, Math.floor(cx - rx * 1.5)); x <= Math.min(X1 - 1, cx + rx * 1.5); x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2, edge = 1 + (n1(x, y) - 0.5) * wobble * 2 + (n3(x, y) - 0.5) * 0.3;
      if (d <= edge) land[y * X1 + x] = 1;
    }
  };
  const seaBlob = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.max(0, Math.floor(cy - ry * 1.3)); y <= Math.min(OH - 1, cy + ry * 1.3); y++) for (let x = Math.max(0, Math.floor(cx - rx * 1.3)); x <= Math.min(X1 - 1, cx + rx * 1.3); x++) {
      if (was[y * X1 + x]) continue;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 + (n2(x, y) - 0.5) * 0.5) land[y * X1 + x] = 0;
    }
  };
  // Raria's heartland, its north, the Silent Peaks, the Greyfields, BarkReach and the Heartwood, and the necks east.
  landBlob(205, 190, 190, 120, 0.4); landBlob(170, 80, 150, 60, 0.5); landBlob(60, 80, 60, 60, 0.5); landBlob(300, 320, 150, 45, 0.4);
  landBlob(200, 420, 190, 80, 0.45); landBlob(70, 430, 60, 60, 0.5); landBlob(330, 110, 90, 50, 0.5);
  landBlob(420, 214, 40, 50, 0.35); landBlob(425, 300, 40, 30, 0.35); landBlob(420, 395, 45, 45, 0.35);
  // Bays: the west coast's inlets, the Gulf of Hush between the peaks and the wood, a north bay.
  seaBlob(6, 250, 30, 40); seaBlob(14, 340, 24, 20); seaBlob(250, 6, 60, 20); seaBlob(400, 60, 40, 30); seaBlob(330, 505, 50, 20); seaBlob(420, 470, 30, 30);
  const toSea = new Uint8Array(X1 * OH).fill(255), toLand = new Uint8Array(X1 * OH).fill(255);
  const sweep = (from: Uint8Array, isSource: (i: number) => boolean, limit: number) => {
    const queue: number[] = [];
    for (let i = 0; i < X1 * OH; i++) if (isSource(i)) { from[i] = 0; queue.push(i); }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head], d = from[i]; if (d >= limit) continue;
      const x = i % X1, y = (i - x) / X1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= X1 || ny >= OH) continue;
        const j = ny * X1 + nx; if (from[j] > d + 1) { from[j] = d + 1; queue.push(j); }
      }
    }
  };
  sweep(toSea, i => !land[i], 6); sweep(toLand, i => !!land[i], 5);
  const fresh = (x: number, y: number) => x < X1 && y < OH && !was[y * X1 + x] && !!land[y * X1 + x];
  for (let y = 0; y < OH; y++) for (let x = 0; x < X1; x++) {
    const i = y * X1 + x;
    if (was[i]) continue;
    if (land[i]) put(x, y, toSea[i] <= 1 ? T.SAND : n3(x, y) > 0.62 ? T.DARK_GRASS : T.GRASS);
    else put(x, y, toLand[i] <= 3 ? T.WATER : T.DEEP);
  }

  // ---------- 2. Regions ----------
  const zone = (x: number, y: number): RegionId => {
    const wx = x + (n2(x, y) - 0.5) * 22, wy = y + (n2(y + 300, x) - 0.5) * 22;
    if (wy < 140 && wx < 120) return "silent_peaks";
    if (wy < 128) return "vesperwold";
    if (((wx - RARIA_CITY.x) / 112) ** 2 + ((wy - RARIA_CITY.y) / 82) ** 2 <= 1) return "raria";
    if (wy >= 285 && wy < 352) return "greyfields";
    if (wy >= 352) return wx < 140 ? "heartwood" : "barkreach";
    if (wx > 300) return "crownlands";
    return wx < 110 ? "silent_peaks" : "raria";
  };
  const regionIs = (x: number, y: number, id: RegionId) => ctx.region[tileIndex(x, y)] === regionIndex(id);
  for (let y = 0; y < OH; y++) for (let x = 0; x < X1; x++) {
    const i = y * X1 + x;
    if (was[i]) continue;
    t.setRegion(x, y, land[i] ? zone(x, y) : "coast");
  }
  // The sea between the continent and the old west coast takes the nearest land's region for its shallows' music: leave it coast.

  // ---------- 3. Terrain: mountains, dark hills, farms, battle-scarred fields, deep wood ----------
  const lift = ctx.lift;
  for (let y = 0; y < OH; y++) for (let x = 0; x < X1; x++) {
    if (!fresh(x, y)) continue;
    const tt = get(x, y); if (tt === T.SAND) continue;
    const m = ridge(x * 0.9, y * 0.9), n = n3(x, y), i = tileIndex(x, y);
    if (regionIs(x, y, "silent_peaks")) {
      const high = Math.max(0, m - 0.32) * 4 * Math.min(1, Math.hypot(x - 60, y - 80) < 70 ? 1 : 0.6);
      lift[i] = high;
      if (m > 0.82) put(x, y, T.SNOW); else if (m > 0.7 && n > 0.35) put(x, y, T.CLIFF); else if (m > 0.52) put(x, y, T.GRAVEL);
    } else if (regionIs(x, y, "vesperwold")) {
      lift[i] = Math.max(0, m - 0.45) * 1.8;
      if (m > 0.86 && n > 0.5) put(x, y, T.CLIFF); else if (n1(x * 1.3, y * 1.3) < 0.28) put(x, y, T.SWAMP); else if (n > 0.4) put(x, y, T.DARK_GRASS);
    } else if (regionIs(x, y, "crownlands")) {
      if (n1(x * 2, y * 2) > 0.62 && n2(x, y) > 0.4) put(x, y, T.FARMLAND); else if (n > 0.7) put(x, y, T.DARK_GRASS);
    } else if (regionIs(x, y, "raria")) {
      if (n1(x * 2.2, y * 2.2) > 0.66) put(x, y, T.FARMLAND);
    } else if (regionIs(x, y, "greyfields")) {
      if (n > 0.72) put(x, y, T.GRAVEL); else if (n1(x * 1.6, y * 1.6) < 0.25) put(x, y, T.SWAMP); else if (n2(x, y) > 0.55) put(x, y, T.DARK_GRASS);
      lift[i] = Math.max(0, m - 0.6) * 1.2;
    } else if (regionIs(x, y, "barkreach") || regionIs(x, y, "heartwood")) {
      if (n > 0.3) put(x, y, T.DARK_GRASS);
      lift[i] = Math.max(0, m - 0.62) * 1.4;
    }
  }
  // Water: the Vesper from the Silent Peaks past the capital's west wall and down through BarkReach to the sea; the Hush, a
  // stream through the Heartwood; Candlemere's lake; tarns in the peaks.
  river([[112, 46], [128, 92], [138, 128], [134, 170], [136, 214], [150, 256], [176, 300], [186, 350], [176, 410], [164, 460], [160, 500]], 3);
  river([[30, 380], [52, 420], [84, 460], [92, 496]], 2.2);
  river([[372, 128], [356, 150]], 2);
  t.blob(338, 148, 16, 10, T.WATER, 0.3, tt => !isWater(tt) && tt !== T.VOID); t.blob(338, 148, 9, 5, T.DEEP, 0.2, tt => tt === T.WATER);
  t.blob(70, 110, 7, 5, T.WATER, 0.3, tt => !isWater(tt) && tt !== T.VOID);

  // ---------- 4. Roads ----------
  const [cx, cy] = [RARIA_CITY.x, RARIA_CITY.y];
  road([[452, 214], [420, 212], [390, 206], [350, 196], [300, 191], [268, 190]]);                                      // the Crown Road, Lawgate to the east gate
  road([[205, 254], [208, 276], [214, 300], [222, 340], [230, 380], [230, 402]]);                                        // the South Road, to Greyford and on into BarkReach
  road([[214, 300], [260, 312], [318, 316], [370, 312], [420, 304], [470, 300], [492, 296]], 2.4);                       // the Greyfields road east to Deep Westmarch
  road([[230, 410], [190, 420], [150, 436], [110, 450], [98, 452]], 2.2, T.GRAVEL);                                      // the wood road west to Barkholm
  road([[200, 410], [170, 394], [140, 384], [130, 382]], 2.2, T.GRAVEL);                                                  // to the Antler Lodge
  road([[236, 412], [270, 440], [302, 452], [340, 440], [388, 420], [430, 400], [462, 384], [478, 380]], 2.2, T.GRAVEL);  // east through BarkReach to the Federation's road
  road([[205, 126], [190, 108], [160, 90], [132, 80]]);                                                                   // the North Road to Vesperholm
  road([[160, 90], [210, 76], [250, 72], [280, 72]], 2.2, T.GRAVEL);                                                      // the Rangers' track
  road([[132, 80], [100, 74], [70, 66], [48, 60]], 2, T.GRAVEL);                                                          // the pilgrims' track into the Silent Peaks
  road([[330, 194], [336, 180], [338, 172]], 2.2);                                                                        // to Candlemere
  road([[143, 190], [120, 196], [96, 210], [70, 236], [44, 254]], 2.2, T.GRAVEL);
  { const [bx, by] = FAR_PLACES.barkholm; road([[bx - 2, by + 8], [bx - 9, by + 10], [bx - 26, by + 10]], 2.2, T.GRAVEL); }      // Barkholm's lane west over the Hush, on a plank bridge                                         // the West Road to the coast
  road([[300, 191], [312, 240], [320, 290], [322, 312]], 2.2, T.GRAVEL);                                                  // the Muster Road, the Crownlands to Fort Ordinance

  // ---------- 5. The city of Raria: walls, gates, the palace in the exact centre, and every office of the Law round it ----------
  {
    const { x0, y0, x1, y1 } = RARIA_CITY;
    /** The roofs of Raria: dusk violet, slate, plum, lavender, blue slate and violet-grey, so a street isn't one dark slab. */
    const ROOFS = ["#5b4a78", "#6e6a82", "#7d5a6e", "#8c7aa6", "#4a5468", "#6a5a8a"] as const;
    ground(cx, cy, (x1 - x0) / 2 + 3, (y1 - y0) / 2 + 3, null);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { put(x, y, x === x0 || x === x1 || y === y0 || y === y1 ? T.WALL : T.COBBLE); lift[tileIndex(x, y)] = 0; }
    for (let d = -1; d <= 1; d++) { put(cx + d, y0, T.COBBLE); put(cx + d, y1, T.COBBLE); put(x0, cy + d, T.COBBLE); put(x1, cy + d, T.COBBLE); }
    // The wall itself stands three storeys high, battlemented; its towers rise well above it.
    const RAMPART = 3;
    ctx.ramparts?.push({ x0, y0, x1, y1, storeys: RAMPART });
    // Towers on the wall: corner and mid-wall turrets (round, cone-roofed), the wall itself running between.
    for (const [tx, ty] of [[x0, y0], [x1 - 4, y0], [x0, y1 - 4], [x1 - 4, y1 - 4], [cx - 30, y0], [cx + 26, y0], [cx - 30, y1 - 4], [cx + 26, y1 - 4]] as const)
      building(tx, ty, tx + 4, ty + 4, "s", T.STONE, undefined, { name: "A tower of Raria's wall", color: "#3b2a52", walls: "stone", roof: "cone", round: true, tall: RAMPART * 42 + 70, spire: 50 });
    // Gatehouses: a taller round tower either side of each of the four gates, standing out from the wall.
    const gateTower = (tx: number, ty: number, door: "n" | "s" | "e" | "w") => building(tx, ty, tx + 4, ty + 4, door, T.STONE, undefined, { name: "A gatehouse tower", color: "#5b4a78", walls: "stone", roof: "cone", round: true, tall: RAMPART * 42 + 110, spire: 60 });
    for (const tx of [cx - 7, cx + 3]) { gateTower(tx, y0 - 1, "s"); gateTower(tx, y1 - 3, "n"); }
    for (const ty of [cy - 7, cy + 3]) { gateTower(x0 - 1, ty, "e"); gateTower(x1 - 3, ty, "w"); }
    // The palace gardens round the palace: clipped grass, hedges, flowers, four statues of the Wise Friend, a fountain.
    for (let y = cy - 20; y <= cy + 18; y++) for (let x = cx - 25; x <= cx + 25; x++) { const edge = Math.min(x - (cx - 25), cx + 25 - x, y - (cy - 20), cy + 18 - y); put(x, y, edge === 0 ? T.STONE : edge <= 2 ? T.COBBLE : edge === 3 ? T.GRAVEL : T.DARK_GRASS); }
    for (let x = cx - 22; x <= cx + 22; x += 3) { if (Math.abs(x - cx) > 2) { put2(x, cy - 17, "bush", "A hedge, clipped to the inch"); put2(x, cy + 15, "bush", "A hedge, clipped to the inch"); } }
    for (const [dx, dy] of [[-20, -14], [20, -14], [-20, 12], [20, 12]] as const) decor(cx + dx, cy + dy, "wise_friend", true, "The Wise Friend in the palace gardens: ivory, blindfolded, the book open. Citizens bow to it on their way to anything.");
    for (const [dx, dy] of [[-16, -6], [16, -6], [-16, 6], [16, 6], [-8, 14], [8, 14], [-8, -15], [8, -15]] as const) decor(cx + dx, cy + dy, "flowers", false, "A garden bed: violet and white, and nothing else");
    add({ kind: "fountain", x: cx, y: cy + 13, blocks: true, name: "The Fountain of the Law" });
    // The avenue to the palace door: four tiles wide, centred on the door.
    for (let y = cy + 8; y <= cy + 18; y++) for (const dx of [-1, 0, 1, 2]) if (get(cx + dx, y) !== T.STONE || y > cy + 16) put(cx + dx, y, T.COBBLE);
    // The parterre: clipped yews in pairs down the avenue, beds of violet and white either side, hedges round the beds,
    // trees on the flanks, and a gravel walk round the palace.
    const garden = (x: number, y: number, place: () => void) => { if (!occupied(x, y) && get(x, y) !== T.WALL && get(x, y) !== T.COBBLE) place(); };
    for (const dy of [10, 16]) for (const dx of [-3, 3]) garden(cx + dx, cy + dy, () => tree(cx + dx, cy + dy, "yew"));
    for (let y = cy + 10; y <= cy + 16; y++) for (const side of [-1, 1]) for (let k = 6; k <= 12; k++) { const x = cx + side * k; if (y === cy + 10 || y === cy + 16 || k === 6 || k === 12) garden(x, y, () => decor(x, y, "bush", true, "A hedge, clipped to the inch")); else if ((x + y) % 2 === 0) garden(x, y, () => decor(x, y, "flowers", false, "A garden bed: violet and white, and nothing else")); }
    for (let x = cx - 22; x <= cx + 22; x += 4) if (Math.abs(x - cx) > 3) garden(x, cy - 19, () => tree(x, cy - 19, "yew"));
    for (const side of [-1, 1]) for (const dy of [-8, -2, 4]) { const x = cx + side * 21; garden(x, cy + dy, () => tree(x, cy + dy, dy === -2 ? "maple" : "yew")); }
    for (let y = cy - 12; y <= cy + 8; y++) for (const x of [cx - 17, cx + 17]) if (get(x, y) === T.DARK_GRASS && !occupied(x, y)) put(x, y, T.GRAVEL);
    // The palace: five storeys under a spire, the throne room on the ground floor, four more floors up the stairs, round
    // towers at the corners taller still, every one with its own spire.
    const PX0 = cx - 12, PY0 = cy - 11, PX1 = cx + 12, PY1 = cy + 7, PALACE = "raria_palace", LEVELS = 4;
    building(PX0, PY0, PX1, PY1, "s", T.CARPET, undefined, { name: "The Palace of Raria", color: "#3b2a52", walls: "stone", roof: "cone", storeys: LEVELS + 1, spire: 64, keep: { size: 5, storeys: 4, spire: 360 }, complex: PALACE, facade: "civic" });
    for (const dx of [-1, 2]) { put(cx + dx, PY1, T.CARPET); ctx.doorways.push([cx + dx, PY1]); }
    for (const [tx, ty] of [[cx - 15, cy - 13], [cx + 12, cy - 13], [cx - 15, cy + 5], [cx + 12, cy + 5]] as const) building(tx, ty, tx + 3, ty + 3, "s", T.STONE, undefined, { name: "A tower of the palace", color: "#2a2238", walls: "stone", roof: "cone", round: true, tall: (LEVELS + 1) * 42 + 90, spire: 90 });
    // The upper floors, stored in the storey rows like the castle's: two side by side, two rows down.
    const PALACE_FLOORS: Floor[] = Array.from({ length: LEVELS }, (_, i) => ({ complex: PALACE, level: i + 1, x0: PX0, y0: PY0, x1: PX1, y1: PY1, dx: 2 + (i % 2) * 28 - PX0, dy: FLOOR_Y + 1 + Math.floor(i / 2) * 20 - PY0 }));
    floors.push(...PALACE_FLOORS);
    const pAt = (level: number, col: number, row: number) => ({ x: PX0 + col + (level ? PALACE_FLOORS[level - 1].dx : 0), y: PY0 + row + (level ? PALACE_FLOORS[level - 1].dy : 0) });
    for (let level = 1; level <= LEVELS; level++) for (let row = 0; row <= PY1 - PY0; row++) for (let col = 0; col <= PX1 - PX0; col++) {
      const { x, y } = pAt(level, col, row), edge = col === 0 || row === 0 || col === PX1 - PX0 || row === PY1 - PY0;
      put(x, y, edge ? T.WALL : level === LEVELS ? T.STONE : T.CARPET); t.setRegion(x, y, "raria");
    }
    // Stairs between floors, alternating corners up the palace: north-east from the throne room, then north-west, and so on.
    const corner = (level: number) => level % 2 === 0 ? PX1 - PX0 - 1 : 1, inward = (col: number) => col === 1 ? 2 : col - 1;
    for (let level = 0; level < LEVELS; level++) {
      const col = corner(level);
      add({ kind: "ladder", look: "stairs", ...pAt(level, col, 1), blocks: true, name: "Palace staircase", action: "Climb-up", to: pAt(level + 1, inward(col), 2) });
      add({ kind: "ladder", look: "stairs", ...pAt(level + 1, col, 1), blocks: true, name: "Palace staircase", action: "Climb-down", to: pAt(level, inward(col), 2) });
    }
    const up = (level: number, col: number, row: number, kind: DecorKind, name?: string, blocks = true) => { const p = pAt(level, col, row); decor(p.x, p.y, kind, blocks, name); };
    // The first floor: the Council Chamber, the long table where the Crown's ministers sit, and the war map.
    for (let col = 6; col <= 18; col += 2) up(1, col, 9, "table", "The council table, every place set with a copy of the Law");
    for (let col = 6; col <= 18; col += 2) { up(1, col, 8, "bench", "A minister's seat"); up(1, col, 10, "bench", "A minister's seat"); }
    up(1, 12, 4, "throne", "The Queen's chair at the head of the council"); up(1, 3, 15, "table", "The war map: Raria, the Greyfields, and the Federation's camps in red"); up(1, 21, 15, "shelf", "Ledgers of the Crown, bound in violet");
    for (const col of [4, 20]) { up(1, col, 3, "banner_rrr"); up(1, col, 17, "banner_rrr"); } for (const col of [8, 16]) up(1, col, 14, "lamp");
    // The second floor: the Library of the Law, shelf after shelf of it.
    for (let row = 4; row <= 14; row += 5) for (let col = 4; col <= 20; col += 2) if (col !== 12) up(2, col, row, "shelf", row === 9 ? "The Law, annotated by every Keeper before the Queen" : "The Law, in every edition the Crown has allowed");
    up(2, 12, 9, "table", "A reading desk, the Law open at the First Law"); up(2, 12, 15, "lamp"); up(2, 3, 16, "chest", "The Library's locked case");
    // The third floor: the Queen's chapel, the Wise Friend over a carpet of violet, and the Order of Dusk's watch.
    up(3, 12, 2, "wise_friend", "The Wise Friend in the Queen's own chapel: silver, blindfolded, the book open at a page nobody else may read");
    for (let row = 6; row <= 14; row += 2) { up(3, 9, row, "bench", "A pew of the Queen's chapel"); up(3, 15, row, "bench", "A pew of the Queen's chapel"); }
    for (const col of [6, 18]) { up(3, col, 3, "torch"); up(3, col, 15, "torch"); } up(3, 4, 9, "banner_dusk"); up(3, 20, 9, "banner_dusk");
    // The top floor, under the spire: the Crown's gallery, the regalia under guard, and the city laid out below the windows.
    up(4, 12, 9, "chest", "The regalia of Raria: the crown, the closed eye in gold, the Keeper's book. Under guard. Always."); up(4, 12, 7, "throne", "The Crown's seat under the spire, where the Queen sits to look over Raria");
    for (const [col, row] of [[6, 4], [18, 4], [6, 14], [18, 14]] as const) up(4, col, row, "pillar", "A pillar of the gallery, rising into the spire");
    for (const col of [3, 21]) up(4, col, 9, "banner_rrr"); up(4, 9, 15, "statue", "A Queen of Raria before Rara, in white stone"); up(4, 15, 15, "statue", "A Queen of Raria before that one, in white stone");
    for (const [level, col, row] of [[1, 3, 4], [2, 21, 13], [3, 21, 13], [4, 4, 4], [4, 20, 14]] as const) { const p = pAt(level, col, row); monster("royal_ranger", p.x, p.y, 0); }
    decor(cx, cy - 10, "throne", true, "The Throne of Raria: dusk violet, silver, and a closed eye above it"); npc("queen_rara", cx, cy - 8); npc("king_pell", cx + 2, cy - 8);
    for (const dx of [-9, -5, 5, 9]) for (const dy of [-7, -2, 3]) decor(cx + dx, cy + dy, "pillar", true, "A pillar of the palace, the Law carved up it line by line");
    for (const dx of [-10, 10]) { decor(cx + dx, cy - 10, "banner_rrr"); decor(cx + dx, cy + 6, "banner_rrr"); }
    decor(cx - 8, cy - 9, "wise_friend", true, "The Wise Friend, in the palace: the Queen's own"); decor(cx + 8, cy - 9, "shelf", true, "The Ledger of Names, every volume, in a case that is locked");
    decor(cx - 3, cy - 5, "lamp"); decor(cx + 3, cy - 5, "lamp"); decor(cx - 3, cy + 1, "lamp"); decor(cx + 3, cy + 1, "lamp");
    monster("royal_ranger", cx - 9, cy - 8, 0); monster("royal_ranger", cx + 9, cy + 1, 0); monster("royal_ranger", cx - 9, cy + 5, 0); npc("rrr_soldier", cx - 2, cy + 5, 1); npc("rrr_soldier", cx + 2, cy + 5, 1);
    // North: the Chapel of the Law (a cathedral, with the Wise Friend's altar), the Hall of the Order of Dusk, the Office of Conduct and the Office of Sigils.
    // (Raria's halls of the Law are built to be seen: marble, three storeys and more, columns and a pediment on the front,
    // domes and spires over them.)
    building(x0 + 5, y0 + 6, x0 + 27, y0 + 22, "s", T.STONE, undefined, { name: "The Chapel of the Law", color: "#d8cfb4", walls: "marble", roof: "gable", storeys: 3, tall: 12, facade: "civic" });
    building(x0 + 13, y0 + 3, x0 + 18, y0 + 8, "s", T.STONE, undefined, { name: "The Chapel's spire", color: "#d8cfb4", walls: "marble", roof: "cone", storeys: 4, tall: 30, spire: 150 });
    add({ kind: "altar", x: x0 + 16, y: y0 + 10, blocks: true, name: "Wise Friend altar", text: "wise" }); decor(x0 + 16, y0 + 9, "wise_friend", true, "The Wise Friend, over the altar of the Chapel of the Law");
    npc("raria_chaplain", x0 + 12, y0 + 14); for (const dx of [8, 12, 20, 24]) for (const dy of [14, 17, 20]) if (!(dx === 12 && dy === 14)) decor(x0 + dx, y0 + dy, "bench", true, "A pew, polished every dawn");
    for (const dx of [7, 25]) { decor(x0 + dx, y0 + 10, "torch"); decor(x0 + dx, y0 + 19, "torch"); }
    building(cx - 14, y0 + 6, cx + 2, y0 + 20, "s", T.STONE, undefined, { name: "The Hall of the Order of Dusk", color: "#2a2238", walls: "stone", roof: "cone", storeys: 3, spire: 40, keep: { size: 5, storeys: 1, spire: 100, dome: true }, facade: "civic" });
    const dh = cx - 6;
    decor(dh, y0 + 7, "god_dusk", true, "The Wise Friend, hooded, as the Order of Dusk carves it, carved small for the altar"); add({ kind: "altar", x: dh, y: y0 + 8, blocks: true, name: "Order of Dusk altar", text: "dusk" });
    npc("dusk_prior", dh - 1, y0 + 12); npc("dusk_quartermaster", dh + 4, y0 + 11); decor(cx - 13, y0 + 8, "armour", true, "Crooks and censer-maces, racked in the dark"); decor(cx + 1, y0 + 8, "chest", true, "The Dusk strongbox");
    decor(cx - 13, y0 + 16, "torch"); decor(cx + 1, y0 + 16, "torch"); decor(cx - 12, y0 + 18, "banner_dusk"); decor(cx, y0 + 18, "banner_dusk");
    add({ kind: "sigil_altar", sigil: "dusk_sigil", x: dh + 3, y: y0 + 16, blocks: true, name: "Dusk altar" });
    building(cx + 8, y0 + 6, cx + 28, y0 + 20, "s", T.STONE, undefined, { name: "The Office of Conduct", color: "#5b4a78", walls: "marble", roof: "cone", storeys: 3, spire: 40, keep: { size: 5, storeys: 1, spire: 100, dome: true }, facade: "civic" });
    npc("raria_clerk", cx + 14, y0 + 10); npc("raria_assessor", cx + 22, y0 + 12); for (const dx of [10, 13, 16, 19, 22, 25]) decor(cx + dx, y0 + 7, "shelf", true, "Ledgers of Names, by street, by family, by year"); decor(cx + 12, y0 + 16, "table", true, "A desk with a stamp, a seal, and a list of names with lines through some of them"); decor(cx + 24, y0 + 16, "table", true, "The Assessor's desk. Nothing on it is out of place.");
    building(x1 - 26, y0 + 6, x1 - 6, y0 + 18, "s", T.STONE, undefined, { name: "The Office of Sigils", color: "#8a6ab0", walls: "marble", storeys: 3, hip: true, facade: "civic" });
    npc("raria_sigilist", x1 - 16, y0 + 12); add({ kind: "sigil_altar", sigil: "law_sigil", x: x1 - 22, y: y0 + 8, blocks: true, name: "Law altar" }); add({ kind: "sigil_altar", sigil: "crown_sigil", x: x1 - 10, y: y0 + 8, blocks: true, name: "Crown altar" });
    decor(x1 - 24, y0 + 15, "shelf", true, "Sigils of the Law, by office"); decor(x1 - 8, y0 + 15, "table", true, "A press for sigils, stamped with the eye");
    // East: the market quarter: the Sumptuary Office, the Provisioner, the market tables, the Crown Bank and the inn.
    building(x1 - 28, cy - 22, x1 - 16, cy - 12, "w", T.STONE, undefined, { name: "The Sumptuary Office", color: "#7d5a6e", walls: "marble", storeys: 3, hip: true, facade: "civic" }); npc("raria_clothier", x1 - 22, cy - 17); decor(x1 - 26, cy - 21, "shelf", true, "Veils, tabards, skirts and mantles, in the one colour the Law allows"); decor(x1 - 18, cy - 13, "crate", true, "Clothes confiscated for colour");
    building(x1 - 14, cy - 22, x1 - 4, cy - 12, "w", T.WOOD, undefined, { name: "The Provisioner of the Crown", color: "#9ea3ad", walls: "timber", chimney: true, storeys: 2 }); npc("raria_provisioner", x1 - 9, cy - 17); decor(x1 - 12, cy - 13, "crate"); decor(x1 - 6, cy - 13, "barrel");
    for (let dy = -6; dy <= 6; dy += 3) { decor(x1 - 24, cy + dy, "table", true, "A market table: one kind of bread, one kind of cheese, one price, one queue"); decor(x1 - 12, cy + dy, "table", true, "A market table: Rarian cloth, folded by the inch"); }
    npc("raria_citizen_merrow", x1 - 18, cy + 3, 1); decor(x1 - 18, cy - 8, "crate", true, "The market's stock, inspected"); decor(x1 - 18, cy + 8, "barrel");
    building(x1 - 28, cy + 12, x1 - 16, cy + 22, "w", T.STONE, undefined, { name: "The Crown Bank", color: "#3d4a5c", walls: "marble", roof: "cone", storeys: 3, spire: 36, keep: { size: 5, storeys: 1, spire: 100, dome: true }, facade: "bank" }); for (const by of [cy + 14, cy + 17, cy + 20]) add({ kind: "bank", x: x1 - 26, y: by, blocks: true, name: "Bank booth" }); npc("banker", x1 - 24, cy + 17);
    building(x1 - 14, cy + 12, x1 - 4, cy + 24, "w", T.WOOD, undefined, { name: "The Seventh Prayer", color: "#4a3560", walls: "timber", chimney: true, storeys: 2 }); npc("raria_innkeeper", x1 - 9, cy + 18); decor(x1 - 12, cy + 15, "table"); decor(x1 - 6, cy + 15, "table"); decor(x1 - 12, cy + 21, "table"); add({ kind: "range", x: x1 - 6, y: cy + 22, blocks: true, name: "Inn kitchen range" });
    // South: the Regimental Barracks and Stores, the Rangers' Gallery, and the training yard.
    building(x0 + 5, y1 - 22, x0 + 30, y1 - 8, "n", T.STONE, undefined, { name: "The Regimental Barracks", color: "#6a5a68", walls: "stone", roof: "flat", storeys: 3 });
    npc("rrr_officer", x0 + 17, y1 - 18); for (const dx of [7, 10, 13, 22, 25, 28]) decor(x0 + dx, y1 - 10, "bed"); for (const dx of [7, 11, 23, 27]) decor(x0 + dx, y1 - 20, "armour", true, "Regiment plate, racked by number"); decor(x0 + 17, y1 - 12, "table", true, "The duty roster, and the day's writs"); npc("rrr_soldier", x0 + 12, y1 - 14, 1);
    building(x0 + 34, y1 - 20, x0 + 46, y1 - 8, "n", T.STONE, undefined, { name: "The Regimental Stores", color: "#8a8a92", walls: "stone", roof: "flat", storeys: 2 }); npc("raria_armourer", x0 + 40, y1 - 14); for (const dx of [36, 39, 42, 45]) decor(x0 + dx, y1 - 18, "armour", true, "Rarian steel, blessed before issue");
    building(cx + 12, y1 - 20, cx + 26, y1 - 8, "n", T.STONE, undefined, { name: "The Rangers' Gallery", color: "#2a2238", walls: "stone", storeys: 2, hip: true }); monster("royal_ranger", cx + 19, y1 - 14, 0); decor(cx + 14, y1 - 18, "armour", true, "Dusk-black longbows. Nobody is allowed to count them."); decor(cx + 24, y1 - 18, "target", true, "A target with one arrow in it, through the centre, through the one before");
    for (const x of [x1 - 24, x1 - 20, x1 - 16, x1 - 12, x1 - 8]) decor(x, y1 - 20, "target", true, "A Regiment target, every arrow in the same hole"); for (const x of [x1 - 22, x1 - 14, x1 - 6]) decor(x, y1 - 10, "stake", true, "Practice stakes"); npc("rrr_soldier", x1 - 16, y1 - 14, 3); npc("rrr_soldier", x1 - 10, y1 - 14, 3);
    // West, north of the boulevard: the Cathedral of the Wise Friend, in the palace's violet stone and as tall as it: a
    // nave of four storeys, and beside it a bell tower of eight, climbed by ladders all the way up to the Great Bell.
    {
      const NX0 = x0 + 12, NX1 = x0 + 33, NY0 = cy - 29, NY1 = cy - 6, mx = Math.floor((NX0 + NX1) / 2);
      building(NX0, NY0, NX1, NY1, "s", T.STONE, undefined, { name: "The Cathedral of the Wise Friend", color: "#3b2a52", walls: "stone", roof: "gable", storeys: 4, tall: 24 });
      for (const dx of [-1, 2]) { put(mx + dx, NY1, T.STONE); ctx.doorways.push([mx + dx, NY1]); }
      // The nave: a carpet up the aisle to the Wise Friend, pillars down both sides, pews between, candles and banners.
      for (let y = NY0 + 1; y < NY1; y++) for (let x = mx - 1; x <= mx + 2; x++) put(x, y, T.CARPET);
      for (let y = NY0 + 4; y <= NY1 - 3; y += 4) for (const x of [NX0 + 4, NX1 - 4]) decor(x, y, "pillar", true, "A pillar of the nave, violet stone, carved with the First Law all the way up");
      for (let y = NY0 + 8; y <= NY1 - 3; y += 2) for (const x of [mx - 5, mx - 4, mx - 3, mx + 4, mx + 5, mx + 6]) if (!occupied(x, y)) decor(x, y, "bench", true, "A pew of the Cathedral, every one facing the Wise Friend");
      decor(mx, NY0 + 2, "wise_friend", true, "The Wise Friend of the Cathedral: twice a man's height, ivory, blindfolded, the book open at the First Law");
      decor(mx + 1, NY0 + 2, "throne", true, "The Queen's seat in the Cathedral, beside the Wise Friend and a step below it");
      for (const x of [mx - 3, mx + 4]) { decor(x, NY0 + 2, "torch"); decor(x, NY0 + 5, "lamp"); }
      for (const x of [NX0 + 2, NX1 - 2]) { decor(x, NY0 + 2, "banner_dusk"); decor(x, NY1 - 2, "banner_rrr"); decor(x, NY0 + 12, "torch"); }
      decor(NX0 + 2, NY0 + 7, "shelf", true, "Hymnals of the Law: every verse a Law, every Law a verse"); decor(NX1 - 2, NY0 + 7, "chest", true, "The Cathedral's plate, locked");
      npcAt("raria_villager", mx - 6, NY0 + 14, 3); npcAt("raria_villager", mx + 6, NY0 + 18, 3);
      npc("rrr_soldier", mx - 2, NY1 + 1, 1); npc("rrr_soldier", mx + 3, NY1 + 1, 1);
      for (let y = NY1 + 1; y <= cy - 3; y++) for (let x = NX0 - 9; x <= NX1; x++) if (get(x, y) === T.COBBLE && !occupied(x, y)) put(x, y, T.STONE);
      // The bell tower: eight storeys and a spire, its door on the cathedral's square, ladders from floor to floor.
      const BELLS = "raria_bells", LEVELS_B = 7, TX0 = NX0 - 8, TY0 = cy - 16, TX1 = TX0 + 6, TY1 = TY0 + 6;
      building(TX0, TY0, TX1, TY1, "s", T.STONE, undefined, { name: "The Bell Tower of the Cathedral", color: "#3b2a52", walls: "stone", roof: "cone", storeys: LEVELS_B + 1, tall: 60, spire: 300, complex: BELLS });
      for (let y = TY1 + 1; y <= cy - 3; y++) for (const x of [TX0 + 3, TX0 + 4]) { clearAt(x, y); put(x, y, T.STONE); }
      const TOWER_FLOORS: Floor[] = Array.from({ length: LEVELS_B }, (_, i) => ({ complex: BELLS, level: i + 1, x0: TX0, y0: TY0, x1: TX1, y1: TY1, dx: 60 + i * 9 - TX0, dy: FLOOR_Y + 2 - TY0 }));
      floors.push(...TOWER_FLOORS);
      const bAt = (level: number, col: number, row: number) => ({ x: TX0 + col + (level ? TOWER_FLOORS[level - 1].dx : 0), y: TY0 + row + (level ? TOWER_FLOORS[level - 1].dy : 0) });
      for (let level = 1; level <= LEVELS_B; level++) for (let row = 0; row <= TY1 - TY0; row++) for (let col = 0; col <= TX1 - TX0; col++) {
        const { x, y } = bAt(level, col, row), edge = col === 0 || row === 0 || col === TX1 - TX0 || row === TY1 - TY0;
        put(x, y, edge ? T.WALL : T.STONE); t.setRegion(x, y, "raria");
      }
      // Ladders zig-zag up the tower: east corner, west corner, east again, each landing a step in from its ladder.
      const bCorner = (level: number) => level % 2 === 0 ? TX1 - TX0 - 1 : 1, bInward = (col: number) => col === 1 ? 2 : col - 1;
      for (let level = 0; level < LEVELS_B; level++) {
        const col = bCorner(level);
        add({ kind: "ladder", ...bAt(level, col, 1), blocks: true, name: "Bell tower ladder", action: "Climb-up", to: bAt(level + 1, bInward(col), 2) });
        add({ kind: "ladder", ...bAt(level + 1, col, 1), blocks: true, name: "Bell tower ladder", action: "Climb-down", to: bAt(level, bInward(col), 2) });
      }
      const inTower = (level: number, col: number, row: number, kind: DecorKind, name?: string, blocks = true) => { const p = bAt(level, col, row); decor(p.x, p.y, kind, blocks, name); };
      inTower(0, 1, 5, "torch"); inTower(0, 5, 5, "plaque", "THE BELL TOWER OF THE CATHEDRAL. Eight storeys. The Great Bell rings the hours of the Law. Climb quietly.");
      for (let level = 1; level < LEVELS_B; level++) { inTower(level, level % 2 ? 5 : 1, 5, "torch"); if (level % 3 === 0) inTower(level, 3, 4, "crate", "Bell rope, coiled, and spare clappers"); }
      inTower(3, 1, 4, "bench", "A bench for the bell-ringers to get their breath");
      // The belfry: the Great Bell of Raria, and the whole city below.
      inTower(LEVELS_B, 3, 4, "bell", "The Great Bell of Raria: bronze, taller than you, cast with the First Law round its lip. It rings the hours, and once more for every Name struck from the Ledger.");
      inTower(LEVELS_B, 1, 5, "banner_rrr"); inTower(LEVELS_B, 5, 5, "banner_dusk");
    }
    // West: the residential quarter, every house the same, and the Book of the Law in each (south of the boulevard:
    // the cathedral stands north of it).
    for (let hy = cy - 30; hy <= cy + 26; hy += 9) for (let hx = x0 + 4; hx <= x0 + 28; hx += 9) {
      if (Math.abs(hy + 2 - cy) <= 3 || hy < cy) continue;
      const door = hy < cy ? "s" : "n";
      const look = (hx * 7 + hy * 13) % 6;
      building(hx, hy, hx + 6, hy + 5, door, T.WOOD, undefined, { name: "A Rarian house", color: ROOFS[look], walls: look % 2 ? "timber" : "stone", storeys: look % 3 === 0 ? 2 : 1, chimney: look !== 4 });
      decor(hx + 1, door === "s" ? hy + 1 : hy + 4, "bed"); decor(hx + 5, door === "s" ? hy + 1 : hy + 4, "shelf", true, "The Book of the Law, and nothing else");
    }
    // The boulevards from the four gates to the gardens, paved in pale stone; and every block the offices left empty, filled with houses.
    for (let d = y0 + 1; d < y1; d++) for (const dx of [-2, -1, 0, 1, 2]) if (get(cx + dx, d) === T.COBBLE) put(cx + dx, d, T.STONE);
    for (let d = x0 + 1; d < x1; d++) for (const dy of [-2, -1, 0, 1, 2]) if (get(d, cy + dy) === T.COBBLE) put(d, cy + dy, T.STONE);
    const blockFree = (bx0: number, by0: number, bx1: number, by1: number) => { for (let y = by0 - 1; y <= by1 + 1; y++) for (let x = bx0 - 1; x <= bx1 + 1; x++) if (get(x, y) !== T.COBBLE || occupied(x, y)) return false; return true; };
    let houses = 0, plots = 0;
    for (let hy = y0 + 3; hy + 5 < y1 - 1; hy += 8) for (let hx = x0 + 3; hx + 6 < x1 - 1; hx += 9) {
      if (!blockFree(hx, hy, hx + 6, hy + 5)) continue;
      // Every seventh plot is left open, for the pocket gardens laid below.
      if (plots++ % 7 === 6) continue;
      const door = hy + 2 < cy ? "s" : "n", kind = houses % 7, look = (hx * 7 + hy * 13 + houses) % 6;
      building(hx, hy, hx + 6, hy + 5, door, T.WOOD, undefined, { name: kind === 3 ? "A Rarian chapel-house" : kind === 5 ? "A Rarian workshop" : "A Rarian house", color: kind === 3 ? "#efe6c8" : ROOFS[look], walls: kind === 5 || look % 2 === 0 ? "stone" : "timber", storeys: kind === 3 || look % 3 === 0 ? 2 : 1, chimney: kind !== 3 });
      const inner = door === "s" ? hy + 1 : hy + 4;
      if (kind === 3) { decor(hx + 3, inner, "wise_friend", true, "A small Wise Friend in a household chapel"); decor(hx + 1, inner, "bench"); }
      else if (kind === 5) { decor(hx + 1, inner, "table", true, "A workbench, every tool in its outline"); decor(hx + 5, inner, "crate", true, "Work for the Crown, inspected"); }
      else { decor(hx + 1, inner, "bed"); decor(hx + 5, inner, "shelf", true, "The Book of the Law, and nothing else"); }
      houses++;
    }
    // Lamps down every street, citizens on them, soldiers walking them in pairs, and the Rangers where you don't expect.
    for (let d = -55; d <= 55; d += 8) { if (Math.abs(d) > 27) { decor(cx + 3, cy + d, "lamp"); decor(cx + d, cy - 3, "lamp"); } }
    for (const [dx, dy] of [[-40, -30], [40, -30], [-40, 30], [40, 30], [0, -40], [0, 40], [-30, 0], [30, 0], [-50, -12], [50, 12], [-12, 50], [12, -50], [-35, 45], [35, -45]] as const) npcAt("raria_villager", cx + dx, cy + dy, 4);
    for (const [dx, dy] of [[-28, -24], [28, 24], [-6, 45], [6, -45]] as const) npcAt("rrr_soldier", cx + dx, cy + dy, 6);
    for (const [x, y] of [[x0 + 28, y0 + 22], [x1 - 2, cy - 5], [x0 + 2, cy + 5], [cx - 26, y1 - 6], [x1 - 30, y1 - 24], [cx + 27, y0 + 22], [x0 + 3, y0 + 26]] as const) monsterAt("royal_ranger", x, y, 0);
    decor(x0 + 29, y0 + 21, "pillar", true, "A pillar at the chapel's corner. There is a Ranger behind it. There is always a Ranger behind it.");
    for (const dx of [-2, 2]) { decor(cx + dx, y0 + 1, "banner_rrr"); decor(cx + dx, y1 - 1, "banner_rrr"); } for (const dy of [-2, 2]) { decor(x0 + 1, cy + dy, "banner_rrr"); decor(x1 - 1, cy + dy, "banner_rrr"); }
    sign(cx + 3, y1 + 2, "Raria", "RARIA. Her Radiance's city. The Law is kept here; keep it. Writs are shown at the gate. Weapons are carried, not drawn. The Wise Friend sees, and so do the Rangers.", "rarian_mantle");
    sign(x1 + 2, cy + 3, "The Crown Road", "EAST: the Crown Road across the Crownlands, past Candlemere, to Lawgate on the eastern march. NORTH: Vesperholm and the Order's abbey. SOUTH: Greyford, the Greyfields, and BarkReach beyond.");
    // Clipped yews in planters down both sides of the four boulevards (outside the palace gardens), every eight tiles.
    // (Only out on the street: an office's stone floor is not a boulevard.)
    const indoors = (x: number, y: number) => ctx.buildings.some(b => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
    const planter = (x: number, y: number) => { if (get(x, y) !== T.STONE || occupied(x, y) || indoors(x, y)) return; put(x, y, T.DARK_GRASS); tree(x, y, "yew"); };
    for (let d = 6; d <= 58; d += 8) for (const sgn of [-1, 1]) {
      if (cy + sgn * d > y0 + 3 && cy + sgn * d < y1 - 3 && (sgn > 0 ? cy + d > cy + 19 : cy - d < cy - 21)) { planter(cx - 2, cy + sgn * d); planter(cx + 2, cy + sgn * d); }
      // (Not through the market, whose tables line the east boulevard.)
      if (cx + sgn * d > x0 + 3 && cx + sgn * d < x1 - 3 && Math.abs(d) > 26 && !(sgn > 0 && cx + d >= x1 - 28)) { planter(cx + sgn * d, cy - 2); planter(cx + sgn * d, cy + 2); }
    }
    // Pocket gardens: every block of open paving left over becomes a little green (a tree, beds, a bench) or a well
    // square, so the city isn't a plain of cobbles between its offices.
    const open = (bx0: number, by0: number, bx1: number, by1: number) => { for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (get(x, y) !== T.COBBLE || occupied(x, y) || indoors(x, y)) return false; return true; };
    let greens = 0;
    for (let gy = y0 + 2; gy + 6 < y1 - 1; gy++) for (let gx = x0 + 2; gx + 6 < x1 - 1; gx++) {
      if (!open(gx, gy, gx + 6, gy + 6)) continue;
      const mx = gx + 3, my = gy + 3;
      if (greens % 4 === 3) {
        for (let y = my - 1; y <= my + 1; y++) for (let x = mx - 1; x <= mx + 1; x++) put(x, y, T.STONE);
        add({ kind: "well", x: mx, y: my, blocks: true, name: "A city well, its rope regulation length" }); decor(mx - 2, my + 2, "bench", true, "A bench, swept"); decor(mx + 2, my - 2, "lamp");
      } else {
        for (let y = my - 2; y <= my + 2; y++) for (let x = mx - 2; x <= mx + 2; x++) put(x, y, Math.max(Math.abs(x - mx), Math.abs(y - my)) === 2 ? T.GRAVEL : T.DARK_GRASS);
        tree(mx, my, (["maple", "oak", "tree"] as const)[greens % 3]);
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) decor(mx + dx, my + dy, "flowers", false, "A garden bed: violet and white, and nothing else");
        decor(mx, my + 2, "bench", true, "A bench in a pocket garden, facing the tree"); decor(mx - 2, my - 2, "lamp");
      }
      greens++;
      gx += 6;
    }
    // The market's goods: crates and barrels behind the tables, a well at its heart.
    for (let dy = -6; dy <= 6; dy += 6) { put2(x1 - 23, cy + dy + 1, "crate", "The market's stock, inspected"); put2(x1 - 11, cy + dy + 1, "barrel"); }
    { const [wx, wy] = nearFree(x1 - 18, cy - 3, 2); add({ kind: "well", x: wx, y: wy, blocks: true, name: "The market well" }); }
    // Forecourts before the four gates: cobbles, a lamp either side, the road running through.
    const forecourt = (fx0: number, fy0: number, fx1: number, fy1: number, lamps: readonly [number, number][]) => {
      for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) { if (!inBounds(x, y) || get(x, y) === T.WALL || isWater(get(x, y))) continue; clearAt(x, y); put(x, y, T.COBBLE); }
      for (const [lx, ly] of lamps) if (!occupied(lx, ly)) decor(lx, ly, "lamp");
    };
    forecourt(cx - 4, y1 + 1, cx + 4, y1 + 4, [[cx - 4, y1 + 2], [cx + 4, y1 + 2]]); forecourt(cx - 4, y0 - 4, cx + 4, y0 - 1, [[cx - 4, y0 - 2], [cx + 4, y0 - 2]]);
    forecourt(x1 + 1, cy - 4, x1 + 4, cy + 4, [[x1 + 2, cy - 4], [x1 + 2, cy + 4]]); forecourt(x0 - 4, cy - 4, x0 - 1, cy + 4, [[x0 - 2, cy - 4], [x0 - 2, cy + 4]]);
    // Outside: the Dusk's cemetery north-west of the wall, the Queen's orchard south-east, the farms.
    for (let gy = y0 - 4; gy >= y0 - 12; gy -= 2) for (let gx = x0 + 6; gx <= x0 + 36; gx += 3) { const [fx, fy] = nearFree(gx, gy, 1); clearAt(fx, fy); put(fx, fy, T.DARK_GRASS); decor(fx, fy, "grave"); }
    put2(x0 + 21, y0 - 14, "god_dusk", "The Wise Friend, hooded, over the Dusk's cemetery: every grave the same, every name in the Ledger"); put2(x0 + 18, y0 - 14, "torch"); put2(x0 + 24, y0 - 14, "torch");
    npcAt("dusk_guard", x0 + 15, y0 - 8, 1); npcAt("dusk_guard", x0 + 27, y0 - 8, 1);
    for (let oy = y1 + 6; oy <= y1 + 22; oy += 4) for (let ox = cx + 20; ox <= cx + 56; ox += 4) { const [fx, fy] = nearFree(ox, oy, 1); tree(fx, fy, (ox + oy) % 8 === 0 ? "maple" : "oak"); }
    sign(cx + 18, y1 + 8, "The Queen's Orchard", "THE QUEEN'S ORCHARD. Fruit is taken by the Provisioner. Wood is taken by permit. Permits are not issued.");
    places.raria = { x: cx, y: cy + 16 };
  }

  // ---------- 6. Raria's towns: Vesperholm and its abbey, the Rangers' Hold, Candlemere, Greyford ----------
  {
    // Vesperholm: the Order of Dusk's abbey town in the Vesperwold, under bells, among graves.
    const [vx, vy] = FAR_PLACES.vesperholm;
    ground(vx, vy, 16, 12, T.COBBLE, 3);
    building(vx - 14, vy - 11, vx + 2, vy - 2, "s", T.STONE, undefined, { name: "Vesperholm Abbey", color: "#2a2238", walls: "stone", storeys: 2, tall: 8 });
    building(vx - 9, vy - 14, vx - 5, vy - 10, "s", T.STONE, undefined, { name: "The abbey bell tower", color: "#2a2238", walls: "stone", roof: "cone", round: true, tall: 30, spire: 18 });
    npc("vesper_abbess", vx - 6, vy - 6); add({ kind: "altar", x: vx - 10, y: vy - 9, blocks: true, name: "Vesperholm altar", text: "wise" }); decor(vx - 10, vy - 10, "god_dusk", true, "The Wise Friend, hooded, over the abbey altar");
    for (const dx of [-13, -2]) decor(vx + dx, vy - 4, "torch"); decor(vx - 12, vy - 4, "bench"); decor(vx - 4, vy - 4, "bench"); decor(vx - 1, vy - 9, "shelf", true, "The abbey's copies of the Law, each read once a year aloud");
    building(vx + 5, vy - 9, vx + 12, vy - 3, "s", T.WOOD, undefined, { name: "A Vesperholm house", color: "#3b2a52", walls: "timber", chimney: true }); decor(vx + 6, vy - 8, "bed");
    building(vx + 5, vy + 3, vx + 12, vy + 9, "n", T.WOOD, undefined, { name: "A Vesperholm house", color: "#3b2a52", walls: "timber", chimney: true }); decor(vx + 11, vy + 8, "bed");
    for (let gy = vy + 4; gy <= vy + 10; gy += 2) for (let gx = vx - 14; gx <= vx - 2; gx += 3) { const [fx, fy] = nearFree(gx, gy, 1); decor(fx, fy, "grave"); }
    for (const [dx, dy] of [[0, 1], [4, 0], [-4, 2]] as const) npcAt("raria_villager", vx + dx, vy + dy, 3); npcAt("dusk_guard", vx - 1, vy - 1, 2);
    sign(vx + 2, vy + 12, "Vesperholm", "VESPERHOLM. The abbey of the Order of Dusk. Bells at the last hour. Be indoors for them.", "dusk_lantern");
    monsters("dusk_wraith", 150, 30, 260, 120, 12); monsters("wolf", 160, 40, 300, 125, 6);
    // The Rangers' Hold: a lodge in the Vesperwold where the Royal Rangers train, and do not talk about it.
    const [rx, ry] = FAR_PLACES.rangers_hold;
    ground(rx, ry, 10, 8, T.GRAVEL, 2);
    building(rx - 7, ry - 7, rx + 7, ry - 1, "s", T.WOOD, undefined, { name: "The Rangers' Hold", color: "#2a2238", walls: "plank", chimney: true }); npc("ranger_warden", rx, ry - 4);
    decor(rx - 5, ry - 6, "armour", true, "Dusk-black longbows, racked"); decor(rx + 5, ry - 6, "bed");
    for (const dx of [-6, -3, 0, 3, 6]) decor(rx + dx, ry + 6, "target", true, "A target at sixty paces, every arrow through the eye");
    for (const [dx, dy] of [[-8, 2], [8, 2], [0, 8]] as const) monsterAt("royal_ranger", rx + dx, ry + dy, 1);
    sign(rx + 9, ry + 2, "The Rangers' Hold", "THE RANGERS' HOLD. Property of the Crown. You have already been seen. Leave the way you came.");
    // Candlemere: the Crownlands' lake town: farms, a windmill, fishing, the reeve who collects the tithe.
    const [kx, ky] = FAR_PLACES.candlemere;
    ground(kx, ky + 4, 12, 9, T.PATH, 3);
    building(kx - 10, ky - 2, kx - 3, ky + 4, "s", T.WOOD, undefined, { name: "The Reeve's house", color: "#9ea3ad", walls: "timber", chimney: true }); npc("candlemere_reeve", kx - 6, ky + 1); decor(kx - 9, ky - 1, "chest", true, "The tithe chest, locked, and light"); decor(kx - 4, ky - 1, "table", true, "The tithe roll");
    building(kx + 3, ky - 2, kx + 10, ky + 4, "s", T.WOOD, undefined, { name: "The Candlemere stores", color: "#cdb98a", walls: "plank" }); npc("candlemere_trader", kx + 6, ky + 1); decor(kx + 9, ky - 1, "crate"); decor(kx + 4, ky - 1, "barrel");
    decor(kx + 14, ky + 6, "windmill", true, "The Candlemere mill, turning to the regulation"); for (const [dx, dy] of [[-4, 8], [2, 9], [8, 7]] as const) npcAt("crownlands_villager", kx + dx, ky + dy, 4);
    for (let fy = ky + 14; fy <= ky + 30; fy++) for (let fx = kx - 14; fx <= kx + 14; fx++) if (get(fx, fy) === T.GRASS && (fx + fy) % 7 !== 0) put(fx, fy, T.FARMLAND);
    for (const [dx, dy] of [[-16, 14], [16, 14], [-16, 30], [16, 30]] as const) put2(kx + dx, ky + dy, "hay", "Hay, baled to a standard");
    shoreSpots(320, 136, 356, 160, "net", 3); shoreSpots(320, 136, 356, 160, "lure", 2);
    monsters("cow", kx - 12, ky + 12, kx + 12, ky + 30, 4); monsters("sheep", kx + 16, ky + 12, kx + 34, ky + 30, 5); monsters("crown_hound", 290, 200, 420, 270, 6); monsters("rrr_scout", 290, 150, 420, 280, 5);
    sign(kx, ky + 12, "Candlemere", "CANDLEMERE. A town of the Crownlands. The tithe is due at the turn of every month. The lake is the Crown's; fishing is permitted, with thanks.", "bread");
    // A Regiment checkpoint on the Crown Road between Lawgate and Candlemere.
    for (const x of [392, 394, 400, 402]) put2(x, 200, "stake", "The Crown Road checkpoint"); put2(390, 203, "banner_rrr"); put2(404, 203, "banner_rrr"); monsterAt("rrr_halberdier", 396, 204, 1); monsterAt("rrr_halberdier", 398, 204, 1); put2(406, 206, "wagon", "A Regiment supply wagon, under seal");
    // Greyford: the river town at the Greyfields' edge, where the South Road crosses the Vesper.
    const [gx, gy] = FAR_PLACES.greyford;
    ground(gx, gy, 12, 8, T.COBBLE, 2);
    building(gx + 3, gy - 7, gx + 11, gy - 1, "s", T.WOOD, undefined, { name: "The Ford Inn", color: "#6d6b67", walls: "timber", chimney: true }); npc("greyford_warden", gx + 7, gy - 4); decor(gx + 4, gy - 6, "table"); decor(gx + 10, gy - 6, "barrel"); add({ kind: "range", x: gx + 10, y: gy - 3, blocks: true, name: "Inn range" });
    building(gx - 11, gy - 7, gx - 4, gy - 1, "s", T.STONE, undefined, { name: "Greyford garrison", color: "#4a2b3a", walls: "stone" }); npc("rrr_soldier", gx - 7, gy - 4, 1); decor(gx - 10, gy - 6, "armour", true, "Halberds, racked");
    for (const [dx, dy] of [[-3, 3], [4, 4], [0, 6]] as const) npcAt("raria_villager", gx + dx, gy + dy, 3); for (const dx of [-12, 12]) put2(gx + dx, gy, "banner_rrr");
    sign(gx, gy + 9, "Greyford", "GREYFORD. The last town of the Crown before the Greyfields. South: BarkReach. East: Fort Ordinance and the road to Westmarch, which is not the Crown's. Yet.", "rrr_banner");
  }

  // ---------- 7. The Greyfields: the Regiment's Fort Ordinance, the Federation's forward camp, and the battlefield between ----------
  {
    const [fx, fy] = FAR_PLACES.fort_ordinance;
    ground(fx, fy, 15, 12, T.GRAVEL, 0);
    for (let y = fy - 11; y <= fy + 11; y++) for (let x = fx - 14; x <= fx + 14; x++) { const edge = x === fx - 14 || x === fx + 14 || y === fy - 11 || y === fy + 11; if (edge && !(Math.abs(x - fx) <= 1 && y === fy - 11) && !(Math.abs(x - fx) <= 1 && y === fy + 11)) put(x, y, T.WALL); }
    building(fx - 6, fy - 6, fx + 6, fy + 2, "s", T.STONE, undefined, { name: "Fort Ordinance keep", color: "#4a2b3a", walls: "stone", roof: "flat", storeys: 3, tall: 10 });
    building(fx - 13, fy - 10, fx - 9, fy - 6, "s", T.STONE, undefined, { name: "Fort Ordinance tower", color: "#3b2a52", walls: "stone", roof: "cone", round: true, tall: 20, spire: 10 });
    building(fx + 9, fy - 10, fx + 13, fy - 6, "s", T.STONE, undefined, { name: "Fort Ordinance tower", color: "#3b2a52", walls: "stone", roof: "cone", round: true, tall: 20, spire: 10 });
    decor(fx, fy - 4, "table", true, "The war table: the Greyfields in miniature, the Federation's camp marked in red"); decor(fx - 4, fy - 4, "banner_rrr"); decor(fx + 4, fy - 4, "banner_rrr");
    monsterAt("rrr_captain", fx, fy - 2, 1); monsterAt("rrr_captain", fx + 2, fy + 6, 2);
    for (const [dx, dy] of [[-10, 4], [10, 4], [-8, 8], [8, 8], [-4, 8], [4, 8]] as const) monsterAt(dx % 4 === 0 ? "rrr_halberdier" : "rrr_footman", fx + dx, fy + dy, 2);
    for (const [dx, dy] of [[-11, -3], [11, -3], [0, 9]] as const) monsterAt("rrr_archer", fx + dx, fy + dy, 1); monsterAt("crown_hound", fx - 6, fy + 9, 3); monsterAt("crown_hound", fx + 6, fy + 9, 3);
    for (const [dx, dy] of [[-12, 6], [12, 6], [-12, 9], [12, 9]] as const) put2(fx + dx, fy + dy, "tent", "A Regiment tent, violet, pitched to the inch"); put2(fx, fy + 4, "hearth", "The fort's cookfire, banked to regulation");
    sign(fx, fy + 13, "Fort Ordinance", "FORT ORDINANCE. The Rare Realm Regiment. Present your writ, or present your reasons, and be brief.", "rrr_helm");
    // The Federation's forward camp in the east of the Greyfields: patched tents, a device, a small cannon, pickets.
    const [qx, qy] = FAR_PLACES.freecamp;
    ground(qx, qy, 9, 7, T.PATH, 1); palisade(qx - 9, qy - 7, qx + 9, qy + 7, "e", "The Federation's palisade: every stake a different height");
    for (const [dx, dy] of [[-5, -3], [5, -3], [-5, 3]] as const) put2(qx + dx, qy + dy, "tent", "A Federation tent, patched in four colours"); put2(qx + 4, qy + 3, "cannon", "A small Federation cannon, pointed at Fort Ordinance. The artisans call it 'Second Opinion'.");
    put2(qx, qy, "hearth", "A Federation cookfire with a kettle that stirs itself"); put2(qx - 2, qy - 6, "banner_fff"); put2(qx + 2, qy - 6, "banner_fff"); put2(qx - 7, qy, "device", "A device that listens to the Regiment's drums and writes them down");
    npcAt("fff_ranger", qx - 1, qy + 2, 2); monsterAt("fff_warden", qx + 6, qy - 4, 1); for (const [dx, dy] of [[-12, -8], [12, -8], [-12, 8], [12, 8]] as const) monsterAt("fff_picket", qx + dx, qy + dy, 3);
    sign(qx + 11, qy + 2, "Freecamp", "THE FREE FRIENDS FEDERATION. Forward camp. We are not here. If you can read this, you are also not here. Have a nice day.", "fff_cape_ranger");
    // The battlefield between: bones, broken arms of both sides, craters, the dead that kept fighting.
    const [bx, by] = FAR_PLACES.battlefield;
    for (let y = by - 12; y <= by + 12; y++) for (let x = bx - 30; x <= bx + 30; x++) if (inBounds(x, y) && walkable(get(x, y)) && n3(x * 2, y * 2) > 0.72) { clearAt(x, y); put(x, y, T.GRAVEL); }
    scatter(bx - 30, by - 12, bx + 30, by + 12, 22, (x, y) => decor(x, y, (["bones", "armour", "rubble", "stake"] as const)[(x * 7 + y) % 4], (x * 7 + y) % 4 !== 0, (["The dead of the Greyfields: both sides, in the same ground", "A broken halberd, violet tassel and all", "A crater where something from the Federation landed", "A stake wall, half pulled down"] as const)[(x * 7 + y) % 4]));
    put2(bx, by - 2, "obelisk", "A cairn for the Greyfields' dead. Somebody has scratched FFF on one side and RRR on the other.");
    monsters("greyfield_revenant", 200, 290, 400, 350, 14); monsters("deserter", 240, 300, 380, 345, 5); monsters("rrr_scout", 220, 286, 420, 300, 4); monsters("fff_picket", 340, 330, 430, 350, 3);
    scatter(150, 285, 430, 350, 40, (x, y) => tree(x, y, random() < 0.6 ? "deadwood" : "tree"), (x, y) => t.free(x, y) && regionIs(x, y, "greyfields"));
    t.rockCluster(280, 340, 4, "pewter", 5); t.rockCluster(360, 296, 4, "blackiron", 4);
  }

  // ---------- 8. BarkReach and the Heartwood: the deep wood of the south ----------
  {
    // The wood: redwoods and ironbarks thick, oaks and plain trees between; the Heartwood thicker and older.
    // A great wood: trees on most open ground, thinning into clearings and glades where the broad noise dips, never on the roads.
    // Every third row and column stays clear, so however thick the wood grows it never seals anything off; trees keep back from roads and water.
    const near = (x: number, y: number, test: (tt: number) => boolean) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => test(get(x + dx, y + dy)));
    const wooded = (x: number, y: number) => t.free(x, y) && x % 3 !== 1 && y % 3 !== 1 && !near(x, y, tt => tt === T.PATH || tt === T.GRAVEL || tt === T.BRIDGE || isWater(tt));
    scatter(130, 352, 440, 505, 4200, (x, y) => { const r = random(); tree(x, y, r < 0.34 ? "redwood" : r < 0.46 ? "ironbark" : r < 0.7 ? "oak" : r < 0.84 ? "maple" : "tree"); },
      (x, y) => wooded(x, y) && regionIs(x, y, "barkreach") && n1(x * 0.8, y * 0.8) > 0.3);
    scatter(4, 352, 150, 505, 2600, (x, y) => { const r = random(); tree(x, y, r < 0.45 ? "ironbark" : r < 0.75 ? "redwood" : "yew"); }, (x, y) => wooded(x, y) && regionIs(x, y, "heartwood") && n1(x * 0.9, y * 0.9) > 0.22);
    scatter(130, 352, 440, 505, 260, (x, y) => decor(x, y, random() < 0.5 ? "bush" : "flowers", false), (x, y) => t.free(x, y) && regionIs(x, y, "barkreach"));
    // Sawyer's Rest: the logging camp, the yard, the bowyer, the outfitter, a bank, a fire and the logpiles.
    const [sx, sy] = FAR_PLACES.sawyers_rest;
    ground(sx, sy, 12, 10, T.PATH, 3);
    building(sx - 9, sy - 9, sx - 2, sy - 3, "s", T.WOOD, undefined, { name: "The Heartwood Yard", color: "#8a3a2a", walls: "plank", chimney: true }); npc("barkreach_foreman", sx - 5, sy - 6); decor(sx - 8, sy - 8, "logpile", true, "Redwood, stacked"); decor(sx - 3, sy - 8, "logpile", true, "Ironbark, stacked, with an axe broken on it");
    building(sx + 2, sy - 9, sx + 9, sy - 3, "s", T.WOOD, undefined, { name: "The Antler and Bow", color: "#5a3a2a", walls: "plank" }); npc("barkreach_bowyer", sx + 5, sy - 6); decor(sx + 3, sy - 8, "shelf", true, "Bows, unstrung, by wood"); decor(sx + 8, sy - 8, "crate", true, "Antler, feathers, shafts");
    building(sx - 9, sy + 3, sx - 2, sy + 9, "n", T.WOOD, undefined, { name: "Resin and Hide", color: "#6b4a2c", walls: "plank" }); npc("barkreach_outfitter", sx - 5, sy + 6); decor(sx - 8, sy + 8, "shelf"); decor(sx - 3, sy + 8, "crate", true, "Hides, scraped");
    building(sx + 2, sy + 3, sx + 9, sy + 9, "n", T.STONE, undefined, { name: "BarkReach Bank", color: "#8f9cb2", walls: "stone" }); for (const bx of [sx + 3, sx + 5, sx + 7]) add({ kind: "bank", x: bx, y: sy + 8, blocks: true, name: "Bank booth" }); npc("banker", sx + 5, sy + 6);
    add({ kind: "range", x: sx, y: sy + 1, blocks: true, name: "Cooking fire" }); decor(sx - 3, sy, "stump", true, "A redwood stump, as wide as a table, used as one"); decor(sx + 3, sy, "logpile", true, "The day's cut"); decor(sx - 11, sy - 1, "lamp"); decor(sx + 11, sy - 1, "lamp");
    for (const [dx, dy] of [[-2, 1], [2, -1], [9, 2], [-9, 3]] as const) npc("barkreach_villager", sx + dx, sy + dy, 3);
    sign(sx, sy - 11, "Sawyer's Rest", "SAWYER'S REST. BarkReach's logging camp. Redwood 52, ironbark 68, and the Heartwood Yard buys every log you cut. West: the Antler Lodge, Barkholm and the Heartwood. East: the Stag's Rest and Wood's End. North: Greyford and the Crown. Mind the stumps that aren't.", "ironbark_logs");
    places.barkreach = { x: sx, y: sy + 3 };
    // The Antler Lodge, the rangers' settlement up the wood.
    const [ax, ay] = FAR_PLACES.antler_lodge;
    ground(ax, ay, 8, 6, T.PATH, 2);
    building(ax - 5, ay - 6, ax + 4, ay - 1, "s", T.WOOD, undefined, { name: "The Antler Lodge", color: "#4a3a2c", walls: "plank", chimney: true }); npc("antler_captain", ax, ay - 3); decor(ax - 4, ay - 5, "bed"); decor(ax + 3, ay - 5, "shelf", true, "Antler, carved: every ranger's tally");
    for (const dx of [-5, -2, 1]) decor(ax + dx, ay + 5, "target", true, "A ranger's target, antler-tipped arrows in it"); npc("barkreach_ranger", ax + 3, ay + 3, 3); decor(ax + 6, ay + 2, "hearth", true, "The rangers' fire");
    // The Stag's Rest, the hunting camp in the east of the wood.
    const [hx, hy] = FAR_PLACES.stags_rest;
    ground(hx, hy, 6, 5, null);
    decor(hx, hy, "hearth", true, "The hunters' fire, a greatstag haunch over it"); decor(hx - 4, hy - 3, "tent", true, "A hunter's tent, hides drying on the ropes"); decor(hx + 4, hy - 3, "tent", true, "A hunter's tent"); decor(hx - 3, hy + 3, "crate", true, "Hides, salted"); decor(hx + 3, hy + 3, "hay", true, "Antler, a cartload");
    npc("barkreach_hunter", hx - 1, hy - 2, 2); npc("barkreach_hunter", hx + 2, hy + 2, 2); add({ kind: "range", x: hx - 2, y: hy + 1, blocks: true, name: "Hunters' fire" });
    // Wood's End: a little wooden fort in the wood where the Federation's road comes in: a stake palisade with gates on the
    // road, two watchtowers, the trading post, a storehouse, the rangers' bunkhouse, a fire, a wagon and the post's guards.
    const [ex, ey] = FAR_PLACES.woods_end, fx0 = ex - 11, fy0 = ey - 9, fx1 = ex + 11, fy1 = ey + 8;
    ground(ex, ey, 14, 12, null);
    for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) { const tt = get(x, y); if (tt !== T.PATH) put(x, y, (x * 7 + y * 3) % 5 === 0 ? T.GRAVEL : T.DARK_GRASS); }
    road([[ex - 16, ey + 7], [ex - 11, ey + 3], [ex + 11, ey + 3], [ex + 16, ey - 7]], 2.2);
    const gate = (x: number, y: number) => (x === fx0 || x === fx1) && y >= ey + 2 && y <= ey + 4;
    for (let x = fx0; x <= fx1; x += 2) { decor(x, fy0, "stake", true, "Wood's End's palisade: sharpened redwood, lashed with rope"); decor(x, fy1, "stake", true, "Wood's End's palisade: sharpened redwood, lashed with rope"); }
    for (let y = fy0 + 2; y < fy1; y += 2) for (const x of [fx0, fx1]) if (!gate(x, y) && !gate(x, y - 1) && !gate(x, y + 1)) decor(x, y, "stake", true, "Wood's End's palisade: sharpened redwood, lashed with rope");
    for (const x of [fx0, fx1]) { decor(x, ey + 1, "stake", true, "A gatepost of the palisade"); decor(x, ey + 5, "stake", true, "A gatepost of the palisade"); }
    building(ex - 5, fy0 + 1, ex + 5, ey - 2, "s", T.WOOD, ex, { name: "The Wood's End trading post", color: "#8a3a2a", walls: "plank", chimney: true, storeys: 2, tall: 4 });
    npc("barkreach_trader", ex, ey - 5);
    decor(ex - 4, fy0 + 2, "shelf", true, "Jars of resin, pickled greatstag and wood-honey"); decor(ex - 2, fy0 + 2, "shelf", true, "Hides, folded, and woollens for the winter wood"); decor(ex + 2, fy0 + 2, "shelf", true, "Bows and shafts for trade");
    decor(ex + 4, fy0 + 2, "chest", true, "The post's strongbox"); decor(ex - 4, ey - 4, "crate", true, "Rope, string and nails"); decor(ex + 4, ey - 4, "barrel", true, "Salt"); decor(ex + 2, ey - 4, "table", true, "The trader's counter and ledger");
    building(ex + 7, fy0 + 1, fx1 - 1, ey - 3, "s", T.WOOD, undefined, { name: "The Wood's End storehouse", color: "#5a3a2a", walls: "plank" });
    decor(ex + 8, fy0 + 2, "logpile", true, "Redwood, waiting for a wagon"); decor(ex + 9, ey - 4, "crate", true, "Antler and hides, bound for the Federation"); decor(ex + 9, fy0 + 2, "barrel");
    building(fx0 + 1, fy0 + 1, ex - 7, ey - 3, "s", T.WOOD, undefined, { name: "The rangers' bunkhouse", color: "#4a3a2c", walls: "plank", chimney: true });
    decor(fx0 + 2, fy0 + 2, "bed"); decor(ex - 8, fy0 + 2, "bed"); decor(fx0 + 2, ey - 4, "armour", true, "Bows and quivers, hung by the door");
    decor(ex, ey + 6, "hearth", true, "The fort's fire, a kettle on it"); decor(ex - 3, ey + 6, "bench"); decor(ex + 3, ey + 6, "bench"); decor(ex - 7, ey + 6, "wagon", true, "A trader's wagon, unhitched");
    decor(ex + 7, ey + 6, "hay", true, "Hay for the wagon horses"); decor(ex + 9, ey + 6, "logpile", true, "Firewood"); decor(ex - 9, ey + 6, "crate", true, "Arrows by the thousand");
    decor(fx0 + 1, fy1 - 1, "watchtower", true, "A Wood's End watchtower, looking west into the wood"); decor(fx1 - 1, fy1 - 1, "watchtower", true, "A Wood's End watchtower, looking east down the Federation's road");
    for (const [lx, ly] of [[ex - 6, ey + 1], [ex + 6, ey + 1], [fx0 + 2, ey + 5], [fx1 - 2, ey + 5]] as const) decor(lx, ly, "lamp");
    decor(ex - 1, ey - 1, "banner", true, "Wood's End's banner: an antler on green"); decor(ex + 2, ey - 1, "banner", true, "Wood's End's banner: an antler on green");
    npc("barkreach_ranger", fx0 + 2, ey + 1, 1); npc("barkreach_ranger", fx1 - 2, ey + 1, 1); npc("barkreach_villager", ex - 2, ey + 5, 3); npc("barkreach_hunter", ex + 4, ey + 5, 2);
    sign(fx0 - 2, ey + 2, "Wood's End", "WOOD'S END. A fort in the wood, and the only roof between the Federation and Sawyer's Rest. The post buys logs and hides and sells food, arrows, string and tools. West: the Stag's Rest and Sawyer's Rest. East: the Federation's road to the Free Marches. The Regiment's scouts have been seen in the wood. The rangers have seen them back.", "redwood_bow");
    // Barkholm: a village of the wood's own people in the west, by the Hush.
    const [vx, vy] = FAR_PLACES.barkholm;
    ground(vx, vy, 10, 7, T.PATH, 2);
    for (const [hx0, hy0, door] of [[vx - 9, vy - 6, "s"], [vx + 2, vy - 6, "s"], [vx - 9, vy + 2, "n"]] as const) { building(hx0, hy0, hx0 + 6, hy0 + 4, door, T.WOOD, undefined, { name: "A Barkholm house", color: "#5a3a2a", walls: "plank", chimney: true }); decor(hx0 + 1, door === "s" ? hy0 + 1 : hy0 + 3, "bed"); }
    npc("barkholm_elder", vx + 5, vy + 4); add({ kind: "well", x: vx, y: vy, blocks: true, name: "Well" }); for (const [dx, dy] of [[-3, 1], [3, -1], [6, 2]] as const) npc("barkreach_villager", vx + dx, vy + dy, 3);
    // A glade over the bridge on the Hush's far bank, where the village has grown (its new homes go up there).
    ground(vx - 28, vy + 10, 7, 9, null);
    sign(vx + 2, vy + 7, "Barkholm", "BARKHOLM. The wood's own village. The Crown has asked for a tithe here twice. The wood answered both times.", "redwood_logs");
    // The hidden glade in the Heartwood: cliffs all round, one way in, a statue nobody put there.
    const [lx, ly] = FAR_PLACES.hidden_glade;
    for (let y = ly - 6; y <= ly + 6; y++) for (let x = lx - 6; x <= lx + 6; x++) { const edge = Math.min(x - (lx - 6), lx + 6 - x, y - (ly - 6), ly + 6 - y); clearAt(x, y); if (edge <= 1 && !(Math.abs(x - lx) <= 1 && y >= ly + 5)) put(x, y, T.CLIFF); else put(x, y, T.DARK_GRASS); }
    decor(lx, ly - 2, "wise_friend", true, "A statue of the Wise Friend, sunk to the chest in the loam, blindfolded. The ironbarks round it are the oldest in the wood. Raria did not put it here."); decor(lx - 2, ly + 1, "chest", true, "A hunter's cache: dry wood, a knife, and a note that says 'DON'T TELL THE RANGERS ABOUT THE STATUE'"); decor(lx + 2, ly + 1, "flowers", false, "Fresh flowers at the statue's feet");
    // The Ironbark Elder in the deepest Heartwood, and the wood's creatures.
    const [ox, oy] = FAR_PLACES.elder;
    ground(ox, oy, 5, 4, null); monster("ironbark_treant", ox, oy, 1); put2(ox - 4, oy - 3, "flowers", "Offerings left for the Elder: antler, a loaf, a ranger's arrow with the head taken off", false);
    monsters("greatstag", 140, 360, 430, 500, 14); monsters("boar", 160, 380, 430, 500, 8); monsters("wolf", 4, 360, 200, 500, 8); monsters("bark_lurker", 130, 360, 430, 500, 8); monsters("bark_lurker", 4, 360, 150, 500, 12);
    monsters("timber_thief", 180, 360, 430, 470, 7); monsters("rrr_scout", 150, 352, 380, 372, 4); monsters("fff_picket", 380, 380, 440, 440, 3); monsters("greatstag", 4, 360, 150, 500, 5);
    t.rockCluster(260, 470, 4, "clay", 5); t.rockCluster(160, 470, 3, "pewter", 4);
    shoreSpots(100, 480, 260, 505, "net", 4); shoreSpots(4, 340, 60, 420, "lure", 3); shoreSpots(120, 486, 330, 512, "harpoon", 2);
  }

  // ---------- 9. The Silent Peaks: snow, scree, ore, the blindfolded watchers, and a shrine older than the kingdom ----------
  {
    for (const [rx, ry, kind, n] of [[60, 70, "moonsilver", 6], [40, 110, "glimmer", 4], [86, 46, "rarite", 3], [30, 80, "gem", 2], [96, 120, "blackiron", 5], [110, 94, "inkcoal", 5]] as const) t.rockCluster(rx, ry, 5, kind as RockKind, n);
    scatter(4, 30, 140, 160, 70, (x, y) => tree(x, y, random() < 0.75 ? "pine" : "yew"), (x, y) => t.free(x, y) && regionIs(x, y, "silent_peaks") && get(x, y) !== T.SNOW);
    monsters("peak_watcher", 10, 30, 130, 150, 9); monsters("wolf", 20, 60, 140, 160, 5);
    const [bx, by] = FAR_PLACES.blind_shrine;
    for (let y = by - 7; y <= by + 7; y++) for (let x = bx - 7; x <= bx + 7; x++) { if (!inBounds(x, y)) continue; const edge = Math.min(x - (bx - 7), bx + 7 - x, y - (by - 7), by + 7 - y); clearAt(x, y); lift[tileIndex(x, y)] = 0;
      if (edge <= 1 && !(x >= bx + 6 && Math.abs(y - by) <= 1)) put(x, y, T.CLIFF); else put(x, y, T.STONE); }
    decor(bx, by - 3, "wise_friend", true, "The Blind Shrine: the Wise Friend carved out of the mountain itself, blindfolded, the book open. Under the blindfold, if you look closely, the eyes are carved open.");
    decor(bx - 3, by, "plaque", true, "A plaque in a script older than Raria's. Somebody has written beneath it, in Rarian: 'IT HAS ALWAYS BEEN CLOSED.' Somebody else has scratched that out."); decor(bx + 3, by, "torch", true, "A candle, lit. Somebody comes here.");
    npcAt("peak_hermit", bx + 1, by + 3);
  }

  // ---------- 10. Trees and life across Raria's open country ----------
  scatter(110, 40, 330, 128, 160, (x, y) => tree(x, y, (["pine", "pine", "yew", "deadwood", "tree"] as const)[Math.floor(random() * 5)] as TreeKind), (x, y) => t.free(x, y) && regionIs(x, y, "vesperwold") && get(x, y) !== T.SWAMP);
  scatter(60, 120, 440, 290, 120, (x, y) => tree(x, y, (["oak", "oak", "maple", "willow", "tree"] as const)[Math.floor(random() * 5)] as TreeKind),
    (x, y) => t.free(x, y) && (regionIs(x, y, "raria") || regionIs(x, y, "crownlands")) && get(x, y) !== T.FARMLAND && !(x >= RARIA_CITY.x0 - 6 && x <= RARIA_CITY.x1 + 6 && y >= RARIA_CITY.y0 - 16 && y <= RARIA_CITY.y1 + 24));
  monsters("sheep", 100, 210, 140, 260, 4); monsters("crown_hound", 60, 140, 140, 280, 3); monsters("rrr_scout", 60, 150, 140, 280, 3);
  t.rockCluster(110, 250, 3, "pewter", 4); t.rockCluster(270, 270, 3, "clay", 4); t.rockCluster(380, 240, 3, "blackiron", 3);
  sign(450, 210, "The Crown Road", "WEST: the Crown Road through the Crownlands to Raria, the city round the palace. A long way. The Law walks it with you.");
  sign(470, 304, "The Greyfields road", "WEST: the Greyfields, Fort Ordinance and Greyford. The road is the Regiment's as far as the fort. After that it is the war's.");
  sign(470, 384, "The wood road", "WEST: BarkReach. Wood's End first, then the Stag's Rest and Sawyer's Rest, and then nothing but trees for days.");

  // ---------- 11. Nothing out of reach: a fishing spot, rock or tree on an islet the coast left behind (or ringed by cliffs) is taken away ----------
  const reach = new Uint8Array(X1 * OH), queue: number[] = [], start = places.raria;
  const passable = (x: number, y: number) => { if (x < 0 || y < 0 || x >= X1 || y >= OH || !walkable(get(x, y)) || get(x, y) === T.WALL) return false; const o = ctx.objectAt[tileIndex(x, y)]; return o < 0 || !ctx.objects[o].blocks; };
  reach[start.y * X1 + start.x] = 1; queue.push(start.y * X1 + start.x);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % X1, y = (i - x) / X1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const nx = x + dx, ny = y + dy, j = ny * X1 + nx; if (passable(nx, ny) && !reach[j]) { reach[j] = 1; queue.push(j); } }
  }
  for (const object of ctx.objects) {
    if ((object.kind !== "spot" && object.kind !== "rock" && object.kind !== "tree") || object.x >= WEST_DX || object.name === "__removed") continue;
    const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const x = object.x + dx, y = object.y + dy; return x >= 0 && y >= 0 && x < X1 && y < OH && reach[y * X1 + x]; });
    if (!ok) clearAt(object.x, object.y);
  }
}
