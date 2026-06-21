import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, FileAudio, Wand2, Loader2, Sliders, ChevronDown, Rocket, Scissors, Copy, Trash2, Download
} from 'lucide-react';
import { useApp } from '../App.jsx';
import { Card, Slider, Toggle, MagneticButton } from '../components/ui.jsx';
import LoadingOverlay from '../components/LoadingOverlay.jsx';
import { PRESETS, EQ_PRESETS, ACCEPTED_EXT, API_BASE } from '../lib/constants.js';
import { processAudio, fetchPartBlob, uploadRoblox } from '../lib/api.js';
import { cleanRobloxId, robloxPlaybackSpeed, uid } from '../lib/utils.js';
import { formatDuration, formatBytes } from '../lib/format.js';

export default function ConvertPage() {
  const { settings, setSettings, roblox, history, setHistory, notify, goto } = useApp();
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState({ percent: 0, stage: '', message: '' });
  const [processed, setProcessed] = useState(null);
  const [partStatus, setPartStatus] = useState({});
  const [uploadingIdx, setUploadingIdx] = useState(0);
  const inputRef = useRef(null);

  const activePreset = PRESETS.find((p) => Math.abs(p.speed - settings.speed) < 0.001)?.id || '';
  const segMin = Math.round((settings.segmentSeconds || 180) / 60 * 10) / 10;

  function pickFile(f) {
    if (!f) return;
    setProcessed(null); setPartStatus({}); setFile(f);
  }
  function update(patch) { setSettings((s) => ({ ...s, ...patch })); }

  async function handleConvert() {
    if (!file) { notify('Pilih file audio dulu.', 'error'); return; }
    setBusy('convert'); setProcessed(null); setPartStatus({});
    setProgress({ percent: 0, stage: 'queue', message: 'Menyiapkan...' });
    try {
      const result = await processAudio({
        file, settings, title: file.name, segmentSeconds: settings.segmentSeconds,
        onProgress: (m) => setProgress({ percent: m.percent ?? 0, stage: m.stage || '', message: m.message || '' })
      });
      setProcessed(result);
      (result.warnings || []).forEach((w) => notify(w, 'info'));
      notify(`Konversi selesai: ${result.partCount} part siap.`);
    } catch (e) {
      notify(e.message || 'Konversi gagal.', 'error');
    } finally { setBusy(''); }
  }

  function resolveCreator() {
    return roblox.mode === 'group'
      ? { groupId: cleanRobloxId(roblox.selectedGroupId || roblox.groupId) }
      : { userId: cleanRobloxId(roblox.userId) };
  }

  async function handleUploadAll() {
    if (!processed?.parts?.length) { notify('Konversi audio dulu.', 'error'); return; }
    if (!roblox.apiKey) { notify('Isi API key Roblox dulu di Pengaturan.', 'error'); goto('roblox'); return; }
    const creator = resolveCreator();
    if (!creator.groupId && !creator.userId) { notify('Isi User ID / Group ID dulu di Pengaturan.', 'error'); goto('roblox'); return; }

    setBusy('upload');
    const collected = [];
    try {
      for (const part of processed.parts) {
        setUploadingIdx(part.index);
        setPartStatus((s) => ({ ...s, [part.index]: { status: 'uploading' } }));
        try {
          const blob = await fetchPartBlob(part);
          const data = await uploadRoblox({
            blob, fileName: part.fileName,
            payload: { apiKey: roblox.apiKey, creator, displayName: `${processed.title || 'Audio'} - Part ${part.index}` }
          });
          const sub = (data.parts || [])[0] || {};
          setPartStatus((s) => ({ ...s, [part.index]: { status: sub.status, rbxassetid: sub.rbxassetid, assetId: sub.assetId, operationId: sub.operationId, error: sub.error } }));
          collected.push({ part: part.index, status: sub.status, rbxassetid: sub.rbxassetid, assetId: sub.assetId, operationId: sub.operationId, error: sub.error });
        } catch (e) {
          setPartStatus((s) => ({ ...s, [part.index]: { status: 'Failed', error: e.message } }));
          collected.push({ part: part.index, status: 'Failed', error: e.message });
        }
      }
      const accepted = collected.filter((p) => p.status === 'Accepted').length;
      const pending = collected.filter((p) => p.status === 'Pending').length;
      setHistory([{
        id: uid('h'), createdAt: new Date().toISOString(),
        title: processed.title || file?.name || 'Audio',
        duration: processed.totalDuration, mode: roblox.mode, parts: collected
      }, ...history].slice(0, 100));
      notify(accepted ? `Selesai: ${accepted} asset diterima${pending ? `, ${pending} pending` : ''}.` : pending ? 'Terkirim, menunggu moderasi Roblox.' : 'Upload selesai diproses.', accepted ? 'success' : 'info');
    } finally {
      setBusy(''); setUploadingIdx(0);
    }
  }

  function copy(text) { navigator.clipboard?.writeText(text); notify('Disalin.'); }

  return (
    <>
    <LoadingOverlay open={busy === 'convert'} percent={progress.percent} stage={progress.stage} message={progress.message} />
    <div className="grid-2">
      {/* LEFT */}
      <div>
        <Card icon={<UploadCloud size={18} />} title="1. Upload File Audio" desc="Format: mp3, wav, ogg, m4a, aac, flac · maks 250 MB. Lagu panjang otomatis dipecah jadi beberapa part.">
          <input ref={inputRef} type="file" accept={ACCEPTED_EXT} style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files?.[0])} />
          {!file ? (
            <div
              className={`dropzone ${drag ? 'drag' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}
            >
              <div className="dz-ico"><UploadCloud size={26} /></div>
              <h3>Tarik file ke sini, atau klik untuk pilih</h3>
              <p>Audio diproses sementara di server lalu otomatis dibersihkan.</p>
            </div>
          ) : (
            <div className="file-chip">
              <span className="fc-ico"><FileAudio size={26} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="fc-name">{file.name}</div>
                <div className="fc-meta">{formatBytes(file.size)}</div>
              </div>
              <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => { setFile(null); setProcessed(null); }}><Trash2 size={15} /></button>
            </div>
          )}
        </Card>

        <Card icon={<Wand2 size={18} />} title="2. Preset & Split" desc="Pilih preset cepat, atur durasi per part, atau buka pengaturan lanjutan.">
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={`preset ${activePreset === p.id ? 'active' : ''}`} onClick={() => update({ speed: p.speed })}>
                <b>{p.label}</b><small>{p.desc}</small>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 18, padding: 14, borderRadius: 13, background: 'rgba(34,211,238,0.06)', border: '1px solid var(--border-strong)' }}>
            <Slider label={<span><Scissors size={13} /> Durasi per part</span>} value={settings.segmentSeconds} min={30} max={420} step={10} suffix={`s · ~${segMin}m`} onChange={(v) => update({ segmentSeconds: v })} />
            <p className="small muted" style={{ margin: '2px 2px 0' }}>Audio panjang dipotong otomatis jadi beberapa lagu, masing-masing maks segini. Default 3 menit (cocok untuk Roblox).</p>
          </div>

          <button className="btn ghost block" style={{ marginTop: 16 }} onClick={() => setAdvanced((v) => !v)}>
            <Sliders size={16} /> Pengaturan lanjutan
            <motion.span animate={{ rotate: advanced ? 180 : 0 }} style={{ display: 'inline-flex' }}><ChevronDown size={16} /></motion.span>
          </button>
          <AnimatePresence initial={false}>
            {advanced && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ paddingTop: 18 }}>
                  <Slider label="Kecepatan (tempo)" value={settings.speed} min={0.5} max={3} step={0.05} suffix="x" onChange={(v) => update({ speed: v })} />
                  <Slider label="Volume" value={settings.amplify} min={-20} max={20} step={1} suffix=" dB" onChange={(v) => update({ amplify: v })} />
                  <Slider label="Pitch" value={settings.pitch} min={-12} max={12} step={1} suffix=" st" onChange={(v) => update({ pitch: v })} />
                  <div className="row">
                    <Slider label="Fade in" value={settings.fadeIn} min={0} max={15} step={1} suffix=" s" onChange={(v) => update({ fadeIn: v })} />
                    <Slider label="Fade out" value={settings.fadeOut} min={0} max={15} step={1} suffix=" s" onChange={(v) => update({ fadeOut: v })} />
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
              </motion.div>
            )}
          </AnimatePresence>

          <MagneticButton className="primary block neon-border" style={{ marginTop: 18 }} disabled={!file || busy} onClick={handleConvert}>
            {busy === 'convert' ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
            {busy === 'convert' ? 'Memproses & memotong...' : 'Konversi Audio'}
          </MagneticButton>
        </Card>
      </div>

      {/* RIGHT */}
      <div>
        <Card icon={<Rocket size={18} />} title="3. Hasil & Upload Roblox" desc="Tiap part bisa diputar, lalu diupload jadi asset Roblox terpisah.">
          {!processed ? (
            <div className="result-empty">
              <div className="re-hero">
                <div className="e-ico"><FileAudio size={26} /></div>
                <h3>Hasil konversi muncul di sini</h3>
                <p className="small muted">Upload file lalu klik <b>Konversi Audio</b>. Lagu panjang otomatis dipotong jadi beberapa part siap-upload.</p>
              </div>
              <div className="how-steps">
                <div className="how-step"><span className="how-num">1</span><div><b>Upload</b><small>Pilih file audio dari perangkat.</small></div></div>
                <div className="how-step"><span className="how-num">2</span><div><b>Atur preset & split</b><small>Tempo, efek, dan durasi per part.</small></div></div>
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
              <div className="chips" style={{ marginBottom: 12 }}>
                <span className="chip">Total <b>{formatDuration(processed.totalDuration)}</b></span>
                <span className="chip">Jumlah part <b>{processed.partCount}</b></span>
                <span className="chip">Per part <b>≤ {formatDuration(processed.segmentSeconds)}</b></span>
                <span className="chip">Roblox play <b>{robloxPlaybackSpeed(settings.speed)}x</b></span>
              </div>
              {processed.appliedEffects?.length ? (
                <div className="chips" style={{ marginBottom: 14 }}>
                  {processed.appliedEffects.map((eff, i) => <span className="chip" key={i}>{eff}</span>)}
                </div>
              ) : null}

              <div className="list">
                {processed.parts.map((part) => {
                  const st = partStatus[part.index];
                  return (
                    <motion.div key={part.index} className="list-item" style={{ flexWrap: 'wrap' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="li-title">Part {part.index} <span className="muted small">· {formatDuration(part.duration)} · {Math.round(part.sizeBytes / 1024)} KB</span></div>
                        {st?.rbxassetid && <div className="li-meta">{st.rbxassetid}</div>}
                        {st?.error && <div className="li-meta" style={{ color: 'var(--bad)' }}>{st.error}</div>}
                      </div>
                      <div className="li-actions">
                        {st?.status === 'uploading' && <span className="badge wait"><Loader2 className="spin" size={11} /> upload</span>}
                        {st && st.status !== 'uploading' && <span className={`badge ${st.status === 'Accepted' ? 'ok' : st.status === 'Failed' ? 'bad' : 'wait'}`}>{st.status === 'Accepted' ? 'Diterima' : st.status === 'Failed' ? 'Gagal' : 'Pending'}</span>}
                        {st?.rbxassetid && <button className="btn ghost sm" onClick={() => copy(st.rbxassetid)}><Copy size={13} /></button>}
                        <a className="btn ghost sm" href={part.audioDataUrl || `${API_BASE}${part.audioUrl}`} download={part.fileName} title="Download"><Download size={13} /></a>
                      </div>
                      <audio controls preload="none" src={part.audioDataUrl || `${API_BASE}${part.audioUrl}`} style={{ width: '100%', marginTop: 10, height: 34 }} />
                    </motion.div>
                  );
                })}
              </div>

              <div className="divider" />
              <div className="chips" style={{ marginBottom: 12 }}>
                <span className="chip">Target: <b>{roblox.mode === 'group' ? `Group ${cleanRobloxId(roblox.selectedGroupId || roblox.groupId) || '—'}` : `User ${cleanRobloxId(roblox.userId) || '—'}`}</b></span>
                <span className="chip">API key: <b>{roblox.apiKey ? 'tersimpan' : 'belum diisi'}</b></span>
              </div>
              <MagneticButton className="primary block neon-border" disabled={busy} onClick={handleUploadAll}>
                {busy === 'upload' ? <Loader2 className="spin" size={17} /> : <Rocket size={17} />}
                {busy === 'upload' ? `Mengupload part ${uploadingIdx}/${processed.partCount}...` : `Upload ${processed.partCount} part ke Roblox`}
              </MagneticButton>
            </>
          )}
        </Card>
      </div>
    </div>
    </>
  );
}
