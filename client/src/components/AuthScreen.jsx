import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
  ShieldCheck,
  User
} from 'lucide-react';

// Layar autentikasi (login, daftar, verifikasi email, reset password) untuk pengunjung.
export default function AuthScreen({
  sessionStatus,
  toast,
  authMode,
  authForm,
  resetMode,
  resetStep,
  pendingEmail,
  syncingProfile,
  googleClientId,
  gatewayInfo,
  googleButtonRef,
  setAuthMode,
  setAuthForm,
  setResetMode,
  setResetStep,
  setPendingEmail,
  onAuth,
  onForgotPassword,
  onResetPassword,
  onVerifyEmail,
  onResendCode,
  onDiscordLogin
}) {
  const checking = sessionStatus === 'checking' || sessionStatus === 'authenticated';

  function renderCard() {
    if (resetMode) {
      return resetStep === 'request' ? (
        <form className="auth-card-form" onSubmit={onForgotPassword}>
          <div className="auth-card-heading">
            <KeyRound size={20} />
            <div>
              <h2>Reset Password</h2>
              <p>Masukkan email akunmu.</p>
            </div>
          </div>
          <label className="auth-field">
            <span>Email</span>
            <div>
              <Mail size={17} />
              <input
                type="email"
                value={authForm.email || authForm.username}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value, username: e.target.value })}
                autoComplete="email"
                placeholder="nama@email.com"
              />
            </div>
          </label>
          <button className="primary auth-main-button" disabled={syncingProfile}>
            {syncingProfile ? <Loader2 className="spin" size={17} /> : <ArrowRight size={17} />}
            Kirim Kode Reset
          </button>
          <button type="button" className="auth-link-button" onClick={() => { setResetMode(false); setResetStep('request'); }}>
            Kembali ke Login
          </button>
        </form>
      ) : (
        <form className="auth-card-form" onSubmit={onResetPassword}>
          <div className="auth-card-heading">
            <KeyRound size={20} />
            <div>
              <h2>Password Baru</h2>
              <p>Kode reset untuk {pendingEmail || authForm.email || authForm.username}.</p>
            </div>
          </div>
          <label className="auth-field">
            <span>Kode Reset</span>
            <div>
              <ShieldCheck size={17} />
              <input
                value={authForm.code}
                onChange={(e) => setAuthForm({ ...authForm, code: e.target.value })}
                autoComplete="one-time-code"
                placeholder="6 digit kode"
              />
            </div>
          </label>
          <label className="auth-field">
            <span>Password Baru</span>
            <div>
              <LockKeyhole size={17} />
              <input
                type="password"
                value={authForm.newPassword}
                onChange={(e) => setAuthForm({ ...authForm, newPassword: e.target.value })}
                autoComplete="new-password"
                placeholder="Minimal 6 karakter"
              />
            </div>
          </label>
          <button className="primary auth-main-button" disabled={syncingProfile}>
            {syncingProfile ? <Loader2 className="spin" size={17} /> : <ArrowRight size={17} />}
            Reset Password
          </button>
          <button type="button" className="auth-link-button" onClick={() => { setResetMode(false); setResetStep('request'); setPendingEmail(''); }}>
            Kembali ke Login
          </button>
        </form>
      );
    }

    if (pendingEmail) {
      return (
        <form className="auth-card-form" onSubmit={onVerifyEmail}>
          <div className="auth-card-heading">
            <ShieldCheck size={20} />
            <div>
              <h2>Verifikasi Email</h2>
              <p>{pendingEmail}</p>
            </div>
          </div>
          <label className="auth-field">
            <span>Kode Verifikasi</span>
            <div>
              <ShieldCheck size={17} />
              <input
                value={authForm.code}
                onChange={(e) => setAuthForm({ ...authForm, code: e.target.value })}
                autoComplete="one-time-code"
                placeholder="6 digit kode"
              />
            </div>
          </label>
          <button className="primary auth-main-button" disabled={syncingProfile}>
            {syncingProfile ? <Loader2 className="spin" size={17} /> : <ArrowRight size={17} />}
            Verifikasi Email
          </button>
          <button type="button" className="secondary auth-secondary-button" onClick={onResendCode}>Kirim Ulang Kode</button>
          <button type="button" className="auth-link-button" onClick={() => { setPendingEmail(''); setAuthMode('login'); }}>
            Kembali ke Login
          </button>
        </form>
      );
    }

    return (
      <form className="auth-card-form" onSubmit={onAuth}>
        <div className="auth-card-heading">
          <LogIn size={20} />
          <div>
            <h2>{authMode === 'login' ? 'Masuk ke Audio Studio' : 'Buat Akun'}</h2>
            <p>{authMode === 'login' ? 'Sesi tersimpan otomatis di browser ini.' : 'Akun baru perlu verifikasi email.'}</p>
          </div>
        </div>
        <div className="auth-toggle" role="tablist" aria-label="Mode autentikasi">
          <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
          <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Daftar</button>
        </div>
        <label className="auth-field">
          <span>Username / Email</span>
          <div>
            <User size={17} />
            <input
              value={authForm.username}
              onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
              autoComplete="username"
              placeholder="username atau email"
            />
          </div>
        </label>
        {authMode === 'register' && (
          <label className="auth-field">
            <span>Email</span>
            <div>
              <Mail size={17} />
              <input
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                autoComplete="email"
                placeholder="nama@email.com"
              />
            </div>
          </label>
        )}
        <label className="auth-field">
          <span>Password</span>
          <div>
            <LockKeyhole size={17} />
            <input
              type="password"
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              placeholder="Password"
            />
          </div>
        </label>
        <button className="primary auth-main-button" disabled={syncingProfile}>
          {syncingProfile ? <Loader2 className="spin" size={17} /> : <ArrowRight size={17} />}
          {authMode === 'login' ? 'Login' : 'Buat Akun'}
        </button>
        {authMode === 'login' && (
          <button type="button" className="auth-link-button" onClick={() => setResetMode(true)}>
            Lupa Password?
          </button>
        )}
        {googleClientId && (
          <>
            <div className="auth-divider"><span>atau</span></div>
            <div ref={googleButtonRef} className="google-btn-slot auth-google-slot" />
          </>
        )}
        {gatewayInfo?.discord?.enabled && (
          <>
            {!googleClientId && <div className="auth-divider"><span>atau</span></div>}
            <button type="button" className="discord-button auth-discord-slot" onClick={onDiscordLogin}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.319 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.027c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.245.198.371.292a.077.077 0 0 1-.006.128 12.299 12.299 0 0 1-1.873.891.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.418 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.094 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.156-1.085-2.156-2.418 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.094 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
              Lanjut dengan Discord
            </button>
          </>
        )}
      </form>
    );
  }

  return (
    <main className="auth-page">
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
      <section className="auth-layout" aria-busy={checking}>
        <div className="auth-brand-panel">
          <div className="auth-logo-mark">L</div>
          <p className="auth-kicker">LuciVoid Audio Studio</p>
          <h1>Konversi audio dan upload Roblox dalam satu dashboard.</h1>
          <div className="auth-benefits">
            <span><CheckCircle2 size={16} /> Preset tersimpan</span>
            <span><CheckCircle2 size={16} /> Riwayat browser & akun</span>
            <span><CheckCircle2 size={16} /> Roblox Open Cloud</span>
          </div>
        </div>
        <div className="auth-card">
          {checking ? (
            <div className="auth-checking">
              <Loader2 className="spin" size={32} />
              <h2>Memuat sesi</h2>
              <p>Login otomatis dari browser sedang dicek.</p>
            </div>
          ) : renderCard()}
        </div>
      </section>
    </main>
  );
}
