# ۲۲ — تأیید ایمیل کاربران جدید (Email confirmation)

وضعیت: پیاده‌سازی‌شده و تست‌شده در کد؛ تنظیمات داشبورد Supabase یک اقدام مالک پروژه است.

## ۱. جریان واقعی پروژه

`src/services/supabase/client.ts` گزینهٔ `flowType` را تنظیم نمی‌کند، پس
supabase-js روی مقدار پیش‌فرض **implicit** کار می‌کند (`@supabase/auth-js`:
`flowType: 'implicit'`). نتیجه:

- `signUp({ options: { emailRedirectTo } })` یک ایمیل با دکمهٔ
  `{{ .ConfirmationURL }}` می‌فرستد.
- کاربر دکمه را در مرورگر باز می‌کند؛ Supabase توکن را اعتبارسنجی می‌کند و به
  `redirect_to` هدایت می‌کند:
  `barberapp://confirm-email#access_token=…&refresh_token=…&type=signup`
- اندروید/آی‌او‌اس با intent/URL scheme برنامه را باز می‌کند و
  `src/app/deep-links.ts` لینک را به `applyConfirmEmailLink` می‌دهد.

شاخهٔ `?code=` (PKCE) در پارسر وجود دارد، اما فقط زمانی کار می‌کند که پروژه
آگاهانه به `flowType: 'pkce'` سوییچ کند؛ در حالت فعلی Supabase هیچ‌وقت `code`
برنمی‌گرداند. دو روش با هم مخلوط نشده‌اند: مسیر اصلی توکن implicit است.

## ۲. تنظیمات الزامی داشبورد Supabase

مسیر: **Authentication → URL Configuration**

### Site URL

- **نباید** `http://localhost:3000` باشد. این مقدار همان چیزی است که پیام
  `Unable to connect` را ساخت: Supabase لینک تأیید را به localhost گوشی
  هدایت می‌کرد و گوشی سروری روی localhost ندارد.
- مقدار درست: دامنهٔ واقعی نسخهٔ وب، مثلاً `https://app.example.com`
  (مقدار واقعی را مالک پروژه تعیین می‌کند؛ هیچ مقدار ساختگی در این مخزن
  ثبت نشده است).
- اگر نسخهٔ وبی وجود ندارد، همان دامنه‌ای را بگذارید که در آینده میزبانی
  می‌شود. این مقدار فقط «fallback» است؛ چون برنامه همیشه `emailRedirectTo`
  می‌فرستد، مسیر عادی به آن وابسته نیست.

### Redirect URLs (allow-list)

هر مقدار زیر باید **دقیقاً** در لیست باشد، وگرنه Supabase بی‌صدا به Site URL
برمی‌گردد (همان رفتار قبلی):

```
barberapp://confirm-email
barberapp://reset-password
```

برای توسعهٔ وب:

```
http://localhost:5173/confirm-email
http://localhost:5173/reset-password
```

اگر `VITE_CONFIRM_EMAIL_REDIRECT_URL` / `VITE_RECOVERY_REDIRECT_URL` تنظیم شود
(HTTPS اجباری است):

```
https://<domain>/confirm-email
https://<domain>/reset-password
```

> **بدون trailing slash** و بدون query. `barberapp://confirm-email/` با
> `barberapp://confirm-email` یکی نیست.

## ۳. قالب ایمیل

مسیر: **Authentication → Email Templates → Confirm signup**

- قالب باید شامل `{{ .ConfirmationURL }}` باشد (پیش‌فرض Supabase).
- اگر قالب به سبک `{{ .TokenHash }}` بازنویسی شده باشد (لینک
  `?token_hash=…&type=email`)، این نسخه از برنامه آن را پردازش **نمی‌کند**؛
  باید به قالب پیش‌فرض برگردید یا مسیر verifyOtp جداگانه اضافه شود.
- `{{ .ConfirmationURL }}` را حذف نکنید و لینک را دستی به localhost تغییر
  ندهید.

## ۴. متغیرهای بیلد (اختیاری)

| متغیر | پیش‌فرض | توضیح |
| --- | --- | --- |
| `VITE_CONFIRM_EMAIL_REDIRECT_URL` | `barberapp://confirm-email` روی نیتیو، `<origin>/confirm-email` روی وب | فقط `https:` و مسیر `/confirm-email` پذیرفته می‌شود. |
| `VITE_RECOVERY_REDIRECT_URL` | `barberapp://reset-password` / `<origin>/reset-password` | بدون تغییر نسبت به قبل. |

## ۵. رفتار برنامه

| وضعیت لینک | نتیجه |
| --- | --- |
| توکن معتبر | پروفایل محلی ساخته می‌شود، نشست جدید پاک می‌شود، کاربر به `/login?confirmed=1` می‌رود و پیام موفقیت می‌بیند |
| لینک منقضی/استفاده‌شده | صفحهٔ `/confirm-email` با پیام فارسی و فرم «ارسال لینک جدید» |
| لینک نامعتبر یا ناقص | همان صفحه با پیام «لینک نامعتبر است» |
| ایمیل قبلاً تأیید شده | پیام «قبلاً تأیید شده است» و لینک ورود |
| خطای شبکه | پیام خطای اتصال، قابل تلاش دوباره |
| کاربر از قبل وارد شده | نشست فعلی دست‌نخورده می‌ماند و تأیید ثبت می‌شود |

هیچ توکنی در صفحه نمایش داده نمی‌شود و هیچ توکن/کدی در log چاپ نمی‌شود؛
فقط کد نتیجه (`confirmed|expired|invalid|already|network|error`) در URL
صفحهٔ نتیجه می‌آید.

## ۶. آزمون دستی (مالک پروژه)

1. در برنامه ثبت‌نام کنید و ایمیل را باز کنید.
2. دکمهٔ تأیید باید برنامه را باز کند و پیام «ایمیل شما تأیید شد» را نشان دهد.
3. با ایمیل و رمز عبور وارد شوید.
4. لینک را دوباره باز کنید: باید پیام «منقضی یا قبلاً استفاده شده» بیاید.
5. لینک بازیابی رمز را هم امتحان کنید؛ باید مثل قبل به فرم رمز جدید برسد.

## ۷. محدودیت امنیتی

`barberapp://` یک custom scheme است و برنامهٔ دیگری هم می‌تواند آن را ثبت
کند. برای انتشار عمومی، مسیر ترجیحی همان توصیهٔ
`docs/11-release-runbook.md` است: HTTPS App Links با `assetlinks.json` و
تنظیم `VITE_CONFIRM_EMAIL_REDIRECT_URL`/`VITE_RECOVERY_REDIRECT_URL` روی
دامنهٔ تأییدشده.
