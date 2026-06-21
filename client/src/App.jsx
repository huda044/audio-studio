import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import CyberBackground from './components/CyberBackground.jsx';
import CustomCursor from './components/CustomCursor.jsx';
import ConvertPage from './pages/ConvertPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import { STORAGE_KEYS, defaultSettings } from './lib/constants.js';
import { useStoredState, safeParse, obfuscate, deobfuscate } from './lib/storage.js';
import { normalizeSettings } from './lib/utils.js';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const PAGES = {
  convert: { title: 'Konversi Audio', sub: 'Upload file, atur preset, lalu kirim ke Roblox.' },
  history: { title: 'Riwayat Upload', sub: 'Semua audio yang pernah kamu proses & upload.' },
  library: { title: 'Asset Library', sub: 'Daftar asset Roblox yang berhasil diterima.' },
  settings: { title: 'Pengaturan Roblox', sub: 'API key, creator, dan komunitas — tersimpan di browser ini.' }
};

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
  const [active, setActive] = useState('convert');
  const [mobileOpen, setMobileOpen] = useState(false);
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

  const acceptedCount = useMemo(
    () => history.reduce((n, h) => n + (h.parts || []).filter((p) => p.status === 'Accepted').length, 0),
    [history]
  );

  const ctx = useMemo(() => ({
    roblox, setRoblox, groups, setGroups, history, setHistory, settings, setSettings, notify, goto: setActive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [roblox, groups, history, settings]);

  const page = PAGES[active] || PAGES.convert;

  return (
    <AppContext.Provider value={ctx}>
      <CyberBackground />
      <div className="shell">
        <Sidebar
          active={active}
          onNavigate={setActive}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          badges={{ history: history.length || undefined, library: acceptedCount || undefined }}
        />
        <div className="main">
          <header className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn ghost sm menu-btn" onClick={() => setMobileOpen(true)} aria-label="Menu"><Menu size={18} /></button>
              <div>
                <h1>{page.title}</h1>
                <div className="sub">{page.sub}</div>
              </div>
            </div>
          </header>
          <div className="content">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                {active === 'convert' && <ConvertPage />}
                {active === 'history' && <HistoryPage />}
                {active === 'library' && <LibraryPage />}
                {active === 'settings' && <SettingsPage />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="toast-wrap">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              className={`toast ${toast.type}`}
              initial={{ opacity: 0, x: 40, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <CustomCursor />
    </AppContext.Provider>
  );
}
