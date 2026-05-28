import nodemailer from 'nodemailer';

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter || !process.env.SMTP_HOST) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  });
  return cachedTransporter;
}

function brand() {
  return {
    name: process.env.APP_NAME || 'Audio Studio',
    color: process.env.APP_COLOR || '#06b6d4',
    site: process.env.APP_PUBLIC_URL || ''
  };
}

function shell(title, bodyHtml) {
  const { name, color, site } = brand();
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0d1117;font-family:Inter,system-ui,Segoe UI,Roboto,sans-serif;color:#e2e8f0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="background:#11161f;border:1px solid #1f2937;border-radius:18px;overflow:hidden;">
      <div style="padding:20px 26px;border-bottom:1px solid #1f2937;display:flex;align-items:center;gap:10px;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${color};"></span>
        <strong style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:${color};">${name}</strong>
      </div>
      <div style="padding:26px;">
        <h1 style="margin:0 0 14px;font-size:22px;color:#ffffff;">${title}</h1>
        ${bodyHtml}
      </div>
      <div style="padding:18px 26px;border-top:1px solid #1f2937;font-size:12px;color:#64748b;">
        Email otomatis dari ${name}${site ? ` &middot; <a style="color:${color};text-decoration:none;" href="${site}">${site.replace(/^https?:\/\//, '')}</a>` : ''}
      </div>
    </div>
  </div>
</body></html>`;
}

export async function sendEmail({ to, subject, html, text }) {
  const transporter = getTransporter();
  if (!transporter) return { sent: false, reason: 'smtp_not_configured' };
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html
  });
  return { sent: true };
}

export async function sendVerificationCode(email, code) {
  const subject = `Kode Verifikasi ${brand().name}`;
  const text = `Kode verifikasi akun ${brand().name} kamu: ${code}\nKode berlaku 15 menit.`;
  const html = shell('Verifikasi Email', `
    <p style="margin:0 0 12px;color:#cbd5f5;">Masukkan kode di bawah ini di halaman verifikasi untuk mengaktifkan akun.</p>
    <div style="margin:16px 0;padding:18px;border-radius:14px;background:#020617;border:1px solid ${brand().color};text-align:center;font-size:30px;letter-spacing:8px;font-weight:800;color:${brand().color};">${code}</div>
    <p style="margin:0;color:#94a3b8;font-size:13px;">Kode berlaku 15 menit. Abaikan email ini jika kamu tidak meminta verifikasi.</p>
  `);
  return sendEmail({ to: email, subject, html, text });
}

export async function sendInvoiceCreated(email, invoice) {
  const subject = `Invoice ${invoice.id} dibuat`;
  const text = `Invoice ${invoice.id} sebesar Rp${Number(invoice.amount || 0).toLocaleString('id-ID')} (${invoice.method.toUpperCase()}) menunggu pembayaran.`;
  const html = shell('Invoice Langganan Dibuat', `
    <p style="margin:0 0 12px;color:#cbd5f5;">Berikut detail invoice langgananmu.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#e2e8f0;">
      <tr><td style="padding:6px 0;color:#94a3b8;">ID</td><td style="padding:6px 0;text-align:right;"><code style="color:#cbd5f5;">${invoice.id}</code></td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8;">Paket</td><td style="padding:6px 0;text-align:right;">${invoice.label}</td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8;">Metode</td><td style="padding:6px 0;text-align:right;">${invoice.method.toUpperCase()}</td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8;">Total</td><td style="padding:6px 0;text-align:right;font-weight:700;">Rp${Number(invoice.amount).toLocaleString('id-ID')}</td></tr>
    </table>
    <p style="margin:14px 0 0;color:#94a3b8;font-size:13px;">${invoice.instructions || ''}</p>
  `);
  return sendEmail({ to: email, subject, html, text });
}

export async function sendPaidActivated(email, invoice) {
  const subject = `Langganan ${invoice.label} aktif`;
  const expires = new Date(invoice.expiresAt || Date.now()).toLocaleString('id-ID');
  const text = `Langganan ${invoice.label} aktif sampai ${expires}.`;
  const html = shell('Langganan Aktif', `
    <p style="margin:0 0 12px;color:#cbd5f5;">Pembayaranmu sudah dikonfirmasi. Selamat menikmati limit Paid.</p>
    <ul style="margin:0 0 12px;padding-left:18px;color:#cbd5f5;">
      <li>Tanpa limit jumlah konversi.</li>
      <li>Durasi sumber tanpa batas 10 menit.</li>
      <li>Auto split per 3 menit untuk upload ke Roblox tetap aktif.</li>
    </ul>
    <p style="margin:0;color:#94a3b8;font-size:13px;">Aktif sampai <strong style="color:#e2e8f0;">${expires}</strong>.</p>
  `);
  return sendEmail({ to: email, subject, html, text });
}

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

export async function sendPasswordResetCode(email, code) {
  const subject = `Reset Password ${brand().name}`;
  const text = `Kode reset password akun ${brand().name} kamu: ${code}\nKode berlaku 30 menit.`;
  const html = shell('Reset Password', `
    <p style="margin:0 0 12px;color:#cbd5f5;">Kamu meminta reset password. Masukkan kode di bawah ini di halaman reset password.</p>
    <div style="margin:16px 0;padding:18px;border-radius:14px;background:#020617;border:1px solid ${brand().color};text-align:center;font-size:30px;letter-spacing:8px;font-weight:800;color:${brand().color};">${code}</div>
    <p style="margin:0;color:#94a3b8;font-size:13px;">Kode berlaku 30 menit. Abaikan email ini jika kamu tidak meminta reset password.</p>
  `);
  return sendEmail({ to: email, subject, html, text });
}
