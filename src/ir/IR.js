export class IRModule {
  constructor(functions = [], structs = []) {
    this.functions = functions
    this.structs = structs
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
