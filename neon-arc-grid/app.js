import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "neon-arc-grid";
})();

const STORAGE_KEY = `shaderops:settings:${PROJECT_ID}`;

const controlSchema = [
  { id: "speed", label: "Speed", group: "Global", min: 0.0, max: 2.0, step: 0.01, default: 0.0 },
  { id: "hueOff", label: "Hue", group: "Color", min: 0.0, max: 1.0, step: 0.01, default: 0.0 },
  { id: "bright", label: "Bright", group: "Color", min: 0.1, max: 4.0, step: 0.1, default: 1.5 },
  { id: "cols", label: "Cols", group: "Effect", min: 1, max: 12, step: 1, default: 6 },
  { id: "rows", label: "Rows", group: "Effect", min: 1, max: 20, step: 1, default: 8 },
  { id: "density", label: "Density", group: "Effect", min: 0.0, max: 1.0, step: 0.05, default: 0.35 },
  { id: "arc", label: "Arc", group: "Effect", min: 0.1, max: 1.5, step: 0.01, default: 0.82 },
  { id: "glow", label: "Glow", group: "Effect", min: 0.01, max: 1.0, step: 0.01, default: 0.28 },
  { id: "chroma", label: "Chroma", group: "Effect", min: 0.0, max: 3.0, step: 0.1, default: 1.0 },
];
const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

const history = { undoStack: [], redoStack: [], limit: 140, suppress: false };

let paused = false;
let elapsed = 0;
let lastTs = performance.now() / 1000;
let pendingPreview = true;
let previewCooldown = 0;

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
  u_time: { value: 0.0 },
  u_cols: { value: params.cols },
  u_rows: { value: params.rows },
  u_density: { value: params.density },
  u_arc: { value: params.arc },
  u_glow: { value: params.glow },
  u_chroma: { value: params.chroma },
  u_hueOff: { value: params.hueOff },
  u_bright: { value: params.bright },
};

const VS = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FS = `
  precision highp float;
  varying vec2  vUv;
  uniform float u_time;
  uniform float u_cols;
  uniform float u_rows;
  uniform float u_density;
  uniform float u_arc;
  uniform float u_glow;
  uniform float u_chroma;
  uniform float u_hueOff;
  uniform float u_bright;

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;

    vec2 fineGP    = uv * vec2(u_cols, u_rows);
    vec2 fineCell  = floor(fineGP);
    vec2 fineTUV   = fract(fineGP);

    vec2 coarseGP   = uv * vec2(u_cols * 0.5, u_rows * 0.5);
    vec2 coarseCell = floor(coarseGP);
    vec2 coarseTUV  = fract(coarseGP);

    float h       = hash21(coarseCell * 5.17 + 2.71);
    float isLarge = step(h, u_density);

    vec2 cell = mix(fineCell, coarseCell, isLarge);
    vec2 tUV  = mix(fineTUV,  coarseTUV,  isLarge);

    float ci = mod(cell.x + cell.y, 4.0);

    vec2 p;
    if      (ci < 1.0) p = tUV;
    else if (ci < 2.0) p = vec2(1.0 - tUV.x, tUV.y);
    else if (ci < 3.0) p = 1.0 - tUV;
    else               p = vec2(tUV.x, 1.0 - tUV.y);

    float dist = length(p);
    float r    = u_arc;
    float gw   = max(u_glow * 0.10 + 0.003, 0.003);

    float ca  = u_chroma * 0.022;
    float dR  = abs(dist - max(r - ca, 0.001));
    float dG  = abs(dist - r);
    float dB  = abs(dist - (r + ca));

    float glR = exp(-dR / gw);
    float glG = exp(-dG / gw);
    float glB = exp(-dB / gw);

    vec2 maxCoarse = max(vec2(u_cols * 0.5, u_rows * 0.5), 1.0);
    vec2 maxFine   = max(vec2(u_cols,        u_rows),       1.0);
    vec2 normC     = cell / mix(maxFine, maxCoarse, isLarge);

    float hue = fract(
      (normC.x * 0.5 + normC.y * 0.35) * 2.2
      + hash21(cell + 0.5) * 0.14
      + u_time * 0.04
      + u_hueOff
    );
    vec3 baseCol = hsv2rgb(vec3(hue, 1.0, 1.0));

    vec3 col = vec3(0.0);
    col += baseCol * exp(-dG / (gw * 5.0)) * 0.40;
    col += baseCol * glG;
    col += vec3(glG * glG * 1.9);
    col.r += glR * (1.0 - glG) * 0.85;
    col.b += glB * (1.0 - glG) * 0.85;

    float lw  = 0.007;
    float lx  = smoothstep(lw, 0.0, abs(tUV.x)) + smoothstep(lw, 0.0, abs(1.0 - tUV.x));
    float ly  = smoothstep(lw, 0.0, abs(tUV.y)) + smoothstep(lw, 0.0, abs(1.0 - tUV.y));
    col += clamp(lx + ly, 0.0, 1.0) * 0.08;

    col *= u_bright;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS });
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

function applyUniformParams() {
  uniforms.u_cols.value = params.cols;
  uniforms.u_rows.value = params.rows;
  uniforms.u_density.value = params.density;
  uniforms.u_arc.value = params.arc;
  uniforms.u_glow.value = params.glow;
  uniforms.u_chroma.value = params.chroma;
  uniforms.u_hueOff.value = params.hueOff;
  uniforms.u_bright.value = params.bright;
}

function syncExtras() {
  bridge.extras.paused = paused;
}

function snapshotState() {
  return JSON.stringify({ params: { ...params }, paused });
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
    const n = Number(nextParams[id]);
    if (Number.isFinite(n)) params[id] = n;
  });
  applyUniformParams();
  pendingPreview = true;
}

function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") applyParamsFromBridge(state.params, false);
    if (typeof state.paused === "boolean") paused = state.paused;
    pendingPreview = true;
    syncExtras();
    bridge.notifyValuesChanged();
  } catch {}
  finally { history.suppress = false; }
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
  controlSchema.forEach((cfg) => {
    const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
    const quantized = Math.round(raw / cfg.step) * cfg.step;
    params[cfg.id] = Number(quantized.toFixed(6));
  });
  applyUniformParams();
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}

function rerollSeed() {
  pushHistorySnapshot();
  params.hueOff = Math.random();
  applyUniformParams();
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

function renderDisplay() {
  uniforms.u_time.value = elapsed;
  renderer.render(scene, camera);
}

function sendPreview() {
  renderDisplay();
  const image = renderer.domElement.toDataURL("image/jpeg", 0.7);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

function migrateLegacyFlatState() {
  let migrated = false;
  let cleaned = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || saved.params) return false;
    controlSchema.forEach((cfg) => {
      if (saved[cfg.id] === undefined) return;
      const n = Number(saved[cfg.id]);
      if (Number.isFinite(n)) {
        params[cfg.id] = n;
        migrated = true;
      }
      if (bridge.extras[cfg.id] !== undefined) {
        delete bridge.extras[cfg.id];
        cleaned = true;
      }
    });
    if (bridge.extras.panelHidden !== undefined) {
      delete bridge.extras.panelHidden;
      cleaned = true;
    }
    if (typeof saved.paused === "boolean") paused = saved.paused;
    if (migrated) {
      applyUniformParams();
      pendingPreview = true;
    }
    if (migrated || cleaned) {
      syncExtras();
      bridge.notifyValuesChanged();
    }
    return migrated || cleaned;
  } catch {
    return false;
  }
}

history.suppress = true;
const bridge = window.ShaderOpsControls.init({
  projectId: PROJECT_ID,
  schema: controlSchema,
  params,
  extras: { paused },
  onParams: (ids, nextParams, commit, prevValues) => {
    if (commit && !history.suppress) {
      const priorSnapshot = JSON.stringify({ params: prevValues || params, paused });
      if (history.undoStack[history.undoStack.length - 1] !== priorSnapshot) {
        history.undoStack.push(priorSnapshot);
        if (history.undoStack.length > history.limit) history.undoStack.shift();
        history.redoStack.length = 0;
      }
    }
    applyParamsFromBridge(nextParams, false);
  },
  onExtras: (nextExtras) => {
    if (typeof nextExtras.paused === "boolean" && nextExtras.paused !== paused) {
      pushHistorySnapshot();
      paused = nextExtras.paused;
      pendingPreview = true;
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
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
applyUniformParams();
migrateLegacyFlatState();
history.suppress = false;

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  const now = performance.now() / 1000;
  const dt = now - lastTs;
  lastTs = now;

  if (!paused) elapsed += dt * params.speed;
  renderDisplay();
  previewCooldown += dt;
  if (pendingPreview && previewCooldown > 0.45) {
    pendingPreview = false;
    previewCooldown = 0;
    sendPreview();
  }
}

renderDisplay();
sendPreview();
animate();
