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
> generated and synced (both git-ignored; no device build on this Windows machine). Native runtime,
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
