import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

test('type checker accepts linked imported struct types after module loading', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-imported-type-'))
  const sharedPath = join(root, 'shared.lm')
  const mainPath = join(root, 'main.lm')

  await writeFile(sharedPath, [
    'struct Shared {',
    '  value: i32',
    '}',
    'function makeShared(): Shared {',
    '  return Shared { value: 7 }',
    '}'
  ].join('\n'))
  await writeFile(mainPath, [
    'import { Shared, makeShared } from "./shared.lm"',
    'function main(): i32 {',
    '  let shared: Shared = makeShared()',
    '  return 0',
    '}'
  ].join('\n'))

  await assert.doesNotReject(() => new Compiler().compileFile(mainPath))
})

test('conditions must be boolean', () => {
  assert.throws(
    () => compile([
      'function main(): i32 {',
      '  if 1 {',
      '    return 1',
      '  }',
      '  return 0',
      '}'
    ].join('\n')),
    /if condition must be bool, got i32/
  )

  assert.throws(
    () => compile([
      'function main(): i32 {',
      '  while "yes" {',
      '    return 1',
      '  }',
      '  return 0',
      '}'
    ].join('\n')),
    /while condition must be bool, got string/
  )
})

test('non-void functions must return on every path', () => {
  assert.doesNotThrow(() => compile([
    'function choose(flag: bool): i32 {',
    '  if flag {',
    '    return 1',
    '  } else {',
    '    return 2',
    '  }',
    '}',
    'function main(): i32 {',
    '  return choose(true)',
    '}'
  ].join('\n')))

  assert.throws(
    () => compile([
      'function choose(flag: bool): i32 {',
      '  if flag {',
      '    return 1',
      '  }',
      '}',
      'function main(): i32 {',
      '  return 0',
      '}'
    ].join('\n')),
    /does not return on every path/
  )

  assert.throws(
    () => compile([
      'function choose(value: i32): i32 {',
      '  switch value {',
      '    case 1 {',
      '      break;',
      '      return 1',
      '    }',
      '    default {',
      '      return 2',
      '    }',
      '  }',
      '}',
      'function main(): i32 {',
      '  return choose(1)',
      '}'
    ].join('\n')),
    /does not return on every path/
  )
})

test('variables must be initialized before use on every path', () => {
  assert.throws(
    () => compile([
      'function main(): i32 {',
      '  let value: i32',
      '  return value',
      '}'
    ].join('\n')),
    /used before initialization/
  )

  assert.doesNotThrow(() => compile([
    'function choose(flag: bool): i32 {',
    '  let value: i32',
    '  if flag {',
    '    value = 1',
    '  } else {',
    '    value = 2',
    '  }',
    '  return value',
    '}',
    'function main(): i32 {',
    '  return choose(true)',
    '}'
  ].join('\n')))

  assert.throws(
    () => compile([
      'function choose(flag: bool): i32 {',
      '  let value: i32',
      '  if flag {',
      '    value = 1',
      '  }',
      '  return value',
      '}',
      'function main(): i32 {',
      '  return choose(true)',
      '}'
    ].join('\n')),
    /used before initialization/
  )
})

test('match validates coverage, ordering, patterns, and arm types', () => {
  assert.doesNotThrow(() => compile([
    'enum Status {',
    '  Ready',
    '  Done',
    '}',
    'function main(): i32 {',
    '  let status: Status = Ready',
    '  return match status {',
    '    Ready => 1',
    '    Done => 2',
    '  }',
    '}'
  ].join('\n')))

  assert.throws(
    () => compile([
      'enum Status {',
      '  Ready',
      '  Done',
      '}',
      'function main(): i32 {',
      '  let status: Status = Ready',
      '  return match status {',
      '    Ready => 1',
      '  }',
      '}'
    ].join('\n')),
    /Match is missing Done/
  )

  assert.throws(
    () => compile([
      'function main(): i32 {',
      '  return match true {',
      '    _ => 1',
      '    false => 2',
      '  }',
      '}'
    ].join('\n')),
    /wildcard must be last/
  )

  assert.throws(
    () => compile([
      'function main(): i32 {',
      '  return match true {',
      '    true => 1',
      '    false => "no"',
      '  }',
      '}'
    ].join('\n')),
    /Match arms return i32 and string/
  )
})

test('type system defines nullable and generic variance', () => {
  const types = new TypeSystem()

  assert.equal(types.canAssign('i32', 'i32?'), true)
  assert.equal(types.canAssign('i32?', 'i32'), false)
  assert.equal(types.canAssign('i32?', 'i64?'), true)
  assert.equal(types.canAssign('Result<i32>', 'Result<i64>'), true)
  assert.equal(types.canAssign('Result<i32>', 'Result<string>'), false)
  assert.equal(types.canAssign('Map<i32,string>', 'Map<i64,string>'), false)
  assert.equal(types.canAssign('i32[]', 'i64[]'), false)
  assert.equal(types.canAssign('Result<i32>', 'string'), false)
  assert.equal(types.assertKnown('Other<i32>'), false)
  assert.equal(types.assertKnown('Result<i32,string>'), false)
})

test('collections validate element and lookup types', () => {
  assert.doesNotThrow(() => compile('let values: i64[] = [1, 2]'))

  assert.throws(
    () => compile('let values = [1, "two"]'),
    /Array elements have types i32 and string/
  )

  assert.throws(
    () => compile([
      'function main(): i32 {',
      '  let values: i32[] = [1, 2]',
      '  if includes(values, "two") {',
      '    return 1',
      '  }',
      '  return 0',
      '}'
    ].join('\n')),
    /Cannot search i32\[\] for string/
  )
})

test('nullable generic types and first assignment are checked', () => {
  assert.doesNotThrow(() => compile([
    'function main(): i32 {',
    '  let result: Result<i32>? = some(ok(1))',
    '  let value',
    '  value = 2',
    '  if hasValue(result) {',
    '    return value',
    '  }',
    '  return 0',
    '}'
  ].join('\n')))
})
