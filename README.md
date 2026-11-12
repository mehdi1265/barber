# Barber App

Offline-first barber shop management app for a single barber: appointments, customers, services,
visit finance, color formulas, and settings. Built with React 19, TypeScript, Vite, Capacitor, and
SQLite; Supabase is used for authentication only.

> **Status: pre-alpha.** The application shell, local schema, and core repositories exist, but the
> web bootstrap is currently blocked by the SQLite web implementation and the sync engine is not
> implemented. See [`audit/PROJECT_STATUS.md`](audit/PROJECT_STATUS.md) for the verified state.

## Stack

| Layer        | Technology                                        |
| ------------ | ------------------------------------------------- |
| UI           | React 19, React Router 7, TanStack Query, Zustand |
| Build        | Vite 8, TypeScript 5 (project references)         |
| Native shell | Capacitor 7 (Android first)                       |
| Local data   | SQLite via `@capacitor-community/sqlite`          |
| Auth         | Supabase Auth                                     |
| Testing      | Vitest 3, Testing Library, jsdom                  |

## Prerequisites

- Node.js 24 and npm 11 (the CI workflow uses Node 24)
- For native builds: Android Studio with an Android SDK/emulator
- A Supabase project **only if** you are working on authentication (see below)

## Setup

```bash
npm ci
cp .env.example .env
# fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY with development credentials
npm run dev
```

`.env` is git-ignored. Never commit real credentials. `VITE_*` values are embedded in the client
bundle, so only the Supabase anon key may be used there.

### Current boot limitation

`src/database/sqlite/database.ts` uses the native SQLite plugin without a web-capable driver or
store persistence. As a result, the browser build starts but the database bootstrap does not
complete (documented as `BUG-01`). The primary target is a native Android build; browser support
is tracked separately.

## Quality gates

```bash
npm run type-check    # tsc -b over tsconfig.app.json + tsconfig.node.json
npm run lint          # ESLint flat config over the repository
npm run format:check  # Prettier check for src/**/*.{ts,tsx,css}
npm test              # Vitest, 71 tests
npm run build         # tsc -b && vite build
```

The same commands run in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) on every push and
pull request. Apply formatting with `npm run format`.

## Scripts

| Script                                | Purpose                                               |
| ------------------------------------- | ----------------------------------------------------- |
| `dev`                                 | Start the Vite dev server                             |
| `build`                               | Type-check and produce a production bundle in `dist/` |
| `preview`                             | Serve the production bundle                           |
| `type-check`                          | Type-check all referenced projects                    |
| `lint`, `lint:fix`                    | Run/fix ESLint                                        |
| `format`, `format:check`              | Write/check Prettier formatting                       |
| `test`, `test:watch`, `test:coverage` | Run tests once, in watch mode, or with coverage       |
| `cap:build`, `cap:android`, `cap:ios` | Build and open a native project                       |

## Project structure

```text
src/
  app/          bootstrap, providers, router, route elements
  database/     SQLite connection, migrations, repositories
  features/     auth, dashboard, appointments, customers, services, finance,
                color-formulas, settings
  services/     Supabase client, local notifications
  shared/       UI components, hooks, types, Jalali/format helpers
  state/        Zustand auth and sync stores
  sync/         outbox repository (push/pull not implemented yet)
  tests/        Vitest setup and unit tests
supabase/       PostgreSQL schema, RLS policies, edge-function placeholder
audit/          read-only technical audit and handover
docs/           product brief, PRD, flows, architecture, roadmap
```

## Documentation

- New to the project: read [`audit/AGENT_HANDOVER.md`](audit/AGENT_HANDOVER.md) first.
- Current defects and debt: [`audit/BUGS_AND_TECHNICAL_DEBT.md`](audit/BUGS_AND_TECHNICAL_DEBT.md).
- Requirements and acceptance criteria: [`audit/REQUIREMENTS_MATRIX.md`](audit/REQUIREMENTS_MATRIX.md).
- Next work in dependency order: [`audit/DEVELOPMENT_BACKLOG.md`](audit/DEVELOPMENT_BACKLOG.md).
- Product source material: [`docs/README.md`](docs/README.md).

## Branches

- `develop` — active development branch.
- `main` — stable code baseline.
- `docs` — product documentation baseline.

Do not push or rewrite shared branches without explicit authorization. Keep database migrations
append-only: never edit an existing migration; add a new numbered file.
