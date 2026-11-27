import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const port = Number(process.env.PHASE2_LIVE_BUDGET_PORT || 8798);
const base = `http://127.0.0.1:${port}`;
const persist = '.wrangler/live-budget-state';
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const key = 'phase2-live-budget-key';
const owner = `live-budget-${crypto.randomUUID()}`;
const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });

async function call(pathname, { method = 'GET', body, admin = false } = {}) {
  const headers = { 'x-prototype-key': key, 'x-owner-token': owner };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (admin) headers.authorization = `Bearer ${env.ADMIN_TOKEN}`;
  const response = await fetch(base + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch {}
  return { status: response.status, body: parsed };
}

function start() {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', [
      'wrangler', 'dev', '--local', '--port', String(port), '--persist-to', persist,
      '--var', 'TEXT_PROVIDER:mock', '--var', 'LIVE_PROVIDER:mock',
      '--var', `PROTOTYPE_ACCESS_KEY:${key}`,
      '--var', 'LIVE_SESSION_SECONDS:300',
      '--var', 'MAX_LIVE_SESSION_SECONDS:600',
      '--var', 'LIVE_TOKEN_RESERVATION_USD_MICROS:125000',
      '--var', 'DAILY_SPEND_CAP_USD_MICROS:200000',
      '--var', 'CUMULATIVE_SPEND_CAP_USD_MICROS:7000000'
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (chunk) => { log += chunk.toString(); });
    child.stderr.on('data', (chunk) => { log += chunk.toString(); });
    child.on('exit', (code) => { if (code) reject(new Error(`wrangler exited ${code}\n${log.slice(-1200)}`)); });
    const started = Date.now();
    const poll = async () => {
      if (Date.now() - started > 45_000) return reject(new Error(`worker did not start\n${log.slice(-2000)}`));
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
    const session = await call('/api/session', { method: 'POST', body: { locale: 'en' } });
    const sessionId = session.body.session?.id;
    const first = await call('/api/live/token', { method: 'POST', body: { sessionId, locale: 'en' } });
    check('first Live token reserves the five-minute budget', first.status === 200 && Boolean(first.body.reservationId) && first.body.reservationUsdMicros === 125_000, { status: first.status, reservationUsdMicros: first.body.reservationUsdMicros });
    check('Live token carries the configured five-minute session duration', first.status === 200 && first.body.sessionSeconds === 300 && Date.parse(first.body.expiresAt) - Date.now() > 290_000, { sessionSeconds: first.body.sessionSeconds, expiresAt: first.body.expiresAt });
    check('Live config uses Iapetus', first.status === 200 && first.body.config?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName === 'Iapetus', { voice: first.body.config?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName });
    const declarations = first.body.config?.tools?.[0]?.functionDeclarations?.map((tool) => tool.name) || [];
    check('Live config includes knowledge and presentation tools', ['searchPortfolio', 'getProjectDossier', 'getProjectStep', 'getCurrentView', 'presentProject', 'presentProjectStep'].every((name) => declarations.includes(name)), { declarations });
    check('Live instruction includes verified portfolio grounding', /VERIFIED PORTFOLIO FACTS/i.test(first.body.config?.systemInstruction || '') && /Customer Acquisition/i.test(first.body.config?.systemInstruction || '') && /mergers and acquisitions/i.test(first.body.config?.systemInstruction || ''), { instructionLength: first.body.config?.systemInstruction?.length || 0 });
    check('Live config omits disabled web research', !declarations.includes('webResearch'), { declarations });

    const budgetAfterFirst = await call('/api/admin/cost', { admin: true });
    check('held Live reservation counts toward budget', budgetAfterFirst.status === 200 && budgetAfterFirst.body.budget.heldLiveReservationsUsdMicros === 125_000, { held: budgetAfterFirst.body.budget?.heldLiveReservationsUsdMicros });

    const second = await call('/api/live/token', { method: 'POST', body: { sessionId, locale: 'en' } });
    check('second Live token blocked before unreported usage can bypass cap', second.status === 402 && second.body.error?.code === 'DAILY_BUDGET_EXHAUSTED', { status: second.status, error: second.body.error?.code });
    check('daily budget error includes the local-reset timestamp', second.body.error?.details?.scope === 'daily' && Number(second.body.error?.details?.resetsAt) > Date.now(), { details: second.body.error?.details });

    const output = {
      generatedAt: new Date().toISOString(),
      mode: 'mock-live/no-usage-reported',
      passed: results.filter((item) => item.pass).length,
      failed: results.filter((item) => !item.pass).length,
      total: results.length,
      results
    };
    fs.mkdirSync(path.join(root, 'results'), { recursive: true });
    fs.writeFileSync(path.join(root, 'results/live-budget-tests.json'), JSON.stringify(output, null, 2));
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
