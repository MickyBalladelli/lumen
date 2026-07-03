import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Compiler } from '../../compiler/Compiler.js'
import { findBootstrapDelegation } from '../../testing/BootstrapDelegationGuard.js'
import { canonicalizeBootstrapLLVM } from '../../testing/BootstrapEquivalence.js'
import {
  analyzeCompilerSourceCoverage,
  formatCompilerSourceCoverage
} from '../../testing/CompilerSourceCoverage.js'
import { TestSuite } from '../../testing/TestSuite.js'
import {
  runCommand,
  runExecutable
} from '../../testing/TestProcess.js'

const outputDir = 'build'
const compiler = new Compiler()
const suite = new TestSuite('bootstrap')
const requireRealBootstrap = process.argv.includes('--real')
const stageOneCompiler = join(outputDir, 'lumen-compiler')
const stageTwoCompiler = join(outputDir, 'lumen-compiler-self')
const stageThreeCompiler = join(outputDir, 'lumen-compiler-self2')

const programs = [
  ['tiny', join('tests', 'bootstrap', 'tiny.lm'), '', 7],
  ['basic', join('examples', 'basic.lm'), 'hello\n3\n', 3],
  ['control-flow', join('examples', 'control-flow.lm'), 'sum 23\n', 23],
  ['generic-for', join('tests', 'bootstrap', 'generic-for.lm'), 'value 16\n', 16],
  ['for-loop', join('examples', 'for-loop.lm'), '10\n', 10],
  ['native-main', join('examples', 'native-main.lm'), '10\n', 10],
  ['println', join('examples', 'println.lm'), 'total\n10\n', 10],
  ['struct', join('examples', 'struct.lm'), '11\n', 11],
  ['module-app', join('examples', 'module-app.lm'), '12\n', 12],
  ['self-host-struct-generic', join('examples', 'self-host-struct-generic.lm'), '11\n', 11],
  ['self-host-array', join('examples', 'self-host-array.lm'), '7\n', 7],
  ['self-host-async', join('examples', 'self-host-async.lm'), '4\n', 4],
  ['self-host-enum-match', join('examples', 'self-host-enum-match.lm'), 'missing\n', 7],
  ['self-host-switch', join('examples', 'self-host-switch.lm'), '20\n', 20],
  ['generic-switch', join('tests', 'bootstrap', 'generic-switch.lm'), '11\n', 11],
  ['self-host-try-catch', join('examples', 'self-host-try-catch.lm'), 'boom\n7\n', 7],
  ['generic-catch-print', join('tests', 'bootstrap', 'generic-catch-print.lm'), 'failure\nbad\n11\n', 11],
  ['self-host-simple', join('examples', 'self-host-simple.lm'), 'simple\n4\ndone\n', 4],
  ['self-host-if-binary', join('examples', 'self-host-if-binary.lm'), 'seven\n7\n', 7],
  ['self-host-call', join('examples', 'self-host-call.lm'), '9\n', 9],
  ['while-do', join('examples', 'while-do.lm'), '6\n', 6]
]

const diagnostics = [
  ['invalid', join('tests', 'bootstrap', 'invalid.lm'), 'compile error: missing function main at line 1 near let\n'],
  ['unsupported-while', join('tests', 'bootstrap', 'unsupported-while.lm'), 'compile error: unsupported while at line 2 near while\n'],
  ['break-outside-loop', join('tests', 'negative', 'break-outside-loop.lm'), 'compile error: break outside loop at line 2 near break\n'],
  ['type-mismatch', join('tests', 'bootstrap', 'type-mismatch.lm'), 'compile error: cannot assign i32 to string at line 2 near let\n'],
  ['none-to-string', join('tests', 'negative', 'none-to-string.lm'), 'compile error: cannot pass none to string at line 6 near echoText\n'],
  ['result-type-mismatch', join('tests', 'negative', 'result-type-mismatch.lm'), 'compile error: cannot pass Result<i32> to Result<string> at line 6 near describe\n'],
  ['duplicate-parameter', join('tests', 'negative', 'duplicate-parameter.lm'), 'compile error: duplicate parameter value at line 1 near value\n'],
  ['return-type-mismatch', join('tests', 'negative', 'return-type-mismatch.lm'), 'compile error: return type i32 does not match string at line 2 near return\n'],
  ['assignment-type-mismatch', join('tests', 'bootstrap', 'assignment-type-mismatch.lm'), 'compile error: cannot assign i32 to string at line 3 near value\n'],
  ['throw-type-mismatch', join('tests', 'negative', 'throw-type-mismatch.lm'), 'compile error: throw expects string or error, got i32 at line 2 near throw\n'],
  ['for-of-non-array', join('tests', 'negative', 'for-of-non-array.lm'), 'compile error: for-of needs an array at line 3 near of\n'],
  ['switch-case-mismatch', join('tests', 'negative', 'switch-case-mismatch.lm'), 'compile error: cannot compare switch i32 with case string at line 4 near case\n'],
  ['unterminated-string', join('tests', 'bootstrap', 'unterminated-string.lm'), 'compile error: Unterminated string literal at line 2\n'],
  ['unterminated-comment', join('tests', 'bootstrap', 'unterminated-comment.lm'), 'compile error: Unterminated block comment at line 2\n'],
  ['unexpected-character', join('tests', 'bootstrap', 'unexpected-character.lm'), 'compile error: Unexpected character "@" at line 2\n']
]

await suite.test('build stage-1 compiler', async () => {
  const llvmPath = join(outputDir, 'lumen-compiler.ll')
  await compiler.writeLLVMFile(join('compiler', 'main.lm'), llvmPath)
  await compiler.buildExecutable(llvmPath, stageOneCompiler)
  assert.equal(await hasSelfFallbackSymbols(stageOneCompiler), false)
})

for (const program of programs) {
  await suite.test(`stage-1 ${program[0]}`, () => testProgram(stageOneCompiler, 1, program))
}

for (const diagnostic of diagnostics) {
  await suite.test(`stage-1 diagnostic ${diagnostic[0]}`, () => {
    return testDiagnostic(stageOneCompiler, 1, diagnostic)
  })
}

await suite.test('build stage-2 compiler', async () => {
  const llvmPath = `${stageTwoCompiler}.ll`
  const result = await compileWith(stageOneCompiler, join('compiler', 'main.lm'), llvmPath, {
    progressLabel: 'building bootstrap stage-2 compiler'
  })
  assert.equal(result.code, 0, result.stdout)

  const llvm = await readFile(llvmPath, 'utf8')
  assert.equal(hasCompilerDelegation(llvm), false)
  await verifyLLVM(llvmPath, 'stage-2 LLVM')
  await compiler.buildExecutable(llvmPath, stageTwoCompiler)
  assert.equal(await hasSelfFallbackSymbols(stageTwoCompiler), false)
})

for (const program of programs) {
  await suite.test(`stage-2 ${program[0]}`, async () => {
    const stageTwoLLVM = await testProgram(stageTwoCompiler, 2, program)
    const stageOneLLVM = await readFile(programLLVM(program[0], 1), 'utf8')
    assert.equal(stageTwoLLVM, stageOneLLVM)
  })
}

for (const diagnostic of diagnostics) {
  await suite.test(`stage-2 diagnostic ${diagnostic[0]}`, () => {
    return testDiagnostic(stageTwoCompiler, 2, diagnostic)
  })
}

await suite.test('stage-2 and stage-3 compilers are equal', async () => {
  const stageThreeLLVMPath = `${stageThreeCompiler}.ll`
  const result = await compileWith(
    stageTwoCompiler,
    join('compiler', 'main.lm'),
    stageThreeLLVMPath,
    { progressLabel: 'building bootstrap stage-3 compiler' }
  )
  assert.equal(result.code, 0, result.stdout)

  const stageTwoLLVM = await readFile(`${stageTwoCompiler}.ll`, 'utf8')
  const stageThreeLLVM = await readFile(stageThreeLLVMPath, 'utf8')
  assert.equal(
    canonicalizeBootstrapLLVM(stageThreeLLVM),
    canonicalizeBootstrapLLVM(stageTwoLLVM)
  )
  assert.equal(hasCompilerDelegation(stageThreeLLVM), false)

  await verifyLLVM(stageThreeLLVMPath, 'stage-3 LLVM')
  await compiler.buildExecutable(stageThreeLLVMPath, stageThreeCompiler)
  assert.equal(await hasSelfFallbackSymbols(stageThreeCompiler), false)
})

await suite.test('linked stage-2 and stage-3 compilers behave equally', async () => {
  const stageTwoOutput = join(outputDir, 'equivalence-stage2.ll')
  const stageThreeOutput = join(outputDir, 'equivalence-stage3.ll')
  const positiveInput = join('tests', 'bootstrap', 'tiny.lm')
  const stageTwoResult = await compileWith(
    stageTwoCompiler,
    positiveInput,
    stageTwoOutput
  )
  const stageThreeResult = await compileWith(
    stageThreeCompiler,
    positiveInput,
    stageThreeOutput
  )
  assert.deepEqual(stageThreeResult, stageTwoResult)
  assert.equal(stageTwoResult.code, 0, stageTwoResult.stdout)

  const stageTwoProgramLLVM = await readFile(stageTwoOutput, 'utf8')
  const stageThreeProgramLLVM = await readFile(stageThreeOutput, 'utf8')
  assert.equal(
    canonicalizeBootstrapLLVM(stageThreeProgramLLVM),
    canonicalizeBootstrapLLVM(stageTwoProgramLLVM)
  )

  const stageTwoProgram = stageTwoOutput.slice(0, -3)
  const stageThreeProgram = stageThreeOutput.slice(0, -3)
  await compiler.buildExecutable(stageTwoOutput, stageTwoProgram)
  await compiler.buildExecutable(stageThreeOutput, stageThreeProgram)
  assert.deepEqual(
    await runExecutable(stageThreeProgram),
    await runExecutable(stageTwoProgram)
  )

  const negativeInput = join('tests', 'bootstrap', 'invalid.lm')
  const stageTwoFailure = await compileWith(
    stageTwoCompiler,
    negativeInput,
    join(outputDir, 'equivalence-invalid-stage2.ll')
  )
  const stageThreeFailure = await compileWith(
    stageThreeCompiler,
    negativeInput,
    join(outputDir, 'equivalence-invalid-stage3.ll')
  )
  assert.notEqual(stageTwoFailure.code, 0)
  assert.deepEqual(stageThreeFailure, stageTwoFailure)
})

if (requireRealBootstrap) {
  for (const program of programs) {
    await suite.test(`stage-3 ${program[0]}`, () => {
      return testProgram(stageThreeCompiler, 3, program)
    })
  }

  for (const diagnostic of diagnostics) {
    await suite.test(`stage-3 diagnostic ${diagnostic[0]}`, () => {
      return testDiagnostic(stageThreeCompiler, 3, diagnostic)
    })
  }

  await suite.test('bootstrap contains no compiler delegation shortcuts', async () => {
    const findings = await bootstrapDelegationFindings()
    assert.deepEqual(
      findings,
      [],
      `real bootstrap is red:\n${findings.join('\n')}`
    )
  })

  await suite.test('compiler source uses only generic bootstrap features', async () => {
    const compilation = await compiler.compileFile(join('compiler', 'main.lm'))
    const report = analyzeCompilerSourceCoverage(compilation)
    const reportPath = join(outputDir, 'bootstrap', 'compiler-source-coverage.json')
    await mkdir(join(outputDir, 'bootstrap'), { recursive: true })
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    assert.equal(report.ready, true, formatCompilerSourceCoverage(report))
  })
}

suite.finish()

async function testProgram(compilerPath, stage, [name, sourcePath, stdout, code]) {
  const llvmPath = programLLVM(name, stage)
  const executablePath = llvmPath.slice(0, -3)
  const result = await compileWith(compilerPath, sourcePath, llvmPath)
  assert.equal(result.code, 0, result.stdout)

  await compiler.buildExecutable(llvmPath, executablePath)
  const execution = await runExecutable(executablePath)
  assert.equal(execution.code, code)
  assert.equal(execution.stdout, stdout)
  return readFile(llvmPath, 'utf8')
}

async function testDiagnostic(compilerPath, stage, [name, sourcePath, stdout]) {
  const outputPath = join(outputDir, `${name}-self${stage === 1 ? '' : stage}.ll`)
  const result = await compileWith(compilerPath, sourcePath, outputPath)
  assert.notEqual(result.code, 0)
  assert.equal(result.stdout, stdout)
}

function compileWith(compilerPath, sourcePath, outputPath, options) {
  return runExecutable(compilerPath, [sourcePath, outputPath], {}, options)
}

function programLLVM(name, stage) {
  const suffix = stage === 1 ? 'self' : `self${stage}`
  return join(outputDir, `${name}-${suffix}.ll`)
}

async function hasSelfFallbackSymbols(path) {
  const result = await runCommand('nm', [path])
  return result.stdout.includes('lumen_self_compile_source') ||
    result.stdout.includes('lumen_self_validate_source') ||
    result.stdout.includes('lumen_self_diagnostic')
}

function hasCompilerDelegation(llvm) {
  return llvm.includes('self-host compiler delegate') ||
    llvm.includes('compiler.self.unsupported') ||
    llvm.includes('call i32 @lumen_exec')
}

async function verifyLLVM(path, label) {
  const objectPath = `${path}.verify.o`

  try {
    const result = await runCommand(process.env.LUMEN_CLANG ?? 'clang', [
      '-Wno-override-module',
      '-x',
      'ir',
      '-c',
      path,
      '-o',
      objectPath
    ])
    assert.equal(
      result.code,
      0,
      `${label} failed Clang verification\n${result.stderr}`
    )
  } finally {
    await unlink(objectPath).catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

async function bootstrapDelegationFindings() {
  const findings = []
  const llvmArtifacts = [
    ['stage-1 LLVM', join(outputDir, 'lumen-compiler.ll')],
    ['stage-2 LLVM', `${stageTwoCompiler}.ll`],
    ['stage-3 LLVM', `${stageThreeCompiler}.ll`]
  ]
  const binaryArtifacts = [
    ['stage-1 binary', stageOneCompiler],
    ['stage-2 binary', stageTwoCompiler],
    ['stage-3 binary', stageThreeCompiler]
  ]
  const sourceFiles = (await readdir('compiler'))
    .filter(file => file.endsWith('.lm'))
    .sort()

  for (const [label, path] of llvmArtifacts) {
    findings.push(...findBootstrapDelegation(
      await readFile(path, 'utf8'),
      { kind: 'llvm', label }
    ))
  }

  for (const [label, path] of binaryArtifacts) {
    findings.push(...findBootstrapDelegation(
      (await readFile(path)).toString('latin1'),
      { kind: 'binary', label }
    ))
    const symbols = await runCommand('nm', [path])
    assert.equal(symbols.code, 0, symbols.stderr)
    findings.push(...findBootstrapDelegation(
      symbols.stdout,
      { kind: 'symbols', label: `${label} symbols` }
    ))
  }

  for (const file of sourceFiles) {
    findings.push(...findBootstrapDelegation(
      await readFile(join('compiler', file), 'utf8'),
      { kind: 'source', label: `compiler/${file}` }
    ))
  }

  return [...new Set(findings)]
}
