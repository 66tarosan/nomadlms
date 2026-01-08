/* =========================================
   tasksPanel.js (A: Tasks configured inline in Tasks Panel)
   - Data source: localStorage nomad.class.${classCode}
     uses: students / tasks
   - Features:
       1) Seed default tasks if empty
       2) Migration: if tasks exist but are "all shells" -> re-seed defaults
       3) Reconcile students change
       4) Per-card deadline ("截止")
       5) Inactive card = "未啟用 → 去設定" (prompt 任務名稱)
       6) Enabled card: click title to rename
       7) Reset per task (pill @ card bottom): clear lists -> pending=全班
       8) ✅ Reset all (pill @ header): reset all enabled tasks
   ========================================= */

(function () {
  const classCode = localStorage.getItem("nomad.currentClassCode");
  if (!classCode) return;

  const KEY = `nomad.class.${classCode}`;

  const els = {
    root: document.getElementById("tasksRoot"),
    resetAllBtn: document.getElementById("tasksResetAllBtn"), // ✅ header button
  };

  if (!els.root) {
    console.warn("[tasksPanel] #tasksRoot not found");
    return;
  }

  /* ---------- helpers ---------- */
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadClassData() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        return { classCode, createdAt: Date.now(), teacherName: "", students: [], tasks: [], log: [] };
      }
      const d = JSON.parse(raw);
      return {
        classCode,
        createdAt: d.createdAt ?? Date.now(),
        teacherName: d.teacherName ?? "",
        students: Array.isArray(d.students) ? d.students : [],
        tasks: Array.isArray(d.tasks) ? d.tasks : [],
        log: Array.isArray(d.log) ? d.log : [],
      };
    } catch {
      return { classCode, createdAt: Date.now(), teacherName: "", students: [], tasks: [], log: [] };
    }
  }

  function saveClassData(d) {
    localStorage.setItem(KEY, JSON.stringify(d));
  }

  function percent(n, d) {
    if (!d) return 0;
    return Math.round((n / d) * 100);
  }

  // stable key used inside tasks lists
  function studentKey(s) {
    const id = (s?.id || "").trim();
    const name = (s?.name || "").trim();
    if (id) return `id:${id}`;
    return `name:${name}`;
  }

  function getStudentNameByKey(state, key) {
    const students = state.students || [];
    if (!key) return "—";

    if (key.startsWith("id:")) {
      const id = key.slice(3);
      const hit = students.find((x) => (x.id || "").trim() === id);
      if (hit) return (hit.name || "").trim() || `No.${id}`;
      return `No.${id}`;
    }

    if (key.startsWith("name:")) return key.slice(5) || "—";
    return key;
  }

  function cleanTaskName(name) {
    return String(name || "").trim().replace(/\s+/g, " ").slice(0, 24);
  }

  /* ---------- toast ---------- */
  let toastEl = null;
  function ensureToast() {
    if (toastEl) return toastEl;
    toastEl = document.createElement("div");
    toastEl.className = "tasksToast";
    toastEl.id = "tasksToast";
    document.body.appendChild(toastEl);
    return toastEl;
  }

  function showToast(msg) {
    const t = ensureToast();
    t.textContent = msg;
    t.classList.add("is-visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove("is-visible"), 1100);
  }

  /* ---------- tasks seed / migration ---------- */
  function makeDefaultTasks(state) {
    const studentKeys = (state.students || []).map(studentKey);

    return [
      {
        id: "t1",
        slot: 1,
        enabled: true,
        name: "準時到校",
        phaseClosed: false,
        rewardOnTimePct: 100,
        rewardLatePct: 70,
        onTime: [],
        late: [],
        pending: [...studentKeys],
      },
      {
        id: "t2",
        slot: 2,
        enabled: true,
        name: "作業繳交",
        phaseClosed: false,
        rewardOnTimePct: 100,
        rewardLatePct: 70,
        onTime: [],
        late: [],
        pending: [...studentKeys],
      },
      {
        id: "t3",
        slot: 3,
        enabled: true,
        name: "訂正完成",
        phaseClosed: false,
        rewardOnTimePct: 100,
        rewardLatePct: 80,
        onTime: [],
        late: [],
        pending: [...studentKeys],
      },
      {
        id: "t4",
        slot: 4,
        enabled: false,
        name: "",
        phaseClosed: false,
        rewardOnTimePct: 100,
        rewardLatePct: 70,
        onTime: [],
        late: [],
        pending: [],
      },
      {
        id: "t5",
        slot: 5,
        enabled: false,
        name: "",
        phaseClosed: false,
        rewardOnTimePct: 100,
        rewardLatePct: 70,
        onTime: [],
        late: [],
        pending: [],
      },
    ];
  }

  function seedTasksIfEmpty(state) {
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    if (tasks.length > 0) return state;
    state.tasks = makeDefaultTasks(state);
    return state;
  }

  function normalizeTasksShape(state) {
    state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
    state.tasks = state.tasks.map((t, idx) => {
      const slot = t.slot ?? idx + 1;
      const id = t.id || `t${slot}`;
      return {
        id,
        slot,
        enabled: !!t.enabled,
        name: cleanTaskName(t.name ?? ""),
        phaseClosed: !!t.phaseClosed,
        rewardOnTimePct: t.rewardOnTimePct ?? 100,
        rewardLatePct: t.rewardLatePct ?? 70,
        onTime: Array.isArray(t.onTime) ? t.onTime : [],
        late: Array.isArray(t.late) ? t.late : [],
        pending: Array.isArray(t.pending) ? t.pending : [],
      };
    });
    return state;
  }

  // If tasks exist but are basically "empty shells" -> re-seed defaults
  function migrateIfShellTasks(state) {
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    if (tasks.length === 0) return state;

    const enabledCount = tasks.filter((t) => !!t?.enabled).length;
    const namedEnabled = tasks.filter((t) => !!t?.enabled && cleanTaskName(t?.name)).length;

    if (enabledCount === 0 || namedEnabled === 0) {
      state.tasks = makeDefaultTasks(state);
      showToast("已修復任務模板");
    }

    return state;
  }

  // reconcile students change with existing tasks lists
  function reconcileTasksWithStudents(state) {
    const students = state.students || [];
    const curKeys = new Set(students.map(studentKey));

    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    tasks.forEach((t) => {
      t.onTime = Array.isArray(t.onTime) ? t.onTime : [];
      t.late = Array.isArray(t.late) ? t.late : [];
      t.pending = Array.isArray(t.pending) ? t.pending : [];

      // remove deleted students
      t.onTime = t.onTime.filter((k) => curKeys.has(k));
      t.late = t.late.filter((k) => curKeys.has(k));
      t.pending = t.pending.filter((k) => curKeys.has(k));

      if (!t.enabled) return;

      // add new students into pending if they are not in any list
      const inAny = new Set([...t.onTime, ...t.late, ...t.pending]);
      curKeys.forEach((k) => {
        if (!inAny.has(k)) t.pending.push(k);
      });
    });

    state.tasks = tasks;
    return state;
  }

  /* ---------- operations ---------- */
  function enableTask(state, taskId, name) {
    const task = (state.tasks || []).find((x) => x.id === taskId);
    if (!task) return false;

    const keys = (state.students || []).map(studentKey);

    task.enabled = true;
    task.name = cleanTaskName(name);
    task.phaseClosed = false;
    task.onTime = [];
    task.late = [];
    task.pending = [...keys];

    return true;
  }

  function resetTask(state, taskId) {
    const task = (state.tasks || []).find((x) => x.id === taskId);
    if (!task) return false;

    const keys = (state.students || []).map(studentKey);

    task.phaseClosed = false;
    task.onTime = [];
    task.late = [];
    task.pending = task.enabled ? [...keys] : [];

    return true;
  }

  function resetAllEnabledTasks(state) {
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    let changed = 0;
    tasks.forEach((t) => {
      if (!t?.enabled) return;
      const ok = resetTask(state, t.id);
      if (ok) changed++;
    });
    return changed;
  }

  function renameTask(state, taskId, newName) {
    const task = (state.tasks || []).find((x) => x.id === taskId);
    if (!task) return false;
    if (!task.enabled) return false;
    task.name = cleanTaskName(newName);
    return true;
  }

  /* ---------- render ---------- */
  function render(state) {
    const tasks = state.tasks || [];
    const total = (state.students || []).length;

    const html = `
      <div id="tasksGrid" class="tasksGrid" aria-label="tasks board">
        ${tasks
          .map((t) => {
            const enabled = !!t.enabled;
            const name = enabled ? (t.name ? t.name : "（未命名任務）") : "未啟用";

            const onTime = Array.isArray(t.onTime) ? t.onTime : [];
            const late = Array.isArray(t.late) ? t.late : [];
            const pending = Array.isArray(t.pending) ? t.pending : [];

            const done = enabled ? onTime.length + late.length : 0;
            const fill = enabled ? percent(done, total) : 0;
            const countText = enabled ? `${done}/${total}` : `—/${total}`;
            const isComplete = enabled && total > 0 && done >= total;

            const cardClass = [
              "taskCard",
              enabled ? "is-active" : "is-inactive",
              isComplete ? "is-complete" : "",
            ]
              .filter(Boolean)
              .join(" ");

            const primaryLabel = enabled ? (t.phaseClosed ? "已截止" : "截止") : "去設定";
            const primaryAction = enabled ? "close-phase" : "enable-task";
            const primaryClass = [
              "taskPrimaryBtn",
              enabled ? (t.phaseClosed ? "is-fired" : "is-armed") : "is-fired",
            ]
              .filter(Boolean)
              .join(" ");

            const titleAction = enabled ? "rename-task" : "enable-task";

            const onTimeChips = enabled
              ? onTime.length
                ? onTime
                    .map((k) => {
                      const n = escapeHtml(getStudentNameByKey(state, k));
                      return `<button class="nameChip is-disabled" type="button" disabled>${n}</button>`;
                    })
                    .join("")
                : `<div class="taskEmpty">—</div>`
              : `<div class="taskEmpty">（未啟用）</div>`;

            const lateChips = enabled
              ? late.length
                ? late
                    .map((k) => {
                      const n = escapeHtml(getStudentNameByKey(state, k));
                      return `<button class="nameChip is-disabled" type="button" disabled>${n}</button>`;
                    })
                    .join("")
                : `<div class="taskEmpty">—</div>`
              : `<div class="taskEmpty">（未啟用）</div>`;

            const pendingChips = enabled
              ? pending.length
                ? pending
                    .map((k) => {
                      const n = escapeHtml(getStudentNameByKey(state, k));
                      return `<button class="nameChip" type="button"
                        data-action="mark-done"
                        data-task-id="${escapeHtml(t.id)}"
                        data-student-key="${escapeHtml(k)}">${n}</button>`;
                    })
                    .join("")
                : `<div class="taskEmpty">（全部完成）</div>`
              : `<div class="taskEmpty">點右上「去設定」啟用</div>`;

            return `
              <article class="${cardClass}" data-task-id="${escapeHtml(t.id)}">
                <div class="taskCard__header">
                  <div class="taskTitle">
                    <div class="taskTitle__kicker">Task ${escapeHtml(String(t.slot || ""))}</div>

                    <h2 class="taskTitle__name">
                      <button class="taskTitleBtn" type="button"
                        data-action="${escapeHtml(titleAction)}"
                        data-task-id="${escapeHtml(t.id)}">
                        ${escapeHtml(name)}
                      </button>
                    </h2>
                  </div>

                  <div class="taskHeaderActions">
                    <button class="${primaryClass}" type="button"
                      data-action="${escapeHtml(primaryAction)}"
                      data-task-id="${escapeHtml(t.id)}">
                      ${escapeHtml(primaryLabel)}
                    </button>
                  </div>
                </div>

                <div class="taskProgress">
                  <div class="progressTop">
                    <div>進度</div>
                    <div class="progressTop__count">${escapeHtml(countText)}</div>
                  </div>
                  <div class="progressBar" aria-label="progress">
                    <div class="progressBar__fill" style="width:${fill}%"></div>
                  </div>
                </div>

                <div class="taskSection">
                  <div class="taskSection__label">已完成（準時）</div>
                  <div class="chipList">${onTimeChips}</div>
                </div>

                <div class="taskSection">
                  <div class="taskSection__label">已完成（超時）</div>
                  <div class="chipList">${lateChips}</div>
                </div>

                <div class="taskSection">
                  <div class="taskSection__label">未完成（點名字回報）</div>
                  <div class="chipList">${pendingChips}</div>
                </div>

                ${enabled ? `
                  <div class="taskFooterActions">
                    <button class="taskResetPill" type="button"
                      data-action="reset-task"
                      data-task-id="${escapeHtml(t.id)}">
                      重置
                    </button>
                  </div>
                ` : ``}
              </article>
            `;
          })
          .join("")}
      </div>
    `;

    els.root.innerHTML = html;
    bindEvents();
  }

  /* ---------- events ---------- */
  function bindEvents() {
    const grid = document.getElementById("tasksGrid");
    if (!grid) return;

    function runEnable(taskId) {
      const state = loadClassData();
      const name = cleanTaskName(prompt("任務名稱？（例如：準時到校）", "") || "");
      if (!name) return;

      const ok = enableTask(state, taskId, name);
      if (!ok) return;

      saveClassData(state);
      showToast("已啟用任務");
      init();
    }

    // enable (inactive)
    grid.querySelectorAll('[data-action="enable-task"]').forEach((btn) => {
      btn.onclick = () => {
        const taskId = btn.getAttribute("data-task-id");
        if (!taskId) return;
        runEnable(taskId);
      };
    });

    // rename (title)
    grid.querySelectorAll('[data-action="rename-task"]').forEach((btn) => {
      btn.onclick = () => {
        const taskId = btn.getAttribute("data-task-id");
        if (!taskId) return;

        const state = loadClassData();
        const task = (state.tasks || []).find((x) => x.id === taskId);
        if (!task || !task.enabled) return;

        const next = cleanTaskName(prompt("修改任務名稱：", task.name || "") || "");
        if (!next) return;

        renameTask(state, taskId, next);
        saveClassData(state);
        showToast("已改名");
        init();
      };
    });

    // reset task (footer pill)
    grid.querySelectorAll('[data-action="reset-task"]').forEach((btn) => {
      btn.onclick = () => {
        const taskId = btn.getAttribute("data-task-id");
        if (!taskId) return;

        const ok = confirm("重置此任務？（會清空已完成/超時，全部回到未完成）");
        if (!ok) return;

        const state = loadClassData();
        const done = resetTask(state, taskId);
        if (!done) return;

        saveClassData(state);
        showToast("已重置");
        init();
      };
    });

    // close phase
    grid.querySelectorAll('[data-action="close-phase"]').forEach((btn) => {
      btn.onclick = () => {
        const taskId = btn.getAttribute("data-task-id");
        if (!taskId) return;

        const state = loadClassData();
        const task = (state.tasks || []).find((x) => x.id === taskId);
        if (!task || !task.enabled) return;
        if (task.phaseClosed) return;

        task.phaseClosed = true;
        saveClassData(state);

        showToast("已截止：之後完成視為超時");
        init();
      };
    });

    // mark done
    grid.querySelectorAll('[data-action="mark-done"][data-task-id][data-student-key]').forEach((chip) => {
      chip.onclick = () => {
        const taskId = chip.getAttribute("data-task-id");
        const skey = chip.getAttribute("data-student-key");
        if (!taskId || !skey) return;

        const state = loadClassData();
        const task = (state.tasks || []).find((x) => x.id === taskId);
        if (!task || !task.enabled) return;

        task.pending = Array.isArray(task.pending) ? task.pending : [];
        task.onTime = Array.isArray(task.onTime) ? task.onTime : [];
        task.late = Array.isArray(task.late) ? task.late : [];

        if (!task.pending.includes(skey)) return;

        task.pending = task.pending.filter((k) => k !== skey);
        if (task.phaseClosed) task.late.push(skey);
        else task.onTime.push(skey);

        saveClassData(state);
        showToast("已回報完成");
        init();
      };
    });
  }

  /* ---------- header: reset all ---------- */
  function bindHeaderResetAll() {
    if (!els.resetAllBtn) return;

    els.resetAllBtn.addEventListener("click", () => {
      const ok = confirm("全部重置？（會把所有已啟用任務清空，全部回到未完成）");
      if (!ok) return;

      const state = loadClassData();
      const n = resetAllEnabledTasks(state);
      saveClassData(state);

      showToast(n > 0 ? "已全部重置" : "沒有可重置的任務");
      init();
    });
  }

  /* ---------- init ---------- */
  function init() {
    let state = loadClassData();
    state = seedTasksIfEmpty(state);
    state = normalizeTasksShape(state);
    state = migrateIfShellTasks(state);
    state = reconcileTasksWithStudents(state);
    saveClassData(state);
    render(state);
  }

  bindHeaderResetAll();
  init();
  console.log("[tasksPanel] ready (A: inline tasks config, reset pill)");
})();