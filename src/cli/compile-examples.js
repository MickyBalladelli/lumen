import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Compiler } from '../compiler/Compiler.js'
import { RuntimeUnits } from '../runtime/RuntimeUnits.js'

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
  if (await isFresh(inputPath, executablePath)) {
    console.log(`${executablePath} cached`)
    continue
  }

  await compiler.writeLLVMFile(inputPath, llvmPath)
  await compiler.buildExecutable(llvmPath, executablePath)

  console.log(executablePath)
}

async function isFresh(inputPath, outputPath) {
  try {
    const input = await stat(inputPath)
    const output = await stat(outputPath)
    const runtimes = await Promise.all(
      RuntimeUnits.map(runtimeUnit => stat(runtimeUnit.source))
    )
    return output.mtimeMs >= input.mtimeMs &&
      runtimes.every(runtime => output.mtimeMs >= runtime.mtimeMs)
  } catch {
    return false
  }
}
