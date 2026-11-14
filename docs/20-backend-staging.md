# ۲۰ — Backend Staging: ممیزی، اجرا و معیارهای PASS/BLOCKED

تاریخ: ۲۰۲۶-۱۱-۱۴ · Baseline: `57995a5` · شاخه: `release/direct-distribution-2026-11-14`

این سند فقط **رویهٔ اعتبارسنجی** است. در این مأموریت هیچ پروژهٔ Supabase ساخته نشد، هیچ
Migration ریموتی اجرا نشد، هیچ نوشتنی روی هیچ پروژه‌ای انجام نشد و هیچ Secret واقعی خوانده نشد.
سند مکمل `docs/12-supabase-staging-setup.md` (راهنمای ساخت پروژه) است؛ در تعارض، این سند
برای **معیارهای پذیرش** مرجع است.

---

## ۱. جداسازی Staging از Production

### ۱.۱. ساخت پروژهٔ مستقل (فقط با اجازهٔ صریح مالک)

1. در داشبورد Supabase سازمان درست را انتخاب کنید و **New project** بزنید
   (جزئیات گام‌به‌گام: `docs/12-supabase-staging-setup.md`).
2. نام صریح `barber-staging` و region هم‌تراز Production.
3. رمز دیتابیس تصادفی ۳۲ کاراکتری را در password manager ذخیره کنید (در داشبورد قابل مشاهده نیست).
4. Project ref را از **Project Settings → General** بردارید و در `RLS_STAGING_PROJECT_REF` بگذارید.
5. فقط **publishable key** را برای کلاینت/تست استفاده کنید.
6. هیچ پروژهٔ جدیدی بدون اجازهٔ مالک ساخته نمی‌شود و هیچ دادهٔ Production کپی نمی‌شود.

| کنترل | الزام |
|---|---|
| پروژهٔ مستقل | Project ref متفاوت با Production؛ نام صریح `barber-staging` |
| داده | هیچ دادهٔ واقعی؛ فقط دو حساب تست A و B |
| Storage | bucket خالی؛ فقط دو object تستی |
| کلیدها | فقط publishable key؛ `service_role`/`secret` هرگز در اپ یا تست‌ها |
| `.env` | فقط `.env.rls.local` محلی (در `.gitignore`)؛ هیچ مقدار واقعی در Git/چت/گزارش |
| تأیید مالک | تأیید کتبی که ref همان Staging است و هیچ دادهٔ واقعی ندارد |

اگر هر یک از این کنترل‌ها قابل اثبات نباشد وضعیت **BLOCKED** است، نه PASS.

## ۲. متغیرهای محیطی و عدم افشا

| متغیر | استفاده | ممنوعیت |
|---|---|---|
| `VITE_SUPABASE_URL` | فقط Staging URL | Production URL |
| `VITE_SUPABASE_ANON_KEY` | publishable key | `sb_secret_…` / `service_role` |
| `RLS_STAGING_PROJECT_REF` | گارد runner | خالی بودن (abort) |
| `RLS_PRODUCTION_PROJECT_REF` | مقایسهٔ گارد | برابر بودن با Staging |
| `RLS_USER_A_EMAIL` / `RLS_USER_A_PASSWORD` | ورود کاربر A | واقعی/شخصی |
| `RLS_USER_B_EMAIL` / `RLS_USER_B_PASSWORD` | ورود کاربر B | واقعی/شخصی |
| `DATABASE_URL` | فقط psql/CLI | چاپ در لاگ |

قواعد:

- متغیرها فقط در شل یا `.env.rls.local` محلی؛ هرگز commit نمی‌شوند.
- هیچ توکن/JWT در خروجی ثبت نمی‌شود؛ فقط fingerprint کوتاه یا «present/absent».
- ایمیل‌ها در شواهد ماسک می‌شوند (`rls-a@…`).

## ۳. Preflight فقط‌خواندنی

ترتیب پیشنهادی و انتظار هر گام:

```bash
# 1) سلامت پروژه (بدون داده، بدون schema)
curl -sS -o /dev/null -w '%{http_code}\n' \
  "https://<staging-ref>.supabase.co/auth/v1/health" \
  -H "apikey: <staging-publishable-key>"
# انتظار: 200

# 2) گارد runner بدون نوشتن
npm run rls:check -- --preflight
# انتظار: staging guard OK و چاپ برنامهٔ عملیات، بدون هیچ write

# 3) بررسی مالکیت قدیمی (فقط خواندن)
psql "$STAGING_DATABASE_URL" -t -A -f supabase/tests/legacy_ownership_mismatches.sql
# انتظار: خروجی خالی

# 4) شمارش دادهٔ واقعی (فقط خواندن)
# select count(*) from public.customers;   -- انتظار: 0 روی Staging
```

هیچ‌کدام از گام‌های ۱–۴ نوشتنی نیست. اگر خروجی گام ۳ غیرخالی یا شمارش گام ۴ غیرصفر بود،
توقف فوری: احتمالاً به دادهٔ Production متصل شده‌اید.

## ۴. ترتیب Migrationها و بررسی تاریخچه

ترتیب رسمی Backend (نه SQLite محلی):

1. `supabase/migrations/001_initial_schema.sql`
2. `002_sync_indexes_and_fk.sql`
3. `003_photo_storage_policy.sql`
4. `004_same_user_ownership.sql` (FKهای ترکیبی `NOT VALID`)
5. `005_sync_tombstones.sql`
6. سپس `supabase/tests/verify_release_schema.sql`

پیش از هر اجرا، تاریخچه بررسی می‌شود (فقط خواندن):

```sql
select version, name from supabase_migrations.schema_migrations order by version;
-- اگر جدول وجود ندارد:
select table_schema, table_name from information_schema.tables
 where table_name = 'schema_migrations';
```

الزامات:

- Migrationها به ترتیب و یک‌بار اعمال می‌شوند؛ اجرای دوباره فقط با تصمیم صریح مالک.
- **اجرای کورکورانه برای اثبات Idempotency ممنوع است.** اگر idempotency لازم است، ابتدا
  تاریخچه و وضعیت فعلی schema بررسی شود؛ سپس اجرای مجدد فقط روی پروژهٔ قابل‌بازسازی
  (Staging) و با تأیید جداگانه انجام شود.
- پس از `004`، `legacy_ownership_mismatches.sql` باید خالی بماند؛ در غیر این صورت
  `VALIDATE CONSTRAINT` انجام نمی‌شود.
- هر خطای Migration متوقف‌کننده است؛ ادامه با schema نیمه‌اعمال‌شده ممنوع.

## ۵. RLS با دو کاربر واقعی و JWT مستقل

- دو حساب واقعی در `auth.users` (Auto Confirm) ساخته می‌شود.
- برای هر کاربر یک session/JWT مستقل از `/auth/v1/token?grant_type=password` گرفته می‌شود.
- درخواست‌های تست با هدر `Authorization: Bearer <user JWT>` و `apikey: <publishable>` است.
- **`service_role` هرگز استفاده نمی‌شود**؛ چون RLS را دور می‌زند و جداسازی را اثبات نمی‌کند.

مسیرهای اثبات:

| تست | انتظار PASS |
|---|---|
| `select` ردیف‌های کاربر دیگر | ۰ ردیف |
| `insert` با `user_id` کاربر دیگر | خطای RLS |
| `update`/`delete` ردیف کاربر دیگر | ۰ ردیف تأثیرگرفته |
| `rls_two_user_check.sql` با `psql` | پیام `RLS verification passed` (تراکنش با ROLLBACK) |

## ۶. Storage Policy

- آپلود عکس تستی با JWT کاربر A به مسیر مجاز خودش → موفق.
- تلاش کاربر B برای `download`/`update`/`delete` همان object → 4xx (403/404).
- آپلود با مسیر متعلق به کاربر دیگر → رد.
- objectهای تستی در پایان حذف می‌شوند؛ هیچ فایل واقعی لمس نمی‌شود.

## ۷. Sync دو دستگاه و دو حساب

سناریوها با **دو دستگاه/دو پروفایل مستقل** (SQLite مستقل) اجرا می‌شوند؛ تست‌های واحد SQLite
جایگزین نیستند:

| سناریو | انتظار PASS |
|---|---|
| دستگاه ۱ (کاربر A) → Staging → دستگاه ۲ (کاربر A) | داده یکسان، بدون تکرار |
| دستگاه ۲ (کاربر B) هم‌زمان | هیچ دادهٔ A قابل مشاهده نیست |
| Offline → تغییر محلی → Reconnect | push خودکار/دستی موفق، بدون گم‌شدن تغییر |
| Retry پس از خطای شبکه | بدون رکورد تکراری (outbox idempotent) |
| Conflict (ویرایش هم‌زمان دو دستگاه) | نتیجهٔ قطعی طبق قاعدهٔ پروژه؛ بدون از‌دست‌رفتن بی‌صدا |
| Tombstone (حذف در A) | در B نیز حذف می‌شود و دوباره زنده نمی‌شود |

## ۸. ثبت شواهد بدون PII

هر شاهد باید شامل این موارد باشد و هیچ دادهٔ شخصی نداشته باشد:

- تاریخ/ساعت UTC، ref ماسک‌شده (۴ کاراکتر آخر)، نسخهٔ commit.
- خروجی status codeها، تعداد ردیف‌ها، پیام‌های PASS/خطا.
- ایمیل‌ها ماسک‌شده؛ JWT/کلید هرگز.
- اسکرین‌شات/لاگ فقط از دادهٔ تستی.

## ۹. معیارهای وضعیت

| وضعیت | شرط |
|---|---|
| `PASS` | همهٔ بندهای ۳–۷ با شاهد واقعی تأیید شده‌اند |
| `BLOCKED` | نبود تأیید مالک، نبود Staging مستقل، نبود دو کاربر/دستگاه، یا رد شدن یک کنترل امنیتی |
| `NOT RUN` | اجرا نشده (تنها اعتبارسنجی محلی §۱۰ انجام شده؛ هیچ بند میزبان اجرا نشده) |

**وضعیت فعلی: BLOCKED.** هیچ Staging تأییدشده، اعتبارنامه یا اجازهٔ نوشتن وجود ندارد؛
`CI` فقط RLS را روی PostgreSQL 15 اپلیکیشنی (schema + تست‌های SQL) اثبات می‌کند، نه
رفتار واقعی Auth/Storage/Sync روی Staging.

## ۱۰. اعتبارسنجی محلی انجام‌شده (۲۰۲۶-۱۱-۱۵)

بدون هیچ اتصال Remote، همان فایل‌های واقعی روی PostgreSQL درون‌فرایندی (PGlite، PG17/WASM)
اجرا شدند:

| گام | نتیجه |
|---|---|
| `postgres_bootstrap.sql` | اجرا شد |
| مهاجرت‌های `001`→`005` | **دو بار** بدون خطا (Idempotency) |
| `verify_release_schema.sql` | PASS |
| `legacy_ownership_mismatches.sql` | ۰ ردیف |
| `rls_two_user_check.sql` با دو کاربر/JWT مستقل | **«RLS verification passed»** + «cleanup verified» |

تنها ترجمهٔ انجام‌شده، معادل‌سازی چهار دستور psql (`\set`، دو `\gset`، `\echo`) بود؛
تمام دستورهای SQL بدون تغییر اجرا شدند. این شاهد، سطح دیتابیس است و جای اجرای میزبان
روی Staging (Auth/Storage/Realtime واقعی) را نمی‌گیرد؛ آن بخش همچنان BLOCKED است.
