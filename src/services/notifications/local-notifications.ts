/**
 * Local notification service for appointment reminders.
 *
 * Reminders are one notification per active appointment, scheduled at the lead
 * time chosen in Settings (default 30 min). The same numeric ID is reused on
 * reschedule, so editing an appointment replaces its reminder instead of adding
 * a second one. On web every call is a silent no-op.
 */

import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import type { Appointment } from '@shared/types'
import { AppointmentRepository } from '@database/repositories/appointment.repository'
import { getDatabase } from '@database/sqlite/database'
import { usePreferencesStore } from '@state/preferences.store'

export const REMINDER_CHANNEL_ID = 'appointments'
export const DEFAULT_REMINDER_MINUTES = 30

export type NotificationPermission = 'granted' | 'denied' | 'prompt'

let channelReady = false

function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (!isNative()) return 'denied'
  try {
    const result = await LocalNotifications.checkPermissions()
    if (result.display === 'granted' || result.display === 'denied') return result.display
    return 'prompt'
  } catch {
    return 'denied'
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false
  try {
    const result = await LocalNotifications.requestPermissions()
    return result.display === 'granted'
  } catch {
    return false
  }
}

/** Android channel: high importance so a reminder pops and makes a sound. */
export async function ensureNotificationChannel(): Promise<void> {
  if (!isNative() || Capacitor.getPlatform() !== 'android' || channelReady) return
  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'یادآوری نوبت',
      description: 'یادآوری نوبت‌های نزدیک',
      importance: 4,
      visibility: 1,
      sound: 'default',
      vibration: true,
    })
    channelReady = true
  } catch (err) {
    console.warn('[notifications] Failed to create channel:', err)
  }
}

/**
 * Schedules (or replaces) one reminder for an appointment.
 * Returns false when notifications are disabled, unavailable, not permitted,
 * or when the reminder time is already in the past.
 */
export async function scheduleAppointmentReminder(
  appointment: Appointment,
  customerName?: string
): Promise<boolean> {
  if (!isNative()) return false

  const { remindersEnabled, reminderLeadMinutes } = usePreferencesStore.getState()
  if (!remindersEnabled) {
    await cancelAppointmentReminder(appointment.id)
    return false
  }

  if ((await getNotificationPermission()) !== 'granted') return false
  await ensureNotificationChannel()

  const leadMinutes = Math.max(1, reminderLeadMinutes || DEFAULT_REMINDER_MINUTES)
  const startMs = new Date(appointment.start_at).getTime()
  const reminderMs = startMs - leadMinutes * 60 * 1000

  if (Number.isNaN(reminderMs) || reminderMs <= Date.now()) return false

  const title = customerName ? `نوبت ${customerName}` : appointment.title
  const body = `${leadMinutes.toLocaleString('fa-IR')} دقیقه دیگر نوبت دارید`

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationIdFromUUID(appointment.id),
          title,
          body,
          channelId: REMINDER_CHANNEL_ID,
          schedule: { at: new Date(reminderMs) },
          extra: { appointmentId: appointment.id },
        },
      ],
    })
    return true
  } catch (err) {
    console.warn('[notifications] Failed to schedule:', err)
    return false
  }
}

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

/** Cancels every pending appointment reminder scheduled by this app. */
export async function cancelAllAppointmentReminders(): Promise<void> {
  if (!isNative()) return

  try {
    const pending = await LocalNotifications.getPending()
    const ours = pending.notifications.filter(
      notification => appointmentIdOf(notification) !== null
    )
    if (ours.length > 0) {
      await LocalNotifications.cancel({ notifications: ours.map(item => ({ id: item.id })) })
    }
  } catch (err) {
    console.warn('[notifications] Failed to cancel reminders:', err)
  }
}

/**
 * Rebuilds reminders for all upcoming active appointments.
 * Called on app start because OS updates and force-stops can clear them, and
 * cancels stale notifications for appointments that were cancelled elsewhere.
 */
export async function rescheduleAllReminders(userId: string): Promise<number> {
  if (!isNative()) return 0

  const { remindersEnabled } = usePreferencesStore.getState()
  if (!remindersEnabled) {
    await cancelAllAppointmentReminders()
    return 0
  }

  if ((await getNotificationPermission()) !== 'granted') return 0
  await ensureNotificationChannel()

  const db = await getDatabase()
  const repo = new AppointmentRepository(db, userId)
  const upcoming = await repo.findUpcomingActive()

  const activeIds = new Set(upcoming.map(appointment => appointment.id))
  const pending = await LocalNotifications.getPending()
  const stale = pending.notifications.filter(notification => {
    const appointmentId = appointmentIdOf(notification)
    return appointmentId !== null && !activeIds.has(appointmentId)
  })
  if (stale.length > 0) {
    await LocalNotifications.cancel({ notifications: stale.map(item => ({ id: item.id })) })
  }

  let scheduled = 0
  for (const appointment of upcoming) {
    if (await scheduleAppointmentReminder(appointment)) scheduled += 1
  }
  return scheduled
}

function appointmentIdOf(notification: { extra?: unknown }): string | null {
  const extra = notification.extra as { appointmentId?: unknown } | null | undefined
  return typeof extra?.appointmentId === 'string' ? extra.appointmentId : null
}

/** Converts a UUID string to the 32-bit integer Capacitor requires. */
export function notificationIdFromUUID(uuid: string): number {
  const hex = uuid.replace(/-/g, '').slice(-8)
  return parseInt(hex, 16) >>> 0
}
