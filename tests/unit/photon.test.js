import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
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
