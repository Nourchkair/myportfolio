import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAuth } from '../src/integrations/google/auth.js';
import { createSheetsAdapter } from '../src/integrations/google/sheets.js';
import { createCalendarAdapter } from '../src/integrations/google/calendar.js';
import { createGmailAdapter } from '../src/integrations/google/gmail.js';
import { createDriveAdapter } from '../src/integrations/google/drive.js';
import { createGoogleServices } from '../src/integrations/google/index.js';

test('Google auth refreshes once and adds the bearer token', async () => {
  let tokenCalls = 0;
  const fetchImpl = async (url, options) => {
    if (url.includes('oauth2')) {
      tokenCalls++;
      return new Response(JSON.stringify({ access_token: `token-${tokenCalls}`, expires_in: 3600, scope: 'scope-a scope-b' }), { status: 200 });
    }
    assert.equal(options.headers.Authorization, 'Bearer token-1');
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const auth = createGoogleAuth({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetchImpl });
  const first = await auth.json('https://example.test/a');
  const second = await auth.json('https://example.test/b');
  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: true });
  assert.equal(tokenCalls, 1);
  const info = await auth.tokenInfo();
  assert.deepEqual(info.scopes, ['scope-a', 'scope-b']);
});

test('Google auth retries once after a 401', async () => {
  let tokenCalls = 0;
  let apiCalls = 0;
  const fetchImpl = async (url, options) => {
    if (url.includes('oauth2')) {
      tokenCalls++;
      return new Response(JSON.stringify({ access_token: `token-${tokenCalls}`, expires_in: 3600, scope: 'scope' }), { status: 200 });
    }
    apiCalls++;
    if (apiCalls === 1) return new Response('{}', { status: 401 });
    assert.equal(options.headers.Authorization, 'Bearer token-2');
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const auth = createGoogleAuth({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetchImpl });
  const result = await auth.json('https://example.test/a');
  assert.deepEqual(result, { ok: true });
  assert.equal(tokenCalls, 2);
  assert.equal(apiCalls, 2);
});

test('Sheets adapter reads metadata and appends a synthetic row', async () => {
  const calls = [];
  const auth = {
    json: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes('fields=properties.title')) return { properties: { title: 'AI Nour CRM' }, sheets: [{ properties: { title: 'Contacts', sheetId: 0 } }] };
      return { values: [['A'], ['B']] };
    }
  };
  const sheets = createSheetsAdapter({ auth, spreadsheetId: 'sheet-id' });
  const meta = await sheets.meta();
  assert.equal(meta.title, 'AI Nour CRM');
  assert.equal(meta.tabs[0].title, 'Contacts');
  await sheets.append('Contacts', ['P1', 'New']);
  const append = calls.find((call) => call.url.includes(':append'));
  assert.equal(append.options.method, 'POST');
  assert.deepEqual(JSON.parse(append.options.body).values[0], ['P1', 'New']);
});

test('Calendar adapter creates a no-attendee Meet event and cancels it', async () => {
  const calls = [];
  const auth = {
    json: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes('/events?')) return { id: 'evt-1', hangoutLink: 'https://meet.google.com/abc', start: {}, end: {} };
      return { summary: 'AI Nour - Appointments', timeZone: 'America/Toronto' };
    },
    request: async () => ({ status: 204 })
  };
  const calendar = createCalendarAdapter({ auth, calendarId: 'cal-id' });
  const event = await calendar.createEvent({
    summary: 'test', description: 'synthetic', start: '2026-12-01T15:00:00Z', end: '2026-12-01T15:15:00Z'
  });
  const createCall = calls.find((call) => call.url.includes('/events?'));
  const body = JSON.parse(createCall.options.body);
  assert.equal(body.attendees, undefined);
  assert.equal(body.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
  assert.equal(event.meetLink, 'https://meet.google.com/abc');
  assert.equal(await calendar.cancel('evt-1'), true);
});

test('Gmail adapter creates drafts and exposes no send method', async () => {
  let captured;
  const auth = {
    json: async (url, options = {}) => {
      captured = { url, body: JSON.parse(options.body) };
      return { id: 'draft-1', message: { id: 'msg-1', threadId: 'thread-1' } };
    },
    request: async () => ({ status: 204 })
  };
  const gmail = createGmailAdapter({ auth });
  const draft = await gmail.createDraft({ to: 'synthetic@example.invalid', subject: 'test', text: 'hello' });
  assert.equal(draft.id, 'draft-1');
  assert.match(captured.url, /\/drafts$/);
  assert.ok(captured.body.message.raw);
  assert.equal(typeof gmail.send, 'undefined');
  assert.equal(await gmail.deleteDraft('draft-1'), true);
});

test('Drive backup encryption round-trips without network access', async () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  const drive = createDriveAdapter({ auth: {}, backupKey: key });
  const plain = new TextEncoder().encode('synthetic backup');
  const encrypted = await drive.encryptBackup(plain);
  const decrypted = await drive.decryptBackup(encrypted);
  assert.equal(new TextDecoder().decode(decrypted), 'synthetic backup');
  assert.notDeepEqual(encrypted, plain);
});

test('Google services report not configured cleanly', async () => {
  const services = createGoogleServices({ google: { configured: false } });
  assert.equal(services.configured, false);
  const status = await services.status();
  assert.equal(status.configured, false);
  await assert.rejects(() => services.syntheticTest(), /not configured/);
});
