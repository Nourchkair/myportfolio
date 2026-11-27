import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const base = process.env.PHASE1_WORKER_URL || 'http://127.0.0.1:8789';
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));

const response = await fetch(`${base}/api/admin/integrations/synthetic`, {
  method: 'POST',
  headers: { authorization: `Bearer ${env.ADMIN_TOKEN}`, 'content-type': 'application/json' },
  body: '{}'
});
const body = await response.json();
const output = { generatedAt: new Date().toISOString(), base, status: response.status, result: body };
fs.mkdirSync(path.join(root, 'results'), { recursive: true });
fs.writeFileSync(path.join(root, 'results/google-synthetic-tests.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (!response.ok || body.ok !== true) process.exitCode = 1;
