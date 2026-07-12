#!/usr/bin/env node
import { join } from 'node:path'
import { SelfHostedCompiler } from '../compiler/SelfHostedCompiler.js'
import {
  compileNativeArtifact,
  nativeBuildTarget
} from '../compiler/BuildArtifacts.js'
import { runNative } from './RunNative.js'

const input = process.argv[2]
const args = process.argv.slice(3)

if (!input || input === '-h' || input === '--help') {
  console.log('usage: lmsh file.lm [args...]')
  process.exit(input ? 0 : 1)
}

const compiler = new SelfHostedCompiler()
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

  const result = await runNative(artifact.executablePath, args)
  process.exit(result)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
