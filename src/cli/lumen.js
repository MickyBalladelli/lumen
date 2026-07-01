#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { Diagnostic, DiagnosticCollection } from '../diagnostics/Diagnostic.js'
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
    const packageJson = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8')
    )
    console.log(packageJson.version)
  } else {
    process.exitCode = await runLumenCommand(options)
  }
} catch (error) {
  if (!(error instanceof LumenCommandError) &&
    !(error instanceof Diagnostic) &&
    !(error instanceof DiagnosticCollection)) {
    throw error
  }
  console.error(error.message)
  process.exitCode = 1
}
