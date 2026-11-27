const DATE_FIELDS = new Set([
  'created_at',
  'updated_at',
  'received_at',
  'captured_at',
  'expires_at',
  'start_utc',
  'end_utc',
  'next_attempt_at',
  'last_event_at',
  'sent_at'
]);

export const CRM_TABS = {
  Contacts: [
    'contact_id', 'full_name', 'email', 'phone', 'organization', 'role', 'locale',
    'timezone', 'source', 'created_at', 'updated_at'
  ],
  Inquiries: [
    'inquiry_id', 'contact_id', 'received_at', 'channel', 'inquiry_type', 'summary',
    'requested_service', 'budget_range', 'timeline', 'status', 'consent_id', 'source_url',
    'client_request_id', 'created_at', 'updated_at'
  ],
  Consent: [
    'consent_id', 'contact_id', 'scope', 'status', 'captured_at', 'expires_at', 'source',
    'evidence', 'created_at', 'updated_at'
  ],
  Appointments: [
    'appointment_id', 'inquiry_id', 'contact_id', 'start_utc', 'end_utc', 'timezone',
    'calendar_event_id', 'meet_link', 'status', 'status_detail', 'idempotency_key',
    'created_at', 'updated_at'
  ],
  'Email Log': [
    'email_id', 'contact_id', 'inquiry_id', 'appointment_id', 'kind', 'recipient_email',
    'status', 'provider', 'provider_message_id', 'dedupe_key', 'attempts', 'next_attempt_at',
    'last_event_at', 'created_at', 'updated_at'
  ],
  'Follow-ups': [
    'followup_id', 'inquiry_id', 'contact_id', 'due_at', 'channel', 'purpose', 'status',
    'completed_at', 'created_at', 'updated_at'
  ]
};

function iso(value) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

const FIELD_SOURCES = {
  Contacts: { contact_id: 'id' },
  Inquiries: { inquiry_id: 'id', received_at: 'created_at', channel: 'source' },
  Consent: { consent_id: 'id', created_at: 'captured_at', updated_at: 'captured_at' },
  Appointments: { appointment_id: 'id' },
  'Email Log': { email_id: 'id', recipient_email: 'to_email' },
  'Follow-ups': { followup_id: 'id' }
};

function valueFor(tab, field, row) {
  const direct = row[field];
  const source = direct !== undefined && direct !== null && direct !== '' ? field : (FIELD_SOURCES[tab]?.[field] || field);
  if (DATE_FIELDS.has(field)) return iso(row[source]);
  if (field === 'attempts') return String(Number(row.attempts || 0));
  return row[source] === null || row[source] === undefined ? '' : String(row[source]);
}

export function toSheetRow(tab, row) {
  const fields = CRM_TABS[tab];
  if (!fields) throw new Error(`Unknown CRM tab: ${tab}`);
  return fields.map((field) => valueFor(tab, field, row));
}

export function toSheetRows(tab, rows = []) {
  return rows.map((row) => toSheetRow(tab, row));
}

export function validateHeaders(tab, headers = []) {
  const expected = CRM_TABS[tab];
  if (!expected) return { ok: false, missing: [], extra: [], orderMismatch: false, error: 'UNKNOWN_TAB' };
  const missing = expected.filter((field) => !headers.includes(field));
  const extra = headers.filter((field) => !expected.includes(field));
  const orderMismatch = !missing.length && !extra.length && headers.some((field, index) => field !== expected[index]);
  return { ok: !missing.length && !extra.length && !orderMismatch, missing, extra, orderMismatch };
}

export function diffRows(tab, d1Rows = [], sheetRows = [], keyField) {
  const fields = CRM_TABS[tab];
  if (!fields) throw new Error(`Unknown CRM tab: ${tab}`);
  const key = keyField || fields[0];
  const keyIndex = fields.indexOf(key);
  const sheetByKey = new Map(sheetRows.map((row) => [String(row[keyIndex] ?? ''), row]));
  const changes = [];
  for (const d1 of d1Rows) {
    const expected = toSheetRow(tab, d1);
    const actual = sheetByKey.get(String(expected[keyIndex] ?? ''));
    if (!actual) {
      changes.push({ key: expected[keyIndex], type: 'missing_in_sheet' });
      continue;
    }
    const fieldsChanged = fields.filter((field, index) => expected[index] !== String(actual[index] ?? ''));
    if (fieldsChanged.length) changes.push({ key: expected[keyIndex], type: 'field_mismatch', fields: fieldsChanged });
    sheetByKey.delete(String(expected[keyIndex] ?? ''));
  }
  for (const [keyValue] of sheetByKey) changes.push({ key: keyValue, type: 'missing_in_d1' });
  return changes;
}
