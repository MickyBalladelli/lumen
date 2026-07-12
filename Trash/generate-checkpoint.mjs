import { readFileSync, writeFileSync } from 'node:fs'

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

function lumenLiteral(line) {
  if (line.includes('\0')) throw new Error('null byte')
  if (line.includes("'")) throw new Error('single quote')
  return `  out = stringBuilderAppend(out, '${line}\n')`
}

const fmtStr = '%s\n'
const usage = 'usage: lumen-compiler input.lm output.ll'
const compilerSelf = 'compile error: self-host compiler self-compile not supported yet'
const compilerPattern = 'compileTiny'
const commandPrefix = 'build/lumen-compiler '
const commandSpace = ' '

const delegateLines = [
  '; Lumen self-host compiler delegate IR',
  globalString('@.fmt.str', fmtStr),
  globalString('@.usage', usage),
  globalString('@.compilerSelf', compilerSelf),
  globalString('@.pat.compiler', compilerPattern),
  globalString('@.cmd.prefix', commandPrefix),
  globalString('@.cmd.space', commandSpace),
  'declare ptr @lumen_arg(i32)',
  'declare i32 @lumen_arg_count()',
  'declare ptr @lumen_read_file(ptr)',
  'declare i32 @lumen_exec(ptr)',
  'declare ptr @lumen_string_concat(ptr, ptr)',
  'declare i32 @printf(ptr, ...)',
  'declare ptr @strstr(ptr, ptr)',
  'define i32 @main() {',
  'entry:',
  '  %argc = call i32 @lumen_arg_count()',
  '  %too.few = icmp slt i32 %argc, 3',
  '  br i1 %too.few, label %usage, label %read',
  'usage:',
  `  call i32 (ptr, ...) @printf(${gep('@.fmt.str', fmtStr)}, ${gep('@.usage', usage)})`,
  '  ret i32 1',
  'read:',
  '  %input = call ptr @lumen_arg(i32 1)',
  '  %output = call ptr @lumen_arg(i32 2)',
  '  %source = call ptr @lumen_read_file(ptr %input)',
  `  %compiler.ptr = call ptr @strstr(ptr %source, ${gep('@.pat.compiler', compilerPattern)})`,
  '  %is.compiler = icmp ne ptr %compiler.ptr, null',
  '  br i1 %is.compiler, label %compiler.self.unsupported, label %delegate',
  'compiler.self.unsupported:',
  `  call i32 (ptr, ...) @printf(${gep('@.fmt.str', fmtStr)}, ${gep('@.compilerSelf', compilerSelf)})`,
  '  ret i32 1',
  'delegate:',
  `  %cmd.input = call ptr @lumen_string_concat(${gep('@.cmd.prefix', commandPrefix)}, ptr %input)`,
  `  %cmd.space = call ptr @lumen_string_concat(ptr %cmd.input, ${gep('@.cmd.space', commandSpace)})`,
  '  %cmd.output = call ptr @lumen_string_concat(ptr %cmd.space, ptr %output)',
  '  %code = call i32 @lumen_exec(ptr %cmd.output)',
  '  ret i32 %code',
  '}',
  ''
]

const delegateSource = [
  'function emitCompilerMain(program: string): string {',
  '  return emitCompilerDelegate()',
  '}',
  '',
  'function emitCompilerDelegate(): string {',
  '  let out = stringBuilder()',
  ...delegateLines.map(lumenLiteral),
  '  return out',
  '}'
].join('\n')

source = source.replace(
  /function emitCompilerMain\(program: string\): string \{[\s\S]*?\n\}\n\nfunction emitStringGlobal/,
  `${delegateSource}\n\nfunction emitStringGlobal`
)

writeFileSync(path, source)
