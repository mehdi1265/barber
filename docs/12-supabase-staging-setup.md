# ۱۲ — آماده‌سازی Supabase Staging برای اعتبارسنجی T17

> وضعیت این سند: **راهنما**. در تهیه آن هیچ اتصالی به Supabase برقرار نشد، هیچ Migration اجرا نشد،
> هیچ کد برنامه‌ای تغییر نکرد و هیچ Secret واقعی نوشته نشد. همه مقادیر نمونه خالی یا placeholder هستند.

هدف: فراهم‌کردن یک محیط Test/Staging مستقل و قابل‌تأیید تا مرحله‌های ۲–۴ پاس دوازدهم
(Migration 005، RLS واقعی، ۱۰ سناریوی دو دستگاه) بتوانند با شواهد واقعی اجرا شوند.

---

## ۱. ساخت پروژه Staging

1. وارد `https://supabase.com/dashboard` شوید و مطمئن شوید سازمان (Organization) درست انتخاب شده است.
2. **New project** → نام صریح `barber-staging` (نام Production هرگز نباید شامل «staging» باشد و برعکس).
3. Region: همان region پروژه Production (کاهش تفاوت رفتاری)، مگر اینکه دلیل دیگری وجود داشته باشد.
4. Plan: Free برای اعتبارسنجی کافی است؛ محدودیت‌ها در بخش ۲ آمده است.
5. **Generate a password** را بزنید یا رمز تصادفی ۳۲ کاراکتری بسازید و **بلافاصله در password manager** ذخیره کنید.
   - این رمز بعداً در داشبورد قابل مشاهده نیست؛ فقط Reset می‌شود.
   - کاراکترهای `@ : / ?` را در رمز به‌کار نبرید تا در `DATABASE_URL` نیاز به percent-encoding پیش نیاید.
6. پس از آماده‌شدن پروژه، ref را بردارید: **Project Settings → General → Project ID**
   (۲۴ کاراکتر کوچک؛ همان چیزی که در `https://<ref>.supabase.co` می‌آید).
7. کلید عمومی: **Project Settings → API Keys → publishable key** (`sb_publishable_…`).
   کلید `secret`/`service_role` هرگز در اپ یا در این فرایند استفاده نمی‌شود.

> نام‌گذاری و سازمان جدا، مهم‌ترین لایه محافظت انسانی است: در داشبورد باید بدون تردید بفهمید
> روی کدام پروژه هستید.

### تفاوت Staging و Production

| مورد | Production | Staging |
|---|---|---|
| Project ref | متفاوت | متفاوت (تأییدشده و ثبت‌شده) |
| دیتابیس و داده | داده واقعی کسب‌وکار | **هیچ داده واقعی؛ فقط دو حساب تست** |
| Auth users | کاربران واقعی | فقط `rls-a@…` و `rls-b@…` |
| Storage bucket | فایل‌های واقعی مشتری | خالی |
| API keys | Production publishable | Staging publishable (متفاوت) |
| `.env.local` | URL/کلید Production | — |
| `.env.rls.local` | — | URL/کلید Staging + گاردها |
| ریسک خرابی | غیرقابل‌قبول | قابل‌بازسازی (حذف و ساخت مجدد) |

نکات Free plan: پروژه غیرفعال پس از بی‌کاری pause می‌شود (بازفعالی از داشبورد)؛ سقف پروژه‌ها محدود است.

---

## ۲. ابزارهای لازم (فقط ضروری‌ها)

**ضروری: هیچ نصب اضافه‌ای لازم نیست.**
- Node 24 (موجود) برای `npm run rls:check`.
- مرورگر برای داشبورد (ساخت پروژه، اجرای SQL، ساخت کاربران).
- Git Bash موجود برای دستورهای shell.

**اختیاری A — Supabase CLI** (فقط اگر اعمال/بازبینی Migration به‌صورت اسکریپتی خواسته شود):
```bash
npm install --save-dev supabase     # بدون نیاز به دسترسی Administrator
npx supabase --version
```
جایگزین بدون npm: دانلود باینری standalone از GitHub Releases سوپابیس (`supabase_windows_amd64.zip`).

**اختیاری B — psql** (فقط برای `supabase/tests/rls_two_user_check.sql` و
`legacy_ownership_mismatches.sql`؛ مسیر REST نیازی به آن ندارد):
```bash
winget install --id PostgreSQL.PostgreSQL.15 -e     # نیازمند تأیید UAC
# سپس شل را ببندید و باز کنید:
psql --version
```

**غیرضروری — Docker:** فقط برای `supabase start` محلی یا اجرای job `rls-postgres` روی همین ماشین.
Docker Desktop نیازمند WSL2، دسترسی Administrator و احتمالاً restart است و برای اعتبارسنجی Staging
**لازم نیست**؛ در این پاس پیشنهاد نمی‌شود.

---

## ۳. متغیرهای محیطی

قالب پیشنهادی (همه مقادیر **خالی**؛ هیچ Secret واقعی اینجا نوشته نمی‌شود):

```bash
SUPABASE_ACCESS_TOKEN=
SUPABASE_DB_PASSWORD=
SUPABASE_PROJECT_REF=
RLS_STAGING_PROJECT_REF=
RLS_PRODUCTION_PROJECT_REF=
DATABASE_URL=
```

نکات:
- `.env.rls.local` و `.env.*.local` در `.gitignore` هستند؛ این متغیرها فقط محلی می‌مانند.
- **`scripts/rls-check.ts` این شش متغیر را نمی‌خواند.** runner به این‌ها نیاز دارد
  (در همان `.env.rls.local`):
  ```bash
  VITE_SUPABASE_URL=https://<staging-ref>.supabase.co
  VITE_SUPABASE_ANON_KEY=<staging-publishable-key>
  RLS_STAGING_PROJECT_REF=<staging-ref>
  RLS_PRODUCTION_PROJECT_REF=<production-ref>
  RLS_USER_A_EMAIL=
  RLS_USER_A_PASSWORD=
  RLS_USER_B_EMAIL=
  RLS_USER_B_PASSWORD=
  ```
- شش متغیر خواسته‌شده فقط برای مسیر CLI/psql کاربرد دارند:
  `SUPABASE_ACCESS_TOKEN` (CLI)، `SUPABASE_DB_PASSWORD`/`DATABASE_URL` (psql/CLI)،
  `SUPABASE_PROJECT_REF` (link/push)، دو متغیر `RLS_*_PROJECT_REF` (گارد).
- **اولویت در runner:** `.env.local` → `.env.rls.local` → process environment (محیط شل برنده است).
  بنابراین `VITE_SUPABASE_URL` را در شل export نکنید، وگرنه Staging را override می‌کند.
- `DATABASE_URL` فقط در صورت استفاده از psql/CLI:
  `postgresql://postgres.<staging-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
  (رشته دقیق را از **Dashboard → Connect** بردارید؛ pooler برای شبکه‌هایی که IPv6 مستقیم ندارند لازم است).
- `SUPABASE_ACCESS_TOKEN` در حساب → **Access Tokens** ساخته می‌شود و **account-wide** است
  (به همه پروژه‌ها دسترسی مدیریتی می‌دهد). آن را در password manager نگه دارید و پس از کار revoke کنید.
  CLI آن را فقط از process environment می‌خواند، نه از فایل:
  ```bash
  export SUPABASE_ACCESS_TOKEN="…"      # دستی، بدون echo
  npx supabase projects list            # فقط اگر لازم بود
  unset SUPABASE_ACCESS_TOKEN
  ```

---

## ۴. گارد امنیتی runner — وضعیت واقعی

بررسی `scripts/rls-check.ts`:

| الزام | وضعیت | شاهد |
|---|---|---|
| فقط ref تأییدشده Staging پذیرفته شود | ✅ | خط ۶۹۵–۷۰۱: اگر `RLS_STAGING_PROJECT_REF` خالی باشد، **قبل از هر درخواست** abort |
| هر ref ناشناخته رد شود | ✅ | خط ۷۰۷–۷۱۲: ref استخراج‌شده از URL باید دقیقاً برابر باشد؛ هاست غیر `*.supabase.co` مقدار `null` می‌دهد و رد می‌شود |
| Staging == Production → توقف | ✅ | `RLS_PRODUCTION_PROJECT_REF` اجباری است؛ نبودش هم abort می‌کند و برابری refها هم رد می‌شود |
| تأیید محیط پیش از عملیات مخرب | ✅ | `--confirm-ref=<exact-staging-ref>` اجباری است؛ بدون آن هیچ نوشتنی انجام نمی‌شود و `--preflight` فقط برنامه عملیات را چاپ می‌کند |
| چاپ Secret | ✅ | کلید فقط به‌صورت fingerprint، ایمیل ماسک می‌شود |

آنچه runner تغییر می‌دهد: در ۱۱ جدول یک ردیف با marker می‌سازد و در پایان همان‌ها را حذف می‌کند
(به‌همراه دو object در bucket). به داده دیگران دست نمی‌زند، اما **نوشتن روی Staging است** و باید
با تأیید مالک انجام شود. `--preflight` هیچ ردیفی نمی‌نویسد.

**توصیه:** پیش از اجرای کامل، `--preflight` اجرا شود و خط
`staging guard OK: project ref … matches RLS_STAGING_PROJECT_REF` خوانده شود. گزارش preflight
نام عملیات‌های نوشتنی و ref تأییدشده را چاپ می‌کند. اجرای کامل فقط با
`--confirm-ref=<staging-ref>` امکان‌پذیر است و تأیید برای همان اجرا معتبر است.

> توجه: SQL Editor هیچ گاردی ندارد. اعمال Migration در داشبورد به‌طور کامل به چشم انسان
> وابسته است؛ بخش ۶ را دقیقاً دنبال کنید.

---

## ۵. تست اتصال بدون Migration

هدف: اثبات دسترسی و درستی ref، بدون نوشتن هیچ چیز.

```bash
# 1) فقط health — بدون داده، بدون schema، بدون نوشتن
curl -sS -o /dev/null -w '%{http_code}\n' \
  "https://<staging-ref>.supabase.co/auth/v1/health" \
  -H "apikey: <staging-publishable-key>"
# انتظار: 200
```

```bash
# 2) گارد + کلید + sign-in؛ انتظار خطای PGRST205 تا وقتی schema اعمال نشده
npm run rls:check -- --preflight
# اگر schema اعمال نشده باشد: خطای روشن "schema is not applied"
# این خطا یعنی: شبکه و ref و کلید درست‌اند، و Migration هنوز اجرا نشده است (رفتار مطلوب)
```

هیچ‌کدام از این دو دستور ردیفی نمی‌نویسد. (اجرای واقعی آن‌ها در این پاس انجام نشد.)

---

## ۶. اعتبارسنجی Project Ref و اطمینان از نبودن Production

چهار بررسی مستقل، همه باید هم‌خوان باشند:

1. **داشبورد:** در URL `https://supabase.com/dashboard/project/<ref>` — ref باید با مقدار موردانتظار یکی باشد
   و نام پروژه `barber-staging` باشد.
2. **تنظیمات:** Project Settings → General → Project ID و API URL.
3. **دو فایل env:** ref داخل `VITE_SUPABASE_URL` در `.env.rls.local` باید با `.env.local` (Production) **متفاوت** باشد.
4. **گارد runner:** `RLS_STAGING_PROJECT_REF` = ref واقعی؛ `RLS_PRODUCTION_PROJECT_REF` = ref Production
   (اجباری در عمل، هرچند در کد اختیاری است).

بررسی داده (فقط خواندن، بعد از اعمال Migration):
```sql
select count(*) from public.customers;   -- انتظار: 0 روی Staging
```
وجود داده واقعی یعنی احتمالاً اشتباه متصل شده‌اید: توقف فوری.

قواعد سخت:
- `supabase link`/`db push` را هرگز بدون `--project-ref "$RLS_STAGING_PROJECT_REF"` اجرا نکنید.
- در شل، `SUPABASE_PROJECT_REF` را به‌صورت پایدار export نکنید.
- اگر هر کدام از چهار بررسی هم‌خوان نبود: توقف، هیچ دستوری اجرا نشود.

---

## ۷. چک‌لیست تحویل — مالک پروژه

اطلاعات (در کانال امن، نه در چت عمومی):
- [ ] تأیید کتبی: «پروژه `<ref>` همان Staging است و هیچ داده واقعی ندارد.»
- [ ] Staging ref (۲۴ کاراکتر)
- [ ] Staging publishable key (`sb_publishable_…`)
- [ ] ref پروژه Production (برای گارد مقایسه)
- [ ] ایمیل/رمز دو حساب تست A و B (Auto Confirm فعال)
- [ ] در صورت مسیر CLI/psql: Database password یا `DATABASE_URL` دقیق

تأییدها:
- [ ] اجازه اعمال `001`–`005` روی Staging، دو بار (اثبات idempotency)
- [ ] اجازه اجرای probe نوشتنی RLS (ساخت/حذف ردیف marker) روی Staging
- [ ] اجازه انجام ۱۰ سناریوی دو دستگاه روی Staging
- [ ] تأیید اینکه `.env.rls.local` فقط محلی می‌ماند و در چت/گزارش قرار نمی‌گیرد
- [ ] تأیید عدم نیاز به تغییر کد؛ در صورت کشف باگ واقعی، اجازه اصلاح جداگانه

---

## ۸. ترتیب اجرا در پاس بعد (پس از تأیید مالک)

```bash
# 1) پیش‌نیاز
npm run rls:check -- --preflight        # گارد + کلید + (schema در صورت وجود)

# 2) Migration در SQL Editor: 001, 002, 003, 004, 005 — سپس همان پنج، بار دوم
#    شاهد idempotency: "Success. No rows returned" هر دو بار

# 3) بررسی ستون‌ها و ایندکس‌ها (فقط خواندن)
#    select table_name, column_name from information_schema.columns
#     where table_schema='public' and column_name='deleted_at';
#    انتظار: ۱۱ ردیف (۴ جدول قبلی + ۷ جدول جدید)
#    select indexname from pg_indexes where schemaname='public'
#     and indexname like '%_user_deleted';   -- انتظار: ۷ ردیف

# 4) ساخت دو کاربر تست (Auto Confirm) و پر کردن .env.rls.local

# 5) بازبینی دوباره preflight، سپس اجرای کامل با تأیید صریح
npm run rls:check -- --confirm-ref="$RLS_STAGING_PROJECT_REF" \
  --out supabase/tests/rls-verification.log
```

۱۰ سناریوی دو دستگاه باید با دو کلاینت واقعی (دو دستگاه/دو پروفایل مرورگر با دیتابیس مستقل)
اجرا شوند؛ تست‌های SQLite جایگزین آن‌ها نیستند.

---

## ۹. وضعیت

**BLOCKED — OWNER ACTION REQUIRED**

هیچ پروژه Staging تأییدشده، هیچ اعتبارنامه و هیچ تأییدی برای نوشتن وجود ندارد. مراحل ۲–۴ پاس
دوازدهم اجرا نشده‌اند و تا وقتی موارد بخش ۷ فراهم نشوند، اجرا نمی‌شوند.
