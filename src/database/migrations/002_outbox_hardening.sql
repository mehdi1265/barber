-- Migration 002 — Harden the sync outbox
-- Adds lifecycle timestamps and an idempotency key so retries cannot
-- enqueue the same logical operation twice.
-- 001 is never edited; this migration is additive only.

ALTER TABLE sync_outbox ADD COLUMN processed_at TEXT;
ALTER TABLE sync_outbox ADD COLUMN last_attempt_at TEXT;
ALTER TABLE sync_outbox ADD COLUMN client_op_id TEXT;

-- SQLite allows multiple NULLs in a UNIQUE index, so pre-002 rows are fine.
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_client_op_id ON sync_outbox(client_op_id);

-- Sync engine polls pending/failed rows ordered by creation time.
CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON sync_outbox(status, created_at);
