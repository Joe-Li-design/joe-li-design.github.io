const PROJECT_ID = new URLSearchParams(location.search).get("project") || "edge-radiant-honeycomb-matrix";

const PRESET = {
  speed: 0.0,
  cellSize: 22.0,
  squareScale: 0.66,
  squareSampleResolution: 0.8,
  squareEdgeSoftness: 0.08,
  edgeSamplePx: 1.2,
  edgeThreshold: 0.2,
  edgeSoftness: 0.08,
  edgeRadius: 12.0,
  edgeGain: 1.25,
  attractStrength: 0.22,
  influenceRadius: 120.0,
  minGapRatio: 0.72,
  relaxPasses: 2,
  trailStepsPerFrame: 1,
  bgTone: 1.0,
};

const schema = [
  { id: "speed", label: "Speed", group: "Global", min: 0.0, max: 2.0, step: 0.01, default: PRESET.speed },
  { id: "cellSize", label: "Cell Size", group: "Matrix", min: 8.0, max: 80.0, step: 0.1, default: PRESET.cellSize },
  { id: "squareScale", label: "Square Scale", group: "Matrix", min: 0.2, max: 1.2, step: 0.01, default: PRESET.squareScale },
  { id: "squareSampleResolution", label: "Square Sample Resolution", group: "Matrix", min: 0.0, max: 1.0, step: 0.01, default: PRESET.squareSampleResolution },
  { id: "squareEdgeSoftness", label: "Square Edge Softness", group: "Matrix", min: 0.0, max: 0.5, step: 0.01, default: PRESET.squareEdgeSoftness },

  { id: "edgeSamplePx", label: "Edge Sample", group: "Image1 Edge", min: 0.5, max: 6.0, step: 0.1, default: PRESET.edgeSamplePx },
  { id: "edgeThreshold", label: "Edge Threshold", group: "Image1 Edge", min: 0.01, max: 0.95, step: 0.01, default: PRESET.edgeThreshold },
  { id: "edgeSoftness", label: "Edge Soft", group: "Image1 Edge", min: 0.001, max: 0.4, step: 0.001, default: PRESET.edgeSoftness },
  { id: "edgeRadius", label: "Radiant Radius", group: "Image1 Edge", min: 0.0, max: 60.0, step: 0.1, default: PRESET.edgeRadius },
  { id: "edgeGain", label: "Edge Gain", group: "Image1 Edge", min: 0.1, max: 3.0, step: 0.01, default: PRESET.edgeGain },

  { id: "attractStrength", label: "Attract Amp", group: "Attractor Dynamics", min: 0.0, max: 1.2, step: 0.01, default: PRESET.attractStrength },
  { id: "influenceRadius", label: "Influence Radius", group: "Attractor Dynamics", min: 10.0, max: 360.0, step: 1, default: PRESET.influenceRadius },
  { id: "minGapRatio", label: "No Overlap", group: "Attractor Dynamics", min: 0.2, max: 1.2, step: 0.01, default: PRESET.minGapRatio },
  { id: "relaxPasses", label: "Relax Passes", group: "Attractor Dynamics", min: 0, max: 5, step: 1, default: PRESET.relaxPasses },
  { id: "trailStepsPerFrame", label: "Trail FPS Steps", group: "Trajectory", min: 1, max: 12, step: 1, default: PRESET.trailStepsPerFrame },

  { id: "bgTone", label: "Background", group: "Color", min: 0.0, max: 1.0, step: 0.01, default: PRESET.bgTone },
  { id: "imageLoader", label: "Image", group: "Input", type: "image-loader" },
];

const params = {};
schema.forEach((cfg) => {
  if (cfg.type === "image-loader") return;
  params[cfg.id] = cfg.default;
});

let seed = 472193;
let paused = false;
let bridge = null;
let pInst = null;
let simTime = 0;
let previewCooldown = 0;
let pendingPreview = true;
let simulationDirty = true;
let trailPlaybackStep = 0;
let trailMaxSteps = 1;
let trailNeedsClear = true;
let trailPlaybackDone = false;

const MAX_PATH_POINTS = 220;
const ONE_TIME_STATE_RESET_REV = 2;

let imageState = {
  loaded: false,
  width: 0,
  height: 0,
  data: null,
};

let fallbackCache = null;
let nodes = [];
const squareSamplingProfileCache = new Map();

const history = { undoStack: [], redoStack: [], limit: 120, suppress: false };

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function smoothstep01(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function mulberry32(a) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runOneTimeStateReset() {
  const markerKey = `shaderops:state-reset:${PROJECT_ID}`;
  const lastRev = Number(localStorage.getItem(markerKey) || "0");
  if (lastRev >= ONE_TIME_STATE_RESET_REV) return;
  localStorage.removeItem(`shaderops:settings:${PROJECT_ID}`);
  localStorage.removeItem(`shaderops:checkpoints:${PROJECT_ID}`);
  localStorage.removeItem(`shaderops:locked-controls:${PROJECT_ID}`);
  localStorage.setItem(markerKey, String(ONE_TIME_STATE_RESET_REV));
}

function fallbackLuma(u, v) {
  const n = Math.sin((u * 8.1 + v * 6.7 + seed * 0.0001) * 1.7) * 0.5 + 0.5;
  const r = Math.hypot(u * 2 - 1, v * 2 - 1);
  return clamp(0.2 + 0.6 * (1 - r) + 0.25 * (n - 0.5), 0, 1);
}

function ensureFallbackCache() {
  if (fallbackCache) return fallbackCache;
  const w = 1024;
  const h = 1024;
  const data = new Uint8ClampedArray(w * h * 4);
  const rand = mulberry32(seed ^ 0x9e3779b9);
  for (let y = 0; y < h; y += 1) {
    const v = y / Math.max(1, h - 1);
    for (let x = 0; x < w; x += 1) {
      const u = x / Math.max(1, w - 1);
      const i = (y * w + x) * 4;
      const g = 0.5 + 0.5 * Math.sin(u * 9.2 + v * 7.1 + rand() * 1.3);
      const c = Math.round(clamp(40 + g * 190, 0, 255));
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  fallbackCache = { width: w, height: h, data };
  return fallbackCache;
}

function getActiveImageSource() {
  const validUploaded =
    imageState.loaded &&
    Number.isFinite(imageState.width) &&
    Number.isFinite(imageState.height) &&
    imageState.width > 0 &&
    imageState.height > 0 &&
    imageState.data;
  return validUploaded ? imageState : ensureFallbackCache();
}

function mapCanvasUvToImageUv(u, v) {
  const src = getActiveImageSource();
  if (!pInst || !src || src.width < 1 || src.height < 1) return null;
  const viewAspect = Math.max(1e-5, pInst.width / Math.max(1, pInst.height));
  const imageAspect = Math.max(1e-5, src.width / Math.max(1, src.height));
  const fitScaleX = imageAspect / viewAspect;
  const mappedU = (u - 0.5) / fitScaleX + 0.5;
  if (mappedU < 0 || mappedU > 1 || v < 0 || v > 1) return null;
  return { u: mappedU, v };
}

function sampleColor(u, v) {
  const src = getActiveImageSource();
  const mapped = mapCanvasUvToImageUv(clamp(u, 0, 1), clamp(v, 0, 1));
  if (!mapped) return [0, 0, 0];
  const x = clamp(Math.floor(mapped.u * (src.width - 1)), 0, src.width - 1);
  const y = clamp(Math.floor(mapped.v * (src.height - 1)), 0, src.height - 1);
  const i = (y * src.width + x) * 4;
  return [src.data[i] / 255, src.data[i + 1] / 255, src.data[i + 2] / 255];
}

function sampleColorBilinear(u, v) {
  const src = getActiveImageSource();
  const mapped = mapCanvasUvToImageUv(clamp(u, 0, 1), clamp(v, 0, 1));
  if (!mapped) return [0, 0, 0];
  const x = clamp(mapped.u * (src.width - 1), 0, src.width - 1);
  const y = clamp(mapped.v * (src.height - 1), 0, src.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(src.width - 1, x0 + 1);
  const y1 = Math.min(src.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (y0 * src.width + x0) * 4;
  const i10 = (y0 * src.width + x1) * 4;
  const i01 = (y1 * src.width + x0) * 4;
  const i11 = (y1 * src.width + x1) * 4;

  const mix = (a, b, t) => a * (1 - t) + b * t;
  const r0 = mix(src.data[i00], src.data[i10], tx);
  const r1 = mix(src.data[i01], src.data[i11], tx);
  const g0 = mix(src.data[i00 + 1], src.data[i10 + 1], tx);
  const g1 = mix(src.data[i01 + 1], src.data[i11 + 1], tx);
  const b0 = mix(src.data[i00 + 2], src.data[i10 + 2], tx);
  const b1 = mix(src.data[i01 + 2], src.data[i11 + 2], tx);
  return [mix(r0, r1, ty) / 255, mix(g0, g1, ty) / 255, mix(b0, b1, ty) / 255];
}

function sampleLuma(u, v) {
  const src = getActiveImageSource();
  if (!src || src.width < 1 || src.height < 1) return fallbackLuma(u, v);
  const mapped = mapCanvasUvToImageUv(clamp(u, 0, 1), clamp(v, 0, 1));
  if (!mapped) return 0;
  const x = clamp(Math.floor(mapped.u * (src.width - 1)), 0, src.width - 1);
  const y = clamp(Math.floor(mapped.v * (src.height - 1)), 0, src.height - 1);
  const i = (y * src.width + x) * 4;
  const r = src.data[i] / 255;
  const g = src.data[i + 1] / 255;
  const b = src.data[i + 2] / 255;
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function edgeRaw(u, v) {
  if (!pInst) return 0;
  const eps = clamp(params.edgeSamplePx, 0.2, 8) / Math.max(320, Math.min(pInst.width, pInst.height));
  const ul = clamp(u - eps, 0, 1);
  const ur = clamp(u + eps, 0, 1);
  const vd = clamp(v - eps, 0, 1);
  const vu = clamp(v + eps, 0, 1);
  // If any sampling tap falls outside the mapped image area, treat it as border-safe:
  // no edge detection, equivalent to brightest/non-boundary.
  if (
    !mapCanvasUvToImageUv(ul, v) ||
    !mapCanvasUvToImageUv(ur, v) ||
    !mapCanvasUvToImageUv(u, vd) ||
    !mapCanvasUvToImageUv(u, vu)
  ) {
    return 0;
  }
  const l = sampleLuma(ul, v);
  const r = sampleLuma(ur, v);
  const d = sampleLuma(u, vd);
  const uu = sampleLuma(u, vu);
  return clamp(Math.hypot(r - l, uu - d) * 2.8, 0, 1);
}

function image1Brightness(u, v) {
  const threshold = clamp(params.edgeThreshold, 0.001, 0.99);
  const soft = Math.max(1e-5, clamp(params.edgeSoftness, 0.001, 0.8));
  const edge = edgeRaw(u, v);
  let ink = smoothstep01((edge - threshold) / soft);
  const radius = Math.max(0, params.edgeRadius);
  if (radius > 0 && pInst) {
    let maxInk = ink;
    const samples = 8;
    for (let i = 0; i < samples; i += 1) {
      const ang = (i / samples) * Math.PI * 2;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      for (let s = 1; s <= 4; s += 1) {
        const k = s / 4;
        const du = (dx * radius * k) / Math.max(1, pInst.width);
        const dv = (dy * radius * k) / Math.max(1, pInst.height);
        const e = edgeRaw(clamp(u + du, 0, 1), clamp(v + dv, 0, 1));
        const ringInk = smoothstep01((e - threshold) / soft) * (1 - k * 0.72);
        if (ringInk > maxInk) maxInk = ringInk;
      }
    }
    ink = maxInk;
  }
  const gain = clamp(params.edgeGain, 0.05, 4);
  ink = clamp(ink * gain, 0, 1);
  return clamp(1 - ink, 0, 1); // white background + dark edge line
}

function makeSpatialHash(points, cellSize) {
  const map = new Map();
  const inv = 1 / Math.max(1e-6, cellSize);
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const cx = Math.floor(p.x * inv);
    const cy = Math.floor(p.y * inv);
    const key = `${cx},${cy}`;
    const arr = map.get(key);
    if (arr) arr.push(i);
    else map.set(key, [i]);
  }
  return { map, inv };
}

function querySpatial(hash, x, y, r) {
  const cx0 = Math.floor((x - r) * hash.inv);
  const cy0 = Math.floor((y - r) * hash.inv);
  const cx1 = Math.floor((x + r) * hash.inv);
  const cy1 = Math.floor((y + r) * hash.inv);
  const ids = [];
  for (let cy = cy0; cy <= cy1; cy += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const arr = hash.map.get(`${cx},${cy}`);
      if (!arr) continue;
      for (let k = 0; k < arr.length; k += 1) ids.push(arr[k]);
    }
  }
  return ids;
}

function appendPathPoint(node, x, y) {
  if (!node.path) node.path = [{ x, y }];
  const last = node.path[node.path.length - 1];
  const minMove = Math.max(0.8, clamp(params.cellSize, 4, 240) * 0.04);
  if (!last || Math.hypot(last.x - x, last.y - y) > minMove) {
    node.path.push({ x, y });
    if (node.path.length > MAX_PATH_POINTS) {
      node.path.splice(1, node.path.length - MAX_PATH_POINTS);
    }
  }
}

function getSquareSamplingProfile(baseSize, sampleResolution) {
  const p = clamp(sampleResolution, 0, 1);
  const subdivisions = Math.max(1, Math.round(1 + (1 - p) * 11)); // max resolution => single-color square
  const key = `${subdivisions}:${baseSize.toFixed(3)}`;
  const cached = squareSamplingProfileCache.get(key);
  if (cached) return cached;
  const patchSize = baseSize / subdivisions;
  const half = baseSize * 0.5;
  const offsets = [];
  for (let gy = 0; gy < subdivisions; gy += 1) {
    for (let gx = 0; gx < subdivisions; gx += 1) {
      const ox = -half + patchSize * (gx + 0.5);
      const oy = -half + patchSize * (gy + 0.5);
      offsets.push({ ox, oy });
    }
  }
  const profile = { subdivisions, patchSize, offsets };
  squareSamplingProfileCache.set(key, profile);
  return profile;
}

function bakeNodeSquareSamples(node, baseSize, sampleResolution, width, height) {
  const profile = getSquareSamplingProfile(baseSize, sampleResolution);
  const cx = node.x;
  const cy = node.y;
  const uCenter = clamp(cx / Math.max(1, width - 1), 0, 1);
  const vCenter = clamp(cy / Math.max(1, height - 1), 0, 1);
  node.sampleSolidColor = sampleColorBilinear(uCenter, vCenter);
  if (profile.subdivisions <= 1) {
    node.samplePatches = null;
    node.samplePatchSize = 0;
    return;
  }
  const patches = [];
  for (let i = 0; i < profile.offsets.length; i += 1) {
    const off = profile.offsets[i];
    const sx = cx + off.ox;
    const sy = cy + off.oy;
    const u = clamp(sx / Math.max(1, width - 1), 0, 1);
    const v = clamp(sy / Math.max(1, height - 1), 0, 1);
    patches.push({ ox: off.ox, oy: off.oy, color: sampleColorBilinear(u, v) });
  }
  node.samplePatches = patches;
  node.samplePatchSize = profile.patchSize;
}

function rebuildNodes() {
  if (!pInst) return;
  const step = clamp(params.cellSize, 4, 240);
  const rowH = step * 0.8660254;
  const built = [];
  const h = pInst.height;
  const w = pInst.width;
  const band = step * 0.7;
  for (let y = rowH * 0.5, row = 0; y < h; y += rowH, row += 1) {
    const xOff = (row % 2) * step * 0.5;
    for (let x = step * 0.5 + xOff; x < w; x += step) {
      const u = x / Math.max(1, w - 1);
      const v = y / Math.max(1, h - 1);
      const mapped = mapCanvasUvToImageUv(u, v);
      if (!mapped) continue;
      const color = sampleColor(u, v);
      const b = image1Brightness(u, v);
      built.push({
        x0: x,
        y0: y,
        x,
        y,
        color,
        bRaw: b,
        bNorm: 0,
        darkStrength: 0,
        size: band,
        samplePatches: null,
        samplePatchSize: 0,
        sampleSolidColor: null,
        path: [{ x, y }],
      });
    }
  }

  if (built.length < 1) {
    for (let y = rowH * 0.5, row = 0; y < h; y += rowH, row += 1) {
      const xOff = (row % 2) * step * 0.5;
      for (let x = step * 0.5 + xOff; x < w; x += step) {
        const u = x / Math.max(1, w - 1);
        const v = y / Math.max(1, h - 1);
        built.push({
          x0: x,
          y0: y,
          x,
          y,
          color: sampleColor(u, v),
          bRaw: 1,
          bNorm: 1,
          darkStrength: 0,
          size: band,
          samplePatches: null,
          samplePatchSize: 0,
          sampleSolidColor: null,
          path: [{ x, y }],
        });
      }
    }
    if (built.length < 1) {
      nodes = [];
      return;
    }
  }

  let minB = 1;
  let maxB = 0;
  for (let i = 0; i < built.length; i += 1) {
    minB = Math.min(minB, built[i].bRaw);
    maxB = Math.max(maxB, built[i].bRaw);
  }
  const span = Math.max(1e-5, maxB - minB);
  for (let i = 0; i < built.length; i += 1) {
    const bn = clamp((built[i].bRaw - minB) / span, 0, 1);
    built[i].bNorm = bn;
    built[i].darkStrength = Math.pow(1 - bn, 1.25);
  }

  const sorted = built.map((_, i) => i).sort((a, b) => built[a].bNorm - built[b].bNorm); // darkest first
  const influenceR = Math.max(2, params.influenceRadius);
  const minGap = Math.max(0.1, step * clamp(params.minGapRatio, 0.1, 1.5));
  const hash = makeSpatialHash(built, influenceR * 0.5);
  const amp = clamp(params.attractStrength, 0, 2.2);

  for (let s = 0; s < sorted.length; s += 1) {
    const ia = sorted[s];
    const a = built[ia];
    if (a.darkStrength <= 0.0001) continue;
    const ids = querySpatial(hash, a.x, a.y, influenceR);
    for (let k = 0; k < ids.length; k += 1) {
      const ib = ids[k];
      if (ib === ia) continue;
      const b = built[ib];
      if (b.bNorm <= a.bNorm) continue; // only affect brighter nodes
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (!(dist > 1e-4) || dist > influenceR) continue;
      const t = 1 - dist / influenceR;
      const falloff = t * t;
      const desired = dist * amp * a.darkStrength * falloff;
      const maxAllow = Math.max(0, dist - minGap);
      const move = Math.min(desired, maxAllow);
      if (move <= 1e-5) continue;
      b.x += (dx / dist) * move;
      b.y += (dy / dist) * move;
      appendPathPoint(b, b.x, b.y);
    }
  }

  const relaxN = Math.max(0, Math.floor(clamp(params.relaxPasses, 0, 8)));
  for (let pass = 0; pass < relaxN; pass += 1) {
    const hsh = makeSpatialHash(built, minGap);
    for (let i = 0; i < built.length; i += 1) {
      const a = built[i];
      const ids = querySpatial(hsh, a.x, a.y, minGap);
      for (let k = 0; k < ids.length; k += 1) {
        const j = ids[k];
        if (j <= i) continue;
        const b = built[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d <= 1e-5 || d >= minGap) continue;
        const push = (minGap - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        appendPathPoint(a, a.x, a.y);
        appendPathPoint(b, b.x, b.y);
      }
    }
  }

  const margin = step;
  for (let i = 0; i < built.length; i += 1) {
    built[i].x = clamp(built[i].x, -margin, w + margin);
    built[i].y = clamp(built[i].y, -margin, h + margin);
    appendPathPoint(built[i], built[i].x, built[i].y);
  }

  const baseSquareSize = clamp(params.squareScale, 0.1, 1.5) * clamp(params.cellSize, 4, 240) * 0.62;
  const sampleResolution = clamp(params.squareSampleResolution, 0, 1);
  for (let i = 0; i < built.length; i += 1) {
    bakeNodeSquareSamples(built[i], baseSquareSize, sampleResolution, w, h);
  }

  nodes = built;
  trailPlaybackStep = 0;
  trailMaxSteps = 1;
  trailPlaybackDone = false;
  for (let i = 0; i < nodes.length; i += 1) {
    if (nodes[i].path && nodes[i].path.length > trailMaxSteps) trailMaxSteps = nodes[i].path.length;
  }
  trailNeedsClear = true;
}

function drawSoftSquare(cx, cy, size, color, edgeSoftness) {
  if (!pInst) return;
  const [r, g, b] = color;
  const soft = clamp(edgeSoftness, 0, 0.5);
  if (soft <= 0.001 || size <= 1) {
    pInst.fill(r * 255, g * 255, b * 255);
    pInst.rect(cx, cy, size, size);
    return;
  }
  const softPx = Math.min(size * 0.48, size * soft);
  const layers = Math.max(2, Math.min(5, Math.ceil(softPx)));
  for (let i = 0; i < layers; i += 1) {
    const t = (i + 1) / layers;
    const inset = softPx * (1 - t);
    const alpha = 255 * (t * t);
    const s = Math.max(0.2, size - inset * 2);
    pInst.fill(r * 255, g * 255, b * 255, alpha);
    pInst.rect(cx, cy, s, s);
  }
}

function drawNodeSquareAtPosition(node, pos, baseSize, edgeSoftness) {
  if (!pInst || !node || !pos) return;
  if (node.samplePatches && node.samplePatches.length > 0 && node.samplePatchSize > 0) {
    const patchSize = node.samplePatchSize;
    for (let k = 0; k < node.samplePatches.length; k += 1) {
      const patch = node.samplePatches[k];
      const [pr, pg, pb] = patch.color;
      drawSoftSquare(pos.x + patch.ox, pos.y + patch.oy, patchSize, [pr, pg, pb], edgeSoftness);
    }
  } else {
    const solid = node.sampleSolidColor || node.color;
    drawSoftSquare(pos.x, pos.y, baseSize, solid, edgeSoftness);
  }
}

function drawNodeSquaresAtStep(step) {
  if (!pInst || !nodes.length) return;
  const baseSize = clamp(params.squareScale, 0.1, 1.5) * clamp(params.cellSize, 4, 240) * 0.62;
  const edgeSoftness = clamp(params.squareEdgeSoftness, 0, 0.5);
  pInst.noStroke();
  pInst.rectMode(pInst.CENTER);
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    const path = n.path || [{ x: n.x, y: n.y }];
    const idx = clamp(step, 0, path.length - 1);
    const pos = path[idx];
    drawNodeSquareAtPosition(n, pos, baseSize, edgeSoftness);
  }
}

function drawNodes() {
  if (!pInst) return;
  const bg = Math.round(clamp(params.bgTone, 0, 1) * 255);
  if (trailNeedsClear) {
    pInst.background(bg);
    trailNeedsClear = false;
  }
  if (!nodes.length) return;

  const stepsPerFrame = Math.max(1, Math.floor(clamp(params.trailStepsPerFrame, 1, 24)));
  const baseSize = clamp(params.squareScale, 0.1, 1.5) * clamp(params.cellSize, 4, 240) * 0.62;
  const edgeSoftness = clamp(params.squareEdgeSoftness, 0, 0.5);
  pInst.noStroke();
  pInst.rectMode(pInst.CENTER);

  if (trailPlaybackDone) {
    return;
  }

  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    const path = n.path || [];
    if (path.length < 1) continue;
    for (let s = 0; s < stepsPerFrame; s += 1) {
      const k = trailPlaybackStep + s;
      if (k >= path.length) break;
      drawNodeSquareAtPosition(n, path[k], baseSize, edgeSoftness);
    }
  }
  trailPlaybackStep = Math.min(trailPlaybackStep + stepsPerFrame, Math.max(0, trailMaxSteps - 1));
  if (trailPlaybackStep >= Math.max(0, trailMaxSteps - 1)) {
    trailPlaybackDone = true;
  }
}

function markSimulationDirty() {
  simulationDirty = true;
  pendingPreview = true;
  trailNeedsClear = true;
  trailPlaybackStep = 0;
  trailPlaybackDone = false;
}

function snapshotState() {
  return JSON.stringify({ params: { ...params }, seed, paused, imageLoaded: imageState.loaded });
}

function pushHistorySnapshot(explicitSnapshot) {
  if (history.suppress) return;
  const snap = explicitSnapshot !== undefined ? explicitSnapshot : snapshotState();
  if (history.undoStack[history.undoStack.length - 1] === snap) return;
  history.undoStack.push(snap);
  if (history.undoStack.length > history.limit) history.undoStack.shift();
  history.redoStack.length = 0;
}

function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") {
      Object.keys(state.params).forEach((k) => {
        if (params[k] === undefined) return;
        params[k] = state.params[k];
      });
    }
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) seed = Math.max(1, Math.floor(state.seed));
    if (typeof state.paused === "boolean") paused = state.paused;
    if (!imageState.loaded) fallbackCache = null;
    bridge.extras.seed = seed;
    bridge.extras.paused = paused;
    bridge.notifyValuesChanged();
    markSimulationDirty();
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
    if (cfg.type === "image-loader") return;
    const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
    const quant = Math.round(raw / cfg.step) * cfg.step;
    params[cfg.id] = Number(quant.toFixed(6));
  });
  seed = Math.floor(Math.random() * 2147483646) + 1;
  fallbackCache = null;
  bridge.extras.seed = seed;
  bridge.notifyValuesChanged();
  markSimulationDirty();
}

function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  fallbackCache = null;
  bridge.extras.seed = seed;
  bridge.notifyValuesChanged();
  markSimulationDirty();
}

function togglePause() {
  pushHistorySnapshot();
  paused = !paused;
  bridge.extras.paused = paused;
  bridge.notifyValuesChanged();
}

function sendPreview() {
  if (!pInst) return;
  const image = pInst.canvas.toDataURL("image/jpeg", 0.82);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

function installBridge() {
  history.suppress = true;
  bridge = window.ShaderOpsControls.init({
    projectId: PROJECT_ID,
    schema,
    params,
    extras: { seed, paused },
    onParams: (ids, nextParams, commit, prevValues) => {
      if (commit && !history.suppress) {
        const prior = JSON.stringify({ params: prevValues || params, seed, paused, imageLoaded: imageState.loaded });
        if (history.undoStack[history.undoStack.length - 1] !== prior) {
          history.undoStack.push(prior);
          if (history.undoStack.length > history.limit) history.undoStack.shift();
          history.redoStack.length = 0;
        }
      }
      Object.keys(nextParams).forEach((k) => {
        if (params[k] === undefined) return;
        params[k] = nextParams[k];
      });
      markSimulationDirty();
    },
    onExtras: (nextExtras) => {
      if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed)) {
        pushHistorySnapshot();
        seed = Math.max(1, Math.floor(nextExtras.seed));
        fallbackCache = null;
        markSimulationDirty();
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
  if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) seed = Math.max(1, Math.floor(bridge.extras.seed));
  if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
  history.suppress = false;
}

function applyImageData(msgImageData) {
  if (
    !msgImageData ||
    !Number.isFinite(msgImageData.width) ||
    !Number.isFinite(msgImageData.height) ||
    msgImageData.width < 1 ||
    msgImageData.height < 1 ||
    !msgImageData.data
  ) {
    clearImageData();
    return;
  }
  imageState = {
    loaded: true,
    width: msgImageData.width,
    height: msgImageData.height,
    data: msgImageData.data instanceof Uint8ClampedArray ? msgImageData.data : new Uint8ClampedArray(msgImageData.data),
  };
  markSimulationDirty();
}

function clearImageData() {
  imageState = { loaded: false, width: 0, height: 0, data: null };
  fallbackCache = null;
  markSimulationDirty();
}

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg) return;
  if (msg.type === "shaderops/request-preview") {
    sendPreview();
    return;
  }
  if (msg.type === "shaderops/image-load" && msg.imageData) {
    pushHistorySnapshot();
    applyImageData(msg.imageData);
    bridge.notifyValuesChanged();
    return;
  }
  if (msg.type === "shaderops/image-clear") {
    pushHistorySnapshot();
    clearImageData();
    bridge.notifyValuesChanged();
  }
});

window.addEventListener("beforeunload", () => {
  sendPreview();
});

new window.p5((p) => {
  pInst = p;
  p.setup = () => {
    const canvas = p.createCanvas(window.innerWidth, window.innerHeight);
    canvas.parent("app");
    p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
    runOneTimeStateReset();
    installBridge();
    rebuildNodes();
    drawNodes();
    sendPreview();
  };

  p.draw = () => {
    const dt = Math.min(0.08, p.deltaTime / 1000);
    if (!paused) simTime += dt * clamp(params.speed, 0, 4);
    if (simulationDirty) {
      rebuildNodes();
      simulationDirty = false;
    }
    drawNodes();
    previewCooldown += dt;
    if (pendingPreview && previewCooldown > 0.42) {
      previewCooldown = 0;
      pendingPreview = false;
      sendPreview();
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    markSimulationDirty();
  };
});
