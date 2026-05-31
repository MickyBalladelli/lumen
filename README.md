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

### Object Types

Use `struct` to define a fixed object shape.

```lumen
struct Point {
  x: i32
  y: i32
}

let point = Point { x: 4, y: 7 }
println(point.x + point.y)
```

Structs compile to LLVM aggregate types.

### Arrays

Arrays hold a fixed list of values with the same element type.

```lumen
let values: i32[] = [2, 3, 5]
println(values[0])
```

Arrays can also hold structs.

```lumen
let points: Point[] = [
  Point { x: 4, y: 7 },
  Point { x: 1, y: 9 }
]

println(points[1].y)
```

### Loops

Classic `for` loops compile to native code.

```lumen
for (let i: i32 = 0; i < limit; i++) {
  total = total + i
}
```

Semicolons are required inside the `for (...)` header.

For-of loops iterate over arrays.

```lumen
for (let value of values) {
  total = total + value
}
```

They also work with arrays of structs.

```lumen
for (let point of points) {
  total = total + point.y
}
```

### Expressions

Current compiled expressions support:

- assignment: `total = total + i`
- arithmetic: `+`, `-`, `*`, `/`, `%`
- comparisons: `<`, `<=`, `>`, `>=`, `==`, `!=`
- increment: `i++`

### Helper functions

System helper functions are available by default.

`println(...)` prints a value and adds a newline.

```lumen
println("hello")
println(total)
println(ratio)
println(total < 10)
```

It lowers to native `printf` in the LLVM backend.

`len(...)` returns the fixed length of an array.

```lumen
println(len(values))
```

`includes(...)` checks whether a string contains another string, or whether an
array contains a value.

```lumen
println(includes("lumen language", "lumen"))
println(includes(values, 4))
```

`uuid()` returns a UUID-like string.

```lumen
let id = uuid()
println(id)
```

`filter(...)` can be used in a for-of loop with a JS-like arrow predicate.

```lumen
for (let value of filter(values, value => value > 2)) {
  total = total + value
}
```

Current filter lowering is a view over the source array inside `for-of`.

### File System

The `fs` library starts with `readFile(path)`.

```lumen
let content = readFile("examples/data.txt")
println(content)
```

`readFile(...)` returns a string. Missing files currently return an empty
string.

### HTTP

The `http` library can serve a static file directory.

```lumen
function main(): i32 {
  return serveFiles(8080, "examples/public")
}
```

It can also serve a simple API route.

```lumen
function main(): i32 {
  return serveApi(
    8081,
    "GET",
    "/health",
    'Content-Type: application/json
X-Lumen: yes
',
    '{"ok":true}'
  )
}
```

`serveApi` takes port, method, route, response headers, and response body.
Query params are accepted on requests and ignored for route matching for now.
These servers run until stopped.

Run the full browser example:

```bash
npm run http
```

Then open:

```text
http://localhost:8088
```

The full example serves static HTML and API routes from one server:

```lumen
serveHttp(8088, "examples/http-public", methods, routes, headers, bodies)
```

### Error Handling

`try/catch` catches Lumen `throw` values.

```lumen
try {
  throw "boom"
} catch error {
  println(error)
}
```

Current throw values must be strings. This is branch-based Lumen control flow,
not native exception unwinding.

### Threads

The thread library can create a semaphore and run worker functions.

```lumen
function writeLine(path: string, message: string, semaphore: semaphore): void {
  semaphoreWait(semaphore)
  appendFile(path, message)
  semaphoreSignal(semaphore)
}

let semaphore = createSemaphore(1)
let one = startThread(writeLine, "build/thread-output.txt", "thread one", semaphore)
let two = startThread(writeLine, "build/thread-output.txt", "thread two", semaphore)
let three = startThread(writeLine, "build/thread-output.txt", "thread three", semaphore)

joinThread(one)
joinThread(two)
joinThread(three)
```

`createSemaphore(1)` allows one thread into the critical section at a time.
`startThread(...)` starts a native thread with the worker function and arguments.
`joinThread(...)` waits for it to finish.
`appendFile(path, message)` appends one line to a file; put it inside the
worker function when the thread should write.

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

Build and verify every example:

```bash
npm run test
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
- `examples/array.lm`: arrays of numbers and structs
- `examples/for-loop.lm`: classic for loop semicolon rule
- `examples/for-of.lm`: for-of loop over arrays
- `examples/fs.lm`: read file content with `readFile`
- `examples/http-api.lm`: API server example
- `examples/http-files.lm`: static file server example
- `examples/http-server.lm`: static files plus API routes
- `examples/newline-continuation.lm`: newline after incomplete expression
- `examples/native-main.lm`: compiles to LLVM IR and native code
- `examples/numbers.lm`: `i64` and `f32` numbers
- `examples/println.lm`: native print through `printf`
- `examples/struct.lm`: object type with fields
- `examples/system.lm`: `println`, `len`, and `filter`
- `examples/thread.lm`: native threads with semaphore-protected file writes
- `examples/try-catch.lm`: Lumen `try/catch` and `throw`
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
