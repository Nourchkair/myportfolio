PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS action_ledger (
  action_key TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

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
  created_at INTEGER NOT NULL
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

CREATE TABLE IF NOT EXISTS cost_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  capability TEXT NOT NULL,
  usd_micros INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cost_events_time ON cost_events(created_at);

CREATE TABLE IF NOT EXISTS controls (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO controls(key, value, updated_at)
VALUES ('assistant_enabled', 'true', CAST(strftime('%s','now') AS INTEGER) * 1000)
ON CONFLICT(key) DO NOTHING;
