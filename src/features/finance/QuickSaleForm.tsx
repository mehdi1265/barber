import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRef } from 'react'
import { quickSaleSchema, type QuickSaleFormData, PAYMENT_METHOD_LABELS } from './finance.schemas'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import { useCustomers } from '@features/customers/customers.hooks'
import styles from './FinanceForm.module.css'

interface RawQuickSale {
  title: string
  amount: string
  payment_method: 'cash' | 'card' | 'other'
  paid_amount: string
  customer_id: string
  notes: string
}

interface QuickSaleFormProps {
  onSubmit: (data: QuickSaleFormData) => Promise<void>
  onCancel: () => void
  error?: string | null
}

export function QuickSaleForm({ onSubmit, onCancel, error }: QuickSaleFormProps) {
  const { data: customers = [] } = useCustomers()
  const submitLock = useRef(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RawQuickSale>({
    resolver: zodResolver(quickSaleSchema) as never,
    defaultValues: {
      title: '',
      amount: '',
      payment_method: 'cash',
      paid_amount: '',
      customer_id: '',
      notes: '',
    },
  })

  const watchAmount = watch('amount')

  return (
    <form
      onSubmit={e => {
        void handleSubmit(async d => {
          if (submitLock.current) return
          submitLock.current = true
          try {
            await onSubmit(d as unknown as QuickSaleFormData)
          } finally {
            submitLock.current = false
          }
        })(e)
      }}
      noValidate
      className={styles.form}
    >
      <FormField
        label="عنوان خدمت"
        type="text"
        required
        placeholder="مثلاً: کوتاهی"
        {...register('title')}
        error={errors.title}
      />

      <FormField
        label="مبلغ کل (تومان)"
        type="text"
        inputMode="numeric"
        required
        placeholder="مثلاً: 150000"
        {...register('amount')}
        error={errors.amount}
      />

      <div className={styles.field}>
        <label className={styles.label}>روش پرداخت</label>
        <div className={styles.methodGroup}>
          {(['cash', 'card', 'other'] as const).map(m => (
            <label key={m} className={styles.methodLabel}>
              <input type="radio" value={m} {...register('payment_method')} />
              {PAYMENT_METHOD_LABELS[m]}
            </label>
          ))}
        </div>
      </div>

      <FormField
        label="مبلغ دریافت‌شده (تومان)"
        type="text"
        inputMode="numeric"
        placeholder={watchAmount || 'مثلاً: 100000 (اختیاری)'}
        hint="خالی = کل مبلغ دریافت شده"
        {...register('paid_amount')}
        error={errors.paid_amount}
      />

      <div className={styles.field}>
        <label className={styles.label}>مشتری (اختیاری)</label>
        <select className={styles.select} {...register('customer_id')}>
          <option value="">— بدون مشتری —</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <FormField
        label="یادداشت"
        type="text"
        placeholder="اختیاری"
        {...register('notes')}
        error={errors.notes}
      />

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onCancel} fullWidth>
          انصراف
        </Button>
        <Button type="submit" fullWidth loading={isSubmitting}>
          ثبت فروش
        </Button>
      </div>
    </form>
  )
}
