-- ============================================================
-- Barber App — Supabase PostgreSQL Schema + RLS
-- Run this in Supabase SQL Editor (project dashboard)
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── profiles ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT NOT NULL,
  phone           TEXT,
  currency_code   TEXT NOT NULL DEFAULT 'IRR',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: owner only" ON public.profiles
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, display_name)
  VALUES (NEW.id, NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'آرایشگر'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── customers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_customers_user_id    ON public.customers(user_id);
CREATE INDEX idx_customers_user_name  ON public.customers(user_id, name);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers: owner only" ON public.customers
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── services ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.services (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                       TEXT NOT NULL,
  default_price              BIGINT,
  suggested_duration_minutes INTEGER,
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_services_user_id ON public.services(user_id);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services: owner only" ON public.services
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── appointments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id       UUID REFERENCES public.customers(id),
  title             TEXT NOT NULL,
  start_at          TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0),
  end_at            TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'reserved'
                    CHECK (status IN ('reserved','confirmed','completed','cancelled','no_show')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_appointments_user_id    ON public.appointments(user_id);
CREATE INDEX idx_appointments_user_start ON public.appointments(user_id, start_at);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments: owner only" ON public.appointments
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── appointment_services ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_services (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id        UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  service_id            UUID REFERENCES public.services(id),
  service_name_snapshot TEXT NOT NULL,
  price                 BIGINT NOT NULL DEFAULT 0,
  duration_minutes      INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appt_services: owner only" ON public.appointment_services
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── visits ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES public.customers(id),
  appointment_id  UUID REFERENCES public.appointments(id),
  is_quick_sale   BOOLEAN NOT NULL DEFAULT FALSE,
  visited_at      TIMESTAMPTZ NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_visits_user_id   ON public.visits(user_id);
CREATE INDEX idx_visits_user_date ON public.visits(user_id, visited_at);

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visits: owner only" ON public.visits
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── visit_services ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visit_services (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visit_id              UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  service_id            UUID REFERENCES public.services(id),
  service_name_snapshot TEXT NOT NULL,
  quantity              INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price            BIGINT NOT NULL DEFAULT 0,
  discount_amount       BIGINT NOT NULL DEFAULT 0,
  line_total            BIGINT NOT NULL DEFAULT 0,
  duration_minutes      INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.visit_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visit_services: owner only" ON public.visit_services
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── payments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visit_id    UUID NOT NULL REFERENCES public.visits(id),
  amount      BIGINT NOT NULL CHECK (amount > 0),
  method      TEXT NOT NULL DEFAULT 'cash'
              CHECK (method IN ('cash','card','other')),
  paid_at     TIMESTAMPTZ NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_user_date ON public.payments(user_id, paid_at);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments: owner only" ON public.payments
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── expenses ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  category    TEXT,
  amount      BIGINT NOT NULL CHECK (amount > 0),
  spent_at    TIMESTAMPTZ NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_user_date ON public.expenses(user_id, spent_at);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses: owner only" ON public.expenses
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── color_formulas ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.color_formulas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  brand               TEXT,
  color_code          TEXT,
  oxidant_type        TEXT,
  oxidant_percent     NUMERIC(5,2),
  mix_ratio           TEXT,
  processing_minutes  INTEGER,
  notes               TEXT,
  customer_id         UUID REFERENCES public.customers(id),
  visit_id            UUID REFERENCES public.visits(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.color_formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "color_formulas: owner only" ON public.color_formulas
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── color_formula_items ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.color_formula_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  formula_id    UUID NOT NULL REFERENCES public.color_formulas(id) ON DELETE CASCADE,
  product_name  TEXT NOT NULL,
  color_code    TEXT,
  amount        NUMERIC(8,2) NOT NULL CHECK (amount > 0),
  unit          TEXT NOT NULL DEFAULT 'g',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.color_formula_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "formula_items: owner only" ON public.color_formula_items
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── customer_photos ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_photos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES public.customers(id),
  visit_id      UUID REFERENCES public.visits(id),
  storage_path  TEXT,
  -- local_path is intentionally omitted from server schema
  photo_type    TEXT NOT NULL DEFAULT 'other'
                CHECK (photo_type IN ('before','after','other')),
  caption       TEXT,
  consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
ALTER TABLE public.customer_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photos: owner only" ON public.customer_photos
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Storage bucket ────────────────────────────────────────────
-- Run in Supabase dashboard → Storage → New Bucket
-- Name: customer-photos, Private: true
-- Or via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('customer-photos', 'customer-photos', false);

-- RLS for storage
CREATE POLICY "photos bucket: owner only - select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'customer-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "photos bucket: owner only - insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'customer-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "photos bucket: owner only - delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'customer-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','customers','services','appointments','appointment_services',
    'visits','visit_services','payments','expenses','color_formulas',
    'color_formula_items','customer_photos'
  ] LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON public.%s
       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()', t, t
    );
  END LOOP;
END $$;
