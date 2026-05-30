import { TokenType } from '../lexer/TokenType.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes } from './TypeSystem.js'
import { SystemFunctions, SystemLibrary } from '../system/SystemLibrary.js'
import { FsFunctions, FsLibrary } from '../fs/FsLibrary.js'
import { HttpFunctions, HttpLibrary } from '../http/HttpLibrary.js'

export class ExpressionInspector {
  constructor(scope, typeSystem, systemLibrary = new SystemLibrary(), fsLibrary = new FsLibrary(), httpLibrary = new HttpLibrary()) {
    this.scope = scope
    this.typeSystem = typeSystem
    this.systemLibrary = systemLibrary
    this.fsLibrary = fsLibrary
    this.httpLibrary = httpLibrary
  }

  infer(rawExpression) {
    if (!rawExpression || rawExpression.tokens.length === 0) return LumenTypes.Void
    if (this.isCall(rawExpression, SystemFunctions.Println)) return LumenTypes.Void
    if (this.isCall(rawExpression, SystemFunctions.Len)) return LumenTypes.I32
    if (this.isCall(rawExpression, SystemFunctions.Filter)) return this.filterType(rawExpression.tokens)
    if (this.isCall(rawExpression, SystemFunctions.Includes)) return this.includesType(rawExpression.tokens)
    if (this.isCall(rawExpression, FsFunctions.ReadFile)) return LumenTypes.String
    if (this.isCall(rawExpression, HttpFunctions.ServeFiles)) return LumenTypes.I32
    if (this.isCall(rawExpression, HttpFunctions.ServeApi)) return LumenTypes.I32
    if (this.isCall(rawExpression, HttpFunctions.ServeHttp)) return LumenTypes.I32
    if (this.isStructLiteral(rawExpression.tokens)) return rawExpression.tokens[0].lexeme
    if (this.isFieldAccess(rawExpression.tokens)) return this.fieldAccessType(rawExpression.tokens)
    if (this.isArrayLiteral(rawExpression.tokens)) return this.arrayLiteralType(rawExpression.tokens)
    if (this.isArrayAccess(rawExpression.tokens)) return this.arrayAccessType(rawExpression.tokens)
    if (this.isSingleIdentifier(rawExpression.tokens)) {
      return this.scope.resolve(rawExpression.tokens[0].lexeme)?.type ?? LumenTypes.Unknown
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
      if (this.isFilterParameter(rawExpression.tokens, token)) continue
      if (this.isStructLiteralName(rawExpression.tokens, token)) continue
      if (this.isKnownStructName(rawExpression.tokens, token)) continue
      if (this.isStructFieldKey(rawExpression.tokens, token)) continue
      if (this.isAnyFieldKey(rawExpression.tokens, token)) continue
      if (this.isFieldAccessName(rawExpression.tokens, token)) continue
      if (this.isFieldName(rawExpression.tokens, token)) continue
      if (['true', 'false', 'null'].includes(token.lexeme)) continue
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
