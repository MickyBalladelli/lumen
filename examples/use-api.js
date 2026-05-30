import { Parser, Tokenizer } from '../src/index.js'

const source = `
function main() {
  let value = 10

  for (let i = 0; i < value; i++) {
    value = value + i
  }

  println(value)

  return value
}
`

const tokens = new Tokenizer(source).tokenize()
const ast = new Parser(tokens).parseProgram()

console.log(JSON.stringify(ast, null, 2))
