#!/usr/bin/env node
import { mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import { Compiler } from '../compiler/Compiler.js'
import { Diagnostic, DiagnosticCollection } from '../diagnostics/Diagnostic.js'

const input = process.argv[2]
const args = process.argv.slice(3)

if (!input || input === '-h' || input === '--help') {
  console.log('usage: lmsh file.lm [args...]')
  process.exit(input ? 0 : 1)
}

const compiler = new Compiler()
const name = basename(input, '.lm')
const outputDir = join('build', 'lmsh')
const llvmPath = join(outputDir, `${name}.ll`)
const executablePath = join(outputDir, name)

try {
  await mkdir(outputDir, { recursive: true })
  await compiler.writeLLVMFile(input, llvmPath)
  await compiler.buildExecutable(llvmPath, executablePath)

  const result = await runExecutable(executablePath, args)
  process.exit(result)
} catch (error) {
  if (!(error instanceof Diagnostic) && !(error instanceof DiagnosticCollection)) throw error
  console.error(error.message)
  process.exitCode = 1
}

function runExecutable(path, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(`./${path}`, args, {
      stdio: 'inherit',
      env: process.env
    })

    child.on('error', reject)
    child.on('close', code => {
      resolve(code ?? 1)
    })
  })
}
