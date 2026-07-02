import assert from 'node:assert/strict'
import test from 'node:test'
import { LLVMEmitter } from '../../src/backend/LLVMEmitter.js'
import {
  IRBasicBlock,
  IRFunction,
  IRModule,
  IRTerminator,
  IRValue
} from '../../src/ir/IR.js'

test('LLVM emitter lowers a direct IR module', () => {
  const module = new IRModule([
    new IRFunction('main', [], 'i32', [
      new IRBasicBlock('entry', [], new IRTerminator('return', {
        value: new IRValue('constant', 'i32', {
          value: 7,
          lexeme: '7',
          tokenType: 'Number'
        })
      }))
    ])
  ])

  const llvm = new LLVMEmitter().emit(module)

  assert.match(llvm, /define i32 @main\(\)/)
  assert.match(llvm, /ret i32 7/)
})

test('LLVM emitter rejects non-IR input at its boundary', () => {
  assert.throws(
    () => new LLVMEmitter().emit({ kind: 'Program', body: [] }),
    /expects validated IRModule/
  )
})
