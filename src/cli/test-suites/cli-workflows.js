import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Compiler } from '../../compiler/Compiler.js'
import { TestSuite } from '../../testing/TestSuite.js'
import {
  runCommand,
  runExecutable
} from '../../testing/TestProcess.js'

const examplesDir = 'examples'
const outputDir = 'build'
const compiler = new Compiler()
const suite = new TestSuite('CLI workflow')
const testEnvironment = {
  LUMEN_DOTENV_PATH: join(examplesDir, '.env.test'),
  LUMEN_TEST_ENV: 'from-env'
}

await suite.test('lmsh executable runner', async () => {
  const result = await runCommand(process.execPath, [
    join('src', 'cli', 'lmsh.js'),
    join(examplesDir, 'cli-args.lm'),
    'first',
    'second'
  ], testEnvironment)

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '1\n3\n')
})

await suite.test('lumen run workflow', async () => {
  const result = await runCommand(process.execPath, [
    join('src', 'cli', 'lumen.js'),
    'run',
    join(examplesDir, 'basic.lm'),
    '-o',
    join(outputDir, 'lumen-command-basic-run')
  ], testEnvironment)

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '7\n')
})

await suite.test('lumen emit workflow', async () => {
  const outputPath = join(outputDir, 'lumen-command-basic.ll')
  const result = await runCommand(process.execPath, [
    join('src', 'cli', 'lumen.js'),
    'emit',
    join(examplesDir, 'basic.lm'),
    '-o',
    outputPath
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.match(await readFile(outputPath, 'utf8'), /define i32 @main/)
})

await suite.test('compiler paths are argv-safe', async () => {
  const directory = join(outputDir, 'path with spaces;$(not-run)')
  const sourcePath = join(directory, "basic source 'quoted'.lm")
  const llvmPath = join(directory, 'basic output;safe.ll')
  const executablePath = join(directory, 'basic app;safe')
  await mkdir(directory, { recursive: true })
  await writeFile(sourcePath, await readFile(join(examplesDir, 'basic.lm'), 'utf8'))
  await compiler.writeLLVMFile(sourcePath, llvmPath)
  await compiler.buildExecutable(llvmPath, executablePath)

  const result = await runExecutable(executablePath)
  assert.equal(result.code, 3)
  assert.equal(result.stdout, 'hello\n3\n')
})

suite.finish()
