import assert from 'node:assert/strict'
import test from 'node:test'
import { Tokenizer } from '../../src/lexer/Tokenizer.js'
import { Parser } from '../../src/parser/Parser.js'

function parse(source) {
  return new Parser(new Tokenizer(source).tokenize()).parseProgram()
}

test('parser keeps empty array literal initializer', () => {
  const program = parse('let numbers: i32[] = []')
  const declaration = program.body[0].declarations[0]

  assert.equal(program.body[0].kind, 'VariableDeclaration')
  assert.equal(declaration.typeAnnotation.name, 'i32[]')
  assert.deepEqual(declaration.initializer.tokens.map(token => token.lexeme), ['[', ']'])
})

test('parser reads for-of body without compiling whole example', () => {
  const program = parse('for (let item of numbers) {\nprintln(item)\n}')
  const loop = program.body[0]

  assert.equal(loop.kind, 'ForOfStatement')
  assert.equal(loop.item.name, 'item')
  assert.deepEqual(loop.iterable.tokens.map(token => token.lexeme), ['numbers'])
  assert.equal(loop.body.kind, 'BlockStatement')
})
