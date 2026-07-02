import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Compiler } from '../compiler/Compiler.js'
import {
  compileLLVMArtifact,
  compileNativeArtifact,
  llvmBuildTarget,
  nativeBuildTarget,
  publishArtifact
} from '../compiler/BuildArtifacts.js'
import { Diagnostic, DiagnosticCollection } from '../diagnostics/Diagnostic.js'

let input = process.argv[2]
let configuredOutput = null
const mode = process.argv.includes('--emit-llvm')
  ? 'llvm'
  : 'native'

if (!input) {
  const config = JSON.parse(await readFile('lumen.json', 'utf8'))
  input = config.entry
  configuredOutput = config.output ?? null
}

const outputFlag = process.argv.indexOf('-o')
const output = outputFlag === -1
  ? configuredOutput
  : process.argv[outputFlag + 1]

const compiler = new Compiler()
const clang = process.env.LUMEN_CLANG ?? 'clang'
const cacheRoot = join('build', 'cache')

try {
  let artifactPath

  if (mode === 'llvm') {
    const artifact = await compileLLVMArtifact({
      compiler,
      inputPath: input,
      cacheRoot,
      target: llvmBuildTarget()
    })
    artifactPath = artifact.llvmPath
  } else {
    const flags = {
      clang,
      optimize: false,
      sanitizers: []
    }
    const artifact = await compileNativeArtifact({
      compiler,
      inputPath: input,
      cacheRoot,
      target: nativeBuildTarget(),
      flags,
      buildOptions: {
        clang
      }
    })
    artifactPath = artifact.executablePath
  }

  if (output) await publishArtifact(artifactPath, output)
  console.log(output ?? artifactPath)
} catch (error) {
  if (!(error instanceof Diagnostic) && !(error instanceof DiagnosticCollection)) throw error
  console.error(error.message)
  process.exitCode = 1
}
