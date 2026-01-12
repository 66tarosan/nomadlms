/* =========================================
   dashboard.js (Panels controller - 3 panels)
   - tasks / log / summon
   - hint click
   - wheel threshold + lock (trackpad safe)
   - drag gesture: resistance + threshold + snap back
   - ✅ allow inner scroll areas (do not steal wheel/drag)
   - ✅ interactive elements are NOT drag starters (buttons/inputs/links...)
   - ✅ edgeHint: compact by default, peek briefly (touch-safe)
   ========================================= */

(function () {
  const snapRoot = document.getElementById("snapRoot");
  const hintTop = document.getElementById("hintTop");
  const hintBottom = document.getElementById("hintBottom");

  if (!snapRoot) {
    console.warn("[dashboard] snapRoot not found");
    return;
  }

  const PANELS = ["tasks", "log", "summon"];

  // ✅ Any inner scrollable area should have this class
  const SCROLL_GUARD_SELECTOR = ".js-scrollGuard";

  // ✅ Any interactive element should NOT start drag-to-switch-panels
  // (you can also add data-no-drag on any container to force allow clicking inside)
  const INTERACTIVE_SELECTOR =
    'button, a, input, textarea, select, label, [role="button"], [contenteditable="true"], [data-no-drag]';

  function clampIndex(i) {
    return Math.max(0, Math.min(PANELS.length - 1, i));
  }
  function idxOf(panel) {
    const i = PANELS.indexOf(panel);
    return i === -1 ? 1 : i; // fallback log
  }

  function baseOffsetFor(panel) {
    const H = window.innerHeight;
    if (panel === "tasks") return 0;
    if (panel === "log") return -H;
    return -H * 2; // summon
  }

  function getPanel() {
    const s = window.DASH_STATE?.getState?.();
    return s?.panel || "log";
  }

  /* =========================================================
     ✅ EdgeHint modes
     - is-compact: arrow only (no blocking)
     - is-peek: show full label briefly
     ========================================================= */

  function setHintMode(el, mode) {
    if (!el) return;
    el.classList.remove("is-compact", "is-peek");
    if (mode) el.classList.add(mode);
  }

  function ensureHintDefaults() {
    // default compact whenever visible
    setHintMode(hintTop, "is-compact");
    setHintMode(hintBottom, "is-compact");
  }

  let peekTimer = null;
  function peekHints(ms = 1400) {
    if (peekTimer) clearTimeout(peekTimer);

    // only peek visible hints
    if (hintTop && hintTop.classList.contains("is-active")) setHintMode(hintTop, "is-peek");
    if (hintBottom && hintBottom.classList.contains("is-active")) setHintMode(hintBottom, "is-peek");

    peekTimer = setTimeout(() => {
      ensureHintDefaults();
    }, ms);
  }

  function updateHints(panel) {
    const topLabel = hintTop?.querySelector(".edgeHint__label");
    const bottomLabel = hintBottom?.querySelector(".edgeHint__label");

    // show/hide by is-active
    if (hintTop) {
      if (panel === "tasks") hintTop.classList.remove("is-active");
      else hintTop.classList.add("is-active");
    }
    if (hintBottom) {
      if (panel === "summon") hintBottom.classList.remove("is-active");
      else hintBottom.classList.add("is-active");
    }

    // set text (text starts with ↑ / ↓ so compact mode can show arrow-only)
    if (topLabel) {
      if (panel === "log") topLabel.textContent = "↑ 每日任務";
      else if (panel === "summon") topLabel.textContent = "↑ 課堂紀錄";
      else topLabel.textContent = "↑";
    }
    if (bottomLabel) {
      if (panel === "tasks") bottomLabel.textContent = "↓ 課堂紀錄";
      else if (panel === "log") bottomLabel.textContent = "↓ 召喚門";
      else bottomLabel.textContent = "↓";
    }

    // always compact after updating
    ensureHintDefaults();
  }

  function setPanel(panel, reason = "panel-change") {
    if (!PANELS.includes(panel)) return;

    snapRoot.classList.remove("is-tasks", "is-log", "is-summon");
    snapRoot.classList.add(`is-${panel}`);

    // clear drag inline transform
    snapRoot.style.transform = "";
    snapRoot.style.transition = "";

    window.DASH_STATE?.setState?.({ panel }, reason);
    updateHints(panel);

    // ✅ For non-hint-click transitions, peek briefly so user understands navigation
    if (reason !== "hint-click") peekHints(900);
  }

  function step(delta, reason = "panel-step") {
    const cur = getPanel();
    const next = PANELS[clampIndex(idxOf(cur) + delta)];
    if (next !== cur) setPanel(next, reason);
    else setPanel(cur, "panel-clamp"); // bounce at ends
  }

  // expose for console
  window.setPanel = (p) => setPanel(p, "console");

  /* ---------- hint click ---------- */
  hintTop?.addEventListener("click", (e) => {
    e.preventDefault();
    step(-1, "hint-click");
    peekHints(900);
  });
  hintBottom?.addEventListener("click", (e) => {
    e.preventDefault();
    step(+1, "hint-click");
    peekHints(900);
  });

  /* =========================================================
     ✅ Scroll guard helpers
     ========================================================= */

  function closestScrollGuardEl(target) {
    if (!target || !target.closest) return null;
    // studentsList is scroll-ish too; keep it here if you haven't added js-scrollGuard on it
    return target.closest(`${SCROLL_GUARD_SELECTOR}, .studentsList`);
  }

  function canScroll(el, deltaY) {
    if (!el) return false;

    // If it can scroll horizontally, treat as "guard active" to prevent panel switching
    const canX = el.scrollWidth > el.clientWidth;
    if (canX) return true;

    const canY = el.scrollHeight > el.clientHeight;
    if (!canY) return false;

    const top = el.scrollTop;
    const max = el.scrollHeight - el.clientHeight;

    if (deltaY < 0) return top > 0;
    if (deltaY > 0) return top < max - 1;
    return false;
  }

  /* ---------- wheel / trackpad ---------- */
  let wheelAcc = 0;
  let wheelLock = false;
  const WHEEL_THRESHOLD = 140;
  const WHEEL_LOCK_MS = 520;

  window.addEventListener(
    "wheel",
    (e) => {
      if (wheelLock) return;
      // ignore horizontal swipe
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;

      const guardEl = closestScrollGuardEl(e.target);
      if (guardEl && canScroll(guardEl, e.deltaY)) {
        wheelAcc = 0;
        return;
      }

      wheelAcc += e.deltaY;

      if (Math.abs(wheelAcc) >= WHEEL_THRESHOLD) {
        const dir = wheelAcc > 0 ? +1 : -1; // down = +1, up = -1
        wheelAcc = 0;
        wheelLock = true;
        step(dir, "wheel-step");
        setTimeout(() => (wheelLock = false), WHEEL_LOCK_MS);
      }
    },
    { passive: true }
  );

  /* ---------- drag gesture (pointer) ---------- */
  (function initDrag() {
    let startY = 0;
    let currentY = 0;
    let dragging = false;
    let pointerId = null;

    const RESIST = 0.35;
    const THRESHOLD_RATIO = 0.18;
    const EDGE_RESIST = 0.18;

    function onPointerDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;

      // ✅ 1) If clicking an interactive element, DO NOT start dragging
      // This is the key fix for "buttons stop working on GitHub Pages / other browsers"
      const interactive = e.target?.closest?.(INTERACTIVE_SELECTOR);
      if (interactive) return;

      // ✅ 2) If starting in a scroll-guard area, do not start dragging
      const guardEl = closestScrollGuardEl(e.target);
      if (guardEl) return;

      dragging = true;
      pointerId = e.pointerId;
      startY = e.clientY;
      currentY = startY;

      snapRoot.setPointerCapture(pointerId);
      snapRoot.style.transition = "none";
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!dragging || e.pointerId !== pointerId) return;

      const y = e.clientY;
      const dy = y - startY;
      currentY = y;

      const panel = getPanel();
      const base = baseOffsetFor(panel);
      let offset = base + dy * RESIST;

      const atTop = panel === "tasks";
      const atBottom = panel === "summon";

      if (atTop && dy < 0) offset = base + dy * EDGE_RESIST;
      if (atBottom && dy > 0) offset = base + dy * EDGE_RESIST;

      snapRoot.style.transform = `translateY(${offset}px)`;
      e.preventDefault();
    }

    function onPointerUp(e) {
      if (!dragging || e.pointerId !== pointerId) return;

      dragging = false;
      snapRoot.releasePointerCapture(pointerId);
      snapRoot.style.transition = "";

      const dy = currentY - startY;
      const H = window.innerHeight;
      const THRESHOLD = H * THRESHOLD_RATIO;

      if (Math.abs(dy) < THRESHOLD) {
        setPanel(getPanel(), "drag-snapback");
      } else {
        step(dy < 0 ? +1 : -1, "drag-step");
      }

      pointerId = null;
      e.preventDefault();
    }

    snapRoot.addEventListener("pointerdown", onPointerDown, { passive: false });
    snapRoot.addEventListener("pointermove", onPointerMove, { passive: false });
    snapRoot.addEventListener("pointerup", onPointerUp, { passive: false });
    snapRoot.addEventListener("pointercancel", onPointerUp, { passive: false });
    snapRoot.addEventListener("lostpointercapture", () => {
      if (dragging) {
        dragging = false;
        setPanel(getPanel(), "lost-pointer");
      }
    });
  })();

  // init
  const initPanel = window.DASH_STATE?.getState?.().panel || "log";
  setPanel(initPanel, "init");

  // first-time peek (touch-safe)
  try {
    const KEY = "nomad.edgeHints.peeked.v1";
    const seen = localStorage.getItem(KEY);
    if (!seen) {
      setTimeout(() => {
        peekHints(1400);
        localStorage.setItem(KEY, "1");
      }, 420);
    }
  } catch (_) {}

  console.log("[dashboard] ready (wheel + drag + scrollGuard + edgeHint compact/peek)");
})();
