export const SystemFunctions = Object.freeze({
  Println: 'println',
  Len: 'len',
  Filter: 'filter',
  Includes: 'includes'
})

export class SystemLibrary {
  constructor() {
    this.functions = new Set(Object.values(SystemFunctions))
  }

  has(name) {
    return this.functions.has(name)
  }
}
