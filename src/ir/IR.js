export class IRModule {
  constructor(functions = [], structs = [], enums = [], externs = []) {
    this.functions = functions
    this.structs = structs
    this.enums = enums
    this.externs = externs
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
