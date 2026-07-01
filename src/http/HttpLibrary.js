import { functionConstants, functionNames } from '../runtime/BuiltinRegistry.js'

export const HttpFunctions = functionConstants('http')

export class HttpLibrary {
  constructor() {
    this.functions = new Set(functionNames('http'))
  }

  has(name) {
    return this.functions.has(name)
  }
}
