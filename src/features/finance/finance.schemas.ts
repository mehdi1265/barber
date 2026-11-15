import { z } from 'zod'

// ── Shared parsing ─────────────────────────────────────────────────────────────

/** Parses a Persian/Latin numeric string; empty → 0 */
function parseAmount(value: string): number {
  const n = Number(value.replace(/,/g, '').replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776)))
  return isNaN(n) ? 0 : n
}

// ── Quick Sale ────────────────────────────────────────────────────────────────

export const quickSaleSchema = z
  .object({
    title: z
      .string()
      .min(1, 'عنوان خدمت الزامی است')
      .max(100)
      .transform(v => v.trim()),
    amount: z
      .string()
      .min(1, 'مبلغ الزامی است')
      .transform(v => {
        const n = Number(v.replace(/,/g, ''))
        if (isNaN(n) || n <= 0) throw new Error('مبلغ باید بزرگ‌تر از صفر باشد')
        return n
      }),
    payment_method: z.enum(['cash', 'card', 'other']).default('cash'),
    paid_amount: z
      .string()
      .optional()
      .transform(v => {
        if (!v || v.trim() === '') return null
        const n = Number(v.replace(/,/g, ''))
        return isNaN(n) || n < 0 ? null : n
      }),
    customer_id: z.string().optional().nullable(),
    notes: z
      .string()
      .max(300)
      .optional()
      .nullable()
      .transform(v => (v?.trim() === '' ? null : (v?.trim() ?? null))),
  })
  .superRefine((data, ctx) => {
    if (data.paid_amount != null && data.paid_amount > data.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paid_amount'],
        message: 'مبلغ دریافتی نمی‌تواند از مبلغ کل بیشتر باشد',
      })
    }
  })

export type QuickSaleFormData = z.infer<typeof quickSaleSchema>

// ── Visit (walk-in) ──────────────────────────────────────────────────────────

const visitServiceLineSchema = z.object({
  service_id: z.string().optional().nullable(),
  service_name_snapshot: z
    .string()
    .min(1, 'نام خدمت الزامی است')
    .max(80)
    .transform(v => v.trim()),
  quantity: z
    .string()
    .optional()
    .transform(v => {
      const n = parseInt(v ?? '', 10)
      return isNaN(n) || n <= 0 ? 1 : n
    }),
  unit_price: z.string().transform(v => {
    const n = parseAmount(v)
    return n < 0 ? 0 : n
  }),
  discount_amount: z
    .string()
    .optional()
    .transform(v => {
      const n = parseAmount(v ?? '')
      return n < 0 ? 0 : n
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

export const visitSchema = z.object({
  customer_id: z.string().optional().nullable(),
  date: z.string().min(1, 'تاریخ الزامی است'), // YYYY-MM-DD
  time: z
    .string()
    .min(1, 'ساعت الزامی است')
    .regex(/^\d{2}:\d{2}$/, 'فرمت ساعت صحیح نیست'),
  notes: z
    .string()
    .max(300)
    .optional()
    .nullable()
    .transform(v => (v?.trim() === '' ? null : (v?.trim() ?? null))),
  services: z
    .array(visitServiceLineSchema)
    .min(1, 'حداقل یک خدمت الزامی است')
    .max(50, 'حداکثر ۵۰ خدمت مجاز است'),
  payment_method: z.enum(['cash', 'card', 'other']).default('cash'),
  paid_amount: z
    .string()
    .optional()
    .transform(v => {
      if (!v || v.trim() === '') return null
      const n = parseAmount(v)
      return n < 0 ? null : n
    }),
})

export type VisitFormData = z.infer<typeof visitSchema>
export type VisitServiceLineFormData = z.infer<typeof visitServiceLineSchema>

// ── Payment ───────────────────────────────────────────────────────────────────

export const paymentSchema = z.object({
  amount: z
    .string()
    .min(1, 'مبلغ الزامی است')
    .transform(v => {
      const n = Number(v.replace(/,/g, ''))
      if (isNaN(n) || n <= 0) throw new Error('مبلغ باید بزرگ‌تر از صفر باشد')
      return n
    }),
  method: z.enum(['cash', 'card', 'other']).default('cash'),
  note: z
    .string()
    .max(200)
    .optional()
    .nullable()
    .transform(v => (v?.trim() === '' ? null : (v?.trim() ?? null))),
})

export type PaymentFormData = z.infer<typeof paymentSchema>

// ── Expense ───────────────────────────────────────────────────────────────────

export const expenseSchema = z.object({
  title: z
    .string()
    .min(1, 'عنوان هزینه الزامی است')
    .max(100)
    .transform(v => v.trim()),
  amount: z
    .string()
    .min(1, 'مبلغ الزامی است')
    .transform(v => {
      const n = Number(v.replace(/,/g, ''))
      if (isNaN(n) || n <= 0) throw new Error('مبلغ باید بزرگ‌تر از صفر باشد')
      return n
    }),
  date: z.string().min(1, 'تاریخ الزامی است'), // YYYY-MM-DD
  category: z
    .string()
    .max(60)
    .optional()
    .nullable()
    .transform(v => (v?.trim() === '' ? null : (v?.trim() ?? null))),
  note: z
    .string()
    .max(300)
    .optional()
    .nullable()
    .transform(v => (v?.trim() === '' ? null : (v?.trim() ?? null))),
})

export type ExpenseFormData = z.infer<typeof expenseSchema>

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقد',
  card: 'کارت',
  other: 'سایر',
}
