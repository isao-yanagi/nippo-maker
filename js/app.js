const $ = (id) => document.getElementById(id);
    const settingFields = ["baseDate","defaultStartTime","defaultEndTime","defaultBreakTime","projectName","companyName","workPlace","workPlaceType","workContent","impression","skipLabels"];
    const fullDayOffValue = "(全休)";
    const fullDayOffText = "私用に付き全休";
    const holidayValue = "(祝日)";
    const holidayText = "祝日";
    const holidayStorageKey = "nippo-holidays-v1";
    const holidayJsonPath = "data/holidays.json";
    const minHolidayYear = new Date().getFullYear();
    const fullDayOffFields = ["projectName", "companyName", "workPlace", "workContent", "impression"];
    const autoFillWorkPlaceTypes = [fullDayOffValue, holidayValue];
    const defaultValues = {
      defaultStartTime: "09:00",
      defaultEndTime: "17:30",
      defaultBreakTime: "01:00",
      projectName: "◯◯システムの刷新",
      companyName: "XXXXX株式会社",
      workPlace: "丸の内",
      workPlaceType: "(在宅)",
      workContent: "モック画面作成",
      impression: "モック画面作成",
      skipLabels: "Yes"
    };
    let daysData = [];
    let holidayMap = new Map();
    let startupDateValue = "";
    let lastKnownTodayValue = "";
    let autoBaseDate = true;

    function toLocalDateInputValue(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    function parseLocalDate(value) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    function addDays(date, days) {
      const d = new Date(date);
      d.setDate(d.getDate() + days);
      return d;
    }
    function isWeekendDate(date) {
      const day = date.getDay();
      return day === 0 || day === 6;
    }
    function isWeekendIso(iso) {
      return isWeekendDate(parseLocalDate(iso));
    }
    function mondayOfWeek(date) {
      const d = new Date(date);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      return addDays(d, diff);
    }
    function jpWeekday(date) { return ["日","月","火","水","木","金","土"][date.getDay()]; }
    function mmddFromIso(iso) {
      const d = parseLocalDate(iso);
      return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    }
    function weekdayFromIso(iso) { return jpWeekday(parseLocalDate(iso)); }

    function minutesOf(time) {
      if (!time) return null;
      const [h, m] = time.split(":").map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      return h * 60 + m;
    }
    function durationMinutes(start, end) {
      const s = minutesOf(start);
      const e = minutesOf(end);
      if (s === null || e === null) return 0;
      return e >= s ? e - s : (24 * 60 - s) + e;
    }
    function calcOvertime(start, end, breakTime) {
      const base = Math.max(0, durationMinutes($("defaultStartTime").value, $("defaultEndTime").value) - durationMinutes("00:00", $("defaultBreakTime").value || "00:00"));
      const actual = Math.max(0, durationMinutes(start, end) - durationMinutes("00:00", breakTime || "00:00"));
      return Math.max(0, actual - base);
    }
    function overtimeText(minutes) {
      const total = Math.max(0, Number(minutes || 0));
      const h = Math.floor(total / 60);
      const m = total % 60;
      return `${h}h${String(m).padStart(2, "0")}m`;
    }
    function getSettings() {
      return Object.fromEntries(settingFields.map(id => [id, $(id).value]));
    }
    function applySettings(settings) {
      for (const id of settingFields) {
        if (Object.prototype.hasOwnProperty.call(settings, id)) {
          $(id).value = String(settings[id] ?? "");
        }
      }
    }
    function saveState() {
      localStorage.setItem("nippo-web-state-v11", JSON.stringify({
        settings: getSettings(),
        daysData,
        autoBaseDate,
        savedTodayValue: lastKnownTodayValue,
        savedAt: new Date().toISOString()
      }));
    }
    function daysMatchBaseWeek() {
      if (daysData.length !== 7) return false;
      const start = mondayOfWeek(parseLocalDate($("baseDate").value));
      return daysData.every((day, i) => day.date === toLocalDateInputValue(addDays(start, i)));
    }
    function loadState() {
      const today = new Date();
      const todayValue = toLocalDateInputValue(today);
      startupDateValue = todayValue;
      lastKnownTodayValue = todayValue;
      const saved = JSON.parse(localStorage.getItem("nippo-web-state-v11") || localStorage.getItem("nippo-web-state-v10") || localStorage.getItem("nippo-web-state-v9") || localStorage.getItem("nippo-web-state-v8") || localStorage.getItem("nippo-web-state-v6") || localStorage.getItem("nippo-web-state-v4") || localStorage.getItem("nippo-web-state-v3") || "{}");
      const settings = saved.settings || {};
      const savedBaseDate = settings.baseDate || "";
      const yesterdayValue = toLocalDateInputValue(addDays(today, -1));
      const isLegacyAutoBaseDate = !Object.prototype.hasOwnProperty.call(saved, "autoBaseDate") && (!savedBaseDate || savedBaseDate === todayValue || savedBaseDate === yesterdayValue);
      autoBaseDate = Object.prototype.hasOwnProperty.call(saved, "autoBaseDate") ? saved.autoBaseDate !== false : isLegacyAutoBaseDate;
      for (const id of settingFields) {
        if (id === "baseDate") $(id).value = autoBaseDate ? todayValue : (settings[id] || todayValue);
        else $(id).value = settings[id] ?? defaultValues[id] ?? "";
      }
      daysData = Array.isArray(saved.daysData) ? saved.daysData : [];
      daysData = daysData.map(day => {
        const breakTime = day.breakTime || $("defaultBreakTime").value || "01:00";
        const normalized = {
          ...day,
          breakTime,
          isExpanded: Object.prototype.hasOwnProperty.call(day, "isExpanded") ? day.isExpanded : !isWeekendIso(day.date),
          overtimeMinutes: calcOvertime(day.startTime, day.endTime, breakTime)
        };
        if (isWeekendIso(normalized.date) && !normalized.isExpanded) clearDayValues(normalized);
        return normalized;
      });
      if (!daysMatchBaseWeek()) createDaysData(false);
      else saveState();
    }

    function createDaysData(render = true) {
      const s = getSettings();
      const start = mondayOfWeek(parseLocalDate(s.baseDate));
      daysData = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(start, i);
        const item = {
          date: toLocalDateInputValue(d),
          startTime: s.defaultStartTime,
          endTime: s.defaultEndTime,
          breakTime: s.defaultBreakTime,
          isExpanded: !isWeekendDate(d),
          projectName: s.projectName,
          companyName: s.companyName,
          workPlace: s.workPlace,
          workPlaceType: s.workPlaceType,
          workContent: s.workContent,
          impression: s.impression,
          overtimeMinutes: 0
        };
        applyWorkPlaceTypeValues(item);
        applyJsonHolidayValues(item);
        item.overtimeMinutes = calcOvertime(item.startTime, item.endTime, item.breakTime);
        if (isWeekendDate(d) && !item.isExpanded) clearDayValues(item);
        return item;
      });
      if (render) renderDays();
      saveState();
    }

    function applyFullDayOffValues(day) {
      for (const field of fullDayOffFields) {
        day[field] = fullDayOffText;
      }
    }

    function applyHolidayValues(day) {
      for (const field of fullDayOffFields) {
        day[field] = holidayText;
      }
    }

    function applyWorkPlaceTypeValues(day) {
      if (day.workPlaceType === fullDayOffValue) {
        applyFullDayOffValues(day);
      } else if (day.workPlaceType === holidayValue) {
        applyHolidayValues(day);
      }
    }

    function applyDefaultWorkValues(day) {
      const settings = getSettings();
      for (const field of fullDayOffFields) {
        day[field] = settings[field];
      }
    }
    function clearDayValues(day) {
      day.startTime = "";
      day.endTime = "";
      day.breakTime = "";
      day.projectName = "";
      day.companyName = "";
      day.workPlace = "";
      day.workPlaceType = "";
      day.workContent = "";
      day.impression = "";
      day.overtimeMinutes = "";
    }
    function applyInitialValues(day) {
      const settings = getSettings();
      day.startTime = settings.defaultStartTime || defaultValues.defaultStartTime;
      day.endTime = settings.defaultEndTime || defaultValues.defaultEndTime;
      day.breakTime = settings.defaultBreakTime || defaultValues.defaultBreakTime;
      day.projectName = settings.projectName || defaultValues.projectName;
      day.companyName = settings.companyName || defaultValues.companyName;
      day.workPlace = settings.workPlace || defaultValues.workPlace;
      day.workPlaceType = settings.workPlaceType || defaultValues.workPlaceType;
      day.workContent = settings.workContent || defaultValues.workContent;
      day.impression = settings.impression || defaultValues.impression;
      applyWorkPlaceTypeValues(day);
      applyJsonHolidayValues(day);
      day.overtimeMinutes = calcOvertime(day.startTime, day.endTime, day.breakTime);
    }

    function updateDay(index, key, value) {
      const previousWorkPlaceType = daysData[index].workPlaceType;
      daysData[index][key] = key === "isExpanded" ? value === true || value === "true" : value;
      if (key === "isExpanded") {
        if (isWeekendIso(daysData[index].date)) {
          if (daysData[index].isExpanded) applyInitialValues(daysData[index]);
          else clearDayValues(daysData[index]);
        }
        renderDays();
      } else
      if (key === "startTime" || key === "endTime" || key === "breakTime") {
        daysData[index].overtimeMinutes = calcOvertime(daysData[index].startTime, daysData[index].endTime, daysData[index].breakTime);
        renderDays();
      } else if (key === "date" || key === "workPlaceType") {
        if (key === "date") {
          applyJsonHolidayValues(daysData[index]);
        } else if (key === "workPlaceType") {
          if (autoFillWorkPlaceTypes.includes(value)) {
            applyWorkPlaceTypeValues(daysData[index]);
          } else if (autoFillWorkPlaceTypes.includes(previousWorkPlaceType)) {
            applyDefaultWorkValues(daysData[index]);
          }
        }
        renderDays();
      } else {
        updateOutput();
      }
      saveState();
    }
    function resetDayField(index, key) {
      if (!daysData[index]) return;
      daysData[index][key] = getSettings()[key] ?? defaultValues[key] ?? "";
      renderDays();
      saveState();
    }

    function escapeHtml(str) {
      return String(str ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
    }

    function normalizeHolidayData(data) {
      const holidays = Array.isArray(data) ? data : data?.holidays;
      if (!Array.isArray(holidays)) return [];
      return holidays
        .map(item => {
          const date = typeof item === "string" ? item : item?.date;
          const name = typeof item === "string" ? holidayText : item?.name;
          return { date: String(date ?? ""), name: String(name || holidayText) };
        })
        .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number(item.date.slice(0, 4)) >= minHolidayYear);
    }

    function applyJsonHolidayValues(day) {
      const holidayName = holidayMap.get(day.date);
      if (!holidayName) return false;
      const holidayLabel = `${holidayText}・${holidayName}`;
      day.workPlaceType = holidayValue;
      day.projectName = holidayLabel;
      day.companyName = holidayLabel;
      day.workPlace = holidayLabel;
      day.workContent = holidayLabel;
      day.impression = holidayLabel;
      return true;
    }

    function applyJsonHolidayValuesToDays() {
      let changed = false;
      for (const day of daysData) {
        if (!isDayActive(day)) continue;
        changed = applyJsonHolidayValues(day) || changed;
      }
      return changed;
    }

    async function loadHolidays() {
      let holidays = [];
      try {
        const response = await fetch(holidayJsonPath, { cache: "no-store" });
        if (response.ok) {
          const data = JSON.parse((await response.text()).replace(/^\uFEFF/, ""));
          holidays = normalizeHolidayData(data);
          if (holidays.length) localStorage.setItem(holidayStorageKey, JSON.stringify(data));
        }
      } catch (_) {
        // file:// や未作成ファイルでは失敗するため、ブラウザ保存済みデータを使う。
      }

      if (!holidays.length) {
        try {
          holidays = normalizeHolidayData(JSON.parse(localStorage.getItem(holidayStorageKey) || "null"));
        } catch (_) {
          holidays = [];
        }
      }

      holidayMap = new Map(holidays.map(item => [item.date, item.name]));
      if (holidayMap.size) {
        if (applyJsonHolidayValuesToDays()) saveState();
        renderDays();
        scrollStartupDateToTop();
      }
    }

    function dayCardClass(day) {
      const weekday = parseLocalDate(day.date).getDay();
      if (holidayMap.has(day.date)) return " day-card-holiday";
      if (weekday === 6) return " day-card-saturday";
      if (weekday === 0) return " day-card-sunday";
      return "";
    }

    function extraCopyButton(day) {
      const weekday = parseLocalDate(day.date).getDay();
      if (weekday === 5) {
        return '<button class="secondary small-btn" type="button" id="copyWeekdaysBtn" data-copy-mode="weekdays">copy：月〜金</button>';
      }
      if (weekday === 0) {
        return '<button class="secondary small-btn" type="button" id="copyAllBtn" data-copy-mode="all">copy：月〜日</button>';
      }
      return "";
    }
    function isDayActive(day) {
      return !isWeekendIso(day.date) || day.isExpanded === true;
    }
    function weekendAccordionButton(day, index) {
      const expanded = day.isExpanded === true;
      return `<span class="weekend-toggle-label">${expanded ? "クリックで閉じる" : "クリックで入力"}</span>`;
    }

    function renderDays() {
      const root = $("days");
      root.innerHTML = daysData.map((day, i) => {
        const active = isDayActive(day);
        return `
        <article class="day-card${dayCardClass(day)}" data-day-date="${day.date}">
          <div class="day-head${isWeekendIso(day.date) ? " weekend-toggle-head" : ""}" ${isWeekendIso(day.date) ? `data-toggle-weekend="${i}" role="button" tabindex="0" aria-expanded="${active}"` : ""}>
            <div class="day-title">
              <h3>${mmddFromIso(day.date)}(${weekdayFromIso(day.date)})</h3>
              ${!active ? '<span class="day-status">未入力</span>' : ""}
              ${isWeekendIso(day.date) ? weekendAccordionButton(day, i) : ""}
            </div>
            <div class="day-copy-actions">
              ${extraCopyButton(day)}
              ${active ? `<button class="secondary small-btn" type="button" data-copy-day="${i}">copy：${weekdayFromIso(day.date)}</button>` : ""}
            </div>
          </div>
          <div class="day-body${active ? "" : " day-body-collapsed"}">
            <div class="col-2"><label>開始</label><input type="time" value="${day.startTime}" data-i="${i}" data-key="startTime"></div>
            <div class="col-2"><label>終了</label><input type="time" value="${day.endTime}" data-i="${i}" data-key="endTime"></div>
            <div class="col-2"><label>休憩時間</label><input type="time" value="${day.breakTime || $('defaultBreakTime').value || '01:00'}" data-i="${i}" data-key="breakTime"></div>
            <div class="col-3 overtime-field"><label>残業時間</label><div class="calculated-value">${overtimeText(day.overtimeMinutes)}</div></div>
            <div class="col-4"><label>PJ名</label><input value="${escapeHtml(day.projectName)}" data-i="${i}" data-key="projectName"></div>
            <div class="col-4"><label>常駐先企業名</label><input value="${escapeHtml(day.companyName)}" data-i="${i}" data-key="companyName"></div>
            <div class="col-2"><label>出社場所</label><input value="${escapeHtml(day.workPlace)}" data-i="${i}" data-key="workPlace"></div>
            <div class="col-2"><label>勤務場所</label><select data-i="${i}" data-key="workPlaceType">
              <option value="(在宅)" ${day.workPlaceType === "(在宅)" ? "selected" : ""}>(在宅)</option>
              <option value="(出社)" ${day.workPlaceType === "(出社)" ? "selected" : ""}>(出社)</option>
              <option value="(全休)" ${day.workPlaceType === "(全休)" ? "selected" : ""}>(全休)</option>
              <option value="(祝日)" ${day.workPlaceType === "(祝日)" ? "selected" : ""}>(祝日)</option>
            </select></div>
            <div class="col-6"><label>作業内容</label><textarea data-i="${i}" data-key="workContent">${escapeHtml(day.workContent)}</textarea></div>
            <div class="col-6 field-with-action"><label>所感</label><textarea data-i="${i}" data-key="impression">${escapeHtml(day.impression)}</textarea><button class="ghost small-btn field-reset-btn" type="button" data-reset-field="impression" data-i="${i}">リセット</button></div>
          </div>
        </article>`;
      }).join("");

      root.querySelectorAll("input[data-key], select[data-key], textarea[data-key]").forEach(el => {
        el.addEventListener("input", () => updateDay(Number(el.dataset.i), el.dataset.key, el.value));
        el.addEventListener("change", () => updateDay(Number(el.dataset.i), el.dataset.key, el.value));
      });
      root.querySelectorAll("button[data-copy-day]").forEach(btn => {
        btn.addEventListener("click", () => copyText("day", Number(btn.dataset.copyDay)));
      });
      root.querySelectorAll("button[data-copy-mode]").forEach(btn => {
        btn.addEventListener("click", () => copyText(btn.dataset.copyMode));
      });
      root.querySelectorAll("button[data-reset-field]").forEach(btn => {
        btn.addEventListener("click", () => resetDayField(Number(btn.dataset.i), btn.dataset.resetField));
      });
      root.querySelectorAll(".weekend-toggle-head[data-toggle-weekend]").forEach(head => {
        const toggle = () => updateDay(Number(head.dataset.toggleWeekend), "isExpanded", head.getAttribute("aria-expanded") !== "true");
        head.addEventListener("click", (event) => {
          if (event.target.closest("button")) return;
          toggle();
        });
        head.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggle();
        });
      });
      updateOutput();
    }

    function scrollStartupDateToTop() {
      const date = startupDateValue || $("baseDate").value;
      const target = document.querySelector(`.day-card[data-day-date="${date}"] .day-head`);
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, left: 0, behavior: "auto" });
    }

    function scheduleStartupDateScroll() {
      const run = () => {
        scrollStartupDateToTop();
        setTimeout(scrollStartupDateToTop, 100);
        setTimeout(scrollStartupDateToTop, 350);
      };
      if (document.readyState === "complete") run();
      else window.addEventListener("load", run, { once: true });
    }

    function refreshAutoBaseDateIfNeeded() {
      const todayValue = toLocalDateInputValue(new Date());
      if (todayValue === lastKnownTodayValue) return;
      const previousTodayValue = lastKnownTodayValue;
      lastKnownTodayValue = todayValue;
      if (!autoBaseDate && $("baseDate").value !== previousTodayValue) {
        saveState();
        return;
      }
      autoBaseDate = true;
      $("baseDate").value = todayValue;
      startupDateValue = todayValue;
      createDaysData(true);
    }

    function buildText(mode = "all", dayIndex = null) {
      const skipLabels = $("skipLabels").value;
      const targetDays = (mode === "day" ? [daysData[dayIndex]].filter(Boolean) : (mode === "weekdays" ? daysData.slice(0, 5) : daysData)).filter(isDayActive);
      const lines = [];
      for (const day of targetDays) {
        if (skipLabels === "Yes") {
          lines.push(`①${mmddFromIso(day.date)}(${weekdayFromIso(day.date)}) ${day.startTime}～${day.endTime}`);
          lines.push(`②${day.projectName} / ${day.companyName} / ${day.workPlace}${day.workPlaceType}`);
          lines.push(`③${day.workContent}`);
          lines.push(`④${day.impression}`);
          lines.push(`⑤${overtimeText(day.overtimeMinutes)}`);
        } else {
          lines.push("①出退勤(in-out)");
          lines.push(`  ${mmddFromIso(day.date)}(${weekdayFromIso(day.date)}) ${day.startTime}～${day.endTime}`);
          lines.push("② PJ 名 / 常駐先企業名 / 出社場所(当日の勤務場所 出社 or 在宅 or 全休 or 祝日)");
          lines.push(`  ${day.projectName} / ${day.companyName} / ${day.workPlace} / ${day.workPlaceType}`);
          lines.push("③作業内容");
          lines.push(`  ${day.workContent}`);
          lines.push("④所感(現場の状況などを記載)");
          lines.push(`  ${day.impression}`);
          lines.push("⑤残業");
          lines.push(`  ${overtimeText(day.overtimeMinutes)}`);
        }
        lines.push("-------------------------------------------");
      }
      return lines.join("\n");
    }

    function updateOutput() {
      const text = buildText();
      saveState();
      return text;
    }

    function fallbackCopy(text) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }

    function exportSettings() {
      const data = {
        app: "nippo-maker",
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: getSettings()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = toLocalDateInputValue(new Date());
      a.href = url;
      a.download = `nippo-settings-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("初期設定をエクスポートしました");
    }

    function normalizeImportedSettings(data) {
      const source = data && typeof data === "object" && data.settings && typeof data.settings === "object" ? data.settings : data;
      if (!source || typeof source !== "object") return null;
      const settings = {};
      for (const id of settingFields) {
        if (Object.prototype.hasOwnProperty.call(source, id)) {
          settings[id] = source[id];
        }
      }
      return Object.keys(settings).length ? settings : null;
    }

    function importSettingsFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        try {
          const settings = normalizeImportedSettings(JSON.parse(reader.result));
          if (!settings) {
            showToast("初期設定ファイルを読み込めませんでした");
            return;
          }
          applySettings(settings);
          daysData = daysData.map(day => ({
            ...day,
            overtimeMinutes: calcOvertime(day.startTime, day.endTime, day.breakTime)
          }));
          renderDays();
          saveState();
          showToast("初期設定をインポートしました");
        } catch (_) {
          showToast("初期設定ファイルを読み込めませんでした");
        } finally {
          $("importSettingsFile").value = "";
        }
      });
      reader.addEventListener("error", () => {
        $("importSettingsFile").value = "";
        showToast("初期設定ファイルを読み込めませんでした");
      });
      reader.readAsText(file);
    }

    async function copyText(mode = "all", dayIndex = null) {
      const text = buildText(mode, dayIndex);
      saveState();

      // file:// で直接開いた場合、Clipboard API はブラウザ側で警告や拒否が出ることがあるため、
      // ローカルファイルでは最初から execCommand のフォールバックでコピーする。
      let copied = false;
      if (location.protocol !== "file:" && navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch (_) {
          copied = fallbackCopy(text);
        }
      } else {
        copied = fallbackCopy(text);
      }

      showToast(copied ? (mode === "day" ? "この日をコピーしました" : "コピーしました") : "コピーに失敗しました");
    }

    function showToast(message) {
      const toast = $("toast");
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1400);
    }

    function resetForm() {
      localStorage.removeItem("nippo-web-state-v11");
      localStorage.removeItem("nippo-web-state-v10");
      localStorage.removeItem("nippo-web-state-v9");
      localStorage.removeItem("nippo-web-state-v8");
      localStorage.removeItem("nippo-web-state-v6");
      localStorage.removeItem("nippo-web-state-v4");
      localStorage.removeItem("nippo-web-state-v3");
      loadState();
      renderDays();
    }

    loadState();
    renderDays();
    loadHolidays();
    scheduleStartupDateScroll();

    function handleSettingChange(id) {
      if (id === "baseDate") {
        autoBaseDate = $("baseDate").value === lastKnownTodayValue;
      }
      if (["defaultStartTime", "defaultEndTime", "defaultBreakTime"].includes(id)) {
        daysData = daysData.map(day => ({ ...day, overtimeMinutes: calcOvertime(day.startTime, day.endTime, day.breakTime) }));
        renderDays();
      } else {
        updateOutput();
      }
      saveState();
    }

    function openSettings() {
      document.body.classList.add("drawer-open");
      $("openSettingsBtn").setAttribute("aria-expanded", "true");
    }
    function closeSettings() {
      document.body.classList.remove("drawer-open");
      $("openSettingsBtn").setAttribute("aria-expanded", "false");
    }

    settingFields.forEach(id => {
      $(id).addEventListener("input", () => handleSettingChange(id));
      $(id).addEventListener("change", () => handleSettingChange(id));
    });
    setInterval(refreshAutoBaseDateIfNeeded, 30000);
    window.addEventListener("beforeunload", saveState);
    $("openSettingsBtn").addEventListener("click", openSettings);
    $("closeSettingsBtn").addEventListener("click", closeSettings);
    $("drawerOverlay").addEventListener("click", closeSettings);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSettings(); });
    $("createBtn").addEventListener("click", () => { createDaysData(true); closeSettings(); });
    $("exportSettingsBtn").addEventListener("click", exportSettings);
    $("importSettingsBtn").addEventListener("click", () => $("importSettingsFile").click());
    $("importSettingsFile").addEventListener("change", (e) => importSettingsFile(e.target.files[0]));
    $("resetBtn").addEventListener("click", resetForm);
