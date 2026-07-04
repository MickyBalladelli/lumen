import assert from 'node:assert/strict'
import test from 'node:test'
import { Tokenizer } from '../../src/lexer/Tokenizer.js'
import { Parser } from '../../src/parser/Parser.js'
import { SemanticAnalyzer } from '../../src/semantics/SemanticAnalyzer.js'
import { Compiler } from '../../src/compiler/Compiler.js'

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

test('compiler resolves lexical symbols by declaration identity', () => {
  const { ast, ir } = new Compiler().compileSource([
    'import { println } from "system"',
    'struct Pair {',
    '  left: i32',
    '}',
    'function read(pair: Pair): i32 {',
    '  return pair.left',
    '}',
    'function main(value: i32): i32 {',
    '  let pair = Pair { left: value }',
    '  {',
    '    let value: i32 = 2',
    '    println(value)',
    '  }',
    '  return read(pair)',
    '}'
  ].join('\n'))

  const [importNode, structNode, readNode, mainNode] = ast.body
  const readMember = readNode.body.body[0].argument.parsed
  const pairDeclaration = mainNode.body.body[0].declarations[0]
  const pairInitializer = pairDeclaration.initializer.parsed
  const innerBlock = mainNode.body.body[1]
  const innerDeclaration = innerBlock.body[0].declarations[0]
  const printlnCall = innerBlock.body[1].expression.parsed
  const readCall = mainNode.body.body[2].argument.parsed

  assert.strictEqual(readMember.object.resolvedSymbol, readNode.params[0].symbol)
  assert.strictEqual(readMember.property.resolvedSymbol, structNode.fields[0].symbol)
  assert.strictEqual(pairInitializer.resolvedSymbol, structNode.symbol)
  assert.strictEqual(pairInitializer.fields[0].resolvedSymbol, structNode.fields[0].symbol)
  assert.strictEqual(pairInitializer.fields[0].value.resolvedSymbol, mainNode.params[0].symbol)
  assert.strictEqual(printlnCall.callee.resolvedSymbol, importNode.names[0].symbol)
  assert.strictEqual(printlnCall.arguments[0].resolvedSymbol, innerDeclaration.symbol)
  assert.notStrictEqual(innerDeclaration.symbol, mainNode.params[0].symbol)
  assert.strictEqual(readCall.callee.resolvedSymbol, readNode.symbol)
  assert.strictEqual(readCall.arguments[0].resolvedSymbol, pairDeclaration.symbol)

  const mainIR = ir.functions.find(func => func.name === 'main')
  const innerIR = mainIR.blocks[0].instructions[1].body
  assert.equal(
    innerIR.instructions[1].expression.arguments[0].symbolId,
    innerIR.instructions[0].declarations[0].symbolId
  )
  assert.equal(
    mainIR.blocks[0].terminator.value.callee.symbolId,
    ir.functions.find(func => func.name === 'read').symbolId
  )
})

test('same scope rejects duplicates while nested scope may shadow', () => {
  assert.throws(
    () => new Compiler().compileSource([
      'function main(): i32 {',
      '  let value: i32 = 1',
      '  let value: i32 = 2',
      '  return value',
      '}'
    ].join('\n')),
    /Duplicate variable "value"/
  )

  assert.doesNotThrow(() => new Compiler().compileSource([
    'function main(value: i32): i32 {',
    '  {',
    '    let value: i32 = 2',
    '    println(value)',
    '  }',
    '  return value',
    '}'
  ].join('\n')))
})

test('user function identity wins over builtin with same name', () => {
  const { ir, llvm } = new Compiler().compileSource([
    'function len(value: i32): i32 {',
    '  return value + 1',
    '}',
    'function main(): i32 {',
    '  return len(4)',
    '}'
  ].join('\n'))
  const call = ir.functions.find(func => func.name === 'main').blocks[0].terminator.value

  assert.equal(call.callee.symbolId, ir.functions.find(func => func.name === 'len').symbolId)
  assert.match(llvm, /call i32 @len\(i32 4\)/)
})

function parse(source) {
  return new Parser(new Tokenizer(source).tokenize()).parseProgram()
}
