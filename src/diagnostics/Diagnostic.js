export class Diagnostic extends Error {
  constructor(message, location = null, phase = 'compiler', source = null) {
    super(location
      ? `${phase}: ${message} at ${location.line}:${location.column}`
      : `${phase}: ${message}`)
    this.name = 'Diagnostic'
    this.rawMessage = message
    this.location = location
    this.phase = phase
    this.source = source
  }

  withSource(source) {
    if (!this.location || !source) return this

    const line = source.split(/\r?\n/)[this.location.line - 1] ?? ''
    const marker = `${' '.repeat(Math.max(this.location.column - 1, 0))}^`
    this.message = `${this.phase}: ${this.rawMessage} at ${this.location.line}:${this.location.column}\n${line}\n${marker}`
    this.source = source
    return this
  }
}
