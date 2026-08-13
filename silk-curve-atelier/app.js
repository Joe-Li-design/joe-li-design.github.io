import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "silk-curve-atelier";
})();
const STORAGE_KEY = `shaderops:settings:${PROJECT_ID}`;

const STYLE_OPTIONS = ["wave", "spiral", "rose", "braid", "calligraphy", "mixed"];
const STYLE_INDEX = Object.fromEntries(STYLE_OPTIONS.map((name, index) => [name, index]));

const controlSchema = [
  { id: "layers", label: "Layers", group: "Global", min: 3, max: 9, step: 1, default: 6 },
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 1.5, step: 0.01, default: 0.45 },
  { id: "glow", label: "Glow", group: "Global", min: 0.4, max: 2.6, step: 0.01, default: 1.3 },
  { id: "grain", label: "Grain", group: "Global", min: 0, max: 0.08, step: 0.001, default: 0.02 },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: 200 },
  { id: "hueVar", label: "Hue Var", group: "Color", min: 0, max: 180, step: 1, default: 60 },
  { id: "sat", label: "Sat", group: "Color", min: 0.2, max: 1.4, step: 0.01, default: 0.85 },
  {
    id: "style", label: "Style", group: "Effect", min: 0, max: 5, step: 1, default: 5,
    type: "select",
    options: [
      { value: 0, label: "Wave" },
      { value: 1, label: "Spiral" },
      { value: 2, label: "Rose Loop" },
      { value: 3, label: "Braid" },
      { value: 4, label: "Calligraphy" },
      { value: 5, label: "Mixed" },
    ],
  },
  { id: "width", label: "Width", group: "Effect", min: 0.03, max: 0.22, step: 0.001, default: 0.1 },
  { id: "swing", label: "Swing", group: "Effect", min: 0.05, max: 0.55, step: 0.001, default: 0.22 },
  { id: "twist", label: "Twist", group: "Effect", min: 0.3, max: 3.5, step: 0.01, default: 1.5 },
  { id: "petals", label: "Petals", group: "Effect", min: 2, max: 9, step: 1, default: 5 },
  { id: "weave", label: "Weave", group: "Effect", min: 0.2, max: 3.0, step: 0.01, default: 1.2 },
  { id: "taper", label: "Taper", group: "Effect", min: 0, max: 1, step: 0.01, default: 0.55 },
];

const uniformById = {
  style: "u_style",
  layers: "u_layers",
  width: "u_width",
  swing: "u_swing",
  twist: "u_twist",
  petals: "u_petals",
  weave: "u_weave",
  taper: "u_taper",
  speed: "u_speed",
  glow: "u_glow",
  grain: "u_grain",
  hue: "u_hue",
  hueVar: "u_hueVar",
  sat: "u_sat",
};

const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

function readSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

function normalizeStyleValue(value) {
  if (typeof value === "string" && STYLE_INDEX[value] !== undefined) return STYLE_INDEX[value];
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return controlSchema.find((cfg) => cfg.id === "style")?.default ?? 5;
  return Math.min(5, Math.max(0, Math.round(numeric)));
}

function normalizeParam(id, value) {
  if (id === "style") return normalizeStyleValue(value);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

const legacySavedState = readSavedState();
let paused = false;
let elapsed = 0;
let seed = 731894205;

if (legacySavedState) {
  if (legacySavedState.controls && typeof legacySavedState.controls === "object" && !legacySavedState.params) {
    controlSchema.forEach((cfg) => {
      if (legacySavedState.controls[cfg.id] === undefined) return;
      const normalized = normalizeParam(cfg.id, legacySavedState.controls[cfg.id]);
      if (normalized !== null) params[cfg.id] = normalized;
    });
  }

  if (legacySavedState.params && typeof legacySavedState.params === "object") {
    controlSchema.forEach((cfg) => {
      if (legacySavedState.params[cfg.id] === undefined) return;
      const normalized = normalizeParam(cfg.id, legacySavedState.params[cfg.id]);
      if (normalized !== null) params[cfg.id] = normalized;
    });
  }

  if (legacySavedState.style !== undefined && legacySavedState.params?.style === undefined) {
    params.style = normalizeStyleValue(legacySavedState.style);
  }
  if (typeof legacySavedState.seed === "number" && Number.isFinite(legacySavedState.seed)) {
    seed = Math.max(1, Math.floor(legacySavedState.seed));
  }
  if (typeof legacySavedState.time === "number" && Number.isFinite(legacySavedState.time)) {
    elapsed = legacySavedState.time;
  }
  if (typeof legacySavedState.paused === "boolean") {
    paused = legacySavedState.paused;
  }
}

const app = document.getElementById("app");
let pendingPreview = true;
let previewCooldown = 0;
let lastPersistAt = 0;
let lastTs = performance.now() * 0.001;
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
  u_time: { value: elapsed },
  u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  u_seed: { value: seed },
  u_style: { value: params.style },
  u_layers: { value: params.layers },
  u_width: { value: params.width },
  u_swing: { value: params.swing },
  u_twist: { value: params.twist },
  u_petals: { value: params.petals },
  u_weave: { value: params.weave },
  u_taper: { value: params.taper },
  u_speed: { value: params.speed },
  u_glow: { value: params.glow },
  u_grain: { value: params.grain },
  u_hue: { value: params.hue },
  u_hueVar: { value: params.hueVar },
  u_sat: { value: params.sat },
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
    #define MAX_LAYERS 9
    varying vec2 vUv;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_seed;
    uniform float u_style;
    uniform float u_layers;
    uniform float u_width;
    uniform float u_swing;
    uniform float u_twist;
    uniform float u_petals;
    uniform float u_weave;
    uniform float u_taper;
    uniform float u_speed;
    uniform float u_glow;
    uniform float u_grain;
    uniform float u_hue;
    uniform float u_hueVar;
    uniform float u_sat;

    float hash(float n) { return fract(sin(n) * 43758.5453123); }
    float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    vec3 over(vec3 base, vec3 layer, float alpha) {
      return mix(base, layer, clamp(alpha, 0.0, 1.0));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      vec2 p = uv * 2.0 - 1.0;
      p.x *= u_resolution.x / max(u_resolution.y, 1.0);

      float t = u_time * (0.2 + u_speed * 0.85);
      int styleSel = int(u_style + 0.5);
      bool mixedMode = styleSel >= 5;
      int baseStyle = mixedMode ? 0 : styleSel;

      vec3 color = vec3(0.0);
      vec3 glowAccum = vec3(0.0);

      for (int i = 0; i < MAX_LAYERS; i++) {
        float fi = float(i);
        if (fi >= u_layers) break;

        float lane = fi / max(u_layers - 1.0, 1.0);
        float depth = 1.0 - fi / (u_layers + 1.0);
        float id = fi * 12.9898 + u_seed * 0.017 + 3.7;
        float hid = hash(id);
        float phase = hid * 6.2831853;

        int effStyle = baseStyle;
        if (mixedMode) {
          effStyle = int(floor(hash(id * 3.13 + 1.0) * 5.0));
          effStyle = effStyle > 4 ? 4 : effStyle;
        }

        float side = mix(-1.15, 1.15, lane);
        float y = p.y * (1.05 + 0.12 * lane) + lane * 0.75;
        float freq = 1.0 + u_twist * (0.55 + 0.22 * lane);

        float width = u_width * (0.75 + 0.4 * depth);
        float dx = 0.0;
        float shadeMul = 1.0;

        if (effStyle == 0) {
          // WAVE: layered sine ribbons drifting across the frame.
          float wave = sin(y * freq + t * (0.5 + lane * 0.4) + phase) * 0.72
            + sin(y * freq * 0.52 - t * 0.3 + phase * 1.7) * 0.28;
          float centerX = side + wave * u_swing;
          width *= (1.0 + u_taper * 0.35 * sin(y * 3.1 + phase));
          dx = p.x - centerX;
        } else if (effStyle == 1) {
          // SPIRAL: logarithmic spiral arms. Swing = tightness/spread of the
          // arm, Twist = rotation speed, Petals = number of interleaved arms.
          float r = length(p);
          float armCount = max(u_petals, 1.0);
          float theta = atan(p.y, p.x) * armCount;
          float armOffset = lane * 6.2831853 + phase * 0.3;
          float b = 0.10 + u_swing * 0.9;
          float thetaShift = theta + t * (0.16 + 0.05 * lane) * (0.3 + u_twist * 0.7) + armOffset;
          float idealTheta = (log(max(r, 0.02)) - log(0.10)) / b;
          float diff = thetaShift - idealTheta;
          diff -= 6.2831853 * floor(diff / 6.2831853 + 0.5);
          dx = diff * max(r, 0.05) / armCount;
          width *= (1.0 + 0.6 * r);
        } else if (effStyle == 2) {
          // ROSE: closed rhodonea-curve loop. Swing = overall loop radius,
          // Twist = rotation speed, Petals = lobe count.
          float r = length(p);
          float theta = atan(p.y, p.x) + t * (0.10 + 0.04 * lane) * (0.3 + u_twist * 0.7);
          float k = u_petals * (0.85 + 0.3 * hid);
          float r0 = (0.12 + u_swing * 0.85) * (0.5 + 0.5 * (fi + 1.0) / u_layers);
          float idealR = r0 * abs(cos(k * theta + phase));
          dx = r - idealR;
          width *= (0.65 + 0.55 * r0);
        } else if (effStyle == 3) {
          // BRAID: paired strands that smoothly swap sides, with a soft shade
          // pulse on the "under" pass to sell the woven over/under illusion.
          // Uses continuous sin() crossing (never sign()/step()) so the ribbon
          // never jumps discontinuously across a frame. Taper controls the
          // strength of the over/under shading contrast.
          float pair = mod(fi, 2.0) * 2.0 - 1.0;
          float wave = sin(y * freq + t * (0.5 + lane * 0.4) + phase) * 0.6;
          float crossFreq = 1.1 + u_weave * 1.6;
          float crossPhase = sin(y * crossFreq - t * 0.55 + phase);
          float centerX = side + wave * u_swing * 0.7 + pair * 0.12 * crossPhase;
          float shadeLo = mix(0.85, 0.30, u_taper);
          shadeMul = mix(shadeLo, 1.0, smoothstep(-1.0, 1.0, crossPhase * pair));
          dx = p.x - centerX;
        } else {
          // CALLIGRAPHY: brush-stroke width pulses with a pressure curve so
          // each pass tapers thin-thick-thin like ink from an angled nib.
          // Weave scales the secondary flow harmonic amplitude.
          float wave = sin(y * freq * 0.9 + t * (0.4 + lane * 0.35) + phase) * 0.68
            + sin(y * freq * 0.4 - t * 0.22 + phase * 2.0) * 0.22 * u_weave;
          float centerX = side + wave * u_swing * 0.85 + u_taper * 0.10 * sin(y * 0.6 + phase);
          float pressure = 0.3 + 0.85 * smoothstep(-1.0, 1.0, cos(y * freq * 1.1 + phase + t * 0.35));
          width *= mix(0.55, 1.55, pressure * u_taper + 0.35 * (1.0 - u_taper));
          dx = p.x - centerX;
        }

        float nd = dx / max(width, 1e-4);
        float edge = smoothstep(0.22, 0.98, abs(nd));
        float insideBand = smoothstep(1.0, 0.86, abs(nd));
        float glowVal = exp(-abs(abs(dx) - width) * (28.0 + 38.0 * u_glow)) * (0.4 + 0.6 * depth);
        float halo = exp(-abs(abs(dx) - width * 1.05) * (12.0 + 18.0 * u_glow));

        float styleHueBoost = mixedMode ? float(effStyle) * 46.0 : 0.0;
        float hueShift = u_hue + u_hueVar * (lane - 0.5) * 2.0 + styleHueBoost;
        vec3 layerCol = hsv2rgb(vec3(fract(hueShift / 360.0), clamp(u_sat, 0.15, 1.4), 1.0));

        float lit = 0.22 + 0.78 * pow(edge, 1.15);
        vec3 shadedCol = layerCol * (0.35 + 0.75 * lit) * shadeMul;
        float alpha = (0.3 + 0.34 * depth) * insideBand;
        color = over(color, shadedCol, alpha);

        glowAccum += layerCol * (glowVal * (0.22 + 0.85 * depth) + halo * 0.28) * (0.45 + 0.75 * u_glow) * shadeMul;
      }

      color += glowAccum;

      float vignette = smoothstep(1.5, 0.15, length(p * vec2(0.9, 1.0)));
      color *= vignette;
      color = color / (1.0 + color * 0.6);

      float grain = (hash21(gl_FragCoord.xy + u_time * 14.0 + u_seed) - 0.5) * u_grain;
      color += grain;

      color = clamp(color, 0.0, 1.0);
      color = pow(color, vec3(0.92));
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

function syncUniform(id) {
  const uniformKey = uniformById[id];
  if (!uniformKey || !uniforms[uniformKey]) return;
  if (id === "style") uniforms[uniformKey].value = normalizeStyleValue(params[id]);
  else uniforms[uniformKey].value = params[id];
}

function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
  bridge.extras.time = elapsed;
}

function snapshotState() {
  return JSON.stringify({ params: { ...params }, seed, time: elapsed, paused });
}

function renderFrame() {
  uniforms.u_time.value = elapsed;
  renderer.render(scene, camera);
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
    const value = normalizeParam(id, nextParams[id]);
    if (value === null) return;
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
      seed = Math.max(1, Math.floor(state.seed));
      uniforms.u_seed.value = seed;
    }
    if (typeof state.time === "number" && Number.isFinite(state.time)) {
      elapsed = state.time;
      uniforms.u_time.value = elapsed;
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
    const value = Number(quantized.toFixed(6));
    params[cfg.id] = cfg.id === "style" ? normalizeStyleValue(value) : value;
    syncUniform(cfg.id);
  });
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

function sendPreview() {
  renderFrame();
  const image = renderer.domElement.toDataURL("image/jpeg", 0.8);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

history.suppress = true;
const bridge = window.ShaderOpsControls.init({
  projectId: PROJECT_ID,
  schema: controlSchema,
  params,
  extras: { seed, paused, time: elapsed },
  onParams: (ids, nextParams, commit, prevValues) => {
    if (commit && !history.suppress) {
      const priorSnapshot = JSON.stringify({ params: prevValues || params, seed, time: elapsed, paused });
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
      seed = Math.max(1, Math.floor(nextExtras.seed));
      uniforms.u_seed.value = seed;
      changed = true;
    }
    if (typeof nextExtras.time === "number" && Number.isFinite(nextExtras.time) && nextExtras.time !== elapsed) {
      elapsed = nextExtras.time;
      uniforms.u_time.value = elapsed;
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
  seed = Math.max(1, Math.floor(bridge.extras.seed));
  uniforms.u_seed.value = seed;
}
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
if (typeof bridge.extras.time === "number" && Number.isFinite(bridge.extras.time)) {
  elapsed = bridge.extras.time;
  uniforms.u_time.value = elapsed;
}
delete bridge.extras.controls;
delete bridge.extras.panel;
delete bridge.extras.panelHidden;
delete bridge.extras.style;
syncExtras();
bridge.persist();
history.suppress = false;

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
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
  if (event.data?.type === "shaderops/request-preview" && (!event.data.projectId || event.data.projectId === PROJECT_ID)) {
    sendPreview();
  }
});

window.addEventListener("beforeunload", () => {
  syncExtras();
  bridge.persist();
  sendPreview();
});

function animate(nowMs) {
  requestAnimationFrame(animate);
  const now = nowMs * 0.001;
  const dt = Math.min(Math.max(now - lastTs, 0), 0.05);
  lastTs = now;
  if (!paused) elapsed += dt;
  uniforms.u_time.value = elapsed;
  renderer.render(scene, camera);

  if (nowMs - lastPersistAt > 1200) {
    syncExtras();
    bridge.persist();
    lastPersistAt = nowMs;
  }

  previewCooldown += dt;
  if (pendingPreview && previewCooldown > 0.45) {
    pendingPreview = false;
    previewCooldown = 0;
    sendPreview();
  }
}

requestAnimationFrame(animate);
sendPreview();

