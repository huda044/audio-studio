import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

// Satu sumber kebenaran untuk direktori upload — dipakai server.js (static serving,
// cleanup sweep) DAN audio.routes.js (multer dest, output konversi). Sebelumnya ada dua
// implementasi terpisah yang bisa saling melenceng sehingga file ditulis di satu folder
// tapi disajikan dari folder lain.
export function resolveUploadsDir() {
  const candidates = [];
  if (process.env.UPLOADS_DIR) candidates.push(process.env.UPLOADS_DIR);
  candidates.push(path.join(rootDir, 'uploads'));
  candidates.push(path.join(os.tmpdir(), 'audio-studio-uploads'));
  for (const dir of candidates) {
    try {
      fsSync.mkdirSync(dir, { recursive: true });
      fsSync.accessSync(dir, fsSync.constants.W_OK);
      return dir;
    } catch {
      // try next
    }
  }
  return path.join(os.tmpdir(), 'audio-studio-uploads');
}

const uploadsDir = resolveUploadsDir();
export default uploadsDir;
