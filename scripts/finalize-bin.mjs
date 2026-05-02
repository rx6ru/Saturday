import { chmodSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const binPath = path.join(rootDir, 'dist', 'index.js');

if (existsSync(binPath)) {
  chmodSync(binPath, 0o755);
}
