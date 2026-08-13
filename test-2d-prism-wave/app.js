import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "test-2d-prism-wave";
})();

const PRESET = {
  speed: 0.62,
  hue: 210,
  saturation: 0.96,
  contrast: 1.06,
  flow: 1.08,
  density: 1.0,
  glow: 1.0,
};

const schema = [
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 2.0, step: 0.01, default: PRESET.speed },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: PRESET.hue },
  { id: "saturation", label: "Sat", group: "Color", min: 0.2, max: 1.4, step: 0.01, default: PRESET.saturation },
  { id: "contrast", label: "Contrast", group: "Color", min: 0.5, max: 1.8, step: 0.01, default: PRESET.contrast },
  { id: "flow", label: "Flow", group: "Effect", min: 0.4, max: 1.8, step: 0.01, default: PRESET.flow },
  { id: "density", label: "Density", group: "Effect", min: 0.4, max: 1.8, step: 0.01, default: PRESET.density },
  { id: "glow", label: "Glow", group: "Effect", min: 0.2, max: 2.0, step: 0.01, default: PRESET.glow },
];

const params = {};
schema.forEach((cfg) => { params[cfg.id] = cfg.default; });

let paused = false;
let elapsed = 0;
let lastTs = performance.now() * 0.001;
let pendingPreview = true;
let previewCooldown = 0;
let seed = 2026;

const history = { undoStack: [], redoStack: [], limit: 120, suppress: false };

const app = document.getElementById("app");
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
  u_hue: { value: params.hue },
  u_sat: { value: params.saturation },
  u_contrast: { value: params.contrast },
  u_flow: { value: params.flow },
  u_density: { value: params.density },
  u_glow: { value: params.glow },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_hue;
    uniform float u_sat;
    uniform float u_contrast;
    uniform float u_flow;
    uniform float u_density;
    uniform float u_glow;

    vec3 hsv2rgb(vec3 c){
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
      vec2 uv = vUv * 2.0 - 1.0;
      uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

      float t = u_time;
      float flow = clamp(u_flow, 0.1, 3.0);
      float den = clamp(u_density, 0.1, 3.0);
      float glow = clamp(u_glow, 0.0, 3.0);

      float waveA = sin((uv.x * 2.8 + t * 0.95 * flow) * den);
      float waveB = sin((uv.y * 3.9 - t * 1.15 * flow + waveA * 0.8) * den);
      float waveC = sin((uv.x + uv.y) * 4.6 * den + t * 0.55 * flow);
      float f = waveA * 0.42 + waveB * 0.36 + waveC * 0.22;

      float bands = 0.5 + 0.5 * sin(f * 5.8 + t * 0.7);
      float halo = exp(-length(uv) * (1.7 - 0.35 * glow));
      float signal = bands * 0.72 + halo * (0.45 + 0.35 * glow);

      float baseHue = fract(u_hue / 360.0 + 0.12 * f + 0.05 * sin(t * 0.21));
      vec3 colA = hsv2rgb(vec3(baseHue, clamp(u_sat, 0.2, 1.6), 1.0));
      vec3 colB = hsv2rgb(vec3(fract(baseHue + 0.22 + 0.11 * waveB), clamp(u_sat * 0.9, 0.2, 1.6), 1.0));
      vec3 col = mix(colA, colB, 0.5 + 0.5 * waveC) * signal;

      col = pow(max(col, vec3(0.0)), vec3(1.0 / clamp(u_contrast, 0.3, 3.0)));
      col += hsv2rgb(vec3(fract(baseHue + 0.35), 0.55, 1.0)) * halo * (0.18 + 0.22 * glow);

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float guard = smoothstep(0.025, 0.0, luma);
      col += vec3(0.08, 0.09, 0.12) * guard;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

function safe(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function applyParamsToUniforms() {
  params.speed = safe(params.speed, PRESET.speed, -4, 8);
  params.hue = safe(params.hue, PRESET.hue, -7200, 7200);
  params.saturation = safe(params.saturation, PRESET.saturation, -4, 4);
  params.contrast = safe(params.contrast, PRESET.contrast, -4, 8);
  params.flow = safe(params.flow, PRESET.flow, -4, 8);
  params.density = safe(params.density, PRESET.density, -4, 8);
  params.glow = safe(params.glow, PRESET.glow, -4, 8);

  uniforms.u_hue.value = params.hue;
  uniforms.u_sat.value = params.saturation;
  uniforms.u_contrast.value = params.contrast;
  uniforms.u_flow.value = params.flow;
  uniforms.u_density.value = params.density;
  uniforms.u_glow.value = params.glow;
}

function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
}

function snapshotState() {
  return JSON.stringify({ params: { ...params }, seed, paused });
}

function pushHistorySnapshot(explicitSnapshot) {
  if (history.suppress) return;
  const snap = explicitSnapshot !== undefined ? explicitSnapshot : snapshotState();
  if (history.undoStack[history.undoStack.length - 1] === snap) return;
  history.undoStack.push(snap);
  if (history.undoStack.length > history.limit) history.undoStack.shift();
  history.redoStack.length = 0;
}

function applyParamsFromBridge(nextParams, recordHistory) {
  if (recordHistory) pushHistorySnapshot();
  Object.keys(nextParams).forEach((id) => {
    if (params[id] === undefined) return;
    params[id] = nextParams[id];
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
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) seed = Math.max(1, Math.floor(state.seed));
    if (typeof state.paused === "boolean") paused = state.paused;
    pendingPreview = true;
    syncExtras();
    bridge.notifyValuesChanged();
  } finally {
    history.suppress = false;
  }
}

function undoHistory() {
  if (history.undoStack.length === 0) return;
  const current = snapshotState();
  const prev = history.undoStack.pop();
  history.redoStack.push(current);
  applySnapshot(prev);
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
  schema.forEach((cfg) => {
    const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
    const quantized = Math.round(raw / cfg.step) * cfg.step;
    params[cfg.id] = Number(quantized.toFixed(6));
  });
  applyParamsToUniforms();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}

function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.floor(Math.random() * 2147483646) + 1;
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
  const image = renderer.domElement.toDataURL("image/jpeg", 0.8);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

history.suppress = true;
const bridge = window.ShaderOpsControls.init({
  projectId: PROJECT_ID,
  schema,
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

if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) seed = Math.max(1, Math.floor(bridge.extras.seed));
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
history.suppress = false;

applyParamsToUniforms();

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
  pendingPreview = true;
});

window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "z") return;
  event.preventDefault();
  if (event.shiftKey) redoHistory(); else undoHistory();
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "shaderops/request-preview") sendPreview();
});

window.addEventListener("beforeunload", () => sendPreview());

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() * 0.001;
  const dt = Math.min(0.08, now - lastTs);
  lastTs = now;
  if (!paused) elapsed += dt * params.speed;
  renderFrame();
  previewCooldown += dt;
  if (pendingPreview && previewCooldown > 0.45) {
    pendingPreview = false;
    previewCooldown = 0;
    sendPreview();
  }
}

renderFrame();
sendPreview();
animate();
