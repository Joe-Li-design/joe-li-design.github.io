import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "particle-scatter-studio";
})();

const REFERENCE_PRESET = {
  intensity: 1.5,
  speed: 0.6,
  bloom: 1.3,
  hue: 40,
  hueDrift: 0.4,
  saturation: 1.05,
  p1: 1.1,
  p2: 1.0,
  p3: 1.0,
  p4: 1.2,
  p5: 0.4,
  p6: 1.0,
  p7: 0.45,
  grain: 0.05,
  nebula: 0.0,
  nebulaHue: 270,
  nebulaWarm: 0.4,
  nebulaScale: 1.0,
  nebulaDetail: 1.0,
  nebulaDrift: 0.0,
  starTemp: 0.55,
};

const controlSchema = [
  { id: "intensity", label: "Power", group: "Global", min: 0.3, max: 2.4, step: 0.01, default: REFERENCE_PRESET.intensity },
  { id: "speed", label: "Speed", group: "Global", min: 0, max: 2.0, step: 0.01, default: REFERENCE_PRESET.speed },
  { id: "bloom", label: "Bloom", group: "Global", min: 0.2, max: 2.4, step: 0.01, default: REFERENCE_PRESET.bloom },
  { id: "grain", label: "Grain", group: "Global", min: 0, max: 0.2, step: 0.001, default: REFERENCE_PRESET.grain },
  { id: "hue", label: "Hue", group: "Color", min: 0, max: 360, step: 1, default: REFERENCE_PRESET.hue },
  { id: "hueDrift", label: "Hue Drift", group: "Color", min: 0, max: 2.0, step: 0.01, default: REFERENCE_PRESET.hueDrift },
  { id: "saturation", label: "Sat", group: "Color", min: 0.3, max: 1.4, step: 0.01, default: REFERENCE_PRESET.saturation },
  { id: "starTemp", label: "Star Temp", group: "Color", min: 0, max: 1.0, step: 0.01, default: REFERENCE_PRESET.starTemp },
  { id: "p1", label: "Density", group: "Particles", min: 0.5, max: 3.0, step: 0.01, default: REFERENCE_PRESET.p1 },
  { id: "p2", label: "Size", group: "Particles", min: 0.3, max: 2.2, step: 0.01, default: REFERENCE_PRESET.p2 },
  { id: "p3", label: "Embers", group: "Particles", min: 0, max: 2.0, step: 0.01, default: REFERENCE_PRESET.p3 },
  { id: "p4", label: "Sparkle", group: "Particles", min: 0, max: 2.0, step: 0.01, default: REFERENCE_PRESET.p4 },
  { id: "p5", label: "Orbs", group: "Particles", min: 0, max: 2.0, step: 0.01, default: REFERENCE_PRESET.p5 },
  { id: "p6", label: "Drift", group: "Particles", min: 0, max: 2.0, step: 0.01, default: REFERENCE_PRESET.p6 },
  { id: "p7", label: "Clump", group: "Particles", min: 0, max: 1.0, step: 0.01, default: REFERENCE_PRESET.p7 },
  { id: "nebula", label: "Nebula", group: "Nebula", min: 0, max: 1.0, step: 0.01, default: REFERENCE_PRESET.nebula },
  { id: "nebulaHue", label: "Neb Hue", group: "Nebula", min: 0, max: 360, step: 1, default: REFERENCE_PRESET.nebulaHue },
  { id: "nebulaWarm", label: "Warm", group: "Nebula", min: 0, max: 1.0, step: 0.01, default: REFERENCE_PRESET.nebulaWarm },
  { id: "nebulaScale", label: "Scale", group: "Nebula", min: 0.4, max: 2.5, step: 0.01, default: REFERENCE_PRESET.nebulaScale },
  { id: "nebulaDetail", label: "Detail", group: "Nebula", min: 0.2, max: 2.0, step: 0.01, default: REFERENCE_PRESET.nebulaDetail },
  { id: "nebulaDrift", label: "Neb Drift", group: "Nebula", min: 0, max: 1.0, step: 0.01, default: REFERENCE_PRESET.nebulaDrift },
];
const params = {};
controlSchema.forEach((cfg) => {
  params[cfg.id] = cfg.default;
});

const app = document.getElementById("app");

let paused = false;
let elapsed = 0;
let lastTs = performance.now() * 0.001;
let seed = 192837465;
let pendingPreview = true;
let previewCooldown = 0;
let bridge = null;
const history = {
  undoStack: [],
  redoStack: [],
  limit: 140,
  suppress: false,
};

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const legacyCanvas = document.getElementById("fx");
if (legacyCanvas) legacyCanvas.remove();
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  u_time: { value: 0 },
  u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  u_seed: { value: seed },
  u_intensity: { value: params.intensity },
  u_speed: { value: params.speed },
  u_bloom: { value: params.bloom },
  u_hue: { value: params.hue },
  u_hueDrift: { value: params.hueDrift },
  u_saturation: { value: params.saturation },
  u_starTemp: { value: params.starTemp },
  u_p1: { value: params.p1 },
  u_p2: { value: params.p2 },
  u_p3: { value: params.p3 },
  u_p4: { value: params.p4 },
  u_p5: { value: params.p5 },
  u_p6: { value: params.p6 },
  u_p7: { value: params.p7 },
  u_grain: { value: params.grain },
  u_nebula: { value: params.nebula },
  u_nebulaHue: { value: params.nebulaHue },
  u_nebulaWarm: { value: params.nebulaWarm },
  u_nebulaScale: { value: params.nebulaScale },
  u_nebulaDetail: { value: params.nebulaDetail },
  u_nebulaDrift: { value: params.nebulaDrift },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  transparent: true,
  blending: THREE.NormalBlending,
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
    uniform vec2  u_resolution;
    uniform float u_seed;
    uniform float u_intensity;
    uniform float u_speed;
    uniform float u_bloom;
    uniform float u_hue;
    uniform float u_hueDrift;
    uniform float u_saturation;
    uniform float u_starTemp;
    uniform float u_p1;
    uniform float u_p2;
    uniform float u_p3;
    uniform float u_p4;
    uniform float u_p5;
    uniform float u_p6;
    uniform float u_p7;
    uniform float u_grain;
    uniform float u_nebula;
    uniform float u_nebulaHue;
    uniform float u_nebulaWarm;
    uniform float u_nebulaScale;
    uniform float u_nebulaDetail;
    uniform float u_nebulaDrift;

    // â”€â”€ Hash / noise primitives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    float hash21(vec2 p){
      vec3 p3=fract(vec3(p.xyx)*0.1031);
      p3+=dot(p3,p3.yzx+33.33);
      return fract((p3.x+p3.y)*p3.z);
    }
    vec2 hash22(vec2 p){
      return vec2(hash21(p+11.13), hash21(p+47.71));
    }

    // Smooth bicubic value noise
    float valueNoise(vec2 p){
      vec2 i=floor(p), f=fract(p);
      f=f*f*(3.0-2.0*f);
      float a=hash21(i), b=hash21(i+vec2(1,0)),
            c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));
      return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
    }

    // Quintic gradient noise (Perlin-style, smoother, no directional bias)
    vec2 qhash2(vec2 p){
      p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
      return -1.0 + 2.0*fract(sin(p)*43758.5453123);
    }
    float gnoise(vec2 p){
      vec2 i=floor(p), f=fract(p);
      vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
      return mix(
        mix(dot(qhash2(i),           f),
            dot(qhash2(i+vec2(1,0)), f-vec2(1,0)), u.x),
        mix(dot(qhash2(i+vec2(0,1)), f-vec2(0,1)),
            dot(qhash2(i+vec2(1,1)), f-vec2(1,1)), u.x), u.y
      );
    }

    vec3 hsv2rgb(vec3 c){
      vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
      vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
      return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
    }

    // â”€â”€ Nebula (volumetric smoke quality) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Octave rotation matrix breaks axis-aligned artefacts
    vec2 rot8(vec2 p){ return vec2(0.8*p.x-0.6*p.y, 0.6*p.x+0.8*p.y); }

    float nebFBM(vec2 p){
      float f=0.0, a=0.5;
      for(int i=0; i<6; i++){
        f += gnoise(p)*a;
        p  = rot8(p)*2.03;
        a *= 0.48;
      }
      return f*0.5+0.5; // remap gnoise(-1..1) output to 0..1
    }

    // Cheap (2-octave value noise) nebula density â€“ called per star cell
    float cheapNebDens(vec2 p){
      float sc=max(u_nebulaScale,0.1);
      float d = valueNoise(p*sc*0.38 + u_seed*0.00003 + 11.7)*0.62
              + valueNoise(p*sc*0.92 + u_seed*0.00006 + 29.3)*0.38;
      return pow(clamp(d,0.0,1.0), 1.6);
    }

    // Cheap (3-octave) multi-scale fractal density for star spawning
    float cheapFractalDens(vec2 p){
      float d = valueNoise(p*0.20 + u_seed*0.00002)         * 0.55
              + valueNoise(p*0.58 + u_seed*0.00005 + 31.4)  * 0.28
              + valueNoise(p*1.55 + u_seed*0.00008 + 7.1)   * 0.17;
      return clamp(d, 0.0, 1.0);
    }

    // Full-quality nebula color: double domain-warp + self-shadowing + color drift
    vec3 nebulaColor(vec2 uv){
      float sc = max(u_nebulaScale, 0.1);
      float t  = u_time * u_speed * 0.007;

      // Domain warp pass 1: asymmetric seed-based offsets prevent axis-aligned banding
      float sx = hash21(vec2(u_seed*0.00011 + 3.7, 1.1));
      float sy = hash21(vec2(u_seed*0.00013 + 7.3, 2.9));
      vec2 q = vec2(
        nebFBM(uv*sc*0.72 + vec2(13.5 + sx*6.0,  4.1 - sy*4.0) + t*0.28),
        nebFBM(uv*sc*0.72 + vec2(-7.3 + sy*5.0, 19.4 + sx*3.0) + t*0.22)
      );
      vec2 wuv = uv + q*(0.35 + u_nebulaDetail*0.35);

      // Domain warp pass 2: medium eddies
      vec2 r = vec2(
        nebFBM(wuv*sc*1.18 + vec2(1.7, 9.2) + t*0.14),
        nebFBM(wuv*sc*1.18 + vec2(8.3, 2.8) - t*0.17)
      );
      vec2 fuv = wuv + r*(0.10 + u_nebulaDetail*0.18);

      // Steeper density power curve: empty space collapses to black quickly
      float dens = nebFBM(fuv*sc + t*0.04 + u_seed*0.00003);
      dens = pow(clamp(dens, 0.0, 1.0), 2.4);

      // Self-shadowing
      vec2 ldir = normalize(vec2(0.45, 0.78));
      float shadow = cheapNebDens(fuv + ldir*0.26);
      shadow = pow(clamp(shadow, 0.0, 1.0), 1.5);
      float lit = exp(-shadow * 1.8 * dens);

      // Rim glow on thin edges
      float edge = 1.0 - dens;
      float rim  = edge*edge*0.26;

      // Structural split noise
      float splitN = nebFBM(fuv*sc*0.55 + 8.7 + u_seed*0.00005);

      // Nebula color drift: sampled in domain-warped space so it follows cloud structure
      float driftA = valueNoise(fuv*sc*0.18 + u_seed*0.00001 + 71.3);
      float driftB = valueNoise(fuv*sc*0.55 + u_seed*0.00002 + 37.8);
      float driftC = valueNoise(fuv*sc*1.20 + u_seed*0.00003 + 53.1);
      // base 0.06 ensures slight natural variation even at drift=0; slider adds up to ±0.28
      float colorDrift = (driftA*0.45 + driftB*0.35 + driftC*0.20 - 0.5)
                         * (0.06 + u_nebulaDrift * 0.56);

      // Cool color family (hue drifted per-region)
      float ch = u_nebulaHue/360.0;
      vec3 c1 = hsv2rgb(vec3(fract(ch + colorDrift),          0.92, 1.00));
      vec3 c2 = hsv2rgb(vec3(fract(ch + colorDrift + 0.055),  0.74, 0.85));
      vec3 c3 = hsv2rgb(vec3(fract(ch + colorDrift - 0.080),  0.82, 0.93));
      vec3 coolCol = mix(c2, mix(c1, c3, clamp(splitN, 0.0, 1.0)), dens*0.80);
      coolCol = mix(coolCol, c1*1.12, rim);

      // Warm overlay (steeper so warm patches stay local and discrete)
      float wf = nebFBM(fuv*sc*0.38 + 43.8 + u_seed*0.00004);
      wf = pow(clamp(wf, 0.0, 1.0), 2.6);
      vec3 wAmber = hsv2rgb(vec3(fract(0.058 + colorDrift*0.4), 0.86, 0.90));
      vec3 wRust  = hsv2rgb(vec3(fract(0.022 + colorDrift*0.3), 0.79, 0.82));
      vec3 warmCol = mix(wAmber, wRust, clamp(splitN*0.6, 0.0, 1.0));

      vec3 nebCol = mix(coolCol, warmCol,
                        wf * clamp(u_nebulaWarm, 0.0, 1.0) * 0.68);
      // Dense lit areas bright; dark interstitial areas multiply to near zero
      return nebCol * dens * (0.88 + lit*0.72);
    }

    // â”€â”€ Star kernels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Tiny background star dot
    float microKernel(vec2 d, float radius){
      float r=length(d)/max(radius,1e-4);
      return exp(-r*r*12.0);
    }
    float emberKernel(vec2 d, float radius){
      float r=length(d)/max(radius,1e-4);
      return exp(-r*r*3.0);
    }
    float sparkleKernel(vec2 d, float radius, float spikeMul){
      float r   = length(d)/max(radius,1e-4);
      float core = exp(-r*r*4.5);
      float halo = exp(-r*r*0.75)*0.28;
      float ax=abs(d.x), ay=abs(d.y);
      float sk = radius*0.14*spikeMul;
      float cross = sk/(ax+radius*0.038) + sk/(ay+radius*0.038);
      cross = max(cross-1.0,0.0)*smoothstep(radius*5.5,0.0,length(d));
      // Suppress spikes on tiny stars: below ~0.005 they render as axis-line artefacts
      float spikeGate = smoothstep(0.004, 0.013, radius);
      return core + halo + cross*0.75*spikeGate;
    }
    float orbKernel(vec2 d, float radius){
      float r=length(d)/max(radius,1e-4);
      return exp(-r*r*2.6)*0.8 + exp(-r*r*0.55)*0.22;
    }

    // Blackbody-inspired star temperature palette
    // 0 = cool red/orange, 0.5 = yellow-white, 1 = hot blue-white
    vec3 starTempColor(float t){
      vec3 cool = mix(hsv2rgb(vec3(0.02, 0.82, 0.94)),
                      hsv2rgb(vec3(0.07, 0.60, 0.98)), clamp(t*3.0,0.0,1.0));
      vec3 warm = mix(hsv2rgb(vec3(0.10, 0.40, 1.00)),
                      vec3(1.0,1.0,0.97),               clamp((t-0.33)*3.0,0.0,1.0));
      vec3 hot  = mix(vec3(0.95,0.97,1.00),
                      hsv2rgb(vec3(0.60, 0.55, 1.00)),  clamp((t-0.66)*3.0,0.0,1.0));
      vec3 col  = mix(cool, warm, clamp(t*2.0,0.0,1.0));
      return mix(col, hot, clamp((t-0.5)*2.0,0.0,1.0));
    }

    // â”€â”€ Particle layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // bgLayer=1.0 â†’ micro-star dust only (no embers/orbs, no animation)
    void addLayer(vec2 uv, float cellScale, float sizeMul, float brightMul,
                  float speedMul, float layerId, float bgLayer,
                  inout vec3 accumCol, inout float accumV){
      vec2 guv    = uv * cellScale;
      vec2 cellId = floor(guv);

      // Weighted mix (bgLayer forces pure sparkle mode)
      float ew = (bgLayer > 0.5) ? 0.0 : max(u_p3,0.001);
      float sw = max(u_p4,0.001);
      float ow = (bgLayer > 0.5) ? 0.0 : max(u_p5,0.001);
      float total = ew+sw+ow;
      float e0 = ew/total;
      float s0 = (ew+sw)/total;

      for(int oy=-1; oy<=1; oy++){
        for(int ox=-1; ox<=1; ox++){
          vec2 cid    = cellId + vec2(float(ox),float(oy));
          vec2 seedv  = cid + layerId*91.7 + u_seed*0.0002;
          vec2 jitter = hash22(seedv);
          float typeRand = hash21(seedv*1.37+3.1);
          float phase    = hash21(seedv*2.19+7.7)*6.2831853;
          float freq     = 0.6+hash21(seedv*3.71+3.3)*1.9;
          float lifeSeed = hash21(seedv*0.77+2.2);
          float sizeRand = 0.55+hash21(seedv*4.4+5.5);

          vec2 baseUv = (cid + jitter) / cellScale;
          float radius = 0.016 * u_p2 * sizeMul * sizeRand;

          // â”€â”€ Combined density field â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          float clump    = clamp(u_p7, 0.0, 1.0);
          float fracDens = cheapFractalDens(baseUv);
          float nebDens  = (u_nebula > 0.01) ? cheapNebDens(baseUv) : 0.5;

          // Raw blended density
          float rawDens = clamp(
            fracDens * (0.30 + clump*0.62) +
            nebDens  * u_nebula * 0.60 +
            (1.0 - clump) * (1.0 - u_nebula*0.45) * 0.45,
            0.0, 1.0
          );
          // Power curve: higher clump makes dense areas stay dense, empty areas collapse
          float densExp  = mix(1.0, 3.6, clump * clump);
          float densField = pow(rawDens, densExp);

          float spawnHi = (bgLayer > 0.5) ? 0.72 : 0.93;
          float spawnLo = (bgLayer > 0.5) ? 0.05 : 0.07;
          if(hash21(seedv*8.13+4.7) > mix(spawnLo, spawnHi, densField)) continue;

          float brightCluster = mix(0.38, 1.0, densField);

          // â”€â”€ Color assignment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          float baseHue  = fract(u_hue/360.0);
          // hueShift: at drift=2.0 random part spans ±0.5 → full hue wheel = rainbow
          float hueShift = (sin(u_time*u_speed*0.23+phase+layerId*1.3) * 0.08
                           + (hash21(seedv*6.7)-0.5)) * u_hueDrift * 0.52;
          float tempT    = hash21(seedv*13.71+89.3);
          vec3  tmpCol   = starTempColor(tempT);

          // Giant star: top 6% â†’ larger core + stronger diffraction spikes
          float mag        = hash21(seedv*17.3+44.1);
          float isBright   = (bgLayer < 0.5) ? step(0.975, mag) : 0.0;
          float sizeBoost  = 1.0 + isBright*1.15;
          float spikeBoost = 1.0 + isBright*1.9;

          vec3  col = vec3(0.0);
          float v   = 0.0;

          if(bgLayer > 0.5){
            // Micro background stars: static tight dots, temperature tinted
            vec2 pos = baseUv + (jitter-0.5)*0.004;
            vec2 dd  = uv - pos;
            float steady = 0.55 + 0.45*hash21(seedv*5.3);
            v   = microKernel(dd, radius*0.55) * sw * steady;
            col = mix(tmpCol, vec3(1.0), 0.25) * v;
          } else if(typeRand < e0){
            float life = fract(u_time*u_speed*speedMul*(0.06+0.12*lifeSeed)+lifeSeed);
            vec2 pos   = baseUv;
            pos.y += life*(0.32+0.18*u_p6);
            pos.x += sin(u_time*u_speed*1.4*speedMul+phase)*0.018*(0.4+u_p6*0.8);
            vec2 dd   = uv - pos;
            float env = smoothstep(0.0,0.14,life)*smoothstep(1.0,0.72,life);
            float flicker = 0.65+0.35*sin(u_time*u_speed*freq*6.0*speedMul+phase);
            float eH  = fract(baseHue*0.22+0.02+(hash21(seedv*5.9)-0.5)*0.02+hueShift*0.45);
            v   = emberKernel(dd,radius)*env*flicker*ew;
            col = hsv2rgb(vec3(eH,clamp(u_saturation,0.4,1.3),1.0))*v;
          } else if(typeRand < s0){
            vec2 pos = baseUv + (jitter-0.5)*0.01*u_p6;
            vec2 dd  = uv - pos;
            float twinkle = pow(clamp(0.5+0.5*sin(u_time*u_speed*freq*3.2+phase),0.0,1.0),3.0);
            vec3 hueCol = mix(
              hsv2rgb(vec3(fract(baseHue+hueShift*0.65),0.18*clamp(u_saturation,0.2,1.4),1.0)),
              tmpCol, clamp(u_starTemp,0.0,1.0)
            );
            v   = sparkleKernel(dd,radius*0.58*sizeBoost,spikeBoost)*twinkle*sw;
            col = hueCol * v;
          } else {
            vec2 pos = baseUv + vec2(
              sin(u_time*u_speed*0.40*speedMul+phase),
              cos(u_time*u_speed*0.32*speedMul+phase*1.3)
            )*0.055*(0.35+u_p6*0.65);
            vec2 dd = uv - pos;
            float breathe = 0.6+0.4*sin(u_time*u_speed*0.5*speedMul+phase*0.7);
            float oH = fract(baseHue+(hash21(seedv*9.1)-0.5)*0.15+hueShift);
            vec3 hueOrb = hsv2rgb(vec3(oH,clamp(u_saturation*0.7,0.15,1.1),1.0));
            vec3 orbColor = mix(hueOrb, tmpCol*0.75+vec3(0.25),
                                clamp(u_starTemp*0.5,0.0,1.0));
            v   = orbKernel(dd,radius*1.3)*breathe*ow;
            col = orbColor*v;
          }

          accumCol += col * brightMul * brightCluster;
          accumV   += v   * brightMul * brightCluster;
        }
      }
    }

    void main(){
      vec2 uv = vUv*2.0-1.0;
      uv.x *= u_resolution.x/max(u_resolution.y,1.0);

      float baseGrid = mix(4.0, 24.0, clamp((u_p1-0.5)/2.5, 0.0, 1.0));

      // Nebula (domain-warp FBM, smoke-quality)
      vec3 nebCol = (u_nebula > 0.001) ? nebulaColor(uv) * u_nebula : vec3(0.0);

      // Star layers: 3 full-featured (bright stars) + 2 micro-dust layers
      // Each successive layer is finer grid â†’ denser but dimmer
      vec3  col = vec3(0.0);
      float v   = 0.0;
      addLayer(uv, baseGrid*1.0,  1.00, 1.00, 1.00, 0.0, 0.0, col, v);
      addLayer(uv, baseGrid*1.65, 0.68, 0.75, 0.70, 1.0, 0.0, col, v);
      addLayer(uv, baseGrid*2.60, 0.44, 0.50, 0.45, 2.0, 0.0, col, v);
      addLayer(uv, baseGrid*4.30, 0.26, 0.28, 0.30, 3.0, 1.0, col, v); // micro-dust
      // addLayer(uv, baseGrid*7.80, 0.14, 0.15, 0.20, 4.0, 1.0, col, v); // disabled for performance

      col *= (0.55 + u_intensity*0.85);
      v   *= (0.55 + u_intensity*0.85);
      col *= (1.0  + u_bloom*0.55);
      v   *= (1.0  + u_bloom*0.55);
      col  = col/(1.0+col); // Reinhard tone-map stars
      v    = clamp(v, 0.0, 1.0);

      // Nebula + stars composite
      vec3  final  = nebCol + col;
      float noiseW = max(v, clamp(length(nebCol)*0.6, 0.0, 1.0));
      final += (hash21(gl_FragCoord.xy + u_time*131.0)-0.5)*u_grain*noiseW;
      final  = clamp(final, 0.0, 1.0);

      float alpha = clamp(max(final.r, max(final.g, final.b))*1.25, 0.0, 1.0);
      gl_FragColor = vec4(final, alpha);
    }
  `,
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

function applyParamsToUniforms() {
  uniforms.u_intensity.value = params.intensity;
  uniforms.u_speed.value = params.speed;
  uniforms.u_bloom.value = params.bloom;
  uniforms.u_hue.value = params.hue;
  uniforms.u_hueDrift.value = params.hueDrift;
  uniforms.u_saturation.value = params.saturation;
  uniforms.u_starTemp.value = params.starTemp;
  uniforms.u_p1.value = params.p1;
  uniforms.u_p2.value = params.p2;
  uniforms.u_p3.value = params.p3;
  uniforms.u_p4.value = params.p4;
  uniforms.u_p5.value = params.p5;
  uniforms.u_p6.value = params.p6;
  uniforms.u_p7.value = params.p7;
  uniforms.u_grain.value = params.grain;
  uniforms.u_nebula.value = params.nebula;
  uniforms.u_nebulaHue.value = params.nebulaHue;
  uniforms.u_nebulaWarm.value = params.nebulaWarm;
  uniforms.u_nebulaScale.value = params.nebulaScale;
  uniforms.u_nebulaDetail.value = params.nebulaDetail;
  uniforms.u_nebulaDrift.value = params.nebulaDrift;
}

function syncExtras() {
  if (!bridge) return;
  bridge.extras.seed = seed;
  bridge.extras.paused = paused;
}

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
function applyParamsFromBridge(nextParams, recordHistory) {
  if (recordHistory) pushHistorySnapshot();
  Object.keys(nextParams).forEach((id) => {
    if (params[id] === undefined) return;
    const n = Number(nextParams[id]);
    if (Number.isFinite(n)) params[id] = n;
  });
  applyParamsToUniforms();
  pendingPreview = true;
}
function applySnapshot(snapshot) {
  try {
    const state = JSON.parse(snapshot);
    if (!state || typeof state !== "object") return;
    history.suppress = true;
    if (state.params && typeof state.params === "object") applyParamsFromBridge(state.params, false);
    if (typeof state.seed === "number" && Number.isFinite(state.seed)) {
      seed = Math.max(1, Math.floor(state.seed));
      uniforms.u_seed.value = seed;
    }
    if (typeof state.paused === "boolean") paused = state.paused;
    pendingPreview = true;
    syncExtras();
    bridge.notifyValuesChanged();
  } catch {}
  finally {
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
  controlSchema.forEach((cfg) => {
    const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
    const quantized = Math.round(raw / cfg.step) * cfg.step;
    params[cfg.id] = Number(quantized.toFixed(6));
  });
  seed = Math.floor(Math.random() * 2147483646) + 1;
  uniforms.u_seed.value = seed;
  applyParamsToUniforms();
  pendingPreview = true;
  syncExtras();
  bridge.notifyValuesChanged();
}
function rerollSeed() {
  pushHistorySnapshot();
  seed = Math.floor(Math.random() * 2147483646) + 1;
  uniforms.u_seed.value = seed;
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
  uniforms.u_time.value = elapsed;
  renderer.render(scene, camera);
}
function sendPreview() {
  renderFrame();
  const image = renderer.domElement.toDataURL("image/jpeg", 0.8);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

history.suppress = true;
bridge = window.ShaderOpsControls.init({
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
    if (typeof nextExtras.seed === "number" && Number.isFinite(nextExtras.seed)) {
      pushHistorySnapshot();
      seed = Math.max(1, Math.floor(nextExtras.seed));
      uniforms.u_seed.value = seed;
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
  seed = Math.max(1, Math.floor(bridge.extras.seed));
  uniforms.u_seed.value = seed;
}
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
applyParamsToUniforms();
syncExtras();
history.suppress = false;

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
  pendingPreview = true;
});
window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "z") return;
  event.preventDefault();
  if (event.shiftKey) redoHistory();
  else undoHistory();
});
window.addEventListener("message", (event) => {
  if (event.data?.type === "shaderops/request-preview") sendPreview();
});
window.addEventListener("beforeunload", () => sendPreview());

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() * 0.001;
  const dt = Math.min(0.08, now - lastTs);
  lastTs = now;
  if (!paused) elapsed += dt * (0.2 + params.speed);
  renderFrame();
  previewCooldown += dt;
  if (pendingPreview && previewCooldown > 0.45) {
    pendingPreview = false;
    previewCooldown = 0;
    sendPreview();
  }
}

renderFrame();
sendPreview();
animate();


