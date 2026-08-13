// Shared "Checkpoint" version-save panel — injected into every project via
// <script src="/shared/checkpoints.js" defer></script> (served flattened from
// projects/shared/ because vite.config.js sets publicDir: "projects").
//
// Each project's app.js exposes a small bridge object:
//   window.__shaderopsCheckpoints = { projectId, getState, applyState };
// where getState()/applyState(str) mirror the existing undo/redo snapshot
// helpers already present in every project (they already serialize state to
// a JSON string, so this script treats saved data as an opaque string).
(function () {
  if (window.__shaderopsCheckpointsLoaded) return;
  window.__shaderopsCheckpointsLoaded = true;

  const HOLD_MS = 800;
  const STORAGE_PREFIX = "shaderops:checkpoints:";
  const LOCK_STORAGE_PREFIX = "shaderops:locked-controls:";
  const ACTIVE_PROFILE_KEY = "shaderops:active-profile:v1";
  const PROFILE_KEY_PREFIX = "shaderops:profile:";

  function scopedStorageKey(baseKey) {
    const profileId = localStorage.getItem(ACTIVE_PROFILE_KEY) || "default";
    return `${PROFILE_KEY_PREFIX}${profileId}:${baseKey}`;
  }

  function getStored(baseKey) {
    const scopedKey = scopedStorageKey(baseKey);
    const scoped = localStorage.getItem(scopedKey);
    if (scoped !== null) return scoped;
    const legacy = localStorage.getItem(baseKey);
    if (legacy !== null) localStorage.setItem(scopedKey, legacy);
    return legacy;
  }

  function waitForBridge(cb, attempts = 0) {
    const bridge = window.__shaderopsCheckpoints;
    if (bridge && typeof bridge.getState === "function" && typeof bridge.applyState === "function") {
      cb(bridge);
      return;
    }
    if (attempts > 100) {
      console.warn("[ShaderOps Checkpoints] no state bridge found on this project; feature disabled.");
      return;
    }
    setTimeout(() => waitForBridge(cb, attempts + 1), 50);
  }

  function injectStyles() {
    if (document.getElementById("shaderopsCheckpointStyles")) return;
    const style = document.createElement("style");
    style.id = "shaderopsCheckpointStyles";
    style.textContent = `
.soc-panel {
  position: fixed;
  left: 12px;
  bottom: 12px;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
  user-select: none;
}
/* Reserve room at the bottom-left so a tall HUD control panel never visually
   overlaps this checkpoint bar, regardless of stacking order. */
.hud, #hud {
  max-height: calc(100vh - 20px - 54px) !important;
}
.soc-flag {
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  padding: 0 2px;
  color: rgba(255, 255, 255, 0.4);
  filter: grayscale(1);
}
.soc-slots {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: min(50vw, 420px);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  padding: 4px;
}
.soc-slots::-webkit-scrollbar { display: none; height: 0; }
.soc-btn-shell {
  position: relative;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}
.soc-ring {
  position: absolute;
  inset: -3px;
  width: calc(100% + 6px);
  height: calc(100% + 6px);
  pointer-events: none;
}
.soc-ring rect {
  fill: none;
  stroke: rgba(255, 255, 255, 0.92);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  opacity: 0;
  transition: stroke-dashoffset 0.25s ease-out, opacity 0.15s ease-out;
  filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.55));
}
.soc-btn-shell.holding .soc-ring rect {
  stroke-dashoffset: 0;
  opacity: 1;
  transition: stroke-dashoffset var(--hold-ms, 1500ms) linear, opacity 0.1s ease-out;
}
.soc-slot, .soc-add {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: rgba(255, 255, 255, 0.55);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 2px 10px rgba(0, 0, 0, 0.55);
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  font-family: inherit;
  touch-action: none;
  padding: 0;
}
.soc-slot:hover, .soc-add:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.85);
}
.soc-slot.active {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.42);
  color: #fff;
}
.soc-add span {
  font-size: 15px;
  font-weight: 400;
  margin-top: -1px;
}
@keyframes socPulse {
  0% { transform: scale(1); }
  40% { transform: scale(1.18); }
  100% { transform: scale(1); }
}
.soc-btn-shell.completed .soc-slot,
.soc-btn-shell.completed .soc-add {
  animation: socPulse 0.3s ease-out;
}
.soc-menu {
  position: fixed;
  z-index: 2147483001;
  min-width: 108px;
  padding: 4px;
  background: rgba(20, 20, 24, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
  font-family: -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
}
.soc-menu-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: rgba(255, 120, 120, 0.92);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
}
.soc-menu-item:hover {
  background: rgba(255, 120, 120, 0.14);
}
.shaderops-lock-wrap {
  position: relative;
  display: block;
  min-width: 0;
}
.shaderops-lock-wrap > input[type="number"] {
  width: 100% !important;
  padding-right: 24px !important;
}
.shaderops-lock-button {
  position: absolute;
  top: 50%;
  right: 3px;
  width: 18px;
  height: 18px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: rgba(255, 255, 255, 0.42);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: color 0.12s ease, background 0.12s ease, opacity 0.12s ease;
}
.shaderops-lock-button svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.shaderops-lock-wrap.is-visible .shaderops-lock-button,
.shaderops-lock-wrap.is-locked .shaderops-lock-button {
  opacity: 1;
  pointer-events: auto;
}
.shaderops-lock-wrap.is-locked .shaderops-lock-button {
  color: rgba(255, 220, 122, 0.96);
  background: rgba(255, 214, 102, 0.1);
}
.shaderops-lock-button:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.1);
}
`;
    document.head.appendChild(style);
  }

  function installLockedControls(projectId) {
    const storageKey = LOCK_STORAGE_PREFIX + projectId;
    let lockedIds = new Set();
    try {
      const saved = JSON.parse(getStored(storageKey) || "[]");
      if (Array.isArray(saved)) lockedIds = new Set(saved.filter((id) => typeof id === "string"));
    } catch {
      localStorage.removeItem(storageKey);
    }

    const saveLocks = () => {
      localStorage.setItem(scopedStorageKey(storageKey), JSON.stringify([...lockedIds]));
    };
    const lockIcon = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.2" y="7" width="9.6" height="6.2" rx="1.3"/><path d="M5.3 7V4.9a2.7 2.7 0 0 1 5.4 0V7"/></svg>`;
    const pairs = new Map();

    document.querySelectorAll("#hud input[type='number']").forEach((input) => {
      if (!input.id || !input.id.endsWith("Input") || input.parentElement?.classList.contains("shaderops-lock-wrap")) return;
      const controlId = input.id.slice(0, -"Input".length);
      const slider = document.getElementById(controlId);
      if (!(slider instanceof HTMLInputElement) || slider.type !== "range") return;

      const wrap = document.createElement("span");
      wrap.className = "shaderops-lock-wrap";
      input.replaceWith(wrap);
      wrap.appendChild(input);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "shaderops-lock-button";
      button.setAttribute("aria-label", `Lock ${controlId} against All random`);
      button.innerHTML = lockIcon;
      wrap.appendChild(button);
      pairs.set(controlId, { input, slider, wrap, button });

      const updateAppearance = () => {
        const locked = lockedIds.has(controlId);
        wrap.classList.toggle("is-locked", locked);
        button.setAttribute("aria-pressed", String(locked));
        button.title = locked ? "Unlock: allow All random to change this value" : "Lock: keep this value during All random";
      };
      updateAppearance();

      input.addEventListener("focus", () => wrap.classList.add("is-visible"));
      input.addEventListener("blur", () => {
        window.setTimeout(() => {
          if (!lockedIds.has(controlId)) wrap.classList.remove("is-visible");
        }, 0);
      });
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        if (lockedIds.has(controlId)) {
          lockedIds.delete(controlId);
          // Don't force-hide here: the input keeps focus through this click
          // (mousedown above prevents the button from stealing it), so the
          // icon should stay visible until the input actually blurs.
        } else {
          lockedIds.add(controlId);
        }
        saveLocks();
        updateAppearance();
      });
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("#allRandomButton") || lockedIds.size === 0) return;
      const snapshots = [...lockedIds]
        .map((id) => {
          const pair = pairs.get(id);
          return pair ? { pair, inputValue: pair.input.value, sliderValue: pair.slider.value } : null;
        })
        .filter(Boolean);

      // Capture runs before the project's own click listener. Restore in the
      // next browser turn, after each project's randomize-and-save cycle ends.
      window.setTimeout(() => {
        snapshots.forEach(({ pair, inputValue, sliderValue }) => {
          pair.input.value = inputValue;
          pair.slider.value = sliderValue;
          pair.input.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }, 0);
    }, true);
  }

  function attachHold(shell, el, { onTap, onComplete }) {
    let timer = null;
    let completed = false;

    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      shell.classList.remove("holding");
    };
    const flash = () => {
      shell.classList.add("completed");
      setTimeout(() => shell.classList.remove("completed"), 300);
    };

    el.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      completed = false;
      shell.style.setProperty("--hold-ms", `${HOLD_MS}ms`);
      shell.classList.add("holding");
      try { el.setPointerCapture(event.pointerId); } catch { /* not supported, ignore */ }
      timer = setTimeout(() => {
        completed = true;
        timer = null;
        shell.classList.remove("holding");
        flash();
        if (onComplete) onComplete();
      }, HOLD_MS);
    });
    el.addEventListener("pointerup", () => {
      const wasPending = timer !== null;
      cancel();
      if (wasPending && !completed && onTap) {
        onTap();
        flash();
      }
    });
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  function ringSvg() {
    return `<svg class="soc-ring" viewBox="0 0 28 28" aria-hidden="true"><rect x="1" y="1" width="26" height="26" rx="8" ry="8" pathLength="100"/></svg>`;
  }

  let contextMenuEl = null;
  function ensureContextMenu() {
    if (contextMenuEl) return contextMenuEl;
    const menu = document.createElement("div");
    menu.id = "shaderopsCheckpointMenu";
    menu.className = "soc-menu";
    menu.hidden = true;
    menu.innerHTML = `<button type="button" class="soc-menu-item">Delete</button>`;
    document.body.appendChild(menu);
    document.addEventListener("pointerdown", (event) => {
      if (!menu.hidden && !menu.contains(event.target)) hideContextMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideContextMenu();
    });
    window.addEventListener("scroll", () => hideContextMenu(), true);
    window.addEventListener("resize", () => hideContextMenu());
    contextMenuEl = menu;
    return menu;
  }
  function hideContextMenu() {
    if (contextMenuEl) contextMenuEl.hidden = true;
  }
  function showContextMenu(x, y, onDelete) {
    const menu = ensureContextMenu();
    const btn = menu.querySelector(".soc-menu-item");
    btn.onclick = () => { onDelete(); hideContextMenu(); };
    menu.style.visibility = "hidden";
    menu.hidden = false;
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      let left = x;
      let top = y - rect.height - 8;
      if (top < 8) top = y + 8;
      if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
      if (left < 8) left = 8;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.visibility = "visible";
    });
  }

  function init(bridge) {
    const projectId = bridge.projectId || "default";
    const storageKey = STORAGE_PREFIX + projectId;

    function loadStore() {
      try {
        const raw = getStored(storageKey);
        if (!raw) return { slots: [], nextId: 1, activeId: null };
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.slots)) return { slots: [], nextId: 1, activeId: null };
        return {
          slots: parsed.slots,
          nextId: Number.isFinite(parsed.nextId) ? parsed.nextId : parsed.slots.length + 1,
          activeId: parsed.activeId ?? null,
        };
      } catch {
        return { slots: [], nextId: 1, activeId: null };
      }
    }
    function saveStore() {
      try { localStorage.setItem(scopedStorageKey(storageKey), JSON.stringify(store)); } catch { /* storage full/unavailable */ }
    }

    const store = loadStore();

    injectStyles();
    installLockedControls(projectId);

    const root = document.createElement("div");
    root.id = "shaderopsCheckpoints";
    root.className = "soc-panel";
    root.innerHTML = `
      <span class="soc-flag" title="Checkpoints — save and recall versions of this look">&#9873;</span>
      <div class="soc-slots"></div>
      <span class="soc-btn-shell soc-add-shell">
        <button type="button" class="soc-add" title="Hold 0.8s to save the current look as a new checkpoint"><span>+</span></button>
        ${ringSvg()}
      </span>
    `;
    document.body.appendChild(root);

    const slotsContainer = root.querySelector(".soc-slots");
    const addShell = root.querySelector(".soc-add-shell");
    const addBtn = root.querySelector(".soc-add");

    function loadSlot(id) {
      const slot = store.slots.find((s) => s.id === id);
      if (!slot) return;
      bridge.applyState(slot.data);
      store.activeId = id;
      saveStore();
      renderSlots();
    }
    function overwriteSlot(id) {
      const slot = store.slots.find((s) => s.id === id);
      if (!slot) return;
      slot.data = bridge.getState();
      store.activeId = id;
      saveStore();
      renderSlots();
    }
    function createSlot() {
      const id = store.nextId;
      store.nextId += 1;
      store.slots.push({ id, data: bridge.getState() });
      store.activeId = id;
      saveStore();
      renderSlots();
    }
    function deleteSlot(id) {
      const idx = store.slots.findIndex((s) => s.id === id);
      if (idx === -1) return;
      store.slots.splice(idx, 1);
      if (store.activeId === id) store.activeId = null;
      saveStore();
      renderSlots();
    }

    function renderSlots() {
      slotsContainer.innerHTML = "";
      store.slots.forEach((slot) => {
        const shell = document.createElement("span");
        shell.className = "soc-btn-shell soc-slot-shell";
        shell.innerHTML = `
          <button type="button" class="soc-slot${slot.id === store.activeId ? " active" : ""}" title="Click to load · hold 0.8s to overwrite · right-click to delete">${slot.id}</button>
          ${ringSvg()}
        `;
        slotsContainer.appendChild(shell);
        const btn = shell.querySelector("button");
        attachHold(shell, btn, {
          onTap: () => loadSlot(slot.id),
          onComplete: () => overwriteSlot(slot.id),
        });
        btn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          showContextMenu(event.clientX, event.clientY, () => deleteSlot(slot.id));
        });
      });
    }

    attachHold(addShell, addBtn, { onTap: null, onComplete: createSlot });

    renderSlots();
  }

  waitForBridge(init);
})();
