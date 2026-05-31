import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WaveSurfer from 'wavesurfer.js';
import CryptoJS from 'crypto-js';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  HelpCircle,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
  Music2,
  ShieldCheck,
  Trash2,
  Upload,
  Youtube,
  User,
  Link as LinkIcon,
  Crown,
  ListMusic,
  Library,
  Receipt,
  Plus,
  Play,
  Search
} from 'lucide-react';
import './styles.css';
import AdminPanel from './AdminPanel.jsx';
import AppShell from './AppShell.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || window.location.origin;
const VITE_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const KEY_SECRET = 'audio-studio-local-key';
const MAX_AUDIO_DURATION_SECONDS = 200;
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
  maxDuration: MAX_AUDIO_DURATION_SECONDS,
  pitch: 0,
  bassBoost: false,
  reverb: false,
  normalize: false,
  echo: false,
  fadeIn: 0,
  fadeOut: 0,
  trimStart: 0,
  trimEnd: 0,
  eqPreset: ''
};

function clampMaxDuration(value) {
  const numeric = Number(value || MAX_AUDIO_DURATION_SECONDS);
  return Math.min(Math.max(numeric, 30), MAX_AUDIO_DURATION_SECONDS);
}

function normalizeSettings(settings = {}) {
  return {
    ...defaultSettings,
    ...settings,
    maxDuration: clampMaxDuration(settings.maxDuration),
    maxDurationLimit: MAX_AUDIO_DURATION_SECONDS
  };
}

const EQ_PRESETS = [
  { value: '', label: 'Flat (default)' },
  { value: 'bass_heavy', label: 'Bass Heavy' },
  { value: 'vocal_clear', label: 'Vocal Clear' },
  { value: 'lo_fi', label: 'Lo-Fi' },
  { value: 'podcast', label: 'Podcast' }
];

const PIPELINE_STEPS = [
  { key: 'info', label: 'Ambil info' },
  { key: 'download', label: 'Download' },
  { key: 'convert', label: 'Konversi' },
  { key: 'upload', label: 'Upload' },
  { key: 'ready', label: 'Asset siap' }
];

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
    return safeParse(localStorage.getItem(key), fallback);
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be full on public/mobile browsers; app should keep running.
    }
  }, [key, value]);
  return [value, setValue];
}

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
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

function robloxPlaybackSpeed(speed) {
  return (1 / Number(speed)).toFixed(2);
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function cleanRobloxId(value) {
  const text = String(value || '').trim();
  return /^\d{2,32}$/.test(text) ? text : '';
}

function apiError(data, fallback) {
  const error = new Error(data?.error || fallback);
  error.details = Array.isArray(data?.details)
    ? data.details.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
    : [];
  return error;
}

function extractYoutubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
    const m1 = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    if (m1) return m1[1];
    const m2 = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (m2) return m2[1];
  } catch {
    return '';
  }
  return '';
}

function compactGroups(items) {
  return (Array.isArray(items) ? items : []).slice(0, 30).map((group) => ({
    id: group.id,
    name: group.name,
    groupId: group.groupId,
    creatorUserId: group.creatorUserId,
    hasApiKey: Boolean(group.hasApiKey || group.encryptedApiKey),
    apiKeyFormat: group.apiKeyFormat || (group.encryptedApiKey ? 'legacy' : 'empty')
  }));
}

function compactHistory(items) {
  return (Array.isArray(items) ? items : []).slice(0, 75).map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    title: entry.title,
    thumbnail: entry.thumbnail,
    youtubeUrl: entry.youtubeUrl,
    settings: entry.settings,
    speedNormal: entry.speedNormal,
    uploadSummary: entry.uploadSummary || null,
    conversion: entry.conversion || null,
    parts: (entry.parts || []).slice(0, 30).map((part) => ({
      part: part.part,
      status: part.status,
      assetId: part.assetId,
      rbxassetid: part.rbxassetid,
      operationId: part.operationId,
      error: part.error,
      trace: (part.trace || []).slice(0, 12)
    })),
    expired: Boolean(entry.expired)
  }));
}

function App() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeInfo, setYoutubeInfo] = useState(null);
  const [youtubePreviewError, setYoutubePreviewError] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [sourceTab, setSourceTab] = useState('youtube');
  const [settings, setSettings] = useState(() => normalizeSettings(defaultSettings));
  const [processed, setProcessed] = useState(null);
  const [stagedSource, setStagedSource] = useState(null);
  const [mode, setMode] = useState('personal');
  const [userId, setUserId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [apiKey, setApiKey] = useState(''); // plaintext sementara saat user input/edit; di-clear setelah save ke server
  const [apiKeyStored, setApiKeyStored] = useState({ hasApiKey: false, format: 'empty' });
  const [history, setHistory] = useStoredState('audio-studio-history', []);
  const [queue, setQueue] = useStoredState('audio-studio-queue', []);
  const [queueInput, setQueueInput] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [groups, setGroups] = useStoredState('audio-studio-groups', []);
  const [groupForm, setGroupForm] = useState({ groupId: '', creatorUserId: '', apiKey: '' });
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('audio-studio-token') || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionStatus, setSessionStatus] = useState(() => (localStorage.getItem('audio-studio-token') ? 'checking' : 'guest'));
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '', code: '', newPassword: '' });
  const [pendingEmail, setPendingEmail] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetStep, setResetStep] = useState('request');
  const [payments, setPayments] = useState([]);
  const [billingForm, setBillingForm] = useState({ plan: 'seven', method: 'qris', step: null });
  const [syncingProfile, setSyncingProfile] = useState(false);
  const lastProfileSyncRef = useRef('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [pipelineStatus, setPipelineStatus] = useState({
    state: 'idle',
    stepIndex: 0,
    message: 'Siap memproses audio.',
    error: '',
    details: []
  });
  const [lastError, setLastError] = useState(null);
  const abortRef = useRef(null);
  const [audioFilePreview, setAudioFilePreview] = useState(null);
  const [lastUploadResult, setLastUploadResult] = useState(null);
  const [robloxCheck, setRobloxCheck] = useState(null);
  const [toast, setToast] = useState(null);
  const [adminMode, setAdminMode] = useState(false);
  const [activePage, setActivePage] = useState('pipeline');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [gatewayInfo, setGatewayInfo] = useState({ midtrans: { enabled: false } });
  const [googleClientId, setGoogleClientId] = useState(VITE_GOOGLE_CLIENT_ID);
  const googleButtonRef = useRef(null);
  const waveRef = useRef(null);
  const waveBoxRef = useRef(null);

  const summary = `Speed: ${settings.speed}x | Amplify: ${settings.amplify} dB | Max: ${settings.maxDuration}s`;
  const selectedGroup = groups.find((group) => group.groupId === selectedGroupId);
  const manualGroupId = cleanRobloxId(groupId);
  const manualGroup = manualGroupId ? groups.find((group) => group.groupId === manualGroupId) : null;
  const activeGroup = selectedGroup || manualGroup || null;
  const activeGroupId = cleanRobloxId(selectedGroup?.groupId || manualGroupId || activeGroup?.groupId);
  const hasStoredApiKeyForMode = mode === 'group'
    ? Boolean(activeGroup?.hasApiKey || (activeGroupId && apiKeyStored?.hasApiKey))
    : Boolean(apiKeyStored?.hasApiKey);

  useEffect(() => {
    // Hapus key lama plain/CryptoJS yang dulu pernah disimpan di localStorage.
    // Mulai sekarang API key disimpan terenkripsi di server saja.
    try {
      if (localStorage.getItem('audio-studio-api-key')) {
        localStorage.removeItem('audio-studio-api-key');
      }
    } catch {
      // localStorage bisa di-block di mode privat
    }
  }, []);

  useEffect(() => {
    if (authToken) {
      localStorage.setItem('audio-studio-token', authToken);
    } else {
      localStorage.removeItem('audio-studio-token');
      setSessionStatus('guest');
    }
  }, [authToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === '1') setActivePage('settings');

    // Handle Discord OAuth redirect: server akan redirect ke /?token=...&source=discord
    const discordToken = params.get('source') === 'discord' ? params.get('token') : '';
    const discordError = params.get('discord_error') || '';
    if (discordToken) {
      setAuthToken(discordToken);
      // bersihkan query supaya token tidak nempel di address bar / history
      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, cleanUrl);
      notify('Login Discord berhasil.');
    } else if (discordError) {
      notify(`Login Discord gagal: ${discordError}`, 'error');
      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    fetch(`${API_BASE}/api/billing/gateway`).then(async (response) => {
      if (response.ok) {
        const data = await response.json();
        setGatewayInfo(data);
        if (data.google?.clientId && !googleClientId) setGoogleClientId(data.google.clientId);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!gatewayInfo.midtrans?.enabled || !gatewayInfo.midtrans?.clientKey) return;
    if (document.getElementById('midtrans-snap-script')) return;
    const script = document.createElement('script');
    script.id = 'midtrans-snap-script';
    script.src = gatewayInfo.midtrans.production
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js';
    script.setAttribute('data-client-key', gatewayInfo.midtrans.clientKey);
    document.head.appendChild(script);
  }, [gatewayInfo]);

  useEffect(() => {
    if (!authToken) {
      setCurrentUser(null);
      setSessionStatus('guest');
      return;
    }
    let cancelled = false;
    setSessionStatus('checking');
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` }
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Sesi login gagal dimuat.');
        if (cancelled) return;
        applyUserProfile(data.user);
        setSessionStatus('authenticated');
      })
      .catch((error) => {
        if (cancelled) return;
        setAuthToken('');
        setSessionStatus('guest');
        if (localStorage.getItem('audio-studio-token')) notify(error.message, 'error');
      });
    return () => { cancelled = true; };
  }, [authToken]);

  useEffect(() => {
    if (!googleClientId) return;
    const scriptId = 'google-identity-script';
    if (document.getElementById(scriptId)) return;
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [googleClientId]);

  useEffect(() => {
    if (currentUser || !googleClientId) return;
    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id || !googleButtonRef.current) {
        setTimeout(tryRender, 500);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (result) => {
          try {
            setSyncingProfile(true);
            const response = await fetch(`${API_BASE}/api/auth/google`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: result.credential })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Login Google gagal.');
            setAuthToken(data.token);
            applyUserProfile(data.user);
            setSessionStatus('authenticated');
            notify('Login Google berhasil.');
          } catch (error) {
            notify(error.message, 'error');
          } finally {
            setSyncingProfile(false);
          }
        }
      });
      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'signin_with',
        width: 320
      });
    };
    tryRender();
    return () => { cancelled = true; };
  }, [currentUser, googleClientId]);

  useEffect(() => {
    if (!authToken || !currentUser) return;
    fetch(`${API_BASE}/api/billing/payments`, { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json();
        if (response.ok) setPayments(data.payments || []);
      })
      .catch(() => {});
  }, [authToken, currentUser?.id]);

  useEffect(() => {
    if (!audioFile) {
      setAudioFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioFilePreview({
      name: audioFile.name,
      size: audioFile.size,
      type: audioFile.type,
      url
    });
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  useEffect(() => {
    const trimmed = youtubeUrl.trim();
    const detected = (() => {
      try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.replace(/^www\./, '');
        if (host === 'youtu.be' && parsed.pathname.length > 1) return 'youtube';
        if (host.endsWith('youtube.com')
          && (parsed.searchParams.has('v') || parsed.pathname.includes('/shorts/') || parsed.pathname.includes('/embed/'))) {
          return 'youtube';
        }
        if (host === 'soundcloud.com' || host === 'm.soundcloud.com' || host === 'on.soundcloud.com' || host === 'snd.sc') {
          return 'soundcloud';
        }
        return '';
      } catch {
        return '';
      }
    })();

    if (!detected) {
      setYoutubeInfo(null);
      setYoutubePreviewError('');
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setYoutubePreviewError('');
        const endpoint = detected === 'soundcloud' ? 'soundcloud-info' : 'youtube-info';
        const response = await fetch(`${API_BASE}/api/${endpoint}?url=${encodeURIComponent(trimmed)}`);
        if (!response.ok) throw new Error('Preview gagal dimuat.');
        const info = await response.json();
        setYoutubeInfo({ ...info, kind: detected });
      } catch (error) {
        setYoutubeInfo(null);
        setYoutubePreviewError('Preview belum bisa dimuat untuk link ini. Konversi masih bisa dicoba jika sumbernya publik.');
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

  useEffect(() => {
    if (!processed?.requestSignature || loading) return;
    if (processed.requestSignature !== currentProcessSignature()) {
      setPipelineStatus((current) => current.state === 'running' ? current : {
        state: 'stale',
        stepIndex: 2,
        message: 'Sumber atau setting berubah. Konversi ulang dibutuhkan sebelum upload agar efek terbaru dipakai.',
        error: ''
      });
    }
  }, [processed, youtubeUrl, audioFile, settings, sourceTab, loading]);

  useEffect(() => {
    setStagedSource(null);
    setProcessed(null);
    setPipelineStatus({
      state: 'idle',
      stepIndex: 0,
      message: 'Tempel link atau pilih file, lalu lanjutkan tahap demi tahap.',
      error: '',
      details: []
    });
  }, [sourceTab, youtubeUrl, audioFile?.name, audioFile?.size, audioFile?.lastModified]);

  // Auto-poll pending asset status setiap 60 detik
  useEffect(() => {
    if (!history.length) return;
    const personalReady = Boolean(apiKey?.trim() || apiKeyStored?.hasApiKey);
    const groupReady = mode === 'group'
      ? Boolean(activeGroup?.hasApiKey || (activeGroupId && apiKeyStored?.hasApiKey))
      : true;
    if (!personalReady && !groupReady) return;
    const hasPending = history.some((entry) => entry.parts?.some((p) => p.status === 'Pending' && p.operationId));
    if (!hasPending) return;

    const interval = setInterval(async () => {
      const inlineKey = apiKey?.trim();
      const keyRef = inlineKey ? '' : (mode === 'group' ? activeGroupId : 'personal');
      if (!inlineKey && !keyRef) return;
      const pendingPairs = [];
      for (const entry of history) {
        for (const part of (entry.parts || [])) {
          if (part.status === 'Pending' && part.operationId) {
            pendingPairs.push({ entryId: entry.id, partNum: part.part, operationId: part.operationId });
            if (pendingPairs.length >= 5) break;
          }
        }
        if (pendingPairs.length >= 5) break;
      }
      if (!pendingPairs.length) return;
      const updates = await Promise.all(pendingPairs.map(async (pair) => {
        try {
          const r = await fetch(`${API_BASE}/api/asset-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({
              operationId: pair.operationId,
              keyRef: keyRef || undefined,
              apiKey: inlineKey || undefined
            })
          });
          if (!r.ok) return null;
          const d = await r.json();
          return { ...pair, ...d };
        } catch { return null; }
      }));
      const valid = updates.filter(Boolean).filter((u) => u.status && u.status !== 'Pending');
      if (!valid.length) return;
      setHistory((items) => items.map((entry) => {
        const matches = valid.filter((u) => u.entryId === entry.id);
        if (!matches.length) return entry;
        return {
          ...entry,
          parts: entry.parts.map((p) => {
            const m = matches.find((x) => x.partNum === p.part);
            if (!m) return p;
            return {
              ...p,
              status: m.status,
              assetId: m.assetId || p.assetId,
              rbxassetid: m.rbxassetid || p.rbxassetid,
              error: m.error || null
            };
          })
        };
      }));
    }, 60000);
    return () => clearInterval(interval);
  }, [history, apiKey, apiKeyStored, mode, activeGroup, activeGroupId, authToken]);

  const linkedGroupOptions = useMemo(() => groups.map((group) => (
    <option key={group.groupId} value={group.groupId}>{group.name} ({group.groupId})</option>
  )), [groups]);

  const filteredHistory = useMemo(() => {
    return history.filter((entry) => {
      // Filter by status
      if (historyFilter !== 'all') {
        const allAccepted = entry.parts?.every((p) => p.status === 'Accepted');
        const anyFailed = entry.parts?.some((p) => p.status === 'Failed');
        const anyPending = entry.parts?.some((p) => p.status === 'Pending' || !p.status);
        if (historyFilter === 'success' && !allAccepted) return false;
        if (historyFilter === 'pending' && !anyPending) return false;
        if (historyFilter === 'failed' && !anyFailed) return false;
      }
      // Search
      if (historySearch.trim()) {
        const term = historySearch.trim().toLowerCase();
        return String(entry.title || '').toLowerCase().includes(term)
          || String(entry.youtubeUrl || '').toLowerCase().includes(term);
      }
      return true;
    });
  }, [history, historyFilter, historySearch]);

  function notify(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  }

  function authHeaders() {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  }

  function handleGroupSelect(value) {
    const clean = cleanRobloxId(value);
    setSelectedGroupId(clean);
    if (clean) setGroupId(clean);
  }

  function handleManualGroupId(value) {
    const clean = cleanRobloxId(value);
    setGroupId(value);
    if (clean && groups.some((group) => group.groupId === clean)) {
      setSelectedGroupId(clean);
    } else if (selectedGroupId && clean !== selectedGroupId) {
      setSelectedGroupId('');
    }
  }

  function profileSignatureFromPublic(profile = {}) {
    const config = profile.robloxConfig || {};
    return JSON.stringify({
      robloxConfig: {
        mode: config.mode || 'personal',
        userId: config.userId || '',
        groupId: config.groupId || '',
        selectedGroupId: config.selectedGroupId || ''
      },
      groups: compactGroups(profile.groups || []).map((group) => ({
        id: group.id,
        name: group.name,
        groupId: group.groupId,
        creatorUserId: group.creatorUserId,
        hasApiKey: Boolean(group.hasApiKey),
        apiKeyFormat: group.apiKeyFormat || (group.hasApiKey ? 'aes-256-gcm' : 'empty')
      })),
      history: compactHistory(profile.history || [])
    });
  }

  function profileSignatureFromPayload(profile = {}, responseProfile = null) {
    const publicProfile = responseProfile || {
      robloxConfig: {
        mode: profile.robloxConfig?.mode || 'personal',
        userId: profile.robloxConfig?.userId || '',
        groupId: profile.robloxConfig?.groupId || '',
        selectedGroupId: profile.robloxConfig?.selectedGroupId || '',
        hasApiKey: apiKeyStored?.hasApiKey || Boolean(profile.robloxConfig?.apiKey),
        apiKeyFormat: profile.robloxConfig?.apiKey ? 'aes-256-gcm' : (apiKeyStored?.format || 'empty')
      },
      groups: (profile.groups || []).map((group) => ({
        ...group,
        hasApiKey: Boolean(group.apiKey || group.hasApiKey),
        apiKeyFormat: group.apiKey ? 'aes-256-gcm' : (group.apiKeyFormat || (group.hasApiKey ? 'aes-256-gcm' : 'empty'))
      })),
      history: profile.history || []
    };
    return profileSignatureFromPublic(publicProfile);
  }

  function profileGroupsMetadata(items = groups) {
    return (Array.isArray(items) ? items : []).map((group) => ({
      id: group.id,
      name: group.name || `Grup ${group.groupId}`,
      groupId: cleanRobloxId(group.groupId),
      creatorUserId: cleanRobloxId(group.creatorUserId),
      hasApiKey: Boolean(group.hasApiKey),
      apiKeyFormat: group.apiKeyFormat || (group.hasApiKey ? 'aes-256-gcm' : 'empty')
    })).filter((group) => group.groupId);
  }

  function profileSnapshot(historyOverride = history) {
    return {
      robloxConfig: {
        mode,
        userId: cleanRobloxId(userId),
        groupId: cleanRobloxId(groupId),
        selectedGroupId: cleanRobloxId(selectedGroupId || activeGroupId)
      },
      groups: profileGroupsMetadata(groups),
      history: compactHistory(historyOverride)
    };
  }

  async function syncProfileSnapshot(historyOverride = history) {
    if (!authToken || !currentUser) return null;
    const profile = profileSnapshot(historyOverride);
    const response = await fetch(`${API_BASE}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ profile })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Gagal sinkron data profil.');
    if (data.user) {
      setCurrentUser(data.user);
      lastProfileSyncRef.current = profileSignatureFromPublic(data.user.profile || {});
    }
    return data.user || null;
  }

  function applyUserProfile(user) {
    setCurrentUser(user);
    const profile = user.profile || {};
    const config = profile.robloxConfig || {};
    setMode(config.mode || 'personal');
    setUserId(config.userId || '');
    setGroupId(config.groupId || '');
    setSelectedGroupId(config.selectedGroupId || '');
    setApiKey(''); // server-side enkripsi, plaintext tidak pernah dikirim balik ke browser
    setApiKeyStored({
      hasApiKey: Boolean(config.hasApiKey),
      format: config.apiKeyFormat || (config.hasApiKey ? 'aes-256-gcm' : 'empty')
    });
    setGroups(compactGroups(profile.groups));
    setHistory(compactHistory(profile.history));
    lastProfileSyncRef.current = profileSignatureFromPublic(profile);
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (!authForm.username.trim() || !authForm.password) {
      notify('Username/email dan password wajib diisi.', 'error');
      return;
    }
    if (authMode === 'register' && !authForm.email.trim()) {
      notify('Email wajib diisi untuk daftar akun.', 'error');
      return;
    }
    try {
      setSyncingProfile(true);
      const response = await fetch(`${API_BASE}/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login gagal.');
      if (authMode === 'register' && !data.token) {
        setPendingEmail(authForm.email);
        notify(data.devCode ? `Kode verifikasi dev: ${data.devCode}` : 'Kode verifikasi dikirim ke email.');
        return;
      }
      setAuthToken(data.token);
      applyUserProfile(data.user);
      setSessionStatus('authenticated');
      setActivePage('pipeline');
      notify(authMode === 'login' ? 'Login berhasil.' : 'Akun berhasil dibuat.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSyncingProfile(false);
    }
  }

  async function verifyEmail(event) {
    event.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/api/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail || authForm.email, code: authForm.code })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Verifikasi gagal.');
      setAuthToken(data.token);
      applyUserProfile(data.user);
      setSessionStatus('authenticated');
      setActivePage('pipeline');
      setPendingEmail('');
      notify('Email berhasil diverifikasi.');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function resendCode() {
    try {
      const response = await fetch(`${API_BASE}/api/auth/resend-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail || authForm.email })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal kirim ulang kode.');
      notify(data.devCode ? `Kode verifikasi dev: ${data.devCode}` : 'Kode verifikasi dikirim ulang.');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function googleLogin() {
    if (!googleClientId || !window.google?.accounts?.id) {
      notify('Google Login belum tersedia. Coba refresh halaman.', 'error');
      return;
    }
    window.google.accounts.id.prompt();
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    const email = authForm.email || authForm.username;
    if (!email) {
      notify('Masukkan email akunmu.', 'error');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal mengirim kode reset.');
      setPendingEmail(email);
      setResetStep('confirm');
      notify(data.devCode ? `Kode reset dev: ${data.devCode}` : 'Kode reset dikirim ke email.');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingEmail || authForm.email || authForm.username,
          code: authForm.code,
          password: authForm.newPassword
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Reset password gagal.');
      setAuthToken(data.token);
      applyUserProfile(data.user);
      setSessionStatus('authenticated');
      setActivePage('pipeline');
      setResetMode(false);
      setResetStep('request');
      setPendingEmail('');
      notify('Password berhasil direset. Kamu sudah login.');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function saveProfile() {
    if (!authToken || !currentUser) return;
    const inlineApiKey = apiKey?.trim();
    const groupTargetId = mode === 'group' ? activeGroupId : '';
    const groupKeyTargetId = groupTargetId || cleanRobloxId(selectedGroupId) || cleanRobloxId(groupId);
    const groupsForSave = groups.some((group) => group.groupId === groupKeyTargetId)
      ? groups
      : (mode === 'group' && groupKeyTargetId && inlineApiKey)
        ? [
          ...groups,
          {
            id: crypto.randomUUID(),
            name: `Grup ${groupKeyTargetId}`,
            groupId: groupKeyTargetId,
            creatorUserId: '',
            hasApiKey: false,
            apiKeyFormat: 'empty'
          }
        ]
        : groups;
    const groupsPayload = groupsForSave.map((group) => {
      const out = {
        id: group.id,
        name: group.name || `Grup ${group.groupId}`,
        groupId: cleanRobloxId(group.groupId),
        creatorUserId: cleanRobloxId(group.creatorUserId),
        hasApiKey: Boolean(group.hasApiKey),
        apiKeyFormat: group.apiKeyFormat || (group.hasApiKey ? 'aes-256-gcm' : 'empty')
      };
      // Hanya kirim plaintext kalau user baru saja edit. Kalau tidak, server akan keep value yang sudah tersimpan.
      if (group.apiKey && String(group.apiKey).trim()) out.apiKey = String(group.apiKey).trim();
      if (mode === 'group' && inlineApiKey && groupKeyTargetId && out.groupId === groupKeyTargetId) {
        out.apiKey = inlineApiKey;
        out.hasApiKey = true;
        out.apiKeyFormat = 'aes-256-gcm';
      }
      return out;
    }).filter((group) => group.groupId);
    if (userId.trim() && !cleanRobloxId(userId)) {
      notify('Roblox User ID harus angka.', 'error');
      return;
    }
    if (groupId.trim() && !cleanRobloxId(groupId)) {
      notify('Group ID manual harus angka.', 'error');
      return;
    }
    const invalidGroup = groupsPayload.find((group) =>
      (group.groupId && !cleanRobloxId(group.groupId))
      || (group.creatorUserId && !cleanRobloxId(group.creatorUserId)));
    if (invalidGroup) {
      notify('Group ID dan Creator User ID harus angka.', 'error');
      return;
    }
    const profile = {
      robloxConfig: {
        mode,
        userId: cleanRobloxId(userId),
        groupId: cleanRobloxId(groupId),
        selectedGroupId: cleanRobloxId(selectedGroupId || groupKeyTargetId),
        ...(mode === 'personal' && inlineApiKey ? { apiKey: inlineApiKey } : {})
      },
      groups: groupsPayload,
      history: compactHistory(history)
    };
    const profileJson = profileSignatureFromPayload(profile);
    const hasNewSecret = Boolean(inlineApiKey || groupsPayload.some((group) => group.apiKey));
    if (!hasNewSecret && profileJson === lastProfileSyncRef.current) {
      notify('Data Roblox sudah tersimpan.', 'info');
      return;
    }

    try {
      setSyncingProfile(true);
      const response = await fetch(`${API_BASE}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ profile })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal menyimpan profile.');
      // Server hanya kirim balik metadata API key (hasApiKey, format), plaintext sekali kirim sudah dihapus dari memory di sini
      if (inlineApiKey) setApiKey('');
      if (groupsPayload.some((g) => g.apiKey)) {
        setGroups((items) => items.map((group) => ({ ...group, apiKey: undefined })));
      }
      applyUserProfile(data.user);
      const newConfig = data.user?.profile?.robloxConfig || {};
      setApiKeyStored({ hasApiKey: Boolean(newConfig.hasApiKey), format: newConfig.apiKeyFormat || 'empty' });
      lastProfileSyncRef.current = profileSignatureFromPublic(data.user?.profile || {});
      notify('Data Roblox berhasil disimpan ke akun.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSyncingProfile(false);
    }
  }

  function logout() {
    setAuthToken('');
    setCurrentUser(null);
    setSessionStatus('guest');
    setActivePage('pipeline');
    setAuthMode('login');
    setResetMode(false);
    setPendingEmail('');
    notify('Logout berhasil.');
  }

  async function startDiscordLogin() {
    try {
      const response = await fetch(`${API_BASE}/api/auth/discord/url`);
      const data = await response.json();
      if (!response.ok || !data.enabled || !data.url) {
        notify(data.error || 'Discord login belum tersedia di server.', 'error');
        return;
      }
      window.location.href = data.url;
    } catch (error) {
      notify(`Gagal memulai login Discord: ${error.message}`, 'error');
    }
  }

  async function createPaymentRequest() {
    if (!authToken) {
      notify('Login dulu untuk berlangganan.', 'error');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/billing/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(billingForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal membuat invoice.');
      setPayments((items) => [data.payment, ...items].slice(0, 20));
      if (data.payment?.snapToken && window.snap?.pay) {
        window.snap.pay(data.payment.snapToken, {
          onSuccess: () => { notify('Pembayaran sukses, menunggu konfirmasi.'); refreshPayments(); },
          onPending: () => { notify('Pembayaran pending. Selesaikan di metode pilihanmu.'); },
          onError: () => { notify('Pembayaran gagal.', 'error'); },
          onClose: () => { notify('Popup pembayaran ditutup.'); }
        });
      } else {
        notify('Invoice langganan dibuat.');
      }
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function refreshPayments() {
    if (!authToken) return;
    try {
      const response = await fetch(`${API_BASE}/api/billing/payments`, { headers: authHeaders() });
      const data = await response.json();
      if (response.ok) setPayments(data.payments || []);
    } catch {
      // diabaikan
    }
  }

  function setSetting(key, value) {
    setSettings((current) => normalizeSettings({ ...current, [key]: value }));
  }

  function currentProcessSignature() {
    return JSON.stringify({
      sourceTab,
      youtubeUrl: sourceTab === 'youtube' ? youtubeUrl.trim() : '',
      audioFile: audioFile ? {
        name: audioFile.name,
        size: audioFile.size,
        lastModified: audioFile.lastModified
      } : null,
      stagedSource: stagedSource ? {
        sourceFile: stagedSource.sourceFile,
        title: stagedSource.title,
        sourceDuration: stagedSource.sourceDuration
      } : null,
      settings
    });
  }

  function currentSourceMeta() {
    return {
      title: youtubeInfo?.title || stagedSource?.title || '',
      thumbnail: youtubeInfo?.thumbnail || stagedSource?.thumbnail || '',
      duration: youtubeInfo?.duration || stagedSource?.sourceDuration || 0,
      durationSource: youtubeInfo?.durationSource || stagedSource?.durationSource || 'client-preview'
    };
  }

  function neededInputSecondsForSettings() {
    const speed = Math.min(Math.max(Number(settings.speed || 1), 0.5), 3);
    const maxDuration = clampMaxDuration(settings.maxDuration);
    const trimStart = Math.max(0, Number(settings.trimStart || 0));
    const trimEnd = Math.max(0, Number(settings.trimEnd || 0));
    const neededInput = Math.ceil(maxDuration * speed + 12);
    return trimEnd > trimStart ? trimEnd : trimStart + neededInput;
  }

  function getRobloxUploadContext() {
    const hasInline = Boolean(apiKey?.trim());
    const groupHasStoredKey = Boolean(activeGroup?.hasApiKey || (activeGroupId && apiKeyStored?.hasApiKey));
    const personalHasStoredKey = Boolean(apiKeyStored?.hasApiKey);
    if (mode === 'group') {
      const targetGroupId = activeGroupId;
      if (!targetGroupId) throw new Error('Mode Group butuh Group ID angka yang valid.');
      if (!hasInline && !groupHasStoredKey) {
        throw new Error('Group ini belum punya API key tersimpan. Pilih grup tertaut, isi Group ID manual yang sama dengan grup tersimpan, atau tempel API key lalu klik Simpan Data Roblox.');
      }
      return {
        keyRef: hasInline ? '' : targetGroupId,
        inlineApiKey: hasInline ? apiKey.trim() : '',
        creator: { groupId: targetGroupId },
        label: `Group ${targetGroupId}`
      };
    }
    const targetUserId = cleanRobloxId(userId);
    if (!targetUserId) throw new Error('Mode Personal butuh Roblox User ID angka yang valid.');
    if (!hasInline && !personalHasStoredKey) {
      throw new Error('Isi Roblox Open Cloud API Key di halaman API Keys dulu, lalu klik Simpan supaya tersimpan terenkripsi di server.');
    }
    return {
      keyRef: hasInline ? '' : 'personal',
      inlineApiKey: hasInline ? apiKey.trim() : '',
      creator: { userId: targetUserId },
      label: `User ${targetUserId}`
    };
  }

  function setStep(index, text) {
    setLoadingStepIndex(index);
    setLoadingStep(text);
    setPipelineStatus((current) => ({
      ...current,
      state: 'running',
      stepIndex: index,
      message: text,
      error: '',
      details: []
    }));
  }

  function finishPipeline(state, stepIndex, message) {
    setPipelineStatus({
      state,
      stepIndex,
      message,
      error: '',
      details: []
    });
  }

  function failPipeline(error, fallbackStep = 0) {
    setPipelineStatus((current) => ({
      state: 'error',
      stepIndex: current.state === 'running' ? current.stepIndex : fallbackStep,
      message: error.message,
      error: error.message,
      details: Array.isArray(error.details) ? error.details : []
    }));
  }

  async function downloadSourceOnly() {
    if (!authToken) throw new Error('Login dulu sebelum konversi audio.');
    if (!audioFile && !youtubeUrl.trim()) throw new Error('Pilih file audio atau masukkan URL YouTube/SoundCloud dulu.');
    const form = new FormData();
    if (audioFile) form.append('audio', audioFile);
    if (youtubeUrl) form.append('sourceUrl', youtubeUrl.trim());
    if (youtubeInfo) {
      form.append('sourceMeta', JSON.stringify(currentSourceMeta()));
    }
    form.append('settings', JSON.stringify(settings));
    const sourceLabel = youtubeInfo?.kind === 'soundcloud' ? 'SoundCloud' : (youtubeUrl ? 'YouTube' : '');
    setStep(1, sourceLabel
      ? `Server mendownload audio ${sourceLabel} sebagai sumber edit...`
      : 'Server menyiapkan file audio sebagai sumber edit...');
    const controller = new AbortController();
    abortRef.current = controller;
    const response = await fetch(`${API_BASE}/api/download-source`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw apiError(data, 'Download sumber audio gagal.');
    setStagedSource(data);
    setProcessed(null);
    finishPipeline('downloaded', 1, `Sumber siap diedit: ${data.title || 'Audio'}${data.sourceDuration ? ` (${formatDuration(data.sourceDuration)})` : ''}.`);
    notify('Sumber audio siap diedit.');
    return data;
  }

  async function processOnly() {
    if (!authToken) throw new Error('Login dulu sebelum konversi audio.');
    if (!stagedSource?.sourceFile) throw new Error('Download sumber audio dulu sebelum konversi.');
    if (stagedSource.downloadedSectionEnd && neededInputSecondsForSettings() > Number(stagedSource.downloadedSectionEnd) + 2) {
      throw new Error('Setting durasi/trim sekarang butuh sumber lebih panjang. Klik Download Ulang, lalu konversi lagi.');
    }
    const requestSignature = currentProcessSignature();
    const form = new FormData();
    form.append('sourceFile', stagedSource.sourceFile);
    form.append('sourceUrl', stagedSource.sourceUrl || youtubeUrl.trim());
    form.append('sourceMeta', JSON.stringify({
      title: stagedSource.title || currentSourceMeta().title,
      thumbnail: stagedSource.thumbnail || currentSourceMeta().thumbnail,
      duration: stagedSource.sourceDuration || currentSourceMeta().duration,
      durationSource: stagedSource.durationSource || currentSourceMeta().durationSource
    }));
    form.append('settings', JSON.stringify(settings));
    setStep(2, 'FFmpeg menerapkan preset/manual dan membuat output OGG...');
    const controller = new AbortController();
    abortRef.current = controller;
    const response = await fetch(`${API_BASE}/api/convert-source`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw apiError(data, 'Konversi audio gagal.');
    const converted = { ...data, requestSignature };
    if (data.account) {
      setCurrentUser((user) => user ? { ...user, usage: data.account.usage, subscription: data.account.subscription } : user);
    }
    setProcessed(converted);
    finishPipeline('converted', 2, `Konversi berhasil: output ${formatDuration(data.duration)} ${data.output?.format?.toUpperCase() || 'OGG'} siap diputar.`);
    notify('Konversi Audio selesai.');
    return converted;
  }

  async function convertAndUpload() {
    if (loading) return;
    try {
      setLastError(null);
      setLastUploadResult(null);
      setLoading(true);
      if (!processed) throw new Error('Konversi OGG dulu sebelum upload Roblox.');
      if (pipelineStatus.state === 'stale') throw new Error('Preset/manual sudah berubah. Konversi ulang OGG dulu sebelum upload.');
      const result = processed;
      const robloxTarget = getRobloxUploadContext();
      setStep(3, 'Mengirim audio ke Roblox...');
      const audioSource = result.audioDataUrl || `${API_BASE}${result.audioUrl}`;
      const blob = await fetch(audioSource).then((response) => response.blob());
      const form = new FormData();
      form.append('audio', blob, result.fileName);
      const appliedSettings = result.appliedSettings || settings;
      form.append('payload', JSON.stringify({
        keyRef: robloxTarget.keyRef || undefined,
        apiKey: robloxTarget.inlineApiKey || undefined,
        creator: robloxTarget.creator,
        splitDuration: 180,
        maxDuration: appliedSettings.maxDuration,
        displayName: result.title,
        description: `Speed ${appliedSettings.speed}x, Amplifikasi ${appliedSettings.amplify} dB`
      }));

      setStep(3, 'Menunggu Roblox memproses asset...');
      const controller = new AbortController();
      abortRef.current = controller;
      const response = await fetch(`${API_BASE}/api/upload-roblox`, {
        method: 'POST',
        body: form,
        headers: { ...authHeaders() },
        signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload Roblox gagal.');
      const uploadSummary = data.uploadSummary || {
        partCount: data.parts?.length || 0,
        accepted: data.parts?.filter((part) => part.status === 'Accepted').length || 0,
        failed: data.parts?.filter((part) => part.status === 'Failed').length || 0,
        pending: data.parts?.filter((part) => part.status === 'Pending').length || 0,
        split: data.wasSplit
      };

      const entry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        title: result.title,
        thumbnail: result.thumbnail,
        youtubeUrl,
        settings: appliedSettings,
        speedNormal: (1 / appliedSettings.speed).toFixed(2),
        parts: data.parts,
        uploadSummary,
        conversion: {
          sourceDuration: result.sourceDuration,
          duration: result.duration,
          effects: result.appliedEffects || []
        },
        expired: false
      };
      const nextHistory = compactHistory([entry, ...history]);
      setHistory(nextHistory);
      setLastUploadResult(entry);
      syncProfileSnapshot(nextHistory).catch((error) => {
        notify(`Upload berhasil, tapi sinkron riwayat gagal: ${error.message}`, 'error');
      });
      if (uploadSummary.failed && !uploadSummary.accepted && !uploadSummary.pending) {
        finishPipeline('error', 3, 'Upload terkirim, tetapi Roblox menolak semua part. Lihat detail error per part.');
        notify('Upload Roblox gagal pada semua part.', 'error');
      } else {
        const message = uploadSummary.pending
          ? `Upload terkirim ke ${robloxTarget.label}. ${uploadSummary.pending} part masih pending moderasi Roblox.`
          : `Asset berhasil diupload ke ${robloxTarget.label}.`;
        finishPipeline('uploaded', 4, message);
        notify(uploadSummary.pending ? 'Upload terkirim, menunggu moderasi Roblox.' : 'Terunggah ke Roblox.', uploadSummary.pending ? 'info' : 'success');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        notify('Konversi dibatalkan.', 'info');
      } else {
        setLastError(error.message);
        failPipeline(error, 3);
        notify(error.message, 'error');
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      setLoadingStep('');
      setLoadingStepIndex(0);
    }
  }

  async function handleProcessClick() {
    if (loading) return;
    try {
      setLastError(null);
      setLoading(true);
      setStep(2, 'Memulai konversi OGG...');
      await processOnly();
    } catch (error) {
      if (error.name === 'AbortError') {
        notify('Konversi dibatalkan.', 'info');
      } else {
        setLastError(error.message);
        failPipeline(error, 0);
        notify(error.message, 'error');
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      setLoadingStep('');
      setLoadingStepIndex(0);
    }
  }

  async function handleDownloadSourceClick() {
    if (loading) return;
    try {
      setLastError(null);
      setLoading(true);
      setStep(0, 'Menyiapkan sumber audio...');
      await downloadSourceOnly();
    } catch (error) {
      if (error.name === 'AbortError') {
        notify('Download dibatalkan.', 'info');
      } else {
        setLastError(error.message);
        failPipeline(error, 1);
        notify(error.message, 'error');
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      setLoadingStep('');
      setLoadingStepIndex(0);
    }
  }

  function cancelLoading() {
    abortRef.current?.abort();
  }

  function retryPipelineStep() {
    const stepIndex = pipelineStatus.stepIndex || 0;
    setLastError(null);
    if (stepIndex <= 1) {
      handleDownloadSourceClick();
      return;
    }
    if (stepIndex === 2) {
      handleProcessClick();
      return;
    }
    convertAndUpload();
  }

  function clearPipelineError() {
    setLastError(null);
    setPipelineStatus((current) => current.state === 'error'
      ? {
          state: 'idle',
          stepIndex: 0,
          message: 'Siap lanjut. Periksa input, lalu jalankan tahap yang dibutuhkan.',
          error: '',
          details: []
        }
      : current);
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
      apiKey: groupForm.apiKey, // plaintext sementara, akan dikirim ke server saat saveProfile()
      hasApiKey: true,
      apiKeyFormat: 'aes-256-gcm'
    };
    setGroups((items) => [group, ...items.filter((item) => item.groupId !== group.groupId)]);
    setSelectedGroupId(group.groupId);
    setGroupForm({ groupId: '', creatorUserId: '', apiKey: '' });
    notify('Grup ditambahkan. Klik Simpan Semua Grup supaya tersimpan terenkripsi di server.');
  }

  function copyCenz(entry) {
    const ids = entry.parts.filter((part) => part.rbxassetid).map((part, index) => `[${index + 1}] = "${part.rbxassetid}"`).join(',\n');
    navigator.clipboard.writeText(`{\n${ids}\n}`);
    notify('Format CENZ disalin.');
  }

  function reuseEntry(entry) {
    if (entry.youtubeUrl) {
      setYoutubeUrl(entry.youtubeUrl);
      setAudioFile(null);
    }
    if (entry.settings) {
      setSettings(normalizeSettings(entry.settings));
    }
    setProcessed(null);
    setActivePage('pipeline');
    notify('Settings dimuat dari riwayat. Klik Convert untuk ulang.');
  }

  // === YouTube Queue helpers ===
  function addToQueue(url) {
    const trimmed = (url ?? queueInput).trim();
    if (!trimmed) {
      notify('URL kosong.', 'error');
      return;
    }
    const id = extractYoutubeId(trimmed);
    if (!id) {
      notify('URL bukan link YouTube valid.', 'error');
      return;
    }
    if (queue.some((q) => q.id === id)) {
      notify('Sudah ada di queue.', 'info');
      return;
    }
    setQueue((items) => [
      { id, url: trimmed, addedAt: new Date().toISOString() },
      ...items
    ].slice(0, 50));
    setQueueInput('');
    notify('Ditambah ke queue.');
  }

  function loadFromQueue(item) {
    setSourceTab('youtube');
    setYoutubeUrl(item.url);
    setAudioFile(null);
    setProcessed(null);
    setActivePage('pipeline');
    notify('Dimuat ke pipeline. Klik Konversi.');
  }

  function removeFromQueue(id) {
    setQueue((items) => items.filter((q) => q.id !== id));
  }

  // === Asset Library: kumpulkan parts dari history yang sudah Accepted ===
  const libraryAssets = useMemo(() => {
    const list = [];
    for (const entry of history) {
      for (const part of (entry.parts || [])) {
        if (part.status === 'Accepted' && part.rbxassetid) {
          list.push({
            entryId: entry.id,
            partKey: `${entry.id}-${part.part}`,
            title: entry.title,
            thumbnail: entry.thumbnail,
            createdAt: entry.createdAt,
            partNum: part.part,
            assetId: part.assetId,
            rbxassetid: part.rbxassetid
          });
        }
      }
    }
    if (!librarySearch.trim()) return list;
    const term = librarySearch.trim().toLowerCase();
    return list.filter((item) =>
      String(item.title || '').toLowerCase().includes(term) ||
      String(item.rbxassetid || '').toLowerCase().includes(term)
    );
  }, [history, librarySearch]);

  async function testRobloxConnection() {
    try {
      const target = getRobloxUploadContext();
      setRobloxCheck({ ok: null, message: 'Mengecek koneksi Roblox...', trace: [] });
      const response = await fetch(`${API_BASE}/api/roblox-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          keyRef: target.keyRef || undefined,
          apiKey: target.inlineApiKey || undefined,
          creator: target.creator
        })
      });
      const data = await response.json();
      setRobloxCheck(data);
      if (data.ok) notify(data.message || 'API key valid. Roblox API menerima koneksi.');
      else notify(data.error || 'Test koneksi gagal.', 'error');
    } catch (error) {
      setRobloxCheck({ ok: false, error: error.message, trace: [{ step: 'Validasi', status: 'Failed', message: error.message }] });
      notify(error.message, 'error');
    }
  }

  async function recheckPart(entry, part) {
    if (!part.operationId) {
      notify('Part ini tidak punya operationId, tidak bisa dicek.', 'error');
      return;
    }
    const inlineKey = apiKey?.trim();
    const groupRef = mode === 'group' ? activeGroupId : '';
    const personalReady = apiKeyStored?.hasApiKey;
    const groupReady = Boolean(activeGroup?.hasApiKey || (activeGroupId && apiKeyStored?.hasApiKey));
    if (!inlineKey && !((mode === 'group' && groupReady) || (mode !== 'group' && personalReady))) {
      notify('Isi API key Roblox dulu di halaman API Keys untuk cek ulang.', 'error');
      return;
    }
    const keyRef = inlineKey ? '' : (groupRef || 'personal');
    try {
      const response = await fetch(`${API_BASE}/api/asset-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          operationId: part.operationId,
          keyRef: keyRef || undefined,
          apiKey: inlineKey || undefined
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal cek status.');
      const nextHistory = history.map((item) => {
        if (item.id !== entry.id) return item;
        return {
          ...item,
          parts: item.parts.map((p) => p.part === part.part ? {
            ...p,
            status: data.status || p.status,
            assetId: data.assetId || p.assetId,
            rbxassetid: data.rbxassetid || p.rbxassetid,
            error: data.error || null
          } : p)
        };
      });
      setHistory(nextHistory);
      syncProfileSnapshot(nextHistory).catch(() => {});
      if (data.status === 'Accepted') notify('Asset sudah diterima Roblox.');
      else if (data.status === 'Failed') notify(data.error || 'Asset ditolak Roblox.', 'error');
      else notify('Masih dalam review Roblox.', 'info');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  function openAdminMode() {
    if (currentUser?.role === 'admin') {
      setAdminMode(true);
      return;
    }
    notify('Akses CMS hanya untuk akun admin. Login memakai akun admin dulu.', 'error');
  }

  function exitAdmin() {
    setAdminMode(false);
  }

  function renderAuthCard() {
    if (resetMode) {
      return resetStep === 'request' ? (
        <form className="auth-card-form" onSubmit={handleForgotPassword}>
          <div className="auth-card-heading">
            <KeyRound size={20} />
            <div>
              <h2>Reset Password</h2>
              <p>Masukkan email akunmu.</p>
            </div>
          </div>
          <label className="auth-field">
            <span>Email</span>
            <div>
              <Mail size={17} />
              <input
                type="email"
                value={authForm.email || authForm.username}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value, username: e.target.value })}
                autoComplete="email"
                placeholder="nama@email.com"
              />
            </div>
          </label>
          <button className="primary auth-main-button" disabled={syncingProfile}>
            {syncingProfile ? <Loader2 className="spin" size={17} /> : <ArrowRight size={17} />}
            Kirim Kode Reset
          </button>
          <button type="button" className="auth-link-button" onClick={() => { setResetMode(false); setResetStep('request'); }}>
            Kembali ke Login
          </button>
        </form>
      ) : (
        <form className="auth-card-form" onSubmit={handleResetPassword}>
          <div className="auth-card-heading">
            <KeyRound size={20} />
            <div>
              <h2>Password Baru</h2>
              <p>Kode reset untuk {pendingEmail || authForm.email || authForm.username}.</p>
            </div>
          </div>
          <label className="auth-field">
            <span>Kode Reset</span>
            <div>
              <ShieldCheck size={17} />
              <input
                value={authForm.code}
                onChange={(e) => setAuthForm({ ...authForm, code: e.target.value })}
                autoComplete="one-time-code"
                placeholder="6 digit kode"
              />
            </div>
          </label>
          <label className="auth-field">
            <span>Password Baru</span>
            <div>
              <LockKeyhole size={17} />
              <input
                type="password"
                value={authForm.newPassword}
                onChange={(e) => setAuthForm({ ...authForm, newPassword: e.target.value })}
                autoComplete="new-password"
                placeholder="Minimal 6 karakter"
              />
            </div>
          </label>
          <button className="primary auth-main-button" disabled={syncingProfile}>
            {syncingProfile ? <Loader2 className="spin" size={17} /> : <ArrowRight size={17} />}
            Reset Password
          </button>
          <button type="button" className="auth-link-button" onClick={() => { setResetMode(false); setResetStep('request'); setPendingEmail(''); }}>
            Kembali ke Login
          </button>
        </form>
      );
    }

    if (pendingEmail) {
      return (
        <form className="auth-card-form" onSubmit={verifyEmail}>
          <div className="auth-card-heading">
            <ShieldCheck size={20} />
            <div>
              <h2>Verifikasi Email</h2>
              <p>{pendingEmail}</p>
            </div>
          </div>
          <label className="auth-field">
            <span>Kode Verifikasi</span>
            <div>
              <ShieldCheck size={17} />
              <input
                value={authForm.code}
                onChange={(e) => setAuthForm({ ...authForm, code: e.target.value })}
                autoComplete="one-time-code"
                placeholder="6 digit kode"
              />
            </div>
          </label>
          <button className="primary auth-main-button" disabled={syncingProfile}>
            {syncingProfile ? <Loader2 className="spin" size={17} /> : <ArrowRight size={17} />}
            Verifikasi Email
          </button>
          <button type="button" className="secondary auth-secondary-button" onClick={resendCode}>Kirim Ulang Kode</button>
          <button type="button" className="auth-link-button" onClick={() => { setPendingEmail(''); setAuthMode('login'); }}>
            Kembali ke Login
          </button>
        </form>
      );
    }

    return (
      <form className="auth-card-form" onSubmit={handleAuth}>
        <div className="auth-card-heading">
          <LogIn size={20} />
          <div>
            <h2>{authMode === 'login' ? 'Masuk ke Audio Studio' : 'Buat Akun'}</h2>
            <p>{authMode === 'login' ? 'Sesi tersimpan otomatis di browser ini.' : 'Akun baru perlu verifikasi email.'}</p>
          </div>
        </div>
        <div className="auth-toggle" role="tablist" aria-label="Mode autentikasi">
          <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
          <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Daftar</button>
        </div>
        <label className="auth-field">
          <span>Username / Email</span>
          <div>
            <User size={17} />
            <input
              value={authForm.username}
              onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
              autoComplete="username"
              placeholder="username atau email"
            />
          </div>
        </label>
        {authMode === 'register' && (
          <label className="auth-field">
            <span>Email</span>
            <div>
              <Mail size={17} />
              <input
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                autoComplete="email"
                placeholder="nama@email.com"
              />
            </div>
          </label>
        )}
        <label className="auth-field">
          <span>Password</span>
          <div>
            <LockKeyhole size={17} />
            <input
              type="password"
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              placeholder="Password"
            />
          </div>
        </label>
        <button className="primary auth-main-button" disabled={syncingProfile}>
          {syncingProfile ? <Loader2 className="spin" size={17} /> : <ArrowRight size={17} />}
          {authMode === 'login' ? 'Login' : 'Buat Akun'}
        </button>
        {authMode === 'login' && (
          <button type="button" className="auth-link-button" onClick={() => setResetMode(true)}>
            Lupa Password?
          </button>
        )}
        {googleClientId && (
          <>
            <div className="auth-divider"><span>atau</span></div>
            <div ref={googleButtonRef} className="google-btn-slot auth-google-slot" />
          </>
        )}
        {gatewayInfo?.discord?.enabled && (
          <>
            {!googleClientId && <div className="auth-divider"><span>atau</span></div>}
            <button type="button" className="discord-button auth-discord-slot" onClick={startDiscordLogin}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.319 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.027c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.245.198.371.292a.077.077 0 0 1-.006.128 12.299 12.299 0 0 1-1.873.891.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.418 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.094 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.156-1.085-2.156-2.418 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.094 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
              Lanjut dengan Discord
            </button>
          </>
        )}
      </form>
    );
  }

  function renderAuthScreen() {
    const checking = sessionStatus === 'checking' || sessionStatus === 'authenticated';
    return (
      <main className="auth-page">
        <Toast toast={toast} />
        <section className="auth-layout" aria-busy={checking}>
          <div className="auth-brand-panel">
            <div className="auth-logo-mark">L</div>
            <p className="auth-kicker">LuciVoid Audio Studio</p>
            <h1>Konversi audio dan upload Roblox dalam satu dashboard.</h1>
            <div className="auth-benefits">
              <span><CheckCircle2 size={16} /> Preset tersimpan</span>
              <span><CheckCircle2 size={16} /> Riwayat browser & akun</span>
              <span><CheckCircle2 size={16} /> Roblox Open Cloud</span>
            </div>
          </div>
          <div className="auth-card">
            {checking ? (
              <div className="auth-checking">
                <Loader2 className="spin" size={32} />
                <h2>Memuat sesi</h2>
                <p>Login otomatis dari browser sedang dicek.</p>
              </div>
            ) : renderAuthCard()}
          </div>
        </section>
      </main>
    );
  }

  function pipelineStepStatus(idx) {
    if (loading) {
      if (idx < loadingStepIndex) return 'done';
      if (idx === loadingStepIndex) return 'active';
      return 'pending';
    }
    if (pipelineStatus.state === 'uploaded') return 'done';
    if (pipelineStatus.state === 'converted' || pipelineStatus.state === 'stale') {
      if (idx <= 2) return 'done';
      return 'pending';
    }
    if (pipelineStatus.state === 'downloaded') {
      if (idx <= 1) return 'done';
      return 'pending';
    }
    if (pipelineStatus.state === 'error') {
      if (idx < pipelineStatus.stepIndex) return 'done';
      if (idx === pipelineStatus.stepIndex) return 'error';
      return 'pending';
    }
    return 'pending';
  }

  function actionStatus(kind) {
    const errorText = lastError || pipelineStatus.error || pipelineStatus.message;
    if (kind === 'download') {
      if (loading && loadingStepIndex <= 1) {
        return { state: 'active', text: loadingStep || 'Download sedang berjalan...' };
      }
      if (pipelineStatus.state === 'error' && pipelineStatus.stepIndex <= 1) {
        return { state: 'error', text: errorText };
      }
      if (stagedSource) return { state: 'done', text: 'Sumber audio sudah siap.' };
      if (audioFile || youtubeUrl.trim()) return { state: 'pending', text: 'Siap download sumber.' };
      return { state: 'pending', text: 'Pilih file atau tempel link dulu.' };
    }

    if (kind === 'convert') {
      if (loading && loadingStepIndex === 2) {
        return { state: 'active', text: loadingStep || 'Konversi sedang berjalan...' };
      }
      if (pipelineStatus.state === 'error' && pipelineStatus.stepIndex === 2) {
        return { state: 'error', text: errorText };
      }
      if (pipelineStatus.state === 'stale') return { state: 'warning', text: 'Setting berubah, konversi ulang.' };
      if (processed) return { state: 'done', text: 'Output OGG sudah siap.' };
      if (stagedSource) return { state: 'pending', text: 'Siap konversi OGG.' };
      return { state: 'pending', text: 'Download sumber dulu.' };
    }

    if (loading && loadingStepIndex >= 3) {
      return { state: 'active', text: loadingStep || 'Upload Roblox sedang berjalan...' };
    }
    if (pipelineStatus.state === 'error' && pipelineStatus.stepIndex >= 3) {
      return { state: 'error', text: errorText };
    }
    if (pipelineStatus.state === 'uploaded') return { state: 'done', text: 'Upload Roblox selesai.' };
    if (pipelineStatus.state === 'stale') return { state: 'warning', text: 'Konversi ulang dulu.' };
    if (processed) return { state: 'pending', text: 'Siap upload Roblox.' };
    return { state: 'pending', text: 'Konversi OGG dulu.' };
  }

  function renderLandingPage() {
    const features = [
      {
        title: 'Konversi & Edit Audio',
        desc: 'Speed, amplifikasi, pitch, EQ preset, fade, trim, dan efek manual seperti bass boost, reverb, echo, normalize. Output siap dipakai di Roblox.',
        icon: '🎚️'
      },
      {
        title: 'YouTube + SoundCloud',
        desc: 'Tempel link YouTube atau SoundCloud, server tarik audionya pakai yt-dlp dengan cookie auth, langsung ke pipeline.',
        icon: '🔗'
      },
      {
        title: 'Auto Split & Upload',
        desc: 'Audio panjang otomatis dipecah jadi part 3 menit, upload langsung ke Roblox Open Cloud (Personal atau Group). Status moderasi dipantau realtime.',
        icon: '🚀'
      },
      {
        title: 'API Key Aman AES-256',
        desc: 'Roblox API key kamu disimpan terenkripsi AES-256-GCM di server. Plaintext tidak pernah dikirim balik ke browser.',
        icon: '🔐'
      },
      {
        title: 'Login Fleksibel',
        desc: gatewayInfo?.discord?.enabled
          ? 'Email/password, Google, atau Discord — pilih cara login yang paling cocok.'
          : 'Email/password atau Google. Verifikasi via email code.',
        icon: '👤'
      },
      {
        title: 'Pembayaran Lokal',
        desc: 'QRIS, DANA, GoPay, ShopeePay, virtual account — via Midtrans. Aktivasi paket otomatis setelah pembayaran sukses.',
        icon: '💳'
      }
    ];
    const plans = [
      { id: 'seven', label: 'Paid 7 Hari', price: 'Rp 35.000', perks: ['Konversi tanpa batas', `Durasi maks ${MAX_AUDIO_DURATION_SECONDS} detik per lagu`, 'Upload Roblox Personal & Group', 'Cek moderasi realtime'] },
      { id: 'thirty', label: 'Paid 30 Hari', price: 'Rp 100.000', perks: ['Semua benefit 7 hari', 'Lebih hemat untuk produksi rutin', 'Prioritas dukungan'], featured: true }
    ];
    return (
      <main className="landing-page">
        <Toast toast={toast} />
        <header className="landing-header">
          <div className="landing-brand">
            <div className="sidebar-logo">L</div>
            <div>
              <p className="sidebar-brand-name">LuciVoid Audio Studio</p>
              <p className="sidebar-brand-tag">Konversi & Upload Audio Roblox</p>
            </div>
          </div>
          <div className="landing-cta">
            <button type="button" className="secondary" onClick={() => setActivePage('terms')}>Terms</button>
            <button type="button" className="secondary" onClick={() => setActivePage('privacy')}>Privacy</button>
            <button type="button" className="primary" onClick={() => setActivePage('login')}>Masuk</button>
          </div>
        </header>

        <section className="landing-hero">
          <h1>Konversi audio dari YouTube &amp; SoundCloud, langsung upload ke Roblox.</h1>
          <p>
            Pipeline lengkap: download → edit (speed, EQ, pitch, efek) → split otomatis → upload Roblox
            Open Cloud → pantau moderasi. API key kamu disimpan terenkripsi AES-256.
          </p>
          <div className="landing-cta">
            <button type="button" className="primary" onClick={() => setActivePage('login')}>Mulai Sekarang</button>
            {gatewayInfo?.discord?.enabled && (
              <button type="button" className="discord-button" onClick={startDiscordLogin} style={{ width: 'auto' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.319 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.027c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.245.198.371.292a.077.077 0 0 1-.006.128 12.299 12.299 0 0 1-1.873.891.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.418 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.094 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.156-1.085-2.156-2.418 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.094 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                Lanjut dengan Discord
              </button>
            )}
          </div>
        </section>

        <section className="landing-features">
          <h2>Fitur</h2>
          <div className="landing-grid">
            {features.map((f) => (
              <div className="landing-card" key={f.title}>
                <div className="landing-icon" aria-hidden>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-pricing">
          <h2>Paket</h2>
          <div className="landing-plans">
            {plans.map((plan) => (
              <div className={`landing-plan${plan.featured ? ' featured' : ''}`} key={plan.id}>
                {plan.featured && <span className="plan-tag">Populer</span>}
                <h3>{plan.label}</h3>
                <p className="plan-price">{plan.price}</p>
                <ul>{plan.perks.map((perk) => <li key={perk}>{perk}</li>)}</ul>
                <button type="button" className="primary" onClick={() => setActivePage('login')}>Mulai</button>
              </div>
            ))}
          </div>
          <p className="muted small landing-free-note">Akun Free dapat 3 konversi gratis untuk uji coba (maks {MAX_AUDIO_DURATION_SECONDS} detik per lagu).</p>
        </section>

        <section className="landing-security">
          <h2>Keamanan</h2>
          <div className="landing-grid">
            <div className="landing-card">
              <div className="landing-icon" aria-hidden>🔒</div>
              <h3>AES-256 untuk Credential</h3>
              <p>API key Roblox disimpan terenkripsi pakai AES-256-GCM. Master key hanya ada di server, bukan di browser.</p>
            </div>
            <div className="landing-card">
              <div className="landing-icon" aria-hidden>🌐</div>
              <h3>HTTPS Only</h3>
              <p>Semua trafik aplikasi melalui HTTPS. Token JWT untuk session, refresh tiap login.</p>
            </div>
            <div className="landing-card">
              <div className="landing-icon" aria-hidden>📜</div>
              <h3>Audit Log</h3>
              <p>Setiap aksi penting (login, konversi, perubahan API key) tercatat di audit log akun kamu.</p>
            </div>
          </div>
        </section>

        <footer className="landing-footer">
          <p>© {new Date().getFullYear()} LuciVoid Audio Studio.</p>
          <p>
            <button type="button" className="auth-link-button" onClick={() => setActivePage('privacy')}>Privacy Policy</button>
            {' · '}
            <button type="button" className="auth-link-button" onClick={() => setActivePage('terms')}>Terms of Service</button>
            {' · '}
            <a href={gatewayInfo?.admin?.discord || 'https://discord.com'} target="_blank" rel="noreferrer">Support Discord</a>
          </p>
        </footer>
      </main>
    );
  }

  function renderLegalPage(kind) {
    const isPrivacy = kind === 'privacy';
    return (
      <main className="legal-page">
        <Toast toast={toast} />
        <header className="legal-header">
          <button type="button" className="auth-link-button" onClick={() => setActivePage('landing')}>← Kembali</button>
          <h1>{isPrivacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
          <p className="muted small">Berlaku per {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </header>
        <article className="legal-article">
          {isPrivacy ? (
            <>
              <h2>Data yang kami simpan</h2>
              <p>
                Saat kamu mendaftar, kami menyimpan username, email, hash password (bcrypt), dan opsional
                ID profil dari penyedia OAuth (Google sub, Discord ID). Saat kamu melakukan konversi atau
                upload Roblox, kami menyimpan riwayat berisi judul lagu, link sumber, durasi, status part,
                dan operation ID Roblox.
              </p>
              <h2>Roblox API Key</h2>
              <p>
                Roblox Open Cloud API key kamu disimpan terenkripsi pakai AES-256-GCM. Master key hanya
                ada di server, plaintext API key tidak pernah dikirim balik ke browser. Kami pakai key ini
                hanya untuk upload audio kamu ke Roblox dan cek status moderasi.
              </p>
              <h2>Pembayaran</h2>
              <p>
                Pembayaran diproses oleh Midtrans. Kami tidak menyimpan nomor kartu, PIN, atau detail bank
                kamu. Yang kami terima dari Midtrans hanya status invoice dan order id.
              </p>
              <h2>YouTube cookies</h2>
              <p>
                Cookie YouTube yang dipasang admin di server hanya digunakan oleh yt-dlp untuk men-download
                audio dari URL yang diminta user. Cookie tidak diakses oleh user atau dikirim ke pihak
                ketiga selain YouTube.
              </p>
              <h2>Penyimpanan</h2>
              <p>
                File audio yang sudah diproses disimpan sementara di disk server selama proses upload, lalu
                dihapus. Asset yang sudah ke-upload ke Roblox menjadi milik kamu di akun Roblox kamu.
              </p>
              <h2>Hak kamu</h2>
              <p>
                Kamu bisa menghapus akun via halaman Pengaturan; semua data riwayat dan API key yang
                tersimpan akan ikut terhapus.
              </p>
              <h2>Kontak</h2>
              <p>Pertanyaan privasi: <a href={gatewayInfo?.admin?.discord || '#'} target="_blank" rel="noreferrer">Support Discord</a>.</p>
            </>
          ) : (
            <>
              <h2>Penerimaan</h2>
              <p>Dengan menggunakan LuciVoid Audio Studio, kamu setuju dengan ketentuan ini.</p>
              <h2>Penggunaan yang diizinkan</h2>
              <ul>
                <li>Konversi audio dari YouTube/SoundCloud yang kamu punya hak / lisensi-nya.</li>
                <li>Upload audio ke akun Roblox kamu sendiri atau group yang kamu kelola.</li>
                <li>Tidak melakukan upload konten ilegal, melanggar hak cipta, atau melanggar TOS Roblox/YouTube/SoundCloud.</li>
              </ul>
              <h2>Tanggung jawab pengguna</h2>
              <p>
                Kamu bertanggung jawab atas konten yang kamu konversi dan upload. Kami tidak bertanggung
                jawab atas pelanggaran hak cipta atau pemblokiran asset oleh moderasi Roblox.
              </p>
              <h2>Pembayaran &amp; refund</h2>
              <p>
                Paket berlaku sesuai durasi yang dipilih. Refund hanya diberikan jika kami gagal
                mengaktifkan paket karena kesalahan sistem; refund tidak berlaku untuk perubahan kebijakan
                pihak ketiga (Roblox/YouTube) atau untuk konten yang ditolak moderasi.
              </p>
              <h2>Penghentian akun</h2>
              <p>
                Kami dapat menangguhkan atau memblokir akun yang melanggar ketentuan ini, terdeteksi
                melakukan penyalahgunaan API key Roblox, atau mengupload konten ilegal.
              </p>
              <h2>Perubahan ketentuan</h2>
              <p>
                Ketentuan ini bisa kami perbarui sewaktu-waktu. Versi terbaru selalu tersedia di halaman
                ini.
              </p>
            </>
          )}
        </article>
        <footer className="landing-footer">
          <p>
            <button type="button" className="auth-link-button" onClick={() => setActivePage('landing')}>Beranda</button>
            {' · '}
            <button type="button" className="auth-link-button" onClick={() => setActivePage('login')}>Masuk</button>
          </p>
        </footer>
      </main>
    );
  }

  if (!currentUser) {
    if (activePage === 'privacy') return renderLegalPage('privacy');
    if (activePage === 'terms') return renderLegalPage('terms');
    if (activePage === 'login') return renderAuthScreen();
    return renderLandingPage();
  }

  if (adminMode) {
    return (
      <>
        <Toast toast={toast} />
        <AdminPanel
          apiBase={API_BASE}
          token={authToken}
          currentUser={currentUser}
          onExit={exitAdmin}
          onLogout={logout}
          notify={notify}
        />
      </>
    );
  }

  const downloadActionStatus = actionStatus('download');
  const convertActionStatus = actionStatus('convert');
  const uploadActionStatus = actionStatus('upload');

  return (
    <>
      <Toast toast={toast} />
      {false && loading && (
        <div className="loading-overlay">
          <div className="loading-card">
            <Loader2 className="spin" size={36} />
            <h3>Memproses</h3>
            <ol className="step-list">
              {[
                'Mempersiapkan',
                'Mengunduh / membaca audio',
                'Mengonversi & efek',
                'Selesai / upload Roblox'
              ].map((label, idx) => {
                const status = idx < loadingStepIndex ? 'done' : idx === loadingStepIndex ? 'active' : 'pending';
                return (
                  <li key={label} className={`step ${status}`}>
                    <span className="dot">{status === 'done' ? '✓' : idx + 1}</span>
                    <span>{label}</span>
                  </li>
                );
              })}
            </ol>
            <p className="muted">{loadingStep || 'Mohon tunggu...'}</p>
            <button className="icon-wide bad" onClick={cancelLoading}>Batalkan</button>
          </div>
        </div>
      )}
      {false && lastError && !loading && (
        <div className="error-banner">
          <div>
            <b>Gagal memproses</b>
            <p>{lastError}</p>
          </div>
          <div className="actions tight">
            <button className="secondary" onClick={() => { setLastError(null); handleProcessClick(); }}>Coba Lagi</button>
            <button className="icon-wide" onClick={() => setLastError(null)}>Tutup</button>
          </div>
        </div>
      )}
      <AppShell
        activePage={activePage}
        onNavigate={setActivePage}
        currentUser={currentUser}
        onOpenAdmin={openAdminMode}
        onLogout={logout}
        pageTitle={PAGE_TITLES[activePage] || 'Audio Studio'}
        invoicePending={payments.filter((p) => p.status === 'Pending').length}
        historyCount={history.length}
        queueCount={queue.length}
        libraryCount={libraryAssets.length}
        pageActions={<div className="summary">{summary}</div>}
      >

        {(!currentUser || activePage === 'settings' || activePage === 'billing') && (
        <section className="panel">
          <h2><User size={20} /> Akun Audio Studio</h2>
          {currentUser ? (
            <div className="account-stack">
              <div className="account-row">
                <div>
                  <b>{currentUser.username}</b>
                  <p className="muted">
                    {currentUser.role === 'admin'
                      ? 'Plan: Admin (Full Access) | Tanpa limit'
                      : `Plan: ${currentUser.subscription?.label || 'Free'} | Convert Free: ${currentUser.usage?.conversions || 0}/3${currentUser.subscription?.expiresAt ? ` | Aktif sampai ${new Date(currentUser.subscription.expiresAt).toLocaleDateString('id-ID')}` : ''}`
                    }
                  </p>
                  <p className="muted">Riwayat upload, konfigurasi Roblox, group, User ID, Group ID, dan API key terenkripsi akan disimpan ke akun ini.</p>
                </div>
                <button className="secondary" onClick={saveProfile} disabled={syncingProfile}>Simpan Sekarang</button>
                <button className="icon-wide" onClick={logout}>Logout</button>
              </div>
              {currentUser?.role !== 'admin' && (
              <div className="billing-box">
                <div className="plan-info">
                  <b>Plan: {currentUser.subscription?.label || 'Free'}</b>
                  {currentUser.subscription?.plan === 'paid'
                    ? <p className="muted">Aktif sampai {new Date(currentUser.subscription.expiresAt).toLocaleDateString('id-ID')}</p>
                    : <p className="muted">Free: {currentUser.usage?.conversions || 0}/3 konversi | Maks {MAX_AUDIO_DURATION_SECONDS} detik</p>
                  }
                </div>
                <button className="primary" onClick={() => setBillingForm({ ...billingForm, step: 'pricing' })}>Upgrade Plan</button>

                {billingForm.step === 'pricing' && (
                  <div className="modal-overlay" onClick={() => setBillingForm({ ...billingForm, step: null })}>
                    <div className="modal-content pricing-modal" onClick={(e) => e.stopPropagation()}>
                      <button className="modal-close" onClick={() => setBillingForm({ ...billingForm, step: null })}>×</button>
                      <h2>Pilih Paket</h2>
                      <p className="muted">Upgrade untuk unlimited konversi dengan durasi maks {MAX_AUDIO_DURATION_SECONDS} detik per lagu.</p>
                      <div className="pricing-grid">
                        <div className="pricing-card">
                          <h3>Free</h3>
                          <div className="price">Rp0</div>
                          <p className="period">selamanya</p>
                          <ul>
                            <li>3 konversi</li>
                            <li>Maks durasi {MAX_AUDIO_DURATION_SECONDS} detik</li>
                            <li>Auto upload Roblox</li>
                            <li>Speed & amplify control</li>
                          </ul>
                          <button className="secondary" disabled>Current Plan</button>
                        </div>
                        <div className="pricing-card featured">
                          <h3>7 Hari</h3>
                          <div className="price">Rp35.000</div>
                          <p className="period">untuk 7 hari</p>
                          <ul>
                            <li>Unlimited konversi</li>
                            <li>Durasi maks {MAX_AUDIO_DURATION_SECONDS} detik</li>
                            <li>Auto upload Roblox</li>
                            <li>Priority support</li>
                          </ul>
                          <button className="primary" onClick={() => setBillingForm({ ...billingForm, plan: 'seven', step: 'method' })}>Get Started</button>
                        </div>
                        <div className="pricing-card featured">
                          <h3>30 Hari</h3>
                          <div className="price">Rp100.000</div>
                          <p className="period">untuk 30 hari</p>
                          <span className="save-badge">Hemat 5%</span>
                          <ul>
                            <li>Unlimited konversi</li>
                            <li>Durasi maks {MAX_AUDIO_DURATION_SECONDS} detik</li>
                            <li>Auto upload Roblox</li>
                            <li>Priority support</li>
                          </ul>
                          <button className="primary" onClick={() => setBillingForm({ ...billingForm, plan: 'thirty', step: 'method' })}>Get Started</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {billingForm.step === 'method' && (
                  <div className="modal-overlay" onClick={() => setBillingForm({ ...billingForm, step: 'pricing' })}>
                    <div className="modal-content method-modal" onClick={(e) => e.stopPropagation()}>
                      <button className="modal-close" onClick={() => setBillingForm({ ...billingForm, step: null })}>×</button>
                      <h2>Pilih Metode Pembayaran</h2>
                      <p className="muted">Paket {billingForm.plan === 'seven' ? '7 Hari (Rp35.000)' : '30 Hari (Rp100.000)'}</p>
                      <div className="method-grid">
                        <div className="method-card">
                          <span className="method-badge instant">Instant Payment</span>
                          <div className="method-icon">💳</div>
                          <h3>QRIS Payment</h3>
                          <p className="muted">Bayar instan dengan e-wallet atau banking app Indonesia.</p>
                          <button className="primary" onClick={() => { setBillingForm({ ...billingForm, method: 'qris', step: null }); createPaymentRequest(); }}>Pay with QRIS</button>
                        </div>
                        <div className="method-card">
                          <span className="method-badge manual">Manual</span>
                          <div className="method-icon">💬</div>
                          <h3>Discord / WhatsApp</h3>
                          <p className="muted">Hubungi admin untuk instruksi pembayaran manual.</p>
                          <div className="method-links">
                            <a href={gatewayInfo.admin?.discord || 'https://discord.gg/'} target="_blank" rel="noopener noreferrer" className="secondary">Open Discord</a>
                            <a href={gatewayInfo.admin?.whatsapp || 'https://wa.me/'} target="_blank" rel="noopener noreferrer" className="secondary">WhatsApp Admin</a>
                          </div>
                        </div>
                      </div>
                      <p className="muted small">QRIS otomatis via Midtrans. Manual: admin konfirmasi setelah bukti transfer dikirim.</p>
                    </div>
                  </div>
                )}

                {!!payments.length && (
                  <div className="invoice-list">
                    <p className="muted small">
                      {payments.length} invoice tersimpan. Lihat detail di halaman <b>Invoice</b>.
                    </p>
                  </div>
                )}
              </div>
              )}
              {currentUser?.role === 'admin' && (
                <div className="billing-box">
                  <p className="muted"><b>Admin</b> — Full access tanpa limit konversi, durasi, atau langganan.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="auth-shell">
              {resetMode ? (
                resetStep === 'request' ? (
                  <form className="auth-form" onSubmit={handleForgotPassword}>
                    <p className="muted">Masukkan email akun yang ingin direset passwordnya.</p>
                    <label className="field"><span>Email</span><input type="email" value={authForm.email || authForm.username} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value, username: e.target.value })} /></label>
                    <button className="primary auth-button">Kirim Kode Reset</button>
                    <button type="button" className="secondary" onClick={() => { setResetMode(false); setResetStep('request'); }}>Kembali ke Login</button>
                  </form>
                ) : (
                  <form className="auth-form" onSubmit={handleResetPassword}>
                    <p className="muted">Masukkan kode reset yang dikirim ke {pendingEmail}.</p>
                    <label className="field"><span>Kode Reset</span><input value={authForm.code} onChange={(e) => setAuthForm({ ...authForm, code: e.target.value })} /></label>
                    <label className="field"><span>Password Baru (min 6 karakter)</span><input type="password" value={authForm.newPassword} onChange={(e) => setAuthForm({ ...authForm, newPassword: e.target.value })} /></label>
                    <button className="primary auth-button">Reset Password</button>
                    <button type="button" className="secondary" onClick={() => { setResetMode(false); setResetStep('request'); setPendingEmail(''); }}>Kembali ke Login</button>
                  </form>
                )
              ) : pendingEmail ? (
                <form className="auth-form" onSubmit={verifyEmail}>
                  <p className="muted">Masukkan kode verifikasi untuk {pendingEmail}.</p>
                  <label className="field"><span>Kode Verifikasi</span><input value={authForm.code} onChange={(e) => setAuthForm({ ...authForm, code: e.target.value })} /></label>
                  <button className="primary auth-button">Verifikasi Email</button>
                  <button type="button" className="secondary" onClick={resendCode}>Kirim Ulang Kode</button>
                </form>
              ) : (
                <form className="auth-form" onSubmit={handleAuth}>
                  <div className="segmented compact">
                    <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
                    <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Daftar</button>
                  </div>
                  <label className="field"><span>Username / Email</span><input value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} /></label>
                  {authMode === 'register' && <label className="field"><span>Email</span><input type="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} /></label>}
                  <label className="field"><span>Password</span><input type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} /></label>
                  <button className="primary auth-button" disabled={syncingProfile}>{authMode === 'login' ? 'Login' : 'Buat Akun'}</button>
                  {authMode === 'login' && <button type="button" className="secondary" onClick={() => setResetMode(true)}>Lupa Password?</button>}
                  {googleClientId && <div ref={googleButtonRef} className="google-btn-slot" />}
                </form>
              )}
            </div>
          )}
        </section>
        )}

        {activePage === 'pipeline' && (
        <>
        <div className="pipeline-grid">
          {/* === Kolom kiri: Sumber Audio + Format & Efek + Preview + Upload === */}
          <div className="pipeline-col">

            {/* Sumber Audio dengan tab toggle */}
            <section className="panel">
              <h2><Youtube size={20} /> Sumber Audio</h2>
              <div className="source-tabs">
                <button
                  type="button"
                  className={sourceTab === 'youtube' ? 'active' : ''}
                  onClick={() => { setSourceTab('youtube'); setAudioFile(null); }}
                >
                  <Youtube size={15} /> YouTube
                </button>
                <button
                  type="button"
                  className={sourceTab === 'upload' ? 'active' : ''}
                  onClick={() => { setSourceTab('upload'); setYoutubeUrl(''); setYoutubeInfo(null); }}
                >
                  <Upload size={15} /> Upload File
                </button>
              </div>

              {sourceTab === 'youtube' ? (
                <>
                  <label className="field">
                    <span>URL YouTube / SoundCloud</span>
                    <input
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=... atau https://soundcloud.com/..."
                    />
                  </label>
                  {youtubeInfo && (
                    <div className="input-preview youtube">
                      <div className="input-preview-head">
                        <img src={youtubeInfo.thumbnail} alt="" />
                        <div>
                          <b>{youtubeInfo.title}</b>
                          <p className="muted">Durasi: {youtubeInfo.duration ? formatDuration(youtubeInfo.duration) : 'tidak tersedia'}</p>
                          <p className="muted small">{youtubeUrl}</p>
                        </div>
                      </div>
                      {extractYoutubeId(youtubeUrl) && (
                        <iframe
                          className="youtube-embed"
                          src={`https://www.youtube.com/embed/${extractYoutubeId(youtubeUrl)}`}
                          title="YouTube preview"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      )}
                    </div>
                  )}
                  {youtubePreviewError && <p className="muted mt-3">{youtubePreviewError}</p>}
                  {stagedSource && (
                    <div className="connection-card ok">
                      <b>Sumber sudah didownload</b>
                      <p>{stagedSource.title || 'Audio'}{stagedSource.sourceDuration ? ` | ${formatDuration(stagedSource.sourceDuration)}` : ''}{stagedSource.sizeBytes ? ` | ${formatBytes(stagedSource.sizeBytes)}` : ''}</p>
                      {stagedSource.downloadedSectionEnd ? <p className="muted small">Potongan sumber tersedia sampai {formatDuration(stagedSource.downloadedSectionEnd)}. Jika durasi/trim dibuat lebih panjang, klik Download Ulang.</p> : null}
                      {!!stagedSource.conversionTrace?.length && (
                        <div className="trace-mini">
                          {stagedSource.conversionTrace.map((item, index) => (
                            <div key={`source-${index}`}>
                              <StatusBadge status={item.status} />
                              <span>{item.step}</span>
                              <p>{item.message}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <label className="field">
                    <span>Upload File (.mp3 / .wav / .ogg)</span>
                    <input
                      type="file"
                      accept=".mp3,.wav,.ogg,audio/*"
                      onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  {audioFilePreview && (
                    <div className="input-preview file">
                      <div className="input-preview-head">
                        <div className="file-icon"><Music2 size={28} /></div>
                        <div>
                          <b>{audioFilePreview.name}</b>
                          <p className="muted">{formatBytes(audioFilePreview.size)} {audioFilePreview.type ? `· ${audioFilePreview.type}` : ''}</p>
                        </div>
                        <button className="icon-wide" onClick={() => setAudioFile(null)}>Hapus</button>
                      </div>
                      <audio controls src={audioFilePreview.url} className="w-full" />
                    </div>
                  )}
                  {stagedSource && (
                    <div className="connection-card ok">
                      <b>File siap diedit</b>
                      <p>{stagedSource.title || audioFilePreview?.name || 'Audio'}{stagedSource.sourceDuration ? ` | ${formatDuration(stagedSource.sourceDuration)}` : ''}</p>
                      {stagedSource.downloadedSectionEnd ? <p className="muted small">Potongan sumber tersedia sampai {formatDuration(stagedSource.downloadedSectionEnd)}.</p> : null}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Format & Efek */}
            <section className="panel">
              <h2><Music2 size={20} /> Format & Efek</h2>

              <div className="format-grid">
                <label className="field">
                  <span>Format Output</span>
                  <select value="ogg" disabled>
                    <option value="ogg">OGG (Roblox compatible)</option>
                  </select>
                </label>
                <label className="field">
                  <span>Preset Kecepatan</span>
                  <select
                    value={String(settings.speed)}
                    onChange={(e) => setSetting('speed', Number(e.target.value))}
                  >
                    {presets.map(([label, speed]) => (
                      <option key={label} value={speed}>{label} — {speed}x</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>EQ Preset</span>
                  <select
                    value={settings.eqPreset || ''}
                    onChange={(e) => setSetting('eqPreset', e.target.value)}
                  >
                    {EQ_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Durasi Maks (s)</span>
                  <input
                    type="number"
                    min={30}
                    max={MAX_AUDIO_DURATION_SECONDS}
                    step={10}
                    value={settings.maxDuration}
                    onChange={(e) => setSetting('maxDuration', Number(e.target.value) || 0)}
                  />
                </label>
              </div>

              <div className="effect-chips">
                {[
                  { key: 'normalize', label: 'Normalize' },
                  { key: 'bassBoost', label: 'Bass Boost' },
                  { key: 'reverb', label: 'Reverb' },
                  { key: 'echo', label: 'Echo' }
                ].map((chip) => (
                  <button
                    type="button"
                    key={chip.key}
                    className={`chip ${settings[chip.key] ? 'active' : ''}`}
                    onClick={() => setSetting(chip.key, !settings[chip.key])}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <details className="advanced-fx">
                <summary>Pengaturan Lanjutan</summary>
                <div className="control-grid">
                  <Slider label="Kecepatan" value={settings.speed} min={0.5} max={3} step={0.1} suffix="x" onChange={(v) => setSetting('speed', v)} />
                  <Slider label="Amplifikasi (dB)" value={settings.amplify} min={-20} max={20} step={1} suffix=" dB" onChange={(v) => setSetting('amplify', v)} />
                  <Slider label="Pitch" value={settings.pitch} min={-12} max={12} step={1} suffix=" st" onChange={(v) => setSetting('pitch', v)} />
                  <Slider label="Fade In" value={settings.fadeIn} min={0} max={30} step={1} suffix="s" onChange={(v) => setSetting('fadeIn', v)} />
                  <Slider label="Fade Out" value={settings.fadeOut} min={0} max={30} step={1} suffix="s" onChange={(v) => setSetting('fadeOut', v)} />
                  <label className="field">
                    <span>Trim Start (s)</span>
                    <input type="number" min={0} value={settings.trimStart} onChange={(e) => setSetting('trimStart', Number(e.target.value) || 0)} />
                  </label>
                  <label className="field">
                    <span>Trim End (s)</span>
                    <input type="number" min={0} value={settings.trimEnd} onChange={(e) => setSetting('trimEnd', Number(e.target.value) || 0)} />
                  </label>
                </div>
                <div className="roblox-note" style={{ marginTop: 12 }}>
                  <b>PlaybackSpeed Roblox</b>
                  <p>Supaya audio normal di Roblox Studio: <code>PlaybackSpeed = 1 / speed</code>.</p>
                  <div className="speed-table">
                    {presets.map(([label, speed]) => (
                      <div key={`${label}-roblox`}>
                        <span>{label}</span>
                        <code>{`${speed}x → ${robloxPlaybackSpeed(speed)}`}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </section>

            {/* Preview Audio */}
            <section className="panel">
              <h2>Preview Audio</h2>
              <div ref={waveBoxRef} className="wavebox" />
              {processed ? (
                <>
                  <audio className="w-full" controls src={processed.audioDataUrl || `${API_BASE}${processed.audioUrl}`} />
                  <div className="result-info">
                    <span><b>{processed.title}</b></span>
                    {processed.sourceDuration ? <span className="muted">Sumber: {formatDuration(processed.sourceDuration)}</span> : null}
                    <span className="muted">Durasi: {formatDuration(processed.duration)}</span>
                    <span className="muted">Ukuran: {formatBytes(processed.sizeBytes)}</span>
                  </div>
                  <div className="conversion-proof">
                    <div className="proof-grid">
                      <div><span>Speed</span><b>{processed.appliedSettings?.speed ?? settings.speed}x</b></div>
                      <div><span>Amplify</span><b>{processed.appliedSettings?.amplify ?? settings.amplify} dB</b></div>
                      <div><span>Pitch</span><b>{processed.appliedSettings?.pitch ?? settings.pitch} st</b></div>
                      <div><span>Output</span><b>{processed.output?.format?.toUpperCase() || 'OGG'} / {processed.output?.bitrate || '128k'}</b></div>
                    </div>
                    {!!processed.appliedEffects?.length && (
                      <div className="effect-list">
                        {processed.appliedEffects.map((effect) => <span key={effect}>{effect}</span>)}
                      </div>
                    )}
                    {!!processed.conversionTrace?.length && (
                      <div className="trace-mini">
                        {processed.conversionTrace.map((item) => (
                          <div key={`${item.step}-${item.message}`}>
                            <StatusBadge status={item.status} />
                            <span>{item.step}</span>
                            <p>{item.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="muted">Hasil konversi akan muncul di sini sebelum diupload.</p>
              )}
            </section>

            {/* Konfigurasi Roblox */}
            <section className="panel">
              <h2><Upload size={20} /> Tujuan Upload Roblox</h2>
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
                    <select value={selectedGroupId} onChange={(e) => handleGroupSelect(e.target.value)}>
                      <option value="">Manual / belum pilih</option>
                      {linkedGroupOptions}
                    </select>
                  </label>
                  <label className="field"><span>Group ID Manual</span><input value={groupId} onChange={(e) => handleManualGroupId(e.target.value)} /></label>
                </div>
              )}
              <label className="field">
                <span className="label-help">Roblox Open Cloud API Key <HelpCircle title="Buka create.roblox.com, masuk Creator Dashboard, pilih Open Cloud API Keys, buat key dengan permission Assets API untuk audio." size={16} /></span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasStoredApiKeyForMode ? '✓ Tersimpan terenkripsi di server (kosongkan = pakai key yang sudah tersimpan)' : 'Tempel Open Cloud API key di sini'}
                />
                {hasStoredApiKeyForMode ? (
                  <small className="muted">Key tersimpan di server pakai AES-256-GCM. Plaintext tidak dikirim balik ke browser.</small>
                ) : null}
              </label>
              <div className="actions tight">
                <button className="primary" onClick={saveProfile} disabled={syncingProfile} type="button">
                  {syncingProfile ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />} Simpan Data Roblox
                </button>
                <button className="secondary" onClick={testRobloxConnection} type="button">Test Connection</button>
              </div>
              {robloxCheck && (
                <div className={`connection-card ${robloxCheck.ok ? 'ok' : robloxCheck.ok === false ? 'bad' : 'wait'}`}>
                  <b>{robloxCheck.ok ? 'Koneksi Roblox valid' : robloxCheck.ok === false ? 'Koneksi Roblox gagal' : 'Mengecek koneksi'}</b>
                  <p>{robloxCheck.message || robloxCheck.error || 'Menunggu response Roblox.'}</p>
                  {!!robloxCheck.trace?.length && (
                    <div className="trace-mini">
                      {robloxCheck.trace.map((item, index) => (
                        <div key={`roblox-${index}`}>
                          <StatusBadge status={item.status} />
                          <span>{item.step}</span>
                          <p>{item.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* === Kolom kanan: Sticky stack (Progress + Result + Quota) === */}
          <aside className="pipeline-side">
            {/* Action buttons selalu di atas, di luar sticky cluster */}
            <section className="panel side-panel">
              <h3 className="side-title">Aksi</h3>
              <div className="side-actions">
                <div className="side-action-row">
                  <button
                    className="secondary"
                    onClick={handleDownloadSourceClick}
                    disabled={loading || (!audioFile && !youtubeUrl) || Boolean(stagedSource)}
                  >
                    {loading && loadingStepIndex <= 1 ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />} Next: Download
                  </button>
                  <span className={`action-status ${downloadActionStatus.state}`}>{downloadActionStatus.text}</span>
                </div>
                <div className="side-action-row">
                  <button
                    className="secondary"
                    onClick={handleProcessClick}
                    disabled={loading || !stagedSource || (Boolean(processed) && pipelineStatus.state !== 'stale')}
                  >
                    {loading && loadingStepIndex === 2 ? <Loader2 className="spin" size={16} /> : <Music2 size={16} />}
                    {pipelineStatus.state === 'stale' ? 'Konversi Ulang OGG' : 'Next: Konversi OGG'}
                  </button>
                  <span className={`action-status ${convertActionStatus.state}`}>{convertActionStatus.text}</span>
                </div>
                <div className="side-action-row">
                  <button
                    className="primary"
                    onClick={convertAndUpload}
                    disabled={loading || !processed || pipelineStatus.state === 'stale'}
                  >
                    {loading && loadingStepIndex >= 3 ? <Loader2 className="spin" size={16} /> : <Upload size={16} />} Next: Upload Roblox
                  </button>
                  <span className={`action-status ${uploadActionStatus.state}`}>{uploadActionStatus.text}</span>
                </div>
                {loading && (
                  <button className="icon-wide bad" onClick={cancelLoading}>Batalkan proses</button>
                )}
                {processed && (
                  <a
                    className="secondary"
                    href={processed.audioDataUrl || `${API_BASE}${processed.audioUrl}`}
                    download={processed.fileName || 'audio.ogg'}
                  >
                    Download OGG
                  </a>
                )}
                {stagedSource && !processed && (
                  <button className="icon-wide" onClick={() => setStagedSource(null)}>Download Ulang</button>
                )}
                {processed && (
                  <button className="icon-wide" onClick={() => setProcessed(null)}>Reset Hasil</button>
                )}
              </div>
            </section>

            {/* Progress Pipeline */}
            <section className="panel side-panel">
              <h3 className="side-title">Progress Pipeline</h3>
              <ol className="pipeline-steps">
                {PIPELINE_STEPS.map((step, idx) => {
                  const status = pipelineStepStatus(idx);
                  return (
                    <li key={step.key} className={`pipeline-step ${status}`}>
                      <span className="bullet">
                        {status === 'done' ? '✓' : status === 'error' ? '!' : idx + 1}
                      </span>
                      <span className="step-label">{step.label}</span>
                    </li>
                  );
                })}
              </ol>
              <p className={`step-note ${pipelineStatus.state === 'error' ? 'error' : pipelineStatus.state === 'uploaded' || pipelineStatus.state === 'converted' ? 'success' : ''}`}>
                {loading ? (loadingStep || pipelineStatus.message) : pipelineStatus.message}
              </p>
              {!!pipelineStatus.details?.length && (
                <div className="trace-mini">
                  {pipelineStatus.details.map((item, index) => (
                    <div key={`${item}-${index}`}>
                      <span>{index + 1}</span>
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              )}
              {pipelineStatus.state === 'error' && (
                <div className="inline-error-actions">
                  <button className="secondary" onClick={retryPipelineStep}>Coba Lagi</button>
                  <button className="icon-wide" onClick={clearPipelineError}>Tutup</button>
                </div>
              )}
              {pipelineStatus.state === 'stale' && <p className="step-note warning">Klik Konversi lagi supaya preset/manual terbaru benar-benar masuk ke file OGG.</p>}
            </section>

            {/* Hasil Upload Roblox */}
            <section className="panel side-panel">
              <h3 className="side-title">Hasil Upload Roblox</h3>
              {lastUploadResult ? (
                <div className="result-list">
                  <div className="result-head">
                    <b>{lastUploadResult.title}</b>
                    <p className="muted small">
                      {new Date(lastUploadResult.createdAt).toLocaleString('id-ID')}
                    </p>
                    {lastUploadResult.uploadSummary && (
                      <p className="muted small">
                        {lastUploadResult.uploadSummary.partCount} part
                        {lastUploadResult.uploadSummary.split ? ' / auto split' : ''}
                        {' | '}
                        Accepted {lastUploadResult.uploadSummary.accepted || 0}
                        {' | '}
                        Pending {lastUploadResult.uploadSummary.pending || 0}
                        {' | '}
                        Failed {lastUploadResult.uploadSummary.failed || 0}
                      </p>
                    )}
                  </div>
                  {lastUploadResult.parts.map((part) => (
                    <div className="result-row" key={`res-${part.part}`}>
                      <div className="result-row-head">
                        <span className="part-tag">Part {part.part}</span>
                        <StatusBadge status={part.status} />
                      </div>
                      <code className="result-id">
                        {part.rbxassetid || part.error || 'Menunggu assetId...'}
                      </code>
                      {part.rbxassetid && (
                        <button
                          className="icon-wide tiny"
                          onClick={() => {
                            navigator.clipboard.writeText(part.rbxassetid);
                            notify('rbxassetid disalin.');
                          }}
                        >
                          <Copy size={12} /> Copy
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="secondary"
                    onClick={() => copyCenz(lastUploadResult)}
                    style={{ marginTop: 8 }}
                  >
                    <Copy size={14} /> Copy in CENZ Format
                  </button>
                </div>
              ) : (
                <p className="muted small">Belum ada upload. Hasil akan muncul di sini setelah Convert & Upload.</p>
              )}
            </section>

            {/* Quota / Penggunaan akun mini */}
            {currentUser && currentUser.role !== 'admin' && (
              <section className="panel side-panel quota-panel">
                <h3 className="side-title">Penggunaan Akun</h3>
                <div className="quota-stat">
                  <div className="quota-row">
                    <span className="muted small">Konversi</span>
                    <b>{currentUser.usage?.conversions || 0}/3</b>
                  </div>
                  <div className="quota-bar">
                    <div
                      className="quota-fill"
                      style={{ width: `${Math.min(100, ((currentUser.usage?.conversions || 0) / 3) * 100)}%` }}
                    />
                  </div>
                </div>
                <p className="muted small">
                  Plan: <b style={{ color: 'var(--brand-200)' }}>{currentUser.subscription?.label || 'Free'}</b>
                  {currentUser.subscription?.plan === 'paid' && currentUser.subscription?.expiresAt
                    ? ` · aktif sampai ${new Date(currentUser.subscription.expiresAt).toLocaleDateString('id-ID')}`
                    : ''}
                </p>
                {currentUser.subscription?.plan !== 'paid' && (
                  <button
                    className="primary"
                    style={{ marginTop: 4 }}
                    onClick={() => setBillingForm({ ...billingForm, step: 'pricing' })}
                  >
                    Upgrade
                  </button>
                )}
              </section>
            )}
          </aside>
        </div>
        </>
        )}

        {activePage === 'keys' && (
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
                  <select value={selectedGroupId} onChange={(e) => handleGroupSelect(e.target.value)}>
                    <option value="">Manual / belum pilih</option>
                    {linkedGroupOptions}
                  </select>
                </label>
                <label className="field"><span>Group ID Manual</span><input value={groupId} onChange={(e) => handleManualGroupId(e.target.value)} /></label>
              </div>
            )}
            <label className="field">
              <span className="label-help">Roblox Open Cloud API Key <HelpCircle title="Buka create.roblox.com, masuk Creator Dashboard, pilih Open Cloud API Keys, buat key dengan permission Assets API untuk audio." size={16} /></span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasStoredApiKeyForMode ? '✓ Tersimpan terenkripsi di server (kosongkan = pakai key yang sudah tersimpan)' : 'Tempel Open Cloud API key di sini'}
              />
            </label>
            <p className="muted small">API key disimpan terenkripsi AES-256-GCM di server. Plaintext tidak pernah dikirim balik ke browser sehingga aman walau bundle JS terbongkar.</p>
            <div className="actions tight">
              <button className="primary" onClick={saveProfile} disabled={syncingProfile}>
                {syncingProfile ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />} Simpan Data Roblox
              </button>
              <button className="secondary" onClick={testRobloxConnection}>Test Connection</button>
            </div>
            {robloxCheck && (
              <div className={`connection-card ${robloxCheck.ok ? 'ok' : robloxCheck.ok === false ? 'bad' : 'wait'}`}>
                <b>{robloxCheck.ok ? 'Koneksi Roblox valid' : robloxCheck.ok === false ? 'Koneksi Roblox gagal' : 'Mengecek koneksi'}</b>
                <p>{robloxCheck.message || robloxCheck.error || 'Menunggu response Roblox.'}</p>
                {!!robloxCheck.trace?.length && (
                  <div className="trace-mini">
                    {robloxCheck.trace.map((item, index) => (
                      <div key={`keys-roblox-${index}`}>
                        <StatusBadge status={item.status} />
                        <span>{item.step}</span>
                        <p>{item.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {activePage === 'groups' && (
          <section className="panel">
            <h2><LinkIcon size={20} /> Manajemen Grup</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="field"><span>Group ID</span><input value={groupForm.groupId} onChange={(e) => setGroupForm({ ...groupForm, groupId: e.target.value })} /></label>
              <label className="field"><span>Creator Roblox User ID</span><input value={groupForm.creatorUserId} onChange={(e) => setGroupForm({ ...groupForm, creatorUserId: e.target.value })} /></label>
              <label className="field"><span>Group API Key</span><input type="password" value={groupForm.apiKey} onChange={(e) => setGroupForm({ ...groupForm, apiKey: e.target.value })} /></label>
            </div>
            <div className="actions tight">
              <button className="secondary" onClick={addGroup}>Tambah Grup</button>
              <button className="primary" onClick={saveProfile} disabled={syncingProfile}>
                {syncingProfile ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />} Simpan Semua Grup
              </button>
            </div>
            <div className="list">
              {groups.map((group) => (
                <div className="list-row" key={group.id}>
                  <div><b>{group.name}</b><p>Group ID {group.groupId} | Creator {group.creatorUserId}</p></div>
                  <button className="icon" onClick={() => setGroups((items) => items.filter((item) => item.id !== group.id))}><Trash2 size={17} /></button>
                </div>
              ))}
              {!groups.length && <p className="muted">Belum ada grup tertaut.</p>}
            </div>
          </section>
        )}

        {activePage === 'queue' && (
          <section className="panel">
            <h2><ListMusic size={20} /> YouTube Queue</h2>
            <p className="muted small">Simpan URL YouTube untuk diproses nanti. Klik Load untuk pindah ke pipeline.</p>
            <div className="queue-input">
              <input
                value={queueInput}
                onChange={(e) => setQueueInput(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToQueue(); } }}
              />
              <button className="primary" onClick={() => addToQueue()}>
                <Plus size={16} /> Tambah
              </button>
            </div>
            {queue.length === 0 ? (
              <p className="muted">Queue kosong.</p>
            ) : (
              <div className="queue-list">
                {queue.map((item) => (
                  <article className="queue-card" key={item.id}>
                    <img
                      src={`https://img.youtube.com/vi/${item.id}/mqdefault.jpg`}
                      alt=""
                      className="queue-thumb"
                    />
                    <div className="queue-meta">
                      <code className="queue-url">{item.url}</code>
                      <p className="muted small">
                        Ditambah {new Date(item.addedAt).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="queue-actions">
                      <button className="secondary" onClick={() => loadFromQueue(item)}>
                        <Play size={14} /> Load
                      </button>
                      <button className="icon" onClick={() => removeFromQueue(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activePage === 'library' && (
          <section className="panel">
            <h2><Library size={20} /> Asset Library</h2>
            <p className="muted small">Semua asset Roblox yang sudah berhasil diunggah, siap copy ke project Studio.</p>
            <div className="library-toolbar">
              <div className="search-box">
                <Search size={15} />
                <input
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Cari judul atau asset id"
                />
              </div>
              <span className="muted small">{libraryAssets.length} asset</span>
            </div>
            {libraryAssets.length === 0 ? (
              <p className="muted">Belum ada asset yang Accepted. Selesaikan upload dulu.</p>
            ) : (
              <div className="library-grid">
                {libraryAssets.map((asset) => (
                  <article className="library-card" key={asset.partKey}>
                    {asset.thumbnail
                      ? <img src={asset.thumbnail} alt="" />
                      : <div className="thumb-fallback"><Music2 size={20} /></div>
                    }
                    <div className="library-body">
                      <b>{asset.title}</b>
                      <p className="muted small">Part {asset.partNum} · {new Date(asset.createdAt).toLocaleDateString('id-ID')}</p>
                      <code className="result-id">{asset.rbxassetid}</code>
                      <button
                        className="icon-wide tiny"
                        onClick={() => {
                          navigator.clipboard.writeText(asset.rbxassetid);
                          notify('rbxassetid disalin.');
                        }}
                      >
                        <Copy size={12} /> Copy
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activePage === 'invoice' && (
          <section className="panel">
            <h2><Receipt size={20} /> Invoice</h2>
            {!currentUser ? (
              <p className="muted">Login dulu untuk lihat invoice.</p>
            ) : payments.length === 0 ? (
              <p className="muted">Belum ada invoice.</p>
            ) : (
              <div className="invoice-table">
                {payments.map((payment) => (
                  <article className="invoice-row" key={payment.id}>
                    <div className="invoice-row-left">
                      <StatusBadge status={payment.status === 'Accepted' ? 'Accepted' : payment.status === 'Rejected' ? 'Failed' : 'Pending'} />
                      <code>{payment.id}</code>
                    </div>
                    <div className="invoice-row-mid">
                      <b>{payment.label}</b>
                      <p className="muted small">
                        {payment.method?.toUpperCase()}
                        {payment.gateway ? ` · ${payment.gateway}` : ''}
                        {' · '}
                        {new Date(payment.createdAt).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="invoice-row-right">
                      <b>Rp{Number(payment.amount || 0).toLocaleString('id-ID')}</b>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activePage === 'history' && (
        <section className="panel">
          <div className="history-toolbar">
            <h2>Dashboard Riwayat Upload</h2>
            <div className="actions tight">
              <input
                placeholder="Cari judul atau URL"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                style={{ minWidth: 220 }}
              />
              {history.length > 0 && (
                <button className="icon-wide bad" onClick={() => { if (confirm('Hapus semua riwayat?')) setHistory([]); }}>Hapus Semua</button>
              )}
            </div>
          </div>
          <div className="segmented compact" style={{ marginBottom: 12 }}>
            <button className={historyFilter === 'all' ? 'active' : ''} onClick={() => setHistoryFilter('all')}>Semua ({history.length})</button>
            <button className={historyFilter === 'success' ? 'active' : ''} onClick={() => setHistoryFilter('success')}>Sukses</button>
            <button className={historyFilter === 'pending' ? 'active' : ''} onClick={() => setHistoryFilter('pending')}>Pending</button>
            <button className={historyFilter === 'failed' ? 'active' : ''} onClick={() => setHistoryFilter('failed')}>Gagal</button>
          </div>
          <div className="history-grid">
            {filteredHistory.map((entry) => (
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
                      <section className="part-trace" key={`${entry.id}-${part.part}`}>
                        <div className="part-head">
                          <span>Part {part.part}</span>
                          <StatusBadge status={part.status} />
                          <code>{part.rbxassetid || part.error || 'Menunggu assetId'}</code>
                          {part.status === 'Pending' && part.operationId && (
                            <button className="icon-wide" onClick={() => recheckPart(entry, part)}>Cek Status</button>
                          )}
                          {part.rbxassetid && (
                            <button className="icon-wide" onClick={() => { navigator.clipboard.writeText(part.rbxassetid); notify('rbxassetid disalin.'); }}>Copy ID</button>
                          )}
                        </div>
                        {!!part.trace?.length && (
                          <div className="trace-list">
                            {part.trace.map((item, index) => (
                              <div key={`${entry.id}-${part.part}-${index}`}>
                                <StatusBadge status={item.status} />
                                <span>{item.step}</span>
                                <p>{item.message}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                  <div className="actions">
                    <button className="secondary" onClick={() => copyCenz(entry)}><Copy size={16} /> Copy in CENZ Format</button>
                    <button className="secondary" onClick={() => reuseEntry(entry)}>Re-upload</button>
                    <button className="icon" onClick={() => setHistory((items) => items.filter((item) => item.id !== entry.id))}><Trash2 size={17} /></button>
                  </div>
                </div>
              </article>
            ))}
            {!filteredHistory.length && history.length > 0 && <p className="muted">Tidak ada riwayat yang cocok dengan filter.</p>}
            {!history.length && <p className="muted">Belum ada riwayat upload.</p>}
          </div>
        </section>
        )}
      </AppShell>
    </>
  );
}

const PAGE_TITLES = {
  pipeline: 'Konversi Audio',
  queue: 'YouTube Queue',
  history: 'Riwayat Upload',
  library: 'Asset Library',
  keys: 'API Keys & Konfigurasi Roblox',
  groups: 'Manajemen Grup',
  billing: 'Langganan',
  invoice: 'Invoice',
  settings: 'Pengaturan Akun'
};

createRoot(document.getElementById('root')).render(<App />);
