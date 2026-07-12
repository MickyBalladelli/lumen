import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = await readJson(join(root, 'package.json'))
const photonManifest = await readJson(join(root, 'photon.json'))
const extensionManifest = await readJson(
  join(root, 'vscode-lumen', 'package.json')
)
const extensionLock = await readJson(
  join(root, 'vscode-lumen', 'package-lock.json')
)
const version = manifest.version
const nativeCompilerName = `lumen-compiler-${process.platform}-${process.arch}-${version}`
const nativeBundleName = `lumen-native-${process.platform}-${process.arch}-${version}.tgz`
const artifactNames = [
  `lumen-${version}.tgz`,
  `lumen-language-${version}.vsix`,
  nativeCompilerName,
  nativeBundleName
]
const outputDirectory = join(root, 'dist')
const temporaryRoot = await mkdtemp(join(tmpdir(), 'lumen-release-'))

const synchronizedVersions = [
  photonManifest.version,
  extensionManifest.version,
  extensionLock.version,
  extensionLock.packages[''].version
]

if (synchronizedVersions.some(value => value !== version)) {
  throw new Error('release package versions are not synchronized')
}

try {
  const first = await buildArtifacts(join(temporaryRoot, 'first'))
  const second = await buildArtifacts(join(temporaryRoot, 'second'))

  for (const name of artifactNames) {
    if (first.get(name) !== second.get(name)) {
      throw new Error(`${name} is not reproducible`)
    }
  }

  await mkdir(outputDirectory, { recursive: true })

  for (const name of artifactNames) {
    await rm(join(outputDirectory, name), { force: true })
    await copyFile(
      join(temporaryRoot, 'first', 'artifacts', name),
      join(outputDirectory, name)
    )
  }

  const checksums = artifactNames
    .map(name => `${first.get(name)}  ${name}`)
    .join('\n')
  await writeFile(
    join(outputDirectory, `SHA256SUMS-${process.platform}-${process.arch}`),
    `${checksums}\n`
  )

  console.log(`reproducible release artifacts written to ${outputDirectory}`)
  console.log(checksums)
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

async function buildArtifacts(buildRoot) {
  const artifacts = join(buildRoot, 'artifacts')
  const npmCache = join(buildRoot, 'npm-cache')
  const extensionRoot = join(buildRoot, 'vscode-lumen')

  await mkdir(artifacts, { recursive: true })
  await packageTarball(artifacts, npmCache)
  await copyFile(
    join(artifacts, `lumen-${version}.tgz`),
    join(artifacts, nativeBundleName)
  )
  await stageExtension(extensionRoot)
  await packageExtension(extensionRoot, artifacts)
  await copyFile(
    join(root, 'native', `${process.platform}-${process.arch}`, 'lumen-compiler'),
    join(artifacts, nativeCompilerName)
  )

  const checksums = new Map()

  for (const name of artifactNames) {
    checksums.set(name, await sha256(join(artifacts, name)))
  }

  return checksums
}

async function packageTarball(artifacts, npmCache) {
  const result = await run('npm', [
    'pack',
    root,
    '--pack-destination',
    artifacts,
    '--ignore-scripts',
    '--json'
  ], {
    cwd: artifacts,
    env: {
      ...process.env,
      npm_config_cache: npmCache,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false'
    }
  })

  if (result.code !== 0) {
    throw new Error(`npm pack failed\n${result.stderr}`)
  }

  const report = JSON.parse(result.stdout)[0]

  if (report.filename !== artifactNames[0]) {
    throw new Error(`unexpected npm artifact: ${report.filename}`)
  }
}

async function stageExtension(extensionRoot) {
  const sourceRoot = join(root, 'vscode-lumen')

  await cp(sourceRoot, extensionRoot, {
    recursive: true,
    filter: source => {
      const relative = source.slice(sourceRoot.length + 1)
      const firstPart = relative.split(/[/\\]/)[0]
      return !['node_modules', 'compiler'].includes(firstPart) &&
        !source.endsWith('.vsix')
    }
  })
  await cp(join(root, 'src'), join(extensionRoot, 'compiler', 'src'), {
    recursive: true
  })
  await copyFile(
    join(root, 'package.json'),
    join(extensionRoot, 'compiler', 'package.json')
  )
  await copyFile(join(root, 'LICENSE'), join(extensionRoot, 'LICENSE'))
  await copyFile(join(root, 'CHANGELOG.md'), join(extensionRoot, 'CHANGELOG.md'))
  await normalizeTimes(extensionRoot)
}

async function packageExtension(extensionRoot, artifacts) {
  const vsce = join(
    root,
    'vscode-lumen',
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vsce.cmd' : 'vsce'
  )
  const result = await run(vsce, [
    'package',
    '--no-dependencies',
    '--out',
    join(artifacts, artifactNames[1])
  ], {
    cwd: extensionRoot,
    env: {
      ...process.env,
      SOURCE_DATE_EPOCH: '946684800',
      TZ: 'UTC'
    }
  })

  if (result.code !== 0) {
    throw new Error(`vsce package failed\n${result.stdout}\n${result.stderr}`)
  }
}

async function normalizeTimes(path) {
  const info = await stat(path)

  if (info.isDirectory()) {
    const entries = await readdir(path)
    entries.sort()

    for (const entry of entries) {
      await normalizeTimes(join(path, entry))
    }
  }

  const epoch = new Date('2000-01-01T00:00:00.000Z')
  await utimes(path, epoch, epoch)
}

async function sha256(path) {
  const contents = await readFile(path)
  return createHash('sha256').update(contents).digest('hex')
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function run(command, args, options) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, options)
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
      resolveResult({ code: code ?? 1, stdout, stderr })
    })
  })
}
