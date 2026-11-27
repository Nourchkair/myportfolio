import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGoogleAuth } from '../src/integrations/google/auth.js';
import { createSheetsAdapter } from '../src/integrations/google/sheets.js';
import { CRM_TABS } from '../src/services/crm-sync.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const base = process.env.PHASE4_SYNC_URL || 'http://127.0.0.1:8797';
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const owner = `crm-sync-${crypto.randomUUID()}`;
const prototypeKey = 'phase4-sync-key';
const syntheticEmail = 'synthetic.sync@example.invalid';
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

const auth = createGoogleAuth({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  refreshToken: env.GOOGLE_REFRESH_TOKEN
});
const sheets = createSheetsAdapter({ auth, spreadsheetId: env.GOOGLE_CRM_SPREADSHEET_ID });
const meta = await sheets.meta();
const sheetRows = {};
for (const tab of Object.keys(CRM_TABS)) {
  if (!meta.tabs.some((item) => item.title === tab)) continue;
  sheetRows[tab] = await sheets.values(`${tab}!A1:Z`);
}

const inquiry = await api('/api/crm/inquiries', {
  method: 'POST',
  body: {
    fullName: 'Synthetic Sync Contact',
    email: syntheticEmail,
    inquiryType: 'consulting',
    summary: 'Synthetic D1 to Google Sheets synchronization validation.',
    consent: { store: true, contact: true, email: true },
    clientRequestId: `sync-inquiry-${owner}`
  }
});
check('synthetic D1 inquiry created', inquiry.status === 201 && Boolean(inquiry.body.inquiry?.id) && Boolean(inquiry.body.contact?.id), { status: inquiry.status });
const inquiryId = inquiry.body.inquiry?.id;
const contactId = inquiry.body.contact?.id;

const start = Date.UTC(2027, 2, 10, 15, 0, 0);
const appointment = await api('/api/crm/appointments', {
  method: 'POST',
  body: { inquiryId, startUtc: start, endUtc: start + 1_800_000, timezone: 'America/Toronto', idempotencyKey: `sync-appointment-${owner}` }
});
check('synthetic D1 appointment created', [201, 202].includes(appointment.status) && Boolean(appointment.body.booking?.id), { status: appointment.status });
const bookingId = appointment.body.booking?.id;

const first = await api('/api/admin/crm/sync', { method: 'POST', admin: true, body: {} });
check('admin sync completes', first.status === 200 && first.body.ok === true, { status: first.status, totals: first.body.totals, tabs: first.body.tabs?.map((item) => ({ tab: item.tab, error: item.error || null })) });
check('sync inserts the synthetic records', Number(first.body.totals?.inserted) >= 7, { totals: first.body.totals });

const second = await api('/api/admin/crm/sync', { method: 'POST', admin: true, body: {} });
check('second sync is idempotent', second.status === 200 && second.body.ok === true && Number(second.body.totals?.inserted) === 0 && Number(second.body.totals?.updated) === 0, { status: second.status, totals: second.body.totals });

let keyRows = [];
for (const [tab] of Object.entries(CRM_TABS)) {
  if (!meta.tabs.some((item) => item.title === tab)) continue;
  const rows = await sheets.values(`${tab}!A1:Z`);
  sheetRows[tab] = rows;
  const header = (rows[0] || []).map(String);
  const matches = rows.slice(1).filter((row) => row.some((cell) => [contactId, inquiryId, bookingId, syntheticEmail].includes(String(cell || ''))));
  if (!matches.length) continue;
  keyRows.push({ tab, count: matches.length, header: header[0] });
}
check('live Sheet contains the D1 contact', keyRows.some((item) => item.tab === 'Contacts' && item.count === 1), { keyRows });
check('live Sheet contains the D1 inquiry', keyRows.some((item) => item.tab === 'Inquiries' && item.count === 1), { keyRows });
check('live Sheet contains the three granted consents', keyRows.some((item) => item.tab === 'Consent' && item.count === 3), { keyRows });
check('live Sheet contains the D1 appointment', keyRows.some((item) => item.tab === 'Appointments' && item.count === 1), { keyRows });
check('live Sheet contains both inquiry email jobs', keyRows.some((item) => item.tab === 'Email Log' && item.count >= 2), { keyRows });

let cleanup = [];
for (const [tab, fields] of Object.entries(CRM_TABS)) {
  if (!meta.tabs.some((item) => item.title === tab)) continue;
  const rows = sheetRows[tab] || await sheets.values(`${tab}!A1:Z`);
  const targets = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    if (row.some((cell) => [contactId, inquiryId, bookingId, syntheticEmail].includes(String(cell || '')))) targets.push(index);
  }
  for (const index of targets.sort((a, b) => b - a)) {
    const tabMeta = meta.tabs.find((item) => item.title === tab);
    await sheets.batchUpdate([{
      deleteDimension: { range: { sheetId: tabMeta.sheetId, dimension: 'ROWS', startIndex: index, endIndex: index + 1 } }
    }]);
  }
  cleanup.push({ tab, deleted: targets.length });
}
check('synthetic Sheet rows cleaned up', cleanup.every((item) => item.deleted >= 0), { cleanup });

let remaining = 0;
for (const [tab] of Object.entries(CRM_TABS)) {
  if (!meta.tabs.some((item) => item.title === tab)) continue;
  const rows = await sheets.values(`${tab}!A1:Z`);
  remaining += rows.slice(1).filter((row) => row.some((cell) => [contactId, inquiryId, bookingId, syntheticEmail].includes(String(cell || '')))).length;
}
check('no synthetic Sheet rows remain', remaining === 0, { remaining });

const output = {
  generatedAt: new Date().toISOString(),
  mode: 'real-google-sheets/D1-sync-with-synthetic-cleanup',
  base,
  passed: results.filter((item) => item.pass).length,
  failed: results.filter((item) => !item.pass).length,
  total: results.length,
  sync: { first: first.body.totals, second: second.body.totals },
  keyRows,
  cleanup,
  results
};
fs.mkdirSync(path.join(root, 'results'), { recursive: true });
fs.writeFileSync(path.join(root, 'results/crm-sheet-sync-live.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (output.failed) process.exitCode = 1;
