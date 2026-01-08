(function () {
  const classCode = localStorage.getItem("nomad.currentClassCode");
  if (!classCode) return;

  const KEY = `nomad.class.${classCode}`;

  const els = {
    classCodeText: document.getElementById("classCodeText"),
    form: document.getElementById("setupForm"),
    teacherName: document.getElementById("teacherName"),
    studentId: document.getElementById("studentId"),
    studentName: document.getElementById("studentName"),
    addBtn: document.getElementById("addStudentBtn"),
    list: document.getElementById("studentList"),
    msg: document.getElementById("msgBox"),
    clearBtn: document.getElementById("clearBtn"),
  };

  /* -----------------------------
     Data IO
     ----------------------------- */
  function loadClassData() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        return {
          classCode,
          createdAt: Date.now(),
          teacherName: "",
          students: [],
          tasks: [],
          log: [],
        };
      }
      const data = JSON.parse(raw);
      return {
        classCode,
        createdAt: data.createdAt ?? Date.now(),
        teacherName: data.teacherName ?? "",
        students: Array.isArray(data.students) ? data.students : [],
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        log: Array.isArray(data.log) ? data.log : [],
      };
    } catch {
      return {
        classCode,
        createdAt: Date.now(),
        teacherName: "",
        students: [],
        tasks: [],
        log: [],
      };
    }
  }

  function saveClassData(next) {
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  // ✅ 核心：永遠以「最新 state」為底，只覆蓋 teacherName / students
  function saveTeacherAndStudents(partial) {
    const latest = loadClassData();
    if (typeof partial.teacherName === "string") latest.teacherName = partial.teacherName;
    if (Array.isArray(partial.students)) latest.students = partial.students;
    saveClassData(latest);
    return latest;
  }

  // UI state（只拿來 render，不直接當存檔來源）
  let data = loadClassData();

  /* -----------------------------
     Helpers
     ----------------------------- */
  function setMsg(t) {
    if (!els.msg) return;
    els.msg.textContent = t || "";
    clearTimeout(setMsg._t);
    setMsg._t = setTimeout(() => (els.msg.textContent = ""), 1400);
  }

  function normId(v) {
    return (v || "").replace(/[^0-9]/g, "").slice(0, 3);
  }

  function normName(v) {
    return (v || "").trim().replace(/\s+/g, " ");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function focusToEnd(inputEl) {
    if (!inputEl) return;
    if (typeof inputEl.setSelectionRange === "function") {
      const n = inputEl.value.length;
      inputEl.setSelectionRange(n, n);
    }
  }

  function sortStudents(students) {
    const arr = Array.isArray(students) ? students : [];
    arr.sort((a, b) => {
      const ai = a.id ? Number(a.id) : 9999;
      const bi = b.id ? Number(b.id) : 9999;
      if (ai !== bi) return ai - bi;
      return (a.name || "").localeCompare(b.name || "", "zh-Hant");
    });
    return arr;
  }

  function isDupStudent(students, next) {
    const nextId = next.id ? String(next.id) : "";
    const nextName = (next.name || "").toLowerCase();

    return (students || []).some((s) => {
      const sid = s.id ? String(s.id) : "";
      const sname = (s.name || "").toLowerCase();
      if (nextId && sid && nextId === sid) return true;
      if (nextName && sname && nextName === sname) return true;
      return false;
    });
  }

  /* -----------------------------
     Render
     ----------------------------- */
  function render() {
    // ✅ 每次 render 都以最新資料為準（避免其它 panel 更新後 setup 還顯示舊資料）
    data = loadClassData();

    if (els.classCodeText) els.classCodeText.textContent = classCode;
    if (els.teacherName) els.teacherName.value = data.teacherName || "";

    if (!els.list) return;
    const students = data.students || [];

    els.list.innerHTML = students
      .map((s, idx) => {
        const idText = s.id ? String(s.id).padStart(2, "0") : "—";
        const nameText = escapeHtml(s.name || "");
        return `
          <li class="studentItem" data-idx="${idx}">
            <div class="badge">No. ${idText}</div>
            <div>${nameText}</div>
            <button class="removeBtn" type="button" data-action="remove" data-idx="${idx}">移除</button>
          </li>
        `;
      })
      .join("");

    els.list.querySelectorAll('[data-action="remove"]').forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute("data-idx"));
        if (!Number.isFinite(i)) return;

        const latest = loadClassData();
        latest.students = Array.isArray(latest.students) ? latest.students : [];
        latest.students.splice(i, 1);

        // ✅ 只存 students（不碰 tasks/log）
        saveTeacherAndStudents({ students: latest.students });

        render();
        setMsg("已移除");
      };
    });
  }

  /* -----------------------------
     Action: add student
     ----------------------------- */
  function addStudent() {
    const id = normId(els.studentId?.value);
    const name = normName(els.studentName?.value);

    if (!name) return setMsg("請先輸入姓名");

    const student = { id: id || "", name };

    const latest = loadClassData();
    latest.students = Array.isArray(latest.students) ? latest.students : [];

    if (isDupStudent(latest.students, student)) {
      return setMsg("重複的學生（座號或姓名已存在）");
    }

    latest.students.push(student);
    sortStudents(latest.students);

    // ✅ 只存 students（不碰 tasks/log）
    saveTeacherAndStudents({ students: latest.students });

    if (els.studentId) els.studentId.value = "";
    if (els.studentName) els.studentName.value = "";
    els.studentId?.focus();

    render();
    setMsg("已加入");
  }

  /* =========================================================
     (1) 座號跳轉：2 碼延遲，3 碼立即跳
     ========================================================= */
  let seatJumpTimer = null;

  els.studentId?.addEventListener("input", () => {
    const cleaned = normId(els.studentId.value);
    if (els.studentId.value !== cleaned) els.studentId.value = cleaned;

    if (seatJumpTimer) clearTimeout(seatJumpTimer);

    // 3 碼：立刻跳到姓名
    if (cleaned.length === 3) {
      els.studentName?.focus();
      focusToEnd(els.studentName);
      return;
    }

    // 2 碼：延遲跳
    if (cleaned.length === 2) {
      seatJumpTimer = setTimeout(() => {
        const now = normId(els.studentId.value);
        if (now.length === 2) {
          els.studentName?.focus();
          focusToEnd(els.studentName);
        }
      }, 200);
    }
  });

  /* =========================================================
     (2) 姓名 Enter：IME 組字友善
     ========================================================= */
  let nameComposing = false;
  let lastCompositionEndAt = 0;

  els.studentName?.addEventListener("compositionstart", () => {
    nameComposing = true;
  });

  els.studentName?.addEventListener("compositionend", () => {
    nameComposing = false;
    lastCompositionEndAt = Date.now();
  });

  els.studentName?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;

    // 組字中：Enter 只確字，不加入
    if (e.isComposing || nameComposing) return;

    // 組字剛結束那顆 Enter：不加入（避免誤送出）
    const JUST_ENDED_MS = 300;
    if (Date.now() - lastCompositionEndAt < JUST_ENDED_MS) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    addStudent();
  });

  /* -----------------------------
     Button: add student
     ----------------------------- */
  els.addBtn?.addEventListener("click", () => addStudent());

  /* -----------------------------
     Save and back
     ----------------------------- */
  els.form?.addEventListener("submit", (e) => {
    e.preventDefault();

    const tname = normName(els.teacherName?.value);
    if (!tname) return setMsg("請輸入教師暱稱");

    // ✅ 只存 teacherName（不碰 tasks/log）
    saveTeacherAndStudents({ teacherName: tname });

    setMsg("已儲存，返回 Dashboard…");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 300);
  });

  /* -----------------------------
     Clear list
     ----------------------------- */
  els.clearBtn?.addEventListener("click", () => {
    const ok = confirm("確定要清空學生清單嗎？");
    if (!ok) return;

    // ✅ 只存 students（不碰 tasks/log）
    saveTeacherAndStudents({ students: [] });

    render();
    setMsg("已清空");
  });

  // init
  render();
})();