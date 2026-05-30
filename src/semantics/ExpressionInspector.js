import { TokenType } from '../lexer/TokenType.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes } from './TypeSystem.js'

export class ExpressionInspector {
  constructor(scope, typeSystem) {
    this.scope = scope
    this.typeSystem = typeSystem
  }

  infer(rawExpression) {
    if (!rawExpression || rawExpression.tokens.length === 0) return LumenTypes.Void
    if (this.isCall(rawExpression, 'println')) return LumenTypes.Void

    let numericType = LumenTypes.I32

    for (const token of rawExpression.tokens) {
      if (token.type === TokenType.String) return LumenTypes.String
      if (['<', '<=', '>', '>=', '==', '!='].includes(token.lexeme)) return LumenTypes.Bool
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
      if (['true', 'false', 'null'].includes(token.lexeme)) continue
      if (!this.scope.resolve(token.lexeme)) {
        throw new Diagnostic(`Unknown symbol "${token.lexeme}"`, token.location, 'semantic')
      }
    }
  }

  isCall(rawExpression, name) {
    return rawExpression.tokens[0]?.lexeme === name &&
      rawExpression.tokens[1]?.lexeme === '(' &&
      rawExpression.tokens.at(-1)?.lexeme === ')'
  }

  isBuiltinCallName(tokens, token) {
    const index = tokens.indexOf(token)
    return token.lexeme === 'println' && tokens[index + 1]?.lexeme === '('
  }
}
