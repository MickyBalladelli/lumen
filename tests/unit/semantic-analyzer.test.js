import assert from 'node:assert/strict'
import test from 'node:test'
import { Tokenizer } from '../../src/lexer/Tokenizer.js'
import { Parser } from '../../src/parser/Parser.js'
import { SemanticAnalyzer } from '../../src/semantics/SemanticAnalyzer.js'

test('semantic analyzer defines top-level symbols', () => {
  const program = parse([
    'function double(value: i32): i32 {',
    '  return value * 2',
    '}',
    'function main(): i32 {',
    '  return double(4)',
    '}'
  ].join('\n'))
  const scope = new SemanticAnalyzer().analyze(program)

  assert.equal(scope.resolve('double').kind, 'function')
  assert.equal(scope.resolve('main').kind, 'function')
})

test('semantic analyzer rejects duplicate declarations without compiler facade', () => {
  const program = parse([
    'function same(): i32 {',
    '  return 1',
    '}',
    'function same(): i32 {',
    '  return 2',
    '}'
  ].join('\n'))

  assert.throws(
    () => new SemanticAnalyzer().analyze(program),
    /Duplicate function "same"/
  )
})

function parse(source) {
  return new Parser(new Tokenizer(source).tokenize()).parseProgram()
}
