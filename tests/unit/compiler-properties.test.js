import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'

test('compiler properties hold for generated and malformed programs', async () => {
  const result = await run([
    new URL('../../src/cli/fuzz-compiler.js', import.meta.url).pathname,
    '--seed',
    '1280527694',
    '--runs',
    '80',
    '--timeout',
    '30000'
  ])

  assert.equal(result.code, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /80 parser, 20 invalid, 8 LLVM/)
})

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', code => resolve({
      code: code ?? 1,
      stdout,
      stderr
    }))
  })
}
