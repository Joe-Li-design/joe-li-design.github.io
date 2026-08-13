const PROJECT_ID = new URLSearchParams(location.search).get("project") || "flow-trace-stopper";

const PRESET = {
  speed: 0.56,
  fieldDrift: 0.14,
  fieldScale: 0.9,
  fieldWarp: 0.66,
  curlStrength: 1.3,
  density: 960,
  jitter: 0.44,
  stepLength: 1.25,
  strokeWidth: 1.1,
  clearance: 0.1,
  speedVariance: 0.55,
  trailSteps: 230,
  hue: 214,
  sat: 0.74,
  fade: 0.0,
};

const schema = [
  { id: "speed", label: "Speed", group: "Field", min: 0.0, max: 2.0, step: 0.01, default: PRESET.speed },
  { id: "fieldDrift", label: "Field Drift", group: "Field", min: 0.0, max: 1.0, step: 0.01, default: PRESET.fieldDrift },
  { id: "fieldScale", label: "Field Scale", group: "Field", min: 0.08, max: 2.4, step: 0.01, default: PRESET.fieldScale },
  { id: "fieldWarp", label: "Field Warp", group: "Field", min: 0.0, max: 1.5, step: 0.01, default: PRESET.fieldWarp },
  { id: "curlStrength", label: "Curl Strength", group: "Field", min: 0.0, max: 2.4, step: 0.01, default: PRESET.curlStrength },
  { id: "density", label: "Density", group: "Points", min: 80, max: 3000, step: 1, default: PRESET.density },
  { id: "jitter", label: "Point Jitter", group: "Points", min: 0.0, max: 1.0, step: 0.01, default: PRESET.jitter },
  { id: "stepLength", label: "Step Length", group: "Line", min: 0.2, max: 4.0, step: 0.01, default: PRESET.stepLength },
  { id: "trailSteps", label: "Trail Steps", group: "Line", min: 12, max: 620, step: 1, default: PRESET.trailSteps },
  { id: "strokeWidth", label: "Stroke Width", group: "Line", min: 0.2, max: 12.0, step: 0.01, default: PRESET.strokeWidth },
  { id: "clearance", label: "Clearance", group: "Line", min: 0.0, max: 2.0, step: 0.01, default: PRESET.clearance },
  { id: "speedVariance", label: "Speed Variance", group: "Line", min: 0.0, max: 1.0, step: 0.01, default: PRESET.speedVariance },
  { id: "fade", label: "Fade", group: "Line", min: 0.0, max: 0.15, step: 0.002, default: PRESET.fade },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: PRESET.hue },
  { id: "sat", label: "Sat", group: "Color", min: 0.1, max: 1.0, step: 0.01, default: PRESET.sat },
];

const params = {};
schema.forEach((cfg) => {
  params[cfg.id] = cfg.default;
});

let seed = 781993;
let paused = false;
let bridge = null;
let pInst = null;
let trailsLayer = null;
let frameLayer = null;
let points = [];
let fieldRadius = 220;
let fieldCenterX = 0;
let fieldCenterY = 0;
let occupancy = new Map();
let occupancyCell = 8;
let respawnCursor = 0;
let spawnSerial = 0;

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
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

function normalize(x, y) {
  const m = Math.hypot(x, y) || 1;
  return [x / m, y / m];
}

function traceCollisionRadius(width) {
  const extraGap = Math.max(0, params.clearance) * width;
  return Math.max(width * 0.68, width * 0.68 + extraGap);
}

function cellKey(ix, iy) {
  return `${ix},${iy}`;
}

function toCell(v) {
  return Math.floor(v / occupancyCell);
}

function clearOccupancy() {
  occupancy = new Map();
}

function addOccupancyPoint(x, y, owner, tx = 0, ty = 0) {
  const ix = toCell(x);
  const iy = toCell(y);
  const key = cellKey(ix, iy);
  const list = occupancy.get(key);
  const item = { x, y, owner, tx, ty };
  if (list) list.push(item);
  else occupancy.set(key, [item]);
}

function collidesWithTrace(x, y, radius, owner, dirX = 0, dirY = 0) {
  const ix = toCell(x);
  const iy = toCell(y);
  const search = Math.max(1, Math.ceil(radius / occupancyCell));
  const movingMag = Math.hypot(dirX, dirY);
  const mx = movingMag > 1e-6 ? dirX / movingMag : 0;
  const my = movingMag > 1e-6 ? dirY / movingMag : 0;
  for (let yy = iy - search; yy <= iy + search; yy++) {
    for (let xx = ix - search; xx <= ix + search; xx++) {
      const list = occupancy.get(cellKey(xx, yy));
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const sample = list[i];
        if (sample.owner === owner) continue;
        let effectiveRadius = radius;
        const sampleMag = Math.hypot(sample.tx || 0, sample.ty || 0);
        if (movingMag > 1e-6 && sampleMag > 1e-6) {
          const sx = sample.tx / sampleMag;
          const sy = sample.ty / sampleMag;
          const alignment = Math.abs(mx * sx + my * sy);
          if (alignment > 0.92) effectiveRadius *= 0.38;
          else if (alignment > 0.75) effectiveRadius *= 0.62;
        }
        if (Math.hypot(x - sample.x, y - sample.y) < effectiveRadius) return true;
      }
    }
  }
  return false;
}

function recordSegment(ax, ay, bx, by, owner, radius) {
  const len = Math.hypot(bx - ax, by - ay);
  const step = Math.max(1, radius * 0.45);
  const samples = Math.max(1, Math.ceil(len / step));
  const tx = len > 1e-6 ? (bx - ax) / len : 0;
  const ty = len > 1e-6 ? (by - ay) / len : 0;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    addOccupancyPoint(ax + (bx - ax) * t, ay + (by - ay) * t, owner, tx, ty);
  }
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
  return a * 0.52 + b * 0.33 + c * 0.15;
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

function pointSpeed(index, lifeSeed = 0) {
  const variance = clamp(params.speedVariance, 0, 1);
  const n = hash2(index * 0.41 + lifeSeed * 1.17, index * 0.83 - lifeSeed * 0.73);
  return (1 - variance * 0.65) + n * variance * 1.3;
}

function warpSeedPosition(index, x, y, cellW, cellH, tSeed) {
  const warpAmount = (0.18 + clamp(params.jitter, 0, 1) * 0.62) * (0.4 + clamp(params.fieldWarp, 0, 2) * 0.6);
  const ox = noise2(x / Math.max(fieldRadius, 1), y / Math.max(fieldRadius, 1), tSeed * 0.17, 0.9, 0.3);
  const oy = noise2(y / Math.max(fieldRadius, 1), x / Math.max(fieldRadius, 1), tSeed * 0.21, 1.4, 0.8);
  return {
    x: x + ox * cellW * warpAmount,
    y: y + oy * cellH * warpAmount,
  };
}

function spawnPoint(index, tSeed = 0, x = null, y = null) {
  const jx = hash2(index * 0.73 + tSeed * 0.11, index * 1.91 + tSeed * 0.07);
  const jy = hash2(index * 1.37 - tSeed * 0.13, index * 0.53 + tSeed * 0.19);
  const px = x ?? ((jx * 2 - 1) * fieldRadius * 0.97);
  const py = y ?? ((jy * 2 - 1) * fieldRadius * 0.97);
  const col = pointColor(index, px, py);
  return {
    id: index,
    x: px,
    y: py,
    age: 0,
    maxAge: Math.floor(clamp(params.trailSteps, 12, 620) * (0.7 + hash2(index * 0.29, index * 0.47) * 0.5)),
    color: col,
    speedMul: pointSpeed(index, tSeed),
    active: true,
    respawnDelay: 0,
  };
}

function makeSeedCandidate(index, col, row, cellW, cellH, jitter, tSeed) {
  const jx = (hash2(index * 0.61 + tSeed * 0.17, col * 1.7 + row * 0.3) - 0.5) * cellW * jitter;
  const jy = (hash2(index * 0.49 - tSeed * 0.11, row * 1.3 + col * 0.27) - 0.5) * cellH * jitter;
  const pos = warpSeedPosition(
    index,
    -fieldRadius + (col + 0.5) * cellW + jx,
    -fieldRadius + (row + 0.5) * cellH + jy,
    cellW,
    cellH,
    tSeed
  );
  return pos;
}

function findOpenSpawn(index, radius, tSeed = 0) {
  const count = Math.max(1, Math.floor(clamp(params.density, 1, 4000)));
  const cols = Math.max(2, Math.round(Math.sqrt(count * (pInst.width / Math.max(pInst.height, 1)))));
  const rows = Math.max(2, Math.round(count / cols));
  const cellW = (fieldRadius * 2) / cols;
  const cellH = (fieldRadius * 2) / rows;
  const jitter = clamp(params.jitter, 0, 1);
  const totalCells = cols * rows;
  const attempts = Math.min(totalCells, 48);

  for (let n = 0; n < attempts; n++) {
    const cellIndex = (respawnCursor + n * 17) % totalCells;
    const col = cellIndex % cols;
    const row = Math.floor(cellIndex / cols);
    const candidate = makeSeedCandidate(index, col, row, cellW, cellH, jitter, tSeed + n);
    const flow = sampleFlowWorld(candidate.x, candidate.y, tSeed + n * 0.01);
    if (!collidesWithTrace(candidate.x, candidate.y, radius, -1, flow[0], flow[1])) {
      respawnCursor = (cellIndex + 1) % totalCells;
      return candidate;
    }
  }
  return null;
}

function reseedPoints() {
  points = [];
  spawnSerial = 0;
  const count = Math.floor(clamp(params.density, 1, 4000));
  const rng = mulberry32((seed >>> 0) + 97);
  const collisionRadius = traceCollisionRadius(Math.max(0.2, params.strokeWidth)) * 0.58;
  const jitter = clamp(params.jitter, 0, 1);
  const maxAnchorAttempts = Math.max(180, count * 6);

  for (let a = 0; a < maxAnchorAttempts && points.length < count; a++) {
    const rx = (rng() * 2 - 1) * fieldRadius * (0.35 + rng() * 0.65);
    const ry = (rng() * 2 - 1) * fieldRadius * (0.35 + rng() * 0.65);
    const seedPos = warpSeedPosition(points.length + a * 0.37, rx, ry, fieldRadius * 0.4, fieldRadius * 0.4, rng() * 100);
    const px = seedPos.x + (rng() - 0.5) * fieldRadius * 0.08 * jitter;
    const py = seedPos.y + (rng() - 0.5) * fieldRadius * 0.08 * jitter;
    if (!inField(px, py)) continue;
    const bundle = buildBrushBundle(px, py, points.length + spawnSerial * 13.0 + a * 0.23, 0);
    const bundleSpeedBase = pointSpeed(points.length + spawnSerial * 0.73, a * 0.29 + rng() * 10);
    for (let b = 0; b < bundle.length && points.length < count; b++) {
      const slot = bundle[b];
      if (!inField(slot.x, slot.y)) continue;
      if (collidesWithTrace(slot.x, slot.y, collisionRadius, -1)) continue;
      const lifeSeed = rng() * 100 + a * 0.17 + b * 0.71;
      const candidate = spawnPoint(points.length, lifeSeed, slot.x, slot.y);
      const laneJitter = 0.9 + hash2((spawnSerial + 1) * 0.47, b * 0.83 + a * 0.19) * 0.2;
      candidate.speedMul = clamp(bundleSpeedBase * laneJitter, 0.35, 2.2);
      const dir = sampleFlowWorld(candidate.x, candidate.y, 0);
      const preStep = Math.max(0.4, params.stepLength) * candidate.speedMul * 0.7;
      if (!canAdvanceFromSpawn(candidate.x, candidate.y, dir[0], dir[1], 0, preStep, collisionRadius, candidate.id)) continue;
      candidate.maxAge = Math.floor(clamp(params.trailSteps, 12, 620) * (0.85 + rng() * 0.55));
      points.push(candidate);
      spawnSerial += 1;
    }
  }
}

function resetSimulation() {
  if (!pInst || !trailsLayer || !frameLayer) return;
  computeFieldMetrics();
  occupancyCell = Math.max(2, traceCollisionRadius(Math.max(0.2, params.strokeWidth)) * 0.72);
  respawnCursor = 0;
  clearOccupancy();
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

function sampleFlowWorld(x, y, time) {
  const nx = x / fieldRadius;
  const ny = y / fieldRadius;
  return flowVector(nx, ny, time);
}

function buildBrushBundle(centerX, centerY, seedValue, baseTime = 0) {
  const width = Math.max(0.2, params.strokeWidth);
  const laneGap = Math.max(width * 0.86, 0.52);
  const bundleSize = 2 + Math.floor(hash2(seedValue * 0.31, seedValue * 1.17) * 5);
  const flow = sampleFlowWorld(centerX, centerY, baseTime);
  let dirX = flow[0];
  let dirY = flow[1];
  const angleJitter = (hash2(centerX * 0.013 + seedValue * 0.07, centerY * 0.017 - seedValue * 0.11) - 0.5) * Math.PI * 0.44;
  const ca = Math.cos(angleJitter);
  const sa = Math.sin(angleJitter);
  const rdx = dirX * ca - dirY * sa;
  const rdy = dirX * sa + dirY * ca;
  [dirX, dirY] = normalize(rdx, rdy);
  const nX = -dirY;
  const nY = dirX;
  const centerOffset = (bundleSize - 1) * 0.5;
  const bundle = [];
  for (let j = 0; j < bundleSize; j++) {
    const lane = (j - centerOffset) * laneGap;
    const fx = centerX + nX * lane;
    const fy = centerY + nY * lane;
    bundle.push({ x: fx, y: fy, laneIndex: j, laneCount: bundleSize });
  }
  return bundle;
}

function canAdvanceFromSpawn(x, y, dirX, dirY, baseTime, stepPx, clearance, owner) {
  const lookaheadSteps = 3;
  let cx = x;
  let cy = y;
  let lx = dirX;
  let ly = dirY;
  for (let s = 0; s < lookaheadSteps; s++) {
    const flowA = sampleFlowWorld(cx, cy, baseTime + s * 0.013);
    const vx1 = s === 0 && Math.hypot(lx, ly) > 1e-6 ? lx : flowA[0];
    const vy1 = s === 0 && Math.hypot(lx, ly) > 1e-6 ? ly : flowA[1];
    const midX = cx + vx1 * stepPx * 0.5;
    const midY = cy + vy1 * stepPx * 0.5;
    const midFlow = sampleFlowWorld(midX, midY, baseTime + s * 0.013);
    const nx = cx + midFlow[0] * stepPx;
    const ny = cy + midFlow[1] * stepPx;
    if (!inField(nx, ny)) return false;
    if (collidesWithTrace(nx, ny, clearance, owner, midFlow[0], midFlow[1])) return false;
    cx = nx;
    cy = ny;
    lx = midFlow[0];
    ly = midFlow[1];
  }
  return true;
}

function stepSimulation() {
  const dt = 0.01 + clamp(params.speed, 0, 3) * 0.018;
  const stepPx = clamp(params.stepLength, 0.1, 8.0);
  const width = clamp(params.strokeWidth, 0.1, 14.0);
  const clearance = traceCollisionRadius(width);
  const fade = clamp(params.fade, 0, 0.5);
  const t = pInst.millis() * 0.001 * clamp(params.fieldDrift, 0, 1);
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
      if (!p.active) {
        p.respawnDelay -= 1;
        if (p.respawnDelay <= 0) {
          const spawnClearance = clearance * 0.58;
          const candidate = findOpenSpawn(p.id, spawnClearance, i * 0.17);
          if (candidate) {
            const bundle = buildBrushBundle(candidate.x, candidate.y, p.id * 0.37 + (t + k * 0.11) * 13.0, t);
            const start = bundle.length > 0 ? (p.id + spawnSerial) % bundle.length : 0;
            let activated = false;
            for (let b = 0; b < bundle.length; b++) {
              const slot = bundle[(start + b) % bundle.length];
              if (!inField(slot.x, slot.y)) continue;
              if (collidesWithTrace(slot.x, slot.y, spawnClearance, p.id)) continue;
              const np = spawnPoint(p.id, t + k * 0.41, slot.x, slot.y);
              const bundleSpeed = pointSpeed(p.id * 0.91 + spawnSerial * 0.17, t + k * 0.23 + b * 0.71);
              const laneJitter = 0.94 + hash2((spawnSerial + 1) * 0.39, b * 1.17) * 0.12;
              np.speedMul = clamp(bundleSpeed * laneJitter, 0.35, 2.2);
              const initialFlow = sampleFlowWorld(np.x, np.y, t);
              const testStep = Math.max(0.4, params.stepLength) * np.speedMul * 0.7;
              if (!canAdvanceFromSpawn(np.x, np.y, initialFlow[0], initialFlow[1], t, testStep, spawnClearance, np.id)) continue;
              p.x = np.x;
              p.y = np.y;
              p.age = 0;
              p.maxAge = np.maxAge;
              p.color = np.color;
              p.speedMul = np.speedMul;
              p.active = true;
              p.respawnDelay = 0;
              spawnSerial += 1;
              activated = true;
              break;
            }
            if (!activated) p.respawnDelay = 10;
          } else {
            p.respawnDelay = 10;
          }
        }
        continue;
      }
      const [vx1, vy1, curl1] = sampleFlowWorld(p.x, p.y, t);
      const scale1 = stepPx * p.speedMul * (0.7 + Math.abs(curl1) * 0.3);
      const midX = p.x + vx1 * scale1 * dt * 30;
      const midY = p.y + vy1 * scale1 * dt * 30;
      const [vx2, vy2, curl2] = sampleFlowWorld(midX, midY, t);
      const scale2 = stepPx * p.speedMul * (0.7 + Math.abs(curl2) * 0.3);
      const nx2 = p.x + vx2 * scale2 * dt * 60;
      const ny2 = p.y + vy2 * scale2 * dt * 60;
      if (!inField(nx2, ny2)) {
        p.active = false;
        p.respawnDelay = 18;
        continue;
      }

      if (collidesWithTrace(nx2, ny2, clearance, p.id, vx2, vy2)) {
        p.active = false;
        p.respawnDelay = 18;
        continue;
      }

      trailsLayer.stroke(p.color[0], p.color[1], p.color[2], 172);
      trailsLayer.strokeWeight(width);
      trailsLayer.line(fieldCenterX + p.x, fieldCenterY + p.y, fieldCenterX + nx2, fieldCenterY + ny2);
      recordSegment(p.x, p.y, nx2, ny2, p.id, clearance);

      p.x = nx2;
      p.y = ny2;
      p.age += 1;
      if (p.age >= p.maxAge) p.maxAge += Math.max(24, Math.floor(params.trailSteps * 0.35));
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

document.title = "Flow Trace Stopper";

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
