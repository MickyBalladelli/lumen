#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  finalSummary,
  section
} from '../testing/TestReporter.js'

const unitTests = (await readdir(join('tests', 'unit')))
  .filter(file => file.endsWith('.test.js'))
  .sort()
  .map(file => join('tests', 'unit', file))

const layers = [
  {
    name: 'Unit tests',
    args: ['--test', '--test-reporter=spec', ...unitTests]
  },
  {
    name: 'HTTP runtime',
    args: [join('src', 'cli', 'test-http-runtime.js')]
  },
  {
    name: 'Installed package',
    args: [join('src', 'cli', 'test-installed-package.js')]
  },
  {
    name: 'Compiler integration',
    args: [join('src', 'cli', 'test-examples.js')]
  },
  {
    name: 'Parity matrix',
    args: [join('src', 'cli', 'test-parity.js')]
  },
  {
    name: 'Sanitizers',
    args: [join('src', 'cli', 'test-sanitizers.js')]
  }
]

const results = []

for (const layer of layers) {
  section(layer.name)
  const code = await run(layer.args)
  results.push({
    name: layer.name,
    passed: code === 0
  })
}

finalSummary(results)

if (results.some(result => !result.passed)) process.exitCode = 1

function run(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit'
    })

    child.on('error', error => {
      console.error(error.message)
      resolve(1)
    })
    child.on('close', code => resolve(code ?? 1))
  })
}
