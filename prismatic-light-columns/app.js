import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "prismatic-light-columns";
})();

const storageKey = `shaderops:settings:${PROJECT_ID}`;

const controlSchema = [
  { id: "speed", label: "Speed", group: "Global", min: 0.0, max: 1.5, step: 0.01, default: 0.28 },
  { id: "columns", label: "Columns", group: "Effect", min: 8, max: 26, step: 1, default: 14 },
  { id: "thickness", label: "Width", group: "Effect", min: 0.5, max: 0.95, step: 0.01, default: 0.78 },
  { id: "waveAmp", label: "Wave", group: "Effect", min: 0.0, max: 0.16, step: 0.001, default: 0.045 },
  { id: "bandSoft", label: "Band Soft", group: "Effect", min: 0.003, max: 0.06, step: 0.001, default: 0.02 },
  { id: "edgeGlow", label: "Edge Glow", group: "Effect", min: 0.2, max: 2.8, step: 0.01, default: 1.3 },
  { id: "mist", label: "Mist", group: "Effect", min: 0.0, max: 1.0, step: 0.01, default: 0.35 },
];
const uniformById = {
  columns: "u_columns",
  thickness: "u_thickness",
  waveAmp: "u_waveAmp",
  bandSoft: "u_bandSoft",
  edgeGlow: "u_edgeGlow",
  mist: "u_mist",
  speed: "u_speed",
};
const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

const legacySavedState = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
})();

let seed = Math.random() * 1000.0;
let paused = false;
let restoredTime = 0;

if (legacySavedState?.controls && typeof legacySavedState.controls === "object" && !legacySavedState.params) {
  controlSchema.forEach((cfg) => {
    const value = Number(legacySavedState.controls[cfg.id]);
    if (Number.isFinite(value)) params[cfg.id] = value;
  });
  if (typeof legacySavedState.seed === "number" && Number.isFinite(legacySavedState.seed)) seed = legacySavedState.seed;
  if (typeof legacySavedState.time === "number" && Number.isFinite(legacySavedState.time)) restoredTime = legacySavedState.time;
  if (typeof legacySavedState.paused === "boolean") paused = legacySavedState.paused;
}

const app = document.getElementById("app");
let pendingPreview = true;
let previewCooldown = 0;
let lastPersistAt = 0;
const history = { undoStack: [], redoStack: [], limit: 140, suppress: false };

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const legacyCanvas = document.getElementById("fx");
if (legacyCanvas) legacyCanvas.remove();
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  u_time: { value: restoredTime },
  u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  u_seed: { value: seed },
  u_columns: { value: params.columns },
  u_thickness: { value: params.thickness },
  u_waveAmp: { value: params.waveAmp },
  u_bandSoft: { value: params.bandSoft },
  u_edgeGlow: { value: params.edgeGlow },
  u_mist: { value: params.mist },
  u_speed: { value: params.speed },
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
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_seed;
    uniform float u_columns;
    uniform float u_thickness;
    uniform float u_waveAmp;
    uniform float u_bandSoft;
    uniform float u_edgeGlow;
    uniform float u_mist;
    uniform float u_speed;

    float hash(float n) {
      return fract(sin(n) * 43758.5453123);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      float aspect = u_resolution.x / max(u_resolution.y, 1.0);
      vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

      float t = u_time * (0.35 + u_speed * 0.95);
      float cols = max(2.0, u_columns);

      float xCols = uv.x * cols;
      float colId = floor(xCols);
      float inCol = fract(xCols);
      float xLocal = inCol - 0.5;

      float colMask = smoothstep(0.5, u_thickness * 0.5, abs(xLocal));
      float edge = 1.0 - smoothstep(0.0, 0.5 * u_thickness, abs(xLocal));
      float edgeRim = smoothstep(0.05, 0.48 * u_thickness, abs(xLocal));

      float waveBase = sin(colId * 0.52 + t * 0.9 + u_seed * 0.007);
      float waveDetail = sin(colId * 1.18 - t * 0.35 + xLocal * 25.0);
      float bandY = 0.5 + waveBase * u_waveAmp + waveDetail * u_waveAmp * 0.35;
      float bandShape = abs(uv.y - bandY);
      float crossBand = exp(-bandShape / max(u_bandSoft, 1e-4));

      float shardY1 = hash(colId * 17.31 + floor(u_seed * 0.41));
      float shardY2 = hash(colId * 9.77 + floor(u_seed * 0.57) + 11.0);
      float shard1 = exp(-abs(uv.y - shardY1) * 24.0) * exp(-abs(xLocal) * 8.5);
      float shard2 = exp(-abs(uv.y - shardY2) * 20.0) * exp(-abs(xLocal) * 7.0);

      vec3 bg = vec3(0.0, 0.03, 0.1);
      bg += vec3(0.01, 0.03, 0.07) * exp(-length(p) * 2.8);
      bg += vec3(0.03, 0.06, 0.1) * pow(crossBand, 1.9) * 0.24;

      vec3 glassBase = vec3(0.18, 0.29, 0.38);
      vec3 glassDark = vec3(0.03, 0.09, 0.16);
      vec3 glow = vec3(0.86, 0.93, 1.0);

      float verticalTone = 0.45 + 0.55 * smoothstep(0.0, 1.0, uv.y);
      vec3 columns = mix(glassDark, glassBase, verticalTone) * colMask;
      columns += glow * pow(edgeRim, 2.0) * (0.15 + 0.65 * u_edgeGlow);
      columns += glow * pow(crossBand, 1.25) * colMask * (0.25 + 0.9 * u_edgeGlow);
      columns += glow * (shard1 + shard2) * colMask * 0.32;

      float line = smoothstep(0.495, 0.485, abs(xLocal));
      columns += vec3(0.5, 0.65, 0.8) * line * 0.24;

      vec3 color = bg + columns;
      color += vec3(0.45, 0.58, 0.7) * u_mist * exp(-abs(p.y) * 4.2) * 0.25;

      float vignette = smoothstep(1.05, 0.12, length(p * vec2(0.95, 1.3)));
      color *= vignette;

      float grain = (hash(gl_FragCoord.x + gl_FragCoord.y * 37.1 + u_time * 7.0 + u_seed) - 0.5) * 0.01;
      color += grain;

      color = max(color, 0.0);
      color = pow(color, vec3(0.93));
      gl_FragColor = vec4(color, 1.0);
    }
  `
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

const clock = new THREE.Clock();

function syncUniform(id) {
  const uniformKey = uniformById[id];
  if (uniformKey && uniforms[uniformKey]) uniforms[uniformKey].value = params[id];
}

function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
  bridge.extras.time = uniforms.u_time.value;
}

function snapshotState() {
  return JSON.stringify({ params: { ...params }, seed, time: uniforms.u_time.value, paused });
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
    const value = Number(nextParams[id]);
    if (!Number.isFinite(value)) return;
    params[id] = value;
    syncUniform(id);
  });
  pendingPreview = true;
}

function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") applyParamsFromBridge(state.params, false);
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) {
      seed = state.seed;
      uniforms.u_seed.value = seed;
    }
    if (typeof state.time === "number" && Number.isFinite(state.time)) {
      uniforms.u_time.value = state.time;
    }
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
    syncUniform(cfg.id);
  });
  seed = Math.random() * 1000.0;
  uniforms.u_seed.value = seed;
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}

function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.random() * 1000.0;
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

function sendPreview() {
  renderer.render(scene, camera);
  const image = renderer.domElement.toDataURL("image/png");
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

history.suppress = true;
const bridge = window.ShaderOpsControls.init({
  projectId: PROJECT_ID,
  schema: controlSchema,
  params,
  extras: { seed, paused, time: uniforms.u_time.value },
  onParams: (ids, nextParams, commit, prevValues) => {
    if (commit && !history.suppress) {
      const priorSnapshot = JSON.stringify({ params: prevValues || params, seed, time: uniforms.u_time.value, paused });
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
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed) && nextExtras.seed !== seed) {
      seed = nextExtras.seed;
      uniforms.u_seed.value = seed;
      changed = true;
    }
    if (typeof nextExtras.time === "number" && Number.isFinite(nextExtras.time) && nextExtras.time !== uniforms.u_time.value) {
      uniforms.u_time.value = nextExtras.time;
      changed = true;
    }
    if (typeof nextExtras.paused === "boolean" && nextExtras.paused !== paused) {
      paused = nextExtras.paused;
      changed = true;
    }
    if (changed) {
      if (!history.suppress && priorSnapshot) pushHistorySnapshot(priorSnapshot);
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
if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) {
  seed = bridge.extras.seed;
  uniforms.u_seed.value = seed;
}
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
if (typeof bridge.extras.time === "number" && Number.isFinite(bridge.extras.time)) {
  uniforms.u_time.value = bridge.extras.time;
}
delete bridge.extras.controls;
delete bridge.extras.panel;
syncExtras();
bridge.persist();
history.suppress = false;

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
  pendingPreview = true;
});

window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "z") return;
  event.preventDefault();
  if (event.shiftKey) redoHistory(); else undoHistory();
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "shaderops/request-preview" && event.data.projectId === PROJECT_ID) sendPreview();
});

window.addEventListener("beforeunload", () => {
  syncExtras();
  bridge.persist();
  sendPreview();
});

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

animate();
sendPreview();
