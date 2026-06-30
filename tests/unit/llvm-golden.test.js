import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Compiler } from '../../src/compiler/Compiler.js'

const cases = [
  {
    name: 'values',
    source: [
      'function main(): i32 {',
      '  let value: i32 = 4 + 3',
      '  return value',
      '}'
    ]
  },
  {
    name: 'control-flow',
    source: [
      'function main(): i32 {',
      '  let value: i32 = 2',
      '  if value > 1 {',
      '    return value',
      '  }',
      '  return 0',
      '}'
    ]
  },
  {
    name: 'aggregates',
    source: [
      'struct Point {',
      '  x: i32',
      '  y: i32',
      '}',
      'function main(): i32 {',
      '  let point = Point { x: 4, y: 7 }',
      '  return point.x',
      '}'
    ]
  },
  {
    name: 'builtins',
    source: [
      'function main(): i32 {',
      '  println(7)',
      '  return 0',
      '}'
    ]
  },
  {
    name: 'runtime-abi',
    source: [
      'function main(): i32 {',
      '  println(uuid())',
      '  return 0',
      '}'
    ]
  },
  {
    name: 'debug',
    sourcePath: 'golden-debug.lm',
    source: [
      'function main(): i32 {',
      '  return 7',
      '}'
    ]
  }
]

for (const golden of cases) {
  test(`LLVM ${golden.name} lowering matches golden output`, async () => {
    const { llvm } = new Compiler().compileSource(golden.source.join('\n'), {
      sourcePath: golden.sourcePath ?? null
    })
    const expected = await readFile(
      new URL(`../golden/llvm/${golden.name}.ll`, import.meta.url),
      'utf8'
    )

    assert.equal(normalize(llvm), normalize(expected))
  })
}

function normalize(llvm) {
  return llvm
    .split('\n')
    .filter(line => line !== '')
    .join('\n')
}
