/**
 * PaymentForm — add a (partial) payment to a visit.
 */
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRef } from 'react'
import { paymentSchema, type PaymentFormData, PAYMENT_METHOD_LABELS } from './finance.schemas'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import { formatToman, storageToToman } from '@shared/utils/helpers'
import styles from './FinanceForm.module.css'

interface RawPaymentFormValues {
  amount: string
  method: 'cash' | 'card' | 'other'
  note: string
}

interface PaymentFormProps {
  /** Outstanding balance, storage value (Toman × 100) */
  remaining: number
  onSubmit: (data: PaymentFormData) => Promise<void>
  onCancel: () => void
  error?: string | null
}

export function PaymentForm({ remaining, onSubmit, onCancel, error }: PaymentFormProps) {
  const submitLock = useRef(false)
  const remainingToman = Math.max(storageToToman(remaining), 0)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RawPaymentFormValues>({
    resolver: zodResolver(paymentSchema) as never,
    defaultValues: {
      amount: remainingToman > 0 ? String(remainingToman) : '',
      method: 'cash',
      note: '',
    },
  })

  return (
    <form
      onSubmit={e => {
        void handleSubmit(async data => {
          if (submitLock.current) return
          submitLock.current = true
          try {
            await onSubmit(data as unknown as PaymentFormData)
          } finally {
            submitLock.current = false
          }
        })(e)
      }}
      noValidate
      className={styles.form}
    >
      <div className={styles.summary}>
        <span>باقی‌مانده قابل دریافت</span>
        <span className={styles.summaryValue}>{formatToman(remaining)}</span>
      </div>

      <FormField
        label="مبلغ پرداخت (تومان)"
        type="text"
        inputMode="numeric"
        required
        placeholder="مثلاً: 100000"
        {...register('amount')}
        error={errors.amount}
      />

      <div className={styles.field}>
        <label className={styles.label}>روش پرداخت</label>
        <div className={styles.methodGroup}>
          {(['cash', 'card', 'other'] as const).map(m => (
            <label key={m} className={styles.methodLabel}>
              <input type="radio" value={m} {...register('method')} />
              {PAYMENT_METHOD_LABELS[m]}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>یادداشت</label>
        <input className={styles.serviceInput} placeholder="اختیاری" {...register('note')} />
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
        <Button type="submit" fullWidth loading={isSubmitting} disabled={remaining <= 0}>
          ثبت پرداخت
        </Button>
      </div>
    </form>
  )
}
