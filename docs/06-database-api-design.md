# 06 — طراحی دیتابیس و API

## قواعد پایه
- هر آرایشگر حساب مستقل دارد؛ تمام داده‌های متعلق به او `user_id` دارند.
- در نسخه فعلی جدول سالن، کارکنان، کمیسیون و سهم سالن نیاز نیست.
- شناسه رکوردها UUID باشد تا ساخت آفلاین و sync ممکن شود.
- زمان‌های `created_at` و `updated_at` ثبت شوند.
- حذف داده همگام‌شونده باید به شکل soft delete/tombstone ثبت شود تا حذف به سرور منتقل شود.
- پرداخت‌ها نباید با ویرایش ساده یا حذف بی‌ردپا از تاریخچه پاک شوند.

## جدول‌های پیشنهادی

### `profiles`
`id` (شناسه کاربر Supabase Auth)، `display_name`، `phone` اختیاری، `currency_code`، `created_at`، `updated_at`.

### `customers`
`id`، `user_id`، `name`، `phone` اختیاری، `notes` اختیاری، `created_at`، `updated_at`، `deleted_at`.

### `services`
`id`، `user_id`، `name`، `default_price` اختیاری، `suggested_duration_minutes` اختیاری، `is_active`، زمان‌های ایجاد و ویرایش. مدت این جدول فقط پیشنهاد اولیه است.

### `appointments`
`id`، `user_id`، `customer_id` nullable، `title`، `start_at`، `duration_minutes`، `end_at`، `status`، `notes`، زمان‌های ایجاد و ویرایش و `deleted_at`.
**مدت مخصوص همان نوبت ذخیره می‌شود و باید توسط آرایشگر قابل تعیین باشد.** ساعت پایان از شروع و مدت به دست می‌آید. نوبت لغوشده در بررسی تداخل لحاظ نشود.

### `appointment_services`
برای نوبت چندخدمتی: `id`، `user_id`، `appointment_id`، `service_id` nullable، `service_name_snapshot`، `price`، `duration_minutes` اختیاری. اگر MVP فقط یک خدمت برای هر نوبت دارد، رابط می‌تواند ساده بماند.

### `visits`
`id`، `user_id`، `customer_id` nullable، `appointment_id` nullable، `visited_at`، `notes`، زمان‌های ایجاد و ویرایش. مراجعه حضوری بدون نوبت نیز باید قابل ثبت باشد.

### `visit_services`
`id`، `user_id`، `visit_id`، `service_id` nullable، `service_name_snapshot`، `quantity`، `unit_price`، `discount_amount`، `line_total`، `duration_minutes` اختیاری. نام و قیمت snapshot نگهداری شوند تا تغییر فهرست خدمات سوابق گذشته را عوض نکند.

### `payments`
`id`، `user_id`، `visit_id` nullable، `quick_sale_id` nullable، `amount`، `method`، `paid_at`، `note`، زمان‌های ایجاد و ویرایش. هر پرداخت رکورد جداگانه باشد. قواعد اتصال مقصد باید مانع اتصال اشتباه یا چندگانه شود.

### `expenses`
`id`، `user_id`، `title`، `category` اختیاری، `amount`، `spent_at`، `note`، زمان‌های ایجاد و ویرایش.

### `quick_sales`
`id`، `user_id`، `customer_id` nullable، `title`، `amount`، `duration_minutes` اختیاری، `sold_at`، `notes` و زمان‌های ایجاد و ویرایش.
**نکته طراحی:** ایجنت باید قبل از پیاده‌سازی، مدل مالی یکپارچه انتخاب کند؛ فروش سریع نباید هم در `quick_sales` و هم به‌عنوان خدمت مراجعه دوباره شمرده شود. می‌توان Quick Sale را نوعی مراجعه/صورتحساب بدون مشتری دانست.

### `color_formulas`
`id`، `user_id`، `title`، `brand`، `color_code`، `oxidant_type`، `oxidant_percent`، `mix_ratio`، `processing_minutes`، `notes` و زمان‌های ایجاد و ویرایش.

### `color_formula_items`
`id`، `user_id`، `formula_id`، `product_name`، `color_code`، `amount`، `unit` و زمان‌های ایجاد و ویرایش.

### `customer_photos`
`id`، `user_id`، `customer_id` nullable، `visit_id` nullable، `storage_path`، `photo_type` (before/after/other)، `caption`، زمان‌های ایجاد و ویرایش و `deleted_at`. `local_path` فقط در دیتابیس محلی نگهداری شود، نه دیتابیس ابری.

### `sync_outbox` — فقط SQLite
`id`، `entity_type`، `entity_id`، `operation`، `payload`، `created_at`، `attempt_count`، `last_error`، `status`. این جدول داخلی صف همگام‌سازی است.

## ارتباط‌های مهم
- هر مشتری می‌تواند چند نوبت و مراجعه داشته باشد.
- نوبت می‌تواند بدون مشتری باشد.
- مراجعه می‌تواند از نوبت ایجاد شود یا Walk-in باشد.
- هر مراجعه چند خدمت و چند پرداخت می‌تواند داشته باشد.
- فرمول رنگ چند جزء دارد.
- عکس می‌تواند به مشتری یا مراجعه متصل باشد.
- تمام ارتباط‌ها باید مالکیت `user_id` را کنترل کنند.

## محاسبه گزارش مالی
- مبلغ خدمات: مجموع `line_total` خدمات انجام‌شده در بازه.
- دریافتی بازه: مجموع پرداخت‌هایی که `paid_at` آن‌ها در بازه است.
- بدهی باز: مبلغ صورتحساب‌های انجام‌شده منهای پرداخت‌های متصل، با لحاظ تخفیف و برگشت وجه.
- هزینه بازه: مجموع هزینه‌هایی که `spent_at` آن‌ها در بازه است.
- مانده دریافتی پس از هزینه: دریافتی بازه منهای هزینه بازه.
- علاوه بر بدهی‌های ایجادشده در بازه، یک نمای «کل مانده بدهی تا امروز» لازم است.

مبلغ خدمات و پول دریافت‌شده یک مفهوم نیستند؛ ممکن است خدمت امروز انجام شود و پول فردا دریافت شود. این دو در گزارش جدا نمایش داده شوند.

## Supabase و API
از Supabase Auth، PostgreSQL، API و Storage استفاده شود. RLS همه جدول‌های کاربرمحور فعال باشد و مالکیت با `auth.uid()` کنترل شود. فایل‌ها در bucket خصوصی باشند. عملیات حساس مالی در صورت نیاز از طریق تابع سمت سرور/RPC اتمیک انجام شود.

## ایندکس و اعتبارسنجی
ایندکس روی `user_id` همراه با تاریخ/نام در جدول‌های پرتکرار ایجاد شود. مدت نوبت مثبت، مبلغ معتبر و foreign keyها فعال باشند. کاربر نتواند شناسه مشتری متعلق به کاربر دیگر را به نوبت خود وصل کند. sync مجدد نباید پرداخت تکراری بسازد.
