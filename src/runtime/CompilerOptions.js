export class CompilerOptions {
  constructor({
    garbageCollector = 'off',
    ownership = 'manual',
    target = 'native',
    safety = 'checked'
  } = {}) {
    // Runtime ownership hook: manual today, future values can be arc, borrow, gc, or hybrid.
    // The parser and lexer do not depend on it.
    this.garbageCollector = garbageCollector
    this.ownership = ownership
    this.target = target
    this.safety = safety
  }
}
