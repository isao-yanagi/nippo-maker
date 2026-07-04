const $ = (id) => document.getElementById(id);
const ATTENDANCE_STORAGE_KEY = "nippo-attendance-history-v1";
const CURRENT_STATE_KEYS = [
  "nippo-web-state-v11",
  "nippo-web-state-v10",
  "nippo-web-state-v9",
  "nippo-web-state-v8",
  "nippo-web-state-v6",
  "nippo-web-state-v4",
  "nippo-web-state-v3"
];
const DELETED_ATTENDANCE_KEY = "nippo-attendance-deleted-v1";

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

function jpWeekday(date) {
  return ["\u65e5", "\u6708", "\u706b", "\u6c34", "\u6728", "\u91d1", "\u571f"][date.getDay()];
}

function dateLabel(iso) {
  const date = parseLocalDate(iso);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}\uff08${jpWeekday(date)}\uff09`;
}

function overtimeText(minutes) {
  if (minutes === "" || minutes === null || minutes === undefined) return "";
  const total = Math.max(0, Number(minutes || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function minutesOf(time) {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function durationMinutes(start, end) {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === null || e === null) return null;
  return e >= s ? e - s : (24 * 60 - s) + e;
}

function workTimeText(day) {
  const total = workMinutes(day);
  if (total === null) return "";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function workMinutes(day) {
  if (!day?.startTime || !day?.endTime) return null;
  const worked = durationMinutes(day.startTime, day.endTime);
  const breakMinutes = durationMinutes("00:00", day.breakTime || "00:00") ?? 0;
  if (worked === null) return null;
  return Math.max(0, worked - breakMinutes);
}

function loadBaseWorkMinutes() {
  for (const key of CURRENT_STATE_KEYS) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      const settings = saved?.settings;
      if (!settings) continue;
      const worked = durationMinutes(settings.defaultStartTime || "09:00", settings.defaultEndTime || "17:30");
      const breakMinutes = durationMinutes("00:00", settings.defaultBreakTime || "01:00") ?? 0;
      if (worked !== null) return Math.max(0, worked - breakMinutes);
    } catch (_) {
      // Ignore old or partially written state.
    }
  }
  return Math.max(0, durationMinutes("09:00", "17:30") - durationMinutes("00:00", "01:00"));
}

function overtimeDisplayText(day, baseWorkMinutes) {
  const total = workMinutes(day);
  if (total === null) return "";
  return overtimeText(Math.max(0, total - baseWorkMinutes));
}

function hasAttendanceInput(day) {
  return Boolean(day && (day.startTime || day.endTime || day.breakTime));
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}

function normalizeDay(day) {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day.date || "")) return null;
  return {
    date: day.date,
    startTime: day.startTime || "",
    endTime: day.endTime || "",
    breakTime: day.breakTime || "",
    overtimeMinutes: Number.isFinite(Number(day.overtimeMinutes)) ? Number(day.overtimeMinutes) : ""
  };
}

function loadDeletedDates() {
  try {
    const dates = JSON.parse(localStorage.getItem(DELETED_ATTENDANCE_KEY) || "[]");
    return new Set(Array.isArray(dates) ? dates.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)) : []);
  } catch (_) {
    return new Set();
  }
}

function saveDeletedDates(dates) {
  localStorage.setItem(DELETED_ATTENDANCE_KEY, JSON.stringify(Array.from(dates).sort()));
}

function loadHistoryDays() {
  const merged = new Map();
  const deletedDates = loadDeletedDates();

  try {
    const saved = JSON.parse(localStorage.getItem(ATTENDANCE_STORAGE_KEY) || "null");
    const days = Array.isArray(saved?.days) ? saved.days : [];
    for (const day of days) {
      const normalized = normalizeDay(day);
      if (normalized && !deletedDates.has(normalized.date)) merged.set(normalized.date, normalized);
    }
  } catch (_) {
    localStorage.removeItem(ATTENDANCE_STORAGE_KEY);
  }

  for (const key of CURRENT_STATE_KEYS) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      const days = Array.isArray(saved?.daysData) ? saved.daysData : [];
      for (const day of days) {
        const normalized = normalizeDay(day);
        if (normalized && !deletedDates.has(normalized.date)) merged.set(normalized.date, normalized);
      }
      if (days.length) break;
    } catch (_) {
      // Ignore old or partially written state.
    }
  }

  return merged;
}

function saveHistoryDays(history) {
  const days = Array.from(history.values()).sort((a, b) => a.date.localeCompare(b.date));
  localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify({
    app: "nippo-maker",
    version: 1,
    updatedAt: new Date().toISOString(),
    days
  }));
}

function clearCurrentStateDay(iso) {
  for (const key of CURRENT_STATE_KEYS) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (!saved || !Array.isArray(saved.daysData)) continue;
      let changed = false;
      const daysData = saved.daysData.map(day => {
        if (day?.date !== iso) return day;
        changed = true;
        return {
          ...day,
          startTime: "",
          endTime: "",
          breakTime: "",
          overtimeMinutes: ""
        };
      });
      if (changed) {
        localStorage.setItem(key, JSON.stringify({ ...saved, daysData }));
      }
    } catch (_) {
      // Ignore old or partially written state.
    }
  }
}

function deleteAttendanceDay(iso) {
  const deletedDates = loadDeletedDates();
  deletedDates.add(iso);
  saveDeletedDates(deletedDates);
  const history = loadHistoryDays();
  history.delete(iso);
  saveHistoryDays(history);
  clearCurrentStateDay(iso);
  renderAttendance();
}

function buildDateRange() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const dates = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    dates.push(toLocalDateInputValue(date));
  }
  return dates.sort((a, b) => a.localeCompare(b));
}

function rowClass(iso) {
  const weekday = parseLocalDate(iso).getDay();
  if (weekday === 6) return " class=\"attendance-saturday\"";
  if (weekday === 0) return " class=\"attendance-sunday\"";
  return "";
}

function renderAttendance() {
  const history = loadHistoryDays();
  const dates = buildDateRange();
  const baseWorkMinutes = loadBaseWorkMinutes();
  let filledCount = 0;

  const rows = dates.map(iso => {
    const day = history.get(iso);
    const hasInput = hasAttendanceInput(day);
    if (hasInput) filledCount += 1;
    return `
      <tr${rowClass(iso)} data-attendance-date="${iso}">
        <td>${dateLabel(iso)}</td>
        <td>${escapeHtml(day?.startTime || "")}</td>
        <td>${escapeHtml(day?.endTime || "")}</td>
        <td>${escapeHtml(day?.breakTime || "")}</td>
        <td>${workTimeText(day)}</td>
        <td>${overtimeDisplayText(day, baseWorkMinutes)}</td>
        <td>${hasInput ? `<button class="ghost attendance-delete-btn" type="button" data-delete-date="${iso}" aria-label="${dateLabel(iso)}を削除">×</button>` : ""}</td>
      </tr>
    `;
  }).join("");

  $("attendanceRows").innerHTML = rows;
  $("attendanceSummary").textContent = `${dateLabel(dates[dates.length - 1])} \u304b\u3089 ${dateLabel(dates[0])} \u307e\u3067 / \u5165\u529b\u6e08\u307f ${filledCount}\u65e5`;
  $("attendanceRows").querySelectorAll("button[data-delete-date]").forEach(button => {
    button.addEventListener("click", () => deleteAttendanceDay(button.dataset.deleteDate));
  });
}

function scrollTodayIntoView() {
  const today = toLocalDateInputValue(new Date());
  const row = document.querySelector(`tr[data-attendance-date="${today}"]`);
  if (!row) return;
  row.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
}

renderAttendance();
window.addEventListener("load", () => {
  scrollTodayIntoView();
  setTimeout(scrollTodayIntoView, 100);
});
