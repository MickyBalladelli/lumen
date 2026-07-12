import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { runtimeSourcesForLLVM } from '../src/runtime/RuntimeUnits.js'

const root = resolve('.')
const compiler = join(root, 'build', 'lumen-compiler-self2')
const clang = process.env.LUMEN_CLANG ?? 'clang'
const builds = []

for (let index = 0; index < 2; index += 1) {
  const clean = await mkdtemp(join(tmpdir(), `lumen-release-bootstrap-${index}-`))
  await cp(join(root, 'compiler'), join(clean, 'compiler'), { recursive: true })
  await cp(join(root, 'src', 'runtime'), join(clean, 'src', 'runtime'), { recursive: true })
  await cp(join(root, 'photon.json'), join(clean, 'photon.json'))
  await cp(join(root, 'lumen.json'), join(clean, 'lumen.json'))

  const llvm = join(clean, 'compiler.ll')
  const executable = join(clean, 'lumen-compiler')
  await run(compiler, ['emit', 'compiler/main.lm', 'compiler.ll'], { cwd: clean })
  const llvmSource = await readFile(llvm, 'utf8')
  const runtimes = runtimeSourcesForLLVM(llvmSource).map(path => {
    return join(clean, 'src', 'runtime', basename(path))
  })
  const deterministicLinkerFlags = process.platform === 'darwin'
    ? []
    : ['-Wl,--build-id=none']
  await run(clang, [
    '-Wno-override-module',
    '-g0',
    ...deterministicLinkerFlags,
    llvm,
    ...runtimes,
    '-pthread',
    '-o',
    executable
  ])
  builds.push({ executable, hash: sha256(await readFile(executable)) })
}

if (builds[0].hash !== builds[1].hash) {
  throw new Error(`native compiler is not reproducible: ${builds[0].hash} != ${builds[1].hash}`)
}

await mkdir(join(root, 'build'), { recursive: true })
await copyFile(builds[0].executable, join(root, 'build', 'lumen-compiler-release'))
console.log(builds[0].hash)

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { ...options, stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} exited with ${code}`))
    })
  })
}
