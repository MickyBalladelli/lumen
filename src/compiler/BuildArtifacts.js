import { createHash, randomUUID } from 'node:crypto'
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runtimeSourcesForLLVM } from '../runtime/RuntimeUnits.js'
import { lumenVersion } from '../version.js'

const runtimeDirectory = fileURLToPath(new URL('../runtime/', import.meta.url))

export function nativeBuildTarget() {
  return `native-${process.platform}-${process.arch}`
}

export function llvmBuildTarget() {
  return `llvm-${process.platform}-${process.arch}`
}

export async function resolveArtifactIdentity(inputPath, {
  cacheRoot = join('build', 'cache'),
  target,
  flags = {},
  version = lumenVersion
} = {}) {
  if (!target) throw new Error('build artifact target is required')

  const canonicalInput = await realpath(resolve(inputPath))
  const configuration = stableStringify({
    input: canonicalInput,
    target,
    version,
    flags
  })
  const key = digest(configuration)
  const stem = safeStem(basename(canonicalInput, extname(canonicalInput)))

  return {
    canonicalInput,
    target,
    version,
    flags,
    key,
    directory: join(resolve(cacheRoot), `${stem}-${key}`)
  }
}

export async function compileLLVMArtifact({
  compiler,
  inputPath,
  cacheRoot,
  target = llvmBuildTarget(),
  flags = {}
}) {
  const identity = await resolveArtifactIdentity(inputPath, {
    cacheRoot,
    target,
    flags
  })
  const compilation = await compiler.compileFile(identity.canonicalInput)
  const fingerprint = digest(compilation.llvm)
  const directory = join(identity.directory, fingerprint)
  const llvmPath = join(directory, 'program.ll')
  const cacheHit = await isFile(llvmPath)

  if (!cacheHit) await atomicWriteFile(llvmPath, compilation.llvm)

  return {
    ...identity,
    compilation,
    fingerprint,
    directory,
    llvmPath,
    cacheHit
  }
}

export async function compileNativeArtifact({
  compiler,
  inputPath,
  cacheRoot,
  target = nativeBuildTarget(),
  flags = {},
  buildOptions = {}
}) {
  const identity = await resolveArtifactIdentity(inputPath, {
    cacheRoot,
    target,
    flags
  })
  const compilation = await compiler.compileFile(identity.canonicalInput)
  const fingerprint = await nativeFingerprint(compilation.llvm, {
    target,
    flags
  })
  const directory = join(identity.directory, fingerprint)
  const llvmPath = join(directory, 'program.ll')
  const executablePath = join(directory, 'program')
  const cacheHit = await isFile(llvmPath) && await isFile(executablePath)

  if (!cacheHit) {
    await atomicWriteFile(llvmPath, compilation.llvm)
    await compiler.buildExecutable(llvmPath, executablePath, buildOptions)
  }

  return {
    ...identity,
    compilation,
    fingerprint,
    directory,
    llvmPath,
    executablePath,
    cacheHit
  }
}

export async function atomicWriteFile(path, contents, options) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = temporarySibling(path)

  try {
    await writeFile(temporaryPath, contents, options)
    await rename(temporaryPath, path)
  } finally {
    await removeIfPresent(temporaryPath)
  }
}

export async function publishArtifact(sourcePath, outputPath) {
  const source = resolve(sourcePath)
  const output = resolve(outputPath)
  if (source === output) return outputPath

  await mkdir(dirname(output), { recursive: true })
  const temporaryPath = temporarySibling(output)

  try {
    const sourceInfo = await stat(source)
    await copyFile(source, temporaryPath)
    await chmod(temporaryPath, sourceInfo.mode)
    await rename(temporaryPath, output)
  } finally {
    await removeIfPresent(temporaryPath)
  }

  return outputPath
}

async function nativeFingerprint(llvm, configuration) {
  const hash = createHash('sha256')
  hash.update(llvm)
  hash.update(stableStringify(configuration))

  const runtimeInputs = new Set(runtimeSourcesForLLVM(llvm))
  const runtimeEntries = await readdir(runtimeDirectory)

  for (const entry of runtimeEntries) {
    if (entry.endsWith('.h')) runtimeInputs.add(join(runtimeDirectory, entry))
  }

  for (const path of [...runtimeInputs].sort()) {
    hash.update(path)
    hash.update(await readFile(path))
  }

  return hash.digest('hex')
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => {
      return `${JSON.stringify(key)}:${stableStringify(value[key])}`
    }).join(',')}}`
  }

  return JSON.stringify(value)
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function safeStem(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 48) || 'program'
}

function temporarySibling(path) {
  return join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`
  )
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function removeIfPresent(path) {
  await unlink(path).catch(error => {
    if (error.code !== 'ENOENT') throw error
  })
}
