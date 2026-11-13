/**
 * User preferences that are device-local (not synced to the cloud).
 * Reminder lead time lives here so notifications can read it outside React.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const REMINDER_LEAD_OPTIONS = [10, 30, 60] as const
export type ReminderLeadMinutes = (typeof REMINDER_LEAD_OPTIONS)[number]

interface PreferencesState {
  remindersEnabled: boolean
  reminderLeadMinutes: number
  /** The one-time permission banner was dismissed. */
  permissionPromptDismissed: boolean
  setRemindersEnabled: (enabled: boolean) => void
  setReminderLeadMinutes: (minutes: number) => void
  dismissPermissionPrompt: () => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    set => ({
      remindersEnabled: true,
      reminderLeadMinutes: 30,
      permissionPromptDismissed: false,

      setRemindersEnabled: enabled => set({ remindersEnabled: enabled }),
      setReminderLeadMinutes: minutes =>
        set({ reminderLeadMinutes: Math.max(1, Math.round(minutes)) }),
      dismissPermissionPrompt: () => set({ permissionPromptDismissed: true }),
    }),
    { name: 'barber-preferences' }
  )
)
