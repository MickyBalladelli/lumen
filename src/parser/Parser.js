import { TokenType } from '../lexer/TokenType.js'
import { AstNodeRegistry } from '../ast/AstNodeRegistry.js'
import { ExpressionParser } from './ExpressionParser.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import {
  BlockStatementNode,
  BreakStatementNode,
  ContinueStatementNode,
  DeferStatementNode,
  DoUntilStatementNode,
  EnumDeclarationNode,
  ExternFunctionDeclarationNode,
  ExpressionStatementNode,
  ForOfStatementNode,
  ForRangeStatementNode,
  ForStatementNode,
  FunctionDeclarationNode,
  IdentifierNode,
  IfStatementNode,
  ImportDeclarationNode,
  ProgramNode,
  RawExpressionNode,
  ReturnStatementNode,
  StructDeclarationNode,
  StructFieldNode,
  SwitchCaseNode,
  SwitchStatementNode,
  ThrowStatementNode,
  TryCatchStatementNode,
  TypeAnnotationNode,
  VariableDeclarationNode,
  VariableDeclaratorNode,
  WhileStatementNode
} from '../ast/nodes.js'

export class Parser {
  constructor(tokens, {
    nodeRegistry = AstNodeRegistry.withDefaults(),
    expressionParser = new ExpressionParser()
  } = {}) {
    this.tokens = tokens
    this.current = 0
    this.nodeRegistry = nodeRegistry
    this.expressionParser = expressionParser
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
    if (this.matchKeyword('import')) return this.importDeclaration()
    if (this.matchKeyword('extern')) return this.externFunctionDeclaration()
    if (this.matchKeyword('enum')) return this.enumDeclaration()
    if (this.matchKeyword('struct')) return this.structDeclaration()
    if (this.matchKeyword('async')) return this.asyncFunctionDeclaration()
    if (this.matchKeyword('function')) return this.functionDeclaration()
    if (this.checkKeyword('let') || this.checkKeyword('const')) return this.variableDeclaration()
    return this.statement()
  }

  importDeclaration() {
    const keyword = this.previous()
    const names = []

    this.consumePunctuation('{', 'Expected "{" after import')
    do {
      names.push(this.identifier())
    } while (this.matchPunctuation(','))
    this.consumePunctuation('}', 'Expected "}" after import names')
    this.consumeKeyword('from', 'Expected from after import names')
    const source = this.consume(TokenType.String, 'Expected module string')
    this.consumeOptionalTopLevelTerminator()

    return new ImportDeclarationNode(names, source.literal, keyword.location)
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

  enumDeclaration() {
    const keyword = this.previous()
    const name = this.identifier()
    const variants = []

    this.consumePunctuation('{', 'Expected "{" after enum name')
    while (!this.isAtEnd() && !this.checkPunctuation('}')) {
      this.skipTerminators()
      if (this.checkPunctuation('}')) break
      variants.push(this.identifier())
      this.consumeOptionalFieldTerminator()
    }

    this.consumePunctuation('}', 'Expected "}" after enum variants')
    this.consumeOptionalTopLevelTerminator()
    return new EnumDeclarationNode(name, variants, keyword.location)
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

  externFunctionDeclaration() {
    const keyword = this.previous()
    this.consumeKeyword('function', 'Expected function after extern')
    const name = this.identifier()

    this.consumePunctuation('(', 'Expected "(" after function name')
    const params = this.parameterList()
    this.consumePunctuation(')', 'Expected ")" after function parameters')

    const returnType = this.matchOperator(':')
      ? this.typeAnnotation()
      : null

    this.consumeOptionalTopLevelTerminator()
    return new ExternFunctionDeclarationNode(name, params, keyword.location, returnType)
  }

  asyncFunctionDeclaration() {
    const keyword = this.previous()
    this.consumeKeyword('function', 'Expected function after async')
    const declaration = this.functionDeclaration()
    declaration.isAsync = true
    declaration.location = keyword.location
    return declaration
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
    if (this.matchKeyword('if')) return this.ifStatement()
    if (this.matchKeyword('switch')) return this.switchStatement()
    if (this.matchKeyword('defer')) return this.deferStatement()
    if (this.matchKeyword('break')) return this.breakStatement()
    if (this.matchKeyword('continue')) return this.continueStatement()
    if (this.matchKeyword('while')) return this.whileStatement()
    if (this.matchKeyword('do')) return this.doUntilStatement()
    if (this.matchKeyword('try')) return this.tryCatchStatement()
    if (this.matchKeyword('throw')) return this.throwStatement()
    if (this.matchKeyword('return')) return this.returnStatement()
    if (this.checkPunctuation('{')) return this.blockStatement()
    return this.expressionStatement()
  }

  tryCatchStatement() {
    const keyword = this.previous()
    const tryBlock = this.blockStatement()

    this.consumeKeyword('catch', 'Expected catch after try block')
    const catchParam = this.identifier()
    const catchBlock = this.blockStatement()

    return new TryCatchStatementNode(tryBlock, catchParam, catchBlock, keyword.location)
  }

  throwStatement() {
    const keyword = this.previous()
    const argument = this.rawExpressionUntil([';'])

    this.consumeOptionalTerminator()
    return new ThrowStatementNode(argument, keyword.location)
  }

  forStatement() {
    const keyword = this.previous()
    if (this.peek()?.type === TokenType.Identifier && this.peekNextToken()?.is(TokenType.Keyword, 'in')) {
      const item = this.identifier()
      this.consumeKeyword('in', 'Expected in after range loop variable')
      const range = this.rawExpressionUntil(['{'], { parse: false })
      const dots = range.tokens.findIndex((token, index) => token.lexeme === '.' && range.tokens[index + 1]?.lexeme === '.')
      if (dots < 0) throw this.error(range.tokens[0] ?? this.peek(), 'Expected ".." in range loop')

      const start = new RawExpressionNode(range.tokens.slice(0, dots), range.tokens[0]?.location ?? range.location)
      start.parsed = this.expressionParser.parse(start.tokens)
      const end = new RawExpressionNode(range.tokens.slice(dots + 2), range.tokens[dots + 2]?.location ?? range.location)
      end.parsed = this.expressionParser.parse(end.tokens)
      const body = this.statement()
      return new ForRangeStatementNode(item, start, end, body, keyword.location)
    }

    this.consumePunctuation('(', 'Expected "(" after for')

    if (this.checkKeyword('let') &&
      this.peekNextToken()?.type === TokenType.Identifier &&
      this.peekToken(2)?.is(TokenType.Keyword, 'of')) {
      this.advance()
      const item = this.identifier()
      this.consumeKeyword('of', 'Expected "of" in for-of loop')
      const iterable = this.rawExpressionUntil([')'])
      this.consumePunctuation(')', 'Expected ")" after for-of iterable')
      const body = this.statement()

      return new ForOfStatementNode(item, iterable, body, keyword.location)
    }

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

  whileStatement() {
    const keyword = this.previous()
    const test = this.rawExpressionUntil(['do', '{'])

    this.matchKeyword('do')
    const body = this.statement()

    return new WhileStatementNode(test, body, keyword.location)
  }

  doUntilStatement() {
    const keyword = this.previous()
    const body = this.blockStatement()

    this.skipTerminators()
    this.consumeKeyword('until', 'Expected until after do body')
    const test = this.rawExpressionUntil([';'])

    this.consumeOptionalTerminator()
    return new DoUntilStatementNode(body, test, keyword.location)
  }

  ifStatement() {
    const keyword = this.previous()
    const test = this.rawExpressionUntil(['do', '{'])

    this.matchKeyword('do')
    const consequent = this.statement()
    this.skipTerminators()
    const alternate = this.matchKeyword('else')
      ? this.statement()
      : null

    return new IfStatementNode(test, consequent, alternate, keyword.location)
  }

  switchStatement() {
    const keyword = this.previous()
    const discriminant = this.rawExpressionUntil(['{'])
    const cases = []
    let defaultCase = null

    this.consumePunctuation('{', 'Expected "{" after switch value')

    while (!this.isAtEnd() && !this.checkPunctuation('}')) {
      this.skipTerminators()
      if (this.checkPunctuation('}')) break

      if (this.matchKeyword('case')) {
        const caseToken = this.previous()
        const test = this.rawExpressionUntil(['{'])
        const body = this.blockStatement()
        cases.push(new SwitchCaseNode(test, body, caseToken.location))
        continue
      }

      if (this.matchKeyword('default')) {
        const defaultToken = this.previous()
        defaultCase = this.blockStatement()
        defaultCase.location = defaultToken.location
        continue
      }

      throw this.error(this.peek(), 'Expected case or default in switch')
    }

    this.consumePunctuation('}', 'Expected "}" after switch')
    return new SwitchStatementNode(discriminant, cases, defaultCase, keyword.location)
  }

  breakStatement() {
    const keyword = this.previous()
    this.consumeOptionalTerminator()
    return new BreakStatementNode(keyword.location)
  }

  continueStatement() {
    const keyword = this.previous()
    this.consumeOptionalTerminator()
    return new ContinueStatementNode(keyword.location)
  }

  deferStatement() {
    const keyword = this.previous()
    const expression = this.rawExpressionUntil([';'])
    this.consumeOptionalTerminator()
    return new DeferStatementNode(expression, keyword.location)
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

  rawExpressionUntil(delimiters, { parse = true } = {}) {
    const tokens = []
    let depth = 0

    while (!this.isAtEnd()) {
      const token = this.peek()

      if (depth === 0 && this.isDelimiter(token, delimiters)) break

      if (token.is(TokenType.Punctuation, '(') || token.is(TokenType.Punctuation, '[') || token.is(TokenType.Punctuation, '{')) depth += 1
      if (token.is(TokenType.Punctuation, ')') || token.is(TokenType.Punctuation, ']') || token.is(TokenType.Punctuation, '}')) depth -= 1

      tokens.push(this.advance())
    }

    const expression = new RawExpressionNode(tokens, tokens[0]?.location ?? this.peek().location)
    if (parse) expression.parsed = this.expressionParser.parse(tokens)
    return expression
  }

  identifier() {
    const token = this.consume(TokenType.Identifier, 'Expected identifier')
    return new IdentifierNode(token.lexeme, token.location)
  }

  typeAnnotation() {
    const token = this.consume(TokenType.Identifier, 'Expected type name')
    let name = token.lexeme

    if (this.matchOperator('<')) {
      const args = []
      do {
        args.push(this.typeAnnotation().name)
      } while (this.matchPunctuation(','))
      this.consumeOperator('>', 'Expected ">" after generic type arguments')
      name = `${name}<${args.join(',')}>`
    }

    if (this.matchPunctuation('[')) {
      this.consumePunctuation(']', 'Expected "]" after array type')
      name = `${name}[]`
    }

    if (this.matchOperator('?')) {
      name = `${name}?`
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

  consumeKeyword(lexeme, message) {
    if (this.checkKeyword(lexeme)) return this.advance()
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

  peekNextToken() {
    return this.peekToken(1)
  }

  peekToken(offset) {
    return this.tokens[this.current + offset]
  }

  previous() {
    return this.tokens[this.current - 1]
  }

  error(token, message) {
    const location = token.location ?? { line: 0, column: 0 }
    return new Diagnostic(message, location, 'parser')
  }
}
