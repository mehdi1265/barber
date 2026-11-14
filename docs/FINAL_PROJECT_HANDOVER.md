# FINAL PROJECT HANDOVER — Barber App

> تاریخ: 2026-11-14 · پاس پایانی (هجدهم) · وضعیت: **توسعهٔ قابل‌انجام تمام شد؛ انتشار متوقف بر محیط و تصمیم مالک است.**

این سند نقطهٔ ورود هر توسعه‌دهنده/مالک جدید است. برای وضعیت دقیق باگ‌ها و بدهی‌ها به
[`audit/BUGS_AND_TECHNICAL_DEBT.md`](../audit/BUGS_AND_TECHNICAL_DEBT.md) و برای اقدام‌های مالک به
[`FINAL_OWNER_ACTION_CHECKLIST.md`](./FINAL_OWNER_ACTION_CHECKLIST.md) مراجعه کنید.

---

## ۱. وضعیت تحویل در یک نگاه

| حوزه | وضعیت | شاهد |
|---|---|---|
| Source + تست‌ها | ✅ کامل و سبز | 403/403 تست در 52 فایل؛ type-check/lint/format/build سبز |
| Web/dev build | ✅ | `dist` = 2.2 MB، صفر source map، `npm run dev` مسیر ورود `src/main.tsx` |
| Android — کد و تنظیمات | ✅ آماده | targetSdk/compileSdk 36، AGP 8.11.1، Gradle 8.14، SQLCipher 4.10.0 |
| Android — آرتیفکت | ⚠️ فقط verification-grade | AAB/APK بدون امضا و ساخته‌شده با mirror؛ قابل آپلود نیست |
| Android — runtime | ❌ NOT RUN | بدون دستگاه؛ بدون system image؛ Google Maven 404 |
| iOS — پروژه | ✅ استاتیک کامل | Podfile، Info.plist، Xcode project، AppDelegate، assets |
| iOS — build | ❌ NOT RUN | میزبان ویندوز؛ بدون Xcode/CocoaPods |
| Backend/Supabase | ⚠️ فقط CI/DB-level | RLS روی PostgreSQL 15 در CI؛ هیچ اجرای hosted انجام نشد |
| انتشار | ❌ BLOCKED | keystore، Mac، Staging و 16 KB runtime در دسترس نیست |

---

## ۲. اجرای سریع (Web)

```bash
npm ci
cp .env.example .env      # مقادیر پروژهٔ خودتان را بگذارید
npm run dev
```

گیت‌های اجباری پیش از هر تحویل:

```bash
npm run type-check && npm run lint && npm run format:check
npx vitest run
npm run build
npm audit --omit=dev
```

---

## ۳. Git — چه چیزی باید در مخزن باشد

- شاخهٔ جاری تحویل: `develop` روی `28da1dd` (هیچ commit جدیدی در این پاس ساخته نشد).
- **تغییر مهم این پاس:** `android/` و `ios/` دیگر به‌صورت کامل ignore نمی‌شوند. علت ignore قبلی
  این بود که Capacitor این پوشه‌ها را تولید می‌کند و در T02 بدون تصمیم صریح نادیده گرفته شدند.
  نتیجه: هیچ‌کس نمی‌توانست از مخزن بیلد بگیرد، چون manifest سخت‌شده، Info.plist فارسی، Podfile و
  تنظیمات امضا فقط روی این دستگاه بودند.
- اکنون ۶۹ فایل دست‌نویس native قابل‌ردیابی شده‌اند (`git status --porcelain -uall | grep '^?? \(android\|ios\)/'`).
  هنوز **stage/commit نشده‌اند** — مالک باید بازبینی و commit کند.

### فایل‌های ضروری Android (باید در مخزن باشند)

| مسیر | نقش |
|---|---|
| `android/settings.gradle`, `build.gradle`, `variables.gradle`, `gradle.properties`, `capacitor.settings.gradle` | پیکربندی Gradle و نسخه‌ها |
| `android/gradle/wrapper/{gradle-wrapper.jar,gradle-wrapper.properties}`, `gradlew`, `gradlew.bat` | قفل Gradle 8.14 |
| `android/app/build.gradle`, `app/capacitor.build.gradle`, `app/proguard-rules.pro` | بیلد اپ و pluginها |
| `android/app/src/main/AndroidManifest.xml` | `allowBackup=false`، `dataExtractionRules`، deep link |
| `android/app/src/main/res/xml/data_extraction_rules.xml` | قاعدهٔ backup اندروید ۱۲+ |
| `android/app/src/main/java/com/barberapp/app/MainActivity.java` | نکتهٔ ورود Capacitor |
| `android/app/src/main/res/**` | آیکن/اسپلش/تم/رشته‌ها |

### فایل‌های ضروری iOS

| مسیر | نقش |
|---|---|
| `ios/App/Podfile` | iOS 14.0 + Capacitor/Camera/Filesystem/SQLite/SecureStorage/... |
| `ios/App/App/Info.plist` | usage descriptionهای فارسی، scheme `barberapp` |
| `ios/App/App.xcodeproj/project.pbxproj` | bundle id، deployment target، version |
| `ios/App/App/AppDelegate.swift`, `Base.lproj/*`, `Assets.xcassets/**`, `config.xml` | اجرا و دارایی‌ها |

### چه چیزی عمداً در Git نیست

`node_modules/`, `dist/`, `android/build`, `android/app/build`, `android/.gradle`,
`android/local.properties`, `android/app/src/main/assets/public`,
`android/capacitor-cordova-android-plugins`, `android/app/src/main/assets/capacitor*.json`,
`ios/App/Pods`, `ios/App/App/public`, `ios/App/App/capacitor.config.json`,
`ios/capacitor-cordova-ios-plugins`, `*.jks`, `*.keystore`, `keystore.properties`, `.env*`, `coverage/`.

> `ios/App/App/public` فعلاً نسخهٔ قدیمی (5.2 MB) است. روی Mac پیش از build با
> `npm run cap:build` دوباره ساخته/کپی می‌شود.

### ۳.۱ آیا یک کلون تمیز از مخزن Build می‌شود؟

**نه، تا زمانی که تغییرات فعلی commit نشوند.** `HEAD = 28da1dd` قدیمی است و یک clone تازه
این موارد را ندارد:

- **۷۰ فایل modified** (کد اپ، تست‌ها، migrationها، CI، مستندات) — هستهٔ نسخهٔ فعلی.
- **فایل‌های untracked ضروری:**
  - `src/database/migrations/005_outbox_user_scope.sql` و `006_sync_cursor_user.sql`
  - `src/features/settings/local-data.ts`
  - `supabase/migrations/004_same_user_ownership.sql` و `005_sync_tombstones.sql`
  - `supabase/tests/legacy_ownership_mismatches.sql` و `verify_release_schema.sql`
  - تست‌های `account-isolation.integration`, `appointments.schemas`, `local-data-wipe`,
    `rls-check-guard`, `settings-local-data`, `sqlite-migrations`, `sync.reconcile`
  - مستندات `docs/12`–`docs/16`، `docs/FINAL_*`، `NEXT_STEPS.md`
  - کل `android/` و `ios/` (۶۹ فایل دست‌نویس)
- روی clone بدون این‌ها: تست migration-runner شکست می‌خورد، `local-data` تست ندارد،
  امضای/تنظیمات native وجود ندارد و build فروشگاه ممکن نیست.

پس از commit، یک ماشین دیگر با `npm ci` + `.env` + (برای Android) keystore + دسترسی
Google Maven، و (برای iOS) macOS/Xcode/CocoaPods می‌تواند build کند.

---

## ۴. Android — وضعیت نهایی

- **تنظیمات:** package `com.barberapp.app`، versionName 1.0، versionCode 1، target/compile 36، minSdk 23.
- **Manifest (بازرسی APK):** `allowBackup=false`، `fullBackupContent=false`، `dataExtractionRules`،
  بدون `debuggable`، فقط deep link `barberapp://reset-password`؛ FileProvider غیرقابل export.
- **SQLCipher:** plugin 7.0.3 → `net.zetetic:sqlcipher-android:4.10.0`. چهار `libsqlcipher.so` داخل
  APK بایت‌به‌بایت برابر AAR است (پاس ۱۶). پیکربندی: `androidIsEncryption: true`.
- **۱۶ KB:**
  - **باینری: PASS** — `zipalign -c -P 16` روی release APK موفق؛ `llvm-readelf` برای
    `lib/arm64-v8a/libsqlcipher.so` مقدار `p_align = 0x4000` نشان می‌دهد.
  - **runtime: NOT RUN** — `adb devices` خالی، `system.img` = ۰، `dl.google.com` برای AGP و
    `master-index.xml` پاسخ 404 می‌دهد. **TD-22 باز است.**
- **امضا:** هیچ `*.jks`/`keystore.properties` وجود ندارد؛ `apksigner verify` روی APK می‌گوید
  `DOES NOT VERIFY`. AAB هم بدون امضا است.
- **آرتیفکت‌ها:** `app-debug.apk` (`a25f032f…`)، `app-release-unsigned.apk` (`c6b28d3a…`)،
  `app-release.aab` (`90a1878d…`). این‌ها با dependencyهای mirror ساخته شده‌اند و
  **verification-grade** هستند؛ نباید آپلود شوند. `index-DJ8xT4BC.js` داخل APK با `dist` یکسان است
  (`1f6141…`).

### مسیر انتشار Android (روی ماشینی با دسترسی Google Maven)

1. `npm ci`
2. `npm run build && npx cap copy android`
3. یک `keystore` بسازید و `android/keystore.properties` را از قالبی که در
   `docs/11-release-runbook.md` §6.4 آمده پر کنید (هیچ رمزی در مخزن نگذارید).
4. `cd android && ./gradlew bundleRelease` (از Google Maven رسمی)
5. `apksigner verify --print-certs` روی خروجی و `zipalign -c -P 16`؛ سپس آپلود به Play
   (Play App Signing توصیه می‌شود).
6. تست نصب روی دستگاه Android 15/16 و اجرای ۸ سناریوی مهاجرت SQLCipher از
   `docs/16-android-sqlcipher-migration.md`.

---

## ۵. iOS — راهنمای کامل Build روی Mac

### پیش‌نیازها

macOS 14+، Xcode 15/16+، Command Line Tools، CocoaPods 1.15+، Node 24، Apple Developer Team.

### مراحل

1. `npm ci && npm run build`
2. `npx cap sync ios` — باید سه pod اضافه‌شده (`CapacitorCamera`, `CapacitorFilesystem`,
   `AparajitaCapacitorSecureStorage`) را در lockfile ببینید.
3. `cd ios/App && pod install --repo-update`
4. `npx cap open ios`
5. در Xcode: target **App** → Signing & Capabilities → Team خود را انتخاب کنید و
   bundle id را در صورت نیاز عوض کنید (`com.barberapp.app` فعلی).
6. Version = 1.0، Build = 1 (در `project.pbxproj`).
7. یک دستگاه/شبیه‌ساز iOS 14+ انتخاب و Run کنید؛ دوربین، گالری، اعلان و Keychain را تست کنید.
8. Archive → Distribute App.
9. در App Store Connect، پاسخ `ITSAppUsesNonExemptEncryption` را **پس از تصمیم حقوقی مالک**
   بدهید (در `Info.plist` عمداً غایب است).
10. Privacy: مصرف APIهای required-reason را بازبینی کنید؛ Capacitor خودش manifest دارد ولی
    app-level `PrivacyInfo.xcprivacy` ساخته نشده است.

### وضعیت فعلی iOS (استاتیک)

| مورد | وضعیت |
|---|---|
| Podfile | ✅ همهٔ pluginهای نصب‌شده (SQLite، Camera، Filesystem، SecureStorage، ...) |
| Deployment target | 14.0 (Podfile + project) |
| Info.plist | NSCameraUsageDescription و NSPhotoLibraryUsageDescription فارسی؛ scheme `barberapp` |
| SQLCipher | `iosIsEncryption: true`، Keychain prefix `barber-app` |
| Signing | ❌ `DEVELOPMENT_TEAM` تعیین نشده (نیازمند اپل‌آیدی مالک) |
| Build/Archive | ❌ NOT RUN — بدون macOS/Xcode |

---

## ۶. امنیت و داده

- هیچ Secret در مخزن/باندل نیست: فقط `.env.example` ردیابی می‌شود؛ باندل فقط
  `sb_publishable_*` دارد (صفر `sb_secret_*`).
- Session در native با `@aparajita/capacitor-secure-storage` (Keychain/Keystore) و در web با
  localStorage (فقط dev، D-21).
- دیتابیس موبایل با SQLCipher رمز می‌شود؛ کلید در SharedPreferences/Keychain نگهداری می‌شود و
  backup سیستم غیرفعال است.
- TD-24: helper رمزنگاری export در plugin salt/IV ثابت دارد، اما **هیچ مسیر اجرایی در اپ آن را
  صدا نمی‌زند**؛ پیش‌شرط هر قابلیت Backup مستند شده است.

---

## ۷. بدهی‌های باقی‌مانده (خارج از کد برنامه)

| مورد | چرا باز است | مالک |
|---|---|---|
| TD-22 — اجرای 16 KB | بدون دستگاه/ایمیج؛ binary پاس است | محیط تست |
| TD-18 — pipeline انتشار | پروژه‌ها موجودند، اما CI/CD و امضا نیست | مالک |
| TD-19 — CodeQL/secret scanning | فقط Dependabot فعال است | مالک |
| RLS hosted | CI فقط PostgreSQL؛ Staging تأییدنشده | مالک |
| iOS export compliance | تصمیم حقوقی | مالک |

---

## ۸. قواعد ادامهٔ کار

- هیچ commit/push بدون اجازهٔ صریح.
- هیچ Production/Staging بدون تأیید کتبی.
- هیچ حذف دیتابیس واقعی یا جایگزینی آن با دیتابیس جدید.
- تست اجرانشده را PASS اعلام نکنید؛ از برچسب `NOT RUN`/`BLOCKED` استفاده کنید.
