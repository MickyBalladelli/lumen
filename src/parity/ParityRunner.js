import { spawn } from 'node:child_process'
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Compiler } from '../compiler/Compiler.js'
import { diagnosticsFrom } from '../diagnostics/Diagnostic.js'
import { FeatureParityMatrix, ParityDimensions } from './FeatureMatrix.js'

export async function runParityMatrix({
  matrix = FeatureParityMatrix,
  outputDir = join('build', 'parity'),
  compiler = new Compiler(),
  selfCompilerPath = null
} = {}) {
  await mkdir(outputDir, { recursive: true })
  const selfCompiler = selfCompilerPath ?? await buildSelfCompiler(compiler, outputDir)
  const rows = []

  for (const entry of matrix) {
    rows.push(await runEntry(entry, {
      compiler,
      selfCompiler,
      outputDir
    }))
  }

  return {
    generatedAt: new Date().toISOString(),
    dimensions: ParityDimensions,
    complete: rows.every(row => row.complete),
    rows
  }
}

export async function writeParityReport(report, outputPath) {
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
}

async function buildSelfCompiler(compiler, outputDir) {
  const llvmPath = join(outputDir, 'lumen-compiler.ll')
  const executablePath = join(outputDir, 'lumen-compiler')
  await compiler.writeLLVMFile(join('compiler', 'main.lm'), llvmPath)
  await compiler.buildExecutable(llvmPath, executablePath)
  return executablePath
}

async function runEntry(entry, context) {
  const stem = entry.id.replace(/[^A-Za-z0-9_-]/g, '-')
  const jsLLVM = join(context.outputDir, `${stem}.js.ll`)
  const selfLLVM = join(context.outputDir, `${stem}.self.ll`)
  const jsExecutable = join(context.outputDir, `${stem}.js`)
  const selfExecutable = join(context.outputDir, `${stem}.self`)

  await Promise.all([
    unlink(jsLLVM).catch(ignoreMissing),
    unlink(selfLLVM).catch(ignoreMissing),
    unlink(jsExecutable).catch(ignoreMissing),
    unlink(selfExecutable).catch(ignoreMissing)
  ])

  const jsCompile = await compileWithJS(context.compiler, entry.fixture, jsLLVM)
  const selfCompile = await runCommand(context.selfCompiler, [entry.fixture, selfLLVM])

  if (entry.kind === 'diagnostic') {
    return await diagnosticRow(entry, jsCompile, selfCompile, jsLLVM, selfLLVM)
  }

  const diagnostics = featureDiagnostics(entry, jsCompile, selfCompile)
  const llvm = diagnostics.pass
    ? await compareLLVM(entry, context.compiler, jsLLVM, selfLLVM, jsExecutable, selfExecutable)
    : failedDimension('compile failed')
  const executable = llvm.pass
    ? await compareExecutables(entry, jsExecutable, selfExecutable)
    : failedDimension('LLVM did not pass')
  const checks = { diagnostics, llvm, executable }

  return {
    id: entry.id,
    name: entry.name,
    fixture: entry.fixture,
    kind: entry.kind,
    complete: Object.values(checks).every(check => check.pass),
    checks
  }
}

async function compileWithJS(compiler, fixture, outputPath) {
  try {
    await compiler.writeLLVMFile(fixture, outputPath)
    return { code: 0, diagnostics: [] }
  } catch (error) {
    const diagnostics = diagnosticsFrom(error)
    if (diagnostics.length === 0) throw error
    return { code: 1, diagnostics }
  }
}

function featureDiagnostics(entry, jsCompile, selfCompile) {
  const pass = jsCompile.code === 0 && selfCompile.code === 0
  return {
    pass,
    js: jsCompile.code === 0 ? 'accepted' : formatJSDiagnostic(jsCompile.diagnostics[0]),
    self: selfCompile.code === 0 ? 'accepted' : selfCompile.stdout.trim(),
    expected: 'accepted',
    detail: pass ? 'both accepted' : `${entry.id} was not accepted by both compilers`
  }
}

async function compareLLVM(entry, compiler, jsLLVM, selfLLVM, jsExecutable, selfExecutable) {
  const [jsSource, selfSource] = await Promise.all([
    readFile(jsLLVM, 'utf8'),
    readFile(selfLLVM, 'utf8')
  ])
  const missing = entry.llvmPatterns.filter(pattern => {
    return !jsSource.includes(pattern) || !selfSource.includes(pattern)
  })

  if (missing.length > 0) {
    return {
      pass: false,
      js: 'emitted',
      self: 'emitted',
      detail: `missing shared LLVM behavior: ${missing.join(', ')}`
    }
  }

  try {
    await compiler.buildExecutable(jsLLVM, jsExecutable)
    await compiler.buildExecutable(selfLLVM, selfExecutable)
    return {
      pass: true,
      js: 'linked',
      self: 'linked',
      detail: 'both LLVM modules satisfy the contract and link'
    }
  } catch (error) {
    return {
      pass: false,
      js: 'link attempted',
      self: 'link attempted',
      detail: error.message
    }
  }
}

async function compareExecutables(entry, jsExecutable, selfExecutable) {
  const [js, self] = await Promise.all([
    runCommand(jsExecutable),
    runCommand(selfExecutable)
  ])
  const same = js.stdout === self.stdout &&
    js.stderr === self.stderr &&
    js.code === self.code
  const expected = entry.expected
  const correct = js.stdout === expected.stdout &&
    js.stderr === expected.stderr &&
    js.code === expected.code

  return {
    pass: same && correct,
    js,
    self,
    expected,
    detail: same && correct
      ? 'stdout, stderr, and exit code match'
      : 'executable behavior differs'
  }
}

async function diagnosticRow(entry, jsCompile, selfCompile, jsLLVM, selfLLVM) {
  const jsDiagnostic = normalizeJSDiagnostic(jsCompile.diagnostics[0])
  const selfDiagnostic = normalizeSelfDiagnostic(selfCompile.stdout)
  const diagnosticsPass = jsCompile.code !== 0 &&
    selfCompile.code !== 0 &&
    jsDiagnostic.message === selfDiagnostic.message &&
    jsDiagnostic.line === selfDiagnostic.line &&
    jsDiagnostic.message === entry.expected.message &&
    jsDiagnostic.line === entry.expected.line
  const [jsEmitted, selfEmitted] = await Promise.all([
    exists(jsLLVM),
    exists(selfLLVM)
  ])
  const llvmPass = jsCompile.code !== 0 &&
    selfCompile.code !== 0 &&
    !jsEmitted &&
    !selfEmitted
  const checks = {
    diagnostics: {
      pass: diagnosticsPass,
      js: jsDiagnostic,
      self: selfDiagnostic,
      expected: entry.expected,
      detail: diagnosticsPass ? 'message and line match' : 'diagnostics differ'
    },
    llvm: {
      pass: llvmPass,
      js: jsEmitted ? jsLLVM : 'not emitted',
      self: selfEmitted ? selfLLVM : 'not emitted',
      detail: llvmPass ? 'both rejected before LLVM emission' : 'one compiler emitted LLVM'
    },
    executable: {
      pass: llvmPass,
      js: 'not applicable',
      self: 'not applicable',
      detail: 'rejected programs do not produce executables'
    }
  }

  return {
    id: entry.id,
    name: entry.name,
    fixture: entry.fixture,
    kind: entry.kind,
    complete: Object.values(checks).every(check => check.pass),
    checks
  }
}

function normalizeJSDiagnostic(diagnostic) {
  if (!diagnostic) return { message: '', line: null }
  return {
    message: normalizeMessage(diagnostic.rawMessage),
    line: diagnostic.location?.line ?? null
  }
}

function formatJSDiagnostic(diagnostic) {
  const normalized = normalizeJSDiagnostic(diagnostic)
  return `${normalized.message} at line ${normalized.line}`
}

function normalizeSelfDiagnostic(stdout) {
  const line = stdout.match(/\bat line (\d+)/i)
  const message = stdout.match(/compile error:\s*(.*?)(?:\s+at line|$)/i)
  return {
    message: normalizeMessage(message?.[1] ?? stdout),
    line: line ? Number(line[1]) : null
  }
}

function normalizeMessage(message) {
  return String(message)
    .toLowerCase()
    .replaceAll('"', '')
    .replace(/\s+/g, ' ')
    .trim()
}

function failedDimension(detail) {
  return {
    pass: false,
    js: 'not run',
    self: 'not run',
    detail
  }
}

function ignoreMissing(error) {
  if (error.code !== 'ENOENT') throw error
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', code => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      })
    })
  })
}

export function matrixSummary(report) {
  return report.rows.map(row => ({
    feature: row.id,
    diagnostics: marker(row.checks.diagnostics.pass),
    llvm: marker(row.checks.llvm.pass),
    executable: marker(row.checks.executable.pass),
    complete: marker(row.complete)
  }))
}

function marker(pass) {
  return pass ? 'pass' : 'fail'
}
