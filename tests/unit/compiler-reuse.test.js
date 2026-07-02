import assert from 'node:assert/strict'
import test from 'node:test'
import { Compiler } from '../../src/compiler/Compiler.js'

test('one compiler instance supports success, failure, then success', () => {
  const compiler = new Compiler()
  const first = compiler.compileSource([
    'struct First {',
    '  value: i32',
    '}',
    'function main(): i32 {',
    '  let first = First { value: 1 }',
    '  return first.value',
    '}'
  ].join('\n'))

  assert.match(first.llvm, /%First = type/)
  assert.throws(
    () => compiler.compileSource('function main(): i32 {\n  return missing\n}'),
    /Unknown symbol "missing"/
  )

  const last = compiler.compileSource([
    'struct Last {',
    '  value: i32',
    '}',
    'function main(): i32 {',
    '  let last = Last { value: 2 }',
    '  return last.value',
    '}'
  ].join('\n'))

  assert.match(last.llvm, /%Last = type/)
  assert.doesNotMatch(last.llvm, /%First = type/)
})
