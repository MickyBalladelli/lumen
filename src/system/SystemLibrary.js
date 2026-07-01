import { functionConstants, functionNames } from '../runtime/BuiltinRegistry.js'

export const SystemFunctions = functionConstants('system')

export class SystemLibrary {
  constructor() {
    this.functions = new Set(functionNames('system'))
  }

  has(name) {
    return this.functions.has(name)
  }
}
