/**
 * The Realm on WebGL2: the GPU side of the renderer.
 *
 * The camera is a true orthographic one, set up to land every point exactly where the canvas renderer's `toScreen`
 * puts it (the same turn, zoom, pitch and lift), with a depth buffer, so the ground and the walls stand in front of and
 * behind each other by geometry instead of by sorting. What's on the GPU so far:
 * - the ground: per-tile meshes (a chunk at a time, built once) with the terrain's pixel textures, slope light, the
 *   inked edges between kinds of ground, contour lines on the hills, and moving water and lava, all in the shader;
 * - boxes: every wall, course and battlement the canvas renderer would have drawn, as instanced boxes with pixel-art
 *   faces (one layer of a texture array per face texture) and ink outlines.
 * - sprites: every piece of pixel art (trees, rocks, decorations, Friends, creatures, fires) as a textured quad from one
 *   atlas, standing upright on its feet (or lying flat, for what lies on the ground) so the walls' depth hides it where a
 *   wall stands in front; each is lit and hazed by its own light in the shader, and sprites cover each other in the
 *   canvas renderer's draw order.
 * - light, shadow and haze: the ground in the light field's own map (sampled where each pixel lies), darkened where the
 *   sun's shadows fall (a mask of buildings' and walls' shapes swept along the sun and every sprite's silhouette laid
 *   flat and slanted) and under the clouds; walls, roofs and sprites each in the light where they stand, lit windows
 *   glowing at night; everything hazed by its distance.
 * Everything else is still drawn by the canvas renderer onto a transparent layer, which cuts holes where a wall, a rise
 * of ground or a sprite stands in front of it, and is laid over the GPU's finished picture in each canvas thing's own
 * light and haze (one fill each in the light and haze buffers).
 */

export type GLCamera = { x: number; y: number; zoom: number; angle: number; pitch: number; base: number };
/**
 * Floats per box instance: centre x, y; size w, d; lift; height; texture layers left, right, top (−1: plain); colours
 * top, left, right; how dark its outline is; its light (r, g, b) and how clear of the haze it is; and whether its
 * windows glow (0 no, 1 brick, 2 timber).
 */
export const BOX_FLOATS = 24;
/**
 * Floats per mesh vertex (roofs): x, y, height above the ground; texture u, v (texture pixels) and layer (−1: plain);
 * colour r, g, b and alpha; four distances to the face's edges (0 on an edge), for its ink outline; its light (r, g, b)
 * and how clear of the haze it is.
 */
export const MESH_FLOATS = 18;
/**
 * How the frame is lit, all on the GPU: the light field's map of the ground (`field`, laid over tiles from `origin`,
 * `size` tiles across, rebuilt when `version` changes); the sun's shadows (`shadows`: what share of the light is left in
 * them); the clouds' shadows (ellipses on screen, view px) and how dark they are; the haze (round `here`, from `start` to
 * `end` tiles, its colour); the sky's own light; and how brightly lit windows glow.
 */
export type Lighting = {
  field: HTMLCanvasElement; origin: readonly [number, number]; size: readonly [number, number]; version: number;
  shadows: readonly number[] | null; clouds: readonly (readonly [number, number, number, number])[]; cloudK: number;
  hazy: boolean; here: readonly [number, number]; start: number; end: number; haze: readonly number[]; sky: readonly number[]; windowGlow: number;
};
/**
 * Floats per ground vertex: x, y, h; u, v; layer; shade; edges; kind; and the texture layers of the ground it blends
 * into to the north, east, south and west (−1: an inked edge, or none).
 */
export const GROUND_FLOATS = 13;
/**
 * Floats per sprite: its corners on screen (top left, top right, bottom left: view pixels); its place in the atlas (u0, v0,
 * u1, v1, page); a tint (r, g, b, alpha); its light (r, g, b) and how clear of the haze it is; its feet (screen y, depth)
 * and whether it lies flat.
 */
export const SPRITE_FLOATS = 22;

const PROJECT = /* glsl */ `
uniform vec2 uCam; uniform float uZoom; uniform float uCos; uniform float uSin; uniform float uPitch; uniform float uLift; uniform float uBase; uniform vec2 uView;
vec4 project(vec3 p) {
  vec2 rel = p.xy - uCam;
  float rx = rel.x * uCos - rel.y * uSin, ry = rel.x * uSin + rel.y * uCos;
  float h = p.z - uBase;
  float sx = (rx - ry) * 32.0 * uZoom, sy = ((rx + ry) * 32.0 * uPitch - h * uLift) * uZoom;
  // Nearer the camera is deeper into the screen's depth: forward along the ground, and up (as a true camera sees it).
  float cosE = sqrt(max(0.0, 1.0 - uPitch * uPitch));
  float d = (rx + ry) * 32.0 * cosE + h * uPitch / 0.8660254;
  return vec4(sx / (uView.x * 0.5), -sy / (uView.y * 0.5), -d / 30000.0, 1.0);
}`;

const GROUND_VS = /* glsl */ `#version 300 es
precision highp float;
${PROJECT}
layout(location = 0) in vec3 aPos; layout(location = 1) in vec2 aUv; layout(location = 2) in float aLayer; layout(location = 3) in float aShade;
layout(location = 4) in float aEdges; layout(location = 5) in float aKind; layout(location = 6) in vec4 aBlend;
out vec2 vUv; flat out float vLayer; out float vShade; flat out int vEdges; flat out int vKind; out float vHeight; out vec2 vWorld; flat out vec4 vBlend;
void main() {
  gl_Position = project(aPos);
  vUv = aUv; vLayer = aLayer; vShade = aShade; vEdges = int(aEdges + 0.5); vKind = int(aKind + 0.5); vHeight = aPos.z; vWorld = aPos.xy; vBlend = aBlend;
}`;
/** The ground's fragments; with `blend`, natural ground dithers into its neighbours (a separate program, so ground without it pays nothing for it). */
const GROUND_FS = (blend: boolean) => /* glsl */ `#version 300 es
${blend ? "#define BLEND" : ""}
precision highp float; precision highp sampler2DArray;
uniform sampler2DArray uGround; uniform float uTime; uniform float uInk;
uniform sampler2D uField; uniform vec2 uFieldOrigin; uniform vec2 uFieldSize;
uniform sampler2D uShadow; uniform int uShadowOn; uniform vec3 uShare; uniform vec2 uCanvas; uniform vec2 uView;
uniform vec4 uClouds[8]; uniform int uCloudCount; uniform float uCloudK;
uniform int uHazy; uniform vec2 uHere; uniform vec2 uHazeRange; uniform vec3 uHazeColor;
in vec2 vUv; flat in float vLayer; in float vShade; flat in int vEdges; flat in int vKind; in float vHeight; in vec2 vWorld; flat in vec4 vBlend;
out vec4 outColor;
void main() {
  // Where natural ground meets another kind (grass and sand, path and snow), the two are dithered into each other a
  // texel at a time across the last few texels of each side, more of the neighbour the nearer its edge.
  float layer = vLayer;
#ifdef BLEND
  if (max(max(vBlend.x, vBlend.y), max(vBlend.z, vBlend.w)) >= 0.0) {
    vec2 texel = floor(clamp(vUv, 0.0, 0.9999) * 16.0), c = (texel + 0.5) / 16.0, tile = floor(vWorld + 0.5);
    float r = fract(sin(dot(texel + tile * 16.0, vec2(12.9898, 78.233))) * 43758.5453);
    vec4 d = vec4(c.y, 1.0 - c.x, 1.0 - c.y, c.x), w = 0.5 * clamp(1.0 - d / 0.42, 0.0, 1.0) * step(0.0, vBlend);
    float best = max(max(w.x, w.y), max(w.z, w.w));
    if (r < best) layer = best == w.x ? vBlend.x : best == w.y ? vBlend.y : best == w.z ? vBlend.z : vBlend.w;
  }
#endif
  vec3 color = texture(uGround, vec3(vUv, layer)).rgb + vShade;
  // Water: slow ripples catching the light; lava: a pulsing glow.
  if (vKind == 1 || vKind == 2) {
    float t = uTime;
    float w = sin(vWorld.x * 2.3 + vWorld.y * 1.4 + t * 1.6) * sin(vWorld.y * 2.9 - vWorld.x * 0.8 + t * 1.1);
    color += vec3(smoothstep(0.82, 0.98, w)) * (vKind == 2 ? 0.16 : 0.28);
  } else if (vKind == 3) {
    float glow = 0.5 + 0.5 * sin(uTime * 2.0 + vWorld.x * 1.3 + vWorld.y * 0.7);
    color = mix(color, vec3(0.98, 0.78 + glow * 0.15, 0.47), 0.25 + glow * 0.25);
  }
  // Contour lines every 10 px of height, like a map's (not on water).
  if (vKind != 1 && vKind != 2) {
    float level = vHeight / 10.0, band = abs(fract(level + 0.5) - 0.5) / max(fwidth(level), 1e-4);
    if (vHeight > 0.5) color = mix(color, vec3(0.086), (1.0 - smoothstep(0.0, 1.0, band)) * 0.16);
  }
  // Inked edges where one kind of ground meets another (north, east, south, west of the tile).
  vec2 px = max(fwidth(vUv), vec2(1e-4));
  float e = 1e6;
  if ((vEdges & 1) != 0) e = min(e, vUv.y / px.y);
  if ((vEdges & 2) != 0) e = min(e, (1.0 - vUv.x) / px.x);
  if ((vEdges & 4) != 0) e = min(e, (1.0 - vUv.y) / px.y);
  if ((vEdges & 8) != 0) e = min(e, vUv.x / px.x);
  color = mix(color, vec3(0.086), (1.0 - smoothstep(uInk - 0.5, uInk + 0.5, e)) * 0.55);
  // The light falling here (the light field's map), less the sun's where something's shadow lies, and the clouds'.
  vec3 light = texture(uField, (vWorld - uFieldOrigin) / uFieldSize).rgb;
  vec2 screen = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y) * (uView / uCanvas);
  if (uShadowOn == 1) light *= mix(vec3(1.0), uShare, texture(uShadow, gl_FragCoord.xy / uCanvas).r);
  for (int i = 0; i < 8; i++) {
    if (i >= uCloudCount) break;
    vec2 q = (screen - uClouds[i].xy) / uClouds[i].zw;
    if (dot(q, q) < 1.0) light *= 1.0 - uCloudK;
  }
  color *= light;
  // Seen through the haze, further off.
  if (uHazy == 1) { float t = clamp((distance(vWorld, uHere) - uHazeRange.x) / (uHazeRange.y - uHazeRange.x), 0.0, 1.0), clear = 1.0 - 0.97 * t * t * (3.0 - 2.0 * t); color = color * clear + uHazeColor * (1.0 - clear); }
  outColor = vec4(color, 1.0);
}`;

const BOX_VS = /* glsl */ `#version 300 es
precision highp float;
${PROJECT}
uniform highp sampler2D uHeights; uniform vec2 uWorld;
in vec3 aCorner; in vec3 aNormal; in vec2 aFace;
in vec2 iCentre; in vec2 iSize; in float iLift; in float iHeight; in vec3 iLayers; in vec3 iTop; in vec3 iLeft; in vec3 iRight; in float iInk; in vec4 iLight; in float iGlow;
out vec3 vColor; out vec3 vTex; flat out int vSide; out vec2 vFace; out vec2 vFacePx; flat out float vInk; flat out vec4 vLight; flat out float vGlow;
float groundAt(vec2 p) {
  vec2 uv = clamp(p + 0.5, vec2(0.0), uWorld - 0.001); ivec2 i = ivec2(floor(uv)); vec2 f = uv - vec2(i);
  float a = texelFetch(uHeights, i, 0).r, b = texelFetch(uHeights, i + ivec2(1, 0), 0).r, c = texelFetch(uHeights, i + ivec2(0, 1), 0).r, d = texelFetch(uHeights, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  vec2 xy = iCentre + aCorner.xy * iSize;
  float z = iLift + aCorner.z * iHeight;
  gl_Position = project(vec3(xy, z + groundAt(xy)));
  vFace = aFace; vInk = iInk; vLight = iLight; vGlow = aNormal.z > 0.5 ? 0.0 : iGlow;
  if (aNormal.z > 0.5) {
    // The lid: plain, or a cap texture laid across it.
    vColor = iTop; vSide = 0; vTex = vec3((aCorner.xy + 0.5) * iSize * 16.0, iLayers.z);
    vFacePx = iSize * 16.0;
  } else {
    // A side: lighter facing left on screen, darker facing right, textured along its length from its top down.
    float rx = aNormal.x * uCos - aNormal.y * uSin, ry = aNormal.x * uSin + aNormal.y * uCos;
    bool left = rx - ry < 0.0;
    vColor = left ? iLeft : iRight; vSide = left ? 1 : 2;
    float length = abs(aNormal.x) > 0.5 ? iSize.y : iSize.x;
    vTex = vec3(aFace.x * length * 16.0, (1.0 - aCorner.z) * iHeight * 0.5, left ? iLayers.x : iLayers.y);
    vFacePx = vec2(length * 16.0, iHeight * 0.5);
  }
}`;
const BOX_FS = /* glsl */ `#version 300 es
precision highp float; precision highp sampler2DArray;
uniform sampler2DArray uWalls; uniform float uWindowGlow; uniform int uHazy; uniform vec3 uHazeColor;
in vec3 vColor; in vec3 vTex; flat in int vSide; in vec2 vFace; in vec2 vFacePx; flat in float vInk; flat in vec4 vLight; flat in float vGlow;
out vec4 outColor;
void main() {
  vec3 color = vColor;
  if (vTex.z >= 0.0) color = texture(uWalls, vec3(vTex.x / 16.0, vTex.y / 24.0, vTex.z)).rgb;
  // The ink outline round every face, a screen pixel wide.
  vec2 px = max(fwidth(vFace), vec2(1e-4));
  float e = min(min(vFace.x / px.x, (1.0 - vFace.x) / px.x), min(vFace.y / px.y, (1.0 - vFace.y) / px.y));
  color = mix(color, vec3(0.086), (1.0 - smoothstep(0.4, 1.2, e)) * vInk);
  // In its own light; a lit window's glass glows warm with the lamps inside (the panes' place in the wall texture).
  vec3 light = vLight.rgb;
  if (vGlow > 0.5) {
    vec2 t = mod(floor(vTex.xy), vec2(16.0, 24.0)); float top = vGlow > 1.5 ? 3.0 : 5.0;
    if (t.x >= 5.0 && t.x < 11.0 && t.y >= top && t.y < top + 7.0) light = light + (vec3(1.0, 0.95, 0.84) - light) * uWindowGlow;
  }
  color *= light;
  if (uHazy == 1) color = color * vLight.a + uHazeColor * (1.0 - vLight.a);
  outColor = vec4(color, 1.0);
}`;

const MESH_VS = /* glsl */ `#version 300 es
precision highp float;
${PROJECT}
uniform highp sampler2D uHeights; uniform vec2 uWorld;
in vec3 aPos; in vec3 aTex; in vec4 aColor; in vec4 aEdge; in vec4 aLight;
out vec2 vTex; flat out float vLayer; out vec4 vColor; out vec4 vEdge; flat out vec4 vLight;
float groundAt(vec2 p) {
  vec2 uv = clamp(p + 0.5, vec2(0.0), uWorld - 0.001); ivec2 i = ivec2(floor(uv)); vec2 f = uv - vec2(i);
  float a = texelFetch(uHeights, i, 0).r, b = texelFetch(uHeights, i + ivec2(1, 0), 0).r, c = texelFetch(uHeights, i + ivec2(0, 1), 0).r, d = texelFetch(uHeights, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  gl_Position = project(vec3(aPos.xy, aPos.z + groundAt(aPos.xy)));
  vTex = aTex.xy; vLayer = aTex.z; vColor = aColor; vEdge = aEdge; vLight = aLight;
}`;
const MESH_FS = /* glsl */ `#version 300 es
precision highp float; precision highp sampler2DArray;
uniform sampler2DArray uWalls; uniform float uLine; uniform int uHazy; uniform vec3 uHazeColor;
in vec2 vTex; flat in float vLayer; in vec4 vColor; in vec4 vEdge; flat in vec4 vLight;
out vec4 outColor;
void main() {
  vec3 color = vLayer >= 0.0 ? texture(uWalls, vec3(vTex.x / 16.0, vTex.y / 24.0, vLayer)).rgb : vColor.rgb;
  // The ink outline round the face, as thick as the canvas renderer's roof outlines.
  vec4 e = vEdge / max(fwidth(vEdge), vec4(1e-4));
  float edge = min(min(e.x, e.y), min(e.z, e.w));
  color = mix(color, vec3(0.086), 1.0 - smoothstep(uLine * 0.6 - 0.5, uLine * 0.6 + 0.5, edge));
  color *= vLight.rgb;
  if (uHazy == 1) color = color * vLight.a + uHazeColor * (1.0 - vLight.a);
  outColor = vec4(color * vColor.a, vColor.a);
}`;

const SPRITE_VS = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uView;
in vec2 aCorner;
in vec4 iP01; in vec2 iP3; in vec4 iUv; in float iPage; in vec4 iTint; in vec4 iLight; in vec3 iFoot;
out vec2 vUv; flat out float vPage; flat out vec4 vTint; flat out vec4 vLight; out float vY; flat out vec3 vFoot;
void main() {
  vec2 p = iP01.xy + (iP01.zw - iP01.xy) * aCorner.x + (iP3 - iP01.xy) * aCorner.y;
  vUv = vec2(mix(iUv.x, iUv.z, aCorner.x), mix(iUv.y, iUv.w, aCorner.y));
  vPage = iPage; vTint = iTint; vLight = iLight; vY = p.y; vFoot = iFoot;
  gl_Position = vec4(p.x / (uView.x * 0.5) - 1.0, 1.0 - p.y / (uView.y * 0.5), 0.0, 1.0);
}`;
const SPRITE_FS = /* glsl */ `#version 300 es
precision highp float; precision highp sampler2DArray;
uniform sampler2DArray uAtlas; uniform float uKUp; uniform float uKFlat; uniform vec3 uHaze; uniform int uHazy;
in vec2 vUv; flat in float vPage; flat in vec4 vTint; flat in vec4 vLight; in float vY; flat in vec3 vFoot;
out vec4 outColor;
void main() {
  vec4 t = texture(uAtlas, vec3(vUv, vPage));
  float a = t.a * vTint.a;
  if (a < 0.004) discard;
  // Its depth, as if it stood upright on its feet (what's below them lies on the ground), or lay flat: a little nearer
  // than the ground it stands on, so only what really stands in front of it hides it.
  float up = vFoot.x - vY;
  float d = vFoot.z > 0.5 ? vFoot.y + 3.0 - up * uKFlat : vFoot.y + 8.0 + max(up, 0.0) * uKUp + max(-up, 0.0) * uKFlat;
  gl_FragDepth = clamp(0.5 - d / 60000.0, 0.0, 1.0);
  vec3 color = t.rgb * vTint.rgb * vTint.a * vLight.rgb;
  if (uHazy == 1) color = color * vLight.a + uHaze * (1.0 - vLight.a) * a;
  outColor = vec4(color, a);
}`;

const QUAD_VS = /* glsl */ `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const SKY_FS = /* glsl */ `#version 300 es
precision mediump float;
uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uLight; in vec2 vUv; out vec4 outColor;
void main() { outColor = vec4(mix(uBottom, uTop, vUv.y) * uLight, 1.0); }`;
/** The sun's shadows: flat shapes (buildings' and walls', page < 0) and sprites' silhouettes, laid flat and slanted. */
const SHADOW_VS = /* glsl */ `#version 300 es
uniform vec2 uView; in vec2 aPos; in vec3 aTex; out vec3 vTex;
void main() { vTex = aTex; gl_Position = vec4(aPos.x / (uView.x * 0.5) - 1.0, 1.0 - aPos.y / (uView.y * 0.5), 0.0, 1.0); }`;
const SHADOW_FS = /* glsl */ `#version 300 es
precision highp float; precision highp sampler2DArray;
uniform sampler2DArray uAtlas; in vec3 vTex; out vec4 outColor;
void main() { if (vTex.z >= 0.0 && texture(uAtlas, vTex).a < 0.5) discard; outColor = vec4(1.0); }`;
/** Floats per shadow vertex: x, y (view px); u, v, page in the sprite atlas (page −1: a solid shape). */
const SHADOW_FLOATS = 5;
/**
 * The canvas layer over the GPU's finished picture: lit by the light buffer (each canvas thing's light) and hazed by
 * how clear of the haze each canvas thing stands (the haze buffer).
 */
const COMPOSE_FS = /* glsl */ `#version 300 es
precision mediump float;
uniform sampler2D uScene; uniform sampler2D uOverlay; uniform sampler2D uLight; uniform sampler2D uHaze;
uniform int uHazy; uniform vec3 uHazeColor; in vec2 vUv; out vec4 outColor;
void main() {
  vec2 flip = vec2(vUv.x, 1.0 - vUv.y);
  vec4 o = texture(uOverlay, flip);
  vec3 layer = o.rgb * texture(uLight, flip).rgb;
  if (uHazy == 1) { float clear = texture(uHaze, flip).r; layer = layer * clear + uHazeColor * (1.0 - clear) * o.a; }
  outColor = vec4(layer + texture(uScene, vUv).rgb * (1.0 - o.a), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const make = (type: number, source: string) => {
    const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Realm GL shader: ${gl.getShaderInfoLog(shader)}`);
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, make(gl.VERTEX_SHADER, vs)); gl.attachShader(program, make(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Realm GL program: ${gl.getProgramInfoLog(program)}`);
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  return { program, u: (name: string) => { if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name)); return uniforms.get(name)!; }, a: (name: string) => gl.getAttribLocation(program, name) };
}
type Program = ReturnType<typeof compile>;

/** A texture array that grows as layers are asked for: one layer per distinct canvas (by identity). */
class LayerArray {
  texture: WebGLTexture; private capacity: number; private layers = new Map<HTMLCanvasElement, number>(); private sources: HTMLCanvasElement[] = [];
  constructor(private gl: WebGL2RenderingContext, readonly w: number, readonly h: number, capacity: number) { this.capacity = capacity; this.texture = this.allocate(capacity); }
  private allocate(depth: number) {
    const gl = this.gl, texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, this.w, this.h, depth);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, gl.NEAREST);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, gl.REPEAT);
    return texture;
  }
  layer(canvas: HTMLCanvasElement): number {
    const known = this.layers.get(canvas);
    if (known !== undefined) return known;
    const gl = this.gl, index = this.sources.length;
    if (index >= this.capacity) {
      // Grow: a bigger array, every layer laid in again.
      this.capacity *= 2; gl.deleteTexture(this.texture); this.texture = this.allocate(this.capacity);
      this.sources.forEach((source, i) => this.upload(source, i));
    }
    this.sources.push(canvas); this.layers.set(canvas, index); this.upload(canvas, index);
    return index;
  }
  private upload(canvas: HTMLCanvasElement, index: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, index, this.w, this.h, 1, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }
}

/**
 * Every sprite's pixels in one texture: pages of shelves, each canvas laid in the first time it's drawn (by identity:
 * the art is cached and never changes). When it's full it starts again, at the start of a frame.
 */
const ATLAS = 2048, ATLAS_PAGES = 2;
class SpriteAtlas {
  texture: WebGLTexture; full = false;
  private slots = new Map<HTMLCanvasElement, readonly number[]>(); private page = 0; private x = 0; private y = 0; private row = 0;
  constructor(private gl: WebGL2RenderingContext) {
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, ATLAS, ATLAS, ATLAS_PAGES);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, gl.NEAREST);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, gl.CLAMP_TO_EDGE);
  }
  /** Where a canvas is in the atlas (u0, v0, u1, v1, page), laying it in if it's new; null if there's no room this frame. */
  slot(canvas: HTMLCanvasElement): readonly number[] | null {
    const known = this.slots.get(canvas);
    if (known) return known;
    const w = canvas.width, h = canvas.height;
    if (this.full || !w || !h || w > ATLAS - 2 || h > ATLAS - 2) return null;
    if (this.x + w + 1 > ATLAS) { this.x = 0; this.y += this.row + 1; this.row = 0; }
    if (this.y + h + 1 > ATLAS) { this.page++; this.x = 0; this.y = 0; this.row = 0; }
    if (this.page >= ATLAS_PAGES) { this.full = true; return null; }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, this.x, this.y, this.page, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const slot = [this.x / ATLAS, this.y / ATLAS, (this.x + w) / ATLAS, (this.y + h) / ATLAS, this.page];
    this.slots.set(canvas, slot);
    this.x += w + 1; this.row = Math.max(this.row, h);
    return slot;
  }
  reset() { this.slots.clear(); this.page = 0; this.x = 0; this.y = 0; this.row = 0; this.full = false; }
}

type Chunk = { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number; used: number };

export class RealmGL {
  readonly gl: WebGL2RenderingContext;
  private ground: Program; private groundPlain: Program; private boxes: Program; private sky: Program; private compose: Program; private sprites: Program; private mesh: Program; private shadow: Program;
  private meshVao: WebGLVertexArrayObject; private meshBuffer: WebGLBuffer;
  private meshData = [new Float32Array(MESH_FLOATS * 3 * 2048), new Float32Array(MESH_FLOATS * 3 * 256)]; private meshCount = [0, 0];
  private quad: WebGLVertexArrayObject; private cube: { vao: WebGLVertexArrayObject; instances: WebGLBuffer; count: number };
  readonly groundLayers: LayerArray; readonly wallLayers: LayerArray;
  private chunks = new Map<string, Chunk>(); private frame = 0;
  private heights: WebGLTexture | null = null; private heightsOf: Float32Array | null = null; private world = { w: 1, h: 1 };
  private fbo: WebGLFramebuffer; private sceneColor: WebGLTexture; private sceneDepth: WebGLRenderbuffer; private size = { w: 0, h: 0 };
  private overlay: WebGLTexture; private light: WebGLTexture; private haze: WebGLTexture;
  private field: WebGLTexture; private fieldVersion = -1;
  private shadowFbo: WebGLFramebuffer; private shadowMask: WebGLTexture; private shadowVao: WebGLVertexArrayObject; private shadowBuffer: WebGLBuffer;
  private shadowData = new Float32Array(SHADOW_FLOATS * 6 * 512); private shadowCount = 0;
  private boxData = new Float32Array(BOX_FLOATS * 1024); private boxCount = 0;
  private atlas: SpriteAtlas; private spriteQuad: { vao: WebGLVertexArrayObject; instances: WebGLBuffer };
  private spriteData = new Float32Array(SPRITE_FLOATS * 1024); private spriteCount = 0;

  /** A renderer on the canvas, or null where WebGL2 isn't there (the canvas renderer carries on alone). */
  static create(canvas: HTMLCanvasElement, keepFrames = false): RealmGL | null {
    try {
      // (keepFrames: automated tests and the trailer recorder read frames back off the canvas.)
      const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, premultipliedAlpha: false, preserveDrawingBuffer: keepFrames, powerPreference: "high-performance" });
      return gl ? new RealmGL(gl) : null;
    } catch { return null; }
  }
  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.ground = compile(gl, GROUND_VS, GROUND_FS(true)); this.groundPlain = compile(gl, GROUND_VS, GROUND_FS(false)); this.boxes = compile(gl, BOX_VS, BOX_FS);
    this.sky = compile(gl, QUAD_VS, SKY_FS); this.compose = compile(gl, QUAD_VS, COMPOSE_FS); this.shadow = compile(gl, SHADOW_VS, SHADOW_FS);
    this.sprites = compile(gl, SPRITE_VS, SPRITE_FS); this.mesh = compile(gl, MESH_VS, MESH_FS);
    this.groundLayers = new LayerArray(gl, 16, 16, 128); this.wallLayers = new LayerArray(gl, 16, 24, 128);
    // A screen quad.
    this.quad = gl.createVertexArray()!; gl.bindVertexArray(this.quad);
    const quad = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const p of [this.sky, this.compose]) { const a = p.a("aPos"); if (a >= 0) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); } }
    this.cube = this.makeCube();
    this.atlas = new SpriteAtlas(gl); this.spriteQuad = this.makeSpriteQuad();
    this.meshVao = gl.createVertexArray()!; gl.bindVertexArray(this.meshVao); this.meshBuffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuffer);
    for (const [name, size, offset] of [["aPos", 3, 0], ["aTex", 3, 3], ["aColor", 4, 6], ["aEdge", 4, 10], ["aLight", 4, 14]] as const) { const a = this.mesh.a(name); if (a < 0) continue; gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, size, gl.FLOAT, false, MESH_FLOATS * 4, offset * 4); }
    this.shadowVao = gl.createVertexArray()!; gl.bindVertexArray(this.shadowVao); this.shadowBuffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuffer);
    for (const [name, size, offset] of [["aPos", 2, 0], ["aTex", 3, 2]] as const) { const a = this.shadow.a(name); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, size, gl.FLOAT, false, SHADOW_FLOATS * 4, offset * 4); }
    gl.bindVertexArray(null);
    this.fbo = gl.createFramebuffer()!; this.sceneColor = gl.createTexture()!; this.sceneDepth = gl.createRenderbuffer()!;
    this.shadowFbo = gl.createFramebuffer()!; this.shadowMask = gl.createTexture()!;
    this.overlay = this.makeTexture(gl.NEAREST); this.light = this.makeTexture(gl.LINEAR); this.haze = this.makeTexture(gl.LINEAR); this.field = this.makeTexture(gl.LINEAR);
    gl.bindVertexArray(null);
  }
  private makeTexture(filter: number) {
    const gl = this.gl, texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    return texture;
  }
  /** A unit box: four sides and a lid (no floor: it's never seen), each with its outward normal and its own face coordinates. */
  private makeCube() {
    const gl = this.gl, verts: number[] = [], index: number[] = [];
    const face = (corners: number[][], normal: number[]) => {
      const base = verts.length / 8, uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
      corners.forEach((c, i) => verts.push(c[0], c[1], c[2], normal[0], normal[1], normal[2], uv[i][0], uv[i][1]));
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    // Sides run corner a → b along the ground (the same order the canvas renderer textures them in), bottom then top.
    const side = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => face([[ax, ay, 0], [bx, by, 0], [bx, by, 1], [ax, ay, 1]].map(([x, y, z]) => [x, y, z]), [nx, ny, 0]);
    side(-0.5, 0.5, 0.5, 0.5, 0, 1); side(0.5, 0.5, 0.5, -0.5, 1, 0); side(0.5, -0.5, -0.5, -0.5, 0, -1); side(-0.5, -0.5, -0.5, 0.5, -1, 0);
    face([[-0.5, -0.5, 1], [0.5, -0.5, 1], [0.5, 0.5, 1], [-0.5, 0.5, 1]], [0, 0, 1]);
    // (A side's face v runs bottom (0) to top (1); its texture runs from the top, so the shader flips it.)
    for (let i = 0; i < verts.length; i += 8) if (verts[i + 5] < 0.5) verts[i + 7] = verts[i + 2];
    const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    const vb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const p = this.boxes;
    for (const [name, size, offset] of [["aCorner", 3, 0], ["aNormal", 3, 3], ["aFace", 2, 6]] as const) { const a = p.a(name); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, size, gl.FLOAT, false, 32, offset * 4); }
    const ib = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(index), gl.STATIC_DRAW);
    const instances = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    const layout: [string, number, number][] = [["iCentre", 2, 0], ["iSize", 2, 2], ["iLift", 1, 4], ["iHeight", 1, 5], ["iLayers", 3, 6], ["iTop", 3, 9], ["iLeft", 3, 12], ["iRight", 3, 15], ["iInk", 1, 18], ["iLight", 4, 19], ["iGlow", 1, 23]];
    for (const [name, size, offset] of layout) { const a = p.a(name); if (a < 0) continue; gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, size, gl.FLOAT, false, BOX_FLOATS * 4, offset * 4); gl.vertexAttribDivisor(a, 1); }
    gl.bindVertexArray(null);
    return { vao, instances, count: index.length };
  }

  /** One quad (two triangles over the unit square), drawn once per sprite. */
  private makeSpriteQuad() {
    const gl = this.gl, p = this.sprites, vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    const vb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const corner = p.a("aCorner"); gl.enableVertexAttribArray(corner); gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    const instances = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    const layout: [string, number, number][] = [["iP01", 4, 0], ["iP3", 2, 4], ["iUv", 4, 6], ["iPage", 1, 10], ["iTint", 4, 11], ["iLight", 4, 15], ["iFoot", 3, 19]];
    for (const [name, size, offset] of layout) { const a = p.a(name); if (a < 0) continue; gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, size, gl.FLOAT, false, SPRITE_FLOATS * 4, offset * 4); gl.vertexAttribDivisor(a, 1); }
    gl.bindVertexArray(null);
    return { vao, instances };
  }

  // ---------- Sprites ----------
  /** Start a frame's sprites (a full atlas starts again here, between frames). */
  clearSprites() { this.spriteCount = 0; if (this.atlas.full) this.atlas.reset(); }
  /**
   * One sprite, in the order sprites are to cover each other: `corners` top left, top right, bottom left (view pixels);
   * `tint` r, g, b, alpha; `light` r, g, b; `clear` how clear of the haze; feet at screen y `footY`, depth `footDepth`.
   * False if the art has no room in the atlas this frame (draw it some other way).
   */
  addSprite(art: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number, x3: number, y3: number, tint: readonly number[], light: readonly number[], clear: number, footY: number, footDepth: number, flat: boolean): boolean {
    const slot = this.atlas.slot(art);
    if (!slot) return false;
    if ((this.spriteCount + 1) * SPRITE_FLOATS > this.spriteData.length) { const grown = new Float32Array(this.spriteData.length * 2); grown.set(this.spriteData); this.spriteData = grown; }
    const o = this.spriteCount++ * SPRITE_FLOATS, b = this.spriteData;
    b[o] = x0; b[o + 1] = y0; b[o + 2] = x1; b[o + 3] = y1; b[o + 4] = x3; b[o + 5] = y3;
    b[o + 6] = slot[0]; b[o + 7] = slot[1]; b[o + 8] = slot[2]; b[o + 9] = slot[3]; b[o + 10] = slot[4];
    b[o + 11] = tint[0]; b[o + 12] = tint[1]; b[o + 13] = tint[2]; b[o + 14] = tint[3];
    b[o + 15] = light[0]; b[o + 16] = light[1]; b[o + 17] = light[2]; b[o + 18] = clear;
    b[o + 19] = footY; b[o + 20] = footDepth; b[o + 21] = flat ? 1 : 0;
    return true;
  }
  get spriteTotal() { return this.spriteCount; }

  // ---------- The world's heights ----------
  /** The ground's corner heights (the canvas renderer's `world.heights`), for standing boxes on the hills. */
  setHeights(heights: Float32Array, w: number, h: number) {
    if (this.heightsOf === heights) return;
    const gl = this.gl;
    if (this.heights) gl.deleteTexture(this.heights);
    this.heights = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.heights);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w + 1, h + 1, 0, gl.RED, gl.FLOAT, heights);
    this.heightsOf = heights; this.world = { w, h };
    this.dropChunks();
  }

  // ---------- The ground ----------
  hasChunk(key: string) { return this.chunks.has(key); }
  /** Lay a chunk of ground in (vertices: GROUND_FLOATS each, four a tile). */
  setChunk(key: string, vertices: Float32Array) {
    const gl = this.gl, old = this.chunks.get(key);
    if (old) { gl.deleteVertexArray(old.vao); old.buffers.forEach(b => gl.deleteBuffer(b)); }
    const tiles = vertices.length / (GROUND_FLOATS * 4), vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    const vb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    // (Fixed locations, shared by both ground programs.)
    for (const [a, size, offset] of [[0, 3, 0], [1, 2, 3], [2, 1, 5], [3, 1, 6], [4, 1, 7], [5, 1, 8], [6, 4, 9]] as const) {
      gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, size, gl.FLOAT, false, GROUND_FLOATS * 4, offset * 4);
    }
    const index = new Uint32Array(tiles * 6);
    for (let t = 0; t < tiles; t++) { const b = t * 4; index.set([b, b + 1, b + 2, b, b + 2, b + 3], t * 6); }
    const ib = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.chunks.set(key, { vao, buffers: [vb, ib], count: tiles * 6, used: this.frame });
  }
  dropChunks() { for (const key of [...this.chunks.keys()]) { const c = this.chunks.get(key)!; this.gl.deleteVertexArray(c.vao); c.buffers.forEach(b => this.gl.deleteBuffer(b)); this.chunks.delete(key); } }

  // ---------- Boxes ----------
  /** Start a frame's boxes (and roofs). */
  clearBoxes() { this.boxCount = 0; this.meshCount[0] = 0; this.meshCount[1] = 0; }
  /** One box (see BOX_FLOATS). */
  addBox(x: number, y: number, w: number, d: number, lift: number, h: number, left: number, right: number, top: number, topColor: readonly number[], leftColor: readonly number[], rightColor: readonly number[], ink: number, light: readonly number[], clear: number, glow: number) {
    if ((this.boxCount + 1) * BOX_FLOATS > this.boxData.length) { const grown = new Float32Array(this.boxData.length * 2); grown.set(this.boxData); this.boxData = grown; }
    const o = this.boxCount++ * BOX_FLOATS, b = this.boxData;
    b[o] = x; b[o + 1] = y; b[o + 2] = w; b[o + 3] = d; b[o + 4] = lift; b[o + 5] = h; b[o + 6] = left; b[o + 7] = right; b[o + 8] = top;
    b[o + 9] = topColor[0]; b[o + 10] = topColor[1]; b[o + 11] = topColor[2]; b[o + 12] = leftColor[0]; b[o + 13] = leftColor[1]; b[o + 14] = leftColor[2]; b[o + 15] = rightColor[0]; b[o + 16] = rightColor[1]; b[o + 17] = rightColor[2]; b[o + 18] = ink;
    b[o + 19] = light[0]; b[o + 20] = light[1]; b[o + 21] = light[2]; b[o + 22] = clear; b[o + 23] = glow;
  }
  /**
   * One triangle of a roof (see MESH_FLOATS: three vertices of it in `v`, from `at`). Opaque ones are drawn with the
   * walls; see-through ones (a roof fading as you walk in) over them afterwards, in the order they come.
   */
  addTriangle(v: readonly number[], at = 0, faded = false) {
    const list = faded ? 1 : 0, n = MESH_FLOATS * 3;
    if ((this.meshCount[list] + 1) * n > this.meshData[list].length) { const grown = new Float32Array(this.meshData[list].length * 2); grown.set(this.meshData[list]); this.meshData[list] = grown; }
    const o = this.meshCount[list]++ * n, b = this.meshData[list];
    for (let i = 0; i < n; i++) b[o + i] = v[at + i];
  }
  get boxTotal() { return this.boxCount; }

  // ---------- The sun's shadows ----------
  /** Start a frame's shadows. */
  clearShadows() { this.shadowCount = 0; }
  private shadowVertex(x: number, y: number, u: number, v: number, page: number) {
    if ((this.shadowCount + 1) * SHADOW_FLOATS > this.shadowData.length) { const grown = new Float32Array(this.shadowData.length * 2); grown.set(this.shadowData); this.shadowData = grown; }
    const o = this.shadowCount++ * SHADOW_FLOATS, b = this.shadowData;
    b[o] = x; b[o + 1] = y; b[o + 2] = u; b[o + 3] = v; b[o + 4] = page;
  }
  /** A shadow's shape on screen (view px), convex, going round. */
  addShadowShape(points: readonly (readonly [number, number])[]) {
    for (let i = 1; i + 1 < points.length; i++) for (const p of [points[0], points[i], points[i + 1]]) this.shadowVertex(p[0], p[1], 0, 0, -1);
  }
  /** A sprite's silhouette as a shadow: its art laid on the parallelogram with corners top left, top right, bottom left (view px). */
  addShadowSprite(art: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number, x3: number, y3: number) {
    const slot = this.atlas.slot(art);
    if (!slot) return;
    const [u0, v0, u1, v1, page] = slot, x2 = x1 + x3 - x0, y2 = y1 + y3 - y0;
    for (const [x, y, u, v] of [[x0, y0, u0, v0], [x1, y1, u1, v0], [x2, y2, u1, v1], [x0, y0, u0, v0], [x2, y2, u1, v1], [x3, y3, u0, v1]]) this.shadowVertex(x, y, u, v, page);
  }

  // ---------- A frame ----------
  private target(texture: WebGLTexture, w: number, h: number, filter: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  private resize(w: number, h: number) {
    if (this.size.w === w && this.size.h === h) return;
    const gl = this.gl; this.size = { w, h };
    this.target(this.sceneColor, w, h, gl.NEAREST);
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.sceneDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneColor, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.sceneDepth);
    // The shadow mask, at half the resolution (shadows are soft-edged enough not to show it).
    this.target(this.shadowMask, Math.max(1, w >> 1), Math.max(1, h >> 1), gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowMask, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  private setCamera(p: Program, camera: GLCamera, view: { width: number; height: number }) {
    const gl = this.gl, ls = Math.sqrt(Math.max(0, 1 - camera.pitch * camera.pitch)) / Math.sqrt(0.75);
    gl.uniform2f(p.u("uCam"), camera.x, camera.y); gl.uniform1f(p.u("uZoom"), camera.zoom); gl.uniform1f(p.u("uCos"), Math.cos(camera.angle)); gl.uniform1f(p.u("uSin"), Math.sin(camera.angle));
    gl.uniform1f(p.u("uPitch"), camera.pitch); gl.uniform1f(p.u("uLift"), ls); gl.uniform1f(p.u("uBase"), camera.base); gl.uniform2f(p.u("uView"), view.width, view.height);
  }
  private setHaze(p: Program, lighting: Lighting) {
    const gl = this.gl;
    gl.uniform1i(p.u("uHazy"), lighting.hazy ? 1 : 0); gl.uniform3f(p.u("uHazeColor"), lighting.haze[0], lighting.haze[1], lighting.haze[2]);
  }
  /**
   * Draw the frame's world, lit, into the GPU's picture: the sun's shadows into their mask; then the sky (or the dark
   * underground) in the sky's light; the ground chunks asked for, in the light field's light, shadowed and hazed; the
   * boxes and roofs, each in its own light; and the sprites, in order, behind whatever wall stands in front of them.
   */
  drawWorld(camera: GLCamera, view: { width: number; height: number }, chunks: readonly string[], time: number, underground: boolean, blend: boolean, lighting: Lighting) {
    const gl = this.gl, w = gl.canvas.width, h = gl.canvas.height;
    this.frame++; this.resize(w, h);
    // The light field's map (only when it was rebuilt).
    if (lighting.version !== this.fieldVersion) {
      this.fieldVersion = lighting.version;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.field); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lighting.field);
    }
    // The sun's shadows.
    const shadowed = !!lighting.shadows && this.shadowCount > 0;
    if (shadowed) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo); gl.viewport(0, 0, Math.max(1, w >> 1), Math.max(1, h >> 1));
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.shadow.program); gl.uniform2f(this.shadow.u("uView"), view.width, view.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas.texture); gl.uniform1i(this.shadow.u("uAtlas"), 0);
      gl.bindVertexArray(this.shadowVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.shadowData.subarray(0, this.shadowCount * SHADOW_FLOATS), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, this.shadowCount);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    // The sky, top to bottom.
    gl.useProgram(this.sky.program); gl.bindVertexArray(this.quad);
    if (underground) { gl.uniform3f(this.sky.u("uTop"), 0.055, 0.055, 0.063); gl.uniform3f(this.sky.u("uBottom"), 0.055, 0.055, 0.063); }
    else { gl.uniform3f(this.sky.u("uTop"), 0xb9 / 255, 0xc7 / 255, 0xd6 / 255); gl.uniform3f(this.sky.u("uBottom"), 0xdc / 255, 0xdf / 255, 0xda / 255); }
    gl.uniform3f(this.sky.u("uLight"), Math.min(1, lighting.sky[0]), Math.min(1, lighting.sky[1]), Math.min(1, lighting.sky[2]));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
    // The ground.
    const ground = blend ? this.ground : this.groundPlain;
    gl.useProgram(ground.program); this.setCamera(ground, camera, view); this.setHaze(ground, lighting);
    gl.uniform1f(ground.u("uTime"), time); gl.uniform1f(ground.u("uInk"), Math.max(0.8, camera.zoom) * (w / view.width));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.groundLayers.texture); gl.uniform1i(ground.u("uGround"), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.field); gl.uniform1i(ground.u("uField"), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.shadowMask); gl.uniform1i(ground.u("uShadow"), 2);
    gl.uniform2f(ground.u("uFieldOrigin"), lighting.origin[0], lighting.origin[1]); gl.uniform2f(ground.u("uFieldSize"), lighting.size[0], lighting.size[1]);
    gl.uniform1i(ground.u("uShadowOn"), shadowed ? 1 : 0);
    if (lighting.shadows) gl.uniform3f(ground.u("uShare"), lighting.shadows[0], lighting.shadows[1], lighting.shadows[2]);
    gl.uniform2f(ground.u("uCanvas"), w, h);
    const clouds = lighting.clouds.slice(0, 8), flat = new Float32Array(32);
    clouds.forEach((c, i) => flat.set(c, i * 4));
    gl.uniform4fv(ground.u("uClouds"), flat); gl.uniform1i(ground.u("uCloudCount"), clouds.length); gl.uniform1f(ground.u("uCloudK"), lighting.cloudK);
    gl.uniform2f(ground.u("uHere"), lighting.here[0], lighting.here[1]); gl.uniform2f(ground.u("uHazeRange"), lighting.start, lighting.end);
    for (const key of chunks) { const c = this.chunks.get(key); if (!c) continue; c.used = this.frame; gl.bindVertexArray(c.vao); gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_INT, 0); }
    // The boxes.
    if (this.boxCount && this.heights) {
      const p = this.boxes;
      gl.useProgram(p.program); this.setCamera(p, camera, view); this.setHaze(p, lighting);
      gl.uniform1f(p.u("uWindowGlow"), lighting.windowGlow);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.wallLayers.texture); gl.uniform1i(p.u("uWalls"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.heights); gl.uniform1i(p.u("uHeights"), 1);
      gl.uniform2f(p.u("uWorld"), this.world.w, this.world.h);
      gl.bindVertexArray(this.cube.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.cube.instances);
      gl.bufferData(gl.ARRAY_BUFFER, this.boxData.subarray(0, this.boxCount * BOX_FLOATS), gl.STREAM_DRAW);
      gl.drawElementsInstanced(gl.TRIANGLES, this.cube.count, gl.UNSIGNED_SHORT, 0, this.boxCount);
    }
    // The roofs: whole ones, then the ones fading, laid over what's behind them.
    if ((this.meshCount[0] || this.meshCount[1]) && this.heights) {
      const p = this.mesh;
      gl.useProgram(p.program); this.setCamera(p, camera, view); this.setHaze(p, lighting);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.wallLayers.texture); gl.uniform1i(p.u("uWalls"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.heights); gl.uniform1i(p.u("uHeights"), 1);
      gl.uniform2f(p.u("uWorld"), this.world.w, this.world.h); gl.uniform1f(p.u("uLine"), 1.2 * w / view.width);
      gl.bindVertexArray(this.meshVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuffer);
      for (const list of [0, 1]) {
        if (!this.meshCount[list]) continue;
        if (list === 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
        gl.bufferData(gl.ARRAY_BUFFER, this.meshData[list].subarray(0, this.meshCount[list] * MESH_FLOATS * 3), gl.STREAM_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, this.meshCount[list] * 3);
      }
      gl.disable(gl.BLEND); gl.depthMask(true);
    }
    // The sprites, in order, behind the walls in front of them.
    if (this.spriteCount) {
      const p = this.sprites, cosE = Math.sqrt(Math.max(0, 1 - camera.pitch * camera.pitch)), ls = cosE / Math.sqrt(0.75);
      gl.useProgram(p.program);
      gl.uniform2f(p.u("uView"), view.width, view.height);
      gl.uniform1f(p.u("uKUp"), camera.pitch / 0.8660254 / Math.max(1e-3, ls * camera.zoom)); gl.uniform1f(p.u("uKFlat"), cosE / Math.max(1e-3, camera.pitch * camera.zoom));
      gl.uniform3f(p.u("uHaze"), lighting.haze[0], lighting.haze[1], lighting.haze[2]); gl.uniform1i(p.u("uHazy"), lighting.hazy ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas.texture); gl.uniform1i(p.u("uAtlas"), 0);
      gl.depthMask(false);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.spriteQuad.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteQuad.instances);
      gl.bufferData(gl.ARRAY_BUFFER, this.spriteData.subarray(0, this.spriteCount * SPRITE_FLOATS), gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.spriteCount);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
    // Chunks not seen for a while are let go.
    if (this.frame % 120 === 0) for (const [key, c] of this.chunks) if (this.frame - c.used > 600) { gl.deleteVertexArray(c.vao); c.buffers.forEach(b => gl.deleteBuffer(b)); this.chunks.delete(key); }
  }
  /**
   * Put the frame on screen: the canvas renderer's layer over the GPU's finished picture, lit by its light buffer (each
   * canvas thing's own light) and hazed by its haze buffer (how clear of the haze each one stands).
   */
  present(overlay: HTMLCanvasElement, light: HTMLCanvasElement, haze: HTMLCanvasElement | null, hazeColor: readonly number[]) {
    const gl = this.gl, w = gl.canvas.width, h = gl.canvas.height;
    const upload = (texture: WebGLTexture, source: HTMLCanvasElement, premultiply: boolean) => {
      gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    };
    gl.activeTexture(gl.TEXTURE1); upload(this.overlay, overlay, true);
    gl.activeTexture(gl.TEXTURE2); upload(this.light, light, false);
    if (haze) { gl.activeTexture(gl.TEXTURE3); upload(this.haze, haze, false); }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    const p = this.compose;
    gl.useProgram(p.program); gl.bindVertexArray(this.quad);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneColor); gl.uniform1i(p.u("uScene"), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.overlay); gl.uniform1i(p.u("uOverlay"), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.light); gl.uniform1i(p.u("uLight"), 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.haze); gl.uniform1i(p.u("uHaze"), 3);
    gl.uniform1i(p.u("uHazy"), haze ? 1 : 0); gl.uniform3f(p.u("uHazeColor"), hazeColor[0], hazeColor[1], hazeColor[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}
