import { spawn } from 'node:child_process'
import { join } from 'node:path'
import {
  fail,
  pass,
  section
} from '../testing/TestReporter.js'

const suites = [
  ['Examples', 'examples'],
  ['CLI workflows', 'cli-workflows'],
  ['Negative compilation', 'negative'],
  ['LSP integration', 'lsp'],
  ['Bootstrap', 'bootstrap']
]

let failures = 0

for (const [name, file] of suites) {
  section(name)
  const code = await runSuite(join('src', 'cli', 'test-suites', `${file}.js`))
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
