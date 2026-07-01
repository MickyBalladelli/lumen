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
import {
  RuntimeUnits,
  runtimeUnitsForLLVM
} from '../../src/runtime/RuntimeUnits.js'
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
  const sources = await Promise.all(
    RuntimeUnits.map(runtimeUnit => readFile(runtimeUnit.source, 'utf8'))
  )

  assert.deepEqual(validateBuiltinRegistry(sources), [])
})

test('registry validator reports ABI drift', async () => {
  const sources = await Promise.all(
    RuntimeUnits.map(runtimeUnit => readFile(runtimeUnit.source, 'utf8'))
  )
  const collections = RuntimeUnits.findIndex(runtimeUnit => runtimeUnit.name === 'collections')
  sources[collections] = sources[collections].replace('_Bool lumen_map_has', 'int lumen_map_has')

  assert.ok(validateBuiltinRegistry(sources).includes(
    'lumen_map_has returns i32 in C, registry says i1'
  ))

  assert.ok(validateBuiltinRegistry(sources, [
    'call ptr @lumen_not_registered()'
  ]).includes(
    'Emitter uses unknown runtime symbol lumen_not_registered'
  ))
})

test('runtime linker selects only used units and their dependencies', () => {
  const ownedSymbols = RuntimeUnits.flatMap(runtimeUnit => runtimeUnit.symbols)
  const registeredSymbols = RuntimeSignatures
    .map(signature => signature.symbol)
    .filter(symbol => symbol.startsWith('lumen_'))

  assert.equal(new Set(ownedSymbols).size, ownedSymbols.length)
  assert.deepEqual(
    registeredSymbols.filter(symbol => !ownedSymbols.includes(symbol)),
    []
  )
  assert.deepEqual(
    runtimeUnitsForLLVM('call ptr @lumen_map_get(ptr %map, ptr %key)')
      .map(runtimeUnit => runtimeUnit.name),
    ['system', 'collections']
  )
  assert.deepEqual(
    runtimeUnitsForLLVM('call ptr @lumen_http_request(ptr %method, ptr %path, ptr %body)')
      .map(runtimeUnit => runtimeUnit.name),
    ['system', 'http']
  )
  assert.deepEqual(runtimeUnitsForLLVM('call i32 @printf(ptr %format)'), [])
})

test('fallible built-ins return typed results', () => {
  const expected = {
    readFile: 'Result<string>',
    writeFile: 'Result<i32>',
    env: 'Result<string>',
    encrypt: 'Result<string>',
    jsonGet: 'Result<string>',
    argCount: 'Result<i32>',
    exec: 'Result<i32>',
    createSemaphore: 'Result<semaphore>',
    startThread: 'Result<thread>',
    serveFiles: 'Result<i32>',
    httpRequest: 'Result<string>'
  }

  for (const [name, returnType] of Object.entries(expected)) {
    assert.equal(builtinSignature(name).returnType, returnType)
  }
})
