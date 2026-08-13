import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = new URLSearchParams(location.search).get("project") || "x-cross-halftone-lab";

const PRESET = {
  speed: 0.38,
  samplePrecision: 94,
  xThickness: 0.11,
  xSoftness: 0.03,
  sizeMin: 0.16,
  sizeMax: 0.47,
  densityMin: 0.12,
  densityMax: 1.0,
  angle: 0,
  splitColor: 1,
  splitAmount: 0.3,
  splitRandom: 0.82,
  splitValueDiff: 0.0,
  splitHueDiff: 0.0,
  splitMapBlend: 0.62,
  groupPreview: 0,
  groupHueShift: 22,
  splitMapScale: 6.0,
  splitMapWarp: 0.85,
  noiseScale: 1.2,
  gradientTilt: 0.58,
};

const schema = [
  { id: "speed", label: "Speed", group: "Global", min: 0.0, max: 2.0, step: 0.01, default: PRESET.speed },
  { id: "samplePrecision", label: "Precision", group: "Halftone", min: 10, max: 280, step: 1, default: PRESET.samplePrecision, hint: "Overall sampling precision of X units" },
  { id: "xThickness", label: "X Thickness", group: "Halftone", min: 0.01, max: 0.32, step: 0.001, default: PRESET.xThickness, hint: "Thickness of each X stroke" },
  { id: "xSoftness", label: "X Soft", group: "Halftone", min: 0.001, max: 0.12, step: 0.001, default: PRESET.xSoftness },
  { id: "sizeMin", label: "Size Min", group: "Halftone", min: 0.01, max: 0.49, step: 0.001, default: PRESET.sizeMin },
  { id: "sizeMax", label: "Size Max", group: "Halftone", min: 0.05, max: 0.49, step: 0.001, default: PRESET.sizeMax },
  { id: "densityMin", label: "Density Min", group: "Halftone", min: 0.0, max: 1.0, step: 0.01, default: PRESET.densityMin },
  { id: "densityMax", label: "Density Max", group: "Halftone", min: 0.0, max: 1.0, step: 0.01, default: PRESET.densityMax },
  { id: "angle", label: "Angle", group: "Halftone", min: -45, max: 45, step: 1, default: PRESET.angle },
  { id: "splitColor", label: "Enable Split", type: "toggle", group: "Split Color", default: PRESET.splitColor, hint: "Split each unit color into two line colors" },
  { id: "splitAmount", label: "Split Amount", group: "Split Color", min: 0.0, max: 0.95, step: 0.01, default: PRESET.splitAmount, showIf: "splitColor" },
  { id: "splitRandom", label: "Split Random", group: "Split Color", min: 0.0, max: 1.0, step: 0.01, default: PRESET.splitRandom, showIf: "splitColor" },
  { id: "splitValueDiff", label: "Value Differences", group: "Split Color", min: -1.0, max: 1.0, step: 0.01, default: PRESET.splitValueDiff, showIf: "splitColor", pillMode: "center-zero", hint: "0 keeps current random split. -1 forces equal value. 1 pushes value contrast to max." },
  { id: "splitHueDiff", label: "Hue Differences", group: "Split Color", min: -1.0, max: 1.0, step: 0.01, default: PRESET.splitHueDiff, showIf: "splitColor", pillMode: "center-zero", hint: "0 keeps current hue split. -1 forces equal hue. 1 pushes hue separation to max." },
  { id: "splitMapBlend", label: "Map Blend", group: "Split Map", min: 0.0, max: 1.0, step: 0.01, default: PRESET.splitMapBlend, showIf: "splitColor", hint: "Blend between random split (0) and split-map grouping (1)" },
  { id: "groupHueShift", label: "Hue Shift", group: "Split Map", min: 0.0, max: 180.0, step: 1, default: PRESET.groupHueShift, showIf: "splitColor", hint: "Random hue shift range (degrees) applied per split-map group to Color1" },
  { id: "groupPreview", label: "Group Preview", type: "toggle", group: "Split Map", default: PRESET.groupPreview, showIf: "splitColor", hint: "Visualize split-map grouping and Color1 grouping colors" },
  { id: "splitMapScale", label: "Split Map Scale", group: "Split Map", min: 1.0, max: 24.0, step: 0.1, default: PRESET.splitMapScale, showIf: "splitColor", hint: "Noise-map group size (higher = larger grouped regions)" },
  { id: "splitMapWarp", label: "Split Map Warp", group: "Split Map", min: 0.0, max: 2.0, step: 0.01, default: PRESET.splitMapWarp, showIf: "splitColor", hint: "How irregular/noisy the split groups are" },
  { id: "noiseScale", label: "Noise Scale", group: "Input", min: 0.25, max: 2.5, step: 0.01, default: PRESET.noiseScale },
  { id: "gradientTilt", label: "Grad Tilt", group: "Input", min: 0.0, max: 1.0, step: 0.01, default: PRESET.gradientTilt },
  { id: "imageLoader", label: "Image", group: "Input", type: "image-loader" },
];

const params = {};
schema.forEach((cfg) => {
  if (cfg.type === "image-loader") return;
  params[cfg.id] = cfg.default;
});

let seed = 296311;
let paused = false;
let elapsed = 0;
let lastTs = performance.now() * 0.001;
let pendingPreview = true;
let previewCooldown = 0;
let fallbackDirty = true;
let hasUploadedImage = false;
let bridge;

const history = { undoStack: [], redoStack: [], limit: 120, suppress: false };

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const legacyCanvas = document.getElementById("fx");
if (legacyCanvas) legacyCanvas.remove();
document.getElementById("app").prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  u_time: { value: 0 },
  u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  u_sourceTex: { value: null },
  u_sourceAspect: { value: 1 },
  u_viewAspect: { value: Math.max(1e-5, window.innerWidth / Math.max(1, window.innerHeight)) },
  u_hasUploaded: { value: 0 },
  u_speed: { value: params.speed },
  u_precision: { value: params.samplePrecision },
  u_xThickness: { value: params.xThickness },
  u_xSoft: { value: params.xSoftness },
  u_sizeMin: { value: params.sizeMin },
  u_sizeMax: { value: params.sizeMax },
  u_densityMin: { value: params.densityMin },
  u_densityMax: { value: params.densityMax },
  u_angle: { value: params.angle * Math.PI / 180 },
  u_splitEnabled: { value: params.splitColor },
  u_splitAmount: { value: params.splitAmount },
  u_splitRandom: { value: params.splitRandom },
  u_splitValueDiff: { value: params.splitValueDiff },
  u_splitHueDiff: { value: params.splitHueDiff },
  u_splitMapBlend: { value: params.splitMapBlend },
  u_groupPreview: { value: params.groupPreview },
  u_groupHueShift: { value: params.groupHueShift / 360 },
  u_splitMapScale: { value: params.splitMapScale },
  u_splitMapWarp: { value: params.splitMapWarp },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform sampler2D u_sourceTex;
    uniform float u_sourceAspect;
    uniform float u_viewAspect;
    uniform float u_hasUploaded;
    uniform float u_speed;
    uniform float u_precision;
    uniform float u_xThickness;
    uniform float u_xSoft;
    uniform float u_sizeMin;
    uniform float u_sizeMax;
    uniform float u_densityMin;
    uniform float u_densityMax;
    uniform float u_angle;
    uniform float u_splitEnabled;
    uniform float u_splitAmount;
    uniform float u_splitRandom;
    uniform float u_splitValueDiff;
    uniform float u_splitHueDiff;
    uniform float u_splitMapBlend;
    uniform float u_groupPreview;
    uniform float u_groupHueShift;
    uniform float u_splitMapScale;
    uniform float u_splitMapWarp;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    vec2 hash22(vec2 p) {
      return vec2(hash21(p + vec2(11.2, 7.7)), hash21(p + vec2(27.3, 94.9)));
    }

    vec3 hash33(vec2 p) {
      return vec3(hash21(p + vec2(3.1, 9.2)), hash21(p + vec2(41.7, 17.3)), hash21(p + vec2(88.6, 27.9)));
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float luma(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    vec3 rgb2hsv(vec3 c){
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    vec3 hsv2rgb(vec3 c){
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    vec2 rot(vec2 p, float a) {
      float c = cos(a);
      float s = sin(a);
      return mat2(c, -s, s, c) * p;
    }

    float maxDeltaChannel(float c, float d) {
      if (d > 0.0) return (1.0 - c) / d;
      if (d < 0.0) return c / (-d);
      return 1e9;
    }

    float lineMask(float dist, float thick, float soft) {
      return 1.0 - smoothstep(thick, thick + soft, dist);
    }

    vec2 sourceUv(vec2 uv, vec2 drift) {
      vec2 base = uv + drift;
      float sx = max(1e-5, u_sourceAspect / max(1e-5, u_viewAspect));
      vec2 su = vec2((base.x - 0.5) / sx + 0.5, base.y);
      if (su.x < 0.0 || su.x > 1.0 || su.y < 0.0 || su.y > 1.0) return vec2(-1.0, -1.0);
      // Uploaded image data arrives in top-left origin; flip Y to match shader UV space.
      su.y = mix(su.y, 1.0 - su.y, step(0.5, u_hasUploaded));
      return su;
    }

    vec3 sampleSource(vec2 uv, vec2 drift) {
      vec2 su = sourceUv(uv, drift);
      if (su.x < 0.0) return vec3(0.0);
      return texture2D(u_sourceTex, su).rgb;
    }

    vec3 sampleAverageColor(vec2 baseCell, float grid, vec2 drift) {
      vec2 p0 = (baseCell + vec2(0.25, 0.25)) / grid;
      vec2 p1 = (baseCell + vec2(0.75, 0.25)) / grid;
      vec2 p2 = (baseCell + vec2(0.25, 0.75)) / grid;
      vec2 p3 = (baseCell + vec2(0.75, 0.75)) / grid;
      vec3 c0 = sampleSource(p0, drift);
      vec3 c1 = sampleSource(p1, drift);
      vec3 c2 = sampleSource(p2, drift);
      vec3 c3 = sampleSource(p3, drift);
      return (c0 + c1 + c2 + c3) * 0.25;
    }

    vec3 sampleGroupColor(vec2 groupCell, float groupSize, float grid, vec2 drift) {
      vec2 base = groupCell * groupSize;
      vec2 jitter = (hash22(groupCell + vec2(17.3, 5.1)) - 0.5) * groupSize * 0.34;
      vec2 p0 = (base + vec2(0.2, 0.2) * groupSize + jitter) / grid;
      vec2 p1 = (base + vec2(0.8, 0.2) * groupSize - jitter.yx * 0.5) / grid;
      vec2 p2 = (base + vec2(0.2, 0.8) * groupSize + jitter.yx * 0.5) / grid;
      vec2 p3 = (base + vec2(0.8, 0.8) * groupSize - jitter) / grid;
      vec3 c0 = sampleSource(p0, drift);
      vec3 c1 = sampleSource(p1, drift);
      vec3 c2 = sampleSource(p2, drift);
      vec3 c3 = sampleSource(p3, drift);
      return (c0 + c1 + c2 + c3) * 0.25;
    }

    void main() {
      vec2 uv = vUv;
      vec2 drift = vec2(sin(u_time * 0.13), cos(u_time * 0.11)) * 0.009 * u_speed * (1.0 - u_hasUploaded);
      vec2 mainSu = sourceUv(uv, drift);
      if (mainSu.x < 0.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      float grid = max(u_precision, 1.0);
      vec2 cell = floor(uv * grid);
      vec2 local = fract(uv * grid) - 0.5;

      vec3 avgColor = sampleAverageColor(cell, grid, drift);
      float g = clamp(luma(avgColor), 0.0, 1.0);
      float darkness = 1.0 - g;

      float keepProb = mix(clamp(u_densityMin, 0.0, 1.0), clamp(u_densityMax, 0.0, 1.0), darkness);
      float alive = step(hash21(cell + vec2(7.1, 29.4)), keepProb);

      float sizeLo = clamp(min(u_sizeMin, u_sizeMax), 0.01, 0.49);
      float sizeHi = clamp(max(u_sizeMin, u_sizeMax), 0.01, 0.49);
      float halfSize = mix(sizeLo, sizeHi, darkness);

      float angleJitter = (hash21(cell + vec2(93.2, 1.8)) - 0.5) * 0.8;
      vec2 p = rot(local, u_angle + angleJitter);
      float xGate = 1.0 - smoothstep(halfSize, halfSize + u_xSoft, max(abs(p.x), abs(p.y)));

      float thick = clamp(u_xThickness, 0.002, 0.4);
      float soft = clamp(u_xSoft, 0.0005, 0.2);
      float lineA = lineMask(abs(p.y - p.x), thick, soft) * xGate * alive;
      float lineB = lineMask(abs(p.y + p.x), thick, soft) * xGate * alive;

      vec3 paper = vec3(0.968, 0.956, 0.928);
      vec3 outCol = paper;
      float splitEnabled = step(0.5, u_splitEnabled);

      vec3 randDir = hash33(cell + floor(avgColor.rg * 91.0) + vec2(avgColor.b * 73.0, avgColor.r * 57.0)) * 2.0 - 1.0;
      randDir *= vec3(1.0 + 0.5 * u_splitRandom, 1.0 + 0.5 * u_splitRandom, 1.0 + 0.35 * u_splitRandom);
      float dirLen = length(randDir);
      vec3 dir = dirLen > 1e-4 ? randDir / dirLen : vec3(0.76, -0.28, 0.59);

      float groupSize = max(1.0, u_splitMapScale);
      vec2 warpNoise = vec2(
        valueNoise(cell * 0.087 + vec2(3.7, 11.2)),
        valueNoise(cell * 0.087 + vec2(16.1, 2.4))
      ) - 0.5;
      vec2 warpedCell = cell + warpNoise * groupSize * clamp(u_splitMapWarp, 0.0, 2.0);
      vec2 groupCell = floor(warpedCell / groupSize);
      vec3 groupColorRaw = sampleGroupColor(groupCell, groupSize, grid, drift);
      float groupHueRand = hash21(groupCell + vec2(61.2, 14.8)) * 2.0 - 1.0;
      vec3 groupHsv = rgb2hsv(groupColorRaw);
      groupHsv.x = fract(groupHsv.x + groupHueRand * clamp(u_groupHueShift, 0.0, 0.5));
      vec3 groupColorShifted = hsv2rgb(groupHsv);

      // Bottom stroke color (Color1) starts from split-map group average, then is
      // balanced toward the unit color only as much as needed to keep the top color valid.
      vec3 groupDelta = groupColorShifted - avgColor;
      float groupScaleMax = min(
        maxDeltaChannel(avgColor.r, groupDelta.r),
        min(maxDeltaChannel(avgColor.g, groupDelta.g), maxDeltaChannel(avgColor.b, groupDelta.b))
      );
      vec3 c1Map = avgColor + groupDelta * min(1.0, max(0.0, groupScaleMax));

      float tMax = min(
        maxDeltaChannel(avgColor.r, dir.r),
        min(maxDeltaChannel(avgColor.g, dir.g), maxDeltaChannel(avgColor.b, dir.b))
      );
      vec3 symmetric = dir * max(0.0, tMax) * clamp(u_splitAmount, 0.0, 0.999);
      vec3 c1Random = clamp(avgColor + symmetric, 0.0, 1.0);

      // Ensure Color2 stays displayable while preserving exact mean:
      // Color2 = 2*Color0 - Color1, so Color1 must stay within [2*Color0-1, 2*Color0].
      vec3 c1Lower = max(vec3(0.0), 2.0 * avgColor - vec3(1.0));
      vec3 c1Upper = min(vec3(1.0), 2.0 * avgColor);
      c1Map = clamp(c1Map, c1Lower, c1Upper);
      c1Random = clamp(c1Random, c1Lower, c1Upper);

      float valueDiff = clamp(u_splitValueDiff, -1.0, 1.0);
      if (valueDiff < 0.0) {
        c1Random = mix(c1Random, avgColor, -valueDiff);
      } else if (valueDiff > 0.0) {
        vec3 dirSign = step(vec3(0.0), c1Random - avgColor);
        vec3 c1Extreme = mix(c1Lower, c1Upper, dirSign);
        c1Random = mix(c1Random, c1Extreme, valueDiff);
      }
      c1Random = clamp(c1Random, c1Lower, c1Upper);

      float hueDiff = clamp(u_splitHueDiff, -1.0, 1.0);
      vec3 hsvBase = rgb2hsv(avgColor);
      vec3 hsvRand = rgb2hsv(c1Random);
      if (abs(hueDiff) > 1e-5 && hsvBase.y > 0.01 && hsvRand.y > 0.01) {
        float hueSigned = hsvRand.x - hsvBase.x;
        hueSigned = hueSigned - floor(hueSigned + 0.5);
        float hueAbs = abs(hueSigned);
        float hueDir = hueSigned >= 0.0 ? 1.0 : -1.0;
        float targetHueAbs = hueAbs;
        if (hueDiff < 0.0) {
          targetHueAbs = hueAbs * (1.0 + hueDiff);
        } else if (hueDiff > 0.0) {
          targetHueAbs = mix(hueAbs, 0.5, hueDiff);
        }
        hsvRand.x = fract(hsvBase.x + hueDir * targetHueAbs + 1.0);
        c1Random = hsv2rgb(hsvRand);
      }
      c1Random = clamp(c1Random, c1Lower, c1Upper);

      vec3 c1 = mix(c1Random, c1Map, clamp(u_splitMapBlend, 0.0, 1.0));
      c1 = clamp(c1, c1Lower, c1Upper);
      vec3 c2 = 2.0 * avgColor - c1;

      float strength = alive;
      vec3 single = mix(paper, avgColor, lineA * strength);
      single = mix(single, avgColor, lineB * strength);

      vec3 split = mix(paper, c1, lineA * strength);
      split = mix(split, c2, lineB * strength);

      // Line B is drawn last so one stroke visually stacks over the other.
      outCol = mix(single, split, splitEnabled);
      if (u_groupPreview > 0.5 && splitEnabled > 0.5) {
        vec3 gidColor = hash33(groupCell + vec2(10.3, 39.1));
        vec3 preview = mix(gidColor, c1, 0.55);
        outCol = mix(outCol, preview, 0.72);
      }
      gl_FragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
    }
  `,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safe(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

function mulberry32(a) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToRgb(h, s, l) {
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  if (s <= 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

function createFallbackImageData(width, height) {
  const data = new Uint8Array(width * height * 4);
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const grainScale = clamp(params.noiseScale, 0.15, 4.0);
  const tilt = clamp(params.gradientTilt, 0, 1);
  const hueA = rand();
  const hueB = (hueA + 0.19 + rand() * 0.18) % 1;
  const hueC = (hueB + 0.23 + rand() * 0.2) % 1;

  for (let y = 0; y < height; y += 1) {
    const v = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(1, width - 1);
      const i = (y * width + x) * 4;
      const g1 = u * (1 - tilt) + v * tilt;
      const g2 = 0.5 + 0.5 * Math.sin((u * 5.4 + v * 3.3 + rand() * 2.0) * grainScale);
      const g3 = 0.5 + 0.5 * Math.cos((u * 2.3 - v * 4.9) * (0.7 + grainScale * 0.45));
      const blend = clamp(0.54 * g1 + 0.3 * g2 + 0.16 * g3, 0, 1);
      const hue = (hueA + blend * (hueB - hueA) + g3 * 0.08 + 1.0) % 1.0;
      const sat = clamp(0.55 + g2 * 0.35, 0, 1);
      const val = clamp(0.25 + blend * 0.6, 0, 1);
      const rgb = hslToRgb((hue + hueC * 0.17) % 1.0, sat, val);
      data[i] = Math.round(rgb[0] * 255);
      data[i + 1] = Math.round(rgb[1] * 255);
      data[i + 2] = Math.round(rgb[2] * 255);
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

function createTextureFromImageData(imageData) {
  const array = imageData.data instanceof Uint8Array ? imageData.data : new Uint8Array(imageData.data);
  const texture = new THREE.DataTexture(array, imageData.width, imageData.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function setSourceTexture(texture, uploaded, sourceAspect = 1) {
  if (uniforms.u_sourceTex.value && uniforms.u_sourceTex.value !== texture) {
    uniforms.u_sourceTex.value.dispose();
  }
  uniforms.u_sourceTex.value = texture;
  uniforms.u_sourceAspect.value = Math.max(1e-5, sourceAspect);
  hasUploadedImage = uploaded;
  uniforms.u_hasUploaded.value = uploaded ? 1 : 0;
  pendingPreview = true;
}

function ensureFallbackTexture() {
  if (!fallbackDirty || hasUploadedImage) return;
  const fallbackImage = createFallbackImageData(1024, 1024);
  setSourceTexture(createTextureFromImageData(fallbackImage), false, fallbackImage.width / Math.max(1, fallbackImage.height));
  fallbackDirty = false;
}

function applyParamsToUniforms() {
  params.speed = safe(params.speed, PRESET.speed, -4, 8);
  params.samplePrecision = safe(params.samplePrecision, PRESET.samplePrecision, -1000, 10000);
  params.xThickness = safe(params.xThickness, PRESET.xThickness, -10, 10);
  params.xSoftness = safe(params.xSoftness, PRESET.xSoftness, -10, 10);
  params.sizeMin = safe(params.sizeMin, PRESET.sizeMin, -10, 10);
  params.sizeMax = safe(params.sizeMax, PRESET.sizeMax, -10, 10);
  params.densityMin = safe(params.densityMin, PRESET.densityMin, -10, 10);
  params.densityMax = safe(params.densityMax, PRESET.densityMax, -10, 10);
  params.angle = safe(params.angle, PRESET.angle, -20000, 20000);
  params.splitColor = safe(params.splitColor, PRESET.splitColor, 0, 1);
  params.splitAmount = safe(params.splitAmount, PRESET.splitAmount, -1000, 1000);
  params.splitRandom = safe(params.splitRandom, PRESET.splitRandom, -1000, 1000);
  params.splitValueDiff = safe(params.splitValueDiff, PRESET.splitValueDiff, -1000, 1000);
  params.splitHueDiff = safe(params.splitHueDiff, PRESET.splitHueDiff, -1000, 1000);
  params.splitMapBlend = safe(params.splitMapBlend, PRESET.splitMapBlend, -1000, 1000);
  params.groupPreview = safe(params.groupPreview, PRESET.groupPreview, 0, 1);
  params.groupHueShift = safe(params.groupHueShift, PRESET.groupHueShift, -1000, 10000);
  params.splitMapScale = safe(params.splitMapScale, PRESET.splitMapScale, -1000, 10000);
  params.splitMapWarp = safe(params.splitMapWarp, PRESET.splitMapWarp, -1000, 1000);
  params.noiseScale = safe(params.noiseScale, PRESET.noiseScale, -10, 10);
  params.gradientTilt = safe(params.gradientTilt, PRESET.gradientTilt, -4, 4);

  uniforms.u_speed.value = clamp(params.speed, 0.0, 4.0);
  uniforms.u_precision.value = clamp(params.samplePrecision, 1.0, 1200.0);
  uniforms.u_xThickness.value = clamp(params.xThickness, 0.001, 0.4);
  uniforms.u_xSoft.value = clamp(params.xSoftness, 0.0005, 0.2);
  uniforms.u_sizeMin.value = clamp(params.sizeMin, 0.01, 0.49);
  uniforms.u_sizeMax.value = clamp(params.sizeMax, 0.01, 0.49);
  uniforms.u_densityMin.value = clamp(params.densityMin, 0.0, 1.0);
  uniforms.u_densityMax.value = clamp(params.densityMax, 0.0, 1.0);
  uniforms.u_angle.value = params.angle * Math.PI / 180.0;
  uniforms.u_splitEnabled.value = params.splitColor >= 0.5 ? 1 : 0;
  uniforms.u_splitAmount.value = clamp(params.splitAmount, 0.0, 0.999);
  uniforms.u_splitRandom.value = clamp(params.splitRandom, 0.0, 1.0);
  uniforms.u_splitValueDiff.value = clamp(params.splitValueDiff, -1.0, 1.0);
  uniforms.u_splitHueDiff.value = clamp(params.splitHueDiff, -1.0, 1.0);
  uniforms.u_splitMapBlend.value = clamp(params.splitMapBlend, 0.0, 1.0);
  uniforms.u_groupPreview.value = params.groupPreview >= 0.5 ? 1 : 0;
  uniforms.u_groupHueShift.value = clamp(params.groupHueShift, 0.0, 360.0) / 360.0;
  uniforms.u_splitMapScale.value = clamp(params.splitMapScale, 1.0, 64.0);
  uniforms.u_splitMapWarp.value = clamp(params.splitMapWarp, 0.0, 2.0);
}

function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
}

function snapshotState() {
  return JSON.stringify({ params: { ...params }, seed, paused, hasUploadedImage });
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
  let fallbackChanged = false;
  Object.keys(nextParams).forEach((id) => {
    if (params[id] === undefined) return;
    params[id] = nextParams[id];
    if (id === "noiseScale" || id === "gradientTilt") fallbackChanged = true;
  });
  if (fallbackChanged && !hasUploadedImage) fallbackDirty = true;
  applyParamsToUniforms();
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
    if (!hasUploadedImage) fallbackDirty = true;
    pendingPreview = true;
    syncExtras();
    bridge.notifyValuesChanged();
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
    const quantized = Math.round(raw / cfg.step) * cfg.step;
    params[cfg.id] = Number(quantized.toFixed(6));
  });
  applyParamsToUniforms();
  if (!hasUploadedImage) fallbackDirty = true;
  seed = Math.floor(Math.random() * 2147483646) + 1;
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}

function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  if (!hasUploadedImage) fallbackDirty = true;
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

function renderFrame() {
  ensureFallbackTexture();
  uniforms.u_time.value = elapsed;
  renderer.render(scene, camera);
}

function sendPreview() {
  renderFrame();
  const image = renderer.domElement.toDataURL("image/jpeg", 0.82);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

history.suppress = true;
bridge = window.ShaderOpsControls.init({
  projectId: PROJECT_ID,
  schema,
  params,
  extras: { seed, paused },
  onParams: (ids, nextParams, commit, prevValues) => {
    if (commit && !history.suppress) {
      const priorSnapshot = JSON.stringify({ params: prevValues || params, seed, paused, hasUploadedImage });
      if (history.undoStack[history.undoStack.length - 1] !== priorSnapshot) {
        history.undoStack.push(priorSnapshot);
        if (history.undoStack.length > history.limit) history.undoStack.shift();
        history.redoStack.length = 0;
      }
    }
    applyParamsFromBridge(nextParams, false);
  },
  onExtras: (nextExtras) => {
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed)) {
      pushHistorySnapshot();
      seed = Math.max(1, Math.floor(nextExtras.seed));
      if (!hasUploadedImage) fallbackDirty = true;
      pendingPreview = true;
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

applyParamsToUniforms();

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
  uniforms.u_viewAspect.value = Math.max(1e-5, window.innerWidth / Math.max(1, window.innerHeight));
  pendingPreview = true;
});

window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "z") return;
  event.preventDefault();
  if (event.shiftKey) redoHistory();
  else undoHistory();
});

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg) return;
  if (msg.type === "shaderops/request-preview") { sendPreview(); return; }
  if (msg.type === "shaderops/image-load" && msg.imageData && Number.isFinite(msg.imageData.width) && Number.isFinite(msg.imageData.height)) {
    pushHistorySnapshot();
    const texture = createTextureFromImageData({
      width: msg.imageData.width,
      height: msg.imageData.height,
      data: msg.imageData.data,
    });
    setSourceTexture(texture, true, msg.imageData.width / Math.max(1, msg.imageData.height));
    bridge.notifyValuesChanged();
    return;
  }
  if (msg.type === "shaderops/image-clear") {
    pushHistorySnapshot();
    hasUploadedImage = false;
    uniforms.u_hasUploaded.value = 0;
    fallbackDirty = true;
    pendingPreview = true;
    bridge.notifyValuesChanged();
  }
});

window.addEventListener("beforeunload", () => sendPreview());

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() * 0.001;
  const dt = Math.min(0.08, now - lastTs);
  lastTs = now;
  if (!paused) elapsed += dt * clamp(params.speed, 0, 4);
  renderFrame();
  previewCooldown += dt;
  if (pendingPreview && previewCooldown > 0.42) {
    pendingPreview = false;
    previewCooldown = 0;
    sendPreview();
  }
}

renderFrame();
sendPreview();
animate();
