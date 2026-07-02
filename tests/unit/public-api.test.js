import assert from 'node:assert/strict'
import test from 'node:test'
import * as lumen from '../../src/index.js'

test('public API omits the removed compiler options placeholder', () => {
  assert.equal(lumen.CompilerOptions, undefined)
  assert.equal(typeof lumen.Compiler, 'function')
})
