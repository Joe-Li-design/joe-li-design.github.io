import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "ink-fluid-lab";
})();
const STORAGE_KEY = `shaderops:settings:${PROJECT_ID}`;

const controlSchema = [
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 2.5, step: 0.01, default: 1.0 },
  { id: "curl", label: "Curl", group: "Effect", min: 0.1, max: 4.0, step: 0.01, default: 1.6 },
  { id: "grain", label: "Grain", group: "Effect", min: 0, max: 0.2, step: 0.001, default: 0.02 },
  { id: "hue", label: "Hue", group: "Effect", min: 0, max: 360, step: 1, default: 288 },
  { id: "saturation", label: "Sat", group: "Effect", min: 0.3, max: 1.5, step: 0.01, default: 0.9 },
  { id: "bright", label: "Bright", group: "Effect", min: 0.2, max: 2.2, step: 0.01, default: 1.1 },
  { id: "emitters", label: "Emitters", group: "Effect", min: 1, max: 7, step: 1, default: 4 },
  { id: "fade", label: "Fade", group: "Effect", min: 0.94, max: 0.998, step: 0.001, default: 0.985 },
  { id: "injectSize", label: "Ink Size", group: "Effect", min: 0.005, max: 0.05, step: 0.001, default: 0.02 },
];
const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

const legacySavedState = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
})();

let seed = 55219;
let paused = false;
let elapsed = 0;

if (legacySavedState?.controls && typeof legacySavedState.controls === "object" && !legacySavedState.params) {
  controlSchema.forEach((cfg) => {
    const value = Number(legacySavedState.controls[cfg.id]);
    if (Number.isFinite(value)) params[cfg.id] = value;
  });
  if (typeof legacySavedState.seed === "number" && Number.isFinite(legacySavedState.seed)) {
    seed = Math.max(1, Math.floor(legacySavedState.seed));
  }
  if (typeof legacySavedState.time === "number" && Number.isFinite(legacySavedState.time)) {
    elapsed = legacySavedState.time;
  }
  if (typeof legacySavedState.paused === "boolean") paused = legacySavedState.paused;
}

const app = document.getElementById("app");
let lastTs = performance.now() * 0.001;
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

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadGeo = new THREE.PlaneGeometry(2, 2);

const SIM_SIZE = 640;
const rtOptions = {
  type: THREE.HalfFloatType,
  format: THREE.RGBAFormat,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  wrapS: THREE.ClampToEdgeWrapping,
  wrapT: THREE.ClampToEdgeWrapping,
  depthBuffer: false,
  stencilBuffer: false,
};
let rtA = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOptions);
let rtB = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOptions);

const EMITTER_MAX = 7;
const emitterUniformArray = Array.from({ length: EMITTER_MAX }, () => new THREE.Vector2(0.5, 0.5));

const simUniforms = {
  u_prev: { value: null },
  u_time: { value: 0 },
  u_dt: { value: 0.016 },
  u_curl: { value: params.curl },
  u_fade: { value: params.fade },
  u_injectSize: { value: params.injectSize },
  u_emitterCount: { value: params.emitters },
  u_emitterPos: { value: emitterUniformArray },
};
const simMaterial = new THREE.ShaderMaterial({
  uniforms: simUniforms,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }`,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D u_prev;
    uniform float u_time;
    uniform float u_dt;
    uniform float u_curl;
    uniform float u_fade;
    uniform float u_injectSize;
    uniform int u_emitterCount;
    uniform vec2 u_emitterPos[7];

    float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    float noise2(vec2 p){
      vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      float a=hash21(i), b=hash21(i+vec2(1,0)), c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));
      return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
    }
    float fbm2(vec2 p){
      float f=0.0, a=0.55;
      for(int i=0;i<4;i++){ f += a*noise2(p); p = p*2.05 + 5.0; a*=0.5; }
      return f;
    }
    vec2 curlNoise(vec2 p){
      float e = 0.002;
      float n1 = fbm2(p + vec2(0.0, e));
      float n2 = fbm2(p - vec2(0.0, e));
      float n3 = fbm2(p + vec2(e, 0.0));
      float n4 = fbm2(p - vec2(e, 0.0));
      float dx = (n1 - n2) / (2.0*e);
      float dy = (n3 - n4) / (2.0*e);
      return vec2(dy, -dx);
    }

    void main(){
      vec2 uv = vUv;
      vec2 vel = curlNoise(uv*u_curl + u_time*0.06);
      vec2 backUv = clamp(uv - vel*u_dt*0.7, 0.001, 0.999);
      float prevDye = texture2D(u_prev, backUv).r;
      prevDye *= u_fade;
      for(int i=0;i<7;i++){
        if(i >= u_emitterCount) break;
        float d = length(uv - u_emitterPos[i]);
        float inject = smoothstep(u_injectSize, 0.0, d);
        prevDye += inject*1.3;
      }
      gl_FragColor = vec4(clamp(prevDye, 0.0, 6.0), 0.0, 0.0, 1.0);
    }
  `,
});
const simMesh = new THREE.Mesh(quadGeo, simMaterial);
const simScene = new THREE.Scene();
simScene.add(simMesh);

const displayUniforms = {
  u_dye: { value: null },
  u_time: { value: 0 },
  u_hue: { value: params.hue },
  u_saturation: { value: params.saturation },
  u_bright: { value: params.bright },
  u_grain: { value: params.grain },
};
const displayMaterial = new THREE.ShaderMaterial({
  uniforms: displayUniforms,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }`,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D u_dye;
    uniform float u_time;
    uniform float u_hue;
    uniform float u_saturation;
    uniform float u_bright;
    uniform float u_grain;

    float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    vec3 hsv2rgb(vec3 c){
      vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
      vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
      return c.z*mix(K.xxx, clamp(p-K.xxx,0.0,1.0), c.y);
    }

    void main(){
      float d = texture2D(u_dye, vUv).r;
      float shade = smoothstep(0.0, 1.7, d);
      vec3 col = hsv2rgb(vec3(fract(u_hue/360.0 + d*0.1), clamp(u_saturation,0.1,1.6), 0.04 + shade*u_bright*0.9));
      col += vec3(smoothstep(1.5, 3.2, d)) * 0.5;
      col += (hash21(gl_FragCoord.xy + u_time*113.0) - 0.5) * u_grain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
});
const displayMesh = new THREE.Mesh(quadGeo, displayMaterial);
const displayScene = new THREE.Scene();
displayScene.add(displayMesh);

const paramById = {
  speed: () => {},
  curl: (value) => { simUniforms.u_curl.value = value; },
  grain: (value) => { displayUniforms.u_grain.value = value; },
  hue: (value) => { displayUniforms.u_hue.value = value; },
  saturation: (value) => { displayUniforms.u_saturation.value = value; },
  bright: (value) => { displayUniforms.u_bright.value = value; },
  emitters: (value) => { simUniforms.u_emitterCount.value = Math.round(value); },
  fade: (value) => { simUniforms.u_fade.value = value; },
  injectSize: (value) => { simUniforms.u_injectSize.value = value; },
};

function syncParam(id) {
  const apply = paramById[id];
  if (typeof apply === "function") apply(params[id]);
}

function clearTargets() {
  renderer.setRenderTarget(rtA);
  renderer.clear();
  renderer.setRenderTarget(rtB);
  renderer.clear();
  renderer.setRenderTarget(null);
}
clearTargets();

function updateEmitters() {
  const count = Math.round(params.emitters);
  for (let i = 0; i < EMITTER_MAX; i++) {
    const phase = i * 1.9 + seed * 0.0002;
    const speedA = 0.3 + (i % 3) * 0.11;
    const speedB = 0.24 + (i % 4) * 0.09;
    const t = elapsed * (0.35 + params.speed * 0.4);
    const x = 0.5 + 0.34 * Math.sin(t * speedA + phase) * Math.cos(t * 0.17 + phase * 1.3);
    const y = 0.5 + 0.34 * Math.cos(t * speedB + phase * 1.7);
    emitterUniformArray[i].set(x, y);
  }
  simUniforms.u_emitterCount.value = count;
}

function stepSimulation(dt) {
  simUniforms.u_prev.value = rtA.texture;
  simUniforms.u_time.value = elapsed;
  simUniforms.u_dt.value = dt;
  simUniforms.u_curl.value = params.curl;
  simUniforms.u_fade.value = params.fade;
  simUniforms.u_injectSize.value = params.injectSize;
  updateEmitters();
  renderer.setRenderTarget(rtB);
  renderer.render(simScene, camera);
  renderer.setRenderTarget(null);
  const tmp = rtA;
  rtA = rtB;
  rtB = tmp;
}

function renderDisplay() {
  displayUniforms.u_dye.value = rtA.texture;
  displayUniforms.u_time.value = elapsed;
  displayUniforms.u_hue.value = params.hue;
  displayUniforms.u_saturation.value = params.saturation;
  displayUniforms.u_bright.value = params.bright;
  displayUniforms.u_grain.value = params.grain;
  renderer.render(displayScene, camera);
}

function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
  bridge.extras.time = elapsed;
}

function snapshotState() {
  return JSON.stringify({ params: { ...params }, seed, time: elapsed, paused });
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
    const value = Number(nextParams[id]);
    if (!Number.isFinite(value)) return;
    params[id] = value;
    syncParam(id);
  });
  pendingPreview = true;
}

function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") applyParamsFromBridge(state.params, false);
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) seed = Math.max(1, Math.floor(state.seed));
    if (typeof state.time === "number" && Number.isFinite(state.time)) elapsed = state.time;
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
    syncParam(cfg.id);
  });
  seed = Math.floor(Math.random() * 2147483646) + 1;
  clearTargets();
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}

function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  clearTargets();
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
  renderDisplay();
  const image = renderer.domElement.toDataURL("image/jpeg", 0.8);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

window.__shaderopsCheckpoints = {
  projectId: PROJECT_ID,
  getState: () => snapshotState(),
  applyState: (snapshot) => applySnapshot(snapshot),
};

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
    let shouldClearTargets = false;
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed) && Math.floor(nextExtras.seed) !== seed) {
      seed = Math.max(1, Math.floor(nextExtras.seed));
      shouldClearTargets = true;
      changed = true;
    }
    if (typeof nextExtras.time === "number" && Number.isFinite(nextExtras.time) && nextExtras.time !== elapsed) {
      elapsed = nextExtras.time;
      changed = true;
    }
    if (typeof nextExtras.paused === "boolean" && nextExtras.paused !== paused) {
      paused = nextExtras.paused;
      changed = true;
    }
    if (changed) {
      if (shouldClearTargets) clearTargets();
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
}
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
if (typeof bridge.extras.time === "number" && Number.isFinite(bridge.extras.time)) {
  elapsed = bridge.extras.time;
}
delete bridge.extras.controls;
delete bridge.extras.panel;
delete bridge.extras.panelHidden;
syncExtras();
bridge.persist();
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

window.addEventListener("beforeunload", () => {
  syncExtras();
  bridge.persist();
  sendPreview();
});

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() * 0.001;
  const dt = Math.min(0.08, now - lastTs);
  lastTs = now;
  if (!paused) {
    elapsed += dt * (0.2 + params.speed);
    stepSimulation(dt * (0.6 + params.speed * 0.4));
  }
  renderDisplay();

  const persistNow = performance.now();
  if (persistNow - lastPersistAt > 1200) {
    syncExtras();
    bridge.persist();
    lastPersistAt = persistNow;
  }

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
