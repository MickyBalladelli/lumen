import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('bootstrap compiler uses a typed module graph', async () => {
  const [modules, main] = await Promise.all([
    readFile('compiler/modules.lm', 'utf8'),
    readFile('compiler/main.lm', 'utf8')
  ])

  assert.match(modules, /struct ModuleGraph \{/)
  assert.match(modules, /struct CompilerModule \{/)
  assert.match(modules, /struct CompilerImport \{/)
  assert.match(modules, /function loadModuleGraph\(path: string\): ModuleGraph/)
  assert.match(main, /let graph = loadModuleGraph\(input\)/)
  assert.doesNotMatch(modules, /function loadModuleSource\(/)
  assert.doesNotMatch(modules, /function moduleFindFrom\(/)
  assert.doesNotMatch(modules, /function moduleNextLine\(/)
})
