import {
  AstNode,
  BlockStatementNode,
  BreakStatementNode,
  ContinueStatementNode,
  DeferStatementNode,
  DoUntilStatementNode,
  EnumDeclarationNode,
  ExpressionStatementNode,
  ForOfStatementNode,
  ForRangeStatementNode,
  ForStatementNode,
  FunctionDeclarationNode,
  IdentifierNode,
  IfStatementNode,
  ImportDeclarationNode,
  ProgramNode,
  RawExpressionNode,
  ReturnStatementNode,
  StructDeclarationNode,
  StructFieldNode,
  SwitchCaseNode,
  SwitchStatementNode,
  ThrowStatementNode,
  TryCatchStatementNode,
  TypeAnnotationNode,
  VariableDeclarationNode,
  VariableDeclaratorNode,
  WhileStatementNode
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
      .register('StructDeclaration', StructDeclarationNode)
      .register('StructField', StructFieldNode)
      .register('EnumDeclaration', EnumDeclarationNode)
      .register('ImportDeclaration', ImportDeclarationNode)
      .register('VariableDeclaration', VariableDeclarationNode)
      .register('VariableDeclarator', VariableDeclaratorNode)
      .register('FunctionDeclaration', FunctionDeclarationNode)
      .register('BlockStatement', BlockStatementNode)
      .register('ForOfStatement', ForOfStatementNode)
      .register('ForRangeStatement', ForRangeStatementNode)
      .register('ForStatement', ForStatementNode)
      .register('WhileStatement', WhileStatementNode)
      .register('DoUntilStatement', DoUntilStatementNode)
      .register('IfStatement', IfStatementNode)
      .register('SwitchCase', SwitchCaseNode)
      .register('SwitchStatement', SwitchStatementNode)
      .register('BreakStatement', BreakStatementNode)
      .register('ContinueStatement', ContinueStatementNode)
      .register('DeferStatement', DeferStatementNode)
      .register('ReturnStatement', ReturnStatementNode)
      .register('ThrowStatement', ThrowStatementNode)
      .register('TryCatchStatement', TryCatchStatementNode)
      .register('ExpressionStatement', ExpressionStatementNode)
      .register('RawExpression', RawExpressionNode)
  }
}
