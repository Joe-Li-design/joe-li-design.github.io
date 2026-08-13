import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = new URLSearchParams(location.search).get("project") || "quad-luma-halftone-stack";

const PRESET = {
  speed: 0.35,
  maskSoftness: 0.05,
  blurRadius: 2.4,
  baseLuma: 0.48,
  layer1Density: 64,
  layer1Shape: 3,
  layer1IslandBox: 0,
  layer1IslandThreshold: 0.76,
  layer2Density: 84,
  layer2Shape: 0,
  layer2IslandBox: 0,
  layer2IslandThreshold: 0.78,
  layer3Density: 132,
  layer3Shape: 2,
  layer3IslandBox: 0,
  layer3IslandThreshold: 0.8,
  layer4Density: 196,
  layer4Shape: 1,
  layer4IslandBox: 0,
  layer4IslandThreshold: 0.82,
  noiseScale: 1.18,
  gradientTilt: 0.58,
};

const SHAPE_OPTIONS = [
  { label: "Circle", value: 0 },
  { label: "Cross", value: 1 },
  { label: "Line", value: 2 },
  { label: "Square", value: 3 },
];

const schema = [
  { id: "speed", label: "Speed", group: "Global", min: 0.0, max: 2.0, step: 0.01, default: PRESET.speed },
  { id: "maskSoftness", label: "Mask Soft", group: "Luma Bands", min: 0.005, max: 0.2, step: 0.001, default: PRESET.maskSoftness, hint: "Soft transition width between 4 luma bands" },
  { id: "blurRadius", label: "Base Blur", group: "Layer 0", min: 0.0, max: 12.0, step: 0.1, default: PRESET.blurRadius },
  { id: "baseLuma", label: "Base Luma", group: "Layer 0", min: 0.05, max: 1.0, step: 0.01, default: PRESET.baseLuma, hint: "Darken the blurred base layer" },

  { id: "layer1Density", label: "Layer1 Density", group: "Layer 1 Halftone", min: 12, max: 300, step: 1, default: PRESET.layer1Density },
  { id: "layer1Shape", label: "Layer1 Shape", group: "Layer 1 Halftone", type: "select", default: PRESET.layer1Shape, options: SHAPE_OPTIONS },
  { id: "layer1IslandBox", label: "Layer1 Island Mode", group: "Layer 1 Halftone", type: "toggle", min: 0, max: 1, step: 1, default: PRESET.layer1IslandBox, hint: "ON: island bounding-box mask, OFF: band mask" },
  { id: "layer1IslandThreshold", label: "Layer1 Island Th", group: "Layer 1 Halftone", min: 0.2, max: 0.98, step: 0.01, default: PRESET.layer1IslandThreshold, showIf: "layer1IslandBox", hint: "If island box is too large, fallback to band mask" },

  { id: "layer2Density", label: "Layer2 Density", group: "Layer 2 Halftone", min: 16, max: 320, step: 1, default: PRESET.layer2Density },
  { id: "layer2Shape", label: "Layer2 Shape", group: "Layer 2 Halftone", type: "select", default: PRESET.layer2Shape, options: SHAPE_OPTIONS },
  { id: "layer2IslandBox", label: "Layer2 Island Mode", group: "Layer 2 Halftone", type: "toggle", min: 0, max: 1, step: 1, default: PRESET.layer2IslandBox, hint: "ON: island bounding-box mask, OFF: band mask" },
  { id: "layer2IslandThreshold", label: "Layer2 Island Th", group: "Layer 2 Halftone", min: 0.2, max: 0.98, step: 0.01, default: PRESET.layer2IslandThreshold, showIf: "layer2IslandBox", hint: "If island box is too large, fallback to band mask" },

  { id: "layer3Density", label: "Layer3 Density", group: "Layer 3 Halftone", min: 16, max: 420, step: 1, default: PRESET.layer3Density },
  { id: "layer3Shape", label: "Layer3 Shape", group: "Layer 3 Halftone", type: "select", default: PRESET.layer3Shape, options: SHAPE_OPTIONS },
  { id: "layer3IslandBox", label: "Layer3 Island Mode", group: "Layer 3 Halftone", type: "toggle", min: 0, max: 1, step: 1, default: PRESET.layer3IslandBox, hint: "ON: island bounding-box mask, OFF: band mask" },
  { id: "layer3IslandThreshold", label: "Layer3 Island Th", group: "Layer 3 Halftone", min: 0.2, max: 0.98, step: 0.01, default: PRESET.layer3IslandThreshold, showIf: "layer3IslandBox", hint: "If island box is too large, fallback to band mask" },

  { id: "layer4Density", label: "Layer4 Density", group: "Layer 4 Halftone", min: 20, max: 560, step: 1, default: PRESET.layer4Density },
  { id: "layer4Shape", label: "Layer4 Shape", group: "Layer 4 Halftone", type: "select", default: PRESET.layer4Shape, options: SHAPE_OPTIONS },
  { id: "layer4IslandBox", label: "Layer4 Island Mode", group: "Layer 4 Halftone", type: "toggle", min: 0, max: 1, step: 1, default: PRESET.layer4IslandBox, hint: "ON: island bounding-box mask, OFF: band mask" },
  { id: "layer4IslandThreshold", label: "Layer4 Island Th", group: "Layer 4 Halftone", min: 0.2, max: 0.98, step: 0.01, default: PRESET.layer4IslandThreshold, showIf: "layer4IslandBox", hint: "If island box is too large, fallback to band mask" },

  { id: "noiseScale", label: "Noise Scale", group: "Input", min: 0.25, max: 2.5, step: 0.01, default: PRESET.noiseScale },
  { id: "gradientTilt", label: "Grad Tilt", group: "Input", min: 0.0, max: 1.0, step: 0.01, default: PRESET.gradientTilt },
  { id: "imageLoader", label: "Image", group: "Input", type: "image-loader" },
];

const params = {};
schema.forEach((cfg) => {
  if (cfg.type === "image-loader") return;
  params[cfg.id] = cfg.default;
});

let seed = 843721;
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
  u_maskSoftness: { value: params.maskSoftness },
  u_lumaMin: { value: 0.0 },
  u_lumaMax: { value: 1.0 },
  u_blurRadius: { value: params.blurRadius },
  u_baseLuma: { value: params.baseLuma },
  u_layer1Density: { value: params.layer1Density },
  u_layer1Shape: { value: params.layer1Shape },
  u_layer1IslandBox: { value: params.layer1IslandBox },
  u_layer1IslandThreshold: { value: params.layer1IslandThreshold },
  u_layer2Density: { value: params.layer2Density },
  u_layer2Shape: { value: params.layer2Shape },
  u_layer2IslandBox: { value: params.layer2IslandBox },
  u_layer2IslandThreshold: { value: params.layer2IslandThreshold },
  u_layer3Density: { value: params.layer3Density },
  u_layer3Shape: { value: params.layer3Shape },
  u_layer3IslandBox: { value: params.layer3IslandBox },
  u_layer3IslandThreshold: { value: params.layer3IslandThreshold },
  u_layer4Density: { value: params.layer4Density },
  u_layer4Shape: { value: params.layer4Shape },
  u_layer4IslandBox: { value: params.layer4IslandBox },
  u_layer4IslandThreshold: { value: params.layer4IslandThreshold },
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
    uniform float u_maskSoftness;
    uniform float u_lumaMin;
    uniform float u_lumaMax;
    uniform float u_blurRadius;
    uniform float u_baseLuma;
    uniform float u_layer1Density;
    uniform float u_layer1Shape;
    uniform float u_layer1IslandBox;
    uniform float u_layer1IslandThreshold;
    uniform float u_layer2Density;
    uniform float u_layer2Shape;
    uniform float u_layer2IslandBox;
    uniform float u_layer2IslandThreshold;
    uniform float u_layer3Density;
    uniform float u_layer3Shape;
    uniform float u_layer3IslandBox;
    uniform float u_layer3IslandThreshold;
    uniform float u_layer4Density;
    uniform float u_layer4Shape;
    uniform float u_layer4IslandBox;
    uniform float u_layer4IslandThreshold;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float luma(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    vec2 sourceUv(vec2 uv, vec2 drift) {
      vec2 base = uv + drift;
      float sx = max(1e-5, u_sourceAspect / max(1e-5, u_viewAspect));
      vec2 su = vec2((base.x - 0.5) / sx + 0.5, base.y);
      if (su.x < 0.0 || su.x > 1.0 || su.y < 0.0 || su.y > 1.0) return vec2(-1.0, -1.0);
      su.y = mix(su.y, 1.0 - su.y, step(0.5, u_hasUploaded));
      return su;
    }

    vec3 sampleSource(vec2 uv, vec2 drift) {
      vec2 su = sourceUv(uv, drift);
      if (su.x < 0.0) return vec3(0.0);
      return texture2D(u_sourceTex, su).rgb;
    }

    vec3 sampleBlur25(vec2 uv, vec2 drift, float radiusPx) {
      vec2 texel = vec2(1.0) / max(u_resolution, vec2(1.0));
      vec2 r = texel * radiusPx;
      vec3 c = vec3(0.0);
      c += sampleSource(uv + vec2(-2.0 * r.x, -2.0 * r.y), drift) * 1.0;
      c += sampleSource(uv + vec2(-1.0 * r.x, -2.0 * r.y), drift) * 4.0;
      c += sampleSource(uv + vec2( 0.0,       -2.0 * r.y), drift) * 6.0;
      c += sampleSource(uv + vec2( 1.0 * r.x, -2.0 * r.y), drift) * 4.0;
      c += sampleSource(uv + vec2( 2.0 * r.x, -2.0 * r.y), drift) * 1.0;

      c += sampleSource(uv + vec2(-2.0 * r.x, -1.0 * r.y), drift) * 4.0;
      c += sampleSource(uv + vec2(-1.0 * r.x, -1.0 * r.y), drift) * 16.0;
      c += sampleSource(uv + vec2( 0.0,       -1.0 * r.y), drift) * 24.0;
      c += sampleSource(uv + vec2( 1.0 * r.x, -1.0 * r.y), drift) * 16.0;
      c += sampleSource(uv + vec2( 2.0 * r.x, -1.0 * r.y), drift) * 4.0;

      c += sampleSource(uv + vec2(-2.0 * r.x, 0.0), drift) * 6.0;
      c += sampleSource(uv + vec2(-1.0 * r.x, 0.0), drift) * 24.0;
      c += sampleSource(uv + vec2( 0.0,       0.0), drift) * 36.0;
      c += sampleSource(uv + vec2( 1.0 * r.x, 0.0), drift) * 24.0;
      c += sampleSource(uv + vec2( 2.0 * r.x, 0.0), drift) * 6.0;

      c += sampleSource(uv + vec2(-2.0 * r.x, 1.0 * r.y), drift) * 4.0;
      c += sampleSource(uv + vec2(-1.0 * r.x, 1.0 * r.y), drift) * 16.0;
      c += sampleSource(uv + vec2( 0.0,       1.0 * r.y), drift) * 24.0;
      c += sampleSource(uv + vec2( 1.0 * r.x, 1.0 * r.y), drift) * 16.0;
      c += sampleSource(uv + vec2( 2.0 * r.x, 1.0 * r.y), drift) * 4.0;

      c += sampleSource(uv + vec2(-2.0 * r.x, 2.0 * r.y), drift) * 1.0;
      c += sampleSource(uv + vec2(-1.0 * r.x, 2.0 * r.y), drift) * 4.0;
      c += sampleSource(uv + vec2( 0.0,       2.0 * r.y), drift) * 6.0;
      c += sampleSource(uv + vec2( 1.0 * r.x, 2.0 * r.y), drift) * 4.0;
      c += sampleSource(uv + vec2( 2.0 * r.x, 2.0 * r.y), drift) * 1.0;

      return c / 256.0;
    }

    vec4 lumaBands(float lum, float soft) {
      float range = max(0.0001, u_lumaMax - u_lumaMin);
      float nLum = clamp((lum - u_lumaMin) / range, 0.0, 1.0);
      float s = max(0.001, soft);
      float e1 = smoothstep(0.25 - s, 0.25 + s, nLum);
      float e2 = smoothstep(0.50 - s, 0.50 + s, nLum);
      float e3 = smoothstep(0.75 - s, 0.75 + s, nLum);
      float m1 = 1.0 - e1;
      float m2 = e1 * (1.0 - e2);
      float m3 = e2 * (1.0 - e3);
      float m4 = e3;
      return vec4(m1, m2, m3, m4);
    }

    float sampleBandAt(vec2 uv, vec2 drift, float bandIndex) {
      float lum = luma(sampleSource(uv, drift));
      vec4 b = lumaBands(lum, u_maskSoftness);
      if (bandIndex < 1.5) return b.x;
      if (bandIndex < 2.5) return b.y;
      if (bandIndex < 3.5) return b.z;
      return b.w;
    }

    vec2 rot(vec2 p, float a) {
      float c = cos(a);
      float s = sin(a);
      return mat2(c, -s, s, c) * p;
    }

    float shapeMask(vec2 local, float shapeId) {
      float sid = floor(shapeId + 0.5);
      float soft = 0.06;
      if (sid < 0.5) {
        float r = length(local);
        return 1.0 - smoothstep(0.18, 0.18 + soft, r);
      }
      if (sid < 1.5) {
        float w = 0.07;
        float lineA = 1.0 - smoothstep(w, w + soft, abs(local.x));
        float lineB = 1.0 - smoothstep(w, w + soft, abs(local.y));
        return clamp(max(lineA, lineB), 0.0, 1.0);
      }
      if (sid < 2.5) {
        float w = 0.08;
        return 1.0 - smoothstep(w, w + soft, abs(local.y));
      }
      float sq = max(abs(local.x), abs(local.y));
      return 1.0 - smoothstep(0.17, 0.17 + soft, sq);
    }

    float islandBoxMask(vec2 uv, vec2 drift, float bandIndex, float bandMaskAtPixel, float threshold) {
      // Keep island box size stable across density changes: density controls
      // only halftone shape sampling, not island mask scale.
      float grid = 28.0;
      vec2 gid = floor(uv * grid);
      vec2 cUv = (gid + vec2(0.5)) / grid;
      float centerBand = sampleBandAt(cUv, drift, bandIndex);
      if (centerBand < 0.5) return 0.0;

      float occ = 0.0;
      for (int oy = -2; oy <= 2; oy++) {
        for (int ox = -2; ox <= 2; ox++) {
          vec2 nuv = (gid + vec2(float(ox), float(oy)) + vec2(0.5)) / grid;
          occ += step(0.5, sampleBandAt(nuv, drift, bandIndex));
        }
      }
      occ /= 25.0;
      float th = clamp(threshold, 0.2, 0.98);
      if (occ > th) return bandMaskAtPixel;
      return 1.0;
    }

    vec3 halftoneAdd(
      vec3 under,
      vec2 uv,
      vec2 drift,
      float density,
      float shapeId,
      float bandMask,
      float bandIndex,
      float useIslandBox,
      float islandThreshold,
      float angle
    ) {
      float dens = max(4.0, density);
      vec2 gv = uv * dens;
      vec2 cell = floor(gv);
      vec2 local = fract(gv) - 0.5;
      local = rot(local, angle);

      vec2 cellCenterUv = (cell + vec2(0.5)) / dens;
      vec3 sampleCol = sampleSource(cellCenterUv, drift);
      float gate = shapeMask(local, shapeId);
      float layerMask = bandMask;
      if (useIslandBox > 0.5) {
        layerMask = islandBoxMask(uv, drift, bandIndex, bandMask, islandThreshold);
      }
      float alpha = gate * layerMask;

      vec3 outCol = under;
      outCol += sampleCol * alpha * 0.86;
      return clamp(outCol, 0.0, 1.0);
    }

    void main() {
      vec2 uv = vUv;
      vec2 drift = vec2(sin(u_time * 0.13), cos(u_time * 0.11)) * 0.009 * u_speed * (1.0 - u_hasUploaded);
      vec2 mainSu = sourceUv(uv, drift);
      if (mainSu.x < 0.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      vec3 src = sampleSource(uv, drift);
      float lum = luma(src);
      vec4 bands = lumaBands(lum, u_maskSoftness);

      vec3 baseBlur = sampleBlur25(uv, drift, max(0.0, u_blurRadius));
      vec3 layer0 = baseBlur * clamp(u_baseLuma, 0.0, 1.0);

      vec3 col = layer0;
      col = halftoneAdd(col, uv, drift, u_layer1Density, u_layer1Shape, bands.x, 1.0, u_layer1IslandBox, u_layer1IslandThreshold, radians(-7.0));
      col = halftoneAdd(col, uv, drift, u_layer2Density, u_layer2Shape, bands.y, 2.0, u_layer2IslandBox, u_layer2IslandThreshold, radians(12.0));
      col = halftoneAdd(col, uv, drift, u_layer3Density, u_layer3Shape, bands.z, 3.0, u_layer3IslandBox, u_layer3IslandThreshold, radians(-26.0));
      col = halftoneAdd(col, uv, drift, u_layer4Density, u_layer4Shape, bands.w, 4.0, u_layer4IslandBox, u_layer4IslandThreshold, radians(41.0));

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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

function deriveLumaRangeFromImageData(imageData) {
  const data = imageData.data instanceof Uint8Array ? imageData.data : new Uint8Array(imageData.data);
  let minL = 1;
  let maxL = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }
  if (!Number.isFinite(minL) || !Number.isFinite(maxL)) return { min: 0, max: 1 };
  if (maxL - minL < 0.02) {
    const c = (minL + maxL) * 0.5;
    return { min: clamp(c - 0.1, 0, 1), max: clamp(c + 0.1, 0, 1) };
  }
  return { min: minL, max: maxL };
}

function setLumaRange(range) {
  uniforms.u_lumaMin.value = clamp(range.min, 0, 1);
  uniforms.u_lumaMax.value = clamp(range.max, uniforms.u_lumaMin.value + 0.0001, 1);
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
  setLumaRange(deriveLumaRangeFromImageData(fallbackImage));
  setSourceTexture(createTextureFromImageData(fallbackImage), false, fallbackImage.width / Math.max(1, fallbackImage.height));
  fallbackDirty = false;
}

function applyParamsToUniforms() {
  params.speed = safe(params.speed, PRESET.speed, -4, 8);
  params.maskSoftness = safe(params.maskSoftness, PRESET.maskSoftness, -1000, 1000);
  params.blurRadius = safe(params.blurRadius, PRESET.blurRadius, -1000, 10000);
  params.baseLuma = safe(params.baseLuma, PRESET.baseLuma, -1000, 1000);
  params.layer1Density = safe(params.layer1Density, PRESET.layer1Density, -1000, 10000);
  params.layer1Shape = safe(params.layer1Shape, PRESET.layer1Shape, -10, 10);
  params.layer1IslandBox = safe(params.layer1IslandBox, PRESET.layer1IslandBox, -10, 10);
  params.layer1IslandThreshold = safe(params.layer1IslandThreshold, PRESET.layer1IslandThreshold, -1000, 1000);
  params.layer2Density = safe(params.layer2Density, PRESET.layer2Density, -1000, 10000);
  params.layer2Shape = safe(params.layer2Shape, PRESET.layer2Shape, -10, 10);
  params.layer2IslandBox = safe(params.layer2IslandBox, PRESET.layer2IslandBox, -10, 10);
  params.layer2IslandThreshold = safe(params.layer2IslandThreshold, PRESET.layer2IslandThreshold, -1000, 1000);
  params.layer3Density = safe(params.layer3Density, PRESET.layer3Density, -1000, 10000);
  params.layer3Shape = safe(params.layer3Shape, PRESET.layer3Shape, -10, 10);
  params.layer3IslandBox = safe(params.layer3IslandBox, PRESET.layer3IslandBox, -10, 10);
  params.layer3IslandThreshold = safe(params.layer3IslandThreshold, PRESET.layer3IslandThreshold, -1000, 1000);
  params.layer4Density = safe(params.layer4Density, PRESET.layer4Density, -1000, 10000);
  params.layer4Shape = safe(params.layer4Shape, PRESET.layer4Shape, -10, 10);
  params.layer4IslandBox = safe(params.layer4IslandBox, PRESET.layer4IslandBox, -10, 10);
  params.layer4IslandThreshold = safe(params.layer4IslandThreshold, PRESET.layer4IslandThreshold, -1000, 1000);
  params.noiseScale = safe(params.noiseScale, PRESET.noiseScale, -10, 10);
  params.gradientTilt = safe(params.gradientTilt, PRESET.gradientTilt, -4, 4);

  uniforms.u_speed.value = clamp(params.speed, 0.0, 4.0);
  uniforms.u_maskSoftness.value = clamp(params.maskSoftness, 0.001, 0.25);
  uniforms.u_blurRadius.value = clamp(params.blurRadius, 0.0, 20.0);
  uniforms.u_baseLuma.value = clamp(params.baseLuma, 0.0, 1.0);
  uniforms.u_layer1Density.value = clamp(params.layer1Density, 4.0, 800.0);
  uniforms.u_layer1Shape.value = clamp(params.layer1Shape, 0.0, 3.0);
  uniforms.u_layer1IslandBox.value = clamp(params.layer1IslandBox, 0.0, 1.0);
  uniforms.u_layer1IslandThreshold.value = clamp(params.layer1IslandThreshold, 0.2, 0.98);
  uniforms.u_layer2Density.value = clamp(params.layer2Density, 4.0, 800.0);
  uniforms.u_layer2Shape.value = clamp(params.layer2Shape, 0.0, 3.0);
  uniforms.u_layer2IslandBox.value = clamp(params.layer2IslandBox, 0.0, 1.0);
  uniforms.u_layer2IslandThreshold.value = clamp(params.layer2IslandThreshold, 0.2, 0.98);
  uniforms.u_layer3Density.value = clamp(params.layer3Density, 4.0, 800.0);
  uniforms.u_layer3Shape.value = clamp(params.layer3Shape, 0.0, 3.0);
  uniforms.u_layer3IslandBox.value = clamp(params.layer3IslandBox, 0.0, 1.0);
  uniforms.u_layer3IslandThreshold.value = clamp(params.layer3IslandThreshold, 0.2, 0.98);
  uniforms.u_layer4Density.value = clamp(params.layer4Density, 4.0, 800.0);
  uniforms.u_layer4Shape.value = clamp(params.layer4Shape, 0.0, 3.0);
  uniforms.u_layer4IslandBox.value = clamp(params.layer4IslandBox, 0.0, 1.0);
  uniforms.u_layer4IslandThreshold.value = clamp(params.layer4IslandThreshold, 0.2, 0.98);
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
    if (cfg.type === "select") {
      const options = Array.isArray(cfg.options) ? cfg.options : [];
      const opt = options[Math.floor(Math.random() * Math.max(1, options.length))];
      params[cfg.id] = opt ? opt.value : cfg.default;
      return;
    }
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
    setLumaRange(deriveLumaRangeFromImageData(msg.imageData));
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
