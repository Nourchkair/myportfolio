-- Public-beta spending and concurrency controls.
-- Additive only: no existing rows or tables are modified or deleted.

CREATE TABLE IF NOT EXISTS spend_reservations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'text',
  owner_hash TEXT,
  session_id TEXT,
  reserved_usd_micros INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'held',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  reconciled_at INTEGER,
  reported_usd_micros INTEGER
);
CREATE INDEX IF NOT EXISTS spend_reservations_status ON spend_reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS spend_reservations_owner ON spend_reservations(owner_hash, created_at DESC);
