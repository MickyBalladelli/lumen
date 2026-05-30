export class AstNode {
  constructor(kind, location = null) {
    this.kind = kind
    this.location = location
  }

  accept(visitor) {
    return visitor.visit(this)
  }
}

export class ProgramNode extends AstNode {
  constructor(body = [], location = null) {
    super('Program', location)
    this.body = body
  }
}

export class IdentifierNode extends AstNode {
  constructor(name, location = null, typeAnnotation = null) {
    super('Identifier', location)
    this.name = name
    this.typeAnnotation = typeAnnotation
  }
}

export class TypeAnnotationNode extends AstNode {
  constructor(name, location = null) {
    super('TypeAnnotation', location)
    this.name = name
  }
}

export class StructDeclarationNode extends AstNode {
  constructor(name, fields, location = null) {
    super('StructDeclaration', location)
    this.name = name
    this.fields = fields
  }
}

export class StructFieldNode extends AstNode {
  constructor(name, typeAnnotation, location = null) {
    super('StructField', location)
    this.name = name
    this.typeAnnotation = typeAnnotation
  }
}

export class VariableDeclarationNode extends AstNode {
  constructor(kind, declarations, location = null) {
    super('VariableDeclaration', location)
    this.declarationKind = kind
    this.declarations = declarations
  }
}

export class VariableDeclaratorNode extends AstNode {
  constructor(id, initializer = null, location = null, typeAnnotation = null) {
    super('VariableDeclarator', location)
    this.id = id
    this.initializer = initializer
    this.typeAnnotation = typeAnnotation
  }
}

export class FunctionDeclarationNode extends AstNode {
  constructor(name, params, body, location = null, returnType = null) {
    super('FunctionDeclaration', location)
    this.name = name
    this.params = params
    this.body = body
    this.returnType = returnType
  }
}

export class BlockStatementNode extends AstNode {
  constructor(body = [], location = null) {
    super('BlockStatement', location)
    this.body = body
  }
}

export class ForStatementNode extends AstNode {
  constructor(init, test, update, body, location = null) {
    super('ForStatement', location)
    this.init = init
    this.test = test
    this.update = update
    this.body = body
  }
}

export class ForOfStatementNode extends AstNode {
  constructor(item, iterable, body, location = null) {
    super('ForOfStatement', location)
    this.item = item
    this.iterable = iterable
    this.body = body
  }
}

export class ReturnStatementNode extends AstNode {
  constructor(argument = null, location = null) {
    super('ReturnStatement', location)
    this.argument = argument
  }
}

export class ThrowStatementNode extends AstNode {
  constructor(argument, location = null) {
    super('ThrowStatement', location)
    this.argument = argument
  }
}

export class TryCatchStatementNode extends AstNode {
  constructor(tryBlock, catchParam, catchBlock, location = null) {
    super('TryCatchStatement', location)
    this.tryBlock = tryBlock
    this.catchParam = catchParam
    this.catchBlock = catchBlock
  }
}

export class ExpressionStatementNode extends AstNode {
  constructor(expression, location = null) {
    super('ExpressionStatement', location)
    this.expression = expression
  }
}

export class RawExpressionNode extends AstNode {
  constructor(tokens = [], location = null) {
    super('RawExpression', location)
    this.tokens = tokens
  }
}
