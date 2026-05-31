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

  check(program) {
    const scope = new Scope()

    for (const node of program.body) {
      if (node.kind === 'StructDeclaration') {
        this.registerStruct(node)
      }
      if (node.kind === 'EnumDeclaration') {
        this.registerEnum(node)
      }
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

  registerStruct(node) {
    const seen = new Set()
    const fields = node.fields.map(field => {
      if (seen.has(field.name)) {
        throw new Diagnostic(`Duplicate field "${field.name}"`, field.location, 'type')
      }

      seen.add(field.name)
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

      if (declaration.initializer && this.isStructLiteral(declaration.initializer.tokens)) {
        this.checkStructLiteral(declaration.initializer, expected ?? actual, scope)
      }

      if (declaration.initializer && this.isArrayLiteral(declaration.initializer.tokens)) {
        declaration.arrayLength = this.checkArrayLiteral(declaration.initializer, expected ?? actual, scope)
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
    this.withLoop(() => this.checkNode(node.body, scope, currentFunction))
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
      mutable: false
    })

    this.withLoop(() => this.checkNode(node.body, scope, currentFunction))
    return LumenTypes.Void
  }

  checkForRange(node, parentScope, currentFunction) {
    this.checkExpression(node.start, parentScope)
    this.checkExpression(node.end, parentScope)
    const scope = new Scope(parentScope)
    node.item.inferredType = LumenTypes.I32
    scope.define(node.item.name, {
      kind: 'variable',
      node: node.item,
      type: LumenTypes.I32,
      mutable: false
    })
    this.withLoop(() => this.checkNode(node.body, scope, currentFunction))
    return LumenTypes.Void
  }

  checkWhile(node, parentScope, currentFunction) {
    this.checkExpression(node.test, parentScope)
    this.withLoop(() => this.checkNode(node.body, new Scope(parentScope), currentFunction))
    return LumenTypes.Void
  }

  checkDoUntil(node, parentScope, currentFunction) {
    this.withLoop(() => this.checkNode(node.body, new Scope(parentScope), currentFunction))
    this.checkExpression(node.test, parentScope)
    return LumenTypes.Void
  }

  withLoop(callback) {
    this.loopDepth += 1
    callback()
    this.loopDepth -= 1
  }

  checkLoopControl(node, name) {
    if (name === 'break' && this.switchDepth > 0) return LumenTypes.Void

    if (this.loopDepth === 0) {
      throw new Diagnostic(`${name} can only be used inside a loop`, node.location, 'type')
    }

    return LumenTypes.Void
  }

  checkIf(node, parentScope, currentFunction) {
    this.checkExpression(node.test, parentScope)
    this.checkNode(node.consequent, new Scope(parentScope), currentFunction)
    if (node.alternate) this.checkNode(node.alternate, new Scope(parentScope), currentFunction)
    return LumenTypes.Void
  }

  checkSwitch(node, parentScope, currentFunction) {
    const discriminantType = this.checkExpression(node.discriminant, parentScope)

    this.switchDepth += 1
    for (const switchCase of node.cases) {
      const caseType = this.checkExpression(switchCase.test, parentScope)
      if (!this.typeSystem.canAssign(caseType, discriminantType) && !this.typeSystem.canAssign(discriminantType, caseType)) {
        throw new Diagnostic(`Cannot compare switch ${discriminantType} with case ${caseType}`, switchCase.location, 'type')
      }

      this.checkNode(switchCase.body, new Scope(parentScope), currentFunction)
    }

    if (node.defaultCase) this.checkNode(node.defaultCase, new Scope(parentScope), currentFunction)
    this.switchDepth -= 1
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

    if (actual !== LumenTypes.String) {
      throw new Diagnostic(`Throw expects string, got ${actual}`, node.location, 'type')
    }

    return LumenTypes.Void
  }

  checkTryCatch(node, parentScope, currentFunction) {
    this.checkNode(node.tryBlock, parentScope, currentFunction)

    const catchScope = new Scope(parentScope)
    node.catchParam.inferredType = LumenTypes.String
    catchScope.define(node.catchParam.name, {
      kind: 'variable',
      node: node.catchParam,
      type: LumenTypes.String,
      mutable: false
    })

    this.checkNode(node.catchBlock, catchScope, currentFunction)
    return LumenTypes.Void
  }

  checkExpression(expression, scope) {
    const inspector = new ExpressionInspector(scope, this.typeSystem)
    inspector.validateNames(expression)
    return inspector.infer(expression)
  }

  checkStructLiteral(expression, typeName, scope) {
    const struct = this.typeSystem.getStruct(typeName)
    if (!struct) return

    const values = this.structLiteralFields(expression.tokens)
    const seen = new Set()

    for (const [name, valueTokens] of values.entries()) {
      const field = this.typeSystem.getField(typeName, name)
      if (!field) {
        throw new Diagnostic(`Unknown field "${name}"`, expression.location, 'type')
      }

      seen.add(name)
      const valueType = new ExpressionInspector(scope, this.typeSystem).infer({
        tokens: valueTokens
      })

      if (!this.typeSystem.canAssign(valueType, field.type)) {
        throw new Diagnostic(`Cannot assign ${valueType} to ${field.type}`, expression.location, 'type')
      }
    }

    for (const field of struct.fields) {
      if (!seen.has(field.name)) {
        throw new Diagnostic(`Missing field "${field.name}"`, expression.location, 'type')
      }
    }
  }

  structLiteralFields(tokens) {
    const fields = new Map()
    let index = 2

    while (index < tokens.length - 1) {
      const name = tokens[index]?.lexeme
      index += 2
      const value = []
      let depth = 0

      while (index < tokens.length - 1) {
        const token = tokens[index]
        if (depth === 0 && token.lexeme === ',') break
        if (token.lexeme === '(' || token.lexeme === '{') depth += 1
        if (token.lexeme === ')' || token.lexeme === '}') depth -= 1
        value.push(token)
        index += 1
      }

      fields.set(name, value)
      if (tokens[index]?.lexeme === ',') index += 1
    }

    return fields
  }

  isStructLiteral(tokens) {
    return tokens[0]?.lexeme &&
      tokens[1]?.lexeme === '{' &&
      this.typeSystem.getStruct(tokens[0].lexeme)
  }

  checkArrayLiteral(expression, typeName, scope) {
    if (!this.typeSystem.isArray(typeName)) {
      throw new Diagnostic('Array literal needs array type', expression.location, 'type')
    }

    const elementType = this.typeSystem.elementType(typeName)
    const elements = this.splitDelimited(expression.tokens.slice(1, -1))

    if (elements.length === 0) {
      throw new Diagnostic('Array literal cannot be empty yet', expression.location, 'type')
    }

    const inspector = new ExpressionInspector(scope, this.typeSystem)

    for (const element of elements) {
      const actual = inspector.infer({
        tokens: element
      })

      if (!this.typeSystem.canAssign(actual, elementType)) {
        throw new Diagnostic(`Cannot assign ${actual} to ${elementType}`, expression.location, 'type')
      }

      if (this.isStructLiteral(element)) {
        this.checkStructLiteral({
          tokens: element,
          location: element[0]?.location ?? expression.location
        }, elementType, scope)
      }
    }

    return elements.length
  }

  isArrayLiteral(tokens) {
    return tokens[0]?.lexeme === '[' && tokens.at(-1)?.lexeme === ']'
  }

  splitDelimited(tokens) {
    const parts = []
    let current = []
    let depth = 0

    for (const token of tokens) {
      if (depth === 0 && token.lexeme === ',') {
        parts.push(current)
        current = []
        continue
      }

      if (['(', '[', '{'].includes(token.lexeme)) depth += 1
      if ([')', ']', '}'].includes(token.lexeme)) depth -= 1
      current.push(token)
    }

    if (current.length > 0) parts.push(current)
    return parts
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
