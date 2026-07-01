import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { Scope } from './Scope.js'
import { ExpressionInspector } from './ExpressionInspector.js'
import { LumenTypes, TypeSystem } from './TypeSystem.js'

export class TypeChecker {
  constructor({ typeSystem = new TypeSystem() } = {}) {
    this.typeSystem = typeSystem
    this.loopDepth = 0
    this.switchDepth = 0
  }

  check(program, { diagnostics = null } = {}) {
    this.diagnostics = diagnostics
    const scope = new Scope()

    for (const node of program.body) {
      if (node.kind === 'StructDeclaration') {
        this.attempt(() => this.registerStruct(node))
      }
      if (node.kind === 'EnumDeclaration') {
        this.attempt(() => this.registerEnum(node))
      }
      if (node.kind === 'FunctionDeclaration') {
        scope.define(node.name.name, {
          kind: 'function',
          node,
          type: node.returnType?.name ?? LumenTypes.I32
        })
      }
      if (node.kind === 'ExternFunctionDeclaration') {
        scope.define(node.name.name, {
          kind: 'function',
          node,
          type: node.returnType?.name ?? LumenTypes.I32
        })
      }
    }

    for (const node of program.body) {
      this.attempt(() => this.checkNode(node, scope, null))
    }
    this.diagnostics = null
    return program
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

  registerStruct(node) {
    const seen = new Map()
    const fields = node.fields.map(field => {
      if (seen.has(field.name)) {
        throw new Diagnostic(`Duplicate field "${field.name}"`, field.location, 'type')
          .addNote('First field is here', seen.get(field.name))
      }

      seen.set(field.name, field.location)
      return {
        name: field.name,
        type: this.resolveType(field.typeAnnotation, null),
        location: field.location
      }
    })

    this.typeSystem.registerStruct(node.name.name, fields)
  }

  registerEnum(node) {
    this.typeSystem.registerEnum(node.name.name, node.variants.map(variant => ({
      name: variant.name,
      location: variant.location
    })))
  }

  checkNode(node, scope, currentFunction) {
    if (!node) return LumenTypes.Void

    if (node.kind === 'ImportDeclaration') return LumenTypes.Void
    if (node.kind === 'StructDeclaration') return LumenTypes.Void
    if (node.kind === 'EnumDeclaration') return LumenTypes.Void
    if (node.kind === 'ExternFunctionDeclaration') return this.checkExternFunction(node)
    if (node.kind === 'FunctionDeclaration') return this.checkFunction(node, scope)
    if (node.kind === 'BlockStatement') return this.checkBlock(node, scope, currentFunction)
    if (node.kind === 'VariableDeclaration') return this.checkVariableDeclaration(node, scope)
    if (node.kind === 'ForStatement') return this.checkFor(node, scope, currentFunction)
    if (node.kind === 'ForOfStatement') return this.checkForOf(node, scope, currentFunction)
    if (node.kind === 'ForRangeStatement') return this.checkForRange(node, scope, currentFunction)
    if (node.kind === 'WhileStatement') return this.checkWhile(node, scope, currentFunction)
    if (node.kind === 'DoUntilStatement') return this.checkDoUntil(node, scope, currentFunction)
    if (node.kind === 'IfStatement') return this.checkIf(node, scope, currentFunction)
    if (node.kind === 'SwitchStatement') return this.checkSwitch(node, scope, currentFunction)
    if (node.kind === 'BreakStatement') return this.checkLoopControl(node, 'break')
    if (node.kind === 'ContinueStatement') return this.checkLoopControl(node, 'continue')
    if (node.kind === 'TryCatchStatement') return this.checkTryCatch(node, scope, currentFunction)
    if (node.kind === 'ThrowStatement') return this.checkThrow(node, scope)
    if (node.kind === 'ReturnStatement') return this.checkReturn(node, scope, currentFunction)
    if (node.kind === 'ExpressionStatement') return this.checkExpression(node.expression, scope)
    if (node.kind === 'DeferStatement') return this.checkExpression(node.expression, scope)

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
        mutable: false,
        initialized: true
      })
    }

    this.checkNode(node.body, scope, node)
    if (returnType !== LumenTypes.Void && !this.alwaysReturns(node.body)) {
      throw new Diagnostic(`Function "${node.name.name}" does not return on every path`, node.location, 'type')
    }
    return returnType
  }

  checkExternFunction(node) {
    const returnType = this.resolveType(node.returnType, LumenTypes.I32)
    node.inferredType = returnType

    for (const param of node.params) {
      param.inferredType = this.resolveType(param.typeAnnotation, LumenTypes.I32)
    }

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

      const isArrayLiteral = declaration.initializer?.parsed?.kind === 'ArrayExpression'
      if (expected &&
        actual !== LumenTypes.Unknown &&
        !isArrayLiteral &&
        !this.typeSystem.canAssign(actual, expected)) {
        throw new Diagnostic(`Cannot assign ${actual} to ${expected}`, declaration.location, 'type')
      }

      if (declaration.initializer?.parsed?.kind === 'StructExpression') {
        this.checkStructLiteral(declaration.initializer, expected ?? actual, scope)
      }

      if (declaration.initializer?.parsed?.kind === 'ArrayExpression') {
        declaration.arrayLength = this.checkArrayLiteral(declaration.initializer, expected ?? actual, scope)
      }

      declaration.inferredType = finalType
      scope.define(declaration.id.name, {
        kind: 'variable',
        node: declaration,
        type: finalType,
        mutable: node.declarationKind === 'let',
        initialized: Boolean(declaration.initializer)
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

    if (node.test) this.checkCondition(node.test, scope, 'for')
    const beforeLoop = this.captureInitialization(scope)
    this.withLoop(() => this.checkNode(node.body, scope, currentFunction))
    if (node.update) this.checkExpression(node.update, scope)
    this.restoreInitialization(beforeLoop)
    return LumenTypes.Void
  }

  checkForOf(node, parentScope, currentFunction) {
    const iterableType = this.checkExpression(node.iterable, parentScope)

    if (!this.typeSystem.isArray(iterableType)) {
      throw new Diagnostic('for-of needs an array', node.iterable.location, 'type')
    }

    const scope = new Scope(parentScope)
    const itemType = this.typeSystem.elementType(iterableType)

    node.item.inferredType = itemType
    node.iterable.inferredType = iterableType

    scope.define(node.item.name, {
      kind: 'variable',
      node: node.item,
      type: itemType,
      mutable: false,
      initialized: true
    })

    const beforeLoop = this.captureInitialization(parentScope)
    this.withLoop(() => this.checkNode(node.body, scope, currentFunction))
    this.restoreInitialization(beforeLoop)
    return LumenTypes.Void
  }

  checkForRange(node, parentScope, currentFunction) {
    const startType = this.checkExpression(node.start, parentScope)
    const endType = this.checkExpression(node.end, parentScope)
    if (!this.typeSystem.isNumeric(startType) || !this.typeSystem.isNumeric(endType)) {
      throw new Diagnostic('Range bounds must be numbers', node.location, 'type')
    }
    const scope = new Scope(parentScope)
    node.item.inferredType = LumenTypes.I32
    scope.define(node.item.name, {
      kind: 'variable',
      node: node.item,
      type: LumenTypes.I32,
      mutable: false,
      initialized: true
    })
    const beforeLoop = this.captureInitialization(parentScope)
    this.withLoop(() => this.checkNode(node.body, scope, currentFunction))
    this.restoreInitialization(beforeLoop)
    return LumenTypes.Void
  }

  checkWhile(node, parentScope, currentFunction) {
    this.checkCondition(node.test, parentScope, 'while')
    const beforeLoop = this.captureInitialization(parentScope)
    this.withLoop(() => this.checkNode(node.body, new Scope(parentScope), currentFunction))
    this.restoreInitialization(beforeLoop)
    return LumenTypes.Void
  }

  checkDoUntil(node, parentScope, currentFunction) {
    this.withLoop(() => this.checkNode(node.body, new Scope(parentScope), currentFunction))
    this.checkCondition(node.test, parentScope, 'until')
    return LumenTypes.Void
  }

  withLoop(callback) {
    this.loopDepth += 1
    try {
      callback()
    } finally {
      this.loopDepth -= 1
    }
  }

  checkLoopControl(node, name) {
    if (name === 'break' && this.switchDepth > 0) return LumenTypes.Void

    if (this.loopDepth === 0) {
      throw new Diagnostic(`${name} can only be used inside a loop`, node.location, 'type')
    }

    return LumenTypes.Void
  }

  checkIf(node, parentScope, currentFunction) {
    this.checkCondition(node.test, parentScope, 'if')
    const before = this.captureInitialization(parentScope)
    this.checkNode(node.consequent, this.narrowedScope(node.test, parentScope), currentFunction)
    const consequentState = this.captureInitialization(parentScope)
    this.restoreInitialization(before)

    let alternateState = before
    if (node.alternate) {
      this.checkNode(node.alternate, new Scope(parentScope), currentFunction)
      alternateState = this.captureInitialization(parentScope)
    }

    const continuingStates = []
    if (!this.alwaysReturns(node.consequent)) continuingStates.push(consequentState)
    if (!node.alternate || !this.alwaysReturns(node.alternate)) continuingStates.push(alternateState)
    this.mergeInitialization(before, continuingStates)
    return LumenTypes.Void
  }

  narrowedScope(test, parentScope) {
    const scope = new Scope(parentScope)
    const expression = test?.kind === 'RawExpression' ? test.parsed : test

    if (expression?.kind === 'CallExpression' &&
      expression.callee.kind === 'IdentifierExpression' &&
      expression.callee.name === 'hasValue' &&
      expression.arguments.length === 1 &&
      expression.arguments[0].kind === 'IdentifierExpression') {
      const name = expression.arguments[0].name
      const symbol = parentScope.resolve(name)

      if (symbol?.type && this.typeSystem.isNullable(symbol.type)) {
        scope.define(name, {
          ...symbol,
          type: this.typeSystem.nonNullable(symbol.type)
        })
      }
    }

    return scope
  }

  checkSwitch(node, parentScope, currentFunction) {
    const discriminantType = this.checkExpression(node.discriminant, parentScope)
    const before = this.captureInitialization(parentScope)
    const continuingStates = []

    this.switchDepth += 1
    try {
      for (const switchCase of node.cases) {
        this.restoreInitialization(before)
        const caseType = this.checkExpression(switchCase.test, parentScope)
        if (!this.typeSystem.canAssign(caseType, discriminantType) && !this.typeSystem.canAssign(discriminantType, caseType)) {
          throw new Diagnostic(`Cannot compare switch ${discriminantType} with case ${caseType}`, switchCase.location, 'type')
        }

        this.checkNode(switchCase.body, new Scope(parentScope), currentFunction)
        if (!this.alwaysReturns(switchCase.body)) {
          continuingStates.push(this.captureInitialization(parentScope))
        }
      }

      this.restoreInitialization(before)
      if (node.defaultCase) {
        this.checkNode(node.defaultCase, new Scope(parentScope), currentFunction)
        if (!this.alwaysReturns(node.defaultCase)) {
          continuingStates.push(this.captureInitialization(parentScope))
        }
      } else {
        continuingStates.push(before)
      }
    } finally {
      this.switchDepth -= 1
    }

    this.mergeInitialization(before, continuingStates)
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

  checkThrow(node, scope) {
    const actual = this.checkExpression(node.argument, scope)

    if (actual !== LumenTypes.String && actual !== LumenTypes.Error) {
      throw new Diagnostic(`Throw expects string or error, got ${actual}`, node.location, 'type')
    }

    return LumenTypes.Void
  }

  checkTryCatch(node, parentScope, currentFunction) {
    const before = this.captureInitialization(parentScope)
    this.checkNode(node.tryBlock, parentScope, currentFunction)
    const tryState = this.captureInitialization(parentScope)
    this.restoreInitialization(before)

    const catchScope = new Scope(parentScope)
    node.catchParam.inferredType = LumenTypes.String
    catchScope.define(node.catchParam.name, {
      kind: 'variable',
      node: node.catchParam,
      type: LumenTypes.String,
      mutable: false,
      initialized: true
    })

    this.checkNode(node.catchBlock, catchScope, currentFunction)
    const catchState = this.captureInitialization(parentScope)
    const continuingStates = []
    if (!this.alwaysReturns(node.tryBlock)) continuingStates.push(tryState)
    if (!this.alwaysReturns(node.catchBlock)) continuingStates.push(catchState)
    this.mergeInitialization(before, continuingStates)
    return LumenTypes.Void
  }

  checkExpression(expression, scope) {
    const inspector = new ExpressionInspector(scope, this.typeSystem)
    inspector.validateNames(expression)
    return inspector.infer(expression)
  }

  checkCondition(expression, scope, construct) {
    const type = this.checkExpression(expression, scope)
    if (type !== LumenTypes.Bool) {
      throw new Diagnostic(`${construct} condition must be bool, got ${type}`, expression.location, 'type')
    }
    return type
  }

  captureInitialization(scope) {
    const state = new Map()
    let current = scope

    while (current) {
      for (const symbol of current.symbols.values()) {
        if (symbol.initialized !== undefined && !state.has(symbol)) {
          state.set(symbol, symbol.initialized)
        }
      }
      current = current.parent
    }

    return state
  }

  restoreInitialization(state) {
    for (const [symbol, initialized] of state) symbol.initialized = initialized
  }

  mergeInitialization(before, states) {
    if (states.length === 0) {
      this.restoreInitialization(before)
      return
    }

    for (const [symbol, initialized] of before) {
      symbol.initialized = initialized || states.every(state => state.get(symbol) === true)
    }
  }

  alwaysReturns(node) {
    const outcomes = this.completionKinds(node)
    return outcomes.size > 0 && [...outcomes].every(outcome => outcome === 'return')
  }

  completionKinds(node) {
    if (!node) return new Set(['normal'])
    if (node.kind === 'ReturnStatement' || node.kind === 'ThrowStatement') return new Set(['return'])
    if (node.kind === 'BreakStatement') return new Set(['break'])
    if (node.kind === 'ContinueStatement') return new Set(['continue'])

    if (node.kind === 'BlockStatement') {
      let outcomes = new Set(['normal'])
      for (const child of node.body) {
        if (!outcomes.has('normal')) break
        outcomes.delete('normal')
        for (const outcome of this.completionKinds(child)) outcomes.add(outcome)
      }
      return outcomes
    }

    if (node.kind === 'IfStatement') {
      const outcomes = new Set(this.completionKinds(node.consequent))
      const alternate = node.alternate
        ? this.completionKinds(node.alternate)
        : new Set(['normal'])
      for (const outcome of alternate) outcomes.add(outcome)
      return outcomes
    }

    if (node.kind === 'SwitchStatement') {
      const outcomes = new Set()
      for (const switchCase of node.cases) {
        for (const outcome of this.completionKinds(switchCase.body)) {
          outcomes.add(outcome === 'break' ? 'normal' : outcome)
        }
      }
      if (node.defaultCase) {
        for (const outcome of this.completionKinds(node.defaultCase)) {
          outcomes.add(outcome === 'break' ? 'normal' : outcome)
        }
      } else {
        outcomes.add('normal')
      }
      return outcomes
    }

    if (node.kind === 'TryCatchStatement') {
      const outcomes = new Set(this.completionKinds(node.tryBlock))
      for (const outcome of this.completionKinds(node.catchBlock)) outcomes.add(outcome)
      return outcomes
    }

    if (node.kind === 'DoUntilStatement') {
      const outcomes = this.completionKinds(node.body)
      if (outcomes.has('return') && outcomes.size === 1) return outcomes
      return new Set(['normal', ...(outcomes.has('return') ? ['return'] : [])])
    }

    if (node.kind === 'WhileStatement' || node.kind === 'ForStatement') {
      const test = node.kind === 'WhileStatement'
        ? node.test?.kind === 'RawExpression' ? node.test.parsed : node.test
        : null
      const definitelyRuns = node.kind === 'WhileStatement'
        ? test?.kind === 'LiteralExpression' && test.token.lexeme === 'true'
        : !node.test
      const bodyOutcomes = this.completionKinds(node.body)
      if (definitelyRuns && bodyOutcomes.size === 1 && bodyOutcomes.has('return')) {
        return new Set(['return'])
      }
      return new Set(['normal', ...(bodyOutcomes.has('return') ? ['return'] : [])])
    }

    return new Set(['normal'])
  }

  checkStructLiteral(expression, typeName, scope) {
    const struct = this.typeSystem.getStruct(typeName)
    if (!struct) return

    const node = expression.kind === 'RawExpression' ? expression.parsed : expression
    const seen = new Set()

    for (const property of node.fields) {
      const field = this.typeSystem.getField(typeName, property.key)
      if (!field) {
        throw new Diagnostic(`Unknown field "${property.key}"`, property.location, 'type')
      }

      seen.add(property.key)
      const valueType = new ExpressionInspector(scope, this.typeSystem).infer(property.value)

      if (!this.typeSystem.canAssign(valueType, field.type)) {
        throw new Diagnostic(`Cannot assign ${valueType} to ${field.type}`, property.location, 'type')
      }
    }

    for (const field of struct.fields) {
      if (!seen.has(field.name)) {
        throw new Diagnostic(`Missing field "${field.name}"`, expression.location, 'type')
      }
    }
  }

  checkArrayLiteral(expression, typeName, scope) {
    if (!this.typeSystem.isArray(typeName)) {
      throw new Diagnostic('Array literal needs array type', expression.location, 'type')
    }

    const elementType = this.typeSystem.elementType(typeName)
    const node = expression.kind === 'RawExpression' ? expression.parsed : expression
    const inspector = new ExpressionInspector(scope, this.typeSystem)

    for (const element of node.elements) {
      const actual = inspector.infer(element)

      if (!this.typeSystem.canAssign(actual, elementType)) {
        throw new Diagnostic(`Cannot assign ${actual} to ${elementType}`, expression.location, 'type')
      }

      if (element.kind === 'StructExpression') {
        this.checkStructLiteral(element, elementType, scope)
      }
    }

    return node.elements.length
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
