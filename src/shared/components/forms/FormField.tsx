/**
 * FormField — wraps a label + input + error message.
 * Works with react-hook-form via the register prop.
 */

import type { InputHTMLAttributes, ReactNode } from 'react'
import type { FieldError } from 'react-hook-form'
import styles from './FormField.module.css'

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: FieldError
  hint?: string
  endAdornment?: ReactNode
}

export function FormField({
  label,
  error,
  hint,
  endAdornment,
  id,
  ...inputProps
}: FormFieldProps) {
  const fieldId = id ?? `field-${label.replace(/\s+/g, '-')}`
  const errorId = `${fieldId}-error`

  return (
    <div className={styles.wrapper}>
      <label htmlFor={fieldId} className={styles.label}>
        {label}
        {inputProps.required && (
          <span className={styles.required} aria-hidden="true">
            {' '}*
          </span>
        )}
      </label>

      <div className={styles.inputWrapper}>
        <input
          id={fieldId}
          className={[styles.input, error ? styles.inputError : ''].filter(Boolean).join(' ')}
          aria-describedby={error ? errorId : hint ? `${fieldId}-hint` : undefined}
          aria-invalid={error ? 'true' : undefined}
          dir="auto"
          {...inputProps}
        />
        {endAdornment && <div className={styles.endAdornment}>{endAdornment}</div>}
      </div>

      {hint && !error && (
        <p id={`${fieldId}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className={styles.errorMsg} role="alert">
          {error.message}
        </p>
      )}
    </div>
  )
}
