const monthlyHoursStorageKey = "nippo-monthly-hours-v1";
const holidayStorageKey = "nippo-holidays-v1";
const stateKeys = ["nippo-web-state-v11", "nippo-web-state-v10", "nippo-web-state-v9"];
const holidayJsonPath = "data/holidays.json";
const offTypes = new Set(["", "(全休)", "(祝日)"]);
let records = {};
let holidayMap = new Map();
let settings = { defaultStartTime: "09:00", defaultEndTime: "17:30", defaultBreakTime: "01:00", workPlaceType: "(在宅)" };

function toIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function monthKey(date) { return toIso(date).slice(0, 7); }
function minutesOf(time) {
  if (!/^\d{2}:\d{2}$/.test(time || "")) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
function durationMinutes(start, end) {
  const from = minutesOf(start);
  const to = minutesOf(end);
  if (from === null || to === null) return 0;
  return to >= from ? to - from : 1440 - from + to;
}
function workedMinutes(record) {
  if (!record || record.isActive === false || offTypes.has(record.workPlaceType)) return 0;
  return Math.max(0, durationMinutes(record.startTime, record.endTime) - (minutesOf(record.breakTime) || 0));
}
function formatMinutes(value) {
  const minutes = Math.max(0, Number(value) || 0);
  return `${Math.floor(minutes / 60)}時間${String(minutes % 60).padStart(2, "0")}分`;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char]);
}
function loadData() {
  try { records = JSON.parse(localStorage.getItem(monthlyHoursStorageKey) || "{}"); } catch (_) { records = {}; }
  for (const key of stateKeys) {
    try {
      const state = JSON.parse(localStorage.getItem(key) || "null");
      if (state?.settings) { settings = { ...settings, ...state.settings }; break; }
    } catch (_) { /* 次の保存キーを確認 */ }
  }
}
function normalizeHolidays(data) {
  const list = Array.isArray(data) ? data : data?.holidays;
  return new Map((Array.isArray(list) ? list : []).filter(item => item?.date).map(item => [item.date, item.name || "祝日"]));
}
async function loadHolidays() {
  try {
    const saved = JSON.parse(localStorage.getItem(holidayStorageKey) || "null");
    holidayMap = normalizeHolidays(saved);
  } catch (_) { holidayMap = new Map(); }
  try {
    const response = await fetch(holidayJsonPath, { cache: "no-store" });
    if (response.ok) holidayMap = normalizeHolidays(await response.json());
  } catch (_) { /* file:// では保存済みデータを使う */ }
}
function datesOfMonth(base) {
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return Array.from({ length: last }, (_, index) => new Date(base.getFullYear(), base.getMonth(), index + 1));
}
function isWeekend(date) { return date.getDay() === 0 || date.getDay() === 6; }
function defaultRecord(date) {
  const iso = toIso(date);
  const nonWorking = isWeekend(date) || holidayMap.has(iso);
  return {
    startTime: nonWorking ? "" : settings.defaultStartTime,
    endTime: nonWorking ? "" : settings.defaultEndTime,
    breakTime: nonWorking ? "" : settings.defaultBreakTime,
    workPlaceType: holidayMap.has(iso) ? "(祝日)" : (nonWorking ? "" : settings.workPlaceType),
    isActive: !nonWorking
  };
}
function recordFor(date) { return records[toIso(date)] || defaultRecord(date); }
function isRecorded(iso) { return Object.prototype.hasOwnProperty.call(records, iso); }
function totalsFor(base) {
  let actual = 0;
  let estimated = 0;
  for (const date of datesOfMonth(base)) {
    const iso = toIso(date);
    const record = recordFor(date);
    if (isRecorded(iso)) actual += workedMinutes(record);
    if (isWeekend(date) || holidayMap.has(iso)) {
      if (isRecorded(iso)) estimated += workedMinutes(record);
    } else if (isRecorded(iso)) {
      estimated += workedMinutes(record);
    } else {
      estimated += workedMinutes(defaultRecord(date));
    }
  }
  return { actual, estimated };
}
function statusFor(date, record, recorded) {
  const iso = toIso(date);
  if (holidayMap.has(iso)) return holidayMap.get(iso);
  if (record.workPlaceType === "(全休)") return "全休";
  if (!record.isActive) return "休日";
  if (!recorded) return isWeekend(date) ? "休日" : "未入力";
  return "勤務";
}
function monthPanel(base) {
  const totals = totalsFor(base);
  const title = `${base.getFullYear()}年${base.getMonth() + 1}月`;
  const rows = datesOfMonth(base).map(date => {
    const iso = toIso(date);
    const record = recordFor(date);
    const recorded = isRecorded(iso);
    const holiday = holidayMap.has(iso);
    const nonWorking = record.isActive === false || offTypes.has(record.workPlaceType);
    const rowClass = holiday || date.getDay() === 0 ? "attendance-holiday" : date.getDay() === 6 ? "attendance-saturday" : "";
    return `<tr class="${rowClass}" data-date="${iso}">
      <td class="attendance-date"><span>${date.getMonth() + 1}/${date.getDate()}</span><span class="attendance-weekday">（${["日","月","火","水","木","金","土"][date.getDay()]}）</span></td>
      <td><span class="attendance-status ${recorded ? "" : "is-pending"}">${escapeHtml(statusFor(date, record, recorded))}</span></td>
      <td><input class="attendance-time" data-field="startTime" type="time" value="${escapeHtml(record.startTime)}" ${nonWorking ? "disabled" : ""} aria-label="${iso} 出勤" /></td>
      <td><input class="attendance-time" data-field="endTime" type="time" value="${escapeHtml(record.endTime)}" ${nonWorking ? "disabled" : ""} aria-label="${iso} 退勤" /></td>
      <td><input class="attendance-time" data-field="breakTime" type="time" value="${escapeHtml(record.breakTime)}" ${nonWorking ? "disabled" : ""} aria-label="${iso} 休憩" /></td>
      <td class="attendance-worked">${formatMinutes(workedMinutes(record))}</td>
      <td><select data-field="workPlaceType" aria-label="${iso} 勤務区分">
        ${[["", "休日"],["(在宅)","(在宅)"],["(出社)","(出社)"],["(全休)","(全休)"],["(祝日)","(祝日)"]].map(([value, label]) => `<option value="${value}" ${record.workPlaceType === value ? "selected" : ""}>${label}</option>`).join("")}
      </select></td>
    </tr>`;
  }).join("");
  return `<section class="attendance-panel">
    <div class="attendance-month-head">
      <h2>${title}</h2>
      <div class="attendance-totals">
        <div><span>実働合計勤務時間</span><strong>${formatMinutes(totals.actual)}</strong></div>
        <div><span>想定合計勤務時間</span><strong>${formatMinutes(totals.estimated)}</strong></div>
      </div>
    </div>
    <div class="attendance-table-wrap"><table class="attendance-table">
      <thead><tr><th>日付</th><th>状態</th><th>出勤</th><th>退勤</th><th>休憩</th><th>勤務時間</th><th>勤務区分</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}
function render() {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), 1);
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  document.getElementById("attendanceMonths").innerHTML = monthPanel(current) + monthPanel(previous);
}
function saveRow(row, field, value) {
  const iso = row.dataset.date;
  const date = new Date(`${iso}T00:00:00`);
  const record = { ...recordFor(date), ...(records[iso] || {}) };
  record[field] = value;
  if (field === "workPlaceType") {
    record.isActive = !offTypes.has(value);
    if (record.isActive && (!record.startTime || !record.endTime)) Object.assign(record, defaultRecord(date), { workPlaceType: value, isActive: true });
  } else {
    record.isActive = !offTypes.has(record.workPlaceType);
  }
  records[iso] = record;
  records.monthlyTotals = records.monthlyTotals || {};
  localStorage.setItem(monthlyHoursStorageKey, JSON.stringify(records));
  syncReportState(iso, record);
  render();
  const toast = document.getElementById("toast");
  toast.textContent = "勤怠を保存しました";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1400);
}
function syncReportState(iso, record) {
  for (const key of stateKeys) {
    try {
      const state = JSON.parse(localStorage.getItem(key) || "null");
      if (!state || !Array.isArray(state.daysData)) continue;
      const index = state.daysData.findIndex(day => day?.date === iso);
      if (index < 0) return;
      state.daysData[index] = {
        ...state.daysData[index],
        startTime: record.startTime || "",
        endTime: record.endTime || "",
        breakTime: record.breakTime || "",
        workPlaceType: record.workPlaceType || "",
        isExpanded: record.isActive !== false
      };
      localStorage.setItem(key, JSON.stringify(state));
      return;
    } catch (_) { /* 壊れた旧形式は変更しない */ }
  }
}
document.getElementById("attendanceMonths").addEventListener("change", event => {
  const field = event.target.dataset.field;
  const row = event.target.closest("tr[data-date]");
  if (field && row) saveRow(row, field, event.target.value);
});

(async function init() {
  loadData();
  await loadHolidays();
  render();
})();
