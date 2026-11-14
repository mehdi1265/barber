import { describe, expect, it } from 'vitest'
import {
  applyAgpVersion,
  applyBackupHardening,
  applyCompileSdk,
  applyGradleVersion,
  applySigning,
  applyVersion,
  DATA_EXTRACTION_RULES,
  SDK_36,
} from '../../../scripts/android-release-utils.ts'

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

const MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:label="@string/app_name">
        <activity android:name=".MainActivity" />
    </application>
</manifest>
`

describe('android backup hardening', () => {
  it('disables legacy backup and points at the extraction rules', () => {
    const updated = applyBackupHardening(MANIFEST)

    expect(updated).toContain('android:allowBackup="false"')
    expect(updated).toContain('android:fullBackupContent="false"')
    expect(updated).toContain('android:dataExtractionRules="@xml/data_extraction_rules"')
    expect(updated).not.toContain('android:allowBackup="true"')
  })

  it('is idempotent', () => {
    const once = applyBackupHardening(MANIFEST)
    expect(applyBackupHardening(once)).toBe(once)
  })

  it('excludes every domain from cloud backup and device transfer', () => {
    expect(DATA_EXTRACTION_RULES).toContain('<cloud-backup>')
    expect(DATA_EXTRACTION_RULES).toContain('<device-transfer>')
    for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
      expect(DATA_EXTRACTION_RULES.match(new RegExp(`domain="${domain}"`, 'g'))).toHaveLength(2)
    }
  })

  it('rejects a manifest without an application tag', () => {
    expect(() => applyBackupHardening('<manifest />')).toThrow('application tag not found')
  })
})

const VARIABLES = `ext {
    minSdkVersion = 23
    compileSdkVersion = 35
    targetSdkVersion = 35
}
`

const ROOT_BUILD = `buildscript {
    dependencies {
        classpath 'com.android.tools.build:gradle:8.7.2'
    }
}
`

const WRAPPER = `distributionUrl=https\\://services.gradle.org/distributions/gradle-8.11.1-all.zip
`

describe('android SDK 36 upgrade', () => {
  it('sets compileSdk and targetSdk to 36', () => {
    const updated = applyCompileSdk(VARIABLES, 36)

    expect(updated).toContain('compileSdkVersion = 36')
    expect(updated).toContain('targetSdkVersion = 36')
    expect(updated).not.toContain('compileSdkVersion = 35')
  })

  it('upgrades AGP only to a version that supports API 36', () => {
    expect(applyAgpVersion(ROOT_BUILD)).toContain(
      `com.android.tools.build:gradle:${SDK_36.agpVersion}`
    )
    expect(() => applyAgpVersion(ROOT_BUILD, '8.7.2')).toThrow('too old')
    expect(() => applyAgpVersion('buildscript {}')).toThrow('classpath not found')
  })

  it('upgrades the Gradle wrapper to the AGP-compatible version', () => {
    expect(applyGradleVersion(WRAPPER)).toContain(`gradle-${SDK_36.gradleVersion}-all.zip`)
    expect(() => applyGradleVersion(WRAPPER, '8.10.0')).toThrow('too old')
  })

  it('is idempotent', () => {
    const variables = applyCompileSdk(VARIABLES, 36)
    const root = applyAgpVersion(ROOT_BUILD)
    const wrapper = applyGradleVersion(WRAPPER)

    expect(applyCompileSdk(variables, 36)).toBe(variables)
    expect(applyAgpVersion(root)).toBe(root)
    expect(applyGradleVersion(wrapper)).toBe(wrapper)
  })

  it('rejects an SDK outside the verified range', () => {
    expect(() => applyCompileSdk(VARIABLES, 37)).toThrow('between 23 and 36')
    expect(() => applyCompileSdk('ext {}', 36)).toThrow('not found')
  })
})
