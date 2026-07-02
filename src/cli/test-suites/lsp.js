import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LspTestClient } from '../../testing/LspTestClient.js'
import { TestSuite } from '../../testing/TestSuite.js'

const suite = new TestSuite('LSP integration')

await suite.test('diagnostics and formatting over stdio', async () => {
  const client = new LspTestClient(process.execPath, [
    join('src', 'cli', 'lsp.js')
  ])

  try {
    await client.start()
    await client.request('initialize', {
      processId: process.pid,
      rootUri: null,
      capabilities: {}
    })

    const goodUri = 'file:///good.lm'
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri: goodUri,
        languageId: 'lumen',
        version: 1,
        text: 'function main(): i32 {\n  return 0\n}\n'
      }
    })
    const goodDiagnostics = await client.waitForDiagnostics(goodUri)

    const badUri = 'file:///bad.lm'
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri: badUri,
        languageId: 'lumen',
        version: 1,
        text: 'function main(): i32 {\n  return missing\n}\n'
      }
    })
    const badDiagnostics = await client.waitForDiagnostics(badUri)
    const edits = await client.request('textDocument/formatting', {
      textDocument: { uri: goodUri },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    })

    assert.deepEqual(goodDiagnostics, [])
    assert.equal(badDiagnostics.length, 1)
    assert.match(badDiagnostics[0].message, /Unknown symbol/)
    assert.equal(edits.length, 1)
    assert.equal(edits[0].newText, 'function main(): i32 {\n  return 0\n}\n')
  } finally {
    client.stop()
  }
})

await suite.test('local imports compile over stdio', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-lsp-stdio-'))
  const mainPath = join(root, 'main.lm')
  const libraryPath = join(root, 'library.lm')
  const client = new LspTestClient(process.execPath, [
    join('src', 'cli', 'lsp.js')
  ])

  try {
    await writeFile(libraryPath, [
      'function value(): i32 {',
      '  return 7',
      '}'
    ].join('\n'))
    const source = [
      'import { value } from "./library.lm"',
      'function main(): i32 {',
      '  return value()',
      '}'
    ].join('\n')
    await writeFile(mainPath, source)

    await client.start()
    await client.request('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(root).href,
      capabilities: {}
    })

    const uri = pathToFileURL(mainPath).href
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'lumen',
        version: 1,
        text: source
      }
    })
    assert.deepEqual(await client.waitForDiagnostics(uri), [])
  } finally {
    client.stop()
    await rm(root, { recursive: true, force: true })
  }
})

suite.finish()
