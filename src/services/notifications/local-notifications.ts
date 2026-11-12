/**
 * Local notification service for appointment reminders.
 * Uses @capacitor/local-notifications.
 * On web, calls are silently no-op'd since the plugin isn't available.
 */

import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import type { Appointment } from '@shared/types'

const REMINDER_MINUTES_BEFORE = 30

function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false
  const result = await LocalNotifications.requestPermissions()
  return result.display === 'granted'
}

/**
 * Schedules a reminder notification for an appointment.
 * Does nothing on web or if notification time is in the past.
 */
export async function scheduleAppointmentReminder(
  appointment: Appointment,
  customerName?: string
): Promise<void> {
  if (!isNative()) return

  const startMs = new Date(appointment.start_at).getTime()
  const reminderMs = startMs - REMINDER_MINUTES_BEFORE * 60 * 1000

  if (reminderMs <= Date.now()) return // already past

  const title = customerName ? `نوبت ${customerName}` : appointment.title

  const body = `${REMINDER_MINUTES_BEFORE} دقیقه دیگر نوبت دارید`

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationIdFromUUID(appointment.id),
          title,
          body,
          schedule: { at: new Date(reminderMs) },
          sound: undefined,
          attachments: undefined,
          actionTypeId: '',
          extra: { appointmentId: appointment.id },
        },
      ],
    })
  } catch (err) {
    console.warn('[notifications] Failed to schedule:', err)
  }
}

/**
 * Cancels a previously-scheduled appointment reminder.
 */
export async function cancelAppointmentReminder(appointmentId: string): Promise<void> {
  if (!isNative()) return

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: notificationIdFromUUID(appointmentId) }],
    })
  } catch (err) {
    console.warn('[notifications] Failed to cancel:', err)
  }
}

/**
 * Converts a UUID string to a numeric notification ID.
 * Capacitor requires integer IDs.
 */
function notificationIdFromUUID(uuid: string): number {
  // Use the last 8 hex chars → 32-bit integer
  const hex = uuid.replace(/-/g, '').slice(-8)
  return parseInt(hex, 16) >>> 0 // unsigned 32-bit
}
