/**
 * ExpenseForm — create or edit an expense.
 */
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRef } from 'react'
import { expenseSchema, type ExpenseFormData } from './finance.schemas'
import { FormField } from '@shared/components/forms/FormField'
import { JalaliDateInput } from '@shared/components/forms/JalaliDateInput'
import { Button } from '@shared/components/ui/Button'
import { todayISO } from '@shared/utils/jalali'
import { storageToToman } from '@shared/utils/helpers'
import { localDateISO } from '@shared/utils/datetime'
import styles from './FinanceForm.module.css'

interface RawExpenseFormValues {
  title: string
  amount: string
  date: string
  category: string
  note: string
}

export interface ExpenseFormInitial {
  title: string
  amount: number // storage value
  spent_at: string
  category: string | null
  note: string | null
}

interface ExpenseFormProps {
  defaultDate?: string
  initial?: ExpenseFormInitial
  onSubmit: (data: ExpenseFormData) => Promise<void>
  onCancel: () => void
  submitLabel?: string
  error?: string | null
}

export function ExpenseForm({
  defaultDate,
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'ثبت هزینه',
  error,
}: ExpenseFormProps) {
  const submitLock = useRef(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RawExpenseFormValues>({
    resolver: zodResolver(expenseSchema) as never,
    defaultValues: initial
      ? {
          title: initial.title,
          amount: String(storageToToman(initial.amount)),
          date: localDateISO(initial.spent_at),
          category: initial.category ?? '',
          note: initial.note ?? '',
        }
      : {
          title: '',
          amount: '',
          date: defaultDate ?? todayISO(),
          category: '',
          note: '',
        },
  })

  const watchDate = watch('date')

  return (
    <form
      onSubmit={e => {
        void handleSubmit(async data => {
          if (submitLock.current) return
          submitLock.current = true
          try {
            await onSubmit(data as unknown as ExpenseFormData)
          } finally {
            submitLock.current = false
          }
        })(e)
      }}
      noValidate
      className={styles.form}
    >
      <FormField
        label="عنوان هزینه"
        type="text"
        required
        placeholder="مثلاً: اجاره صندلی"
        {...register('title')}
        error={errors.title}
      />

      <div className={styles.row}>
        <FormField
          label="مبلغ (تومان)"
          type="text"
          inputMode="numeric"
          required
          placeholder="مثلاً: 500000"
          {...register('amount')}
          error={errors.amount}
        />
        <FormField
          label="دسته (اختیاری)"
          type="text"
          placeholder="مثلاً: اجاره"
          {...register('category')}
          error={errors.category}
        />
      </div>

      <JalaliDateInput
        label="تاریخ"
        required
        value={watchDate}
        onChange={next => setValue('date', next, { shouldValidate: true })}
        error={errors.date?.message}
      />

      <div className={styles.field}>
        <label className={styles.label}>یادداشت</label>
        <textarea
          className={styles.textarea}
          rows={2}
          placeholder="اختیاری"
          dir="auto"
          {...register('note')}
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
