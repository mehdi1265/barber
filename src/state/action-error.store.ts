/**
 * Last failed user action, rendered by ActionErrorBanner.
 *
 * React Query reports every mutation error here so a screen that forgot its
 * own try/catch still tells the user that nothing was saved.
 */

import { create } from 'zustand'

interface ActionErrorState {
  message: string | null
  show: (message: string) => void
  clear: () => void
}

export const useActionErrorStore = create<ActionErrorState>(set => ({
  message: null,
  show: message => set({ message }),
  clear: () => set({ message: null }),
}))
