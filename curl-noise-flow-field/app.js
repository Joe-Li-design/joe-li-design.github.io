const PROJECT_ID = new URLSearchParams(location.search).get("project") || "curl-noise-flow-field";

const PRESET = {
  speed: 0.55,
  fieldScale: 0.85,
  fieldWarp: 0.62,
  curlStrength: 1.25,
  density: 950,
  jitter: 0.42,
  stepLength: 1.3,
  strokeWidth: 1.1,
  trailSteps: 220,
  hue: 208,
  sat: 0.72,
  fade: 0.06,
};

const schema = [
  { id: "speed", label: "Speed", group: "Field", min: 0.0, max: 2.0, step: 0.01, default: PRESET.speed },
  { id: "fieldScale", label: "Field Scale", group: "Field", min: 0.08, max: 2.4, step: 0.01, default: PRESET.fieldScale },
  { id: "fieldWarp", label: "Field Warp", group: "Field", min: 0.0, max: 1.5, step: 0.01, default: PRESET.fieldWarp },
  { id: "curlStrength", label: "Curl Strength", group: "Field", min: 0.0, max: 2.4, step: 0.01, default: PRESET.curlStrength },
  { id: "density", label: "Density", group: "Points", min: 80, max: 3000, step: 1, default: PRESET.density },
  { id: "jitter", label: "Point Jitter", group: "Points", min: 0.0, max: 1.0, step: 0.01, default: PRESET.jitter },
  { id: "stepLength", label: "Step Length", group: "Line", min: 0.2, max: 4.0, step: 0.01, default: PRESET.stepLength },
  { id: "trailSteps", label: "Trail Steps", group: "Line", min: 12, max: 620, step: 1, default: PRESET.trailSteps },
  { id: "strokeWidth", label: "Stroke Width", group: "Line", min: 0.2, max: 4.0, step: 0.01, default: PRESET.strokeWidth },
  { id: "fade", label: "Fade", group: "Line", min: 0.0, max: 0.4, step: 0.005, default: PRESET.fade },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: PRESET.hue },
  { id: "sat", label: "Sat", group: "Color", min: 0.1, max: 1.0, step: 0.01, default: PRESET.sat },
];

const params = {};
schema.forEach((cfg) => {
  params[cfg.id] = cfg.default;
});

let seed = 734291;
let paused = false;
let bridge = null;
let pInst = null;
let trailsLayer = null;
let frameLayer = null;
let points = [];
let fieldRadius = 220;
let fieldCenterX = 0;
let fieldCenterY = 0;

const history = { undoStack: [], redoStack: [], limit: 120, suppress: false };

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function mulberry32(a) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 0.000013) * 43758.5453123;
  return s - Math.floor(s);
}

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

function normalize(x, y) {
  const m = Math.hypot(x, y) || 1;
  return [x / m, y / m];
}

function computeFieldMetrics() {
  const dim = Math.min(pInst.width, pInst.height);
  fieldRadius = dim * 0.43;
  fieldCenterX = pInst.width * 0.5;
  fieldCenterY = pInst.height * 0.5;
}

function noise2(nx, ny, t, ox, oy) {
  const a = Math.sin((nx * (2.9 + ox) + ny * (1.7 + oy)) + t * (0.22 + ox * 0.05));
  const b = Math.cos((nx * (-1.6 - oy) + ny * (3.1 + ox)) - t * (0.15 + oy * 0.05));
  const c = Math.sin((nx * (4.4 + oy) - ny * (2.7 + ox)) + t * (0.11 + ox * 0.03));
  return (a * 0.52 + b * 0.33 + c * 0.15);
}

function baseVectorField(nx, ny, t) {
  const scale = clamp(params.fieldScale, 0.08, 3.0);
  const warp = clamp(params.fieldWarp, 0.0, 2.0);
  const x = nx * scale;
  const y = ny * scale;

  const wx = x + noise2(x, y, t, 0.7, 1.1) * warp * 0.55;
  const wy = y + noise2(y, x, t, 1.3, 0.4) * warp * 0.55;

  const vx = noise2(wx, wy, t, 0.2, 0.9) + noise2(wx * 1.8, wy * 1.8, t * 1.17, 1.8, 0.2) * 0.4;
  const vy = noise2(wy + 9.2, wx - 4.1, t, 0.6, 1.6) + noise2(wy * 1.7, wx * 1.7, t * 1.11, 1.1, 0.5) * 0.4;
  return [vx, vy];
}

function fieldCurl(nx, ny, t) {
  const eps = 0.0028;
  const [fx1, fy1] = baseVectorField(nx + eps, ny, t);
  const [fx2, fy2] = baseVectorField(nx - eps, ny, t);
  const [fx3, fy3] = baseVectorField(nx, ny + eps, t);
  const [fx4, fy4] = baseVectorField(nx, ny - eps, t);

  const dFydx = (fy1 - fy2) / (2 * eps);
  const dFxdy = (fx3 - fx4) / (2 * eps);
  return dFydx - dFxdy;
}

function flowVector(nx, ny, t) {
  const [vxRaw, vyRaw] = baseVectorField(nx, ny, t);
  const curl = fieldCurl(nx, ny, t);
  const [ux, uy] = normalize(vxRaw, vyRaw);
  const tangentX = -uy;
  const tangentY = ux;
  const influence = clamp(params.curlStrength, 0, 3);
  const mixX = ux + tangentX * curl * influence * 0.55;
  const mixY = uy + tangentY * curl * influence * 0.55;
  const [vx, vy] = normalize(mixX, mixY);
  return [vx, vy, curl];
}

function pointColor(index, cx, cy) {
  const baseH = ((params.hue % 360) + 360) % 360 / 360;
  const sat = clamp(params.sat, 0, 1);
  const n = hash2(index * 0.771 + cx * 0.002, cy * 0.002 + index * 0.117);
  const m = hash2(index * 0.119 - cx * 0.003, cy * 0.0013 + index * 0.901);
  const hue = (baseH + (n - 0.5) * 0.12 + m * 0.04) % 1;
  const val = 0.72 + n * 0.25;
  const rgb = hsvToRgb((hue + 1) % 1, sat * (0.65 + m * 0.35), val);
  return [rgb[0] * 255, rgb[1] * 255, rgb[2] * 255];
}

function reseedPoints() {
  points = [];
  const count = Math.floor(clamp(params.density, 1, 4000));
  const rng = mulberry32((seed >>> 0) + 97);
  const cols = Math.max(2, Math.round(Math.sqrt(count * (pInst.width / Math.max(pInst.height, 1)))));
  const rows = Math.max(2, Math.round(count / cols));
  const cellW = (fieldRadius * 2) / cols;
  const cellH = (fieldRadius * 2) / rows;
  const jitter = clamp(params.jitter, 0, 1);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (points.length >= count) break;
      const jx = (rng() - 0.5) * cellW * jitter;
      const jy = (rng() - 0.5) * cellH * jitter;
      const px = -fieldRadius + (x + 0.5) * cellW + jx;
      const py = -fieldRadius + (y + 0.5) * cellH + jy;
      const col = pointColor(points.length, px, py);
      points.push({
        x: px,
        y: py,
        life: Math.floor(clamp(params.trailSteps, 12, 620) * (0.75 + rng() * 0.4)),
        color: col,
      });
    }
  }
}

function resetSimulation() {
  if (!pInst || !trailsLayer || !frameLayer) return;
  computeFieldMetrics();
  const base = hsvToRgb((((params.hue + 32) % 360) + 360) % 360 / 360, clamp(params.sat * 0.3, 0.05, 1), 0.06);
  trailsLayer.clear();
  trailsLayer.background(base[0] * 255, base[1] * 255, base[2] * 255, 255);

  frameLayer.clear();
  frameLayer.noFill();
  frameLayer.stroke(220, 230, 255, 60);
  frameLayer.strokeWeight(1.0);
  frameLayer.rectMode(pInst.CENTER);
  frameLayer.rect(fieldCenterX, fieldCenterY, fieldRadius * 2, fieldRadius * 2, 4);

  reseedPoints();
  if (bridge) bridge.notifyValuesChanged();
}

function snapshotState() {
  return JSON.stringify({ params: { ...params }, seed, paused });
}

function pushHistorySnapshot(snap) {
  if (history.suppress) return;
  const state = snap ?? snapshotState();
  if (history.undoStack[history.undoStack.length - 1] === state) return;
  history.undoStack.push(state);
  if (history.undoStack.length > history.limit) history.undoStack.shift();
  history.redoStack.length = 0;
}

function applySnapshot(snapshot, notify = true) {
  const state = JSON.parse(snapshot);
  if (!state || typeof state !== "object") return;
  Object.keys(params).forEach((k) => {
    if (state.params && state.params[k] !== undefined) params[k] = state.params[k];
  });
  if (typeof state.seed === "number" && Number.isFinite(state.seed)) seed = Math.max(1, Math.floor(state.seed));
  if (typeof state.paused === "boolean") paused = state.paused;
  resetSimulation();
  if (notify && bridge) {
    bridge.extras.seed = seed;
    bridge.extras.paused = paused;
    bridge.notifyValuesChanged();
  }
}

function randomizeAll() {
  pushHistorySnapshot();
  schema.forEach((cfg) => {
    const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
    const quantized = Math.round(raw / cfg.step) * cfg.step;
    params[cfg.id] = Number(quantized.toFixed(6));
  });
  seed = Math.floor(Math.random() * 2147483646) + 1;
  resetSimulation();
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
  bridge.notifyValuesChanged();
}

function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  resetSimulation();
  bridge.extras.seed = seed;
  bridge.notifyValuesChanged();
}

function undoHistory() {
  if (!history.undoStack.length) return;
  const current = snapshotState();
  const prev = history.undoStack.pop();
  history.redoStack.push(current);
  history.suppress = true;
  try {
    applySnapshot(prev);
  } finally {
    history.suppress = false;
  }
}

function redoHistory() {
  if (!history.redoStack.length) return;
  const current = snapshotState();
  const next = history.redoStack.pop();
  history.undoStack.push(current);
  history.suppress = true;
  try {
    applySnapshot(next);
  } finally {
    history.suppress = false;
  }
}

function togglePause() {
  pushHistorySnapshot();
  paused = !paused;
  bridge.extras.paused = paused;
  bridge.notifyValuesChanged();
}

function sendPreview() {
  if (!pInst || !pInst.canvas) return;
  const image = pInst.canvas.toDataURL("image/jpeg", 0.8);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

function inField(x, y) {
  return Math.abs(x) <= fieldRadius && Math.abs(y) <= fieldRadius;
}

function stepSimulation() {
  const dt = 0.01 + clamp(params.speed, 0, 3) * 0.018;
  const stepPx = clamp(params.stepLength, 0.1, 8.0);
  const width = clamp(params.strokeWidth, 0.1, 6.0);
  const fade = clamp(params.fade, 0, 0.5);
  const t = pInst.millis() * 0.001 * (0.3 + params.speed * 0.7);
  const iter = Math.max(1, Math.floor(1 + params.speed * 4));

  if (fade > 0.0001) {
    trailsLayer.noStroke();
    trailsLayer.fill(0, 0, 0, fade * 255);
    trailsLayer.rect(0, 0, trailsLayer.width, trailsLayer.height);
  }

  trailsLayer.strokeCap(pInst.ROUND);
  for (let k = 0; k < iter; k++) {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.life <= 0) continue;
      const nx = p.x / fieldRadius;
      const ny = p.y / fieldRadius;
      const [vx, vy, curl] = flowVector(nx, ny, t + i * 0.0031);
      const scale = stepPx * (0.7 + Math.abs(curl) * 0.3);
      const nx2 = p.x + vx * scale * dt * 60;
      const ny2 = p.y + vy * scale * dt * 60;
      if (!inField(nx2, ny2)) {
        p.life = 0;
        continue;
      }

      trailsLayer.stroke(p.color[0], p.color[1], p.color[2], 172);
      trailsLayer.strokeWeight(width);
      trailsLayer.line(fieldCenterX + p.x, fieldCenterY + p.y, fieldCenterX + nx2, fieldCenterY + ny2);

      p.x = nx2;
      p.y = ny2;
      p.life -= 1;
    }
  }
}

function initBridge() {
  bridge = window.ShaderOpsControls.init({
    projectId: PROJECT_ID,
    schema,
    params,
    extras: { seed, paused },
    onParams: (ids, nextParams, commit, prevValues) => {
      if (commit && !history.suppress) {
        const prior = JSON.stringify({ params: prevValues || params, seed, paused });
        if (history.undoStack[history.undoStack.length - 1] !== prior) {
          history.undoStack.push(prior);
          if (history.undoStack.length > history.limit) history.undoStack.shift();
          history.redoStack.length = 0;
        }
      }
      Object.keys(nextParams).forEach((id) => {
        if (params[id] === undefined) return;
        params[id] = Number(nextParams[id]);
      });
      resetSimulation();
    },
    onExtras: (nextExtras) => {
      if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed) && nextExtras.seed !== seed) {
        pushHistorySnapshot();
        seed = Math.max(1, Math.floor(nextExtras.seed));
        resetSimulation();
      }
      if (typeof nextExtras.paused === "boolean" && nextExtras.paused !== paused) {
        pushHistorySnapshot();
        paused = nextExtras.paused;
      }
    },
    actions: {
      randomizeAll,
      rerollSeed,
      togglePause,
      undo: undoHistory,
      redo: redoHistory,
    },
  });
}

window.addEventListener("message", (event) => {
  if (event.data?.type === "shaderops/request-preview") sendPreview();
});
window.addEventListener("beforeunload", () => sendPreview());
window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "z") return;
  event.preventDefault();
  if (event.shiftKey) redoHistory();
  else undoHistory();
});

document.title = "Curl Noise Flow Field";

new window.p5((p) => {
  pInst = p;
  p.setup = () => {
    const c = p.createCanvas(window.innerWidth, window.innerHeight);
    c.parent("app");
    trailsLayer = p.createGraphics(p.width, p.height);
    frameLayer = p.createGraphics(p.width, p.height);
    initBridge();
    resetSimulation();
    sendPreview();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    trailsLayer = p.createGraphics(p.width, p.height);
    frameLayer = p.createGraphics(p.width, p.height);
    resetSimulation();
    sendPreview();
  };

  p.draw = () => {
    if (!paused) stepSimulation();
    p.image(trailsLayer, 0, 0);
    p.image(frameLayer, 0, 0);
    if (p.frameCount % 28 === 0) sendPreview();
  };
}, document.getElementById("app"));
