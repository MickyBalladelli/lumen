import { access, chmod, copyFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseCompiler = join(root, 'build', 'lumen-compiler-release')
const bootstrapCompiler = join(root, 'build', 'lumen-compiler-self2')
let source = releaseCompiler
try {
  await access(source)
} catch {
  source = bootstrapCompiler
}
const target = join(root, 'native', `${process.platform}-${process.arch}`, 'lumen-compiler')

await mkdir(dirname(target), { recursive: true })
await copyFile(source, target)
await chmod(target, 0o755)
const formatter = join(dirname(target), 'lumen-format')
await run(target, [
  'build',
  join(root, 'tools', 'format.lm'),
  formatter,
  process.env.LUMEN_CLANG ?? 'clang',
  join(root, 'src', 'runtime')
])
await chmod(formatter, 0o755)
const photon = join(dirname(target), 'photon')
await run(target, [
  'build',
  join(root, 'tools', 'photon.lm'),
  photon,
  process.env.LUMEN_CLANG ?? 'clang',
  join(root, 'src', 'runtime')
])
await chmod(photon, 0o755)
const lsp = join(dirname(target), 'lumen-lsp')
await run(target, [
  'build',
  join(root, 'tools', 'lsp.lm'),
  lsp,
  process.env.LUMEN_CLANG ?? 'clang',
  join(root, 'src', 'runtime')
])
await chmod(lsp, 0o755)
console.log(target)

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} exited with ${code}`))
    })
  })
}
