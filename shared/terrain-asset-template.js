import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const BASE_SCHEMA = [
  { id: "speed", label: "Flow Speed", group: "Global", min: 0, max: 2.2, step: 0.01, default: 0.6 },
  { id: "relief", label: "Relief Height", group: "Global", min: 0, max: 2.2, step: 0.01, default: 1.0 },
  { id: "macroScale", label: "Macro Scale", group: "Global", min: 0.15, max: 2.6, step: 0.01, default: 0.72 },
  { id: "detailScale", label: "Detail Scale", group: "Global", min: 0.5, max: 14, step: 0.05, default: 4.4 },
  { id: "ridgeSharpness", label: "Ridge Sharpness", group: "Global", min: 0.2, max: 5, step: 0.01, default: 2.0 },
  { id: "erosion", label: "Erosion", group: "Global", min: 0, max: 1, step: 0.01, default: 0.35 },

  { id: "hueShift", label: "Hue Shift", group: "Color", min: -180, max: 180, step: 1, default: 0 },
  { id: "saturation", label: "Saturation", group: "Color", min: 0, max: 1.6, step: 0.01, default: 1.0 },
  { id: "contrast", label: "Contrast", group: "Color", min: 0.5, max: 1.8, step: 0.01, default: 1.0 },
  { id: "ambient", label: "Ambient", group: "Color", min: 0.05, max: 1.2, step: 0.01, default: 0.34 },
  { id: "lightHue", label: "Light Hue", group: "Color", min: 0, max: 360, step: 1, default: 42 },
  { id: "lightTint", label: "Light Tint", group: "Color", min: 0, max: 1, step: 0.01, default: 0.45 },

  { id: "roughness", label: "Roughness", group: "Effect", min: 0.02, max: 1, step: 0.01, default: 0.38 },
  { id: "specular", label: "Specular", group: "Effect", min: 0, max: 2.5, step: 0.01, default: 1.08 },
  { id: "wetness", label: "Wetness", group: "Effect", min: 0, max: 1, step: 0.01, default: 0.26 },
  { id: "rim", label: "Rim Light", group: "Effect", min: 0, max: 1.8, step: 0.01, default: 0.35 },
  { id: "fog", label: "Aerial Fog", group: "Effect", min: 0, max: 1.2, step: 0.01, default: 0.25 },
  { id: "emissive", label: "Emissive", group: "Effect", min: 0, max: 2.5, step: 0.01, default: 0.0 },
];

export const TERRAIN_PRESETS = {
  lava: {
    title: "Lava Plate Forge",
    defaults: {
      speed: 0.85,
      relief: 1.2,
      macroScale: 0.72,
      detailScale: 5.4,
      ridgeSharpness: 2.6,
      erosion: 0.18,
      hueShift: 0,
      saturation: 1.2,
      contrast: 1.26,
      ambient: 0.25,
      lightHue: 28,
      lightTint: 0.7,
      roughness: 0.28,
      specular: 1.34,
      wetness: 0.5,
      rim: 0.6,
      fog: 0.16,
      emissive: 1.75,
    },
    shapeWeights: [0.65, 1.55, 0.92, 0.66],
    colorA: "#0f0f13",
    colorB: "#2c2b2a",
    colorC: "#8f2a12",
    colorD: "#ff9b2c",
    fogColor: "#1e0f0c",
    background: "#050405",
  },
  grass: {
    title: "Grassland Crown",
    defaults: {
      speed: 0.34,
      relief: 0.95,
      macroScale: 0.55,
      detailScale: 3.7,
      ridgeSharpness: 1.7,
      erosion: 0.44,
      hueShift: 0,
      saturation: 0.96,
      contrast: 1.08,
      ambient: 0.37,
      lightHue: 64,
      lightTint: 0.42,
      roughness: 0.51,
      specular: 0.7,
      wetness: 0.22,
      rim: 0.33,
      fog: 0.26,
      emissive: 0.0,
    },
    shapeWeights: [1.05, 0.82, 0.52, 0.43],
    colorA: "#1c3520",
    colorB: "#4d7540",
    colorC: "#8a9f52",
    colorD: "#c5bc78",
    fogColor: "#243323",
    background: "#0b1410",
  },
  glacier: {
    title: "Glacier Shelf",
    defaults: {
      speed: 0.28,
      relief: 1.08,
      macroScale: 0.62,
      detailScale: 4.2,
      ridgeSharpness: 3.2,
      erosion: 0.2,
      hueShift: 0,
      saturation: 0.8,
      contrast: 1.18,
      ambient: 0.3,
      lightHue: 203,
      lightTint: 0.62,
      roughness: 0.31,
      specular: 1.2,
      wetness: 0.46,
      rim: 0.65,
      fog: 0.48,
      emissive: 0.08,
    },
    shapeWeights: [0.9, 1.35, 0.86, 0.72],
    colorA: "#1a2a35",
    colorB: "#4f8591",
    colorC: "#9ed1db",
    colorD: "#e7f6ff",
    fogColor: "#1c2d35",
    background: "#050b12",
  },
  mountain: {
    title: "Mountain Bastion",
    defaults: {
      speed: 0.18,
      relief: 1.42,
      macroScale: 0.8,
      detailScale: 5.8,
      ridgeSharpness: 3.4,
      erosion: 0.38,
      hueShift: 0,
      saturation: 0.7,
      contrast: 1.22,
      ambient: 0.29,
      lightHue: 36,
      lightTint: 0.36,
      roughness: 0.62,
      specular: 0.52,
      wetness: 0.12,
      rim: 0.29,
      fog: 0.36,
      emissive: 0.0,
    },
    shapeWeights: [0.86, 1.85, 0.44, 0.25],
    colorA: "#1f2328",
    colorB: "#4e565f",
    colorC: "#8b8574",
    colorD: "#d7d0b7",
    fogColor: "#1f2021",
    background: "#09090a",
  },
  ocean: {
    title: "Ocean Shelf",
    defaults: {
      speed: 0.74,
      relief: 0.8,
      macroScale: 0.48,
      detailScale: 3.2,
      ridgeSharpness: 1.26,
      erosion: 0.22,
      hueShift: 0,
      saturation: 1.02,
      contrast: 1.12,
      ambient: 0.26,
      lightHue: 43,
      lightTint: 0.54,
      roughness: 0.2,
      specular: 1.8,
      wetness: 0.84,
      rim: 0.85,
      fog: 0.31,
      emissive: 0.04,
    },
    shapeWeights: [0.92, 0.58, 0.78, 0.65],
    colorA: "#102b3d",
    colorB: "#1d5d7b",
    colorC: "#6aa8ba",
    colorD: "#c9e7f0",
    fogColor: "#0e2232",
    background: "#040912",
  },
  stone: {
    title: "Stonefield Crust",
    defaults: {
      speed: 0.26,
      relief: 1.1,
      macroScale: 0.74,
      detailScale: 6.1,
      ridgeSharpness: 2.5,
      erosion: 0.52,
      hueShift: 0,
      saturation: 0.56,
      contrast: 1.16,
      ambient: 0.31,
      lightHue: 38,
      lightTint: 0.28,
      roughness: 0.76,
      specular: 0.42,
      wetness: 0.08,
      rim: 0.22,
      fog: 0.2,
      emissive: 0.0,
    },
    shapeWeights: [0.8, 1.1, 1.2, 0.46],
    colorA: "#232425",
    colorB: "#575556",
    colorC: "#8d7d70",
    colorD: "#bab2a0",
    fogColor: "#211f1d",
    background: "#0b0a09",
  },
};

function parseHexColor(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function makeControlSchema(defaults) {
  return BASE_SCHEMA.map((cfg) => ({ ...cfg, default: defaults[cfg.id] ?? cfg.default }));
}

const NOISE_GLSL = `
  vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v){
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
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
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  float fbm(vec3 p){
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
      sum += snoise(p * freq) * amp;
      freq *= 2.03;
      amp *= 0.52;
    }
    return sum;
  }
`;

const HSL_GLSL = `
  vec3 hsl2rgb(vec3 hsl){
    float h = fract(hsl.x);
    float s = clamp(hsl.y, 0.0, 1.0);
    float l = clamp(hsl.z, 0.0, 1.0);
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c * 0.5;
    vec3 rgb;
    if (h < 1.0 / 6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0 / 6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0 / 6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0 / 6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0 / 6.0) rgb = vec3(x, 0.0, c);
    else rgb = vec3(c, 0.0, x);
    return rgb + m;
  }
`;

const VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying float vHeight;
  varying float vTopMask;
  varying float vSlope;

  uniform float uTime;
  uniform float uSeed;
  uniform float uSpeed;
  uniform float uRelief;
  uniform float uMacroScale;
  uniform float uDetailScale;
  uniform float uRidgeSharpness;
  uniform float uErosion;
  uniform vec4 uShapeWeights;

  ${NOISE_GLSL}

  float ridged(vec3 p){
    float n = fbm(p);
    float r = 1.0 - abs(n);
    return pow(max(r, 0.0), max(uRidgeSharpness, 0.001));
  }

  float terrainField(vec2 p){
    vec2 driftA = vec2(0.15, -0.11) * uTime * uSpeed;
    vec2 driftB = vec2(-0.08, 0.17) * uTime * uSpeed;
    vec3 macroPos = vec3(p * uMacroScale + driftA, uSeed * 0.03);
    vec2 warp = vec2(
      fbm(vec3(macroPos.xy * 0.75 + 12.4, macroPos.z)),
      fbm(vec3(macroPos.xy * 0.75 - 8.9, macroPos.z + 5.1))
    );
    vec2 domain = p + (warp - 0.5) * (0.9 + uErosion * 1.2);
    float broad = fbm(vec3(domain * uMacroScale + driftA, uSeed * 0.02));
    float ridges = ridged(vec3(domain * (uMacroScale * 1.35) + driftB, uSeed * 0.05));
    float detail = fbm(vec3(domain * uDetailScale, uSeed * 0.09 + uTime * uSpeed * 0.15));
    float pits = ridged(vec3(domain * (uDetailScale * 0.52), uSeed * 0.14));
    return broad * uShapeWeights.x + ridges * uShapeWeights.y + detail * uShapeWeights.z - pits * uShapeWeights.w;
  }

  float terrainHeight(vec2 p){
    float h = terrainField(p);
    return h * uRelief;
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    float topMask = smoothstep(0.55, 0.95, normal.y);
    float h = terrainHeight(pos.xz);
    pos += normal * h * topMask;
    vec3 worldN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

    float e = 0.035;
    float hx = terrainHeight(pos.xz + vec2(e, 0.0));
    float hz = terrainHeight(pos.xz + vec2(0.0, e));
    vec3 topN = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
    vec3 topNW = normalize((modelMatrix * vec4(topN, 0.0)).xyz);
    vNormalW = normalize(mix(worldN, topNW, topMask));
    vSlope = 1.0 - clamp(vNormalW.y * 0.5 + 0.5, 0.0, 1.0);
    vHeight = h;
    vTopMask = topMask;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying float vHeight;
  varying float vTopMask;
  varying float vSlope;

  uniform vec3 uCameraPos;
  uniform float uTime;
  uniform float uSeed;
  uniform float uHueShift;
  uniform float uSaturation;
  uniform float uContrast;
  uniform float uAmbient;
  uniform float uRoughness;
  uniform float uSpecular;
  uniform float uWetness;
  uniform float uRim;
  uniform float uFog;
  uniform float uEmissive;
  uniform float uLightHue;
  uniform float uLightTint;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uColorD;
  uniform vec3 uFogColor;

  ${NOISE_GLSL}
  ${HSL_GLSL}

  vec3 applyContrast(vec3 color, float c) {
    return (color - 0.5) * c + 0.5;
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 L = normalize(vec3(0.32, 0.86, 0.26));
    vec3 H = normalize(V + L);

    float NdotL = max(dot(N, L), 0.0);
    float NdotV = max(dot(N, V), 0.0);
    float NdotH = max(dot(N, H), 0.0);
    float VdotH = max(dot(V, H), 0.0);

    float altitude = clamp(vHeight * 0.28 + 0.5, 0.0, 1.0);
    float ridges = smoothstep(0.34, 0.92, vSlope + fbm(vec3(vWorldPos.xz * 0.26, uSeed * 0.02)) * 0.3);
    float strata = fbm(vec3(vWorldPos.xz * 0.38 + vec2(0.0, uTime * 0.04), uSeed * 0.08)) * 0.5 + 0.5;
    float veins = fbm(vec3(vWorldPos.xz * 2.2, uSeed * 0.14)) * 0.5 + 0.5;

    vec3 albedo = mix(uColorA, uColorB, clamp(altitude * 0.85 + strata * 0.2, 0.0, 1.0));
    albedo = mix(albedo, uColorC, ridges);
    albedo = mix(albedo, uColorD, smoothstep(0.58, 1.0, veins + altitude * 0.24));
    albedo = mix(albedo, uColorA * 0.72, smoothstep(0.0, 0.3, 1.0 - vTopMask));

    float hue = radians(uHueShift) / (2.0 * 3.14159265);
    vec3 hslShift = hsl2rgb(vec3(fract(hue), 0.45, 0.5));
    albedo = mix(albedo, albedo * hslShift * 1.8, 0.14);
    albedo = pow(max(albedo, 0.0), vec3(1.0 / max(uSaturation, 0.001)));
    albedo = applyContrast(albedo, uContrast);

    float alpha = max(0.02, uRoughness * uRoughness);
    float alpha2 = alpha * alpha;
    float denom = NdotH * NdotH * (alpha2 - 1.0) + 1.0;
    float D = alpha2 / max(3.14159265 * denom * denom, 0.0001);
    float k = (alpha + 1.0) * (alpha + 1.0) / 8.0;
    float Gv = NdotV / max(NdotV * (1.0 - k) + k, 0.0001);
    float Gl = NdotL / max(NdotL * (1.0 - k) + k, 0.0001);
    vec3 F0 = mix(vec3(0.03), albedo, clamp(uWetness * 0.7, 0.0, 1.0));
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - VdotH, 5.0);
    vec3 spec = (D * Gv * Gl) * F * uSpecular;

    vec3 lightTint = hsl2rgb(vec3(fract(uLightHue / 360.0), 0.65, 0.58));
    vec3 lit = albedo * (uAmbient + NdotL * (1.0 - uAmbient) * mix(vec3(1.0), lightTint, uLightTint));
    vec3 color = lit + spec;

    float rim = pow(max(1.0 - NdotV, 0.0), 3.2) * (0.35 + vSlope * 0.65);
    color += rim * uRim * mix(vec3(1.0), lightTint, 0.55);

    float emissiveMask = smoothstep(0.42, 1.0, 1.0 - altitude + ridges * 0.22 + veins * 0.25);
    color += uColorD * emissiveMask * uEmissive * (0.4 + 0.6 * NdotL);

    float grain = fract(sin(dot(vUv * vec2(1823.2, 913.1), vec2(12.9898, 78.233))) * 43758.5453);
    color *= 0.985 + grain * 0.03;

    float fogDepth = smoothstep(5.0, 18.5, length(vWorldPos - uCameraPos));
    color = mix(color, uFogColor, fogDepth * uFog);
    color = max(color, vec3(0.0));
    gl_FragColor = vec4(color, 1.0);
  }
`;

function snapshotState(params, seed, paused) {
  return JSON.stringify({ params: { ...params }, seed, paused });
}

export function createTerrainAssetProject(options) {
  const preset = options.preset;
  const projectId = options.projectId;
  const controlSchema = makeControlSchema(preset.defaults || {});
  const params = {};
  controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

  const app = document.getElementById("app");

  let paused = false;
  let seed = Math.random() * 1000;
  let pendingPreview = true;
  let previewCooldown = 0;
  let runTime = 0;
  const history = { undoStack: [], redoStack: [], limit: 140, suppress: false };

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  app.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(preset.background || "#07090d");

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0.0, 3.2, 10.8);
  const controls3d = new OrbitControls(camera, renderer.domElement);
  controls3d.enableDamping = true;
  controls3d.dampingFactor = 0.08;
  controls3d.minDistance = 4.5;
  controls3d.maxDistance = 26;
  controls3d.target.set(0, 0.6, 0);
  controls3d.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.35);
  keyLight.position.set(2.8, 6.2, 3.5);
  scene.add(keyLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.08));

  const uniforms = {
    uTime: { value: 0 },
    uSeed: { value: seed },
    uCameraPos: { value: camera.position.clone() },
    uSpeed: { value: params.speed },
    uRelief: { value: params.relief },
    uMacroScale: { value: params.macroScale },
    uDetailScale: { value: params.detailScale },
    uRidgeSharpness: { value: params.ridgeSharpness },
    uErosion: { value: params.erosion },
    uHueShift: { value: params.hueShift },
    uSaturation: { value: params.saturation },
    uContrast: { value: params.contrast },
    uAmbient: { value: params.ambient },
    uRoughness: { value: params.roughness },
    uSpecular: { value: params.specular },
    uWetness: { value: params.wetness },
    uRim: { value: params.rim },
    uFog: { value: params.fog },
    uEmissive: { value: params.emissive },
    uLightHue: { value: params.lightHue },
    uLightTint: { value: params.lightTint },
    uShapeWeights: { value: new THREE.Vector4(...(preset.shapeWeights || [1, 1, 1, 0.5])) },
    uColorA: { value: new THREE.Color(...parseHexColor(preset.colorA || "#202428")) },
    uColorB: { value: new THREE.Color(...parseHexColor(preset.colorB || "#5f6b75")) },
    uColorC: { value: new THREE.Color(...parseHexColor(preset.colorC || "#8f8c7a")) },
    uColorD: { value: new THREE.Color(...parseHexColor(preset.colorD || "#ddd4b3")) },
    uFogColor: { value: new THREE.Color(...parseHexColor(preset.fogColor || "#222428")) },
  };

  const geometry = new THREE.BoxGeometry(9.2, 0.85, 9.2, 240, 10, 240);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
  const slab = new THREE.Mesh(geometry, material);
  slab.position.y = 0.02;
  scene.add(slab);

  const baseFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18, 1, 1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(preset.fogColor || "#161a20") }),
  );
  baseFloor.rotation.x = -Math.PI * 0.5;
  baseFloor.position.y = -0.45;
  scene.add(baseFloor);

  function syncExtras() {
    bridge.extras.seed = seed;
    bridge.extras.paused = paused;
  }

  function syncUniform(id) {
    const map = {
      speed: "uSpeed",
      relief: "uRelief",
      macroScale: "uMacroScale",
      detailScale: "uDetailScale",
      ridgeSharpness: "uRidgeSharpness",
      erosion: "uErosion",
      hueShift: "uHueShift",
      saturation: "uSaturation",
      contrast: "uContrast",
      ambient: "uAmbient",
      roughness: "uRoughness",
      specular: "uSpecular",
      wetness: "uWetness",
      rim: "uRim",
      fog: "uFog",
      emissive: "uEmissive",
      lightHue: "uLightHue",
      lightTint: "uLightTint",
    };
    const u = map[id];
    if (u) uniforms[u].value = params[id];
  }

  function applyUniformsFromParams() {
    controlSchema.forEach((cfg) => syncUniform(cfg.id));
  }

  function applyParamsFromBridge(nextParams, markPreview = true) {
    controlSchema.forEach((cfg) => {
      if (typeof nextParams[cfg.id] !== "number" || !Number.isFinite(nextParams[cfg.id])) return;
      params[cfg.id] = nextParams[cfg.id];
      syncUniform(cfg.id);
    });
    if (markPreview) pendingPreview = true;
  }

  function pushHistorySnapshot(snapshot) {
    if (history.suppress) return;
    const current = snapshot || snapshotState(params, seed, paused);
    if (history.undoStack[history.undoStack.length - 1] === current) return;
    history.undoStack.push(current);
    if (history.undoStack.length > history.limit) history.undoStack.shift();
    history.redoStack.length = 0;
  }

  function applySnapshot(serialized) {
    const snap = JSON.parse(serialized);
    history.suppress = true;
    applyParamsFromBridge(snap.params || {}, true);
    if (typeof snap.seed === "number" && Number.isFinite(snap.seed)) {
      seed = snap.seed;
      uniforms.uSeed.value = seed;
    }
    if (typeof snap.paused === "boolean") paused = snap.paused;
    syncExtras();
    bridge.persist();
    history.suppress = false;
    pendingPreview = true;
  }

  function undoHistory() {
    if (!history.undoStack.length) return;
    const current = snapshotState(params, seed, paused);
    const prev = history.undoStack.pop();
    history.redoStack.push(current);
    applySnapshot(prev);
  }

  function redoHistory() {
    if (!history.redoStack.length) return;
    const current = snapshotState(params, seed, paused);
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
      syncUniform(cfg.id);
    });
    seed = Math.random() * 1000;
    uniforms.uSeed.value = seed;
    syncExtras();
    bridge.notifyValuesChanged();
    pendingPreview = true;
  }

  function rerollSeed() {
    pushHistorySnapshot();
    seed = Math.random() * 1000;
    uniforms.uSeed.value = seed;
    syncExtras();
    bridge.notifyValuesChanged();
    pendingPreview = true;
  }

  function togglePause() {
    pushHistorySnapshot();
    paused = !paused;
    syncExtras();
    bridge.notifyValuesChanged();
  }

  function renderDisplay() {
    controls3d.update();
    uniforms.uCameraPos.value.copy(camera.position);
    renderer.render(scene, camera);
  }

  function sendPreview() {
    renderDisplay();
    const image = renderer.domElement.toDataURL("image/jpeg", 0.82);
    window.parent.postMessage({ type: "shaderops/preview", projectId, image }, "*");
  }

  history.suppress = true;
  const bridge = window.ShaderOpsControls.init({
    projectId,
    schema: controlSchema,
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
      applyParamsFromBridge(nextParams, true);
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

  if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) {
    seed = bridge.extras.seed;
    uniforms.uSeed.value = seed;
  }
  if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
  applyUniformsFromParams();
  bridge.attachCamera(camera, controls3d);
  history.suppress = false;

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    pendingPreview = true;
  });
  window.addEventListener("message", (event) => {
    if (event.data?.type !== "shaderops/request-preview") return;
    if (event.data.projectId && event.data.projectId !== projectId) return;
    sendPreview();
  });
  window.addEventListener("beforeunload", () => sendPreview());

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
    if (!paused) runTime += delta;
    uniforms.uTime.value = runTime;
    renderDisplay();
    previewCooldown += delta;
    if (pendingPreview && previewCooldown > 0.45) {
      pendingPreview = false;
      previewCooldown = 0;
      sendPreview();
    }
  }
  sendPreview();
  animate();
}
