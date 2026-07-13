import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const compiler = process.env.CC ?? 'clang'
const runs = process.env.LUMEN_FUZZ_RUNS ?? '10000'
const outputDirectory = join('build', 'fuzz')
const targets = [
  ['http-request', join('tests', 'fuzz', 'http-request.c'), '16384'],
  ['http-stream', join('tests', 'fuzz', 'http-stream.c'), '16384'],
  ['websocket-frame', join('tests', 'fuzz', 'websocket-frame.c'), '65550'],
  ['websocket-stream', join('tests', 'fuzz', 'websocket-stream.c'), '65550']
]

await mkdir(outputDirectory, { recursive: true })

for (const [name, source, maxLength] of targets) {
  const executable = join(outputDirectory, name)
  const hasLibFuzzer = await tryRun(compiler, [
    '-std=c11',
    '-g',
    '-O1',
    '-fno-omit-frame-pointer',
    '-fsanitize=fuzzer,address,undefined',
    '-pthread',
    source,
    '-o',
    executable
  ])

  if (hasLibFuzzer) {
    await run(executable, [
      `-runs=${runs}`,
      `-max_len=${maxLength}`,
      '-timeout=2',
      `-artifact_prefix=${outputDirectory}/`
    ])
  } else {
    console.log(`libFuzzer unavailable, using sanitizer mutation loop for ${name}`)
    await run(compiler, [
      '-std=c11',
      '-g',
      '-O1',
      '-fno-omit-frame-pointer',
      '-fsanitize=address,undefined',
      '-DLUMEN_STANDALONE_FUZZ',
      '-pthread',
      source,
      '-o',
      executable
    ])
    await run(executable, [runs, maxLength])
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} failed with ${signal ?? code}`))
    })
  })
}

function tryRun(command, args) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('exit', code => resolve(code === 0))
  })
}
