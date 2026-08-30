import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import { STORAGE_KEYS, defaultSettings } from './lib/constants.js';
import { API_BASE } from './lib/constants.js';
import { pingHealth } from './lib/api.js';
import { useStoredState, safeParse, obfuscate, deobfuscate } from './lib/storage.js';
import { normalizeSettings } from './lib/utils.js';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

function useRobloxConfig() {
  const [roblox, setRoblox] = useState(() => {
    const raw = safeParse(localStorage.getItem(STORAGE_KEYS.roblox), {});
    return {
      apiKey: deobfuscate(raw.apiKey || ''),
      mode: raw.mode || 'personal',
      userId: raw.userId || '',
      groupId: raw.groupId || '',
      selectedGroupId: raw.selectedGroupId || ''
    };
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.roblox, JSON.stringify({ ...roblox, apiKey: obfuscate(roblox.apiKey) }));
    } catch {
      // ignore storage errors
    }
  }, [roblox]);
  return [roblox, setRoblox];
}

export default function App() {
  const [toast, setToast] = useState(null);
  // Kesehatan backend: 'checking' | 'up' | 'down'. Banner hanya saat down.
  const [backend, setBackend] = useState('checking');
  const [roblox, setRoblox] = useRobloxConfig();
  const [groups, setGroups] = useStoredState(STORAGE_KEYS.groups, []);
  const [history, setHistory] = useStoredState(STORAGE_KEYS.history, []);
  const [settings, setSettings] = useStoredState(STORAGE_KEYS.settings, normalizeSettings(defaultSettings));
  const [customPresets, setCustomPresets] = useStoredState(STORAGE_KEYS.customPresets, []);

  function notify(message, type = 'success') {
    const id = Date.now() + Math.random();
    setToast({ id, message, type });
    setTimeout(() => setToast((cur) => (cur && cur.id === id ? null : cur)), 3400);
  }

  // Monitor backend: saat down, ulangi tiap 20 detik (banner hilang otomatis begitu
  // hidup lagi); saat up, cek ulang tiap 5 menit untuk mendeteksi kalau mati lagi.
  useEffect(() => {
    let alive = true;
    let timer = null;
    async function check() {
      let ok = false;
      try {
        ok = await pingHealth();
      } catch {
        ok = false;
      }
      if (!alive) return;
      setBackend(ok ? 'up' : 'down');
      timer = setTimeout(check, ok ? 300000 : 20000);
    }
    check();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  function goto(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Preconnect ke origin API (beda domain saat deploy terpisah: Vercel → backend)
  // supaya panggilan API pertama hemat DNS+TLS handshake.
  useEffect(() => {
    try {
      const origin = new URL(API_BASE, window.location.origin).origin;
      if (origin && origin !== window.location.origin && !document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = origin;
        link.crossOrigin = '';
        document.head.appendChild(link);
      }
    } catch {
      // API_BASE tidak valid — abaikan
    }
  }, []);

  const ctx = useMemo(() => ({
    roblox, setRoblox, groups, setGroups, history, setHistory, settings, setSettings, customPresets, setCustomPresets, notify, goto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [roblox, groups, history, settings, customPresets]);

  return (
    <AppContext.Provider value={ctx}>
      {backend === 'down' && (
        <div className="backend-banner" role="status">
          ⚠️ Backend tidak terjangkau — jalankan <b>JALANKAN-BACKEND.bat</b> di PC kamu,
          atau tunggu Hugging Face Space bangun (±1 menit). Dicek ulang otomatis tiap 20 detik.
        </div>
      )}
      <Dashboard />

      <div className="toast-wrap">
        {toast && <div key={toast.id} className={`toast ${toast.type}`}>{toast.message}</div>}
      </div>
    </AppContext.Provider>
  );
}
