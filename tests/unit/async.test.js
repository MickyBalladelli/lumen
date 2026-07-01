import assert from 'node:assert/strict'
import test from 'node:test'
import { Compiler } from '../../src/compiler/Compiler.js'

test('async calls return Task<T> and await unwraps the value', () => {
  const { ast, ir, llvm } = new Compiler().compileSource([
    'async function addOne(value: i32): i32 {',
    '  return value + 1',
    '}',
    'function main(): i32 {',
    '  let task: Task<i32> = addOne(3)',
    '  let answer = await task',
    '  return answer',
    '}'
  ].join('\n'))

  const task = ast.body[1].body.body[0].declarations[0]
  const answer = ast.body[1].body.body[1].declarations[0]

  assert.equal(task.inferredType, 'Task<i32>')
  assert.equal(answer.inferredType, 'i32')
  assert.equal(ir.functions[0].isAsync, true)
  assert.match(llvm, /define ptr @addOne\(i32 %value\)/)
  assert.match(llvm, /call ptr @lumen_task_start/)
  assert.match(llvm, /call ptr @lumen_task_await/)
})

test('await rejects normal values', () => {
  assert.throws(
    () => new Compiler().compileSource([
      'function main(): i32 {',
      '  let value = await 3',
      '  return value',
      '}'
    ].join('\n')),
    /await expects Task<T>, got i32/
  )
})

test('task cancellation error follows try catch control flow', () => {
  const { llvm } = new Compiler().compileSource([
    'async function work(): i32 {',
    '  if taskCancelled() {',
    '    return 0',
    '  }',
    '  return 1',
    '}',
    'function main(): i32 {',
    '  let task = work()',
    '  taskCancel(task)',
    '  try {',
    '    return await task',
    '  } catch error {',
    '    println(error)',
    '  }',
    '  return 0',
    '}'
  ].join('\n'))

  assert.match(llvm, /call i1 @lumen_task_cancel/)
  assert.match(llvm, /call i1 @lumen_task_cancelled/)
  assert.match(llvm, /await\.error/)
  assert.match(llvm, /br label %catch/)
})

test('uncaught async throws become await errors', () => {
  const { llvm } = new Compiler().compileSource([
    'async function fail(): i32 {',
    '  throw "boom"',
    '}',
    'function main(): i32 {',
    '  try {',
    '    return await fail()',
    '  } catch error {',
    '    println(error)',
    '  }',
    '  return 0',
    '}'
  ].join('\n'))

  assert.match(llvm, /call void @lumen_task_fail/)
  assert.match(llvm, /br label %catch/)
})

test('taskCancel needs a Task<T>', () => {
  assert.throws(
    () => new Compiler().compileSource([
      'function main(): i32 {',
      '  taskCancel(3)',
      '  return 0',
      '}'
    ].join('\n')),
    /Cannot pass i32 to Task<T>/
  )
})

test('main cannot be async', () => {
  assert.throws(
    () => new Compiler().compileSource([
      'async function main(): i32 {',
      '  return 0',
      '}'
    ].join('\n')),
    /main cannot be async/
  )
})
