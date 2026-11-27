import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const readEnv = (file) => Object.fromEntries(fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const keys = JSON.parse(fs.readFileSync(path.join(root, '.private-beta-keys.json'), 'utf8'));
const primary = keys.testers.find((item) => item.purpose === 'primary-acceptance');
const admin = readEnv('.dev.vars.production');
if (!primary?.key) throw new Error('Primary beta key missing');
const base = process.env.PRODUCTION_API_URL || 'https://api.nourchkair.com';
const owner = `production-safety-${crypto.randomUUID()}`;
const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });
const consent = { age18: true, termsVersion: '2026-11-27-v1.3', privacyVersion: '2026-11-27-v1.3', acceptedAt: Date.now() };
let restored = false;

async function request(pathname, { method = 'GET', beta = false, adminAuth = false, body } = {}) {
  const headers = {};
  if (beta) headers['x-prototype-key'] = primary.key;
  if (beta) headers['x-owner-token'] = owner;
  if (adminAuth) headers.authorization = `Bearer ${admin.ADMIN_TOKEN}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(base + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch {}
  return { status: response.status, body: parsed };
}

try {
  const off = await request('/api/admin/flags', { method: 'PATCH', adminAuth: true, body: { flags: { assistant_enabled: false } } });
  check('emergency shutdown flag applies', off.status === 200 && off.body.flags?.assistant_enabled === false, { status: off.status, assistant_enabled: off.body.flags?.assistant_enabled });
  const metaOff = await request('/api/meta', { beta: true });
  check('shutdown is visible in public flags', metaOff.status === 200 && metaOff.body.flags?.assistant_enabled === false, { status: metaOff.status, flags: metaOff.body.flags });
  const blocked = await request('/api/session', { method: 'POST', beta: true, body: { locale: 'en' } });
  check('new sessions are blocked during shutdown', blocked.status === 503, { status: blocked.status, error: blocked.body.error?.code });
} finally {
  const on = await request('/api/admin/flags', { method: 'PATCH', adminAuth: true, body: { flags: { assistant_enabled: true } } });
  restored = on.status === 200 && on.body.flags?.assistant_enabled === true;
}

check('emergency shutdown restored', restored, { restored });
const recovered = await request('/api/session', { method: 'POST', beta: true, body: { locale: 'en', consent } });
check('sessions recover after restore', recovered.status === 201 && Boolean(recovered.body.session?.id), { status: recovered.status });
const sessionId = recovered.body.session?.id;

const live = await request('/api/live/token', { method: 'POST', beta: true, body: { sessionId, locale: 'en' } });
const expiresIn = live.body.expiresAt ? Math.round((Date.parse(live.body.expiresAt) - Date.now()) / 1000) : null;
check('production Live token uses the five-minute limit', live.status === 200 && live.body.sessionSeconds === 300 && expiresIn !== null && expiresIn >= 285 && expiresIn <= 300, { status: live.status, sessionSeconds: live.body.sessionSeconds, expiresIn });
check('production Live reservation is $0.125', live.body.reservationUsdMicros === 125000, { reservationUsdMicros: live.body.reservationUsdMicros });
check('ephemeral token is not exposed in results', Boolean(live.body.token) && !Object.prototype.hasOwnProperty.call(live.body, 'providerToken'), { tokenReturned: Boolean(live.body.token) });

const turn = await request('/api/live/turn', {
  method: 'POST',
  beta: true,
  body: {
    sessionId,
    turnId: `production-limit-${Date.now()}`,
    locale: 'en',
    userText: 'Production voice limit check',
    assistantText: 'Token minted without a provider connection.',
    reservationId: live.body.reservationId,
    usage: { textInput: 0, audioInput: 0, audioOutput: 0 }
  }
});
check('production Live reservation settles', turn.status === 200 && turn.body.duplicate === false && turn.body.costUsdMicros === 125000, { status: turn.status, costUsdMicros: turn.body.costUsdMicros });
check('spending remains within caps', turn.body.budget?.allowed === true && turn.body.budget?.cumulativeUsdMicros <= 7_000_000, { budget: turn.body.budget });

const output = {
  generatedAt: new Date().toISOString(),
  base,
  sessionId,
  passed: results.filter((item) => item.pass).length,
  failed: results.filter((item) => !item.pass).length,
  total: results.length,
  results
};
fs.writeFileSync(path.join(root, 'results/production-safety.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (output.failed) process.exitCode = 1;
