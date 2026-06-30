import { TokenType } from '../lexer/TokenType.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes } from './TypeSystem.js'
import { SystemFunctions, SystemLibrary } from '../system/SystemLibrary.js'
import { FsFunctions, FsLibrary } from '../fs/FsLibrary.js'
import { HttpFunctions, HttpLibrary } from '../http/HttpLibrary.js'
import { ThreadFunctions, ThreadLibrary } from '../thread/ThreadLibrary.js'

export class ExpressionInspector {
  constructor(scope, typeSystem, systemLibrary = new SystemLibrary(), fsLibrary = new FsLibrary(), httpLibrary = new HttpLibrary(), threadLibrary = new ThreadLibrary()) {
    this.scope = scope
    this.typeSystem = typeSystem
    this.systemLibrary = systemLibrary
    this.fsLibrary = fsLibrary
    this.httpLibrary = httpLibrary
    this.threadLibrary = threadLibrary
  }

  infer(rawExpression) {
    if (!rawExpression || rawExpression.tokens.length === 0) return LumenTypes.Void
    if (rawExpression.tokens.length === 1 && ['true', 'false'].includes(rawExpression.tokens[0].lexeme)) return LumenTypes.Bool
    if (rawExpression.tokens[0]?.lexeme === 'await') {
      return this.infer({
        tokens: rawExpression.tokens.slice(1)
      })
    }
    if (this.isCall(rawExpression, SystemFunctions.Println)) return LumenTypes.Void
    if (this.isCall(rawExpression, SystemFunctions.Len)) return LumenTypes.I32
    if (this.isCall(rawExpression, SystemFunctions.Min)) return this.numericPairType(rawExpression.tokens, 'min')
    if (this.isCall(rawExpression, SystemFunctions.Max)) return this.numericPairType(rawExpression.tokens, 'max')
    if (this.isCall(rawExpression, SystemFunctions.Filter)) return this.filterType(rawExpression.tokens)
    if (this.isCall(rawExpression, SystemFunctions.Includes)) return this.includesType(rawExpression.tokens)
    if (this.isCall(rawExpression, SystemFunctions.Uuid)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.Date)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.Env)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.Encrypt)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.Decrypt)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.Arg)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.ArgCount)) return LumenTypes.I32
    if (this.isCall(rawExpression, SystemFunctions.Map)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.MapGet)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.MapHas)) return LumenTypes.Bool
    if (this.isCall(rawExpression, SystemFunctions.Ok)) return this.resultOkType(rawExpression.tokens)
    if (this.isCall(rawExpression, SystemFunctions.Err)) return 'Result<unknown>'
    if (this.isCall(rawExpression, SystemFunctions.IsOk)) return LumenTypes.Bool
    if (this.isCall(rawExpression, SystemFunctions.ResultValue)) return this.resultValueType(rawExpression.tokens)
    if (this.isCall(rawExpression, SystemFunctions.ErrorMessage)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.Some)) return this.someType(rawExpression.tokens)
    if (this.isCall(rawExpression, SystemFunctions.None)) return LumenTypes.Unknown
    if (this.isCall(rawExpression, SystemFunctions.HasValue)) return LumenTypes.Bool
    if (this.isCall(rawExpression, SystemFunctions.ValueOr)) return this.valueOrType(rawExpression.tokens)
    if (this.isCall(rawExpression, SystemFunctions.Assert)) return LumenTypes.Void
    if (this.isCall(rawExpression, SystemFunctions.Channel)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.Send)) return LumenTypes.Void
    if (this.isCall(rawExpression, SystemFunctions.Receive)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.Json)) return LumenTypes.Json
    if (this.isCall(rawExpression, SystemFunctions.JsonGet)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.JsonGetRaw)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.JsonSet)) return LumenTypes.Json
    if (this.isCall(rawExpression, SystemFunctions.JsonSetPath)) return LumenTypes.Json
    if (this.isCall(rawExpression, SystemFunctions.JsonQuote)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.JsonStringify)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.JsonValid)) return LumenTypes.Bool
    if (this.isCall(rawExpression, SystemFunctions.NewError)) return LumenTypes.Error
    if (this.isCall(rawExpression, SystemFunctions.ErrorCode)) return LumenTypes.I32
    if (this.isCall(rawExpression, SystemFunctions.ErrorText)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.ArraySum)) return LumenTypes.I32
    if (this.isCall(rawExpression, SystemFunctions.ArrayFirst)) return this.arrayElementCallType(rawExpression.tokens)
    if (this.isCall(rawExpression, SystemFunctions.ArrayLast)) return this.arrayElementCallType(rawExpression.tokens)
    if (this.isCall(rawExpression, SystemFunctions.ArrayJoin)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.Exec)) return LumenTypes.I32
    if (this.isCall(rawExpression, SystemFunctions.SourceSnippet)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.StringBuilder)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.StringBuilderAppend)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.StringLen)) return LumenTypes.I32
    if (this.isCall(rawExpression, SystemFunctions.StringEquals)) return LumenTypes.Bool
    if (this.isCall(rawExpression, SystemFunctions.Trim)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.Lower)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.Upper)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.StartsWith)) return LumenTypes.Bool
    if (this.isCall(rawExpression, SystemFunctions.EndsWith)) return LumenTypes.Bool
    if (this.isCall(rawExpression, SystemFunctions.Replace)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.Split)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.IndexOf)) return LumenTypes.I32
    if (this.isCall(rawExpression, SystemFunctions.LastIndexOf)) return LumenTypes.I32
    if (this.isCall(rawExpression, SystemFunctions.Contains)) return LumenTypes.Bool
    if (this.isCall(rawExpression, SystemFunctions.Repeat)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.PadStart)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.PadEnd)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.IntToString)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.StringToInt)) return LumenTypes.I32
    if (this.isCall(rawExpression, SystemFunctions.ParseI32)) return LumenTypes.I32
    if (this.isCall(rawExpression, SystemFunctions.ParseF32)) return LumenTypes.F32
    if (this.isCall(rawExpression, SystemFunctions.List)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.ListPush)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.ListGet)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.ListLen)) return LumenTypes.I32
    if (this.isCall(rawExpression, SystemFunctions.MapSet)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.MapDelete)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.MapKeys)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.TokenizeSource)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.ParseSummary)) return LumenTypes.String
    if (this.isCall(rawExpression, SystemFunctions.CompilerImage)) return LumenTypes.String
    if (this.isCall(rawExpression, FsFunctions.ReadFile)) return LumenTypes.String
    if (this.isCall(rawExpression, FsFunctions.WriteFile)) return LumenTypes.I32
    if (this.isCall(rawExpression, HttpFunctions.ServeFiles)) return LumenTypes.I32
    if (this.isCall(rawExpression, HttpFunctions.ServeApi)) return LumenTypes.I32
    if (this.isCall(rawExpression, HttpFunctions.ServeHttp)) return LumenTypes.I32
    if (this.isCall(rawExpression, HttpFunctions.ServeSocketIoChat)) return LumenTypes.I32
    if (this.isCall(rawExpression, HttpFunctions.SocketIoEvent)) return LumenTypes.String
    if (this.isCall(rawExpression, HttpFunctions.SocketIoEmit)) return LumenTypes.String
    if (this.isCall(rawExpression, HttpFunctions.HttpRequest)) return LumenTypes.String
    if (this.isCall(rawExpression, HttpFunctions.HttpResponse)) return LumenTypes.String
    if (this.isCall(rawExpression, ThreadFunctions.CreateSemaphore)) return LumenTypes.Semaphore
    if (this.isCall(rawExpression, ThreadFunctions.SemaphoreWait)) return LumenTypes.I32
    if (this.isCall(rawExpression, ThreadFunctions.SemaphoreSignal)) return LumenTypes.I32
    if (this.isCall(rawExpression, ThreadFunctions.StartThread)) return LumenTypes.Thread
    if (this.isCall(rawExpression, ThreadFunctions.JoinThread)) return LumenTypes.I32
    if (this.isCall(rawExpression, ThreadFunctions.AppendFile)) return LumenTypes.I32
    if (this.isStructLiteral(rawExpression.tokens)) return rawExpression.tokens[0].lexeme
    if (this.isFieldAccess(rawExpression.tokens)) return this.fieldAccessType(rawExpression.tokens)
    if (this.isArrayLiteral(rawExpression.tokens)) return this.arrayLiteralType(rawExpression.tokens)
    if (this.isArrayAccess(rawExpression.tokens)) return this.arrayAccessType(rawExpression.tokens)
    if (this.isUserCall(rawExpression.tokens)) return this.userCallType(rawExpression.tokens)
    if (this.isMatch(rawExpression.tokens)) return this.matchType(rawExpression.tokens)
    if (this.isSingleIdentifier(rawExpression.tokens)) {
      return this.scope.resolve(rawExpression.tokens[0].lexeme)?.type ??
        this.typeSystem.enumVariant(rawExpression.tokens[0].lexeme)?.enumName ??
        LumenTypes.Unknown
    }

    let numericType = LumenTypes.I32

    for (let index = 0; index < rawExpression.tokens.length; index += 1) {
      const token = rawExpression.tokens[index]
      if (token.type === TokenType.String) return LumenTypes.String
      if (['<', '<=', '>', '>=', '==', '!='].includes(token.lexeme)) return LumenTypes.Bool
      if (token.type === TokenType.Identifier && rawExpression.tokens[index + 1]?.lexeme === '[') {
        const accessType = this.arrayAccessTypeAt(rawExpression.tokens, index)
        if (this.typeSystem.isNumeric(accessType)) {
          numericType = this.typeSystem.widest(numericType, accessType)
        }
        continue
      }
      if (token.type === TokenType.Number && token.lexeme.includes('.')) {
        numericType = this.typeSystem.widest(numericType, LumenTypes.F32)
      }
      if (token.type === TokenType.Number && Math.abs(token.literal) > 2147483647) {
        numericType = this.typeSystem.widest(numericType, LumenTypes.I64)
      }
      if (token.type === TokenType.Identifier) {
        const symbol = this.scope.resolve(token.lexeme)
        if (symbol?.type && this.typeSystem.isNumeric(symbol.type)) {
          numericType = this.typeSystem.widest(numericType, symbol.type)
        }
      }
    }

    return numericType
  }

  validateNames(rawExpression) {
    if (!rawExpression) return

    for (const token of rawExpression.tokens) {
      if (token.type !== TokenType.Identifier) continue
      if (this.isBuiltinCallName(rawExpression.tokens, token)) continue
      if (this.isFsCallName(rawExpression.tokens, token)) continue
      if (this.isHttpCallName(rawExpression.tokens, token)) continue
      if (this.isThreadCallName(rawExpression.tokens, token)) continue
      if (this.isUserCallName(rawExpression.tokens, token)) continue
      if (this.isMatchKeyword(token)) continue
      if (this.typeSystem.enumVariant(token.lexeme)) continue
      if (this.isFilterParameter(rawExpression.tokens, token)) continue
      if (this.isStructLiteralName(rawExpression.tokens, token)) continue
      if (this.isKnownStructName(rawExpression.tokens, token)) continue
      if (this.isStructFieldKey(rawExpression.tokens, token)) continue
      if (this.isAnyFieldKey(rawExpression.tokens, token)) continue
      if (this.isFieldAccessName(rawExpression.tokens, token)) continue
      if (this.isFieldName(rawExpression.tokens, token)) continue
      if (['await', 'true', 'false', 'null'].includes(token.lexeme)) continue
      if (!this.scope.resolve(token.lexeme)) {
        throw new Diagnostic(`Unknown symbol "${token.lexeme}"`, token.location, 'semantic')
      }
    }
  }

  isStructLiteral(tokens) {
    return tokens[0]?.type === TokenType.Identifier &&
      tokens[1]?.lexeme === '{' &&
      tokens.at(-1)?.lexeme === '}' &&
      this.typeSystem.getStruct(tokens[0].lexeme)
  }

  isArrayLiteral(tokens) {
    return tokens[0]?.lexeme === '[' && tokens.at(-1)?.lexeme === ']'
  }

  isSingleIdentifier(tokens) {
    return tokens.length === 1 && tokens[0]?.type === TokenType.Identifier
  }

  arrayLiteralType(tokens) {
    const elements = this.splitDelimited(tokens.slice(1, -1))
    if (elements.length === 0) return LumenTypes.Unknown

    const firstType = this.infer({
      tokens: elements[0]
    })
    let type = firstType

    for (const element of elements.slice(1)) {
      const elementType = this.infer({
        tokens: element
      })
      type = this.typeSystem.isNumeric(type) && this.typeSystem.isNumeric(elementType)
        ? this.typeSystem.widest(type, elementType)
        : type
    }

    return `${type}[]`
  }

  isArrayAccess(tokens) {
    return tokens[0]?.type === TokenType.Identifier &&
      tokens[1]?.lexeme === '['
  }

  arrayAccessType(tokens) {
    return this.arrayAccessTypeAt(tokens, 0)
  }

  arrayAccessTypeAt(tokens, index) {
    const base = this.scope.resolve(tokens[index].lexeme)
    if (base?.type === LumenTypes.String) return LumenTypes.String

    if (!base || !this.typeSystem.isArray(base.type)) {
      throw new Diagnostic(`Expected array "${tokens[index].lexeme}"`, tokens[index].location, 'semantic')
    }

    let type = this.typeSystem.elementType(base.type)
    const closeIndex = this.findMatching(tokens, index + 1, '[', ']')

    if (tokens[closeIndex + 1]?.lexeme === '.') {
      const fieldName = tokens[closeIndex + 2]?.lexeme
      const field = this.typeSystem.getField(type, fieldName)

      if (!field) {
        throw new Diagnostic(`Unknown field "${fieldName}"`, tokens[closeIndex + 2]?.location, 'semantic')
      }

      type = field.type
    }

    return type
  }

  isStructLiteralName(tokens, token) {
    return tokens.indexOf(token) === 0 && this.isStructLiteral(tokens)
  }

  isKnownStructName(tokens, token) {
    const index = tokens.indexOf(token)
    return this.typeSystem.getStruct(token.lexeme) && tokens[index + 1]?.lexeme === '{'
  }

  isStructFieldKey(tokens, token) {
    const index = tokens.indexOf(token)
    return this.isStructLiteral(tokens) && tokens[index + 1]?.lexeme === ':'
  }

  isFieldAccess(tokens) {
    return tokens.length === 3 &&
      tokens[0]?.type === TokenType.Identifier &&
      tokens[1]?.lexeme === '.' &&
      tokens[2]?.type === TokenType.Identifier
  }

  isFieldAccessName(tokens, token) {
    return this.isFieldAccess(tokens) && tokens.indexOf(token) === 2
  }

  isFieldName(tokens, token) {
    const index = tokens.indexOf(token)
    return tokens[index - 1]?.lexeme === '.'
  }

  isAnyFieldKey(tokens, token) {
    const index = tokens.indexOf(token)
    return tokens[index + 1]?.lexeme === ':'
  }

  fieldAccessType(tokens) {
    const base = this.scope.resolve(tokens[0].lexeme)
    const field = base ? this.typeSystem.getField(base.type, tokens[2].lexeme) : null

    if (!field) {
      throw new Diagnostic(`Unknown field "${tokens[2].lexeme}"`, tokens[2].location, 'semantic')
    }

    return field.type
  }

  isCall(rawExpression, name) {
    return rawExpression.tokens[0]?.lexeme === name &&
      rawExpression.tokens[1]?.lexeme === '(' &&
      rawExpression.tokens.at(-1)?.lexeme === ')'
  }

  isMatch(tokens) {
    return tokens[0]?.lexeme === 'match'
  }

  matchType(tokens) {
    const arrow = tokens.findIndex(token => token.lexeme === '=>')
    if (arrow < 0) return LumenTypes.Unknown
    return this.infer({
      tokens: this.readMatchArmExpression(tokens, arrow + 1)
    })
  }

  readMatchArmExpression(tokens, start) {
    const value = []
    let depth = 0
    for (let index = start; index < tokens.length - 1; index += 1) {
      const token = tokens[index]
      if (depth === 0 && token.type === TokenType.Semicolon) break
      if (depth === 0 && (token.lexeme === '=>' || token.lexeme === '_')) break
      if (['(', '[', '{'].includes(token.lexeme)) depth += 1
      if ([')', ']', '}'].includes(token.lexeme)) depth -= 1
      value.push(token)
    }
    return value
  }

  isMatchKeyword(token) {
    return ['match', '_'].includes(token.lexeme)
  }

  isBuiltinCallName(tokens, token) {
    const index = tokens.indexOf(token)
    return this.systemLibrary.has(token.lexeme) && tokens[index + 1]?.lexeme === '('
  }

  isFsCallName(tokens, token) {
    const index = tokens.indexOf(token)
    return this.fsLibrary.has(token.lexeme) && tokens[index + 1]?.lexeme === '('
  }

  isHttpCallName(tokens, token) {
    const index = tokens.indexOf(token)
    return this.httpLibrary.has(token.lexeme) && tokens[index + 1]?.lexeme === '('
  }

  isThreadCallName(tokens, token) {
    const index = tokens.indexOf(token)
    return this.threadLibrary.has(token.lexeme) && tokens[index + 1]?.lexeme === '('
  }

  isUserCall(tokens) {
    return tokens[0]?.type === TokenType.Identifier &&
      tokens[1]?.lexeme === '(' &&
      tokens.at(-1)?.lexeme === ')' &&
      this.scope.resolve(tokens[0].lexeme)?.kind === 'function'
  }

  userCallType(tokens) {
    const symbol = this.scope.resolve(tokens[0].lexeme)
    const args = this.callArguments(tokens)
    const params = symbol?.node?.params ?? []

    if (args.length !== params.length) {
      throw new Diagnostic(`Invalid call to ${tokens[0].lexeme}`, tokens[0].location, 'semantic')
    }

    for (const [index, arg] of args.entries()) {
      const actual = this.infer({
        tokens: arg
      })
      const expected = params[index].inferredType ?? params[index].typeAnnotation?.name ?? LumenTypes.I32

      if (!this.typeSystem.canAssign(actual, expected)) {
        throw new Diagnostic(`Cannot pass ${actual} to ${expected}`, tokens[0].location, 'semantic')
      }
    }

    return symbol?.type ?? LumenTypes.Unknown
  }

  isUserCallName(tokens, token) {
    const index = tokens.indexOf(token)
    return this.scope.resolve(token.lexeme)?.kind === 'function' && tokens[index + 1]?.lexeme === '('
  }

  isFilterParameter(tokens, token) {
    if (!this.isCall({ tokens }, SystemFunctions.Filter)) return false

    const args = this.callArguments(tokens)
    const predicate = args[1] ?? []
    const arrow = predicate.findIndex(part => part.lexeme === '=>')
    const name = predicate[arrow - 1]?.lexeme

    return token.lexeme === name
  }

  filterType(tokens) {
    const args = this.callArguments(tokens)
    if (args.length !== 2) {
      throw new Diagnostic('filter expects array and predicate', tokens[0].location, 'semantic')
    }

    return this.infer({
      tokens: args[0]
    })
  }

  includesType(tokens) {
    const args = this.callArguments(tokens)
    if (args.length !== 2) {
      throw new Diagnostic('includes expects collection and value', tokens[0].location, 'semantic')
    }

    const haystackType = this.infer({
      tokens: args[0]
    })

    if (haystackType !== LumenTypes.String && !this.typeSystem.isArray(haystackType)) {
      throw new Diagnostic('includes needs string or array', tokens[0].location, 'semantic')
    }

    return LumenTypes.Bool
  }

  numericPairType(tokens, name) {
    const args = this.callArguments(tokens)
    if (args.length !== 2) {
      throw new Diagnostic(`${name} expects two numbers`, tokens[0].location, 'semantic')
    }

    const left = this.infer({
      tokens: args[0]
    })
    const right = this.infer({
      tokens: args[1]
    })

    if (!this.typeSystem.isNumeric(left) || !this.typeSystem.isNumeric(right)) {
      throw new Diagnostic(`${name} expects numeric arguments`, tokens[0].location, 'semantic')
    }

    return this.typeSystem.widest(left, right)
  }

  arrayElementCallType(tokens) {
    const args = this.callArguments(tokens)
    if (args.length !== 1) return LumenTypes.Unknown
    const collectionType = this.infer({
      tokens: args[0]
    })
    return this.typeSystem.isArray(collectionType)
      ? this.typeSystem.elementType(collectionType)
      : LumenTypes.Unknown
  }

  resultOkType(tokens) {
    const args = this.callArguments(tokens)
    if (args.length !== 1) return 'Result<unknown>'
    const valueType = this.infer({
      tokens: args[0]
    })
    return `Result<${valueType}>`
  }

  resultValueType(tokens) {
    const args = this.callArguments(tokens)
    if (args.length !== 1) return LumenTypes.Unknown
    const resultType = this.infer({
      tokens: args[0]
    })
    if (!this.typeSystem.isGeneric(resultType) || this.typeSystem.genericBase(resultType) !== 'Result') {
      throw new Diagnostic('resultValue expects Result<T>', tokens[0].location, 'semantic')
    }

    return this.typeSystem.genericArgs(resultType)[0] ?? LumenTypes.Unknown
  }

  someType(tokens) {
    const args = this.callArguments(tokens)
    if (args.length !== 1) return LumenTypes.Unknown
    const valueType = this.infer({
      tokens: args[0]
    })
    return `${valueType}?`
  }

  valueOrType(tokens) {
    const args = this.callArguments(tokens)
    if (args.length !== 2) return LumenTypes.Unknown
    const maybeType = this.infer({
      tokens: args[0]
    })
    if (this.typeSystem.isNullable(maybeType)) return this.typeSystem.nonNullable(maybeType)
    return this.infer({
      tokens: args[1]
    })
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

  callArguments(tokens) {
    return this.splitDelimited(tokens.slice(2, -1))
  }

  findMatching(tokens, start, open, close) {
    let depth = 0

    for (let index = start; index < tokens.length; index += 1) {
      if (tokens[index].lexeme === open) depth += 1
      if (tokens[index].lexeme === close) {
        depth -= 1
        if (depth === 0) return index
      }
    }

    return -1
  }
}
