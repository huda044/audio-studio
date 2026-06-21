import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music2, History, Library, Settings, X } from 'lucide-react';

const NAV = [
  { section: 'STUDIO', items: [
    { id: 'convert', label: 'Konversi Audio', icon: Music2 },
    { id: 'history', label: 'Riwayat Upload', icon: History },
    { id: 'library', label: 'Asset Library', icon: Library }
  ]},
  { section: 'AKUN', items: [
    { id: 'settings', label: 'Pengaturan Roblox', icon: Settings }
  ]}
];

function NavList({ active, onNavigate, badges }) {
  return (
    <>
      <div className="brand">
        <motion.div className="brand-logo" whileHover={{ rotate: 8, scale: 1.08 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>L</motion.div>
        <div>
          <div className="brand-name">LuciVoid</div>
          <div className="brand-tag">Audio Studio</div>
        </div>
      </div>
      {NAV.map((group) => (
        <div key={group.section}>
          <p className="nav-section">{group.section}</p>
          {group.items.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            const badge = badges?.[item.id];
            return (
              <motion.button
                key={item.id} type="button"
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
                whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}
              >
                {isActive && <motion.span className="nav-active-bar" layoutId="nav-active" transition={{ type: 'spring', stiffness: 350, damping: 30 }} />}
                <Icon size={17} />
                <span>{item.label}</span>
                {badge ? <span className="nav-badge">{badge}</span> : null}
              </motion.button>
            );
          })}
        </div>
      ))}
      <div className="sidebar-foot">
        Mode upload file · tanpa login. API key & data Roblox tersimpan di browser ini.
      </div>
    </>
  );
}

export default function Sidebar({ active, onNavigate, badges, mobileOpen, setMobileOpen }) {
  return (
    <>
      <aside className="sidebar">
        <NavList active={active} onNavigate={onNavigate} badges={badges} />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside
              className="sidebar open" style={{ display: 'flex' }}
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <button className="btn ghost sm" style={{ alignSelf: 'flex-end' }} onClick={() => setMobileOpen(false)}><X size={16} /></button>
              <NavList active={active} onNavigate={(id) => { onNavigate(id); setMobileOpen(false); }} badges={badges} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
