import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FeatureParityMatrix,
  ParityDimensions
} from '../../src/parity/FeatureMatrix.js'
import { matrixSummary } from '../../src/parity/ParityRunner.js'

test('parity matrix covers documented bootstrap code generation', () => {
  const ids = new Set(FeatureParityMatrix.map(entry => entry.id))
  const required = [
    'functions-return',
    'variables-constants-println',
    'binary-if',
    'function-calls',
    'classic-for',
    'while',
    'loop-control',
    'structs',
    'arrays',
    'async-await',
    'enum-match',
    'switch',
    'try-catch',
    'modules'
  ]

  assert.ok(required.every(id => ids.has(id)))
  assert.equal(ids.size, FeatureParityMatrix.length)
  assert.ok(FeatureParityMatrix.every(entry => entry.complete === undefined))
})

test('parity completion is derived from all three checks', () => {
  assert.deepEqual(ParityDimensions, ['diagnostics', 'llvm', 'executable'])

  const summary = matrixSummary({
    rows: [{
      id: 'sample',
      complete: false,
      checks: {
        diagnostics: { pass: true },
        llvm: { pass: true },
        executable: { pass: false }
      }
    }]
  })

  assert.deepEqual(summary[0], {
    feature: 'sample',
    diagnostics: 'pass',
    llvm: 'pass',
    executable: 'fail',
    complete: 'fail'
  })
})
