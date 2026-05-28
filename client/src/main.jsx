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
  User,
  Link as LinkIcon,
  Crown
} from 'lucide-react';
import './styles.css';
import AdminPanel from './AdminPanel.jsx';
import AppShell from './AppShell.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || window.location.origin;
const VITE_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
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
  fadeOut: 0,
  trimStart: 0,
  trimEnd: 0,
  eqPreset: ''
};

const EQ_PRESETS = [
  { value: '', label: 'Flat (default)' },
  { value: 'bass_heavy', label: 'Bass Heavy' },
  { value: 'vocal_clear', label: 'Vocal Clear' },
  { value: 'lo_fi', label: 'Lo-Fi' },
  { value: 'podcast', label: 'Podcast' }
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
    encryptedApiKey: group.encryptedApiKey
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
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('audio-studio-token') || '');
  const [currentUser, setCurrentUser] = useState(null);
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
  const [lastError, setLastError] = useState(null);
  const abortRef = useRef(null);
  const [audioFilePreview, setAudioFilePreview] = useState(null);
  const [toast, setToast] = useState(null);
  const [adminMode, setAdminMode] = useState(false);
  const [adminSecret, setAdminSecret] = useState(() => sessionStorage.getItem('audio-studio-admin-secret') || '');
  const [adminPromptOpen, setAdminPromptOpen] = useState(false);
  const [activePage, setActivePage] = useState('pipeline');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [gatewayInfo, setGatewayInfo] = useState({ midtrans: { enabled: false } });
  const [googleClientId, setGoogleClientId] = useState(VITE_GOOGLE_CLIENT_ID);
  const googleButtonRef = useRef(null);
  const waveRef = useRef(null);
  const waveBoxRef = useRef(null);

  const summary = `Speed: ${settings.speed}x | Amplify: ${settings.amplify} dB | Max: ${settings.maxDuration}s`;
  const activeGroup = groups.find((group) => group.groupId === selectedGroupId);

  useEffect(() => {
    localStorage.setItem('audio-studio-api-key', encrypt(apiKey));
  }, [apiKey]);

  useEffect(() => {
    if (authToken) localStorage.setItem('audio-studio-token', authToken);
    else localStorage.removeItem('audio-studio-token');
  }, [authToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === '1') setAdminPromptOpen(true);
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
    if (currentUser?.role === 'admin' && authToken && !adminMode) {
      try {
        const payload = JSON.parse(atob(authToken.split('.')[1]));
        if (payload.role === 'admin') setAdminMode(true);
      } catch {
        // token invalid, skip
      }
    }
  }, [currentUser, authToken]);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` }
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Sesi login gagal dimuat.');
        applyUserProfile(data.user);
      })
      .catch((error) => {
        setAuthToken('');
        notify(error.message, 'error');
      });
  }, []);

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
            const response = await fetch(`${API_BASE}/api/auth/google`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: result.credential })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Login Google gagal.');
            setAuthToken(data.token);
            applyUserProfile(data.user);
            notify('Login Google berhasil.');
          } catch (error) {
            notify(error.message, 'error');
          }
        }
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        width: 280
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
    const isYoutube = (() => {
      try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.replace(/^www\./, '');
        if (host === 'youtu.be') return parsed.pathname.length > 1;
        if (!host.endsWith('youtube.com')) return false;
        return parsed.searchParams.has('v') || parsed.pathname.includes('/shorts/') || parsed.pathname.includes('/embed/');
      } catch {
        return false;
      }
    })();

    if (!isYoutube) {
      setYoutubeInfo(null);
      setYoutubePreviewError('');
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setYoutubePreviewError('');
        const response = await fetch(`${API_BASE}/api/youtube-info?url=${encodeURIComponent(trimmed)}`);
        if (!response.ok) throw new Error('Preview YouTube gagal dimuat.');
        setYoutubeInfo(await response.json());
      } catch (error) {
        setYoutubeInfo(null);
        setYoutubePreviewError('Preview belum bisa dimuat untuk link ini. Konversi masih bisa dicoba jika videonya publik.');
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

  // Auto-poll pending asset status setiap 60 detik
  useEffect(() => {
    if (!history.length || !apiKey) return;
    const hasPending = history.some((entry) => entry.parts?.some((p) => p.status === 'Pending' && p.operationId));
    if (!hasPending) return;

    const interval = setInterval(async () => {
      const uploadKey = mode === 'group' && activeGroup ? decrypt(activeGroup.encryptedApiKey) : apiKey;
      if (!uploadKey) return;
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationId: pair.operationId, apiKey: uploadKey })
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
  }, [history, apiKey, mode, activeGroup]);

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

  function applyUserProfile(user) {
    setCurrentUser(user);
    const profile = user.profile || {};
    const config = profile.robloxConfig || {};
    setMode(config.mode || 'personal');
    setUserId(config.userId || '');
    setGroupId(config.groupId || '');
    setSelectedGroupId(config.selectedGroupId || '');
    setApiKey(config.encryptedApiKey ? decrypt(config.encryptedApiKey) : '');
    setGroups(compactGroups(profile.groups));
    setHistory(compactHistory(profile.history));
    lastProfileSyncRef.current = JSON.stringify(profile || {});
  }

  async function handleAuth(event) {
    event.preventDefault();
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
    const profile = {
      robloxConfig: {
        mode,
        userId,
        groupId,
        selectedGroupId,
        encryptedApiKey: encrypt(apiKey)
      },
      groups: compactGroups(groups),
      history: compactHistory(history)
    };
    const profileJson = JSON.stringify(profile);
    if (profileJson === lastProfileSyncRef.current) return;

    try {
      setSyncingProfile(true);
      const response = await fetch(`${API_BASE}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ profile })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal menyimpan profile.');
      setCurrentUser(data.user);
      lastProfileSyncRef.current = profileJson;
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSyncingProfile(false);
    }
  }

  function logout() {
    setAuthToken('');
    setCurrentUser(null);
    notify('Logout berhasil.');
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
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function setStep(index, text) {
    setLoadingStepIndex(index);
    setLoadingStep(text);
  }

  async function processOnly() {
    const form = new FormData();
    if (audioFile) form.append('audio', audioFile);
    if (youtubeUrl) form.append('youtubeUrl', youtubeUrl);
    form.append('settings', JSON.stringify(settings));
    setStep(1, youtubeUrl ? 'Mengunduh audio dari YouTube...' : 'Memproses file audio...');
    const controller = new AbortController();
    abortRef.current = controller;
    const response = await fetch(`${API_BASE}/api/process`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal: controller.signal
    });
    setStep(2, 'Mengonversi format dan menerapkan efek...');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Konversi audio gagal.');
    if (data.account) {
      setCurrentUser((user) => user ? { ...user, usage: data.account.usage, subscription: data.account.subscription } : user);
    }
    setProcessed(data);
    setStep(3, 'Audio siap diunduh atau di-upload ke Roblox.');
    notify('Konversi Audio selesai.');
    return data;
  }

  async function convertAndUpload() {
    if (loading) return;
    try {
      setLastError(null);
      setLoading(true);
      setStep(0, 'Memulai konversi...');
      const result = processed || await processOnly();
      setStep(2, 'Mengirim audio ke Roblox...');
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

      setStep(3, 'Menunggu Roblox memproses asset...');
      const controller = new AbortController();
      abortRef.current = controller;
      const response = await fetch(`${API_BASE}/api/upload-roblox`, {
        method: 'POST',
        body: form,
        signal: controller.signal
      });
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
      setHistory((items) => compactHistory([entry, ...items]));
      notify('Terunggah ke Roblox.');
    } catch (error) {
      if (error.name === 'AbortError') {
        notify('Konversi dibatalkan.', 'info');
      } else {
        setLastError(error.message);
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
      setStep(0, 'Memulai konversi...');
      await processOnly();
    } catch (error) {
      if (error.name === 'AbortError') {
        notify('Konversi dibatalkan.', 'info');
      } else {
        setLastError(error.message);
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

  function reuseEntry(entry) {
    if (entry.youtubeUrl) {
      setYoutubeUrl(entry.youtubeUrl);
      setAudioFile(null);
    }
    if (entry.settings) {
      setSettings({ ...defaultSettings, ...entry.settings });
    }
    setProcessed(null);
    setActivePage('pipeline');
    notify('Settings dimuat dari riwayat. Klik Convert untuk ulang.');
  }

  async function testRobloxConnection() {
    const key = mode === 'group' && activeGroup ? decrypt(activeGroup.encryptedApiKey) : apiKey;
    if (!key) {
      notify('Isi API key dulu.', 'error');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/roblox-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key })
      });
      const data = await response.json();
      if (data.ok) notify('API key valid. Roblox API menerima koneksi.');
      else notify(data.error || 'Test koneksi gagal.', 'error');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function recheckPart(entry, part) {
    if (!part.operationId) {
      notify('Part ini tidak punya operationId, tidak bisa dicek.', 'error');
      return;
    }
    const uploadKey = mode === 'group' && activeGroup ? decrypt(activeGroup.encryptedApiKey) : apiKey;
    if (!uploadKey) {
      notify('Isi API key Roblox dulu di halaman API Keys untuk cek ulang.', 'error');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/asset-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: part.operationId, apiKey: uploadKey })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal cek status.');
      setHistory((items) => items.map((item) => {
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
      }));
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
    setAdminPromptOpen(true);
  }

  function submitAdminSecret(event) {
    event.preventDefault();
    if (!adminSecret.trim()) {
      notify('Masukkan ADMIN_SECRET.', 'error');
      return;
    }
    sessionStorage.setItem('audio-studio-admin-secret', adminSecret.trim());
    setAdminPromptOpen(false);
    setAdminMode(true);
  }

  function exitAdmin() {
    setAdminMode(false);
    setAdminPromptOpen(false);
    if (currentUser?.role !== 'admin') {
      setAdminSecret('');
      sessionStorage.removeItem('audio-studio-admin-secret');
    }
  }

  function exitAdminAndLogout() {
    setAdminMode(false);
    setAdminSecret('');
    sessionStorage.removeItem('audio-studio-admin-secret');
    logout();
    notify('Logout untuk refresh role admin. Login ulang.');
  }

  if (adminMode) {
    return (
      <>
        <Toast toast={toast} />
        <AdminPanel
          apiBase={API_BASE}
          secret={currentUser?.role === 'admin' ? '' : adminSecret}
          token={currentUser?.role === 'admin' ? authToken : ''}
          onExit={exitAdmin}
          notify={notify}
        />
      </>
    );
  }

  return (
    <>
      <Toast toast={toast} />
      {loading && (
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
      {lastError && !loading && (
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
        pageActions={<div className="summary">{summary}</div>}
      >

        {adminPromptOpen && (
          <section className="panel admin-prompt">
            <h2><Crown size={18} /> Masuk Mode Admin</h2>
            <p className="muted">Pakai ADMIN_SECRET dari env server, atau login dengan akun yang role-nya admin.</p>
            <form onSubmit={submitAdminSecret} className="auth-form">
              <label className="field"><span>ADMIN_SECRET</span><input type="password" value={adminSecret} onChange={(e) => setAdminSecret(e.target.value)} /></label>
              <div className="actions">
                <button type="submit" className="primary">Masuk</button>
                <button type="button" className="icon-wide" onClick={() => setAdminPromptOpen(false)}>Batal</button>
              </div>
            </form>
          </section>
        )}

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
                    : <p className="muted">Free: {currentUser.usage?.conversions || 0}/3 konversi | Maks 10 menit</p>
                  }
                </div>
                <button className="primary" onClick={() => setBillingForm({ ...billingForm, step: 'pricing' })}>Upgrade Plan</button>

                {billingForm.step === 'pricing' && (
                  <div className="modal-overlay" onClick={() => setBillingForm({ ...billingForm, step: null })}>
                    <div className="modal-content pricing-modal" onClick={(e) => e.stopPropagation()}>
                      <button className="modal-close" onClick={() => setBillingForm({ ...billingForm, step: null })}>×</button>
                      <h2>Pilih Paket</h2>
                      <p className="muted">Upgrade untuk unlimited konversi dan durasi tanpa batas.</p>
                      <div className="pricing-grid">
                        <div className="pricing-card">
                          <h3>Free</h3>
                          <div className="price">Rp0</div>
                          <p className="period">selamanya</p>
                          <ul>
                            <li>3 konversi</li>
                            <li>Maks durasi 10 menit</li>
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
                            <li>Durasi tanpa batas</li>
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
                            <li>Durasi tanpa batas</li>
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
                    <b>Riwayat Invoice</b>
                    {payments.map((payment) => (
                      <div key={payment.id}>
                        <StatusBadge status={payment.status === 'Accepted' ? 'Accepted' : payment.status === 'Rejected' ? 'Failed' : 'Pending'} />
                        <span>{payment.id}</span>
                        <p>{payment.label} | {payment.method.toUpperCase()} | Rp{payment.amount?.toLocaleString('id-ID')}</p>
                      </div>
                    ))}
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
            <div className="roblox-note">
              <b>Catatan PlaybackSpeed Roblox</b>
              <p>Supaya audio terdengar normal di Roblox Studio, gunakan nilai kebalikan dari preset website: <code>PlaybackSpeed = 1 / speed</code>.</p>
              <div className="speed-table">
                {presets.map(([label, speed]) => (
                  <div key={`${label}-roblox`}>
                    <span>{label}</span>
                    <code>{`${speed}x -> ${robloxPlaybackSpeed(speed)}`}</code>
                  </div>
                ))}
              </div>
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
          <div className="control-grid" style={{ marginTop: 14 }}>
            <label className="field">
              <span>EQ Preset</span>
              <select value={settings.eqPreset || ''} onChange={(e) => setSetting('eqPreset', e.target.value)}>
                {EQ_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Trim Start (detik, 0 = mulai dari awal)</span>
              <input type="number" min={0} value={settings.trimStart} onChange={(e) => setSetting('trimStart', Number(e.target.value) || 0)} />
            </label>
            <label className="field">
              <span>Trim End (detik, 0 = sampai akhir)</span>
              <input type="number" min={0} value={settings.trimEnd} onChange={(e) => setSetting('trimEnd', Number(e.target.value) || 0)} />
            </label>
          </div>
        </section>

        <section className="panel">
          <h2>Preview Audio</h2>
          <div ref={waveBoxRef} className="wavebox" />
          {processed ? (
            <>
              <audio className="w-full" controls src={processed.audioDataUrl || `${API_BASE}${processed.audioUrl}`} />
              <div className="result-info">
                <span><b>{processed.title}</b></span>
                <span className="muted">Durasi: {formatDuration(processed.duration)}</span>
                <span className="muted">Ukuran: {formatBytes(processed.sizeBytes)}</span>
              </div>
            </>
          ) : (
            <p className="muted">Hasil konversi akan muncul di sini sebelum diupload.</p>
          )}
          <div className="actions">
            <button className="secondary" onClick={handleProcessClick} disabled={loading || (!audioFile && !youtubeUrl)}>
              {loading ? <Loader2 className="spin" size={18} /> : <Music2 size={18} />} Konversi Audio
            </button>
            {processed && (
              <a
                className="primary"
                href={processed.audioDataUrl || `${API_BASE}${processed.audioUrl}`}
                download={processed.fileName || 'audio.ogg'}
              >
                Download OGG
              </a>
            )}
            {processed && (
              <button className="icon-wide" onClick={() => setProcessed(null)}>Convert Lagi</button>
            )}
          </div>
        </section>
        </>
        )}

        {(activePage === 'pipeline' || activePage === 'keys') && (
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
            {activePage === 'pipeline' && (
              <button className="primary" onClick={convertAndUpload} disabled={loading || (!audioFile && !youtubeUrl && !processed)}>
                {loading ? <Loader2 className="spin" size={18} /> : <Upload size={18} />} Convert & Upload
              </button>
            )}
            {activePage === 'keys' && (
              <>
                <p className="muted small">API key disimpan di browser dengan enkripsi AES. Tidak dikirim ke server kecuali saat upload Roblox.</p>
                <button className="secondary" onClick={testRobloxConnection} disabled={!apiKey}>Test Connection</button>
              </>
            )}
          </section>
        )}

        {(activePage === 'pipeline' || activePage === 'groups') && (
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
              {!groups.length && <p className="muted">Belum ada grup tertaut.</p>}
            </div>
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
  history: 'Riwayat Upload',
  keys: 'API Keys & Konfigurasi Roblox',
  groups: 'Manajemen Grup',
  billing: 'Langganan & Invoice',
  settings: 'Pengaturan Akun'
};

createRoot(document.getElementById('root')).render(<App />);
