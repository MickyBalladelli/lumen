import assert from 'node:assert/strict'
import test from 'node:test'
import { Compiler } from '../../src/compiler/Compiler.js'
import { Parser } from '../../src/parser/Parser.js'
import { Tokenizer } from '../../src/lexer/Tokenizer.js'

function program(source) {
  return new Parser(new Tokenizer(source).tokenize()).parseProgram()
}

test('type checking reads expression nodes after token text changes', () => {
  const ast = program([
    'function main(): i32 {',
    '  let value: i32 = 1 + 2',
    '  return value',
    '}'
  ].join('\n'))
  const initializer = ast.body[0].body.body[0].declarations[0].initializer
  initializer.tokens.find(token => token.lexeme === '+').lexeme = '=='

  assert.doesNotThrow(() => new Compiler().compileProgram(ast))
  assert.equal(initializer.parsed.operator, '+')
})

test('code generation reads binary node operator', () => {
  const ast = program([
    'function main(): i32 {',
    '  return 4 + 3',
    '}'
  ].join('\n'))
  const expression = ast.body[0].body.body[0].argument
  expression.tokens.find(token => token.lexeme === '+').lexeme = '*'

  const { llvm } = new Compiler().compileProgram(ast)
  assert.match(llvm, /add i32 4, 3/)
  assert.doesNotMatch(llvm, /mul i32 4, 3/)
})

test('code generation dispatches calls from call nodes', () => {
  const ast = program([
    'function main(): i32 {',
    '  return min(4, 3)',
    '}'
  ].join('\n'))
  const expression = ast.body[0].body.body[0].argument
  expression.tokens[0].lexeme = 'missing'
  expression.tokens[1].lexeme = '['

  const { llvm } = new Compiler().compileProgram(ast)
  assert.match(llvm, /select i1/)
})
