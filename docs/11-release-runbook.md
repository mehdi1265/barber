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

Run `supabase/migrations/*.sql` in order in the SQL editor (or `supabase db
push`). Every migration is re-runnable:

- tables use `IF NOT EXISTS`, indexes use `IF NOT EXISTS`;
- triggers are recreated with `DROP TRIGGER IF EXISTS` / `CREATE OR REPLACE`;
- every policy is preceded by `DROP POLICY IF EXISTS` (or guarded by a
  `duplicate_object` handler);
- the private `customer-photos` bucket is inserted with
  `ON CONFLICT (id) DO NOTHING`.

`src/tests/unit/supabase-migrations.test.ts` enforces these patterns in CI.

## 3. RLS verification matrix

Policies are owner-only (`auth.uid() = user_id`) on every table, and the storage
policy matches the first path folder to `auth.uid()`.

| Object                     | User A sees      | User B sees | B updates/deletes A | B inserts owned by A |
| -------------------------- | ---------------- | ----------- | ------------------- | -------------------- |
| `profiles`                 | own row only     | 0 rows      | denied              | denied               |
| `customers`                | own rows only    | 0 rows      | 0 rows affected     | `42501`              |
| `services`                 | own rows only    | 0 rows      | 0 rows affected     | `42501`              |
| `appointments`             | own rows only    | 0 rows      | 0 rows affected     | `42501`              |
| `appointment_services`     | own rows only    | 0 rows      | 0 rows affected     | `42501`              |
| `visits`                   | own rows only    | 0 rows      | 0 rows affected     | `42501`              |
| `visit_services`           | own rows only    | 0 rows      | 0 rows affected     | `42501`              |
| `payments`                 | own rows only    | 0 rows      | 0 rows affected     | `42501`              |
| `expenses`                 | own rows only    | 0 rows      | 0 rows affected     | `42501`              |
| `color_formulas`           | own rows only    | 0 rows      | 0 rows affected     | `42501`              |
| `color_formula_items`      | own rows only    | 0 rows      | 0 rows affected     | `42501`              |
| `customer_photos`          | own rows only    | 0 rows      | 0 rows affected     | `42501`              |
| `storage.objects` (bucket) | own folder only  | 0 objects   | n/a                 | `42501`              |

Execute the automated probe after creating two real accounts:

```bash
psql "$SUPABASE_DB_URL" \
  -v email_a=a@example.com -v email_b=b@example.com \
  -f supabase/tests/rls_two_user_check.sql
```

The script seeds one row per table per user inside a transaction, checks both
directions, prints `RLS verification passed`, then rolls back.

> **Status: not executed yet.** No live Supabase project was available in the
> development environment. Run this once against the release project and paste
> the output into the release ticket before publishing.

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
- Dev-only advisories (vitest/tinypool/tar via `@capacitor/cli`) are not
  shipped in the app bundle and are allowed to age out through Dependabot.
- Never commit `.env`, keystores, `google-services.json`, or generated
  `android/`/`ios/` secrets.
- CI actions are pinned to major tags (`@v4`) and kept current by Dependabot.
  Switch to full commit SHAs before making the repository public.
- Enable GitHub **secret scanning** and **push protection** in repository
  settings; both are host-side features and cannot be configured from the
  workflow file.

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
- No automated end-to-end run on a physical device in this environment.
- Global search uses `LIKE`; measure on a mid-range Android device with ~5,000
  rows and add FTS only if needed (T15 note).
- `npm test` already runs in single-run mode; use `npm test`, not
  `npm test -- --run`.
