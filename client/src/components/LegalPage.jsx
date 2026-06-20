import React from 'react';

// Halaman Privacy Policy / Terms of Service untuk pengunjung.
export default function LegalPage({ kind, toast, gatewayInfo, onNavigate }) {
  const isPrivacy = kind === 'privacy';
  return (
    <main className="legal-page">
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
      <header className="legal-header">
        <button type="button" className="auth-link-button" onClick={() => onNavigate('landing')}>← Kembali</button>
        <h1>{isPrivacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
        <p className="muted small">Berlaku per {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </header>
      <article className="legal-article">
        {isPrivacy ? (
          <>
            <h2>Data yang kami simpan</h2>
            <p>
              Saat kamu mendaftar, kami menyimpan username, email, hash password (bcrypt), dan opsional
              ID profil dari penyedia OAuth (Google sub, Discord ID). Saat kamu melakukan konversi atau
              upload Roblox, kami menyimpan riwayat berisi judul lagu, link sumber, durasi, status part,
              dan operation ID Roblox.
            </p>
            <h2>Roblox API Key</h2>
            <p>
              Roblox Open Cloud API key kamu disimpan terenkripsi pakai AES-256-GCM. Master key hanya
              ada di server, plaintext API key tidak pernah dikirim balik ke browser. Kami pakai key ini
              hanya untuk upload audio kamu ke Roblox dan cek status moderasi.
            </p>
            <h2>Pembayaran</h2>
            <p>
              Pembayaran diproses oleh Midtrans. Kami tidak menyimpan nomor kartu, PIN, atau detail bank
              kamu. Yang kami terima dari Midtrans hanya status invoice dan order id.
            </p>
            <h2>YouTube cookies</h2>
            <p>
              Cookie YouTube yang dipasang admin di server hanya digunakan oleh yt-dlp untuk men-download
              audio dari URL yang diminta user. Cookie tidak diakses oleh user atau dikirim ke pihak
              ketiga selain YouTube.
            </p>
            <h2>Penyimpanan</h2>
            <p>
              File audio yang sudah diproses disimpan sementara di disk server selama proses upload, lalu
              dihapus. Asset yang sudah ke-upload ke Roblox menjadi milik kamu di akun Roblox kamu.
            </p>
            <h2>Hak kamu</h2>
            <p>
              Kamu bisa menghapus akun via halaman Pengaturan; semua data riwayat dan API key yang
              tersimpan akan ikut terhapus.
            </p>
            <h2>Kontak</h2>
            <p>Pertanyaan privasi: <a href={gatewayInfo?.admin?.discord || '#'} target="_blank" rel="noreferrer">Support Discord</a>.</p>
          </>
        ) : (
          <>
            <h2>Penerimaan</h2>
            <p>Dengan menggunakan LuciVoid Audio Studio, kamu setuju dengan ketentuan ini.</p>
            <h2>Penggunaan yang diizinkan</h2>
            <ul>
              <li>Konversi audio dari YouTube/SoundCloud yang kamu punya hak / lisensi-nya.</li>
              <li>Upload audio ke akun Roblox kamu sendiri atau group yang kamu kelola.</li>
              <li>Tidak melakukan upload konten ilegal, melanggar hak cipta, atau melanggar TOS Roblox/YouTube/SoundCloud.</li>
            </ul>
            <h2>Tanggung jawab pengguna</h2>
            <p>
              Kamu bertanggung jawab atas konten yang kamu konversi dan upload. Kami tidak bertanggung
              jawab atas pelanggaran hak cipta atau pemblokiran asset oleh moderasi Roblox.
            </p>
            <h2>Pembayaran &amp; refund</h2>
            <p>
              Paket berlaku sesuai durasi yang dipilih. Refund hanya diberikan jika kami gagal
              mengaktifkan paket karena kesalahan sistem; refund tidak berlaku untuk perubahan kebijakan
              pihak ketiga (Roblox/YouTube) atau untuk konten yang ditolak moderasi.
            </p>
            <h2>Penghentian akun</h2>
            <p>
              Kami dapat menangguhkan atau memblokir akun yang melanggar ketentuan ini, terdeteksi
              melakukan penyalahgunaan API key Roblox, atau mengupload konten ilegal.
            </p>
            <h2>Perubahan ketentuan</h2>
            <p>
              Ketentuan ini bisa kami perbarui sewaktu-waktu. Versi terbaru selalu tersedia di halaman
              ini.
            </p>
          </>
        )}
      </article>
      <footer className="landing-footer">
        <p>
          <button type="button" className="auth-link-button" onClick={() => onNavigate('landing')}>Beranda</button>
          {' · '}
          <button type="button" className="auth-link-button" onClick={() => onNavigate('login')}>Masuk</button>
        </p>
      </footer>
    </main>
  );
}
