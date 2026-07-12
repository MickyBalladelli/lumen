import { SelfHostedCompiler } from '../compiler/SelfHostedCompiler.js'
import { runNative } from './RunNative.js'

const compiler = new SelfHostedCompiler()
const executablePath = 'build/http-server'

await compiler.buildSource('examples/http-server.lm', executablePath)
process.exitCode = await runNative(executablePath)
