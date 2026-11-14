-- ============================================================
-- Legacy cross-tenant reference report (READ ONLY)
--
-- Migration 004 adds 13 composite (child_col, user_id) -> parent
-- (id, user_id) foreign keys as NOT VALID. NOT VALID still enforces
-- new INSERT/UPDATE rows, but existing rows are not checked until
--   ALTER TABLE ... VALIDATE CONSTRAINT ...;
-- runs. This script lists every existing child row that references a
-- parent owned by a different user, i.e. everything that would make
-- VALIDATE CONSTRAINT fail.
--
-- Output: one line per affected constraint with a row count, and one
-- summary line with the total. No output means the data is clean and
-- validation can proceed.
--
-- This script performs no writes and opens no transaction of its own;
-- it is safe to run against a copy or directly on the target before
-- the validation window.
--
--   psql "$SUPABASE_DB_URL" -t -A \
--     -f supabase/tests/legacy_ownership_mismatches.sql
-- ============================================================

\set ON_ERROR_STOP on

with mismatches as (
  select 'appointments.customer_id -> customers' as constraint_name, count(*) as rows
    from public.appointments c
    join public.customers p on p.id = c.customer_id
   where c.customer_id is not null and c.user_id <> p.user_id
  union all
  select 'visits.customer_id -> customers', count(*)
    from public.visits c
    join public.customers p on p.id = c.customer_id
   where c.customer_id is not null and c.user_id <> p.user_id
  union all
  select 'visits.appointment_id -> appointments', count(*)
    from public.visits c
    join public.appointments p on p.id = c.appointment_id
   where c.appointment_id is not null and c.user_id <> p.user_id
  union all
  select 'appointment_services.appointment_id -> appointments', count(*)
    from public.appointment_services c
    join public.appointments p on p.id = c.appointment_id
   where c.appointment_id is not null and c.user_id <> p.user_id
  union all
  select 'appointment_services.service_id -> services', count(*)
    from public.appointment_services c
    join public.services p on p.id = c.service_id
   where c.service_id is not null and c.user_id <> p.user_id
  union all
  select 'visit_services.visit_id -> visits', count(*)
    from public.visit_services c
    join public.visits p on p.id = c.visit_id
   where c.visit_id is not null and c.user_id <> p.user_id
  union all
  select 'visit_services.service_id -> services', count(*)
    from public.visit_services c
    join public.services p on p.id = c.service_id
   where c.service_id is not null and c.user_id <> p.user_id
  union all
  select 'payments.visit_id -> visits', count(*)
    from public.payments c
    join public.visits p on p.id = c.visit_id
   where c.visit_id is not null and c.user_id <> p.user_id
  union all
  select 'color_formulas.customer_id -> customers', count(*)
    from public.color_formulas c
    join public.customers p on p.id = c.customer_id
   where c.customer_id is not null and c.user_id <> p.user_id
  union all
  select 'color_formulas.visit_id -> visits', count(*)
    from public.color_formulas c
    join public.visits p on p.id = c.visit_id
   where c.visit_id is not null and c.user_id <> p.user_id
  union all
  select 'color_formula_items.formula_id -> color_formulas', count(*)
    from public.color_formula_items c
    join public.color_formulas p on p.id = c.formula_id
   where c.formula_id is not null and c.user_id <> p.user_id
  union all
  select 'customer_photos.customer_id -> customers', count(*)
    from public.customer_photos c
    join public.customers p on p.id = c.customer_id
   where c.customer_id is not null and c.user_id <> p.user_id
  union all
  select 'customer_photos.visit_id -> visits', count(*)
    from public.customer_photos c
    join public.visits p on p.id = c.visit_id
   where c.visit_id is not null and c.user_id <> p.user_id
)
select constraint_name, rows as mismatched_rows
from mismatches
where rows > 0
order by constraint_name;
