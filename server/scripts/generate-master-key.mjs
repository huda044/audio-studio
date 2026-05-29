// node scripts/generate-master-key.mjs
// Cetak 32-byte random base64 untuk SECRETS_MASTER_KEY.
import { generateMasterKey } from '../services/crypto.service.js';
const key = generateMasterKey();
console.log(`SECRETS_MASTER_KEY=${key}`);
console.log(`(salin ke env hosting; jangan commit ke git, jangan share)`);
