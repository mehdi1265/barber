# FINAL OWNER ACTION CHECKLIST

> فقط کارهایی که **بدون تصمیم/محیط مالک** قابل انجام نیستند. هر مورد شامل «چرا»، «چه چیزی لازم است»
> و «اثر» است. جزئیات فنی در [`FINAL_PROJECT_HANDOVER.md`](./FINAL_PROJECT_HANDOVER.md).

## ۱. تصمیم‌های حقوقی / محصولی (بدون کد)

- [ ] **`ITSAppUsesNonExemptEncryption`** — مقدار درست را برای SQLCipher تأیید کنید
      (حقوقی/مشاور). تا آن زمان `Info.plist` عمداً بدون این کلید است.
- [ ] **Export Compliance** اپل و در صورت نیاز self-classification برای SQLCipher.
- [ ] **Privacy Nutrition Labels** و بازبینی required-reason APIها
      (`PrivacyInfo.xcprivacy` در سطح اپ ساخته نشده).
- [ ] تصمیم دربارهٔ **deep link عمومی** `barberapp://reset-password` (OTP مسیر اصلی است؛
      این scheme را هر اپی می‌تواند ثبت کند).
- [ ] تصمیم دربارهٔ ادامهٔ **web** به‌عنوان دمو/دِو یا حذف آن (ذخیره‌سازی web ephemeral است).

## ۲. مخزن (Git)

- [x] پروژه‌های native همراه نسخهٔ نهایی commit شدند: `ce31e30` روی `develop`
      (۱۶۴ فایل؛ ۶۹ فایل native). هیچ push در این پاس انجام نشد.
- [x] تأیید شد که `android/local.properties`، `*.jks`، `keystore.properties`، `.env*`،
      `Pods` و خروجی‌های build خارج از مخزن هستند.
- [ ] تصمیم مالک دربارهٔ push شاخهٔ `develop` به مخزن راه‌دور (در این پاس انجام نشد).

## ۳. Android — انتشار

- [ ] دسترسی به **Google Maven رسمی** (یا شبکهٔ مجاز) برای build رسمی؛ در این محیط
      `dl.google.com` برای AGP و `master-index.xml` پاسخ 404 می‌دهد.
- [ ] ساخت **release keystore** و پر کردن `android/keystore.properties` (محلی، هرگز در Git).
      هیچ keystore‌ای در این پاس ساخته نشد.
- [ ] تصمیم دربارهٔ **Play App Signing**.
- [ ] تأمین **دستگاه Android 15/16** یا ایمیج 16 KB برای اجرای runtime؛ `adb devices` خالی است.
- [ ] اجرای ۸ سناریوی مهاجرت SQLCipher (`docs/16-android-sqlcipher-migration.md`) روی کپی
      disposable از دیتابیس ساخته‌شده با 7.0.0.
- [ ] پس از build رسمی: `apksigner verify`، `zipalign -c -P 16`، نصب و smoke test.
- [ ] آپلود AAB (بنر: آرتیفکت‌های موجود verification-grade هستند و نباید آپلود شوند).

## ۴. iOS — انتشار

- [ ] دسترسی به **Mac + Xcode 15/16 + CocoaPods**.
- [ ] انتخاب **DEVELOPMENT_TEAM** و bundle id نهایی در Xcode.
- [ ] `pod install --repo-update` و تأیید سه pod اضافه‌شده.
- [ ] Run روی دستگاه، سپس Archive و آپلود به App Store Connect.
- [ ] پاسخ Export Compliance (بند ۱).

## ۵. Supabase / Backend

- [ ] تأسیس **Staging مستقل** و تأیید کتبی مالک (فرم `docs/13-release-owner-approval.md`).
- [ ] اجرای migrationهای `supabase/migrations/*.sql` دو بار (idempotency) روی Staging.
- [ ] اجرای probe اختیاری REST/Storage در `docs/11-release-runbook.md` §3.3.
- [ ] تست دو دستگاه برای tombstone/همگام‌سازی (TD-21 residual).
- [ ] تنظیم مقادیر واقعی `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY` در محیط build
      (هرگز `sb_secret_*` یا service-role).

## ۶. کیفیت و نگهداری

- [ ] فعال‌سازی **CodeQL/secret scanning** در GitHub (TD-19؛ Dependabot فعال است).
- [ ] تصمیم دربارهٔ پیاده‌سازی **i18n** (TD-16) و **pagination** (TD-17/BUG-34) — post-MVP.
- [ ] بررسی دوره‌ای TD-24 پیش از هر قابلیت Backup/Export.
