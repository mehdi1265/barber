# توزیع مستقیم — طراحی انتشار Android (GitHub Releases) و iOS (TestFlight)

تاریخ: ۲۰۲۶-۱۱-۱۴ · شاخه کاری: `release/direct-distribution-2026-11-14` · Baseline: `57995a5`

این سند طراحی فنی است، نه شاهد اجرا. هیچ Workflow روی GitHub اجرا نشده و هیچ APK/IPA
تولید یا آپلود نشده است.

---

## ۱. Baseline تأییدشده

| مورد | مقدار تأییدشده |
|---|---|
| شاخه / HEAD | `develop` → شاخه کاری از `57995a5` |
| Working tree قبل از تغییر | تمیز (۰ تغییر) |
| Bundle ID | `com.barberapp.app` (Android و iOS) |
| Capacitor | `7.6.10` (core/cli/android/ios) |
| SQLCipher | `net.zetetic:sqlcipher-android:4.10.0` |
| Gradle Wrapper | `8.14` |
| Java / Node | Temurin 17 / Node 24 |
| compileSdk / targetSdk / minSdk | `36` / `36` / `23` |
| NDK | `28.2.13676358` |
| iOS Deployment Target | `14.0` |

هیچ اختلافی با مشخصات اعلامی مالک یافت نشد.

---

## ۲. معماری مخازن

| مخزن | دسترسی | محتوا |
|---|---|---|
| A — سورس (فعلی) | خصوصی | سورس، native، migrationها، تست‌ها، مستندات، Workflowها |
| B — انتشار | عمومی | فقط APK، `SHA256SUMS`، Release Notes، راهنمای نصب/ارتقا |

قواعد مخزن B:

- هیچ سورس، `.env`، keystore، گواهی، پروفایل یا کلید API در آن قرار نمی‌گیرد.
- Tag فقط در مخزن B ساخته می‌شود (`v1.0.0`) و تاریخچه مخزن A را تغییر نمی‌دهد.
- انتشار فقط پس از PASS همه Gateها و تأیید مالک.

---

## ۳. Workflow اندروید — `.github/workflows/android-release.yml`

### ۳.۱. ورودی‌ها و کنترل‌ها

- فقط `workflow_dispatch` با سه ورودی: `buildMode` (`verification` | `release`)، `versionName`، `versionCode`.
- `permissions: contents: read` در هر دو Job.
- اعتبارسنجی: `versionName` الگوی `X.Y.Z` (با پسوند اختیاری `-rc1`)، `versionCode` عدد صحیح مثبت.
- `RELEASE_REPO` فقط در `buildMode=release` الزامی است؛ Build نوع verification هیچ Secret یا
  Variableی نمی‌خواهد.
- **مخزن خصوصی:** `buildMode=release` روی مخزن عمومی با **BLOCKED** متوقف می‌شود (نه فقط انتشار).
- یکنواختی نسخه: آخرین Release مخزن B از GitHub API خوانده می‌شود و `versionCode` از خط
  `versionCode: N` در Release Notes مقایسه می‌شود؛ نسخه برابر یا کوچکتر رد می‌شود.
  اگر هیچ Release وجود نداشته باشد، اولین انتشار مجاز است. این Gate فقط در حالت release اجرا می‌شود.
- **Preflight رسمی Google Maven:** چهار Artifact الزامی با `curl` واقعی بررسی می‌شوند و
  HTTP Status و حجم پاسخ چاپ می‌شود: `material:1.12.0`، `activity-ktx:1.9.3`، AGP `8.11.1`،
  `google-services:4.4.2`. علاوه بر کد ۲۰۰، بدنهٔ پاسخ باید `<project` داشته باشد تا صفحهٔ HTML
  با کد ۲۰۰ به‌عنوان Artifact پذیرفته نشود. هر خطا → **BLOCKED**؛ هیچ mirror جایگزین مجاز نیست.
- **وجود مخزن انتشار:** پیش از Build، وجود `RELEASE_REPO` با GitHub API بررسی می‌شود؛ اگر
  404/403 برگردد Workflow با **BLOCKED** متوقف می‌شود (به‌جای اینکه اولین انتشار فرض شود).

### ۳.۲. Build و امضا — دو حالت جدا

**حالت `verification`** (پیش‌فرض و نخستین اجرا):

- هیچ Secret/Keystoreای لازم نیست؛ `android/keystore.properties` ساخته نمی‌شود.
- Gradle dependency cache **غیرفعال** است (`setup-gradle` اجرا نمی‌شود) تا هر وابستگی در همان
  Run از `google()`/`mavenCentral()` گرفته شود و Cache جایگزین Google Maven نشود.
- خروجی `app-release-unsigned.apk` است؛ اگر APK امضاشده ظاهر شود Build شکست می‌خورد و
  `apksigner` باید آن را رد کند (اثبات نبود امضا).
- Artifact با نام `android-verification-<versionCode>` و گزارش با برچسب
  `distributable: NO` ذخیره می‌شود؛ Job انتشار هرگز اجرا نمی‌شود.

**حالت `release`:**

1. Keystore از Secretهای Base64 در `$RUNNER_TEMP` ساخته می‌شود (`umask 077`)،
   `android/keystore.properties` فقط برای طول Build نوشته می‌شود، و در `if: always()` پاک می‌شود.
2. `./gradlew --no-daemon -PbarberVersionName=... -PbarberVersionCode=... assembleRelease`.
3. Gateهای اجباری:
   - `apksigner verify --verbose --print-certs` (باید `Verifies`).
   - مقایسه Fingerprint گواهی با repository variable **اجباری** `ANDROID_CERT_SHA256`.
   - `zipalign -c -P 16 4` (هم‌ترازی ZIP).
   - استخراج واقعی `.so`ها از APK و بررسی `LOAD p_align ≥ 0x4000` با `llvm-readelf`
     (NDK نصب‌شده روی Runner؛ در نبود آن **BLOCKED**، نه PASS).
   - وجود ۴ ABI و `libsqlcipher.so` در هرکدام (از فهرست واقعی ZIP).
   - مقایسه بایت‌به‌بایت SHA-256 کتابخانه‌های استخراج‌شده با AAR رسمی `4.10.0`
     (این برابری روی همین Baseline با APK محلی تأیید شد).
   - تأیید `net.zetetic:sqlcipher-android:4.10.0` در `releaseRuntimeClasspath`.
   - بررسی نبود `net.sqlcipher` در dex با `apkanalyzer` (فقط سیگنال، نه اثبات قطعی).
   - بررسی `applicationId`/`versionName`/`versionCode`/`minSdk`/`targetSdk` با `aapt2`.
   - اسکن محتوای APK برای الگوهای Secret.
   - `sha256sum` و گزارش اعتبارسنجی.

**مشترک هر دو حالت** (پیش از کامپایل و پس از آن):

- `npm ci` → `type-check` → `lint` → `test` → `npm run build` → `npx cap sync android`.
- `Verify Capacitor plugin wiring`: حضور هر ۹ ماژول در `capacitor.build.gradle`/`capacitor.settings.gradle`
  و هر ۹ پکیج در `capacitor.plugins.json`.
- `Verify plugin classes in APK dex`: وجود واقعی هر ۹ کلاس پلاگین در Dex با `apkanalyzer` و
  تطابق `capacitor.plugins.json` داخل APK با نسخهٔ Sync‌شده. (`capacitor.plugins.json` به‌تنهایی
  شاهد نیست: APK قبلی آن را کامل داشت ولی کلاس‌های Camera/Filesystem در Dex نبودند.)
- Build-tools ترجیحاً `36.1.0` (نسخهٔ تأییدشده) و در نبود آن آخرین نسخهٔ نصب‌شده.
- Artifact شامل APK، `SHA256SUMS` و گزارش؛ Retention ۷ روز.

### ۳.۳. انتشار (Job جدا)

- Job `publish` با `needs: build`، `environment: release-approval` و
  `if: buildMode == 'release' && vars.ENABLE_AUTO_PUBLISH == 'true'` (opt-in صریح مالک).
- اولین گام: اگر `github.event.repository.private != true` باشد، **BLOCKED**.
- Secret: `RELEASE_REPO_TOKEN` (Fine-grained، فقط `contents: write` روی مخزن B).
- Variable: `RELEASE_REPO` (مثل `owner/barber-releases`).
- پیش از آپلود: `apksigner` + مقایسه Fingerprint، `zipalign -c -P 16 4`، سپس `sha256sum -c`،
  سپس `gh release create` با Tag `v<versionName>`.
- اگر Release موجود باشد، بازنویسی نمی‌شود.
- روش جایگزین: آپلود دستی Artifact توسط مالک.
- دستورهای اجرا: `docs/21-android-ci-runbook.md`.

### ۳.۴. تزریق نسخه در Gradle — اعمال‌شده

`android/app/build.gradle` اکنون مقدار نسخه را از `-PbarberVersionCode`/`-PbarberVersionName`
می‌خواند و در نبود آن‌ها به همان مقادیر قبلی (`1` / `1.0`) برمی‌گردد؛ بنابراین Build محلی و
`scripts/android-release.ts` هم دست‌نخورده کار می‌کنند.

```groovy
def barberVersionCode = (project.findProperty('barberVersionCode') ?: '1').toString()
def barberVersionName = (project.findProperty('barberVersionName') ?: '1.0').toString()
versionCode barberVersionCode.toInteger()
versionName barberVersionName
```

- Workflow پیش از Build با Gate «Guard Gradle version injection» وجود این چهار خط را بررسی می‌کند.
- `scripts/android-release-utils.ts` نیز برای همان فرم مقدار fallback را به‌روزرسانی می‌کند
  (تست واحد در `src/tests/unit/android-release.test.ts`).
- اثر: مقدار واقعی داخل APK با ورودی‌ها یکسان و در Gate `aapt2` تأیید می‌شود؛ تغییر نام فایل کافی نیست.

---

## ۴. Workflow iOS — `.github/workflows/ios-testflight.yml`

- Runner: `macos-26` (arm64). بر اساس README رسمی `actions/runner-images` (Image
  `20260824.0517.1`, macOS 26.6.1): **Xcode 26.6 پیش‌فرض** در
  `/Applications/Xcode_26.6.app` و **CocoaPods 1.17.0**.
- Workflow وجود همان مسیر Xcode و خروجی `xcodebuild -version` را بررسی می‌کند؛ نسخهٔ دیگر
  به‌صورت خودکار پذیرفته نمی‌شود و نتیجه **BLOCKED** است.
- فقط `workflow_dispatch` با `buildNumber` (اجباری) و `marketingVersion` (اختیاری).
- `environment: ios-testflight` برای Approval مالک (محدودیت پلن در §۶).
- Guardهای سخت پیش از هر Build:
  - نبود `App.xcscheme` اشتراکی → **BLOCKED**.
  - نبود `ios/App/Podfile.lock` → **BLOCKED** (تکرارپذیری نسخهٔ Podها).
- مراحل: `npm ci` → `npm run build` → `lint` → `npx cap sync ios` →
  `pod install --deployment` → Audit Privacy/Export → Import گواهی/پروفایل به Keychain موقت →
  `xcodebuild archive` (با `CODE_SIGN_STYLE=Manual` و `CODE_SIGN_IDENTITY="Apple Distribution"`)
  → `xcodebuild -exportArchive` (method `app-store-connect`) → **Verification خود IPA** →
  آپلود با `altool`.
- **Verification IPA:** `codesign --verify --deep --strict`، وجود
  `Authority=Apple Distribution`، تطابق `CFBundleIdentifier` با `com.barberapp.app`،
  `CFBundleVersion` با `buildNumber` و (در صورت ارائه) `CFBundleShortVersionString` با
  `marketingVersion`. هیچ IPA بدون این تأییدها آپلود نمی‌شود.
- **آپلود:** وفق مستند رسمی Apple، `--upload-app` منسوخ و `--upload-package` جاری است.
  Workflow خروجی `xcrun altool --help` را می‌خواند و در صورت وجود `--upload-package` از آن
  (با `--type ios`) و در غیر این صورت از `--upload-app` استفاده می‌کند؛ اگر هیچ‌کدام موجود نباشد
  **BLOCKED** می‌شود. این مسیر روی Runner اجرا نشده و **NOT TESTED** است.
- پاک‌سازی Keychain، p12، پروفایل، IPA استخراج‌شده و کلید API در `if: always()`.

### ۴.۱. شکاف‌های شناخته‌شده iOS

| شکاف | اثر | رفع |
|---|---|---|
| `App.xcscheme` اشتراکی در مخزن نیست | Workflow با **BLOCKED** متوقف می‌شود | یک‌بار در Xcode گزینه Shared را فعال و فایل را commit کنید |
| `Podfile.lock` در مخزن نیست | Workflow با **BLOCKED** متوقف می‌شود | پس از اولین `pod install` موفق روی macOS، `Podfile.lock` را commit کنید |
| `ITSAppUsesNonExemptEncryption` تنظیم نشده | Export Compliance در TestFlight بی‌پاسخ می‌ماند | **تصمیم مالک**؛ Workflow فقط مقدار را چاپ می‌کند و آن را تغییر نمی‌دهد |
| Privacy Manifest سطح اپ وجود ندارد | در صورت استفاده از Required-Reason API، Apple رد می‌کند | Audit خروجی Workflow و افزودن manifest در تغییر جداگانه |
| Required Reason APIها فقط از Podها خوانده می‌شوند | پوشش کامل اپ اثبات نشده | بررسی دستی فهرست APIهای اپ + manifest |
| `altool` روی Xcode 26.6 اجرا نشده | ممکن است پرچم/الزام جدید داشته باشد | تشخیص خودکار پرچم + گزارش NOT TESTED |

### ۴.۲. TestFlight

- نیازمند Apple Developer Program (۹۹ دلار/سال) و App Store Connect record برای
  `com.barberapp.app` با همان Team ID.
- تستر داخلی تا ۱۰۰ نفر (بدون Beta Review)؛ تستر خارجی تا ۱۰٬۰۰۰ نفر (با Beta App Review).
- Build پس از ۹۰ روز منقضی می‌شود.
- هیچ IPA بدون امضای معتبر «قابل نصب» اعلام نمی‌شود.

---

## ۵. برنامه تست (اجرا نشده — NOT RUN)

### ۵.۱. اندروید

| تست | معیار PASS |
|---|---|
| نصب روی دستگاه | `adb install -r` بدون خطا؛ اجرای اپ و نبود FATAL در logcat |
| ۱۶KB — استاتیک CI | `zipalign -c -P 16 4` و `llvm-readelf` با `LOAD p_align ≥ 0x4000` برای همهٔ `.so`ها |
| ۱۶KB — محیط واقعی | `getconf PAGE_SIZE` = 16384 روی دستگاه/امولاتور با کرنل ۱۶KB |
| ۱۶KB — عملکرد | باز شدن DB رمزنگاری‌شده و CRUD بدون crash روی صفحهٔ ۱۶KB |
| S1 باز شدن DB قدیمی | بدون «file is not a database»؛ ورود/داشبورد |
| S2 داده قدیمی | همان تعداد/مقادیر قبل از ارتقا |
| S3 درج/ویرایش | ذخیره و مشاهده مجدد |
| S4 kill/reopen | داده باقی می‌ماند؛ migration دوباره اجرا نمی‌شود |
| S5 رمزنگاری | هدر فایل DB برابر `SQLite format 3` نیست |
| S6 کلید | خطای «passphrase already set» رخ نمی‌دهد؛ `setEncryptionSecret` دوباره اجرا نمی‌شود |
| S7 پشتیبان | Import خروجی قبلی کامل است |
| S8 Secret اشتباه | خطای کنترل‌شده؛ DB حذف/بازسازی نمی‌شود |
| عملکرد/آفلاین/deep link/backup | طبق `docs/15` |
| امنیت | اسکن APK، مجوزهای manifest، عدم افشای Secret |

### ۵.۲. iOS

نصب از TestFlight، ورود، مشتریان، خدمات، نوبت، مالی، دیتابیس رمزنگاری‌شده،
Keychain/Secure Storage، آفلاین/reconnect، deep link، و بررسی crash.

### ۵.۳. Backend Staging

رویهٔ کامل، معیارهای PASS/BLOCKED و ترتیب دقیق در `docs/20-backend-staging.md`.
خلاصه:

1. تأیید کتبی مالک و پروژه Staging مستقل (نه Production).
2. Preflight فقط‌خواندنی: health، `rls:check --preflight`،
   `legacy_ownership_mismatches.sql` خالی.
3. بررسی تاریخچهٔ Migration؛ اجرای `001`→`005` به ترتیب و **بدون اجرای کورکورانهٔ مجدد**.
4. RLS با دو کاربر و JWT مستقل، بدون `service_role`.
5. Storage policy با دو نشست مستقل.
6. Sync دو دستگاه/دو حساب: آفلاین، reconnect، retry، conflict، tombstone.
7. ثبت شواهد بدون PII.

### ۵.۴. شواهد ساخت و اعتبارسنجی محلی (۲۰۲۶-۱۱-۱۵)

این بخش فقط چیزی را ثبت می‌کند که واقعاً اجرا شده است؛ هیچ موردی از CI اجرا نشده.

**۱) الزام JDK 21 — اصلاح‌شده در Workflow**

`android/app/capacitor.build.gradle` (فایل تولیدشده و ردیابی‌شده) و چند Plugin کپسیتور
(`@capacitor/camera`, `filesystem`, `@capacitor-community/sqlite`, `@aparajita/...`)
با `sourceCompatibility JavaVersion.VERSION_21` و `kotlin { jvmToolchain(21) }` کامپایل می‌شوند.
Workflow قبلی JDK 17 داشت و روی Runner شکست می‌خورد.

- اصلاح: `java-version: '21'` در `.github/workflows/android-release.yml`.
- Gate جدید: بررسی خروجی `java -version` برای `"21.` و در غیر این صورت **BLOCKED**.
- شاهد محلی: Build با JDK 21 (JBR همراه Android Studio) موفق شد؛ با JDK 17 خطای
  `Cannot find a Java installation ... matching: {languageVersion=21}`.

**۲) فایل‌های تولیدشدهٔ Android از `package.json` عقب بودند**

`android/capacitor.settings.gradle` و `android/app/capacitor.build.gradle` در HEAD
`@aparajita/capacitor-secure-storage`، `@capacitor/camera` و `@capacitor/filesystem` را نداشتند؛
یعنی هر Build بدون `npx cap sync` یک APK ناقص تولید می‌کرد. اکنون با `npx cap sync android`
همگام شده‌اند (در Working Tree، بدون Commit).

شاهد Idempotency (پس از `npm ci` تازه): هش پنج فایل تولیدشده پیش و پس از `cap sync` یکسان ماند و
`cap sync` صریحاً `Found 9 Capacitor plugins for android` را گزارش کرد.

| ماژول Gradle | پکیج | وضعیت |
|---|---|---|
| `:aparajita-capacitor-secure-storage` | `@aparajita/capacitor-secure-storage@7.1.6` | سیم‌کشی‌شده |
| `:capacitor-community-sqlite` | `@capacitor-community/sqlite@7.0.3` | سیم‌کشی‌شده |
| `:capacitor-app` | `@capacitor/app@7.1.2` | سیم‌کشی‌شده |
| `:capacitor-camera` | `@capacitor/camera@7.0.5` | سیم‌کشی‌شده |
| `:capacitor-filesystem` | `@capacitor/filesystem@7.1.9` | سیم‌کشی‌شده |
| `:capacitor-haptics` | `@capacitor/haptics@7.0.1` | سیم‌کشی‌شده |
| `:capacitor-keyboard` | `@capacitor/keyboard@7.0.1` | سیم‌کشی‌شده |
| `:capacitor-local-notifications` | `@capacitor/local-notifications@7.0.1` | سیم‌کشی‌شده |
| `:capacitor-status-bar` | `@capacitor/status-bar@7.0.1` | سیم‌کشی‌شده |

**۳) ریشه‌یابی `material:1.12.0` و `activity-ktx:1.9.3` — مسدودبودن Google Maven**

سه فرض بررسی شد؛ فقط فرض شبکه تأیید شد.

| فرض | بررسی | نتیجه |
|---|---|---|
| (الف) دسترسی شبکه | `curl` روی `.../material/1.12.0/material-1.12.0.pom` و `.../activity-ktx/1.9.3/...pom` | **HTTP 404** از `dl.google.com` |
| (الف) دامنهٔ مسدودبودن | همان 404 برای `master-index.xml`، `repository2-3.xml`، `androidx/core/1.15.0` و AGP `8.11.1` | کل مسیر `dl.google.com/**` 404 است، نه یک Artifact خاص |
| (الف) IPv4/IPv6 | `curl -4` (۱۹۲.۱۷۸.۱۸۳.۱۹۰) و `curl -6` | هر دو **404** |
| (الف) سلامت میزبان | `https://www.google.com/generate_204` | **204** — شبکه سراسری قطع نیست |
| (الف) منبع جایگزین رسمی | `maven.google.com` → 301 به همان `dl.google.com` (**404**)؛ `maven-central.storage-download.googleapis.com` (**403**) | هیچ مسیر رسمی دیگری پاسخ نمی‌دهد |
| (الف) Maven Central | `com.google.android.material` و `androidx.activity` | **404** (nginx) — این دو هرگز روی Central نبوده‌اند |
| (ب) پیکربندی Repository | `android/build.gradle` (buildscript و allprojects) و `build.gradle` هر Plugin | `google()` + `mavenCentral()` **درست اعلام شده‌اند** |
| (ج) سازگاری نسخه | متادیتای `io.ionic.libs:ionfilesystem-android:1.1.1` | `activity-ktx:1.9.3` در Variant **runtime** اعلام شده است |
| (ج) سازگاری نسخه | `node_modules/@capacitor/camera/android/build.gradle:79` | `material:$androidxMaterialVersion` با پیش‌فرض **1.12.0**؛ `variables.gradle` آن را Override نمی‌کند |

اثبات نهایی، با Gradle واقعی و `GRADLE_USER_HOME` تازه (بدون هیچ Cache، فقط `google()` و `mavenCentral()`):

```
* What went wrong:
Execution failed for task ':probeDeps'.
> Could not resolve all files for configuration ':probe'.
   > Could not find com.google.android.material:material:1.12.0.
     Searched in the following locations:
       - https://dl.google.com/dl/android/maven2/com/google/android/material/material/1.12.0/material-1.12.0.pom
       - https://repo.maven.apache.org/maven2/com/google/android/material/material/1.12.0/material-1.12.0.pom
   > Could not find androidx.activity:activity-ktx:1.9.3.
     Searched in the following locations:
       - https://dl.google.com/dl/android/maven2/androidx/activity/activity-ktx/1.9.3/activity-ktx-1.9.3.pom
       - https://repo.maven.apache.org/maven2/androidx/activity/activity-ktx/1.9.3/activity-ktx-1.9.3.pom
BUILD FAILED in 8s
```

**۴) Build تمیز بدون اتکا به Cache — BLOCKED (شبکه)**

`assembleRelease` روی همین مخزن با `GRADLE_USER_HOME` خالی (Gradle 8.14 تازه دانلود شد) و بدون
هیچ Init Script یا مخزن محلی، در مرحلهٔ Configuration شکست خورد:

```
> Could not resolve all artifacts for configuration 'classpath'.
   > Could not find com.android.tools.build:gradle:8.11.1.
       - https://dl.google.com/dl/android/maven2/com/android/tools/build/gradle/8.11.1/gradle-8.11.1.pom
       - https://repo.maven.apache.org/maven2/com/android/tools/build/gradle/8.11.1/gradle-8.11.1.pom
   > Could not find com.google.gms:google-services:4.4.2.
BUILD FAILED in 7s
```

یعنی حتی AGP هم از این شبکه دریافت نمی‌شود. Cache محلی فقط برای تشخیص و اثبات مسیر امضا/تزریق نسخه
استفاده شد و **هیچ مخزن یا Mirror غیررسمی** به پروژه اضافه نشده است.

**۵) اثبات اینکه APK قبلی فاقد پلاگین‌ها بود (و چرا `capacitor.plugins.json` کافی نیست)**

روی `app-release.apk` قبلی (که در نبود `material`/`activity-ktx` ساخته شد):

| بررسی | نتیجه |
|---|---|
| `assets/capacitor.plugins.json` داخل APK | هر ۹ پلاگین، از جمله Camera و Filesystem، **فهرست‌شده** |
| `apkanalyzer dex packages` → `CameraPlugin` | **غایب** (۰ کلاس) |
| `apkanalyzer dex packages` → `FilesystemPlugin` | **غایب** (۰ کلاس) |
| `apkanalyzer dex packages` → `AppPlugin` / `CapacitorSQLitePlugin` | موجود |

پس آن APK در زمان فراخوانی `Camera.getPhoto()` یا `Filesystem.writeFile()` در زمان اجرا شکست می‌خورد.
این APK **قابل انتشار نیست** و با کلید موقت حذف‌شده امضا شده بود؛ نسخه و اثر انگشت آن به Build نهایی
تعلق ندارد.

اعتبارسنجی‌های فنی که روی همان APK انجام شده بود (فقط به‌عنوان شاهد ابزار، نه RC):

| بررسی | نتیجه |
|---|---|
| `apksigner verify` | **PASS** — v1 و v2؛ گواهی موقت `CN=Barber RC` |
| اثر انگشت گواهی (SHA-256) | `a7:d9:8f:4d:…:37:7b` (کلید موقت محلی، حذف‌شده، نه کلید انتشار) |
| `zipalign -c -P 16 4` | **PASS** |
| `aapt2 dump badging` | `com.barberapp.app`, `versionCode='1'`, `versionName='1.0.0'`, `targetSdk=36` |
| تزریق نسخه از `-P` | **اثبات شد** |
| ABIها | `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` با `libsqlcipher.so` |
| ELF `LOAD p_align` | `0x4000` برای هر چهار ABI |
| مقایسه با AAR `4.10.0` | **برابر بایت‌به‌بایت** در هر چهار ABI |
| SHA-256 فایل | `f6c0a37f…c5cf2f3` (۲۴٬۵۰۶٬۶۸۶ بایت) |

**۶) سخت‌سازی Workflow بر اساس همین ریشه‌یابی**

دو گام جدید به `.github/workflows/android-release.yml` اضافه شد:

- **`Verify Capacitor plugin wiring`** (بلافاصله پس از `cap sync`): وجود هر ۹ ماژول در
  `capacitor.build.gradle`/`capacitor.settings.gradle` و هر ۹ پکیج در `capacitor.plugins.json`
  را اجباری می‌کند؛ اگر کسی پلاگینی را حذف کند Build پیش از کامپایل شکست می‌خورد.
- **`Verify plugin classes in APK dex`** (پس از `assembleRelease`): با `apkanalyzer dex packages`
  وجود هر ۹ کلاس پلاگین را در Dex اثبات می‌کند و `capacitor.plugins.json` داخل APK را با نسخهٔ
  Sync‌شده `diff` می‌کند؛ اگر پلاگینی از Dex بیفتد، Build شکست می‌خورد (این همان حالتی است که
  APK قبلی را «سبز ولی خراب» کرده بود).

هیچ پلاگین یا قابلیتی برای سبز شدن Build حذف نشده است.

**۷) اجرای ۱۶KB روی دستگاه — NOT RUN**

هیچ System Image اندروید روی این ماشین دانلود نشده (پوشه‌های `system-images/android-36/*`
خالی‌اند و دانلود از `dl.google.com` مسدود است) و هیچ دستگاه فیزیکی متصل نیست. بنابراین
`getconf PAGE_SIZE` و سناریوهای S1–S8 اجرا **نشده‌اند** و وضعیت آن‌ها `NOT RUN` است.

**۸) وضعیت iOS پس از این پاس**

- `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` ساخته شد (Target
  `504EC3031FED79650016851F`، `App.app`) — مانع Shared Scheme برطرف شد.
- `ios/App/Podfile.lock` همچنان وجود ندارد و فقط روی macOS ساخته می‌شود (**BLOCKED**).
- بررسی کد Native (`ios/App/App` فقط `AppDelegate.swift`): هیچ‌کدام از APIهای
  Required Reason استفاده نمی‌شوند؛ پس Manifest سطح اپ لازم نیست. Manifestهای Podها
  باید بعد از `pod install` روی macOS بازبینی شوند.

**۹) Backend — اعتبارسنجی محلی روی PostgreSQL واقعی (بدون Remote)**

با PGlite (PostgreSQL 17 کامپایل‌شده به WASM، در حافظهٔ فرایند Node):

- `postgres_bootstrap.sql` + مهاجرت‌های `001`→`005` **دو بار** بدون خطا اجرا شدند (Idempotency).
- `verify_release_schema.sql` موفق؛ `legacy_ownership_mismatches.sql` صفر ردیف.
- `rls_two_user_check.sql` با دو کاربر و JWT مستقل: **«RLS verification passed»** و
  «cleanup verified» (سناریوی همهٔ جدول‌ها + Storage Policy + پاک‌سازی).

این شاهدِ سطح دیتابیس است، نه Supabase میزبان: نقش‌ها/`auth.uid()` با Stubهای
`postgres_bootstrap.sql` شبیه‌سازی شده‌اند و نسخه PG17 است (CI از PG15 استفاده می‌کند).
اعتبارسنجی Staging هنوز **BLOCKED** است (`docs/20`).

---

## ۶. هزینه‌ها و محدودیت پلن GitHub

- Apple Developer Program: ۹۹ دلار در سال (TestFlight شامل آن است).
- GitHub Actions در مخزن خصوصی: سهمیه رایگان ۲٬۰۰۰ دقیقه در ماه؛ Runner لینوکس ۱×،
  macOS ۱۰× (Build حدود ۱۵–۲۵ دقیقه = ۱۵۰–۲۵۰ دقیقه محاسبه‌شده).
- Build اندروید حدود ۵–۱۰ دقیقه (۱×).

### ۶.۱. Required Reviewers در مخزن خصوصی

طبق مستندات GitHub، Environment protection rules (از جمله Required reviewers) برای
مخزن‌های **خصوصی** نیازمند **GitHub Pro** (حساب شخصی) یا **GitHub Team/Enterprise** است.
وجود `environment: release-approval` در YAML به‌تنهایی تأیید مالک را تضمین نمی‌کند.

اگر این قابلیت در دسترس نباشد، راهکار امن جایگزین:

1. `ENABLE_AUTO_PUBLISH` را `false` نگه دارید (Job انتشار خودکار هرگز اجرا نمی‌شود).
2. مالک Artifact تأییدشده را از صفحهٔ Workflow دانلود و `SHA256SUMS` را محلی بررسی کند.
3. انتشار Release عمومی فقط به‌صورت دستی توسط مالک انجام شود.
4. برای iOS، همان `workflow_dispatch` (که فقط دارندهٔ دسترسی Write می‌تواند اجرا کند)
   تنها دروازهٔ تأیید است؛ این را در تصمیم مستند ثبت کنید.

> بررسی پلن فعلی حساب و Private شدن مخزن، اقدام مالک است. مخزن سورس در حال حاضر
> **عمومی** است و با Baseline اعلامی (Private) اختلاف دارد.

---

## ۷. وضعیت فعلی

| مسیر | وضعیت |
|---|---|
| Android — سیم‌کشی پلاگین‌ها | **PASS (محلی)** — هر ۹ ماژول در Gradle و `capacitor.plugins.json`؛ `cap sync` تکرارپذیر است |
| Android — Build تمیز | **BLOCKED** — `dl.google.com/**` از این شبکه ۴۰۴ می‌دهد؛ حتی AGP `8.11.1`، `material:1.12.0` و `activity-ktx:1.9.3` دریافت نمی‌شوند (جدول کامل در §۵.۴ بند ۳ و ۴) |
| Android — APK نهایی | **NOT PRODUCED** — هیچ APK حاوی Camera/Filesystem روی این ماشین ساخته نشده است |
| Android — امضا | **BLOCKED** — keystore معتبر مالک و Secretها موجود نیست |
| Android — اجرای ۱۶KB | **NOT RUN** — بدون System Image و بدون دستگاه |
| Android — تزریق نسخه/JDK 21 | **PASS (محلی)** — اصلاح و اثبات شد |
| iOS | **BLOCKED** — Shared Scheme ساخته شد؛ بدون `Podfile.lock`، حساب Apple، Runner **NOT TESTED** |
| Backend | **BLOCKED** (Staging) — RLS محلی روی PG17 با PGlite **PASS**؛ Supabase میزبان اجرا نشده |
| مخزن سورس | **انحراف Baseline** — در حال حاضر عمومی است؛ باید Private شود (اقدام مالک) |
| YAML | Parse/Prettier محلی PASS (۲۳ گام)؛ **اجرا نشده** |
| Google Maven از Runner | **NOT TESTED** — نیازمند dispatch با اجازه مالک |
| `altool` روی Xcode 26.6 | **NOT TESTED** |

هیچ ادعای READY وجود ندارد.
