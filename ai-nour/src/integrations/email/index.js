import { IntegrationError } from '../errors.js';
import { timingSafeEqual } from '../../auth/secure.js';
import {
  appointmentCancelled,
  appointmentConfirmation,
  appointmentReminder,
  appointmentRescheduled,
  inquiryAcknowledgement,
  internalAppointment,
  internalInquiry
} from './templates.js';

const encoder = new TextEncoder();

function header(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  return headers[name] || headers[name.toLowerCase()] || '';
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function hmacBase64(secret, value) {
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64(new Uint8Array(signature));
}

function backoffMs(baseMs, attempt) {
  return Math.min(Math.max(baseMs, 1000) * 2 ** Math.max(0, attempt - 1), 6 * 3_600_000);
}

export function createEmailService({ config, gmail = null, fetchImpl = fetch }) {
  const provider = config.email.provider;

  async function deliver({ to, subject, text, html = null, dedupeKey = null }) {
    if (!config.email.sendEnabled) return { status: 'dry_run', provider, id: null };
    if (provider === 'resend') {
      if (!config.email.resendApiKey || !config.email.resendFrom) {
        throw new IntegrationError('RESEND_NOT_CONFIGURED', 'Resend is not configured');
      }
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.email.resendApiKey}`,
          'content-type': 'application/json',
          ...(dedupeKey ? { 'Idempotency-Key': String(dedupeKey).slice(0, 256) } : {})
        },
        body: JSON.stringify({
          from: config.email.resendFrom,
          to: [to],
          subject,
          text,
          ...(html ? { html } : {})
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = body?.name || body?.error?.name || `HTTP_${response.status}`;
        throw new IntegrationError('RESEND_SEND_FAILED', `Resend send failed: ${code}`, {
          status: response.status === 429 ? 429 : 502,
          details: { providerStatus: response.status, providerCode: code }
        });
      }
      return { status: 'sent', provider, id: body.id || null };
    }
    if (provider === 'gmail-draft') {
      if (!gmail) throw new IntegrationError('GMAIL_NOT_CONFIGURED', 'Gmail draft provider is not configured');
      const draft = await gmail.createDraft({ to, subject, text, html });
      return { status: 'drafted', provider, id: draft.id || null };
    }
    if (provider === 'mock') {
      if (String(to).includes('fail')) throw new IntegrationError('MOCK_EMAIL_FAILED', 'Synthetic email failure');
      return { status: 'sent', provider: 'mock', id: `mock-${crypto.randomUUID()}` };
    }
    throw new IntegrationError('EMAIL_PROVIDER_UNKNOWN', `Unknown email provider: ${provider}`);
  }

  async function enqueue({
    db,
    kind,
    to,
    subject,
    text,
    html = null,
    dedupeKey = null,
    inquiryId = null,
    appointmentId = null,
    now
  }) {
    if (!to) return null;
    const id = crypto.randomUUID();
    const result = await db.addEmailJob({
      id,
      kind,
      toEmail: to,
      subject,
      body: text,
      html,
      status: 'queued',
      provider,
      dedupeKey,
      maxAttempts: config.email.maxAttempts,
      nextAttemptAt: now,
      inquiryId,
      appointmentId,
      now
    });
    return result?.created === false ? { id, queued: false } : { id, queued: true };
  }

  async function send({ to, subject, text, html = null, dedupeKey = null }) {
    return deliver({ to, subject, text, html, dedupeKey });
  }

  async function processQueued({ db, limit = 10, now = Date.now() }) {
    const jobs = await db.listDueEmailJobs({ now, limit });
    const results = [];
    for (const job of jobs) {
      const claimed = await db.claimEmailJob({ id: job.id, now });
      if (!claimed) continue;
      const attempts = Number(job.attempts || 0) + 1;
      try {
        const result = await deliver({
          to: job.to_email,
          subject: job.subject,
          text: job.body,
          html: job.html || null,
          dedupeKey: job.dedupe_key || null
        });
        await db.markEmailJobSent({
          id: job.id,
          status: result.status,
          sentAt: result.status === 'sent' ? now : null,
          providerMessageId: result.id || null,
          now
        });
        results.push({ id: job.id, status: result.status, attempts });
      } catch (error) {
        const dead = attempts >= Number(job.max_attempts || config.email.maxAttempts);
        const nextAttemptAt = dead ? null : now + backoffMs(config.email.retryBaseMs, attempts);
        const status = dead ? 'dead_letter' : 'queued';
        await db.markEmailJobFailure({
          id: job.id,
          status,
          error: String(error?.code || error?.message || error).slice(0, 240),
          nextAttemptAt,
          now
        });
        results.push({ id: job.id, status, attempts, error: error?.code || 'EMAIL_FAILED' });
      }
    }
    return results;
  }

  async function scheduleReminders({ db, now = Date.now() }) {
    const windows = [
      { leadHours: 24, from: now + 23 * 3_600_000, to: now + 25 * 3_600_000 },
      { leadHours: 1, from: now + 30 * 60_000, to: now + 90 * 60_000 }
    ];
    const queued = [];
    for (const window of windows) {
      const rows = await db.listBookingsForReminder({ from: window.from, to: window.to });
      for (const row of rows) {
        if (!row.email) continue;
        const contact = { full_name: row.full_name, email: row.email };
        const booking = {
          id: row.id,
          startUtc: Number(row.start_utc),
          timezone: row.timezone || 'America/Toronto',
          meetLink: row.meet_link || null
        };
        const template = appointmentReminder({ contact, booking, leadHours: window.leadHours });
        const result = await enqueue({
          db,
          kind: `appointment_reminder_${window.leadHours}h`,
          to: contact.email,
          subject: template.subject,
          text: template.text,
          html: template.html,
          dedupeKey: `appointment-reminder:${window.leadHours}h:${booking.id}:${booking.startUtc}`,
          inquiryId: row.inquiry_id || null,
          appointmentId: booking.id,
          now
        });
        if (result?.queued) queued.push({ id: result.id, appointmentId: booking.id, leadHours: window.leadHours });
      }
    }
    return queued;
  }

  async function verifyWebhook({ rawBody, headers, secret = config.email.webhookSecret, now = Date.now() }) {
    if (!secret) throw new IntegrationError('RESEND_WEBHOOK_NOT_CONFIGURED', 'Resend webhook secret is not configured');
    const id = header(headers, 'svix-id');
    const timestamp = Number(header(headers, 'svix-timestamp'));
    const signatureHeader = header(headers, 'svix-signature');
    if (!id || !timestamp || !signatureHeader) throw new IntegrationError('RESEND_WEBHOOK_INVALID', 'Missing webhook signature headers');
    if (Math.abs(now / 1000 - timestamp) > 300) throw new IntegrationError('RESEND_WEBHOOK_STALE', 'Webhook timestamp is outside the replay window');
    const key = base64ToBytes(String(secret).replace(/^whsec_/, ''));
    const expected = await hmacBase64(key, `${id}.${timestamp}.${rawBody}`);
    const provided = signatureHeader.split(' ').map((part) => part.split(',')[1]).filter(Boolean);
    if (!provided.some((value) => timingSafeEqual(value, expected))) {
      throw new IntegrationError('RESEND_WEBHOOK_INVALID', 'Webhook signature is invalid');
    }
    try {
      return JSON.parse(rawBody);
    } catch {
      throw new IntegrationError('RESEND_WEBHOOK_INVALID', 'Webhook payload is not valid JSON');
    }
  }

  async function recordEvent({ db, event, svixId, now = Date.now() }) {
    const type = String(event?.type || '').toLowerCase();
    const emailId = event?.data?.email_id || event?.data?.email?.id || event?.data?.id || null;
    const recorded = await db.recordEmailEvent({ id: svixId, eventType: type, emailId, now });
    if (!recorded) return { applied: false, duplicate: true, type, emailId };
    const status = {
      'email.delivered': 'delivered',
      'email.bounced': 'bounced',
      'email.complained': 'complained',
      'email.failed': 'failed',
      'email.sent': 'sent',
      'email.delivery_delayed': null
    }[type] ?? null;
    if (emailId) await db.applyEmailDelivery({ providerMessageId: emailId, status, eventType: type, now });
    return { applied: true, duplicate: false, type, emailId };
  }

  return {
    send,
    enqueue,
    processQueued,
    scheduleReminders,
    verifyWebhook,
    recordEvent,
    templates: {
      inquiryAcknowledgement,
      internalInquiry,
      appointmentConfirmation,
      appointmentRescheduled,
      appointmentCancelled,
      appointmentReminder,
      internalAppointment
    },
    provider,
    sendEnabled: config.email.sendEnabled
  };
}
