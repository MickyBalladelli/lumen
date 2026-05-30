export class CompilerOptions {
  constructor({
    garbageCollector = 'off',
    target = 'native',
    safety = 'checked'
  } = {}) {
    // Future hook: this can become "off", "ref-counted", "tracing", etc.
    // The parser and lexer do not depend on it.
    this.garbageCollector = garbageCollector
    this.target = target
    this.safety = safety
  }
}
