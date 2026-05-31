import { readdir, stat } from 'node:fs/promises'
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
    const runtime = await stat('src/runtime/http.c')
    return output.mtimeMs >= input.mtimeMs && output.mtimeMs >= runtime.mtimeMs
  } catch {
    return false
  }
}
