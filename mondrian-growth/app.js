const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "mondrian-growth";
})();

// When loaded in a sub-10px prewarm iframe, run synchronously and send one preview.
const INSTANT_MODE = window.innerWidth < 10;

// ─── Palettes ────────────────────────────────────────────────────────────────
// Each palette: 6 fill colours + bg (paper) + line (wall/grid ink).
const PALETTES = [
  {
    name: "Mondrian",
    colors: ["#E63B2E", "#2155A4", "#F5C518", "#F5F0E8", "#F5F0E8", "#F5F0E8"],
    bg: "#F5F0E8",
    line: "#1C1C1E",
  },
  {
    name: "Earth",
    colors: ["#C2856A", "#8B6B4A", "#D4A854", "#6B8C7A", "#B8C4A8", "#EDE0D4"],
    bg: "#EDE0D4",
    line: "#3D2B1F",
  },
  {
    name: "Pastel",
    colors: ["#F4B8C2", "#B8D4F4", "#B8F4C8", "#F4F0B8", "#D4B8F4", "#F4D8B8"],
    bg: "#FAFAFA",
    line: "#7A7A9A",
  },
  {
    name: "Neon",
    colors: ["#00FFB3", "#FF0099", "#00CFFF", "#FFE600", "#FF6600", "#A020F0"],
    bg: "#0A0A0A",
    line: "#252540",
  },
  {
    name: "Ceramic",
    colors: ["#C8E6C9", "#FFCCBC", "#B3E5FC", "#F8BBD9", "#E1BEE7", "#FFF9C4"],
    bg: "#ECEFF1",
    line: "#546E7A",
  },
  {
    name: "Ocean",
    colors: ["#01579B", "#0288D1", "#4FC3F7", "#80DEEA", "#26C6DA", "#B2EBF2"],
    bg: "#E0F7FA",
    line: "#01579B",
  },
];

// ─── Control schema ───────────────────────────────────────────────────────────
const controlSchema = [
  { id: "gridRows", label: "Grid Rows", group: "Layout", min: 2, max: 24, step: 1, default: 8 },
  { id: "gridCols", label: "Grid Cols", group: "Layout", min: 2, max: 24, step: 1, default: 8 },
  { id: "gridGap", label: "Grid Gap", group: "Layout", min: 0, max: 36, step: 1, default: 8 },
  { id: "gridLineWidth", label: "Grid Line Width", group: "Layout", min: 1, max: 16, step: 1, default: 2 },
  { id: "gridLineOn", label: "Grid Line On", group: "Layout", type: "toggle", default: 1 },
  { id: "staggerRows", label: "Stagger Rows On", group: "Layout", type: "toggle", default: 0 },
  { id: "seedDensity", label: "Density", group: "Layout", min: 0, max: 24, step: 1, default: 6 },
  { id: "edgeDensity", label: "Edge Density", group: "Input", min: 0, max: 24, step: 1, default: 2 },
  { id: "dualAxisProb", label: "Dual Axis %", group: "Layout", min: 0, max: 100, step: 1, default: 30 },
  { id: "axisRotate", label: "Axis Rotate", group: "Layout", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "lineWidth", label: "Line Width", group: "Layout", min: 1, max: 8, step: 1, default: 2 },
  {
    id: "lineColor",
    label: "Line Color",
    group: "Layout",
    type: "select",
    default: "palette",
    options: [
      { label: "Palette", value: "palette" },
      { label: "White", value: "#f5f5f5" },
      { label: "Black", value: "#121212" },
      { label: "Red", value: "#ff3b30" },
      { label: "Green", value: "#34c759" },
      { label: "Blue", value: "#0a84ff" },
      { label: "Yellow", value: "#ffd60a" },
      { label: "Purple", value: "#bf5af2" }
    ],
  },
  { id: "lineOn", label: "Line On", group: "Layout", type: "toggle", default: 1 },
  { id: "growSpeed", label: "Grow Speed", group: "Layout", min: 1, max: 40, step: 1, default: 8 },
  { id: "paletteSel", label: "Palette (0-5)", group: "Color", min: 0, max: 5, step: 1, default: 0 },
  { id: "imageColorMix", label: "Image Color Mix", group: "Color", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "colorShiftProb", label: "Color Shift Chance", group: "Color", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "neighborCopyProb", label: "Copy Neighbor", group: "Color", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "saturation", label: "Saturation", group: "Color", min: -1.0, max: 1.0, step: 0.01, default: 0.0, pillMode: "center-zero" },
  { id: "imageLoader", label: "Image", group: "Input", type: "image-loader" },
];

const params = {};
controlSchema.forEach((cfg) => {
  if (cfg.type === "image-loader") return;
  params[cfg.id] = cfg.default;
});

// ─── Canvas / ctx ─────────────────────────────────────────────────────────────
const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d");

// ─── Runtime state ────────────────────────────────────────────────────────────
let paused = false;
let seed = Math.floor(Math.random() * 2147483646) + 1;
let pendingPreview = false;
let previewCooldown = 0;
const history = { undoStack: [], redoStack: [], limit: 100, suppress: false };

let W = 0;
let H = 0;
let walls = null; // Uint8Array(W*H) — 1 = wall pixel
let growthWalls = null; // Uint8Array(W*H) — 1 = inner generated line pixels
let regionMap = null; // Int32Array(W*H) — 0=unfilled, -1=wall, N=region id
let fillableMask = null; // Uint8Array(W*H) — 1 = flood-fill allowed (inside square interiors)
let regionColors = []; // hex strings indexed by region id (1-based)
let regionSeedIndices = []; // 1-based region start pixel indices for recolor/image sampling
let regionPriority = []; // 1-based priority seed per region
let regionNeighbors = []; // 1-based neighbor id arrays per region
let arms = []; // { x, y, dx, dy, active }
let squareCells = []; // [{ x, y, size, ix0, ix1, iy0, iy1 }]
let edgeCandidates = []; // [{ x, y }] sampled from imported-image edges in canvas space
let imageState = { loaded: false, width: 0, height: 0, data: null };
let phase = "idle"; // 'growing' | 'done' | 'idle'
let rafId = null;

// ─── Utilities ────────────────────────────────────────────────────────────────
function mulberry32(s) {
  let a = s >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRGB(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(rgb) {
  const r = Math.max(0, Math.min(255, Math.round(rgb[0])));
  const g = Math.max(0, Math.min(255, Math.round(rgb[1])));
  const b = Math.max(0, Math.min(255, Math.round(rgb[2])));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function rgbToHsv(rgb) {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const s = max <= 1e-6 ? 0 : d / max;
  return [h, s, max];
}

function hsvToRgb(h, s, v) {
  const hh = ((h % 1) + 1) % 1;
  const i = Math.floor(hh * 6);
  const f = hh * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = v;
  let g = t;
  let b = p;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function applyRandomColorShift(rgb, rand) {
  const satBias = clamp(params.saturation, -1, 1);
  const [h0, s0, v0] = rgbToHsv(rgb);
  const h = h0 + (rand() * 2 - 1) * 0.24;
  const shiftedS = clamp(s0 * (1 + (rand() * 2 - 1) * 0.24), 0, 1);
  const s = clamp(shiftedS * (1 + satBias), 0, 1);
  const v = clamp(v0 * (1 + (rand() * 2 - 1) * 0.18), 0, 1);
  return hsvToRgb(h, s, v);
}

function getPalette() {
  return PALETTES[Math.max(0, Math.min(PALETTES.length - 1, Math.round(params.paletteSel)))];
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function sampleImageLumaAtCanvas(x, y) {
  if (!imageState.loaded || !imageState.data || imageState.width < 1 || imageState.height < 1) return 0;
  const u = W <= 1 ? 0 : clamp(x / (W - 1), 0, 1);
  const v = H <= 1 ? 0 : clamp(y / (H - 1), 0, 1);
  const ix = clamp(Math.round(u * (imageState.width - 1)), 0, imageState.width - 1);
  const iy = clamp(Math.round(v * (imageState.height - 1)), 0, imageState.height - 1);
  const idx = (iy * imageState.width + ix) * 4;
  const r = imageState.data[idx] / 255;
  const g = imageState.data[idx + 1] / 255;
  const b = imageState.data[idx + 2] / 255;
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function sampleImageRGBAtCanvas(x, y) {
  if (!imageState.loaded || !imageState.data || imageState.width < 1 || imageState.height < 1) return null;
  const u = W <= 1 ? 0 : clamp(x / (W - 1), 0, 1);
  const v = H <= 1 ? 0 : clamp(y / (H - 1), 0, 1);
  const ix = clamp(Math.round(u * (imageState.width - 1)), 0, imageState.width - 1);
  const iy = clamp(Math.round(v * (imageState.height - 1)), 0, imageState.height - 1);
  const idx = (iy * imageState.width + ix) * 4;
  return [imageState.data[idx], imageState.data[idx + 1], imageState.data[idx + 2]];
}

function assignRegionColor(regionId, rand) {
  const pal = getPalette();
  const useImageProb = clamp(params.imageColorMix, 0, 1);
  const shiftProb = clamp(params.colorShiftProb, 0, 1);
  const seedIdx = regionSeedIndices[regionId];
  const sx = typeof seedIdx === "number" ? (seedIdx % W) : 0;
  const sy = typeof seedIdx === "number" ? ((seedIdx / W) | 0) : 0;

  let rgb = null;
  if (imageState.loaded && rand() < useImageProb) rgb = sampleImageRGBAtCanvas(sx, sy);
  if (!rgb) {
    const hex = pal.colors[Math.floor(rand() * pal.colors.length)];
    rgb = hexToRGB(hex);
  }
  if (rand() < shiftProb) rgb = applyRandomColorShift(rgb, rand);
  regionColors[regionId] = rgbToHex(rgb);
}

function buildRegionAdjacency(regionCount) {
  const sets = new Array(regionCount + 1);
  for (let i = 0; i <= regionCount; i++) sets[i] = new Set();

  const link = (a, b) => {
    if (a <= 0 || b <= 0 || a === b) return;
    sets[a].add(b);
    sets[b].add(a);
  };

  // Direct-touch fallback (kept for edge cases where no wall separates regions).
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const idx = row + x;
      const rid = regionMap[idx];
      if (rid <= 0) continue;

      if (x + 1 < W) {
        const rightId = regionMap[idx + 1];
        link(rid, rightId);
      }
      if (y + 1 < H) {
        const downId = regionMap[idx + W];
        link(rid, downId);
      }
    }
  }

  // Main path: regions are usually separated by walls.
  // For each wall pixel, any regions touching that wall are considered neighbors.
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const idx = row + x;
      if (regionMap[idx] !== -1) continue;

      const around = [];
      const pushRegion = (rid) => {
        if (rid > 0 && around.indexOf(rid) === -1) around.push(rid);
      };
      if (x > 0) pushRegion(regionMap[idx - 1]);
      if (x + 1 < W) pushRegion(regionMap[idx + 1]);
      if (y > 0) pushRegion(regionMap[idx - W]);
      if (y + 1 < H) pushRegion(regionMap[idx + W]);

      if (around.length < 2) continue;
      for (let i = 0; i < around.length; i++) {
        for (let j = i + 1; j < around.length; j++) {
          link(around[i], around[j]);
        }
      }
    }
  }

  regionNeighbors = new Array(regionCount + 1);
  regionNeighbors[0] = [];
  for (let i = 1; i <= regionCount; i++) {
    regionNeighbors[i] = Array.from(sets[i]);
  }
}

function applyNeighborCopy(rand) {
  const copyProb = clamp(params.neighborCopyProb, 0, 1);
  if (copyProb <= 0 || regionColors.length <= 1) return;

  const sourceColors = regionColors.slice();
  const nextColors = sourceColors.slice();
  for (let i = 1; i < sourceColors.length; i++) {
    if (rand() >= copyProb) continue;
    const neighbors = regionNeighbors[i];
    if (!Array.isArray(neighbors) || !neighbors.length) continue;

    const myPriority = regionPriority[i] ?? 0;
    const eligible = [];
    for (let k = 0; k < neighbors.length; k++) {
      const n = neighbors[k];
      if ((regionPriority[n] ?? 0) > myPriority) eligible.push(n);
    }
    if (!eligible.length) continue;

    const donor = eligible[Math.floor(rand() * eligible.length)];
    nextColors[i] = sourceColors[donor];
  }
  regionColors = nextColors;
}

function getInnerLineColorRGB() {
  const pal = getPalette();
  const raw = params.lineColor;
  if (typeof raw === "string" && raw !== "palette") return hexToRGB(raw);
  return hexToRGB(pal.line);
}

function rebuildEdgeCandidates() {
  edgeCandidates = [];
  if (!imageState.loaded || !imageState.data || W < 4 || H < 4) return;

  const step = Math.max(1, Math.floor(Math.min(W, H) / 280));
  const threshold = 0.16;
  for (let y = 1; y < H - 1; y += step) {
    for (let x = 1; x < W - 1; x += step) {
      const gx = sampleImageLumaAtCanvas(x + 1, y) - sampleImageLumaAtCanvas(x - 1, y);
      const gy = sampleImageLumaAtCanvas(x, y + 1) - sampleImageLumaAtCanvas(x, y - 1);
      const mag = Math.hypot(gx, gy);
      if (mag >= threshold) edgeCandidates.push({ x, y });
    }
  }
}

function pickEdgePointInCell(cell, half, rand) {
  if (!edgeCandidates.length) return null;
  const minX = cell.ix0 + half + 1;
  const maxX = cell.ix1 - half - 1;
  const minY = cell.iy0 + half + 1;
  const maxY = cell.iy1 - half - 1;
  if (maxX < minX || maxY < minY) return null;

  for (let k = 0; k < 28; k++) {
    const p = edgeCandidates[Math.floor(rand() * edgeCandidates.length)];
    if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) return p;
  }
  return null;
}

function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
}

// ─── Resize ───────────────────────────────────────────────────────────────────
function doResize() {
  if (INSTANT_MODE) {
    W = 400;
    H = 300;
  } else {
    W = Math.max(2, Math.floor(canvas.clientWidth || window.innerWidth));
    H = Math.max(2, Math.floor(canvas.clientHeight || window.innerHeight));
  }
  canvas.width = W;
  canvas.height = H;
}

// ─── Grid init ────────────────────────────────────────────────────────────────
function initGrid() {
  walls = new Uint8Array(W * H);
  growthWalls = new Uint8Array(W * H);
  regionMap = new Int32Array(W * H);
  fillableMask = new Uint8Array(W * H);
  regionColors = [""]; // index 0 unused; 1-based region ids
  regionSeedIndices = [0];
  regionPriority = [0];
  regionNeighbors = [[]];
  arms = [];
  squareCells = [];
}

// ─── Square lattice walls + fillable interiors ───────────────────────────────
function buildSquareLattice() {
  const pal = getPalette();
  const rows = Math.max(1, Math.round(params.gridRows));
  const cols = Math.max(1, Math.round(params.gridCols));
  const gap = Math.max(0, Math.round(params.gridGap));
  const staggerRows = params.staggerRows >= 0.5;
  const gridLw = Math.max(1, Math.round(params.gridLineWidth));
  const halfStepCoef = staggerRows && rows > 1 ? 0.5 : 0;
  const pad = Math.max(8, gridLw * 2 + 4);

  ctx.fillStyle = pal.line;

  const widthAvail = Math.max(1, W - pad * 2);
  const heightAvail = Math.max(1, H - pad * 2);
  const sizeByH = (heightAvail - (rows - 1) * gap) / rows;
  const sizeByW = staggerRows
    ? (widthAvail - (cols - 0.5) * gap) / (cols + 0.5)
    : (widthAvail - (cols - 1) * gap) / cols;
  const squareSize = Math.max(4, Math.floor(Math.min(sizeByW, sizeByH)));

  const rowWidth = cols * squareSize + (cols - 1) * gap;
  const totalWidth = rowWidth + Math.floor(halfStepCoef * (squareSize + gap));
  const totalHeight = rows * squareSize + (rows - 1) * gap;
  const startX = Math.floor((W - totalWidth) * 0.5);
  const startY = Math.floor((H - totalHeight) * 0.5);

  const cells = [];
  for (let r = 0; r < rows; r++) {
    const rowOffset = staggerRows && (r % 2 === 1) ? Math.floor((squareSize + gap) * 0.5) : 0;
    const y = startY + r * (squareSize + gap);
    for (let c = 0; c < cols; c++) {
      const x = startX + rowOffset + c * (squareSize + gap);
      if (x < 0 || y < 0 || x + squareSize > W || y + squareSize > H) continue;

      // Border walls for each square
      for (let d = 0; d < gridLw; d++) {
        const top = y + d;
        const bottom = y + squareSize - 1 - d;
        for (let xx = x; xx < x + squareSize; xx++) {
          walls[top * W + xx] = 1;
          walls[bottom * W + xx] = 1;
          ctx.fillRect(xx, top, 1, 1);
          ctx.fillRect(xx, bottom, 1, 1);
        }
        const left = x + d;
        const right = x + squareSize - 1 - d;
        for (let yy = y; yy < y + squareSize; yy++) {
          walls[yy * W + left] = 1;
          walls[yy * W + right] = 1;
          ctx.fillRect(left, yy, 1, 1);
          ctx.fillRect(right, yy, 1, 1);
        }
      }

      const ix0 = x + gridLw;
      const iy0 = y + gridLw;
      const ix1 = x + squareSize - 1 - gridLw;
      const iy1 = y + squareSize - 1 - gridLw;
      if (ix1 <= ix0 || iy1 <= iy0) continue;

      for (let yy = iy0; yy <= iy1; yy++) {
        const row = yy * W;
        for (let xx = ix0; xx <= ix1; xx++) {
          fillableMask[row + xx] = 1;
        }
      }
      cells.push({ x, y, size: squareSize, ix0, ix1, iy0, iy1 });
    }
  }
  return cells;
}

// ─── Seed arm spawning ────────────────────────────────────────────────────────
// Each seed picks X-only, Y-only, or BOTH axes based on dualAxisProb (%).
// Single-axis: 50/50 between X and Y.
// Dual-axis:   seed emits four arms (left, right, up, down) and draws a small
//              filled square at the origin so all four arms connect cleanly.
//
// Perpendicular-stripe rule (MUST keep):
//   X-axis arm → pre-mark vertical column at (sx, sy±half)
//   Y-axis arm → pre-mark horizontal row at (sx±half, sy)
// Only perpendicular pixels are marked — NOT the forward axis — so the arm
// can still take its first step without immediately hitting a wall.
//
// seedDensity: number of random (non-edge) seeds in each square
// edgeDensity: number of edge-sampled seeds in each square (image-loaded only)
// dualAxisProb: 0–100 → probability (%) a non-edge seed uses BOTH axes
function spawnArms(rand, cells) {
  const normalSeedsPerSquare = Math.max(0, Math.round(params.seedDensity));
  const edgeSeedsPerSquare = imageState.loaded ? Math.max(0, Math.round(params.edgeDensity)) : 0;
  const lw = Math.max(1, Math.round(params.lineWidth));
  const half = Math.floor(lw / 2);
  const dualProb = Math.max(0, Math.min(100, params.dualAxisProb)) / 100;
  const axisRotate = clamp(params.axisRotate, 0, 1);
  const drawInner = Number(params.lineOn) >= 0.5;
  const innerLineRGB = getInnerLineColorRGB();
  if (drawInner) ctx.fillStyle = rgbToHex(innerLineRGB);

  for (const cell of cells) {
    const minX = cell.ix0 + half + 1;
    const maxX = cell.ix1 - half - 1;
    const minY = cell.iy0 + half + 1;
    const maxY = cell.iy1 - half - 1;
    if (maxX < minX || maxY < minY) continue;

    const emitSeed = (sx, sy, forceBoth) => {
      const useBoth = forceBoth || (rand() < dualProb);
      const useX = useBoth || rand() < 0.5;
      const useY = useBoth || !useX;
      const rotatedAxis = rand() < axisRotate;
      const basisX = rotatedAxis ? { dx: 1, dy: 1 } : { dx: 1, dy: 0 };
      const basisY = rotatedAxis ? { dx: -1, dy: 1 } : { dx: 0, dy: 1 };

      const emitAxisPair = (dx, dy) => {
        const px0 = -dy;
        const py0 = dx;
        for (let t = -half; t <= half; t++) {
          const wx = sx + px0 * t;
          const wy = sy + py0 * t;
          if (wx >= 0 && wx < W && wy >= 0 && wy < H) {
            walls[wy * W + wx] = 1;
            growthWalls[wy * W + wx] = 1;
            if (drawInner) ctx.fillRect(wx, wy, 1, 1);
          }
        }
        arms.push({ x: sx + dx * half, y: sy + dy * half, dx, dy, active: true });
        arms.push({ x: sx - dx * half, y: sy - dy * half, dx: -dx, dy: -dy, active: true });
      };

      if (useX && useY) {
        for (let ty = -half; ty <= half; ty++) {
          for (let tx = -half; tx <= half; tx++) {
            const wx = sx + tx;
            const wy = sy + ty;
            if (wx >= 0 && wx < W && wy >= 0 && wy < H) {
              walls[wy * W + wx] = 1;
              growthWalls[wy * W + wx] = 1;
              if (drawInner) ctx.fillRect(wx, wy, 1, 1);
            }
          }
        }
        emitAxisPair(basisX.dx, basisX.dy);
        emitAxisPair(basisY.dx, basisY.dy);
      } else if (useX) {
        emitAxisPair(basisX.dx, basisX.dy);
      } else {
        emitAxisPair(basisY.dx, basisY.dy);
      }
    };

    for (let i = 0; i < normalSeedsPerSquare; i++) {
      const sx = minX + Math.floor(rand() * (maxX - minX + 1));
      const sy = minY + Math.floor(rand() * (maxY - minY + 1));
      emitSeed(sx, sy, false);
    }

    for (let i = 0; i < edgeSeedsPerSquare; i++) {
      const edgePt = pickEdgePointInCell(cell, half, rand);
      if (!edgePt) continue;
      // Edge-density seeds are always XY, independent from regular density.
      emitSeed(edgePt.x, edgePt.y, true);
    }
  }
}

// ─── Growth step ──────────────────────────────────────────────────────────────
// Correct thick-line algorithm: mark and check only the PERPENDICULAR LINE at
// each step — never a full box. A box would make the arm's own previous wall
// block the very next step, limiting growth to 1 pixel regardless of speed.
//
// For an arm going right (dx=1, dy=0):
//   perpendicular direction = (0, ±1)  →  mark/check (nx, ny-half..ny+half)
// For an arm going down (dx=0, dy=1):
//   perpendicular direction = (±1, 0)  →  mark/check (nx-half..nx+half, ny)
//
// General:  perpStep = (-arm.dy, arm.dx)  (rotated 90°)
function stepGrow(stepsPerFrame) {
  const drawInner = Number(params.lineOn) >= 0.5;
  const innerLineRGB = getInnerLineColorRGB();
  const lw = Math.max(1, Math.round(params.lineWidth));
  const half = Math.floor(lw / 2);
  if (drawInner) ctx.fillStyle = rgbToHex(innerLineRGB);

  let anyActive = false;
  for (let s = 0; s < stepsPerFrame; s++) {
    for (const arm of arms) {
      if (!arm.active) continue;
      const nx = arm.x + arm.dx;
      const ny = arm.y + arm.dy;

      // Out of bounds → stop
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) {
        arm.active = false;
        continue;
      }

      // Collision check: scan the perpendicular line at the leading edge.
      // perpendicular to (dx,dy) is (-dy, dx).
      const px0 = -arm.dy; // perpendicular x-step
      const py0 = arm.dx;  // perpendicular y-step
      let blocked = false;
      for (let t = -half; t <= half; t++) {
        const cx = nx + px0 * t;
        const cy = ny + py0 * t;
        if (cx < 0 || cx >= W || cy < 0 || cy >= H || walls[cy * W + cx]) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        arm.active = false;
        continue;
      }

      arm.x = nx;
      arm.y = ny;
      anyActive = true;

      // Mark and draw: only the perpendicular line at the new position.
      // This leaves the forward axis clear so the arm can keep moving.
      for (let t = -half; t <= half; t++) {
        const wx = nx + px0 * t;
        const wy = ny + py0 * t;
        if (wx >= 0 && wx < W && wy >= 0 && wy < H) {
          walls[wy * W + wx] = 1;
          growthWalls[wy * W + wx] = 1;
          if (drawInner) ctx.fillRect(wx, wy, 1, 1);
        }
      }
    }
  }
  return anyActive;
}

// ─── BFS Flood fill ───────────────────────────────────────────────────────────
// Assigns region IDs to all non-wall pixels, recording a color per region.
function floodFill() {
  const rand = mulberry32(seed + 77777);

  // Pre-mark walls
  for (let i = 0; i < W * H; i++) {
    if (walls[i]) regionMap[i] = -1;
    else regionMap[i] = fillableMask[i] ? 0 : -2;
  }

  // Pre-allocated stack (flat 1D index) avoids GC pressure
  const stack = new Int32Array(W * H);
  let regionId = 1;

  for (let start = 0; start < W * H; start++) {
    if (regionMap[start] !== 0) continue;

    regionSeedIndices[regionId] = start;
    regionPriority[regionId] = rand();
    assignRegionColor(regionId, rand);

    let top = 0;
    let bot = 0;
    stack[bot++] = start;
    regionMap[start] = regionId;

    while (top < bot) {
      const idx = stack[top++];
      const px = idx % W;
      const py = (idx / W) | 0;

      if (px + 1 < W && regionMap[idx + 1] === 0) {
        regionMap[idx + 1] = regionId;
        stack[bot++] = idx + 1;
      }
      if (px - 1 >= 0 && regionMap[idx - 1] === 0) {
        regionMap[idx - 1] = regionId;
        stack[bot++] = idx - 1;
      }
      if (py + 1 < H && regionMap[idx + W] === 0) {
        regionMap[idx + W] = regionId;
        stack[bot++] = idx + W;
      }
      if (py - 1 >= 0 && regionMap[idx - W] === 0) {
        regionMap[idx - W] = regionId;
        stack[bot++] = idx - W;
      }
    }

    regionId++;
  }

  const regionCount = regionId - 1;
  buildRegionAdjacency(regionCount);
  applyNeighborCopy(rand);
}

// ─── ImageData paint ──────────────────────────────────────────────────────────
// Writes the fully-filled composition to the canvas in one putImageData call.
function paintImageData() {
  const pal = getPalette();
  const lineRGB = getInnerLineColorRGB();
  const gridRGB = hexToRGB(pal.line);
  const bgRGB = hexToRGB(pal.bg);
  const showInner = Number(params.lineOn) >= 0.5;
  const showGrid = Number(params.gridLineOn) >= 0.5;

  const pickNeighborRegion = (i) => {
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0 && regionMap[i - 1] > 0) return regionMap[i - 1];
    if (x + 1 < W && regionMap[i + 1] > 0) return regionMap[i + 1];
    if (y > 0 && regionMap[i - W] > 0) return regionMap[i - W];
    if (y + 1 < H && regionMap[i + W] > 0) return regionMap[i + W];
    return 0;
  };

  // Pre-compute one RGB per region (avoids repeated hex→rgb conversions)
  const precomp = new Array(regionColors.length);
  for (let i = 1; i < regionColors.length; i++) {
    precomp[i] = regionColors[i] ? hexToRGB(regionColors[i]) : bgRGB;
  }

  const imgData = ctx.createImageData(W, H);
  const d = imgData.data;

  for (let i = 0; i < W * H; i++) {
    const rid = regionMap[i];
    let rgb = bgRGB;
    if (rid === -1) {
      if (growthWalls[i]) {
        if (showInner) rgb = lineRGB;
        else {
          const nbr = pickNeighborRegion(i);
          rgb = nbr > 0 ? precomp[nbr] : bgRGB;
        }
      } else {
        if (showGrid) rgb = gridRGB;
        else {
          const nbr = pickNeighborRegion(i);
          rgb = nbr > 0 ? precomp[nbr] : bgRGB;
        }
      }
    } else if (rid > 0) {
      rgb = precomp[rid];
    }
    const o = i * 4;
    d[o] = rgb[0];
    d[o + 1] = rgb[1];
    d[o + 2] = rgb[2];
    d[o + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
}

// ─── Recolor (palette/image-mix/color-shift only) ─────────────────────────────
// Re-randomizes region colors from palette and/or image sampling, then repaints.
// Never re-runs the growth algorithm.
function recolor() {
  if (phase !== "done") return;
  const rand = mulberry32(seed + 77777);
  for (let i = 1; i < regionColors.length; i++) {
    assignRegionColor(i, rand);
  }
  applyNeighborCopy(rand);
  paintImageData();
  pendingPreview = true;
}

// Repaints (line visibility / line color changes) without reshuffling colors.
function repaint() {
  if (phase !== "done") return;
  paintImageData();
  pendingPreview = true;
}

// ─── Regenerate ───────────────────────────────────────────────────────────────
function regenerate() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  doResize();
  const pal = getPalette();
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, H);

  initGrid();
  squareCells = buildSquareLattice();
  rebuildEdgeCandidates();

  const rand = mulberry32(seed);
  spawnArms(rand, squareCells);
  phase = "growing";

  if (INSTANT_MODE) {
    // Synchronous grow + fill for the prewarm thumbnail iframe
    let guard = W * H;
    while (arms.some((a) => a.active) && guard-- > 0) {
      stepGrow(20);
    }
    floodFill();
    paintImageData();
    phase = "done";
    sendPreview();
    return;
  }

  rafId = requestAnimationFrame(tick);
}

// ─── Animation tick ───────────────────────────────────────────────────────────
function tick() {
  rafId = null;
  if (phase !== "growing") return;

  if (!paused) {
    const speed = Math.max(1, Math.round(params.growSpeed));
    const anyActive = stepGrow(speed);

    if (!anyActive) {
      // Growth finished — flood fill and paint
      floodFill();
      paintImageData();
      phase = "done";
      pendingPreview = true;
      return;
    }
  }

  rafId = requestAnimationFrame(tick);

  // Low-frequency preview during growth (every ~60 frames)
  previewCooldown--;
  if (previewCooldown <= 0) {
    previewCooldown = 60;
    sendPreview();
  }
}

// ─── Preview ─────────────────────────────────────────────────────────────────
function sendPreview() {
  const img = canvas.toDataURL("image/jpeg", 0.72);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image: img }, "*");
}

// ─── History helpers ─────────────────────────────────────────────────────────
function snapshotState() {
  return JSON.stringify({ params: { ...params }, seed, paused, imageLoaded: imageState.loaded });
}
function pushSnap(explicit) {
  if (history.suppress) return;
  const s = explicit !== undefined ? explicit : snapshotState();
  if (history.undoStack[history.undoStack.length - 1] === s) return;
  history.undoStack.push(s);
  if (history.undoStack.length > history.limit) history.undoStack.shift();
  history.redoStack.length = 0;
}
function applySnapshot(snap) {
  try {
    const state = JSON.parse(snap);
    history.suppress = true;
    if (state.params) Object.assign(params, state.params);
    if (typeof state.seed === "number") seed = state.seed;
    if (typeof state.paused === "boolean") paused = state.paused;
    regenerate();
    syncExtras();
    bridge.notifyValuesChanged();
  } finally {
    history.suppress = false;
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────
function undoHistory() {
  if (!history.undoStack.length) return;
  history.redoStack.push(snapshotState());
  applySnapshot(history.undoStack.pop());
}
function redoHistory() {
  if (!history.redoStack.length) return;
  history.undoStack.push(snapshotState());
  applySnapshot(history.redoStack.pop());
}
function randomizeAll() {
  pushSnap();
  controlSchema.forEach((cfg) => {
    if (cfg.type === "image-loader") return;
    if (cfg.type === "toggle") {
      params[cfg.id] = Math.random() < 0.5 ? 0 : 1;
      return;
    }
    if (cfg.type === "select") {
      const opts = Array.isArray(cfg.options) ? cfg.options : [];
      if (opts.length) params[cfg.id] = opts[Math.floor(Math.random() * opts.length)].value;
      return;
    }
    const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
    params[cfg.id] = Number((Math.round(raw / cfg.step) * cfg.step).toFixed(6));
  });
  seed = Math.floor(Math.random() * 2147483646) + 1;
  regenerate();
  syncExtras();
  bridge.notifyValuesChanged();
}
function rerollSeed() {
  pushSnap();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  regenerate();
  syncExtras();
  bridge.notifyValuesChanged();
}
function togglePause() {
  paused = !paused;
  if (!paused && phase === "growing" && !rafId) rafId = requestAnimationFrame(tick);
  syncExtras();
  bridge.notifyValuesChanged();
}
function actionRegenerate() {
  pushSnap();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  regenerate();
  syncExtras();
  bridge.notifyValuesChanged();
}
function actionRecolor() {
  if (phase !== "done") return;
  pushSnap();
  recolor();
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
    imageState = { loaded: false, width: 0, height: 0, data: null };
    edgeCandidates = [];
    regenerate();
    return;
  }
  imageState = {
    loaded: true,
    width: msgImageData.width,
    height: msgImageData.height,
    data: msgImageData.data instanceof Uint8ClampedArray ? msgImageData.data : new Uint8ClampedArray(msgImageData.data),
  };
  regenerate();
}

function clearImageData() {
  imageState = { loaded: false, width: 0, height: 0, data: null };
  edgeCandidates = [];
  regenerate();
}

// ─── Bridge init ──────────────────────────────────────────────────────────────
const bridge = window.ShaderOpsControls.init({
  schema: controlSchema,
  params,
  extras: { seed, paused },

  onParams(changedIds, p, commit) {
    if (commit) pushSnap();

    const needRegen = changedIds.some((id) =>
      [
        "gridRows",
        "gridCols",
        "gridGap",
        "gridLineWidth",
        "staggerRows",
        "seedDensity",
        "edgeDensity",
        "dualAxisProb",
        "axisRotate",
        "lineWidth",
        "growSpeed",
      ].includes(id)
    );
    const needRecolor = changedIds.some((id) =>
      ["paletteSel", "imageColorMix", "colorShiftProb", "neighborCopyProb", "saturation"].includes(id)
    );
    const needRepaint = changedIds.some((id) => ["lineColor", "lineOn", "gridLineOn"].includes(id));

    if (needRegen) {
      regenerate();
    } else if (phase === "done") {
      if (needRecolor) recolor();
      else if (needRepaint) repaint();
    }

    pendingPreview = true;
  },

  onExtras(extras) {
    if (typeof extras.seed === "number" && Number.isFinite(extras.seed)) seed = extras.seed;
    if (typeof extras.paused === "boolean") paused = extras.paused;
  },

  actions: {
    randomizeAll,
    rerollSeed,
    undo: undoHistory,
    redo: redoHistory,
    togglePause,
    regenerate: actionRegenerate,
    recolor: actionRecolor,
  },
});

// ─── postMessage / lifecycle ──────────────────────────────────────────────────
window.addEventListener("message", (e) => {
  if (e.data?.type === "shaderops/request-preview") {
    sendPreview();
    return;
  }
  if (e.data?.type === "shaderops/image-load" && e.data?.imageData) {
    pushSnap();
    applyImageData(e.data.imageData);
    syncExtras();
    bridge.notifyValuesChanged();
    return;
  }
  if (e.data?.type === "shaderops/image-clear") {
    pushSnap();
    clearImageData();
    syncExtras();
    bridge.notifyValuesChanged();
  }
});
window.addEventListener("beforeunload", sendPreview);
window.addEventListener("resize", () => {
  if (rafId) cancelAnimationFrame(rafId);
  regenerate();
});

// ─── Start ────────────────────────────────────────────────────────────────────
regenerate();

// After growth completes, emit a high-quality preview
if (!INSTANT_MODE) {
  const waitDone = setInterval(() => {
    if (phase === "done") {
      clearInterval(waitDone);
      sendPreview();
    }
  }, 250);
}
