-- Migration 005 — Tombstones for every synced table
--
-- Deletion reconciliation (D-46) pulls server `deleted_at` marks and
-- removes the matching local rows. `customers`, `appointments` and
-- `customer_photos` already carry the column from 001; `expenses` got it
-- in 002. The remaining seven syncable tables need the same tombstone
-- column, otherwise a delete on one device can never reach the others.
--
-- Indexes mirror the incremental-pull pattern `(user_id, updated_at)`
-- so a pull that filters tombstones never falls back to a table scan.
--
-- Safe to run more than once.

-- ── Tombstone columns ────────────────────────────────────────
ALTER TABLE public.services             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.appointment_services ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.visits               ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.visit_services       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.payments             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.color_formulas       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.color_formula_items  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── Tombstone indexes ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_services_user_deleted             ON public.services(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_appointment_services_user_deleted ON public.appointment_services(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_visits_user_deleted               ON public.visits(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_visit_services_user_deleted       ON public.visit_services(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_payments_user_deleted             ON public.payments(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_color_formulas_user_deleted       ON public.color_formulas(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_color_formula_items_user_deleted  ON public.color_formula_items(user_id, deleted_at);
