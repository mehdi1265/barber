# ARCHITECTURE AUDIT — Barber App

> **Question answered:** what architecture was designed, what was actually built, where do they diverge, and what does that cost?
> **Sources:** `docs/05-technical-architecture.md`, `docs/06-database-api-design.md`, `docs/02-prd.md`, plus the `src/` tree at `877ebde`.

---

## 1. Designed architecture (as documented)

`docs/05-technical-architecture.md` specifies a layered offline-first client:

```
Presentation (React pages/components)
        ↓
Feature modules (hooks, schemas, forms)
        ↓
Application / use-cases (orchestration, validation, outbox)
        ↓
Domain (pure calculators, entities, rules)
        ↓
Data access (repositories)
        ↓
SQLite (source of truth)  ⇄  Sync engine (outbox push / pull)  ⇄  Supabase Postgres + Storage
```

Key claims in the design:

- SQLite is the **source of truth**; the UI never waits on the network.
- Every write goes through a repository, which also appends to `sync_outbox` **in the same transaction**.
- A sync engine pushes the outbox with retry/backoff, then pulls remote changes on login/new device.
- Supabase is a private per-owner mirror protected by RLS; Storage holds photos.
- Zustand holds session/sync UI state; TanStack Query caches repository reads.
- Capacitor wraps the same web build for Android/iOS.

---

## 2. Actual architecture (as built)

```
main.tsx
  └─ bootstrapApp()                         ← waits for SQLite + migrations, then getSession()
       └─ Providers (TanStack QueryClient)
            └─ RouterProvider (12 screens + redirect/404, auth guards)
                 └─ AppShell (RTL nav + sync banner)
                      └─ Feature pages
                           └─ feature hooks (useQuery/useMutation)
                                └─ repositories (raw SQL, user_id scoping)
                                     ├─ SQLite connection (broken init)
                                     └─ addToOutbox()          ← write-only, no consumer

services/supabase/client.ts  ← Auth only (login/register/session). Zero data/storage calls.
```

There is **no application/use-case layer** except `features/auth/auth.usecases.ts`, and **no sync engine** at all. The outbox is a write-only table.

### Layer reality check

| Concern | Documented | Actual | Verdict |
|---|---|---|---|
| Presentation | Pages + shared UI | 12 screens (+redirect/404), ~25 components | **Conforms** |
| Feature modules | hooks/schemas | Present for 6 features | **Conforms** |
| Application/use-cases | Orchestration + transactions | Only auth; repositories called directly from hooks | **Diverges** |
| Domain | Pure calculators | `finance.calculator.ts`, `helpers.ts`, `jalali.ts` | **Conforms** (finance not consumed by UI) |
| Data access | Repositories | 7 repositories + 2 feature-local repos | **Mostly conforms** |
| Transactions | Required for multi-table writes | None (`beginTransaction`/`commitTransaction` never used) | **Diverges (critical)** |
| Sync engine | Outbox push + pull | Absent | **Diverges (critical)** |
| Supabase data | Mirror via repositories | Auth only | **Diverges (critical)** |
| Storage | Photo upload | Absent | **Diverges** |
| State | Zustand + Query | Auth used; sync store dead | **Partial** |
| Mobile shell | Capacitor Android/iOS | Config only, no platforms | **Incomplete** |

---

## 3. Routing

Defined in `src/app/router.tsx` (React Router 7, `createBrowserRouter`).

| Path | Component | Guard | State |
|---|---|---|---|
| `/` | redirect → `/dashboard` | auth | — |
| `/login` | `LoginPage` | `RedirectIfAuth` | Implemented |
| `/register` | `RegisterPage` | `RedirectIfAuth` | Implemented |
| `/dashboard` | `DashboardPage` | `RequireAuth` | **Placeholder** |
| `/appointments` | `AppointmentsPage` | auth | Day/week agenda |
| `/appointments/:id` | `AppointmentDetailPage` | auth | Detail + status |
| `/customers` | `CustomersPage` | auth | List/search/create |
| `/customers/:id` | `CustomerDetailPage` | auth | Detail/edit/delete |
| `/color-formulas` | `ColorFormulasPage` | auth | **Placeholder** |
| `/color-formulas/:id` | `ColorFormulaDetailPage` | auth | **Placeholder** |
| `/finance` | `FinancePage` | auth | **Placeholder** |
| `/settings` | `SettingsPage` | auth | **Placeholder** |
| `/settings/services` | `ServicesPage` | auth | Implemented, unreachable from UI |
| `*` | `NotFoundPage` | — | Persian 404 |

Notes:

- Guards read `isAuthenticated` from the persisted Zustand store (`router.tsx:33-50`). Because `isLoading` is not consulted, a hard refresh can briefly redirect to `/login` before `bootstrapApp` resolves; in practice the router is not mounted until bootstrap finishes (`main.tsx:10-22`), so the risk is limited to stale persisted state.
- Routes are lazy-loaded through a shared `SuspenseWrapper`; there is no error boundary.
- Missing routes: `/reset-password`, quick sale, finance sub-pages, settings sub-pages (profile, sync).

---

## 4. State management

| Store | File | Used by | Reality |
|---|---|---|---|
| Auth | `state/auth.store.ts` | guards, hooks, repositories via `userId` | Working; persists `userId` + `isAuthenticated` only |
| Sync | `state/sync.store.ts` | `AppShell` banner | **Dead**: every setter has zero callers |
| Server cache | `app/providers.tsx` | all feature hooks | `staleTime: 5 min`, retry 2, mutation errors only logged |

Consequences and risks:

- A 5-minute `staleTime` on a purely local database means a tab can show stale rows after a write from another surface unless the mutation invalidates the exact key. Hooks do invalidate (e.g. `appointments.hooks.ts`), but there is no global consistency strategy.
- `userId!` non-null assertions are used throughout hooks; a render before the store hydrates would throw. Bootstrap ordering currently hides this.
- No global error or offline state.

---

## 5. Data flow (actual)

### 5.1 Create an appointment

```
AppointmentForm (react-hook-form + Zod)
  → useCreateAppointment().mutateAsync
    → new AppointmentRepository(db, userId)
      → INSERT appointments                       (run)
      → INSERT appointment_services × N           (run, loop)
      → INSERT sync_outbox (parent payload)       (run)
    → invalidate ['appointments', uid, ...]
```

Failure at step 2 leaves an appointment without services; failure at step 3 leaves data that will never sync. No transaction wraps steps 1–3. Child rows are never queued. This is the concrete shape of BUG-06 and BUG-07.

### 5.2 Read a day

```
AppointmentsPage(selectedDate = todayISO())
  → useAppointmentsByDay(dateISO)
    → findByDay: start = `${dateISO}T00:00:00.000Z`, end = `${dateISO}T23:59:59.999Z`
```

`todayISO()` is derived from `toISOString()` (UTC). In Tehran, between 00:00 and 03:30 local, both the selected date and the query bounds describe the previous day. This is BUG-05 and it affects appointments, visits, payments, expenses, and reports.

### 5.3 Login

```
LoginPage → loginUseCase(email, password)
  → supabase.auth.signInWithPassword
    → onAuthStateChange → auth.store.setSession
      → RequireAuth renders /dashboard
```

SQLite is initialized **before** auth in `bootstrapApp`. On web this never resolves (BUG-01), so the login screen is never reached. Architecturally, authentication does not depend on the local database and should not be gated by it.

### 5.4 Intended sync (not implemented)

```
write → SQLite + outbox (same transaction)          [missing transaction]
      → worker reads pending rows                    [missing]
      → supabase.from(entity).upsert/delete          [missing]
      → markOutboxDone/Failed                        [broken SQL]
pull  → select where updated_at > cursor             [missing cursor table]
      → merge into SQLite                            [missing]
```

---

## 6. Offline-first assessment

| Property | Status | Note |
|---|---|---|
| Reads from local DB | Yes | All queries are SQLite |
| Writes to local DB | Yes | All mutations are SQLite |
| Network in UI path | Only auth | Good |
| Works without network after login | Likely | Session persisted; refresh may fail when token expires |
| Data durable on native | Likely | File-backed SQLite, but encryption init fails |
| Data durable on web | **No** | In-memory `jeep-sqlite`; no `saveToStore()` |
| Queued writes survive restart | Yes (rows) | But never sent |
| Cloud recovery | **No** | No pull path |

**Conclusion:** the app is "local-first" but not "sync-capable". The offline promise is half-implemented: durability on device is plausible, durability on web and recovery on a new device are not.

---

## 7. Security and isolation

| Control | Design | Actual | Risk |
|---|---|---|---|
| Row ownership | `user_id` on every table + RLS `auth.uid()` | RLS SQL complete; local repos filter `user_id` | **Medium** — never executed/tested |
| Storage | bucket `customer-photos`, folder = uid | Policies defined; bucket creation commented out | **Medium** — deployment step missing |
| Session storage | Secure device storage | `localStorage` via supabase-js | **Medium** on device |
| DB encryption | SQLCipher + device key | Broken init; key in `localStorage` | **High** — protection is nominal |
| Secrets | Env vars only | `.env` ignored, no real keys in repo | **Low** |
| Transport | HTTPS | supabase-js default | **Low** |
| Input handling | Zod + parameterised SQL | Conforms; no string interpolation of user data except the passphrase PRAGMA | **Low** |

The passphrase is interpolated into SQL (`database.ts:73`). It is generated hex, so injection is not currently exploitable, but it is a bad pattern and should be replaced by the plugin's encryption API.

---

## 8. Architecture inconsistencies (ranked)

| ID | Inconsistency | Evidence | Cost |
|---|---|---|---|
| A-01 | No use-case/unit-of-work layer; hooks call repositories directly | `features/*/*.hooks.ts` | Cross-table invariants cannot be enforced in one place |
| A-02 | Outbox written inline by repositories, but no consumer | `outbox.repository.ts` | Dead weight now; migration risk later |
| A-03 | Finance repository lives under `features/finance`, unlike all others | `features/finance/finance.repository.ts` | Inconsistent discoverability; circular-import risk |
| A-04 | Day-range logic duplicated in 4+ repositories and calculator | `appointment/visit/expense/finance` repos | The BUG-05 class of defect exists in every copy and was never fixed consistently |
| A-05 | Two type sources: `shared/types/index.ts` and `services/supabase/database.types.ts` | both files | Drift between local and server shapes |
| A-06 | Auth store and Supabase session are dual sources of truth | `auth.store.ts` + `bootstrap.ts` | Stale `userId` after token revocation |
| A-07 | Sync store has no writer | `sync.store.ts` | UI lies ("idle") |
| A-08 | Bootstrap blocks UI on DB init | `main.tsx:10` | Any DB failure = no login screen |
| A-09 | No error boundary | `providers.tsx` | One render error blanks the app |
| A-10 | Vite aliases built with `URL.pathname` | `vite.config.ts:6-14` | Fragile on Windows/`file://`; works today, should use `fileURLToPath` |
| A-11 | `App.tsx` template + `base.repository.ts` dead code | root `src/` | Confuses navigation; `require()` is invalid in ESM browser code |
| A-12 | `type-check` script checks nothing | `tsconfig.json` `files: []` | False green in any future CI |

---

## 9. Recommended architectural adjustments (no requirement changes)

1. **Introduce a thin application layer** for multi-table operations: `createAppointment`, `recordVisitWithPayment`, `deleteExpense`, `upsertFormula`. Each owns one transaction and one or more outbox rows. This satisfies A-01 and is a prerequisite for T09.
2. **One date utility**: `localDayRange(dateISO, timeZone)` plus a single `todayLocalISO()`. Replace every `T00:00:00.000Z` construction. Do not change storage format (ISO-8601 UTC) — only the boundaries.
3. **Split bootstrap**: render the auth screens as soon as the session check completes; initialize SQLite behind a status screen. DB failure must not hide login.
4. **Make the sync store the single source of sync truth**, driven by the worker (T09), and surface `pendingCount` from a real count.
5. **Use generated Supabase types** (`supabase gen types`) once data calls exist; keep `shared/types` as the local domain model and map explicitly.
6. **Move `finance.repository.ts`** to `src/database/repositories/` (pure move, no logic change) or document the exception.
7. **Add `fileURLToPath` aliases** and an `ErrorBoundary` at the router root.
8. **Delete dead code only after approval**, in its own commit, with tests green before/after.

These are architecture-level recommendations for the backlog. None changes a product requirement or the documented data model.
