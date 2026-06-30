import assert from 'node:assert/strict'
import test from 'node:test'
import { LspServer, toDiagnostic } from '../../src/lsp/LspServer.js'
import { Diagnostic } from '../../src/diagnostics/Diagnostic.js'

test('lsp publishes diagnostics for invalid document', () => {
  const messages = []
  const server = new LspServer({
    write: message => messages.push(message)
  })

  server.handleMessage({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri: 'untitled://bad.lm',
        text: 'let number: i32 = "no"'
      }
    }
  })

  const diagnostic = messages.find(message => message.method === 'textDocument/publishDiagnostics')

  assert.equal(diagnostic.params.uri, 'untitled://bad.lm')
  assert.equal(diagnostic.params.diagnostics.length, 1)
  assert.match(diagnostic.params.diagnostics[0].message, /Cannot assign string to i32/)
})

test('lsp returns full document formatting edit', () => {
  const messages = []
  const server = new LspServer({
    write: message => messages.push(message)
  })
  const uri = 'untitled://format.lm'

  server.handleMessage({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri,
        text: 'function main() {\nprintln("hi")\n}\n'
      }
    }
  })
  server.handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'textDocument/formatting',
    params: {
      textDocument: { uri }
    }
  })

  const response = messages.find(message => message.id === 1)

  assert.equal(response.result[0].newText, 'function main() {\n  println("hi")\n}\n')
})

test('lsp diagnostic maps one-based compiler locations to zero-based ranges', () => {
  const diagnostic = toDiagnostic(new Diagnostic('boom', { line: 3, column: 5 }, 'type'))

  assert.equal(diagnostic.source, 'type')
  assert.deepEqual(diagnostic.range.start, { line: 2, character: 4 })
  assert.deepEqual(diagnostic.range.end, { line: 2, character: 5 })
})

test('lsp keeps compiler types isolated between documents', () => {
  const messages = []
  const server = new LspServer({
    write: message => messages.push(message)
  })

  openDocument(server, 'untitled://one.lm', [
    'struct Ghost {',
    '  value: i32',
    '}',
    'function main(): i32 {',
    '  return 0',
    '}'
  ].join('\n'))
  openDocument(server, 'untitled://two.lm', [
    'function main(): i32 {',
    '  let ghost: Ghost',
    '  return 0',
    '}'
  ].join('\n'))
  openDocument(server, 'untitled://three.lm', [
    'function main(): i32 {',
    '  return 0',
    '}'
  ].join('\n'))

  const diagnostics = messages.filter(message => {
    return message.method === 'textDocument/publishDiagnostics'
  })

  assert.equal(diagnostics[0].params.diagnostics.length, 0)
  assert.match(diagnostics[1].params.diagnostics[0].message, /Unknown type "Ghost"/)
  assert.equal(diagnostics[2].params.diagnostics.length, 0)
})

function openDocument(server, uri, text) {
  server.handleMessage({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri,
        text
      }
    }
  })
}
