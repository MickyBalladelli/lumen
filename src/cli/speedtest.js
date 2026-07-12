import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { SelfHostedCompiler } from '../compiler/SelfHostedCompiler.js'
import { printSpeedtestResults } from './SpeedtestReporter.js'

const tests = ['sum', 'fib', 'branch', 'math', 'nested', 'state']
const languages = ['lumen', 'rust', 'node', 'lmsh', 'python']
const runs = Number(process.env.LUMEN_SPEEDTEST_RUNS ?? '3')
const outputDir = join('build', 'speedtest')
const compiler = new SelfHostedCompiler()

await mkdir(outputDir, { recursive: true })

const pythonCommand = await commandExists('python3')
  ? 'python3'
  : await commandExists('python')
    ? 'python'
    : null
const rustCommand = await commandExists('rustc')
  ? 'rustc'
  : await commandExists(`${process.env.HOME}/.cargo/bin/rustc`)
    ? `${process.env.HOME}/.cargo/bin/rustc`
    : null
const nodeAvailable = await commandExists('node')

const rows = []
const expected = new Map()

for (const test of tests) {
  for (const language of languages) {
    const row = await runBenchmark(language, test)
    rows.push(row)

    if (row.output && !expected.has(test)) expected.set(test, row.output)
    if (row.output && expected.has(test) && row.output !== expected.get(test)) {
      row.note = `wrong output, expected ${expected.get(test)}`
    }
  }
}

printSpeedtestResults(rows, tests)

async function runBenchmark(language, test) {
  const row = {
    test,
    language,
    bestMs: '-',
    medianMs: '-',
    avgMs: '-',
    output: '',
    note: ''
  }

  try {
    const target = await prepare(language, test)
    if (!target) {
      row.note = 'missing tool'
      return row
    }

    const timings = []
    let output = ''

    for (let index = 0; index < runs; index += 1) {
      const result = await timedRun(target.command, target.args)
      if (result.code !== 0) {
        row.note = `exit ${result.code}`
        return row
      }

      timings.push(result.ms)
      output = result.stdout.trim()
    }

    row.bestMs = formatMs(Math.min(...timings))
    row.medianMs = formatMs(median(timings))
    row.avgMs = formatMs(timings.reduce((sum, value) => sum + value, 0) / timings.length)
    row.output = output
    return row
  } catch (error) {
    row.note = error.message
    return row
  }
}

async function prepare(language, test) {
  if (language === 'lumen') return prepareLumen(test)
  if (language === 'lmsh') return prepareLmsh(test)
  if (language === 'rust') return rustCommand ? prepareRust(test) : null
  if (language === 'python') return pythonCommand ? {
    command: pythonCommand,
    args: [join('benchmarks', 'python', `${test}.py`)]
  } : null
  if (language === 'node') return nodeAvailable ? {
    command: 'node',
    args: [join('benchmarks', 'node', `${test}.js`)]
  } : null

  return null
}

async function prepareLmsh(test) {
  return {
    command: './lmsh',
    args: [join('benchmarks', 'lumen', `${test}.lm`)]
  }
}

async function prepareLumen(test) {
  const source = join('benchmarks', 'lumen', `${test}.lm`)
  const llvm = join(outputDir, `${test}.ll`)
  const executable = join(outputDir, `lumen-${test}`)

  await compiler.writeLLVMFile(source, llvm)
  await compiler.buildExecutable(llvm, executable, {
    optimize: true
  })

  return {
    command: `./${executable}`,
    args: []
  }
}

async function prepareRust(test) {
  const source = join('benchmarks', 'rust', `${test}.rs`)
  const executable = join(outputDir, `rust-${test}`)
  const result = await runCommand(rustCommand, ['-O', source, '-o', executable])

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'rustc failed')
  }

  return {
    command: `./${executable}`,
    args: []
  }
}

async function timedRun(command, args) {
  const started = now()
  const result = await runCommand(command, args)
  return {
    ...result,
    ms: elapsed(started)
  }
}

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args)
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
      resolve({ code, stdout, stderr })
    })
  })
}

async function commandExists(command) {
  try {
    const result = await runCommand(command, ['--version'])
    return result.code === 0
  } catch {
    return false
  }
}

function now() {
  return process.hrtime.bigint()
}

function elapsed(started) {
  return Number(process.hrtime.bigint() - started) / 1_000_000
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 1) return sorted[middle]

  return (sorted[middle - 1] + sorted[middle]) / 2
}

function formatMs(value) {
  return value === 0 ? '-' : value.toFixed(2)
}
