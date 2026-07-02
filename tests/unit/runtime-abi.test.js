import assert from 'node:assert/strict'
import test from 'node:test'
import { emitRuntimeABI } from '../../src/backend/RuntimeABI.js'

test('runtime ABI emits only enabled declarations plus externs', () => {
  const declarations = emitRuntimeABI({
    usesPrintf: true,
    usesStrstr: false,
    usesStrcmp: false,
    usesFileIO: false,
    usesAssert: false,
    usesSlice: false,
    usesBounds: false,
    usesChannel: false,
    usesHttp: false,
    usesUuid: false,
    usesDate: false,
    usesEnv: false,
    usesCrypto: false,
    usesArgs: false,
    usesProcess: false,
    usesMaps: false,
    usesResults: false,
    usesOptions: false,
    usesStringRuntime: false,
    usesJsonRuntime: false,
    usesErrorRuntime: false,
    usesArrayRuntime: false,
    usesThread: false,
    usesTask: false,
    debug: false
  }, ['declare i64 @host_clock()'])

  assert.ok(declarations.includes('declare i32 @printf(ptr, ...)'))
  assert.ok(declarations.includes('declare i64 @host_clock()'))
  assert.equal(declarations.some(line => line.includes('@strstr')), false)
  assert.equal(declarations.some(line => line.includes('@llvm.dbg.declare')), false)
})
