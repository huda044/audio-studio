import crypto from 'node:crypto';

// AES-256-GCM enkripsi untuk credential sensitif (Roblox Open Cloud API key, dll).
// Master key dibaca dari env. Format ciphertext (base64-url tunggal):
//   v1.<iv_b64>.<ciphertext_b64>.<tag_b64>
// IV 12 byte unik per panggilan, tag 16 byte authenticated.

const VERSION = 'v1';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey = null;
let cachedKeyError = '';

function deriveKey() {
  if (cachedKey) return cachedKey;
  if (cachedKeyError) throw new Error(cachedKeyError);

  const raw = String(
    process.env.SECRETS_MASTER_KEY
    || process.env.CREDENTIAL_ENCRYPTION_KEY
    || ''
  ).trim();

  if (!raw) {
    cachedKeyError = 'SECRETS_MASTER_KEY belum di-set di env. Generate 32-byte random base64 dan simpan di hosting.';
    throw new Error(cachedKeyError);
  }

  let key;
  if (/^[A-Za-z0-9+/=_-]+$/.test(raw) && raw.length >= 40) {
    try {
      const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      if (decoded.length === 32) key = decoded;
    } catch {
      // fall through to scrypt
    }
  }
  if (!key) {
    // Derive 32-byte key dari passphrase pakai scrypt + salt deterministik.
    key = crypto.scryptSync(raw, 'audio-studio-credential-salt-v1', 32);
  }
  cachedKey = key;
  return cachedKey;
}

export function isCryptoConfigured() {
  try {
    deriveKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext) {
  const value = String(plaintext ?? '');
  if (!value) return '';
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    enc.toString('base64'),
    tag.toString('base64')
  ].join('.');
}

export function decryptSecret(ciphertext) {
  const value = String(ciphertext ?? '');
  if (!value) return '';
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('format ciphertext tidak dikenali');
  }
  const key = deriveKey();
  const iv = Buffer.from(parts[1], 'base64');
  const enc = Buffer.from(parts[2], 'base64');
  const tag = Buffer.from(parts[3], 'base64');
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error('panjang iv/tag tidak valid');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

export function isEncryptedSecret(value) {
  return typeof value === 'string' && /^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(value);
}

export function maskSecret(value) {
  const v = String(value ?? '');
  if (!v) return '';
  if (v.length <= 8) return '*'.repeat(v.length);
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

// Helper untuk generate master key dengan command: node -e "import('./services/crypto.service.js').then(m=>console.log(m.generateMasterKey()))"
export function generateMasterKey() {
  return crypto.randomBytes(32).toString('base64');
}
