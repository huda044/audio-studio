import { useRef, useState, useEffect, useMemo } from 'react';
import {
  UploadCloud, FileAudio, Wand2, Loader2, Sliders, ChevronDown, Rocket, Scissors, Copy, Trash2, Download, RotateCw, XCircle, Youtube, Code2
} from 'lucide-react';
import { useApp } from '../App.jsx';
import { Card, Slider, Toggle, MagneticButton } from '../components/ui.jsx';
import { makeZip } from '../lib/zip.js';
import { PRESETS, EQ_PRESETS, ACCEPTED_EXT, API_BASE } from '../lib/constants.js';
import { playDoneChime, flashTabTitle } from '../lib/doneChime.js';
import { processAudio, fetchPartBlob, uploadRoblox, importYouTube, deleteFile, fetchProgress } from '../lib/api.js';
import { cleanRobloxId, robloxPlaybackSpeed, uid, formatApiError } from '../lib/utils.js';
import { formatDuration } from '../lib/format.js';
import {
  sanitizeJobsForStorage, loadRestoredJobs, clearStoredJobs, serverFileRemainingMs, formatRemaining, JOBS_KEY
} from '../lib/jobsPersist.js';

const ACCEPT_RE = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;

// Kunci unik untuk state pilihan part (checkbox upload): "<jobId>:<partIndex>".
function partKey(jobId, index) { return `${jobId}:${index}`; }

function newJob(file) {
  return {
    id: uid('j'), file, title: file.name.replace(/\.[^.]+$/, ''),
    status: 'queued', progress: { percent: 0, stage: '', message: '' },
    processed: null, partStatus: {}, error: ''
  };
}

export default function ConvertPage() {
  const { settings, setSettings, roblox, setHistory, history, notify, goto, customPresets, setCustomPresets } = useApp();
  const [jobs, setJobs] = useState([]);
  const [description, setDescription] = useState('');
  const [drag, setDrag] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState('');
  const [uploadLabel, setUploadLabel] = useState('');
  const [sourceMode, setSourceMode] = useState('file'); // 'file' | 'youtube'
  const [ytUrl, setYtUrl] = useState('');
  // Part yang TIDAK dicentang untuk di-upload. Model "deselected" supaya hasil
  // konversi baru otomatis terpilih semua tanpa perlu state tambahan.
  const [deselected, setDeselected] = useState(() => new Set());
  const restoredSavedAtRef = useRef(0);
  const didRestoreRef = useRef(false);
  const [restoredSavedAt, setRestoredSavedAt] = useState(0);
  const inputRef = useRef(null);
  const convertAbortRef = useRef(null);
  const uploadAbortRef = useRef(null);
  const ytAbortRef = useRef(null);
  // Latest-ref untuk shortcut keyboard: listener dipasang SEKALI, tapi selalu memanggil
  // handler dengan closure terbaru (dulu effect tanpa dependency mendaftar ulang tiap render).
  const shortcutRef = useRef(null);
  useEffect(() => {
    shortcutRef.current = { convert: handleConvertAll, upload: handleUploadAll };
  });

  // Pulihkan hasil konversi dari sesi sebelumnya (tahan refresh).
  // setTimeout 0: setState asinkron agar tidak memicu cascading render sinkron.
  useEffect(() => {
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;
    const t = setTimeout(() => {
      const { jobs: restored, savedAt } = loadRestoredJobs();
      if (restored.length) {
        restoredSavedAtRef.current = savedAt;
        setRestoredSavedAt(savedAt);
        setJobs(restored);
        notify(`${restored.length} hasil konversi dipulihkan dari sesi sebelumnya.`, 'info');
      }
    }, 0);
    return () => clearTimeout(t);
  }, [notify]);

  // Simpan hasil (metadata saja, tanpa base64) agar tahan refresh; bersihkan saat kosong.
  useEffect(() => {
    const t = setTimeout(() => {
      const payload = sanitizeJobsForStorage(jobs);
      if (payload) {
        try { localStorage.setItem(JOBS_KEY, payload); } catch { /* storage penuh */ }
      } else clearStoredJobs();
    }, 500);
    return () => clearTimeout(t);
  }, [jobs]);

  // Tempel link YouTube di mana saja → langsung pindah ke tab YouTube dan terisi.
  useEffect(() => {
    function onPaste(e) {
      const text = String(e.clipboardData?.getData('text') || '').trim();
      if (/^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(text)) {
        setSourceMode('youtube');
        setYtUrl(text);
        notify('Link YouTube terdeteksi — klik "Ambil Audio & Konversi".', 'info');
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [notify]);

  // Keyboard shortcut
  useEffect(() => {
    function onKey(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) shortcutRef.current?.upload();
        else shortcutRef.current?.convert();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activePreset = PRESETS.find((p) => Math.abs(p.speed - settings.speed) < 0.001)?.id || '';
  const segMin = Math.round((settings.segmentSeconds || 180) / 60 * 10) / 10;
  const pendingJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'error');
  const doneJobs = jobs.filter((j) => j.status === 'done');
  const selectedCount = doneJobs.reduce((n, job) => n
    + job.processed.parts.filter((p) => !deselected.has(partKey(job.id, p.index))).length, 0);
  const anyDeselected = doneJobs.some((job) => job.processed.parts.some((p) => deselected.has(partKey(job.id, p.index))));
  const failedCount = doneJobs.reduce((n, job) => n
    + job.processed.parts.filter((p) => job.partStatus[p.index]?.status === 'Failed').length, 0);
  // Penghitung kuota lokal: asset diterima Roblox dalam 30 hari terakhir (dari riwayat device ini).
  const accepted30d = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return history.reduce((n, h) => {
      const t = h.createdAt ? new Date(h.createdAt).getTime() : 0;
      return t >= cutoff ? n + (h.parts || []).filter((p) => p.status === 'Accepted').length : n;
    }, 0);
  }, [history]);
  const fileRemainingMs = restoredSavedAt ? serverFileRemainingMs(restoredSavedAt) : 0;

  function toggleSelectAll() {
    setDeselected((prev) => {
      const anyOff = doneJobs.some((job) => job.processed.parts.some((p) => prev.has(partKey(job.id, p.index))));
      if (anyOff) return new Set(); // pilih semua
      const next = new Set(); // kosongkan semua pilihan
      for (const job of doneJobs) {
        for (const p of job.processed.parts) next.add(partKey(job.id, p.index));
      }
      return next;
    });
  }

  function update(patch) { setSettings((s) => ({ ...s, ...patch })); }

  // Polling progres konversi: server menyimpan persen ffmpeg asli per jobId.
  function startProgressPolling(jobId, onPercent) {
    const timer = setInterval(async () => {
      try {
        const pct = await fetchProgress(jobId);
        if (pct !== null) onPercent(pct);
      } catch { /* polling gagal sekali bukan masalah */ }
    }, 2000);
    return () => clearInterval(timer);
  }

  // ================= Preset kustom =================
  // Kumpulan field yang dianggap "setelan penuh" sebuah preset.
  const PRESET_FIELDS = [
    'speed', 'amplify', 'pitch', 'bassBoost', 'reverb', 'echo', 'normalize',
    'fadeIn', 'fadeOut', 'trimStart', 'trimEnd', 'eqPreset', 'segmentSeconds'
  ];
  const customActiveId = customPresets.find(
    (p) => Object.entries(p.settings).every(([k, v]) => settings[k] === v)
  )?.id;

  function saveCustomPreset() {
    const name = window.prompt('Nama preset baru:', 'Preset saya');
    if (!name || !name.trim()) return;
    const settingsSnapshot = {};
    for (const field of PRESET_FIELDS) settingsSnapshot[field] = settings[field];
    const preset = { id: uid('cp'), label: name.trim().slice(0, 24), settings: settingsSnapshot };
    setCustomPresets([...customPresets, preset].slice(-12));
    notify(`Preset "${preset.label}" tersimpan di browser ini.`);
  }

  function applyCustomPreset(preset) {
    update(preset.settings);
    notify(`Preset "${preset.label}" dipakai.`);
  }

  function removeCustomPreset(preset, e) {
    e.stopPropagation();
    if (!window.confirm(`Hapus preset "${preset.label}"?`)) return;
    setCustomPresets(customPresets.filter((p) => p.id !== preset.id));
    notify('Preset dihapus.', 'info');
  }
  function updateJob(id, patch) { setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j))); }
  function setJobPart(id, index, val) { setJobs((js) => js.map((j) => (j.id === id ? { ...j, partStatus: { ...j.partStatus, [index]: val } } : j))); }

  function addFiles(list) {
    const accepted = Array.from(list || []).filter((f) => ACCEPT_RE.test(f.name) || (f.type || '').startsWith('audio'));
    if (!accepted.length) { notify('Pilih file audio yang didukung (mp3, wav, ogg, m4a, aac, flac).', 'error'); return; }
    setJobs((js) => [...js, ...accepted.map(newJob)]);
  }
  function removeJob(id) { setJobs((js) => js.filter((j) => j.id !== id)); }

  function resolveCreator() {
    return roblox.mode === 'group'
      ? { groupId: cleanRobloxId(roblox.selectedGroupId || roblox.groupId) }
      : { userId: cleanRobloxId(roblox.userId) };
  }

  async function handleConvertAll() {
    if (!pendingJobs.length) { notify('Tidak ada file untuk dikonversi.', 'error'); return; }
    setBusy('convert');
    const controller = new AbortController();
    convertAbortRef.current = controller;
    try {
      let okCount = 0;
      let failCount = 0;
      for (const job of pendingJobs) {
        updateJob(job.id, { status: 'converting', progress: { percent: 0, stage: 'convert', message: 'Memproses & memotong audio...' }, error: '' });
        const jobId = uid('job');
        const stopPolling = startProgressPolling(jobId, (pct) => updateJob(job.id, { progress: { percent: pct, stage: 'convert', message: 'Memproses & memotong audio...' } }));
        try {
          const result = await processAudio({
            file: job.file, settings, title: job.title || job.file.name, segmentSeconds: settings.segmentSeconds,
            signal: controller.signal, jobId
          });
          okCount += 1;
          updateJob(job.id, { status: 'done', processed: result, progress: { percent: 100, stage: '', message: '' } });
          (result.warnings || []).forEach((w) => notify(`${job.title}: ${w}`, 'info'));
        } catch (e) {
          // Dibatalkan user: kembalikan job ini ke antrian dan hentikan sisa loop.
          if (e.name === 'AbortError' || controller.signal.aborted) {
            updateJob(job.id, { status: 'queued', progress: { percent: 0, stage: '', message: '' }, error: '' });
            break;
          }
          failCount += 1;
          const msg = formatApiError(e);
          updateJob(job.id, { status: 'error', error: msg });
          notify(`${job.title}: ${msg}`, 'error');
        } finally {
          stopPolling();
        }
      }
      const cancelled = controller.signal.aborted;
      if (cancelled) notify('Konversi dibatalkan. File yang belum diproses kembali mengantre.', 'info');
      else if (failCount) {
        playDoneChime(); flashTabTitle(`⚠ ${failCount} gagal`);
        notify(`Konversi selesai: ${okCount} berhasil, ${failCount} gagal.`, okCount ? 'info' : 'error');
      } else {
        playDoneChime(); flashTabTitle('✓ Konversi selesai');
        notify('Semua konversi selesai.', 'success');
      }
    } finally {
      convertAbortRef.current = null;
      setBusy('');
    }
  }

  async function handleYouTubeImport() {
    const url = ytUrl.trim();
    if (!url) { notify('Tempel link YouTube dulu.', 'error'); return; }
    if (busy) return;
    setBusy('import');
    const controller = new AbortController();
    ytAbortRef.current = controller;
    // Job sementara tampil sebagai 'converting' sejak awal (progres polling ikut).
    const tempId = uid('j');
    setJobs((js) => [...js, {
      id: tempId, file: null, title: 'YouTube', status: 'converting',
      progress: { percent: 0, stage: 'import', message: 'Mengunduh audio dari YouTube...' },
      processed: null, partStatus: {}, error: ''
    }]);
    const jobId = uid('job');
    const stopPolling = startProgressPolling(jobId, (pct) => updateJob(tempId, { progress: { percent: pct, stage: 'convert', message: 'Mengonversi audio...' } }));
    try {
      const result = await importYouTube({
        url, settings, segmentSeconds: settings.segmentSeconds, signal: controller.signal, jobId
      });
      updateJob(tempId, {
        title: result.title || 'YouTube Audio', status: 'done',
        progress: { percent: 100, stage: '', message: '' }, processed: result
      });
      setYtUrl('');
      playDoneChime(); flashTabTitle('✓ YouTube siap');
      (result.warnings || []).forEach((w) => notify(w, 'info'));
      notify(`"${result.title}" siap: ${result.partCount} part.`, 'success');
    } catch (e) {
      if (e.name === 'AbortError' || controller.signal.aborted) {
        setJobs((js) => js.filter((j) => j.id !== tempId));
        notify('Import YouTube dibatalkan.', 'info');
      } else {
        const msg = formatApiError(e);
        updateJob(tempId, { status: 'error', error: msg });
        notify(msg, 'error');
      }
    } finally {
      stopPolling();
      ytAbortRef.current = null;
      setBusy('');
    }
  }

  async function uploadPartFor(job, part, creator, signal) {
    setJobPart(job.id, part.index, { status: 'uploading' });
    try {
      const blob = await fetchPartBlob(part, signal);
      const data = await uploadRoblox({
        blob, fileName: part.fileName, signal,
        payload: { apiKey: roblox.apiKey, creator, displayName: `${job.title || 'Audio'} - Part ${part.index}`, description: description || undefined }
      });
      const sub = (data.parts || [])[0] || {};
      const entry = { part: part.index, status: sub.status, rbxassetid: sub.rbxassetid, assetId: sub.assetId, operationId: sub.operationId, error: sub.error };
      setJobPart(job.id, part.index, entry);
      return entry;
    } catch (e) {
      if (e.name === 'AbortError' || signal?.aborted) {
        setJobPart(job.id, part.index, {});
        throw e;
      }
      const entry = { part: part.index, status: 'Failed', error: formatApiError(e) };
      setJobPart(job.id, part.index, entry);
      return entry;
    }
  }

  function validateRoblox() {
    if (!roblox.apiKey) { notify('Isi API key Roblox dulu di Pengaturan.', 'error'); goto('roblox'); return null; }
    const creator = resolveCreator();
    if (!creator.groupId && !creator.userId) { notify('Isi User ID / Group ID dulu di Pengaturan.', 'error'); goto('roblox'); return null; }
    return creator;
  }

  async function handleUploadAll() {
    if (!doneJobs.length) { notify('Konversi audio dulu.', 'error'); return; }
    const selectedCount = doneJobs.reduce((n, job) => n
      + job.processed.parts.filter((p) => !deselected.has(partKey(job.id, p.index))).length, 0);
    if (!selectedCount) { notify('Centang minimal satu part dulu di panel hasil.', 'error'); return; }
    const creator = validateRoblox();
    if (!creator) return;
    setBusy('upload');
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    try {
      let totalAccepted = 0;
      let cancelled = false;
      let skippedAccepted = 0;
      for (const job of doneJobs) {
        const partsToUpload = job.processed.parts.filter((p) => !deselected.has(partKey(job.id, p.index)));
        if (!partsToUpload.length) continue;
        const collected = [];
        for (const part of partsToUpload) {
          // Part yang SEBELUMNYA sudah diterima Roblox tidak diupload ulang —
          // mencegah asset duplikat & pemborosan kuota moderasi saat tombol
          // "Upload semua" ditekan lagi. Part gagal/pending tetap dicoba ulang.
          const previous = job.partStatus[part.index];
          if (previous?.status === 'Accepted') {
            skippedAccepted += 1;
            collected.push(previous);
            continue;
          }
          setUploadLabel(`${job.title} · part ${part.index}/${job.processed.partCount}`);
          try {
            collected.push(await uploadPartFor(job, part, creator, controller.signal));
          } catch (e) {
            if (e.name === 'AbortError' || controller.signal.aborted) { cancelled = true; break; }
            throw e;
          }
        }
        if (cancelled) break;
        totalAccepted += collected.filter((p) => p.status === 'Accepted').length;
        setHistory((prev) => [{
          id: uid('h'), createdAt: new Date().toISOString(),
          title: job.title || 'Audio', duration: job.processed.totalDuration, mode: roblox.mode, parts: collected
        }, ...prev].slice(0, 100));
      }
      if (cancelled) notify('Upload dibatalkan. Part yang belum terkirim bisa diulang lewat tombol retry.', 'info');
      else {
        playDoneChime(); flashTabTitle(totalAccepted ? `✓ ${totalAccepted} asset diterima` : '✓ Upload terkirim');
        if (totalAccepted || skippedAccepted) {
          const skipNote = skippedAccepted ? ` (${skippedAccepted} part sudah diterima sebelumnya, dilewati)` : '';
          notify(`Selesai: ${totalAccepted} asset diterima.${skipNote}`, 'success');
        } else notify('Upload terkirim, cek status di Riwayat.', 'info');
      }
    } finally {
      uploadAbortRef.current = null;
      setBusy('');
      setUploadLabel('');
    }
  }

  async function handleRetry(job, part) {
    const creator = validateRoblox();
    if (!creator) return;
    const res = await uploadPartFor(job, part, creator);
    notify(res.status === 'Accepted' ? `Part ${part.index} diterima.` : res.status === 'Pending' ? `Part ${part.index} menunggu moderasi.` : `Part ${part.index} gagal lagi.`, res.status === 'Failed' ? 'error' : 'success');
  }

  // Ulangi SEMUA part berstatus Gagal sekaligus (jeda antar-part biar sopan ke API Roblox).
  async function retryAllFailed() {
    if (busy) return;
    const creator = validateRoblox();
    if (!creator) return;
    const failed = allParts().filter(({ job, part }) => job.partStatus[part.index]?.status === 'Failed');
    if (!failed.length) { notify('Tidak ada part yang gagal.', 'info'); return; }
    setBusy('upload');
    try {
      let accepted = 0;
      for (let i = 0; i < failed.length; i += 1) {
        const { job, part } = failed[i];
        setUploadLabel(`${job.title} · part ${part.index} (retry ${i + 1}/${failed.length})`);
        const res = await uploadPartFor(job, part, creator);
        if (res.status === 'Accepted') accepted += 1;
        if (i < failed.length - 1) await new Promise((r) => setTimeout(r, 1200));
      }
      notify(`Retry selesai: ${accepted}/${failed.length} diterima.`, accepted === failed.length ? 'success' : 'info');
    } finally {
      setBusy('');
      setUploadLabel('');
    }
  }

  function allParts() {
    return doneJobs.flatMap((job) => job.processed.parts.map((part) => ({ job, part })));
  }

  function toggleSelect(jobId, index, checked) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(partKey(jobId, index));
      else next.add(partKey(jobId, index));
      return next;
    });
  }

  // Salin semua rbxassetid yang sudah diterima Roblox sebagai potongan kode Lua
  // siap-tempel ke script game.
  function copyLuaIds() {
    const items = [];
    for (const { job, part } of allParts()) {
      const st = job.partStatus[part.index];
      if (st?.rbxassetid) {
        items.push({ id: String(st.rbxassetid).replace(/^rbxassetid:\/\//i, ''), job, part });
      }
    }
    if (!items.length) { notify('Belum ada asset yang diterima Roblox. Upload dulu part-nya.', 'error'); return; }
    const lines = items.map(({ id, job, part }) => `    rbxassetid://${id}, -- ${(job.title || 'Audio').slice(0, 50)} · Part ${part.index}`);
    const snippet = `-- LuciVoid Audio Studio · ${new Date().toLocaleString('id-ID')}\nlocal audioIds = {\n${lines.join('\n')}\n}\n`;
    navigator.clipboard?.writeText(snippet);
    notify(`${items.length} rbxassetid disalin sebagai kode Lua.`);
  }

  async function downloadAll() {
    for (const { job, part } of allParts()) {
      const a = document.createElement('a');
      a.href = part.audioDataUrl || `${API_BASE}${part.audioUrl}`;
      a.download = `${(job.title || 'audio').replace(/[^\w-]+/g, '_')}-part${part.index}.ogg`;
      document.body.appendChild(a); a.click(); a.remove();
      await new Promise((r) => setTimeout(r, 350));
    }
    notify('Mengunduh semua part.');
  }

  async function downloadZip() {
    setBusy('zip');
    try {
      const files = [];
      for (const { job, part } of allParts()) {
        const base = (job.title || 'audio').replace(/[^\w-]+/g, '_');
        const blob = await fetchPartBlob(part);
        files.push({ name: `${base}/part${String(part.index).padStart(2, '0')}.ogg`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      if (!files.length) { notify('Belum ada part untuk di-zip.', 'error'); return; }
      const zip = makeZip(files);
      const url = URL.createObjectURL(zip);
      const a = document.createElement('a');
      a.href = url; a.download = 'audio-studio-export.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      notify(`ZIP berisi ${files.length} part diunduh.`);
    } catch (e) {
      notify(`Gagal membuat ZIP: ${e.message}`, 'error');
    } finally { setBusy(''); }
  }

  function copy(text) { navigator.clipboard?.writeText(text); notify('Disalin.'); }

  // Hapus satu part: buang file di server (best-effort) lalu keluarkan dari daftar.
  // Kalau part terakhir lagu terhapus, seluruh job ikut hilang dari daftar.
  async function deletePart(job, part) {
    if (busy) return;
    if (!window.confirm(`Hapus Part ${part.index} dari "${job.title}"?\n\nPart yang dihapus tidak bisa di-upload ke Roblox.`)) return;
    await deleteFile(part.fileName);
    setJobs((js) => js.flatMap((j) => {
      if (j.id !== job.id) return [j];
      const parts = j.processed.parts.filter((p) => p.index !== part.index);
      if (!parts.length) return [];
      const remaining = parts.reduce((n, p) => n + p.duration, 0);
      return [{
        ...j,
        processed: { ...j.processed, parts, partCount: parts.length, totalDuration: remaining, totalDurationText: formatDuration(remaining) },
        partStatus: Object.fromEntries(Object.entries(j.partStatus).filter(([k]) => Number(k) !== part.index))
      }];
    }));
    notify(`Part ${part.index} dihapus.`);
  }

  // Hapus seluruh hasil konversi satu lagu (semua part + filenya di server).
  async function deleteJob(job) {
    if (busy) return;
    const count = job.processed.parts.length;
    if (!window.confirm(`Hapus SEMUA hasil "${job.title}" (${count} part)?\n\nFile di server juga dihapus dan tidak bisa di-upload ke Roblox.`)) return;
    await Promise.all(job.processed.parts.map((p) => deleteFile(p.fileName)));
    setJobs((js) => js.filter((j) => j.id !== job.id));
    notify(`"${job.title}" dihapus (${count} part).`);
  }

  function renderParts(job) {
    return (
      <div className="list" style={{ marginTop: 12 }}>
        {job.processed.parts.map((part) => {
          const st = job.partStatus[part.index];
          const srcUrl = part.audioDataUrl || `${API_BASE}${part.audioUrl}`;
          return (
            <div key={part.index} className="list-item" style={{ flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 9 }}>
                <input
                  type="checkbox" className="part-check" aria-label={`Pilih Part ${part.index} untuk di-upload`}
                  checked={!deselected.has(partKey(job.id, part.index))}
                  disabled={Boolean(busy)}
                  onChange={(e) => toggleSelect(job.id, part.index, e.target.checked)}
                />
                <div style={{ minWidth: 0 }}>
                  <div className="li-title">Part {part.index} <span className="muted small">· {formatDuration(part.duration)} · {Math.round(part.sizeBytes / 1024)} KB</span></div>
                  {st?.rbxassetid && <div className="li-meta">{st.rbxassetid}</div>}
                  {st?.error && <div className="li-meta" style={{ color: 'var(--bad)' }}>{st.error}</div>}
                </div>
              </div>
              <div className="li-actions">
                {st?.status === 'uploading' && <span className="badge wait"><Loader2 className="spin" size={11} /> upload</span>}
                {st && st.status !== 'uploading' && <span className={`badge ${st.status === 'Accepted' ? 'ok' : st.status === 'Failed' ? 'bad' : 'wait'}`}>{st.status === 'Accepted' ? 'Diterima' : st.status === 'Failed' ? 'Gagal' : 'Pending'}</span>}
                {st?.rbxassetid && <button className="btn ghost sm" onClick={() => copy(st.rbxassetid)}><Copy size={13} /></button>}
                {st?.status === 'Failed' && <button className="btn ghost sm" onClick={() => handleRetry(job, part)} title="Coba lagi"><RotateCw size={13} /></button>}
                <a className="btn ghost sm" href={srcUrl} download={part.fileName} title="Download"><Download size={13} /></a>
                <button className="btn ghost sm" title="Hapus part ini" disabled={Boolean(busy) || st?.status === 'uploading'} onClick={() => deletePart(job, part)}><Trash2 size={13} /></button>
              </div>
              <audio controls preload="none" src={srcUrl} style={{ width: '100%', marginTop: 10, height: 34 }} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid-2">
      {/* LEFT */}
      <div>
        <Card icon={<UploadCloud size={18} />} title="1. Sumber Audio" desc="Upload file dari perangkat, atau tempel link YouTube — lagu panjang otomatis dipecah jadi beberapa part.">
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button type="button" className={`btn sm ${sourceMode === 'file' ? 'primary' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setSourceMode('file')} disabled={Boolean(busy)}>
              <UploadCloud size={15} /> Dari File
            </button>
            <button type="button" className={`btn sm ${sourceMode === 'youtube' ? 'primary' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setSourceMode('youtube')} disabled={Boolean(busy)}>
              <Youtube size={15} /> Dari Link YouTube
            </button>
          </div>

          <input ref={inputRef} type="file" accept={ACCEPTED_EXT} multiple style={{ display: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

          {sourceMode === 'file' ? (
            <div
              className={`dropzone ${drag ? 'drag' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            >
              <div className="dz-ico"><UploadCloud size={26} /></div>
              <h3>Tarik file ke sini, atau klik untuk pilih</h3>
              <p>Pilih satu atau beberapa lagu sekaligus.</p>
            </div>
          ) : (
            <div>
              <label className="field">
                <span>Link YouTube</span>
                <input
                  className="input" type="url" inputMode="url" enterKeyHint="go"
                  placeholder="https://youtube.com/watch?v=... atau youtu.be/..."
                  value={ytUrl} disabled={Boolean(busy)}
                  onChange={(e) => setYtUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !busy) { e.preventDefault(); handleYouTubeImport(); } }}
                />
              </label>
              <MagneticButton className="primary block" disabled={Boolean(busy) || !ytUrl.trim()} onClick={handleYouTubeImport}>
                {busy === 'import' ? <Loader2 className="spin" size={17} /> : <Youtube size={17} />}
                {busy === 'import' ? 'Mengunduh & mengonversi...' : 'Ambil Audio & Konversi'}
              </MagneticButton>
              {busy === 'import' && (
                <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => ytAbortRef.current?.abort()}>
                  <XCircle size={15} /> Batalkan import
                </button>
              )}
              <p className="small muted" style={{ margin: '10px 2px 0' }}>
                Gratis via yt-dlp di server. Video panjang butuh waktu lebih lama; bila YouTube memblokir server, coba lagi beberapa menit atau gunakan upload file.
              </p>
            </div>
          )}

          {jobs.length > 0 && (
            <div className="list" style={{ marginTop: 14 }}>
              {jobs.map((job) => (
                <div className="job-row" key={job.id}>
                  <span className="fc-ico"><FileAudio size={18} /></span>
                  <input className="input job-title" value={job.title} disabled={busy} onChange={(e) => updateJob(job.id, { title: e.target.value })} />
                  <span className={`badge ${job.status === 'done' ? 'ok' : job.status === 'error' ? 'bad' : 'wait'}`}>
                    {job.status === 'converting' ? 'proses' : job.status === 'done' ? `${job.processed.partCount} part` : job.status === 'error' ? 'gagal' : 'antri'}
                  </span>
                  {!busy && <button className="btn ghost sm" onClick={() => removeJob(job.id)}><Trash2 size={13} /></button>}
                </div>
              ))}
              <label className="field" style={{ marginTop: 6 }}>
                <span>Deskripsi asset (opsional, berlaku semua)</span>
                <textarea className="input" rows={2} value={description} disabled={busy} onChange={(e) => setDescription(e.target.value)} placeholder="Deskripsi singkat untuk asset Roblox" />
              </label>
              <button className="btn ghost sm" disabled={busy} onClick={() => setJobs([])} style={{ alignSelf: 'flex-start' }}><Trash2 size={13} /> Kosongkan daftar</button>
            </div>
          )}
        </Card>

        <Card icon={<Wand2 size={18} />} title="2. Preset & Split" desc="Berlaku untuk semua file. Pilih preset, atur durasi per part, atau buka lanjutan.">
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={`preset ${activePreset === p.id ? 'active' : ''}`} onClick={() => update({ speed: p.speed })}>
                <b>{p.label}</b><small>{p.desc}</small>
              </button>
            ))}
            {customPresets.map((p) => (
              <button key={p.id} type="button" className={`preset ${customActiveId === p.id ? 'active' : ''}`} onClick={() => applyCustomPreset(p)} title="Preset kustom kamu">
                <b style={{ paddingRight: 14 }}>{p.label}</b>
                <small>{p.settings.speed}x{p.settings.bassBoost ? ' · bass' : ''}{p.settings.reverb ? ' · reverb' : ''}{p.settings.normalize ? ' · norm' : ''}</small>
                <span
                  role="button" tabIndex={0} aria-label={`Hapus preset ${p.label}`}
                  onClick={(e) => removeCustomPreset(p, e)}
                  onKeyDown={(e) => { if (e.key === 'Enter') removeCustomPreset(p, e); }}
                  style={{ position: 'absolute', top: 6, right: 8, fontSize: 13, lineHeight: 1, color: 'var(--text-dim)', cursor: 'pointer' }}
                >×</span>
              </button>
            ))}
          </div>
          <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={saveCustomPreset} disabled={Boolean(busy)}>
            + Simpan setelan saat ini sebagai preset
          </button>

          <div style={{ marginTop: 18, padding: 14, borderRadius: 13, background: 'rgba(34,211,238,0.06)', border: '1px solid var(--border-strong)' }}>
            <Slider label={<span><Scissors size={13} /> Durasi per part</span>} value={settings.segmentSeconds} min={30} max={420} step={10} suffix={`s · ~${segMin}m`} onChange={(v) => update({ segmentSeconds: v })} />
            <p className="small muted" style={{ margin: '2px 2px 0' }}>Audio panjang dipotong otomatis jadi beberapa lagu, masing-masing maks segini. Default 3 menit.</p>
          </div>

          <button className="btn ghost block" style={{ marginTop: 16 }} onClick={() => setAdvanced((v) => !v)}>
            <Sliders size={16} /> Pengaturan lanjutan
            <span style={{ display: 'inline-flex', transform: advanced ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><ChevronDown size={16} /></span>
          </button>
          {advanced && (
            <div>
              <div style={{ paddingTop: 18 }}>
                  <Slider label="Kecepatan (tempo)" value={settings.speed} min={0.5} max={3} step={0.05} suffix="x" onChange={(v) => update({ speed: v })} />
                  <Slider label="Volume" value={settings.amplify} min={-20} max={20} step={1} suffix=" dB" onChange={(v) => update({ amplify: v })} />
                  <Slider label="Pitch" value={settings.pitch} min={-12} max={12} step={1} suffix=" st" onChange={(v) => update({ pitch: v })} />
                  <div className="row">
                    <Slider label="Fade in" value={settings.fadeIn} min={0} max={15} step={1} suffix=" s" onChange={(v) => update({ fadeIn: v })} />
                    <Slider label="Fade out" value={settings.fadeOut} min={0} max={15} step={1} suffix=" s" onChange={(v) => update({ fadeOut: v })} />
                  </div>
                  <div className="row">
                    <Slider label="Trim awal" value={settings.trimStart} min={0} max={3600} step={5} suffix=" s" onChange={(v) => update({ trimStart: v })} />
                    <Slider label="Trim akhir" value={settings.trimEnd} min={0} max={3600} step={5} suffix=" s" onChange={(v) => update({ trimEnd: v })} />
                  </div>
                  <label className="field">
                    <span>EQ Preset</span>
                    <select className="select" value={settings.eqPreset} onChange={(e) => update({ eqPreset: e.target.value })}>
                      {EQ_PRESETS.map((eq) => <option key={eq.value} value={eq.value}>{eq.label}</option>)}
                    </select>
                  </label>
                  <div className="toggle-grid">
                    <Toggle label="Bass Boost" checked={settings.bassBoost} onChange={(v) => update({ bassBoost: v })} />
                    <Toggle label="Reverb" checked={settings.reverb} onChange={(v) => update({ reverb: v })} />
                    <Toggle label="Echo" checked={settings.echo} onChange={(v) => update({ echo: v })} />
                    <Toggle label="Normalize" checked={settings.normalize} onChange={(v) => update({ normalize: v })} />
                  </div>
              </div>
            </div>
          )}

          <MagneticButton className="primary block" style={{ marginTop: 18 }} disabled={!pendingJobs.length || busy} onClick={handleConvertAll}>
            {busy === 'convert' ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
            {busy === 'convert' ? 'Memproses...' : pendingJobs.length ? `Konversi ${pendingJobs.length} file` : 'Tambahkan file dulu'}
          </MagneticButton>

          {busy === 'convert' && (
            <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => convertAbortRef.current?.abort()}>
              <XCircle size={15} /> Batalkan konversi
            </button>
          )}
        </Card>
      </div>

      {/* RIGHT */}
      <div>
        <Card icon={<Rocket size={18} />} title="3. Hasil & Upload Roblox" desc="Tiap part bisa diputar & diupload jadi asset Roblox terpisah.">
          {jobs.length === 0 ? (
            <div className="result-empty">
              <div className="re-hero">
                <div className="e-ico"><FileAudio size={26} /></div>
                <h3>Hasil konversi muncul di sini</h3>
                <p className="small muted">Upload satu atau beberapa lagu, lalu klik <b>Konversi</b>. Lagu panjang otomatis dipotong jadi beberapa part.</p>
              </div>
              <div className="how-steps">
                <div className="how-step"><span className="how-num">1</span><div><b>Upload</b><small>Satu atau banyak lagu sekaligus.</small></div></div>
                <div className="how-step"><span className="how-num">2</span><div><b>Atur preset & split</b><small>Tempo, efek, durasi per part.</small></div></div>
                <div className="how-step"><span className="how-num">3</span><div><b>Upload ke Roblox</b><small>Tiap part jadi asset terpisah.</small></div></div>
              </div>
              <div className="divider" />
              <div className="chips">
                <span className="chip">Target: <b>{roblox.mode === 'group' ? `Group ${cleanRobloxId(roblox.selectedGroupId || roblox.groupId) || '—'}` : `User ${cleanRobloxId(roblox.userId) || '—'}`}</b></span>
                <span className="chip">API key: <b>{roblox.apiKey ? 'tersimpan ✓' : 'belum diisi'}</b></span>
              </div>
              {!roblox.apiKey && <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => goto('roblox')}><Rocket size={15} /> Atur Roblox dulu</button>}
            </div>
          ) : (
            <>
              {jobs.map((job) => (
                <div className="job-group" key={job.id}>
                  <div className="job-group-head">
                    <div className="li-title" title={job.title}>{job.title}</div>
                    {job.status === 'done' && <span className="chip">{job.processed.partCount} part · {formatDuration(job.processed.totalDuration)}</span>}
                    {job.status === 'queued' && <span className="badge wait">menunggu</span>}
                    {job.status === 'error' && <span className="badge bad">gagal</span>}
                    {job.status === 'done' && (
                      <button className="btn ghost sm" title="Hapus semua hasil lagu ini" disabled={Boolean(busy)} onClick={() => deleteJob(job)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {job.status === 'converting' && (
                    <div className="convert-progress">
                      <div className="ov-ring indet" style={{ '--p': `${Math.round(job.progress.percent || 0) * 3.6}deg` }}>
                        <div className="ov-ring-inner"><b>{Math.round(job.progress.percent || 0)}%</b></div>
                      </div>
                      <h3 className="cp-title">Memproses</h3>
                      <p className="cp-msg">{job.progress.message || 'Sedang memproses & memotong audio...'}</p>
                      <div className="ov-bar indet" style={{ background: 'transparent' }}>
                        <div className="ov-bar-fill" style={{ position: 'static', width: `${Math.round(job.progress.percent || 0)}%`, animation: 'none', transition: 'width 0.4s ease' }} />
                      </div>
                      <p className="muted small" style={{ marginTop: 12, textAlign: 'center' }}>Lagu panjang butuh waktu lebih lama di server gratis. Kamu bisa membatalkan kapan saja — menutup tab juga menghentikan proses di server.</p>
                    </div>
                  )}
                  {job.status === 'error' && <p className="small" style={{ color: 'var(--bad)' }}>{job.error}</p>}
                  {job.status === 'done' && renderParts(job)}
                </div>
              ))}

                  {doneJobs.length > 0 && (
                    <>
                      <div className="divider" />
                      <div className="chips" style={{ marginBottom: 12 }}>
                        <span className="chip">Target: <b>{roblox.mode === 'group' ? `Group ${cleanRobloxId(roblox.selectedGroupId || roblox.groupId) || '—'}` : `User ${cleanRobloxId(roblox.userId) || '—'}`}</b></span>
                        <span className="chip">API key: <b>{roblox.apiKey ? 'tersimpan' : 'belum diisi'}</b></span>
                        <span className="chip">Roblox play <b>{robloxPlaybackSpeed(settings.speed)}x</b></span>
                        {accepted30d > 0 && <span className="chip">30 hari terakhir: <b>{accepted30d} asset</b> diterima</span>}
                        {restoredSavedAt > 0 && <span className="chip">File server: <b>{formatRemaining(fileRemainingMs)}</b></span>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        <button className="btn ghost sm" onClick={toggleSelectAll} disabled={Boolean(busy)}>
                          {anyDeselected ? 'Pilih semua part' : 'Kosongkan pilihan'}
                        </button>
                        <button className="btn ghost sm" onClick={copyLuaIds} disabled={Boolean(busy)} title="Salin semua rbxassetid sebagai kode Lua siap tempel">
                          <Code2 size={14} /> Salin ID (Lua)
                        </button>
                        {failedCount > 0 && (
                          <button className="btn ghost sm" onClick={retryAllFailed} disabled={Boolean(busy)} title="Ulangi semua part yang gagal">
                            <RotateCw size={14} /> Ulangi {failedCount} gagal
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <button className="btn ghost" style={{ flex: 1 }} onClick={downloadZip} disabled={busy}>{busy === 'zip' ? <Loader2 className="spin" size={16} /> : <Download size={16} />} Download ZIP</button>
                        <button className="btn ghost" style={{ flex: 1 }} onClick={downloadAll} disabled={busy}><Download size={16} /> Unduh satuan</button>
                      </div>
                      <MagneticButton className="primary block" disabled={Boolean(busy) || !selectedCount} onClick={handleUploadAll}>
                        {busy === 'upload' ? <Loader2 className="spin" size={17} /> : <Rocket size={17} />}
                        {busy === 'upload' ? `Mengupload ${uploadLabel}...` : selectedCount ? `Upload ${selectedCount} part terpilih ke Roblox` : 'Centang part untuk di-upload'}
                      </MagneticButton>

                  {busy === 'upload' && (
                    <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => uploadAbortRef.current?.abort()}>
                      <XCircle size={15} /> Batalkan upload
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Action bar mobile: upload selalu terjangkau tanpa scroll jauh */}
      {doneJobs.length > 0 && (
        <div className="mobile-action-bar">
          <span className="mab-info"><b>{selectedCount}</b> part dipilih</span>
          <button className="btn primary sm" disabled={Boolean(busy) || !selectedCount} onClick={handleUploadAll}>
            {busy === 'upload' ? <Loader2 className="spin" size={14} /> : <Rocket size={14} />}
            Upload ke Roblox
          </button>
        </div>
      )}
    </div>
  );
}
