import { access, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const IMPORT = /^\s*import\s+\{[^}]+\}\s+from\s+["']([^"']+)["']\s*$/gm

export class ModuleLoader {
  constructor({ seen = new Set(), packageRoot = '.photon/packages' } = {}) {
    this.seen = seen
    this.packageRoot = resolve(packageRoot)
  }

  async load(entryPath) {
    const absolute = resolve(entryPath)
    return this.loadFile(absolute)
  }

  async loadFile(filePath) {
    const absolute = resolve(filePath)
    if (this.seen.has(absolute)) return ''
    this.seen.add(absolute)

    let source = await readFile(absolute, 'utf8')
    const imports = [...source.matchAll(IMPORT)]
    const prefix = []
    const loaded = new Set()

    for (const match of imports) {
      const child = await this.resolveImport(dirname(absolute), match[1])
      if (!child) continue

      loaded.add(match[0])
      prefix.push(await this.loadFile(child))
    }

    for (const statement of loaded) source = source.replace(statement, '')

    return [
      ...prefix,
      source.trim()
    ].filter(Boolean).join('\n\n')
  }

  async resolveImport(basePath, specifier) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return resolve(basePath, specifier)
    }

    return this.resolvePackageImport(specifier)
  }

  async resolvePackageImport(specifier) {
    const [name, ...parts] = specifier.split('/')
    const packagePath = join(this.packageRoot, name)

    if (!await exists(packagePath)) return null

    if (parts.length > 0) return join(packagePath, parts.join('/'))

    const manifestPath = join(packagePath, 'photon.json')
    if (await exists(manifestPath)) {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      return join(packagePath, manifest.main ?? 'main.lm')
    }

    return join(packagePath, 'main.lm')
  }
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
