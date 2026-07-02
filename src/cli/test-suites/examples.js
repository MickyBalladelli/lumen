import assert from 'node:assert/strict'
import { readdir, readFile, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Compiler } from '../../compiler/Compiler.js'
import { TestSuite } from '../../testing/TestSuite.js'
import { runExecutable } from '../../testing/TestProcess.js'
import {
  compileOnlyExamples,
  exampleExpectations
} from './ExampleExpectations.js'

const examplesDir = 'examples'
const outputDir = 'build'
const compiler = new Compiler()
const suite = new TestSuite('example')
const dataText = await readFile(join(examplesDir, 'data.txt'), 'utf8')
const expectations = exampleExpectations(dataText)
const files = (await readdir(examplesDir))
  .filter(file => file.endsWith('.lm'))
  .sort()

for (const file of files) {
  const name = basename(file, '.lm')

  await suite.test(name, async () => {
    const inputPath = join(examplesDir, file)
    const llvmPath = join(outputDir, `${name}.ll`)
    const executablePath = join(outputDir, name)
    await compiler.writeLLVMFile(inputPath, llvmPath)
    await compiler.buildExecutable(llvmPath, executablePath)

    if (name === 'thread') {
      await unlink(join(outputDir, 'thread-output.txt')).catch(error => {
        if (error.code !== 'ENOENT') throw error
      })
    }

    if (compileOnlyExamples.has(name)) return

    const expected = expectations.get(name)
    assert.ok(expected, `missing expectation for ${name}`)

    const args = name === 'cli-args' ? ['first', 'second'] : []
    const result = await runExecutable(executablePath, args, {
      LUMEN_DOTENV_PATH: join(examplesDir, '.env.test'),
      LUMEN_TEST_ENV: 'from-env'
    })

    assert.equal(result.code, expected[1])
    assert.equal(result.stdout, expected[0])
  })
}

suite.finish()
