import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "vfx-plasma-jet-thruster";
})();
const EFFECT_MODE = 5;
const REFERENCE_PRESET = {
  intensity: 1.74,
  speed: 1.08,
  bloom: 1.58,
  hue: 198,
  saturation: 1.08,
  hueRichness: 1.02,
  hueDrift: 0.68,
  p1: 1.22,
  p2: 1.24,
  p3: 1.08,
  p4: 1.2,
  grain: 0.09,
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
  { id: "p1", label: "Cone", group: "Effect", min: 0.4, max: 1.8, step: 0.01, default: REFERENCE_PRESET.p1 },
  { id: "p2", label: "Core", group: "Effect", min: 0.4, max: 1.8, step: 0.01, default: REFERENCE_PRESET.p2 },
  { id: "p3", label: "Ripple", group: "Effect", min: 0.4, max: 1.8, step: 0.01, default: REFERENCE_PRESET.p3 },
  { id: "p4", label: "Exhaust", group: "Effect", min: 0.4, max: 1.8, step: 0.01, default: REFERENCE_PRESET.p4 },
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
    #define EFFECT_MODE 5
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
      float drift = (u_time * 0.10 + sin(u_time * 0.31) * 0.14) * u_hueDrift;
      float hue = fract(u_hue/360.0 + drift + t*(0.08 + 0.18*richness));
      float sat = clamp(u_saturation * (0.76 + 0.44*richness), 0.3, 1.55);
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
        float r = length(uv);
        float rings = exp(-abs(r-(0.22+0.09*sin(t*0.9*u_p2))) * (42.0*u_p1));
        float glyph = smoothstep(0.66,0.96,noise(vec2(a*12.0*u_p4 + u_seed*0.001, r*18.0 - t*0.45*u_p3)));
        float halo = exp(-r*(4.0+u_p2*3.2));
        v = rings*glyph + halo*0.4;
        col = pal(0.72 + glyph*0.25)*v;
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
        q.y += 0.42;
        float rise = smoothstep(1.18, -0.08, q.y);
        float axisWarp =
          sin(q.y*(3.6 + 1.3*u_p3) - t*(1.0 + 0.35*u_p4)) * 0.055 * u_p4 +
          sin(q.y*(8.8 + 2.0*u_p2) + t*(0.55 + 0.15*u_p3)) * 0.022 * u_p3;
        q.x += axisWarp;
        float taperT = clamp((q.y + 0.18) / 1.28, 0.0, 1.0);
        float jetWidth = mix(0.20 + 0.10*u_p2, 0.62 + 0.18*u_p1, taperT);
        float nx = abs(q.x) / max(jetWidth, 1e-4);
        float sheath = smoothstep(1.0, 0.16, nx) * rise;
        float channel = exp(-nx * (10.0 + 7.0*u_p2)) * rise;
        float shellMask = smoothstep(1.02, 0.34, nx) * rise;
        float shockPhase = (q.y + 0.10) * (8.0 + 3.5*u_p2) - t * (2.2 + 0.55*u_p4);
        float shockWave = 0.5 + 0.5 * cos(shockPhase * 6.2831853);
        float shockDiamonds = pow(shockWave, 3.4) * exp(-nx * (1.8 + 0.4*u_p1)) * rise;
        float helixA = 0.5 + 0.5 * sin(q.y*(18.0 + 7.0*u_p3) - t*(4.4 + 0.8*u_p4) + q.x*(26.0 + 8.0*u_p4));
        float helixB = 0.5 + 0.5 * sin(q.y*(18.0 + 7.0*u_p3) - t*(4.4 + 0.8*u_p4) - q.x*(26.0 + 8.0*u_p4));
        float magneticShell = max(pow(helixA, 3.0), pow(helixB, 3.0)) * shellMask * smoothstep(1.10, 0.58, nx);
        float bladeA = abs(fract(q.y*(4.8 + 2.8*u_p3) - q.x*(3.4 + 2.0*u_p4) - t*(0.38 + 0.12*u_p2)) - 0.5) * 2.0;
        float bladeB = abs(fract(q.y*(4.8 + 2.8*u_p3) + q.x*(3.4 + 2.0*u_p4) - t*(0.38 + 0.12*u_p2)) - 0.5) * 2.0;
        float chevrons = smoothstep(0.48, 0.04, min(bladeA, bladeB)) * smoothstep(1.04, 0.44, nx) * rise;
        float prismCore = smoothstep(0.24, 0.02, abs(nx - (0.26 + 0.06*sin(q.y*9.0 - t*1.2))));
        float interference = 0.5 + 0.5 * sin(
          q.y*(28.0 + 10.0*u_p3) +
          sin(q.x*(14.0 + 6.0*u_p4)) * 1.6 -
          t*(5.0 + 1.0*u_p2)
        );
        float spine = exp(-abs(q.x) * (18.0 + 12.0*u_p2)) * (0.58 + 0.28 * interference + 0.24*prismCore) * rise;
        float tongues = pow(
          max(0.0, sin(q.y*(11.0 + 5.5*u_p3) - t*(3.2 + 0.8*u_p2) + q.x*(8.0 + 4.0*u_p4))),
          2.2
        ) * smoothstep(0.72, 0.10, nx) * rise;
        float exhaust = smoothstep(0.80, 0.97, noise(vec2(
          q.x*18.0 + shockDiamonds*4.0,
          q.y*14.0 - t*1.9*u_p4 + helixA*2.5
        ))) * smoothstep(0.42, 1.18, q.y + 0.14);
        v = sheath * (0.26 + 0.26*interference + 0.22*tongues) + spine*0.78 + shockDiamonds*0.30 + magneticShell*0.22 + chevrons*0.24;
        v += exhaust * shellMask * 0.14;
        float richness = clamp(u_hueRichness, 0.2, 2.2);
        float hueJitter = (noise(vec2(q.y*(9.0 + 2.0*u_p3), q.x*(11.0 + 4.0*u_p4) - t*0.22)) - 0.5)
          * (0.06 + 0.10*richness);
        float hueField = shockDiamonds*0.18 + magneticShell*0.18 + chevrons*0.16 + tongues*0.18 + hueJitter;
        vec3 cCore = pal(0.48 + hueField);
        vec3 cGeom = pal(0.63 + chevrons*0.16 + magneticShell*0.10 + hueField*0.95);
        vec3 cHot = pal(0.82 + spine*0.10 + shockDiamonds*0.08 + tongues*0.12 + hueField*0.78);
        vec3 jetCol = mix(cGeom, cCore, clamp(channel*0.78 + sheath*0.10 + prismCore*0.18, 0.0, 1.0));
        jetCol = mix(jetCol, cHot, clamp(shockDiamonds*0.34 + tongues*0.26 + exhaust*0.24, 0.0, 1.0));
        col = jetCol * v;
        col += cHot * spine * 0.12;
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
