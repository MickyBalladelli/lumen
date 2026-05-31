# Lumen

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

User-defined functions can call other user-defined functions.

```lumen
function add(left: i32, right: i32): i32 {
  return left + right
}

function main(): i32 {
  return add(1, 2)
}
```

### Imports

Import declarations reserve module boundaries for the standard library split.
The semantic pass validates module names and exported symbols. Helpers remain
available globally for old examples while imports become the preferred style.

```lumen
import { println } from "system"
```

Available modules today: `system`, `fs`, `http`, and `thread`.

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
- `T?`: nullable option-shaped value, currently used with string helpers
- `Result<T>` and `Map<K,V>`: generic runtime-backed helper types
- `void`: no value

```lumen
let count: i32 = 3
let big: i64 = 10000000000
let ratio: f32 = 1.5 + 2.25
let maybeName: string? = none()
let result: Result<string> = ok("ready")
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

### Enums

Enums define named integer-backed variants.

```lumen
enum Status {
  Ok
  Missing
  Broken
}

let status: Status = Missing
```

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

Strings support slice syntax.

```lumen
let part = "lumen"[1..4]
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

While-do loops run while the condition is true.

```lumen
while total < 10 do {
  total = total + 1
}
```

Do-until loops run the body first, then stop once the condition is true.

```lumen
do {
  total = total + 1
} until total == 10
```

Use `break` and `continue` inside loops.

```lumen
for (let i: i32 = 0; i < 10; i++) {
  if i == 2 {
    continue
  }

  if i == 8 {
    break
  }
}
```

Range loops count upward from start to end, excluding the end.

```lumen
for i in 0..10 {
  println(i)
}
```

### Branches

`if / else` branches compile to native control flow.

```lumen
if total > 10 {
  println("large")
} else {
  println("small")
}
```

`match` is expression-style branching that returns a value.

```lumen
let label = match status {
  Ok => "ok"
  Missing => "missing"
  _ => "unknown"
}
```

`switch` matches numeric, boolean, or string values. Cases use block bodies.
`break` exits the switch.

```lumen
switch value {
  case 1 {
    println("one")
  }
  case 2 {
    println("two")
    break
  }
  default {
    println("many")
  }
}
```

### Expressions

Current compiled expressions support:

- assignment: `total = total + i`
- arithmetic: `+`, `-`, `*`, `/`, `%`
- comparisons: `<`, `<=`, `>`, `>=`, `==`, `!=`
- increment: `i++`
- user function calls: `add(1, 2)`

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

String literals in `println` support simple interpolation.

```lumen
let name = "lumen"
println("hello ${name}")
```

String concatenation and interpolation also work in string expressions.

```lumen
let label = "hello " + "lumen"
let greeting = "hello ${name}"
```

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

`env(name)` reads an environment variable. Missing variables return an empty
string. If the variable is not in the process environment, Lumen also checks a
`.env` file in the current directory.

```lumen
let databaseUrl = env("DATABASE_URL")
println(databaseUrl)
```

`.env` files support simple dotenv-style entries:

```text
DATABASE_URL=postgres://localhost/lumen
export API_KEY="dev-key"
```

Real process environment values win over `.env` values.

`assert(condition, message?)` fails fast when a condition is false.

```lumen
assert(total == 6, "bad total")
```

`arg(index)` reads a CLI argument and `argCount()` returns the argument count.

```lumen
println(arg(1))
println(argCount())
```

`map(...)`, `mapGet(...)`, and `mapHas(...)` provide a simple string-keyed map.

```lumen
let headers = map("content-type", "application/json", "x-lumen", "yes")
println(mapGet(headers, "content-type"))
println(mapHas(headers, "x-lumen"))
```

`channel()`, `send(channel, value)`, and `receive(channel)` provide a small
message-passing foundation for higher-level thread communication.

```lumen
let messages = channel()
send(messages, "ready")
println(receive(messages))
```

`ok(...)`, `err(...)`, `isOk(...)`, and `errorMessage(...)` provide a small
Result-style helper set.

```lumen
let result = err("missing file")
println(isOk(result))
println(errorMessage(result))
```

`some(...)`, `none()`, `hasValue(...)`, and `valueOr(...)` provide option-style
nullable helpers.

```lumen
let name: string? = some("lumen")
println(valueOr(name, "fallback"))
```

### Assignment

Variables, struct fields, and array elements can be assigned.

```lumen
point.x = 4
values[0] = 8
```

`encrypt(value, key, protocol?)` encrypts a string and returns a portable
encoded string. `decrypt(value, key, protocol?)` reverses it.

```lumen
let encrypted = encrypt("hello lumen", "correct horse battery staple")
let decrypted = decrypt(encrypted, "correct horse battery staple")

println(includes(encrypted, "lumen:v1"))
println(decrypted)
```

The default protocol is `AES-256`, currently implemented as
`AES-256-CTR-HMAC-SHA256` with PBKDF2 key derivation, random salt, random nonce,
and authentication before decrypt.

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

Socket.IO-style chat helpers are also available:

- `serveSocketIoChat(port, root)`: serves static files plus chat endpoints
- `socketIoEvent(event, payload)`: builds an event payload string
- `socketIoEmit(room, event, payload)`: builds a room event payload string

Run the chat browser example:

```bash
npm run chat
```

Then open:

```text
http://localhost:8090
```

Current chat transport is simple HTTP polling on `/socket.io/messages` and
`/socket.io/emit`. It is Socket.IO-shaped, not the full Socket.IO wire protocol.

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

This command skips examples whose executable is newer than the source and
runtime.

Build and verify every example:

```bash
npm run test
```

The test runner compiles examples, runs expected-output tests, and runs negative
compile tests from `tests/negative`.

Run it:

```bash
./build/native-main
echo $?
```

The first backend supports numeric programs: `i32`, `i64`, `f32`, `bool`, variables,
assignment, arithmetic, comparisons, returns, classic `for` loops, and
`println(...)` for strings, integers, floats, and booleans.

Diagnostics include a source line and caret when compilation fails through the
compiler pipeline.

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
- `examples/advanced-foundation.lm`: field assignment, array assignment, string concat, interpolation, generic helper type
- `examples/cli-args.lm`: CLI arguments
- `examples/control-flow.lm`: `if`, `else`, `break`, `continue`, user function calls, interpolation, imports
- `examples/crypto.lm`: `encrypt` and `decrypt`
- `examples/do-until.lm`: do-until loop
- `examples/env.lm`: read environment variables with `env`
- `examples/array.lm`: arrays of numbers and structs
- `examples/for-loop.lm`: classic for loop semicolon rule
- `examples/for-of.lm`: for-of loop over arrays
- `examples/fs.lm`: read file content with `readFile`
- `examples/http-api.lm`: API server example
- `examples/http-files.lm`: static file server example
- `examples/http-server.lm`: static files plus API routes
- `examples/library-features.lm`: maps, Result helpers, nullable option helpers
- `examples/newline-continuation.lm`: newline after incomplete expression
- `examples/native-main.lm`: compiles to LLVM IR and native code
- `examples/numbers.lm`: `i64` and `f32` numbers
- `examples/patterns.lm`: enum, match, defer, assert, range loop, slice, channel
- `examples/println.lm`: native print through `printf`
- `examples/struct.lm`: object type with fields
- `examples/socket-chat.lm`: Socket.IO-style chat server
- `examples/socket-helpers.lm`: Socket.IO-style payload helpers
- `examples/system.lm`: `println`, `len`, and `filter`
- `examples/switch.lm`: switch with numeric and string cases
- `examples/thread.lm`: native threads with semaphore-protected file writes
- `examples/try-catch.lm`: Lumen `try/catch` and `throw`
- `examples/while-do.lm`: while-do loop
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
    CompilerOptions.js   runtime/compiler toggles including ownership mode
    system.c             system runtime split point
    fs.c                 fs runtime split point
    http_runtime.c       http runtime split point
    thread.c             thread runtime split point
    crypto.c             crypto runtime split point
    string.c             string runtime split point
```

The C runtime is still built as one translation unit for easy linking, but it is
organized internally by system, fs, http, thread, crypto, string, map, result,
option, and CLI helper sections. Platform-specific bits use macOS guards and
Linux-safe fallbacks where a native provider is not wired yet.

Ownership settings are exposed through `CompilerOptions` with `ownership` values
such as `manual`, `arc`, `borrow`, `gc`, and `hybrid` reserved for future runtime
strategies.

## Extension path

Add new keywords in `src/lexer/Tokenizer.js`.

Add new AST classes in `src/ast/nodes.js`, then register them in
`src/ast/AstNodeRegistry.js`.

Add new grammar entry points in `src/parser/Parser.js`.

Replace `rawExpressionUntil()` with a real expression parser when operator
precedence and typed expressions arrive.

Grow `LLVMEmitter` into a target interface when more backends arrive.
