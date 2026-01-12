/* =========================================
   dashboard.js (Panels controller - 3 panels)
   - tasks / log / summon
   - hint click
   - wheel threshold + lock (trackpad safe)
   - drag gesture: resistance + threshold + snap back
   - ✅ allow inner scroll areas (do not steal wheel/drag)
   - ✅ interactive elements are NOT drag starters (buttons/inputs/links...)
   - ✅ edgeHint: FULL pill only
   - ✅ NEW: edgeHint auto-hide after 3s idle, reappear on activity / near-edge hover
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
     ✅ EdgeHint: idle hide / wake
     ========================================================= */

  const IDLE_HIDE_MS = 1000;
  const EDGE_WAKE_ZONE_PX = 72; // 滑鼠靠近上緣/下緣 72px 視為 hover 到提示區
  let idleTimer = null;

  function setIdleHidden(hidden) {
    [hintTop, hintBottom].forEach((h) => {
      if (!h) return;
      // 只對目前可見的 hint 生效
      if (!h.classList.contains("is-active")) return;
      h.classList.toggle("is-idleHidden", !!hidden);
    });
  }

  function resetIdleHide() {
    // any activity => show immediately
    setIdleHidden(false);

    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      setIdleHidden(true);
    }, IDLE_HIDE_MS);
  }

  function updateHints(panel) {
    const topLabel = hintTop?.querySelector(".edgeHint__label");
    const bottomLabel = hintBottom?.querySelector(".edgeHint__label");

    // show/hide by is-active
    if (hintTop) {
      if (panel === "tasks") hintTop.classList.remove("is-active");
      else hintTop.classList.add("is-active");
      hintTop.classList.remove("is-idleHidden");
    }
    if (hintBottom) {
      if (panel === "summon") hintBottom.classList.remove("is-active");
      else hintBottom.classList.add("is-active");
      hintBottom.classList.remove("is-idleHidden");
    }

    // set text
    if (topLabel) {
      if (panel === "log") topLabel.textContent = "↑ 每日任務";
      else if (panel === "summon") topLabel.textContent = "↑ 課堂紀錄";
      else topLabel.textContent = "↑ 每日任務";
    }
    if (bottomLabel) {
      if (panel === "tasks") bottomLabel.textContent = "↓ 課堂紀錄";
      else if (panel === "log") bottomLabel.textContent = "↓ 召喚門";
      else bottomLabel.textContent = "↓ 召喚門";
    }

    resetIdleHide();
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

    // panel change counts as activity
    resetIdleHide();
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
    resetIdleHide();
  });
  hintBottom?.addEventListener("click", (e) => {
    e.preventDefault();
    step(+1, "hint-click");
    resetIdleHide();
  });

  /* =========================================================
     ✅ Scroll guard helpers
     ========================================================= */

  function closestScrollGuardEl(target) {
    if (!target || !target.closest) return null;
    return target.closest(`${SCROLL_GUARD_SELECTOR}, .studentsList`);
  }

  function canScroll(el, deltaY) {
    if (!el) return false;

    // If it can scroll horizontally, treat as "guard active"
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
      resetIdleHide();

      if (wheelLock) return;
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;

      const guardEl = closestScrollGuardEl(e.target);
      if (guardEl && canScroll(guardEl, e.deltaY)) {
        wheelAcc = 0;
        return;
      }

      wheelAcc += e.deltaY;

      if (Math.abs(wheelAcc) >= WHEEL_THRESHOLD) {
        const dir = wheelAcc > 0 ? +1 : -1;
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
      resetIdleHide();

      if (e.pointerType === "mouse" && e.button !== 0) return;

      // ✅ interactive elements do not start drag
      const interactive = e.target?.closest?.(INTERACTIVE_SELECTOR);
      if (interactive) return;

      // ✅ scroll guard area do not start drag
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
      resetIdleHide();
    }

    snapRoot.addEventListener("pointerdown", onPointerDown, { passive: false });
    snapRoot.addEventListener("pointermove", onPointerMove, { passive: false });
    snapRoot.addEventListener("pointerup", onPointerUp, { passive: false });
    snapRoot.addEventListener("pointercancel", onPointerUp, { passive: false });
    snapRoot.addEventListener("lostpointercapture", () => {
      if (dragging) {
        dragging = false;
        setPanel(getPanel(), "lost-pointer");
        resetIdleHide();
      }
    });
  })();

  /* =========================================================
     ✅ Global activity => show hints again
     - plus: near-edge hover wake (top/bottom zones)
     ========================================================= */

  window.addEventListener(
    "mousemove",
    (e) => {
      // 只要動就算 activity（防止正在操作時突然隱藏）
      resetIdleHide();

      // 額外：靠近上緣/下緣就視為「hover 到提示區」
      const y = e.clientY;
      const H = window.innerHeight;
      if (y <= EDGE_WAKE_ZONE_PX || y >= H - EDGE_WAKE_ZONE_PX) {
        setIdleHidden(false);
      }
    },
    { passive: true }
  );

  ["pointermove", "keydown", "touchstart"].forEach((evt) => {
    window.addEventListener(evt, resetIdleHide, { passive: true });
  });

  // init
  const initPanel = window.DASH_STATE?.getState?.().panel || "log";
  setPanel(initPanel, "init");

  // start idle timer on load
  resetIdleHide();

  console.log("[dashboard] ready (wheel + drag + scrollGuard + edgeHint idleHide/fullPill)");
})();
