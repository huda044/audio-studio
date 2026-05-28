import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { nanoid } from 'nanoid';

const dataDir = process.env.DATA_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), 'audio-studio-data') : path.resolve('data'));
const usersPath = path.join(dataDir, 'users.json');
const jwtSecret = process.env.JWT_SECRET || 'audio-studio-dev-secret-change-me';
let writeQueue = Promise.resolve();

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
  writeQueue = writeQueue.then(() => fs.writeFile(usersPath, JSON.stringify(store)));
  await writeQueue;
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
