/**
 * Gradle patching helpers for the generated Android project.
 * `android/` is gitignored, so release signing and versioning are applied by
 * `scripts/android-release.ts` after `npx cap sync android`.
 */

export interface ReleaseVersion {
  versionName: string
  versionCode: number
}

const VERSION_NAME = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/

export function applyVersion(gradle: string, version: ReleaseVersion): string {
  if (!Number.isInteger(version.versionCode) || version.versionCode < 1) {
    throw new Error('versionCode must be a positive integer')
  }
  if (!VERSION_NAME.test(version.versionName)) {
    throw new Error('versionName must look like 1.2.3 (or 1.2.3-beta.1)')
  }
  if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+"[^"]*"/.test(gradle)) {
    throw new Error('defaultConfig versionCode/versionName not found in build.gradle')
  }

  return gradle
    .replace(/versionCode\s+\d+/, `versionCode ${version.versionCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${version.versionName}"`)
}

const SIGNING_START = '// release-signing:begin'
const SIGNING_END = '// release-signing:end'

const SIGNING_BLOCK = `${SIGNING_START} (managed by scripts/android-release.ts)
def keystorePropertiesFile = rootProject.file('keystore.properties')
if (keystorePropertiesFile.exists()) {
    def keystoreProperties = new Properties()
    keystorePropertiesFile.withInputStream { keystoreProperties.load(it) }
    android {
        signingConfigs {
            release {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
        buildTypes {
            release {
                signingConfig signingConfigs.release
            }
        }
    }
} else {
    logger.warn('keystore.properties not found; the release build will be unsigned')
}
${SIGNING_END}`

export function applySigning(gradle: string): string {
  const start = gradle.indexOf(SIGNING_START)
  const end = gradle.indexOf(SIGNING_END)

  if (start !== -1 && end > start) {
    return gradle.slice(0, start) + SIGNING_BLOCK + gradle.slice(end + SIGNING_END.length)
  }

  return `${gradle.trimEnd()}\n\n${SIGNING_BLOCK}\n`
}

/**
 * Excludes every app domain from both cloud backup and device-to-device
 * transfer. The SQLCipher key lives in the Keystore and cannot be restored on
 * another device, so a restored database is unusable; session material and
 * customer records must not leave the device either.
 */
export const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="root" />
        <exclude domain="file" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
        <exclude domain="external" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" />
        <exclude domain="file" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
        <exclude domain="external" />
    </device-transfer>
</data-extraction-rules>
`

/**
 * Disables legacy backup and points Android 12+ at explicit extraction rules.
 * `allowBackup="false"` alone does not stop device-to-device transfer on
 * Android 12+, so the rules file is required as well.
 */
export function applyBackupHardening(manifest: string): string {
  if (!/<application\b/.test(manifest)) {
    throw new Error('application tag not found in AndroidManifest.xml')
  }

  let updated = manifest
    .replace(/android:allowBackup="[^"]*"/g, 'android:allowBackup="false"')
    .replace(/android:fullBackupContent="[^"]*"/g, 'android:fullBackupContent="false"')
    .replace(
      /android:dataExtractionRules="[^"]*"/g,
      'android:dataExtractionRules="@xml/data_extraction_rules"'
    )

  const missing: string[] = []
  if (!/android:allowBackup=/.test(updated)) missing.push('android:allowBackup="false"')
  if (!/android:fullBackupContent=/.test(updated)) missing.push('android:fullBackupContent="false"')
  if (!/android:dataExtractionRules=/.test(updated)) {
    missing.push('android:dataExtractionRules="@xml/data_extraction_rules"')
  }

  if (missing.length > 0) {
    updated = updated.replace(/<application\b/, `<application\n    ${missing.join('\n    ')}`)
  }

  return updated
}

/**
 * Play requires targetSdk 36 for new uploads from 2026-08-31. API 36 needs
 * AGP 8.9.1 or newer; these versions were verified as mutually compatible and
 * are already present in the local Gradle cache, so the upgrade builds offline.
 */
export const SDK_36 = {
  compileSdk: 36,
  targetSdk: 36,
  minAgpVersion: '8.9.1',
  agpVersion: '8.11.1',
  gradleVersion: '8.14',
} as const

function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function applyCompileSdk(variablesGradle: string, sdk: number): string {
  if (!Number.isInteger(sdk) || sdk < 23 || sdk > SDK_36.compileSdk) {
    throw new Error(`compileSdk must be an integer between 23 and ${SDK_36.compileSdk}`)
  }
  if (
    !/compileSdkVersion\s*=\s*\d+/.test(variablesGradle) ||
    !/targetSdkVersion\s*=\s*\d+/.test(variablesGradle)
  ) {
    throw new Error('compileSdkVersion/targetSdkVersion not found in variables.gradle')
  }

  return variablesGradle
    .replace(/compileSdkVersion\s*=\s*\d+/, `compileSdkVersion = ${sdk}`)
    .replace(/targetSdkVersion\s*=\s*\d+/, `targetSdkVersion = ${sdk}`)
}

export function applyAgpVersion(
  rootBuildGradle: string,
  version: string = SDK_36.agpVersion
): string {
  if (compareVersions(version, SDK_36.minAgpVersion) < 0) {
    throw new Error(`AGP ${version} is too old for compileSdk ${SDK_36.compileSdk}`)
  }

  const current = /com\.android\.tools\.build:gradle:([0-9.]+)/.exec(rootBuildGradle)
  if (!current) throw new Error('Android Gradle Plugin classpath not found in build.gradle')

  return rootBuildGradle.replace(
    /com\.android\.tools\.build:gradle:[0-9.]+/,
    `com.android.tools.build:gradle:${version}`
  )
}

export function applyGradleVersion(
  wrapperProperties: string,
  version: string = SDK_36.gradleVersion
): string {
  if (!/distributionUrl=.*gradle-[0-9.]+-(?:all|bin)\.zip/.test(wrapperProperties)) {
    throw new Error('Gradle distributionUrl not found in gradle-wrapper.properties')
  }
  if (compareVersions(version, '8.11.1') < 0) {
    throw new Error(`Gradle ${version} is too old for AGP ${SDK_36.agpVersion}`)
  }

  return wrapperProperties.replace(/gradle-[0-9.]+-(all|bin)\.zip/, `gradle-${version}-all.zip`)
}
