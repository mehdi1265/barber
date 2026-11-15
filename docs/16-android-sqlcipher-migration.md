# ۱۶ — مهاجرت SQLCipher و سازگاری ۱۶ کیلوبایت

> **وضعیت:** کد ارتقا اعمال شد؛ APK و AAB ساخته شدند؛ **تست روی دستگاه اجرا نشده است.**
> این سند جایگزین شواهد اجرایی نیست. تا وقتی بخش ۴ روی یک دستگاه واقعی (با دیتابیس
> ساخته‌شده توسط نسخه منتشرشده فعلی) اجرا نشود، انتشار عمومی مجاز نیست.
>
> **پاس ۱۶ (2026-11-14):** تلاش برای تأیید اجرایی انجام شد و **BLOCKED** ماند. هیچ دیتابیس
> واقعیِ ساخته‌شده با نسخه 7.0.0، هیچ دستگاه متصل، هیچ system image قابل‌بوت، و هیچ دسترسی
> به Google Maven رسمی وجود ندارد. جزئیات و شواهد در §۴-۱. هیچ دیتابیس جدیدی به‌جای دیتابیس
> قدیمی ساخته نشد و هیچ build آینه‌ای «رسمی» اعلام نشد.

---

## ۱. تغییر انجام‌شده

| مورد | قبل | بعد |
|---|---|---|
| پلاگین | `@capacitor-community/sqlite` 7.0.0 | **7.0.3** (نسخه پایدار 7.x) |
| کتابخانه بومی | `net.zetetic:android-database-sqlcipher:4.5.3` | **`net.zetetic:sqlcipher-android:4.10.0@aar`** |
| هسته SQLCipher | 4.5.3 | 4.10.0 |
| `p_align` در همه ABIها | `0x1000` (۴ KB) | **`0x4000` (۱۶ KB)** |

نسخه 8.x پلاگین استفاده نشد چون خط Capacitor 8 است. هیچ نسخه Beta/Dev استفاده نشده است.
APIهای TypeScript پلاگین بین 7.0.0 و 7.0.3 یکسان‌اند (`definitions.d.ts` و `web.d.ts`
بدون تفاوت)؛ تغییرات فقط در لایه بومی است.

فایل‌های تغییرکرده: `package.json` و `package-lock.json` (فقط یک بسته). فایل‌های
`android/` تولیدشده و gitignored هستند و در مخزن تغییر نمی‌کنند.

**روش بازگشت:** کپی‌های قبل از تغییر در `%TEMP%\pass15-baseline\` نگهداری می‌شوند؛
`copy` آن‌ها روی `package.json`/`package-lock.json` و سپس `npm ci`. بازگشت به 7.0.0
دیتابیس را تغییر نمی‌دهد، چون فرمت فایل یکسان است (بخش ۲).

---

## ۲. تحلیل سازگاری دیتابیس

سه دلیل مستقل که ارتقا **نیازمند مهاجرت دیتابیس نیست**:

1. **فرمت فایل:** هر دو نسخه SQLCipher **4** هستند (رشته نسخه داخل `libsqlcipher.so`
   تأیید شد: `4.5.3` و `4.10.0`). فرمت ۴ شامل PBKDF2-HMAC-SHA512 با ۲۵۶۰۰۰ تکرار،
   صفحه ۴۰۹۶ بایتی و HMAC-SHA512 است. تغییر داخل خط 4.x فرمت فایل را عوض نمی‌کند.
2. **تنظیمات سفارشی:** در سورس بومی پلاگین هیچ `PRAGMA cipher_compatibility`،
   `kdf_iter` یا `cipher_page_size` وجود ندارد؛ هر دو نسخه فقط
   `openOrCreateDatabase(file, password, …)` را صدا می‌زنند و پیش‌فرض‌های SQLCipher 4
   را به ارث می‌برند.
3. **عبارت عبور:** فایل‌های `UtilsSecret.java`، `GlobalSQLite.java`،
   `CapacitorSQLite.java` و `UtilsEncryption.java` بین 7.0.0 و 7.0.3 **دقیقاً یکسان**
   هستند (diff خالی). Secret همچنان در `SharedPreferences` رمزنگاری‌شده با Android
   Keystore ذخیره می‌شود و `setEncryptionSecret` قبل از `open` اجرا می‌شود. فقط
   تبدیل `char[]→byte[]` در مسیرهای Import/Export به `getBytes(UTF_8)` تغییر کرده که
   برای عبارت عبور هگز ASCII همان بایت‌ها را تولید می‌کند.

نتیجه: انتظار می‌رود دیتابیس موجود با کلید موجود باز شود. این یک استدلال طراحی است،
نه تست اجرایی.

**رفتار در خطا:** `src/database/sqlite/database.ts` در `openDatabase` هنگام خطا فقط
`_db = null` و `closeConnection` انجام می‌دهد؛ فایل دیتابیس حذف یا بازسازی نمی‌شود.
پس اگر باز کردن با نسخه جدید شکست بخورد، داده روی دستگاه باقی می‌ماند و بازگشت به
نسخه قبلی امکان‌پذیر است.

---

## ۳. شواهد ۱۶ کیلوبایت (اجرا شد)

ابزار رسمی: `llvm-readelf` از NDK `28.2.13676358` و `zipalign -c -P 16` از
build-tools `36.1.0`.

| خروجی | نتیجه |
|---|---|
| `android-database-sqlcipher-4.5.3.aar` (چهار ABI) | `0x1000` — **FAIL** |
| `sqlcipher-android-4.10.0.aar` (چهار ABI) | `0x4000` — **OK** |
| `app-debug.apk` | چهار `.so` ذخیره‌نشده و هم‌تراز ۱۶ KB — OK |
| `app-release-unsigned.apk` | همان — OK |
| APK تولیدشده توسط bundletool 1.18.2 از AAB | `.so` هم‌تراز ۱۶ KB — OK |
| AAB داخلی | `.so` فشرده است؛ ملاک، APK تولیدشده از آن است |

هیچ کتابخانه بومی دیگری در پروژه وجود ندارد (هیچ‌یک از پلاگین‌های Capacitor فایل
`.so` ندارد)، بنابراین `libsqlcipher.so` تنها مورد بررسی است.

---

## ۴. هشت سناریوی الزامی روی دستگاه — **NOT RUN**

پیش‌نیاز: دستگاهی که نسخه فعلی (7.0.0) روی آن نصب شده و حداقل یک مشتری/نوبت واقعی
دارد؛ سپس APK نسخه جدید با **همان کلید امضا** روی آن نصب شود (بدون uninstall).

| # | سناریو | گام | نتیجه مورد انتظار |
|---|---|---|---|
| S1 | باز کردن دیتابیس قدیمی | نصب upgrade و اجرای برنامه | بدون خطای «file is not a database»؛ صفحه ورود/داشبورد رندر شود |
| S2 | خواندن ردیف‌های قدیمی | مشاهده مشتریان، نوبت‌ها، مالی | همان تعداد و همان مقادیر قبل از ارتقا |
| S3 | درج/به‌روزرسانی | افزودن مشتری و ویرایش نوبت | ذخیره موفق و قابل مشاهده پس از بازگشت |
| S4 | بستن/بازکردن | kill process و اجرای دوباره | داده‌ها باقی می‌مانند؛ migrationها دوباره اجرا نمی‌شوند |
| S5 | حفظ رمزنگاری | `run-as` و خواندن ۱۶ بایت اول فایل DB | هدر `SQLite format 3` نیست |
| S6 | تغییرنکردن کلید | بررسی `setEncryptionSecret` دوباره صدا زده نشود | خطای «a passphrase has already been set» رخ ندهد؛ Secret قبلی استفاده شود |
| S7 | بازیابی از پشتیبان | خروجی Export گرفته‌شده قبل از ارتقا را Import کن | همه ردیف‌ها بازگردند |
| S8 | شکست امن | باز کردن با Secret اشتباه (فقط در build تست) | خطا نمایش داده شود؛ فایل حذف/بازسازی نشود و پس از بازگرداندن Secret باز شود |

معیار قبولی: هر هشت سناریو PASS، و logcat بدون `FATAL EXCEPTION` مرتبط با
`libsqlcipher`/`net.zetetic`. تکرار همین مجموعه روی شبیه‌ساز با
`getconf PAGE_SIZE = 16384` توصیه می‌شود؛ در این محیط هیچ system image کامل و هیچ
دستگاهی موجود نبود، بنابراین هیچ‌کدام اجرا نشد.

---

## ۴-۱. پاس ۱۶ — نتیجه تلاش تأیید اجرایی (2026-11-14)

**نقطه شروع ثبت‌شده:** `HEAD = 28da1dd`، ۸۴ ورودی تغییر (۶۴ modified + ۲۰ untracked)،
۰ فایل staged. نسخه‌ها: `@capacitor-community/sqlite` 7.0.3 (declared = installed)،
`@capacitor/android` `^7.6.10`، `sql.js` 1.11.0، `@capacitor/core` `^7.2.0`.
هیچ commit/push/merge/reset/clean انجام نشد و baseline پاس ۱۵ بازگردانده نشد.

### الف) بازبینی استاتیک که در این پاس دوباره انجام شد

| بررسی | شاهد |
|---|---|
| هویت باینری داخل APK | sha256 چهار `.so` داخل `app-release-unsigned.apk` **دقیقاً برابر** AAR `sqlcipher-android-4.10.0` است: `bc8574…` (arm64-v8a)، `a3d6e1…` (armeabi-v7a)، `efd779…` (x86)، `482f62…` (x86_64). AAR قدیمی `android-database-sqlcipher-4.5.3` هش‌های متفاوت دارد: `c9bbfe…`، `976ae2…`، `f11a5c…`، `377775…` |
| هم‌ترازی ELF | `llvm-readelf -l` (NDK 28.2.13676358): بسته‌شده و 4.10.0 → `0x4000`؛ 4.5.3 → `0x1000` در هر چهار ABI |
| کلاس‌های داخل dex | در `classes.dex`/`classes3.dex` مجموعاً ۵۵ ارجاع به `Lnet/zetetic/database/sqlcipher/` و **صفر** ارجاع به `Lnet/sqlcipher/` |
| گراف وابستگی پاس ۱۵ | از intermediates همان build: `net.zetetic:sqlcipher-android:4.10.0@aar`، `androidx.room:room-runtime:2.6.1`، `androidx.sqlite:sqlite:2.4.0`، `androidx.security:security-crypto:1.1.0-alpha06`، `com.google.crypto.tink:tink-android:1.8.0`، `com.google.code.gson:gson:2.8.9`. هیچ `android-database-sqlcipher` در هیچ intermediate نیست |
| هم‌ترازی ZIP | `zipalign -c -P 16` روی debug APK، release APK و APK تولیدشده با bundletool → «Verification successful» (hash هر سه با پاس ۱۵ یکسان و بدون تغییر) |
| سورس پلاگین | `UtilsSecret.java` و `GlobalSQLite.java` بین 7.0.0 و 7.0.3 یکسان (diff خالی)؛ `Database.java` فقط import/API را از `net.sqlcipher` به `net.zetetic` برده و `openOrCreateDatabase(file, password, …)` بدون pragma سفارشی مانده است |
| ذخیره Secret | `SharedPreferences` با کلید `secret`؛ `setEncryptionSecret` اگر مقدار موجود باشد exception می‌دهد، یعنی ارتقا کلید را بازتولید نمی‌کند |
| مسیر فایل دیتابیس | `createConnection` نام را با `SQLite.db` پسوند می‌دهد → `/data/data/com.barberapp.app/databases/barber_appSQLite.db` |

> `./gradlew :app:dependencies --offline` شکست خورد: `No cached version of
> com.android.tools.build:gradle:8.11.1 available for offline mode`. این خودش نشان می‌دهد
> artifactهای پاس ۱۵ از repository آینه‌ای (خارج از `google()`) آمده‌اند و build مذکور
> official نیست.

### ب) سناریوهای S1–S8 — **BLOCKED**

هیچ‌کدام اجرا نشد. دلایل قابل‌بررسی:

- `adb devices -l` خالی است؛ هیچ دستگاه فیزیکی متصل نیست.
- هیچ فایل `*.db`/`*.sqlite`/`*.sqlite3` در مخزن، `Documents`، `Desktop` یا `Downloads`
  یافت نشد؛ `%USERPROFILE%\barber-backup` وجود ندارد؛ هیچ AVD هم وجود ندارد.
- نسخه 7.0.0 هرگز در این محیط نصب نشده است، پس **هیچ دیتابیس واقعیِ قدیمی** برای کپی
  disposable وجود ندارد.
- طبق الزام پاس، ساخت دیتابیس جدید و نامیدن آن «دیتابیس نسخه قدیم» مجاز نیست؛ بنابراین
  PASS/FAIL جعلی ثبت نشد.

برای رفع این blocker، مالک باید یکی از این دو را فراهم کند: (۱) یک کپی disposable از
`barber_appSQLite.db` ساخته‌شده با 7.0.0 **همراه با Secret همان دستگاه**، یا (۲) دسترسی
به دستگاهی که نسخه منتشرشده روی آن نصب و حاوی داده واقعی است. Secret در
`SharedPreferences` دستگاه است؛ کپی تنها فایل DB برای بازیابی کافی نیست.

### ج) اجرای ۱۶ کیلوبایت — **BLOCKED**

- `adb devices` خالی؛ هیچ دستگاه ۱۶ KB موجود نیست.
- `system-images/**` فقط ۲۵ فایل دارد و همه `.installer/.installData` هستند؛
  تعداد `system.img` = **۰**. `avdmanager list avd` خالی است.
- `android-36/google_apis_ps16k/x86_64` فقط یک placeholder خالی است و نصب نشده.
- `https://dl.google.com/android/repository/repository2-3.xml` و `sys-img2-3.xml` → **404**،
  پس `sdkmanager` هم نمی‌تواند image نصب کند.
- نتیجه: هیچ اجرای runtime روی ۱۶ KB انجام نشد. هم‌ترازی ELF/ZIP شاهد بسته‌بندی است،
  نه شاهد اجرا؛ از آن برای نتیجه‌گیری runtime استفاده نمی‌شود.

### د) build رسمی — **BLOCKED**

- `https://dl.google.com/dl/android/maven2/...` برای AGP 8.11.1، `master-index.xml`،
  AndroidX و `google-services:4.4.2` → **404**؛ `maven.google.com` هم به همان میزبان
  ۴۰۴ ریدایرکت می‌شود. Maven Central این artifactها را ندارد.
- در این پاس **هیچ build جدیدی** انجام نشد و هیچ mirror/init-script به کار نرفت. artifactهای
  موجود (پاس ۱۵) صرفاً بازبینی شدند و «official» اعلام نمی‌شوند.

### ه) امضا و Supabase

- هیچ `keystore.properties` و هیچ `*.jks`/`*.keystore` در مخزن نیست؛ بلوک
  `release-signing` فقط وقتی فعال می‌شود که فایل properties موجود باشد. در این پاس
  keystore ساخته/جایگزین نشد و هیچ رمز یا کلیدی چاپ نشد. بدون تأیید صریح مالک، ساخت
  keystore انجام نمی‌شود.
- `RLS_STAGING_PROJECT_REF`، `SUPABASE_ACCESS_TOKEN` و `SUPABASE_DB_PASSWORD` تنظیم
  نشده‌اند و فرم تأیید مالک (`docs/13`) امضا نشده است. هیچ عملیات remote روی Supabase
  انجام نشد و `.env.local` به‌عنوان staging فرض نشد.

### و) گیت‌های رگرسیون (همین پاس)

`type-check` ✓، `lint` ✓، `format:check` ✓، `vitest` **383/383 در 52 فایل** ✓،
`build` ✓ (۰ فایل `.map`، `dist` = 2.2 MB)، `npm audit --omit=dev` **0**،
`npm audit` کامل ۷ moderate صرفاً dev-only.

---

## ۵. طراحی Export/Import رمزنگاری‌شده و Recovery (فقط طراحی — پیاده‌سازی نشده)

> در نسخه فعلی هیچ قابلیت پشتیبان‌گیری در برنامه وجود ندارد. این بخش طراحی
> contingency است، نه رفتار موجود.

**هشدار:** از `exportToJson(mode, true)` پلاگین به‌عنوان پشتیبان امن استفاده نکنید.
`UtilsEncryption.java` از Salt ثابت (`jeep_capacitor_sqlite`) و IV ثابت (۱۲ بایت اول
همان Salt) با AES-GCM استفاده می‌کند؛ یعنی برای یک عبارت عبور ثابت، IV در همه
Exportها تکرار می‌شود. این نقض الزام یکتایی nonce در GCM است. این کد امروز فراخوانی
نمی‌شود، اما استفاده از آن برای پشتیبان واقعی ناامن است (TD-24).

طراحی پیشنهادی در صورت نیاز به پشتیبان قبل از ارتقا:

1. `exportToJson('full')` بدون رمزنگاری داخلی، سپس رمزنگاری در لایه اپ با
   AES-256-GCM و **Salt تصادفی ۱۶ بایتی و IV تصادفی ۱۲ بایتی برای هر فایل**؛
   فرمت: `version || salt || iv || ciphertext+tag`.
2. ذخیره در حافظه خصوصی اپ با `Filesystem` یا اشتراک‌گذاری صریح توسط کاربر.
3. راستی‌آزمایی فوری: Import در یک دیتابیس موقت و مقایسه تعداد ردیف‌های ۱۲ جدول.
4. فقط پس از موفقیت، مهاجرت/ارتقا ادامه یابد؛ در غیر این صورت به کاربر هشدار داده شود.
5. Recovery: اگر build جدید دیتابیس را باز نکرد، فایل DB حذف نشود؛ کاربر یا پشتیبان
   را Import کند یا APK نسخه قبلی با همان کلید امضا نصب شود. کلید SQLCipher در
   Keystore دستگاه است و کپی صرف فایل DB برای بازیابی روی دستگاه دیگر کافی نیست.

---

## ۶. دروازه انتشار

- [x] ارتقا به نسخه پایدار 7.0.3 و `sqlcipher-android:4.10.0`
- [x] اثبات `p_align = 0x4000` برای هر چهار ABI و هم‌ترازی ZIP در APK/AAB تولیدی
- [x] ساخت AAB (بدون امضای انتشار — keystore موجود نیست)
- [x] تأیید مجدد هویت باینری بسته‌شده در پاس ۱۶ (sha256 داخل APK = AAR 4.10.0)
- [ ] اجرای هشت سناریوی بخش ۴ روی دستگاه با دیتابیس نسخه قبلی — **BLOCKED:** هیچ دیتابیس
      ساخته‌شده با 7.0.0 و هیچ دستگاه متصل موجود نیست (§۴-۱-ب)
- [ ] اجرا روی دستگاه/شبیه‌ساز ۱۶ کیلوبایتی و تأیید نبود کرش بومی — **BLOCKED:** هیچ
      system image قابل‌بوت و هیچ دستگاه ۱۶ KB موجود نیست؛ مخزن SDK هم 404 می‌دهد (§۴-۱-ج)
- [ ] بازسازی با Google Maven رسمی و امضای AAB با کلید انتشار — **BLOCKED:** Google Maven
      در دسترس نیست و مالک هنوز keystore/تأییدیه نداده است (§۴-۱-د، §۴-۱-ه)
