/**
 * Native deep-link handling.
 *
 * Only recovery links are acted on: the URL is turned into a Supabase session
 * through `applyRecoveryLink`, then the app routes to the reset screen. The
 * handler runs for both cold launches (`getLaunchUrl`) and warm links
 * (`appUrlOpen`). Web does not register anything.
 */

import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { applyRecoveryLink } from '@features/auth/auth.usecases'
import { isRecoveryTarget, RECOVERY_LINK_EVENT } from '@features/auth/recovery-link'

export type NavigateTo = (path: string) => void

export interface RecoveryLinkEventDetail {
  ok: boolean
}

export async function handleAppUrl(url: string, navigate: NavigateTo): Promise<boolean> {
  if (!isRecoveryTarget(url)) return false

  const { error } = await applyRecoveryLink(url)
  navigate('/reset-password')
  window.dispatchEvent(
    new CustomEvent<RecoveryLinkEventDetail>(RECOVERY_LINK_EVENT, { detail: { ok: !error } })
  )
  return true
}

export async function registerAppUrlHandling(navigate: NavigateTo): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {}

  const handled = new Set<string>()
  const process = async (url: string | null | undefined) => {
    if (!url || handled.has(url)) return
    handled.add(url)
    try {
      await handleAppUrl(url, navigate)
    } catch (err) {
      console.error('[deep-link] handling failed:', err instanceof Error ? err.message : 'unknown')
    }
  }

  const listener = await App.addListener('appUrlOpen', event => {
    void process(event.url)
  })

  const launch = await App.getLaunchUrl()
  await process(launch?.url)

  return () => {
    void listener.remove()
  }
}
