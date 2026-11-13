/**
 * Registers the `barberapp://reset-password` deep link in the generated
 * Android and iOS projects. `android/` and `ios/` are gitignored, so run this
 * after `npx cap sync` (or via `npm run cap:build`).
 *
 * Usage:
 *   node scripts/native-deep-links.ts [--scheme barberapp]
 *     [--android android/app/src/main/AndroidManifest.xml]
 *     [--ios ios/App/App/Info.plist]
 *
 * Missing platforms are skipped with a warning.
 */

import { readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { applyAndroidDeepLink, applyIosUrlScheme, assertScheme } from './native-deep-links-utils.ts'

interface Options {
  scheme: string
  android: string
  ios: string
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    scheme: 'barberapp',
    android: resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml'),
    ios: resolve(process.cwd(), 'ios/App/App/Info.plist'),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]

    switch (arg) {
      case '--scheme':
        if (!value) throw new Error('--scheme needs a value')
        options.scheme = value
        index += 1
        break
      case '--android':
        if (!value) throw new Error('--android needs a path')
        options.android = resolve(process.cwd(), value)
        index += 1
        break
      case '--ios':
        if (!value) throw new Error('--ios needs a path')
        options.ios = resolve(process.cwd(), value)
        index += 1
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  assertScheme(options.scheme)
  return options
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function patch(
  label: string,
  path: string,
  apply: (text: string) => string
): Promise<'updated' | 'unchanged' | 'missing'> {
  if (!(await exists(path))) {
    console.warn(`[deep-link] ${label} project not found, skipped: ${path}`)
    return 'missing'
  }

  const original = await readFile(path, 'utf8')
  const updated = apply(original)
  if (updated === original) {
    console.log(`[deep-link] ${label} already configured: ${path}`)
    return 'unchanged'
  }

  await writeFile(path, updated, 'utf8')
  console.log(`[deep-link] ${label} scheme registered: ${path}`)
  return 'updated'
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  await patch('android', options.android, text => applyAndroidDeepLink(text, options.scheme))
  await patch('ios', options.ios, text => applyIosUrlScheme(text, options.scheme))

  console.log(
    `[deep-link] add ${options.scheme}://reset-password to Supabase Auth → URL Configuration → Redirect URLs`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`[deep-link] ${error instanceof Error ? error.message : 'unknown error'}`)
    process.exitCode = 1
  })
}
