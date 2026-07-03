import assert from 'node:assert/strict'
import test from 'node:test'
import { Diagnostic } from '../../src/diagnostics/Diagnostic.js'
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
  assert.equal(declaration.initializer.parsed.kind, 'ArrayExpression')
  assert.deepEqual(declaration.initializer.tokens.map(token => token.lexeme), ['[', ']'])
})

test('parser reads for-of body without compiling whole example', () => {
  const program = parse('for (let item of numbers) {\nprintln(item)\n}')
  const loop = program.body[0]

  assert.equal(loop.kind, 'ForOfStatement')
  assert.equal(loop.item.name, 'item')
  assert.equal(loop.iterable.parsed.kind, 'IdentifierExpression')
  assert.deepEqual(loop.iterable.tokens.map(token => token.lexeme), ['numbers'])
  assert.equal(loop.body.kind, 'BlockStatement')
})

test('parser builds complete expression nodes', () => {
  const program = parse([
    'struct Point { x: i32 }',
    'function load(value: i32): i32 {',
    '  return value',
    '}',
    'function main(): i32 {',
    '  let values: i32[] = [1, 2]',
    '  let point = Point { x: 1 }',
    '  point.x = -values[0] + load(2)',
    '  let answer = await load(point.x)',
    '  let label = match answer {',
    '    1 => "one"',
    '    _ => "other"',
    '  }',
    '  return answer',
    '}'
  ].join('\n'))
  const body = program.body[2].body.body

  assert.equal(body[0].declarations[0].initializer.parsed.kind, 'ArrayExpression')
  assert.equal(body[1].declarations[0].initializer.parsed.kind, 'StructExpression')

  const assignment = body[2].expression.parsed
  assert.equal(assignment.kind, 'AssignmentExpression')
  assert.equal(assignment.left.kind, 'MemberExpression')
  assert.equal(assignment.right.kind, 'BinaryExpression')
  assert.equal(assignment.right.left.kind, 'UnaryExpression')
  assert.equal(assignment.right.left.argument.kind, 'MemberExpression')
  assert.equal(assignment.right.right.kind, 'CallExpression')

  const awaited = body[3].declarations[0].initializer.parsed
  assert.equal(awaited.kind, 'AwaitExpression')
  assert.equal(awaited.argument.kind, 'CallExpression')
  assert.equal(awaited.argument.arguments[0].kind, 'MemberExpression')

  const match = body[4].declarations[0].initializer.parsed
  assert.equal(match.kind, 'MatchExpression')
  assert.equal(match.arms.length, 2)
  assert.equal(match.arms[0].pattern.kind, 'LiteralExpression')
  assert.equal(match.arms[1].pattern, null)
})

test('parser represents arrow predicate inside call', () => {
  const program = parse([
    'for (let value of filter(values, item => item > 0)) {',
    '  println(value)',
    '}'
  ].join('\n'))
  const call = program.body[0].iterable.parsed

  assert.equal(call.kind, 'CallExpression')
  assert.equal(call.arguments[1].kind, 'ArrowFunctionExpression')
  assert.equal(call.arguments[1].params[0].name, 'item')
  assert.equal(call.arguments[1].body.kind, 'BinaryExpression')
})

test('parser reports an incomplete match without recursing forever', () => {
  assert.throws(
    () => parse('; match'),
    error => error instanceof Diagnostic && error.rawMessage === 'Expected expression'
  )
})
