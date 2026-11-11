/**
 * Auth store — manages current user session.
 * Source of truth for userId used throughout repositories.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  userId: string | null
  isAuthenticated: boolean
  isLoading: boolean

  setSession: (session: Session | null) => void
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      userId: null,
      isAuthenticated: false,
      isLoading: true,

      setSession: (session) =>
        set({
          session,
          user: session?.user ?? null,
          userId: session?.user?.id ?? null,
          isAuthenticated: !!session?.user,
        }),

      setUser: (user) =>
        set({
          user,
          userId: user?.id ?? null,
          isAuthenticated: !!user,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      clearAuth: () =>
        set({
          user: null,
          session: null,
          userId: null,
          isAuthenticated: false,
          isLoading: false,
        }),
    }),
    {
      name: 'barber-auth',
      // Only persist minimal non-sensitive state
      partialize: (state) => ({
        userId: state.userId,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
