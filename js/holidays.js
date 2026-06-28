const $ = (id) => document.getElementById(id);
const HOLIDAY_SOURCE_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv";
const HOLIDAY_STORAGE_KEY = "nippo-holidays-v1";
const HOLIDAY_JSON_PATH = "data/holidays.json";
const MIN_HOLIDAY_YEAR = new Date().getFullYear();

let holidayJson = null;

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1400);
}

function parseHolidayCsv(csv) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map(line => {
    const [dateText, ...nameParts] = line.split(",");
    const dateParts = dateText.trim().split("/").map(Number);
    const date = dateParts.length === 3
      ? `${String(dateParts[0]).padStart(4, "0")}-${String(dateParts[1]).padStart(2, "0")}-${String(dateParts[2]).padStart(2, "0")}`
      : "";
    const name = nameParts.join(",").trim();
    return { date, name };
  }).filter(item => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !item.name) return false;
    return Number(item.date.slice(0, 4)) >= MIN_HOLIDAY_YEAR;
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsArrayBuffer(file);
  });
}

function buildHolidayJson(holidays) {
  return {
    app: "nippo-maker",
    type: "japanese-holidays",
    version: 1,
    source: "内閣府 国民の祝日 CSV",
    sourceUrl: HOLIDAY_SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    holidays
  };
}

function renderHolidays(data) {
  holidayJson = data;
  const rows = data.holidays.map(item => `
    <tr>
      <td>${item.date}</td>
      <td>${item.name}</td>
    </tr>
  `).join("");
  $("holidayRows").innerHTML = rows || '<tr><td colspan="2">祝日データがありません。</td></tr>';
  $("holidayStatus").textContent = `${data.holidays.length}件の祝日を読み込みました。`;
  $("saveHolidaysBtn").disabled = data.holidays.length === 0;
  $("downloadHolidaysBtn").disabled = data.holidays.length === 0;
}

async function loadHolidayJsonFile() {
  try {
    const response = await fetch(HOLIDAY_JSON_PATH, { cache: "no-store" });
    if (!response.ok) return false;
    const data = JSON.parse((await response.text()).replace(/^\uFEFF/, ""));
    if (!data || !Array.isArray(data.holidays)) return false;
    localStorage.setItem(HOLIDAY_STORAGE_KEY, JSON.stringify(data));
    renderHolidays(data);
    $("holidayStatus").textContent = `${data.holidays.length}件のJSONファイルを表示しています。`;
    return true;
  } catch (_) {
    return false;
  }
}

async function fetchHolidays() {
  $("holidayStatus").textContent = "取得中...";
  try {
    const response = await fetch(HOLIDAY_SOURCE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const csv = new TextDecoder("shift_jis").decode(buffer);
    const data = buildHolidayJson(parseHolidayCsv(csv));
    localStorage.setItem(HOLIDAY_STORAGE_KEY, JSON.stringify(data));
    renderHolidays(data);
    showToast("祝日を取得しました");
  } catch (error) {
    $("holidayStatus").textContent = "取得に失敗しました。公式CSVを開いて保存し、CSV選択から読み込んでください。";
    showToast("取得に失敗しました");
  }
}

async function importHolidayCsv(file) {
  if (!file) return;
  try {
    const buffer = await readFileAsArrayBuffer(file);
    const csv = new TextDecoder("shift_jis").decode(buffer);
    const data = buildHolidayJson(parseHolidayCsv(csv));
    localStorage.setItem(HOLIDAY_STORAGE_KEY, JSON.stringify(data));
    renderHolidays(data);
    showToast("CSVを読み込みました");
  } catch (_) {
    $("holidayStatus").textContent = "CSVを読み込めませんでした。";
    showToast("CSVを読み込めませんでした");
  } finally {
    $("holidayCsvFile").value = "";
  }
}

function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "holidays.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function saveJson() {
  if (!holidayJson) return;
  localStorage.setItem(HOLIDAY_STORAGE_KEY, JSON.stringify(holidayJson));

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "holidays.json",
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(holidayJson, null, 2));
      await writable.close();
      showToast("JSONを保存しました");
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  downloadJson(holidayJson);
  showToast("JSONをダウンロードしました");
}

async function loadSavedHolidays() {
  if (await loadHolidayJsonFile()) return;
  try {
    const saved = JSON.parse(localStorage.getItem(HOLIDAY_STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved.holidays)) {
      renderHolidays(saved);
      $("holidayStatus").textContent = `${saved.holidays.length}件の保存済み祝日を表示しています。`;
    }
  } catch (_) {
    localStorage.removeItem(HOLIDAY_STORAGE_KEY);
  }
}

$("fetchHolidaysBtn").addEventListener("click", fetchHolidays);
$("importCsvBtn").addEventListener("click", () => $("holidayCsvFile").click());
$("holidayCsvFile").addEventListener("change", (e) => importHolidayCsv(e.target.files[0]));
$("saveHolidaysBtn").addEventListener("click", saveJson);
$("downloadHolidaysBtn").addEventListener("click", () => {
  if (holidayJson) {
    downloadJson(holidayJson);
    showToast("JSONをダウンロードしました");
  }
});

loadSavedHolidays();
