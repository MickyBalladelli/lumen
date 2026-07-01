import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { green } from './TerminalStyle.js'

const outputDirectory = await mkdtemp(join(tmpdir(), 'lumen-http-runtime-'))
const executable = join(outputDirectory, 'http-runtime')
const portableExecutable = join(outputDirectory, 'http-runtime-portable')
const linuxExecutable = join(outputDirectory, 'http-runtime-linux')
const linuxArguments = join(outputDirectory, 'cmdline')
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
  await run(executable, ['provider-check'])
  await run(compiler, [
    '-std=c11',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-pthread',
    '-DLUMEN_FORCE_PORTABLE_CRYPTO',
    'tests/runtime/http-runtime.c',
    '-o',
    portableExecutable
  ])
  await run(portableExecutable, ['provider-check'])
  await writeFile(linuxArguments, Buffer.from('portable-runtime\\0provider-check\\0\\0'.replaceAll('\\0', '\0')))
  await run(compiler, [
    '-std=c11',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-pthread',
    '-DLUMEN_FORCE_PORTABLE_CRYPTO',
    '-DLUMEN_FORCE_LINUX_ARGS',
    'tests/runtime/http-runtime.c',
    '-o',
    linuxExecutable
  ])
  await run(linuxExecutable, ['ignored'], {
    LUMEN_PROC_SELF_CMDLINE: linuxArguments
  })
  console.log(green('HTTP runtime tests passed'))
} finally {
  await rm(outputDirectory, { recursive: true, force: true })
}

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...env
      }
    })
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
