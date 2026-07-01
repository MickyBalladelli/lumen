import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  LumenCommandError,
  parseLumenArguments,
  resolveProject,
  runLumenCommand
} from '../../src/cli/LumenCommand.js'

test('lumen parses build, emit, and run workflows', () => {
  assert.deepEqual(
    parseLumenArguments(['build', 'main.lm', '-o', 'build/app', '--release']),
    {
      command: 'build',
      input: 'main.lm',
      output: 'build/app',
      config: 'lumen.json',
      configExplicit: false,
      clang: null,
      release: true,
      programArgs: []
    }
  )

  assert.deepEqual(
    parseLumenArguments(['run', 'main.lm', '--', 'first', '--flag']),
    {
      command: 'run',
      input: 'main.lm',
      output: null,
      config: 'lumen.json',
      configExplicit: false,
      clang: null,
      release: false,
      programArgs: ['first', '--flag']
    }
  )

  assert.deepEqual(parseLumenArguments([]), { help: true })
  assert.deepEqual(parseLumenArguments(['--version']), { version: true })
  assert.throws(
    () => parseLumenArguments(['cook', 'main.lm']),
    LumenCommandError
  )
  assert.throws(
    () => parseLumenArguments(['build', 'main.lm', '--output']),
    /--output needs a value/
  )
  assert.throws(
    () => parseLumenArguments(['emit', 'main.lm', '--', 'extra']),
    /emit does not accept program arguments/
  )
})

test('lumen build emits LLVM and links the requested output', async () => {
  const calls = []
  const output = []
  const compiler = fakeCompiler(calls)
  const options = parseLumenArguments([
    'build',
    'main.lm',
    '-o',
    'artifacts/app',
    '--clang',
    'custom-clang',
    '--release'
  ])

  const code = await runLumenCommand(options, {
    cwd: '/project',
    compiler,
    print: value => output.push(value)
  })

  assert.equal(code, 0)
  assert.deepEqual(calls, [
    ['emit', '/project/main.lm', '/project/artifacts/app.ll'],
    ['build', '/project/artifacts/app.ll', '/project/artifacts/app', {
      clang: 'custom-clang',
      optimize: true
    }]
  ])
  assert.deepEqual(output, ['/project/artifacts/app'])
})

test('lumen emit reads entry and output relative to config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-command-'))
  const configPath = join(root, 'lumen.json')
  await writeFile(configPath, JSON.stringify({
    entry: 'src/main.lm',
    output: 'dist/app'
  }))

  const options = parseLumenArguments(['emit', '--config', configPath])
  const resolved = await resolveProject(options, { cwd: root })

  assert.equal(resolved.input, join(root, 'src/main.lm'))
  assert.equal(resolved.output, join(root, 'dist/app.ll'))
})

test('lumen run forwards arguments and returns program status', async () => {
  const calls = []
  const executions = []
  const options = parseLumenArguments(['run', 'main.lm', '--', 'one', 'two'])

  const code = await runLumenCommand(options, {
    cwd: '/project',
    compiler: fakeCompiler(calls),
    execute: async (path, args) => {
      executions.push([path, args])
      return 7
    }
  })

  assert.equal(code, 7)
  assert.deepEqual(executions, [[
    '/project/build/main',
    ['one', 'two']
  ]])
})

test('lumen package exposes the command', async () => {
  const packageJson = JSON.parse(await readFile(
    new URL('../../package.json', import.meta.url),
    'utf8'
  ))

  assert.equal(packageJson.bin.lumen, './src/cli/lumen.js')
})

test('lumen reports invalid config', async () => {
  const options = parseLumenArguments(['build'])

  await assert.rejects(
    resolveProject(options, {
      cwd: '/project',
      loadFile: async () => '{broken'
    }),
    /Invalid JSON config/
  )
})

function fakeCompiler(calls) {
  return {
    async writeLLVMFile(input, output) {
      calls.push(['emit', input, output])
    },
    async buildExecutable(llvm, output, options) {
      calls.push(['build', llvm, output, options])
    }
  }
}
