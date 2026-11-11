import { z } from 'zod'

// ── Quick Sale ────────────────────────────────────────────────────────────────

export const quickSaleSchema = z.object({
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
    .transform(v => (v?.trim() === '' ? null : v?.trim() ?? null)),
})

export type QuickSaleFormData = z.infer<typeof quickSaleSchema>

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
    .transform(v => (v?.trim() === '' ? null : v?.trim() ?? null)),
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
  category: z
    .string()
    .max(60)
    .optional()
    .nullable()
    .transform(v => (v?.trim() === '' ? null : v?.trim() ?? null)),
  note: z
    .string()
    .max(300)
    .optional()
    .nullable()
    .transform(v => (v?.trim() === '' ? null : v?.trim() ?? null)),
})

export type ExpenseFormData = z.infer<typeof expenseSchema>

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash:  'نقد',
  card:  'کارت',
  other: 'سایر',
}
