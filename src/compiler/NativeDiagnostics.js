import { randomUUID } from 'node:crypto'
import { access, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { SelfHostedCompiler } from './SelfHostedCompiler.js'

export class NativeDiagnostics {
  constructor({ compiler = new SelfHostedCompiler() } = {}) {
    this.compiler = compiler
  }

  async diagnoseFile(path, source = null) {
    let input = path
    if (source !== null) {
      let directory = dirname(path)
      try {
        await access(path)
      } catch {
        directory = tmpdir()
      }
      input = join(directory, `.lumen-lsp-${process.pid}-${randomUUID()}.lm`)
      await writeFile(input, source)
    }

    try {
      const compilerPath = await this.compiler.nativeCompiler()
      const result = await run(compilerPath, ['diagnose', input])
      return parseDiagnostics(result.stdout, input, path)
    } finally {
      if (input !== path) {
        await unlink(input).catch(error => {
          if (error.code !== 'ENOENT') throw error
        })
      }
    }
  }
}

function parseDiagnostics(stdout, temporaryPath, sourcePath) {
  return stdout.split(/\r?\n/).flatMap(line => {
    if (!line.startsWith('LUMEN_DIAGNOSTIC|')) return []
    const [, file, lineNumber, column, ...message] = line.split('|')
    return [{
      phase: 'lumen',
      rawMessage: message.join('|').replace(/^compile error:\s*/, ''),
      location: {
        sourcePath: file === temporaryPath ? sourcePath : file,
        line: Number(lineNumber),
        column: Number(column),
        endLine: Number(lineNumber),
        endColumn: Number(column) + 1
      }
    }]
  })
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }))
  })
}
