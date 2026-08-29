import React, { lazy, Suspense, memo, useEffect, useState } from 'react';
import { Music2, Wand2, Settings, History, ShieldCheck, ShieldAlert, Menu, X } from 'lucide-react';
import { useApp } from '../App.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import Hero from '../components/Hero.jsx';

// Lazy-load section berat: kode terpisah per-chunk, baru diunduh saat dibutuhkan.
const ConvertSection = lazy(() => import('./ConvertPage.jsx'));
const RobloxSection = lazy(() => import('./SettingsPage.jsx'));
const HistoryPage = lazy(() => import('./HistoryPage.jsx'));
const LibraryPage = lazy(() => import('./LibraryPage.jsx'));

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
    <div className="section-head">
      <span className="section-num">{index}</span>
      <div className="section-head-text">
        <h2>{icon}{title}</h2>
        <p>{desc}</p>
      </div>
      <span className="section-line" />
    </div>
  );
}

// Section dibungkus memo supaya tidak re-render ketika state navbar berubah.
const ConvertSectionMemo = memo(function ConvertSectionMemo() { return <ConvertSection />; });
const RobloxSectionMemo = memo(function RobloxSectionMemo() { return <RobloxSection />; });
const HistorySectionMemo = memo(function HistorySectionMemo() { return <HistoryPage />; });
const LibrarySectionMemo = memo(function LibrarySectionMemo() { return <LibraryPage />; });

export default function Dashboard() {
  const { roblox } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const keyReady = Boolean(roblox.apiKey);

  return (
    <div className="page">
      <header className="navbar">
        <div className="navbar-inner">
          <button className="nav-brand" onClick={() => scrollTo('konversi')} type="button">
            <span className="brand-logo">L</span>
            <span className="nav-brand-text">
              <b>LuciVoid</b>
              <small>Audio Studio</small>
            </span>
          </button>

          <nav className="nav-links">
            {LINKS.map((l) => {
              const Icon = l.icon;
              return (
                <button key={l.id} type="button" className="top-link" onClick={() => scrollTo(l.id)}>
                  <Icon size={15} /> <span>{l.label}</span>
                </button>
              );
            })}
          </nav>

          <button type="button" className={`key-chip ${keyReady ? 'ok' : 'warn'}`} onClick={() => scrollTo('roblox')}>
            {keyReady ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
            <span>{keyReady ? 'Roblox siap' : 'Set API key'}</span>
          </button>

          <button type="button" className="nav-menu-btn" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {menuOpen && (
          <div className="nav-mobile">
            {LINKS.map((l) => {
              const Icon = l.icon;
              return (
                <button key={l.id} type="button" className="nav-mobile-link" onClick={() => { scrollTo(l.id); setMenuOpen(false); }}>
                  <Icon size={16} /> {l.label}
                </button>
              );
            })}
          </div>
        )}
      </header>

      <main className="container">
        <Hero />

        <section id="konversi" className="section">
          <SectionHead index="01" icon={<Music2 size={18} />} title="Konversi Audio" desc="Upload file, atur preset & durasi per part, lalu kirim ke Roblox." />
          <Suspense fallback={<Skeleton h={300} />}><ConvertSectionMemo /></Suspense>
        </section>

        <section id="roblox" className="section">
          <SectionHead index="02" icon={<Settings size={18} />} title="Pengaturan Roblox" desc="API key, target creator, dan komunitas — tersimpan di browser ini." />
          <Suspense fallback={<Skeleton h={250} />}><RobloxSectionMemo /></Suspense>
        </section>

        <section id="riwayat" className="section">
          <SectionHead index="03" icon={<History size={18} />} title="Riwayat & Asset Library" desc="Audio yang pernah diproses dan asset Roblox yang diterima." />
          <div className="grid-2">
            <Suspense fallback={<Skeleton h={200} />}><HistorySectionMemo /></Suspense>
            <Suspense fallback={<Skeleton h={200} />}><LibrarySectionMemo /></Suspense>
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
