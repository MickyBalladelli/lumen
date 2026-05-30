import { TokenType } from '../lexer/TokenType.js'
import { AstNodeRegistry } from '../ast/AstNodeRegistry.js'
import {
  BlockStatementNode,
  ExpressionStatementNode,
  ForStatementNode,
  FunctionDeclarationNode,
  IdentifierNode,
  ProgramNode,
  RawExpressionNode,
  ReturnStatementNode,
  StructDeclarationNode,
  StructFieldNode,
  TypeAnnotationNode,
  VariableDeclarationNode,
  VariableDeclaratorNode
} from '../ast/nodes.js'

export class Parser {
  constructor(tokens, {
    nodeRegistry = AstNodeRegistry.withDefaults()
  } = {}) {
    this.tokens = tokens
    this.current = 0
    this.nodeRegistry = nodeRegistry
  }

  parseProgram() {
    // Top-level parse loop stays tiny by design.
    // New declarations can plug into declaration() without touching lexer code.
    const body = []

    while (!this.isAtEnd()) {
      this.skipTerminators()
      if (this.isAtEnd()) break
      body.push(this.declaration())
    }

    return new ProgramNode(body, body[0]?.location ?? null)
  }

  declaration() {
    // This is the main extension point for future syntax families:
    // imports, structs, traits, modules, extern blocks, etc.
    if (this.matchKeyword('struct')) return this.structDeclaration()
    if (this.matchKeyword('function')) return this.functionDeclaration()
    if (this.checkKeyword('let') || this.checkKeyword('const')) return this.variableDeclaration()
    return this.statement()
  }

  structDeclaration() {
    const keyword = this.previous()
    const name = this.identifier()
    const fields = []

    this.consumePunctuation('{', 'Expected "{" after struct name')

    while (!this.isAtEnd() && !this.checkPunctuation('}')) {
      this.skipTerminators()
      if (this.checkPunctuation('}')) break

      const field = this.identifier()
      this.consumeOperator(':', 'Expected ":" after struct field name')
      fields.push(new StructFieldNode(field.name, this.typeAnnotation(), field.location))
      this.consumeOptionalFieldTerminator()
    }

    this.consumePunctuation('}', 'Expected "}" after struct fields')
    this.consumeOptionalTopLevelTerminator()
    return new StructDeclarationNode(name, fields, keyword.location)
  }

  functionDeclaration() {
    const keyword = this.previous()
    const name = this.identifier()

    this.consumePunctuation('(', 'Expected "(" after function name')
    const params = this.parameterList()
    this.consumePunctuation(')', 'Expected ")" after function parameters')

    const returnType = this.matchOperator(':')
      ? this.typeAnnotation()
      : null

    const body = this.blockStatement()
    return new FunctionDeclarationNode(name, params, body, keyword.location, returnType)
  }

  parameterList() {
    const params = []
    if (this.checkPunctuation(')')) return params

    do {
      const param = this.identifier()
      if (this.matchOperator(':')) {
        param.typeAnnotation = this.typeAnnotation()
      }
      params.push(param)
    } while (this.matchPunctuation(','))

    return params
  }

  variableDeclaration({ requireTerminator = true } = {}) {
    const keyword = this.advance()
    const declarations = []

    do {
      const id = this.identifier()
      const typeAnnotation = this.matchOperator(':')
        ? this.typeAnnotation()
        : null
      let initializer = null

      if (this.matchOperator('=')) {
        initializer = this.rawExpressionUntil([',', ';', ')'])
      }

      declarations.push(new VariableDeclaratorNode(id, initializer, id.location, typeAnnotation))
    } while (this.matchPunctuation(','))

    if (requireTerminator) this.consumeOptionalTerminator()

    return new VariableDeclarationNode(keyword.lexeme, declarations, keyword.location)
  }

  statement() {
    // Statements stay separate from declarations so block grammar can evolve
    // without turning the parser into one giant switch.
    if (this.matchKeyword('for')) return this.forStatement()
    if (this.matchKeyword('return')) return this.returnStatement()
    if (this.checkPunctuation('{')) return this.blockStatement()
    return this.expressionStatement()
  }

  forStatement() {
    const keyword = this.previous()
    this.consumePunctuation('(', 'Expected "(" after for')

    // Classic for loops are the one place Lumen demands explicit semicolons.
    const init = this.checkSemicolon()
      ? null
      : this.checkKeyword('let') || this.checkKeyword('const')
        ? this.variableDeclaration({ requireTerminator: false })
        : this.rawExpressionUntil([';'])

    this.consumeSemicolon('Expected ";" after for initializer')

    const test = this.checkSemicolon()
      ? null
      : this.rawExpressionUntil([';'])

    this.consumeSemicolon('Expected ";" after for condition')

    const update = this.checkPunctuation(')')
      ? null
      : this.rawExpressionUntil([')'])

    this.consumePunctuation(')', 'Expected ")" after for clauses')
    const body = this.statement()

    return new ForStatementNode(init, test, update, body, keyword.location)
  }

  returnStatement() {
    const keyword = this.previous()
    const argument = this.checkTerminator()
      ? null
      : this.rawExpressionUntil([';'])

    this.consumeOptionalTerminator()
    return new ReturnStatementNode(argument, keyword.location)
  }

  blockStatement() {
    const open = this.consumePunctuation('{', 'Expected "{" to start block')
    const body = []

    while (!this.isAtEnd() && !this.checkPunctuation('}')) {
      this.skipTerminators()
      if (!this.checkPunctuation('}')) body.push(this.declaration())
    }

    this.consumePunctuation('}', 'Expected "}" after block')
    return new BlockStatementNode(body, open.location)
  }

  expressionStatement() {
    const expression = this.rawExpressionUntil([';'])
    this.consumeOptionalTerminator()
    return new ExpressionStatementNode(expression, expression.location)
  }

  rawExpressionUntil(delimiters) {
    // Expression parsing is intentionally shallow for the foundation.
    // Later, replace this with a Pratt or precedence parser while keeping
    // statement/declaration parsing stable.
    const tokens = []
    let depth = 0

    while (!this.isAtEnd()) {
      const token = this.peek()

      if (depth === 0 && this.isDelimiter(token, delimiters)) break

      if (token.is(TokenType.Punctuation, '(') || token.is(TokenType.Punctuation, '[') || token.is(TokenType.Punctuation, '{')) depth += 1
      if (token.is(TokenType.Punctuation, ')') || token.is(TokenType.Punctuation, ']') || token.is(TokenType.Punctuation, '}')) depth -= 1

      tokens.push(this.advance())
    }

    return new RawExpressionNode(tokens, tokens[0]?.location ?? this.peek().location)
  }

  identifier() {
    const token = this.consume(TokenType.Identifier, 'Expected identifier')
    return new IdentifierNode(token.lexeme, token.location)
  }

  typeAnnotation() {
    const token = this.consume(TokenType.Identifier, 'Expected type name')
    let name = token.lexeme

    if (this.matchPunctuation('[')) {
      this.consumePunctuation(']', 'Expected "]" after array type')
      name = `${name}[]`
    }

    return new TypeAnnotationNode(name, token.location)
  }

  consumeOptionalTerminator() {
    if (this.match(TokenType.Semicolon)) {
      this.skipTerminators()
      return
    }

    if (this.check(TokenType.EndOfFile) || this.checkPunctuation('}')) return

    throw this.error(this.peek(), 'Expected statement terminator')
  }

  skipTerminators() {
    while (this.match(TokenType.Semicolon)) {}
  }

  consumeSemicolon(message) {
    return this.consume(TokenType.Semicolon, message)
  }

  consumeOperator(lexeme, message) {
    if (this.check(TokenType.Operator, lexeme)) return this.advance()
    throw this.error(this.peek(), message)
  }

  consumePunctuation(lexeme, message) {
    if (this.checkPunctuation(lexeme)) return this.advance()
    throw this.error(this.peek(), message)
  }

  consumeOptionalFieldTerminator() {
    if (this.match(TokenType.Semicolon)) return
    if (this.matchPunctuation(',')) return
    if (this.checkPunctuation('}')) return
  }

  consumeOptionalTopLevelTerminator() {
    if (this.match(TokenType.Semicolon)) this.skipTerminators()
  }

  consume(type, message) {
    if (this.check(type)) return this.advance()
    throw this.error(this.peek(), message)
  }

  matchKeyword(lexeme) {
    if (!this.checkKeyword(lexeme)) return false
    this.advance()
    return true
  }

  matchOperator(lexeme) {
    if (!this.check(TokenType.Operator, lexeme)) return false
    this.advance()
    return true
  }

  matchPunctuation(lexeme) {
    if (!this.checkPunctuation(lexeme)) return false
    this.advance()
    return true
  }

  match(type, lexeme = null) {
    if (!this.check(type, lexeme)) return false
    this.advance()
    return true
  }

  checkKeyword(lexeme) {
    return this.check(TokenType.Keyword, lexeme)
  }

  checkPunctuation(lexeme) {
    return this.check(TokenType.Punctuation, lexeme)
  }

  checkSemicolon() {
    return this.check(TokenType.Semicolon)
  }

  checkTerminator() {
    return this.check(TokenType.Semicolon) ||
      this.check(TokenType.EndOfFile) ||
      this.checkPunctuation('}')
  }

  check(type, lexeme = null) {
    if (this.isAtEnd()) return type === TokenType.EndOfFile
    return this.peek().is(type, lexeme)
  }

  isDelimiter(token, delimiters) {
    if (token.type === TokenType.Semicolon && delimiters.includes(';')) return true
    return delimiters.includes(token.lexeme)
  }

  advance() {
    if (!this.isAtEnd()) this.current += 1
    return this.previous()
  }

  isAtEnd() {
    return this.peek().type === TokenType.EndOfFile
  }

  peek() {
    return this.tokens[this.current]
  }

  previous() {
    return this.tokens[this.current - 1]
  }

  error(token, message) {
    const location = token.location ?? { line: 0, column: 0 }
    return new SyntaxError(`${message} at ${location.line}:${location.column}`)
  }
}
