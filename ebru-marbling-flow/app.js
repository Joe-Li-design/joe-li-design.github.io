import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "ebru-marbling-flow";
})();

const controlSchema = [
  { id: "speed", label: "Speed", group: "Global", min: 0.1, max: 2.5, step: 0.01, default: 0.8 },
  { id: "curl", label: "Drift", group: "Global", min: 0.1, max: 3.0, step: 0.01, default: 1.1 },
  { id: "grain", label: "Grain", group: "Global", min: 0, max: 0.15, step: 0.001, default: 0.015 },
  { id: "combTeeth", label: "Teeth", group: "Effect", min: 6, max: 60, step: 1, default: 26 },
  { id: "combForce", label: "Comb Force", group: "Effect", min: 0, max: 0.06, step: 0.0005, default: 0.028 },
  { id: "fade", label: "Fade", group: "Effect", min: 0.965, max: 0.9995, step: 0.0005, default: 0.992 },
  { id: "drops", label: "Drops", group: "Effect", min: 2, max: 6, step: 1, default: 5 },
  { id: "dropSize", label: "Drop Size", group: "Effect", min: 0.02, max: 0.12, step: 0.001, default: 0.055 },
  { id: "hue", label: "Hue", group: "Effect", min: 0, max: 360, step: 1, default: 20 },
  { id: "bright", label: "Bright", group: "Effect", min: 0.3, max: 1.8, step: 0.01, default: 1.05 },
];
const uniformById = {
  curl: "u_curl",
  fade: "u_fade",
  combTeeth: "u_combTeeth",
  combForce: "u_combForce",
  drops: "u_dropCount",
  dropSize: "u_dropSize",
  grain: "u_grain",
  bright: "u_bright",
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

let seed = 31771;
let paused = false;
let restoredTime = 0;

if (legacySavedState?.controls && typeof legacySavedState.controls === "object" && !legacySavedState.params) {
  controlSchema.forEach((cfg) => {
    const value = Number(legacySavedState.controls[cfg.id]);
    if (Number.isFinite(value)) params[cfg.id] = value;
  });
  if (typeof legacySavedState.seed === "number" && Number.isFinite(legacySavedState.seed)) {
    seed = Math.max(1, Math.floor(legacySavedState.seed));
  }
  if (typeof legacySavedState.time === "number" && Number.isFinite(legacySavedState.time)) {
    restoredTime = legacySavedState.time;
  }
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

let elapsed = restoredTime;
let lastTs = performance.now() * 0.001;

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

const PAPER_COLOR = new THREE.Vector3(0.95, 0.92, 0.85);
const DROP_MAX = 6;
const dropPosArray = Array.from({ length: DROP_MAX }, () => new THREE.Vector2(0.5, 0.5));
const dropHueArray = new Array(DROP_MAX).fill(0);

const seedMaterial = new THREE.ShaderMaterial({
  uniforms: { u_paper: { value: PAPER_COLOR } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }`,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform vec3 u_paper;
    void main(){ gl_FragColor = vec4(u_paper, 1.0); }
  `,
});

const simUniforms = {
  u_prev: { value: null },
  u_time: { value: elapsed },
  u_dt: { value: 0.016 },
  u_curl: { value: params.curl },
  u_fade: { value: params.fade },
  u_paper: { value: PAPER_COLOR },
  u_combTeeth: { value: params.combTeeth },
  u_combForce: { value: params.combForce },
  u_dropCount: { value: params.drops },
  u_dropPos: { value: dropPosArray },
  u_dropHue: { value: dropHueArray },
  u_dropSize: { value: params.dropSize },
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
    uniform vec3 u_paper;
    uniform float u_combTeeth;
    uniform float u_combForce;
    uniform int u_dropCount;
    uniform vec2 u_dropPos[6];
    uniform float u_dropHue[6];
    uniform float u_dropSize;

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
    vec3 hsv2rgb(vec3 c){
      vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
      vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
      return c.z*mix(K.xxx, clamp(p-K.xxx,0.0,1.0), c.y);
    }

    void main(){
      vec2 uv = vUv;
      vec2 vel = curlNoise(uv*u_curl + u_time*0.025) * 0.3;

      float combY = fract(u_time*0.045);
      float band = smoothstep(0.07, 0.0, abs(uv.y - combY));
      float teeth = sin(uv.x * u_combTeeth * 6.28318 + u_time*0.4);
      vel.x += teeth * band * u_combForce * 20.0;
      vel.y += band * 0.015;

      vec2 backUv = clamp(uv - vel*u_dt, 0.001, 0.999);
      vec3 prevColor = texture2D(u_prev, backUv).rgb;
      vec3 col = mix(u_paper, prevColor, u_fade);

      for(int i=0;i<6;i++){
        if(i >= u_dropCount) break;
        float d = length(uv - u_dropPos[i]);
        float influence = smoothstep(u_dropSize, u_dropSize*0.15, d);
        vec3 dropColor = hsv2rgb(vec3(u_dropHue[i], 0.72, 0.92));
        col = mix(col, dropColor, influence*0.85);
      }

      gl_FragColor = vec4(clamp(col,0.0,1.0), 1.0);
    }
  `,
});
const simMesh = new THREE.Mesh(quadGeo, simMaterial);
const simScene = new THREE.Scene();
simScene.add(simMesh);
const seedMesh = new THREE.Mesh(quadGeo, seedMaterial);
const seedScene = new THREE.Scene();
seedScene.add(seedMesh);

const displayUniforms = {
  u_dye: { value: null },
  u_time: { value: elapsed },
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
    uniform float u_bright;
    uniform float u_grain;

    float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }

    void main(){
      vec3 col = texture2D(u_dye, vUv).rgb * u_bright;
      float vign = smoothstep(0.98, 0.4, length(vUv-0.5));
      col *= mix(0.82, 1.0, vign);
      col += (hash21(gl_FragCoord.xy + u_time*61.0) - 0.5) * u_grain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
});
const displayMesh = new THREE.Mesh(quadGeo, displayMaterial);
const displayScene = new THREE.Scene();
displayScene.add(displayMesh);

function clearToPaper() {
  renderer.setRenderTarget(rtA);
  renderer.render(seedScene, camera);
  renderer.setRenderTarget(rtB);
  renderer.render(seedScene, camera);
  renderer.setRenderTarget(null);
}
clearToPaper();

function syncUniform(id) {
  const uniformKey = uniformById[id];
  if (!uniformKey) return;
  if (simUniforms[uniformKey]) {
    simUniforms[uniformKey].value = id === "drops" ? Math.round(params[id]) : params[id];
  }
  if (displayUniforms[uniformKey]) displayUniforms[uniformKey].value = params[id];
}

function updateDrops() {
  const count = Math.round(params.drops);
  for (let i = 0; i < DROP_MAX; i++) {
    const phase = i * 2.4 + seed * 0.00017;
    const t = elapsed * (0.05 + params.speed * 0.06);
    const x = 0.5 + 0.36 * Math.sin(t * 0.4 + phase) * Math.cos(t * 0.19 + phase * 1.2);
    const y = 0.5 + 0.36 * Math.cos(t * 0.33 + phase * 1.5);
    dropPosArray[i].set(x, y);
    dropHueArray[i] = (((params.hue + i * (360 / Math.max(count, 1)) + phase * 12) % 360) + 360) % 360 / 360;
  }
  simUniforms.u_dropCount.value = count;
}

function stepSimulation(dt) {
  updateDrops();
  simUniforms.u_prev.value = rtA.texture;
  simUniforms.u_time.value = elapsed;
  simUniforms.u_dt.value = dt;
  simUniforms.u_curl.value = params.curl;
  simUniforms.u_fade.value = params.fade;
  simUniforms.u_combTeeth.value = params.combTeeth;
  simUniforms.u_combForce.value = params.combForce;
  simUniforms.u_dropSize.value = params.dropSize;
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
  seed = Math.floor(Math.random() * 2147483646) + 1;
  clearToPaper();
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}

function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  clearToPaper();
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
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed) && Math.floor(nextExtras.seed) !== seed) {
      seed = Math.max(1, Math.floor(nextExtras.seed));
      clearToPaper();
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
  if (event.data?.type !== "shaderops/request-preview") return;
  if (event.data.projectId && event.data.projectId !== PROJECT_ID) return;
  sendPreview();
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
