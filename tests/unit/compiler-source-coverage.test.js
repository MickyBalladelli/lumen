import assert from 'node:assert/strict'
import test from 'node:test'
import { Compiler } from '../../src/compiler/Compiler.js'
import {
  analyzeCompilerSourceCoverage,
  formatCompilerSourceCoverage
} from '../../src/testing/CompilerSourceCoverage.js'

test('compiler source coverage inventories the complete self-host closure', async () => {
  const compilation = await new Compiler().compileFile('compiler/main.lm')
  const report = analyzeCompilerSourceCoverage(compilation)

  assert.equal(report.entry, 'compiler/main.lm')
  assert.equal(report.inventory.modules.length, 11)
  assert.ok(report.inventory.syntaxNodes.includes('ImportDeclaration'))
  assert.ok(report.inventory.syntaxNodes.includes('WhileStatement'))
  assert.ok(report.inventory.typeNames.includes('Result<string>'))
  assert.ok(report.inventory.irOperations.includes('value:call'))
  assert.ok(!report.inventory.builtins.includes('compilerImage'))
  assert.ok(report.inventory.moduleFeatures.includes('shared-dependency'))
  assert.equal(report.ready, true)
  assert.equal(report.fixturePaths.length, 0)
  assert.doesNotMatch(formatCompilerSourceCoverage(report), /fixture-specific paths:/)
})

test('compiler source coverage has no unsupported or fixture features', async () => {
  const compilation = await new Compiler().compileFile('compiler/main.lm')
  const report = analyzeCompilerSourceCoverage(compilation)

  assert.deepEqual(report.gaps, [])
})
