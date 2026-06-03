import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const STORE_FILES = {
  users: 'users.json',
  payments: 'payments.json'
};

// Lock mechanism untuk mencegah race condition pada read/write
const locks = new Map();

async function withLock(key, fn) {
  if (!locks.has(key)) locks.set(key, Promise.resolve());
  const prev = locks.get(key);
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  locks.set(key, current);
  try {
    await prev;
    return await fn();
  } finally {
    release();
    locks.delete(key);
  }
}

// In-memory cache untuk mengurangi file I/O
const cache = new Map();
const CACHE_TTL_MS = 5000; // 5 detik
const MAX_CACHE_SIZE = 1000; // Maksimal 1000 entries

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCache(key, value) {
  // Hapus entry tertua jika cache penuh
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidateCache(key) {
  cache.delete(key);
}

let poolPromise = null;
let postgresReady = false;
let fallbackWarned = false;

function cleanNamespace(value) {
  return String(value || 'audio-studio')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'audio-studio';
}

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
      // try next candidate
    }
  }
  return path.join(os.tmpdir(), 'audio-studio-data');
}

const dataDir = resolveDataDir();
const namespace = cleanNamespace(process.env.DATA_STORE_NAMESPACE || process.env.APP_NAME || 'audio-studio');

function postgresUrl() {
  return String(
    process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || ''
  ).trim();
}

function postgresTable() {
  const raw = String(process.env.DATA_STORE_TABLE || 'audio_studio_kv').trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(raw) ? raw : 'audio_studio_kv';
}

function postgresSsl(connectionString) {
  const explicit = String(process.env.POSTGRES_SSL || '').toLowerCase();
  if (explicit === 'false' || explicit === '0') return false;
  if (explicit === 'true' || explicit === '1') return { rejectUnauthorized: false };
  if (/localhost|127\.0\.0\.1|\[::1\]/i.test(connectionString)) return false;
  return { rejectUnauthorized: false };
}

async function getPostgresPool() {
  const connectionString = postgresUrl();
  if (!connectionString) return null;
  if (!poolPromise) {
    poolPromise = import('pg').then((pg) => {
      const Pool = pg.Pool || pg.default?.Pool;
      return new Pool({
        connectionString,
        ssl: postgresSsl(connectionString),
        max: Number(process.env.DATA_STORE_POOL_MAX || 3),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      });
    });
  }
  return poolPromise;
}

async function ensurePostgres() {
  const pool = await getPostgresPool();
  if (!pool) return null;
  if (!postgresReady) {
    const table = postgresTable();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    postgresReady = true;
  }
  return pool;
}

function storeKey(key) {
  return `${namespace}:${key}`;
}

function filePathFor(key) {
  const fileName = STORE_FILES[key] || `${String(key).replace(/[^a-z0-9_-]/gi, '_')}.json`;
  return path.join(dataDir, fileName);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2));
  await fs.rename(tmpPath, filePath);
}

async function readLocalJson(key, defaultValue) {
  // Cek cache terlebih dahulu
  const cached = getCached(`local:${key}`);
  if (cached !== undefined) return cloneJson(cached);

  return withLock(key, async () => {
    const filePath = filePathFor(key);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw || JSON.stringify(defaultValue));
      setCache(`local:${key}`, parsed);
      return cloneJson(parsed);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await atomicWriteJson(filePath, defaultValue);
      setCache(`local:${key}`, defaultValue);
      return cloneJson(defaultValue);
    }
  });
}

async function writeLocalJson(key, value) {
  return withLock(key, async () => {
    await atomicWriteJson(filePathFor(key), value);
    invalidateCache(`local:${key}`);
  });
}

async function readPostgresJson(key) {
  const pool = await ensurePostgres();
  if (!pool) return undefined;
  const result = await pool.query(
    `SELECT value FROM ${postgresTable()} WHERE key = $1 LIMIT 1`,
    [storeKey(key)]
  );
  return result.rows[0]?.value;
}

async function writePostgresJson(key, value) {
  const pool = await ensurePostgres();
  if (!pool) return false;
  await pool.query(
    `INSERT INTO ${postgresTable()} (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, updated_at = now()`,
    [storeKey(key), JSON.stringify(value)]
  );
  return true;
}

function shouldFallbackToLocal() {
  return String(process.env.DATA_STORE_FALLBACK_LOCAL || '').toLowerCase() === 'true';
}

function decorateStoreError(error) {
  const next = new Error(`Persistent data store gagal: ${error.message}`);
  next.status = 503;
  next.cause = error;
  return next;
}

export async function readJsonStore(key, defaultValue) {
  // Cek cache terlebih dahulu
  const cached = getCached(`store:${key}`);
  if (cached !== undefined) return cloneJson(cached);

  return withLock(`store:${key}`, async () => {
    if (postgresUrl()) {
      try {
        const remoteValue = await readPostgresJson(key);
        if (remoteValue !== undefined && remoteValue !== null) {
          await writeLocalJson(key, remoteValue).catch((error) => {
            console.warn(`[data-store] gagal mirror ${key} ke file lokal: ${error.message}`);
          });
          setCache(`store:${key}`, remoteValue);
          return cloneJson(remoteValue);
        }

        const localValue = await readLocalJson(key, defaultValue);
        await writePostgresJson(key, localValue);
        setCache(`store:${key}`, localValue);
        return cloneJson(localValue);
      } catch (error) {
        if (shouldFallbackToLocal()) {
          if (!fallbackWarned) {
            console.warn(`[data-store] postgres tidak tersedia, fallback file lokal aktif: ${error.message}`);
            fallbackWarned = true;
          }
          return readLocalJson(key, defaultValue);
        }
        throw decorateStoreError(error);
      }
    }

    return readLocalJson(key, defaultValue);
  });
}

export async function writeJsonStore(key, value) {
  return withLock(`store:${key}`, async () => {
    invalidateCache(`store:${key}`);
    invalidateCache(`local:${key}`);

    if (postgresUrl()) {
      try {
        await writePostgresJson(key, value);
        await writeLocalJson(key, value).catch((error) => {
          console.warn(`[data-store] gagal mirror ${key} ke file lokal: ${error.message}`);
        });
        setCache(`store:${key}`, value);
        return;
      } catch (error) {
        if (shouldFallbackToLocal()) {
          if (!fallbackWarned) {
            console.warn(`[data-store] postgres tidak tersedia, fallback file lokal aktif: ${error.message}`);
            fallbackWarned = true;
          }
          await writeLocalJson(key, value);
          setCache(`store:${key}`, value);
          return;
        }
        throw decorateStoreError(error);
      }
    }

    await writeLocalJson(key, value);
    setCache(`store:${key}`, value);
  });
}

export function getDataStoreInfo() {
  const hasPostgres = Boolean(postgresUrl());
  const tempRoot = os.tmpdir().toLowerCase();
  const dataDirLower = dataDir.toLowerCase();
  const fileLooksTemporary = dataDirLower.startsWith(tempRoot) || Boolean(process.env.VERCEL);
  const productionWithoutExplicitDir = process.env.NODE_ENV === 'production' && !process.env.DATA_DIR;

  return {
    backend: hasPostgres ? 'postgres' : 'file',
    durable: hasPostgres,
    durability: hasPostgres
      ? 'database'
      : fileLooksTemporary || productionWithoutExplicitDir
        ? 'ephemeral-file'
        : 'file-platform-dependent',
    dataDir,
    namespace,
    table: hasPostgres ? postgresTable() : '',
    mirror: hasPostgres ? 'file-local-cache' : 'primary-file',
    warning: hasPostgres
      ? ''
      : 'File storage bisa reset saat redeploy/rebuild kecuali DATA_DIR dipasang ke persistent disk. Pakai DATABASE_URL agar akun dan API key tahan deploy.'
  };
}

export function warnIfEphemeralDataStore() {
  const info = getDataStoreInfo();
  if (info.backend === 'postgres') {
    console.log(`[data-store] postgres aktif, table=${info.table}, namespace=${info.namespace}`);
    return;
  }
  console.warn(`[data-store] memakai file storage di ${info.dataDir}. ${info.warning}`);
}
