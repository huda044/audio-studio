import React, { useMemo } from 'react';
import { Music4, Settings, Scissors, ShieldCheck } from 'lucide-react';
import { useApp } from '../App.jsx';

// Hero sederhana: judul, satu kalimat, dua tombol, ringkasan statistik lokal.
// Tanpa partikel/ring/animasi — cepat render dan enak dibaca.
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
      <h1 className="hero-title">
        Ubah Audio Jadi <span className="grad">Asset Roblox</span> dalam Hitungan Detik
      </h1>

      <p className="hero-sub">
        Upload lagu, atur efek & preset, sistem otomatis memotong jadi beberapa part
        dan mengunggahnya ke Roblox Open Cloud. Tanpa login.
      </p>

      <div className="hero-cta">
        <button type="button" className="btn primary" onClick={() => goto('konversi')}>
          <Music4 size={17} /> Mulai Konversi
        </button>
        <button type="button" className="btn" onClick={() => goto('roblox')}>
          <Settings size={16} /> Pengaturan Roblox
        </button>
      </div>

      <div className="hero-stats">
        <div className="hstat"><span className="hstat-ico"><Music4 size={18} /></span><div><b>{stats.totalConv}</b><small>Konversi</small></div></div>
        <div className="hstat"><span className="hstat-ico"><Scissors size={18} /></span><div><b>{stats.totalParts}</b><small>Part dibuat</small></div></div>
        <div className="hstat"><span className="hstat-ico"><ShieldCheck size={18} /></span><div><b>{stats.accepted}</b><small>Asset diterima</small></div></div>
      </div>
    </section>
  );
}
