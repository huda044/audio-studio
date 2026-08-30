// Penyimpan progres konversi in-memory: jobId → persen 0-100.
// Client polling GET /api/progress/:jobId selama konversi berjalan; entri
// dihapus saat request selesai (route finally) dan otomatis kedaluwarsa via TTL.

const store = new Map();
const TTL_MS = Math.max(60000, Number(process.env.PROGRESS_TTL_MS || 15 * 60 * 1000));
const MAX_ENTRIES = 2000;

function cleanId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
}

export function setJobProgress(id, percent) {
  const key = cleanId(id);
  if (!key) return;
  const numeric = Number(percent);
  const clamped = Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 0;
  store.set(key, { percent: clamped, ts: Date.now() });
  if (store.size > MAX_ENTRIES) pruneJobProgress();
}

// Kembalikan persen, atau null bila tidak ada / kedaluwarsa.
export function getJobProgress(id) {
  const key = cleanId(id);
  if (!key) return null;
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.percent;
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
