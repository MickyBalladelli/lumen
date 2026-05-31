export class IRModule {
  constructor(functions = [], structs = [], enums = []) {
    this.functions = functions
    this.structs = structs
    this.enums = enums
  }
}

export class IRFunction {
  constructor(name, params, returnType, body = []) {
    this.name = name
    this.params = params
    this.returnType = returnType
    this.body = body
  }
}
