# BUGS AND TECHNICAL DEBT — Barber App

> **Question answered:** what is broken, how bad is it, how do we reproduce and verify a fix, and what structural debt will slow every future task?
> **Baseline:** `877ebde`. **Companion:** [`DATABASE_AUDIT.md`](./DATABASE_AUDIT.md) (DB-xx defects), [`DEVELOPMENT_BACKLOG.md`](./DEVELOPMENT_BACKLOG.md) (task IDs).

---

## Severity definitions

| Level | Meaning | Examples |
|---|---|---|
| **P0** | App cannot start, data can be lost/corrupted, money is wrong, or a security control is ineffective | boot hang, missing transaction, wrong day boundary |
| **P1** | A required flow is unusable or misleading, but data is not corrupted | no delete button, no logout, dead quick-sale form |
| **P2** | Cosmetic, performance, or maintainability issue | unused code, missing index, untranslated error |

**Repro notation:** `[code]` = proven by reading code and dependency internals; `[test]` = reproduced by a failing/absent test; `[env]` = requires device/network and is marked for later verification.

---

## 1. P0 bugs

### BUG-01 — Web bootstrap never resolves; the app never renders

- **Evidence:** `src/database/sqlite/database.ts:53` calls `sqlite.initWebStore()` when `Capacitor.getPlatform() === 'web'`. The plugin's web implementation awaits `customElements.whenDefined('jeep-sqlite')`; `index.html` contains only `<div id="root">` and the module script.
- **Impact:** `bootstrapApp()` never resolves → `.then()` in `main.tsx:10-11` never runs → blank page in `npm run dev`. Every browser-based test/demo is impossible.
- **Repro:** `npm ci && npm run dev`, open the URL, observe an empty page and no error. `[code]`
- **Fix:** either (a) load the `jeep-sqlite` package and add `<jeep-sqlite>` + `defineCustomElements` in `index.html`/`main.tsx` for web, or (b) skip SQLite on web and use an in-memory repository adapter. Decide in T02; document the choice.
- **Verify:** `npm run dev` shows `/login`; creating a customer and reloading keeps it (see BUG-10).

### BUG-02 — SQLCipher initialization is wrong on both platforms

- **Evidence:** `database.ts:63-74` calls `createConnection(DB_NAME, true /* encrypted */, 'secret', …)`, then `open()`, then `execute("PRAGMA key = '…'")`. Native SQLCipher requires the secret before opening (`setEncryptionSecret`); the plugin's web build does not support encrypted databases at all.
- **Impact:** native DB open fails or is silently unencrypted; web DB cannot open even after BUG-01 is fixed. R-43 is nominal only.
- **Repro:** `[env]` open on Android with the current code and inspect the plugin error; `[code]` for the web unsupported case.
- **Fix:** in T02 — use `sqlite.setEncryptionSecret(passphrase)` before `open()` on native; create the web connection **unencrypted** and document the limitation; move the key out of `localStorage` (T16).
- **Verify:** DB file cannot be opened by another SQLite tool; app reopens after kill/restart; key is not present in `localStorage` on device.

### BUG-03 — `npm run build` fails

- **Evidence:** `src/features/finance/finance.hooks.ts:7` imports `todayISO` but never uses it; `tsc -b` reports TS6133 and exits 1.
- **Impact:** no production artifact; no CI signal; `cap:build` cannot run.
- **Repro:** `npm run build` → one error. `[test]` (reproduced).
- **Fix:** remove the import (or use it where intended). Ship as the first commit of T01.
- **Verify:** `npm run build` exits 0 and emits `dist/`. **Status: resolved in T01 (2026-11-12).**

### BUG-04 — Outbox completion writes a non-existent column

- **Evidence:** `src/sync/outbox/outbox.repository.ts:51` — `UPDATE sync_outbox SET status='done', updated_at=?`; `sync_outbox` has no `updated_at` (`001_initial.sql:203-214`).
- **Impact:** the first successful push throws, leaving rows `processing`; sync can never complete.
- **Repro:** `[code]`; `[test]` add an integration test against real SQLite (current mocks interpret SQL loosely and miss it).
- **Fix:** in T03 either add `processed_at`/`updated_at` via migration `002`, or change the SQL. Prefer `processed_at` + `last_attempt_at` for backoff.
- **Verify:** test that `markOutboxDone`/`markOutboxFailed` execute against real SQLite and update expected columns.
- **Status: resolved in T03 (2026-11-13).** Migration `002_outbox_hardening.sql` adds `processed_at`, `last_attempt_at`, `client_op_id`; the `markOutbox*` methods write those columns and `attempt_count`/`last_error`. Covered by `outbox.integration.test.ts` against real SQLite.

### BUG-05 — Local-day boundary uses UTC

- **Evidence:** `todayISO()` returns `new Date().toISOString().slice(0,10)` (`jalali.ts:54-56`). Day queries build `T00:00:00.000Z`…`T23:59:59.999Z` (`appointment.repository.ts:72-74,79-80,267`; `finance.repository.ts:85-86`; same pattern in visit/expense). `toDateString()` (`helpers.ts:37-39`) is also UTC.
- **Impact (proven):** at 00:30 Asia/Tehran on 2026-11-12, `todayISO()` returns `2026-11-11`. Appointments and daily totals are filed under the wrong day for the first 3.5 hours of every day.
- **Repro:** `[code]`; run `node -e "process.env.TZ='Asia/Tehran'; console.log(new Date('2026-11-12T00:30:00+03:30').toISOString().slice(0,10))"` → `2026-11-11`.
- **Fix:** T04 — add `localDateISO(date)` and `localDayRange(dateISO)` using an explicit timezone (device local by default), replace all four repositories and the finance calculator; keep storage in UTC.
- **Verify:** unit tests at 00:00, 00:30, 23:59, and a DST-observing zone; daily totals equal the sum of rows whose **local** day matches.

### BUG-06 — Multi-table writes are not transactional

- **Evidence:** `appointment.repository.ts:151-183` (appointment + N services + outbox), `visit.repository.ts:107-198` (visit + N services + payment + outbox). `beginTransaction`/`commitTransaction` appear **nowhere** in `src/`.
- **Impact:** a crash or validation error mid-loop leaves partial records that cannot be repaired deterministically; totals diverge from line items.
- **Repro:** `[code]`; simulate by throwing after the first `run()` in a test.
- **Fix:** T03 — add `withTransaction(db, fn)` and wrap every multi-table write; enqueue all outbox rows inside the same transaction.
- **Verify:** injected failure at each step leaves zero rows; success leaves all rows.
- **Status: resolved in T03 (2026-11-13).** `src/database/sqlite/transaction.ts` (non-reentrant) wraps appointment/visit/customer/service/expense/profile writes. `appointment.repository.test.ts` injects a failure at steps 1–8 and asserts zero parent/child/outbox rows.

### BUG-07 — Child rows are never enqueued for sync

- **Evidence:** appointment/visit outbox payloads contain only the parent row (`appointment.repository.ts:178-185`, `visit.repository.ts:155-162`); `appointment_services`, `visit_services`, `color_formula_items` never call `addToOutbox`.
- **Impact:** a new-device restore would recover appointments/visits but lose every service line, price, and therefore all revenue detail.
- **Repro:** `[code]`.
- **Fix:** T03 — enqueue child rows (operation + full payload) or embed them in the parent payload and have the push layer upsert children; define the rule in `IMPLEMENTATION_DRAFT.md` and test it.
- **Verify:** outbox row count equals 1 parent + N children for a 3-service appointment; simulated pull reconstructs identical totals.
- **Status: resolved in T03 (2026-11-13).** Chosen rule: **one outbox row per row**, `entity_type` = table name (see `docs/10-decisions-log.md` D-24). A 3-service appointment produces 4 outbox rows (`appointments` + 3× `appointment_services`); visit create is covered by `write-integrity.integration.test.ts`. `color_formula_items` follows the same rule when T11 adds the table.

### BUG-08 — The outbox has no consumer (nothing ever syncs)

- **Evidence:** `getPendingOutbox` has zero callers; no `supabase.from/storage/rpc` call in `src/` (`services/supabase/client.ts` is auth-only); `sync.store` setters are never called.
- **Impact:** the product's core promise (cloud backup/recovery) is absent; all data is device-local. A lost phone means lost business history.
- **Repro:** `[code]`; after using the app, all outbox rows remain `pending` forever.
- **Fix:** T09 (push) + T10 (pull); this is a missing feature, registered here because it invalidates the product claim.
- **Verify:** end-to-end test with two devices (or one device + wiped DB) restores all data.

### BUG-09 — Foreign keys are not enforced per connection

- **Evidence:** `PRAGMA foreign_keys = ON` exists only at `001_initial.sql:7`; `getDatabase()` never sets it. Migrations are skipped after first run, so the pragma is not executed on later launches.
- **Impact:** orphan `appointment_services`/`visit_services`/`payments` rows are accepted; `ON DELETE CASCADE` never fires.
- **Repro:** `[code]`; on a fresh DB, insert a payment with a random `visit_id` and observe success.
- **Fix:** T02 — execute the pragma immediately after `open()` (and after `retrieveConnection`).
- **Verify:** integration test asserts an FK violation is thrown.

### BUG-10 — Web data is not persisted across reload

- **Evidence:** web uses `jeep-sqlite`; the code never calls `sqlite.saveToStore(DB_NAME)` after writes or `loadFromStore` on boot.
- **Impact:** browser testing always starts from an empty DB; any web deployment loses data on refresh.
- **Repro:** `[env]` after BUG-01 is fixed: create a customer, reload, list is empty.
- **Fix:** T02 — either persist the store explicitly after each mutation (acceptable for dev) or document web as ephemeral and never deploy it as a product. Do not silently claim web support.
- **Verify:** reload preserves rows; a documented decision exists.

### BUG-11 — Logout is unreachable and its warning is invisible

- **Evidence:** `logoutUseCase` (`auth.usecases.ts:72-90`) has no caller; `AppShell` has no account menu; pending changes produce `console.warn` only.
- **Impact:** users cannot sign out or switch accounts on a shared device; on logout, unsynced work is silently stranded.
- **Repro:** `[code]`.
- **Fix:** T05 — account menu + confirm dialog showing pending count (from a real outbox count).
- **Verify:** with 3 pending rows, logout asks for confirmation and states the count; after confirm, `/login` shows and rows remain for that user.

### BUG-12 — Profiles are never ensured for existing users

- **Evidence:** `createProfile` is called only inside `registerUseCase` (`auth.usecases.ts:51-66`); `bootstrapApp` does not check. The Supabase trigger creates the server row, but the local row is missing.
- **Impact:** a user who logs in on a new device has no local profile → settings/currency dependent features cannot read it; the "profile can be created on next sync" comment is false (no pull).
- **Repro:** `[code]`; log in with an account created outside the app, then query `profiles` → empty.
- **Fix:** T05 — `ensureProfile()` on login/bootstrap, idempotent upsert.
- **Verify:** delete the local profile, restart, it reappears exactly once.

---

## 2. P1 bugs

| ID | Bug | Evidence | Impact | Fix / verify |
|---|---|---|---|---|
| BUG-13 | Appointment delete action is suppressed | `AppointmentDetailPage.tsx:60-64` (`void handleDelete`) | Repository + hook exist but users cannot delete | T06: render button + confirm; test soft delete and outbox row |
| BUG-14 | Editing an appointment cannot change its services | `appointment.repository.ts:202-243` updates the parent only | Rescheduling works only via status/notes; service changes impossible | T06: transactional replace of children; conflict re-check |
| BUG-15 | Quick sale form is dead and imports a missing CSS module | `QuickSaleForm.tsx:7` → `./FinanceForm.module.css` (absent); no route | Routing it would break the Vite build | T07: add stylesheet + route + use-case; build must stay green |
| BUG-16 | Services page is unreachable from the UI | `/settings/services` exists; `SettingsPage` has no link | Owners cannot manage services in a normal flow | T14: settings list with link; navigation test |
| BUG-17 | Date inputs are Gregorian | `AppointmentForm.tsx` uses `<input type="date">`; display is Jalali | Inconsistent UX; users must convert dates mentally | T04: Jalali date picker component; store ISO |
| BUG-18 | Notification permission is never requested; edits do not reschedule | `requestNotificationPermission` has no caller; `appointments.hooks.ts:115,134,191` schedule on create and cancel on cancel/delete only | On Android 13+ scheduling can fail silently; a rescheduled appointment reminds at the old time | T13: prompt contextually, reschedule on edit, cancel on completed/no_show, add channel |
| BUG-19 | No error boundary; bootstrap leaks raw errors | `main.tsx:23-31` writes `String(err)` into the page; no React boundary | One render error blanks the app; errors may expose internals | T01/T16: boundary + Persian error screen + log buffer |
| BUG-20 | Session token and DB passphrase live in `localStorage` | `client.ts:18-26`; `database.ts:24-46` | Extractable on device; contradicts R-43 intent | T16: Capacitor SecureStorage/Keychain |
| BUG-21 | Over-payment is accepted | `visit.repository.ts:165-198` has no sum check | Paid > total; reports show negative debt | T07: validate against line totals inside transaction |
| BUG-22 | Double submit can duplicate records | create mutations have no disable/idempotency; `AppointmentForm` submit not guarded | Duplicate appointments/customers | T06/T07: disable while pending + optional client op id |
| BUG-23 | Expenses are hard-deleted with no tombstone | `expense.repository.ts:112-123`; server has no `deleted_at` | Deletion cannot propagate to other devices | **Local capture resolved in T03 (2026-11-13)** — `delete` enqueues the full previous row before deleting. Server-side restore/sync remains T10 |
| BUG-24 | Cloud migration is not idempotent; bucket and UPDATE policy missing | `001_initial_schema.sql:53-54,57,71,93-94,249-252,255-265` | Re-run fails; uploads error; overwrite denied | T16: `IF NOT EXISTS`, `DROP POLICY IF EXISTS`, create bucket, add UPDATE policy |
| BUG-25 | Server `updated_at` trigger overrides client timestamps | `001_initial_schema.sql:267-289` | LWW conflict resolution based on client time is invalid | T10: define policy using server time + op ordering |
| BUG-26 | Profile push will conflict with the signup trigger | server trigger inserts profile; client queues `insert` (`profile.repository.ts:51-56`) | First sync of a new account fails on duplicate key | T09: upsert profiles; integration test |
| BUG-27 | `applyTimeToDate` assumes a UTC-parsed base date | `jalali.ts:98-103` (`new Date('YYYY-MM-DD')` then `setHours`) | Wrong day for negative UTC offsets; harmless for Iran but fragile | T04: construct from explicit y/m/d in local time |
| BUG-28 | Sync banner is permanently "idle" | `AppShell.tsx:19-39` reads a store that is never set | Misleads the user about backup status | T09: drive store from worker |

---

## 3. P2 bugs

| ID | Bug | Evidence | Impact |
|---|---|---|---|
| BUG-29 | `base.repository.ts` uses CommonJS `require()` | `:19` | Would crash in the browser if ever imported. **Resolved in T01 (ESM import).** |
| BUG-30 | Dead Vite template component | `src/App.tsx`, `src/App.css` | Confusing entry points |
| BUG-31 | `matchesSearch` does not normalise the haystack | `helpers.ts:110-112` | Persian-digit matches can miss |
| BUG-32 | Raw Supabase error messages shown | `LoginPage`/`RegisterPage` | English/technical errors in a Persian UI |
| BUG-33 | `formatToman` treats stored value as "cents" | `helpers.ts:50-53` | Naming confusion only; or `Math.round` hides sub-Toman storage |
| BUG-34 | No pagination on customer/service lists | repositories `findAll` | Slow with thousands of rows |

---

## 4. "Do not be fooled" list

These green signals are misleading and must not be used as evidence that the app works:

| Signal | Reality |
|---|---|
| `npm run type-check` passes | Real since T01, but it only type-checks; runtime/SQL defects still pass |
| `npm run build` passes | It proves TypeScript and bundling, not that the app boots (BUG-01) |
| `npx vite build` passes | It does not type-check, and dead code (QuickSaleForm) is not bundled |
| 71/71 tests pass | Tests use a hand-written SQL mock; finance, sync, bootstrap, and components are untested |
| `npm test` is fast | Because no real SQLite/network/device is involved |
| `npm ci` succeeds | esbuild's postinstall is skipped by npm allow-scripts policy but its binary works today; a clean machine may behave differently |
| `npm run lint` passes | Static analysis only; it does not prove the app boots or the SQL is valid |
| RLS SQL exists | It has never been executed against a project |
| `sync_outbox` has rows | Nothing consumes them |

---

## 5. Technical debt register

| ID | Debt | Evidence | Consequence | Effort | Task |
|---|---|---|---|---|---|
| TD-01 | No CI | no `.github/workflows` | Regressions land silently | S | T01 |
| TD-02 | Lint is unrunnable and the baseline is red | `package.json:9` (`--ext`); 53 errors/16 warnings | No static safety net | M | T01 |
| TD-03 | Formatting baseline never applied | 92 files fail Prettier | Noisy diffs; reviewer fatigue | S | T01 |
| TD-04 | `type-check` is vacuous | root tsconfig `files: []` | False confidence | S | T01 |
| TD-05 | Tests mock SQL instead of executing it | `src/tests/unit/*.repository.test.ts:7-109` | SQL defects (BUG-04) pass tests | M | T01/T03 — **partially resolved:** appointment/visit/expense/outbox now run on a real SQLite harness (`src/tests/helpers/sqlite-harness.ts`); customer/service still use mocks |
| TD-06 | No coverage policy; finance untested | `vitest.config.ts`; no finance tests | Money logic unverified | M | T01/T07 |
| TD-07 | Day-range logic duplicated in 4 places | appointment/visit/expense/finance | Bugs fixed in one place only | S | T04 |
| TD-08 | No application/use-case layer | hooks call repositories directly | Invariants scattered; hard to transactionalise | L | T03 |
| TD-09 | Finance repository lives under `features/` | `features/finance/finance.repository.ts` | Inconsistent structure | S | T03 |
| TD-10 | Two hand-written type sources | `shared/types/index.ts`, `services/supabase/database.types.ts` | Silent drift | M | T09 |
| TD-11 | Substantial dead code | `App.tsx`, `base.repository.ts`, `sync.store.ts` setters, outbox readers, `QuickSaleForm` | Misleading surface area | S | T01/T03 |
| TD-12 | No error taxonomy or boundary | console-only logging; raw errors | Poor UX and diagnosability | M | T16 |
| TD-13 | Vite aliases use `URL.pathname` | `vite.config.ts:6-14` | Fragile on Windows/file URLs | S | T01 |
| TD-14 | Hand-written Supabase types | `database.types.ts` | Will drift once data calls exist | S | T09 |
| TD-15 | No observability | `console.log/warn/error` only | Field issues undiagnosable | M | T16 |
| TD-16 | No i18n layer; strings inline | feature files | Adding a second language is a rewrite | M | post-MVP |
| TD-17 | No pagination | `findAll()` everywhere | Scale ceiling | M | post-MVP |
| TD-18 | Mobile projects not initialised; no release pipeline | no `android/`, `ios/`; `capacitor.config.ts` only | Cannot ship | M | T02/T16 |
| TD-19 | No dependency/secret scanning | no Dependabot/CodeQL | Supply-chain and secret risk | S | T16 |
| TD-20 | No root README | only `docs/README.md` | New contributors miss the entry point | S | T01 |

**T01 status (2026-11-12):** TD-01–TD-04, TD-13, and TD-20 are resolved locally. TD-05, TD-06, and the dead-code cleanup in TD-11 remain open.

**T03 status (2026-11-13):** TD-05 is partially resolved (core repositories execute real SQL). TD-08/TD-09/TD-11 remain open. TD-06 still waits on the finance test suite in T04.

---

## 6. Fix order constraints

- BUG-03 is fixed (T01); CI is now available. Do not regress the gates.
- BUG-01/BUG-02/BUG-09/BUG-10 must be fixed before any browser or device verification is meaningful (T02).
- BUG-04/BUG-06/BUG-07/BUG-23 must be fixed before BUG-08's engine is built (T03 before T09).
- BUG-05 must be fixed before finance/dashboard totals are shown to users (T04 before T07/T08).
- BUG-25/BUG-26 must be resolved as part of the sync design, not after it (T10/T09).
- BUG-24/BUG-20 are release blockers (T16).

Resolved locally as of 2026-11-13: BUG-04, BUG-06, BUG-07 (T03), plus the local-capture half of BUG-23. Everything else above remains open.
