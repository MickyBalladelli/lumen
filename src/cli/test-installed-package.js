#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LspTestClient } from '../testing/LspTestClient.js'
import { TestSuite } from '../testing/TestSuite.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const packageManifest = JSON.parse(
  await readFile(join(repoRoot, 'package.json'), 'utf8')
)
const root = await mkdtemp(join(tmpdir(), 'lumen-installed-package-'))
const packDirectory = join(root, 'packed')
const installDirectory = join(root, 'install')
const projectDirectory = join(root, 'project')
const npmCache = join(root, 'npm-cache')
const installedPackage = join(installDirectory, 'node_modules', 'lumen')
const binDirectory = join(installDirectory, 'node_modules', '.bin')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npmEnvironment = {
  ...process.env,
  npm_config_cache: npmCache,
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_update_notifier: 'false'
}
const suite = new TestSuite('installed package')
let tarballPath = ''

try {
  await mkdir(packDirectory, { recursive: true })
  await mkdir(installDirectory, { recursive: true })
  await mkdir(projectDirectory, { recursive: true })

  await suite.test('pack tarball in a clean directory', async () => {
    const result = await run(npmCommand, [
      'pack',
      repoRoot,
      '--pack-destination',
      packDirectory,
      '--json'
    ], {
      cwd: root,
      env: npmEnvironment
    })
    expectSuccess(result, 'npm pack')

    const report = JSON.parse(result.stdout)
    assert.equal(report.length, 1)
    tarballPath = join(packDirectory, report[0].filename)
    await access(tarballPath)
    assert.ok(report[0].files.some(file => file.path === 'book/install-lumen.md'))
  })

  await suite.test('install tarball without checkout access', async () => {
    assert.notEqual(tarballPath, '')
    await writeFile(join(installDirectory, 'package.json'), JSON.stringify({
      name: 'lumen-installed-package-smoke',
      private: true
    }))

    const result = await run(npmCommand, [
      'install',
      tarballPath,
      '--ignore-scripts',
      '--no-package-lock',
      '--no-audit',
      '--no-fund'
    ], {
      cwd: installDirectory,
      env: npmEnvironment
    })
    expectSuccess(result, 'npm install')

    for (const name of ['lumen', 'lmsh', 'photon', 'lumen-format', 'lumen-lsp']) {
      await access(commandPath(name))
    }
  })

  await suite.test('installed README links to shipped install guide', async () => {
    const readme = await readFile(join(installedPackage, 'README.md'), 'utf8')
    assert.match(readme, /\[Install Lumen\]\(book\/install-lumen\.md\)/)
    await access(join(installedPackage, 'book', 'install-lumen.md'))
  })

  await suite.test('lumen version, help, emit, build, and run', async () => {
    await writeFile(join(projectDirectory, 'main.lm'), [
      'function main(): i32 {',
      '  println("installed lumen")',
      '  return 0',
      '}',
      ''
    ].join('\n'))

    const version = await installed('lumen', ['--version'])
    expectSuccess(version, 'lumen --version')
    assert.equal(version.stdout, `${packageManifest.version}\n`)

    const help = await installed('lumen', ['--help'])
    expectSuccess(help, 'lumen --help')
    assert.match(help.stdout, /build \[file\.lm\]/)
    assert.match(help.stdout, /emit \[file\.lm\]/)
    assert.match(help.stdout, /run \[file\.lm\]/)

    const emit = await installed('lumen', [
      'emit',
      'main.lm',
      '-o',
      join('build', 'main.ll')
    ])
    expectSuccess(emit, 'lumen emit')
    assert.match(
      await readFile(join(projectDirectory, 'build', 'main.ll'), 'utf8'),
      /define i32 @main/
    )

    const build = await installed('lumen', [
      'build',
      'main.lm',
      '-o',
      join('build', 'main')
    ])
    expectSuccess(build, 'lumen build')
    const executable = await run(join(projectDirectory, 'build', 'main'))
    expectSuccess(executable, 'compiled program')
    assert.equal(executable.stdout, 'installed lumen\n')

    const runResult = await installed('lumen', [
      'run',
      'main.lm',
      '-o',
      join('build', 'run-main')
    ])
    expectSuccess(runResult, 'lumen run')
    assert.equal(runResult.stdout, 'installed lumen\n')
  })

  await suite.test('lmsh compiles and runs through installed command', async () => {
    const result = await installed('lmsh', ['main.lm'])
    expectSuccess(result, 'lmsh')
    assert.equal(result.stdout, 'installed lumen\n')
  })

  await suite.test('lumen-format checks and formats source', async () => {
    const check = await installed('lumen-format', ['--check', 'main.lm'])
    expectSuccess(check, 'lumen-format --check')

    await writeFile(
      join(projectDirectory, 'format.lm'),
      'function main(): i32 {\nreturn 0\n}\n'
    )
    const format = await installed('lumen-format', ['format.lm'])
    expectSuccess(format, 'lumen-format')
    const recheck = await installed('lumen-format', ['--check', 'format.lm'])
    expectSuccess(recheck, 'lumen-format --check formatted source')
  })

  await suite.test('Photon installs and compiles a bundled package', async () => {
    const help = await installed('photon', ['--help'])
    expectSuccess(help, 'photon --help')
    assert.match(help.stdout, /add name \[source\]/)

    expectSuccess(
      await installed('photon', ['init', 'installed-smoke']),
      'photon init'
    )
    expectSuccess(await installed('photon', ['list']), 'photon list')

    const search = await installed('photon', ['search', 'result'])
    expectSuccess(search, 'photon search')
    assert.match(search.stdout, /^result \S+/m)

    const add = await installed('photon', ['add', 'result'])
    expectSuccess(add, 'photon add result')
    assert.match(add.stdout, /installed result/)
    await access(join(projectDirectory, '.photon', 'packages', 'result', 'main.lm'))

    const list = await installed('photon', ['list'])
    expectSuccess(list, 'photon list result')
    assert.match(list.stdout, /^result file:/m)

    await writeFile(join(projectDirectory, 'package-main.lm'), [
      'import { unwrapOr } from "result"',
      'function main(): i32 {',
      '  println(unwrapOr(ok("package"), "fallback"))',
      '  return 0',
      '}',
      ''
    ].join('\n'))
    const result = await installed('lumen', [
      'run',
      'package-main.lm',
      '-o',
      join('build', 'package-main')
    ])
    expectSuccess(result, 'lumen run with Photon package')
    assert.equal(result.stdout, 'package\n')
  })

  await suite.test('lumen-lsp completes initialize and shutdown handshake', async () => {
    const client = new LspTestClient(commandPath('lumen-lsp'), [], {
      cwd: projectDirectory,
      env: process.env
    })

    try {
      await client.start()
      const initialized = await client.request('initialize', {
        processId: process.pid,
        rootUri: null,
        capabilities: {}
      })
      assert.equal(initialized.serverInfo.name, 'lumen-lsp')
      assert.equal(initialized.capabilities.documentFormattingProvider, true)
      assert.equal(await client.shutdown(), 0)
    } finally {
      client.stop()
    }
  })
} finally {
  await rm(root, { recursive: true, force: true })
}

suite.finish()

function commandPath(name) {
  return join(binDirectory, process.platform === 'win32' ? `${name}.cmd` : name)
}

function installed(name, args) {
  return run(commandPath(name), args, {
    cwd: projectDirectory,
    env: process.env
  })
}

function expectSuccess(result, name) {
  assert.equal(
    result.code,
    0,
    `${name} exited ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  )
}

function run(command, args = [], {
  cwd = process.cwd(),
  env = process.env
} = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd,
      env
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', code => {
      resolveResult({
        code: code ?? 1,
        stdout,
        stderr
      })
    })
  })
}
