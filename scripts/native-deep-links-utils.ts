/**
 * Patches the generated Capacitor projects so `barberapp://reset-password`
 * links open the app. `android/` and `ios/` are gitignored, so the patches are
 * re-applied by `scripts/native-deep-links.ts` after `npx cap sync`.
 */

export const RECOVERY_HOST = 'reset-password'

const SCHEME = /^[a-z][a-z0-9+.-]*$/
const LINK_START = '<!-- deep-link:begin'
const LINK_END = '<!-- deep-link:end -->'

export function assertScheme(scheme: string): void {
  if (!SCHEME.test(scheme)) {
    throw new Error(`invalid URL scheme: ${JSON.stringify(scheme)} (expected e.g. "barberapp")`)
  }
}

function indentAt(text: string, index: number): string {
  const lineStart = text.lastIndexOf('\n', index) + 1
  return text.slice(lineStart, index)
}

function androidIntentFilter(scheme: string, indent: string): string {
  const inner = `${indent}    `
  const child = `${indent}        `
  return [
    `${indent}${LINK_START} (managed by scripts/native-deep-links.ts) -->`,
    `${inner}<intent-filter>`,
    `${child}<action android:name="android.intent.action.VIEW" />`,
    `${child}<category android:name="android.intent.category.DEFAULT" />`,
    `${child}<category android:name="android.intent.category.BROWSABLE" />`,
    `${child}<data android:scheme="${scheme}" android:host="${RECOVERY_HOST}" />`,
    `${inner}</intent-filter>`,
    `${indent}${LINK_END}`,
    '',
  ].join('\n')
}

export function applyAndroidDeepLink(manifest: string, scheme: string): string {
  assertScheme(scheme)

  const start = manifest.indexOf(LINK_START)
  if (start !== -1) {
    const end = manifest.indexOf(LINK_END)
    if (end < start) throw new Error('AndroidManifest.xml has an unclosed deep-link block')
    const indent = indentAt(manifest, start)
    const afterEnd = end + LINK_END.length
    const nextLine = manifest.indexOf('\n', afterEnd)
    const remainder = nextLine === -1 ? manifest.slice(afterEnd) : manifest.slice(nextLine + 1)
    return (
      manifest.slice(0, start - indent.length) + androidIntentFilter(scheme, indent) + remainder
    )
  }

  if (manifest.includes(`android:scheme="${scheme}"`)) return manifest

  const activity = manifest.indexOf('android:name=".MainActivity"')
  if (activity === -1) throw new Error('MainActivity not found in AndroidManifest.xml')
  const close = manifest.indexOf('</activity>', activity)
  if (close === -1) throw new Error('MainActivity closing tag not found in AndroidManifest.xml')

  const indent = indentAt(manifest, close)
  const lineStart = close - indent.length
  return (
    manifest.slice(0, lineStart) + androidIntentFilter(scheme, indent) + manifest.slice(lineStart)
  )
}

function iosUrlTypes(scheme: string): string {
  return [
    '\t<key>CFBundleURLTypes</key>',
    '\t<array>',
    '\t\t<dict>',
    '\t\t\t<key>CFBundleURLName</key>',
    `\t\t\t<string>${scheme}</string>`,
    '\t\t\t<key>CFBundleURLSchemes</key>',
    '\t\t\t<array>',
    `\t\t\t\t<string>${scheme}</string>`,
    '\t\t\t</array>',
    '\t\t</dict>',
    '\t</array>',
    '',
  ].join('\n')
}

export function applyIosUrlScheme(plist: string, scheme: string): string {
  assertScheme(scheme)

  if (plist.includes('<key>CFBundleURLTypes</key>')) {
    if (plist.includes(`<string>${scheme}</string>`)) return plist
    throw new Error(
      'Info.plist already declares CFBundleURLTypes without this scheme; merge it manually'
    )
  }

  const anchor = '\t<key>CFBundleDevelopmentRegion</key>'
  const index = plist.indexOf(anchor)
  if (index !== -1) return plist.slice(0, index) + iosUrlTypes(scheme) + plist.slice(index)

  const dict = plist.indexOf('<dict>')
  if (dict === -1) throw new Error('Info.plist root <dict> not found')
  const insertAt = dict + '<dict>'.length
  return plist.slice(0, insertAt) + '\n' + iosUrlTypes(scheme) + plist.slice(insertAt)
}
