import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// jeep-sqlite 2.8.0 bundles the sql.js 1.11.0 glue code. Loading a different
// wasm build fails with an Emscripten LinkError, so the versions must match.
const EXPECTED_SQL_JS_VERSION = '1.11.0'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sqlJsRoot = resolve(repoRoot, 'node_modules/sql.js')
const source = resolve(sqlJsRoot, 'dist/sql-wasm.wasm')
const target = resolve(repoRoot, 'public/assets/sql-wasm.wasm')

const { version } = JSON.parse(await readFile(resolve(sqlJsRoot, 'package.json'), 'utf8'))
if (version !== EXPECTED_SQL_JS_VERSION) {
  throw new Error(
    `sql.js ${version} does not match the sql.js ${EXPECTED_SQL_JS_VERSION} bundled by jeep-sqlite`
  )
}

await mkdir(dirname(target), { recursive: true })
await copyFile(source, target)
console.log(`[assets] copied sql.js ${version} wasm -> public/assets`)
