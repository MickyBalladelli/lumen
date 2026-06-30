import { Token } from './Token.js'
import { TokenType } from './TokenType.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'

const KEYWORDS = new Set([
  'function',
  'let',
  'const',
  'struct',
  'enum',
  'extern',
  'for',
  'of',
  'in',
  'import',
  'from',
  'match',
  'if',
  'else',
  'switch',
  'case',
  'default',
  'defer',
  'break',
  'continue',
  'while',
  'do',
  'until',
  'try',
  'catch',
  'throw',
  'async',
  'await',
  'return',
  'true',
  'false',
  'null'
])

const CONTINUATION_TOKENS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '==',
  '===',
  '!=',
  '!==',
  '<',
  '<=',
  '>',
  '>=',
  '&&',
  '||',
  '.',
  ',',
  '?',
  ':'
])

const ENDING_PUNCTUATION = new Set([')', ']', '}'])

export class Tokenizer {
  constructor(source, { keywords = KEYWORDS, sourcePath = null } = {}) {
    this.source = source
    this.keywords = keywords
    this.sourcePath = sourcePath
    this.tokens = []
    this.start = 0
    this.current = 0
    this.line = 1
    this.column = 1
    this.tokenLine = 1
    this.tokenColumn = 1
    this.parenDepth = 0
    this.bracketDepth = 0
    this.braceDepth = 0
  }

  tokenize() {
    while (!this.isAtEnd()) {
      this.start = this.current
      this.tokenLine = this.line
      this.tokenColumn = this.column
      this.scanToken()
    }

    this.tokens.push(new Token(TokenType.EndOfFile, '', null, this.location()))
    return this.tokens
  }

  scanToken() {
    const char = this.advance()

    if (char === ' ' || char === '\r' || char === '\t') return
    if (char === '\n') return this.handleNewline()

    if (this.isAlpha(char)) return this.identifier()
    if (this.isDigit(char)) return this.number()

    switch (char) {
      case '"':
      case "'":
        return this.string(char)
      case ';':
        // Real semicolons are always kept.
        // This is what lets classic for loops use required semicolon separators.
        return this.addToken(TokenType.Semicolon)
      case '(':
        this.parenDepth += 1
        return this.addToken(TokenType.Punctuation)
      case ')':
        this.parenDepth -= 1
        return this.addToken(TokenType.Punctuation)
      case '[':
        this.bracketDepth += 1
        return this.addToken(TokenType.Punctuation)
      case ']':
        this.bracketDepth -= 1
        return this.addToken(TokenType.Punctuation)
      case '{':
        this.braceDepth += 1
        return this.addToken(TokenType.Punctuation)
      case '}':
        this.braceDepth -= 1
        return this.addToken(TokenType.Punctuation)
      case '/':
        if (this.match('/')) return this.lineComment()
        if (this.match('*')) return this.blockComment()
        return this.addToken(TokenType.Operator)
      default:
        return this.operatorOrPunctuation(char)
    }
  }

  handleNewline() {
    // Newlines become statement terminators only when the current expression
    // looks complete. Inside parentheses/brackets, newlines are plain whitespace,
    // so "for (...; ...; ...)" keeps relying on real semicolons.
    if (this.parenDepth > 0 || this.bracketDepth > 0) return

    const previous = this.previousSignificantToken()
    if (!previous || !this.canEndStatement(previous)) return
    if (this.nextStartsContinuation()) return

    this.addToken(TokenType.Semicolon, '\n')
  }

  identifier() {
    while (this.isAlphaNumeric(this.peek())) this.advance()

    const text = this.source.slice(this.start, this.current)
    const type = this.keywords.has(text) ? TokenType.Keyword : TokenType.Identifier
    this.addToken(type)
  }

  number() {
    while (this.isDigit(this.peek())) this.advance()

    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.advance()
      while (this.isDigit(this.peek())) this.advance()
    }

    const text = this.source.slice(this.start, this.current)
    this.addToken(TokenType.Number, null, Number(text))
  }

  string(quote) {
    while (!this.isAtEnd() && this.peek() !== quote) {
      this.advance()
    }

    if (this.isAtEnd()) {
      throw this.error('Unterminated string literal')
    }

    this.advance()
    const value = this.source.slice(this.start + 1, this.current - 1)
    this.addToken(TokenType.String, null, value)
  }

  lineComment() {
    while (!this.isAtEnd() && this.peek() !== '\n') this.advance()
  }

  blockComment() {
    while (!this.isAtEnd()) {
      if (this.peek() === '*' && this.peekNext() === '/') {
        this.advance()
        this.advance()
        return
      }
      this.advance()
    }

    throw this.error('Unterminated block comment')
  }

  operatorOrPunctuation(char) {
    const two = char + this.peek()
    const three = two + this.peekNext()

    if (['===', '!=='].includes(three)) {
      this.advance()
      this.advance()
      return this.addToken(TokenType.Operator)
    }

    if (['==', '!=', '<=', '>=', '&&', '||', '++', '--', '=>'].includes(two)) {
      this.advance()
      return this.addToken(TokenType.Operator)
    }

    if ('+-*%=!<>.&|?:'.includes(char)) return this.addToken(TokenType.Operator)
    if (',.'.includes(char)) return this.addToken(TokenType.Punctuation)

    throw this.error(`Unexpected character "${char}"`)
  }

  canEndStatement(token) {
    if ([
      TokenType.Identifier,
      TokenType.Number,
      TokenType.String
    ].includes(token.type)) return true

    if (token.type === TokenType.Keyword) {
      return ['true', 'false', 'null', 'return'].includes(token.lexeme)
    }

    if (token.type === TokenType.Operator) {
      return ['++', '--'].includes(token.lexeme)
    }

    return token.type === TokenType.Punctuation && ENDING_PUNCTUATION.has(token.lexeme)
  }

  nextStartsContinuation() {
    let index = this.current

    while (index < this.source.length) {
      const char = this.source[index]
      if (char === ' ' || char === '\t' || char === '\r') {
        index += 1
        continue
      }

      if (char === '\n') return false

      const next = this.source[index + 1] ?? ''
      const two = char + next
      return CONTINUATION_TOKENS.has(two) || CONTINUATION_TOKENS.has(char)
    }

    return false
  }

  previousSignificantToken() {
    for (let index = this.tokens.length - 1; index >= 0; index -= 1) {
      const token = this.tokens[index]
      if (token.type !== TokenType.Semicolon) return token
    }

    return null
  }

  addToken(type, lexemeOverride = null, literal = null) {
    const lexeme = lexemeOverride ?? this.source.slice(this.start, this.current)
    this.tokens.push(new Token(type, lexeme, literal, this.location()))
  }

  match(expected) {
    if (this.isAtEnd() || this.source[this.current] !== expected) return false
    this.advance()
    return true
  }

  advance() {
    const char = this.source[this.current]
    this.current += 1

    if (char === '\n') {
      this.line += 1
      this.column = 1
    } else {
      this.column += 1
    }

    return char
  }

  peek() {
    if (this.isAtEnd()) return '\0'
    return this.source[this.current]
  }

  peekNext() {
    if (this.current + 1 >= this.source.length) return '\0'
    return this.source[this.current + 1]
  }

  isAtEnd() {
    return this.current >= this.source.length
  }

  isDigit(char) {
    return char >= '0' && char <= '9'
  }

  isAlpha(char) {
    return (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      char === '_'
  }

  isAlphaNumeric(char) {
    return this.isAlpha(char) || this.isDigit(char)
  }

  location() {
    return {
      line: this.tokenLine,
      column: this.tokenColumn,
      offset: this.start,
      sourcePath: this.sourcePath
    }
  }

  error(message) {
    return new Diagnostic(message, this.location(), 'lexer')
  }
}
