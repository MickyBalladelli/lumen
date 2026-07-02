import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checkOnly = process.argv.includes('--check')
const rootManifest = await readJson('package.json')
const version = rootManifest.version

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`package.json version must be X.Y.Z, got ${version}`)
}

const targets = [
  ['photon.json', manifest => {
    manifest.version = version
  }],
  ['vscode-lumen/package.json', manifest => {
    manifest.version = version
  }],
  ['vscode-lumen/package-lock.json', manifest => {
    manifest.version = version
    manifest.packages[''].version = version
  }]
]

const mismatches = []

for (const [path, update] of targets) {
  const manifest = await readJson(path)
  const before = JSON.stringify(manifest)
  update(manifest)

  if (JSON.stringify(manifest) === before) continue

  if (checkOnly) {
    mismatches.push(path)
  } else {
    await writeFile(resolve(root, path), `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`updated ${path} to ${version}`)
  }
}

if (mismatches.length > 0) {
  throw new Error(
    `version ${version} is not synchronized in: ${mismatches.join(', ')}`
  )
}

if (checkOnly) console.log(`all package versions match ${version}`)

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'))
}
