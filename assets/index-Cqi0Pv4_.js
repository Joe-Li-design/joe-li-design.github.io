import*as T from"https://unpkg.com/three@0.180.0/build/three.module.js";(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))n(o);new MutationObserver(o=>{for(const i of o)if(i.type==="childList")for(const r of i.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&n(r)}).observe(document,{childList:!0,subtree:!0});function a(o){const i={};return o.integrity&&(i.integrity=o.integrity),o.referrerPolicy&&(i.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?i.credentials="include":o.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(o){if(o.ep)return;o.ep=!0;const i=a(o);fetch(o.href,i)}})();const kn=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`,X=`
  // Sine-free hash ("hash without sine", iq-style): avoids the precision collapse
  // that sin()-based hashes suffer once their input grows large (common once uTime
  // accumulates for more than a minute or so), which otherwise shows up as hard
  // square/grid-aligned block artifacts instead of smooth pseudo-random noise.
  float fxHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 fxHash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
  float fxNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = fxHash(i);
    float b = fxHash(i + vec2(1.0, 0.0));
    float c = fxHash(i + vec2(0.0, 1.0));
    float d = fxHash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  // Fractal/"cloud" noise: a handful of octaves of fxNoise summed at increasing frequency.
  float fxFbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * fxNoise(p);
      p *= 2.02;
      amp *= 0.5;
    }
    return v;
  }
  // Classic cellular/Voronoi field: distance from each texel to the nearest of 9
  // jittered lattice points, producing organic cell-like boundaries.
  float fxVoronoi(vec2 p) {
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float minDist = 1.5;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 point = fxHash2(ip + neighbor);
        vec2 diff = neighbor + point - fp;
        minDist = min(minDist, length(diff));
      }
    }
    return minDist;
  }
  // Ridged fbm: inverts each octave around its midpoint and sharpens it,
  // producing crisp mountain-ridge-like lines instead of smooth rolling hills.
  float fxRidged(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      float n = 1.0 - abs(fxNoise(p) * 2.0 - 1.0);
      v += amp * n * n;
      p *= 2.02;
      amp *= 0.5;
    }
    return v;
  }
  // Domain-warped fbm: the coordinate fed into the final fbm sample is itself
  // displaced by two independent fbm fields — the classic iq-style "domain
  // warping" that produces organic swirl/marble patterns.
  float fxDomainWarp(vec2 p) {
    vec2 q = vec2(fxFbm(p), fxFbm(p + vec2(5.2, 1.3)));
    vec2 r = vec2(fxFbm(p + 4.0 * q + vec2(1.7, 9.2)), fxFbm(p + 4.0 * q + vec2(8.3, 2.8)));
    return fxFbm(p + 4.0 * r);
  }
  // Turbulence: sum of absolute-value noise octaves (no sign cancellation),
  // giving a chaotic, higher-contrast field than standard fbm.
  float fxTurbulence(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * abs(fxNoise(p) * 2.0 - 1.0);
      p *= 2.02;
      amp *= 0.5;
    }
    return v;
  }
  // Single dispatcher shared by every filter that exposes a "Noise Type"
  // dropdown, so all noise-driven filters (UV Noise, UV Blur's synced fallback)
  // stay perfectly in sync on the same numeric type codes.
  // 0 value, 1 cloud(fbm), 2 voronoi, 3 ridged, 4 domain warp, 5 turbulence.
  float fxNoiseSample(vec2 p, float t) {
    if (t < 0.5) return fxNoise(p);
    else if (t < 1.5) return fxFbm(p);
    else if (t < 2.5) return fxVoronoi(p);
    else if (t < 3.5) return fxRidged(p);
    else if (t < 4.5) return fxDomainWarp(p);
    else return fxTurbulence(p);
  }
  // Returns the nearest Voronoi cell's lattice coordinate (.xy) plus a stable
  // per-cell random id (.z) — used to derive a constant offset per shard/cell
  // for geometric "shattered glass" style displacement.
  vec3 fxVoronoiCell(vec2 p) {
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float minDist = 1.5;
    vec2 bestCell = ip;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 point = fxHash2(ip + neighbor);
        vec2 diff = neighbor + point - fp;
        float d = length(diff);
        if (d < minDist) { minDist = d; bestCell = ip + neighbor; }
      }
    }
    return vec3(bestCell, fxHash(bestCell));
  }
`,Sn=[{value:"value",label:"Value"},{value:"cloud",label:"Cloud"},{value:"voronoi",label:"Voronoi"},{value:"ridged",label:"Ridged"},{value:"warp",label:"Domain Warp"},{value:"turbulence",label:"Turbulence"}],ni={value:0,cloud:1,voronoi:2,ridged:3,warp:4,turbulence:5};function ya(e){return ni[e]??1}const we=8,Cn=`
  #define FX_CURVE_MAX ${we}
  // Solves a cubic bezier's x(s) = t for parameter s via Newton-Raphson,
  // clamped each step to stay in [0,1] — the same technique browsers use
  // internally for CSS cubic-bezier() timing functions. Reliable as long as
  // the control-point x's are kept within [p0x, p3x] (monotonic in x), which
  // fxCurveEval guarantees by clamping before calling this.
  float fxCubicSolveX(float p0x, float c1x, float c2x, float p3x, float t) {
    float s = clamp(t, 0.0, 1.0);
    for (int i = 0; i < 8; i++) {
      float mt = 1.0 - s;
      float x = mt * mt * mt * p0x + 3.0 * mt * mt * s * c1x + 3.0 * mt * s * s * c2x + s * s * s * p3x - t;
      float d = 3.0 * mt * mt * (c1x - p0x) + 6.0 * mt * s * (c2x - c1x) + 3.0 * s * s * (p3x - c2x);
      if (abs(d) < 1e-6) break;
      s = clamp(s - x / d, 0.0, 1.0);
    }
    return s;
  }
  float fxCurveEval(float t, vec4 pts[FX_CURVE_MAX], vec4 tans[FX_CURVE_MAX], int count) {
    float tc = clamp(t, 0.0, 1.0);
    for (int i = 0; i < FX_CURVE_MAX - 1; i++) {
      if (i >= count - 1) break;
      vec4 a = pts[i];
      vec4 b = pts[i + 1];
      if (tc >= a.x && (tc < b.x || i >= count - 2)) {
        if (a.z > 0.5) return a.y;
        float span = max(b.x - a.x, 1e-5);
        vec4 ta = tans[i];
        vec4 tb = tans[i + 1];
        vec2 c1 = ta.z > 0.5 ? (a.xy + ta.xy) : (a.xy + vec2(span / 3.0, 0.0));
        vec2 c2 = tb.z > 0.5 ? (b.xy - tb.xy) : (b.xy - vec2(span / 3.0, 0.0));
        // Clamp horizontal control positions to the segment so x(s) stays
        // monotonic (a valid function of x) even if a dragged handle points
        // backward or far past the neighboring point. Y is left free so
        // overshoot/bounce shapes remain expressible.
        c1.x = clamp(c1.x, a.x, b.x);
        c2.x = clamp(c2.x, a.x, b.x);
        float s = fxCubicSolveX(a.x, c1.x, c2.x, b.x, tc);
        float mt = 1.0 - s;
        return mt * mt * mt * a.y + 3.0 * mt * mt * s * c1.y + 3.0 * mt * s * s * c2.y + s * s * s * b.y;
      }
    }
    return pts[count - 1].y;
  }
`;function he(e){return Math.min(1,Math.max(0,Number.isFinite(e)?e:0))}function Da(e,t,a){return Math.min(a,Math.max(t,Number.isFinite(e)?e:0))}function oi(e,t,a,n,o){let i=he(o);for(let r=0;r<8;r++){const s=1-i,c=s*s*s*e+3*s*s*i*t+3*s*i*i*a+i*i*i*n-o,u=3*s*s*(t-e)+6*s*i*(a-t)+3*i*i*(n-a);if(Math.abs(u)<1e-6)break;i=he(i-c/u)}return i}function ii(e){if(typeof e.handleAngle=="number"&&typeof e.handleDist=="number"&&e.handleDist>0){const t=e.handleDist*.33;return{tanDx:Math.cos(e.handleAngle)*t,tanDy:Math.sin(e.handleAngle)*t,tanSet:!0}}return typeof e.bend=="number"&&e.bend!==0?{tanDx:0,tanDy:Da(e.bend,-1,1)*.25,tanSet:!0}:{tanDx:0,tanDy:0,tanSet:!1}}function It(e){if(e&&Array.isArray(e.points)&&e.points.length>=2){const t=e.points.map(a=>{const o=a.tanSet&&typeof a.tanDx=="number"&&typeof a.tanDy=="number"?{tanDx:a.tanDx,tanDy:a.tanDy,tanSet:!0}:ii(a);return{x:he(a.x),y:he(a.y),type:a.type==="constant"?"constant":"bezier",tanDx:o.tanSet?o.tanDx:0,tanDy:o.tanSet?o.tanDy:0,tanSet:!!o.tanSet}}).sort((a,n)=>a.x-n.x).slice(0,we);return t[0]={...t[0],x:0},t[t.length-1]={...t[t.length-1],x:1},{points:t}}return e&&typeof e.x=="number"&&typeof e.y=="number"?{points:[{x:0,y:0,type:"bezier",tanDx:0,tanDy:0,tanSet:!1},{x:he(e.x),y:he(e.y),type:"bezier",tanDx:0,tanDy:0,tanSet:!1},{x:1,y:1,type:"bezier",tanDx:0,tanDy:0,tanSet:!1}]}:{points:[{x:0,y:0,type:"bezier",tanDx:0,tanDy:0,tanSet:!1},{x:1,y:1,type:"bezier",tanDx:0,tanDy:0,tanSet:!1}]}}function ri(e,t){const{points:a}=It(e),n=he(t);for(let o=0;o<a.length-1;o++){const i=a[o],r=a[o+1];if(n>=i.x&&(n<r.x||o===a.length-2)){if(i.type==="constant")return i.y;const s=Math.max(r.x-i.x,1e-5),c=Da(i.tanSet?i.x+i.tanDx:i.x+s/3,i.x,r.x),u=i.tanSet?i.y+i.tanDy:i.y,d=Da(r.tanSet?r.x-r.tanDx:r.x-s/3,i.x,r.x),f=r.tanSet?r.y-r.tanDy:r.y,p=oi(i.x,c,d,r.x,n),h=1-p;return h*h*h*i.y+3*h*h*p*u+3*h*p*p*f+p*p*p*r.y}}return a[a.length-1].y}function En(e){const{points:t}=It(e),a=[],n=[];for(let o=0;o<we;o++){const i=t[Math.min(o,t.length-1)];a.push([i.x,i.y,i.type==="constant"?1:0,0]),n.push([i.tanDx||0,i.tanDy||0,i.tanSet?1:0,0])}return{points:a,tans:n,count:t.length}}const Bt=8;function qn(e){const t=typeof e=="string"?/^#?([0-9a-fA-F]{6})$/.exec(e.trim()):null;return t?`#${t[1].toLowerCase()}`:"#ffffff"}function Et(e){const t=qn(e).slice(1);return[parseInt(t.slice(0,2),16)/255,parseInt(t.slice(2,4),16)/255,parseInt(t.slice(4,6),16)/255]}function li([e,t,a]){const n=o=>Math.round(he(o)*255).toString(16).padStart(2,"0");return`#${n(e)}${n(t)}${n(a)}`}function mt(e){let t=e&&Array.isArray(e.stops)?e.stops:null;(!t||t.length<2)&&(t=[{t:0,color:"#1b2a6b"},{t:1,color:"#ffcf6b"}]);const a=t.map(n=>({t:he(Number(n&&n.t)),color:qn(n&&n.color)})).sort((n,o)=>n.t-o.t).slice(0,Bt);return a.length<2&&a.push({t:1,color:"#ffffff"}),{stops:a}}function si(e,t){const{stops:a}=mt(e),n=he(t);if(n<=a[0].t)return a[0].color;if(n>=a[a.length-1].t)return a[a.length-1].color;for(let o=0;o<a.length-1;o++){const i=a[o],r=a[o+1];if(n>=i.t&&n<=r.t){const s=Math.max(r.t-i.t,1e-5),c=(n-i.t)/s,u=Et(i.color),d=Et(r.color);return li([u[0]+(d[0]-u[0])*c,u[1]+(d[1]-u[1])*c,u[2]+(d[2]-u[2])*c])}}return a[a.length-1].color}function Gn(e){const{stops:t}=mt(e);return`linear-gradient(90deg, ${t.map(a=>`${a.color} ${(a.t*100).toFixed(1)}%`).join(", ")})`}function ci(e){const{stops:t}=mt(e),a=[];for(let n=0;n<Bt;n++){const o=t[Math.min(n,t.length-1)],i=Et(o.color);a.push([i[0],i[1],i[2],o.t])}return{stops:a,count:t.length}}const ui=`
  #define FX_GRAD_MAX ${Bt}
  vec3 fxGradientEval(float t, vec4 stops[FX_GRAD_MAX], int count) {
    float tc = clamp(t, 0.0, 1.0);
    if (tc <= stops[0].a) return stops[0].rgb;
    if (tc >= stops[count - 1].a) return stops[count - 1].rgb;
    for (int i = 0; i < FX_GRAD_MAX - 1; i++) {
      if (i >= count - 1) break;
      vec4 a = stops[i];
      vec4 b = stops[i + 1];
      if (tc >= a.a && tc <= b.a) {
        float span = max(b.a - a.a, 1e-5);
        return mix(a.rgb, b.rgb, (tc - a.a) / span);
      }
    }
    return stops[count - 1].rgb;
  }
`,Lt=`
  vec3 fxHsl2rgb(vec3 hsl) {
    float h = hsl.x / 360.0;
    float s = hsl.y;
    float l = hsl.z;
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float hp = h * 6.0;
    float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
    vec3 rgb;
    if (hp < 1.0) rgb = vec3(c, x, 0.0);
    else if (hp < 2.0) rgb = vec3(x, c, 0.0);
    else if (hp < 3.0) rgb = vec3(0.0, c, x);
    else if (hp < 4.0) rgb = vec3(0.0, x, c);
    else if (hp < 5.0) rgb = vec3(x, 0.0, c);
    else rgb = vec3(c, 0.0, x);
    return rgb + (l - c * 0.5);
  }
  float fxLum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
  vec3 fxClipColor(vec3 c) {
    float l = fxLum(c);
    float n = min(c.r, min(c.g, c.b));
    float x = max(c.r, max(c.g, c.b));
    if (n < 0.0) c = l + (c - l) * (l / max(l - n, 1e-5));
    if (x > 1.0) c = l + (c - l) * ((1.0 - l) / max(x - l, 1e-5));
    return c;
  }
  vec3 fxSetLum(vec3 c, float l) {
    float d = l - fxLum(c);
    return fxClipColor(c + vec3(d));
  }
`,Wn=[{id:"glow",label:"Glow / Deep Glow",group:"Effect",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="2.6"/><path d="M8 1.4v2M8 12.6v2M1.4 8h2M12.6 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>',params:[{key:"threshold",label:"Threshold",min:0,max:1,step:.01,default:.55},{key:"intensity",label:"Intensity",min:0,max:3,step:.02,default:1.1},{key:"radius",label:"Radius",min:.5,max:6,step:.05,default:2.2},{key:"steps",label:"Steps (Quality)",min:2,max:8,step:1,default:4}],passes:[{key:"glow",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uThreshold;
          uniform float uIntensity;
          uniform float uRadius;
          uniform float uSteps;
          varying vec2 vUv;
          const int MAX_GLOW_STEPS = 8;
          void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            vec2 texel = 1.0 / uResolution;
            vec3 glow = vec3(0.0);
            float total = 0.0;
            for (int x = -MAX_GLOW_STEPS; x <= MAX_GLOW_STEPS; x++) {
              if (abs(float(x)) > uSteps) continue;
              for (int y = -MAX_GLOW_STEPS; y <= MAX_GLOW_STEPS; y++) {
                if (abs(float(y)) > uSteps) continue;
                // Radius defines the outer reach of the glow in texels.
                // Steps only changes the density of samples within that fixed
                // reach, so raising quality cannot make the glow larger.
                vec2 offset = vec2(float(x), float(y)) * texel * uRadius / max(uSteps, 1.0);
                vec3 c = texture2D(tDiffuse, vUv + offset).rgb;
                float lum = dot(c, vec3(0.299, 0.587, 0.114));
                float w = smoothstep(uThreshold, 1.0, lum);
                glow += c * w;
                total += 1.0;
              }
            }
            glow /= total;
            gl_FragColor = vec4(base.rgb + glow * uIntensity, base.a);
          }
        `,updateUniforms(e,t){e.uThreshold.value=t.threshold,e.uIntensity.value=t.intensity,e.uRadius.value=t.radius,e.uSteps.value=t.steps}}]},{id:"basicTone",label:"Brightness / Contrast",group:"Color",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="4.8"/><path d="M8 3.2v9.6"/><path d="M3.2 8h9.6" opacity="0.5"/></svg>',params:[{key:"brightness",label:"Brightness",min:-1,max:1,step:.01,default:0},{key:"contrast",label:"Contrast",min:-1,max:1,step:.01,default:0}],passes:[{key:"basicTone",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uBrightness;
          uniform float uContrast;
          varying vec2 vUv;
          void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            vec3 color = base.rgb + vec3(uBrightness);
            color = (color - 0.5) * (1.0 + uContrast) + 0.5;
            gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
          }
        `,updateUniforms(e,t){e.uBrightness.value=t.brightness,e.uContrast.value=t.contrast}}]},{id:"levels",label:"Levels",group:"Color",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M2 12h12"/><path d="M4 12V8"/><path d="M8 12V4"/><path d="M12 12V6"/></svg>',params:[{key:"graph",label:"Graph",type:"levelsGraph",default:0,blackKey:"blackPoint",gammaKey:"gamma",whiteKey:"whitePoint"},{key:"blackPoint",label:"Input Black",min:0,max:.5,step:.005,default:0},{key:"whitePoint",label:"Input White",min:.5,max:1,step:.005,default:1},{key:"gamma",label:"Gamma",min:.2,max:3,step:.01,default:1}],passes:[{key:"levels",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uBlackPoint;
          uniform float uWhitePoint;
          uniform float uGamma;
          varying vec2 vUv;
          void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            float lo = min(uBlackPoint, uWhitePoint - 0.001);
            float hi = max(uWhitePoint, lo + 0.001);
            vec3 color = clamp((base.rgb - vec3(lo)) / (hi - lo), 0.0, 1.0);
            color = pow(color, vec3(1.0 / max(uGamma, 0.001)));
            gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
          }
        `,updateUniforms(e,t){e.uBlackPoint.value=t.blackPoint,e.uWhitePoint.value=t.whitePoint,e.uGamma.value=t.gamma}}]},{id:"highlightShadow",label:"Highlight / Shadow",group:"Color",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 8a6 6 0 1112 0 6 6 0 01-12 0Z"/><path d="M8 2a6 6 0 000 12" opacity="0.5"/></svg>',params:[{key:"highlights",label:"Highlights",min:-1,max:1,step:.01,default:0},{key:"shadows",label:"Shadows",min:-1,max:1,step:.01,default:0}],passes:[{key:"highlightShadow",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uHighlights;
          uniform float uShadows;
          varying vec2 vUv;
          float fxLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
          void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            vec3 color = clamp(base.rgb, 0.0, 1.0);
            float lum = clamp(fxLum(color), 0.0, 1.0);
            float eps = 1e-4;

            float shadowPos = max(uShadows, 0.0);
            float shadowNeg = max(-uShadows, 0.0);
            float highlightPos = max(uHighlights, 0.0);
            float highlightNeg = max(-uHighlights, 0.0);

            // Photoshop-like luminance remap: lift/compress shadows and recover/compress
            // highlights with non-linear curves, then restore chroma by luminance ratio.
            float shadowLift = clamp(
              (pow(lum, 1.0 / (shadowPos + 1.0)) - 0.76 * pow(lum, 2.0 / (shadowPos + 1.0))) - lum,
              0.0, 1.0
            );
            float shadowCrush = clamp(lum - pow(lum, 1.0 + shadowNeg * 1.35), 0.0, 1.0);

            float oneMinus = 1.0 - lum;
            float highlightRecover = clamp(
              lum - (1.0 - (pow(oneMinus, 1.0 / (2.0 - highlightPos)) - 0.8 * pow(oneMinus, 2.0 / (2.0 - highlightPos)))),
              0.0, 1.0
            );
            float highlightBoost = clamp(pow(lum, 1.0 + highlightNeg * 1.35) - lum, 0.0, 1.0);

            float lumOut = clamp(lum + shadowLift - shadowCrush - highlightRecover + highlightBoost, 0.0, 1.0);
            vec3 outColor = color * ((lumOut + eps) / (lum + eps));
            gl_FragColor = vec4(clamp(outColor, 0.0, 1.0), base.a);
          }
        `,updateUniforms(e,t){e.uHighlights.value=t.highlights,e.uShadows.value=t.shadows}}]},{id:"hueSaturation",label:"Hue / Saturation",group:"Color",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="5.2"/><path d="M8 2.8v5.3l3.7 2.3" opacity="0.75"/></svg>',params:[{key:"hue",label:"Hue",min:-180,max:180,step:1,default:0},{key:"saturation",label:"Saturation",min:-1,max:1,step:.01,default:0},{key:"lightness",label:"Lightness",min:-1,max:1,step:.01,default:0}],passes:[{key:"hueSaturation",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uHueShift;
          uniform float uSatScale;
          uniform float uLightness;
          varying vec2 vUv;
          vec3 rgb2hsv(vec3 c) {
            vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
            vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
            vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
            float d = q.x - min(q.w, q.y);
            float e = 1.0e-10;
            return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
          }
          vec3 hsv2rgb(vec3 c) {
            vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
            return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
          }
          void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            vec3 hsv = rgb2hsv(base.rgb);
            hsv.x = fract(hsv.x + uHueShift);
            hsv.y = clamp(hsv.y * uSatScale, 0.0, 1.0);
            vec3 color = hsv2rgb(hsv);
            color = mix(color, vec3(1.0), max(uLightness, 0.0));
            color = mix(color, vec3(0.0), max(-uLightness, 0.0));
            gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
          }
        `,updateUniforms(e,t){e.uHueShift.value=(t.hue||0)/360,e.uSatScale.value=1+(t.saturation||0),e.uLightness.value=t.lightness||0}}]},{id:"chroma",label:"Chromatic Aberration",group:"Color",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="6.6" cy="7" r="3.4" opacity="0.85"/><circle cx="9.4" cy="7" r="3.4" opacity="0.55"/><circle cx="8" cy="9.2" r="3.4" opacity="0.7"/></svg>',params:[{key:"amount",label:"Amount",min:0,max:.2,step:.001,default:.01},{key:"edge",label:"Edge Bias",min:0,max:1,step:.01,default:.6},{key:"mode",label:"Field",type:"select",default:"radial",options:[{value:"radial",label:"Radial"},{value:"linear",label:"Linear"},{value:"diamond",label:"Diamond"},{value:"organic",label:"Organic Flow"},{value:"image",label:"Image Gradient"}]},{key:"direction",label:"Direction",min:0,max:360,step:1,default:35,showIf:e=>e.mode==="linear"||e.mode==="diamond"},{key:"flowScale",label:"Flow Scale",min:.5,max:20,step:.1,default:6,showIf:e=>e.mode==="organic"},{key:"flowWarp",label:"Flow Warp",min:0,max:1.5,step:.01,default:.35,showIf:e=>e.mode==="organic"},{key:"speed",label:"Flow Speed",min:0,max:2,step:.02,default:.25,showIf:e=>e.mode==="organic"}],passes:[{key:"chroma",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uAmount;
          uniform float uEdge;
          uniform float uMode;
          uniform float uAngle;
          uniform float uScale;
          uniform float uJitter;
          uniform float uSpeed;
          uniform float uTime;
          uniform vec2 uResolution;
          varying vec2 vUv;
          ${X}
          vec2 fxRotate(vec2 p, float a) {
            float s = sin(a);
            float c = cos(a);
            return mat2(c, -s, s, c) * p;
          }
          float fxLumaAt(vec2 uv) {
            vec3 c = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
            return dot(c, vec3(0.299, 0.587, 0.114));
          }
          void main() {
            vec2 center = vec2(0.5);
            vec2 c = vUv - center;
            float dist = length(c) * 2.0;
            float k = mix(1.0, dist, uEdge);
            vec2 dir = normalize(c + vec2(1e-5));

            if (uMode >= 0.5 && uMode < 1.5) {
              vec2 lin = fxRotate(vec2(1.0, 0.0), radians(uAngle));
              dir = normalize(lin);
            } else if (uMode >= 1.5 && uMode < 2.5) {
              vec2 d = fxRotate(c, radians(uAngle));
              d = vec2(sign(d.x) * (abs(d.x) + 0.001), sign(d.y) * (abs(d.y) + 0.001));
              dir = normalize(d);
            } else if (uMode >= 2.5 && uMode < 3.5) {
              vec2 p = vUv * max(uScale, 0.2);
              float t = mod(uTime * max(uSpeed, 0.0) * 0.12, 1000.0);
              p += vec2(t, -t * 0.73);
              vec2 warp = vec2(
                fxFbm(p * 0.74 + vec2(2.1, 7.3)),
                fxFbm(p * 0.74 + vec2(9.4, 1.8))
              ) - 0.5;
              p += warp * (0.9 + uJitter * 2.4);
              float a = fxDomainWarp(p * 0.61 + vec2(3.4, 5.2)) * 6.2831853;
              dir = normalize(vec2(cos(a), sin(a)));
            } else if (uMode >= 3.5) {
              vec2 texel = 1.0 / max(uResolution, vec2(1.0));
              float lL = fxLumaAt(vUv - vec2(texel.x, 0.0));
              float lR = fxLumaAt(vUv + vec2(texel.x, 0.0));
              float lD = fxLumaAt(vUv - vec2(0.0, texel.y));
              float lU = fxLumaAt(vUv + vec2(0.0, texel.y));
              vec2 grad = vec2(lR - lL, lU - lD);
              if (dot(grad, grad) > 1e-7) {
                dir = normalize(grad);
              }
            }

            vec2 offset = dir * uAmount * k;
            float r = texture2D(tDiffuse, vUv - offset).r;
            vec4 base = texture2D(tDiffuse, vUv);
            float b = texture2D(tDiffuse, vUv + offset).b;
            gl_FragColor = vec4(r, base.g, b, base.a);
          }
        `,updateUniforms(e,t,a){const n=Number.isFinite(t.amount)?t.amount:.01,o=Number.isFinite(t.edge)?t.edge:.6,i=Number.isFinite(t.direction)?t.direction:35,r=Number.isFinite(t.flowScale)?t.flowScale:6,s=Number.isFinite(t.flowWarp)?t.flowWarp:.35,c=Number.isFinite(t.speed)?t.speed:.25,u=typeof t.mode=="string"?t.mode:"radial";e.uAmount.value=n,e.uEdge.value=o,e.uAngle.value=i,e.uScale.value=r,e.uJitter.value=s,e.uSpeed.value=c,e.uTime.value=a,e.uMode.value=u==="linear"?1:u==="diamond"?2:u==="organic"?3:u==="image"?4:0}}]},{id:"mirror",label:"Mirror / Kaleidoscope",group:"Distort",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.6v12.8"/><path d="M2 4.2l6 3.8 6-3.8"/><path d="M2 11.8l6-3.8 6 3.8"/></svg>',params:[{key:"mode",label:"Mode",type:"select",default:"axis",options:[{value:"axis",label:"Axis Mirror"},{value:"radial",label:"Radial Kaleidoscope"}]},{key:"side",label:"Mirror Side",type:"select",default:"below",options:[{value:"below",label:"Below -> Above"},{value:"above",label:"Above -> Below"}],showIf:e=>e.mode==="axis"},{key:"angle",label:"Axis / Rotation",min:0,max:360,step:1,default:0},{key:"height",label:"Mirror Height",min:-.8,max:.8,step:.005,default:0,showIf:e=>e.mode==="axis"},{key:"segments",label:"Segments",min:2,max:24,step:1,default:6,showIf:e=>e.mode==="radial"},{key:"centerX",label:"Center X",min:0,max:1,step:.001,default:.5,showIf:e=>e.mode==="radial"},{key:"centerY",label:"Center Y",min:0,max:1,step:.001,default:.5,showIf:e=>e.mode==="radial"},{key:"seamBlend",label:"Seam Blend",min:0,max:.2,step:.001,default:.03},{key:"seamWave",label:"Wave",min:0,max:.08,step:5e-4,default:.01},{key:"seamFreq",label:"Wave Freq",min:.5,max:30,step:.1,default:8},{key:"seamNoise",label:"Noise",min:0,max:1,step:.01,default:.35},{key:"seamDrift",label:"Drift",min:0,max:2,step:.01,default:.25},{key:"seamBlur",label:"Edge Blur",min:0,max:2,step:.01,default:.6}],passes:[{key:"mirror",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uMode;
          uniform float uAngle;
          uniform float uOffset;
          uniform float uBlend;
          uniform float uEdge;
          uniform float uScale;
          uniform float uNoiseType;
          uniform float uSpeed;
          uniform float uBlur;
          uniform float uSpin;
          uniform float uBlades;
          uniform vec2 uCenter;
          uniform float uTime;
          varying vec2 vUv;
          ${X}
          vec2 fxRotate(vec2 p, float a) {
            float s = sin(a);
            float c = cos(a);
            return mat2(c, -s, s, c) * p;
          }
          vec4 sampleSoft(vec2 uv, vec2 texel, float blur) {
            uv = clamp(uv, 0.0, 1.0);
            if (blur <= 0.0001) return texture2D(tDiffuse, uv);
            vec2 b = texel * blur;
            vec4 sum = texture2D(tDiffuse, uv) * 0.30;
            sum += texture2D(tDiffuse, clamp(uv + vec2(b.x, 0.0), 0.0, 1.0)) * 0.175;
            sum += texture2D(tDiffuse, clamp(uv - vec2(b.x, 0.0), 0.0, 1.0)) * 0.175;
            sum += texture2D(tDiffuse, clamp(uv + vec2(0.0, b.y), 0.0, 1.0)) * 0.175;
            sum += texture2D(tDiffuse, clamp(uv - vec2(0.0, b.y), 0.0, 1.0)) * 0.175;
            return sum;
          }
          void main() {
            vec2 texel = 1.0 / max(uResolution, vec2(1.0));
            vec4 base = texture2D(tDiffuse, vUv);
            vec4 outCol = base;
            float seamW = max(uBlend, 0.0001);
            if (uMode < 0.5) {
              vec2 center = vec2(0.5);
              float ang = radians(uAngle);
              vec2 rp = fxRotate(vUv - center, ang);
              float phase = rp.x * uScale * 6.2831853 + uTime * uSpeed;
              float wave = sin(phase) * uEdge;
              float n = fxNoise(vec2(rp.x * uScale * 2.1 + 17.0, uTime * 0.2 + rp.y * 2.0));
              wave += (n - 0.5) * 2.0 * uEdge * uNoiseType;
              float seam = clamp(uOffset + wave, -0.98, 0.98);
              float d = rp.y - seam;
              float mirrorMask = uSpin < 0.5 ? step(d, 0.0) : step(0.0, d);
              vec2 mirRp = vec2(rp.x, seam - d);
              vec2 uvMir = fxRotate(mirRp, -ang) + center;
              vec4 reflected = sampleSoft(uvMir, texel, uBlur);
              float seamMix = smoothstep(0.0, seamW, abs(d));
              vec4 mirroredCol = mix(base, reflected, seamMix);
              outCol = mix(base, mirroredCol, mirrorMask);
            } else {
              vec2 center = uCenter;
              vec2 p = vUv - center;
              float radius = length(p);
              float segs = max(2.0, floor(uBlades + 0.5));
              float sector = 6.2831853 / segs;
              float aRaw = atan(p.y, p.x) + radians(uAngle);
              float local = mod(aRaw, sector);
              float radialWave = sin(radius * uScale * 10.0 + uTime * uSpeed) * uEdge * 0.25;
              float radialNoise = (fxNoise(vec2(radius * uScale * 6.0 + 13.0, local * 3.0 + uTime * 0.15)) - 0.5)
                * 2.0 * uEdge * uNoiseType * 0.25;
              local = mod(local + radialWave + radialNoise, sector);
              float folded = abs(local - sector * 0.5);
              float seamDist = min(local, sector - local);
              vec2 uvMirror = center + vec2(cos(folded), sin(folded)) * radius;
              vec4 sharp = texture2D(tDiffuse, clamp(uvMirror, 0.0, 1.0));
              vec4 soft = sampleSoft(uvMirror, texel, uBlur);
              float seamMix = smoothstep(0.0, seamW, seamDist);
              outCol = mix(soft, sharp, seamMix);
            }
            gl_FragColor = vec4(outCol.rgb, base.a);
          }
        `,updateUniforms(e,t,a){e.uMode.value=t.mode==="radial"?1:0,e.uAngle.value=t.angle,e.uOffset.value=t.height||0,e.uBlend.value=t.seamBlend,e.uEdge.value=t.seamWave,e.uScale.value=t.seamFreq,e.uNoiseType.value=t.seamNoise,e.uSpeed.value=t.seamDrift,e.uBlur.value=t.seamBlur,e.uSpin.value=t.side==="above"?1:0,e.uBlades.value=t.segments||6,e.uCenter.value.set(t.centerX??.5,t.centerY??.5),e.uTime.value=a}}]},{id:"displace",label:"UV Displacement",group:"Distort",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M1.5 5.5c1.2-1.6 2.4-1.6 3.6 0s2.4 1.6 3.6 0 2.4-1.6 3.6 0"/><path d="M1.5 10.5c1.2-1.6 2.4-1.6 3.6 0s2.4 1.6 3.6 0 2.4-1.6 3.6 0"/></svg>',params:[{key:"pattern",label:"Pattern",type:"select",default:"wave",options:[{value:"wave",label:"Wave"},{value:"slices",label:"Slices"},{value:"shards",label:"Shards"}]},{key:"amount",label:"Amount",min:0,max:.2,step:.001,default:.03},{key:"scale",label:"Scale",min:1,max:30,step:.5,default:6},{key:"angle",label:"Angle",min:0,max:360,step:1,default:0},{key:"speed",label:"Speed",min:0,max:3,step:.02,default:.6},{key:"edgeShape",label:"Edge Shape",type:"select",default:"none",options:[{value:"none",label:"None"},{value:"circle",label:"Circle"},{value:"square",label:"Square"}]},{key:"edgeSoftness",label:"Edge Soft",min:0,max:1,step:.01,default:.35}],passes:[{key:"displace",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uAmount;
          uniform float uScale;
          uniform float uSpeed;
          uniform float uTime;
          uniform float uAngle;
          uniform float uMode;
          uniform float uEdgeShape;
          uniform float uEdgeSoftness;
          varying vec2 vUv;
          ${X}
          vec2 fxRotate(vec2 p, float a) {
            float s = sin(a);
            float c = cos(a);
            return mat2(c, -s, s, c) * p;
          }
          void main() {
            float t = mod(uTime * uSpeed * 0.2, 1000.0);
            float ang = radians(uAngle);
            vec2 p = fxRotate(vUv - 0.5, ang) + 0.5;
            vec2 offset;
            if (uMode < 0.5) {
              // Wave: clean sinusoidal ripple along the rotated axis — a
              // geometric "rippled glass" look, distinct from organic noise.
              float wave = sin(p.x * uScale * 6.2831 + t * 6.2831);
              offset = vec2(0.0, wave);
            } else if (uMode < 1.5) {
              // Slices: quantizes into discrete straight bands, each shifted
              // by a stable per-band random amount — a cut/glitch-glass look.
              float bands = max(uScale, 1.0);
              float band = floor(p.x * bands);
              float rnd = fxHash(vec2(band, floor(t * 2.0))) * 2.0 - 1.0;
              offset = vec2(0.0, rnd);
            } else {
              // Shards: Voronoi-cell based, each irregular polygon cell gets
              // one constant offset direction — shattered-glass displacement.
              vec3 cell = fxVoronoiCell(p * uScale);
              float a2 = cell.z * 6.2831 + t;
              offset = vec2(cos(a2), sin(a2));
            }
            vec2 movedP = p + offset * uAmount;
            vec2 uv = fxRotate(movedP - 0.5, -ang) + 0.5;

            float mask = 1.0;
            if (uEdgeShape > 0.5) {
              vec2 d = vUv - 0.5;
              float field = uEdgeShape < 1.5 ? length(d) * 2.0 : max(abs(d.x), abs(d.y)) * 2.0;
              float soft = max(uEdgeSoftness, 0.001);
              mask = 1.0 - smoothstep(1.0 - soft, 1.0, field);
            }
            gl_FragColor = texture2D(tDiffuse, mix(vUv, uv, mask));
          }
        `,updateUniforms(e,t,a){e.uAmount.value=t.amount,e.uScale.value=t.scale,e.uSpeed.value=t.speed,e.uTime.value=a,e.uAngle.value=t.angle,e.uMode.value=t.pattern==="slices"?1:t.pattern==="shards"?2:0,e.uEdgeShape.value=t.edgeShape==="circle"?1:t.edgeShape==="square"?2:0,e.uEdgeSoftness.value=t.edgeSoftness}}]},{id:"blur",label:"Gaussian Blur",group:"Blur",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="3" opacity="0.9"/><circle cx="8" cy="8" r="5.4" opacity="0.4"/><circle cx="8" cy="8" r="7" opacity="0.18"/></svg>',params:[{key:"radius",label:"Radius",min:0,max:6,step:.05,default:1.4}],passes:[{key:"blur",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uRadius;
          uniform vec2 uDirection;
          varying vec2 vUv;
          void main() {
            vec2 texel = 1.0 / uResolution;
            vec4 sum = vec4(0.0);
            float total = 0.0;
            for (int i = -6; i <= 6; i++) {
              float w = exp(-float(i * i) / 18.0);
              vec2 offset = uDirection * texel * float(i) * uRadius;
              sum += texture2D(tDiffuse, vUv + offset) * w;
              total += w;
            }
            gl_FragColor = sum / total;
          }
        `,updateUniforms(e,t){e.uRadius.value=t.radius,e.uDirection.value.set(1,0)}},{key:"blur",fragmentShader:null,updateUniforms(e,t){e.uRadius.value=t.radius,e.uDirection.value.set(0,1)}}]},{id:"pixelate",label:"Pixelate",group:"Effect",icon:'<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1.5" y="1.5" width="5" height="5" opacity="0.9"/><rect x="9.5" y="1.5" width="5" height="5" opacity="0.5"/><rect x="1.5" y="9.5" width="5" height="5" opacity="0.5"/><rect x="9.5" y="9.5" width="5" height="5" opacity="0.9"/></svg>',params:[{key:"size",label:"Pixel Size",min:1,max:64,step:1,default:8}],passes:[{key:"pixelate",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uSize;
          varying vec2 vUv;
          void main() {
            vec2 grid = uResolution / max(uSize, 1.0);
            vec2 uv = floor(vUv * grid) / grid + (0.5 / grid);
            gl_FragColor = texture2D(tDiffuse, uv);
          }
        `,updateUniforms(e,t){e.uSize.value=t.size}}]},{id:"halftone",label:"Halftone",group:"Effect",icon:'<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.1"/><circle cx="13" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.1"/><circle cx="8" cy="8" r="1.7"/><circle cx="13" cy="8" r="1.1"/><circle cx="3" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.1"/><circle cx="13" cy="13" r="1.5"/></svg>',params:[{key:"shape",label:"Shape",type:"select",default:"circle",options:[{value:"circle",label:"Circle"},{value:"square",label:"Square"},{value:"line",label:"Line"},{value:"cross",label:"Cross"},{value:"diamond",label:"Diamond"}]},{key:"dotSize",label:"Dot Size",min:2,max:24,step:.5,default:7},{key:"angle",label:"Angle",min:0,max:90,step:1,default:22},{key:"colorMode",label:"Color Mode",type:"select",default:"original",options:[{value:"original",label:"Original"},{value:"duotone",label:"Duotone"},{value:"cmy",label:"CMY Print"}]},{key:"inkColor",label:"Ink Color",type:"color",default:"#151515",showIf:e=>e.colorMode==="duotone"},{key:"paperColor",label:"Paper Color",type:"color",default:"#f4efe2",showIf:()=>!0}],passes:[{key:"halftone",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uDotSize;
          uniform float uAngle;
          uniform float uShape;
          uniform float uColorMode;
          uniform vec3 uInkColor;
          uniform vec3 uPaperColor;
          varying vec2 vUv;
          float fxShapeDist(vec2 d, float shape) {
            if (shape < 0.5) return length(d);
            if (shape < 1.5) return max(abs(d.x), abs(d.y));
            if (shape < 2.5) return abs(d.y);
            if (shape < 3.5) return min(abs(d.x), abs(d.y));
            return abs(d.x) + abs(d.y);
          }
          float fxDotMask(vec2 local, float radius, float shape) {
            float dist = fxShapeDist(local, shape);
            float feather = max(0.75, radius * 0.2);
            return 1.0 - smoothstep(radius - feather, radius + feather, dist);
          }
          vec2 fxCellCenter(vec2 p, float cellSize) {
            return (floor(p / cellSize) + 0.5) * cellSize;
          }
          float fxChannelMask(vec2 pixCoord, float dotSize, float angle, float ink, float shape) {
            mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
            vec2 rp = rot * pixCoord;
            vec2 center = fxCellCenter(rp, dotSize);
            vec2 local = rp - center;
            float radius = clamp(ink, 0.0, 1.0) * dotSize * 0.78;
            return fxDotMask(local, radius, shape);
          }
          void main() {
            vec4 src = texture2D(tDiffuse, vUv);
            float ang = uAngle * 3.14159265 / 180.0;
            mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
            mat2 invRot = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
            vec2 pixCoord = vUv * uResolution;
            vec2 rotated = rot * pixCoord;
            vec2 centerRot = fxCellCenter(rotated, uDotSize);
            vec2 centerUv = clamp((invRot * centerRot) / uResolution, 0.0, 1.0);
            vec3 centerColor = texture2D(tDiffuse, centerUv).rgb;
            float lum = dot(centerColor, vec3(0.299, 0.587, 0.114));
            float radius = clamp((1.0 - lum) * uDotSize * 0.82, 0.0, uDotSize * 0.92);
            float mask = fxDotMask(rotated - centerRot, radius, uShape);
            vec3 result;
            if (uColorMode < 0.5) {
              // "Original" mode is still true dot composition: no source image is
              // shown between dots; paper tone plus dot color reconstructs the image.
              result = mix(uPaperColor, centerColor, mask);
            } else if (uColorMode < 1.5) {
              result = mix(uPaperColor, uInkColor, mask);
            } else {
              float cyan = 1.0 - src.r;
              float magenta = 1.0 - src.g;
              float yellow = 1.0 - src.b;
              float a2 = ang + 0.5236;
              float a3 = ang + 1.0472;
              float cMask = fxChannelMask(pixCoord, uDotSize, ang, cyan, uShape);
              float mMask = fxChannelMask(pixCoord, uDotSize, a2, magenta, uShape);
              float yMask = fxChannelMask(pixCoord, uDotSize, a3, yellow, uShape);
              result = uPaperColor;
              result = mix(result, result * vec3(0.0, 0.68, 0.94), cMask);
              result = mix(result, result * vec3(0.86, 0.0, 0.53), mMask);
              result = mix(result, result * vec3(0.98, 0.86, 0.02), yMask);
            }
            gl_FragColor = vec4(result, src.a);
          }
        `,updateUniforms(e,t){const a={circle:0,square:1,line:2,cross:3,diamond:4};e.uDotSize.value=t.dotSize,e.uAngle.value=t.angle,e.uShape.value=a[t.shape]??0;const n={original:0,duotone:1,cmy:2};e.uColorMode.value=n[t.colorMode]??0,e.uInkColor.value.set(...Et(t.inkColor)),e.uPaperColor.value.set(...Et(t.paperColor))}}]},{id:"oilPaint",label:"Oil Paint Strokes",group:"Effect",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M2 11c2.4-1.2 3.4-3.4 6-4.5 2-.8 3.5-.3 6 .8"/><path d="M2 8.5c2-.8 3-2.4 5-3.2 2.2-.9 4.2-.2 7 .9" opacity="0.6"/><path d="M2 13.2h12" opacity="0.35"/></svg>',params:[{key:"preset",label:"Preset",type:"select",default:"custom",options:[{value:"custom",label:"Custom"},{value:"paletteKnife",label:"Palette Knife"},{value:"softBrush",label:"Soft Brush"}]},{key:"brushType",label:"Brush Type",type:"select",default:"round",options:[{value:"round",label:"Round"},{value:"flat",label:"Flat"},{value:"fan",label:"Fan"},{value:"palette",label:"Palette Knife"}]},{key:"brushSize",label:"Brush Size",min:2,max:36,step:.5,default:9},{key:"strokeStrength",label:"Stroke Strength",min:0,max:1,step:.01,default:.72},{key:"detail",label:"Stroke Detail",min:0,max:1,step:.01,default:.55},{key:"edgeBlend",label:"Edge Blend",min:0,max:1,step:.01,default:.6},{key:"strokePresence",label:"Stroke Presence",min:0,max:1,step:.01,default:.65},{key:"mix",label:"Blend",min:0,max:1,step:.01,default:.85}],passes:[{key:"oilPaint",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uBrushType;
          uniform float uBrushSize;
          uniform float uStrokeStrength;
          uniform float uDetail;
          uniform float uEdgeBlend;
          uniform float uStrokePresence;
          uniform float uMix;
          varying vec2 vUv;
          ${X}
          float fxLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
          void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            vec2 texel = 1.0 / max(uResolution, vec2(1.0));
            float gradR = max(1.0, uBrushSize * 0.25);
            vec2 gxOff = vec2(texel.x * gradR, 0.0);
            vec2 gyOff = vec2(0.0, texel.y * gradR);
            float lR = fxLum(texture2D(tDiffuse, clamp(vUv + gxOff, 0.0, 1.0)).rgb);
            float lL = fxLum(texture2D(tDiffuse, clamp(vUv - gxOff, 0.0, 1.0)).rgb);
            float lT = fxLum(texture2D(tDiffuse, clamp(vUv + gyOff, 0.0, 1.0)).rgb);
            float lB = fxLum(texture2D(tDiffuse, clamp(vUv - gyOff, 0.0, 1.0)).rgb);
            vec2 grad = vec2(lR - lL, lT - lB);
            float nAng = (fxHash(vUv * uResolution + vec2(11.3, 53.1)) - 0.5) * 1.2;
            vec2 dir = normalize(vec2(-grad.y, grad.x) + vec2(cos(nAng), sin(nAng)) * 0.12);
            vec2 perp = vec2(-dir.y, dir.x);

            float anis = 1.0;
            float spread = 0.35;
            if (uBrushType > 0.5 && uBrushType < 1.5) {
              anis = 1.35;
              spread = 0.26;
            } else if (uBrushType >= 1.5 && uBrushType < 2.5) {
              anis = 1.15;
              spread = 0.5;
            } else if (uBrushType >= 2.5) {
              anis = 1.75;
              spread = 0.12;
            }

            vec3 acc = vec3(0.0);
            float total = 0.0;
            const int S = 6;
            for (int i = -S; i <= S; i++) {
              float t = float(i) / float(S);
              float j = (fxHash(vUv * uResolution + vec2(float(i) * 17.7, uBrushType * 29.0)) - 0.5);
              vec2 offset = dir * (t * uBrushSize * anis) + perp * (j * uBrushSize * spread);
              vec2 uv = clamp(vUv + offset * texel, 0.0, 1.0);
              float w = exp(-t * t * (2.1 + uDetail * 1.7));
              acc += texture2D(tDiffuse, uv).rgb * w;
              total += w;
            }
            vec3 paint = acc / max(total, 1e-4);
            float levels = mix(18.0, 7.0, uStrokeStrength);
            paint = floor(paint * levels + 0.5) / levels;

            vec2 brushUv = vec2(dot(vUv, dir), dot(vUv, perp)) * (uResolution / max(uBrushSize, 1.0));
            float grain = fxFbm(brushUv * vec2(1.2 + uDetail * 1.6, 2.4 + uDetail * 3.2));
            float rib = abs(fract(brushUv.x + grain * 0.45) - 0.5) * 2.0;
            float edgeSoft = mix(0.02, 0.45, uEdgeBlend);
            float strokeMask = 1.0 - smoothstep(1.0 - edgeSoft, 1.0, rib);
            strokeMask *= smoothstep(0.2, 0.92, grain + 0.15);
            float contour = smoothstep(0.03, 0.35, length(grad) * (1.0 + uDetail * 1.3));
            float ridgeA = 1.0 - smoothstep(0.72, 1.0, rib);
            float ridgeB = 1.0 - smoothstep(0.56, 1.0, rib + grain * 0.22);
            float ridge = max(ridgeA, ridgeB * (0.72 + contour * 0.28));
            float presence = clamp(uStrokePresence, 0.0, 1.0);
            strokeMask = mix(strokeMask, max(strokeMask, ridge * (0.5 + contour * 0.5)), presence);
            strokeMask = clamp(strokeMask * mix(1.0, 1.45, presence), 0.0, 1.0);

            vec3 stylized = mix(base.rgb, paint, uStrokeStrength);
            float impasto = ridge * contour * presence;
            vec3 result = mix(base.rgb, stylized, strokeMask * uMix);
            // Slight stroke-body shading to make brush ridges read clearly
            // without breaking the natural painterly blend.
            result *= mix(vec3(1.0), vec3(0.9, 0.88, 0.84), impasto * 0.24);
            gl_FragColor = vec4(clamp(result, 0.0, 1.0), base.a);
          }
        `,updateUniforms(e,t){const a={brushType:typeof t?.brushType=="string"?t.brushType:"round",brushSize:Number.isFinite(t?.brushSize)?t.brushSize:9,strokeStrength:Number.isFinite(t?.strokeStrength)?t.strokeStrength:.72,detail:Number.isFinite(t?.detail)?t.detail:.55,edgeBlend:Number.isFinite(t?.edgeBlend)?t.edgeBlend:.6,strokePresence:Number.isFinite(t?.strokePresence)?t.strokePresence:.65,mix:Number.isFinite(t?.mix)?t.mix:.85},n={round:0,flat:1,fan:2,palette:3};e.uBrushType.value=n[a.brushType]??0,e.uBrushSize.value=a.brushSize,e.uStrokeStrength.value=a.strokeStrength,e.uDetail.value=a.detail,e.uEdgeBlend.value=a.edgeBlend,e.uStrokePresence.value=a.strokePresence,e.uMix.value=a.mix}}]},{id:"glitch",label:"Glitch",group:"Effect",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M1.5 4h7M10 4h4.5M1.5 8h4M7 8h8M1.5 12h9.5M13 12h1.5" opacity="0.85"/></svg>',params:[{key:"amount",label:"Amount",min:0,max:1,step:.01,default:.4},{key:"blockSize",label:"Band Height",min:2,max:80,step:1,default:16},{key:"rgbSplit",label:"RGB Split",min:0,max:.05,step:5e-4,default:.01},{key:"jitter",label:"Jitter",min:0,max:1,step:.01,default:.5},{key:"speed",label:"Speed",min:0,max:6,step:.05,default:1.2}],passes:[{key:"glitch",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uAmount;
          uniform float uSize;
          uniform float uChroma;
          uniform float uJitter;
          uniform float uSpeed;
          uniform float uTime;
          varying vec2 vUv;
          ${X}
          void main() {
            float bandH = max(uSize, 1.0) / uResolution.y;
            float bandIndex = floor(vUv.y / bandH);
            float timeStep = floor(uTime * uSpeed * 6.0);
            float bandRand = fxHash(vec2(bandIndex, timeStep));
            float activeMask = step(1.0 - uAmount, bandRand);
            float shift = (fxHash(vec2(bandIndex, timeStep + 91.7)) - 0.5) * 2.0 * uJitter * 0.15 * activeMask;
            vec2 uv = vec2(clamp(vUv.x + shift, 0.0, 1.0), vUv.y);

            float r = texture2D(tDiffuse, clamp(uv + vec2(uChroma, 0.0), 0.0, 1.0)).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, clamp(uv - vec2(uChroma, 0.0), 0.0, 1.0)).b;
            float a = texture2D(tDiffuse, uv).a;
            gl_FragColor = vec4(r, g, b, a);
          }
        `,updateUniforms(e,t,a){e.uAmount.value=t.amount,e.uSize.value=t.blockSize,e.uChroma.value=t.rgbSplit,e.uJitter.value=t.jitter,e.uSpeed.value=t.speed,e.uTime.value=a}}]},{id:"datamosh",label:"Datamosh",group:"Effect",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1.5" y="2" width="5" height="5" opacity="0.9"/><rect x="4" y="2" width="5" height="5" opacity="0.35"/><rect x="9.5" y="9" width="5" height="5" opacity="0.9"/><rect x="7" y="9" width="5" height="5" opacity="0.35"/></svg>',params:[{key:"amount",label:"Amount",min:0,max:1,step:.01,default:.45},{key:"direction",label:"Direction",min:0,max:360,step:1,default:0},{key:"blockSize",label:"Block Size",min:4,max:96,step:1,default:24},{key:"drag",label:"Drag Length",min:0,max:1,step:.01,default:.5},{key:"speed",label:"Speed",min:0,max:4,step:.05,default:.6}],passes:[{key:"datamosh",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uAmount;
          uniform float uAngle;
          uniform float uSize;
          uniform float uRandomness;
          uniform float uSpeed;
          uniform float uTime;
          varying vec2 vUv;
          ${X}
          void main() {
            float rad = uAngle * 3.14159265 / 180.0;
            vec2 dir = vec2(cos(rad), sin(rad));
            vec2 cellId = floor(vUv * uResolution / max(uSize, 1.0));
            float timeStep = floor(uTime * uSpeed * 4.0);
            float h = fxHash(cellId + timeStep * 0.37);
            float activeMask = step(1.0 - uAmount, h);
            float dragAmount = (h - 0.5) * 2.0 * uRandomness * activeMask;

            vec3 color = vec3(0.0);
            const int N = 6;
            for (int i = 0; i < N; i++) {
              float fi = float(i) / float(N - 1);
              vec2 sampleUv = clamp(vUv - dir * dragAmount * fi * 0.4, 0.0, 1.0);
              color += texture2D(tDiffuse, sampleUv).rgb;
            }
            color /= float(N);
            float alpha = texture2D(tDiffuse, clamp(vUv - dir * dragAmount * 0.4, 0.0, 1.0)).a;
            gl_FragColor = vec4(color, alpha);
          }
        `,updateUniforms(e,t,a){e.uAmount.value=t.amount,e.uAngle.value=t.direction,e.uSize.value=t.blockSize,e.uRandomness.value=t.drag,e.uSpeed.value=t.speed,e.uTime.value=a}}]},{id:"colorVariation",label:"Color Variation",group:"Color",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 1.5a6.5 6.5 0 100 13c.9 0 1.3-.6 1.3-1.2 0-.3-.1-.6-.3-.8-.2-.3-.3-.6-.3-.9 0-.6.5-1.1 1.1-1.1h1.3A2.9 2.9 0 0014.5 8 6.5 6.5 0 008 1.5Z"/><circle cx="5.2" cy="6" r=".85" fill="currentColor" stroke="none"/><circle cx="8" cy="4.6" r=".85" fill="currentColor" stroke="none"/><circle cx="10.8" cy="6" r=".85" fill="currentColor" stroke="none"/><circle cx="5.6" cy="9.4" r=".85" fill="currentColor" stroke="none"/></svg>',params:[{key:"mode",label:"Mode",type:"select",default:"linear",options:[{value:"linear",label:"Linear"},{value:"radial",label:"Radial"},{value:"noise",label:"Noise"}]},{key:"variation",label:"Variation",min:0,max:1,step:.01,default:.35},{key:"strength",label:"Strength",min:0,max:1,step:.01,default:.35},{key:"offset",label:"Range",min:0,max:1,step:.01,default:.5},{key:"angle",label:"Angle",min:0,max:360,step:1,default:0,showIf:e=>e.mode==="linear"},{key:"radius",label:"Radius",min:.1,max:1.5,step:.01,default:.7,showIf:e=>e.mode==="radial"},{key:"scale",label:"Scale",min:1,max:20,step:.5,default:4,showIf:e=>e.mode==="noise"},{key:"speed",label:"Speed",min:0,max:2,step:.02,default:.3,showIf:e=>e.mode==="noise"}],passes:[{key:"colorVariation",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uVariation;
          uniform float uStrength;
          uniform float uOffset;
          uniform float uAngle;
          uniform float uRadius;
          uniform float uScale;
          uniform float uSpeed;
          uniform float uTime;
          uniform float uMode; // 0 linear, 1 radial, 2 noise
          varying vec2 vUv;
          ${X}
          ${Lt}
          void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            float field;
            if (uMode < 0.5) {
              // Linear: hue sweeps along a freely rotatable axis instead of
              // always the horizontal (vUv.x) axis.
              float rad = uAngle * 3.14159265 / 180.0;
              vec2 dir = vec2(cos(rad), sin(rad));
              field = clamp(dot(vUv - 0.5, dir) * 2.0, -1.0, 1.0);
            } else if (uMode < 1.5) {
              // Radial: hue sweeps outward from the center within Radius,
              // then holds the outermost hue beyond that distance.
              float d = length(vUv - 0.5) * 1.41421356;
              field = clamp(d / max(uRadius, 0.001) * 2.0 - 1.0, -1.0, 1.0);
            } else {
              // Noise: hue follows an organic drifting fbm field instead of
              // any fixed geometric gradient — genuinely unpredictable.
              vec2 t = vec2(mod(uTime * uSpeed * 0.15, 1000.0));
              field = fxFbm(vUv * uScale + t) * 2.0 - 1.0;
            }
            float center = mod(210.0 + uOffset * 360.0, 360.0);
            float halfSpan = uVariation * 120.0;
            float hue = mod(center + halfSpan * field + 360.0, 360.0);
            float t2 = 1.0 - abs(field);
            float sat = 0.85 + 0.05 * t2;
            vec3 source = fxHsl2rgb(vec3(hue, sat, 0.5));
            vec3 blended = fxSetLum(source, fxLum(base.rgb));
            vec3 result = mix(base.rgb, blended, clamp(uStrength, 0.0, 1.0));
            gl_FragColor = vec4(result, base.a);
          }
        `,updateUniforms(e,t,a){e.uVariation.value=t.variation,e.uStrength.value=t.strength,e.uOffset.value=t.offset,e.uAngle.value=t.angle,e.uRadius.value=t.radius,e.uScale.value=t.scale,e.uSpeed.value=t.speed,e.uTime.value=a,e.uMode.value=t.mode==="radial"?1:t.mode==="noise"?2:0}}]},{id:"gradientMap",label:"Gradient Map",group:"Color",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4.7 4v8M8 4v8M11.3 4v8" opacity="0.55"/></svg>',params:[{key:"gradient",label:"Gradient",type:"gradient",default:{stops:[{t:0,color:"#0b1e3d"},{t:.5,color:"#7a3ba3"},{t:1,color:"#ffcf6b"}]}},{key:"contrast",label:"Contrast",min:-1,max:1,step:.01,default:0},{key:"invert",label:"Invert",type:"toggle",default:!1},{key:"mix",label:"Mix",min:0,max:1,step:.01,default:.85}],passes:[{key:"gradientMap",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec4 uGradStops[${Bt}];
          uniform float uGradCount;
          uniform float uContrast;
          uniform float uInvert;
          uniform float uMix;
          varying vec2 vUv;
          ${Lt}
          ${ui}
          void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            float lum = fxLum(base.rgb);
            lum = clamp((lum - 0.5) * (1.0 + uContrast * 2.0) + 0.5, 0.0, 1.0);
            if (uInvert > 0.5) lum = 1.0 - lum;
            vec3 mapped = fxGradientEval(lum, uGradStops, int(uGradCount));
            vec3 result = mix(base.rgb, mapped, clamp(uMix, 0.0, 1.0));
            gl_FragColor = vec4(result, base.a);
          }
        `,updateUniforms(e,t){const{stops:a,count:n}=ci(t.gradient);for(let o=0;o<a.length;o++)e.uGradStops.value[o].set(a[o][0],a[o][1],a[o][2],a[o][3]);e.uGradCount.value=n,e.uContrast.value=t.contrast,e.uInvert.value=t.invert?1:0,e.uMix.value=t.mix}}]},{id:"uvNoise",label:"UV Noise",group:"Distort",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="4.5" cy="5" r="1.6"/><circle cx="11" cy="4.5" r="1.1"/><circle cx="10" cy="10.5" r="2"/><circle cx="4" cy="11" r="1.2"/></svg>',params:[{key:"noiseType",label:"Noise Type",type:"select",default:"cloud",options:Sn},{key:"amount",label:"Amount",min:0,max:.15,step:.001,default:.035},{key:"scale",label:"Scale",min:1,max:30,step:.5,default:5},{key:"speed",label:"Speed",min:0,max:3,step:.02,default:.4}],passes:[{key:"uvNoise",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uAmount;
          uniform float uScale;
          uniform float uSpeed;
          uniform float uTime;
          uniform float uNoiseType;
          varying vec2 vUv;
          ${X}
          void main() {
            vec2 t = vec2(mod(uTime * uSpeed * 0.15, 1000.0));
            vec2 p1 = vUv * uScale + t;
            vec2 p2 = vUv * uScale + t + vec2(17.0, 5.0);
            float n1 = fxNoiseSample(p1, uNoiseType);
            float n2 = fxNoiseSample(p2, uNoiseType);
            vec2 offset = (vec2(n1, n2) - 0.5) * uAmount;
            gl_FragColor = texture2D(tDiffuse, vUv + offset);
          }
        `,updateUniforms(e,t,a){e.uAmount.value=t.amount,e.uScale.value=t.scale,e.uSpeed.value=t.speed,e.uTime.value=a,e.uNoiseType.value=ya(t.noiseType)}}]},{id:"radialDistort",label:"UV Radial Distort",group:"Distort",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="2"/><circle cx="8" cy="8" r="5.5" opacity="0.55"/><path d="M8 2.5v2.2M8 11.3v2.2M2.5 8h2.2M11.3 8h2.2" opacity="0.8"/></svg>',params:[{key:"bulge",label:"Bulge (Expand)",min:0,max:.6,step:.005,default:.18},{key:"pinch",label:"Pinch (Shrink)",min:0,max:.6,step:.005,default:0},{key:"useCurve",label:"Use Curve",type:"toggle",default:!1},{key:"curve",label:"Curve",type:"curve",showIf:"useCurve",default:{points:[{x:0,y:0,type:"bezier"},{x:.5,y:.5,type:"bezier"},{x:1,y:1,type:"bezier"}]}}],passes:[{key:"radialDistort",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uBulge;
          uniform float uPinch;
          uniform float uUseCurve;
          uniform vec4 uCurvePoints[${we}];
          uniform vec4 uCurveTans[${we}];
          uniform float uCurveCount;
          varying vec2 vUv;
          ${Cn}
          void main() {
            vec2 center = vec2(0.5);
            vec2 dir = vUv - center;
            float dist = clamp(length(dir) / 0.70710678, 0.0, 1.0);
            float curveShaped = fxCurveEval(dist, uCurvePoints, uCurveTans, int(uCurveCount));
            float shaped = mix(dist, curveShaped, uUseCurve);
            float amount = uBulge - uPinch;
            vec2 uv = center + dir * (1.0 + amount * shaped);
            gl_FragColor = texture2D(tDiffuse, uv);
          }
        `,updateUniforms(e,t){e.uBulge.value=t.bulge,e.uPinch.value=t.pinch,e.uUseCurve.value=t.useCurve?1:0;const{points:a,tans:n,count:o}=En(t.curve);for(let i=0;i<a.length;i++)e.uCurvePoints.value[i].set(a[i][0],a[i][1],a[i][2],a[i][3]),e.uCurveTans.value[i].set(n[i][0],n[i][1],n[i][2],n[i][3]);e.uCurveCount.value=o}}]},{id:"imageDisplace",label:"UV Image Displacement",group:"Distort",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1.6" y="2.5" width="12.8" height="9" rx="1.2"/><path d="M1.6 9.3l3.4-3 2.6 2.4 2-2.2 3.8 3.5" stroke-linejoin="round"/><circle cx="5.3" cy="5.3" r="1" fill="currentColor" stroke="none"/></svg>',params:[{key:"image",label:"Map",type:"image",default:null},{key:"amount",label:"Amount",min:0,max:.2,step:.001,default:.05}],passes:[{key:"imageDisplace",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform sampler2D tImage;
          uniform float uAmount;
          uniform float uHasImage;
          varying vec2 vUv;
          void main() {
            vec2 offset = vec2(0.0);
            if (uHasImage > 0.5) {
              vec4 dmap = texture2D(tImage, vUv);
              offset = (dmap.rg - 0.5) * uAmount;
            }
            gl_FragColor = texture2D(tDiffuse, vUv + offset);
          }
        `,updateUniforms(e,t,a,n){e.uAmount.value=t.amount;const o=n&&n.compositor?n.compositor.getInstanceTexture(n.instance):null;e.tImage.value=o,e.uHasImage.value=o?1:0}}]},{id:"polarize",label:"Polarize",group:"Distort",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2v12" opacity="0.5"/><path d="M4 4.5c1.4 2.2 1.4 5.4 0 7.6M12 4.5c-1.4 2.2-1.4 5.4 0 7.6" opacity="0.6"/></svg>',params:[{key:"amount",label:"Amount",min:0,max:1,step:.01,default:1},{key:"spin",label:"Spin",min:0,max:360,step:1,default:0},{key:"blur",label:"Blur",min:0,max:.06,step:.001,default:0},{key:"blend",label:"Blend (Seam)",min:0,max:.08,step:.001,default:.02}],passes:[{key:"polarize",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uAmount;
          uniform float uSpin;
          uniform float uBlur;
          uniform float uBlend;
          varying vec2 vUv;
          #define FX_PI 3.14159265
          void main() {
            vec2 center = vec2(0.5);
            vec2 dir = vUv - center;
            float r = length(dir) / 0.70710678;
            float a = atan(dir.y, dir.x) / (2.0 * FX_PI) + 0.5 + uSpin / 360.0;
            float rr = clamp(r, 0.0, 1.0);
            // Only blur near the angular wrap seam (a=0 / a=1) instead of the whole image:
            // measure how close this pixel's angle is to the seam, then fade the extra
            // blur band down to 0 away from it.
            float seamWidth = max(uBlend, 0.0001);
            float distToSeam = min(a, 1.0 - a);
            float seamMask = 1.0 - smoothstep(0.0, seamWidth, distToSeam);
            float band = max(uBlur + seamMask * seamWidth, 0.0001);
            vec4 sum = vec4(0.0);
            float total = 0.0;
            const int N = 6;
            for (int i = -N; i <= N; i++) {
              float t = float(i) / float(N);
              float w = exp(-t * t * 2.0);
              float ax = fract(a + t * band);
              vec2 polarUv = vec2(ax, rr);
              vec2 uv = mix(vUv, polarUv, clamp(uAmount, 0.0, 1.0));
              sum += texture2D(tDiffuse, clamp(uv, 0.0, 1.0)) * w;
              total += w;
            }
            gl_FragColor = sum / max(total, 1e-4);
          }
        `,updateUniforms(e,t){e.uAmount.value=t.amount,e.uSpin.value=t.spin,e.uBlur.value=t.blur,e.uBlend.value=t.blend}}]},{id:"glassDistort",label:"Glass Distort",group:"Distort",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1.8" y="1.8" width="5.4" height="5.4" rx="0.6"/><rect x="8.8" y="1.8" width="5.4" height="5.4" rx="0.6" opacity="0.65"/><rect x="1.8" y="8.8" width="5.4" height="5.4" rx="0.6" opacity="0.65"/><rect x="8.8" y="8.8" width="5.4" height="5.4" rx="0.6" opacity="0.35"/></svg>',params:[{key:"pattern",label:"Pattern",type:"select",default:"blocks",options:[{value:"blocks",label:"Blocks"},{value:"fluted",label:"Fluted"},{value:"hex",label:"Hex"},{value:"ripple",label:"Ripple"},{value:"bubbles",label:"Bubbles"}]},{key:"scale",label:"Scale",min:1,max:40,step:.5,default:8},{key:"angle",label:"Angle",min:0,max:360,step:1,default:0},{key:"refraction",label:"Refraction",min:0,max:.3,step:.001,default:.06},{key:"roughness",label:"Roughness (Frost)",min:0,max:1,step:.01,default:.35},{key:"edgeGlint",label:"Edge Glint",min:0,max:1,step:.01,default:.4},{key:"chroma",label:"Edge Chroma",min:0,max:.05,step:5e-4,default:.006},{key:"speed",label:"Speed",min:0,max:2,step:.02,default:.15}],passes:[{key:"glassDistort",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uAmount;
          uniform float uScale;
          uniform float uAngle;
          uniform float uSpeed;
          uniform float uTime;
          uniform float uMode;
          uniform float uRoughness;
          uniform float uEdge;
          uniform float uChroma;
          varying vec2 vUv;
          ${X}
          vec2 fxRotate(vec2 p, float a) {
            float s = sin(a);
            float c = cos(a);
            return mat2(c, -s, s, c) * p;
          }
          // Organic frosted-bubble lattice: like fxVoronoiCell but also returns
          // the vector FROM the fragment TO its nearest bubble center, so each
          // bubble can act as its own tiny lens (used only by this filter).
          vec3 fxBubbleCell(vec2 p) {
            vec2 ip = floor(p);
            vec2 fp = fract(p);
            float minDist = 8.0;
            vec2 bestDiff = vec2(0.0);
            float bestId = 0.0;
            for (int y = -1; y <= 1; y++) {
              for (int x = -1; x <= 1; x++) {
                vec2 neighbor = vec2(float(x), float(y));
                vec2 point = fxHash2(ip + neighbor);
                vec2 diff = neighbor + point - fp;
                float d = length(diff);
                if (d < minDist) {
                  minDist = d;
                  bestDiff = diff;
                  bestId = fxHash(ip + neighbor);
                }
              }
            }
            return vec3(bestDiff, bestId);
          }
          void main() {
            float t = mod(uTime * uSpeed * 0.15, 1000.0);
            float ang = radians(uAngle);
            vec2 p = fxRotate(vUv - 0.5, ang) + 0.5;
            vec2 offset = vec2(0.0);
            float edgeFactor = 0.0;

            if (uMode < 0.5) {
              // Blocks: rectangular glass-pane lenslets, each pulling the
              // image toward its own tile center like real pressed glass.
              vec2 cellLocal = fract(p * uScale) - 0.5;
              offset = cellLocal * uAmount * 2.4;
              edgeFactor = smoothstep(0.55, 0.98, max(abs(cellLocal.x), abs(cellLocal.y)) * 2.0);
            } else if (uMode < 1.5) {
              // Fluted: vertical reeded ribs, each a thin cylindrical lens —
              // distinct from Blocks by only bending along one local axis.
              float ribLocal = fract(p.x * uScale) - 0.5;
              offset = vec2(sin(ribLocal * 3.14159265), 0.0) * uAmount * 2.6;
              edgeFactor = 1.0 - smoothstep(0.0, 0.1, abs(abs(ribLocal) - 0.5));
            } else if (uMode < 2.5) {
              // Hex: hexagonal glass tiles via a two-row staggered lattice.
              vec2 s = vec2(1.0, 1.7320508);
              vec2 hp = p * uScale;
              vec2 c1 = (floor(hp / s) + 0.5) * s;
              vec2 c2 = (floor((hp - s * 0.5) / s) + 0.5) * s + s * 0.5;
              vec2 d1 = hp - c1;
              vec2 d2 = hp - c2;
              vec2 cellLocal = dot(d1, d1) < dot(d2, d2) ? d1 : d2;
              offset = cellLocal * uAmount * 2.2;
              edgeFactor = smoothstep(0.4, 0.62, length(cellLocal));
            } else if (uMode < 3.5) {
              // Ripple: concentric rain-glass rings radiating from center.
              vec2 c = p - 0.5;
              float dist = length(c);
              float ring = sin(dist * uScale * 6.2831 - t * 6.2831);
              vec2 dir = c / max(dist, 1e-4);
              offset = dir * ring * uAmount * 1.6;
              edgeFactor = abs(ring);
            } else {
              // Bubbles: organic frosted-glass blobs, each its own lens.
              vec2 bp = p * uScale + t * 0.2;
              vec3 cell = fxBubbleCell(bp);
              offset = cell.xy * uAmount * 2.0;
              edgeFactor = smoothstep(0.55, 1.0, length(cell.xy));
            }

            vec2 movedP = p + offset;
            vec2 baseUv = fxRotate(movedP - 0.5, -ang) + 0.5;

            // Frosted roughness: average several taps spun around baseUv at
            // the golden angle so the scatter reads as soft milky diffusion
            // instead of a directional smear.
            vec3 color = vec3(0.0);
            float alpha = texture2D(tDiffuse, clamp(baseUv, 0.0, 1.0)).a;
            float rough = uRoughness * 0.05;
            const int TAP_COUNT = 6;
            for (int i = 0; i < TAP_COUNT; i++) {
              float fi = float(i);
              float sa = fi * 2.39996 + t * 2.0;
              float tapLen = rough * (0.35 + 0.65 * fract(fi * 0.618));
              vec2 tapUv = clamp(baseUv + vec2(cos(sa), sin(sa)) * tapLen, 0.0, 1.0);

              // Per-channel chromatic split, boosted near cell/rib edges for
              // the dispersive glint real glass seams show under light.
              float chroma = uChroma * (0.3 + edgeFactor * 1.4);
              vec2 dirC = normalize(tapUv - 0.5 + 1e-4);
              float r = texture2D(tDiffuse, clamp(tapUv + dirC * chroma, 0.0, 1.0)).r;
              float g = texture2D(tDiffuse, tapUv).g;
              float b = texture2D(tDiffuse, clamp(tapUv - dirC * chroma, 0.0, 1.0)).b;
              color += vec3(r, g, b);
            }
            color /= float(TAP_COUNT);

            // Edge glint: a soft white highlight along cell/rib boundaries,
            // like light catching the ground seam of real glass panes.
            color += vec3(1.0) * edgeFactor * uEdge * 0.5;

            gl_FragColor = vec4(color, alpha);
          }
        `,updateUniforms(e,t,a){e.uScale.value=t.scale,e.uAngle.value=t.angle,e.uAmount.value=t.refraction,e.uRoughness.value=t.roughness,e.uEdge.value=t.edgeGlint,e.uChroma.value=t.chroma,e.uSpeed.value=t.speed,e.uTime.value=a,e.uMode.value=t.pattern==="fluted"?1:t.pattern==="hex"?2:t.pattern==="ripple"?3:t.pattern==="bubbles"?4:0}}]},{id:"causticEffect",label:"Caustic Refraction",group:"Distort",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.7 10.8c1.1-2 2.2-2.8 3.3-2.5 1.1.3 1.8 1.3 2.7 1.3 1.1 0 1.8-1.7 3-1.9 1-.2 2 .6 3.6 2.4"/><path d="M2.2 6.1c1-1.4 1.9-2 2.9-1.8 1 .2 1.6 1 2.5 1 1 0 1.7-1.3 2.7-1.5 1-.2 1.9.3 3.5 1.8" opacity="0.7"/><path d="M3.1 13.7h9.8" opacity="0.35"/></svg>',params:[{key:"angle",label:"Flow Angle",min:0,max:360,step:1,default:24},{key:"scale",label:"Scale",min:0,max:32,step:.5,default:10},{key:"distortion",label:"Distortion",min:0,max:3,step:.01,default:1},{key:"refraction",label:"Refraction",min:0,max:.2,step:.001,default:.03},{key:"steps",label:"Steps",min:1,max:12,step:1,default:5},{key:"focus",label:"Focus",min:.5,max:3,step:.01,default:1.45},{key:"shimmer",label:"Shimmer",min:0,max:1,step:.01,default:.45},{key:"speed",label:"Speed",min:0,max:2,step:.02,default:.4},{key:"chroma",label:"Dispersion",min:0,max:.03,step:5e-4,default:.004}],passes:[{key:"causticEffect",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uAmount;
          uniform float uScale;
          uniform float uAngle;
          uniform float uSpeed;
          uniform float uTime;
          uniform float uFrequency;
          uniform float uJitter;
          uniform float uFalloff;
          uniform float uChroma;
          uniform float uSteps;
          varying vec2 vUv;
          ${X}
          vec2 fxRotate(vec2 p, float a) {
            float s = sin(a);
            float c = cos(a);
            return mat2(c, -s, s, c) * p;
          }
          float fxCausticField(vec2 p, float t) {
            vec2 q = fxRotate(p * uScale, radians(uAngle));
            q += vec2(t * (0.32 + uJitter * 0.18), -t * (0.24 + uJitter * 0.14));
            vec2 warp = vec2(
              fxFbm(q * 0.38 + vec2(1.7, 9.2)),
              fxFbm(q * 0.38 + vec2(8.3, 2.8))
            ) - 0.5;
            q += warp * (uFalloff * (0.7 + uJitter * 1.8));
            float a = sin(q.x * 1.85 + fxDomainWarp(q * 0.32 + vec2(2.1, 0.7)) * 4.4 + t * 0.85);
            float b = sin(q.y * -2.25 + fxDomainWarp(q * 0.29 + vec2(6.4, 3.7)) * 3.8 - t * 1.05);
            float c = sin((q.x + q.y) * 1.28 + fxFbm(q * 0.47 + vec2(4.8, 6.2)) * 5.2 + t * 0.58);
            return a + b + 0.65 * c;
          }
          void main() {
            float aspect = uResolution.x / max(uResolution.y, 1.0);
            vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
            float speed = max(uSpeed, 0.0);
            float t = speed < 1e-4 ? 0.0 : mod(uTime * speed * 0.9, 1000.0);
            float eps = 0.018;

            float f = fxCausticField(p, t);
            float fx = fxCausticField(p + vec2(eps, 0.0), t) - fxCausticField(p - vec2(eps, 0.0), t);
            float fy = fxCausticField(p + vec2(0.0, eps), t) - fxCausticField(p - vec2(0.0, eps), t);
            vec2 grad = vec2(fx, fy) / (2.0 * eps);

            float focus = clamp(uFrequency, 0.2, 4.0);
            float ridge = exp(-abs(f) * (3.5 + focus * 4.5));

            vec2 offset = grad * uAmount * (0.006 + ridge * 0.028);
            offset.x /= aspect;

            vec2 tangent = normalize(vec2(-grad.y, grad.x) + vec2(1e-5));
            tangent.x /= aspect;
            float spread = uAmount * (0.4 + ridge * (0.8 + 1.2 * uJitter));
            vec2 uv0 = clamp(vUv + offset, 0.0, 1.0);
            vec2 chromaDir = normalize(offset + vec2(1e-5));
            float dispersion = uChroma * (0.25 + ridge * 1.6);

            vec3 sum = vec3(0.0);
            float total = 0.0;
            const int MAX_TAPS = 12;
            int taps = int(clamp(floor(uSteps + 0.5), 1.0, float(MAX_TAPS)));
            for (int i = -MAX_TAPS; i <= MAX_TAPS; i++) {
              if (abs(i) > taps) continue;
              float fi = float(i);
              float w = exp(-fi * fi * (0.24 + focus * 0.06));
              vec2 tapUv = clamp(uv0 + tangent * fi * spread, 0.0, 1.0);
              float r = texture2D(tDiffuse, clamp(tapUv + chromaDir * dispersion, 0.0, 1.0)).r;
              float g = texture2D(tDiffuse, tapUv).g;
              float b = texture2D(tDiffuse, clamp(tapUv - chromaDir * dispersion, 0.0, 1.0)).b;
              sum += vec3(r, g, b) * w;
              total += w;
            }

            vec3 color = sum / max(total, 1e-4);
            gl_FragColor = vec4(color, texture2D(tDiffuse, uv0).a);
          }
        `,updateUniforms(e,t,a){const n=Number.isFinite(t.speed)?t.speed:.4,o=Number.isFinite(t.steps)?t.steps:5,i=Number.isFinite(t.distortion)?t.distortion:1;e.uAngle.value=t.angle,e.uScale.value=t.scale,e.uAmount.value=t.refraction,e.uFrequency.value=t.focus,e.uJitter.value=t.shimmer,e.uFalloff.value=i,e.uSpeed.value=n,e.uSteps.value=o,e.uChroma.value=t.chroma,e.uTime.value=a}}]},{id:"lensDistort",label:"Lens Distortion",group:"Distort",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="6.2"/><path d="M8 1.8c2.6 2.4 2.6 10 0 12.4M8 1.8c-2.6 2.4-2.6 10 0 12.4" opacity="0.6"/></svg>',params:[{key:"amount",label:"Amount",min:-1,max:1,step:.01,default:.35},{key:"falloff",label:"Edge Falloff",min:.3,max:3,step:.05,default:1.2},{key:"chroma",label:"Edge Chroma",min:0,max:.05,step:5e-4,default:.008}],passes:[{key:"lensDistort",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uAmount;
          uniform float uFalloff;
          uniform float uChroma;
          varying vec2 vUv;
          vec2 fxLensUv(vec2 uv, float amt, float falloff) {
            vec2 c = uv - 0.5;
            float r2 = dot(c, c);
            float distortion = 1.0 + amt * pow(r2, falloff);
            return c * distortion + 0.5;
          }
          void main() {
            vec2 uvR = fxLensUv(vUv, uAmount + uChroma * 4.0, uFalloff);
            vec2 uvG = fxLensUv(vUv, uAmount, uFalloff);
            vec2 uvB = fxLensUv(vUv, uAmount - uChroma * 4.0, uFalloff);
            float r = texture2D(tDiffuse, clamp(uvR, 0.0, 1.0)).r;
            float g = texture2D(tDiffuse, clamp(uvG, 0.0, 1.0)).g;
            float b = texture2D(tDiffuse, clamp(uvB, 0.0, 1.0)).b;
            float a = texture2D(tDiffuse, clamp(uvG, 0.0, 1.0)).a;
            gl_FragColor = vec4(r, g, b, a);
          }
        `,updateUniforms(e,t){e.uAmount.value=t.amount,e.uFalloff.value=t.falloff,e.uChroma.value=t.chroma}}]},{id:"waveDistort",label:"Wave Distort",group:"Distort",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M1.5 5.5c1.4-2 2.8-2 4.2 0s2.8 2 4.2 0 2.8-2 4.2 0" /><path d="M1.5 10.5c1.4-2 2.8-2 4.2 0s2.8 2 4.2 0 2.8-2 4.2 0" opacity="0.5"/></svg>',params:[{key:"amplitude",label:"Amplitude",min:0,max:.2,step:.002,default:.03},{key:"frequency",label:"Frequency",min:.5,max:40,step:.5,default:8},{key:"angle",label:"Angle",min:0,max:360,step:1,default:0},{key:"speed",label:"Speed",min:0,max:3,step:.02,default:.5},{key:"axis",label:"Axis",type:"select",default:"both",options:[{value:"horizontal",label:"Horizontal"},{value:"vertical",label:"Vertical"},{value:"both",label:"Both"}]}],passes:[{key:"waveDistort",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uAmount;
          uniform float uFrequency;
          uniform float uAngle;
          uniform float uSpeed;
          uniform float uTime;
          uniform float uMode;
          varying vec2 vUv;
          vec2 fxRotate(vec2 p, float a) {
            float s = sin(a);
            float c = cos(a);
            return mat2(c, -s, s, c) * p;
          }
          void main() {
            float rad = radians(uAngle);
            vec2 c = fxRotate(vUv - 0.5, rad);
            float t = uTime * uSpeed;
            vec2 offset = vec2(0.0);
            if (uMode < 0.5) {
              offset.x = sin(c.y * uFrequency * 6.2831 + t) * uAmount;
            } else if (uMode < 1.5) {
              offset.y = sin(c.x * uFrequency * 6.2831 + t) * uAmount;
            } else {
              offset.x = sin(c.y * uFrequency * 6.2831 + t) * uAmount;
              offset.y = sin(c.x * uFrequency * 6.2831 - t * 1.3) * uAmount;
            }
            vec2 uv = fxRotate(c + offset, -rad) + 0.5;
            gl_FragColor = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
          }
        `,updateUniforms(e,t,a){e.uAmount.value=t.amplitude,e.uFrequency.value=t.frequency,e.uAngle.value=t.angle,e.uSpeed.value=t.speed,e.uTime.value=a,e.uMode.value=t.axis==="horizontal"?0:t.axis==="vertical"?1:2}}]},{id:"twirl",label:"Twirl / Swirl",group:"Distort",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 2.2a5.8 5.8 0 105.8 5.8" stroke-linecap="round"/><path d="M13.8 8a3.4 3.4 0 11-3.4-3.4" opacity="0.6" stroke-linecap="round"/></svg>',params:[{key:"centerX",label:"Center X",min:0,max:1,step:.01,default:.5},{key:"centerY",label:"Center Y",min:0,max:1,step:.01,default:.5},{key:"radius",label:"Radius",min:.05,max:1.2,step:.01,default:.45},{key:"angle",label:"Twist",min:-720,max:720,step:5,default:220},{key:"falloff",label:"Falloff",min:.3,max:4,step:.05,default:1.6}],passes:[{key:"twirl",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform vec2 uCenter;
          uniform float uRadius;
          uniform float uAngle;
          uniform float uFalloff;
          varying vec2 vUv;
          vec2 fxRotate(vec2 p, float a) {
            float s = sin(a);
            float c = cos(a);
            return mat2(c, -s, s, c) * p;
          }
          void main() {
            float aspect = uResolution.x / uResolution.y;
            vec2 c = vUv - uCenter;
            c.x *= aspect;
            float dist = length(c);
            float pct = clamp(1.0 - dist / max(uRadius, 1e-4), 0.0, 1.0);
            float twist = radians(uAngle) * pow(pct, uFalloff);
            vec2 rotated = fxRotate(c, twist);
            rotated.x /= aspect;
            vec2 uv = uCenter + rotated;
            gl_FragColor = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
          }
        `,updateUniforms(e,t){e.uCenter.value.set(t.centerX,t.centerY),e.uRadius.value=t.radius,e.uAngle.value=t.angle,e.uFalloff.value=t.falloff}}]},{id:"perspectiveWarp",label:"Perspective Warp",group:"Distort",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 3h12l-2 10H4L2 3Z"/></svg>',params:[{key:"tiltX",label:"Tilt X",min:-1,max:1,step:.01,default:0},{key:"tiltY",label:"Tilt Y",min:-1,max:1,step:.01,default:.3},{key:"depth",label:"Depth",min:.2,max:3,step:.02,default:1},{key:"scale",label:"Scale",min:.3,max:2.5,step:.02,default:1}],passes:[{key:"perspectiveWarp",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uTiltX;
          uniform float uTiltY;
          uniform float uAmount;
          uniform float uScale;
          varying vec2 vUv;
          void main() {
            vec2 p = (vUv - 0.5) * 2.0;
            float persp = 1.0 + (p.x * uTiltY + p.y * uTiltX) * 0.6 * uAmount;
            persp = max(persp, 0.05);
            vec2 warped = p / persp;
            warped /= uScale;
            vec2 uv = warped * 0.5 + 0.5;
            gl_FragColor = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
          }
        `,updateUniforms(e,t){e.uTiltX.value=t.tiltX,e.uTiltY.value=t.tiltY,e.uAmount.value=t.depth,e.uScale.value=t.scale}}]},{id:"radialBlur",label:"Radial Blur",group:"Blur",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/><path d="M8 8L2 4.5M8 8l7 1M8 8l-3 6.5M8 8l4.5-6" opacity="0.6"/></svg>',params:[{key:"amount",label:"Amount",min:0,max:.4,step:.002,default:.08},{key:"steps",label:"Steps",min:4,max:48,step:1,default:12}],passes:[{key:"radialBlur",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform float uAmount;
          uniform float uSteps;
          varying vec2 vUv;
          void main() {
            vec2 center = vec2(0.5);
            vec2 dir = vUv - center;
            vec4 sum = vec4(0.0);
            const int MAX_STEPS = 48;
            int steps = int(uSteps);
            for (int i = 0; i < MAX_STEPS; i++) {
              if (i >= steps) break;
              float t = float(i) / float(steps - 1);
              sum += texture2D(tDiffuse, vUv - dir * uAmount * t);
            }
            gl_FragColor = sum / float(steps);
          }
        `,updateUniforms(e,t){e.uAmount.value=t.amount,e.uSteps.value=t.steps}}]},{id:"directionalBlur",label:"Directional Blur",group:"Blur",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M1.5 5.5h13M1.5 8h9.5M1.5 10.5h6.5" opacity="0.85"/></svg>',params:[{key:"angle",label:"Angle",min:0,max:360,step:1,default:0},{key:"amount",label:"Amount",min:0,max:40,step:.5,default:12},{key:"steps",label:"Steps",min:4,max:24,step:1,default:12},{key:"randomness",label:"Randomness",min:0,max:1,step:.01,default:0}],passes:[{key:"directionalBlur",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uAngle;
          uniform float uAmount;
          uniform float uSteps;
          uniform float uRandomness;
          varying vec2 vUv;
          ${X}
          void main() {
            float rad = uAngle * 3.14159265 / 180.0;
            vec2 dir = vec2(cos(rad), sin(rad));
            vec2 texel = 1.0 / uResolution;
            vec4 sum = vec4(0.0);
            float total = 0.0;
            const int MAX_N = 24;
            int n = int(uSteps);
            // Per-pixel stable jitter phase (0..1) so the randomness reads as
            // uneven brush-stroke / motion-blur streaking rather than a clean
            // symmetric average, while staying temporally stable (no flicker).
            float jitterPhase = fxHash(vUv * uResolution) - 0.5;
            for (int i = -MAX_N; i <= MAX_N; i++) {
              if (i < -n || i > n) continue;
              float fi = float(i) + jitterPhase * uRandomness * float(n) * 0.7;
              float w = exp(-fi * fi / (float(n) * float(n) * 0.5));
              vec2 offset = dir * texel * fi * uAmount;
              sum += texture2D(tDiffuse, vUv + offset) * w;
              total += w;
            }
            gl_FragColor = sum / max(total, 1e-4);
          }
        `,updateUniforms(e,t){e.uAngle.value=t.angle,e.uAmount.value=t.amount,e.uSteps.value=t.steps,e.uRandomness.value=t.randomness}}]},{id:"uvBlur",label:"UV Blur",group:"Blur",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M1.5 5.5c1.2-1.6 2.4-1.6 3.6 0s2.4 1.6 3.6 0 2.4-1.6 3.6 0" opacity="0.4"/><path d="M1.5 8.5c1.2-1.6 2.4-1.6 3.6 0s2.4 1.6 3.6 0 2.4-1.6 3.6 0" opacity="0.7"/><path d="M1.5 11.5c1.2-1.6 2.4-1.6 3.6 0s2.4 1.6 3.6 0 2.4-1.6 3.6 0" opacity="1"/></svg>',params:[{key:"followDistort",label:"Sync Distort",type:"toggle",default:!0},{key:"strength",label:"Strength",min:0,max:.15,step:.001,default:.05},{key:"noiseType",label:"Noise Type",type:"select",default:"cloud",options:Sn},{key:"scale",label:"Scale",min:1,max:30,step:.5,default:5},{key:"speed",label:"Speed",min:0,max:3,step:.02,default:.4}],passes:[{key:"uvBlur",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform sampler2D tDistortImage;
          uniform float uHasImageDistort;
          uniform float uScale;
          uniform float uSpeed;
          uniform float uTime;
          uniform float uStrength;
          uniform float uNoiseType;
          uniform float uMode; // 0 = manual/fallback noise, 1 = radial (from center), 2 = angular/tangential (swirl), 3 = synced noise field, 4 = image-map direction
          varying vec2 vUv;
          ${X}
          vec2 fxNoiseOffset(vec2 uv, float scale, float speed, float noiseType, float strength) {
            vec2 t = vec2(mod(uTime * speed * 0.15, 1000.0));
            vec2 p1 = uv * scale + t;
            vec2 p2 = uv * scale + t + vec2(17.0, 5.0);
            float n1 = fxNoiseSample(p1, noiseType);
            float n2 = fxNoiseSample(p2, noiseType);
            return (vec2(n1, n2) - 0.5) * strength;
          }
          void main() {
            vec2 offset;
            if (uMode < 0.5) {
              // No distort filter found below (or auto-follow disabled): fall back to an
              // independent noise-driven blur field using this filter's own knobs.
              offset = fxNoiseOffset(vUv, uScale, uSpeed, uNoiseType, uStrength);
            } else if (uMode < 1.5) {
              // Radial distort below: blur radiates outward from the same center, growing
              // toward the edge the same way a bulge/pinch does.
              vec2 dir = vUv - vec2(0.5);
              float d = length(dir);
              vec2 ndir = d > 1e-5 ? dir / d : vec2(0.0);
              offset = ndir * uStrength * 4.0 * d;
            } else if (uMode < 2.5) {
              // Polarize below: blur follows the tangential/rotational direction around the
              // same center, so the blur reads as a swirl instead of a straight streak.
              vec2 dir = vUv - vec2(0.5);
              float d = length(dir);
              vec2 tdir = d > 1e-5 ? vec2(-dir.y, dir.x) / d : vec2(0.0);
              offset = tdir * uStrength * 4.0 * (0.25 + 0.75 * d);
            } else if (uMode < 3.5) {
              // UV Noise / UV Displacement below: reuse the exact same noise field (type,
              // scale, speed all synced from that filter instance) so the blur direction
              // physically matches the distortion that was already applied.
              offset = fxNoiseOffset(vUv, uScale, uSpeed, uNoiseType, uStrength);
            } else {
              // UV Image Displacement below: follow that filter's own displacement map.
              if (uHasImageDistort > 0.5) {
                vec4 dmap = texture2D(tDistortImage, vUv);
                offset = (dmap.rg - 0.5) * uStrength * 4.0;
              } else {
                offset = fxNoiseOffset(vUv, uScale, uSpeed, uNoiseType, uStrength);
              }
            }
            vec4 sum = vec4(0.0);
            float total = 0.0;
            const int N = 8;
            for (int i = -N; i <= N; i++) {
              float tt = float(i) / float(N);
              float w = exp(-tt * tt * 2.0);
              vec2 uv = clamp(vUv + offset * tt, 0.0, 1.0);
              sum += texture2D(tDiffuse, uv) * w;
              total += w;
            }
            gl_FragColor = sum / total;
          }
        `,updateUniforms(e,t,a,n){e.uTime.value=a,e.uStrength.value=t.strength;let o=0,i=t.scale,r=t.speed,s=ya(t.noiseType),c=null;const u=t.followDistort?di(n):null;if(u){const{inst:d,def:f}=u;f.id==="radialDistort"?o=1:f.id==="polarize"?o=2:f.id==="uvNoise"||f.id==="displace"?(o=3,i=d.params.scale,r=d.params.speed,s=ya(d.params.noiseType)):f.id==="imageDisplace"&&(o=4,c=n.compositor?n.compositor.getInstanceTexture(d):null)}e.uMode.value=o,e.uScale.value=i,e.uSpeed.value=r,e.uNoiseType.value=s,e.tDistortImage.value=c,e.uHasImageDistort.value=c?1:0}}]},{id:"curveBlur",label:"Curve Blur",group:"Blur",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M1.5 12.5C4 12.5 4 3.5 8 3.5s4 9 6.5 9" opacity="0.85"/></svg>',params:[{key:"angle",label:"Angle",min:0,max:360,step:1,default:0},{key:"amount",label:"Amount",min:0,max:60,step:.5,default:20},{key:"mode",label:"Curve Mode",type:"select",default:"simple",options:[{value:"simple",label:"Simple"},{value:"advanced",label:"Advanced"}]},{key:"arc",label:"Arc",min:-1,max:1,step:.01,default:.4,showIf:e=>e.mode==="simple"},{key:"arcPosition",label:"Arc Position",min:.05,max:.95,step:.01,default:.5,showIf:e=>e.mode==="simple"},{key:"curve",label:"Bend Curve",type:"curve",showIf:e=>e.mode==="advanced",default:{points:[{x:0,y:0,type:"bezier"},{x:.5,y:.15,type:"bezier"},{x:1,y:1,type:"bezier"}]}}],passes:[{key:"curveBlur",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uAngle;
          uniform float uAmount;
          uniform float uMode;
          uniform float uArc;
          uniform float uArcPosition;
          uniform vec4 uCurvePoints[${we}];
          uniform vec4 uCurveTans[${we}];
          uniform float uCurveCount;
          varying vec2 vUv;
          ${Cn}
          void main() {
            float rad = uAngle * 3.14159265 / 180.0;
            vec2 dir = vec2(cos(rad), sin(rad));
            vec2 perp = vec2(-dir.y, dir.x);
            vec2 texel = 1.0 / uResolution;
            vec4 sum = vec4(0.0);
            float total = 0.0;
            const int N = 10;
            for (int i = -N; i <= N; i++) {
              float t = float(i) / float(N);
              float w = exp(-t * t * 2.0);
              float bend;
              if (uMode < 0.5) {
                // Simple mode: an intuitive tent-shaped bend — Arc Position sets WHERE
                // along the blur streak the curvature peaks, Arc sets HOW MUCH and which
                // direction it bends, with a smooth ease-in/out on both sides of the peak.
                float u = (t + 1.0) * 0.5;
                float peak = clamp(uArcPosition, 0.02, 0.98);
                float local = u < peak ? u / peak : (1.0 - u) / (1.0 - peak);
                local = clamp(local, 0.0, 1.0);
                float tent = local * local * (3.0 - 2.0 * local);
                bend = uArc * tent;
              } else {
                bend = fxCurveEval(abs(t), uCurvePoints, uCurveTans, int(uCurveCount)) * sign(t);
              }
              vec2 offset = (dir * t + perp * bend * 0.6) * texel * uAmount;
              sum += texture2D(tDiffuse, vUv + offset) * w;
              total += w;
            }
            gl_FragColor = sum / total;
          }
        `,updateUniforms(e,t){e.uAngle.value=t.angle,e.uAmount.value=t.amount,e.uMode.value=t.mode==="advanced"?1:0,e.uArc.value=t.arc,e.uArcPosition.value=t.arcPosition;const{points:a,tans:n,count:o}=En(t.curve);for(let i=0;i<a.length;i++)e.uCurvePoints.value[i].set(a[i][0],a[i][1],a[i][2],a[i][3]),e.uCurveTans.value[i].set(n[i][0],n[i][1],n[i][2],n[i][3]);e.uCurveCount.value=o}}]},{id:"bokehBlur",label:"Bokeh Blur",group:"Blur",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1"><circle cx="4.5" cy="5" r="2.3" opacity="0.85"/><circle cx="11" cy="4" r="1.6" opacity="0.6"/><circle cx="10" cy="11" r="2.7" opacity="0.9"/><circle cx="4" cy="11.5" r="1.3" opacity="0.5"/></svg>',params:[{key:"radius",label:"Radius",min:0,max:30,step:.5,default:9},{key:"blades",label:"Blades",min:0,max:8,step:1,default:0},{key:"rotation",label:"Rotation",min:0,max:360,step:1,default:0},{key:"threshold",label:"Highlight Threshold",min:0,max:1,step:.01,default:.55},{key:"boost",label:"Highlight Boost",min:0,max:8,step:.1,default:2.5}],passes:[{key:"bokehBlur",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uRadius;
          uniform float uBlades;
          uniform float uAngle;
          uniform float uThreshold;
          uniform float uIntensity;
          varying vec2 vUv;
          float fxPolyRadius(float angle, float sides) {
            float segment = 6.28318530718 / sides;
            float a = mod(angle, segment) - segment * 0.5;
            return cos(segment * 0.5) / max(cos(a), 1e-3);
          }
          void main() {
            vec2 texel = 1.0 / uResolution;
            vec3 sum = vec3(0.0);
            float total = 0.0;
            const int TAP_COUNT = 32;
            float golden = 2.39996323;
            float rot = radians(uAngle);
            for (int i = 0; i < TAP_COUNT; i++) {
              float fi = float(i);
              float ringT = sqrt((fi + 0.5) / float(TAP_COUNT));
              float ang = fi * golden + rot;
              float shapeR = uBlades >= 3.0 ? fxPolyRadius(ang - rot, uBlades) : 1.0;
              vec2 tapOffset = vec2(cos(ang), sin(ang)) * ringT * shapeR * uRadius * texel;
              vec4 samp = texture2D(tDiffuse, clamp(vUv + tapOffset, 0.0, 1.0));
              float lum = dot(samp.rgb, vec3(0.299, 0.587, 0.114));
              float w = 1.0 + step(uThreshold, lum) * uIntensity;
              sum += samp.rgb * w;
              total += w;
            }
            vec4 center = texture2D(tDiffuse, vUv);
            gl_FragColor = vec4(sum / max(total, 1e-4), center.a);
          }
        `,updateUniforms(e,t){e.uRadius.value=t.radius,e.uBlades.value=t.blades,e.uAngle.value=t.rotation,e.uThreshold.value=t.threshold,e.uIntensity.value=t.boost}}]},{id:"zoomBlur",label:"Zoom Blur",group:"Blur",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/><path d="M8 8L1.5 6M8 8l6.5 -1M8 8l-2 6.5M8 8l2 -6.5" opacity="0.6"/></svg>',params:[{key:"centerX",label:"Center X",min:0,max:1,step:.01,default:.5},{key:"centerY",label:"Center Y",min:0,max:1,step:.01,default:.5},{key:"amount",label:"Amount",min:0,max:.5,step:.002,default:.1},{key:"steps",label:"Steps",min:4,max:48,step:1,default:16}],passes:[{key:"zoomBlur",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uCenter;
          uniform float uAmount;
          uniform float uSteps;
          varying vec2 vUv;
          void main() {
            vec2 dir = vUv - uCenter;
            vec4 sum = vec4(0.0);
            const int MAX_STEPS = 48;
            int steps = int(uSteps);
            for (int i = 0; i < MAX_STEPS; i++) {
              if (i >= steps) break;
              float t = float(i) / float(steps - 1);
              sum += texture2D(tDiffuse, clamp(vUv - dir * uAmount * t, 0.0, 1.0));
            }
            gl_FragColor = sum / float(steps);
          }
        `,updateUniforms(e,t){e.uCenter.value.set(t.centerX,t.centerY),e.uAmount.value=t.amount,e.uSteps.value=t.steps}}]},{id:"tiltShiftBlur",label:"Tilt-Shift Blur",group:"Blur",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1" y="6.5" width="14" height="3" opacity="0.9"/><path d="M1 2.5h14M1 13.5h14" opacity="0.4"/></svg>',params:[{key:"focusPosition",label:"Focus Position",min:0,max:1,step:.01,default:.5},{key:"focusWidth",label:"Focus Width",min:.02,max:.8,step:.01,default:.22},{key:"angle",label:"Angle",min:0,max:360,step:1,default:0},{key:"amount",label:"Blur Amount",min:0,max:6,step:.05,default:2.4}],passes:[{key:"tiltShiftBlur",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uAngle;
          uniform float uAmount;
          uniform float uFocusPos;
          uniform float uFocusWidth;
          uniform vec2 uDirection;
          varying vec2 vUv;
          vec2 fxRotate(vec2 p, float a) {
            float s = sin(a);
            float c = cos(a);
            return mat2(c, -s, s, c) * p;
          }
          void main() {
            vec2 c = vUv - 0.5;
            vec2 rc = fxRotate(c, -radians(uAngle));
            float bandCoord = rc.y - (uFocusPos - 0.5);
            float mask = smoothstep(uFocusWidth * 0.5, uFocusWidth * 0.5 + 0.25, abs(bandCoord));
            float localRadius = uAmount * mask;
            vec2 texel = 1.0 / uResolution;
            vec4 sum = vec4(0.0);
            float total = 0.0;
            for (int i = -6; i <= 6; i++) {
              float w = exp(-float(i * i) / 18.0);
              vec2 offset = uDirection * texel * float(i) * localRadius;
              sum += texture2D(tDiffuse, clamp(vUv + offset, 0.0, 1.0)) * w;
              total += w;
            }
            gl_FragColor = sum / total;
          }
        `,updateUniforms(e,t){e.uAngle.value=t.angle,e.uAmount.value=t.amount,e.uFocusPos.value=t.focusPosition,e.uFocusWidth.value=t.focusWidth,e.uDirection.value.set(1,0)}},{key:"tiltShiftBlur",fragmentShader:null,updateUniforms(e,t){e.uAngle.value=t.angle,e.uAmount.value=t.amount,e.uFocusPos.value=t.focusPosition,e.uFocusWidth.value=t.focusWidth,e.uDirection.value.set(0,1)}}]},{id:"filmEmulation",label:"Film Emulation",group:"Color",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1.5" y="2.5" width="13" height="11" rx="1"/><path d="M1.5 5.2h13M1.5 10.8h13" opacity="0.6"/><circle cx="3.4" cy="3.85" r="0.5" fill="currentColor" stroke="none"/><circle cx="3.4" cy="12.15" r="0.5" fill="currentColor" stroke="none"/><circle cx="12.6" cy="3.85" r="0.5" fill="currentColor" stroke="none"/><circle cx="12.6" cy="12.15" r="0.5" fill="currentColor" stroke="none"/></svg>',params:[{key:"stock",label:"Stock",type:"select",default:"portra",options:[{value:"neutral",label:"Neutral"},{value:"portra",label:"Portra"},{value:"velvia",label:"Velvia"},{value:"trix",label:"Tri-X B&W"},{value:"cinestill",label:"CineStill 800T"},{value:"bleach",label:"Bleach Bypass"}]},{key:"grain",label:"Grain",min:0,max:2,step:.01,default:.45},{key:"grainSize",label:"Grain Size",min:.3,max:6,step:.05,default:1.4},{key:"grainAnimated",label:"Animated Grain",type:"toggle",default:!0},{key:"halation",label:"Halation",min:0,max:3,step:.02,default:.55},{key:"haloSize",label:"Halation Size",min:.5,max:8,step:.1,default:3.2},{key:"contrast",label:"Contrast",min:-1,max:1.5,step:.01,default:.12},{key:"saturation",label:"Saturation",min:0,max:2.2,step:.01,default:1},{key:"fade",label:"Fade",min:0,max:.6,step:.01,default:.08},{key:"temperature",label:"Temperature",min:-1,max:1,step:.01,default:0},{key:"tint",label:"Tint",min:-1,max:1,step:.01,default:0},{key:"vignette",label:"Vignette",min:0,max:2,step:.01,default:.4}],passes:[{key:"filmEmulation",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uTime;
          uniform float uStock;
          uniform float uGrain;
          uniform float uGrainSize;
          uniform float uGrainAnimated;
          uniform float uHalation;
          uniform float uHaloSize;
          uniform float uContrast;
          uniform float uSaturation;
          uniform float uFade;
          uniform float uTemperature;
          uniform float uTintShift;
          uniform float uVignette;
          varying vec2 vUv;
          ${X}
          ${Lt}
          void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            vec3 color = base.rgb;

            // Halation: warm bloom bleeding outward from bright areas — the
            // signature look of film base reflecting light back through
            // missing/thin anti-halation backing (most visible on CineStill).
            vec2 texel = 1.0 / uResolution;
            vec3 halo = vec3(0.0);
            const int HALO_TAPS = 8;
            for (int i = 0; i < HALO_TAPS; i++) {
              float a = 6.28318530718 * float(i) / float(HALO_TAPS);
              vec2 dir = vec2(cos(a), sin(a));
              vec3 c = texture2D(tDiffuse, vUv + dir * texel * uHaloSize).rgb;
              halo += c * smoothstep(0.6, 1.0, fxLum(c));
            }
            halo /= float(HALO_TAPS);

            // Per-stock look: split-tone shadow/highlight tint, grayscale mix
            // (for B&W / bleach-bypass), a baked-in extra contrast punch, and
            // a halation color true to that stock's base.
            vec3 shadowTint = vec3(0.0);
            vec3 highlightTint = vec3(0.0);
            vec3 haloTint = vec3(1.0, 0.72, 0.55);
            float grayMix = 0.0;
            float curveBoost = 0.0;
            if (uStock < 0.5) {
              // Neutral
              haloTint = vec3(1.0, 0.75, 0.6);
            } else if (uStock < 1.5) {
              // Portra — soft warm highlights, faint cool shadows
              shadowTint = vec3(-0.01, 0.005, 0.03);
              highlightTint = vec3(0.05, 0.025, -0.02);
              haloTint = vec3(1.0, 0.62, 0.42);
              curveBoost = 0.12;
            } else if (uStock < 2.5) {
              // Velvia — punchy saturated slide film
              shadowTint = vec3(0.0, -0.01, 0.045);
              highlightTint = vec3(0.06, 0.03, -0.03);
              haloTint = vec3(1.0, 0.5, 0.18);
              curveBoost = 0.32;
            } else if (uStock < 3.5) {
              // Tri-X — classic silver B&W with a faint warm/cool split tone
              shadowTint = vec3(-0.02, -0.008, 0.025);
              highlightTint = vec3(0.03, 0.02, -0.008);
              haloTint = vec3(0.95, 0.9, 0.82);
              grayMix = 1.0;
              curveBoost = 0.38;
            } else if (uStock < 4.5) {
              // CineStill 800T — tungsten-balanced, signature red halation
              shadowTint = vec3(-0.025, 0.01, 0.05);
              highlightTint = vec3(0.015, 0.0, -0.01);
              haloTint = vec3(1.0, 0.14, 0.1);
              curveBoost = 0.18;
            } else {
              // Bleach Bypass — desaturated, crushed blacks, silvery highlights
              shadowTint = vec3(0.015, 0.015, 0.02);
              highlightTint = vec3(0.01, 0.008, 0.0);
              haloTint = vec3(1.0, 0.78, 0.6);
              grayMix = 0.55;
              curveBoost = 0.55;
            }

            color += halo * haloTint * uHalation * 0.6;

            // Saturation
            color = mix(vec3(fxLum(color)), color, uSaturation);

            // White balance push (temperature: warm<->cool, tint: green<->magenta)
            color.r += uTemperature * 0.05 - uTintShift * 0.015;
            color.b -= uTemperature * 0.05 - uTintShift * 0.015;
            color.g += uTintShift * 0.035;

            // Grayscale mix for B&W / bleach-bypass stocks, applied before
            // the split tone so a mono stock can still carry a color cast.
            color = mix(color, vec3(fxLum(color)), grayMix);

            // Filmic S-curve contrast: user amount plus the stock's baked-in punch.
            float totalContrast = clamp(uContrast + curveBoost, -1.0, 2.0);
            color = (color - 0.5) * (1.0 + totalContrast) + 0.5;

            // Lifted blacks ("faded" film look) — raises the floor instead of
            // a flat brightness add so highlights stay intact.
            color = color * (1.0 - uFade) + uFade * 0.5;

            // Split toning: cool cast in shadows, warm cast in highlights (or
            // whatever the stock defines), weighted by luminance.
            float lum1 = fxLum(color);
            color += shadowTint * (1.0 - lum1) + highlightTint * lum1;

            // Film grain: fine hash-speckle layer plus a coarser fbm "clump"
            // layer, shaped to peak in midtones (like real silver-halide
            // grain) and optionally flickering per-frame like a live scan.
            vec2 pixelCoord = vUv * uResolution;
            float grainT = uGrainAnimated > 0.5 ? floor(uTime * 24.0) : 0.0;
            float fine = fxHash(pixelCoord + vec2(grainT * 41.0, grainT * 67.0)) - 0.5;
            float coarse = fxNoise(pixelCoord / max(uGrainSize, 0.05) + vec2(grainT * 13.0, grainT * 19.0)) - 0.5;
            float grain = mix(fine, coarse, 0.35);
            float gLum = fxLum(color);
            float shape = 4.0 * gLum * (1.0 - gLum);
            color += grain * uGrain * shape * 0.5;

            // Vignette
            vec2 vc = vUv - 0.5;
            float vig = 1.0 - dot(vc, vc) * uVignette;
            color *= clamp(vig, 0.0, 1.0);

            gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
          }
        `,updateUniforms(e,t,a){const n={neutral:0,portra:1,velvia:2,trix:3,cinestill:4,bleach:5}[t.stock]??1;e.uStock.value=n,e.uGrain.value=t.grain,e.uGrainSize.value=t.grainSize,e.uGrainAnimated.value=t.grainAnimated?1:0,e.uHalation.value=t.halation,e.uHaloSize.value=t.haloSize,e.uContrast.value=t.contrast,e.uSaturation.value=t.saturation,e.uFade.value=t.fade,e.uTemperature.value=t.temperature,e.uTintShift.value=t.tint,e.uVignette.value=t.vignette,e.uTime.value=a}}]},{id:"silkSheen",label:"Silk Sheen",group:"Effect",icon:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M1.2 4.5c3-2 6-2 7.6 0.4s4.6 2.4 7.6 0.4" opacity="0.9"/><path d="M1.2 8c3-2 6-2 7.6 0.4s4.6 2.4 7.6 0.4" opacity="0.6"/><path d="M1.2 11.5c3-2 6-2 7.6 0.4s4.6 2.4 7.6 0.4" opacity="0.35"/></svg>',params:[{key:"flowType",label:"Fiber Flow",type:"select",default:"linear",options:[{value:"linear",label:"Linear"},{value:"radial",label:"Radial"},{value:"weave",label:"Weave"},{value:"noise",label:"Organic Flow"}]},{key:"flowAngle",label:"Fiber Angle",min:0,max:360,step:1,default:35,showIf:e=>e.flowType!=="radial"},{key:"lightAngle",label:"Light Angle",min:0,max:360,step:1,default:120},{key:"frequency",label:"Fiber Density",min:1,max:40,step:.5,default:10},{key:"strength",label:"Anisotropy",min:0,max:1,step:.01,default:.6},{key:"organic",label:"Organic Warp",min:0,max:1,step:.01,default:.25},{key:"speed",label:"Shimmer Speed",min:0,max:2,step:.02,default:.12},{key:"contentFollow",label:"Follow Image Shape",min:0,max:1,step:.01,default:.7,hint:"How much the sheen bends to wrap around the picture's own edges/contours instead of a flat pattern"},{key:"contentRelief",label:"Image Relief",min:0,max:1,step:.01,default:.5,hint:"Sculpts a pseudo height-field from the image's own brightness so folds catch light like real drape"},{key:"shadowHue",label:"Shadow Hue",min:0,max:360,step:1,default:230},{key:"highlightHue",label:"Highlight Hue",min:0,max:360,step:1,default:45},{key:"saturation",label:"Tint Saturation",min:0,max:1,step:.01,default:.5},{key:"colorize",label:"Recolor Base",min:0,max:1,step:.01,default:0,hint:"0 keeps the image's own colors; higher values push it toward the shadow/highlight hues"},{key:"punch",label:"Highlight Punch",min:0,max:1,step:.01,default:.35},{key:"mix",label:"Blend",min:0,max:1,step:.01,default:.6}],passes:[{key:"silkSheen",fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform vec2 uResolution;
          uniform float uTime;
          uniform float uMode;
          uniform float uAngle;
          uniform float uArc;
          uniform float uFrequency;
          uniform float uStrength;
          uniform float uJitter;
          uniform float uSpeed;
          uniform float uRoughness; // "Follow Image Shape" - how much T bends along image contours
          uniform float uFalloff;   // "Image Relief" - bump-mapped light response from image luminance
          uniform float uShadowHue;
          uniform float uHighlightHue;
          uniform float uSaturation;
          uniform float uChroma;    // "Recolor Base" - 0 keeps original hue, 1 fully recolors
          uniform float uContrast;
          uniform float uMix;
          varying vec2 vUv;
          ${X}
          ${Lt}
          // Tangent ("fiber") direction field at uv, per flow pattern. This is the
          // anisotropy fake: rather than shading a real 3D tangent basis, we build a
          // 2D direction field and stretch noise/highlights along it, which is the
          // same screen-space trick used for brushed-metal/hair-card shaders.
          vec2 silkFlowDir(vec2 uv, float mode, float angleDeg, float freq, float jitter, float t) {
            vec2 centered = uv - 0.5;
            float ang = radians(angleDeg);
            vec2 baseDir = vec2(cos(ang), sin(ang));
            vec2 dir = baseDir;
            if (mode < 0.5) {
              // Linear: constant fiber direction, like a bolt of woven cloth.
              dir = baseDir;
            } else if (mode < 1.5) {
              // Radial: fibers run tangential to the center, like pleated/gathered silk.
              float rl = length(centered) + 1e-4;
              vec2 radial = centered / rl;
              dir = vec2(-radial.y, radial.x);
            } else if (mode < 2.5) {
              // Weave: alternating perpendicular threads in a basket-weave lattice.
              vec2 cell = floor(uv * freq);
              float checker = mod(cell.x + cell.y, 2.0);
              vec2 dirB = vec2(-baseDir.y, baseDir.x);
              dir = checker < 0.5 ? baseDir : dirB;
            } else {
              // Organic Flow: tangent to a domain-warped noise field (curl-noise style)
              // for draped/rumpled fabric with no repeating structure.
              vec2 p = uv * freq * 0.5;
              float e = 0.02;
              float n1 = fxDomainWarp(p + vec2(e, 0.0));
              float n2 = fxDomainWarp(p - vec2(e, 0.0));
              float n3 = fxDomainWarp(p + vec2(0.0, e));
              float n4 = fxDomainWarp(p - vec2(0.0, e));
              vec2 grad = vec2(n1 - n2, n3 - n4);
              dir = normalize(vec2(-grad.y, grad.x) + 1e-5);
            }
            // Organic warp: bends the field a little so straight patterns don't read
            // as perfectly mechanical (real cloth always has some drape/wrinkle).
            if (mode < 2.5) {
              float n = fxFbm(uv * freq * 1.3 + t * 0.05) - 0.5;
              float rot = n * jitter * 1.6;
              float ca = cos(rot);
              float sa = sin(rot);
              dir = mat2(ca, -sa, sa, ca) * dir;
            }
            return normalize(dir);
          }
          void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            float t = uTime * uSpeed * 0.3;
            vec2 centered = vUv - 0.5;
            vec2 texel = 1.0 / max(uResolution, vec2(1.0));

            // Read the image's own luminance around this pixel (3x3 Sobel) so the
            // sheen can actually react to what's drawn instead of floating on top
            // of it. This is the core "generated from the existing image" fix:
            // edges/silhouettes in the artwork now steer the fiber flow and create
            // their own highlight/shadow the way real fabric wraps around a form.
            float sampleR = max(1.0, uFrequency * 0.05);
            vec2 o1 = texel * sampleR;
            float lTL = fxLum(texture2D(tDiffuse, vUv + vec2(-o1.x,  o1.y)).rgb);
            float lTC = fxLum(texture2D(tDiffuse, vUv + vec2( 0.0,   o1.y)).rgb);
            float lTR = fxLum(texture2D(tDiffuse, vUv + vec2( o1.x,  o1.y)).rgb);
            float lML = fxLum(texture2D(tDiffuse, vUv + vec2(-o1.x,  0.0)).rgb);
            float lMR = fxLum(texture2D(tDiffuse, vUv + vec2( o1.x,  0.0)).rgb);
            float lBL = fxLum(texture2D(tDiffuse, vUv + vec2(-o1.x, -o1.y)).rgb);
            float lBC = fxLum(texture2D(tDiffuse, vUv + vec2( 0.0,  -o1.y)).rgb);
            float lBR = fxLum(texture2D(tDiffuse, vUv + vec2( o1.x, -o1.y)).rgb);
            float gx = (lTR + 2.0 * lMR + lBR) - (lTL + 2.0 * lML + lBL);
            float gy = (lBL + 2.0 * lBC + lBR) - (lTL + 2.0 * lTC + lTR);
            float edgeMag = length(vec2(gx, gy));
            vec2 edgeTangent = edgeMag > 1e-5 ? normalize(vec2(-gy, gx)) : vec2(1.0, 0.0);

            // Pattern-driven direction (user-chosen Linear/Radial/Weave/Organic Flow).
            vec2 patternDir = silkFlowDir(vUv, uMode, uAngle, uFrequency, uJitter, t);
            // Only bend toward the image's own contours where real structure exists
            // (smoothstep gate on edge strength) so flat/empty regions keep the
            // clean chosen pattern instead of turning into noise.
            float contentWeight = uRoughness * smoothstep(0.015, 0.22, edgeMag);
            vec2 T = normalize(mix(patternDir, edgeTangent, contentWeight));
            vec2 perp = vec2(-T.y, T.x);

            // Alignment between the fiber direction and a virtual light direction:
            // brightest where the "grain" of the silk points toward the light, exactly
            // the streaky, moving highlight silk/satin is known for.
            vec2 lightDir = vec2(cos(radians(uArc)), sin(radians(uArc)));
            float align = dot(T, lightDir);
            float sharp = mix(2.0, 40.0, uStrength);
            float baseSheen = pow(clamp(align * 0.5 + 0.5, 0.0, 1.0), sharp);

            // Fine fiber texture: noise stretched heavily along T and only lightly
            // across perp, which reads as the tiny parallel thread striations that
            // give silk its characteristic anisotropic sparkle.
            float alongC = dot(centered, T);
            float perpC = dot(centered, perp);
            float fiber = fxFbm(vec2(alongC * 2.0 + t * 0.15, perpC * 22.0));
            float sheenPattern = clamp(baseSheen + (fiber - 0.5) * 0.25 * uStrength, 0.0, 1.0);

            // Image Relief: treat the artwork's own luminance gradient as a bump map
            // and light it directly, so folds/edges that already exist in the image
            // catch or lose the light like real drape - not a generic overlay.
            vec3 N = normalize(vec3(-gx * uFalloff * 3.0, -gy * uFalloff * 3.0, 1.0));
            vec3 L3 = normalize(vec3(lightDir, 0.55));
            vec3 V3 = vec3(0.0, 0.0, 1.0);
            vec3 H3 = normalize(L3 + V3);
            float bumpSpec = pow(clamp(dot(N, H3), 0.0, 1.0), mix(6.0, 70.0, uStrength));
            float lum = fxLum(base.rgb);
            float bumpSheen = clamp(bumpSpec + max(0.0, lum - 0.5) * uFalloff * 0.6, 0.0, 1.0);

            float sheen = clamp(mix(sheenPattern, max(sheenPattern, bumpSheen), uFalloff), 0.0, 1.0);

            // Recolor Base blends between a hue-preserving sheen (keeps the artwork's
            // own colors, just adds a lit/shadowed silk sweep) and the fully tinted
            // shadow/highlight hue palette.
            vec3 shadowTint = fxHsl2rgb(vec3(uShadowHue, uSaturation, 0.4));
            vec3 highlightTint = fxHsl2rgb(vec3(uHighlightHue, uSaturation * 0.7, 0.75));
            vec3 coloredTint = mix(shadowTint, highlightTint, sheen);
            vec3 neutralTint = mix(base.rgb * 0.82, vec3(1.0), sheen);
            vec3 tint = mix(neutralTint, coloredTint, uChroma);

            // Screen-blend the tint by the sheen mask so shadows stay put and only
            // the "wet" highlight streaks lighten/color the surface underneath.
            vec3 screened = 1.0 - (1.0 - base.rgb) * (1.0 - tint * sheen);
            vec3 color = mix(base.rgb, screened, uMix);
            color += vec3(1.0) * pow(sheen, 3.0) * uContrast * 0.5;

            gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
          }
        `,updateUniforms(e,t,a){e.uMode.value=t.flowType==="radial"?1:t.flowType==="weave"?2:t.flowType==="noise"?3:0,e.uAngle.value=t.flowAngle,e.uArc.value=t.lightAngle,e.uFrequency.value=t.frequency,e.uStrength.value=t.strength,e.uJitter.value=t.organic,e.uSpeed.value=t.speed,e.uRoughness.value=t.contentFollow,e.uFalloff.value=t.contentRelief,e.uShadowHue.value=t.shadowHue,e.uHighlightHue.value=t.highlightHue,e.uSaturation.value=t.saturation,e.uChroma.value=t.colorize,e.uContrast.value=t.punch,e.uMix.value=t.mix,e.uTime.value=a}}]}];function Te(e){return Wn.find(t=>t.id===e)||null}function di(e){if(!e||!e.stack||!e.instance)return null;const t=e.stack.indexOf(e.instance);if(t<0)return null;for(let a=t-1;a>=0;a--){const n=e.stack[a];if(!n.enabled)continue;const o=Te(n.defId);if(o&&o.group==="Distort")return{inst:n,def:o}}return null}function ja(e){const t=Te(e);if(!t)return{};const a={};return t.params.forEach(n=>{a[n.key]=n.default&&typeof n.default=="object"?JSON.parse(JSON.stringify(n.default)):n.default}),a}const Dn=`
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
`;class fi{constructor(t){this.canvas=t,this.renderer=new T.WebGLRenderer({canvas:t,alpha:!1,antialias:!1,preserveDrawingBuffer:!0}),this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)),this.renderer.debug.onShaderError=(a,n,o,i)=>{const r=a.getShaderInfoLog(o),s=a.getShaderInfoLog(i),c=a.getProgramInfoLog(n);console.error(`[postfx] Shader compile/link error:
--- vertex log ---
`+r+`
--- fragment log ---
`+s+`
--- program log ---
`+c)},t.addEventListener("webglcontextlost",this._onContextLost=a=>{a.preventDefault(),console.error("[postfx] WebGL context lost on compositor canvas.")}),t.addEventListener("webglcontextrestored",this._onContextRestored=()=>{console.warn("[postfx] WebGL context restored on compositor canvas.")}),this.scene=new T.Scene,this.camera=new T.OrthographicCamera(-1,1,1,-1,0,1),this.quad=new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({vertexShader:kn,fragmentShader:Dn,uniforms:{tDiffuse:{value:null}}})),this.scene.add(this.quad),this.materialCache=new Map,this.canvasTexture=null,this.sourceCanvas=null,this.sourceWidth=0,this.sourceHeight=0,this.uniformResolutionScale=1,this.rtA=null,this.rtB=null,this.width=0,this.height=0}_materialFor(t){let a=this.materialCache.get(t.key);if(a||(a=new T.ShaderMaterial({vertexShader:kn,fragmentShader:t.fragmentShader||Dn,uniforms:{tDiffuse:{value:null},uResolution:{value:new T.Vector2(1,1)},uTime:{value:0},uThreshold:{value:.5},uIntensity:{value:1},uRadius:{value:1},uSteps:{value:4},uAmount:{value:0},uBlend:{value:0},uBlur:{value:0},uBulge:{value:0},uPinch:{value:0},uUseCurve:{value:0},uEdge:{value:0},uScale:{value:1},uSpeed:{value:0},uDirection:{value:new T.Vector2(1,0)},uSize:{value:8},uDotSize:{value:8},uAngle:{value:0},uMono:{value:0},uVariation:{value:.35},uStrength:{value:.35},uOffset:{value:.5},uShadowHue:{value:220},uHighlightHue:{value:40},uSaturation:{value:.65},uMix:{value:.85},uCurvePoints:{value:Array.from({length:we},()=>new T.Vector4(0,0,0,0))},uCurveTans:{value:Array.from({length:we},()=>new T.Vector4(0,0,0,0))},uCurveCount:{value:2},uEdgeShape:{value:0},uEdgeSoftness:{value:.35},uNoiseType:{value:0},uSpin:{value:0},tImage:{value:null},uHasImage:{value:0},uMode:{value:0},tDistortImage:{value:null},uHasImageDistort:{value:0},uGradStops:{value:Array.from({length:Bt},()=>new T.Vector4(0,0,0,0))},uGradCount:{value:2},uContrast:{value:0},uBrightness:{value:0},uBlackPoint:{value:0},uWhitePoint:{value:1},uGamma:{value:1},uHighlights:{value:0},uShadows:{value:0},uHueShift:{value:0},uSatScale:{value:1},uLightness:{value:0},uInvert:{value:0},uShape:{value:0},uColorMode:{value:0},uInkColor:{value:new T.Vector3(0,0,0)},uPaperColor:{value:new T.Vector3(1,1,1)},uRandomness:{value:0},uArc:{value:0},uArcPosition:{value:.5},uRoughness:{value:0},uChroma:{value:0},uCenter:{value:new T.Vector2(.5,.5)},uBlades:{value:0},uFocusPos:{value:.5},uFocusWidth:{value:.2},uFrequency:{value:8},uFalloff:{value:1},uTiltX:{value:0},uTiltY:{value:0},uJitter:{value:0},uStock:{value:1},uGrain:{value:.45},uGrainSize:{value:1.4},uGrainAnimated:{value:1},uHalation:{value:.55},uHaloSize:{value:3.2},uFade:{value:.08},uTemperature:{value:0},uTintShift:{value:0},uVignette:{value:.4},uBrushType:{value:0},uBrushSize:{value:9},uStrokeStrength:{value:.72},uDetail:{value:.55},uEdgeBlend:{value:.6},uStrokePresence:{value:.65}}}),this.materialCache.set(t.key,a)),t.key==="oilPaint"){const n=a.uniforms;n.uBrushType||(n.uBrushType={value:0}),n.uBrushSize||(n.uBrushSize={value:9}),n.uStrokeStrength||(n.uStrokeStrength={value:.72}),n.uDetail||(n.uDetail={value:.55}),n.uEdgeBlend||(n.uEdgeBlend={value:.6}),n.uStrokePresence||(n.uStrokePresence={value:.65}),n.uMix||(n.uMix={value:.85})}return a}getInstanceTexture(t){if(!t)return null;const a=t.params&&t.params.image;if(!a)return t._glTex&&(t._glTex.dispose(),t._glTex=null,t._glTexUrl=null),null;if(t._glTex&&t._glTexUrl===a)return t._glTex;t._glTex&&t._glTex.dispose();const n=new Image,o=new T.Texture(n);return o.minFilter=T.LinearFilter,o.magFilter=T.LinearFilter,o.generateMipmaps=!1,n.onload=()=>{o.needsUpdate=!0},n.src=a,t._glTex=o,t._glTexUrl=a,o}setSource(t){this.sourceCanvas!==t&&(this._recreateCanvasTexture(t),this._debugLoggedThisSource=!1)}_recreateCanvasTexture(t){this.sourceCanvas=t,this.canvasTexture&&this.canvasTexture.dispose(),this.canvasTexture=t?new T.CanvasTexture(t):null,this.canvasTexture&&(this.canvasTexture.minFilter=T.LinearFilter,this.canvasTexture.magFilter=T.LinearFilter,this.canvasTexture.generateMipmaps=!1),this.sourceWidth=t?t.width:0,this.sourceHeight=t?t.height:0}resize(t,a){if(t<=0||a<=0||this.width===t&&this.height===a)return;this.width=t,this.height=a,this.renderer.setSize(t,a,!1);const n=this.renderer.getPixelRatio(),o=Math.max(1,Math.floor(t*n)),i=Math.max(1,Math.floor(a*n));this.rtA&&this.rtA.dispose(),this.rtB&&this.rtB.dispose(),this.rtA=new T.WebGLRenderTarget(o,i,{depthBuffer:!1,stencilBuffer:!1}),this.rtB=new T.WebGLRenderTarget(o,i,{depthBuffer:!1,stencilBuffer:!1})}renderFrame(t,a){if(!this.canvasTexture||!this.rtA||!this.rtB)return;const n=this.sourceCanvas?this.sourceCanvas.width:0,o=this.sourceCanvas?this.sourceCanvas.height:0;(n!==this.sourceWidth||o!==this.sourceHeight)&&this._recreateCanvasTexture(this.sourceCanvas),this.canvasTexture.needsUpdate=!0;const i=[];t.forEach(u=>{if(!u.enabled)return;const d=Te(u.defId);d&&d.passes.forEach(f=>i.push({pass:f,params:u.params,instance:u}))});const r=[this.rtA,this.rtB];let s=this.canvasTexture,c=0;if(i.length===0){const u=this.quad.material;u.uniforms.tDiffuse.value=s,this.renderer.setRenderTarget(null),this.renderer.render(this.scene,this.camera);return}i.forEach(({pass:u,params:d,instance:f},p)=>{const h=p===i.length-1,v=this._materialFor(u);v.uniforms.tDiffuse.value=s;const m=Math.max(1e-6,this.uniformResolutionScale||1);v.uniforms.uResolution.value.set(this.rtA.width/m,this.rtA.height/m),u.updateUniforms(v.uniforms,d,a,{instance:f,compositor:this,stack:t}),this.quad.material=v;const g=h?null:r[c%2];this.renderer.setRenderTarget(g),this.renderer.render(this.scene,this.camera),h||(s=g.texture,c+=1)})}captureAtScale(t,a,n){if(!this.width||!this.height)return null;const o=this.renderer.getPixelRatio(),i=this.rtA,r=this.rtB,s=Math.max(.01,Number(n)||1),c=o*s,u=Math.max(1,Math.floor(this.width*c)),d=Math.max(1,Math.floor(this.height*c));this.renderer.setPixelRatio(c),this.renderer.setSize(this.width,this.height,!1),this.rtA=new T.WebGLRenderTarget(u,d,{depthBuffer:!1,stencilBuffer:!1}),this.rtB=new T.WebGLRenderTarget(u,d,{depthBuffer:!1,stencilBuffer:!1});let f=null;try{this.uniformResolutionScale=s,this.renderFrame(t,a),f=this.canvas.toDataURL("image/png")}finally{this.uniformResolutionScale=1,this.rtA.dispose(),this.rtB.dispose(),this.rtA=i,this.rtB=r,this.renderer.setPixelRatio(o),this.renderer.setSize(this.width,this.height,!1),this.renderFrame(t,a)}return f?{dataUrl:f,width:u,height:d}:null}dispose(){this.materialCache.forEach(t=>t.dispose()),this.materialCache.clear(),this.canvasTexture&&this.canvasTexture.dispose(),this.rtA&&this.rtA.dispose(),this.rtB&&this.rtB.dispose(),this._onContextLost&&this.canvas.removeEventListener("webglcontextlost",this._onContextLost),this._onContextRestored&&this.canvas.removeEventListener("webglcontextrestored",this._onContextRestored),this.renderer.dispose()}}const pi="/assets/Default-DtKDocRU.png",Se="shaderops:active-profile:v1",We="shaderops:profiles:v1",ct="shaderops:profile:",jn="shaderops-profile",mi=2,_t="shaderops:profile-default-migration:v2",Zt="shaderops:project-previews:v1",hi="shaderops:unified-checkpoints:",Ma="__deleted__:",Vn=1,vi=4e6,gi=[{maxDimension:180,quality:.52},{maxDimension:112,quality:.4},{maxDimension:80,quality:.32},{maxDimension:56,quality:.25}];function y(){return window.localStorage}function je(e,t){try{const a=JSON.parse(e);return a&&typeof a=="object"?a:t}catch{return t}}function Xn(e){return String(e||"").trim().replace(/\s+/g," ").slice(0,48)}function Kn(){return`profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`}function Re(){const e=je(y().getItem(We),[]);return Array.isArray(e)?e.filter(t=>t&&typeof t.id=="string"&&typeof t.name=="string"):[]}function Le(){const e=y().getItem(Se);return Re().find(t=>t.id===e)||null}function yi(){if(y().getItem(_t)==="1")return;const e=Le();if(!e)return;const t=`${ct}${e.id}:`,a=[];for(let n=0;n<y().length;n++){const o=y().key(n);o?.startsWith(t)&&a.push([o,o.slice(t.length),y().getItem(o)])}a.forEach(([n,o,i])=>{let r=i;o===Zt&&(r=Yn(y().getItem(o),i)),y().removeItem(n),y().removeItem(o),y().setItem(o,r)}),y().setItem(_t,"1")}function bi(e){const t=Xn(e);if(!t)throw new Error("A profile name is required.");const a={id:Kn(),name:t,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},n=[...Re(),a];return y().setItem(We,JSON.stringify(n)),y().setItem(Se,a.id),a}function xi(e){const t=Re();if(!t.some(o=>o.id===e))throw new Error("This profile is not available on this computer.");const a=`${ct}${e}:`;for(let o=y().length-1;o>=0;o--){const i=y().key(o);i?.startsWith(a)&&y().removeItem(i)}const n=t.filter(o=>o.id!==e);return y().setItem(We,JSON.stringify(n)),y().getItem(Se)===e&&(n[0]?y().setItem(Se,n[0].id):y().removeItem(Se)),n[0]||null}function Va(e){const t=Re().find(a=>a.id===e);if(!t)throw new Error("This profile is not available on this computer.");return y().setItem(Se,t.id),t}function Xa(){return Le()?.id||"default"}function Ot(e,t=Xa()){return`${ct}${t}:${e}`}function Ia(e,t){return Ot(`${Ma}${e}`,t)}function Yn(e,t){const a=je(e,{}),n=je(t,{});if(n?.version!==Vn||!n.values)return JSON.stringify({...a,...n});const o={...a,...n.values};return Array.isArray(n.deleted)&&n.deleted.forEach(i=>delete o[i]),JSON.stringify(o)}function wi(e,t){const a=je(e,{}),n=je(t,{}),o={};Object.entries(n).forEach(([r,s])=>{a[r]!==s&&(o[r]=s)});const i=Object.keys(a).filter(r=>!(r in n));return JSON.stringify({version:Vn,values:o,deleted:i})}function Ka(e,t){if(y().getItem(Ia(e,t))!==null)return null;const a=y().getItem(Ot(e,t)),n=y().getItem(e);return a===null?n:e===Zt?Yn(n,a):a}function Ba(e){const t=new Set,a=`${ct}${e}:`;for(let n=0;n<y().length;n++){const o=y().key(n);if(o?.startsWith("shaderops:")&&!o.startsWith(ct)&&o!==Se&&o!==We&&o!==_t)t.add(o);else if(o?.startsWith(a)){const i=o.slice(a.length);t.add(i.startsWith(Ma)?i.slice(Ma.length):i)}}return[...t].filter(n=>Ka(n,e)!==null)}function Mn(e){const t=Re(),a=t.find(n=>n.id===e);a&&(a.updatedAt=new Date().toISOString(),y().setItem(We,JSON.stringify(t)))}function ki(){const e=Xa();return{getItem(t){return Ka(t,e)},setItem(t,a){y().removeItem(Ia(t,e));const n=t===Zt?wi(y().getItem(t),String(a)):String(a);y().setItem(Ot(t,e),n),Mn(e)},removeItem(t){y().removeItem(Ot(t,e)),y().setItem(Ia(t,e),"1"),Mn(e)},key(t){return Ba(e)[t]??null},get length(){return Ba(e).length}}}function Si(e=Xa()){const t=Re().find(n=>n.id===e);if(!t)throw new Error("This profile is not available on this computer.");const a={};return Ba(e).forEach(n=>{a[n]=Ka(n,e)}),{format:jn,version:mi,exportedAt:new Date().toISOString(),profile:{name:t.name,createdAt:t.createdAt},entries:a}}function Ci(e){return new Promise((t,a)=>{const n=new Image;n.onload=()=>t(n),n.onerror=()=>a(new Error("Unable to read a saved preview image.")),n.src=e})}async function Jn(e,t,a){if(typeof e!="string"||!e.startsWith("data:image/"))return e;try{const n=await Ci(e),o=Math.min(1,t/Math.max(n.naturalWidth,n.naturalHeight)),i=Math.max(1,Math.round(n.naturalWidth*o)),r=Math.max(1,Math.round(n.naturalHeight*o)),s=document.createElement("canvas");s.width=i,s.height=r,s.getContext("2d").drawImage(n,0,0,i,r);let c=s.toDataURL("image/webp",a);return c.startsWith("data:image/webp")||(c=s.toDataURL("image/jpeg",a)),c.length<e.length?c:e}catch{return e}}async function Ei(e,t,a){const n=je(e,null);if(!n||Array.isArray(n))return e;const o={};for(const[i,r]of Object.entries(n))o[i]=await Jn(r,t,a);return JSON.stringify(o)}async function Di(e,t,a){const n=je(e,null);if(!n||!Array.isArray(n.slots))return e;const o=[];for(const i of n.slots)o.push(i&&typeof i=="object"&&typeof i.preview=="string"?{...i,preview:await Jn(i.preview,t,a)}:i);return JSON.stringify({...n,slots:o})}async function Mi(e,t,a){const n={...e.entries};for(const[o,i]of Object.entries(n))o===Zt?n[o]=await Ei(i,t,a):o.startsWith(hi)&&(n[o]=await Di(i,t,a));return{...e,entries:n}}async function Zn(e){let t=e;for(const a of gi)if(t=await Mi(e,a.maxDimension,a.quality),JSON.stringify(t).length*2<=vi)break;return t}function Ii(e,t){if(!e||e.format!==jn||!e.entries||typeof e.entries!="object")throw new Error("This is not a valid ShaderOps profile recovery file.");const a=Object.entries(e.entries).filter(([o,i])=>typeof o=="string"&&o.startsWith("shaderops:")&&!o.startsWith(ct)&&o!==Se&&o!==We&&o!==_t&&typeof i=="string"),n=[];for(let o=0;o<y().length;o++){const i=y().key(o);i?.startsWith("shaderops:")&&n.push([i,y().getItem(i)])}try{n.forEach(([i])=>y().removeItem(i)),a.forEach(([i,r])=>y().setItem(i,r));const o={id:Kn(),name:Xn(t||e.profile?.name||"Recovered Profile"),createdAt:e.profile?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};return y().setItem(We,JSON.stringify([o])),y().setItem(Se,o.id),o}catch(o){for(let i=y().length-1;i>=0;i--){const r=y().key(i);r?.startsWith("shaderops:")&&y().removeItem(r)}throw n.forEach(([i,r])=>y().setItem(i,r)),new Error(o instanceof DOMException&&o.name==="QuotaExceededError"?"This recovery file is larger than this browser allows. The previous workspace was restored.":"Unable to restore this recovery file. The previous workspace was restored.")}}yi();const S=ki(),Qn="shaderops:project-previews:v1",zt="shaderops:selected-project:v1",eo="shaderops:filters:v1",to="shaderops:favorites:v1",ao="shaderops:project-order:v1",no="shaderops:filter-add-order:v1",Ya="shaderops:filter-rail-collapsed:v1",oo="shaderops:curve-popup-size:v1",io="shaderops-state",Pa=1,Bi=400,Pi="shaderops:image-loader:v1:",ht="shaderops://image/default",Xe="Default",At=[];function Li(e){const t=e.ownerDocument,a=t.createElement("div");a.className="w-pill";const n=t.createElement("div");n.className="w-pill__fill",a.appendChild(n);let o=null;const i=()=>{const s=e.dataset.pillMode||"",c=`${e.value}|${s}`;if(c===o)return;o=c;const u=Number(e.min)||0,d=Number(e.max)||100,f=Number(e.value),p=d===u?0:Math.min(1,Math.max(0,(f-u)/(d-u)));if(s==="center-zero"&&u<0&&d>0){const h=Math.min(1,Math.max(0,(0-u)/(d-u))),v=Math.min(p,h),m=Math.abs(p-h);a.classList.add("w-pill--center"),a.style.setProperty("--pill-center",`${(h*100).toFixed(3)}%`),n.classList.toggle("is-tip-left",p<h),n.style.left=`${(v*100).toFixed(3)}%`,n.style.width=`${(m*100).toFixed(3)}%`;return}a.classList.remove("w-pill--center"),a.style.removeProperty("--pill-center"),n.classList.remove("is-tip-left"),n.style.left="0%",n.style.width=`${(p*100).toFixed(3)}%`};i();const r=(s,c)=>{const u=a.getBoundingClientRect(),d=Number(e.min)||0,f=Number(e.max)||100,p=Number(e.step)||1,h=u.width===0?0:Math.min(1,Math.max(0,(s-u.left)/u.width));let v=d+h*(f-d);v=Math.round(v/p)*p,v=Math.min(f,Math.max(d,v)),e.value=String(Number(v.toFixed(6))),e.dispatchEvent(new Event("input",{bubbles:!0})),c||e.dispatchEvent(new Event("change",{bubbles:!0})),i()};return a.addEventListener("pointerdown",s=>{s.preventDefault(),a.setPointerCapture(s.pointerId),r(s.clientX,!0);const c=d=>r(d.clientX,!0),u=d=>{a.removeEventListener("pointermove",c),a.removeEventListener("pointerup",u),a.removeEventListener("pointercancel",u),r(d.clientX,!1)};a.addEventListener("pointermove",c),a.addEventListener("pointerup",u),a.addEventListener("pointercancel",u)}),e.insertAdjacentElement("beforebegin",a),e.style.display="none",e.dataset.pillMounted="1",{slider:e,paint:i}}function Ja(e){if(!e)return;e.querySelectorAll('.control-row input[type="range"], .filter-param-row input[type="range"]').forEach(a=>{a.dataset.pillMounted||At.push(Li(a))})}(function(){const t=()=>{for(let a=At.length-1;a>=0;a--){const n=At[a];if(!n.slider.isConnected){At.splice(a,1);continue}n.paint()}requestAnimationFrame(t)};requestAnimationFrame(t)})();const Ai=document.getElementById("app");document.documentElement.classList.toggle("app-client-shell",navigator.userAgent.includes("Electron"));Ai.innerHTML=`
  <main class="app-shell">
    <div class="window-dragbar">
      <div class="window-dragbar__title">ShaderOps</div>
      <div class="window-dragbar__actions">
        <button id="topbarReloadButton" class="window-dragbar__btn" type="button" title="Reload window">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M13.8 6.9a6 6 0 1 0 1 3.3" />
            <path d="M13.8 2.2v4.7H9.1" />
          </svg>
        </button>
      </div>
    </div>
    <aside class="left-rail">
      <div class="rail-brand" title="ShaderOps">
        <svg class="brand-icon" width="26" height="18" viewBox="0 0 26 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="9" cy="9" r="8" fill="none" stroke="rgba(255,255,255,0.50)" stroke-width="0.9"/>
          <circle cx="17" cy="9" r="8" fill="none" stroke="rgba(255,255,255,0.50)" stroke-width="0.9"/>
        </svg>
      </div>
      <button id="navGridButton" class="nav-grid-button" type="button" title="Browse all effects">
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="1.5" y="1.5" width="5" height="5" rx="1.1" fill="currentColor" opacity=".85" />
          <rect x="9.5" y="1.5" width="5" height="5" rx="1.1" fill="currentColor" opacity=".85" />
          <rect x="1.5" y="9.5" width="5" height="5" rx="1.1" fill="currentColor" opacity=".85" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1.1" fill="currentColor" opacity=".85" />
        </svg>
      </button>
      <div id="projectList" class="thumb-list"></div>
      <div id="navPager" class="nav-pager" hidden>
        <span id="navPagerLabel" class="nav-pager-label">1 / 1</span>
      </div>
      <div id="navGridPanel" class="nav-grid-panel" hidden>
        <div class="nav-grid-section">
          <h4>Favorites</h4>
          <div id="navGridFav" class="nav-grid-grid"></div>
        </div>
        <div class="nav-grid-section">
          <h4>2D Effects</h4>
          <div id="navGrid2d" class="nav-grid-grid"></div>
        </div>
        <div class="nav-grid-section">
          <h4>3D Effects</h4>
          <div id="navGrid3d" class="nav-grid-grid"></div>
        </div>
      </div>
    </aside>
    <section class="workspace">
      <header class="workspace-header">
        <div class="workspace-title-group">
          <div class="workspace-title-row">
            <h1 id="projectTitle">Loading...</h1>
            <button id="deleteProjectButton" class="delete-button" type="button" title="Delete selected project" disabled>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 4.5h10M6.2 4.5V3.3a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v1.2M4.3 4.5l.6 8.3a1 1 0 0 0 1 .9h4.2a1 1 0 0 0 1-.9l.6-8.3" />
                <path d="M6.6 7.2v4M9.4 7.2v4" />
              </svg>
            </button>
          </div>
          <p id="projectMethod">â€”</p>
        </div>
        <div class="workspace-header-actions">
          <button id="profileButton" class="header-fx-btn" type="button" title="Profile and recovery">
            <svg class="filter-btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="8" cy="5.1" r="2.6" />
              <path d="M3 14c.45-2.65 2.1-4 5-4s4.55 1.35 5 4" />
            </svg>
            <span id="profileButtonName">Profile</span>
          </button>
          <button id="filterExportButton" class="header-fx-btn" type="button" disabled title="Export PNG">
            <svg class="filter-btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 1v9M8 10 4.7 6.7M8 10l3.3-3.3" />
              <path d="M2 11.5v1.8a1.2 1.2 0 0 0 1.2 1.2h9.6a1.2 1.2 0 0 0 1.2-1.2v-1.8" />
            </svg>
            <span>Export</span>
          </button>
          <button id="filterCopyButton" class="header-fx-btn icon-only" type="button" disabled title="Copy PNG to clipboard">
            <svg class="filter-btn-icon icon-default" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.4" />
              <path d="M3.3 10.2H2.7A1.2 1.2 0 0 1 1.5 9V2.7A1.2 1.2 0 0 1 2.7 1.5H9a1.2 1.2 0 0 1 1.2 1.2v.6" />
            </svg>
            <svg class="filter-btn-icon icon-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.5 8.5 6 12l7.5-7.5" />
            </svg>
          </button>
        </div>
      </header>
      <div class="shader-stage" id="shaderStage">
        <iframe id="projectFrame" title="Shader project preview"></iframe>
        <canvas id="fxCanvas" class="fx-canvas"></canvas>
        <div id="unifiedPanel" class="unified-panel" hidden>
          <button id="unifiedPanelGear" class="unified-panel-gear" type="button" title="Show controls">&#9881;</button>
          <div class="unified-panel-body">
            <div id="unifiedPanelGroups" class="unified-panel-groups"></div>
            <div class="unified-panel-actions">
              <button id="unifiedPauseButton" type="button" title="Pause (Space)">
                <svg class="icon-play" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5-9-5.5Z"/></svg>
                <svg class="icon-pause is-hidden" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1"/><rect x="9.5" y="2.5" width="3" height="11" rx="1"/></svg>
              </button>
              <button id="unifiedDiceButton" type="button" title="All random (R)">
                <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <rect x="1.5" y="1.5" width="13" height="13" rx="3" stroke="currentColor" stroke-width="1.3"></rect>
                  <circle cx="5" cy="5" r="1.15" fill="currentColor"></circle>
                  <circle cx="11" cy="5" r="1.15" fill="currentColor"></circle>
                  <circle cx="8" cy="8" r="1.15" fill="currentColor"></circle>
                  <circle cx="5" cy="11" r="1.15" fill="currentColor"></circle>
                  <circle cx="11" cy="11" r="1.15" fill="currentColor"></circle>
                </svg>
              </button>
              <button id="unifiedWaveButton" type="button" title="Reroll seed">
                <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M1 9c1.4-3 2.8-4.5 4.2-4.5S7.6 7 9 7s3.6-2.5 5-2.5S16.4 6 16.4 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </button>
              <div class="history-actions">
                <button id="unifiedUndoButton" type="button" title="Undo">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.6 4.2 3 7.8l3.6 3.6"/><path d="M3 7.8h6.6a3.7 3.7 0 1 1 0 7.4H8"/></svg>
                </button>
                <button id="unifiedRedoButton" type="button" title="Redo">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.4 4.2 13 7.8l-3.6 3.6"/><path d="M13 7.8H6.4a3.7 3.7 0 1 0 0 7.4H8"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div id="globalCheckpoints" class="global-checkpoints" hidden>
          <span class="ucp-flag" title="Checkpoints â€” save and recall versions of this look">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 2.5h8.5L13.5 4.5v9H3z"></path>
              <path d="M5 2.5v4h5v-4"></path>
              <rect x="5.1" y="9" width="5.8" height="2.8" rx="0.6"></rect>
            </svg>
          </span>
          <div class="ucp-slots" id="unifiedCheckpointSlots"></div>
          <span class="ucp-btn-shell ucp-add-shell" id="unifiedCheckpointAddShell">
            <button type="button" class="ucp-add" id="unifiedCheckpointAdd" title="Hold 0.8s to save the current look as a new checkpoint">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
            </button>
            <svg class="ucp-ring" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13.3" pathLength="100"></circle></svg>
          </span>
        </div>
      </div>
    </section>
    <aside class="filter-rail" id="filterRail">
      <button id="filterRailGear" class="filter-rail-gear" type="button" title="Show filters">&#10010;</button>
      <div class="filter-rail-panel">
        <div class="filter-rail-header">
          <label class="filter-preview-toggle" title="Preview filtered">
            <span class="fx-eye-toggle">
              <input type="checkbox" id="filterPreviewToggle" />
              <svg class="eye-icon eye-icon-open" viewBox="0 0 24 16" aria-hidden="true">
                <path d="M1.5 8s2.7-5.5 10.5-5.5S22.5 8 22.5 8 19.8 13.5 12 13.5 1.5 8 1.5 8Z"></path>
                <circle cx="12" cy="8" r="2.8"></circle>
              </svg>
              <svg class="eye-icon eye-icon-closed" viewBox="0 0 24 16" aria-hidden="true">
                <path d="M1.5 8s2.7-5.5 10.5-5.5S22.5 8 22.5 8 19.8 13.5 12 13.5 1.5 8 1.5 8Z"></path>
                <circle cx="12" cy="8" r="2.8"></circle>
                <line x1="2" y1="1" x2="22" y2="15"></line>
              </svg>
            </span>
          </label>
          <span class="filter-rail-title">Filters</span>
          <button id="filterRailCollapse" class="rail-collapse-btn" type="button" title="Collapse filters">&rsaquo;</button>
        </div>
        <div class="filter-add-wrap">
          <button id="filterAddButton" class="filter-add-trigger" type="button">
            <span class="filter-add-plus">+</span> Add Filter
          </button>
          <div id="filterAddMenu" class="filter-add-menu" hidden></div>
        </div>
        <div id="filterStackList" class="filter-stack-list"></div>
        <div class="filter-stack-empty" id="filterStackEmpty">No filters yet. Add one above â€” it stacks on top of the shader's own render.</div>
        <p class="filter-order-hint">Top of stack applies last. Drag filters to reorder.</p>
      </div>
    </aside>
    <div id="navGridBackdrop" class="nav-grid-backdrop" hidden></div>
  </main>
  <aside id="thumbHoverPreview" class="thumb-hover-preview" hidden aria-hidden="true">
    <div class="thumb-hover-preview__title" id="thumbHoverPreviewTitle"></div>
    <div class="thumb-hover-preview__hero" id="thumbHoverPreviewHero"></div>
    <div class="thumb-hover-preview__checkpoints" id="thumbHoverPreviewCheckpoints"></div>
  </aside>
  <div id="deleteConfirmOverlay" class="export-size-overlay" hidden>
    <div class="export-size-modal">
      <h2 class="export-size-title">Delete Effect?</h2>
      <p class="export-size-current" id="deleteConfirmMessage">This removes its files permanently and cannot be undone.</p>
      <button type="button" class="delete-confirm-btn" id="deleteConfirmButton">Delete</button>
      <button type="button" class="export-size-cancel" id="deleteConfirmCancel">Cancel</button>
    </div>
  </div>
  <div id="exportSizeOverlay" class="export-size-overlay" hidden>
    <div class="export-size-modal">
      <h2 class="export-size-title">Export Size</h2>
      <p class="export-size-current">Current size: <span id="exportSizeCurrent">&mdash;</span></p>
      <div class="export-size-options" id="exportSizeOptions">
        <button type="button" class="export-size-option" data-scale="0.5">&times;0.5</button>
        <button type="button" class="export-size-option" data-scale="1">&times;1</button>
        <button type="button" class="export-size-option" data-scale="1.5">&times;1.5</button>
        <button type="button" class="export-size-option" data-scale="2">&times;2</button>
      </div>
      <div class="export-batch">
        <h3 class="export-batch-title">Batch Export</h3>
        <div class="export-batch-grid">
          <label class="export-batch-field">
            <span>Count</span>
            <input id="exportBatchCount" type="number" min="1" max="200" step="1" value="8" />
          </label>
          <label class="export-batch-field">
            <span>Scale</span>
            <input id="exportBatchScale" type="number" min="0.1" max="4" step="0.5" value="1" />
          </label>
          <label class="export-batch-field export-batch-field--full">
            <span>Variation</span>
            <select id="exportBatchMode">
              <option value="all-random">All Random (respects locked controls)</option>
              <option value="seed">Seed only (reroll seed each image)</option>
            </select>
          </label>
        </div>
        <div class="export-batch-path">
          <p class="export-batch-path-label">Batch Path: <span id="exportBatchPathName">Not set</span></p>
          <div class="export-batch-path-actions">
            <button type="button" class="export-batch-path-btn" id="exportBatchChoosePath">Set Folder</button>
            <button type="button" class="export-batch-path-btn export-batch-path-btn--clear" id="exportBatchClearPath">Clear</button>
          </div>
        </div>
        <button type="button" class="export-batch-run" id="exportBatchRun">Run Batch Export</button>
        <p class="export-batch-status" id="exportBatchStatus" aria-live="polite"></p>
      </div>
      <button type="button" class="export-size-cancel" id="exportSizeCancel">Cancel</button>
    </div>
  </div>
  <div id="profileOverlay" class="profile-overlay" hidden>
    <section class="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profileDialogTitle">
      <div class="profile-dialog__eyebrow">ShaderOps</div>
      <h2 id="profileDialogTitle">Your workspace</h2>
      <p id="profileDialogDescription" class="profile-dialog__description">Your favorites, checkpoints, looks, and filters save automatically on this computer.</p>
      <label class="profile-dialog__label" for="profileNameInput">Profile name</label>
      <input id="profileNameInput" class="profile-dialog__input" type="text" maxlength="48" autocomplete="name" placeholder="Your name" />
      <div id="profileExistingList" class="profile-existing-list" hidden></div>
      <p id="profileRestoreHint" class="profile-dialog__hint" hidden>Restore replaces this browser's ShaderOps workspace with the recovery file. If it fails, the current workspace is restored automatically.</p>
      <p id="profileDialogStatus" class="profile-dialog__status" aria-live="polite"></p>
      <div class="profile-dialog__actions">
        <button id="profileContinueButton" class="profile-dialog__primary" type="button">Continue</button>
        <button id="profileDownloadButton" class="profile-dialog__secondary" type="button" hidden>Download recovery file</button>
        <label id="profileRestoreLabel" class="profile-dialog__secondary profile-dialog__restore" hidden>
          Restore recovery file
          <input id="profileRestoreInput" type="file" accept="application/json,.json" hidden />
        </label>
      </div>
    </section>
  </div>
`;const l={projects:[],selectedId:null,previews:{},captureInFlight:!1,prewarmQueue:[],prewarmActive:!1,filterStacks:{},filterPreviewOn:{},filterHistory:{},navPage:0,favorites:[]},oe=document.getElementById("projectList"),La=document.getElementById("projectTitle"),Aa=document.getElementById("projectMethod"),D=document.getElementById("projectFrame"),Ta=document.getElementById("deleteProjectButton"),Qt=document.getElementById("navGridButton"),at=document.getElementById("navPager"),Ti=document.getElementById("navPagerLabel"),j=document.getElementById("navGridPanel"),Za=document.getElementById("navGridBackdrop"),Ra=document.getElementById("navGridFav"),Fa=document.getElementById("navGrid2d"),Na=document.getElementById("navGrid3d"),Qa=document.getElementById("shaderStage"),R=document.getElementById("fxCanvas"),en=document.getElementById("filterRail"),Ri=document.getElementById("filterRailGear"),Fi=document.getElementById("filterRailCollapse"),ea=document.getElementById("filterAddButton"),J=document.getElementById("filterAddMenu"),_=document.getElementById("filterStackList"),Ni=document.getElementById("filterStackEmpty"),Ht=document.getElementById("filterPreviewToggle"),ro=document.getElementById("filterExportButton"),me=document.getElementById("filterCopyButton"),$i=document.getElementById("profileButton"),Ui=document.getElementById("profileButtonName"),Tt=document.getElementById("profileOverlay"),_i=document.getElementById("profileDialogTitle"),Oi=document.getElementById("profileDialogDescription"),St=document.getElementById("profileNameInput"),ba=document.getElementById("profileExistingList"),zi=document.getElementById("profileRestoreHint"),Ce=document.getElementById("profileDialogStatus"),lo=document.getElementById("profileContinueButton"),so=document.getElementById("profileDownloadButton"),Hi=document.getElementById("profileRestoreLabel"),$a=document.getElementById("profileRestoreInput"),qt=document.getElementById("exportSizeOverlay"),qi=document.getElementById("exportSizeCurrent"),Ua=document.getElementById("exportSizeOptions"),Gi=document.getElementById("exportSizeCancel"),K=document.getElementById("exportBatchCount"),qe=document.getElementById("exportBatchScale"),Wi=document.getElementById("exportBatchMode"),Rt=document.getElementById("exportBatchRun"),In=document.getElementById("exportBatchStatus"),Bn=document.getElementById("exportBatchPathName"),_a=document.getElementById("exportBatchChoosePath"),tn=document.getElementById("exportBatchClearPath"),nt=document.getElementById("deleteConfirmOverlay"),ji=document.getElementById("deleteConfirmMessage"),Vi=document.getElementById("deleteConfirmButton"),Xi=document.getElementById("deleteConfirmCancel"),vt=document.getElementById("unifiedPanel"),Ki=document.getElementById("unifiedPanelGear"),Ft=document.getElementById("unifiedPanelGroups"),co=document.getElementById("globalCheckpoints"),Yi=document.getElementById("unifiedDiceButton"),Ji=document.getElementById("unifiedWaveButton"),Nt=document.getElementById("unifiedPauseButton"),Zi=document.getElementById("unifiedUndoButton"),Qi=document.getElementById("unifiedRedoButton"),xa=document.getElementById("unifiedCheckpointSlots"),uo=document.getElementById("unifiedCheckpointAddShell");document.getElementById("unifiedCheckpointAdd");const er=document.getElementById("topbarReloadButton"),re=document.getElementById("thumbHoverPreview"),tr=document.getElementById("thumbHoverPreviewTitle"),fo=document.getElementById("thumbHoverPreviewHero"),Pn=document.getElementById("thumbHoverPreviewCheckpoints");let po="settings";function ar(){Ui.textContent=Le()?.name||"Profile"}function nr(e){try{Va(e),window.location.reload()}catch(t){Ce.textContent=t instanceof Error?t.message:"Unable to switch profile."}}function mo(){const e=D.contentWindow;try{e?.ShaderOpsControls?.suspendPersistence?.()}catch{}l.selectedId&&e?.postMessage({type:"shaderops/suspend-persistence",projectId:l.selectedId},"*")}function ho(){const e=D.contentWindow;try{e?.ShaderOpsControls?.resumePersistence?.()}catch{}l.selectedId&&e?.postMessage({type:"shaderops/resume-persistence",projectId:l.selectedId},"*")}function vo(){const e=Re(),t=Le()?.id;ba.replaceChildren(),ba.hidden=e.length===0,e.forEach(a=>{const n=document.createElement("span");n.className=`profile-existing-list__item${a.id===t?" is-active":""}`;const o=document.createElement("button");o.type="button",o.className="profile-existing-list__switch",o.textContent=a.name,o.title=`Switch to ${a.name}`,o.addEventListener("click",()=>nr(a.id));const i=document.createElement("button");i.type="button",i.className="profile-existing-list__delete",i.textContent="×",i.title=`Delete ${a.name}`,i.setAttribute("aria-label",`Delete ${a.name}`),i.addEventListener("click",()=>{if(!window.confirm(`Delete profile "${a.name}" from this browser?`))return;const r=a.id===Le()?.id;try{r&&mo(),xi(a.id),r?window.location.reload():vo()}catch(s){r&&ho(),Ce.textContent=s instanceof Error?s.message:"Unable to delete this profile."}}),n.append(o,i),ba.appendChild(n)})}function go(e){po=e;const t=Le(),a=e==="onboarding";_i.textContent=a?"Welcome to ShaderOps":"Profile & recovery",Oi.textContent=a?"Choose a name once. Your favorites, checkpoints, looks, and filters save automatically on this computer.":`Working as ${t?.name||"this profile"}. Your work is stored locally and saves automatically.`,St.value="",St.placeholder=a?"Your name":"Create another profile",lo.textContent=a?"Continue":"Create profile",so.hidden=a||!t,Hi.hidden=a,zi.hidden=a,Ce.textContent="",vo(),Tt.hidden=!1,window.setTimeout(()=>St.focus(),0)}function yo(){try{const e=bi(St.value);Va(e.id),window.location.reload()}catch(e){Ce.textContent=e instanceof Error?e.message:"Enter a profile name to continue."}}async function or(){try{const e=Le();Ce.textContent="Optimizing preview images...";const t=await Zn(Si()),a=new Blob([JSON.stringify(t,null,2)],{type:"application/json"}),n=URL.createObjectURL(a),o=document.createElement("a");o.href=n,o.download=`${(e?.name||"shaderops-profile").replace(/[^\w.-]+/g,"-")}.shaderops-profile.json`,o.click(),URL.revokeObjectURL(n),Ce.textContent="Recovery file downloaded."}catch(e){Ce.textContent=e instanceof Error?e.message:"Unable to create recovery file."}}async function ir(e){if(e)try{const t=JSON.parse(await e.text()),a=Re().map(r=>r.name),n=a.length?` Existing profiles that will be replaced: ${a.join(", ")}.`:"";if(!window.confirm(`Restore this recovery file and replace all ShaderOps data in this browser?${n}`))return;Ce.textContent="Optimizing preview images...";const o=await Zn(t);mo();const i=Ii(o);Va(i.id),window.location.reload()}catch(t){ho(),Ce.textContent=t instanceof Error?t.message:"Unable to restore this recovery file."}finally{$a.value=""}}$i.addEventListener("click",()=>go("settings"));lo.addEventListener("click",yo);St.addEventListener("keydown",e=>{e.key==="Enter"&&yo()});so.addEventListener("click",or);$a.addEventListener("change",()=>ir($a.files?.[0]));Tt.addEventListener("click",e=>{e.target===Tt&&po!=="onboarding"&&(Tt.hidden=!0)});ar();Le()||go("onboarding");const an="shaderops:unified-panel-collapsed:v1",Ln=["Global","Color"],q=new Map,et=new Map;function bo(e){return!!(e&&e.bridged)}function Ke(){const e=l.projects.find(t=>t.id===l.selectedId);return bo(e)?e.id:null}function Fe(e,t,a){D.contentWindow?.postMessage({type:"shaderops/action",projectId:e,action:t,payload:a},"*")}function Ze(e,t,a,n){D.contentWindow?.postMessage({type:"shaderops/set-param",projectId:e,id:t,value:a,commit:n},"*")}function Gt(e,t,a,n=!0){D.contentWindow?.postMessage({type:"shaderops/set-state",projectId:e,payload:{params:t,extras:a},commit:n},"*")}function rr(e,t=1500){return new Promise(a=>{const n=()=>a(!0),o=et.get(e)||[];o.push(n),et.set(e,o),setTimeout(()=>{const i=et.get(e);!i||!i.includes(n)||(et.set(e,i.filter(r=>r!==n)),a(!1))},t)})}const Oa=new Map,$t=new Map;function xo(e){return`${Pi}${e}`}function za(){return{loaded:!0,name:Xe,sourcePath:ht}}function wo(e){if(!Be(e))return za();const t=e.loaded!==!1,a=typeof e.name=="string"&&e.name.trim()?e.name.trim():Xe,n=typeof e.sourcePath=="string"&&e.sourcePath.trim()?e.sourcePath.trim():ht;return t?{loaded:!0,name:a,sourcePath:n}:za()}function lr(e,t){S.setItem(xo(e),JSON.stringify(t))}function nn(e,t){const a=wo(t);return Oa.set(e,a),lr(e,a),a}function ta(e){const t=Oa.get(e);if(t)return t;const a=fe(S.getItem(xo(e)),null),n=wo(a);return Oa.set(e,n),n}function aa(e){return Array.isArray(e)&&e.some(t=>t&&t.type==="image-loader")}function sr(e){return new Promise((t,a)=>{const n=new Image;n.onload=()=>{const i=Math.min(1,1024/Math.max(n.width,n.height)),r=Math.max(1,Math.floor(n.width*i)),s=Math.max(1,Math.floor(n.height*i)),c=document.createElement("canvas");c.width=r,c.height=s;const u=c.getContext("2d",{willReadFrequently:!0});u.drawImage(n,0,0,r,s),t({imageData:u.getImageData(0,0,r,s),dataUrl:c.toDataURL("image/png")})},n.onerror=()=>a(new Error(`Unable to decode image source: ${e.slice(0,64)}`)),n.src=e})}function cr(e){return e===ht?pi:e}async function ur(e){const t=typeof e=="string"&&e.trim()?e.trim():ht,a=t;if(!$t.has(a)){const n=cr(t);$t.set(a,sr(n).then(({imageData:o})=>o))}return $t.get(a)}async function on(e,t,a){if(!e||!a||!a.loaded||!a.sourcePath)return!1;const n=await ur(a.sourcePath);return e.postMessage({type:"shaderops/image-load",projectId:t,name:a.name||Xe,sourcePath:a.sourcePath,imageData:n},"*"),!0}async function Wt(e,t=D.contentWindow){const a=nn(e,za());await on(t,e,a),l.selectedId===e&&ae(e)}async function dr(e,t=D.contentWindow){const a=ta(e);try{if(await on(t,e,a)){l.selectedId===e&&ae(e);return}}catch(n){console.warn(`ShaderOps: failed to restore image source for ${e}, falling back to Default.`,n)}await Wt(e,t)}async function fr(e,t,a,n=D.contentWindow){const o=typeof t=="string"?t.trim():"";if(!o){await Wt(e,n);return}const i=nn(e,{loaded:!0,name:a||Xe,sourcePath:o});try{await on(n,e,i)}catch(r){console.warn(`ShaderOps: checkpoint image path restore failed for ${e}; using Default.`,r),await Wt(e,n);return}l.selectedId===e&&ae(e)}let ce=null;function pr(e){ce&&ce.remove(),ce=document.createElement("input"),ce.type="file",ce.accept="image/*",ce.style.display="none",document.body.appendChild(ce),ce.addEventListener("change",()=>{const t=ce.files&&ce.files[0];if(!t)return;const a=URL.createObjectURL(t),n=new Image;n.onload=()=>{const i=Math.min(1,1024/Math.max(n.width,n.height)),r=Math.max(1,Math.floor(n.width*i)),s=Math.max(1,Math.floor(n.height*i)),c=document.createElement("canvas");c.width=r,c.height=s;const u=c.getContext("2d",{willReadFrequently:!0});u.drawImage(n,0,0,r,s);const d=u.getImageData(0,0,r,s),f=c.toDataURL("image/png");nn(e,{loaded:!0,name:t.name||"image",sourcePath:f}),$t.set(f,Promise.resolve(d)),D.contentWindow?.postMessage({type:"shaderops/image-load",projectId:e,name:t.name,sourcePath:f,imageData:d},"*"),URL.revokeObjectURL(a),l.selectedId===e&&ae(e)},n.onerror=()=>URL.revokeObjectURL(a),n.src=a}),ce.click()}function mr(e){Wt(e,D.contentWindow)}function ko(e){Nt.querySelector(".icon-play").classList.toggle("is-hidden",!e),Nt.querySelector(".icon-pause").classList.toggle("is-hidden",!!e),Nt.title=e?"Resume (Space)":"Pause (Space)"}function So(){vt.hidden=!1,co.hidden=!1}function wa(){vt.hidden=!0,co.hidden=!0}function Co(e){return`shaderops:locked-controls:${e}`}function Eo(e){const t=fe(S.getItem(Co(e)),[]);return new Set(Array.isArray(t)?t:[])}function Ut(e,t){S.setItem(Co(e),JSON.stringify([...t]))}function ka(){return`<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3.5" y="7.2" width="9" height="6.3" rx="1.4" stroke="currentColor" stroke-width="1.2"></rect>
    <path d="M5.3 7.2V5.4a2.7 2.7 0 0 1 5.4 0v1.8" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"></path>
  </svg>`}function na(e){const t=q.get(e);if(!t)return;const a={};t.lockedIds.forEach(n=>{n in t.params&&(a[n]=t.params[n])}),t.pendingLockRestore=Object.keys(a).length?a:null,Fe(e,"randomizeAll")}function Do(e){return`shaderops:unified-checkpoints:${e}`}function Ye(e){const t=fe(S.getItem(Do(e)),null);return t&&Array.isArray(t.slots)?{slots:t.slots,nextId:t.nextId||t.slots.length+1,activeId:t.activeId??null}:{slots:[],nextId:1,activeId:null}}function oa(e,t){S.setItem(Do(e),JSON.stringify(t))}function Mo(e,t){try{return JSON.parse(JSON.stringify(e))}catch{return t}}async function Io(e){return e!==l.selectedId||await fa(),l.previews[e]||null}function Ha(e,t){const a=q.get(e);if(!a)return;const n=Ye(e),o=n.slots.find(s=>s.id===t);if(!o)return;const i={};Object.entries(o.values||{}).forEach(([s,c])=>{s in a.params&&(i[s]=c)}),Object.assign(a.params,i);const r=o.extras&&typeof o.extras=="object";r&&Object.assign(a.extras,o.extras),Gt(e,i,r?o.extras:void 0,!0),o.filters&&Array.isArray(o.filters.stack)&&(L(e),l.filterPreviewOn[e]=o.filters.previewOn!==!1,sn(e,JSON.stringify(o.filters.stack))),aa(a.schema)&&Object.prototype.hasOwnProperty.call(o,"imagePath")&&fr(e,o.imagePath,o.imageName,D.contentWindow),n.activeId=t,oa(e,n),l.selectedId===e&&rn(e),Pt(e)}async function hr(e,t){const a=q.get(e);if(!a)return;const n=Ye(e),o=n.slots.find(i=>i.id===t);if(o){if(o.values={...a.params},o.extras=Mo(a.extras||{},{}),o.filters={stack:JSON.parse(gt(e)),previewOn:Ne(e)},aa(a.schema)){const i=ta(e);o.imagePath=i.sourcePath||ht,o.imageName=i.name||Xe}o.preview=await Io(e),n.activeId=t,oa(e,n),Pt(e)}}function vr(e,t){const a=Ye(e);a.slots=a.slots.filter(n=>n.id!==t),a.activeId===t&&(a.activeId=null),oa(e,a),Pt(e)}async function gr(e){const t=q.get(e);if(!t)return;const a=Ye(e),n=a.nextId++,o=await Io(e),i={id:n,values:{...t.params},extras:Mo(t.extras||{},{}),filters:{stack:JSON.parse(gt(e)),previewOn:Ne(e)},preview:o};if(aa(t.schema)){const r=ta(e);i.imagePath=r.sourcePath||ht,i.imageName=r.name||Xe}a.slots.push(i),a.activeId=n,oa(e,a),Pt(e)}function Bo(e,{onTap:t,onHoldComplete:a,holdMs:n=800}={}){const o=e.querySelector(".ucp-ring");let i=null,r=!1,s=!1;const c=()=>{i&&(clearTimeout(i),i=null),e.classList.remove("holding")},u=p=>{p.button!==void 0&&p.button!==0||(r=!0,s=!1,e.classList.add("holding"),o&&o.style.setProperty("--ucp-ring-duration",`${n}ms`),i=setTimeout(()=>{s=!0,e.classList.remove("holding"),e.classList.add("completed"),setTimeout(()=>e.classList.remove("completed"),260),a?.()},n))},d=()=>{r&&(r=!1,c(),s||t?.())},f=()=>{r&&(r=!1,c())};e.addEventListener("pointerdown",u),e.addEventListener("pointerup",d),e.addEventListener("pointerleave",f),e.addEventListener("pointercancel",f)}let xe=null;function yr(){return xe||(xe=document.createElement("div"),xe.className="ucp-menu",xe.hidden=!0,document.body.appendChild(xe),document.addEventListener("click",()=>qa()),window.addEventListener("blur",()=>qa()),xe)}function qa(){xe&&(xe.hidden=!0)}function br(e,t,a){const n=yr();n.innerHTML="",a.forEach(s=>{const c=document.createElement("button");c.type="button",c.className="ucp-menu-item",c.textContent=s.label,c.addEventListener("click",u=>{u.stopPropagation(),qa(),s.onClick()}),n.appendChild(c)}),n.hidden=!1;const o=n.getBoundingClientRect(),i=Math.min(e,window.innerWidth-o.width-8),r=Math.min(t,window.innerHeight-o.height-8);n.style.left=`${Math.max(8,i)}px`,n.style.top=`${Math.max(8,r)}px`}function Pt(e){xa.innerHTML="";const t=Ye(e);t.slots.forEach((a,n)=>{const o=document.createElement("span");o.className="ucp-btn-shell",t.activeId===a.id&&o.classList.add("is-active");const i=document.createElement("button");i.type="button",i.className="ucp-slot",i.textContent=String(n+1),i.title="Tap: load this checkpoint Â· Hold 0.8s: overwrite with the current look Â· Right-click: delete",o.appendChild(i);const r=document.createElementNS("http://www.w3.org/2000/svg","svg");r.setAttribute("viewBox","0 0 30 30"),r.setAttribute("class","ucp-ring"),r.setAttribute("aria-hidden","true");const s=document.createElementNS("http://www.w3.org/2000/svg","circle");s.setAttribute("cx","15"),s.setAttribute("cy","15"),s.setAttribute("r","13.3"),s.setAttribute("pathLength","100"),r.appendChild(s),o.appendChild(r),Bo(o,{onTap:()=>Ha(e,a.id),onHoldComplete:()=>{hr(e,a.id)}}),o.addEventListener("contextmenu",c=>{c.preventDefault(),br(c.clientX,c.clientY,[{label:"Delete checkpoint",onClick:()=>vr(e,a.id)}])}),xa.appendChild(o)}),xa.appendChild(uo)}function ot(e,t){if(!e||!e.showIf)return!0;const a=e.showIf;if(typeof a=="function")try{return!!a(t||{})}catch{return!0}if(typeof a=="string")return!!(t||{})[a];if(Array.isArray(a))return a.every(n=>ot({showIf:n},t));if(a&&typeof a=="object"){if(Array.isArray(a.all))return a.all.every(n=>ot({showIf:n},t));if(Array.isArray(a.any))return a.any.some(n=>ot({showIf:n},t));if(a.eq&&typeof a.eq=="object")return Object.entries(a.eq).every(([n,o])=>String((t||{})[n])===String(o));if(a.neq&&typeof a.neq=="object")return Object.entries(a.neq).every(([n,o])=>String((t||{})[n])!==String(o))}return!0}function ae(e){const t=q.get(e);if(!t)return;t.lockedIds||(t.lockedIds=Eo(e)),Ft.innerHTML="";const a=new Map;(t.schema||[]).filter(c=>!c.hidden&&ot(c,t.params)).forEach(c=>{const u=c.group||"Controls";a.has(u)||a.set(u,[]),a.get(u).push(c)});const n=[...Ln.filter(c=>a.has(c)),...[...a.keys()].filter(c=>!Ln.includes(c))],o=`shaderops:unified-group-collapsed:${e}`,i=fe(S.getItem(o),{}),r=(c,u)=>{const d=document.createElement("button");d.type="button",d.className="shaderops-lock-button",d.innerHTML=ka();const f=()=>{const p=t.lockedIds.has(c);d.classList.toggle("is-locked",p),u&&u.classList.toggle("is-locked",p),d.title=p?"Unlock this value":"Lock this value (skip on All Random)"};return f(),d.addEventListener("click",p=>{p.preventDefault(),p.stopPropagation(),t.lockedIds.has(c)?t.lockedIds.delete(c):t.lockedIds.add(c),Ut(e,t.lockedIds),f()}),d},s=(c,u)=>{const d=String(c||"").trim(),f=String(u||"").trim();return f?`${d}
${f}`:d};n.forEach((c,u)=>{const d=a.get(c),f=document.createElement("div");f.className="unified-control-group";const p=c.toLowerCase();i[p]&&f.classList.add("is-collapsed");const h=document.createElement("h3");h.textContent=c,h.setAttribute("role","button"),h.setAttribute("tabindex","0");const v=()=>{f.classList.toggle("is-collapsed"),i[p]=f.classList.contains("is-collapsed"),S.setItem(o,JSON.stringify(i))};if(h.addEventListener("click",v),h.addEventListener("keydown",m=>{(m.key==="Enter"||m.key===" ")&&(m.preventDefault(),v())}),f.appendChild(h),u===0){const m=document.createElement("button");m.type="button",m.className="unified-panel-close",m.title="Collapse controls",m.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>',m.addEventListener("click",g=>{g.preventDefault(),g.stopPropagation(),Po()}),h.appendChild(m)}d.forEach(m=>{const g=document.createElement("div");g.dataset.controlId=m.id;const C=document.createElement("label"),M=String(m.label||m.id);if(C.textContent=M,C.title=s(M,m.hint),m.type==="shape-stack"){g.className="filter-param-row filter-param-row--shape-stack";const b=document.createElement("div");b.className="shaderops-shape-stack";const A=Array.isArray(m.shapes)?m.shapes:[],$=t.params[m.selectedParam],k=A.find(ee=>String(ee.value)===String($))||null,I=A.filter(ee=>Number(t.params[ee.enabledParam])>.5),Y=document.createElement("button");if(Y.type="button",Y.className="shaderops-shape-stack-trigger",Y.textContent=k?`${k.label} Â· ${I.length} active`:`${I.length} active`,Y.addEventListener("click",()=>{t.openShapeStackId=t.openShapeStackId===m.id?null:m.id,ae(e)}),b.appendChild(Y),t.openShapeStackId===m.id){const ee=document.createElement("div");ee.className="shaderops-shape-stack-menu",A.forEach(w=>{const H=document.createElement("div");H.className="shaderops-shape-stack-item",k&&String(k.value)===String(w.value)&&H.classList.add("is-selected");const te=document.createElement("input");te.type="checkbox",te.checked=Number(t.params[w.enabledParam])>.5,te.addEventListener("click",B=>B.stopPropagation()),te.addEventListener("change",()=>{const B={[w.enabledParam]:te.checked?1:0};if(te.checked)B[m.selectedParam]=w.value;else if(String(t.params[m.selectedParam])===String(w.value)){const wt=A.find(Me=>Me!==w&&Number(t.params[Me.enabledParam])>.5);B[m.selectedParam]=wt?wt.value:0}Object.assign(t.params,B),Gt(e,B,void 0,!0),ae(e)});const De=document.createElement("button");De.type="button",De.className="shaderops-shape-stack-item-button",De.textContent=w.label,De.addEventListener("click",()=>{const B={[w.enabledParam]:1,[m.selectedParam]:w.value};Object.assign(t.params,B),Gt(e,B,void 0,!0),ae(e)}),H.appendChild(te),H.appendChild(De),ee.appendChild(H)}),b.appendChild(ee)}if(k&&Array.isArray(k.controls)&&Number(t.params[k.enabledParam])>.5){const ee=document.createElement("div");ee.className="shaderops-shape-stack-detail",k.controls.filter(w=>!w.hidden&&ot(w,t.params)).forEach(w=>{const H=document.createElement("div");H.dataset.controlId=w.id;const te=document.createElement("label"),De=String(w.label||w.id);if(te.textContent=De,te.title=s(De,w.hint),w.type==="select"){H.className="filter-param-row filter-param-row--select";const U=document.createElement("select");U.className="filter-param-select";const kt=t.params[w.id]??w.default??0;(w.options||[]).forEach(Oe=>{const ze=document.createElement("option");ze.value=String(Oe.value),ze.textContent=Oe.label,String(Oe.value)===String(kt)&&(ze.selected=!0),U.appendChild(ze)}),U.addEventListener("change",()=>{const Oe=U.value,ze=Number(Oe),wn=Number.isFinite(ze)&&Oe.trim()!==""?ze:Oe;t.params[w.id]=wn,Ze(e,w.id,wn,!0)});const _e=document.createElement("span");_e.className="shaderops-lock-wrap shaderops-lock-wrap--aux shaderops-lock-wrap--full",_e.appendChild(U),_e.appendChild(r(w.id,_e)),H.appendChild(te),H.appendChild(_e),ee.appendChild(H);return}H.className="filter-param-row";const B=document.createElement("input");B.type="range",B.min=String(w.min??0),B.max=String(w.max??1),B.step=String(w.step??.01),w.pillMode&&(B.dataset.pillMode=String(w.pillMode));const wt=t.params[w.id]??w.default??0;B.value=String(wt);const Me=document.createElement("span");Me.className="shaderops-lock-wrap";const $e=document.createElement("input");$e.type="number",$e.step=B.step,$e.value=String(wt);const Ue=document.createElement("button");Ue.type="button",Ue.className="shaderops-lock-button",Ue.innerHTML=ka();const xn=()=>{const U=t.lockedIds.has(w.id);Ue.classList.toggle("is-locked",U),Me.classList.toggle("is-locked",U),Ue.title=U?"Unlock this value":"Lock this value (skip on All Random)"};xn(),Ue.addEventListener("click",U=>{U.preventDefault(),U.stopPropagation(),t.lockedIds.has(w.id)?t.lockedIds.delete(w.id):t.lockedIds.add(w.id),Ut(e,t.lockedIds),xn()});const ga=(U,kt)=>{t.params[w.id]=U,Ze(e,w.id,U,kt)};B.addEventListener("input",()=>{const U=Number(B.value);$e.value=B.value,ga(U,!1)}),B.addEventListener("change",()=>{ga(Number(B.value),!0)}),$e.addEventListener("change",()=>{let U=Number($e.value);Number.isFinite(U)||(U=Number(B.value));const kt=Number(B.min),_e=Number(B.max);B.value=String(Math.min(_e,Math.max(kt,U))),ga(U,!0)}),Me.appendChild($e),Me.appendChild(Ue),H.appendChild(te),H.appendChild(B),H.appendChild(Me),ee.appendChild(H)}),b.appendChild(ee)}g.appendChild(C),g.appendChild(b),f.appendChild(g);return}if(m.type==="image-loader"){g.className="filter-param-row filter-param-row--image-loader";const b=ta(e),A=document.createElement("button");A.type="button",A.className="image-loader-load",A.textContent="Load Image",A.title="Load an image â€” strokes will sample its colors",A.addEventListener("click",()=>pr(e));const $=document.createElement("span");$.className="image-loader-name",$.textContent=b.loaded?b.name:Xe,$.title=b.loaded?b.name:"Using default image";const k=document.createElement("button");k.type="button",k.className="image-loader-clear",k.textContent="✕",k.title="Reset to Default image",k.hidden=!b.loaded,k.addEventListener("click",()=>mr(e));const I=document.createElement("span");I.className="image-loader-wrap",I.appendChild(A),I.appendChild($),I.appendChild(k),g.appendChild(C),g.appendChild(I),f.appendChild(g);return}if(m.type==="toggle"){g.className="filter-param-row filter-param-row--toggle";const b=Number(t.params[m.id]??m.default??0)>.5,A=document.createElement("label");A.className="filter-param-switch",A.innerHTML=`
          <input type="checkbox" class="filter-param-toggle" ${b?"checked":""} />
          <span class="filter-param-switch-track"><span class="filter-param-switch-thumb"></span></span>
        `;const $=A.querySelector(".filter-param-toggle");$.addEventListener("change",()=>{const I=$.checked?1:0;t.params[m.id]=I,Ze(e,m.id,I,!0),ae(e)});const k=document.createElement("span");k.className="shaderops-lock-wrap shaderops-lock-wrap--aux",k.appendChild(A),k.appendChild(r(m.id,k)),g.appendChild(C),g.appendChild(k),f.appendChild(g);return}if(m.type==="select"){g.className="filter-param-row filter-param-row--select";const b=document.createElement("select");b.className="filter-param-select";const A=t.params[m.id]??m.default??0;(m.options||[]).forEach(k=>{const I=document.createElement("option");I.value=String(k.value),I.textContent=k.label,String(k.value)===String(A)&&(I.selected=!0),b.appendChild(I)}),b.addEventListener("change",()=>{const k=b.value,I=Number(k),Y=Number.isFinite(I)&&k.trim()!==""?I:k;t.params[m.id]=Y,Ze(e,m.id,Y,!0),ae(e)});const $=document.createElement("span");$.className="shaderops-lock-wrap shaderops-lock-wrap--aux shaderops-lock-wrap--full",$.appendChild(b),$.appendChild(r(m.id,$)),g.appendChild(C),g.appendChild($),f.appendChild(g);return}g.className="filter-param-row";const x=document.createElement("input");x.type="range",x.min=String(m.min??0),x.max=String(m.max??1),x.step=String(m.step??.01),m.pillMode&&(x.dataset.pillMode=String(m.pillMode));const V=t.params[m.id]??m.default??0;x.value=String(V);const le=document.createElement("span");le.className="shaderops-lock-wrap";const Q=document.createElement("input");Q.type="number",Q.step=x.step,Q.value=String(V);const se=document.createElement("button");se.type="button",se.className="shaderops-lock-button",se.innerHTML=ka();const xt=()=>{const b=t.lockedIds.has(m.id);se.classList.toggle("is-locked",b),le.classList.toggle("is-locked",b),se.title=b?"Unlock this value":"Lock this value (skip on All Random)"};xt(),se.addEventListener("click",b=>{b.preventDefault(),b.stopPropagation(),t.lockedIds.has(m.id)?t.lockedIds.delete(m.id):t.lockedIds.add(m.id),Ut(e,t.lockedIds),xt()});const Je=(b,A)=>{t.params[m.id]=b,Ze(e,m.id,b,A)};x.addEventListener("input",()=>{const b=Number(x.value);Q.value=x.value,Je(b,!1)}),x.addEventListener("change",()=>{Je(Number(x.value),!0)}),Q.addEventListener("change",()=>{let b=Number(Q.value);Number.isFinite(b)||(b=Number(x.value));const A=Number(x.min),$=Number(x.max);x.value=String(Math.min($,Math.max(A,b))),Je(b,!0)}),le.appendChild(Q),le.appendChild(se),g.appendChild(C),g.appendChild(x),g.appendChild(le),f.appendChild(g)}),Ft.appendChild(f)}),Ja(Ft),ko(!!t.extras.paused),Pt(e)}function rn(e){const t=q.get(e);if(t){if((t.schema||[]).some(a=>a.type==="shape-stack")){ae(e);return}Ft.querySelectorAll(".filter-param-row").forEach(a=>{const n=a.dataset.controlId;if(!(n in t.params))return;const o=a.querySelector('input[type="range"]'),i=a.querySelector('input[type="number"]'),r=a.querySelector("select.filter-param-select"),s=a.querySelector("input.filter-param-toggle"),c=t.params[n];o&&document.activeElement!==o&&(o.value=String(c)),i&&document.activeElement!==i&&(i.value=String(c)),r&&document.activeElement!==r&&(r.value=String(c)),s&&document.activeElement!==s&&(s.checked=Number(c)>.5)}),ko(!!t.extras.paused)}}function xr(e,t=null){const{type:a,projectId:n}=e;if(n){if(a==="shaderops/ready"){const o=Array.isArray(e.schema)?e.schema:[];if(q.set(n,{schema:o,params:{...e.values||{}},extras:{...e.extras||{}},lockedIds:Eo(n)}),aa(o)){const i=t&&typeof t.postMessage=="function"?t:D.contentWindow;dr(n,i)}l.selectedId===n&&(ae(n),So(),it())}else if(a==="shaderops/values-changed"){const o=q.get(n);if(!o)return;if(e.values&&Object.assign(o.params,e.values),e.extras&&Object.assign(o.extras,e.extras),o.pendingLockRestore){const r=o.pendingLockRestore;o.pendingLockRestore=null,Object.entries(r).forEach(([s,c])=>{o.params[s]=c,Ze(n,s,c,!0)})}const i=et.get(n);i&&i.length&&(et.set(n,[]),i.forEach(r=>{try{r()}catch{}})),l.selectedId===n&&rn(n)}else if(a==="shaderops/keydown"){if(l.selectedId!==n)return;e.key==="r"?na(n):e.key==="space"&&Fe(n,"togglePause")}}}Ki.addEventListener("click",()=>{vt.classList.remove("is-collapsed"),S.setItem(an,"0")});function Po(){vt.classList.add("is-collapsed"),S.setItem(an,"1")}vt.addEventListener("dblclick",e=>{e.target.closest(".unified-panel-body")||Po()});Yi.addEventListener("click",()=>{const e=Ke();e&&na(e)});Ji.addEventListener("click",()=>{const e=Ke();e&&Fe(e,"rerollSeed")});Nt.addEventListener("click",()=>{const e=Ke();e&&Fe(e,"togglePause")});Zi.addEventListener("click",()=>{const e=Ke();e&&Fe(e,"undo")});Qi.addEventListener("click",()=>{const e=Ke();e&&Fe(e,"redo")});er?.addEventListener("click",()=>{window.location.reload()});Bo(uo,{onHoldComplete:()=>{const e=Ke();e&&gr(e)}});document.addEventListener("keydown",e=>{const t=Ke();t&&(e.target?.matches("input, textarea, select, button")||((e.key==="r"||e.key==="R")&&!e.metaKey&&!e.ctrlKey&&!e.altKey?(e.preventDefault(),na(t)):e.code==="Space"&&(e.preventDefault(),Fe(t,"togglePause"))))});S.getItem(an)==="1"&&vt.classList.add("is-collapsed");function fe(e,t){if(e==null)return t;try{const a=JSON.parse(e);return a??t}catch{return t}}function Be(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function wr(){const e="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";let t="";for(let a=0;a<3;a++)t+=e[Math.floor(Math.random()*e.length)];return t}function Lo(e,t=""){const a=new Date,n=String(a.getFullYear()),o=String(a.getMonth()+1).padStart(2,"0"),i=String(a.getDate()).padStart(2,"0"),r=String(a.getHours()).padStart(2,"0"),s=String(a.getMinutes()).padStart(2,"0"),c=String(a.getSeconds()).padStart(2,"0"),u=String(t||"").trim(),d=u?`-${u}`:"";return`${e||"shader"}-${n}${o}${i}-${r}${s}${c}${d}-${wr()}.png`}function kr(e){const t=q.get(e),a=JSON.parse(gt(e));return{source:"shaderops-png-state",schemaVersion:Pa,exportedAt:new Date().toISOString(),projectId:e,bridge:{params:t?{...t.params}:{},extras:t?{...t.extras}:{},lockedIds:t&&t.lockedIds?[...t.lockedIds]:[]},filters:{previewOn:Ne(e),stack:Array.isArray(a)?a:[]}}}function Sr(e,t=2500){return q.has(e)?Promise.resolve(!0):new Promise(a=>{const n=performance.now(),o=()=>{if(q.has(e)){a(!0);return}if(performance.now()-n>=t){a(!1);return}requestAnimationFrame(o)};o()})}const Ge=new Uint8Array([137,80,78,71,13,10,26,10]),jt=new TextEncoder,Ao=new TextDecoder,Cr=(()=>{const e=new Uint32Array(256);for(let t=0;t<256;t++){let a=t;for(let n=0;n<8;n++)a=a&1?3988292384^a>>>1:a>>>1;e[t]=a>>>0}return e})();function Er(e){let t=4294967295;for(let a=0;a<e.length;a++)t=Cr[(t^e[a])&255]^t>>>8;return(t^4294967295)>>>0}function Dr(e,t){const a=new Uint8Array(12+t.length),n=new DataView(a.buffer);n.setUint32(0,t.length),a.set(e,4),a.set(t,8);const o=new Uint8Array(4+t.length);return o.set(e,0),o.set(t,4),n.setUint32(8+t.length,Er(o)),a}function Mr(e){const t=e.reduce((o,i)=>o+i.length,0),a=new Uint8Array(t);let n=0;for(const o of e)a.set(o,n),n+=o.length;return a}function Ir(e){if(!e||typeof e!="string")return null;const t=e.indexOf(",");if(t===-1)return null;const a=e.slice(t+1),n=atob(a),o=new Uint8Array(n.length);for(let i=0;i<n.length;i++)o[i]=n.charCodeAt(i);return o}function Br(e,t){const a=jt.encode(e),n=jt.encode(t),o=new Uint8Array(a.length+5+n.length);o.set(a,0);let i=a.length;return o[i++]=0,o[i++]=0,o[i++]=0,o[i++]=0,o[i++]=0,o.set(n,i),o}function Pr(e,t,a){if(!e||e.length<12)throw new Error("PNG data is empty.");for(let u=0;u<Ge.length;u++)if(e[u]!==Ge[u])throw new Error("Exported image is not a valid PNG.");const n=jt.encode(t),o=jt.encode("iTXt"),i=Dr(o,Br(t,a)),r=[Ge];let s=Ge.length,c=!1;for(;s+12<=e.length;){const d=new DataView(e.buffer,e.byteOffset+s,8).getUint32(0),f=s+4,p=s+8,h=d+12;if(s+h>e.length)throw new Error("PNG chunk stream is truncated.");const v=e.subarray(f,f+4),m=e.subarray(p,p+d),C=v[0]===105&&v[1]===84&&v[2]===88&&v[3]===116&&m.length>=n.length+1&&m.subarray(0,n.length).every((x,V)=>x===n[V])&&m[n.length]===0,M=v[0]===73&&v[1]===69&&v[2]===78&&v[3]===68;C||(!c&&M&&(r.push(i),c=!0),r.push(e.subarray(s,s+h))),s+=h}return c||r.push(i),Mr(r)}function Sa(e,t){let a=t;for(;a<e.length&&e[a]!==0;)a+=1;return{text:Ao.decode(e.subarray(t,a)),next:a+1}}function Lr(e,t){if(!e||e.length<12)return null;for(let n=0;n<Ge.length;n++)if(e[n]!==Ge[n])return null;let a=Ge.length;for(;a+12<=e.length;){const o=new DataView(e.buffer,e.byteOffset+a,8).getUint32(0),i=a+4,r=a+8,s=o+12;if(a+s>e.length)return null;const c=e.subarray(i,i+4),u=e.subarray(r,r+o),d=String.fromCharCode(c[0],c[1],c[2],c[3]);if(d==="iTXt"){const f=Sa(u,0);if(f.text===t&&f.next+3<=u.length){const p=u[f.next];let h=f.next+2;if(h=Sa(u,h).next,h=Sa(u,h).next,p===0&&h<=u.length)return Ao.decode(u.subarray(h))}}if(d==="IEND")break;a+=s}return null}function Ar(e){return Be(e)?{stack:(Array.isArray(e.stack)?e.stack:[]).map(n=>!Be(n)||typeof n.defId!="string"||!Te(n.defId)?null:{instanceId:typeof n.instanceId=="string"?n.instanceId:`f${Date.now()}_${Fo++}`,defId:n.defId,enabled:n.enabled!==!1,collapsed:!!n.collapsed,params:{...ja(n.defId),...Be(n.params)?n.params:{}}}).filter(Boolean),previewOn:e.previewOn!==!1}:null}async function Tr(e){if(!Be(e))throw new Error("PNG metadata is invalid JSON.");const t=Number(e.schemaVersion)||1;t>Pa&&console.warn(`PNG state schema v${t} is newer than this app (v${Pa}); applying compatible fields only.`);const a=typeof e.projectId=="string"?e.projectId:null,o=a&&l.projects.some(c=>c.id===a)?a:l.selectedId;if(!o)throw new Error("No target project is available for restore.");if(l.selectedId!==o&&await mn(o),!await Sr(o))throw new Error("Project controls are not ready yet. Please try dropping the PNG again.");const r=q.get(o);if(r&&Be(e.bridge)){const c=Be(e.bridge.params)?{...e.bridge.params}:{},u=Be(e.bridge.extras)?{...e.bridge.extras}:void 0;Gt(o,c,u,!0),Object.assign(r.params,c),u&&Object.assign(r.extras,u),Array.isArray(e.bridge.lockedIds)&&(r.lockedIds=new Set(e.bridge.lockedIds.filter(d=>typeof d=="string")),Ut(o,r.lockedIds)),l.selectedId===o&&rn(o)}const s=Ar(e.filters);s&&(l.filterStacks[o]=s.stack,l.filterPreviewOn[o]=s.previewOn,pe(),l.selectedId===o&&F()),ye()}async function Rr(e){if(!e||!/\.png$/i.test(e.name||""))return!1;const t=new Uint8Array(await e.arrayBuffer()),a=Lr(t,io);if(!a)return!1;const n=fe(a,null);if(!n)throw new Error("PNG state chunk exists but contains invalid JSON.");return await Tr(n),!0}function Fr(){const e=fe(S.getItem(Qn),{});l.previews=e&&typeof e=="object"&&!Array.isArray(e)?e:{}}function Nr(){const e=fe(S.getItem(to),[]);l.favorites=Array.isArray(e)?e:[]}function To(){S.setItem(to,JSON.stringify(l.favorites))}function ln(){S.setItem(ao,JSON.stringify(l.projects.map(e=>e.id)))}function $r(){const e=fe(S.getItem(ao),null);if(!Array.isArray(e)||e.length===0)return;const t=new Map(l.projects.map(i=>[i.id,i])),a=e.map(i=>t.get(i)).filter(Boolean),n=new Set(a.map(i=>i.id)),o=l.projects.filter(i=>!n.has(i.id));l.projects=[...a,...o]}function Ur(){const e=fe(S.getItem(no),null);l.filterAddOrder=e&&typeof e=="object"?e:{}}function _r(){S.setItem(no,JSON.stringify(l.filterAddOrder))}function Or(e,t){const a=l.filterAddOrder&&l.filterAddOrder[e];if(!Array.isArray(a)||a.length===0)return t;const n=new Map(t.map(s=>[s.id,s])),o=a.map(s=>n.get(s)).filter(Boolean),i=new Set(o.map(s=>s.id)),r=t.filter(s=>!i.has(s.id));return[...o,...r]}function ia(){const e={...l.previews};let t=Object.keys(e);for(let a=0;a<=t.length;a++)try{S.setItem(Qn,JSON.stringify(e));return}catch(n){const o=t.find(i=>i!==l.selectedId&&e[i]);if(!o){console.warn("ShaderOps: preview storage quota exceeded; skipping persistence this cycle.",n);return}delete e[o],t=t.filter(i=>i!==o)}}function Ro(e,t=320,a=.72){return new Promise(n=>{if(!e||typeof e!="string"||!e.startsWith("data:image")){n(e);return}const o=new Image;o.onload=()=>{const i=Math.min(1,t/(o.width||t)),r=Math.max(1,Math.round((o.width||t)*i)),s=Math.max(1,Math.round((o.height||t)*i));try{const c=document.createElement("canvas");c.width=r,c.height=s,c.getContext("2d").drawImage(o,0,0,r,s),n(c.toDataURL("image/jpeg",a))}catch{n(e)}},o.onerror=()=>n(e),o.src=e})}function zr(){const e=fe(S.getItem(eo),{}),t=e&&typeof e=="object"&&!Array.isArray(e)?e:{};Object.entries(t).forEach(([a,n])=>{if(!n||typeof n!="object")return;const o=Array.isArray(n.stack)?n.stack:[];l.filterStacks[a]=o.map(i=>!i||typeof i!="object"?i:{...i,params:{...ja(i.defId),...i.params}}),l.filterPreviewOn[a]=n.previewOn!==!1}),en.classList.toggle("collapsed",S.getItem(Ya)==="1")}function pe(){const e={};Object.keys(l.filterStacks).forEach(t=>{e[t]={stack:l.filterStacks[t],previewOn:l.filterPreviewOn[t]!==!1}}),S.setItem(eo,JSON.stringify(e))}function G(e){return l.filterStacks[e]||(l.filterStacks[e]=[]),l.filterStacks[e]}function Ne(e){return l.filterPreviewOn[e]!==!1}function An(e){return e?Ne(e)&&G(e).some(t=>t&&t.enabled):!1}function ra(e){return l.filterHistory[e]||(l.filterHistory[e]={undoStack:[],redoStack:[],suppress:!1,limit:100}),l.filterHistory[e]}function gt(e){return JSON.stringify(G(e))}function L(e,t){if(!e)return;const a=ra(e);if(a.suppress)return;const n=gt(e);a.undoStack[a.undoStack.length-1]!==n&&(a.undoStack.push(n),a.undoStack.length>a.limit&&a.undoStack.shift(),a.redoStack.length=0)}function sn(e,t){const a=ra(e);let n;try{n=JSON.parse(t)}catch{return}a.suppress=!0,l.filterStacks[e]=n,l.filterPreviewOn[e]===void 0&&(l.filterPreviewOn[e]=!0),pe(),F(),!E.hidden&&z&&l.selectedId===e&&de(),!P.hidden&&O&&l.selectedId===e&&Ee(),a.suppress=!1}function Hr(e){if(!e)return;const t=ra(e);if(t.undoStack.length===0)return;const a=gt(e),n=t.undoStack.pop();t.redoStack.push(a),sn(e,n)}function qr(e){if(!e)return;const t=ra(e);if(t.redoStack.length===0)return;const a=gt(e),n=t.redoStack.pop();t.undoStack.push(a),sn(e,n)}let Fo=1;function Gr(e,t){if(!Te(t))return;L(e),G(e).unshift({instanceId:`f${Date.now()}_${Fo++}`,defId:t,enabled:!0,collapsed:!1,params:ja(t)}),l.filterPreviewOn[e]===void 0&&(l.filterPreviewOn[e]=!0),pe(),F()}function Wr(e,t){const a=G(e),n=a.findIndex(o=>o.instanceId===t);n!==-1&&(L(e),a.splice(n,1),pe(),F())}function jr(e,t){const n=G(e).find(o=>o.instanceId===t);n&&(L(e),n.enabled=!n.enabled,pe(),F())}function Vr(e,t){const n=G(e).find(o=>o.instanceId===t);n&&(n.collapsed=!n.collapsed,pe(),F())}function ke(e,t,a,n,o){const r=G(e).find(s=>s.instanceId===t);r&&(o||L(e),r.params[a]=n,pe())}const Xr={oilPaint:{key:"preset",values:{custom:null,paletteKnife:{brushType:"palette",brushSize:10.5,strokeStrength:.84,detail:.74,edgeBlend:.33,strokePresence:.86,mix:.92},softBrush:{brushType:"round",brushSize:14,strokeStrength:.62,detail:.52,edgeBlend:.72,strokePresence:.56,mix:.78}}},filmEmulation:{key:"stock",values:{neutral:{grain:.35,grainSize:1.1,grainAnimated:!0,halation:.25,haloSize:2.6,contrast:.05,saturation:1,fade:.02,temperature:0,tint:0,vignette:.25},portra:{grain:.45,grainSize:1.4,grainAnimated:!0,halation:.55,haloSize:3.2,contrast:.12,saturation:1,fade:.08,temperature:0,tint:0,vignette:.4},velvia:{grain:.38,grainSize:1.2,grainAnimated:!0,halation:.4,haloSize:2.8,contrast:.28,saturation:1.45,fade:.05,temperature:.05,tint:.03,vignette:.45},trix:{grain:.9,grainSize:1,grainAnimated:!0,halation:.2,haloSize:2.3,contrast:.45,saturation:0,fade:.1,temperature:-.02,tint:.02,vignette:.55},cinestill:{grain:.65,grainSize:1.8,grainAnimated:!0,halation:1.4,haloSize:4.5,contrast:.18,saturation:1.05,fade:.1,temperature:-.2,tint:.05,vignette:.5},bleach:{grain:.5,grainSize:1.3,grainAnimated:!0,halation:.35,haloSize:2.8,contrast:.6,saturation:.55,fade:.03,temperature:0,tint:0,vignette:.62}}}};function Kr(e,t,a,n){const i=G(e).find(c=>c.instanceId===t);if(!i)return;const r=Xr[i.defId||i.filterId];if(!r||r.key!==a)return;const s=r.values?.[String(n)];!s||typeof s!="object"||Object.entries(s).forEach(([c,u])=>{ke(e,t,c,u,!0)})}const Tn=["Color","Distort","Blur","Effect"];function Yr(){const e=new Map;Wn.forEach(a=>{const n=a.group||"Other";e.has(n)||e.set(n,[]),e.get(n).push(a)});const t=[...Tn.filter(a=>e.has(a)),...[...e.keys()].filter(a=>!Tn.includes(a))];J.innerHTML=t.map(a=>`
        <div class="filter-add-group">
          <div class="filter-add-group-title">${a}</div>
          <div class="filter-add-grid" data-group="${a}">
            ${Or(a,e.get(a)).map(n=>`
                  <button type="button" class="filter-add-option" draggable="true" data-filter-id="${n.id}">
                    <span class="filter-add-option-icon">${n.icon||""}</span>
                    <span class="filter-add-option-label">${n.label}</span>
                  </button>`).join("")}
          </div>
        </div>`).join(""),J.querySelectorAll(".filter-add-grid[data-group]").forEach(a=>{Jr(a,a.dataset.group)})}function Jr(e,t){let a=null;e.addEventListener("dragstart",n=>{const o=n.target.closest(".filter-add-option");if(!o){n.preventDefault();return}a=o,o.classList.add("dragging"),n.dataTransfer.effectAllowed="move",n.dataTransfer.setData("text/plain",o.dataset.filterId)}),e.addEventListener("dragover",n=>{if(!a)return;n.preventDefault(),n.dataTransfer.dropEffect="move";const o=n.target.closest(".filter-add-option");if(!o||o===a){o||e.appendChild(a);return}const i=o.getBoundingClientRect();n.clientX<i.left+i.width/2?o.parentNode.insertBefore(a,o):o.parentNode.insertBefore(a,o.nextSibling)}),e.addEventListener("drop",n=>{if(n.preventDefault(),!a)return;const o=[...e.querySelectorAll(".filter-add-option")].map(i=>i.dataset.filterId);l.filterAddOrder[t]=o,_r()}),e.addEventListener("dragend",()=>{a=null,e.querySelectorAll(".filter-add-option.dragging").forEach(n=>n.classList.remove("dragging"))})}document.body.appendChild(J);function No(){const e=ea.getBoundingClientRect(),t=J.querySelectorAll(".filter-add-group").length||4,a=t*150+(t-1)*14+20,n=Math.max(320,Math.min(a,window.innerWidth-16));let o=e.right-n;o=Math.max(8,Math.min(o,window.innerWidth-n-8)),J.style.width=`${n}px`,J.style.left=`${o}px`,J.style.top=`${e.bottom+6}px`}function Zr(){No(),J.hidden=!1,ea.classList.add("open")}function la(){J.hidden=!0,ea.classList.remove("open")}window.addEventListener("resize",()=>{J.hidden||No()});function $o(e,t,a,n=48){let o="";for(let i=0;i<=n;i++){const r=i/n,s=ri(e,r),c=r*t,u=(1-s)*a;o+=i===0?`M${c.toFixed(2)},${u.toFixed(2)}`:` L${c.toFixed(2)},${u.toFixed(2)}`}return o}function Uo(e,t,a,n,o,i=56){const r=Math.max(0,Math.min(.99,e)),s=Math.max(r+.001,Math.min(1,a)),c=Math.max(.05,t);let u="";for(let d=0;d<=i;d++){const f=d/i,p=Math.max(0,Math.min(1,(f-r)/(s-r))),h=Math.pow(p,1/c),v=f*n,m=(1-h)*o;u+=d===0?`M${v.toFixed(2)},${m.toFixed(2)}`:` L${v.toFixed(2)},${m.toFixed(2)}`}return u}function _o(e,t,a){const n=Math.max(0,Math.min(.99,e)),o=Math.max(n+.001,Math.min(1,a)),i=Math.max(.05,t),r=n+(o-n)*Math.pow(.5,i);return{black:n,mid:Math.max(n,Math.min(o,r)),white:o}}function cn(e){if(!e)return;const t=_.querySelector(`.filter-levels-graph[data-instance-id="${e}"]`);if(!t)return;const a=(m,g)=>{const C=_.querySelector(`input[data-instance-id="${e}"][data-param-key="${m}"]`),M=C?Number(C.value):g;return Number.isFinite(M)?M:g},n=a("blackPoint",0),o=a("gamma",1),i=a("whitePoint",1),r=t.querySelector(".filter-levels-curve"),s=t.querySelector(".filter-levels-marker--black"),c=t.querySelector(".filter-levels-marker--mid"),u=t.querySelector(".filter-levels-marker--white"),d=t.querySelector('.filter-levels-handle[data-handle="black"]'),f=t.querySelector('.filter-levels-handle[data-handle="mid"]'),p=t.querySelector('.filter-levels-handle[data-handle="white"]');if(!r||!s||!c||!u)return;const h=Uo(n,o,i,100,46,56),v=_o(n,o,i);r.setAttribute("d",h),s.setAttribute("x1",(v.black*100).toFixed(2)),s.setAttribute("x2",(v.black*100).toFixed(2)),c.setAttribute("x1",(v.mid*100).toFixed(2)),c.setAttribute("x2",(v.mid*100).toFixed(2)),u.setAttribute("x1",(v.white*100).toFixed(2)),u.setAttribute("x2",(v.white*100).toFixed(2)),d&&(d.style.left=`${(v.black*100).toFixed(2)}%`),f&&(f.style.left=`${(v.mid*100).toFixed(2)}%`),p&&(p.style.left=`${(v.white*100).toFixed(2)}%`)}function Ca(e,t,a){ke(l.selectedId,e,t,a,!0),_.querySelectorAll(`input[data-instance-id="${e}"][data-param-key="${t}"]`).forEach(n=>{n.value=a})}function Qr(e,t){const a=e.params[t.key];if(t.type==="select"){const n=(t.options||[]).map(o=>`<option value="${o.value}" ${a===o.value?"selected":""}>${o.label}</option>`).join("");return`
      <div class="filter-param-row filter-param-row--select">
        <label>${t.label}</label>
        <select data-instance-id="${e.instanceId}" data-param-key="${t.key}" class="filter-param-select">${n}</select>
      </div>`}if(t.type==="toggle")return`
      <div class="filter-param-row filter-param-row--toggle">
        <label>${t.label}</label>
        <label class="filter-param-switch">
          <input type="checkbox" class="filter-param-toggle" data-instance-id="${e.instanceId}" data-param-key="${t.key}" ${a?"checked":""} />
          <span class="filter-param-switch-track"><span class="filter-param-switch-thumb"></span></span>
        </label>
      </div>`;if(t.type==="image"){const n=typeof a=="string"&&a.length>0;return`
      <div class="filter-param-row filter-param-row--image">
        <label>${t.label}</label>
        <div class="filter-image-upload">
          ${n?`<div class="filter-image-thumb" style="background-image:url('${a}')"></div>`:""}
          <button type="button" class="filter-image-btn" data-action="upload-image" data-instance-id="${e.instanceId}" data-param-key="${t.key}">${n?"Replace":"Upload"}</button>
          ${n?`<button type="button" class="filter-image-clear" data-action="clear-image" data-instance-id="${e.instanceId}" data-param-key="${t.key}" title="Remove image">&times;</button>`:""}
        </div>
        <input type="file" accept="image/*" class="filter-image-input" data-instance-id="${e.instanceId}" data-param-key="${t.key}" hidden />
      </div>`}if(t.type==="curve"){const n=It(a),o=$o(n,100,100,40);return`
      <div class="filter-param-row filter-param-row--curve">
        <label>${t.label}</label>
        <button type="button" class="filter-curve-preview" data-action="open-curve"
          data-instance-id="${e.instanceId}" data-param-key="${t.key}" data-label="${t.label}" title="Edit curve">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="filter-curve-svg">
            <path d="${o}" />
          </svg>
          <span class="filter-curve-expand-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2H2v4M10 14h4v-4M2 2l4.5 4.5M14 14l-4.5-4.5" />
            </svg>
          </span>
        </button>
      </div>`}if(t.type==="color"){const n=typeof a=="string"&&a.length>0?a:"#ffffff";return`
      <div class="filter-param-row filter-param-row--color">
        <label>${t.label}</label>
        <input type="color" value="${n}" class="filter-param-color"
          data-instance-id="${e.instanceId}" data-param-key="${t.key}" title="${t.label}" />
      </div>`}if(t.type==="gradient"){const n=mt(a),o=Gn(n);return`
      <div class="filter-param-row filter-param-row--gradient">
        <label>${t.label}</label>
        <button type="button" class="filter-gradient-preview" data-action="open-gradient"
          data-instance-id="${e.instanceId}" data-param-key="${t.key}" data-label="${t.label}" title="Edit gradient">
          <span class="filter-gradient-swatch" style="background:${o}"></span>
          <span class="filter-curve-expand-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2H2v4M10 14h4v-4M2 2l4.5 4.5M14 14l-4.5-4.5" />
            </svg>
          </span>
        </button>
      </div>`}if(t.type==="levelsGraph"){const n=Number.isFinite(e.params[t.blackKey])?e.params[t.blackKey]:0,o=Number.isFinite(e.params[t.gammaKey])?e.params[t.gammaKey]:1,i=Number.isFinite(e.params[t.whiteKey])?e.params[t.whiteKey]:1,r=Uo(n,o,i,100,46,56),s=_o(n,o,i);return`
      <div class="filter-param-row filter-param-row--levels-graph">
        <label>${t.label}</label>
        <div class="filter-levels-graph" data-instance-id="${e.instanceId}">
          <svg viewBox="0 0 100 46" preserveAspectRatio="none" class="filter-levels-svg" aria-hidden="true">
            <line class="filter-levels-grid" x1="0" y1="45.5" x2="100" y2="45.5"></line>
            <line class="filter-levels-grid" x1="25" y1="0" x2="25" y2="46"></line>
            <line class="filter-levels-grid" x1="50" y1="0" x2="50" y2="46"></line>
            <line class="filter-levels-grid" x1="75" y1="0" x2="75" y2="46"></line>
            <path class="filter-levels-curve" d="${r}"></path>
            <line class="filter-levels-marker filter-levels-marker--black" x1="${(s.black*100).toFixed(2)}" y1="0" x2="${(s.black*100).toFixed(2)}" y2="46"></line>
            <line class="filter-levels-marker filter-levels-marker--mid" x1="${(s.mid*100).toFixed(2)}" y1="0" x2="${(s.mid*100).toFixed(2)}" y2="46"></line>
            <line class="filter-levels-marker filter-levels-marker--white" x1="${(s.white*100).toFixed(2)}" y1="0" x2="${(s.white*100).toFixed(2)}" y2="46"></line>
          </svg>
          <button type="button" class="filter-levels-handle filter-levels-handle--black" data-instance-id="${e.instanceId}" data-handle="black" title="Black point"></button>
          <button type="button" class="filter-levels-handle filter-levels-handle--mid" data-instance-id="${e.instanceId}" data-handle="mid" title="Gamma"></button>
          <button type="button" class="filter-levels-handle filter-levels-handle--white" data-instance-id="${e.instanceId}" data-handle="white" title="White point"></button>
        </div>
      </div>`}return`
    <div class="filter-param-row">
      <label${t.hint?` title="${t.hint}"`:""}>${t.label}</label>
      <input type="range" min="${t.min}" max="${t.max}" step="${t.step}" value="${a}"
        data-instance-id="${e.instanceId}" data-param-key="${t.key}" class="filter-param-range" />
      <input type="number" min="${t.min}" max="${t.max}" step="${t.step}" value="${a}"
        data-instance-id="${e.instanceId}" data-param-key="${t.key}" class="filter-param-number" />
    </div>`}function F(){const e=l.selectedId,t=e?G(e):[];if(Ni.style.display=t.length===0?"block":"none",Ht.checked=e?Ne(e):!1,Ht.disabled=!e,ro.disabled=!e,me.disabled=!e,_.innerHTML=t.map((a,n)=>{const o=Te(a.defId);if(!o)return"";const i=o.params.filter(r=>ot(r,a.params)).map(r=>Qr(a,r)).join("");return`
      <div class="filter-item ${a.enabled?"":"disabled"} ${a.collapsed?"collapsed":""}" draggable="false" data-instance-id="${a.instanceId}">
        <div class="filter-item-head">
          <label class="filter-toggle fx-eye-toggle" title="${a.enabled?"Disable filter":"Enable filter"}">
            <input type="checkbox" data-action="toggle" data-instance-id="${a.instanceId}" ${a.enabled?"checked":""} />
            <svg class="eye-icon eye-icon-open" viewBox="0 0 24 16" aria-hidden="true">
              <path d="M1.5 8s2.7-5.5 10.5-5.5S22.5 8 22.5 8 19.8 13.5 12 13.5 1.5 8 1.5 8Z"></path>
              <circle cx="12" cy="8" r="2.8"></circle>
            </svg>
            <svg class="eye-icon eye-icon-closed" viewBox="0 0 24 16" aria-hidden="true">
              <path d="M1.5 8s2.7-5.5 10.5-5.5S22.5 8 22.5 8 19.8 13.5 12 13.5 1.5 8 1.5 8Z"></path>
              <circle cx="12" cy="8" r="2.8"></circle>
              <line x1="2" y1="1" x2="22" y2="15"></line>
            </svg>
          </label>
          <button class="filter-collapse-button" data-action="collapse" data-instance-id="${a.instanceId}" title="${a.collapsed?"Expand filter":"Collapse filter"}" aria-expanded="${a.collapsed?"false":"true"}">&rsaquo;</button>
          <span class="filter-name" draggable="true">${o.label}</span>
          <div class="filter-item-actions">
            <button data-action="remove" data-instance-id="${a.instanceId}" title="Remove">&times;</button>
          </div>
        </div>
        <div class="filter-item-params">${i}</div>
      </div>`}).join(""),z&&!E.hidden){const a=_.querySelector(`[data-action="open-curve"][data-instance-id="${z.instanceId}"][data-param-key="${z.paramKey}"]`);a?(z.trigger=a,yn()):ma()}if(O&&!P.hidden){const a=_.querySelector(`[data-action="open-gradient"][data-instance-id="${O.instanceId}"][data-param-key="${O.paramKey}"]`);a?(O.trigger=a,Qo()):pa()}Ja(_),_.querySelectorAll(".filter-levels-graph[data-instance-id]").forEach(a=>{cn(a.dataset.instanceId)}),el()}let Rn=null;function el(){clearTimeout(Rn),Rn=setTimeout(tl,220)}async function un(e){if(!e||!ve||l.selectedId!==e)return!1;const t=G(e).filter(i=>i.enabled);if(R.style.display==="none"||!Ne(e)||t.length===0)return!1;const a=[...t].reverse(),n=ve.captureAtScale(a,Xt,1);if(!n)return!1;const o=await Ro(n.dataUrl);return l.selectedId!==e?!1:(l.previews[e]=o,ia(),qo(e),!0)}function tl(){const e=l.selectedId;e&&un(e).then(t=>{t||fa()})}function sa(e){const t=["linear-gradient(135deg,#2a3f88 0%,#18274f 100%)","linear-gradient(135deg,#5d2a83 0%,#251749 100%)","linear-gradient(135deg,#85481e 0%,#3a2112 100%)","linear-gradient(135deg,#165b67 0%,#0f2e35 100%)"];return t[e%t.length]}function Oo(e){const t=e.entry.includes("?")?"&":"?";return`${e.entry}${t}project=${encodeURIComponent(e.id)}`}function zo(e,t){if(!e||e.getElementById("shaderopsUiEnhancements")||!e.getElementById("app")&&!e.body)return;const a=e.createElement("style");a.id="shaderopsUiEnhancements",a.textContent=`
    #hud, .hud, #panelToggleDock, .panel-toggle-dock { z-index: 10; }
    .control-row label, .hud-title, .control-group h3 {
      text-transform: none !important;
      letter-spacing: .01em !important;
    }
    .control-row label {
      color: rgba(214, 218, 226, .60) !important;
    }
    .control-group h3 {
      color: rgba(214, 218, 226, .60) !important;
    }
    /* Sections stack as flex children (not grid rows) so their content height is
       never compressed below its natural size â€” overflow is handled purely by
       .controls' own overflow-y: auto. Grid rows can shrink below content size
       once a child sets overflow:hidden (needed below for the collapse feature);
       flex-shrink:0 makes that impossible regardless of overflow. */
    .controls {
      display: flex !important;
      flex-direction: column !important;
    }
    .control-group {
      overflow: hidden;
      flex-shrink: 0 !important;
    }
    .control-group h3 {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      user-select: none;
    }
    .control-group h3::before {
      content: "";
      flex: none;
      display: block;
      width: 0;
      height: 0;
      margin: 0 2px;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid rgba(214, 218, 226, .48);
      transform-origin: 50% 50%;
      transition: transform .14s ease;
    }
    .control-group.is-collapsed h3::before {
      transform: rotate(-90deg);
    }
    .control-group.is-collapsed > :not(h3) {
      display: none !important;
    }
    input[type="range"] {
      accent-color: rgba(180, 188, 202, .82);
      height: 3px;
      width: 100%;
      cursor: pointer;
    }
    input[type="range"]::-webkit-slider-runnable-track {
      height: 3px;
      border-radius: 99px;
      background: rgba(150, 158, 170, .28);
    }
    input[type="range"]::-webkit-slider-thumb {
      width: 11px;
      height: 11px;
      margin-top: -4px;
      border: 1px solid rgba(232, 235, 240, .76);
      border-radius: 50%;
      background: rgba(180, 188, 202, .95);
      -webkit-appearance: none;
    }
    /* ShaderOps-wide pill-slider skin (see mountPillWidgets in main.js) */
    .w-pill {
      position: relative;
      width: 100%;
      height: 8px;
      border-radius: 99px;
      background: rgba(255, 255, 255, .06);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, .55);
      cursor: pointer;
      touch-action: none;
      overflow: hidden;
    }
    .w-pill__fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      border-radius: 99px;
      background: linear-gradient(90deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.13) 45%, rgba(255,255,255,.38) 100%);
    }
    .w-pill__fill::after {
      content: "";
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 10px;
      border-radius: 99px;
      background: rgba(255, 255, 255, .42);
      filter: blur(1.5px);
    }
    .w-pill__fill.is-tip-left::after {
      right: auto;
      left: 0;
    }
    .w-pill--center::before {
      content: "";
      position: absolute;
      left: calc(var(--pill-center, 50%) - 0.5px);
      top: 1px;
      bottom: 1px;
      width: 1px;
      background: rgba(255, 255, 255, .22);
      pointer-events: none;
    }
    .actions { color: rgba(205, 210, 218, .78); }
    .actions button {
      border-color: rgba(160, 168, 180, .20) !important;
      background: rgba(120, 128, 140, .14) !important;
      color: rgba(218, 222, 230, .78) !important;
    }
    .history-actions { order: 20; margin-left: auto !important; margin-right: 0 !important; }
    .history-actions button {
      min-width: 20px !important;
      width: 20px;
      height: 20px;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      padding: 0 !important;
      font-size: 0 !important;
      color: rgba(220, 224, 232, .72) !important;
    }
    .history-actions button::before { font-size: 15px; line-height: 20px; }
    #undoButton::before, [id="undoButton"]::before { content: "\\21B6"; }
    #redoButton::before, [id="redoButton"]::before { content: "\\21B7"; }
    #pauseButton {
      position: relative;
      width: 26px;
      height: 24px;
      padding: 0 !important;
      font-size: 0 !important;
    }
    #pauseButton::before,
    #pauseButton::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
    }
    /* Paused â†’ play triangle (geometric border-triangle, no glyph offset issues) */
    #pauseButton::before {
      width: 0;
      height: 0;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      border-left: 8px solid rgba(220, 224, 232, .78);
      transform: translate(-35%, -50%);
    }
    #pauseButton::after { content: none; }
    /* Playing â†’ two solid bars */
    #pauseButton[data-shaderops-state="playing"]::before {
      width: 3px;
      height: 12px;
      border: 0;
      border-radius: 1px;
      background: rgba(220, 224, 232, .78);
      transform: translate(-5px, -50%);
    }
    #pauseButton[data-shaderops-state="playing"]::after {
      content: "";
      width: 3px;
      height: 12px;
      border-radius: 1px;
      background: rgba(220, 224, 232, .78);
      transform: translate(2px, -50%);
    }
    /* Icon-only All Random (dice) / Seed (wave) buttons */
    #allRandomButton,
    #randomButton {
      width: 26px;
      height: 24px;
      padding: 0 !important;
      display: grid !important;
      place-items: center;
    }
    #allRandomButton svg,
    #randomButton svg {
      width: 14px;
      height: 14px;
      display: block;
      pointer-events: none;
    }
    #saveButton { display: none !important; }
  `,e.head?.appendChild(a),Ja(e);const n=e.getElementById("allRandomButton");n&&!n.querySelector("svg")&&(n.textContent="",n.title="All random (R)",n.innerHTML=`
      <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" stroke="currentColor" stroke-width="1.3"></rect>
        <circle cx="5" cy="5" r="1.15" fill="currentColor"></circle>
        <circle cx="11" cy="5" r="1.15" fill="currentColor"></circle>
        <circle cx="8" cy="8" r="1.15" fill="currentColor"></circle>
        <circle cx="5" cy="11" r="1.15" fill="currentColor"></circle>
        <circle cx="11" cy="11" r="1.15" fill="currentColor"></circle>
      </svg>`);const o=e.getElementById("randomButton");o&&!o.querySelector("svg")&&(o.textContent="",o.title="Reroll seed",o.innerHTML=`
      <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M1 9c1.4-3 2.8-4.5 4.2-4.5S7.6 7 9 7s3.6-2.5 5-2.5S16.4 6 16.4 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>`);const i=e.getElementById("saveButton");i&&(i.style.display="none"),n&&!e.body?.dataset.shaderopsRandomShortcut&&(e.body&&(e.body.dataset.shaderopsRandomShortcut="1"),e.addEventListener("keydown",d=>{d.key!=="r"&&d.key!=="R"||d.metaKey||d.ctrlKey||d.altKey||d.target?.matches("input, textarea, select, button")||(d.preventDefault(),n.click())}));const r=e.querySelector(".controls");if(!r)return;const s=`shaderops:control-groups:${t}`,c=fe(S.getItem(s),{});r.querySelectorAll(".control-group").forEach((d,f)=>{const p=d.querySelector("h3");if(!p)return;const h=p.textContent.trim().toLowerCase()||`group-${f}`;c[h]===!0&&d.classList.add("is-collapsed"),p.setAttribute("role","button"),p.setAttribute("tabindex","0");const v=()=>{d.classList.toggle("is-collapsed"),c[h]=d.classList.contains("is-collapsed"),S.setItem(s,JSON.stringify(c))};p.addEventListener("click",v),p.addEventListener("keydown",m=>{(m.key==="Enter"||m.key===" ")&&(m.preventDefault(),v())})});const u=e.getElementById("pauseButton");if(u){const d=()=>{const f=/\bresume\b/i.test(u.textContent);u.dataset.shaderopsState=f?"paused":"playing",u.title=f?"Resume (Space)":"Pause (Space)"};d(),u.addEventListener("click",()=>setTimeout(d,0)),e.addEventListener("keydown",f=>{f.code!=="Space"||f.target?.matches("input, textarea, select, button")||(f.preventDefault(),u.click())})}}function dn(e){return!e||e.type!=="shaderops/preview"||!e.projectId?null:e.image||e.dataUrl||null}async function al(e){try{return(await fetch(e.entry,{method:"HEAD",cache:"no-store"})).ok}catch{return!1}}const nl=51;function Ho(){const e=at.hidden;at.hidden=!0;const t=oe.clientHeight;return at.hidden=e,t?Math.max(1,Math.floor((t+5)/nl)):l.projects.length||1}function ye(){if(l.projects.length===0){oe.innerHTML='<div class="thumb-empty">No projects</div>',at.hidden=!0,oe.classList.remove("paged");return}const e=Ho(),t=Math.max(1,Math.ceil(l.projects.length/e));l.navPage=Math.min(Math.max(0,l.navPage),t-1);const a=t>1;oe.classList.toggle("paged",a),at.hidden=!a,a&&(Ti.textContent=`${l.navPage+1} / ${t}`);const n=a?l.navPage*e:0,o=a?n+e:l.projects.length;oe.innerHTML=l.projects.map((i,r)=>({project:i,index:r})).slice(n,o).map(({project:i,index:r})=>{const s=i.id===l.selectedId,c=l.previews[i.id],u=c?`background-image:url('${c}');background-size:cover;`:`background:${sa(r)};`;return`
        <button class="project-thumb ${s?"active":""}" data-project-id="${i.id}" style="${u}">
          <span class="thumb-gloss"></span>
          <span class="thumb-tooltip">
            <strong>${i.name}</strong>
            <small>${i.engine}</small>
          </span>
        </button>`}).join("")}function qo(e){if(!e)return;const t=l.projects.findIndex(i=>i.id===e);if(t===-1)return;const a=l.previews[e],n=a?`background-image:url('${a}');background-size:cover;`:`background:${sa(t)};`,o=CSS.escape(e);document.querySelectorAll(`[data-project-id="${o}"]`).forEach(i=>i.setAttribute("style",n))}let Ct=null,ue=null,ut=null,Fn="rail",Z=[],Pe=0;function ca(){Ct&&(clearTimeout(Ct),Ct=null)}function be(){ca(),ue=null,ut=null,Z=[],Pe=0,re.hidden=!0}function ol(e){return l.projects.find(t=>t.id===e)||null}function il(e,t){const a=Ye(e);return a.slots.length?a.slots.map((n,o)=>{const i=typeof n.preview=="string"&&n.preview?n.preview:null,r=i?`background-image:url('${i}');background-size:cover;background-position:center;`:t+"opacity:0.42;",s=i?`background-image:url('${i}');background-size:cover;background-position:center;`:t;return{slotId:n.id,image:i,thumbStyle:r,heroStyle:s,title:i?`Checkpoint ${o+1}`:`Checkpoint ${o+1} (no snapshot yet)`}}):[]}function Go(){if(!Z.length){Pn.innerHTML='<span class="thumb-hover-preview__empty">No checkpoints</span>';return}Pn.innerHTML=Z.map((e,t)=>`<span class="thumb-hover-preview__cp${e.image?"":" thumb-hover-preview__cp--empty"}${t===Pe?" is-active":""}" style="${e.thumbStyle}" title="${e.title}"></span>`).join("")}function rl(e,t){const a=re.getBoundingClientRect(),n=e.getBoundingClientRect(),o=10,i=window.innerWidth-a.width-8,r=window.innerHeight-a.height-8;let s=n.right+o,c=n.top+n.height*.5-a.height*.5;if(t==="effect-panel"){const u=j.hidden?n:j.getBoundingClientRect();s=u.right+o,s>i&&(s=u.left-a.width-o)}else s>i&&(s=n.left-a.width-o);re.style.left=`${Math.max(8,Math.min(s,i))}px`,re.style.top=`${Math.max(8,Math.min(c,r))}px`}function ll(e,t,a){const n=ol(t);if(!n)return;const o=Math.max(0,l.projects.findIndex(u=>u.id===t)),i=`background:${sa(o)};`,r=l.previews[t]||null,s=r?`background-image:url('${r}');background-size:cover;background-position:center;`:i;Z=il(t,i),Pe=0;const c=Z[0]?.heroStyle||s;tr.textContent=n.name,fo.setAttribute("style",c),Go(),re.dataset.source=a,re.hidden=!1,rl(e,a)}function Wo(e,t,a){ca(),ue=e,ut=t,Fn=a,Ct=setTimeout(()=>{Ct=null,!(!ue||!ue.isConnected)&&ll(ue,ut,Fn)},Bi)}function jo(e){if(!Z.length)return;Pe=(Pe+e+Z.length)%Z.length;const t=Z[Pe]?.heroStyle;t&&fo.setAttribute("style",t),Go()}function Vo(e,t){if(ut!==e||Z.length===0||t&&ue&&ue.dataset.projectId!==t.dataset.projectId)return null;const a=Z[Pe]?.slotId;return a||(Ye(e).slots[Pe]?.id??null)}function Xo(e,t){if(!t)return;if(q.has(e)){Ha(e,t);return}let a=0;const n=setInterval(()=>{if(a+=1,q.has(e)){clearInterval(n),Ha(e,t);return}a>30&&clearInterval(n)},50)}function sl(e){const t=l.projects.findIndex(n=>n.id===e);if(t===-1)return;const a=Ho();l.navPage=Math.floor(t/a),ye()}const cl='<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.4l1.98 4.02 4.44.65-3.21 3.13.76 4.42L8 11.55l-3.97 2.07.76-4.42-3.21-3.13 4.44-.65z"/></svg>',ul='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.4l1.98 4.02 4.44.65-3.21 3.13.76 4.42L8 11.55l-3.97 2.07.76-4.42-3.21-3.13 4.44-.65z"/></svg>';function Ea(e,t){const a=e.id===l.selectedId,n=l.favorites.includes(e.id),o=l.previews[e.id],i=o?`background-image:url('${o}');background-size:cover;`:`background:${sa(t)};`;return`
    <div class="nav-grid-thumb ${a?"active":""}" draggable="true" data-project-id="${e.id}" style="${i}" title="${e.name}">
      <button type="button" class="nav-grid-fav-star ${n?"favorited":""}" data-fav-toggle="${e.id}" title="${n?"Remove from favorites":"Add to favorites"}">
        ${n?cl:ul}
      </button>
    </div>`}function Vt(e){return!e||typeof e!="object"?!1:Array.isArray(e.tags)&&e.tags.some(t=>String(t).toLowerCase()==="3d")?!0:/\b3d\b/i.test(String(e.engine||""))}function ua(){const e=Ra.closest(".nav-grid-section"),t=l.favorites.map(c=>l.projects.find(u=>u.id===c)).filter(Boolean);e.classList.toggle("empty",t.length===0),Ra.innerHTML=t.map(c=>Ea(c,l.projects.indexOf(c))).join("");const a=new Set(l.favorites),n=Fa.closest(".nav-grid-section"),o=Na.closest(".nav-grid-section"),i=l.projects.filter(c=>!a.has(c.id)),r=i.filter(c=>!Vt(c)),s=i.filter(c=>Vt(c));n&&n.classList.toggle("empty",r.length===0),o&&o.classList.toggle("empty",s.length===0),Fa.innerHTML=r.map(c=>Ea(c,l.projects.indexOf(c))).join(""),Na.innerHTML=s.map(c=>Ea(c,l.projects.indexOf(c))).join("")}function Ko(){const e=new Set(l.favorites),t=l.favorites.map(n=>l.projects.find(o=>o.id===n)).filter(Boolean),a=l.projects.filter(n=>!e.has(n.id));l.projects=[...t,...a]}function dl(e){const t=l.favorites.indexOf(e);t===-1?l.favorites.push(e):l.favorites.splice(t,1),To(),Ko(),ln(),ua(),ye()}function fl(){ua(),j.hidden=!1,Za.hidden=!1,Qt.classList.add("active")}function da(){j.hidden||(j.hidden=!0,Za.hidden=!0,Qt.classList.remove("active"),be())}function fn(e,t){let a=null,n=null;e.addEventListener("dragstart",o=>{if(o.target.closest("[data-fav-toggle]")){o.preventDefault();return}const i=o.target.closest(".nav-grid-thumb");if(!i){o.preventDefault();return}a=i.dataset.projectId,n=i,i.classList.add("dragging"),o.dataTransfer.effectAllowed="move",o.dataTransfer.setData("text/plain",a)}),e.addEventListener("dragover",o=>{if(!n)return;o.preventDefault(),o.dataTransfer.dropEffect="move";const i=o.target.closest(".nav-grid-thumb");if(!i||i===n){i||e.appendChild(n);return}const r=i.getBoundingClientRect();o.clientX<r.left+r.width/2?i.parentNode.insertBefore(n,i):i.parentNode.insertBefore(n,i.nextSibling)}),e.addEventListener("drop",o=>{if(o.preventDefault(),!a)return;const i=[...e.querySelectorAll(".nav-grid-thumb")].map(r=>r.dataset.projectId);t(i)}),e.addEventListener("dragend",()=>{a=null,n=null,e.querySelectorAll(".nav-grid-thumb.dragging").forEach(o=>o.classList.remove("dragging"))})}function pn(){const e=l.projects.find(t=>t.id===l.selectedId);if(!e){La.textContent="No project selected",Aa.textContent="â€”",D.src="about:blank",Ta.disabled=!0,wa();return}La.textContent=e.name,Aa.textContent=e.engine,D.classList.add("frame-swapping"),D.src=Oo(e),Ta.disabled=!1,S.setItem(zt,e.id),Ga=null,F(),bo(e)?(wa(),q.get(e.id)&&(ae(e.id),So()),requestAnimationFrame(()=>requestAnimationFrame(it))):(wa(),pl(D,e.id))}function it(){D.classList.remove("frame-swapping")}function pl(e,t){let a=0;const n=()=>{if(e!==D||l.selectedId!==t)return;a+=1;let o=null;try{o=e.contentDocument}catch{o=null}if(o&&o.readyState!=="loading"&&(o.getElementById("app")||o.body)){try{zo(o,t)}catch(i){console.warn("ShaderOps: unable to install project UI enhancements (early).",i)}requestAnimationFrame(()=>requestAnimationFrame(it));return}a<300?requestAnimationFrame(n):it()};requestAnimationFrame(n),setTimeout(it,1500)}window.addEventListener("message",async e=>{const t=e.data;if(t&&typeof t.type=="string"&&t.type.startsWith("shaderops/")&&(t.type==="shaderops/ready"||t.type==="shaderops/values-changed"||t.type==="shaderops/keydown")){xr(t,e.source||null);return}const a=dn(e.data);if(!a)return;const{projectId:n}=e.data;n&&n!==l.selectedId&&An(n)&&l.previews[n]||n===l.selectedId&&n&&An(n)&&(await un(n)||l.previews[n])||(l.previews[n]=await Ro(a),ia(),qo(n))});function fa(){if(l.captureInFlight)return Promise.resolve();const e=l.projects.find(a=>a.id===l.selectedId),t=D.contentWindow;return!e||!t?Promise.resolve():un(e.id).then(a=>{if(!a)return l.captureInFlight=!0,new Promise(n=>{const o=setTimeout(()=>{window.removeEventListener("message",i),l.captureInFlight=!1,n()},1500),i=r=>{dn(r.data)&&r.data.projectId===e.id&&(clearTimeout(o),window.removeEventListener("message",i),l.captureInFlight=!1,n())};window.addEventListener("message",i),t.postMessage({type:"shaderops/request-preview",projectId:e.id},"*")})})}async function ml(e){return new Promise(t=>{const a=document.createElement("iframe");a.style.cssText="position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;border:none;",document.body.appendChild(a);let n=!1;const o=()=>{n||(n=!0,clearTimeout(i),window.removeEventListener("message",r),a.remove(),t())},i=setTimeout(o,1e4),r=s=>{dn(s.data)&&s.data.projectId===e.id&&o()};window.addEventListener("message",r),a.addEventListener("load",()=>{setTimeout(()=>{try{a.contentWindow?.postMessage({type:"shaderops/request-preview",projectId:e.id},"*")}catch{o()}},2500)}),a.src=Oo(e)})}async function hl(){if(!l.prewarmActive){for(l.prewarmActive=!0;l.prewarmQueue.length>0;){const e=l.prewarmQueue.shift();l.previews[e.id]||await ml(e)}l.prewarmActive=!1}}async function mn(e){e!==l.selectedId&&(await fa(),l.selectedId=e,ye(),pn())}D.addEventListener("load",()=>{const e=l.projects.find(t=>t.id===l.selectedId);if(e){try{zo(D.contentDocument,e.id)}catch(t){console.warn("ShaderOps: unable to install project UI enhancements.",t)}it(),setTimeout(()=>{try{D.contentWindow?.postMessage({type:"shaderops/request-preview",projectId:e.id},"*")}catch{}},2e3)}});async function vl(){const e=await fetch("/registry.json",{cache:"no-store"});if(!e.ok)throw new Error(`Unable to load registry (${e.status})`);const t=await e.json(),a=Array.isArray(t.projects)?t.projects:[],n=await Promise.all(a.map(c=>al(c)));l.projects=a.filter((c,u)=>n[u]),$r();const o=new Set(l.projects.map(c=>c.id));let i=!1;Object.keys(l.previews).forEach(c=>{o.has(c)||(delete l.previews[c],i=!0)}),i&&ia();const r=S.getItem(zt),s=l.projects.find(c=>c.id===r)?r:l.projects[0]?.id??null;l.selectedId=s,ye(),pn(),l.prewarmQueue=l.projects.filter(c=>!l.previews[c.id]),l.prewarmQueue.length>0&&setTimeout(hl,3e3)}async function gl(e){if(l.projects.find(a=>a.id===e))try{l.selectedId===e&&(await fa(),D.src="about:blank",await new Promise(o=>{let i=!1;const r=()=>{i||(i=!0,D.removeEventListener("load",s),clearTimeout(c),o())},s=()=>r(),c=setTimeout(r,1200);D.addEventListener("load",s,{once:!0})}));const a=await fetch(`/api/projects/${encodeURIComponent(e)}`,{method:"DELETE"}),n=await a.json().catch(()=>({}));if(!a.ok){const o=n?.detail?`: ${n.detail}`:"",i=n?.error?`${n.error}${o}`:`Delete failed (${a.status})`;throw new Error(i)}if(l.projects=l.projects.filter(o=>o.id!==e),delete l.previews[e],ia(),l.selectedId===e){const o=l.projects[0]?.id??null;l.selectedId=o,o?S.setItem(zt,o):S.removeItem(zt)}l.prewarmQueue=l.prewarmQueue.filter(o=>o.id!==e),ye(),pn()}catch(a){const n=a instanceof Error?a.message:String(a);window.alert(`Unable to delete project: ${n}`)}}oe.addEventListener("click",async e=>{const t=e.target.closest("[data-project-id]");if(!t)return;const a=t.dataset.projectId,n=Vo(a,t);await mn(a),Xo(a,n),be()});oe.addEventListener("pointerover",e=>{const t=e.target.closest(".project-thumb[data-project-id]");!t||!oe.contains(t)||Wo(t,t.dataset.projectId,"rail")});oe.addEventListener("pointerout",e=>{const t=e.target.closest(".project-thumb[data-project-id]");if(!t)return;const a=e.relatedTarget;a&&(t.contains(a)||re.contains(a))||(ca(),ue===t&&be())});oe.addEventListener("pointerleave",e=>{const t=e.relatedTarget;t&&re.contains(t)||be()});function Nn(e){l.navPage+=e,ye()}function Yo(e){oe.classList.contains("paged")&&(e.preventDefault(),e.deltaY>0?Nn(1):e.deltaY<0&&Nn(-1))}oe.addEventListener("wheel",e=>{const t=e.target.closest(".project-thumb[data-project-id]");if(t&&!re.hidden&&ue===t&&ut===t.dataset.projectId&&Z.length>0){e.preventDefault();const a=Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX;a!==0&&jo(a>0?1:-1);return}Yo(e)},{passive:!1});at.addEventListener("wheel",Yo,{passive:!1});let $n=null;window.addEventListener("resize",()=>{clearTimeout($n),$n=setTimeout(ye,120),be()});Qt.addEventListener("click",e=>{e.stopPropagation(),j.hidden?fl():da()});j.addEventListener("click",e=>{const t=e.target.closest("[data-fav-toggle]");if(t){e.stopPropagation(),dl(t.dataset.favToggle);return}const a=e.target.closest(".nav-grid-thumb[data-project-id]");if(!a)return;const n=a.dataset.projectId,o=Vo(n,a);da(),sl(n),mn(n).then(()=>{Xo(n,o)}),be()});j.addEventListener("pointerover",e=>{if(j.hidden)return;const t=e.target.closest(".nav-grid-thumb[data-project-id]");!t||!j.contains(t)||Wo(t,t.dataset.projectId,"effect-panel")});j.addEventListener("pointerout",e=>{const t=e.target.closest(".nav-grid-thumb[data-project-id]");if(!t)return;const a=e.relatedTarget;a&&(t.contains(a)||re.contains(a))||(ca(),ue===t&&be())});j.addEventListener("pointerleave",e=>{const t=e.relatedTarget;t&&re.contains(t)||be()});j.addEventListener("wheel",e=>{const t=e.target.closest(".nav-grid-thumb[data-project-id]");if(!t||re.hidden||ue!==t||ut!==t.dataset.projectId||Z.length===0)return;e.preventDefault(),e.stopPropagation();const a=Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX;a!==0&&jo(a>0?1:-1)},{passive:!1});Za.addEventListener("click",()=>da());document.addEventListener("click",e=>{j.hidden||j.contains(e.target)||Qt.contains(e.target)||da()});document.addEventListener("dragstart",()=>be());window.addEventListener("blur",()=>be());fn(Ra,e=>{l.favorites=e,To(),Ko(),ln(),ua(),ye()});function Jo(e,t){const a=new Set(l.favorites),n=l.favorites.map(f=>l.projects.find(p=>p.id===f)).filter(Boolean),o=l.projects.filter(f=>!a.has(f.id)&&!Vt(f)),i=l.projects.filter(f=>!a.has(f.id)&&Vt(f)),r=new Map(l.projects.map(f=>[f.id,f])),s=e.map(f=>r.get(f)).filter(Boolean),c=t==="3d"?i.length:o.length;if(s.length!==c)return;const u=t==="2d"?s:o,d=t==="3d"?s:i;l.projects=[...n,...u,...d],ln(),ua(),ye()}fn(Fa,e=>Jo(e,"2d"));fn(Na,e=>Jo(e,"3d"));Ta.addEventListener("click",()=>{if(!l.selectedId)return;const e=l.projects.find(t=>t.id===l.selectedId);ji.textContent=e?`Delete "${e.name}"? This removes its files permanently and cannot be undone.`:"This removes its files permanently and cannot be undone.",nt.hidden=!1});Xi.addEventListener("click",()=>{nt.hidden=!0});nt.addEventListener("click",e=>{e.target===nt&&(nt.hidden=!0)});Vi.addEventListener("click",()=>{nt.hidden=!0,l.selectedId&&gl(l.selectedId)});window.addEventListener("beforeunload",()=>{const e=D.contentWindow,t=l.projects.find(a=>a.id===l.selectedId);!e||!t||e.postMessage({type:"shaderops/request-preview",projectId:t.id},"*")});let ve=null,Ga=null,Xt=0,Un=performance.now()/1e3;const Qe=document.createElement("canvas"),_n=Qe.getContext("2d",{willReadFrequently:!1});function yl(){return ve||(ve=new fi(R),ve)}let Wa=null;const tt=new Map;let On=null;function bl(e,t){if(e){On!==e&&(tt.clear(),On=e);for(const[a,n]of t){let o=tt.get(a);o||(o=e.createElement("canvas"),o.className="fx-underlay-item",o.style.cssText="position:fixed;pointer-events:none;z-index:1;display:none;",e.body.appendChild(o),tt.set(a,o)),o.style.display="block",o.style.left=`${n.x}px`,o.style.top=`${n.y}px`,o.style.width=`${n.w}px`,o.style.height=`${n.h}px`}for(const[a,n]of tt)t.has(a)||(n.style.display="none")}}function xl(e,t){const a=e.width||0,n=e.height||0;if(!(a<=0||n<=0))for(const[o,i]of tt){if(i.style.display==="none")continue;const r=parseFloat(i.style.width)||0,s=parseFloat(i.style.height)||0;if(r<=0||s<=0)continue;const c=Math.max(1,Math.round(r*t)),u=Math.max(1,Math.round(s*t));i.width!==c&&(i.width=c),i.height!==u&&(i.height=u);const d=Math.max(0,Math.min(a-1,Math.round(parseFloat(i.style.left)*t))),f=Math.max(0,Math.min(n-1,Math.round(parseFloat(i.style.top)*t))),p=Math.max(1,Math.min(a-d,c)),h=Math.max(1,Math.min(n-f,u)),v=i.getContext("2d");if(v)try{v.clearRect(0,0,c,u),v.drawImage(e,d,f,p,h,0,0,c,u)}catch{}}}function wl(e,t,a){const n=[],o=new Map,i=0;try{if(e)for(const f of["hud","panelToggleDock","shaderopsCheckpoints","shaderopsCheckpointMenu"]){const p=e.getElementById(f);if(!p)continue;const h=e.defaultView?.getComputedStyle(p);if(h?.display==="none"||h?.visibility==="hidden"||h?.contentVisibility==="hidden")continue;const v=p.getBoundingClientRect();if(v.width>0&&v.height>0){const m=v.left-i,g=v.top-i,C=Math.max(0,m),M=Math.max(0,g),x=Math.min(t,m+v.width+i*2),V=Math.min(a,g+v.height+i*2);x>C&&V>M&&(n.push({x:C,y:M,w:x-C,h:V-M}),o.set(f,{x:C,y:M,w:x-C,h:V-M}))}}}catch{}bl(e,o);const r=`${t}x${a}|`+n.map(f=>`${f.x},${f.y},${f.w},${f.h}`).join(";");if(r===Wa)return;if(Wa=r,R.style.clipPath="none",!n.length){R.style.maskImage="none",R.style.webkitMaskImage="none";return}const s=[];for(const f of n){let p=f;for(let h=s.length-1;h>=0;h--){const v=s[h];if(p.x<v.x+v.w&&p.x+p.w>v.x&&p.y<v.y+v.h&&p.y+p.h>v.y){const g=Math.min(p.x,v.x),C=Math.min(p.y,v.y),M=Math.max(p.x+p.w,v.x+v.w),x=Math.max(p.y+p.h,v.y+v.h);p={x:g,y:C,w:M-g,h:x-C},s.splice(h,1)}}s.push(p)}const c=s.map(f=>`<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="#000"/>`).join(""),u=`<svg xmlns="http://www.w3.org/2000/svg" width="${t}" height="${a}"><defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${t}" height="${a}"><rect x="0" y="0" width="${t}" height="${a}" fill="#fff"/><g>${c}</g></mask></defs></svg>`,d=`url("data:image/svg+xml,${encodeURIComponent(u)}#m")`;R.style.maskImage=d,R.style.webkitMaskImage=d,R.style.maskMode="luminance",R.style.maskRepeat="no-repeat",R.style.webkitMaskRepeat="no-repeat",R.style.maskSize="100% 100%",R.style.webkitMaskSize="100% 100%"}function Zo(){requestAnimationFrame(Zo);const e=performance.now()/1e3,t=Math.max(0,Math.min(.1,e-Un));Un=e;const a=l.selectedId,o=(a?G(a):[]).filter(M=>M.enabled),i=a?Ne(a):!1,r=!!a&&i&&o.length>0,s=a?q.get(a):null;a&&s?.extras?.paused||(Xt+=t);let u=null;try{u=D.contentDocument||null}catch{u=null}let d=null;try{d=u?.querySelector("canvas")||null}catch{d=null}if(!r||!d){R.style.display!=="none"&&(R.style.display="none"),(R.style.clipPath!=="none"||R.style.maskImage)&&(R.style.clipPath="none",R.style.maskImage="none",R.style.webkitMaskImage="none",Wa=null);for(const M of tt.values())M.style.display="none";return}R.style.display!=="block"&&(R.style.display="block");const f=yl();d!==Ga&&(Ga=d,f.setSource(Qe));const p=d.width||1,h=d.height||1;(Qe.width!==p||Qe.height!==h)&&(Qe.width=p,Qe.height=h);try{_n.clearRect(0,0,p,h),_n.drawImage(d,0,0,p,h)}catch{}const v=Qa.getBoundingClientRect(),m=Math.max(1,Math.round(v.width)),g=Math.max(1,Math.round(v.height));(f.width!==m||f.height!==g)&&f.resize(m,g),wl(u,m,g);const C=[...o].reverse();f.renderFrame(C,Xt),xl(R,f.renderer.getPixelRatio())}requestAnimationFrame(Zo);Ur();Yr();ea.addEventListener("click",e=>{e.stopPropagation(),J.hidden?Zr():la()});J.addEventListener("click",e=>{const t=e.target.closest(".filter-add-option");!t||!l.selectedId||(Gr(l.selectedId,t.dataset.filterId),la())});document.addEventListener("click",e=>{const t=e.target.closest(".filter-add-wrap"),a=e.target.closest("#filterAddMenu");!J.hidden&&!t&&!a&&la()});document.addEventListener("keydown",e=>{e.key==="Escape"&&la()});_.addEventListener("click",e=>{const t=e.target.closest("[data-action]");if(!t||!l.selectedId)return;const{action:a,instanceId:n,paramKey:o}=t.dataset;if(a==="collapse")Vr(l.selectedId,n);else if(a==="remove")Wr(l.selectedId,n);else if(a==="upload-image"){const i=t.closest(".filter-param-row").querySelector(".filter-image-input");i&&i.click()}else a==="clear-image"?(L(l.selectedId),ke(l.selectedId,n,o,null),F()):a==="open-curve"?Ml(n,o,t.dataset.label,t):a==="open-gradient"&&El(n,o,t.dataset.label,t)});let Dt=null;_.addEventListener("pointerdown",e=>{const t=e.target.closest(".filter-levels-handle[data-instance-id][data-handle]");if(!t||!l.selectedId)return;const a=t.closest(".filter-levels-graph");if(!a)return;e.preventDefault(),e.stopPropagation();const n=t.dataset.instanceId,o=`levelsgraph:${n}`;ge!==o&&(L(l.selectedId),ge=o),Dt={instanceId:n,handle:t.dataset.handle,graph:a}});_.addEventListener("change",e=>{const t=e.target;if(l.selectedId)if(t.matches('[data-action="toggle"]'))jr(l.selectedId,t.dataset.instanceId);else if(t.classList.contains("filter-param-toggle"))L(l.selectedId),ke(l.selectedId,t.dataset.instanceId,t.dataset.paramKey,t.checked),F();else if(t.classList.contains("filter-param-select"))L(l.selectedId),ke(l.selectedId,t.dataset.instanceId,t.dataset.paramKey,t.value),Kr(l.selectedId,t.dataset.instanceId,t.dataset.paramKey,t.value),F();else if(t.classList.contains("filter-param-color")){const a=`color:${t.dataset.instanceId}:${t.dataset.paramKey}`;ge!==a&&L(l.selectedId),ke(l.selectedId,t.dataset.instanceId,t.dataset.paramKey,t.value),ge=null}else if(t.classList.contains("filter-image-input")){const a=t.files&&t.files[0];if(!a)return;const{instanceId:n,paramKey:o}=t.dataset,i=new FileReader;i.onload=()=>{L(l.selectedId),ke(l.selectedId,n,o,i.result),F()},i.readAsDataURL(a)}else(t.classList.contains("filter-param-range")||t.classList.contains("filter-param-number")||t.classList.contains("filter-param-color"))&&(ge=null)});let ge=null;_.addEventListener("input",e=>{const t=e.target;if(l.selectedId){if(t.classList.contains("filter-param-range")||t.classList.contains("filter-param-number")){const{instanceId:a,paramKey:n}=t.dataset,o=Number(t.value),i=`${a}:${n}`;ge!==i&&(L(l.selectedId),ge=i),ke(l.selectedId,a,n,o,!0),_.querySelectorAll(`[data-instance-id="${a}"][data-param-key="${n}"]`).forEach(r=>{r!==t&&(r.value=o)}),cn(a)}else if(t.classList.contains("filter-param-color")){const{instanceId:a,paramKey:n}=t.dataset,o=`color:${a}:${n}`;ge!==o&&(L(l.selectedId),ge=o),ke(l.selectedId,a,n,t.value,!0)}}});window.addEventListener("pointermove",e=>{if(!Dt||!l.selectedId)return;const{instanceId:t,handle:a,graph:n}=Dt,o=n.getBoundingClientRect();if(o.width<=1)return;const i=Math.max(0,Math.min(1,(e.clientX-o.left)/o.width)),r=(d,f)=>{const p=_.querySelector(`input[data-instance-id="${t}"][data-param-key="${d}"]`),h=p?Number(p.value):f;return Number.isFinite(h)?h:f};let s=r("blackPoint",0),c=r("gamma",1),u=r("whitePoint",1);if(a==="black")s=Math.max(0,Math.min(u-.001,i)),Ca(t,"blackPoint",s);else if(a==="white")u=Math.max(s+.001,Math.min(1,i)),Ca(t,"whitePoint",u);else{const d=Math.max(0,Math.min(.99,s)),f=Math.max(d+.001,Math.min(1,u)),p=Math.max(.001,Math.min(.999,(i-d)/(f-d)));c=Math.max(.2,Math.min(3,Math.log(p)/Math.log(.5))),Ca(t,"gamma",c)}cn(t)});window.addEventListener("pointerup",()=>{Dt&&(Dt=null,ge=null)});let Kt=null,He=null;_.addEventListener("dragstart",e=>{const t=e.target.closest(".filter-item");if(!t||!e.target.closest(".filter-name")){e.preventDefault();return}Kt=t.dataset.instanceId,He=t,t.classList.add("dragging"),e.dataTransfer.effectAllowed="move",e.dataTransfer.setData("text/plain",Kt);const a=t.getBoundingClientRect();e.dataTransfer.setDragImage(t,e.clientX-a.left,e.clientY-a.top)});_.addEventListener("dragover",e=>{if(!He)return;e.preventDefault(),e.dataTransfer.dropEffect="move";const t=e.target.closest(".filter-item");if(!t||t===He){t||_.appendChild(He);return}const a=t.getBoundingClientRect();e.clientY<a.top+a.height/2?t.parentNode.insertBefore(He,t):t.parentNode.insertBefore(He,t.nextSibling)});_.addEventListener("drop",e=>{if(e.preventDefault(),!l.selectedId||!Kt)return;const t=G(l.selectedId),a=[..._.querySelectorAll(".filter-item")].map(i=>i.dataset.instanceId),n=new Map(t.map(i=>[i.instanceId,i])),o=a.map(i=>n.get(i)).filter(Boolean);o.length===t.length&&(o.some((r,s)=>r!==t[s])&&L(l.selectedId),t.length=0,t.push(...o),pe()),F()});_.addEventListener("dragend",()=>{Kt=null,He=null,_.querySelectorAll(".filter-item.dragging, .filter-item.drag-over").forEach(e=>{e.classList.remove("dragging","drag-over")})});const kl={w:320,h:240};function Sl(){try{const e=S.getItem(oo),t=e?JSON.parse(e):null;if(t&&typeof t.w=="number"&&typeof t.h=="number")return t}catch{}return{...kl}}let Ae=Sl();function Cl(){S.setItem(oo,JSON.stringify(Ae))}const E=document.createElement("div");E.id="curvePopup";E.className="curve-popup";E.hidden=!0;E.innerHTML=`
  <div class="curve-popup-header">
    <span class="curve-popup-title"></span>
    <div class="curve-popup-header-actions">
      <button type="button" class="curve-popup-reset" title="Reset to default" aria-label="Reset to default">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8A5.5 5.5 0 1 1 11.6 3.9" /><path d="M13.5 3.2v3.4h-3.4" /></svg>
      </button>
      <button type="button" class="curve-popup-close" title="Close" aria-label="Close">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
      </button>
    </div>
  </div>
  <div class="curve-popup-hint">Double-click the curve to add a point &middot; drag a point to move &middot; double-click a point to toggle bezier/step &middot; click a point then drag its diamond handle like a bezier tangent &middot; right-click for options</div>
  <div class="curve-popup-body">
    <svg class="curve-popup-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
  </div>
  <div class="curve-popup-resize" title="Resize"></div>
`;document.body.appendChild(E);const ie=document.createElement("div");ie.id="curvePointMenu";ie.className="curve-point-menu";ie.hidden=!0;ie.innerHTML=`
  <button type="button" data-action="type-bezier">Bezier (smooth)</button>
  <button type="button" data-action="type-constant">Constant (step)</button>
  <button type="button" data-action="delete" class="curve-point-menu-danger">Delete point</button>
`;document.body.appendChild(ie);const P=document.createElement("div");P.id="gradientPopup";P.className="curve-popup gradient-popup";P.hidden=!0;P.innerHTML=`
  <div class="curve-popup-header">
    <span class="curve-popup-title"></span>
    <div class="curve-popup-header-actions">
      <button type="button" class="gradient-popup-reset" title="Reset to default" aria-label="Reset to default">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8A5.5 5.5 0 1 1 11.6 3.9" /><path d="M13.5 3.2v3.4h-3.4" /></svg>
      </button>
      <button type="button" class="gradient-popup-close" title="Close" aria-label="Close">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
      </button>
    </div>
  </div>
  <div class="curve-popup-hint">Click a stop to edit &middot; drag to move &middot; double-click the bar to add &middot; delete removes it (min 2 stops)</div>
  <div class="gradient-popup-body">
    <div class="gradient-popup-bar"><div class="gradient-popup-track"></div></div>
    <div class="gradient-popup-editor" hidden>
      <input type="color" class="gradient-popup-color" title="Stop color" />
      <input type="number" class="gradient-popup-pos" min="0" max="100" step="1" title="Stop position %" />
      <button type="button" class="gradient-popup-delete" title="Delete stop" aria-label="Delete stop">&times;</button>
    </div>
  </div>
`;document.body.appendChild(P);let O=null,rt=null,N=null;function hn(e){return Math.min(1,Math.max(0,e))}function vn(){return!O||!l.selectedId?null:G(l.selectedId).find(t=>t.instanceId===O.instanceId)||null}function yt(){const e=vn();return!e||!O?null:mt(e.params[O.paramKey])}function bt(e){const t=vn();!t||!O||(t.params[O.paramKey]={stops:e},pe())}function Qo(){if(P.hidden||!O||!O.trigger)return;const e=O.trigger.getBoundingClientRect(),t=P.offsetWidth||300,a=P.offsetHeight||140;let n=e.right-t,o=e.top-a-10;o<8&&(o=e.bottom+10),n=Math.min(Math.max(8,n),window.innerWidth-t-8),o=Math.min(Math.max(8,o),window.innerHeight-a-8),P.style.left=`${n}px`,P.style.top=`${o}px`}function Ee(){const e=yt(),t=P.querySelector(".gradient-popup-track"),a=P.querySelector(".gradient-popup-editor");if(!(!e||!t))if(N!==null&&(N<0||N>=e.stops.length)&&(N=null),t.style.background=Gn(e),t.innerHTML=e.stops.map((n,o)=>`<button type="button" class="gradient-popup-handle${o===N?" active":""}"
      style="left:${(n.t*100).toFixed(2)}%; background:${n.color}" data-stop-index="${o}" title="${n.color}"></button>`).join(""),N!==null){const n=e.stops[N];a.hidden=!1,a.querySelector(".gradient-popup-color").value=n.color,a.querySelector(".gradient-popup-pos").value=Math.round(n.t*100),a.querySelector(".gradient-popup-delete").disabled=e.stops.length<=2}else a.hidden=!0}function El(e,t,a,n){O={instanceId:e,paramKey:t,trigger:n},N=null,P.querySelector(".curve-popup-title").textContent=a||"Gradient",P.hidden=!1,Qo(),Ee()}function pa(){P.hidden=!0,O=null,rt=null,N=null}function Dl(){const e=vn();if(!e||!O)return;const t=Te(e.defId),a=t&&t.params.find(o=>o.key===O.paramKey);if(!a)return;const n=mt(a.default);L(l.selectedId),N=null,bt(n.stops.map(o=>({...o}))),Ee(),F()}P.querySelector(".gradient-popup-close").addEventListener("click",pa);P.querySelector(".gradient-popup-reset").addEventListener("click",Dl);P.querySelector(".gradient-popup-bar").addEventListener("pointerdown",e=>{const t=e.target.closest(".gradient-popup-handle");t&&(N=Number(t.dataset.stopIndex),rt=N,L(l.selectedId),Ee(),e.preventDefault())});P.querySelector(".gradient-popup-bar").addEventListener("dblclick",e=>{if(e.target.closest(".gradient-popup-handle"))return;const t=yt(),a=e.currentTarget;if(!t)return;const n=a.getBoundingClientRect(),o=hn((e.clientX-n.left)/n.width),i=si(t,o),r=t.stops.map(c=>({...c})),s={t:o,color:i};r.push(s),r.sort((c,u)=>c.t-u.t),N=r.indexOf(s),L(l.selectedId),bt(r),Ee(),F()});document.addEventListener("pointermove",e=>{if(rt===null)return;const t=P.querySelector(".gradient-popup-bar"),a=yt();if(!t||!a)return;const n=t.getBoundingClientRect(),o=hn((e.clientX-n.left)/n.width),i=a.stops.map(s=>({...s})),r=i[rt];r&&(r.t=o,i.sort((s,c)=>s.t-c.t),N=i.indexOf(r),rt=N,bt(i),Ee(),F())});document.addEventListener("pointerup",()=>{rt=null});P.querySelector(".gradient-popup-color").addEventListener("input",e=>{const t=yt();if(!t||N===null)return;const a=t.stops.map(n=>({...n}));a[N].color=e.target.value,bt(a),Ee(),F()});P.querySelector(".gradient-popup-color").addEventListener("change",()=>{L(l.selectedId)});P.querySelector(".gradient-popup-pos").addEventListener("change",e=>{const t=yt();if(!t||N===null)return;const a=t.stops.map(o=>({...o})),n=a[N];L(l.selectedId),n.t=hn(Number(e.target.value)/100),a.sort((o,i)=>o.t-i.t),N=a.indexOf(n),bt(a),Ee(),F()});P.querySelector(".gradient-popup-delete").addEventListener("click",()=>{const e=yt();if(!e||N===null||e.stops.length<=2)return;const t=e.stops.filter((a,n)=>n!==N);L(l.selectedId),N=null,bt(t),Ee(),F()});let z=null,dt=null,ft=null,Ie=null,lt=null,W=null;function gn(){return!z||!l.selectedId?null:G(l.selectedId).find(t=>t.instanceId===z.instanceId)||null}function Ve(){const e=gn();return e?It(e.params[z.paramKey]):null}function pt(e){const t=gn();!t||!z||(t.params[z.paramKey]={points:e},pe())}function Ml(e,t,a,n){z={instanceId:e,paramKey:t,trigger:n},W=null,E.querySelector(".curve-popup-title").textContent=a||"Curve",E.style.width=`${Ae.w}px`,E.style.height=`${Ae.h}px`,E.hidden=!1,yn(),de()}function ma(){E.hidden=!0,z=null,dt=null,ft=null,W=null,Mt()}function Il(){const e=gn();if(!e||!z)return;const t=Te(e.defId),a=t&&t.params.find(i=>i.key===z.paramKey);if(!a)return;const o=It(a.default).points.map(i=>({...i}));W=null,L(l.selectedId),pt(o),de(),F()}function yn(){if(E.hidden||!z||!z.trigger)return;const e=z.trigger.getBoundingClientRect(),t=E.offsetWidth||Ae.w,a=E.offsetHeight||Ae.h;let n=e.right-t,o=e.top-a-10;o<8&&(o=e.bottom+10),n=Math.min(Math.max(8,n),window.innerWidth-t-8),o=Math.min(Math.max(8,o),window.innerHeight-a-8),E.style.left=`${n}px`,E.style.top=`${o}px`}function de(){const e=Ve(),t=E.querySelector(".curve-popup-svg");if(!e||!t)return;const a=t.getBoundingClientRect(),n=Math.max(1,Math.round(a.width)||100),o=Math.max(1,Math.round(a.height)||100);t.setAttribute("viewBox",`0 0 ${n} ${o}`),W!==null&&(W<0||W>=e.points.length-1)&&(W=null);const i=$o(e,n,o,48);let r="";for(let p=1;p<4;p++){const h=p/4*n,v=p/4*o;r+=`<line class="curve-grid-line" x1="0" y1="${v.toFixed(2)}" x2="${n}" y2="${v.toFixed(2)}" />`,r+=`<line class="curve-grid-line" x1="${h.toFixed(2)}" y1="0" x2="${h.toFixed(2)}" y2="${o}" />`}const s=Math.min(n,o),c=Math.max(4.5,s*.03),u=Math.max(9,s*.05);let d="";for(let p=0;p<e.points.length-1;p++){const h=e.points[p];if(h.type==="constant"||p!==W)continue;const v=e.points[p+1],m=h.x*n,g=(1-h.y)*o,C=Math.max(v.x-h.x,1e-5),M=h.tanSet?h.tanDx:C/3,x=h.tanSet?h.tanDy:0;let V=M*n,le=-x*o;const Q=Math.hypot(V,le),se=Math.max(u*1.1,12);if(!h.tanSet)if(Q>1e-4&&Q<se){const I=se/Q;V*=I,le*=I}else Q<=1e-4&&(V=se,le=0);const xt=m+V,Je=g+le,b=m-V,A=g-le;d+=`<line class="curve-handle-line" x1="${xt.toFixed(2)}" y1="${Je.toFixed(2)}" x2="${b.toFixed(2)}" y2="${A.toFixed(2)}" />`;const $=u/2,k=(I,Y)=>`M ${I.toFixed(2)} ${(Y-$).toFixed(2)} L ${(I+$).toFixed(2)} ${Y.toFixed(2)} L ${I.toFixed(2)} ${(Y+$).toFixed(2)} L ${(I-$).toFixed(2)} ${Y.toFixed(2)} Z`;d+=`<path class="curve-handle-point" data-handle-index="${p}" d="${k(xt,Je)}" />`,d+=`<path class="curve-handle-point" data-handle-index="${p}" d="${k(b,A)}" />`}const f=e.points.map((p,h)=>{const v=h===0||h===e.points.length-1,m=h===W,g=["curve-point",v?"curve-point--endpoint":"",p.type==="constant"?"curve-point--constant":"",m?"curve-point--active":""].filter(Boolean).join(" "),C=p.x*n,M=(1-p.y)*o;if(m){const x=c*1.7;return`<rect class="${g}" data-point-index="${h}" x="${(C-x/2).toFixed(2)}" y="${(M-x/2).toFixed(2)}" width="${x.toFixed(2)}" height="${x.toFixed(2)}" />`}return`<circle class="${g}" data-point-index="${h}" cx="${C.toFixed(2)}" cy="${M.toFixed(2)}" r="${c.toFixed(2)}" />`}).join("");t.innerHTML=`${r}${d}<path class="curve-popup-path" d="${i}" />${f}`}E.querySelector(".curve-popup-close").addEventListener("click",ma);E.querySelector(".curve-popup-reset").addEventListener("click",Il);E.querySelector(".curve-popup-svg").addEventListener("pointerdown",e=>{const t=e.currentTarget,a=e.target.closest(".curve-handle-point"),n=e.target.closest(".curve-point"),o=Ve();if(o){if(a){const i=Number(a.dataset.handleIndex);L(l.selectedId),ft={index:i},W=i,t.setPointerCapture(e.pointerId),e.stopPropagation();return}if(n){const i=Number(n.dataset.pointIndex);L(l.selectedId),dt={index:i},i<o.points.length-1&&o.points[i].type!=="constant"?W=i:W=null,t.setPointerCapture(e.pointerId),e.stopPropagation(),de();return}W!==null&&(W=null,de())}});E.querySelector(".curve-popup-svg").addEventListener("dblclick",e=>{const t=e.target.closest(".curve-point"),a=Ve();if(!a)return;if(e.preventDefault(),t){const u=Number(t.dataset.pointIndex),d=a.points.map(f=>({...f}));d[u].type=d[u].type==="constant"?"bezier":"constant",L(l.selectedId),pt(d),de(),F();return}if(e.target.closest(".curve-handle-point"))return;const o=E.querySelector(".curve-popup-svg").getBoundingClientRect(),i=Math.min(1,Math.max(0,(e.clientX-o.left)/o.width)),r=Math.min(1,Math.max(0,1-(e.clientY-o.top)/o.height)),s=a.points.map(u=>({...u}));s.push({x:i,y:r,type:"bezier",tanDx:0,tanDy:0,tanSet:!1}),s.sort((u,d)=>u.x-d.x),L(l.selectedId),pt(s);const c=s.findIndex(u=>u.x===i&&u.y===r);W=c<s.length-1?c:null,de(),F()});E.querySelector(".curve-popup-svg").addEventListener("contextmenu",e=>{const t=e.target.closest(".curve-point");if(!t)return;e.preventDefault(),lt=Number(t.dataset.pointIndex);const a=Ve(),n=a&&(lt===0||lt===a.points.length-1);ie.querySelector('[data-action="delete"]').disabled=!!n,ie.style.left=`${e.clientX}px`,ie.style.top=`${e.clientY}px`,ie.hidden=!1});function Mt(){ie.hidden=!0,lt=null}ie.addEventListener("click",e=>{const t=e.target.closest("button[data-action]");if(!t||t.disabled||lt===null){Mt();return}const a=Ve();if(a){const n=a.points.map(r=>({...r})),o=lt,i=o===0||o===n.length-1;t.dataset.action==="type-bezier"?n[o].type="bezier":t.dataset.action==="type-constant"?n[o].type="constant":t.dataset.action==="delete"&&!i&&n.length>2&&n.splice(o,1),L(l.selectedId),pt(n),de(),F()}Mt()});E.querySelector(".curve-popup-resize").addEventListener("pointerdown",e=>{Ie={startX:e.clientX,startY:e.clientY,startW:Ae.w,startH:Ae.h},e.target.setPointerCapture(e.pointerId),e.preventDefault()});document.addEventListener("pointermove",e=>{if(dt){const t=Ve(),a=E.querySelector(".curve-popup-svg");if(!t||!a)return;const n=a.getBoundingClientRect(),o=t.points.map(u=>({...u})),i=dt.index,r=i===0||i===o.length-1,s=Math.min(1,Math.max(0,1-(e.clientY-n.top)/n.height));let c=o[i].x;if(!r){const u=o[i-1].x+.001,d=o[i+1].x-.001;c=Math.min(d,Math.max(u,(e.clientX-n.left)/n.width))}o[i]={...o[i],x:c,y:s},pt(o),de(),F()}else if(ft){const t=Ve(),a=E.querySelector(".curve-popup-svg");if(!t||!a)return;const n=a.getBoundingClientRect(),o=t.points.map(x=>({...x})),i=ft.index,r=o[i],s=o[i+1];if(!r||!s)return;const c=n.width,u=n.height,d=r.x*c,f=(1-r.y)*u,p=e.clientX-n.left,h=e.clientY-n.top;let v=(p-d)/c,m=-(h-f)/u;const C=Math.max(.001,Math.hypot(s.x-r.x,s.y-r.y))*1.5,M=Math.hypot(v,m);if(M>C){const x=C/M;v*=x,m*=x}o[i]={...r,tanDx:v,tanDy:m,tanSet:!0},pt(o),de(),F()}else if(Ie){const t=Math.max(240,Math.min(720,Ie.startW+(e.clientX-Ie.startX))),a=Math.max(160,Math.min(560,Ie.startH+(e.clientY-Ie.startY)));Ae={w:t,h:a},E.style.width=`${t}px`,E.style.height=`${a}px`,de()}});document.addEventListener("pointerup",()=>{dt&&(dt=null),ft&&(ft=null),Ie&&(Ie=null,Cl())});document.addEventListener("click",e=>{!E.hidden&&!e.target.closest("#curvePopup")&&!e.target.closest('[data-action="open-curve"]')&&!e.target.closest("#curvePointMenu")&&ma(),!ie.hidden&&!e.target.closest("#curvePointMenu")&&Mt(),!P.hidden&&!e.target.closest("#gradientPopup")&&!e.target.closest('[data-action="open-gradient"]')&&pa()});document.addEventListener("keydown",e=>{e.key==="Escape"&&(ma(),Mt(),pa())});document.addEventListener("keydown",e=>{const t=e.key.toLowerCase();if(!(e.ctrlKey||e.metaKey)||t!=="z"||!l.selectedId)return;const a=e.target;a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA")&&a.type==="text"||(e.preventDefault(),e.shiftKey?qr(l.selectedId):Hr(l.selectedId))});window.addEventListener("resize",yn);Ht.addEventListener("change",()=>{l.selectedId&&(l.filterPreviewOn[l.selectedId]=Ht.checked,pe(),F())});function ei(){return!ve||!l.selectedId||R.style.display==="none"||!Ne(l.selectedId)?!1:G(l.selectedId).some(e=>e.enabled)}function bn(e){if(ei()){const c=[...G(l.selectedId).filter(u=>u.enabled)].reverse();return ve.captureAtScale(c,Xt,e)}const t=D.contentDocument,a=t?t.querySelector("canvas"):null;if(!a||!a.width||!a.height)return null;const n=Math.round(a.width*e),o=Math.round(a.height*e),i=document.createElement("canvas");return i.width=n,i.height=o,i.getContext("2d").drawImage(a,0,0,n,o),{dataUrl:i.toDataURL("image/png"),width:n,height:o}}function Bl(e,t){const a=URL.createObjectURL(e),n=document.createElement("a");n.href=a,n.download=t,n.click(),setTimeout(()=>URL.revokeObjectURL(a),1e3)}function ti(e,t){const a=kr(e),n=Ir(t.dataUrl);if(!n)return console.warn("Failed to read exported PNG data for metadata embedding."),null;let o;try{const i=Pr(n,io,JSON.stringify(a));o=new Blob([i],{type:"image/png"})}catch(i){console.warn("Failed to embed state metadata into PNG export; downloading raw image.",i),o=new Blob([n],{type:"image/png"})}return o}function Pl(e,t,a){const n=ti(e,t);return n?(Bl(n,a),!0):!1}function Yt(e,t,a,n){const o=Number(e);return Number.isFinite(o)?Math.min(a,Math.max(t,o)):n}function ai(e){return new Promise(t=>setTimeout(t,e))}async function Ll(){if(typeof window.showDirectoryPicker!="function")throw new Error("Directory picker is not supported in this runtime.");return window.showDirectoryPicker({mode:"readwrite"})}async function Al(e,t,a){const o=await(await e.getFileHandle(t,{create:!0})).createWritable();await o.write(a),await o.close()}async function Tl(e=140){await new Promise(t=>requestAnimationFrame(()=>requestAnimationFrame(t))),e>0&&await ai(e)}let st=!1;const ha=new Map;function ne(e,t="neutral"){In.textContent=e||"",In.dataset.tone=t}function zn(e){const t=Math.floor(Yt(e,1,200,1));K.value=String(t)}function Hn(e){const t=Yt(e,.1,4,1);qe.value=String(Number(t.toFixed(1)))}function va(e){const t=e?ha.get(e):null;Bn.textContent=t?t.name:"Not set",Bn.title=t?t.name:"No folder selected",tn.disabled=!t}function Rl(){const e=Number(K.value);K.dataset.prevValue=String(Number.isFinite(e)?e:8),K.addEventListener("input",()=>{const t=Number(K.dataset.prevValue||"8"),a=Number(K.value);if(!Number.isFinite(a))return;let n=a;Number.isFinite(t)&&Math.abs(a-(t+1))<1e-9?n=t*2:Number.isFinite(t)&&Math.abs(a-(t-1))<1e-9&&(n=t/2),zn(n),K.dataset.prevValue=K.value}),K.addEventListener("change",()=>{zn(Number(K.value||8)),K.dataset.prevValue=K.value}),qe.addEventListener("input",()=>{Hn(Number(qe.value||1))}),qe.addEventListener("change",()=>{Hn(Number(qe.value||1))})}ro.addEventListener("click",()=>{l.selectedId&&Nl()});me.addEventListener("click",async()=>{if(!l.selectedId||me.disabled)return;const e=bn(1);if(e)try{const t=await(await fetch(e.dataUrl)).blob();await navigator.clipboard.write([new ClipboardItem({"image/png":t})]),Fl()}catch(t){console.warn("[filter] copy to clipboard failed:",t)}});function Fl(){const e=me.dataset.baseTitle||me.title;me.dataset.baseTitle=e,me.classList.add("copied"),me.title="Copied!",setTimeout(()=>{me.classList.remove("copied"),me.title=e},1200)}function Nl(){let e,t;if(ei())e=ve.width,t=ve.height;else{const a=D.contentDocument,n=a?a.querySelector("canvas"):null;e=n?n.width:R.width,t=n?n.height:R.height}qi.textContent=`${Math.round(e)} × ${Math.round(t)} px`,ne(""),Rt.disabled=!1,va(l.selectedId),qt.hidden=!1}function Jt(){st||(qt.hidden=!0)}Ua.addEventListener("click",e=>{const t=e.target.closest(".export-size-option");if(!t||!l.selectedId)return;const a=Number(t.dataset.scale)||1,n=l.selectedId,o=bn(a);if(!o){Jt();return}const i=Lo(n);Pl(n,o,i),Jt()});Rt.addEventListener("click",async()=>{if(!l.selectedId||st)return;const e=l.selectedId,t=Math.floor(Yt(K.value,1,200,1)),a=Yt(qe.value,.1,4,1),n=Wi.value==="seed"?"seed":"all-random";K.value=String(t),qe.value=String(Number(a.toFixed(2)));const o=ha.get(e);if(!o){ne("Please set Batch Path first.","warn");return}st=!0,Rt.disabled=!0,_a.disabled=!0,tn.disabled=!0,Ua.querySelectorAll(".export-size-option").forEach(s=>{s.disabled=!0}),ne(`Preparing batch export (${t})â€¦`);let i=0,r=0;try{for(let s=0;s<t;s++){if(l.selectedId!==e){ne("Batch stopped: selected effect changed.","warn");break}ne(`Rendering ${s+1}/${t}â€¦`),n==="all-random"?na(e):Fe(e,"rerollSeed"),await rr(e,1800),await Tl();const c=bn(a);if(!c){r+=1;continue}const u=`batch-${String(s+1).padStart(3,"0")}`,d=Lo(e,u),f=ti(e,c);if(!f)r+=1;else try{await Al(o,d,f),i+=1}catch(p){console.warn("Batch export write failed:",p),r+=1}await ai(60)}}finally{st=!1,Rt.disabled=!1,_a.disabled=!1,va(l.selectedId),Ua.querySelectorAll(".export-size-option").forEach(c=>{c.disabled=!1});const s=r>0?"warn":"ok";ne(`Done: ${i} exported${r?`, ${r} failed`:""}.`,s)}});_a.addEventListener("click",async()=>{const e=l.selectedId;if(!(!e||st)){ne("Selecting folderâ€¦");try{const t=await Ll();ha.set(e,t),va(e),ne("Batch path set.","ok")}catch(t){console.warn("Batch export folder selection failed:",t);const a=t&&typeof t=="object"&&"name"in t?String(t.name):"";if(a==="AbortError"){ne("Folder selection cancelled.","warn");return}if(a==="NotAllowedError"||a==="SecurityError"){ne("Folder access was blocked. Please allow folder access and try again.","warn");return}const n=t instanceof Error&&t.message?t.message:"Unknown error";ne(`Failed to set folder: ${n}`,"warn")}}});tn.addEventListener("click",()=>{const e=l.selectedId;!e||st||(ha.delete(e),va(e),ne("Batch path cleared."))});Rl();Gi.addEventListener("click",Jt);qt.addEventListener("click",e=>{e.target===qt&&Jt()});Qa.addEventListener("dragover",e=>{(e.dataTransfer?.types?Array.from(e.dataTransfer.types):[]).includes("Files")&&(e.preventDefault(),e.dataTransfer.dropEffect="copy")});Qa.addEventListener("drop",async e=>{if(!e.dataTransfer?.files?.length)return;e.preventDefault();const t=[...e.dataTransfer.files].find(a=>/image\/png/i.test(a.type)||/\.png$/i.test(a.name));if(t)try{await Rr(t)||console.info("Dropped PNG has no embedded ShaderOps state metadata.")}catch(a){console.warn("Failed to restore ShaderOps state from dropped PNG:",a)}});Fi.addEventListener("click",()=>{en.classList.add("collapsed"),S.setItem(Ya,"1")});Ri.addEventListener("click",()=>{en.classList.remove("collapsed"),S.setItem(Ya,"0")});Fr();Nr();zr();vl().catch(e=>{La.textContent="Registry load failed",Aa.textContent=e.message});
