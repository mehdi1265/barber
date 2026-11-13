import { useMemo } from 'react'
import { getDate, getDaysInMonth, getMonth, getYear, newDate } from 'date-fns-jalali'
import { isDateISO, parseLocalDate } from '@shared/utils/datetime'
import styles from './JalaliDateInput.module.css'

const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
]

interface JalaliDateInputProps {
  label: string
  /** Gregorian storage date, `YYYY-MM-DD` */
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  id?: string
  disabled?: boolean
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Jalali year/month/day selects; emits the matching Gregorian `YYYY-MM-DD`. */
export function JalaliDateInput({
  label,
  value,
  onChange,
  error,
  required,
  id,
  disabled,
}: JalaliDateInputProps) {
  const fieldId = id ?? `jalali-date-${label.replace(/\s+/g, '-')}`
  const errorId = `${fieldId}-error`

  const selected = value && isDateISO(value) ? parseLocalDate(value) : new Date()
  const year = getYear(selected)
  const month = getMonth(selected) + 1
  const day = getDate(selected)
  const currentYear = getYear(new Date())

  const years = useMemo(() => {
    const first = Math.min(currentYear - 10, year)
    const last = Math.max(currentYear + 2, year)
    return Array.from({ length: last - first + 1 }, (_, i) => first + i)
  }, [currentYear, year])

  const daysInMonth = getDaysInMonth(newDate(year, month - 1, 1))
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const emit = (nextYear: number, nextMonth: number, nextDay: number) => {
    const maxDay = getDaysInMonth(newDate(nextYear, nextMonth - 1, 1))
    const gregorian = newDate(nextYear, nextMonth - 1, Math.min(nextDay, maxDay))
    onChange(
      `${gregorian.getFullYear()}-${pad2(gregorian.getMonth() + 1)}-${pad2(gregorian.getDate())}`
    )
  }

  const selectClass = [styles.select, error ? styles.selectError : ''].filter(Boolean).join(' ')

  return (
    <div className={styles.wrapper}>
      <label htmlFor={`${fieldId}-year`} className={styles.label}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>

      <div className={styles.row}>
        <select
          id={`${fieldId}-year`}
          className={selectClass}
          value={year}
          disabled={disabled}
          aria-label="سال"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={e => emit(Number(e.target.value), month, day)}
        >
          {years.map(y => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={month}
          disabled={disabled}
          aria-label="ماه"
          onChange={e => emit(year, Number(e.target.value), day)}
        >
          {JALALI_MONTHS.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={day}
          disabled={disabled}
          aria-label="روز"
          onChange={e => emit(year, month, Number(e.target.value))}
        >
          {days.map(d => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p id={errorId} className={styles.errorMsg} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
