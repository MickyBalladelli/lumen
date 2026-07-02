import {
  cyan,
  green,
  yellow
} from './TerminalStyle.js'

export function printSpeedtestResults(rows, tests, {
  write = value => console.log(value),
  stream = process.stdout
} = {}) {
  const ranks = rankRows(rows, tests)

  tests.forEach((test, index) => {
    if (index > 0) write('')

    const testRows = rows.filter(row => row.test === test)
    const headers = ['language', 'rank', 'best run ms', 'median run ms', 'note']
    const body = testRows.map(row => [
      row.language,
      ranks.get(row) ?? '-',
      row.bestMs,
      row.medianMs,
      row.note
    ])
    const widths = headers.map((header, column) => Math.max(
      header.length,
      ...body.map(row => String(row[column]).length)
    ))
    const winner = winningRow(testRows)

    write(cyan(test.toUpperCase(), stream))
    write('─'.repeat(test.length))
    write(formatRow(headers, widths))
    write(widths.map(width => '-'.repeat(width)).join('-+-'))

    testRows.forEach((row, rowIndex) => {
      const line = formatRow(body[rowIndex], widths)
      if (row === winner) write(green(line, stream))
      else if (row.note) write(yellow(line, stream))
      else write(line)
    })

    if (winner) {
      write(green(
        `Winner: ${winner.language} (${winner.bestMs} ms best run)`,
        stream
      ))
    } else {
      write(yellow('Winner: none — no valid benchmark completed', stream))
    }
  })
}

export function rankRows(rows, tests) {
  const ranks = new Map()

  for (const test of tests) {
    const testRows = validRows(rows.filter(row => row.test === test))
      .sort((left, right) => Number(left.bestMs) - Number(right.bestMs))

    testRows.forEach((row, index) => {
      ranks.set(row, ordinal(index + 1))
    })
  }

  return ranks
}

function winningRow(rows) {
  return validRows(rows)
    .sort((left, right) => Number(left.bestMs) - Number(right.bestMs))[0] ?? null
}

function validRows(rows) {
  return rows.filter(row => {
    return !row.note && Number.isFinite(Number(row.bestMs))
  })
}

function ordinal(value) {
  if (value === 1) return '1st'
  if (value === 2) return '2nd'
  if (value === 3) return '3rd'

  return `${value}th`
}

function formatRow(values, widths) {
  return values
    .map((value, index) => String(value).padEnd(widths[index]))
    .join(' | ')
}
