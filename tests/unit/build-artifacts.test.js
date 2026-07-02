import assert from 'node:assert/strict'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import test from 'node:test'
import {
  atomicWriteFile,
  compileNativeArtifact,
  publishArtifact,
  resolveArtifactIdentity
} from '../../src/compiler/BuildArtifacts.js'
import { Compiler } from '../../src/compiler/Compiler.js'

test('artifact identity separates same basenames and build settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-artifact-identity-'))
  const first = join(root, 'first', 'main.lm')
  const second = join(root, 'second', 'main.lm')
  const alias = join(root, 'main-alias.lm')
  const cacheRoot = join(root, 'cache')

  await mkdir(join(root, 'first'), { recursive: true })
  await mkdir(join(root, 'second'), { recursive: true })
  await writeFile(first, 'function main(): i32 { return 1 }')
  await writeFile(second, 'function main(): i32 { return 2 }')
  await symlink(first, alias)

  const base = {
    cacheRoot,
    target: 'native-test',
    flags: {
      clang: 'clang',
      optimize: false
    },
    version: '1.2.3'
  }
  const firstIdentity = await resolveArtifactIdentity(first, base)
  const secondIdentity = await resolveArtifactIdentity(second, base)
  const aliasIdentity = await resolveArtifactIdentity(alias, base)
  const reorderedFlags = await resolveArtifactIdentity(first, {
    ...base,
    flags: {
      optimize: false,
      clang: 'clang'
    }
  })
  const optimized = await resolveArtifactIdentity(first, {
    ...base,
    flags: {
      clang: 'clang',
      optimize: true
    }
  })
  const otherTarget = await resolveArtifactIdentity(first, {
    ...base,
    target: 'llvm-test'
  })
  const otherVersion = await resolveArtifactIdentity(first, {
    ...base,
    version: '1.2.4'
  })

  assert.notEqual(firstIdentity.directory, secondIdentity.directory)
  assert.equal(firstIdentity.directory, aliasIdentity.directory)
  assert.equal(firstIdentity.directory, reorderedFlags.directory)
  assert.notEqual(firstIdentity.directory, optimized.directory)
  assert.notEqual(firstIdentity.directory, otherTarget.directory)
  assert.notEqual(firstIdentity.directory, otherVersion.directory)
})

test('native artifacts reuse content cache and invalidate changed LLVM', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-artifact-cache-'))
  const inputPath = join(root, 'main.lm')
  let llvm = 'define i32 @main() { ret i32 0 }\n'
  let builds = 0

  await writeFile(inputPath, 'function main(): i32 { return 0 }')

  const compiler = {
    async compileFile() {
      return { llvm }
    },
    async buildExecutable(llvmPath, outputPath) {
      builds += 1
      await atomicWriteFile(
        outputPath,
        `binary:${await readFile(llvmPath, 'utf8')}`,
        { mode: 0o755 }
      )
    }
  }
  const options = {
    compiler,
    inputPath,
    cacheRoot: join(root, 'cache'),
    target: 'native-test',
    flags: {
      clang: 'clang',
      optimize: false,
      sanitizers: []
    }
  }

  const first = await compileNativeArtifact(options)
  const second = await compileNativeArtifact(options)

  assert.equal(first.cacheHit, false)
  assert.equal(second.cacheHit, true)
  assert.equal(first.executablePath, second.executablePath)
  assert.equal(builds, 1)

  llvm = 'define i32 @main() { ret i32 1 }\n'
  const changed = await compileNativeArtifact(options)

  assert.equal(changed.cacheHit, false)
  assert.notEqual(changed.executablePath, first.executablePath)
  assert.equal(builds, 2)
})

test('atomic publishing preserves mode and leaves no temporary file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-artifact-publish-'))
  const source = join(root, 'source')
  const output = join(root, 'nested', 'program')

  await writeFile(source, 'new executable')
  await chmod(source, 0o755)
  await atomicWriteFile(output, 'old executable')
  await publishArtifact(source, output)

  assert.equal(await readFile(output, 'utf8'), 'new executable')
  assert.notEqual((await stat(output)).mode & 0o111, 0)
  assert.deepEqual(
    (await readdir(join(root, 'nested')))
      .filter(name => name.startsWith(`.${basename(output)}.`)),
    []
  )
})

test('failed native link leaves existing output untouched', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-artifact-failure-'))
  const llvmPath = join(root, 'program.ll')
  const outputPath = join(root, 'program')
  const compiler = new Compiler()

  await writeFile(llvmPath, 'define i32 @main() { ret i32 0 }\n')
  await writeFile(outputPath, 'known-good')

  compiler.run = async (command, args) => {
    const output = args[args.indexOf('-o') + 1]
    if (args.includes('-c')) {
      await writeFile(output, 'object')
      return
    }
    throw new Error('link failed')
  }

  await assert.rejects(
    compiler.buildExecutable(llvmPath, outputPath),
    /link failed/
  )
  assert.equal(await readFile(outputPath, 'utf8'), 'known-good')
  assert.deepEqual(
    (await readdir(root)).filter(name => name.startsWith('.program.')),
    []
  )
})
