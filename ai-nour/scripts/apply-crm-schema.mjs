import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGoogleAuth } from '../src/integrations/google/auth.js';
import { createSheetsAdapter } from '../src/integrations/google/sheets.js';
import { CRM_TABS } from '../src/services/crm-sync.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const apply = process.argv.includes('--apply');
if (!env.GOOGLE_CRM_SPREADSHEET_ID) throw new Error('GOOGLE_CRM_SPREADSHEET_ID is required');
if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) throw new Error('Google OAuth credentials are incomplete');

const auth = createGoogleAuth({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  refreshToken: env.GOOGLE_REFRESH_TOKEN
});
const sheets = createSheetsAdapter({ auth, spreadsheetId: env.GOOGLE_CRM_SPREADSHEET_ID });
const token = await auth.tokenInfo();
console.log(JSON.stringify({ scopes: token.scopes, spreadsheet: Boolean(env.GOOGLE_CRM_SPREADSHEET_ID), apply }, null, 2));

const meta = await sheets.meta();
console.log('tabs:', meta.tabs.map((tab) => tab.title).join(', '));
const otherTabs = [];
for (const tab of meta.tabs.map((item) => item.title).filter((title) => !CRM_TABS[title])) {
  const rows = await sheets.values(`${tab}!A1:Z1`);
  otherTabs.push({ tab, headers: (rows[0] || []).map(String) });
}
console.log('unmanaged_tabs:', JSON.stringify(otherTabs));
const results = [];
for (const [tab, headers] of Object.entries(CRM_TABS)) {
  const existing = meta.tabs.find((item) => item.title === tab);
  if (!existing) {
    if (apply) {
      await sheets.addSheet(tab);
      await sheets.update(`${tab}!A1`, [headers]);
      results.push({ tab, action: 'created' });
    } else {
      results.push({ tab, action: 'would_create' });
    }
    continue;
  }
  const rows = await sheets.values(`${tab}!A1:Z1`);
  const current = (rows[0] || []).map(String);
  if (!current.some(Boolean)) {
    if (apply) {
      await sheets.update(`${tab}!A1`, [headers]);
      results.push({ tab, action: 'initialized' });
    } else {
      results.push({ tab, action: 'would_initialize' });
    }
  } else if (current.length === headers.length && current.every((value, index) => value === headers[index])) {
    results.push({ tab, action: 'headers_match' });
  } else {
    results.push({ tab, action: 'conflict', current });
  }
}
console.log(JSON.stringify(results, null, 2));

if (apply) {
  const after = await sheets.meta();
  const summary = [];
  for (const [tab, headers] of Object.entries(CRM_TABS)) {
    if (!after.tabs.some((item) => item.title === tab)) {
      summary.push({ tab, status: 'missing' });
      continue;
    }
    const rows = await sheets.values(`${tab}!A1:Z1`);
    const current = (rows[0] || []).map(String);
    summary.push({
      tab,
      status: current.length === headers.length && current.every((value, index) => value === headers[index]) ? 'verified' : 'header_mismatch'
    });
  }
  console.log(JSON.stringify({ applied: summary }, null, 2));
}
