export const SystemFunctions = Object.freeze({
  Println: 'println',
  Len: 'len',
  Filter: 'filter'
})

export class SystemLibrary {
  constructor() {
    this.functions = new Set(Object.values(SystemFunctions))
  }

  has(name) {
    return this.functions.has(name)
  }
}
