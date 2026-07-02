import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('lumen CLI prints a concise unknown-command error', () => {
  const result = runCLI(['cook'])

  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'Unknown command "cook"\n')
})

test('lumen CLI reports missing project input without a stack trace', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lumen-cli-error-'))
  const result = runCLI(['build'], cwd)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /^No input file and no config at /)
  assert.doesNotMatch(result.stderr, /\n\s+at /)
})

function runCLI(args, cwd = process.cwd()) {
  return spawnSync(process.execPath, [
    new URL('../../src/cli/lumen.js', import.meta.url).pathname,
    ...args
  ], {
    cwd,
    encoding: 'utf8'
  })
}
