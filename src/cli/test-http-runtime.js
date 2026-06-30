import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const outputDirectory = await mkdtemp(join(tmpdir(), 'lumen-http-runtime-'))
const executable = join(outputDirectory, 'http-runtime')
const compiler = process.env.CC ?? 'clang'

try {
  await run(compiler, [
    '-std=c11',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-pthread',
    'tests/runtime/http-runtime.c',
    '-o',
    executable
  ])
  await run(executable, [])
  console.log('HTTP runtime tests passed')
} finally {
  await rm(outputDirectory, { recursive: true, force: true })
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
