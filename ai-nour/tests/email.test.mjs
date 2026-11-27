import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailService } from '../src/integrations/email/index.js';
import { appointmentConfirmation, inquiryAcknowledgement } from '../src/integrations/email/templates.js';

function config(overrides = {}) {
  return {
    email: {
      provider: 'resend',
      sendEnabled: false,
      resendApiKey: 're_test',
      resendFrom: 'Nupa <appointments@mail.example.test>',
      internalTo: 'admin@example.test',
      webhookSecret: '',
      maxAttempts: 3,
      retryBaseMs: 1000,
      ...overrides
    }
  };
}

test('email templates escape visitor content and include the AI disclosure', () => {
  const template = inquiryAcknowledgement({
    contact: { full_name: '<script>alert(1)</script>', email: 'visitor@example.test' },
    inquiry: { id: 'inq-1', summary: '<img src=x onerror=alert(1)>', inquiry_type: 'general' }
  });
  assert.match(template.subject, /inquiry received/);
  assert.equal(template.html.includes('<script>'), false);
  assert.match(template.html, /&lt;script&gt;/);
  assert.match(template.text, /Nupa is an independent AI portfolio assistant operated by Nour Chkair/);
  assert.match(template.text, /does not speak for him/);
  assert.doesNotMatch(template.text, /AI Nour|AI representation/);
});

test('appointment template includes the unique Meet link when present', () => {
  const template = appointmentConfirmation({
    contact: { full_name: 'Synthetic Visitor' },
    booking: { id: 'b1', startUtc: Date.UTC(2026, 11, 22, 15, 0, 0), timezone: 'America/Toronto', meetLink: 'https://meet.google.com/test-abc' }
  });
  assert.match(template.text, /meet\.google\.com\/test-abc/);
  assert.match(template.html, /Google Meet/);
});

test('dry-run email sends nothing and reports a dry-run status', async () => {
  let called = false;
  const service = createEmailService({
    config: config({ sendEnabled: false }),
    fetchImpl: async () => { called = true; return new Response('{}'); }
  });
  const result = await service.send({ to: 'visitor@example.test', subject: 'Test', text: 'Hello' });
  assert.equal(result.status, 'dry_run');
  assert.equal(called, false);
});

test('Resend delivery uses the Idempotency-Key header and returns the provider id', async () => {
  let request;
  const service = createEmailService({
    config: config({ sendEnabled: true }),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });
    }
  });
  const result = await service.send({
    to: 'visitor@example.test',
    subject: 'Test',
    text: 'Hello',
    dedupeKey: 'inquiry-ack:inq-1'
  });
  assert.equal(result.status, 'sent');
  assert.equal(result.id, 'email_123');
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.headers['Idempotency-Key'], 'inquiry-ack:inq-1');
});

test('Resend failure surfaces a stable integration error', async () => {
  const service = createEmailService({
    config: config({ sendEnabled: true }),
    fetchImpl: async () => new Response(JSON.stringify({ name: 'daily_quota_exceeded' }), { status: 429 })
  });
  await assert.rejects(
    () => service.send({ to: 'visitor@example.test', subject: 'Test', text: 'Hello' }),
    (error) => error.code === 'RESEND_SEND_FAILED' && error.details.providerStatus === 429
  );
});

test('Resend webhook verification accepts a valid Svix signature and rejects tampering', async () => {
  const secret = `whsec_${Buffer.from('phase3-test-secret').toString('base64')}`;
  const service = createEmailService({ config: config({ webhookSecret: secret }) });
  const rawBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 'email_123' } });
  const id = 'msg_123';
  const timestamp = Math.floor(Date.now() / 1000);
  const keyBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`))).toString('base64');
  const event = await service.verifyWebhook({
    rawBody,
    headers: { 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${sig}` },
    secret
  });
  assert.equal(event.type, 'email.delivered');
  await assert.rejects(() => service.verifyWebhook({
    rawBody: rawBody.replace('delivered', 'bounced'),
    headers: { 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${sig}` },
    secret
  }), /signature/);
});
