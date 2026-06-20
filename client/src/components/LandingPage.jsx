import React from 'react';
import { MAX_AUDIO_DURATION_SECONDS } from '../lib/constants.js';

// Halaman landing untuk pengunjung yang belum login.
export default function LandingPage({ toast, gatewayInfo, onNavigate, onDiscordLogin }) {
  const features = [
    {
      title: 'Konversi & Edit Audio',
      desc: 'Speed, amplifikasi, pitch, EQ preset, fade, trim, dan efek manual seperti bass boost, reverb, echo, normalize. Output siap dipakai di Roblox.',
      icon: '🎚️'
    },
    {
      title: 'YouTube + SoundCloud',
      desc: 'Tempel link YouTube atau SoundCloud, server tarik audionya pakai yt-dlp dengan cookie auth, langsung ke pipeline.',
      icon: '🔗'
    },
    {
      title: 'Auto Split & Upload',
      desc: 'Audio panjang otomatis dipecah jadi part 3 menit, upload langsung ke Roblox Open Cloud (Personal atau Group). Status moderasi dipantau realtime.',
      icon: '🚀'
    },
    {
      title: 'API Key Aman AES-256',
      desc: 'Roblox API key kamu disimpan terenkripsi AES-256-GCM di server. Plaintext tidak pernah dikirim balik ke browser.',
      icon: '🔐'
    },
    {
      title: 'Login Fleksibel',
      desc: gatewayInfo?.discord?.enabled
        ? 'Email/password, Google, atau Discord — pilih cara login yang paling cocok.'
        : 'Email/password atau Google. Verifikasi via email code.',
      icon: '👤'
    },
    {
      title: 'Pembayaran Lokal',
      desc: 'QRIS, DANA, GoPay, ShopeePay, virtual account — via Midtrans. Aktivasi paket otomatis setelah pembayaran sukses.',
      icon: '💳'
    }
  ];
  const plans = [
    { id: 'seven', label: 'Paid 7 Hari', price: 'Rp 35.000', perks: ['Konversi tanpa batas', `Durasi maks ${MAX_AUDIO_DURATION_SECONDS} detik per lagu`, 'Upload Roblox Personal & Group', 'Cek moderasi realtime'] },
    { id: 'thirty', label: 'Paid 30 Hari', price: 'Rp 100.000', perks: ['Semua benefit 7 hari', 'Lebih hemat untuk produksi rutin', 'Prioritas dukungan'], featured: true }
  ];
  return (
    <main className="landing-page">
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
      <header className="landing-header">
        <div className="landing-brand">
          <div className="sidebar-logo">L</div>
          <div>
            <p className="sidebar-brand-name">LuciVoid Audio Studio</p>
            <p className="sidebar-brand-tag">Konversi & Upload Audio Roblox</p>
          </div>
        </div>
        <div className="landing-cta">
          <button type="button" className="secondary" onClick={() => onNavigate('terms')}>Terms</button>
          <button type="button" className="secondary" onClick={() => onNavigate('privacy')}>Privacy</button>
          <button type="button" className="primary" onClick={() => onNavigate('login')}>Masuk</button>
        </div>
      </header>

      <section className="landing-hero">
        <h1>Konversi audio dari YouTube &amp; SoundCloud, langsung upload ke Roblox.</h1>
        <p>
          Pipeline lengkap: download → edit (speed, EQ, pitch, efek) → split otomatis → upload Roblox
          Open Cloud → pantau moderasi. API key kamu disimpan terenkripsi AES-256.
        </p>
        <div className="landing-cta">
          <button type="button" className="primary" onClick={() => onNavigate('login')}>Mulai Sekarang</button>
          {gatewayInfo?.discord?.enabled && (
            <button type="button" className="discord-button" onClick={onDiscordLogin} style={{ width: 'auto' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.319 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.027c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.245.198.371.292a.077.077 0 0 1-.006.128 12.299 12.299 0 0 1-1.873.891.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.418 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.094 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.156-1.085-2.156-2.418 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.094 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
              Lanjut dengan Discord
            </button>
          )}
        </div>
      </section>

      <section className="landing-features">
        <h2>Fitur</h2>
        <div className="landing-grid">
          {features.map((f) => (
            <div className="landing-card" key={f.title}>
              <div className="landing-icon" aria-hidden>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-pricing">
        <h2>Paket</h2>
        <div className="landing-plans">
          {plans.map((plan) => (
            <div className={`landing-plan${plan.featured ? ' featured' : ''}`} key={plan.id}>
              {plan.featured && <span className="plan-tag">Populer</span>}
              <h3>{plan.label}</h3>
              <p className="plan-price">{plan.price}</p>
              <ul>{plan.perks.map((perk) => <li key={perk}>{perk}</li>)}</ul>
              <button type="button" className="primary" onClick={() => onNavigate('login')}>Mulai</button>
            </div>
          ))}
        </div>
        <p className="muted small landing-free-note">Akun Free dapat 3 konversi gratis untuk uji coba (maks {MAX_AUDIO_DURATION_SECONDS} detik per lagu).</p>
      </section>

      <section className="landing-security">
        <h2>Keamanan</h2>
        <div className="landing-grid">
          <div className="landing-card">
            <div className="landing-icon" aria-hidden>🔒</div>
            <h3>AES-256 untuk Credential</h3>
            <p>API key Roblox disimpan terenkripsi pakai AES-256-GCM. Master key hanya ada di server, bukan di browser.</p>
          </div>
          <div className="landing-card">
            <div className="landing-icon" aria-hidden>🌐</div>
            <h3>HTTPS Only</h3>
            <p>Semua trafik aplikasi melalui HTTPS. Token JWT untuk session, refresh tiap login.</p>
          </div>
          <div className="landing-card">
            <div className="landing-icon" aria-hidden>📜</div>
            <h3>Audit Log</h3>
            <p>Setiap aksi penting (login, konversi, perubahan API key) tercatat di audit log akun kamu.</p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <p>© {new Date().getFullYear()} LuciVoid Audio Studio.</p>
        <p>
          <button type="button" className="auth-link-button" onClick={() => onNavigate('privacy')}>Privacy Policy</button>
          {' · '}
          <button type="button" className="auth-link-button" onClick={() => onNavigate('terms')}>Terms of Service</button>
          {' · '}
          <a href={gatewayInfo?.admin?.discord || 'https://discord.com'} target="_blank" rel="noreferrer">Support Discord</a>
        </p>
      </footer>
    </main>
  );
}
