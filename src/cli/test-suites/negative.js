import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Compiler } from '../../compiler/Compiler.js'
import { TestSuite } from '../../testing/TestSuite.js'

const directory = join('tests', 'negative')
const compiler = new Compiler()
const suite = new TestSuite('negative')
const files = (await readdir(directory))
  .filter(file => file.endsWith('.lm'))
  .sort()

for (const file of files) {
  await suite.test(file, async () => {
    const source = await readFile(join(directory, file), 'utf8')
    assert.throws(() => compiler.compileSource(source))
  })
}

suite.finish()
