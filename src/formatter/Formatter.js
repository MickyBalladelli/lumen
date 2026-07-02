import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { TokenType } from '../lexer/TokenType.js'
import { Tokenizer } from '../lexer/Tokenizer.js'
import { Parser } from '../parser/Parser.js'

const OPENING = new Set(['(', '[', '{'])
const CLOSING = new Map([
  [')', '('],
  [']', '['],
  ['}', '{']
])
const COMPACT_AFTER_BRACE = new Set(['else', 'catch', 'until'])
const CONTROL_PAREN_KEYWORDS = new Set(['for', 'while', 'switch', 'catch'])
const NO_SPACE_BEFORE = new Set([')', ']', ',', ';', '.', ':', '?'])
const NO_SPACE_AFTER = new Set(['(', '[', '.'])
const POSTFIX = new Set(['++', '--'])
const PREFIX = new Set(['!', '+', '-'])

export function formatSource(source, { indent = '  ' } = {}) {
  try {
    const syntaxTokens = new Tokenizer(source).tokenize()
    new Parser(syntaxTokens).parseProgram()

    const tokens = new Tokenizer(source, { includeTrivia: true })
      .tokenize()
      .filter(token => token.type !== TokenType.EndOfFile)
    const syntax = inspectSyntax(tokens)
    if (!syntax) return source

    const formatted = new TokenFormatter(tokens, syntax, indent).format()
    const formattedTokens = new Tokenizer(formatted).tokenize()
    new Parser(formattedTokens).parseProgram()
    return formatted
  } catch (error) {
    if (error instanceof Diagnostic) return source
    throw error
  }
}

class TokenFormatter {
  constructor(tokens, syntax, indent) {
    this.tokens = tokens
    this.syntax = syntax
    this.indent = indent
    this.writer = new FormatWriter(indent)
    this.contexts = []
    this.previous = null
    this.afterComment = false
  }

  format() {
    for (let index = 0; index < this.tokens.length; index += 1) {
      const token = this.tokens[index]

      if (token.type === TokenType.Newline) {
        index = this.emitNewlines(index)
        continue
      }
      if (token.type === TokenType.Comment) {
        this.emitComment(token)
        continue
      }

      if (CLOSING.has(token.lexeme)) this.contexts.pop()

      this.writer.write(token.lexeme, {
        level: this.indentLevel(),
        space: this.afterComment || needsSpace(this.previous, token, this.syntax)
      })
      this.afterComment = false

      if (OPENING.has(token.lexeme)) {
        this.contexts.push({
          lexeme: token.lexeme,
          multiline: this.syntax.multiline.has(index)
        })
      }

      this.previous = token
    }

    return this.writer.finish()
  }

  emitNewlines(start) {
    let end = start
    while (this.tokens[end + 1]?.type === TokenType.Newline) end += 1

    const next = nextNonNewlineToken(this.tokens, end + 1)
    if (this.previous?.lexeme === '}' && COMPACT_AFTER_BRACE.has(next?.lexeme)) {
      return end
    }

    this.writer.newline({
      blank: end > start,
      level: this.indentLevel()
    })
    this.afterComment = false
    return end
  }

  emitComment(token) {
    const inline = this.writer.hasContent()
    this.writer.write(token.lexeme, {
      level: this.indentLevel(),
      space: inline
    })

    if (token.lexeme.startsWith('//')) {
      this.writer.newline({ level: this.indentLevel() })
      this.afterComment = false
    } else {
      this.afterComment = true
    }
  }

  indentLevel() {
    return this.contexts.filter(context => context.multiline).length
  }
}

class FormatWriter {
  constructor(indent) {
    this.indent = indent
    this.lines = []
    this.current = ''
  }

  hasContent() {
    return this.current.length > 0
  }

  write(value, { level, space }) {
    if (!this.current) this.current = this.indent.repeat(level)
    if (space && this.current && !this.current.endsWith(' ')) this.current += ' '
    this.current += value
  }

  newline({ blank = false } = {}) {
    const line = this.current.trimEnd()
    if (line) this.lines.push(line)
    this.current = ''

    if (blank && this.lines.length > 0 && this.lines.at(-1) !== '') {
      this.lines.push('')
    }
  }

  finish() {
    this.newline()
    while (this.lines.at(-1) === '') this.lines.pop()
    return `${this.lines.join('\n')}\n`
  }
}

function inspectSyntax(tokens) {
  const stack = []
  const multiline = new Set()

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.type === TokenType.Newline || token.lexeme.includes('\n')) {
      for (const context of stack) multiline.add(context.index)
    }
    if (OPENING.has(token.lexeme)) {
      stack.push({ lexeme: token.lexeme, index })
      continue
    }
    if (!CLOSING.has(token.lexeme)) continue
    if (stack.at(-1)?.lexeme !== CLOSING.get(token.lexeme)) return null
    stack.pop()
  }

  if (stack.length > 0) return null

  return {
    genericAngles: genericAngles(tokens),
    multiline,
    unary: unaryOperators(tokens)
  }
}

function genericAngles(tokens) {
  const angles = new Set()
  const code = codeTokens(tokens)
  const stack = []

  for (let index = 0; index < code.length; index += 1) {
    const item = code[index]
    if (item.token.lexeme === '<') {
      const previous = code[index - 1]?.token
      const beforePrevious = code[index - 2]?.token
      if (isWord(previous) &&
        (beforePrevious?.lexeme === ':' || stack.length > 0)) {
        stack.push(item.index)
        angles.add(item.index)
      }
      continue
    }
    if (item.token.lexeme === '>' && stack.length > 0) {
      stack.pop()
      angles.add(item.index)
    }
  }

  return angles
}

function unaryOperators(tokens) {
  const unary = new Set()
  const code = codeTokens(tokens)

  for (let index = 0; index < code.length; index += 1) {
    const item = code[index]
    if (!PREFIX.has(item.token.lexeme)) continue
    const previous = code[index - 1]?.token
    if (!previous ||
      previous.type === TokenType.Operator ||
      ['(', '[', '{', ',', ';', ':'].includes(previous.lexeme) ||
      ['return', 'throw', 'await'].includes(previous.lexeme)) {
      unary.add(item.index)
    }
  }

  return unary
}

function needsSpace(previous, current, syntax) {
  if (!previous) return false

  if (syntax.genericAngles.has(current.formatIndex) ||
    (syntax.genericAngles.has(previous.formatIndex) && previous.lexeme === '<')) {
    return false
  }
  if (NO_SPACE_BEFORE.has(current.lexeme)) return false
  if (NO_SPACE_AFTER.has(previous.lexeme)) return false
  if (POSTFIX.has(current.lexeme)) return false
  if (syntax.unary.has(previous.formatIndex)) return false

  if (current.lexeme === '(') {
    if (previous.type === TokenType.Operator ||
      previous.lexeme === ',' ||
      previous.lexeme === 'return') {
      return true
    }
    return previous.type === TokenType.Keyword &&
      CONTROL_PAREN_KEYWORDS.has(previous.lexeme)
  }
  if (current.lexeme === '[') {
    return previous.type === TokenType.Operator ||
      previous.lexeme === ',' ||
      previous.lexeme === ':' ||
      previous.lexeme === 'return'
  }
  if (current.lexeme === '{') return true
  if (previous.lexeme === '{') return current.lexeme !== '}'
  if (current.lexeme === '}') return previous.lexeme !== '{'
  if (previous.lexeme === '}' && COMPACT_AFTER_BRACE.has(current.lexeme)) return true
  if (CLOSING.has(previous.lexeme) && isWord(current)) return true
  if (previous.lexeme === ',' || previous.lexeme === ';' || previous.lexeme === ':') return true
  if (previous.lexeme === '?') return false
  if (current.type === TokenType.Operator || previous.type === TokenType.Operator) return true
  return isWord(previous) && isWord(current)
}

function codeTokens(tokens) {
  return tokens.flatMap((token, index) => {
    token.formatIndex = index
    return token.type === TokenType.Newline || token.type === TokenType.Comment
      ? []
      : [{ token, index }]
  })
}

function nextNonNewlineToken(tokens, start) {
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].type !== TokenType.Newline) return tokens[index]
  }
  return null
}

function isWord(token) {
  return token && [
    TokenType.Identifier,
    TokenType.Keyword,
    TokenType.Number,
    TokenType.String
  ].includes(token.type)
}
