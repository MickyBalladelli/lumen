#!/usr/bin/env node
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const command = process.argv[2]
const args = process.argv.slice(3)

const manifestPath = 'photon.json'
const lockPath = 'photon.lock'
const packageRoot = join('.photon', 'packages')
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const bundledPackageRoot = join(repoRoot, 'packages')

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

async function main() {
  if (!command || command === '-h' || command === '--help') {
    usage()
    process.exit(command ? 0 : 1)
  }

  if (command === 'init') {
    if (await exists(manifestPath)) fail('photon.json already exists')

    const name = args[0] ?? basename(process.cwd())

    await writeJson(manifestPath, {
      name,
      version: '0.1.0',
      main: 'main.lm',
      dependencies: {}
    })
    if (!await exists('main.lm')) {
      await writeFile('main.lm', 'function main(): i32 {\n  println("hello lumen")\n  return 0\n}\n')
      console.log('created main.lm')
    }
    if (!await exists('lumen.json')) {
      await writeJson('lumen.json', {
        entry: 'main.lm',
        output: join('build', name)
      })
      console.log('created lumen.json')
    }
    console.log('created photon.json')
  } else if (command === 'add') {
    const [name, source] = args
    if (!name) fail('usage: photon add name [source]')
    validateDependencyName(name)
    const resolvedSource = source ?? await bundledPackageSource(name)

    const manifest = await readManifest()
    manifest.dependencies ??= {}
    manifest.dependencies[name] = resolvedSource
    await writeJson(manifestPath, manifest)
    await install(manifest)
  } else if (command === 'remove') {
    const [name] = args
    if (!name) fail('usage: photon remove name')
    validateDependencyName(name)

    const manifest = await readManifest()
    delete manifest.dependencies?.[name]
    await writeJson(manifestPath, manifest)
    await install(manifest)
  } else if (command === 'install') {
    const unknownArgs = args.filter(arg => arg !== '--frozen-lock')
    if (unknownArgs.length > 0) fail(`unknown install option: ${unknownArgs[0]}`)
    await install(null, {
      frozen: args.includes('--frozen-lock')
    })
  } else if (command === 'frozen-lock') {
    if (args.length > 0) fail('usage: photon frozen-lock')
    await install(null, { frozen: true })
  } else if (command === 'update') {
    if (args.length > 0) fail('usage: photon update')
    await install(null, { update: true })
  } else if (command === 'search') {
    await search(args.join(' '))
  } else if (command === 'list') {
    const manifest = await readManifest()
    for (const [name, source] of dependenciesFromManifest(manifest)) {
      console.log(`${name} ${source}`)
    }
  } else {
    fail(`unknown command: ${command}`)
  }
}

async function install(providedManifest = null, {
  frozen = false,
  update = false
} = {}) {
  const manifest = providedManifest ?? await readManifest()
  const dependencies = dependenciesFromManifest(manifest)
  const existingLock = await readLock()
  if (frozen) validateFrozenLock(dependencies, existingLock)

  const lock = {
    version: 1,
    packages: {}
  }

  await mkdir(dirname(packageRoot), { recursive: true })
  const stageRoot = await mkdtemp(join(dirname(packageRoot), '.packages-stage-'))
  let committed = false

  try {
    for (const [name, source] of dependencies) {
      const target = join(stageRoot, name)
      const locked = !update && usableLockedPackage(existingLock?.packages?.[name], source)
        ? existingLock.packages[name]
        : null
      const resolved = await installPackage(source, target, locked?.resolved)
      await validatePackage(name, target)

      lock.packages[name] = {
        source,
        resolved
      }
    }

    await commitInstall(stageRoot, lock, {
      writeLock: !frozen
    })
    committed = true
  } finally {
    if (!committed) {
      await rm(stageRoot, { recursive: true, force: true }).catch(() => {})
    }
  }

  for (const [name] of dependencies) console.log(`installed ${name}`)
}

async function search(query = '') {
  const packages = await bundledPackages()
  const needle = query.trim().toLowerCase()
  const matches = packages.filter(pkg => {
    if (!needle) return true
    return pkg.name.toLowerCase().includes(needle) ||
      pkg.exports.some(name => name.toLowerCase().includes(needle))
  })

  for (const pkg of matches) {
    const exportsText = pkg.exports.length > 0
      ? ` exports: ${pkg.exports.join(', ')}`
      : ''
    console.log(`${pkg.name} ${pkg.version}${exportsText}`)
  }
}

async function bundledPackageSource(name) {
  const target = join(bundledPackageRoot, name)
  const packageManifestPath = join(target, 'photon.json')

  if (!await exists(packageManifestPath)) {
    fail(`unknown bundled package "${name}"; run photon search`)
  }

  return `file:${target}`
}

async function bundledPackages() {
  if (!await exists(bundledPackageRoot)) return []

  const entries = await readdir(bundledPackageRoot, { withFileTypes: true })
  const packages = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const packagePath = join(bundledPackageRoot, entry.name)
    const packageManifestPath = join(packagePath, 'photon.json')
    if (!await exists(packageManifestPath)) continue

    const manifest = JSON.parse(await readFile(packageManifestPath, 'utf8'))
    packages.push({
      name: manifest.name ?? entry.name,
      version: manifest.version ?? '0.0.0',
      exports: manifest.exports ?? []
    })
  }

  return packages.sort((left, right) => left.name.localeCompare(right.name))
}

async function validatePackage(name, target) {
  let main = 'main.lm'
  const packageManifestPath = join(target, 'photon.json')
  const canonicalTarget = await realpath(target)

  if (await exists(packageManifestPath)) {
    const canonicalManifest = await realpath(packageManifestPath)
    if (!isInside(canonicalTarget, canonicalManifest)) {
      throw new Error(`package ${name} has photon.json outside its install`)
    }

    let manifest
    try {
      manifest = JSON.parse(await readFile(canonicalManifest, 'utf8'))
    } catch {
      throw new Error(`package ${name} has invalid photon.json`)
    }
    main = manifest.main ?? main
  }

  if (typeof main !== 'string' || main.length === 0) {
    throw new Error(`package ${name} has invalid main`)
  }

  const requestedMain = resolve(canonicalTarget, main)
  if (!isInside(canonicalTarget, requestedMain) || !await exists(requestedMain)) {
    throw new Error(`package ${name} missing ${main}`)
  }

  const canonicalMain = await realpath(requestedMain)
  if (!isInside(canonicalTarget, canonicalMain)) {
    throw new Error(`package ${name} has main outside its install`)
  }

  const mainStat = await stat(canonicalMain)
  if (!mainStat.isFile()) {
    throw new Error(`package ${name} missing ${main}`)
  }
}

async function commitInstall(stageRoot, lock, {
  writeLock = true
} = {}) {
  const transaction = `${process.pid}-${randomUUID()}`
  const backupRoot = join(dirname(packageRoot), `.packages-backup-${transaction}`)
  const stagedLock = join(dirname(resolve(lockPath)), `.photon-lock-stage-${transaction}`)
  const backupLock = join(dirname(resolve(lockPath)), `.photon-lock-backup-${transaction}`)
  const hadPackages = await exists(packageRoot)
  const hadLock = await exists(lockPath)
  let oldPackagesMoved = false
  let newPackagesMoved = false
  let oldLockMoved = false
  let newLockMoved = false

  if (writeLock) await writeJson(stagedLock, lock)

  try {
    if (hadPackages) {
      await rename(packageRoot, backupRoot)
      oldPackagesMoved = true
    }

    await rename(stageRoot, packageRoot)
    newPackagesMoved = true

    if (writeLock && hadLock) {
      await rename(lockPath, backupLock)
      oldLockMoved = true
    }

    if (writeLock) {
      await rename(stagedLock, lockPath)
      newLockMoved = true
    }
  } catch (error) {
    if (newLockMoved) await rm(lockPath, { force: true }).catch(() => {})
    if (oldLockMoved) await rename(backupLock, lockPath).catch(() => {})

    if (newPackagesMoved) {
      await rm(packageRoot, { recursive: true, force: true }).catch(() => {})
    }
    if (oldPackagesMoved) await rename(backupRoot, packageRoot).catch(() => {})

    throw error
  } finally {
    await rm(stagedLock, { force: true }).catch(() => {})
  }

  await rm(backupRoot, { recursive: true, force: true }).catch(() => {})
  await rm(backupLock, { force: true }).catch(() => {})
}

function dependenciesFromManifest(manifest) {
  const dependencies = manifest.dependencies ?? {}
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
    throw new Error('photon.json dependencies must be an object')
  }

  return Object.entries(dependencies)
    .map(([name, source]) => {
      validateDependencyName(name)
      if (typeof source !== 'string' || source.length === 0) {
        throw new Error(`dependency ${name} has invalid source`)
      }
      return [name, source]
    })
    .sort(([left], [right]) => left.localeCompare(right))
}

async function readLock() {
  if (!await exists(lockPath)) return null

  let lock
  try {
    lock = JSON.parse(await readFile(lockPath, 'utf8'))
  } catch {
    throw new Error('photon.lock is not valid JSON')
  }

  if (!lock || typeof lock !== 'object' || Array.isArray(lock) ||
    (lock.version !== undefined && lock.version !== 1) ||
    !lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) {
    throw new Error('photon.lock has invalid format')
  }

  for (const [name, entry] of Object.entries(lock.packages)) {
    validateDependencyName(name)
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      typeof entry.source !== 'string' || typeof entry.resolved !== 'string') {
      throw new Error(`photon.lock has invalid package ${name}`)
    }
  }

  return lock
}

function validateFrozenLock(dependencies, lock) {
  if (!lock) throw new Error('frozen lock requires photon.lock')

  const expectedNames = dependencies.map(([name]) => name)
  const lockedNames = Object.keys(lock.packages).sort((left, right) => left.localeCompare(right))
  if (expectedNames.length !== lockedNames.length ||
    expectedNames.some((name, index) => name !== lockedNames[index])) {
    throw new Error('frozen lock does not match photon.json dependencies')
  }

  for (const [name, source] of dependencies) {
    if (!usableLockedPackage(lock.packages[name], source)) {
      throw new Error(`frozen lock does not match dependency ${name}`)
    }
  }
}

function usableLockedPackage(entry, source) {
  if (!entry || entry.source !== source) return false
  if (isLocalSource(source)) return entry.resolved === 'local'
  return isCommit(entry.resolved)
}

function isCommit(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(value)
}

function validateDependencyName(name) {
  if (typeof name !== 'string' ||
    name.length > 214 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\')) {
    throw new Error(`invalid dependency name "${name}"`)
  }

  const root = resolve(packageRoot)
  const target = resolve(root, name)
  if (dirname(target) !== root) throw new Error(`invalid dependency name "${name}"`)
}

function isInside(root, target) {
  return target === root || target.startsWith(`${root}${sep}`)
}

async function installPackage(source, target, lockedCommit = null) {
  if (isLocalSource(source)) {
    const localPath = source.startsWith('file:')
      ? source.slice('file:'.length)
      : source

    await cp(resolve(localPath), target, {
      recursive: true
    })
    return 'local'
  }

  const { url, ref } = parseGitSource(source)
  const cloneArgs = ['clone', '--no-checkout']
  if (!lockedCommit && ref && !isCommit(ref)) cloneArgs.push('--branch', ref)
  cloneArgs.push('--', url, target)
  await run('git', cloneArgs)

  const checkout = lockedCommit ?? (ref && isCommit(ref) ? ref : 'HEAD')
  await run('git', ['-C', target, 'checkout', '--detach', checkout])
  const resolved = (await runCapture('git', ['-C', target, 'rev-parse', 'HEAD'])).toLowerCase()

  if (!isCommit(resolved)) {
    throw new Error(`Git dependency ${source} did not resolve to a commit`)
  }
  if (lockedCommit && resolved !== lockedCommit) {
    throw new Error(`Git dependency ${source} checked out ${resolved}, expected ${lockedCommit}`)
  }

  return resolved
}

function parseGitSource(source) {
  const separator = source.lastIndexOf('#')
  const rawUrl = separator === -1 ? source : source.slice(0, separator)
  const ref = separator === -1 ? null : source.slice(separator + 1)
  const url = rawUrl.startsWith('git+') ? rawUrl.slice('git+'.length) : rawUrl

  if (!url || ref === '') throw new Error(`invalid Git dependency source ${source}`)
  return { url, ref }
}

function isLocalSource(source) {
  return source.startsWith('./') ||
    source.startsWith('../') ||
    source.startsWith('/') ||
    source.startsWith('file:')
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch {
    fail('missing photon.json; run photon init')
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit'
    })

    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code}`))
    })
  })
}

function runCapture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'ignore']
    })

    let stdout = ''
    child.stdout.on('data', chunk => {
      stdout += chunk
    })

    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`${command} exited with ${code}`))
    })
  })
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function usage() {
  console.log([
    'usage: photon <command>',
    '',
    'commands:',
    '  init [name]',
    '  add name [source]',
    '  remove name',
    '  install [--frozen-lock]',
    '  frozen-lock',
    '  update',
    '  list',
    '  search [query]'
  ].join('\n'))
}
