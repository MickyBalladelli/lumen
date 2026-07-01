import { functionConstants, functionNames } from '../runtime/BuiltinRegistry.js'

export const FsFunctions = functionConstants('fs')

export class FsLibrary {
  constructor() {
    this.functions = new Set(functionNames('fs'))
  }

  has(name) {
    return this.functions.has(name)
  }
}
