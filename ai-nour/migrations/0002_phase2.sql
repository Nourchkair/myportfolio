PRAGMA foreign_keys = ON;

ALTER TABLE bookings ADD COLUMN inquiry_id TEXT;
ALTER TABLE bookings ADD COLUMN contact_id TEXT;
ALTER TABLE bookings ADD COLUMN timezone TEXT;

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  organization TEXT,
  role TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  timezone TEXT,
  source TEXT NOT NULL DEFAULT 'portfolio',
  consent_status TEXT NOT NULL DEFAULT 'none',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS contacts_owner ON contacts(owner_hash, updated_at DESC);
CREATE INDEX IF NOT EXISTS contacts_email ON contacts(email);

CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  inquiry_type TEXT NOT NULL DEFAULT 'general',
  summary TEXT NOT NULL,
  requested_service TEXT,
  budget_range TEXT,
  timeline TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'portfolio',
  source_url TEXT,
  consent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS inquiries_owner ON inquiries(owner_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS inquiries_status ON inquiries(status, created_at DESC);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'granted',
  captured_at INTEGER NOT NULL,
  expires_at INTEGER,
  source TEXT NOT NULL DEFAULT 'portfolio',
  evidence TEXT,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS consents_contact ON consents(contact_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS email_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT NOT NULL DEFAULT 'resend',
  inquiry_id TEXT,
  appointment_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sent_at INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS email_jobs_status ON email_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS live_tokens (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  session_id TEXT NOT NULL,
  reserved_usd_micros INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'held',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  reconciled_at INTEGER,
  reported_usd_micros INTEGER
);
CREATE INDEX IF NOT EXISTS live_tokens_owner ON live_tokens(owner_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS live_tokens_status ON live_tokens(status, expires_at);

INSERT INTO controls(key, value, updated_at) VALUES
  ('text_model', 'gemini-flash-lite-latest', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('live_model', 'gemini-3.8-live', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('live_voice', 'Aoede', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('email_provider', 'resend', CAST(strftime('%s','now') AS INTEGER) * 1000)
ON CONFLICT(key) DO NOTHING;

-- Carry forward measured Phase 1 usage so the cumulative evaluation ledger stays honest.
INSERT INTO cost_events(request_id, provider, model, capability, input_tokens, output_tokens, usd_micros, created_at)
VALUES ('phase1-carryover', 'gemini', 'phase1-validation', 'carryover', 0, 0, 9346, CAST(strftime('%s','now') AS INTEGER) * 1000)
ON CONFLICT(request_id) DO NOTHING;
