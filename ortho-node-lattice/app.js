import { createPatternProject } from "../shared/pattern-project.js";

const PRESET = {
  speed: 0.2,
  scale: 1.0,
  density: 10.0,
  maxConn: 3.0,
  linkFill: 0.62,
  lineWidth: 0.06,
  pointSize: 1.0,
  edgeSoft: 0.018,
  cornerRound: 0.06,
  sdfOn: 0.0,
  sdfSpacing: 0.32,
  sdfThickness: 0.28,
  sdfRingJitter: 24.0,
  sdfIslandJitter: 24.0,
  hue: 208.0,
  sat: 0.62,
  contrast: 1.04,
  glow: 0.2,
};

const schema = [
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 1.2, step: 0.01, default: PRESET.speed },
  { id: "scale", label: "Scale", group: "Global", min: 0.45, max: 2.4, step: 0.01, default: PRESET.scale },
  { id: "density", label: "Density", group: "Grid", min: 4, max: 22, step: 1, default: PRESET.density },
  { id: "maxConn", label: "Max Conn", group: "Grid", min: 2, max: 4, step: 1, default: PRESET.maxConn },
  { id: "linkFill", label: "Link Fill", group: "Grid", min: 0.2, max: 1.0, step: 0.01, default: PRESET.linkFill },
  { id: "lineWidth", label: "Line Width", group: "Line", min: 0.01, max: 0.2, step: 0.001, default: PRESET.lineWidth },
  { id: "pointSize", label: "Point Size", group: "Line", min: 0.0, max: 3.0, step: 0.01, default: PRESET.pointSize },
  { id: "edgeSoft", label: "Edge Soft", group: "Line", min: 0.0, max: 0.08, step: 0.001, default: PRESET.edgeSoft },
  { id: "cornerRound", label: "Corner Round", group: "Line", min: 0.0, max: 0.2, step: 0.001, default: PRESET.cornerRound },
  { id: "sdfOn", label: "SDF", type: "toggle", group: "SDF", min: 0, max: 1, step: 1, default: PRESET.sdfOn },
  { id: "sdfSpacing", label: "Ring Spacing", group: "SDF", min: 0.0, max: 1.0, step: 0.01, default: PRESET.sdfSpacing, showIf: { eq: { sdfOn: 1 } } },
  { id: "sdfThickness", label: "Ring Thickness", group: "SDF", min: 0.0, max: 1.0, step: 0.01, default: PRESET.sdfThickness, showIf: { eq: { sdfOn: 1 } } },
  { id: "sdfRingJitter", label: "Ring Jitter", group: "SDF", min: 0.0, max: 120.0, step: 1, default: PRESET.sdfRingJitter, showIf: { eq: { sdfOn: 1 } } },
  { id: "sdfIslandJitter", label: "Island Jitter", group: "SDF", min: 0.0, max: 120.0, step: 1, default: PRESET.sdfIslandJitter, showIf: { eq: { sdfOn: 1 } } },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: PRESET.hue },
  { id: "sat", label: "Sat", group: "Color", min: 0.15, max: 1.0, step: 0.01, default: PRESET.sat },
  { id: "contrast", label: "Contrast", group: "Color", min: 0.7, max: 1.6, step: 0.01, default: PRESET.contrast },
  { id: "glow", label: "Glow", group: "Color", min: 0.0, max: 1.2, step: 0.01, default: PRESET.glow },
];

createPatternProject({
  defaultProjectId: "ortho-node-lattice",
  title: "Ortho Node Lattice",
  seed: 293874,
  preset: PRESET,
  schema,
  buildUniforms: ({ THREE, params, seed }) => ({
    u_time: { value: 0 },
    u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    u_seed: { value: seed },
    u_global: { value: new THREE.Vector4(params.speed, params.scale, params.density, params.maxConn) },
    u_style: { value: new THREE.Vector4(params.lineWidth, params.edgeSoft, params.cornerRound, params.linkFill) },
    u_style2: { value: new THREE.Vector4(params.pointSize, params.sdfOn, 0, 0) },
    u_sdf: { value: new THREE.Vector4(params.sdfSpacing, params.sdfThickness, params.sdfRingJitter, params.sdfIslandJitter) },
    u_color: { value: new THREE.Vector4(params.hue, params.sat, params.contrast, params.glow) },
  }),
  applyUniforms: ({ uniforms, params, seed }) => {
    uniforms.u_seed.value = seed;
    uniforms.u_global.value.set(params.speed, params.scale, params.density, params.maxConn);
    uniforms.u_style.value.set(params.lineWidth, params.edgeSoft, params.cornerRound, params.linkFill);
    uniforms.u_style2.value.set(params.pointSize, params.sdfOn, 0, 0);
    uniforms.u_sdf.value.set(params.sdfSpacing, params.sdfThickness, params.sdfRingJitter, params.sdfIslandJitter);
    uniforms.u_color.value.set(params.hue, params.sat, params.contrast, params.glow);
  },
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_seed;
    uniform vec4 u_global; // x=speed y=scale z=density w=maxConn
    uniform vec4 u_style;  // x=lineWidth y=edgeSoft z=cornerRound w=linkFill
    uniform vec4 u_style2; // x=pointSize y=sdfOn
    uniform vec4 u_sdf;    // x=sdfSpacing y=sdfThickness z=sdfRingJitter w=sdfIslandJitter
    uniform vec4 u_color;  // x=hue y=sat z=contrast w=glow

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    float hash21(vec2 p) {
      p += fract(u_seed * vec2(0.000173, 0.000231));
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec2 normalizePair(vec2 a, vec2 b) {
      return (a.x < b.x || (a.x == b.x && a.y <= b.y)) ? a * 97.0 + b * 131.0 : b * 97.0 + a * 131.0;
    }

    float pairScore(vec2 a, vec2 b) {
      return hash21(normalizePair(a, b) + 19.7);
    }

    float dirScore(vec2 id, vec2 dir) {
      return pairScore(id, id + dir);
    }

    float scoreR(vec2 id) { return dirScore(id, vec2(1.0, 0.0)); }
    float scoreL(vec2 id) { return dirScore(id, vec2(-1.0, 0.0)); }
    float scoreU(vec2 id) { return dirScore(id, vec2(0.0, 1.0)); }
    float scoreD(vec2 id) { return dirScore(id, vec2(0.0, -1.0)); }

    bool allowDir(vec2 id, vec2 dir, float maxConn, float minScore) {
      float s = dirScore(id, dir);
      // Deterministic tiny bias avoids equality instability across directions.
      float e = dot(dir, vec2(0.00071, 0.00131));
      float target = s + e;

      float r = scoreR(id) + 0.00071;
      float l = scoreL(id) - 0.00071;
      float u = scoreU(id) + 0.00131;
      float d = scoreD(id) - 0.00131;

      float rank = 0.0;
      rank += step(target, r);
      rank += step(target, l);
      rank += step(target, u);
      rank += step(target, d);
      rank -= 1.0; // remove self comparison

      bool topK = rank < maxConn;
      bool denseEnough = s >= minScore;
      return topK && denseEnough;
    }

    bool edgeActive(vec2 id, vec2 dir, float maxConn, float minScore) {
      return allowDir(id, dir, maxConn, minScore) && allowDir(id + dir, -dir, maxConn, minScore);
    }

    vec2 islandRoot(vec2 startId, float maxConn, float minScore) {
      vec2 id = startId;
      for (int it = 0; it < 24; it++) {
        float bestScore = hash21(id * 0.73 + vec2(11.7, 3.1));
        vec2 bestId = id;

        vec2 nR = id + vec2(1.0, 0.0);
        if (edgeActive(id, vec2(1.0, 0.0), maxConn, minScore)) {
          float s = hash21(nR * 0.73 + vec2(11.7, 3.1));
          if (s < bestScore) { bestScore = s; bestId = nR; }
        }
        vec2 nL = id + vec2(-1.0, 0.0);
        if (edgeActive(id, vec2(-1.0, 0.0), maxConn, minScore)) {
          float s = hash21(nL * 0.73 + vec2(11.7, 3.1));
          if (s < bestScore) { bestScore = s; bestId = nL; }
        }
        vec2 nU = id + vec2(0.0, 1.0);
        if (edgeActive(id, vec2(0.0, 1.0), maxConn, minScore)) {
          float s = hash21(nU * 0.73 + vec2(11.7, 3.1));
          if (s < bestScore) { bestScore = s; bestId = nU; }
        }
        vec2 nD = id + vec2(0.0, -1.0);
        if (edgeActive(id, vec2(0.0, -1.0), maxConn, minScore)) {
          float s = hash21(nD * 0.73 + vec2(11.7, 3.1));
          if (s < bestScore) { bestScore = s; bestId = nD; }
        }

        if (bestId == id) break;
        id = bestId;
      }
      return id;
    }

    float sdSegment(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a;
      vec2 ba = b - a;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
      return length(pa - ba * h);
    }

    float smin(float a, float b, float k) {
      if (k <= 0.000001) return min(a, b);
      float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
      return mix(b, a, h) - k * h * (1.0 - h);
    }

    void main() {
      vec2 uv = vUv * 2.0 - 1.0;
      uv.x *= u_resolution.x / max(u_resolution.y, 1.0);
      float scale = max(0.2, u_global.y);
      vec2 p = uv * scale;

      float density = max(2.0, floor(u_global.z + 0.5));
      float maxConn = clamp(floor(u_global.w + 0.5), 2.0, 4.0);
      float lineW = max(0.001, u_style.x) / density;
      float edgeSoft = max(0.0, u_style.y) / density;
      float cornerK = max(0.0, u_style.z) / density;
      float linkFill = clamp(u_style.w, 0.0, 1.0);
      float pointSize = max(0.0, u_style2.x);
      float sdfOn = step(0.5, u_style2.y);
      float sdfRingJitter = clamp(u_sdf.z, 0.0, 120.0);
      float sdfIslandJitter = clamp(u_sdf.w, 0.0, 120.0);

      // Higher linkFill => more lines.
      float minScore = 1.0 - linkFill;

      vec2 gp = p * density;
      vec2 baseId = floor(gp);

      float lineField = 1e5;
      float nodeField = 1e5;
      float ownerDist = 1e5;
      vec2 ownerId = baseId;
      float nodeR = lineW * 1.2 * pointSize;
      float t = u_time * u_global.x;

      for (int ix = -2; ix <= 2; ix++) {
        for (int iy = -2; iy <= 2; iy++) {
          vec2 id = baseId + vec2(float(ix), float(iy));
          vec2 c = id / density;
          // Tiny breathing so static images still feel crafted when animated.
          float pulse = 1.0 + 0.05 * sin(t * 1.1 + hash21(id + 4.3) * 6.2831853);
          float nR = nodeR * pulse;

          if (pointSize > 0.0001) {
            float nodeD = length(p - c) - nR;
            nodeField = min(nodeField, nodeD);
            float nodeOwnerD = abs(nodeD);
            if (nodeOwnerD < ownerDist) {
              ownerDist = nodeOwnerD;
              ownerId = id;
            }
          }

          if (edgeActive(id, vec2(1.0, 0.0), maxConn, minScore)) {
            vec2 c2 = (id + vec2(1.0, 0.0)) / density;
            float seg = sdSegment(p, c, c2) - lineW;
            lineField = smin(lineField, seg, cornerK);
            float segOwnerD = abs(seg);
            if (segOwnerD < ownerDist) {
              ownerDist = segOwnerD;
              ownerId = id;
            }
          }
          if (edgeActive(id, vec2(0.0, 1.0), maxConn, minScore)) {
            vec2 c2 = (id + vec2(0.0, 1.0)) / density;
            float seg = sdSegment(p, c, c2) - lineW;
            lineField = smin(lineField, seg, cornerK);
            float segOwnerD = abs(seg);
            if (segOwnerD < ownerDist) {
              ownerDist = segOwnerD;
              ownerId = id;
            }
          }
        }
      }

      float field = min(lineField, nodeField);

      float aa = max(0.0005, edgeSoft);
      float wireAlpha = (edgeSoft <= 0.00001) ? step(field, 0.0) : (1.0 - smoothstep(-aa, aa, field));

      // Relative SDF controls:
      // spacing: 0..1 -> tiny interval .. wide interval
      // thickness: 0..1 -> 0 .. fills the entire spacing gap
      float sdfSpacing = mix(0.003, 0.4, clamp(u_sdf.x, 0.0, 1.0)) / density;
      float sdfThickness = clamp(u_sdf.y, 0.0, 1.0) * (0.5 * sdfSpacing);
      float ringCoord = abs(mod(abs(field), sdfSpacing) - 0.5 * sdfSpacing);
      float ringAlpha = 0.0;
      if (sdfThickness > 0.000001) {
        ringAlpha = sdfOn * (1.0 - smoothstep(sdfThickness, sdfThickness + aa, ringCoord));
      }
      float alpha = max(wireAlpha, ringAlpha);

      float hue = fract((u_color.x + 360.0) / 360.0);
      float sat = clamp(u_color.y, 0.0, 1.2);
      vec3 ink = hsv2rgb(vec3(hue, sat, 0.92));
      vec3 bg = hsv2rgb(vec3(fract(hue + 0.03), sat * 0.2, 0.045));
      vec2 islandId = islandRoot(ownerId, maxConn, minScore);
      float islandRand = hash21(islandId * 0.29 + vec2(73.1, 41.3));
      float ringBand = floor(abs(field) / max(sdfSpacing, 1e-6) + 1e-5);
      float ringRand = hash21(vec2(ringBand, 73.1));
      float jitteredHue =
        u_color.x
        + (islandRand * 2.0 - 1.0) * sdfIslandJitter
        + (ringRand * 2.0 - 1.0) * sdfRingJitter;
      float ringHue = fract((jitteredHue + 360.0) / 360.0);
      vec3 ringCol = hsv2rgb(vec3(ringHue, sat, 0.95));

      vec3 col = bg;
      col = mix(col, ink, wireAlpha);
      col = mix(col, ringCol, ringAlpha);

      float glow = u_color.w * exp(-max(field, 0.0) * density * 24.0);
      col += (mix(ink, ringCol, 0.5)) * glow * 0.45;
      col = pow(max(col, 0.0), vec3(max(0.5, 1.0 / max(0.2, u_color.z))));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
