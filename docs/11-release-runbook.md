# Release & Operations Runbook

Operational checklist for shipping and recovering the barber app. The app is
offline-first: SQLite on the device is the working copy, Supabase is the shared
source of truth for sync and restore.

## 1. Secrets and session storage

- Supabase URL/key come from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  only. No credential is committed or baked into source.
- Native session storage uses the platform secure store
  (`@aparajita/capacitor-secure-storage`: Android Keystore-backed
  EncryptedSharedPreferences / iOS Keychain).
- Browser `localStorage` is a **development/test-only** fallback (D-21).
- The SQLite database is encrypted on native platforms; the browser build is
  intentionally unencrypted and must not hold real customer data.
- Keystores (`*.keystore`, `*.jks`) and `keystore.properties` are gitignored.

## 2. Supabase migrations

`VITE_SUPABASE_ANON_KEY` must be the project's **publishable** key
(`sb_publishable_…`). `VITE_SUPABASE_URL` must be the project origin
(`https://<ref>.supabase.co`) — not the REST endpoint
(`https://<ref>.supabase.co/rest/v1/`), which breaks Auth and every sync call.
The app refuses to start with a `/rest/v1` URL. It is a client credential: it
can run the app and the RLS probes, but it cannot run DDL or migrations. Do not
put it in `SUPABASE_DB_URL`.

Apply `supabase/migrations/*.sql` in order using one of:

- **SQL editor:** open Dashboard → SQL Editor, paste `001`, run; repeat for
  `002`, `003`, and `004`. Run the whole file in one session so the transaction
  and policies apply together.
- **CLI:** `npx supabase login` (or export `SUPABASE_ACCESS_TOKEN`), then
  `npx supabase link --project-ref <ref>` and `npx supabase db push`. The CLI
  asks for the database password once; it is not the anon/publishable key.
- **psql:** connect with the pooled connection string from Dashboard →
  Database → Connection string (`postgresql://postgres.<ref>:<password>@…`)
  and run each file with `psql "$SUPABASE_DB_URL" -f supabase/migrations/001_initial_schema.sql`.

> **Not yet applied anywhere.** Migration `004_same_user_ownership.sql` was
> written and reviewed locally but has **not** been run on Production, Staging,
> or any hosted project. Applying it is a release-operator action. It is
> data-preserving: composite FKs are added `NOT VALID` (existing rows are not
> rewritten or rejected), and every constraint is guarded by a `pg_constraint`
> check so a second run is a no-op. See §3.5.

Every migration is re-runnable:

- tables use `IF NOT EXISTS`, indexes use `IF NOT EXISTS`;
- triggers are recreated with `DROP TRIGGER IF EXISTS` / `CREATE OR REPLACE`;
- every policy is preceded by `DROP POLICY IF EXISTS` (or guarded by a
  `duplicate_object` handler);
- the private `customer-photos` bucket is inserted with
  `ON CONFLICT (id) DO NOTHING`;
- migration `004` creates uniques/foreign keys only when `pg_constraint` does
  not already contain them.

Run the same four files a second time on the same project; a clean run with
no errors is the idempotency check. `src/tests/unit/supabase-migrations.test.ts`
enforces the patterns in CI.

## 3. RLS verification matrix

Policies are owner-only (`auth.uid() = user_id`) on every table, and the storage
policy matches the first path folder to `auth.uid()`.

| Object                     | User A sees     | User B sees | B updates/deletes A | B inserts owned by A |
| -------------------------- | --------------- | ----------- | ------------------- | -------------------- |
| `profiles`                 | own row only    | 0 rows      | denied              | denied               |
| `customers`                | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `services`                 | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `appointments`             | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `appointment_services`     | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `visits`                   | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `visit_services`           | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `payments`                 | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `expenses`                 | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `color_formulas`           | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `color_formula_items`      | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `customer_photos`          | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `storage.objects` (bucket) | own folder only | 0 objects   | 0 rows (UPDATE)     | `42501`              |

Storage UPDATE is exercised separately: A updates its own object (1 row), B's
UPDATE of A's object affects 0 rows, B cannot move an object into A's folder,
and an anonymous session updates 0 objects.

Execute the automated two-user probe on a **separate Staging project**, never
on Production.

### 3.0 Zero-setup policy check (CI)

The `rls-postgres` job in `.github/workflows/ci.yml` runs on every push. It
starts a throwaway `postgres:15` container, loads
`supabase/tests/postgres_bootstrap.sql` (minimal stand-ins for `auth.uid()`,
`auth.users`, and `storage.*`), applies every file in `supabase/migrations/`
**twice** to prove idempotency, runs the read-only legacy-ownership report,
seeds two identities, and runs `supabase/tests/rls_two_user_check.sql` inside a
transaction that rolls back. It needs no Supabase project, no secrets, and
cannot reach Production. It validates the policies themselves and migration
idempotency, not the PostgREST/Storage API wiring — use §3.2/§3.3 for the
end-to-end probe.

The migration loop is directory-driven (`ls supabase/migrations/*.sql | sort`),
so a new Supabase migration is picked up automatically and cannot be omitted.
The **client-side SQLite** set (`src/database/migrations/001`–`006`) is not
applied by Postgres; `npm test` applies all six through the migration runner
(`outbox.integration.test.ts` asserts versions `1..6` after two runs) and
`sqlite-migrations.test.ts` fails if a file or its runner import is missing.

If the job is green, the DB-level isolation (“each barber only sees own rows”)
is proven automatically on every commit. Creating a Staging project is only
required for the full HTTP-level probe.

> **Last green run (verified via the GitHub API):**
> [43456745065](https://github.com/mehdi1265/barber/actions/runs/43456745065)
> at `28da1dd`, both jobs `success`, including the “Apply migrations twice
> (idempotency)” and “Two-user RLS check” steps. That run used the **previous**
> workflow: it hardcoded `001`–`003`, had no migration 004, no legacy-mismatch
> gate, and the older SQL assertions. It is therefore not evidence for the
> current changes. Because the script uses `ON_ERROR_STOP`, any failure fails
> the job.
>
> **Current assertions in `rls_two_user_check.sql`:**
>
> - user A sees exactly one own row in all 12 tables and no foreign storage
>   object, and can INSERT, UPDATE **and DELETE** its own storage object;
> - user B sees 0 foreign rows in all 12 tables, and a generic UPDATE and
>   DELETE against foreign rows affects 0 rows in every table;
> - user B cannot UPDATE or DELETE A's storage object, nor move an owned
>   object into A's folder;
> - user B cannot link `appointment_services` to A's appointment or a payment
>   to A's visit (`foreign_key_violation` from the composite keys);
> - user B cannot INSERT rows owned by A (`42501`) or write into A's folder;
> - an anonymous session sees 0 rows/objects and its UPDATE, DELETE and
>   INSERT attempts are rejected;
> - after `ROLLBACK` the script re-checks all 22 probe IDs across 11 tables and
>   every probe storage path and fails if anything survived.
>
> **Not yet executed.** This Windows environment has no Docker, `psql`,
> PostgreSQL binaries, or Supabase CLI, so migration 004 and the expanded SQL
> were **not run locally**. No GitHub run exists for this revision. The
> assertions take effect on the next push/PR that reaches `rls-postgres`;
> until that run is green, treat 004 and these statements as
> reviewed-but-unverified. Do not infer a CI pass from this document.

### 3.1 Staging project

1. Supabase Dashboard → **New project**: name it `barber-staging`, pick the
   region closest to you, generate a strong database password and store it in a
   password manager. The Free plan is enough; note that it pauses after a week
   of inactivity.
2. **Settings → General** → copy the **Reference ID** (the `<ref>` in
   `https://<ref>.supabase.co`). It is not a secret, but it must differ from the
   Production ref.
3. **Settings → API** → copy the **Project URL** and the **publishable key**
   (`sb_publishable_…`). Never copy the `sb_secret_…`/service-role key.
4. **Authentication → Providers → Email**: keep it enabled and keep
   confirmation ON to match Production.
5. **Authentication → URL Configuration**: Site URL `http://localhost:5173`,
   redirect URLs `http://localhost:5173/reset-password` and
   `barberapp://reset-password` (only needed if you also smoke-test the app
   against Staging).
6. Run `001`, `002`, `003`, `004` in the SQL Editor in that order (each
   filename in full, expect “Success. No rows returned”), then **run all four a
   second time** — this second run is the live idempotency proof and does not
   touch Production.
7. Verify with SQL: all 12 tables exist with `rowsecurity = true`, and
   `select id, public from storage.buckets where id = 'customer-photos'` returns
   `customer-photos | false`.
8. **Authentication → Users → Add user → Create new user** twice, ticking
   **Auto Confirm User** for both. Use Staging-only addresses (e.g. plus
   aliases), never the owner account.

Production and Staging are isolated automatically: separate databases, Auth
users, storage buckets, and API keys. The app continues to read `.env.local`
(Production); only the RLS runner reads `.env.rls.local`.

### 3.2 Staging credentials and the safety guard

Create `<repo>/.env.rls.local` (gitignored by `.env.*.local`). It **overrides**
the Production URL/key from `.env.local` for the runner only:

```bash
VITE_SUPABASE_URL=https://<staging-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_…
RLS_STAGING_PROJECT_REF=<staging-ref>
RLS_PRODUCTION_PROJECT_REF=<production-ref>
RLS_USER_A_EMAIL=a@example.com
RLS_USER_A_PASSWORD='…'
RLS_USER_B_EMAIL=b@example.com
RLS_USER_B_PASSWORD='…'
```

The runner merges `.env.local` → `.env.rls.local` → process environment. Do not
export `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` in the shell: process
environment wins over both files. **Both** `RLS_STAGING_PROJECT_REF` and
`RLS_PRODUCTION_PROJECT_REF` are mandatory; the runner aborts before any
request when either is missing, when the URL cannot be resolved to a hosted
project ref, when the ref equals the declared Production ref, or when it does
not equal `RLS_STAGING_PROJECT_REF`. There is no fallback or ref guessing. The
guard line `staging guard OK: project ref …` is the confirmation that the
probes target Staging.

Never put Staging values in `.env.local` or Production values in
`.env.rls.local`.

### 3.3 Running the probe

The probe signs in through the public Auth API and checks PostgREST and Storage
exactly as the app does. For all 12 tables it seeds a marker-prefixed row,
verifies that user B cannot SELECT, UPDATE, or DELETE it, and additionally
probes forbidden inserts plus storage read/write denial:

```bash
npm run rls:check -- --preflight                    # guards + key + schema + sign-ins, writes nothing
npm run rls:check -- --confirm-ref="$RLS_STAGING_PROJECT_REF" --out supabase/tests/rls-verification.log
```

Writes require `--confirm-ref=<exact-staging-ref>` on the same invocation and
the ref must match; the confirmation is never persisted. `--preflight` aborts
with a clear hint when a guard fails, an account is unconfirmed, both variables
resolve to the same user, or the signup trigger left a user without a
`profiles` row. Only the confirmed command writes probe data.

Cleanup is part of the run and now verified: every probe ID is re-read after
deletion, the two storage paths are re-checked, and A's profile row must still
exist. Any remaining row or object is reported as `FAIL` and exits non-zero;
the log prints `cleanup verified: no probe rows remain in 11 tables` and
`storage cleanup verified: no probe objects remain`.

The runner refuses to print secrets and aborts with a clear message when the
key is malformed, the schema is missing, or an account is not confirmed. The
saved log masks account addresses (`b***@example.com`) and keeps only eight
characters of each user ID. `*.log` is gitignored: keep the report out of Git
and attach it to the release ticket or store it in the team’s secure channel.

**psql alternative (needs `SUPABASE_DB_URL` with the database password):**

```bash
psql "$SUPABASE_DB_URL" \
  -v email_a=a@example.com -v email_b=b@example.com \
  -f supabase/tests/rls_two_user_check.sql
```

It seeds one row per table per user inside a transaction, checks both
directions, exercises the storage UPDATE policy (A updates own object; B and
anonymous affect 0 rows), verifies that composite ownership FKs reject
cross-account child rows, prints `RLS verification passed`, then rolls back.

> **Status: Production is not a test target.** Production has `001`–`003`
> applied and verified read-only (`profiles`, `customers`, `expenses`,
> `customer_photos` return `200 []` for anon), and **no probe has been run
> there**. **Migration 004 is not applied anywhere.** The release decision on
> 2026-11-13 was **not to create a hosted Staging project**: database-level
> isolation is proven in CI (§3.0). Sections 3.1–3.3 remain valid if a hosted
> REST/Storage probe is later required; it must target a non-Production
> project, pass the staging guard, and be confirmed by the operator. Production
> migrations must not be re-run as part of this check.

### 3.4 Password reset (OTP primary, link fallback)

The public recovery mechanism is a **one-time code entered in the app**. It
needs no deep link and cannot be intercepted by another app registering a URL
scheme. The link flow is kept as a fallback; the unverified custom scheme is
only for internal builds.

1. **Order of preference in the app.**
   1. User taps «کد بازیابی» → enters email + 6–10 digit code →
      `verifyOtp({ type: 'recovery' })` creates the session, then the new
      password screen opens.
   2. If a link is configured, the email button opens
      `VITE_RECOVERY_REDIRECT_URL` (HTTPS only, path must be `/reset-password`).
   3. On native builds without that variable, the app falls back to
      `barberapp://reset-password`. That scheme is **unverified** and must not
      be the only mechanism in a public release.

2. **Required Supabase settings (operator action).**
   - Authentication → Email Templates → **Reset Password**: the message must
     contain **both** `{{ .Token }}` (the code) and `{{ .ConfirmationURL }}`
     (the link). Removing either breaks one of the flows.
   - Authentication → Providers → Email: keep confirmation on. Set **Email OTP
     Length** to 6 (the app accepts 6–10) and set an explicit **OTP Expiry**
     (e.g. 3600 seconds or shorter). Defaults are acceptable only if they match
     the template text.
   - Authentication → URL Configuration:
     - **Site URL:** the production web origin (for example
       `https://app.example.com`) — a real domain, not invented here.
     - **Redirect URLs:** add each exact value that is actually used:
       `https://<real-domain>/reset-password`,
       `http://localhost:5173/reset-password` (dev only), and
       `barberapp://reset-password` (fallback/internal only).
   - Build environment: set
     `VITE_RECOVERY_REDIRECT_URL=https://<real-domain>/reset-password`. The app
     rejects a non-HTTPS value or a path other than `/reset-password` and falls
     back to the platform default instead.

3. **Token handling guarantees.**
   - Only fragment tokens (`#access_token`, `#refresh_token`) and PKCE
     `?code=` are accepted; query-string `access_token`/`refresh_token` are
     ignored, so a crafted `?access_token=…` link cannot inject a session.
   - Lookalike paths (`/reset-password-anything`, external origins) are
     rejected; the link must target the configured origin and exact path.
   - OTP verification is bound to the email address, not just the code, and
     Supabase consumes the token server-side (one-time use). A replayed link or
     code fails.
   - After a successful verification the page strips the fragment/`code` from
     browser history (`history.replaceState`), and a failed link falls back to
     the OTP form rather than opening a session.
   - No reset flow can target a different account: the email is part of the
     verification request and the resulting session belongs to that user.

4. **Future verified HTTPS App Links (when a real domain exists).** Do this
   before public distribution if link-based recovery is wanted:
   - Publish `https://<domain>/.well-known/assetlinks.json` containing
     `android_app` with package `com.barberapp.app` and the **SHA-256 signing
     certificate fingerprint** (Play App Signing fingerprint for the release
     track).
   - Add an Android intent-filter with `android:autoVerify="true"`,
     `scheme="https"`, `host="<domain>"`, `pathPrefix="/reset-password"`.
   - Remove `barberapp://` from the public manifest and redirect allowlist.
   - Verify on-device with
     `adb shell pm get-app-links com.barberapp.app` (state `verified`).

5. **Manual smoke tests (required before internal distribution).**
   - Request a code from the sign-in screen → receive email → enter code in the
     app → set a new password → sign in.
   - Wrong email + correct code fails; expired code fails; code reuse fails.
   - Link variant opens `/reset-password` with no token left in the address
     bar; replaying the same link fails.
   - A malformed/crafted link (query-string token, lookalike path) does not
     establish a session and shows the OTP form.
   - Warm start and cold start on a native build.

### 3.5 Same-user references (migration 004)

RLS makes rows invisible, but a plain `visit_id`/`customer_id` FK only proves
the parent exists. Migration `004_same_user_ownership.sql` adds composite
`(parent_id, user_id)` foreign keys for every cross-table reference, so a user
cannot link their own child row to another barber's parent (which previously
could block the owner's DELETE or pollute sync).

- Constraints are added `NOT VALID`: existing rows are never rewritten or
  rejected; every new INSERT/UPDATE is checked immediately.
- `sync/engine/supabase-sync-client.ts` treats PostgreSQL `23503` (FK
  violation) as **retryable**, because a child row can legitimately be pushed
  before its parent. Without that, PostgREST's 409 would be classified
  terminal and the child row would be dropped.
- **Current state: every composite key is still `NOT VALID`.** Migration 004
  has not been applied to any database, and no `VALIDATE CONSTRAINT` has been
  run anywhere. New and updated rows are still fully checked.
- **Legacy check (read-only, no writes):**

  ```bash
  psql "$SUPABASE_DB_URL" -t -A \
    -f supabase/tests/legacy_ownership_mismatches.sql
  ```

  `supabase/tests/legacy_ownership_mismatches.sql` joins all 13 child/parent
  pairs and prints only the constraints with cross-tenant rows. Empty output
  means validation is safe; any row means fix or `NULL` that reference first.
  CI runs the same file on the ephemeral database and fails if it returns rows.
  The script has **not** been run against any hosted database, so whether real
  data contains cross-tenant references is **unknown**; that query is the
  required evidence step.
- **Safe validation sequence (after the mismatch query is empty):**

  1. Inspect which constraints are still unvalidated:

     ```sql
     select conname, convalidated
     from pg_constraint
     where conname like '%\_same\_user\_fkey'
     order by conname;
     ```

  2. Generate the statements (do not paste a hand-typed list):

     ```sql
     select format(
       'alter table public.%I validate constraint %I;',
       c.relname, k.conname
     )
     from pg_constraint k
     join pg_class c on c.oid = k.conrelid
     where k.conname like '%\_same\_user\_fkey' and not k.convalidated;
     ```

  3. Run one statement per transaction with a bounded lock wait so a
     `SHARE UPDATE EXCLUSIVE` lock cannot stall writes indefinitely:

     ```sql
     begin;
     set local lock_timeout = '3s';
     alter table public.appointments
       validate constraint appointments_customer_same_user_fkey;
     commit;
     ```

     Repeat per constraint. If the lock times out, retry in a quiet window;
     the validation is resumable and never rewrites rows. Validating is
     **not** required for security (NOT VALID already blocks new bad rows), so
     it can be deferred to a maintenance window.

## 4. Supply chain

- CI (`.github/workflows/ci.yml`) runs type-check, lint, format check, tests,
  a production-dependency audit and a production build on every push/PR.
- Dependabot (`.github/dependabot.yml`) groups npm and GitHub Actions updates
  weekly. Capacitor majors stay ignored until their migration is scheduled;
  zod majors now flow through Dependabot because the v3→v4 migration is done.
- `npm audit --omit=dev --audit-level=critical` gates CI. Before D-45 the
  pipeline carried one accepted high advisory; it is now resolved:
  - `GHSA-mrhx-c7xc-m3w5` (zod ≤ 4.6.5) — memory exhaustion while validating
    oversized constrained collections. Fixed upstream in `4.6.6`, no 3.x
    backport. `zod` is now `4.6.7`, with `@hookform/resolvers` 7 and
    `react-hook-form` 7.92. Only `CustomerForm`/`ProfileSettings` needed a
    typing change (`z.input` vs `z.output`). Regression tests cover the
    5,000-entry array rejection and the custom transform messages.
    **Production audit is now clean (0 vulnerabilities).**
- Dev-only advisories are not shipped in the app bundle and are allowed to age
  out through Dependabot. Current `npm audit` status (2026-11-14):
  - production (`--omit=dev`): **0 vulnerabilities**; the gate exits 0.
  - dev: 7 moderate, all from the `typescript-eslint → minimatch`
    (`GHSA-g3hv-75wg-m249`) chain. No fixed upstream release exists yet, so no
    forced override is used. The two critical advisories are gone:
    `vitest`/`tinypool` (`GHSA-5gmw-xhrv-c9v3`, `GHSA-85c8-ppgw-ccpr`) and the
    vitest mocker advisories were closed by upgrading to **vitest 5.1.0** and
    `@vitest/coverage-v8` 5.1.0. The vitest 5 migration required three small
    changes: constructible `function` mocks instead of arrow mocks, loops
    instead of `it.each` for the migration-file table, and `"node"` in
    `tsconfig.app.json` types plus `@testing-library/jest-dom/vitest`.
- Never commit `.env`, keystores, `google-services.json`, or generated
  `android/`/`ios/` secrets.
- CI actions are pinned to full commit SHAs with a version comment
  (`actions/checkout` v4.3.0, `actions/setup-node` v4.4.0). Keep them pinned;
  Dependabot's `github-actions` ecosystem updates the SHA and comment.
- Repository security settings (host-side, require admin access — cannot be
  changed from a workflow). Verify each in GitHub → Settings:
  - **Code security and analysis:** Secret scanning **on**, Push protection
    **on**, Dependabot alerts **on**, Dependabot security updates **on**.
    The repository is public, so GitHub enables secret scanning by default;
    confirm push protection is not disabled by an organization policy.
  - **Branches:** protect `main` and `develop` — require a pull request, require
    the `Quality gates` check, disallow force pushes and direct deletion.
  - **Actions → General:** workflow permissions default to _Read repository
    contents_ (the workflow also declares `permissions: contents: read`), and
    allow only GitHub-authored actions.

## 5. Backup and restore

There is no file-export feature in v1. Recovery paths:

1. **Cloud restore (primary).** Settings → «بازیابی کامل از ابر». This runs a
   sync with `fullPull: true`: every cloud row is re-read and merged, local rows
   are never deleted, and unsent local changes win conflicts.
2. **Normal sync.** «همگام‌سازی اکنون» pushes the outbox first, then pulls.
   Use it after reconnecting; it is safe to repeat.
3. **Reinstall / new device.** Sign in with the same account, finish bootstrap,
   then run the full restore once. Photos are re-downloaded from the
   `customer-photos` bucket on demand.
4. **Corrupted local cache.** Signing out does not delete local data. If the
   SQLite file is corrupted, reinstall the app (native) or clear site data
   (browser), then restore from cloud. Unsent outbox rows on that device are
   lost only if they were never pushed — check sync status first.
5. **Browser caveat.** Browser storage is test-only, unencrypted, and may be
   evicted by the browser. Never treat it as a backup.
6. **Supabase backup.** Use the project's database backups (dashboard →
   Database → Backups) for account-level recovery; storage objects need the
   Storage backup/export path.

### 5.1 Logout and local data retention

**Current behaviour:** logout clears the Supabase session (falling back to a
local sign-out when the server is unreachable) but **keeps** the SQLite
database. Outbox rows and the pull cursor are user-scoped
(`005_outbox_user_scope.sql`, `006_sync_cursor_user.sql`), and every repository
query filters `user_id`, so after B signs in on the same device B cannot read
or push A's queued work. The database is SQLCipher-encrypted on native with a
Keystore/Keychain-bound key.

**Decision: keep data on logout; do not purge automatically.** Reasons:

- A purge would delete unsynchronized customer/visit/appointment edits. The
  outbox is the only copy of that work until it is pushed, and offline-first is
  a core requirement.
- Re-login must recover the device's data without a full cloud round-trip; an
  automatic purge turns every logout into a full restore.
- Scoping already prevents cross-account display and cross-account push; the
  residual exposure is a person who can unlock the device *and* sign in as the
  previous user — that is the same exposure as not logging out at all.
- At rest the data is encrypted and excluded from cloud backup/device transfer
  (§6.3), so a stolen backup or file copy does not disclose it.

**Required product behaviour:**

1. **Implemented (2026-11-13).** Settings → «حذف داده‌های این دستگاه» is
   confirm-gated and wipes the signed-in account's eleven business tables, its
   `sync_outbox` rows, its pull cursor, and the local `photos/<user>/`
   directory. It is refused while any outbox row is not `done`
   (pending/failed/processing), and nothing is deleted in that case. Rows are
   deleted in one transaction; photo files are removed only after the commit.
   `schema_migrations`, `profiles`, `sync_state`, and other accounts' rows are
   never touched. Code: `src/features/settings/local-data.ts`, wired in
   `SettingsPage.tsx`; tests: `local-data-wipe.test.ts`,
   `settings-local-data.test.tsx`.
2. When a different account signs in while rows from another user exist and the
   outbox is empty, offer a one-time purge; never delete silently. (Not
   implemented; the manual action in (1) is the supported path.)
3. Never delete `schema_migrations`, `app_meta`, or another user's `sync_outbox`
   as part of logout or account switching.
4. Shared-device hardening (future): record a local owner and require an
   explicit “switch account” confirmation that shows the pending-outbox count.

To hand a device to a different barber: sync, verify Settings shows
«۰ تغییر» pending, use «حذف داده‌های این دستگاه», then sign out. Reinstall
(native) or clearing site data (browser) remains the fallback if the app cannot
open its database.

## 6. Android release

The `android/` folder is generated and gitignored. After `npx cap add android`
and `npm run cap:build`:

### 6.1 Store target and local toolchain

Google Play requires new apps and app updates to target Android 16 (API 36)
from **2026-08-31**. The generated project starts at `compileSdkVersion = 35`,
`targetSdkVersion = 35`, AGP `8.7.2`, Gradle `8.11.1`. The upgrade is applied by
the release script, not by editing the gitignored `android/` by hand:

```bash
npm run cap:build                       # regenerate android/ + patched assets
npm run android:release-config -- --sdk 36
```

`--sdk 36` is idempotent and sets:

| Setting                    | Before | After              |
| -------------------------- | ------ | ------------------ |
| `compileSdkVersion`        | 35     | **36**             |
| `targetSdkVersion`         | 35     | **36**             |
| AGP classpath              | 8.7.2  | **8.11.1**         |
| Gradle wrapper distribution| 8.11.1 | **8.14**           |

Compatibility basis: API 36 requires AGP ≥ 8.9.1; AGP 8.11.1 requires Gradle
≥ 8.13 and JDK ≥ 17. This project compiles with **Java 21**
(`compileOptions` from Capacitor 7.6.10), so JDK 21 — not the AGP minimum of
17 — is the real requirement. Verified locally on 2026-11-13:
Android Studio JBR `21.0.9`, Gradle `8.14` in the wrapper cache, SDK platforms
`android-34`/`android-36`, build-tools `30.0.3`/`35.0.0`/`36.1.0`, `adb`
`36.0.2` (no connected devices and no AVDs). Capacitor 7.6.10 reads
`compileSdk`/`targetSdk` from `variables.gradle`, so plugins inherit 36 without
their own bump. AndroidX, Google Services (`4.4.2`), and native plugins were
deliberately **not** upgraded: no incompatibility was found and blind version
bumps are out of scope.

**Google Maven is unreachable from this network.** Pass 15 confirmed that
`https://dl.google.com/dl/android/maven2/master-index.xml` and every AGP
version (including published ones) return Google's own `404` page, while
`maven.google.com` only redirects to the blocked host, Maven Central and
`services.gradle.org` respond, and `dl.google.com` serves other files. This is
a regional restriction on the Google Maven path, not a project typo or a
version error. AndroidX and `google-services` are not mirrored on Maven
Central, so no official-source Android build is possible here.

**Verification build (non-release-grade).** To validate the toolchain and the
16 KB fix, Pass 15 built the project with JDK 21 (Android Studio JBR `21.0.9`,
the default `java` on PATH is 17 and fails with `invalid source release: 21`)
and a **session-scoped** Gradle init script (`--init-script`, outside the
repository) that points at a read-only Google Maven mirror. `assembleDebug`,
`assembleRelease`, and `bundleRelease` succeeded and are recorded in
`audit/PROJECT_STATUS.md`. **Do not upload these artifacts.** They must be
rebuilt on a machine that reaches Google Maven and verified against the same
checks (§6.5) before store submission; a mirror build has different provenance
even when the bytes look right.

**Native SQLite 16 KB pages.** `@capacitor-community/sqlite` was upgraded from
7.0.0 to **7.0.3**, which replaces `net.zetetic:android-database-sqlcipher:4.5.3`
with `net.zetetic:sqlcipher-android:4.10.0`. Pass 15 verified with the NDK 28.2
`llvm-readelf` that 4.5.3 ships `p_align = 0x1000` (4 KB) and 4.10.0 ships
`p_align = 0x4000` (16 KB) for all four ABIs, and that both the debug/release
APKs and the bundletool-generated Play-style APK have 16 KB-aligned, stored
`.so` entries (`zipalign -c -P 16`). Runtime behaviour on a 16 KB page-size
device is still **NOT RUN** (no usable system image, no physical device), and
the SQLCipher upgrade's on-device data-migration scenarios are **NOT RUN**
(§6.6, `docs/16-android-sqlcipher-migration.md`).

### 6.2 Identity and version

- `applicationId` is `com.barberapp.app` (also the Capacitor `appId` and the
  Gradle `namespace`). Finalize the package name **before the first Play
  upload**; changing it later creates a different app.
- The generated project starts at `versionCode 1` / `versionName "1.0"`.
  Pass a semver name and an increasing integer:
  `npm run android:release-config -- --version-name 1.0.0 --version-code 1`.
  Every uploaded build needs a higher `versionCode`.

### 6.3 Manifest hardening before public release

- Run `npm run android:release-config -- --backup`. It inserts, idempotently:
  `android:allowBackup="false"`, `android:fullBackupContent="false"`, and
  `android:dataExtractionRules="@xml/data_extraction_rules"`, and writes
  `android/app/src/main/res/xml/data_extraction_rules.xml`. The rules exclude
  `root`, `file`, `database`, `sharedpref`, and `external` from both
  `cloud-backup` and `device-transfer`. `allowBackup="false"` alone does not
  stop Android 12+ device-to-device transfer, which is why the explicit rules
  file is required. `android/` is gitignored, so re-run after every
  `npx cap sync`/`npx cap add`.
- Password recovery is OTP-first (§3.4). The unverified custom scheme remains
  only as an internal fallback; do not ship it as the sole mechanism. Public
  link recovery needs a real, verified domain with `assetlinks.json` and an
  `autoVerify` HTTPS intent-filter.
- Re-check the merged manifest after a successful build: Capacitor plugins may
  add permissions (camera, notifications, network state) that are not visible
  in the hand-written manifest. Confirm the merged release manifest still has
  `allowBackup="false"` and the extraction-rules attribute.

### 6.4 Signing

1. Generate a keystore once (keep it outside the repo and back it up):

   ```bash
   keytool -genkeypair -v -keystore ~/keys/barber-release.jks \
     -alias barber -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Create `android/keystore.properties` (gitignored):

   ```properties
   storeFile=/absolute/path/to/barber-release.jks
   storePassword=***
   keyAlias=barber
   keyPassword=***
   ```

   `storeFile` must be absolute: Gradle's `file(...)` resolves relative paths
   against `android/app/`, not the repository root. This file is gitignored and
   was not created during this audit; no credential was generated or printed.

3. Patch the generated Gradle project:

   ```bash
   npm run android:release-config -- --signing \
     --version-name 1.1.0 --version-code 2
   ```

   The script inserts an idempotent `// release-signing:begin … end` block that
   reads `keystore.properties` and assigns the release signing config. Without
   the properties file the release build stays unsigned with a warning.

4. Build (after the SDK/AGP update in 6.1):

   ```bash
   npm run cap:build                       # build web assets AND copy them into android/
   cd android && ./gradlew bundleRelease   # AAB for Play Store
   # or: ./gradlew assembleRelease         # APK for direct install
   ```

   Run `cap:build` (or `npx cap copy android`) before Gradle. Running Gradle
   alone packages the previous copy under
   `android/app/src/main/assets/public`; Pass 15 proved this can ship stale code
   and 60 source maps (BUG-40). `dist/` being correct is not enough.

   Without `keystore.properties` the bundle is unsigned and cannot be uploaded
   to Play. Do not use a debug keystore for distribution.

5. `versionCode` must increase on every uploaded build; `versionName` is the
   user-visible version shown in Settings.

### 6.5 Artifact verification (mandatory before upload)

Run on the exact file that will be uploaded:

```bash
# 1) 16 KB ZIP alignment of the generated APK (not the AAB itself)
bundletool build-apks --bundle=app-release.aab --output=verify.apks \
  --mode=universal --ks=<upload-key.jks> --ks-key-alias=<alias>
unzip -o verify.apks universal.apk
zipalign -c -P 16 -v 4 universal.apk        # every lib/*.so must print (OK)

# 2) ELF program-header alignment of every packaged library
unzip -o universal.apk 'lib/*/*.so'
llvm-readelf -l lib/*/*.so | grep LOAD      # every Align must be 0x4000

# 3) No source maps or secrets in the bundle
unzip -l universal.apk | grep -c '\.map$'   # must be 0
unzip -l universal.apk | grep -E '\.env|keystore|\.jks|\.p12'   # must be empty
```

`llvm-readelf` comes from the installed NDK. An AAB stores `.so` compressed, so
checking the AAB zip directly is not meaningful; check the APKs that Play (or
`bundletool`) generates from it. Pass 15 verified all of the above on the
mirror-built artifacts.

### 6.6 SQLCipher data-migration gate

The 4.5.3 → 4.10.0 upgrade does not change the SQLCipher 4 file format, the
passphrase, or the plugin's secret storage, so no database migration is
expected. That expectation is not a substitute for the eight on-device
scenarios in `docs/16-android-sqlcipher-migration.md`; they are **NOT RUN**.
Do not publish until they pass on a device that has a database created by the
current released build.

**Sixteenth pass (2026-11-14): re-attempted, still BLOCKED.** No database
created by 7.0.0 exists in this environment (`barber_appSQLite.db` is absent
everywhere), no device is attached, and substituting a freshly created database
for the legacy one is forbidden — so no scenario produced PASS/FAIL. The
packaged library was independently re-identified as 4.10.0: the `sha256` of all
four `libsqlcipher.so` files inside the release APK equals the 4.10.0 AAR
(4.5.3 hashes differ), the dex references only `net.zetetic.database.sqlcipher`
and zero `net/sqlcipher`, and `UtilsSecret.java`/`GlobalSQLite.java` are
unchanged between plugin 7.0.0 and 7.0.3. That remains a static compatibility
argument, not runtime proof. The same pass could not produce an official build
either: Google Maven returns 404 for `master-index.xml`, the AGP POMs,
AndroidX, and `google-services`, so the existing artifacts stay
verification-grade and must not be uploaded.

### 6.7 Release configuration record (fifteenth pass)

| Item | Value / decision |
| --- | --- |
| `applicationId` | `com.barberapp.app` — treat as final; it cannot change after the first upload |
| `versionCode` / `versionName` | `1` / `"1.0"` in the built artifacts; bump both for every upload |
| `compileSdk` / `targetSdk` / `minSdk` | `36` / `36` / `23` |
| Upload keystore | **blank** — none exists; create per §6.4 and store outside the repo |
| `keystore.properties` | **blank** — absent; release builds stay unsigned (fails closed) |
| Play App Signing | **required** — enroll in Play Console; keep the upload key backed up |
| Debug vs release | Debug uses `~/.android/debug.keystore`; release never falls back to it |
| R8 / ProGuard | **off** (`minifyEnabled false`). Enable only with a device-tested keep-rule set; Capacitor's bridge uses reflection |
| Backup | `allowBackup="false"`, `fullBackupContent="false"`, all domains excluded from cloud backup and device transfer |
| Secrets in bundle | Only `VITE_SUPABASE_URL` and the publishable anon key are embedded. Never add a service-role key or a keystore |
| Signing for this pass | AAB was built **unsigned** for verification; it is not uploadable |

## 7. iOS release

The `ios/` project is generated but building/signing requires macOS + Xcode.
Run `npm run cap:build`, open with `npx cap open ios`, set the team/bundle id,
bump the version in Xcode, and archive. Android signing does not apply.

### 7.1 Static readiness (2026-11-14, no build performed)

- `ios/App/Podfile` must list every installed plugin. It was missing
  `CapacitorCamera`, `CapacitorFilesystem`, and
  `AparajitaCapacitorSecureStorage`; all three were added on 2026-11-14. Run
  `npx cap sync ios` (or `pod install`) on macOS to confirm the lockfile.
- Deployment target is iOS 14.0 (`Podfile` and the Xcode project agree),
  `MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1`,
  `PRODUCT_BUNDLE_IDENTIFIER = com.barberapp.app`. No `DEVELOPMENT_TEAM` is set —
  the owner must select a signing team.
- `Info.plist` declares `NSCameraUsageDescription` and
  `NSPhotoLibraryUsageDescription` in Persian and the `barberapp://` scheme.
- **Owner decision required:** `ITSAppUsesNonExemptEncryption` is absent.
  SQLCipher uses standard AES, but the App Store Connect export-compliance
  answer is a legal declaration; the owner (or counsel) must confirm the
  correct value before upload. It was deliberately not filled in.
- No `PrivacyInfo.xcprivacy` exists at the app level; only Capacitor's own
  frameworks ship one. Audit required-reason API usage (filesystem timestamps,
  UserDefaults, disk space) before submission.
- iOS build, `pod install`, archive, and a device run are **NOT RUN** — this
  host is Windows and has no Xcode/CocoaPods.
- **Repository:** `android/` and `ios/` are no longer wholesale-ignored. The root
  `.gitignore` now keeps native sources traceable, while the nested
  `android/.gitignore` / `ios/.gitignore` still exclude build outputs,
  `local.properties`, `Pods/`, generated `public/` assets, and
  `capacitor.config.json`. Secrets (`*.jks`, `*.keystore`,
  `keystore.properties`, `.env*`) stay ignored. Owner must review and commit the
  native trees (see `docs/FINAL_PROJECT_HANDOVER.md` §4).

## 8. Known limitations and release blockers

**Security and privacy**

- Server-side RLS is verified at the PostgreSQL level in CI (Section 3.0), not
  against a hosted Supabase project. The optional REST/Storage probe in
  Section 3.3 has **not** run; do not describe it as executed. The SQL test
  asserts storage SELECT/INSERT/UPDATE/DELETE (A creates, updates and deletes
  its own object; B and anonymous affect 0 rows; B cannot move an object into
  A's folder), generic UPDATE/DELETE denial across all 12 tables, cross-account
  child inserts rejected by migration 004's composite keys, anonymous
  SELECT/INSERT/UPDATE/DELETE denial, and post-`ROLLBACK` cleanup of every
  probe row and object. **None of that has executed yet**: this machine has no
  Docker, `psql`, PostgreSQL binaries, or Supabase CLI, and no GitHub run
  exists for this revision. The next `rls-postgres` run is the first evidence.
- A local Supabase stack is not possible in this environment: the Supabase CLI
  needs Docker, and Docker/psql are absent. Auth, PostgREST and Storage wiring
  remain unverified locally; only the SQL policy layer can be tested in CI.
  Installing a JS/WASM Postgres shim was not done — it would add a dependency
  and still would not exercise GoTrue/PostgREST/Storage.
- Password recovery is OTP-first and does not depend on a deep link (§3.4).
  The custom scheme `barberapp://reset-password` remains as an internal
  fallback only; another app can register it. Do not ship it as the sole public
  mechanism. Link-based recovery needs a real verified domain (no domain was
  invented in this work) with `assetlinks.json`, an `autoVerify` HTTPS intent
  filter, and the matching redirect allowlist.
- The generated manifest is patched by `--backup` to
  `allowBackup="false"` plus explicit cloud-backup/device-transfer exclusions
  (§6.3). Verify the **merged** manifest after a successful build; a future
  `cap sync` can regenerate it and must be followed by the same script.
- Local data is now account-scoped: `sync_outbox.user_id` and
  `sync_state.cursor_user_id` isolate rows and cursors, every outbox query is
  filtered by the signed-in user, and a logout that cannot clear the stored
  session keeps the signed-in UI and shows an error instead of a false logout.
  Signing out still does **not** delete local rows (by design, so re-login can
  resume), so a shared device retains the previous account's encrypted SQLite
  data on disk; it is inaccessible to the next account in the app. The explicit
  «حذف داده‌های این دستگاه» action (runbook §5.1) covers device handoff.
- RLS is row-level ownership, not referential tenancy. Migration 004 closes the
  cross-tenant reference gap with composite `(parent_id, user_id)` FKs added
  `NOT VALID`; see §3.5. It has not been applied to any hosted project.
- The zod advisory is resolved: `zod 4.6.7`, `@hookform/resolvers` 7,
  `react-hook-form` 7.92, production audit clean (D-45). Arrays remain bounded
  at 50 as defense in depth, and a regression test proves an oversized array
  fails with a bounded number of issues.
- Server→device deletion is reconciled in code (D-46 / TD-21): migration 005
  adds `deleted_at` tombstones to the seven remaining data tables, every delete
  is pushed as a tombstone with a forward `updated_at`, and pull removes the
  matching local rows child-first in one transaction while protecting queued or
  newer local edits. Keyset pagination replaces offset. Covered by unit and
  real-SQLite tests; migration 005 has **not** been applied to any hosted
  project, and no two-device end-to-end run exists yet. Legitimate local rows
  that predate tombstones are never force-deleted by a full pull.

**Build and distribution**

- The API 36 / AGP 8.11.1 / Gradle 8.14 upgrade is scripted and applied
  (§6.1), but **no successful build exists**: Gradle could not reach Google
  Maven from this machine and the local cache metadata was incomplete. Target
  36 runtime behavior (edge-to-edge, predictive back) is therefore unverified.
- No Android artifact was produced in this environment. No AAB, signed or
  unsigned, exists. No keystore or `keystore.properties` exists; no signed AAB
  can be built without the operator's key. The signing block itself is already
  generated idempotently.
- `applicationId` (`com.barberapp.app`) and the initial `versionCode 1` /
  `versionName "1.0"` must be finalized before the first Play upload.
- No automated end-to-end run on a physical device. OTP/link reset flows
  (§3.4), fresh-install, account-switch isolation, and a successful build's
  merged-manifest check are still required.
- Migration 004 and the strengthened RLS SQL have not been executed anywhere;
  the first evidence will be the next CI `rls-postgres` run. Every composite key
  remains `NOT VALID` and no `VALIDATE CONSTRAINT` has run. Whether real data
  contains legacy cross-tenant references is **unknown** — the read-only
  `supabase/tests/legacy_ownership_mismatches.sql` report is the evidence step
  (§3.5). Hosted PostgREST/Storage behavior remains unverified and must not be
  claimed.
- iOS still requires macOS + Xcode.
- Global search uses `LIKE`; measure on a mid-range Android device with ~5,000
  rows and add FTS only if needed (T15 note).
- `npm test` already runs in single-run mode; use `npm test`, not
  `npm test -- --run`.

## 9. Release readiness gates

### Safe to prepare Release — yes

Local documentation, release scripts, CI configuration, dependency review, and
an unsigned build attempt on a machine with Google Maven access are safe. None
of these touch Production, migrations, remote branches, or credentials.

### Safe to distribute for internal testing — conditional

Only after a build succeeds on a machine that can reach Google Maven:

- build a debug/self-signed APK (or use an internal App Distribution channel)
  with a test keystore that never enters Git;
- configure the Supabase reset-email template with both `{{ .Token }}` and
  `{{ .ConfirmationURL }}` and a short OTP expiry (§3.4), so the OTP flow is
  actually testable;
- use throwaway test accounts and no real customer data;
- OTP reset is acceptable for testers; the custom scheme may remain in test
  builds but must not be the only public path;
- wipe app data between testers (local rows are account-scoped but not deleted
  on logout);
- do **not** use the Play internal-testing track until a signed AAB exists, the
  next `rls-postgres` run is green with migration 004 and the expanded SQL, and
  the legacy mismatch report is empty on the test project.

### Safe for public Production release — no

The following are hard blockers, not documentation gaps:

1. A successful signed AAB built with compileSdk/targetSdk 36 on a
   Google-Maven-capable machine, plus Play App Signing enrollment.
2. A user-held keystore with tested backup (none was generated here).
3. Production Supabase recovery configuration: email template with both
   `{{ .Token }}` and `{{ .ConfirmationURL }}`, explicit OTP length/expiry, the
   exact redirect allowlist, and `VITE_RECOVERY_REDIRECT_URL` if HTTPS link
   recovery is offered. Verified App Links require a real domain and
   `assetlinks.json`; alternatively ship OTP-only and remove the custom scheme.
4. Apply migration 004, run `legacy_ownership_mismatches.sql` and confirm it
   returns no rows, and get a green `rls-postgres` run that includes the storage
   UPDATE/DELETE, generic UPDATE/DELETE, composite-FK, anonymous and cleanup
   assertions. Optionally `VALIDATE CONSTRAINT` in a maintenance window (§3.5);
   it is not required for enforcement. The hosted REST/Storage probe is still
   either required or must have a recorded risk acceptance.
5. Physical-device smoke tests: fresh install, OTP/link reset (warm and cold),
   account switch A→B→A, logout-while-offline failure handling, and a merged
   release manifest that still disables backup.
6. Final `applicationId`, version, privacy policy, store listing, and data
   safety declaration.
7. GitHub host-side secret scanning, push protection, and branch protection.
8. ~~A decision on the zod v4 migration~~ — **resolved** in D-45 (zod 4.6.7,
   production audit clean).
9. A 16 KB-page-compatible SQLCipher build (TD-22: plugin 7.0.0 uses
   `android-database-sqlcipher:4.5.3`; 7.0.3 moves to `sqlcipher-android`).
10. Deletion reconciliation (TD-21 / D-46): **implemented** in code, but apply
    migration 005 to the target project (CI does automatically) and run a
    two-device delete test before relying on it. Prerequisites: an independent
    Test/Staging project, `SUPABASE_ACCESS_TOKEN` or `SUPABASE_DB_PASSWORD`,
    and `RLS_STAGING_PROJECT_REF` matching that project. A 2026-11-14 attempt
    was blocked because none of these were available and the configured
    `.env.local` project was unconfirmed; no hosted database was touched.
    Until the evidence exists, either complete it or record an explicit risk
    acceptance for v1.

CI passing is necessary but not sufficient: it proves code gates and database
policies, not device behaviour, store compliance, or key custody. As of this
revision, even the new database assertions have not run in CI, and no Android
build exists.
