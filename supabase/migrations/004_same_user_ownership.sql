-- ============================================================
-- Same-user ownership for cross-table references
--
-- RLS already restricts every row to its owner, but a single-column
-- foreign key (visit_id, customer_id, …) only proves that the parent
-- row exists — not that it belongs to the same barber. Without this,
-- a signed-in user could attach their own child rows to another
-- barber's parent row (for example a payment pointing at a visit they
-- cannot read), which blocks the owner's deletes and pollutes sync.
--
-- Composite foreign keys on (parent_id, user_id) make that impossible.
-- They are added NOT VALID so existing rows are never rewritten or
-- rejected: the constraint is enforced for every new INSERT/UPDATE,
-- while old data stays untouched. Validate the constraints later with
--   ALTER TABLE … VALIDATE CONSTRAINT …
-- after repairing any legacy mismatches (query at the bottom).
--
-- Safe to run more than once.
-- ============================================================

-- ── Unique targets for the composite keys ─────────────────────
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('customers'), ('services'), ('appointments'), ('visits'),
      ('color_formulas')
    ) as t(tbl)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = spec.tbl || '_id_user_id_key'
    ) then
      execute format(
        'alter table public.%I add constraint %I unique (id, user_id)',
        spec.tbl, spec.tbl || '_id_user_id_key'
      );
    end if;
  end loop;
end $$;

-- ── Composite ownership foreign keys ──────────────────────────
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('appointments',        'customer_id',    'customers',      'appointments_customer_same_user_fkey'),
      ('visits',              'customer_id',    'customers',      'visits_customer_same_user_fkey'),
      ('visits',              'appointment_id', 'appointments',   'visits_appointment_same_user_fkey'),
      ('appointment_services','appointment_id', 'appointments',   'appointment_services_appointment_same_user_fkey'),
      ('appointment_services','service_id',     'services',       'appointment_services_service_same_user_fkey'),
      ('visit_services',      'visit_id',       'visits',         'visit_services_visit_same_user_fkey'),
      ('visit_services',      'service_id',     'services',       'visit_services_service_same_user_fkey'),
      ('payments',            'visit_id',       'visits',         'payments_visit_same_user_fkey'),
      ('color_formulas',      'customer_id',    'customers',      'color_formulas_customer_same_user_fkey'),
      ('color_formulas',      'visit_id',       'visits',         'color_formulas_visit_same_user_fkey'),
      ('color_formula_items', 'formula_id',     'color_formulas', 'color_formula_items_formula_same_user_fkey'),
      ('customer_photos',     'customer_id',    'customers',      'customer_photos_customer_same_user_fkey'),
      ('customer_photos',     'visit_id',       'visits',         'customer_photos_visit_same_user_fkey')
    ) as t(child, child_col, parent, name)
  loop
    if not exists (
      select 1 from pg_constraint where conname = spec.name
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I, user_id) references public.%I (id, user_id) not valid',
        spec.child, spec.name, spec.child_col, spec.parent
      );
    end if;
  end loop;
end $$;

-- Legacy mismatches (should return 0 rows on a clean project). If any
-- rows appear, they predate this migration: fix the reference or set
-- the child column to NULL before running VALIDATE CONSTRAINT.
--   select 'appointments' as tbl, count(*) from public.appointments c
--     join public.customers p on p.id = c.customer_id
--    where c.user_id <> p.user_id
--   union all … (same shape per constraint above);
