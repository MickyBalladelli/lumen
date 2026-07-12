import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { runtimeSourcesForLLVM } from '../runtime/RuntimeUnits.js'

export async function linkLLVM(llvmPath, outputPath, {
  clang = process.env.LUMEN_CLANG ?? 'clang',
  optimize = false,
  sanitizers = []
} = {}) {
  const flags = ['-Wno-override-module', '-g']
  if (optimize) flags.push('-O2')
  if (sanitizers.length > 0) {
    flags.push(`-fsanitize=${sanitizers.join(',')}`, '-fno-omit-frame-pointer')
  }

  await mkdir(dirname(outputPath), { recursive: true })
  const llvm = await readFile(llvmPath, 'utf8')
  const prefix = join(dirname(outputPath), `.${basename(outputPath)}.${process.pid}.${randomUUID()}`)
  const executablePath = `${prefix}.tmp`
  const objectPath = `${prefix}.o`

  try {
    await run(clang, [...flags, '-c', llvmPath, '-o', objectPath])
    await run(clang, [
      ...flags,
      objectPath,
      ...runtimeSourcesForLLVM(llvm),
      '-pthread',
      '-o',
      executablePath
    ])
    await rename(executablePath, outputPath)
  } finally {
    await Promise.all([executablePath, objectPath].map(removeIfPresent))
  }

  return outputPath
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code}`))
    })
  })
}

function removeIfPresent(path) {
  return unlink(path).catch(error => {
    if (error.code !== 'ENOENT') throw error
  })
}
