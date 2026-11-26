import fs from 'node:fs';
import { loadEnv, outputPath, requireEnv } from './env.mjs';

const apply = process.argv.includes('--apply');
const env = requireEnv(loadEnv(), ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_CRM_SPREADSHEET_ID']);
const schema = JSON.parse(fs.readFileSync(new URL('./crm-schema.json', import.meta.url), 'utf8'));
const spreadsheetId = encodeURIComponent(env.GOOGLE_CRM_SPREADSHEET_ID);

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
if (!tokenResponse.ok || !token.access_token) throw new Error(`Token refresh failed: HTTP ${tokenResponse.status}`);
const auth = { Authorization: `Bearer ${token.access_token}` };

async function get(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...auth, ...(options.headers || {}) } });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch {}
  return { status: response.status, ok: response.ok, json };
}

const meta = await get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`);
if (!meta.ok) throw new Error(`Spreadsheet read failed: HTTP ${meta.status}`);
const existingTabs = new Set((meta.json.sheets || []).map((sheet) => sheet.properties?.title));
const tabs = [];

for (const [tab, columns] of Object.entries(schema.tabs)) {
  const expected = columns.map((column) => column.name);
  if (!existingTabs.has(tab)) {
    tabs.push({ tab, status: 'missing_tab', expected });
    continue;
  }
  const current = await get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${tab}!1:1`)}`);
  const headers = (current.json.values || [])[0] || [];
  if (headers.length === 0) {
    if (apply) {
      const write = await get(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ majorDimension: 'ROWS', values: [expected] }) }
      );
      tabs.push({ tab, status: write.ok ? 'applied' : 'apply_failed', http: write.status, expected });
    } else {
      tabs.push({ tab, status: 'empty_ready_for_approval', expected });
    }
    continue;
  }
  const matches = headers.length === expected.length && headers.every((header, index) => header === expected[index]);
  tabs.push({ tab, status: matches ? 'ok' : 'mismatch', existing: headers, expected });
}

const output = {
  generatedAt: new Date().toISOString(),
  applied: apply,
  spreadsheetTitle: meta.json.properties?.title || null,
  tabs
};
fs.writeFileSync(outputPath('crm-schema-check.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (tabs.some((tab) => ['mismatch', 'missing_tab', 'apply_failed'].includes(tab.status))) process.exit(1);
