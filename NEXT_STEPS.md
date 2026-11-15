# NEXT_STEPS — توقف ایمن و ادامه کار (2026-11-14)

> این گزارش پس از پاس شانزدهم «تأیید مهاجرت SQLCipher و اجرا روی دستگاه» به‌روزرسانی شده است (بخش ۱۳).
> هیچ commit، push، merge، migration روی Supabase Hosted، deploy، آپلود AAB، یا تغییر تنظیمات Production انجام نشده است.

---

## 1. وضعیت فعلی پروژه

| مورد | مقدار |
|---|---|
| مسیر پروژه | `C:\Users\madi\barber` |
| Branch | `develop` |
| HEAD | `28da1dd` — `docs(release): record anonymous-session RLS proof` |
| Commit جدید در این پاس | **هیچ** |
| فایل‌های modified | **64** |
| فایل‌های untracked | **20** |
| فایل‌های staged | **0** |
| وضعیت push/merge | انجام نشده؛ branch با remote هم‌گام نشده است |
| فایل‌های حساس | `.env.local` و `.env.rls.local` موجود و gitignored؛ در هیچ commit/گزارشی قرار نگرفته‌اند |

همه تغییرات روی دیسک و در working tree حفظ شده‌اند. هیچ `reset`، `clean`، `checkout`، `stash` یا حذف/جابه‌جایی فایلی اجرا نشد.

---

## 2. کارهای انجام‌شده تا امروز

1. **Quality gates و زیرساخت اولیه (T01–T02):** رفع blank screen ناشی از mismatch نسخه `sql.js`، timeout راه‌اندازی، پیام خطای فارسی، پروژه‌های `android/` و `ios/` تولید و sync شدند.
2. **داده و تراکنش (T03):** `withTransaction`، outbox hardening، یک ردیف outbox برای هر ردیف فرزند، tombstone هزینه، تست روی SQLite واقعی.
3. **زمان محلی و شمسی (T04):** `shared/utils/datetime.ts`، ورودی تاریخ شمسی.
4. **احراز هویت (T05):** ورود/ثبت‌نام، نشست امن روی Keychain/Keystore، OTP-first برای بازیابی رمز + fallback لینک.
5. **قابلیت‌ها (T06–T15):** نوبت‌ها، مالی/پرداخت/هزینه/گزارش/فروش سریع، داشبورد، push/pull همگام‌سازی، دفترچه رنگ، عکس مشتری، یادآوری محلی، تنظیمات/پروفایل/تاریخچه، جست‌وجوی سراسری.
6. **امنیت و انتشار (T16):** ErrorBoundary، logger محلی، Dependabot و audit در CI، اسکریپت انتشار اندروید، deep link، سخت‌سازی backup (`allowBackup="false"` + قواعد استخراج)، migration 004 برای مالکیت ترکیبی، تست دوکاربره RLS.
7. **پاس‌های verify (پاس ۷–۸):** wipe داده محلی با گارد outbox، fencing همگام‌سازی به حساب آغازکننده، جلوگیری از انتقال مالکیت در id collision، حفظ cursor در pull ناتمام، عدم push پروفایل placeholder.
8. **پاس نهم (2026-11-13):** ارتقا `zod` به 4.6.7 (D-45)، طراحی D-46/TD-21، ثبت TD-22، به‌روزرسانی اسناد.
9. **پاس دهم (امروز، 2026-11-14):**
   - **حذف آسیب‌پذیری Vitest و Tinypool:** ارتقا به `vitest` 5.1.0 و `@vitest/coverage-v8` 5.1.0. هر دو advisory بحرانی dev-only (`GHSA-5gmw-xhrv-c9v3`، `GHSA-85c8-ppgw-ccpr`) و advisoryهای vitest mocker بسته شدند. سه اصلاح سازگاری لازم بود: mockهای سازنده‌پذیر با `function`، جایگزینی `it.each` با حلقه، و `"node"` در `tsconfig.app.json` + `@testing-library/jest-dom/vitest`.
   - **پیاده‌سازی Deletion Reconciliation (T17 / D-46):**
     - `supabase/migrations/005_sync_tombstones.sql` — افزودن `deleted_at` و ایندکس `idx_<table>_user_deleted` به هفت جدول `services`، `appointment_services`، `visits`، `visit_services`، `payments`، `color_formulas`، `color_formula_items`.
     - `SOFT_DELETE_TABLES` اکنون همه ۱۱ جدول داده‌ای را پوشش می‌دهد؛ هر delete به upsert tombstone با `updated_at` جلو‌رونده تبدیل می‌شود.
     - pull دو مرحله‌ای: merge/read والد→فرزند، سپس حذف فیزیکی فرزند→والد در یک تراکنش؛ محافظت از عملیات در صف و ردیف جدیدتر؛ گارد ضد resurrection برای نسخه قدیمی سرور؛ صفحه‌بندی keyset روی `(updated_at, id)`؛ پاک‌سازی فایل عکس پس از commit.
   - **تست‌های واقعی SQLite/Sync:** فایل جدید `src/tests/unit/sync.reconcile.test.ts` با ۷ سناریو (حذف هر هفت جدول، ترتیب فرزند→والد، حفاظت outbox، ردیف جدیدتر، ضد resurrection، keyset، tombstone push). تست‌های pull/push/payload و migration هم به‌روزرسانی شدند.
   - به‌روزرسانی `docs/10-decisions-log.md` (D-46)، `docs/11-release-runbook.md` (§4، §8، §9)، `audit/PROJECT_STATUS.md`، `audit/REQUIREMENTS_MATRIX.md`، `audit/BUGS_AND_TECHNICAL_DEBT.md` (TD-21)، `audit/DEVELOPMENT_BACKLOG.md` (T17)، `audit/AGENT_HANDOVER.md`.

---

## 3. فایل‌های ایجادشده و ویرایش‌شده

### 3.1 فایل‌های جدید (untracked)

```
NEXT_STEPS.md
src/database/migrations/005_outbox_user_scope.sql
src/database/migrations/006_sync_cursor_user.sql
src/features/settings/local-data.ts
src/tests/unit/account-isolation.integration.test.ts
src/tests/unit/appointments.schemas.test.ts
src/tests/unit/local-data-wipe.test.ts
src/tests/unit/settings-local-data.test.tsx
src/tests/unit/sqlite-migrations.test.ts
src/tests/unit/sync.reconcile.test.ts
supabase/migrations/004_same_user_ownership.sql
supabase/migrations/005_sync_tombstones.sql
supabase/tests/legacy_ownership_mismatches.sql
```

### 3.2 فایل‌های ویرایش‌شده (modified)

**پیکربندی/CI/اسکریپت‌ها**

```
.github/dependabot.yml
.github/workflows/ci.yml
package.json
package-lock.json
tsconfig.app.json
scripts/android-release-utils.ts
scripts/android-release.ts
```

**داده و همگام‌سازی (این پاس)**

```
src/sync/engine/payload.ts
src/sync/engine/pull.ts
src/sync/engine/supabase-sync-client.ts
src/sync/engine/sync.types.ts
```

**داده و همگام‌سازی (پاس‌های قبل، دست‌نخورده)**

```
src/database/repositories/*.ts            (appointment, base, color-formula, customer-photo,
                                           customer, expense, profile, service, visit)
src/database/sqlite/migrations.ts
src/sync/engine/push.ts
src/sync/engine/sync.manager.ts
src/sync/outbox/outbox.repository.ts
```

**ویژگی‌ها (features)**

```
src/features/appointments/appointments.schemas.ts
src/features/auth/ForgotPasswordPage.tsx
src/features/auth/ResetPasswordPage.tsx
src/features/auth/auth.schemas.ts
src/features/auth/auth.usecases.ts
src/features/auth/recovery-link.ts
src/features/color-formulas/color-formulas.schemas.ts
src/features/customers/CustomerForm.tsx
src/features/finance/finance.schemas.ts
src/features/photos/photo-storage.ts
src/features/settings/ProfileSettings.tsx
src/features/settings/SettingsPage.tsx
src/shared/components/layout/AppShell.tsx
src/shared/types/index.ts
```

**تست‌ها**

```
src/tests/setup.ts
src/tests/helpers/sqlite-harness.ts
src/tests/unit/android-release.test.ts
src/tests/unit/auth.schemas.test.ts
src/tests/unit/auth.usecases.test.ts
src/tests/unit/color-formulas.schemas.test.ts
src/tests/unit/finance.schemas.test.ts
src/tests/unit/outbox.integration.test.ts
src/tests/unit/profile.repository.test.ts
src/tests/unit/reset-password-page.test.tsx
src/tests/unit/supabase-migrations.test.ts
src/tests/unit/sync.payload.test.ts
src/tests/unit/sync.pull.test.ts
src/tests/unit/sync.push.test.ts
supabase/tests/rls_two_user_check.sql
```

**اسناد**

```
docs/10-decisions-log.md
docs/11-release-runbook.md
audit/AGENT_HANDOVER.md
audit/BUGS_AND_TECHNICAL_DEBT.md
audit/DEVELOPMENT_BACKLOG.md
audit/PROJECT_STATUS.md
audit/REQUIREMENTS_MATRIX.md
```

> `NEXT_STEPS.md` (همین فایل) نیز فایل جدید در ریشه است و untracked محسوب می‌شود.

---

## 4. وضعیت تست‌ها، Type-check، Lint و Build

| بررسی | نتیجه | زمان/توضیح |
|---|---|---|
| `npm run type-check` | ✅ موفق | پس از آخرین تغییرات sync/test |
| `npm run lint` | ✅ موفق | همان working tree |
| `npm run format:check` | ✅ موفق | فقط `src/**/*.{ts,tsx,css}` را پوشش می‌دهد؛ Markdown چک نمی‌شود |
| `npx vitest run` | ✅ **363/363 در 51 فایل** | یک اجرای کامل و سبز (≈63 ثانیه) پس از آخرین تغییر کد |
| `npm run build` | ✅ موفق | پس از آخرین تغییر کد؛ ≈2.6 ثانیه |
| `npm audit --omit=dev` | ✅ **0 vulnerabilities** | gate تولیدی سبز |
| `npm audit` (کامل) | ⚠️ 7 dev-only moderate | فقط زنجیره `typescript-eslint → minimatch` (`GHSA-g3hv-75wg-m249`)؛ نسخه اصلاح‌شده upstream موجود نیست |
| CI برای این revision | ❌ اجرا نشده | هیچ push انجام نشده؛ آخرین CI سبز مربوط به commit قبلی است |
| Migration 005 روی Hosted | ❌ اجرا نشده | فقط در CI/محیط محلی قابل اجراست؛ طبق محدودیت این پاس انجام نشد |
| تست دو دستگاه واقعی | ❌ انجام نشده | نه شبیه‌ساز، نه دستگاه، نه پروژه Hosted |
| تست PostgreSQL/RLS | ❌ هرگز اجرا نشده | نه CI برای این revision، نه PostgreSQL محلی |
| Android build | ❌ شکست خورد | دلیل: Google Maven (بخش ۵) |
| Device test | ❌ انجام نشده | هیچ دستگاه/AVD متصل نیست |

**تفکیک صریح:** «موفق» در جدول بالا یعنی همان دستور در همین working tree اجرا و سبز شده است. CI، RLS runtime، PostgREST زنده، Android build و تست دو دستگاه **اجرا نشده‌اند** و نباید سبز تلقی شوند.

**پاس یازدهم (اعتبارسنجی عملیاتی T17) — BLOCKED:** مقدمات ایستا کامل شد (Migration 005 فقط `ADD COLUMN IF NOT EXISTS` و `CREATE INDEX IF NOT EXISTS` دارد، هر هفت جدول و ایندکس پوشش داده شده‌اند، RLS همه جداول `auth.uid() = user_id` است و trigger سرور `updated_at` را در UPDATE جلو می‌برد، و CI همه `supabase/migrations/*.sql` را دو بار اعمال می‌کند). اما اجرای Migration روی Test و ۱۰ سناریوی دو دستگاه **انجام نشد**، چون:

- `SUPABASE_ACCESS_TOKEN`، `SUPABASE_DB_PASSWORD` و `RLS_STAGING_PROJECT_REF` تنظیم نیستند.
- `docker`، `psql`، Supabase CLI و ماژول `pg` نصب نیستند؛ بنابراین PostgreSQL محلی هم ممکن نیست.
- پروژه موجود در `.env.local` (`quxkwzxsibquqiqoswna`) به‌عنوان Test/Staging تأیید نشده و بدون گارد `RLS_STAGING_PROJECT_REF` هیچ اتصالی به آن انجام نشد.
- هیچ Migration، sync یا تغییری روی هیچ دیتابیس Hosted اجرا نشد.

پیش‌نیاز پاس بعد: یک پروژه Supabase Test/Staging مستقل + `SUPABASE_ACCESS_TOKEN` یا `SUPABASE_DB_PASSWORD` + `RLS_STAGING_PROJECT_REF` منطبق + دو حساب آزمایشی. سپس `001–005` (دو بار) و اسکریپت دو دستگاه اجرا شود.

---

## 5. مشکلات و خطاهای حل‌نشده

1. **Google Maven در دسترس نیست (بلوکه‌کننده build اندروید).** `dl.google.com/dl/android/maven2` برای همه نسخه‌های AGP (از جمله 8.11.1 و 8.2.1) و androidx پاسخ **404** می‌دهد، در حالی که Maven Central و `services.gradle.org` پاسخ می‌دهند. `./gradlew :app:assembleDebug --offline` به همین دلیل در resolve کردن `com.android.tools.build:gradle:8.11.1` و `com.google.gms:google-services:4.4.2` شکست می‌خورد. **هیچ mirror جایگزین یا bypass گواهی استفاده نشده است.**
2. **RLS فقط ایستا بررسی شده است.** سیاست‌ها، migration 004 و SQL دوکاربره خوانده شده‌اند، اما روی PostgreSQL واقعی اجرا نشده‌اند. کلیدهای ترکیبی 004 هنوز `NOT VALID` هستند.
3. **Reconciliation حذف (T17) در کد کامل است اما شاهد عملیاتی ندارد.** migration 005 روی هیچ پروژه Hosted اعمال نشده و تست دو دستگاه (حذف در A → همگام‌سازی → مشاهده حذف در B) انجام نشده است. فیلتر keyset فقط با fake client تست شده، نه PostgREST زنده. حذف‌های سخت تاریخیِ قبل از tombstone قابل بازسازی مطمئن نیستند.
4. **7 آسیب‌پذیری moderate dev-only در `typescript-eslint → minimatch`** باقی مانده‌اند. هیچ نسخه اصلاح‌شده upstream وجود ندارد؛ downgrade یا override اجباری امن نیست. در بسته اپ حاضر نیستند و `npm audit --omit=dev` صفر است.
5. **SQLCipher و 16 KB (TD-22):** `@capacitor-community/sqlite` 7.0.0 از `android-database-sqlcipher:4.5.3` استفاده می‌کند که برای صفحات 16 KB آماده نیست. نسخه 7.0.3 به `sqlcipher-android:4.10.0` مهاجرت می‌کند، اما بدون build و دستگاه قابل تأیید نیست.
6. **Deep link با scheme سفارشی** (`barberapp://reset-password`) قابل hijack است؛ مسیر عمومی باید OTP یا HTTPS App Link تأییدشده باشد.
7. **Manifest ادغام‌شده تأیید نشده است**، چون هیچ build موفقی وجود ندارد؛ `allowBackup="false"` فعلی فقط در manifest دست‌نویس/اسکریپت تأیید شده است.

---

## 6. کارهای باقی‌مانده و ریسک‌های مهم

| اولویت | کار | مرجع |
|---|---|---|
| P0 | اجرای `rls-postgres` در CI (نیازمند push مجاز) و سپس پروب Hosted روی پروژه تست | D-42، R-07 |
| P0 | build موفق روی ماشین با دسترسی Google Maven + تست device | runbook §6 |
| P1 | اعتبارسنجی عملیاتی T17 روی پروژه Test مستقل (BLOCKED: اعتبارنامه و project ref تأییدشده موجود نیست) | D-46، TD-21 |
| P1 | ارتقای plugin SQLite به 7.0.3 و تأیید 16 KB روی دستگاه/`check_elf_alignment` | TD-22 |
| P1 | تعیین استراتژی commit و ثبت تاریخی سالم برای 73 فایل فعلی | بخش ۱۰ |
| P2 | بررسی دوره‌ای `typescript-eslint → minimatch`؛ اقدام فقط وقتی اصلاح upstream منتشر شد | D-39 |
| P2 | تعیین `applicationId` نهایی، versionCode، keystore مالک پروژه و Play App Signing | runbook §6.2/§6.4 |

**ریسک اصلی:** تمام کار چند پاس اخیر فقط روی دیسک است؛ خرابی دیسک یا `git clean` می‌تواند آن را از بین ببرد. تا commit نشود، هیچ نسخه بازگردانی‌پذیر Git وجود ندارد.

---

## 7. موارد تأییدنشده (نباید سبز فرض شوند)

- **Reconciliation حذف:** فقط تست واحد/SQLite واقعی محلی؛ migration روی Hosted اجرا نشده و سناریوی دو دستگاه اجرا نشده است.
- **PostgREST زنده:** فیلتر `.or('updated_at.gt....')` و رفتار keyset روی سرور واقعی آزموده نشده است.
- **RLS runtime:** نه PostgreSQL محلی، نه CI برای این revision، نه پروژه Hosted.
- **PostgREST/Storage API:** هیچ درخواست واقعی به Hosted ارسال نشده است.
- **Android device tests:** نصب، اجرا، حساب‌سوییچ، آفلاین/آنلاین، یادآوری‌ها، دوربین/عکس.
- **SQLCipher:** باز شدن دیتابیس رمزگذاری‌شده روی دستگاه واقعی و سازگاری 16 KB.
- **API 36 behavior:** edge-to-edge و predictive back.
- **Password recovery:** تحویل واقعی ایمیل/OTP و deep link در warm/cold start.
- **Manifest ادغام‌شده و backup:** پس از یک build موفق.
- **iOS:** نیازمند macOS + Xcode؛ هیچ اجرایی نداشته.
- **CI این revision:** اجرا نشده است.

---

## 8. اولین وظیفه بعدی

**بازبینی تغییرات و ثبت آن‌ها در Git به‌صورت commitهای منطقی (با تأیید صریح مالک پروژه).** دلیل: 73 فایل تغییر یافته/جدید وجود دارد که در ده پاس مختلف ساخته شده‌اند و هیچ‌کدام در Git ثبت نشده‌اند؛ شروع کار جدید پیش از این کار، ریسک گم‌شدن یا قاطی‌شدن تغییرات را بالا می‌برد.

ترتیب پیشنهادی commitها (هر کدام جدا، بدون `git add .`):

1. `chore(deps)`: Vitest 5 + تغییرات سازگاری تست (`package.json`, `package-lock.json`, `tsconfig.app.json`, `src/tests/setup.ts`)
2. `feat(sync)`: Tombstone push/pull، keyset، migration 005 (`src/sync/engine/*`, `supabase/migrations/005_sync_tombstones.sql`)
3. `test(sync)`: `sync.reconcile.test.ts` و به‌روزرسانی pull/push/payload/migrations
4. `feat(db/sync)` پاس‌های قبل: migrationهای 005/006 محلی، مالکیت ترکیبی 004، fencing حساب، pull ownership، wipe محلی
5. `feat(auth)`: OTP و deep link
6. `test/docs`: اسناد و گزارش‌ها (`docs/*`, `audit/*`, `NEXT_STEPS.md`, `.github/dependabot.yml`)

پس از commit، با مجوز جداگانه: `git push origin develop` تا CI این revision (شامل `rls-postgres` و اعمال migrationهای 001–005) اجرا شود.

---

## 9. دستورهای ادامه کار از همین نقطه

پیش‌نیازها: Node 24، JDK 21 (Android Studio JBR `21.0.9`)، Android SDK platform 36 + build-tools 36.1.0، دسترسی شبکه به Google Maven برای build اندروید.

```bash
# 1) بررسی وضعیت (بدون تغییر)
git status --short
git diff --stat

# 2) گیت‌های محلی
npm run type-check
npm run lint
npm run format:check
npx vitest run
npm run build
npm audit --omit=dev

# 3) Android (فقط روی ماشین/شبکه با دسترسی Google Maven)
npm run cap:build
npm run android:release-config -- --sdk 36
cd android && ./gradlew :app:assembleDebug

# 4) RLS — پروژه تست، هرگز Production
#    نیازمند RLS_STAGING_PROJECT_REF منطبق؛ runner هر ref دیگر را رد می‌کند
npm run rls:check -- --out supabase/tests/rls-verification.log

# 5) اعتبارسنجی T17 روی Test/Staging (فعلاً BLOCKED)
#    پیش‌نیاز: پروژه Test مستقل + SUPABASE_ACCESS_TOKEN یا SUPABASE_DB_PASSWORD
#    + RLS_STAGING_PROJECT_REF منطبق. این دستورها روی Production اجرا نشوند.
npx supabase link --project-ref "$RLS_STAGING_PROJECT_REF"
npx supabase db push        # اعمال 001–005 روی Staging
npx supabase db push        # اجرای دوباره: باید no-op باشد (idempotency)
```

برای اجرای محلی مجموعه PostgreSQL (job `rls-postgres`) به Docker/WSL2 نیاز است؛ نصب آن **بدون مجوز جداگانه انجام نشود**. راه سریع‌تر: push مجاز و مشاهده‌ی CI.

---

## 10. وضعیت Git و تصمیم درباره Commit

- **Commit گرفته نشد.** دلیل: 60 فایل modified و 13 فایل untracked مربوط به چند پاس مستقل، چند حوزه (auth، sync، DB، Android، docs) و چند تصمیم طراحی هستند؛ یک commit واحد تاریخچه را غیرقابل بازبینی می‌کند و قوانین این پاس می‌گوید در صورت تردید درباره حتی یک فایل commit گرفته نشود. تفکیک commitها نیازمند بازبینی محتوای هر گروه است.
- **هیچ چیزی staged نیست** و working tree دقیقاً همان است که در این گزارش آمده است.
- بررسی امنیتی انجام شد: `.env.local` و `.env.rls.local` gitignored هستند؛ الگوهای کلید/token/private-key در diff و فایل‌های untracked یافت نشد (تنها matchها fixtureهای تست مثل `pass123`/`secret123` بودند).
- هشدار: از `git reset --hard`، `git clean -fd`، `git checkout .` و `git stash` استفاده نکنید؛ این تغییرات تنها نسخه موجود هستند.
- `android/` و keystore دیباگ خارج از مخزن و gitignored هستند؛ هیچ keystore یا `keystore.properties` در repo نیست.

---

## 11. پاس چهاردهم — آماده‌سازی Release Candidate (2026-11-14)

- **اصلاح واقعی:** `vite.config.ts` دیگر در build پیش‌فرض source map تولید نمی‌کند
  (`sourcemap: process.env.SOURCE_MAPS === 'true'`). نتیجه بازسازی: ۰ فایل `.map` و کاهش `dist/`
  از ۸.۰MB به ۲.۲MB. رکورد در `audit/BUGS_AND_TECHNICAL_DEBT.md` به‌عنوان BUG-39.
- **اسناد جدید:** `docs/13-release-owner-approval.md` (فرم خالی تأیید مالک)،
  `docs/14-release-artifacts.md` (چک‌لیست، Release Notes، Migration/Backup/Rollback/Deploy/Monitoring)،
  `docs/15-operational-test-plan.md` (Auth/RLS/Sync/Storage — همه NOT RUN)،
  `supabase/tests/verify_release_schema.sql` (بررسی فقط‌خواندنی Schema).
- **Migrationها:** ۰۰۱–۰۰۵ دوباره بازبینی شدند؛ همه افزودنی و تکرارپذیرند. ۰۰۴ پنج unique و
  ۱۳ FK ترکیبی `NOT VALID` دارد. هیچ Migration روی Hosted اجرا نشد.
- **گیت‌های محلی:** type-check/lint/format/vitest/build/audit طبق گزارش نهایی همین پاس.
- **هنوز NOT RUN:** Migration روی Staging، RLS واقعی، ۱۰ سناریوی دو دستگاه، Android build،
  device test، iOS، Backup drill.
- **مانع اصلی:** تکمیل و امضای `docs/13-release-owner-approval.md` و فراهم‌کردن Staging ref و
  اعتبارنامه‌ها. تا آن زمان وضعیت انتشار: RELEASE CANDIDATE READY, STAGING VERIFICATION PENDING.

---

## 12. پاس پانزدهم — رفع موانع Android Release (2026-11-14)

- **TD-22 حل شد (سطح کد/بسته‌بندی):** `@capacitor-community/sqlite` از 7.0.0 به **7.0.3** و
  `android-database-sqlcipher:4.5.3` به **`sqlcipher-android:4.10.0`** تغییر کرد.
  `llvm-readelf` نشان داد ۴.۵.۳ همه ABIها `p_align = 0x1000` و ۴.۱۰.۰ همه `0x4000` است.
  `zipalign -c -P 16` برای debug/release APK و APK تولیدشده از AAB پاس شد.
- **آرتیفکت‌ها:** `app-debug.apk` ۲۷.۴MB، `app-release-unsigned.apk` ۲۴.۴MB،
  `app-release.aab` **۱۳.۸MB** (بدون امضای انتشار؛ keystore وجود ندارد). هیچ `.map`/`.env`/keystore
  داخل بسته‌ها نیست؛ فقط کلید publishable سوپابیس.
- **Google Maven:** از این شبکه ۴۰۴ است (حتی `master-index.xml`). Build با JDK 21 و یک
  `--init-script` موقت خارج از repo از یک mirror خواندنی انجام شد؛ **قابل آپلود نیست** و باید از
  Google Maven رسمی بازسازی شود.
- **BUG-40:** Gradle خالی، فایل‌های web قدیمی `android/app/src/main/assets/public` را بسته‌بندی
  می‌کرد (۶۰ فایل `.map` و hash قدیمی). با `npx cap copy android` قبل از build رفع شد. از این پس
  همیشه `npm run cap:build` قبل از Gradle.
- **TD-24:** `UtilsEncryption.java` پلاگین Salt/IV ثابت با AES-GCM دارد؛ برای قابلیت پشتیبان‌گیری
  نباید از `exportToJson(..., true)` استفاده شود. طراحی امن در `docs/16-android-sqlcipher-migration.md`.
- **NOT RUN:** نصب روی دستگاه، لاگین/CRUD، ۱۶KB runtime، هشت سناریوی مهاجرت دیتابیس، iOS.
  هیچ دستگاه متصل نیست و همه پوشه‌های `system-images` خالی‌اند.
- **گیت‌ها:** type-check/lint/format/build سبز؛ ۳۸۳/۳۸۳ تست در ۵۲ فایل؛ audit production صفر؛
  ۷ advisory متوسط فقط dev.
- **Git:** HEAD همان `28da1dd`؛ هیچ commit/push/merge؛ ۶۴ modified و ۲۰ untracked و ۰ staged.

---

## 13. پاس شانزدهم — تأیید مهاجرت SQLCipher و اجرا روی دستگاه (2026-11-14)

**وضعیت نهایی این پاس: D — BLOCKED BY DEVICE / TOOLCHAIN / OFFICIAL REPOSITORY ACCESS.**

- **نقطه شروع:** `HEAD = 28da1dd`، ۶۴ modified + ۲۰ untracked + ۰ staged؛
  `@capacitor-community/sqlite` 7.0.3 (declared = installed). هیچ commit/push/merge/reset/clean
  انجام نشد و هیچ فایلی حذف یا بازگردانی نشد.
- **بازبینی استاتیک (انجام شد):**
  - `sha256` چهار `libsqlcipher.so` داخل APK release دقیقاً برابر AAR `sqlcipher-android-4.10.0`
    است (`bc8574…`, `a3d6e1…`, `efd779…`, `482f62…`) و با 4.5.3 (`c9bbfe…` و…) متفاوت است.
  - `p_align` بسته‌شده = `0x4000`؛ کلاس‌های dex فقط `net.zetetic.database.sqlcipher` (۵۵ ارجاع)،
    صفر `net/sqlcipher`.
  - intermediates پاس ۱۵: `sqlcipher-android:4.10.0`، room 2.6.1، sqlite 2.4.0،
    security-crypto 1.1.0-alpha06؛ هیچ `android-database-sqlcipher` وجود ندارد.
  - `UtilsSecret.java` و `GlobalSQLite.java` بین 7.0.0 و 7.0.3 یکسان؛ Secret با کلید `secret`
    فقط وقتی خالی است نوشته می‌شود؛ مسیر DB: `barber_appSQLite.db`.
  - `zipalign -c -P 16` روی هر سه APK پاس شد؛ hash آرتیفکت‌ها با پاس ۱۵ یکسان است.
- **S1–S8 مهاجرت: BLOCKED.** هیچ دیتابیس ساخته‌شده با 7.0.0 در مخزن/پوشه‌های کاربر نیست و هیچ
  دستگاهی متصل نیست؛ ساخت دیتابیس جدید به‌جای دیتابیس قدیمی ممنوع است، پس هیچ PASS/FAIL ثبت نشد.
- **۱۶KB runtime: BLOCKED.** `adb devices` خالی؛ `system.img` = ۰ (همه `system-images/**` فقط
  `.installer` هستند)؛ هیچ AVD نیست؛ `android-36/google_apis_ps16k` نصب نشده؛
  `dl.google.com/android/repository/*.xml` هم 404 می‌دهد. استنتاج از ELF انجام نشد.
- **build رسمی: BLOCKED.** Google Maven برای `master-index.xml`، AGP، AndroidX و
  `google-services` پاسخ 404 می‌دهد. در این پاس هیچ build جدید (حتی با آینه) اجرا نشد؛
  آرتیفکت‌های موجود verification-grade هستند و official اعلام نمی‌شوند.
- **امضا:** فقط بازبینی شد؛ `keystore.properties` و `*.jks` وجود ندارد و ساخته نشد؛ هیچ رمزی چاپ نشد.
- **Supabase:** هیچ عملیات remote انجام نشد؛ `RLS_STAGING_PROJECT_REF`/توکن‌ها تنظیم نیستند، فرم
  `docs/13` امضا نشده و `.env.local` به‌عنوان staging فرض نشد.
- **گیت‌ها:** type-check/lint/format/build سبز؛ **۳۸۳/۳۸۳ تست در ۵۲ فایل**؛
  `npm audit --omit=dev` صفر؛ `npm audit` کامل ۷ moderate فقط dev.
- **TD-22 و TD-24 باز می‌مانند.** TD-22 تا اجرای موفق روی دستگاه ۱۶KB باز است؛ TD-24 بدون
  ارزیابی مستقل و remediation تأییدشده باز است.
- **اقدام لازم از مالک برای پاس بعدی:** (۱) دستگاه فیزیکی یا image ۱۶KB قابل‌نصب، (۲) یک کپی
  disposable از `barber_appSQLite.db` ساخته‌شده با 7.0.0 همراه با Secret همان دستگاه،
  (۳) دسترسی به Google Maven رسمی یا تأیید بازسازی روی شبکه مجاز، (۴) تأیید صریح برای keystore
  وPlay App Signing. هیچ‌کدام از این‌ها در این پاس فرض یا ساخته نشد.

---

## 14. پاس هفدهم — اجرای نهایی و جمع‌بندی پروژه (2026-11-14)

**نقطه شروع:** `HEAD = 28da1dd`، شاخه `develop`، ۶۸ modified + ۲۰ untracked + ۰ staged؛
Node 24.18.0، npm 11.16.0، Java 17 (JBR 21 در Android Studio موجود)، Gradle 8.14، SDK 36،
NDK 28.2.13676358، Capacitor 7.6.10 و sqlite plugin 7.0.3. هیچ commit/push/merge/reset/clean،
هیچ migration و هیچ نوشتن روی Supabase انجام نشد.

**کارهای انجام‌شده:**
- **BUG-22 (double submit) کامل بسته شد:** همهٔ فرم‌ها (customer/service/appointment/finance/
  color/quick-sale) و صفحات auth مقدار `isSubmitting` را به `Button` می‌دهند و `Button` تا پایان
  درخواست غیرفعال است.
- **BUG-31 بسته شد:** `matchesSearch` هم haystack و هم needle را نرمال می‌کند؛ تست رقم فارسی داخل
  متن اضافه شد.
- **TD-05 بسته شد:** تست‌های customer و service از mock دستی به `node:sqlite` واقعی منتقل شدند
  (۳۸ تست جدید/بازنویسی‌شده). کل مجموعه **۴۰۳/۴۰۳ در ۵۲ فایل** سبز است.
- **TD-06 بسته شد:** آستانهٔ پوشش (70/60/60/70) در `vitest.config.ts` و مرحلهٔ CI اضافه شد؛
  baseline: 73.58% statements، 66.11% branches، 67.68% functions، 75.47% lines.
- **iOS:** سه pod جاافتاده (`CapacitorCamera`، `CapacitorFilesystem`،
  `AparajitaCapacitorSecureStorage`) به `ios/App/Podfile` اضافه شد. `ITSAppUsesNonExemptEncryption`
  عمداً پر نشد (تصمیم حقوقی/مالک). build/archive: **NOT RUN** (ویندوز، بدون Xcode).
- **Android:** آرتیفکت‌ها دوباره ساخته نشدند (Google Maven در دسترس نیست) و hash آن‌ها تغییر نکرده؛
  بازرسی APK: `targetSdk 36`، `allowBackup=false`، `fullBackupContent=false`، بدون `debuggable`،
  صفر `.map`، صفر `sb_secret_*` و یک `sb_publishable_*`.
- **رجیستر:** BUG-30/TD-11 فقط به‌دلیل ممنوعیت حذف فایل‌های موجود، پاک نشدند (هر دو unreachable و
  خارج از باندل). TD-13/TD-20 resolved تأیید شد؛ TD-18/TD-19 partial ثبت شد.

**گیت‌ها:** type-check، lint، format:check و build سبز؛ صفر source map؛ `dist` = 2.2 MB؛
`npm audit --omit=dev` صفر؛ audit کامل ۷ moderate فقط dev.

**باز مانده و نیازمند محیط/مالک:** TD-22 (اجرای واقعی روی دستگاه ۱۶KB)، TD-24 (بازبینی امنیتی export)،
build رسمی از Google Maven، keystore/Play App Signing، اجرای migrationها روی Staging و تست دو دستگاه،
build/archive iOS روی macOS، و تصمیم `ITSAppUsesNonExemptEncryption`.

---

## 15. پاس هجدهم — بستن نهایی و تحویل (2026-11-14)

**هدف:** پایان دادن به کارهای توسعه‌ای، آماده‌سازی مخزن، و تحویل مستند. هیچ قابلیت جدیدی اضافه نشد.

- **Git:** بدون تغییر در `develop` / `28da1dd`؛ ۷۱ modified + ۲۲ ورودی untracked (۸۹ فایل با
  `-uall`) و ۰ staged. هیچ commit/push/merge/reset/clean انجام نشد.
- **مخزن:** `android/` و `ios/` از ignore کامل خارج شدند تا ۶۹ فایل native (manifest،
  backup rules، Gradle، Podfile، Info.plist، Xcode project، assets) قابل‌ردیابی باشند.
  قواعد nested هنوز `build/`, `.gradle/`, `local.properties`, `Pods/`, `public/`، فایل‌های
  تولیدی و همهٔ Secretها را حذف می‌کنند. این فایل‌ها هنوز stage نشده‌اند.
- **حذف کد مرده:** `src/App.tsx`، `src/App.css`، `src/database/repositories/base.repository.ts`
  پس از اثبات نبودِ import حذف شدند (BUG-30 و TD-11 بسته).
- **TD-24:** تنها فراخوان‌های `UtilsEncryption` از پل `exportToJson`/`importFromJson` پلاگین است و
  اپ هیچ‌کدام را صدا نمی‌زند؛ برای این انتشار بسته شد و «پیش‌شرط هر قابلیت Backup» مستند شد.
- **Android:** تنظیمات release تأیید شد؛ `zipalign -c -P 16` پاس؛ `p_align = 0x4000`؛ بدون امضا؛
  Google Maven همچنان 404. **TD-22 باز است** چون runtime اجرا نشد.
- **iOS:** پروژه استاتیک کامل (Podfile شامل SQLite/Camera/Filesystem/SecureStorage)؛
  `DEVELOPMENT_TEAM` ندارد؛ build/archive **NOT RUN**. راهنمای کامل Mac در
  `docs/FINAL_PROJECT_HANDOVER.md` §۵.
- **گیت‌ها:** type-check/lint/format/build سبز؛ **۴۰۳/۴۰۳ تست در ۵۲ فایل**؛ صفر source map؛
  `dist` = 2.2 MB؛ `npm audit --omit=dev` صفر.
- **مستندات جدید:** `docs/FINAL_PROJECT_HANDOVER.md` و `docs/FINAL_OWNER_ACTION_CHECKLIST.md`.
- **اقدام بعدی:** فقط کارهای مالک/محیط در چک‌لیست؛ توسعهٔ قابلیت جدید متوقف است.

