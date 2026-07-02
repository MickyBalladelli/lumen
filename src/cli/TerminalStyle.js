const greenCode = '\u001b[32m'
const redCode = '\u001b[31m'
const resetCode = '\u001b[0m'

export function green(message, stream = process.stdout) {
  return color(message, greenCode, stream)
}

export function red(message, stream = process.stderr) {
  return color(message, redCode, stream)
}

function color(message, code, stream) {
  if (!colorsEnabled(stream)) return message
  return `${code}${message}${resetCode}`
}

function colorsEnabled(stream) {
  if ('NO_COLOR' in process.env) return false
  if (process.env.FORCE_COLOR === '0') return false
  return Boolean(stream.isTTY || process.env.FORCE_COLOR)
}
