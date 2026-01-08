(function(){
  const form = document.getElementById("loginForm");
  const school = document.getElementById("schoolCode");
  const cls = document.getElementById("className");
  const year = document.getElementById("schoolYear");
  const err = document.getElementById("errorBox");

  if (!form || !school || !cls || !year) return;

  function setError(msg){
    err.textContent = msg || "";
  }

  function normSchool(v){
    // 只允許 A-Z 0-9，轉大寫
    return (v || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function normClass(v){
    // 允許 A-Z 0-9，轉大寫（班級可能 6A / 601）
    return (v || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function normYear(v){
    // 只允許數字
    return (v || "").replace(/[^0-9]/g, "");
  }

  // 事件：輸入時即清洗
  school.addEventListener("input", () => {
    const before = school.value;
    school.value = normSchool(before);
    if (school.value.length >= 4) cls.focus(); // 常見 4 碼，先做自動跳格
  });

  cls.addEventListener("input", () => {
    const before = cls.value;
    cls.value = normClass(before);
    if (cls.value.length >= 3) year.focus(); // 6A/601 通常 2~3+，先給個跳格體驗
  });

  year.addEventListener("input", () => {
    const before = year.value;
    year.value = normYear(before).slice(0,4);
  });

  // Enter 時：如果在前兩格，也能往下一格
  [school, cls].forEach((el, i) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        (i === 0 ? cls : year).focus();
      }
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    setError("");

    const s = normSchool(school.value).trim();
    const c = normClass(cls.value).trim();
    const y = normYear(year.value).trim();

    // --- C) 錯誤提示與規則 ---
    if (!s) return setError("請輸入學校英文簡稱（例如：CQES）");
    if (s.length < 2) return setError("學校英文簡稱至少 2 碼（例如：CQES）");

    if (!c) return setError("請輸入班級（例如：601 或 6A）");
    if (c.length < 2) return setError("班級至少 2 碼（例如：601 或 6A）");

    if (!y) return setError("請輸入學年度（3 位數，例如：114）");
    if (y.length !== 3) return setError("學年度需為 3 位數（例如：114）");

    const classCode = `${s}-${c}-${y}`;

    // ✅ 存登入狀態
    localStorage.setItem("nomad.currentClassCode", classCode);

    // ✅ 準備 class 空殼資料（避免後面讀不到）
    const storageKey = `nomad.class.${classCode}`;
    if (!localStorage.getItem(storageKey)) {
      localStorage.setItem(storageKey, JSON.stringify({
        classCode,
        createdAt: Date.now(),
        students: [],
        tasks: [],
        log: []
      }));
    }

    // ✅ 導向 dashboard
    window.location.href = "index.html";
  });

})();