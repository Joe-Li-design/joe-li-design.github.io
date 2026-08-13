import { createPatternProject } from "../shared/pattern-project.js";

const MIX_OPTIONS = [
  { value: 0, label: "Normal" },
  { value: 1, label: "Add" },
  { value: 2, label: "Screen" },
  { value: 3, label: "Multiply" },
  { value: 4, label: "Lighten" },
  { value: 5, label: "Darken" },
];

const SHAPES = [
  {
    key: "circle",
    value: 1,
    label: "Circle",
    enabledParam: "shapeCircleOn",
    defaultEnabled: 1,
    controls: [
      { id: "circleSize", label: "Size", min: 0.05, max: 2.0, step: 0.01, default: 0.84 },
      { id: "circleEdge", label: "Edge", min: 0.0, max: 0.18, step: 0.005, default: 0.07 },
      { id: "circleRound", label: "Round", min: 0, max: 1, step: 0.01, default: 0.92 },
      { id: "circleBlend", label: "Blend", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "circleCombine", label: "Combine", min: 0, max: 1, step: 0.01, default: 0.16 },
      { id: "circleTint", label: "Tint", min: -120, max: 120, step: 1, default: 0 },
      { id: "circleMix", label: "Mix", type: "select", min: 0, max: 5, step: 1, default: 0, options: MIX_OPTIONS },
      { id: "circleHole", label: "Hole", min: 0, max: 0.88, step: 0.01, default: 0.0 },
    ],
  },
  {
    key: "diamond",
    value: 2,
    label: "Diamond",
    enabledParam: "shapeDiamondOn",
    defaultEnabled: 0,
    controls: [
      { id: "diamondSize", label: "Size", min: 0.05, max: 2.0, step: 0.01, default: 0.76 },
      { id: "diamondEdge", label: "Edge", min: 0.0, max: 0.18, step: 0.005, default: 0.065 },
      { id: "diamondRound", label: "Round", min: 0, max: 1, step: 0.01, default: 0.22 },
      { id: "diamondBlend", label: "Blend", min: 0, max: 1, step: 0.01, default: 0.14 },
      { id: "diamondCombine", label: "Combine", min: 0, max: 1, step: 0.01, default: 0.16 },
      { id: "diamondTint", label: "Tint", min: -120, max: 120, step: 1, default: 26 },
      { id: "diamondMix", label: "Mix", type: "select", min: 0, max: 5, step: 1, default: 2, options: MIX_OPTIONS },
      { id: "diamondFacet", label: "Facet", min: -0.7, max: 0.7, step: 0.01, default: 0.0 },
    ],
  },
  {
    key: "capsule",
    value: 3,
    label: "Capsule",
    enabledParam: "shapeCapsuleOn",
    defaultEnabled: 1,
    controls: [
      { id: "capsuleSize", label: "Size", min: 0.05, max: 2.0, step: 0.01, default: 0.80 },
      { id: "capsuleEdge", label: "Edge", min: 0.0, max: 0.18, step: 0.005, default: 0.07 },
      { id: "capsuleRound", label: "Round", min: 0, max: 1, step: 0.01, default: 0.34 },
      { id: "capsuleBlend", label: "Blend", min: 0, max: 1, step: 0.01, default: 0.16 },
      { id: "capsuleCombine", label: "Combine", min: 0, max: 1, step: 0.01, default: 0.14 },
      { id: "capsuleTint", label: "Tint", min: -120, max: 120, step: 1, default: -24 },
      { id: "capsuleMix", label: "Mix", type: "select", min: 0, max: 5, step: 1, default: 1, options: MIX_OPTIONS },
      { id: "capsuleStretch", label: "Stretch", min: 0.1, max: 1.2, step: 0.01, default: 0.62 },
      { id: "capsuleTilt", label: "Tilt", min: -1, max: 1, step: 0.01, default: 0.18 },
    ],
  },
  {
    key: "petal",
    value: 4,
    label: "Petal",
    enabledParam: "shapePetalOn",
    defaultEnabled: 0,
    controls: [
      { id: "petalSize", label: "Size", min: 0.05, max: 2.0, step: 0.01, default: 0.82 },
      { id: "petalEdge", label: "Edge", min: 0.0, max: 0.18, step: 0.005, default: 0.075 },
      { id: "petalRound", label: "Round", min: 0, max: 1, step: 0.01, default: 0.28 },
      { id: "petalBlend", label: "Blend", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "petalCombine", label: "Combine", min: 0, max: 1, step: 0.01, default: 0.17 },
      { id: "petalTint", label: "Tint", min: -120, max: 120, step: 1, default: 58 },
      { id: "petalMix", label: "Mix", type: "select", min: 0, max: 5, step: 1, default: 2, options: MIX_OPTIONS },
      { id: "petalCount", label: "Petals", min: 3, max: 10, step: 1, default: 6 },
      { id: "petalPinch", label: "Pinch", min: 0.1, max: 0.8, step: 0.01, default: 0.34 },
    ],
  },
];

const PRESET = {
  speed: 0.24,
  globalScale: 1.0,
  gridType: 0,
  squareDensity: 1.45,
  squareAspect: 1.0,
  squareOffset: 0.0,
  squareRandom: 0.18,
  ringBands: 8,
  ringSpokes: 12,
  ringRandom: 0.18,
  gridCrop: 0,
  shapeStackUi: 0,
  shapeSelected: 1,
  hue: 198,
  saturation: 0.82,
  contrast: 1.05,
  glow: 0.32,
  hueJitter: 18,
};

SHAPES.forEach((shape) => {
  PRESET[shape.enabledParam] = shape.defaultEnabled;
  shape.controls.forEach((control) => {
    PRESET[control.id] = control.default;
  });
});

const schema = [
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 1.2, step: 0.01, default: PRESET.speed },
  { id: "globalScale", label: "Scale", group: "Global", min: 0.65, max: 2.1, step: 0.01, default: PRESET.globalScale },
  {
    id: "gridType",
    label: "Grid",
    type: "select",
    group: "Grid",
    min: 0,
    max: 1,
    step: 1,
    default: PRESET.gridType,
    options: [
      { value: 0, label: "Square" },
      { value: 1, label: "Ring" },
    ],
  },
  { id: "squareDensity", label: "Density", group: "Grid", min: 0.6, max: 3.2, step: 0.01, default: PRESET.squareDensity, showIf: { eq: { gridType: 0 } } },
  { id: "squareAspect", label: "Aspect", group: "Grid", min: 0.6, max: 1.5, step: 0.01, default: PRESET.squareAspect, showIf: { eq: { gridType: 0 } } },
  { id: "squareOffset", label: "Offset", group: "Grid", min: -0.8, max: 0.8, step: 0.01, default: PRESET.squareOffset, showIf: { eq: { gridType: 0 } } },
  { id: "squareRandom", label: "Random", group: "Grid", min: 0, max: 1, step: 0.01, default: PRESET.squareRandom, showIf: { eq: { gridType: 0 } } },
  { id: "ringBands", label: "Bands", group: "Grid", min: 4, max: 18, step: 1, default: PRESET.ringBands, showIf: { eq: { gridType: 1 } } },
  { id: "ringSpokes", label: "Spokes", group: "Grid", min: 4, max: 24, step: 1, default: PRESET.ringSpokes, showIf: { eq: { gridType: 1 } } },
  { id: "ringRandom", label: "Random", group: "Grid", min: 0, max: 1, step: 0.01, default: PRESET.ringRandom, showIf: { eq: { gridType: 1 } } },
  { id: "gridCrop", label: "Grid Crop", type: "toggle", group: "Grid", min: 0, max: 1, step: 1, default: PRESET.gridCrop, randomize: false },
  {
    id: "shapeStackUi",
    label: "Shape",
    type: "shape-stack",
    group: "Shape",
    min: 0,
    max: 0,
    step: 1,
    default: 0,
    uniform: false,
    randomize: false,
    selectedParam: "shapeSelected",
    shapes: SHAPES,
  },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: PRESET.hue },
  { id: "hueJitter", label: "Hue Jitter", group: "Color", min: 0, max: 120, step: 1, default: PRESET.hueJitter },
  { id: "saturation", label: "Sat", group: "Color", min: 0.2, max: 1.2, step: 0.01, default: PRESET.saturation },
  { id: "contrast", label: "Contrast", group: "Color", min: 0.7, max: 1.6, step: 0.01, default: PRESET.contrast },
  { id: "glow", label: "Glow", group: "Color", min: 0, max: 1.4, step: 0.01, default: PRESET.glow },
  { id: "shapeSelected", hidden: true, min: 0, max: 4, step: 1, default: PRESET.shapeSelected },
  ...SHAPES.flatMap((shape) => [
    { id: shape.enabledParam, hidden: true, min: 0, max: 1, step: 1, default: PRESET[shape.enabledParam] },
    ...shape.controls.map((control) => ({ ...control, hidden: true })),
  ]),
];

createPatternProject({
  defaultProjectId: "modular-pattern-tessellator",
  title: "Modular Pattern Tessellator",
  seed: 661903,
  preset: PRESET,
  schema,
  buildUniforms: ({ THREE, params, seed }) => ({
    u_time: { value: 0 },
    u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    u_seed: { value: seed },
    u_global: { value: new THREE.Vector4(params.speed, params.globalScale, params.hue, params.saturation) },
    u_color: { value: new THREE.Vector4(params.contrast, params.glow, params.hueJitter, 0) },
    u_gridA: { value: new THREE.Vector4(params.gridType, params.squareDensity, params.squareAspect, params.squareRandom) },
    u_gridB: { value: new THREE.Vector4(params.ringBands, params.ringSpokes, params.ringRandom, 0) },
    u_gridC: { value: new THREE.Vector4(0, 0, params.gridCrop, params.squareOffset) },
    u_shape0A: { value: new THREE.Vector4() },
    u_shape0B: { value: new THREE.Vector4() },
    u_shape0C: { value: new THREE.Vector4() },
    u_shape1A: { value: new THREE.Vector4() },
    u_shape1B: { value: new THREE.Vector4() },
    u_shape1C: { value: new THREE.Vector4() },
    u_shape2A: { value: new THREE.Vector4() },
    u_shape2B: { value: new THREE.Vector4() },
    u_shape2C: { value: new THREE.Vector4() },
    u_shape3A: { value: new THREE.Vector4() },
    u_shape3B: { value: new THREE.Vector4() },
    u_shape3C: { value: new THREE.Vector4() },
  }),
  applyUniforms: ({ uniforms, params, seed }) => {
    uniforms.u_seed.value = seed;
    uniforms.u_global.value.set(params.speed, params.globalScale, params.hue, params.saturation);
    uniforms.u_color.value.set(params.contrast, params.glow, params.hueJitter, 0);
    uniforms.u_gridA.value.set(params.gridType, params.squareDensity, params.squareAspect, params.squareRandom);
    uniforms.u_gridB.value.set(params.ringBands, params.ringSpokes, params.ringRandom, 0);
    uniforms.u_gridC.value.set(0, 0, params.gridCrop, params.squareOffset);
    SHAPES.forEach((shape, index) => {
      const prefix = shape.key;
      const specA =
        shape.key === "circle" ? params.circleHole
        : shape.key === "diamond" ? params.diamondFacet
        : shape.key === "capsule" ? params.capsuleStretch
        : params.petalCount;
      const specB =
        shape.key === "capsule" ? params.capsuleTilt
        : shape.key === "petal" ? params.petalPinch
        : 0;
      uniforms[`u_shape${index}A`].value.set(
        params[shape.enabledParam],
        params[`${prefix}Size`],
        params[`${prefix}Edge`],
        params[`${prefix}Round`]
      );
      uniforms[`u_shape${index}B`].value.set(
        params[`${prefix}Blend`],
        params[`${prefix}Combine`],
        params[`${prefix}Tint`],
        params[`${prefix}Mix`]
      );
      uniforms[`u_shape${index}C`].value.set(specA, specB, 0, 0);
    });
  },
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_seed;
    uniform vec4 u_global;
    uniform vec4 u_color;
    uniform vec4 u_gridA;
    uniform vec4 u_gridB;
    uniform vec4 u_gridC;
    uniform vec4 u_shape0A;
    uniform vec4 u_shape0B;
    uniform vec4 u_shape0C;
    uniform vec4 u_shape1A;
    uniform vec4 u_shape1B;
    uniform vec4 u_shape1C;
    uniform vec4 u_shape2A;
    uniform vec4 u_shape2B;
    uniform vec4 u_shape2C;
    uniform vec4 u_shape3A;
    uniform vec4 u_shape3B;
    uniform vec4 u_shape3C;

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    float hash21(vec2 p) {
      p += fract(u_seed * vec2(0.00013753, 0.00021617));
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    mat2 rot(float a) {
      float c = cos(a);
      float s = sin(a);
      return mat2(c, -s, s, c);
    }

    float smin(float a, float b, float k) {
      if (k <= 0.0001) return min(a, b);
      float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
      return mix(b, a, h) - k * h * (1.0 - h);
    }

    float sdBox(vec2 p, vec2 b) {
      vec2 d = abs(p) - b;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    }

    float sdSegment(vec2 p, float halfLen, float radius) {
      vec2 q = vec2(abs(p.x) - halfLen, abs(p.y) - radius);
      return min(max(q.x, q.y), 0.0) + length(max(q, 0.0));
    }

    float evalShapeType(int shapeType, vec2 p, float size, float roundness, float a, float b) {
      if (shapeType == 0) {
        float dCircle = length(p) - size;
        float dBox = sdBox(p, vec2(size * 0.82));
        float d = mix(dBox, dCircle, clamp(roundness, 0.0, 1.0));
        float hole = clamp(a, 0.0, 0.92);
        if (hole > 0.001) {
          float inner = -(length(p) - size * hole);
          d = max(d, inner);
        }
        return d;
      }
      if (shapeType == 1) {
        vec2 q = p;
        q.y *= mix(1.35, 0.72, clamp(a * 0.5 + 0.5, 0.0, 1.0));
        float d0 = (abs(q.x) + abs(q.y)) * 0.70710678 - size;
        float d1 = sdBox(q, vec2(size * 0.76));
        return mix(d0, d1, clamp(roundness, 0.0, 1.0));
      }
      if (shapeType == 2) {
        vec2 q = p * rot(b * 1.5707963);
        float halfLen = size * mix(0.25, 1.05, clamp(a, 0.0, 1.2));
        float radius = size * mix(0.12, 0.34, clamp(roundness, 0.0, 1.0));
        return sdSegment(q, halfLen, radius);
      }
      float rr = length(p);
      float ang = atan(p.y, p.x);
      float petals = max(3.0, floor(a + 0.5));
      float petalR = size * (0.62 + clamp(b, 0.05, 0.95) * cos(ang * petals));
      float d0 = rr - petalR;
      float d1 = rr - size * 0.8;
      return mix(d0, d1, clamp(roundness * 0.45, 0.0, 1.0));
    }

    vec2 localFromGrid(vec2 p) {
      if (u_gridA.x < 0.5) {
        float spacing = 1.2 / max(0.3, u_gridA.y);
        vec2 cell = vec2(spacing, spacing * max(0.45, u_gridA.z));
        float stagger = clamp(u_gridC.w, -1.0, 1.0);
        vec2 tile = p / cell;
        tile.y -= mod(floor(tile.x), 2.0) * stagger;
        vec2 id = floor(tile);
        vec2 jitter = (vec2(hash21(id + 1.3), hash21(id + 7.7)) - 0.5) * u_gridA.w * cell;
        vec2 center = (id + 0.5) * cell;
        center.y += mod(id.x, 2.0) * stagger * cell.y;
        return p - (center + jitter);
      }
      float ringStep = 1.45 / max(2.0, u_gridB.x);
      float sectors = max(3.0, floor(u_gridB.y + 0.5));
      float sectorStep = 6.2831853 / sectors;
      float r = length(p);
      float ang = atan(p.y, p.x);
      float ringId = floor(r / ringStep);
      float sectorId = floor((ang + 3.14159265) / sectorStep);
      float jitterR = (hash21(vec2(ringId, sectorId) + 2.7) - 0.5) * u_gridB.z * ringStep * 0.6;
      float jitterA = (hash21(vec2(sectorId, ringId) + 8.4) - 0.5) * u_gridB.z * sectorStep * 0.7;
      float radius = max(0.0, (ringId + 0.5) * ringStep + jitterR);
      float aa = (sectorId + 0.5) * sectorStep - 3.14159265 + jitterA;
      return p - vec2(cos(aa), sin(aa)) * radius;
    }

    vec4 sampleShapeGrid(int shapeType, vec2 p, float size, float edge, float roundness, float blendSoft, float a, float b) {
      // size is in half-cell units: 1.0 = fills half-cell, 2.0 = fills full cell
      float halfCell = (u_gridA.x < 0.5)
        ? (1.2 / max(0.3, u_gridA.y)) * 0.5
        : (1.45 / max(2.0, u_gridB.x)) * 0.5;
      float actualSize = size * halfCell;
      float aaEdge = max(0.001, edge);

      if (u_gridA.x < 0.5) {
        // ---- Square grid ----
        float spacing = halfCell * 2.0;
        vec2 cell = vec2(spacing, spacing * max(0.45, u_gridA.z));
        float stagger = clamp(u_gridC.w, -1.0, 1.0);
        vec2 tile = p / cell;
        tile.y -= mod(floor(tile.x), 2.0) * stagger;
        vec2 id = floor(tile);
        vec2 f = fract(tile) - 0.5;
        float hueRand = hash21(id + 11.3) * 2.0 - 1.0;
        float cropSdf = (max(abs(f.x), abs(f.y)) - 0.48) * min(cell.x, cell.y);

        if (u_gridC.z < 0.5) {
          // Crop OFF: 3x3 neighbour multi-instance, z-order colour, nearestField for smooth alpha
          float nearestField = 10.0;
          float topLayer = -1.0;
          float topField = 10.0;
          float topHue = hueRand;

          for (int ox = -1; ox <= 1; ox++) {
            for (int oy = -1; oy <= 1; oy++) {
              vec2 nid = id + vec2(float(ox), float(oy));
              vec2 njitter = (vec2(hash21(nid + 1.3), hash21(nid + 7.7)) - 0.5) * u_gridA.w * cell;
              vec2 ncenter = (nid + 0.5) * cell;
              ncenter.y += mod(nid.x, 2.0) * stagger * cell.y;

              // Per-cell animation
              float ap = hash21(nid + 3.71) * 6.2831853;
              vec2 drift = vec2(sin(u_time * 0.28 + ap), cos(u_time * 0.22 + ap + 1.4)) * cell.x * 0.06;
              float sp = hash21(nid + 22.1) * 6.2831853;
              float animSize = actualSize * (1.0 + 0.05 * sin(u_time * 0.9 + sp));
              float rotSpd = (hash21(nid + 71.3) - 0.5) * 0.3;

              vec2 nLocal = rot(u_time * rotSpd) * (p - (ncenter + njitter + drift));
              float nField = evalShapeType(shapeType, nLocal, animSize, roundness, a, b);
              nearestField = smin(nearestField, nField, max(0.0001, blendSoft * animSize * 0.8));
              float nAlpha = 1.0 - smoothstep(-aaEdge, aaEdge, nField);
              float nLayer = hash21(nid + vec2(53.7 + float(shapeType) * 7.13, 91.2));
              if (nAlpha > 0.001 && nLayer > topLayer) {
                topLayer = nLayer;
                topField = nField;
                topHue = hash21(nid + 11.3) * 2.0 - 1.0;
              }
            }
          }

          // Use nearestField for smooth alpha; topField for SDF-blend continuity
          float blendedField = mix((topLayer > -0.5 ? topField : nearestField), nearestField, clamp(blendSoft, 0.0, 1.0));
          float alpha = (edge <= 0.00001) ? step(nearestField, 0.0) : (1.0 - smoothstep(-aaEdge, aaEdge, nearestField));
          return vec4(blendedField, alpha, topHue, 0.0);
        }

        // Crop ON: single animated instance per cell
        vec2 jitter = (vec2(hash21(id + 1.3), hash21(id + 7.7)) - 0.5) * u_gridA.w * cell;
        vec2 center = (id + 0.5) * cell;
        center.y += mod(id.x, 2.0) * stagger * cell.y;
        float ap = hash21(id + 3.71) * 6.2831853;
        vec2 drift = vec2(sin(u_time * 0.28 + ap), cos(u_time * 0.22 + ap + 1.4)) * cell.x * 0.06;
        float sp = hash21(id + 22.1) * 6.2831853;
        float animSize = actualSize * (1.0 + 0.05 * sin(u_time * 0.9 + sp));
        float rotSpd = (hash21(id + 71.3) - 0.5) * 0.3;
        vec2 local = rot(u_time * rotSpd) * (p - (center + jitter + drift));
        float field = evalShapeType(shapeType, local, animSize, roundness, a, b);
        field = max(field, cropSdf);
        float alpha = (edge <= 0.00001) ? step(field, 0.0) : (1.0 - smoothstep(-aaEdge, aaEdge, field));
        return vec4(field, alpha, hueRand, 0.0);

      } else {
        // ---- Ring grid ----
        float ringStep = halfCell * 2.0;
        float sectors = max(3.0, floor(u_gridB.y + 0.5));
        float sectorStep = 6.2831853 / sectors;
        float r = length(p);
        float ang = atan(p.y, p.x);
        float ringId = floor(r / ringStep);
        float sectorId = floor((ang + 3.14159265) / sectorStep);
        float jitterR = (hash21(vec2(ringId, sectorId) + 2.7) - 0.5) * u_gridB.z * ringStep * 0.6;
        float jitterA = (hash21(vec2(sectorId, ringId) + 8.4) - 0.5) * u_gridB.z * sectorStep * 0.7;
        float radius = max(0.0, (ringId + 0.5) * ringStep + jitterR);
        float aa = (sectorId + 0.5) * sectorStep - 3.14159265 + jitterA;
        vec2 centerPt = vec2(cos(aa), sin(aa)) * radius;
        float hueRand = hash21(vec2(ringId, sectorId) + 17.1) * 2.0 - 1.0;
        float cropSdf = length(p - centerPt) - ringStep * 0.62;

        if (u_gridC.z < 0.5) {
          float nearestField = 10.0;
          float topLayer = -1.0;
          float topField = 10.0;
          float topHue = hueRand;

          for (int ro = -1; ro <= 1; ro++) {
            for (int so = -1; so <= 1; so++) {
              float nRing = max(0.0, ringId + float(ro));
              float nSector = sectorId + float(so);
              float njR = (hash21(vec2(nRing, nSector) + 2.7) - 0.5) * u_gridB.z * ringStep * 0.6;
              float njA = (hash21(vec2(nSector, nRing) + 8.4) - 0.5) * u_gridB.z * sectorStep * 0.7;
              float nRadius = max(0.0, (nRing + 0.5) * ringStep + njR);
              float nAa = (nSector + 0.5) * sectorStep - 3.14159265 + njA;
              vec2 nPos = vec2(cos(nAa), sin(nAa)) * nRadius;

              float ap = hash21(vec2(nRing, nSector) + 3.71) * 6.2831853;
              nPos += vec2(sin(u_time * 0.28 + ap), cos(u_time * 0.22 + ap + 1.4)) * ringStep * 0.06;
              float sp = hash21(vec2(nRing, nSector) + 22.1) * 6.2831853;
              float animSize = actualSize * (1.0 + 0.05 * sin(u_time * 0.9 + sp));
              float rotSpd = (hash21(vec2(nRing, nSector) + 71.3) - 0.5) * 0.3;

              vec2 nLocal = rot(u_time * rotSpd) * (p - nPos);
              float nField = evalShapeType(shapeType, nLocal, animSize, roundness, a, b);
              nearestField = smin(nearestField, nField, max(0.0001, blendSoft * animSize * 0.8));
              float nAlpha = 1.0 - smoothstep(-aaEdge, aaEdge, nField);
              float nLayer = hash21(vec2(nRing, nSector) + vec2(41.9 + float(shapeType) * 5.31, 13.7));
              if (nAlpha > 0.001 && nLayer > topLayer) {
                topLayer = nLayer;
                topField = nField;
                topHue = hash21(vec2(nRing, nSector) + 17.1) * 2.0 - 1.0;
              }
            }
          }

          float blendedField = mix((topLayer > -0.5 ? topField : nearestField), nearestField, clamp(blendSoft, 0.0, 1.0));
          float alpha = (edge <= 0.00001) ? step(nearestField, 0.0) : (1.0 - smoothstep(-aaEdge, aaEdge, nearestField));
          return vec4(blendedField, alpha, topHue, 0.0);
        }

        // Crop ON
        float ap = hash21(vec2(ringId, sectorId) + 3.71) * 6.2831853;
        vec2 drift = vec2(sin(u_time * 0.28 + ap), cos(u_time * 0.22 + ap + 1.4)) * ringStep * 0.06;
        float sp = hash21(vec2(ringId, sectorId) + 22.1) * 6.2831853;
        float animSize = actualSize * (1.0 + 0.05 * sin(u_time * 0.9 + sp));
        float rotSpd = (hash21(vec2(ringId, sectorId) + 71.3) - 0.5) * 0.3;
        vec2 local = rot(u_time * rotSpd) * (p - (centerPt + drift));
        float field = evalShapeType(shapeType, local, animSize, roundness, a, b);
        field = max(field, cropSdf);
        float alpha = (edge <= 0.00001) ? step(field, 0.0) : (1.0 - smoothstep(-aaEdge, aaEdge, field));
        return vec4(field, alpha, hueRand, 0.0);
      }
    }

    vec3 applyMix(vec3 base, vec3 layer, float alpha, float mode) {
      alpha = clamp(alpha, 0.0, 1.0);
      if (mode < 0.5) return mix(base, layer, alpha);
      if (mode < 1.5) return base + layer * alpha;
      if (mode < 2.5) return 1.0 - (1.0 - base) * (1.0 - layer * alpha);
      if (mode < 3.5) return mix(base, base * layer, alpha);
      if (mode < 4.5) return mix(base, max(base, layer), alpha);
      return mix(base, min(base, layer), alpha);
    }

    vec3 shapeColor(float hueShift, float valueBias) {
      float h = fract((u_global.z + hueShift) / 360.0);
      return hsv2rgb(vec3(h, clamp(u_global.w, 0.0, 1.6), clamp(valueBias, 0.0, 1.2)));
    }

    void compositeLayer(inout vec3 inkCol, inout float inkAlpha, vec3 layerColor, float layerAlpha, float mode) {
      layerAlpha = clamp(layerAlpha, 0.0, 1.0);
      if (layerAlpha <= 0.0001) return;
      if (inkAlpha <= 0.0001) {
        inkCol = layerColor;
        inkAlpha = layerAlpha;
        return;
      }

      vec3 mixed = applyMix(inkCol, layerColor, layerAlpha, mode);
      float outAlpha = inkAlpha + layerAlpha * (1.0 - inkAlpha);
      vec3 outCol = (inkCol * inkAlpha * (1.0 - layerAlpha) + mixed * layerAlpha) / max(0.0001, outAlpha);
      inkCol = outCol;
      inkAlpha = outAlpha;
    }

    void main() {
      vec2 uv = vUv * 2.0 - 1.0;
      uv.x *= u_resolution.x / max(u_resolution.y, 1.0);
      vec2 p = uv * (2.1 * u_global.y);

      vec3 bgCol = hsv2rgb(vec3(fract((u_global.z + 6.0) / 360.0), clamp(u_global.w * 0.08, 0.0, 0.5), 0.07));
      vec3 inkCol = vec3(0.0);
      float inkAlpha = 0.0;

      float field = 10.0;

      if (u_shape0A.x > 0.5) {
        vec4 layerSample = sampleShapeGrid(0, p, u_shape0A.y, u_shape0A.z, u_shape0A.w, u_shape0B.x, u_shape0C.x, u_shape0C.y);
        float combineSoft = max(0.0001, u_shape0B.y * u_shape0A.y * 1.2);
        float overlap = 1.0 - smoothstep(0.0, max(0.001, u_shape0A.z * 2.0), field);
        float layerAlpha = mix(layerSample.y, clamp(layerSample.y + overlap * 0.75, 0.0, 1.0), clamp(u_shape0B.y, 0.0, 1.0));
        vec3 layerColor = shapeColor(u_shape0B.z + layerSample.z * u_color.z, 0.92);
        compositeLayer(inkCol, inkAlpha, layerColor, layerAlpha, u_shape0B.w);
        field = smin(field, layerSample.x, combineSoft);
      }
      if (u_shape1A.x > 0.5) {
        vec4 layerSample = sampleShapeGrid(1, p, u_shape1A.y, u_shape1A.z, u_shape1A.w, u_shape1B.x, u_shape1C.x, u_shape1C.y);
        float combineSoft = max(0.0001, u_shape1B.y * u_shape1A.y * 1.2);
        float overlap = 1.0 - smoothstep(0.0, max(0.001, u_shape1A.z * 2.0), field);
        float layerAlpha = mix(layerSample.y, clamp(layerSample.y + overlap * 0.75, 0.0, 1.0), clamp(u_shape1B.y, 0.0, 1.0));
        vec3 layerColor = shapeColor(u_shape1B.z + layerSample.z * u_color.z, 0.94);
        compositeLayer(inkCol, inkAlpha, layerColor, layerAlpha, u_shape1B.w);
        field = smin(field, layerSample.x, combineSoft);
      }
      if (u_shape2A.x > 0.5) {
        vec4 layerSample = sampleShapeGrid(2, p, u_shape2A.y, u_shape2A.z, u_shape2A.w, u_shape2B.x, u_shape2C.x, u_shape2C.y);
        float combineSoft = max(0.0001, u_shape2B.y * u_shape2A.y * 1.2);
        float overlap = 1.0 - smoothstep(0.0, max(0.001, u_shape2A.z * 2.0), field);
        float layerAlpha = mix(layerSample.y, clamp(layerSample.y + overlap * 0.75, 0.0, 1.0), clamp(u_shape2B.y, 0.0, 1.0));
        vec3 layerColor = shapeColor(u_shape2B.z + layerSample.z * u_color.z, 0.95);
        compositeLayer(inkCol, inkAlpha, layerColor, layerAlpha, u_shape2B.w);
        field = smin(field, layerSample.x, combineSoft);
      }
      if (u_shape3A.x > 0.5) {
        vec4 layerSample = sampleShapeGrid(3, p, u_shape3A.y, u_shape3A.z, u_shape3A.w, u_shape3B.x, u_shape3C.x, u_shape3C.y);
        float combineSoft = max(0.0001, u_shape3B.y * u_shape3A.y * 1.2);
        float overlap = 1.0 - smoothstep(0.0, max(0.001, u_shape3A.z * 2.0), field);
        float layerAlpha = mix(layerSample.y, clamp(layerSample.y + overlap * 0.75, 0.0, 1.0), clamp(u_shape3B.y, 0.0, 1.0));
        vec3 layerColor = shapeColor(u_shape3B.z + layerSample.z * u_color.z, 0.98);
        compositeLayer(inkCol, inkAlpha, layerColor, layerAlpha, u_shape3B.w);
        field = smin(field, layerSample.x, combineSoft);
      }

      vec3 col = mix(bgCol, inkCol, inkAlpha);
      float edgeBand = smoothstep(0.0, 0.45, inkAlpha) * (1.0 - smoothstep(0.45, 1.0, inkAlpha));
      col += inkCol * edgeBand * 0.28;
      float bevel = exp(-abs(field) * (14.0 + u_color.y * 12.0));
      col += vec3(1.0) * bevel * (0.08 + u_color.y * 0.16) * inkAlpha;
      col = pow(max(col, vec3(0.0)), vec3(1.0 / clamp(u_color.x, 0.75, 1.8)));
      col += vec3(0.035, 0.04, 0.05) * (1.0 - smoothstep(0.0, 0.03, dot(col, vec3(0.2126, 0.7152, 0.0722))));
      if (col.x != col.x || col.y != col.y || col.z != col.z) {
        col = vec3(1.0, 0.0, 1.0);
      }
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
});
