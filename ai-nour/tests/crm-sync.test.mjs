import test from 'node:test';
import assert from 'node:assert/strict';
import { CRM_TABS, diffRows, toSheetRows, validateHeaders } from '../src/services/crm-sync.js';

test('CRM sheet headers match the approved mapping order', () => {
  for (const [tab, fields] of Object.entries(CRM_TABS)) {
    assert.deepEqual(validateHeaders(tab, fields), {
      ok: true,
      missing: [],
      extra: [],
      orderMismatch: false
    }, tab);
  }
});

test('CRM rows are flattened to stable sheet values without duplicating contact data', () => {
  const rows = toSheetRows('Appointments', [{
    id: 'appointment-1',
    inquiry_id: 'inquiry-1',
    contact_id: 'contact-1',
    start_utc: 1_800_000_000_000,
    end_utc: 1_800_001_800_000,
    timezone: 'America/Toronto',
    calendar_event_id: 'event-1',
    meet_link: 'https://meet.google.com/test',
    status: 'confirmed',
    status_detail: 'calendar_confirmed',
    idempotency_key: 'booking-1',
    created_at: 1_799_000_000_000,
    updated_at: 1_799_000_000_000
  }]);
  assert.equal(rows[0][0], 'appointment-1');
  assert.match(rows[0][3], /^2027-/);
  assert.equal(rows[0].length, CRM_TABS.Appointments.length);
});

test('D1/Sheet reconciliation detects missing and changed rows', () => {
  const d1 = [{
    contact_id: 'contact-1',
    full_name: 'Synthetic Visitor',
    email: 'visitor@example.invalid',
    phone: null,
    organization: null,
    role: null,
    locale: 'en',
    timezone: 'America/Toronto',
    source: 'portfolio',
    created_at: 1_800_000_000_000,
    updated_at: 1_800_000_000_000
  }];
  const sheet = toSheetRows('Contacts', d1);
  assert.deepEqual(diffRows('Contacts', d1, sheet), []);
  sheet[0][1] = 'Changed Name';
  assert.deepEqual(diffRows('Contacts', d1, sheet), [{ key: 'contact-1', type: 'field_mismatch', fields: ['full_name'] }]);
  assert.deepEqual(diffRows('Contacts', d1, []), [{ key: 'contact-1', type: 'missing_in_sheet' }]);
});
