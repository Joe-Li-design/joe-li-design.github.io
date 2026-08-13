const PROJECT_ID = new URLSearchParams(location.search).get("project") || "gradient-diff-hatching-per-band-field";

const PRESET = {
  bandCount: 5,
  bandCurve: 1.0,
  darkBoost: 1.0,
  edgeBoost: 0.9,

  densityGain: 1.0,
  densityMinSpace: 2.0,
  densityMaxSpace: 28.0,
  strokeWidth: 1.2,
  jitter: 0.12,
  traceSteps: 170,
  stepLength: 1.4,
  clusterLanes: 2,
  clusterGap: 0.85,

  fieldScale: 1.0,
  fieldWarp: 0.45,
  octaveMix: 0.58,
  gradientStep: 0.0028,

  inkHue: 220,
  inkSat: 0.08,
  inkValue: 0.18,
  inkAlpha: 0.75,
  paper: 0.95,
  speed: 1.0,
};

const schema = [
  { id: "bandCount", label: "Band Count", group: "Gradient", min: 2, max: 8, step: 1, default: PRESET.bandCount },
  { id: "bandCurve", label: "Band Curve", group: "Gradient", min: 0.35, max: 2.5, step: 0.01, default: PRESET.bandCurve },
  { id: "darkBoost", label: "Dark Boost", group: "Gradient", min: 0.4, max: 2.0, step: 0.01, default: PRESET.darkBoost },
  { id: "edgeBoost", label: "Edge Boost", group: "Gradient", min: 0.0, max: 2.0, step: 0.01, default: PRESET.edgeBoost },

  { id: "densityGain", label: "Density Gain", group: "Hatching", min: 0.25, max: 2.5, step: 0.01, default: PRESET.densityGain },
  { id: "densityMinSpace", label: "Min Spacing", group: "Hatching", min: 0.8, max: 12.0, step: 0.1, default: PRESET.densityMinSpace },
  { id: "densityMaxSpace", label: "Max Spacing", group: "Hatching", min: 6.0, max: 64.0, step: 0.1, default: PRESET.densityMaxSpace },
  { id: "strokeWidth", label: "Stroke Width", group: "Hatching", min: 0.2, max: 4.0, step: 0.01, default: PRESET.strokeWidth },
  { id: "jitter", label: "Jitter", group: "Hatching", min: 0.0, max: 1.2, step: 0.01, default: PRESET.jitter },
  { id: "traceSteps", label: "Trace Steps", group: "Hatching", min: 20, max: 460, step: 1, default: PRESET.traceSteps },
  { id: "stepLength", label: "Step Length", group: "Hatching", min: 0.2, max: 4.5, step: 0.01, default: PRESET.stepLength },
  { id: "clusterLanes", label: "Cluster Lanes", group: "Hatching", min: 1, max: 5, step: 1, default: PRESET.clusterLanes },
  { id: "clusterGap", label: "Cluster Gap", group: "Hatching", min: 0.35, max: 2.0, step: 0.01, default: PRESET.clusterGap },

  { id: "fieldScale", label: "Field Scale", group: "Field", min: 0.08, max: 2.8, step: 0.01, default: PRESET.fieldScale },
  { id: "fieldWarp", label: "Field Warp", group: "Field", min: 0.0, max: 1.8, step: 0.01, default: PRESET.fieldWarp },
  { id: "octaveMix", label: "Octave Mix", group: "Field", min: 0.0, max: 1.0, step: 0.01, default: PRESET.octaveMix },
  { id: "gradientStep", label: "Gradient Step", group: "Field", min: 0.0008, max: 0.01, step: 0.0001, default: PRESET.gradientStep },

  { id: "inkHue", label: "Ink Hue", group: "Color", min: 0, max: 360, step: 1, default: PRESET.inkHue },
  { id: "inkSat", label: "Ink Sat", group: "Color", min: 0.0, max: 0.6, step: 0.01, default: PRESET.inkSat },
  { id: "inkValue", label: "Ink Value", group: "Color", min: 0.02, max: 0.6, step: 0.01, default: PRESET.inkValue },
  { id: "inkAlpha", label: "Ink Alpha", group: "Color", min: 0.05, max: 1.0, step: 0.01, default: PRESET.inkAlpha },
  { id: "paper", label: "Paper", group: "Color", min: 0.82, max: 1.0, step: 0.001, default: PRESET.paper },

  { id: "speed", label: "Build Speed", group: "Global", min: 0.0, max: 4.0, step: 0.01, default: PRESET.speed },
  { id: "imageLoader", label: "Image", group: "Input", type: "image-loader" },
];

const params = {};
schema.forEach((cfg) => {
  if (cfg.type === "image-loader") return;
  params[cfg.id] = cfg.default;
});

let seed = 532191;
let paused = false;
let bridge = null;
let pInst = null;
let hatchLayer = null;
let generationState = null;
let darknessRange = { min: 0, max: 1 };
let occupancy = new Map();
let occupancyCell = 6;

let imageState = {
  loaded: false,
  name: "none",
  width: 0,
  height: 0,
  data: null,
};

const history = { undoStack: [], redoStack: [], limit: 120, suppress: false };
const MAX_POINTS_PER_CELL = 48;

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { return t * t * (3 - 2 * t); }

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 0.000017) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const ux = smoothstep(fx);
  const uy = smoothstep(fy);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

function normalize(x, y) {
  const m = Math.hypot(x, y) || 1;
  return [x / m, y / m];
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

function fallbackLuma(u, v) {
  const n1 = valueNoise(u * 5.2 + 3.3, v * 5.2 + 7.9);
  const n2 = valueNoise(u * 13.4 + 5.7, v * 13.4 + 1.1);
  const nx = u * 2 - 1;
  const ny = v * 2 - 1;
  const radial = 1 - clamp(Math.hypot(nx, ny), 0, 1);
  return clamp(0.2 + radial * 0.6 + (n1 - 0.5) * 0.25 + (n2 - 0.5) * 0.08, 0, 1);
}

function mapCanvasUvToImageUv(u, v) {
  if (!imageState.loaded || !imageState.data || imageState.width < 1 || imageState.height < 1 || !pInst) return null;
  const viewAspect = Math.max(1e-5, pInst.width / Math.max(1, pInst.height));
  const imageAspect = Math.max(1e-5, imageState.width / Math.max(1, imageState.height));
  const fitScaleX = imageAspect / viewAspect;
  const mappedU = (u - 0.5) / fitScaleX + 0.5;
  if (mappedU < 0 || mappedU > 1 || v < 0 || v > 1) return null;
  return { u: mappedU, v };
}

function isInImageContentUv(u, v) {
  if (!imageState.loaded) return true;
  return !!mapCanvasUvToImageUv(clamp(u, 0, 1), clamp(v, 0, 1));
}

function sampleLuma(u, v) {
  if (!imageState.loaded || !imageState.data || imageState.width < 1 || imageState.height < 1) {
    return fallbackLuma(u, v);
  }
  const mapped = mapCanvasUvToImageUv(clamp(u, 0, 1), clamp(v, 0, 1));
  if (!mapped) return 0;
  const x = clamp(Math.floor(mapped.u * (imageState.width - 1)), 0, imageState.width - 1);
  const y = clamp(Math.floor(mapped.v * (imageState.height - 1)), 0, imageState.height - 1);
  const i = (y * imageState.width + x) * 4;
  const r = imageState.data[i] / 255;
  const g = imageState.data[i + 1] / 255;
  const b = imageState.data[i + 2] / 255;
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function sampleDarkness(u, v) {
  const l = sampleLuma(u, v);
  const dark = 1 - l;
  return Math.pow(clamp(dark, 0, 1), clamp(params.darkBoost, 0.3, 2.5));
}

function sampleEdge(u, v) {
  const eps = 1.4 / Math.max(320, Math.min(pInst.width, pInst.height));
  const l = sampleLuma(clamp(u - eps, 0, 1), v);
  const r = sampleLuma(clamp(u + eps, 0, 1), v);
  const d = sampleLuma(u, clamp(v - eps, 0, 1));
  const uu = sampleLuma(u, clamp(v + eps, 0, 1));
  return clamp(Math.hypot(r - l, uu - d) * 3.2, 0, 1);
}

function sampleAdjustedDarkness(u, v) {
  const dark = sampleDarkness(u, v);
  const edge = sampleEdge(u, v);
  return clamp(dark + edge * clamp(params.edgeBoost, 0, 2) * 0.28, 0, 1);
}

function analyzeDarknessRange() {
  if (!pInst) return { min: 0, max: 1 };
  let dMin = 1;
  let dMax = 0;
  const scanStep = Math.max(2, Math.floor(Math.min(pInst.width, pInst.height) / 220));
  for (let y = 0; y < pInst.height; y += scanStep) {
    for (let x = 0; x < pInst.width; x += scanStep) {
      const u = x / Math.max(1, pInst.width - 1);
      const v = y / Math.max(1, pInst.height - 1);
      if (!isInImageContentUv(u, v)) continue;
      const dark = sampleAdjustedDarkness(u, v);
      if (dark < dMin) dMin = dark;
      if (dark > dMax) dMax = dark;
    }
  }
  if (!(dMax > dMin)) return { min: 0, max: 1 };
  return { min: dMin, max: dMax };
}

function buildBandThresholds() {
  const bands = Math.max(2, Math.floor(params.bandCount));
  const curve = clamp(params.bandCurve, 0.2, 3.0);
  const range = Math.max(1e-5, darknessRange.max - darknessRange.min);
  const edges = [];
  for (let i = 0; i <= bands; i++) {
    const t = i / bands;
    const shaped = Math.pow(t, curve);
    edges.push(darknessRange.min + shaped * range);
  }
  return edges;
}

function heightField(nx, ny, fieldOffset) {
  const s = clamp(params.fieldScale, 0.05, 4.0);
  const w = clamp(params.fieldWarp, 0, 2);
  const mix = clamp(params.octaveMix, 0, 1);
  const ox = fieldOffset * 13.73;
  const oy = fieldOffset * 9.17;

  const x = nx * s + ox;
  const y = ny * s + oy;
  const wx = x + (valueNoise(x * 1.3 + 17.2, y * 1.3 + 9.1) - 0.5) * w;
  const wy = y + (valueNoise(y * 1.1 + 5.3, x * 1.1 + 21.7) - 0.5) * w;
  const n1 = valueNoise(wx * 1.4 + 31.2, wy * 1.4 + 7.8);
  const n2 = valueNoise(wx * 2.8 + 12.6, wy * 2.8 + 44.2);
  const n3 = valueNoise(wx * 5.6 + 63.1, wy * 5.6 + 15.4);
  return n1 * (1 - mix * 0.5) + n2 * (mix * 0.35) + n3 * (mix * 0.15);
}

function flowVectorUv(u, v, fieldOffset) {
  const eps = clamp(params.gradientStep, 0.0005, 0.02);
  const hx1 = heightField(u + eps, v, fieldOffset);
  const hx2 = heightField(u - eps, v, fieldOffset);
  const hy1 = heightField(u, v + eps, fieldOffset);
  const hy2 = heightField(u, v - eps, fieldOffset);
  const gx = (hx1 - hx2) / (2 * eps);
  const gy = (hy1 - hy2) / (2 * eps);
  return normalize(-gy, gx);
}

function bandFieldOffset(bandIndex, bandCount) {
  return (bandIndex + 1) / Math.max(1, bandCount);
}

function cellKey(ix, iy) { return `${ix},${iy}`; }
function toCell(v) { return Math.floor(v / occupancyCell); }
function clearOccupancy() { occupancy = new Map(); }

function isDarkInMask(dark, minThreshold, maxThreshold = null) {
  if (dark < minThreshold) return false;
  if (maxThreshold == null) return true;
  return dark < maxThreshold;
}

function addOccupancyPoint(x, y, owner) {
  const ix = toCell(x);
  const iy = toCell(y);
  const key = cellKey(ix, iy);
  const list = occupancy.get(key);
  const item = { x, y, owner };
  if (!list) {
    occupancy.set(key, [item]);
    return;
  }
  if (list.length < MAX_POINTS_PER_CELL) {
    list.push(item);
    return;
  }
  list[Math.floor(Math.random() * list.length)] = item;
}

function collidesWithTrace(x, y, radius, owner) {
  const ix = toCell(x);
  const iy = toCell(y);
  const search = Math.max(1, Math.ceil(radius / occupancyCell));
  const r2 = radius * radius;
  for (let yy = iy - search; yy <= iy + search; yy++) {
    for (let xx = ix - search; xx <= ix + search; xx++) {
      const list = occupancy.get(cellKey(xx, yy));
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (s.owner === owner) continue;
        const dx = s.x - x;
        const dy = s.y - y;
        if (dx * dx + dy * dy < r2) return true;
      }
    }
  }
  return false;
}

function traceDirection(x0, y0, dirSign, owner, minThreshold, maxThreshold, width, clearance, fieldOffset) {
  const points = [{ x: x0, y: y0 }];
  const maxSteps = Math.max(4, Math.floor(params.traceSteps));
  const stepLen = clamp(params.stepLength, 0.1, 6.0);

  let x = x0;
  let y = y0;
  for (let i = 0; i < maxSteps; i++) {
    const u = x / Math.max(1, pInst.width - 1);
    const v = y / Math.max(1, pInst.height - 1);
    if (!isInImageContentUv(u, v)) break;
    const dark = sampleAdjustedDarkness(u, v);
    if (!isDarkInMask(dark, minThreshold, maxThreshold)) break;

    const [vx, vy] = flowVectorUv(u, v, fieldOffset);
    const jitterAmp = clamp(params.jitter, 0, 1.5) * stepLen * 0.35;
    const jx = (hash2(x * 0.013 + i * 0.17 + owner, y * 0.011 + i * 0.09) - 0.5) * jitterAmp;
    const jy = (hash2(y * 0.014 + i * 0.15 + owner, x * 0.012 + i * 0.07) - 0.5) * jitterAmp;
    const nx = x + vx * stepLen * dirSign + jx;
    const ny = y + vy * stepLen * dirSign + jy;

    if (nx < 0 || ny < 0 || nx >= pInst.width || ny >= pInst.height) break;
    if (collidesWithTrace(nx, ny, clearance, owner)) break;

    x = nx;
    y = ny;
    points.push({ x, y });
    addOccupancyPoint(x, y, owner);
  }

  if (points.length < 2) return false;
  for (let i = 1; i < points.length; i++) {
    hatchLayer.line(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
  }
  return true;
}

function drawCluster(anchor, clusterIndex, layerIndex) {
  const baseU = anchor.x / Math.max(1, pInst.width - 1);
  const baseV = anchor.y / Math.max(1, pInst.height - 1);
  const [vx, vy] = flowVectorUv(baseU, baseV, anchor.fieldOffset);
  const nx = -vy;
  const ny = vx;

  const lanes = Math.max(1, Math.floor(params.clusterLanes));
  const laneGap = Math.max(0.2, anchor.spacing * clamp(params.clusterGap, 0.2, 3.0));
  const centerOffset = (lanes - 1) * 0.5;
  const clearance = Math.max(0.6, anchor.width * 0.58 + laneGap * 0.2);

  let drawn = 0;
  for (let j = 0; j < lanes; j++) {
    const lane = (j - centerOffset) * laneGap;
    const sx = anchor.x + nx * lane;
    const sy = anchor.y + ny * lane;
    if (sx < 0 || sy < 0 || sx >= pInst.width || sy >= pInst.height) continue;
    const su = sx / Math.max(1, pInst.width - 1);
    const sv = sy / Math.max(1, pInst.height - 1);
    if (!isInImageContentUv(su, sv)) continue;
    if (!isDarkInMask(sampleAdjustedDarkness(su, sv), anchor.minThreshold, anchor.maxThreshold)) continue;
    const owner = layerIndex * 1000000 + clusterIndex * 10 + j + 1;
    if (collidesWithTrace(sx, sy, clearance, owner)) continue;
    addOccupancyPoint(sx, sy, owner);
    const a = traceDirection(sx, sy, -1, owner, anchor.minThreshold, anchor.maxThreshold, anchor.width, clearance, anchor.fieldOffset);
    const b = traceDirection(sx, sy, 1, owner, anchor.minThreshold, anchor.maxThreshold, anchor.width, clearance, anchor.fieldOffset);
    if (a || b) drawn += 1;
  }
  return drawn;
}

function buildAnchorsForBand(minThreshold, maxThreshold, density, spacing, width, bandIndex, bandCount) {
  const anchors = [];
  const jitterAmp = spacing * clamp(params.jitter, 0, 1.5);
  const step = Math.max(1.5, spacing);
  for (let y = step * 0.5; y < pInst.height; y += step) {
    for (let x = step * 0.5; x < pInst.width; x += step) {
      const jx = (hash2(x * 0.013 + bandIndex * 21.7, y * 0.017 + bandIndex * 9.3) - 0.5) * jitterAmp;
      const jy = (hash2(y * 0.015 + bandIndex * 19.1, x * 0.016 + bandIndex * 7.7) - 0.5) * jitterAmp;
      const ax = clamp(x + jx, 0, pInst.width - 1);
      const ay = clamp(y + jy, 0, pInst.height - 1);
      const u = ax / Math.max(1, pInst.width - 1);
      const v = ay / Math.max(1, pInst.height - 1);
      if (!isInImageContentUv(u, v)) continue;
      const dark = sampleAdjustedDarkness(u, v);
      if (!isDarkInMask(dark, minThreshold, maxThreshold)) continue;
      const keep = clamp(density, 0, 1);
      if (Math.random() > keep) continue;
      anchors.push({
        x: ax,
        y: ay,
        minThreshold,
        maxThreshold,
        spacing,
        width,
        fieldOffset: bandFieldOffset(bandIndex, bandCount),
      });
    }
  }
  return anchors;
}

function beginGeneration() {
  if (!pInst || !hatchLayer) return;
  darknessRange = analyzeDarknessRange();
  const edges = buildBandThresholds();
  const bands = edges.length - 1;
  const darkRange = Math.max(1e-5, darknessRange.max - darknessRange.min);
  const directMaskMode = bands > 3;
  const minSpacing = Math.max(0.6, params.densityMinSpace);
  const maxSpacing = Math.max(minSpacing + 0.01, params.densityMaxSpace);
  const width = clamp(params.strokeWidth, 0.1, 6.0);

  const layers = [];
  for (let i = 0; i < bands; i++) {
    const d0 = edges[i];
    const d1 = edges[i + 1];
    let normalizedDelta;
    let maxThreshold = null;
    if (directMaskMode) {
      // For higher band counts, draw each band as an independent mask instead
      // of differential stacking to prevent tiny deltas from disappearing.
      const center = (d0 + d1) * 0.5;
      normalizedDelta = clamp((center - darknessRange.min) / darkRange, 0, 1);
      maxThreshold = d1;
    } else {
      const delta = Math.max(0, d1 - d0);
      normalizedDelta = delta / darkRange;
    }
    const density = clamp(normalizedDelta * params.densityGain, 0, 1);
    if (density <= 0.0001) continue;
    const spacing = lerp(maxSpacing, minSpacing, density);
    const bandAnchors = buildAnchorsForBand(d0, maxThreshold, density, spacing, width, i, bands);
    if (!bandAnchors.length) continue;
    layers.push({
      bandIndex: i,
      minThreshold: d0,
      maxThreshold,
      density,
      spacing,
      anchors: bandAnchors,
    });
  }

  generationState = {
    layers,
    layerIndex: 0,
    anchorIndex: 0,
    doneNotified: false,
  };

  occupancyCell = Math.max(2, width * 1.15 + minSpacing * 0.22);
  clearOccupancy();

  hatchLayer.clear();
  const ink = hsvToRgb((params.inkHue % 360) / 360, clamp(params.inkSat, 0, 1), clamp(params.inkValue, 0, 1));
  hatchLayer.stroke(ink[0] * 255, ink[1] * 255, ink[2] * 255, clamp(params.inkAlpha, 0.05, 1) * 255);
  hatchLayer.strokeWeight(width);
  hatchLayer.strokeCap(hatchLayer.ROUND);
  hatchLayer.strokeJoin(hatchLayer.ROUND);
  hatchLayer.noFill();
}

function processGenerationChunk() {
  if (!generationState) return;
  if (generationState.layerIndex >= generationState.layers.length) {
    if (!generationState.doneNotified && bridge) {
      generationState.doneNotified = true;
      bridge.notifyValuesChanged();
      sendPreview();
    }
    return;
  }
  const speed = clamp(params.speed, 0, 4);
  if (speed <= 0) return;

  const perFrame = Math.max(1, Math.floor(52 * speed));
  let budget = perFrame;
  while (budget > 0 && generationState.layerIndex < generationState.layers.length) {
    const layer = generationState.layers[generationState.layerIndex];
    if (generationState.anchorIndex >= layer.anchors.length) {
      generationState.layerIndex += 1;
      generationState.anchorIndex = 0;
      clearOccupancy(); // each tonal-difference layer gets its own occupancy budget
      continue;
    }
    const anchor = layer.anchors[generationState.anchorIndex];
    drawCluster(anchor, generationState.anchorIndex + 1, generationState.layerIndex + 1);
    generationState.anchorIndex += 1;
    budget -= 1;
  }
}

function regenerateArtwork() {
  beginGeneration();
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
  regenerateArtwork();
  if (notify && bridge) {
    bridge.extras.seed = seed;
    bridge.extras.paused = paused;
    bridge.notifyValuesChanged();
  }
}

function randomizeAll() {
  pushHistorySnapshot();
  schema.forEach((cfg) => {
    if (cfg.type === "image-loader") return;
    if (!Number.isFinite(cfg.min) || !Number.isFinite(cfg.max) || !Number.isFinite(cfg.step) || cfg.step <= 0) return;
    const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
    const quantized = Math.round(raw / cfg.step) * cfg.step;
    params[cfg.id] = Number(quantized.toFixed(6));
  });
  seed = Math.floor(Math.random() * 2147483646) + 1;
  regenerateArtwork();
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
  bridge.notifyValuesChanged();
}

function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  regenerateArtwork();
  bridge.extras.seed = seed;
  bridge.notifyValuesChanged();
}

function togglePause() {
  pushHistorySnapshot();
  paused = !paused;
  bridge.extras.paused = paused;
  bridge.notifyValuesChanged();
}

function undoHistory() {
  if (!history.undoStack.length) return;
  const current = snapshotState();
  const prev = history.undoStack.pop();
  history.redoStack.push(current);
  history.suppress = true;
  try { applySnapshot(prev); } finally { history.suppress = false; }
}

function redoHistory() {
  if (!history.redoStack.length) return;
  const current = snapshotState();
  const next = history.redoStack.pop();
  history.undoStack.push(current);
  history.suppress = true;
  try { applySnapshot(next); } finally { history.suppress = false; }
}

function sendPreview() {
  if (!pInst || !pInst.canvas) return;
  const image = pInst.canvas.toDataURL("image/jpeg", 0.82);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
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
      regenerateArtwork();
    },
    onExtras: (nextExtras) => {
      if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed) && nextExtras.seed !== seed) {
        pushHistorySnapshot();
        seed = Math.max(1, Math.floor(nextExtras.seed));
        regenerateArtwork();
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
  const msg = event.data;
  if (!msg) return;
  if (msg.type === "shaderops/request-preview") { sendPreview(); return; }
  if (msg.type === "shaderops/image-load" && msg.imageData) {
    imageState = {
      loaded: true,
      name: msg.name || "image",
      width: msg.imageData.width,
      height: msg.imageData.height,
      data: msg.imageData.data,
    };
    regenerateArtwork();
    return;
  }
  if (msg.type === "shaderops/image-clear") {
    imageState = { loaded: false, name: "none", width: 0, height: 0, data: null };
    regenerateArtwork();
  }
});

window.addEventListener("beforeunload", () => sendPreview());
window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "z") return;
  event.preventDefault();
  if (event.shiftKey) redoHistory();
  else undoHistory();
});

document.title = "Gradient Diff Hatching (Per-Band Field)";

new window.p5((p) => {
  pInst = p;
  p.setup = () => {
    const c = p.createCanvas(window.innerWidth, window.innerHeight);
    c.parent("app");
    hatchLayer = p.createGraphics(p.width, p.height);
    initBridge();
    regenerateArtwork();
    sendPreview();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    hatchLayer = p.createGraphics(p.width, p.height);
    regenerateArtwork();
    sendPreview();
  };

  p.draw = () => {
    if (!paused) processGenerationChunk();
    p.background(clamp(params.paper, 0.82, 1.0) * 255);
    p.image(hatchLayer, 0, 0);
    if (p.frameCount % 30 === 0) sendPreview();
  };
}, document.getElementById("app"));
