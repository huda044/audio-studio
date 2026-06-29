import React, { lazy, Suspense, memo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music2, Wand2, Settings, History, ShieldCheck, ShieldAlert, Menu, X } from 'lucide-react';
import { useApp } from '../App.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import Hero from '../components/Hero.jsx';

// Lazy-load pages berat: ConvertPage (~22KB) & teman-temannya jadi chunk terpisah,
// baru diunduh ketika dibutuhkan, bukan di initial load. Wrapper memo tetap memakai
// komponen lazy ini dengan Suspense fallback minimal.
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

// Section-section dibungkus memo supaya tidak ikut re-render ketika state scroll/active
// di Dashboard berubah (props mereka statis / dari context sendiri).
const ConvertSectionMemo = memo(function ConvertSectionMemo() { return <ConvertSection />; });
const RobloxSectionMemo = memo(function RobloxSectionMemo() { return <RobloxSection />; });
const HistorySectionMemo = memo(function HistorySectionMemo() { return <HistoryPage />; });
const LibrarySectionMemo = memo(function LibrarySectionMemo() { return <LibraryPage />; });

export default function Dashboard() {
  const { roblox } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const [activeId, setActiveId] = useState('konversi');
  const [menuOpen, setMenuOpen] = useState(false);
  const sectionRefs = useRef({});

  useEffect(() => {
    // Deteksi "scrolled" (navbar solid) tetap memakai event sederhana — operasinya O(1).
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Deteksi section aktif memakai IntersectionObserver (jauh lebih efisien daripada
    // getBoundingClientRect x3 + sort di tiap pixel scroll). Observer hanya callback
    // saat sebuah section masuk/keluar viewport.
    const visibleShares = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleShares.set(entry.target.id, entry.intersectionRatio);
          else visibleShares.delete(entry.target.id);
        }
        if (!visibleShares.size) return;
        let bestId = null, bestRatio = -1;
        for (const [id, ratio] of visibleShares) {
          if (ratio > bestRatio) { bestRatio = ratio; bestId = id; }
        }
        if (bestId) setActiveId(bestId);
      },
      { rootMargin: '-120px 0px -55% 0px', threshold: [0, 0.15, 0.4, 0.75, 1] }
    );
    LINKS.forEach((l) => {
      const el = document.getElementById(l.id);
      if (el) { sectionRefs.current[l.id] = el; io.observe(el); }
    });

    return () => {
      window.removeEventListener('scroll', onScroll);
      io.disconnect();
    };
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

          <button type="button" className="nav-menu-btn" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              className="nav-mobile"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            >
              {LINKS.map((l) => {
                const Icon = l.icon;
                return (
                  <button key={l.id} type="button" className={`nav-mobile-link ${activeId === l.id ? 'active' : ''}`} onClick={() => { scrollTo(l.id); setMenuOpen(false); }}>
                    <Icon size={16} /> {l.label}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
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
