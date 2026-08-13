import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = new URLSearchParams(location.search).get("project") || "volumetric-smoke";
const LS_KEY = `shaderops:settings:${PROJECT_ID}`;

// ─── Control schema ────────────────────────────────────────────────────────
const controlSchema = [
  {
    id: "mode", label: "Mode", group: "Preset", type: "select",
    default: 2,
    options: [
      { value: 0, label: "Fog" },
      { value: 1, label: "Mist" },
      { value: 2, label: "Smoke" },
      { value: 3, label: "Steam" },
    ],
  },
  {
    id: "bg", label: "Background", group: "Preset", type: "select",
    default: 1,
    options: [
      { value: 0, label: "Checker" },
      { value: 1, label: "Dark" },
      { value: 2, label: "Light" },
      { value: 3, label: "Black" },
    ],
  },
  { id: "speed",      label: "Speed",        group: "Global",    min: 0,    max: 2,   step: 0.01, default: 0.55 },
  { id: "scale",      label: "Scale",        group: "Structure", min: 0.2,  max: 4,   step: 0.01, default: 1.2 },
  { id: "detail",     label: "Detail",       group: "Structure", min: 0,    max: 1,   step: 0.01, default: 0.5 },
  { id: "turbulence", label: "Turbulence",   group: "Structure", min: 0,    max: 1,   step: 0.01, default: 0.4 },
  { id: "rise",       label: "Rise",         group: "Flow",      min: -1,   max: 1,   step: 0.01, default: 0 },
  { id: "wind",       label: "Wind",         group: "Flow",      min: -1,   max: 1,   step: 0.01, default: 0 },
  { id: "density",    label: "Density",      group: "Density",   min: 0,    max: 1,   step: 0.01, default: 0.72 },
  { id: "threshold",  label: "Threshold",    group: "Density",   min: -0.4, max: 0.4, step: 0.01, default: 0 },
  { id: "softness",   label: "Edge Softness",group: "Density",   min: 0,    max: 0.35,step: 0.005, default: 0.08 },
  { id: "light",      label: "Light",        group: "Lighting",  min: 0,    max: 1,   step: 0.01, default: 0.62 },
  { id: "lightAngle", label: "Light Angle",  group: "Lighting",  min: 0,    max: 360, step: 1,    default: 215 },
  { id: "warmth",     label: "Warmth",       group: "Color",     min: -1,   max: 1,   step: 0.01, default: 0 },
  { id: "seed",       label: "Seed",         group: "Global",    min: 0,    max: 99,  step: 0.1,  default: 0 },
];

// ─── Default params ────────────────────────────────────────────────────────
const params = {};
controlSchema.forEach(c => { params[c.id] = c.default; });

// Restore from localStorage
try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  Object.keys(saved).forEach(k => { if (k in params) params[k] = saved[k]; });
} catch (_) {}
if (Number(params.bg) === 0) params.bg = 1;

// ─── THREE.js setup ────────────────────────────────────────────────────────
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  preserveDrawingBuffer: true,
  alpha: true,
  premultipliedAlpha: false,
});
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene  = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ─── Uniforms ──────────────────────────────────────────────────────────────
const uniforms = {
  u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  u_time:       { value: 0 },
  u_seed:       { value: params.seed },
  u_mode:       { value: Number(params.mode) },
  u_speed:      { value: params.speed },
  u_scale:      { value: params.scale },
  u_detail:     { value: params.detail },
  u_turbulence: { value: params.turbulence },
  u_rise:       { value: params.rise },
  u_wind:       { value: params.wind },
  u_density:    { value: params.density },
  u_threshold:  { value: params.threshold },
  u_softness:   { value: params.softness },
  u_light:      { value: params.light },
  u_lightAngle: { value: params.lightAngle },
  u_warmth:     { value: params.warmth },
};

// Uniform key lookup
const uniformMap = {
  seed: "u_seed",  mode: "u_mode",  speed: "u_speed",
  scale: "u_scale", detail: "u_detail", turbulence: "u_turbulence",
  rise: "u_rise",   wind: "u_wind",     density: "u_density",
  threshold: "u_threshold", softness: "u_softness",
  light: "u_light", lightAngle: "u_lightAngle", warmth: "u_warmth",
};

// ─── Shaders ───────────────────────────────────────────────────────────────
const vertexShader = /* glsl */`
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
precision highp float;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_seed;
uniform float u_speed;
uniform float u_scale;
uniform float u_detail;
uniform float u_turbulence;
uniform float u_rise;
uniform float u_wind;
uniform float u_density;
uniform float u_threshold;
uniform float u_softness;
uniform float u_light;
uniform float u_lightAngle;
uniform float u_warmth;
uniform float u_mode;   /* 0=Fog  1=Mist  2=Smoke  3=Steam */

/* ─── Gradient noise ─────────────────────────────────────────────────────── */
vec2 ghash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

/* Quintic Perlin-style gradient noise → [0, 1] */
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return 0.5 + 0.72 * mix(
    mix(dot(ghash(i),              f              ),
        dot(ghash(i + vec2(1,0)), f - vec2(1,0)), u.x),
    mix(dot(ghash(i + vec2(0,1)), f - vec2(0,1)),
        dot(ghash(i + vec2(1,1)), f - vec2(1,1)), u.x), u.y);
}

/* ─── FBM ────────────────────────────────────────────────────────────────── */
/* Each octave rotates the sample direction to break axis-aligned artefacts.  */
float fbm(vec2 p, float oct) {
  float v = 0.0, a = 0.52, f = 1.0, norm = 0.0;
  vec2 rot = vec2(0.866, 0.5);   /* cos(30°), sin(30°) */
  for (int i = 0; i < 9; i++) {
    if (float(i) >= oct) break;
    v    += a * gnoise(p * f);
    norm += a;
    a    *= 0.48;
    f    *= 2.04;
    /* cheap rotation: swap + negate to avoid axis lock */
    p = vec2(p.y - p.x * 0.25, p.x + p.y * 0.25) * 0.95;
  }
  return v / max(norm, 1e-5);
}

/* ─── Two-level domain warp density ─────────────────────────────────────── */
/* Returns raw [0,1] density at warped position q.                            */
float warpedDensity(vec2 q, float oct, float warpAmt, float t) {
  float oct0 = max(oct * 0.60, 3.0);
  float oct1 = max(oct * 0.85, 3.0);

  /* Warp layer 1 — large turbulent swirls */
  vec2 w1 = vec2(
    fbm(q + vec2( t * 0.110,  t * 0.040), oct0),
    fbm(q + vec2( 5.2, 1.3) + vec2(-t * 0.090,  t * 0.070), oct0)
  );
  w1 = (w1 * 2.0 - 1.0) * warpAmt;

  /* Warp layer 2 — medium eddies on top of layer 1 */
  vec2 w2 = vec2(
    fbm(q + w1 + vec2(1.7, 9.2) + vec2( t * 0.060, -t * 0.030), oct1),
    fbm(q + w1 + vec2(8.3, 2.8) + vec2(-t * 0.050,  t * 0.080), oct1)
  );
  w2 = (w2 * 2.0 - 1.0) * warpAmt * 0.55;

  /* Fine-detail layer — only contributes when oct > 5 */
  float detMix = smoothstep(5.0, 8.5, oct);
  vec2 w3 = vec2(
    fbm(q + w1 + w2 + vec2(3.1, 6.7) + vec2( t * 0.040,  t * 0.020), 3.0),
    fbm(q + w1 + w2 + vec2(7.4, 0.9) + vec2(-t * 0.030,  t * 0.050), 3.0)
  );
  w3 = (w3 * 2.0 - 1.0) * warpAmt * 0.30 * detMix;

  return fbm(q + w1 + w2 + w3, oct);
}

/* ─── Lightweight single-warp density (for shadow / rim sampling) ────────── */
float cheapDensity(vec2 q, float oct, float warpAmt, float t) {
  vec2 w = vec2(
    fbm(q + vec2( t * 0.11,  t * 0.04), 3.0),
    fbm(q + vec2( 5.2, 1.3) + vec2(-t * 0.09, t * 0.07), 3.0)
  );
  w = (w * 2.0 - 1.0) * warpAmt * 0.85;
  return fbm(q + w, max(oct - 1.5, 3.0));
}

void main() {
  vec2 uv     = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p       = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  float t    = u_time * u_speed * 0.42;
  float seed = u_seed;

  /* ── Mode presets ────────────────────────────────────────────────────── */
  float modeWarp, modeOct, modeRiseBase, modeThreshBase;
  vec3  litColor, shadowColor;

  if (u_mode < 0.5) {           /* Fog */
    modeWarp = 0.18; modeOct = 4.5; modeRiseBase = 0.00; modeThreshBase = 0.26;
    litColor    = vec3(0.97, 0.98, 1.00);
    shadowColor = vec3(0.60, 0.65, 0.74);
  } else if (u_mode < 1.5) {    /* Mist */
    modeWarp = 0.38; modeOct = 5.5; modeRiseBase = 0.05; modeThreshBase = 0.28;
    litColor    = vec3(0.90, 0.94, 1.00);
    shadowColor = vec3(0.48, 0.55, 0.72);
  } else if (u_mode < 2.5) {    /* Smoke */
    modeWarp = 0.82; modeOct = 7.5; modeRiseBase = 0.32; modeThreshBase = 0.32;
    litColor    = vec3(0.62, 0.62, 0.66);
    shadowColor = vec3(0.05, 0.05, 0.07);
  } else {                      /* Steam */
    modeWarp = 0.52; modeOct = 5.5; modeRiseBase = 0.68; modeThreshBase = 0.30;
    litColor    = vec3(0.95, 0.97, 1.00);
    shadowColor = vec3(0.60, 0.66, 0.80);
  }

  float warpAmt = modeWarp + u_turbulence * 0.80;
  float oct     = clamp(modeOct + u_detail * 2.2, 3.0, 9.0);
  float riseAmt = modeRiseBase + u_rise  * 0.35;
  float windAmt = u_wind * 0.24;
  float thresh  = modeThreshBase + u_threshold;

  /* ── Animated base position ──────────────────────────────────────────── */
  vec2 drift = vec2(windAmt * t, -riseAmt * t * 0.22);
  vec2 q     = p * u_scale * 1.55 + drift + vec2(seed * 3.71, seed * 2.37);

  /* ── Primary density field ───────────────────────────────────────────── */
  float rawD = warpedDensity(q, oct, warpAmt, t);

  /* ── Density profile mask (mode-specific silhouette shape) ───────────── */
  float profile;
  if (u_mode < 0.5) {
    /* Fog: ground-hugging, hard top cutoff */
    profile = smoothstep(0.78, 0.08, uv.y) * smoothstep(0.0, 0.05, uv.y);
  } else if (u_mode < 1.5) {
    /* Mist: fills mid-frame, fades top and bottom */
    profile = smoothstep(0.0, 0.18, uv.y) * smoothstep(1.0, 0.50, uv.y);
  } else if (u_mode < 2.5) {
    /* Smoke: source at bottom, density thins with height */
    float src  = smoothstep(0.0, 0.42, 1.0 - uv.y);
    float diss = smoothstep(0.02, 0.72, 1.0 - uv.y);
    profile = src * diss;
  } else {
    /* Steam: narrow rising column */
    float col = smoothstep(0.34, 0.06, abs(uv.x - 0.5));
    float ht  = smoothstep(0.0, 0.20, uv.y);
    profile = col * ht;
  }

  /* ── Edge softness ───────────────────────────────────────────────────── */
  float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float edgeFade = smoothstep(0.0, max(u_softness, 0.004), edgeDist);

  /* ── Density shaping → final alpha ──────────────────────────────────── */
  float d = rawD * profile * edgeFade;
  d = smoothstep(thresh, thresh + 0.42, d);
  d = pow(clamp(d, 0.0, 1.0), max(0.35, 1.65 - u_density * 0.85));
  d *= u_density;
  d  = clamp(d, 0.0, 1.0);

  /* ── Self-shadowing ──────────────────────────────────────────────────── */
  float lightAng = u_lightAngle * 3.14159265 / 180.0;
  vec2  ldir     = vec2(cos(lightAng), sin(lightAng)) * 0.22 * u_scale;

  float shadowRaw = cheapDensity(q + ldir, oct, warpAmt, t);
  shadowRaw       = smoothstep(thresh - 0.04, thresh + 0.32, shadowRaw);
  float selfShadow = exp(-shadowRaw * 3.2 * u_light);

  /* Rim / backlit glow from opposite side */
  float rimRaw   = cheapDensity(q - ldir * 0.55, oct, warpAmt, t);
  float rimLight = (1.0 - smoothstep(thresh, thresh + 0.30, rimRaw)) * u_light * 0.38;

  /* ── Final color ─────────────────────────────────────────────────────── */
  float warm = u_warmth * 0.14;
  vec3 litC  = litColor    + vec3( warm, warm * 0.35, -warm * 0.90);
  vec3 shadC = shadowColor + vec3( warm * 0.55, warm * 0.15, -warm * 0.40);

  vec3 col = mix(shadC, litC, selfShadow);
  col += rimLight * litC * 0.55;
  col  = clamp(col, 0.0, 1.5);

  gl_FragColor = vec4(col, d);
}
`;

// ─── Material + Mesh ───────────────────────────────────────────────────────
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendEquation: THREE.AddEquation,
});

const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(mesh);

// ─── State ─────────────────────────────────────────────────────────────────
let paused = false;
const clock = new THREE.Clock();
const history = { undoStack: [], redoStack: [], limit: 120, suppress: false };
let bridge;
let pendingPreview = true;
let previewCooldown = 0;
let lastPersistAt = 0;

// ─── Helpers ───────────────────────────────────────────────────────────────
function syncUniform(id) {
  const key = uniformMap[id];
  if (!key || !uniforms[key]) return;
  uniforms[key].value = Number(params[id]);
}

function syncAllUniforms() {
  Object.keys(uniformMap).forEach(syncUniform);
}

function applyBgMode(mode) {
  const app = document.getElementById("app");
  const m = Number(mode);
  app.className = m === 1 ? "bg-dark" : m === 2 ? "bg-light" : m === 3 ? "bg-black" : "bg-checker";
}

function syncExtras() {
  bridge.extras.paused = paused;
  bridge.extras.time = uniforms.u_time.value;
}

function snapshotState() {
  return JSON.stringify({ params: { ...params }, paused, time: uniforms.u_time.value });
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
    const cfg = controlSchema.find((item) => item.id === id);
    if (!cfg) return;
    if (cfg.type === "select") {
      params[id] = nextParams[id];
    } else {
      const value = Number(nextParams[id]);
      if (!Number.isFinite(value)) return;
      params[id] = value;
    }
    if (id in uniformMap) syncUniform(id);
    if (id === "bg") applyBgMode(params[id]);
  });
  pendingPreview = true;
}

function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") {
      applyParamsFromBridge(state.params, false);
    }
    if (typeof state.time === "number" && Number.isFinite(state.time)) {
      uniforms.u_time.value = state.time;
    }
    if (typeof state.paused === "boolean") paused = state.paused;
    pendingPreview = true;
    syncExtras();
    bridge.notifyValuesChanged();
  } catch (_) {
    // keep current state on malformed history payload
  } finally {
    history.suppress = false;
  }
}

function undoHistory() {
  if (!history.undoStack.length) return;
  const current = snapshotState();
  const previous = history.undoStack.pop();
  history.redoStack.push(current);
  applySnapshot(previous);
}

function redoHistory() {
  if (!history.redoStack.length) return;
  const current = snapshotState();
  const next = history.redoStack.pop();
  history.undoStack.push(current);
  applySnapshot(next);
}

function randomizeAllControls() {
  pushHistorySnapshot();
  controlSchema.forEach((cfg) => {
    if (cfg.id === "bg") return;
    if (cfg.type === "select") {
      const opts = Array.isArray(cfg.options) ? cfg.options : [];
      if (!opts.length) return;
      params[cfg.id] = opts[Math.floor(Math.random() * opts.length)].value;
      if (cfg.id in uniformMap) syncUniform(cfg.id);
      return;
    }
    const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
    const quantized = Math.round(raw / cfg.step) * cfg.step;
    params[cfg.id] = Number(quantized.toFixed(6));
    if (cfg.id in uniformMap) syncUniform(cfg.id);
  });
  pendingPreview = true;
  applyBgMode(params.bg);
  syncExtras();
  bridge.notifyValuesChanged();
}

function togglePause() {
  pushHistorySnapshot();
  paused = !paused;
  syncExtras();
  bridge.notifyValuesChanged();
}

function sendPreview() {
  renderer.render(scene, camera);
  const image = renderer.domElement.toDataURL("image/png");
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

history.suppress = true;
bridge = window.ShaderOpsControls.init({
  projectId: PROJECT_ID,
  schema: controlSchema,
  params,
  extras: { paused, time: uniforms.u_time.value },
  onParams: (ids, nextParams, commit, prevValues) => {
    if (commit && !history.suppress) {
      const priorSnapshot = JSON.stringify({ params: prevValues || params, paused, time: uniforms.u_time.value });
      if (history.undoStack[history.undoStack.length - 1] !== priorSnapshot) {
        history.undoStack.push(priorSnapshot);
        if (history.undoStack.length > history.limit) history.undoStack.shift();
        history.redoStack.length = 0;
      }
    }
    applyParamsFromBridge(nextParams, false);
  },
  onExtras: (nextExtras) => {
    const priorSnapshot = history.suppress ? null : snapshotState();
    let changed = false;
    if (typeof nextExtras.paused === "boolean" && nextExtras.paused !== paused) {
      paused = nextExtras.paused;
      changed = true;
    }
    if (typeof nextExtras.time === "number" && Number.isFinite(nextExtras.time) && nextExtras.time !== uniforms.u_time.value) {
      uniforms.u_time.value = nextExtras.time;
      changed = true;
    }
    if (changed) {
      if (!history.suppress && priorSnapshot) pushHistorySnapshot(priorSnapshot);
      pendingPreview = true;
    }
  },
  actions: {
    randomizeAll: randomizeAllControls,
    togglePause,
    undo: undoHistory,
    redo: redoHistory,
  },
});
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
if (typeof bridge.extras.time === "number" && Number.isFinite(bridge.extras.time)) {
  uniforms.u_time.value = bridge.extras.time;
}
delete bridge.extras.controls;
delete bridge.extras.panel;
syncExtras();
bridge.persist();
history.suppress = false;

// ─── Resize ────────────────────────────────────────────────────────────────
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
  pendingPreview = true;
}
window.addEventListener("resize", onResize);

// ─── Keyboard shortcuts ────────────────────────────────────────────────────
window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "z") return;
  event.preventDefault();
  if (event.shiftKey) redoHistory(); else undoHistory();
});

// ─── Animate ───────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (!paused) {
    uniforms.u_time.value += delta;
  }
  renderer.render(scene, camera);

  const now = performance.now();
  if (now - lastPersistAt > 1200) {
    syncExtras();
    bridge.persist();
    lastPersistAt = now;
  }

  previewCooldown += delta;
  if (pendingPreview && previewCooldown > 0.45) {
    pendingPreview = false;
    previewCooldown = 0;
    sendPreview();
  }
}

// ─── Init ──────────────────────────────────────────────────────────────────
syncAllUniforms();
applyBgMode(params.bg);
animate();
sendPreview();

window.addEventListener("message", (event) => {
  if (event.data?.type === "shaderops/request-preview" && event.data.projectId === PROJECT_ID) {
    sendPreview();
  }
});

window.addEventListener("beforeunload", () => {
  syncExtras();
  bridge.persist();
  sendPreview();
});
