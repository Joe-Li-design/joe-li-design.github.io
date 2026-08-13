const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "lightning-forge";
})();

// Control schema — declared as data. The manager (top-level app) renders the
// actual control panel UI and talks to this project purely via the
// control-bridge postMessage protocol; this project no longer renders its
// own HUD DOM at all.
const controlSchema = [
  { id: "speed", label: "Speed", group: "Global", min: 0.0, max: 2.0, step: 0.01, default: 0.55 },
  { id: "hue", label: "Hue", group: "Color", min: 170, max: 255, step: 1, default: 206 },
  { id: "bright", label: "Bright", group: "Color", min: 0.35, max: 2.4, step: 0.01, default: 1.18 },
  { id: "branches", label: "Branches", group: "Effect", min: 0.1, max: 2.6, step: 0.01, default: 1.35 },
  { id: "depth", label: "Depth", group: "Effect", min: 4, max: 8, step: 1, default: 6 },
  { id: "rough", label: "Rough", group: "Effect", min: 0.2, max: 2.2, step: 0.01, default: 1.05 },
  { id: "plasma", label: "Plasma", group: "Effect", min: 0.0, max: 2.4, step: 0.01, default: 1.1 },
  { id: "glow", label: "Glow", group: "Effect", min: 0.0, max: 2.2, step: 0.01, default: 1.25 },
  { id: "thickness", label: "Core", group: "Effect", min: 0.6, max: 3.5, step: 0.01, default: 1.6 },
  { id: "spread", label: "Spread", group: "Effect", min: 0.1, max: 2.6, step: 0.01, default: 1.05 },
];
const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d", { alpha: false });

let paused = false;
let elapsed = 0;
let regenClock = 0;
let lastTs = performance.now() * 0.001;
let seed = Math.floor(Math.random() * 2147483646) + 1;
let currentBolt = null;
let pendingPreview = true;
let previewCooldown = 0;
const history = { undoStack: [], redoStack: [], limit: 140, suppress: false };

// bridge.extras is a plain object snapshot the manager reads to sync the
// pause icon / persist checkpoints — it is only as fresh as the last time we
// wrote to it, so any local mutation of `seed`/`paused` must call this before
// notifyValuesChanged(), otherwise the manager keeps posting the stale value
// it was initialized with.
function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
}

function mulberry32(s) {
  let a = s >>> 0;
  return function rand() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
  regenerateBolt();
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
    regenerateBolt();
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
  regenerateBolt();
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}
function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  regenerateBolt();
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
  render();
  const image = canvas.toDataURL("image/jpeg", 0.72);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return [r + m, g + m, b + m];
}

function rgba(rgb, alpha) {
  const r = Math.round(Math.min(Math.max(rgb[0], 0), 1) * 255);
  const g = Math.round(Math.min(Math.max(rgb[1], 0), 1) * 255);
  const b = Math.round(Math.min(Math.max(rgb[2], 0), 1) * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function linePointsSubdivide(a, b, iterations, offset, roughness, rand) {
  let points = [a, b];
  let amp = offset;
  for (let i = 0; i < iterations; i += 1) {
    const next = [points[0]];
    for (let j = 0; j < points.length - 1; j += 1) {
      const p0 = points[j];
      const p1 = points[j + 1];
      const mx = (p0.x + p1.x) * 0.5;
      const my = (p0.y + p1.y) * 0.5;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const nOff = (rand() * 2 - 1) * amp;
      next.push({ x: mx + nx * nOff, y: my + ny * nOff });
      next.push(p1);
    }
    points = next;
    amp *= 0.56 + 0.12 / Math.max(roughness, 0.15);
  }
  return points;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function createBranches(rootPath, depth, spread, rough, branchFactor, rand) {
  const branches = [];
  const sampleStep = Math.max(1, Math.floor(rootPath.length / 34));
  for (let i = sampleStep; i < rootPath.length - sampleStep; i += sampleStep) {
    const chance = 0.02 + 0.085 * branchFactor;
    if (rand() > chance) continue;

    const p = rootPath[i];
    const pPrev = rootPath[i - 1];
    const pNext = rootPath[i + 1];
    const tx = pNext.x - pPrev.x;
    const ty = pNext.y - pPrev.y;
    const tLen = Math.hypot(tx, ty) || 1;
    const baseNx = -ty / tLen;
    const baseNy = tx / tLen;

    const sign = rand() > 0.5 ? 1 : -1;
    const side = (0.17 + rand() * 0.26) * spread * sign;
    const driftY = 0.08 + rand() * 0.22;
    const end = {
      x: clamp01(p.x + baseNx * side),
      y: clamp01(p.y + baseNy * side + driftY),
    };

    const iter = Math.max(2, depth - 2);
    const branchPath = linePointsSubdivide(
      { x: p.x, y: p.y },
      end,
      iter,
      0.06 * spread * rough,
      rough,
      rand,
    );
    branches.push({ path: branchPath, power: 0.55 + rand() * 0.35, tier: 1 });

    if (rand() < 0.22 * branchFactor) {
      const tip = branchPath[Math.floor(branchPath.length * (0.58 + rand() * 0.25))];
      const microEnd = {
        x: clamp01(tip.x + (rand() * 2 - 1) * 0.12 * spread),
        y: clamp01(tip.y + 0.08 + rand() * 0.12),
      };
      const microPath = linePointsSubdivide(
        { x: tip.x, y: tip.y },
        microEnd,
        Math.max(1, depth - 4),
        0.03 * rough,
        rough,
        rand,
      );
      branches.push({ path: microPath, power: 0.35 + rand() * 0.25, tier: 2 });
    }
  }
  return branches;
}

function regenerateBolt() {
  const rand = mulberry32(seed);
  const centerX = 0.5 + (rand() * 2 - 1) * 0.11 * params.spread;
  const endX = 0.5 + (rand() * 2 - 1) * 0.16 * params.spread;
  const root = linePointsSubdivide(
    { x: centerX, y: 0.03 },
    { x: endX, y: 0.985 },
    Math.max(2, Math.round(params.depth)),
    0.26 * params.rough * params.spread,
    params.rough,
    rand,
  );
  const branches = createBranches(
    root,
    Math.round(params.depth),
    params.spread,
    params.rough,
    params.branches,
    rand,
  );
  currentBolt = { root, branches };
  pendingPreview = true;
}

function drawPolyline(path, width, color, alpha) {
  if (!path || path.length < 2) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = rgba(color, alpha);
  ctx.beginPath();
  ctx.moveTo(path[0].x * canvas.width, path[0].y * canvas.height);
  for (let i = 1; i < path.length; i += 1) {
    ctx.lineTo(path[i].x * canvas.width, path[i].y * canvas.height);
  }
  ctx.stroke();
}

function drawPlasmaCloud(path, color, alpha, radius) {
  const count = Math.max(5, Math.floor(path.length / 11));
  for (let i = 2; i < path.length - 2; i += count) {
    const p = path[i];
    const x = p.x * canvas.width;
    const y = p.y * canvas.height;
    const rad = radius * (0.65 + Math.sin(elapsed * 8 + i) * 0.08);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(0.45, rgba(color, alpha * 0.24));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

function render() {
  if (!currentBolt) regenerateBolt();

  const hue = params.hue;
  const bright = params.bright;
  const cold = hsvToRgb(hue, 0.7, Math.min(1.2, 0.95 * bright));
  const hot = hsvToRgb(hue - 18, 0.28, Math.min(1.35, 1.1 * bright));
  const plasma = hsvToRgb(hue + 8, 0.62, Math.min(1.15, 0.82 * bright));

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = "screen";

  const plasmaRadius = (canvas.width * 0.035 + canvas.height * 0.012) * params.plasma;
  if (params.plasma > 0) {
    drawPlasmaCloud(currentBolt.root, plasma, 0.18 * params.plasma, plasmaRadius);
    currentBolt.branches.forEach((b) => {
      drawPlasmaCloud(b.path, plasma, 0.08 * params.plasma * b.power, plasmaRadius * 0.58);
    });
  }

  const base = Math.max(0.9, params.thickness) * (canvas.width / 1280);
  const glow = Math.max(0, params.glow);
  const flicker = 0.9 + 0.12 * Math.sin(elapsed * 23.0) + 0.08 * Math.sin(elapsed * 37.0);

  const passes = [
    { mul: 15.0, alpha: 0.038 * glow },
    { mul: 9.4, alpha: 0.064 * glow },
    { mul: 5.6, alpha: 0.112 * glow },
    { mul: 3.1, alpha: 0.22 * glow },
  ];

  passes.forEach((p) => {
    const width = base * p.mul;
    drawPolyline(currentBolt.root, width, cold, p.alpha * flicker);
    currentBolt.branches.forEach((b) => {
      drawPolyline(b.path, width * (0.45 + 0.22 * b.power), cold, p.alpha * 0.75 * b.power);
    });
  });

  drawPolyline(currentBolt.root, base * 1.7, hot, 0.7 * flicker);
  currentBolt.branches.forEach((b) => {
    drawPolyline(b.path, base * (0.9 + 0.35 * b.power), hot, 0.56 * b.power);
  });

  drawPolyline(currentBolt.root, base, [1, 1, 1], 0.95);
  currentBolt.branches.forEach((b) => {
    drawPolyline(b.path, base * (0.4 + b.power * 0.25), [1, 1, 1], 0.6 * b.power);
  });
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.floor(window.innerWidth * dpr));
  const h = Math.max(1, Math.floor(window.innerHeight * dpr));
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  regenerateBolt();
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
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed)) { pushHistorySnapshot(); seed = Math.max(1, Math.floor(nextExtras.seed)); regenerateBolt(); pendingPreview = true; }
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
history.suppress = false;

window.addEventListener("resize", () => {
  resize();
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
    elapsed += dt;
    if (params.speed > 0) {
      regenClock += dt * params.speed;
      if (regenClock >= 1.0) {
        regenClock = 0;
        seed = Math.floor(Math.random() * 2147483646) + 1;
        regenerateBolt();
      }
    }
  }

  render();

  previewCooldown += dt;
  if (pendingPreview && previewCooldown > 0.45) {
    pendingPreview = false;
    previewCooldown = 0;
    sendPreview();
  }
}

resize();
regenerateBolt();
render();
sendPreview();
animate();
