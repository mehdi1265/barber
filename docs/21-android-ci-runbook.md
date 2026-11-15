# Runbook — اجرای Android Build روی GitHub Actions

این سند فقط دستورها و پیش‌نیازهای اجرا را ثبت می‌کند. **هیچ‌کدام از این دستورها اجرا نشده‌اند**؛
اجرای Workflow نیازمند Push و تأیید مالک است.

- Branch کاری: `release/direct-distribution-2026-11-14` (HEAD محلی: `57995a5`)
- Workflow: `.github/workflows/android-release.yml`
- Trigger: فقط `workflow_dispatch`
- `permissions`: `contents: read`

**وضعیت تأییدشدهٔ مخزن (۲۰۲۶-۱۱-۱۴، از GitHub API):**

| مورد | مقدار | اثر |
|---|---|---|
| `mehdi1265/barber` | `private: false` / `visibility: public` | حالت `release` فعلاً **BLOCKED** است؛ فقط `verification` مجاز |
| `mehdi1265/barber-releases` | ۴۰۴ (وجود ندارد) | `RELEASE_REPO` هنوز ساخته نشده |
| Release/Tag موجود | هیچ (count=0) | بررسی یکنواختی نسخه اجازهٔ اولین انتشار را می‌دهد |
| آخرین CI سبز | `28da1dd` روی `develop` (RLS job: ۱۰/۱۰) | برای مجموعهٔ فعلی Migrationها (۰۰۴/۰۰۵) اجرا نشده است |

---

## ۱. دو حالت Build

| | `buildMode: verification` | `buildMode: release` |
|---|---|---|
| Secret لازم | هیچ | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |
| Repository variable لازم | هیچ | `RELEASE_REPO`, `ANDROID_CERT_SHA256` |
| پیش‌نیاز مخزن | عمومی یا خصوصی | **خصوصی** (وگرنه BLOCKED) |
| Gradle cache | **غیرفعال** — همهٔ وابستگی‌ها در همان Run از `google()`/`mavenCentral()` گرفته می‌شوند | فعال (فقط برای سرعت) |
| خروجی | `app-release-unsigned.apk` | `app-release.apk` (امضاشده) |
| بررسی امضا | اثبات *نبود* امضا (`apksigner` باید رد کند) | `apksigner verify` + مقایسهٔ SHA-256 گواهی با `ANDROID_CERT_SHA256` |
| Job انتشار | هرگز | فقط اگر `ENABLE_AUTO_PUBLISH=true` و Environment تأیید شود |
| Artifact | `android-verification-<versionCode>` — **غیرقابل توزیع** | `android-release-<versionCode>` |

`verification` مسیر امن برای اولین اجراست: نه کلید مالک لازم دارد، نه می‌تواند چیزی منتشر کند.

---

## ۲. دستورهای مالک (اجرا نشده)

پیش از هر کاری، GitHub CLI باید با حساب مالک وارد شده باشد.

```bash
# ۰) پیش‌نیاز مخزن خصوصی (اقدام مالک؛ فقط برای حالت release لازم است)
gh repo view mehdi1265/barber --json isPrivate

# ۱) ذخیرهٔ تغییرات فعلی در یک Commit (دستور پیشنهادی؛ اجرا نشده)
git status --short
git add .github/workflows/android-release.yml \
        android/app/build.gradle \
        android/app/capacitor.build.gradle \
        android/capacitor.settings.gradle \
        scripts/android-release-utils.ts \
        src/tests/unit/android-release.test.ts \
        docs/17-direct-distribution-release.md \
        docs/18-release-secrets.md \
        docs/19-direct-release-checklist.md \
        docs/20-backend-staging.md \
        docs/21-android-ci-runbook.md \
        ios/App/App.xcodeproj/xcshareddata
git commit -m "ci(android): dual-mode release workflow with plugin presence gates"

# ۲) Push شاخه (نیازمند تأیید جداگانهٔ مالک)
git push -u origin release/direct-distribution-2026-11-14

# ۳) اجرای حالت verification
gh workflow run android-release.yml \
  --ref release/direct-distribution-2026-11-14 \
  -f buildMode=verification \
  -f versionName=1.0.0 \
  -f versionCode=1

# ۴) پیگیری و دریافت لاگ
gh run list --workflow=android-release.yml --limit 3
gh run watch <RUN_ID> --exit-status
gh run view <RUN_ID> --log

# ۵) دریافت Artifact آزمایشی
gh run download <RUN_ID> -n android-verification-1 -D verification-artifact
```

پس از موفقیت `verification`، برای نسخهٔ امضاشده (پس از تنظیم Secretها و خصوصی‌شدن مخزن):

```bash
gh workflow run android-release.yml \
  --ref release/direct-distribution-2026-11-14 \
  -f buildMode=release \
  -f versionName=1.0.0 \
  -f versionCode=1
```

نام Secretها و Variableها در `docs/18-release-secrets.md` آمده است.

---

## ۳. آنچه Workflow اثبات می‌کند

به ترتیب اجرا:

1. `Preflight official Google Maven` — وضعیت HTTP چهار Artifact الزامی را چاپ می‌کند
   (`material:1.12.0`، `activity-ktx:1.9.3`، AGP `8.11.1`، `google-services:4.4.2`) و بدنهٔ پاسخ را
   بررسی می‌کند که واقعاً POM باشد (نه صفحهٔ HTML با کد ۲۰۰). هر خطا → **BLOCKED**.
2. `Guard Java 21 toolchain requirement` — `java -version` باید `21.` باشد.
3. `Check version monotonicity` (فقط release) — مقایسهٔ `versionCode` با آخرین Release.
4. `npm ci` → `type-check` → `lint` → `npm test` → `npm run build` → `npx cap sync android`.
5. `Verify Capacitor plugin wiring` — هر ۹ ماژول در `capacitor.build.gradle`/`capacitor.settings.gradle`
   و هر ۹ پکیج در `capacitor.plugins.json`.
6. `assembleRelease` با `-PbarberVersionCode/-PbarberVersionName`.
7. `Verify plugin classes in APK dex` — وجود واقعی ۹ کلاس پلاگین در Dex + تطابق
   `capacitor.plugins.json` داخل APK با نسخهٔ Sync‌شده.
8. `Verify APK` — `zipalign -c -P 16 4`، ELF `LOAD p_align ≥ 0x4000` برای چهار ABI،
   `aapt2 dump badging` (package/versionCode/versionName/minSdk/targetSdk)، حضور
   `libsqlcipher.so` در `arm64-v8a`/`armeabi-v7a`/`x86`/`x86_64`، برابری بایت‌به‌بایت با AAR
   `4.10.0`، نبود کلاس‌های `net.sqlcipher` قدیمی، اسکن Secret، و `SHA256SUMS`.
9. (فقط release) مقایسهٔ اثر انگشت گواهی با `ANDROID_CERT_SHA256`.

Job `publish` مستقل است و پیش از انتشار: خصوصی‌بودن مخزن، امضا، `zipalign` و `SHA256SUMS` را
دوباره بررسی می‌کند.

---

## ۴. آنچه اثبات نمی‌شود (NOT RUN)

| مورد | وضعیت | علت |
|---|---|---|
| دسترسی واقعی Google Maven از Runner | **NOT TESTED** | تا اجرای اول؛ Preflight همان Run پاسخ را ثبت می‌کند |
| نصب و اجرای واقعی APK | **NOT RUN** | بدون دستگاه/امولاتور؛ Runner میزبانی‌شده دستگاه ندارد |
| Runtime 16 KB (`getconf PAGE_SIZE`) | **NOT RUN** | Runner میزبانی‌شده Image صفحه‌۱۶KB ندارد؛ فقط Alignment استاتیک اثبات می‌شود |
| سناریوهای S1–S8 | **NOT RUN** | وابسته به دستگاه واقعی |
| iOS/TestFlight | **NOT RUN** | نیازمند macOS |

---

## ۵. عیب‌یابی

| نشانه | معنا |
|---|---|
| `BLOCKED: Google Maven returned HTTP 404` | شبکهٔ Runner به Google Maven دسترسی ندارد. **Mirror اضافه نکنید**؛ گزارش BLOCKED بدهید. |
| `the response for … is not a Maven POM` | یک Proxy صفحهٔ HTML با کد ۲۰۰ برگردانده؛ همان BLOCKED. |
| `BLOCKED: the Android build needs a Java 21 JDK` | `setup-java` نسخهٔ ۱۷ را نصب کرده؛ `java-version: '21'` را بررسی کنید. |
| `Plugin class … is absent from the APK dex` | یکی از ۹ پلاگین واقعاً در APK نیست (همان اشکال APK قبلی). Build شکست می‌خورد و نباید منتشر شود. |
| `is missing project(':capacitor-…')` | فایل تولیدشدهٔ Gradle از `package.json` عقب است؛ `cap sync` را بررسی کنید. |
| `buildMode=release requires a private source repository` | مخزن عمومی است؛ فقط `verification` مجاز است. |
| Release required reviewers غیرفعال | در مخزن خصوصی، Required Reviewers نیازمند GitHub Pro/Team است؛ در غیر این صورت `ENABLE_AUTO_PUBLISH=false` نگه دارید و انتشار را دستی انجام دهید (docs/17 §۶.۱). |
