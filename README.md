# Lumen Compiler Kit

Foundation for the Lumen systems language.

Lumen aims for JavaScript-like ergonomics with compiled output.

## What exists now

- Standalone tokenizer
- Modular parser
- Strict AST class hierarchy
- AST node registry for future node types
- Visitor base class for compiler passes
- Placeholder compiler options with a future garbage collector toggle
- Semantic analyzer
- Type checker
- Typed IR builder
- LLVM IR backend
- Build driver that can call `clang`

Supported syntax today:

```lumen
function calculate(limit) {
  let total = 0

  for (let i = 0; i < limit; i++) {
    total = total + i
  }

  println(total)
  return total
}
```

Semicolons are optional at statement ends.

Classic `for` loops still require semicolons:

```lumen
for (let i = 0; i < 10; i++) {
  work(i)
}
```

## Available functionality

### Functions

Functions use the `function` keyword.

```lumen
function main(): i32 {
  return 0
}
```

The native linker expects an executable program to provide `main`.

### Variables

Use `let` for mutable values and `const` for fixed values.

```lumen
let total: i32 = 0
const limit: i32 = 5
```

Type annotations are optional in simple cases, but native examples should use
`main(): i32`.

### Types

Current built-in types:

- `i32`: 32-bit integer
- `i64`: 64-bit integer
- `f32`: 32-bit floating point number
- `bool`: boolean value
- `string`: string value for printing
- `void`: no value

```lumen
let count: i32 = 3
let big: i64 = 10000000000
let ratio: f32 = 1.5 + 2.25
```

### Loops

Classic `for` loops compile to native code.

```lumen
for (let i: i32 = 0; i < limit; i++) {
  total = total + i
}
```

Semicolons are required inside the `for (...)` header.

### Expressions

Current compiled expressions support:

- assignment: `total = total + i`
- arithmetic: `+`, `-`, `*`, `/`, `%`
- comparisons: `<`, `<=`, `>`, `>=`, `==`, `!=`
- increment: `i++`

### Helper functions

`println(...)` prints a value and adds a newline.

```lumen
println("hello")
println(total)
println(ratio)
println(total < 10)
```

It lowers to native `printf` in the LLVM backend.

## Run parser

```bash
npm run parse -- examples/basic.lm
```

This prints the AST JSON.

## Compile

Emit LLVM IR:

```bash
npm run compile -- examples/native-main.lm --emit-llvm
```

Build a native executable with `clang`:

```bash
npm run compile -- examples/native-main.lm -o build/native-main
```

Build every Lumen example:

```bash
npm run compile:examples
```

Run it:

```bash
./build/native-main
echo $?
```

The first backend supports numeric programs: `i32`, `i64`, `f32`, `bool`, variables,
assignment, arithmetic, comparisons, returns, classic `for` loops, and
`println(...)` for strings, integers, floats, and booleans.

## Use as library

```js
import { Parser, Tokenizer } from './src/index.js'

const source = `
function main() {
  let value = 1 + 2
  return value
}
`

const tokens = new Tokenizer(source).tokenize()
const ast = new Parser(tokens).parseProgram()

console.log(ast)
```

## Examples

- `examples/basic.lm`: variables, function, return
- `examples/for-loop.lm`: classic for loop semicolon rule
- `examples/newline-continuation.lm`: newline after incomplete expression
- `examples/native-main.lm`: compiles to LLVM IR and native code
- `examples/numbers.lm`: `i64` and `f32` numbers
- `examples/println.lm`: native print through `printf`
- `examples/use-api.js`: tokenizer and parser from JavaScript

Run the API example:

```bash
node examples/use-api.js
```

## Project layout

```text
src/
  ast/
    nodes.js             AST classes
    AstNodeRegistry.js   node registration hook
    AstVisitor.js        visitor base for compiler passes
  lexer/
    Tokenizer.js         source to tokens
    Token.js
    TokenType.js
  parser/
    Parser.js            tokens to AST
  semantics/
    SemanticAnalyzer.js  scope and symbol checks
    TypeChecker.js       simple i32/bool/string/void typing
  ir/
    IRBuilder.js         typed AST to compiler IR
  backend/
    LLVMEmitter.js       IR to LLVM text
  compiler/
    Compiler.js          end-to-end pipeline and clang driver
  runtime/
    CompilerOptions.js   future runtime/compiler toggles
```

## Extension path

Add new keywords in `src/lexer/Tokenizer.js`.

Add new AST classes in `src/ast/nodes.js`, then register them in
`src/ast/AstNodeRegistry.js`.

Add new grammar entry points in `src/parser/Parser.js`.

Replace `rawExpressionUntil()` with a real expression parser when operator
precedence and typed expressions arrive.

Grow `LLVMEmitter` into a target interface when more backends arrive.
