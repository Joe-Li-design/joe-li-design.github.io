import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "fractal-abyss";
})();
const STORAGE_KEY = `shaderops:settings:${PROJECT_ID}`;

const controlSchema = [
  { id: "speed", label: "Speed", group: "Global", min: 0.0, max: 2.0, step: 0.01, default: 0.4 },
  { id: "power", label: "Power", group: "Effect", min: 2.0, max: 12.0, step: 0.05, default: 8.0 },
  { id: "detail", label: "Detail", group: "Effect", min: 4, max: 11, step: 1, default: 9 },
  { id: "grain", label: "Grain", group: "Effect", min: 0.0, max: 0.24, step: 0.001, default: 0.045 },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: 286 },
  { id: "saturation", label: "Sat", group: "Color", min: 0.3, max: 1.4, step: 0.01, default: 0.82 },
  { id: "bright", label: "Bright", group: "Color", min: 0.2, max: 2.0, step: 0.01, default: 1.1 },
  { id: "shadow", label: "Shadow", group: "Effect", min: 4, max: 48, step: 0.5, default: 18 },
  { id: "glow", label: "Glow", group: "Effect", min: 0.0, max: 2.2, step: 0.01, default: 1.0 },
  { id: "zoom", label: "Zoom", group: "Effect", min: 1.6, max: 4.5, step: 0.01, default: 2.7 },
];

const uniformById = {
  power: "u_power",
  detail: "u_detail",
  grain: "u_grain",
  hue: "u_hue",
  saturation: "u_saturation",
  bright: "u_bright",
  shadow: "u_shadow",
  glow: "u_glow",
  zoom: "u_zoom",
};

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

let seed = 192837465;
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
  u_time: { value: restoredTime },
  u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  u_seed: { value: seed },
  u_power: { value: params.power },
  u_detail: { value: params.detail },
  u_shadow: { value: params.shadow },
  u_glow: { value: params.glow },
  u_zoom: { value: params.zoom },
  u_hue: { value: params.hue },
  u_saturation: { value: params.saturation },
  u_bright: { value: params.bright },
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
    varying vec2 vUv;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_seed;
    uniform float u_power;
    uniform float u_detail;
    uniform float u_shadow;
    uniform float u_glow;
    uniform float u_zoom;
    uniform float u_hue;
    uniform float u_saturation;
    uniform float u_bright;
    uniform float u_grain;

    float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    vec3 hsv2rgb(vec3 c){
      vec4 K = vec4(1.0,2.0/3.0,1.0/3.0,3.0);
      vec3 p = abs(fract(c.xxx+K.xyz)*6.0-K.www);
      return c.z*mix(K.xxx, clamp(p-K.xxx,0.0,1.0), c.y);
    }

    float mapTrap;
    float map(vec3 pos){
      vec3 z = pos;
      float dr = 1.0;
      float r = 0.0;
      float trap = 1e5;
      int iters = int(clamp(u_detail, 3.0, 11.0));
      for(int i=0;i<11;i++){
        if(i>=iters) break;
        r = length(z);
        trap = min(trap, r);
        if(r > 2.2) break;
        float theta = acos(clamp(z.z/max(r,1e-5), -1.0, 1.0));
        float phi = atan(z.y, z.x);
        dr = pow(r, u_power-1.0) * u_power * dr + 1.0;
        float zr = pow(r, u_power);
        theta *= u_power; phi *= u_power;
        z = zr * vec3(sin(theta)*cos(phi), sin(theta)*sin(phi), cos(theta));
        z += pos;
      }
      mapTrap = trap;
      return 0.5 * log(max(r,1e-4)) * r / max(dr, 1e-4);
    }

    vec3 calcNormal(vec3 p){
      vec2 e = vec2(0.0016, 0.0);
      return normalize(vec3(
        map(p+e.xyy)-map(p-e.xyy),
        map(p+e.yxy)-map(p-e.yxy),
        map(p+e.yyx)-map(p-e.yyx)
      ));
    }
    float softShadow(vec3 ro, vec3 rd, float k){
      float res = 1.0;
      float t = 0.02;
      for(int i=0;i<28;i++){
        float h = map(ro+rd*t);
        res = min(res, k*h/max(t,1e-4));
        t += clamp(h, 0.01, 0.2);
        if(res < 0.02 || t > 4.0) break;
      }
      return clamp(res, 0.0, 1.0);
    }

    void main(){
      vec2 uv = vUv*2.0-1.0;
      float aspect = u_resolution.x/max(u_resolution.y,1.0);
      uv.x *= aspect;
      float t = u_time;
      float seedOff = fract(u_seed*0.0001)*6.28318;

      float ang = t*0.18 + seedOff;
      vec3 ro = vec3(sin(ang), 0.32*sin(t*0.11), cos(ang)) * u_zoom;
      vec3 target = vec3(0.0);
      vec3 fwd = normalize(target-ro);
      vec3 right = normalize(cross(fwd, vec3(0.0,1.0,0.0)));
      vec3 up = cross(right, fwd);
      vec3 rd = normalize(fwd + uv.x*right*0.9 + uv.y*up*0.9);

      vec3 lightDir = normalize(vec3(0.6, 0.7, -0.4));
      vec3 col = vec3(0.02, 0.01, 0.03);
      float dist = 0.0;
      float hitT = -1.0;
      float ao = 1.0;
      float trapOut = 1.0;
      int steps = 90;
      for(int i=0;i<90;i++){
        vec3 p = ro + rd*dist;
        float h = map(p);
        if(h < 0.0015){ hitT = dist; trapOut = mapTrap; ao = 1.0 - float(i)/float(steps); break; }
        dist += h * 0.72;
        if(dist > 6.0) break;
      }

      if(hitT > 0.0){
        vec3 p = ro + rd*hitT;
        vec3 n = calcNormal(p);
        float diff = clamp(dot(n, lightDir), 0.0, 1.0);
        float sh = softShadow(p+n*0.004, lightDir, u_shadow);
        float rim = pow(1.0-max(dot(n,-rd),0.0), 3.0);
        vec3 base = hsv2rgb(vec3(fract(u_hue/360.0 + trapOut*0.6), clamp(u_saturation,0.2,1.5), 1.0));
        vec3 rimCol = hsv2rgb(vec3(fract(u_hue/360.0 + 0.5), clamp(u_saturation,0.2,1.5), 1.0));
        col = base * (0.15 + diff*0.95*sh) * (0.4+ao*0.7);
        col += rimCol * rim * 0.7;
        col += base * pow(clamp(diff,0.0,1.0), 24.0) * sh * 0.8;
      } else {
        float star = pow(hash21(floor(rd.xy*400.0+seedOff)), 200.0);
        col += vec3(star)*0.8;
        col += hsv2rgb(vec3(fract(u_hue/360.0+0.55), 0.5, 1.0)) * pow(max(0.0, dot(rd, lightDir)), 8.0) * 0.25 * u_glow;
      }

      col *= (0.65 + u_bright*0.95);
      col = col/(1.0+col);
      col = pow(col, vec3(1.02));
      col += (hash21(gl_FragCoord.xy + t*97.0)-0.5) * u_grain;
      gl_FragColor = vec4(clamp(col,0.0,1.0), 1.0);
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
      seed = Math.max(1, Math.floor(state.seed));
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
  renderer.render(scene, camera);
}

function sendPreview() {
  renderFrame();
  const image = renderer.domElement.toDataURL("image/jpeg", 0.8);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

controlSchema.forEach((cfg) => syncUniform(cfg.id));
uniforms.u_seed.value = seed;
uniforms.u_time.value = restoredTime;

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
      seed = Math.max(1, Math.floor(nextExtras.seed));
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
  seed = Math.max(1, Math.floor(bridge.extras.seed));
  uniforms.u_seed.value = seed;
}
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
if (typeof bridge.extras.time === "number" && Number.isFinite(bridge.extras.time)) {
  uniforms.u_time.value = bridge.extras.time;
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
  uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
  pendingPreview = true;
});

window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "z") return;
  event.preventDefault();
  if (event.shiftKey) redoHistory(); else undoHistory();
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "shaderops/request-preview" && (!event.data.projectId || event.data.projectId === PROJECT_ID)) sendPreview();
});

window.addEventListener("beforeunload", () => {
  syncExtras();
  bridge.persist();
  sendPreview();
});

function animate() {
  requestAnimationFrame(animate);
  const nowSeconds = performance.now() * 0.001;
  const dt = Math.min(0.08, nowSeconds - lastTs);
  lastTs = nowSeconds;
  if (!paused) {
    uniforms.u_time.value += dt * (0.15 + params.speed);
  }
  renderFrame();

  const nowMs = performance.now();
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

renderFrame();
sendPreview();
animate();
