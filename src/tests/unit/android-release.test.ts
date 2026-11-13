import { describe, expect, it } from 'vitest'
import { applySigning, applyVersion } from '../../../scripts/android-release-utils.ts'

const GRADLE = `apply plugin: 'com.android.application'

android {
    defaultConfig {
        applicationId "com.barberapp.app"
        versionCode 1
        versionName "1.0"
    }
}
`

describe('android release helpers', () => {
  it('bumps versionCode and versionName', () => {
    const updated = applyVersion(GRADLE, { versionName: '1.2.3', versionCode: 42 })

    expect(updated).toContain('versionCode 42')
    expect(updated).toContain('versionName "1.2.3"')
    expect(updated).not.toContain('versionCode 1\n')
  })

  it('rejects invalid versions', () => {
    expect(() => applyVersion(GRADLE, { versionName: '1.2.3', versionCode: 0 })).toThrow(
      'positive integer'
    )
    expect(() => applyVersion(GRADLE, { versionName: 'v1', versionCode: 1 })).toThrow('versionName')
    expect(() => applyVersion('android {}', { versionName: '1.0.0', versionCode: 1 })).toThrow(
      'not found'
    )
  })

  it('injects the signing block once and keeps the patch idempotent', () => {
    const once = applySigning(GRADLE)
    const twice = applySigning(once)

    expect(once).toContain('// release-signing:begin')
    expect(once).toContain("rootProject.file('keystore.properties')")
    expect(once).toContain('signingConfig signingConfigs.release')
    expect(twice).toBe(once)
    expect(twice.match(/signingConfigs \{/g)).toHaveLength(1)
  })
})
