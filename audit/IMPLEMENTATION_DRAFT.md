# IMPLEMENTATION DRAFT — Barber App

> **Purpose:** the strategy layer between the audit and the tickets. Explains *why* the backlog is ordered this way, what must be decided before coding, how quality will be proven, and what "done" means for the MVP.
> **Baseline:** `877ebde`. **Tickets:** [`DEVELOPMENT_BACKLOG.md`](./DEVELOPMENT_BACKLOG.md). **Evidence:** [`IMPLEMENTATION_AUDIT.md`](./IMPLEMENTATION_AUDIT.md), [`DATABASE_AUDIT.md`](./DATABASE_AUDIT.md).

---

## 1. Executive summary

The repository contains a coherent scaffold and two complete vertical slices (customers, services), but it **cannot start**, **cannot build**, and **does not sync**. The documented product promise — a barber's data survives a lost phone — has zero implementation: the outbox is written and never read, and Supabase is used only for authentication.

Therefore the next cycle is not "build the remaining screens". It is:

1. **Make the truth visible** — green build, working lint/format/CI (T01).
2. **Make the app run** — correct web/native DB bootstrap (T02).
3. **Make writes safe** — transactions, outbox correctness, child rows (T03).
4. **Make time correct** — local-day semantics and Jalali input (T04).

Only then do feature work (T05–T08), followed by the cloud layer that justifies the product (T09–T10). Doing it in the opposite order would encode timezone, transaction, and payload defects into data that later syncs to the cloud — the most expensive class of bug to fix.

---

## 2. Current vs target

| Capability | Today | Target after this draft |
|---|---|---|
| Build & gates | Red build, unrunnable lint, no CI | Clean clone passes all gates in CI |
| Boot | Web hangs; native encryption broken | Web dev + Android run |
| Persistence | Native plausible; web in-memory | Native durable; web documented |
| Transactions | None | Every multi-table write atomic |
| Outbox | Write-only, broken completion SQL | Correct rows, child rows, idempotent |
| Days | UTC calendar dates | Local-day everywhere, Jalali input |
| Auth | Login/register only | Full lifecycle + profile guarantee |
| Appointments | Create/list/status | Full CRUD + reschedule |
| Finance | Data layer only | Usable reports, payments, expenses |
| Dashboard | Placeholder | Today at a glance |
| Sync | None | Push + pull + conflict policy |
| Formulas/photos | Tables only | Working features |
| Reminders | Schedule on create + cancel on cancel/delete; no permission prompt | Permission-aware, rescheduled, reliable |
| Security | Nominal encryption, localStorage key | Secure storage, verified RLS |

---

## 3. Scope of the next development cycle

**In scope:** T01–T10 (stabilisation + core MVP + sync), then T11–T16 as capacity allows. A realistic single-agent estimate is **8–12 focused weeks** for T01–T10 with tests; T11–T16 add roughly **4–6 weeks**. These are planning estimates, not commitments.

**Explicitly out of scope:** multi-barber accounts/staff, online booking for customers, payments gateway, SMS, analytics, iOS release, web production hosting, redesign.

**Definition of MVP success:** a barber can install the Android app, register, manage customers/services, book and complete appointments, record payments and expenses, see correct daily/monthly totals, lose the phone, reinstall, log in, and get **all** data back — with no duplicate or missing rows.

---

## 4. Sequencing rationale

| Order | Why this, not the obvious alternative |
|---|---|
| T01 before everything | Without a real type-check and a green build, every later claim is unverifiable. Fixing one unused import unlocks the build; making `type-check` real prevents the next false green. |
| T02 before features | The app cannot be exercised in a browser, and native encryption fails. Feature work without a runnable app is blind coding. |
| T03 before sync and before more writes | Adding finance/appointment writes on top of non-transactional, child-less queuing multiplies the repair cost. Fix the write path once. |
| T04 before finance/dashboard | Money shown on the wrong day is worse than no money screen. The defect is proven, not hypothetical. |
| T05 before appointments/finance UX | Every screen assumes a `userId` and a profile. Logout/reset/profile gaps block real usage and testing on shared devices. |
| T06/T07/T08 before sync | The sync payload must be stable. Building push against a moving schema produces rewrites and bad server data. |
| T09/T10 after the local MVP | Push needs correct outbox rows; pull needs a cursor and merge policy. Both depend on T03/T04. |
| T11–T15 after sync | Formulas/photos/reminders/search are valuable but not required to prove the core loop. They generate new entity types that benefit from a working sync framework. |
| T16 last | Security verification requires a live project and a running app; release requires everything else. |

**Parallelisation (two agents):** after T03, one agent can do T05→T06→T07 while another does T09. T10 must wait for T09. Never run two migrations in parallel.

---

## 5. Decisions required before/during implementation

Each decision is either **blocking** a ticket or can be deferred with a documented default.

| # | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| D1 | Timezone model | (a) store UTC + compute local day at query time; (b) add `local_date` column per row | **(a)** — no schema change, correct for one device timezone; (b) only if multi-timezone reporting is required | T04 |
| D2 | Money encoding | (a) integer Toman × 100; (b) integer Toman; (c) decimal | **Keep (a)** — implemented, tested, no float drift; rename misleading `amountCents` later | T07 |
| D3 | Supabase project & bucket | Existing project? Who owns credentials? | **Human must provide** a project (or create one) and create the private bucket; no credentials in repo | T09, T12, T16 |
| D4 | Email confirmation | On / off | **Off for MVP** (faster onboarding) unless the human wants verification; document the choice | T05 |
| D5 | Discounts & refunds | (a) line discount only; (b) visit-level discount; (c) refund events table | **(a) for MVP** — schema already has `discount_amount`; refunds need a new table and requirement | T07 |
| D6 | Platform priority | Android first / both | **Android first** — Capacitor project, device testing, release signing | T02, T16 |
| D7 | Web support level | (a) dev-only; (b) production PWA with persistence | **(a)** — document ephemerality, avoid promising durability | T02 |
| D8 | Currency display | Toman / Rial | **Toman display, IRR stored** — matches existing `formatToman` and docs | T07 |
| D9 | Reminder lead time | Fixed / configurable | **Configurable, default 30 min** | T13 |
| D10 | Branch workflow | Work only on `develop`; merge to `main`/`docs` later | **`develop` only**, no push without authorization; the human decides integration | all |
| D11 | Photo retention | Keep forever / prune local | **Keep; prune local files only after confirmed upload**; document quota | T12 |
| D12 | Conflict policy | Server-wins / client-wins / field merge | **Server `updated_at` wins for synced rows; pending local edits win until pushed**; document exceptions | T10 |

> D1, D3, D4, D6 are blocking. The others have safe defaults and can be confirmed during the relevant ticket.

---

## 6. Work breakdown and exit criteria

### Wave 0 — Stabilise (T01–T04)

| Ticket | Deliverable | Exit criteria |
|---|---|---|
| T01 | Green gates + CI | All six commands pass from a clean clone; CI mirrors them; formatting isolated |
| T02 | Runnable app | Web dev shows login; Android launches; encryption correct or documented; FK pragma on |
| T03 | Safe writes | Zero partial rows on injected failure; outbox SQL correct; children queued; idempotency key |
| T04 | Correct days | Asia/Tehran midnight test passes; Jalali input shipped; calculator tested |

**Gate to Wave 1:** `npm run build` green; browser smoke test; transaction tests green; timezone tests green.

### Wave 1 — Core MVP (T05–T08)

| Ticket | Deliverable | Exit criteria |
|---|---|---|
| T05 | Full auth lifecycle | Register/login/logout/reset/profile guarantee; Persian errors |
| T06 | Full appointments | Edit/reschedule/change services/delete; conflict on update; no double submit |
| T07 | Usable finance | Walk-in, partial payments, expenses, day/week/month, debt, quick sale |
| T08 | Dashboard | Six correct metrics + next appointment + quick actions |

**Gate to Wave 2:** a complete local workflow on a real device, with a scripted manual test and no known P0 local bug.

### Wave 2 — Cloud (T09–T10)

| Ticket | Deliverable | Exit criteria |
|---|---|---|
| T09 | Push engine | Pending rows drain; retries/backoff; idempotent; status UI real |
| T10 | Pull/recovery | Wiped device restores everything; deterministic conflict outcome; cursors |

**Gate to Wave 3:** two-device restore drill documented and repeatable; no data loss after 3 consecutive sync cycles.

### Wave 3 — Features (T11–T15)

Formulas → photos → reminders → settings/history → search. Each ships independently behind a green gate; no schema change without a migration and a sync strategy.

### Wave 4 — Release (T16)

Security, RLS verification, idempotent cloud migration, error boundary, supply chain, signing, and a fresh-device acceptance run.

---

## 7. Testing strategy

### 7.1 Current state

71 unit tests, all against hand-written SQL mocks. They verify orchestration shape, not SQL. Finance, sync, bootstrap, and components have no tests.

### 7.2 Target pyramid

| Layer | Tool | Scope | When |
|---|---|---|---|
| Unit | Vitest | calculators, date helpers, schemas, mapping functions, merge rules | every ticket |
| Repository integration | Vitest + a **real** SQLite engine | SQL correctness, transactions, constraints, migrations | T03 onward |
| Component | Testing Library | forms, dialogs, empty/error states | T05 onward |
| Contract | Vitest + mocked Supabase client | payload mapping, retry, idempotency | T09 |
| Manual device | checklist | camera, notifications, encryption, background sync, kill/restart | T02, T12, T13, T16 |
| RLS matrix | SQL script + two test users | every table and storage bucket | T16 |

### 7.3 Recommended integration harness

The current mock cannot catch BUG-04. Choose one:

- **Option A (preferred):** run repository tests against a real SQLite engine in Node (`better-sqlite3` or `node:sqlite` if available in Node 24) behind a thin adapter that implements the subset of `SQLiteDBConnection` used (`run`, `query`, `execute`, `beginTransaction`, …). Fast, CI-friendly, no emulator.
- **Option B:** `@capacitor-community/sqlite` web + `jeep-sqlite` in jsdom. Slower, closer to production, more setup.
- **Option C:** device/emulator tests only. Not acceptable as the sole strategy.

Whichever is chosen, **migrations must be executed** in at least one automated test so schema drift is caught.

### 7.4 Timezone tests

Use `vi.setSystemTime` plus `TZ` env in a dedicated test process (Node honours `TZ` at startup). Cover:
`Asia/Tehran` 00:00/00:30/23:59; `UTC`; `America/New_York` DST transition; a negative-offset zone for `applyTimeToDate`.

### 7.5 Manual device checklist (repeat per release)

1. Fresh install → register → login.
2. Create customer + service → book appointment → edit time → conflict rejected.
3. Walk-in with 2 services + partial payment → totals correct.
4. Expense → day total/net correct at 00:10 local.
5. Airplane mode → create data → reconnect → sync → verify remote rows.
6. Wipe app data → login → everything restored.
7. Kill app → reopen → data and session intact.
8. Permission denied notification path.
9. Photo capture offline → upload online → visible on second device.
10. Logout with pending rows → warning → data retained.

---

## 8. Migration strategy

1. **Forward-only.** Never edit `001_initial.sql` or `001_initial_schema.sql`.
2. Local migrations: new file `00X_name.sql` + import/array entry in `migrations.ts`; test on fresh and upgraded DBs.
3. Cloud migrations: new file in `supabase/migrations/`, idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`), applied to a **staging** project first.
4. Planned migrations:
   - `002_outbox_hardening.sql` (T03): `processed_at`, `last_attempt_at`, `client_op_id` + unique index.
   - `003_sync_state.sql` (T10): single-row cursor table.
   - `004_indexes_and_fks.sql` (T10): missing indexes, delete behaviour decisions.
   - Later, only if justified: FTS (T15), decimal alignment (T11).
5. Every migration needs: purpose, rollback note (even if "restore from backup"), and a test that applies it to the previous schema.
6. No destructive operation against real user data without an export and explicit human approval.

---

## 9. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Timezone fix changes existing report boundaries | High | Medium | Define semantics first; tests; no data migration needed |
| Sync payloads change after T09 | Medium | High | Stabilise entities in T03/T06/T07 before push; version payloads |
| Server `updated_at` trigger breaks conflict policy | High | High | Decide policy in T10 before coding; use server time + pending-op precedence |
| RLS/grants reject writes | Medium | High | Verify with a staging project early (T09), two-user matrix |
| SQLite plugin differences web/native | High | Medium | Platform-specific code paths + device test matrix |
| Encryption on existing installs | Medium | High | Fresh-install assumption; document migration or wipe |
| Photo storage cost/quota | Medium | Medium | Compression, size limits, retention decision |
| Secrets in CI/logs | Low | High | Env secrets, no logging of tokens, scanning |
| Single-agent context loss | Medium | Medium | This audit + handover; one ticket per session |
| Scope creep into staff/multi-tenant | Medium | High | Explicit out-of-scope list; require requirement change approval |

---

## 10. Open questions for the human

| # | Question | Why it matters | Default if unanswered |
|---|---|---|---|
| Q1 | Which Supabase project should be used, and who provides the URL/anon key? | Blocks T09/T12/T16; secrets must not be committed | Work locally; sync untestable |
| Q2 | Is email confirmation enabled on that project? | Changes registration UX and tests | Assume disabled; document |
| Q3 | Are refunds/returns required for MVP? | Needs a new table and sync semantics | Implement line discounts only |
| Q4 | Is web a supported product or a dev convenience? | Determines persistence work and claims | Dev-only, ephemeral |
| Q5 | Android only, or iOS too? | Determines platform setup and test matrix | Android only |
| Q6 | Should the cloud mirror be authoritative on conflict? | Determines merge code | Server-wins for synced rows |
| Q7 | Is a second device part of the acceptance test? | Defines "recovery" proof | Emulator + wiped local DB counts |
| Q8 | Who authorizes pushes/merges to `main`/`docs`? | Prevents accidental history changes | No push without explicit authorization |
| Q9 | Should the app support multiple barbers per account? | Changes the data model (staff table) | No — single owner |
| Q10 | Is the target Iranian App Store/Play Store distribution? | Affects signing, privacy policy, consent text | Assume direct APK / Play internal testing |

Answers must be recorded in `docs/10-decisions-log.md` (or a new decision entry) before the affected ticket is closed. Do not silently choose a product behaviour.

---

## 11. What the next agent must not do

- Do not start with dashboard/finance UI because it "looks empty". The data path is broken.
- Do not add features while the build is red or the browser app cannot boot.
- Do not delete dead code, rename tables, or "clean up" architecture in a feature ticket.
- Do not rewrite `001` migrations.
- Do not push, force-push, merge, or tag without explicit authorization.
- Do not run destructive SQL against any project that might contain real data.
- Do not weaken lint rules or tests to obtain green.
- Do not invent requirements (staff accounts, online booking, SMS, payments gateway).
- Do not claim sync works until a wipe-and-restore drill has passed.
- Do not commit `.env`, keys, keystores, or real customer data.

---

## 12. First action

Open [`AGENT_HANDOVER.md`](./AGENT_HANDOVER.md), read section **H**, and execute **T01 — Quality Gates** exactly as specified. Stop after T01 is green, committed locally, and reported.
