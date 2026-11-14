-- 005_outbox_user_scope.sql
-- Queued operations are owned by the account that created them. Without this
-- column a pending row from account A could be pushed by account B's session
-- after a logout/login on the same device.
--
-- Existing rows get an empty owner. They are never selected, updated, or
-- pushed because every query requires user_id = the current account, so they
-- age out through pruneOutbox instead of leaking into another account.

ALTER TABLE sync_outbox ADD COLUMN user_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_outbox_user_status
  ON sync_outbox (user_id, status, created_at);
