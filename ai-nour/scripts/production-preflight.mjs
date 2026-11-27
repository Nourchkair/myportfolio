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
const admin = readEnv('.dev.vars.production');
const validation = keys.testers.find((item) => item.purpose === 'deployment-validation');
if (!validation?.key) throw new Error('Validation beta key is missing');
const base = process.env.PRODUCTION_API_URL || 'https://api.nourchkair.com';
const owner = `production-preflight-${crypto.randomUUID()}`;
const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });

async function request(pathname, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(base + pathname, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch {}
  return { status: response.status, headers: response.headers, body: parsed };
}

const health = await request('/api/health');
check('production health endpoint', health.status === 200 && health.body.ok === true && health.body.d1 === true, { status: health.status, service: health.body.service, version: health.body.version, d1: health.body.d1 });

const noKey = await request('/api/meta');
check('missing beta key is rejected', noKey.status === 401, { status: noKey.status });
const badKey = await request('/api/meta', { headers: { 'x-prototype-key': `ainour_beta_${'0'.repeat(64)}` } });
check('invalid beta key is rejected', badKey.status === 401, { status: badKey.status });
const validMeta = await request('/api/meta', { headers: { 'x-prototype-key': validation.key } });
check('valid beta key is accepted', validMeta.status === 200 && Array.isArray(validMeta.body.tools), { status: validMeta.status, version: validMeta.body.version, flags: validMeta.body.flags });

const session = await request('/api/session', {
  method: 'POST',
  headers: { 'x-prototype-key': validation.key, 'x-owner-token': owner },
  body: { locale: 'en' }
});
check('authorized beta session is created', session.status === 201 && Boolean(session.body.session?.id), { status: session.status });
const sessionId = session.body.session?.id;

const adminStatus = await request('/api/admin/status', { headers: { authorization: `Bearer ${admin.ADMIN_TOKEN}` } });
check('production admin bearer works', adminStatus.status === 200 && adminStatus.body.ok === true, { status: adminStatus.status, environment: adminStatus.body.environment, version: adminStatus.body.version });
check('production beta access is required', adminStatus.body.security?.betaAccessRequired === true, { security: adminStatus.body.security });
check('spending caps are production values', adminStatus.body.budget?.dailyCapUsdMicros === 1_000_000 && adminStatus.body.budget?.cumulativeCapUsdMicros === 7_000_000, { budget: adminStatus.body.budget });
check('Google integrations are configured', adminStatus.body.google?.configured === true && adminStatus.body.google?.spreadsheet === true && adminStatus.body.google?.calendar === true, { google: adminStatus.body.google });
check('external writes remain disabled', adminStatus.body.flags?.google_writes_enabled === false, { google_writes_enabled: adminStatus.body.flags?.google_writes_enabled });
check('Resend remains disabled', adminStatus.body.email?.sendEnabled === false, { email: adminStatus.body.email });

const unauthAdmin = await request('/api/admin/status');
check('unauthenticated admin is rejected', unauthAdmin.status === 401, { status: unauthAdmin.status });

const badAdmin = await request('/api/admin/status', { headers: { authorization: 'Bearer invalid' } });
check('invalid admin token is rejected', badAdmin.status === 401, { status: badAdmin.status });

const cors = await request('/api/session', {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://nourchkair.com',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type,x-prototype-key,x-owner-token'
  }
});
check('production CORS allows the portfolio origin', cors.status === 204 && cors.headers.get('access-control-allow-origin') === 'https://nourchkair.com', { status: cors.status, allowOrigin: cors.headers.get('access-control-allow-origin') });

const evilCors = await request('/api/session', {
  method: 'OPTIONS',
  headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' }
});
check('production CORS rejects other origins', evilCors.status === 204 && !evilCors.headers.get('access-control-allow-origin'), { status: evilCors.status, allowOrigin: evilCors.headers.get('access-control-allow-origin') });

const testers = await request('/api/admin/beta-testers', { headers: { authorization: `Bearer ${admin.ADMIN_TOKEN}` } });
check('beta tester inventory is admin-only', testers.status === 200 && testers.body.betaAccessRequired === true && (testers.body.testers || []).some((item) => item.id === validation.id && item.status === 'active'), { status: testers.status, active: testers.body.testers?.filter((item) => item.status === 'active').length });

const output = {
  generatedAt: new Date().toISOString(),
  base,
  sessionId,
  passed: results.filter((item) => item.pass).length,
  failed: results.filter((item) => !item.pass).length,
  total: results.length,
  results
};
fs.mkdirSync(path.join(root, 'results'), { recursive: true });
fs.writeFileSync(path.join(root, 'results/production-preflight.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (output.failed) process.exitCode = 1;
