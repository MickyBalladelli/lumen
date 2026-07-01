import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  BuiltinSignatures,
  RuntimeSignatures,
  builtinSignature,
  functionNames,
  llvmDeclaration,
  validateBuiltinRegistry
} from '../../src/runtime/BuiltinRegistry.js'
import { ModuleRegistry } from '../../src/semantics/ModuleRegistry.js'

test('built-in consumers share the canonical registry', () => {
  const modules = new ModuleRegistry()

  for (const signature of BuiltinSignatures) {
    assert.equal(builtinSignature(signature.name), signature)
    assert.equal(modules.has(signature.module, signature.name), true)
  }

  assert.deepEqual(
    [...modules.modules.get('system')],
    functionNames('system')
  )
})

test('runtime ABI declarations come from typed signatures', () => {
  const mapGet = RuntimeSignatures.find(signature => signature.symbol === 'lumen_map_get')
  assert.equal(llvmDeclaration(mapGet), 'declare ptr @lumen_map_get(ptr, ptr)')
})

test('registry matches C runtime implementations', async () => {
  const sources = await Promise.all([
    'src/runtime/http.c',
    'src/runtime/http_runtime.c'
  ].map(path => readFile(path, 'utf8')))

  assert.deepEqual(validateBuiltinRegistry(sources), [])
})

test('registry validator reports ABI drift', async () => {
  const sources = await Promise.all([
    'src/runtime/http.c',
    'src/runtime/http_runtime.c'
  ].map(path => readFile(path, 'utf8')))
  sources[0] = sources[0].replace('_Bool lumen_map_has', 'int lumen_map_has')

  assert.ok(validateBuiltinRegistry(sources).includes(
    'lumen_map_has returns i32 in C, registry says i1'
  ))

  assert.ok(validateBuiltinRegistry(sources, [
    'call ptr @lumen_not_registered()'
  ]).includes(
    'Emitter uses unknown runtime symbol lumen_not_registered'
  ))
})
