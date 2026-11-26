PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'auto',
  summary TEXT NOT NULL DEFAULT '',
  state_json TEXT NOT NULL DEFAULT '{}',
  turn_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS sessions_updated ON sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  locale TEXT,
  created_at INTEGER NOT NULL,
  token_count INTEGER,
  meta_json TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS messages_session_time ON session_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS messages_session_role ON session_messages(session_id, role);

CREATE TABLE IF NOT EXISTS action_ledger (
  action_key TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  start_utc INTEGER NOT NULL,
  end_utc INTEGER NOT NULL,
  status TEXT NOT NULL,
  calendar_event_id TEXT,
  meet_link TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_window ON bookings(start_utc, end_utc, status);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_slot
  ON bookings(slot_key) WHERE status = 'reserved';

CREATE TABLE IF NOT EXISTS ops_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  event TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ops_events_time ON ops_events(created_at DESC);

CREATE TABLE IF NOT EXISTS cost_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT UNIQUE,
  provider TEXT NOT NULL,
  model TEXT,
  capability TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  usd_micros INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cost_events_time ON cost_events(created_at DESC);

CREATE TABLE IF NOT EXISTS controls (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_overrides (
  chunk_id TEXT PRIMARY KEY,
  title TEXT,
  text TEXT,
  tags_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  updated_at INTEGER NOT NULL
);

INSERT INTO controls(key, value, updated_at) VALUES
  ('assistant_enabled', 'true', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('text_enabled', 'true', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('live_enabled', 'true', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('prototype_enabled', 'true', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('google_writes_enabled', 'false', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('persona_instruction', 'You are AI Nour, a concise, warm, commercially minded representation of Nour Chkair. Speak in the first person about yourself and in the third person about Nour. Be accurate, grounded, and never invent experience or projects. Keep spoken answers to one or two sentences and text answers focused. Respond in the visitor''s language.', CAST(strftime('%s','now') AS INTEGER) * 1000)
ON CONFLICT(key) DO NOTHING;

-- Carry forward the measured Phase 0A Gemini usage so the cumulative cap is honest.
INSERT INTO cost_events(request_id, provider, model, capability, input_tokens, output_tokens, usd_micros, created_at)
VALUES ('phase0a-carryover', 'gemini', 'phase0a-validation', 'carryover', 0, 0, 25213, CAST(strftime('%s','now') AS INTEGER) * 1000)
ON CONFLICT(request_id) DO NOTHING;
