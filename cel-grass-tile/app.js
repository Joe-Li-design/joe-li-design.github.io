import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "cel-grass-tile";
})();

const controlSchema = [
  { id: "speed", label: "Wind Speed", group: "Global", min: 0, max: 2, step: 0.01, default: 0.68 },
  { id: "wind", label: "Wind Bend", group: "Global", min: 0, max: 1.4, step: 0.01, default: 0.52 },
  { id: "bladeDensity", label: "Blade Density", group: "Global", min: 6, max: 36, step: 1, default: 20 },
  { id: "fieldSize", label: "Field Size", group: "Global", min: 4, max: 14, step: 0.1, default: 8.2 },
  { id: "bladeHeight", label: "Blade Height", group: "Global", min: 0.35, max: 1.9, step: 0.01, default: 0.92 },
  { id: "tipTaper", label: "Tip Taper", group: "Global", min: 0, max: 1, step: 0.01, default: 0.62 },
  { id: "cellLevels", label: "Toon Levels", group: "Global", min: 2, max: 7, step: 1, default: 4 },

  { id: "hue", label: "Hue", group: "Color", min: 70, max: 160, step: 1, default: 112 },
  { id: "saturation", label: "Saturation", group: "Color", min: 0.2, max: 1.4, step: 0.01, default: 0.92 },
  { id: "brightness", label: "Brightness", group: "Color", min: 0.2, max: 1.7, step: 0.01, default: 0.96 },
  { id: "hueVariance", label: "Hue Variance", group: "Color", min: 0, max: 0.22, step: 0.001, default: 0.055 },

  { id: "shadow", label: "Shadow Strength", group: "Effect", min: 0, max: 1.5, step: 0.01, default: 0.74 },
  { id: "ambient", label: "Ambient Lift", group: "Effect", min: 0, max: 1, step: 0.01, default: 0.26 },
  { id: "rim", label: "Rim Light", group: "Effect", min: 0, max: 1.5, step: 0.01, default: 0.35 },
  { id: "outline", label: "Outline Tint", group: "Effect", min: 0, max: 1, step: 0.01, default: 0.34 },
];

const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

const history = { undoStack: [], redoStack: [], limit: 140, suppress: false };
let paused = false;
let seed = Math.random() * 1000;
let elapsed = 0;
let lastTs = performance.now() / 1000;
let pendingPreview = true;
let previewCooldown = 0;

const app = document.getElementById("app");
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b120d");

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
camera.position.set(0, 4.8, 7.2);

const controls3d = new OrbitControls(camera, renderer.domElement);
controls3d.enableDamping = true;
controls3d.dampingFactor = 0.08;
controls3d.target.set(0, 0.45, 0);
controls3d.minDistance = 2.4;
controls3d.maxDistance = 18;
controls3d.maxPolarAngle = Math.PI * 0.48;
controls3d.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };

const sunDir = new THREE.Vector3(0.34, 0.88, 0.26).normalize();

const sharedUniforms = {
  u_time: { value: 0 },
  u_seed: { value: seed },
  u_hue: { value: params.hue },
  u_saturation: { value: params.saturation },
  u_brightness: { value: params.brightness },
  u_hueVariance: { value: params.hueVariance },
  u_wind: { value: params.wind },
  u_speed: { value: params.speed },
  u_tipTaper: { value: params.tipTaper },
  u_cellLevels: { value: params.cellLevels },
  u_shadow: { value: params.shadow },
  u_ambient: { value: params.ambient },
  u_rim: { value: params.rim },
  u_outline: { value: params.outline },
  u_sunDir: { value: sunDir.clone() },
  u_cameraPos: { value: camera.position.clone() },
};

const groundUniforms = {
  u_time: sharedUniforms.u_time,
  u_seed: sharedUniforms.u_seed,
  u_hue: sharedUniforms.u_hue,
  u_saturation: sharedUniforms.u_saturation,
  u_brightness: sharedUniforms.u_brightness,
  u_hueVariance: sharedUniforms.u_hueVariance,
  u_cellLevels: sharedUniforms.u_cellLevels,
  u_shadow: sharedUniforms.u_shadow,
  u_ambient: sharedUniforms.u_ambient,
  u_outline: sharedUniforms.u_outline,
  u_sunDir: sharedUniforms.u_sunDir,
};

const bladeUniforms = {
  u_time: sharedUniforms.u_time,
  u_seed: sharedUniforms.u_seed,
  u_hue: sharedUniforms.u_hue,
  u_saturation: sharedUniforms.u_saturation,
  u_brightness: sharedUniforms.u_brightness,
  u_hueVariance: sharedUniforms.u_hueVariance,
  u_wind: sharedUniforms.u_wind,
  u_speed: sharedUniforms.u_speed,
  u_tipTaper: sharedUniforms.u_tipTaper,
  u_cellLevels: sharedUniforms.u_cellLevels,
  u_shadow: sharedUniforms.u_shadow,
  u_ambient: sharedUniforms.u_ambient,
  u_rim: sharedUniforms.u_rim,
  u_outline: sharedUniforms.u_outline,
  u_sunDir: sharedUniforms.u_sunDir,
  u_cameraPos: sharedUniforms.u_cameraPos,
};

const commonColorFn = `
  vec3 hsl2rgb(vec3 hsl){
    float h = fract(hsl.x);
    float s = clamp(hsl.y, 0.0, 1.0);
    float l = clamp(hsl.z, 0.0, 1.0);
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c * 0.5;
    vec3 rgb;
    if (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else rgb = vec3(c, 0.0, x);
    return rgb + m;
  }
`;

const groundMaterial = new THREE.ShaderMaterial({
  uniforms: groundUniforms,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;

    uniform float u_time;
    uniform float u_seed;
    uniform float u_hue;
    uniform float u_saturation;
    uniform float u_brightness;
    uniform float u_hueVariance;
    uniform float u_cellLevels;
    uniform float u_shadow;
    uniform float u_ambient;
    uniform float u_outline;
    uniform vec3 u_sunDir;

    ${commonColorFn}

    float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec2 p = vWorldPos.xz * (0.85 + u_hueVariance * 12.0);
      vec2 id = floor(p);
      vec2 f = fract(p);
      float n = hash21(id + u_seed * 0.27);
      float patch = smoothstep(0.15, 0.86, n + (f.x - 0.5) * 0.2 + (f.y - 0.5) * 0.22);

      float levels = max(2.0, floor(u_cellLevels + 0.5));
      float q = floor(patch * levels) / max(levels - 1.0, 1.0);

      float ndotl = max(dot(normalize(vWorldNormal), normalize(u_sunDir)), 0.0);
      float lit = floor((ndotl * 0.75 + q * 0.6 + u_ambient) * levels) / levels;
      vec3 c0 = hsl2rgb(vec3(fract(u_hue / 360.0 + u_hueVariance * 0.25), clamp(u_saturation * 0.72, 0.0, 1.0), 0.22));
      vec3 c1 = hsl2rgb(vec3(fract(u_hue / 360.0), clamp(u_saturation, 0.0, 1.0), 0.42));
      vec3 c2 = hsl2rgb(vec3(fract(u_hue / 360.0 - u_hueVariance * 0.45), clamp(u_saturation * 0.92, 0.0, 1.0), 0.62));
      vec3 color = mix(c0, c1, smoothstep(0.1, 0.56, lit));
      color = mix(color, c2, smoothstep(0.45, 1.0, lit));

      float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      float line = 1.0 - smoothstep(0.02, 0.06, edge);
      color = mix(color, color * (0.52 - u_shadow * 0.24), line * u_outline);
      color *= mix(1.0, 1.0 - u_shadow * 0.48, smoothstep(0.0, 0.45, 1.0 - ndotl));
      color *= u_brightness;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
});

const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 24, 1, 1), groundMaterial);
ground.rotation.x = -Math.PI * 0.5;
ground.position.y = 0;
scene.add(ground);

let bladesMesh = null;

function buildBladeField() {
  if (bladesMesh) {
    scene.remove(bladesMesh);
    bladesMesh.geometry.dispose();
    bladesMesh.material.dispose();
    bladesMesh = null;
  }

  const count = Math.max(600, Math.round(params.bladeDensity * 190));
  const fieldHalf = params.fieldSize * 0.5;
  const baseGeom = new THREE.PlaneGeometry(0.12, 1.0, 4, 14);
  baseGeom.translate(0, 0.5, 0);

  const geom = new THREE.InstancedBufferGeometry();
  geom.index = baseGeom.index;
  geom.attributes.position = baseGeom.attributes.position;
  geom.attributes.uv = baseGeom.attributes.uv;
  geom.attributes.normal = baseGeom.attributes.normal;

  const offsets = new Float32Array(count * 3);
  const scales = new Float32Array(count * 2);
  const yaws = new Float32Array(count);
  const phases = new Float32Array(count);
  const tones = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const rx = (Math.random() * 2 - 1) * fieldHalf;
    const rz = (Math.random() * 2 - 1) * fieldHalf;
    const ri = i * 3;
    offsets[ri + 0] = rx;
    offsets[ri + 1] = 0;
    offsets[ri + 2] = rz;

    const si = i * 2;
    const randA = Math.random();
    const randB = Math.random();
    scales[si + 0] = THREE.MathUtils.lerp(0.62, 1.28, randA);
    scales[si + 1] = THREE.MathUtils.lerp(0.64, 1.42, randB) * params.bladeHeight;
    yaws[i] = Math.random() * Math.PI * 2;
    phases[i] = Math.random() * Math.PI * 2;
    tones[i] = Math.random();
  }

  geom.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
  geom.setAttribute("aScale", new THREE.InstancedBufferAttribute(scales, 2));
  geom.setAttribute("aYaw", new THREE.InstancedBufferAttribute(yaws, 1));
  geom.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
  geom.setAttribute("aTone", new THREE.InstancedBufferAttribute(tones, 1));
  geom.instanceCount = count;

  const material = new THREE.ShaderMaterial({
    uniforms: bladeUniforms,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 aOffset;
      attribute vec2 aScale;
      attribute float aYaw;
      attribute float aPhase;
      attribute float aTone;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vTone;

      uniform float u_time;
      uniform float u_wind;
      uniform float u_speed;
      uniform float u_tipTaper;

      mat3 rotY(float a){
        float s = sin(a), c = cos(a);
        return mat3(
          c, 0.0, -s,
          0.0, 1.0, 0.0,
          s, 0.0, c
        );
      }

      void main() {
        vUv = uv;
        vTone = aTone;

        vec3 p = position;
        p.x *= aScale.x;
        p.y *= aScale.y;

        float tip = clamp(vUv.y, 0.0, 1.0);
        float taperCurve = 1.0 - pow(tip, 1.0 + u_tipTaper * 2.6);
        float taper = mix(1.0, clamp(taperCurve, 0.05, 1.0), u_tipTaper);
        p.x *= taper;

        float sway = sin(u_time * (0.9 + u_speed) + aPhase + aOffset.x * 0.7 + aOffset.z * 0.35);
        float bend = sway * u_wind * pow(vUv.y, 1.6) * 0.38;
        float flutter = sin(u_time * 2.2 + aPhase * 1.7) * u_wind * pow(vUv.y, 2.2) * 0.09;
        p.x += bend + flutter;
        p.z += bend * 0.22;

        mat3 yaw = rotY(aYaw);
        vec3 localNormal = normalize(yaw * normal);
        vec3 localPos = yaw * p + aOffset;

        vec4 worldPos = modelMatrix * vec4(localPos, 1.0);
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(localNormal, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vTone;

      uniform float u_hue;
      uniform float u_saturation;
      uniform float u_brightness;
      uniform float u_hueVariance;
      uniform float u_cellLevels;
      uniform float u_shadow;
      uniform float u_ambient;
      uniform float u_rim;
      uniform float u_outline;
      uniform vec3 u_sunDir;
      uniform vec3 u_cameraPos;

      ${commonColorFn}

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(u_sunDir);
        vec3 V = normalize(u_cameraPos - vWorldPos);

        float ndotl = max(dot(N, L), 0.0);
        float levels = max(2.0, floor(u_cellLevels + 0.5));
        float toon = floor((ndotl + u_ambient + vTone * 0.15) * levels) / levels;

        float hue = fract(u_hue / 360.0 + (vTone - 0.5) * u_hueVariance);
        vec3 darkCol = hsl2rgb(vec3(hue + 0.01, clamp(u_saturation * 0.82, 0.0, 1.0), 0.18));
        vec3 midCol = hsl2rgb(vec3(hue, clamp(u_saturation, 0.0, 1.0), 0.36));
        vec3 lightCol = hsl2rgb(vec3(hue - 0.01, clamp(u_saturation * 0.95, 0.0, 1.0), 0.62));

        vec3 color = mix(darkCol, midCol, smoothstep(0.08, 0.45, toon));
        color = mix(color, lightCol, smoothstep(0.42, 1.0, toon));

        float tipGlow = smoothstep(0.55, 1.0, vUv.y) * (0.22 + toon * 0.3);
        color += tipGlow * lightCol * 0.22;

        float rim = pow(max(1.0 - dot(N, V), 0.0), 2.8) * u_rim;
        color += rim * lightCol * 0.35;

        float edge = min(vUv.x, 1.0 - vUv.x);
        float outline = 1.0 - smoothstep(0.08, 0.22, edge);
        color = mix(color, color * (0.45 - u_shadow * 0.2), outline * u_outline);
        color *= mix(1.0, 1.0 - u_shadow * 0.55, smoothstep(0.0, 0.35, 1.0 - ndotl));
        color *= u_brightness;
        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
      }
    `,
  });

  bladesMesh = new THREE.Mesh(geom, material);
  scene.add(bladesMesh);
  baseGeom.dispose();
  pendingPreview = true;
}

function applyUniformParams() {
  sharedUniforms.u_hue.value = params.hue;
  sharedUniforms.u_saturation.value = params.saturation;
  sharedUniforms.u_brightness.value = params.brightness;
  sharedUniforms.u_hueVariance.value = params.hueVariance;
  sharedUniforms.u_wind.value = params.wind;
  sharedUniforms.u_speed.value = params.speed;
  sharedUniforms.u_tipTaper.value = params.tipTaper;
  sharedUniforms.u_cellLevels.value = params.cellLevels;
  sharedUniforms.u_shadow.value = params.shadow;
  sharedUniforms.u_ambient.value = params.ambient;
  sharedUniforms.u_rim.value = params.rim;
  sharedUniforms.u_outline.value = params.outline;
}

function syncExtras() {
  bridge.extras.paused = paused;
  bridge.extras.seed = seed;
}

function snapshotState() {
  return JSON.stringify({ params: { ...params }, paused, seed });
}

function pushHistorySnapshot(explicitSnapshot) {
  if (history.suppress) return;
  const snap = explicitSnapshot !== undefined ? explicitSnapshot : snapshotState();
  if (history.undoStack[history.undoStack.length - 1] === snap) return;
  history.undoStack.push(snap);
  if (history.undoStack.length > history.limit) history.undoStack.shift();
  history.redoStack.length = 0;
}

function rebuildIfNeeded(prevParams, nextParams) {
  const keys = ["bladeDensity", "fieldSize", "bladeHeight"];
  return keys.some((k) => prevParams[k] !== nextParams[k]);
}

function applyParamsFromBridge(nextParams, recordHistory, prevValues) {
  const prev = prevValues || { ...params };
  if (recordHistory) pushHistorySnapshot();
  Object.keys(nextParams).forEach((id) => {
    if (params[id] === undefined) return;
    const n = Number(nextParams[id]);
    if (Number.isFinite(n)) params[id] = n;
  });
  applyUniformParams();
  if (rebuildIfNeeded(prev, params)) buildBladeField();
  pendingPreview = true;
}

function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") applyParamsFromBridge(state.params, false, params);
    if (typeof state.paused === "boolean") paused = state.paused;
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) {
      seed = state.seed;
      sharedUniforms.u_seed.value = seed;
    }
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
  const prev = { ...params };
  controlSchema.forEach((cfg) => {
    const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
    const quantized = Math.round(raw / cfg.step) * cfg.step;
    params[cfg.id] = Number(quantized.toFixed(6));
  });
  seed = Math.random() * 1000;
  sharedUniforms.u_seed.value = seed;
  applyUniformParams();
  if (rebuildIfNeeded(prev, params)) buildBladeField();
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}

function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.random() * 1000;
  sharedUniforms.u_seed.value = seed;
  buildBladeField();
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

function renderDisplay() {
  controls3d.update();
  sharedUniforms.u_cameraPos.value.copy(camera.position);
  renderer.render(scene, camera);
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
  extras: { paused, seed },
  onParams: (ids, nextParams, commit, prevValues) => {
    if (commit && !history.suppress) {
      const priorSnapshot = JSON.stringify({ params: prevValues || params, paused, seed });
      if (history.undoStack[history.undoStack.length - 1] !== priorSnapshot) {
        history.undoStack.push(priorSnapshot);
        if (history.undoStack.length > history.limit) history.undoStack.shift();
        history.redoStack.length = 0;
      }
    }
    applyParamsFromBridge(nextParams, false, prevValues || params);
  },
  onExtras: (nextExtras) => {
    if (typeof nextExtras.paused === "boolean" && nextExtras.paused !== paused) {
      pushHistorySnapshot();
      paused = nextExtras.paused;
      pendingPreview = true;
    }
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed) && nextExtras.seed !== seed) {
      pushHistorySnapshot();
      seed = nextExtras.seed;
      sharedUniforms.u_seed.value = seed;
      buildBladeField();
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

if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) {
  seed = bridge.extras.seed;
  sharedUniforms.u_seed.value = seed;
}
applyUniformParams();
buildBladeField();
bridge.attachCamera(camera, controls3d);
history.suppress = false;

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
  camera.updateProjectionMatrix();
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

window.addEventListener("beforeunload", () => sendPreview());

let middleShift = false;
renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button === 1 && event.shiftKey) {
    middleShift = true;
    controls3d.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
  }
}, { capture: true });

window.addEventListener("pointerup", () => {
  if (middleShift) {
    middleShift = false;
    controls3d.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
  }
});

window.dispatchEvent(new Event("resize"));

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() / 1000;
  const dt = Math.min(0.08, now - lastTs);
  lastTs = now;
  if (!paused) elapsed += dt;
  sharedUniforms.u_time.value = elapsed;
  renderDisplay();
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
