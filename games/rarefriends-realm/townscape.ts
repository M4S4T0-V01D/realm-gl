/**
 * The townscape: what makes one village street not look like the next.
 *
 * - `growVillages`: every village gets a few more homes (people have to live somewhere besides the shops), on open
 *   ground near its middle, each with its door towards the square and a bed, a table and a hearth inside.
 * - `varyBuildings`: every ordinary building (not a tower, a keep, a hall with storeys you can climb, or anything
 *   built of several parts) is given a shape and a roof of its own: big ones are often L-shaped (a corner left out,
 *   where nothing inside stands), some rise a second storey, some small ones are tall narrow tower-houses, and roofs
 *   are gabled, hipped or pyramids. All of it is chosen from the building's own position, so the world is the same
 *   for everyone, every time.
 *
 * Both run on the whole world (world coordinates) after everything else is built, and only ever take open ground or a
 * building's own empty floor: nothing anyone walks to is moved, and a new home always keeps two tiles of open ground
 * all round it, so no way through is closed.
 */
import { FAR_PLACES } from "./farwest.ts";
import { OVERWORLD_H, T, WEST_DX, regionIndex, type Building, type GenContext, type RegionId, type World, type worldTools } from "./world.ts";

type Tools = ReturnType<typeof worldTools>;

/** A number in [0, 1) from a position (and a salt), the same every time. */
const hash = (x: number, y: number, salt = 0) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The villages that get new homes: a place and what its people call it. */
const VILLAGES: readonly (readonly [keyof World["places"], string])[] = [
  ["hollow_square", "Friendhollow"], ["fernwick", "Fernwick"], ["highcairn", "Highcairn"], ["dawnhold", "Dawnhold"], ["gravesend", "Gravesend"],
  ["saltmarrow", "Saltmarrow"], ["hollyhock", "Hollyhock"], ["dyemoor", "Dyemoor"], ["tallgrass", "Tallgrass"], ["cragmaw", "Cragmaw"],
  ["quillhaven", "Quillhaven"], ["oasis", "Oasis"], ["frostpeak", "Frostpeak"], ["emberforge", "Emberforge"],
];
const FAR_VILLAGES: readonly (readonly [keyof typeof FAR_PLACES, string])[] = [
  ["vesperholm", "Vesperholm"], ["candlemere", "Candlemere"], ["greyford", "Greyford"], ["barkholm", "Barkholm"], ["sawyers_rest", "Sawyer's Rest"], ["stags_rest", "Stag's Rest"],
];
/**
 * Ground a home can be built on (not roads, fields, water or floors), and ground anyone can walk over (what's kept all
 * round a new home). Made on first use: this module and world.ts import each other, so T isn't there yet at load.
 */
let grounds: { open: Set<number>; walkable: Set<number> } | null = null;
const ground = () => grounds ??= {
  open: new Set<number>([T.GRASS, T.DARK_GRASS, T.SAND, T.SNOW, T.GRAVEL, T.ASH]),
  walkable: new Set<number>([T.GRASS, T.DARK_GRASS, T.PATH, T.COBBLE, T.SAND, T.SNOW, T.STONE, T.GRAVEL, T.FARMLAND, T.ASH, T.WOOD, T.BRIDGE, T.ICE, T.BRICK]),
};
/** Home roofs: thatch, slate, terracotta, moss, plum and pine. */
const HOME_ROOFS = ["#c9a96a", "#6e6a82", "#b8705a", "#8a9a6a", "#7d5a6e", "#5a6e5a", "#a07850", "#56607a"] as const;
const HOMES_PER_VILLAGE = 3;
/** Country no one would build a home in (or that isn't country at all): a home goes in the village or the fields round it. */
const NOT_FOR_HOMES: readonly RegionId[] = ["friends_ring", "ashfall", "wyrmreach", "mossy_ruins", "crypt", "wizards_tower", "raria", "murkmire"];
/** The player's own plot by Friendhollow (housing.ts: its corner, grown to a manor's 13 × 11), kept clear with room to spare. */
const HOME_PLOT_CLEAR = { x0: 142 - 5, y0: 266 - 5, x1: 142 + 13 + 5, y1: 266 + 11 + 5 };

/** Homes for the villages: a few each, near the middle, facing it. */
export function growVillages(ctx: GenContext, t: Tools, places: World["places"]) {
  const { get, inBounds, tileIndex, building } = t;
  const villages: { x: number; y: number; name: string }[] = [
    ...VILLAGES.filter(([key]) => places[key]).map(([key, name]) => ({ x: places[key].x, y: places[key].y, name })),
    ...FAR_VILLAGES.map(([key, name]) => ({ x: FAR_PLACES[key][0], y: FAR_PLACES[key][1], name })),
  ];
  // People are kept two tiles clear; creatures only off the footprint (they wander round it).
  const spawnNear = (x0: number, y0: number, x1: number, y1: number) => ctx.spawns.some(s => s.kind === "npc" ? s.x >= x0 - 2 && s.x <= x1 + 2 && s.y >= y0 - 2 && s.y <= y1 + 2 : s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1);
  /** What a growing village clears away (a few trees and bushes), as opposed to what it builds round (rocks, signs, everything else). */
  const clearable = (index: number) => { const o = ctx.objects[index]; return o.kind === "tree" || (o.kind === "decor" && ["flowers", "bush", "reeds", "stump", "boulder"].includes(o.decor!)); };
  const nearBuilding = (x0: number, y0: number, x1: number, y1: number, gap: number) => ctx.buildings.some(b => b.x0 - gap <= x1 && b.x1 + gap >= x0 && b.y0 - gap <= y1 && b.y1 + gap >= y0);
  /** Open ground for a home's footprint, two tiles of walkable ground clear of anything in the way all round, one region. */
  const shunned = new Set(NOT_FOR_HOMES.map(id => regionIndex(id)));
  const fits = (x0: number, y0: number, x1: number, y1: number, region: number) => {
    if (x0 < 3 || y0 < 3 || y1 > OVERWORLD_H - 4 || !inBounds(x1 + 3, y1 + 3)) return false;
    if (nearBuilding(x0, y0, x1, y1, 2) || spawnNear(x0, y0, x1, y1)) return false;
    let felled = 0;
    const plot = HOME_PLOT_CLEAR;
    if (x0 <= plot.x1 + WEST_DX && x1 >= plot.x0 + WEST_DX && y0 <= plot.y1 && y1 >= plot.y0) return false;
    for (let y = y0 - 2; y <= y1 + 2; y++) for (let x = x0 - 2; x <= x1 + 2; x++) {
      const i = tileIndex(x, y), terrain = get(x, y), inside = x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1;
      if (ctx.region[i] !== region && shunned.has(ctx.region[i])) return false;
      if (inside ? !(x >= x0 && x <= x1 && y >= y0 && y <= y1 ? ground().open.has(terrain) : ground().walkable.has(terrain)) : !ground().walkable.has(terrain)) return false;
      const object = ctx.objectAt[i];
      if (object >= 0 && (inside || ctx.objects[object].blocks)) { if (!clearable(object) || ++felled > 8) return false; }
    }
    return true;
  };
  const clearSite = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0 - 2; y <= y1 + 2; y++) for (let x = x0 - 2; x <= x1 + 2; x++) { const object = ctx.objectAt[tileIndex(x, y)]; if (object >= 0 && clearable(object)) t.clearAt(x, y); }
  };
  for (const village of villages) {
    const region = ctx.region[tileIndex(village.x, village.y)];
    // Where the village's people can walk to (round a river, over its bridges): a home is only built there, never on the
    // far bank of water with no way across.
    const reach = new Set<number>(), queue: [number, number][] = [[village.x, village.y]];
    reach.add(tileIndex(village.x, village.y));
    while (queue.length) {
      const [x, y] = queue.pop()!;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (Math.abs(nx - village.x) > 48 || Math.abs(ny - village.y) > 48 || !inBounds(nx, ny) || reach.has(tileIndex(nx, ny)) || !ground().walkable.has(get(nx, ny))) continue;
        reach.add(tileIndex(nx, ny)); queue.push([nx, ny]);
      }
    }
    let built = 0;
    for (let r = 7; r <= 38 && built < HOMES_PER_VILLAGE; r++) {
      const steps = r * 3, turn = hash(village.x, village.y, 7) * Math.PI * 2;
      for (let k = 0; k < steps && built < HOMES_PER_VILLAGE; k++) {
        const a = turn + k / steps * Math.PI * 2, mx = Math.round(village.x + Math.cos(a) * r), my = Math.round(village.y + Math.sin(a) * r * 0.8);
        const look = Math.floor(hash(mx, my, 11) * 1000), w = 7 + (look % 3), h = 6 + (Math.floor(look / 3) % 2);
        const x0 = mx - Math.floor(w / 2), y0 = my - Math.floor(h / 2), x1 = x0 + w, y1 = y0 + h;
        if (!reach.has(tileIndex(Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2))) || !fits(x0, y0, x1, y1, region)) continue;
        clearSite(x0, y0, x1, y1);
        // The door on the side facing the village's middle.
        const dx = village.x - (x0 + x1) / 2, dy = village.y - (y0 + y1) / 2;
        const door = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "e" : "w") : dy > 0 ? "s" : "n";
        building(x0, y0, x1, y1, door, T.WOOD, undefined, {
          name: `${/^[AEIOU]/.test(village.name) ? "An" : "A"} ${village.name} home`, color: HOME_ROOFS[look % HOME_ROOFS.length], walls: (["timber", "stone", "plank"] as const)[Math.floor(look / 7) % 3], chimney: look % 4 !== 3,
        });
        const index = ctx.buildings.length - 1, doorTiles = ctx.doorways.slice(-2);
        // Most new homes are L-shaped, the corner away from the door left as a little yard; some have a second storey,
        // some a hipped roof.
        const shaped = look % 5 !== 0 && carveL(ctx, t, index, door), home = ctx.buildings[index];
        if (look % 3 === 1) home.storeys = 2;
        if (Math.floor(look / 5) % 2 === 0) { home.hip = true; if (shaped) ctx.buildings[ctx.buildings.length - 1].hip = true; }
        furnish(ctx, t, home, doorTiles, look);
        // The village grows to take it in.
        for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) ctx.region[tileIndex(x, y)] = region;
        built++;
      }
    }
  }
}

/** A bed, a table, a hearth and a shelf or chest, along the walls away from the door. */
function furnish(ctx: GenContext, t: Tools, home: Building, doorTiles: readonly (readonly [number, number])[], look: number) {
  const { get, tileIndex, decor } = t;
  // Every floor tile of the home (both arms of an L) that isn't the one inside the door, the far ones first.
  const tiles: [number, number][] = [];
  const complex = home.complex, parts = complex ? ctx.buildings.filter(b => b.complex === complex) : [home];
  const all = parts.reduce((r, b) => ({ x0: Math.min(r.x0, b.x0), y0: Math.min(r.y0, b.y0), x1: Math.max(r.x1, b.x1), y1: Math.max(r.y1, b.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  for (let y = all.y0 + 1; y < all.y1; y++) for (let x = all.x0 + 1; x < all.x1; x++) {
    if (get(x, y) !== T.WOOD || ctx.objectAt[tileIndex(x, y)] >= 0) continue;
    // Against a wall, so the middle stays clear to walk through.
    const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ox, oy]) => get(x + ox, y + oy) === T.WALL).length;
    if (walls === 0) continue;
    tiles.push([x, y]);
  }
  // Away from the door: the tiles just inside it, and beside them, stay free.
  const fromDoor = (x: number, y: number) => Math.min(...doorTiles.map(([dx, dy]) => Math.abs(dx - x) + Math.abs(dy - y)));
  const spots = tiles.filter(([x, y]) => fromDoor(x, y) > 2).sort((a, b) => fromDoor(b[0], b[1]) - fromDoor(a[0], a[1]) || hash(a[0], a[1], look) - hash(b[0], b[1], look));
  const kinds: readonly ["bed" | "table" | "hearth" | "shelf" | "chest", string][] = [
    ["bed", "A bed, made"], ["hearth", "The hearth: the heart of the house"], ["table", "A kitchen table with two chairs' worth of scratches"],
    [look % 2 ? "shelf" : "chest", look % 2 ? "A shelf of crockery and one good jug" : "A chest of winter clothes"],
  ];
  const used: [number, number][] = [], placed: [number, number, typeof kinds[number][0], string][] = [];
  // The floor left open must stay one room you can walk all of from the door, with every piece of furniture beside it.
  const open = (x: number, y: number) => get(x, y) === T.WOOD && ctx.objectAt[tileIndex(x, y)] < 0 && !used.some(([ux, uy]) => ux === x && uy === y);
  const stillOpen = () => {
    const start = doorTiles.find(([x, y]) => open(x, y));
    if (!start) return false;
    const seen = new Set([start[1] * ctx.W + start[0]]), queue: [number, number][] = [[start[0], start[1]]];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = ny * ctx.W + nx;
        if (nx < all.x0 || nx > all.x1 || ny < all.y0 || ny > all.y1 || seen.has(k) || !open(nx, ny)) continue;
        seen.add(k); queue.push([nx, ny]);
      }
    }
    for (let y = all.y0; y <= all.y1; y++) for (let x = all.x0; x <= all.x1; x++) if (open(x, y) && !seen.has(y * ctx.W + x)) return false;
    return used.every(([ux, uy]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((uy + dy) * ctx.W + ux + dx)));
  };
  for (const [kind, name] of kinds) {
    // Spread out (not right beside the last thing placed), and never closing anything off.
    const at = spots.find(([x, y]) => {
      if (!open(x, y) || !used.every(([ux, uy]) => Math.abs(ux - x) + Math.abs(uy - y) > 1)) return false;
      used.push([x, y]); const ok = stillOpen(); used.pop(); return ok;
    });
    if (!at) continue;
    used.push(at); placed.push([at[0], at[1], kind, name]);
  }
  for (const [x, y, kind, name] of placed) decor(x, y, kind, true, name);
}

/**
 * Leave one corner of a building out (an L): the corner becomes open ground and two new walls close the gap. Only when
 * the corner and the new walls are empty floor (no doors, furniture or people), and both arms keep a room's width.
 * Returns whether it did. The building becomes two parts sharing a `complex`, so walking in shows the whole inside.
 */
function carveL(ctx: GenContext, t: Tools, index: number, avoid?: "n" | "s" | "e" | "w"): boolean {
  const { get, put, tileIndex } = t, b = ctx.buildings[index], { x0, y0, x1, y1 } = b, w = x1 - x0, h = y1 - y0;
  const corners = ([[1, -1], [-1, -1], [1, 1], [-1, 1]] as const).slice().sort((a, c) => hash(x0 + a[0], y0 + a[1], 3) - hash(x0 + c[0], y0 + c[1], 3));
  for (const [sx, sy] of corners) {
    // Not the corner on the door's side (the door would end up in the yard's wall).
    if ((avoid === "e" && sx === 1) || (avoid === "w" && sx === -1) || (avoid === "s" && sy === 1) || (avoid === "n" && sy === -1)) continue;
    const cut = sx === 1 ? x0 + Math.ceil(w / 2) : x1 - Math.ceil(w / 2), row = sy === -1 ? y0 + Math.floor(h / 2) : y1 - Math.floor(h / 2);
    const cx0 = sx === 1 ? cut + 1 : x0, cx1 = sx === 1 ? x1 : cut - 1, cy0 = sy === -1 ? y0 : row + 1, cy1 = sy === -1 ? row - 1 : y1;
    // Both arms at least two tiles of floor across, the yard at least two by two.
    const armA = sx === 1 ? cut - x0 - 1 : x1 - cut - 1, armB = sy === -1 ? y1 - row - 1 : row - y0 - 1;
    if (armA < 2 || armB < 2 || cx1 - cx0 < 1 || cy1 - cy0 < 1) continue;
    // The yard, and the new walls along it (the column `cut` and the row `row`), must be empty floor or outer wall.
    let ok = true;
    const check = (x: number, y: number) => {
      const i = tileIndex(x, y), terrain = get(x, y), outline = x === x0 || x === x1 || y === y0 || y === y1;
      if (ctx.objectAt[i] >= 0 || ctx.spawns.some(s => s.x === x && s.y === y)) ok = false;
      // The outline must be wall there (no door), and inside must be floor (no inner wall).
      else if (outline ? terrain !== T.WALL : terrain === T.WALL) ok = false;
    };
    for (let y = cy0; y <= cy1 && ok; y++) for (let x = cx0; x <= cx1 && ok; x++) check(x, y);
    for (let y = Math.min(cy0, row); y <= Math.max(cy1, row) && ok; y++) check(cut, y);
    for (let x = Math.min(cx0, cut); x <= Math.max(cx1, cut) && ok; x++) check(x, row);
    // The new walls mustn't run into a door on the outline either (where they meet it).
    for (const [x, y] of [[cut, sy === -1 ? y0 : y1], [sx === 1 ? x1 : x0, row]] as const) if (get(x, y) !== T.WALL) ok = false;
    if (!ok) continue;
    // Outside the corner, what the yard becomes: the ground there, if it's ground.
    const ox = sx === 1 ? x1 + 1 : x0 - 1, oy = sy === -1 ? y0 - 1 : y1 + 1, outside = get(ox, oy);
    const yard = ground().walkable.has(outside) && outside !== T.WOOD && outside !== T.BRIDGE ? outside : T.GRASS;
    const before: number[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) before.push(get(x, y));
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) put(x, y, yard);
    for (let y = Math.min(cy0, row); y <= Math.max(cy1, row); y++) put(cut, y, T.WALL);
    for (let x = Math.min(cx0, cut); x <= Math.max(cx1, cut); x++) put(x, row, T.WALL);
    // Everything inside must still be reached from a door: every bit of floor, everyone standing there, and something
    // to stand beside at every counter, booth and shelf. If not, put it back as it was.
    if (!stillReachable(ctx, t, x0, y0, x1, y1)) { let k = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, before[k++]); continue; }
    // Two parts: the full-height arm, and the other arm (sharing the wall column `cut`).
    const complex = b.complex ?? `${b.name || "building"}@${x0},${y0}`;
    const armX0 = sx === 1 ? x0 : cut, armX1 = sx === 1 ? cut : x1;
    const wingX0 = sx === 1 ? cut : x0, wingX1 = sx === 1 ? x1 : cut, wingY0 = sy === -1 ? row : y0, wingY1 = sy === -1 ? y1 : row;
    Object.assign(b, { x0: armX0, x1: armX1, complex });
    ctx.buildings.push({ ...b, x0: wingX0, x1: wingX1, y0: wingY0, y1: wingY1, chimney: false, storeys: b.storeys && b.storeys > 1 && hash(x0, y0, 5) < 0.5 ? b.storeys - 1 : b.storeys });
    return true;
  }
  return false;
}

/** Whether every open tile, person and object inside a rectangle is reached from its doors (open tiles in its outline). */
function stillReachable(ctx: GenContext, t: Tools, x0: number, y0: number, x1: number, y1: number): boolean {
  const { get, tileIndex } = t;
  const blocked = (x: number, y: number) => { const o = ctx.objectAt[tileIndex(x, y)]; return o >= 0 && ctx.objects[o].blocks; };
  const floor = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && get(x, y) !== T.WALL && get(x, y) !== T.VOID && !blocked(x, y);
  const seen = new Set<number>(), queue: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x === x0 || x === x1 || y === y0 || y === y1) && floor(x, y)) { seen.add(tileIndex(x, y)); queue.push([x, y]); }
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = tileIndex(nx, ny); if (!seen.has(k) && floor(nx, ny)) { seen.add(k); queue.push([nx, ny]); } }
  }
  for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) {
    if (floor(x, y) && !seen.has(tileIndex(x, y))) return false;
    if (blocked(x, y) && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(tileIndex(x + dx, y + dy)))) return false;
  }
  return ctx.spawns.every(s => s.x <= x0 || s.x >= x1 || s.y <= y0 || s.y >= y1 || seen.has(tileIndex(s.x, s.y)));
}

/** Names of buildings never reshaped: towers, keeps, castles, crypts, the Ring's parts, the palace and its like. */
const KEEP_AS_BUILT = /tower|keep|castle|crypt|palace|cathedral|fortress|^the hall to|bell|spire|gatehouse|abbey|wall|ruin/i;

/** Give every ordinary building a shape and a roof of its own. */
export function varyBuildings(ctx: GenContext, t: Tools) {
  const count = ctx.buildings.length;
  for (let index = 0; index < count; index++) {
    const b = ctx.buildings[index];
    if (b.roof !== "gable" || b.round || b.keep || b.tall || b.facade || b.hip || (b.storeys ?? 1) > 2 || KEEP_AS_BUILT.test(b.name) || b.y1 >= OVERWORLD_H) continue;
    // Only free-standing buildings (not one built of parts, or inside or against another record).
    if (b.complex || ctx.buildings.some((o, j) => j !== index && o.x0 <= b.x1 && o.x1 >= b.x0 && o.y0 <= b.y1 && o.y1 >= b.y0)) continue;
    const w = b.x1 - b.x0, h = b.y1 - b.y0, roll = (salt: number) => hash(b.x0, b.y0, salt);
    const home = /house|home|cottage|cabin|shack|hut|lodge/i.test(b.name);
    // A small near-square home now and then is a tall, narrow tower-house under a pyramid roof.
    if (home && w <= 6 && h <= 6 && Math.abs(w - h) <= 1 && roll(1) < 0.18) { Object.assign(b, { storeys: 3, roof: "cone", spire: 46 + Math.round(roll(2) * 20) }); continue; }
    // Big enough: often an L.
    const shaped = w >= 7 && h >= 6 && roll(3) < 0.5 && carveL(ctx, t, index);
    // A second storey on about a third (the main arm of an L more often).
    if (b.storeys === undefined && roll(4) < (shaped ? 0.45 : 0.3)) b.storeys = 2;
    // Roofs: gabled, hipped, or (near square) a pyramid.
    const roof = roll(6);
    if (Math.abs(w - h) <= 1 && roof < 0.14 && !shaped) Object.assign(b, { roof: "cone", spire: 34 + Math.round(roll(7) * 18) });
    else if (roof < 0.5) b.hip = true;
    if (home && !b.chimney && roll(8) < 0.5) b.chimney = true;
    // The other arm of an L takes the same roof style.
    if (shaped) { const wing = ctx.buildings[ctx.buildings.length - 1]; wing.hip = b.hip; }
  }
}
