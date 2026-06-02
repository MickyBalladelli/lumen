#!/usr/bin/env node
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const command = process.argv[2]
const args = process.argv.slice(3)

const manifestPath = 'photon.json'
const lockPath = 'photon.lock'
const packageRoot = join('.photon', 'packages')

if (!command || command === '-h' || command === '--help') {
  usage()
  process.exit(command ? 0 : 1)
}

if (command === 'init') {
  if (await exists(manifestPath)) fail('photon.json already exists')

  await writeJson(manifestPath, {
    name: basename(process.cwd()),
    version: '0.1.0',
    dependencies: {}
  })
  console.log('created photon.json')
} else if (command === 'add') {
  const [name, source] = args
  if (!name || !source) fail('usage: photon add name source')

  const manifest = await readManifest()
  manifest.dependencies ??= {}
  manifest.dependencies[name] = source
  await writeJson(manifestPath, manifest)
  await install()
} else if (command === 'remove') {
  const [name] = args
  if (!name) fail('usage: photon remove name')

  const manifest = await readManifest()
  delete manifest.dependencies?.[name]
  await writeJson(manifestPath, manifest)
  await rm(join(packageRoot, name), { recursive: true, force: true })
  await install()
} else if (command === 'install') {
  await install()
} else if (command === 'list') {
  const manifest = await readManifest()
  for (const [name, source] of Object.entries(manifest.dependencies ?? {})) {
    console.log(`${name} ${source}`)
  }
} else {
  fail(`unknown command: ${command}`)
}

async function install() {
  const manifest = await readManifest()
  const lock = {
    packages: {}
  }

  await rm(packageRoot, { recursive: true, force: true })
  await mkdir(packageRoot, { recursive: true })

  for (const [name, source] of Object.entries(manifest.dependencies ?? {})) {
    const target = join(packageRoot, name)
    await rm(target, { recursive: true, force: true })
    await installPackage(source, target)

    lock.packages[name] = {
      source,
      resolved: isLocalSource(source)
        ? 'local'
        : await resolvePackageVersion(target)
    }

    console.log(`installed ${name}`)
  }

  await writeJson(lockPath, lock)
}

async function installPackage(source, target) {
  if (isLocalSource(source)) {
    const localPath = source.startsWith('file:')
      ? source.slice('file:'.length)
      : source

    await cp(resolve(localPath), target, {
      recursive: true
    })
    return
  }

  const [url, ref] = source.split('#')
  const args = ['clone', '--depth', '1']
  if (ref) args.push('--branch', ref)
  args.push(url, target)

  await run('git', args)
}

async function resolvePackageVersion(target) {
  try {
    return await runCapture('git', ['-C', target, 'rev-parse', 'HEAD'])
  } catch {
    return 'local'
  }
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
    '  init',
    '  add name source',
    '  remove name',
    '  install',
    '  list'
  ].join('\n'))
}
