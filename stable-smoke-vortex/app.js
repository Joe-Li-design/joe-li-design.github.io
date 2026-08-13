import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "stable-smoke-vortex";
})();

// Control schema — declared as data. The manager (top-level app) renders the
// actual control panel UI and talks to this project purely via the
// control-bridge postMessage protocol; this project no longer renders its
// own HUD DOM at all.
const controlSchema = [
  { id: "speed", label: "Speed", group: "Global", min: 0.1, max: 2.5, step: 0.01, default: 1.0 },
  { id: "turbulence", label: "Turbulence", group: "Global", min: 0, max: 2.0, step: 0.01, default: 0.55 },
  { id: "grain", label: "Grain", group: "Global", min: 0, max: 0.15, step: 0.001, default: 0.02 },
  { id: "vortexCount", label: "Count", group: "Vortex", min: 1, max: 8, step: 1, default: 5 },
  { id: "force", label: "Force", group: "Vortex", min: 0, max: 8, step: 0.05, default: 3.2 },
  { id: "decay", label: "Decay", group: "Vortex", min: 0.9, max: 0.999, step: 0.001, default: 0.985 },
  { id: "injectSize", label: "Inject Size", group: "Vortex", min: 0.05, max: 0.4, step: 0.005, default: 0.16 },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: 205 },
  { id: "sat", label: "Saturation", group: "Color", min: 0, max: 1, step: 0.01, default: 0.7 },
  { id: "bright", label: "Bright", group: "Color", min: 0.3, max: 2.0, step: 0.01, default: 1.1 },
  { id: "dyeFade", label: "Dye Fade", group: "Color", min: 0.9, max: 0.998, step: 0.001, default: 0.982 },
];
const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

const app = document.getElementById("app");

let paused = false;
let elapsed = 0;
let lastTs = performance.now() * 0.001;
let seed = 90210;
let pendingPreview = true;
let previewCooldown = 0;

// bridge.extras is a plain object snapshot the manager reads to sync the
// pause icon / persist checkpoints — it is only as fresh as the last time we
// wrote to it, so any local mutation of `seed`/`paused` must call this before
// notifyValuesChanged(), otherwise the manager keeps posting the stale value
// it was initialized with.
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

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadGeo = new THREE.PlaneGeometry(2, 2);
const JACOBI_ITERATIONS = 20;
const VORTEX_MAX = 8;
const SIM_SIZE = 384;
const TEXEL = new THREE.Vector2(1 / SIM_SIZE, 1 / SIM_SIZE);

const fbOptions = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false };
let velA = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, fbOptions);
let velB = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, fbOptions);
let presA = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, fbOptions);
let presB = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, fbOptions);
let divRT = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, fbOptions);
let dyeA = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, fbOptions);
let dyeB = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, fbOptions);

const vortexPos = Array.from({ length: VORTEX_MAX }, () => new THREE.Vector2(0.5, 0.5));
const vortexSign = new Array(VORTEX_MAX).fill(1);
const vortexHue = new Array(VORTEX_MAX).fill(0);

const passVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }`;

const noiseGLSL = `
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
`;

// Pass 1: velocity self-advection + vortex tangential force splats + curl turbulence.
const advectVelMaterial = new THREE.ShaderMaterial({
  uniforms: {
    u_vel: { value: null }, u_dt: { value: 0.016 }, u_decay: { value: params.decay },
    u_turbulence: { value: params.turbulence }, u_time: { value: 0 },
    u_vortexCount: { value: params.vortexCount }, u_vortexPos: { value: vortexPos },
    u_vortexSign: { value: vortexSign }, u_force: { value: params.force }, u_injectSize: { value: params.injectSize },
  },
  vertexShader: passVert,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D u_vel;
    uniform float u_dt, u_decay, u_turbulence, u_time, u_force, u_injectSize;
    uniform int u_vortexCount;
    uniform vec2 u_vortexPos[${VORTEX_MAX}];
    uniform float u_vortexSign[${VORTEX_MAX}];
    ${noiseGLSL}
    void main(){
      vec2 uv = vUv;
      vec2 vel = texture2D(u_vel, uv).rg;
      vec2 backUv = clamp(uv - vel*u_dt, 0.001, 0.999);
      vec2 advected = texture2D(u_vel, backUv).rg * u_decay;

      vec2 force = curlNoise(uv*3.0 + u_time*0.06) * u_turbulence;
      for(int i=0;i<${VORTEX_MAX};i++){
        if(i >= u_vortexCount) break;
        vec2 d = uv - u_vortexPos[i];
        float dist = length(d) + 0.0001;
        vec2 tangent = vec2(-d.y, d.x) / dist;
        float falloff = exp(-(dist*dist) / (u_injectSize*u_injectSize));
        force += tangent * u_vortexSign[i] * u_force * falloff;
      }
      gl_FragColor = vec4(advected + force*u_dt, 0.0, 1.0);
    }
  `,
});
// Pass 2: divergence of velocity field.
const divergenceMaterial = new THREE.ShaderMaterial({
  uniforms: { u_vel: { value: null }, u_texel: { value: TEXEL } },
  vertexShader: passVert,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D u_vel;
    uniform vec2 u_texel;
    void main(){
      float L = texture2D(u_vel, vUv - vec2(u_texel.x, 0.0)).x;
      float R = texture2D(u_vel, vUv + vec2(u_texel.x, 0.0)).x;
      float B = texture2D(u_vel, vUv - vec2(0.0, u_texel.y)).y;
      float T = texture2D(u_vel, vUv + vec2(0.0, u_texel.y)).y;
      float div = 0.5*((R-L) + (T-B));
      gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
  `,
});
// Pass 3: Jacobi pressure relaxation, iterated ~20x ping-pong.
const jacobiMaterial = new THREE.ShaderMaterial({
  uniforms: { u_pressure: { value: null }, u_divergence: { value: null }, u_texel: { value: TEXEL } },
  vertexShader: passVert,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D u_pressure;
    uniform sampler2D u_divergence;
    uniform vec2 u_texel;
    void main(){
      float L = texture2D(u_pressure, vUv - vec2(u_texel.x, 0.0)).x;
      float R = texture2D(u_pressure, vUv + vec2(u_texel.x, 0.0)).x;
      float B = texture2D(u_pressure, vUv - vec2(0.0, u_texel.y)).x;
      float T = texture2D(u_pressure, vUv + vec2(0.0, u_texel.y)).x;
      float div = texture2D(u_divergence, vUv).x;
      float p = (L + R + B + T - div) * 0.25;
      gl_FragColor = vec4(p, 0.0, 0.0, 1.0);
    }
  `,
});
// Pass 4: subtract pressure gradient to make velocity divergence-free.
const gradientSubtractMaterial = new THREE.ShaderMaterial({
  uniforms: { u_pressure: { value: null }, u_vel: { value: null }, u_texel: { value: TEXEL } },
  vertexShader: passVert,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D u_pressure;
    uniform sampler2D u_vel;
    uniform vec2 u_texel;
    void main(){
      float L = texture2D(u_pressure, vUv - vec2(u_texel.x, 0.0)).x;
      float R = texture2D(u_pressure, vUv + vec2(u_texel.x, 0.0)).x;
      float B = texture2D(u_pressure, vUv - vec2(0.0, u_texel.y)).x;
      float T = texture2D(u_pressure, vUv + vec2(0.0, u_texel.y)).x;
      vec2 vel = texture2D(u_vel, vUv).rg;
      vel -= 0.5 * vec2(R - L, T - B);
      gl_FragColor = vec4(vel, 0.0, 1.0);
    }
  `,
});
// Pass 5: advect dye through the divergence-free velocity field and inject vortex colors.
const advectDyeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    u_vel: { value: null }, u_dye: { value: null }, u_dt: { value: 0.016 }, u_dyeFade: { value: params.dyeFade },
    u_vortexCount: { value: params.vortexCount }, u_vortexPos: { value: vortexPos }, u_vortexHue: { value: vortexHue },
    u_injectSize: { value: params.injectSize },
  },
  vertexShader: passVert,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D u_vel;
    uniform sampler2D u_dye;
    uniform float u_dt, u_dyeFade, u_injectSize;
    uniform int u_vortexCount;
    uniform vec2 u_vortexPos[${VORTEX_MAX}];
    uniform float u_vortexHue[${VORTEX_MAX}];
    ${noiseGLSL}
    void main(){
      vec2 uv = vUv;
      vec2 vel = texture2D(u_vel, uv).rg;
      vec2 backUv = clamp(uv - vel*u_dt, 0.001, 0.999);
      vec3 dye = texture2D(u_dye, backUv).rgb * u_dyeFade;
      for(int i=0;i<${VORTEX_MAX};i++){
        if(i >= u_vortexCount) break;
        float d = length(uv - u_vortexPos[i]);
        float inject = smoothstep(u_injectSize*0.55, 0.0, d);
        dye += hsv2rgb(vec3(u_vortexHue[i], 0.85, 1.0)) * inject * 0.05;
      }
      gl_FragColor = vec4(dye, 1.0);
    }
  `,
});
// Pass 6: tone-mapped smoke display with hue/sat grading and grain.
const displayMaterial = new THREE.ShaderMaterial({
  uniforms: { u_dye: { value: null }, u_time: { value: 0 }, u_hue: { value: params.hue }, u_sat: { value: params.sat }, u_bright: { value: params.bright }, u_grain: { value: params.grain } },
  vertexShader: passVert,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D u_dye;
    uniform float u_time, u_hue, u_sat, u_bright, u_grain;
    float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    vec3 hsv2rgb(vec3 c){
      vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
      vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
      return c.z*mix(K.xxx, clamp(p-K.xxx,0.0,1.0), c.y);
    }
    void main(){
      vec3 raw = texture2D(u_dye, vUv).rgb;
      float intensity = clamp(length(raw)*0.9, 0.0, 1.6);
      vec3 tint = hsv2rgb(vec3(u_hue/360.0, u_sat, 1.0));
      vec3 col = mix(vec3(0.02,0.02,0.035), tint, clamp(intensity,0.0,1.0));
      col += raw * 0.35;
      col *= u_bright;
      float vign = smoothstep(1.05, 0.35, length(vUv-0.5));
      col *= mix(0.7, 1.0, vign);
      col += (hash21(gl_FragCoord.xy + u_time*71.0) - 0.5) * u_grain;
      gl_FragColor = vec4(clamp(col,0.0,1.0), 1.0);
    }
  `,
});

function makePass(material) { const scene = new THREE.Scene(); scene.add(new THREE.Mesh(quadGeo, material)); return scene; }
const advectVelScene = makePass(advectVelMaterial);
const divergenceScene = makePass(divergenceMaterial);
const jacobiScene = makePass(jacobiMaterial);
const gradientSubtractScene = makePass(gradientSubtractMaterial);
const advectDyeScene = makePass(advectDyeMaterial);
const displayScene = makePass(displayMaterial);

function clearAllTargets() {
  [velA, velB, presA, presB, divRT, dyeA, dyeB].forEach((rt) => { renderer.setRenderTarget(rt); renderer.clear(); });
  renderer.setRenderTarget(null);
}
clearAllTargets();

function updateVortices() {
  const count = Math.round(params.vortexCount);
  for (let i = 0; i < VORTEX_MAX; i++) {
    const phase = i * 1.9 + seed * 0.00013;
    const t = elapsed * (0.06 + params.speed * 0.05);
    const x = 0.5 + 0.34 * Math.sin(t * 0.5 + phase) * Math.cos(t * 0.21 + phase * 1.3);
    const y = 0.5 + 0.34 * Math.cos(t * 0.37 + phase * 1.6);
    vortexPos[i].set(x, y);
    vortexSign[i] = i % 2 === 0 ? 1 : -1;
    vortexHue[i] = (((params.hue + i * (300 / Math.max(count, 1)) + phase * 8) % 360) + 360) % 360 / 360;
  }
}

function stepSimulation(dt) {
  updateVortices();

  // 1) advect velocity + inject vortex/turbulence forces
  advectVelMaterial.uniforms.u_vel.value = velA.texture;
  advectVelMaterial.uniforms.u_dt.value = dt;
  advectVelMaterial.uniforms.u_decay.value = params.decay;
  advectVelMaterial.uniforms.u_turbulence.value = params.turbulence;
  advectVelMaterial.uniforms.u_time.value = elapsed;
  advectVelMaterial.uniforms.u_vortexCount.value = Math.round(params.vortexCount);
  advectVelMaterial.uniforms.u_force.value = params.force;
  advectVelMaterial.uniforms.u_injectSize.value = params.injectSize;
  renderer.setRenderTarget(velB);
  renderer.render(advectVelScene, camera);

  // 2) divergence of the (not yet incompressible) velocity field
  divergenceMaterial.uniforms.u_vel.value = velB.texture;
  renderer.setRenderTarget(divRT);
  renderer.render(divergenceScene, camera);

  // 3) Jacobi relaxation to solve the pressure Poisson equation
  renderer.setRenderTarget(presA); renderer.clear();
  jacobiMaterial.uniforms.u_divergence.value = divRT.texture;
  for (let i = 0; i < JACOBI_ITERATIONS; i++) {
    jacobiMaterial.uniforms.u_pressure.value = presA.texture;
    renderer.setRenderTarget(presB);
    renderer.render(jacobiScene, camera);
    const tmp = presA; presA = presB; presB = tmp;
  }

  // 4) subtract pressure gradient -> divergence-free velocity
  gradientSubtractMaterial.uniforms.u_pressure.value = presA.texture;
  gradientSubtractMaterial.uniforms.u_vel.value = velB.texture;
  renderer.setRenderTarget(velA);
  renderer.render(gradientSubtractScene, camera);

  // 5) advect dye through the divergence-free field, inject vortex color
  advectDyeMaterial.uniforms.u_vel.value = velA.texture;
  advectDyeMaterial.uniforms.u_dye.value = dyeA.texture;
  advectDyeMaterial.uniforms.u_dt.value = dt;
  advectDyeMaterial.uniforms.u_dyeFade.value = params.dyeFade;
  advectDyeMaterial.uniforms.u_vortexCount.value = Math.round(params.vortexCount);
  advectDyeMaterial.uniforms.u_injectSize.value = params.injectSize;
  renderer.setRenderTarget(dyeB);
  renderer.render(advectDyeScene, camera);
  renderer.setRenderTarget(null);

  const tmpDye = dyeA; dyeA = dyeB; dyeB = tmpDye;
}
function renderDisplay() {
  displayMaterial.uniforms.u_dye.value = dyeA.texture;
  displayMaterial.uniforms.u_time.value = elapsed;
  displayMaterial.uniforms.u_hue.value = params.hue;
  displayMaterial.uniforms.u_sat.value = params.sat;
  displayMaterial.uniforms.u_bright.value = params.bright;
  displayMaterial.uniforms.u_grain.value = params.grain;
  renderer.render(displayScene, camera);
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
  pendingPreview = true;
}
function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") applyParamsFromBridge(state.params, false);
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) seed = Math.max(1, Math.floor(state.seed));
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
  seed = Math.floor(Math.random() * 2147483646) + 1;
  clearAllTargets();
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}
function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  clearAllTargets();
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
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed)) { pushHistorySnapshot(); seed = Math.max(1, Math.floor(nextExtras.seed)); clearAllTargets(); pendingPreview = true; }
    if (typeof nextExtras.paused === "boolean" && nextExtras.paused !== paused) { pushHistorySnapshot(); paused = nextExtras.paused; }
  },
  actions: {
    randomizeAll: randomizeAllControls,
    rerollSeed,
    togglePause,
    undo: undoHistory,
    redo: redoHistory,
  },
});
// bridge.extras (loaded from localStorage, possibly merged over the initial
// { seed, paused }) is the source of truth after init — read it back so the
// simulation's local `seed`/`paused` variables reflect any persisted state.
if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) seed = Math.max(1, Math.floor(bridge.extras.seed));
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
clearAllTargets();
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
window.addEventListener("message", (event) => { if (event.data?.type === "shaderops/request-preview") sendPreview(); });
window.addEventListener("beforeunload", () => sendPreview());

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() * 0.001;
  const dt = Math.min(0.08, now - lastTs);
  lastTs = now;
  if (!paused) {
    elapsed += dt * (0.2 + params.speed);
    stepSimulation(dt * (0.5 + params.speed * 0.5));
  }
  renderDisplay();
  previewCooldown += dt;
  if (pendingPreview && previewCooldown > 0.45) { pendingPreview = false; previewCooldown = 0; sendPreview(); }
}
renderDisplay();
sendPreview();
animate();
