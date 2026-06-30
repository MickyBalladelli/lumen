import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

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

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}
