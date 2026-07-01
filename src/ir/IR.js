export class IRModule {
  constructor(functions = [], structs = [], enums = [], externs = [], location = null) {
    this.kind = 'IRModule'
    this.functions = functions
    this.structs = structs
    this.enums = enums
    this.externs = externs
    this.location = location
  }
}

export class IRFunction {
  constructor(name, params, returnType, blocks = [], entry = 'entry', location = null) {
    this.kind = 'IRFunction'
    this.name = name
    this.params = params
    this.returnType = returnType
    this.blocks = blocks
    this.entry = entry
    this.location = location
  }
}

export class IRBasicBlock {
  constructor(name, instructions = [], terminator = null, location = null) {
    this.kind = 'IRBasicBlock'
    this.name = name
    this.instructions = instructions
    this.terminator = terminator
    this.location = location
  }
}

export class IRInstruction {
  constructor(op, fields = {}, location = null) {
    this.kind = 'IRInstruction'
    this.op = op
    this.location = location
    Object.assign(this, fields)
  }
}

export class IRTerminator {
  constructor(op, fields = {}, location = null) {
    this.kind = 'IRTerminator'
    this.op = op
    this.location = location
    Object.assign(this, fields)
  }
}

export class IRValue {
  constructor(op, type, fields = {}, location = null) {
    this.kind = 'IRValue'
    this.op = op
    this.type = type
    this.location = location
    Object.assign(this, fields)
  }
}
