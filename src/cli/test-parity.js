#!/usr/bin/env node

import { join } from 'node:path'
import {
  matrixSummary,
  runParityMatrix,
  writeParityReport
} from '../parity/ParityRunner.js'

const outputDir = join('build', 'parity')
const report = await runParityMatrix({ outputDir })
await writeParityReport(report, join(outputDir, 'matrix-report.json'))

console.table(matrixSummary(report))

if (!report.complete) {
  for (const row of report.rows.filter(item => !item.complete)) {
    console.error(`parity failed: ${row.id}`)
    for (const [dimension, check] of Object.entries(row.checks)) {
      if (!check.pass) console.error(`  ${dimension}: ${check.detail}`)
    }
  }
  process.exitCode = 1
} else {
  console.log(`${report.rows.length} parity rows complete`)
}
