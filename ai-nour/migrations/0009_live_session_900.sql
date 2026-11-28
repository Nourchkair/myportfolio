-- Default Live voice sessions to 15 minutes (the audio-only Live API maximum).
-- The application still enforces the configured maximum and spending caps.
INSERT INTO controls(key, value, updated_at)
VALUES ('live_session_seconds', '900', CAST(strftime('%s','now') AS INTEGER) * 1000)
ON CONFLICT(key) DO UPDATE SET value='900', updated_at=excluded.updated_at;
