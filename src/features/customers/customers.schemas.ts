import { z } from 'zod'

export const customerSchema = z.object({
  name: z
    .string()
    .min(1, 'نام الزامی است')
    .max(80, 'نام حداکثر ۸۰ کاراکتر می‌تواند باشد')
    .transform(v => v.trim()),
  phone: z
    .string()
    .max(20, 'شماره تماس خیلی طولانی است')
    .optional()
    .nullable()
    .transform(v => (v?.trim() === '' ? null : v?.trim() ?? null)),
  notes: z
    .string()
    .max(500, 'یادداشت حداکثر ۵۰۰ کاراکتر می‌تواند باشد')
    .optional()
    .nullable()
    .transform(v => (v?.trim() === '' ? null : v?.trim() ?? null)),
})

export type CustomerFormData = z.infer<typeof customerSchema>
