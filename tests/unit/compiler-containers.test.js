import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Compiler } from '../../src/compiler/Compiler.js'
import { builtinSignature } from '../../src/runtime/BuiltinRegistry.js'

test('self-host compiler closure contains typed growable arenas', async () => {
  const compilation = await new Compiler().compileFile('compiler/main.lm')
  const module = compilation.moduleGraph.modules.find(item => {
    return item.path.endsWith('/compiler/containers.lm')
  })

  assert.ok(module)

  const structs = new Set(module.ast.body
    .filter(node => node.kind === 'StructDeclaration')
    .map(node => node.name.name.split('.').at(-1)))

  for (const name of [
    'TokenArena',
    'AstArena',
    'TypeArena',
    'SymbolArena',
    'IrValueArena',
    'IrBlockArena',
    'DiagnosticArena'
  ]) {
    assert.ok(structs.has(name), `missing ${name}`)
  }

  assert.match(compilation.llvm, /call ptr @lumen_arena_new\(\)/)
  assert.match(compilation.llvm, /call i32 @lumen_arena_append\(ptr /)
  assert.match(compilation.llvm, /call void @lumen_arena_set_string\(ptr /)
  assert.match(compilation.llvm, /call void @lumen_arena_set_i32\(ptr /)
})

test('arena builtins have typed mixed-value signatures', () => {
  assert.deepEqual(
    builtinSignature('arenaSetString').parameters,
    ['string', 'i32', 'i32', 'string']
  )
  assert.deepEqual(
    builtinSignature('arenaSetI32').parameters,
    ['string', 'i32', 'i32', 'i32']
  )
  assert.equal(builtinSignature('arenaGetString').returnType, 'string')
  assert.equal(builtinSignature('arenaGetI32').returnType, 'i32')
})

test('bootstrap tokenizer stores records as typed tokens', async () => {
  const source = await readFile('compiler/tokenizer.lm', 'utf8')

  assert.match(source, /function tokenizeFile\(source: string, file: string\): TokenArena/)
  assert.match(source, /CompilerToken \{/)
  assert.doesNotMatch(source, /listPush\(/)
  assert.doesNotMatch(source, /kind \+ ":" \+ value/)
})

test('struct values can be returned without string serialization', () => {
  const { llvm } = new Compiler().compileSource([
    'struct Pair {',
    '  left: i32',
    '  right: string',
    '}',
    'function pair(): Pair {',
    '  return Pair { left: 7, right: "value" }',
    '}',
    'function main(): i32 {',
    '  let value = pair()',
    '  return value.left',
    '}'
  ].join('\n'))

  assert.match(llvm, /insertvalue %Pair undef, i32 7, 0/)
  assert.match(llvm, /ret %Pair %t\d+/)
})
