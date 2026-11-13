import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(repoRoot, 'node_modules/sql.js/dist/sql-wasm.wasm')
const target = resolve(repoRoot, 'public/assets/sql-wasm.wasm')

await mkdir(dirname(target), { recursive: true })
await copyFile(source, target)
console.log('[assets] copied sql-wasm.wasm -> public/assets')
