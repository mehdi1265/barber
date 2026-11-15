# 05 — معماری فنی

## فناوری‌های انتخاب‌شده
| بخش | فناوری | کاربرد |
|---|---|---|
| رابط | React + TypeScript | ساخت صفحه‌ها |
| ابزار توسعه | Vite | اجرای محیط توسعه و build |
| موبایل | Capacitor | اجرای برنامه روی Android و iOS |
| دیتابیس محلی | SQLite | ذخیره داده و کار آفلاین |
| افزونه SQLite | `@capacitor-community/sqlite` | اتصال اپ به SQLite |
| Backend | Supabase | Auth، API و خدمات ابری |
| دیتابیس ابری | PostgreSQL در Supabase | نسخه ابری اطلاعات |
| فایل‌ها | Supabase Storage | عکس‌ها و فایل‌ها |
| وضعیت رابط | Zustand | state رابط کاربری |
| درخواست آنلاین | TanStack Query | درخواست و cache شبکه |
| اعلان | Capacitor Local Notifications | یادآوری روی گوشی |
| اعتبارسنجی | Zod | اعتبارسنجی داده‌ها |
| تست | Vitest و ابزار تست React | تست منطق و رابط |

**Django در نسخه فعلی استفاده نمی‌شود.** Supabase نیازهای Backend نسخه اول را پوشش می‌دهد. اضافه کردن Django فقط با دلیل فنی مشخص در آینده بررسی شود.

## لایه‌های برنامه
1. UI: صفحه‌ها و کامپوننت‌های React.
2. Application: کارهایی مانند ثبت نوبت، ثبت پرداخت و ثبت هزینه.
3. Repository: واسطه خواندن و نوشتن داده.
4. Local Database: پیاده‌سازی محلی با SQLite.
5. Remote Services: ارتباط با Supabase.
6. Sync Engine: انتقال تغییرات بین SQLite و Supabase.

کامپوننت‌ها نباید مستقیم SQL یا درخواست Supabase بنویسند؛ از Use Case و Repository استفاده کنند.

## اصل Offline-first
هنگام ثبت یا ویرایش، ابتدا SQLite به‌روزرسانی شود و عملیات در جدول Outbox قرار بگیرد. کاربر فوراً نتیجه را ببیند. اگر اینترنت نبود، عملیات برای بعد بماند. TanStack Query جای SQLite یا Sync Engine نیست و Zustand هم پایگاه داده نیست.

## Sync Engine
باید شناسه UUID، صف ایجاد/ویرایش/حذف، تلاش مجدد، جلوگیری از عملیات تکراری (idempotency)، ثبت زمان تغییر، دریافت تغییرات سرور و نمایش وضعیت sync را پشتیبانی کند.

برای یادداشت‌های ساده می‌توان آخرین تغییر معتبر را پذیرفت. برای پرداخت و نوبت، تعارض نباید بی‌صدا بازنویسی شود. پرداخت‌ها رویدادهای مستقل باشند تا sync دوباره باعث ثبت تکراری نشود.

## عکس‌ها
عکس ابتدا محلی ذخیره شود. مسیر محلی و وضعیت بارگذاری در SQLite نگهداری شود. سپس به bucket خصوصی Supabase Storage ارسال شود. عکس اصلی در صورت نیاز دانلود شود و امکان حذف محلی و ابری وجود داشته باشد.

## امنیت
- کلید محرمانه سرور در اپلیکیشن قرار نگیرد.
- RLS برای همه جدول‌های کاربرمحور فعال باشد.
- هر رکورد دارای `user_id` باشد.
- bucket عکس‌ها private باشد.
- توکن‌ها در فضای امن دستگاه نگهداری شوند.
- PIN/biometric و رمزنگاری SQLite با SQLCipher در صورت سازگاری بررسی شوند.
- اطلاعات مشتری بدون رضایت به AI ارسال نشود.

## ساختار پیشنهادی کد
```text
src/
  app/                 # راه‌اندازی، route و provider
  features/
    auth/
    dashboard/
    appointments/
    customers/
    services/
    color-formulas/
    quick-sales/
    finance/
    notifications/
    settings/
  database/
    migrations/
    repositories/
    sqlite/
  sync/
    outbox/
    sync-engine/
    conflict-resolution/
  services/
    supabase/
    storage/
    notifications/
  shared/
    components/
    hooks/
    types/
    utils/
  state/
  tests/
```

منطق مالی و بررسی تداخل نوبت باید مستقل و قابل تست باشد. migrationها نسخه‌بندی شوند و نسخه‌های کتابخانه‌ها در lockfile ثابت بمانند.
