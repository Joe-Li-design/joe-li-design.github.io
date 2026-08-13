const PROJECT_ID = new URLSearchParams(location.search).get("project") || "image-filter-canvas";

const schema = [
  {
    id: "fitMode",
    label: "Fit Mode",
    group: "Image",
    type: "select",
    default: "contain",
    options: [
      { value: "contain", label: "Contain" },
      { value: "cover", label: "Cover" },
      { value: "stretch", label: "Stretch" },
    ],
  },
  { id: "zoom", label: "Zoom", group: "Image", min: 0.1, max: 3.0, step: 0.01, default: 1.0 },
  { id: "offsetX", label: "Offset X", group: "Image", min: -1.0, max: 1.0, step: 0.01, default: 0.0, pillMode: "center-zero" },
  { id: "offsetY", label: "Offset Y", group: "Image", min: -1.0, max: 1.0, step: 0.01, default: 0.0, pillMode: "center-zero" },
  { id: "bgTone", label: "Background", group: "Image", min: 0.0, max: 1.0, step: 0.01, default: 0.06 },
  { id: "imageLoader", label: "Image", group: "Input", type: "image-loader" },
];

const params = {};
schema.forEach((cfg) => {
  if (cfg.type === "image-loader") return;
  params[cfg.id] = cfg.default;
});

const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = true;

const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d");

let imageLoaded = false;
let seed = Math.floor(Math.random() * 2147483646) + 1;
let paused = false;
let bridge;

const history = { undoStack: [], redoStack: [], limit: 100, suppress: false };

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function resizeCanvas() {
  const w = Math.max(2, Math.floor(canvas.clientWidth || window.innerWidth));
  const h = Math.max(2, Math.floor(canvas.clientHeight || window.innerHeight));
  canvas.width = w;
  canvas.height = h;
}

function snapshotState() {
  return JSON.stringify({ params: { ...params }, seed, paused, imageLoaded });
}

function pushHistorySnapshot(explicitSnapshot) {
  if (history.suppress) return;
  const snap = explicitSnapshot !== undefined ? explicitSnapshot : snapshotState();
  if (history.undoStack[history.undoStack.length - 1] === snap) return;
  history.undoStack.push(snap);
  if (history.undoStack.length > history.limit) history.undoStack.shift();
  history.redoStack.length = 0;
}

function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
}

function render() {
  const w = canvas.width;
  const h = canvas.height;
  const tone = clamp(Number(params.bgTone), 0, 1);
  const c = Math.round(tone * 255);
  ctx.fillStyle = `rgb(${c}, ${c}, ${c})`;
  ctx.fillRect(0, 0, w, h);

  if (!imageLoaded || sourceCanvas.width < 1 || sourceCanvas.height < 1) {
    ctx.fillStyle = "rgba(255,255,255,0.68)";
    ctx.font = "500 18px -apple-system, Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Load an image from the panel", w * 0.5, h * 0.5);
    return;
  }

  const mode = String(params.fitMode || "contain");
  const zoom = Math.max(0.01, Number(params.zoom) || 1);
  const ox = clamp(Number(params.offsetX) || 0, -1, 1);
  const oy = clamp(Number(params.offsetY) || 0, -1, 1);
  const iw = sourceCanvas.width;
  const ih = sourceCanvas.height;
  const imgAspect = iw / Math.max(1, ih);
  const viewAspect = w / Math.max(1, h);

  let baseW = w;
  let baseH = h;
  if (mode === "contain") {
    if (imgAspect > viewAspect) {
      baseW = w;
      baseH = w / imgAspect;
    } else {
      baseH = h;
      baseW = h * imgAspect;
    }
  } else if (mode === "cover") {
    if (imgAspect > viewAspect) {
      baseH = h;
      baseW = h * imgAspect;
    } else {
      baseW = w;
      baseH = w / imgAspect;
    }
  }

  const drawW = baseW * zoom;
  const drawH = baseH * zoom;
  const dx = (w - drawW) * 0.5 + ox * w * 0.5;
  const dy = (h - drawH) * 0.5 + oy * h * 0.5;
  ctx.drawImage(sourceCanvas, dx, dy, drawW, drawH);
}

function sendPreview() {
  render();
  const image = canvas.toDataURL("image/jpeg", 0.82);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
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
    imageLoaded = false;
    sourceCanvas.width = 1;
    sourceCanvas.height = 1;
    sourceCtx.clearRect(0, 0, 1, 1);
    render();
    return;
  }
  const width = Math.floor(msgImageData.width);
  const height = Math.floor(msgImageData.height);
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const data = msgImageData.data instanceof Uint8ClampedArray ? msgImageData.data : new Uint8ClampedArray(msgImageData.data);
  sourceCtx.putImageData(new ImageData(data, width, height), 0, 0);
  imageLoaded = true;
  render();
}

function clearImageData() {
  imageLoaded = false;
  sourceCanvas.width = 1;
  sourceCanvas.height = 1;
  sourceCtx.clearRect(0, 0, 1, 1);
  render();
}

function applyParams(nextParams, recordHistory) {
  if (recordHistory) pushHistorySnapshot();
  Object.keys(nextParams).forEach((id) => {
    if (params[id] === undefined) return;
    params[id] = nextParams[id];
  });
  render();
}

function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") applyParams(state.params, false);
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) seed = Math.max(1, Math.floor(state.seed));
    if (typeof state.paused === "boolean") paused = state.paused;
    syncExtras();
    bridge.notifyValuesChanged();
    render();
  } finally {
    history.suppress = false;
  }
}

function undoHistory() {
  if (!history.undoStack.length) return;
  const current = snapshotState();
  const previous = history.undoStack.pop();
  history.redoStack.push(current);
  applySnapshot(previous);
}

function redoHistory() {
  if (!history.redoStack.length) return;
  const current = snapshotState();
  const next = history.redoStack.pop();
  history.undoStack.push(current);
  applySnapshot(next);
}

function randomizeAll() {
  pushHistorySnapshot();
  schema.forEach((cfg) => {
    if (cfg.type === "image-loader") return;
    if (cfg.type === "select") {
      const opts = Array.isArray(cfg.options) ? cfg.options : [];
      if (opts.length) params[cfg.id] = opts[Math.floor(Math.random() * opts.length)].value;
      return;
    }
    const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
    const quantized = Math.round(raw / cfg.step) * cfg.step;
    params[cfg.id] = Number(quantized.toFixed(6));
  });
  seed = Math.floor(Math.random() * 2147483646) + 1;
  render();
  syncExtras();
  bridge.notifyValuesChanged();
}

function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  syncExtras();
  bridge.notifyValuesChanged();
}

function togglePause() {
  pushHistorySnapshot();
  paused = !paused;
  syncExtras();
  bridge.notifyValuesChanged();
}

history.suppress = true;
bridge = window.ShaderOpsControls.init({
  projectId: PROJECT_ID,
  schema,
  params,
  extras: { seed, paused },
  onParams: (ids, nextParams, commit, prevValues) => {
    if (commit && !history.suppress) {
      const priorSnapshot = JSON.stringify({ params: prevValues || params, seed, paused, imageLoaded });
      if (history.undoStack[history.undoStack.length - 1] !== priorSnapshot) {
        history.undoStack.push(priorSnapshot);
        if (history.undoStack.length > history.limit) history.undoStack.shift();
        history.redoStack.length = 0;
      }
    }
    applyParams(nextParams, false);
  },
  onExtras: (nextExtras) => {
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed)) seed = Math.max(1, Math.floor(nextExtras.seed));
    if (typeof nextExtras.paused === "boolean") paused = nextExtras.paused;
  },
  actions: {
    randomizeAll,
    rerollSeed,
    togglePause,
    undo: undoHistory,
    redo: redoHistory,
  },
});

if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) {
  seed = Math.max(1, Math.floor(bridge.extras.seed));
}
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
history.suppress = false;

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

window.addEventListener("resize", () => {
  resizeCanvas();
  render();
  sendPreview();
});

window.addEventListener("beforeunload", () => sendPreview());

resizeCanvas();
render();
sendPreview();

