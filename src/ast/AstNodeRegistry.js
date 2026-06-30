import {
  ArrayExpressionNode,
  ArrowFunctionExpressionNode,
  AssignmentExpressionNode,
  AstNode,
  AwaitExpressionNode,
  BinaryExpressionNode,
  BlockStatementNode,
  BreakStatementNode,
  CallExpressionNode,
  ContinueStatementNode,
  DeferStatementNode,
  DoUntilStatementNode,
  EnumDeclarationNode,
  ExpressionStatementNode,
  ForOfStatementNode,
  ForRangeStatementNode,
  ForStatementNode,
  FunctionDeclarationNode,
  IdentifierExpressionNode,
  IdentifierNode,
  IfStatementNode,
  ImportDeclarationNode,
  LiteralExpressionNode,
  MatchArmNode,
  MatchExpressionNode,
  MemberExpressionNode,
  ProgramNode,
  RawExpressionNode,
  ReturnStatementNode,
  SliceExpressionNode,
  StructDeclarationNode,
  StructExpressionNode,
  StructFieldNode,
  StructPropertyNode,
  SwitchCaseNode,
  SwitchStatementNode,
  ThrowStatementNode,
  TryCatchStatementNode,
  TypeAnnotationNode,
  UnaryExpressionNode,
  UpdateExpressionNode,
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
      .register('LiteralExpression', LiteralExpressionNode)
      .register('IdentifierExpression', IdentifierExpressionNode)
      .register('CallExpression', CallExpressionNode)
      .register('MemberExpression', MemberExpressionNode)
      .register('AssignmentExpression', AssignmentExpressionNode)
      .register('UpdateExpression', UpdateExpressionNode)
      .register('UnaryExpression', UnaryExpressionNode)
      .register('BinaryExpression', BinaryExpressionNode)
      .register('ArrayExpression', ArrayExpressionNode)
      .register('StructExpression', StructExpressionNode)
      .register('StructProperty', StructPropertyNode)
      .register('MatchExpression', MatchExpressionNode)
      .register('MatchArm', MatchArmNode)
      .register('AwaitExpression', AwaitExpressionNode)
      .register('ArrowFunctionExpression', ArrowFunctionExpressionNode)
      .register('SliceExpression', SliceExpressionNode)
  }
}
