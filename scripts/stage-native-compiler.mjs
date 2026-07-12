import { access, chmod, copyFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
console.log(target)
