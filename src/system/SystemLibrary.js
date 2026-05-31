export const SystemFunctions = Object.freeze({
  Println: 'println',
  Len: 'len',
  Filter: 'filter',
  Includes: 'includes',
  Uuid: 'uuid',
  Env: 'env',
  Encrypt: 'encrypt',
  Decrypt: 'decrypt'
})

export class SystemLibrary {
  constructor() {
    this.functions = new Set(Object.values(SystemFunctions))
  }

  has(name) {
    return this.functions.has(name)
  }
}
