import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGoogleAuth } from '../src/integrations/google/auth.js';
import { createSheetsAdapter } from '../src/integrations/google/sheets.js';
import { CRM_TABS } from '../src/services/crm-sync.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const readEnv = (file) => Object.fromEntries(fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const local = readEnv('.dev.vars');
const production = readEnv('.dev.vars.production');
const base = process.env.PRODUCTION_API_URL || 'https://api.nourchkair.com';
const stamp = Date.now();
const ids = {
  contact: `PROD-SYNC-CONTACT-${stamp}`,
  inquiry: `PROD-SYNC-INQUIRY-${stamp}`,
  consent: `PROD-SYNC-CONSENT-${stamp}`,
  booking: `PROD-SYNC-APPT-${stamp}`,
  email: `PROD-SYNC-EMAIL-${stamp}`
};
const syntheticEmail = 'synthetic.prod.sync@example.invalid';
const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });

function d1(sql) {
  return execFileSync('npx', ['--yes', 'wrangler', 'd1', 'execute', 'ai-nour-production', '--remote', '--config', 'wrangler.production.toml', '--json', '--command', sql], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000
  });
}

const insert = [
  `INSERT INTO contacts(id,owner_hash,full_name,email,phone,organization,role,locale,timezone,source,consent_status,created_at,updated_at) VALUES('${ids.contact}','prod-sync','Synthetic Production Sync','${syntheticEmail}',NULL,NULL,NULL,'en','America/Toronto','portfolio','granted',${stamp},${stamp})`,
  `INSERT INTO inquiries(id,owner_hash,contact_id,inquiry_type,summary,requested_service,budget_range,timeline,status,source,source_url,consent_id,client_request_id,created_at,updated_at) VALUES('${ids.inquiry}','prod-sync','${ids.contact}','consulting','Synthetic production Sheet synchronization validation.',NULL,NULL,NULL,'new','portfolio',NULL,'${ids.consent}','prod-sync-${stamp}',${stamp},${stamp})`,
  `INSERT INTO consents(id,contact_id,scope,status,captured_at,expires_at,source,evidence) VALUES('${ids.consent}','${ids.contact}','email','granted',${stamp},NULL,'portfolio','production synthetic validation')`,
  `INSERT INTO bookings(id,owner_hash,slot_key,start_utc,end_utc,status,calendar_event_id,meet_link,created_at,updated_at,inquiry_id,contact_id,timezone,idempotency_key,status_detail) VALUES('${ids.booking}','prod-sync','prod-sync-${stamp}',${stamp + 86_400_000},${stamp + 88_200_000},'confirmed',NULL,NULL,${stamp},${stamp},'${ids.inquiry}','${ids.contact}','America/Toronto','prod-sync-${stamp}','synthetic_validation')`,
  `INSERT INTO email_jobs(id,kind,to_email,subject,body,status,provider,inquiry_id,appointment_id,created_at,updated_at,dedupe_key,html,attempts,max_attempts,next_attempt_at,last_attempt_at,provider_message_id,delivered_at,bounced_at,complained_at,last_event_at) VALUES('${ids.email}','inquiry_acknowledgement','${syntheticEmail}','Synthetic production sync','Synthetic production sync body','dry_run','resend','${ids.inquiry}','${ids.booking}',${stamp},${stamp},'prod-sync-${stamp}',NULL,0,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL)`
].join(';\n');
d1(insert);
check('synthetic production CRM rows inserted', true, { ids });

async function admin(pathname, options = {}) {
  const response = await fetch(base + pathname, {
    ...options,
    headers: { authorization: `Bearer ${production.ADMIN_TOKEN}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  return { status: response.status, body };
}

const first = await admin('/api/admin/crm/sync', { method: 'POST', body: '{}' });
check('production Sheet sync completes', first.status === 200 && first.body.ok === true, { status: first.status, totals: first.body.totals, tabs: first.body.tabs?.map((item) => ({ tab: item.tab, error: item.error || null })) });
check('production sync inserts all five synthetic records', Number(first.body.totals?.inserted) >= 5, { totals: first.body.totals });

const second = await admin('/api/admin/crm/sync', { method: 'POST', body: '{}' });
check('production Sheet sync is idempotent', second.status === 200 && Number(second.body.totals?.inserted) === 0 && Number(second.body.totals?.updated) === 0, { status: second.status, totals: second.body.totals });

const auth = createGoogleAuth({
  clientId: local.GOOGLE_CLIENT_ID,
  clientSecret: local.GOOGLE_CLIENT_SECRET,
  refreshToken: local.GOOGLE_REFRESH_TOKEN
});
const sheets = createSheetsAdapter({ auth, spreadsheetId: local.GOOGLE_CRM_SPREADSHEET_ID });
const meta = await sheets.meta();
const matches = [];
for (const tab of Object.keys(CRM_TABS)) {
  if (!meta.tabs.some((item) => item.title === tab)) continue;
  const rows = await sheets.values(`${tab}!A1:Z`);
  const found = rows.slice(1).filter((row) => row.some((cell) => [ids.contact, ids.inquiry, ids.consent, ids.booking, ids.email, syntheticEmail].includes(String(cell || ''))));
  if (found.length) matches.push({ tab, count: found.length });
}
check('production Sheet contains the D1 contact', matches.some((item) => item.tab === 'Contacts' && item.count === 1), { matches });
check('production Sheet contains the D1 inquiry', matches.some((item) => item.tab === 'Inquiries' && item.count === 1), { matches });
check('production Sheet contains the D1 consent', matches.some((item) => item.tab === 'Consent' && item.count === 1), { matches });
check('production Sheet contains the D1 appointment', matches.some((item) => item.tab === 'Appointments' && item.count === 1), { matches });
check('production Sheet contains the D1 email job', matches.some((item) => item.tab === 'Email Log' && item.count === 1), { matches });

const cleanup = [];
for (const tab of Object.keys(CRM_TABS)) {
  if (!meta.tabs.some((item) => item.title === tab)) continue;
  const rows = await sheets.values(`${tab}!A1:Z`);
  const targets = [];
  for (let index = 1; index < rows.length; index += 1) {
    if ((rows[index] || []).some((cell) => [ids.contact, ids.inquiry, ids.consent, ids.booking, ids.email, syntheticEmail].includes(String(cell || '')))) targets.push(index);
  }
  for (const index of targets.sort((a, b) => b - a)) {
    const tabMeta = meta.tabs.find((item) => item.title === tab);
    await sheets.batchUpdate([{ deleteDimension: { range: { sheetId: tabMeta.sheetId, dimension: 'ROWS', startIndex: index, endIndex: index + 1 } } }]);
  }
  if (targets.length) cleanup.push({ tab, deleted: targets.length });
}
check('production Sheet synthetic rows cleaned up', cleanup.length === 5, { cleanup });

d1(`DELETE FROM email_jobs WHERE id='${ids.email}'; DELETE FROM bookings WHERE id='${ids.booking}'; DELETE FROM consents WHERE id='${ids.consent}'; DELETE FROM inquiries WHERE id='${ids.inquiry}'; DELETE FROM contacts WHERE id='${ids.contact}';`);
let remaining = 0;
for (const tab of Object.keys(CRM_TABS)) {
  if (!meta.tabs.some((item) => item.title === tab)) continue;
  const rows = await sheets.values(`${tab}!A1:Z`);
  remaining += rows.slice(1).filter((row) => row.some((cell) => [ids.contact, ids.inquiry, ids.consent, ids.booking, ids.email, syntheticEmail].includes(String(cell || '')))).length;
}
check('no production synthetic rows remain in the Sheet', remaining === 0, { remaining });

const output = {
  generatedAt: new Date().toISOString(),
  base,
  mode: 'production-D1-to-Google-Sheets/synthetic-cleanup',
  ids,
  first: first.body.totals,
  second: second.body.totals,
  matches,
  cleanup,
  passed: results.filter((item) => item.pass).length,
  failed: results.filter((item) => !item.pass).length,
  total: results.length,
  results
};
fs.writeFileSync(path.join(root, 'results/production-crm-sheet-sync.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (output.failed) process.exitCode = 1;
