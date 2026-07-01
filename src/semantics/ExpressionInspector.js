import { TokenType } from '../lexer/TokenType.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes } from './TypeSystem.js'
import { Scope } from './Scope.js'
import { SystemFunctions, SystemLibrary } from '../system/SystemLibrary.js'
import { FsFunctions, FsLibrary } from '../fs/FsLibrary.js'
import { HttpFunctions, HttpLibrary } from '../http/HttpLibrary.js'
import { ThreadFunctions, ThreadLibrary } from '../thread/ThreadLibrary.js'

const FIXED_CALL_TYPES = new Map([
  [SystemFunctions.Println, LumenTypes.Void],
  [SystemFunctions.Len, LumenTypes.I32],
  [SystemFunctions.Uuid, LumenTypes.String],
  [SystemFunctions.Date, LumenTypes.String],
  [SystemFunctions.Env, LumenTypes.String],
  [SystemFunctions.Encrypt, LumenTypes.String],
  [SystemFunctions.Decrypt, LumenTypes.String],
  [SystemFunctions.Arg, LumenTypes.String],
  [SystemFunctions.ArgCount, LumenTypes.I32],
  [SystemFunctions.Map, LumenTypes.String],
  [SystemFunctions.MapGet, LumenTypes.String],
  [SystemFunctions.MapHas, LumenTypes.Bool],
  [SystemFunctions.Err, 'Result<unknown>'],
  [SystemFunctions.IsOk, LumenTypes.Bool],
  [SystemFunctions.ErrorMessage, LumenTypes.String],
  [SystemFunctions.None, LumenTypes.Unknown],
  [SystemFunctions.HasValue, LumenTypes.Bool],
  [SystemFunctions.Assert, LumenTypes.Void],
  [SystemFunctions.Channel, LumenTypes.String],
  [SystemFunctions.Send, LumenTypes.Void],
  [SystemFunctions.Receive, LumenTypes.String],
  [SystemFunctions.Json, LumenTypes.Json],
  [SystemFunctions.JsonGet, LumenTypes.String],
  [SystemFunctions.JsonGetRaw, LumenTypes.String],
  [SystemFunctions.JsonSet, LumenTypes.Json],
  [SystemFunctions.JsonSetPath, LumenTypes.Json],
  [SystemFunctions.JsonQuote, LumenTypes.String],
  [SystemFunctions.JsonStringify, LumenTypes.String],
  [SystemFunctions.JsonValid, LumenTypes.Bool],
  [SystemFunctions.NewError, LumenTypes.Error],
  [SystemFunctions.ErrorCode, LumenTypes.I32],
  [SystemFunctions.ErrorText, LumenTypes.String],
  [SystemFunctions.ArraySum, LumenTypes.I32],
  [SystemFunctions.ArrayJoin, LumenTypes.String],
  [SystemFunctions.Exec, LumenTypes.I32],
  [SystemFunctions.SourceSnippet, LumenTypes.String],
  [SystemFunctions.StringBuilder, LumenTypes.String],
  [SystemFunctions.StringBuilderAppend, LumenTypes.String],
  [SystemFunctions.StringLen, LumenTypes.I32],
  [SystemFunctions.StringEquals, LumenTypes.Bool],
  [SystemFunctions.Trim, LumenTypes.String],
  [SystemFunctions.Lower, LumenTypes.String],
  [SystemFunctions.Upper, LumenTypes.String],
  [SystemFunctions.StartsWith, LumenTypes.Bool],
  [SystemFunctions.EndsWith, LumenTypes.Bool],
  [SystemFunctions.Replace, LumenTypes.String],
  [SystemFunctions.Split, LumenTypes.String],
  [SystemFunctions.IndexOf, LumenTypes.I32],
  [SystemFunctions.LastIndexOf, LumenTypes.I32],
  [SystemFunctions.Contains, LumenTypes.Bool],
  [SystemFunctions.Repeat, LumenTypes.String],
  [SystemFunctions.PadStart, LumenTypes.String],
  [SystemFunctions.PadEnd, LumenTypes.String],
  [SystemFunctions.IntToString, LumenTypes.String],
  [SystemFunctions.StringToInt, LumenTypes.I32],
  [SystemFunctions.ParseI32, LumenTypes.I32],
  [SystemFunctions.ParseF32, LumenTypes.F32],
  [SystemFunctions.List, LumenTypes.String],
  [SystemFunctions.ListPush, LumenTypes.String],
  [SystemFunctions.ListGet, LumenTypes.String],
  [SystemFunctions.ListLen, LumenTypes.I32],
  [SystemFunctions.MapSet, LumenTypes.String],
  [SystemFunctions.MapDelete, LumenTypes.String],
  [SystemFunctions.MapKeys, LumenTypes.String],
  [SystemFunctions.TokenizeSource, LumenTypes.String],
  [SystemFunctions.ParseSummary, LumenTypes.String],
  [SystemFunctions.CompilerImage, LumenTypes.String],
  [FsFunctions.ReadFile, LumenTypes.String],
  [FsFunctions.WriteFile, LumenTypes.I32],
  [HttpFunctions.ServeFiles, LumenTypes.I32],
  [HttpFunctions.ServeApi, LumenTypes.I32],
  [HttpFunctions.ServeHttp, LumenTypes.I32],
  [HttpFunctions.ServeSocketIoChat, LumenTypes.I32],
  [HttpFunctions.SocketIoEvent, LumenTypes.String],
  [HttpFunctions.SocketIoEmit, LumenTypes.String],
  [HttpFunctions.HttpRequest, LumenTypes.String],
  [HttpFunctions.HttpResponse, LumenTypes.String],
  [ThreadFunctions.CreateSemaphore, LumenTypes.Semaphore],
  [ThreadFunctions.SemaphoreWait, LumenTypes.I32],
  [ThreadFunctions.SemaphoreSignal, LumenTypes.I32],
  [ThreadFunctions.StartThread, LumenTypes.Thread],
  [ThreadFunctions.JoinThread, LumenTypes.I32],
  [ThreadFunctions.AppendFile, LumenTypes.I32]
])

export class ExpressionInspector {
  constructor(
    scope,
    typeSystem,
    systemLibrary = new SystemLibrary(),
    fsLibrary = new FsLibrary(),
    httpLibrary = new HttpLibrary(),
    threadLibrary = new ThreadLibrary()
  ) {
    this.scope = scope
    this.typeSystem = typeSystem
    this.systemLibrary = systemLibrary
    this.fsLibrary = fsLibrary
    this.httpLibrary = httpLibrary
    this.threadLibrary = threadLibrary
  }

  infer(expression) {
    const node = this.expressionNode(expression)
    const type = this.inferNode(node)
    if (node) node.inferredType = type
    return type
  }

  inferNode(node) {
    if (!node) return LumenTypes.Void
    const type = this.inferNodeType(node)
    node.inferredType = type
    return type
  }

  inferNodeType(node) {
    if (!node) return LumenTypes.Void

    if (node.kind === 'LiteralExpression') return this.literalType(node)
    if (node.kind === 'IdentifierExpression') return this.identifierType(node)
    if (node.kind === 'AwaitExpression') return this.inferNode(node.argument)
    if (node.kind === 'UnaryExpression') {
      const argument = this.inferNode(node.argument)
      if (node.operator === '!') {
        if (argument !== LumenTypes.Bool) {
          throw new Diagnostic(`Operator ! needs bool, got ${argument}`, node.location, 'type')
        }
        return LumenTypes.Bool
      }
      return argument
    }
    if (node.kind === 'BinaryExpression') return this.binaryType(node)
    if (node.kind === 'CallExpression') return this.callType(node)
    if (node.kind === 'MemberExpression') return this.memberType(node)
    if (node.kind === 'AssignmentExpression') return this.assignmentType(node)
    if (node.kind === 'UpdateExpression') {
      const type = this.inferNode(node.argument)
      if (!this.typeSystem.isNumeric(type)) {
        throw new Diagnostic(`${node.operator} needs numeric target`, node.location, 'type')
      }
      return type
    }
    if (node.kind === 'ArrayExpression') return this.arrayType(node)
    if (node.kind === 'StructExpression') return node.name
    if (node.kind === 'MatchExpression') return this.matchType(node)
    if (node.kind === 'ArrowFunctionExpression') return LumenTypes.Unknown
    if (node.kind === 'SliceExpression') return LumenTypes.String

    return LumenTypes.Unknown
  }

  validateNames(expression) {
    this.validateNode(this.expressionNode(expression), new Set())
  }

  validateNode(node, locals) {
    if (!node) return

    if (node.kind === 'IdentifierExpression') {
      const symbol = this.scope.resolve(node.name)
      if (symbol?.initialized === false) {
        throw new Diagnostic(`Variable "${node.name}" is used before initialization`, node.location, 'type')
      }
      if (locals.has(node.name) || symbol || this.typeSystem.enumVariant(node.name)) return
      throw new Diagnostic(`Unknown symbol "${node.name}"`, node.location, 'semantic')
    }

    if (node.kind === 'AssignmentExpression') {
      this.validateNode(node.right, locals)
      if (node.left.kind === 'IdentifierExpression') {
        if (!this.scope.resolve(node.left.name)) {
          throw new Diagnostic(`Unknown symbol "${node.left.name}"`, node.left.location, 'semantic')
        }
      } else {
        this.validateNode(node.left, locals)
      }
      return
    }

    if (node.kind === 'CallExpression') {
      const name = this.calleeName(node)
      if (!name || !this.isKnownCall(name)) this.validateNode(node.callee, locals)
      for (const argument of node.arguments) this.validateNode(argument, locals)
      return
    }

    if (node.kind === 'MemberExpression') {
      this.validateNode(node.object, locals)
      if (node.computed) this.validateNode(node.property, locals)
      return
    }

    if (node.kind === 'StructExpression') {
      if (!this.typeSystem.getStruct(node.name)) {
        throw new Diagnostic(`Unknown struct "${node.name}"`, node.location, 'semantic')
      }
      for (const field of node.fields) this.validateNode(field.value, locals)
      return
    }

    if (node.kind === 'ArrowFunctionExpression') {
      const arrowLocals = new Set(locals)
      for (const param of node.params) arrowLocals.add(param.name)
      this.validateNode(node.body, arrowLocals)
      return
    }

    if (node.kind === 'MatchExpression') {
      this.validateNode(node.discriminant, locals)
      for (const arm of node.arms) {
        this.validateNode(arm.pattern, locals)
        this.validateNode(arm.value, locals)
      }
      return
    }

    for (const child of this.expressionChildren(node)) this.validateNode(child, locals)
  }

  literalType(node) {
    const token = node.token
    if (token.type === TokenType.String) return LumenTypes.String
    if (token.lexeme === 'true' || token.lexeme === 'false') return LumenTypes.Bool
    if (token.lexeme === 'null') return LumenTypes.Unknown
    if (token.type === TokenType.Number && token.lexeme.includes('.')) return LumenTypes.F32
    if (token.type === TokenType.Number && Math.abs(token.literal) > 2147483647) return LumenTypes.I64
    return LumenTypes.I32
  }

  identifierType(node) {
    return this.scope.resolve(node.name)?.type ??
      this.typeSystem.enumVariant(node.name)?.enumName ??
      LumenTypes.Unknown
  }

  binaryType(node) {
    const left = this.inferNode(node.left)
    const right = this.inferNode(node.right)

    if (['&&', '||'].includes(node.operator)) {
      if (left !== LumenTypes.Bool || right !== LumenTypes.Bool) {
        throw new Diagnostic(`Operator ${node.operator} needs bool operands`, node.location, 'type')
      }
      return LumenTypes.Bool
    }

    if (['<', '<=', '>', '>='].includes(node.operator)) {
      if (!this.typeSystem.isNumeric(left) || !this.typeSystem.isNumeric(right)) {
        throw new Diagnostic(`Operator ${node.operator} needs numbers`, node.location, 'type')
      }
      return LumenTypes.Bool
    }

    if (['==', '===', '!=', '!=='].includes(node.operator)) {
      if (!this.typeSystem.canAssign(left, right) && !this.typeSystem.canAssign(right, left)) {
        throw new Diagnostic(`Cannot compare ${left} with ${right}`, node.location, 'type')
      }
      return LumenTypes.Bool
    }

    if (node.operator === '+' && left === LumenTypes.String && right === LumenTypes.String) {
      return LumenTypes.String
    }
    if (!this.typeSystem.isNumeric(left) || !this.typeSystem.isNumeric(right)) {
      throw new Diagnostic(`Operator ${node.operator} needs numbers`, node.location, 'type')
    }
    return this.typeSystem.widest(left, right)
  }

  callType(node) {
    const name = this.calleeName(node)
    if (!name) return LumenTypes.Unknown

    if (name === SystemFunctions.Min || name === SystemFunctions.Max) {
      return this.numericPairType(node, name)
    }
    if (name === SystemFunctions.Filter) {
      if (node.arguments.length !== 2 || node.arguments[1].kind !== 'ArrowFunctionExpression') {
        throw new Diagnostic('filter expects array and predicate', node.location, 'semantic')
      }
      const collectionType = this.inferNode(node.arguments[0])
      if (!this.typeSystem.isArray(collectionType)) {
        throw new Diagnostic('filter expects an array', node.location, 'type')
      }
      const predicate = node.arguments[1]
      if (predicate.params.length !== 1) {
        throw new Diagnostic('filter predicate expects one parameter', predicate.location, 'type')
      }
      const parameterType = this.typeSystem.elementType(collectionType) ?? LumenTypes.Unknown
      const predicateScope = new Scope(this.scope)
      predicate.params[0].inferredType = parameterType
      predicateScope.define(predicate.params[0].name, {
        kind: 'param',
        node: predicate.params[0],
        type: parameterType,
        mutable: false
      })
      const predicateInspector = new ExpressionInspector(
        predicateScope,
        this.typeSystem,
        this.systemLibrary,
        this.fsLibrary,
        this.httpLibrary,
        this.threadLibrary
      )
      const predicateType = predicateInspector.inferNode(predicate.body)
      if (predicateType !== LumenTypes.Bool) {
        throw new Diagnostic(`filter predicate must return bool, got ${predicateType}`, predicate.location, 'type')
      }
      predicate.inferredType = LumenTypes.Unknown
      return collectionType
    }
    if (name === SystemFunctions.Includes) {
      if (node.arguments.length !== 2) {
        throw new Diagnostic('includes expects collection and value', node.location, 'semantic')
      }
      const collection = this.inferNode(node.arguments[0])
      if (collection !== LumenTypes.String && !this.typeSystem.isArray(collection)) {
        throw new Diagnostic('includes needs string or array', node.location, 'semantic')
      }
      if (this.typeSystem.isArray(collection)) {
        const valueType = this.inferNode(node.arguments[1])
        const elementType = this.typeSystem.elementType(collection)
        if (!this.typeSystem.canAssign(valueType, elementType)) {
          throw new Diagnostic(`Cannot search ${collection} for ${valueType}`, node.location, 'type')
        }
      }
      return LumenTypes.Bool
    }
    if (name === SystemFunctions.Ok) {
      if (node.arguments.length !== 1) {
        throw new Diagnostic('ok expects one value', node.location, 'semantic')
      }
      return `Result<${node.arguments[0] ? this.inferNode(node.arguments[0]) : LumenTypes.Unknown}>`
    }
    if (name === SystemFunctions.Err) {
      if (node.arguments.length !== 1 || this.inferNode(node.arguments[0]) !== LumenTypes.String) {
        throw new Diagnostic('err expects one string', node.location, 'type')
      }
      return 'Result<unknown>'
    }
    if (name === SystemFunctions.ResultValue) {
      if (node.arguments.length !== 1) {
        throw new Diagnostic('resultValue expects Result<T>', node.location, 'semantic')
      }
      const result = node.arguments[0] ? this.inferNode(node.arguments[0]) : LumenTypes.Unknown
      if (!this.typeSystem.isGeneric(result) || this.typeSystem.genericBase(result) !== 'Result') {
        throw new Diagnostic('resultValue expects Result<T>', node.location, 'semantic')
      }
      return this.typeSystem.genericArgs(result)[0] ?? LumenTypes.Unknown
    }
    if (name === SystemFunctions.Some) {
      if (node.arguments.length !== 1) {
        throw new Diagnostic('some expects one value', node.location, 'semantic')
      }
      const value = node.arguments[0] ? this.inferNode(node.arguments[0]) : LumenTypes.Unknown
      return this.typeSystem.isNullable(value) ? value : `${value}?`
    }
    if (name === SystemFunctions.None) {
      if (node.arguments.length !== 0) {
        throw new Diagnostic('none expects no values', node.location, 'semantic')
      }
      return LumenTypes.Unknown
    }
    if (name === SystemFunctions.HasValue) {
      if (node.arguments.length !== 1) {
        throw new Diagnostic('hasValue expects one nullable value', node.location, 'semantic')
      }
      const maybe = this.inferNode(node.arguments[0])
      if (!this.typeSystem.isNullable(maybe)) {
        throw new Diagnostic(`hasValue expects nullable value, got ${maybe}`, node.location, 'type')
      }
      return LumenTypes.Bool
    }
    if (name === SystemFunctions.ValueOr) {
      if (node.arguments.length !== 2) {
        throw new Diagnostic('valueOr expects nullable value and fallback', node.location, 'semantic')
      }
      const maybe = node.arguments[0] ? this.inferNode(node.arguments[0]) : LumenTypes.Unknown
      if (!this.typeSystem.isNullable(maybe)) {
        throw new Diagnostic(`valueOr expects nullable value, got ${maybe}`, node.location, 'type')
      }
      const valueType = this.typeSystem.nonNullable(maybe)
      const fallbackType = this.inferNode(node.arguments[1])
      if (!this.typeSystem.canAssign(fallbackType, valueType)) {
        throw new Diagnostic(`Cannot use ${fallbackType} as fallback for ${maybe}`, node.location, 'type')
      }
      return valueType
    }
    if (name === SystemFunctions.IsOk || name === SystemFunctions.ErrorMessage) {
      if (node.arguments.length !== 1) {
        throw new Diagnostic(`${name} expects one Result<T>`, node.location, 'semantic')
      }
      const result = this.inferNode(node.arguments[0])
      if (!this.typeSystem.isGeneric(result) || this.typeSystem.genericBase(result) !== 'Result') {
        throw new Diagnostic(`${name} expects Result<T>, got ${result}`, node.location, 'type')
      }
      return name === SystemFunctions.IsOk ? LumenTypes.Bool : LumenTypes.String
    }
    if (name === SystemFunctions.ArrayFirst || name === SystemFunctions.ArrayLast) {
      const collection = node.arguments[0] ? this.inferNode(node.arguments[0]) : LumenTypes.Unknown
      if (node.arguments.length !== 1 || !this.typeSystem.isArray(collection)) {
        throw new Diagnostic(`${name} expects an array`, node.location, 'type')
      }
      return this.typeSystem.elementType(collection)
    }
    if (FIXED_CALL_TYPES.has(name)) return FIXED_CALL_TYPES.get(name)

    const symbol = this.scope.resolve(name)
    if (symbol?.kind !== 'function') return LumenTypes.Unknown
    const params = symbol.node?.params ?? []
    if (node.arguments.length !== params.length) {
      throw new Diagnostic(`Invalid call to ${name}`, node.location, 'semantic')
    }

    for (const [index, argument] of node.arguments.entries()) {
      const actual = this.inferNode(argument)
      const expected = params[index].inferredType ??
        params[index].typeAnnotation?.name ??
        LumenTypes.I32
      if (!this.typeSystem.canAssign(actual, expected)) {
        throw new Diagnostic(`Cannot pass ${actual} to ${expected}`, node.location, 'semantic')
      }
    }
    return symbol.type ?? LumenTypes.Unknown
  }

  numericPairType(node, name) {
    if (node.arguments.length !== 2) {
      throw new Diagnostic(`${name} expects two numbers`, node.location, 'semantic')
    }
    const left = this.inferNode(node.arguments[0])
    const right = this.inferNode(node.arguments[1])
    if (!this.typeSystem.isNumeric(left) || !this.typeSystem.isNumeric(right)) {
      throw new Diagnostic(`${name} expects numeric arguments`, node.location, 'semantic')
    }
    return this.typeSystem.widest(left, right)
  }

  memberType(node) {
    const objectType = this.inferNode(node.object)
    if (node.computed) {
      if (node.property.kind === 'SliceExpression') {
        if (objectType !== LumenTypes.String) {
          throw new Diagnostic('Slice needs string', node.location, 'semantic')
        }
        for (const bound of [node.property.start, node.property.end]) {
          if (bound && this.inferNode(bound) !== LumenTypes.I32) {
            throw new Diagnostic('Slice bounds must be i32', bound.location, 'type')
          }
        }
        return LumenTypes.String
      }
      if (objectType === LumenTypes.String) {
        const indexType = this.inferNode(node.property)
        if (indexType !== LumenTypes.I32) {
          throw new Diagnostic(`String index must be i32, got ${indexType}`, node.property.location, 'type')
        }
        return LumenTypes.String
      }
      if (!this.typeSystem.isArray(objectType)) {
        throw new Diagnostic('Expected array', node.location, 'semantic')
      }
      const indexType = this.inferNode(node.property)
      if (indexType !== LumenTypes.I32) {
        throw new Diagnostic(`Array index must be i32, got ${indexType}`, node.property.location, 'type')
      }
      return this.typeSystem.elementType(objectType)
    }

    const field = this.typeSystem.getField(objectType, node.property.name)
    if (!field) {
      throw new Diagnostic(`Unknown field "${node.property.name}"`, node.property.location, 'semantic')
    }
    return field.type
  }

  assignmentType(node) {
    const target = this.inferNode(node.left)
    const value = this.inferNode(node.right)
    if (target !== LumenTypes.Unknown && !this.typeSystem.canAssign(value, target)) {
      throw new Diagnostic(`Cannot assign ${value} to ${target}`, node.location, 'type')
    }
    if (node.left.kind === 'IdentifierExpression') {
      const symbol = this.scope.resolve(node.left.name)
      if (symbol) {
        symbol.initialized = true
        if (symbol.type === LumenTypes.Unknown) {
          symbol.type = value
          if (symbol.node) symbol.node.inferredType = value
          node.left.inferredType = value
        }
      }
    }
    return target === LumenTypes.Unknown ? value : target
  }

  arrayType(node) {
    if (node.elements.length === 0) return `${LumenTypes.Unknown}[]`
    let type = this.inferNode(node.elements[0])
    for (const element of node.elements.slice(1)) {
      const elementType = this.inferNode(element)
      if (this.typeSystem.isNumeric(type) && this.typeSystem.isNumeric(elementType)) {
        type = this.typeSystem.widest(type, elementType)
      } else if (this.typeSystem.canAssign(elementType, type)) {
        continue
      } else if (this.typeSystem.canAssign(type, elementType)) {
        type = elementType
      } else {
        throw new Diagnostic(`Array elements have types ${type} and ${elementType}`, element.location, 'type')
      }
    }
    return `${type}[]`
  }

  matchType(node) {
    if (node.arms.length === 0) {
      throw new Diagnostic('Match needs at least one arm', node.location, 'type')
    }
    const discriminantType = this.inferNode(node.discriminant)
    const seenPatterns = new Set()
    let hasWildcard = false

    for (const [index, arm] of node.arms.entries()) {
      if (!arm.pattern) {
        if (hasWildcard) {
          throw new Diagnostic('Match has duplicate wildcard arm', arm.location, 'type')
        }
        if (index !== node.arms.length - 1) {
          throw new Diagnostic('Match wildcard must be last', arm.location, 'type')
        }
        hasWildcard = true
        continue
      }
      if (!['LiteralExpression', 'IdentifierExpression'].includes(arm.pattern.kind)) {
        throw new Diagnostic('Match pattern must be a literal, enum variant, or wildcard', arm.location, 'type')
      }
      if (arm.pattern.kind === 'IdentifierExpression' && !this.typeSystem.enumVariant(arm.pattern.name)) {
        throw new Diagnostic('Match identifier pattern must be an enum variant', arm.location, 'type')
      }
      const patternType = this.inferNode(arm.pattern)
      if (!this.typeSystem.canAssign(patternType, discriminantType) &&
        !this.typeSystem.canAssign(discriminantType, patternType)) {
        throw new Diagnostic(
          `Cannot match ${discriminantType} with ${patternType}`,
          arm.location,
          'type'
        )
      }
      const key = arm.pattern.kind === 'IdentifierExpression'
        ? `enum:${arm.pattern.name}`
        : `literal:${arm.pattern.token.lexeme}`
      if (seenPatterns.has(key)) {
        throw new Diagnostic('Match has duplicate pattern', arm.location, 'type')
      }
      seenPatterns.add(key)
    }

    const enumType = this.typeSystem.getEnum(discriminantType)
    if (!hasWildcard && enumType) {
      const missing = enumType.variants.filter(variant => !seenPatterns.has(`enum:${variant.name}`))
      if (missing.length > 0) {
        throw new Diagnostic(`Match is missing ${missing.map(variant => variant.name).join(', ')}`, node.location, 'type')
      }
    } else if (!hasWildcard && discriminantType === LumenTypes.Bool) {
      if (!seenPatterns.has('literal:true') || !seenPatterns.has('literal:false')) {
        throw new Diagnostic('Match on bool needs true and false arms', node.location, 'type')
      }
    } else if (!hasWildcard && !enumType) {
      throw new Diagnostic(`Match on ${discriminantType} needs a wildcard arm`, node.location, 'type')
    }

    let type = this.inferNode(node.arms[0].value)
    for (const arm of node.arms.slice(1)) {
      const armType = this.inferNode(arm.value)
      if (this.typeSystem.isNumeric(type) && this.typeSystem.isNumeric(armType)) {
        type = this.typeSystem.widest(type, armType)
      } else if (this.typeSystem.canAssign(armType, type)) {
        continue
      } else if (this.typeSystem.canAssign(type, armType)) {
        type = armType
      } else {
        throw new Diagnostic(`Match arms return ${type} and ${armType}`, arm.location, 'type')
      }
    }
    return type
  }

  calleeName(node) {
    return node.callee.kind === 'IdentifierExpression'
      ? node.callee.name
      : null
  }

  isKnownCall(name) {
    return this.systemLibrary.has(name) ||
      this.fsLibrary.has(name) ||
      this.httpLibrary.has(name) ||
      this.threadLibrary.has(name) ||
      this.scope.resolve(name)?.kind === 'function'
  }

  expressionNode(expression) {
    return expression?.kind === 'RawExpression'
      ? expression.parsed
      : expression
  }

  expressionChildren(node) {
    if (node.kind === 'UnaryExpression' || node.kind === 'AwaitExpression' || node.kind === 'UpdateExpression') {
      return [node.argument]
    }
    if (node.kind === 'BinaryExpression' || node.kind === 'AssignmentExpression') {
      return [node.left, node.right]
    }
    if (node.kind === 'ArrayExpression') return node.elements
    if (node.kind === 'SliceExpression') return [node.start, node.end]
    return []
  }
}
