import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const base = process.env.PHASE2_CRM_GOOGLE_URL || 'http://127.0.0.1:8797';
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const owner = `crm-google-${crypto.randomUUID()}`;
const prototypeKey = 'phase2-crm-key';
const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });

async function api(pathname, { method = 'GET', body, admin = false } = {}) {
  const headers = { 'x-prototype-key': prototypeKey, 'x-owner-token': owner };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (admin) headers.authorization = `Bearer ${env.ADMIN_TOKEN}`;
  const response = await fetch(base + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch {}
  return { status: response.status, body: parsed };
}

async function accessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`token refresh HTTP ${response.status}`);
  return json.access_token;
}

async function calendarEvent(id, token) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  let body = {};
  try { body = await response.json(); } catch {}
  return { status: response.status, body };
}

const flag = await api('/api/admin/flags', { method: 'PATCH', admin: true, body: { flags: { google_writes_enabled: true } } });
check('Google writes enabled for synthetic test', flag.status === 200 && flag.body.flags.google_writes_enabled === true, { status: flag.status });

const start = Date.UTC(2027, 1, 15, 15, 0, 0);
const end = start + 30 * 60_000;
const inquiry = await api('/api/crm/inquiries', {
  method: 'POST',
  body: {
    fullName: 'Synthetic Google Appointment',
    email: 'synthetic.google@example.invalid',
    inquiryType: 'consulting',
    summary: 'Synthetic Phase 2 Google Calendar appointment validation.',
    consent: { store: true, contact: true, email: true },
    clientRequestId: 'crm-google-inquiry-1'
  }
});
check('synthetic inquiry created', inquiry.status === 201 && Boolean(inquiry.body.inquiry?.id), { status: inquiry.status });
const inquiryId = inquiry.body.inquiry?.id;

const appointment = await api('/api/crm/appointments', {
  method: 'POST',
  body: { inquiryId, startUtc: start, endUtc: end, timezone: 'America/Toronto', idempotencyKey: 'crm-google-appointment-1' }
});
check('Google appointment confirmed with Meet link', appointment.status === 201 && appointment.body.booking?.status === 'confirmed' && Boolean(appointment.body.booking?.meetLink) && Boolean(appointment.body.booking?.calendarEventId), {
  status: appointment.status,
  bookingStatus: appointment.body.booking?.status,
  meetLink: Boolean(appointment.body.booking?.meetLink)
});
const booking = appointment.body.booking;

let token;
try { token = await accessToken(); } catch {}
if (token && booking?.calendarEventId) {
  const event = await calendarEvent(booking.calendarEventId, token);
  check('calendar event exists', event.status === 200 && event.body.id === booking.calendarEventId, { status: event.status, timeZone: event.body.start?.timeZone });
  const attendeeEmails = (event.body.attendees || []).map((item) => item.email);
  check('calendar event invites only the consenting synthetic attendee', attendeeEmails.length === 1 && attendeeEmails[0] === 'synthetic.google@example.invalid', { attendees: attendeeEmails });
} else {
  check('calendar event verification skipped', false, { token: Boolean(token), eventId: Boolean(booking?.calendarEventId) });
}

const reschedule = await api(`/api/crm/appointments/${encodeURIComponent(booking.id)}/reschedule`, {
  method: 'POST',
  body: { startUtc: start + 3_600_000, endUtc: end + 3_600_000, timezone: 'America/Toronto' }
});
check('appointment rescheduled', reschedule.status === 200 && reschedule.body.booking?.startUtc === start + 3_600_000, { status: reschedule.status });
if (token && booking?.calendarEventId) {
  const event = await calendarEvent(booking.calendarEventId, token);
  check('calendar event moved', event.status === 200 && Date.parse(event.body.start?.dateTime) === start + 3_600_000, { status: event.status, start: event.body.start?.dateTime });
}

const cancel = await api(`/api/crm/appointments/${encodeURIComponent(booking.id)}/cancel`, { method: 'POST', body: {} });
check('appointment cancelled', cancel.status === 200 && cancel.body.booking?.status === 'cancelled', { status: cancel.status, bookingStatus: cancel.body.booking?.status });
if (token && booking?.calendarEventId) {
  const event = await calendarEvent(booking.calendarEventId, token);
  check('calendar event cancelled/deleted', [404, 410].includes(event.status) || event.body.status === 'cancelled', { status: event.status, calendarStatus: event.body.status });
}

const emailJobs = await api('/api/admin/email', { admin: true });
check('confirmation/reschedule/cancel email jobs queued', emailJobs.status === 200 && emailJobs.body.jobs?.length >= 3, { jobs: emailJobs.body.jobs?.length });

await api('/api/admin/flags', { method: 'PATCH', admin: true, body: { flags: { google_writes_enabled: false } } });

const output = {
  generatedAt: new Date().toISOString(),
  mode: 'real-google-calendar/synthetic-consenting-attendee',
  passed: results.filter((item) => item.pass).length,
  failed: results.filter((item) => !item.pass).length,
  total: results.length,
  results
};
fs.mkdirSync(path.join(root, 'results'), { recursive: true });
fs.writeFileSync(path.join(root, 'results/crm-google-tests.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (output.failed) process.exitCode = 1;
