import assert from 'node:assert/strict'
import { join } from 'node:path'
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

suite.finish()
