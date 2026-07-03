import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { Compiler } from '../compiler/Compiler.js'
import { pass } from '../testing/TestReporter.js'

const compiler = new Compiler()
const outputRoot = await mkdtemp(join(tmpdir(), 'lumen-sanitizers-'))
const sanitizers = ['address', 'undefined']
const cases = [
  {
    name: 'safe memory',
    source: 'tests/runtime/safe-memory.lm',
    code: 0,
    stdout: 'safe\nhello lumen\nhello lumen\n'
  },
  {
    name: 'lossless compiler containers',
    source: 'tests/runtime/lossless-compiler-containers.lm',
    code: 0,
    stdout: 'lossless containers\n'
  },
  {
    name: 'bootstrap tokenizer',
    source: 'tests/runtime/bootstrap-tokenizer.lm',
    code: 0,
    stdout: 'bootstrap tokenizer\n'
  },
  {
    name: 'array bounds',
    source: 'tests/runtime/array-out-of-bounds.lm',
    code: 1,
    error: 'runtime error: index 3 out of bounds for length 3'
  },
  {
    name: 'array write bounds',
    source: 'tests/runtime/array-write-out-of-bounds.lm',
    code: 1,
    error: 'runtime error: index 3 out of bounds for length 3'
  },
  {
    name: 'string bounds',
    source: 'tests/runtime/string-out-of-bounds.lm',
    code: 1,
    error: 'runtime error: index 3 out of bounds for length 3'
  },
  {
    name: 'slice bounds',
    source: 'tests/runtime/slice-out-of-bounds.lm',
    code: 1,
    error: 'runtime error: slice 0..4 out of bounds for length 3'
  }
]

for (const testCase of cases) {
  const llvmPath = join(outputRoot, `${slug(testCase.name)}.ll`)
  const executablePath = join(outputRoot, slug(testCase.name))

  await compiler.writeLLVMFile(testCase.source, llvmPath)
  await compiler.buildExecutable(llvmPath, executablePath, {
    sanitizers
  })

  const result = await run(executablePath)
  assert.equal(result.code, testCase.code, result.stderr)
  assert.doesNotMatch(result.stderr, /AddressSanitizer|UndefinedBehaviorSanitizer/)
  assert.doesNotMatch(result.stderr, /runtime error:(?! (index|slice))/)

  if (testCase.stdout) assert.equal(result.stdout, testCase.stdout)
  if (testCase.error) assert.match(result.stderr, new RegExp(escapeRegExp(testCase.error)))

  console.log(pass(testCase.name))
}

console.log(pass(`${cases.length}/${cases.length} sanitizer tests passed`))

function run(path) {
  return new Promise((resolve, reject) => {
    const child = spawn(path, [], {
      env: {
        ...process.env,
        ASAN_OPTIONS: `detect_leaks=${process.platform === 'darwin' ? '0' : '1'}:halt_on_error=1`,
        UBSAN_OPTIONS: 'halt_on_error=1:print_stacktrace=1'
      }
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', code => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      })
    })
  })
}

function slug(value) {
  return value.replaceAll(' ', '-')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
