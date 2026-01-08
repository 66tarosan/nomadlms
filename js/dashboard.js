/* =========================================
   dashboard.js (Panels controller - 3 panels)
   - tasks / log / summon
   - hint click
   - wheel threshold + lock (trackpad safe)
   - drag gesture: resistance + threshold + snap back
   - ✅ allow inner scroll areas (do not steal wheel/drag)
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

  // ✅ 任何內部可捲動區塊，請加上這個 class
  const SCROLL_GUARD_SELECTOR = ".js-scrollGuard";

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
    // brief expand, then back to compact
    if (peekTimer) clearTimeout(peekTimer);

    // 只對「目前可見」的 hint 做 peek
    if (hintTop && hintTop.classList.contains("is-active")) setHintMode(hintTop, "is-peek");
    if (hintBottom && hintBottom.classList.contains("is-active")) setHintMode(hintBottom, "is-peek");

    peekTimer = setTimeout(() => {
      ensureHintDefaults();
    }, ms);
  }

  function setPanel(panel, reason = "panel-change") {
    if (!PANELS.includes(panel)) return;

    snapRoot.classList.remove("is-tasks", "is-log", "is-summon");
    snapRoot.classList.add(`is-${panel}`);

    snapRoot.style.transform = "";
    snapRoot.style.transition = "";

    window.DASH_STATE?.setState?.({ panel }, reason);
    updateHints(panel);

    // ✅ 非 click 觸發（wheel / drag / init）才 peek
    if (reason !== "hint-click") {
      peekHints();
    }
  }

  function step(delta) {
    const cur = getPanel();
    const next = PANELS[clampIndex(idxOf(cur) + delta)];
    if (next !== cur) setPanel(next, "panel-step");
    else setPanel(cur, "panel-clamp"); // 到頂到底回彈
  }

  function updateHints(panel) {
    const topLabel = hintTop?.querySelector(".edgeHint__label");
    const bottomLabel = hintBottom?.querySelector(".edgeHint__label");

    // ✅ 用 is-active 控制顯示/隱藏（比 display:none 更平滑，也更好做 peek）
    if (hintTop) {
      if (panel === "tasks") hintTop.classList.remove("is-active");
      else hintTop.classList.add("is-active");
    }
    if (hintBottom) {
      if (panel === "summon") hintBottom.classList.remove("is-active");
      else hintBottom.classList.add("is-active");
    }

    // 更新文字
    if (topLabel) {
      if (panel === "log") topLabel.textContent = "↑ 每日任務";
      else if (panel === "summon") topLabel.textContent = "↑ 課堂紀錄";
      else topLabel.textContent = "↑"; // fallback (rare)
    }
    if (bottomLabel) {
      if (panel === "tasks") bottomLabel.textContent = "↓ 課堂紀錄";
      else if (panel === "log") bottomLabel.textContent = "↓ 召喚門";
      else bottomLabel.textContent = "↓";
    }

    // 每次 panel 更新後，回到 compact（避免一直遮擋）
    ensureHintDefaults();
  }

  // expose for console
  window.setPanel = (p) => setPanel(p, "console");

  /* ---------- hint click ---------- */
  hintTop?.addEventListener("click", (e) => {
    e.preventDefault();
    step(-1);
    peekHints(900); // 點了就短 peek 一下，強化「可導航」的回饋
  });
  hintBottom?.addEventListener("click", (e) => {
    e.preventDefault();
    step(+1);
    peekHints(900);
  });

  /* =========================================================
     ✅ Scroll guard helpers
     - 若事件發生在可捲動區中，優先捲動內容，不切 panel
     ========================================================= */

  function closestScrollGuardEl(target) {
    if (!(target instanceof Element)) return null;
    return target.closest(SCROLL_GUARD_SELECTOR);
  }

  function canScroll(el, dy) {
    // dy > 0: 向下滾；dy < 0: 向上滾
    if (!el) return false;
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    if (maxScrollTop <= 0) return false;

    const top = el.scrollTop;

    if (dy > 0) return top < maxScrollTop; // 還能往下捲
    if (dy < 0) return top > 0;            // 還能往上捲
    return false;
  }

  /* ---------- wheel / trackpad ---------- */
  let wheelAcc = 0;
  let wheelLock = false;
  const WHEEL_THRESHOLD = 140;
  const WHEEL_LOCK_MS = 520;

  /** 找到「可捲動守衛區」：tasks 卡牆 / studentsList 等 */
  function closestScrollGuardEl2(target){
    if(!target || !target.closest) return null;
    // tasksScroll / tasksGrid / studentsList 都可以加 js-scrollGuard
    return target.closest(".js-scrollGuard, .studentsList");
  }

  /** 判斷該元素在此方向是否「還能捲」 */
  function canScroll2(el, deltaY){
    if(!el) return false;

    // 橫向卡牆：優先吃水平捲動（tasksGrid overflow-x）
    const canX = el.scrollWidth > el.clientWidth;
    const canY = el.scrollHeight > el.clientHeight;

    // 只要有橫向可捲，就視為 guard 生效（避免切 panel）
    if(canX) return true;

    if(!canY) return false;

    const top = el.scrollTop;
    const max = el.scrollHeight - el.clientHeight;

    if(deltaY < 0) return top > 0;        // 往上滾：還能往上
    if(deltaY > 0) return top < max - 1;  // 往下滾：還能往下
    return false;
  }

  window.addEventListener(
    "wheel",
    (e) => {
      if (wheelLock) return;
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; // ignore horizontal

      // ✅ 如果滑在可捲動區，且該區還能捲 → 不切 panel
      const guardEl = closestScrollGuardEl2(e.target);
      if (guardEl && canScroll2(guardEl, e.deltaY)) {
        wheelAcc = 0; // 防止累積到閾值突然切 panel
        return;
      }

      wheelAcc += e.deltaY;

      if (Math.abs(wheelAcc) >= WHEEL_THRESHOLD) {
        const dir = wheelAcc > 0 ? +1 : -1; // down = +1, up = -1
        wheelAcc = 0;
        wheelLock = true;
        step(dir);
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

      // ✅ 若起點在可捲動區，讓它做原生捲動，不啟動切 panel 拖曳
      const guardEl = closestScrollGuardEl2(e.target);
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
        step(dy < 0 ? +1 : -1);
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

  // ✅ 首次進入：peek 一次（不影響觸控）
  try {
    const KEY = "nomad.edgeHints.peeked.v1";
    const seen = localStorage.getItem(KEY);
    if (!seen) {
      // 先給一點點時間讓 layout 穩定
      setTimeout(() => {
        peekHints(1400);
        localStorage.setItem(KEY, "1");
      }, 420);
    }
  } catch (_) {}

  console.log("[dashboard] ready (wheel + drag + scrollGuard + edgeHint compact/peek)");
})();