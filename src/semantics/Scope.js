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

  resolveOwn(name) {
    return this.symbols.get(name) ?? null
  }

  resolve(name) {
    const symbol = this.resolveOwn(name)
    if (symbol) return symbol
    return this.parent?.resolve(name) ?? null
  }
}
