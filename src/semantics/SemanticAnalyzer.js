import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { Scope } from './Scope.js'

export class SemanticAnalyzer {
  analyze(program) {
    const scope = new Scope()

    for (const node of program.body) {
      if (node.kind === 'StructDeclaration') {
        this.defineStruct(scope, node)
      }
      if (node.kind === 'FunctionDeclaration') {
        this.defineFunction(scope, node)
      }
    }

    for (const node of program.body) {
      this.visit(node, scope)
    }

    return scope
  }

  defineStruct(scope, node) {
    if (!scope.define(node.name.name, {
      kind: 'struct',
      node
    })) {
      throw new Diagnostic(`Duplicate type "${node.name.name}"`, node.location, 'semantic')
    }
  }

  defineFunction(scope, node) {
    if (!scope.define(node.name.name, {
      kind: 'function',
      node
    })) {
      throw new Diagnostic(`Duplicate function "${node.name.name}"`, node.location, 'semantic')
    }
  }

  visit(node, scope) {
    if (!node) return

    if (node.kind === 'StructDeclaration') return
    if (node.kind === 'FunctionDeclaration') return this.visitFunction(node, scope)
    if (node.kind === 'BlockStatement') return this.visitBlock(node, scope)
    if (node.kind === 'VariableDeclaration') return this.visitVariableDeclaration(node, scope)
    if (node.kind === 'ForStatement') return this.visitFor(node, scope)
  }

  visitFunction(node, scope) {
    const functionScope = new Scope(scope)

    for (const param of node.params) {
      if (!functionScope.define(param.name, {
        kind: 'param',
        node: param,
        mutable: false
      })) {
        throw new Diagnostic(`Duplicate parameter "${param.name}"`, param.location, 'semantic')
      }
    }

    this.visit(node.body, functionScope)
  }

  visitBlock(node, scope) {
    const blockScope = new Scope(scope)
    for (const child of node.body) this.visit(child, blockScope)
  }

  visitVariableDeclaration(node, scope) {
    for (const declaration of node.declarations) {
      if (!scope.define(declaration.id.name, {
        kind: 'variable',
        node: declaration,
        mutable: node.declarationKind === 'let'
      })) {
        throw new Diagnostic(`Duplicate variable "${declaration.id.name}"`, declaration.location, 'semantic')
      }
    }
  }

  visitFor(node, scope) {
    const loopScope = new Scope(scope)

    if (node.init?.kind === 'VariableDeclaration') {
      this.visitVariableDeclaration(node.init, loopScope)
    }

    this.visit(node.body, loopScope)
  }
}
