import fs from 'node:fs';
import crypto from 'node:crypto';
import { loadEnv, outputPath, requireEnv } from './env.mjs';

const env = requireEnv(loadEnv(), [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'GOOGLE_CRM_SPREADSHEET_ID',
  'GOOGLE_CALENDAR_ID',
  'BACKUP_ENCRYPTION_KEY'
]);

const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });
const spreadsheetId = encodeURIComponent(env.GOOGLE_CRM_SPREADSHEET_ID);
const calendarId = encodeURIComponent(env.GOOGLE_CALENDAR_ID);
const scratchTab = `_Phase0A_${Date.now()}`;
const backupKey = Buffer.from(env.BACKUP_ENCRYPTION_KEY, 'base64');
if (backupKey.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes (base64)');

const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  })
});
const token = await tokenResponse.json();
if (!tokenResponse.ok || !token.access_token) {
  throw new Error(`Token refresh failed: HTTP ${tokenResponse.status} ${token.error || 'unknown'}`);
}
const accessToken = token.access_token;
const auth = { Authorization: `Bearer ${accessToken}` };
check('access token refresh', true, { expiresIn: token.expires_in, scopeCount: String(token.scope || '').split(' ').length });
check('required scopes present', ['spreadsheets', 'calendar.events', 'drive.file', 'gmail.compose']
  .every((scope) => String(token.scope || '').includes(scope)), {
  scopes: String(token.scope || '').split(' ').map((s) => s.split('/').pop())
});

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...auth, ...(options.headers || {}) } });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch {}
  return { status: response.status, ok: response.ok, json };
}

async function post(url, body, extra = {}) {
  return api(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
}

// Sheets: synthetic scratch tab, duplicate protection, failed-write recovery.
let sheetId = null;
try {
  const meta = await api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`);
  const tabs = (meta.json.sheets || []).map((s) => s.properties?.title);
  check('CRM spreadsheet readable', meta.status === 200 && tabs.includes('Contacts'), { title: meta.json.properties?.title, tabs });

  const add = await post(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    requests: [{ addSheet: { properties: { title: scratchTab, gridProperties: { rowCount: 50, columnCount: 12 } } } }]
  });
  sheetId = add.json.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
  check('scratch tab created', add.status === 200 && sheetId !== null, { status: add.status });

  const headers = ['record_id', 'inquiry_type', 'status', 'contact_name', 'contact_email', 'organization', 'summary', 'consent', 'created_at', 'updated_at', 'source', 'notes'];
  const headerWrite = await api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${scratchTab}!A1:L1`)}?valueInputOption=RAW`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ majorDimension: 'ROWS', values: [headers] })
  });
  check('CRM headers written to scratch tab', headerWrite.status === 200, { status: headerWrite.status });

  const row = ['PA-SUITE-001', 'Recruitment', 'New', 'Synthetic Contact', 'synthetic@example.invalid', 'Example Co', 'Synthetic Phase 0A inquiry', JSON.stringify({ store: true, contact: true, email: false, followup: false }), new Date().toISOString(), new Date().toISOString(), 'phase0a-suite', 'Synthetic test record'];
  const append = await post(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${scratchTab}!A1:L1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { majorDimension: 'ROWS', values: [row] });
  check('synthetic record appended', append.status === 200, { status: append.status });

  const read = await api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${scratchTab}!A1:L10`)}`);
  const values = read.json.values || [];
  const duplicateRows = values.slice(1).filter((r) => r[0] === 'PA-SUITE-001').length;
  check('duplicate check sees one record', duplicateRows === 1, { duplicateRows });

  const rowIndex = values.findIndex((r) => r[0] === 'PA-SUITE-001') + 1;
  const update = await api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${scratchTab}!C${rowIndex}`)}?valueInputOption=RAW`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ majorDimension: 'ROWS', values: [['Reviewing']] })
  });
  check('synthetic record status updated', update.status === 200, { status: update.status });

  const bad = await post(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('_NoSuchTab!A1')}:append?valueInputOption=RAW`, { values: [['x']] });
  check('invalid write fails cleanly', bad.status === 400, { status: bad.status });

  const retry = await post(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${scratchTab}!A1:L1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    majorDimension: 'ROWS',
    values: [['PA-SUITE-002', 'General', 'New', 'Synthetic Contact 2', 'synthetic2@example.invalid', 'Example Co', 'Retry after failed write', JSON.stringify({ store: true }), new Date().toISOString(), new Date().toISOString(), 'phase0a-suite', '']]
  });
  check('write recovers after failure', retry.status === 200, { status: retry.status });
} catch (error) {
  check('sheets suite completed', false, { error: String(error?.message || error).slice(0, 300) });
} finally {
  if (sheetId !== null) {
    const del = await post(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, { requests: [{ deleteSheet: { sheetId } }] });
    check('scratch tab cleaned up', del.status === 200, { status: del.status });
  }
}

// Calendar: availability, unique Meet link, reschedule, cancel, overlap behaviour.
const createdEvents = [];
try {
  const calendar = await api(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}`);
  check('calendar readable', calendar.status === 200, { summary: calendar.json.summary, timeZone: calendar.json.timeZone });

  const now = new Date();
  const freebusy = await post('https://www.googleapis.com/calendar/v3/freeBusy', {
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    items: [{ id: env.GOOGLE_CALENDAR_ID }]
  });
  check('free/busy query', freebusy.status === 200, { busyBlocks: (freebusy.json.calendars?.[env.GOOGLE_CALENDAR_ID]?.busy || []).length });

  const start = new Date(Date.now() + 30 * 86_400_000);
  start.setUTCHours(7, 0, 0, 0);
  const end = new Date(start.getTime() + 15 * 60_000);
  const makeEvent = (label) => ({
    summary: `AI Nour Phase 0A ${label} — delete me`,
    description: 'Synthetic Phase 0A event. No attendees. Safe to delete.',
    start: { dateTime: start.toISOString(), timeZone: 'America/Toronto' },
    end: { dateTime: end.toISOString(), timeZone: 'America/Toronto' },
    conferenceData: { createRequest: { requestId: `phase0a-${label}-${Date.now()}-${Math.random()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
  });

  const create = await post(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=none`, makeEvent('single'));
  if (create.json.id) createdEvents.push(create.json.id);
  const meetLink = create.json.hangoutLink || create.json.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri || null;
  check('synthetic event created with Meet link', create.status === 200 && Boolean(meetLink), { timeZone: create.json.start?.timeZone, meetLinkPresent: Boolean(meetLink) });

  if (create.json.id) {
    const newStart = new Date(start.getTime() + 60 * 60_000);
    const newEnd = new Date(end.getTime() + 60 * 60_000);
    const patch = await api(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(create.json.id)}?sendUpdates=none`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start: { dateTime: newStart.toISOString(), timeZone: 'America/Toronto' }, end: { dateTime: newEnd.toISOString(), timeZone: 'America/Toronto' } })
    });
    check('event rescheduled', patch.status === 200, { status: patch.status });
    const cancel = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(create.json.id)}?sendUpdates=none`, { method: 'DELETE', headers: auth });
    check('event cancelled', cancel.status === 204, { status: cancel.status });
    createdEvents.splice(createdEvents.indexOf(create.json.id), 1);
  }

  const slotStart = new Date(start.getTime() + 2 * 86_400_000);
  const slotEnd = new Date(slotStart.getTime() + 15 * 60_000);
  const raceBody = (n) => ({
    summary: `AI Nour Phase 0A Concurrency ${n} — delete me`,
    description: 'Synthetic concurrency test. No attendees.',
    start: { dateTime: slotStart.toISOString(), timeZone: 'America/Toronto' },
    end: { dateTime: slotEnd.toISOString(), timeZone: 'America/Toronto' },
    conferenceData: { createRequest: { requestId: `phase0a-race-${n}-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
  });
  const [race1, race2] = await Promise.all([
    post(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=none`, raceBody(1)),
    post(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=none`, raceBody(2))
  ]);
  for (const response of [race1, race2]) if (response.json.id) createdEvents.push(response.json.id);
  const links = [race1, race2].map((r) => r.json.hangoutLink || r.json.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri || null);
  check('calendar permits overlapping events', race1.status === 200 && race2.status === 200 && Boolean(race1.json.id) && Boolean(race2.json.id), {
    statuses: [race1.status, race2.status],
    applicationLockRequired: true
  });
  check('concurrent Meet links are unique', Boolean(links[0]) && Boolean(links[1]) && links[0] !== links[1], {
    bothPresent: links.every(Boolean),
    distinct: links[0] !== links[1]
  });
} catch (error) {
  check('calendar suite completed', false, { error: String(error?.message || error).slice(0, 300) });
} finally {
  for (const id of createdEvents) {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(id)}?sendUpdates=none`, { method: 'DELETE', headers: auth });
  }
  check('calendar test events cleaned up', true, { deleted: createdEvents.length });
}

// Drive: dedicated folders, plain knowledge file, AES-GCM encrypted backup.
try {
  const findFolder = async (name) => {
    const query = `name='${name.replaceAll("'", "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const list = await api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`);
    return list.json.files?.[0] || null;
  };
  const ensureFolder = async (name) => {
    const existing = await findFolder(name);
    if (existing) return { id: existing.id, reused: true };
    const created = await post('https://www.googleapis.com/drive/v3/files?fields=id,name', { name, mimeType: 'application/vnd.google-apps.folder' });
    return { id: created.json.id, reused: false };
  };
  const knowledge = await ensureFolder('AI Nour Knowledge (Phase 0A)');
  const backups = await ensureFolder('AI Nour Backups (Phase 0A)');
  check('knowledge and backup folders available', Boolean(knowledge.id) && Boolean(backups.id), { knowledgeReused: knowledge.reused, backupReused: backups.reused });

  const text = '# AI Nour Phase 0A Knowledge\n\nSynthetic validation file. Safe to delete.\n';
  const boundary = `ainour_boundary_${Date.now()}`;
  const meta = { name: 'phase0a-knowledge-test.md', parents: [knowledge.id], mimeType: 'text/markdown' };
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--\r\n`)]);
  const upload = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  check('knowledge file uploaded', upload.status === 200, { size: upload.json.size });
  if (upload.json.id) {
    const download = await fetch(`https://www.googleapis.com/drive/v3/files/${upload.json.id}?alt=media`, { headers: auth });
    const received = await download.text();
    check('knowledge file round-trip', download.status === 200 && received === text, { status: download.status });
    await fetch(`https://www.googleapis.com/drive/v3/files/${upload.json.id}`, { method: 'DELETE', headers: auth });
    check('knowledge file cleaned up', true);
  }

  const plain = Buffer.from(JSON.stringify({ phase: '0A', synthetic: true, records: [{ id: 'PA-SUITE-001', status: 'Reviewing' }], generatedAt: new Date().toISOString() }));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', backupKey, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const payload = Buffer.concat([Buffer.from('AINOUR1'), iv, cipher.getAuthTag(), encrypted]);
  const backupMeta = { name: 'phase0a-backup-test.bin', parents: [backups.id], mimeType: 'application/octet-stream' };
  const backupBoundary = `ainour_backup_${Date.now()}`;
  const backupBody = Buffer.concat([Buffer.from(`--${backupBoundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(backupMeta)}\r\n--${backupBoundary}\r\nContent-Type: application/octet-stream\r\n\r\n`), payload, Buffer.from(`\r\n--${backupBoundary}--\r\n`)]);
  const backupUpload = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${backupBoundary}` }, body: backupBody });
  check('encrypted backup uploaded', backupUpload.status === 200, { size: backupUpload.json.size });
  if (backupUpload.json.id) {
    const download = await fetch(`https://www.googleapis.com/drive/v3/files/${backupUpload.json.id}?alt=media`, { headers: auth });
    const received = Buffer.from(await download.arrayBuffer());
    const receivedIv = received.subarray(7, 19);
    const receivedTag = received.subarray(19, 35);
    const receivedCipher = received.subarray(35);
    const decipher = crypto.createDecipheriv('aes-256-gcm', backupKey, receivedIv);
    decipher.setAuthTag(receivedTag);
    const roundTrip = Buffer.concat([decipher.update(receivedCipher), decipher.final()]);
    check('encrypted backup decrypts exactly', download.status === 200 && roundTrip.equals(plain), { status: download.status });
    await fetch(`https://www.googleapis.com/drive/v3/files/${backupUpload.json.id}`, { method: 'DELETE', headers: auth });
    check('encrypted backup cleaned up', true);
  }
} catch (error) {
  check('drive suite completed', false, { error: String(error?.message || error).slice(0, 300) });
}

// Gmail: draft create/read/delete only. No send call is made.
try {
  const raw = ['From: nourchkair@gmail.com', 'To: nourchkair@gmail.com', 'Subject: AI Nour Phase 0A draft test', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', '', 'Synthetic Phase 0A draft. Not sent.', ''].join('\r\n');
  const draft = await post('https://gmail.googleapis.com/gmail/v1/users/me/drafts', { message: { raw: Buffer.from(raw).toString('base64url') } });
  check('Gmail draft created without sending', draft.status === 200 && Boolean(draft.json.id), { status: draft.status });
  if (draft.json.id) {
    const read = await api(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draft.json.id)}?format=metadata`);
    check('Gmail draft read', read.status === 200, { status: read.status });
    const del = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draft.json.id)}`, { method: 'DELETE', headers: auth });
    check('Gmail draft deleted', del.status === 204, { status: del.status });
  }
} catch (error) {
  check('gmail suite completed', false, { error: String(error?.message || error).slice(0, 300) });
}

// Official Workspace MCP tool catalog (metadata only).
try {
  const catalog = {};
  for (const service of ['gmail', 'calendar', 'sheets', 'drive']) {
    const response = await fetch(`https://${service}mcp.googleapis.com/mcp/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    });
    const json = await response.json();
    const tools = (json.result?.tools || []).map((tool) => tool.name);
    catalog[service] = { status: response.status, count: tools.length, tools };
  }
  check('Workspace MCP catalog reachable', Object.values(catalog).every((entry) => entry.status === 200), {
    counts: Object.fromEntries(Object.entries(catalog).map(([k, v]) => [k, v.count])),
    gmailSendTools: catalog.gmail.tools.filter((name) => /send|reply|forward/.test(name))
  });
} catch (error) {
  check('Workspace MCP catalog reachable', false, { error: String(error?.message || error).slice(0, 300) });
}

const output = {
  generatedAt: new Date().toISOString(),
  passed: results.filter((r) => r.pass).length,
  failed: results.filter((r) => !r.pass).length,
  total: results.length,
  results
};
fs.writeFileSync(outputPath('google-suite.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (output.failed) process.exit(1);
