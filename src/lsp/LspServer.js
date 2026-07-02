import { fileURLToPath, pathToFileURL } from 'node:url'
import { Compiler } from '../compiler/Compiler.js'
import { formatSource } from '../formatter/Formatter.js'
import { diagnosticsFrom } from '../diagnostics/Diagnostic.js'

export class LspServer {
  constructor({
    compilerFactory = () => new Compiler(),
    documents = new Map(),
    write = () => {},
    diagnosticDelayMs = 75
  } = {}) {
    this.compilerFactory = compilerFactory
    this.documents = documents
    this.write = write
    this.diagnosticDelayMs = diagnosticDelayMs
    this.shutdown = false
    this.generations = new Map()
    this.pendingDiagnostics = new Map()
    this.dependenciesByRoot = new Map()
    this.diagnosticsByRoot = new Map()
  }

  handleMessage(message) {
    const { id, method, params } = message

    if (method === 'initialize') {
      return this.respond(id, {
        capabilities: {
          textDocumentSync: {
            openClose: true,
            change: 1,
            save: {
              includeText: true
            }
          },
          documentFormattingProvider: true
        },
        serverInfo: {
          name: 'lumen-lsp',
          version: '0.1.0'
        }
      })
    }

    if (method === 'shutdown') {
      this.shutdown = true
      return this.respond(id, null)
    }

    if (method === 'textDocument/didOpen') {
      const { uri, text } = params.textDocument
      this.documents.set(uri, text)
      this.scheduleAffectedDiagnostics(uri)
      return null
    }

    if (method === 'textDocument/didChange') {
      const uri = params.textDocument.uri
      const change = params.contentChanges?.at(-1)
      if (change?.text !== undefined) {
        this.documents.set(uri, change.text)
        this.scheduleAffectedDiagnostics(uri)
      }
      return null
    }

    if (method === 'textDocument/didSave') {
      const uri = params.textDocument.uri
      if (params.text !== undefined) this.documents.set(uri, params.text)
      this.scheduleAffectedDiagnostics(uri, 0)
      return null
    }

    if (method === 'textDocument/didClose') {
      this.closeDocument(params.textDocument.uri)
      return null
    }

    if (method === 'textDocument/formatting') {
      const uri = params.textDocument.uri
      const source = this.documents.get(uri) ?? ''
      const formatted = formatSource(source)
      return this.respond(id, [{
        range: {
          start: { line: 0, character: 0 },
          end: { line: source.split(/\r?\n/).length + 1, character: 0 }
        },
        newText: formatted
      }])
    }

    if (id !== undefined) return this.respond(id, null)
    return null
  }

  scheduleAffectedDiagnostics(uri, delay = this.diagnosticDelayMs) {
    const roots = new Set()
    if (this.documents.has(uri)) roots.add(uri)

    for (const [root, dependencies] of this.dependenciesByRoot) {
      if (this.documents.has(root) && dependencies.has(uri)) roots.add(root)
    }

    for (const root of roots) this.scheduleDiagnostics(root, delay)
  }

  scheduleDiagnostics(uri, delay) {
    this.cancelPendingDiagnostics(uri)

    const generation = (this.generations.get(uri) ?? 0) + 1
    this.generations.set(uri, generation)
    const state = {}
    state.promise = new Promise(resolve => {
      state.resolve = resolve
    })
    state.timer = setTimeout(async () => {
      try {
        await this.buildDiagnostics(uri, generation)
      } finally {
        if (this.pendingDiagnostics.get(uri) === state) {
          this.pendingDiagnostics.delete(uri)
        }
        state.resolve()
      }
    }, delay)
    this.pendingDiagnostics.set(uri, state)
  }

  cancelPendingDiagnostics(uri) {
    const pending = this.pendingDiagnostics.get(uri)
    if (pending) {
      clearTimeout(pending.timer)
      pending.resolve()
      this.pendingDiagnostics.delete(uri)
    }
    this.generations.set(uri, (this.generations.get(uri) ?? 0) + 1)
  }

  async waitForDiagnostics(uri = null) {
    while (true) {
      const pending = uri
        ? [this.pendingDiagnostics.get(uri)].filter(Boolean)
        : [...this.pendingDiagnostics.values()]
      if (pending.length === 0) return
      await Promise.all(pending.map(state => state.promise))
    }
  }

  async buildDiagnostics(uri, generation) {
    const source = this.documents.get(uri)
    if (source === undefined) return

    const diagnostics = []
    let dependencies = null

    try {
      const compiler = this.compilerFactory()
      if (uri.startsWith('file:')) {
        const result = await compiler.compileFile(fileURLToPath(uri), {
          sourceOverrides: this.sourceOverrides()
        })
        dependencies = new Set(
          result.moduleGraph.modules.map(module => pathToFileURL(module.path).href)
        )
      } else {
        await compiler.compileSource(source, {
          sourcePath: uri
        })
        dependencies = new Set([uri])
      }
    } catch (error) {
      const errors = diagnosticsFrom(error)
      diagnostics.push(...(errors.length > 0 ? errors : [error]))
      if (error?.moduleGraph) {
        dependencies = new Set(
          error.moduleGraph.modules.map(module => pathToFileURL(module.path).href)
        )
      }
    }

    if (this.generations.get(uri) !== generation || !this.documents.has(uri)) return
    if (dependencies) this.dependenciesByRoot.set(uri, dependencies)

    const previous = this.diagnosticsByRoot.get(uri) ?? new Map()
    const next = new Map([[uri, []]])
    for (const error of diagnostics) {
      const target = diagnosticUri(error?.location?.sourcePath, uri)
      const items = next.get(target) ?? []
      items.push(toDiagnostic(error))
      next.set(target, items)
    }
    this.diagnosticsByRoot.set(uri, next)

    const targets = new Set([...previous.keys(), ...next.keys()])
    for (const target of targets) this.publishCombinedDiagnostics(target)
  }

  sourceOverrides() {
    const overrides = new Map()

    for (const [uri, source] of this.documents) {
      if (!uri.startsWith('file:')) continue
      overrides.set(fileURLToPath(uri), source)
    }

    return overrides
  }

  closeDocument(uri) {
    const dependentRoots = [...this.dependenciesByRoot]
      .filter(([root, dependencies]) => root !== uri && dependencies.has(uri))
      .map(([root]) => root)
    const previousTargets = new Set(
      this.diagnosticsByRoot.get(uri)?.keys() ?? []
    )

    this.cancelPendingDiagnostics(uri)
    this.documents.delete(uri)
    this.dependenciesByRoot.delete(uri)
    this.diagnosticsByRoot.delete(uri)

    for (const target of previousTargets) this.publishCombinedDiagnostics(target)
    this.notify('textDocument/publishDiagnostics', {
      uri,
      diagnostics: []
    })

    for (const root of dependentRoots) {
      if (this.documents.has(root)) {
        this.scheduleDiagnostics(root, this.diagnosticDelayMs)
      }
    }
  }

  publishCombinedDiagnostics(uri) {
    const diagnostics = []
    const seen = new Set()

    for (const result of this.diagnosticsByRoot.values()) {
      for (const diagnostic of result.get(uri) ?? []) {
        const key = JSON.stringify(diagnostic)
        if (seen.has(key)) continue
        seen.add(key)
        diagnostics.push(diagnostic)
      }
    }

    this.notify('textDocument/publishDiagnostics', {
      uri,
      diagnostics
    })
  }

  respond(id, result) {
    return this.write({
      jsonrpc: '2.0',
      id,
      result
    })
  }

  notify(method, params) {
    return this.write({
      jsonrpc: '2.0',
      method,
      params
    })
  }
}

export function toDiagnostic(error) {
  const location = error?.location ?? { line: 1, column: 1 }
  const line = Math.max(location.line - 1, 0)
  const character = Math.max(location.column - 1, 0)
  const endLine = Math.max((location.endLine ?? location.line) - 1, line)
  const endCharacter = Math.max(
    (location.endColumn ?? location.column + 1) - 1,
    endLine === line ? character + 1 : 0
  )

  return {
    range: {
      start: { line, character },
      end: { line: endLine, character: endCharacter }
    },
    severity: 1,
    source: error?.phase ?? 'lumen',
    message: error?.rawMessage ?? error?.message ?? String(error),
    relatedInformation: (error?.notes ?? [])
      .filter(note => note.location?.sourcePath)
      .map(note => ({
        location: {
          uri: diagnosticUri(note.location.sourcePath),
          range: diagnosticRange(note.location)
        },
        message: note.message
      }))
  }
}

function diagnosticUri(sourcePath, fallback = null) {
  if (!sourcePath) return fallback
  return sourcePath.includes('://')
    ? sourcePath
    : pathToFileURL(sourcePath).href
}

function diagnosticRange(location) {
  const line = Math.max((location.line ?? 1) - 1, 0)
  const character = Math.max((location.column ?? 1) - 1, 0)
  return {
    start: { line, character },
    end: {
      line: Math.max((location.endLine ?? location.line ?? 1) - 1, line),
      character: Math.max((location.endColumn ?? location.column + 1) - 1, character + 1)
    }
  }
}
