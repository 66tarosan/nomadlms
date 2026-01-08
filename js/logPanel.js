/* =========================================
   logPanel.js (MVP)
   - Read setup data from localStorage (teacherName / students / log)
   - Render students list (click highlight only)
   - Log actions:
       mode = ts (師生) / ss (生生) / g (組+1)
       skill = F/E/C/CO/R
     -> push to data.log[], save back, show in mini log
   - Setup button jump
   ========================================= */

(function () {
  const classCode = localStorage.getItem("nomad.currentClassCode");
  if (!classCode) return;

  const KEY = `nomad.class.${classCode}`;

  const els = {
    list: document.getElementById("studentsList"),
    teacherBadge: document.getElementById("teacherBadge"),
    studentCount: document.getElementById("studentCount"),
    selectedStudentText: document.getElementById("selectedStudentText"),
    openSetupBtn: document.getElementById("openSetupBtn"),
    modeBtns: document.querySelectorAll('.modePill[data-mode]'),
    skillBtns: document.querySelectorAll('.skillBtn[data-skill]'),
    miniLog: document.getElementById("miniLog"),
    logMsg: document.getElementById("logMsg"),
    clearLogBtn: document.getElementById("clearLogBtn"),
  };

  if (!els.list) {
    console.warn("[logPanel] studentsList not found");
    return;
  }

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
        // 對齊 setup.js 的預設結構
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

  function pad2(n) {
    const s = String(n);
    return s.length >= 2 ? s : "0" + s;
  }

  function fmtTime(ts) {
    try {
      const dt = new Date(ts);
      return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
    } catch {
      return "—";
    }
  }

  function setMsg(t) {
    if (!els.logMsg) return;
    els.logMsg.textContent = t || "";
    clearTimeout(setMsg._t);
    setMsg._t = setTimeout(() => (els.logMsg.textContent = ""), 1100);
  }

  // Demo: score placeholder (future: from economy/log)
  function getScoreForStudent(/* student */) {
    return 0;
  }

  // State (UI only)
  let data = loadClassData();
  let selectedStudentKey = null;
  let selectedStudent = null; // {id,name}
  let mode = "ts"; // ts / ss / g

  function makeStudentKey(s, idx) {
    return `${s.id || ""}::${(s.name || "").trim()}::${idx}`;
  }

  function setMode(nextMode) {
    mode = nextMode;
    els.modeBtns?.forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-mode") === mode);
    });

    if (mode === "g") {
      setMsg("目前是「組+1」：不需要選學生");
    } else {
      setMsg("師生/生生：先選一位學生");
    }
  }

  function renderStudents() {
    const teacherName = (data.teacherName || "").trim();
    const students = Array.isArray(data.students) ? data.students : [];

    if (els.teacherBadge) {
      els.teacherBadge.textContent = teacherName ? `教師：${teacherName}` : "教師：—";
    }
    if (els.studentCount) {
      els.studentCount.textContent = `人數 ${students.length}`;
    }

    els.list.innerHTML = students
      .map((s, idx) => {
        const no = s.id ? String(s.id).padStart(2, "0") : "—";
        const name = escapeHtml(s.name || "");
        const score = getScoreForStudent(s);

        const key = makeStudentKey(s, idx);
        const selectedClass = key === selectedStudentKey ? " is-selected" : "";

        return `
          <button class="studentRow${selectedClass}" type="button" data-student-key="${escapeHtml(key)}" role="listitem">
            <div class="studentRow__no">No. ${escapeHtml(no)}</div>
            <div class="studentRow__name">${name || "—"}</div>
            <div class="studentRow__score">${escapeHtml(String(score))}</div>
          </button>
        `;
      })
      .join("");

    els.list.querySelectorAll(".studentRow[data-student-key]").forEach((btn) => {
      btn.onclick = () => {
        const key = btn.getAttribute("data-student-key");
        if (!key) return;

        selectedStudentKey = key;

        // 反推 selectedStudent（用 key 對回去）
        const students2 = Array.isArray(data.students) ? data.students : [];
        selectedStudent = null;

        for (let i = 0; i < students2.length; i++) {
          const k = makeStudentKey(students2[i], i);
          if (k === key) {
            selectedStudent = { id: students2[i].id || "", name: (students2[i].name || "").trim() };
            break;
          }
        }

        if (els.selectedStudentText) {
          if (selectedStudent && selectedStudent.name) {
            const no = selectedStudent.id ? String(selectedStudent.id).padStart(2, "0") : "—";
            els.selectedStudentText.textContent = `No.${no} ${selectedStudent.name}`;
          } else {
            els.selectedStudentText.textContent = "—";
          }
        }

        // highlight 重新 render（簡單安全）
        renderStudents();
      };
    });
  }

  function renderMiniLog() {
    if (!els.miniLog) return;

    const logs = Array.isArray(data.log) ? data.log : [];
    const latest = logs.slice(-12).reverse();

    if (latest.length === 0) {
      els.miniLog.innerHTML = `<div style="opacity:.6;font-size:13px;padding:6px 2px;">尚無紀錄</div>`;
      return;
    }

    els.miniLog.innerHTML = latest
      .map((it) => {
        const time = fmtTime(it.ts);
        const tag = it.mode === "ts" ? "師生" : it.mode === "ss" ? "生生" : "組+1";
        const who = it.who || "—";
        const skill = it.skill || "—";
        return `
          <div class="logItem">
            <div class="logItem__top">
              <span>${escapeHtml(time)}</span>
              <span class="logTag">${escapeHtml(tag)}</span>
            </div>
            <div class="logItem__main">
              ${escapeHtml(who)}　·　${escapeHtml(skill)}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function ensureSelectedIfNeeded() {
    if (mode === "g") return true;
    if (!selectedStudent || !selectedStudent.name) {
      setMsg("請先點選一位學生");
      return false;
    }
    return true;
  }

  function pushLog(skill) {
    // reload 最新（避免別頁剛存）
    data = loadClassData();

    if (!ensureSelectedIfNeeded()) return;

    const teacherName = (data.teacherName || "").trim();
    const who =
      mode === "g"
        ? "全班"
        : `${selectedStudent.id ? `No.${String(selectedStudent.id).padStart(2, "0")} ` : ""}${selectedStudent.name}`;

    const entry = {
      ts: Date.now(),
      mode,          // ts / ss / g
      skill,         // F/E/C/CO/R
      who,           // 顯示用
      teacherName,   // 先記著，以後你要做統計用得到
    };

    data.log = Array.isArray(data.log) ? data.log : [];
    data.log.push(entry);

    saveClassData(data);

    renderMiniLog();
    setMsg("已記錄");
  }

  // Mode buttons
  els.modeBtns?.forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = btn.getAttribute("data-mode");
      if (!m) return;
      setMode(m);
    });
  });

  // Skill buttons
  els.skillBtns?.forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = btn.getAttribute("data-skill");
      if (!s) return;
      pushLog(s);
    });
  });

  // Clear log
  els.clearLogBtn?.addEventListener("click", () => {
    const ok = confirm("確定要清空所有課堂紀錄嗎？");
    if (!ok) return;
    data = loadClassData();
    data.log = [];
    saveClassData(data);
    renderMiniLog();
    setMsg("已清空");
  });

  // Setup button -> go setup page
  els.openSetupBtn?.addEventListener("click", () => {
    window.location.href = "setup.html";
  });

  // Init
  data = loadClassData();
  if (els.selectedStudentText) els.selectedStudentText.textContent = "—";
  setMode("ts");
  renderStudents();
  renderMiniLog();

  console.log("[logPanel] ready (MVP)");
})();