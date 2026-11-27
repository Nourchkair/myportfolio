import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(TOOL_DIR, '../..');
export const ENV_PATH = process.env.PHASE0A_ENV_FILE
  ? path.resolve(process.env.PHASE0A_ENV_FILE)
  : path.join(REPO_ROOT, '.dev.vars');

export function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`Missing ${ENV_PATH}. Create it locally, keep mode 600, and never commit it.`);
  }
  const env = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 0) continue;
    env[line.slice(0, index)] = line.slice(index + 1);
  }
  return env;
}

export function requireEnv(env, keys) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing required local values: ${missing.join(', ')}`);
  return env;
}

export function updateEnv(key, value) {
  const current = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const lines = current.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  const tmp = `${ENV_PATH}.tmp`;
  fs.writeFileSync(tmp, next.join('\n'), { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, ENV_PATH);
}

export function audioPath(name) {
  const dir = process.env.PHASE0A_AUDIO_DIR
    ? path.resolve(process.env.PHASE0A_AUDIO_DIR)
    : path.join(TOOL_DIR, 'audio');
  return path.join(dir, name);
}

export function outputPath(name) {
  return path.join(TOOL_DIR, 'results', name);
}
