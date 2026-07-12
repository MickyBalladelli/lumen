import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const roots = ['src/cli', 'src/compiler']
const allowed = new Set([
  'src/cli/compile.js',
  'src/compiler/Compiler.js'
])
const failures = []

for (const root of roots) {
  for (const path of await javascriptFiles(root)) {
    if (allowed.has(path) || path.includes('/test-') || path.includes('/test-suites/')) continue
    const source = await readFile(path, 'utf8')
    if (source.includes("from '../compiler/Compiler.js'") ||
      source.includes("from './Compiler.js'") ||
      source.includes('new Compiler(')) {
      failures.push(path)
    }
  }
}

if (failures.length > 0) {
  throw new Error(`JavaScript compiler used by production path:\n${failures.join('\n')}`)
}

async function javascriptFiles(root) {
  const files = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...await javascriptFiles(path))
    else if (entry.name.endsWith('.js')) files.push(path)
  }
  return files
}
