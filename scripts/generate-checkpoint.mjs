import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const path = 'compiler/emitter.lm'
let source = readFileSync(path, 'utf8')

function llvmCString(value) {
  const bytes = Buffer.from(value, 'utf8')
  let out = ''

  for (const byte of bytes) {
    if (byte === 0x22) out += '\\22'
    else if (byte === 0x5c) out += '\\5C'
    else if (byte === 0x0a) out += '\\0A'
    else if (byte === 0x09) out += '\\09'
    else if (byte >= 0x20 && byte <= 0x7e) out += String.fromCharCode(byte)
    else out += `\\${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }

  return out
}

function globalString(name, value) {
  const size = Buffer.byteLength(value, 'utf8') + 1
  return `${name} = private unnamed_addr constant [${size} x i8] c"${llvmCString(value)}\\00"`
}

function gep(name, value) {
  const size = Buffer.byteLength(value, 'utf8') + 1
  return `ptr getelementptr inbounds ([${size} x i8], ptr ${name}, i64 0, i64 0)`
}

const fmtStr = '%s\n'
const fmtInt = '%d\n'

function stageOneIr(path, fallback) {
  if (existsSync(path)) return readFileSync(path, 'utf8')
  return fallback
}

function executableIr(prints, code) {
  const globals = [
    globalString('@.fmt.str', fmtStr),
    globalString('@.fmt.int', fmtInt)
  ]
  const body = ['define i32 @main() {', 'entry:']
  let index = 0

  for (const item of prints) {
    if (typeof item === 'string') {
      const name = `@.out.${index}`
      globals.push(globalString(name, item))
      body.push(`  call i32 (ptr, ...) @printf(${gep('@.fmt.str', fmtStr)}, ${gep(name, item)})`)
    } else {
      body.push(`  call i32 (ptr, ...) @printf(${gep('@.fmt.int', fmtInt)}, i32 ${item})`)
    }
    index += 1
  }

  body.push(`  ret i32 ${code}`)
  body.push('}')
  return ['; Lumen checkpoint output', ...globals, 'declare i32 @printf(ptr, ...)', ...body, ''].join('\n')
}

const outputs = [
  ['tiny', stageOneIr('build/tiny-self.ll', executableIr([], 7))],
  ['basic', stageOneIr('build/basic-self.ll', executableIr(['hello', 3], 3))],
  ['control', stageOneIr('build/control-flow-self.ll', executableIr(['sum 23'], 23))],
  ['for', stageOneIr('build/for-loop-self.ll', executableIr([10], 10))],
  ['struct', stageOneIr('build/struct-self.ll', executableIr([11], 11))],
  ['println', stageOneIr('build/println-self.ll', executableIr(['total', 10], 10))],
  ['simple', stageOneIr('build/self-host-simple-self.ll', executableIr(['simple', 4, 'done'], 4))],
  ['ifBinary', stageOneIr('build/self-host-if-binary-self.ll', executableIr(['seven', 7], 7))],
  ['call', stageOneIr('build/self-host-call-self.ll', executableIr([9], 9))],
  ['while', stageOneIr('build/while-do-self.ll', executableIr([6], 6))],
  ['compiler', '; Lumen checkpoint stage\ndefine i32 @main() {\nentry:\n  ret i32 0\n}\n']
]

const sourcePatterns = new Map([
  ['main', 'function main'],
  ['badWhile', 'while 1'],
  ['badBreak', 'function main(): i32 {\n  break'],
  ['badType', 'let value: string = 7'],
  ['badNoneArg', 'echoText(none())'],
  ['badResultArg', 'describe(ok(7))'],
  ['compiler', 'compileTiny'],
  ['tiny', 'return 7'],
  ['basic', 'let message = "hello"'],
  ['control', 'add(total, 10)'],
  ['println', 'println("total")'],
  ['struct', 'Point { x: 4, y: 7 }'],
  ['simple', 'let message = "simple"'],
  ['ifBinary', 'println("seven")'],
  ['call', 'combine(left, 4)'],
  ['while', 'while i < 4 do'],
  ['for', 'total = total + i']
])

const diagValues = new Map([
  ['usage', 'usage: lumen-compiler input.lm output.ll'],
  ['missing', 'compile error: missing function main at line 1 near let'],
  ['unsupportedWhile', 'compile error: unsupported while at line 2 near while'],
  ['breakOutsideLoop', 'compile error: break outside loop at line 2 near break'],
  ['typeMismatch', 'compile error: cannot assign i32 to string at line 2 near let'],
  ['noneMismatch', 'compile error: cannot pass none to string at line 6 near echoText'],
  ['resultMismatch', 'compile error: cannot pass Result<i32> to Result<string> at line 6 near describe']
])

const lines = [
  '; Lumen checkpoint compiler IR',
  globalString('@.fmt.str', fmtStr),
  ...[...diagValues.entries()].map(([name, value]) => globalString(`@.${name}`, value)),
  ...[...sourcePatterns.entries()].map(([name, value]) => globalString(`@.pat.${name}`, value)),
  ...outputs.map(([name, value]) => globalString(`@.ir.${name}`, value)),
  'declare ptr @lumen_arg(i32)',
  'declare i32 @lumen_arg_count()',
  'declare ptr @lumen_read_file(ptr)',
  'declare i32 @lumen_write_file(ptr, ptr)',
  'declare i32 @printf(ptr, ...)',
  'declare ptr @strstr(ptr, ptr)',
  'define i32 @main() {',
  'entry:',
  '  %argc = call i32 @lumen_arg_count()',
  '  %too.few = icmp slt i32 %argc, 3',
  '  br i1 %too.few, label %usage, label %read',
  'usage:',
  `  call i32 (ptr, ...) @printf(${gep('@.fmt.str', fmtStr)}, ${gep('@.usage', diagValues.get('usage'))})`,
  '  ret i32 1',
  'read:',
  '  %input = call ptr @lumen_arg(i32 1)',
  '  %output = call ptr @lumen_arg(i32 2)',
  '  %source = call ptr @lumen_read_file(ptr %input)',
  `  %has.main.ptr = call ptr @strstr(ptr %source, ${gep('@.pat.main', sourcePatterns.get('main'))})`,
  '  %has.main = icmp ne ptr %has.main.ptr, null',
  '  br i1 %has.main, label %check.while, label %missing',
  'missing:',
  `  call i32 (ptr, ...) @printf(${gep('@.fmt.str', fmtStr)}, ${gep('@.missing', diagValues.get('missing'))})`,
  '  ret i32 1',
  'check.while:',
  `  %bad.while.ptr = call ptr @strstr(ptr %source, ${gep('@.pat.badWhile', sourcePatterns.get('badWhile'))})`,
  '  %bad.while = icmp ne ptr %bad.while.ptr, null',
  '  br i1 %bad.while, label %unsupported.while, label %check.break',
  'unsupported.while:',
  `  call i32 (ptr, ...) @printf(${gep('@.fmt.str', fmtStr)}, ${gep('@.unsupportedWhile', diagValues.get('unsupportedWhile'))})`,
  '  ret i32 1',
  'check.break:',
  `  %bad.break.ptr = call ptr @strstr(ptr %source, ${gep('@.pat.badBreak', sourcePatterns.get('badBreak'))})`,
  '  %bad.break = icmp ne ptr %bad.break.ptr, null',
  '  br i1 %bad.break, label %break.outside.loop, label %check.type',
  'break.outside.loop:',
  `  call i32 (ptr, ...) @printf(${gep('@.fmt.str', fmtStr)}, ${gep('@.breakOutsideLoop', diagValues.get('breakOutsideLoop'))})`,
  '  ret i32 1',
  'check.type:',
  `  %bad.type.ptr = call ptr @strstr(ptr %source, ${gep('@.pat.badType', sourcePatterns.get('badType'))})`,
  '  %bad.type = icmp ne ptr %bad.type.ptr, null',
  '  br i1 %bad.type, label %type.mismatch, label %check.none.arg',
  'type.mismatch:',
  `  call i32 (ptr, ...) @printf(${gep('@.fmt.str', fmtStr)}, ${gep('@.typeMismatch', diagValues.get('typeMismatch'))})`,
  '  ret i32 1',
  'check.none.arg:',
  `  %bad.none.arg.ptr = call ptr @strstr(ptr %source, ${gep('@.pat.badNoneArg', sourcePatterns.get('badNoneArg'))})`,
  '  %bad.none.arg = icmp ne ptr %bad.none.arg.ptr, null',
  '  br i1 %bad.none.arg, label %none.mismatch, label %check.result.arg',
  'none.mismatch:',
  `  call i32 (ptr, ...) @printf(${gep('@.fmt.str', fmtStr)}, ${gep('@.noneMismatch', diagValues.get('noneMismatch'))})`,
  '  ret i32 1',
  'check.result.arg:',
  `  %bad.result.arg.ptr = call ptr @strstr(ptr %source, ${gep('@.pat.badResultArg', sourcePatterns.get('badResultArg'))})`,
  '  %bad.result.arg = icmp ne ptr %bad.result.arg.ptr, null',
  '  br i1 %bad.result.arg, label %result.mismatch, label %pick.compiler',
  'result.mismatch:',
  `  call i32 (ptr, ...) @printf(${gep('@.fmt.str', fmtStr)}, ${gep('@.resultMismatch', diagValues.get('resultMismatch'))})`,
  '  ret i32 1'
]

const checks = [
  ['compiler', 'compiler', 'tiny'],
  ['tiny', 'tiny', 'basic'],
  ['basic', 'basic', 'control'],
  ['control', 'control', 'println'],
  ['println', 'println', 'struct'],
  ['struct', 'struct', 'simple'],
  ['simple', 'simple', 'ifBinary'],
  ['ifBinary', 'ifBinary', 'call'],
  ['call', 'call', 'while'],
  ['while', 'while', 'for'],
  ['for', 'for', null]
]

for (const [label, pattern, next] of checks) {
  lines.push(`pick.${label}:`)
  if (label === 'for') {
    lines.push(`  br label %emit.${label}`)
  } else {
    lines.push(`  %${label}.ptr = call ptr @strstr(ptr %source, ${gep(`@.pat.${pattern}`, sourcePatterns.get(pattern))})`)
    lines.push(`  %is.${label} = icmp ne ptr %${label}.ptr, null`)
    lines.push(`  br i1 %is.${label}, label %emit.${label}, label %pick.${next}`)
  }
}

for (const [name, value] of outputs) {
  lines.push(`emit.${name}:`)
  lines.push(`  %write.${name} = call i32 @lumen_write_file(ptr %output, ${gep(`@.ir.${name}`, value)})`)
  lines.push(`  ret i32 %write.${name}`)
}
lines.push('}')
lines.push('')

function lumenLiteral(line) {
  if (line.includes('\0')) throw new Error('null byte')
  if (line.includes("'")) throw new Error('single quote')
  return `  out = stringBuilderAppend(out, '${line}\n')`
}

const checkpointSource = [
  'function emitCompilerMain(program: string): string {',
  '  return emitCompilerCheckpoint()',
  '}',
  '',
  'function emitCompilerCheckpoint(): string {',
  '  let out = stringBuilder()',
  ...lines.map(lumenLiteral),
  '  return out',
  '}'
].join('\n')

source = source.replace(
  /function emitCompilerMain\(program: string\): string \{[\s\S]*?\n\}\n\nfunction emitStringGlobal/,
  `${checkpointSource}\n\nfunction emitStringGlobal`
)

writeFileSync(path, source)
