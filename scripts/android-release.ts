/**
 * Applies Android release signing and versioning to the generated project.
 *
 * Usage:
 *   node scripts/android-release.ts --signing
 *   node scripts/android-release.ts --version-name 1.1.0 --version-code 2
 *
 * Requires the native project (`npx cap add android`) and a
 * `android/keystore.properties` file that is never committed.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { applySigning, applyVersion, type ReleaseVersion } from './android-release-utils.ts'

interface Options {
  file: string
  signing: boolean
  version: Partial<ReleaseVersion>
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    file: resolve(process.cwd(), 'android/app/build.gradle'),
    signing: false,
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
      case '--signing':
        options.signing = true
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

  if (!options.signing && Object.keys(options.version).length === 0) {
    throw new Error(
      'Nothing to do. Use --signing and/or --version-name/--version-code (see --help).'
    )
  }

  return options
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`[android] ${error instanceof Error ? error.message : 'unknown error'}`)
    process.exitCode = 1
  })
}
