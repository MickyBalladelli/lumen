import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Compiler } from '../../src/compiler/Compiler.js'
import {
  Diagnostic,
  DiagnosticCollection
} from '../../src/diagnostics/Diagnostic.js'

test('diagnostics render ranges, snippets, and notes', () => {
  const diagnostic = new Diagnostic('bad value', {
    sourcePath: '/tmp/main.lm',
    line: 1,
    column: 5,
    endLine: 1,
    endColumn: 10
  }, 'type')
    .addNote('declared here', {
      sourcePath: '/tmp/library.lm',
      line: 2,
      column: 3,
      endLine: 2,
      endColumn: 7
    }, 'x\n  name')
    .withSource('let wrong')

  assert.match(diagnostic.message, /let wrong\n {4}\^{5}/)
  assert.match(diagnostic.message, /note: declared here at \/tmp\/library\.lm:2:3/)
  assert.match(diagnostic.message, /  name\n {2}\^{4}/)
})

test('compiler reports independent type errors together', () => {
  const source = [
    'function first(): i32 {',
    '  return "one"',
    '}',
    'function second(): bool {',
    '  return 2',
    '}'
  ].join('\n')

  assert.throws(
    () => new Compiler().compileSource(source, { sourcePath: '/tmp/many.lm' }),
    error => {
      assert.ok(error instanceof DiagnosticCollection)
      assert.equal(error.diagnostics.length, 2)
      assert.match(error.message, /Return type string does not match i32/)
      assert.match(error.message, /Return type i32 does not match bool/)
      assert.ok(error.diagnostics.every(item => item.location.sourcePath === '/tmp/many.lm'))
      assert.ok(error.diagnostics.every(item => item.location.endColumn > item.location.column))
      return true
    }
  )
})

test('parser recovers at the next top-level declaration', () => {
  const source = [
    'function first(): i32 {',
    '  let value: = 1',
    '  return 0',
    '}',
    'function second(): i32 {',
    '  let value: = 2',
    '  return 0',
    '}'
  ].join('\n')

  assert.throws(
    () => new Compiler().compileSource(source, { sourcePath: '/tmp/parse-many.lm' }),
    error => {
      assert.ok(error instanceof DiagnosticCollection)
      assert.equal(error.diagnostics.length, 2)
      assert.ok(error.diagnostics.every(item => item.phase === 'parser'))
      return true
    }
  )
})

test('IR keeps source ranges', () => {
  const result = new Compiler().compileSource([
    'function main(): i32 {',
    '  return 42',
    '}'
  ].join('\n'), {
    sourcePath: '/tmp/ranges.lm'
  })
  const value = result.ir.functions[0].blocks[0].terminator.value

  assert.equal(value.location.sourcePath, '/tmp/ranges.lm')
  assert.equal(value.location.line, 2)
  assert.ok(value.location.endColumn > value.location.column)
})

test('module diagnostics collect errors with imported-file notes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-diagnostics-'))
  const libraryPath = join(root, 'library.lm')
  const mainPath = join(root, 'main.lm')

  await writeFile(libraryPath, [
    'function shown(): i32 {',
    '  return 1',
    '}'
  ].join('\n'))
  await writeFile(mainPath, [
    'import { missing, absent } from "./library.lm"',
    'function main(): i32 {',
    '  return 0',
    '}'
  ].join('\n'))

  await assert.rejects(
    () => new Compiler().writeLLVMFile(mainPath, join(root, 'main.ll')),
    error => {
      assert.ok(error instanceof DiagnosticCollection)
      assert.equal(error.diagnostics.length, 2)
      assert.ok(error.diagnostics.every(item => item.notes[0].location.sourcePath.endsWith('/library.lm')))
      assert.match(error.message, /note: Import target is here/)
      return true
    }
  )
})

test('LLVM debug metadata names imported source files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-debug-files-'))
  const libraryPath = join(root, 'library.lm')
  const mainPath = join(root, 'main.lm')

  await writeFile(libraryPath, [
    'function answer(): i32 {',
    '  return 42',
    '}'
  ].join('\n'))
  await writeFile(mainPath, [
    'import { answer } from "./library.lm"',
    'function main(): i32 {',
    '  return answer()',
    '}'
  ].join('\n'))

  const result = await new Compiler().writeLLVMFile(mainPath, join(root, 'main.ll'))
  assert.match(result.llvm, /!DIFile\(filename: "main\.lm"/)
  assert.match(result.llvm, /!DIFile\(filename: "library\.lm"/)
})
