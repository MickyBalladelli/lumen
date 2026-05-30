import {
  AstNode,
  BlockStatementNode,
  ExpressionStatementNode,
  ForStatementNode,
  FunctionDeclarationNode,
  IdentifierNode,
  ProgramNode,
  RawExpressionNode,
  ReturnStatementNode,
  TypeAnnotationNode,
  VariableDeclarationNode,
  VariableDeclaratorNode
} from './nodes.js'

export class AstNodeRegistry {
  constructor() {
    // Parser accepts this registry by dependency injection.
    // Future compiler phases can register experimental nodes without rewriting
    // the base AST module.
    this.nodeTypes = new Map()
  }

  register(kind, nodeClass) {
    if (!(nodeClass.prototype instanceof AstNode) && nodeClass !== AstNode) {
      throw new TypeError(`${kind} must extend AstNode`)
    }

    this.nodeTypes.set(kind, nodeClass)
    return this
  }

  get(kind) {
    return this.nodeTypes.get(kind)
  }

  has(kind) {
    return this.nodeTypes.has(kind)
  }

  static withDefaults() {
    return new AstNodeRegistry()
      .register('Program', ProgramNode)
      .register('Identifier', IdentifierNode)
      .register('TypeAnnotation', TypeAnnotationNode)
      .register('VariableDeclaration', VariableDeclarationNode)
      .register('VariableDeclarator', VariableDeclaratorNode)
      .register('FunctionDeclaration', FunctionDeclarationNode)
      .register('BlockStatement', BlockStatementNode)
      .register('ForStatement', ForStatementNode)
      .register('ReturnStatement', ReturnStatementNode)
      .register('ExpressionStatement', ExpressionStatementNode)
      .register('RawExpression', RawExpressionNode)
  }
}
