-- 006_sync_cursor_user.sql
-- The pull cursor belongs to the account that produced it. When another account
-- signs in on the same device the stored cursor must be ignored, otherwise the
-- new account's first pull is truncated and remote history is never fetched.

ALTER TABLE sync_state ADD COLUMN cursor_user_id TEXT;
