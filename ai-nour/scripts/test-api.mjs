import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const port = Number(process.env.PHASE1_TEST_PORT || 8793);
const base = `http://127.0.0.1:${port}`;
const persist = '.wrangler/test-state';
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));

const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });
const ownerA = `api-owner-a-${crypto.randomUUID()}`;
const ownerB = `api-owner-b-${crypto.randomUUID()}`;

function call(pathname, { method = 'GET', owner = ownerA, body, admin = false } = {}) {
  const headers = { 'x-prototype-key': env.PROTOTYPE_ACCESS_KEY, 'x-owner-token': owner };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (admin) headers.authorization = `Bearer ${env.ADMIN_TOKEN}`;
  return fetch(base + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    .then(async (response) => {
      const text = await response.text();
      let parsed = {};
      try { parsed = text ? JSON.parse(text) : {}; } catch {}
      return { status: response.status, body: parsed };
    });
}

function start() {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', [
      'wrangler', 'dev', '--local', '--port', String(port), '--persist-to', persist,
      '--var', 'TEXT_PROVIDER:mock', '--var', 'LIVE_PROVIDER:mock',
      '--var', 'LIVE_TOKEN_RESERVATION_USD_MICROS:1000'
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (chunk) => { log += chunk.toString(); });
    child.stderr.on('data', (chunk) => { log += chunk.toString(); });
    child.on('exit', (code) => { if (code && !log.includes('Ready on')) reject(new Error(`wrangler exited ${code}\n${log.slice(-2000)}`)); });
    const started = Date.now();
    const poll = async () => {
      if (Date.now() - started > 45_000) return reject(new Error(`worker did not start\n${log.slice(-3000)}`));
      try {
        const response = await fetch(`${base}/api/health`);
        if (response.ok) return resolve({ child, log: () => log });
      } catch {}
      setTimeout(poll, 400);
    };
    poll();
  });
}

async function main() {
  fs.rmSync(path.join(root, persist), { recursive: true, force: true });
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'ai-nour-phase1-dev', '--local', '--persist-to', persist], { cwd: root, stdio: 'pipe' });
  const worker = await start();
  try {
    const health = await call('/api/health');
    check('health and D1', health.status === 200 && health.body.ok === true, { status: health.status });

    const noKey = await fetch(`${base}/api/meta`);
    check('prototype key required', noKey.status === 401, { status: noKey.status });

    const meta = await call('/api/meta');
    check('meta and corpus', meta.status === 200 && meta.body.corpus.chunks >= 100, { status: meta.status, chunks: meta.body.corpus?.chunks });

    const session = await call('/api/session', { method: 'POST', body: { locale: 'en' } });
    check('session create', session.status === 201 && Boolean(session.body.session?.id), { status: session.status });
    const sid = session.body.session?.id;

    const wrongOwner = await call(`/api/session/${encodeURIComponent(sid)}`, { owner: ownerB });
    check('session cross-owner denied', wrongOwner.status === 404, { status: wrongOwner.status });

    const chat = await call('/api/chat', { method: 'POST', body: { sessionId: sid, message: 'What does Safiy do?', locale: 'en', clientMessageId: 'api-chat-1' } });
    check('text chat', chat.status === 200 && /Safiy/i.test(chat.body.reply || ''), { status: chat.status, reply: chat.body.reply, cost: chat.body.costUsdMicros });
    const duplicate = await call('/api/chat', { method: 'POST', body: { sessionId: sid, message: 'What does Safiy do?', locale: 'en', clientMessageId: 'api-chat-1' } });
    check('duplicate chat message rejected', duplicate.status === 409, { status: duplicate.status });

    const toolChat = await call('/api/chat', { method: 'POST', body: { sessionId: sid, message: 'Open the Safiy project.', locale: 'en', clientMessageId: 'api-chat-2' } });
    check('tool call returns navigation action', toolChat.status === 200 && toolChat.body.actions?.[0]?.projectId === 'safiy', { status: toolChat.status, actions: toolChat.body.actions });

    const providerFailure = await call('/api/chat', { method: 'POST', body: { sessionId: sid, message: '__FAIL_PROVIDER__', locale: 'en', clientMessageId: 'api-provider-fail' } });
    const recovered = await call('/api/chat', { method: 'POST', body: { sessionId: sid, message: 'What does Safiy do?', locale: 'en', clientMessageId: 'api-provider-recover' } });
    check('external provider failure returns 503 and recovers', providerFailure.status === 503 && recovered.status === 200, { failure: providerFailure.status, recovery: recovered.status });

    const toolExecute = await call('/api/tools/execute', { method: 'POST', body: { sessionId: sid, name: 'openProject', args: { projectId: 'safiy' } } });
    check('server-side tool execution', toolExecute.status === 200 && toolExecute.body.action?.route === '/projects/safiy', { status: toolExecute.status, route: toolExecute.body.action?.route });
    const badTool = await call('/api/tools/execute', { method: 'POST', body: { sessionId: sid, name: 'openProject', args: { projectId: 'admin' } } });
    check('tool allowlist rejects unknown project', badTool.status === 200 && badTool.body.ok === false, { status: badTool.status, code: badTool.body.error?.code });

    const view = await call(`/api/session/${encodeURIComponent(sid)}`);
    check('session recovery returns messages', view.status === 200 && (view.body.session?.messages || []).length >= 4, { status: view.status, messages: view.body.session?.messages?.length });

    const live = await call('/api/live/token', { method: 'POST', body: { sessionId: sid, locale: 'en' } });
    check('mock Live token', live.status === 200 && String(live.body.token || '').startsWith('mock-live-token-') && Boolean(live.body.reservationId), { status: live.status, model: live.body.model, reservation: Boolean(live.body.reservationId) });

    const liveTurn = await call('/api/live/turn', { method: 'POST', body: { sessionId: sid, turnId: 'api-live-1', locale: 'en', userText: 'Voice question', assistantText: 'Voice answer', reservationId: live.body.reservationId, usage: { textInput: 100, audioInput: 50, audioOutput: 20 } } });
    check('Live turn persists shared context and cost', liveTurn.status === 200 && liveTurn.body.duplicate === false && liveTurn.body.costUsdMicros > 0, { status: liveTurn.status, cost: liveTurn.body.costUsdMicros });
    const liveDuplicate = await call('/api/live/turn', { method: 'POST', body: { sessionId: sid, turnId: 'api-live-1', locale: 'en', userText: 'Voice question', assistantText: 'Voice answer', reservationId: live.body.reservationId, usage: { textInput: 100, audioInput: 50, audioOutput: 20 } } });
    check('duplicate Live turn rejected', liveDuplicate.status === 200 && liveDuplicate.body.duplicate === true, { status: liveDuplicate.status, duplicate: liveDuplicate.body.duplicate });

    const admin = await call('/api/admin/status', { admin: true });
    check('admin status', admin.status === 200 && admin.body.version === 'phase4-0.4.0', { status: admin.status });
    const adminNoAuth = await fetch(`${base}/api/admin/status`);
    check('admin auth required', adminNoAuth.status === 401, { status: adminNoAuth.status });

    const disable = await call('/api/admin/flags', { method: 'PATCH', admin: true, body: { flags: { assistant_enabled: false } } });
    const disabledChat = await call('/api/chat', { method: 'POST', body: { sessionId: sid, message: 'hello', locale: 'en' } });
    check('emergency shutdown blocks chat', disable.status === 200 && disabledChat.status === 503, { disable: disable.status, chat: disabledChat.status });
    const enable = await call('/api/admin/flags', { method: 'PATCH', admin: true, body: { flags: { assistant_enabled: true } } });
    check('shutdown is reversible', enable.status === 200 && enable.body.flags.assistant_enabled === true, { status: enable.status });

    const synthetic = await call('/api/admin/integrations/synthetic', { method: 'POST', admin: true, body: {} });
    check('synthetic writes disabled by default', synthetic.status === 403, { status: synthetic.status });

    const page = await fetch(`${base}/`);
    check('prototype UI served', page.status === 200 && (await page.text()).includes('Nupa'), { status: page.status });

    const liveStatuses = [];
    for (let i = 0; i < 13; i++) {
      liveStatuses.push((await call('/api/live/token', { method: 'POST', body: { sessionId: sid, locale: 'en' } })).status);
    }
    check('Live rate limit eventually returns 429', liveStatuses.includes(429), { liveStatuses });

    const overBudget = await call('/api/live/turn', {
      method: 'POST',
      body: { sessionId: sid, turnId: 'api-budget-1', locale: 'en', userText: 'synthetic', assistantText: 'synthetic', usage: { textInput: 0, audioInput: 0, audioOutput: 1_000_000 } }
    });
    const stillWorks = await call('/api/chat', { method: 'POST', body: { sessionId: sid, message: 'hello after rejected live report', locale: 'en', clientMessageId: 'api-budget-2' } });
    check('unreserved Live usage cannot inflate the budget', overBudget.status === 400 && stillWorks.status === 200, { overBudget: overBudget.status, chat: stillWorks.status });

    const output = {
      generatedAt: new Date().toISOString(),
      mode: 'mock-providers/local-d1',
      passed: results.filter((result) => result.pass).length,
      failed: results.filter((result) => !result.pass).length,
      total: results.length,
      results
    };
    fs.mkdirSync(path.join(root, 'results'), { recursive: true });
    fs.writeFileSync(path.join(root, 'results/api-tests.json'), JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
    if (output.failed) process.exitCode = 1;
  } finally {
    worker.child.kill('SIGTERM');
    setTimeout(() => worker.child.kill('SIGKILL'), 1500).unref();
  }
}

main().catch((error) => {
  console.error(String(error?.stack || error).slice(0, 4000));
  process.exit(1);
});
