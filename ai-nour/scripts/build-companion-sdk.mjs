import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.resolve(root, '../src/ai-nour/vendor');
fs.mkdirSync(outDir, { recursive: true });
await build({
  entryPoints: [path.join(root, 'node_modules/@google/genai/dist/web/index.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outfile: path.join(outDir, 'genai.js'),
  minify: true,
  sourcemap: false,
  logLevel: 'info'
});
console.log('Built src/ai-nour/vendor/genai.js');
