import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WaveSurfer from 'wavesurfer.js';
import CryptoJS from 'crypto-js';
import {
  Copy,
  HelpCircle,
  Loader2,
  Music2,
  Trash2,
  Upload,
  Youtube,
  Link as LinkIcon
} from 'lucide-react';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const KEY_SECRET = 'audio-studio-local-key';
const presets = [
  ['Lambat', 2.1],
  ['Default', 2.3],
  ['Cepat', 2.5],
  ['Lebih Cepat', 2.7],
  ['Ultra', 2.9]
];

const defaultSettings = {
  speed: 2.3,
  amplify: -4,
  maxDuration: 400,
  pitch: 0,
  bassBoost: false,
  reverb: false,
  fadeIn: 0,
  fadeOut: 0
};

function encrypt(value) {
  return CryptoJS.AES.encrypt(value || '', KEY_SECRET).toString();
}

function decrypt(value) {
  if (!value) return '';
  try {
    return CryptoJS.AES.decrypt(value, KEY_SECRET).toString(CryptoJS.enc.Utf8);
  } catch {
    return '';
  }
}

function useStoredState(key, fallback) {
  const [value, setValue] = useState(() => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  });
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value]);
  return [value, setValue];
}

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.type}`}>{toast.message}</div>;
}

function Slider({ label, value, min, max, step, suffix, onChange }) {
  return (
    <label className="field">
      <span>{label}: <b>{value}{suffix}</b></span>
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function StatusBadge({ status }) {
  const cls = status === 'Accepted' ? 'ok' : status === 'Failed' ? 'bad' : 'wait';
  const label = status === 'Accepted' ? 'Diterima' : status === 'Failed' ? 'Gagal' : 'Pending';
  return <span className={`badge ${cls}`}>{label}</span>;
}

function App() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeInfo, setYoutubeInfo] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [processed, setProcessed] = useState(null);
  const [mode, setMode] = useState('personal');
  const [userId, setUserId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [apiKey, setApiKey] = useState(() => decrypt(localStorage.getItem('audio-studio-api-key')));
  const [history, setHistory] = useStoredState('audio-studio-history', []);
  const [groups, setGroups] = useStoredState('audio-studio-groups', []);
  const [groupForm, setGroupForm] = useState({ groupId: '', creatorUserId: '', apiKey: '' });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const waveRef = useRef(null);
  const waveBoxRef = useRef(null);

  const summary = `Speed: ${settings.speed}x | Amplify: ${settings.amplify} dB | Max: ${settings.maxDuration}s`;
  const activeGroup = groups.find((group) => group.groupId === selectedGroupId);

  useEffect(() => {
    localStorage.setItem('audio-studio-api-key', encrypt(apiKey));
  }, [apiKey]);

  useEffect(() => {
    if (!youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be')) {
      setYoutubeInfo(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/youtube-info?url=${encodeURIComponent(youtubeUrl)}`);
        if (!response.ok) throw new Error('Preview YouTube gagal dimuat.');
        setYoutubeInfo(await response.json());
      } catch (error) {
        notify(error.message, 'error');
      }
    }, 550);
    return () => clearTimeout(timer);
  }, [youtubeUrl]);

  useEffect(() => {
    const source = processed?.audioDataUrl || (processed?.audioUrl ? `${API_BASE}${processed.audioUrl}` : '');
    if (!source || !waveBoxRef.current) return;
    waveRef.current?.destroy();
    waveRef.current = WaveSurfer.create({
      container: waveBoxRef.current,
      waveColor: '#1f6f78',
      progressColor: '#00e5ff',
      cursorColor: '#ffffff',
      height: 78,
      barWidth: 2,
      barGap: 2,
      normalize: true
    });
    waveRef.current.load(source);
    return () => waveRef.current?.destroy();
  }, [processed]);

  const linkedGroupOptions = useMemo(() => groups.map((group) => (
    <option key={group.groupId} value={group.groupId}>{group.name} ({group.groupId})</option>
  )), [groups]);

  function notify(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  }

  function setSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function processOnly() {
    const form = new FormData();
    if (audioFile) form.append('audio', audioFile);
    if (youtubeUrl) form.append('youtubeUrl', youtubeUrl);
    form.append('settings', JSON.stringify(settings));
    const response = await fetch(`${API_BASE}/api/process`, { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Konversi audio gagal.');
    setProcessed(data);
    notify('Konversi Audio selesai.');
    return data;
  }

  async function convertAndUpload() {
    try {
      setLoading(true);
      const result = processed || await processOnly();
      const audioSource = result.audioDataUrl || `${API_BASE}${result.audioUrl}`;
      const blob = await fetch(audioSource).then((response) => response.blob());
      const form = new FormData();
      form.append('audio', blob, result.fileName);
      const uploadApiKey = mode === 'group' && activeGroup ? decrypt(activeGroup.encryptedApiKey) : apiKey;
      const creator = mode === 'group'
        ? { groupId: activeGroup?.groupId || groupId }
        : { userId };
      form.append('payload', JSON.stringify({
        apiKey: uploadApiKey,
        creator,
        maxDuration: settings.maxDuration,
        displayName: result.title,
        description: `Speed ${settings.speed}x, Amplifikasi ${settings.amplify} dB`
      }));

      const response = await fetch(`${API_BASE}/api/upload-roblox`, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload Roblox gagal.');

      const entry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        title: result.title,
        thumbnail: result.thumbnail,
        youtubeUrl,
        settings,
        speedNormal: (1 / settings.speed).toFixed(2),
        parts: data.parts,
        expired: false
      };
      setHistory((items) => [entry, ...items]);
      notify('Terunggah ke Roblox.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleProcessClick() {
    try {
      setLoading(true);
      await processOnly();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function addGroup() {
    if (!groupForm.groupId || !groupForm.creatorUserId || !groupForm.apiKey) {
      notify('Group ID, Creator, dan API Key wajib diisi.', 'error');
      return;
    }
    const group = {
      id: crypto.randomUUID(),
      name: `Grup ${groupForm.groupId}`,
      groupId: groupForm.groupId,
      creatorUserId: groupForm.creatorUserId,
      encryptedApiKey: encrypt(groupForm.apiKey)
    };
    setGroups((items) => [group, ...items.filter((item) => item.groupId !== group.groupId)]);
    setSelectedGroupId(group.groupId);
    setGroupForm({ groupId: '', creatorUserId: '', apiKey: '' });
    notify('Grup tersimpan.');
  }

  function copyCenz(entry) {
    const ids = entry.parts.filter((part) => part.rbxassetid).map((part, index) => `[${index + 1}] = "${part.rbxassetid}"`).join(',\n');
    navigator.clipboard.writeText(`{\n${ids}\n}`);
    notify('Format CENZ disalin.');
  }

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-100">
      <Toast toast={toast} />
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Roblox Audio Pipeline</p>
            <h1 className="mt-2 text-4xl font-black text-white">Audio Studio</h1>
          </div>
          <div className="summary">{summary}</div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="panel">
            <h2><Youtube size={20} /> Input Audio</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="field">
                <span>URL YouTube</span>
                <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
              </label>
              <label className="field">
                <span>Upload File (.mp3 / .wav / .ogg)</span>
                <input type="file" accept=".mp3,.wav,.ogg,audio/*" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            {youtubeInfo && (
              <div className="preview-row">
                <img src={youtubeInfo.thumbnail} alt="" />
                <div>
                  <b>{youtubeInfo.title}</b>
                  <p>{Math.round(youtubeInfo.duration || 0)} detik</p>
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <h2><Music2 size={20} /> Preset Kecepatan</h2>
            <div className="preset-grid">
              {presets.map(([label, speed]) => (
                <button key={label} className={settings.speed === speed ? 'active' : ''} onClick={() => setSetting('speed', speed)}>
                  {label}<span>{speed}x</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="panel">
          <h2>Panel Efek Audio</h2>
          <div className="control-grid">
            <Slider label="Kecepatan" value={settings.speed} min={0.5} max={3} step={0.1} suffix="x" onChange={(v) => setSetting('speed', v)} />
            <Slider label="Amplifikasi (dB)" value={settings.amplify} min={-20} max={20} step={1} suffix=" dB" onChange={(v) => setSetting('amplify', v)} />
            <Slider label="Durasi Maks (detik)" value={settings.maxDuration} min={30} max={600} step={10} suffix="s" onChange={(v) => setSetting('maxDuration', v)} />
            <Slider label="Pitch" value={settings.pitch} min={-12} max={12} step={1} suffix=" st" onChange={(v) => setSetting('pitch', v)} />
            <Slider label="Fade In" value={settings.fadeIn} min={0} max={30} step={1} suffix="s" onChange={(v) => setSetting('fadeIn', v)} />
            <Slider label="Fade Out" value={settings.fadeOut} min={0} max={30} step={1} suffix="s" onChange={(v) => setSetting('fadeOut', v)} />
          </div>
          <div className="toggles">
            <label><input type="checkbox" checked={settings.bassBoost} onChange={(e) => setSetting('bassBoost', e.target.checked)} /> Bass Boost</label>
            <label><input type="checkbox" checked={settings.reverb} onChange={(e) => setSetting('reverb', e.target.checked)} /> Reverb</label>
          </div>
        </section>

        <section className="panel">
          <h2>Preview Audio</h2>
          <div ref={waveBoxRef} className="wavebox" />
          {processed ? (
            <audio className="w-full" controls src={processed.audioDataUrl || `${API_BASE}${processed.audioUrl}`} />
          ) : (
            <p className="muted">Hasil konversi akan muncul di sini sebelum diupload.</p>
          )}
          <div className="actions">
            <button className="secondary" onClick={handleProcessClick} disabled={loading || (!audioFile && !youtubeUrl)}>
              {loading ? <Loader2 className="spin" size={18} /> : <Music2 size={18} />} Konversi Audio
            </button>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="panel">
            <h2><Upload size={20} /> Konfigurasi Upload Roblox</h2>
            <div className="segmented">
              <button className={mode === 'personal' ? 'active' : ''} onClick={() => setMode('personal')}>Personal Account</button>
              <button className={mode === 'group' ? 'active' : ''} onClick={() => setMode('group')}>Group</button>
            </div>
            {mode === 'personal' ? (
              <label className="field"><span>Roblox User ID</span><input value={userId} onChange={(e) => setUserId(e.target.value)} /></label>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="field">
                  <span>Pilih Grup Tertaut</span>
                  <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
                    <option value="">Manual / belum pilih</option>
                    {linkedGroupOptions}
                  </select>
                </label>
                <label className="field"><span>Group ID Manual</span><input value={groupId} onChange={(e) => setGroupId(e.target.value)} /></label>
              </div>
            )}
            <label className="field">
              <span className="label-help">Roblox Open Cloud API Key <HelpCircle title="Buka create.roblox.com, masuk Creator Dashboard, pilih Open Cloud API Keys, buat key dengan permission Assets API untuk audio." size={16} /></span>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Disimpan terenkripsi di browser" />
            </label>
            <button className="primary" onClick={convertAndUpload} disabled={loading || (!audioFile && !youtubeUrl && !processed)}>
              {loading ? <Loader2 className="spin" size={18} /> : <Upload size={18} />} Convert & Upload
            </button>
          </section>

          <section className="panel">
            <h2><LinkIcon size={20} /> Manajemen Grup</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="field"><span>Group ID</span><input value={groupForm.groupId} onChange={(e) => setGroupForm({ ...groupForm, groupId: e.target.value })} /></label>
              <label className="field"><span>Creator Roblox User ID</span><input value={groupForm.creatorUserId} onChange={(e) => setGroupForm({ ...groupForm, creatorUserId: e.target.value })} /></label>
              <label className="field"><span>Group API Key</span><input type="password" value={groupForm.apiKey} onChange={(e) => setGroupForm({ ...groupForm, apiKey: e.target.value })} /></label>
            </div>
            <button className="secondary" onClick={addGroup}>Simpan Grup</button>
            <div className="list">
              {groups.map((group) => (
                <div className="list-row" key={group.id}>
                  <div><b>{group.name}</b><p>Group ID {group.groupId} | Creator {group.creatorUserId}</p></div>
                  <button className="icon" onClick={() => setGroups((items) => items.filter((item) => item.id !== group.id))}><Trash2 size={17} /></button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="panel">
          <h2>Dashboard Riwayat Upload</h2>
          <div className="history-grid">
            {history.map((entry) => (
              <article className="history-card" key={entry.id}>
                {entry.thumbnail ? <img src={entry.thumbnail} alt="" /> : <div className="thumb-fallback"><Music2 /></div>}
                <div className="history-body">
                  <div className="history-top">
                    <div>
                      <b>{entry.title}</b>
                      {entry.youtubeUrl && <p>{entry.youtubeUrl}</p>}
                    </div>
                    {entry.expired && <span className="badge bad">EXPIRED</span>}
                  </div>
                  <p className="muted">Kecepatan {entry.settings.speed}x | Amplifikasi {entry.settings.amplify} dB | Durasi Maks {entry.settings.maxDuration}s | Speed Normal (in-game) {entry.speedNormal}</p>
                  <div className="parts">
                    {entry.parts.map((part) => (
                      <div key={`${entry.id}-${part.part}`}>
                        <span>Part {part.part}</span>
                        <StatusBadge status={part.status} />
                        <code>{part.rbxassetid || part.error || 'Menunggu assetId'}</code>
                      </div>
                    ))}
                  </div>
                  <div className="actions">
                    <button className="secondary" onClick={() => copyCenz(entry)}><Copy size={16} /> Copy in CENZ Format</button>
                    <button className="icon" onClick={() => setHistory((items) => items.filter((item) => item.id !== entry.id))}><Trash2 size={17} /></button>
                  </div>
                </div>
              </article>
            ))}
            {!history.length && <p className="muted">Belum ada riwayat upload.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
