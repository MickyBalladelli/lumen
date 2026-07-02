#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { validateBuiltinRegistry } from '../runtime/BuiltinRegistry.js'
import { RuntimeUnits } from '../runtime/RuntimeUnits.js'
import { pass } from '../testing/TestReporter.js'

const runtimeSources = await Promise.all(
  RuntimeUnits.map(runtimeUnit => readFile(runtimeUnit.source, 'utf8'))
)
const emitterSources = await Promise.all([
  'src/backend/AggregateLowering.js',
  'src/backend/BuiltinLowering.js',
  'src/backend/ControlFlowLowering.js',
  'src/backend/ValueLowering.js'
].map(path => readFile(path, 'utf8')))

const errors = validateBuiltinRegistry(runtimeSources, emitterSources)
if (errors.length > 0) {
  throw new Error(`Built-in/runtime ABI drift:\n${errors.join('\n')}`)
}

console.log(pass('Built-in/runtime ABI registry'))
