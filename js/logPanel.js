/* =========================================
   logPanel.js (MVP v2 - Individual + Group)
   - Read class data from localStorage
   - Students list (click -> select individual target)
   - Group board (click -> select group target)
   - Action buttons:
       Individual: independent_success / guided_success / guided_fail / give_up
       Group: group_plus2 / group_plus1 / group_minus1 / group_minus2
   - Log entries saved to data.log[]
   - Points (for UI score + pack points) saved to data.points / data.packPoints
   - Undo last entry (supports group events affecting all members)
   ========================================= */

(function () {
  const classCode = localStorage.getItem("nomad.currentClassCode");
  if (!classCode) return;

  const KEY = `nomad.class.${classCode}`;

  const els = {
    list: document.getElementById("studentsList"),
    teacherBadge: document.getElementById("teacherBadge"),
    studentCount: document.getElementById("studentCount"),

    selectedTargetText: document.getElementById("selectedTargetText"),
    selectedTargetHint: document.getElementById("selectedTargetHint"),

    actionRowIndividual: document.getElementById("actionRowIndividual"),
    actionRowGroup: document.getElementById("actionRowGroup"),

    undoBtn: document.getElementById("undoBtn"),
    groupBoard: document.getElementById("groupBoard"),

    clearLogBtn: document.getElementById("clearLogBtn"),
    editGroupsBtn: document.getElementById("editGroupsBtn"),
    logMsg: document.getElementById("logMsg"),
    openSetupBtn: document.getElementById("openSetupBtn"), // optional (maybe in header)
  };

  if (!els.list) {
    console.warn("[logPanel] studentsList not found");
    return;
  }

  /* ---------------- utils ---------------- */

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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
          // ✅ new
          groups: [],         // [{ id:"g1", name:"第一組", memberKeys:[studentKey...] }]
          points: {},         // { [studentKey]: number }  (UI: 分數/表現)
          packPoints: {},     // { [studentKey]: number }  (可兌換積分)
          groupPoints: {},    // { [groupId]: number }     (組別進度)
        };
      }
      const d = JSON.parse(raw);
      return {
        classCode,
        createdAt: d.createdAt ?? Date.now(),
        teacherName: d.teacherName ?? "",
        students: Array.isArray(d.students) ? d.students : [],
        tasks: Array.isArray(d.tasks) ? d.tasks : [],
        log: Array.isArray(d.log) ? d.log : [],
        groups: Array.isArray(d.groups) ? d.groups : [],
        points: d.points && typeof d.points === "object" ? d.points : {},
        packPoints: d.packPoints && typeof d.packPoints === "object" ? d.packPoints : {},
        groupPoints: d.groupPoints && typeof d.groupPoints === "object" ? d.groupPoints : {},
      };
    } catch {
      return {
        classCode,
        createdAt: Date.now(),
        teacherName: "",
        students: [],
        tasks: [],
        log: [],
        groups: [],
        points: {},
        packPoints: {},
        groupPoints: {},
      };
    }
  }

  function saveClassData(d) {
    localStorage.setItem(KEY, JSON.stringify(d));
  }

  /* ---------------- keys & state ---------------- */

  // 用「id + name + idx」做穩定 key（你原本的做法）
  function makeStudentKey(s, idx) {
    return `${s.id || ""}::${(s.name || "").trim()}::${idx}`;
  }

  let data = loadClassData();

  // target state
  // target = { kind: "none" | "ind" | "grp", studentKey?, student?, groupId?, group? }
  let target = { kind: "none" };

  /* ---------------- derived groups ---------------- */

  function ensureGroups(d) {
    // 如果你還沒做分組：自動產生一個「未分組」把全班放進去
    const students = Array.isArray(d.students) ? d.students : [];
    const hasAny = Array.isArray(d.groups) && d.groups.length > 0;

    if (hasAny) return d;

    const memberKeys = students.map((s, idx) => makeStudentKey(s, idx));
    d.groups = [
      {
        id: "g0",
        name: "未分組",
        memberKeys,
      },
    ];
    return d;
  }

  function getStudentByKey(d, key) {
    const students = Array.isArray(d.students) ? d.students : [];
    for (let i = 0; i < students.length; i++) {
      if (makeStudentKey(students[i], i) === key) {
        return { idx: i, s: students[i] };
      }
    }
    return null;
  }

  function getScore(studentKey) {
    const v = Number(data.points?.[studentKey] ?? 0);
    return Number.isFinite(v) ? v : 0;
  }

  function getPack(studentKey) {
    const v = Number(data.packPoints?.[studentKey] ?? 0);
    return Number.isFinite(v) ? v : 0;
  }

  function getGroupPoints(groupId) {
    const v = Number(data.groupPoints?.[groupId] ?? 0);
    return Number.isFinite(v) ? v : 0;
  }

  function addPoints(studentKey, delta) {
    data.points = data.points || {};
    const cur = Number(data.points[studentKey] ?? 0) || 0;
    data.points[studentKey] = cur + delta;
  }

  function addPackPoints(studentKey, delta) {
    // ✅ 兌換積分：只吃正分（負分不扣兌換）
    if (delta <= 0) return;
    data.packPoints = data.packPoints || {};
    const cur = Number(data.packPoints[studentKey] ?? 0) || 0;
    data.packPoints[studentKey] = cur + delta;
  }

  function addGroupPoints(groupId, delta) {
    data.groupPoints = data.groupPoints || {};
    const cur = Number(data.groupPoints[groupId] ?? 0) || 0;
    data.groupPoints[groupId] = cur + delta;
  }

  /* ---------------- UI helpers ---------------- */

  function setTargetNone() {
    target = { kind: "none" };
    if (els.selectedTargetText) els.selectedTargetText.textContent = "—";
    if (els.selectedTargetHint) els.selectedTargetHint.textContent = "（請點選學生或組別）";
    showActionRows("none");
    updateUndoBtn();
  }

  function showActionRows(kind) {
    if (els.actionRowIndividual) els.actionRowIndividual.hidden = kind !== "ind";
    if (els.actionRowGroup) els.actionRowGroup.hidden = kind !== "grp";
  }

  function setTargetIndividual(studentKey, studentObj) {
    target = { kind: "ind", studentKey, student: studentObj };

    const no = studentObj?.id ? String(studentObj.id).padStart(2, "0") : "—";
    const nm = (studentObj?.name || "").trim() || "—";

    if (els.selectedTargetText) els.selectedTargetText.textContent = `No.${no} ${nm}`;
    if (els.selectedTargetHint) els.selectedTargetHint.textContent = "（個人事件）";

    showActionRows("ind");
    updateUndoBtn();
  }

  function setTargetGroup(groupId, groupObj) {
    target = { kind: "grp", groupId, group: groupObj };

    if (els.selectedTargetText) els.selectedTargetText.textContent = groupObj?.name || "—";
    if (els.selectedTargetHint) els.selectedTargetHint.textContent = "（小組事件）";

    showActionRows("grp");
    updateUndoBtn();
  }

  function updateUndoBtn() {
    if (!els.undoBtn) return;
    const logs = Array.isArray(data.log) ? data.log : [];
    els.undoBtn.disabled = logs.length === 0;
  }

  /* ---------------- render ---------------- */

  function renderStudents() {
    const teacherName = (data.teacherName || "").trim();
    const students = Array.isArray(data.students) ? data.students : [];

    if (els.teacherBadge) {
      els.teacherBadge.textContent = teacherName ? `教師：${teacherName}` : "教師：—";
    }
    if (els.studentCount) {
      els.studentCount.textContent = `人數 ${students.length}`;
    }

    const selectedKey = target.kind === "ind" ? target.studentKey : null;

    els.list.innerHTML = students
      .map((s, idx) => {
        const key = makeStudentKey(s, idx);
        const no = s.id ? String(s.id).padStart(2, "0") : "—";
        const name = escapeHtml(s.name || "");
        const score = getScore(key);

        const selectedClass = key === selectedKey ? " is-selected" : "";

        return `
          <button class="studentRow${selectedClass}" type="button" data-student-key="${escapeHtml(
          key
        )}" role="listitem">
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

        // ✅ 不管現在是不是 group target，只要點學生，就直接切到個人（你 B 的規則）
        data = loadClassData();
        data = ensureGroups(data);

        const found = getStudentByKey(data, key);
        const st = found ? { id: found.s.id || "", name: (found.s.name || "").trim() } : { id: "", name: "" };

        setTargetIndividual(key, st);

        // re-render highlight
        renderStudents();
        renderGroupBoard();
      };
    });
  }

  function renderGroupBoard() {
    if (!els.groupBoard) return;

    data = ensureGroups(data);

    const groups = Array.isArray(data.groups) ? data.groups : [];
    const selectedGroupId = target.kind === "grp" ? target.groupId : null;

    if (groups.length === 0) {
      els.groupBoard.innerHTML = `<div style="opacity:.6;font-size:13px;padding:6px 2px;">尚無分組</div>`;
      return;
    }

    els.groupBoard.innerHTML = groups
      .map((g) => {
        const gp = getGroupPoints(g.id);
        const isSel = g.id === selectedGroupId ? " is-selected" : "";
        const memberCount = Array.isArray(g.memberKeys) ? g.memberKeys.length : 0;

        // 簡單進度條（0~20 視覺用，你之後可換成你要的「獎勵進度條」規則）
        const pct = Math.max(0, Math.min(100, (gp / 20) * 100));

        return `
          <button class="groupCard${isSel}" type="button" data-group-id="${escapeHtml(g.id)}">
            <div class="groupCard__top">
              <div class="groupCard__name">${escapeHtml(g.name || g.id)}</div>
              <div class="groupCard__meta">${escapeHtml(String(memberCount))}人　·　分數 ${escapeHtml(
          String(gp)
        )}</div>
            </div>
            <div class="groupBar" aria-hidden="true">
              <div class="groupBar__fill" style="width:${pct}%;"></div>
            </div>
          </button>
        `;
      })
      .join("");

    els.groupBoard.querySelectorAll(".groupCard[data-group-id]").forEach((btn) => {
      btn.onclick = () => {
        const gid = btn.getAttribute("data-group-id");
        if (!gid) return;

        data = loadClassData();
        data = ensureGroups(data);

        const g = (data.groups || []).find((x) => x.id === gid) || null;
        setTargetGroup(gid, g);

        renderStudents();
        renderGroupBoard();
      };
    });
  }

  /* ---------------- logging ---------------- */

  function pushIndividualEvent(code, delta) {
    data = loadClassData();
    data = ensureGroups(data);

    if (target.kind !== "ind" || !target.studentKey) {
      setMsg("請先點選一位學生");
      return;
    }

    const teacherName = (data.teacherName || "").trim();
    const found = getStudentByKey(data, target.studentKey);
    const no = found?.s?.id ? String(found.s.id).padStart(2, "0") : "—";
    const nm = (found?.s?.name || "").trim() || "—";

    const entry = {
      ts: Date.now(),
      kind: "ind",
      code,          // independent_success / guided_success / guided_fail / give_up
      delta: Number(delta) || 0,
      studentKey: target.studentKey,
      who: `No.${no} ${nm}`,
      teacherName,
    };

    data.log = Array.isArray(data.log) ? data.log : [];
    data.log.push(entry);

    // apply score + pack points
    addPoints(target.studentKey, entry.delta);
    addPackPoints(target.studentKey, entry.delta);

    saveClassData(data);
    setMsg("已記錄（個人）");

    // refresh
    renderStudents();
    renderGroupBoard();
    updateUndoBtn();
  }

  function pushGroupEvent(code, delta) {
    data = loadClassData();
    data = ensureGroups(data);

    if (target.kind !== "grp" || !target.groupId) {
      setMsg("請先點選一個組別");
      return;
    }

    const group = (data.groups || []).find((g) => g.id === target.groupId);
    if (!group) {
      setMsg("找不到組別");
      return;
    }

    const memberKeys = Array.isArray(group.memberKeys) ? group.memberKeys : [];

    const entry = {
      ts: Date.now(),
      kind: "grp",
      code,                 // group_plus2 / group_plus1 / group_minus1 / group_minus2
      delta: Number(delta) || 0,
      groupId: group.id,
      groupName: group.name || group.id,
      memberKeys: [...memberKeys], // ✅ snapshot：撤銷要用（你也說「當次在組內就算」）
      teacherName: (data.teacherName || "").trim(),
    };

    data.log = Array.isArray(data.log) ? data.log : [];
    data.log.push(entry);

    // apply: groupPoints + each member score + each member pack points (only positive)
    addGroupPoints(group.id, entry.delta);
    memberKeys.forEach((k) => {
      addPoints(k, entry.delta);
      addPackPoints(k, entry.delta);
    });

    saveClassData(data);
    setMsg("已記錄（小組）");

    renderStudents();
    renderGroupBoard();
    updateUndoBtn();
  }

  function undoLast() {
    data = loadClassData();
    data = ensureGroups(data);

    const logs = Array.isArray(data.log) ? data.log : [];
    if (logs.length === 0) return;

    const last = logs[logs.length - 1];

    // revert effects
    if (last.kind === "ind" && last.studentKey) {
      addPoints(last.studentKey, -(Number(last.delta) || 0));
      // packPoints：我們只加不扣（保持兌換穩定）。若你想撤銷也扣回來，把下面兩行打開：
      // data.packPoints = data.packPoints || {};
      // data.packPoints[last.studentKey] = (Number(data.packPoints[last.studentKey] ?? 0) || 0) - Math.max(0, Number(last.delta) || 0);
    }

    if (last.kind === "grp" && last.groupId) {
      addGroupPoints(last.groupId, -(Number(last.delta) || 0));
      (last.memberKeys || []).forEach((k) => {
        addPoints(k, -(Number(last.delta) || 0));
        // packPoints 同上：目前不扣回
      });
    }

    logs.pop();
    data.log = logs;

    saveClassData(data);
    setMsg("已撤銷");

    renderStudents();
    renderGroupBoard();
    updateUndoBtn();
  }

  function clearAllLogs() {
    const ok = confirm("確定要清空所有紀錄與分數嗎？");
    if (!ok) return;

    data = loadClassData();
    data.log = [];
    data.points = {};
    data.packPoints = {};
    data.groupPoints = {};
    saveClassData(data);

    setTargetNone();
    renderStudents();
    renderGroupBoard();
    updateUndoBtn();

    setMsg("已清空");
  }

  /* ---------------- bind buttons ---------------- */

  // individual result buttons
  document.querySelectorAll('.resultBtn[data-kind="ind"][data-code][data-delta]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.getAttribute("data-code");
      const delta = Number(btn.getAttribute("data-delta") || 0);
      if (!code) return;
      pushIndividualEvent(code, delta);
    });
  });

  // group result buttons
  document.querySelectorAll('.resultBtn[data-kind="grp"][data-code][data-delta]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.getAttribute("data-code");
      const delta = Number(btn.getAttribute("data-delta") || 0);
      if (!code) return;
      pushGroupEvent(code, delta);
    });
  });

  els.undoBtn?.addEventListener("click", () => undoLast());
  els.clearLogBtn?.addEventListener("click", () => clearAllLogs());

  els.editGroupsBtn?.addEventListener("click", () => {
    // 先導到 setup（你之後做分組頁時可以用 hash）
    window.location.href = "setup.html#groups";
  });

  els.openSetupBtn?.addEventListener("click", () => {
    window.location.href = "setup.html";
  });

  /* ---------------- init ---------------- */

  data = loadClassData();
  data = ensureGroups(data);
  saveClassData(data); // 若自動生成 g0，先存回去

  setTargetNone();
  renderStudents();
  renderGroupBoard();
  updateUndoBtn();

  console.log("[logPanel] ready (v2: individual+group, undo)");
})();
