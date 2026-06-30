import assert from 'node:assert/strict'
import test from 'node:test'
import { LLVMEmitter } from '../../src/backend/LLVMEmitter.js'
import { Compiler } from '../../src/compiler/Compiler.js'
import {
  IRBasicBlock,
  IRFunction,
  IRModule,
  IRTerminator,
  IRValue
} from '../../src/ir/IR.js'
import { IRValidator } from '../../src/ir/IRValidator.js'

test('IR contains typed values and basic blocks, not AST statements', () => {
  const { ir } = new Compiler().compileSource([
    'function main(): i32 {',
    '  let total: i32 = 0',
    '  for (let i: i32 = 0; i < 4; i++) {',
    '    if i == 2 {',
    '      continue',
    '    }',
    '    total = total + i',
    '  }',
    '  return total',
    '}'
  ].join('\n'))

  const func = ir.functions[0]
  const entry = func.blocks[0]
  const loop = entry.instructions.find(instruction => instruction.op === 'for')
  const branch = loop.body.instructions.find(instruction => instruction.op === 'if')

  assert.equal(func.body, undefined)
  assert.equal(entry.kind, 'IRBasicBlock')
  assert.equal(loop.kind, 'IRInstruction')
  assert.equal(loop.test.kind, 'IRValue')
  assert.equal(loop.test.type, 'bool')
  assert.equal(loop.test.left.type, 'i32')
  assert.equal(loop.test.right.type, 'i32')
  assert.equal(loop.body.kind, 'IRBasicBlock')
  assert.equal(branch.consequent.terminator.op, 'continue')
  assert.doesNotMatch(JSON.stringify(ir), /RawExpression|Statement|Declaration|Expression"|"tokens"/)
})

test('backend emits from IR after AST is discarded', () => {
  const result = new Compiler().compileSource([
    'function main(): i32 {',
    '  return 4 + 3',
    '}'
  ].join('\n'))

  result.ast = null
  const llvm = new LLVMEmitter().emit(result.ir)

  assert.match(llvm, /add i32 4, 3/)
  assert.throws(
    () => new LLVMEmitter().emit({ kind: 'Program', body: [] }),
    /expects validated IRModule/
  )
})

test('builtin lowering reads typed IR arguments without token metadata', () => {
  const { ir, llvm } = new Compiler().compileSource([
    'function main(): i32 {',
    '  let numbers: i32[] = [1, 2, 3]',
    '  println(len(numbers))',
    '  return arraySum(numbers)',
    '}'
  ].join('\n'))

  assert.doesNotMatch(JSON.stringify(ir), /"tokens"/)
  assert.match(llvm, /ret i32/)
})

test('filter predicate is typed in its local scope', () => {
  const { ir } = new Compiler().compileSource([
    'function main(): i32 {',
    '  let numbers: i32[] = [1, 2, 3]',
    '  for (let number of filter(numbers, item => item > 1)) {',
    '    println(number)',
    '  }',
    '  return 0',
    '}'
  ].join('\n'))
  const loop = ir.functions[0].blocks[0].instructions.find(instruction => instruction.op === 'forOf')
  const predicate = loop.iterable.arguments[1]

  assert.equal(predicate.params[0].type, 'i32')
  assert.equal(predicate.body.type, 'bool')
  assert.equal(predicate.body.left.type, 'i32')
})

test('IR validator rejects invalid operations and return types', () => {
  const invalidOperation = new IRModule([
    new IRFunction('main', [], 'i32', [
      new IRBasicBlock('entry', [], new IRTerminator('jump'))
    ])
  ])
  const invalidReturn = new IRModule([
    new IRFunction('main', [], 'i32', [
      new IRBasicBlock(
        'entry',
        [],
        new IRTerminator('return', {
          value: new IRValue('constant', 'string', {
            value: 'no',
            lexeme: '"no"',
            tokenType: 'String'
          })
        })
      )
    ])
  ])

  assert.throws(() => new IRValidator().validate(invalidOperation), /Invalid terminator/)
  assert.throws(() => new IRValidator().validate(invalidReturn), /Cannot return IR value string as i32/)
})
