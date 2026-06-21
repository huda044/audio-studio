import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import WaveSurfer from 'wavesurfer.js';
import {
  UploadCloud, FileAudio, Wand2, Loader2, Sliders, ChevronDown, Rocket, CheckCircle2, Copy, Trash2
} from 'lucide-react';
import { useApp } from '../App.jsx';
import { Card, Slider, Toggle, Trace } from '../components/ui.jsx';
import { PRESETS, EQ_PRESETS, ACCEPTED_EXT, MAX_AUDIO_DURATION_SECONDS, API_BASE } from '../lib/constants.js';
import { processAudio, fetchProcessedBlob, uploadRoblox } from '../lib/api.js';
import { cleanRobloxId, robloxPlaybackSpeed, uid } from '../lib/utils.js';
import { formatDuration, formatBytes } from '../lib/format.js';

export default function ConvertPage() {
  const { settings, setSettings, roblox, history, setHistory, notify, goto } = useApp();
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState('');
  const [processed, setProcessed] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const waveBox = useRef(null);
  const wave = useRef(null);
  const inputRef = useRef(null);

  const activePreset = PRESETS.find((p) => Math.abs(p.speed - settings.speed) < 0.001)?.id || '';

  useEffect(() => {
    const src = processed?.audioDataUrl || (processed?.audioUrl ? `${API_BASE}${processed.audioUrl}` : '');
    if (!src || !waveBox.current) return;
    wave.current?.destroy();
    wave.current = WaveSurfer.create({
      container: waveBox.current,
      waveColor: '#2b3d63', progressColor: '#22d3ee', cursorColor: '#a855f7',
      height: 72, barWidth: 2, barGap: 2, barRadius: 2, normalize: true
    });
    wave.current.load(src);
    return () => wave.current?.destroy();
  }, [processed]);

  function pickFile(f) {
    if (!f) return;
    setProcessed(null);
    setUploadResult(null);
    setFile(f);
  }

  function update(patch) { setSettings((s) => ({ ...s, ...patch })); }

  async function handleConvert() {
    if (!file) { notify('Pilih file audio dulu.', 'error'); return; }
    setBusy('convert');
    setUploadResult(null);
    try {
      const result = await processAudio({ file, settings, title: file.name });
      setProcessed(result);
      (result.warnings || []).forEach((w) => notify(w, 'info'));
      notify('Konversi selesai. Audio siap diputar & diupload.');
    } catch (e) {
      notify(e.message || 'Konversi gagal.', 'error');
    } finally {
      setBusy('');
    }
  }

  async function handleUpload() {
    if (!processed) { notify('Konversi audio dulu.', 'error'); return; }
    if (!roblox.apiKey) { notify('Isi API key Roblox dulu di Pengaturan.', 'error'); goto('settings'); return; }
    const creator = roblox.mode === 'group'
      ? { groupId: cleanRobloxId(roblox.selectedGroupId || roblox.groupId) }
      : { userId: cleanRobloxId(roblox.userId) };
    if (!creator.groupId && !creator.userId) {
      notify('Isi User ID (Personal) atau Group ID dulu di Pengaturan.', 'error');
      goto('settings');
      return;
    }
    setBusy('upload');
    try {
      const blob = await fetchProcessedBlob(processed);
      const data = await uploadRoblox({
        blob, fileName: processed.fileName,
        payload: { apiKey: roblox.apiKey, creator, displayName: processed.title || 'Audio Studio' }
      });
      setUploadResult(data);
      const entry = {
        id: uid('h'),
        createdAt: new Date().toISOString(),
        title: processed.title || file?.name || 'Audio',
        duration: processed.duration,
        mode: data.uploadSummary?.mode,
        parts: data.parts || []
      };
      setHistory([entry, ...history].slice(0, 100));
      const acc = data.uploadSummary?.accepted || 0;
      const pend = data.uploadSummary?.pending || 0;
      notify(acc ? `Upload berhasil: ${acc} asset diterima.` : pend ? 'Upload terkirim, menunggu moderasi Roblox.' : 'Upload selesai diproses.', acc ? 'success' : 'info');
    } catch (e) {
      notify(e.message || 'Upload Roblox gagal.', 'error');
    } finally {
      setBusy('');
    }
  }

  function copy(text) { navigator.clipboard?.writeText(text); notify('Disalin ke clipboard.'); }

  return (
    <div className="grid-2">
      {/* LEFT: source + settings */}
      <div>
        <Card icon={<UploadCloud size={18} />} title="1. Upload File Audio" desc="Format: mp3, wav, ogg, m4a, aac, flac. Maks 250 MB.">
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
              <p>Audio kamu diproses sementara di server lalu otomatis dibersihkan.</p>
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

        <Card icon={<Wand2 size={18} />} title="2. Preset Konversi" desc="Pilih cepat, atau buka pengaturan lanjutan untuk kontrol penuh.">
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={`preset ${activePreset === p.id ? 'active' : ''}`} onClick={() => update({ speed: p.speed })}>
                <b>{p.label}</b>
                <small>{p.desc}</small>
              </button>
            ))}
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
                  <Slider label="Durasi maks output" value={settings.maxDuration} min={30} max={MAX_AUDIO_DURATION_SECONDS} step={5} suffix=" s" onChange={(v) => update({ maxDuration: v })} />
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

          <button className="btn primary block" style={{ marginTop: 18 }} disabled={!file || busy} onClick={handleConvert}>
            {busy === 'convert' ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
            {busy === 'convert' ? 'Memproses...' : 'Konversi Audio'}
          </button>
        </Card>
      </div>

      {/* RIGHT: result + upload */}
      <div>
        <Card icon={<Rocket size={18} />} title="3. Hasil & Upload Roblox" desc="Preview hasil, lalu upload ke Roblox Open Cloud.">
          {!processed ? (
            <div className="empty">
              <div className="e-ico"><FileAudio size={26} /></div>
              <p className="small muted" style={{ margin: 0 }}>Hasil konversi akan muncul di sini.</p>
            </div>
          ) : (
            <>
              <div className="wave-box" ref={waveBox} />
              {processed.audioUrl && (
                <audio controls src={processed.audioDataUrl || `${API_BASE}${processed.audioUrl}`} style={{ width: '100%', marginTop: 12 }} />
              )}
              <div className="chips" style={{ marginTop: 14 }}>
                <span className="chip">Durasi <b>{formatDuration(processed.duration)}</b></span>
                <span className="chip">Ukuran <b>{Math.round(processed.sizeBytes / 1024)} KB</b></span>
                <span className="chip">Format <b>OGG</b></span>
                <span className="chip">Roblox play <b>{robloxPlaybackSpeed(settings.speed)}x</b></span>
              </div>
              {processed.appliedEffects?.length ? (
                <div className="chips" style={{ marginTop: 8 }}>
                  {processed.appliedEffects.map((eff, i) => <span className="chip" key={i}>{eff}</span>)}
                </div>
              ) : null}

              <div className="divider" />
              <div className="chips" style={{ marginBottom: 12 }}>
                <span className="chip">Target: <b>{roblox.mode === 'group' ? `Group ${cleanRobloxId(roblox.selectedGroupId || roblox.groupId) || '—'}` : `User ${cleanRobloxId(roblox.userId) || '—'}`}</b></span>
                <span className="chip">API key: <b>{roblox.apiKey ? 'tersimpan' : 'belum diisi'}</b></span>
              </div>
              <button className="btn primary block" disabled={busy} onClick={handleUpload}>
                {busy === 'upload' ? <Loader2 className="spin" size={17} /> : <Rocket size={17} />}
                {busy === 'upload' ? 'Mengupload ke Roblox...' : 'Upload ke Roblox'}
              </button>
            </>
          )}
        </Card>

        {uploadResult && (
          <Card icon={<CheckCircle2 size={18} />} title="Hasil Upload" delay={0.05}>
            <div className="list">
              {(uploadResult.parts || []).map((part) => (
                <div className="list-item" key={part.part}>
                  <div style={{ minWidth: 0 }}>
                    <div className="li-title">Part {part.part}</div>
                    {part.rbxassetid
                      ? <div className="li-meta">{part.rbxassetid}</div>
                      : <div className="li-meta">{part.error || (part.status === 'Pending' ? 'Menunggu moderasi Roblox...' : '—')}</div>}
                  </div>
                  <div className="li-actions">
                    <span className={`badge ${part.status === 'Accepted' ? 'ok' : part.status === 'Failed' ? 'bad' : 'wait'}`}>
                      {part.status === 'Accepted' ? 'Diterima' : part.status === 'Failed' ? 'Gagal' : 'Pending'}
                    </span>
                    {part.rbxassetid && <button className="btn ghost sm" onClick={() => copy(part.rbxassetid)}><Copy size={14} /></button>}
                  </div>
                </div>
              ))}
            </div>
            {uploadResult.parts?.some((p) => p.trace) && (
              <>
                <div className="divider" />
                <Trace items={uploadResult.parts.flatMap((p) => p.trace || []).slice(0, 8)} />
              </>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
