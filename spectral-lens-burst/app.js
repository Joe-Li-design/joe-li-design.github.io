import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = new URLSearchParams(location.search).get("project") || "spectral-lens-burst";

const controlSchema = [
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 2, step: 0.01, default: 0.22 },
  { id: "intensity", label: "Intensity", group: "Global", min: 0.2, max: 3, step: 0.01, default: 1.35 },
  { id: "sourceX", label: "Source X", group: "Composition", min: -0.65, max: 0.65, step: 0.01, default: -0.08 },
  { id: "sourceY", label: "Source Y", group: "Composition", min: -0.65, max: 0.65, step: 0.01, default: 0.03 },
  { id: "coreSize", label: "Core Size", group: "Composition", min: 0.02, max: 0.22, step: 0.002, default: 0.075 },
  { id: "rayCount", label: "Ray Count", group: "Rays", min: 8, max: 64, step: 1, default: 46 },
  { id: "rayLength", label: "Ray Length", group: "Rays", min: 0.2, max: 1.8, step: 0.01, default: 1.05 },
  { id: "rayWidth", label: "Ray Width", group: "Rays", min: 0.15, max: 2.2, step: 0.01, default: 0.82 },
  { id: "chaos", label: "Variation", group: "Rays", min: 0, max: 1, step: 0.01, default: 0.72 },
  { id: "prism", label: "Prism Blocks", group: "Optics", min: 0, max: 2, step: 0.01, default: 1.15 },
  { id: "ghosts", label: "Ghost Orbs", group: "Optics", min: 0, max: 2, step: 0.01, default: 0.52 },
  { id: "halo", label: "Halo", group: "Optics", min: 0, max: 2, step: 0.01, default: 0.68 },
  { id: "dispersion", label: "Dispersion", group: "Color", min: 0, max: 2, step: 0.01, default: 1.18 },
  { id: "hueShift", label: "Hue Shift", group: "Color", min: 0, max: 1, step: 0.005, default: 0.58 },
  { id: "saturation", label: "Saturation", group: "Color", min: 0, max: 1.5, step: 0.01, default: 0.92 },
  { id: "grain", label: "Film Grain", group: "Finish", min: 0, max: 0.18, step: 0.002, default: 0.055 },
  { id: "vignette", label: "Vignette", group: "Finish", min: 0, max: 1, step: 0.01, default: 0.62 },
  { id: "seed", label: "Seed", group: "Global", min: 0, max: 999, step: 0.1, default: 137.4 },
];

const params = {};
controlSchema.forEach((item) => { params[item.id] = item.default; });

let paused = false;
let bridge;
let pendingPreview = true;
let previewCooldown = 0;
const history = { undoStack: [], redoStack: [], limit: 120, suppress: false };

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("c"),
  antialias: false,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  u_time: { value: 0 },
  u_speed: { value: params.speed },
  u_intensity: { value: params.intensity },
  u_source: { value: new THREE.Vector2(params.sourceX, params.sourceY) },
  u_coreSize: { value: params.coreSize },
  u_rayCount: { value: params.rayCount },
  u_rayLength: { value: params.rayLength },
  u_rayWidth: { value: params.rayWidth },
  u_chaos: { value: params.chaos },
  u_prism: { value: params.prism },
  u_ghosts: { value: params.ghosts },
  u_halo: { value: params.halo },
  u_dispersion: { value: params.dispersion },
  u_hueShift: { value: params.hueShift },
  u_saturation: { value: params.saturation },
  u_grain: { value: params.grain },
  u_vignette: { value: params.vignette },
  u_seed: { value: params.seed },
};

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  varying vec2 vUv;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_speed;
  uniform float u_intensity;
  uniform vec2 u_source;
  uniform float u_coreSize;
  uniform float u_rayCount;
  uniform float u_rayLength;
  uniform float u_rayWidth;
  uniform float u_chaos;
  uniform float u_prism;
  uniform float u_ghosts;
  uniform float u_halo;
  uniform float u_dispersion;
  uniform float u_hueShift;
  uniform float u_saturation;
  uniform float u_grain;
  uniform float u_vignette;
  uniform float u_seed;

  #define PI 3.14159265359
  #define TAU 6.28318530718

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 spectral(float t) {
    vec3 c = 0.56 + 0.44 * cos(TAU * (t + vec3(0.02, 0.35, 0.68)));
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    return mix(vec3(luma), c, u_saturation);
  }

  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }

  float angularDistance(float a, float b) {
    return abs(atan(sin(a - b), cos(a - b)));
  }

  void main() {
    vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
    vec2 screenP = (vUv * 2.0 - 1.0) * aspect;
    vec2 source = u_source * aspect;
    vec2 p = screenP - source;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float t = u_time * u_speed;
    float breathe = 0.965 + 0.035 * sin(t * 0.43 + u_seed);

    vec3 background = vec3(0.010, 0.014, 0.040);
    background += vec3(0.012, 0.006, 0.028) * exp(-1.6 * r);
    vec3 col = background;

    // Low-frequency atmosphere behind the optical event.
    float atmosphere = exp(-r * 1.75) * (0.58 + 0.42 * sin(ang * 3.0 + u_seed));
    col += spectral(u_hueShift + 0.62) * atmosphere * 0.025;

    // Layer 1: many randomized radial beams. Each ray has independent angle,
    // width, start, reach, brightness, temporal phase and spectral color.
    for (int i = 0; i < 64; i++) {
      float fi = float(i);
      if (fi >= u_rayCount) break;
      float h0 = hash11(fi * 17.71 + u_seed * 1.13);
      float h1 = hash11(fi * 31.17 + u_seed * 2.07);
      float h2 = hash11(fi * 47.13 + u_seed * 3.11);
      float h3 = hash11(fi * 71.91 + u_seed * 0.79);
      float theta = TAU * h0 + 0.028 * sin(t * (0.18 + h3 * 0.2) + h2 * TAU);
      float width = mix(0.002, 0.032, h1 * h1) * u_rayWidth;
      float da = angularDistance(ang, theta);
      float aa = max(fwidth(da), 0.00045);
      float beam = 1.0 - smoothstep(width, width + aa * 2.0, da);
      float softBeam = exp(-da / max(width * 4.5, 0.003));

      float start = mix(0.035, 0.36, h2 * h2 * u_chaos);
      float reach = mix(0.34, 1.65, h3) * u_rayLength * breathe;
      float radialIn = smoothstep(start, start + 0.035 + h1 * 0.06, r);
      float radialOut = 1.0 - smoothstep(reach * 0.55, reach, r);
      float taper = pow(max(0.0, 1.0 - r / max(reach, 0.001)), mix(0.45, 2.4, h2));
      float flicker = 0.84 + 0.16 * sin(t * (0.35 + h1 * 0.5) + h0 * 20.0);

      vec3 rayColor = spectral(u_hueShift + h0 * u_dispersion + h2 * 0.15);
      float whiteCore = exp(-r * 5.5) * (0.25 + 0.75 * h3);
      rayColor = mix(rayColor, vec3(1.0, 0.97, 0.94), whiteCore);
      col += rayColor * beam * radialIn * radialOut * taper * flicker
        * mix(0.16, 1.25, h3 * h3);
      col += rayColor * softBeam * radialIn * radialOut * taper * flicker
        * mix(0.018, 0.13, h3) * u_dispersion;
    }

    // Layer 2: elongated glass/prism blocks, creating the blurred rectangular
    // spectral streaks visible in the reference.
    for (int i = 0; i < 28; i++) {
      float fi = float(i);
      float h0 = hash11(fi * 13.73 + u_seed * 4.17);
      float h1 = hash11(fi * 29.41 + u_seed * 1.91);
      float h2 = hash11(fi * 59.27 + u_seed * 0.63);
      float theta = TAU * h0 + sin(t * 0.12 + h1 * TAU) * 0.018;
      float dist = mix(0.18, 1.32, h1);
      vec2 center = vec2(cos(theta), sin(theta)) * dist;
      vec2 q = rot(-theta) * (p - center);
      vec2 size = vec2(mix(0.04, 0.30, h2), mix(0.008, 0.055, h0 * h0));
      float box = sdBox(q, size);
      float interior = 1.0 - smoothstep(-0.018, 0.025, box);
      float edgeGlow = exp(-abs(box) * 46.0);
      float outerGlow = exp(-max(box, 0.0) * 13.0);
      float glass = interior * 0.52 + edgeGlow * 0.24 + outerGlow * 0.14;
      vec3 prismColor = spectral(u_hueShift + h2 * u_dispersion + dist * 0.16);
      col += prismColor * glass * u_prism * mix(0.05, 0.42, h1);
    }

    // Layer 3: lens ghosts distributed along the source-to-optical-axis line.
    vec2 axis = -source;
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      float h0 = hash11(fi * 43.71 + u_seed * 2.33);
      float h1 = hash11(fi * 81.19 + u_seed * 5.17);
      vec2 gp = source + axis * mix(-0.8, 2.6, h0);
      float gr = length(screenP - gp);
      float radius = mix(0.025, 0.17, h1);
      float disc = exp(-pow(gr / radius, 3.0));
      float ring = exp(-abs(gr - radius * 0.78) * 55.0);
      vec3 ghostColor = spectral(u_hueShift + 0.22 + h0 * 0.85);
      col += ghostColor * (disc * 0.075 + ring * 0.035) * u_ghosts;
    }

    // Hero core: white-hot source, cyan/magenta corona and anamorphic streaks.
    float core = exp(-pow(r / max(u_coreSize * breathe, 0.002), 1.45));
    float corona = exp(-r / max(u_coreSize * 3.8, 0.01));
    float exposureHaze = exp(-pow(r / max(u_coreSize * 7.5, 0.02), 1.2));
    float haloRing = exp(-abs(r - u_coreSize * 2.2) / max(u_coreSize * 0.7, 0.003));
    float hStreak = exp(-abs(p.y) / max(u_coreSize * 0.09, 0.0008))
      * exp(-abs(p.x) / max(u_coreSize * 8.0, 0.01));
    float vStreak = exp(-abs(p.x) / max(u_coreSize * 0.15, 0.0008))
      * exp(-abs(p.y) / max(u_coreSize * 5.0, 0.01));
    col += vec3(1.0, 0.985, 0.94) * core * 3.8;
    col += vec3(0.32, 0.83, 1.0) * corona * 0.95;
    col += mix(vec3(0.18, 0.62, 1.0), vec3(1.0, 0.12, 0.68),
      0.5 + 0.5 * sin(ang * 3.0 + u_seed)) * exposureHaze * 0.22 * u_dispersion;
    col += spectral(u_hueShift + 0.28) * haloRing * 0.24 * u_halo;
    col += vec3(0.62, 0.82, 1.0) * hStreak * 1.4;
    col += vec3(1.0, 0.45, 0.86) * vStreak * 0.75;

    // Small high-frequency needle rays around the source.
    float needles = pow(max(0.0, sin(ang * 37.0 + sin(ang * 11.0 + u_seed) * 2.0)), 28.0);
    needles *= exp(-r * 7.0) * smoothstep(0.02, 0.08, r);
    col += spectral(u_hueShift + ang / TAU) * needles * 1.5;

    col *= u_intensity;

    // Filmic shoulder preserves color around the nearly-white core.
    col = col * (1.0 + col * 0.12) / (1.0 + col);
    col = pow(max(col, 0.0), vec3(0.86));

    // Edge control and subtle film grain.
    vec2 edge = vUv * (1.0 - vUv.yx);
    float vig = pow(clamp(edge.x * edge.y * 18.0, 0.0, 1.0), 0.28);
    col *= mix(1.0, vig, u_vignette);
    float grain = hash21(gl_FragCoord.xy + fract(t) * 173.0) - 0.5;
    col += grain * u_grain * (0.35 + 0.65 * (1.0 - core));

    gl_FragColor = vec4(col, 1.0);
  }
`;

const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
const clock = new THREE.Clock();

function syncUniforms() {
  uniforms.u_speed.value = Number(params.speed);
  uniforms.u_intensity.value = Number(params.intensity);
  uniforms.u_source.value.set(Number(params.sourceX), Number(params.sourceY));
  uniforms.u_coreSize.value = Number(params.coreSize);
  uniforms.u_rayCount.value = Number(params.rayCount);
  uniforms.u_rayLength.value = Number(params.rayLength);
  uniforms.u_rayWidth.value = Number(params.rayWidth);
  uniforms.u_chaos.value = Number(params.chaos);
  uniforms.u_prism.value = Number(params.prism);
  uniforms.u_ghosts.value = Number(params.ghosts);
  uniforms.u_halo.value = Number(params.halo);
  uniforms.u_dispersion.value = Number(params.dispersion);
  uniforms.u_hueShift.value = Number(params.hueShift);
  uniforms.u_saturation.value = Number(params.saturation);
  uniforms.u_grain.value = Number(params.grain);
  uniforms.u_vignette.value = Number(params.vignette);
  uniforms.u_seed.value = Number(params.seed);
  pendingPreview = true;
}

function snapshotState() {
  return JSON.stringify({ params: { ...params }, paused, time: uniforms.u_time.value });
}

function pushHistory(snapshot = snapshotState()) {
  if (history.suppress || history.undoStack[history.undoStack.length - 1] === snapshot) return;
  history.undoStack.push(snapshot);
  if (history.undoStack.length > history.limit) history.undoStack.shift();
  history.redoStack.length = 0;
}

function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    history.suppress = true;
    Object.keys(state.params || {}).forEach((id) => {
      if (id in params) params[id] = Number(state.params[id]);
    });
    if (typeof state.paused === "boolean") paused = state.paused;
    if (Number.isFinite(state.time)) uniforms.u_time.value = state.time;
    syncUniforms();
    bridge.extras.paused = paused;
    bridge.extras.time = uniforms.u_time.value;
    bridge.notifyValuesChanged();
  } finally {
    history.suppress = false;
  }
}

function undoHistory() {
  if (!history.undoStack.length) return;
  history.redoStack.push(snapshotState());
  applySnapshot(history.undoStack.pop());
}

function redoHistory() {
  if (!history.redoStack.length) return;
  history.undoStack.push(snapshotState());
  applySnapshot(history.redoStack.pop());
}

const flarePresets = [
  { rayCount: [42, 64], rayLength: [0.85, 1.45], rayWidth: [0.45, 1.05], prism: [0.9, 1.7], ghosts: [0.15, 0.7], halo: [0.45, 1.1] },
  { rayCount: [18, 38], rayLength: [1.05, 1.8], rayWidth: [0.18, 0.55], prism: [0.25, 0.8], ghosts: [0.5, 1.4], halo: [0.8, 1.7] },
  { rayCount: [30, 54], rayLength: [0.5, 1.05], rayWidth: [0.9, 1.8], prism: [1.25, 2.0], ghosts: [0.0, 0.5], halo: [0.2, 0.8] },
];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randomizeAll() {
  pushHistory();
  const preset = flarePresets[Math.floor(Math.random() * flarePresets.length)];
  params.seed = rand(0, 999);
  params.sourceX = rand(-0.34, 0.34);
  params.sourceY = rand(-0.25, 0.25);
  params.coreSize = rand(0.045, 0.12);
  params.rayCount = Math.round(rand(...preset.rayCount));
  params.rayLength = rand(...preset.rayLength);
  params.rayWidth = rand(...preset.rayWidth);
  params.prism = rand(...preset.prism);
  params.ghosts = rand(...preset.ghosts);
  params.halo = rand(...preset.halo);
  params.chaos = rand(0.45, 1);
  params.dispersion = rand(0.65, 1.75);
  params.hueShift = Math.random();
  params.saturation = rand(0.72, 1.18);
  params.intensity = rand(1.0, 1.85);
  Object.keys(params).forEach((id) => {
    const cfg = controlSchema.find((item) => item.id === id);
    if (cfg?.step) params[id] = Number((Math.round(params[id] / cfg.step) * cfg.step).toFixed(6));
  });
  syncUniforms();
  bridge.notifyValuesChanged();
}

function rerollSeed() {
  pushHistory();
  params.seed = Number(rand(0, 999).toFixed(1));
  syncUniforms();
  bridge.notifyValuesChanged();
}

function togglePause() {
  pushHistory();
  paused = !paused;
  bridge.extras.paused = paused;
  bridge.notifyValuesChanged();
}

function sendPreview() {
  renderer.render(scene, camera);
  const image = renderer.domElement.toDataURL("image/jpeg", 0.82);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

history.suppress = true;
bridge = window.ShaderOpsControls.init({
  projectId: PROJECT_ID,
  schema: controlSchema,
  params,
  extras: { paused, time: uniforms.u_time.value },
  onParams: (_ids, nextParams, commit, prevValues) => {
    if (commit && !history.suppress) {
      pushHistory(JSON.stringify({ params: prevValues || params, paused, time: uniforms.u_time.value }));
    }
    Object.keys(nextParams).forEach((id) => {
      if (!(id in params)) return;
      const value = Number(nextParams[id]);
      if (Number.isFinite(value)) params[id] = value;
    });
    syncUniforms();
  },
  onExtras: (extras) => {
    if (typeof extras.paused === "boolean") paused = extras.paused;
    if (Number.isFinite(extras.time)) uniforms.u_time.value = extras.time;
  },
  actions: {
    randomizeAll,
    rerollSeed,
    togglePause,
    undo: undoHistory,
    redo: redoHistory,
  },
});
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
if (Number.isFinite(bridge.extras.time)) uniforms.u_time.value = bridge.extras.time;
delete bridge.extras.controls;
delete bridge.extras.panel;
history.suppress = false;
syncUniforms();
bridge.persist();

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
  pendingPreview = true;
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat) {
    event.preventDefault();
    togglePause();
  }
  if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redoHistory(); else undoHistory();
  }
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "shaderops/request-preview") sendPreview();
});

window.addEventListener("beforeunload", () => {
  bridge.extras.paused = paused;
  bridge.extras.time = uniforms.u_time.value;
  bridge.persist();
  sendPreview();
});

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  if (!paused) uniforms.u_time.value += delta;
  renderer.render(scene, camera);
  previewCooldown += delta;
  if (pendingPreview && previewCooldown > 0.45) {
    pendingPreview = false;
    previewCooldown = 0;
    sendPreview();
  }
}

animate();
sendPreview();
