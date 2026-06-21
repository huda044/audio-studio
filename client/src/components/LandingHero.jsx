import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Crown, Sparkles, UploadCloud, Scissors, Rocket } from 'lucide-react';

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260606_154941_df1a96e1-a06f-450c-bd02-d863414cc1a0.mp4';

const STATS = [
  { value: '3 min', label: 'Auto-split per part' },
  { value: 'Batch', label: 'Banyak lagu sekaligus' },
  { value: '0 Login', label: 'Data di browser kamu' }
];

const HIGHLIGHTS = [
  { icon: UploadCloud, text: 'Upload' },
  { icon: Scissors, text: 'Auto-split' },
  { icon: Rocket, text: 'Upload Roblox' }
];

export default function LandingHero({ onEnter }) {
  const [videoOk, setVideoOk] = useState(true);

  return (
    <motion.div
      className="landing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.5 }}
    >
      {videoOk && (
        <video
          className="landing-video"
          src={VIDEO_URL}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setVideoOk(false)}
        />
      )}
      <div className="landing-overlay" />

      {/* Top bar */}
      <header className="landing-nav">
        <div className="landing-brand">
          <span className="landing-brand-logo">L</span>
          <span className="landing-brand-text font-podium">LUCIVOID</span>
        </div>
        <div className="landing-nav-tags">
          {HIGHLIGHTS.map((h) => {
            const Icon = h.icon;
            return (
              <span key={h.text} className="landing-tag">
                <Icon size={13} /> {h.text}
              </span>
            );
          })}
        </div>
        <button type="button" className="landing-skip" onClick={onEnter}>
          Lewati <ArrowUpRight size={14} />
        </button>
      </header>

      {/* Hero content */}
      <main className="landing-hero">
        <div className="landing-tagline animate-fade-up">
          <Crown size={15} />
          <span>Roblox Audio Toolkit</span>
        </div>

        <h1 className="landing-title font-podium animate-fade-up-1">
          <span>Upload.</span>
          <span>Convert.</span>
          <span>Publish.</span>
        </h1>

        <p className="landing-sub animate-fade-up-2">
          Ubah lagu jadi asset Roblox dalam hitungan detik.
          <br />
          Lagu panjang otomatis dipotong jadi beberapa part — <b>siap upload.</b>
        </p>

        <div className="landing-cta animate-fade-up-3">
          <button type="button" className="landing-btn-main group" onClick={onEnter}>
            <Sparkles size={16} />
            Masuk Studio
            <ArrowUpRight size={16} className="landing-arrow" />
          </button>
          <div className="landing-badge">
            <Crown size={26} />
            <div>
              <div>Upload-only</div>
              <div>Tanpa login</div>
            </div>
          </div>
        </div>

        <div className="landing-stats animate-fade-up-4">
          {STATS.map((s) => (
            <div key={s.label} className="landing-stat">
              <div className="landing-stat-val">{s.value}</div>
              <div className="landing-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </main>
    </motion.div>
  );
}
