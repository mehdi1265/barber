-- ============================================================
-- Two-user RLS verification (manual, destructive-proof)
--
-- Proves that user A cannot read or write user B's rows, and
-- vice versa, for every synced table and the photo bucket.
--
-- The whole script runs inside a transaction and ends with
-- ROLLBACK, so probe rows never stay in the database.
--
-- Run with psql:
--   psql "$SUPABASE_DB_URL" \
--     -v email_a=a@example.com -v email_b=b@example.com \
--     -f supabase/tests/rls_two_user_check.sql
--
-- Both accounts must already exist in auth.users. Create them via
-- the app or the Supabase dashboard before running this script.
--
-- A successful run prints "RLS verification passed" and rolls back.
-- Any violation raises an exception and exits non-zero.
-- ============================================================
\set ON_ERROR_STOP on

begin;

select id as user_a
from auth.users
where email = :'email_a'
\gset

select id as user_b
from auth.users
where email = :'email_b'
\gset

-- ── Seed one row per table for each user (postgres bypasses RLS) ──
insert into public.profiles (id, user_id, display_name)
values (:'user_a', :'user_a', 'RLS A'),
       (:'user_b', :'user_b', 'RLS B')
on conflict (id) do nothing;

insert into public.customers (id, user_id, name, phone)
values ('00000000-0000-4000-8000-000000000001', :'user_a', 'RLS A customer', '09120000001'),
       ('00000000-0000-4000-8000-000000000002', :'user_b', 'RLS B customer', '09120000002');

insert into public.services (id, user_id, name, default_price)
values ('00000000-0000-4000-8000-000000000011', :'user_a', 'RLS A service', 100000),
       ('00000000-0000-4000-8000-000000000012', :'user_b', 'RLS B service', 200000);

insert into public.appointments
  (id, user_id, customer_id, title, start_at, duration_minutes, end_at)
values
  ('00000000-0000-4000-8000-000000000021', :'user_a',
   '00000000-0000-4000-8000-000000000001', 'RLS A appointment', now(), 30, now() + interval '30 minutes'),
  ('00000000-0000-4000-8000-000000000022', :'user_b',
   '00000000-0000-4000-8000-000000000002', 'RLS B appointment', now(), 30, now() + interval '30 minutes');

insert into public.appointment_services
  (id, user_id, appointment_id, service_id, service_name_snapshot, price)
values
  ('00000000-0000-4000-8000-000000000031', :'user_a',
   '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000011', 'RLS A service', 100000),
  ('00000000-0000-4000-8000-000000000032', :'user_b',
   '00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000012', 'RLS B service', 200000);

insert into public.visits (id, user_id, customer_id, appointment_id, visited_at)
values
  ('00000000-0000-4000-8000-000000000041', :'user_a',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000021', now()),
  ('00000000-0000-4000-8000-000000000042', :'user_b',
   '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000022', now());

insert into public.visit_services
  (id, user_id, visit_id, service_id, service_name_snapshot, unit_price, line_total)
values
  ('00000000-0000-4000-8000-000000000051', :'user_a',
   '00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000011', 'RLS A service', 100000, 100000),
  ('00000000-0000-4000-8000-000000000052', :'user_b',
   '00000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000012', 'RLS B service', 200000, 200000);

insert into public.payments (id, user_id, visit_id, amount, paid_at)
values ('00000000-0000-4000-8000-000000000061', :'user_a', '00000000-0000-4000-8000-000000000041', 100000, now()),
       ('00000000-0000-4000-8000-000000000062', :'user_b', '00000000-0000-4000-8000-000000000042', 200000, now());

insert into public.expenses (id, user_id, title, amount, spent_at)
values ('00000000-0000-4000-8000-000000000071', :'user_a', 'RLS A expense', 50000, now()),
       ('00000000-0000-4000-8000-000000000072', :'user_b', 'RLS B expense', 60000, now());

insert into public.color_formulas (id, user_id, title, customer_id, visit_id)
values ('00000000-0000-4000-8000-000000000081', :'user_a', 'RLS A formula',
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041'),
       ('00000000-0000-4000-8000-000000000082', :'user_b', 'RLS B formula',
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000042');

insert into public.color_formula_items (id, user_id, formula_id, product_name, amount)
values ('00000000-0000-4000-8000-000000000091', :'user_a', '00000000-0000-4000-8000-000000000081', 'RLS A product', 10),
       ('00000000-0000-4000-8000-000000000092', :'user_b', '00000000-0000-4000-8000-000000000082', 'RLS B product', 20);

insert into public.customer_photos (id, user_id, customer_id, visit_id, storage_path)
values ('00000000-0000-4000-8000-0000000000a1', :'user_a',
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041',
        :'user_a' || '/rls-a.jpg'),
       ('00000000-0000-4000-8000-0000000000a2', :'user_b',
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000042',
        :'user_b' || '/rls-b.jpg');

insert into storage.objects (id, bucket_id, name)
values (gen_random_uuid(), 'customer-photos', :'user_a' || '/rls-probe.txt'),
       (gen_random_uuid(), 'customer-photos', :'user_b' || '/rls-probe.txt');

-- IDs used by the write probes below.
create temp table _rls_probe on commit drop as
select :'user_a'::uuid as user_a,
       :'user_b'::uuid as user_b,
       '00000000-0000-4000-8000-000000000001'::uuid as customer_a,
       '00000000-0000-4000-8000-000000000041'::uuid as visit_a,
       '00000000-0000-4000-8000-000000000061'::uuid as payment_a,
       '00000000-0000-4000-8000-000000000071'::uuid as expense_a,
       '00000000-0000-4000-8000-000000000081'::uuid as formula_a,
       '00000000-0000-4000-8000-0000000000a1'::uuid as photo_a;

grant select on _rls_probe to authenticated;

-- ── User A: sees exactly one row per table, all owned by A ──
select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  t text;
  visible bigint;
  foreign_rows bigint;
begin
  foreach t in array array[
    'profiles', 'customers', 'services', 'appointments', 'appointment_services',
    'visits', 'visit_services', 'payments', 'expenses', 'color_formulas',
    'color_formula_items', 'customer_photos'
  ] loop
    execute format('select count(*) from public.%I', t) into visible;
    execute format('select count(*) from public.%I where user_id <> auth.uid()', t) into foreign_rows;
    if visible <> 1 then
      raise exception 'RLS check failed: user A sees % rows in % (expected 1)', visible, t;
    end if;
    if foreign_rows <> 0 then
      raise exception 'RLS check failed: user A sees % foreign rows in %', foreign_rows, t;
    end if;
  end loop;

  select count(*) into foreign_rows
  from storage.objects
  where bucket_id = 'customer-photos'
    and (storage.foldername(name))[1] <> auth.uid()::text;
  if foreign_rows <> 0 then
    raise exception 'RLS check failed: user A sees % foreign storage objects', foreign_rows;
  end if;
end $$;

-- ── User B: cannot see or modify A's rows ──
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_b from _rls_probe), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  n bigint;
  t text;
begin
  foreach t in array array[
    'profiles', 'customers', 'services', 'appointments', 'appointment_services',
    'visits', 'visit_services', 'payments', 'expenses', 'color_formulas',
    'color_formula_items', 'customer_photos'
  ] loop
    execute format('select count(*) from public.%I where user_id <> auth.uid()', t) into n;
    if n <> 0 then
      raise exception 'RLS check failed: user B sees % foreign rows in %', n, t;
    end if;
  end loop;

  select count(*) into n
  from storage.objects
  where bucket_id = 'customer-photos'
    and (storage.foldername(name))[1] <> auth.uid()::text;
  if n <> 0 then
    raise exception 'RLS check failed: user B sees % foreign storage objects', n;
  end if;

  update public.customers set name = name where id = (select customer_a from _rls_probe);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS check failed: user B updated A customer'; end if;

  delete from public.visits where id = (select visit_a from _rls_probe);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS check failed: user B deleted A visit'; end if;

  delete from public.payments where id = (select payment_a from _rls_probe);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS check failed: user B deleted A payment'; end if;

  update public.expenses set title = title where id = (select expense_a from _rls_probe);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS check failed: user B updated A expense'; end if;

  update public.color_formulas set title = title where id = (select formula_a from _rls_probe);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS check failed: user B updated A formula'; end if;

  update public.customer_photos set caption = caption where id = (select photo_a from _rls_probe);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS check failed: user B updated A photo'; end if;

  begin
    insert into public.customers (user_id, name)
    values ((select user_a from _rls_probe), 'RLS forbidden insert');
    raise exception 'RLS check failed: user B inserted a customer owned by A';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.visits (user_id, visited_at)
    values ((select user_a from _rls_probe), now());
    raise exception 'RLS check failed: user B inserted a visit owned by A';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name)
    values ('customer-photos', (select user_a::text from _rls_probe) || '/forbidden.txt');
    raise exception 'RLS check failed: user B wrote into A storage folder';
  exception
    when insufficient_privilege then null;
  end;
end $$;

\echo 'RLS verification passed'

rollback;
