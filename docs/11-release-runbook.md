# Release & Operations Runbook

Operational checklist for shipping and recovering the barber app. The app is
offline-first: SQLite on the device is the working copy, Supabase is the shared
source of truth for sync and restore.

## 1. Secrets and session storage

- Supabase URL/key come from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  only. No credential is committed or baked into source.
- Native session storage uses the platform secure store
  (`@aparajita/capacitor-secure-storage`: Android Keystore-backed
  EncryptedSharedPreferences / iOS Keychain).
- Browser `localStorage` is a **development/test-only** fallback (D-21).
- The SQLite database is encrypted on native platforms; the browser build is
  intentionally unencrypted and must not hold real customer data.
- Keystores (`*.keystore`, `*.jks`) and `keystore.properties` are gitignored.

## 2. Supabase migrations

`VITE_SUPABASE_ANON_KEY` must be the project's **publishable** key
(`sb_publishable_…`). `VITE_SUPABASE_URL` must be the project origin
(`https://<ref>.supabase.co`) — not the REST endpoint
(`https://<ref>.supabase.co/rest/v1/`), which breaks Auth and every sync call.
The app refuses to start with a `/rest/v1` URL. It is a client credential: it
can run the app and the RLS probes, but it cannot run DDL or migrations. Do not
put it in `SUPABASE_DB_URL`.

Apply `supabase/migrations/*.sql` in order using one of:

- **SQL editor:** open Dashboard → SQL Editor, paste `001`, run; repeat for
  `002` and `003`. Run the whole file in one session so the transaction and
  policies apply together.
- **CLI:** `npx supabase login` (or export `SUPABASE_ACCESS_TOKEN`), then
  `npx supabase link --project-ref <ref>` and `npx supabase db push`. The CLI
  asks for the database password once; it is not the anon/publishable key.
- **psql:** connect with the pooled connection string from Dashboard →
  Database → Connection string (`postgresql://postgres.<ref>:<password>@…`)
  and run each file with `psql "$SUPABASE_DB_URL" -f supabase/migrations/001_initial_schema.sql`.

Every migration is re-runnable:

- tables use `IF NOT EXISTS`, indexes use `IF NOT EXISTS`;
- triggers are recreated with `DROP TRIGGER IF EXISTS` / `CREATE OR REPLACE`;
- every policy is preceded by `DROP POLICY IF EXISTS` (or guarded by a
  `duplicate_object` handler);
- the private `customer-photos` bucket is inserted with
  `ON CONFLICT (id) DO NOTHING`.

Run the same three files a second time on the same project; a clean run with
no errors is the idempotency check. `src/tests/unit/supabase-migrations.test.ts`
enforces the patterns in CI.

## 3. RLS verification matrix

Policies are owner-only (`auth.uid() = user_id`) on every table, and the storage
policy matches the first path folder to `auth.uid()`.

| Object                     | User A sees     | User B sees | B updates/deletes A | B inserts owned by A |
| -------------------------- | --------------- | ----------- | ------------------- | -------------------- |
| `profiles`                 | own row only    | 0 rows      | denied              | denied               |
| `customers`                | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `services`                 | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `appointments`             | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `appointment_services`     | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `visits`                   | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `visit_services`           | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `payments`                 | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `expenses`                 | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `color_formulas`           | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `color_formula_items`      | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `customer_photos`          | own rows only   | 0 rows      | 0 rows affected     | `42501`              |
| `storage.objects` (bucket) | own folder only | 0 objects   | n/a                 | `42501`              |

Execute the automated two-user probe on a **separate Staging project**, never
on Production.

### 3.0 Staging project

1. Supabase Dashboard → **New project**: name it `barber-staging`, pick the
   region closest to you, generate a strong database password and store it in a
   password manager. The Free plan is enough; note that it pauses after a week
   of inactivity.
2. **Settings → General** → copy the **Reference ID** (the `<ref>` in
   `https://<ref>.supabase.co`). It is not a secret, but it must differ from the
   Production ref.
3. **Settings → API** → copy the **Project URL** and the **publishable key**
   (`sb_publishable_…`). Never copy the `sb_secret_…`/service-role key.
4. **Authentication → Providers → Email**: keep it enabled and keep
   confirmation ON to match Production.
5. **Authentication → URL Configuration**: Site URL `http://localhost:5173`,
   redirect URLs `http://localhost:5173/reset-password` and
   `barberapp://reset-password` (only needed if you also smoke-test the app
   against Staging).
6. Run `001`, `002`, `003` in the SQL Editor in that order (each filename in
   full, expect “Success. No rows returned”), then **run all three a second
   time** — this second run is the live idempotency proof and does not touch
   Production.
7. Verify with SQL: all 12 tables exist with `rowsecurity = true`, and
   `select id, public from storage.buckets where id = 'customer-photos'` returns
   `customer-photos | false`.
8. **Authentication → Users → Add user → Create new user** twice, ticking
   **Auto Confirm User** for both. Use Staging-only addresses (e.g. plus
   aliases), never the owner account.

Production and Staging are isolated automatically: separate databases, Auth
users, storage buckets, and API keys. The app continues to read `.env.local`
(Production); only the RLS runner reads `.env.rls.local`.

### 3.1 Staging credentials and the safety guard

Create `<repo>/.env.rls.local` (gitignored by `.env.*.local`). It **overrides**
the Production URL/key from `.env.local` for the runner only:

```bash
VITE_SUPABASE_URL=https://<staging-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_…
RLS_STAGING_PROJECT_REF=<staging-ref>
RLS_PRODUCTION_PROJECT_REF=<production-ref>
RLS_USER_A_EMAIL=a@example.com
RLS_USER_A_PASSWORD='…'
RLS_USER_B_EMAIL=b@example.com
RLS_USER_B_PASSWORD='…'
```

The runner merges `.env.local` → `.env.rls.local` → process environment. Do not
export `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` in the shell: process
environment wins over both files. `RLS_STAGING_PROJECT_REF` is mandatory; the
runner aborts before any request when the URL's ref differs from it, and hard
aborts when the ref equals `RLS_PRODUCTION_PROJECT_REF`. The guard line
`staging guard OK: project ref …` is the confirmation that the destructive
probes target Staging.

Never put Staging values in `.env.local` or Production values in
`.env.rls.local`.

### 3.2 Running the probe

The probe signs in through the public Auth API and checks PostgREST and Storage
exactly as the app does. For all 12 tables it seeds a marker-prefixed row,
verifies that user B cannot SELECT, UPDATE, or DELETE it, and additionally
probes forbidden inserts plus storage read/write denial:

```bash
npm run rls:check -- --preflight   # guard + key + schema + sign-ins, writes nothing
npm run rls:check -- --out supabase/tests/rls-verification.log
```

`--preflight` aborts with a clear hint when the target is not Staging, an
account is unconfirmed, both variables resolve to the same user, or the signup
trigger left a user without a `profiles` row. Only the second command writes
probe data.

Cleanup is part of the run and now verified: every probe ID is re-read after
deletion, the two storage paths are re-checked, and A's profile row must still
exist. Any remaining row or object is reported as `FAIL` and exits non-zero;
the log prints `cleanup verified: no probe rows remain in 11 tables` and
`storage cleanup verified: no probe objects remain`.

The runner refuses to print secrets and aborts with a clear message when the
key is malformed, the schema is missing, or an account is not confirmed. The
saved log contains the two test emails and shortened user IDs — redact them
before committing it. Commit the log only after checking it contains no
credentials.

**psql alternative (needs `SUPABASE_DB_URL` with the database password):**

```bash
psql "$SUPABASE_DB_URL" \
  -v email_a=a@example.com -v email_b=b@example.com \
  -f supabase/tests/rls_two_user_check.sql
```

It seeds one row per table per user inside a transaction, checks both
directions, prints `RLS verification passed`, then rolls back.

> **Status: Production is not a test target.** Production has `001`–`003`
> applied and verified read-only (`profiles`, `customers`, `expenses`,
> `customer_photos` return `200 []` for anon), and **no probe has been run
> there**. The two-user probe will be executed only against the Staging project
> described in §3.0, after the staging guard prints
> `staging guard OK: project ref …` and the operator confirms the target.
> Production migrations must not be re-run as part of this check.

### 3.3 Password-reset deep links

Native builds return the recovery email to `barberapp://reset-password`
(`NATIVE_RECOVERY_URL` in `src/features/auth/recovery-link.ts`). The browser
build keeps `${origin}/reset-password`.

1. **Patch the generated native projects.** `npm run native:deep-links` (also
   part of `npm run cap:build`) inserts, idempotently:

   - Android `AndroidManifest.xml`: a `VIEW`/`BROWSABLE` intent-filter on
     `MainActivity` for `scheme=barberapp`, `host=reset-password`;
   - iOS `Info.plist`: `CFBundleURLTypes` → `CFBundleURLSchemes` =
     `barberapp`.

   `android/` and `ios/` are gitignored, so re-run the script after
   `npx cap add` or `npx cap sync`. The script refuses to clobber an existing
   `CFBundleURLTypes` block and prints a manual-merge instruction instead.

2. **Allow-list the redirects in Supabase.** Dashboard → Authentication → URL
   Configuration:

   - **Site URL:** production web origin (e.g. `https://app.example.com`).
   - **Redirect URLs:** add each exact value:
     - `barberapp://reset-password`
     - `https://app.example.com/reset-password`
     - `http://localhost:5173/reset-password` (local dev only)

   Supabase silently falls back to Site URL for redirects that are not
   allow-listed, so a missing entry looks like "the link opens the website"
   rather than an error. Keep the default recovery email template
   (`{{ .ConfirmationURL }}`); do not hardcode a URL in the template.

3. **Handler behaviour.** `@capacitor/app` listens for `appUrlOpen` and reads
   `getLaunchUrl()` for cold starts. The parser accepts implicit tokens
   (`#access_token=…&refresh_token=…&type=recovery`) and PKCE (`?code=…`),
   rejects non-recovery links, then `setSession`/`exchangeCodeForSession`
   creates a temporary session. `ResetPasswordPage` listens for
   `barber:recovery-link` and verifies again if it was already open.

4. **Manual smoke test (required before release).** On a clean install:
   request a reset from the sign-in screen → open the email on the device →
   the app (not the browser) opens on «بازیابی رمز» → set a new password →
   sign in with it. Also test with the app already open (warm start) and
   terminated (cold start).

## 4. Supply chain

- CI (`.github/workflows/ci.yml`) runs type-check, lint, format check, tests,
  a production-dependency audit and a production build on every push/PR.
- Dependabot (`.github/dependabot.yml`) groups npm and GitHub Actions updates
  weekly. Capacitor majors and zod 4 are deliberately ignored until their
  migration is scheduled.
- `npm audit --omit=dev --audit-level=critical` gates CI. Known accepted
  exception:
  - `zod < 4.6.6` — memory exhaustion on oversized constrained collections.
    Fix requires the breaking zod 4 migration; the app validates bounded form
    input locally, so risk is low. Track the upgrade; do not force it in a
    release branch.
- Dev-only advisories are not shipped in the app bundle and are allowed to age
  out through Dependabot. Current `npm audit` status:
  - production (`--omit=dev`): only the accepted `zod` high above; no critical.
  - dev: `tinypool` critical and `typescript-eslint`/`vitest` moderates. The
    tinypool fix requires vitest 5 (major) and the eslint fix requires
    typescript-eslint 8.36 (breaking for the flat config); schedule both
    deliberately rather than forcing them in a release branch.
- Never commit `.env`, keystores, `google-services.json`, or generated
  `android/`/`ios/` secrets.
- CI actions are pinned to full commit SHAs with a version comment
  (`actions/checkout` v4.3.0, `actions/setup-node` v4.4.0). Keep them pinned;
  Dependabot's `github-actions` ecosystem updates the SHA and comment.
- Repository security settings (host-side, require admin access — cannot be
  changed from a workflow). Verify each in GitHub → Settings:
  - **Code security and analysis:** Secret scanning **on**, Push protection
    **on**, Dependabot alerts **on**, Dependabot security updates **on**.
    The repository is public, so GitHub enables secret scanning by default;
    confirm push protection is not disabled by an organization policy.
  - **Branches:** protect `main` and `develop` — require a pull request, require
    the `Quality gates` check, disallow force pushes and direct deletion.
  - **Actions → General:** workflow permissions default to _Read repository
    contents_ (the workflow also declares `permissions: contents: read`), and
    allow only GitHub-authored actions.

## 5. Backup and restore

There is no file-export feature in v1. Recovery paths:

1. **Cloud restore (primary).** Settings → «بازیابی کامل از ابر». This runs a
   sync with `fullPull: true`: every cloud row is re-read and merged, local rows
   are never deleted, and unsent local changes win conflicts.
2. **Normal sync.** «همگام‌سازی اکنون» pushes the outbox first, then pulls.
   Use it after reconnecting; it is safe to repeat.
3. **Reinstall / new device.** Sign in with the same account, finish bootstrap,
   then run the full restore once. Photos are re-downloaded from the
   `customer-photos` bucket on demand.
4. **Corrupted local cache.** Signing out does not delete local data. If the
   SQLite file is corrupted, reinstall the app (native) or clear site data
   (browser), then restore from cloud. Unsent outbox rows on that device are
   lost only if they were never pushed — check sync status first.
5. **Browser caveat.** Browser storage is test-only, unencrypted, and may be
   evicted by the browser. Never treat it as a backup.
6. **Supabase backup.** Use the project's database backups (dashboard →
   Database → Backups) for account-level recovery; storage objects need the
   Storage backup/export path.

## 6. Android release

The `android/` folder is generated and gitignored. After `npx cap add android`
and `npm run cap:build`:

1. Generate a keystore once (keep it outside the repo and back it up):

   ```bash
   keytool -genkeypair -v -keystore ~/keys/barber-release.jks \
     -alias barber -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Create `android/keystore.properties` (gitignored):

   ```properties
   storeFile=/absolute/path/to/barber-release.jks
   storePassword=***
   keyAlias=barber
   keyPassword=***
   ```

3. Patch the generated Gradle project:

   ```bash
   npm run android:release-config -- --signing \
     --version-name 1.1.0 --version-code 2
   ```

   The script inserts an idempotent `// release-signing:begin … end` block that
   reads `keystore.properties` and assigns the release signing config. Without
   the properties file the release build stays unsigned with a warning.

4. Build:

   ```bash
   cd android && ./gradlew bundleRelease   # AAB for Play Store
   # or: ./gradlew assembleRelease         # APK for direct install
   ```

5. `versionCode` must increase on every uploaded build; `versionName` is the
   user-visible version shown in Settings.

## 7. iOS release

The `ios/` project is generated but building/signing requires macOS + Xcode.
Run `npm run cap:build`, open with `npx cap open ios`, set the team/bundle id,
bump the version in Xcode, and archive. Android signing does not apply.

## 8. Known limitations before release

- RLS script above must be executed against a real project (Section 3).
- Password-reset deep links are covered by unit tests only; the warm-start and
  cold-start device flow in Section 3.3 has not been run on hardware here.
- No automated end-to-end run on a physical device in this environment.
- The Android release build was not executed here: the local SDK has platforms
  34/36 but not `compileSdkVersion 35`, and no keystore exists yet. Install SDK
  35 (Android Studio → SDK Manager) and generate the keystore before building.
- iOS still requires macOS + Xcode.
- Global search uses `LIKE`; measure on a mid-range Android device with ~5,000
  rows and add FTS only if needed (T15 note).
- `npm test` already runs in single-run mode; use `npm test`, not
  `npm test -- --run`.
