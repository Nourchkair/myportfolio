import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const port = Number(process.env.PUBLIC_CONTROLS_PORT || 8799);
const base = `http://127.0.0.1:${port}`;
const persist = '.wrangler/public-controls-state';
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });
const consent = { age18: true, termsVersion: '2026-11-27-v1.4', privacyVersion: '2026-11-27-v1.4', acceptedAt: Date.now() };
const oldConsent = { ...consent, termsVersion: '2026-11-27-v1.3', privacyVersion: '2026-11-27-v1.3' };

async function call(pathname, { method = 'GET', owner = '', body, admin = false, ip = '203.0.113.10' } = {}) {
  const headers = { 'cf-connecting-ip': ip };
  if (owner) headers['x-owner-token'] = owner;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (admin) headers.authorization = `Bearer ${env.ADMIN_TOKEN}`;
  const response = await fetch(base + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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
      '--var', 'PUBLIC_ACCESS:true',
      '--var', 'BETA_ACCESS_REQUIRED:false',
      '--var', 'TEXT_PROVIDER:mock',
      '--var', 'LIVE_PROVIDER:mock',
      '--var', 'DAILY_SPEND_CAP_USD_MICROS:3000000',
      '--var', 'CUMULATIVE_SPEND_CAP_USD_MICROS:7000000',
      '--var', 'LIVE_SESSION_SECONDS:60',
      '--var', 'LIVE_TOKEN_RESERVATION_USD_MICROS:1000',
      '--var', 'LIVE_TOKEN_RESERVATION_PER_MINUTE_USD_MICROS:1000',
      '--var', 'MAX_CONCURRENT_LIVE_SESSIONS:2',
      '--var', 'MAX_LIVE_SESSIONS_PER_OWNER:1',
      '--var', 'CHAT_RATE_LIMIT:30',
      '--var', 'GLOBAL_CHAT_RATE_LIMIT:3',
      '--var', 'LIVE_RATE_LIMIT:12',
      '--var', 'TOOL_RATE_LIMIT:3',
      '--var', 'GOOGLE_CLIENT_ID:invalid',
      '--var', 'GOOGLE_CLIENT_SECRET:invalid',
      '--var', 'GOOGLE_REFRESH_TOKEN:invalid',
      '--var', 'GOOGLE_CRM_SPREADSHEET_ID:invalid',
      '--var', 'GOOGLE_CALENDAR_ID:invalid',
      '--var', 'BACKUP_ENCRYPTION_KEY:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
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
  const child = await start();
  try {
    const meta = await call('/api/meta');
    check('public meta is reachable without an access key', meta.status === 200 && Array.isArray(meta.body.tools), { status: meta.status });
    check('web research is absent from the tool surface', !meta.body.tools?.includes('webResearch'), { tools: meta.body.tools });

    const issuedA = await call('/api/owner', { method: 'POST', ip: '203.0.113.20' });
    const issuedB = await call('/api/owner', { method: 'POST', ip: '203.0.113.21' });
    check('server issues an anonymous owner credential', issuedA.status === 200 && /^[a-f0-9]{64}$/.test(issuedA.body.ownerToken || '') && issuedA.body.ownerToken !== issuedB.body.ownerToken, { status: issuedA.status, length: issuedA.body.ownerToken?.length });
    const owner = issuedA.body.ownerToken;
    const otherOwner = issuedB.body.ownerToken;

    const noConsent = await call('/api/session', { method: 'POST', owner, body: { locale: 'en' }, ip: '203.0.113.20' });
    check('public sessions require current consent', noConsent.status === 400 && noConsent.body.error?.code === 'CONSENT_REQUIRED', { status: noConsent.status, error: noConsent.body.error?.code });
    const staleConsent = await call('/api/session', { method: 'POST', owner, body: { locale: 'en', consent: oldConsent }, ip: '203.0.113.20' });
    check('old consent version is rejected', staleConsent.status === 400 && staleConsent.body.error?.code === 'CONSENT_REQUIRED', { status: staleConsent.status, error: staleConsent.body.error?.code });
    const session = await call('/api/session', { method: 'POST', owner, body: { locale: 'en', consent }, ip: '203.0.113.20' });
    check('public session is created with current consent', session.status === 201 && Boolean(session.body.session?.id), { status: session.status });
    const sessionId = session.body.session?.id;
    const crossOwner = await call(`/api/session/${encodeURIComponent(sessionId)}`, { owner: otherOwner, ip: '203.0.113.21' });
    check('another anonymous owner cannot read the session', crossOwner.status === 404, { status: crossOwner.status });

    const legacyOwner = `legacy-browser-owner-${'a'.repeat(40)}`;
    const legacySession = await call('/api/session', { method: 'POST', owner: legacyOwner, body: { locale: 'en', consent }, ip: '203.0.113.24' });
    check('a pre-existing browser-generated owner token remains compatible', legacySession.status === 201 && Boolean(legacySession.body.session?.id), { status: legacySession.status });

    const staleSession = await call('/api/session', { method: 'POST', owner, body: { locale: 'en', consent }, ip: '203.0.113.23' });
    const staleSessionId = staleSession.body.session?.id;
    d1(`UPDATE sessions SET state_json='${JSON.stringify({ locale: 'en', consent: { ...oldConsent, acceptedAt: Date.now() } })}' WHERE id='${staleSessionId}'`);
    const staleExisting = await call(`/api/session/${encodeURIComponent(staleSessionId)}`, { owner, ip: '203.0.113.23' });
    const staleChat = await call('/api/chat', { method: 'POST', owner, body: { sessionId: staleSessionId, message: 'Who are you?', locale: 'en', clientMessageId: crypto.randomUUID() }, ip: '203.0.113.23' });
    check('existing public sessions with stale consent are blocked before reading or chat', staleExisting.status === 400 && staleExisting.body.error?.code === 'CONSENT_REQUIRED' && staleChat.status === 400 && staleChat.body.error?.code === 'CONSENT_REQUIRED', { read: staleExisting.status, chat: staleChat.status });

    const chat = await call('/api/chat', { method: 'POST', owner, body: { sessionId, message: 'Who are you?', locale: 'en', clientMessageId: crypto.randomUUID() }, ip: '203.0.113.20' });
    check('public text chat works after consent and with invalid Google authorization', chat.status === 200 && Boolean(chat.body.reply), { status: chat.status, reply: chat.body.reply });

    const removedTool = await call('/api/tools/execute', { method: 'POST', owner, body: { sessionId, name: 'webResearch', args: { query: 'current AI news' } }, ip: '203.0.113.22' });
    check('web research tool cannot be executed', removedTool.status === 200 && removedTool.body.ok === false, { status: removedTool.status, ok: removedTool.body.ok, error: removedTool.body.error?.code });

    const toolCalls = [];
    for (let index = 0; index < 4; index++) {
      toolCalls.push(await call('/api/tools/execute', { method: 'POST', owner, body: { sessionId, name: 'searchPortfolio', args: { query: 'Safiy' } }, ip: '203.0.113.30' }));
    }
    check('excessive tool execution is rate-limited', toolCalls.slice(0, 3).every((item) => item.status === 200) && toolCalls[3].status === 429, { statuses: toolCalls.map((item) => item.status) });

    const liveOwners = [];
    for (let index = 0; index < 3; index++) {
      const issued = await call('/api/owner', { method: 'POST', ip: `203.0.113.4${index}` });
      const created = await call('/api/session', { method: 'POST', owner: issued.body.ownerToken, body: { locale: 'en', consent }, ip: `203.0.113.4${index}` });
      liveOwners.push({ owner: issued.body.ownerToken, sessionId: created.body.session?.id, ip: `203.0.113.4${index}` });
    }
    const live = await Promise.all(liveOwners.map((item) => call('/api/live/token', { method: 'POST', owner: item.owner, body: { sessionId: item.sessionId, locale: 'en' }, ip: item.ip })));
    const liveStatuses = live.map((item) => item.status).sort();
    check('concurrent voice sessions are capped globally', liveStatuses.filter((status) => status === 200).length === 2 && liveStatuses.filter((status) => status === 429).length === 1, { statuses: liveStatuses, errors: live.map((item) => item.body.error?.code) });
    const liveBlocked = live.find((item) => item.status === 429);
    check('concurrent voice error is explicit', liveBlocked?.body.error?.code === 'LIVE_SESSION_LIMIT', { error: liveBlocked?.body.error?.code, details: liveBlocked?.body.error?.details });
    const liveOk = live.find((item) => item.status === 200);
    const liveTools = liveOk?.body.config?.tools?.[0]?.functionDeclarations?.map((tool) => tool.name) || [];
    check('voice cannot start web research and keeps Sadachbia', !liveTools.includes('webResearch') && liveOk?.body.config?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName === 'Sadachbia', { tools: liveTools, voice: liveOk?.body.config?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName });

    const liveOwnerRecord = liveOwners.find((item) => item.sessionId === liveOk?.body.sessionId);
    const turn = await call('/api/live/turn', {
      method: 'POST',
      owner: liveOwnerRecord.owner,
      ip: liveOwnerRecord.ip,
      body: {
        sessionId: liveOwnerRecord.sessionId,
        turnId: `lease-${Date.now()}`,
        locale: 'en',
        userText: 'Lease check',
        assistantText: 'Lease check',
        reservationId: liveOk.body.reservationId,
        usage: { textInput: 0, audioInput: 0, audioOutput: 40000 }
      }
    });
    check('Live usage above the reservation is recorded, not capped to the reservation', turn.status === 200 && turn.body.duplicate === false && turn.body.costUsdMicros === 480000 && turn.body.costUsdMicros > liveOk.body.reservationUsdMicros, { status: turn.status, cost: turn.body.costUsdMicros, reservation: liveOk.body.reservationUsdMicros });

    const fourth = await call('/api/owner', { method: 'POST', ip: '203.0.113.70' });
    const fourthSession = await call('/api/session', { method: 'POST', owner: fourth.body.ownerToken, body: { locale: 'en', consent }, ip: '203.0.113.70' });
    const blockedByLease = await call('/api/live/token', { method: 'POST', owner: fourth.body.ownerToken, body: { sessionId: fourthSession.body.session?.id, locale: 'en' }, ip: '203.0.113.70' });
    check('active voice leases still block a new session after a reported turn', blockedByLease.status === 429 && blockedByLease.body.error?.code === 'LIVE_SESSION_LIMIT', { status: blockedByLease.status, error: blockedByLease.body.error?.code });

    const ended = await call('/api/live/end', { method: 'POST', owner: liveOwnerRecord.owner, body: { sessionId: liveOwnerRecord.sessionId, reservationId: liveOk.body.reservationId }, ip: liveOwnerRecord.ip });
    const afterEnd = await call('/api/live/token', { method: 'POST', owner: fourth.body.ownerToken, body: { sessionId: fourthSession.body.session?.id, locale: 'en' }, ip: '203.0.113.70' });
    check('ending a session releases the reservation and the concurrency lease immediately', ended.status === 200 && ended.body.ok === true && ended.body.released === true && ended.body.unreportedUsdMicros === 0 && ended.body.leaseReleased === true && afterEnd.status === 200, { ended: ended.status, released: ended.body.released, leaseReleased: ended.body.leaseReleased, unreported: ended.body.unreportedUsdMicros, next: afterEnd.status, error: afterEnd.body.error?.code });

    d1(`UPDATE live_session_leases SET expires_at=0 WHERE session_id='${fourthSession.body.session?.id}'`);
    d1(`UPDATE live_tokens SET expires_at=0 WHERE session_id='${fourthSession.body.session?.id}' AND status='held'`);
    const afterExpiry = await call('/api/live/token', { method: 'POST', owner: fourth.body.ownerToken, body: { sessionId: fourthSession.body.session?.id, locale: 'en' }, ip: '203.0.113.70' });
    check('expired lease and reservation release voice concurrency', afterExpiry.status === 200, { status: afterExpiry.status, error: afterExpiry.body.error?.code });
    if (afterExpiry.status === 200) await call('/api/live/end', { method: 'POST', owner: fourth.body.ownerToken, body: { sessionId: fourthSession.body.session?.id, reservationId: afterExpiry.body.reservationId }, ip: '203.0.113.70' });

    const adminNoAuth = await call('/api/admin/status');
    const admin = await call('/api/admin/status', { admin: true });
    check('admin remains authenticated', adminNoAuth.status === 401 && admin.status === 200 && admin.body.ok === true, { noAuth: adminNoAuth.status, auth: admin.status });
    check('admin exposes public mode, paid-tier estimate and concurrency limits', admin.body.security?.publicAccess === true && admin.body.costs?.internalEstimateOnly === true && admin.body.limits?.maxConcurrentLiveSessions === 2 && admin.body.budget?.dailyCapUsdMicros === 3000000, { security: admin.body.security, costs: admin.body.costs, limits: admin.body.limits, budget: admin.body.budget });

    const extraChats = [];
    for (let index = 0; index < 3; index++) {
      extraChats.push(await call('/api/chat', { method: 'POST', owner, body: { sessionId, message: 'Portfolio question', locale: 'en', clientMessageId: crypto.randomUUID() }, ip: `203.0.113.5${index}` }));
    }
    check('global chat requests are rate-limited', extraChats.some((item) => item.status === 429) && extraChats.some((item) => item.status === 200), { statuses: extraChats.map((item) => item.status) });

    const shutdown = await call('/api/admin/flags', { method: 'PATCH', admin: true, body: { flags: { assistant_enabled: false } } });
    const blocked = await call('/api/session', { method: 'POST', owner, body: { locale: 'en', consent }, ip: '203.0.113.60' });
    const restore = await call('/api/admin/flags', { method: 'PATCH', admin: true, body: { flags: { assistant_enabled: true } } });
    check('emergency shutdown blocks new sessions and restores', shutdown.status === 200 && blocked.status === 503 && restore.status === 200 && restore.body.flags?.assistant_enabled === true, { shutdown: shutdown.status, blocked: blocked.status, restore: restore.status });

    const output = {
      generatedAt: new Date().toISOString(),
      mode: 'public/mock-providers/local-d1',
      passed: results.filter((item) => item.pass).length,
      failed: results.filter((item) => !item.pass).length,
      total: results.length,
      results
    };
    fs.mkdirSync(path.join(root, 'results'), { recursive: true });
    fs.writeFileSync(path.join(root, 'results/public-controls-tests.json'), JSON.stringify(output, null, 2));
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
