import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const photonCli = new URL('../../src/cli/photon.js', import.meta.url)

function photon(args, cwd) {
  return spawnSync(process.execPath, [photonCli.pathname, ...args], {
    cwd,
    encoding: 'utf8'
  })
}

test('photon search lists bundled packages', () => {
  const result = photon(['search', 'result'], process.cwd())

  assert.equal(result.status, 0)
  assert.match(result.stdout, /^result 0\.1\.0/m)
  assert.match(result.stdout, /exports: .*unwrap/)
})

test('photon add name installs bundled package shortcut', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lumen-photon-'))

  assert.equal(photon(['init', 'app'], cwd).status, 0)

  const add = photon(['add', 'result'], cwd)
  assert.equal(add.status, 0, add.stderr)
  assert.match(add.stdout, /installed result/)

  const manifest = JSON.parse(await readFile(join(cwd, 'photon.json'), 'utf8'))

  assert.match(manifest.dependencies.result, /^file:/)
  assert.equal(existsSync(join(cwd, '.photon', 'packages', 'result', 'main.lm')), true)
})

test('photon rejects dependency names that escape package root', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lumen-photon-'))
  const source = await makePackage(cwd, 'source', 'safe')

  await writeJson(join(cwd, 'photon.json'), {
    name: 'app',
    dependencies: {
      kept: `file:${source}`
    }
  })
  assert.equal(photon(['install'], cwd).status, 0)

  await writeJson(join(cwd, 'photon.json'), {
    name: 'app',
    dependencies: {
      '../escape': `file:${source}`
    }
  })
  const result = photon(['install'], cwd)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /invalid dependency name/)
  assert.equal(
    await readFile(join(cwd, '.photon', 'packages', 'kept', 'main.lm'), 'utf8'),
    'safe'
  )
  assert.equal(existsSync(join(cwd, '.photon', 'escape')), false)
})

test('photon keeps old install when staged package validation fails', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lumen-photon-'))
  const stableSource = await makePackage(cwd, 'stable-source', 'version one')
  const brokenSource = join(cwd, 'broken-source')
  await mkdir(brokenSource)
  await writeJson(join(brokenSource, 'photon.json'), {
    name: 'broken',
    main: 'missing.lm'
  })

  await writeJson(join(cwd, 'photon.json'), {
    name: 'app',
    dependencies: {
      stable: `file:${stableSource}`
    }
  })
  assert.equal(photon(['install'], cwd).status, 0)
  const oldLock = await readFile(join(cwd, 'photon.lock'), 'utf8')

  await writeFile(join(stableSource, 'main.lm'), 'version two')
  await writeJson(join(cwd, 'photon.json'), {
    name: 'app',
    dependencies: {
      stable: `file:${stableSource}`,
      broken: `file:${brokenSource}`
    }
  })

  const result = photon(['install'], cwd)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /package broken missing missing\.lm/)
  assert.equal(
    await readFile(join(cwd, '.photon', 'packages', 'stable', 'main.lm'), 'utf8'),
    'version one'
  )
  assert.equal(existsSync(join(cwd, '.photon', 'packages', 'broken')), false)
  assert.equal(await readFile(join(cwd, 'photon.lock'), 'utf8'), oldLock)

  const photonEntries = await readdir(join(cwd, '.photon'))
  assert.deepEqual(photonEntries, ['packages'])
})

test('photon install reuses Git commit and update refreshes it', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lumen-photon-'))
  const repository = await makeGitPackage(cwd, 'git-source', 'version one')
  const source = `git+${pathToFileURL(repository).href}#main`
  const firstCommit = git(['rev-parse', 'HEAD'], repository).stdout.trim()

  await writeJson(join(cwd, 'photon.json'), {
    name: 'app',
    dependencies: {
      remote: source
    }
  })

  const firstInstall = photon(['install'], cwd)
  assert.equal(firstInstall.status, 0, firstInstall.stderr)
  const firstLockText = await readFile(join(cwd, 'photon.lock'), 'utf8')
  const firstLock = JSON.parse(firstLockText)
  assert.equal(firstLock.version, 1)
  assert.equal(firstLock.packages.remote.source, source)
  assert.equal(firstLock.packages.remote.resolved, firstCommit)

  await commitPackage(repository, 'version two', 'second')
  const secondCommit = git(['rev-parse', 'HEAD'], repository).stdout.trim()
  assert.notEqual(secondCommit, firstCommit)

  const lockedInstall = photon(['install'], cwd)
  assert.equal(lockedInstall.status, 0, lockedInstall.stderr)
  assert.equal(
    await readFile(join(cwd, '.photon', 'packages', 'remote', 'main.lm'), 'utf8'),
    'version one'
  )
  assert.equal(
    git(['rev-parse', 'HEAD'], join(cwd, '.photon', 'packages', 'remote')).stdout.trim(),
    firstCommit
  )
  assert.equal(await readFile(join(cwd, 'photon.lock'), 'utf8'), firstLockText)

  const update = photon(['update'], cwd)
  assert.equal(update.status, 0, update.stderr)
  assert.equal(
    await readFile(join(cwd, '.photon', 'packages', 'remote', 'main.lm'), 'utf8'),
    'version two'
  )
  const updatedLock = JSON.parse(await readFile(join(cwd, 'photon.lock'), 'utf8'))
  assert.equal(updatedLock.packages.remote.resolved, secondCommit)
})

test('photon frozen lock requires exact manifest and leaves lock unchanged', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lumen-photon-'))
  const repository = await makeGitPackage(cwd, 'git-source', 'version one')
  const source = `git+${pathToFileURL(repository).href}#main`

  await writeJson(join(cwd, 'photon.json'), {
    name: 'app',
    dependencies: {
      remote: source
    }
  })
  assert.equal(photon(['install'], cwd).status, 0)
  const lockText = await readFile(join(cwd, 'photon.lock'), 'utf8')

  const frozen = photon(['install', '--frozen-lock'], cwd)
  assert.equal(frozen.status, 0, frozen.stderr)
  assert.equal(await readFile(join(cwd, 'photon.lock'), 'utf8'), lockText)

  await writeJson(join(cwd, 'photon.json'), {
    name: 'app',
    dependencies: {
      remote: `${source}-changed`
    }
  })
  const mismatch = photon(['frozen-lock'], cwd)
  assert.equal(mismatch.status, 1)
  assert.match(mismatch.stderr, /frozen lock does not match dependency remote/)
  assert.equal(await readFile(join(cwd, 'photon.lock'), 'utf8'), lockText)
  assert.equal(
    await readFile(join(cwd, '.photon', 'packages', 'remote', 'main.lm'), 'utf8'),
    'version one'
  )
})

async function makePackage(cwd, directory, contents) {
  const target = join(cwd, directory)
  await mkdir(target)
  await writeJson(join(target, 'photon.json'), {
    name: directory,
    main: 'main.lm'
  })
  await writeFile(join(target, 'main.lm'), contents)
  return target
}

async function makeGitPackage(cwd, directory, contents) {
  const target = await makePackage(cwd, directory, contents)
  git(['init', '-q', '-b', 'main'], target)
  git(['add', '.'], target)
  git([
    '-c',
    'user.name=Photon Test',
    '-c',
    'user.email=photon@example.test',
    'commit',
    '-q',
    '-m',
    'first'
  ], target)
  return target
}

async function commitPackage(repository, contents, message) {
  await writeFile(join(repository, 'main.lm'), contents)
  git(['add', 'main.lm'], repository)
  git([
    '-c',
    'user.name=Photon Test',
    '-c',
    'user.email=photon@example.test',
    'commit',
    '-q',
    '-m',
    message
  ], repository)
}

function git(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  return result
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}
