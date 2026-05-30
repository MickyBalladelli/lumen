export class Diagnostic extends Error {
  constructor(message, location = null, phase = 'compiler') {
    super(location
      ? `${phase}: ${message} at ${location.line}:${location.column}`
      : `${phase}: ${message}`)
    this.name = 'Diagnostic'
    this.location = location
    this.phase = phase
  }
}
