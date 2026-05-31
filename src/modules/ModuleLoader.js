import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const LOCAL_IMPORT = /^\s*import\s+\{[^}]+\}\s+from\s+["'](\.{1,2}\/[^"']+)["']\s*$/gm

export class ModuleLoader {
  constructor({ seen = new Set() } = {}) {
    this.seen = seen
  }

  async load(entryPath) {
    const absolute = resolve(entryPath)
    return this.loadFile(absolute)
  }

  async loadFile(filePath) {
    const absolute = resolve(filePath)
    if (this.seen.has(absolute)) return ''
    this.seen.add(absolute)

    const source = await readFile(absolute, 'utf8')
    const imports = [...source.matchAll(LOCAL_IMPORT)]
    const prefix = []

    for (const match of imports) {
      const child = resolve(dirname(absolute), match[1])
      prefix.push(await this.loadFile(child))
    }

    return [
      ...prefix,
      source.replace(LOCAL_IMPORT, '').trim()
    ].filter(Boolean).join('\n\n')
  }
}
