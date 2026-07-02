import { spawn } from 'node:child_process'
import { join } from 'node:path'

const suites = [
  'examples',
  'cli-workflows',
  'negative',
  'lsp',
  'bootstrap'
]

let failures = 0

for (const suite of suites) {
  const code = await runSuite(join('src', 'cli', 'test-suites', `${suite}.js`))
  if (code !== 0) failures += 1
}

if (failures > 0) {
  console.error(`${failures} test suite failed`)
  process.exitCode = 1
}

function runSuite(path) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path], {
      stdio: 'inherit'
    })

    child.on('error', error => {
      console.error(`failed to start ${path}: ${error.message}`)
      resolve(1)
    })
    child.on('close', code => resolve(code ?? 1))
  })
}
