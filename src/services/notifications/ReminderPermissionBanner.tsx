/**
 * One-time contextual prompt for notification permission.
 * Shown in the app shell only where local notifications exist (native),
 * with a Persian rationale before the OS dialog appears.
 */

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '@state/auth.store'
import { usePreferencesStore } from '@state/preferences.store'
import {
  getNotificationPermission,
  requestNotificationPermission,
  rescheduleAllReminders,
  type NotificationPermission,
} from './local-notifications'
import styles from './ReminderPermissionBanner.module.css'

export function ReminderPermissionBanner() {
  const userId = useAuthStore(state => state.userId)
  const remindersEnabled = usePreferencesStore(state => state.remindersEnabled)
  const dismissed = usePreferencesStore(state => state.permissionPromptDismissed)
  const dismiss = usePreferencesStore(state => state.dismissPermissionPrompt)
  const [permission, setPermission] = useState<NotificationPermission | null>(null)
  const [busy, setBusy] = useState(false)

  const native = Capacitor.isNativePlatform()

  useEffect(() => {
    if (!native || !remindersEnabled) return
    void getNotificationPermission().then(setPermission)
  }, [native, remindersEnabled])

  if (
    !native ||
    !remindersEnabled ||
    dismissed ||
    (permission !== 'prompt' && permission !== 'denied')
  ) {
    return null
  }

  const enable = async () => {
    setBusy(true)
    try {
      const granted = await requestNotificationPermission()
      setPermission(granted ? 'granted' : 'denied')
      if (granted && userId) await rescheduleAllReminders(userId)
    } finally {
      setBusy(false)
    }
  }

  if (permission === 'denied') {
    return (
      <div className={styles.banner} role="status">
        <p className={styles.text}>
          اجازه اعلان داده نشده است؛ یادآوری نوبت‌ها نمایش داده نمی‌شود. می‌توانید از تنظیمات دستگاه
          آن را فعال کنید.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.dismissBtn} onClick={dismiss}>
            متوجه شدم
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.banner} role="status">
      <p className={styles.text}>
        برای یادآوری نوبت‌ها پیش از موعد، اجازه نمایش اعلان لازم است. اعلان‌ها فقط روی همین دستگاه
        ساخته می‌شوند.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.enableBtn}
          disabled={busy}
          onClick={() => {
            void enable()
          }}
        >
          فعال‌سازی یادآوری
        </button>
        <button type="button" className={styles.dismissBtn} onClick={dismiss}>
          بعداً
        </button>
      </div>
    </div>
  )
}
