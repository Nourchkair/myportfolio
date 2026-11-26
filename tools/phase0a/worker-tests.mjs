import fs from 'node:fs';
import { loadEnv, outputPath, requireEnv } from './env.mjs';

const env = requireEnv(loadEnv(), ['PHASE0A_ADMIN_TOKEN']);
const base = process.env.PHASE0A_WORKER_URL || 'https://ai-nour-phase0a-dev.phase0a.workers.dev';
const ownerA = `phase0a-owner-a-${cryptoRandom()}`;
const ownerB = `phase0a-owner-b-${cryptoRandom()}`;
const admin = { authorization: `Bearer ${env.PHASE0A_ADMIN_TOKEN}` };
const results = [];
let failures = 0;

function cryptoRandom() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function request(path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let parsed = null;
  try { parsed = await response.json(); } catch {}
  return { status: response.status, body: parsed };
}

function check(name, pass, detail) {
  results.push({ name, pass, detail });
  if (!pass) failures++;
}

const stamp = Date.now();
const slotKey = `phase0a-slot-${stamp}`;
const start = Date.UTC(2026, 11, 20, 15, 0, 0);
const end = start + 15 * 60 * 1000;

const health = await request('/health');
check('health and D1', health.status === 200 && health.body?.ok === true && health.body?.d1 === true,
  { status: health.status, assistantEnabled: health.body?.assistantEnabled });

const noOwner = await request('/session', { method: 'POST', body: {} });
check('session requires owner', noOwner.status === 400, { status: noOwner.status });

const created = await request('/session', { method: 'POST', headers: { 'x-owner-token': ownerA }, body: {} });
check('session create', created.status === 201 && Boolean(created.body?.id), { status: created.status });
const sessionId = created.body?.id;

const ownRead = await request(`/session?id=${encodeURIComponent(sessionId || '')}`, { headers: { 'x-owner-token': ownerA } });
check('session owner read', ownRead.status === 200 && ownRead.body?.id === sessionId, { status: ownRead.status });

const crossRead = await request(`/session?id=${encodeURIComponent(sessionId || '')}`, { headers: { 'x-owner-token': ownerB } });
check('session cross-owner denied', crossRead.status === 404, { status: crossRead.status });

const noOwnerRead = await request(`/session?id=${encodeURIComponent(sessionId || '')}`);
check('session read requires owner', noOwnerRead.status === 400, { status: noOwnerRead.status });

const invalidWindow = await request('/booking', {
  method: 'POST',
  headers: { 'x-owner-token': ownerA },
  body: { startUtc: end, endUtc: start, slotKey: `${slotKey}-invalid` }
});
check('booking rejects invalid window', invalidWindow.status === 400, { status: invalidWindow.status });

const [raceA, raceB] = await Promise.all([
  request('/booking', { method: 'POST', headers: { 'x-owner-token': ownerA }, body: { startUtc: start, endUtc: end, slotKey } }),
  request('/booking', { method: 'POST', headers: { 'x-owner-token': ownerB }, body: { startUtc: start, endUtc: end, slotKey } })
]);
const winners = [
  { name: 'A', token: ownerA, response: raceA },
  { name: 'B', token: ownerB, response: raceB }
].filter((entry) => entry.response.status === 201);
const losers = [
  { name: 'A', token: ownerA, response: raceA },
  { name: 'B', token: ownerB, response: raceB }
].filter((entry) => entry.response.status === 409);
check('concurrent booking yields one winner', winners.length === 1 && losers.length === 1,
  { statuses: [raceA.status, raceB.status] });

const winner = winners[0];
const loser = losers[0];
const bookingId = winner?.response?.body?.id;

const wrongCancel = await request('/booking/cancel', {
  method: 'POST',
  headers: { 'x-owner-token': loser?.token || ownerB },
  body: { id: bookingId }
});
check('booking cancel requires owner', wrongCancel.status === 404, { status: wrongCancel.status });

const ownCancel = await request('/booking/cancel', {
  method: 'POST',
  headers: { 'x-owner-token': winner?.token || ownerA },
  body: { id: bookingId }
});
check('booking owner cancel', ownCancel.status === 200, { status: ownCancel.status });

const rebook = await request('/booking', {
  method: 'POST',
  headers: { 'x-owner-token': ownerB },
  body: { startUtc: start, endUtc: end, slotKey }
});
check('cancelled slot can be rebooked', rebook.status === 201, { status: rebook.status });
if (rebook.body?.id) {
  await request('/booking/cancel', { method: 'POST', headers: { 'x-owner-token': ownerB }, body: { id: rebook.body.id } });
}

const idemKey = `phase0a-idem-${stamp}`;
const idem1 = await request(`/idempotency?key=${encodeURIComponent(idemKey)}`);
const idem2 = await request(`/idempotency?key=${encodeURIComponent(idemKey)}`);
check('duplicate prevention', idem1.status === 200 && idem2.status === 200 &&
  idem1.body?.rows === 1 && idem2.body?.rows === 1,
  { rows: [idem1.body?.rows, idem2.body?.rows] });

const bucket = `phase0a-rate-${stamp}`;
const rateStatuses = [];
for (let i = 0; i < 4; i++) {
  rateStatuses.push((await request(`/rate?bucket=${encodeURIComponent(bucket)}`)).status);
}
check('rate limit 3/minute', rateStatuses.join(',') === '200,200,200,429', { rateStatuses });

const invalidJson = await fetch(`${base}/error`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{bad'
});
check('invalid JSON returns 400', invalidJson.status === 400, { status: invalidJson.status });

const notFound = await request('/no-such-route');
check('unknown route returns 404', notFound.status === 404, { status: notFound.status });

const controlNoAuth = await request('/control');
check('control requires admin', controlNoAuth.status === 401, { status: controlNoAuth.status });

const controlRead = await request('/control', { headers: admin });
check('admin reads control', controlRead.status === 200 && controlRead.body?.enabled === true,
  { status: controlRead.status, enabled: controlRead.body?.enabled });

const disabled = await request('/control', { method: 'POST', headers: admin, body: { enabled: false } });
const disabledSession = await request('/session', { method: 'POST', headers: { 'x-owner-token': ownerA }, body: {} });
const disabledHealth = await request('/health');
check('emergency shutdown blocks sessions', disabled.status === 200 && disabled.body?.enabled === false &&
  disabledSession.status === 503 && disabledHealth.body?.assistantEnabled === false,
  { disabledStatus: disabled.status, sessionStatus: disabledSession.status });

const enabled = await request('/control', { method: 'POST', headers: admin, body: { enabled: true } });
const enabledSession = await request('/session', { method: 'POST', headers: { 'x-owner-token': ownerA }, body: {} });
check('shutdown is reversible', enabled.status === 200 && enabled.body?.enabled === true && enabledSession.status === 201,
  { enabledStatus: enabled.status, sessionStatus: enabledSession.status });
if (enabledSession.body?.id) {
  await request(`/session?id=${encodeURIComponent(enabledSession.body.id)}`, { headers: { 'x-owner-token': ownerA } });
}

const spendNoAuth = await request('/spend');
check('spend endpoint requires admin', spendNoAuth.status === 401, { status: spendNoAuth.status });

const spendActual = await request('/spend', {
  method: 'POST',
  headers: admin,
  body: { usdMicros: 12426, provider: 'gemini', capability: 'phase0a-live-validation', at: Date.now() }
});
check('actual Live validation cost recorded under cap',
  spendActual.status === 200 && spendActual.body?.allowed === true && spendActual.body?.capUsdMicros === 1_000_000,
  { status: spendActual.status, totalUsdMicros: spendActual.body?.totalUsdMicros, capUsdMicros: spendActual.body?.capUsdMicros });

const futureDay = Date.UTC(2030, 0, 1, 12, 0, 0);
const underCap = await request('/spend', {
  method: 'POST',
  headers: admin,
  body: { usdMicros: 999_999, provider: 'synthetic', capability: 'cap-test', at: futureDay }
});
const overCap = await request('/spend', {
  method: 'POST',
  headers: admin,
  body: { usdMicros: 2, provider: 'synthetic', capability: 'cap-test', at: futureDay }
});
check('spending cap rejects over-cap usage', underCap.status === 200 && underCap.body?.allowed === true &&
  overCap.status === 402 && overCap.body?.allowed === false,
  { underCap: underCap.status, overCap: overCap.status, totalUsdMicros: overCap.body?.totalUsdMicros });

const output = {
  generatedAt: new Date().toISOString(),
  base,
  passed: results.filter((r) => r.pass).length,
  failed: failures,
  total: results.length,
  results
};
fs.writeFileSync(outputPath('worker-tests.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (failures) process.exit(1);
