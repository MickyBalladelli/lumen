import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Compiler } from '../compiler/Compiler.js'

const input = process.argv[2]
const mode = process.argv.includes('--emit-llvm')
  ? 'llvm'
  : 'native'

if (!input) {
  console.error('Usage: node src/cli/compile.js <file.lm> [--emit-llvm] [-o output]')
  process.exit(1)
}

const outputFlag = process.argv.indexOf('-o')
const output = outputFlag === -1
  ? mode === 'llvm'
    ? join('build', `${basename(input, '.lm')}.ll`)
    : join('build', basename(input, '.lm'))
  : process.argv[outputFlag + 1]

const source = await readFile(input, 'utf8')
const compiler = new Compiler()
const llvmPath = mode === 'llvm'
  ? output
  : join('build', `${basename(input, '.lm')}.ll`)

await compiler.writeLLVM(source, llvmPath)

if (mode === 'native') {
  await compiler.buildExecutable(llvmPath, output)
}

console.log(output)
