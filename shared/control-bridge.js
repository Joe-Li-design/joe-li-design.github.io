// ShaderOps control bridge (v2 architecture).
//
// Projects that adopt this bridge no longer render their own visible control
// panel inside their iframe document. Instead they declare a parameter
// schema + live values object, and the manager (top-level app) renders ONE
// unified control panel and talks to this bridge purely via postMessage.
// This removes every cross-document DOM read/write the manager used to need
// (CSS/pill-widget injection, per-frame underlay-canvas injection, panel
// rect polling for mask punching) — the root cause of the nav-grid-panel /
// filter-apply coupling bugs.
//
// Usage (inside a project's app.js):
//   const bridge = window.ShaderOpsControls.init({
//     schema: [{ id, label, group, min, max, step, default }, ...],
//     params: paramsObject,          // mutated in place as values change
//     extras: { seed, paused },      // any non-schema state to persist/sync
//     onParams(changedIds, params, commit) {}, // called after params mutate (manager or local).
//                                               // commit=false means "live drag, don't record undo history yet";
//                                               // commit=true means "record this as one undo step".
//     onExtras(extras) {},               // called after extras mutate
//     actions: { randomizeAll(), rerollSeed(), undo(), redo(), togglePause() },
//   });
//   // after any local bulk change (randomize/undo/redo/load), call:
//   bridge.notifyValuesChanged();
(function () {
  const PROJECT_ID = (() => {
    const p = new URLSearchParams(location.search).get("project");
    return p || document.title || "project";
  })();
  const ACTIVE_PROFILE_KEY = "shaderops:active-profile:v1";
  const PROFILE_KEY_PREFIX = "shaderops:profile:";

  function activeProfileId() {
    const id = localStorage.getItem(ACTIVE_PROFILE_KEY);
    return typeof id === "string" && id ? id : "default";
  }

  function scopedStorageKey(baseKey) {
    return `${PROFILE_KEY_PREFIX}${activeProfileId()}:${baseKey}`;
  }

  // Reads the per-profile entry first, then makes a non-destructive copy of a
  // legacy setting on the first profile-enabled launch. Unknown saved fields
  // are retained in the stored object; only schema-recognised fields are used.
  function loadPersistedState(baseKey) {
    const scopedKey = scopedStorageKey(baseKey);
    const scoped = localStorage.getItem(scopedKey);
    if (scoped !== null) return safeParse(scoped, null);
    const legacy = localStorage.getItem(baseKey);
    if (legacy !== null) localStorage.setItem(scopedKey, legacy);
    return safeParse(legacy, null);
  }

  function safeParse(json, fallback) {
    try {
      const v = JSON.parse(json);
      return v && typeof v === "object" ? v : fallback;
    } catch {
      return fallback;
    }
  }

  const bridge = {
    projectId: PROJECT_ID,
    schema: [],
    params: {},
    extras: {},
    actions: {},
    storageKey: `shaderops:settings:${PROJECT_ID}`,
    _onParams: null,
    _onExtras: null,
    _cameraBinding: null,

    init(config) {
      this.schema = config.schema || [];
      this.params = config.params || {};
      this.extras = config.extras || {};
      this.actions = config.actions || {};
      this._onParams = typeof config.onParams === "function" ? config.onParams : null;
      this._onExtras = typeof config.onExtras === "function" ? config.onExtras : null;

      // Load the current profile's copy, with a one-way, non-destructive
      // fallback to the existing legacy key for upgrade compatibility.
      const saved = loadPersistedState(this.storageKey);
      if (saved) {
        if (saved.params && typeof saved.params === "object") {
          this.schema.forEach((cfg) => {
            if (saved.params[cfg.id] !== undefined) this.params[cfg.id] = saved.params[cfg.id];
          });
        }
        const { params, ...rest } = saved;
        Object.assign(this.extras, rest);
      }
      if (this._onParams) this._onParams(Object.keys(this.params), this.params, true);
      if (this._onExtras) this._onExtras(this.extras);

      window.addEventListener("message", (event) => this._onMessage(event));
      // Keydown events that fire while the shader canvas (inside this
      // iframe) has focus never bubble to the parent document, so a
      // top-level `document.addEventListener("keydown", ...)` in the
      // manager silently stops receiving Space/R once the user has
      // interacted with the view. Forward the relevant keys through the
      // bridge instead so shortcuts keep working regardless of focus.
      window.addEventListener("keydown", (event) => {
        if (event.target && event.target.matches && event.target.matches("input, textarea, select, button")) return;
        if ((event.key === "r" || event.key === "R") && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          window.parent.postMessage({ type: "shaderops/keydown", projectId: this.projectId, key: "r" }, "*");
        } else if (event.code === "Space") {
          event.preventDefault();
          window.parent.postMessage({ type: "shaderops/keydown", projectId: this.projectId, key: "space" }, "*");
        }
      });
      this._sendReady();
      return this;
    },

    _sendReady() {
      window.parent.postMessage(
        {
          type: "shaderops/ready",
          projectId: this.projectId,
          schema: this.schema,
          values: this.params,
          extras: this.extras,
        },
        "*"
      );
    },

    _onMessage(event) {
      const data = event.data;
      if (!data || data.projectId !== this.projectId) return;
      if (data.type === "shaderops/request-schema") {
        this._sendReady();
      } else if (data.type === "shaderops/set-param") {
        this.setParam(data.id, data.value, data.commit !== false);
      } else if (data.type === "shaderops/set-state") {
        this.setState(data.payload || {}, data.commit !== false);
      } else if (data.type === "shaderops/action") {
        const fn = this.actions[data.action];
        if (typeof fn === "function") fn(data.payload);
      }
    },

    // prevValues: a shallow snapshot of the params object as it was
    // immediately BEFORE this mutation, so the project can build an
    // accurate "before" undo entry even though `this.params` itself is
    // already mutated by the time onParams runs.
    setParam(id, value, commit = true) {
      const prevValues = { ...this.params };
      this.params[id] = value;
      if (this._onParams) this._onParams([id], this.params, commit, prevValues);
      if (commit) this.persist();
    },

    setExtras(patch) {
      Object.assign(this.extras, patch);
      if (patch && typeof patch === "object" && "cam" in patch) this._applyCameraFromExtras();
      if (this._onExtras) this._onExtras(this.extras);
      this.persist();
    },

    setState(payload, commit = true) {
      const prevValues = { ...this.params };
      const changedIds = [];
      if (payload && payload.params && typeof payload.params === "object") {
        this.schema.forEach((cfg) => {
          if (payload.params[cfg.id] !== undefined) {
            this.params[cfg.id] = payload.params[cfg.id];
            changedIds.push(cfg.id);
          }
        });
      }
      if (payload && payload.extras && typeof payload.extras === "object") {
        Object.assign(this.extras, payload.extras);
        if ("cam" in payload.extras) this._applyCameraFromExtras();
      }
      if (changedIds.length && this._onParams) this._onParams(changedIds, this.params, commit, prevValues);
      if (payload && payload.extras && this._onExtras) this._onExtras(this.extras);
      if (commit) this.persist();
    },

    persist() {
      localStorage.setItem(scopedStorageKey(this.storageKey), JSON.stringify({ params: this.params, ...this.extras }));
    },

    _applyCameraFromExtras() {
      if (!this._cameraBinding) return;
      const { camera, controls } = this._cameraBinding;
      const saved = this.extras && this.extras.cam;
      if (!saved || typeof saved !== "object") return;
      if ([saved.px, saved.py, saved.pz].every((v) => typeof v === "number" && Number.isFinite(v))) {
        camera.position.set(saved.px, saved.py, saved.pz);
      }
      if (controls && [saved.tx, saved.ty, saved.tz].every((v) => typeof v === "number" && Number.isFinite(v))) {
        controls.target.set(saved.tx, saved.ty, saved.tz);
        controls.update();
      }
    },

    // Optional helper for 3D projects using THREE.PerspectiveCamera +
    // OrbitControls (or any lookalike exposing `.target` and
    // `addEventListener`). Restores the camera position/orbit target from
    // `extras.cam` on load (so a reload reproduces the exact same framing
    // instead of resetting to the hardcoded default), then persists the
    // camera pose to `extras.cam` whenever the user finishes an orbit/pan/
    // zoom interaction (OrbitControls' "end" event). Call once, right after
    // `init()`, before the first render.
    attachCamera(camera, controls) {
      this._cameraBinding = { camera, controls };
      this._applyCameraFromExtras();
      const save = () => {
        this.extras.cam = {
          px: camera.position.x,
          py: camera.position.y,
          pz: camera.position.z,
          tx: controls ? controls.target.x : 0,
          ty: controls ? controls.target.y : 0,
          tz: controls ? controls.target.z : 0,
        };
        this.persist();
      };
      if (controls && typeof controls.addEventListener === "function") controls.addEventListener("end", save);
      else window.addEventListener("beforeunload", save);
      return save;
    },

    // Call after any project-internal change (randomize, undo/redo, seed
    // reroll, load-state) that updates multiple params/extras at once, so
    // the manager's unified panel refreshes without triggering an echo loop
    // back through set-param.
    notifyValuesChanged() {
      window.parent.postMessage(
        {
          type: "shaderops/values-changed",
          projectId: this.projectId,
          values: this.params,
          extras: this.extras,
        },
        "*"
      );
      this.persist();
    },
  };

  window.ShaderOpsControls = bridge;
})();
