-- Track active voice sessions independently from budget reservations so a
-- reported turn cannot release the concurrency guard while the Live socket is
-- still open. Additive only.

CREATE TABLE IF NOT EXISTS live_session_leases (
  session_id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  token_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS live_session_leases_owner ON live_session_leases(owner_hash, expires_at);
CREATE INDEX IF NOT EXISTS live_session_leases_expiry ON live_session_leases(expires_at);
