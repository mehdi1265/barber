# AGENT HANDOVER — Barber App

> **Read this file first.** It is written for a new coding agent with no access to previous conversations.
> **Audit date:** 2026-11-12 · **Code baseline:** `877ebde` · **Audit documents commit:** `git log -1 --format=%H -- audit/AGENT_HANDOVER.md`
> **Status:** audit complete, T01 quality gates complete locally, no product feature implemented, nothing pushed.

> **T01 update (2026-11-12):** `npm ci`, `type-check`, `lint`, `format:check`, `test` (71/71), and
> `build` are green. CI was added at `.github/workflows/ci.yml`; the first remote run is pending
> push authorization. Root `README.md` was added. **Next action: T02 when assigned.**

> **T02 update (2026-11-13):** Web boot is fixed and verified: `/login` renders, migration `001`
> applies, and the store persists across reloads. Root cause was a wasm mismatch (`jeep-sqlite`
> 2.8.0 bundles sql.js 1.11.0; the build copied 1.15.2). Startup now renders before bootstrap and
> DB init has a 15 s timeout with a Persian error banner + retry. `PRAGMA foreign_keys` is applied
> per connection; native encryption sets the secret before `open`. `android/` and `ios/` projects
> are generated and `cap sync` passes (they were git-ignored at that time; the 2026-11-14 closure
> pass made native sources traceable). No device build or iOS toolchain here. Native
> checks and the first remote CI run remain unverified. **Next action: T03 when assigned.**

> **T03 update (2026-11-13):** Transactions, outbox correctness, child-row enqueue, and idempotency
> are implemented. `withTransaction` (non-reentrant) wraps every listed repository write; migration
> `002_outbox_hardening.sql` adds `processed_at`/`last_attempt_at`/`client_op_id`; `markOutbox*` uses
> real columns; appointments/visits enqueue a row per child; expense delete writes a full-row
> tombstone. Tests run against real SQLite via `node:sqlite` (99/99). Migration 002 was verified in a
> production browser build (applied once, skipped on reload). Native checks and the first remote CI
> run remain unverified. **Next action: T04 when assigned.**

> **T04 update (2026-11-13):** Local-day semantics are implemented. `shared/utils/datetime.ts`
> computes day/week/month ranges from an explicit IANA zone (device default) with an exclusive end;
> all four repositories, the finance calculator/repository, and the agenda page use it, so a 00:30
> Tehran action lands on the correct day. `applyTimeToDate` builds instants from explicit y/m/d.
> The Gregorian date input was replaced by `JalaliDateInput`; no `<input type="date">` remains.
> `datetime.test.ts` covers Tehran midnight boundaries and New York DST days; finance calculator
> tests were added (131/131 total). Gates are green. **Next action: T05 when assigned.**

> **T05 update (2026-11-13):** Authentication and session handling are complete locally.
> `ensureProfile()` is idempotent and runs on login, registration, bootstrap, and `SIGNED_IN`.
> Registration with email confirmation shows a "check your email" screen (D-20). `AppShell` has an
> account menu; logout requires confirmation, shows the pending outbox count, falls back to a local
> scope, and never deletes queued rows. `/forgot-password` and `/reset-password` are routed; the
> reset page reads implicit-flow recovery tokens from the fragment and calls `setSession` because
> `detectSessionInUrl` is `false` (web-first; native deep links deferred, D-26). Auth errors are
> mapped to Persian and raw provider text is logged only. Use-case/menu/reset tests were added
> (151/151 total). A real Supabase project and native runtime remain unverified.
> **Next action: T06 when assigned.**

> **T06 update (2026-11-13):** The appointment lifecycle is complete locally. Create checks
> conflicts inside its transaction; update re-checks (excluding itself) and replaces service lines
> atomically with child tombstones/inserts. Detail has edit and confirm-gated soft delete; the form
> guards double submits; deleted rows leave every query. Reminders reschedule on edit and cancel for
> cancelled/no_show. 156/156 tests pass; gates are green. Device runtime remains unverified.

> **T07 update (2026-11-13):** Finance is complete locally. Visit + service lines + optional initial
> payment are written in one transaction; over-payment is rejected by `OverpaymentError` in `create`
> and `addPayment` (ownership and remainder checked inside the transaction). `findSummariesByDay`
> returns customer names and totals; `FinanceRepository.getOpenDebts` aggregates per customer. The
> finance page has Day/Summary/Expenses/Debts tabs with Jalali navigation, visit detail with partial
> payments, expense create/edit/delete, and `/finance/quick-sale` (visit + service + payment in one
> transaction, double-submit lock). 175/175 tests pass; gates are green. Finance UI was not walked
> through in a browser (no Supabase session); device runtime remains unverified.
> **T08 update (2026-11-13):** The dashboard is complete locally. It shows the local Jalali date, the
> next appointment (customer, date/time, title, tap to detail) or an empty state, six day-summary
> cards from the same query as the finance day tab, the net row, and quick actions (new appointment,
> quick sale, customers). 177/177 tests pass; gates are green. Finance/dashboard UI was not walked
> through in a browser (no Supabase session); device runtime remains unverified.
> **T09/T10 update (2026-11-13):** The sync engine is complete locally. `src/sync/engine/` contains
> the push worker (`push.ts`, 50-row batches, upsert by id, 401 stop, terminal 4xx, 5xx backoff),
> the pull/merge worker (`pull.ts`, 12 tables FK-ordered, 500-row pages, 5-minute overlap cursor,
> pending-local-wins, tombstone + type normalisation), payload mapping (`payload.ts`), and a lazy
> Supabase adapter. `sync.manager.ts` + `SyncManager` run on login, connectivity/visibility, and
> post-mutation (2 s debounce), and Settings exposes "sync now" plus a confirm-gated full restore.
> Migration 003 adds `sync_state`; migration 004 adds expense tombstones; the server migration
> `002_sync_indexes_and_fk.sql` adds sync indexes, `expenses.deleted_at`, and explicit FK delete
> policies. 203/203 tests pass; gates are green. No Supabase project exists, so network/device
> behaviour is unverified.
> **T11 update (2026-11-13):** The color-formula book is complete locally. `ColorFormulaRepository`
> writes a formula and its items transactionally with one outbox row per row; amounts are rounded to
> two decimals and capped at 999.99. `/color-formulas` has search/create/detail; detail supports
> edit, duplicate-as-template (new IDs, `«(کپی)»` title), and confirm-gated delete. Customer detail
> lists the customer's formulas with a new-formula shortcut. 215/215 tests across 28 files; gates
> green. Browser/device verification still pending.
> **Next action: T12 (photos) when assigned.**
> **T12 update (2026-11-13):** Photos are complete locally. Camera/file capture writes to
> app-private storage and requires consent; push uploads bytes to the private bucket before the row
> upsert and stores `storage_path`, tombstones delete the remote object; the gallery falls back to
> signed URLs on a restored device. Server migration `003_photo_storage_policy.sql` adds the missing
> storage UPDATE policy. 222/222 tests across 30 files; gates green. Network/device paths unverified.
> **Next action: T13 (reminders) when assigned.**
> **T13 update (2026-11-13):** Reminders are complete locally. A native-only permission banner and
> a Settings section (enable, 10/30/60-minute lead, permission state) replace the never-called
> permission helper; the Android channel is high-importance with sound/vibration. Scheduling uses a
> stable per-appointment ID, now also cancels on completed/no_show, and app start rebuilds upcoming
> reminders and removes orphans through `ReminderManager`; notification taps open the appointment.
> 227/227 tests across 31 files; gates green. Real-device firing and routing are unverified.
> **T14 update (2026-11-13):** Settings, profile, and customer history are complete locally.
> Settings now edits the local profile (display name, phone, currency) through `ProfileRepository`,
> which queues an outbox row; it also shows the account email, a confirm-gated logout, services,
> sync controls, the version from `VITE_APP_VERSION`, and the reminder preferences. Currency is
> label-only (`formatMoney`) and never converts stored amounts. Customer detail fetches the
> customer's appointments (`findByCustomer`) and visit summaries
> (`findSummariesByCustomer`) and renders upcoming/past appointments, each visit's amount and
> paid/remaining, plus a financial summary. 238/238 tests across 34 files; gates green.
> **T15 update (2026-11-13):** Global search is complete locally. `/search` (linked from the
> dashboard) runs one debounced pass over customers, services, appointments, and formulas.
> `shared/utils/search.ts` normalises Persian/Arabic digits on the query side and builds nested
> `REPLACE` expressions for the column side; LIKE wildcards are escaped. `SearchRepository` fetches
> at most 50 rows per group, the page shows 5 with «نمایش همه», excludes soft-deleted rows, scopes
> every query by `user_id`, and navigates results to their detail pages. 256/256 tests across 37
> files; gates green. Device timing for the 5,000-customer target remains unverified.
> **T16 update (2026-11-13):** Security and release readiness are complete locally. Supabase session
> tokens now use Keychain/Keystore on native (`secure-session-storage.ts`; web localStorage is
> dev-only per D-21). A Persian ErrorBoundary and a 200-entry redacting local logger replace raw
> error rendering. Migration `001` is fully re-runnable (indexes, policies, bucket) and
> `supabase/tests/rls_two_user_check.sql` probes both users across all 12 tables plus storage inside
> a rolled-back transaction; it still needs one run against a live project. Added CI production-audit
> gating, Dependabot, `docs/11-release-runbook.md`, and an idempotent Android signing/version script
> (`npm run android:release-config`). 275/275 tests across 42 files; gates green. Live RLS, native
> release builds, and real-device checks remain unverified.
> **T16 release-ops update (2026-11-13, second pass):** Native password-reset deep links are
> implemented with `@capacitor/app` (`appUrlOpen` + `getLaunchUrl`), an implicit/PKCE parser, and an
> idempotent `scripts/native-deep-links.ts` that registers `barberapp://reset-password` in the
> generated Android manifest and iOS `Info.plist` (D-41). A portable two-user RLS runner
> (`npm run rls:check`) now uses the public Auth/PostgREST/Storage APIs, so it needs no psql or DB
> password. Live preflight succeeded: `auth/v1/health` returns 200 with the publishable key, but the
> schema is **not applied** (`profiles` → `PGRST205`), so migrations and the RLS run remain blocked on
> a database credential / SQL-editor action. `.env.local` had `/rest/v1/` appended to the project URL;
> it was corrected and the client now rejects that shape. Non-breaking `npm audit fix` cleared the
> `tar` advisories; 14 dev-only remain (vitest/tinypool critical needs vitest 5, zod 4 is production
> high). 296/296 tests across 45 files; `type-check`, `lint`, `format:check`, and `build` are green.
> **Next action: apply migrations `001`–`003` in the Supabase SQL editor (or via an access token),
> create two test accounts, then run `npm run rls:check -- --out supabase/tests/rls-verification.log`;
> Android signing still needs a locally generated keystore.**
> **Device-handoff update (2026-11-13, seventh pass):** the runbook §5.1 local-data wipe is
> implemented. Settings → «حذف داده‌های این دستگاه» refuses while the signed-in account has
> unsynced outbox rows, then transactionally deletes that account's business rows, outbox, and
> pull cursor, and removes `photos/<user>/` after the commit. Other accounts, `profiles`,
> `sync_state`, and `schema_migrations` are untouched. Covered by `local-data-wipe.test.ts`
> (real SQLite) and `settings-local-data.test.tsx`; 343/343 tests across 50 files, all gates
> green. Browser/device execution of the file cleanup remains unverified. Docker/WSL2 are not
> installed; the only Docker-dependent task is executing the PostgreSQL RLS suite locally, and
> it is still blocked on a pending Windows restart plus interactive elevation.
> **Security & sync verification update (2026-11-13, eighth pass):** sync runs are now fenced to
> the account that started them. `pushOutbox`/`pullFromCloud` take `isAccountCurrent`; a switch
> mid-run stops before sending, marking `done`, or burning attempts, and `runSync` starts a fresh
> run for the new account. Pull skips remote rows owned by another account and upserts with
> `WHERE user_id = excluded.user_id`, so an id collision cannot transfer a local row; an aborted
> pull keeps its cursor. The bootstrap profile placeholder is inserted with `INSERT OR IGNORE`
> and no outbox row, so reinstall/wipe can no longer push defaults over the cloud phone/currency.
> The wipe guard ignores terminal (`failed` at attempt cap) outbox rows while still refusing on
> retryable work. 9 new tests; 352/352 tests across 50 files and all gates green. RLS was re-read
> statically (12 owner-scoped `FOR ALL` policies, per-command storage policies, same-user
> composite FKs) but the PostgreSQL suite was **not executed**, so RLS is still not runtime-verified.
> No commit, push, or remote access was performed.
> **Zod remediation & Android read-back (2026-11-13, ninth pass):** `GHSA-mrhx-c7xc-m3w5`
> (zod array memory exhaustion) is resolved by moving to `zod 4.6.7`, `@hookform/resolvers`
> 7.0.6, and `react-hook-form` 7.92.0 (D-45). Only `CustomerForm`/`ProfileSettings` needed
> `useForm<z.input<…>, unknown, z.output<…>>`; `ZodIssueCode`, `NEVER`, string messages and
> `.email()` still work. `npm audit --omit=dev` → 0 vulnerabilities; full audit 13 dev-only.
> 2 new tests → **354/354 across 50 files**, type-check/lint/format/build green.
> Android toolchain was re-verified: JDK 21 (Android Studio JBR 21.0.9), SDK 36,
> build-tools 36.1.0, Gradle 8.14, adb 36.0.2, no AVD/device. `assembleDebug --offline`
> still fails because Google Maven returns 404 for AGP artifacts; no mirror or TLS bypass
> was used, so the build must run on a Google-Maven-reachable machine. A debug keystore
> already exists locally (not created in this pass); no release keystore exists.
> New open items: **TD-21/D-46** deletion reconciliation (design only) and **TD-22**
> SQLCipher 4.5.3 without 16 KB page support (plugin 7.0.3 upgrade pending a native build).
> RLS still not runtime-verified. No commit, push, or remote access was performed.
> **Deletion reconciliation & Vitest 5 (2026-11-14, tenth pass):** TD-21/D-46 is now implemented.
> `supabase/migrations/005_sync_tombstones.sql` adds `deleted_at` + `user_deleted` indexes to the
> seven data tables that lacked them. `SOFT_DELETE_TABLES` covers all 11 data tables, push sends
> tombstones with a forward `updated_at`, and pull deletes child-first in one transaction while
> protecting pending/newer local edits and blocking stale-server resurrection. Pagination is now
> keyset `(updated_at, id)` (PostgREST `.or(...)`) instead of offset, and photo files are removed
> after commit. New `sync.reconcile.test.ts` (7 cases) plus updated pull/push/payload tests run on
> real `node:sqlite`: **363/363 across 51 files**; type-check/lint/format/build green; production
> audit 0. `vitest`/`@vitest/coverage-v8` moved to 5.1.0, closing both critical dev advisories;
> 7 moderate dev-only `typescript-eslint → minimatch` advisories remain (no fixed upstream).
> Remaining T17 evidence: apply migration 005 to the target project and run the two-device delete
> test. No commit, push, hosted migration, or remote access was performed.
> **T17 operational validation (2026-11-14, eleventh pass): BLOCKED.** Phase 1 static checks passed
> (idempotent SQL, all seven tables + indexes covered, owner-only RLS on every synced table, server
> `updated_at` trigger, CI double-apply). Phase 2 (apply migration on Test) and Phase 3 (10
> two-device scenarios) were not executed: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and
> `RLS_STAGING_PROJECT_REF` are unset; docker/psql/Supabase CLI/pg are absent; the `.env.local`
> project is not confirmed as test/staging. No hosted DB was contacted. Regression gates identical
> to the tenth pass: 363/363 tests, build green, prod audit 0, 7 moderate dev-only remain.
> **Staging guard hardening (2026-11-14, thirteenth pass):** the RLS runner now requires both refs,
> rejects unknown/malformed refs and Staging=Production, and refuses any probe write without
> `--confirm-ref=<staging-ref>`; cleanup verifies `id` + `user_id`, aborts on ambiguous ownership,
> and diagnostics redact key-shaped text. 20 offline guard tests; 383/383 across 52 files; gates
> green. **Release-candidate prep (2026-11-14, fourteenth pass):** source maps disabled for
> production builds (dist 8.0 MB → 2.2 MB); added `docs/13-release-owner-approval.md` (blank
> sign-off), `docs/14-release-artifacts.md`, `docs/15-operational-test-plan.md`, and
> `supabase/tests/verify_release_schema.sql`. All operational rows remain `NOT RUN`; staging
> approval is still the blocking prerequisite. No commit, push, hosted migration, or network
> access was performed.
>
> **Android release blockers (2026-11-14, fifteenth pass): BUILD SUCCEEDED, DEVICE VERIFICATION
> PENDING.** TD-22 fixed: plugin 7.0.3 + `sqlcipher-android:4.10.0`, all four `.so` at
> `p_align = 0x4000` (4.5.3 was `0x1000`). Built debug APK, unsigned release APK, and a 13.8 MB
> AAB with JDK 21; `zipalign -c -P 16` and bundletool-generated APKs pass; 0 source maps. Google
> Maven is regionally blocked (404 on `master-index.xml`), so this build is **verification-grade**
> via a session-scoped mirror outside the repo, not uploadable. No release keystore exists.
> BUG-40 (bare Gradle packaged stale `android/app/src/main/assets/public`) was fixed by
> `npx cap copy android` before rebuilding — always run `npm run cap:build` first. Device/emulator
> and the eight SQLCipher migration scenarios are **NOT RUN** (no device; every system-image dir is
> empty). See `docs/16-android-sqlcipher-migration.md`. Gates: type-check/lint/format/build green,
> 383/383 tests, prod audit 0, 7 moderate dev-only. No commit, push, or merge.
>
> **Android verification attempt (2026-11-14, sixteenth pass): BLOCKED (status D).** Re-verified
> statically and stopped at every runtime gate. The packaged `libsqlcipher.so` (all four ABIs) is
> byte-identical to the `sqlcipher-android:4.10.0` AAR, `p_align = 0x4000`, the dex has zero
> `net/sqlcipher` classes, intermediates resolve 4.10.0 with no old coordinate, and
> `UtilsSecret`/`GlobalSQLite` are unchanged. The eight `docs/16` scenarios remain **BLOCKED**: no
> device, no database created by 7.0.0 anywhere, and a substitute database is forbidden. 16 KB
> runtime is BLOCKED: 0 `system.img`, no AVD, `android-36/google_apis_ps16k` not installed, and the
> SDK repository returns 404. Official build is BLOCKED: Google Maven 404 for AGP/AndroidX/
> `master-index.xml`; no new build was run, existing artifacts are verification-grade. Signing only
> inspected (no keystore, none created). Supabase untouched. Gates: type-check/lint/format/build
> green, **383/383 tests / 52 files**, `npm audit --omit=dev` 0, 7 moderate dev-only. TD-22 and
> TD-24 stay open. No commit, push, merge, reset, clean, or upload.


---

## A. Project identity

### Repository and branches

| Item | Value |
|---|---|
| Repository URL | `https://github.com/mehdi1265/barber.git` |
| Active development branch | **`develop`** |
| Base branch | **`docs`** (`origin/docs`) |
| Code baseline commit | **`877ebde06b3ecc97c07494f4896e0a8392f4d8e7`** (`877ebde`, "documets") |
| Parent of base | `6cad57f` "Add files via upload" (`main`) |
| Remote branches | `origin/main`, `origin/docs` |
| Local audit commit | Contains the nine `audit/*.md` files; resolve with `git log -1 --format=%H -- audit/` |
| Push status | **Not pushed.** No remote branch was modified. |

`origin/docs` is a direct child of `origin/main`: it moves the eleven markdown documents from the repository root into `docs/` and changes **no application code**. `develop` was created from `origin/docs` so that documentation and code have a single base.

### Technology stack

| Layer | Technology | Version (declared) |
|---|---|---|
| UI | React + TypeScript | 19.3.1 / 5.7.3 |
| Build | Vite (rolldown) | 8.3.6 |
| Mobile shell | Capacitor | 7.2.0 |
| Local database | `@capacitor-community/sqlite` (SQLite/SQLCipher) | 7.0.0 |
| Backend | Supabase (`@supabase/supabase-js`) | 2.47.10 |
| UI state | Zustand | 5.0.3 |
| Query cache | TanStack Query | 5.62.7 |
| Forms | react-hook-form + Zod | 7.54.0 / 3.24.1 |
| Dates | date-fns + date-fns-jalali | 4.1.0 |
| Router | react-router-dom | 7.0.2 |
| Tests | Vitest + Testing Library | 3.1.4 |
| Lint/format | ESLint 9 (flat) + Prettier | 9.17.0 / 3.4.2 |

Environment used for the audit: Windows, Node `v24.18.0`, npm `11.16.0`, git `2.52.0`.

### Project structure

```
barber/
├─ docs/                     11 Persian product/technical documents (canonical requirements)
├─ audit/                    this audit (9 files, English; Persian quotes preserved)
├─ public/                   static assets
├─ supabase/
│  └─ migrations/001_initial_schema.sql     PostgreSQL schema + RLS + storage policies
├─ src/
│  ├─ main.tsx               entry: bootstrap → render
│  ├─ app/                   bootstrap, providers (QueryClient), router (12 screens + redirect/404)
│  ├─ features/
│  │  ├─ auth/               login, register, use-cases, schemas
│  │  ├─ appointments/       agenda, form, detail, hooks, schemas
│  │  ├─ customers/          list, form, detail, hooks, schemas
│  │  ├─ services/           list, form, hooks, schemas
│  │  ├─ finance/            calculator, repository, hooks, quick-sale (dead), placeholder page
│  │  ├─ dashboard/          placeholder
│  │  ├─ color-formulas/     placeholders
│  │  └─ settings/           placeholder
│  ├─ database/
│  │  ├─ sqlite/             connection + migration runner
│  │  ├─ migrations/001_initial.sql        SQLite schema (13 tables)
│  │  └─ repositories/       7 repositories (raw SQL)
│  ├─ sync/outbox/           outbox write/read helpers (no engine)
│  ├─ services/
│  │  ├─ supabase/           client (Auth only) + hand-written types
│  │  └─ notifications/      local notification helpers (uncalled)
│  ├─ shared/                UI kit, hooks, types, utils (money, Jalali, helpers)
│  ├─ state/                 auth store, sync store (dead)
│  └─ tests/                 25 test files, 203 tests
├─ index.html                **no jeep-sqlite element** → web boot blocker
├─ package.json              broken lint + vacuous type-check scripts
├─ capacitor.config.ts       appId com.barberapp.app, webDir dist
├─ vite/vitest/tsconfig/eslint/prettier configs
└─ .env.example              placeholder Supabase URL/key
```

**Size:** 124 tracked files; 71 `.ts/.tsx` files in `src/` (~6,079 lines) plus ~1,386 lines of CSS.

### Document map (read in this order)

1. **`audit/AGENT_HANDOVER.md`** — this file.
2. `audit/PROJECT_STATUS.md` — snapshot, verification results, maturity, blockers.
3. `audit/REQUIREMENTS_MATRIX.md` — 48 requirements (R-01…R-48) with status and acceptance criteria.
4. `audit/IMPLEMENTATION_AUDIT.md` — what each feature actually does.
5. `audit/ARCHITECTURE_AUDIT.md` — documented vs actual architecture.
6. `audit/DATABASE_AUDIT.md` — schemas, RLS, defects, integrity risks.
7. `audit/BUGS_AND_TECHNICAL_DEBT.md` — BUG-01…BUG-34, TD-01…TD-20.
8. `audit/DEVELOPMENT_BACKLOG.md` — T01…T16 with dependencies and acceptance criteria.
9. `audit/IMPLEMENTATION_DRAFT.md` — strategy, decisions, testing, risks.

Product requirements remain the eleven files in `docs/` (Persian). If this handover and `docs/` disagree, **`docs/` wins**, and the discrepancy must be reported rather than silently resolved.

---

## B. Project state

### Maturity

**Pre-alpha. ~30 % of MVP by weighted effort. 0 % of the cloud-recovery promise.** It is a coherent scaffold with two complete vertical slices, not a usable product. The build is green locally, but the browser app cannot boot and nothing syncs.

Requirement status: **9 Complete · 25 Partially implemented · 12 Not implemented · 1 Needs verification · 1 Blocked** (48 total).

### What works (code-complete with evidence)

- **Customers:** list, create, edit, soft delete, search by name/phone; repository + schema tests.
- **Services:** list, create, edit, deactivate; price ×100 storage; tests.
- **Appointment conflict detection:** overlap logic excludes cancelled bookings and allows touching endpoints; unit tested.
- **Appointment status lifecycle:** reserved → confirmed → completed, plus cancelled / no_show.
- **Money helpers:** integer Toman ×100, Persian formatting; tested.
- **Schema and migration runner:** 13 SQLite tables; version table; migration fails loudly.
- **UI foundation:** RTL shell, bottom navigation, reusable modal/confirm/field/empty/loading components.
- **Auth (code):** login, register, session restore, auth-state listener.
- **No secrets committed:** `.env` ignored, placeholders only.
- **Quality gates (T01):** type-check, lint, format check, tests, build, and CI workflow; all green locally.

### What partially works

- **Appointments:** create/list/detail/status work in code; no edit UI, delete handler suppressed, no walk-in, Gregorian date inputs.
- **Finance:** calculator, repository, and hooks exist; the page is a placeholder; payments/expenses have no UI; quick sale is dead code.
- **Auth:** no logout UI, no password reset, no profile guarantee for existing users.
- **Notifications:** scheduled on create and cancelled on cancel/delete; permission never requested; edits do not reschedule.
- **Outbox:** writes rows for parent entities; no consumer, broken completion SQL, children missing.
- **Web/native DB:** schema is sound; runtime initialization is broken.
- **Search:** customers only.

### What does not work

- **Web app boot:** hangs forever (missing `jeep-sqlite`).
- **Native DB encryption:** initialized in the wrong order; web + encrypted is unsupported.
- **Production build:** `npm run build` fails with TS6133.
- **Sync (push/pull):** does not exist.
- **Dashboard, finance UI, settings, color formulas, photos:** placeholders or tables only.
- **Android/iOS:** no platform projects exist.

### Critical blockers (fix in this order)

| ID | Blocker | One-line evidence |
|---|---|---|
| BUG-01 | Web boot never resolves | `database.ts:53` + `index.html` missing `<jeep-sqlite>` |
| BUG-02 | SQLCipher init wrong / web unsupported | `database.ts:63-74` opens then sets `PRAGMA key` |
| BUG-03 | Build fails — **resolved in T01** | `finance.hooks.ts:7` unused `todayISO` |
| BUG-04 | Outbox completion writes missing column | `outbox.repository.ts:51` → no `updated_at` in schema |
| BUG-05 | UTC day boundaries | `todayISO()` + `T00:00:00.000Z…T23:59:59.999Z` |
| BUG-06 | No transactions | no `beginTransaction` anywhere; multi-table writes |
| BUG-07 | Child rows never queued | only parent outbox payloads |
| BUG-08 | Outbox never consumed | `getPendingOutbox` has no callers; zero data calls to Supabase |

### Known bugs

Full register with repro and fix: `audit/BUGS_AND_TECHNICAL_DEBT.md`. The eight blockers above are the first to fix. Other P0s: FK enforcement off (BUG-09), no web persistence (BUG-10), logout unreachable/silent warning (BUG-11), profile never ensured (BUG-12). Notable P1s: suppressed appointment delete (BUG-13), edit cannot change services (BUG-14), dead quick-sale form (BUG-15), unreachable services page (BUG-16), notification permission never requested / edits do not reschedule (BUG-18), tokens/DB key in `localStorage` (BUG-20), over-payment accepted (BUG-21), non-idempotent cloud migration (BUG-24), profile push/trigger conflict (BUG-26).

---

## C. Architecture

### Application architecture

Designed: presentation → feature modules → application/use-cases → domain → repositories → SQLite ⇄ sync engine ⇄ Supabase.

Built: pages → hooks (`useQuery`/`useMutation`) → repositories (raw SQL) → SQLite. There is **no application layer except auth**, **no sync engine**, and **no Supabase data access**. TanStack Query wraps local reads; Zustand holds auth and a dead sync store.

### Routing (React Router 7)

`/login`, `/register` (redirect-if-auth) · `/dashboard`* · `/appointments`, `/appointments/:id` · `/customers`, `/customers/:id` · `/color-formulas`, `/color-formulas/:id`* · `/finance`* · `/settings`*, `/settings/services` · `/` → `/dashboard` · `*` → Persian 404. Auth guard wraps everything except login/register. `*` = placeholder page.

Missing routes: password reset, quick sale, settings sub-pages.

### State management

- **Auth store** (`state/auth.store.ts`): persists `userId` + `isAuthenticated`; session object lives in Supabase's own storage.
- **Sync store** (`state/sync.store.ts`): idle/syncing/synced/error/offline + pending count; **never mutated**.
- **Query cache**: 5-minute `staleTime`; mutations invalidate their keys manually.
- `userId!` assertions throughout hooks; safe only because bootstrap gates rendering.

### SQLite

- Single connection singleton (`getDatabase`).
- One migration (`001_initial.sql`) applied by `runMigrations` with `schema_migrations`.
- Web path uses `jeep-sqlite` (not registered); native path uses SQLCipher (misconfigured).
- `PRAGMA foreign_keys` is never applied per connection.
- All timestamps are UTC ISO-8601 text; money is integer Toman ×100.

### Supabase

- Client created from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`; **throws at import if missing**.
- Used **only** for auth (`signInWithPassword`, `signUp`, `getSession`, `onAuthStateChange`, `signOut`).
- PostgreSQL schema with 12 tables, RLS on all, 15 policies (12 table + 3 storage). Migration is manual, non-idempotent, and does not create the bucket.
- No storage, no RPC, no table reads/writes.

### Authentication

Email/password via Supabase. Session persisted by supabase-js in `localStorage`; app store persists only IDs. Register creates a local `profiles` row (`id = user_id`, matching the server trigger). No logout UI, no reset, no `ensureProfile`, no offline-session strategy, raw errors shown.

### Offline-first

All reads/writes go to SQLite; no network in the data path. But: web DB is not persisted, native encryption is broken, queued changes never leave the device, and there is no pull/restore. It is "local-only", not offline-first in the product sense.

### Synchronization (intended vs actual)

Intended: writes → SQLite + outbox **in one transaction** → push with retry/idempotency → pull on login/new device with a cursor and conflict policy.

Actual: parent entities append an outbox row (separate statement), children are not appended, no worker reads the queue, `markOutboxDone` targets a missing column, and there is no `sync_state` table. **Zero** sync capability.

### Data flow examples

```
Create appointment:
  AppointmentForm → useCreateAppointment → AppointmentRepository
    → INSERT appointment
    → INSERT appointment_services × N
    → INSERT sync_outbox (parent only)
  (no transaction; failure leaves partial data)

Read a day:
  AppointmentsPage(todayISO()) → findByDay
    → WHERE start_at BETWEEN '<date>T00:00:00.000Z' AND '<date>T23:59:59.999Z'
  (UTC bounds; wrong local day near midnight)

Login:
  LoginPage → loginUseCase → supabase.auth → onAuthStateChange → auth.store
  (gated by bootstrapApp, which hangs on web → login never renders)
```

---

## D. Database

Full detail: `audit/DATABASE_AUDIT.md`.

### Existing tables

**SQLite (13 + runner):** `profiles`, `customers`, `services`, `appointments`, `appointment_services`, `visits`, `visit_services`, `payments`, `expenses`, `color_formulas`, `color_formula_items`, `customer_photos`, `sync_outbox`, plus `schema_migrations`.

**PostgreSQL (12):** the same application tables except `sync_outbox`/`schema_migrations`; `local_path` is intentionally omitted from `customer_photos`.

### Relationships

```
customers 1─N appointments, visits, color_formulas, customer_photos
appointments 1─N appointment_services; 1─N visits (optional)
visits 1─N visit_services, payments, color_formulas, customer_photos
color_formulas 1─N color_formula_items
auth.users 1─1 profiles (profile.id = user_id)
sync_outbox → polymorphic (entity_type, entity_id), no FK
```

Every table carries `user_id`; all child tables cascade from their parent **where SQLite FK enforcement is enabled** (currently it is not).

### Migrations

- Local: single `001_initial.sql`, tracked in `schema_migrations`; new migrations need a raw import + array entry.
- Cloud: single raw SQL file, run manually in the Supabase SQL editor. No `config.toml`, no CLI workflow, no down migrations.
- Cloud migrations are re-runnable: `001` uses `IF NOT EXISTS` indexes, drops policies before
  recreating them, and creates the private bucket with `ON CONFLICT DO NOTHING`;
  `src/tests/unit/supabase-migrations.test.ts` enforces the pattern.
- Never edit an applied migration; add `004`, `005`, …

### RLS policies

RLS enabled on all 12 tables; one policy per table using `auth.uid() = user_id` with `USING` + `WITH CHECK`. Storage: select/insert/delete in `001` and update in `003` on `customer-photos`, path prefix = uid. `profiles` also auto-created by `handle_new_user()` on signup.

The two-user probe (`supabase/tests/rls_two_user_check.sql`) is committed but **has not been executed against a live project** — run it once per release project (Section 3 of the runbook).

### Known database defects

DB-01 outbox has no `updated_at`; DB-02 FK pragma not per connection; DB-03 no transactions; DB-04 no sync cursor; DB-05 child rows not synced; DB-06 hard deletes without tombstones; DB-07 profile insert vs trigger conflict; ~~DB-08 non-idempotent cloud migration/bucket~~ (fixed in T16); DB-09 REAL vs NUMERIC drift; DB-10 no overlap/`end_at` guard; DB-11 UTC day semantics; DB-12 server `updated_at` trigger overrides client time; DB-13 missing cloud indexes; DB-14 delete FK behaviour; DB-15 no outbox idempotency constraint.

### Data integrity risks

Orphan service lines (FK off, no transaction), lost revenue detail on restore (children not queued), duplicate records (double submit, no idempotency), unreplayable deletes (expenses), wrong daily totals (UTC), cross-owner leakage (RLS unverified), precision drift (formula decimals), conflict resolution impossible (server timestamp authority).

---

## E. Development instructions

### Prerequisites

- Node.js **24.x** (Node 20+ should work; 24 is what was verified), npm 11+
- Git
- For Android: Android Studio + SDK, a device or emulator
- A Supabase project (for auth; required for the app to start because the client throws without env vars)

### Clone and install (exact)

```bash
git clone https://github.com/mehdi1265/barber.git
cd barber
git checkout develop
npm ci
```

> npm 11 may warn that `esbuild@0.25.12` has a postinstall not covered by allow-scripts. The binary currently resolves and Vite builds. If esbuild fails on your machine, run `npm approve-scripts --allow-scripts-pending` (review first) or use npm 10.

### Environment setup

```bash
cp .env.example .env
```

Fill **only** these values from the Supabase dashboard (Project Settings → API):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

Rules:

- Never commit `.env`, service-role keys, database passwords, JWTs, or keystores.
- The anon key is public by design, but still keep it out of the repo.
- If these variables are missing, `src/services/supabase/client.ts` throws at import and the app shows a fatal screen.

### Supabase setup

1. Create/choose a project owned by the human.
2. Run `supabase/migrations/001_initial_schema.sql` in the SQL editor **once**. It is not idempotent; do not re-run blindly.
3. Storage → create a private bucket named `customer-photos` (the SQL only comments this out).
4. Auth → decide email confirmation (see open question Q2); if disabled, document it.

Do not run destructive SQL. Do not point tests at a project with real data.

### npm scripts (actual)

| Script | Command | Current status |
|---|---|---|
| `dev` | `vite` | Hangs on web boot (BUG-01) |
| `build` | `tsc -b && vite build` | **FAILS** (BUG-03) |
| `lint` | `eslint src --ext ts,tsx` | **Cannot run** (invalid `--ext`) |
| `lint:fix` | same + `--fix` | Cannot run |
| `format` | `prettier --write src/**/*.{ts,tsx,css}` | Works |
| `format:check` | `prettier --check …` | Fails on 92 files |
| `preview` | `vite preview` | Works after a build |
| `test` | `vitest --run` | **PASS 71/71** |
| `test:watch` | `vitest` | Works |
| `test:coverage` | `vitest --run --coverage` | Not configured |
| `cap:build` | `npm run build && npx cap sync` | Blocked by build |
| `cap:android` | build + `cap open android` | No `android/` project |
| `cap:ios` | build + `cap open ios` | No `ios/` project |
| `type-check` | `tsc --noEmit` | Passes vacuously (root `files: []`) |

### Testing commands

```bash
npm test                      # 25 files, 203 tests
npx vitest run src/tests/unit/jalali.test.ts   # single file
npm run test:coverage         # after configuring thresholds
```

Repository, write-integrity, and outbox tests execute real SQLite through Node's `node:sqlite`; customer/service repositories still use SQL mocks, and auth/UI tests mock Supabase and the database. Green tests are not proof of device, network, or sync behaviour.

### Build commands

```bash
npm run build                 # type-check + production bundle (green after T01)
npx vite build                # bundles only, no type-check
npm run dev                   # dev server (blocked by BUG-01)
npx cap sync android          # after T02 creates the platform
```

### Known command failures (after T01)

| Command | Failure | Fix owner |
|---|---|---|
| `npm run build`, `npm run lint`, `npm run format:check`, `npm run type-check` | Resolved in T01; all exit 0 locally | — |
| `npm run dev` | Blank page (bootstrap hangs) | T02 |
| `npm run cap:android` | No `android/` directory | T02 |

---

## F. Development roadmap

Priorities and full acceptance criteria: `audit/DEVELOPMENT_BACKLOG.md`. Requirement mapping: `audit/REQUIREMENTS_MATRIX.md`.

### Prioritized backlog (recommended execution order)

| # | Ticket | Depends on | Primary outcome |
|---|---|---|---|
| 1 | **T01 Quality gates (done)** | — | Green build/lint/format/tests + CI (remote run pending) |
| 2 | **T02 Runtime DB bootstrap (done)** | T01 | App boots on web + Android; correct encryption/pragma |
| 3 | **T03 Data integrity (done)** | T02 | Transactions, fixed outbox, child rows, idempotency |
| 4 | **T04 Local-day & Jalali (done)** | T03 | Correct "today" everywhere; Jalali input |
| 5 | **T05 Auth completion (done)** | T02, T03 | Logout, reset, profile guarantee, Persian errors |
| 6 | **T06 Appointments completion (done)** | T03, T04, T05 | Edit/reschedule/change services/delete |
| 7 | **T07 Finance (done)** | T03, T04, T06 | Visits, payments, expenses, reports, quick sale |
| 8 | **T08 Dashboard (done)** | T04, T07 | Today at a glance |
| 9 | **T09 Sync push (done)** | T03 | Reliable idempotent upload |
| 10 | **T10 Sync pull/recovery (done)** | T09, T04 | New-device restore + conflict policy |
| 11 | **T11 Color formulas (done)** | T03, T10 | Formula CRUD + item sync |
| 12 | **T12 Photos (done)** | T09, T10 | Offline capture → storage → restore |
| 13 | **T13 Notifications (done)** | T06 | Permission + reminder lifecycle |
| 14 | **T14 Settings/profile/history (done)** | T05, T09, T07 | Real settings + customer history |
| 15 | **T15 Global search (done)** | T07, T11 | Cross-entity search |
| 16 | **T16 Security & release (done)** | All | Secure storage, RLS verification, release |

### Dependency summary

`T01 → T02 → T03 → T04` is a hard chain. `T03 → T09 → T10`. `T04` gates all date-sensitive features. `T07` before `T08`. `T16` last.

### Acceptance criteria and required tests

Every ticket has explicit acceptance criteria and a test list in `DEVELOPMENT_BACKLOG.md`. Global rule: all gates green, new behaviour tested, no unrelated changes, no migration edits, no push without authorization.

### Milestone definition (MVP)

A barber installs the Android app, registers, manages customers/services, books and completes appointments, records payments and expenses, sees correct local-day and monthly totals, loses the phone, reinstalls, logs in, and gets **all** data back — no duplicates, no missing rows.

---

## G. Critical rules for the next agent

1. **Do not modify `main` or `docs`.** Work only on `develop`. No force-push, no rewrite of published history.
2. **Never push without explicit authorization.** Commit locally; report hashes. Merging to `main`/`docs` is a human decision.
3. **Preserve existing functionality.** Do not delete working code, rename tables, or "clean up" architecture inside a feature ticket. Dead-code removal needs approval and its own commit.
4. **Never perform destructive database operations.** No `DROP`, no data wipe, no re-running the cloud migration against a project that may hold real data, no `--force` resets.
5. **Do not implement multiple major tasks simultaneously.** One ticket at a time, in the documented order.
6. **Verify every change with tests and gates.** Green tests are not proof if they mock SQL; add integration coverage where the change touches SQL, transactions, or time.
7. **Follow the documented product requirements.** `docs/` is canonical. Do not invent features (staff accounts, online booking, SMS, payment gateway, redesign).
8. **Never edit an existing migration.** Add a new numbered migration in both schemas if needed, with justification.
9. **Never commit secrets or real customer data.** No `.env`, keys, tokens, keystores, or production dumps.
10. **Do not weaken quality to get green.** No blanket lint disables, no skipped tests, no `any`-casts to silence the compiler.
11. **Record decisions.** Product or architecture choices go into `docs/10-decisions-log.md` (or a new decision entry), not into silent code.
12. **Report evidence.** Every completion report states: commands run, results, files changed, commit hash, and what remains unverified.

---

## H. First assignment

### T01 — Quality Gates

**Status: complete locally (2026-11-12). First remote CI run pending push authorization.**

**Goal:** make the repository capable of proving its own health. No product feature, no refactor.

**Start by reading:** `package.json`, `tsconfig.json`, `tsconfig.app.json`, `eslint.config.js`, `.prettierrc`, `src/features/finance/finance.hooks.ts` (lines 1–10), `audit/PROJECT_STATUS.md §2`, `audit/DEVELOPMENT_BACKLOG.md#t01`.

### What T01 includes

1. **Fix the build blocker.** Remove the unused `todayISO` import in `src/features/finance/finance.hooks.ts:7`. Do not touch the finance logic. `npm run build` must pass.
2. **Make `type-check` real.** The root `tsconfig.json` has `"files": []`, so `tsc --noEmit` checks nothing. Change the script to `tsc -b` (project references). Prove it catches errors by introducing a temporary type error, observing failure, then reverting.
3. **Fix ESLint for flat config.** Replace `eslint src --ext ts,tsx` (and `lint:fix`) with `eslint .` / `eslint . --fix`. Then resolve the baseline: **53 errors, 16 warnings, 18 auto-fixable**. Fix the code; do not disable rules globally. If a rule is genuinely unsuitable, change the config in a separate commit with a written rationale.
4. **Apply the formatting baseline.** Run `npm run format`, then commit as a **formatting-only** commit. `npm run format:check` must pass. Keep it isolated so reviewers can ignore it.
5. **Add CI.** `.github/workflows/ci.yml`: Node 24, `npm ci`, then `type-check`, `lint`, `format:check`, `test`, `build`. Cache npm. (A green GitHub run requires push authorization; until then, local parity is the acceptance.)
6. **Add a root `README.md`** with install, env, commands, and pointers to `docs/` and `audit/`.
7. **Resolve the linter story.** Completed in T01: the unused `oxlint` dependency and `.oxlintrc.json` were removed; ESLint is the single linter. Do not reintroduce a half-configured second linter.
8. **Fix Vite aliases on Windows.** Replace `new URL(...).pathname` with `fileURLToPath(new URL(...))` in `vite.config.ts`.

### Explicitly out of scope for T01

- Fixing BUG-01/BUG-02 (boot/encryption) — that is T02.
- Adding transactions or fixing the outbox — T03.
- Date/timezone fixes — T04.
- Deleting `src/App.tsx`, `src/App.css`, or `src/database/repositories/base.repository.ts` — needs approval.
- Adding feature tests for untested modules.
- Changing any SQL migration or application behaviour.

### Completion criteria (all must be demonstrated)

- [ ] `npm ci` succeeds from a clean clone.
- [ ] `npm run type-check` exits 0 **and** fails on a deliberately introduced type error (documented proof).
- [ ] `npm run lint` exits 0 with no global disables added.
- [ ] `npm run format:check` exits 0; the formatting commit contains no logic changes.
- [ ] `npm test` is green with **at least** the baseline 71/71.
- [ ] `npm run build` exits 0 and emits `dist/`.
- [ ] CI workflow exists and runs exactly those gates.
- [ ] `git diff --stat` confirms no changes under `supabase/` or `src/database/migrations/`, and no application logic beyond the one-line import removal and lint-driven fixes.
- [ ] Work is committed locally on `develop`; **nothing pushed**.
- [ ] Completion report includes commands, outputs, commit hashes, and any rule/config decision.

### Required verification commands

```bash
git status
git log --oneline -5
npm ci
npm run type-check
npm run lint
npm run format:check
npm test
npm run build
git diff --stat 877ebde..HEAD
```

### Suggested commit sequence

1. `fix(finance): remove unused todayISO import (BUG-03)`
2. `chore(tooling): make type-check use project references (TD-04)`
3. `chore(tooling): fix eslint flat-config scripts and baseline violations (TD-02)`
4. `style: apply prettier baseline (TD-03)` — no logic changes
5. `ci: add quality-gate workflow and root readme (TD-01, TD-20)`

T01 is complete. Stop here; do not continue into T02 without a new instruction.

---

## Appendix — open human decisions (unresolved at handover)

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Which Supabase project and credentials? | No sync/RLS verification possible |
| Q2 | Email confirmation on/off? | Assume off; document |
| Q3 | Refunds/returns in MVP? | Line discounts only |
| Q4 | Is web a product or dev convenience? | Dev-only, ephemeral storage |
| Q5 | Android only or iOS too? | Android first |
| Q6 | Conflict authority? | Server `updated_at` wins for synced rows |
| Q7 | Is a second device required for acceptance? | Wiped local DB + emulator counts |
| Q8 | Who authorizes pushes/merges? | No push without explicit authorization |
| Q9 | Multiple barbers per account? | No — single owner |
| Q10 | Distribution channel? | Direct APK / Play internal testing |

Answering Q1/Q2/Q5 before T09 and Q3 before T07 avoids rework. Record answers in `docs/10-decisions-log.md`.

---

## Final execution pass (2026-11-14)

Baseline: `HEAD = 28da1dd`, branch `develop`, 68 modified + 20 untracked + 0 staged.

Changed in this pass:
- `src/tests/unit/customer.repository.test.ts` and `src/tests/unit/service.repository.test.ts`
  now run against real in-memory SQLite via `src/tests/helpers/sqlite-harness.ts` (TD-05 closed).
- `src/shared/utils/helpers.ts` — `matchesSearch` normalises both sides (BUG-31 closed);
  `src/tests/unit/helpers.test.ts` gained a Persian-digit-in-text regression test.
- `vitest.config.ts` — coverage thresholds 70/60/60/70 (baseline 73.58/66.11/67.68/75.47);
  `.github/workflows/ci.yml` gained a "Coverage thresholds" step. TD-06 closed.
- `ios/App/Podfile` — added `CapacitorCamera`, `CapacitorFilesystem`,
  `AparajitaCapacitorSecureStorage` (they were installed but not linked).
- Register/doc updates: BUG-22 resolved, TD-13/20 confirmed resolved, TD-18/19 partial,
  TD-11 partial (dead files retained because this pass may not delete pre-existing files),
  plus status sections in PROJECT_STATUS, BUGS, release docs, NEXT_STEPS.

Verified: type-check, lint, format:check, build (0 maps, 2.2 MB), **403/403 tests / 52 files**,
coverage thresholds pass, `npm audit --omit=dev` 0. Android artifact hashes unchanged
(`c6b28d3a…`, `a25f032f…`, `90a1878d…`); APK has no `debuggable`, `allowBackup=false`, no
`sb_secret_*`. iOS build, device runs, hosted migrations, and 16 KB runtime remain **NOT RUN**.

Do not commit, push, merge, reset, clean, write to Supabase, or replace a real database.

---

## Final closure pass (2026-11-14)

Repo state: `develop` @ `28da1dd`; 71 modified + 22 untracked entries in porcelain
(89 files with `-uall`), 0 staged. No commit/push/merge/reset/clean.

Done:
- Deleted `src/App.tsx`, `src/App.css`, `src/database/repositories/base.repository.ts` after
  proving zero importers (owner authorized in this pass). BUG-30 and TD-11 closed.
- `.gitignore`: `android/` and `ios/` no longer wholesale-ignored, so the 69 hand-maintained
  native files (manifest, backup rules, Gradle config, Podfile, Info.plist, Xcode project,
  assets) are traceable. Nested `android/.gitignore` / `ios/.gitignore` still exclude
  `build/`, `.gradle/`, `local.properties`, `Pods/`, `public/`, generated configs; secrets
  stay ignored. **The files are untracked — owner must review and commit.**
- TD-24 closed for this release with evidence: the only `UtilsEncryption` callers are the
  plugin's `exportToJson`/`importFromJson` bridge, and `rg` finds no app call. Fixed salt/IV
  remains a documented precondition for any backup feature.
- New docs: `docs/FINAL_PROJECT_HANDOVER.md` (architecture, native inventory, Android/iOS
  release paths) and `docs/FINAL_OWNER_ACTION_CHECKLIST.md`.

Verified: type-check, lint, format:check, build green; **403/403 tests / 52 files**; 0 source
maps; `dist` 2.2 MB; `npm audit --omit=dev` 0; release APK `zipalign -c -P 16` passes;
`llvm-readelf` shows `p_align = 0x4000`; Google Maven still 404.

Not run: Android device/16 KB runtime, official rebuild, iOS build/archive, hosted migrations.
TD-22 stays open. See the owner checklist for the remaining external steps.

---

**End of handover.** Next action: **T02** when assigned. Do not start implementation beyond it.
