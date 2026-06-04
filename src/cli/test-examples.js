import { readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import { Compiler } from '../compiler/Compiler.js'

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
    stdout: 'from-env\nfrom-dotenv\n\n1\n1\n',
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
    stdout: 'fallback\nmissing env PHOTON_MISSING_ENV\n1\nurl package does not encode yet\n1\nemail must look like email\nlocal\nGET /health\n1\n1\n1\n1\njwt-lite does not verify signatures yet\nok string\nok number\n',
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
    stdout: '7\n3\nlet\nnumber\nprintln\nidentifier\nreturn\nidentifier\n1\n1\n1\n1\n1\n1\n1\n1\n1\n1\n1\n1\n1\n',
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
  ['self-host-simple', {
    stdout: 'simple\n4\ndone\n',
    code: 4
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
    console.log(`ok ${name} compile`)
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

  console.log(`ok ${name}`)
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
  console.log('ok lmsh executable runner')
}

await compiler.writeLLVMFile('compiler/main.lm', join(outputDir, 'lumen-compiler.ll'))
await compiler.buildExecutable(join(outputDir, 'lumen-compiler.ll'), join(outputDir, 'lumen-compiler'))
if (await hasSelfFallbackSymbols(join(outputDir, 'lumen-compiler'))) {
  failures += 1
  console.error('failed stage-1 compiler fallback symbol check')
} else {
  console.log('ok stage-1 compiler has no C fallback symbols')
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
    console.log('ok bootstrap self-host tiny')
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
      console.log('ok bootstrap self-host basic')
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
      console.log('ok bootstrap self-host control-flow')
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

  if (forLoopCompile.code !== 0 || nativeMainCompile.code !== 0 || printlnCompile.code !== 0 || structCompile.code !== 0 || simpleCompile.code !== 0 || ifBinaryCompile.code !== 0 || callCompile.code !== 0) {
    failures += 1
    console.error('failed bootstrap loop compiler output')
  } else {
    await compiler.buildExecutable(join(outputDir, 'for-loop-self.ll'), join(outputDir, 'for-loop-self'))
    await compiler.buildExecutable(join(outputDir, 'native-main-self.ll'), join(outputDir, 'native-main-self'))
    await compiler.buildExecutable(join(outputDir, 'println-self.ll'), join(outputDir, 'println-self'))
    await compiler.buildExecutable(join(outputDir, 'struct-self.ll'), join(outputDir, 'struct-self'))
    await compiler.buildExecutable(join(outputDir, 'self-host-simple-self.ll'), join(outputDir, 'self-host-simple-self'))
    await compiler.buildExecutable(join(outputDir, 'self-host-if-binary-self.ll'), join(outputDir, 'self-host-if-binary-self'))
    await compiler.buildExecutable(join(outputDir, 'self-host-call-self.ll'), join(outputDir, 'self-host-call-self'))
    const forLoop = await runExecutable(join(outputDir, 'for-loop-self'))
    const nativeMain = await runExecutable(join(outputDir, 'native-main-self'))
    const println = await runExecutable(join(outputDir, 'println-self'))
    const struct = await runExecutable(join(outputDir, 'struct-self'))
    const simple = await runExecutable(join(outputDir, 'self-host-simple-self'))
    const ifBinary = await runExecutable(join(outputDir, 'self-host-if-binary-self'))
    const call = await runExecutable(join(outputDir, 'self-host-call-self'))

    if (forLoop.stdout !== '10\n' || forLoop.code !== 10 ||
      nativeMain.stdout !== '10\n' || nativeMain.code !== 10 ||
      println.stdout !== 'total\n10\n' || println.code !== 10 ||
      struct.stdout !== '11\n' || struct.code !== 11 ||
      simple.stdout !== 'simple\n4\ndone\n' || simple.code !== 4 ||
      ifBinary.stdout !== 'seven\n7\n' || ifBinary.code !== 7 ||
      call.stdout !== '9\n' || call.code !== 9) {
      failures += 1
      console.error('failed bootstrap loop executable behavior')
    } else {
      console.log('ok bootstrap self-host simple/call/if/loop/println/struct examples')
    }
  }

  const invalidCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join('tests', 'bootstrap', 'invalid.lm'),
    join(outputDir, 'invalid-self.ll')
  ])
  if (invalidCompile.code === 0 || invalidCompile.stdout !== 'compile error: missing function main\n') {
    failures += 1
    console.error('failed bootstrap invalid source rejection')
  } else {
    console.log('ok bootstrap invalid source rejection')
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
      console.log('ok bootstrap self-host while')
    }
  }

  const unsupportedCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
    join('tests', 'bootstrap', 'unsupported-while.lm'),
    join(outputDir, 'unsupported-while-self.ll')
  ])
  if (unsupportedCompile.code === 0 || unsupportedCompile.stdout !== 'compile error: unsupported while\n') {
    failures += 1
    console.error('failed bootstrap unsupported while diagnostic')
  } else {
    console.log('ok bootstrap unsupported while diagnostic')
  }

  const compilerSeedPath = join(outputDir, 'lumen-compiler.ll')
  const hiddenCompilerSeedPath = join(outputDir, 'lumen-compiler.seed-hidden.ll')
  await rename(compilerSeedPath, hiddenCompilerSeedPath)
  let compilerSelfCompile
  try {
    compilerSelfCompile = await runExecutable(join(outputDir, 'lumen-compiler'), [
      join('compiler', 'main.lm'),
      join(outputDir, 'lumen-compiler-self.ll')
    ])
  } finally {
    await rename(hiddenCompilerSeedPath, compilerSeedPath)
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
      console.log('ok stage-2 compiler has no C fallback symbols')
    }

    const selfBasicCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join(examplesDir, 'basic.lm'),
      join(outputDir, 'basic-self2.ll')
    ])
    const renamedBasicPath = join(outputDir, 'renamed-bootstrap-source.lm')
    await writeFile(renamedBasicPath, await readFile(join(examplesDir, 'basic.lm'), 'utf8'))
    const selfRenamedBasicCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      renamedBasicPath,
      join(outputDir, 'renamed-basic-self2.ll')
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
    ])

    if (selfBasicCompile.code !== 0 || selfRenamedBasicCompile.code !== 0 || selfControlCompile.code !== 0 || selfForLoopCompile.code !== 0 || selfNativeMainCompile.code !== 0 || selfPrintlnCompile.code !== 0 || selfStructCompile.code !== 0 || selfSimpleCompile.code !== 0 || selfIfBinaryCompile.code !== 0 || selfCallCompile.code !== 0 || selfCompilerCompile.code !== 0) {
      failures += 1
      console.error('failed second-stage compiler output')
    } else {
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
      await compiler.buildExecutable(join(outputDir, 'lumen-compiler-self2.ll'), join(outputDir, 'lumen-compiler-self2'))

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

      if (basic2.stdout !== 'hello\n3\n' || basic2.code !== 3 ||
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
        console.log('ok bootstrap second-stage compiler')
      }
    }
    await unlink(renamedBasicPath)

    const selfInvalidCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join('tests', 'bootstrap', 'invalid.lm'),
      join(outputDir, 'invalid-self2.ll')
    ])
    if (selfInvalidCompile.code === 0 || selfInvalidCompile.stdout !== 'compile error: missing function main\n') {
      failures += 1
      console.error('failed second-stage invalid source rejection')
    } else {
      console.log('ok second-stage invalid source rejection')
    }

    const selfWhileCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join(examplesDir, 'while-do.lm'),
      join(outputDir, 'while-do-self2.ll')
    ])

    if (selfWhileCompile.code !== 0) {
      failures += 1
      console.error('failed second-stage while compiler output')
    } else {
      await compiler.buildExecutable(join(outputDir, 'while-do-self2.ll'), join(outputDir, 'while-do-self2'))
      const whileDo2 = await runExecutable(join(outputDir, 'while-do-self2'))

      if (whileDo2.stdout !== '6\n' || whileDo2.code !== 6) {
        failures += 1
        console.error('failed second-stage while executable behavior')
      } else {
        console.log('ok second-stage self-host while')
      }
    }

    const selfUnsupportedCompile = await runExecutable(join(outputDir, 'lumen-compiler-self'), [
      join('tests', 'bootstrap', 'unsupported-while.lm'),
      join(outputDir, 'unsupported-while-self2.ll')
    ])
    if (selfUnsupportedCompile.code === 0 || selfUnsupportedCompile.stdout !== 'compile error: unsupported while\n') {
      failures += 1
      console.error('failed second-stage unsupported while diagnostic')
    } else {
      console.log('ok second-stage unsupported while diagnostic')
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
    console.log(`ok negative ${file}`)
  }
}

if (failures > 0) {
  console.error(`${failures} test failed`)
  process.exit(1)
}

function runExecutable(path, args = [], env = {}) {
  return new Promise((resolve, reject) => {
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

    child.on('error', reject)
    child.on('close', code => {
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
