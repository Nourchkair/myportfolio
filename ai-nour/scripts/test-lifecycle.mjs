import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const port = Number(process.env.PHASE3_LIFECYCLE_PORT || 8797);
const base = `http://127.0.0.1:${port}`;
const persist = '.wrangler/lifecycle-state';
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const prototypeKey = 'phase3-lifecycle-key';
const webhookSecret = `whsec_${Buffer.from('phase3-lifecycle-webhook-secret').toString('base64')}`;
const owner = `lifecycle-${crypto.randomUUID()}`;
const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });
let child;
let bookingId = null;

async function call(pathname, { method = 'GET', body, admin = false, headers = {} } = {}) {
  const requestHeaders = { 'x-prototype-key': prototypeKey, 'x-owner-token': owner, ...headers };
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  if (admin) requestHeaders.authorization = `Bearer ${env.ADMIN_TOKEN}`;
  const response = await fetch(base + pathname, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch {}
  return { status: response.status, body: parsed, headers: response.headers };
}

function startWorker() {
  return new Promise((resolve, reject) => {
    child = spawn('npx', [
      'wrangler', 'dev', '--local', '--port', String(port), '--persist-to', persist,
      '--var', 'TEXT_PROVIDER:mock', '--var', 'LIVE_PROVIDER:mock',
      '--var', `PROTOTYPE_ACCESS_KEY:${prototypeKey}`,
      '--var', 'ENABLE_CRM_WRITES:true',
      '--var', 'EMAIL_PROVIDER:mock',
      '--var', 'EMAIL_SEND_ENABLED:true',
      '--var', 'EMAIL_INTERNAL_TO:internal@example.invalid',
      '--var', 'EMAIL_MAX_ATTEMPTS:3',
      '--var', 'EMAIL_RETRY_BASE_SECONDS:1',
      '--var', `RESEND_WEBHOOK_SECRET:${webhookSecret}`
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (chunk) => { log += chunk.toString(); });
    child.stderr.on('data', (chunk) => { log += chunk.toString(); });
    child.on('exit', (code) => { if (code) reject(new Error(`wrangler exited ${code}\n${log.slice(-1600)}`)); });
    const started = Date.now();
    const poll = async () => {
      if (Date.now() - started > 60_000) return reject(new Error(`worker did not start\n${log.slice(-2400)}`));
      try { if ((await fetch(`${base}/api/health`)).ok) return resolve(child); } catch {}
      setTimeout(poll, 400);
    };
    poll();
  });
}

async function adminJobs(kind = null) {
  const result = await call('/api/admin/email', { admin: true });
  const jobs = result.body.jobs || [];
  return kind ? jobs.filter((job) => job.kind === kind) : jobs;
}

async function processEmail() {
  return call('/api/admin/email/process', { method: 'POST', admin: true, body: {} });
}

function webhookHeaders(rawBody, id = `msg_${crypto.randomUUID()}`) {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = Buffer.from(webhookSecret.replace(/^whsec_/, ''), 'base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return { id, headers: { 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${signature}`, 'content-type': 'application/json' } };
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  fs.rmSync(path.join(root, persist), { recursive: true, force: true });
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'ai-nour-phase1-dev', '--local', '--persist-to', persist], { cwd: root, stdio: 'pipe' });
  await startWorker();
  try {
    const startedAt = Date.now();
    const health = await fetch(`${base}/api/health`);
    check('local lifecycle worker is healthy', health.ok, { status: health.status });

    const unauthorizedAdmin = await call('/api/admin/email');
    check('admin email API rejects missing authorization', unauthorizedAdmin.status === 401, { status: unauthorizedAdmin.status });

    const scheduled = await fetch(`${base}/cdn-cgi/local/scheduled`);
    const audit = await call('/api/admin/audit', { admin: true });
    const scheduledError = (audit.body.events || []).find((event) => event.event === 'scheduled.error' && Number(event.created_at) >= startedAt);
    check('scheduled maintenance runs without a runtime error', scheduled.ok && !scheduledError, { status: scheduled.status, error: scheduledError?.detail || null });

    const startAt = Math.ceil((Date.now() + 24 * 3_600_000 + 17 * 60_000) / 300_000) * 300_000;
    const endAt = startAt + 30 * 60_000;

    const inquiry = await call('/api/crm/inquiries', {
      method: 'POST',
      body: {
        fullName: 'Synthetic Lifecycle Visitor',
        email: 'synthetic.lifecycle@example.invalid',
        inquiryType: 'consulting',
        summary: 'Synthetic end-to-end lifecycle validation.',
        requestedService: 'AI workflow review',
        consent: { store: true, contact: true, email: true, followup: true },
        clientRequestId: `lifecycle-inquiry-${owner}`
      }
    });
    check('inquiry, contact and consent created', inquiry.status === 201 && Boolean(inquiry.body.inquiry?.id) && Boolean(inquiry.body.contact?.id), { status: inquiry.status });
    const inquiryId = inquiry.body.inquiry?.id;
    const inquiryJobs = await adminJobs();
    check('inquiry acknowledgement and internal notification queued', inquiryJobs.some((job) => job.kind === 'inquiry_acknowledgement') && inquiryJobs.some((job) => job.kind === 'inquiry_internal'), { jobs: inquiryJobs.length });
    const jobsAfterInquiry = inquiryJobs.length;

    const duplicateInquiry = await call('/api/crm/inquiries', {
      method: 'POST',
      body: {
        fullName: 'Synthetic Lifecycle Visitor',
        email: 'synthetic.lifecycle@example.invalid',
        inquiryType: 'consulting',
        summary: 'Duplicate lifecycle inquiry.',
        consent: { store: true, contact: true, email: true },
        clientRequestId: `lifecycle-inquiry-${owner}`
      }
    });
    const jobsAfterDuplicate = await adminJobs();
    check('duplicate inquiry is idempotent and queues no duplicate email', duplicateInquiry.status === 200 && duplicateInquiry.body.duplicate === true && jobsAfterDuplicate.length === jobsAfterInquiry, { status: duplicateInquiry.status, before: jobsAfterInquiry, after: jobsAfterDuplicate.length });

    const processedInquiry = await processEmail();
    const acknowledgement = (await adminJobs('inquiry_acknowledgement'))[0];
    check('inquiry emails deliver through the mock provider', processedInquiry.status === 200 && acknowledgement?.status === 'sent' && Boolean(acknowledgement?.provider_message_id), { processed: processedInquiry.body.results?.length, status: acknowledgement?.status });

    const webhookBody = JSON.stringify({ type: 'email.delivered', data: { email_id: acknowledgement.provider_message_id } });
    const signed = webhookHeaders(webhookBody);
    const deliveredRaw = await fetch(`${base}/api/webhooks/resend`, { method: 'POST', headers: signed.headers, body: webhookBody });
    const deliveredBody = await deliveredRaw.json();
    const afterDelivery = (await adminJobs('inquiry_acknowledgement'))[0];
    check('signed delivery webhook updates the email lifecycle', deliveredRaw.status === 200 && deliveredBody.applied === true && afterDelivery.status === 'delivered' && Boolean(afterDelivery.delivered_at), { status: deliveredRaw.status, emailStatus: afterDelivery.status });
    const duplicateWebhook = await fetch(`${base}/api/webhooks/resend`, { method: 'POST', headers: signed.headers, body: webhookBody });
    const duplicateBody = await duplicateWebhook.json();
    check('duplicate webhook replay is harmless', duplicateWebhook.status === 200 && duplicateBody.duplicate === true, { status: duplicateWebhook.status, body: duplicateBody });
    const invalidWebhook = await fetch(`${base}/api/webhooks/resend`, { method: 'POST', headers: { 'content-type': 'application/json', 'svix-id': 'msg_bad', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,bad' }, body: webhookBody });
    check('unsigned/tampered webhook is rejected', invalidWebhook.status === 401, { status: invalidWebhook.status });

    const flags = await call('/api/admin/flags', { method: 'PATCH', admin: true, body: { flags: { google_writes_enabled: true } } });
    check('real synthetic Google writes enabled for this test', flags.status === 200 && flags.body.flags?.google_writes_enabled === true, { status: flags.status });

    const appointment = await call('/api/crm/appointments', {
      method: 'POST',
      body: { inquiryId, startUtc: startAt, endUtc: endAt, timezone: 'America/Toronto', idempotencyKey: `lifecycle-appointment-${owner}` }
    });
    const booking = appointment.body.booking;
    bookingId = booking?.id || null;
    check('appointment confirmed with unique Meet link', appointment.status === 201 && booking?.status === 'confirmed' && Boolean(booking?.meetLink) && Boolean(booking?.calendarEventId), { status: appointment.status, bookingStatus: booking?.status, meet: Boolean(booking?.meetLink), error: appointment.body.error });
    if (!booking?.id) throw new Error(`appointment failed: ${JSON.stringify(appointment.body).slice(0, 600)}`);
    const jobsAfterAppointment = await adminJobs();
    check('appointment confirmation and internal notification queued', jobsAfterAppointment.some((job) => job.kind === 'appointment_confirmation') && jobsAfterAppointment.some((job) => job.kind === 'appointment_internal'), { jobs: jobsAfterAppointment.length });

    const duplicateAppointment = await call('/api/crm/appointments', {
      method: 'POST',
      body: { inquiryId, startUtc: startAt, endUtc: endAt, timezone: 'America/Toronto', idempotencyKey: `lifecycle-appointment-${owner}` }
    });
    const jobsAfterDuplicateAppointment = await adminJobs();
    check('appointment idempotency prevents duplicate confirmation', duplicateAppointment.status === 200 && duplicateAppointment.body.duplicate === true && jobsAfterDuplicateAppointment.length === jobsAfterAppointment.length, { status: duplicateAppointment.status, before: jobsAfterAppointment.length, after: jobsAfterDuplicateAppointment.length });

    const processedAppointment = await processEmail();
    const confirmation = (await adminJobs('appointment_confirmation'))[0];
    check('appointment confirmation delivers', processedAppointment.status === 200 && confirmation?.status === 'sent' && confirmation.body?.includes(booking?.meetLink), { processed: processedAppointment.body.results?.length, hasMeet: confirmation?.body?.includes(booking?.meetLink) });

    const reminders = await call('/api/admin/email/reminders', { method: 'POST', admin: true, body: {} });
    const reminderJobs = (await adminJobs()).filter((job) => job.kind === 'appointment_reminder_24h');
    check('24-hour reminder is queued once', reminders.status === 200 && reminders.body.queued?.length >= 1 && reminderJobs.length === 1, { queued: reminders.body.queued?.length, jobs: reminderJobs.length });
    const remindersAgain = await call('/api/admin/email/reminders', { method: 'POST', admin: true, body: {} });
    check('reminder duplicate-send protection holds', remindersAgain.status === 200 && remindersAgain.body.queued?.length === 0, { queued: remindersAgain.body.queued?.length });
    await processEmail();
    const sentReminder = (await adminJobs('appointment_reminder_24h'))[0];
    check('reminder delivers', sentReminder?.status === 'sent', { status: sentReminder?.status });

    const reschedule = await call(`/api/crm/appointments/${encodeURIComponent(booking.id)}/reschedule`, {
      method: 'POST',
      body: { startUtc: startAt + 2 * 3_600_000, endUtc: endAt + 2 * 3_600_000, timezone: 'America/Toronto' }
    });
    check('appointment rescheduled', reschedule.status === 200 && reschedule.body.booking?.startUtc === startAt + 2 * 3_600_000, { status: reschedule.status });
    const rescheduleJobs = await adminJobs('appointment_rescheduled');
    check('reschedule confirmation queued', rescheduleJobs.length === 1 && rescheduleJobs[0].status === 'queued', { jobs: rescheduleJobs.length, status: rescheduleJobs[0]?.status });
    await processEmail();

    const cancel = await call(`/api/crm/appointments/${encodeURIComponent(booking.id)}/cancel`, { method: 'POST', body: {} });
    const jobsAfterCancel = await adminJobs();
    check('appointment cancelled', cancel.status === 200 && cancel.body.booking?.status === 'cancelled', { status: cancel.status });
    check('cancellation confirmation queued', jobsAfterCancel.some((job) => job.kind === 'appointment_cancelled' && job.status === 'queued'), { jobs: jobsAfterCancel.length });
    const duplicateCancel = await call(`/api/crm/appointments/${encodeURIComponent(booking.id)}/cancel`, { method: 'POST', body: {} });
    const jobsAfterDuplicateCancel = await adminJobs();
    check('duplicate cancellation is idempotent', duplicateCancel.status === 200 && duplicateCancel.body.duplicate === true && jobsAfterDuplicateCancel.length === jobsAfterCancel.length, { status: duplicateCancel.status, before: jobsAfterCancel.length, after: jobsAfterDuplicateCancel.length });
    await processEmail();

    const failureInquiry = await call('/api/crm/inquiries', {
      method: 'POST',
      body: {
        fullName: 'Synthetic Failure Visitor',
        email: 'fail@example.invalid',
        inquiryType: 'general',
        summary: 'Synthetic delivery failure and retry validation.',
        consent: { store: true, contact: true, email: true },
        clientRequestId: `lifecycle-failure-${owner}`
      }
    });
    check('failure-path inquiry accepted', failureInquiry.status === 201 && Boolean(failureInquiry.body.inquiry?.id), { status: failureInquiry.status });
    await processEmail();
    let failureJob = (await adminJobs('inquiry_acknowledgement')).find((job) => job.to_email === 'fail@example.invalid');
    check('transient email failure is retried', failureJob?.status === 'queued' && Number(failureJob?.attempts) === 1 && Boolean(failureJob?.next_attempt_at), { status: failureJob?.status, attempts: failureJob?.attempts });
    await wait(1300);
    await processEmail();
    failureJob = (await adminJobs('inquiry_acknowledgement')).find((job) => job.to_email === 'fail@example.invalid');
    check('second delivery attempt is tracked', Number(failureJob?.attempts) === 2, { attempts: failureJob?.attempts, status: failureJob?.status });
    await wait(2600);
    await processEmail();
    failureJob = (await adminJobs('inquiry_acknowledgement')).find((job) => job.to_email === 'fail@example.invalid');
    check('failed email reaches dead-letter after max attempts', failureJob?.status === 'dead_letter' && Number(failureJob?.attempts) === 3, { status: failureJob?.status, attempts: failureJob?.attempts });

    const retry = await call(`/api/admin/email/${encodeURIComponent(failureJob.id)}/retry`, { method: 'POST', admin: true, body: {} });
    const retriedJob = (await adminJobs()).find((job) => job.id === failureJob.id);
    check('admin can requeue a dead-letter job', retry.status === 200 && retriedJob?.status === 'queued' && Number(retriedJob?.attempts) === 0, { status: retry.status, jobStatus: retriedJob?.status });

    await call('/api/admin/flags', { method: 'PATCH', admin: true, body: { flags: { google_writes_enabled: false } } });

    const output = {
      generatedAt: new Date().toISOString(),
      mode: 'mock-email/real-synthetic-google-calendar/synthetic-consenting-attendee',
      passed: results.filter((item) => item.pass).length,
      failed: results.filter((item) => !item.pass).length,
      total: results.length,
      results
    };
    fs.mkdirSync(path.join(root, 'results'), { recursive: true });
    fs.writeFileSync(path.join(root, 'results/lifecycle-tests.json'), JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
    if (output.failed) process.exitCode = 1;
  } finally {
    if (bookingId) {
      await call(`/api/crm/appointments/${encodeURIComponent(bookingId)}/cancel`, { method: 'POST', body: {} }).catch(() => {});
    }
    await call('/api/admin/flags', { method: 'PATCH', admin: true, body: { flags: { google_writes_enabled: false } } }).catch(() => {});
    child?.kill('SIGTERM');
    setTimeout(() => child?.kill('SIGKILL'), 1500).unref();
  }
}

main().catch((error) => {
  console.error(String(error?.stack || error).slice(0, 5000));
  process.exit(1);
});
