import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const port = Number(process.env.CONSENT_TEST_PORT || 8797);
const base = `http://127.0.0.1:${port}`;
const persist = '.wrangler/consent-test-state';
const key = `ainour_beta_${randomBytes(32).toString('hex')}`;
const keyHash = createHash('sha256').update(key).digest('hex');
const owner = `consent-test-${crypto.randomUUID()}`;
const consent = {
  age18: true,
  termsVersion: '2026-11-27-v1.2',
  privacyVersion: '2026-11-27-v1.2',
  acceptedAt: Date.now()
};
const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });

async function request(pathname, { method = 'GET', body } = {}) {
  const headers = { 'x-prototype-key': key, 'x-owner-token': owner };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(base + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch {}
  return { status: response.status, body: parsed };
}

function d1(command) {
  return execFileSync('npx', [
    'wrangler', 'd1', 'execute', 'ai-nour-phase1-dev', '--local', '--persist-to', persist, '--command', command
  ], { cwd: root, stdio: 'pipe' }).toString();
}

function start() {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', [
      'wrangler', 'dev', '--local', '--port', String(port), '--persist-to', persist,
      '--var', 'BETA_ACCESS_REQUIRED:true',
      '--var', 'ADMIN_ENABLED:false',
      '--var', 'TEXT_PROVIDER:mock',
      '--var', 'LIVE_PROVIDER:mock'
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (chunk) => { log += chunk.toString(); });
    child.stderr.on('data', (chunk) => { log += chunk.toString(); });
    child.on('exit', (code) => { if (code) reject(new Error(`wrangler exited ${code}\n${log.slice(-1600)}`)); });
    const started = Date.now();
    const poll = async () => {
      if (Date.now() - started > 45_000) return reject(new Error(`worker did not start\n${log.slice(-2200)}`));
      try { if ((await fetch(`${base}/api/health`)).ok) return resolve(child); } catch {}
      setTimeout(poll, 400);
    };
    poll();
  });
}

async function main() {
  fs.rmSync(path.join(root, persist), { recursive: true, force: true });
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'ai-nour-phase1-dev', '--local', '--persist-to', persist], { cwd: root, stdio: 'pipe' });
  d1(`INSERT INTO beta_testers(id,label,key_prefix,key_hash,status,created_at) VALUES('consent-test','Consent integration test','${key.slice(0, 18)}…','${keyHash}','active',${Date.now()})`);
  const child = await start();
  try {
    const meta = await request('/api/meta');
    check('valid beta key reaches the API', meta.status === 200, { status: meta.status });

    const noConsent = await request('/api/session', { method: 'POST', body: { locale: 'en' } });
    check('new session without consent is rejected', noConsent.status === 400 && noConsent.body.error?.code === 'CONSENT_REQUIRED', { status: noConsent.status, error: noConsent.body.error?.code });

    const oldConsent = await request('/api/session', {
      method: 'POST',
      body: { locale: 'en', consent: { age16: true, termsVersion: '2026-11-27', privacyVersion: '2026-11-27', acceptedAt: Date.now() } }
    });
    check('old 16+ consent is rejected', oldConsent.status === 400 && oldConsent.body.error?.code === 'CONSENT_REQUIRED', { status: oldConsent.status, error: oldConsent.body.error?.code });

    const session = await request('/api/session', { method: 'POST', body: { locale: 'en', consent } });
    const sessionId = session.body.session?.id;
    check('new session with current 18+ consent is created', session.status === 201 && Boolean(sessionId), { status: session.status, sessionId });

    const chat = await request('/api/chat', {
      method: 'POST',
      body: { sessionId, message: 'Hello', locale: 'en', clientMessageId: `consent-chat-${Date.now()}` }
    });
    check('chat works with current consent', chat.status === 200 && Boolean(chat.body.reply), { status: chat.status });

    const live = await request('/api/live/token', { method: 'POST', body: { sessionId, locale: 'en' } });
    check('Live token works with current consent', live.status === 200 && live.body.sessionSeconds === 300 && live.body.reservationUsdMicros === 125000, {
      status: live.status,
      sessionSeconds: live.body.sessionSeconds,
      reservationUsdMicros: live.body.reservationUsdMicros
    });

    const staleState = JSON.stringify({
      locale: 'en',
      consent: { age16: true, termsVersion: '2026-11-27', privacyVersion: '2026-11-27', acceptedAt: Date.now() }
    });
    d1(`UPDATE sessions SET state_json='${staleState}' WHERE id='${sessionId}'`);

    const staleGet = await request(`/api/session/${encodeURIComponent(sessionId)}`);
    check('existing stale session must acknowledge before reading', staleGet.status === 400 && staleGet.body.error?.code === 'CONSENT_REQUIRED', { status: staleGet.status, error: staleGet.body.error?.code });

    const staleChat = await request('/api/chat', {
      method: 'POST',
      body: { sessionId, message: 'Hello again', locale: 'en', clientMessageId: `consent-stale-chat-${Date.now()}` }
    });
    check('existing stale session must acknowledge before chat', staleChat.status === 400 && staleChat.body.error?.code === 'CONSENT_REQUIRED', { status: staleChat.status, error: staleChat.body.error?.code });

    const staleLive = await request('/api/live/token', { method: 'POST', body: { sessionId, locale: 'en' } });
    check('existing stale session must acknowledge before Live voice', staleLive.status === 400 && staleLive.body.error?.code === 'CONSENT_REQUIRED', { status: staleLive.status, error: staleLive.body.error?.code });

    const ack = await request(`/api/session/${encodeURIComponent(sessionId)}/consent`, { method: 'POST', body: { consent } });
    check('existing session accepts the current legal version', ack.status === 200 && ack.body.session?.id === sessionId, { status: ack.status });

    const after = await request(`/api/session/${encodeURIComponent(sessionId)}`);
    check('existing session is readable after acknowledgement', after.status === 200 && after.body.session?.id === sessionId, { status: after.status });

    const afterChat = await request('/api/chat', {
      method: 'POST',
      body: { sessionId, message: 'One more', locale: 'en', clientMessageId: `consent-after-chat-${Date.now()}` }
    });
    check('existing session chat works after acknowledgement', afterChat.status === 200 && Boolean(afterChat.body.reply), { status: afterChat.status });

    const output = {
      generatedAt: new Date().toISOString(),
      passed: results.filter((item) => item.pass).length,
      failed: results.filter((item) => !item.pass).length,
      total: results.length,
      results
    };
    fs.mkdirSync(path.join(root, 'results'), { recursive: true });
    fs.writeFileSync(path.join(root, 'results/consent-tests.json'), JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
    if (output.failed) process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 1500).unref();
  }
}

main().catch((error) => {
  console.error(String(error?.stack || error).slice(0, 3000));
  process.exit(1);
});
