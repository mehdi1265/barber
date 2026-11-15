-- Migration 003 — Sync state
-- Single-row cursor for incremental pulls. Local only; never synced.

CREATE TABLE IF NOT EXISTS sync_state (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  last_pull_at   TEXT,
  device_id      TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO sync_state (id, schema_version) VALUES (1, 1);
