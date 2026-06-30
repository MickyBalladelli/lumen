export class Diagnostic extends Error {
  constructor(message, location = null, phase = 'compiler', source = null) {
    const position = location
      ? [location.sourcePath, location.line, location.column].filter(value => value !== null && value !== undefined).join(':')
      : null

    super(position
      ? `${phase}: ${message} at ${position}`
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
    const position = [
      this.location.sourcePath,
      this.location.line,
      this.location.column
    ].filter(value => value !== null && value !== undefined).join(':')
    this.message = `${this.phase}: ${this.rawMessage} at ${position}\n${line}\n${marker}`
    this.source = source
    return this
  }
}
