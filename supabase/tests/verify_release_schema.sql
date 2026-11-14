-- ============================================================
-- Read-only release schema verification (migrations 001–005).
--
-- Run in Supabase SQL Editor or:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verify_release_schema.sql
--
-- This file only SELECTs. It never writes, locks, or changes data.
-- Expected values are written above each query; compare them with the output.
-- ============================================================

-- 1) Every synced table exists with RLS enabled.
-- Expect: 12 rows, rls_enabled = true for all.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles', 'customers', 'services', 'appointments',
    'appointment_services', 'visits', 'visit_services', 'payments',
    'expenses', 'color_formulas', 'color_formula_items', 'customer_photos'
  )
order by 1;

-- 2) Soft-delete columns.
-- Expect 11 rows: the 12 synced tables except profiles.
-- customers/appointments/customer_photos come from 001, expenses from 002,
-- the remaining seven from 005.
select table_name
from information_schema.columns
where table_schema = 'public' and column_name = 'deleted_at'
order by 1;

-- 3) Keyset-pull indexes on (user_id, updated_at) from 002.
-- Expect 12 rows.
select indexname
from pg_indexes
where schemaname = 'public' and indexname ~ '_user_updated$'
order by 1;

-- 4) Tombstone indexes on (user_id, deleted_at).
-- Expect 8 rows: expenses (002) + the seven tables in 005.
-- customers, appointments, and customer_photos keep deleted_at without this
-- index on purpose: pull never filters on deleted_at, so the index is not
-- required for correctness.
select indexname
from pg_indexes
where schemaname = 'public' and indexname ~ '_user_deleted$'
order by 1;

-- 5) Owner-only table policies.
-- Expect 12 rows (one FOR ALL policy per synced table), all cmd = 'ALL'.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by 1, 2;

-- 6) Storage policies for the private photo bucket.
-- Expect at least the four policies created by 001 and 003 (select/insert/delete/update).
select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by 1;

-- 7) Composite ownership constraints from 004.
-- Expect 18 rows (5 unique (id, user_id) + 13 composite FKs), convalidated = false
-- until a deliberate VALIDATE CONSTRAINT after the legacy mismatch report is clean.
select conname, contype, convalidated
from pg_constraint
where conname ~ '(_same_user_fkey|_id_user_id_key)$'
order by 1;

-- 8) The signup trigger that creates the profile row.
-- Expect exactly 1 row.
select tgname
from pg_trigger
where tgname = 'on_auth_user_created' and not tgisinternal;

-- 9) The photo bucket must stay private.
-- Expect exactly 1 row with public = false.
select id, public
from storage.buckets
where id = 'customer-photos';
