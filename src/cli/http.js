import { readFile } from 'node:fs/promises'
import { Compiler } from '../compiler/Compiler.js'

const source = await readFile('examples/http-server.lm', 'utf8')
const compiler = new Compiler()
const llvmPath = 'build/http-server.ll'
const executablePath = 'build/http-server'

await compiler.writeLLVM(source, llvmPath)
await compiler.buildExecutable(llvmPath, executablePath)
await compiler.run(`./${executablePath}`, [])
