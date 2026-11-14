/**
 * Applies Android release signing, versioning, and backup hardening to the
 * generated project.
 *
 * Usage:
 *   node scripts/android-release.ts --signing
 *   node scripts/android-release.ts --version-name 1.1.0 --version-code 2
 *   node scripts/android-release.ts --backup
 *   node scripts/android-release.ts --sdk 36
 *
 * Requires the native project (`npx cap add android`) and, for signing, an
 * `android/keystore.properties` file that is never committed.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  applyAgpVersion,
  applyBackupHardening,
  applyCompileSdk,
  applyGradleVersion,
  applySigning,
  applyVersion,
  DATA_EXTRACTION_RULES,
  SDK_36,
  type ReleaseVersion,
} from './android-release-utils.ts'

interface Options {
  file: string
  manifest: string
  rules: string
  variables: string
  rootBuild: string
  wrapper: string
  signing: boolean
  backup: boolean
  sdk?: number
  version: Partial<ReleaseVersion>
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    file: resolve(process.cwd(), 'android/app/build.gradle'),
    manifest: resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml'),
    rules: resolve(process.cwd(), 'android/app/src/main/res/xml/data_extraction_rules.xml'),
    variables: resolve(process.cwd(), 'android/variables.gradle'),
    rootBuild: resolve(process.cwd(), 'android/build.gradle'),
    wrapper: resolve(process.cwd(), 'android/gradle/wrapper/gradle-wrapper.properties'),
    signing: false,
    backup: false,
    version: {},
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]

    switch (arg) {
      case '--file':
        if (!value) throw new Error('--file needs a path')
        options.file = resolve(process.cwd(), value)
        index += 1
        break
      case '--manifest':
        if (!value) throw new Error('--manifest needs a path')
        options.manifest = resolve(process.cwd(), value)
        index += 1
        break
      case '--rules':
        if (!value) throw new Error('--rules needs a path')
        options.rules = resolve(process.cwd(), value)
        index += 1
        break
      case '--variables':
        if (!value) throw new Error('--variables needs a path')
        options.variables = resolve(process.cwd(), value)
        index += 1
        break
      case '--root-build':
        if (!value) throw new Error('--root-build needs a path')
        options.rootBuild = resolve(process.cwd(), value)
        index += 1
        break
      case '--wrapper':
        if (!value) throw new Error('--wrapper needs a path')
        options.wrapper = resolve(process.cwd(), value)
        index += 1
        break
      case '--sdk':
        if (!value || !/^\d+$/.test(value)) throw new Error('--sdk needs an integer')
        options.sdk = Number(value)
        index += 1
        break
      case '--signing':
        options.signing = true
        break
      case '--backup':
        options.backup = true
        break
      case '--version-name':
        if (!value) throw new Error('--version-name needs a value')
        options.version.versionName = value
        index += 1
        break
      case '--version-code':
        if (!value || !/^\d+$/.test(value)) throw new Error('--version-code needs an integer')
        options.version.versionCode = Number(value)
        index += 1
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (
    !options.signing &&
    !options.backup &&
    options.sdk === undefined &&
    Object.keys(options.version).length === 0
  ) {
    throw new Error(
      'Nothing to do. Use --signing, --backup, --sdk, and/or --version-name/--version-code (see --help).'
    )
  }

  return options
}

async function applyGradle(options: Options): Promise<void> {
  const original = await readFile(options.file, 'utf8')

  let updated = original
  if (options.signing) updated = applySigning(updated)
  if (Object.keys(options.version).length > 0) {
    if (options.version.versionName === undefined || options.version.versionCode === undefined) {
      throw new Error('Pass both --version-name and --version-code')
    }
    updated = applyVersion(updated, {
      versionName: options.version.versionName,
      versionCode: options.version.versionCode,
    })
  }

  if (updated === original) {
    console.log(`[android] no changes needed: ${options.file}`)
    return
  }

  await writeFile(options.file, updated, 'utf8')
  console.log(`[android] updated ${options.file}`)
}

async function writeIfChanged(file: string, original: string, updated: string): Promise<void> {
  if (updated === original) {
    console.log(`[android] no changes needed: ${file}`)
    return
  }
  await writeFile(file, updated, 'utf8')
  console.log(`[android] updated ${file}`)
}

async function applySdk(options: Options, sdk: number): Promise<void> {
  const variables = await readFile(options.variables, 'utf8')
  await writeIfChanged(options.variables, variables, applyCompileSdk(variables, sdk))

  const rootBuild = await readFile(options.rootBuild, 'utf8')
  await writeIfChanged(options.rootBuild, rootBuild, applyAgpVersion(rootBuild))

  const wrapper = await readFile(options.wrapper, 'utf8')
  await writeIfChanged(options.wrapper, wrapper, applyGradleVersion(wrapper))

  console.log(
    `[android] SDK ${sdk}: AGP ${SDK_36.agpVersion}, Gradle ${SDK_36.gradleVersion}` +
      ` (compileSdk/targetSdk ${sdk}, min AGP ${SDK_36.minAgpVersion})`
  )
}

async function applyBackup(options: Options): Promise<void> {
  const original = await readFile(options.manifest, 'utf8')
  const updated = applyBackupHardening(original)

  if (updated !== original) {
    await writeFile(options.manifest, updated, 'utf8')
    console.log(`[android] disabled backups in ${options.manifest}`)
  } else {
    console.log(`[android] backup already disabled: ${options.manifest}`)
  }

  let existingRules: string | null = null
  try {
    existingRules = await readFile(options.rules, 'utf8')
  } catch {
    existingRules = null
  }
  if (existingRules !== DATA_EXTRACTION_RULES) {
    await mkdir(dirname(options.rules), { recursive: true })
    await writeFile(options.rules, DATA_EXTRACTION_RULES, 'utf8')
    console.log(`[android] wrote ${options.rules}`)
  } else {
    console.log(`[android] extraction rules already current: ${options.rules}`)
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.signing || Object.keys(options.version).length > 0) {
    await applyGradle(options)
  }
  if (options.backup) {
    await applyBackup(options)
  }
  if (options.sdk !== undefined) {
    await applySdk(options, options.sdk)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`[android] ${error instanceof Error ? error.message : 'unknown error'}`)
    process.exitCode = 1
  })
}
