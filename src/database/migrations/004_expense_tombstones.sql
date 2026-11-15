-- Migration 004 — Expense tombstones
-- Expenses become soft-deletable so a delete can propagate to other devices
-- instead of being resurrected from a stale local copy during pull.

ALTER TABLE expenses ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_expenses_user_deleted ON expenses(user_id, deleted_at);
