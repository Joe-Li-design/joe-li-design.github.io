import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "gradient-sdf-contour";
})();

const PRESET = {
  speed: 0.7,
  scale: 1.0,
  circleRadius: 0.44,
  boxWidth: 0.31,
  boxHeight: 0.19,
  segmentLength: 1.08,
  segmentRadius: 0.12,
  shapeBlend: 0.24,
  shapeTwist: 0.28,
  offsetX: 0.18,
  offsetY: 0.08,
  contourFreq: 8.0,
  contourSharp: 1.2,
  warp: 0.52,
  hue: 208,
  saturation: 0.92,
  contrast: 1.08,
  glow: 0.85,
};

const schema = [
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 2.5, step: 0.01, default: PRESET.speed },
  { id: "scale", label: "Scale", group: "Global", min: 0.5, max: 2.2, step: 0.01, default: PRESET.scale },
  { id: "circleRadius", label: "Circle", group: "Shape", min: 0.18, max: 0.9, step: 0.01, default: PRESET.circleRadius },
  { id: "boxWidth", label: "Box W", group: "Shape", min: 0.1, max: 0.7, step: 0.01, default: PRESET.boxWidth },
  { id: "boxHeight", label: "Box H", group: "Shape", min: 0.08, max: 0.6, step: 0.01, default: PRESET.boxHeight },
  { id: "segmentLength", label: "Line Len", group: "Shape", min: 0.4, max: 2.2, step: 0.01, default: PRESET.segmentLength },
  { id: "segmentRadius", label: "Line Rad", group: "Shape", min: 0.03, max: 0.32, step: 0.01, default: PRESET.segmentRadius },
  { id: "shapeBlend", label: "Blend", group: "Shape", min: 0.04, max: 0.62, step: 0.01, default: PRESET.shapeBlend },
  { id: "shapeTwist", label: "Twist", group: "Shape", min: -1.2, max: 1.2, step: 0.01, default: PRESET.shapeTwist },
  { id: "offsetX", label: "Offset X", group: "Shape", min: -0.6, max: 0.6, step: 0.01, default: PRESET.offsetX },
  { id: "offsetY", label: "Offset Y", group: "Shape", min: -0.6, max: 0.6, step: 0.01, default: PRESET.offsetY },
  { id: "contourFreq", label: "Bands", group: "Effect", min: 2, max: 18, step: 0.1, default: PRESET.contourFreq },
  { id: "contourSharp", label: "Sharp", group: "Effect", min: 0.4, max: 3.0, step: 0.01, default: PRESET.contourSharp },
  { id: "warp", label: "Warp", group: "Effect", min: 0, max: 1.4, step: 0.01, default: PRESET.warp },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: PRESET.hue },
  { id: "saturation", label: "Sat", group: "Color", min: 0.2, max: 1.5, step: 0.01, default: PRESET.saturation },
  { id: "contrast", label: "Contrast", group: "Color", min: 0.5, max: 1.8, step: 0.01, default: PRESET.contrast },
  { id: "glow", label: "Glow", group: "Effect", min: 0, max: 2.0, step: 0.01, default: PRESET.glow },
];

const params = {};
schema.forEach((cfg) => {
  params[cfg.id] = cfg.default;
});

let paused = false;
let elapsed = 0;
let lastTs = performance.now() * 0.001;
let pendingPreview = true;
let previewCooldown = 0;
let seed = 982451653;

const history = { undoStack: [], redoStack: [], limit: 120, suppress: false };

const app = document.getElementById("app");
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
  u_hue: { value: params.hue },
  u_sat: { value: params.saturation },
  u_contrast: { value: params.contrast },
  u_scale: { value: params.scale },
  u_circleRadius: { value: params.circleRadius },
  u_boxWidth: { value: params.boxWidth },
  u_boxHeight: { value: params.boxHeight },
  u_segmentLength: { value: params.segmentLength },
  u_segmentRadius: { value: params.segmentRadius },
  u_shapeBlend: { value: params.shapeBlend },
  u_shapeTwist: { value: params.shapeTwist },
  u_offsetX: { value: params.offsetX },
  u_offsetY: { value: params.offsetY },
  u_contourFreq: { value: params.contourFreq },
  u_contourSharp: { value: params.contourSharp },
  u_warp: { value: params.warp },
  u_glow: { value: params.glow },
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
    uniform float u_hue;
    uniform float u_sat;
    uniform float u_contrast;
    uniform float u_scale;
    uniform float u_circleRadius;
    uniform float u_boxWidth;
    uniform float u_boxHeight;
    uniform float u_segmentLength;
    uniform float u_segmentRadius;
    uniform float u_shapeBlend;
    uniform float u_shapeTwist;
    uniform float u_offsetX;
    uniform float u_offsetY;
    uniform float u_contourFreq;
    uniform float u_contourSharp;
    uniform float u_warp;
    uniform float u_glow;

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    float hash1(float n) {
      return fract(sin(n) * 43758.5453123);
    }

    mat2 rot(float a) {
      float c = cos(a);
      float s = sin(a);
      return mat2(c, -s, s, c);
    }

    float sdCircle(vec2 p, float r) {
      return length(p) - r;
    }

    float sdBox(vec2 p, vec2 b) {
      vec2 q = abs(p) - b;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    }

    float sdSegment(vec2 p, vec2 a, vec2 b, float r) {
      vec2 pa = p - a;
      vec2 ba = b - a;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      return length(pa - ba * h) - r;
    }

    float smin(float a, float b, float k) {
      float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
      return mix(b, a, h) - k * h * (1.0 - h);
    }

    float shapeField(vec2 p, float t) {
      float j = hash1(u_seed * 0.000001 + 19.0);
      float twist = clamp(u_shapeTwist, -2.0, 2.0);
      float blend = clamp(u_shapeBlend, 0.01, 0.8);
      float lineLen = clamp(u_segmentLength, 0.2, 3.0);
      float lineRad = clamp(u_segmentRadius, 0.01, 0.6);
      vec2 box = vec2(clamp(u_boxWidth, 0.04, 1.2), clamp(u_boxHeight, 0.04, 1.2));
      float circleR = clamp(u_circleRadius, 0.05, 1.3);
      vec2 offset = vec2(clamp(u_offsetX, -1.0, 1.0), clamp(u_offsetY, -1.0, 1.0));

      vec2 q = p * rot(twist * sin(t * 0.4 + j * 6.2831));
      float d0 = sdCircle(q + vec2(0.14 * sin(t * 0.7), -0.05) - offset * 0.35, circleR + 0.05 * sin(t * 0.6));
      float d1 = sdBox((q - offset) * rot(0.5 + twist * 0.5 + 0.2 * sin(t * 0.5)), box);
      float d2 = sdSegment(q, vec2(-0.5 * lineLen, 0.0), vec2(0.5 * lineLen, 0.0), lineRad + 0.02 * sin(t * 0.9));

      float d = smin(d0, d1, blend);
      d = smin(d, d2, blend * 0.92);
      return d;
    }

    void main() {
      vec2 uv = vUv * 2.0 - 1.0;
      uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

      float t = u_time;
      float s = clamp(u_scale, 0.2, 3.0);
      float warpAmt = clamp(u_warp, 0.0, 2.0);
      float contourFreq = clamp(u_contourFreq, 0.5, 30.0);
      float contourSharp = clamp(u_contourSharp, 0.1, 6.0);
      float glow = clamp(u_glow, 0.0, 3.0);

      vec2 p = uv * s;
      vec2 flow = vec2(
        sin(p.y * 2.6 + t * 0.9) + cos(p.y * 3.8 - t * 0.52),
        cos(p.x * 2.2 - t * 0.75) - sin(p.x * 3.3 + t * 0.41)
      );
      p += flow * (0.08 * warpAmt);

      float d = shapeField(p, t);
      float interior = smoothstep(0.35, -0.28, d);
      float shell = exp(-abs(d) * (6.5 + 4.0 * contourSharp));
      float contour = pow(0.5 + 0.5 * sin(d * contourFreq * 6.2831 - t * 0.8), contourSharp);
      float vignette = smoothstep(2.0, 0.22, length(uv));

      float hueBase = fract(u_hue / 360.0 + 0.08 * sin(t * 0.13 + d * 4.0));
      vec3 cNear = hsv2rgb(vec3(fract(hueBase + 0.02), clamp(u_sat, 0.0, 1.8), 1.0));
      vec3 cMid = hsv2rgb(vec3(fract(hueBase + 0.15 + 0.06 * contour), clamp(u_sat * 0.88, 0.0, 1.8), 1.0));
      vec3 cFar = hsv2rgb(vec3(fract(hueBase + 0.31), clamp(u_sat * 0.72, 0.0, 1.8), 1.0));

      vec3 grad = mix(cFar, cMid, interior);
      grad = mix(grad, cNear, shell * (0.45 + 0.35 * glow));

      float bandSignal = contour * (0.35 + 0.45 * interior) + shell * 0.5;
      vec3 col = grad * (0.35 + 0.95 * bandSignal) * vignette;
      col += cNear * shell * glow * 0.35;
      col += cMid * contour * 0.18;

      col = pow(max(col, vec3(0.0)), vec3(1.0 / clamp(u_contrast, 0.3, 3.0)));

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float guard = smoothstep(0.03, 0.0, luma);
      col += vec3(0.07, 0.085, 0.11) * guard;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

function safe(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function applyParamsToUniforms() {
  params.speed = safe(params.speed, PRESET.speed, -4, 8);
  params.scale = safe(params.scale, PRESET.scale, -4, 8);
  params.circleRadius = safe(params.circleRadius, PRESET.circleRadius, -4, 8);
  params.boxWidth = safe(params.boxWidth, PRESET.boxWidth, -4, 8);
  params.boxHeight = safe(params.boxHeight, PRESET.boxHeight, -4, 8);
  params.segmentLength = safe(params.segmentLength, PRESET.segmentLength, -4, 8);
  params.segmentRadius = safe(params.segmentRadius, PRESET.segmentRadius, -4, 8);
  params.shapeBlend = safe(params.shapeBlend, PRESET.shapeBlend, -4, 8);
  params.shapeTwist = safe(params.shapeTwist, PRESET.shapeTwist, -8, 8);
  params.offsetX = safe(params.offsetX, PRESET.offsetX, -8, 8);
  params.offsetY = safe(params.offsetY, PRESET.offsetY, -8, 8);
  params.contourFreq = safe(params.contourFreq, PRESET.contourFreq, -20, 40);
  params.contourSharp = safe(params.contourSharp, PRESET.contourSharp, -10, 10);
  params.warp = safe(params.warp, PRESET.warp, -10, 10);
  params.hue = safe(params.hue, PRESET.hue, -7200, 7200);
  params.saturation = safe(params.saturation, PRESET.saturation, -4, 4);
  params.contrast = safe(params.contrast, PRESET.contrast, -4, 8);
  params.glow = safe(params.glow, PRESET.glow, -4, 8);

  uniforms.u_hue.value = params.hue;
  uniforms.u_sat.value = params.saturation;
  uniforms.u_contrast.value = params.contrast;
  uniforms.u_scale.value = params.scale;
  uniforms.u_circleRadius.value = params.circleRadius;
  uniforms.u_boxWidth.value = params.boxWidth;
  uniforms.u_boxHeight.value = params.boxHeight;
  uniforms.u_segmentLength.value = params.segmentLength;
  uniforms.u_segmentRadius.value = params.segmentRadius;
  uniforms.u_shapeBlend.value = params.shapeBlend;
  uniforms.u_shapeTwist.value = params.shapeTwist;
  uniforms.u_offsetX.value = params.offsetX;
  uniforms.u_offsetY.value = params.offsetY;
  uniforms.u_contourFreq.value = params.contourFreq;
  uniforms.u_contourSharp.value = params.contourSharp;
  uniforms.u_warp.value = params.warp;
  uniforms.u_glow.value = params.glow;
  uniforms.u_seed.value = seed;
}

function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
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
    params[id] = nextParams[id];
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
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) seed = Math.max(1, Math.floor(state.seed));
    if (typeof state.paused === "boolean") paused = state.paused;
    applyParamsToUniforms();
    pendingPreview = true;
    syncExtras();
    bridge.notifyValuesChanged();
  } finally {
    history.suppress = false;
  }
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
  schema.forEach((cfg) => {
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
  schema,
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

applyParamsToUniforms();

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
  if (event.data?.type === "shaderops/request-preview") sendPreview();
});

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
