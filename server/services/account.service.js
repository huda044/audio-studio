import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { nanoid } from 'nanoid';

const dataDir = process.env.DATA_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), 'audio-studio-data') : path.resolve('..', 'uploads', 'data'));
const usersPath = path.join(dataDir, 'users.json');
const jwtSecret = process.env.JWT_SECRET || 'audio-studio-dev-secret-change-me';

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(usersPath);
  } catch {
    await fs.writeFile(usersPath, JSON.stringify({ users: [] }, null, 2));
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(usersPath, 'utf8');
  return JSON.parse(raw || '{"users":[]}');
}

async function writeStore(store) {
  await ensureStore();
  await fs.writeFile(usersPath, JSON.stringify(store, null, 2));
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
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

export async function registerUser({ username, password }) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  if (cleanUsername.length < 3) {
    const error = new Error('Username minimal 3 karakter.');
    error.status = 400;
    throw error;
  }
  if (String(password || '').length < 6) {
    const error = new Error('Password minimal 6 karakter.');
    error.status = 400;
    throw error;
  }

  const store = await readStore();
  if (store.users.some((user) => user.username === cleanUsername)) {
    const error = new Error('Username sudah dipakai.');
    error.status = 409;
    throw error;
  }

  const user = {
    id: nanoid(12),
    username: cleanUsername,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
    profile: {
      robloxConfig: {},
      groups: [],
      history: []
    }
  };
  store.users.push(user);
  await writeStore(store);
  return publicUser(user);
}

export async function loginUser({ username, password }) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  const store = await readStore();
  const user = store.users.find((item) => item.username === cleanUsername);
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    const error = new Error('Username atau password salah.');
    error.status = 401;
    throw error;
  }
  return publicUser(user);
}

export async function getUserById(id) {
  const store = await readStore();
  const user = store.users.find((item) => item.id === id);
  return user ? publicUser(user) : null;
}

export async function updateUserProfile(id, profile) {
  const store = await readStore();
  const user = store.users.find((item) => item.id === id);
  if (!user) {
    const error = new Error('User tidak ditemukan.');
    error.status = 404;
    throw error;
  }
  user.profile = {
    robloxConfig: profile.robloxConfig || {},
    groups: Array.isArray(profile.groups) ? profile.groups.slice(0, 50) : [],
    history: Array.isArray(profile.history) ? profile.history.slice(0, 200) : []
  };
  user.updatedAt = new Date().toISOString();
  await writeStore(store);
  return publicUser(user);
}
