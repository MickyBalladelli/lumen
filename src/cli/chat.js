import { readFile } from 'node:fs/promises'
import { Compiler } from '../compiler/Compiler.js'

const source = await readFile('examples/socket-chat.lm', 'utf8')
const compiler = new Compiler()
const llvmPath = 'build/socket-chat.ll'
const executablePath = 'build/socket-chat'

await compiler.writeLLVM(source, llvmPath)
await compiler.buildExecutable(llvmPath, executablePath)
await compiler.run(`./${executablePath}`, [])
