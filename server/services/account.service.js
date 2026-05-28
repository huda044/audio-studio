import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { nanoid } from 'nanoid';
import { sendVerificationCode, sendInvoiceCreated, sendPaidActivated, sendPasswordResetCode, isSmtpConfigured } from './email.service.js';
import { createMidtransSnap, isMidtransConfigured } from './midtrans.service.js';

import fsSync from 'node:fs';

function resolveDataDir() {
  const candidates = [];
  if (process.env.DATA_DIR) candidates.push(process.env.DATA_DIR);
  if (process.env.VERCEL) candidates.push(path.join(os.tmpdir(), 'audio-studio-data'));
  candidates.push(path.resolve('data'));
  candidates.push(path.join(os.tmpdir(), 'audio-studio-data'));
  for (const dir of candidates) {
    try {
      fsSync.mkdirSync(dir, { recursive: true });
      fsSync.accessSync(dir, fsSync.constants.W_OK);
      return dir;
    } catch {
      // try next
    }
  }
  // last resort, will likely fail later but keeps server starting
  return path.join(os.tmpdir(), 'audio-studio-data');
}

const dataDir = resolveDataDir();
const usersPath = path.join(dataDir, 'users.json');
const paymentsPath = path.join(dataDir, 'payments.json');
const jwtSecret = process.env.JWT_SECRET || 'audio-studio-dev-secret-change-me';
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;
const FREE_CONVERT_LIMIT = Number(process.env.FREE_CONVERT_LIMIT || 3);
const FREE_DURATION_LIMIT = Number(process.env.FREE_DURATION_LIMIT_SECONDS || 600);
const AUDIT_LOG_MAX = 80;
const SUBSCRIPTION_HISTORY_MAX = 30;

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
  const parsed = JSON.parse(raw || '{"users":[]}');
  parsed.users = (parsed.users || []).map(migrateUser);
  return parsed;
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

function migrateUser(user) {
  if (!user || typeof user !== 'object') return user;
  const next = { ...user };
  next.role = next.role || 'user';
  next.status = next.status || 'active';
  next.usage = next.usage || { conversions: 0, lastConversionAt: null };
  next.usage.conversions = Number(next.usage.conversions || 0);
  next.usage.lastConversionAt = next.usage.lastConversionAt || null;
  next.usage.lastReason = next.usage.lastReason || null;
  next.subscription = next.subscription || { plan: 'free', label: 'Free', expiresAt: null };
  next.subscription.history = Array.isArray(next.subscription.history) ? next.subscription.history : [];
  next.profile = next.profile || { robloxConfig: {}, groups: [], history: [] };
  next.auditLog = Array.isArray(next.auditLog) ? next.auditLog : [];
  next.lastLoginAt = next.lastLoginAt || null;
  next.lastLoginIp = next.lastLoginIp || null;
  next.lastLoginUa = next.lastLoginUa || null;
  next.loginCount = Number(next.loginCount || 0);
  next.createdAt = next.createdAt || nowIso();
  next.updatedAt = next.updatedAt || next.createdAt;
  return next;
}

function pushAudit(user, event, detail = {}) {
  if (!user.auditLog) user.auditLog = [];
  user.auditLog.unshift({
    id: nanoid(10),
    at: nowIso(),
    event,
    ...detail
  });
  if (user.auditLog.length > AUDIT_LOG_MAX) user.auditLog.length = AUDIT_LOG_MAX;
  user.updatedAt = nowIso();
}

function activePlan(user) {
  const subscription = user.subscription || { plan: 'free' };
  if (subscription.plan === 'paid' && subscription.expiresAt && new Date(subscription.expiresAt).getTime() > Date.now()) {
    return { plan: 'paid', label: subscription.label || 'Paid', expiresAt: subscription.expiresAt };
  }
  return { plan: 'free', expiresAt: null, label: 'Free' };
}

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendVerificationEmail(email, code) {
  if (!isSmtpConfigured()) return false;
  try {
    const result = await sendVerificationCode(email, code);
    return result.sent;
  } catch (error) {
    console.error('[smtp-error] verification:', error.message);
    return false;
  }
}

async function sendResetEmail(email, code) {
  if (!isSmtpConfigured()) return false;
  try {
    const result = await sendPasswordResetCode(email, code);
    return result.sent;
  } catch (error) {
    console.error('[smtp-error] reset:', error.message);
    return false;
  }
}

function publicUser(user) {
  const plan = activePlan(user);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role || 'user',
    status: user.status || 'active',
    emailVerified: Boolean(user.emailVerified),
    subscription: plan,
    usage: {
      conversions: user.usage?.conversions || 0,
      lastConversionAt: user.usage?.lastConversionAt || null
    },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    profile: user.profile || {}
  };
}

export function signUser(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role || 'user' },
    jwtSecret,
    { expiresIn: '30d' }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, jwtSecret);
}

async function mutateUser(id, mutator) {
  const store = await readStore();
  const user = store.users.find((item) => item.id === id);
  if (!user) {
    const error = new Error('User tidak ditemukan.');
    error.status = 404;
    throw error;
  }
  const result = await mutator(user, store);
  user.updatedAt = nowIso();
  await writeStore(store);
  return result === undefined ? user : result;
}

function ensureAccountUsable(user) {
  if (user.status === 'suspended') {
    const error = new Error('Akun ditangguhkan oleh admin.');
    error.status = 403;
    throw error;
  }
  if (user.status === 'banned') {
    const error = new Error('Akun diblokir oleh admin.');
    error.status = 403;
    throw error;
  }
}

export async function registerUser({ username, email, password }, context = {}) {
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

  const user = migrateUser({
    id: nanoid(12),
    username: cleanUsername,
    email: cleanEmail,
    emailVerified: false,
    verificationCodeHash: await bcrypt.hash(code, 10),
    verificationExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    passwordHash: await bcrypt.hash(password, 10),
    role: 'user',
    status: 'active',
    createdAt: nowIso(),
    subscription: { plan: 'free', label: 'Free', expiresAt: null, history: [] },
    usage: { conversions: 0, lastConversionAt: null, lastReason: null },
    profile: { robloxConfig: {}, groups: [], history: [] }
  });
  pushAudit(user, 'register', { ip: context.ip || null, ua: context.ua || null });
  store.users.push(user);
  await writeStore(store);
  const emailSent = await sendVerificationEmail(cleanEmail, code);
  return {
    user: publicUser(user),
    verificationSent: emailSent,
    devCode: emailSent || process.env.EMAIL_DEV_CODES === 'false' ? undefined : code
  };
}

export async function loginUser({ username, password }, context = {}) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  const store = await readStore();
  const user = store.users.find((item) => item.username === cleanUsername || item.email === cleanUsername);
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash || ''))) {
    const error = new Error('Username atau password salah.');
    error.status = 401;
    throw error;
  }
  ensureAccountUsable(user);
  if (!user.emailVerified) {
    const error = new Error('Akun belum diverifikasi. Masukkan kode verifikasi email dulu.');
    error.status = 403;
    throw error;
  }
  user.lastLoginAt = nowIso();
  user.lastLoginIp = context.ip || null;
  user.lastLoginUa = context.ua || null;
  user.loginCount = Number(user.loginCount || 0) + 1;
  pushAudit(user, 'login', { ip: context.ip || null, ua: context.ua || null });
  await writeStore(store);
  return publicUser(user);
}

export async function verifyEmailCode({ email, code }, context = {}) {
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
  user.lastLoginAt = nowIso();
  user.lastLoginIp = context.ip || null;
  user.lastLoginUa = context.ua || null;
  user.loginCount = Number(user.loginCount || 0) + 1;
  pushAudit(user, 'email_verified', { ip: context.ip || null });
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
  pushAudit(user, 'verification_resend');
  await writeStore(store);
  const emailSent = await sendVerificationEmail(cleanEmail, code);
  return { sent: emailSent, devCode: emailSent || process.env.EMAIL_DEV_CODES === 'false' ? undefined : code };
}

export async function requestPasswordReset({ email }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const store = await readStore();
  const user = store.users.find((item) => item.email === cleanEmail);
  if (!user) return { sent: false };
  const code = makeCode();
  user.resetCodeHash = await bcrypt.hash(code, 10);
  user.resetExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  pushAudit(user, 'password_reset_requested');
  await writeStore(store);
  const emailSent = await sendResetEmail(cleanEmail, code);
  return {
    sent: emailSent,
    devCode: emailSent || process.env.EMAIL_DEV_CODES === 'false' ? undefined : code
  };
}

export async function confirmPasswordReset({ email, code, password }, context = {}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (String(password || '').length < 6) {
    const error = new Error('Password baru minimal 6 karakter.');
    error.status = 400;
    throw error;
  }
  const store = await readStore();
  const user = store.users.find((item) => item.email === cleanEmail);
  if (!user) {
    const error = new Error('Email tidak ditemukan.');
    error.status = 404;
    throw error;
  }
  if (!user.resetCodeHash || new Date(user.resetExpiresAt || 0).getTime() < Date.now()) {
    const error = new Error('Kode reset sudah kedaluwarsa. Minta kode baru.');
    error.status = 400;
    throw error;
  }
  if (!(await bcrypt.compare(String(code || ''), user.resetCodeHash))) {
    const error = new Error('Kode reset salah.');
    error.status = 400;
    throw error;
  }
  user.passwordHash = await bcrypt.hash(password, 10);
  user.resetCodeHash = '';
  user.resetExpiresAt = '';
  user.emailVerified = true;
  user.lastLoginAt = nowIso();
  user.lastLoginIp = context.ip || null;
  user.lastLoginUa = context.ua || null;
  user.loginCount = Number(user.loginCount || 0) + 1;
  pushAudit(user, 'password_reset_confirmed', { ip: context.ip || null });
  await writeStore(store);
  return publicUser(user);
}

export async function loginWithGoogle({ credential }, context = {}) {
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
  let isNew = false;
  if (!user) {
    user = migrateUser({
      id: nanoid(12),
      username: store.users.some((item) => item.username === username) ? `${username}${nanoid(4)}` : username,
      email,
      emailVerified: true,
      googleSub: payload.sub,
      passwordHash: '',
      role: 'user',
      status: 'active',
      createdAt: nowIso(),
      subscription: { plan: 'free', label: 'Free', expiresAt: null, history: [] },
      usage: { conversions: 0, lastConversionAt: null, lastReason: null },
      profile: { robloxConfig: {}, groups: [], history: [] }
    });
    store.users.push(user);
    isNew = true;
  } else {
    user.emailVerified = true;
    user.googleSub = payload.sub;
  }
  ensureAccountUsable(user);
  user.lastLoginAt = nowIso();
  user.lastLoginIp = context.ip || null;
  user.lastLoginUa = context.ua || null;
  user.loginCount = Number(user.loginCount || 0) + 1;
  pushAudit(user, isNew ? 'register_google' : 'login_google', { ip: context.ip || null });
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
  ensureAccountUsable(user);
  if (!user.emailVerified) {
    const error = new Error('Verifikasi email dulu sebelum konversi audio.');
    error.status = 403;
    throw error;
  }
  // Admin = full access, no limits
  if (user.role === 'admin') {
    return { user, plan: { plan: 'paid', label: 'Admin', expiresAt: null }, usage: user.usage || { conversions: 0 } };
  }
  const plan = activePlan(user);
  const usage = user.usage || { conversions: 0 };
  if (plan.plan === 'free') {
    if (usage.conversions >= FREE_CONVERT_LIMIT) {
      const error = new Error(`Akun Free hanya bisa konversi ${FREE_CONVERT_LIMIT} audio/link YouTube. Silakan berlangganan.`);
      error.status = 402;
      throw error;
    }
    const duration = Number(sourceDurationSeconds || 0);
    if (!duration) {
      const error = new Error('Durasi sumber tidak terbaca. Akun Free wajib pakai sumber yang durasinya terdeteksi.');
      error.status = 402;
      throw error;
    }
    if (duration > FREE_DURATION_LIMIT) {
      const error = new Error(`Akun Free hanya bisa konversi lagu maksimal ${Math.floor(FREE_DURATION_LIMIT / 60)} menit.`);
      error.status = 402;
      throw error;
    }
  }
  return { user, plan, usage };
}

export async function recordConversion(id, meta = {}) {
  const store = await readStore();
  const user = store.users.find((item) => item.id === id);
  if (!user) return null;
  user.usage = user.usage || { conversions: 0 };
  user.usage.conversions = Number(user.usage.conversions || 0) + 1;
  user.usage.lastConversionAt = nowIso();
  user.usage.lastReason = null;
  pushAudit(user, 'convert', {
    source: meta.source || null,
    duration: meta.duration || null,
    title: (meta.title || '').slice(0, 120)
  });
  await writeStore(store);
  return publicUser(user);
}

export async function createPayment(id, { plan, method }) {
  const plans = {
    seven: { days: 7, label: 'Paid 7 Hari', amount: 35000 },
    thirty: { days: 30, label: 'Paid 30 Hari', amount: 100000 }
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
  let snap = null;
  if (isMidtransConfigured()) {
    try {
      const store = await readStore();
      const userRecord = store.users.find((item) => item.id === id);
      if (userRecord) {
        snap = await createMidtransSnap({ invoice, user: userRecord });
        invoice.gateway = 'midtrans';
        invoice.snapToken = snap.token;
        invoice.snapRedirectUrl = snap.redirectUrl;
        const idx = paymentStore.payments.findIndex((item) => item.id === invoice.id);
        if (idx !== -1) paymentStore.payments[idx] = invoice;
        await writePayments(paymentStore);
      }
    } catch (error) {
      invoice.gatewayError = error.message;
    }
  }
  await mutateUser(id, (user) => {
    pushAudit(user, 'invoice_created', { invoiceId: invoice.id, plan, method, gateway: invoice.gateway || 'manual' });
    sendInvoiceCreated(user.email, invoice).catch(() => {});
  }).catch(() => {});
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

export async function confirmPayment(invoiceId, actor = 'admin') {
  const paymentStore = await readPayments();
  const invoice = paymentStore.payments.find((item) => item.id === invoiceId);
  if (!invoice) {
    const error = new Error('Invoice tidak ditemukan.');
    error.status = 404;
    throw error;
  }
  if (invoice.status === 'Accepted') return invoice;
  invoice.status = 'Accepted';
  invoice.acceptedAt = nowIso();
  invoice.acceptedBy = actor;
  await writePayments(paymentStore);

  const store = await readStore();
  const user = store.users.find((item) => item.id === invoice.userId);
  if (!user) return invoice;
  const previousActive = activePlan(user);
  const baseTime = previousActive.plan === 'paid' ? new Date(user.subscription.expiresAt).getTime() : Date.now();
  const startedAt = nowIso();
  const expiresAt = new Date(Math.max(baseTime, Date.now()) + invoice.days * 24 * 60 * 60 * 1000).toISOString();
  user.subscription = {
    plan: 'paid',
    label: invoice.label,
    expiresAt,
    history: [
      { invoiceId: invoice.id, plan: invoice.plan, days: invoice.days, startedAt, expiresAt, source: 'invoice' },
      ...(user.subscription?.history || [])
    ].slice(0, SUBSCRIPTION_HISTORY_MAX)
  };
  pushAudit(user, 'paid_activated', { invoiceId: invoice.id, plan: invoice.plan, expiresAt, by: actor });
  await writeStore(store);
  sendPaidActivated(user.email, { ...invoice, expiresAt }).catch(() => {});
  return invoice;
}

export async function updateUserProfile(id, profile) {
  return mutateUser(id, (user) => {
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
    return publicUser(user);
  });
}


// ===========================================================================
// Admin / CMS helpers
// ===========================================================================

function adminUser(user) {
  const plan = activePlan(user);
  return {
    ...publicUser(user),
    googleSub: user.googleSub || null,
    lastLoginAt: user.lastLoginAt || null,
    lastLoginIp: user.lastLoginIp || null,
    lastLoginUa: user.lastLoginUa || null,
    loginCount: user.loginCount || 0,
    subscription: {
      ...plan,
      history: user.subscription?.history || []
    },
    usage: {
      conversions: user.usage?.conversions || 0,
      lastConversionAt: user.usage?.lastConversionAt || null,
      lastReason: user.usage?.lastReason || null
    },
    profile: user.profile || { robloxConfig: {}, groups: [], history: [] },
    auditLog: user.auditLog || []
  };
}

export async function adminListUsers({ search = '', limit = 100, offset = 0 } = {}) {
  const store = await readStore();
  const term = String(search || '').trim().toLowerCase();
  const filtered = term
    ? store.users.filter((user) =>
      String(user.username || '').toLowerCase().includes(term)
      || String(user.email || '').toLowerCase().includes(term)
      || String(user.id || '').toLowerCase().includes(term))
    : store.users;
  const sorted = filtered.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const total = sorted.length;
  const page = sorted.slice(offset, offset + limit).map((user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role || 'user',
    status: user.status || 'active',
    emailVerified: Boolean(user.emailVerified),
    subscription: activePlan(user),
    usage: { conversions: user.usage?.conversions || 0, lastConversionAt: user.usage?.lastConversionAt || null },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || null,
    loginCount: user.loginCount || 0
  }));
  return { users: page, total };
}

export async function adminGetUser(id) {
  const store = await readStore();
  const user = store.users.find((item) => item.id === id);
  if (!user) {
    const error = new Error('User tidak ditemukan.');
    error.status = 404;
    throw error;
  }
  return adminUser(user);
}

export async function adminUpdateUser(id, patch = {}, actor = 'admin') {
  return mutateUser(id, async (user) => {
    const changed = [];
    if (typeof patch.username === 'string') {
      const next = patch.username.trim().toLowerCase();
      if (next.length < 3) {
        const error = new Error('Username minimal 3 karakter.');
        error.status = 400;
        throw error;
      }
      if (next !== user.username) {
        const store = await readStore();
        if (store.users.some((item) => item.id !== id && item.username === next)) {
          const error = new Error('Username sudah dipakai.');
          error.status = 409;
          throw error;
        }
        user.username = next;
        changed.push('username');
      }
    }
    if (typeof patch.email === 'string') {
      const next = patch.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
        const error = new Error('Email tidak valid.');
        error.status = 400;
        throw error;
      }
      if (next !== user.email) {
        const store = await readStore();
        if (store.users.some((item) => item.id !== id && item.email === next)) {
          const error = new Error('Email sudah dipakai.');
          error.status = 409;
          throw error;
        }
        user.email = next;
        changed.push('email');
      }
    }
    if (typeof patch.role === 'string' && ['user', 'admin'].includes(patch.role) && patch.role !== user.role) {
      user.role = patch.role;
      changed.push('role');
    }
    if (typeof patch.status === 'string' && ['active', 'suspended', 'banned'].includes(patch.status) && patch.status !== user.status) {
      user.status = patch.status;
      changed.push('status');
    }
    if (typeof patch.emailVerified === 'boolean' && patch.emailVerified !== Boolean(user.emailVerified)) {
      user.emailVerified = patch.emailVerified;
      changed.push('emailVerified');
    }
    if (patch.password && String(patch.password).length >= 6) {
      user.passwordHash = await bcrypt.hash(String(patch.password), 10);
      changed.push('password');
    }
    if (patch.usage && typeof patch.usage === 'object') {
      if (Number.isFinite(Number(patch.usage.conversions))) {
        user.usage.conversions = Math.max(0, Math.floor(Number(patch.usage.conversions)));
        changed.push('usage.conversions');
      }
    }
    if (patch.subscription && typeof patch.subscription === 'object') {
      const plan = patch.subscription.plan === 'paid' ? 'paid' : 'free';
      const expiresAt = patch.subscription.expiresAt
        ? new Date(patch.subscription.expiresAt).toISOString()
        : null;
      const label = patch.subscription.label || (plan === 'paid' ? 'Paid (Manual)' : 'Free');
      user.subscription = {
        plan,
        label,
        expiresAt,
        history: [
          {
            invoiceId: null,
            plan,
            days: null,
            startedAt: nowIso(),
            expiresAt,
            source: `admin:${actor}`
          },
          ...(user.subscription?.history || [])
        ].slice(0, SUBSCRIPTION_HISTORY_MAX)
      };
      changed.push('subscription');
    }
    pushAudit(user, 'admin_update', { by: actor, changed });
    return adminUser(user);
  });
}

export async function adminExtendSubscription(id, days, actor = 'admin') {
  const numericDays = Math.max(1, Math.floor(Number(days) || 0));
  return mutateUser(id, (user) => {
    const previous = activePlan(user);
    const baseTime = previous.plan === 'paid'
      ? new Date(user.subscription.expiresAt).getTime()
      : Date.now();
    const expiresAt = new Date(Math.max(baseTime, Date.now()) + numericDays * 24 * 60 * 60 * 1000).toISOString();
    user.subscription = {
      plan: 'paid',
      label: `Paid (+${numericDays} hari)`,
      expiresAt,
      history: [
        { invoiceId: null, plan: 'paid', days: numericDays, startedAt: nowIso(), expiresAt, source: `admin:${actor}` },
        ...(user.subscription?.history || [])
      ].slice(0, SUBSCRIPTION_HISTORY_MAX)
    };
    pushAudit(user, 'admin_extend', { by: actor, days: numericDays, expiresAt });
    return adminUser(user);
  });
}

export async function adminResetUsage(id, actor = 'admin') {
  return mutateUser(id, (user) => {
    user.usage = { conversions: 0, lastConversionAt: null, lastReason: null };
    pushAudit(user, 'admin_reset_usage', { by: actor });
    return adminUser(user);
  });
}

export async function adminDeleteUser(id, actor = 'admin') {
  const store = await readStore();
  const index = store.users.findIndex((item) => item.id === id);
  if (index === -1) {
    const error = new Error('User tidak ditemukan.');
    error.status = 404;
    throw error;
  }
  store.users.splice(index, 1);
  await writeStore(store);
  const paymentStore = await readPayments();
  paymentStore.payments = paymentStore.payments.filter((payment) => payment.userId !== id);
  await writePayments(paymentStore);
  return { ok: true, by: actor };
}

export async function adminListPayments({ status = '', limit = 100, offset = 0 } = {}) {
  const paymentStore = await readPayments();
  const filtered = status ? paymentStore.payments.filter((payment) => payment.status === status) : paymentStore.payments;
  const total = filtered.length;
  return { payments: filtered.slice(offset, offset + limit), total };
}

export async function adminRejectPayment(invoiceId, actor = 'admin') {
  const paymentStore = await readPayments();
  const invoice = paymentStore.payments.find((item) => item.id === invoiceId);
  if (!invoice) {
    const error = new Error('Invoice tidak ditemukan.');
    error.status = 404;
    throw error;
  }
  invoice.status = 'Rejected';
  invoice.rejectedAt = nowIso();
  invoice.rejectedBy = actor;
  await writePayments(paymentStore);
  await mutateUser(invoice.userId, (user) => {
    pushAudit(user, 'invoice_rejected', { invoiceId: invoice.id, by: actor });
  }).catch(() => {});
  return invoice;
}

export async function adminStats() {
  const store = await readStore();
  const paymentStore = await readPayments();
  const totalUsers = store.users.length;
  const verified = store.users.filter((user) => user.emailVerified).length;
  const paid = store.users.filter((user) => activePlan(user).plan === 'paid').length;
  const suspended = store.users.filter((user) => user.status === 'suspended' || user.status === 'banned').length;
  const totalConversions = store.users.reduce((sum, user) => sum + (user.usage?.conversions || 0), 0);
  const pendingInvoices = paymentStore.payments.filter((payment) => payment.status === 'Pending').length;
  const acceptedInvoices = paymentStore.payments.filter((payment) => payment.status === 'Accepted').length;
  const revenue = paymentStore.payments
    .filter((payment) => payment.status === 'Accepted')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return {
    users: { total: totalUsers, verified, paid, suspended },
    conversions: totalConversions,
    invoices: {
      pending: pendingInvoices,
      accepted: acceptedInvoices,
      total: paymentStore.payments.length,
      revenue
    },
    generatedAt: nowIso()
  };
}

export async function handleMidtransWebhook(payload) {
  const orderId = payload.order_id || payload.orderId;
  if (!orderId) {
    const error = new Error('order_id wajib.');
    error.status = 400;
    throw error;
  }
  const status = String(payload.transaction_status || payload.transactionStatus || '').toLowerCase();
  const fraud = String(payload.fraud_status || '').toLowerCase();
  const accepted = (status === 'capture' && fraud !== 'deny') || status === 'settlement';
  const denied = ['deny', 'cancel', 'expire', 'failure'].includes(status);
  if (accepted) return confirmPayment(orderId, 'midtrans');
  if (denied) {
    const paymentStore = await readPayments();
    const invoice = paymentStore.payments.find((item) => item.id === orderId);
    if (invoice && invoice.status !== 'Accepted') {
      invoice.status = 'Rejected';
      invoice.rejectedAt = nowIso();
      invoice.rejectedBy = 'midtrans';
      invoice.gatewayStatus = status;
      await writePayments(paymentStore);
    }
    return invoice;
  }
  const paymentStore = await readPayments();
  const invoice = paymentStore.payments.find((item) => item.id === orderId);
  if (invoice) {
    invoice.gatewayStatus = status;
    await writePayments(paymentStore);
  }
  return invoice;
}


export function isAdminRequest(req) {
  const secret = process.env.ADMIN_SECRET;
  if (secret && req.headers['x-admin-secret'] === secret) return { ok: true, actor: 'secret' };
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return { ok: false };
    const decoded = verifyToken(token);
    if (decoded?.role === 'admin') return { ok: true, actor: decoded.username || decoded.sub };
  } catch {
    // ignore invalid tokens
  }
  return { ok: false };
}
