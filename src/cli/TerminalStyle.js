const greenCode = '\u001b[32m'
const resetCode = '\u001b[0m'

export function green(message, stream = process.stdout) {
  if (!colorsEnabled(stream)) return message
  return `${greenCode}${message}${resetCode}`
}

function colorsEnabled(stream) {
  if ('NO_COLOR' in process.env) return false
  if (process.env.FORCE_COLOR === '0') return false
  return Boolean(stream.isTTY || process.env.FORCE_COLOR)
}
