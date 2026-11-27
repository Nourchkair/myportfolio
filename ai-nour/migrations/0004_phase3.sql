PRAGMA foreign_keys = ON;

-- Email delivery lifecycle, retries, provider tracking and duplicate protection.
ALTER TABLE email_jobs ADD COLUMN dedupe_key TEXT;
ALTER TABLE email_jobs ADD COLUMN html TEXT;
ALTER TABLE email_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 5;
ALTER TABLE email_jobs ADD COLUMN next_attempt_at INTEGER;
ALTER TABLE email_jobs ADD COLUMN last_attempt_at INTEGER;
ALTER TABLE email_jobs ADD COLUMN provider_message_id TEXT;
ALTER TABLE email_jobs ADD COLUMN delivered_at INTEGER;
ALTER TABLE email_jobs ADD COLUMN bounced_at INTEGER;
ALTER TABLE email_jobs ADD COLUMN complained_at INTEGER;
ALTER TABLE email_jobs ADD COLUMN last_event_at INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS email_jobs_dedupe
  ON email_jobs(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_jobs_due
  ON email_jobs(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS email_jobs_provider
  ON email_jobs(provider_message_id);

CREATE TABLE IF NOT EXISTS email_webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  email_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_webhook_events_email
  ON email_webhook_events(email_id, created_at DESC);
