import { spawn } from 'node:child_process'

export class LspTestClient {
  constructor(command, args = [], {
    cwd = process.cwd(),
    env = process.env,
    timeoutMs = 5000
  } = {}) {
    this.command = command
    this.args = args
    this.cwd = cwd
    this.env = env
    this.timeoutMs = timeoutMs
    this.nextId = 1
    this.pending = new Map()
    this.diagnostics = new Map()
    this.buffer = Buffer.alloc(0)
  }

  start() {
    return new Promise((resolve, reject) => {
      this.child = spawn(this.command, this.args, {
        cwd: this.cwd,
        env: this.env
      })
      this.child.stdout.on('data', chunk => this.read(chunk))
      this.child.stderr.on('data', chunk => process.stderr.write(chunk))
      this.child.once('error', reject)
      this.child.once('spawn', resolve)
      this.child.on('close', () => {
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer)
          pending.reject(new Error('LSP process closed before responding'))
        }
        this.pending.clear()
      })
    })
  }

  request(method, params) {
    const id = this.nextId
    this.nextId += 1

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`LSP request timed out: ${method}`))
      }, this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
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
    return new Promise((resolve, reject) => {
      const existing = this.diagnostics.get(uri)
      if (existing) return resolve(existing)

      const timeout = setTimeout(() => {
        clearInterval(interval)
        reject(new Error(`LSP diagnostics timed out: ${uri}`))
      }, this.timeoutMs)
      const interval = setInterval(() => {
        const diagnostics = this.diagnostics.get(uri)
        if (diagnostics) {
          clearTimeout(timeout)
          clearInterval(interval)
          resolve(diagnostics)
        }
      }, 10)
    })
  }

  async shutdown() {
    await this.request('shutdown', null)

    const closed = new Promise((resolve, reject) => {
      this.child.once('error', reject)
      this.child.once('close', code => resolve(code ?? 1))
    })
    this.notify('exit', null)
    return closed
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
    clearTimeout(pending.timer)
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
