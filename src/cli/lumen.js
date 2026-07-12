#!/usr/bin/env node
import { Diagnostic, DiagnosticCollection } from '../diagnostics/Diagnostic.js'
import { lumenVersion } from '../version.js'
import { SelfHostedCompilerError } from '../compiler/SelfHostedCompiler.js'
import {
  LumenCommandError,
  lumenHelp,
  parseLumenArguments,
  runLumenCommand
} from './LumenCommand.js'

try {
  const options = parseLumenArguments(process.argv.slice(2))

  if (options.help) {
    console.log(lumenHelp)
  } else if (options.version) {
    console.log(lumenVersion)
  } else {
    process.exitCode = await runLumenCommand(options)
  }
} catch (error) {
  if (!(error instanceof LumenCommandError) &&
    !(error instanceof SelfHostedCompilerError) &&
    !(error instanceof Diagnostic) &&
    !(error instanceof DiagnosticCollection)) {
    throw error
  }
  console.error(error.message)
  process.exitCode = 1
}
