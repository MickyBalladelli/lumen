import assert from 'node:assert/strict'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { TestSuite } from '../../testing/TestSuite.js'

const suite = new TestSuite('LSP integration')

class LspTestClient {
  constructor() {
    this.nextId = 1
    this.pending = new Map()
    this.diagnostics = new Map()
    this.buffer = Buffer.alloc(0)
  }

  start() {
    return new Promise((resolve, reject) => {
      this.child = spawn(process.execPath, [join('src', 'cli', 'lsp.js')])
      this.child.stdout.on('data', chunk => this.read(chunk))
      this.child.stderr.on('data', chunk => process.stderr.write(chunk))
      this.child.on('error', reject)
      setTimeout(resolve, 10)
    })
  }

  request(method, params) {
    const id = this.nextId
    this.nextId += 1

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.write({
        jsonrpc: '2.0',
        id,
        method,
        params
      })
    })
  }

  notify(method, params) {
    this.write({
      jsonrpc: '2.0',
      method,
      params
    })
  }

  waitForDiagnostics(uri) {
    return new Promise(resolve => {
      const existing = this.diagnostics.get(uri)
      if (existing) return resolve(existing)

      const interval = setInterval(() => {
        const diagnostics = this.diagnostics.get(uri)
        if (diagnostics) {
          clearInterval(interval)
          resolve(diagnostics)
        }
      }, 10)
    })
  }

  read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return

      const header = this.buffer.slice(0, headerEnd).toString('utf8')
      const match = /Content-Length: (\d+)/i.exec(header)
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }

      const length = Number(match[1])
      const bodyStart = headerEnd + 4
      const bodyEnd = bodyStart + length
      if (this.buffer.length < bodyEnd) return

      const body = this.buffer.slice(bodyStart, bodyEnd).toString('utf8')
      this.buffer = this.buffer.slice(bodyEnd)
      this.handle(JSON.parse(body))
    }
  }

  handle(message) {
    if (message.method === 'textDocument/publishDiagnostics') {
      this.diagnostics.set(message.params.uri, message.params.diagnostics)
      return
    }

    const pending = this.pending.get(message.id)
    if (!pending) return

    this.pending.delete(message.id)
    if (message.error) pending.reject(new Error(message.error.message))
    else pending.resolve(message.result)
  }

  write(message) {
    const body = JSON.stringify(message)
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
  }

  stop() {
    if (this.child) this.child.kill()
  }
}

await suite.test('diagnostics and formatting over stdio', async () => {
  const client = new LspTestClient()

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
