import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signSession } from '../src/admin/google-oauth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const workerPort = Number(process.env.PHASE3_ADMIN_WORKER_PORT || 8800);
const adminPort = Number(process.env.PHASE3_ADMIN_PORT || 8799);
const workerBase = `http://127.0.0.1:${workerPort}`;
const adminBase = `http://127.0.0.1:${adminPort}`;
const persist = '.wrangler/admin-test-state';
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const adminEmail = String(env.ADMIN_EMAIL || '').toLowerCase();
const secret = env.PHASE1_ADMIN_SESSION_SECRET;
const workerKey = 'phase3-admin-worker-key';
const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });
let worker;
let admin;

function startWorker() {
  return new Promise((resolve, reject) => {
    worker = spawn('npx', [
      'wrangler', 'dev', '--local', '--port', String(workerPort), '--persist-to', persist,
      '--var', 'TEXT_PROVIDER:mock', '--var', 'LIVE_PROVIDER:mock',
      '--var', `PROTOTYPE_ACCESS_KEY:${workerKey}`,
      '--var', 'EMAIL_PROVIDER:mock',
      '--var', 'EMAIL_SEND_ENABLED:false'
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    worker.stdout.on('data', (chunk) => { log += chunk.toString(); });
    worker.stderr.on('data', (chunk) => { log += chunk.toString(); });
    worker.on('exit', (code) => { if (code) reject(new Error(`worker exited ${code}\n${log.slice(-1600)}`)); });
    const started = Date.now();
    const poll = async () => {
      if (Date.now() - started > 60_000) return reject(new Error(`worker did not start\n${log.slice(-2400)}`));
      try { if ((await fetch(`${workerBase}/api/health`)).ok) return resolve(); } catch {}
      setTimeout(poll, 400);
    };
    poll();
  });
}

function startAdmin() {
  return new Promise((resolve, reject) => {
    admin = spawn('node', ['scripts/admin-server.mjs'], {
      cwd: root,
      env: { ...process.env, ADMIN_PORT: String(adminPort), PHASE1_WORKER_URL: workerBase },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let log = '';
    admin.stdout.on('data', (chunk) => { log += chunk.toString(); });
    admin.stderr.on('data', (chunk) => { log += chunk.toString(); });
    admin.on('exit', (code) => { if (code) reject(new Error(`admin exited ${code}\n${log.slice(-1600)}`)); });
    const started = Date.now();
    const poll = async () => {
      if (Date.now() - started > 30_000) return reject(new Error(`admin did not start\n${log.slice(-2400)}`));
      try { const response = await fetch(`${adminBase}/auth/session`); if ([200, 401].includes(response.status)) return resolve(); } catch {}
      setTimeout(poll, 300);
    };
    poll();
  });
}

function cookie(token) {
  return `ainour_admin=${token}`;
}

async function request(pathname, { method = 'GET', cookieValue = '', origin = '', body = undefined } = {}) {
  const headers = {};
  if (cookieValue) headers.cookie = cookieValue;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(adminBase + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await response.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch {}
  return { status: response.status, body: parsed, headers: response.headers, text };
}

async function validCookie({ epoch = 0, email = adminEmail, expiresAt = Date.now() + 3_600_000, sid = `test-${crypto.randomUUID()}` } = {}) {
  return signSession({ email, expiresAt, secret, epoch, sid });
}

async function main() {
  if (!adminEmail || !secret) throw new Error('ADMIN_EMAIL and PHASE1_ADMIN_SESSION_SECRET are required');
  fs.rmSync(path.join(root, persist), { recursive: true, force: true });
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'ai-nour-phase1-dev', '--local', '--persist-to', persist], { cwd: root, stdio: 'pipe' });
  await startWorker();
  await startAdmin();
  try {
    const noSession = await request('/api/admin/status');
    check('admin API rejects a missing session', noSession.status === 401, { status: noSession.status });
    const noSessionPage = await request('/');
    check('admin page redirects unauthenticated visitors to Google sign-in', noSessionPage.status === 302 && noSessionPage.headers.get('location') === '/auth/google/start', { status: noSessionPage.status, location: noSessionPage.headers.get('location') });

    const token = await validCookie();
    const session = await request('/auth/session', { cookieValue: cookie(token) });
    check('valid signed session is accepted', session.status === 200 && session.body.authenticated === true && session.body.email === adminEmail, { status: session.status, email: session.body.email });
    const status = await request('/api/admin/status', { cookieValue: cookie(token) });
    check('authorized admin proxy reaches the Worker', status.status === 200 && status.body.ok === true, { status: status.status, version: status.body.version });

    const tampered = await request('/api/admin/status', { cookieValue: cookie(`${token}x`) });
    check('tampered session cookie is rejected', tampered.status === 401, { status: tampered.status });
    const expiredToken = await validCookie({ expiresAt: Date.now() - 1, sid: 'expired-session' });
    const expired = await request('/api/admin/status', { cookieValue: cookie(expiredToken) });
    check('expired session is rejected', expired.status === 401, { status: expired.status });
    const wrongEmailToken = await validCookie({ email: 'intruder@example.invalid', sid: 'wrong-email' });
    const wrongEmail = await request('/api/admin/status', { cookieValue: cookie(wrongEmailToken) });
    check('non-allowlisted Google account is rejected', wrongEmail.status === 401, { status: wrongEmail.status });

    const csrf = await request('/api/admin/flags', {
      method: 'PATCH',
      cookieValue: cookie(token),
      origin: 'https://evil.example',
      body: { flags: { assistant_enabled: true } }
    });
    check('cross-origin administrative mutation is rejected', csrf.status === 403, { status: csrf.status });

    const page = await request('/', { cookieValue: cookie(token) });
    check('authorized admin page renders with security headers', page.status === 200 && page.headers.get('x-frame-options') === 'DENY' && page.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), { status: page.status, xfo: page.headers.get('x-frame-options') });

    const logout = await request('/auth/logout', {
      method: 'POST',
      cookieValue: cookie(token),
      origin: `http://127.0.0.1:${adminPort}`
    });
    check('logout clears and revokes the session', logout.status === 204 && logout.headers.get('set-cookie')?.includes('Max-Age=0'), { status: logout.status, cookie: logout.headers.get('set-cookie') });
    const afterLogout = await request('/api/admin/status', { cookieValue: cookie(token) });
    check('revoked session no longer works after logout', afterLogout.status === 401, { status: afterLogout.status });

    const revokeToken = await validCookie({ sid: 'revoke-session' });
    const reauth = await request('/auth/google/start?reauth=1');
    const reauthLocation = new URL(reauth.headers.get('location') || 'https://invalid.example');
    check('reauthentication starts a fresh Google login prompt', reauth.status === 302 && reauthLocation.searchParams.get('prompt') === 'login', { status: reauth.status, prompt: reauthLocation.searchParams.get('prompt') });
    const revoke = await request('/auth/revoke-all', {
      method: 'POST',
      cookieValue: cookie(revokeToken),
      origin: `http://127.0.0.1:${adminPort}`
    });
    check('revoke-all rotates the administrator session epoch', revoke.status === 200 && Number(revoke.body.epoch) > 0, { status: revoke.status, epoch: revoke.body.epoch });
    const afterRevoke = await request('/api/admin/status', { cookieValue: cookie(revokeToken) });
    check('access revocation invalidates existing sessions', afterRevoke.status === 401, { status: afterRevoke.status });
    const newToken = await validCookie({ epoch: Number(revoke.body.epoch), sid: 'reauth-session' });
    const afterReauth = await request('/api/admin/status', { cookieValue: cookie(newToken) });
    check('a new session works after revocation', afterReauth.status === 200, { status: afterReauth.status });

    const output = {
      generatedAt: new Date().toISOString(),
      mode: 'local-admin/google-session-signing/mock-worker',
      passed: results.filter((item) => item.pass).length,
      failed: results.filter((item) => !item.pass).length,
      total: results.length,
      results
    };
    fs.mkdirSync(path.join(root, 'results'), { recursive: true });
    fs.writeFileSync(path.join(root, 'results/admin-auth-tests.json'), JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
    if (output.failed) process.exitCode = 1;
  } finally {
    admin?.kill('SIGTERM');
    worker?.kill('SIGTERM');
    setTimeout(() => { admin?.kill('SIGKILL'); worker?.kill('SIGKILL'); }, 1500).unref();
  }
}

main().catch((error) => {
  console.error(String(error?.stack || error).slice(0, 4000));
  process.exit(1);
});
