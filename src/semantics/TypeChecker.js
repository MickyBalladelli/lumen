import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { Scope } from './Scope.js'
import { ExpressionInspector } from './ExpressionInspector.js'
import { LumenTypes, TypeSystem } from './TypeSystem.js'

export class TypeChecker {
  constructor({ typeSystem = new TypeSystem() } = {}) {
    this.typeSystem = typeSystem
  }

  check(program) {
    const scope = new Scope()

    for (const node of program.body) {
      if (node.kind === 'FunctionDeclaration') {
        scope.define(node.name.name, {
          kind: 'function',
          node,
          type: node.returnType?.name ?? LumenTypes.I32
        })
      }
    }

    for (const node of program.body) this.checkNode(node, scope, null)
    return program
  }

  checkNode(node, scope, currentFunction) {
    if (!node) return LumenTypes.Void

    if (node.kind === 'FunctionDeclaration') return this.checkFunction(node, scope)
    if (node.kind === 'BlockStatement') return this.checkBlock(node, scope, currentFunction)
    if (node.kind === 'VariableDeclaration') return this.checkVariableDeclaration(node, scope)
    if (node.kind === 'ForStatement') return this.checkFor(node, scope, currentFunction)
    if (node.kind === 'ReturnStatement') return this.checkReturn(node, scope, currentFunction)
    if (node.kind === 'ExpressionStatement') return this.checkExpression(node.expression, scope)

    return LumenTypes.Void
  }

  checkFunction(node, parentScope) {
    const returnType = this.resolveType(node.returnType, LumenTypes.I32)
    const scope = new Scope(parentScope)

    node.inferredType = returnType

    for (const param of node.params) {
      const paramType = this.resolveType(param.typeAnnotation, LumenTypes.I32)
      param.inferredType = paramType
      scope.define(param.name, {
        kind: 'param',
        node: param,
        type: paramType,
        mutable: false
      })
    }

    this.checkNode(node.body, scope, node)
    return returnType
  }

  checkBlock(node, parentScope, currentFunction) {
    const scope = new Scope(parentScope)
    for (const child of node.body) this.checkNode(child, scope, currentFunction)
    return LumenTypes.Void
  }

  checkVariableDeclaration(node, scope) {
    const inspector = new ExpressionInspector(scope, this.typeSystem)

    for (const declaration of node.declarations) {
      inspector.validateNames(declaration.initializer)

      const expected = this.resolveType(declaration.typeAnnotation, null)
      const actual = declaration.initializer
        ? inspector.infer(declaration.initializer)
        : expected ?? LumenTypes.Unknown
      const finalType = expected ?? actual

      if (expected && actual !== LumenTypes.Unknown && !this.typeSystem.canAssign(actual, expected)) {
        throw new Diagnostic(`Cannot assign ${actual} to ${expected}`, declaration.location, 'type')
      }

      declaration.inferredType = finalType
      scope.define(declaration.id.name, {
        kind: 'variable',
        node: declaration,
        type: finalType,
        mutable: node.declarationKind === 'let'
      })
    }

    return LumenTypes.Void
  }

  checkFor(node, parentScope, currentFunction) {
    const scope = new Scope(parentScope)

    if (node.init?.kind === 'VariableDeclaration') {
      this.checkVariableDeclaration(node.init, scope)
    } else if (node.init) {
      this.checkExpression(node.init, scope)
    }

    if (node.test) this.checkExpression(node.test, scope)
    if (node.update) this.checkExpression(node.update, scope)
    this.checkNode(node.body, scope, currentFunction)
    return LumenTypes.Void
  }

  checkReturn(node, scope, currentFunction) {
    const actual = this.checkExpression(node.argument, scope)
    const expected = currentFunction?.inferredType ?? LumenTypes.Void

    if (!this.typeSystem.canAssign(actual, expected)) {
      throw new Diagnostic(`Return type ${actual} does not match ${expected}`, node.location, 'type')
    }

    return actual
  }

  checkExpression(expression, scope) {
    const inspector = new ExpressionInspector(scope, this.typeSystem)
    inspector.validateNames(expression)
    return inspector.infer(expression)
  }

  resolveType(typeAnnotation, fallback) {
    if (!typeAnnotation) return fallback

    const normalized = this.typeSystem.normalize(typeAnnotation.name)
    if (!this.typeSystem.assertKnown(normalized)) {
      throw new Diagnostic(`Unknown type "${typeAnnotation.name}"`, typeAnnotation.location, 'type')
    }

    return normalized
  }
}
