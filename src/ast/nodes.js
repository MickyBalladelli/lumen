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

export class EnumDeclarationNode extends AstNode {
  constructor(name, variants, location = null) {
    super('EnumDeclaration', location)
    this.name = name
    this.variants = variants
  }
}

export class ImportDeclarationNode extends AstNode {
  constructor(names, source, location = null) {
    super('ImportDeclaration', location)
    this.names = names
    this.source = source
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

export class ExternFunctionDeclarationNode extends AstNode {
  constructor(name, params, location = null, returnType = null) {
    super('ExternFunctionDeclaration', location)
    this.name = name
    this.params = params
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

export class ForRangeStatementNode extends AstNode {
  constructor(item, start, end, body, location = null) {
    super('ForRangeStatement', location)
    this.item = item
    this.start = start
    this.end = end
    this.body = body
  }
}

export class WhileStatementNode extends AstNode {
  constructor(test, body, location = null) {
    super('WhileStatement', location)
    this.test = test
    this.body = body
  }
}

export class DoUntilStatementNode extends AstNode {
  constructor(body, test, location = null) {
    super('DoUntilStatement', location)
    this.body = body
    this.test = test
  }
}

export class IfStatementNode extends AstNode {
  constructor(test, consequent, alternate = null, location = null) {
    super('IfStatement', location)
    this.test = test
    this.consequent = consequent
    this.alternate = alternate
  }
}

export class SwitchCaseNode extends AstNode {
  constructor(test, body, location = null) {
    super('SwitchCase', location)
    this.test = test
    this.body = body
  }
}

export class SwitchStatementNode extends AstNode {
  constructor(discriminant, cases, defaultCase = null, location = null) {
    super('SwitchStatement', location)
    this.discriminant = discriminant
    this.cases = cases
    this.defaultCase = defaultCase
  }
}

export class BreakStatementNode extends AstNode {
  constructor(location = null) {
    super('BreakStatement', location)
  }
}

export class ContinueStatementNode extends AstNode {
  constructor(location = null) {
    super('ContinueStatement', location)
  }
}

export class DeferStatementNode extends AstNode {
  constructor(expression, location = null) {
    super('DeferStatement', location)
    this.expression = expression
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
  constructor(tokens = [], location = null, parsed = null) {
    super('RawExpression', location)
    this.tokens = tokens
    this.parsed = parsed
  }
}

export class ExpressionNode extends AstNode {
  constructor(kind, location = null, tokens = []) {
    super(kind, location)
    this.tokens = tokens
  }
}

export class LiteralExpressionNode extends ExpressionNode {
  constructor(token, tokens = [token]) {
    super('LiteralExpression', token.location, tokens)
    this.token = token
    this.value = token.literal
  }
}

export class IdentifierExpressionNode extends ExpressionNode {
  constructor(name, location = null, tokens = []) {
    super('IdentifierExpression', location, tokens)
    this.name = name
  }
}

export class CallExpressionNode extends ExpressionNode {
  constructor(callee, args, location = null, tokens = []) {
    super('CallExpression', location, tokens)
    this.callee = callee
    this.arguments = args
  }
}

export class MemberExpressionNode extends ExpressionNode {
  constructor(object, property, computed, location = null, tokens = []) {
    super('MemberExpression', location, tokens)
    this.object = object
    this.property = property
    this.computed = computed
  }
}

export class AssignmentExpressionNode extends ExpressionNode {
  constructor(operator, left, right, location = null, tokens = []) {
    super('AssignmentExpression', location, tokens)
    this.operator = operator
    this.left = left
    this.right = right
  }
}

export class UpdateExpressionNode extends ExpressionNode {
  constructor(operator, argument, prefix, location = null, tokens = []) {
    super('UpdateExpression', location, tokens)
    this.operator = operator
    this.argument = argument
    this.prefix = prefix
  }
}

export class UnaryExpressionNode extends ExpressionNode {
  constructor(operator, argument, location = null, tokens = []) {
    super('UnaryExpression', location, tokens)
    this.operator = operator
    this.argument = argument
  }
}

export class BinaryExpressionNode extends ExpressionNode {
  constructor(operator, left, right, location = null, tokens = []) {
    super('BinaryExpression', location, tokens)
    this.operator = operator
    this.left = left
    this.right = right
  }
}

export class ArrayExpressionNode extends ExpressionNode {
  constructor(elements, location = null, tokens = []) {
    super('ArrayExpression', location, tokens)
    this.elements = elements
  }
}

export class StructExpressionNode extends ExpressionNode {
  constructor(name, fields, location = null, tokens = []) {
    super('StructExpression', location, tokens)
    this.name = name
    this.fields = fields
  }
}

export class StructPropertyNode extends ExpressionNode {
  constructor(key, value, location = null, tokens = []) {
    super('StructProperty', location, tokens)
    this.key = key
    this.value = value
  }
}

export class MatchExpressionNode extends ExpressionNode {
  constructor(discriminant, arms, location = null, tokens = []) {
    super('MatchExpression', location, tokens)
    this.discriminant = discriminant
    this.arms = arms
  }
}

export class MatchArmNode extends ExpressionNode {
  constructor(pattern, value, location = null, tokens = []) {
    super('MatchArm', location, tokens)
    this.pattern = pattern
    this.value = value
  }
}

export class AwaitExpressionNode extends ExpressionNode {
  constructor(argument, location = null, tokens = []) {
    super('AwaitExpression', location, tokens)
    this.argument = argument
  }
}

export class ArrowFunctionExpressionNode extends ExpressionNode {
  constructor(params, body, location = null, tokens = []) {
    super('ArrowFunctionExpression', location, tokens)
    this.params = params
    this.body = body
  }
}

export class SliceExpressionNode extends ExpressionNode {
  constructor(start, end, location = null, tokens = []) {
    super('SliceExpression', location, tokens)
    this.start = start
    this.end = end
  }
}
