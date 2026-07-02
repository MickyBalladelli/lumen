import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { Diagnostic } from '../../src/diagnostics/Diagnostic.js'
import { LspServer, toDiagnostic } from '../../src/lsp/LspServer.js'

test('lsp publishes diagnostics for invalid document', async () => {
  const messages = []
  const server = testServer(messages)
  const uri = 'untitled://bad.lm'

  await openDocument(server, uri, 'let number: i32 = "no"')

  const diagnostics = latestDiagnostics(messages, uri)
  assert.equal(diagnostics.length, 1)
  assert.match(diagnostics[0].message, /Cannot assign string to i32/)
})

test('lsp publishes multiple diagnostics with full ranges', async () => {
  const messages = []
  const server = testServer(messages)
  const uri = 'untitled://many.lm'

  await openDocument(server, uri, [
    'function first(): i32 {',
    '  return "one"',
    '}',
    'function second(): bool {',
    '  return 2',
    '}'
  ].join('\n'))

  const diagnostics = latestDiagnostics(messages, uri)
  assert.equal(diagnostics.length, 2)
  assert.ok(diagnostics.every(item => {
    return item.range.end.character > item.range.start.character
  }))
})

test('lsp compiles local imports through the CLI module graph', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-lsp-modules-'))
  const libraryPath = join(root, 'library.lm')
  const mainPath = join(root, 'main.lm')
  const mainUri = pathToFileURL(mainPath).href
  const messages = []
  const server = testServer(messages)

  await writeFile(libraryPath, [
    'function value(): i32 {',
    '  return 7',
    '}'
  ].join('\n'))
  await writeFile(mainPath, [
    'import { value } from "./library.lm"',
    'function main(): i32 {',
    '  return value()',
    '}'
  ].join('\n'))

  await openDocument(server, mainUri, await readFile(mainPath, 'utf8'))

  assert.deepEqual(latestDiagnostics(messages, mainUri), [])
  assert.equal(
    messages.some(message => {
      return message.method === 'textDocument/publishDiagnostics' &&
        message.params.diagnostics.some(item => /Unknown module/.test(item.message))
    }),
    false
  )
})

test('lsp uses unsaved imported documents and reports all their errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-lsp-overlays-'))
  const libraryPath = join(root, 'library.lm')
  const mainPath = join(root, 'main.lm')
  const libraryUri = pathToFileURL(libraryPath).href
  const mainUri = pathToFileURL(mainPath).href
  const messages = []
  const server = testServer(messages)

  await writeFile(libraryPath, [
    'function value(): i32 {',
    '  return 7',
    '}'
  ].join('\n'))
  await writeFile(mainPath, [
    'import { value } from "./library.lm"',
    'function main(): i32 {',
    '  return value()',
    '}'
  ].join('\n'))
  await openDocument(server, mainUri, await readFile(mainPath, 'utf8'))

  await openDocument(server, libraryUri, [
    'function value(): i32 {',
    '  return "bad"',
    '}',
    'function other(): bool {',
    '  return 2',
    '}'
  ].join('\n'))

  const diagnostics = latestDiagnostics(messages, libraryUri)
  assert.equal(diagnostics.length, 2)
  assert.ok(diagnostics.some(item => /does not match i32/.test(item.message)))
  assert.ok(diagnostics.some(item => /does not match bool/.test(item.message)))
})

test('lsp returns full document formatting edit', async () => {
  const messages = []
  const server = testServer(messages)
  const uri = 'untitled://format.lm'

  await openDocument(server, uri, 'function main() {\nprintln("hi")\n}\n')
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

test('lsp provides compiler-backed intelligence for a document', async () => {
  const messages = []
  const server = testServer(messages)
  const uri = 'untitled://intelligence.lm'
  const source = [
    'struct Point {',
    '  x: i32',
    '}',
    'function add(value: i32): i32 {',
    '  let total: i32 = value',
    '  return total',
    '}',
    'function main(): i32 {',
    '  let point = Point { x: 1 }',
    '  return add(point.x)',
    '}'
  ].join('\n')

  await openDocument(server, uri, source)

  const definition = request(server, messages, 10, 'textDocument/definition', {
    textDocument: { uri },
    position: { line: 9, character: 10 }
  })
  assert.equal(definition.uri, uri)
  assert.deepEqual(definition.range.start, { line: 3, character: 9 })

  const typeDefinition = request(server, messages, 101, 'textDocument/definition', {
    textDocument: { uri },
    position: { line: 8, character: 15 }
  })
  assert.deepEqual(typeDefinition.range.start, { line: 0, character: 7 })

  const fieldDefinition = request(server, messages, 102, 'textDocument/definition', {
    textDocument: { uri },
    position: { line: 9, character: 19 }
  })
  assert.deepEqual(fieldDefinition.range.start, { line: 1, character: 2 })

  const references = request(server, messages, 11, 'textDocument/references', {
    textDocument: { uri },
    position: { line: 3, character: 10 },
    context: { includeDeclaration: true }
  })
  assert.equal(references.length, 2)

  const hover = request(server, messages, 12, 'textDocument/hover', {
    textDocument: { uri },
    position: { line: 5, character: 10 }
  })
  assert.match(hover.contents.value, /let total: i32/)

  const completions = request(server, messages, 13, 'textDocument/completion', {
    textDocument: { uri },
    position: { line: 9, character: 2 }
  })
  assert.ok(completions.some(item => item.label === 'add'))
  assert.ok(completions.some(item => item.label === 'Point'))
  assert.ok(completions.some(item => item.label === 'println'))
  assert.ok(completions.some(item => item.label === 'return'))

  const rename = request(server, messages, 14, 'textDocument/rename', {
    textDocument: { uri },
    position: { line: 9, character: 10 },
    newName: 'sum'
  })
  assert.equal(rename.changes[uri].length, 2)
  assert.ok(rename.changes[uri].every(edit => edit.newText === 'sum'))

  const symbols = request(server, messages, 15, 'textDocument/documentSymbol', {
    textDocument: { uri }
  })
  assert.ok(symbols.some(symbol => symbol.name === 'Point'))
  assert.ok(symbols.some(symbol => symbol.name === 'add'))
  assert.ok(symbols.some(symbol => symbol.name === 'total'))

  const workspaceSymbols = request(server, messages, 16, 'workspace/symbol', {
    query: 'add'
  })
  assert.equal(workspaceSymbols.length, 1)
  assert.equal(workspaceSymbols[0].name, 'add')

  const semanticTokens = request(server, messages, 17, 'textDocument/semanticTokens/full', {
    textDocument: { uri }
  })
  assert.ok(semanticTokens.data.length > 0)
  assert.equal(semanticTokens.data.length % 5, 0)
  assert.ok(tokenTypes(semanticTokens.data).has(12))
})

test('lsp resolves references and rename across imported modules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-lsp-intelligence-modules-'))
  const libraryPath = join(root, 'library.lm')
  const mainPath = join(root, 'main.lm')
  const mainUri = pathToFileURL(mainPath).href
  const messages = []
  const server = testServer(messages)

  await writeFile(libraryPath, [
    'function value(): i32 {',
    '  return 7',
    '}'
  ].join('\n'))
  const libraryUri = pathToFileURL(await realpath(libraryPath)).href
  const source = [
    'import { value } from "./library.lm"',
    'function main(): i32 {',
    '  return value()',
    '}'
  ].join('\n')
  await writeFile(mainPath, source)
  await openDocument(server, mainUri, source)

  const definition = request(server, messages, 20, 'textDocument/definition', {
    textDocument: { uri: mainUri },
    position: { line: 2, character: 10 }
  })
  assert.equal(definition.uri, libraryUri)
  assert.deepEqual(definition.range.start, { line: 0, character: 9 })

  const references = request(server, messages, 21, 'textDocument/references', {
    textDocument: { uri: mainUri },
    position: { line: 2, character: 10 },
    context: { includeDeclaration: true }
  })
  assert.equal(references.length, 3)

  const rename = request(server, messages, 22, 'textDocument/rename', {
    textDocument: { uri: mainUri },
    position: { line: 2, character: 10 },
    newName: 'answer'
  })
  assert.equal(rename.changes[mainUri].length, 2)
  assert.equal(rename.changes[libraryUri].length, 1)

  await openDocument(server, libraryUri, await readFile(libraryPath, 'utf8'))
  const libraryReferences = request(server, messages, 23, 'textDocument/references', {
    textDocument: { uri: libraryUri },
    position: { line: 0, character: 10 },
    context: { includeDeclaration: true }
  })
  assert.equal(libraryReferences.length, 3)
})

test('lsp references respect compiler scope and shadowing', async () => {
  const messages = []
  const server = testServer(messages)
  const uri = 'untitled://scopes.lm'
  const source = [
    'function first(): i32 {',
    '  let value: i32 = 1',
    '  return value',
    '}',
    'function second(): i32 {',
    '  let value: i32 = 2',
    '  return value',
    '}'
  ].join('\n')

  await openDocument(server, uri, source)
  const references = request(server, messages, 25, 'textDocument/references', {
    textDocument: { uri },
    position: { line: 2, character: 10 },
    context: { includeDeclaration: true }
  })

  assert.equal(references.length, 2)
  assert.ok(references.every(location => location.range.start.line < 4))
})

test('lsp offers compiler-diagnostic and formatting code actions', async () => {
  const messages = []
  const server = testServer(messages)
  const uri = 'untitled://actions.lm'
  const source = [
    'function main(): i32 {',
    'return missing',
    '}'
  ].join('\n')

  await openDocument(server, uri, source)
  const diagnostic = latestDiagnostics(messages, uri)[0]
  const actions = request(server, messages, 30, 'textDocument/codeAction', {
    textDocument: { uri },
    range: diagnostic.range,
    context: {
      diagnostics: [diagnostic]
    }
  })

  assert.ok(actions.some(action => action.title === 'Declare "missing" as i32'))
  assert.ok(actions.some(action => action.title === 'Format Lumen document'))
})

test('lsp didClose cancels work and clears document diagnostics', async () => {
  const messages = []
  const server = testServer(messages)
  const uri = 'untitled://closed.lm'

  await openDocument(server, uri, 'let number: i32 = "no"')
  assert.equal(latestDiagnostics(messages, uri).length, 1)

  server.handleMessage({
    jsonrpc: '2.0',
    method: 'textDocument/didClose',
    params: {
      textDocument: { uri }
    }
  })

  assert.equal(server.documents.has(uri), false)
  assert.deepEqual(latestDiagnostics(messages, uri), [])
})

test('lsp debounces rapid document changes', async () => {
  const messages = []
  const sources = []
  const server = new LspServer({
    diagnosticDelayMs: 20,
    compilerFactory: () => ({
      compileSource(source) {
        sources.push(source)
      }
    }),
    write: message => messages.push(message)
  })
  const uri = 'untitled://debounce.lm'

  server.handleMessage(openMessage(uri, 'first'))
  server.handleMessage(changeMessage(uri, 'second'))
  server.handleMessage(changeMessage(uri, 'last'))
  await server.waitForDiagnostics()

  assert.deepEqual(sources, ['last'])
  assert.deepEqual(latestDiagnostics(messages, uri), [])
})

test('lsp discards stale builds and creates a compiler per build', async () => {
  const messages = []
  const compilers = []
  const uri = 'untitled://stale.lm'
  const server = new LspServer({
    diagnosticDelayMs: 0,
    compilerFactory: () => {
      const compiler = {
        async compileSource(source) {
          if (source === 'slow') {
            await delay(30)
            throw new Diagnostic('stale error', {
              line: 1,
              column: 1,
              sourcePath: uri
            }, 'type')
          }
        }
      }
      compilers.push(compiler)
      return compiler
    },
    write: message => messages.push(message)
  })

  server.handleMessage(openMessage(uri, 'slow'))
  await delay(5)
  server.handleMessage(changeMessage(uri, 'current'))
  await server.waitForDiagnostics()
  await delay(35)

  const publications = messages.filter(message => {
    return message.method === 'textDocument/publishDiagnostics' &&
      message.params.uri === uri
  })
  assert.equal(compilers.length, 2)
  assert.notEqual(compilers[0], compilers[1])
  assert.ok(publications.length > 0)
  assert.ok(publications.every(message => message.params.diagnostics.length === 0))
})

test('lsp diagnostic maps one-based compiler locations to zero-based ranges', () => {
  const diagnostic = toDiagnostic(new Diagnostic('boom', { line: 3, column: 5 }, 'type'))

  assert.equal(diagnostic.source, 'type')
  assert.deepEqual(diagnostic.range.start, { line: 2, character: 4 })
  assert.deepEqual(diagnostic.range.end, { line: 2, character: 5 })
})

test('lsp keeps compiler types isolated between documents', async () => {
  const messages = []
  const server = testServer(messages)
  const one = 'untitled://one.lm'
  const two = 'untitled://two.lm'
  const three = 'untitled://three.lm'

  await openDocument(server, one, [
    'struct Ghost {',
    '  value: i32',
    '}',
    'function main(): i32 {',
    '  return 0',
    '}'
  ].join('\n'))
  await openDocument(server, two, [
    'function main(): i32 {',
    '  let ghost: Ghost',
    '  return 0',
    '}'
  ].join('\n'))
  await openDocument(server, three, [
    'function main(): i32 {',
    '  return 0',
    '}'
  ].join('\n'))

  assert.equal(latestDiagnostics(messages, one).length, 0)
  assert.match(latestDiagnostics(messages, two)[0].message, /Unknown type "Ghost"/)
  assert.equal(latestDiagnostics(messages, three).length, 0)
})

function testServer(messages) {
  return new LspServer({
    diagnosticDelayMs: 0,
    write: message => messages.push(message)
  })
}

async function openDocument(server, uri, text) {
  server.handleMessage(openMessage(uri, text))
  await server.waitForDiagnostics()
}

function openMessage(uri, text) {
  return {
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri,
        languageId: 'lumen',
        version: 1,
        text
      }
    }
  }
}

function changeMessage(uri, text) {
  return {
    jsonrpc: '2.0',
    method: 'textDocument/didChange',
    params: {
      textDocument: {
        uri,
        version: 2
      },
      contentChanges: [{ text }]
    }
  }
}

function latestDiagnostics(messages, uri) {
  return messages
    .filter(message => {
      return message.method === 'textDocument/publishDiagnostics' &&
        message.params.uri === uri
    })
    .at(-1)?.params.diagnostics ?? null
}

function request(server, messages, id, method, params) {
  server.handleMessage({
    jsonrpc: '2.0',
    id,
    method,
    params
  })
  const response = messages.find(message => message.id === id)
  assert.ok(response, `missing response for ${method}`)
  assert.equal(response.error, undefined)
  return response.result
}

function tokenTypes(data) {
  const types = new Set()
  for (let index = 3; index < data.length; index += 5) {
    types.add(data[index])
  }
  return types
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}
