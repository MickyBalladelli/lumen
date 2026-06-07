# Lumen

Foundation for the Lumen programming language.

Lumen aims for JavaScript-like ergonomics with compiled output.

## Install

Use the official install page for global CLI, developer link, tarball, and VS Code extension commands:

[Install Lumen](book/install-lumen.md)

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

`async function` and `await` are accepted as source-level markers. Today they
lower synchronously; the syntax is reserved for the future async runtime.

```lumen
async function value(): i32 {
  return 4
}

let answer = await value()
```

### Imports

Import declarations reserve module boundaries for the standard library split.
The semantic pass validates module names and exported symbols. Helpers remain
available globally for old examples while imports become the preferred style.

```lumen
import { println } from "system"
```

Available modules today: `system`, `fs`, `http`, and `thread`.

Local file imports are concatenated by the CLI before compilation.

```lumen
import { triple } from "./modules/math.lm"
```

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
- `json`: runtime JSON text with helper accessors
- `error`: typed runtime error payload
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

Array helpers include `arraySum(...)`, `arrayFirst(...)`, `arrayLast(...)`, and
`arrayJoin(...)`.

```lumen
println(arraySum(values))
println(arrayJoin(names, ","))
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

`min(...)` and `max(...)` return the smaller or larger numeric value.

```lumen
println(min(9, 4))
println(max(9, 4))
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

`date()` returns the current local date and time as a string formatted like
`YYYY-MM-DD HH:MM:SS`.

```lumen
println(date())
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

Bootstrap map helpers add mutation-style operations for compiler symbol tables:
`mapSet(...)`, `mapDelete(...)`, and `mapKeys(...)`.

```lumen
let symbols = map("main", "function")
symbols = mapSet(symbols, "total", "i32")
println(mapGet(symbols, "total"))
```

Dynamic list helpers are string-backed today: `list()`, `listPush(...)`,
`listGet(...)`, and `listLen(...)`.

```lumen
let tokens = list()
tokens = listPush(tokens, "function")
println(listGet(tokens, 0))
```

`stringBuilder()` and `stringBuilderAppend(...)` provide the first compiler text
emission helper.

```lumen
let out = stringBuilder()
out = stringBuilderAppend(out, "define ")
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

`json(...)`, `jsonGet(...)`, and `jsonSet(...)` provide a small JSON foundation
for APIs and socket payloads.

```lumen
let payload: json = json('{"name":"lumen","count":3}')
println(jsonGet(payload, "name"))
```

`newError(code, message)`, `errorCode(...)`, and `errorText(...)` provide typed
errors. `throw` accepts strings and errors.

```lumen
let failure: error = newError(7, "disk locked")
println(errorCode(failure))
println(errorText(failure))
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

`writeFile(path, content)` writes text and returns `0` on success.

```lumen
writeFile("build/out.ll", content)
```

`exec(command)` runs a shell command and returns its process code. This is the
bootstrap hook used later to call `clang`.

```lumen
let code = exec("clang build/out.ll -o build/app")
```

`tokenizeSource(source)` and `parseSummary(source)` are Lumen-callable compiler
bootstrap helpers. They are intentionally small foundations before the full
compiler is rewritten in Lumen.

```lumen
let tokens = tokenizeSource(source)
let summary = parseSummary(source)
```

`sourceSnippet(source, line, column)` creates a diagnostic line plus caret.

### Self-Hosting Bootstrap

The first pure-Lumen compiler pieces live in `compiler/`:

- `compiler/tokenizer.lm`: tokenizes a small Lumen subset
- `compiler/parser.lm`: extracts a small program model with helper functions, statement slots, calls, and expression metadata for lets, consts, prints, returns, `if`, binary `+`, and selected loops
- `compiler/emitter.lm`: emits LLVM for simple helper functions, calls, `main`, `let`/`const`, local `i32` storage, `println`, return, binary `+`, simple `if`, statement-mode loop examples, and the current control-flow example
- `compiler/main.lm`: CLI-shaped tiny compiler

The bootstrap flow is tested by one command:

```bash
npm run test
```

That command builds the stage-1 compiler, compiles examples, links binaries,
runs expected-output checks, verifies bootstrap examples, builds the stage-2
delegate compiler, and runs negative compile tests.

Manual use stays small:

```bash
npm run bootstrap
npm run compile -- examples/basic.lm build/basic-self.ll
clang -Wno-override-module build/basic-self.ll src/runtime/http.c -pthread -o build/basic-self
./build/basic-self
```

That prints `hello` and `3`, then exits with code `3`.

The second-stage delegate compiler is also linked and tested by `npm run test`.
Invalid bootstrap input is rejected with a nonzero exit code.
The C source-to-LLVM fallback has been removed from the runtime. The stage-1
self-compile step is produced while the stage-1 LLVM seed file is hidden,
proving it no longer reads `build/lumen-compiler.ll`. The stage-2 compiler no
longer contains the source-shape example dispatcher; it delegates compile
requests to the stage-1 self-host compiler executable and rejects compiler
self-compilation explicitly. It still compiles a renamed copy of the basic
example, proving the stage-2 path is not based on the input path.

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
`/socket.io/emit`, with an experimental WebSocket endpoint at `/socket.io/ws`.
It is Socket.IO-shaped, not the full Socket.IO wire protocol.

HTTP request/response helper payloads are available for API code:

```lumen
let request = httpRequest("POST", "/api/hello", '{"name":"lumen"}')
let response = httpResponse(200, '{"content-type":"application/json"}', '{"message":"hello"}')
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

There are a few npm commands:

- `npm run test`: compile, link, and run the full test suite
- `npm run bootstrap`: build `build/lumen-compiler`
- `npm run compile -- <input.lm> <output.ll>`: use the Lumen-built compiler
- `npm run lmsh -- <input.lm> [args...]`: compile, link, and run a Lumen file
- `npm run parse -- <input.lm>`: print AST JSON
- `npm run http`: run the HTTP example
- `npm run chat`: run the Socket.IO chat example
- `npm run speedtest`: compare Lumen, Rust, Python, and Node on benchmark programs

Build the compiler once:

```bash
npm run bootstrap
```

Emit LLVM IR:

```bash
npm run compile -- examples/native-main.lm build/native-main.ll
```

Link and run manually:

```bash
clang -Wno-override-module build/native-main.ll src/runtime/http.c -pthread -o build/native-main
./build/native-main
```

Run like a scripting language:

```bash
npm run lmsh -- examples/cli-args.lm first second
```

Install local CLI tools globally from this checkout:

```bash
npm install -g .
```

Or link them while developing:

```bash
npm link
lmsh examples/cli-args.lm first second
photon list
lumen-format --check examples/basic.lm
lumen-lsp
```

The package exposes `lmsh`, `photon`, `lumen-format`, and `lumen-lsp` for
linked or global installs.

Full install docs: [Install Lumen](book/install-lumen.md).

Run all tests:

```bash
npm run test
```

Run speed benchmarks:

```bash
npm run speedtest
```

The speed test compares precompiled Lumen, `lmsh` compile-and-run mode, Rust,
Python, and Node versions of the same benchmark programs. Set
`LUMEN_SPEEDTEST_RUNS=5` to change run count. If `rustc`, `python3`, or `node`
is missing, that row is marked as missing.

Latest local results from June 2, 2026 with the default 3 runs:

| test | language | rank | best run ms | median run ms |
| --- | --- | ---: | ---: | ---: |
| sum | lumen | 2nd | 7.71 | 9.24 |
| sum | rust | 1st | 7.28 | 8.22 |
| sum | node | 3rd | 87.50 | 88.60 |
| sum | lmsh | 4th | 313.14 | 313.95 |
| sum | python | 5th | 410.25 | 412.15 |
| fib | lumen | 1st | 23.83 | 24.81 |
| fib | rust | 2nd | 26.32 | 26.63 |
| fib | node | 3rd | 93.52 | 94.77 |
| fib | lmsh | 4th | 387.63 | 607.02 |
| fib | python | 5th | 704.56 | 715.00 |
| branch | lumen | 2nd | 6.56 | 7.23 |
| branch | rust | 1st | 6.40 | 7.55 |
| branch | node | 3rd | 95.63 | 96.45 |
| branch | lmsh | 4th | 309.93 | 312.13 |
| branch | python | 5th | 1029.85 | 1040.78 |
| math | lumen | 1st | 21.87 | 22.16 |
| math | rust | 2nd | 22.09 | 23.37 |
| math | node | 3rd | 104.59 | 104.76 |
| math | lmsh | 4th | 337.86 | 355.01 |
| math | python | 5th | 588.47 | 601.56 |
| nested | lumen | 1st | 8.34 | 9.45 |
| nested | rust | 2nd | 8.66 | 10.50 |
| nested | node | 3rd | 89.89 | 90.02 |
| nested | lmsh | 4th | 323.35 | 327.36 |
| nested | python | 5th | 531.10 | 553.84 |
| state | lumen | 1st | 32.87 | 32.90 |
| state | rust | 2nd | 34.02 | 34.67 |
| state | node | 3rd | 186.83 | 187.33 |
| state | lmsh | 4th | 397.65 | 413.55 |
| state | python | 5th | 1484.88 | 1495.60 |

The test runner compiles examples, links binaries, runs expected-output tests,
checks bootstrap stages, and runs negative compile tests.

Compile from `lumen.json`:

```bash
npm run compile
```

Current config keys are `entry` and `output`.

Format Lumen files:

```bash
npm run format -- examples/basic.lm
npm run format -- --check examples/basic.lm
```

Editor tooling can also use the language server:

```bash
npm run lsp
```

## Photon packages

Photon installs external Lumen packages into `.photon/packages`.

Create a package manifest:

```bash
photon init
photon init my-app
```

`photon init` creates `photon.json`, `lumen.json`, and a starter `main.lm`
when those files do not already exist.

Add a package from a local path or Git URL:

```bash
photon add math ../lumen-math
photon add http git@github.com:you/lumen-http.git#v1.0.0
```

Search bundled packages:

```bash
photon search
photon search result
```

Add a bundled package by name:

```bash
photon add result
```

Install packages:

```bash
photon install
```

Use a package:

```lumen
import { triple } from "math"
```

Package directories may include `photon.json`:

```json
{
  "name": "math",
  "version": "1.0.0",
  "main": "main.lm"
}
```

If no package manifest exists, Photon loads `main.lm`.

Run it:

```bash
./build/native-main
echo $?
```

The first backend supports numeric programs: `i32`, `i64`, `f32`, `bool`, variables,
assignment, arithmetic, comparisons, returns, classic `for` loops, and
`println(...)` for strings, integers, floats, and booleans.

Memory ownership is manual today. `CompilerOptions` already has open hooks for
future `arc`, `borrow`, `gc`, or hybrid ownership modes.

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
- `examples/bootstrap-compiler.lm`: Lumen-callable tokenizer/parser/diagnostic foundation
- `examples/bootstrap-containers.lm`: dynamic list, map mutation, string builder
- `examples/bootstrap-exec.lm`: process execution hook
- `examples/bootstrap-io.lm`: write and read file
- `examples/advanced-foundation.lm`: field assignment, array assignment, string concat, interpolation, generic helper type
- `examples/array-helpers.lm`: array helper functions
- `examples/async-foundation.lm`: async/await syntax markers
- `examples/cli-args.lm`: CLI arguments
- `examples/control-flow.lm`: `if`, `else`, `break`, `continue`, user function calls, interpolation, imports
- `examples/crypto.lm`: `encrypt` and `decrypt`
- `examples/do-until.lm`: do-until loop
- `examples/env.lm`: read environment variables with `env`
- `examples/error-type.lm`: typed error helpers
- `examples/array.lm`: arrays of numbers and structs
- `examples/for-loop.lm`: classic for loop semicolon rule
- `examples/for-of.lm`: for-of loop over arrays
- `examples/fs.lm`: read file content with `readFile`
- `examples/http-api.lm`: API server example
- `examples/http-files.lm`: static file server example
- `examples/http-helpers.lm`: HTTP request/response payload helpers
- `examples/http-server.lm`: static files plus API routes
- `examples/json.lm`: JSON helper functions
- `examples/library-features.lm`: maps, Result helpers, nullable option helpers
- `examples/module-app.lm`: local file import
- `examples/newline-continuation.lm`: newline after incomplete expression
- `examples/native-main.lm`: compiles to LLVM IR and native code
- `examples/numbers.lm`: `i64` and `f32` numbers
- `examples/patterns.lm`: enum, match, defer, assert, range loop, slice, channel
- `examples/println.lm`: native print through `printf`
- `examples/self-host-call.lm`: self-host helper function and call smoke test
- `examples/self-host-if-binary.lm`: self-host `if` plus binary `+` smoke test
- `examples/self-host-parser.lm`: pure-Lumen parser and emitter smoke test
- `examples/self-host-simple.lm`: simple self-host compile path with lets and println
- `examples/self-host-tokenizer.lm`: pure-Lumen tokenizer smoke test
- `examples/struct.lm`: object type with fields
- `examples/socket-chat.lm`: Socket.IO-style chat server
- `examples/socket-helpers.lm`: Socket.IO-style payload helpers
- `examples/system.lm`: `println`, `len`, `min`, `max`, `includes`, `uuid`, `date`, and `filter`
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
