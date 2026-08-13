import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "vfx-arcane-sigil-bloom";
})();
const EFFECT_MODE = 3;
const REFERENCE_PRESET = {
  intensity: 1.58,
  speed: 0.72,
  bloom: 1.5,
  hue: 282,
  saturation: 1.12,
  hueRichness: 1.05,
  hueDrift: 0.85,
  p1: 1.2,
  p2: 1.18,
  p3: 1.08,
  p4: 1.15,
  ringScale: 1.34,
  pattern: "rune",
  grain: 0.07,
};

const controlSchema = [
  { id: "intensity", label: "Power", group: "Global", min: 0.3, max: 2.6, step: 0.01, default: REFERENCE_PRESET.intensity },
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 2.0, step: 0.01, default: REFERENCE_PRESET.speed },
  { id: "bloom", label: "Bloom", group: "Global", min: 0.2, max: 2.2, step: 0.01, default: REFERENCE_PRESET.bloom },
  { id: "grain", label: "Grain", group: "Global", min: 0, max: 0.24, step: 0.001, default: REFERENCE_PRESET.grain },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: REFERENCE_PRESET.hue },
  { id: "saturation", label: "Sat", group: "Color", min: 0.3, max: 1.4, step: 0.01, default: REFERENCE_PRESET.saturation },
  { id: "hueRichness", label: "Hue Richness", group: "Color", min: 0.2, max: 2.2, step: 0.01, default: REFERENCE_PRESET.hueRichness },
  { id: "hueDrift", label: "Hue Drift", group: "Color", min: 0, max: 2, step: 0.01, default: REFERENCE_PRESET.hueDrift },
  { id: "p1", label: "Rune", group: "Effect", min: 0.4, max: 1.8, step: 0.01, default: REFERENCE_PRESET.p1 },
  { id: "p2", label: "Rings", group: "Effect", min: 0.4, max: 1.8, step: 0.01, default: REFERENCE_PRESET.p2 },
  { id: "p3", label: "Pulse", group: "Effect", min: 0.4, max: 1.8, step: 0.01, default: REFERENCE_PRESET.p3 },
  { id: "p4", label: "Etch", group: "Effect", min: 0.4, max: 1.8, step: 0.01, default: REFERENCE_PRESET.p4 },
  { id: "ringScale", label: "Ring Scale", group: "Effect", min: 0.7, max: 2.2, step: 0.01, default: REFERENCE_PRESET.ringScale },
  {
    id: "pattern",
    label: "Pattern",
    group: "Effect",
    type: "select",
    default: REFERENCE_PRESET.pattern,
    options: [
      { value: "rune", label: "Rune Noise" },
      { value: "lattice", label: "Lattice Grid" },
      { value: "petal", label: "Petal Bloom" },
      { value: "interference", label: "Wave Interference" },
    ],
  },
];
const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

const app = document.getElementById("app");

let paused = false;
let elapsed = 0;
let lastTs = performance.now() * 0.001;
let seed = 192837465;
let pendingPreview = true;
let previewCooldown = 0;

function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
}
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
  u_time: { value: 0 },
  u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  u_seed: { value: seed },
  u_intensity: { value: params.intensity },
  u_speed: { value: params.speed },
  u_bloom: { value: params.bloom },
  u_hue: { value: params.hue },
  u_saturation: { value: params.saturation },
  u_hueRichness: { value: params.hueRichness },
  u_hueDrift: { value: params.hueDrift },
  u_p1: { value: params.p1 },
  u_p2: { value: params.p2 },
  u_p3: { value: params.p3 },
  u_p4: { value: params.p4 },
  u_ringScale: { value: params.ringScale },
  u_pattern: { value: 0 },
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
    #define EFFECT_MODE 3
    varying vec2 vUv;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_seed;
    uniform float u_intensity;
    uniform float u_speed;
    uniform float u_bloom;
    uniform float u_hue;
    uniform float u_saturation;
    uniform float u_hueRichness;
    uniform float u_hueDrift;
    uniform float u_p1;
    uniform float u_p2;
    uniform float u_p3;
    uniform float u_p4;
    uniform float u_ringScale;
    uniform float u_pattern;
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
      for(int i=0;i<6;i++){ f += a*noise(p); p = p*2.03 + vec2(17.1,29.7); a*=0.52; }
      return f;
    }
    vec3 hsv2rgb(vec3 c){
      vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
      vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
      return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
    }
    vec3 pal(float t){
      float richness = clamp(u_hueRichness, 0.2, 2.2);
      float drift = (u_time * 0.12 + sin(u_time * 0.41) * 0.18) * u_hueDrift;
      float hue = fract(u_hue/360.0 + drift + t*(0.10 + 0.16*richness));
      float sat = clamp(u_saturation * (0.75 + 0.45*richness), 0.3, 1.55);
      return hsv2rgb(vec3(hue, sat, 1.0));
    }
    float lineDist(vec2 p, vec2 a, vec2 b){
      vec2 pa = p-a, ba = b-a;
      float h = clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
      return length(pa - ba*h);
    }

    void main(){
      vec2 uv = vUv*2.0-1.0;
      uv.x *= u_resolution.x/max(u_resolution.y,1.0);
      float t = u_time*(0.32 + u_speed*1.45);
      vec3 col = vec3(0.0);
      float v = 0.0;

      if(EFFECT_MODE == 0){
        vec2 q = uv;
        q += vec2(fbm(q*1.8 + t*0.17), fbm(q*1.7 - t*0.14))*0.22*u_p3;
        float fog = fbm(q*(1.9*u_p1) + vec2(0.0,t*0.22));
        float layer = fbm(q*(3.2*u_p2) - vec2(t*0.09,t*0.27));
        v = mix(fog, layer, 0.45) * smoothstep(1.35*u_p4, 0.25, length(uv));
        col = pal(v*0.7+0.12)*v;
      } else if(EFFECT_MODE == 1){
        vec2 q = uv;
        q.x += (fbm(q*3.4 + t*0.8)-0.5)*0.25*u_p4;
        float flame = fbm(vec2(q.x*2.4*u_p1, q.y*4.2 - t*1.35*u_p2));
        flame *= smoothstep(1.2, -0.5, q.y);
        float core = exp(-abs(q.x)*(8.0*u_p2))*smoothstep(0.8, -0.4, q.y);
        float ash = smoothstep(0.72,0.96,noise(vec2(q.x*14.0, q.y*10.0+t*0.8*u_p3)));
        v = flame*0.9 + core*0.8 + ash*0.25;
        col = mix(pal(0.04), pal(0.22), clamp(v,0.0,1.0))*v;
      } else if(EFFECT_MODE == 2){
        vec2 q = uv;
        float e = 0.0;
        float branches = 12.0 + u_p4*18.0;
        for(int i=0;i<30;i++){
          float fi = float(i);
          if(fi>=branches) break;
          float a = hash11(fi*7.1 + u_seed*0.0001)*6.2831853;
          vec2 dir = vec2(cos(a), sin(a));
          vec2 a0 = dir * (0.05 + hash11(fi*3.7)*0.3);
          vec2 b0 = dir * (0.75 + hash11(fi*5.9)*0.9);
          a0 += vec2(sin(t+fi)*0.08, cos(t*1.2+fi)*0.08)*u_p3;
          b0 += vec2(cos(t*0.7+fi)*0.12, sin(t*0.9+fi)*0.12)*u_p3;
          float d = lineDist(q, a0, b0);
          e += exp(-d*(120.0*u_p1));
        }
        float pulse = 0.55 + 0.45*sin(t*5.0*u_p2);
        v = e*0.09*pulse;
        col = pal(0.58 + v*0.2)*v;
      } else if(EFFECT_MODE == 3){
        float a = atan(uv.y, uv.x);
        float r = length(uv) / max(u_ringScale, 0.35);
        float ringBase = 0.24 + 0.11*sin(t*0.9*u_p2);
        float rings = exp(-abs(r-ringBase) * (42.0*u_p1));
        float glyph = 0.0;
        if (u_pattern < 0.5) {
          glyph = smoothstep(0.66,0.96,noise(vec2(a*12.0*u_p4 + u_seed*0.001, r*18.0 - t*0.45*u_p3)));
        } else if (u_pattern < 1.5) {
          float gridA = abs(sin(a * (8.0 + 10.0*u_p4) + t*0.32*u_p3));
          float gridR = abs(sin(r * (26.0 + 8.0*u_p2) - t*0.58*u_p3));
          glyph = smoothstep(0.50, 0.97, gridA * gridR);
        } else if (u_pattern < 2.5) {
          float petals = pow(max(cos(a * (6.0 + 10.0*u_p4) + t*0.36*u_p3), 0.0), 2.0);
          float radial = exp(-abs(r-(0.26 + 0.10*sin(t*0.7*u_p2))) * (20.0 + 22.0*u_p1));
          glyph = clamp(petals * (0.35 + radial * 1.25), 0.0, 1.0);
        } else {
          float w1 = sin(a*(11.0 + 9.0*u_p4) + r*(18.0 + 12.0*u_p2) - t*0.8*u_p3);
          float w2 = sin(a*(7.0 + 8.0*u_p1) - r*(22.0 + 8.0*u_p2) + t*0.55*u_p4);
          glyph = smoothstep(0.25, 0.95, 0.5 + 0.5*(w1*w2));
        }
        float halo = exp(-r*(3.2 + u_p2*2.4));
        float outerHalo = exp(-abs(r-(ringBase*1.75 + 0.06*sin(t*0.5*u_p3))) * (5.5 + 7.0*u_p1));
        v = rings*glyph + halo*0.52 + outerHalo*0.23;
        float richness = clamp(u_hueRichness, 0.2, 2.2);
        float hueRnd = fbm(vec2(a*(2.4 + 1.1*u_p4), r*(8.0 + 3.0*u_p2)) + vec2(t*0.11, -t*0.09) + vec2(u_seed*0.00031));
        float hueJitter = (hueRnd - 0.5) * (0.16 + 0.24*richness);
        float hueField =
          glyph*0.55 +
          sin(a*(3.0+2.0*u_p4) + t*0.28*u_p3)*0.22 +
          r*0.75 +
          hueJitter +
          sin(t*0.33) * 0.14 * u_hueDrift;
        vec3 cA = pal(0.58 + hueField);
        vec3 cB = pal(1.02 + hueField*1.25 + 0.18*sin(t*0.2 + hueJitter*2.0));
        float hueMix = clamp(
          0.5 + 0.5*sin(a*(4.0 + u_p4*4.0) - r*9.0 + t*0.45*u_p2 + hueJitter*3.0),
          0.0,
          1.0
        );
        col = mix(cA, cB, hueMix) * v;
      } else if(EFFECT_MODE == 4){
        vec2 q = uv;
        q += vec2(0.0, t*0.45*u_p2);
        float rays = 0.0;
        for(int i=0;i<80;i++){
          float fi=float(i);
          float zz = hash11(fi*11.7 + u_seed*0.0002);
          float a = hash11(fi*2.1)*6.2831853;
          vec2 dir = vec2(cos(a), sin(a));
          float depth = fract(zz - t*0.55*u_p4);
          vec2 pos = dir * (0.15 + depth*2.0*u_p3);
          float d = length(q-pos);
          rays += exp(-d*(32.0*u_p1))*(1.0-depth);
        }
        v = rays*0.045;
        col = pal(0.6 + v*0.2)*v;
      } else if(EFFECT_MODE == 5){
        vec2 q = uv;
        q.y += 0.35;
        float cone = exp(-abs(q.x)*(6.0*u_p1)) * smoothstep(1.0,-0.2,q.y);
        float rip = sin(q.y*18.0*u_p3 - t*10.0*u_p2 + q.x*7.0)*0.5+0.5;
        float plasma = fbm(vec2(q.x*3.4*u_p4, q.y*5.5 - t*1.8*u_p2));
        v = cone*(0.45 + rip*0.55) + plasma*0.35*cone;
        col = pal(0.48 + rip*0.2)*v;
      } else if(EFFECT_MODE == 6){
        vec2 q = uv;
        q += vec2(fbm(q*2.7+t*0.3)-0.5, fbm(q*2.2-t*0.24)-0.5)*0.3*u_p2;
        float tend = 0.0;
        float lanes = 8.0 + u_p1*12.0;
        for(int i=0;i<24;i++){
          float fi=float(i);
          if(fi>=lanes) break;
          float lane = -1.0 + 2.0*(fi/lanes);
          float wave = sin(q.y*(4.0+u_p3*6.0) + fi*1.3 + t*(0.8+u_p4))*0.22*u_p2;
          float d = abs(q.x - lane*0.35 - wave);
          tend += exp(-d*(28.0*u_p1))*smoothstep(1.1,-0.3,q.y+hash11(fi*4.7)*0.2);
        }
        v = tend*0.11;
        col = pal(0.82 + v*0.14)*v;
      } else if(EFFECT_MODE == 7){
        vec2 q = uv * (1.1 + u_p1*0.4);
        vec2 g = floor(q*8.0*u_p2);
        vec2 f = fract(q*8.0*u_p2)-0.5;
        float shard = 1.0;
        for(int j=-1;j<=1;j++){
          for(int i=-1;i<=1;i++){
            vec2 o = vec2(float(i), float(j));
            vec2 h = vec2(hash21(g+o), hash21(g+o+17.0)) - 0.5;
            vec2 d = o + h - f;
            shard = min(shard, length(d));
          }
        }
        float burst = exp(-abs(length(uv) - (0.25 + 0.18*sin(t*2.0*u_p3))) * (20.0*u_p4));
        v = smoothstep(0.0, 0.38, shard) * burst;
        col = pal(0.7 + shard*0.2)*v;
      } else if(EFFECT_MODE == 8){
        vec2 q = uv;
        q += vec2(fbm(q*3.1 + t*0.34)-0.5, fbm(q*2.8 - t*0.31)-0.5)*0.24*u_p2;
        float fluid = fbm(q*(3.6*u_p1) + t*0.36*u_p3);
        float spec = pow(max(0.0, 1.0-abs(dFdx(fluid))*2.2*u_p4), 4.0);
        float sparks = smoothstep(0.84,0.99,noise(vec2(q.x*24.0, q.y*18.0 - t*2.4*u_p3)));
        v = fluid*0.75 + spec*0.4 + sparks*0.5;
        col = mix(pal(0.1), pal(0.22), clamp(v,0.0,1.0))*v;
      } else {
        float a = atan(uv.y, uv.x);
        float r = length(uv);
        float rays = pow(max(cos(a*(24.0*u_p1) + t*0.4*u_p3),0.0), 3.0);
        float core = exp(-r*(8.0*u_p2));
        float pulse = exp(-abs(r-(0.22+0.09*sin(t*1.9*u_p4))) * (26.0*u_p3));
        v = rays*exp(-r*1.4) + core*0.95 + pulse*0.7;
        col = pal(0.74 + rays*0.2)*v;
      }

      col *= (0.72 + u_intensity*0.92);
      col += pal(0.6) * exp(-length(uv) * (3.0 - 0.8*u_bloom)) * (0.16 + 0.3*u_bloom);
      col = col / (1.0 + col);
      col = pow(col, vec3(1.03));
      col *= smoothstep(2.3, 0.35, length(uv));
      col += (hash21(gl_FragCoord.xy + t*97.0)-0.5) * u_grain;
      col = clamp(col, 0.0, 1.0);
      gl_FragColor = vec4(col,1.0);
    }
  `,
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

function applyParamsToUniforms() {
  uniforms.u_intensity.value = params.intensity;
  uniforms.u_speed.value = params.speed;
  uniforms.u_bloom.value = params.bloom;
  uniforms.u_hue.value = params.hue;
  uniforms.u_saturation.value = params.saturation;
  uniforms.u_hueRichness.value = params.hueRichness;
  uniforms.u_hueDrift.value = params.hueDrift;
  uniforms.u_p1.value = params.p1;
  uniforms.u_p2.value = params.p2;
  uniforms.u_p3.value = params.p3;
  uniforms.u_p4.value = params.p4;
  uniforms.u_ringScale.value = params.ringScale;
  uniforms.u_pattern.value =
    params.pattern === "lattice" ? 1 :
    params.pattern === "petal" ? 2 :
    params.pattern === "interference" ? 3 : 0;
  uniforms.u_grain.value = params.grain;
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
    const cfg = controlSchema.find((c) => c.id === id);
    if (cfg?.type === "select") {
      const raw = String(nextParams[id]);
      const allowed = Array.isArray(cfg.options) ? cfg.options.map((o) => o.value) : [];
      if (allowed.includes(raw)) params[id] = raw;
      return;
    }
    const n = Number(nextParams[id]);
    if (Number.isFinite(n)) params[id] = n;
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
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) {
      seed = Math.max(1, Math.floor(state.seed));
      uniforms.u_seed.value = seed;
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
    if (cfg.type === "select") {
      const opts = Array.isArray(cfg.options) ? cfg.options : [];
      if (opts.length) params[cfg.id] = opts[Math.floor(Math.random() * opts.length)].value;
      return;
    }
    const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
    const quantized = Math.round(raw / cfg.step) * cfg.step;
    params[cfg.id] = Number(quantized.toFixed(6));
  });
  applyParamsToUniforms();
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
      uniforms.u_seed.value = seed;
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
if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) {
  seed = Math.max(1, Math.floor(bridge.extras.seed));
  uniforms.u_seed.value = seed;
}
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
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
window.addEventListener("message", (event) => { if (event.data?.type === "shaderops/request-preview") sendPreview(); });
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