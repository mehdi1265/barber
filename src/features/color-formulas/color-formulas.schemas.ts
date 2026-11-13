import { z } from 'zod'
import { normalizeDigits } from '@shared/utils/helpers'

/** Server NUMERIC(5,2) upper bound for one line's amount. */
export const MAX_ITEM_AMOUNT = 999.99

function parseDecimal(value: string): number {
  const n = Number(normalizeDigits(value).replace(/,/g, ''))
  return isNaN(n) ? NaN : Math.round(n * 100) / 100
}

function optionalText(max: number, label: string) {
  return z
    .string()
    .max(max, `${label} حداکثر ${max} کاراکتر می‌تواند باشد`)
    .optional()
    .nullable()
    .transform(v => (v?.trim() === '' ? null : (v?.trim() ?? null)))
}

const formulaItemSchema = z
  .object({
    // useFieldArray reserves `id` for its own key, so the database id travels
    // in a separate field until validation output maps it back.
    item_id: z.string().optional(),
    product_name: z
      .string()
      .trim()
      .min(1, 'نام محصول الزامی است')
      .max(100, 'نام محصول حداکثر ۱۰۰ کاراکتر است'),
    color_code: optionalText(40, 'کد رنگ'),
    amount: z
      .string()
      .min(1, 'مقدار الزامی است')
      .transform((v, ctx) => {
        const n = parseDecimal(v)
        if (isNaN(n) || n <= 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'مقدار باید بزرگ‌تر از صفر باشد' })
          return z.NEVER
        }
        if (n > MAX_ITEM_AMOUNT) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `مقدار حداکثر می‌تواند ${MAX_ITEM_AMOUNT} باشد`,
          })
          return z.NEVER
        }
        return n
      }),
    unit: z
      .string()
      .max(10, 'واحد حداکثر ۱۰ کاراکتر است')
      .optional()
      .transform(v => v?.trim() || 'g'),
  })
  .transform(({ item_id, ...rest }) => ({ id: item_id || undefined, ...rest }))

export const colorFormulaSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'عنوان فرمول الزامی است')
    .max(100, 'عنوان حداکثر ۱۰۰ کاراکتر است'),
  brand: optionalText(80, 'برند'),
  color_code: optionalText(40, 'کد رنگ'),
  oxidant_type: optionalText(40, 'نوع اکسیدان'),
  oxidant_percent: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v || v.trim() === '') return null
      const n = parseDecimal(v)
      if (isNaN(n) || n < 0 || n > 99.99) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'درصد اکسیدان باید بین ۰ تا ۹۹٫۹۹ باشد',
        })
        return z.NEVER
      }
      return n
    }),
  mix_ratio: optionalText(30, 'نسبت ترکیب'),
  processing_minutes: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v || v.trim() === '') return null
      const n = parseInt(normalizeDigits(v), 10)
      if (isNaN(n) || n < 0 || n > 1440) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'زمان باید بین ۰ تا ۱۴۴۰ دقیقه باشد' })
        return z.NEVER
      }
      return n
    }),
  notes: optionalText(500, 'یادداشت'),
  customer_id: z
    .string()
    .optional()
    .nullable()
    .transform(v => (v?.trim() ? v : null)),
  visit_id: z
    .string()
    .optional()
    .nullable()
    .transform(v => (v?.trim() ? v : null)),
  items: z.array(formulaItemSchema).min(1, 'حداقل یک قلم مواد لازم است'),
})

export type ColorFormulaFormData = z.infer<typeof colorFormulaSchema>
