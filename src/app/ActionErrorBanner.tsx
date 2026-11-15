import { useEffect } from 'react'
import { useActionErrorStore } from '@state/action-error.store'
import styles from './ActionErrorBanner.module.css'

const AUTO_DISMISS_MS = 10_000

/**
 * Global failure notice for user actions.
 *
 * Screens show their own inline message when they have one; this banner is the
 * safety net so a rejected write can never look like a button that does
 * nothing.
 */
export function ActionErrorBanner() {
  const message = useActionErrorStore(s => s.message)
  const clear = useActionErrorStore(s => s.clear)

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(clear, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [message, clear])

  if (!message) return null

  return (
    <div className={styles.banner} role="alert" aria-live="assertive" dir="rtl">
      <span className={styles.message}>{message}</span>
      <button type="button" className={styles.dismiss} onClick={clear} aria-label="بستن پیام">
        ✕
      </button>
    </div>
  )
}
