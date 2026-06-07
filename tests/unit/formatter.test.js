import assert from 'node:assert/strict'
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
