import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Tokenizer } from '../../src/lexer/Tokenizer.js'
import { TokenType } from '../../src/lexer/TokenType.js'
import { Compiler } from '../../src/compiler/Compiler.js'

test('bootstrap tokenizer keyword table matches primary grammar', async () => {
  const [primary, bootstrap] = await Promise.all([
    readFile('src/lexer/Tokenizer.js', 'utf8'),
    readFile('compiler/tokenizer.lm', 'utf8')
  ])

  const primaryBlock = primary.match(/const KEYWORDS = new Set\(\[([\s\S]*?)\]\)/)?.[1]
  const bootstrapLists = [...bootstrap.matchAll(/let keywords[A-Z] = "([^"]+)"/g)]
    .map(match => match[1])

  assert.ok(primaryBlock)
  assert.equal(bootstrapLists.length, 2)

  const primaryKeywords = [...primaryBlock.matchAll(/'([^']+)'/g)]
    .map(match => match[1])
    .sort()
  const bootstrapKeywords = bootstrapLists.join('')
    .split('|')
    .filter(Boolean)
    .sort()

  assert.deepEqual(bootstrapKeywords, primaryKeywords)
})

test('bootstrap newline termination matches primary grammar probe', () => {
  const source = `function sample(value: f32) {
  // line comment
  let text = 'ok'
  let number = 12.5
  let continued = number
    + 1
  if number !== 0 && true || false {
    number++
  }
  /* block
     comment */
  return (
    number
  )
}`
  const tokens = new Tokenizer(source).tokenize()

  assert.equal(
    tokens.filter(token => token.type === TokenType.Semicolon).length,
    6
  )
  assert.equal(tokens.filter(token => token.type === TokenType.Comment).length, 0)
  assert.deepEqual(
    ['!==', '&&', '||', '++'].map(operator => {
      return tokens.find(token => token.lexeme === operator)?.type
    }),
    Array(4).fill(TokenType.Operator)
  )
})

test('loop-local storage is allocated once at function entry', () => {
  const { llvm } = new Compiler().compileSource([
    'function main(): i32 {',
    '  let index: i32 = 0',
    '  while index < 4 do {',
    '    let copy = index',
    '    index++',
    '  }',
    '  return index',
    '}'
  ].join('\n'))

  const loopBody = llvm.slice(
    llvm.indexOf('while.body'),
    llvm.indexOf('while.end')
  )
  assert.doesNotMatch(loopBody, /\balloca\b/)
  assert.match(llvm.slice(llvm.indexOf('entry:'), llvm.indexOf('while.cond')), /copy\.addr.*alloca i32/)
})
