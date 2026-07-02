import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { formatSource } from '../../src/formatter/Formatter.js'

test('formatter indents nested blocks', () => {
  const source = 'function main() {\nlet value = 1\nif value > 0 {\nprintln(value)\n}\n}\n'

  assert.equal(formatSource(source), [
    'function main() {',
    '  let value = 1',
    '  if value > 0 {',
    '    println(value)',
    '  }',
    '}',
    ''
  ].join('\n'))
})

test('formatter compacts else onto closing brace', () => {
  const source = 'if ok {\nprintln("yes")\n}\nelse {\nprintln("no")\n}\n'

  assert.equal(formatSource(source), [
    'if ok {',
    '  println("yes")',
    '} else {',
    '  println("no")',
    '}',
    ''
  ].join('\n'))
})

test('formatter preserves line and block comments', () => {
  const source = [
    'function main(): i32 { // entry { comment }',
    '// before value',
    'let value = 1 // inline value',
    '/* block { comment } */',
    'return value',
    '}',
    ''
  ].join('\n')
  const expected = [
    'function main(): i32 { // entry { comment }',
    '  // before value',
    '  let value = 1 // inline value',
    '  /* block { comment } */',
    '  return value',
    '}',
    ''
  ].join('\n')

  assertStable(source, expected)
})

test('formatter indents nested literals', () => {
  const source = [
    'function main(): i32 {',
    'let config = Config {',
    'points: [',
    'Point { x: 1, y: 2 },',
    'Point {',
    'x: 3,',
    'y: 4',
    '}',
    ']',
    '}',
    'return 0',
    '}',
    ''
  ].join('\n')
  const expected = [
    'function main(): i32 {',
    '  let config = Config {',
    '    points: [',
    '      Point { x: 1, y: 2 },',
    '      Point {',
    '        x: 3,',
    '        y: 4',
    '      }',
    '    ]',
    '  }',
    '  return 0',
    '}',
    ''
  ].join('\n')

  assertStable(source, expected)
})

test('formatter preserves multiline calls', () => {
  const source = [
    'function main(): i32 {',
    'let value = outer(',
    '1,',
    'inner(',
    '2,',
    '3',
    ')',
    ')',
    'return value',
    '}',
    ''
  ].join('\n')
  const expected = [
    'function main(): i32 {',
    '  let value = outer(',
    '    1,',
    '    inner(',
    '      2,',
    '      3',
    '    )',
    '  )',
    '  return value',
    '}',
    ''
  ].join('\n')

  assertStable(source, expected)
})

test('formatter indents match and switch bodies', () => {
  const source = [
    'function label(value: i32): string {',
    'let text = match value {',
    '1 => "one"',
    '_ => "other"',
    '}',
    'switch value {',
    'case 1 {',
    'println(text)',
    '}',
    'default {',
    'println("other")',
    '}',
    '}',
    'return text',
    '}',
    ''
  ].join('\n')
  const expected = [
    'function label(value: i32): string {',
    '  let text = match value {',
    '    1 => "one"',
    '    _ => "other"',
    '  }',
    '  switch value {',
    '    case 1 {',
    '      println(text)',
    '    }',
    '    default {',
    '      println("other")',
    '    }',
    '  }',
    '  return text',
    '}',
    ''
  ].join('\n')

  assertStable(source, expected)
})

test('formatter ignores braces and comment markers inside strings', () => {
  const source = [
    'function main(): i32 {',
    'println("object { value } // text")',
    "println('/* still text } */')",
    'return 0',
    '}',
    ''
  ].join('\n')
  const expected = [
    'function main(): i32 {',
    '  println("object { value } // text")',
    "  println('/* still text } */')",
    '  return 0',
    '}',
    ''
  ].join('\n')

  assertStable(source, expected)
})

test('formatter leaves malformed input untouched', () => {
  const malformed = 'function main(): i32 {\r\n  println("unterminated)\r\n'

  assert.equal(formatSource(malformed), malformed)
})

test('formatter normalizes CRLF and is idempotent', () => {
  const source = 'function main(): i32 {\r\nlet value = 1\r\n\r\nreturn value\r\n}\r\n'
  const expected = [
    'function main(): i32 {',
    '  let value = 1',
    '',
    '  return value',
    '}',
    ''
  ].join('\n')

  assertStable(source, expected)
})

test('formatter is idempotent across every example', async () => {
  const examples = new URL('../../examples/', import.meta.url)
  const files = (await readdir(examples))
    .filter(file => file.endsWith('.lm'))

  for (const file of files) {
    const source = await readFile(new URL(file, examples), 'utf8')
    const formatted = formatSource(source)
    assert.equal(formatSource(formatted), formatted, file)
  }
})

function assertStable(source, expected) {
  const formatted = formatSource(source)
  assert.equal(formatted, expected)
  assert.equal(formatSource(formatted), formatted)
}
