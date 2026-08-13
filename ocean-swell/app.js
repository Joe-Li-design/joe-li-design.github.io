import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "ocean-swell";
})();

// ---------------------------------------------------------------------------
// Control schema
// ---------------------------------------------------------------------------
const controlSchema = [
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 2, step: 0.01, default: 0.5 },
  { id: "waveAmount", label: "Wave Height", group: "Global", min: 0, max: 1.3, step: 0.01, default: 0.5 },
  { id: "waveFrequency", label: "Wave Frequency", group: "Global", min: 0.4, max: 6, step: 0.02, default: 1.6 },
  { id: "hueBase", label: "Water Hue", group: "Color", min: 0, max: 360, step: 1, default: 195 },
  { id: "hueRange", label: "Hue Range", group: "Color", min: 0, max: 360, step: 1, default: 55 },
  { id: "saturation", label: "Saturation", group: "Color", min: 0, max: 1.4, step: 0.01, default: 0.65 },
  { id: "lightness", label: "Lightness", group: "Color", min: 0.05, max: 0.85, step: 0.01, default: 0.36 },
  { id: "colorScale", label: "Pattern Scale", group: "Color", min: 0.2, max: 3, step: 0.01, default: 0.5 },
  { id: "colorSpeed", label: "Current Flow Speed", group: "Color", min: 0, max: 2, step: 0.01, default: 0.4 },
  { id: "warpStrength", label: "Warp Strength", group: "Color", min: 0, max: 1.6, step: 0.01, default: 0.55 },
  { id: "detail", label: "Detail", group: "Color", min: 0, max: 1, step: 0.01, default: 0.35 },
  {
    id: "foamAmount", label: "Foam Amount", group: "Effect", min: 0, max: 1, step: 0.01, default: 0.55,
    hint: "How much whitecap foam appears on wave crests and steep faces",
  },
  { id: "foamScale", label: "Foam Detail", group: "Effect", min: 2, max: 60, step: 0.5, default: 22 },
  { id: "glitterIntensity", label: "Sun Glitter", group: "Effect", min: 0, max: 3, step: 0.01, default: 1.1 },
  { id: "glitterSharp", label: "Glitter Sharpness", group: "Effect", min: 4, max: 140, step: 1, default: 60 },
  { id: "roughness", label: "Surface Roughness", group: "Effect", min: 0, max: 1, step: 0.01, default: 0.35 },
  { id: "rimGlow", label: "Fresnel Reflection", group: "Effect", min: 0, max: 2, step: 0.01, default: 0.5 },
  { id: "sunHue", label: "Sun / Sky Hue", group: "Effect", min: 0, max: 360, step: 1, default: 45 },
  {
    id: "sunTint", label: "Sun Tint", group: "Effect", min: 0, max: 1, step: 0.01, default: 0.5,
    hint: "How much the glitter/reflection shifts toward Sun Hue instead of staying pure white",
  },
  {
    id: "blendMode", label: "Glitter Blend", group: "Effect", min: 0, max: 2, step: 1, default: 1,
    type: "select",
    options: [
      { value: 0, label: "Add (Bright)" },
      { value: 1, label: "Screen (Soft)" },
      { value: 2, label: "Overlay (Contrast)" },
    ],
  },
];
const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

const app = document.getElementById("app");

let paused = false;
let seed = Math.random() * 1000;
let pendingPreview = true;
let previewCooldown = 0;
let runTime = 0;

function syncExtras() {
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
}
const history = { undoStack: [], redoStack: [], limit: 140, suppress: false };

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#030811");
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 2.4, 9.2);
const controls3d = new OrbitControls(camera, renderer.domElement);
controls3d.enableDamping = true;
controls3d.dampingFactor = 0.08;
controls3d.minDistance = 3;
controls3d.maxDistance = 26;
controls3d.target.set(0, 0, 0);
// Blender-style bindings: middle-drag orbits, scroll zooms, shift+middle pans.
controls3d.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };

// ---------------------------------------------------------------------------
// Geometry: a large, densely subdivided plane so the vertex-shader wave/swell
// displacement and per-vertex analytic normals read as a real ocean surface
// rather than a flat card.
// ---------------------------------------------------------------------------
const geometry = new THREE.PlaneGeometry(8.6, 8.6, 220, 220);

const uniforms = {
  uTime: { value: 0 },
  uCameraPos: { value: camera.position.clone() },
  uSeed: { value: seed },
  uWaveAmount: { value: params.waveAmount },
  uWaveFrequency: { value: params.waveFrequency },
  uHueBase: { value: params.hueBase },
  uHueRange: { value: params.hueRange },
  uSaturation: { value: params.saturation },
  uLightness: { value: params.lightness },
  uColorScale: { value: params.colorScale },
  uColorSpeed: { value: params.colorSpeed },
  uWarpStrength: { value: params.warpStrength },
  uDetail: { value: params.detail },
  uFoamAmount: { value: params.foamAmount },
  uFoamScale: { value: params.foamScale },
  uGlitterIntensity: { value: params.glitterIntensity },
  uGlitterSharp: { value: params.glitterSharp },
  uRoughness: { value: params.roughness },
  uRimGlow: { value: params.rimGlow },
  uSunHue: { value: params.sunHue },
  uSunTint: { value: params.sunTint },
  uBlendMode: { value: params.blendMode },
};

const NOISE_GLSL = `
  // Ashima Arts / Stefan Gustavson classic 3D simplex noise (MIT licensed,
  // free for commercial use). Reused verbatim across many open shader demos.
  vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
  float fbm(vec3 p){
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
      sum += snoise(p * freq) * amp;
      freq *= 2.02;
      amp *= 0.52;
    }
    return sum * 0.5 + 0.5;
  }
`;

const HSL_GLSL = `
  vec3 hsl2rgb(vec3 hsl){
    float h = fract(hsl.x);
    float s = clamp(hsl.y, 0.0, 1.0);
    float l = clamp(hsl.z, 0.0, 1.0);
    float c = (1.0 - abs(2.0*l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h*6.0, 2.0) - 1.0));
    float m = l - c*0.5;
    vec3 rgb;
    if (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else rgb = vec3(c, 0.0, x);
    return rgb + m;
  }
`;

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vTangentW;
  varying vec3 vBitangentW;
  varying float vHeight;
  varying float vSlope;

  uniform float uTime;
  uniform float uSeed;
  uniform float uWaveAmount;
  uniform float uWaveFrequency;

  // Sum of a few travelling sine waves at different angles/frequencies —
  // an analytic ocean swell + chop field. Because it is analytic we can
  // differentiate it exactly for the surface normal/tangent instead of
  // resorting to a finite-difference normal recompute.
  float waveHeight(vec2 p, out vec2 grad) {
    float h = 0.0;
    vec2 g = vec2(0.0);
    vec2 dir1 = normalize(vec2(1.0, 0.32));
    float k1 = uWaveFrequency;
    float ph1 = dot(p, dir1) * k1 + uTime * 0.55 + uSeed * 0.02;
    h += sin(ph1) * 0.5;
    g += dir1 * k1 * cos(ph1) * 0.5;

    vec2 dir2 = normalize(vec2(-0.55, 1.0));
    float k2 = uWaveFrequency * 0.62;
    float ph2 = dot(p, dir2) * k2 - uTime * 0.38 + uSeed * 0.05 + 1.7;
    h += sin(ph2) * 0.32;
    g += dir2 * k2 * cos(ph2) * 0.32;

    vec2 dir3 = normalize(vec2(0.18, -1.0));
    float k3 = uWaveFrequency * 1.85;
    float ph3 = dot(p, dir3) * k3 + uTime * 0.9 + uSeed * 0.11 + 4.1;
    h += sin(ph3) * 0.16;
    g += dir3 * k3 * cos(ph3) * 0.16;

    grad = g;
    return h;
  }

  void main() {
    vUv = uv;
    vec2 p = position.xy;
    vec2 grad;
    float h = waveHeight(p, grad) * uWaveAmount;
    grad *= uWaveAmount;

    vec3 displaced = position + vec3(0.0, 0.0, h);
    vec3 T = normalize(vec3(1.0, 0.0, grad.x));
    vec3 B = normalize(vec3(0.0, 1.0, grad.y));
    vec3 N = normalize(cross(T, B));

    vNormalW = normalize(normalMatrix * N);
    vTangentW = normalize((modelMatrix * vec4(T, 0.0)).xyz);
    vBitangentW = normalize((modelMatrix * vec4(B, 0.0)).xyz);
    vHeight = h;
    vSlope = length(grad);

    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vTangentW;
  varying vec3 vBitangentW;
  varying float vHeight;
  varying float vSlope;

  uniform vec3 uCameraPos;
  uniform float uTime;
  uniform float uSeed;
  uniform float uHueBase;
  uniform float uHueRange;
  uniform float uSaturation;
  uniform float uLightness;
  uniform float uColorScale;
  uniform float uColorSpeed;
  uniform float uWarpStrength;
  uniform float uDetail;
  uniform float uFoamAmount;
  uniform float uFoamScale;
  uniform float uGlitterIntensity;
  uniform float uGlitterSharp;
  uniform float uRoughness;
  uniform float uRimGlow;
  uniform float uSunHue;
  uniform float uSunTint;
  uniform float uBlendMode;

  ${NOISE_GLSL}
  ${HSL_GLSL}

  // Classic per-channel overlay blend — used for the "Contrast" glitter
  // blend mode so the highlight both lightens and darkens depending on the
  // base tone, giving a punchier, more directional sun-glare look.
  vec3 blendOverlay(vec3 base, vec3 blend) {
    vec3 result;
    result.r = base.r < 0.5 ? (2.0 * base.r * blend.r) : (1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r));
    result.g = base.g < 0.5 ? (2.0 * base.g * blend.g) : (1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g));
    result.b = base.b < 0.5 ? (2.0 * base.b * blend.b) : (1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b));
    return result;
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 T = normalize(vTangentW);

    // --- Flowing current-band gradient (isotropic domain-warped fbm) ------
    // Deliberately NOT stretched along one axis — that reads as wood grain.
    // Kept soft and cloud-like instead, which for water looks like drifting
    // current bands / sunlit color variation across the surface.
    vec3 p = vWorldPos * uColorScale + vec3(uSeed * 0.37, uSeed * 0.19, 0.0);
    vec3 flow = vec3(uTime * uColorSpeed * 0.16, uTime * uColorSpeed * 0.09, uTime * uColorSpeed * 0.05);
    vec3 warp = vec3(
      fbm(p + flow + vec3(0.0, 0.0, 0.0)),
      fbm(p + flow + vec3(5.2, 1.3, 2.7)),
      fbm(p + flow + vec3(1.7, 9.2, 4.4))
    );
    vec3 pw = p + (warp - 0.5) * uWarpStrength * 1.1 + flow;
    float nColor = fbm(pw * 0.6);
    float fineColor = fbm(pw * 2.1 + 11.0 + uSeed);
    float n = mix(nColor, nColor * 0.6 + fineColor * 0.4, uDetail);

    float hue = fract(uHueBase / 360.0 + n * (uHueRange / 360.0));
    float light = clamp(uLightness + (n - 0.5) * 0.25 + vHeight * 0.05, 0.03, 0.9);
    vec3 base = hsl2rgb(vec3(hue, clamp(uSaturation, 0.0, 1.4), light));

    // --- Lighting: sun key light + soft sky fill ---------------------------
    vec3 L1 = normalize(vec3(0.45, 0.82, 0.55));
    vec3 L2 = normalize(vec3(-0.6, -0.15, 0.5));
    float diff = max(dot(N, L1), 0.0) * 0.72 + max(dot(N, L2), 0.0) * 0.28;
    vec3 ambient = base * 0.3;
    vec3 diffuseColor = ambient + base * diff * 0.9;

    // --- Whitecap foam -------------------------------------------------------
    // Foam follows the actual wave shape (crest height + slope steepness)
    // instead of an artificial noise axis, so it traces real wave contours
    // rather than a repeating texture.
    float crestFoam = smoothstep(0.12, 0.5, vHeight);
    float slopeFoam = smoothstep(0.22, 0.85, vSlope);
    float foamBase = clamp(crestFoam * 0.55 + slopeFoam * 0.85, 0.0, 1.0);
    float foamNoise = fbm(vWorldPos * uFoamScale * 0.12 + uSeed * 0.4 + flow * 0.6);
    foamNoise = smoothstep(0.42, 0.78, foamNoise);
    float foamMask = clamp(foamBase * mix(0.35, 1.0, foamNoise), 0.0, 1.0) * uFoamAmount;
    vec3 foamColor = mix(vec3(0.94, 0.97, 0.99), base * 1.4, 0.12);
    diffuseColor = mix(diffuseColor, foamColor, foamMask);

    // --- Sun glitter: anisotropic specular broken into sparkle points -------
    // Because T varies per-vertex with the interference of three travelling
    // waves, the highlight naturally scatters in many directions rather
    // than reading as one uniform streak/grain.
    float sharp = mix(uGlitterSharp, uGlitterSharp * 0.25, uRoughness);
    vec3 H1 = normalize(L1 + V);
    float TdotH1 = clamp(dot(T, H1), -1.0, 1.0);
    float aniso1 = pow(sqrt(max(0.0, 1.0 - TdotH1 * TdotH1)), sharp) * uGlitterIntensity;
    vec3 H2 = normalize(L2 + V);
    float TdotH2 = clamp(dot(T, H2), -1.0, 1.0);
    float aniso2 = pow(sqrt(max(0.0, 1.0 - TdotH2 * TdotH2)), sharp) * uGlitterIntensity * 0.4;
    float glitter = (aniso1 + aniso2) * mix(1.0, 0.5, uRoughness);

    // Sparkle threshold noise scatters the highlight into many small glints
    // — sunlight scintillating on ripples — instead of a smooth glaze.
    float sparkle = fbm(vWorldPos * uFoamScale * 1.6 + uSeed * 0.9 + flow * 1.4);
    sparkle = smoothstep(0.5, 0.86, sparkle);
    glitter *= mix(0.18, 1.0, sparkle);

    // --- Fresnel sky reflection ----------------------------------------------
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0) * uRimGlow;

    vec3 skyTint = mix(vec3(1.0), hsl2rgb(vec3(uSunHue / 360.0, 0.5, 0.82)), clamp(uSunTint, 0.0, 1.0));
    vec3 glitterRGB = skyTint * glitter;

    vec3 color;
    if (uBlendMode < 0.5) {
      // Add — classic bright glitter, simplest and most direct look.
      color = diffuseColor + glitterRGB;
    } else if (uBlendMode < 1.5) {
      // Screen — self-limiting so glints glow without blowing fully white,
      // softer and more believable as sun-on-water light.
      color = 1.0 - (1.0 - diffuseColor) * (1.0 - clamp(glitterRGB, 0.0, 1.0));
    } else {
      // Overlay — contrasty, both lightens and darkens depending on the
      // base tone underneath, closest to a harsh midday sun-glare look.
      color = blendOverlay(diffuseColor, clamp(glitterRGB + diffuseColor * 0.15, 0.0, 1.0));
    }

    color += base * fres * 0.55 + skyTint * fres * 0.55;

    // Soft filmic-ish roll-off so bright glitter/rim highlights glow instead
    // of clipping to flat white blotches.
    color = color / (1.0 + color * 0.65);
    color = pow(clamp(color, 0.0, 1.0), vec3(0.92));

    gl_FragColor = vec4(color, 1.0);
  }
`;

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  side: THREE.DoubleSide,
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

function renderDisplay() {
  controls3d.update();
  uniforms.uCameraPos.value.copy(camera.position);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Undo/redo + bridge wiring (mirrors the pattern used across the other
// control-bridge projects: instanced-mesh-swarm, curl-noise-flow-field, etc.)
// ---------------------------------------------------------------------------
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
function applyUniformsFromParams() {
  uniforms.uWaveAmount.value = params.waveAmount;
  uniforms.uWaveFrequency.value = params.waveFrequency;
  uniforms.uHueBase.value = params.hueBase;
  uniforms.uHueRange.value = params.hueRange;
  uniforms.uSaturation.value = params.saturation;
  uniforms.uLightness.value = params.lightness;
  uniforms.uColorScale.value = params.colorScale;
  uniforms.uColorSpeed.value = params.colorSpeed;
  uniforms.uWarpStrength.value = params.warpStrength;
  uniforms.uDetail.value = params.detail;
  uniforms.uFoamAmount.value = params.foamAmount;
  uniforms.uFoamScale.value = params.foamScale;
  uniforms.uGlitterIntensity.value = params.glitterIntensity;
  uniforms.uGlitterSharp.value = params.glitterSharp;
  uniforms.uRoughness.value = params.roughness;
  uniforms.uRimGlow.value = params.rimGlow;
  uniforms.uSunHue.value = params.sunHue;
  uniforms.uSunTint.value = params.sunTint;
  uniforms.uBlendMode.value = params.blendMode;
}
function applyParamsFromBridge(nextParams, recordHistory) {
  if (recordHistory) pushHistorySnapshot();
  Object.keys(nextParams).forEach((id) => {
    if (params[id] === undefined) return;
    const n = Number(nextParams[id]);
    if (Number.isFinite(n)) params[id] = n;
  });
  applyUniformsFromParams();
  pendingPreview = true;
}
function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") applyParamsFromBridge(state.params, false);
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) { seed = state.seed; uniforms.uSeed.value = seed; }
    if (typeof state.paused === "boolean") paused = state.paused;
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
  seed = Math.random() * 1000;
  uniforms.uSeed.value = seed;
  applyUniformsFromParams();
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}
function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.random() * 1000;
  uniforms.uSeed.value = seed;
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
  renderDisplay();
  const image = renderer.domElement.toDataURL("image/jpeg", 0.8);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
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
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed) && nextExtras.seed !== seed) {
      pushHistorySnapshot();
      seed = nextExtras.seed;
      uniforms.uSeed.value = seed;
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
if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) { seed = bridge.extras.seed; uniforms.uSeed.value = seed; }
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
applyUniformsFromParams();
// Restore camera position/orbit target from the last saved checkpoint (if
// any) so reloading — or re-opening a saved state via undo/redo/localStorage
// — reproduces the exact same framing instead of resetting to the default.
bridge.attachCamera(camera, controls3d);
history.suppress = false;

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  pendingPreview = true;
});
window.addEventListener("message", (event) => { if (event.data?.type === "shaderops/request-preview") sendPreview(); });
window.addEventListener("beforeunload", () => sendPreview());

// Shift + middle-mouse-drag pans instead of orbiting (Blender convention).
let middleShift = false;
renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button === 1 && event.shiftKey) {
    middleShift = true;
    controls3d.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
  }
}, { capture: true });
window.addEventListener("pointerup", () => {
  if (middleShift) {
    middleShift = false;
    controls3d.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
  }
});

window.dispatchEvent(new Event("resize"));

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (!paused) {
    runTime += delta * params.speed;
    uniforms.uTime.value = runTime;
  }
  renderDisplay();
  previewCooldown += delta;
  if (pendingPreview && previewCooldown > 0.45) { pendingPreview = false; previewCooldown = 0; sendPreview(); }
}
sendPreview();
animate();
