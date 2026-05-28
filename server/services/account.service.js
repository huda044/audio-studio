import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import nodemailer from 'nodemailer';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { nanoid } from 'nanoid';

const dataDir = process.env.DATA_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), 'audio-studio-data') : path.resolve('data'));
const usersPath = path.join(dataDir, 'users.json');
const paymentsPath = path.join(dataDir, 'payments.json');
const jwtSecret = process.env.JWT_SECRET || 'audio-studio-dev-secret-change-me';
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;
let writeQueue = Promise.resolve();

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(usersPath);
  } catch {
    await fs.writeFile(usersPath, JSON.stringify({ users: [] }, null, 2));
  }
  try {
    await fs.access(paymentsPath);
  } catch {
    await fs.writeFile(paymentsPath, JSON.stringify({ payments: [] }, null, 2));
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(usersPath, 'utf8');
  return JSON.parse(raw || '{"users":[]}');
}

async function writeStore(store) {
  await ensureStore();
  writeQueue = writeQueue.then(() => fs.writeFile(usersPath, JSON.stringify(store)));
  await writeQueue;
}

async function readPayments() {
  await ensureStore();
  const raw = await fs.readFile(paymentsPath, 'utf8');
  return JSON.parse(raw || '{"payments":[]}');
}

async function writePayments(store) {
  await ensureStore();
  writeQueue = writeQueue.then(() => fs.writeFile(paymentsPath, JSON.stringify(store)));
  await writeQueue;
}

function nowIso() {
  return new Date().toISOString();
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function activePlan(user) {
  const subscription = user.subscription || { plan: 'free' };
  if (subscription.plan === 'paid' && subscription.expiresAt && new Date(subscription.expiresAt).getTime() > Date.now()) {
    return subscription;
  }
  return { plan: 'free', expiresAt: null, label: 'Free' };
}

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendVerificationEmail(email, code) {
  if (!process.env.SMTP_HOST) return false;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  });
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Kode Verifikasi Audio Studio',
    text: `Kode verifikasi akun Audio Studio kamu: ${code}`,
    html: `<p>Kode verifikasi akun Audio Studio kamu:</p><h2>${code}</h2>`
  });
  return true;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    subscription: activePlan(user),
    usage: user.usage || { conversions: 0 },
    createdAt: user.createdAt,
    profile: user.profile || {}
  };
}

export function signUser(user) {
  return jwt.sign({ sub: user.id, username: user.username }, jwtSecret, { expiresIn: '30d' });
}

export function verifyToken(token) {
  return jwt.verify(token, jwtSecret);
}

export async function registerUser({ username, email, password }) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanUsername.length < 3) {
    const error = new Error('Username minimal 3 karakter.');
    error.status = 400;
    throw error;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    const error = new Error('Email tidak valid.');
    error.status = 400;
    throw error;
  }
  if (String(password || '').length < 6) {
    const error = new Error('Password minimal 6 karakter.');
    error.status = 400;
    throw error;
  }

  const store = await readStore();
  if (store.users.some((user) => user.username === cleanUsername || user.email === cleanEmail)) {
    const error = new Error('Username atau email sudah dipakai.');
    error.status = 409;
    throw error;
  }
  const code = makeCode();

  const user = {
    id: nanoid(12),
    username: cleanUsername,
    email: cleanEmail,
    emailVerified: false,
    verificationCodeHash: await bcrypt.hash(code, 10),
    verificationExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
    subscription: { plan: 'free', label: 'Free', expiresAt: null },
    usage: { conversions: 0, lastConversionAt: null },
    profile: {
      robloxConfig: {},
      groups: [],
      history: []
    }
  };
  store.users.push(user);
  await writeStore(store);
  const emailSent = await sendVerificationEmail(cleanEmail, code);
  return {
    user: publicUser(user),
    verificationSent: emailSent,
    devCode: emailSent || process.env.EMAIL_DEV_CODES === 'false' ? undefined : code
  };
}

export async function loginUser({ username, password }) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  const store = await readStore();
  const user = store.users.find((item) => item.username === cleanUsername || item.email === cleanUsername);
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    const error = new Error('Username atau password salah.');
    error.status = 401;
    throw error;
  }
  if (!user.emailVerified) {
    const error = new Error('Akun belum diverifikasi. Masukkan kode verifikasi email dulu.');
    error.status = 403;
    throw error;
  }
  return publicUser(user);
}

export async function verifyEmailCode({ email, code }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const store = await readStore();
  const user = store.users.find((item) => item.email === cleanEmail);
  if (!user) {
    const error = new Error('Email tidak ditemukan.');
    error.status = 404;
    throw error;
  }
  if (new Date(user.verificationExpiresAt || 0).getTime() < Date.now()) {
    const error = new Error('Kode verifikasi sudah kedaluwarsa.');
    error.status = 400;
    throw error;
  }
  if (!(await bcrypt.compare(String(code || ''), user.verificationCodeHash || ''))) {
    const error = new Error('Kode verifikasi salah.');
    error.status = 400;
    throw error;
  }
  user.emailVerified = true;
  user.verificationCodeHash = '';
  user.verificationExpiresAt = '';
  await writeStore(store);
  return publicUser(user);
}

export async function resendVerification({ email }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const store = await readStore();
  const user = store.users.find((item) => item.email === cleanEmail);
  if (!user) {
    const error = new Error('Email tidak ditemukan.');
    error.status = 404;
    throw error;
  }
  const code = makeCode();
  user.verificationCodeHash = await bcrypt.hash(code, 10);
  user.verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await writeStore(store);
  const emailSent = await sendVerificationEmail(cleanEmail, code);
  return { sent: emailSent, devCode: emailSent || process.env.EMAIL_DEV_CODES === 'false' ? undefined : code };
}

export async function loginWithGoogle({ credential }) {
  if (!googleClient) {
    const error = new Error('Google login belum dikonfigurasi.');
    error.status = 503;
    throw error;
  }
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId });
  const payload = ticket.getPayload();
  const email = String(payload.email || '').toLowerCase();
  const username = email.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 18) || `user${nanoid(6)}`;
  const store = await readStore();
  let user = store.users.find((item) => item.email === email);
  if (!user) {
    user = {
      id: nanoid(12),
      username: store.users.some((item) => item.username === username) ? `${username}${nanoid(4)}` : username,
      email,
      emailVerified: true,
      googleSub: payload.sub,
      passwordHash: '',
      createdAt: nowIso(),
      subscription: { plan: 'free', label: 'Free', expiresAt: null },
      usage: { conversions: 0, lastConversionAt: null },
      profile: { robloxConfig: {}, groups: [], history: [] }
    };
    store.users.push(user);
  } else {
    user.emailVerified = true;
    user.googleSub = payload.sub;
  }
  await writeStore(store);
  return publicUser(user);
}

export async function getUserById(id) {
  const store = await readStore();
  const user = store.users.find((item) => item.id === id);
  return user ? publicUser(user) : null;
}

export async function assertConversionAllowed(id, sourceDurationSeconds = 0) {
  const store = await readStore();
  const user = store.users.find((item) => item.id === id);
  if (!user) {
    const error = new Error('Login dibutuhkan untuk konversi audio.');
    error.status = 401;
    throw error;
  }
  if (!user.emailVerified) {
    const error = new Error('Verifikasi email dulu sebelum konversi audio.');
    error.status = 403;
    throw error;
  }
  const plan = activePlan(user);
  const usage = user.usage || { conversions: 0 };
  if (plan.plan === 'free') {
    if (usage.conversions >= 3) {
      const error = new Error('Akun Free hanya bisa konversi 3 audio/link YouTube. Silakan berlangganan.');
      error.status = 402;
      throw error;
    }
    if (Number(sourceDurationSeconds || 0) > 600) {
      const error = new Error('Akun Free hanya bisa konversi lagu maksimal 10 menit.');
      error.status = 402;
      throw error;
    }
  }
  return { user, plan, usage };
}

export async function recordConversion(id) {
  const store = await readStore();
  const user = store.users.find((item) => item.id === id);
  if (!user) return null;
  user.usage = user.usage || { conversions: 0 };
  user.usage.conversions = Number(user.usage.conversions || 0) + 1;
  user.usage.lastConversionAt = nowIso();
  await writeStore(store);
  return publicUser(user);
}

export async function createPayment(id, { plan, method }) {
  const plans = {
    seven: { days: 7, label: 'Paid 7 Hari', amount: 15000 },
    thirty: { days: 30, label: 'Paid 30 Hari', amount: 45000 }
  };
  const methods = ['qris', 'dana', 'mandiri'];
  if (!plans[plan] || !methods.includes(method)) {
    const error = new Error('Paket atau metode bayar tidak valid.');
    error.status = 400;
    throw error;
  }
  const paymentStore = await readPayments();
  const invoice = {
    id: `INV-${Date.now()}-${nanoid(5).toUpperCase()}`,
    userId: id,
    plan,
    method,
    amount: plans[plan].amount,
    days: plans[plan].days,
    label: plans[plan].label,
    status: 'Pending',
    createdAt: nowIso(),
    instructions: paymentInstruction(method, plans[plan].amount)
  };
  paymentStore.payments.unshift(invoice);
  await writePayments(paymentStore);
  return invoice;
}

function paymentInstruction(method, amount) {
  if (method === 'qris') return `Bayar QRIS sebesar Rp${amount.toLocaleString('id-ID')} ke merchant kamu, lalu admin konfirmasi invoice.`;
  if (method === 'dana') return `Transfer DANA sebesar Rp${amount.toLocaleString('id-ID')} ke nomor DANA yang kamu atur di halaman pembayaran.`;
  return `Transfer Bank Mandiri sebesar Rp${amount.toLocaleString('id-ID')} ke rekening Mandiri yang kamu atur di halaman pembayaran.`;
}

export async function listUserPayments(id) {
  const paymentStore = await readPayments();
  return paymentStore.payments.filter((payment) => payment.userId === id).slice(0, 20);
}

export async function confirmPayment(invoiceId) {
  const paymentStore = await readPayments();
  const invoice = paymentStore.payments.find((item) => item.id === invoiceId);
  if (!invoice) {
    const error = new Error('Invoice tidak ditemukan.');
    error.status = 404;
    throw error;
  }
  invoice.status = 'Accepted';
  invoice.acceptedAt = nowIso();
  await writePayments(paymentStore);

  const store = await readStore();
  const user = store.users.find((item) => item.id === invoice.userId);
  if (!user) return invoice;
  const currentExpiry = activePlan(user).plan === 'paid' ? new Date(user.subscription.expiresAt).getTime() : Date.now();
  user.subscription = {
    plan: 'paid',
    label: invoice.label,
    expiresAt: new Date(Math.max(currentExpiry, Date.now()) + invoice.days * 24 * 60 * 60 * 1000).toISOString()
  };
  await writeStore(store);
  return invoice;
}

export async function updateUserProfile(id, profile) {
  const store = await readStore();
  const user = store.users.find((item) => item.id === id);
  if (!user) {
    const error = new Error('User tidak ditemukan.');
    error.status = 404;
    throw error;
  }
  const cleanGroups = Array.isArray(profile.groups)
    ? profile.groups.slice(0, 30).map((group) => ({
      id: String(group.id || '').slice(0, 80),
      name: String(group.name || '').slice(0, 80),
      groupId: String(group.groupId || '').slice(0, 32),
      creatorUserId: String(group.creatorUserId || '').slice(0, 32),
      encryptedApiKey: String(group.encryptedApiKey || '').slice(0, 4096)
    }))
    : [];
  const cleanHistory = Array.isArray(profile.history)
    ? profile.history.slice(0, 75).map((entry) => ({
      id: String(entry.id || '').slice(0, 80),
      createdAt: entry.createdAt,
      title: String(entry.title || 'Audio Studio').slice(0, 160),
      thumbnail: String(entry.thumbnail || '').slice(0, 500),
      youtubeUrl: String(entry.youtubeUrl || '').slice(0, 500),
      settings: entry.settings || {},
      speedNormal: String(entry.speedNormal || '').slice(0, 16),
      expired: Boolean(entry.expired),
      parts: Array.isArray(entry.parts) ? entry.parts.slice(0, 30).map((part) => ({
        part: part.part,
        status: part.status,
        assetId: part.assetId,
        rbxassetid: part.rbxassetid,
        operationId: part.operationId,
        error: part.error ? String(part.error).slice(0, 500) : null,
        trace: Array.isArray(part.trace) ? part.trace.slice(0, 12).map((item) => ({
          step: String(item.step || '').slice(0, 80),
          status: item.status,
          message: String(item.message || '').slice(0, 500)
        })) : []
      })) : []
    }))
    : [];

  user.profile = {
    robloxConfig: profile.robloxConfig || {},
    groups: cleanGroups,
    history: cleanHistory
  };
  user.updatedAt = new Date().toISOString();
  await writeStore(store);
  return publicUser(user);
}
