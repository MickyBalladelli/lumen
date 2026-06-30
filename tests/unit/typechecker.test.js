import assert from 'node:assert/strict'
import test from 'node:test'
import { Compiler } from '../../src/compiler/Compiler.js'
import { LumenTypes, TypeSystem } from '../../src/semantics/TypeSystem.js'

function compile(source) {
  return new Compiler().compileSource(source)
}

test('type checker accepts empty array literal with annotated array type', () => {
  const result = compile('let numbers: i32[] = []')
  const declaration = result.ast.body[0].declarations[0]

  assert.equal(declaration.inferredType, 'i32[]')
  assert.equal(declaration.arrayLength, 0)
})

test('type checker rejects array literal assigned to scalar', () => {
  assert.throws(
    () => compile('let number: i32 = []'),
    /Cannot assign unknown\[\] to i32|Array literal needs array type/
  )
})

test('type system lets empty unknown array flow into typed array', () => {
  assert.equal(new TypeSystem().canAssign(`${LumenTypes.Unknown}[]`, 'string[]'), true)
})

test('compiler does not leak types between compilations', () => {
  const compiler = new Compiler()

  compiler.compileSource([
    'struct Ghost {',
    '  value: i32',
    '}',
    'function main(): i32 {',
    '  return 0',
    '}'
  ].join('\n'))

  assert.throws(
    () => compiler.compileSource([
      'function main(): i32 {',
      '  let ghost: Ghost',
      '  return 0',
      '}'
    ].join('\n')),
    /Unknown type "Ghost"/
  )

  assert.doesNotThrow(() => compiler.compileSource([
    'struct Person {',
    '  age: i32',
    '}',
    'function main(): i32 {',
    '  let person = Person { age: 4 }',
    '  return person.age',
    '}'
  ].join('\n')))
})

test('failed compilation does not poison later compilations', () => {
  const compiler = new Compiler()

  assert.throws(
    () => compiler.compileSource([
      'struct FailedType {',
      '  value: i32',
      '}',
      'function main(): i32 {',
      '  return missing',
      '}'
    ].join('\n')),
    /Unknown symbol "missing"/
  )

  assert.throws(
    () => compiler.compileSource([
      'function main(): i32 {',
      '  let value: FailedType',
      '  return 0',
      '}'
    ].join('\n')),
    /Unknown type "FailedType"/
  )
})
