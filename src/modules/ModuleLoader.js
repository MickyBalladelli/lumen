import { access, readFile, realpath } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Tokenizer } from '../lexer/Tokenizer.js'
import { Parser } from '../parser/Parser.js'
import {
  Diagnostic,
  DiagnosticCollection,
  throwDiagnostics
} from '../diagnostics/Diagnostic.js'
import { ModuleGraph } from './ModuleGraph.js'

export class ModuleLoader {
  constructor({
    packageRoot = '.photon/packages',
    tokenizer = Tokenizer,
    parser = Parser
  } = {}) {
    this.packageRoot = resolve(packageRoot)
    this.tokenizer = tokenizer
    this.parser = parser
  }

  async load(entryPath) {
    this.modules = new Map()
    this.loading = new Set()

    const entry = await this.loadFile(resolve(entryPath))
    const graph = new ModuleGraph({
      entry,
      modules: [...this.modules.values()]
    })

    try {
      return graph.link()
    } catch (error) {
      if (error instanceof Diagnostic) {
        const source = graph.sources.get(error.location?.sourcePath)
        if (source) throw error.withSource(source)
      }
      if (error instanceof DiagnosticCollection) {
        throw error.withSources(graph.sources, graph.entry.source)
      }
      throw error
    }
  }

  async loadFile(filePath, importedBy = null) {
    const canonicalPath = await this.canonicalPath(filePath, importedBy)

    if (this.loading.has(canonicalPath)) {
      const chain = [...this.loading, canonicalPath]
        .map(path => path.split('/').at(-1))
        .join(' -> ')
      throw this.moduleDiagnostic(`Circular import: ${chain}`, importedBy)
    }

    const cached = this.modules.get(canonicalPath)
    if (cached) return cached

    const source = await readFile(canonicalPath, 'utf8')
    let tokens
    let ast

    try {
      tokens = new this.tokenizer(source, {
        sourcePath: canonicalPath
      }).tokenize()
      const diagnostics = []
      ast = new this.parser(tokens).parseProgram({ diagnostics })
      throwDiagnostics(diagnostics)
    } catch (error) {
      if (error instanceof Diagnostic) throw error.withSource(source)
      if (error instanceof DiagnosticCollection) {
        throw error.withSources(new Map([[canonicalPath, source]]), source)
      }
      throw error
    }
    const module = {
      path: canonicalPath,
      source,
      tokens,
      ast,
      imports: [],
      index: this.modules.size
    }

    this.modules.set(canonicalPath, module)
    this.loading.add(canonicalPath)

    try {
      const declarations = ast.body.filter(node => node.kind === 'ImportDeclaration')

      for (const declaration of declarations) {
        const resolution = await this.resolveImport(dirname(canonicalPath), declaration.source)
        const edge = {
          declaration,
          target: null,
          allowedExports: resolution?.exports ?? null
        }

        if (resolution?.path) {
          edge.target = await this.loadFile(resolution.path, {
            module,
            declaration
          })
        }

        module.imports.push(edge)
      }
    } finally {
      this.loading.delete(canonicalPath)
    }

    return module
  }

  async canonicalPath(filePath, importedBy) {
    try {
      return await realpath(filePath)
    } catch {
      throw this.moduleDiagnostic(`Cannot resolve module "${filePath}"`, importedBy)
    }
  }

  moduleDiagnostic(message, importedBy) {
    const diagnostic = new Diagnostic(
      message,
      importedBy?.declaration.location ?? null,
      'module'
    )

    return importedBy?.module.source
      ? diagnostic.withSource(importedBy.module.source)
      : diagnostic
  }

  async resolveImport(basePath, specifier) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return {
        path: resolve(basePath, specifier),
        exports: null
      }
    }

    return this.resolvePackageImport(specifier)
  }

  async resolvePackageImport(specifier) {
    const [name, ...parts] = specifier.split('/')
    const packagePath = join(this.packageRoot, name)

    if (!await exists(packagePath)) return null
    if (parts.length > 0) {
      return {
        path: join(packagePath, parts.join('/')),
        exports: null
      }
    }

    const manifestPath = join(packagePath, 'photon.json')
    if (!await exists(manifestPath)) {
      return {
        path: join(packagePath, 'main.lm'),
        exports: null
      }
    }

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    return {
      path: join(packagePath, manifest.main ?? 'main.lm'),
      exports: Array.isArray(manifest.exports) ? new Set(manifest.exports) : null
    }
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
