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
