/* =========================================
   logPanel.js v3 - Groups Modal with Pill UI
   - Left: Group buttons (pill style, selectable)
   - Right: Student buttons (pill style, can be checked)
   - Save button: validates all students assigned, then updates and closes
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
    openSetupBtn: document.getElementById("openSetupBtn"),
    groupsModal: document.getElementById("groupsModal"),
    closeGroupsBtn: document.getElementById("closeGroupsBtn"),
    groupCountInput: document.getElementById("groupCountInput"),
    applyGroupCountBtn: document.getElementById("applyGroupCountBtn"),
    autoAssignBtn: document.getElementById("autoAssignBtn"),
    clearGroupsBtn: document.getElementById("clearGroupsBtn"),
    saveGroupsBtn: document.getElementById("saveGroupsBtn"), // NEW: save button
    groupsStudentsList: document.getElementById("groupsStudentsList"),
    groupsBoard: document.getElementById("groupsBoard"),
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
          groups: [],
          points: {},
          packPoints: {},
          groupPoints: {},
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

  function makeStudentKey(s, idx) {
    return `${s.id || ""}::${(s.name || "").trim()}::${idx}`;
  }

  let data = loadClassData();
  let target = { kind: "none" };

  function ensureGroups(d) {
    const students = Array.isArray(d.students) ? d.students : [];
    const hasAny = Array.isArray(d.groups) && d.groups.length > 0;
    if (hasAny) return d;

    const memberKeys = students.map((s, idx) => makeStudentKey(s, idx));
    d.groups = [{ id: "g0", name: "未分組", memberKeys }];
    return d;
  }

  function getStudentByKey(d, key) {
    const students = Array.isArray(d.students) ? d.students : [];
    for (let i = 0; i < students.length; i++) {
      if (makeStudentKey(students[i], i) === key) return { idx: i, s: students[i] };
    }
    return null;
  }

  function getScore(studentKey) {
    const v = Number(data.points?.[studentKey] ?? 0);
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

  function showActionRows(kind) {
    if (els.actionRowIndividual) els.actionRowIndividual.hidden = kind !== "ind";
    if (els.actionRowGroup) els.actionRowGroup.hidden = kind !== "grp";
  }

  function setTargetNone() {
    target = { kind: "none" };
    if (els.selectedTargetText) els.selectedTargetText.textContent = "—";
    if (els.selectedTargetHint) els.selectedTargetHint.textContent = "（請點選學生或組別）";
    showActionRows("none");
    updateUndoBtn();
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

  function renderStudents() {
    const teacherName = (data.teacherName || "").trim();
    const students = Array.isArray(data.students) ? data.students : [];

    if (els.teacherBadge) els.teacherBadge.textContent = teacherName ? `教師：${teacherName}` : "教師：—";
    if (els.studentCount) els.studentCount.textContent = `人數 ${students.length}`;

    const selectedKey = target.kind === "ind" ? target.studentKey : null;

    els.list.innerHTML = students
      .map((s, idx) => {
        const key = makeStudentKey(s, idx);
        const no = s.id ? String(s.id).padStart(2, "0") : "—";
        const name = escapeHtml(s.name || "");
        const score = getScore(key);
        const selectedClass = key === selectedKey ? " is-selected" : "";

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

        data = loadClassData();
        data = ensureGroups(data);

        const found = getStudentByKey(data, key);
        const st = found ? { id: found.s.id || "", name: (found.s.name || "").trim() } : { id: "", name: "" };
        setTargetIndividual(key, st);

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

    els.groupBoard.innerHTML = groups
      .map((g) => {
        const gp = getGroupPoints(g.id);
        const isSel = g.id === selectedGroupId ? " is-selected" : "";
        const memberCount = Array.isArray(g.memberKeys) ? g.memberKeys.length : 0;
        const pct = Math.max(0, Math.min(100, (gp / 20) * 100));
        
        // 獲取該組成員的完整名字
        const memberNames = (g.memberKeys || [])
          .map(key => {
            const found = getStudentByKey(data, key);
            return found ? (found.s.name || "").trim() : "";
          })
          .filter(n => n)
          .join("、"); // 移除 slice 限制，顯示所有名字
        
        const displayMembers = memberNames || `${memberCount} 人`;

        return `
          <button class="groupCard${isSel}" type="button" data-group-id="${escapeHtml(g.id)}">
            <div class="groupCard__top">
              <div class="groupCard__name">${escapeHtml(g.name || g.id)}</div>
              <div class="groupCard__meta">${escapeHtml(displayMembers)}　·　分數 ${escapeHtml(String(gp))}</div>
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

  /* ========== GROUPS MODAL: NEW UI (pill buttons) ========== */

  // Modal state: track which group is selected, and which students are assigned
  let modalState = {
    selectedGroupId: null,
    assignments: {}, // { studentKey: groupId }
  };

  function initModalState() {
    data = loadClassData();
    data = ensureGroups(data);

    // 只有在 modalState 完全空的時候才初始化，避免清除已有的變更
    if (!modalState.assignments || Object.keys(modalState.assignments).length === 0) {
      modalState = {
        selectedGroupId: null,
        assignments: {},
      };

      // Initialize from current groups
      (data.groups || []).forEach((g) => {
        (g.memberKeys || []).forEach((key) => {
          modalState.assignments[key] = g.id;
        });
      });
    }
  }

  function renderGroupsModalBoard() {
    if (!els.groupsBoard) return;

    data = loadClassData();
    data = ensureGroups(data);

    const groups = Array.isArray(data.groups) ? data.groups : [];

    els.groupsBoard.innerHTML = groups
      .map((g) => {
        const isSelected = modalState.selectedGroupId === g.id;
        return `
          <button class="groupPill ${isSelected ? "is-selected" : ""}" type="button" data-group-id="${escapeHtml(g.id)}" data-modal-role="groupBtn">
            ${escapeHtml(g.name || g.id)}
          </button>
        `;
      })
      .join("");

    els.groupsBoard.querySelectorAll("[data-modal-role='groupBtn']").forEach((btn) => {
      btn.onclick = () => {
        const gid = btn.getAttribute("data-group-id");
        modalState.selectedGroupId = gid;
        renderGroupsModalBoard();
        renderGroupsModalStudents();
      };
    });
  }

  function renderGroupsModalStudents() {
    if (!els.groupsStudentsList) return;

    data = loadClassData();
    data = ensureGroups(data);

    const students = Array.isArray(data.students) ? data.students : [];
    const selectedGroupId = modalState.selectedGroupId;

    if (!selectedGroupId) {
      els.groupsStudentsList.innerHTML = '<div class="emptyHint">請先選擇組別</div>';
      return;
    }

    els.groupsStudentsList.innerHTML = students
      .map((s, idx) => {
        const key = makeStudentKey(s, idx);
        const no = s.id ? String(s.id).padStart(2, "0") : "—";
        const name = escapeHtml(s.name || "");
        const isAssignedToThisGroup = modalState.assignments[key] === selectedGroupId;
        // 檢查是否被分配到其他組別
        const assignedToOtherGroup = modalState.assignments[key] && modalState.assignments[key] !== selectedGroupId;
        const disabledClass = assignedToOtherGroup ? " is-disabled" : "";
        const selectedClass = isAssignedToThisGroup ? " is-selected" : "";

        return `
          <button class="studentPill${selectedClass}${disabledClass}" type="button" data-student-key="${escapeHtml(key)}" data-modal-role="studentBtn" ${assignedToOtherGroup ? "disabled" : ""}>
            <span class="studentPill__name">${name || "—"}</span>
            <span class="studentPill__no">No.${escapeHtml(no)}</span>
          </button>
        `;
      })
      .join("");

    els.groupsStudentsList.querySelectorAll("[data-modal-role='studentBtn']:not(:disabled)").forEach((btn) => {
      btn.onclick = () => {
        const key = btn.getAttribute("data-student-key");
        if (!key) return;

        // Toggle: if already in this group, remove; otherwise assign
        if (modalState.assignments[key] === selectedGroupId) {
          delete modalState.assignments[key];
        } else {
          modalState.assignments[key] = selectedGroupId;
        }

        renderGroupsModalStudents();
      };
    });
  }

  /* -------- groups modal: action buttons -------- */

  function handleApplyGroupCount() {
    const count = Number(els.groupCountInput?.value || 6);
    if (!Number.isFinite(count) || count < 1 || count > 12) {
      setMsg("組別數必須是 1～12");
      return;
    }

    data = loadClassData();
    data = ensureGroups(data);

    data.groups = [];
    for (let i = 0; i < count; i++) {
      data.groups.push({ id: `g${i}`, name: `第 ${i + 1} 組`, memberKeys: [] });
    }

    saveClassData(data);
    setMsg(`已建立 ${count} 個空組別`);

    initModalState();
    renderGroupsModalBoard();
    renderGroupsModalStudents();
  }

  function handleAutoAssign() {
    data = loadClassData();
    data = ensureGroups(data);

    const students = Array.isArray(data.students) ? data.students : [];
    const groups = Array.isArray(data.groups) ? data.groups : [];

    if (groups.length === 0) {
      setMsg("請先設定組別");
      return;
    }

    // Auto-assign: reset and distribute
    modalState.assignments = {};
    students.forEach((s, idx) => {
      const key = makeStudentKey(s, idx);
      const groupIdx = idx % groups.length;
      modalState.assignments[key] = groups[groupIdx].id;
    });

    setMsg(`自動分配 ${students.length} 位學生到 ${groups.length} 組`);
    renderGroupsModalStudents();
  }

  function handleClearGroups() {
    const ok = confirm("確定要清空所有分組嗎？");
    if (!ok) return;

    modalState.assignments = {};
    setMsg("已清空所有分組");

    renderGroupsModalStudents();
  }

  function handleSaveGroups() {
    data = loadClassData();
    data = ensureGroups(data);

    const students = Array.isArray(data.students) ? data.students : [];
    const unassigned = [];

    // Check for unassigned students
    students.forEach((s, idx) => {
      const key = makeStudentKey(s, idx);
      if (!modalState.assignments[key]) {
        unassigned.push(`No.${String(s.id || "").padStart(2, "0")} ${s.name || ""}`);
      }
    });

    if (unassigned.length > 0) {
      alert(`以下學生尚未分組：\n${unassigned.join("\n")}\n\n請先分配所有學生`);
      return;
    }

    // Apply assignments to data
    (data.groups || []).forEach((g) => {
      g.memberKeys = [];
    });

    Object.entries(modalState.assignments).forEach(([key, groupId]) => {
      const group = (data.groups || []).find((g) => g.id === groupId);
      if (group && !group.memberKeys.includes(key)) {
        group.memberKeys.push(key);
      }
    });

    saveClassData(data);
    setMsg("分組已儲存");

    // Update main log panel
    renderStudents();
    renderGroupBoard();
    updateUndoBtn();

    // Close modal
    closeGroupsModal();
  }

  /* -------- groups modal: bind buttons -------- */

  els.applyGroupCountBtn?.addEventListener("click", handleApplyGroupCount);
  els.autoAssignBtn?.addEventListener("click", handleAutoAssign);
  els.clearGroupsBtn?.addEventListener("click", handleClearGroups);
  els.saveGroupsBtn?.addEventListener("click", handleSaveGroups);

  /* -------- groups modal open/close -------- */

  function openGroupsModalWithRender() {
    if (!els.groupsModal) {
      setMsg("找不到 groupsModal（請確認 index.html 有 #groupsModal）");
      return;
    }

    initModalState();
    renderGroupsModalBoard();
    renderGroupsModalStudents();

    els.groupsModal.hidden = false;
    els.groupsModal.removeAttribute("hidden");
    els.groupsModal.setAttribute("aria-hidden", "false");
  }

  function closeGroupsModal() {
    if (!els.groupsModal) return;
    els.groupsModal.hidden = true;
    els.groupsModal.setAttribute("aria-hidden", "true");
  }

  /* -------- logging -------- */

  function pushIndividualEvent(code, delta) {
    data = loadClassData();
    data = ensureGroups(data);

    if (target.kind !== "ind" || !target.studentKey) {
      setMsg("請先點選一位學生");
      return;
    }

    const found = getStudentByKey(data, target.studentKey);

    const entry = {
      ts: Date.now(),
      kind: "ind",
      code,
      delta: Number(delta) || 0,
      studentKey: target.studentKey,
      who: found?.s ? `No.${String(found.s.id || "").padStart(2, "0")} ${(found.s.name || "").trim()}` : "—",
      teacherName: (data.teacherName || "").trim(),
    };

    data.log = Array.isArray(data.log) ? data.log : [];
    data.log.push(entry);

    // 加個人分數
    addPoints(target.studentKey, entry.delta);
    addPackPoints(target.studentKey, entry.delta);
    
    // 同時加該學生所在組別的分數
    const studentGroup = (data.groups || []).find(g => 
      (g.memberKeys || []).includes(target.studentKey)
    );
    if (studentGroup) {
      addGroupPoints(studentGroup.id, entry.delta);
    }

    saveClassData(data);
    setMsg("已記錄（個人）");

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
    const memberCount = memberKeys.length;
    
    // 先獲取 deltaValue
    const deltaValue = Number(delta) || 0;
    
    // 組別分數 = deltaValue × 人數
    const groupPointsDelta = deltaValue * memberCount;

    const entry = {
      ts: Date.now(),
      kind: "grp",
      code,
      delta: deltaValue,
      groupId: group.id,
      groupName: group.name || group.id,
      memberKeys: [...memberKeys],
      teacherName: (data.teacherName || "").trim(),
    };

    data.log = Array.isArray(data.log) ? data.log : [];
    data.log.push(entry);

    // 加組別分數（乘以人數）
    addGroupPoints(group.id, groupPointsDelta);
    
    // 每個組員個人也加該分數
    memberKeys.forEach((k) => {
      addPoints(k, entry.delta);
      addPackPoints(k, entry.delta);
    });

    saveClassData(data);
    setMsg(`已記錄（小組）× ${memberCount} 人 = ${Math.abs(groupPointsDelta)} 分`);

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

    if (last.kind === "ind" && last.studentKey) {
      // 撤銷個人分數
      addPoints(last.studentKey, -(Number(last.delta) || 0));
      
      // 同時撤銷該學生所在組別的分數
      const studentGroup = (data.groups || []).find(g => 
        (g.memberKeys || []).includes(last.studentKey)
      );
      if (studentGroup) {
        addGroupPoints(studentGroup.id, -(Number(last.delta) || 0));
      }
    }

    if (last.kind === "grp" && last.groupId) {
      const memberCount = (last.memberKeys || []).length;
      const groupPointsDelta = (Number(last.delta) || 0) * memberCount;
      
      // 撤銷組別分數（乘以人數）
      addGroupPoints(last.groupId, -groupPointsDelta);
      
      // 撤銷每個組員的個人分數
      (last.memberKeys || []).forEach((k) => addPoints(k, -(Number(last.delta) || 0)));
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

  document.querySelectorAll('.resultBtn[data-kind="ind"][data-code][data-delta]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.getAttribute("data-code");
      const delta = Number(btn.getAttribute("data-delta") || 0);
      if (!code) return;
      pushIndividualEvent(code, delta);
    });
  });

  document.querySelectorAll('.resultBtn[data-kind="grp"][data-code][data-delta]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.getAttribute("data-code");
      const delta = Number(btn.getAttribute("data-delta") || 0);
      if (!code) return;
      pushGroupEvent(code, delta);
    });
  });

  els.undoBtn?.addEventListener("click", undoLast);
  els.clearLogBtn?.addEventListener("click", clearAllLogs);

  els.editGroupsBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    openGroupsModalWithRender();
  });

  els.closeGroupsBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeGroupsModal();
  });

  els.groupsModal?.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-close") === "1") closeGroupsModal();
  });

  // 防止 modal 內的滑動觸發 panel 切換
  els.groupsStudentsList?.addEventListener("touchmove", (e) => {
    e.stopPropagation();
  });
  els.groupsStudentsList?.addEventListener("wheel", (e) => {
    e.stopPropagation();
  }, { passive: false });
  
  els.groupsBoard?.addEventListener("touchmove", (e) => {
    e.stopPropagation();
  });
  els.groupsBoard?.addEventListener("wheel", (e) => {
    e.stopPropagation();
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.groupsModal && !els.groupsModal.hidden) closeGroupsModal();
  });

  els.openSetupBtn?.addEventListener("click", () => {
    window.location.href = "setup.html";
  });

  data = loadClassData();
  data = ensureGroups(data);
  saveClassData(data);

  setTargetNone();
  renderStudents();
  renderGroupBoard();
  updateUndoBtn();

  // Expose scoring functions for tasksPanel integration
  window.nomadAddPoints = function(studentKey, delta) {
    console.log("[logPanel] nomadAddPoints called:", { studentKey, delta });
    
    // Reload data to get latest state
    data = loadClassData();
    data = ensureGroups(data);
    console.log("[logPanel] Data loaded, groups:", data.groups?.length, "students:", data.students?.length);
    
    addPoints(studentKey, delta);
    console.log("[logPanel] Added points, current score:", data.points?.[studentKey]);
    
    const studentGroup = (data.groups || []).find(g => 
      (g.memberKeys || []).includes(studentKey)
    );
    console.log("[logPanel] Found group:", studentGroup?.id, studentGroup?.name);
    
    if (studentGroup) {
      addGroupPoints(studentGroup.id, delta);
      console.log("[logPanel] Added group points, current group score:", data.groupPoints?.[studentGroup.id]);
    }
    
    saveClassData(data);
    console.log("[logPanel] Data saved to localStorage");
    
    // Refresh UI to display updated scores
    renderStudents();
    console.log("[logPanel] renderStudents completed");
    
    renderGroupBoard();
    console.log("[logPanel] renderGroupBoard completed");
  };

  console.log("[logPanel] ready (v3: pill-style groups modal with save)");
})();
