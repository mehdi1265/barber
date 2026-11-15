# IMPLEMENTATION AUDIT — Barber App

> **Question answered:** for each feature, what actually exists in the code, what is missing, and how would we know it is done?
> **Baseline:** `877ebde`. **Companion docs:** [`REQUIREMENTS_MATRIX.md`](./REQUIREMENTS_MATRIX.md) (status codes), [`BUGS_AND_TECHNICAL_DEBT.md`](./BUGS_AND_TECHNICAL_DEBT.md) (defect IDs), [`ARCHITECTURE_AUDIT.md`](./ARCHITECTURE_AUDIT.md), [`DATABASE_AUDIT.md`](./DATABASE_AUDIT.md).

---

## 0. Method and limits

Read every `.ts/.tsx` file under `src/`, both SQL migrations, and all config. Ran the test suite, type checker, bundler, linter, and formatter (results in `PROJECT_STATUS.md §2`). No runtime, device, or live Supabase project was available.

Repository tests are **not integration tests**: they inject a hand-written in-memory mock that pattern-matches SQL strings (`src/tests/unit/appointment.repository.test.ts:7-109`, same pattern in customer/service tests). SQL syntax that the mock does not understand is never executed, which is why defects like BUG-04 (`updated_at` on `sync_outbox`) pass CI.

---

## 1. Layer inventory

| Layer | Files | State |
|---|---|---|
| Entry / bootstrap | `main.tsx`, `app/bootstrap.ts`, `app/providers.tsx`, `app/router.tsx` | Bootstrap → render, 12 screens (+redirect/404), auth guards |
| UI shell | `shared/components/**`, `index.css`, `AppShell` | RTL shell, bottom nav, sync banner, reusable Button/Modal/ConfirmDialog/Field/Empty/Loading/SummaryCard |
| Features | 8 feature folders | Customers/services complete; appointments partial; 5 placeholders/dead |
| Domain logic | `finance.calculator.ts`, `helpers.ts`, `jalali.ts`, schemas | Calculators and formatting are pure and testable |
| Data access | 7 repositories, `finance.repository`, `outbox.repository` | Direct SQL, no unit-of-work |
| Persistence | `database.ts`, `migrations.ts`, `001_initial.sql` | Runner is sound; runtime init is broken |
| Backend | `services/supabase/client.ts`, `database.types.ts`, `supabase/migrations/001_initial_schema.sql` | Auth only; zero data calls |
| State | `auth.store.ts`, `sync.store.ts` | Auth used; sync store dead |
| Notifications | `local-notifications.ts` | Implemented but uncalled |
| Tests | 7 files, 71 tests | Repositories/schemas/helpers only |

---

## 2. Authentication — Partially implemented

**Files:** `features/auth/{LoginPage,RegisterPage,auth.schemas,auth.usecases}.tsx|ts`, `services/supabase/client.ts`, `state/auth.store.ts`, `app/bootstrap.ts`, `database/repositories/profile.repository.ts`.

**Works**

- Email/password login and registration through `supabase.auth`.
- Zod schemas with Persian messages (9 schema tests).
- Session restore on boot and `onAuthStateChange` subscription (`bootstrap.ts:27-49`).
- Zustand store persists only `userId` + `isAuthenticated` (`auth.store.ts:63-70`).
- Register creates a local `profiles` row (`auth.usecases.ts:51-66`).

**Gaps / defects**

| Gap | Evidence | Impact |
|---|---|---|
| No logout anywhere in UI | `logoutUseCase` (`auth.usecases.ts:72-90`) has no caller; `AppShell` has no account menu | User cannot sign out; account switching impossible |
| Logout warning is `console.warn` only | `auth.usecases.ts:80-84` | Silent data-loss risk if a user logs out on another device |
| Profile only created during registration | `auth.usecases.ts:51-66`; nothing in `bootstrap.ts` | Users whose profile write failed (or who pre-date the table) never get one |
| No password reset | no route, no `resetPasswordForEmail` | Standard account recovery missing |
| Session in `localStorage` | `client.ts:18-26` | Token at rest is not protected (acceptable for MVP web, not for a device) |
| Auth errors are raw Supabase messages | `LoginPage` / `RegisterPage` | Not translated/normalised |
| No timeout/retry around `getSession` | `bootstrap.ts:27-35` | A hanging refresh blocks startup |

**Tests:** schema only. No use-case or component tests.

**Definition of done:** covered by T05; acceptance criteria in matrix R-01…R-07.

---

## 3. Database bootstrap and migrations — Partially implemented (runtime blocked)

**Files:** `database/sqlite/database.ts`, `database/sqlite/migrations.ts`, `database/migrations/001_initial.sql`, `index.html`.

**Works**

- Migration runner tracks versions in `schema_migrations` and fails loudly (`migrations.ts:31-64`).
- Schema is complete for current entities (13 tables + indexes).
- Singleton connection with consistency check (`database.ts:49-80`).

**Gaps / defects**

| Gap | Evidence | Impact |
|---|---|---|
| `initWebStore()` on web with no `jeep-sqlite` | `database.ts:53`; `index.html` has only `#root` | **App never boots in a browser** (BUG-01) |
| Encrypted connection created, then `PRAGMA key` after `open()` | `database.ts:63-74` | Native open fails; key does not apply (BUG-02) |
| Web + encryption combination unsupported by plugin | same flags on both platforms | Web DB cannot open even if jeep-sqlite is added (BUG-02) |
| No `PRAGMA foreign_keys = ON` per connection | only inside `001_initial.sql:6`; connections are recreated | FK violations silently accepted (BUG-10) |
| Passphrase in `localStorage` | `database.ts:24-46` | Key extractable; TODO acknowledges it |
| No `saveToStore()` on web | plugin web store is in-memory | Data lost on reload (R-44) |
| No `sync_state`/pull cursor table | `001_initial.sql` | Incremental sync impossible without a migration (DB-11) |

**Tests:** none. Migration SQL is never executed in CI.

**Definition of done:** T02; acceptance in R-42…R-44 and R-48.

---

## 4. Customers — Complete (MVP subset)

**Files:** `features/customers/{CustomersPage,CustomerDetailPage,CustomerForm,customers.hooks,customers.schemas}.tsx|ts`, `database/repositories/customer.repository.ts`.

**Works**

- List with search (name/phone, `LIKE`), create modal, detail, edit modal, soft delete with confirm.
- Outbox row on create/update/delete (`customer.repository.ts:78,108,126`).
- Schema: trim, optional phone/notes, Persian messages (6 tests).
- Repository: user scoping, soft-delete filtering, search, count (11 tests).

**Gaps**

- Detail page history section is an explicit placeholder (`CustomerDetailPage.tsx:94`) → R-22.
- `%term%` search cannot use the `(user_id, name)` index at scale.
- Phone is free text; no normalisation on save (only digits normalised in search needle).
- No pagination; `findAll()` loads every customer.

**Tests:** repository + schema. No UI tests.

---

## 5. Services — Complete (MVP subset)

**Files:** `features/services/{ServicesPage,ServiceForm,services.hooks,services.schemas}.tsx|ts`, `database/repositories/service.repository.ts`.

**Works**

- List, create, edit, deactivate; active-only filtering; price stored ×100 (test asserts 100 Toman → 10,000).
- Outbox on create/update/deactivate.
- 8 repository tests.

**Gaps**

- Only reachable by typing `/settings/services`; `SettingsPage` is a placeholder with no link (R-25).
- No reactivation UI (repository supports `update({is_active})`).
- Deleted/deactivated services remain in historical snapshots by design (correct).

---

## 6. Appointments — Partially implemented

**Files:** `features/appointments/{AppointmentsPage,AppointmentForm,AppointmentDetailPage,appointments.hooks,appointments.schemas}.tsx|ts`, `database/repositories/appointment.repository.ts`, `shared/utils/jalali.ts`.

**Works**

- Day and week agenda with navigation (`AppointmentsPage.tsx:27-70`).
- Create form with multiple service lines, live end-time preview, Persian validation.
- Overlap check excludes cancelled rows and allows touching endpoints (`appointment.repository.ts:102-129`; tested).
- Status transitions with confirmations for cancel/no-show (`AppointmentDetailPage.tsx:33-57`).
- Soft delete + outbox (repository implemented).
- 9 repository tests.

**Gaps / defects**

| Gap | Evidence | Impact |
|---|---|---|
| Day/week ranges are UTC, `todayISO()` is UTC date | `appointment.repository.ts:72-74,79-80,267`; `jalali.ts:54-56` | Wrong day around local midnight (BUG-05) |
| No transaction across parent + services + outbox | `appointment.repository.ts:151-183` | Partial appointments (BUG-06) |
| Child service rows never enqueued | only parent payload at `:178-185` | Server restore loses service lines (BUG-07) |
| Edit UI missing; repo updates parent only | `appointment.repository.ts:202-243`; no modal in detail | Cannot reschedule or change services (R-15) |
| Delete UI suppressed | `AppointmentDetailPage.tsx:60-64` (`void handleDelete`) | Dead handler; no delete action (R-16) |
| Date/time inputs are Gregorian `<input type="date">` | `AppointmentForm.tsx` | Violates Jalali UX requirement (R-46) |
| No duplicate-submit guard | `useCreateAppointment` | Double-tap can insert two rows |
| `findByWeek` end range uses +7 days from Monday | `appointment.repository.ts:78-85` | Verify DST/month boundary behaviour after T04 |
| No pagination / virtualisation | `AppointmentsPage` | Large weeks are fine; months are not supported |

**Tests:** create (end time, services, outbox), conflict (overlap/adjacent/cancelled), status, soft delete. Tests use the SQL mock, so they prove logic shape, not SQL correctness.

---

## 7. Finance: calculator and repository — Partially implemented

**Files:** `features/finance/{finance.calculator,finance.repository,finance.hooks,finance.schemas}.ts`, `database/repositories/{visit,expense}.repository.ts`, `features/finance/FinancePage.tsx`.

**Works**

- Pure calculators: `dayRange`, `weekRange`, `monthRange`, `calcServiceAmount`, `calcReceived`, `calcDebt`, `calcExpenses`, `calcNet`, `buildDailyReport`, `buildFinancialSummary` (`finance.calculator.ts:26-146`).
- Repository aggregates visits, services, payments, expenses; totals and total debt (`finance.repository.ts:20-141`).
- Hooks for daily report, summary, debt, expenses, visits, payments, mutations.
- Money helpers and tests.

**Gaps / defects**

| Gap | Evidence | Impact |
|---|---|---|
| `FinancePage` is a placeholder | `FinancePage.tsx` | No finance UI at all |
| Hooks import unused `todayISO` | `finance.hooks.ts:7` | Build failed (BUG-03); **resolved in T01** |
| Day ranges are UTC and derived from a UTC date string | `finance.repository.ts:85-86`; `finance.calculator.ts:26-31` | Daily totals wrong near midnight (BUG-05) |
| No transaction around visit + services + payment | `visit.repository.ts:107-198` | Partial sale records (BUG-06) |
| Visit service rows not enqueued | `visit.repository.ts:155-162` only parent | Restore loses line items (BUG-07) |
| Payment over-payment not validated | `visit.repository.ts:165-198` | Paid > total possible |
| Expenses hard-delete locally | `expense.repository.ts:112-123` | Deletion cannot be replayed/restored (DB-09) |
| No discount/refund model | calculator/repo | Requirement gap flagged in `docs/09-open-questions.md` |
| `getSummary` takes raw ISO bounds | `finance.repository.ts:105` | Caller must implement local-day math correctly |

**Tests:** none for finance. This is the highest-risk untested domain because it feeds money decisions.

---

## 8. Quick sale — Partially implemented (dead code)

**Files:** `features/finance/QuickSaleForm.tsx` (not imported by the router or any page).

**Works:** form fields and validation exist (`finance.schemas.ts`).

**Gaps**

- Imports `./FinanceForm.module.css`, which does not exist → Vite build failure the moment it is routed.
- No repository use-case that creates visit + services + payment atomically.
- No route (`/finance/quick-sale` absent).
- No test.

**Definition of done:** T07.

---

## 9. Payments and expenses — Partially implemented (no UI)

**Files:** `database/repositories/visit.repository.ts` (`addPayment`, `getPaymentsForVisit`, `getPaymentsByDateRange`), `database/repositories/expense.repository.ts`, `finance.hooks.ts`.

**Works:** SQL CRUD, user scoping, outbox on writes.

**Gaps:** no screens, no forms, no hooks wired to components, no date-boundary correctness, no tests.

---

## 10. Dashboard — Not implemented

`DashboardPage.tsx` returns `<div>DashboardPage – Phase 2</div>`. All required data sources exist (`countToday`, `findNext`, `useDailyReport`, `useTotalOpenDebt`) but nothing calls them.

---

## 11. Color formulas — Not implemented

Tables `color_formulas` / `color_formula_items` and TypeScript interfaces exist. Both pages are placeholders; there is no repository, hook, schema, or outbox write. Item rows would need their own outbox entries (same class of bug as BUG-07).

---

## 12. Photos — Not implemented

`customer_photos` table and types exist. No camera integration, no `supabase.storage` call, no local file handling, no upload queue, no gallery. Bucket creation is only a commented SQL line (`supabase/migrations/001_initial_schema.sql:249-252`); storage policies are defined.

---

## 13. Notifications — Partially implemented (partially wired)

**Files:** `services/notifications/local-notifications.ts`, call sites in `features/appointments/appointments.hooks.ts`.

**Works:** `scheduleAppointmentReminder` runs after creating an appointment (`appointments.hooks.ts:115`); `cancelAppointmentReminder` runs on status `cancelled` (`:134`) and on soft delete (`:191`). Persian titles; id-based notification IDs.

**Gaps:** `requestNotificationPermission` has **no caller**, so on Android 13+ scheduling can silently fail; editing an appointment does not reschedule its reminder; `completed`/`no_show` do not cancel; no Android channel configuration; errors are swallowed with `console.warn`; no tests.

---

## 14. Sync / outbox — Partially implemented (write-only)

**Files:** `sync/outbox/outbox.repository.ts`, all repositories.

**Works**

- `addToOutbox` inserts id, user, entity type/id, operation, payload, status, attempts, timestamps (`outbox.repository.ts:1-29`).
- Every parent-entity mutation enqueues a row.

**Gaps / defects**

| Gap | Evidence | Impact |
|---|---|---|
| No push worker; `getPendingOutbox` has no callers | repository only | Nothing ever syncs (C-04) |
| `markOutboxDone` writes `updated_at` to a table without it | `outbox.repository.ts:51` vs `001_initial.sql:203-213` | Crash on first successful push (BUG-04) |
| `markOutboxFailed` does not update `updated_at`/`processed_at` | `:57-68` | No backoff scheduling |
| `markOutboxProcessing` has no recovery path | `:70-79` | Rows stuck in `processing` after a crash |
| Child rows not enqueued | appointment/visit/formula repos | Lost line items on restore (BUG-07) |
| Payloads are local row shapes, not server upsert payloads | repositories | Push layer must transform; no spec encoded |
| No tombstones for hard-deleted expenses | `expense.repository.ts` | Deletion lost on restore |
| `sync.store` never updated | no setter callers | UI indicator permanently idle |
| No manual trigger, retry, or error surface | none | User has no control or feedback |

---

## 15. Settings and profile — Not implemented

`SettingsPage.tsx` is a placeholder. No currency, name, phone, notification lead time, sync controls, or account actions. `ProfileRepository` exists but only `createProfile` is used.

---

## 16. Search — Partially implemented

Customers have UI + query; services have a repository method only; appointments and formulas have nothing. `matchesSearch` normalises the needle but not the haystack (`helpers.ts:110-112`). No unified results screen.

---

## 17. App shell, routing, and error handling — Partially implemented

**Works:** 12 screens (+ root redirect and 404) with `RequireAuth` / `RedirectIfAuth`, RTL bottom navigation, active states, sync banner slot, Persian 404.

**Gaps**

- No error boundary; a render error blanks the app.
- Bootstrap failure replaces `document.body` with an inline message including raw `String(err)` (`main.tsx:23-31`).
- No logout/account entry point in the shell.
- Routes are lazy-loaded through a shared `SuspenseWrapper`; keep this pattern when adding pages.
- `App.tsx`/`App.css` are the Vite template and are not referenced anywhere.

---

## 18. Dead code and unused exports (verified by search)

| Item | Location | Note |
|---|---|---|
| Vite template component | `src/App.tsx`, `src/App.css` | Unreferenced; safe to delete with approval |
| Base repository | `src/database/repositories/base.repository.ts` | Unused; uses CommonJS `require()` inside ESM (`:19`) |
| Quick sale form | `src/features/finance/QuickSaleForm.tsx` | Unrouted; missing CSS import |
| Outbox read/update helpers | `outbox.repository.ts:31-79` | `getPendingOutbox`, `markOutbox*` have no callers |
| Sync store | `state/sync.store.ts` | Read by shell; never mutated |
| `useNextAppointment` | `appointments.hooks.ts:77` | No consumer until dashboard |
| `base.repository` auth import | `base.repository.ts:19` | Would crash if used in browser |

> Deleting dead code is **not** part of this audit. It is listed for T01/T03 decisions and requires approval.

---

## 19. Test coverage inventory

| File | Tests | Covers | Does not cover |
|---|---|---|---|
| `appointment.repository.test.ts` | 9 | create shape, end time, services insert, outbox, conflicts, status, soft delete | real SQL, transactions, day boundaries |
| `customer.repository.test.ts` | 11 | CRUD, trim, soft delete, search, outbox | SQL syntax, pagination |
| `service.repository.test.ts` | 8 | CRUD, ×100 money, active filter, deactivate, outbox | UI |
| `customers.schemas.test.ts` | 6 | validation/trim/nullable | — |
| `auth.schemas.test.ts` | 9 | login/register validation | use-cases, Supabase errors |
| `helpers.test.ts` | 19 | UUID, ISO, end time, overlap, money, digits, search | DST/timezone |
| `jalali.test.ts` | 9 | display formatting, week helpers, `todayISO` **format only** | `todayISO` timezone correctness |
| **Total** | **71** | | finance, sync, bootstrap, components |

**Critical test gaps:** finance calculator/repository, outbox SQL, bootstrap/database init, auth use-cases, notification scheduling, child-table enqueueing, component rendering, and anything requiring a real SQLite instance.

---

## 20. Implementation verdict

| Feature | Requirements | Backlog task |
|---|---|---|
| Customers, services, money helpers | R-20, R-21, R-23, R-24, R-32 | Keep; regression tests only |
| Appointments | R-11…R-17 | T06 |
| Walk-in visits | R-18 | T07 |
| Auth/session | R-01…R-07 | T05 |
| Runtime DB | R-42…R-44, R-48 | T02 |
| Data integrity / outbox | R-38 | T03 |
| Local-day | R-13, R-28, R-29, R-46 | T04 |
| Finance UI | R-26…R-31 | T07 |
| Dashboard | R-08…R-10 | T08 |
| Sync | R-39…R-41 | T09, T10 |
| Formulas, photos, notifications | R-19, R-33…R-36 | T11…T13 |
| Settings/search | R-22, R-25, R-37 | T14, T15 |
| Security/release | R-43, R-45, R-47 | T16 |
