/**
 * Motion and life: skilling poses and impacts (wood chips, rock sparks, splashes, steam, embers), and the ambient
 * world (cloud shadows, birds, butterflies, leaves, snow, dust, fireflies, fish, forge smoke).
 * Particles live in world coordinates with a height, so they follow the camera, its rotation and the hills.
 */
import type { Game } from "./state.ts";
import { item } from "./data.ts";
import { T, W, groundHeight, inBounds, isUnderground, isWater, regionAt, type World } from "./world.ts";

export type Project = (x: number, y: number, lift?: number) => { x: number; y: number };
type Particle = {
  x: number; y: number; h: number; vx: number; vy: number; vh: number; gravity: number; age: number; life: number;
  color: string; size: number; kind: "chip" | "spark" | "drop" | "puff" | "leaf" | "flake" | "dust" | "glow" | "butterfly" | "ring";
  seed: number;
  /** Firework sparks: drawn glowing, over the night. */
  bright?: boolean;
};
const particles: Particle[] = [];
const MAX = 320;
/** While the renderer redraws things for their shadows, nothing they draw may spawn particles. */
export const hush = { on: false };
function add(particle: Omit<Particle, "age" | "seed">) {
  if (hush.on) return;
  if (particles.length >= MAX) particles.shift();
  particles.push({ ...particle, age: 0, seed: Math.random() * 1000 });
}
/** A slow grey puff of chimney or forge smoke. */
export function puff(x: number, y: number, h: number) { add({ x, y, h, vx: 0.18, vy: -0.08, vh: 16, gravity: -3, life: 3.2, color: "#9a968f", size: 5, kind: "puff" }); }
/** Effects waiting their moment (a firework's burst after its rocket climbs), on the effects clock. */
const pending: { at: number; run: () => void }[] = [];
let effectsClock = 0;
/**
 * Level-up fireworks over a world point: three rockets climb and burst into confetti in the colours given (a skill's),
 * with white sparkles. Returns the seconds after now at which each burst pops, for their sounds.
 */
export function fireworks(world: World, x: number, y: number, colors: readonly string[]) {
  const ground = groundHeight(world, x, y), pops: number[] = [];
  for (let r = 0; r < 3; r++) {
    const ox = (r - 1) * 0.8, oy = (1 - r) * 0.35, delay = r * 0.24, climb = 0.55 + r * 0.06, rise = 150, drag = 60;
    const apex = ground + 30 + rise * climb - drag * climb * climb / 2;
    pending.push({ at: effectsClock + delay, run: () => {
      add({ x: x + ox, y: y + oy, h: ground + 30, vx: 0, vy: 0, vh: rise, gravity: drag, life: climb, color: "#fff4c0", size: 3, kind: "spark", bright: true });
      for (let k = 1; k < 4; k++) add({ x: x + ox, y: y + oy, h: ground + 30, vx: 0, vy: 0, vh: rise - k * 12, gravity: drag, life: climb, color: "#e6a24a", size: 1.8, kind: "spark", bright: true });
    } });
    pending.push({ at: effectsClock + delay + climb, run: () => {
      const color = colors[r % colors.length];
      burst("spark", x + ox, y + oy, apex, 30, color, { speed: 5.2, up: 34, gravity: 40, life: 1.5, size: 3.6, bright: true });
      burst("spark", x + ox, y + oy, apex, 14, colors[(r + 1) % colors.length], { speed: 3.8, up: 26, gravity: 40, life: 1.3, size: 3, bright: true });
      burst("spark", x + ox, y + oy, apex, 14, "#ffffff", { speed: 4.2, up: 20, gravity: 20, life: 1, size: 2.4, bright: true });
      burst("chip", x + ox, y + oy, apex, 10, color, { speed: 1.4, up: 20, gravity: 50, life: 1.8, size: 2.5 });
    } });
    pops.push(delay + climb);
  }
  return pops;
}
/** A burst of `n` particles from a world point. */
export function burst(kind: Particle["kind"], x: number, y: number, h: number, n: number, color: string, options: { speed?: number; up?: number; life?: number; size?: number; gravity?: number; bright?: boolean } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, speed = (options.speed ?? 1.2) * (0.5 + Math.random());
    add({ x, y, h, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, vh: (options.up ?? 40) * (0.6 + Math.random() * 0.6), gravity: options.gravity ?? 160,
      life: (options.life ?? 0.7) * (0.7 + Math.random() * 0.6), color, size: options.size ?? 2, kind, bright: options.bright });
  }
}

// ---------- Skilling animation ----------
export type Pose = { tool: string | null; angle: number; side: 1 | -1; bob: number; reach: number; alpha: number; hop: number; target: { x: number; y: number } | null; line: boolean };
let lastPhase = 0;
function toolId(game: Game, kind: "axe" | "pickaxe"): string | null {
  const owned = [game.player.equipment.weapon, ...game.player.inventory.map(slot => slot?.id)];
  let best: { id: string; tier: number } | null = null;
  for (const id of owned) { const tool = id ? item(id).tool : undefined; if (tool?.kind === kind && (!best || tool.tier > best.tier)) best = { id: id!, tier: tool.tier }; }
  return best?.id ?? null;
}
/**
 * How the player looks this frame while doing something, plus impact effects on the beat.
 * `side` is which way the target is on screen (so the tool swings toward it).
 */
export function playerPose(game: Game, now: number, project: Project, reduced: boolean, sfx: (name: string, gain?: number) => void = () => {}): Pose {
  const player = game.player, activity = player.activity, pose: Pose = { tool: null, angle: 0, side: 1, bob: 0, reach: 0, alpha: 1, hop: 0, target: null, line: false };
  if (!activity) return pose;
  const world = game.world, here = project(player.x, player.y);
  const aim = (x: number, y: number) => { pose.target = { x, y }; pose.side = project(x, y).x < here.x ? -1 : 1; };
  const swing = (period: number, onImpact: () => void) => {
    const phase = (now % period) / period;
    pose.angle = phase < 0.65 ? -1.5 + phase / 0.65 * 0.4 : -1.1 + (phase - 0.65) / 0.35 * 1.8;
    if (phase < 0.15) pose.angle = -1.1 + (0.15 - phase) / 0.15 * -0.2;
    if (lastPhase < 0.85 && phase >= 0.85) onImpact();
    lastPhase = phase;
  };
  switch (activity.kind) {
    case "woodcut": {
      const tree = world.objects[activity.objectId]; aim(tree.x, tree.y); pose.tool = toolId(game, "axe");
      swing(760, () => { sfx("chop"); if (!reduced) burst("chip", tree.x, tree.y, 18, 4, "#b89c86", { speed: 1.6, up: 50, size: 2 }); });
      break;
    }
    case "mine": {
      const rock = world.objects[activity.objectId]; aim(rock.x, rock.y); pose.tool = toolId(game, "pickaxe");
      swing(820, () => { sfx("mine"); if (reduced) return; burst("chip", rock.x, rock.y, 10, 4, "#a39e96", { speed: 1.4, up: 45 }); burst("spark", rock.x, rock.y, 12, 3, "#fff4c0", { speed: 2, up: 30, life: 0.3, size: 1.5, gravity: 60 }); });
      break;
    }
    case "fish": {
      const spot = world.objects[activity.objectId]; aim(spot.x, spot.y); pose.line = activity.spot !== "net" && activity.spot !== "cage";
      pose.tool = activity.spot === "net" ? "small_net" : activity.spot === "cage" ? "crab_pot" : activity.spot === "harpoon" || activity.spot === "deep" ? "harpoon" : activity.spot === "lure" ? "fly_rod" : "fishing_rod";
      pose.angle = -0.9 + Math.sin(now / 500) * 0.12;
      if (!reduced && Math.random() < 0.02) burst("drop", spot.x, spot.y, 2, 3, "#ffffff", { speed: 0.5, up: 25, life: 0.5, size: 1.5 });
      break;
    }
    case "cook": {
      const source = activity.source === "range" ? world.objects[activity.sourceId] : game.fires.find(fire => fire.uid === activity.sourceId);
      if (source) { aim(source.x, source.y); if (!reduced && Math.random() < 0.08) add({ x: source.x + (Math.random() - 0.5) * 0.3, y: source.y, h: 26, vx: 0.05, vy: -0.05, vh: 18, gravity: -4, life: 1.6, color: "#ffffff", size: 4, kind: "puff" }); }
      pose.tool = activity.raw; pose.reach = 0.6 + Math.sin(now / 300) * 0.1; pose.angle = -0.4;
      break;
    }
    case "firemake": {
      pose.tool = "tinderbox"; pose.reach = 0.3; pose.bob = Math.abs(Math.sin(now / 120)) * 2; pose.angle = 0.3;
      if (!reduced && Math.random() < 0.3) burst("spark", player.x, player.y + 0.25, 4, 1, Math.random() < 0.5 ? "#f4dca0" : "#e9a07a", { speed: 0.6, up: 25, life: 0.4, size: 1.5, gravity: 40 });
      break;
    }
    case "produce": {
      const station = activity.recipe.station;
      const near = station && station !== "none" ? world.objects.find(object => object.kind === station && Math.abs(object.x - player.x) <= 1 && Math.abs(object.y - player.y) <= 1) : null;
      if (near) aim(near.x, near.y);
      if (station === "anvil" && near) { pose.tool = "hammer"; swing(600, () => { sfx("anvil", 0.7); if (!reduced) burst("spark", near.x, near.y, 14, 5, "#f4dca0", { speed: 1.8, up: 35, life: 0.35, size: 1.5, gravity: 80 }); }); }
      else if (station === "furnace" && near) { pose.reach = 0.5; if (!reduced && Math.random() < 0.15) burst("spark", near.x, near.y, 24, 1, "#e9a07a", { speed: 0.4, up: 30, life: 0.8, gravity: -10 }); }
      else { pose.tool = activity.recipe.tools?.[0] ?? null; pose.angle = -0.2 + Math.sin(now / 180) * 0.25; }
      break;
    }
    case "thieve_stall": { const stall = world.objects[activity.objectId]; aim(stall.x, stall.y); pose.reach = 0.8; break; }
    case "obstacle": {
      const total = world.objects[activity.objectId].obstacle?.ticks ?? 3, progress = Math.max(0, Math.min(1, 1 - activity.timer / total));
      pose.hop = Math.sin(progress * Math.PI) * 16; aim(activity.to.x, activity.to.y);
      break;
    }
    case "teleport": {
      pose.alpha = activity.timer <= 1 ? 0.35 : 1;
      if (!reduced && Math.random() < 0.5) add({ x: player.x + (Math.random() - 0.5) * 0.6, y: player.y + (Math.random() - 0.5) * 0.6, h: 2, vx: 0, vy: 0, vh: 60, gravity: 0, life: 0.9, color: Math.random() < 0.5 ? "#c6bed4" : "#ffffff", size: 2, kind: "spark" });
      break;
    }
  }
  return pose;
}

// ---------- Ambient life ----------
let spawnClock = 0, birdClock = 8;
type Bird = { x: number; y: number; vx: number; vy: number; age: number; count: number };
const birds: Bird[] = [];
/** Advance particles and spawn the region's ambient life around the camera. */
export function updateEffects(game: Game, camera: { x: number; y: number }, dt: number, reduced: boolean, view: number) {
  effectsClock += dt;
  for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= effectsClock) { const [due] = pending.splice(i, 1); due.run(); }
  for (const particle of particles) {
    particle.age += dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.h += particle.vh * dt; particle.vh -= particle.gravity * dt;
    if (particle.kind === "leaf" || particle.kind === "flake") { particle.x += Math.sin(particle.age * 2 + particle.seed) * dt * 0.4; }
    if (particle.kind === "butterfly" || particle.kind === "glow") { particle.vx += (Math.random() - 0.5) * dt * 2; particle.vy += (Math.random() - 0.5) * dt * 2; particle.vx *= 0.98; particle.vy *= 0.98; particle.vh = Math.sin(particle.age * 3 + particle.seed) * 6; }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i], floor = groundHeight(game.world, particle.x, particle.y);
    if (particle.age > particle.life || (particle.h < floor - 2 && particle.gravity > 0 && particle.kind !== "leaf" && particle.kind !== "flake")) particles.splice(i, 1);
  }
  for (const bird of birds) { bird.x += bird.vx * dt; bird.y += bird.vy * dt; bird.age += dt; }
  for (let i = birds.length - 1; i >= 0; i--) if (birds[i].age > 14) birds.splice(i, 1);
  if (reduced) return;
  const world = game.world, region = regionAt(world, Math.round(camera.x), Math.round(camera.y)).id, underground = isUnderground(camera.y);
  spawnClock += dt;
  const around = () => ({ x: camera.x + (Math.random() - 0.5) * view, y: camera.y + (Math.random() - 0.5) * view });
  while (spawnClock > 0.12) {
    spawnClock -= 0.12;
    const at = around(), terrain = inBounds(Math.round(at.x), Math.round(at.y)) ? world.tiles[Math.round(at.y) * W + Math.round(at.x)] : T.VOID;
    if (underground) { if (Math.random() < 0.25) add({ ...at, h: 20 + Math.random() * 40, vx: 0.05, vy: 0.02, vh: 2, gravity: 0, life: 4, color: "#9a968f", size: 1.5, kind: "dust" }); continue; }
    if (region === "frostpeak" || terrain === T.SNOW) add({ ...at, h: 120, vx: 0.15, vy: 0.1, vh: -28, gravity: 0, life: 5, color: "#ffffff", size: 2, kind: "flake" });
    else if ((region === "whisperwood" || region === "fernwick" || region === "mossy_ruins") && Math.random() < 0.35) add({ ...at, h: 70, vx: 0.1, vy: 0.05, vh: -16, gravity: 0, life: 5, color: Math.random() < 0.5 ? "#c9a36f" : "#a9b59c", size: 2, kind: "leaf" });
    else if ((region === "pale_dunes" || region === "oasis") && Math.random() < 0.4) add({ ...at, h: 4 + Math.random() * 10, vx: 1.4, vy: 0.3, vh: 0, gravity: 0, life: 2.2, color: "#d9c9a3", size: 1.5, kind: "dust" });
    else if (region === "murkmire" && Math.random() < 0.3) add({ ...at, h: 10 + Math.random() * 20, vx: 0, vy: 0, vh: 0, gravity: 0, life: 3.5, color: "#e8f0a0", size: 2, kind: "glow" });
    else if ((region === "friendhollow" || region === "farmland") && Math.random() < 0.06) add({ ...at, h: 12, vx: 0.2, vy: 0.1, vh: 0, gravity: 0, life: 6, color: ["#d8b6b4", "#e2d7ad", "#c6bed4", "#ffffff"][Math.floor(Math.random() * 4)], size: 2, kind: "butterfly" });
    if (isWater(terrain) && Math.random() < 0.05) { burst("drop", at.x, at.y, 1, 4, "#ffffff", { speed: 0.3, up: 40, life: 0.6, size: 1.5 }); add({ ...at, h: 0, vx: 0, vy: 0, vh: 0, gravity: 0, life: 1.2, color: "#ffffff", size: 1, kind: "ring" }); }
  }
  // Forge smoke and embers from nearby furnaces.
  if (Math.random() < 0.1) for (const object of world.objects) {
    if (object.kind !== "furnace" || Math.abs(object.x - camera.x) > view / 2 || Math.abs(object.y - camera.y) > view / 2) continue;
    add({ x: object.x, y: object.y, h: 40, vx: 0.15, vy: -0.1, vh: 20, gravity: -3, life: 3, color: "#8f8a83", size: 5, kind: "puff" });
  }
  // Now and then, a flock of birds crosses the sky.
  birdClock -= dt;
  if (!underground && birdClock <= 0) {
    birdClock = 18 + Math.random() * 20;
    const a = Math.random() * Math.PI * 2;
    birds.push({ x: camera.x - Math.cos(a) * view * 0.7, y: camera.y - Math.sin(a) * view * 0.7, vx: Math.cos(a) * 2.4, vy: Math.sin(a) * 2.4, age: 0, count: 3 + Math.floor(Math.random() * 4) });
  }
}
/** Big soft cloud shadows sliding over the land (drawn just after the terrain). */
export function drawCloudShadows(ctx: CanvasRenderingContext2D, project: Project, camera: { x: number; y: number }, now: number, zoom: number, underground: boolean, reduced: boolean) {
  if (underground) return;
  ctx.fillStyle = "rgba(22,22,22,0.055)";
  for (const [x, y, rx, ry] of cloudShadows(project, camera, now, zoom, reduced)) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
}
/** The clouds' shadows on screen: ellipses (centre x, y and radii, screen px), drifting with the wind. */
export function cloudShadows(project: Project, camera: { x: number; y: number }, now: number, zoom: number, reduced: boolean): [number, number, number, number][] {
  const t = reduced ? 0 : now / 1000, out: [number, number, number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const span = 60, cx = camera.x + ((((i * 37 + t * 0.35) % span) + span) % span) - span / 2, cy = camera.y + ((((i * 53 + t * 0.2) % span) + span) % span) - span / 2;
    const p = project(cx, cy, 0);
    out.push([p.x, p.y, (90 + i * 20) * zoom, (40 + i * 8) * zoom], [p.x + 60 * zoom, p.y + 14 * zoom, 60 * zoom, 26 * zoom]);
  }
  return out;
}
/** Particles and birds, on top of the scene. */
/**
 * Draw the particles and birds. Passes: "bright" is firework sparks (added over everything); "lit" is what the light falls
 * on (chips, leaves, smoke, birds…) and "glowing" what gives its own light (sparks and fireflies); "normal" is both.
 */
export function drawEffects(ctx: CanvasRenderingContext2D, project: Project, world: World, now: number, zoom: number, pass: "normal" | "bright" | "lit" | "glowing" = "normal") {
  if (pass === "bright") {
    // Firework sparks: a soft glow and a bright core, added over the night so they light up the dark.
    ctx.globalCompositeOperation = "lighter";
    for (const particle of particles) {
      if (!particle.bright) continue;
      const p = project(particle.x, particle.y, particle.h - groundHeight(world, particle.x, particle.y)), k = Math.max(0, 1 - particle.age / particle.life), s = particle.size * zoom * 1.5;
      ctx.globalAlpha = k * 0.16; ctx.fillStyle = particle.color; ctx.fillRect(p.x - s * 1.5, p.y - s * 1.5, s * 3, s * 3);
      ctx.globalAlpha = Math.min(0.9, k * 1.2); ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.max(1, Math.round(s)), Math.max(1, Math.round(s)));
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    return;
  }
  const glowing = (particle: Particle) => particle.kind === "glow" || particle.kind === "spark";
  for (const particle of particles) {
    if (particle.bright || (pass === "lit" && glowing(particle)) || (pass === "glowing" && !glowing(particle))) continue;
    const floor = particle.kind === "leaf" || particle.kind === "flake" ? Math.max(particle.h, groundHeight(world, particle.x, particle.y)) : particle.h;
    const p = project(particle.x, particle.y, floor - groundHeight(world, particle.x, particle.y)), k = 1 - particle.age / particle.life, s = particle.size * zoom * 1.5;
    ctx.globalAlpha = Math.max(0, Math.min(1, particle.kind === "puff" ? k * 0.45 : particle.kind === "glow" ? (0.5 + Math.sin(now / 200 + particle.seed) * 0.5) * k : k * 1.4));
    ctx.fillStyle = particle.color;
    if (particle.kind === "puff") { ctx.beginPath(); ctx.arc(p.x, p.y, s * (1 + particle.age), 0, Math.PI * 2); ctx.fill(); }
    else if (particle.kind === "ring") { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(p.x, p.y, (3 + particle.age * 14) * zoom, (1.5 + particle.age * 7) * zoom, 0, 0, Math.PI * 2); ctx.stroke(); }
    else if (particle.kind === "butterfly") { const flap = Math.abs(Math.sin(now / 90 + particle.seed)) * s; ctx.fillRect(p.x - flap - 1, p.y - s / 2, flap, s); ctx.fillRect(p.x + 1, p.y - s / 2, flap, s); ctx.fillStyle = "#161616"; ctx.fillRect(p.x - 0.5, p.y - s / 2, 1, s); }
    else if (particle.kind === "glow") { ctx.fillStyle = "rgba(232,240,160,0.3)"; ctx.fillRect(p.x - s * 1.5, p.y - s * 1.5, s * 3, s * 3); ctx.fillStyle = particle.color; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); }
    else { ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.max(1, Math.round(s)), Math.max(1, Math.round(s))); if (particle.kind === "chip" || particle.kind === "flake") { ctx.strokeStyle = "#161616"; ctx.lineWidth = 0.6; ctx.strokeRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.round(s), Math.round(s)); } }
  }
  ctx.globalAlpha = 1;
  if (pass === "glowing") return;
  ctx.strokeStyle = "#161616"; ctx.lineWidth = 1.4;
  for (const bird of birds) for (let i = 0; i < bird.count; i++) {
    const offset = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.8, back = Math.ceil(i / 2) * 0.9, bx = bird.x - bird.vx / 2.4 * back - bird.vy / 2.4 * offset, by = bird.y - bird.vy / 2.4 * back + bird.vx / 2.4 * offset;
    const p = project(bx, by, 150 - groundHeight(world, bx, by)), flap = Math.sin(now / 110 + i) * 3 * zoom, w = 5 * zoom;
    ctx.beginPath(); ctx.moveTo(p.x - w, p.y - flap); ctx.lineTo(p.x, p.y); ctx.lineTo(p.x + w, p.y - flap); ctx.stroke();
  }
}
/** A tree being chopped trembles a little on each swing. */
export function treeShake(game: Game, objectId: number, now: number) {
  const activity = game.player.activity;
  if (activity?.kind !== "woodcut" || activity.objectId !== objectId) return 0;
  const phase = (now % 760) / 760;
  return phase > 0.85 ? Math.sin((phase - 0.85) * 60) * 1.6 : 0;
}
