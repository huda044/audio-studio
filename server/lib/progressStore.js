// Penyimpan progres in-memory: jobId → { percent, stage, stagePercent }.
// Client polling GET /api/progress/:jobId selama proses berjalan; entri dihapus
// saat request selesai (route finally) dan otomatis kedaluwarsa via TTL.
//
// `stage` penting untuk import YouTube: prosesnya dua tahap (unduh lalu konversi)
// dan dulu keduanya tampil sebagai satu angka. Akibatnya bilah progres bisa
// "mundur" (unduh 100% → konversi mulai dari 5%) atau diam lama tanpa penjelasan.
// Dengan memisahkan tahap, client bisa menampilkan "Mengunduh 62%" lalu
// "Mengonversi 40%" — jelas sedang apa, bukan sekadar menunggu tanpa kabar.

const store = new Map();
const TTL_MS = Math.max(60000, Number(process.env.PROGRESS_TTL_MS || 15 * 60 * 1000));
const MAX_ENTRIES = 2000;

const STAGES = new Set(['download', 'convert']);

function cleanId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
}

function clampPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 0;
}

// `percent` = progres keseluruhan (dipakai bilah utama).
// `stage`/`stagePercent` opsional: progres tahap yang sedang berjalan.
export function setJobProgress(id, percent, { stage, stagePercent } = {}) {
  const key = cleanId(id);
  if (!key) return;
  const entry = {
    percent: clampPercent(percent),
    ts: Date.now()
  };
  if (stage && STAGES.has(stage)) {
    entry.stage = stage;
    entry.stagePercent = clampPercent(stagePercent === undefined ? percent : stagePercent);
  }
  store.set(key, entry);
  if (store.size > MAX_ENTRIES) pruneJobProgress();
}

// Kembalikan { percent, stage?, stagePercent? }, atau null bila tidak ada / kedaluwarsa.
export function getJobProgress(id) {
  const key = cleanId(id);
  if (!key) return null;
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    store.delete(key);
    return null;
  }
  const result = { percent: entry.percent };
  if (entry.stage) {
    result.stage = entry.stage;
    result.stagePercent = entry.stagePercent;
  }
  return result;
}

export function deleteJobProgress(id) {
  const key = cleanId(id);
  if (key) store.delete(key);
}

export function pruneJobProgress(now = Date.now()) {
  for (const [key, entry] of store.entries()) {
    if (now - entry.ts > TTL_MS) store.delete(key);
  }
}
