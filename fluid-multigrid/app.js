import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const PROJECT_ID = (() => {
  const p = new URLSearchParams(location.search).get("project");
  return p || "fluid-multigrid";
})();

// ─── Multigrid simulation levels ──────────────────────────────────────────────
// L0 = full res, L1 = half, L2 = quarter
const W0 = 512, H0 = 512;
const W1 = 256, H1 = 256;
const W2 = 128, H2 = 128;

// ─── Parameter schema ─────────────────────────────────────────────────────────
const REFERENCE_PRESET = {
  speed:      1.0,
  vorticity:  22.0,
  dyeDecay:   0.997,
  velDecay:   0.999,
  brushForce: 1.0,
  autoEmit:   0.5,
  // 0 = orbit emitters only, 1 = noise field only, 2 = both
  emitMode:   2,
  noiseScale: 1.8,
  noiseForce: 1.2,
  noiseDye:   0.3,
  brightness: 1.4,
  saturation: 1.1,
  hue1:       195.0,
  hue2:       330.0,
  hue3:        45.0,
};

const controlSchema = [
  { id: "speed",      label: "Speed",                         group: "Simulation", min: 0.1,  max: 3.0,   step: 0.01,  default: REFERENCE_PRESET.speed },
  { id: "vorticity",  label: "Vorticity",                    group: "Simulation", min: 0,    max: 60.0,  step: 0.5,   default: REFERENCE_PRESET.vorticity },
  { id: "dyeDecay",   label: "Dye Decay",                    group: "Simulation", min: 0.97, max: 1.0,   step: 0.001, default: REFERENCE_PRESET.dyeDecay },
  { id: "velDecay",   label: "Vel Decay",                    group: "Simulation", min: 0.97, max: 1.0,   step: 0.001, default: REFERENCE_PRESET.velDecay },
  { id: "brushForce", label: "Brush",                        group: "Simulation", min: 0.1,  max: 3.0,   step: 0.05,  default: REFERENCE_PRESET.brushForce },
  { id: "emitMode",   label: "Emit Mode  0=Orbit 1=Noise 2=Both", group: "Simulation", min: 0, max: 2, step: 1, default: REFERENCE_PRESET.emitMode },
  { id: "autoEmit",   label: "Orbit Strength",               group: "Simulation", min: 0,    max: 2.0,   step: 0.01,  default: REFERENCE_PRESET.autoEmit },
  { id: "noiseScale", label: "Noise Scale",                  group: "Simulation", min: 0.3,  max: 5.0,   step: 0.1,   default: REFERENCE_PRESET.noiseScale },
  { id: "noiseForce", label: "Noise Force",                  group: "Simulation", min: 0,    max: 2.0,   step: 0.05,  default: REFERENCE_PRESET.noiseForce },
  { id: "noiseDye",   label: "Noise Dye",                    group: "Simulation", min: 0,    max: 2.0,   step: 0.05,  default: REFERENCE_PRESET.noiseDye },
  { id: "brightness", label: "Bright",                       group: "Display",    min: 0.3,  max: 3.0,   step: 0.01,  default: REFERENCE_PRESET.brightness },
  { id: "saturation", label: "Sat",                          group: "Display",    min: 0.3,  max: 1.5,   step: 0.01,  default: REFERENCE_PRESET.saturation },
  { id: "hue1",       label: "Hue 1",                        group: "Colors",     min: 0,    max: 360,   step: 1,     default: REFERENCE_PRESET.hue1 },
  { id: "hue2",       label: "Hue 2",                        group: "Colors",     min: 0,    max: 360,   step: 1,     default: REFERENCE_PRESET.hue2 },
  { id: "hue3",       label: "Hue 3",                        group: "Colors",     min: 0,    max: 360,   step: 1,     default: REFERENCE_PRESET.hue3 },
];

const params = {};
controlSchema.forEach((cfg) => { params[cfg.id] = cfg.default; });

let paused    = false;
let elapsed   = 0;
let lastTs    = performance.now() * 0.001;
let pendingPreview  = true;
let previewCooldown = 0;
let bridge = null;
const history = { undoStack: [], redoStack: [], limit: 140, suppress: false };

// ─── THREE.js setup ───────────────────────────────────────────────────────────
const app = document.getElementById("app");
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); // sim doesn't benefit from HiDPI
renderer.setSize(window.innerWidth, window.innerHeight);
const legacyCanvas = document.getElementById("fx");
if (legacyCanvas) legacyCanvas.remove();
app.prepend(renderer.domElement);

const camera  = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const simScene = new THREE.Scene();
const quadGeo  = new THREE.PlaneGeometry(2, 2);
const quadMesh = new THREE.Mesh(quadGeo);
simScene.add(quadMesh);

// ─── Render target factory ────────────────────────────────────────────────────
function mkRT(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    minFilter:     THREE.LinearFilter,
    magFilter:     THREE.LinearFilter,
    type:          THREE.HalfFloatType,
    format:        THREE.RGBAFormat,
    wrapS:         THREE.ClampToEdgeWrapping,
    wrapT:         THREE.ClampToEdgeWrapping,
    depthBuffer:   false,
    stencilBuffer: false,
  });
}

// Simulation buffers (ping-pong pairs where needed)
const vel  = [mkRT(W0, H0), mkRT(W0, H0)]; // velocity  (RG used)
const dye  = [mkRT(W0, H0), mkRT(W0, H0)]; // dye color (RGB used)
const divRT = mkRT(W0, H0);                 // divergence (R)
const curlRT = mkRT(W0, H0);               // vorticity  (R)

// Multigrid pressure: 3 levels × 2 ping-pong targets
const prs = [
  [mkRT(W0, H0), mkRT(W0, H0)],
  [mkRT(W1, H1), mkRT(W1, H1)],
  [mkRT(W2, H2), mkRT(W2, H2)],
];
// Restricted RHS at coarser levels
const rhs1 = mkRT(W1, H1);
const rhs2 = mkRT(W2, H2);

let velIdx = 0;
let dyeIdx = 0;

// ─── GLSL shaders ─────────────────────────────────────────────────────────────
const VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Wipe to zero
const CLEAR_FRAG = `
  precision highp float;
  void main(){ gl_FragColor = vec4(0.0); }
`;

// Full-canvas dye fill: paints the entire buffer with a rich FBM color field.
// Called ONCE at init (and on reset). This is the "paint the canvas" step —
// the fluid then deforms this existing color rather than injecting from points.
// Three independent FBM domains → three large hue territories covering the whole canvas.
const FILL_DYE_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform float u_seed;
  uniform float u_scale;
  uniform vec3  u_col0;
  uniform vec3  u_col1;
  uniform vec3  u_col2;
  // Gradient noise
  vec2 _nh(vec2 p){
    p=fract(p*vec2(127.1,311.7)); p+=dot(p,p.yx+19.19);
    return normalize(fract(vec2(p.x*p.y*95.4337,p.x*p.y*97.597))*2.-1.);
  }
  float _gn(vec2 p){
    vec2 i=floor(p),f=fract(p);
    vec2 u=f*f*f*(f*(f*6.-15.)+10.);
    float a=dot(_nh(i),f),b=dot(_nh(i+vec2(1,0)),f-vec2(1,0)),
          c=dot(_nh(i+vec2(0,1)),f-vec2(0,1)),d=dot(_nh(i+vec2(1,1)),f-vec2(1,1));
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }
  float fbm(vec2 p){
    float v=0.,amp=0.5;
    mat2 r=mat2(1.7,-1.1,1.1,1.7);
    for(int i=0;i<5;i++){v+=amp*(_gn(p)*0.5+0.5);p=r*p;amp*=0.5;}
    return clamp(v,0.,1.);
  }
  void main(){
    vec2 p0=(vUv+vec2(u_seed*0.137, u_seed*0.271))*u_scale;
    vec2 p1=(vUv+vec2(9.7+u_seed*0.093, 5.3-u_seed*0.182))*u_scale;
    vec2 p2=(vUv+vec2(19.3-u_seed*0.211, -11.7+u_seed*0.154))*u_scale;
    float n0=fbm(p0), n1=fbm(p1), n2=fbm(p2);
    // Softmax-style competitive weighting: each territory owns regions where it peaks
    float e0=exp(n0*5.), e1=exp(n1*5.), e2=exp(n2*5.);
    float wsum=e0+e1+e2;
    vec3 col=(u_col0*(e0/wsum)+u_col1*(e1/wsum)+u_col2*(e2/wsum));
    // Multiply by max to keep dark regions truly dark
    float brightness=max(n0,max(n1,n2));
    brightness=pow(brightness,0.7); // gamma lift so mid-tones fill in nicely
    gl_FragColor=vec4(col*brightness,1.);
  }
`;

// Semi-Lagrangian advection. Velocity stored in "texels/frame" units.
// Back-trace: src = vUv - vel * texelSize (vel in texels → texelSize converts to UV).
const ADVECT_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_qty;
  uniform sampler2D u_vel;
  uniform vec2  u_ts;    // 1/resolution of simulation grid
  uniform float u_decay;
  void main(){
    vec2 v = texture2D(u_vel, vUv).xy;
    vec2 src = clamp(vUv - v * u_ts, u_ts, 1.0 - u_ts);
    gl_FragColor = texture2D(u_qty, src) * u_decay;
  }
`;

// Gaussian velocity splat at mouse/emitter position
const SPLAT_VEL_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_base;
  uniform vec2  u_pos;
  uniform vec2  u_force;  // pixels/frame to inject
  uniform float u_radius; // Gaussian variance (UV²)
  uniform float u_aspect; // width/height
  void main(){
    vec2 p = vUv - u_pos;
    p.x *= u_aspect;
    float g = exp(-dot(p,p) / u_radius);
    vec2 v = texture2D(u_base, vUv).xy;
    gl_FragColor = vec4(v + g * u_force, 0.0, 1.0);
  }
`;

// Gaussian dye splat
const SPLAT_DYE_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_base;
  uniform vec2  u_pos;
  uniform vec3  u_color;
  uniform float u_radius;
  uniform float u_aspect;
  void main(){
    vec2 p = vUv - u_pos;
    p.x *= u_aspect;
    float g = exp(-dot(p,p) / u_radius);
    vec3 c = texture2D(u_base, vUv).rgb;
    gl_FragColor = vec4(c + g * u_color, 1.0);
  }
`;

// Discrete divergence: ∇·u ≈ 0.5*(uR-uL + vT-vB) [texels/frame]
const DIV_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_vel;
  uniform vec2 u_ts;
  void main(){
    float L = texture2D(u_vel, vUv - vec2(u_ts.x, 0.0)).x;
    float R = texture2D(u_vel, vUv + vec2(u_ts.x, 0.0)).x;
    float B = texture2D(u_vel, vUv - vec2(0.0, u_ts.y)).y;
    float T = texture2D(u_vel, vUv + vec2(0.0, u_ts.y)).y;
    gl_FragColor = vec4(0.5*(R - L + T - B), 0.0, 0.0, 1.0);
  }
`;

// Jacobi iteration: solve ∇²p = div(vel) → p = (pL+pR+pB+pT - div) / 4
// Works at any multigrid level — just change u_ts to match that level's texelSize.
const JACOBI_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_prs;
  uniform sampler2D u_div;
  uniform vec2 u_ts;
  void main(){
    float pL = texture2D(u_prs, vUv - vec2(u_ts.x, 0.0)).r;
    float pR = texture2D(u_prs, vUv + vec2(u_ts.x, 0.0)).r;
    float pB = texture2D(u_prs, vUv - vec2(0.0, u_ts.y)).r;
    float pT = texture2D(u_prs, vUv + vec2(0.0, u_ts.y)).r;
    float d  = texture2D(u_div, vUv).r;
    gl_FragColor = vec4((pL + pR + pB + pT - d) * 0.25, 0.0, 0.0, 1.0);
  }
`;

// Restrict: downsample a scalar field to half resolution (2×2 box filter).
// Render to the COARSER target; u_srcTs is texelSize of the FINER source.
const RESTRICT_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_src;
  uniform vec2 u_srcTs; // 1/resolution of source (fine level)
  void main(){
    float a = texture2D(u_src, vUv + u_srcTs*vec2(-0.5,-0.5)).r;
    float b = texture2D(u_src, vUv + u_srcTs*vec2( 0.5,-0.5)).r;
    float c = texture2D(u_src, vUv + u_srcTs*vec2(-0.5, 0.5)).r;
    float d = texture2D(u_src, vUv + u_srcTs*vec2( 0.5, 0.5)).r;
    gl_FragColor = vec4((a+b+c+d)*0.25, 0.0, 0.0, 1.0);
  }
`;

// Prolongate (correction): fine_new = fine_existing + bilinear(coarse).
// The hardware bilinear filter on u_coarse handles the upsample automatically.
const PROLONG_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_coarse;
  uniform sampler2D u_fine;
  void main(){
    float c = texture2D(u_coarse, vUv).r; // bilinear upsample via texture filter
    float f = texture2D(u_fine,   vUv).r;
    gl_FragColor = vec4(f + c, 0.0, 0.0, 1.0);
  }
`;

// Project: subtract pressure gradient from velocity → makes flow divergence-free
const GRADIENT_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_vel;
  uniform sampler2D u_prs;
  uniform vec2 u_ts;
  void main(){
    float pL = texture2D(u_prs, vUv - vec2(u_ts.x, 0.0)).r;
    float pR = texture2D(u_prs, vUv + vec2(u_ts.x, 0.0)).r;
    float pB = texture2D(u_prs, vUv - vec2(0.0, u_ts.y)).r;
    float pT = texture2D(u_prs, vUv + vec2(0.0, u_ts.y)).r;
    vec2  v  = texture2D(u_vel, vUv).xy;
    v -= 0.5 * vec2(pR - pL, pT - pB);
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`;

// Curl (vorticity) of 2D velocity field: ω = ∂v/∂x - ∂u/∂y
const CURL_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_vel;
  uniform vec2 u_ts;
  void main(){
    float vL = texture2D(u_vel, vUv - vec2(u_ts.x, 0.0)).y;
    float vR = texture2D(u_vel, vUv + vec2(u_ts.x, 0.0)).y;
    float uB = texture2D(u_vel, vUv - vec2(0.0, u_ts.y)).x;
    float uT = texture2D(u_vel, vUv + vec2(0.0, u_ts.y)).x;
    gl_FragColor = vec4(0.5*(vR - vL) - 0.5*(uT - uB), 0.0, 0.0, 1.0);
  }
`;

// Vorticity confinement: re-inject rotational energy back into velocity.
// Prevents numerical diffusion from killing fine-scale swirls.
const VCONF_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_vel;
  uniform sampler2D u_curl;
  uniform vec2  u_ts;
  uniform float u_strength;
  void main(){
    float cL = abs(texture2D(u_curl, vUv - vec2(u_ts.x, 0.0)).r);
    float cR = abs(texture2D(u_curl, vUv + vec2(u_ts.x, 0.0)).r);
    float cB = abs(texture2D(u_curl, vUv - vec2(0.0, u_ts.y)).r);
    float cT = abs(texture2D(u_curl, vUv + vec2(0.0, u_ts.y)).r);
    float w  = texture2D(u_curl, vUv).r;
    vec2 N = vec2(cT - cB, cR - cL);       // gradient of |curl|
    N /= length(N) + 1e-5;                 // normalize
    vec2 v = texture2D(u_vel, vUv).xy;
    v += N * w * u_strength;               // push along curl gradient
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`;

// Final display: tonemap + saturation + soft vignette
const DISPLAY_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_dye;
  uniform float u_bright;
  uniform float u_sat;
  void main(){
    vec3 c = texture2D(u_dye, vUv).rgb;
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(lum), c, u_sat);
    c = c * u_bright / (1.0 + length(c) * 0.38); // filmic tonemap
    vec2 q = vUv * 2.0 - 1.0;
    float vig = 1.0 - 0.44 * dot(q, q);
    gl_FragColor = vec4(c * vig, 1.0);
  }
`;

// ─── Noise-driven shaders ─────────────────────────────────────────────────────
// Shared FBM helpers (inlined in both shaders — GLSL has no includes)
const NOISE_GLSL_HELPERS = `
  // Gradient noise with quintic interpolation
  vec2 _nh(vec2 p){
    p=fract(p*vec2(127.1,311.7));
    p+=dot(p,p.yx+19.19);
    return normalize(fract(vec2(p.x*p.y*95.4337,p.x*p.y*97.597))*2.-1.);
  }
  float _gn(vec2 p){
    vec2 i=floor(p),f=fract(p);
    vec2 u=f*f*f*(f*(f*6.-15.)+10.);
    float a=dot(_nh(i),f),b=dot(_nh(i+vec2(1,0)),f-vec2(1,0)),
          c=dot(_nh(i+vec2(0,1)),f-vec2(0,1)),d=dot(_nh(i+vec2(1,1)),f-vec2(1,1));
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }
  // FBM potential: 5 octaves, each rotated + scaled. Returns scalar in ~[-0.5,0.5].
  float _fbmPot(vec2 p,float t){
    float v=0.,amp=0.5;
    mat2 r=mat2(1.7,-1.1,1.1,1.7);
    for(int i=0;i<5;i++){ v+=amp*_gn(p+t*(0.08+float(i)*0.02)); p=r*p; amp*=0.5; }
    return v;
  }
  // FBM value 0→1: 4 octaves
  float _fbmV(vec2 p,float t){
    float v=0.,amp=0.5;
    mat2 r=mat2(1.7,-1.1,1.1,1.7);
    for(int i=0;i<4;i++){ v+=amp*(_gn(p+t*(0.05+float(i)*0.03))*0.5+0.5); p=r*p; amp*=0.5; }
    return clamp(v,0.,1.);
  }
`;

// Curl-of-noise body force: adds divergence-free noise-driven velocity to existing vel field.
// The curl of a scalar potential ψ = FBM(x,y,t) is guaranteed divergence-free:
//   F = curl(ψ) = (∂ψ/∂y, -∂ψ/∂x)  → computed via central finite differences.
const NOISE_FORCE_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_vel;
  uniform float u_time;
  uniform float u_scale;
  uniform float u_strength;
  ${NOISE_GLSL_HELPERS}
  void main(){
    float eps=0.003;
    vec2 p=vUv*u_scale;
    float t=u_time*0.38;
    float pR=_fbmPot(p+vec2(eps,0.),t);
    float pL=_fbmPot(p-vec2(eps,0.),t);
    float pT=_fbmPot(p+vec2(0.,eps),t);
    float pB=_fbmPot(p-vec2(0.,eps),t);
    // (∂ψ/∂y, -∂ψ/∂x) in texels/frame via u_strength scale factor
    vec2 cf=(vec2(pT-pB,pL-pR)/(2.*eps))*u_strength*80.;
    gl_FragColor=vec4(texture2D(u_vel,vUv).xy+cf,0.,1.);
  }
`;

// Noise-seeded dye: each frame trickle a tiny amount of color where the noise is bright.
// Three independent FBM layers, each mapped to one of the three user hues, so territories
// evolve organically — NOT at fixed emitter points.
const NOISE_DYE_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_dye;
  uniform float u_time;
  uniform float u_scale;
  uniform float u_strength;
  uniform vec3  u_col0;
  uniform vec3  u_col1;
  uniform vec3  u_col2;
  ${NOISE_GLSL_HELPERS}
  void main(){
    vec2 p=vUv*u_scale;
    float t=u_time*0.14; // slow drift so noise structure stays readable

    // Large offsets in p-space → genuinely independent spatial territories.
    // At default scale 1.8, offset 9.7 puts layer 1 far outside layer 0's domain.
    float n0=_fbmV(p+vec2(0.0,  0.0),  t);
    float n1=_fbmV(p+vec2(9.7,  5.3),  t);
    float n2=_fbmV(p+vec2(19.3,-11.7), t);

    // Higher threshold (0.46) + steeper pow → distinct bright blobs with genuine dark gaps.
    float d0=pow(max(0.,n0-0.46)*1.85,2.4);
    float d1=pow(max(0.,n1-0.46)*1.85,2.4);
    float d2=pow(max(0.,n2-0.46)*1.85,2.4);

    // Competitive color mixing: winner-takes-most so each region has ONE dominant hue.
    // Raising weights to power 3 before normalising sharpens the competition.
    float e0=d0*d0*d0, e1=d1*d1*d1, e2=d2*d2*d2;
    float wsum=e0+e1+e2+1e-7;
    vec3 domCol=(u_col0*(e0/wsum)+u_col1*(e1/wsum)+u_col2*(e2/wsum));
    // Overall intensity from the brightest blob present at this texel
    float intensity=max(d0,max(d1,d2));
    vec3 seed=domCol*intensity;
    gl_FragColor=vec4(texture2D(u_dye,vUv).rgb+seed*u_strength*0.022,1.);
  }
`;

// ─── Material factory + instances ────────────────────────────────────────────
function mkMat(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms });
}

const ts0 = new THREE.Vector2(1 / W0, 1 / H0);
const ts1 = new THREE.Vector2(1 / W1, 1 / H1);
const ts2 = new THREE.Vector2(1 / W2, 1 / H2);

const clearMat = mkMat(CLEAR_FRAG, {});

const advectMat = mkMat(ADVECT_FRAG, {
  u_qty:   { value: null },
  u_vel:   { value: null },
  u_ts:    { value: ts0.clone() },
  u_decay: { value: 1.0 },
});

const splatVelMat = mkMat(SPLAT_VEL_FRAG, {
  u_base:   { value: null },
  u_pos:    { value: new THREE.Vector2() },
  u_force:  { value: new THREE.Vector2() },
  u_radius: { value: 0.0002 },
  u_aspect: { value: 1.0 },
});

const splatDyeMat = mkMat(SPLAT_DYE_FRAG, {
  u_base:   { value: null },
  u_pos:    { value: new THREE.Vector2() },
  u_color:  { value: new THREE.Vector3() },
  u_radius: { value: 0.0002 },
  u_aspect: { value: 1.0 },
});

const divMat = mkMat(DIV_FRAG, {
  u_vel: { value: null },
  u_ts:  { value: ts0.clone() },
});

const jacobiMat = mkMat(JACOBI_FRAG, {
  u_prs: { value: null },
  u_div: { value: null },
  u_ts:  { value: ts0.clone() },
});

const restrictMat = mkMat(RESTRICT_FRAG, {
  u_src:   { value: null },
  u_srcTs: { value: ts0.clone() },
});

const prolongMat = mkMat(PROLONG_FRAG, {
  u_coarse: { value: null },
  u_fine:   { value: null },
});

const gradientMat = mkMat(GRADIENT_FRAG, {
  u_vel: { value: null },
  u_prs: { value: null },
  u_ts:  { value: ts0.clone() },
});

const curlMat = mkMat(CURL_FRAG, {
  u_vel: { value: null },
  u_ts:  { value: ts0.clone() },
});

const vconfMat = mkMat(VCONF_FRAG, {
  u_vel:      { value: null },
  u_curl:     { value: null },
  u_ts:       { value: ts0.clone() },
  u_strength: { value: params.vorticity * 0.001 },
});

const displayMat = mkMat(DISPLAY_FRAG, {
  u_dye:   { value: null },
  u_bright: { value: params.brightness },
  u_sat:    { value: params.saturation },
});

const noiseForceMat = mkMat(NOISE_FORCE_FRAG, {
  u_vel:      { value: null },
  u_time:     { value: 0.0 },
  u_scale:    { value: params.noiseScale },
  u_strength: { value: params.noiseForce },
});

const noiseDyeMat = mkMat(NOISE_DYE_FRAG, {
  u_dye:      { value: null },
  u_time:     { value: 0.0 },
  u_scale:    { value: params.noiseScale },
  u_strength: { value: params.noiseDye },
  u_col0:     { value: new THREE.Vector3() },
  u_col1:     { value: new THREE.Vector3() },
  u_col2:     { value: new THREE.Vector3() },
});

const fillDyeMat = mkMat(FILL_DYE_FRAG, {
  u_seed:  { value: 0.0 },
  u_scale: { value: 2.2 },
  u_col0:  { value: new THREE.Vector3() },
  u_col1:  { value: new THREE.Vector3() },
  u_col2:  { value: new THREE.Vector3() },
});

// ─── Blit helper: render material to target ───────────────────────────────────
function blit(mat, target) {
  quadMesh.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(simScene, camera);
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function hsvToVec3(h, s, v) {
  h = ((h % 360) + 360) % 360 / 360;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const lut = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]];
  const [r, g, b] = lut[i % 6];
  return new THREE.Vector3(r, g, b);
}
function getColors() {
  return [
    hsvToVec3(params.hue1, 0.90, 1.0),
    hsvToVec3(params.hue2, 0.90, 1.0),
    hsvToVec3(params.hue3, 0.90, 1.0),
  ];
}

// ─── Mouse / touch tracking ───────────────────────────────────────────────────
const mouse = { x: 0.5, y: 0.5, dx: 0, dy: 0, down: false, colorIdx: 0 };
const cv = renderer.domElement;

function onMove(cx, cy) {
  const px = mouse.x, py = mouse.y;
  mouse.x  = cx / cv.offsetWidth;
  mouse.y  = 1.0 - cy / cv.offsetHeight;
  mouse.dx = mouse.x - px;
  mouse.dy = mouse.y - py;
}
cv.addEventListener("mousemove",  (e) => onMove(e.clientX, e.clientY));
cv.addEventListener("mousedown",  () => { mouse.down = true; mouse.colorIdx = (mouse.colorIdx + 1) % 3; });
cv.addEventListener("mouseup",    () => { mouse.down = false; mouse.dx = mouse.dy = 0; });
cv.addEventListener("mouseleave", () => { mouse.down = false; mouse.dx = mouse.dy = 0; });
cv.addEventListener("touchmove",  (e) => { e.preventDefault(); const t = e.touches[0]; mouse.down = true; onMove(t.clientX, t.clientY); }, { passive: false });
cv.addEventListener("touchend",   () => { mouse.down = false; });

// ─── Simulation pipeline ──────────────────────────────────────────────────────
function splat(pos, force, color, radius) {
  const aspect = cv.offsetWidth / Math.max(cv.offsetHeight, 1);

  // Inject velocity
  splatVelMat.uniforms.u_base.value   = vel[velIdx].texture;
  splatVelMat.uniforms.u_pos.value.copy(pos);
  splatVelMat.uniforms.u_force.value.copy(force);
  splatVelMat.uniforms.u_radius.value = radius;
  splatVelMat.uniforms.u_aspect.value = aspect;
  blit(splatVelMat, vel[1 - velIdx]);
  velIdx = 1 - velIdx;

  // Inject dye
  splatDyeMat.uniforms.u_base.value   = dye[dyeIdx].texture;
  splatDyeMat.uniforms.u_pos.value.copy(pos);
  splatDyeMat.uniforms.u_color.value.copy(color);
  splatDyeMat.uniforms.u_radius.value = radius * 2.5; // dye spreads wider than velocity
  splatDyeMat.uniforms.u_aspect.value = aspect;
  blit(splatDyeMat, dye[1 - dyeIdx]);
  dyeIdx = 1 - dyeIdx;
}

// One full multigrid V-cycle to solve ∇²p = div(vel)
// Algorithm: restrict div to coarser levels, solve coarsest, prolong corrections upward.
function multigridPressure() {
  // Step 1: compute divergence at L0
  divMat.uniforms.u_vel.value = vel[velIdx].texture;
  divMat.uniforms.u_ts.value.copy(ts0);
  blit(divMat, divRT);

  // Step 2: restrict RHS to coarser levels
  restrictMat.uniforms.u_src.value   = divRT.texture;
  restrictMat.uniforms.u_srcTs.value.copy(ts0);
  blit(restrictMat, rhs1);

  restrictMat.uniforms.u_src.value   = rhs1.texture;
  restrictMat.uniforms.u_srcTs.value.copy(ts1);
  blit(restrictMat, rhs2);

  // Step 3: solve at L2 (coarsest — 8 Jacobi iterations from zero)
  blit(clearMat, prs[2][0]);
  for (let i = 0; i < 8; i++) {
    // src alternates 0→1→0→... ; after 8 iters (even) result lands in prs[2][0]
    const s = i % 2, d = 1 - s;
    jacobiMat.uniforms.u_prs.value = prs[2][s].texture;
    jacobiMat.uniforms.u_div.value = rhs2.texture;
    jacobiMat.uniforms.u_ts.value.copy(ts2);
    blit(jacobiMat, prs[2][d]);
  }
  // After 8 iters, last write went to prs[2][1] (iter 7: s=1,d=0 → wait, iter 7: i%2=1, s=1,d=0)
  // Hmm let me be explicit: iter 0: s=0,d=1; iter1: s=1,d=0; ... iter7: s=1,d=0 → result in prs[2][0]
  // Result is in prs[2][0] ✓

  // Step 4: prolongate L2 solution → initial guess for L1
  blit(clearMat, prs[1][0]); // clear fine buffer to use as base for prolongation
  prolongMat.uniforms.u_coarse.value = prs[2][0].texture;
  prolongMat.uniforms.u_fine.value   = prs[1][0].texture; // currently zero
  blit(prolongMat, prs[1][1]); // fine + upsampled coarse → prs[1][1]

  // Step 5: smooth at L1 (4 Jacobi iters, starting from good initial guess prs[1][1])
  // i=0: s=1,d=0; i=1: s=0,d=1; i=2: s=1,d=0; i=3: s=0,d=1 → result in prs[1][1]
  for (let i = 0; i < 4; i++) {
    const s = 1 - (i % 2), d = i % 2;
    jacobiMat.uniforms.u_prs.value = prs[1][s].texture;
    jacobiMat.uniforms.u_div.value = rhs1.texture;
    jacobiMat.uniforms.u_ts.value.copy(ts1);
    blit(jacobiMat, prs[1][d]);
  }
  // Result in prs[1][1] ✓  (i=3: d=1)

  // Step 6: prolongate L1 solution → initial guess for L0
  blit(clearMat, prs[0][0]);
  prolongMat.uniforms.u_coarse.value = prs[1][1].texture;
  prolongMat.uniforms.u_fine.value   = prs[0][0].texture;
  blit(prolongMat, prs[0][1]); // prs[0][1] = 0 + upsampled L1

  // Step 7: smooth at L0 (4 Jacobi iters, starting from prs[0][1])
  // i=0: s=1,d=0; i=1: s=0,d=1; i=2: s=1,d=0; i=3: s=0,d=1 → result in prs[0][1]
  for (let i = 0; i < 4; i++) {
    const s = 1 - (i % 2), d = i % 2;
    jacobiMat.uniforms.u_prs.value = prs[0][s].texture;
    jacobiMat.uniforms.u_div.value = divRT.texture;
    jacobiMat.uniforms.u_ts.value.copy(ts0);
    blit(jacobiMat, prs[0][d]);
  }
  // Result in prs[0][1] ✓

  // Step 8: project — subtract ∇p from velocity
  gradientMat.uniforms.u_vel.value = vel[velIdx].texture;
  gradientMat.uniforms.u_prs.value = prs[0][1].texture;
  gradientMat.uniforms.u_ts.value.copy(ts0);
  blit(gradientMat, vel[1 - velIdx]);
  velIdx = 1 - velIdx;
}

function simStep(dt) {
  const aspect = cv.offsetWidth / Math.max(cv.offsetHeight, 1);
  // scale speed: params.speed adjusts effective dt
  const simDt  = dt * params.speed;

  // 1. MOUSE / TOUCH SPLAT
  if (mouse.down || Math.hypot(mouse.dx, mouse.dy) > 1e-5) {
    // Convert UV delta to "texel/frame" velocity, scaled by brush strength
    const fx = mouse.dx * W0 * params.brushForce * 12.0;
    const fy = mouse.dy * H0 * params.brushForce * 12.0;
    const colors = getColors();
    if (mouse.down) {
      splat(
        new THREE.Vector2(mouse.x, mouse.y),
        new THREE.Vector2(fx, fy),
        colors[mouse.colorIdx].clone().multiplyScalar(0.9),
        0.00018
      );
    } else {
      // hover (no button): inject velocity only
      splatVelMat.uniforms.u_base.value   = vel[velIdx].texture;
      splatVelMat.uniforms.u_pos.value.set(mouse.x, mouse.y);
      splatVelMat.uniforms.u_force.value.set(fx, fy);
      splatVelMat.uniforms.u_radius.value = 0.00018;
      splatVelMat.uniforms.u_aspect.value = aspect;
      blit(splatVelMat, vel[1 - velIdx]);
      velIdx = 1 - velIdx;
    }
    mouse.dx = mouse.dy = 0;
  }

  // 2. EMITTERS — orbit points (mode 0 or 2) and/or full-domain noise field (mode 1 or 2)
  const emitMode = Math.round(params.emitMode); // 0=orbit, 1=noise, 2=both

  if ((emitMode === 0 || emitMode === 2) && params.autoEmit > 0.01) {
    const colors = getColors();
    const numE = 3;
    for (let i = 0; i < numE; i++) {
      const omega  = 0.28 + i * 0.09;
      const angle  = elapsed * omega + i * (Math.PI * 2 / numE);
      const radius = 0.20 + 0.07 * Math.sin(elapsed * 0.17 + i * 2.1);
      const ax = 0.5 + Math.cos(angle) * radius;
      const ay = 0.5 + Math.sin(angle) * radius;
      const vx = -Math.sin(angle) * radius * omega * W0 * params.autoEmit * 0.85;
      const vy =  Math.cos(angle) * radius * omega * H0 * params.autoEmit * 0.85;
      splat(
        new THREE.Vector2(ax, ay),
        new THREE.Vector2(vx, vy),
        colors[i].clone().multiplyScalar(params.autoEmit * 0.55),
        0.00014
      );
    }
  }

  // 2b. NOISE BODY FORCE + NOISE DYE SEEDING (mode 1 or 2)
  if (emitMode === 1 || emitMode === 2) {
    // Apply curl-of-noise force to velocity field
    noiseForceMat.uniforms.u_vel.value      = vel[velIdx].texture;
    noiseForceMat.uniforms.u_time.value     = elapsed;
    noiseForceMat.uniforms.u_scale.value    = params.noiseScale;
    noiseForceMat.uniforms.u_strength.value = params.noiseForce;
    blit(noiseForceMat, vel[1 - velIdx]);
    velIdx = 1 - velIdx;

    // Seed dye from noise color territories
    const nColors = getColors();
    noiseDyeMat.uniforms.u_dye.value      = dye[dyeIdx].texture;
    noiseDyeMat.uniforms.u_time.value     = elapsed;
    noiseDyeMat.uniforms.u_scale.value    = params.noiseScale;
    noiseDyeMat.uniforms.u_strength.value = params.noiseDye;
    noiseDyeMat.uniforms.u_col0.value.copy(nColors[0]);
    noiseDyeMat.uniforms.u_col1.value.copy(nColors[1]);
    noiseDyeMat.uniforms.u_col2.value.copy(nColors[2]);
    blit(noiseDyeMat, dye[1 - dyeIdx]);
    dyeIdx = 1 - dyeIdx;
  }

  // 3. VORTICITY CONFINEMENT (before advection)
  curlMat.uniforms.u_vel.value = vel[velIdx].texture;
  curlMat.uniforms.u_ts.value.copy(ts0);
  blit(curlMat, curlRT);

  vconfMat.uniforms.u_vel.value      = vel[velIdx].texture;
  vconfMat.uniforms.u_curl.value     = curlRT.texture;
  vconfMat.uniforms.u_ts.value.copy(ts0);
  vconfMat.uniforms.u_strength.value = params.vorticity * 0.0015;
  blit(vconfMat, vel[1 - velIdx]);
  velIdx = 1 - velIdx;

  // 4. ADVECT VELOCITY
  advectMat.uniforms.u_qty.value   = vel[velIdx].texture;
  advectMat.uniforms.u_vel.value   = vel[velIdx].texture;
  advectMat.uniforms.u_ts.value.copy(ts0);
  advectMat.uniforms.u_decay.value = Math.pow(params.velDecay, simDt * 60); // frame-rate independent
  blit(advectMat, vel[1 - velIdx]);
  velIdx = 1 - velIdx;

  // 5. MULTIGRID PRESSURE SOLVE + PROJECTION
  multigridPressure();

  // 6. ADVECT DYE
  advectMat.uniforms.u_qty.value   = dye[dyeIdx].texture;
  advectMat.uniforms.u_vel.value   = vel[velIdx].texture;
  advectMat.uniforms.u_ts.value.copy(ts0);
  advectMat.uniforms.u_decay.value = Math.pow(params.dyeDecay, simDt * 60);
  blit(advectMat, dye[1 - dyeIdx]);
  dyeIdx = 1 - dyeIdx;
}

// ─── Initialize: clear all buffers + a few seed splats ────────────────────────
function initSim() {
  [vel[0], vel[1], dye[0], dye[1], divRT, curlRT,
   prs[0][0], prs[0][1], prs[1][0], prs[1][1], prs[2][0], prs[2][1],
   rhs1, rhs2].forEach((rt) => blit(clearMat, rt));
  velIdx = dyeIdx = 0;

  // Fill entire dye buffer with a rich full-canvas color field.
  // The fluid will then deform this existing paint — not inject new blobs.
  const colors = getColors();
  const seed = Math.random() * 100.0;
  fillDyeMat.uniforms.u_seed.value  = seed;
  fillDyeMat.uniforms.u_scale.value = Math.max(0.5, params.noiseScale * 1.1);
  fillDyeMat.uniforms.u_col0.value.copy(colors[0]);
  fillDyeMat.uniforms.u_col1.value.copy(colors[1]);
  fillDyeMat.uniforms.u_col2.value.copy(colors[2]);
  blit(fillDyeMat, dye[0]);

  // Seed initial velocity turbulence with 4 opposing force splats so fluid
  // starts stretching the color immediately.
  const seeds = [
    { pos: [0.35, 0.5],  force: [40,  20] },
    { pos: [0.65, 0.5],  force: [-40, 20] },
    { pos: [0.5,  0.35], force: [20, -40] },
    { pos: [0.5,  0.65], force: [-20, 40] },
  ];
  seeds.forEach(({ pos, force }) => {
    splatVelMat.uniforms.u_base.value   = vel[velIdx].texture;
    splatVelMat.uniforms.u_pos.value.set(pos[0], pos[1]);
    splatVelMat.uniforms.u_force.value.set(force[0], force[1]);
    splatVelMat.uniforms.u_radius.value = 0.0004;
    splatVelMat.uniforms.u_aspect.value = 1.0;
    blit(splatVelMat, vel[1 - velIdx]);
    velIdx = 1 - velIdx;
  });

  renderer.setRenderTarget(null);
}

// ─── Render frame ─────────────────────────────────────────────────────────────
function renderFrame(dt) {
  if (!paused) simStep(dt);
  renderer.setRenderTarget(null);
  displayMat.uniforms.u_dye.value    = dye[dyeIdx].texture;
  displayMat.uniforms.u_bright.value = params.brightness;
  displayMat.uniforms.u_sat.value    = params.saturation;
  quadMesh.material = displayMat;
  renderer.render(simScene, camera);
}

function sendPreview() {
  renderFrame(0);
  const image = renderer.domElement.toDataURL("image/jpeg", 0.8);
  window.parent.postMessage({ type: "shaderops/preview", projectId: PROJECT_ID, image }, "*");
}

// ─── Param sync helpers ───────────────────────────────────────────────────────
function applyParams() {
  // (uniforms updated per-frame inside simStep/renderFrame as needed)
  pendingPreview = true;
}

function snapshotState()  { return JSON.stringify({ params: { ...params }, paused }); }
function pushHistory(snap) {
  if (history.suppress) return;
  const s = snap ?? snapshotState();
  if (history.undoStack[history.undoStack.length - 1] === s) return;
  history.undoStack.push(s);
  if (history.undoStack.length > history.limit) history.undoStack.shift();
  history.redoStack.length = 0;
}
function applySnapshot(snap) {
  try {
    const st = JSON.parse(snap);
    history.suppress = true;
    if (st.params) Object.keys(st.params).forEach((k) => { if (params[k] !== undefined) params[k] = Number(st.params[k]); });
    if (typeof st.paused === "boolean") paused = st.paused;
    applyParams();
    bridge?.notifyValuesChanged();
  } catch {}
  finally { history.suppress = false; }
}
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
  pushHistory();
  controlSchema.forEach((cfg) => {
    const v = cfg.min + Math.random() * (cfg.max - cfg.min);
    params[cfg.id] = Math.round(v / cfg.step) * cfg.step;
  });
  initSim(); // re-seed with new colors
  applyParams();
  bridge?.notifyValuesChanged();
}
function togglePause() {
  pushHistory(); paused = !paused;
  bridge?.notifyValuesChanged();
}
function resetSim() {
  pushHistory(); initSim(); pendingPreview = true;
  bridge?.notifyValuesChanged();
}

// ─── Bridge integration ───────────────────────────────────────────────────────
history.suppress = true;
bridge = window.ShaderOpsControls.init({
  projectId: PROJECT_ID,
  schema: controlSchema,
  params,
  extras: { paused },
  onParams: (_ids, nextParams, commit, prevValues) => {
    if (commit && !history.suppress) {
      const prior = JSON.stringify({ params: prevValues || params, paused });
      if (history.undoStack[history.undoStack.length - 1] !== prior) {
        history.undoStack.push(prior);
        if (history.undoStack.length > history.limit) history.undoStack.shift();
        history.redoStack.length = 0;
      }
    }
    Object.keys(nextParams).forEach((k) => {
      if (params[k] === undefined) return;
      const n = Number(nextParams[k]);
      if (Number.isFinite(n)) params[k] = n;
    });
    applyParams();
  },
  onExtras: (next) => {
    if (typeof next.paused === "boolean" && next.paused !== paused) {
      pushHistory(); paused = next.paused;
    }
  },
  actions: {
    randomizeAll,
    togglePause,
    resetSim,
    undo: undoHistory,
    redo: redoHistory,
  },
});
if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
history.suppress = false;
applyParams();

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  pendingPreview = true;
});
window.addEventListener("keydown", (e) => {
  if (!e.ctrlKey || e.altKey || e.metaKey || e.key.toLowerCase() !== "z") return;
  e.preventDefault();
  if (e.shiftKey) redoHistory(); else undoHistory();
});
window.addEventListener("message", (e) => {
  if (e.data?.type === "shaderops/request-preview") sendPreview();
});
window.addEventListener("beforeunload", () => sendPreview());

// ─── Animation loop ───────────────────────────────────────────────────────────
initSim();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() * 0.001;
  const dt  = Math.min(0.05, now - lastTs);
  lastTs = now;
  if (!paused) elapsed += dt;
  renderFrame(dt);
  previewCooldown += dt;
  if (pendingPreview && previewCooldown > 0.5) {
    pendingPreview = false;
    previewCooldown = 0;
    sendPreview();
  }
}

renderFrame(0);
sendPreview();
animate();
