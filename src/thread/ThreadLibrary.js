import { functionConstants, functionNames } from '../runtime/BuiltinRegistry.js'

export const ThreadFunctions = functionConstants('thread')

export class ThreadLibrary {
  constructor() {
    this.functions = new Set(functionNames('thread'))
  }

  has(name) {
    return this.functions.has(name)
  }
}
