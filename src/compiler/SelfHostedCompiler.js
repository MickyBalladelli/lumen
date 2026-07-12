import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { atomicWriteFile } from './BuildArtifacts.js'
import { linkLLVM } from './NativeLinker.js'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
const runtimeRoot = join(packageRoot, 'src', 'runtime')

export class SelfHostedCompilerError extends Error {}

export class SelfHostedCompiler {
  constructor({
    cacheRoot = join(process.cwd(), 'build', 'cache'),
    clang = process.env.LUMEN_CLANG ?? 'clang',
    compilerPath = process.env.LUMEN_COMPILER ?? null
  } = {}) {
    this.cacheRoot = resolve(cacheRoot)
    this.clang = clang
    this.compilerPath = compilerPath
    this.nativeCompilerPromise = null
  }

  async compileFile(inputPath) {
    const compilerPath = await this.nativeCompiler()
    const temporaryDirectory = join(this.cacheRoot, 'self-host', 'outputs')
    const outputPath = join(temporaryDirectory, `${process.pid}-${randomUUID()}.ll`)
    await mkdir(temporaryDirectory, { recursive: true })

    try {
      const result = await run(compilerPath, [resolve(inputPath), outputPath])
      if (result.code !== 0) {
        throw new SelfHostedCompilerError(
          (result.stdout || result.stderr || `native compiler exited with ${result.code}`).trim()
        )
      }
      return { llvm: await readFile(outputPath, 'utf8'), diagnostics: [] }
    } finally {
      await unlink(outputPath).catch(error => {
        if (error.code !== 'ENOENT') throw error
      })
    }
  }

  async writeLLVMFile(inputPath, outputPath) {
    const result = await this.compileFile(inputPath)
    await atomicWriteFile(outputPath, result.llvm)
    return result
  }

  async buildExecutable(llvmPath, outputPath, options = {}) {
    return linkLLVM(llvmPath, outputPath, {
      clang: options.clang ?? this.clang,
      optimize: options.optimize,
      sanitizers: options.sanitizers
    })
  }

  async buildSource(inputPath, outputPath, options = {}) {
    const compilerPath = await this.nativeCompiler()
    await mkdir(dirname(outputPath), { recursive: true })
    const result = await run(compilerPath, [
      'build',
      resolve(inputPath),
      resolve(outputPath),
      options.clang ?? this.clang,
      runtimeRoot
    ])
    if (result.code !== 0) {
      throw new SelfHostedCompilerError(
        (result.stdout || result.stderr || `native compiler exited with ${result.code}`).trim()
      )
    }
    return outputPath
  }

  nativeCompiler() {
    this.nativeCompilerPromise ??= this.buildNativeCompiler()
    return this.nativeCompilerPromise
  }

  async buildNativeCompiler() {
    const candidates = [
      this.compilerPath,
      join(packageRoot, 'native', `${process.platform}-${process.arch}`, 'lumen-compiler')
    ].filter(Boolean)

    for (const candidate of candidates) {
      try {
        await access(candidate)
        return resolve(candidate)
      } catch {}
    }

    throw new SelfHostedCompilerError(
      `No native Lumen compiler for ${process.platform}-${process.arch}. ` +
      'Install a platform compiler or set LUMEN_COMPILER. ' +
      'Use the explicit stage-0 bootstrap command only for recovery.'
    )
  }
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => resolvePromise({ code: code ?? 1, stdout, stderr }))
  })
}
