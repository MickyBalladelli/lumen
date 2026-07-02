import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  CompilerSupportMatrix,
  ExperimentalPackageSupport,
  PlatformSupportMatrix
} from '../../src/support/SupportMatrix.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('support matrix has unique compiler and platform rows', () => {
  const rows = [...CompilerSupportMatrix, ...PlatformSupportMatrix]
  const ids = rows.map(row => row.id)

  assert.equal(new Set(ids).size, ids.length)
})

test('incomplete capability packages stay experimental', () => {
  assert.deepEqual(
    Object.keys(ExperimentalPackageSupport).sort(),
    ['auth', 'http-client', 'jwt-lite', 'url']
  )
  assert.ok(Object.values(ExperimentalPackageSupport).every(entry => {
    return entry.status === 'experimental'
  }))
})

test('generated support matrix is current', () => {
  const result = spawnSync(process.execPath, [
    'scripts/generate-support-matrix.mjs',
    '--check'
  ], {
    cwd: root,
    encoding: 'utf8'
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
})
