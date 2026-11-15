# چک‌لیست تست و انتشار مستقیم

Baseline: `57995a5` · شاخه طراحی: `release/direct-distribution-2026-11-14` · تاریخ: ۲۰۲۶-۱۱-۱۴

وضعیت ستون‌ها: `[ ]` اجرانشده · `[x]` انجام‌شده · `BLOCKED` پیش‌نیاز بیرونی

---

## ۰. قواعد انتشار

- [ ] مخزن سورس **خصوصی** است (در حال حاضر عمومی است — انحراف Baseline).
- [ ] Environment protection (Required reviewers) با پلن فعلی GitHub واقعاً قابل استفاده است؛
      در غیر این صورت مسیر انتشار دستی فعال شده است.
- [ ] همهٔ Gateهای Android یا iOS مستقل از دیگری PASS شده باشند.
- [ ] هیچ تست اجرانشده‌ای PASS ثبت نشود.
- [ ] امضا با همان کلید نسخهٔ قبلی انجام شود.
- [ ] Checksum همراه Artifact منتشر شود.
- [ ] تأیید مالک برای Release/Upload ثبت شده باشد.
- [ ] هیچ Secret در مخزن عمومی یا Log نباشد.

---

## ۱. Android — GitHub Releases

### ۱.۱. پیش‌نیاز مالک

- [ ] Repository variable `RELEASE_REPO` تنظیم شد (مخزن عمومی انتشار).
- [ ] Environment `release-approval` با Required reviewer ساخته شد.
- [ ] `ENABLE_AUTO_PUBLISH` فقط در صورت انتشار خودکار `true` شد.
- [ ] Keystore ساخته و پشتیبان‌گیری شد (`docs/18-release-secrets.md`).
- [ ] چهار Secret امضا ثبت شد.
- [ ] `ANDROID_CERT_SHA256` ثبت شد.
- [ ] `RELEASE_REPO_TOKEN` با دسترسی محدود ثبت شد.
- [ ] اجرای Workflow مجاز شد (push/dispatch نیازمند اجازهٔ صریح).

### ۱.۲. پیش از Build

- [x] تزریق نسخه در `android/app/build.gradle` اعمال شد (Guard در Workflow، تأیید CI: NOT RUN).
- [ ] `versionCode` بزرگ‌تر از آخرین انتشار است (بررسی خودکار Workflow).
- [ ] Preflight Google Maven روی Runner واقعاً 200 برگرداند (**NOT TESTED**).
- [ ] `RELEASE_REPO` وجود دارد و از Runner قابل خواندن است (**NOT TESTED**).

### ۱.۳. پس از Build

- [ ] `apksigner verify` = `Verifies` و Fingerprint مطابق انتظار.
- [ ] `zipalign -c -P 16 4` = PASS.
- [ ] `llvm-readelf` برای همهٔ `.so`ها `LOAD p_align ≥ 0x4000` را تأیید کرد.
- [ ] ۴ ABI و `libsqlcipher.so` موجود و هش آن با AAR `4.10.0` برابر است.
- [ ] `aapt2` نسخه/بسته/SDK را تأیید کرد.
- [ ] اسکن Secret داخل APK خالی بود.
- [ ] `SHA256SUMS` ساخته شد.
- [ ] گزارش اعتبارسنجی در Artifact است.
- [ ] APK روی دستگاه واقعی نصب و اجرا شد. **NOT RUN**
- [ ] S1–S8 روی دستگاه ۱۶KB اجرا شد. **NOT RUN**
- [ ] `getconf PAGE_SIZE` = 16384 و عملکرد DB رمزنگاری‌شده روی همان دستگاه تأیید شد. **NOT RUN**
- [ ] تست عملکرد/آفلاین/deep link/backup/امنیت اجرا شد. **NOT RUN**

### ۱.۴. انتشار

- [ ] Release با Tag `v<versionName>` در مخزن B ساخته شد.
- [ ] APK + `SHA256SUMS` + گزارش پیوست شد.
- [ ] Release Notes شامل `versionCode:` است (برای کنترل یکنواختی بعدی).
- [ ] راهنمای نصب/ارتقا و سازگاری نوشته شد.
- [ ] لینک Release در گزارش ثبت شد.

---

## ۲. iOS — TestFlight

### ۲.۱. پیش‌نیاز مالک

- [ ] Apple Developer Program فعال است.
- [ ] App ID و App record برای `com.barberapp.app` ساخته شد.
- [ ] گواهی Distribution و پروفایل App Store صادر شد.
- [ ] App Store Connect API Key ساخته شد.
- [ ] ۹ Secret در Environment `ios-testflight` ثبت شد.
- [ ] Environment با Required reviewer تنظیم شد (یا مسیر تأیید جایگزین مستند شد).
- [ ] Scheme اشتراکی `App.xcscheme` در مخزن commit شد (الزام فعلی).
- [ ] `ios/App/Podfile.lock` در مخزن commit شد (الزام فعلی).
- [ ] Privacy Manifest و Required-Reason APIها بررسی و تصمیم‌گیری شد.
- [ ] پاسخ Export Compliance (`ITSAppUsesNonExemptEncryption`) توسط مالک تعیین شد.

### ۲.۲. پس از Build

- [ ] Xcode 26.6 واقعاً انتخاب شد (`xcodebuild -version`).
- [ ] `pod install --deployment` موفق بود.
- [ ] Privacy Manifestها Audit شدند.
- [ ] Export Compliance پاسخ داده شد (تصمیم مالک).
- [ ] Archive و Export موفق بودند.
- [ ] امضای IPA، Bundle ID و Build/Version داخل IPA تأیید شد.
- [ ] آپلود به TestFlight با پرچم پشتیبانی‌شدهٔ `altool` موفق بود. **NOT TESTED**
- [ ] نصب از TestFlight روی دستگاه واقعی. **NOT RUN**
- [ ] ورود/مشتریان/خدمات/نوبت/مالی/دیتابیس/همگام‌سازی. **NOT RUN**
- [ ] Keychain/Secure Storage و آفلاین/reconnect. **NOT RUN**

---

## ۳. Backend Staging

- [ ] تأیید کتبی مالک برای ایجاد/استفاده از Staging مستقل.
- [ ] پروژه Staging جدا از Production ساخته شد (توسط مالک).
- [ ] `legacy_ownership_mismatches.sql` خروجی خالی داد.
- [ ] migrationها دوبار بدون خطا اجرا شدند.
- [ ] `verify_release_schema.sql` موفق بود.
- [ ] RLS با دو کاربر PASS شد.
- [ ] REST/Storage با دو نشست مستقل PASS شد.
- [ ] Sync دو دستگاه + آفلاین + retry + تداخل PASS شد.
- [ ] هیچ دسترسی متقابل آرایشگاه‌ها مشاهده نشد.
- [ ] شواهد بدون PII ثبت شد.

> اعتبارسنجی محلی (نه Staging) انجام شده است: مهاجرت‌ها دوبار، `verify_release_schema`،
> صفر بودن `legacy_ownership_mismatches` و **RLS دو کاربره** روی PostgreSQL 17 درون‌فرایندی
> (PGlite) PASS شد. این بندها همچنان برای **Staging میزبان** باز هستند. جزئیات: `docs/20` §۱۰.

---

## ۴. وضعیت فعلی (شواهد)

| مورد | وضعیت |
|---|---|
| مخزن سورس | **انحراف Baseline** — عمومی است؛ باید Private شود |
| Workflow اندروید | دو حالته شد: `verification` (بدون Secret، بدون امضا، هرگز منتشر نمی‌شود) و `release` (فقط با مخزن خصوصی + Secretهای مالک + Fingerprint)؛ Gateهای JDK 21، Preflight چهار Artifact گوگل، و حضور Camera/Filesystem در Gradle و Dex؛ YAML اعتبارسنجی محلی PASS؛ **اجرا نشده** |
| Workflow iOS | اصلاح شد؛ YAML اعتبارسنجی محلی PASS؛ **اجرا نشده** |
| فایل‌های تولیدشدهٔ Android | همگام با `package.json` (۹ پلاگین) و `cap sync` تکرارپذیر؛ بدون Commit |
| APK تأیید Pipeline (محلی) | شاهد ابزاری: امضا، zipalign 16K، ELF `0x4000`، ABIها، AAR 4.10.0 — اما **`CameraPlugin`/`FilesystemPlugin` در Dex غایب** و کلید موقت حذف‌شده؛ **قابل انتشار نیست** |
| Build تمیز بدون Cache | **BLOCKED** — `dl.google.com/**` از این شبکه ۴۰۴ می‌دهد (AGP، material، activity-ktx) |
| Google Maven از Runner | **NOT TESTED** (نیازمند push/dispatch) |
| APK امضاشدهٔ انتشار | **BLOCKED** (keystore مالک + Secretها + CI) |
| GitHub Release | **NOT RUN** |
| iOS Shared Scheme | **انجام شد** (`App.xcscheme`) |
| `Podfile.lock` | **BLOCKED** — فقط روی macOS |
| TestFlight | **BLOCKED** (حساب/گواهی/پروفایل/Podfile.lock) |
| Staging/RLS/Sync میزبان | **BLOCKED** — RLS محلی روی PG17 (PGlite) **PASS** |
| تست دستگاه اندروید/iOS | **NOT RUN** — بدون System Image/دستگاه |

---

## ۵. معیارهای اعلام وضعیت

| وضعیت | شرط |
|---|---|
| `BLOCKED` | پیش‌نیاز بیرونی (حساب، شبکه، دستگاه، secret) موجود نیست |
| `READY FOR TESTING` | Build روی CI موفق و Artifact معتبر، ولی تست دستگاه انجام نشده |
| `READY FOR DIRECT DISTRIBUTION` (Android) | Build رسمی + امضا + Verifyها + تست دستگاه/S1–S8 + Release آماده |
| `READY FOR APPROVED DISTRIBUTION METHOD` (iOS) | Archive/Export + آپلود TestFlight + تست دستگاه + Compliance |

در این مرحله هیچ‌کدام از دو وضعیت آخر حاصل نشده است.
