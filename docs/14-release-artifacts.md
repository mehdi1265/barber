# ۱۴ — بسته آماده‌سازی Release Candidate

> این سند برنامه‌های اجرایی انتشار است، نه شاهد اجرا.
> هر جا شاهد واقعی وجود ندارد، صریحاً `NOT RUN` نوشته شده است.
> Production در هیچ مرحله‌ای محیط آزمایش نیست.

نسخه پیشنهادی: `1.0.0-rc.1` (نسخه‌گذاری نهایی نیازمند تصمیم مالک است)
آخرین به‌روزرسانی: ۲۰۲۶-۱۱-۱۴

---

## ۱. Release Checklist

### ۱.۱ گیت‌های فنی (محلی — قابل اجرا بدون Supabase)

- [x] `npm run type-check`
- [x] `npm run lint`
- [x] `npm run format:check`
- [x] `npx vitest run` — ۳۸۳ تست در ۵۲ فایل
- [x] `npm run build` — بدون source map در بسته انتشار
- [x] `npm audit --omit=dev` — صفر آسیب‌پذیری Production
- [x] Migrationهای ۰۰۱–۰۰۵ از نظر ترتیب، افزودنی بودن و تکرارپذیری بازبینی شدند
- [ ] `npm run cap:build` روی ماشین با دسترسی Google Maven
- [ ] ساخت AAB امضاشده و نصب روی دستگاه واقعی

### ۱.۲ گیت‌های عملیاتی (Staging — نیازمند تأیید مالک)

- [ ] تکمیل و امضای `docs/13-release-owner-approval.md`
- [ ] اجرای dry `--preflight` و سبز بودن گاردها
- [ ] اعمال ۰۰۱–۰۰۵ دو بار و ثبت خروجی
- [ ] تأیید Schema با `supabase/tests/verify_release_schema.sql`
- [ ] RLS دوکاربره با `--confirm-ref` و بررسی پاک‌سازی
- [ ] ۱۰ سناریوی دو دستگاه طبق `docs/15-operational-test-plan.md`

### ۱.۳ گیت‌های انتشار (مالک/فروشگاه)

- [ ] تعیین `applicationId` نهایی و `versionCode`/`versionName`
- [ ] keystore انتشار + پشتیبان امن + Play App Signing
- [ ] سیاست حریم خصوصی و لیست‌بندی فروشگاه
- [ ] بررسی نهایی ۱۶ KB page size (TD-22)

---

## ۲. Release Notes پیشنهادی (MVP)

**نسخه ۱.۰.۰ — نسخه اولیه**

قابلیت‌ها:

- مدیریت مشتریان، خدمات، نوبت‌ها و دفترچه رنگ
- ثبت ویزیت، پرداخت، هزینه و گزارش مالی روزانه
- فروش سریع و داشبورد روز
- کار کاملاً آفلاین با پایگاه داده محلی رمزگذاری‌شده روی دستگاه
- همگام‌سازی ابری اختیاری با جداسازی کامل داده هر آرایشگر
- ورود/ثبت‌نام امن، بازیابی رمز با OTP
- یادآوری‌های محلی، جست‌وجوی سراسری، پشتیبان‌گیری خاموش

محدودیت‌های شناخته‌شده این نسخه:

- همگام‌سازی دو دستگاه به‌صورت عملیاتی روی Staging تأیید نشده است.
- پیام OTP/ایمیل بازیابی به تحویل واقعی ایمیل وابسته است.
- نسخه iOS ساخته و تست نشده است.

---

## ۳. Migration Execution Plan

### ترتیب و وابستگی

| # | فایل | پیش‌نیاز | اثر | تکرارپذیر |
|---|---|---|---|---|
| 1 | `001_initial_schema.sql` | Supabase Auth + `uuid-ossp` | ۱۲ جدول، RLS، bucket خصوصی، ۴ policy Storage، trigger پروفایل | بله (`IF NOT EXISTS`، `DROP POLICY IF EXISTS`، `DROP TRIGGER IF EXISTS`) |
| 2 | `002_sync_indexes_and_fk.sql` | 001 | ۱۲ ایندکس keyset، `deleted_at` هزینه‌ها، FKها | بله |
| 3 | `003_photo_storage_policy.sql` | 001 | policy چهارم Storage (UPDATE) | بله (`duplicate_object`) |
| 4 | `004_same_user_ownership.sql` | 002 | ۵ unique + ۱۳ FK ترکیبی، همه `NOT VALID` | بله (بررسی `pg_constraint`) |
| 5 | `005_sync_tombstones.sql` | 001/002 | ۷ ستون `deleted_at` + ۷ ایندکس | بله (`IF NOT EXISTS`) |

### روش اجرا (Staging)

1. در SQL Editor هر فایل را **کامل** اجرا کنید؛ انتظار `Success. No rows returned`.
2. همان پنج فایل را **بار دوم** اجرا کنید؛ این اثبات idempotency است.
3. `supabase/tests/verify_release_schema.sql` را اجرا و خروجی را با مقادیر انتظاری مقایسه کنید.
4. `supabase/tests/legacy_ownership_mismatches.sql` باید **صفر ردیف** برگرداند.
5. `VALIDATE CONSTRAINT` فقط پس از تمیز بودن مرحله ۴ و با تأیید جداگانه.

> اجرای روی Hosted Production همچنان نیازمند تأیید صریح، پنجره زمانی و پشتیبان‌گیری است.

### خطرات اجرای مجدد

- `001` سیاست‌ها و trigger را drop/recreate می‌کند؛ در لحظه اجرا پنجره کوتاه بدون policy وجود دارد. برای Production در ترافیک کم اجرا شود.
- `004` فقط constraintهای غایب را می‌سازد؛ دوباره اجرا کردن بی‌خطر است.
- `005` فقط ستون/ایندکس اضافه می‌کند؛ روی جدول بزرگ، ساخت ایندکس می‌تواند قفل سبک ایجاد کند.

---

## ۴. Backup & Recovery Plan

### پیش از هر Migration روی Hosted

1. **PITR**: تأیید فعال بودن Point-in-Time Recovery (یا snapshot دستی) در داشبورد.
2. **Logical backup**:
   ```bash
   pg_dump "$DATABASE_URL" --format=custom --file=barber-pre-migration.dump
   ```
3. **Storage**: فهرست و حجم objectهای bucket `customer-photos` ثبت شود؛ نسخه‌برداری bucket در صورت وجود ابزار.
4. **Schema checksum**: خروجی `pg_dump --schema-only` برای مقایسه بعد از Migration نگه داشته شود.
5. رمز فایل پشتیبان فقط در محیط محلی امن؛ هیچ پشتیبانی در Git قرار نگیرد.

### بازیابی

| سناریو | مسیر بازیابی |
|---|---|
| Migration ناقص/ناموفق | توقف، بررسی log، اعمال مجدد فایل (idempotent)، یا restore از dump |
| خرابی داده | PITR به زمان قبل از Migration یا restore کامل dump |
| از دست رفتن فایل عکس | بازگردانی bucket از نسخه پشتیبان؛ ردیف‌های DB مستقل‌اند |

> بازیابی PITR در این پروژه **آزمایش نشده است** (`NOT RUN`).

---

## ۵. Rollback Plan

Migrationها افزودنی‌اند، بنابراین rollback اصلی «عقب بردن اپ» است نه حذف ستون:

| لایه | اقدام | ریسک |
|---|---|---|
| اپلیکیشن | انتشار نسخه قبلی (N-1) | نسخه N-1 ستون‌های جدید را نمی‌شناسد؛ سازگار است |
| Schema | نگه‌داشتن ۰۰۵ و ۰۰۴ | حذف ستون `deleted_at` باعث از دست رفتن tombstoneها می‌شود — انجام نشود |
| داده | restore از backup | از دست رفتن نوشتن‌های بعد از backup |
| RLS | بازگردانی سیاست‌ها با اجرای مجدد ۰۰۱ | پنجره کوتاه بدون policy |

- Rollback خودکار وجود ندارد؛ تصمیم دستی با مالک.
- اگر باگ سمت کلاینت باعث push نادرست شد، ابتدا sync را متوقف کنید (بدون logout)، سپس نسخه اصلاح‌شده منتشر شود.

---

## ۶. Smoke Test Plan (پس از انتشار)

| # | بررسی | انتظار |
|---|---|---|
| 1 | نصب و باز شدن اپ | بدون صفحه سفید |
| 2 | ورود با حساب واقعی تست | داشبورد باز شود |
| 3 | بقای نشست پس از kill/restart | کاربر وارد بماند |
| 4 | ایجاد مشتری + نوبت | ذخیره و نمایش |
| 5 | ثبت ویزیت و پرداخت | گزارش روزانه درست |
| 6 | قطع شبکه → ایجاد داده → وصل شدن | outbox تخلیه شود |
| 7 | خروج و ورود مجدد | داده‌ها حفظ شوند |
| 8 | بازیابی رمز | OTP/لینک کار کند |
| 9 | آپلود عکس مشتری | bucket و دسترسی مالک |
| 10 | حذف مشتری و sync دوم | حذف منتشر و بازنگردد |

---

## ۷. Staging Verification Plan

ترتیب دقیق (همه روی Staging تأییدشده):

```bash
# 1) گاردها و اتصال، بدون نوشتن
npm run rls:check -- --preflight --out supabase/tests/rls-preflight.log

# 2) Migrationها در SQL Editor: 001→005 و سپس همان پنج، بار دوم
# 3) تأیید Schema
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verify_release_schema.sql

# 4) گزارش ناسازگاری باید خالی باشد
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/legacy_ownership_mismatches.sql

# 5) RLS نوشتنی با تأیید صریح
npm run rls:check -- --confirm-ref="$RLS_STAGING_PROJECT_REF" \
  --out supabase/tests/rls-verification.log
```

معیار PASS: خروجی `RLS verification passed`، پیام پاک‌سازی بدون ردیف باقی‌مانده، و `verify_release_schema` مطابق انتظار.

---

## ۸. Production Deployment Plan

1. **Freeze**: توقف ادغام تغییرات و اعلام پنجره.
2. **Backup**: PITR + dump مطابق بخش ۴.
3. **Migrations**: ۰۰۱–۰۰۵ به ترتیب، یک بار؛ سپس بار دوم فقط اگر idempotency روی Staging تأیید شده و پنجره اجازه دهد.
4. **Verify**: `verify_release_schema.sql` + گزارش ناسازگاری + RLS probe فقط‌خواندنی روی Production ممنوع است؛ در عوض health و خواندن پروفایل خودِ مالک.
5. **App rollout**: ابتدا Internal testing، سپس staged rollout.
6. **Smoke**: بخش ۶ توسط مالک.
7. **Unfreeze** فقط پس از سبز بودن Smoke و نبود خطای بحرانی در ۳۰ دقیقه اول.

> این برنامه در این پاس اجرا نشده است (`NOT RUN`).

---

## ۹. Post-Release Monitoring Plan

| منبع | چه چیزی | آستانه اقدام |
|---|---|---|
| Supabase Auth logs | خطای ورود، OTP ناموفق | افزایش ناگهانی |
| PostgREST logs | ۴۰۱/۴۰۳ غیرمنتظره | هر رخداد بررسی شود |
| Storage logs | خطای upload/delete | تکرار بیش از ۳ بار |
| DB metrics | اتصال، کندی کوئری‌های keyset | p95 بالای آستانه |
| اپ | شمارش outbox باقی‌مانده | رشد پیوسته بدون کاهش |
| Play Console | crash/ANR | هر crash جدید |

- هیچ تلمتری خودکار در اپ وجود ندارد؛ پایش به logs سرور و گزارش‌های دستی تکیه دارد (P2 برای نسخه بعد).
- دسترسی به logها فقط با حساب مالک.

---

## ۱۰. وضعیت شواهد

| مورد | وضعیت |
|---|---|
| گیت‌های محلی | ✅ در همین پاس اجرا شد |
| Migration روی Staging | NOT RUN |
| RLS runtime | NOT RUN |
| دو دستگاه | NOT RUN |
| Backup drill | NOT RUN |
| Android AAB | ساخته شد (بدون امضای انتشار، با dependencyهای آینه‌ای غیررسمی؛ فقط برای اعتبارسنجی — قابل آپلود نیست). شواهد 16 KB در `docs/16-android-sqlcipher-migration.md` |
| بازبینی مجدد artifactها (پاس ۱۶) | hash دست‌نخورده: debug `a25f03…`، release `c6b28d…`، AAB `90a187…`؛ `zipalign -c -P 16` و `p_align = 0x4000` تأیید شد؛ `libsqlcipher.so` بسته‌شده بایت‌به‌بایت = AAR 4.10.0 |
| بازسازی رسمی از Google Maven | BLOCKED — `dl.google.com` برای AGP/AndroidX/`google-services`/`master-index.xml` پاسخ 404 می‌دهد |
| تست دستگاه / مهاجرت دیتابیس SQLCipher | NOT RUN / BLOCKED (پاس ۱۶: هیچ دیتابیس ساخته‌شده با 7.0.0، هیچ دستگاه، و هیچ system image قابل‌بوت موجود نیست؛ دیتابیس جدید جایگزین نشد) |
| اجرا روی دستگاه یا شبیه‌ساز ۱۶ کیلوبایتی | BLOCKED — `system.img` = ۰؛ `android-36/google_apis_ps16k` فقط placeholder است؛ مخزن SDK هم 404 می‌دهد |
| iOS | NOT RUN (نیازمند macOS). بازبینی استاتیک در پاس پایانی: Podfile سه pod جاافتاده (`CapacitorCamera`، `CapacitorFilesystem`، `AparajitaCapacitorSecureStorage`) را حالا دارد؛ `ITSAppUsesNonExemptEncryption` عمداً خالی مانده و تصمیم مالک/حقوقی می‌خواهد |
| بازبینی پاس پایانی (2026-11-14) | artifactها دوباره ساخته نشدند و hash دست‌نخورده است (`c6b28d3a…` / `a25f032f…` / `90a1878d…`). بررسی APK: `targetSdk 36`، `allowBackup=false`، `fullBackupContent=false`، بدون `debuggable`، صفر فایل `.map`، صفر توکن `sb_secret_*`، و یک توکن `sb_publishable_*` (همان الگوی `dist`). فقط فایل‌های تست/helper تغییر کرده‌اند؛ `matchesSearch` پس از اصلاح هم tree-shaken است و `index-DJ8xT4BC.js` در `dist` و در assets بسته‌بندی‌شده hash یکسان (`1f6141…`) دارد |
