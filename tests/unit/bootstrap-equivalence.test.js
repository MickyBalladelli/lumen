import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalizeBootstrapLLVM } from '../../src/testing/BootstrapEquivalence.js'

test('bootstrap LLVM comparison ignores harmless metadata differences', () => {
  const stageTwo = [
    '; ModuleID = "stage-two.ll"',
    'source_filename = "compiler/main.lm"',
    'declare void @llvm.dbg.declare(metadata, metadata, metadata)',
    'define i32 @main() !dbg !7 {',
    'entry:',
    '  call void @llvm.dbg.declare(metadata ptr %value, metadata !8, metadata !6), !dbg !9',
    '  ret i32 0, !dbg !10',
    '}',
    '!llvm.ident = !{!1}',
    '!1 = !{!"stage two"}'
  ].join('\n')
  const stageThree = [
    '; ModuleID = "stage-three.ll"',
    'source_filename = "different/path/main.lm"',
    'declare void @llvm.dbg.declare(metadata, metadata, metadata)',
    '',
    'define i32 @main() !dbg !42 {',
    'entry:',
    '  call void @llvm.dbg.declare(metadata ptr %value, metadata !43, metadata !6), !dbg !44',
    '  ret i32 0, !dbg !45',
    '}',
    '!llvm.ident = !{!2}',
    '!2 = !{!"stage three"}'
  ].join('\r\n')

  assert.equal(
    canonicalizeBootstrapLLVM(stageTwo),
    canonicalizeBootstrapLLVM(stageThree)
  )
})

test('bootstrap LLVM comparison preserves meaningful code differences', () => {
  const stageTwo = 'define i32 @main() {\n  ret i32 0\n}\n'
  const stageThree = 'define i32 @main() {\n  ret i32 1\n}\n'

  assert.notEqual(
    canonicalizeBootstrapLLVM(stageTwo),
    canonicalizeBootstrapLLVM(stageThree)
  )
})
