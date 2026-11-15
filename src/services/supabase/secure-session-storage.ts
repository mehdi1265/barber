/**
 * Supabase session storage.
 *
 * On Android/iOS the auth session (access + refresh token) is kept in the
 * platform secure store through `@aparajita/capacitor-secure-storage`
 * (Android Keystore-backed EncryptedSharedPreferences / iOS Keychain).
 *
 * On the web the session stays in `localStorage`, matching the project rule
 * that browser storage is for development and demos only (D-21).
 */

import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

export interface SessionStorageAdapter {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

const isNative = () => Capacitor.isNativePlatform()

export const secureSessionStorage: SessionStorageAdapter = {
  getItem: async key => {
    if (isNative()) return SecureStorage.getItem(key)
    return window.localStorage.getItem(key)
  },

  setItem: async (key, value) => {
    if (isNative()) {
      await SecureStorage.setItem(key, value)
      return
    }
    window.localStorage.setItem(key, value)
  },

  removeItem: async key => {
    if (isNative()) {
      await SecureStorage.removeItem(key)
      return
    }
    window.localStorage.removeItem(key)
  },
}
