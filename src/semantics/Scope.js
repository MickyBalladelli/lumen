export class Scope {
  constructor(parent = null) {
    this.parent = parent
    this.symbols = new Map()
  }

  define(name, symbol) {
    if (this.symbols.has(name)) return false
    this.symbols.set(name, symbol)
    return true
  }

  resolve(name) {
    if (this.symbols.has(name)) return this.symbols.get(name)
    return this.parent?.resolve(name) ?? null
  }
}
