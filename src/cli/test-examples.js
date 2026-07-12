import { spawn } from 'node:child_process'
import { join } from 'node:path'
import {
  fail,
  pass,
  section
} from '../testing/TestReporter.js'

const suites = [
  ['Bootstrap', join('src', 'cli', 'test-suites', 'bootstrap.js')],
  ['Stage native compiler', join('scripts', 'stage-native-compiler.mjs')],
  ['Examples', join('src', 'cli', 'test-suites', 'examples.js')],
  ['CLI workflows', join('src', 'cli', 'test-suites', 'cli-workflows.js')],
  ['Negative compilation', join('src', 'cli', 'test-suites', 'negative.js')],
  ['LSP integration', join('src', 'cli', 'test-suites', 'lsp.js')]
]

let failures = 0

for (const [name, path] of suites) {
  section(name)
  const code = await runSuite(path)
  if (code !== 0) failures += 1
}

if (failures > 0) {
  console.error(fail(`${failures}/${suites.length} integration suites failed`))
  process.exitCode = 1
} else {
  console.log('')
  console.log(pass(`${suites.length}/${suites.length} integration suites passed`))
}

function runSuite(path) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path], {
      stdio: 'inherit'
    })

    child.on('error', error => {
      console.error(fail(`Could not start ${path}: ${error.message}`))
      resolve(1)
    })
    child.on('close', code => resolve(code ?? 1))
  })
}
