#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { Compiler } from '../compiler/Compiler.js'
import { formatSource } from '../formatter/Formatter.js'

const compiler = new Compiler()
const documents = new Map()
let buffer = Buffer.alloc(0)
let shutdown = false

process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk])
  readMessages()
})

function readMessages() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return

    const header = buffer.slice(0, headerEnd).toString('utf8')
    const match = /Content-Length: (\d+)/i.exec(header)
    if (!match) {
      buffer = buffer.slice(headerEnd + 4)
      continue
    }

    const length = Number(match[1])
    const bodyStart = headerEnd + 4
    const bodyEnd = bodyStart + length
    if (buffer.length < bodyEnd) return

    const body = buffer.slice(bodyStart, bodyEnd).toString('utf8')
    buffer = buffer.slice(bodyEnd)
    handleMessage(JSON.parse(body))
  }
}

function handleMessage(message) {
  const { id, method, params } = message

  if (method === 'initialize') {
    return respond(id, {
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
    shutdown = true
    return respond(id, null)
  }

  if (method === 'exit') process.exit(shutdown ? 0 : 1)

  if (method === 'textDocument/didOpen') {
    documents.set(params.textDocument.uri, params.textDocument.text)
    publishDiagnostics(params.textDocument.uri)
    return
  }

  if (method === 'textDocument/didChange') {
    const change = params.contentChanges?.[0]
    if (change?.text !== undefined) {
      documents.set(params.textDocument.uri, change.text)
      publishDiagnostics(params.textDocument.uri)
    }
    return
  }

  if (method === 'textDocument/didSave') {
    publishDiagnostics(params.textDocument.uri)
    return
  }

  if (method === 'textDocument/formatting') {
    const uri = params.textDocument.uri
    const source = documents.get(uri) ?? ''
    const formatted = formatSource(source)
    return respond(id, [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: source.split(/\r?\n/).length + 1, character: 0 }
      },
      newText: formatted
    }])
  }

  if (id !== undefined) respond(id, null)
}

function publishDiagnostics(uri) {
  const source = documents.get(uri) ?? ''
  const diagnostics = []

  try {
    compiler.compileSource(source, {
      sourcePath: uri.startsWith('file:') ? fileURLToPath(uri) : null
    })
  } catch (error) {
    diagnostics.push(toDiagnostic(error))
  }

  notify('textDocument/publishDiagnostics', {
    uri,
    diagnostics
  })
}

function toDiagnostic(error) {
  const location = error.location ?? { line: 1, column: 1 }
  const line = Math.max(location.line - 1, 0)
  const character = Math.max(location.column - 1, 0)

  return {
    range: {
      start: { line, character },
      end: { line, character: character + 1 }
    },
    severity: 1,
    source: error.phase ?? 'lumen',
    message: error.rawMessage ?? error.message
  }
}

function respond(id, result) {
  write({
    jsonrpc: '2.0',
    id,
    result
  })
}

function notify(method, params) {
  write({
    jsonrpc: '2.0',
    method,
    params
  })
}

function write(message) {
  const body = JSON.stringify(message)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
}
