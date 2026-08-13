import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "luminous-strand-weave";
})();

const controlSchema = [
  { id: "intensity", label: "Power", group: "Global", min: 0.3, max: 2.6, step: 0.01, default: 1.5 },
  { id: "speed", label: "Speed", group: "Global", min: 0.0, max: 2.0, step: 0.01, default: 0.55 },
  { id: "bloom", label: "Bloom", group: "Global", min: 0.2, max: 2.2, step: 0.01, default: 1.5 },
  { id: "grain", label: "Grain", group: "Global", min: 0.0, max: 0.24, step: 0.001, default: 0.05 },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: 198 },
  { id: "saturation", label: "Sat", group: "Color", min: 0.2, max: 1.4, step: 0.01, default: 0.86 },
  { id: "p6", label: "Hue Var", group: "Color", min: 0.0, max: 1.6, step: 0.01, default: 0.55 },
  { id: "p1", label: "Strands", group: "Effect", min: 6, max: 34, step: 1, default: 20 },
  { id: "p2", label: "Concrete", group: "Effect", min: 0.0, max: 1.0, step: 0.01, default: 0.5 },
  { id: "p3", label: "Flow", group: "Effect", min: 0.0, max: 2.0, step: 0.01, default: 0.9 },
  { id: "p4", label: "Reach", group: "Effect", min: 0.4, max: 2.2, step: 0.01, default: 1.2 },
  { id: "p5", label: "Wisp", group: "Effect", min: 0.0, max: 1.6, step: 0.01, default: 0.65 },
];

const uniformById = {
  intensity: "u_intensity",
  speed: "u_speed",
  bloom: "u_bloom",
  grain: "u_grain",
  hue: "u_hue",
  saturation: "u_saturation",
  p1: "u_p1",
  p2: "u_p2",
  p3: "u_p3",
  p4: "u_p4",
  p5: "u_p5",
  p6: "u_p6",
};

const params = {};
controlSchema.forEach((cfg) => {
  params[cfg.id] = cfg.default;
});

const storageKey = `shaderops:settings:${PROJECT_ID}`;
const legacySavedState = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
})();

let seed = 481625739;
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
  u_intensity: { value: params.intensity },
  u_speed: { value: params.speed },
  u_bloom: { value: params.bloom },
  u_hue: { value: params.hue },
  u_saturation: { value: params.saturation },
  u_p1: { value: params.p1 },
  u_p2: { value: params.p2 },
  u_p3: { value: params.p3 },
  u_p4: { value: params.p4 },
  u_p5: { value: params.p5 },
  u_p6: { value: params.p6 },
  u_grain: { value: params.grain },
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
    #define MAX_STRANDS 34
    varying vec2 vUv;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_seed;
    uniform float u_intensity;
    uniform float u_speed;
    uniform float u_bloom;
    uniform float u_hue;
    uniform float u_saturation;
    uniform float u_p1;
    uniform float u_p2;
    uniform float u_p3;
    uniform float u_p4;
    uniform float u_p5;
    uniform float u_p6;
    uniform float u_grain;

    float hash11(float p){ p = fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p); }
    float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    float noise(vec2 p){
      vec2 i=floor(p), f=fract(p);
      float a=hash21(i), b=hash21(i+vec2(1,0)), c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));
      vec2 u=f*f*(3.0-2.0*f);
      return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
    }
    float fbm(vec2 p){
      float f=0.0, a=0.55;
      for(int i=0;i<5;i++){ f += a*noise(p); p = p*2.05 + vec2(17.1,29.7); a*=0.53; }
      return f;
    }
    vec3 hsv2rgb(vec3 c){
      vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
      vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
      return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
    }
    vec3 pal(float t){
      float spread = 0.06 + 0.16*u_p6;
      return hsv2rgb(vec3(fract(u_hue/360.0 + t*spread), clamp(u_saturation,0.2,1.4), 1.0));
    }

    void main(){
      vec2 uv = vUv*2.0-1.0;
      uv.x *= u_resolution.x/max(u_resolution.y,1.0);
      float t = u_time*(0.28 + u_speed*1.3);
      vec3 col = vec3(0.0);
      float v = 0.0;

      vec2 flowP = uv*1.3 + vec2(0.0, -t*0.05);
      vec2 warpOff = vec2(fbm(flowP + vec2(5.2,1.3)) - 0.5, fbm(flowP - vec2(3.1,7.7)) - 0.5);
      vec2 warped = uv + warpOff * (0.55 * u_p3);

      vec2 wq = uv*1.5 + vec2(t*0.03, -t*0.045);
      float wisp = fbm(wq);
      wisp = smoothstep(0.32, 0.92, wisp) * (0.5 + 0.5*fbm(wq*2.3 + 9.4));
      col += pal(0.6) * wisp * u_p5 * 0.55;
      v += wisp * u_p5 * 0.35;

      float lanes = u_p1;
      for(int i=0;i<MAX_STRANDS;i++){
        float fi = float(i);
        if(fi >= lanes) break;
        float s = fi*12.9898 + u_seed*0.0003;

        float ang = hash11(s*1.7)*6.2831853 + t*0.015*u_p3;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 perp = vec2(-dir.y, dir.x);
        vec2 center = (vec2(hash11(s*2.3), hash11(s*3.1))*2.0-1.0) * (0.85*u_p4);

        vec2 ql = warped - center;
        float along = dot(ql, dir);
        float across = dot(ql, perp);

        float freq = 2.1 + hash11(s*4.4)*3.3;
        float amp = (0.1 + hash11(s*5.5)*0.26) * (0.4 + u_p3*0.7);
        float phase = hash11(s*6.6)*6.2831853;
        float spd = 0.35 + hash11(s*7.7)*1.05;
        float wave = sin(along*freq + phase + t*spd) * amp;
        wave += sin(along*freq*2.6 + phase*1.6 - t*spd*1.35) * amp*0.22;

        float d = abs(across - wave);

        float halfLen = (0.32 + hash11(s*8.8)*0.7) * (0.55 + 0.85*u_p4);
        float edge = 0.12 + 0.2*u_p4;
        float windowMask = smoothstep(0.0, edge, halfLen - abs(along));

        float baseWidth = 0.05 + hash11(s*9.9)*0.09;
        float widthNoise = noise(vec2(along*0.4 + s*5.0, s*1.3));
        float widthVar = 0.65 + 0.3*sin(along*1.6 + s*3.0 + t*0.35*spd) + 0.2*widthNoise;
        float width = max(baseWidth * widthVar, 0.018);
        float halfW = width * 0.5;

        float concreteness = clamp(u_p2 + (hash11(s*10.1)-0.5)*0.5, 0.0, 1.0);

        float edgeSoft = mix(halfW*2.4, halfW*0.3, concreteness);
        float band = 1.0 - smoothstep(halfW - edgeSoft, halfW + edgeSoft, d);
        float texN = 0.78 + 0.22*noise(vec2(along*1.6 + s*4.0, across*7.0 + t*0.15));
        band *= texN;

        float coreLine = exp(-(d*d)/(halfW*halfW*0.1 + 1e-5)) * concreteness;

        float hazeWidth = width*3.0 + 0.02;
        float hazeNoise = 0.35 + 0.65*noise(vec2(along*0.5 + s*3.0, across*3.0 + t*0.08));
        float haze = exp(-(d*d)/(hazeWidth*hazeWidth) * 1.6) * hazeNoise * (1.0 - concreteness*0.55);

        float glint = pow(max(0.0, sin(along*9.0 + t*2.6*spd + s*3.0)), 36.0) * band * concreteness * 0.7;

        float strandV = band*0.9 + coreLine*0.6 + haze*0.55 + glint;
        strandV *= windowMask;

        vec3 strandCol = pal(0.4 + fi*0.05 + concreteness*0.1);
        col += strandCol * strandV;
        v += strandV;
      }

      col *= (0.5 + u_intensity*0.85);
      col += pal(0.58) * exp(-length(uv) * (2.6 - 0.6*u_bloom)) * (0.1 + 0.22*u_bloom);
      col = col / (1.0 + col);
      col = pow(col, vec3(1.02));
      col *= smoothstep(2.6, 0.3, length(uv));
      col += (hash21(gl_FragCoord.xy + t*97.0)-0.5) * u_grain;
      col = clamp(col, 0.0, 1.0);
      gl_FragColor = vec4(col,1.0);
    }
  `,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

function syncUniform(id) {
  const uniformKey = uniformById[id];
  if (uniformKey && uniforms[uniformKey]) uniforms[uniformKey].value = params[id];
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
    params[cfg.id] = Number(quantized.toFixed(6));
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
syncExtras();
bridge.persist();
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
  if (event.data?.type === "shaderops/request-preview" && event.data.projectId === PROJECT_ID) sendPreview();
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
  if (!paused) elapsed += dt * params.speed;
  uniforms.u_time.value = elapsed;
  renderFrame();

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

renderFrame();
sendPreview();
animate();
