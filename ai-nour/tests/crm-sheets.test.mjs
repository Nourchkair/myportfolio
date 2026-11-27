import test from 'node:test';
import assert from 'node:assert/strict';
import { CRM_TABS, toSheetRow } from '../src/services/crm-sync.js';
import { createCrmSheetsService } from '../src/services/crm-sheets.js';

function fakeSheets(seed = {}) {
  const tabs = {};
  for (const [tab, fields] of Object.entries(CRM_TABS)) {
    tabs[tab] = seed[tab] ? [fields, ...seed[tab]] : [fields];
  }
  return {
    tabs,
    async values(range) {
      const tab = range.split('!')[0];
      return (tabs[tab] || []).map((row) => [...row]);
    },
    async append(tab, row) {
      tabs[tab].push([...row]);
    },
    async update(range, rows) {
      const [, cell] = range.split('!');
      const rowNumber = Number(cell.match(/[A-Z]+(\d+)/)[1]);
      tabs[tabOf(range)][rowNumber - 1] = [...rows[0]];
    }
  };
}

function tabOf(range) {
  return range.split('!')[0];
}

function rows() {
  const now = 1_800_000_000_000;
  return {
    Contacts: [{
      id: 'contact-1', full_name: 'Synthetic Contact', email: 'synthetic@example.invalid',
      phone: null, organization: null, role: null, locale: 'en', timezone: 'America/Toronto',
      source: 'portfolio', created_at: now, updated_at: now
    }],
    Inquiries: [{
      id: 'inquiry-1', contact_id: 'contact-1', created_at: now, source: 'portfolio',
      inquiry_type: 'general', summary: 'Synthetic inquiry', status: 'new',
      consent_id: 'consent-1', updated_at: now
    }],
    Consent: [{
      id: 'consent-1', contact_id: 'contact-1', scope: 'email', status: 'granted',
      captured_at: now, source: 'portfolio', evidence: 'form-v1'
    }],
    Appointments: [{
      id: 'appointment-1', inquiry_id: 'inquiry-1', contact_id: 'contact-1',
      start_utc: now + 3_600_000, end_utc: now + 5_400_000, timezone: 'America/Toronto',
      calendar_event_id: 'event-1', meet_link: 'https://meet.google.com/test',
      status: 'confirmed', status_detail: 'calendar_confirmed', idempotency_key: 'booking-1',
      created_at: now, updated_at: now
    }],
    'Email Log': [{
      id: 'email-1', inquiry_id: 'inquiry-1', appointment_id: null,
      kind: 'inquiry_acknowledgement', to_email: 'synthetic@example.invalid',
      status: 'dry_run', provider: 'resend', provider_message_id: null,
      dedupe_key: 'email-1', attempts: 0, next_attempt_at: null, last_event_at: null,
      created_at: now, updated_at: now
    }]
  };
}

function serviceWith(sheet) {
  const data = rows();
  const db = {
    listContacts: async () => data.Contacts,
    listInquiries: async () => data.Inquiries,
    listAllConsents: async () => data.Consent,
    listBookings: async () => data.Appointments,
    listEmailJobs: async () => data['Email Log'],
    logEvent: async () => {}
  };
  return createCrmSheetsService({
    db,
    google: { sheets: sheet },
    config: { google: { configured: true, crmSheetsSyncEnabled: true } }
  });
}

test('CRM Sheet sync inserts, updates and then becomes idempotent', async () => {
  const staleContact = toSheetRow('Contacts', rows().Contacts[0]);
  staleContact[1] = 'Stale Name';
  const sheet = fakeSheets({ Contacts: [staleContact] });
  const service = serviceWith(sheet);

  const first = await service.sync({ now: 1 });
  assert.equal(first.ok, true);
  assert.equal(first.totals.inserted, 4);
  assert.equal(first.totals.updated, 1);
  assert.equal(sheet.tabs.Contacts[1][1], 'Synthetic Contact');
  assert.equal(sheet.tabs.Inquiries[1][0], 'inquiry-1');
  assert.equal(sheet.tabs.Consent[1][8], '2027-01-15T08:00:00.000Z');
  assert.equal(sheet.tabs.Appointments[1][0], 'appointment-1');
  assert.equal(sheet.tabs['Email Log'][1][5], 'synthetic@example.invalid');

  const second = await service.sync({ now: 2 });
  assert.equal(second.ok, true);
  assert.equal(second.totals.inserted, 0);
  assert.equal(second.totals.updated, 0);
  assert.equal(second.totals.unchanged, 5);
});

test('CRM Sheet sync refuses a tab with unexpected headers', async () => {
  const sheet = fakeSheets();
  sheet.tabs.Contacts[0] = ['wrong_header'];
  const service = serviceWith(sheet);
  const result = await service.sync({ now: 1 });
  assert.equal(result.ok, false);
  const contacts = result.tabs.find((item) => item.tab === 'Contacts');
  assert.equal(contacts.error, 'HEADER_MISMATCH');
  assert.equal(sheet.tabs.Contacts.length, 1);
});

test('CRM Sheet sync is disabled when configured off', async () => {
  const sheet = fakeSheets();
  const db = { logEvent: async () => {} };
  const service = createCrmSheetsService({
    db,
    google: { sheets: sheet },
    config: { google: { configured: true, crmSheetsSyncEnabled: false } }
  });
  await assert.rejects(() => service.sync({ now: 1 }), /disabled/);
});
