import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import { Compiler } from '../compiler/Compiler.js'
import { formatSource } from '../formatter/Formatter.js'
import { green } from './TerminalStyle.js'

const examplesDir = 'examples'
const negativeDir = 'tests/negative'
const outputDir = 'build'
const compiler = new Compiler()
const dataText = await readFile(join(examplesDir, 'data.txt'), 'utf8')
const compileOnly = new Set([
  'http-api',
  'http-files',
  'http-server',
  'socket-chat'
])

const expectations = new Map([
  ['advanced-foundation', {
    stdout: '12\nhello lumen\nhi compiler\n1\n',
    code: 12
  }],
  ['array', {
    stdout: '16\n',
    code: 16
  }],
  ['array-helpers', {
    stdout: '12\n3\n5\nlumen,native,chat\n',
    code: 12
  }],
  ['async-foundation', {
    stdout: '4\n',
    code: 4
  }],
  ['async-cancellation', {
    stdout: 'task cancelled\n',
    code: 0
  }],
  ['async-error', {
    stdout: 'boom\n',
    code: 0
  }],
  ['basic', {
    stdout: 'hello\n3\n',
    code: 3
  }],
  ['bootstrap-compiler', {
    stdout: '14\nfunction\nfunctions=1 lets=1\n  let value = 1\n      ^\n',
    code: 0
  }],
  ['bootstrap-containers', {
    stdout: 'hello compiler\n2\nparser\ni32\n1\n',
    code: 2
  }],
  ['bootstrap-exec', {
    stdout: '0\n',
    code: 0
  }],
  ['bootstrap-io', {
    stdout: '0\nlumen can write files\n',
    code: 0
  }],
  ['for-loop', {
    stdout: '10\n',
    code: 10
  }],
  ['crypto', {
    stdout: '1\nhello lumen\nhello lumen\n',
    code: 0
  }],
  ['cli-args', {
    stdout: '1\n3\n',
    code: 0
  }],
  ['control-flow', {
    stdout: 'sum 23\n',
    code: 23
  }],
  ['do-until', {
    stdout: '10\n',
    code: 10
  }],
  ['env', {
    stdout: 'from-env\nfrom-dotenv\nvariable not found\n1\n1\n',
    code: 0
  }],
  ['empty-array', {
    stdout: '0\n0\n',
    code: 0
  }],
  ['extern', {
    stdout: 'hello extern\n',
    code: 0
  }],
  ['error-type', {
    stdout: '7\ndisk locked\ndisk locked\n',
    code: 7
  }],
  ['for-of', {
    stdout: '26\n',
    code: 26
  }],
  ['library-features', {
    stdout: 'lumen\n1\n1\nbroken\n1\npresent\n0\nfallback\n',
    code: 0
  }],
  ['fs', {
    stdout: `${dataText}\n1\n`,
    code: 0
  }],
  ['http-helpers', {
    stdout: '1\n1\n',
    code: 0
  }],
  ['json', {
    stdout: 'lumen\n3\ntrue\n',
    code: 0
  }],
  ['json-tools', {
    stdout: 'lumen\n{"name":"lumen"}\ntwo\n3\n"hello \\"lumen\\""\n"hi"\n1\n0\nmicky\n',
    code: 0
  }],
  ['native-main', {
    stdout: '10\n',
    code: 10
  }],
  ['module-app', {
    stdout: '12\n',
    code: 12
  }],
  ['newline-continuation', {
    stdout: '6\n',
    code: 6
  }],
  ['numbers', {
    stdout: '10000000032\n3.750000\n1\n',
    code: 0
  }],
  ['patterns', {
    stdout: 'missing\nume\n6\ncleanup\n',
    code: 6
  }],
  ['photon-auth', {
    stdout: 'missing GOOGLE_CLIENT_ID\n',
    code: 0
  }],
  ['photon-packages', {
    stdout: 'fallback\nvariable not found\n1\nurl package does not encode yet\n1\nemail must look like email\nlocal\nGET /health\n1\n1\n1\n1\njwt-lite does not verify signatures yet\nok string\nok number\n',
    code: 0
  }],
  ['photon-more-packages', {
    stdout: 'bad empty\nvalue\n0\n1\n1\n1\nhi lumen\nfallback-arg\n0\n1\n1\n1\n{"ok":true}\n1\nfallback-map\nfirst\n1\n1\n',
    code: 0
  }],
  ['photon-new-packages', {
    stdout: '10\n1\nlumen\n1\n{"method":"GET","path":"/health","body":}\n{"method":"POST","path":"/items","body":{"name":"lumen"}}\nfallback\n1\nbuild/report.txt\narg-fallback\n0\n1\n1\n1\n1\nname: lumen\na,b,c\nlumen\n1\nGET /health\n1\n<strong>lumen</strong>\n<a href="/">home</a>\nhello-lumen\n1\nok cache\nok json\nok slug\n',
    code: 0
  }],
  ['println', {
    stdout: 'total\n10\n',
    code: 10
  }],
  ['result-option-tools', {
    stdout: 'ok\nbroken\nfine\nfallback\nnice fine\nnext\nhi flow\nempty\n42\n10\nflow\n',
    code: 0
  }],
  ['self-host-parser', {
    stdout: '7\n3\nlet\nnumber\nprintln\nidentifier\nreturn\nidentifier\n1\nIRModule\n3\n1\n7\nlet\nnumber\nIRModule\n1\n1\n1\n1\n1\n1\n1\n1\n1\n1\n1\n1\n1\n5\n1\n7\n0\ncompile error: break outside loop\n0\ncompile error: cannot assign i32 to string\n',
    code: 0
  }],
  ['self-host-if-binary', {
    stdout: 'seven\n7\n',
    code: 7
  }],
  ['self-host-call', {
    stdout: '9\n',
    code: 9
  }],
  ['self-host-array', {
    stdout: '7\n',
    code: 7
  }],
  ['self-host-async', {
    stdout: '4\n',
    code: 4
  }],
  ['self-host-enum-match', {
    stdout: 'missing\n',
    code: 7
  }],
  ['self-host-simple', {
    stdout: 'simple\n4\ndone\n',
    code: 4
  }],
  ['self-host-struct-generic', {
    stdout: '11\n',
    code: 11
  }],
  ['self-host-switch', {
    stdout: '20\n',
    code: 20
  }],
  ['self-host-try-catch', {
    stdout: 'boom\n7\n',
    code: 7
  }],
  ['self-host-control', {
    stdout: '23\nsum 23\n1\n',
    code: 0
  }],
  ['self-host-tokenizer', {
    stdout: '10\nidentifier:function\nidentifier:main\nnumber:7\n',
    code: 0
  }],
  ['struct', {
    stdout: '11\n',
    code: 11
  }],
  ['string-tools', {
    stdout: 'Hello Lumen\nhello lumen\nHELLO LUMEN\n1\n1\nhello compiler\n6\n8\n1\nhahaha\n007\nx..\n3\ngreen\n7\n2.500000\n',
    code: 7
  }],
  ['system', {
    stdout: '5\n1\n0\n1\n0\n1\n1\n4\n9\n3\n4\n5\n12\n',
    code: 12
  }],
  ['switch', {
    stdout: '23\n',
    code: 23
  }],
  ['socket-helpers', {
    stdout: '1\n',
    code: 0
  }],
  ['thread', {
    stdout: '1\n1\n1\n',
    code: 0
  }],
  ['try-catch', {
    stdout: 'boom\n7\n',
    code: 7
  }],
  ['while-do', {
    stdout: '6\n',
    code: 6
  }]
])

const files = (await readdir(examplesDir))
  .filter(file => file.endsWith('.lm'))
  .sort()

let failures = 0

const formatterCases = [
  ['indent blocks', 'function main(): i32 {\nprintln("x")\nreturn 0\n}\n', 'function main(): i32 {\n  println("x")\n  return 0\n}\n'],
  ['compact else', 'function main(): i32 {\nif true {\nprintln("yes")\n}\nelse {\nprintln("no")\n}\nreturn 0\n}\n', 'function main(): i32 {\n  if true {\n    println("yes")\n  } else {\n    println("no")\n  }\n  return 0\n}\n'],
  ['keep for semicolons', 'function main(): i32 {\nfor (let i: i32 = 0; i < 3; i++) {\nprintln(i)\n}\nreturn 0\n}\n', 'function main(): i32 {\n  for (let i: i32 = 0; i < 3; i++) {\n    println(i)\n  }\n  return 0\n}\n']
]

for (const [name, source, expected] of formatterCases) {
  const formatted = formatSource(source)
  const reformatted = formatSource(formatted)

  if (formatted !== expected || reformatted !== expected) {
    failures += 1
    console.error(`failed formatter ${name}`)
    console.error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(formatted)}`)
  } else {
    console.log(green(`ok formatter ${name}`))
  }
}

for (const file of files) {
  const name = basename(file, '.lm')
  const inputPath = join(examplesDir, file)
  const llvmPath = join(outputDir, `${name}.ll`)
  const executablePath = join(outputDir, name)
  await compiler.writeLLVMFile(inputPath, llvmPath)
  await compiler.buildExecutable(llvmPath, executablePath)

  if (name === 'thread') {
    await unlink(join(outputDir, 'thread-output.txt')).catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
  }

  if (compileOnly.has(name)) {
    console.log(green(`ok ${name} compile`))
    continue
  }

  const args = name === 'cli-args' ? ['first', 'second'] : []
  const result = await runExecutable(executablePath, args, {
    LUMEN_DOTENV_PATH: join(examplesDir, '.env.test'),
    LUMEN_TEST_ENV: 'from-env'
  })
  const expected = expectations.get(name)

  if (!expected) {
    failures += 1
    console.error(`missing expectation for ${name}`)
    continue
  }

  if (result.stdout !== expected.stdout || result.code !== expected.code) {
    failures += 1
    console.error(`failed ${name}`)
    console.error(`expected code ${expected.code}, got ${result.code}`)
    console.error(`expected stdout ${JSON.stringify(expected.stdout)}, got ${JSON.stringify(result.stdout)}`)
    continue
  }

  console.log(green(`ok ${name}`))
}

if (failures > 0) {
  console.error(`${failures} example test failed`)
  process.exit(1)
}

console.log(`${files.length} example tests passed`)

const lmsh = await runCommand('node', [
  join('src', 'cli', 'lmsh.js'),
  join(examplesDir, 'cli-args.lm'),
  'first',
  'second'
], {
  LUMEN_DOTENV_PATH: join(examplesDir, '.env.test'),
  LUMEN_TEST_ENV: 'from-env'
})

if (lmsh.stdout !== '1\n3\n' || lmsh.code !== 0) {
  failures += 1
  console.error('failed lmsh executable runner')
} else {
  console.log(green('ok lmsh executable runner'))
}

const lumenRun = await runCommand('node', [
  join('src', 'cli', 'lumen.js'),
  'run',
  join(examplesDir, 'cli-args.lm'),
  '-o',
  join(outputDir, 'lumen-command-cli-args'),
  '--',
  'first',
  'second'
], {
  LUMEN_DOTENV_PATH: join(examplesDir, '.env.test'),
  LUMEN_TEST_ENV: 'from-env'
})

if (lumenRun.stdout !== '1\n3\n' || lumenRun.code !== 0) {
  failures += 1
  console.error('failed lumen run workflow')
} else {
  console.log(green('ok lumen run workflow'))
}

const lumenEmitPath = join(outputDir, 'lumen-command-basic.ll')
const lumenEmit = await runCommand('node', [
  join('src', 'cli', 'lumen.js'),
  'emit',
  join(examplesDir, 'basic.lm'),
  '-o',
  lumenEmitPath
])
const lumenLLVM = lumenEmit.code === 0
  ? await readFile(lumenEmitPath, 'utf8')
  : ''

if (lumenEmit.code !== 0 || !lumenLLVM.includes('define i32 @main')) {
  failures += 1
  console.error('failed lumen emit workflow')
} else {
  console.log(green('ok lumen emit workflow'))
}

const hostileDirectory = join(outputDir, 'path with spaces;$(not-run)')
const hostileSource = join(hostileDirectory, "basic source 'quoted'.lm")
const hostileLLVM = join(hostileDirectory, 'basic output;safe.ll')
const hostileExecutable = join(hostileDirectory, 'basic app;safe')
await mkdir(hostileDirectory, { recursive: true })
await writeFile(hostileSource, await readFile(join(examplesDir, 'basic.lm'), 'utf8'))
await compiler.writeLLVMFile(hostileSource, hostileLLVM)
await compiler.buildExecutable(hostileLLVM, hostileExecutable)
const hostileResult = await runExecutable(hostileExecutable)

if (hostileResult.stdout !== 'hello\n3\n' || hostileResult.code !== 3) {
  failures += 1
  console.error('failed argv-safe compiler paths')
} else {
  console.log(green('ok argv-safe compiler paths'))
}

await compiler.writeLLVMFile('compiler/main.lm', join(outputDir, 'lumen-compiler.ll'))
await compiler.buildExecutable(join(outputDir, 'lumen-compiler.ll'), join(outputDir, 'lumen-compiler'))
if (await hasSelfFallbackSymbols(join(outputDir, 'lumen-compiler'))) {
  failures += 1
  console.error('failed stage-1 compiler fallback symbol check')
} else {
  console.log(green('ok stage-1 compiler has no C fallback symbols'))
}

const bootstrapCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
  join('tests', 'bootstrap', 'tiny.lm'),
  join(outputDir, 'tiny-self.ll')
])

if (bootstrapCompile.code !== 0) {
  failures += 1
  console.error(`failed bootstrap compiler with code ${bootstrapCompile.code}`)
} else {
  await compiler.buildExecutable(join(outputDir, 'tiny-self.ll'), join(outputDir, 'tiny-self'))
  const tiny = await runExecutable(join(outputDir, 'tiny-self'))

  if (tiny.code !== 7) {
    failures += 1
    console.error(`failed bootstrap tiny executable, got ${tiny.code}`)
  } else {
    console.log(green('ok bootstrap self-host tiny'))
  }

  const basicCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'basic.lm'),
    join(outputDir, 'basic-self.ll')
  ])

  if (basicCompile.code !== 0) {
    failures += 1
    console.error(`failed bootstrap basic compiler with code ${basicCompile.code}`)
  } else {
    await compiler.buildExecutable(join(outputDir, 'basic-self.ll'), join(outputDir, 'basic-self'))
    const basic = await runExecutable(join(outputDir, 'basic-self'))

    if (basic.stdout !== 'hello\n3\n' || basic.code !== 3) {
      failures += 1
      console.error(`failed bootstrap basic executable, got code ${basic.code} stdout ${JSON.stringify(basic.stdout)}`)
    } else {
      console.log(green('ok bootstrap self-host basic'))
    }
  }

  const controlCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'control-flow.lm'),
    join(outputDir, 'control-flow-self.ll')
  ])

  if (controlCompile.code !== 0) {
    failures += 1
    console.error(`failed bootstrap control compiler with code ${controlCompile.code}`)
  } else {
    await compiler.buildExecutable(join(outputDir, 'control-flow-self.ll'), join(outputDir, 'control-flow-self'))
    const control = await runExecutable(join(outputDir, 'control-flow-self'))

    if (control.stdout !== 'sum 23\n' || control.code !== 23) {
      failures += 1
      console.error(`failed bootstrap control executable, got code ${control.code} stdout ${JSON.stringify(control.stdout)}`)
    } else {
      console.log(green('ok bootstrap self-host control-flow'))
    }
  }

  const forLoopCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'for-loop.lm'),
    join(outputDir, 'for-loop-self.ll')
  ])
  const nativeMainCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'native-main.lm'),
    join(outputDir, 'native-main-self.ll')
  ])
  const printlnCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'println.lm'),
    join(outputDir, 'println-self.ll')
  ])
  const structCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'struct.lm'),
    join(outputDir, 'struct-self.ll')
  ])
  const moduleCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'module-app.lm'),
    join(outputDir, 'module-app-self.ll')
  ])
  const genericStructCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'self-host-struct-generic.lm'),
    join(outputDir, 'self-host-struct-generic-self.ll')
  ])
  const arrayCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'self-host-array.lm'),
    join(outputDir, 'self-host-array-self.ll')
  ])
  const asyncCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'self-host-async.lm'),
    join(outputDir, 'self-host-async-self.ll')
  ])
  const enumMatchCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'self-host-enum-match.lm'),
    join(outputDir, 'self-host-enum-match-self.ll')
  ])
  const switchCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'self-host-switch.lm'),
    join(outputDir, 'self-host-switch-self.ll')
  ])
  const tryCatchCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'self-host-try-catch.lm'),
    join(outputDir, 'self-host-try-catch-self.ll')
  ])
  const simpleCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'self-host-simple.lm'),
    join(outputDir, 'self-host-simple-self.ll')
  ])
  const ifBinaryCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'self-host-if-binary.lm'),
    join(outputDir, 'self-host-if-binary-self.ll')
  ])
  const callCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'self-host-call.lm'),
    join(outputDir, 'self-host-call-self.ll')
  ])

  if (forLoopCompile.code !== 0 || nativeMainCompile.code !== 0 || printlnCompile.code !== 0 || structCompile.code !== 0 || moduleCompile.code !== 0 || genericStructCompile.code !== 0 || arrayCompile.code !== 0 || asyncCompile.code !== 0 || enumMatchCompile.code !== 0 || switchCompile.code !== 0 || tryCatchCompile.code !== 0 || simpleCompile.code !== 0 || ifBinaryCompile.code !== 0 || callCompile.code !== 0) {
    failures += 1
    console.error('failed bootstrap loop compiler output')
  } else {
    await compiler.buildExecutable(join(outputDir, 'for-loop-self.ll'), join(outputDir, 'for-loop-self'))
    await compiler.buildExecutable(join(outputDir, 'native-main-self.ll'), join(outputDir, 'native-main-self'))
    await compiler.buildExecutable(join(outputDir, 'println-self.ll'), join(outputDir, 'println-self'))
    await compiler.buildExecutable(join(outputDir, 'struct-self.ll'), join(outputDir, 'struct-self'))
    await compiler.buildExecutable(join(outputDir, 'module-app-self.ll'), join(outputDir, 'module-app-self'))
    await compiler.buildExecutable(join(outputDir, 'self-host-struct-generic-self.ll'), join(outputDir, 'self-host-struct-generic-self'))
    await compiler.buildExecutable(join(outputDir, 'self-host-array-self.ll'), join(outputDir, 'self-host-array-self'))
    await compiler.buildExecutable(join(outputDir, 'self-host-async-self.ll'), join(outputDir, 'self-host-async-self'))
    await compiler.buildExecutable(join(outputDir, 'self-host-enum-match-self.ll'), join(outputDir, 'self-host-enum-match-self'))
    await compiler.buildExecutable(join(outputDir, 'self-host-switch-self.ll'), join(outputDir, 'self-host-switch-self'))
    await compiler.buildExecutable(join(outputDir, 'self-host-try-catch-self.ll'), join(outputDir, 'self-host-try-catch-self'))
    await compiler.buildExecutable(join(outputDir, 'self-host-simple-self.ll'), join(outputDir, 'self-host-simple-self'))
    await compiler.buildExecutable(join(outputDir, 'self-host-if-binary-self.ll'), join(outputDir, 'self-host-if-binary-self'))
    await compiler.buildExecutable(join(outputDir, 'self-host-call-self.ll'), join(outputDir, 'self-host-call-self'))
    const forLoop = await runExecutable(join(outputDir, 'for-loop-self'))
    const nativeMain = await runExecutable(join(outputDir, 'native-main-self'))
    const println = await runExecutable(join(outputDir, 'println-self'))
    const struct = await runExecutable(join(outputDir, 'struct-self'))
    const moduleApp = await runExecutable(join(outputDir, 'module-app-self'))
    const genericStruct = await runExecutable(join(outputDir, 'self-host-struct-generic-self'))
    const array = await runExecutable(join(outputDir, 'self-host-array-self'))
    const asyncExample = await runExecutable(join(outputDir, 'self-host-async-self'))
    const enumMatch = await runExecutable(join(outputDir, 'self-host-enum-match-self'))
    const switchExample = await runExecutable(join(outputDir, 'self-host-switch-self'))
    const tryCatch = await runExecutable(join(outputDir, 'self-host-try-catch-self'))
    const simple = await runExecutable(join(outputDir, 'self-host-simple-self'))
    const ifBinary = await runExecutable(join(outputDir, 'self-host-if-binary-self'))
    const call = await runExecutable(join(outputDir, 'self-host-call-self'))

    if (forLoop.stdout !== '10\n' || forLoop.code !== 10 ||
      nativeMain.stdout !== '10\n' || nativeMain.code !== 10 ||
      println.stdout !== 'total\n10\n' || println.code !== 10 ||
      struct.stdout !== '11\n' || struct.code !== 11 ||
      moduleApp.stdout !== '12\n' || moduleApp.code !== 12 ||
      genericStruct.stdout !== '11\n' || genericStruct.code !== 11 ||
      array.stdout !== '7\n' || array.code !== 7 ||
      asyncExample.stdout !== '4\n' || asyncExample.code !== 4 ||
      enumMatch.stdout !== 'missing\n' || enumMatch.code !== 7 ||
      switchExample.stdout !== '20\n' || switchExample.code !== 20 ||
      tryCatch.stdout !== 'boom\n7\n' || tryCatch.code !== 7 ||
      simple.stdout !== 'simple\n4\ndone\n' || simple.code !== 4 ||
      ifBinary.stdout !== 'seven\n7\n' || ifBinary.code !== 7 ||
      call.stdout !== '9\n' || call.code !== 9) {
      failures += 1
      console.error('failed bootstrap loop executable behavior')
    } else {
      console.log(green('ok bootstrap self-host simple/call/if/loop/println/struct examples'))
    }
  }

  const invalidCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join('tests', 'bootstrap', 'invalid.lm'),
    join(outputDir, 'invalid-self.ll')
  ])
  if (invalidCompile.code === 0 || invalidCompile.stdout !== 'compile error: missing function main at line 1 near let\n') {
    failures += 1
    console.error('failed bootstrap invalid source rejection')
  } else {
    console.log(green('ok bootstrap invalid source rejection'))
  }

  const whileCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join(examplesDir, 'while-do.lm'),
    join(outputDir, 'while-do-self.ll')
  ])

  if (whileCompile.code !== 0) {
    failures += 1
    console.error('failed bootstrap while compiler output')
  } else {
    await compiler.buildExecutable(join(outputDir, 'while-do-self.ll'), join(outputDir, 'while-do-self'))
    const whileDo = await runExecutable(join(outputDir, 'while-do-self'))

    if (whileDo.stdout !== '6\n' || whileDo.code !== 6) {
      failures += 1
      console.error('failed bootstrap while executable behavior')
    } else {
      console.log(green('ok bootstrap self-host while'))
    }
  }

  const unsupportedCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join('tests', 'bootstrap', 'unsupported-while.lm'),
    join(outputDir, 'unsupported-while-self.ll')
  ])
  if (unsupportedCompile.code === 0 || unsupportedCompile.stdout !== 'compile error: unsupported while at line 2 near while\n') {
    failures += 1
    console.error('failed bootstrap unsupported while diagnostic')
  } else {
    console.log(green('ok bootstrap unsupported while diagnostic'))
  }

  const breakCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join('tests', 'negative', 'break-outside-loop.lm'),
    join(outputDir, 'break-outside-loop-self.ll')
  ])
  if (breakCompile.code === 0 || breakCompile.stdout !== 'compile error: break outside loop at line 2 near break\n') {
    failures += 1
    console.error('failed bootstrap break semantic diagnostic')
  } else {
    console.log(green('ok bootstrap break semantic diagnostic'))
  }

  const typeMismatchCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join('tests', 'bootstrap', 'type-mismatch.lm'),
    join(outputDir, 'type-mismatch-self.ll')
  ])
  if (typeMismatchCompile.code === 0 || typeMismatchCompile.stdout !== 'compile error: cannot assign i32 to string at line 2 near let\n') {
    failures += 1
    console.error('failed bootstrap type diagnostic')
  } else {
    console.log(green('ok bootstrap type diagnostic'))
  }

  const noneToStringCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join('tests', 'negative', 'none-to-string.lm'),
    join(outputDir, 'none-to-string-self.ll')
  ])
  const resultMismatchCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join('tests', 'negative', 'result-type-mismatch.lm'),
    join(outputDir, 'result-type-mismatch-self.ll')
  ])
  if (noneToStringCompile.code === 0 || noneToStringCompile.stdout !== 'compile error: cannot pass none to string at line 6 near echoText\n' ||
    resultMismatchCompile.code === 0 || resultMismatchCompile.stdout !== 'compile error: cannot pass Result<i32> to Result<string> at line 6 near describe\n') {
    failures += 1
    console.error('failed bootstrap function-call type diagnostics')
  } else {
    console.log(green('ok bootstrap function-call type diagnostics'))
  }

  const extraDiagnostics = [
    [join('tests', 'negative', 'duplicate-parameter.lm'), 'duplicate-parameter', 'compile error: duplicate parameter value at line 1 near value\n'],
    [join('tests', 'negative', 'return-type-mismatch.lm'), 'return-type-mismatch', 'compile error: return type i32 does not match string at line 2 near return\n'],
    [join('tests', 'bootstrap', 'assignment-type-mismatch.lm'), 'assignment-type-mismatch', 'compile error: cannot assign i32 to string at line 3 near value\n'],
    [join('tests', 'negative', 'throw-type-mismatch.lm'), 'throw-type-mismatch', 'compile error: throw expects string or error, got i32 at line 2 near throw\n'],
    [join('tests', 'negative', 'for-of-non-array.lm'), 'for-of-non-array', 'compile error: for-of needs an array at line 3 near of\n'],
    [join('tests', 'negative', 'switch-case-mismatch.lm'), 'switch-case-mismatch', 'compile error: cannot compare switch i32 with case string at line 4 near case\n']
  ]

  for (const [file, outputName, stdout] of extraDiagnostics) {
    const result = await runExecutable(join(outputDir, 'lumen-compiler'), [
      file,
      join(outputDir, `${outputName}-self.ll`)
    ])

    if (result.code === 0 || result.stdout !== stdout) {
      failures += 1
      console.error(`failed bootstrap expanded diagnostic ${outputName}`)
    }
  }

  const compilerSeedPath = join(outputDir, 'lumen-compiler.ll')
  const hiddenCompilerSeedPath = join(outputDir, 'lumen-compiler.seed-hidden.ll')
  await rename(compilerSeedPath, hiddenCompilerSeedPath)
  let compilerSelfCompile
  try {
    compilerSelfCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
      join('compiler', 'main.lm'),
      join(outputDir, 'lumen-compiler-self.ll')
    ], {}, {
      progressLabel: 'building bootstrap stage-2 compiler'
    })
  } finally {
    await rename(hiddenCompilerSeedPath, compilerSeedPath).catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
  }

  if (compilerSelfCompile.code !== 0) {
    failures += 1
    console.error(`failed bootstrap compiler self compile with code ${compilerSelfCompile.code}`)
  } else {
    await compiler.buildExecutable(join(outputDir, 'lumen-compiler-self.ll'), join(outputDir, 'lumen-compiler-self'))
    if (await hasSelfFallbackSymbols(join(outputDir, 'lumen-compiler-self'))) {
      failures += 1
      console.error('failed stage-2 compiler fallback symbol check')
    } else {
      console.log(green('ok stage-2 compiler has no C fallback symbols'))
    }

    const stageOneCompilerPath = join(outputDir, 'lumen-compiler')
    const hiddenStageOneCompilerPath = join(outputDir, 'lumen-compiler.stage-one-hidden')
    await rename(stageOneCompilerPath, hiddenStageOneCompilerPath)
    let selfBasicCompile
    try {
      selfBasicCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
        join(examplesDir, 'basic.lm'),
        join(outputDir, 'basic-self2.ll')
      ])
    } finally {
      await rename(hiddenStageOneCompilerPath, stageOneCompilerPath)
    }
    const renamedBasicPath = join(outputDir, "renamed bootstrap;source 'safe'.lm")
    await writeFile(renamedBasicPath, await readFile(join(examplesDir, 'basic.lm'), 'utf8'))
    const selfRenamedBasicCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      renamedBasicPath,
      join(outputDir, 'renamed basic;self2.ll')
    ])
    const selfControlCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join(examplesDir, 'control-flow.lm'),
      join(outputDir, 'control-flow-self2.ll')
    ])
    const selfForLoopCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join(examplesDir, 'for-loop.lm'),
      join(outputDir, 'for-loop-self2.ll')
    ])
    const selfNativeMainCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join(examplesDir, 'native-main.lm'),
      join(outputDir, 'native-main-self2.ll')
    ])
    const selfPrintlnCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join(examplesDir, 'println.lm'),
      join(outputDir, 'println-self2.ll')
    ])
    const selfStructCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join(examplesDir, 'struct.lm'),
      join(outputDir, 'struct-self2.ll')
    ])
    const selfSimpleCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join(examplesDir, 'self-host-simple.lm'),
      join(outputDir, 'self-host-simple-self2.ll')
    ])
    const selfIfBinaryCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join(examplesDir, 'self-host-if-binary.lm'),
      join(outputDir, 'self-host-if-binary-self2.ll')
    ])
    const selfCallCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join(examplesDir, 'self-host-call.lm'),
      join(outputDir, 'self-host-call-self2.ll')
    ])
    const selfCompilerCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join('compiler', 'main.lm'),
      join(outputDir, 'lumen-compiler-self2.ll')
    ], {}, {
      progressLabel: 'building bootstrap stage-3 compiler'
    })
    const selfTinyCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join('tests', 'bootstrap', 'tiny.lm'),
      join(outputDir, 'tiny-self2.ll')
    ])

    if (selfCompilerCompile.code !== 0) {
      failures += 1
      console.error('failed stage-2 compiler building stage-3')
    } else {
      const stageTwoCompilerOutput = await readFile(join(outputDir, 'lumen-compiler-self.ll'), 'utf8')
      const stageThreeCompilerOutput = await readFile(join(outputDir, 'lumen-compiler-self2.ll'), 'utf8')

      if (stageTwoCompilerOutput !== stageThreeCompilerOutput) {
        failures += 1
        console.error('failed bootstrap compiler stage-2/stage-3 equality')
      } else if (hasCompilerDelegation(stageThreeCompilerOutput)) {
        failures += 1
        console.error('failed stage-3 compiler delegation check')
      } else {
        await compiler.buildExecutable(
          join(outputDir, 'lumen-compiler-self2.ll'),
          join(outputDir, 'lumen-compiler-self2')
        )

        if (await hasSelfFallbackSymbols(join(outputDir, 'lumen-compiler-self2'))) {
          failures += 1
          console.error('failed stage-3 compiler fallback symbol check')
        } else {
          const stageThreeTinyCompile = await runExecutable(join(outputDir, 'lumen-compiler-self2'), [
            join('tests', 'bootstrap', 'tiny.lm'),
            join(outputDir, 'tiny-self3.ll')
          ])
          const stageTwoTinyOutput = selfTinyCompile.code === 0
            ? await readFile(join(outputDir, 'tiny-self2.ll'), 'utf8')
            : ''
          const stageThreeTinyOutput = stageThreeTinyCompile.code === 0
            ? await readFile(join(outputDir, 'tiny-self3.ll'), 'utf8')
            : ''

          if (selfTinyCompile.code !== 0 ||
            stageThreeTinyCompile.code !== 0 ||
            stageTwoTinyOutput !== stageThreeTinyOutput) {
            failures += 1
            console.error('failed stage-3 compiler output')
          } else {
            console.log(green('ok bootstrap compiler stage-2/stage-3 equality'))
          }
        }
      }
    }

    if (selfBasicCompile.code !== 0 || selfRenamedBasicCompile.code !== 0 || selfControlCompile.code !== 0 || selfForLoopCompile.code !== 0 || selfNativeMainCompile.code !== 0 || selfPrintlnCompile.code !== 0 || selfStructCompile.code !== 0 || selfSimpleCompile.code !== 0 || selfIfBinaryCompile.code !== 0 || selfCallCompile.code !== 0 || selfTinyCompile.code !== 0) {
      failures += 1
      console.error('failed second-stage compiler output')
    } else {
      const equalStageOutputs = [
        ['tiny', 'tiny-self.ll', 'tiny-self2.ll'],
        ['basic', 'basic-self.ll', 'basic-self2.ll'],
        ['renamed basic', 'basic-self.ll', 'renamed basic;self2.ll'],
        ['control-flow', 'control-flow-self.ll', 'control-flow-self2.ll'],
        ['for-loop', 'for-loop-self.ll', 'for-loop-self2.ll'],
        ['native-main', 'native-main-self.ll', 'native-main-self2.ll'],
        ['println', 'println-self.ll', 'println-self2.ll'],
        ['struct', 'struct-self.ll', 'struct-self2.ll'],
        ['self-host-simple', 'self-host-simple-self.ll', 'self-host-simple-self2.ll'],
        ['self-host-if-binary', 'self-host-if-binary-self.ll', 'self-host-if-binary-self2.ll'],
        ['self-host-call', 'self-host-call-self.ll', 'self-host-call-self2.ll']
      ]
      let equalityFailed = false

      for (const [name, stageOne, stageTwo] of equalStageOutputs) {
        const stageOneOutput = await readFile(join(outputDir, stageOne), 'utf8')
        const stageTwoOutput = await readFile(join(outputDir, stageTwo), 'utf8')
        if (stageOneOutput !== stageTwoOutput) {
          equalityFailed = true
          console.error(`failed bootstrap equality for ${name}`)
        }
      }

      if (equalityFailed) {
        failures += 1
      } else {
        console.log(green('ok bootstrap stage output equality'))
      }

      await compiler.buildExecutable(join(outputDir, 'basic-self2.ll'), join(outputDir, 'basic-self2'))
      await compiler.buildExecutable(join(outputDir, 'renamed-basic-self2.ll'), join(outputDir, 'renamed-basic-self2'))
      await compiler.buildExecutable(join(outputDir, 'control-flow-self2.ll'), join(outputDir, 'control-flow-self2'))
      await compiler.buildExecutable(join(outputDir, 'for-loop-self2.ll'), join(outputDir, 'for-loop-self2'))
      await compiler.buildExecutable(join(outputDir, 'native-main-self2.ll'), join(outputDir, 'native-main-self2'))
      await compiler.buildExecutable(join(outputDir, 'println-self2.ll'), join(outputDir, 'println-self2'))
      await compiler.buildExecutable(join(outputDir, 'struct-self2.ll'), join(outputDir, 'struct-self2'))
      await compiler.buildExecutable(join(outputDir, 'self-host-simple-self2.ll'), join(outputDir, 'self-host-simple-self2'))
      await compiler.buildExecutable(join(outputDir, 'self-host-if-binary-self2.ll'), join(outputDir, 'self-host-if-binary-self2'))
      await compiler.buildExecutable(join(outputDir, 'self-host-call-self2.ll'), join(outputDir, 'self-host-call-self2'))
      await compiler.buildExecutable(join(outputDir, 'tiny-self2.ll'), join(outputDir, 'tiny-self2'))

      const tiny2 = await runExecutable(join(outputDir, 'tiny-self2'))
      const basic2 = await runExecutable(join(outputDir, 'basic-self2'))
      const renamedBasic2 = await runExecutable(join(outputDir, 'renamed-basic-self2'))
      const control2 = await runExecutable(join(outputDir, 'control-flow-self2'))
      const forLoop2 = await runExecutable(join(outputDir, 'for-loop-self2'))
      const nativeMain2 = await runExecutable(join(outputDir, 'native-main-self2'))
      const println2 = await runExecutable(join(outputDir, 'println-self2'))
      const struct2 = await runExecutable(join(outputDir, 'struct-self2'))
      const simple2 = await runExecutable(join(outputDir, 'self-host-simple-self2'))
      const ifBinary2 = await runExecutable(join(outputDir, 'self-host-if-binary-self2'))
      const call2 = await runExecutable(join(outputDir, 'self-host-call-self2'))

      if (tiny2.code !== 7 ||
        basic2.stdout !== 'hello\n3\n' || basic2.code !== 3 ||
        renamedBasic2.stdout !== 'hello\n3\n' || renamedBasic2.code !== 3 ||
        control2.stdout !== 'sum 23\n' || control2.code !== 23 ||
        forLoop2.stdout !== '10\n' || forLoop2.code !== 10 ||
        nativeMain2.stdout !== '10\n' || nativeMain2.code !== 10 ||
        println2.stdout !== 'total\n10\n' || println2.code !== 10 ||
        struct2.stdout !== '11\n' || struct2.code !== 11 ||
        simple2.stdout !== 'simple\n4\ndone\n' || simple2.code !== 4 ||
        ifBinary2.stdout !== 'seven\n7\n' || ifBinary2.code !== 7 ||
        call2.stdout !== '9\n' || call2.code !== 9) {
        failures += 1
        console.error('failed second-stage executable behavior')
      } else {
        console.log(green('ok bootstrap second-stage compiler'))
      }
    }
    await unlink(renamedBasicPath)

    const selfInvalidCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join('tests', 'bootstrap', 'invalid.lm'),
      join(outputDir, 'invalid-self2.ll')
    ])
    if (selfInvalidCompile.code === 0 || selfInvalidCompile.stdout !== 'compile error: missing function main at line 1 near let\n') {
      failures += 1
      console.error('failed second-stage invalid source rejection')
    } else {
      console.log(green('ok second-stage invalid source rejection'))
    }

    const selfWhileCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join(examplesDir, 'while-do.lm'),
      join(outputDir, 'while-do-self2.ll')
    ])

    if (selfWhileCompile.code !== 0) {
      failures += 1
      console.error('failed second-stage while compiler output')
    } else {
      const whileStageOneOutput = await readFile(join(outputDir, 'while-do-self.ll'), 'utf8')
      const whileStageTwoOutput = await readFile(join(outputDir, 'while-do-self2.ll'), 'utf8')
      if (whileStageOneOutput !== whileStageTwoOutput) {
        failures += 1
        console.error('failed bootstrap equality for while-do')
      }

      await compiler.buildExecutable(join(outputDir, 'while-do-self2.ll'), join(outputDir, 'while-do-self2'))
      const whileDo2 = await runExecutable(join(outputDir, 'while-do-self2'))

      if (whileDo2.stdout !== '6\n' || whileDo2.code !== 6) {
        failures += 1
        console.error('failed second-stage while executable behavior')
      } else {
        console.log(green('ok second-stage self-host while'))
      }
    }

    const selfUnsupportedCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join('tests', 'bootstrap', 'unsupported-while.lm'),
      join(outputDir, 'unsupported-while-self2.ll')
    ])
    if (selfUnsupportedCompile.code === 0 || selfUnsupportedCompile.stdout !== 'compile error: unsupported while at line 2 near while\n') {
      failures += 1
      console.error('failed second-stage unsupported while diagnostic')
    } else {
      console.log(green('ok second-stage unsupported while diagnostic'))
    }

    const selfBreakCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join('tests', 'negative', 'break-outside-loop.lm'),
      join(outputDir, 'break-outside-loop-self2.ll')
    ])
    if (selfBreakCompile.code === 0 || selfBreakCompile.stdout !== 'compile error: break outside loop at line 2 near break\n') {
      failures += 1
      console.error('failed second-stage break semantic diagnostic')
    } else {
      console.log(green('ok second-stage break semantic diagnostic'))
    }

    const selfTypeMismatchCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join('tests', 'bootstrap', 'type-mismatch.lm'),
      join(outputDir, 'type-mismatch-self2.ll')
    ])
    if (selfTypeMismatchCompile.code === 0 || selfTypeMismatchCompile.stdout !== 'compile error: cannot assign i32 to string at line 2 near let\n') {
      failures += 1
      console.error('failed second-stage type diagnostic')
    } else {
      console.log(green('ok second-stage type diagnostic'))
    }

    const selfNoneToStringCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join('tests', 'negative', 'none-to-string.lm'),
      join(outputDir, 'none-to-string-self2.ll')
    ])
    const selfResultMismatchCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join('tests', 'negative', 'result-type-mismatch.lm'),
      join(outputDir, 'result-type-mismatch-self2.ll')
    ])
    if (selfNoneToStringCompile.code === 0 || selfNoneToStringCompile.stdout !== 'compile error: cannot pass none to string at line 6 near echoText\n' ||
      selfResultMismatchCompile.code === 0 || selfResultMismatchCompile.stdout !== 'compile error: cannot pass Result<i32> to Result<string> at line 6 near describe\n') {
      failures += 1
      console.error('failed second-stage function-call type diagnostics')
    } else {
      console.log(green('ok second-stage function-call type diagnostics'))
    }

    const selfExtraDiagnostics = [
      [join('tests', 'negative', 'duplicate-parameter.lm'), 'duplicate-parameter', 'compile error: duplicate parameter value at line 1 near value\n'],
      [join('tests', 'negative', 'return-type-mismatch.lm'), 'return-type-mismatch', 'compile error: return type i32 does not match string at line 2 near return\n'],
      [join('tests', 'bootstrap', 'assignment-type-mismatch.lm'), 'assignment-type-mismatch', 'compile error: cannot assign i32 to string at line 3 near value\n'],
      [join('tests', 'negative', 'throw-type-mismatch.lm'), 'throw-type-mismatch', 'compile error: throw expects string or error, got i32 at line 2 near throw\n'],
      [join('tests', 'negative', 'for-of-non-array.lm'), 'for-of-non-array', 'compile error: for-of needs an array at line 3 near of\n'],
      [join('tests', 'negative', 'switch-case-mismatch.lm'), 'switch-case-mismatch', 'compile error: cannot compare switch i32 with case string at line 4 near case\n']
    ]

    for (const [file, outputName, stdout] of selfExtraDiagnostics) {
      const result = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
        file,
        join(outputDir, `${outputName}-self2.ll`)
      ])

      if (result.code === 0 || result.stdout !== stdout) {
        failures += 1
        console.error(`failed second-stage expanded diagnostic ${outputName}`)
      }
    }
  }
}

const negativeFiles = await readdir(negativeDir).catch(() => [])
for (const file of negativeFiles.filter(file => file.endsWith('.lm')).sort()) {
  const source = await readFile(join(negativeDir, file), 'utf8')
  try {
    compiler.compileSource(source)
    failures += 1
    console.error(`failed negative ${file}`)
  } catch {
    console.log(green(`ok negative ${file}`))
  }
}

function runExecutable(path, args = [], env = {}, {
  progressLabel = null,
  progressIntervalMs = 15000
} = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    let progressTimer = null
    if (progressLabel) {
      console.log(`${progressLabel}...`)
      progressTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        console.log(`${progressLabel}... ${elapsed}s`)
      }, progressIntervalMs)
      progressTimer.unref()
    }
    const child = spawn(`./${path}`, args, {
      env: {
        ...process.env,
        ...env
      }
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk
    })

    child.stderr.on('data', chunk => {
      stderr += chunk
    })

    child.on('error', error => {
      if (progressTimer) clearInterval(progressTimer)
      reject(error)
    })
    child.on('close', code => {
      if (progressTimer) {
        clearInterval(progressTimer)
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        console.log(`${progressLabel} finished in ${elapsed}s`)
      }
      if (stderr) process.stderr.write(stderr)
      resolve({
        stdout,
        code
      })
    })
  })
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

function runCommand(command, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        ...env
      }
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
      resolve({ code, stdout, stderr })
    })
  })
}

async function runLspDiagnosticsTest() {
  const client = new LspTestClient()

  try {
    await client.start()
    await client.request('initialize', {
      processId: process.pid,
      rootUri: null,
      capabilities: {}
    })

    const goodUri = 'file:///good.lm'
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri: goodUri,
        languageId: 'lumen',
        version: 1,
        text: 'function main(): i32 {\n  return 0\n}\n'
      }
    })
    const goodDiagnostics = await client.waitForDiagnostics(goodUri)

    const badUri = 'file:///bad.lm'
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri: badUri,
        languageId: 'lumen',
        version: 1,
        text: 'function main(): i32 {\n  return missing\n}\n'
      }
    })
    const badDiagnostics = await client.waitForDiagnostics(badUri)

    const edits = await client.request('textDocument/formatting', {
      textDocument: {
        uri: goodUri
      },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    })

    return goodDiagnostics.length === 0 &&
      badDiagnostics.length === 1 &&
      badDiagnostics[0].message.includes('Unknown symbol') &&
      edits.length === 1 &&
      edits[0].newText === 'function main(): i32 {\n  return 0\n}\n'
  } finally {
    client.stop()
  }
}

class LspTestClient {
  constructor() {
    this.nextId = 1
    this.pending = new Map()
    this.diagnostics = new Map()
    this.buffer = Buffer.alloc(0)
  }

  start() {
    return new Promise((resolve, reject) => {
      this.child = spawn('node', [join('src', 'cli', 'lsp.js')])
      this.child.stdout.on('data', chunk => this.read(chunk))
      this.child.stderr.on('data', chunk => {
        process.stderr.write(chunk)
      })
      this.child.on('error', reject)
      setTimeout(resolve, 10)
    })
  }

  request(method, params) {
    const id = this.nextId
    this.nextId += 1

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.write({
        jsonrpc: '2.0',
        id,
        method,
        params
      })
    })
  }

  notify(method, params) {
    this.write({
      jsonrpc: '2.0',
      method,
      params
    })
  }

  waitForDiagnostics(uri) {
    return new Promise(resolve => {
      const existing = this.diagnostics.get(uri)
      if (existing) return resolve(existing)

      const interval = setInterval(() => {
        const diagnostics = this.diagnostics.get(uri)
        if (diagnostics) {
          clearInterval(interval)
          resolve(diagnostics)
        }
      }, 10)
    })
  }

  read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return

      const header = this.buffer.slice(0, headerEnd).toString('utf8')
      const match = /Content-Length: (\d+)/i.exec(header)
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }

      const length = Number(match[1])
      const bodyStart = headerEnd + 4
      const bodyEnd = bodyStart + length
      if (this.buffer.length < bodyEnd) return

      const body = this.buffer.slice(bodyStart, bodyEnd).toString('utf8')
      this.buffer = this.buffer.slice(bodyEnd)
      this.handle(JSON.parse(body))
    }
  }

  handle(message) {
    if (message.method === 'textDocument/publishDiagnostics') {
      this.diagnostics.set(message.params.uri, message.params.diagnostics)
      return
    }

    const pending = this.pending.get(message.id)
    if (!pending) return

    this.pending.delete(message.id)
    if (message.error) pending.reject(new Error(message.error.message))
    else pending.resolve(message.result)
  }

  write(message) {
    const body = JSON.stringify(message)
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
  }

  stop() {
    if (this.child) this.child.kill()
  }
}

if (await runLspDiagnosticsTest()) {
  console.log(green('ok lsp diagnostics'))
} else {
  failures += 1
  console.error('failed lsp diagnostics')
}

if (failures > 0) {
  console.error(`${failures} test failed`)
  process.exit(1)
}
