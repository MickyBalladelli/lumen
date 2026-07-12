#!/usr/bin/env node
import { LspServer } from '../lsp/LspServer.js'
import { NativeDiagnostics } from '../compiler/NativeDiagnostics.js'

let buffer = Buffer.alloc(0)
const server = new LspServer({
  nativeDiagnostics: new NativeDiagnostics(),
  write
})

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
    const message = JSON.parse(body)
    if (message.method === 'exit') process.exit(server.shutdown ? 0 : 1)
    server.handleMessage(message)
  }
}

function write(message) {
  const body = JSON.stringify(message)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
}
