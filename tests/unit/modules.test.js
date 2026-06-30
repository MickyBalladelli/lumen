import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Compiler } from '../../src/compiler/Compiler.js'
import { ModuleLoader } from '../../src/modules/ModuleLoader.js'

test('module graph links imported symbol and its private helper', async () => {
  const root = await projectDirectory()
  const libraryPath = join(root, 'library.lm')
  const mainPath = join(root, 'main.lm')
  const llvmPath = join(root, 'main.ll')

  await writeFile(libraryPath, [
    'function helper(value: i32): i32 {',
    '  return value * 2',
    '}',
    'function shown(value: i32): i32 {',
    '  return helper(value)',
    '}',
    'function hidden(): i32 {',
    '  return 99',
    '}'
  ].join('\n'))
  await writeFile(mainPath, [
    'import { shown } from "./library.lm"',
    'function main(): i32 {',
    '  return shown(4)',
    '}'
  ].join('\n'))

  await new Compiler().writeLLVMFile(mainPath, llvmPath)
  const llvm = await readFile(llvmPath, 'utf8')

  assert.match(llvm, /call i32 @__lumen\.module\.1\.shown\(i32 4\)/)
  assert.match(llvm, /call i32 @__lumen\.module\.1\.helper\(i32 %t\d+\)/)
  assert.match(llvm, /define i32 @__lumen\.module\.1\.hidden\(\)/)
})

test('module graph does not expose an unimported symbol', async () => {
  const root = await projectDirectory()
  const mainPath = join(root, 'main.lm')

  await writeFile(join(root, 'library.lm'), [
    'function shown(): i32 {',
    '  return 1',
    '}',
    'function hidden(): i32 {',
    '  return 2',
    '}'
  ].join('\n'))
  await writeFile(mainPath, [
    'import { shown } from "./library.lm"',
    'function main(): i32 {',
    '  return hidden()',
    '}'
  ].join('\n'))

  await assert.rejects(
    () => new Compiler().writeLLVMFile(mainPath, join(root, 'main.ll')),
    /Unknown symbol "hidden"/
  )
})

test('module graph loads a diamond dependency once', async () => {
  const root = await projectDirectory()
  const mainPath = join(root, 'main.lm')
  const llvmPath = join(root, 'main.ll')

  await writeFile(join(root, 'shared.lm'), [
    'function shared(): i32 {',
    '  return 1',
    '}'
  ].join('\n'))
  await writeFile(join(root, 'left.lm'), [
    'import { shared } from "./shared.lm"',
    'function left(): i32 {',
    '  return shared()',
    '}'
  ].join('\n'))
  await writeFile(join(root, 'right.lm'), [
    'import { shared } from "./shared.lm"',
    'function right(): i32 {',
    '  return shared()',
    '}'
  ].join('\n'))
  await writeFile(mainPath, [
    'import { left } from "./left.lm"',
    'import { right } from "./right.lm"',
    'function main(): i32 {',
    '  let leftValue = left()',
    '  let rightValue = right()',
    '  return leftValue + rightValue',
    '}'
  ].join('\n'))

  const graph = await new ModuleLoader().load(mainPath)
  const sharedModules = graph.modules.filter(module => module.path.endsWith('/shared.lm'))

  assert.equal(graph.modules.length, 4)
  assert.equal(sharedModules.length, 1)

  await new Compiler().writeLLVMFile(mainPath, llvmPath)
  const llvm = await readFile(llvmPath, 'utf8')
  assert.equal(llvm.match(/define i32 @__lumen\.module\.\d+\.shared\(\)/g)?.length, 1)
})

test('module graph rejects circular imports', async () => {
  const root = await projectDirectory()

  await writeFile(join(root, 'a.lm'), [
    'import { fromB } from "./b.lm"',
    'function fromA(): i32 {',
    '  return fromB()',
    '}'
  ].join('\n'))
  await writeFile(join(root, 'b.lm'), [
    'import { fromA } from "./a.lm"',
    'function fromB(): i32 {',
    '  return fromA()',
    '}'
  ].join('\n'))

  await assert.rejects(
    () => new ModuleLoader().load(join(root, 'a.lm')),
    /Circular import: a\.lm -> b\.lm -> a\.lm/
  )
})

test('module diagnostics keep imported file path and source', async () => {
  const root = await projectDirectory()
  const libraryPath = join(root, 'library.lm')
  const mainPath = join(root, 'main.lm')

  await writeFile(libraryPath, [
    'function shown(): i32 {',
    '  return missing',
    '}'
  ].join('\n'))
  await writeFile(mainPath, [
    'import { shown } from "./library.lm"',
    'function main(): i32 {',
    '  return shown()',
    '}'
  ].join('\n'))

  await assert.rejects(
    () => new Compiler().writeLLVMFile(mainPath, join(root, 'main.ll')),
    error => {
      assert.match(error.location.sourcePath, /library\.lm$/)
      assert.match(error.message, /library\.lm:2:/)
      assert.match(error.message, /return missing\n\s+\^/)
      return true
    }
  )
})

test('Photon imports obey manifest exports', async () => {
  const root = await projectDirectory()
  const packageRoot = join(root, '.photon', 'packages')
  const packagePath = join(packageRoot, 'demo')
  const mainPath = join(root, 'main.lm')
  await mkdir(packagePath, { recursive: true })

  await writeFile(join(packagePath, 'photon.json'), JSON.stringify({
    name: 'demo',
    main: 'main.lm',
    exports: ['shown']
  }))
  await writeFile(join(packagePath, 'main.lm'), [
    'function shown(): i32 {',
    '  return 1',
    '}',
    'function hidden(): i32 {',
    '  return 2',
    '}'
  ].join('\n'))
  await writeFile(mainPath, [
    'import { hidden } from "demo"',
    'function main(): i32 {',
    '  return hidden()',
    '}'
  ].join('\n'))

  const compiler = new Compiler({
    moduleLoaderFactory: options => new ModuleLoader({
      ...options,
      packageRoot
    })
  })

  await assert.rejects(
    () => compiler.writeLLVMFile(mainPath, join(root, 'main.ll')),
    /Module "demo" has no export "hidden"/
  )
})

test('module graph links imported struct types', async () => {
  const root = await projectDirectory()
  const mainPath = join(root, 'main.lm')
  const llvmPath = join(root, 'main.ll')

  await writeFile(join(root, 'models.lm'), [
    'struct Person {',
    '  age: i32',
    '}'
  ].join('\n'))
  await writeFile(mainPath, [
    'import { Person } from "./models.lm"',
    'function main(): i32 {',
    '  let person: Person = Person { age: 4 }',
    '  return person.age',
    '}'
  ].join('\n'))

  await new Compiler().writeLLVMFile(mainPath, llvmPath)
  const llvm = await readFile(llvmPath, 'utf8')

  assert.match(llvm, /%__lumen\.module\.1\.Person = type/)
  assert.match(llvm, /alloca %__lumen\.module\.1\.Person/)
})

async function projectDirectory() {
  return mkdtemp(join(tmpdir(), 'lumen-modules-'))
}
