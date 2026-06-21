import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Music2, Wand2, Settings, History, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useApp } from '../App.jsx';
import ConvertSection from './ConvertPage.jsx';
import RobloxSection from './SettingsPage.jsx';
import HistoryPage from './HistoryPage.jsx';
import LibraryPage from './LibraryPage.jsx';

const LINKS = [
  { id: 'konversi', label: 'Konversi', icon: Wand2 },
  { id: 'roblox', label: 'Pengaturan', icon: Settings },
  { id: 'riwayat', label: 'Riwayat', icon: History }
];

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function SectionHead({ index, title, desc, icon }) {
  return (
    <motion.div className="section-head" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }}>
      <span className="section-num">{index}</span>
      <div className="section-head-text">
        <h2>{icon}{title}</h2>
        <p>{desc}</p>
      </div>
      <span className="section-line" />
    </motion.div>
  );
}

export default function Dashboard() {
  const { roblox } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const [activeId, setActiveId] = useState('konversi');

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 10);
      const positions = LINKS.map((l) => {
        const el = document.getElementById(l.id);
        return { id: l.id, top: el ? Math.abs(el.getBoundingClientRect().top - 120) : Infinity };
      });
      positions.sort((a, b) => a.top - b.top);
      setActiveId(positions[0].id);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const keyReady = Boolean(roblox.apiKey);

  return (
    <div className="page">
      <header className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="navbar-inner">
          <button className="nav-brand" onClick={() => scrollTo('konversi')} type="button">
            <motion.span className="brand-logo" whileHover={{ rotate: 8, scale: 1.08 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>L</motion.span>
            <span className="nav-brand-text">
              <b>LuciVoid</b>
              <small>Audio Studio</small>
            </span>
          </button>

          <nav className="nav-links">
            {LINKS.map((l) => {
              const Icon = l.icon;
              return (
                <button key={l.id} type="button" className={`top-link ${activeId === l.id ? 'active' : ''}`} onClick={() => scrollTo(l.id)}>
                  <Icon size={15} /> <span>{l.label}</span>
                  {activeId === l.id && <motion.span className="top-link-bar" layoutId="toplink" transition={{ type: 'spring', stiffness: 350, damping: 30 }} />}
                </button>
              );
            })}
          </nav>

          <button type="button" className={`key-chip ${keyReady ? 'ok' : 'warn'}`} onClick={() => scrollTo('roblox')}>
            {keyReady ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
            <span>{keyReady ? 'Roblox siap' : 'Set API key'}</span>
          </button>
        </div>
      </header>

      <main className="container">
        <section id="konversi" className="section">
          <SectionHead index="01" icon={<Music2 size={18} />} title="Konversi Audio" desc="Upload file, atur preset & durasi per part, lalu kirim ke Roblox." />
          <ConvertSection />
        </section>

        <section id="roblox" className="section">
          <SectionHead index="02" icon={<Settings size={18} />} title="Pengaturan Roblox" desc="API key, target creator, dan komunitas — tersimpan di browser ini." />
          <RobloxSection />
        </section>

        <section id="riwayat" className="section">
          <SectionHead index="03" icon={<History size={18} />} title="Riwayat & Asset Library" desc="Audio yang pernah diproses dan asset Roblox yang diterima." />
          <div className="grid-2">
            <HistoryPage />
            <LibraryPage />
          </div>
        </section>

        <footer className="page-foot">
          <span>LuciVoid Audio Studio</span>
          <span className="muted small">Mode upload-only · tanpa login · data tersimpan di browser ini</span>
        </footer>
      </main>
    </div>
  );
}
