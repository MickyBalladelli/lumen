import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Compiler } from '../compiler/Compiler.js'

const examplesDir = 'examples'
const outputDir = 'build'
const compiler = new Compiler()
const files = (await readdir(examplesDir))
  .filter(file => file.endsWith('.lm'))
  .sort()

for (const file of files) {
  const inputPath = join(examplesDir, file)
  const name = basename(file, '.lm')
  const llvmPath = join(outputDir, `${name}.ll`)
  const executablePath = join(outputDir, name)
  const source = await readFile(inputPath, 'utf8')

  await compiler.writeLLVM(source, llvmPath)
  await compiler.buildExecutable(llvmPath, executablePath)

  console.log(executablePath)
}
