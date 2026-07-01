import { TokenType } from '../lexer/TokenType.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import {
  ArrayExpressionNode,
  ArrowFunctionExpressionNode,
  AssignmentExpressionNode,
  AwaitExpressionNode,
  BinaryExpressionNode,
  CallExpressionNode,
  IdentifierExpressionNode,
  LiteralExpressionNode,
  MatchArmNode,
  MatchExpressionNode,
  MemberExpressionNode,
  SliceExpressionNode,
  StructExpressionNode,
  StructPropertyNode,
  UnaryExpressionNode,
  UpdateExpressionNode
} from '../ast/nodes.js'

const PRECEDENCE = new Map([
  ['||', 1],
  ['&&', 2],
  ['==', 3],
  ['===', 3],
  ['!=', 3],
  ['!==', 3],
  ['<', 4],
  ['<=', 4],
  ['>', 4],
  ['>=', 4],
  ['+', 5],
  ['-', 5],
  ['*', 6],
  ['/', 6],
  ['%', 6]
])

export class ExpressionParser {
  parse(tokens) {
    this.tokens = tokens
    this.current = 0
    this.structLiteralAllowed = true
    if (tokens.length === 0) return null

    const expression = this.assignment()
    if (!this.isAtEnd()) {
      throw new Diagnostic(
        `Unexpected token "${this.peek().lexeme}" in expression`,
        this.peek().location,
        'parser'
      )
    }
    return expression
  }

  assignment() {
    const start = this.current
    const left = this.arrow()
    if (!this.match('=')) return left

    const operator = this.previous()
    if (!['IdentifierExpression', 'MemberExpression'].includes(left.kind)) {
      throw new Diagnostic('Invalid assignment target', left.location, 'parser')
    }
    const right = this.assignment()
    return this.finish(
      new AssignmentExpressionNode(operator.lexeme, left, right, operator.location),
      start
    )
  }

  arrow() {
    const start = this.current
    const left = this.binary(1)
    if (!this.match('=>')) return left

    const params = left.kind === 'IdentifierExpression'
      ? [left]
      : []
    if (params.length === 0) {
      throw new Diagnostic('Arrow function needs identifier parameter', left.location, 'parser')
    }

    const body = this.assignment()
    return this.finish(
      new ArrowFunctionExpressionNode(params, body, left.location),
      start
    )
  }

  binary(minPrecedence) {
    const start = this.current
    let left = this.unary()

    while (!this.isAtEnd()) {
      const operator = this.peek()
      const precedence = PRECEDENCE.get(operator.lexeme)
      if (!precedence || precedence < minPrecedence) break

      this.advance()
      const right = this.binary(precedence + 1)
      left = this.finish(
        new BinaryExpressionNode(operator.lexeme, left, right, operator.location),
        start
      )
    }

    return left
  }

  unary() {
    const start = this.current
    if (this.match('await')) {
      const token = this.previous()
      return this.finish(
        new AwaitExpressionNode(this.unary(), token.location),
        start
      )
    }

    if (['!', '-', '+'].includes(this.peek()?.lexeme)) {
      const operator = this.advance()
      return this.finish(
        new UnaryExpressionNode(operator.lexeme, this.unary(), operator.location),
        start
      )
    }

    return this.postfix()
  }

  postfix() {
    const start = this.current
    let expression = this.primary()

    while (!this.isAtEnd()) {
      if (this.match('(')) {
        const args = []
        if (!this.check(')')) {
          do {
            args.push(this.assignment())
          } while (this.match(','))
        }
        this.consume(')', 'Expected ")" after arguments')
        expression = this.finish(
          new CallExpressionNode(expression, args, expression.location),
          start
        )
        continue
      }

      if (this.match('[')) {
        const open = this.previous()
        const propertyStart = this.current
        let property = this.assignment()
        if (this.check('.') && this.peek(1)?.lexeme === '.') {
          this.advance()
          this.advance()
          const end = this.assignment()
          property = this.finish(
            new SliceExpressionNode(property, end, open.location),
            propertyStart
          )
        }
        this.consume(']', 'Expected "]" after index')
        expression = this.finish(
          new MemberExpressionNode(expression, property, true, open.location),
          start
        )
        continue
      }

      if (this.check('.') && this.peek(1)?.type === TokenType.Identifier) {
        const dot = this.advance()
        const property = this.advance()
        expression = this.finish(
          new MemberExpressionNode(
            expression,
            new IdentifierExpressionNode(property.lexeme, property.location, [property]),
            false,
            dot.location
          ),
          start
        )
        continue
      }

      if (this.match('++') || this.match('--')) {
        const operator = this.previous()
        expression = this.finish(
          new UpdateExpressionNode(operator.lexeme, expression, false, operator.location),
          start
        )
        continue
      }

      break
    }

    return expression
  }

  primary() {
    const start = this.current
    const token = this.advance()
    if (!token) throw new Diagnostic('Expected expression', null, 'parser')

    if (token.lexeme === 'match') return this.matchExpression(start, token)

    if (token.lexeme === '(') {
      const value = this.assignment()
      this.consume(')', 'Expected ")" after expression')
      value.tokens = this.tokens.slice(start, this.current)
      return value
    }

    if (token.lexeme === '[') return this.arrayExpression(start, token)

    if (token.type === TokenType.Identifier) {
      if (this.structLiteralAllowed && this.check('{')) return this.structExpression(start, token)
      return new IdentifierExpressionNode(token.lexeme, token.location, [token])
    }

    if ([TokenType.Number, TokenType.String].includes(token.type) ||
      token.type === TokenType.Keyword && ['true', 'false', 'null'].includes(token.lexeme)) {
      return new LiteralExpressionNode(token)
    }

    throw new Diagnostic(`Expected expression, got "${token.lexeme}"`, token.location, 'parser')
  }

  arrayExpression(start, open) {
    const elements = []
    if (!this.check(']')) {
      do {
        elements.push(this.assignment())
      } while (this.match(','))
    }
    this.consume(']', 'Expected "]" after array')
    return this.finish(new ArrayExpressionNode(elements, open.location), start)
  }

  structExpression(start, nameToken) {
    this.consume('{', 'Expected "{" after struct name')
    const fields = []
    this.skipSeparators()

    while (!this.isAtEnd() && !this.check('}')) {
      const fieldStart = this.current
      const key = this.advance()
      if (key.type !== TokenType.Identifier) {
        throw new Diagnostic('Expected struct field name', key.location, 'parser')
      }
      this.consume(':', 'Expected ":" after struct field')
      const value = this.assignment()
      fields.push(this.finish(new StructPropertyNode(key.lexeme, value, key.location), fieldStart))
      if (!this.matchSeparator() && !this.check('}')) {
        throw new Diagnostic('Expected separator after struct field', this.peek()?.location, 'parser')
      }
      this.skipSeparators()
    }

    this.consume('}', 'Expected "}" after struct literal')
    return this.finish(
      new StructExpressionNode(nameToken.lexeme, fields, nameToken.location),
      start
    )
  }

  matchExpression(start, token) {
    const previousStructLiteralAllowed = this.structLiteralAllowed
    this.structLiteralAllowed = false
    const discriminant = this.assignment()
    this.structLiteralAllowed = previousStructLiteralAllowed
    this.consume('{', 'Expected "{" after match value')
    const arms = []
    this.skipSeparators()

    while (!this.isAtEnd() && !this.check('}')) {
      const armStart = this.current
      let pattern = null
      if (this.check('_')) {
        this.advance()
      } else {
        pattern = this.binary(1)
      }
      this.consume('=>', 'Expected "=>" in match arm')
      const value = this.assignment()
      arms.push(this.finish(new MatchArmNode(pattern, value, pattern?.location ?? token.location), armStart))
      if (!this.matchSeparator() && !this.check('}')) {
        throw new Diagnostic('Expected separator after match arm', this.peek()?.location, 'parser')
      }
      this.skipSeparators()
    }

    this.consume('}', 'Expected "}" after match')
    return this.finish(
      new MatchExpressionNode(discriminant, arms, token.location),
      start
    )
  }

  skipSeparators() {
    while (this.matchSeparator()) {}
  }

  matchSeparator() {
    if (this.check(',')) {
      this.advance()
      return true
    }
    if (this.peek()?.type === TokenType.Semicolon) {
      this.advance()
      return true
    }
    return false
  }

  finish(node, start) {
    node.tokens = this.tokens.slice(start, this.current)
    const first = node.tokens[0]?.location
    const last = node.tokens.at(-1)?.location
    if (first && last) {
      node.location = {
        ...first,
        endLine: last.endLine ?? last.line,
        endColumn: last.endColumn ?? last.column + 1,
        endOffset: last.endOffset ?? last.offset + 1
      }
    }
    return node
  }

  consume(lexeme, message) {
    if (this.match(lexeme)) return this.previous()
    throw new Diagnostic(message, this.peek()?.location ?? this.previous()?.location, 'parser')
  }

  match(lexeme) {
    if (!this.check(lexeme)) return false
    this.advance()
    return true
  }

  check(lexeme) {
    return this.peek()?.lexeme === lexeme
  }

  advance() {
    if (!this.isAtEnd()) this.current += 1
    return this.tokens[this.current - 1]
  }

  previous() {
    return this.tokens[this.current - 1]
  }

  peek(offset = 0) {
    return this.tokens[this.current + offset]
  }

  isAtEnd() {
    return this.current >= this.tokens.length
  }
}
