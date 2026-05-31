import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { Scope } from './Scope.js'
import { ModuleRegistry } from './ModuleRegistry.js'

export class SemanticAnalyzer {
  constructor({ moduleRegistry = new ModuleRegistry() } = {}) {
    this.moduleRegistry = moduleRegistry
  }

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

    if (node.kind === 'ImportDeclaration') return this.visitImport(node, scope)
    if (node.kind === 'StructDeclaration') return
    if (node.kind === 'FunctionDeclaration') return this.visitFunction(node, scope)
    if (node.kind === 'BlockStatement') return this.visitBlock(node, scope)
    if (node.kind === 'VariableDeclaration') return this.visitVariableDeclaration(node, scope)
    if (node.kind === 'ForStatement') return this.visitFor(node, scope)
    if (node.kind === 'ForOfStatement') return this.visitForOf(node, scope)
    if (node.kind === 'WhileStatement') return this.visitLoop(node, scope)
    if (node.kind === 'DoUntilStatement') return this.visitLoop(node, scope)
    if (node.kind === 'IfStatement') return this.visitIf(node, scope)
    if (node.kind === 'BreakStatement') return
    if (node.kind === 'ContinueStatement') return
    if (node.kind === 'TryCatchStatement') return this.visitTryCatch(node, scope)
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

  visitImport(node, scope) {
    if (!this.moduleRegistry.hasModule(node.source)) {
      throw new Diagnostic(`Unknown module "${node.source}"`, node.location, 'semantic')
    }

    for (const name of node.names) {
      if (!this.moduleRegistry.has(node.source, name.name)) {
        throw new Diagnostic(`Module "${node.source}" has no export "${name.name}"`, name.location, 'semantic')
      }

      scope.define(name.name, {
        kind: 'import',
        node: name,
        module: node.source,
        mutable: false
      })
    }
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

  visitForOf(node, scope) {
    const loopScope = new Scope(scope)

    loopScope.define(node.item.name, {
      kind: 'variable',
      node: node.item,
      mutable: false
    })

    this.visit(node.body, loopScope)
  }

  visitLoop(node, scope) {
    this.visit(node.body, new Scope(scope))
  }

  visitIf(node, scope) {
    this.visit(node.consequent, new Scope(scope))
    if (node.alternate) this.visit(node.alternate, new Scope(scope))
  }

  visitTryCatch(node, scope) {
    this.visit(node.tryBlock, scope)

    const catchScope = new Scope(scope)
    catchScope.define(node.catchParam.name, {
      kind: 'variable',
      node: node.catchParam,
      mutable: false
    })

    this.visit(node.catchBlock, catchScope)
  }
}
