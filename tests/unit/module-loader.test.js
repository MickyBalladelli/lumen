import assert from 'node:assert/strict'
import { mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ModuleLoader } from '../../src/modules/ModuleLoader.js'

test('module loader resolves, parses, and caches a dependency graph', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-loader-'))
  const mainPath = join(root, 'main.lm')
  const libraryPath = join(root, 'library.lm')

  await writeFile(libraryPath, [
    'function value(): i32 {',
    '  return 7',
    '}'
  ].join('\n'))
  await writeFile(mainPath, [
    'import { value } from "./library.lm"',
    'function main(): i32 {',
    '  return value()',
    '}'
  ].join('\n'))

  const graph = await new ModuleLoader().load(mainPath)
  const canonicalMain = await realpath(mainPath)
  const canonicalLibrary = await realpath(libraryPath)

  assert.equal(graph.modules.length, 2)
  assert.equal(graph.entry.path, canonicalMain)
  assert.equal(graph.entry.imports[0].target.path, canonicalLibrary)
  assert.equal(
    graph.program.body.filter(node => node.kind === 'FunctionDeclaration').length,
    2
  )
})

test('module loader reports circular imports with the chain', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-loader-cycle-'))
  const firstPath = join(root, 'first.lm')
  const secondPath = join(root, 'second.lm')

  await writeFile(firstPath, [
    'import { second } from "./second.lm"',
    'function first(): i32 {',
    '  return 1',
    '}'
  ].join('\n'))
  await writeFile(secondPath, [
    'import { first } from "./first.lm"',
    'function second(): i32 {',
    '  return 2',
    '}'
  ].join('\n'))

  await assert.rejects(
    () => new ModuleLoader().load(firstPath),
    /Circular import: first\.lm -> second\.lm -> first\.lm/
  )
})
