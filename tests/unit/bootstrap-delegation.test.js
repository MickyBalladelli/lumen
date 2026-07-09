import assert from 'node:assert/strict'
import test from 'node:test'
import { findBootstrapDelegation } from '../../src/testing/BootstrapDelegationGuard.js'

const shortcuts = [
  ['llvm', 'call ptr @lumen_compiler_image()', 'compiler image symbol'],
  ['llvm', '@compiler_image_bytes = constant', 'embedded compiler image'],
  ['llvm', 'call i32 @lumen_exec(ptr %node, ptr %args)', 'subprocess compiler'],
  ['binary', 'run JavaScript compiler', 'JavaScript compiler'],
  ['binary', 'node compiler.js', 'JavaScript compiler'],
  ['symbols', '_lumen_compiler_image', 'compiler image symbol'],
  ['source', 'return compilerImage()', 'compilerImage builtin'],
  ['source', 'exec("node", args)', 'Node compiler']
]

test('bootstrap delegation guard rejects every shortcut family', () => {
  for (const [kind, content, expected] of shortcuts) {
    assert.ok(
      findBootstrapDelegation(content, { kind, label: kind })
        .some(finding => finding.includes(expected)),
      `${kind} did not detect ${expected}`
    )
  }
})

test('bootstrap delegation guard permits normal runtime and debug references', () => {
  assert.deepEqual(
    findBootstrapDelegation('U _posix_spawnp\nT _lumen_exec', {
      kind: 'symbols',
      label: 'compiler'
    }),
    []
  )
  assert.deepEqual(
    findBootstrapDelegation(
      '!1 = !DIFile(filename: "main.lm", directory: "compiler", retainedNodes: !0)',
      { kind: 'llvm', label: 'compiler' }
    ),
    []
  )
})
