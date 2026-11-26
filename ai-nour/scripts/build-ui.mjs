import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
fs.mkdirSync(path.join(root, 'public/dist'), { recursive: true });
await build({
  entryPoints: [path.join(root, 'public/app.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outfile: path.join(root, 'public/dist/app.js'),
  minify: false,
  sourcemap: false,
  logLevel: 'info'
});
console.log('Built public/dist/app.js');
