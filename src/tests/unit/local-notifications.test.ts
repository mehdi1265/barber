/* eslint-disable @typescript-eslint/unbound-method -- plugin methods are mocked */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LocalNotifications } from '@capacitor/local-notifications'
import {
  cancelAllAppointmentReminders,
  getNotificationPermission,
  notificationIdFromUUID,
  rescheduleAllReminders,
  scheduleAppointmentReminder,
} from '@services/notifications/local-notifications'
import { usePreferencesStore } from '@state/preferences.store'
import { createTestDb } from '../helpers/sqlite-harness'
import type { Appointment } from '@shared/types'

const USER = 'user-1'

const dbState = vi.hoisted(() => ({ db: null as object | null }))

vi.mock('@database/sqlite/database', () => ({
  getDatabase: () => Promise.resolve(dbState.db),
}))

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'b3d9c1e2-1111-4222-8333-abcdef123456',
    user_id: USER,
    customer_id: null,
    title: 'کوتاهی',
    start_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    end_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    duration_minutes: 60,
    status: 'reserved',
    notes: null,
    created_at: '2026-11-13T10:00:00.000Z',
    updated_at: '2026-11-13T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('local notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.__capacitorNative = true
    usePreferencesStore.setState({
      remindersEnabled: true,
      reminderLeadMinutes: 30,
      permissionPromptDismissed: false,
    })
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'granted' })
    vi.mocked(LocalNotifications.getPending).mockResolvedValue({ notifications: [] })
  })

  afterEach(() => {
    globalThis.__capacitorNative = false
  })

  it('یادآوری را ۳۰ دقیقه قبل با کانال اندروید زمان‌بندی می‌کند', async () => {
    const appt = appointment()
    const scheduled = await scheduleAppointmentReminder(appt, 'علی')

    expect(scheduled).toBe(true)
    expect(LocalNotifications.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'appointments', importance: 4 })
    )
    expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1)

    const first = vi.mocked(LocalNotifications.schedule).mock.calls[0][0].notifications[0]
    expect(first).toMatchObject({
      id: notificationIdFromUUID(appt.id),
      title: 'نوبت علی',
      channelId: 'appointments',
      extra: { appointmentId: appt.id },
    })
    const expected = new Date(appt.start_at).getTime() - 30 * 60 * 1000
    expect(first.schedule?.at?.getTime()).toBe(expected)

    // Editing reuses the same ID, so no duplicate notification is created.
    await scheduleAppointmentReminder({
      ...appt,
      start_at: new Date(Date.now() + 4 * 3_600_000).toISOString(),
    })
    const [firstCall, secondCall] = vi.mocked(LocalNotifications.schedule).mock.calls
    expect(secondCall[0].notifications[0].id).toBe(firstCall[0].notifications[0].id)
  })

  it('زمان گذشته یا اجازه ردشده چیزی زمان‌بندی نمی‌کند', async () => {
    await scheduleAppointmentReminder(
      appointment({ start_at: new Date(Date.now() - 60_000).toISOString() })
    )
    expect(LocalNotifications.schedule).not.toHaveBeenCalled()

    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'denied' })
    expect(await getNotificationPermission()).toBe('denied')
    const scheduled = await scheduleAppointmentReminder(appointment())
    expect(scheduled).toBe(false)
    expect(LocalNotifications.schedule).not.toHaveBeenCalled()
  })

  it('با خاموش‌شدن یادآوری، یادآوری همان نوبت لغو می‌شود', async () => {
    usePreferencesStore.setState({ remindersEnabled: false })
    const appt = appointment()

    expect(await scheduleAppointmentReminder(appt)).toBe(false)
    expect(LocalNotifications.schedule).not.toHaveBeenCalled()
    expect(LocalNotifications.cancel).toHaveBeenCalledWith({
      notifications: [{ id: notificationIdFromUUID(appt.id) }],
    })
  })

  it('همه یادآوری‌های اپ را می‌لغزد و یادآوری‌های یتیم را پاک می‌کند', async () => {
    vi.mocked(LocalNotifications.getPending).mockResolvedValue({
      notifications: [
        { id: 111, title: 'x', body: 'x', extra: { appointmentId: 'gone-1' } },
        { id: 222, title: 'y', body: 'y', extra: { appointmentId: 'kept-1' } },
        { id: 333, title: 'z', body: 'z' },
      ],
    })

    await cancelAllAppointmentReminders()
    expect(LocalNotifications.cancel).toHaveBeenCalledWith({
      notifications: [{ id: 111 }, { id: 222 }],
    })
  })

  it('در شروع اپ نوبت‌های آینده را دوباره زمان‌بندی و ردیف‌های یتیم را لغو می‌کند', async () => {
    const harness = createTestDb()
    dbState.db = harness.db

    const now = Date.now()
    const insert = harness.raw.prepare(
      `INSERT INTO appointments
        (id, user_id, customer_id, title, start_at, end_at, duration_minutes, status, notes,
         created_at, updated_at, deleted_at)
       VALUES (?, ?, NULL, ?, ?, ?, 60, ?, NULL, ?, ?, NULL)`
    )
    insert.run(
      'appt-active',
      USER,
      'فعال',
      new Date(now + 3_600_000).toISOString(),
      new Date(now + 7_200_000).toISOString(),
      'reserved',
      new Date(now).toISOString(),
      new Date(now).toISOString()
    )
    insert.run(
      'appt-cancelled',
      USER,
      'لغوشده',
      new Date(now + 3_600_000).toISOString(),
      new Date(now + 7_200_000).toISOString(),
      'cancelled',
      new Date(now).toISOString(),
      new Date(now).toISOString()
    )

    vi.mocked(LocalNotifications.getPending).mockResolvedValue({
      notifications: [
        { id: 111, title: 'x', body: 'x', extra: { appointmentId: 'appt-cancelled' } },
        { id: 222, title: 'y', body: 'y', extra: { appointmentId: 'appt-active' } },
      ],
    })

    const scheduled = await rescheduleAllReminders(USER)

    expect(scheduled).toBe(1)
    expect(LocalNotifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 111 }] })
    const calls = vi.mocked(LocalNotifications.schedule).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0][0].notifications[0].extra).toEqual({ appointmentId: 'appt-active' })
  })
})
