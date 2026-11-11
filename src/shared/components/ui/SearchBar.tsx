import { useRef, type ChangeEvent } from 'react'
import styles from './SearchBar.module.css'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'جست‌وجو…',
  autoFocus = false,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  const handleClear = () => {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div className={styles.wrapper} role="search">
      <span className={styles.icon} aria-hidden="true">🔍</span>
      <input
        ref={inputRef}
        type="search"
        className={styles.input}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={placeholder}
        dir="auto"
      />
      {value && (
        <button
          type="button"
          className={styles.clear}
          onClick={handleClear}
          aria-label="پاک کردن جست‌وجو"
        >
          ✕
        </button>
      )}
    </div>
  )
}
