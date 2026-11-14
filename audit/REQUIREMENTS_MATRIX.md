# REQUIREMENTS MATRIX — Barber App

> **Purpose:** single source of truth for *what the product must do* and *how much of it exists*.
> **Baseline:** `877ebde`. **Audit date:** 2026-11-12.
> **Rule:** every row is derived from `docs/` (01-project-brief, 02-prd, 03-user-flow, 04-wireframes, 05-technical-architecture, 06-database-api-design, 07-development-roadmap, 08-ai-agent-specification, 09-open-questions, 10-decisions-log) or from already-agreed decisions. No new requirement was invented.

---

## Legend

**Status**

| Value | Meaning |
|---|---|
| **Complete** | Implemented for the stated scope and backed by unit tests or direct code evidence. Runtime may still be blocked at platform level (see BUG-01); that is tracked as a bug, not as missing feature work. |
| **Partially implemented** | Code exists for part of the requirement; usable only after the listed gaps are closed. |
| **Not implemented** | No user-facing implementation; at most schema/types/placeholders. |
| **Needs verification** | Implementation exists but cannot be confirmed in this environment (runtime, device, or live backend required). |
| **Blocked** | Cannot be completed or verified until a P0 prerequisite is resolved. |

**Priority:** `P0` = required for the first usable MVP / data safety; `P1` = required for MVP completeness; `P2` = post-MVP / polish.

**Source shorthand:** `B` brief · `P` PRD · `U` user flow · `W` wireframes · `A` architecture · `D` database/API design · `R` roadmap · `AI` agent spec · `Q` open questions · `L` decisions log. Section numbers refer to the corresponding file in `docs/`.

**Summary (recounted 2026-11-14):** 48 requirements — **43 complete or complete locally, 3 partially implemented (R-42, R-46, R-48), 1 needs verification (R-43), 1 verified at DB level with the hosted probe pending.**

> **Remediation update — 2026-11-13:** Accounts/security rows below were
> revised after the release-blocker pass. Password reset is now OTP-first with
> an HTTPS/custom-scheme fallback (R-05); local data and outbox are
> account-scoped with a safe failed-logout path (R-03/R-04, R-38); the two-user
> SQL covers storage SELECT/INSERT/UPDATE/DELETE, generic UPDATE/DELETE denial,
> anonymous denial, composite ownership FKs, and post-rollback cleanup (R-07);
> the SDK 36 upgrade is scripted but no Android build exists (R-48). Local
> gates: type-check/lint/format/build green, **354 tests across 50 files**.
> The local-data wipe (runbook §5.1 item 1) is implemented and tested: it
> refuses while retryable outbox rows are unsynced (terminal failures do not
> block), then deletes only the signed-in account's business rows, outbox,
> cursor, and photo files.
> Sync runs are fenced to the account that started them, pull never adopts or
> transfers foreign rows, and the bootstrap profile placeholder is not queued.
> Server→device deletion reconciliation is implemented in code (T17/D-46);
> migration 005 is unapplied on hosted projects and the two-device test is
> still missing.
> PostgreSQL `001–004`, migration idempotency, hosted Supabase, OTP email
> delivery, and every device run remain **not executed**. Migration 004's
> composite keys are still `NOT VALID`; a read-only legacy mismatch report
> (`supabase/tests/legacy_ownership_mismatches.sql`) is now CI-gated, but its
> result on real data is **unknown**. Logout keeps local data by design.
>
> **Zod update (ninth pass, 2026-11-13):** `zod` is now `4.6.7` with
> `@hookform/resolvers` 7 and `react-hook-form` 7.92 (D-45); the
> `GHSA-mrhx-c7xc-m3w5` advisory is remediated and `npm audit --omit=dev`
> reports zero. Two regression tests were added, bringing the suite to 354.
> Android remains unbuilt (Google Maven 404 in this environment).
>
> **Deletion reconciliation (tenth pass, 2026-11-14):** D-46/TD-21 is
> implemented — migration 005, tombstone push, two-phase child-first pull,
> pending/newer-edit protection, no-resurrection guard, and keyset pagination.
> 363 tests across 51 files pass locally, including 7 new real-SQLite
> reconciliation cases. Remaining evidence: migration 005 on the target
> project and a two-device delete test. The vitest/tinypool critical dev
> advisories are closed by vitest 5.1.0.
>
> **Operational validation (eleventh pass, 2026-11-14): BLOCKED.** Static
> checks passed (idempotent 005, seven tables + indexes, owner-only RLS,
> updated_at trigger, CI double-apply). Migration execution and the 10
> two-device scenarios were not run — no staging credentials/project ref and
> no local PostgreSQL tooling. No hosted database was contacted or modified.

---

## 1. Account, session, and isolation (R-01…R-07)

| ID | Requirement | Src | Pri | Status | Evidence (files) | Missing work | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| R-01 | Register a new owner account with email + password; Persian validation messages; create local profile row | P §3, U §1 | P0 | Complete (local) | `features/auth/RegisterPage.tsx`, `auth.usecases.ts`, `auth.schemas.ts`, `profile.repository.ts` | Confirmation screen implemented (D-20); profile is repaired by `ensureProfile()`; real-project email delivery unverified | R-06 | Registering a fresh email lands on `/dashboard` (or a documented "check your email" screen); a `profiles` row exists locally; invalid input shows Persian Zod messages |
| R-02 | Log in with email + password; persist session across app restarts | P §3, U §1 | P0 | Complete (device verification pending) | `LoginPage.tsx`, `auth.usecases.ts`, `bootstrap.ts`, `state/auth.store.ts` | Token-refresh expiry path and native relaunch unverified | R-48 | After login, `/dashboard` renders; killing and reopening the app keeps the user signed in; expired token is refreshed or user is redirected to `/login` |
| R-03 | Warn before logout if unsynced changes exist; clear session; never lose queued work silently | P §7, U §7, L | P1 | Complete (local) | `AccountMenu.tsx`, `AppShell.tsx`, `auth.usecases.ts`, `outbox.repository.ts`; logout error path in `SettingsPage.tsx`/`AppShell.tsx` | Count and queued rows are scoped to the signed-in `user_id`; a failed sign-out keeps the signed-in UI and shows a Persian error instead of a false logout | R-04, R-38 | Logout asks for confirmation when pending outbox > 0; on confirm the session clears and queued rows remain only for that user; if the stored session cannot be cleared, the UI does not pretend the user is signed out |
| R-04 | Logout | U §7 | P1 | Complete (local) | `AccountMenu.tsx`, `AppShell.tsx`, `auth.usecases.ts`; `account-isolation.integration.test.ts`, `outbox.integration.test.ts`; `features/settings/local-data.ts` + Settings «حذف داده‌های این دستگاه»; `local-data-wipe.test.ts`, `settings-local-data.test.tsx` | Local rows stay on disk by design but are account-scoped; B cannot read, update, delete, or push A's rows. The device-handoff wipe is implemented: it refuses while the account has unsynced outbox rows and deletes only that account's business rows, outbox, cursor, and photo files | R-02 | A visible action signs the user out and returns to `/login`; after B signs in, B sees none of A's records; a confirm-gated wipe removes the current account's local data without touching another account's rows or the schema |
| R-05 | Password reset via email link | P §3, U §2 | P1 | Complete (local, OTP-first) | `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx` (code + link phases), `auth.usecases.ts` (`recoveryRedirectUrl`, `verifyRecoveryOtpUseCase`), `recovery-link.ts`, `recoveryOtpSchema` | Hosted Supabase template must include `{{ .Token }}` and `{{ .ConfirmationURL }}`, redirect allowlist, OTP length/expiry; real email delivery unverified. HTTPS App Links need a real domain + `assetlinks.json` | R-02 | "Forgot password" sends an email; the user can enter a 6–10 digit code in the app or open an allow-listed HTTPS link to set a new password; malformed/lookalike links never create a session |
| R-06 | Ensure a local `profiles` row exists for every authenticated user (including users created before the profile table, or whose registration profile write failed) | L §2, D §2 | P1 | Complete (local) | `auth.usecases.ts` (`ensureProfile`), `bootstrap.ts`, `auth.usecases.test.ts` | None for scope; device restart repair unverified | R-01 | Any logged-in user has exactly one local `profiles` row; deleting it and restarting recreates it without duplicating on the server |
| R-07 | Strict per-owner data isolation, locally and in Postgres | P §9, D §3 | P0 | Verified at DB level (hosted probe pending); new assertions not yet run | `*.repository.ts` filter by `user_id`; `supabase/migrations/001_initial_schema.sql` (RLS on all 12 tables); `004_same_user_ownership.sql` (composite same-user FKs, `NOT VALID`); `supabase/tests/rls_two_user_check.sql` (storage SELECT/INSERT/UPDATE/DELETE, generic UPDATE/DELETE denial, anon denial, cross-owner inserts, cleanup); `supabase/tests/legacy_ownership_mismatches.sql`; `postgres_bootstrap.sql` + CI job `rls-postgres` (directory-driven migration loop); `npm run rls:check`; local SQLite migrations `005`/`006` + `account-isolation.integration.test.ts` | CI runs 43453924205/43456039040 proved the earlier SQL on ephemeral Postgres 15. The current SQL (migration 004 + expanded assertions + legacy gate) has **not run in CI yet**; no Docker/psql locally. Hosted project: no probe; 004 not applied; composite keys `NOT VALID` | R-02, R-03 | User B cannot read/update/delete User A rows via supabase-js, cannot link children to A's parents, and local queries/outbox never return another `user_id` |

---

## 2. Dashboard (R-08…R-10)

| ID | Requirement | Src | Pri | Status | Evidence (files) | Missing work | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| R-08 | Dashboard shows today’s counts and money: appointments, completed visits, received, expenses, net, total debt | P §4, W §1 | P1 | Complete (T08) | `DashboardPage.tsx` (six cards + net row), `useDailyReport`, `useAppointmentsByDay` | — | R-28, R-30, R-13 | Opening `/dashboard` shows the six values for the current **local** day and matches the finance page for the same day |
| R-09 | Show the next upcoming appointment | P §4, W §1 | P1 | Complete (T08) | `DashboardPage.tsx` (next card + empty state), `useNextAppointment`, `useCustomer` | — | R-13 | With a future appointment, the card shows customer, time, and service; with none, a Persian empty state appears |
| R-10 | Show sync status and pending count in the shell | P §4, A §7 | P2 | Complete locally (T09) | `AppShell.tsx` banner, `sync.manager.ts` (`setStatus/setPending/setConflicts/setError`), SettingsPage sync panel | Offline/error states are covered by unit tests; real network verification pending | R-39 | Banner reflects idle/syncing/offline/error; pending count matches `sync_outbox` pending rows |

---

## 3. Appointments (R-11…R-19)

| ID | Requirement | Src | Pri | Status | Evidence (files) | Missing work | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| R-11 | Create an appointment with customer, title, date/time, duration, multiple services (price + duration snapshot), notes | P §5, U §3, D §2 | P0 | Complete (local) | `AppointmentForm.tsx`, `appointments.hooks.ts`, `appointment.repository.ts` | Device runtime unverified | R-03, R-12 | Saving creates one `appointments` row + N `appointment_services` rows atomically, with `end_at = start_at + duration`; double-tap does not duplicate |
| R-12 | Prevent overlapping appointments for the same owner; touching endpoints are allowed; cancelled appointments do not block | P §5, D §2 | P0 | Complete (local) | `appointment.repository.ts` (`checkConflict`); `helpers.appointmentsOverlap`; repository tests (overlap, adjacency, cancelled, create/update race guard) | Single-process SQLite closes the race; multi-device conflicts are a T10 concern | — | Creating an overlapping appointment returns a Persian conflict message and writes nothing; adjacent bookings succeed |
| R-13 | Day and week agenda views with Jalali display and date navigation | P §5, W §2, U §3 | P0 | Implemented locally (T04, 2026-11-13) | `AppointmentsPage.tsx` (day/week toggle, local navigation); `datetime.ts`; `JalaliDateInput.tsx` | Month view is out of scope for this requirement | R-11 | Agenda for the selected local day shows exactly that day's appointments, across DST and midnight boundaries; dates render in Jalali |
| R-14 | Appointment detail with service list, totals, status, and actions | P §5, W §3 | P0 | Complete (local) | `AppointmentDetailPage.tsx`, `appointments.hooks.ts` | Device runtime unverified | R-11 | Detail shows customer, Jalali date/time, services with prices, total, status; actions match the allowed transitions |
| R-15 | Edit an existing appointment (reschedule, change services) | P §5, U §4 | P1 | Complete (local) | `AppointmentDetailPage.tsx`, `AppointmentForm.tsx`, `appointment.repository.ts` (`update`), `appointments.hooks.ts` | Replacing children changes IDs; push must apply the queued tombstones first (T09) | R-11, R-12 | Editing from detail updates the appointment and its service lines atomically; conflicts are re-checked |
| R-16 | Cancel and delete an appointment (soft delete + outbox tombstone) | P §5, U §4 | P1 | Complete (local) | `AppointmentDetailPage.tsx`, `appointment.repository.ts` (`updateStatus`, `softDelete`) | Device runtime unverified | R-14 | Cancel sets `status='cancelled'`; delete sets `deleted_at` and removes it from lists; both enqueue exactly one outbox row |
| R-17 | Status lifecycle: reserved → confirmed → completed, plus cancelled / no_show | P §5, W §3 | P0 | Complete (local) | `AppointmentDetailPage.tsx`, `NEXT_STATUS` map; `appointment.repository.ts` (`updateStatus`) | Not runtime-verified on a device | — | Illegal transitions are impossible in the UI; each change persists and appears in lists |
| R-18 | Walk-in / direct visit without an appointment | P §6, U §5 | P1 | Complete (T07) | `VisitForm.tsx`, `FinancePage.tsx` (Day tab), `visit.repository.ts` (`create`) | — | R-26, R-31 | A walk-in can be recorded in one flow, appears in that day’s visits, and produces a payment/debt record |
| R-19 | Local notification reminder before an appointment | P §5, U §3 | P1 | Complete (local) | `local-notifications.ts` (lead setting, stable ID, Android channel, reschedule-all), `ReminderManager`, `ReminderPermissionBanner`, Settings section, `appointments.hooks.ts`; 5 notification tests | Real-device app-killed run | R-11, R-15 | Booking asks permission once, schedules one reminder at the chosen lead time, and editing/cancelling replaces/cancels it |

---

## 4. Customers (R-20…R-22)

| ID | Requirement | Src | Pri | Status | Evidence (files) | Missing work | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| R-20 | Customer create/edit/soft-delete with name, phone, notes | P §5, U §3, D §2 | P0 | Complete | `CustomersPage.tsx`, `CustomerDetailPage.tsx`, `CustomerForm.tsx`, `customer.repository.ts`; 11 repo + 6 schema tests | None for scope | R-02 | CRUD works offline; deleted customers disappear from lists but remain for history |
| R-21 | Search customers by name or phone, Persian/Arabic digit tolerant | P §5, W §2 | P1 | Complete | `customer.repository.ts:38-48` (`LIKE`), `CustomersPage` + `useCustomerSearch` | Index is on `(user_id, name)` / `(user_id, phone)`; `%term%` cannot use them at scale | R-20 | Typing "۰۹۱۲" finds a customer stored as "0912…" within 300 ms for ≤5,000 customers |
| R-22 | Customer detail shows appointment and visit history | W §3, P §5 | P1 | Complete (local) | `CustomerDetailPage.tsx`, `CustomerHistory.tsx`, `appointment.repository.ts` (`findByCustomer`), `visit.repository.ts` (`findSummariesByCustomer`), `customer-history.test.tsx`; formulas section from T11 | Browser/device walkthrough; multi-device pull refresh | R-13, R-18 | Detail lists past/upcoming appointments and visits with Jalali dates and amounts |

---

## 5. Services (R-23…R-25)

| ID | Requirement | Src | Pri | Status | Evidence (files) | Missing work | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| R-23 | Service create/edit/deactivate with price and suggested duration | P §5, U §6, D §2 | P0 | Complete | `ServicesPage.tsx`, `ServiceForm.tsx`, `service.repository.ts`; 8 repo + schema tests | None for scope | R-02 | Active services appear in the appointment form; deactivated services disappear from new bookings but remain in history |
| R-24 | Appointment lines snapshot service name/price/duration so later price edits do not rewrite history | D §2 | P0 | Complete | `appointment_services` schema (`001_initial.sql:69-80`); insert at `appointment.repository.ts:166-177`; `service_name_snapshot`, `price`, `duration_minutes` | — | R-11 | Changing a service price does not alter any existing appointment or visit amount |
| R-25 | Service management is reachable from Settings | W §6, U §6 | P2 | Complete (local) | `SettingsPage.tsx` services link → `/settings/services`; route in `router.tsx` | Browser/device walkthrough | R-23 | Tapping "Services" in Settings opens the management page |

---

## 6. Finance (R-26…R-32)

| ID | Requirement | Src | Pri | Status | Evidence (files) | Missing work | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| R-26 | Record payments against a visit (cash/card/other, partial allowed) | P §6, D §2 | P1 | Complete (T07) | `FinancePage.tsx` (visit detail + `PaymentForm`), `visit.repository.ts` (`addPayment`, `OverpaymentError`) | Receipt editing/refunds deferred (D-23) | R-18 | A visit accepts multiple payments; paid total and remaining debt update immediately, and over-payment writes nothing |
| R-27 | Record/edit/delete expenses with category and date | P §6, D §2 | P1 | Complete (T07) | `ExpenseForm.tsx`, `FinancePage.tsx` (Expenses tab), `useUpdateExpense`/`useDeleteExpense` | Category is free text, not a fixed list | R-48 | An expense appears in the day report and net calculation, and survives restart |
| R-28 | Daily report: service total, received, expenses, net, debt for a **local** day | P §6, W §4 | P1 | Complete (T07) | `FinancePage.tsx` (Day cards), `finance.calculator.ts`, `finance.repository.ts` | — | R-26, R-27 | Report totals equal the sum of visible visits/payments/expenses for that local day |
| R-29 | Weekly and monthly summary with date range | P §6, W §4 | P1 | Complete (T07) | `FinancePage.tsx` (Summary tab: week/month), `localJalaliMonthRange`, `getSummary` | Arbitrary custom range picker deferred | R-28 | Selecting a Jalali month shows the same totals as the per-day reports summed |
| R-30 | Outstanding debt per customer | P §6, W §4 | P1 | Complete (T07) | `finance.repository.ts` (`getOpenDebts`), `useOpenDebts`, `FinancePage.tsx` (Debts tab) | — | R-26 | Total debt equals unpaid balances across visits and is attributable per customer |
| R-31 | One-step quick sale: create visit + service lines + payment | P §6, U §5 | P1 | Complete (T07) | `QuickSalePage.tsx`, `/finance/quick-sale`, one transactional `VisitRepository.create` | — | R-18, R-26 | One form records a paid walk-in and returns to the day list with correct totals |
| R-32 | Money encoded consistently as integer Toman × 100, displayed as Toman with Persian separators | D §4, L §5 | P0 | Complete | `helpers.ts` (`formatToman`, `tomanToStorage`, `storageToToman`), `currency.ts` (`formatMoney`, label-only currency display), tests in `helpers.test.ts`; `service.repository.ts` storage ×100 test | Naming (`amountCents`) is misleading but behaviour is correct; no rounding policy for discounts | — | Storing 50,000 Toman yields `5000000`; display returns "۵۰٬۰۰۰ تومان"; no float drift; changing currency only changes the label |

---

## 7. Color formulas (R-33…R-34)

| ID | Requirement | Src | Pri | Status | Evidence (files) | Missing work | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| R-33 | Create/edit color formulas for a customer, with multiple items (brand, code, amount, ratio) and notes | P §7, D §2 | P1 | Complete (local) | `color-formula.repository.ts`, `color-formulas.schemas.ts`, `color-formulas.hooks.ts`, `ColorFormulaForm.tsx`, `ColorFormulasPage.tsx`, `ColorFormulaDetailPage.tsx`; 7 repo + 4 schema + 1 form tests | Browser/device walkthrough; photo attachment (R-35) | R-03, R-22 | A formula with 3 items saves offline, reopens correctly, and appears in the customer's history |
| R-34 | Reuse a previous formula as a template for a new one | P §7, U §6 | P2 | Complete (local) | `ColorFormulaRepository.duplicate` (new IDs via `create`, title suffix `«(کپی)»`); detail-page «کپی» button; `color-formula.repository.test.ts` | None for scope | R-33 | "Duplicate" prefills a new formula without modifying the original |

---

## 8. Photos (R-35)

| ID | Requirement | Src | Pri | Status | Evidence (files) | Missing work | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| R-35 | Capture/attach before/after photos, store bytes in Supabase Storage, keep local path when offline | P §7, D §5 | P1 | Complete (local) | `customer-photo.repository.ts`, `photos.hooks.ts`, `photo-storage.ts`, `PhotoCaptureForm.tsx`, `PhotoGallery.tsx`; push upload via `SyncClient.uploadPhoto`; signed-URL fallback; `supabase/migrations/003_photo_storage_policy.sql`; bucket created by `001`; 3 repo + 1 form + 2 push tests | Live-project storage policy run; real-device camera/permission run | R-39, R-40 | A photo taken offline is visible immediately, uploads after reconnect, and is retrievable on a second device |

---

## 9. Notifications (R-36)

| ID | Requirement | Src | Pri | Status | Evidence (files) | Missing work | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| R-36 | Request notification permission and schedule/cancel local reminders reliably | P §5, A §8 | P1 | Complete (local) | `local-notifications.ts`, `ReminderPermissionBanner.tsx`, `ReminderManager.tsx`, Settings reminders section, `preferences.store.ts`; `local-notifications.test.ts` | Real-device permission matrix (granted/denied/app killed) | R-19 | On Android 13+, permission is requested contextually; reminders fire with the app closed; cancelling removes the notification |

---

## 10. Search (R-37)

| ID | Requirement | Src | Pri | Status | Evidence (files) | Missing work | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| R-37 | Global search across customers, services, appointments, formulas | P §8, W §5 | P2 | Complete (local, T15) | `shared/utils/search.ts`; `features/search/search.repository.ts`; `SearchPage.tsx`; `search-page.test.tsx`; `search.repository.test.ts`; dashboard `/search` link | Mid-range-device timing for the 5,000-customer target; FTS only if profiling shows a need | R-33 | One query returns grouped results from all four domains, tolerant of Persian digits |

---

## 11. Synchronization and recovery (R-38…R-41)

| ID | Requirement | Src | Pri | Status | Evidence (files) | Missing work | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| R-38 | Capture every local write in `sync_outbox` with entity, operation, payload, timestamp, status | A §6, D §3 | P0 | Implemented locally (T03, 2026-11-13); push pending | `outbox.repository.ts` (all reads/mutations filtered by `user_id`); `005_outbox_user_scope.sql`; `src/database/sqlite/transaction.ts`; all repositories; `002_outbox_hardening.sql`; `outbox.integration.test.ts` | Payloads are local-row shaped; the push layer must map them to the PG schema (R-39). Legacy rows with `user_id = ''` are never selected | R-11 | Any create/update/delete of a synced entity produces exactly one correct outbox row, including child tables, owned by the acting user |
| R-39 | Push outbox to Supabase with retry/backoff, idempotency, and status updates | A §6, D §3 | P0 | Complete locally (T09) | `sync/engine/push.ts`, `payload.ts`, `supabase-sync-client.ts`; outbox `markOutbox*` helpers (all user-scoped); `account-isolation.integration.test.ts` | Supabase project not configured, so only injected-client tests exist. PostgREST `23503` is treated as retryable so composite-FK ordering never terminally drops a child row | R-38 | With network, pending rows drain to `done`; a forced 500 leaves rows `failed` with `last_error` and they retry later; no duplicates on retry; B's session cannot push A's rows |
| R-40 | Pull/restore all owner data on a new device | P §10, A §6 | P0 | Complete locally (T10) | `sync/engine/pull.ts`, `003_sync_state.sql`, `006_sync_cursor_user.sql`, `restoreFromCloud()` | Real Supabase project pending. The pull cursor is ignored when it belongs to another account, avoiding a truncated pull after an account switch | R-39 | Logging in on a wiped device restores customers, services, appointments, visits, payments, expenses, formulas, and photos |
| R-41 | Conflict policy and manual "sync now" control | A §6, L §6 | P1 | Complete locally (T10) | `sync/engine/pull.ts` (pending-local-wins, 5-min overlap), Settings "همگام‌سازی اکنون" + full restore; docs D-29/D-30 | Multi-device convergence is unverified without a server | R-39, R-40 | Concurrent edits on two devices converge deterministically; the user can trigger and observe a sync |

---

## 12. Platform, security, and quality (R-42…R-48)

| ID | Requirement | Src | Pri | Status | Evidence (files) | Missing work | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| R-42 | Offline-first: reads and writes work with no network | B §2, A §2 | P0 | Partially implemented | All repositories are SQLite-only; no network in the write path; `bootstrap.ts` keeps `/login` available when the database fails and retries with a timeout | Login/session must tolerate offline after first login; sync state UI | R-02, R-39 | Airplane mode: existing user can open the app, view and edit data; changes queue and later sync |
| R-43 | Local database encrypted (SQLCipher) with a device-bound key | A §9, L §7 | P1 | Needs verification | `database.ts` calls `setEncryptionSecret` before `open`; web uses `no-encryption` and is dev-only; `capacitor.config.ts` enables Android/iOS encryption; Supabase sessions use Keychain/Keystore via `secure-session-storage.ts`; `--backup` sets `allowBackup="false"` + `dataExtractionRules` excluding root/file/database/sharedpref/external from cloud backup and D2D | Device test that the DB is unreadable without the app; merged-manifest verification after a successful build | R-48 | DB file is unreadable without the app; the SQLCipher file, session material, and private records are excluded from cloud backup and device transfer |
| R-44 | Web build persists data across reload | A §2 | P2 | Complete | `web-store.ts` registers `jeep-sqlite` with `autosave`; `saveToStore` runs on hide/pagehide; reload reuses the IndexedDB store (verified: migration is not re-applied) | — | R-48 | Creating a customer in the browser and reloading keeps it |
| R-45 | No secrets or credentials committed | B §9, L §8 | P0 | Complete | `.env.example` uses placeholders; `.gitignore` excludes `.env*`, `*.keystore`, `*.jks`, `keystore.properties`; no keys in source or git history; release runbook documents secret handling; no signing credential was generated in this pass | Enable GitHub secret scanning + push protection in repository settings | — | `git grep` for key patterns finds no real credentials; `.env` is never tracked |
| R-46 | Persian RTL UI with Jalali dates and Persian digits | B §4, W §1, L §9 | P1 | Partially implemented | `index.css` RTL, `AppShell` Persian labels, `JalaliDateInput.tsx`, `jalali.ts` | Mixed Latin digits in some inputs; no i18n layer | R-13 | Every displayed and entered date is Jalali; layout is RTL; numbers use Persian digits where specified |
| R-47 | Quality gates: type-check, lint, format, tests, build, CI | A §10, R §7 | P0 | Complete | `package.json` scripts repaired; `tsconfig.node.json`; `.github/workflows/ci.yml` (adds `npm audit --omit=dev --audit-level=critical`); `.github/dependabot.yml`; local gates green; CI runs 43456039040 and 43456745065 green | New changes not yet pushed: 2026-11-13 local run is type-check/lint/format/build green with **354 tests / 50 files**; `sqlite-migrations.test.ts` guards 001–006 coverage; the next CI run is the first to exercise migration 004, the expanded SQL, and the legacy-mismatch gate | — | A clean clone passes type-check, lint, format check, tests, audit gate and build in CI on every push |
| R-48 | App builds and runs on web (dev) and Android | B §1, R §1 | P0 | Partially implemented | Web verified (`/login` renders, DB ready, persistent store); `android/`/`ios/` generated and `cap sync` passes; `scripts/android-release.ts` configures signing, versioning, backup hardening, and (via `--sdk 36`) compile/target 36 + AGP 8.11.1 + Gradle 8.14; `docs/11-release-runbook.md` §6.1 | A successful build on a Google-Maven-reachable machine; the offline attempt could not resolve AGP/google-services; signed AAB; device/emulator run incl. target-36 edge-to-edge; iOS build on macOS | R-47 | `npm run dev` shows login; `npm run build && npx cap sync android` installs and launches on a device/emulator with targetSdk 36 |

---

## Appendix — Persian UI vocabulary (verbatim from source)

The product is Persian-first. These strings are quoted exactly so the next agent preserves tone and terminology rather than retranslating:

| English meaning | Persian (verbatim) | Source |
|---|---|---|
| Service name is required | `نام خدمت الزامی است` | `appointments.schemas.ts:7` |
| Appointment title is required | `عنوان نوبت الزامی است` | `:29` |
| Date is required | `تاریخ الزامی است` | `:32` |
| Time is required | `ساعت الزامی است` | `:35` |
| Invalid time format | `فرمت ساعت صحیح نیست` | `:36` |
| Duration must be greater than zero | `مدت نوبت باید بزرگ‌تر از صفر باشد` | `:42` |
| At least one service is required | `حداقل یک خدمت الزامی است` | `:53` |
| Reserved | `رزرو شده` | `:61` |
| Confirmed | `تأیید شده` | `:62` |
| Completed | `انجام شده` | `:63` |
| Cancelled | `لغو شده` | `:64` |
| No-show | `عدم مراجعه` | `:65` |

New UI text must match this vocabulary (for example, never “کنسل” when the domain says `لغو شده`). Any new term should be added here and to the relevant feature file in the same commit.

---

## Cross-reference: requirement → backlog task

| Requirements | Task |
|---|---|
| R-47, R-45 | T01 |
| R-48, R-42, R-43, R-44 | T02 |
| R-38 (+ integrity for R-11, R-31) | T03 |
| R-13, R-28, R-29, R-46 | T04 |
| R-01…R-07 | T05 |
| R-11…R-17 | T06 |
| R-18, R-26…R-32 | T07 |
| R-08, R-09, R-10 | T08 |
| R-39 | T09 |
| R-40, R-41 | T10 |
| R-33, R-34 | T11 |
| R-35 | T12 |
| R-19, R-36 | T13 |
| R-22, R-25 | T14 |
| R-37 | T15 |
| All | T16 |
