# مستندات Secrets — انتشار مستقیم (Android / iOS)

این سند فقط **نام** Secretها و نحوهٔ مدیریت آن‌ها را تعریف می‌کند.
هیچ مقدار واقعی در این سند، مخزن یا گزارش وجود ندارد و نباید قرار بگیرد.

---

## ۱. قواعد پایه

- Secrets فقط در GitHub → Settings → Secrets and variables → Actions ذخیره می‌شوند.
- **سطح ذخیره‌سازی:** چهار Secret امضای Android باید **Repository secret** باشند، چون Job ساخت
  هیچ Environment ندارد و Environment secret در آن قابل خواندن نیست. `RELEASE_REPO_TOKEN`
  فقط در Environment `release-approval` (Job انتشار) و Secretهای iOS در Environment
  `ios-testflight` ذخیره می‌شوند.
- **حالت `buildMode=verification` هیچ Secretی لازم ندارد** و Keystore را لمس نمی‌کند؛
  چهار Secret زیر فقط برای `buildMode=release` خوانده می‌شوند.
- Keystore، گواهی، پروفایل و کلید API **هرگز** در Git، Issue، Release، Artifact عمومی یا Log قرار نمی‌گیرند.
- در Workflowها هیچ‌گاه `set -x` روشن نمی‌شود؛ Actions مقادیر Secret را در Log ماسک می‌کند.
- فایل‌های موقت با `umask 077` ساخته و در `if: always()` پاک می‌شوند.
- چرخش (rotation) هر Secret باید در همین سند تاریخ‌گذاری شود.

---

## ۲. Secretهای Android

| نام | نوع | محدوده | محل استفاده |
|---|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64 فایل `.jks` | Repository secret | Build Release |
| `ANDROID_KEYSTORE_PASSWORD` | متن | Repository secret | `keystore.properties` موقت |
| `ANDROID_KEY_ALIAS` | متن | Repository secret | `keystore.properties` موقت |
| `ANDROID_KEY_PASSWORD` | متن | Repository secret | `keystore.properties` موقت |
| `RELEASE_REPO_TOKEN` | Fine-grained PAT | Environment `release-approval` | `gh release create` در مخزن عمومی |

### ۲.۱. ساخت و نگهداری Keystore (فقط توسط مالک)

1. روی ماشین امن و آفلاین:
   `keytool -genkeypair -v -keystore barber-release.jks -alias barber -keyalg RSA -keysize 4096 -validity 10000`
2. پشتیبان رمزنگاری‌شده از فایل keystore و رمزها در دو محل مستقل نگهداری شود.
3. تبدیل به Base64 برای ورود در GitHub:
   - Linux/macOS: `base64 -w0 barber-release.jks`
   - Windows: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("barber-release.jks"))`
4. پس از ثبت Secret، فایل Base64 موقت حذف شود.
5. Fingerprint گواهی را با `keytool -list -v` یا `apksigner verify --print-certs` استخراج و
   در repository variable `ANDROID_CERT_SHA256` ثبت کنید تا Gate مقایسه فعال شود.

> گم شدن keystore یا تغییر کلید = عدم امکان ارتقای اپ نصب‌شده. تغییر کلید بدون برنامه مهاجرت ممنوع است.

### ۲.۲. توکن انتشار

- Fine-grained PAT با دسترسی فقط به مخزن عمومی انتشار (`barber-releases`).
- مجوز: `Contents: Read and write` (برای ساخت Release و آپلود Asset).
- Expiration کوتاه (مثلاً ۹۰ روز) و چرخش دوره‌ای.
- دسترسی به مخزن سورس ندارد.

---

## ۳. Secretهای iOS

| نام | نوع | محل استفاده |
|---|---|---|
| `APPSTORE_API_KEY_ID` | شناسه Key | `altool` |
| `APPSTORE_API_ISSUER_ID` | Issuer UUID | `altool` |
| `APPSTORE_API_PRIVATE_KEY` | محتوای فایل `.p8` | نوشتن در `~/.appstoreconnect/private_keys` |
| `IOS_DIST_CERT_P12_BASE64` | Base64 گواهی Distribution (`.p12`) | Keychain موقت |
| `IOS_DIST_CERT_PASSWORD` | رمز `.p12` | Import |
| `IOS_PROVISIONING_PROFILE_BASE64` | Base64 پروفایل App Store | Install |
| `IOS_PROFILE_NAME` | نام دقیق پروفایل | `PROVISIONING_PROFILE_SPECIFIER` |
| `IOS_TEAM_ID` | Team ID | Archive/Export |
| `KEYCHAIN_PASSWORD` | رمز Keychain موقت | Keychain |

### ۳.۱. پیش‌نیازهای مالک

1. عضویت فعال Apple Developer Program (۹۹ دلار/سال).
2. ساخت App ID برای `com.barberapp.app` و App record در App Store Connect.
3. ساخت گواهی **Apple Distribution** و پروفایل **App Store** برای همان Bundle ID.
4. ساخت App Store Connect API Key با نقش مناسب (App Manager) و دانلود `.p8` (فقط یک‌بار قابل دانلود است).
5. خروجی `.p12` از گواهی در Keychain Access همراه رمز قوی.
6. ثبت مقادیر در Environment `ios-testflight`.

> هیچ‌کدام از این مقادیر نباید در پیام، Issue یا فایل مخزن ارسال شود؛ فقط در GitHub Secrets.

---

## ۴. متغیرهای غیرمحرمانه (Variables)

| نام | مقدار نمونه | کاربرد |
|---|---|---|
| `RELEASE_REPO` | `owner/barber-releases` | مقصد انتشار Android |
| `ENABLE_AUTO_PUBLISH` | `true` / `false` | فعال‌سازی Job انتشار خودکار |
| `ANDROID_CERT_SHA256` | hex بدون `:` | مقایسه Fingerprint امضا |

---

## ۵. Environment Protection (تأیید مالک)

برای هر دو Environment زیر، در تنظیمات مخزن:

1. Required reviewers = مالک پروژه.
2. Deploy branches = فقط شاخه انتشار موردنظر.
3. Prevent self-review در صورت وجود چند نفر.

| Environment | Workflow |
|---|---|
| `release-approval` | Job انتشار Android |
| `ios-testflight` | آپلود TestFlight |

> **محدودیت پلن:** طبق مستندات GitHub، Required reviewers برای مخزن **خصوصی** نیازمند
> GitHub Pro یا Team/Enterprise است. وجود نام Environment در YAML به‌تنهایی تأیید مالک
> را تضمین نمی‌کند. اگر این قابلیت در دسترس نیست:
> `ENABLE_AUTO_PUBLISH=false` نگه دارید و انتشار عمومی را دستی انجام دهید (راهکار جایگزین
> در `docs/17` §۶.۱).

---

## ۶. چرخش و پاسخ به حادثه

- افشای احتمالی keystore: توقف انتشار، ساخت کلید جدید فقط با برنامه مهاجرت نسخه نصب‌شده،
  اطلاع‌رسانی به کاربران، و به‌روزرسانی `ANDROID_CERT_SHA256`.
- افشای PAT: Revoke فوری، ساخت توکن جدید، بررسی Audit Log مخزن انتشار.
- افشای کلید API اپل: Revoke در App Store Connect، ساخت Key جدید، به‌روزرسانی Secrets.
- افشای گواهی iOS: Revoke گواهی، صدور گواهی جدید، به‌روزرسانی پروفایل و Secrets.

---

## ۷. وضعیت فعلی

همهٔ Secretها **ثبت نشده‌اند** (۰ مورد). هیچ مقدار واقعی دریافت یا ذخیره نشده است.
