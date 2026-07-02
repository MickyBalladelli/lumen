#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { Compiler } from '../compiler/Compiler.js'
import {
  compileNativeArtifact,
  nativeBuildTarget
} from '../compiler/BuildArtifacts.js'
import { Diagnostic, DiagnosticCollection } from '../diagnostics/Diagnostic.js'

const input = process.argv[2]
const args = process.argv.slice(3)

if (!input || input === '-h' || input === '--help') {
  console.log('usage: lmsh file.lm [args...]')
  process.exit(input ? 0 : 1)
}

const compiler = new Compiler()
const clang = process.env.LUMEN_CLANG ?? 'clang'
const flags = {
  clang,
  optimize: false,
  sanitizers: []
}

try {
  const artifact = await compileNativeArtifact({
    compiler,
    inputPath: input,
    cacheRoot: join('build', 'cache'),
    target: nativeBuildTarget(),
    flags,
    buildOptions: {
      clang
    }
  })

  const result = await runExecutable(artifact.executablePath, args)
  process.exit(result)
} catch (error) {
  if (!(error instanceof Diagnostic) && !(error instanceof DiagnosticCollection)) throw error
  console.error(error.message)
  process.exitCode = 1
}

function runExecutable(path, args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(resolve(path), args, {
      stdio: 'inherit',
      env: process.env
    })

    child.on('error', reject)
    child.on('close', code => {
      resolveResult(code ?? 1)
    })
  })
}
