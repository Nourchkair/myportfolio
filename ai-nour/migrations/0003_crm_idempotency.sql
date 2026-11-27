PRAGMA foreign_keys = ON;

ALTER TABLE inquiries ADD COLUMN client_request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS inquiries_client_request
  ON inquiries(owner_hash, client_request_id) WHERE client_request_id IS NOT NULL;

ALTER TABLE bookings ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_idempotency
  ON bookings(owner_hash, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE bookings ADD COLUMN status_detail TEXT;
