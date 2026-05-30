export const SystemFunctions = Object.freeze({
  Println: 'println',
  Len: 'len',
  Filter: 'filter',
  Includes: 'includes',
  Uuid: 'uuid'
})

export class SystemLibrary {
  constructor() {
    this.functions = new Set(Object.values(SystemFunctions))
  }

  has(name) {
    return this.functions.has(name)
  }
}
