export class IRModule {
  constructor(functions = []) {
    this.functions = functions
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
