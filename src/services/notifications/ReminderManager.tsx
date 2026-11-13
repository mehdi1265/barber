/**
 * Keeps local reminders in sync with the appointment list on app start and
 * opens the appointment when a reminder is tapped.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useAuthStore } from '@state/auth.store'
import { rescheduleAllReminders } from './local-notifications'

export function ReminderManager() {
  const navigate = useNavigate()
  const userId = useAuthStore(state => state.userId)

  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return

    void rescheduleAllReminders(userId)

    let disposed = false
    let handle: { remove: () => Promise<void> } | null = null

    void LocalNotifications.addListener('localNotificationActionPerformed', action => {
      const extra = action.notification.extra as { appointmentId?: unknown } | null | undefined
      if (typeof extra?.appointmentId === 'string') {
        void navigate(`/appointments/${extra.appointmentId}`)
      }
    }).then(listener => {
      if (disposed) {
        void listener.remove()
      } else {
        handle = listener
      }
    })

    return () => {
      disposed = true
      if (handle) void handle.remove()
    }
  }, [navigate, userId])

  return null
}
