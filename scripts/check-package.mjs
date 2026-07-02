import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const temporaryRoot = await mkdtemp(join(tmpdir(), 'lumen-package-check-'))

validateMetadata()

try {
  const result = await run('npm', [
    'pack',
    root,
    '--dry-run',
    '--ignore-scripts',
    '--json'
  ], {
    cwd: temporaryRoot,
    env: {
      ...process.env,
      npm_config_cache: join(temporaryRoot, 'npm-cache'),
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false'
    }
  })

  if (result.code !== 0) {
    throw new Error(`npm pack --dry-run failed\n${result.stderr}`)
  }

  const report = JSON.parse(result.stdout)[0]
  const paths = new Set(report.files.map(file => file.path))
  const requiredPaths = [
    'CHANGELOG.md',
    'LICENSE',
    'README.md',
    'book/install-lumen.md',
    'package.json',
    'photon.json',
    'src/cli/lumen.js',
    'src/cli/lsp.js',
    'src/version.js'
  ]
  const missingPaths = requiredPaths.filter(path => !paths.has(path))

  if (missingPaths.length > 0) {
    throw new Error(`package is missing: ${missingPaths.join(', ')}`)
  }

  console.log(
    `package dry run OK: ${report.filename} (${report.entryCount} files)`
  )
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

function validateMetadata() {
  const expected = {
    license: 'MIT',
    homepage: 'https://github.com/MickyBalladelli/lumen#readme'
  }

  for (const [key, value] of Object.entries(expected)) {
    if (manifest[key] !== value) {
      throw new Error(`package.json ${key} must be ${value}`)
    }
  }

  if (manifest.repository?.url !==
    'git+https://github.com/MickyBalladelli/lumen.git') {
    throw new Error('package.json repository URL is missing or invalid')
  }
  if (manifest.bugs?.url !==
    'https://github.com/MickyBalladelli/lumen/issues') {
    throw new Error('package.json bugs URL is missing or invalid')
  }
  if (manifest.engines?.node !== '>=20') {
    throw new Error('package.json Node engine must be >=20')
  }
  if (manifest.publishConfig?.access !== 'public') {
    throw new Error('package.json publish access must be public')
  }
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
