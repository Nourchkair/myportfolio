import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGoogleAuth } from '../src/integrations/google/auth.js';
import { createSheetsAdapter } from '../src/integrations/google/sheets.js';
import { CRM_TABS, toSheetRow } from '../src/services/crm-sync.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const auth = createGoogleAuth({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  refreshToken: env.GOOGLE_REFRESH_TOKEN
});
const sheets = createSheetsAdapter({ auth, spreadsheetId: env.GOOGLE_CRM_SPREADSHEET_ID });
const meta = await sheets.meta();
const stamp = Date.now();
const synthetic = {
  Contacts: {
    id: `PHASE4-CONTACT-${stamp}`,
    full_name: 'Synthetic Phase 4 Contact',
    email: 'synthetic.phase4@example.invalid',
    phone: null,
    organization: null,
    role: null,
    locale: 'en',
    timezone: 'America/Toronto',
    source: 'synthetic',
    created_at: stamp,
    updated_at: stamp
  },
  Inquiries: {
    id: `PHASE4-INQUIRY-${stamp}`,
    contact_id: `PHASE4-CONTACT-${stamp}`,
    received_at: stamp,
    channel: 'portfolio',
    inquiry_type: 'general',
    summary: 'Synthetic Phase 4 sheet round-trip validation.',
    requested_service: null,
    budget_range: null,
    timeline: null,
    status: 'new',
    consent_id: `PHASE4-CONSENT-${stamp}`,
    source_url: null,
    client_request_id: `phase4-sheet-${stamp}`,
    created_at: stamp,
    updated_at: stamp
  },
  Consent: {
    id: `PHASE4-CONSENT-${stamp}`,
    contact_id: `PHASE4-CONTACT-${stamp}`,
    scope: 'store',
    status: 'granted',
    captured_at: stamp,
    expires_at: null,
    source: 'portfolio',
    evidence: 'Phase 4 synthetic validation',
    created_at: stamp,
    updated_at: stamp
  },
  Appointments: {
    id: `PHASE4-APPOINTMENT-${stamp}`,
    inquiry_id: `PHASE4-INQUIRY-${stamp}`,
    contact_id: `PHASE4-CONTACT-${stamp}`,
    start_utc: stamp + 86_400_000,
    end_utc: stamp + 88_200_000,
    timezone: 'America/Toronto',
    calendar_event_id: null,
    meet_link: null,
    status: 'calendar_pending',
    status_detail: 'synthetic_validation',
    idempotency_key: `phase4-sheet-appointment-${stamp}`,
    created_at: stamp,
    updated_at: stamp
  },
  'Email Log': {
    id: `PHASE4-EMAIL-${stamp}`,
    contact_id: `PHASE4-CONTACT-${stamp}`,
    inquiry_id: `PHASE4-INQUIRY-${stamp}`,
    appointment_id: null,
    kind: 'inquiry_acknowledgement',
    to_email: 'synthetic.phase4@example.invalid',
    status: 'dry_run',
    provider: 'resend',
    provider_message_id: null,
    dedupe_key: `phase4-sheet-email-${stamp}`,
    attempts: 0,
    next_attempt_at: null,
    last_event_at: null,
    created_at: stamp,
    updated_at: stamp
  },
  'Follow-ups': {
    id: `PHASE4-FOLLOWUP-${stamp}`,
    inquiry_id: `PHASE4-INQUIRY-${stamp}`,
    contact_id: `PHASE4-CONTACT-${stamp}`,
    due_at: stamp + 86_400_000,
    channel: 'email',
    purpose: 'Synthetic Phase 4 follow-up validation',
    status: 'pending',
    completed_at: null,
    created_at: stamp,
    updated_at: stamp
  }
};

const results = [];
for (const [tab, headers] of Object.entries(CRM_TABS)) {
  const tabMeta = meta.tabs.find((item) => item.title === tab);
  if (!tabMeta) {
    results.push({ tab, pass: false, error: 'TAB_MISSING' });
    continue;
  }
  const key = headers[0];
  const row = toSheetRow(tab, synthetic[tab] || { id: `PHASE4-${tab}-${stamp}` });
  const expectedKey = row[0];
  let startIndex = null;
  try {
    await sheets.append(tab, row);
    const values = await sheets.values(`${tab}!A1:Z`);
    const rowIndex = values.findIndex((item) => String(item[0] || '') === expectedKey);
    if (rowIndex < 0) throw new Error('APPENDED_ROW_NOT_FOUND');
    const actual = (values[rowIndex] || []).map(String);
    const mapped = row.map(String);
    const fields = headers.filter((field, index) => actual[index] !== mapped[index]);
    if (fields.length) throw new Error(`FIELD_MISMATCH:${fields.join(',')}`);
    startIndex = rowIndex;
    results.push({ tab, pass: true, key: expectedKey, fields: headers.length });
  } catch (error) {
    results.push({ tab, pass: false, error: String(error?.message || error).slice(0, 160) });
  } finally {
    if (startIndex !== null) {
      await sheets.batchUpdate([{
        deleteDimension: {
          range: { sheetId: tabMeta.sheetId, dimension: 'ROWS', startIndex, endIndex: startIndex + 1 }
        }
      }]);
      const after = await sheets.values(`${tab}!A1:Z`);
      const stillPresent = after.some((item) => String(item[0] || '') === expectedKey);
      if (stillPresent) results.push({ tab, pass: false, error: 'CLEANUP_FAILED' });
    }
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  mode: 'real-google-sheets/synthetic-row-cleanup',
  tabs: meta.tabs.map((tab) => tab.title),
  passed: results.filter((item) => item.pass).length,
  failed: results.filter((item) => !item.pass).length,
  total: results.length,
  results
};
fs.mkdirSync(path.join(root, 'results'), { recursive: true });
fs.writeFileSync(path.join(root, 'results/crm-sheet-live.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (output.failed) process.exitCode = 1;
