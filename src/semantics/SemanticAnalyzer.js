import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { Scope } from './Scope.js'
import { ModuleRegistry } from './ModuleRegistry.js'
import { SemanticSymbol } from './SemanticSymbol.js'
import { setCompilerMetadata } from './CompilerMetadata.js'
import { builtinSignature } from '../runtime/BuiltinRegistry.js'

export class SemanticAnalyzer {
  constructor({ moduleRegistry = new ModuleRegistry() } = {}) {
    this.moduleRegistry = moduleRegistry
  }

  analyze(program, { diagnostics = null } = {}) {
    this.diagnostics = diagnostics
    this.nextSymbolId = 1
    const scope = new Scope()

    for (const node of program.body) {
      if (node.kind === 'StructDeclaration') {
        this.attempt(() => this.defineStruct(scope, node))
      }
      if (node.kind === 'EnumDeclaration') {
        this.attempt(() => this.defineEnum(scope, node))
      }
      if (node.kind === 'FunctionDeclaration') {
        this.attempt(() => this.defineFunction(scope, node))
      }
      if (node.kind === 'ExternFunctionDeclaration') {
        this.attempt(() => this.defineFunction(scope, node))
      }
      if (node.kind === 'ImportDeclaration') {
        this.attempt(() => this.defineImport(scope, node))
      }
    }

    for (const node of program.body) {
      this.attempt(() => this.visit(node, scope))
    }

    this.diagnostics = null
    return scope
  }

  attempt(callback) {
    try {
      return callback()
    } catch (error) {
      if (!(error instanceof Diagnostic) || !this.diagnostics) throw error
      this.diagnostics.push(error)
      return null
    }
  }

  defineStruct(scope, node) {
    const symbol = this.createSymbol(node.name.name, 'struct', node)
    const previous = scope.resolveOwn(node.name.name)
    if (!scope.define(node.name.name, symbol)) {
      throw duplicateDiagnostic(`Duplicate type "${node.name.name}"`, node.location, previous)
    }
    setCompilerMetadata(node, 'symbol', symbol)

    const fields = new Scope()
    for (const field of node.fields) {
      const fieldSymbol = this.createSymbol(field.name, 'field', field, {
        owner: symbol
      })
      const previousField = fields.resolveOwn(field.name)
      if (!fields.define(field.name, fieldSymbol)) {
        throw duplicateDiagnostic(`Duplicate field "${field.name}"`, field.location, previousField)
      }
      setCompilerMetadata(field, 'symbol', fieldSymbol)
    }
  }

  defineFunction(scope, node) {
    const symbol = this.createSymbol(node.name.name, 'function', node)
    const previous = scope.resolveOwn(node.name.name)
    if (!scope.define(node.name.name, symbol)) {
      throw duplicateDiagnostic(`Duplicate function "${node.name.name}"`, node.location, previous)
    }
    setCompilerMetadata(node, 'symbol', symbol)
  }

  defineEnum(scope, node) {
    const symbol = this.createSymbol(node.name.name, 'enum', node)
    const previous = scope.resolveOwn(node.name.name)
    if (!scope.define(node.name.name, symbol)) {
      throw duplicateDiagnostic(`Duplicate enum "${node.name.name}"`, node.location, previous)
    }
    setCompilerMetadata(node, 'symbol', symbol)

    for (const variant of node.variants) {
      const variantSymbol = this.createSymbol(variant.name, 'enumVariant', variant, {
        enumName: node.name.name,
        owner: symbol,
        mutable: false
      })
      const previousVariant = scope.resolveOwn(variant.name)
      if (!scope.define(variant.name, variantSymbol)) {
        throw duplicateDiagnostic(
          `Duplicate enum variant "${variant.name}"`,
          variant.location,
          previousVariant
        )
      }
      setCompilerMetadata(variant, 'symbol', variantSymbol)
    }
  }

  defineImport(scope, node) {
    if (!this.moduleRegistry.hasModule(node.source)) {
      throw new Diagnostic(`Unknown module "${node.source}"`, node.location, 'semantic')
    }

    for (const name of node.names) {
      if (!this.moduleRegistry.has(node.source, name.name)) {
        throw new Diagnostic(`Module "${node.source}" has no export "${name.name}"`, name.location, 'semantic')
      }

      const signature = builtinSignature(name.name)
      const symbol = this.createSymbol(name.name, 'import', name, {
        builtin: signature?.module === node.source ? signature : null,
        module: node.source,
        mutable: false
      })
      const previous = scope.resolveOwn(name.name)
      if (!scope.define(name.name, symbol)) {
        throw duplicateDiagnostic(`Duplicate import "${name.name}"`, name.location, previous)
      }
      setCompilerMetadata(name, 'symbol', symbol)
    }
  }

  createSymbol(name, kind, node, fields = {}) {
    const symbol = new SemanticSymbol(
      `symbol.${this.nextSymbolId}`,
      name,
      kind,
      node,
      fields
    )
    this.nextSymbolId += 1
    return symbol
  }

  visit(node, scope) {
    if (!node) return

    if (node.kind === 'ImportDeclaration') return
    if (node.kind === 'StructDeclaration') return
    if (node.kind === 'EnumDeclaration') return
    if (node.kind === 'ExternFunctionDeclaration') return
    if (node.kind === 'FunctionDeclaration') return this.visitFunction(node, scope)
    if (node.kind === 'BlockStatement') return this.visitBlock(node, scope)
    if (node.kind === 'VariableDeclaration') return this.visitVariableDeclaration(node, scope)
    if (node.kind === 'ForStatement') return this.visitFor(node, scope)
    if (node.kind === 'ForOfStatement') return this.visitForOf(node, scope)
    if (node.kind === 'ForRangeStatement') return this.visitForRange(node, scope)
    if (node.kind === 'WhileStatement') return this.visitLoop(node, scope)
    if (node.kind === 'DoUntilStatement') return this.visitLoop(node, scope)
    if (node.kind === 'IfStatement') return this.visitIf(node, scope)
    if (node.kind === 'SwitchStatement') return this.visitSwitch(node, scope)
    if (node.kind === 'BreakStatement') return
    if (node.kind === 'ContinueStatement') return
    if (node.kind === 'TryCatchStatement') return this.visitTryCatch(node, scope)
    if (node.kind === 'ExpressionStatement') return this.visitExpression(node.expression, scope)
    if (node.kind === 'DeferStatement') return this.visitExpression(node.expression, scope)
    if (node.kind === 'ReturnStatement') return this.visitExpression(node.argument, scope)
    if (node.kind === 'ThrowStatement') return this.visitExpression(node.argument, scope)
  }

  visitFunction(node, scope) {
    const functionScope = new Scope(scope)

    for (const param of node.params) {
      const symbol = this.createSymbol(param.name, 'param', param, {
        mutable: false
      })
      const previous = functionScope.resolveOwn(param.name)
      if (!functionScope.define(param.name, symbol)) {
        throw duplicateDiagnostic(`Duplicate parameter "${param.name}"`, param.location, previous)
      }
      setCompilerMetadata(param, 'symbol', symbol)
    }

    this.visit(node.body, functionScope)
  }

  visitBlock(node, scope) {
    const blockScope = new Scope(scope)
    for (const child of node.body) this.visit(child, blockScope)
  }

  visitVariableDeclaration(node, scope) {
    for (const declaration of node.declarations) {
      this.visitExpression(declaration.initializer, scope)
      const symbol = this.createSymbol(declaration.id.name, 'variable', declaration, {
        mutable: node.declarationKind === 'let'
      })
      const previous = scope.resolveOwn(declaration.id.name)
      if (!scope.define(declaration.id.name, symbol)) {
        throw duplicateDiagnostic(
          `Duplicate variable "${declaration.id.name}"`,
          declaration.location,
          previous
        )
      }
      setCompilerMetadata(declaration, 'symbol', symbol)
    }
  }

  visitFor(node, scope) {
    const loopScope = new Scope(scope)

    if (node.init?.kind === 'VariableDeclaration') {
      this.visitVariableDeclaration(node.init, loopScope)
    } else {
      this.visitExpression(node.init, loopScope)
    }

    this.visitExpression(node.test, loopScope)
    this.visitExpression(node.update, loopScope)
    this.visit(node.body, loopScope)
  }

  visitForOf(node, scope) {
    const loopScope = new Scope(scope)
    this.visitExpression(node.iterable, scope)

    const symbol = this.createSymbol(node.item.name, 'variable', node.item, {
      mutable: false
    })
    loopScope.define(node.item.name, symbol)
    setCompilerMetadata(node.item, 'symbol', symbol)

    this.visit(node.body, loopScope)
  }

  visitForRange(node, scope) {
    const loopScope = new Scope(scope)
    this.visitExpression(node.start, scope)
    this.visitExpression(node.end, scope)

    const symbol = this.createSymbol(node.item.name, 'variable', node.item, {
      mutable: false
    })
    loopScope.define(node.item.name, symbol)
    setCompilerMetadata(node.item, 'symbol', symbol)

    this.visit(node.body, loopScope)
  }

  visitLoop(node, scope) {
    this.visitExpression(node.test, scope)
    this.visit(node.body, new Scope(scope))
  }

  visitIf(node, scope) {
    this.visitExpression(node.test, scope)
    this.visit(node.consequent, new Scope(scope))
    if (node.alternate) this.visit(node.alternate, new Scope(scope))
  }

  visitSwitch(node, scope) {
    this.visitExpression(node.discriminant, scope)
    for (const switchCase of node.cases) {
      this.visitExpression(switchCase.test, scope)
      this.visit(switchCase.body, new Scope(scope))
    }
    if (node.defaultCase) this.visit(node.defaultCase, new Scope(scope))
  }

  visitTryCatch(node, scope) {
    this.visit(node.tryBlock, scope)

    const catchScope = new Scope(scope)
    const symbol = this.createSymbol(node.catchParam.name, 'variable', node.catchParam, {
      mutable: false
    })
    catchScope.define(node.catchParam.name, symbol)
    setCompilerMetadata(node.catchParam, 'symbol', symbol)

    this.visit(node.catchBlock, catchScope)
  }

  visitExpression(expression, scope) {
    const node = expression?.kind === 'RawExpression' ? expression.parsed : expression
    if (!node) return

    if (node.kind === 'IdentifierExpression') {
      const symbol = scope.resolve(node.name)
      if (symbol) setCompilerMetadata(node, 'resolvedSymbol', symbol)
      return
    }

    if (node.kind === 'StructExpression') {
      const symbol = scope.resolve(node.name)
      if (symbol?.kind === 'struct') {
        setCompilerMetadata(node, 'resolvedSymbol', symbol)
        setCompilerMetadata(node, 'resolvedDeclaration', symbol.node)
      }
    }

    if (node.kind === 'ArrowFunctionExpression') {
      const arrowScope = new Scope(scope)
      for (const param of node.params) {
        const symbol = this.createSymbol(param.name, 'param', param, {
          mutable: false
        })
        const previous = arrowScope.resolveOwn(param.name)
        if (!arrowScope.define(param.name, symbol)) {
          throw duplicateDiagnostic(`Duplicate parameter "${param.name}"`, param.location, previous)
        }
        setCompilerMetadata(param, 'symbol', symbol)
      }
      this.visitExpression(node.body, arrowScope)
      return
    }

    for (const child of expressionChildren(node)) this.visitExpression(child, scope)
  }
}

function duplicateDiagnostic(message, location, previous) {
  const diagnostic = new Diagnostic(message, location, 'semantic')
  if (previous?.node?.location) {
    diagnostic.addNote('First definition is here', previous.node.location)
  }
  return diagnostic
}

function expressionChildren(node) {
  if (node.kind === 'CallExpression') return [node.callee, ...node.arguments]
  if (node.kind === 'MemberExpression') {
    return node.computed ? [node.object, node.property] : [node.object]
  }
  if (node.kind === 'AssignmentExpression' || node.kind === 'BinaryExpression') {
    return [node.left, node.right]
  }
  if (node.kind === 'UnaryExpression' || node.kind === 'UpdateExpression' || node.kind === 'AwaitExpression') {
    return [node.argument]
  }
  if (node.kind === 'ArrayExpression') return node.elements
  if (node.kind === 'StructExpression') return node.fields.map(field => field.value)
  if (node.kind === 'MatchExpression') {
    return [
      node.discriminant,
      ...node.arms.flatMap(arm => [arm.pattern, arm.value])
    ]
  }
  if (node.kind === 'SliceExpression') return [node.start, node.end]
  return []
}
