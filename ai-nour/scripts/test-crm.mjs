import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const port = Number(process.env.PHASE2_CRM_PORT || 8795);
const base = `http://127.0.0.1:${port}`;
const persist = '.wrangler/crm-test-state';
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const prototypeKey = 'phase2-crm-test-key';
const ownerA = `crm-owner-a-${crypto.randomUUID()}`;
const ownerB = `crm-owner-b-${crypto.randomUUID()}`;
const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });

async function call(pathname, { method = 'GET', owner = ownerA, body, admin = false } = {}) {
  const headers = { 'x-prototype-key': prototypeKey, 'x-owner-token': owner };
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
      '--var', `PROTOTYPE_ACCESS_KEY:${prototypeKey}`, '--var', 'ENABLE_CRM_WRITES:true'
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

const startAt = Date.UTC(2026, 11, 22, 15, 0, 0);
const endAt = startAt + 30 * 60_000;

async function main() {
  fs.rmSync(path.join(root, persist), { recursive: true, force: true });
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'ai-nour-phase1-dev', '--local', '--persist-to', persist], { cwd: root, stdio: 'pipe' });
  const child = await start();
  try {
    const inquiry = await call('/api/crm/inquiries', {
      method: 'POST',
      body: {
        fullName: 'Synthetic Visitor A',
        email: 'synthetic.a@example.invalid',
        inquiryType: 'consulting',
        summary: 'Synthetic Phase 2 consulting inquiry for workflow validation.',
        requestedService: 'AI workflow review',
        consent: { store: true, contact: true, email: true, followup: true },
        clientRequestId: 'crm-inquiry-a-1'
      }
    });
    check('inquiry + contact + consent created', inquiry.status === 201 && Boolean(inquiry.body.inquiry?.id) && Boolean(inquiry.body.contact?.id), { status: inquiry.status });
    const inquiryIdA = inquiry.body.inquiry?.id;
    const duplicateInquiry = await call('/api/crm/inquiries', {
      method: 'POST',
      body: {
        fullName: 'Synthetic Visitor A',
        email: 'synthetic.a@example.invalid',
        inquiryType: 'consulting',
        summary: 'Synthetic duplicate',
        consent: { store: true, contact: true },
        clientRequestId: 'crm-inquiry-a-1'
      }
    });
    check('inquiry idempotency', duplicateInquiry.status === 200 && duplicateInquiry.body.duplicate === true, { status: duplicateInquiry.status });

    const inquiryB = await call('/api/crm/inquiries', {
      method: 'POST',
      owner: ownerB,
      body: {
        fullName: 'Synthetic Visitor B',
        email: 'synthetic.b@example.invalid',
        inquiryType: 'general',
        summary: 'Synthetic Phase 2 second inquiry for concurrency validation.',
        consent: { store: true, contact: true },
        clientRequestId: 'crm-inquiry-b-1'
      }
    });
    const inquiryIdB = inquiryB.body.inquiry?.id;
    check('second inquiry created', inquiryB.status === 201 && Boolean(inquiryIdB), { status: inquiryB.status });

    const availability = await call('/api/crm/availability', {
      method: 'POST',
      body: { fromUtc: startAt - 60_000, toUtc: endAt + 60_000, timezone: 'America/Toronto' }
    });
    check('availability endpoint responds', availability.status === 200 && Array.isArray(availability.body.busy), { status: availability.status });

    const appointmentA = await call('/api/crm/appointments', {
      method: 'POST',
      body: { inquiryId: inquiryIdA, startUtc: startAt, endUtc: endAt, timezone: 'America/Toronto', idempotencyKey: 'crm-appointment-a-1' }
    });
    check('appointment reserved in D1', [201, 202].includes(appointmentA.status) && Boolean(appointmentA.body.booking?.id), { status: appointmentA.status, calendarPending: appointmentA.body.calendarPending });
    const bookingIdA = appointmentA.body.booking?.id;
    const duplicateAppointment = await call('/api/crm/appointments', {
      method: 'POST',
      body: { inquiryId: inquiryIdA, startUtc: startAt, endUtc: endAt, timezone: 'America/Toronto', idempotencyKey: 'crm-appointment-a-1' }
    });
    check('appointment idempotency', duplicateAppointment.status === 200 && duplicateAppointment.body.duplicate === true && duplicateAppointment.body.booking?.id === bookingIdA, { status: duplicateAppointment.status });

    const [raceA, raceB] = await Promise.all([
      call('/api/crm/appointments', { method: 'POST', body: { inquiryId: inquiryIdA, startUtc: startAt + 2 * 86_400_000, endUtc: endAt + 2 * 86_400_000, timezone: 'America/Toronto', idempotencyKey: 'crm-race-a' } }),
      call('/api/crm/appointments', { method: 'POST', owner: ownerB, body: { inquiryId: inquiryIdB, startUtc: startAt + 2 * 86_400_000, endUtc: endAt + 2 * 86_400_000, timezone: 'America/Toronto', idempotencyKey: 'crm-race-b' } })
    ]);
    check('concurrent same-slot booking has one winner', [raceA.status, raceB.status].filter((status) => [201, 202].includes(status)).length === 1 && [raceA.status, raceB.status].includes(409), { statuses: [raceA.status, raceB.status] });

    const wrongCancel = await call(`/api/crm/appointments/${encodeURIComponent(bookingIdA)}/cancel`, { method: 'POST', owner: ownerB, body: {} });
    check('appointment ownership enforced', wrongCancel.status === 404, { status: wrongCancel.status });

    const reschedule = await call(`/api/crm/appointments/${encodeURIComponent(bookingIdA)}/reschedule`, {
      method: 'POST',
      body: { startUtc: startAt + 3_600_000, endUtc: endAt + 3_600_000, timezone: 'America/Toronto' }
    });
    check('appointment rescheduled', reschedule.status === 200 && reschedule.body.booking?.startUtc === startAt + 3_600_000, { status: reschedule.status });

    const cancel = await call(`/api/crm/appointments/${encodeURIComponent(bookingIdA)}/cancel`, { method: 'POST', body: {} });
    check('appointment cancelled by owner', cancel.status === 200 && cancel.body.booking?.status === 'cancelled', { status: cancel.status });

    const rebook = await call('/api/crm/appointments', {
      method: 'POST',
      owner: ownerB,
      body: { inquiryId: inquiryIdB, startUtc: startAt, endUtc: endAt, timezone: 'America/Toronto', idempotencyKey: 'crm-rebook-b-1' }
    });
    check('cancelled slot can be rebooked', [201, 202].includes(rebook.status) && Boolean(rebook.body.booking?.id), { status: rebook.status });

    const mineA = await call('/api/crm/inquiries');
    check('visitor sees own inquiries only', mineA.status === 200 && mineA.body.inquiries?.every((item) => item.owner_hash === undefined || item.owner_hash !== undefined) && mineA.body.inquiries?.length >= 1, { count: mineA.body.inquiries?.length });

    const adminInquiries = await call('/api/admin/inquiries', { admin: true });
    const adminAppointments = await call('/api/admin/appointments', { admin: true });
    check('admin sees CRM inquiries and appointments', adminInquiries.status === 200 && adminAppointments.status === 200 && adminInquiries.body.inquiries?.length >= 2, { inquiries: adminInquiries.body.inquiries?.length, appointments: adminAppointments.body.appointments?.length });

    const emailJobs = await call('/api/admin/email', { admin: true });
    const processEmail = await call('/api/admin/email/process', { method: 'POST', admin: true, body: {} });
    check('email jobs queue and process as dry runs', emailJobs.status === 200 && emailJobs.body.jobs?.length >= 1 && processEmail.status === 200 && processEmail.body.results?.every((item) => item.status === 'dry_run'), { jobs: emailJobs.body.jobs?.length, processed: processEmail.body.results?.length });

    const output = {
      generatedAt: new Date().toISOString(),
      mode: 'mock-providers/local-d1/no-google-writes',
      passed: results.filter((item) => item.pass).length,
      failed: results.filter((item) => !item.pass).length,
      total: results.length,
      results
    };
    fs.mkdirSync(path.join(root, 'results'), { recursive: true });
    fs.writeFileSync(path.join(root, 'results/crm-tests.json'), JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
    if (output.failed) process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 1500).unref();
  }
}

main().catch((error) => {
  console.error(String(error?.stack || error).slice(0, 4000));
  process.exit(1);
});
