import { z } from 'zod'

const serviceLineSchema = z.object({
  service_id: z.string().optional().nullable(),
  service_name_snapshot: z.string().min(1, 'نام خدمت الزامی است').max(80),
  price: z.string().transform(v => {
    const n = Number(v.replace(/,/g, ''))
    return isNaN(n) || n < 0 ? 0 : n
  }),
  duration_minutes: z
    .string()
    .optional()
    .transform(v => {
      if (!v || v.trim() === '') return null
      const n = parseInt(v, 10)
      return isNaN(n) || n <= 0 ? null : n
    }),
})

export const appointmentSchema = z.object({
  customer_id: z.string().optional().nullable(),
  title: z
    .string()
    .min(1, 'عنوان نوبت الزامی است')
    .max(100)
    .transform(v => v.trim()),
  date: z.string().min(1, 'تاریخ الزامی است'), // YYYY-MM-DD
  time: z
    .string()
    .min(1, 'ساعت الزامی است')
    .regex(/^\d{2}:\d{2}$/, 'فرمت ساعت صحیح نیست'), // HH:MM
  duration_minutes: z
    .string()
    .min(1, 'مدت الزامی است')
    .transform(v => {
      const n = parseInt(v, 10)
      if (isNaN(n) || n <= 0) throw new Error('مدت نوبت باید بزرگ‌تر از صفر باشد')
      return n
    }),
  notes: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform(v => (v?.trim() === '' ? null : (v?.trim() ?? null))),
  services: z.array(serviceLineSchema).min(1, 'حداقل یک خدمت الزامی است'),
})

export type AppointmentFormData = z.infer<typeof appointmentSchema>
export type ServiceLineFormData = z.infer<typeof serviceLineSchema>

// Status display map
export const STATUS_LABELS: Record<string, string> = {
  reserved: 'رزرو شده',
  confirmed: 'تأیید شده',
  completed: 'انجام شده',
  cancelled: 'لغو شده',
  no_show: 'عدم مراجعه',
}

export const STATUS_COLORS: Record<string, string> = {
  reserved: '#2563eb',
  confirmed: '#16a34a',
  completed: '#6b7280',
  cancelled: '#dc2626',
  no_show: '#d97706',
}
