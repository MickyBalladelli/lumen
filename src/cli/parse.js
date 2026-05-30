import { readFile } from 'node:fs/promises'
import { Parser, Tokenizer } from '../index.js'

const file = process.argv[2]

if (!file) {
  console.error('Usage: npm run parse -- <file.lm>')
  process.exit(1)
}

const source = await readFile(file, 'utf8')
const tokens = new Tokenizer(source).tokenize()
const ast = new Parser(tokens).parseProgram()

console.log(JSON.stringify(ast, null, 2))
