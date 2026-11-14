# PROJECT STATUS — Barber App

> **Audit date:** 2026-11-12
> **Code baseline audited:** `877ebde` (`877ebde06b3ecc97c07494f4896e0a8392f4d8e7`, tip of `origin/docs`)
> **Branch audited:** `develop` (created from `origin/docs`; code tree identical to `origin/main` at `6cad57f`)
> **Audit type:** read-only inspection plus non-destructive verification commands. No application code, migration, schema, or product requirement was changed.
> **Entry point for the next agent:** [`AGENT_HANDOVER.md`](./AGENT_HANDOVER.md)

> **Post-audit update — T01 complete locally (2026-11-12):** The quality gates now pass: `npm ci`,
> `npm run type-check` (real project build), `npm run lint`, `npm run format:check`, `npm test`
> (71/71), and `npm run build`. A GitHub Actions workflow and root `README.md` were added.
> C-03/BUG-03 is resolved. The first remote CI run is pending push authorization. Sections 1–8
> below preserve the original audit snapshot where they differ; use this block and
> [`REQUIREMENTS_MATRIX.md`](./REQUIREMENTS_MATRIX.md) for current status.

> **Post-T02 update — 2026-11-13:** BUG-01 and BUG-02 are resolved. The web app boots: `/login`
> renders, migration `001` applies, and the SQLite store persists across reloads (verified in a
> browser; the migration was not re-applied after reload). The root cause of the blank screen was a
> `sql.js` wasm mismatch — `jeep-sqlite` 2.8.0 bundles sql.js **1.11.0**, while the build copied
> 1.15.2; the copy script now pins and checks the version. Startup renders before bootstrap and
> database initialisation has a 15 s timeout, so a failing or hanging plugin shows the Persian error
> banner with retry instead of a blank page. `foreign_keys` is applied per connection, native
> encryption uses `setEncryptionSecret` before `open`, and `android/` + `ios/` projects were
> generated and synced (both were git-ignored at that time; the 2026-11-14 closure pass made native
> sources traceable). No device build on this Windows machine. Native runtime,
> device checks, and the first remote CI run remain **unverified**.

> **Post-T03 update — 2026-11-13:** Data integrity is in place. Every multi-statement repository
> write runs inside `withTransaction` (`src/database/sqlite/transaction.ts`, non-reentrant), migration
> `002_outbox_hardening.sql` adds `processed_at`, `last_attempt_at`, `client_op_id` + unique index,
> and `markOutboxDone/Failed/Processing` now target real columns. Appointments and visits enqueue one
> outbox row per child row (parent + `appointment_services`/`visit_services`), and expense deletes
> write a tombstone carrying the full deleted row. Repository/outbox tests now execute against real
> SQLite via Node's `node:sqlite` (99/99 tests). Verified in a production build in the browser:
> migration `002` applied once and was skipped on reload (login renders, no DB banner). The automated
> browser page was hidden, which stalls Stencil's rAF hydration; verification required a temporary
> rAF shim, so this is a harness artifact, not an app change. Native runtime, sync push (T09), and
> the first remote CI run remain **unverified**.

> **Post-T04 update — 2026-11-13:** "Today" and all report periods now follow the user's local
> calendar. `src/shared/utils/datetime.ts` derives day/week/month boundaries from an explicit IANA
> zone (device zone by default, overridable), with an exclusive end instant. Every repository
> `findByDay`/`countByDay`, the finance repository/calculator, and the agenda page use it; storage
> stays UTC and no schema changed. `applyTimeToDate` builds instants from explicit year/month/day, so
> negative-offset zones keep the intended day. Gregorian `<input type="date">` was replaced by
> `JalaliDateInput` (Jalali year/month/day selects) in the appointment form; the same component is
> ready for the finance filters when that UI lands in T07. `datetime.test.ts` covers 00:00/00:30/23:59
> in `Asia/Tehran` and New York DST days (23 h / 25 h), and the finance calculator has its first test
> file. 131/131 tests pass; `type-check`, `lint`, `format:check`, and `build` are green. Device and
> remote-CI verification remain **unverified**.

> **Post-T05 update — 2026-11-13:** Authentication is complete locally. `ensureProfile()` creates
> exactly one local profile on login, registration, bootstrap, and auth-state changes, and never
> throws when the database is unavailable (retried on the next launch). Registration with email
> confirmation shows a Persian "check your email" screen (D-20). `AppShell` now has an account menu
> whose logout confirmation shows the pending outbox count; queued rows are never deleted and a
> failed global sign-out falls back to a local sign-out. `/forgot-password` and `/reset-password`
> are routed; the reset page parses the implicit-flow recovery fragment and calls `setSession`
> (web-first, native deep link deferred to T16 per D-26). All Supabase auth errors are mapped to
> Persian messages and the raw text is logged only. Use-case, account-menu, and reset-page tests were
> added (151/151 total); `type-check`, `lint`, `format:check`, and `build` are green. A real Supabase
> project is not configured yet, so the reset flow is unverified end-to-end; device and remote-CI
> verification remain **unverified**.

> **Post-T06 update — 2026-11-13:** The appointment lifecycle is complete locally. Create checks
> conflicts inside its transaction, and update re-checks conflicts (excluding itself), writes the
> parent, and replaces service lines atomically — tombstones for removed children, inserts for new
> ones. The detail page has an edit mode using the shared form and a confirm-gated soft delete; the
> form ignores repeat submits while one is in flight. Deleted rows are filtered from every query
> (day, week, detail, count, next) with a regression test. Reminders are rescheduled on edit and
> cancelled for cancelled/no_show. 156/156 tests pass; `type-check`, `lint`, `format:check`, and
> `build` are green. Device runtime remains **unverified**.

> **Post-T07 update — 2026-11-13:** The finance module is complete locally. `VisitRepository.create`
> records the visit, its service lines, and an optional initial payment in one transaction; both
> `create` and `addPayment` reject over-payment with `OverpaymentError` before writing anything.
> `findSummariesByDay` returns the customer name plus service/paid totals, and
> `FinanceRepository.getOpenDebts` aggregates outstanding balances per customer. The finance page has
> four tabs (Day, Summary with week/month, Expenses, Debts) with Jalali navigation, visit detail with
> partial payments, expense create/edit/delete (tombstone), and a `/finance/quick-sale` route that
> records visit + service + payment atomically. Money stays integer ×100. Repository/schema/component
> tests were added (175/175 total); `type-check`, `lint`, `format:check`, and `build` are green.
> Browser-level verification of the finance UI was not performed because no Supabase project or
> session is configured; device runtime remains **unverified**.

> **Post-T08 update — 2026-11-13:** The dashboard is complete locally. `/dashboard` shows the local
> Jalali date, the next appointment (customer name, date/time, title, tap → detail) or a Persian
> empty state, six summary cards from `useDailyReport`/`useAppointmentsByDay`, the net-after-expenses
> row, and quick actions (new appointment modal, quick sale, customers). Values match the finance day
> tab because both read the same local-day report. Sync banners remain shell-level; the store is
> still not driven (T09). `dashboard-page.test.tsx` was added (177/177 total); all gates are green.
> Browser walkthrough and device runtime remain **unverified**.

> **Post-T09/T10 update — 2026-11-13:** The sync engine exists and is wired into the shell. Push
> drains `sync_outbox` in batches of 50 through an injectable `SyncClient`, upserts by `id` (so the
> signup-triggered `profiles` row no longer conflicts), maps 401 to a stop-without-burning-attempts,
> and treats other 4xx as terminal (`attempt_count = max`) while 5xx/429/network retry with
> exponential backoff (30 s base, 30 min cap, 5 attempts). Pull restores 12 tables in FK-safe order
> with 500-row pages and a single-row `sync_state` cursor (`003_sync_state.sql`); increments use a
> 5-minute overlap, pending local edits win, remote tombstones are applied, and booleans/numbers/dates
> are normalised. `SyncManager` runs on login, online/visibility events, and after successful
> mutations (2 s debounce), drives the existing banners (pending/conflicts/error), and Settings has
> "sync now" and a confirm-gated full restore. Expenses are now soft-deletable end-to-end
> (`004_expense_tombstones.sql`, tombstone payload, `deleted_at` filters, `expenses` added to
> `SOFT_DELETE_TABLES`), and `supabase/migrations/002_sync_indexes_and_fk.sql` adds `(user_id,
> updated_at)` indexes, the server `expenses.deleted_at`, and explicit `ON DELETE` policies. 203/203
> tests pass; `type-check`, `lint`, `format:check`, and `build` are green. No Supabase project is
> configured, so push/pull is covered by injected clients and real-SQLite tests only — network,
> device, and remote-CI verification remain **unverified**.

> **Post-T11 update — 2026-11-13:** The color-formula book is complete locally.
> `ColorFormulaRepository` creates/updates/deletes a formula and its items inside one transaction and
> writes one outbox row per physical row (`client_op_id` = action id, `:rowId` / `:del:rowId`
> suffixes), so offline replay stays idempotent. Amounts are rounded to two decimals
> (`MAX_ITEM_AMOUNT = 999.99`, oxidant 0–99.99, processing 0–1440 min) to match server
> `NUMERIC` columns. `/color-formulas` offers search (title/brand/code/customer),
> create from `?customer=`, and opens the detail page; detail shows items, notes, edit modal,
> duplicate as a template (`«(کپی)»`, new IDs), and confirm-gated delete. Customer detail now lists
> the customer's formulas with a "new formula" shortcut. `useFieldArray` reserves `id`, so DB item
> ids travel as `item_id` and are mapped back by the Zod transform. 215/215 tests pass across 28
> files; `type-check`, `lint`, `format:check`, and `build` are green. Browser walkthrough and
> device runtime remain **unverified**.

> **Post-T12 update — 2026-11-13:** Customer photos are complete locally. The camera/filesystem
> plugins capture a compressed (`quality 80`, max width 1600 px) data URL and write it to
> app-private storage (`local_path`); the row is created transactionally with an outbox insert and
> requires explicit customer consent. Push uploads local bytes to the private `customer-photos`
> bucket before the row upsert (`storage_path` is returned and stored locally), strips `local_path`
> from the payload, and a tombstone deletes the remote object and only then sends the soft delete.
> Gallery thumbnails resolve local bytes first and fall back to a one-hour signed URL on a restored
> device; delete removes the local file, the remote object, and never reappears after pull. A missing
> storage UPDATE policy was added in `supabase/migrations/003_photo_storage_policy.sql`; bucket
> provisioning remains T16. 222/222 tests across 30 files; gates green. Network upload, signed-URL
> display, and camera permissions on a real device remain **unverified** (no Supabase project, no
> device run).

> **Post-T13 update — 2026-11-13:** Appointment reminders are complete locally. A one-time
> native-only banner explains why notifications are needed and requests permission; Settings has
> enable/disable, a 10/30/60-minute lead time (default 30), permission state, and re-schedules all
> upcoming appointments on change. The Android channel uses high importance with sound/vibration.
> Schedule uses one stable ID per appointment (edits replace, now also completed/no_show cancel),
> skips past times, and does nothing on web. On app start `ReminderManager` rebuilds reminders for
> upcoming reserved/confirmed appointments and cancels orphaned ones; tapping a notification opens
> its appointment detail. 227/227 tests across 31 files; gates green. Real-device firing with the
> app killed, permission prompts, and deep-link routing remain **unverified**.

> **Post-T14 update — 2026-11-13:** Settings and customer history are complete locally. Settings
> now edits the local profile (display name, phone, currency) through `ProfileRepository` and queues
> an outbox row; it also shows the account email, a confirm-gated logout, the services link, sync
> controls, reminder preferences, and the app version from `VITE_APP_VERSION`. Currency is
> display-only: `formatMoney` swaps the label (Toman/Afghani/Dollar) and never converts or rewrites
> stored amounts. Customer detail now fetches appointments (`AppointmentRepository.findByCustomer`)
> and visit summaries (`VisitRepository.findSummariesByCustomer`) and shows upcoming/past
> appointments, each visit's service total and paid/remaining amount, and a financial summary, all
> with Jalali dates. 238/238 tests across 34 files; `type-check`, `lint`, `format:check`, and `build`
> are green. Browser walkthrough with a live session and device runtime remain **unverified**.

> **Post-T15 update — 2026-11-13:** Global search is complete locally. `/search` is reachable from
> the dashboard quick actions and queries customers, services, appointments, and color formulas in
> one debounced (250 ms) pass. Both the query and the SQL column are normalised for Persian (۰-۹)
> and Arabic-Indic (٠-٩) digits, and LIKE wildcards are escaped, so `۰۹۱۲` finds a customer stored
> as `0912…`. Each group fetches up to 50 rows (`LIMIT`), shows 5 with «نمایش همه», and links each
> result to its detail page or the services screen. Soft-deleted customers/appointments are
> excluded and every query is scoped to the signed-in user. There is no FTS index: 5,000-row LIKE
> scans are acceptable locally, and the acceptance response-time target still needs a mid-range
> device measurement. 256/256 tests across 37 files; `type-check`, `lint`, `format:check`, and
> `build` are green. Real-device timing remains **unverified**.

> **Post-T16 update — 2026-11-13:** Security and release readiness are complete locally. Native
> sessions use the platform Keychain/Keystore through `@aparajita/capacitor-secure-storage`; web
> localStorage stays a development-only fallback, and the SQLite file was already encrypted on
> native. A Persian React `ErrorBoundary` and a bounded 200-entry logger with sensitive-key
> redaction replace raw error rendering and ad-hoc console output. Supabase migration `001` is now
> fully re-runnable (indexes, policies, private bucket) and a test enforces that; `002`/`003` already
> were. `supabase/tests/rls_two_user_check.sql` verifies both users across all 12 tables and the
> storage bucket in a rolled-back transaction. CI now gates production dependencies on critical
> advisories, Dependabot groups weekly updates, and `docs/11-release-runbook.md` documents RLS
> verification, backup/restore, supply chain, and Android release signing. Production dependencies
> were upgraded (`react-router-dom` 7.18, `supabase-js` 2.49); the remaining zod advisory needs a
> breaking v4 migration and is documented. 275/275 tests across 42 files; all gates green. Live RLS,
> signed native builds, and real-device checks remain **unverified**.

> **Post-T16 release-ops update — 2026-11-13 (second pass):** Password-reset deep links are no longer
> deferred (D-41): native builds redirect to `barberapp://reset-password`, `@capacitor/app` handles
> warm and cold starts, and `scripts/native-deep-links.ts` idempotently patches the generated Android
> intent-filter and iOS `CFBundleURLTypes`. A portable two-user RLS runner (`npm run rls:check`) was
> added; it uses the public Auth/PostgREST/Storage APIs and needs no psql or database password.
> Configuration was verified live without printing secrets: the publishable key is accepted
> (`auth/v1/health` → 200), but the schema is **not applied** (`profiles` → `PGRST205`), so live
> migrations, the idempotency re-run, and the RLS probe are **still not executed** and remain blocked
> on a database credential or SQL-editor action. A real defect was found and fixed: `.env.local`
> pointed at `…/rest/v1/` instead of the project origin, which would break Auth and all sync calls;
> the client now rejects that URL shape. Non-breaking `npm audit fix` cleared the `tar`
> advisories (14 dev-only remain: vitest/tinypool critical needs vitest 5). 296/296 tests across 45
> files; `type-check`, `lint`, `format:check`, and `build` are green. No device test, signed build, or
> live RLS result is claimed.

> **Post-T16 release-ops update — 2026-11-13 (third pass):** Database-level RLS is now verified
> automatically in CI without any Supabase project or secret. The new `rls-postgres` job starts a
> throwaway `postgres:15` container, loads `supabase/tests/postgres_bootstrap.sql` (minimal
> `auth.uid()`/`auth.users`/`storage.*` stubs), applies `001`–`003` **twice** (idempotency) and runs
> `supabase/tests/rls_two_user_check.sql` in a rolled-back transaction, including an anonymous
> session. Run [43456039040](https://github.com/mehdi1265/barber/actions/runs/43456039040) is green
> (preceded by [43453924205](https://github.com/mehdi1265/barber/actions/runs/43453924205)): user B
> sees zero foreign rows in all 12 tables, cannot update/delete/insert A-owned rows, and cannot read
> or write A's storage folder; an anonymous session sees zero rows and objects. The hosted-project
> REST/Storage probe remains separate and unexecuted; `npm run rls:check` now refuses any target
> whose project ref differs from `RLS_STAGING_PROJECT_REF` and hard-refuses the Production ref.
> Production was not touched. 298/298 tests across 45 files; all gates green.

> **Android release-prep audit — 2026-11-13 (fourth pass):** Security review found no
> critical or high server-side cross-tenant flaw in the tested PostgreSQL model. CI remains green
> on `28da1dd`; the two-user test covers all 12 tables, the private `customer-photos` folder, and
> anonymous sessions, all inside `ROLLBACK`. The only high **production-dependency** advisory is
> `zod 3.25.76` (GHSA-mrhx-c7xc-m3w5, fixed in 4.6.6, no 3.x backport); Zod runs only on local form
> input, not on sync payloads, so remote triggering is not possible. Full `npm audit`: 1 high
> (zod), 2 critical dev-only (vitest/tinypool), 11 moderate dev-only; the production gate
> (`--audit-level=critical`) exits 0. Release blockers found:
> (1) Android still targets SDK 35 while Play requires API 36 from 2026-08-31;
> (2) AGP 8.7.2/compileSdk 35 must move to AGP 8.9.1+/SDK 36;
> (3) no Android AAB could be built here — Google Maven returns 404 for known AGP/androidx
> artifacts while Maven Central works; (4) no keystore exists, so no signed AAB;
> (5) manifest has `allowBackup="true"`;
> (6) the unverified `barberapp://reset-password` custom scheme can be hijacked;
> (7) logout keeps local rows and `sync_outbox` is not user-scoped, so one account per device is
> required for tests; (8) hosted REST/Storage RLS and physical-device deep-link/install tests remain
> unexecuted. `applicationId` (`com.barberapp.app`) and the initial version must be finalized before
> the first Play upload. Readiness: **safe to prepare** (docs/scripts/CI), **conditionally safe for
> internal testing** (debug APK on a Google-Maven-reachable machine, test accounts, no real data),
> **not safe for public Production** until the nine gates in `docs/11-release-runbook.md §9` are met.
> No Production database, branch, migration, or secret was touched.

> **Release-blocker remediation — 2026-11-13 (fifth pass):** All work stayed
> local on `develop`; nothing was pushed or merged, no Production/Staging
> project was contacted, no migration was applied remotely, and no signing
> credential was generated or printed.
>
> **Fixed in code**
> (1) Password recovery is now OTP-first (`verifyOtp({ type: 'recovery' })`,
> 6–10 digit code, email prefill, code-only path that needs no deep link); the
> email link is a fallback and `VITE_RECOVERY_REDIRECT_URL` must be HTTPS with
> path `/reset-password`. Tokens are read from the URL **fragment only**,
> lookalike paths/external origins are rejected, and the fragment/code is
> stripped from history after use.
> (2) Android backup hardening is reproducible via
> `npm run android:release-config -- --backup`: `allowBackup="false"`,
> `fullBackupContent="false"`, and a `data_extraction_rules.xml` excluding
> root/file/database/sharedpref/external from both cloud backup and
> D2D transfer (Android 12+).
> (3) Local account isolation: SQLite migrations `005_outbox_user_scope` and
> `006_sync_cursor_user`; every outbox query/mutation and the pull cursor are
> scoped by `user_id`; legacy rows with no owner are never selected; a failed
> logout keeps the signed-in UI and shows an error. New tests cover
> A→logout→B→login (B cannot read/write/push A's rows), A's queue cannot be
> pushed as B, and A re-login sees untouched data.
> (4) RLS hardening: `supabase/migrations/004_same_user_ownership.sql` adds
> composite `(parent_id, user_id)` FKs `NOT VALID` (existing rows untouched,
> new writes enforced; idempotent) plus unique targets. The SQL test now
> asserts storage UPDATE (A own = 1 row; B/anonymous = 0; B cannot move an
> object into A's folder) and that cross-account child inserts raise
> `foreign_key_violation`. PostgREST `23503` is now retryable so FK-ordering
> failures do not terminally drop outbox rows.
> (5) Zod `GHSA-mrhx-c7xc-m3w5` mitigation: appointment services, visit
> services, and formula items are capped at 50; tests reject 51. Zod parses
> only local form input (sync rows bypass Zod and pulls are paginated), so the
> residual risk is self-DoS, not remote/cross-account.
> (6) Android API 36 upgrade is scripted and idempotent:
> `npm run android:release-config -- --sdk 36` sets compileSdk/targetSdk 36,
> AGP 8.11.1 (≥ 8.9.1 required for API 36), and Gradle wrapper 8.14. Capacitor
> 7.6.10 inherits the root SDK values; AndroidX/Google Services/native plugins
> were deliberately not bumped.
>
> **Executed locally (2026-11-13):** `npm run type-check`, `npm run lint`,
> `npm run format:check`, `npm test` — **334/334 tests across 47 files**, and
> `npm run build` all pass. `git status` was not pushed; CI has not yet run
> against these changes.
>
> **Not executed / still unverified:** the PostgreSQL `rls-postgres` job
> (001–004 twice + strengthened SQL), migration idempotency on a live
> PostgreSQL, hosted Supabase Auth/PostgREST/Storage behavior, OTP email
> delivery, and any Android build. `./gradlew :app:assembleDebug --offline`
> (after the SDK 36 patch) could not resolve AGP 8.11.1 or google-services
> 4.4.2; Google Maven returns 404 for every AGP artifact from this network
> while `services.gradle.org` works. Consequently **no APK/AAB, signed or
> unsigned, exists**, and target-36 runtime behavior (edge-to-edge, predictive
> back) is unverified.
>
> **Remaining release blockers:** signed AAB on a Google-Maven-capable machine
> + user-held keystore/Play App Signing; production Supabase email template
> must contain both `{{ .Token }}` and `{{ .ConfirmationURL }}` with explicit
> OTP length/expiry and redirect allowlist; real domain + `assetlinks.json` if
> HTTPS App Links are used; apply migration 004 and get a green CI RLS run
> (hosted probe or recorded risk acceptance); physical-device OTP/reset,
> account-switch, logout-offline, and merged-manifest backup checks; final
> app id/version/store/privacy items; GitHub host-side protections; Zod v4
> decision. **Readiness: safe to prepare, conditionally safe for internal
> testing only after a successful build, not safe for public Production.**

> **Database verification pass — 2026-11-13 (sixth pass):** Still local on
> `develop`; nothing pushed, merged, deployed, or applied to any hosted
> database.
>
> **CI coverage.** The `rls-postgres` migration loop is now directory-driven
> (`ls supabase/migrations/*.sql | sort`), so every Supabase migration is
> applied twice and a new file cannot be forgotten. The Supabase set is
> `001_initial_schema`, `002_sync_indexes_and_fk`, `003_photo_storage_policy`,
> `004_same_user_ownership`. The `005_outbox_user_scope` and
> `006_sync_cursor_user` files are **client-side SQLite** migrations, not
> Postgres: `npm test` applies all six and
> `outbox.integration.test.ts` asserts versions `1..6` after two runner passes;
> a new `sqlite-migrations.test.ts` fails if a file or its runner import is
> missing.
>
> **RLS test strengthened.** `supabase/tests/rls_two_user_check.sql` now also
> asserts generic UPDATE and DELETE denial against foreign rows in all 12
> tables, storage DELETE (A deletes its own; B and anon affect 0 rows), anon
> INSERT denial for a table and the bucket, and post-`ROLLBACK` cleanup of all
> 22 probe IDs across 11 tables plus every probe storage path. A 13-query
> read-only `supabase/tests/legacy_ownership_mismatches.sql` was added and is
> gated in CI (non-empty output fails the job).
>
> **Migration 004 status.** Every composite key is still `NOT VALID`; 004 has
> not been applied anywhere and no `VALIDATE CONSTRAINT` has run. Whether real
> data contains cross-tenant references is **unknown** — the mismatch report is
> the required evidence step. Safe validation steps (convalidated query,
> generated statements, `lock_timeout`) are in runbook §3.5.
>
> **Local Supabase stack: unavailable.** No Docker, `psql`, PostgreSQL
> binaries, or Supabase CLI on this machine; the CLI would need Docker. Auth,
> PostgREST, and Storage integration remains unverified; only SQL policies can
> be tested, and only in CI. No JS/WASM Postgres shim was added.
>
> **Logout retention decision (documented, not implemented).** Keep local data
> on logout; outbox and cursor are user-scoped, so another account cannot read
> or push it, and purging would lose unsynced edits. Add a confirm-gated
> “delete local data” action later, refusing while the outbox is non-empty
> (runbook §5.1).
>
> **Executed locally (2026-11-13, after these changes):** `type-check`,
> `lint`, `format:check`, `npm test` — **336/336 tests across 48 files**, and
> `build` all pass.
>
> **Not executed:** the `rls-postgres` job (001–004 twice, legacy report,
> expanded two-user SQL), any live PostgreSQL, any hosted Supabase endpoint,
> and any Android build. **No GitHub run exists for this revision.** The live
> API confirms run 43456745065 at `28da1dd` is green, but it executed the
> previous workflow (hardcoded `001`–`003`, no 004, no legacy gate, older SQL),
> so it does not validate these changes. The workflow has **no
> `workflow_dispatch`** and GitHub only runs committed refs; with pushing
> prohibited, no CI evidence for the new SQL can be produced in this session.

> **Device-handoff pass — 2026-11-13 (seventh pass):** Still local on
> `develop`; nothing pushed, merged, deployed, or applied to any hosted
> database.
>
> **Local-data wipe (R-04 gap closed).** Settings now has a confirm-gated
> «حذف داده‌های این دستگاه» action. It refuses while the signed-in account has
> any outbox row that is not `done`, then deletes that account's eleven business
> tables, its outbox rows, its pull cursor, and `photos/<user>/` on the device.
> Deletion runs in one transaction; photo files are removed only after the
> commit. `schema_migrations`, `profiles`, `sync_state`, and every other
> account's rows are untouched. Implemented in
> `src/features/settings/local-data.ts` and wired into `SettingsPage.tsx`.
>
> **Tests.** `local-data-wipe.test.ts` (4 tests, real `node:sqlite`) covers
> per-account deletion, cursor ownership, the unsynced guard, and
> database-before-files ordering; `settings-local-data.test.tsx` (3 tests)
> covers confirmation, success, the refusal message, and cancel.
>
> **Executed locally (2026-11-13, after these changes):** `type-check`, `lint`,
> `format:check`, `npm test` — **343/343 tests across 50 files**, and `build`
> all pass. The wipe was not exercised in a browser or on a device; file-path
> deletion is covered through the injected cleanup hook, not real storage.
>
> **Not executed:** the `rls-postgres` job (001–004 twice, legacy report,
> expanded two-user SQL), any live PostgreSQL, any hosted Supabase endpoint,
> and any Android build. **No GitHub run exists for this revision**; pushing is
> still prohibited, so CI evidence for the new SQL cannot be produced here.

> **Security & sync verification pass — 2026-11-13 (eighth pass):** Still local
> on `develop`; nothing pushed, merged, deployed, or applied to any hosted
> database.
>
> **Fixed in code**
> (1) Account-switch containment. `pushOutbox` and `pullFromCloud` accept an
> `isAccountCurrent` predicate; every network round-trip and every state write
> is fenced, so a run that started under account A stops instead of sending A's
> queue with B's token, marking rows `done`, or burning attempts. Rows left
> `processing` are reset on the next run. `runSync` remembers which account
> started the in-flight run and starts a fresh run when a different account is
> signed in by the time it finishes.
> (2) Pull ownership checks. A remote row whose `user_id` differs from the
> pulling account is skipped, and the conflict upsert is
> `... WHERE user_id = excluded.user_id`, so an id collision (possible after a
> server-side hard delete frees an id) can never transfer a local row to another
> account. An aborted pull keeps the previous cursor, so the next run re-reads
> the same window.
> (3) Bootstrap profile no longer queues a push. `ProfileRepository.ensureLocalProfile`
> inserts the local placeholder with `INSERT OR IGNORE` and no outbox row; the
> signup trigger already owns the cloud profile, so pushing a placeholder would
> overwrite a restored phone/currency with defaults on reinstall or after a
> wipe.
> (4) The local-data wipe no longer dead-ends on terminal outbox rows. The guard
> counts only rows that can still reach the server (pending/processing, or
> failed with attempts left), so a permanent 4xx cannot block device handoff
> forever while retryable work still does.
>
> **Tests.** 9 new real-SQLite/unit tests: account change mid-push (rows stay
> pending/processing, no attempt burned), no cloud call after a switch, foreign
> remote row ignored, id collision cannot transfer ownership, aborted pull keeps
> its cursor, bootstrap placeholder not queued, placeholder never replaces an
> existing cloud row, terminal failure no longer blocks the wipe, retryable
> failure still does. Auth use-case assertions were updated for the
> non-queuing bootstrap.
>
> **Executed locally (2026-11-13, after these changes):** `npm run type-check`,
> `npm run lint`, `npm run format:check`, `npm test` — **352/352 tests across 50
> files**, and `npm run build` all pass.
>
> **Audited, not changed.** RLS/storage review of `supabase/migrations/001–004`:
> all 12 tables use one owner-scoped `FOR ALL` policy on `auth.uid() = user_id`;
> `storage.objects` has per-command policies keyed by the first path segment and
> the bucket is private; migration 004's composite same-user FKs with unique
> targets make cross-account child rows impossible. No cross-account read/write
> path was found in the policies themselves.
>
> **Not executed / still unverified.** The PostgreSQL `rls-postgres` suite was
> not run, so RLS remains **not runtime-verified** (static review + CI
> definition only). No hosted Supabase endpoint or Android build was exercised.
> **No GitHub run exists for this revision.**
>
> **Remaining sync limitation.** Deletions cannot be reconciled server→device
> for tables without tombstones: the documented policy keeps local rows forever
> and offset pagination makes delete-detection unsafe. A fix needs server
> tombstones for every syncable table (or keyset pagination plus an explicit
> reconciliation pass); it is deliberately out of scope for this pass.

> **Zod advisory remediation & Android read-back — 2026-11-13 (ninth pass):** Still local on
> `develop` at `28da1dd`; nothing pushed, deployed, or applied to any hosted database.
>
> **Zod resolved (D-45).** `GHSA-mrhx-c7xc-m3w5` (memory exhaustion in `$ZodArray` when
> accumulating issues for failing elements) affects `zod ≤ 4.6.5`, is fixed in `4.6.6`, and has
> no 3.x backport. Upgraded `zod` 3.25.76 → `4.6.7`, `@hookform/resolvers` 6 → `7.0.6`, and
> `react-hook-form` 7.54 → 7.92.0 (the v6 resolver does not support Zod 4 types). All seven
> schema files compiled unchanged (`ZodIssueCode`, `NEVER`, string messages, `.email()` still
> work); only `CustomerForm` and `ProfileSettings` needed `useForm<z.input<...>, unknown,
> z.output<...>>` so the resolver sees raw form values while submit handlers get transformed
> ones. `.github/dependabot.yml` no longer ignores zod majors.
>
> **Tests.** 2 new regression cases (5,000-entry appointment services array must fail with ≤ 2
> issues and the Persian max message; `payment_method` defaults to `cash`) plus message
> assertions for transform/custom errors and the email error. Executed locally: `npm run
> type-check`, `npm run lint`, `npm run format:check`, `npm test` — **354/354 tests across 50
> files** — and `npm run build` all pass. `npm audit --omit=dev` → **0 vulnerabilities**; full
> audit 13 dev-only (11 moderate, 2 critical vitest/tinypool).
>
> **Android debug build — blocked, not broken.** JDK 21 is required (Capacitor 7 compiles with
> Java 21); Android Studio JBR 21.0.9, SDK platform 36, build-tools 36.1.0, Gradle 8.14, and adb
> 36.0.2 are present, but no emulator/AVD and no device. `./gradlew :app:assembleDebug --offline`
> fails because `dl.google.com/dl/android/maven2` returns 404 for every AGP artifact (8.11.1 and
> older) while Maven Central and services.gradle.org respond. No mirror or certificate bypass was
> used; the build must run on a Google-Maven-reachable machine. A debug keystore already exists
> on this machine (not created in this pass); no release keystore exists.
>
> **New risks recorded.** TD-21/D-46: server→device deletion reconciliation is still missing for
> the eight tables without `deleted_at` (resurrection risk), design only. TD-22: SQLCipher
> `4.5.3` shipped by `@capacitor-community/sqlite` 7.0.0 lacks 16 KB page support; plugin 7.0.3
> moves to `sqlcipher-android` 4.10.0 but needs native/device validation.
>
> **Still unverified.** No PostgreSQL/RLS runtime evidence, no hosted REST/Storage probe, no
> Android artifact, no device test, no CI run for this revision.

> **Deletion reconciliation implemented — 2026-11-14 (T17 / D-46).** Server→device deletes are no
> longer invisible. `supabase/migrations/005_sync_tombstones.sql` adds `deleted_at` and
> `idx_<table>_user_deleted` to the seven data tables that lacked them. Push turns every data-table
> delete into an upsert tombstone with a forward `updated_at`; pull collects tombstones and removes
> local rows child-first in one transaction, protects queued/newer local edits, refuses to let a
> stale server row resurrect a local tombstone, and paginates with `(updated_at, id)` keyset instead
> of offset. Photo files are unlinked after commit. New `sync.reconcile.test.ts` (7 cases) plus
> updated pull/push/payload tests run against real `node:sqlite`; **363/363 tests across 51 files**
> pass locally, along with `type-check`, `lint`, `format:check`, and `build`.
>
> **Vitest 5 / supply chain.** Upgrading to `vitest` 5.1.0 + `@vitest/coverage-v8` 5.1.0 closed both
> critical dev advisories (`vitest`, `tinypool`) and the vitest-mocker advisories. Remaining full
> `npm audit`: 7 moderate dev-only in the `typescript-eslint → minimatch` chain (no fixed upstream
> release). `npm audit --omit=dev`: **0 vulnerabilities**.
>
> **Still not verified for T17.** Migration 005 has not been applied to any hosted project, and no
> two-device delete test exists. The code path is covered by unit tests only; the `.or(...)` keyset
> filter itself is exercised against the fake client, not a live PostgREST instance.

> **Operational validation attempt — 2026-11-14 (eleventh pass): BLOCKED.** Static review passed:
> migration 005 uses only `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` for exactly the
> seven tables lacking tombstones; every synced table has owner-only RLS (`auth.uid() = user_id`);
> the server `updated_at` trigger fires on UPDATE; and CI applies all `supabase/migrations/*.sql`
> twice. Migration execution and the 10 two-device scenarios were **not run**: no
> `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, or `RLS_STAGING_PROJECT_REF`, no docker/psql/
> Supabase CLI/pg, and the `.env.local` project (`quxkwzxsibquqiqoswna`) is not confirmed as a
> test/staging project. No hosted database was contacted or modified. Regression gates are
> unchanged from the tenth pass: type-check/lint/format green, **363/363 tests**, build green,
> production audit 0, 7 moderate dev-only advisories.

> **Staging guard hardening — 2026-11-14 (thirteenth pass):** `scripts/rls-check.ts` now requires
> **both** `RLS_STAGING_PROJECT_REF` and `RLS_PRODUCTION_PROJECT_REF`, rejects unknown/malformed
> refs and any Staging=Production match before the first request, and refuses to write unless
> `--confirm-ref=<exact-staging-ref>` is passed on that invocation (`--preflight` remains
> write-free and prints the destructive plan). Cleanup now reads `id,user_id`, deletes only rows
> created by that run with `id=eq` **and** `user_id=eq`, and aborts on duplicate, foreign-owned, or
> unknown ids; storage cleanup refuses paths outside the owner folder. Diagnostics redact
> key/JWT/Bearer/password shapes. 20 new offline tests; **383/383 across 52 files**; all gates
> green. Four CLI guard failures were reproduced locally with exit code 1 before any network call.

> **Release-candidate preparation — 2026-11-14 (fourteenth pass):** production builds no longer
> ship source maps (`vite.config.ts` uses `sourcemap: process.env.SOURCE_MAPS === 'true'`), which
> removed 60 `.map` files and cut `dist/` from 8.0 MB to 2.2 MB. Added the missing release
> artifacts: [`docs/13-release-owner-approval.md`](../docs/13-release-owner-approval.md) (blank
> owner sign-off template), [`docs/14-release-artifacts.md`](../docs/14-release-artifacts.md)
> (checklist, notes, migration/backup/rollback/deployment/monitoring plans),
> [`docs/15-operational-test-plan.md`](../docs/15-operational-test-plan.md) (executable
> auth/RLS/sync/storage rows, all `NOT RUN`), and
> [`supabase/tests/verify_release_schema.sql`](../supabase/tests/verify_release_schema.sql)
> (read-only schema verification). Migrations 001–005 were re-audited: additive and re-runnable;
> 004 keeps 5 unique + 13 composite FKs `NOT VALID`. **No** hosted migration, RLS run, two-device
> test, Android build, or device test was executed; release status remains pending staging
> verification.

> **Android release blockers — 2026-11-14 (fifteenth pass): BUILD SUCCEEDED, DEVICE VERIFICATION
> PENDING.** TD-22 is fixed in code: `@capacitor-community/sqlite` **7.0.3** (stable 7.x, no beta)
> replaces `android-database-sqlcipher:4.5.3` with `net.zetetic:sqlcipher-android:4.10.0`. NDK 28.2
> `llvm-readelf` shows `p_align = 0x4000` (16 KB) for all four ABIs in 4.10.0 and `0x1000` (4 KB) in
> 4.5.3. Built with JDK 21 (Android Studio JBR 21.0.9): `app-debug.apk` 27.4 MB, unsigned
> `app-release-unsigned.apk` 24.4 MB, **`app-release.aab` 13.8 MB**, plus a bundletool 1.18.2
> Play-style APK. All generated APKs pass `zipalign -c -P 16`, every packaged `libsqlcipher.so` is
> `0x4000`, and no artifact contains `.map`, `.env`, or keystore files. Embedded Supabase value is
> the publishable key only; no service-role key.
>
> Google Maven remains unreachable: `https://dl.google.com/dl/android/maven2/master-index.xml` and
> every AGP POM return Google's `404` page; `maven.google.com` redirects to the blocked host;
> AndroidX/`google-services` are absent from Maven Central. The successful build used a
> **session-scoped `--init-script` mirror outside the repository**; no repo repository declaration
> was changed. These artifacts are **verification-grade only** and must be rebuilt from official
> Google Maven before upload. There is no release keystore, so the AAB is unsigned (blanks are in
> `docs/11-release-runbook.md` §6.4).
>
> BUG-40 was found and fixed during this pass: bare Gradle packaged a stale
> `android/app/src/main/assets/public` (60 maps, older hashes). `npx cap copy android` before the
> rebuild removed them. The eight SQLCipher data-migration scenarios and every device/emulator test
> are **NOT RUN**: no physical device is attached and every `system-images/**` directory is an empty
> placeholder, with the SDK repository also blocked. Design, evidence, and the executable device
> checklist are in [`docs/16-android-sqlcipher-migration.md`](../docs/16-android-sqlcipher-migration.md).

> **Android verification attempt — 2026-11-14 (sixteenth pass): BLOCKED (status D).** Baseline
> recorded first: `HEAD = 28da1dd`, 64 modified + 20 untracked + 0 staged, plugin 7.0.3 installed
> as declared. **Static re-verification passed:** the four `libsqlcipher.so` in the release APK are
> byte-identical to the `sqlcipher-android-4.10.0` AAR (`bc8574…`, `a3d6e1…`, `efd779…`, `482f62…`)
> and differ from 4.5.3; `p_align = 0x4000` vs `0x1000`; the dex references only
> `net.zetetic.database.sqlcipher` (55) and zero `net/sqlcipher`; intermediates resolve
> `sqlcipher-android:4.10.0`, room 2.6.1, sqlite 2.4.0, security-crypto 1.1.0-alpha06 with no old
> coordinate; `UtilsSecret`/`GlobalSQLite` unchanged; DB path `barber_appSQLite.db`; secret key
> `secret` is only written when absent. **Runtime is blocked:** no device (`adb devices` empty), no
> database created by 7.0.0 anywhere (so S1–S8 have no PASS/FAIL and no substitute DB was created),
> zero `system.img` (every `system-images/**` entry is an `.installer` placeholder), no AVD, the
> `android-36/google_apis_ps16k` image not installed, and `dl.google.com/android/repository/*.xml`
> returns 404. **Official build blocked:** Google Maven 404 for `master-index.xml`, AGP, AndroidX and
> `google-services`; no new build was run and the existing artifacts remain verification-grade, not
> uploadable. Signing was inspected only — no keystore/`keystore.properties` and none created.
> Supabase untouched: no approved staging refs, no credentials, `.env.local` not assumed to be
> staging. Gates: type-check/lint/format/build green, **383/383 tests in 52 files**,
> `npm audit --omit=dev` 0, `npm audit` 7 moderate dev-only. Artifact hashes unchanged from the
> fifteenth pass. TD-22 (16 KB runtime) and TD-24 stay **open**. No commit, push, merge, reset,
> clean, or upload. Release status: **BLOCKED BY DEVICE / TOOLCHAIN / OFFICIAL REPOSITORY ACCESS**.
> Regression: type-check, lint, format, build green; **383/383 tests across 52 files**; production
> audit 0; 7 moderate dev-only `typescript-eslint` advisories remain. No commit, push, merge, hosted
> migration, or database write was performed.

> **Final execution pass — 2026-11-14 (seventeenth pass).** Baseline: `HEAD = 28da1dd`, branch
> `develop`, 68 modified + 20 untracked + 0 staged; Node 24.18.0, npm 11.16.0, Java 17 (Android
> Studio JBR 21 available), Gradle 8.14, SDK 36, NDK 28.2.13676358, Capacitor 7.6.10 / sqlite
> plugin 7.0.3. Fixes: BUG-22 fully closed (all forms guard repeated submits via `isSubmitting`);
> BUG-31 closed (`matchesSearch` normalises haystack and needle, regression test added); TD-05
> closed (customer/service suites converted to real `node:sqlite`); TD-06 closed (coverage
> thresholds 70/60/60/70 plus a CI coverage step; baseline 73.58/66.11/67.68/75.47); `ios/App/Podfile`
> gained the three missing plugin pods. Register housekeeping: TD-13/TD-20 confirmed resolved,
> TD-18/TD-19 recorded as partial, TD-11 partial (two dead files retained only because the pass rules
> forbid deleting pre-existing files). Gates: type-check, lint, format, build green (**0** source
> maps, `dist` 2.2 MB), **403/403 tests in 52 files**, coverage thresholds pass, `npm audit --omit=dev`
> 0. Android artifacts were not rebuilt and their hashes are unchanged; APK inspection: targetSdk 36,
> `allowBackup=false`, `fullBackupContent=false`, no `debuggable`, 0 `.map`, 0 `sb_secret_*`. iOS
> build/archive remains **NOT RUN** (Windows host). TD-22 and TD-24 stay **open**. No commit, push,
> merge, reset, clean, migration, or hosted write.

> **Final closure pass — 2026-11-14 (eighteenth pass).** Git unchanged at `develop` / `28da1dd`
> (71 modified + 22 untracked entries; 89 files with `-uall`; 0 staged). Deleted the three
> unreachable files (`src/App.tsx`, `src/App.css`, `src/database/repositories/base.repository.ts`)
> after an import scan, closing BUG-30 and TD-11. Root `.gitignore` no longer ignores `android/`
> and `ios/` wholesale: 69 hand-maintained native files are now traceable, while nested ignore
> rules keep build outputs, `local.properties`, `Pods/`, generated `public/` assets, keystores,
> and `.env*` out of Git (nothing staged). TD-24 closed for this release with evidence that the
> app never calls the plugin's `exportToJson`/`importFromJson`; its fixed salt/IV is documented as
> a precondition for any future backup feature. New handover docs: `docs/FINAL_PROJECT_HANDOVER.md`
> and `docs/FINAL_OWNER_ACTION_CHECKLIST.md`. Gates: type-check/lint/format/build green,
> **403/403 tests in 52 files**, 0 source maps, `dist` 2.2 MB, `npm audit --omit=dev` 0. Android:
> release APK passes `zipalign -c -P 16`; `p_align = 0x4000`; unsigned; Google Maven 404; runtime
> **NOT RUN**. iOS: static audit complete, build **NOT RUN**. TD-22 remains open. No commit, push,
> merge, reset, clean, migration, or hosted write.

---

## 1. Repository snapshot

| Item | Value |
|---|---|
| Repository | https://github.com/mehdi1265/barber |
| Remote branches | `main`, `docs` |
| Active development branch | `develop` |
| Base branch | `docs` (documentation moved into `docs/`; application code identical to `main`) |
| Code baseline | `6cad57f` "Add files via upload" |
| Docs baseline | `877ebde` "documets" (child of `6cad57f`; only relocates markdown into `docs/`) |
| Total commits | 4 |
| Tracked files | 124 |
| Source files | 71 `.ts/.tsx` in `src/` (~6,079 lines) + ~1,386 lines of CSS |
| Documentation | 11 markdown files in `docs/` (Persian) |
| CI | none |
| Mobile platforms | **not initialized** (no `android/`, no `ios/`) |

### Stack

| Area | Technology | Declared | Installed at audit |
|---|---|---|---|
| UI | React + TypeScript | `^19.3.1` / `^5.7.3` | 19.3.1 / 5.7.3 |
| Build | Vite | `^8.3.6` | 8.3.7 (rolldown) |
| Mobile shell | Capacitor | `^7.2.0` | 7.x |
| Local DB | `@capacitor-community/sqlite` | `^7.0.0` | 7.0.0 |
| Backend | `@supabase/supabase-js` | `^2.47.10` | 2.47.10 |
| UI state | Zustand | `^5.0.3` | 5.0.3 |
| Server cache | TanStack Query | `^5.62.7` | 5.62.7 |
| Forms | react-hook-form + Zod | `^7.54.0` / `^3.24.1` | 7.54.0 / 3.24.1 |
| Dates | date-fns + date-fns-jalali | `^4.1.0` / `^4.1.0-0` | same |
| Tests | Vitest + Testing Library | `^3.1.4` | 3.1.4 |
| Lint | ESLint 9 flat config | `^9.17.0` | 9.17.0 (oxlint removed in T01) |

Verification environment: Windows, Node `v24.18.0`, npm `11.16.0`, git `2.52.0`.

---

## 2. Verification performed (actual results)

Every command below was executed in a fresh clone on `develop`.

| Check | Command | Result | Detail |
|---|---|---|---|
| Install | `npm ci` | **PASS** | 432 packages in 15 s. npm 11 warns that `esbuild@0.25.12` postinstall is not allow-listed; the binary still resolves and Vite builds. |
| Production build | `npm run build` | **FAIL** | `src/features/finance/finance.hooks.ts(7,1): error TS6133: 'todayISO' is declared but its value is never read.` |
| Bundler only | `npx vite build` | **PASS** | `dist/` emitted in ~600 ms; `tsc` is the only failing gate. |
| Type check | `npm run type-check` | **PASS but vacuous** | Root `tsconfig.json` has `"files": []`; `tsc --noEmit` checks 0 files. |
| Lint (script) | `npm run lint` | **COULD NOT EXECUTE** | `Invalid option '--ext'` — ESLint 9 flat config removed `--ext`. |
| Lint (direct) | `npx eslint src` | **FAIL** | 69 problems: **53 errors, 16 warnings**, 18 auto-fixable. |
| Formatting | `npm run format:check` | **FAIL** | 92 files not formatted. |
| Unit tests | `npm test` | **PASS** | 7 files, **71/71 tests**, 5.77 s. |
| Coverage | `npm run test:coverage` | **NOT EXECUTED** | `@vitest/coverage-v8` installed; no thresholds configured. |
| Web runtime | manual browser | **NOT EXECUTED** | Boot blocker proven statically (BUG-01). |
| Android / iOS build | `npx cap …` | **NOT POSSIBLE** | No platform directories. |
| Supabase migrations / RLS | — | **NOT EXECUTED** | No project credentials; static review only. |

**No destructive database command was run. No secret was read or printed. No remote branch was modified and nothing was pushed.**

**Post-T01 re-verification (2026-11-12, same machine):**

| Check | Command | Result | Detail |
|---|---|---|---|
| Install | `npm ci` | **PASS** | 430 packages; lockfile regenerated after removing the unused `oxlint` dependency. |
| Type check | `npm run type-check` | **PASS** | `tsc -b`. A deliberate `string`→`number` error failed the gate and was reverted. |
| Lint | `npm run lint` | **PASS** | 0 errors, 0 warnings (`eslint .`). |
| Formatting | `npm run format:check` | **PASS** | All `src/**/*.{ts,tsx,css}` files match Prettier. |
| Unit tests | `npm test` | **PASS** | 7 files, **71/71 tests**. |
| Production build | `npm run build` | **PASS** | `tsc -b && vite build`; 522 modules, `dist/` emitted. |
| Formatting equivalence | TS emit + PostCSS AST comparison | **PASS** | 52 `.ts/.tsx` files produced identical TypeScript emit; 16 `.css` files produced identical PostCSS ASTs. |
| CI workflow | `.github/workflows/ci.yml` | **PENDING REMOTE RUN** | Mirrors the local gates on Node 24; first GitHub run requires push authorization. |

---

## 3. Maturity assessment

**Overall: pre-alpha / early scaffold. ~30 % of MVP scope by weighted effort. 0 % of the product's differentiating promise (cloud recovery) is implemented.**

| Dimension | Score | Basis |
|---|---|---|
| Requirements coverage | ~30 % | 9 complete, 25 partial, 12 not implemented, 1 needs verification, 1 blocked (48 requirements; post-T01) |
| Architecture conformance | ~45 % | Layers/folders exist; application/use-case and sync layers absent |
| Data integrity | ~20 % | No transactions, FK enforcement not applied per connection, outbox write path defective, child rows not queued |
| Cloud / synchronization | ~5 % | Full RLS SQL, **zero** client data calls to Supabase (Auth only) |
| Test coverage | ~25 % | Unit only; finance untested; SQL repository tests use a mock, not real SQLite |
| Build / CI / quality gates | ~10 % | Build red, lint script broken, 92 unformatted files, no CI |
| Security | ~40 % | Good RLS design; session token and DB key in `localStorage`; unverified |
| UX consistency | ~35 % | RTL shell and good components; dashboard/finance/settings/formulas are placeholders; Gregorian date inputs |

### What this means

The project is **not demoable end-to-end today**: it does not boot in a browser, has no mobile project, and the build command fails. The documented architecture and the existing vertical slices (customers, services, appointment creation with tested conflict detection) are coherent and worth preserving.

Treat the next phase as **stabilisation + infrastructure**, not feature delivery. Building dashboard/finance UI before fixing DB bootstrap, transactions, local-day semantics, and the outbox would encode defects into financial history.

---

## 4. Critical blockers

| ID | Blocker | Evidence | Consequence |
|---|---|---|---|
| C-01 | Web bootstrap never resolves | `src/database/sqlite/database.ts:53` calls `initWebStore()`; plugin's web implementation awaits `customElements.whenDefined('jeep-sqlite')`; `index.html` loads no `<jeep-sqlite>` element or script | Blank screen in browser, no error surfaced, nothing testable in `npm run dev` |
| C-02 | SQLCipher init is wrong on both targets | `database.ts:64-73` creates an **encrypted** connection, opens it, then runs `PRAGMA key`; native requires `setEncryptionSecret()` **before** `open()`; web does not support encrypted DBs | Native open fails or is unencrypted; web cannot open the DB |
| C-03 | Build fails | `finance.hooks.ts:7` unused import; `tsc -b` exits 1 | No shippable artifact, no CI signal. **Resolved in T01 (2026-11-12).** |
| C-04 | No sync engine while outbox rows are written | Only `src/sync/outbox/outbox.repository.ts`; `getPendingOutbox` has no caller; zero `supabase.from/storage/rpc` in `src/` | Data never leaves the device; new-phone recovery impossible |
| C-05 | Outbox update SQL targets a missing column | `outbox.repository.ts:51` sets `updated_at`; `sync_outbox` has no such column (`src/database/migrations/001_initial.sql:203-213`) | First sync attempt crashes |
| C-06 | No transactions around multi-table writes | `appointment.repository.ts:151-183` (parent + N services + outbox as separate `run()` calls); `visit.repository.ts:107-162` | Partial rows after interruption; impossible to repair deterministically |
| C-07 | Local-day boundary defect | day ranges use `T00:00:00.000Z…T23:59:59.999Z` (`appointment.repository.ts:72-74`, `:79-80`, `:267`; `finance.repository.ts:85-86`); `todayISO()` returns the **UTC** date (`jalali.ts:54-56`) | In Iran (UTC+3:30) at 00:30 local, `todayISO()` returns the previous day; appointments and daily totals land on the wrong day |

**ID mapping** (this table uses `C-xx` for blockers; the bug register uses `BUG-xx`):
`C-01 = BUG-01`, `C-02 = BUG-02`, `C-03 = BUG-03`, `C-04 = BUG-08`, `C-05 = BUG-04`, `C-06 = BUG-06`, `C-07 = BUG-05`.

---

## 5. Feature status summary

| Feature | Status | One-line evidence |
|---|---|---|
| Scaffold / tooling | Partially implemented | Post-T01: local gates green and CI workflow added; first remote CI run pending push authorization |
| Authentication | Partially implemented | Login/register work in code; no logout UI, no reset flow, no profile bootstrap |
| SQLite bootstrap | Partially implemented | Schema + runner are good; runtime blocked (C-01, C-02) |
| Repositories | Partially implemented | 7 repositories; no formulas/photos; no transaction unit |
| Customers | Complete (MVP subset) | CRUD + search + unit tests; history placeholder |
| Services | Complete (MVP subset) | CRUD/deactivate + tests; management page only reachable by direct URL |
| Appointments | Partially implemented | Tested create/conflict/status; no edit UI, no delete button, no walk-in |
| Dashboard | Not implemented | 3-line placeholder |
| Finance reports | Partially implemented | Calculator + repository + hooks; page is a placeholder |
| Quick sale | Partially implemented | Dead component imports a missing CSS module and is not routed |
| Payments | Partially implemented | Repository + hook; no UI |
| Expenses | Partially implemented | Repository + hooks; no UI |
| Color formulas | Not implemented | Tables and types only; both pages are placeholders |
| Photos | Not implemented | Table + types only; no storage client |
| Local notifications | Partially implemented | Scheduled on create, cancelled on cancel/delete; permission never requested; edits do not reschedule |
| Outbox / sync | Partially implemented | Writes only; no engine, no pull, no status updates |
| Settings | Not implemented | 3-line placeholder |
| Search | Partially implemented | Customers UI; services repository only; nothing else |

Detailed per-requirement status: [`REQUIREMENTS_MATRIX.md`](./REQUIREMENTS_MATRIX.md).
Per-feature code evidence: [`IMPLEMENTATION_AUDIT.md`](./IMPLEMENTATION_AUDIT.md).

---

## 6. Document map

| Document | Use it for |
|---|---|
| [`AGENT_HANDOVER.md`](./AGENT_HANDOVER.md) | **Start here.** Self-contained onboarding brief for a new agent |
| [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) | Snapshot, verification results, maturity, blockers |
| [`REQUIREMENTS_MATRIX.md`](./REQUIREMENTS_MATRIX.md) | R-01…R-48 with priority, status, evidence, acceptance criteria |
| [`IMPLEMENTATION_AUDIT.md`](./IMPLEMENTATION_AUDIT.md) | What each feature actually does, file by file |
| [`ARCHITECTURE_AUDIT.md`](./ARCHITECTURE_AUDIT.md) | Documented vs actual architecture, data flow, inconsistencies |
| [`DATABASE_AUDIT.md`](./DATABASE_AUDIT.md) | Tables, relationships, migrations, RLS, defects, integrity risks |
| [`BUGS_AND_TECHNICAL_DEBT.md`](./BUGS_AND_TECHNICAL_DEBT.md) | BUG-xx / TD-xx register with severity and evidence |
| [`DEVELOPMENT_BACKLOG.md`](./DEVELOPMENT_BACKLOG.md) | T01…T16 tickets with dependencies and acceptance criteria |
| [`IMPLEMENTATION_DRAFT.md`](./IMPLEMENTATION_DRAFT.md) | Strategy, sequencing rationale, testing strategy, risks and open decisions |

---

## 7. Audit scope and limits

**Included:** full `src/` tree, both SQL migrations, `package.json` and lockfile, Vite/Vitest/TS/ESLint/Prettier configs, Capacitor config, `.env.example`, `.gitignore`, repository tests, git history and branch topology, installed dependency versions, and the relevant `@capacitor-community/sqlite` web implementation.

**Excluded / not possible here:** running the app on a device or emulator; applying migrations to a live Supabase project; verifying RLS with real JWTs; executing state-changing or destructive database operations; Android/iOS builds (platforms do not exist).

Conclusions that depend on those exclusions are marked **Needs verification** rather than Complete/Not implemented.

---

## 8. Verdict

- The **documentation** is good enough to continue: requirements, decisions log, and DB design are explicit and internally consistent.
- The **code** is a credible first slice, but the infrastructure that makes the product unique (offline queue, sync, recovery) is missing, and the app cannot currently start.
- The **next agent must begin with T01 (quality gates)**, then T02–T04 before any feature work. See [`DEVELOPMENT_BACKLOG.md`](./DEVELOPMENT_BACKLOG.md) and [`AGENT_HANDOVER.md`](./AGENT_HANDOVER.md#h-first-assignment).
