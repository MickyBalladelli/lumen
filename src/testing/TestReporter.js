import { green, red } from '../cli/TerminalStyle.js'

export function pass(message) {
  return green(`✔ ${message}`)
}

export function fail(message) {
  return red(`✖ ${message}`)
}

export function section(message) {
  const line = '─'.repeat(message.length)
  console.log(`\n${message}\n${line}`)
}

export function finalSummary(results) {
  section('Test summary')

  for (const result of results) {
    console.log(result.passed
      ? pass(result.name)
      : fail(result.name)
    )
  }

  const passed = results.filter(result => result.passed).length
  const message = `${passed}/${results.length} test layers passed`

  console.log('')
  if (passed === results.length) console.log(pass(message))
  else console.log(fail(message))
}
