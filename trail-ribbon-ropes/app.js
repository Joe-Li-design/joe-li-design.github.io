import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.180.0/examples/jsm/controls/OrbitControls.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "trail-ribbon-ropes";
})();

const controlSchema = [
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 2, step: 0.01, default: 0.6 },
  { id: "ropeCount", label: "Rope Count", group: "Global", min: 1, max: 12, step: 1, default: 6 },
  { id: "trailLength", label: "Trail Length", group: "Global", min: 20, max: 220, step: 2, default: 120 },
  { id: "curlScale", label: "Curl Scale", group: "Global", min: 0.05, max: 1.2, step: 0.01, default: 0.32 },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: 322 },
  { id: "sat", label: "Sat", group: "Color", min: 0, max: 1.4, step: 0.01, default: 0.88 },
  { id: "hueSpread", label: "Hue Spread", group: "Color", min: 0, max: 180, step: 1, default: 70 },
  { id: "ribbonWidth", label: "Ribbon Width", group: "Effect", min: 0.02, max: 0.5, step: 0.005, default: 0.16 },
  { id: "taper", label: "Taper", group: "Effect", min: 0, max: 1, step: 0.01, default: 0.15 },
  { id: "glow", label: "Glow Intensity", group: "Effect", min: 0, max: 2.5, step: 0.01, default: 1.2 },
  { id: "turbulence", label: "Turbulence", group: "Effect", min: 0, max: 3, step: 0.01, default: 1.15 },
];
const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

const app = document.getElementById("app");

let paused = false;
let seed = Math.random() * 1000;
let pendingPreview = true;
let previewCooldown = 0;
let runTime = 0;

function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
}
const history = { undoStack: [], redoStack: [], limit: 140, suppress: false };

// ---------------------------------------------------------------------------
// Perlin 3D + curl-noise field (see curl-noise-flow-field for shared design
// notes) — duplicated locally since standalone projects don't share JS
// modules beyond the control-bridge script.
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class Perlin3D {
  constructor(seedValue) {
    const rand = mulberry32(Math.floor(seedValue * 10000) >>> 0);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) p[i] = i;
    for (let i = 255; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i += 1) this.perm[i] = p[i & 255];
  }
  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  static lerp(t, a, b) { return a + t * (b - a); }
  static grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  noise(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = Perlin3D.fade(x), v = Perlin3D.fade(y), w = Perlin3D.fade(z);
    const p = this.perm;
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return Perlin3D.lerp(w,
      Perlin3D.lerp(v,
        Perlin3D.lerp(u, Perlin3D.grad(p[AA], x, y, z), Perlin3D.grad(p[BA], x - 1, y, z)),
        Perlin3D.lerp(u, Perlin3D.grad(p[AB], x, y - 1, z), Perlin3D.grad(p[BB], x - 1, y - 1, z))),
      Perlin3D.lerp(v,
        Perlin3D.lerp(u, Perlin3D.grad(p[AA + 1], x, y, z - 1), Perlin3D.grad(p[BA + 1], x - 1, y, z - 1)),
        Perlin3D.lerp(u, Perlin3D.grad(p[AB + 1], x, y - 1, z - 1), Perlin3D.grad(p[BB + 1], x - 1, y - 1, z - 1))));
  }
}
let perlin = new Perlin3D(seed);
const EPS = 0.0012;
const OFFSET_X = 0, OFFSET_Y = 91.7, OFFSET_Z = 187.3;
function curlNoise(x, y, z, out) {
  const dPsiXdy = (perlin.noise(x, y + EPS, z + OFFSET_X) - perlin.noise(x, y - EPS, z + OFFSET_X)) / (2 * EPS);
  const dPsiXdz = (perlin.noise(x, y, z + EPS + OFFSET_X) - perlin.noise(x, y, z - EPS + OFFSET_X)) / (2 * EPS);
  const dPsiYdx = (perlin.noise(x + EPS, y, z + OFFSET_Y) - perlin.noise(x - EPS, y, z + OFFSET_Y)) / (2 * EPS);
  const dPsiYdz = (perlin.noise(x, y, z + EPS + OFFSET_Y) - perlin.noise(x, y, z - EPS + OFFSET_Y)) / (2 * EPS);
  const dPsiZdx = (perlin.noise(x + EPS, y, z + OFFSET_Z) - perlin.noise(x - EPS, y, z + OFFSET_Z)) / (2 * EPS);
  const dPsiZdy = (perlin.noise(x, y + EPS, z + OFFSET_Z) - perlin.noise(x, y - EPS, z + OFFSET_Z)) / (2 * EPS);
  out.set(dPsiZdy - dPsiYdz, dPsiXdz - dPsiZdx, dPsiYdx - dPsiXdy);
  return out;
}

function rand01(i, salt) {
  return THREE.MathUtils.euclideanModulo(Math.sin(i * 12.9898 + seed * 78.233 + salt * 37.719) * 43758.5453, 1);
}
function hue2rgbChannel(p, q, t) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * 6 * (2 / 3 - tt);
  return p;
}
function hslToColor(h, s, l, target) {
  const hh = h - Math.floor(h);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  target.setRGB(hue2rgbChannel(p, q, hh + 1 / 3), hue2rgbChannel(p, q, hh), hue2rgbChannel(p, q, hh - 1 / 3));
  return target;
}

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#05060c");
const camera = new THREE.PerspectiveCamera(44, 1, 0.05, 100);
camera.position.set(0, 0.8, 9.5);
const controls3d = new OrbitControls(camera, renderer.domElement);
controls3d.enableDamping = true;
controls3d.dampingFactor = 0.08;
controls3d.minDistance = 2.5;
controls3d.maxDistance = 26;
controls3d.target.set(0, 0, 0);
controls3d.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SPAWN_RADIUS = 2.6;

// ---------------------------------------------------------------------------
// Ropes: each rope owns a persistent ribbon-strip BufferGeometry (2 verts per
// history sample). The position/color attributes are mutated in place every
// frame — the strip is never reallocated per frame, avoiding GC churn from
// constantly recreating TubeGeometry.
// ---------------------------------------------------------------------------
let ropes = [];
let ropeCount = 0;
let trailLen = 0;
const tmpTangent = new THREE.Vector3();
const tmpPerp = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpColor = new THREE.Color();

function makeRope(index) {
  const angle = rand01(index, 20) * Math.PI * 2;
  const radius = SPAWN_RADIUS * (0.3 + 0.7 * rand01(index, 21));
  const headStart = new THREE.Vector3(
    Math.cos(angle) * radius,
    (rand01(index, 22) - 0.5) * SPAWN_RADIUS,
    Math.sin(angle) * radius,
  );
  const rope = {
    head: headStart.clone(),
    vel: new THREE.Vector3(),
    history: new Float32Array(trailLen * 3),
    zOffset: rand01(index, 23) * 1000,
    hueJitter: rand01(index, 24) - 0.5,
    geometry: null,
    mesh: null,
  };
  for (let i = 0; i < trailLen; i += 1) {
    rope.history[i * 3] = headStart.x;
    rope.history[i * 3 + 1] = headStart.y;
    rope.history[i * 3 + 2] = headStart.z;
  }
  // Warm up the trail so it reads as an established flowing ribbon on first
  // frame instead of a single point that has to grow out.
  for (let i = 0; i < trailLen * 2; i += 1) stepRope(rope, 0.016);
  return rope;
}

function stepRope(rope, dt) {
  const scale = params.curlScale;
  curlNoise(rope.head.x * scale, rope.head.y * scale + rope.zOffset, rope.head.z * scale, tmpA);
  rope.vel.x = rope.vel.x * 0.92 + tmpA.x * params.turbulence * dt * 3;
  rope.vel.y = rope.vel.y * 0.92 + tmpA.y * params.turbulence * dt * 3;
  rope.vel.z = rope.vel.z * 0.92 + tmpA.z * params.turbulence * dt * 3;
  rope.head.x += rope.vel.x * dt * 3.2;
  rope.head.y += rope.vel.y * dt * 3.2;
  rope.head.z += rope.vel.z * dt * 3.2;
  const d = rope.head.length();
  if (d > SPAWN_RADIUS * 2.1) rope.head.multiplyScalar((SPAWN_RADIUS * 2.1) / d);
  const arr = rope.history;
  arr.copyWithin(0, 3, trailLen * 3);
  arr[(trailLen - 1) * 3] = rope.head.x;
  arr[(trailLen - 1) * 3 + 1] = rope.head.y;
  arr[(trailLen - 1) * 3 + 2] = rope.head.z;
}

function buildRibbonGeometry(count) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 2 * 3);
  const colors = new Float32Array(count * 2 * 3);
  const indices = [];
  for (let i = 0; i < count - 1; i += 1) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.setDrawRange(0, indices.length);
  return geometry;
}

function buildRopes() {
  const count = Math.round(params.ropeCount);
  const len = Math.round(params.trailLength);
  if (count === ropeCount && len === trailLen && ropes.length) return;
  ropes.forEach((r) => {
    if (r.mesh) { scene.remove(r.mesh); r.geometry.dispose(); r.mesh.material.dispose(); }
  });
  ropeCount = count;
  trailLen = Math.max(4, len);
  ropes = new Array(ropeCount);
  for (let i = 0; i < ropeCount; i += 1) {
    const rope = makeRope(i);
    rope.geometry = buildRibbonGeometry(trailLen);
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    rope.mesh = new THREE.Mesh(rope.geometry, material);
    scene.add(rope.mesh);
    ropes[i] = rope;
  }
  updateAllRibbons();
}

function updateRibbon(rope) {
  const positions = rope.geometry.attributes.position.array;
  const colors = rope.geometry.attributes.color.array;
  const arr = rope.history;
  const width = params.ribbonWidth;
  const taper = params.taper;
  const baseHue = params.hue / 360;
  const spread = params.hueSpread / 360;
  const sat = Math.max(0.1, Math.min(1, params.sat * 0.78));
  for (let i = 0; i < trailLen; i += 1) {
    const ix = i * 3;
    const px = arr[ix], py = arr[ix + 1], pz = arr[ix + 2];
    const prevI = Math.max(0, i - 1) * 3;
    const nextI = Math.min(trailLen - 1, i + 1) * 3;
    tmpTangent.set(arr[nextI] - arr[prevI], arr[nextI + 1] - arr[prevI + 1], arr[nextI + 2] - arr[prevI + 2]);
    if (tmpTangent.lengthSq() < 1e-8) tmpTangent.set(0, 0, 1); else tmpTangent.normalize();
    tmpPerp.crossVectors(tmpTangent, WORLD_UP);
    if (tmpPerp.lengthSq() < 1e-6) tmpPerp.set(1, 0, 0); else tmpPerp.normalize();
    const t = i / Math.max(1, trailLen - 1);
    const w = width * (taper + (1 - taper) * t) * 0.5;
    tmpA.set(px + tmpPerp.x * w, py + tmpPerp.y * w, pz + tmpPerp.z * w);
    tmpB.set(px - tmpPerp.x * w, py - tmpPerp.y * w, pz - tmpPerp.z * w);
    const vi = i * 2 * 3;
    positions[vi] = tmpA.x; positions[vi + 1] = tmpA.y; positions[vi + 2] = tmpA.z;
    positions[vi + 3] = tmpB.x; positions[vi + 4] = tmpB.y; positions[vi + 5] = tmpB.z;
    const h = baseHue + rope.hueJitter * spread + t * 0.06;
    const l = 0.42 + t * 0.32;
    hslToColor(h, sat, l, tmpColor);
    colors[vi] = tmpColor.r; colors[vi + 1] = tmpColor.g; colors[vi + 2] = tmpColor.b;
    colors[vi + 3] = tmpColor.r; colors[vi + 4] = tmpColor.g; colors[vi + 5] = tmpColor.b;
  }
  rope.geometry.attributes.position.needsUpdate = true;
  rope.geometry.attributes.color.needsUpdate = true;
  rope.geometry.computeBoundingSphere();
  rope.mesh.material.opacity = Math.min(1, params.glow * 0.75 + 0.15);
}

function updateAllRibbons() {
  for (let i = 0; i < ropeCount; i += 1) updateRibbon(ropes[i]);
}

function renderDisplay() {
  controls3d.update();
  renderer.render(scene, camera);
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
  buildRopes();
  updateAllRibbons();
  pendingPreview = true;
}
function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") applyParamsFromBridge(state.params, false);
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) { seed = state.seed; perlin = new Perlin3D(seed); }
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
  seed = Math.random() * 1000;
  perlin = new Perlin3D(seed);
  ropeCount = -1; trailLen = -1;
  buildRopes();
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}
function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.random() * 1000;
  perlin = new Perlin3D(seed);
  ropeCount = -1; trailLen = -1;
  buildRopes();
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
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed) && nextExtras.seed !== seed) { pushHistorySnapshot(); seed = nextExtras.seed; perlin = new Perlin3D(seed); pendingPreview = true; }
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
if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) { seed = bridge.extras.seed; perlin = new Perlin3D(seed); }
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
buildRopes();
// Restore camera position/orbit target from the last saved checkpoint (if
// any) so reloading reproduces the exact same framing instead of resetting
// to the hardcoded default.
bridge.attachCamera(camera, controls3d);
history.suppress = false;

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  pendingPreview = true;
});
window.addEventListener("message", (event) => { if (event.data?.type === "shaderops/request-preview") sendPreview(); });
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

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (!paused) {
    runTime += delta * params.speed;
    const dt = Math.min(delta, 0.05) * params.speed;
    for (let i = 0; i < ropeCount; i += 1) stepRope(ropes[i], dt);
    updateAllRibbons();
  }
  renderDisplay();
  previewCooldown += delta;
  if (pendingPreview && previewCooldown > 0.45) { pendingPreview = false; previewCooldown = 0; sendPreview(); }
}
sendPreview();
animate();
