import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../imperium-like-digital-prototype/app/dist/', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.vite/manifest.json'), 'utf8'));
const visited = new Set();
function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  for (const dependency of manifest[key].imports ?? []) visit(dependency);
}
for (const [key, asset] of Object.entries(manifest)) if (asset.isEntry) visit(key);
const files = [...new Set([...visited].map((key) => manifest[key].file))];
const initialBytes = files.reduce((sum, file) => sum + fs.statSync(path.join(root, file)).size, 0);
const gzipBytes = files.reduce((sum, file) => sum + gzipSync(fs.readFileSync(path.join(root, file))).length, 0);
const limits = { initialBytes: 980000, gzipBytes: 250000 };
const ok = initialBytes <= limits.initialBytes && gzipBytes <= limits.gzipBytes;
console.log(JSON.stringify({ ok, initialBytes, gzipBytes, limits, initialFiles: files }, null, 2));
if (!ok) process.exitCode = 1;
