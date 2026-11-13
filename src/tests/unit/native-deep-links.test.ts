import { describe, expect, it } from 'vitest'
import {
  applyAndroidDeepLink,
  applyIosUrlScheme,
} from '../../../scripts/native-deep-links-utils.ts'

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application>
        <activity
            android:name=".MainActivity"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>
    </application>
</manifest>
`

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>en</string>
\t<key>CFBundleDisplayName</key>
\t<string>Barber App</string>
</dict>
</plist>
`

describe('native deep-link patching', () => {
  it('adds an Android VIEW intent-filter inside MainActivity once', () => {
    const once = applyAndroidDeepLink(MANIFEST, 'barberapp')
    const twice = applyAndroidDeepLink(once, 'barberapp')

    expect(once).toContain('android.intent.action.VIEW')
    expect(once).toContain('android.intent.category.BROWSABLE')
    expect(once).toContain('android:scheme="barberapp"')
    expect(once).toContain('android:host="reset-password"')
    expect(once.indexOf('<intent-filter>')).toBeLessThan(once.indexOf('</activity>'))
    expect(twice).toBe(once)
    expect(twice.match(/android.intent.action.VIEW/g)).toHaveLength(1)
  })

  it('replaces the managed block when the scheme changes', () => {
    const once = applyAndroidDeepLink(MANIFEST, 'barberapp')
    const changed = applyAndroidDeepLink(once, 'barberdev')

    expect(changed).toContain('android:scheme="barberdev"')
    expect(changed).not.toContain('android:scheme="barberapp"')
    expect(changed.match(/barberdev/g)).toHaveLength(1)
  })

  it('is a no-op when the scheme is already registered without markers', () => {
    const manual = MANIFEST.replace(
      '<intent-filter>',
      '<intent-filter>\n                <data android:scheme="barberapp" />'
    )

    expect(applyAndroidDeepLink(manual, 'barberapp')).toBe(manual)
  })

  it('registers CFBundleURLTypes in Info.plist once', () => {
    const once = applyIosUrlScheme(PLIST, 'barberapp')
    const twice = applyIosUrlScheme(once, 'barberapp')

    expect(once).toContain('<key>CFBundleURLTypes</key>')
    expect(once).toContain('<key>CFBundleURLSchemes</key>')
    expect(once).toContain('<string>barberapp</string>')
    expect(once).toContain('<key>CFBundleDevelopmentRegion</key>')
    expect(twice).toBe(once)
    expect(twice.match(/CFBundleURLTypes/g)).toHaveLength(1)
  })

  it('refuses to clobber an existing CFBundleURLTypes block', () => {
    const manual = PLIST.replace(
      '\t<key>CFBundleDevelopmentRegion</key>',
      '\t<key>CFBundleURLTypes</key>\n\t<array/>\n\t<key>CFBundleDevelopmentRegion</key>'
    )

    expect(() => applyIosUrlScheme(manual, 'barberapp')).toThrow('merge it manually')
  })

  it('rejects malformed schemes', () => {
    expect(() => applyAndroidDeepLink(MANIFEST, 'barber app')).toThrow('invalid URL scheme')
    expect(() => applyIosUrlScheme(PLIST, '1barber')).toThrow('invalid URL scheme')
  })
})
