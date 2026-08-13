const PROJECT_ID = new URLSearchParams(location.search).get("project") || "divfree-scratch-streamlines";

const PRESET = {
  fieldScale: 1.0,
  fieldWarp: 0.45,
  octaveMix: 0.58,
  gradientStep: 0.0028,
  lineCount: 380,
  traceSteps: 170,
  stepLength: 1.45,
  speed: 1.0,
  strokeWidth: 1.25,
  clearance: 0.14,
  strokeShape: 0,
  colorMode: 0,
  edgeBlur: 0.18,
  colorJitter: 0.22,
  imageMix: 1.0,
  imagePrecision: 0.72,
  scratchThreshold: 0.22,
  scratchDragMax: 0.18,
  clusterMin: 2,
  clusterMax: 5,
  clusterGap: 0.84,
  anchorRandom: 0.72,
  hue: 226,
  sat: 0.72,
  alpha: 0.78,
  bgValue: 0.06,
};

const schema = [
  { id: "fieldScale", label: "Field Scale", group: "Field", min: 0.08, max: 2.8, step: 0.01, default: PRESET.fieldScale },
  { id: "fieldWarp", label: "Field Warp", group: "Field", min: 0.0, max: 1.8, step: 0.01, default: PRESET.fieldWarp },
  { id: "octaveMix", label: "Octave Mix", group: "Field", min: 0.0, max: 1.0, step: 0.01, default: PRESET.octaveMix },
  { id: "gradientStep", label: "Gradient Step", group: "Field", min: 0.0008, max: 0.01, step: 0.0001, default: PRESET.gradientStep },
  { id: "lineCount", label: "Line Count", group: "Lines", min: 30, max: 2200, step: 1, default: PRESET.lineCount },
  { id: "traceSteps", label: "Trace Steps", group: "Lines", min: 20, max: 520, step: 1, default: PRESET.traceSteps, hint: "How many integration steps each line traces through the flow field — higher = longer lines" },
  { id: "stepLength", label: "Step Length", group: "Lines", min: 0.2, max: 6.0, step: 0.01, default: PRESET.stepLength },
  { id: "speed", label: "Build Speed", group: "Lines", min: 0.0, max: 4.0, step: 0.01, default: PRESET.speed, hint: "How fast lines are generated per frame — 0 pauses build, higher values build faster" },
  { id: "strokeWidth", label: "Stroke Width", group: "Stroke", min: 0.2, max: 18.0, step: 0.01, default: PRESET.strokeWidth },
  {
    id: "strokeShape", label: "Stroke Shape", group: "Stroke", min: 0, max: 1, step: 1, default: PRESET.strokeShape,
    type: "select", options: [
      { value: 0, label: "Round" },
      { value: 1, label: "Square" },
    ],
  },
  {
    id: "colorMode", label: "Color Mode", group: "Stroke", min: 0, max: 1, step: 1, default: PRESET.colorMode,
    type: "select", options: [
      { value: 0, label: "Solid" },
      { value: 1, label: "Varied" },
    ],
  },
  { id: "edgeBlur", label: "Edge Blur", group: "Stroke", min: 0.0, max: 1.0, step: 0.01, default: PRESET.edgeBlur },
  { id: "colorJitter", label: "Color Jitter", group: "Stroke", min: 0.0, max: 1.0, step: 0.01, default: PRESET.colorJitter },
  { id: "imageMix", label: "Source Mix", group: "Stroke", min: 0.0, max: 1.0, step: 0.01, default: PRESET.imageMix, hint: "How strongly the stroke colour follows the source map or uploaded image" },
  { id: "imagePrecision", label: "Source Precision", group: "Stroke", min: 0.0, max: 1.0, step: 0.01, default: PRESET.imagePrecision, hint: "Source color sampling rate — 0: one solid color per stroke, 1: resampled at every step" },
  { id: "imageLoader", label: "Image", group: "Stroke", type: "image-loader" },
  { id: "clearance", label: "Clearance", group: "Stroke", min: 0.0, max: 2.2, step: 0.01, default: PRESET.clearance },
  { id: "scratchThreshold", label: "Drag Threshold", group: "Scratch", min: 0.0, max: 1.0, step: 0.01, default: PRESET.scratchThreshold, hint: "How much colour contrast is needed before the scratch drag starts" },
  { id: "scratchDragMax", label: "Max Drag", group: "Scratch", min: 0.0, max: 1.0, step: 0.01, default: PRESET.scratchDragMax, hint: "Maximum drag length across the source map before the stroke resumes fresh sampling" },
  { id: "clusterMin", label: "Cluster Min", group: "Cluster", min: 1, max: 8, step: 1, default: PRESET.clusterMin },
  { id: "clusterMax", label: "Cluster Max", group: "Cluster", min: 1, max: 10, step: 1, default: PRESET.clusterMax },
  { id: "clusterGap", label: "Cluster Gap", group: "Cluster", min: 0.3, max: 2.2, step: 0.01, default: PRESET.clusterGap },
  { id: "anchorRandom", label: "Anchor Random", group: "Cluster", min: 0.0, max: 1.0, step: 0.01, default: PRESET.anchorRandom },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: PRESET.hue },
  { id: "sat", label: "Sat", group: "Color", min: 0.1, max: 1.0, step: 0.01, default: PRESET.sat },
  { id: "alpha", label: "Alpha", group: "Color", min: 0.05, max: 1.0, step: 0.01, default: PRESET.alpha },
  { id: "bgValue", label: "BG Value", group: "Color", min: 0.0, max: 0.2, step: 0.002, default: PRESET.bgValue },
];

const params = {};
schema.forEach((cfg) => {
  if (cfg.type === "image-loader") return;
  params[cfg.id] = cfg.default;
});

let seed = 947251;
let paused = false;
let bridge = null;
let pInst = null;
let trailsLayer = null;
let frameLayer = null;
let fieldRadius = 220;
let fieldCenterX = 0;
let fieldCenterY = 0;
let occupancy = new Map();
let occupancyCell = 8;
let generationState = null;
let imageState = {
  loaded: false,
  name: "none",
  width: 0,
  height: 0,
  data: null,
  preview: null,
};

const MAX_POINTS_PER_CELL = 48;
const history = { undoStack: [], redoStack: [], limit: 120, suppress: false };

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

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

function mixColor(a, b, t) {
  const k = clamp(t, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}

function computeFieldMetrics() {
  const dim = Math.min(pInst.width, pInst.height);
  fieldRadius = dim * 0.43;
  fieldCenterX = pInst.width * 0.5;
  fieldCenterY = pInst.height * 0.5;
}

function smoothstep(t) { return t * t * (3 - 2 * t); }

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

  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

function heightField(nx, ny) {
  const s = clamp(params.fieldScale, 0.05, 4.0);
  const w = clamp(params.fieldWarp, 0, 2);
  const mix = clamp(params.octaveMix, 0, 1);

  const x = nx * s;
  const y = ny * s;

  const wx = x + (valueNoise(x * 1.3 + 17.2, y * 1.3 + 9.1) - 0.5) * w;
  const wy = y + (valueNoise(y * 1.1 + 5.3, x * 1.1 + 21.7) - 0.5) * w;

  const n1 = valueNoise(wx * 1.4 + 31.2, wy * 1.4 + 7.8);
  const n2 = valueNoise(wx * 2.8 + 12.6, wy * 2.8 + 44.2);
  const n3 = valueNoise(wx * 5.6 + 63.1, wy * 5.6 + 15.4);

  return n1 * (1 - mix * 0.5) + n2 * (mix * 0.35) + n3 * (mix * 0.15);
}

function flowVectorWorld(x, y) {
  const nx = x / fieldRadius;
  const ny = y / fieldRadius;
  const eps = clamp(params.gradientStep, 0.0005, 0.02);

  const hx1 = heightField(nx + eps, ny);
  const hx2 = heightField(nx - eps, ny);
  const hy1 = heightField(nx, ny + eps);
  const hy2 = heightField(nx, ny - eps);

  const gx = (hx1 - hx2) / (2 * eps);
  const gy = (hy1 - hy2) / (2 * eps);

  const vx = -gy;
  const vy = gx;
  return normalize(vx, vy);
}

function inField(x, y) {
  return Math.abs(x) <= fieldRadius && Math.abs(y) <= fieldRadius;
}

function traceCollisionRadius(width) {
  const extraGap = Math.max(0, params.clearance) * width;
  return Math.max(width * 0.62, width * 0.62 + extraGap);
}

function cellKey(ix, iy) { return `${ix},${iy}`; }
function toCell(v) { return Math.floor(v / occupancyCell); }
function clearOccupancy() { occupancy = new Map(); }

function addOccupancyPoint(x, y, owner, tx = 0, ty = 0) {
  const ix = toCell(x);
  const iy = toCell(y);
  const key = cellKey(ix, iy);
  const list = occupancy.get(key);
  const item = { x, y, owner, tx, ty };
  if (!list) {
    occupancy.set(key, [item]);
    return;
  }
  if (list.length < MAX_POINTS_PER_CELL) {
    list.push(item);
    return;
  }
  const replaceIndex = Math.floor(Math.random() * list.length);
  list[replaceIndex] = item;
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
          if (alignment > 0.93) effectiveRadius *= 0.42;
          else if (alignment > 0.78) effectiveRadius *= 0.67;
        }
        if (Math.hypot(x - sample.x, y - sample.y) < effectiveRadius) return true;
      }
    }
  }
  return false;
}

function recordSegment(ax, ay, bx, by, owner, radius) {
  const len = Math.hypot(bx - ax, by - ay);
  const step = Math.max(1, radius * 0.75);
  const samples = Math.max(1, Math.ceil(len / step));
  const tx = len > 1e-6 ? (bx - ax) / len : 0;
  const ty = len > 1e-6 ? (by - ay) / len : 0;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    addOccupancyPoint(ax + (bx - ax) * t, ay + (by - ay) * t, owner, tx, ty);
  }
}

function lineColor(index) {
  const baseH = ((params.hue % 360) + 360) % 360 / 360;
  const sat = clamp(params.sat, 0, 1);
  const n = hash2(index * 0.771, index * 0.117);
  const m = hash2(index * 0.119 + 4.3, index * 0.901 + 2.8);
  const hue = (baseH + (n - 0.5) * 0.1 + m * 0.04) % 1;
  const val = 0.7 + n * 0.24;
  const rgb = hsvToRgb((hue + 1) % 1, sat * (0.65 + m * 0.35), val);
  return [rgb[0] * 255, rgb[1] * 255, rgb[2] * 255];
}

function applyColorJitter(baseColor, id, stepIndex, stepRatio) {
  const jitter = clamp(params.colorJitter, 0, 1);
  if (jitter <= 0.0001) return baseColor;
  const tied = 0.22 + 0.78 * stepRatio;
  const amp = jitter * tied;
  const h = hash2(id * 0.173 + stepIndex * 0.071, id * 0.419 - stepIndex * 0.117) - 0.5;
  const r = clamp(baseColor[0] + (h * 2.0) * 90 * amp, 0, 255);
  const g = clamp(baseColor[1] + (h * -1.3) * 75 * amp, 0, 255);
  const b = clamp(baseColor[2] + (h * 1.1) * 85 * amp, 0, 255);
  return [r, g, b];
}

function colorContrast01(a, b) {
  if (!a || !b) return 0;
  const dr = (a[0] - b[0]) / 255;
  const dg = (a[1] - b[1]) / 255;
  const db = (a[2] - b[2]) / 255;
  return clamp(Math.hypot(dr, dg, db) / Math.sqrt(3), 0, 1);
}

function mapSquareUvToImageUv(u, v) {
  if (!imageState.loaded || !imageState.data || imageState.width < 1 || imageState.height < 1) return null;
  const imageAspect = Math.max(1e-5, imageState.width / Math.max(1, imageState.height));
  const mappedU = (u - 0.5) / imageAspect + 0.5;
  if (mappedU < 0 || mappedU > 1 || v < 0 || v > 1) return null;
  return { u: mappedU, v };
}

function isInImageContentWorld(x, y) {
  if (!imageState.loaded) return true;
  const u = clamp((x / fieldRadius + 1) * 0.5, 0, 1);
  const v = clamp((y / fieldRadius + 1) * 0.5, 0, 1);
  return !!mapSquareUvToImageUv(u, v);
}

function sampleImageColorWorld(x, y) {
  if (!imageState.loaded || !imageState.data) return null;
  const u = clamp((x / fieldRadius + 1) * 0.5, 0, 1);
  const v = clamp((y / fieldRadius + 1) * 0.5, 0, 1);
  const mapped = mapSquareUvToImageUv(u, v);
  if (!mapped) return null;
  const ix = Math.floor(mapped.u * (imageState.width - 1));
  const iy = Math.floor(mapped.v * (imageState.height - 1));
  const idx = (iy * imageState.width + ix) * 4;
  const d = imageState.data;
  return [d[idx], d[idx + 1], d[idx + 2]];
}

function proceduralSourceColorWorld(x, y) {
  const nx = x / Math.max(1, fieldRadius);
  const ny = y / Math.max(1, fieldRadius);
  const h = clamp(heightField(nx, ny), 0, 1);
  const accent = valueNoise(nx * 1.8 + 9.4, ny * 1.8 + 2.7);
  const ridge = Math.abs(valueNoise(nx * 3.4 + 17.3, ny * 3.4 + 6.8) - 0.5) * 2;
  const baseH = ((params.hue % 360) + 360) % 360 / 360;
  const hue = (baseH + (h - 0.5) * 0.16 + (accent - 0.5) * 0.1 + (ridge - 0.5) * 0.05 + 1) % 1;
  const sat = clamp(params.sat * (0.52 + accent * 0.46 + ridge * 0.12), 0.08, 1);
  const val = clamp(0.18 + h * 0.48 + accent * 0.18 + ridge * 0.08, 0.04, 1);
  const rgb = hsvToRgb(hue, sat, val);
  return [rgb[0] * 255, rgb[1] * 255, rgb[2] * 255];
}

function sampleSourceColorWorld(x, y) {
  if (imageState.loaded) return sampleImageColorWorld(x, y);
  return proceduralSourceColorWorld(x, y);
}

function buildP5ImageFromRaw(imageData) {
  if (!pInst || !imageData || !imageData.data) return null;
  const img = pInst.createImage(imageData.width, imageData.height);
  img.loadPixels();
  const src = imageData.data;
  for (let i = 0; i < src.length; i++) img.pixels[i] = src[i];
  img.updatePixels();
  return img;
}

function renderProceduralSourceLayer() {
  const size = fieldRadius * 2;
  const left = fieldCenterX - fieldRadius;
  const top = fieldCenterY - fieldRadius;
  const steps = Math.max(96, Math.min(260, Math.round(size / 3.4)));
  const cell = size / steps;

  trailsLayer.noStroke();
  for (let y = 0; y < steps; y++) {
    const wy = -fieldRadius + (y + 0.5) * cell;
    for (let x = 0; x < steps; x++) {
      const wx = -fieldRadius + (x + 0.5) * cell;
      const c = proceduralSourceColorWorld(wx, wy);
      trailsLayer.fill(c[0], c[1], c[2], 255);
      trailsLayer.rect(left + x * cell, top + y * cell, cell + 1, cell + 1);
    }
  }
}

function renderSourceLayer() {
  const bg = hsvToRgb((((params.hue + 28) % 360) + 360) % 360 / 360, clamp(params.sat * 0.24, 0.05, 1), clamp(params.bgValue, 0, 0.25));
  trailsLayer.clear();
  trailsLayer.background(bg[0] * 255, bg[1] * 255, bg[2] * 255, 255);

  if (imageState.loaded && imageState.preview) {
    const size = fieldRadius * 2;
    const left = fieldCenterX - fieldRadius;
    const top = fieldCenterY - fieldRadius;
    const imageAspect = Math.max(1e-5, imageState.width / Math.max(1, imageState.height));
    const drawW = size * imageAspect;
    trailsLayer.noStroke();
    trailsLayer.fill(0, 0, 0, 255);
    trailsLayer.rect(left, top, size, size);
    trailsLayer.image(imageState.preview, left + (size - drawW) * 0.5, top, drawW, size);
    return;
  }

  renderProceduralSourceLayer();
}

function getStrokeCapMode() {
  return params.strokeShape < 0.5 ? pInst.ROUND : pInst.SQUARE;
}

function getStrokeJoinMode() {
  return params.strokeShape < 0.5 ? pInst.ROUND : pInst.MITER;
}

function drawPolylineSolid(points, color, width, alpha, blur) {
  const target = frameLayer;
  const cap = getStrokeCapMode();
  const join = getStrokeJoinMode();

  target.noFill();
  target.strokeCap(cap);
  target.strokeJoin(join);

  if (blur > 0.001) {
    target.stroke(color[0], color[1], color[2], alpha * (0.24 + blur * 0.34));
    target.strokeWeight(width * (1 + blur * 2.2));
    target.beginShape();
    for (let i = 0; i < points.length; i++) {
      target.vertex(fieldCenterX + points[i].x, fieldCenterY + points[i].y);
    }
    target.endShape();
  }

  target.stroke(color[0], color[1], color[2], alpha);
  target.strokeWeight(width);
  target.beginShape();
  for (let i = 0; i < points.length; i++) {
    target.vertex(fieldCenterX + points[i].x, fieldCenterY + points[i].y);
  }
  target.endShape();
}

function drawSegment(p0, p1, color, width, alpha, blur) {
  const target = frameLayer;
  const cap = getStrokeCapMode();
  const join = getStrokeJoinMode();

  target.strokeCap(cap);
  target.strokeJoin(join);
  target.noFill();

  const x1 = fieldCenterX + p0.x;
  const y1 = fieldCenterY + p0.y;
  const x2 = fieldCenterX + p1.x;
  const y2 = fieldCenterY + p1.y;

  if (blur > 0.001) {
    target.stroke(color[0], color[1], color[2], alpha * (0.22 + blur * 0.32));
    target.strokeWeight(width * (1 + blur * 2.0));
    target.line(x1, y1, x2, y2);
  }

  target.stroke(color[0], color[1], color[2], alpha);
  target.strokeWeight(width);
  target.line(x1, y1, x2, y2);
}

function traceDirection(seedX, seedY, sign, id, baseColor, width, clearance) {
  let x = seedX;
  let y = seedY;
  const stepBase = clamp(params.stepLength, 0.1, 8.0);
  const maxSteps = Math.floor(clamp(params.traceSteps, 8, 1000));
  const points = [{ x: seedX, y: seedY }];

  for (let i = 0; i < maxSteps; i++) {
    const [vx1, vy1] = flowVectorWorld(x, y);
    const dx1 = vx1 * sign;
    const dy1 = vy1 * sign;

    const midX = x + dx1 * stepBase * 0.5;
    const midY = y + dy1 * stepBase * 0.5;
    const [vx2, vy2] = flowVectorWorld(midX, midY);
    const dx2 = vx2 * sign;
    const dy2 = vy2 * sign;

    const nx = x + dx2 * stepBase;
    const ny = y + dy2 * stepBase;
    if (!inField(nx, ny)) break;
    if (!isInImageContentWorld(nx, ny)) break;
    if (collidesWithTrace(nx, ny, clearance, id, dx2, dy2)) break;

    points.push({ x: nx, y: ny });
    recordSegment(x, y, nx, ny, id, clearance);
    x = nx;
    y = ny;
  }

  if (points.length < 3) return false;

  const alpha = clamp(params.alpha, 0.05, 1) * 255;
  const blur = clamp(params.edgeBlur, 0, 1);
  const useSource = params.imageMix > 0.001;
  const varied = params.colorMode > 0.5 || params.colorJitter > 0.001 || useSource;

  if (!varied) {
    drawPolylineSolid(points, baseColor, width, alpha, blur);
    return true;
  }

  const precision = clamp(params.imagePrecision, 0, 1);
  const sourceInterval = precision < 0.001
    ? maxSteps + 1
    : Math.max(1, Math.round((1 - precision) * (maxSteps - 1) + 1));
  let sampledColor = useSource ? (sampleSourceColorWorld(points[0].x, points[0].y) || baseColor) : baseColor;
  let lastSourceColor = sampledColor;
  const dragThreshold = clamp(params.scratchThreshold, 0, 1);
  const maxDragDistance = fieldRadius * clamp(params.scratchDragMax, 0, 1);
  let dragColor = null;
  let dragRemaining = 0;

  for (let i = 1; i < points.length; i++) {
    const ratio = i / Math.max(1, points.length - 1);
    let c = baseColor;

    if (params.colorMode > 0.5 || params.colorJitter > 0.001) {
      c = applyColorJitter(c, id, i, ratio);
    }

    if (useSource && (i % sourceInterval === 0 || i === 1 || dragRemaining <= 0.0001)) {
      const picked = sampleSourceColorWorld(points[i].x, points[i].y);
      if (picked) {
        if (lastSourceColor && maxDragDistance > 0.0001) {
          const contrast = colorContrast01(lastSourceColor, picked);
          if (contrast > dragThreshold) {
            const dragT = (contrast - dragThreshold) / Math.max(0.0001, 1 - dragThreshold);
            dragRemaining = Math.max(stepBase, dragT * maxDragDistance);
            dragColor = [...lastSourceColor];
          }
        }
        sampledColor = picked;
        lastSourceColor = picked;
      }
    }

    if (useSource) {
      let sourceColor = sampledColor;
      if (dragRemaining > 0.0001 && dragColor) {
        const fade = clamp(dragRemaining / Math.max(stepBase, maxDragDistance), 0, 1);
        sourceColor = mixColor(sampledColor, dragColor, smoothstep(fade));
      }
      c = mixColor(c, sourceColor, params.imageMix);
    }

    drawSegment(points[i - 1], points[i], c, width, alpha, blur);
    if (dragRemaining > 0.0001) {
      dragRemaining = Math.max(0, dragRemaining - Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
      if (dragRemaining <= 0.0001) dragColor = null;
    }
  }
  return true;
}

function drawCluster(anchorX, anchorY, clusterIndex, lineSerial, clearance, width) {
  const [fx, fy] = flowVectorWorld(anchorX, anchorY);
  const nx = -fy;
  const ny = fx;
  const minC = Math.floor(clamp(params.clusterMin, 1, 12));
  const maxC = Math.max(minC, Math.floor(clamp(params.clusterMax, 1, 16)));
  const lanes = minC + Math.floor(hash2(clusterIndex * 0.41, clusterIndex * 1.13) * (maxC - minC + 1));
  const laneGap = Math.max(0.2, width * clamp(params.clusterGap, 0.2, 3.2));
  const centerOffset = (lanes - 1) * 0.5;

  let drawn = 0;
  for (let j = 0; j < lanes; j++) {
    const lane = (j - centerOffset) * laneGap;
    const sx = anchorX + nx * lane;
    const sy = anchorY + ny * lane;
    if (!inField(sx, sy)) continue;
    if (!isInImageContentWorld(sx, sy)) continue;
    if (collidesWithTrace(sx, sy, clearance, -1, fx, fy)) continue;

    const id = lineSerial + j;
    const col = lineColor(id);
    addOccupancyPoint(sx, sy, id, fx, fy);

    const drewA = traceDirection(sx, sy, -1, id, col, width, clearance);
    const drewB = traceDirection(sx, sy, 1, id, col, width, clearance);
    if (drewA || drewB) drawn += 1;
  }
  return drawn;
}

function prepareFrameLayers() {
  renderSourceLayer();
  frameLayer.clear();
}

function beginGeneration() {
  if (!pInst || !trailsLayer || !frameLayer) return;
  computeFieldMetrics();
  const width = clamp(params.strokeWidth, 0.1, 26.0);
  const clearance = traceCollisionRadius(width);
  occupancyCell = Math.max(2, clearance * 0.72);
  clearOccupancy();
  prepareFrameLayers();

  const target = Math.floor(clamp(params.lineCount, 1, 6000));
  generationState = {
    target,
    drawn: 0,
    lineSerial: 1,
    attempts: 0,
    maxAttempts: Math.max(180, target * 6),
    randomBias: clamp(params.anchorRandom, 0, 1),
    width,
    clearance,
    rng: mulberry32(seed >>> 0),
    done: false,
  };
}

function processGenerationChunk() {
  if (!generationState || generationState.done) return;
  const buildSpeed = clamp(params.speed ?? 1, 0, 4);
  if (buildSpeed <= 0) return;
  const started = performance.now();
  const timeBudgetMs = 7.5 * buildSpeed;
  const maxClustersPerFrame = Math.max(1, Math.floor(14 * buildSpeed));
  let clusters = 0;

  while (!generationState.done && clusters < maxClustersPerFrame) {
    if (generationState.attempts >= generationState.maxAttempts || generationState.drawn >= generationState.target) {
      generationState.done = true;
      break;
    }

    const rng = generationState.rng;
    generationState.attempts += 1;
    const radialBias = 0.35 + rng() * 0.65;
    const rx = (rng() * 2 - 1) * fieldRadius * radialBias;
    const ry = (rng() * 2 - 1) * fieldRadius * radialBias;
    const jx = (rng() * 2 - 1) * fieldRadius * 0.16 * generationState.randomBias;
    const jy = (rng() * 2 - 1) * fieldRadius * 0.16 * generationState.randomBias;
    const ax = rx + jx;
    const ay = ry + jy;
    if (!inField(ax, ay)) {
      if (performance.now() - started > timeBudgetMs) break;
      continue;
    }

    const added = drawCluster(ax, ay, generationState.attempts, generationState.lineSerial, generationState.clearance, generationState.width);
    generationState.drawn += added;
    generationState.lineSerial += Math.max(1, added);
    clusters += 1;

    if (performance.now() - started > timeBudgetMs) break;
  }

  if (generationState.done && bridge) bridge.notifyValuesChanged();
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
  const image = pInst.canvas.toDataURL("image/jpeg", 0.8);
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
      preview: buildP5ImageFromRaw(msg.imageData),
    };
    regenerateArtwork();
    return;
  }
  if (msg.type === "shaderops/image-clear") {
    imageState = { loaded: false, name: "none", width: 0, height: 0, data: null, preview: null };
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

document.title = "Divergence-Free Scratch Streamlines";

new window.p5((p) => {
  pInst = p;
  p.setup = () => {
    const c = p.createCanvas(window.innerWidth, window.innerHeight);
    c.parent("app");
    trailsLayer = p.createGraphics(p.width, p.height);
    frameLayer = p.createGraphics(p.width, p.height);
    initBridge();
    regenerateArtwork();
    sendPreview();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    trailsLayer = p.createGraphics(p.width, p.height);
    frameLayer = p.createGraphics(p.width, p.height);
    regenerateArtwork();
    sendPreview();
  };

  p.draw = () => {
    if (!paused) processGenerationChunk();
    p.image(trailsLayer, 0, 0);
    p.image(frameLayer, 0, 0);
    if (p.frameCount % 30 === 0) sendPreview();
  };
}, document.getElementById("app"));
