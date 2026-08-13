import { createPatternProject } from "../shared/pattern-project.js";

const PRESET = {
  speed: 0.2,
  scale: 1.0,
  roundness: 0.2,
  medallion: 0.28,
  grout: 0.08,
  offset: 0.3,
  warp: 0.16,
  hue: 194,
  saturation: 0.84,
  contrast: 1.06,
  glow: 0.3,
};

const schema = [
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 1.0, step: 0.01, default: PRESET.speed },
  { id: "scale", label: "Scale", group: "Global", min: 0.6, max: 2.0, step: 0.01, default: PRESET.scale },
  { id: "roundness", label: "Round", group: "Shape", min: 0.04, max: 0.36, step: 0.01, default: PRESET.roundness },
  { id: "medallion", label: "Center", group: "Shape", min: 0.12, max: 0.42, step: 0.01, default: PRESET.medallion },
  { id: "grout", label: "Grout", group: "Shape", min: 0.02, max: 0.14, step: 0.005, default: PRESET.grout },
  { id: "offset", label: "Offset", group: "Shape", min: 0, max: 0.6, step: 0.01, default: PRESET.offset },
  { id: "warp", label: "Warp", group: "Effect", min: 0, max: 0.7, step: 0.01, default: PRESET.warp },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: PRESET.hue },
  { id: "saturation", label: "Sat", group: "Color", min: 0.2, max: 1.25, step: 0.01, default: PRESET.saturation },
  { id: "contrast", label: "Contrast", group: "Color", min: 0.7, max: 1.6, step: 0.01, default: PRESET.contrast },
  { id: "glow", label: "Glow", group: "Effect", min: 0, max: 1.2, step: 0.01, default: PRESET.glow },
];

createPatternProject({
  defaultProjectId: "enamel-mosaic-pop",
  title: "Enamel Mosaic Pop",
  seed: 771239,
  preset: PRESET,
  schema,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_seed;
    uniform float u_scale;
    uniform float u_roundness;
    uniform float u_medallion;
    uniform float u_grout;
    uniform float u_offset;
    uniform float u_warp;
    uniform float u_hue;
    uniform float u_saturation;
    uniform float u_contrast;
    uniform float u_glow;

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    float hash21(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float sdRoundBox(vec2 p, vec2 b, float r) {
      vec2 q = abs(p) - b + r;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    }

    void main() {
      vec2 uv = vUv * 2.0 - 1.0;
      uv.x *= u_resolution.x / max(u_resolution.y, 1.0);
      float t = u_time * 0.22;
      vec2 p = uv * (2.1 * u_scale);
      p += vec2(
        sin(p.y * 1.45 + t * 0.55 + u_seed * 0.000001) * 0.05,
        cos(p.x * 1.7 - t * 0.45) * 0.045
      ) * u_warp;

      vec2 tile = p * vec2(1.05, 1.05);
      tile.y += mod(floor(tile.x), 2.0) * u_offset;
      vec2 cellId = floor(tile);
      vec2 gv = fract(tile) - 0.5;
      float alt = mod(cellId.x + cellId.y, 3.0);
      float n = hash21(cellId + u_seed * 0.0001);

      float roundness = clamp(u_roundness, 0.01, 0.45);
      float grout = clamp(u_grout, 0.005, 0.24);
      float medallion = clamp(u_medallion, 0.05, 0.55);

      float tileOuter = sdRoundBox(gv, vec2(0.42), roundness);
      float tileInner = sdRoundBox(gv, vec2(0.42 - grout), max(0.001, roundness - grout * 0.4));
      float groutMask = smoothstep(grout * 2.2, 0.0, abs(tileOuter));
      float tileFill = smoothstep(0.08, -0.02, tileInner);

      vec2 q = gv;
      float ring = smoothstep(0.05, 0.0, abs(length(q) - medallion));
      float quatreA = smoothstep(0.09, 0.0, length(q - vec2(medallion * 0.68, 0.0)) - medallion * 0.5);
      float quatreB = smoothstep(0.09, 0.0, length(q - vec2(-medallion * 0.68, 0.0)) - medallion * 0.5);
      float quatreC = smoothstep(0.09, 0.0, length(q - vec2(0.0, medallion * 0.68)) - medallion * 0.5);
      float quatreD = smoothstep(0.09, 0.0, length(q - vec2(0.0, -medallion * 0.68)) - medallion * 0.5);
      float jewel = max(max(quatreA, quatreB), max(quatreC, quatreD));
      float dotA = smoothstep(0.05, 0.0, length(q - vec2(0.24, 0.24)) - 0.045);
      float dotB = smoothstep(0.05, 0.0, length(q - vec2(-0.24, -0.24)) - 0.045);
      float dotC = smoothstep(0.05, 0.0, length(q - vec2(-0.24, 0.24)) - 0.045);
      float dotD = smoothstep(0.05, 0.0, length(q - vec2(0.24, -0.24)) - 0.045);
      float corners = max(max(dotA, dotB), max(dotC, dotD));

      float enamelEdge = smoothstep(0.08, 0.0, abs(tileInner + 0.04));
      float shimmer = 0.5 + 0.5 * sin((gv.x + gv.y) * 14.0 + t * 0.8 + n * 6.2831);
      float vignette = smoothstep(2.2, 0.16, length(uv));

      float hueBase = fract(u_hue / 360.0 + alt * 0.11 + n * 0.03);
      vec3 groutCol = hsv2rgb(vec3(fract(hueBase + 0.02), clamp(u_saturation * 0.18, 0.0, 1.5), 0.18));
      vec3 tileA = hsv2rgb(vec3(fract(hueBase + 0.04), clamp(u_saturation * 0.88, 0.0, 1.5), 0.92));
      vec3 tileB = hsv2rgb(vec3(fract(hueBase + 0.16), clamp(u_saturation * 0.82, 0.0, 1.5), 0.88));
      vec3 accent = hsv2rgb(vec3(fract(hueBase + 0.31), clamp(u_saturation * 0.72, 0.0, 1.5), 0.98));

      vec3 tileBase = mix(tileA, tileB, shimmer * 0.65 + alt * 0.08);
      vec3 col = groutCol;
      col = mix(col, tileBase, tileFill);
      col = mix(col, accent, jewel * 0.74);
      col += accent * ring * 0.24;
      col += tileB * corners * 0.28;
      col += tileA * enamelEdge * u_glow * 0.26;
      col = mix(col, groutCol * 0.75, groutMask * 0.3);
      col *= vignette;
      col = pow(max(col, vec3(0.0)), vec3(1.0 / clamp(u_contrast, 0.35, 3.0)));
      col += vec3(0.035, 0.045, 0.055) * smoothstep(0.035, 0.0, dot(col, vec3(0.2126, 0.7152, 0.0722)));

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
});
