import { useRef, useState, useEffect } from 'react';
import {
  UploadCloud, FileAudio, Wand2, Loader2, Sliders, ChevronDown, Rocket, Scissors, Copy, Trash2, Download, RotateCw, XCircle, Youtube
} from 'lucide-react';
import { useApp } from '../App.jsx';
import { Card, Slider, Toggle, MagneticButton } from '../components/ui.jsx';
import { makeZip } from '../lib/zip.js';
import { PRESETS, EQ_PRESETS, ACCEPTED_EXT, API_BASE } from '../lib/constants.js';
import { processAudio, fetchPartBlob, uploadRoblox, importYouTube } from '../lib/api.js';
import { cleanRobloxId, robloxPlaybackSpeed, uid, formatApiError } from '../lib/utils.js';
import { formatDuration } from '../lib/format.js';

const ACCEPT_RE = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;

function newJob(file) {
  return {
    id: uid('j'), file, title: file.name.replace(/\.[^.]+$/, ''),
    status: 'queued', progress: { percent: 0, stage: '', message: '' },
    processed: null, partStatus: {}, error: ''
  };
}

export default function ConvertPage() {
  const { settings, setSettings, roblox, setHistory, notify, goto } = useApp();
  const [jobs, setJobs] = useState([]);
  const [description, setDescription] = useState('');
  const [drag, setDrag] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState('');
  const [uploadLabel, setUploadLabel] = useState('');
  const [sourceMode, setSourceMode] = useState('file'); // 'file' | 'youtube'
  const [ytUrl, setYtUrl] = useState('');
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

  function update(patch) { setSettings((s) => ({ ...s, ...patch })); }
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
        try {
          const result = await processAudio({
            file: job.file, settings, title: job.title || job.file.name, segmentSeconds: settings.segmentSeconds,
            signal: controller.signal
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
        }
      }
      const cancelled = controller.signal.aborted;
      if (cancelled) notify('Konversi dibatalkan. File yang belum diproses kembali mengantre.', 'info');
      else if (failCount) notify(`Konversi selesai: ${okCount} berhasil, ${failCount} gagal.`, okCount ? 'info' : 'error');
      else notify('Semua konversi selesai.', 'success');
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
    try {
      const result = await importYouTube({
        url, settings, segmentSeconds: settings.segmentSeconds, signal: controller.signal
      });
      const job = {
        id: uid('j'), file: null, title: result.title || 'YouTube Audio',
        status: 'done', progress: { percent: 100, stage: '', message: '' },
        processed: result, partStatus: {}, error: ''
      };
      setJobs((js) => [...js, job]);
      setYtUrl('');
      (result.warnings || []).forEach((w) => notify(w, 'info'));
      notify(`"${result.title}" siap: ${result.partCount} part.`, 'success');
    } catch (e) {
      if (e.name === 'AbortError' || controller.signal.aborted) notify('Import YouTube dibatalkan.', 'info');
      else notify(formatApiError(e), 'error');
    } finally {
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
        const collected = [];
        for (const part of job.processed.parts) {
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
      else if (totalAccepted || skippedAccepted) {
        const skipNote = skippedAccepted ? ` (${skippedAccepted} part sudah diterima sebelumnya, dilewati)` : '';
        notify(`Selesai: ${totalAccepted} asset diterima.${skipNote}`, 'success');
      } else notify('Upload terkirim, cek status di Riwayat.', 'info');
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

  function allParts() {
    return doneJobs.flatMap((job) => job.processed.parts.map((part) => ({ job, part })));
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

  function renderParts(job) {
    return (
      <div className="list" style={{ marginTop: 12 }}>
        {job.processed.parts.map((part) => {
          const st = job.partStatus[part.index];
          const srcUrl = part.audioDataUrl || `${API_BASE}${part.audioUrl}`;
          return (
            <div key={part.index} className="list-item" style={{ flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="li-title">Part {part.index} <span className="muted small">· {formatDuration(part.duration)} · {Math.round(part.sizeBytes / 1024)} KB</span></div>
                {st?.rbxassetid && <div className="li-meta">{st.rbxassetid}</div>}
                {st?.error && <div className="li-meta" style={{ color: 'var(--bad)' }}>{st.error}</div>}
              </div>
              <div className="li-actions">
                {st?.status === 'uploading' && <span className="badge wait"><Loader2 className="spin" size={11} /> upload</span>}
                {st && st.status !== 'uploading' && <span className={`badge ${st.status === 'Accepted' ? 'ok' : st.status === 'Failed' ? 'bad' : 'wait'}`}>{st.status === 'Accepted' ? 'Diterima' : st.status === 'Failed' ? 'Gagal' : 'Pending'}</span>}
                {st?.rbxassetid && <button className="btn ghost sm" onClick={() => copy(st.rbxassetid)}><Copy size={13} /></button>}
                {st?.status === 'Failed' && <button className="btn ghost sm" onClick={() => handleRetry(job, part)} title="Coba lagi"><RotateCw size={13} /></button>}
                <a className="btn ghost sm" href={srcUrl} download={part.fileName} title="Download"><Download size={13} /></a>
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
          </div>

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
                    <div className="li-title">{job.title}</div>
                    {job.status === 'done' && <span className="chip">{job.processed.partCount} part · {formatDuration(job.processed.totalDuration)}</span>}
                    {job.status === 'queued' && <span className="badge wait">menunggu</span>}
                    {job.status === 'error' && <span className="badge bad">gagal</span>}
                  </div>

                  {job.status === 'converting' && (
                    <div className="convert-progress">
                      <div className="ov-ring indet"><div className="ov-ring-inner"><Loader2 className="spin" size={26} /></div></div>
                      <h3 className="cp-title">Memproses</h3>
                      <p className="cp-msg">{job.progress.message || 'Sedang memproses & memotong audio...'}</p>
                      <div className="ov-bar indet"><div className="ov-bar-fill" /></div>
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
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <button className="btn ghost" style={{ flex: 1 }} onClick={downloadZip} disabled={busy}>{busy === 'zip' ? <Loader2 className="spin" size={16} /> : <Download size={16} />} Download ZIP</button>
                    <button className="btn ghost" style={{ flex: 1 }} onClick={downloadAll} disabled={busy}><Download size={16} /> Unduh satuan</button>
                  </div>
                  <MagneticButton className="primary block" disabled={busy} onClick={handleUploadAll}>
                    {busy === 'upload' ? <Loader2 className="spin" size={17} /> : <Rocket size={17} />}
                    {busy === 'upload' ? `Mengupload ${uploadLabel}...` : `Upload semua ke Roblox`}
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
    </div>
  );
}
