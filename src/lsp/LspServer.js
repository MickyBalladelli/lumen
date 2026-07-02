import { fileURLToPath, pathToFileURL } from 'node:url'
import { Compiler } from '../compiler/Compiler.js'
import { formatSource } from '../formatter/Formatter.js'
import { diagnosticsFrom } from '../diagnostics/Diagnostic.js'
import {
  LanguageIndex,
  SemanticTokenTypes
} from './LanguageIndex.js'

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
    this.intelligenceByRoot = new Map()
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
          documentFormattingProvider: true,
          definitionProvider: true,
          referencesProvider: true,
          hoverProvider: true,
          completionProvider: {
            triggerCharacters: ['.']
          },
          renameProvider: true,
          documentSymbolProvider: true,
          workspaceSymbolProvider: true,
          semanticTokensProvider: {
            legend: {
              tokenTypes: SemanticTokenTypes,
              tokenModifiers: []
            },
            full: true
          },
          codeActionProvider: {
            codeActionKinds: [
              'quickfix',
              'source.fixAll.lumen'
            ]
          }
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

    if (method === 'textDocument/definition') {
      return this.intelligenceRequest(id, () => {
        return this.indexForUri(params.textDocument.uri)
          ?.definition(params.textDocument.uri, params.position) ?? null
      })
    }

    if (method === 'textDocument/references') {
      return this.intelligenceRequest(id, () => {
        return this.workspaceReferences(
          params.textDocument.uri,
          params.position,
          params.context?.includeDeclaration !== false
        )
      })
    }

    if (method === 'textDocument/hover') {
      return this.intelligenceRequest(id, () => {
        return this.indexForUri(params.textDocument.uri)
          ?.hover(params.textDocument.uri, params.position) ?? null
      })
    }

    if (method === 'textDocument/completion') {
      return this.intelligenceRequest(id, () => {
        return this.indexForUri(params.textDocument.uri)
          ?.completion(params.textDocument.uri) ?? []
      })
    }

    if (method === 'textDocument/rename') {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(params.newName)) {
        return this.respondError(id, -32602, 'Rename needs a valid Lumen identifier')
      }
      return this.intelligenceRequest(id, () => {
        return this.workspaceRename(
          params.textDocument.uri,
          params.position,
          params.newName
        )
      })
    }

    if (method === 'textDocument/documentSymbol') {
      return this.intelligenceRequest(id, () => {
        return this.indexForUri(params.textDocument.uri)
          ?.documentSymbols(params.textDocument.uri) ?? []
      })
    }

    if (method === 'workspace/symbol') {
      return this.intelligenceRequest(id, () => {
        return this.workspaceSymbols(params.query ?? '')
      })
    }

    if (method === 'textDocument/semanticTokens/full') {
      return this.intelligenceRequest(id, () => {
        return this.indexForUri(params.textDocument.uri)
          ?.semanticTokens(params.textDocument.uri) ?? { data: [] }
      })
    }

    if (method === 'textDocument/codeAction') {
      return this.intelligenceRequest(id, () => this.codeActions(params))
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
    let intelligence = null

    try {
      const compiler = this.compilerFactory()
      if (uri.startsWith('file:')) {
        const result = await compiler.compileFile(fileURLToPath(uri), {
          sourceOverrides: this.sourceOverrides()
        })
        if (result) {
          intelligence = LanguageIndex.fromCompilation(result, { uri, source })
        }
        dependencies = new Set(
          result.moduleGraph.modules.map(module => pathToFileURL(module.path).href)
        )
      } else {
        const result = await compiler.compileSource(source, {
          sourcePath: uri
        })
        if (result) {
          intelligence = LanguageIndex.fromCompilation(result, { uri, source })
        }
        dependencies = new Set([uri])
      }
    } catch (error) {
      const errors = diagnosticsFrom(error)
      diagnostics.push(...(errors.length > 0 ? errors : [error]))
      if (error?.moduleGraph) {
        intelligence = LanguageIndex.fromModuleGraph(error.moduleGraph)
        dependencies = new Set(
          error.moduleGraph.modules.map(module => pathToFileURL(module.path).href)
        )
      }
    }

    if (this.generations.get(uri) !== generation || !this.documents.has(uri)) return
    if (dependencies) this.dependenciesByRoot.set(uri, dependencies)
    if (intelligence) this.intelligenceByRoot.set(uri, intelligence)

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
    this.intelligenceByRoot.delete(uri)

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

  intelligenceRequest(id, callback) {
    if (this.pendingDiagnostics.size === 0) {
      try {
        return this.respond(id, callback())
      } catch (error) {
        return this.respondError(id, -32603, error.message)
      }
    }

    this.waitForDiagnostics()
      .then(() => this.respond(id, callback()))
      .catch(error => this.respondError(id, -32603, error.message))
    return null
  }

  indexForUri(uri) {
    return [...this.intelligenceByRoot.values()]
      .filter(index => index.hasUri(uri))
      .sort((left, right) => right.modules.length - left.modules.length)[0] ??
      null
  }

  workspaceReferences(uri, position, includeDeclaration) {
    const index = this.indexForUri(uri)
    const definition = index?.definition(uri, position)
    if (!definition) return []

    const references = []
    const seen = new Set()
    for (const candidate of this.intelligenceByRoot.values()) {
      if (!candidate.hasUri(definition.uri)) continue
      for (const reference of candidate.references(
        definition.uri,
        definition.range.start,
        includeDeclaration
      )) {
        const key = locationKey(reference)
        if (seen.has(key)) continue
        seen.add(key)
        references.push(reference)
      }
    }
    return references
  }

  workspaceRename(uri, position, newName) {
    const index = this.indexForUri(uri)
    const definition = index?.definition(uri, position)
    if (!definition) return null

    const changes = {}
    const seen = new Set()
    for (const candidate of this.intelligenceByRoot.values()) {
      if (!candidate.hasUri(definition.uri)) continue
      const edit = candidate.rename(
        definition.uri,
        definition.range.start,
        newName
      )
      for (const [targetUri, items] of Object.entries(edit?.changes ?? {})) {
        changes[targetUri] ??= []
        for (const item of items) {
          const key = `${targetUri}:${rangeKey(item.range)}`
          if (seen.has(key)) continue
          seen.add(key)
          changes[targetUri].push(item)
        }
      }
    }
    return { changes }
  }

  workspaceSymbols(query) {
    const symbols = []
    const seen = new Set()

    for (const index of this.intelligenceByRoot.values()) {
      for (const symbol of index.workspaceSymbols(query)) {
        const key = `${symbol.location.uri}:${symbol.location.range.start.line}:${symbol.location.range.start.character}`
        if (seen.has(key)) continue
        seen.add(key)
        symbols.push(symbol)
      }
    }

    return symbols
  }

  codeActions(params) {
    const uri = params.textDocument.uri
    const source = this.documents.get(uri) ?? ''
    const actions = []

    for (const diagnostic of params.context?.diagnostics ?? []) {
      const match = /Unknown symbol "([A-Za-z_][A-Za-z0-9_]*)"/.exec(diagnostic.message)
      if (!match) continue

      const line = source.split(/\r?\n/)[diagnostic.range.start.line] ?? ''
      const indent = /^\s*/.exec(line)?.[0] ?? ''
      actions.push({
        title: `Declare "${match[1]}" as i32`,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        isPreferred: true,
        edit: {
          changes: {
            [uri]: [{
              range: {
                start: {
                  line: diagnostic.range.start.line,
                  character: 0
                },
                end: {
                  line: diagnostic.range.start.line,
                  character: 0
                }
              },
              newText: `${indent}let ${match[1]}: i32 = 0\n`
            }]
          }
        }
      })
    }

    const formatted = formatSource(source)
    if (formatted !== source) {
      actions.push({
        title: 'Format Lumen document',
        kind: 'source.fixAll.lumen',
        edit: {
          changes: {
            [uri]: [{
              range: {
                start: { line: 0, character: 0 },
                end: {
                  line: source.split(/\r?\n/).length + 1,
                  character: 0
                }
              },
              newText: formatted
            }]
          }
        }
      })
    }

    return actions
  }

  respond(id, result) {
    return this.write({
      jsonrpc: '2.0',
      id,
      result
    })
  }

  respondError(id, code, message) {
    return this.write({
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
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

function locationKey(location) {
  return `${location.uri}:${rangeKey(location.range)}`
}

function rangeKey(range) {
  return [
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character
  ].join(':')
}
