import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadEnv, updateEnv } from './env.mjs';

// One-time dev control-plane setup. The token is written only to the ignored
// .dev.vars file and is sent to Wrangler over stdin, never printed.
const env = loadEnv();
let token = env.PHASE0A_ADMIN_TOKEN;
let generated = false;
if (!token) {
  token = randomBytes(32).toString('hex');
  updateEnv('PHASE0A_ADMIN_TOKEN', token);
  generated = true;
}

const result = spawnSync(
  'npx',
  ['wrangler', 'secret', 'put', 'ADMIN_TOKEN', '--config', 'wrangler.full.toml'],
  { input: token, encoding: 'utf8' }
);

console.log(JSON.stringify({ secretConfigured: result.status === 0, generated }, null, 2));
if (result.status !== 0) {
  console.error(String(result.stderr || '').slice(0, 1000));
  process.exit(1);
}
