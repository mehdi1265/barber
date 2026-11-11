import { z } from 'zod'

export const serviceSchema = z.object({
  name: z
    .string()
    .min(1, 'نام خدمت الزامی است')
    .max(80, 'نام خدمت حداکثر ۸۰ کاراکتر می‌تواند باشد')
    .transform(v => v.trim()),
  default_price: z
    .string()
    .optional()
    .transform(v => {
      if (!v || v.trim() === '') return null
      const num = Number(v.replace(/,/g, ''))
      return isNaN(num) || num < 0 ? null : num
    }),
  suggested_duration_minutes: z
    .string()
    .optional()
    .transform(v => {
      if (!v || v.trim() === '') return null
      const num = parseInt(v, 10)
      return isNaN(num) || num <= 0 ? null : num
    }),
})

export type ServiceFormData = z.infer<typeof serviceSchema>
