import { spawn } from 'node:child_process'
import { Compiler } from '../compiler/Compiler.js'
import {
  Diagnostic,
  DiagnosticCollection
} from '../diagnostics/Diagnostic.js'
import { formatSource } from '../formatter/Formatter.js'
import { Tokenizer } from '../lexer/Tokenizer.js'
import { Parser } from '../parser/Parser.js'

const SOURCE_PARTS = [
  'function', 'main', 'let', 'const', 'return', 'if', 'else', 'while',
  'struct', 'match', 'true', 'false', 'null', 'i32', 'string',
  '(', ')', '[', ']', '{', '}', ',', '.', ':', ';', '=', '=>',
  '+', '-', '*', '/', '%', '==', '!=', '<', '>', '&&', '||',
  '"text"', "'value'", '"', "'", '// comment', '/* block */', '/*',
  '\n', '\r\n', '\t', ' ', '_', '0', '1', '42', '\0', 'é', 'λ', '🦀'
]

const SOURCE_CORPUS = [
  '',
  'function main(): i32 {\n  return 0\n}',
  'let value = [1, 2, 3]',
  'if value > 0 {\n  println(value)\n} else {\n  println(0)\n}',
  'struct Point {\n  x: i32\n  y: i32\n}',
  'let label = match value {\n  1 => "one"\n  _ => "other"\n}',
  'for (let item of values) {\n  println(item)\n}',
  '/* comment */\nfunction broken( { return "unterminated'
]

const INVALID_PROGRAMS = [
  'function main(: i32 { return 0 }',
  'function main(): i32 { return (1 + ) }',
  'function main(): i32 { return missing }',
  'function main(): i32 { return "wrong type" }',
  'function main(): i32 { break\nreturn 0 }',
  'function main(): i32 { let value: i32 = true\nreturn value }',
  'function main(): i32 { return 0 }\n@'
]

export async function runCompilerProperties({
  seed = Date.now(),
  runs = 1000,
  clang = process.env.LUMEN_CLANG ?? 'clang'
} = {}) {
  const random = new Random(seed)
  const totals = {
    parserCases: runs,
    invalidPrograms: Math.max(1, Math.ceil(runs / 4)),
    llvmPrograms: Math.max(1, Math.ceil(runs / 10))
  }

  for (let index = 0; index < totals.parserCases; index += 1) {
    const source = arbitrarySource(random)
    checkTokenizerParser(source, seed, index)
    checkFormatting(source, seed, index)
  }

  for (let index = 0; index < totals.invalidPrograms; index += 1) {
    const source = invalidProgram(random, index)
    checkInvalidProgram(source, seed, index)
  }

  for (let index = 0; index < totals.llvmPrograms; index += 1) {
    const source = validProgram(random, index)
    checkFormatting(source, seed, index)

    let llvm
    try {
      llvm = new Compiler().compileSource(source, {
        sourcePath: `fuzz-${seed}-${index}.lm`
      }).llvm
    } catch (error) {
      throw propertyFailure('valid program did not compile', {
        seed,
        index,
        source,
        cause: error
      })
    }

    await verifyLLVM(llvm, clang, { seed, index, source })
  }

  return {
    seed,
    ...totals
  }
}

function checkTokenizerParser(source, seed, index) {
  try {
    const tokens = new Tokenizer(source).tokenize()
    const diagnostics = []
    new Parser(tokens).parseProgram({ diagnostics })

    if (diagnostics.some(diagnostic => !(diagnostic instanceof Diagnostic))) {
      throw new Error('parser returned a non-diagnostic failure')
    }
  } catch (error) {
    if (isDiagnostic(error)) return
    throw propertyFailure('tokenizer/parser crashed', {
      seed,
      index,
      source,
      cause: error
    })
  }
}

function checkFormatting(source, seed, index) {
  try {
    const formatted = formatSource(source)
    const formattedAgain = formatSource(formatted)
    if (formattedAgain !== formatted) {
      throw propertyFailure('formatting was not idempotent', {
        seed,
        index,
        source,
        formatted,
        formattedAgain
      })
    }
  } catch (error) {
    if (error.propertyFailure) throw error
    throw propertyFailure('formatter crashed', {
      seed,
      index,
      source,
      cause: error
    })
  }
}

function checkInvalidProgram(source, seed, index) {
  let emitterReached = false
  let rejected = false
  const compiler = new Compiler({
    backendFactory: () => ({
      emit() {
        emitterReached = true
        return ''
      }
    })
  })

  try {
    compiler.compileSource(source)
  } catch (error) {
    if (!isDiagnostic(error)) {
      throw propertyFailure('invalid program crashed the compiler', {
        seed,
        index,
        source,
        cause: error
      })
    }
    rejected = true
  }

  if (!rejected) {
    throw propertyFailure('invalid program was accepted', {
      seed,
      index,
      source
    })
  }
  if (emitterReached) {
    throw propertyFailure('invalid program reached LLVM emission', {
      seed,
      index,
      source
    })
  }
}

async function verifyLLVM(llvm, clang, context) {
  const result = await runCommand(clang, [
    '-Wno-override-module',
    '-x',
    'ir',
    '-c',
    '-o',
    process.platform === 'win32' ? 'NUL' : '/dev/null',
    '-'
  ], llvm)

  if (result.code !== 0) {
    throw propertyFailure('generated LLVM failed clang verification', {
      ...context,
      llvm,
      detail: result.stderr || result.stdout || `${clang} exited with ${result.code}`
    })
  }
}

function arbitrarySource(random) {
  if (random.boolean()) return tokenNoise(random)

  let source = random.pick(SOURCE_CORPUS)
  const changes = random.integer(1, 12)
  for (let change = 0; change < changes; change += 1) {
    const offset = random.integer(0, source.length)
    if (source.length > 0 && random.integer(0, 3) === 0) {
      const removed = random.integer(1, Math.min(4, source.length - offset) || 1)
      source = source.slice(0, offset) + source.slice(offset + removed)
    } else {
      source = source.slice(0, offset) + random.pick(SOURCE_PARTS) + source.slice(offset)
    }
  }
  return source
}

function tokenNoise(random) {
  const count = random.integer(0, 80)
  let source = ''
  for (let index = 0; index < count; index += 1) {
    source += random.pick(SOURCE_PARTS)
    if (random.integer(0, 4) === 0) source += random.pick([' ', '\n', '\t', ''])
  }
  return source
}

function invalidProgram(random, index) {
  const base = INVALID_PROGRAMS[index % INVALID_PROGRAMS.length]
  const padding = random.integer(-100, 100)
  return base.replaceAll('0', String(padding))
}

function validProgram(random, index) {
  const left = random.integer(0, 1000)
  const right = random.integer(1, 1000)
  const extra = random.integer(0, 50)
  const templates = [
    () => [
      `function calculate${index}(value: i32): i32 {`,
      `  let adjustment: i32 = ${extra}`,
      '  return value + adjustment',
      '}',
      'function main(): i32 {',
      `  let left: i32 = ${left}`,
      `  let right: i32 = ${right}`,
      '  if left < right {',
      `    return calculate${index}(left)`,
      '  }',
      `  return calculate${index}(right)`,
      '}'
    ],
    () => [
      `struct Pair${index} {`,
      '  left: i32',
      '  right: i32',
      '}',
      'function main(): i32 {',
      `  let pair = Pair${index} { left: ${left}, right: ${right} }`,
      '  return pair.left + pair.right',
      '}'
    ],
    () => [
      'function main(): i32 {',
      `  let values: i32[] = [${left}, ${right}, ${extra}]`,
      '  return values[1]',
      '}'
    ],
    () => [
      'function main(): i32 {',
      '  let value: i32 = 0',
      `  while value < ${extra + 1} {`,
      '    value = value + 1',
      '  }',
      '  return value',
      '}'
    ],
    () => [
      'function main(): i32 {',
      `  let value: i32 = ${left}`,
      '  return match value {',
      `    ${left} => ${right}`,
      `    _ => ${extra}`,
      '  }',
      '}'
    ]
  ]

  return templates[index % templates.length]().join('\n')
}

function runCommand(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', code => resolve({
      code: code ?? 1,
      stdout,
      stderr
    }))
    child.stdin.end(input)
  })
}

function isDiagnostic(error) {
  return error instanceof Diagnostic || error instanceof DiagnosticCollection
}

function propertyFailure(message, details) {
  const error = new Error([
    message,
    `seed: ${details.seed}`,
    `case: ${details.index}`,
    `source: ${JSON.stringify(details.source)}`,
    details.formatted === undefined
      ? null
      : `formatted: ${JSON.stringify(details.formatted)}`,
    details.formattedAgain === undefined
      ? null
      : `formatted again: ${JSON.stringify(details.formattedAgain)}`,
    details.detail ? `detail: ${details.detail}` : null,
    details.llvm ? `LLVM:\n${details.llvm}` : null,
    details.cause?.stack ? `cause: ${details.cause.stack}` : null
  ].filter(Boolean).join('\n'))
  error.propertyFailure = true
  return error
}

class Random {
  constructor(seed) {
    this.state = Number(seed) >>> 0
  }

  next() {
    this.state += 0x6d2b79f5
    let value = this.state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }

  boolean() {
    return this.next() < 0.5
  }

  integer(minimum, maximum) {
    return minimum + Math.floor(this.next() * (maximum - minimum + 1))
  }

  pick(values) {
    return values[this.integer(0, values.length - 1)]
  }
}
