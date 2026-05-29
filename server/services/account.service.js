import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { nanoid } from 'nanoid';
import { sendVerificationCode, sendInvoiceCreated, sendPaidActivated, sendPasswordResetCode, isSmtpConfigured } from './email.service.js';
import { createMidtransSnap, isMidtransConfigured } from './midtrans.service.js';
import { encryptSecret, decryptSecret, isEncryptedSecret, isCryptoConfigured, maskSecret } from './crypto.service.js';

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
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '365d';
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;
const discordClientId = process.env.DISCORD_CLIENT_ID || '';
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET || '';
const discordRedirectUri = process.env.DISCORD_REDIRECT_URI || '';
const discordScopes = (process.env.DISCORD_SCOPES || 'identify email').split(/\s+/).filter(Boolean);
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
  writeQueue = writeQueue.then(() => atomicWriteJson(usersPath, store));
  await writeQueue;
}

async function readPayments() {
  await ensureStore();
  const raw = await fs.readFile(paymentsPath, 'utf8');
  return JSON.parse(raw || '{"payments":[]}');
}

async function writePayments(store) {
  await ensureStore();
  writeQueue = writeQueue.then(() => atomicWriteJson(paymentsPath, store));
  await writeQueue;
}

async function atomicWriteJson(filePath, value) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(value));
  await fs.rename(tmpPath, filePath);
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
  if (user?.role === 'admin') return { plan: 'paid', label: 'Admin', expiresAt: null };
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

function publicProfile(user) {
  const profile = user.profile || {};
  const robloxConfig = profile.robloxConfig || {};
  return {
    robloxConfig: {
      mode: robloxConfig.mode || 'personal',
      userId: robloxConfig.userId || '',
      groupId: robloxConfig.groupId || '',
      selectedGroupId: robloxConfig.selectedGroupId || '',
      hasApiKey: Boolean(robloxConfig.encryptedApiKey),
      apiKeyFormat: isEncryptedSecret(robloxConfig.encryptedApiKey) ? 'aes-256-gcm' : (robloxConfig.encryptedApiKey ? 'legacy' : 'empty'),
      apiKeyHint: robloxConfig.encryptedApiKey ? maskSecret(robloxConfig.encryptedApiKey).slice(0, 12) : ''
    },
    groups: (profile.groups || []).map((group) => ({
      id: group.id,
      name: group.name,
      groupId: group.groupId,
      creatorUserId: group.creatorUserId,
      hasApiKey: Boolean(group.encryptedApiKey),
      apiKeyFormat: isEncryptedSecret(group.encryptedApiKey) ? 'aes-256-gcm' : (group.encryptedApiKey ? 'legacy' : 'empty')
    })),
    history: profile.history || []
  };
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
    profile: publicProfile(user)
  };
}

export function signUser(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role || 'user' },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, jwtSecret);
}

export async function ensureBootstrapAdmin() {
  const username = String(process.env.ADMIN_BOOTSTRAP_USERNAME || process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const email = String(process.env.ADMIN_BOOTSTRAP_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || process.env.ADMIN_PASSWORD || '');
  const resetPassword = String(process.env.ADMIN_BOOTSTRAP_RESET_PASSWORD || '').toLowerCase() === 'true';

  if (!username || !email || !password) {
    return { configured: false, created: false, updated: false, reason: 'missing_admin_bootstrap_env' };
  }
  if (username.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
    return { configured: true, created: false, updated: false, reason: 'invalid_admin_bootstrap_env' };
  }

  const store = await readStore();
  let user = store.users.find((item) => item.email === email || item.username === username);
  if (user) {
    const changed = [];
    if (user.username !== username) {
      user.username = username;
      changed.push('username');
    }
    if (user.email !== email) {
      user.email = email;
      changed.push('email');
    }
    if (user.role !== 'admin') {
      user.role = 'admin';
      changed.push('role');
    }
    if (user.status !== 'active') {
      user.status = 'active';
      changed.push('status');
    }
    if (!user.emailVerified) {
      user.emailVerified = true;
      changed.push('emailVerified');
    }
    if (resetPassword || !user.passwordHash) {
      user.passwordHash = await bcrypt.hash(password, 10);
      changed.push('password');
    }
    if (changed.length) {
      pushAudit(user, 'admin_bootstrap_update', { changed });
      await writeStore(store);
    }
    return { configured: true, created: false, updated: changed.length > 0, user: publicUser(user) };
  }

  user = migrateUser({
    id: nanoid(12),
    username,
    email,
    emailVerified: true,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'admin',
    status: 'active',
    createdAt: nowIso(),
    subscription: { plan: 'paid', label: 'Admin', expiresAt: null, history: [] },
    usage: { conversions: 0, lastConversionAt: null, lastReason: null },
    profile: { robloxConfig: {}, groups: [], history: [] }
  });
  pushAudit(user, 'admin_bootstrap_create');
  store.users.push(user);
  await writeStore(store);
  return { configured: true, created: true, updated: false, user: publicUser(user) };
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
  await ensureBootstrapAdmin().catch((error) => {
    console.error('[admin-bootstrap-login-error]', error.message);
  });
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

// Helper internal: ambil key plaintext dari berbagai input (legacy ciphertext, plaintext baru, ciphertext server v1).
function pickIncomingApiKey(plain, encrypted, fallbackEncrypted) {
  // 1) Plaintext baru dari client → encrypt
  if (typeof plain === 'string' && plain.trim()) {
    if (!isCryptoConfigured()) {
      const error = new Error('Server belum punya SECRETS_MASTER_KEY. Set env dulu sebelum simpan API key.');
      error.status = 503;
      throw error;
    }
    return encryptSecret(plain.trim());
  }
  // 2) Klien kirim ciphertext server v1 → simpan apa adanya kalau format valid
  if (typeof encrypted === 'string' && encrypted) {
    if (isEncryptedSecret(encrypted)) return encrypted;
    // legacy CryptoJS blob, kita pertahankan supaya tidak hilang. user bisa re-enter nanti.
    return String(encrypted).slice(0, 4096);
  }
  // 3) Tidak ada input → pakai value lama yang sudah tersimpan
  return fallbackEncrypted || '';
}

export async function updateUserProfile(id, profile) {
  return mutateUser(id, (user) => {
    const previousProfile = user.profile || { robloxConfig: {}, groups: [], history: [] };
    const previousConfig = previousProfile.robloxConfig || {};
    const previousGroups = Array.isArray(previousProfile.groups) ? previousProfile.groups : [];
    const incomingConfig = profile.robloxConfig || {};
    const cleanGroups = Array.isArray(profile.groups)
      ? profile.groups.slice(0, 30).map((group) => {
        const previousGroup = previousGroups.find((item) => item.id === group.id || item.groupId === group.groupId) || {};
        return {
          id: String(group.id || '').slice(0, 80),
          name: String(group.name || '').slice(0, 80),
          groupId: String(group.groupId || '').slice(0, 32),
          creatorUserId: String(group.creatorUserId || '').slice(0, 32),
          encryptedApiKey: pickIncomingApiKey(group.apiKey, group.encryptedApiKey, previousGroup.encryptedApiKey).slice(0, 4096)
        };
      })
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

    const cleanConfig = {
      mode: incomingConfig.mode === 'group' ? 'group' : 'personal',
      userId: String(incomingConfig.userId || '').slice(0, 32),
      groupId: String(incomingConfig.groupId || '').slice(0, 32),
      selectedGroupId: String(incomingConfig.selectedGroupId || '').slice(0, 32),
      encryptedApiKey: pickIncomingApiKey(incomingConfig.apiKey, incomingConfig.encryptedApiKey, previousConfig.encryptedApiKey).slice(0, 4096)
    };

    user.profile = {
      robloxConfig: cleanConfig,
      groups: cleanGroups,
      history: cleanHistory
    };
    pushAudit(user, 'profile_update', {
      hasApiKey: Boolean(cleanConfig.encryptedApiKey),
      groupCount: cleanGroups.length
    });
    return publicUser(user);
  });
}

// Buka API key user untuk pemakaian server-side (upload Roblox, asset-status). Tidak pernah dikembalikan ke client.
export function resolveServerApiKey(user, { groupId } = {}) {
  if (!user) return '';
  const profile = user.profile || {};
  let encrypted = '';
  if (groupId) {
    const group = (profile.groups || []).find((item) => item.groupId === groupId || item.id === groupId);
    encrypted = group?.encryptedApiKey || '';
  } else {
    encrypted = profile.robloxConfig?.encryptedApiKey || '';
  }
  if (!encrypted) return '';
  if (!isEncryptedSecret(encrypted)) {
    // Format lama (CryptoJS) atau ciphertext rusak, server tidak bisa decrypt.
    const error = new Error('API key Roblox kamu masih tersimpan dalam format lama. Buka API Keys → tempel ulang key untuk migrasi ke enkripsi server.');
    error.status = 409;
    error.code = 'legacy_api_key';
    throw error;
  }
  try {
    return decryptSecret(encrypted);
  } catch (error) {
    const err = new Error('Gagal mendekripsi API key. Master key server kemungkinan berubah. Tempel ulang API key di halaman API Keys.');
    err.status = 500;
    err.code = 'decrypt_failed';
    err.cause = error;
    throw err;
  }
}

export async function getServerApiKeyForUser(id, options = {}) {
  const store = await readStore();
  const user = store.users.find((item) => item.id === id);
  if (!user) {
    const error = new Error('User tidak ditemukan.');
    error.status = 404;
    throw error;
  }
  return resolveServerApiKey(user, options);
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
    profile: publicProfile(user),
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
  return mutateUser(id, async (user, store) => {
    const changed = [];
    if (typeof patch.username === 'string') {
      const next = patch.username.trim().toLowerCase();
      if (next.length < 3) {
        const error = new Error('Username minimal 3 karakter.');
        error.status = 400;
        throw error;
      }
      if (next !== user.username) {
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
      if (user.role === 'admin' && patch.role !== 'admin') {
        const activeAdmins = store.users.filter((item) => item.id !== id && item.role === 'admin' && item.status === 'active').length;
        if (activeAdmins === 0) {
          const error = new Error('Tidak bisa menurunkan role admin terakhir.');
          error.status = 400;
          throw error;
        }
      }
      user.role = patch.role;
      changed.push('role');
    }
    if (typeof patch.status === 'string' && ['active', 'suspended', 'banned'].includes(patch.status) && patch.status !== user.status) {
      if (user.role === 'admin' && patch.status !== 'active') {
        const activeAdmins = store.users.filter((item) => item.id !== id && item.role === 'admin' && item.status === 'active').length;
        if (activeAdmins === 0) {
          const error = new Error('Tidak bisa menonaktifkan admin aktif terakhir.');
          error.status = 400;
          throw error;
        }
      }
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
  const target = store.users[index];
  if (target.role === 'admin') {
    const activeAdmins = store.users.filter((item) => item.id !== id && item.role === 'admin' && item.status === 'active').length;
    if (activeAdmins === 0) {
      const error = new Error('Tidak bisa menghapus admin aktif terakhir.');
      error.status = 400;
      throw error;
    }
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
  const store = await readStore();
  const usersById = new Map(store.users.map((user) => [user.id, user]));
  const filtered = status ? paymentStore.payments.filter((payment) => payment.status === status) : paymentStore.payments;
  const total = filtered.length;
  return {
    payments: filtered.slice(offset, offset + limit).map((payment) => {
      const user = usersById.get(payment.userId);
      return {
        ...payment,
        user: user ? { id: user.id, username: user.username, email: user.email } : null
      };
    }),
    total
  };
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

export async function adminCmsConfig() {
  const store = await readStore();
  const paymentStore = await readPayments();
  const admins = store.users
    .filter((user) => user.role === 'admin')
    .map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      status: user.status,
      lastLoginAt: user.lastLoginAt || null
    }));
  const recentPayments = paymentStore.payments.slice(0, 8).map((payment) => ({
    id: payment.id,
    status: payment.status,
    amount: payment.amount,
    method: payment.method,
    createdAt: payment.createdAt
  }));
  return {
    app: {
      name: process.env.APP_NAME || 'Audio Studio',
      publicUrl: process.env.APP_PUBLIC_URL || '',
      clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
      nodeEnv: process.env.NODE_ENV || 'development',
      jwtExpiresIn
    },
    auth: {
      googleConfigured: Boolean(googleClientId),
      smtpConfigured: isSmtpConfigured(),
      adminBootstrapConfigured: Boolean(
        (process.env.ADMIN_BOOTSTRAP_USERNAME || process.env.ADMIN_USERNAME)
        && (process.env.ADMIN_BOOTSTRAP_EMAIL || process.env.ADMIN_EMAIL)
        && (process.env.ADMIN_BOOTSTRAP_PASSWORD || process.env.ADMIN_PASSWORD)
      )
    },
    conversion: {
      freeConvertLimit: FREE_CONVERT_LIMIT,
      freeDurationLimitSeconds: FREE_DURATION_LIMIT,
      maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 250),
      inlineAudioLimitMb: Number(process.env.INLINE_AUDIO_LIMIT_MB || 8),
      conversionConcurrency: Number(process.env.CONVERSION_CONCURRENCY || 2),
      conversionQueueLimit: Number(process.env.CONVERSION_QUEUE_LIMIT || 20),
      ffmpegTimeoutMs: Number(process.env.FFMPEG_TIMEOUT_MS || 300000)
    },
    roblox: {
      maxAudioDurationSeconds: Number(process.env.ROBLOX_AUDIO_MAX_DURATION_SECONDS || 420),
      maxAudioBytes: Number(process.env.ROBLOX_AUDIO_MAX_BYTES || (19 * 1024 * 1024)),
      uploadConcurrency: Number(process.env.ROBLOX_UPLOAD_CONCURRENCY || 1),
      uploadQueueLimit: Number(process.env.ROBLOX_UPLOAD_QUEUE_LIMIT || 15)
    },
    billing: {
      midtransConfigured: isMidtransConfigured(),
      pendingInvoices: paymentStore.payments.filter((payment) => payment.status === 'Pending').length,
      recentPayments
    },
    admins,
    generatedAt: nowIso()
  };
}

export async function adminActivityFeed(limit = 50) {
  const store = await readStore();
  const events = [];
  for (const user of store.users) {
    for (const log of (user.auditLog || [])) {
      events.push({
        ...log,
        userId: user.id,
        username: user.username,
        userEmail: user.email
      });
    }
  }
  events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return events.slice(0, limit);
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


export async function isAdminRequest(req) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return { ok: false };
    const decoded = verifyToken(token);
    if (decoded?.role !== 'admin') return { ok: false };
    const store = await readStore();
    const user = store.users.find((item) => item.id === decoded.sub);
    if (user?.role === 'admin' && user.status === 'active') {
      return { ok: true, actor: user.username || decoded.username || decoded.sub, userId: user.id };
    }
  } catch {
    // ignore invalid tokens
  }
  return { ok: false };
}
