import { SelfHostedCompiler } from '../compiler/SelfHostedCompiler.js'
import { runNative } from './RunNative.js'

const compiler = new SelfHostedCompiler()
const executablePath = 'build/socket-chat'

await compiler.buildSource('examples/socket-chat.lm', executablePath)
process.exitCode = await runNative(executablePath)
