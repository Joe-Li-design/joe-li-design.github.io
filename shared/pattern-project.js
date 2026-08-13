import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

function safe(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function getLooseBounds(cfg) {
  const span = Math.max(0.001, Number(cfg.max) - Number(cfg.min));
  return [Number(cfg.min) - span * 4, Number(cfg.max) + span * 4];
}

export function createPatternProject({
  defaultProjectId,
  title,
  seed: initialSeed = 1234567,
  preset,
  schema,
  fragmentShader,
  vertexShader,
  buildUniforms,
  applyUniforms,
}) {
  const projectParam = new URLSearchParams(location.search).get("project");
  const projectId = projectParam || defaultProjectId;
  const params = {};
  schema.forEach((cfg) => {
    params[cfg.id] = preset[cfg.id];
  });

  let paused = false;
  let elapsed = 0;
  let lastTs = performance.now() * 0.001;
  let pendingPreview = true;
  let previewCooldown = 0;
  let seed = initialSeed;
  let shaderErrorThisFrame = false;

  const history = { undoStack: [], redoStack: [], limit: 120, suppress: false };

  const app = document.getElementById("app");
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.debug.onShaderError = (gl, program, glVertexShader, glFragmentShader) => {
    shaderErrorThisFrame = true;
    const vInfo = gl.getShaderInfoLog(glVertexShader) || "(no vertex shader log)";
    const fInfo = gl.getShaderInfoLog(glFragmentShader) || "(no fragment shader log)";
    const pInfo = gl.getProgramInfoLog(program) || "(no program log)";
    showRuntimeError(
      [
        `[${projectId}] Shader compile/link failed`,
        "",
        "Program:",
        pInfo,
        "",
        "Vertex shader log:",
        vInfo,
        "",
        "Fragment shader log:",
        fInfo,
      ].join("\n")
    );
  };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  app.prepend(renderer.domElement);

  const errorOverlay = document.createElement("pre");
  errorOverlay.style.cssText = [
    "position:fixed",
    "left:12px",
    "top:12px",
    "max-width:min(900px,calc(100vw - 24px))",
    "max-height:calc(100vh - 24px)",
    "overflow:auto",
    "padding:10px 12px",
    "margin:0",
    "border-radius:10px",
    "background:rgba(0,0,0,0.84)",
    "color:#ff8f8f",
    "font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
    "white-space:pre-wrap",
    "z-index:9999",
    "display:none",
    "pointer-events:none",
  ].join(";");
  app.appendChild(errorOverlay);

  function showRuntimeError(message) {
    errorOverlay.textContent = message;
    errorOverlay.style.display = "block";
    console.error(message);
  }

  function hideRuntimeError() {
    if (errorOverlay.style.display === "none") return;
    errorOverlay.style.display = "none";
    errorOverlay.textContent = "";
  }

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = typeof buildUniforms === "function"
    ? buildUniforms({ THREE, params, seed, schema, preset })
    : {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        u_seed: { value: seed },
      };

  if (typeof buildUniforms !== "function") {
    schema.forEach((cfg) => {
      if (cfg.uniform === false) return;
      uniforms[`u_${cfg.id}`] = { value: params[cfg.id] };
    });
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertexShader || `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader,
  });

  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  function compileProbe() {
    const gl = renderer.getContext();
    const ensurePrecision = (source) => {
      if (/\bprecision\s+(lowp|mediump|highp)\s+float\s*;/.test(source)) return source;
      return `precision highp float;\n${source}`;
    };
    const ensureVertexInputs = (source) => {
      let next = source;
      if (!/\battribute\s+vec3\s+position\b/.test(next) && !/\bin\s+vec3\s+position\b/.test(next)) {
        next = `attribute vec3 position;\n${next}`;
      }
      if (!/\battribute\s+vec2\s+uv\b/.test(next) && !/\bin\s+vec2\s+uv\b/.test(next)) {
        next = `attribute vec2 uv;\n${next}`;
      }
      return next;
    };
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) return { ok: false, log: "createShader returned null", shader: null };
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      const ok = !!gl.getShaderParameter(shader, gl.COMPILE_STATUS);
      const log = gl.getShaderInfoLog(shader) || "";
      return { ok, log, shader };
    };
    const vsSource = ensurePrecision(ensureVertexInputs(material.vertexShader));
    const fsSource = ensurePrecision(material.fragmentShader);
    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);
    if (!vs.ok || !fs.ok) {
      if (vs.shader) gl.deleteShader(vs.shader);
      if (fs.shader) gl.deleteShader(fs.shader);
      showRuntimeError(
        [
          `[${projectId}] Shader preflight compile failed`,
          "",
          "Vertex shader:",
          vs.log || "(ok)",
          "",
          "Fragment shader:",
          fs.log || "(ok)",
        ].join("\n")
      );
      return false;
    }
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs.shader);
      gl.deleteShader(fs.shader);
      showRuntimeError(`[${projectId}] Shader preflight link failed\n\ncreateProgram returned null`);
      return false;
    }
    gl.attachShader(program, vs.shader);
    gl.attachShader(program, fs.shader);
    gl.linkProgram(program);
    const linked = !!gl.getProgramParameter(program, gl.LINK_STATUS);
    const programLog = gl.getProgramInfoLog(program) || "";
    gl.deleteProgram(program);
    gl.deleteShader(vs.shader);
    gl.deleteShader(fs.shader);
    if (!linked) {
      showRuntimeError(
        [
          `[${projectId}] Shader preflight link failed`,
          "",
          "Program log:",
          programLog || "(empty)",
        ].join("\n")
      );
      return false;
    }
    return true;
  }

  function applyParamsToUniforms() {
    schema.forEach((cfg) => {
      const [min, max] = getLooseBounds(cfg);
      params[cfg.id] = safe(params[cfg.id], preset[cfg.id], min, max);
    });
    if (typeof applyUniforms === "function") {
      applyUniforms({ THREE, uniforms, params, seed, schema, preset });
      return;
    }
    schema.forEach((cfg) => {
      if (cfg.uniform === false) return;
      const uniform = uniforms[`u_${cfg.id}`];
      if (uniform) uniform.value = params[cfg.id];
    });
    if (uniforms.u_seed) uniforms.u_seed.value = seed;
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

  function syncExtras(bridge) {
    bridge.extras.seed = seed;
    bridge.extras.paused = paused;
  }

  function applyParamsFromBridge(nextParams, recordHistory) {
    if (recordHistory) pushHistorySnapshot();
    Object.keys(nextParams).forEach((id) => {
      if (params[id] === undefined) return;
      params[id] = nextParams[id];
    });
    applyParamsToUniforms();
    pendingPreview = true;
  }

  function applySnapshot(snapshot, bridge) {
    try {
      const state = JSON.parse(snapshot);
      if (!state || typeof state !== "object") return;
      history.suppress = true;
      if (state.params && typeof state.params === "object") applyParamsFromBridge(state.params, false);
      if (typeof state.seed === "number" && Number.isFinite(state.seed)) seed = Math.max(1, Math.floor(state.seed));
      if (typeof state.paused === "boolean") paused = state.paused;
      applyParamsToUniforms();
      pendingPreview = true;
      syncExtras(bridge);
      bridge.notifyValuesChanged();
    } finally {
      history.suppress = false;
    }
  }

  function undoHistory(bridge) {
    if (history.undoStack.length === 0) return;
    const current = snapshotState();
    const prev = history.undoStack.pop();
    history.redoStack.push(current);
    applySnapshot(prev, bridge);
  }

  function redoHistory(bridge) {
    if (history.redoStack.length === 0) return;
    const current = snapshotState();
    const next = history.redoStack.pop();
    history.undoStack.push(current);
    applySnapshot(next, bridge);
  }

  function randomizeAllControls(bridge) {
    pushHistorySnapshot();
    schema.forEach((cfg) => {
      const raw = cfg.min + Math.random() * (cfg.max - cfg.min);
      const quantized = Math.round(raw / cfg.step) * cfg.step;
      params[cfg.id] = Number(quantized.toFixed(6));
    });
    seed = Math.floor(Math.random() * 2147483646) + 1;
    applyParamsToUniforms();
    pendingPreview = true;
    syncExtras(bridge);
    bridge.notifyValuesChanged();
  }

  function rerollSeed(bridge) {
    pushHistorySnapshot();
    seed = Math.floor(Math.random() * 2147483646) + 1;
    applyParamsToUniforms();
    pendingPreview = true;
    syncExtras(bridge);
    bridge.notifyValuesChanged();
  }

  function togglePause(bridge) {
    pushHistorySnapshot();
    paused = !paused;
    syncExtras(bridge);
    bridge.notifyValuesChanged();
  }

  function renderFrame() {
    uniforms.u_time.value = elapsed;
    shaderErrorThisFrame = false;
    try {
      renderer.render(scene, camera);
      if (!shaderErrorThisFrame) hideRuntimeError();
    } catch (error) {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      showRuntimeError(`[${projectId}] Render runtime error\n\n${message}`);
    }
  }

  function sendPreview() {
    renderFrame();
    const image = renderer.domElement.toDataURL("image/jpeg", 0.8);
    window.parent.postMessage({ type: "shaderops/preview", projectId, image }, "*");
  }

  const bridgeStub = {
    extras: { seed, paused },
    notifyValuesChanged: () => {},
  };
  history.suppress = true;
  let bridge = bridgeStub;
  try {
    bridge = window.ShaderOpsControls.init({
    projectId,
    schema,
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
        applyParamsToUniforms();
        pendingPreview = true;
      }
      if (typeof nextExtras.paused === "boolean" && nextExtras.paused !== paused) {
        pushHistorySnapshot();
        paused = nextExtras.paused;
      }
    },
    actions: {
      randomizeAll: () => randomizeAllControls(bridge),
      rerollSeed: () => rerollSeed(bridge),
      togglePause: () => togglePause(bridge),
      undo: () => undoHistory(bridge),
      redo: () => redoHistory(bridge),
    },
    });
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    showRuntimeError(`[${projectId}] Controls init error\n\n${message}`);
    bridge = bridgeStub;
  }

  if (typeof bridge.extras.seed === "number" && Number.isFinite(bridge.extras.seed)) {
    seed = Math.max(1, Math.floor(bridge.extras.seed));
  }
  if (typeof bridge.extras.paused === "boolean") paused = bridge.extras.paused;
  history.suppress = false;

  document.title = title;
  applyParamsToUniforms();
  syncExtras(bridge);
  compileProbe();

  window.addEventListener("resize", () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
    pendingPreview = true;
  });

  window.addEventListener("keydown", (event) => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    if (event.shiftKey) redoHistory(bridge);
    else undoHistory(bridge);
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
    if (!paused) elapsed += dt * params.speed;
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
}
