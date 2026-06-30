import { TokenType } from '../lexer/TokenType.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes } from './TypeSystem.js'
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

    if (node.kind === 'LiteralExpression') return this.literalType(node)
    if (node.kind === 'IdentifierExpression') return this.identifierType(node)
    if (node.kind === 'AwaitExpression') return this.inferNode(node.argument)
    if (node.kind === 'UnaryExpression') {
      return node.operator === '!' ? LumenTypes.Bool : this.inferNode(node.argument)
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
      if (locals.has(node.name) || this.scope.resolve(node.name) || this.typeSystem.enumVariant(node.name)) return
      throw new Diagnostic(`Unknown symbol "${node.name}"`, node.location, 'semantic')
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
    if (['<', '<=', '>', '>=', '==', '===', '!=', '!==', '&&', '||'].includes(node.operator)) {
      return LumenTypes.Bool
    }

    const left = this.inferNode(node.left)
    const right = this.inferNode(node.right)
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
      return this.inferNode(node.arguments[0])
    }
    if (name === SystemFunctions.Includes) {
      if (node.arguments.length !== 2) {
        throw new Diagnostic('includes expects collection and value', node.location, 'semantic')
      }
      const collection = this.inferNode(node.arguments[0])
      if (collection !== LumenTypes.String && !this.typeSystem.isArray(collection)) {
        throw new Diagnostic('includes needs string or array', node.location, 'semantic')
      }
      return LumenTypes.Bool
    }
    if (name === SystemFunctions.Ok) {
      return `Result<${node.arguments[0] ? this.inferNode(node.arguments[0]) : LumenTypes.Unknown}>`
    }
    if (name === SystemFunctions.ResultValue) {
      const result = node.arguments[0] ? this.inferNode(node.arguments[0]) : LumenTypes.Unknown
      if (!this.typeSystem.isGeneric(result) || this.typeSystem.genericBase(result) !== 'Result') {
        throw new Diagnostic('resultValue expects Result<T>', node.location, 'semantic')
      }
      return this.typeSystem.genericArgs(result)[0] ?? LumenTypes.Unknown
    }
    if (name === SystemFunctions.Some) {
      return `${node.arguments[0] ? this.inferNode(node.arguments[0]) : LumenTypes.Unknown}?`
    }
    if (name === SystemFunctions.ValueOr) {
      const maybe = node.arguments[0] ? this.inferNode(node.arguments[0]) : LumenTypes.Unknown
      return this.typeSystem.isNullable(maybe)
        ? this.typeSystem.nonNullable(maybe)
        : node.arguments[1] ? this.inferNode(node.arguments[1]) : LumenTypes.Unknown
    }
    if (name === SystemFunctions.ArrayFirst || name === SystemFunctions.ArrayLast) {
      const collection = node.arguments[0] ? this.inferNode(node.arguments[0]) : LumenTypes.Unknown
      return this.typeSystem.isArray(collection)
        ? this.typeSystem.elementType(collection)
        : LumenTypes.Unknown
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
        return LumenTypes.String
      }
      if (objectType === LumenTypes.String) return LumenTypes.String
      if (!this.typeSystem.isArray(objectType)) {
        throw new Diagnostic('Expected array', node.location, 'semantic')
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
    return target === LumenTypes.Unknown ? value : target
  }

  arrayType(node) {
    if (node.elements.length === 0) return LumenTypes.Unknown
    let type = this.inferNode(node.elements[0])
    for (const element of node.elements.slice(1)) {
      const elementType = this.inferNode(element)
      if (this.typeSystem.isNumeric(type) && this.typeSystem.isNumeric(elementType)) {
        type = this.typeSystem.widest(type, elementType)
      }
    }
    return `${type}[]`
  }

  matchType(node) {
    if (node.arms.length === 0) return LumenTypes.Unknown
    const discriminantType = this.inferNode(node.discriminant)
    for (const arm of node.arms) {
      if (!arm.pattern) continue
      const patternType = this.inferNode(arm.pattern)
      if (!this.typeSystem.canAssign(patternType, discriminantType) &&
        !this.typeSystem.canAssign(discriminantType, patternType)) {
        throw new Diagnostic(
          `Cannot match ${discriminantType} with ${patternType}`,
          arm.location,
          'type'
        )
      }
    }

    let type = this.inferNode(node.arms[0].value)
    for (const arm of node.arms.slice(1)) {
      const armType = this.inferNode(arm.value)
      if (this.typeSystem.isNumeric(type) && this.typeSystem.isNumeric(armType)) {
        type = this.typeSystem.widest(type, armType)
      } else if (!this.typeSystem.canAssign(armType, type) && !this.typeSystem.canAssign(type, armType)) {
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
