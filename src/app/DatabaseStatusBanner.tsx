import { useState } from 'react'
import { initializeDatabase } from './bootstrap'
import { useDatabaseStore } from '@state/database.store'
import { Button } from '@shared/components/ui/Button'
import styles from './DatabaseStatusBanner.module.css'

/**
 * Non-blocking database failure banner.
 *
 * The app tree (including /login) stays mounted; only the local database is
 * unavailable. Detailed errors are logged to the console, never rendered.
 */
export function DatabaseStatusBanner() {
  const status = useDatabaseStore(s => s.status)
  const [retrying, setRetrying] = useState(false)

  if (status !== 'error') return null

  const retry = async () => {
    setRetrying(true)
    try {
      await initializeDatabase()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className={styles.banner} role="alert" aria-live="assertive" dir="rtl">
      <div className={styles.text}>
        <strong className={styles.title}>خطا در پایگاه داده</strong>
        <span className={styles.message}>
          پایگاه داده محلی در دسترس نیست. برنامه می‌تواند باز شود، اما ذخیره اطلاعات ممکن
          نیست. دوباره تلاش کنید.
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        loading={retrying}
        onClick={() => {
          void retry()
        }}
      >
        تلاش دوباره
      </Button>
    </div>
  )
}
