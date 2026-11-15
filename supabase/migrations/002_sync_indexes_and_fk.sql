-- Migration 002 — Sync indexes, expense tombstones, and FK delete policy
--
-- 1) Every synced table is pulled incrementally by `(user_id, updated_at)`,
--    so give the planner an index that matches that predicate.
-- 2) Expenses are soft-deletable on the device; mirror the column on the server.
-- 3) Replace implicit NO ACTION foreign keys with an explicit policy:
--    owned children cascade, optional references are nulled out.

-- ── Incremental pull indexes ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_user_updated            ON public.profiles(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_customers_user_updated           ON public.customers(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_services_user_updated            ON public.services(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_appointments_user_updated        ON public.appointments(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_appointment_services_user_updated ON public.appointment_services(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_visits_user_updated              ON public.visits(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_visit_services_user_updated      ON public.visit_services(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_payments_user_updated            ON public.payments(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_expenses_user_updated            ON public.expenses(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_color_formulas_user_updated      ON public.color_formulas(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_color_formula_items_user_updated ON public.color_formula_items(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_customer_photos_user_updated     ON public.customer_photos(user_id, updated_at);

-- ── Expense tombstones ───────────────────────────────────────
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_expenses_user_deleted ON public.expenses(user_id, deleted_at);

-- ── Foreign key policy ───────────────────────────────────────
-- Owned children: deleting the parent removes the children.
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_visit_id_fkey,
  ADD CONSTRAINT payments_visit_id_fkey
    FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;

-- Optional references: deleting the referenced row keeps the child.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_customer_id_fkey,
  ADD CONSTRAINT appointments_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.appointment_services
  DROP CONSTRAINT IF EXISTS appointment_services_service_id_fkey,
  ADD CONSTRAINT appointment_services_service_id_fkey
    FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;

ALTER TABLE public.visits
  DROP CONSTRAINT IF EXISTS visits_customer_id_fkey,
  ADD CONSTRAINT visits_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.visits
  DROP CONSTRAINT IF EXISTS visits_appointment_id_fkey,
  ADD CONSTRAINT visits_appointment_id_fkey
    FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;

ALTER TABLE public.visit_services
  DROP CONSTRAINT IF EXISTS visit_services_service_id_fkey,
  ADD CONSTRAINT visit_services_service_id_fkey
    FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;

ALTER TABLE public.color_formulas
  DROP CONSTRAINT IF EXISTS color_formulas_customer_id_fkey,
  ADD CONSTRAINT color_formulas_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.color_formulas
  DROP CONSTRAINT IF EXISTS color_formulas_visit_id_fkey,
  ADD CONSTRAINT color_formulas_visit_id_fkey
    FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;

ALTER TABLE public.customer_photos
  DROP CONSTRAINT IF EXISTS customer_photos_customer_id_fkey,
  ADD CONSTRAINT customer_photos_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.customer_photos
  DROP CONSTRAINT IF EXISTS customer_photos_visit_id_fkey,
  ADD CONSTRAINT customer_photos_visit_id_fkey
    FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;
