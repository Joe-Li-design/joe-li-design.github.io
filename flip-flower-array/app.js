import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.180.0/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "https://unpkg.com/three@0.180.0/examples/jsm/geometries/RoundedBoxGeometry.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "flip-flower-array";
})();

// Control schema — declared as data. The manager (top-level app) renders the
// actual control panel UI and talks to this project purely via the
// control-bridge postMessage protocol; this project no longer renders its
// own HUD DOM at all.
const controlSchema = [
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 1.5, step: 0.01, default: 0.34 },
  { id: "flipRate", label: "Flip Rate", group: "Global", min: 0, max: 1, step: 0.01, default: 0.52 },
  { id: "depth", label: "Depth", group: "Global", min: 0.65, max: 1.8, step: 0.01, default: 1.05 },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: 315 },
  { id: "sat", label: "Sat", group: "Color", min: 0, max: 1.4, step: 0.01, default: 0.78 },
  { id: "cols", label: "Cols", group: "Effect", min: 6, max: 18, step: 1, default: 10 },
  { id: "rows", label: "Rows", group: "Effect", min: 8, max: 28, step: 1, default: 17 },
  { id: "gap", label: "Gap", group: "Effect", min: 0.02, max: 0.24, step: 0.01, default: 0.08 },
  { id: "bevel", label: "Bevel", group: "Effect", min: 0.04, max: 0.32, step: 0.01, default: 0.18 },
  { id: "flowers", label: "Flowers", group: "Effect", min: 0, max: 1, step: 0.01, default: 0.42 },
  { id: "flowerSize", label: "Petal Size", group: "Effect", min: 0.35, max: 1.2, step: 0.01, default: 0.72 },
];
const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

const app = document.getElementById("app");

let paused = false;
let seed = Math.random() * 1000;
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
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0910");
const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
camera.position.set(0, 0.4, 17);
const controls3d = new OrbitControls(camera, renderer.domElement);
controls3d.enableDamping = true;
controls3d.dampingFactor = 0.08;
controls3d.minDistance = 7;
controls3d.maxDistance = 28;
controls3d.target.set(0, 0, 0);
controls3d.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };

const ambient = new THREE.HemisphereLight(0xffe8ff, 0x17121d, 2.2);
scene.add(ambient);
const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
keyLight.position.set(-5, 8, 12);
keyLight.castShadow = true;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x9b72ff, 2.2);
rimLight.position.set(8, -3, 5);
scene.add(rimLight);

const arrayGroup = new THREE.Group();
scene.add(arrayGroup);
const cellGeometry = new RoundedBoxGeometry(1, 1, 0.42, 5, 0.18);
const petalGeometry = new RoundedBoxGeometry(0.23, 0.42, 0.08, 4, 0.08);
const centerGeometry = new THREE.SphereGeometry(0.12, 12, 8);
const cells = [];
let rebuildKey = "";

function randomFor(index, salt = 0) {
  return THREE.MathUtils.euclideanModulo(Math.sin(index * 12.9898 + seed * 78.233 + salt * 37.719) * 43758.5453, 1);
}

function hslColor(h, s, l) {
  return new THREE.Color().setHSL(THREE.MathUtils.euclideanModulo(h, 1), Math.max(0, Math.min(1, s)), l);
}

function makeFlower(index, size, baseHue) {
  const group = new THREE.Group();
  const petalCount = 5;
  const petalHue = baseHue + (randomFor(index, 4) - 0.5) * 0.12;
  for (let p = 0; p < petalCount; p += 1) {
    const petal = new THREE.Mesh(petalGeometry, new THREE.MeshStandardMaterial({
      color: hslColor(petalHue + p * 0.015, 0.68, 0.62),
      roughness: 0.3,
      metalness: 0.02
    }));
    const angle = (p / petalCount) * Math.PI * 2;
    petal.position.set(Math.cos(angle) * 0.17 * size, Math.sin(angle) * 0.17 * size, 0.26);
    petal.rotation.z = angle;
    petal.scale.set(size, size, size);
    petal.castShadow = true;
    group.add(petal);
  }
  const center = new THREE.Mesh(centerGeometry, new THREE.MeshStandardMaterial({
    color: hslColor(petalHue + 0.08, 0.72, 0.52),
    roughness: 0.25
  }));
  center.position.z = 0.31;
  center.scale.setScalar(size * 0.95);
  center.castShadow = true;
  group.add(center);
  return group;
}

function buildArray() {
  const cols = Math.round(params.cols);
  const rows = Math.round(params.rows);
  const key = `${cols}:${rows}:${params.gap}:${params.bevel}:${params.flowers}:${params.flowerSize}:${params.hue}:${params.sat}:${params.depth}:${seed}`;
  if (key === rebuildKey) return;
  rebuildKey = key;
  while (arrayGroup.children.length) arrayGroup.remove(arrayGroup.children[0]);
  cells.length = 0;
  const cellW = 1;
  const cellH = 1;
  const xStep = cellW + params.gap;
  const yStep = cellH + params.gap;
  const xStart = -((cols - 1) * xStep) / 2;
  const yStart = ((rows - 1) * yStep) / 2;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const group = new THREE.Group();
      group.position.set(xStart + col * xStep, yStart - row * yStep, (randomFor(index, 3) - 0.5) * 0.2);
      group.rotation.set((randomFor(index, 9) - 0.5) * 0.12, (randomFor(index, 10) - 0.5) * 0.12, (randomFor(index, 11) - 0.5) * 0.08);
      const baseHue = params.hue / 360 + (randomFor(index, 1) - 0.5) * params.sat * 0.35;
      const baseColor = hslColor(baseHue, Math.min(0.3 + params.sat * 0.6, 1), 0.76 + randomFor(index, 2) * 0.12);
      const base = new THREE.Mesh(cellGeometry, new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.34, metalness: 0.04 }));
      base.scale.set(1, 1, params.depth);
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);
      if (randomFor(index, 6) < params.flowers) {
        group.add(makeFlower(index, params.flowerSize, baseHue + 0.02));
      }
      arrayGroup.add(group);
      cells.push({ group, base, phase: randomFor(index, 14) * Math.PI * 2, axis: randomFor(index, 15) > 0.5 ? "x" : "y", direction: randomFor(index, 16) > 0.5 ? 1 : -1 });
    }
  }
  const totalW = (cols - 1) * xStep + cellW;
  const totalH = (rows - 1) * yStep + cellH;
  camera.position.z = Math.max(11, Math.max(totalW / (camera.aspect * 0.86), totalH / 0.86) * 1.06);
  controls3d.maxDistance = camera.position.z * 2.2;
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
  buildArray();
  pendingPreview = true;
}
function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") applyParamsFromBridge(state.params, false);
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) seed = state.seed;
    if (typeof state.paused === "boolean") paused = state.paused;
    buildArray();
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
  buildArray();
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}
function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.random() * 1000;
  buildArray();
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
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed) && nextExtras.seed !== seed) { pushHistorySnapshot(); seed = nextExtras.seed; pendingPreview = true; }
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
if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) seed = bridge.extras.seed;
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
buildArray();
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
  rebuildKey = "";
  buildArray();
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
    const time = performance.now() * 0.001 * params.speed;
    cells.forEach((cell, index) => {
      const wave = Math.sin(time * 1.35 + cell.phase + index * 0.11);
      const target = wave > (1 - params.flipRate * 1.8) ? cell.direction * Math.PI : 0;
      cell.group.rotation[cell.axis] = THREE.MathUtils.damp(cell.group.rotation[cell.axis], target, 4.2, delta);
      cell.group.position.z += (Math.sin(time * 0.7 + cell.phase) * 0.018 - cell.group.position.z) * Math.min(1, delta * 2);
    });
  }
  renderDisplay();
  previewCooldown += delta;
  if (pendingPreview && previewCooldown > 0.45) { pendingPreview = false; previewCooldown = 0; sendPreview(); }
}
sendPreview();
animate();
