import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "neon-ribbon-flow";
})();

const controlSchema = [
  { id: "speed", label: "Speed", group: "Global", min: 0.0, max: 1.5, step: 0.01, default: 0.4 },
  { id: "layers", label: "Layers", group: "Effect", min: 2, max: 7, step: 1, default: 5 },
  { id: "width", label: "Width", group: "Effect", min: 0.08, max: 0.3, step: 0.001, default: 0.16 },
  { id: "swing", label: "Swing", group: "Effect", min: 0.04, max: 0.4, step: 0.001, default: 0.18 },
  { id: "twist", label: "Twist", group: "Effect", min: 0.3, max: 3.2, step: 0.01, default: 1.6 },
  { id: "glow", label: "Glow", group: "Effect", min: 0.4, max: 2.4, step: 0.01, default: 1.2 },
  { id: "patternAmount", label: "Pattern Amount", group: "Pattern", min: 0.0, max: 1.0, step: 0.01, default: 0.72 },
  { id: "patternDensity", label: "Pattern Density", group: "Pattern", min: 2.0, max: 40.0, step: 0.1, default: 13.0 },
  { id: "patternFlow", label: "Pattern Flow", group: "Pattern", min: 0.0, max: 4.0, step: 0.01, default: 1.05 },
  { id: "patternSoftness", label: "Pattern Soft", group: "Pattern", min: 0.01, max: 0.35, step: 0.001, default: 0.08 },
  { id: "shapeMorph", label: "Shape Morph", group: "Pattern", min: 0.0, max: 1.0, step: 0.01, default: 0.35 },
  { id: "diffractionMix", label: "Diffraction Mix", group: "Pattern", min: 0.0, max: 1.0, step: 0.01, default: 0.58 },
  {
    id: "falloffMode",
    label: "Falloff Mode",
    group: "Effect",
    type: "select",
    default: 0,
    options: [
      { value: 0, label: "Exponential" },
      { value: 1, label: "Exp Squared" },
      { value: 2, label: "Linear" },
      { value: 3, label: "Smoothstep" },
      { value: 4, label: "Inverse Square" },
      { value: 5, label: "Hybrid" },
    ],
  },
];
const uniformById = {
  speed: "u_speed",
  layers: "u_layers",
  width: "u_width",
  swing: "u_swing",
  twist: "u_twist",
  glow: "u_glow",
  patternAmount: "u_patternAmount",
  patternDensity: "u_patternDensity",
  patternFlow: "u_patternFlow",
  patternSoftness: "u_patternSoftness",
  shapeMorph: "u_shapeMorph",
  diffractionMix: "u_diffractionMix",
  falloffMode: "u_falloff",
};
const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

const storageKey = `shaderops:settings:${PROJECT_ID}`;
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
  u_layers: { value: params.layers },
  u_width: { value: params.width },
  u_swing: { value: params.swing },
  u_twist: { value: params.twist },
  u_speed: { value: params.speed },
  u_glow: { value: params.glow },
  u_patternAmount: { value: params.patternAmount },
  u_patternDensity: { value: params.patternDensity },
  u_patternFlow: { value: params.patternFlow },
  u_patternSoftness: { value: params.patternSoftness },
  u_shapeMorph: { value: params.shapeMorph },
  u_diffractionMix: { value: params.diffractionMix },
  u_falloff: { value: params.falloffMode },
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
    uniform float u_layers;
    uniform float u_width;
    uniform float u_swing;
    uniform float u_twist;
    uniform float u_speed;
    uniform float u_glow;
    uniform float u_patternAmount;
    uniform float u_patternDensity;
    uniform float u_patternFlow;
    uniform float u_patternSoftness;
    uniform float u_shapeMorph;
    uniform float u_diffractionMix;
    uniform float u_falloff;

    float hash(float n) {
      return fract(sin(n) * 43758.5453123);
    }

    vec3 over(vec3 base, vec3 layer, float alpha) {
      return mix(base, layer, clamp(alpha, 0.0, 1.0));
    }

    float glowFalloff(float d, float mode, float scale) {
      float x = max(d, 0.0) * max(scale, 1e-4);
      if (mode < 0.5) {
        return exp(-x);
      }
      if (mode < 1.5) {
        return exp(-x * x);
      }
      if (mode < 2.5) {
        return max(0.0, 1.0 - x);
      }
      if (mode < 3.5) {
        return 1.0 - smoothstep(0.0, 1.0, x);
      }
      if (mode < 4.5) {
        return 1.0 / (1.0 + x * x * 3.0);
      }
      float core = exp(-x * 1.7);
      float tail = 1.0 / (1.0 + x * x * 2.2);
      return mix(tail, core, 0.62);
    }

    float sdCircle(vec2 p, float r) {
      return length(p) - r;
    }

    float sdDiamond(vec2 p, float r) {
      return (abs(p.x) + abs(p.y)) - r;
    }

    float sdBox(vec2 p, vec2 b) {
      vec2 d = abs(p) - b;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      vec2 p = uv * 2.0 - 1.0;
      p.x *= u_resolution.x / u_resolution.y;

      float t = u_time * (0.2 + u_speed * 0.85);
      vec3 color = vec3(0.0);
      vec3 glowAccum = vec3(0.0);

      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        if (fi >= u_layers) {
          continue;
        }

        float id = fi + floor(u_seed * 0.1);
        float lane = fi / max(u_layers - 1.0, 1.0);
        float side = mix(-1.15, 1.15, lane);
        float depth = 1.0 - fi / (u_layers + 1.0);

        float y = p.y * (1.15 + 0.14 * lane) + lane * 0.8;
        float freq = 1.1 + u_twist * (0.65 + 0.18 * lane);
        float wave = sin(y * freq + t * (0.55 + lane * 0.45) + id * 1.13);
        float wave2 = sin(y * (freq * 0.58) - t * 0.32 + id * 2.41);
        float centerX = side + (wave * 0.72 + wave2 * 0.28) * u_swing;

        float width = u_width * (0.8 + 0.36 * depth) * (1.0 + 0.06 * sin(y * 3.2 + id));
        float dx = p.x - centerX;
        float nd = dx / max(width, 1e-4);
        float inside = smoothstep(1.0, 0.88, abs(nd));

        float edge = smoothstep(0.22, 0.98, abs(nd));
        float centerShade = 1.0 - smoothstep(0.0, 0.72, abs(nd));

        float edgeGlow = glowFalloff(abs(abs(dx) - width), u_falloff, 35.0 + 42.0 * u_glow);
        float halo = glowFalloff(abs(abs(dx) - width * 1.04), u_falloff, 14.0 + 20.0 * u_glow);

        float lit = 0.25 + 0.75 * pow(edge, 1.2);
        vec3 darkGreen = vec3(0.0, 0.08, 0.03);
        vec3 midGreen = vec3(0.16, 0.55, 0.02);
        vec3 lime = vec3(0.92, 1.0, 0.11);
        vec3 ribbonCol = mix(darkGreen, midGreen, lit);
        ribbonCol = mix(ribbonCol, lime, pow(edge, 1.6) * (0.45 + 0.55 * depth));
        ribbonCol *= (0.72 + 0.5 * depth);

        float patternAmount = clamp(u_patternAmount, 0.0, 1.0);
        float edgeZone = pow(edge, 1.4) * inside;
        vec2 q = vec2(dx / max(width, 1e-4), y * (0.75 + depth * 0.45) + id * 0.23);
        float morph = clamp(u_shapeMorph, 0.0, 1.0);
        float sdfA = mix(sdCircle(q, 1.0), sdDiamond(q, 1.0), smoothstep(0.0, 0.5, morph));
        float sdfB = mix(sdDiamond(q, 1.0), sdBox(q, vec2(0.86, 0.86)), smoothstep(0.5, 1.0, morph));
        float sdf = mix(sdfA, sdfB, step(0.5, morph));

        float pd = max(u_patternDensity, 0.001);
        float flowT = t * (0.3 + u_patternFlow * 1.8);
        float bandCoord = sdf * pd - flowT + q.y * 0.65;
        float ring = abs(fract(bandCoord) - 0.5);
        float soft = max(0.001, u_patternSoftness);
        float sdfBands = 1.0 - smoothstep(0.5 - soft, 0.5 + soft, ring);

        float interferA = cos((dx * pd * 1.8 + y * pd * 0.35 - flowT * 2.2) * 6.28318530718);
        float interferB = cos((dx * pd * 0.92 - y * pd * 0.64 + flowT * 1.3) * 6.28318530718);
        float diffraction = 0.5 + 0.5 * interferA * interferB;
        float pattern = mix(sdfBands, diffraction, clamp(u_diffractionMix, 0.0, 1.0));

        float edgePattern = mix(1.0, 0.45 + pattern * 1.55, patternAmount * edgeZone);
        ribbonCol *= edgePattern;

        float transparency = (0.34 + 0.32 * depth) * inside;
        float innerShadow = mix(0.65, 1.0, edge) * (1.0 - centerShade * 0.2);
        color = over(color, ribbonCol * innerShadow, transparency);

        vec3 glowColor = mix(midGreen, lime, 0.82);
        float glowPattern = mix(1.0, 0.55 + pattern * 1.3, patternAmount * (0.35 + 0.65 * edgeZone));
        glowAccum += glowColor * (edgeGlow * (0.25 + depth * 0.85) + halo * 0.3) * (0.5 + 0.8 * u_glow) * glowPattern;
      }

      color += glowAccum;

      float vignette = smoothstep(1.45, 0.15, length(p * vec2(0.9, 1.0)));
      color *= vignette;

      float grain = (hash(gl_FragCoord.x + gl_FragCoord.y * 113.7 + u_time * 15.0 + u_seed) - 0.5) * 0.018;
      color += grain;

      color = max(color, 0.0);
      color = pow(color, vec3(0.92));
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
    if (cfg.type === "select") {
      const opts = Array.isArray(cfg.options) ? cfg.options : [];
      if (!opts.length) return;
      params[cfg.id] = opts[Math.floor(Math.random() * opts.length)].value;
      syncUniform(cfg.id);
      return;
    }
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
