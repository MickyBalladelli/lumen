import { TokenType } from '../lexer/TokenType.js'

const PRECEDENCE = new Map([
  ['==', 1],
  ['!=', 1],
  ['<', 2],
  ['<=', 2],
  ['>', 2],
  ['>=', 2],
  ['+', 3],
  ['-', 3],
  ['*', 4],
  ['/', 4],
  ['%', 4]
])

export class ExpressionParser {
  parse(tokens) {
    this.tokens = tokens
    this.current = 0
    if (tokens.length === 0) return null
    return this.expression(0)
  }

  expression(minPrecedence) {
    let left = this.primary()

    while (!this.isAtEnd()) {
      const token = this.peek()
      const precedence = PRECEDENCE.get(token.lexeme)
      if (!precedence || precedence < minPrecedence) break

      this.advance()
      const right = this.expression(precedence + 1)
      left = {
        kind: 'BinaryExpression',
        operator: token.lexeme,
        left,
        right,
        location: token.location
      }
    }

    return left
  }

  primary() {
    const token = this.advance()

    if (token.type === TokenType.Identifier && this.peek()?.lexeme === '(') {
      this.advance()
      const args = []
      while (!this.isAtEnd() && this.peek().lexeme !== ')') {
        args.push(this.expression(0))
        if (this.peek()?.lexeme !== ',') break
        this.advance()
      }
      if (this.peek()?.lexeme === ')') this.advance()
      return {
        kind: 'CallExpression',
        callee: token.lexeme,
        arguments: args,
        location: token.location
      }
    }

    if (token.lexeme === '(') {
      const value = this.expression(0)
      if (this.peek()?.lexeme === ')') this.advance()
      return value
    }

    return {
      kind: 'LiteralExpression',
      token,
      location: token.location
    }
  }

  advance() {
    if (!this.isAtEnd()) this.current += 1
    return this.tokens[this.current - 1]
  }

  peek() {
    return this.tokens[this.current]
  }

  isAtEnd() {
    return this.current >= this.tokens.length
  }
}
