import { test } from 'node:test';
import assert from 'node:assert/strict';

// Master key wajib di-set sebelum import service (key di-cache saat pertama dipakai).
process.env.SECRETS_MASTER_KEY = process.env.SECRETS_MASTER_KEY || 'dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3RzLTEyMzQ1Ng==';

const {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  isCryptoConfigured,
  maskSecret,
  generateMasterKey
} = await import('../services/crypto.service.js');

test('crypto dianggap configured saat master key di-set', () => {
  assert.equal(isCryptoConfigured(), true);
});

test('encrypt lalu decrypt mengembalikan plaintext asli', () => {
  const plain = 'roblox-open-cloud-api-key-12345';
  const cipher = encryptSecret(plain);
  assert.notEqual(cipher, plain);
  assert.equal(isEncryptedSecret(cipher), true);
  assert.equal(decryptSecret(cipher), plain);
});

test('ciphertext berbeda tiap enkripsi (IV acak) tapi tetap dekripsi sama', () => {
  const plain = 'nilai-rahasia';
  const a = encryptSecret(plain);
  const b = encryptSecret(plain);
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), plain);
  assert.equal(decryptSecret(b), plain);
});

test('string kosong tidak dienkripsi', () => {
  assert.equal(encryptSecret(''), '');
  assert.equal(decryptSecret(''), '');
});

test('decrypt menolak format yang tidak dikenali', () => {
  assert.throws(() => decryptSecret('bukan-ciphertext-valid'), /format ciphertext tidak dikenali/);
});

test('maskSecret menyembunyikan bagian tengah', () => {
  assert.equal(maskSecret(''), '');
  assert.equal(maskSecret('abcd'), '****');
  assert.equal(maskSecret('abcdefghij'), 'abcd…ghij');
});

test('generateMasterKey menghasilkan 32 byte base64', () => {
  const key = generateMasterKey();
  assert.equal(Buffer.from(key, 'base64').length, 32);
});
