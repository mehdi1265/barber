# DEVELOPMENT BACKLOG — Barber App

> **Question answered:** what should be built next, in what order, with what dependencies, and how do we know each item is finished?
> **Baseline:** `877ebde`. **Status codes and requirement IDs:** [`REQUIREMENTS_MATRIX.md`](./REQUIREMENTS_MATRIX.md). **Defect IDs:** [`BUGS_AND_TECHNICAL_DEBT.md`](./BUGS_AND_TECHNICAL_DEBT.md).

---

## How to use this backlog

1. Work **one ticket at a time**. Do not open a second P0/P1 ticket until the current one meets all acceptance criteria.
2. Read the ticket's **Read first** list before editing.
3. Write or extend tests *in the same commit series* as the change.
4. Keep commits small; one logical change per commit.
5. Update the status column in `REQUIREMENTS_MATRIX.md` only when acceptance criteria are actually met.
6. Never push without explicit authorization.
7. Never edit an existing migration; add a new numbered migration.

### Global Definition of Done (applies to every ticket)

- [ ] All quality gates pass locally: `type-check`, `lint`, `format:check`, `test`, `build` (once T01 exists; before that, `npm test` + `build`).
- [ ] New behaviour has tests, or a documented manual verification script when automation is impossible (device, Supabase project).
- [ ] No unrelated refactor, formatting, or dependency change in the same commit.
- [ ] No change to `main` or `docs`.
- [ ] No secrets, real credentials, or `.env` content committed.
- [ ] `audit/REQUIREMENTS_MATRIX.md` statuses updated for the affected requirement IDs.
- [ ] `audit/PROJECT_STATUS.md` blockers updated if one is resolved.
- [ ] Diff reviewed with `git diff` / `git status` before commit.

### Priority and order

Tickets are numbered in **recommended execution order**. Dependencies are hard prerequisites; do not reorder without recording why in the ticket.

| Wave | Tickets | Theme |
|---|---|---|
| 0 — Stabilise | **T01, T02, T03, T04** | Build, boot, data integrity, correct days |
| 1 — Core MVP | **T05, T06, T07, T08** | Accounts, appointments, money, dashboard |
| 2 — Cloud | **T09, T10** | Push, pull/recovery |
| 3 — Features | **T11, T12, T13, T14, T15** | Formulas, photos, reminders, settings, search |
| 4 — Release | **T16** | Security, RLS verification, release readiness |

> Rationale for putting sync after the core local MVP: push needs stable payloads and transactions (T03). Putting sync first would repeatedly rewrite the queue. See `IMPLEMENTATION_DRAFT.md §4`.

---

## T01 — Quality Gates

**Status: complete locally (2026-11-12); first remote CI run pending push authorization.**

**Completion note (2026-11-12):** all gates exit 0 locally and tests remain 71/71. Removing the unused `oxlint` dependency regenerated the lockfile (`npm ci` verified). The Prettier commit is formatting-only but **not whitespace-only**, because Prettier removes semicolons and normalises quotes, so `git diff -w` is non-empty by design. Logic equivalence was checked by comparing TypeScript emit for all 52 changed `.ts/.tsx` files and PostCSS ASTs for all 16 changed `.css` files: **0 differences**.

**Size:** M · **Priority:** P0 · **Requirements:** R-47, R-45 · **Fixes:** BUG-03, TD-01…TD-04, TD-13, TD-20

**Read first:** `package.json`, `tsconfig.json`, `tsconfig.app.json`, `eslint.config.js`, `.prettierrc`, `src/features/finance/finance.hooks.ts:1-10`, `PROJECT_STATUS.md §2`.

**Goal:** a clean clone can prove its own health with one command per gate, and CI enforces it.

**Scope**

1. Fix the build blocker: remove the unused `todayISO` import in `finance.hooks.ts` (do not change finance logic).
2. Make `type-check` real: `tsc -b` (project references) instead of the vacuous `tsc --noEmit` against a `files: []` root config. Prove it catches an error by adding one temporarily and reverting.
3. Fix ESLint for flat config: `eslint .` (and `lint:fix`). Resolve the 53 errors / 16 warnings:
   - auto-fixable issues first (`--fix`), then manual fixes;
   - do **not** disable rules globally to get green; if a rule is genuinely unsuitable, change it in its own commit with a one-line rationale;
   - typed-lint fixes must not change behaviour (use `void` for fire-and-forget handlers or make handlers synchronous).
4. Apply the Prettier baseline (`npm run format`) in a **separate formatting-only commit**; `format:check` must pass.
5. Add `.github/workflows/ci.yml`: Node 24, `npm ci`, `type-check`, `lint`, `format:check`, `test`, `build`. Cache npm.
6. Add a root `README.md` that points to `docs/`, `audit/AGENT_HANDOVER.md`, install steps, and the command table.
7. Resolve the linter story: completed in T01 by removing `oxlint` and keeping ESLint only. Do not leave an installed linter with no script.
8. Use `fileURLToPath` for Vite aliases (`vite.config.ts`) to remove the Windows `file://` risk.

**Out of scope:** deleting `App.tsx`/`base.repository.ts`, adding tests for untested features, changing app behaviour.

**Acceptance criteria**

- `npm ci && npm run type-check && npm run lint && npm run format:check && npm test && npm run build` all exit 0 from a clean clone.
- `npm run type-check` fails if a deliberate type error is introduced (documented in the PR/commit message).
- `npm test` still reports 71/71 or more.
- CI workflow exists, is syntactically valid, and mirrors the local commands. (A green GitHub run requires push authorization; mark as pending until then.)
- `git diff --stat` shows no changes under `supabase/` or `src/database/migrations/`.
- Formatting commit contains whitespace only (verify with `git diff -w`).

**Tests:** existing suite must stay green. Add no feature tests here. If lint fixes change async handler behaviour, add a component-level regression test for the affected form.

**Risks:** a 92-file formatting commit obscures review → keep it isolated; ESLint `--fix` can alter semantics → review every hunk.

---

## T02 — Runtime Database Bootstrap (web + native)

**Size:** L · **Priority:** P0 · **Requirements:** R-42, R-43, R-44, R-48 · **Fixes:** BUG-01, BUG-02, BUG-09, BUG-10, TD-18

**Read first:** `src/database/sqlite/database.ts` (all), `src/app/bootstrap.ts`, `src/main.tsx`, `index.html`, `capacitor.config.ts`, `src/tests/setup.ts`, `docs/05-technical-architecture.md §3`.

**Goal:** the app starts in a browser and on Android, with a correctly opened database and actionable failure UI.

**Scope**

1. **Web:** add `jeep-sqlite` (and its required Stencil loader) to dependencies; register `<jeep-sqlite>` in `index.html` or `main.tsx`; verify `initWebStore()` resolves.
2. **Encryption split:**
   - native: call `SQLiteConnection.setEncryptionSecret(passphrase)` (or the plugin's documented API for v7) **before** `open()`;
   - web: create the connection with `encrypted = false` and document that web storage is for development only.
3. **PRAGMA:** execute `PRAGMA foreign_keys = ON` immediately after every `open()` / `retrieveConnection()`.
4. **Web durability:** call `saveToStore(DB_NAME)` after mutations (or on `pause`/`visibilitychange`), and `loadFromStore` on boot; otherwise document web as ephemeral and do not claim persistence.
5. **Bootstrap resilience:** DB failure must not prevent the login screen from rendering. Show a Persian status/error screen with a retry action. Do not dump `String(err)` into the page.
6. **Android platform:** `npx cap add android`; verify `npm run build && npx cap sync android`; document the Android Studio run step and required SDK versions.
7. Keep the connection singleton; add `closeDatabase()` usage on app pause if the plugin requires it.

**Out of scope:** moving the passphrase to secure storage (T16), changing schema, sync.

**Acceptance criteria**

- `npm run dev` shows `/login` (not a blank page) within a few seconds.
- Creating a customer in the browser and reloading either keeps it (persistence implemented) or the limitation is documented in `README` and `DATABASE_AUDIT.md` — no silent loss.
- On Android emulator/device: app launches, migrations run, `PRAGMA foreign_keys` returns 1, and the DB cannot be opened without the app.
- Introducing a wrong DB name produces the Persian error screen with retry, not a blank page or raw stack.
- `npx cap sync android` completes after a green build.

**Tests:** add a bootstrap test with mocked Capacitor platform to assert: web path calls `initWebStore`, native path calls `setEncryptionSecret` before `open`, pragma is executed once per connection. Manual device checklist recorded in the ticket/commit.

**Risks:** plugin API differences between v6/v7; Android SDK availability in the execution environment; encryption migration of an existing unencrypted DB (fresh installs only — document).

---

## T03 — Data Integrity: Transactions, Outbox Correctness, Child Rows

**Size:** L · **Priority:** P0 · **Requirements:** R-38 (and integrity for R-11, R-31) · **Fixes:** BUG-04, BUG-06, BUG-07, BUG-23, DB-01…DB-07, DB-15

**Read first:** `outbox.repository.ts` (all), `appointment.repository.ts`, `visit.repository.ts`, `expense.repository.ts`, `customer.repository.ts`, `service.repository.ts`, `profile.repository.ts`, `001_initial.sql:203-216`, `docs/06-database-api-design.md §3`.

**Status:** complete locally (2026-11-13). Strategy chosen: **one outbox row per row**, with
`entity_type` equal to the table name; a single action-level `client_op_id` is generated per
repository write and child keys are `${client_op_id}:${rowId}`. Expense delete keeps a full-row
`delete` tombstone. `color_formula_items` will use the same rule when its repository lands in T11.
Verified by `src/tests/unit/{appointment.repository,outbox.integration,write-integrity.integration}.test.ts`
against `node:sqlite`; migration 002 was also applied/skipped correctly in a production browser build.

**Goal:** every write is atomic, every change is queued exactly once, and child data is recoverable.

**Scope**

1. Add `withTransaction(db, fn)` in `src/database/sqlite/transaction.ts` using the plugin's `beginTransaction`/`commitTransaction`/`rollbackTransaction`. Roll back on any throw; always release.
2. Wrap every multi-statement repository operation:
   - appointment create / update / status / soft delete;
   - visit create / payment;
   - customer create / update / delete;
   - service create / update / deactivate;
   - expense create / update / delete;
   - profile upsert.
3. Add migration `002_outbox_hardening.sql` (new file, registered in `migrations.ts`):
   - `processed_at TEXT`, `last_attempt_at TEXT`, `client_op_id TEXT UNIQUE` on `sync_outbox`;
   - optional index `(status, created_at)`.
   Do **not** edit `001`.
4. Fix `markOutboxDone` / `markOutboxFailed` / `markOutboxProcessing` to use the real columns; record `last_error`, increment `attempt_count`, set `last_attempt_at`.
5. Enqueue child rows: `appointment_services`, `visit_services`, `color_formula_items` (and photos when they exist). Define one strategy and document it:
   - **preferred:** one outbox row per row, with `entity_type` = table name;
   - alternative: parent payload embeds children. Choose once; tests must enforce it.
6. Generate `client_op_id` per user action; use it for idempotent retry.
7. Expense delete: enqueue a `delete` row with the full previous row payload before deleting locally (tombstone). Document restore semantics.
8. Add a real-SQLite integration test harness (see `IMPLEMENTATION_DRAFT.md §7`) and migrate at least the outbox and appointment tests to it.

**Acceptance criteria**

- Injected failure after any statement leaves **zero** rows from that operation (parent, children, outbox).
- A 3-service appointment produces exactly 1 appointment + 3 service + 4 outbox rows.
- `markOutboxDone` runs successfully against real SQLite.
- Re-running the same `client_op_id` does not enqueue a duplicate.
- Deleting an expense leaves a `delete` outbox row containing the deleted row's data.
- Migration `002` applies cleanly to a fresh DB and to an existing DB with migration `001`.

**Tests:** transaction rollback (per operation), outbox column correctness, child enqueue counts, idempotency, outbox status transitions.

**Risks:** the plugin's transaction API differs by platform; nested transactions are not supported → keep `withTransaction` non-reentrant and assert that.

---

## T04 — Local-Day and Jalali Time Semantics

**Size:** M · **Priority:** P0 · **Requirements:** R-13, R-28, R-29, R-46 · **Fixes:** BUG-05, BUG-17, BUG-27, TD-07

**Read first:** `src/shared/utils/jalali.ts`, `src/shared/utils/helpers.ts`, `src/features/finance/finance.calculator.ts`, all `findByDay`/`countByDay` methods, `docs/01-project-brief.md §4`, `docs/10-decisions-log.md`.

**Goal:** "today" means the user's local day, everywhere, and dates are entered in Jalali.

**Scope**

1. Add `src/shared/utils/datetime.ts`:
   - `localDateISO(date = new Date(), timeZone?)` → `YYYY-MM-DD` of the local calendar;
   - `localDayRange(dateISO)` → `{ start, end }` as ISO-8601 UTC instants;
   - `localWeekRange(mondayISO)`, `localMonthRange(jalaliYearMonth)` if the calculator needs them;
   - one documented timezone source (device local; optional profile override later).
2. Replace `todayISO()` and every `T00:00:00.000Z` / `T23:59:59.999Z` construction in:
   `appointment.repository.ts`, `visit.repository.ts`, `expense.repository.ts`, `finance.repository.ts`, `finance.calculator.ts`, `AppointmentsPage.tsx`, `AppointmentForm.tsx`.
3. Keep storage as UTC ISO-8601. **No schema change.**
4. Fix `applyTimeToDate` to build the date from explicit year/month/day in local time rather than parsing a UTC date string.
5. Add a minimal Jalali date input (three selects: year/month/day, or a vetted date-picker dependency) and use it in the appointment form and finance filters. Display remains `formatJalaliDate*`.
6. Add a finance-calculator test file — the domain currently has zero tests.

**Acceptance criteria**

- With `TZ=Asia/Tehran`, at local 00:30 the day agenda and daily report show that day (regression test).
- Tests cover 00:00, 00:30, 12:00, 23:59, and a DST zone (e.g. `America/New_York` spring forward).
- Appointment created at 09:00 local stores the correct UTC instant and displays 09:00.
- Week/month ranges include exactly the intended local days.
- Every date the user sees or enters is Jalali; no Gregorian `<input type="date">` remains.

**Tests:** `datetime.test.ts` with `vi.setSystemTime` and explicit timezone env; calculator tests; one component test for the date input.

**Risks:** changing week/month boundaries can shift existing reports by one day — document the intended definition before coding; do not migrate stored data (timestamps are already UTC).

**Status:** complete locally (2026-11-13). `src/shared/utils/datetime.ts` provides `localDateISO`, `localDayRange`, `localWeekRange`, `localMonthRange`, `localJalaliMonthRange`, `addLocalDays`, and `localDateTimeToISO`; all ranges are end-exclusive. Week = 7 local days starting on Saturday (Iranian week). Time zone = device `Intl` zone, overridable per call (decision D-25). Repositories and hooks use `localDateISO` for cache invalidation. `JalaliDateInput` (three selects) replaces the only Gregorian date input; the finance UI does not exist yet (T07), where the component will be reused. Tests: `datetime.test.ts` (17), `finance.calculator.test.ts` (11), `jalali-date-input.test.tsx` (4).

---

## T05 — Authentication and Session Completion

**Size:** M · **Priority:** P0 · **Requirements:** R-01…R-07 · **Fixes:** BUG-11, BUG-12, BUG-19 (partial), BUG-20 (defer secure storage), BUG-32

**Status:** complete locally (2026-11-13). `ensureProfile()` runs after login, after registration, on bootstrap, and on `SIGNED_IN`; it is idempotent and never throws (a missing database retries on the next launch). Registration shows the "check your email" screen when Supabase returns no session (D-20). The app shell has an account menu; logout always asks for confirmation and shows the pending outbox count, then falls back to `signOut({ scope: 'local' })` and keeps every local row. `/forgot-password` (anti-enumeration copy) and `/reset-password` exist; the reset page creates the session from the URL fragment with `setSession` because `detectSessionInUrl` is `false`. Supabase error text is mapped in `auth.errors.ts` and logged only. Tests: `auth.usecases.test.ts` (14), `account-menu.test.tsx` (4), `reset-password-page.test.tsx` (2); 151/151 total. Gates are green. Not verified: a real Supabase project is not configured yet, and native reset deep links are deferred to T16 (D-26).

**Read first:** `features/auth/*`, `app/bootstrap.ts`, `state/auth.store.ts`, `services/supabase/client.ts`, `database/repositories/profile.repository.ts`, `supabase/migrations/001_initial_schema.sql:26-40`.

**Goal:** a user can register, log in, recover access, sign out safely, and always has a profile.

**Scope**

1. `ensureProfile()`: idempotent upsert on login/bootstrap; never duplicate; tolerate offline (retry on next launch).
2. Logout UI: account menu in `AppShell` + confirmation dialog showing pending outbox count (from T03) and a clear warning.
3. Password reset: `/forgot-password` and `/reset-password`; `resetPasswordForEmail`; set `detectSessionInUrl` appropriately or parse the recovery token explicitly; new password form with Zod validation.
4. Auth error mapping: Persian messages for invalid credentials, unconfirmed email, rate limit, network failure. Keep the raw message in logs only.
5. Email-confirmation decision: read `docs/09-open-questions.md`; if confirmation is enabled, show a "check your email" screen and handle the confirmed redirect. If disabled, document it.
6. Offline session: if a stored session exists and the network is down, allow the app to open in read/write local mode; sync later (coordinate with T09).
7. Add use-case tests with a mocked Supabase client.

**Acceptance criteria**

- Register → either dashboard or documented confirmation screen; exactly one `profiles` row.
- Log in on a device with an existing account and no local profile → profile is created once.
- Logout with pending rows shows the count and requires confirmation; rows remain for that user.
- Reset flow works end-to-end against a real (test) Supabase project; failure messages are Persian.
- No raw Supabase error text reaches the UI.

**Tests:** use-case tests (register/login/logout/ensureProfile/reset), component test for the logout dialog and reset form.

**Risks:** reset links in Capacitor need a deep-link/custom URL scheme — decide web-first or configure the scheme; document.

---

## T06 — Appointments Completion

**Size:** M · **Priority:** P0 · **Requirements:** R-11…R-17 · **Fixes:** BUG-13, BUG-14, BUG-22, DB-10

**Status:** complete locally (2026-11-13). `AppointmentRepository.create` checks conflicts inside the insert transaction; `update` re-checks conflicts (excluding itself), updates the parent, and replaces service lines in the same transaction, queueing a tombstone per removed child and an insert per new child. The detail page now has an edit mode (shared `AppointmentForm`, prefilled from the appointment and services) and a confirm-gated delete that soft-deletes and navigates back. `AppointmentForm` ignores repeated submits while the first is in flight. Every appointment query filters `deleted_at`; a new test proves deleted rows disappear from day/week/detail/count/next. Reminders are rescheduled on edit and cancelled for cancelled/no_show. Tests: appointment repository (15, real SQLite) and double-submit form (1); 156/156 total. Gates green. Device runtime remains unverified.

**Read first:** `features/appointments/*`, `appointment.repository.ts`, `shared/utils/helpers.ts` (`appointmentsOverlap`), `app.test` fixtures.

**Goal:** the full appointment lifecycle is usable: create, view, reschedule, change services, cancel, delete.

**Scope**

1. Edit mode: reuse `AppointmentForm` in the detail page; submit through the existing update hook.
2. Rewrite `AppointmentRepository.update` to replace service lines **inside one transaction** and re-run the conflict check (excluding itself).
3. Render the delete action; confirm; soft delete; navigate back.
4. Disable submit while pending; guard double submit.
5. Add a race-safety re-check inside the create transaction (check + insert atomically).
6. Ensure `deleted_at` rows never appear in day/week/list/detail queries (verify every query).
7. Optional: duplicate an appointment as a new booking.

**Acceptance criteria**

- Edit date/time/services: detail and list update, totals correct, one outbox row per changed row.
- Moving onto an existing booking shows a conflict and writes nothing.
- Delete removes it from all lists but keeps it for future history (soft delete).
- Double-tap create yields one appointment.
- Tests: update transaction, conflict-on-update, delete removes from queries, double-submit guard.

**Risks:** replacing children changes their IDs → sync must not resurrect deleted children; coordinate with T09 payload strategy.

---

## T07 — Finance: Visits, Payments, Expenses, Reports, Quick Sale

**Size:** L · **Priority:** P1 · **Requirements:** R-18, R-26…R-32 · **Fixes:** BUG-15, BUG-21, BUG-23

**Read first:** `features/finance/*` (including `QuickSaleForm.tsx`), `visit.repository.ts`, `expense.repository.ts`, `finance.calculator.ts`, `docs/04-wireframes.md` (finance section), `docs/06-database-api-design.md`.

**Goal:** the owner can record a walk-in sale, take (partial) payments, log expenses, and see correct daily/weekly/monthly numbers.

**Scope**

1. Finance page with tabs: **Day**, **Summary**, **Expenses**, **Debts** (Jalali date navigation from T04).
2. Visit flow: create walk-in / check-in from an appointment; choose customer, services (snapshot), quantities, discounts; save.
3. Payment flow: list payments per visit, add cash/card/other, partial allowed, over-payment blocked against `line_total` sum (inside the transaction).
4. Quick sale: add `FinanceForm.module.css` (or reuse an existing module), route `/finance/quick-sale`, one transactional use-case (visit + services + payment).
5. Expenses: list by day, create/edit/delete (delete = tombstone per T03).
6. Reports: day totals, week/month summary, per-customer debt list; all via the local-day helpers.
7. Money: keep `INTEGER × 100`; format with `formatToman`; no floats in UI state.

**Acceptance criteria**

- A 3-service walk-in with a partial payment shows service total, paid, remaining debt, and net for the day.
- Over-payment is rejected with a Persian message and writes nothing.
- Expense create/edit/delete updates the day report and net immediately.
- Quick sale completes in one screen and survives a forced failure with zero partial rows.
- Calculator has unit tests; repository has integration tests against real SQLite.
- `npm run build` remains green with the quick-sale route included.

**Tests:** calculator (unit), repository (integration), one component smoke test per tab.

**Risks:** discount/refund semantics are unresolved (see open questions) — implement `discount_amount` only, do not invent refunds; flag for product decision.

---

## T08 — Dashboard

**Size:** S · **Priority:** P1 · **Requirements:** R-08, R-09, R-10

**Read first:** `features/dashboard/DashboardPage.tsx`, `appointments.hooks.ts` (`useNextAppointment`), `finance.hooks.ts` (`useDailyReport`, `useTotalOpenDebt`), `docs/04-wireframes.md §1`.

**Goal:** the first screen answers "how is today going?" in under two seconds.

**Scope**

1. Summary cards: today's appointments, completed visits, received, expenses, net, total debt.
2. Next appointment card: customer, Jalali date/time, service, tap → detail.
3. Quick actions: new appointment, quick sale.
4. Loading skeleton, empty states, pull-to-refresh (re-query).
5. Wire the sync banner to real state (if T09 is done) or hide it until then.

**Acceptance criteria**

- All six values equal the finance page for the same local day.
- Next appointment hides when none exists and updates after creating one.
- Quick actions navigate correctly.
- Component test with mocked hooks; no direct SQL in the page.

---

## T09 — Sync Push Engine

**Size:** L · **Priority:** P0 · **Requirements:** R-39 · **Fixes:** BUG-08, BUG-26, BUG-28, DB-07

**Read first:** `outbox.repository.ts`, all repository payloads, `supabase/migrations/001_initial_schema.sql`, `services/supabase/client.ts`, `state/sync.store.ts`, `docs/05-technical-architecture.md §6`, `docs/06-database-api-design.md §3`.

**Goal:** queued changes reach Supabase reliably and idempotently, with visible status.

**Scope**

1. `src/sync/engine/push.ts`:
   - read pending/failed rows in `created_at` order (batch ≤ 50);
   - map `entity_type` → table; strip local-only fields (`local_path`); convert booleans/decimals;
   - `upsert` for insert/update (profiles **must** upsert, BUG-26); `delete` by id for deletes;
   - mark processing → done/failed; exponential backoff honouring `attempt_count`; cap attempts and surface a terminal error.
2. Triggers: after a mutation (debounced), on network regain, on app resume, and a manual "sync now" action.
3. Guard against concurrent runs with a module-level mutex.
4. Drive `sync.store`: `syncing`, `synced`, `error`, `pendingCount` from a real count.
5. Server-side: ensure `updated_at` is not client-authoritative (document the policy; see T10).
6. Tests: pure mapping functions; worker with a mocked Supabase client (success, 4xx terminal, 5xx retry, duplicate delivery).

**Acceptance criteria**

- With a test Supabase project, creating one of each entity results in matching rows remotely and zero pending outbox rows.
- Killing the app mid-push leaves rows recoverable (`processing` reset to `pending` on next start).
- Same `client_op_id` delivered twice creates no duplicate remote row.
- A 401 stops the run and shows "session expired"; a 500 retries with backoff.
- Pending count in the shell matches the table.

**Risks:** RLS/grants may reject writes (verify with a real project); profile trigger conflict; timestamp authority. No push without credentials.

---

## T10 — Sync Pull, Recovery, and Conflict Policy

**Size:** L · **Priority:** P0 · **Requirements:** R-40, R-41 · **Fixes:** BUG-25, DB-04, DB-06, DB-12, DB-13, DB-14, TD-10

**Read first:** `docs/05-technical-architecture.md §6`, `docs/10-decisions-log.md §6`, `DATABASE_AUDIT.md §4-§9`, T09 output.

**Goal:** a new or wiped device restores everything; two devices converge deterministically.

**Scope**

1. Migration `003_sync_state.sql`: single-row `sync_state(id, last_pull_at, device_id, schema_version)`.
2. Full pull when local data is empty: tables in FK-safe order (profiles → customers → services → appointments → appointment_services → visits → visit_services → payments → expenses → color_formulas → items → photos).
3. Incremental pull: per-table `updated_at > cursor` (with an overlap window) or a documented single-cursor strategy; store cursor after a successful merge.
4. Merge rules: define and implement one policy (recommended: server `updated_at` wins per row; local unsynced edits win only when they are still pending, using `client_op_id`); record conflicts in a log table or console with a user-visible count.
5. Tombstones: apply remote deletes; ensure locally deleted expenses/photos are not resurrected.
6. Recovery UI: progress, retry, "restore from cloud" on an empty device, and a warning before wiping local data.
7. Add missing server indexes and decide `ON DELETE` behaviour as a new migration.
8. Tests: merge function unit tests, FK ordering, delete propagation, two-device simulation (manual or scripted).

**Acceptance criteria**

- Wipe local DB → login → all entities and child lines restore; totals match the source device.
- Offline edit on A + online edit on B converge to one deterministic result after both sync, with the policy documented.
- A remote delete removes the local row but keeps local history needed for reports (define per entity).
- Interrupted pull resumes without duplicating rows (upsert by id).
- No data loss on repeated pull.

**Risks:** the server `updated_at` trigger invalidates client timestamps (BUG-25); large histories need pagination; photo bytes need a separate strategy (T12).

---

## T11 — Color Formulas

**Size:** M · **Priority:** P1 · **Requirements:** R-33, R-34 · **Fixes:** DB-09 (decimals)

**Read first:** `color_formulas`/`color_formula_items` schemas, `docs/02-prd.md §7`, `docs/04-wireframes.md`, T03 payload strategy.

**Goal:** barbers can save, browse, and reuse color recipes per customer.

**Scope**

1. Repository + hooks + schemas for formulas and items, with transactions and outbox rows for both tables.
2. List page: search by customer/brand/code; create.
3. Detail/edit: items (product, code, amount, unit), oxidant fields, processing time, notes, customer/visit links.
4. Duplicate-as-template action.
5. Decimal policy: align with server `NUMERIC(5,2)/(8,2)` — store as integer hundredths of a gram or restrict UI precision; document the choice.
6. Customer detail links to formulas (R-22, coordinate with T14).

**Acceptance criteria**

- Formula with 3 items saves offline, reopens identically, and appears under the customer.
- Editing an item does not change historical visit amounts.
- Duplicate creates a copy; original unchanged.
- Decimal round-trip preserves the entered value exactly.
- Tests: repository integration, schema validation, one component test.

---

## T12 — Photos

**Size:** L · **Priority:** P1 · **Requirements:** R-35

**Read first:** `customer_photos` schema, storage policies (`001_initial_schema.sql:248-266`), T09/T10, `docs/02-prd.md §7`.

**Goal:** before/after photos are captured offline, stored locally, uploaded later, and visible on another device.

**Scope**

1. Add `@capacitor/camera`; capture/select, compress to a documented max size.
2. Store the binary in app-private storage; keep `local_path`; create a `customer_photos` row with `storage_path` after upload.
3. Upload queue via the outbox (or a dedicated queue) with retry; strip `local_path` before push.
4. Storage path convention: `${userId}/${customerId}/${photoId}.jpg`; add the missing storage UPDATE policy and ensure the bucket exists (T16).
5. Gallery on customer/visit detail; consent checkbox enforced before upload; delete = local + remote (tombstone).
6. Decide whether photo bytes are part of "full restore" and document the cost.

**Acceptance criteria**

- Photo taken offline is visible immediately and uploads after reconnect.
- Second device restores the photo via a signed URL; no public bucket.
- Delete removes both local file and remote object, and does not reappear on pull.
- Consent flag stored; UI blocks upload without consent.
- Manual device test recorded; no secret/URL leakage.

**Risks:** storage quotas, image size, orphaned objects on failed DB writes, iOS/Android permission differences.

---

## T13 — Notifications and Reminders

**Size:** S · **Priority:** P1 · **Requirements:** R-19, R-36

**Read first:** `services/notifications/local-notifications.ts`, `appointment.repository.ts` (status/update/delete), T06.

**Goal:** the owner is reminded of upcoming appointments, reliably.

**Current state:** `scheduleAppointmentReminder` runs on create and `cancelAppointmentReminder` runs on cancel/delete (`appointments.hooks.ts:115,134,191`); permission is never requested and edits do not reschedule.

**Scope**

1. Request permission contextually (after the first booking or in settings), with a Persian rationale; handle denial.
2. Android channel configuration with a documented sound/importance.
3. Schedule one reminder per active appointment at a configurable lead time (default 30 min); cancel/reschedule on edit, cancel, delete, and status change to completed/no_show.
4. Tapping a notification opens the appointment detail (deep link or app-state routing).
5. Reschedule all pending reminders on app start (notifications may be cleared by OS updates).
6. Tests with a mocked plugin; manual device matrix (permission granted/denied, app killed).

**Acceptance criteria**

- Booking asks once, schedules exactly one notification, and it fires with the app closed on Android.
- Editing time replaces the notification; cancelling removes it.
- Denied permission shows a non-blocking explanation; no crash.
- No duplicate notifications after restart.

---

## T14 — Settings, Profile, and Customer History

**Size:** M · **Priority:** P2 · **Requirements:** R-22, R-25

**Read first:** `SettingsPage.tsx`, `ProfileRepository`, `CustomerDetailPage.tsx:94`, `docs/04-wireframes.md §6`.

**Goal:** a real settings screen and complete customer profiles.

**Scope**

1. Settings: profile (display name, phone, currency), services link, notification lead time, sync status + "sync now" + last sync, about/version, logout entry.
2. `CustomerDetailPage`: appointment history (past/upcoming), visits with amounts and paid/remaining, formulas, photos — reuse existing hooks.
3. Empty states and Jalali dates everywhere.
4. Guard: changing currency is display-only; no conversion of stored amounts (document).

**Acceptance criteria**

- Settings links reach services, sync, and logout.
- Profile edits persist locally and queue for sync.
- Customer detail shows real history and updates after a new visit.
- Currency change affects formatting only; stored values unchanged.
- Component tests for settings and history.

---

## T15 — Global Search

**Size:** M · **Priority:** P2 · **Requirements:** R-37

**Read first:** `customer.repository.ts:38-48`, `service.repository.ts:39-48`, `helpers.ts` (`normalizeDigits`, `matchesSearch`), `docs/04-wireframes.md §5`.

**Goal:** one query finds customers, services, appointments, and formulas.

**Scope**

1. A search page/sheet accessible from the shell or dashboard.
2. Repository queries per entity with `LIMIT`; normalise Persian/Arabic digits on **both** sides.
3. Grouped results with type icons and direct navigation.
4. Debounce (250–300 ms), loading, empty, and error states.
5. Optional: FTS5 virtual tables if performance requires (new migration; justify).

**Acceptance criteria**

- Query "۰۹۱۲" finds a customer stored as "0912…".
- Results grouped and navigable; no more than N per group with a "see all" link.
- Response < 300 ms for 5,000 customers on a mid-range device.
- Tests for normalisation and query building.

---

## T16 — Security, RLS Verification, and Release Readiness

**Size:** L · **Priority:** P0 (release gate) · **Requirements:** R-43, R-45, R-47 + all remaining verification

**Read first:** `DATABASE_AUDIT.md §6`, `BUGS_AND_TECHNICAL_DEBT.md` (P0/P1), `IMPLEMENTATION_DRAFT.md §9`.

**Goal:** the app is safe to give to a real barber with real customer data.

**Scope**

1. **Secrets at rest:** move Supabase session and DB key to Capacitor SecureStorage/Keychain/Keystore; remove the passphrase from `localStorage`.
2. **RLS verification:** a documented two-user test matrix: for every table, user B cannot select/insert/update/delete user A rows; storage objects likewise. Include SQL snippets and expected `0 rows` / `new row violates row-level security`.
3. **Migration idempotency:** `DROP POLICY IF EXISTS`, `CREATE INDEX IF NOT EXISTS`, bucket creation, storage UPDATE policy; verify a full re-run on a staging project.
4. **Error handling:** React error boundary, Persian fatal screen, no raw error/stack exposure; structured logs with a local ring buffer.
5. **Supply chain:** Dependabot/Renovate, `npm audit` in CI, secret scanning; pin CI actions by SHA.
6. **Backup/restore runbook:** how to export the device DB, how to force a full pull, how to recover from a corrupted cache.
7. **Release:** Android signing config (never commit keystores), versioning, `npm run build && cap sync`, smoke test on a clean device with a clean account.
8. **Final audit pass:** re-run every command in `PROJECT_STATUS.md §2` and update the matrix to reality.

**Acceptance criteria**

- Two-user RLS matrix passes on a live project; results recorded (no credentials committed).
- No token or key in `localStorage` on device.
- Cloud migration re-runs without error on a fresh and an existing project.
- Error boundary catches a forced render error and shows a Persian screen.
- CI runs `npm audit` and secret scanning; build reproducible from a clean clone.
- Fresh-install smoke test: register → create customer/service → book → pay → expense → dashboard correct → restart → data intact → wipe → login → restore.
- Audit documents updated; no requirement left as “Needs verification” without an owner.

---

## Dependency graph

```
T01 ──> T02 ──> T03 ──> T04
                 │        │
                 ├──> T05 │
                 │        │
                 ├──> T06 <┘
                 │     │
                 │     ├──> T07 ──> T08
                 │     │
                 ├──> T09 ──> T10 ──> T11
                 │              │
                 │              └──> T12
                 ├──> T13
                 └──> T14
T07 + T11 ──> T15
everything ──> T16
```

Hard edges: T01→T02→T03; T03→T09; T09→T10; T04→T06/T07/T08; T03+T04→T06.

---

## Suggested commit granularity

| Ticket | Commits |
|---|---|
| T01 | (1) remove unused import, (2) fix type-check script, (3) fix lint script + code fixes, (4) formatting only, (5) CI + README |
| T02 | (1) web plugin wiring, (2) encryption split + pragma, (3) bootstrap error UI, (4) Android platform |
| T03 | (1) migration 002, (2) transaction helper, (3) repository wrapping, (4) child enqueue, (5) outbox SQL fix, (6) integration harness |
| T04 | (1) datetime module + tests, (2) repository replacement, (3) Jalali input, (4) calculator tests |
| T05 | (1) ensureProfile, (2) logout UI, (3) reset flow, (4) error mapping |
| T06 | (1) edit transaction, (2) edit UI, (3) delete UI, (4) race guard |
| T07 | (1) calculator tests, (2) visit/payment use-cases, (3) expenses UI, (4) finance page, (5) quick sale |
| T08 | (1) dashboard |
| T09 | (1) mapping, (2) worker, (3) store/UI, (4) tests |
| T10 | (1) migration, (2) full pull, (3) incremental + merge, (4) recovery UI |
| T11 | (1) repo, (2) pages, (3) duplicate, (4) decimals |
| T12 | (1) capture/storage, (2) queue, (3) gallery, (4) policies |
| T13 | (1) permission, (2) scheduling lifecycle, (3) deep link |
| T14 | (1) settings, (2) customer history |
| T15 | (1) search |
| T16 | security, RLS, release — separate commits per area |

Commit style: imperative subject, scope in parentheses, reference IDs, e.g. `fix(finance): remove unused todayISO import (BUG-03)`.
