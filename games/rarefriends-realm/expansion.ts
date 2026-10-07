/**
 * The wider world: the lands around the mainland, generated in world coordinates after the mainland has been set in.
 *
 * Nothing here touches the mainland's own content. The only mainland tiles ever repainted are sea and sand within
 * twelve tiles of its edge (its old shoreline), where a new land joins on; everything inside that margin is sacrosanct.
 *
 * Layout (world coordinates; the mainland sits at x 185–534, y 160–359):
 *   north      The Deadwood, a huge dead forest, with Gravesend (the graveyard settlement) at its southern edge.
 *   west       Westmarch (remote wilderness) narrowing into the Drakespine, a long rocky peninsula that curls north to
 *              Ashfall, the dragons' country, at its far end.
 *   south      Southshore: beaches and downs, Saltmarrow (fishing) on a bay, Thistle Vale and Hollyhock (apothecary)
 *              in the south-west valley, Dyemoor (tailors) on the river.
 *   east       Ironreach, a mountain range, with Cragmaw (mining) in its pass; The Wilds and Tallgrass (hunters) to the
 *              south-east; Quillhaven (scholars) on a headland in the far south-east.
 *   sea        The Pale Isles, small islands with their own secrets.
 * Four new dungeons live in the dungeon strip (rows 520–579), reached only by their surface entrances.
 */
import { MONSTERS } from "./data.ts";
import { ECO_REGIONS, HERBS } from "./apothecary.ts";
import { buildVillages } from "./villages.ts";
import { buildWest } from "./west.ts";
// REGIONS is read only inside buildExpansion (called from createWorld), never at load, since world.ts imports this module.
import { ARENA_LEGACY as ARENA, MAINLAND_RECT, OVERWORLD_H, REGIONS, T, isWater, legacyMainlandToWorld as mainlandToWorld, type DecorKind, type GenContext, type RegionId, type worldTools } from "./world.ts";
import { ORDERS, ORDER_IDS } from "./knights.ts";

export type Tools = ReturnType<typeof worldTools>;
type Pt = readonly [number, number];

/** A village's site: where it is, its region, and the ground it's built on (filled in by villages.ts). */
export type VillageSite = { id: RegionId; name: string; x: number; y: number; ground: number };
export const villageSites = (): readonly VillageSite[] => [
  { id: "gravesend", name: "Gravesend", x: 300, y: 134, ground: T.COBBLE },
  { id: "saltmarrow", name: "Saltmarrow", x: 424, y: 468, ground: T.WOOD },
  { id: "hollyhock", name: "Hollyhock", x: 160, y: 450, ground: T.PATH },
  { id: "dyemoor", name: "Dyemoor", x: 254, y: 472, ground: T.COBBLE },
  { id: "tallgrass", name: "Tallgrass", x: 556, y: 404, ground: T.PATH },
  { id: "cragmaw", name: "Cragmaw", x: 632, y: 202, ground: T.GRAVEL },
  { id: "quillhaven", name: "Quillhaven", x: 646, y: 402, ground: T.STONE },
];

/** Where the mainland may be repainted: only its old shoreline (sea or sand within twelve tiles of its edge). */
function mainlandMargin(x: number, y: number, tile: number) {
  const inside = x >= MAINLAND_RECT.x0 && x <= MAINLAND_RECT.x1 && y >= MAINLAND_RECT.y0 && y <= MAINLAND_RECT.y1;
  if (!inside) return true;
  const edge = Math.min(x - MAINLAND_RECT.x0, MAINLAND_RECT.x1 - x, y - MAINLAND_RECT.y0, MAINLAND_RECT.y1 - y);
  return edge < 12 && (isWater(tile) || tile === T.SAND);
}

export function buildExpansion(ctx: GenContext, t: Tools, seed: number) {
  const { W, tiles, lift, random, noise, noise2 } = ctx, OH = OVERWORLD_H;
  const { get, put, setRegion, blob, regionBlob, road, river, decor, tree, rock, spot, scatter, monsters, add, clearAt, free, tileIndex, inBounds, fillRect, rockCluster, npc, building } = t;
  const inMainland = (x: number, y: number) => x >= MAINLAND_RECT.x0 && x <= MAINLAND_RECT.x1 && y >= MAINLAND_RECT.y0 && y <= MAINLAND_RECT.y1;
  /** Paint a tile unless it's part of the mainland proper. */
  const paint = (x: number, y: number, terrain: number) => { if (inBounds(x, y) && y < OH && mainlandMargin(x, y, get(x, y))) put(x, y, terrain); };
  const ridge = makeNoise(seed + 101, 7), fine = makeNoise(seed + 103, 3), broad = makeNoise(seed + 107, 23);

  /** A mainland square coordinate in world coordinates. */
  const mainlandSquare = (mx: number, my: number): [number, number] => [mx + MAINLAND_RECT.x0, my + MAINLAND_RECT.y0];
  /** The nearest free walkable tile to a point, the mainland included (places a person, never changes a tile). */
  const nearestLandAnywhere = (cx: number, cy: number): [number, number] => {
    for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy, tt = get(x, y);
      if ((tt === T.GRASS || tt === T.COBBLE || tt === T.PATH || tt === T.DARK_GRASS) && ctx.objectAt[tileIndex(x, y)] < 0 && ctx.objectAt[tileIndex(x, y - 1)] < 0 && get(x, y - 1) !== T.WALL && !ctx.spawns.some(spawn => spawn.x === x && spawn.y === y)) return [x, y];
    }
    return [cx, cy];
  };
  /** The nearest walkable, unoccupied land tile to a point (for landings and the like). */
  const nearestLand = (cx: number, cy: number): [number, number] => {
    for (let r = 0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy, tt = get(x, y);
      if ((tt === T.GRASS || tt === T.SAND || tt === T.DARK_GRASS) && ctx.objectAt[tileIndex(x, y)] < 0 && !inMainland(x, y) && (get(x + 1, y) === T.GRASS || get(x + 1, y) === T.SAND)) return [x, y];
    }
    return [cx, cy];
  };
  // ---------- 1. Land ----------
  // A land field from overlapping, wobbling ellipses; the mainland's own land counts as land for the coast shaping.
  const land = new Uint8Array(W * OH);
  for (let y = 0; y < OH; y++) for (let x = 0; x < W; x++) if (inMainland(x, y) && !isWater(get(x, y))) land[y * W + x] = 1;
  const landBlob = (cx: number, cy: number, rx: number, ry: number, wobble = 0.5) => {
    for (let y = Math.max(0, Math.floor(cy - ry * 1.5)); y <= Math.min(OH - 1, cy + ry * 1.5); y++) for (let x = Math.max(0, Math.floor(cx - rx * 1.5)); x <= Math.min(W - 1, cx + rx * 1.5); x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2, edge = 1 + (broad(x, y) - 0.5) * wobble * 2 + (noise2(x, y) - 0.5) * 0.3;
      if (d <= edge) land[y * W + x] = 1;
    }
  };
  // North: the Deadwood, joined to the mainland's north shore by a broad neck above the Ashen Hills and Whisperwood.
  landBlob(330, 72, 175, 64, 0.6); landBlob(300, 150, 70, 30, 0.4); landBlob(430, 150, 40, 24, 0.5);
  // West: Westmarch, off the Whisperwood shore, narrowing into the Drakespine peninsula and swelling again at Ashfall.
  landBlob(140, 300, 70, 56, 0.5); landBlob(180, 250, 30, 40, 0.4); landBlob(88, 232, 34, 42, 0.5); landBlob(72, 170, 26, 40, 0.5); landBlob(70, 92, 58, 56, 0.55);
  // Return of Raria: the far west. Deep Westmarch runs to the world's edge; the Free Marches lie south-west of it, BarkReach between Westmarch and the Thistle Vale, and Raria behind the Drakespine.
  landBlob(40, 300, 42, 46, 0.45); landBlob(44, 398, 46, 44, 0.5); landBlob(112, 378, 42, 26, 0.5); landBlob(26, 214, 26, 58, 0.4); landBlob(46, 352, 26, 14, 0.4);
  // South: Southshore along the whole south coast, the Thistle Vale valley in the south-west, headlands and bays.
  landBlob(350, 410, 190, 52, 0.7); landBlob(170, 440, 80, 44, 0.5); landBlob(430, 460, 40, 24, 0.6); landBlob(250, 465, 36, 22, 0.5);
  // East: Ironreach, off the Greyhorn shore; The Wilds and Tallgrass to the south-east; Quillhaven's headland.
  landBlob(612, 240, 92, 108, 0.6); landBlob(560, 280, 40, 40, 0.5); landBlob(570, 420, 70, 44, 0.6); landBlob(646, 404, 30, 26, 0.5);
  // The Pale Isles and a few lonely rocks.
  landBlob(96, 500, 24, 12, 0.6); landBlob(50, 420, 14, 10, 0.6); landBlob(560, 70, 18, 12, 0.6); landBlob(690, 500, 16, 12, 0.6); landBlob(20, 300, 9, 7, 0.6);
  // Carve bays so the coast isn't round: scoops of sea back into the land.
  const seaBlob = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.max(0, Math.floor(cy - ry * 1.3)); y <= Math.min(OH - 1, cy + ry * 1.3); y++) for (let x = Math.max(0, Math.floor(cx - rx * 1.3)); x <= Math.min(W - 1, cx + rx * 1.3); x++) {
      if (inMainland(x, y)) continue;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 + (noise2(x, y) - 0.5) * 0.5) land[y * W + x] = 0;
    }
  };
  seaBlob(470, 470, 30, 30); seaBlob(210, 500, 40, 24); seaBlob(140, 150, 40, 30); seaBlob(600, 340, 26, 18); seaBlob(20, 30, 50, 40); seaBlob(690, 120, 30, 40);
  // Distance to the sea over land, and to land over the sea (a few tiles each way), for beaches and shallows.
  const toSea = new Uint8Array(W * OH).fill(255), toLand = new Uint8Array(W * OH).fill(255);
  const sweep = (from: Uint8Array, isSource: (i: number) => boolean, limit: number) => {
    const queue: number[] = [];
    for (let i = 0; i < W * OH; i++) if (isSource(i)) { from[i] = 0; queue.push(i); }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head], d = from[i]; if (d >= limit) continue;
      const x = i % W, y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= OH) continue;
        const j = ny * W + nx; if (from[j] > d + 1) { from[j] = d + 1; queue.push(j); }
      }
    }
  };
  sweep(toSea, i => !land[i], 6); sweep(toLand, i => !!land[i], 5);
  for (let y = 0; y < OH; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (land[i]) paint(x, y, toSea[i] <= 1 ? T.SAND : noise(x, y) > 0.62 ? T.DARK_GRASS : T.GRASS);
    else paint(x, y, toLand[i] <= 3 ? T.WATER : T.DEEP);
    if (!inMainland(x, y)) setRegion(x, y, "coast");
  }

  // ---------- 2. Regions ----------
  regionBlob(330, 72, 170, 62, "deadwood"); regionBlob(300, 150, 66, 28, "deadwood");
  regionBlob(300, 134, 14, 11, "gravesend");
  regionBlob(150, 290, 76, 60, "westmarch"); regionBlob(180, 250, 30, 38, "westmarch");
  regionBlob(86, 225, 34, 44, "drakespine"); regionBlob(72, 165, 26, 40, "drakespine");
  regionBlob(70, 92, 56, 54, "ashfall");
  regionBlob(350, 410, 188, 50, "southshore"); regionBlob(430, 460, 40, 24, "southshore");
  regionBlob(170, 436, 78, 42, "thistle_vale");
  regionBlob(160, 450, 13, 11, "hollyhock"); regionBlob(254, 472, 13, 10, "dyemoor"); regionBlob(424, 468, 15, 11, "saltmarrow");
  regionBlob(612, 240, 90, 106, "ironreach"); regionBlob(560, 280, 38, 38, "ironreach");
  regionBlob(632, 202, 14, 12, "cragmaw");
  regionBlob(574, 420, 68, 42, "the_wilds"); regionBlob(556, 404, 13, 11, "tallgrass");
  regionBlob(646, 404, 28, 24, "quillhaven");
  regionBlob(96, 500, 26, 14, "pale_isles");
  // Return of Raria: the border, the Federation's marches, Westmarch's southern woods, and Raria's eastern march (the kingdom itself is on the far-west continent).
  regionBlob(40, 300, 46, 48, "deep_westmarch"); regionBlob(44, 354, 30, 12, "deep_westmarch"); regionBlob(44, 400, 48, 46, "free_marches"); regionBlob(112, 378, 40, 26, "westmarch"); regionBlob(26, 212, 28, 58, "raria_march");  // (the other islets stay "coast": no ferry calls there, so nothing to gather grows on them)
  // The sea keeps "coast" (set above); the mainland's own tiles are never re-regioned.
  const REGION_ORDER = REGIONS.map(region => region.id), regionIs = (x: number, y: number, id: RegionId) => REGION_ORDER[ctx.region[tileIndex(x, y)]] === id;
  const onLand = (tt: number) => tt === T.GRASS || tt === T.DARK_GRASS;
  const landOnly = (tt: number) => onLand(tt) || tt === T.SAND;

  // ---------- 3. Biomes ----------
  // The Deadwood: pale dead grass, black bog, gravel where nothing grows, and the dead trees themselves.
  for (let y = 0; y < 185; y++) for (let x = 150; x < 520; x++) {
    if (!regionIs(x, y, "deadwood") || inMainland(x, y)) continue;
    const tt = get(x, y); if (!onLand(tt)) continue;
    const n = fine(x, y), m = ridge(x, y);
    if (m < 0.3) paint(x, y, T.SWAMP); else if (n > 0.78) paint(x, y, T.GRAVEL); else if (n < 0.45) paint(x, y, T.DARK_GRASS);
  }
  // Westmarch: rolling downs with dark heather; the Drakespine: gravel and scree with cliffs, rising towards the end.
  for (let y = 100; y < 370; y++) for (let x = 0; x < 230; x++) {
    if (inMainland(x, y)) continue;
    const tt = get(x, y); if (!onLand(tt)) continue;
    if (regionIs(x, y, "westmarch") && noise2(x, y) > 0.6) paint(x, y, T.DARK_GRASS);
    if (regionIs(x, y, "drakespine")) {
      const m = ridge(x * 0.8, y * 0.8), toTip = 1 - Math.min(1, Math.hypot(x - 72, y - 150) / 120);
      if (m > 0.72) paint(x, y, T.CLIFF); else if (m > 0.5 || noise(x, y) > 0.7) paint(x, y, T.GRAVEL);
      lift[tileIndex(x, y)] = Math.max(0, m - 0.35) * 2.2 * (0.4 + toTip);
    }
  }
  // Return of Raria. Deep Westmarch: heather, scrub, rocky outcrops and old battle-ground; the Free Marches: a wet green with the Federation's own gravel; Raria's march: swept ground, farmed in strips round Lawgate, gravel on the heights by the Spine.
  for (let y = 140; y < 460; y++) for (let x = 0; x < 180; x++) {
    if (inMainland(x, y)) continue;
    const tt = get(x, y); if (!onLand(tt)) continue;
    if (regionIs(x, y, "deep_westmarch")) { const m = ridge(x * 1.1, y * 1.1); if (m > 0.74) paint(x, y, T.CLIFF); else if (m > 0.6) paint(x, y, T.GRAVEL); else if (noise2(x, y) > 0.55) paint(x, y, T.DARK_GRASS); lift[tileIndex(x, y)] = Math.max(0, m - 0.5) * 1.4; }
    if (regionIs(x, y, "free_marches")) { if (ridge(x, y) < 0.26) paint(x, y, T.SWAMP); else if (noise2(x, y) > 0.5) paint(x, y, T.DARK_GRASS); }
    if (regionIs(x, y, "raria_march")) { const m = ridge(x * 0.9, y * 0.9), toSpine = Math.max(0, (x - 36) / 16); if (m > 0.72 && toSpine > 0.3) paint(x, y, T.GRAVEL); else if (y > 236 && y < 262 && noise(x * 2, y) > 0.5) paint(x, y, T.FARMLAND); lift[tileIndex(x, y)] = Math.max(0, m - 0.55) * toSpine; }
  }
  // Ashfall: ash fields, lava, cliffs ringing it so the passes matter, and a crater at the far tip.
  for (let y = 20; y < 170; y++) for (let x = 0; x < 150; x++) {
    if (!regionIs(x, y, "ashfall") || inMainland(x, y)) continue;
    const tt = get(x, y); if (!landOnly(tt)) continue;
    const d = ((x - 70) / 56) ** 2 + ((y - 92) / 54) ** 2, m = ridge(x * 1.3, y * 1.3);
    if (d > 0.72 && d < 0.95 && noise2(x, y) > 0.3) paint(x, y, T.CLIFF);
    else if (noise(x * 1.4 + 90, y * 1.4) > 0.73 && d < 0.6) paint(x, y, T.LAVA);
    else paint(x, y, m > 0.62 ? T.GRAVEL : T.ASH);
    lift[tileIndex(x, y)] = Math.max(0, m - 0.5) * 1.6;
  }
  // Ironreach: a mountain range with snow on the heights, cliffs in bands, a pass where the road goes.
  for (let y = 120; y < 370; y++) for (let x = 520; x < W; x++) {
    if (!regionIs(x, y, "ironreach") && !regionIs(x, y, "cragmaw")) continue;
    if (inMainland(x, y)) continue;
    const tt = get(x, y); if (!landOnly(tt)) continue;
    const m = ridge(x * 0.9, y * 0.9), height = Math.max(0, m - 0.3) * 3.2 * Math.min(1, Math.hypot(x - 612, y - 240) < 100 ? 1 : 0.4);
    lift[tileIndex(x, y)] = regionIs(x, y, "cragmaw") ? 0 : height;
    if (regionIs(x, y, "cragmaw")) continue;
    if (m > 0.78) paint(x, y, T.SNOW); else if (m > 0.66 && noise2(x, y) > 0.35) paint(x, y, T.CLIFF); else if (m > 0.52) paint(x, y, T.GRAVEL);
  }
  // Southshore: sandy downs; Thistle Vale: meadows with farmland strips; The Wilds: tall dark grass; Dyemoor's moor.
  for (let y = 360; y < OH; y++) for (let x = 0; x < W; x++) {
    if (inMainland(x, y)) continue;
    const tt = get(x, y); if (!onLand(tt)) continue;
    if (regionIs(x, y, "southshore") && noise(x, y) > 0.72) paint(x, y, T.SAND);
    if (regionIs(x, y, "thistle_vale") && noise2(x, y) < 0.25) paint(x, y, T.DARK_GRASS);
    if (regionIs(x, y, "the_wilds") && noise2(x, y) > 0.4) paint(x, y, T.DARK_GRASS);
    if (regionIs(x, y, "dyemoor") && ridge(x, y) < 0.35) paint(x, y, T.SWAMP);
  }
  // Pale Isles: sand and grass, a rock or two.
  // Rivers: Ironreach's meltwater south to the sea; the Deadwood's black river; the Thistle, down the vale past Dyemoor.
  river([[612, 170], [596, 230], [588, 300], [578, 360], [566, 420], [560, 470]], 3);
  river([[300, 10], [280, 50], [262, 90], [240, 120], [228, 150]], 3.5);
  river([[110, 380], [150, 410], [200, 440], [245, 462], [262, 486], [272, 510]], 3);
  // Shallows beside the rivers so they read as water, not void.
  for (const [cx, cy] of [[228, 150], [272, 510], [560, 470]] as const) blob(cx, cy, 5, 4, T.WATER, 0.3, landOnly);

  // ---------- 4. Roads ----------
  // Long roads out of the mainland: north to Gravesend and into the Deadwood; west across Westmarch and up the
  // Drakespine (ending as a broken gravel track); south to a crossroads and on to every southern village; east through
  // the Ironreach pass to Cragmaw and down to Quillhaven. Roads bridge the water they cross.
  const N0: Pt = [299, 169], S0: Pt = [305, 351], W0: Pt = [194, 250], E0: Pt = [520, 262];
  road([N0, [300, 150], [300, 134]]);                                                    // to Gravesend
  road([[300, 122], [312, 100], [320, 76], [338, 50]], 2.2, T.GRAVEL);                   // the old Deadwood road
  road([[300, 126], [270, 112], [246, 100], [214, 92], [196, 70]], 2.2, T.GRAVEL);        // a woodsmen's track west over the black river
  road([W0, [170, 262], [140, 292], [112, 290]]);                                        // Westmarch
  road([[112, 290], [96, 262], [86, 230], [78, 196], [72, 160], [72, 128]], 2.2, T.GRAVEL);  // up the Drakespine
  // Return of Raria: the West Road on from Westmarch's end into Deep Westmarch, forking to Raria's gate in the north and the Free Marches in the south; the wood road down to BarkReach and on to the Thistle Vale.
  road([[112, 290], [92, 298], [72, 302], [52, 296], [34, 284], [24, 266], [26, 248]]);                      // the West Road to Raria's south gate
  road([[72, 302], [64, 322], [54, 344], [46, 362], [40, 380]]);                                            // south to the FFF Fortress
  road([[92, 298], [100, 322], [108, 346], [112, 362], [118, 382], [128, 400], [120, 414]], 2.2, T.GRAVEL);  // the wood road through BarkReach
  road([[40, 380], [60, 384], [84, 380], [100, 376], [112, 378]], 2.2, T.GRAVEL);                           // the Federation's road east into the wood
  road([[26, 248], [26, 200], [30, 178], [40, 164]], 2.2, T.GRAVEL);                                         // Raria's north road, up towards the Spine
  road([S0, [312, 380], [320, 400]]);                                                    // to the southern crossroads
  road([[320, 400], [300, 440], [262, 462], [254, 472]]);                                // Dyemoor
  road([[262, 462], [220, 448], [176, 450], [160, 450]]);                                // Hollyhock
  road([[320, 400], [360, 430], [400, 456], [424, 468]]);                                // Saltmarrow
  road([[320, 400], [400, 400], [480, 404], [556, 404]]);                                // Tallgrass
  road([E0, [560, 250], [600, 220], [632, 202]]);                                        // Cragmaw, through the pass
  road([[632, 202], [640, 260], [630, 330], [640, 380], [646, 402]], 2.4);               // down to Quillhaven
  road([[556, 404], [600, 404], [630, 404]], 2.2, T.GRAVEL);                             // a hunters' track east
  // Village grounds: a clearing of their own paving where each village will be built.
  for (const site of villageSites()) {
    for (let y = site.y - 9; y <= site.y + 9; y++) for (let x = site.x - 11; x <= site.x + 11; x++) {
      if (!inBounds(x, y) || inMainland(x, y)) continue;
      const tt = get(x, y);
      if (isWater(tt) && site.id !== "saltmarrow") paint(x, y, T.GRASS);
      else if (tt === T.CLIFF || tt === T.LAVA || tt === T.SWAMP) paint(x, y, site.id === "cragmaw" ? T.GRAVEL : T.GRASS);
      clearAt(x, y);
    }
  }
  // Mountain passes: no cliff on a road, and gravel beside it.
  for (let y = 0; y < OH; y++) for (let x = 0; x < W; x++) if (get(x, y) === T.PATH || get(x, y) === T.GRAVEL) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (get(x + dx, y + dy) === T.CLIFF && !inMainland(x + dx, y + dy)) paint(x + dx, y + dy, T.GRAVEL);

  // ---------- 5. Scenery ----------
  const inRegion = (id: RegionId) => (x: number, y: number) => regionIs(x, y, id) && free(x, y) && !inMainland(x, y);
  // ---------- 5a. The Deadwood's dead ----------
  // The forest swallowed villages. What's left: roofless houses, family crypts, railed plots, tombs, obelisks nobody
  // remembers raising, and graves of every kind, everywhere. Footprints go only on clear dead grass, off every road
  // and track, well away from Gravesend, the ruined chapel and the faceless shrine.
  const keepOut = [[284, 116, 318, 152], [328, 38, 348, 56], [398, 30, 418, 48]] as const;
  // The old road and the woodsmen's track are gravel like the Deadwood's bare patches, so the one big footprint that may sit on gravel keeps off their whole run.
  const roads = [[294, 46, 344, 130], [192, 66, 306, 132]] as const;
  const openGround = (x0: number, y0: number, x1: number, y1: number, gravelToo = false) => {
    if (keepOut.some(([a, b, c, d]) => x1 >= a && x0 <= c && y1 >= b && y0 <= d)) return false;
    if (gravelToo && roads.some(([a, b, c, d]) => x1 >= a && x0 <= c && y1 >= b && y0 <= d)) return false;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!inBounds(x, y) || y >= OH || !regionIs(x, y, "deadwood") || inMainland(x, y) || !free(x, y)) return false;
      const tt = get(x, y); if (tt !== T.GRASS && tt !== T.DARK_GRASS && !(gravelToo && tt === T.GRAVEL)) return false;
    }
    return true;
  };
  const findGround = (w: number, h: number, tries = 400, gravelToo = false): [number, number] | null => {
    for (let i = 0; i < tries; i++) { const x = 160 + Math.floor(random() * 340), y = 6 + Math.floor(random() * 170); if (openGround(x - 1, y - 1, x + w + 1, y + h + 1, gravelToo)) return [x, y]; }
    return null;
  };
  const pick = <X,>(list: readonly X[]) => list[Math.floor(random() * list.length)];
  const EPITAPHS = ["Here lies Tam Ashworth, who went into the trees", "A grave with no name", "A grave, the stone split by frost", "Three small graves, one stone",
    "'Beloved.' The rest is gone.", "A grave, fresh. Nobody in Gravesend will say whose.", "'She said she heard singing.'", "A grave with a lantern on it, lit",
    "'He kept the altar swept.' An old Dawnhold grave.", "A grave the roots have lifted half out of the ground", "A grave marked only with the symbol from the stones",
    "'Came back. Buried twice.'", "A grave someone still leaves flowers on", "A child's grave with a wooden horse on it", "'Lost in the Deadwood. Found in the Deadwood.'",
    "A grave, the name scratched out", "A grave turned to face west, like the watch-stones", "'Gone to see what the trees wanted.'", "A grave with two names and one body's worth of earth"];
  const epitaph = () => random() < 0.35 ? pick(EPITAPHS) : undefined;
  const TOMB_NAMES = ["A stone tomb, the lid askew", "A stone tomb, sealed", "A tomb carved with vines that never grew here", "A tomb. Somebody has been sleeping on it.", "A tomb with the symbol from the stones cut deep into the lid", "A tomb, the lid moved from the inside"];
  const BONE_NAMES = ["Bones", "Bones, arranged in a circle", "Bones. Not all the same creature.", "Bones, very old, very tidy", "A skull on a stick, facing the road"];
  const CRYPT_NAMES = ["Family crypt, the name worn off", "Crypt of the Ashworths", "Crypt of House Vellan", "A crypt, the door bricked up from outside", "A crypt, the door open", "Crypt of the Three Sisters", "A crypt with fresh flowers at the door", "A crypt with no door at all"];
  // Ruined houses: roofless, walls down in places, the floors gone to rubble, and what the people left behind.
  const RUIN_NAMES = ["Ruined cottage", "Ruined farmhouse", "Ruined mill house", "Ruined chapel-of-ease", "Ruined inn", "Ruined smithy", "Ruined longhouse", "Ruined watch-house", "Ruined granary", "Ruined schoolhouse", "Ruined bakehouse", "Ruined weaver's house", "Ruined almshouse", "Ruined tollhouse"];
  const RUIN_INSIDES: readonly (readonly [DecorKind, string])[] = [["rubble", "A fallen roof-beam"], ["bones", "Bones. Somebody stayed."], ["table", "A table laid for four, the plates long gone"], ["bed", "A bed, the blankets rotted to lace"],
    ["crate", "A crate of nothing"], ["barrel", "A barrel, dry"], ["chest", "An empty chest, the lock forced long ago"], ["armour", "A rusted helm on a peg"], ["shelf", "Shelves. Somebody's whole life, mouldered."], ["bench", "A bench by a hearth that doesn't remember fire"], ["rubble", "The hearthstone, cracked"]];
  const ruinHouse = (x0: number, y0: number, w: number, h: number, name: string, extra?: (x0: number, y0: number, x1: number, y1: number) => void) => {
    const x1 = x0 + w, y1 = y0 + h, door = pick(["n", "s", "e", "w"] as const);
    t.building(x0, y0, x1, y1, door, T.STONE, undefined, { name, color: "#6d6b67", walls: "stone", roof: "none" });
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (get(x, y) === T.WALL && noise2(x * 1.3, y * 1.3) > 0.5) put(x, y, T.GRAVEL);
      else if (get(x, y) === T.STONE && random() < 0.3) put(x, y, T.GRAVEL);
    }
    const inside = 1 + Math.floor(random() * 3);
    for (let k = 0; k < inside; k++) { const [kind, label] = pick(RUIN_INSIDES), x = x0 + 1 + Math.floor(random() * (w - 1)), y = y0 + 1 + Math.floor(random() * (h - 1)); if (free(x, y)) decor(x, y, kind, true, label); }
    extra?.(x0, y0, x1, y1);
  };
  // Ashworth Hall: the manor the Deadwood took first. The family buried their own under the hall floor.
  const hall = findGround(11, 7, 2000) ?? findGround(11, 7, 3000, true);
  if (hall) ruinHouse(hall[0], hall[1], 11, 7, "Ashworth Hall, ruined", (x0, y0, x1, y1) => {
    const cx = Math.floor((x0 + x1) / 2), cy = Math.floor((y0 + y1) / 2);
    if (free(cx, cy)) decor(cx, cy, "tomb", true, "The Ashworths' tomb, under what was the hall floor. The lid is askew.");
    if (free(cx - 3, cy)) decor(cx - 3, cy, "armour", true, "A suit of armour, still standing guard over nothing"); if (free(cx + 3, cy)) decor(cx + 3, cy, "armour", true, "A suit of armour, fallen");
    if (free(cx, y1 + 2)) decor(cx, y1 + 2, "obelisk", true, "The Ashworth obelisk: every name in the family, the last cut in a hurry");
    if (free(cx - 2, y0 + 1)) decor(cx - 2, y0 + 1, "bones", true, "Bones at the high table"); if (free(cx + 2, y0 + 1)) decor(cx + 2, y0 + 1, "table", true, "The high table, set");
  });
  let ruined = 0;
  for (let i = 0; i < 20 && ruined < 14; i++) {
    const w = 4 + Math.floor(random() * 4), h = 3 + Math.floor(random() * 3), at = findGround(w, h); if (!at) continue;
    ruinHouse(at[0], at[1], w, h, RUIN_NAMES[ruined % RUIN_NAMES.length]); ruined++;
  }
  // Named crypts: little stone houses for the dead, roofed, with a tomb inside and a story on it.
  const CRYPTS: readonly [string, string][] = [["Crypt of the Ashworths", "A stone tomb. The Ashworth name, worn almost smooth. Tam's is the newest cut, and it isn't finished."],
    ["Crypt of House Vellan", "A stone tomb with a dyer's blue still in the carving. Vell's grandfather's grandfather. Vell has the receipt."],
    ["Crypt of the Three Sisters", "Three names. One date. Nobody in Gravesend will say what happened, which in Gravesend means everybody knows."],
    ["The Namekeeper's Crypt", "A tomb carved in a hand nobody reads. The Namekeeper's register goes back further than the town. So does this."],
    ["Crypt, unmarked", "A tomb with no name. The lid has been moved, from the inside, and put back carefully."],
    ["Crypt of the Altar-Keepers", "A tomb for the people who kept the altars swept, before there was an Order. The sun disc over the door has a beard carved into it."]];
  for (const [name, tombText] of CRYPTS) {
    const at = findGround(4, 3); if (!at) continue;
    const [x0, y0] = at;
    t.building(x0, y0, x0 + 4, y0 + 3, "s", T.STONE, undefined, { name, color: "#7a7772", walls: "stone", roof: "flat" });
    decor(x0 + 2, y0 + 1, "tomb", true, tombText); if (random() < 0.6) decor(x0 + 1, y0 + 2, "bones", true, pick(BONE_NAMES));
    if (free(x0 + 1, y0 + 4)) decor(x0 + 1, y0 + 4, "torch", true, "A candle at the crypt door, lit"); if (free(x0 + 3, y0 + 4)) decor(x0 + 3, y0 + 4, "torch", true, "A candle at the crypt door, lit");
  }
  // Railed plots: rusted iron round a family's dead, a gate on the south side, a tomb or an obelisk in the middle of the grander ones.
  for (let i = 0; i < 10; i++) {
    const w = 5 + Math.floor(random() * 4), h = 4 + Math.floor(random() * 3), at = findGround(w, h); if (!at) continue;
    const [x0, y0] = at, x1 = x0 + w, y1 = y0 + h, gate = x0 + Math.floor(w / 2), rail = (x: number, y: number) => decor(x, y, "fence", true, "Iron railing, rusted");
    for (let x = x0; x <= x1; x++) { rail(x, y0); if (x !== gate && x !== gate + 1) rail(x, y1); }
    for (let y = y0 + 1; y < y1; y++) { rail(x0, y); rail(x1, y); }
    const cx = x0 + Math.floor(w / 2), cy = y0 + Math.floor(h / 2);
    if (random() < 0.5) decor(cx, cy, random() < 0.5 ? "obelisk" : "tomb", true, random() < 0.5 ? "A family's obelisk, the names running out of room" : pick(TOMB_NAMES));
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) if ((x + y) % 2 === 0 && random() < 0.75 && free(x, y)) decor(x, y, random() < 0.2 ? "tomb" : "grave", true, epitaph() ?? (random() < 0.5 ? undefined : "A grave in the family plot"));
  }
  // Loose in the trees: graves of every kind, tombs, little crypts, bone-heaps, obelisks, and the walls of houses that didn't even leave a floor.
  scatter(150, 0, 520, 185, 20, (x, y) => decor(x, y, "crypt", true, pick(CRYPT_NAMES)), (x, y) => openGround(x - 1, y - 1, x + 1, y + 1));
  scatter(150, 0, 520, 185, 14, (x, y) => decor(x, y, "obelisk", true, "An obelisk, carved all over with the symbol from the stones"), (x, y) => openGround(x, y, x, y));
  scatter(150, 0, 520, 185, 70, (x, y) => decor(x, y, "tomb", true, pick(TOMB_NAMES)), inRegion("deadwood"));
  scatter(150, 0, 520, 185, 60, (x, y) => decor(x, y, "bones", false, pick(BONE_NAMES)), inRegion("deadwood"));
  scatter(150, 0, 520, 185, 260, (x, y) => decor(x, y, "grave", true, epitaph()), inRegion("deadwood"));
  scatter(150, 0, 520, 185, 160, (x, y) => decor(x, y, random() > 0.5 ? "rubble" : "ruin_wall"), inRegion("deadwood"));
  // The Deadwood: dense dead trees, a few hardy yews; thicker the deeper north you go.
  scatter(150, 0, 520, 185, 1700, (x, y) => tree(x, y, "deadwood"), (x, y) => inRegion("deadwood")(x, y) && random() < 0.35 + (1 - y / 185) * 0.6);
  scatter(150, 0, 520, 185, 60, (x, y) => tree(x, y, "yew"), inRegion("deadwood"));
  scatter(150, 0, 520, 185, 40, (x, y) => decor(x, y, "torch", true, "Will-o'-the-wisp lantern"), inRegion("deadwood"));
  // Westmarch: oaks and willows in clumps, boulders, the odd lonely house further on.
  scatter(60, 220, 230, 370, 220, (x, y) => tree(x, y, random() > 0.6 ? "oak" : "tree"), inRegion("westmarch"));
  scatter(60, 220, 230, 370, 40, (x, y) => tree(x, y, "willow"), inRegion("westmarch"));
  scatter(60, 220, 230, 370, 50, (x, y) => decor(x, y, "boulder"), inRegion("westmarch"));
  // The Drakespine: scree, dead trees, pines on the slopes, rocks worth mining up high.
  scatter(30, 110, 130, 280, 90, (x, y) => random() > 0.5 ? decor(x, y, "boulder") : tree(x, y, "deadwood"), inRegion("drakespine"));
  scatter(30, 110, 130, 280, 60, (x, y) => tree(x, y, "pine"), inRegion("drakespine"));
  scatter(30, 110, 130, 280, 14, (x, y) => rock(x, y, "inkcoal"), inRegion("drakespine"));
  scatter(30, 110, 130, 280, 8, (x, y) => rock(x, y, "glimmer"), inRegion("drakespine"));
  // Ashfall: ruins of whoever lived here before the dragons, and bones.
  scatter(10, 30, 130, 150, 60, (x, y) => decor(x, y, random() > 0.4 ? "pillar" : "ruin_wall"), inRegion("ashfall"));
  scatter(10, 30, 130, 150, 40, (x, y) => decor(x, y, "rubble"), inRegion("ashfall"));
  scatter(10, 30, 130, 150, 24, (x, y) => tree(x, y, "deadwood"), inRegion("ashfall"));
  scatter(10, 30, 130, 150, 10, (x, y) => rock(x, y, "rarite"), inRegion("ashfall"));
  // Southshore: palms on the beaches, bushes and flowers on the downs, reeds by the river mouths.
  scatter(150, 360, 560, OH - 1, 90, (x, y) => tree(x, y, "palm"), (x, y) => inRegion("southshore")(x, y) && get(x, y) === T.SAND);
  scatter(150, 360, 560, OH - 1, 160, (x, y) => (random() > 0.5 ? decor(x, y, "bush") : decor(x, y, "flowers", false)), inRegion("southshore"));
  scatter(150, 360, 560, OH - 1, 120, (x, y) => tree(x, y, random() > 0.7 ? "willow" : "tree"), inRegion("southshore"));
  // Thistle Vale: meadow flowers, maples and oaks, farmland strips the herb gardens will grow on.
  scatter(80, 380, 250, 500, 200, (x, y) => decor(x, y, "flowers", false), inRegion("thistle_vale"));
  scatter(80, 380, 250, 500, 110, (x, y) => tree(x, y, random() > 0.5 ? "maple" : "oak"), inRegion("thistle_vale"));
  scatter(80, 380, 250, 500, 50, (x, y) => decor(x, y, "bush"), inRegion("thistle_vale"));
  // The Wilds: tall grass and thickets, boulders, game.
  scatter(500, 370, 660, 480, 180, (x, y) => tree(x, y, random() > 0.5 ? "oak" : "tree"), inRegion("the_wilds"));
  scatter(500, 370, 660, 480, 120, (x, y) => decor(x, y, "bush"), inRegion("the_wilds"));
  scatter(500, 370, 660, 480, 40, (x, y) => decor(x, y, "boulder"), inRegion("the_wilds"));
  // Ironreach: pines below the snow, boulders, and the ore that made Cragmaw.
  scatter(520, 120, 719, 370, 160, (x, y) => tree(x, y, "pine"), (x, y) => inRegion("ironreach")(x, y) && get(x, y) !== T.SNOW);
  scatter(520, 120, 719, 370, 120, (x, y) => decor(x, y, "boulder"), inRegion("ironreach"));
  for (const [kind, n] of [["blackiron", 16], ["inkcoal", 14], ["moonsilver", 8], ["glimmer", 6], ["gem", 4]] as const) scatter(560, 150, 719, 330, n, (x, y) => rock(x, y, kind), inRegion("ironreach"));
  rockCluster(640, 190, 6, "blackiron", 6); rockCluster(624, 214, 5, "inkcoal", 5);
  // Quillhaven's headland: cypress-like pines, standing stones.
  scatter(610, 370, 690, 440, 40, (x, y) => tree(x, y, "pine"), inRegion("quillhaven"));
  scatter(610, 370, 690, 440, 14, (x, y) => decor(x, y, "pillar", true, "Standing stone"), inRegion("quillhaven"));
  // The Pale Isles: palms and a rock or two.
  scatter(0, 380, 150, OH - 1, 30, (x, y) => tree(x, y, "palm"), inRegion("pale_isles"));
  scatter(540, 40, 600, 100, 12, (x, y) => tree(x, y, "pine"), inRegion("pale_isles"));
  // Fishing all round the new coasts.
  t.shoreSpots(410, 474, 440, 486, "net", 4); t.shoreSpots(410, 474, 440, 486, "deep", 3); t.shoreSpots(240, 480, 270, 495, "bait", 3);
  t.shoreSpots(86, 494, 106, 506, "deep", 3); t.shoreSpots(636, 414, 660, 426, "lure", 3);
  // The Saltmarrow ferry: a boat at the end of the south dock sails to the Pale Isles and back (a crossing you can't walk).
  const landing = nearestLand(96, 500);
  clearAt(431, 486); put(431, 486, T.WOOD);
  add({ kind: "ladder", x: 431, y: 486, blocks: true, name: "Ferry to the Pale Isles", action: "Sail-to", to: { x: landing[0], y: landing[1] } });
  clearAt(landing[0] + 1, landing[1]); put(landing[0] + 1, landing[1], T.SAND);
  add({ kind: "ladder", x: landing[0] + 1, y: landing[1], blocks: true, name: "Ferry to Saltmarrow", action: "Sail-to", to: { x: 431, y: 484 } });
  decor(430, 487, "boat", true, "The Gullwing II"); decor(landing[0] + 1, landing[1] + 1, "boat", true, "The Gullwing II");
  // Secrets and strange places: a house far out in the Westmarch with nobody home, a lone grave on an island, a
  // circle of stones in The Wilds, a drowned pier on the Pale Isles.
  t.building(96, 332, 101, 336, "s", T.WOOD, undefined, { name: "Lonely house", color: "#6d6b67", chimney: true });
  decor(98, 333, "bed"); decor(100, 335, "table"); decor(97, 335, "chest", true, "Dusty chest");
  decor(50, 418, "grave", true, "A grave, far from anywhere");
  for (const [dx, dy] of [[-4, 0], [4, 0], [0, -3], [0, 3], [-3, -2], [3, -2], [-3, 2], [3, 2]] as const) decor(600 + dx, 450 + dy, "pillar", true, "Standing stone");
  for (let x = 84; x <= 92; x++) if (isWater(get(x, 506))) put(x, 506, T.BRIDGE);
  decor(93, 506, "boat", true, "Wreck");

  // ---------- 5b. Things that tell a story without saying it ----------
  // A burned farmhouse out in Westmarch: three beds, one small; a cold hearth; a broken sword; a toy; footprints to the trees. Nobody explains it.
  t.building(150, 326, 157, 331, "s", T.WOOD, undefined, { name: "Burned farmhouse", color: "#3b3a38", walls: "plank", roof: "none" });
  for (let y = 326; y <= 331; y++) for (let x = 150; x <= 157; x++) if (get(x, y) === T.WALL && noise2(x * 2, y * 2) > 0.45) put(x, y, T.ASH);
  for (let y = 327; y <= 330; y++) for (let x = 151; x <= 156; x++) put(x, y, T.ASH);
  decor(151, 327, "bed", true, "A bed, burnt"); decor(153, 327, "bed", true, "A bed, burnt"); decor(155, 327, "bed", true, "A small bed, burnt");
  decor(156, 330, "rubble", true, "A cold hearth"); decor(152, 330, "crate", true, "A child's wooden horse, unburnt"); decor(154, 329, "armour", true, "A broken sword, driven into the floor");
  decor(158, 334, "flowers", false, "Footprints, old, leading into the trees"); decor(160, 337, "flowers", false, "Footprints, old, leading into the trees"); decor(162, 340, "flowers", false, "Footprints. Then nothing.");
  // Up the Thistle Vale, a farmer has a carved stone for a fence post. It's an altar. He doesn't care.
  for (let x = 118; x <= 132; x++) clearAt(x, 414);
  for (let x = 118; x <= 130; x += 2) decor(x, 414, "fence");
  decor(132, 414, "pillar", true, "An old carved stone, used as a fence post. It's an altar. Nobody minds.");
  // The Thistle road crosses ancient stonework where the mud's worn through.
  for (let x = 262; x <= 300; x++) for (let y = 440; y <= 464; y++) if (get(x, y) === T.PATH && noise2(x * 1.7, y * 1.7) > 0.72) put(x, y, T.COBBLE);
  // Deep in the Deadwood, a shrine to a figure like the Old Friend. The face has been chiselled off. The Order doesn't like it mentioned.
  for (let y = 36; y <= 42; y++) for (let x = 404; x <= 412; x++) { clearAt(x, y); paint(x, y, T.GRAVEL); }
  decor(408, 38, "statue", true, "A statue of a bearded figure. The face has been chiselled off, carefully."); decor(406, 41, "pillar", true, "Standing stone, carved with a symbol nobody reads"); decor(410, 41, "pillar", true, "Standing stone, carved with the same symbol");
  decor(408, 41, "torch", true, "A candle, lit. Somebody comes here.");
  // Under Ironreach's slopes, an ancient mechanism nobody built and nobody understands, half-buried.
  decor(590, 212, "windmill", true, "An ancient mechanism: gears the size of cartwheels, seized. Not a mill. Not anything."); decor(592, 214, "rubble", true, "Fallen gearwork, older than Cragmaw"); decor(588, 215, "pillar", true, "A pillar carved with the symbol from the stones");
  // A fisherman's shack on the Southshore with the nets still hung, and nobody in it for years.
  t.building(366, 428, 370, 431, "s", T.WOOD, undefined, { name: "Fisherman's shack", color: "#6d6b67", walls: "plank" });
  decor(367, 429, "bed", true, "A bed, made"); decor(369, 429, "barrel", true, "Nets, hung to dry years ago"); decor(372, 433, "boat", true, "A boat, keel up, bleached");
  // The Friendhollow castle was built against something from the west: on the Westmarch road, a line of old watch-stones faces west, every one toppled the same way.
  // Homestead Row: the steward keeps the deed to a plot west of the road (the cottage itself is painted in when a deed is bought).
  clearAt(158, 272); npc("steward", 158, 272); clearAt(158, 274); decor(158, 274, "fence", true, "Homestead Row: a plot with a deed, from Steward Alder");
  for (const x of [166, 160, 154, 148, 142]) { clearAt(x, 262 + (x % 4 === 0 ? 1 : -1)); decor(x, 262 + (x % 4 === 0 ? 1 : -1), "rubble", true, "A toppled watch-stone, fallen westward"); }
  // ---------- 6. Creatures (the Realm's existing bestiary; the new regions' own come with their villages and skills) ----------
  monsters("skeleton", 200, 30, 460, 150, 26); monsters("shade", 220, 10, 440, 110, 16); monsters("wolf", 160, 100, 300, 180, 10); monsters("cairn_wight", 260, 20, 400, 90, 8);
  monsters("gloom_hound", 300, 10, 400, 60, 5);
  monsters("boar", 70, 230, 220, 360, 12); monsters("bandit", 100, 250, 200, 340, 8); monsters("wolf", 60, 240, 160, 330, 6);
  monsters("highland_goat", 40, 120, 120, 270, 10); monsters("stone_golem", 40, 140, 110, 240, 5); monsters("frost_wisp", 40, 110, 100, 200, 4);
  monsters("ash_drake", 20, 40, 120, 140, 8); monsters("cinder_drake", 30, 50, 110, 130, 5);
  monsters("boar", 160, 370, 540, 500, 12); monsters("bandit", 300, 380, 520, 440, 8); monsters("forest_spider", 90, 390, 240, 490, 8);
  monsters("boar", 500, 380, 660, 480, 10); monsters("wolf", 500, 380, 660, 480, 8); monsters("highland_goat", 500, 380, 660, 480, 6); monsters("thornback", 520, 400, 660, 480, 5);
  monsters("stone_golem", 560, 130, 700, 330, 10); monsters("frost_yeti", 560, 130, 700, 320, 6); monsters("cairn_wight", 560, 140, 700, 320, 6); monsters("highland_goat", 540, 130, 700, 340, 10);
  monsters("sand_scorpion", 60, 480, 140, 519, 4); monsters("skeleton", 540, 40, 600, 100, 4);

  // ---------- 7. Underground: four new dungeons in the strip, each with a surface entrance that gives nothing away ----------
  const dungeon = (id: RegionId, rooms: readonly (readonly [number, number, number, number])[], floor: number) => {
    for (const [x0, y0, x1, y1] of rooms) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { put(x, y, floor); setRegion(x, y, id); }
  };
  // The Deadwood Catacombs, under the ruined chapel at the end of the old road: galleries of the restless dead.
  dungeon("catacombs", [[20, 524, 60, 532], [56, 528, 100, 531], [96, 522, 130, 540], [30, 532, 70, 546], [60, 544, 120, 547], [130, 528, 170, 544]], T.DUNGEON);
  t.building(334, 44, 342, 50, "s", T.STONE, undefined, { name: "Ruined chapel", color: "#6d6b67", walls: "stone", roof: "none" });
  for (let y = 44; y <= 50; y++) for (let x = 334; x <= 342; x++) if (get(x, y) === T.WALL && noise2(x, y) > 0.55) put(x, y, T.GRAVEL);
  add({ kind: "ladder", x: 338, y: 47, blocks: true, name: "Catacomb stairs", action: "Climb-down", to: { x: 24, y: 528 } });
  add({ kind: "ladder", x: 22, y: 528, blocks: true, name: "Stairs", action: "Climb-up", to: { x: 338, y: 51 } });
  add({ kind: "altar", x: 160, y: 536, blocks: true, name: "Bone altar", text: "bone" }); decor(160, 534, "old_friend");
  for (let x = 34; x <= 66; x += 8) { decor(x, 524, "pillar"); decor(x, 546, "torch", true); }
  decor(104, 524, "chest", true, "Ossuary chest"); decor(166, 540, "grave", true, "The Deadwood's first grave");
  monsters("skeleton", 20, 522, 170, 547, 18); monsters("shade", 56, 522, 170, 547, 10); monsters("cairn_wight", 96, 522, 170, 547, 8); monsters("hollow_weaver", 130, 528, 170, 544, 2);
  // The Wyrm's Lair, under Ashfall's crater: the dragons' own halls.
  dungeon("wyrm_lair", [[20, 556, 70, 566], [66, 560, 110, 563], [106, 554, 170, 576], [30, 566, 100, 577]], T.ASH);
  for (let y = 554; y <= 577; y++) for (let x = 20; x <= 170; x++) if (get(x, y) === T.ASH && noise(x * 1.4, y * 1.4) > 0.74) put(x, y, T.LAVA);
  add({ kind: "ladder", x: 70, y: 70, blocks: true, name: "Crater mouth", action: "Climb-down", to: { x: 24, y: 560 } });
  add({ kind: "ladder", x: 22, y: 560, blocks: true, name: "Crater wall", action: "Climb-up", to: { x: 70, y: 72 } });
  for (let x = 28; x <= 60; x += 8) decor(x, 556, "pillar"); decor(166, 556, "chest", true, "Dragon's hoard"); decor(140, 574, "chest", true, "Dragon's hoard");
  monsters("ash_drake", 20, 554, 170, 577, 10); monsters("cinder_drake", 66, 554, 170, 577, 8);
  // Saltmarrow's sea cave, under a ladder in an abandoned dock hut: the drowned, and what the tide brings in.
  dungeon("sea_cave", [[548, 524, 600, 532], [596, 528, 640, 531], [636, 522, 700, 540], [560, 532, 600, 546]], T.STONE);
  for (let y = 522; y <= 546; y++) for (let x = 548; x <= 700; x++) if (get(x, y) === T.STONE && noise2(x * 1.3, y * 1.3) > 0.68 && ![528, 529, 530, 531, 538, 539].includes(y) && !(x >= 560 && x <= 600 && y >= 532 && y <= 534) && !(x >= 636 && x <= 640)) put(x, y, T.WATER);
  t.building(436, 476, 440, 479, "n", T.WOOD, undefined, { name: "Abandoned hut", color: "#6d6b67", walls: "plank" });
  add({ kind: "ladder", x: 438, y: 478, blocks: true, name: "Trapdoor", action: "Climb-down", to: { x: 552, y: 528 } });
  add({ kind: "ladder", x: 550, y: 528, blocks: true, name: "Ladder", action: "Climb-up", to: { x: 438, y: 475 } });
  decor(696, 530, "chest", true, "Barnacled chest"); decor(590, 526, "boat", true, "Smashed boat"); for (let x = 560; x <= 596; x += 9) decor(x, 546, "torch", true);
  monsters("skeleton", 548, 522, 700, 546, 10); monsters("swamp_lurker", 560, 522, 700, 546, 8); monsters("mire_crawler", 596, 522, 700, 546, 6);
  // Cragmaw's deep mine, down the shaft behind the camp: the richest rock in the Realm, and what woke in it.
  dungeon("deep_mine", [[548, 556, 620, 566], [616, 560, 660, 563], [656, 554, 710, 576], [560, 566, 640, 577]], T.DUNGEON);
  add({ kind: "ladder", x: 550, y: 560, blocks: true, name: "Mine shaft", action: "Climb-up", to: { x: 640, y: 197 } });  // (the shaft down is in Cragmaw: villages.ts)
  for (const [kind, n, x0, x1] of [["blackiron", 8, 548, 620], ["inkcoal", 8, 548, 660], ["moonsilver", 6, 616, 710], ["glimmer", 5, 656, 710], ["rarite", 4, 656, 710], ["gem", 3, 560, 640]] as const) {
    scatter(x0, 554, x1, 577, n, (x, y) => rock(x, y, kind), (x, y) => get(x, y) === T.DUNGEON && ctx.objectAt[tileIndex(x, y)] < 0);
  }
  for (let x = 556; x <= 612; x += 8) decor(x, 556, "torch", true); decor(706, 574, "chest", true, "Foreman's chest");
  monsters("stone_golem", 548, 554, 710, 577, 10); monsters("ember_salamander", 616, 554, 710, 577, 5); monsters("gloom_hound", 656, 554, 710, 577, 4);
  // ---------- 7b. The dungeon update: three more dungeons, and coffers in every one ----------
  /** A dungeon coffer: random loot by the dungeon it's in (dungeons.ts), once in a while. Never where it would wall a passage. */
  const coffers = (name: string, x0: number, y0: number, x1: number, y1: number, n: number, floor: number) =>
    scatter(x0, y0, x1, y1, n, (x, y) => decor(x, y, "chest", true, name), (x, y) => get(x, y) === floor && ctx.objectAt[tileIndex(x, y)] < 0
      && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => get(x + dx, y + dy) === floor && ctx.objectAt[tileIndex(x + dx, y + dy)] < 0));
  // The Deepglass Caverns, through a crevice on Glass Lake's east shore: crystal, lake-glass crabs, and the lake's heart.
  dungeon("deepglass", [[404, 526, 424, 534], [422, 522, 450, 540], [408, 538, 440, 546], [448, 530, 453, 533], [454, 531, 455, 531], [456, 524, 470, 546]], T.STONE);
  add({ kind: "ladder", x: 392, y: 326, blocks: true, name: "Crevice in the rock", action: "Climb-down", to: { x: 406, y: 530 } });
  add({ kind: "ladder", x: 405, y: 530, blocks: true, name: "Crevice", action: "Climb-up", to: { x: 392, y: 327 } });
  add({ kind: "gate", x: 454, y: 531, blocks: true, name: "Crystal door", action: "Unlock", to: { x: 456, y: 531 }, requires: { item: "deepglass_key" } });
  for (const [kind, n, x0, x1] of [["gem", 5, 422, 450], ["glimmer", 4, 422, 450], ["moonsilver", 4, 404, 440]] as const) {
    scatter(x0, 522, x1, 546, n, (x, y) => rock(x, y, kind), (x, y) => get(x, y) === T.STONE && ctx.objectAt[tileIndex(x, y)] < 0);
  }
  for (let x = 408; x <= 420; x += 6) decor(x, 526, "torch", true); for (let x = 426; x <= 446; x += 10) decor(x, 522, "pillar"); decor(412, 538, "boulder"); decor(436, 546, "rubble"); decor(463, 524, "pillar"); decor(468, 546, "boulder");
  coffers("Deepglass coffer", 404, 522, 450, 546, 4, T.STONE); decor(468, 530, "chest", true, "The lake's hoard");
  monsters("cave_bat", 404, 522, 450, 546, 10); monsters("glass_crab", 422, 522, 450, 546, 8); monsters("glass_crab", 408, 538, 440, 546, 4); monsters("cave_spider", 408, 538, 440, 546, 3);
  monsters("crystal_golem", 463, 535, 463, 535, 1);
  // The Drowned Archive, under a trapdoor in the Quillhaven library: the flooded bottom floor, its readers, and its keeper.
  dungeon("drowned_archive", [[474, 524, 500, 532], [498, 528, 520, 531], [516, 522, 540, 540], [504, 531, 508, 534], [478, 534, 510, 546], [511, 545, 513, 545], [514, 542, 540, 547]], T.STONE);
  for (let y = 522; y <= 540; y++) for (let x = 516; x <= 540; x++) if (get(x, y) === T.STONE && noise2(x * 1.7, y * 1.7) > 0.7 && y !== 529 && y !== 530 && x !== 516 && x !== 517) put(x, y, T.WATER);
  add({ kind: "ladder", x: 475, y: 528, blocks: true, name: "Ladder", action: "Climb-up", to: { x: 642, y: 397 } });
  add({ kind: "gate", x: 512, y: 545, blocks: true, name: "Sealed reading room", action: "Unlock", to: { x: 514, y: 545 }, requires: { item: "archive_key" } });
  for (const sx of [478, 482, 486, 490, 494]) decor(sx, 524, "shelf", true, "Swollen bookshelves"); decor(488, 528, "table", true, "The reading table"); for (const sx of [482, 490, 498, 506]) decor(sx, 534, "shelf", true, "Drowned stacks");
  for (let x = 476; x <= 496; x += 10) decor(x, 532, "torch", true); decor(520, 524, "pillar"); decor(536, 538, "pillar"); decor(530, 546, "torch", true);
  for (const sx of [518, 526, 534]) decor(sx, 542, "shelf", true, "The sealed shelves"); decor(538, 544, "table", true, "The Archivist's lectern");
  coffers("Archive coffer", 474, 522, 540, 540, 4, T.STONE); decor(539, 547, "chest", true, "The Archivist's chest");
  monsters("drowned_scholar", 474, 522, 520, 546, 12); monsters("ink_wraith", 516, 522, 540, 540, 6); monsters("cave_bat", 474, 522, 540, 546, 4); monsters("cave_spider", 478, 534, 510, 546, 3);
  monsters("archivist_below", 528, 545, 528, 545, 1);
  // The Howling Vault, under the ring of standing stones in The Wilds: a long gallery of the Wilds' buried, and their lord.
  dungeon("howling_vault", [[190, 566, 372, 569], [200, 562, 220, 565], [230, 562, 250, 565], [240, 570, 262, 577], [290, 562, 320, 565], [340, 570, 372, 577], [373, 567, 375, 567], [376, 560, 395, 577]], T.DUNGEON);
  add({ kind: "ladder", x: 600, y: 450, blocks: true, name: "Vault mouth", action: "Climb-down", to: { x: 192, y: 567 } });
  add({ kind: "ladder", x: 191, y: 567, blocks: true, name: "Vault steps", action: "Climb-up", to: { x: 600, y: 451 } });
  add({ kind: "gate", x: 374, y: 567, blocks: true, name: "The Howling King's door", action: "Unlock", to: { x: 376, y: 567 }, requires: { item: "vault_key" } });
  for (let x = 196; x <= 364; x += 12) decor(x, 566, x % 24 === 4 ? "torch" : "pillar", true);
  for (const [x, y] of [[204, 562], [214, 565], [236, 562], [246, 565], [296, 562], [314, 565], [250, 576], [352, 576], [366, 571]] as const) decor(x, y, "tomb", true, "A vault tomb");
  for (const [x, y] of [[208, 564], [244, 574], [300, 564], [346, 572], [360, 575]] as const) decor(x, y, "bones", false, "Old bones");
  decor(380, 562, "pillar"); decor(392, 562, "pillar"); decor(380, 576, "pillar"); decor(392, 576, "pillar"); decor(392, 567, "statue", true, "The Howling King's seat"); decor(386, 563, "torch", true); decor(386, 575, "torch", true);
  coffers("Vault coffer", 190, 562, 372, 577, 6, T.DUNGEON); decor(394, 575, "chest", true, "The Howling King's hoard");
  monsters("grave_moth", 190, 562, 372, 577, 12); monsters("vault_archer", 230, 562, 320, 569, 8); monsters("vault_knight", 290, 562, 372, 577, 8); monsters("cave_bat", 190, 562, 372, 577, 4);
  monsters("howling_king", 386, 568, 386, 568, 1);
  // The Root Cellars, under a cellar door in the grass past the Hollow Farms mill: a dungeon for new heroes (rats, bats,
  // grumblins, spiders, and the Rat King at the end), lit, stocked, and nothing locked.
  dungeon("root_cellars", [[404, 556, 430, 562], [428, 560, 446, 563], [444, 556, 470, 570], [408, 564, 436, 576], [434, 572, 448, 575]], T.WOOD);
  for (let y = 556; y <= 576; y++) for (let x = 404; x <= 470; x++) if (get(x, y) === T.WOOD && noise2(x * 1.5, y * 1.5) > 0.62) put(x, y, T.DUNGEON);
  /** A dungeon mouth on free ground near a point: the ladder, and the tile beside it you climb back up onto. */
  const mouth = (near: [number, number], name: string, landing: { x: number; y: number }, back: string) => {
    const [x, y] = nearestLandAnywhere(near[0], near[1]);
    const beside = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dy]) => [x + dx, y + dy] as const).find(([bx, by]) => ([T.GRASS, T.DARK_GRASS, T.PATH] as number[]).includes(get(bx, by)) && ctx.objectAt[tileIndex(bx, by)] < 0) ?? [x, y + 1] as const;
    add({ kind: "ladder", x, y, blocks: true, name, action: "Climb-down", to: landing });
    add({ kind: "ladder", x: landing.x - 2, y: landing.y, blocks: true, name: back, action: "Climb-up", to: { x: beside[0], y: beside[1] } });
    return [x, y] as const;
  };
  const cellarMouth = mouth([272, 289], "Cellar door", { x: 408, y: 559 }, "Cellar steps");
  for (const [x, y, kind] of [[410, 556, "barrel"], [414, 556, "barrel"], [418, 556, "crate"], [422, 556, "shelf"], [426, 556, "crate"], [412, 562, "hay"], [446, 556, "shelf"], [452, 556, "barrel"], [458, 556, "crate"], [466, 556, "shelf"], [412, 576, "hay"], [420, 576, "barrel"], [428, 576, "crate"]] as const) if (ctx.objectAt[tileIndex(x, y)] < 0) decor(x, y, kind, true);
  for (const [x, y] of [[408, 560], [428, 562], [448, 562], [466, 566], [414, 570], [434, 574]] as const) if (ctx.objectAt[tileIndex(x, y)] < 0) decor(x, y, "torch", true);
  coffers("Cellar coffer", 404, 556, 470, 576, 4, T.WOOD); decor(468, 569, "chest", true, "The Rat King's hoard");
  monsters("ink_rat", 404, 556, 446, 576, 12); monsters("cave_bat", 404, 556, 470, 576, 6); monsters("grumblin", 428, 556, 470, 570, 5); monsters("forest_spider", 408, 564, 448, 576, 4); monsters("grumblin_chief", 444, 556, 470, 570, 1);
  monsters("rat_king", 462, 564, 462, 564, 1);
  // The Mossy Undercroft, down a stair in the Mossy Ruins: the vaults under the ruins, for the middle levels (bandits,
  // the dead, thornbacks, moths), and the Moss Warden behind a door that takes a moss key.
  dungeon("mossy_undercroft", [[474, 556, 500, 564], [498, 560, 516, 563], [514, 554, 540, 570], [488, 563, 492, 567], [478, 566, 510, 577], [511, 572, 513, 572], [514, 572, 540, 577]], T.STONE);
  for (let y = 554; y <= 577; y++) for (let x = 474; x <= 540; x++) if (get(x, y) === T.STONE && noise(x * 1.2, y * 1.2) > 0.66) put(x, y, T.DARK_GRASS);
  const mossyMouth = mouth([306, 331], "Mossy stair", { x: 478, y: 560 }, "Mossy stair");
  add({ kind: "gate", x: 512, y: 572, blocks: true, name: "The warden's door", action: "Unlock", to: { x: 514, y: 572 }, requires: { item: "moss_key" } });
  for (let x = 478; x <= 498; x += 10) decor(x, 556, "pillar"); for (let x = 518; x <= 538; x += 10) decor(x, 554, "pillar"); for (const [x, y] of [[482, 564], [506, 562], [516, 566], [536, 568], [486, 576], [504, 577]] as const) if (ctx.objectAt[tileIndex(x, y)] < 0) decor(x, y, "torch", true);
  scatter(474, 554, 540, 577, 10, (x, y) => decor(x, y, "rubble", false), (x, y) => (get(x, y) === T.STONE || get(x, y) === T.DARK_GRASS) && ctx.objectAt[tileIndex(x, y)] < 0);
  scatter(474, 554, 540, 570, 6, (x, y) => decor(x, y, "ruin_wall", true), (x, y) => get(x, y) === T.STONE && ctx.objectAt[tileIndex(x, y)] < 0 && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => (get(x + dx, y + dy) === T.STONE || get(x + dx, y + dy) === T.DARK_GRASS) && ctx.objectAt[tileIndex(x + dx, y + dy)] < 0));
  scatter(474, 554, 540, 577, 8, (x, y) => decor(x, y, "bones", false, "Old bones"), (x, y) => (get(x, y) === T.STONE || get(x, y) === T.DARK_GRASS) && ctx.objectAt[tileIndex(x, y)] < 0);
  coffers("Undercroft coffer", 474, 554, 540, 570, 4, T.STONE); decor(538, 576, "chest", true, "The warden's hoard");
  monsters("bandit", 474, 554, 516, 570, 8); monsters("skeleton", 478, 554, 540, 577, 8); monsters("thornback", 514, 554, 540, 570, 4); monsters("grave_moth", 474, 554, 540, 577, 4); monsters("swamp_lurker", 478, 566, 510, 577, 4); monsters("cave_bat", 474, 554, 540, 577, 4);
  monsters("moss_warden", 528, 575, 528, 575, 1);
  // And coffers in every dungeon there was: the crypt, the Depths, the catacombs, the lair, the sea cave and the deep mine.
  { const [cx0, cy0] = mainlandToWorld(24, 205), [cx1, cy1] = mainlandToWorld(68, 232); coffers("Crypt coffer", cx0, cy0, cx1, cy1, 3, T.DUNGEON); }
  { const [hx0, hy0] = mainlandToWorld(84, 206), [hx1, hy1] = mainlandToWorld(176, 236); coffers("Hollow coffer", hx0, hy0, hx1, hy1, 4, T.DUNGEON); }
  { const [tx0, ty0] = mainlandToWorld(178, 212), [tx1, ty1] = mainlandToWorld(214, 236); coffers("Hollow coffer", tx0, ty0, tx1, ty1, 2, T.STONE); }
  coffers("Catacomb coffer", 20, 522, 170, 547, 4, T.DUNGEON); coffers("Wyrm coffer", 20, 554, 170, 577, 3, T.ASH); coffers("Barnacled coffer", 548, 522, 700, 546, 3, T.STONE); coffers("Miner's coffer", 548, 554, 710, 577, 3, T.DUNGEON);
  // Venomous creatures: adders in every bog, spiders in the dark places.
  monsters("marsh_adder", 20, 20, 500, 180, 10); monsters("marsh_adder", 200, 320, 240, 350, 3); monsters("marsh_adder", 236, 455, 272, 490, 4);
  monsters("cave_spider", 20, 522, 170, 547, 6); monsters("cave_spider", 548, 522, 700, 546, 6); monsters("cave_spider", 548, 554, 710, 577, 4);
  monsters("cave_bat", 20, 522, 170, 547, 5); monsters("cave_bat", 548, 522, 700, 546, 4); monsters("cave_bat", 548, 554, 710, 577, 4);
  // The Namekeeper keeps his register at a table on the Friendhollow square's edge (an empty tile; nothing on the square moves).
  { const [nx, ny] = nearestLandAnywhere(...mainlandSquare(116, 118)); npc("namekeeper", nx, ny); decor(nx, ny - 1, "table", true, "The Register of Names"); }
  buildVillages(ctx, t);
  buildWest(ctx, t);
  // (After the villages are built: the library's floor is laid by then.) The trapdoor to the Drowned Archive.
  add({ kind: "ladder", x: 643, y: 397, blocks: true, name: "Trapdoor", action: "Climb-down", to: { x: 476, y: 528 } });
  // Statues at every dungeon's mouth of what waits below, a warning to whoever reads stone: some whole, some toppled,
  // broken or half sunk in the ground.
  const warn = (x: number, y: number, id: string, who: string, state: "whole" | "toppled" | "broken" | "buried") => {
    const tt = get(x, y); if (tt === T.WALL || tt === T.VOID || isWater(tt) || ctx.spawns.some(spawn => spawn.x === x && spawn.y === y)) return;
    const o = ctx.objectAt[tileIndex(x, y)]; if (o >= 0 && ctx.objects[o].kind !== "decor" && ctx.objects[o].kind !== "tree") return;
    clearAt(x, y); add({ kind: "decor", decor: "monument", x, y, blocks: state !== "buried", name: `Statue of a ${who}${state === "whole" ? "" : ` (${state})`}`, monster: id, state });
  };
  warn(227, 337, "skeleton", "skeleton", "toppled"); warn(309, 347, "hollow_sentinel", "hollow sentinel", "broken"); warn(336, 52, "shade", "shade", "whole"); warn(72, 71, "ash_drake", "drake", "buried");
  warn(441, 475, "swamp_lurker", "swamp lurker", "toppled"); warn(642, 197, "stone_golem", "stone golem", "whole"); warn(393, 328, "glass_crab", "glass crab", "broken"); warn(638, 401, "drowned_scholar", "drowned scholar", "buried");
  warn(602, 452, "vault_knight", "vault knight", "toppled"); warn(598, 452, "vault_archer", "vault archer", "whole");
  warn(cellarMouth[0] + 2, cellarMouth[1] + 1, "ink_rat", "giant rat", "broken"); warn(mossyMouth[0] - 2, mossyMouth[1] + 2, "moss_warden", "moss warden", "buried");
  // ---------- 7d. Wayward chapels: the Pilgrim's Road runs further now ----------
  /**
   * A chapel on free ground near a point, found by searching outward: stone walls, a gable roof (or none, with the
   * walls knocked down, for a ruin), the altar at the north end under an Old Friend, benches and torches. Returns
   * where it stood, or null if no clear ground was found.
   */
  const chapel = (near: readonly [number, number], w: number, h: number, name: string, altarName: string, ruined = false) => {
    const landy = (tt: number) => [T.GRASS, T.DARK_GRASS, T.PATH, T.GRAVEL, T.SNOW, T.ASH, T.SAND].includes(tt as never);
    const fits = (x0: number, y0: number) => { for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) { if (!inBounds(x, y) || inMainland(x, y) || !landy(get(x, y))) return false; const o = ctx.objectAt[tileIndex(x, y)]; if (o >= 0 && !["decor", "tree", "herb"].includes(ctx.objects[o].kind)) return false; } return true; };
    let at: [number, number] | null = null;
    for (let r = 0; r <= 30 && !at; r++) for (let dy = -r; dy <= r && !at; dy++) for (let dx = -r; dx <= r && !at; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x0 = near[0] + dx - Math.floor(w / 2), y0 = near[1] + dy - Math.floor(h / 2); if (fits(x0, y0)) at = [x0, y0]; }
    if (!at) return null;
    const [x0, y0] = at, x1 = x0 + w - 1, y1 = y0 + h - 1, cx = Math.floor((x0 + x1) / 2);
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) { clearAt(x, y); for (let i = ctx.spawns.length - 1; i >= 0; i--) if (ctx.spawns[i].x === x && ctx.spawns[i].y === y) ctx.spawns.splice(i, 1); }
    t.building(x0, y0, x1, y1, "s", T.STONE, undefined, { name, color: "#6d6b67", walls: "stone", roof: ruined ? "none" : "gable" });
    if (ruined) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (get(x, y) === T.WALL && noise2(x * 1.7, y * 1.7) > 0.5 && !(y === y0 && Math.abs(x - cx) <= 2)) put(x, y, T.GRAVEL); else if (get(x, y) === T.STONE && noise2(x * 2.1, y * 2.1) > 0.7) put(x, y, T.GRAVEL); }
      scatter(x0 + 1, y0 + 3, x1 - 1, y1 - 1, 5, (x, y) => decor(x, y, "rubble", false), (x, y) => (get(x, y) === T.STONE || get(x, y) === T.GRAVEL) && ctx.objectAt[tileIndex(x, y)] < 0 && x !== cx);
      scatter(x0 + 1, y0 + 3, x1 - 1, y1 - 1, 3, (x, y) => decor(x, y, "bones", false, "Old bones"), (x, y) => (get(x, y) === T.STONE || get(x, y) === T.GRAVEL) && ctx.objectAt[tileIndex(x, y)] < 0 && x !== cx);
      for (const [dx, dy] of [[-2, 2], [3, 3], [-3, h + 2], [w + 2, -1]] as const) { const gx = x0 + dx, gy = y0 + dy; if (inBounds(gx, gy) && landy(get(gx, gy)) && ctx.objectAt[tileIndex(gx, gy)] < 0) decor(gx, gy, "grave", true); }
    }
    add({ kind: "altar", x: cx, y: y0 + 2, blocks: true, name: altarName }); decor(cx, y0 + 1, "old_friend", true, ruined ? "The Old Friend, weathered to a shape" : "The Old Friend");
    for (const bx of [cx - 2, cx + 2]) for (let by = y0 + 4; by <= y1 - 2; by += 2) if (get(bx, by) === T.STONE && ctx.objectAt[tileIndex(bx, by)] < 0) decor(bx, by, "bench", true);
    for (const [tx, ty] of [[x0 + 1, y0 + 1], [x1 - 1, y0 + 1]] as const) if (get(tx, ty) === T.STONE && ctx.objectAt[tileIndex(tx, ty)] < 0) decor(tx, ty, "torch", true);
    return at;
  };
  chapel([128, 300], 7, 7, "Wayward chapel", "Wayward altar");
  chapel([80, 180], 7, 7, "Drakespine chapel", "Drakespine altar");
  chapel([620, 262], 7, 7, "Ironreach chapel", "Ironreach altar");
  chapel([570, 420], 7, 7, "Wilds chapel", "Wilds altar");
  chapel([282, 62], 13, 11, "The Deadwood chapel", "Deadwood altar", true);
  // ---------- 7e. The four Orders' halls, and the Deadwood Maidens' camp ----------
  /** Clear ground w × h (plus a margin) near a point, searched outward; the top-left corner, or null. */
  const clearing = (near: readonly [number, number], w: number, h: number, allowSwamp = false, rough = false): [number, number] | null => {
    // `rough` takes any dry ground at all (lava, cliffs and old walls included): the Ember's fortress repaints its whole island.
    const landy = (tt: number) => rough ? tt !== T.VOID && !isWater(tt) : [T.GRASS, T.DARK_GRASS, T.PATH, T.GRAVEL, T.SNOW, T.ASH, T.SAND, ...(allowSwamp ? [T.SWAMP] : [])].includes(tt as never);
    const fits = (x0: number, y0: number) => { for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) { if (!inBounds(x, y) || inMainland(x, y) || !landy(get(x, y))) return false; const o = ctx.objectAt[tileIndex(x, y)]; if (o >= 0 && !["decor", "tree", "herb"].includes(ctx.objects[o].kind)) return false; } return true; };
    for (let r = 0; r <= 36; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x0 = near[0] + dx - Math.floor(w / 2), y0 = near[1] + dy - Math.floor(h / 2); if (fits(x0, y0)) return [x0, y0]; }
    return null;
  };
  const razeArea = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { clearAt(x, y); for (let i = ctx.spawns.length - 1; i >= 0; i--) if (ctx.spawns[i].x === x && ctx.spawns[i].y === y) ctx.spawns.splice(i, 1); } };
  /**
   * An Order's hall: stone, a gable roof in the Order's colour, the altar at the north end, racks and benches, the
   * commander and quartermaster inside, two guards and the god's statue before the door.
   */
  for (const id of ORDER_IDS) {
    const order = ORDERS[id], ember = id === "ember"; if (order.city) continue;
    const found = ember ? clearing(order.near, 23, 20, false, true) : clearing(order.near, 11, 8);
    if (!found) continue;
    // The Ember's fortress sits on an island of ash inside a moat of lava, a causeway of blackened stone to its gate.
    const at: [number, number] = ember ? [found[0] + 6, found[1] + 5] : found;
    const [x0, y0] = at, x1 = x0 + 10, y1 = y0 + 7, cx = x0 + 5;
    if (ember) {
      const [mx0, my0] = found, mx1 = mx0 + 22, my1 = my0 + 19;
      razeArea(mx0 - 1, my0 - 1, mx1 + 1, my1 + 1);
      for (let y = my0 - 1; y <= my1 + 1; y++) for (let x = mx0 - 1; x <= mx1 + 1; x++) { const edge = Math.min(x - mx0, mx1 - x, y - my0, my1 - y); put(x, y, edge < 0 ? T.ASH : edge < 2 ? T.LAVA : T.ASH); }
      for (let y = my1 - 1; y <= my1; y++) for (let x = cx - 1; x <= cx + 1; x++) put(x, y, T.BRIDGE);
      for (const [tx, ty] of [[mx0 + 2, my0 + 2], [mx1 - 2, my0 + 2], [mx0 + 2, my1 - 2], [mx1 - 2, my1 - 2]] as const) decor(tx, ty, "torch", true);
      monsters("ash_drake", mx0 - 6, my0 - 6, mx1 + 6, my1 + 6, 4);
    }
    razeArea(x0 - 1, y0 - 1, x1 + 1, y1 + 6);
    for (let y = y1 + 1; y <= y1 + 6; y++) for (let x = x0; x <= x1; x++) put(x, y, y <= y1 + 3 || Math.abs(x - cx) <= 3 ? T.STONE : get(x, y));
    t.building(x0, y0, x1, y1, "s", T.STONE, undefined, ember ? { name: "Ember Fortress", color: order.dark, walls: "stone", roof: "flat", storeys: 2, tall: 8 } : { name: `${order.short} Hall`, color: order.color, walls: "stone", chimney: true });
    add({ kind: "altar", x: cx, y: y0 + 2, blocks: true, name: `${order.name} altar`, text: id }); decor(cx, y0 + 1, order.statue, true, `${order.god}, carved small for the altar`);
    decor(x0 + 1, y0 + 2, "armour", true, "Weapon rack"); decor(x1 - 1, y0 + 2, "armour", true, "Weapon rack"); decor(x0 + 1, y1 - 1, "torch", true); decor(x1 - 1, y1 - 1, "torch", true);
    decor(cx - 3, y0 + 4, "bench", true); decor(cx + 3, y0 + 4, "bench", true); decor(x0 + 1, y0 + 4, "table", true, "The Order's ledger"); decor(x1 - 1, y0 + 4, "chest", true, `${order.short} strongbox`);
    npc(`${id}_commander`, cx - 1, y0 + 4); npc(`${id}_quartermaster`, cx + 2, y0 + 3);
    decor(cx, y1 + 3, order.statue, true, `${order.god}, god of the ${order.name}`); npc(`${id}_guard`, cx - 3, y1 + 2); npc(`${id}_guard`, cx + 3, y1 + 2);
    // The statue as a landmark: braziers either side of it, the Order's plaque before it, offerings at its foot, and its banners flanking the way in.
    decor(cx - 2, y1 + 4, "torch", true, `A brazier of the ${order.name}, lit`); decor(cx + 2, y1 + 4, "torch", true, `A brazier of the ${order.name}, lit`);
    decor(cx, y1 + 5, "plaque", true, { diamond: "A plaque: 'THE GOOD FRIEND KEPT EVERY PROMISE. SO DO WE.' Under it, the Diamond's oath, cut deep.", ink: "A plaque: 'WHAT IS WRITTEN IS KEPT.' Under it, a line in a script nobody else in the Realm can read.", sol: "A plaque, cut at a slant: 'THE WEIRD FRIEND LAUGHED AT THE HOLLOW AND LIVED.' Somebody has added a smiling face.", hood: "A plaque: 'TAKEN FROM THE HOARD, GIVEN TO THE VILLAGES.' Under it, a ledger of favours, still being added to.", ember: "A plaque of black iron: 'THE FIRE HAS NOT GONE OUT. IT WILL NOT GO OUT.'", dusk: "A plaque." }[id]);
    decor(cx - 1, y1 + 4, "flowers", false, `Offerings at the foot of ${order.godName}'s statue`); decor(cx + 1, y1 + 4, "flowers", false, `Offerings: ${({ diamond: "crystal shards, left in a row", ink: "folded pages and a quill", sol: "a little of everything, in no order", hood: "coins, which go to the villages by morning", ember: "ash hearts, still warm", dusk: "nothing" } as Record<string, string>)[id]}`);
    decor(cx - 4, y1 + 5, `banner_${id}`, true, `The ${order.name}'s banner`); decor(cx + 4, y1 + 5, `banner_${id}`, true, `The ${order.name}'s banner`);
    decor(x0, y1 + 2, `banner_${id}`, true, `The ${order.name}'s banner`); decor(x1, y1 + 2, `banner_${id}`, true, `The ${order.name}'s banner`);
  }
  // The Deadwood Maidens' camp in the east of the wood: tents round a hearth behind a fence of stakes, their spearwomen
  // on watch at the edge. Hostile, until the truce is kept.
  {
    const at = clearing([392, 64], 17, 13, true);
    if (at) {
      const [x0, y0] = at, x1 = x0 + 16, y1 = y0 + 12, cx = x0 + 8, cy = y0 + 6;
      razeArea(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) === T.SWAMP) put(x, y, T.DARK_GRASS);
      for (let x = x0; x <= x1; x++) { if (Math.abs(x - cx) > 1) { decor(x, y0, "fence", true, "Stake fence"); decor(x, y1, "fence", true, "Stake fence"); } }
      for (let y = y0 + 1; y < y1; y++) { if (Math.abs(y - cy) > 1) { decor(x0, y, "fence", true, "Stake fence"); decor(x1, y, "fence", true, "Stake fence"); } }
      decor(cx, cy, "hearth", true, "The Maidens' hearth"); for (const [dx, dy] of [[-5, -3], [5, -3], [-5, 3], [5, 3]] as const) decor(cx + dx, cy + dy, "tent", true, "A Maiden's tent");
      decor(cx - 2, cy - 4, "table", true, "The Maidens' market"); decor(cx - 3, cy - 4, "crate", true); decor(cx + 3, cy + 4, "logpile", true); decor(cx, y0 + 1, "banner", true, "The Maidens' banner, red on black");
      decor(cx + 3, cy - 4, "obelisk", true, "A standing stone the Maidens pray at"); decor(cx - 3, cy + 4, "bones", false, "Trophies of the dead");
      npc("maiden_matriarch", cx + 1, cy - 1); npc("maiden_trader", cx - 2, cy - 3); for (const [dx, dy] of [[-3, 1], [3, 1], [-1, 3], [2, -2]] as const) npc("maidens_villager", cx + dx, cy + dy);
      for (const [dx, dy] of [[-9, -2], [-9, 2], [9, -2], [9, 2], [-4, -8], [4, -8], [-4, 8], [4, 8]] as const) { const gx = cx + dx, gy = cy + dy; if (inBounds(gx, gy) && [T.GRASS, T.DARK_GRASS, T.PATH, T.SWAMP].includes(get(gx, gy) as never)) monsters("deadwood_maiden", gx, gy, gx, gy, 1); }
    }
  }
  // ---------- 7c. The Rare Friends Ring: a round building west of the Deadwood, across the river, built by a Hoverer ----------
  {
    const { x: cx, y: cy, outer, inner } = ARENA, dist = (x: number, y: number) => Math.hypot(x - cx, y - cy);
    // Clear the ground (the Deadwood's dead and its ruins keep off it), then the two ring walls with the concourse between.
    for (let i = ctx.spawns.length - 1; i >= 0; i--) if (dist(ctx.spawns[i].x, ctx.spawns[i].y) <= outer + 4) ctx.spawns.splice(i, 1);
    for (let y = cy - outer - 4; y <= cy + outer + 4; y++) for (let x = cx - outer - 4; x <= cx + outer + 4; x++) {
      const d = dist(x, y); if (d > outer + 4) continue;
      clearAt(x, y); setRegion(x, y, "friends_ring");
      if (d > outer + 0.8) { if (get(x, y) !== T.WATER && get(x, y) !== T.DEEP) put(x, y, T.GRASS); continue; }
      if (Math.abs(d - outer) <= 0.8 || Math.abs(d - inner) <= 0.8) put(x, y, T.WALL);
      else if (d > inner) put(x, y, T.STONE);
      else put(x, y, T.GRASS);
    }
    // Doors: the gate on the south, and four arena gates from the concourse into the courtyard: iron gates in the inner
    // wall you step through by clicking, barred from the courtyard side while a match is on.
    for (const dx of [-1, 0, 1]) for (const r of [outer, outer - 1, outer + 1]) put(cx + dx, cy + r, T.STONE);
    for (const r of [inner - 2, inner - 1, inner, inner + 1, inner + 2]) { put(cx, cy + r, T.STONE); put(cx, cy - r, T.STONE); put(cx + r, cy, T.STONE); put(cx - r, cy, T.STONE); }
    for (const [gx, gy, tx, ty, axis] of [[cx, cy + inner, cx, cy + inner - 2, "ew"], [cx, cy - inner, cx, cy - inner + 2, "ew"], [cx + inner, cy, cx + inner - 2, cy, "ns"], [cx - inner, cy, cx - inner + 2, cy, "ns"]] as const) {
      add({ kind: "ladder", look: "gate", axis, x: gx, y: gy, blocks: true, name: "Arena gate", action: "Go-through", to: { x: tx, y: ty } });
    }
    // The courtyard: a garden to the north-west, a rock field to the south-east, a little volcano to the north-east, and
    // the Ringmaker's fountain in the middle, running red.
    const vx = cx + 8, vy = cy - 7;
    for (let y = cy - inner; y <= cy + inner; y++) for (let x = cx - inner; x <= cx + inner; x++) {
      const d = dist(x, y); if (d >= inner - 0.8) continue;
      const dv = Math.hypot(x - vx, y - vy);
      if (dv < 1.6) put(x, y, T.LAVA); else if (dv < 3.1) put(x, y, T.CLIFF); else if (dv < 5.5) put(x, y, T.ASH);
      else if (x > cx + 3 && y > cy + 3) put(x, y, T.GRAVEL);
      else if (x < cx - 3 && y < cy - 3 && noise2(x * 1.3, y * 1.3) > 0.55) put(x, y, T.DARK_GRASS);
    }
    // The fighting pit: a round of sand about the fountain, ringed by torches, with cobbled ways in from the four gates.
    for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) { const t = get(x, y); if (Math.hypot(x - cx + 0.5, y - cy + 0.5) < 6.5 && (t === T.GRASS || t === T.DARK_GRASS)) put(x, y, T.SAND); }
    for (let r = 7; r <= inner - 3; r++) for (const [x, y] of [[cx, cy + r], [cx - 1, cy + r], [cx, cy - r], [cx - 1, cy - r], [cx + r, cy], [cx + r, cy - 1], [cx - r, cy], [cx - r, cy - 1]] as const) { const t = get(x, y); if (t !== T.LAVA && t !== T.CLIFF && t !== T.WALL) put(x, y, T.COBBLE); }
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8, x = Math.round(cx - 0.5 + Math.cos(a) * 7.5), y = Math.round(cy - 0.5 + Math.sin(a) * 7.5); clearAt(x, y); decor(x, y, "torch", true); }
    for (const [x, y] of [[cx - 2, cy + inner - 2], [cx + 2, cy + inner - 2], [cx - 2, cy - inner + 2], [cx + 2, cy - inner + 2], [cx + inner - 2, cy - 2], [cx + inner - 2, cy + 2], [cx - inner + 2, cy - 2], [cx - inner + 2, cy + 2]] as const) { clearAt(x, y); decor(x, y, "banner", true, "The Ring's banner"); }
    for (const [fx, fy] of [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]] as const) add({ kind: "fountain", x: fx, y: fy, blocks: true, name: "Blood fountain" });
    decor(cx, cy - 3, "old_friend", true, "The Ringmaker, the Hoverer who built the Ring: the fountain at its feet runs red");
    for (const [dx, dy] of [[-3, -1], [3, -1], [-3, 2], [3, 2]] as const) decor(cx + dx, cy + dy, "flowers", false);
    // Skulls and rib cages everywhere, flowers among them; boulders and rubble on the rocks; bushes and trees in the garden.
    const open = (x: number, y: number) => dist(x, y) < inner - 1.5 && get(x, y) !== T.LAVA && get(x, y) !== T.CLIFF && ctx.objectAt[tileIndex(x, y)] < 0 && Math.hypot(x - cx + 0.5, y - cy + 0.5) > 2.5;
    scatter(cx - inner, cy - inner, cx + inner, cy + inner, 44, (x, y) => decor(x, y, "bones", false, "Old bones"), open);
    scatter(cx - inner, cy - inner, cx + inner, cy + inner, 26, (x, y) => decor(x, y, "flowers", false), (x, y) => open(x, y) && (x < cx || y < cy) && get(x, y) !== T.GRAVEL && get(x, y) !== T.ASH && get(x, y) !== T.SAND && get(x, y) !== T.COBBLE);
    scatter(cx + 3, cy + 3, cx + inner, cy + inner, 7, (x, y) => decor(x, y, "boulder"), (x, y) => open(x, y) && get(x, y) === T.GRAVEL);
    scatter(cx + 3, cy + 3, cx + inner, cy + inner, 6, (x, y) => decor(x, y, "rubble", false), (x, y) => open(x, y) && get(x, y) === T.GRAVEL);
    scatter(cx - inner, cy - inner, cx - 3, cy - 3, 6, (x, y) => decor(x, y, "bush"), (x, y) => open(x, y) && get(x, y) !== T.SAND && get(x, y) !== T.COBBLE);
    scatter(cx - inner, cy - inner, cx - 3, cy - 3, 4, (x, y) => tree(x, y, "tree"), (x, y) => open(x, y) && dist(x, y) > 9);
    scatter(cx - inner, cy + 3, cx - 3, cy + inner, 3, (x, y) => tree(x, y, "deadwood"), (x, y) => open(x, y) && dist(x, y) > 9);
    // The concourse: pillars along both walls, torches between, banners at the gate.
    for (let k = 0; k < 24; k++) {
      const a = k * Math.PI / 12;
      for (const r of [inner + 2, outer - 2]) { const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r); if (get(x, y) === T.STONE && ctx.objectAt[tileIndex(x, y)] < 0 && Math.abs(x - cx) > 2 && !(Math.abs(y - cy) <= 2 && r === inner + 2) && !(Math.abs(y - cy) <= 2 && x < cx - 20)) decor(x, y, "pillar"); }
      if (k % 3 === 1) { const x = Math.round(cx + Math.cos(a) * (inner + 4)), y = Math.round(cy + Math.sin(a) * (inner + 4)); if (get(x, y) === T.STONE && ctx.objectAt[tileIndex(x, y)] < 0) decor(x, y, "torch", true); }
    }
    decor(cx - 2, cy + outer + 2, "banner", true, "The Ring's banner"); decor(cx + 2, cy + outer + 2, "banner", true, "The Ring's banner");
    for (const x of [cx - 6, cx + 6]) { clearAt(x, cy + outer - 3); decor(x, cy + outer - 3, "statue", true, "A champion of the Ring, in stone"); }
    // The people of the Ring, around the concourse; the lobby is the south of it, by the Ringmaster.
    const on = (a: number, r: number): [number, number] => [Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)];
    const stand = (id: string, a: number, r = 20) => { const [x, y] = on(a, r); clearAt(x, y); put(x, y, T.STONE); npc(id, x, y); };
    stand("ringmaster", Math.PI / 2 + 0.1);
    // Each shop has its own room off the concourse, like the chapel: a hall built outside the outer wall with a passage
    // through it, furnished for what it sells and the tier it serves. The Champions' Hall (laurels, the Ring's best) is
    // gilded; the Pit Quartermaster's den (bloodmarks: Wildfur, Ringsteel, Pitfighter) is a fighter's store of bones and
    // racks; the armoury has its anvil and forge; the sigilist's study its cabinets; the infirmary its beds and still;
    // the fletchery its racks and targets.
    const room = (a: number, w: number, h: number, name: string, color: string, floor: number, keeper: string, sign: [string, string, string], furnish: (x0: number, y0: number, x1: number, y1: number, door: "n" | "s" | "e" | "w") => void) => {
      const reach = outer + 1.5 + Math.hypot(w, h) / 2, [rcx, rcy] = on(a, reach), x0 = Math.round(rcx - w / 2), y0 = Math.round(rcy - h / 2), x1 = x0 + w - 1, y1 = y0 + h - 1;
      const vx = cx - (x0 + x1) / 2, vy = cy - (y0 + y1) / 2, door: "n" | "s" | "e" | "w" = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? "w" : "e") : (vy < 0 ? "n" : "s");
      const along = door === "n" || door === "s" ? Math.max(x0 + 1, Math.min(x1 - 2, Math.round(cx - 0.5))) : Math.max(y0 + 1, Math.min(y1 - 2, Math.round(cy - 0.5)));
      for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) { clearAt(x, y); setRegion(x, y, "friends_ring"); if (get(x, y) === T.WATER || get(x, y) === T.DEEP || get(x, y) === T.LAVA) put(x, y, T.GRASS); for (let i = ctx.spawns.length - 1; i >= 0; i--) if (ctx.spawns[i].x === x && ctx.spawns[i].y === y) ctx.spawns.splice(i, 1); }
      building(x0, y0, x1, y1, door, floor, along, { name, color, walls: "stone", storeys: 1, tall: 4 });
      // The passage: two tiles wide, from the door straight through the outer wall to the concourse.
      const [sx, sy] = door === "n" ? [0, -1] : door === "s" ? [0, 1] : door === "e" ? [1, 0] : [-1, 0];
      const lanes = door === "n" || door === "s" ? [[along, door === "n" ? y0 : y1], [along + 1, door === "n" ? y0 : y1]] : [[door === "w" ? x0 : x1, along], [door === "w" ? x0 : x1, along + 1]];
      let reachK = 1;
      for (const [lx, ly] of lanes) for (let k = 1; k < 20; k++) {
        const x = lx + sx * k, y = ly + sy * k, d = dist(x, y);
        if (d < outer - 1.2 && get(x, y) === T.STONE && k > 1) break;
        clearAt(x, y); setRegion(x, y, "friends_ring"); put(x, y, T.STONE); reachK = Math.max(reachK, k);
      }
      // The hallway: walls either side of the passage from the Ring's outer wall to the shop's door, and a roof over it,
      // so from the concourse to the counter you never step outside.
      const [px, py] = door === "n" || door === "s" ? [1, 0] : [0, 1];
      let hx0 = Infinity, hy0 = Infinity, hx1 = -Infinity, hy1 = -Infinity;
      for (let k = 0; k <= reachK; k++) {
        const ax = lanes[0][0] + sx * k, ay = lanes[0][1] + sy * k;
        if (k > 0 && dist(ax, ay) < outer - 0.8 && dist(ax + px, ay + py) < outer - 0.8) break;
        for (const [wx, wy] of [[ax - px, ay - py], [ax + px * 2, ay + py * 2]] as const) {
          if (k === 0 || dist(wx, wy) >= outer - 0.8) { clearAt(wx, wy); setRegion(wx, wy, "friends_ring"); put(wx, wy, T.WALL); }
          hx0 = Math.min(hx0, wx); hy0 = Math.min(hy0, wy); hx1 = Math.max(hx1, wx); hy1 = Math.max(hy1, wy);
        }
      }
      if (Number.isFinite(hx0)) ctx.buildings.push({ x0: hx0, y0: hy0, x1: hx1, y1: hy1, roof: "flat", color, chimney: false, name: `The hall to ${name}`, walls: "stone" });
      const [ix, iy] = [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)];
      npc(keeper, ix, iy);
      // The shop's sign, out on the concourse at the passage's mouth.
      const [mx, my] = lanes[0], [gx, gy] = [mx + sx * 6 - (door === "n" || door === "s" ? 1 : 0), my + sy * 6 - (door === "e" || door === "w" ? 1 : 0)];
      if (get(gx, gy) === T.STONE && ctx.objectAt[tileIndex(gx, gy)] < 0 && dist(gx, gy) < outer - 1.2) add({ kind: "sign", x: gx, y: gy, blocks: true, name: sign[0], text: sign[1], icon: sign[2] });
      furnish(x0, y0, x1, y1, door);
    };
    const free = (x: number, y: number) => ctx.objectAt[tileIndex(x, y)] < 0 && !ctx.spawns.some(spawn => spawn.x === x && spawn.y === y) && get(x, y) !== T.WALL;
    const put1 = (x: number, y: number, kind: DecorKind, name?: string, blocks = true) => { if (free(x, y)) decor(x, y, kind, blocks, name); };
    // North: the Champions' Hall, the Ring's best, paid in laurels: marble, a carpet to the Champion's seat, gold, trophies.
    room(Math.PI * 3 / 2, 15, 9, "The Champions' Hall", "#e2c46a", T.STONE, "ring_champion", ["The Champions' Hall", "THE CHAMPIONS' HALL. Laurels only. Laurels are won in Friend Fights, not bought.", "laurel"], (x0, y0, x1, y1) => {
      const mid = Math.round((x0 + x1) / 2);
      for (let y = y0 + 1; y < y1; y++) { put(mid, y, T.CARPET); put(mid + 1, y, T.CARPET); }
      put1(mid, y0 + 1, "throne", "The Champion's seat, gilded, with a laurel carved over it");
      for (const x of [x0 + 2, x1 - 2]) { put1(x, y0 + 1, "statue", "A champion of the Ring, in gilded stone"); put1(x, y1 - 2, "statue", "A champion of the Ring, in gilded stone"); }
      for (const x of [x0 + 4, x1 - 4]) { put1(x, y0 + 1, "banner", "The champions' banner, gold on black"); put1(x, y0 + 3, "pillar", "A marble pillar, a champion's name cut into it"); put1(x, y1 - 2, "pillar", "A marble pillar, a champion's name cut into it"); }
      put1(x0 + 1, y0 + 4, "shelf", "Trophies of the Ring: laurels, belts and broken blades"); put1(x1 - 1, y0 + 4, "shelf", "Trophies of the Ring: laurels, belts and broken blades");
      put1(x0 + 1, y1 - 1, "chest", "The laurel strongbox"); put1(x1 - 1, y1 - 1, "chest", "The laurel strongbox"); for (const x of [x0 + 1, x1 - 1]) put1(x, y0 + 1, "lamp");
    });
    // East: the Ring Armoury, coin-paid metal: an anvil and a forge that work, armour on stands, blades on racks.
    room(0, 11, 9, "The Ring Armoury", "#6d6b67", T.STONE, "ring_armourer", ["The Ring Armoury", "THE RING ARMOURY. Metal armour and blades, pewter to rarite, for coin. Gorm Ironhand, smith.", "rarite_cuirass"], (x0, y0, x1, y1) => {
      add({ kind: "anvil", x: x1 - 2, y: y0 + 2, blocks: true, name: "Anvil" }); add({ kind: "furnace", x: x1 - 2, y: y1 - 2, blocks: true, name: "Furnace" });
      for (let x = x0 + 1; x <= x0 + 6; x += 2) { put1(x, y0 + 1, "armour", "A suit of Ring armour on a stand"); put1(x, y1 - 1, "armour", "Blades on a rack, edges out"); }
      put1(x0 + 1, y0 + 4, "table", "The armourer's bench"); put1(x1 - 1, y0 + 4, "crate", "Ingots, sorted by metal"); put1(x1 - 4, y0 + 1, "barrel", "Quench barrel"); put1(x1 - 1, y1 - 1, "torch");
    });
    // North-east: Thessaly Vane's sigil study: cabinets of glowing sigils, spellbooks, a carpet, a staff rack.
    room(Math.PI * 11 / 6, 11, 9, "Vane's Sigil Study", "#6f7ea6", T.CARPET, "ring_sigilist", ["Vane's Sigil Study", "VANE'S SIGIL STUDY. Sigils of every kind and staffs to cast them with. Mind the cabinets; they hum.", "ember_staff"], (x0, y0, x1, y1) => {
      for (let x = x0 + 1, k = 0; x <= x1 - 1; x += 2, k++) put1(x, y0 + 1, "shelf", k % 2 === 0 ? "A cabinet of sigils, every drawer glowing" : "Spellbooks, and the notes in their margins");
      put1(x0 + 1, y1 - 1, "shelf", "A cabinet of sigils, every drawer glowing"); put1(x1 - 1, y1 - 1, "shelf", "Spellbooks, and the notes in their margins");
      put1(x0 + 3, y0 + 4, "table", "A reading desk, a sigil half-pressed on it"); put1(x1 - 3, y0 + 4, "crate", "Sigil crates"); put1(x0 + 1, y0 + 4, "armour", "A rack of staffs, each tipped with its element"); put1(x1 - 1, y0 + 4, "torch");
    });
    // South-east: Sister Mallow's infirmary: beds for the beaten, shelves of tonics, a still for essences, flowers.
    room(Math.PI / 6, 11, 9, "Mallow's Infirmary", "#8fbf9a", T.WOOD, "ring_apothecary", ["Mallow's Infirmary", "MALLOW'S INFIRMARY. Potions, tonics and bandages. Lie down if you're bleeding. Sit up if you're paying.", "healing_tonic"], (x0, y0, x1, y1) => {
      for (const x of [x0 + 1, x0 + 3]) { put1(x, y0 + 1, "bed", "An infirmary bed, the sheets boiled white"); put1(x, y1 - 2, "bed", "An infirmary bed, the sheets boiled white"); }
      for (const x of [x1 - 1, x1 - 3]) put1(x, y0 + 1, "shelf", "Tonics and tinctures, labelled in a careful hand");
      add({ kind: "still", x: x1 - 2, y: y1 - 2, blocks: true, name: "Copper still" });
      put1(x1 - 4, y1 - 1, "table", "Bandages, rolled, and a basin"); put1(x0 + 5, y0 + 1, "barrel", "Clean water"); put1(x0 + 1, y1 - 1, "flowers", "Herbs drying in bunches", false); put1(x1 - 1, y1 - 1, "lamp");
    });
    // South-west: Brisk Arrowyn's fletchery: racks of bows, shafts by the bundle, logs to carve, a target to try them on.
    room(Math.PI * 5 / 6, 11, 9, "Arrowyn's Fletchery", "#9c8672", T.WOOD, "ring_fletcher", ["Arrowyn's Fletchery", "ARROWYN'S FLETCHERY. Bows, arrows, quivers and hides. Try before you buy; the target's at the back.", "yew_bow"], (x0, y0, x1, y1) => {
      for (const x of [x0 + 1, x0 + 3, x0 + 5]) put1(x, y0 + 1, "shelf", "Bows on the rack, strung and unstrung");
      put1(x1 - 1, y0 + 1, "target", "A practice target, well shot"); put1(x1 - 1, y1 - 1, "target", "A practice target, well shot");
      put1(x0 + 1, y1 - 1, "logpile", "Staves of yew and willow, seasoning"); put1(x0 + 3, y1 - 1, "crate", "Arrow shafts, by the bundle"); put1(x0 + 1, y0 + 4, "table", "A fletching bench: feathers, glue, a knife"); put1(x1 - 3, y0 + 4, "hay", "Straw butts");
    });
    // South-south-west, by the gate: the Ring's bank, so a fighter can bank a purse between matches: three booths across
    // the room facing the door, the banker behind them, the strongroom's chests and the Ring's banners.
    room(Math.PI * 2 / 3, 11, 9, "The Ring's Bank", "#8f9cb2", T.STONE, "banker", ["The Ring's Bank", "THE RING'S BANK. Bank your purse before you bet it. Nothing leaves the vault without its owner.", "coins"], (x0, y0, x1, y1, door) => {
      const across = door === "n" || door === "s", far = door === "n" ? y1 - 2 : door === "s" ? y0 + 2 : door === "w" ? x1 - 2 : x0 + 2;
      const mid = across ? Math.round((x0 + x1) / 2) : Math.round((y0 + y1) / 2);
      for (const k of [-2, 0, 2]) { const [bx, by] = across ? [mid + k, far] : [far, mid + k]; if (free(bx, by)) add({ kind: "bank", x: bx, y: by, blocks: true, name: "Bank booth" }); }
      const corners: [number, number][] = [[x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]];
      corners.forEach(([x, y], i) => put1(x, y, i % 2 ? "chest" : "lamp", i % 2 ? "A strongbox, bolted to the floor" : undefined));
      put1(across ? x0 + 1 : mid, across ? mid : y0 + 1, "banner", "The Ring's banner"); put1(across ? x1 - 1 : mid, across ? mid : y1 - 1, "banner", "The Ring's banner");
    });
    // North-north-east: Hilde Edgewright's blade shop, coin-paid weapons: racks of blades on every wall, the two-handers
    // on stands, a grindstone, a straw dummy to try an edge on, and an anvil to put one back.
    room(Math.PI * 5 / 3, 11, 9, "Edgewright's Blades", "#8a5e52", T.STONE, "ring_weaponsmith", ["Edgewright's Blades", "EDGEWRIGHT'S BLADES. Daggers to war hammers, pewter to glimmer, for coin. Every edge honed twice.", "glimmer_greatsword"], (x0, y0, x1, y1) => {
      for (const x of [x0 + 1, x0 + 3, x0 + 5, x1 - 1]) put1(x, y0 + 1, "armour", x === x1 - 1 ? "Greatswords on a stand, taller than you" : "Blades on a rack, edges out");
      for (const x of [x0 + 1, x0 + 3]) put1(x, y1 - 1, "armour", "Battleaxes and war hammers, hung by their heads");
      add({ kind: "anvil", x: x1 - 2, y: y1 - 2, blocks: true, name: "Anvil" }); put1(x1 - 4, y1 - 1, "table", "A grindstone on its trestle, the stone worn hollow");
      put1(x0 + 1, y0 + 4, "table", "A whetting bench: stones, oil, a rag"); put1(x1 - 1, y0 + 4, "target", "A straw dummy, cut a hundred ways");
      put1(x1 - 3, y0 + 1, "barrel", "Quench barrel"); put1(x0 + 5, y1 - 1, "crate", "Hilts and crossguards, unsorted"); put1(x1 - 1, y1 - 1, "torch");
    });
    // North-west: the Pit Quartermaster's den, bloodmarks only: the pit's three tiers on stands, bones, chains of trophies, a pit fire.
    room(Math.PI * 5 / 4, 11, 9, "The Pit Quartermaster's Den", "#5a1f2e", T.STONE, "ring_quartermaster", ["The Pit Quartermaster", "THE PIT. Bloodmarks only. Wildfur, Ringsteel, Pitfighter, and the Ringbreaker for those who've bled enough.", "bloodmark"], (x0, y0, x1, y1) => {
      for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) if ((x * 7 + y * 3) % 5 === 0 && free(x, y)) put(x, y, T.GRAVEL);
      put1(x0 + 1, y0 + 1, "armour", "Wildfur, on a stand: the pit's first tier, hide and fang"); put1(x0 + 3, y0 + 1, "armour", "Ringsteel, on a stand: the pit's second tier"); put1(x0 + 5, y0 + 1, "armour", "Pitfighter plate, on a stand: the pit's third tier, dented on purpose");
      put1(x1 - 1, y0 + 1, "chest", "The bloodmark chest, chained"); put1(x1 - 1, y1 - 1, "hearth", "The pit fire"); put1(x0 + 1, y1 - 1, "bones", "Trophies of the pit", false); put1(x0 + 3, y1 - 1, "bones", "Trophies of the pit", false);
      put1(x1 - 3, y0 + 1, "banner", "The Pit's banner, red on black"); put1(x0 + 1, y0 + 4, "stake", "A rack of pit weapons: clubs, hooks, a net"); put1(x1 - 1, y0 + 4, "torch");
    });
    // The Ring's chapel, built against the west wall with its door into the concourse: white stone under a gabled roof
    // with a round bell tower at its north-west corner (open from the nave), an altar with the Old Friend behind it at
    // the west end, pews either side of a carpeted aisle, torches and the Ring's banners. Chaplain Orrin keeps it, and
    // sells faith potions, holy sigils, vestments, maces and the aegis from it.
    {
      const x0 = cx - 31, y0 = cy - 3, x1 = cx - 24, y1 = cy + 3;
      for (let y = y0 - 3; y <= y1; y++) for (let x = x0 - 1; x <= x1; x++) { clearAt(x, y); setRegion(x, y, "friends_ring"); if (get(x, y) === T.WATER || get(x, y) === T.DEEP) put(x, y, T.GRASS); }
      building(x0, y0, x1, y1, "e", T.STONE, cy, { name: "Ring Chapel", color: "#e8e4d6", walls: "stone", storeys: 2, tall: 8 });
      building(x0 - 1, y0 - 3, x0 + 2, y0, "s", T.STONE, x0, { name: "Chapel bell tower", color: "#e8e4d6", walls: "stone", roof: "cone", round: true, storeys: 3, spire: 22 });
      for (let x = x0 + 3; x <= x1 - 1; x++) { put(x, cy, T.CARPET); put(x, cy + 1, T.CARPET); }
      add({ kind: "altar", x: x0 + 2, y: cy, blocks: true, name: "Chapel altar" }); decor(x0 + 1, cy, "old_friend", true, "The Old Friend, who the Ringmaker fought by");
      for (const y of [y0 + 1, y1 - 1]) { decor(x0 + 1, y, "torch", true); for (let x = x0 + 3; x <= x0 + 5; x++) decor(x, y, "bench", true, "Pew"); decor(x1 - 1, y, "banner", true, "The Ring's banner"); }
      npc("ring_chaplain", x0 + 5, cy);
    }
    // Old walls in the courtyard: what stood here before the Ring, left as cover.
    for (const [x, y] of [[cx - 10, cy + 6], [cx - 9, cy + 6], [cx - 8, cy + 6], [cx - 8, cy + 7], [cx + 2, cy + 11], [cx + 3, cy + 11], [cx + 4, cy + 11], [cx - 12, cy - 2], [cx - 12, cy - 1], [cx - 11, cy - 3], [cx + 6, cy - 12], [cx + 7, cy - 12], [cx + 1, cy - 11], [cx - 5, cy + 12], [cx - 4, cy + 12]] as const) {
      if (dist(x, y) < inner - 1.5 && get(x, y) !== T.LAVA && get(x, y) !== T.CLIFF && get(x, y) !== T.COBBLE && get(x, y) !== T.SAND) { clearAt(x, y); decor(x, y, "ruin_wall", true, "Ruined wall"); }
    }
    // Statues of the Seven along the courtyard's rim, between the gates: the knights the Ring's hardest match summons.
    const SEVEN: readonly [string, string, "whole" | "toppled" | "broken" | "buried"][] = [["revenant_warden", "Revenant warden", "whole"], ["revenant_lancer", "Revenant lancer", "broken"], ["revenant_hexer", "Revenant hexer", "whole"], ["skeletal_champion", "Skeletal champion", "toppled"], ["skeletal_bowmaster", "Skeletal bowmaster", "whole"], ["bone_juggernaut", "Bone juggernaut", "buried"], ["revenant_king", "The Revenant King", "whole"]];
    SEVEN.forEach(([id, who, state], k) => {
      const a = (20 + k * 50) * Math.PI / 180 + (k >= 4 ? Math.PI / 9 : 0), [x, y] = on(a, inner - 2.5);
      if (get(x, y) === T.LAVA || get(x, y) === T.CLIFF) return;
      clearAt(x, y); add({ kind: "decor", decor: "monument", x, y, blocks: state !== "buried", name: `Statue of the ${who.replace(/^The /, "")}${state === "whole" ? "" : ` (${state})`}`, monster: id, state });
    });
    // The Ring's guards: stone knights from the ages before the Ringmaker, at the gate and by every arena gate.
    for (const [gx, gy] of [[cx - 3, cy + outer + 2], [cx + 3, cy + outer + 2]] as const) { put(gx, gy, T.STONE); clearAt(gx, gy); monsters("stone_knight", gx, gy, gx, gy, 1); }
    for (const [gx, gy] of [[cx - 3, cy + inner + 3], [cx + 3, cy - inner - 3], [cx + inner + 3, cy + 3], [cx - inner - 3, cy - 3]] as const) if (get(gx, gy) === T.STONE) { clearAt(gx, gy); monsters("stone_knight", gx, gy, gx, gy, 1); }
    // A road from the Deadwood's bridge to the gate (a ruin in its way is cleared: nobody builds a road through a wall).
    road([[249, 103], [236, 101], [222, 100], [cx, cy + outer + 3]]);
    for (let y = 95; y <= 112; y++) for (let x = 205; x <= 252; x++) { const o = ctx.objectAt[tileIndex(x, y)]; if (get(x, y) === T.PATH && o >= 0 && ctx.objects[o].decor === "ruin_wall") clearAt(x, y); }
    // The forecourt before the south gate, laid after the road so the road doesn't clear it: cobbles, lamps, benches and practice targets, so the Ring is busy at its door.
    // (Four rows deep: the Deadwood's ruined hall, laid later, begins a row further south.)
    for (let y = cy + outer + 1; y <= cy + outer + 4; y++) for (let x = cx - 5; x <= cx + 5; x++) { if (get(x, y) === T.STONE) continue; clearAt(x, y); setRegion(x, y, "friends_ring"); put(x, y, T.COBBLE); }
    for (const [x, y] of [[cx - 5, cy + outer + 1], [cx + 5, cy + outer + 1], [cx - 5, cy + outer + 4], [cx + 5, cy + outer + 4]] as const) decor(x, y, "lamp");
    for (const [x, y] of [[cx - 3, cy + outer + 4], [cx + 3, cy + outer + 4]] as const) decor(x, y, "target", true, "Practice target");
    for (const [x, y] of [[cx - 5, cy + outer + 2], [cx + 5, cy + outer + 2]] as const) decor(x, y, "bench");
  }
  // Everywhere a walker can get to from the spawn (over walkable ground, round blocking objects, down ladders and over the ferry):
  // herbs only grow where someone can pick them.
  const walkable = new Uint8Array(W * ctx.H);
  {
    const WALK = new Set<number>([T.GRASS, T.DARK_GRASS, T.PATH, T.COBBLE, T.SAND, T.SWAMP, T.SNOW, T.STONE, T.WOOD, T.GRAVEL, T.DUNGEON, T.BRIDGE, T.FARMLAND, T.ICE, T.CARPET, T.ASH]);
    const canStep = (x: number, y: number) => { if (!inBounds(x, y)) return false; const tt = get(x, y); if (!WALK.has(tt)) return false; const id = ctx.objectAt[tileIndex(x, y)]; return id < 0 || !ctx.objects[id].blocks; };
    const queue: number[] = [tileIndex(306, 283)]; walkable[queue[0]] = 1;
    const ladders = ctx.objects.filter(object => object.kind === "ladder" && object.to);
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head], x = i % W, y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const nx = x + dx, ny = y + dy; if (canStep(nx, ny) && !walkable[tileIndex(nx, ny)]) { walkable[tileIndex(nx, ny)] = 1; queue.push(tileIndex(nx, ny)); } }
      for (const ladder of ladders) if (Math.abs(ladder.x - x) + Math.abs(ladder.y - y) === 1 && ladder.to && canStep(ladder.to.x, ladder.to.y) && !walkable[tileIndex(ladder.to.x, ladder.to.y)]) { walkable[tileIndex(ladder.to.x, ladder.to.y)] = 1; queue.push(tileIndex(ladder.to.x, ladder.to.y)); }
    }
  }
  // ---------- 8. Herbs: every ecosystem grows its own, on empty ground, the mainland's regions included ----------
  // Patches per herb by rarity, spread over all the regions of its ecosystem; the regions' own bounds are found by scanning.
  const bounds = new Map<string, [number, number, number, number]>();
  for (let y = 0; y < OH; y++) for (let x = 0; x < W; x++) {
    const id = REGION_ORDER[ctx.region[tileIndex(x, y)]], b = bounds.get(id);
    if (!b) bounds.set(id, [x, y, x, y]); else { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  }
  const PATCHES = { common: 14, uncommon: 8, rare: 5, "very rare": 3 } as const;
  for (const herbKind of HERBS) {
    for (const regionId of ECO_REGIONS[herbKind.eco]) {
      const b = bounds.get(regionId); if (!b) continue;
      const n = Math.max(2, Math.round(PATCHES[herbKind.rarity] * (regionId === "coast" ? 0.5 : 1)));
      scatter(b[0], b[1], b[2], b[3], n, (x, y) => t.herb(x, y, herbKind.id, `${herbKind.name} patch`), (x, y) => regionIs(x, y, regionId) && free(x, y) && y < OH && walkable[tileIndex(x, y)] === 1 && (herbKind.eco !== "coast" || get(x, y) === T.SAND || get(x, y) === T.GRASS));
    }
  }
  // Sanity: no monster of a kind that doesn't exist.
  for (const spawn of ctx.spawns) if (spawn.kind === "monster" && !MONSTERS[spawn.id]) throw new Error(`Unknown monster ${spawn.id}`);
  void npc; void fillRect; void spot;
}

/** Smooth value noise in [0, 1) (the same recipe as world.ts, with its own seed). */
function makeNoise(seed: number, scale: number) {
  let state = seed;
  const r = () => { state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const size = 64, grid = Array.from({ length: size * size }, () => r());
  const at = (x: number, y: number) => grid[((y % size + size) % size) * size + ((x % size + size) % size)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}
