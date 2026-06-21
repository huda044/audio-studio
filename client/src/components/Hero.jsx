import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowDown, Settings, Music4, Scissors, ShieldCheck, Layers } from 'lucide-react';
import { useApp } from '../App.jsx';
import { MagneticButton, CountUp } from './ui.jsx';
import HeroRing from './HeroRing.jsx';

const FLOATING = [
  { t: 'Audio Engine', x: '6%', y: '20%', d: 0 },
  { t: 'Auto Split', x: '82%', y: '16%', d: 0.6 },
  { t: 'Roblox Cloud', x: '88%', y: '64%', d: 1.2 },
  { t: 'Next Generation', x: '4%', y: '70%', d: 0.9 },
  { t: 'FFmpeg Core', x: '70%', y: '84%', d: 1.5 }
];

export default function Hero() {
  const { history, goto } = useApp();

  const stats = useMemo(() => {
    const totalConv = history.length;
    const totalParts = history.reduce((n, h) => n + (h.parts || []).length, 0);
    const accepted = history.reduce((n, h) => n + (h.parts || []).filter((p) => p.status === 'Accepted').length, 0);
    return { totalConv, totalParts, accepted };
  }, [history]);

  return (
    <section className="hero">
      <HeroRing />
      {FLOATING.map((f) => (
        <motion.span
          key={f.t} className="float-word" style={{ left: f.x, top: f.y }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.15, 0.5, 0.15], y: [0, -14, 0], rotate: [-2, 2, -2] }}
          transition={{ duration: 7, repeat: Infinity, delay: f.d, ease: 'easeInOut' }}
        >
          {f.t}
        </motion.span>
      ))}

      <motion.div className="hero-eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Sparkles size={14} /> NEXT-GEN AUDIO PIPELINE
      </motion.div>

      <motion.h1 className="hero-title" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, type: 'spring', stiffness: 120, damping: 18 }}>
        Ubah Audio Jadi <span className="grad">Asset Roblox</span><br />dalam Hitungan Detik
      </motion.h1>

      <motion.p className="hero-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
        Upload lagu, atur efek & preset, lalu sistem otomatis memotongnya jadi beberapa part dan mengunggahnya ke Roblox Open Cloud. Tanpa login, tanpa ribet.
      </motion.p>

      <motion.div className="hero-cta" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
        <MagneticButton className="primary neon-border" onClick={() => goto('konversi')}><Music4 size={17} /> Mulai Konversi</MagneticButton>
        <MagneticButton onClick={() => goto('roblox')}><Settings size={16} /> Pengaturan Roblox</MagneticButton>
      </motion.div>

      <motion.div className="hero-stats" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
        <div className="hstat"><span className="hstat-ico"><Music4 size={18} /></span><div><b><CountUp value={stats.totalConv} /></b><small>Konversi</small></div></div>
        <div className="hstat"><span className="hstat-ico"><Scissors size={18} /></span><div><b><CountUp value={stats.totalParts} /></b><small>Part dibuat</small></div></div>
        <div className="hstat"><span className="hstat-ico"><ShieldCheck size={18} /></span><div><b><CountUp value={stats.accepted} /></b><small>Asset diterima</small></div></div>
        <div className="hstat"><span className="hstat-ico"><Layers size={18} /></span><div><b>OGG</b><small>Output Roblox</small></div></div>
      </motion.div>

      <motion.button className="hero-scroll" onClick={() => goto('konversi')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} aria-label="Scroll ke konversi">
        <ArrowDown size={18} />
      </motion.button>
    </section>
  );
}
