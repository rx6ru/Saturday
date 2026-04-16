import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'src', 'web');
const targetDir = path.join(rootDir, 'dist', 'web');

if (!existsSync(sourceDir)) {
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });

for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!/\.(html|css|js)$/.test(entry.name)) continue;
  if (/\.test\./.test(entry.name)) continue;
  cpSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
}
