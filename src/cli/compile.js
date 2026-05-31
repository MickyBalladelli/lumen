import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Compiler } from '../compiler/Compiler.js'

let input = process.argv[2]
const mode = process.argv.includes('--emit-llvm')
  ? 'llvm'
  : 'native'

if (!input) {
  const config = JSON.parse(await readFile('lumen.json', 'utf8'))
  input = config.entry
  process.argv.push('-o', config.output ?? join('build', basename(input, '.lm')))
}

const outputFlag = process.argv.indexOf('-o')
const output = outputFlag === -1
  ? mode === 'llvm'
    ? join('build', `${basename(input, '.lm')}.ll`)
    : join('build', basename(input, '.lm'))
  : process.argv[outputFlag + 1]

const compiler = new Compiler()
const llvmPath = mode === 'llvm'
  ? output
  : join('build', `${basename(input, '.lm')}.ll`)

await compiler.writeLLVMFile(input, llvmPath)

if (mode === 'native') {
  await compiler.buildExecutable(llvmPath, output)
}

console.log(output)
