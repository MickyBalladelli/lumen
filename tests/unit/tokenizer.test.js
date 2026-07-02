import assert from 'node:assert/strict'
import test from 'node:test'
import { Tokenizer } from '../../src/lexer/Tokenizer.js'
import { TokenType } from '../../src/lexer/TokenType.js'

test('tokenizer classifies values and tracks source locations', () => {
  const tokens = new Tokenizer('let answer: i32 = 42\nreturn answer', {
    sourcePath: 'direct-tokenizer.lm'
  }).tokenize()

  assert.deepEqual(
    tokens.map(token => token.type),
    [
      TokenType.Keyword,
      TokenType.Identifier,
      TokenType.Operator,
      TokenType.Identifier,
      TokenType.Operator,
      TokenType.Number,
      TokenType.Semicolon,
      TokenType.Keyword,
      TokenType.Identifier,
      TokenType.EndOfFile
    ]
  )
  assert.equal(tokens[5].literal, 42)
  assert.deepEqual(
    {
      line: tokens[7].location.line,
      column: tokens[7].location.column,
      sourcePath: tokens[7].location.sourcePath
    },
    {
      line: 2,
      column: 1,
      sourcePath: 'direct-tokenizer.lm'
    }
  )
})

test('tokenizer exposes comments and newlines only in trivia mode', () => {
  const source = 'let value = "{still string}" // note\n/* block */ return value'
  const normal = new Tokenizer(source).tokenize()
  const trivia = new Tokenizer(source, { includeTrivia: true }).tokenize()

  assert.equal(normal.some(token => token.type === TokenType.Comment), false)
  assert.deepEqual(
    trivia
      .filter(token => [TokenType.Comment, TokenType.Newline].includes(token.type))
      .map(token => [token.type, token.lexeme]),
    [
      [TokenType.Comment, '// note'],
      [TokenType.Newline, '\n'],
      [TokenType.Comment, '/* block */']
    ]
  )
})

test('tokenizer reports malformed source directly', () => {
  assert.throws(
    () => new Tokenizer('"unfinished', { sourcePath: 'bad.lm' }).tokenize(),
    error => {
      assert.equal(error.phase, 'lexer')
      assert.equal(error.location.sourcePath, 'bad.lm')
      assert.match(error.message, /Unterminated string literal/)
      return true
    }
  )
})
