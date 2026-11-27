CREATE TABLE IF NOT EXISTS beta_testers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS beta_testers_hash ON beta_testers(key_hash);
CREATE INDEX IF NOT EXISTS beta_testers_status ON beta_testers(status, created_at DESC);
