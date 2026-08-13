import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "lens-flare-studio";
})();

const REFERENCE_PRESET = {
  intensity: 1.9,
  rays: 154,
  ghosts: 5,
  chroma: 2.25,
  halo: 0.86,
  streak: 2.35,
  gap: 0.82,
  breaks: 0.95,
  bloom: 2.1,
  coreSize: 1.08,
  drift: 0.08,
  ghostSpread: 1.0,
  chaos: 1.55,
  speed: 1.22,
  hue: 288,
  saturation: 1.0,
  microCount: 132,
  microDensity: 1.18,
  microLength: 1.06,
  microPower: 1.0,
  longCount: 40,
  longDensity: 1.0,
  longLength: 1.25,
  longWidth: 1.0,
  longPower: 1.0,
  longBreaks: 0.8,
};

const controlSchema = [
  { id: "intensity", label: "Power", group: "Global", min: 0.2, max: 2.6, step: 0.01, default: REFERENCE_PRESET.intensity },
  { id: "rays", label: "Rays", group: "Global", min: 12, max: 180, step: 1, default: REFERENCE_PRESET.rays },
  { id: "ghosts", label: "Ghosts", group: "Global", min: 1, max: 18, step: 1, default: REFERENCE_PRESET.ghosts },
  { id: "halo", label: "Halo", group: "Global", min: 0, max: 2.6, step: 0.01, default: REFERENCE_PRESET.halo },
  { id: "bloom", label: "Bloom", group: "Global", min: 0, max: 2.8, step: 0.01, default: REFERENCE_PRESET.bloom },
  { id: "coreSize", label: "CoreSz", group: "Global", min: 0.4, max: 2.0, step: 0.01, default: REFERENCE_PRESET.coreSize },
  { id: "drift", label: "Drift", group: "Global", min: 0, max: 1.6, step: 0.01, default: REFERENCE_PRESET.drift },
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 2.0, step: 0.01, default: REFERENCE_PRESET.speed },
  { id: "chroma", label: "Chroma", group: "Color", min: 0, max: 2.8, step: 0.01, default: REFERENCE_PRESET.chroma },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: REFERENCE_PRESET.hue },
  { id: "saturation", label: "Sat", group: "Color", min: 0.2, max: 1.6, step: 0.01, default: REFERENCE_PRESET.saturation },
  { id: "ghostSpread", label: "GhostSp", group: "Color", min: 0.2, max: 2.0, step: 0.01, default: REFERENCE_PRESET.ghostSpread },
  { id: "chaos", label: "Chaos", group: "Color", min: 0, max: 2.6, step: 0.01, default: REFERENCE_PRESET.chaos },
  { id: "streak", label: "Streak", group: "Main Rays", min: 0, max: 2.6, step: 0.01, default: REFERENCE_PRESET.streak },
  { id: "gap", label: "Gap", group: "Main Rays", min: 0, max: 1.5, step: 0.01, default: REFERENCE_PRESET.gap },
  { id: "breaks", label: "Breaks", group: "Main Rays", min: 0, max: 2.0, step: 0.01, default: REFERENCE_PRESET.breaks },
  { id: "microCount", label: "MicroCt", group: "Micro Lines", min: 20, max: 220, step: 1, default: REFERENCE_PRESET.microCount },
  { id: "microDensity", label: "MicroDns", group: "Micro Lines", min: 0.1, max: 2.0, step: 0.01, default: REFERENCE_PRESET.microDensity },
  { id: "microLength", label: "MicroLen", group: "Micro Lines", min: 0.3, max: 2.2, step: 0.01, default: REFERENCE_PRESET.microLength },
  { id: "microPower", label: "MicroPwr", group: "Micro Lines", min: 0.1, max: 2.0, step: 0.01, default: REFERENCE_PRESET.microPower },
  { id: "longCount", label: "LongCt", group: "Long Streaks", min: 8, max: 96, step: 1, default: REFERENCE_PRESET.longCount },
  { id: "longDensity", label: "LongDns", group: "Long Streaks", min: 0.2, max: 2.0, step: 0.01, default: REFERENCE_PRESET.longDensity },
  { id: "longLength", label: "LongLen", group: "Long Streaks", min: 0.4, max: 2.8, step: 0.01, default: REFERENCE_PRESET.longLength },
  { id: "longWidth", label: "LongWid", group: "Long Streaks", min: 0.4, max: 2.2, step: 0.01, default: REFERENCE_PRESET.longWidth },
  { id: "longPower", label: "LongPwr", group: "Long Streaks", min: 0.1, max: 2.4, step: 0.01, default: REFERENCE_PRESET.longPower },
  { id: "longBreaks", label: "LongBrk", group: "Long Streaks", min: 0, max: 2.0, step: 0.01, default: REFERENCE_PRESET.longBreaks },
];
const params = {};
controlSchema.forEach((cfg) => {
  params[cfg.id] = cfg.default;
});

const app = document.getElementById("app");

let paused = false;
let elapsed = 0;
let lastTs = performance.now() * 0.001;
let seed = 134775813;
let pendingPreview = true;
let previewCooldown = 0;
const history = {
  undoStack: [],
  redoStack: [],
  limit: 140,
  suppress: false,
};

function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
}

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const legacyCanvas = document.getElementById("fx");
if (legacyCanvas) legacyCanvas.remove();
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  u_time: { value: 0 },
  u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  u_intensity: { value: params.intensity },
  u_rays: { value: params.rays },
  u_ghosts: { value: params.ghosts },
  u_chroma: { value: params.chroma },
  u_halo: { value: params.halo },
  u_streak: { value: params.streak },
  u_gap: { value: params.gap },
  u_breaks: { value: params.breaks },
  u_bloom: { value: params.bloom },
  u_coreSize: { value: params.coreSize },
  u_drift: { value: params.drift },
  u_ghostSpread: { value: params.ghostSpread },
  u_chaos: { value: params.chaos },
  u_speed: { value: params.speed },
  u_hue: { value: params.hue },
  u_saturation: { value: params.saturation },
  u_microCount: { value: params.microCount },
  u_microDensity: { value: params.microDensity },
  u_microLength: { value: params.microLength },
  u_microPower: { value: params.microPower },
  u_longCount: { value: params.longCount },
  u_longDensity: { value: params.longDensity },
  u_longLength: { value: params.longLength },
  u_longWidth: { value: params.longWidth },
  u_longPower: { value: params.longPower },
  u_longBreaks: { value: params.longBreaks },
  u_seed: { value: seed },
};

const VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FS = `
precision highp float;
varying vec2 vUv;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_intensity;
uniform float u_rays;
uniform float u_ghosts;
uniform float u_chroma;
uniform float u_halo;
uniform float u_streak;
uniform float u_gap;
uniform float u_breaks;
uniform float u_bloom;
uniform float u_coreSize;
uniform float u_drift;
uniform float u_ghostSpread;
uniform float u_chaos;
uniform float u_speed;
uniform float u_hue;
uniform float u_saturation;
uniform float u_microCount;
uniform float u_microDensity;
uniform float u_microLength;
uniform float u_microPower;
uniform float u_longCount;
uniform float u_longDensity;
uniform float u_longLength;
uniform float u_longWidth;
uniform float u_longPower;
uniform float u_longBreaks;
uniform float u_seed;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float sectorRandom(float angle, float rays, float seedShift) {
  float idx = floor((angle + 3.14159265) / 6.2831853 * rays);
  return hash11(idx + seedShift);
}

float rayShape(float angle, float rays, float sharp, float wobble) {
  float base = cos(angle * rays + wobble);
  return pow(max(base, 0.0), sharp);
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= u_resolution.x / max(u_resolution.y, 1.0);
  vec2 center = vec2(
    sin(u_time * 0.47 + u_seed * 0.00037) * 0.24 * u_drift,
    cos(u_time * 0.61 + u_seed * 0.00053) * 0.18 * u_drift
  );

  vec2 d = uv - center;
  float r = length(d) + 1e-6;
  float a = atan(d.y, d.x);
  float t = u_time * (0.5 + u_speed * 1.35);
  float sat = clamp(u_saturation, 0.2, 1.6);

  float n = noise(vec2(a * 2.2 + u_seed * 0.0001, t * 0.2 + r * 5.5));

  float core = exp(-r * (22.0 - u_bloom * 7.0) / max(u_coreSize, 0.1)) * (1.4 + u_intensity * 0.9);
  float halo = exp(-r * (5.7 - u_halo * 1.6) / max(u_coreSize, 0.1)) * (0.26 + u_halo * 0.36);

  float raysMain = rayShape(a, max(12.0, u_rays), mix(10.0, 2.5, u_streak / 2.6), n * u_chaos * 2.2 + t * 0.3);
  float raysFine = rayShape(a, max(18.0, u_rays * 1.8), 14.0, n * 3.0 + t * 0.45);
  float gapAmt = clamp(u_gap / 1.5, 0.0, 1.0);
  float gapLoMain = mix(0.02, 0.45, gapAmt);
  float gapLoFine = mix(0.07, 0.52, gapAmt);
  float sectorMaskMain = smoothstep(gapLoMain, 0.98, sectorRandom(a, max(12.0, u_rays), u_seed * 0.00001 + 11.7));
  float sectorMaskFine = smoothstep(gapLoFine, 0.98, sectorRandom(a + 0.09, max(18.0, u_rays * 1.8), u_seed * 0.00001 + 27.4));
  float irregularAmp = 0.62 + 0.75 * sectorRandom(a + 0.2, max(10.0, u_rays * 0.7), u_seed * 0.00001 + 39.8);
  float segmentNoise = noise(vec2(a * 5.1 + u_seed * 0.00009, r * 28.0 - t * 1.8));
  float breakAmt = clamp(u_breaks / 2.0, 0.0, 1.0);
  float brokenMask = smoothstep(mix(0.06, 0.42, breakAmt), mix(0.72, 0.98, breakAmt), segmentNoise);
  float brokenSoft = mix(1.0, brokenMask, breakAmt);
  float rayEnergy = (raysMain * sectorMaskMain * 0.95 + raysFine * sectorMaskFine * 0.52)
    * irregularAmp * brokenSoft
    * exp(-r * (1.2 + 0.6 / max(u_streak, 0.05)));

  vec3 col = vec3(0.0);

  vec3 hot = hsv2rgb(vec3(fract(u_hue / 360.0 + 0.05), clamp(0.45 * sat, 0.0, 1.0), 1.0));
  vec3 cold = hsv2rgb(vec3(fract(u_hue / 360.0 - 0.12), clamp(0.78 * sat, 0.0, 1.0), 1.0));
  vec3 mag = hsv2rgb(vec3(fract(u_hue / 360.0 + 0.12), clamp(0.84 * sat, 0.0, 1.0), 1.0));

  col += hot * core;
  col += cold * halo;
  col += mix(cold, mag, 0.5 + 0.5 * sin(a * 2.0 + t * 0.2)) * rayEnergy * (0.8 + 0.8 * u_intensity);

  float microCount = clamp(u_microCount, 1.0, 220.0);
  float microDensity = clamp(u_microDensity, 0.1, 2.0);
  float microLength = clamp(u_microLength, 0.3, 2.2);
  float microPower = clamp(u_microPower, 0.1, 2.0);
  for (int i = 0; i < 220; i++) {
    float fi = float(i);
    if (fi >= microCount) break;

    float rr = hash11(fi * 7.13 + u_seed * 0.00003);
    float enabled = step(rr, clamp(0.36 + microDensity * 0.28, 0.0, 1.0));
    if (enabled < 0.5) continue;

    float ang = 6.2831853 * (fi / microCount + hash11(fi * 13.7) * 0.06);
    vec2 dir = vec2(cos(ang), sin(ang));
    float along = dot(d, dir);
    float side = dot(d, vec2(-dir.y, dir.x));

    float sideBand = exp(-abs(side) * (220.0 - microDensity * 80.0));
    float basePos = pow(hash11(fi * 17.9), mix(1.8, 0.75, microDensity / 2.0)) * 1.15;
    float lenSpan = (0.05 + 0.28 * hash11(fi * 23.4)) * microLength;
    float head = exp(-abs(along - basePos) * (42.0 / max(lenSpan, 0.02)));
    float tail = exp(-max(along, 0.0) * (3.8 / max(microLength, 0.3)));
    float dash = smoothstep(0.25, 0.95, noise(vec2(fi * 0.37 + u_seed * 0.00002, along * 68.0 - t * 0.35)));

    float micro = sideBand * head * tail * dash;
    float mHue = (hash11(fi * 29.1) - 0.5) * 0.16 * u_chroma;
    vec3 mCol = hsv2rgb(vec3(fract(u_hue / 360.0 + mHue), clamp(0.78 * sat, 0.0, 1.0), 1.0));
    col += mCol * micro * (0.22 + 0.9 * microPower);
  }

  float longCount = clamp(u_longCount, 1.0, 96.0);
  float longDensity = clamp(u_longDensity, 0.2, 2.0);
  float longLength = clamp(u_longLength, 0.4, 2.8);
  float longWidth = clamp(u_longWidth, 0.4, 2.2);
  float longPower = clamp(u_longPower, 0.1, 2.4);
  float longBreaks = clamp(u_longBreaks, 0.0, 2.0);
  for (int i = 0; i < 96; i++) {
    float fi = float(i);
    if (fi >= longCount) break;

    float enabledRnd = hash11(fi * 31.13 + u_seed * 0.000017);
    float enabled = step(enabledRnd, clamp(0.32 + longDensity * 0.36, 0.0, 1.0));
    if (enabled < 0.5) continue;

    float rnd = hash11(fi * 13.17 + u_seed * 0.00001);
    float ang = rnd * 6.2831853;
    vec2 dir = vec2(cos(ang), sin(ang));
    float along = dot(d, dir);
    float side = dot(d, vec2(-dir.y, dir.x));
    float lane = 0.08 + hash11(fi * 2.73) * 0.92;
    float speed = (0.2 + hash11(fi * 5.1) * (0.38 + u_speed * 0.58)) * (0.85 + 0.45 * longDensity);
    float head = fract(lane + t * speed);
    float pos = r;

    float band = exp(-abs(side) * ((120.0 - 42.0 * u_halo) / longWidth));
    float headShape = exp(-abs(pos - head * (1.45 + 0.35 * longLength)) * ((16.0 - u_streak * 3.0) / longLength));
    float tail = smoothstep(0.0, 0.5, along + 0.18) * exp(-max(along, 0.0) * ((1.8 - u_streak * 0.3) / longLength));
    float dashNoise = noise(vec2(fi * 0.61 + u_seed * 0.00006, along * 32.0 - t * 0.28));
    float dashBroken = smoothstep(0.22, 0.94, dashNoise);
    float dash = mix(1.0, dashBroken, smoothstep(0.0, 0.85, longBreaks));
    float shard = band * headShape * tail;
    shard *= dash;

    float hueOff = (hash11(fi * 7.3) - 0.5) * 0.24 * u_chroma;
    vec3 shardCol = hsv2rgb(vec3(fract(u_hue / 360.0 + hueOff), clamp(0.92 * sat, 0.0, 1.0), 1.0));
    col += shardCol * shard * (0.2 + 0.85 * u_bloom) * longPower;
  }

  vec2 axis = -center;
  float axisLen = max(length(axis), 1e-3);
  vec2 axisDir = axis / axisLen;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= u_ghosts) break;
    float gPos = (0.55 + fi * 0.45) * u_ghostSpread;
    vec2 gp = center + axisDir * gPos * (1.0 + 0.08 * sin(t * 1.6 + fi));
    float gr = 0.06 + 0.08 * hash11(fi * 8.91);
    float gd = length(uv - gp);
    float ghost = exp(-gd / gr) * (0.3 + 0.6 * u_halo);
    float ring = exp(-abs(gd - gr * 0.7) * (40.0 - u_halo * 10.0)) * 0.35;
    float gh = (hash11(fi * 4.73) - 0.5) * 0.18 * u_chroma;
    vec3 gcol = hsv2rgb(vec3(fract(u_hue / 360.0 + gh), clamp(0.8 * sat, 0.0, 1.0), 1.0));
    col += gcol * (ghost + ring);
  }

  col.r += rayEnergy * (0.2 + 0.4 * u_chroma) * exp(-r * 1.4);
  col.b += rayEnergy * (0.24 + 0.35 * u_chroma) * exp(-r * 1.1);
  col += hsv2rgb(vec3(fract(u_hue / 360.0 + 0.08), clamp(0.7 * sat, 0.0, 1.0), 1.0)) * exp(-r * 2.4) * (0.18 + u_bloom * 0.15);

  float vignette = smoothstep(2.2, 0.45, length(uv));
  col *= vignette;

  col *= (0.6 + u_intensity * 0.7);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.9));

  gl_FragColor = vec4(col, 1.0);
}
`;

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: VS,
  fragmentShader: FS,
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

function applyParamsToUniforms() {
  uniforms.u_intensity.value = params.intensity;
  uniforms.u_rays.value = params.rays;
  uniforms.u_ghosts.value = params.ghosts;
  uniforms.u_chroma.value = params.chroma;
  uniforms.u_halo.value = params.halo;
  uniforms.u_streak.value = params.streak;
  uniforms.u_gap.value = params.gap;
  uniforms.u_breaks.value = params.breaks;
  uniforms.u_bloom.value = params.bloom;
  uniforms.u_coreSize.value = params.coreSize;
  uniforms.u_drift.value = params.drift;
  uniforms.u_ghostSpread.value = params.ghostSpread;
  uniforms.u_chaos.value = params.chaos;
  uniforms.u_speed.value = params.speed;
  uniforms.u_hue.value = params.hue;
  uniforms.u_saturation.value = params.saturation;
  uniforms.u_microCount.value = params.microCount;
  uniforms.u_microDensity.value = params.microDensity;
  uniforms.u_microLength.value = params.microLength;
  uniforms.u_microPower.value = params.microPower;
  uniforms.u_longCount.value = params.longCount;
  uniforms.u_longDensity.value = params.longDensity;
  uniforms.u_longLength.value = params.longLength;
  uniforms.u_longWidth.value = params.longWidth;
  uniforms.u_longPower.value = params.longPower;
  uniforms.u_longBreaks.value = params.longBreaks;
}

function snapshotState() {
  return JSON.stringify({
    params: { ...params },
    seed,
    paused,
  });
}

function pushHistorySnapshot(explicitSnapshot) {
  if (history.suppress) return;
  const snapshot = explicitSnapshot !== undefined ? explicitSnapshot : snapshotState();
  if (history.undoStack[history.undoStack.length - 1] === snapshot) return;
  history.undoStack.push(snapshot);
  if (history.undoStack.length > history.limit) history.undoStack.shift();
  history.redoStack.length = 0;
}

function applyParamsFromBridge(nextParams, recordHistory) {
  if (recordHistory) pushHistorySnapshot();
  Object.keys(nextParams).forEach((id) => {
    if (params[id] === undefined) return;
    const n = Number(nextParams[id]);
    if (Number.isFinite(n)) params[id] = n;
  });
  applyParamsToUniforms();
  pendingPreview = true;
}

function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") applyParamsFromBridge(state.params, false);
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) {
      seed = Math.max(1, Math.floor(state.seed));
      uniforms.u_seed.value = seed;
    }
    if (typeof state.paused === "boolean") paused = state.paused;
    pendingPreview = true;
    syncExtras();
    bridge.notifyValuesChanged();
  } catch {}
  finally {
    history.suppress = false;
  }
}

function undoHistory() {
  if (history.undoStack.length === 0) return;
  const current = snapshotState();
  const previous = history.undoStack.pop();
  history.redoStack.push(current);
  applySnapshot(previous);
}

function redoHistory() {
  if (history.redoStack.length === 0) return;
  const current = snapshotState();
  const next = history.redoStack.pop();
  history.undoStack.push(current);
  applySnapshot(next);
}

function randomizeAllControls() {
  pushHistorySnapshot();
  controlSchema.forEach((cfg) => {
    const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
    const quantized = Math.round(raw / cfg.step) * cfg.step;
    params[cfg.id] = Number(quantized.toFixed(6));
  });
  applyParamsToUniforms();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  uniforms.u_seed.value = seed;
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}

function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  uniforms.u_seed.value = seed;
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}

function togglePause() {
  pushHistorySnapshot();
  paused = !paused;
  syncExtras();
  bridge.notifyValuesChanged();
}

function renderFrame() {
  uniforms.u_time.value = elapsed;
  renderer.render(scene, camera);
}

function sendPreview() {
  renderFrame();
  const image = renderer.domElement.toDataURL("image/jpeg", 0.78);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

history.suppress = true;
const bridge = window.ShaderOpsControls.init({
  projectId: PROJECT_ID,
  schema: controlSchema,
  params,
  extras: { seed, paused },
  onParams: (ids, nextParams, commit, prevValues) => {
    if (commit && !history.suppress) {
      const priorSnapshot = JSON.stringify({ params: prevValues || params, seed, paused });
      if (history.undoStack[history.undoStack.length - 1] !== priorSnapshot) {
        history.undoStack.push(priorSnapshot);
        if (history.undoStack.length > history.limit) history.undoStack.shift();
        history.redoStack.length = 0;
      }
    }
    applyParamsFromBridge(nextParams, false);
  },
  onExtras: (nextExtras) => {
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed)) {
      pushHistorySnapshot();
      seed = Math.max(1, Math.floor(nextExtras.seed));
      uniforms.u_seed.value = seed;
      pendingPreview = true;
    }
    if (typeof nextExtras.paused === "boolean" && nextExtras.paused !== paused) {
      pushHistorySnapshot();
      paused = nextExtras.paused;
    }
  },
  actions: {
    randomizeAll: randomizeAllControls,
    rerollSeed,
    togglePause,
    undo: undoHistory,
    redo: redoHistory,
  },
});
if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) {
  seed = Math.max(1, Math.floor(bridge.extras.seed));
  uniforms.u_seed.value = seed;
}
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
history.suppress = false;

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
  pendingPreview = true;
});

window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "z") return;
  event.preventDefault();
  if (event.shiftKey) redoHistory();
  else undoHistory();
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "shaderops/request-preview") sendPreview();
});

window.addEventListener("beforeunload", () => {
  sendPreview();
});

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() * 0.001;
  const dt = Math.min(0.08, now - lastTs);
  lastTs = now;
  if (!paused) {
    elapsed += dt * params.speed;
  }
  renderFrame();

  previewCooldown += dt;
  if (pendingPreview && previewCooldown > 0.45) {
    pendingPreview = false;
    previewCooldown = 0;
    sendPreview();
  }
}

applyParamsToUniforms();
renderFrame();
sendPreview();
animate();
