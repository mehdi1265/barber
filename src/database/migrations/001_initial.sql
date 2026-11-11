-- Migration 001 — Initial schema
-- All IDs are UUID (TEXT).
-- Timestamps are ISO-8601 strings stored as TEXT.
-- Monetary values are INTEGER (Iranian Toman × 100 to avoid float precision issues).
-- soft-delete via deleted_at column where needed.

PRAGMA foreign_keys = ON;

-- ── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id              TEXT PRIMARY KEY NOT NULL,
  user_id         TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  phone           TEXT,
  currency_code   TEXT NOT NULL DEFAULT 'IRR',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- ── customers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY NOT NULL,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_customers_user_id      ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_name    ON customers(user_id, name);
CREATE INDEX IF NOT EXISTS idx_customers_user_phone   ON customers(user_id, phone);

-- ── services ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id                        TEXT PRIMARY KEY NOT NULL,
  user_id                   TEXT NOT NULL,
  name                      TEXT NOT NULL,
  default_price             INTEGER,         -- Toman × 100
  suggested_duration_minutes INTEGER,
  is_active                 INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id);

-- ── appointments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                TEXT PRIMARY KEY NOT NULL,
  user_id           TEXT NOT NULL,
  customer_id       TEXT REFERENCES customers(id),
  title             TEXT NOT NULL,
  start_at          TEXT NOT NULL,
  duration_minutes  INTEGER NOT NULL CHECK(duration_minutes > 0),
  end_at            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'reserved'
                    CHECK(status IN ('reserved','confirmed','completed','cancelled','no_show')),
  notes             TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_appointments_user_id      ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user_start   ON appointments(user_id, start_at);

-- ── appointment_services ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment_services (
  id                      TEXT PRIMARY KEY NOT NULL,
  user_id                 TEXT NOT NULL,
  appointment_id          TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id              TEXT REFERENCES services(id),
  service_name_snapshot   TEXT NOT NULL,
  price                   INTEGER NOT NULL DEFAULT 0,
  duration_minutes        INTEGER,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_services_appt ON appointment_services(appointment_id);

-- ── visits ───────────────────────────────────────────────────────────────────
-- Unified table for walk-ins, appointment check-ins, and quick sales
CREATE TABLE IF NOT EXISTS visits (
  id              TEXT PRIMARY KEY NOT NULL,
  user_id         TEXT NOT NULL,
  customer_id     TEXT REFERENCES customers(id),
  appointment_id  TEXT REFERENCES appointments(id),
  is_quick_sale   INTEGER NOT NULL DEFAULT 0 CHECK(is_quick_sale IN (0,1)),
  visited_at      TEXT NOT NULL,
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visits_user_id    ON visits(user_id);
CREATE INDEX IF NOT EXISTS idx_visits_user_date  ON visits(user_id, visited_at);
CREATE INDEX IF NOT EXISTS idx_visits_customer   ON visits(customer_id);

-- ── visit_services ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visit_services (
  id                    TEXT PRIMARY KEY NOT NULL,
  user_id               TEXT NOT NULL,
  visit_id              TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  service_id            TEXT REFERENCES services(id),
  service_name_snapshot TEXT NOT NULL,
  quantity              INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  unit_price            INTEGER NOT NULL DEFAULT 0,
  discount_amount       INTEGER NOT NULL DEFAULT 0,
  line_total            INTEGER NOT NULL DEFAULT 0,  -- (quantity * unit_price) - discount_amount
  duration_minutes      INTEGER,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visit_services_visit ON visit_services(visit_id);

-- ── payments ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id          TEXT PRIMARY KEY NOT NULL,
  user_id     TEXT NOT NULL,
  visit_id    TEXT NOT NULL REFERENCES visits(id),
  amount      INTEGER NOT NULL CHECK(amount > 0),
  method      TEXT NOT NULL DEFAULT 'cash'
              CHECK(method IN ('cash','card','other')),
  paid_at     TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_user_id   ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_date ON payments(user_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_visit     ON payments(visit_id);

-- ── expenses ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY NOT NULL,
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  category    TEXT,
  amount      INTEGER NOT NULL CHECK(amount > 0),
  spent_at    TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id   ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, spent_at);

-- ── color_formulas ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS color_formulas (
  id                  TEXT PRIMARY KEY NOT NULL,
  user_id             TEXT NOT NULL,
  title               TEXT NOT NULL,
  brand               TEXT,
  color_code          TEXT,
  oxidant_type        TEXT,
  oxidant_percent     REAL,
  mix_ratio           TEXT,
  processing_minutes  INTEGER,
  notes               TEXT,
  customer_id         TEXT REFERENCES customers(id),
  visit_id            TEXT REFERENCES visits(id),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_color_formulas_user     ON color_formulas(user_id);
CREATE INDEX IF NOT EXISTS idx_color_formulas_customer ON color_formulas(customer_id);

-- ── color_formula_items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS color_formula_items (
  id            TEXT PRIMARY KEY NOT NULL,
  user_id       TEXT NOT NULL,
  formula_id    TEXT NOT NULL REFERENCES color_formulas(id) ON DELETE CASCADE,
  product_name  TEXT NOT NULL,
  color_code    TEXT,
  amount        REAL NOT NULL CHECK(amount > 0),
  unit          TEXT NOT NULL DEFAULT 'g',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_formula_items_formula ON color_formula_items(formula_id);

-- ── customer_photos ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_photos (
  id            TEXT PRIMARY KEY NOT NULL,
  user_id       TEXT NOT NULL,
  customer_id   TEXT REFERENCES customers(id),
  visit_id      TEXT REFERENCES visits(id),
  storage_path  TEXT,     -- remote Supabase Storage path
  local_path    TEXT,     -- local device path (NOT synced to server)
  photo_type    TEXT NOT NULL DEFAULT 'other'
                CHECK(photo_type IN ('before','after','other')),
  caption       TEXT,
  consent_given INTEGER NOT NULL DEFAULT 0 CHECK(consent_given IN (0,1)),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_photos_user     ON customer_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_customer ON customer_photos(customer_id);
CREATE INDEX IF NOT EXISTS idx_photos_visit    ON customer_photos(visit_id);

-- ── sync_outbox (local only — never synced) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_outbox (
  id            TEXT PRIMARY KEY NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  operation     TEXT NOT NULL CHECK(operation IN ('insert','update','delete')),
  payload       TEXT NOT NULL,  -- JSON
  created_at    TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','processing','done','failed'))
);
CREATE INDEX IF NOT EXISTS idx_outbox_status    ON sync_outbox(status);
CREATE INDEX IF NOT EXISTS idx_outbox_entity    ON sync_outbox(entity_type, entity_id);
