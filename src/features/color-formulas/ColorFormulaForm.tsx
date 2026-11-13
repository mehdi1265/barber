/**
 * ColorFormulaForm — create or edit a recipe and its product lines.
 * Amounts are entered in grams/millilitres with at most two decimals, which
 * matches the cloud NUMERIC(5,2) columns exactly.
 */
import { useRef } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  colorFormulaSchema,
  type ColorFormulaFormData,
  MAX_ITEM_AMOUNT,
} from './color-formulas.schemas'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import { useCustomers } from '@features/customers/customers.hooks'
import { useCustomerVisits } from './color-formulas.hooks'
import { formatJalaliDate } from '@shared/utils/jalali'
import type { ColorFormula, ColorFormulaItem } from '@shared/types'
import styles from './ColorFormulaForm.module.css'

interface RawItem {
  item_id?: string
  product_name: string
  color_code: string
  amount: string
  unit: string
}

interface RawFormulaValues {
  title: string
  brand: string
  color_code: string
  oxidant_type: string
  oxidant_percent: string
  mix_ratio: string
  processing_minutes: string
  notes: string
  customer_id: string
  visit_id: string
  items: RawItem[]
}

function emptyItem(): RawItem {
  return { product_name: '', color_code: '', amount: '', unit: 'g' }
}

interface ColorFormulaFormProps {
  defaultValues?: Partial<ColorFormula> & { items?: ColorFormulaItem[] }
  defaultCustomerId?: string
  onSubmit: (data: ColorFormulaFormData) => Promise<void>
  onCancel: () => void
  submitLabel?: string
  error?: string | null
}

export function ColorFormulaForm({
  defaultValues,
  defaultCustomerId,
  onSubmit,
  onCancel,
  submitLabel = 'ذخیره فرمول',
  error,
}: ColorFormulaFormProps) {
  const { data: customers = [] } = useCustomers()
  const submitLock = useRef(false)

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RawFormulaValues>({
    resolver: zodResolver(colorFormulaSchema) as never,
    defaultValues: {
      title: defaultValues?.title ?? '',
      brand: defaultValues?.brand ?? '',
      color_code: defaultValues?.color_code ?? '',
      oxidant_type: defaultValues?.oxidant_type ?? '',
      oxidant_percent:
        defaultValues?.oxidant_percent != null ? String(defaultValues.oxidant_percent) : '',
      mix_ratio: defaultValues?.mix_ratio ?? '',
      processing_minutes:
        defaultValues?.processing_minutes != null ? String(defaultValues.processing_minutes) : '',
      notes: defaultValues?.notes ?? '',
      customer_id: defaultValues?.customer_id ?? defaultCustomerId ?? '',
      visit_id: defaultValues?.visit_id ?? '',
      items:
        defaultValues?.items && defaultValues.items.length > 0
          ? defaultValues.items.map(item => ({
              item_id: item.id,
              product_name: item.product_name,
              color_code: item.color_code ?? '',
              amount: String(item.amount),
              unit: item.unit,
            }))
          : [emptyItem()],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const customerId = watch('customer_id')
  const { data: visits = [] } = useCustomerVisits(customerId || '')

  return (
    <form
      onSubmit={e => {
        void handleSubmit(async data => {
          if (submitLock.current) return
          submitLock.current = true
          try {
            await onSubmit(data as unknown as ColorFormulaFormData)
          } finally {
            submitLock.current = false
          }
        })(e)
      }}
      noValidate
      className={styles.form}
    >
      <FormField
        label="عنوان فرمول"
        type="text"
        required
        placeholder="مثلاً: بلوند دکولوره، قهوه‌ای شکلاتی"
        {...register('title')}
        error={errors.title}
      />

      <div className={styles.row}>
        <FormField
          label="برند"
          type="text"
          placeholder="اختیاری"
          {...register('brand')}
          error={errors.brand}
        />
        <FormField
          label="کد رنگ"
          type="text"
          placeholder="اختیاری"
          {...register('color_code')}
          error={errors.color_code}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>مشتری (اختیاری)</label>
        <select className={styles.select} {...register('customer_id')}>
          <option value="">— بدون مشتری —</option>
          {customers.map(customer => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>مراجعه (اختیاری)</label>
        <select
          className={styles.select}
          disabled={!customerId || visits.length === 0}
          {...register('visit_id')}
        >
          <option value="">
            {!customerId
              ? 'اول مشتری را انتخاب کنید'
              : visits.length === 0
                ? 'برای این مشتری مراجعه‌ای ثبت نشده'
                : '— بدون مراجعه —'}
          </option>
          {visits.map(visit => (
            <option key={visit.id} value={visit.id}>
              {formatJalaliDate(visit.visited_at)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <FormField
          label="نوع اکسیدان"
          type="text"
          placeholder="مثلاً: کرم اکسیدان"
          {...register('oxidant_type')}
          error={errors.oxidant_type}
        />
        <FormField
          label="درصد اکسیدان"
          type="text"
          inputMode="decimal"
          placeholder="مثلاً: 6"
          {...register('oxidant_percent')}
          error={errors.oxidant_percent}
        />
      </div>

      <div className={styles.row}>
        <FormField
          label="نسبت ترکیب"
          type="text"
          placeholder="مثلاً: 1:1.5"
          {...register('mix_ratio')}
          error={errors.mix_ratio}
        />
        <FormField
          label="زمان (دقیقه)"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="مثلاً: 35"
          {...register('processing_minutes')}
          error={errors.processing_minutes}
        />
      </div>

      <div className={styles.itemsSection}>
        <div className={styles.itemsHeader}>
          <span className={styles.label}>اجزای ترکیب</span>
          <button type="button" className={styles.addBtn} onClick={() => append(emptyItem())}>
            + افزودن قلم
          </button>
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className={styles.itemLine}>
            <input type="hidden" {...register(`items.${index}.item_id`)} />
            <input
              className={styles.inputFull}
              placeholder="نام محصول *"
              aria-label={`نام محصول ${index + 1}`}
              dir="auto"
              {...register(`items.${index}.product_name`)}
            />
            <input
              className={styles.input}
              placeholder="کد رنگ"
              aria-label={`کد رنگ ${index + 1}`}
              dir="auto"
              {...register(`items.${index}.color_code`)}
            />
            <input
              className={styles.input}
              placeholder={`مقدار (حداکثر ${MAX_ITEM_AMOUNT})`}
              aria-label={`مقدار ${index + 1}`}
              inputMode="decimal"
              dir="ltr"
              {...register(`items.${index}.amount`)}
            />
            <select
              className={styles.input}
              aria-label={`واحد ${index + 1}`}
              {...register(`items.${index}.unit`)}
            >
              <option value="g">گرم</option>
              <option value="ml">میلی‌لیتر</option>
              <option value="cc">سی‌سی</option>
            </select>
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => remove(index)}
              disabled={fields.length === 1}
              aria-label={`حذف قلم ${index + 1}`}
            >
              🗑️
            </button>

            {errors.items?.[index]?.product_name && (
              <p className={styles.fieldError}>{errors.items[index].product_name.message}</p>
            )}
            {errors.items?.[index]?.amount && (
              <p className={styles.fieldError}>{errors.items[index].amount.message}</p>
            )}
          </div>
        ))}

        {errors.items?.root && <p className={styles.fieldError}>{errors.items.root.message}</p>}
      </div>

      <div className={styles.field}>
        <label className={styles.label}>یادداشت</label>
        <textarea
          className={styles.textarea}
          rows={3}
          placeholder="هر نکته‌ای دربارهٔ این فرمول"
          dir="auto"
          {...register('notes')}
        />
      </div>

      {error && (
        <div className={styles.serverError} role="alert">
          {error}
        </div>
      )}

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onCancel} fullWidth>
          انصراف
        </Button>
        <Button type="submit" fullWidth loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
