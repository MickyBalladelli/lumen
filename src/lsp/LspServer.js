import { pathToFileURL } from 'node:url'
import { Compiler } from '../compiler/Compiler.js'
import { formatSource } from '../formatter/Formatter.js'
import { diagnosticsFrom } from '../diagnostics/Diagnostic.js'

export class LspServer {
  constructor({
    compiler = new Compiler(),
    documents = new Map(),
    write = () => {}
  } = {}) {
    this.compiler = compiler
    this.documents = documents
    this.write = write
    this.shutdown = false
  }

  handleMessage(message) {
    const { id, method, params } = message

    if (method === 'initialize') {
      return this.respond(id, {
        capabilities: {
          textDocumentSync: 1,
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
      this.documents.set(params.textDocument.uri, params.textDocument.text)
      this.publishDiagnostics(params.textDocument.uri)
      return null
    }

    if (method === 'textDocument/didChange') {
      const change = params.contentChanges?.[0]
      if (change?.text !== undefined) {
        this.documents.set(params.textDocument.uri, change.text)
        this.publishDiagnostics(params.textDocument.uri)
      }
      return null
    }

    if (method === 'textDocument/didSave') {
      this.publishDiagnostics(params.textDocument.uri)
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

  publishDiagnostics(uri) {
    const source = this.documents.get(uri) ?? ''
    const diagnostics = []

    try {
      this.compiler.compileSource(source, {
        sourcePath: uri
      })
    } catch (error) {
      const errors = diagnosticsFrom(error)
      diagnostics.push(...(errors.length > 0 ? errors : [error]).map(toDiagnostic))
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
  const location = error.location ?? { line: 1, column: 1 }
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
    source: error.phase ?? 'lumen',
    message: error.rawMessage ?? error.message,
    relatedInformation: (error.notes ?? [])
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

function diagnosticUri(sourcePath) {
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
