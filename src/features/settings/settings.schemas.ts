import { z } from 'zod'
import { CURRENCY_OPTIONS } from '@shared/utils/currency'

export const profileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, 'نام نمایشی الزامی است')
    .max(60, 'نام نمایشی حداکثر ۶۰ کاراکتر می‌تواند باشد'),
  phone: z
    .string()
    .trim()
    .max(20, 'شماره تماس خیلی طولانی است')
    .transform(v => (v === '' ? null : v)),
  currency_code: z
    .string()
    .refine(
      code => CURRENCY_OPTIONS.some(option => option.code === code),
      'واحد پول انتخاب‌شده معتبر نیست'
    ),
})

export type ProfileFormData = z.infer<typeof profileSchema>
