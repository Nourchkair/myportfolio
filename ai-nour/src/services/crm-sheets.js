import { unavailable } from '../http/errors.js';
import { CRM_TABS, toSheetRow, validateHeaders } from './crm-sync.js';

const D1_TABLES = {
  Contacts: 'contacts',
  Inquiries: 'inquiries',
  Consent: 'consents',
  Appointments: 'bookings',
  'Email Log': 'email_jobs'
};

function columnLetter(index) {
  let value = index;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

export function createCrmSheetsService({ db, config, google }) {
  async function rowsFor(tab, limit = 5000) {
    if (tab === 'Contacts') return db.listContacts(limit);
    if (tab === 'Inquiries') return db.listInquiries({ limit });
    if (tab === 'Consent') return db.listAllConsents(limit);
    if (tab === 'Appointments') return db.listBookings(limit);
    if (tab === 'Email Log') return db.listEmailJobs(limit);
    return [];
  }

  async function sync({ now = Date.now(), limit = 5000 } = {}) {
    if (!config.google.crmSheetsSyncEnabled) throw unavailable('CRM Sheet synchronization is disabled');
    if (!config.google.configured || !google?.sheets) throw unavailable('Google Sheets is not configured');

    const results = [];
    for (const [tab, fields] of Object.entries(CRM_TABS)) {
      if (!D1_TABLES[tab]) {
        results.push({ tab, skipped: 'no_d1_table' });
        continue;
      }
      try {
        const existing = await google.sheets.values(`${tab}!A1:Z`);
        const header = (existing[0] || []).map(String);
        const headerCheck = validateHeaders(tab, header);
        if (!headerCheck.ok) {
          results.push({ tab, error: 'HEADER_MISMATCH', detail: headerCheck });
          continue;
        }
        const rowNumbers = new Map();
        for (let index = 1; index < existing.length; index += 1) {
          const key = String(existing[index][0] ?? '').trim();
          if (key) rowNumbers.set(key, index + 1);
        }
        const rows = await rowsFor(tab, limit);
        let inserted = 0;
        let updated = 0;
        let unchanged = 0;
        for (const row of rows) {
          const values = toSheetRow(tab, row);
          const key = String(values[0] ?? '').trim();
          if (!key) continue;
          const rowNumber = rowNumbers.get(key);
          if (!rowNumber) {
            await google.sheets.append(tab, values);
            inserted += 1;
            rowNumbers.set(key, -1);
            continue;
          }
          if (rowNumber === -1) continue;
          const current = (existing[rowNumber - 1] || []).map((value) => String(value ?? ''));
          const expected = values.map((value) => String(value ?? ''));
          const changed = fields.some((field, index) => current[index] !== expected[index]);
          if (!changed) {
            unchanged += 1;
            continue;
          }
          const range = `${tab}!A${rowNumber}:${columnLetter(values.length)}${rowNumber}`;
          await google.sheets.update(range, [values]);
          updated += 1;
        }
        results.push({ tab, rows: rows.length, inserted, updated, unchanged });
      } catch (error) {
        results.push({ tab, error: 'SYNC_FAILED', message: String(error?.message || error).slice(0, 240) });
      }
    }

    const failed = results.filter((item) => item.error).length;
    const summary = {
      syncedAt: now,
      ok: failed === 0,
      tabs: results,
      totals: results.reduce((total, item) => ({
        inserted: total.inserted + (item.inserted || 0),
        updated: total.updated + (item.updated || 0),
        unchanged: total.unchanged + (item.unchanged || 0)
      }), { inserted: 0, updated: 0, unchanged: 0 })
    };
    await db.logEvent({
      level: failed ? 'error' : 'info',
      event: 'crm.sheets.sync',
      detail: { ok: summary.ok, totals: summary.totals, tabs: results.map((item) => ({ tab: item.tab, error: item.error || null })) },
      now
    });
    return summary;
  }

  return { sync };
}
