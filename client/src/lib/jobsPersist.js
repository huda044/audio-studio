// Persist hasil konversi supaya tahan refresh halaman.
//
// Kunci desain: file hasil di server hanya hidup 3 jam (sweep otomatis), jadi kita
// menyimpan METADATA part + audioUrl (path file server) — BUKAN audioDataUrl
// (base64 yang bisa puluhan MB dan meledaki localStorage). Setelah dipulihkan,
// audio tetap bisa diputar/diunduh/di-upload lewat /api/files/... sampai kadaluarsa.

const JOBS_KEY = 'audio-studio-jobs';
export { JOBS_KEY };
export const SERVER_FILE_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_STORED_JOBS = 10;

// Ambil hanya job 'done', lepas audioDataUrl, batasi jumlahnya.
// Mengembalikan string JSON siap simpan, atau null bila tidak ada yang layak.
export function sanitizeJobsForStorage(jobs = []) {
  const done = jobs.filter((j) => j.status === 'done' && j.processed?.parts?.length);
  if (!done.length) return null;
  return JSON.stringify({
    savedAt: Date.now(),
    jobs: done.slice(-MAX_STORED_JOBS).map((j) => ({
      id: j.id,
      title: j.title,
      status: 'done',
      restored: true,
      progress: { percent: 100, stage: '', message: '' },
      partStatus: j.partStatus || {},
      error: '',
      processed: {
        ...j.processed,
        parts: (j.processed.parts || []).map(({ audioDataUrl: _drop, ...rest }) => rest)
      }
    }))
  });
}

export function loadRestoredJobs() {
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    if (!raw) return { jobs: [], savedAt: 0 };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.jobs)) return { jobs: [], savedAt: 0 };
    const jobs = parsed.jobs.filter((j) => j && j.processed && Array.isArray(j.processed.parts) && j.processed.parts.length);
    return { jobs, savedAt: Number(parsed.savedAt) || 0 };
  } catch {
    return { jobs: [], savedAt: 0 };
  }
}

export function clearStoredJobs() {
  try { localStorage.removeItem(JOBS_KEY); } catch { /* storage penuh/blokir */ }
}

export function serverFileRemainingMs(savedAt) {
  if (!savedAt) return 0;
  return SERVER_FILE_TTL_MS - (Date.now() - savedAt);
}

export function formatRemaining(ms) {
  if (ms <= 0) return 'kadaluarsa';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `±${h}j ${m}m` : `±${m}m`;
}
