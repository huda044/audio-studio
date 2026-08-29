import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import { STORAGE_KEYS, defaultSettings } from './lib/constants.js';
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
  const [roblox, setRoblox] = useRobloxConfig();
  const [groups, setGroups] = useStoredState(STORAGE_KEYS.groups, []);
  const [history, setHistory] = useStoredState(STORAGE_KEYS.history, []);
  const [settings, setSettings] = useStoredState(STORAGE_KEYS.settings, normalizeSettings(defaultSettings));

  function notify(message, type = 'success') {
    const id = Date.now() + Math.random();
    setToast({ id, message, type });
    setTimeout(() => setToast((cur) => (cur && cur.id === id ? null : cur)), 3400);
  }

  function goto(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const ctx = useMemo(() => ({
    roblox, setRoblox, groups, setGroups, history, setHistory, settings, setSettings, notify, goto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [roblox, groups, history, settings]);

  return (
    <AppContext.Provider value={ctx}>
      <Dashboard />

      <div className="toast-wrap">
        {toast && <div key={toast.id} className={`toast ${toast.type}`}>{toast.message}</div>}
      </div>
    </AppContext.Provider>
  );
}
