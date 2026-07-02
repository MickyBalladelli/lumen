import assert from 'node:assert/strict'
import test from 'node:test'
import {
  printSpeedtestResults,
  rankRows
} from '../../src/cli/SpeedtestReporter.js'

const rows = [
  benchmark('sum', 'lumen', '5.00', '6.00'),
  benchmark('sum', 'rust', '4.00', '4.50'),
  benchmark('sum', 'python', '3.00', '3.50', 'wrong output'),
  benchmark('fib', 'lumen', '8.00', '9.00'),
  benchmark('fib', 'rust', '10.00', '11.00')
]

test('speedtest ranks only valid rows per benchmark', () => {
  const ranks = rankRows(rows, ['sum', 'fib'])

  assert.equal(ranks.get(rows[1]), '1st')
  assert.equal(ranks.get(rows[0]), '2nd')
  assert.equal(ranks.has(rows[2]), false)
  assert.equal(ranks.get(rows[3]), '1st')
})

test('speedtest separates benchmarks and colors winners and invalid rows', () => {
  const lines = []
  const colorStream = { isTTY: true }
  const noColor = process.env.NO_COLOR
  const forceColor = process.env.FORCE_COLOR

  try {
    delete process.env.NO_COLOR
    process.env.FORCE_COLOR = '1'
    printSpeedtestResults(rows, ['sum', 'fib'], {
      write: line => lines.push(line),
      stream: colorStream
    })
  } finally {
    restoreEnvironment('NO_COLOR', noColor)
    restoreEnvironment('FORCE_COLOR', forceColor)
  }

  assert.match(lines[0], /^\u001b\[36mSUM/)
  assert.ok(lines.some(line => /^\u001b\[32mrust/.test(line)))
  assert.ok(lines.some(line => /^\u001b\[33mpython/.test(line)))
  assert.ok(lines.includes(''))
  assert.ok(lines.some(line => /\u001b\[32mWinner: rust \(4\.00 ms best run\)/.test(line)))
  assert.ok(lines.some(line => /\u001b\[32mWinner: lumen \(8\.00 ms best run\)/.test(line)))
})

function benchmark(testName, language, bestMs, medianMs, note = '') {
  return {
    test: testName,
    language,
    bestMs,
    medianMs,
    note
  }
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
