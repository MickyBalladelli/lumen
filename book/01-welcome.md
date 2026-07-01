# Welcome

Lumen is a small systems language with JavaScript-like syntax and native LLVM
output. It compiles to native executables that rival Rust in performance for
many benchmarks.

Tiny program:

```lumen
function main(): i32 {
  println("hello lumen")
  return 0
}
```

The goal is simple: write readable programs, compile them to native code, and
grow the language until it can own more of its compiler. The self-host compiler
is now genuinely self-hosting — it reproduces its own LLVM image without an
external compiler or seed file, proven through a three-stage bootstrap.

## Language Philosophy

Lumen's syntax is deliberately familiar. If you've written JavaScript or
TypeScript, you'll recognize the braces, the `let`/`const` variable
declarations, the `function` keyword, and the expression-style control flow.
Type annotations follow a colon: `name: i32`. Types are simple and explicit.

The difference is execution: Lumen doesn't run in a VM. It compiles through
LLVM to machine code. Small programs become small native executables. A
function call is a real function call. An integer is a real register-sized
integer.

## What Lumen Supports Today

### Core Language

- **Functions** with typed parameters and return values. User-defined functions
  can call other user-defined functions. `async function` and `await` are
  accepted as source markers (lowered synchronously for now, reserved for the
  future async runtime). `extern` declarations reserve native symbols for
  runtime linking.

- **Variables** with `let` (mutable) and `const` (immutable). Type annotations
  are optional in simple cases. Variables, struct fields, and array elements
  can all be assigned.

- **Types**: `i32`, `i64`, `f32`, `bool`, `string`, `json`, `error`, `T?`
  (nullable options), `Result<T>` (success/failure), `Map<K,V>` (key-value
  pairs), and `void`. Structs define custom aggregate types. Enums define
  named integer-backed variants.

- **Expressions**: assignment, arithmetic (`+`, `-`, `*`, `/`, `%`),
  comparisons (`<`, `<=`, `>`, `>=`, `==`, `!=`), increment (`i++`), user
  function calls, string concatenation, and string interpolation.

- **Imports** from four named modules (`system`, `fs`, `http`, `thread`) and
  from local files. The module graph resolves by canonical path, rejects
  cycles, honors package export lists, and keeps dependency-private names
  isolated.

### Control Flow

- **`if`/`else`** branches compile to native control flow.
- **Classic `for`** loops with initializer, condition, and increment (semicolons
  required inside the header).
- **`for-of`** loops iterate over arrays, including arrays of structs. Works
  with `filter` and arrow-style predicates.
- **Range loops** count upward from start to end, excluding the end.
- **`while-do`** runs while the condition is true.
- **`do-until`** runs the body first, then stops once the condition is true.
- **`break`** and **`continue`** work inside all loop forms.
- **`match`** is expression-style branching that returns a value. Works with
  enums and a wildcard `_` arm.
- **`switch`** matches numeric, boolean, or string values. Cases use block
  bodies. `break` exits the switch.
- **`defer`** schedules a statement to run when the enclosing block exits.

### Data Structures

- **Arrays** hold a fixed list of values with the same element type. Supports
  index access, index assignment, `len()`, empty array literals with annotated
  types, and array helpers (`arraySum`, `arrayFirst`, `arrayLast`, `arrayJoin`).
  Runtime bounds checking applies to all reads, writes, and loop indices.

- **Structs** define fixed object shapes. They compile to LLVM aggregate types.
  Fields are accessed with dot notation and can be assigned.

- **Enums** define named integer-backed variants. They work with `match` and
  `switch`.

- **Maps** are string-keyed values created with `map(key, value, ...)`. Mutation
  helpers include `mapSet`, `mapDelete`, and `mapKeys`.

- **Lists** are dynamic string-backed sequences with `list()`, `listPush`,
  `listGet`, and `listLen`.

- **Channels** provide a small message-passing foundation for thread
  communication: `channel()`, `send(channel, value)`, `receive(channel)`.

### Strings

String literals support interpolation with `${...}` and concatenation with
`+`. Slice syntax (`"text"[start..end]`) extracts substrings. Runtime bounds
checking applies to indexing and slicing.

String helpers include `stringLen`, `stringEquals`, `trim`, `lower`, `upper`,
`startsWith`, `endsWith`, `replace`, `split`, `indexOf`, `lastIndexOf`,
`contains`, `repeat`, `padStart`, `padEnd`, `includes` (also works with
arrays), `intToString`, and `stringToInt`. Parsing helpers: `parseI32`,
`parseF32`.

### JSON

JSON is a first-class type (`json`). Create values with `json(string)`. Access
fields with `jsonGet`. Access raw values with `jsonGetRaw`. Set fields with
`jsonSet` and `jsonSetPath` (for nested paths). Validate with `jsonValid`.
Escape with `jsonQuote`. Serialize with `jsonStringify`.

### System Helpers

- `println(...)`: prints any value with a newline, lowers to native `printf`.
- `len(...)`: returns the fixed length of an array.
- `min(...)`, `max(...)`: return the smaller or larger numeric value.
- `uuid()`: returns a UUID-like string.
- `date()`: returns `YYYY-MM-DD HH:MM:SS` local date-time.
- `assert(condition, message?)`: fails fast when a condition is false.
- `includes(...)`: checks substring containment or array membership.

### Encryption

`encrypt(value, key, protocol?)` encrypts a string with AES-256 (default
protocol `AES-256`, implemented as `AES-256-CTR-HMAC-SHA256` with PBKDF2 key
derivation, random salt, random nonce, and authentication before decrypt).
`decrypt(value, key, protocol?)` reverses it. Both return `Result<string>`;
successful encrypted values are prefixed with `lumen:v1:`.

### File System

- `readFile(path)`: returns `Result<string>`.
- `writeFile(path, content)`: returns `Result<i32>`.
- `appendFile(path, content)`: appends a line to a file (thread-safe with
  semaphores).

### Environment and CLI

- `env(name)`: returns `Result<string>` and falls back to `.env` files.
  Process environment wins over `.env` values.
- `arg(index)`: returns `Result<string>` (`arg(0)` is the program name).
- `argCount()`: returns `Result<i32>`.
- `exec(command)`: returns `Result<i32>` containing the exit code.

### Error Handling

- `throw value`: throws a value (strings currently).
- `try/catch`: catches thrown values with branch-based control flow (not native
  exceptions).
- Typed errors: `newError(code, message)`, `errorCode(...)`, `errorText(...)`.
- Result helpers: `ok(...)`, `err(...)`, `isOk(...)`, `resultValue(...)`,
  `errorMessage(...)`.
- Option helpers: `some(...)`, `none()`, `hasValue(...)`, `valueOr(...)`.

### Threads

Native threads with semaphore-guarded critical sections:
`createSemaphore(count)`, `semaphoreWait(...)`, `semaphoreSignal(...)`,
`startThread(function, ...args)`, `joinThread(handle)`. Operations return
`Result<T>`.

### HTTP

- `serveFiles(port, root)`: serves a static file directory.
- `serveApi(port, method, route, headers, body)`: serves an API endpoint.
- `serveHttp(port, root, methods, routes, headers, bodies)`: serves static
  files plus API routes.
- `serveSocketIoChat(port, root)`: Socket.IO-shaped chat server.
- `httpRequest(method, path, body)`, `httpResponse(status, headers, body)`
  payload helpers.
- `socketIoEvent(event, payload)`, `socketIoEmit(room, event, payload)` helpers.

HTTP operations return `Result<T>`.

### Compiler Bootstrap Helpers

- `tokenizeSource(source)`: Lumen-callable tokenizer.
- `parseSummary(source)`: Lumen-callable parser summary.
- `sourceSnippet(source, line, column)`: diagnostic line plus caret.
- `compilerImage()`: returns the self-host compiler's LLVM image.
- `stringBuilder()`, `stringBuilderAppend(...)`: text emission helpers.

### Packages

30 bundled packages under `packages/` cover assertions, authentication, caching,
CLI parsing, collections, configuration, crypto, CSV, dates, dotenv, environment,
filesystem extensions, HTML, HTTP, JSON, JWT, logging, math, middleware, options,
path manipulation, process management, results, routing, slugs, strings,
templates, testing, time, URLs, UUIDs, and validation.

Photon (`photon init`, `photon add`, `photon install`, `photon search`) installs
external packages from local paths or Git URLs into `.photon/packages`.

### Tooling

- **`lmsh`**: compile, link, and run a Lumen file in one command.
- **`lumen-format`**: format Lumen source files (`--check` for validation).
- **`lumen-lsp`**: language server for editor diagnostics and formatting.
- **VS Code extension**: syntax highlighting, snippets, formatting, diagnostics,
  compile command, and native debug launch support.

## Self-Host Compiler

The compiler in `compiler/` is written in Lumen. It tokenizes, parses, runs
semantic analysis, type checks, builds IR, and emits LLVM. The bootstrap is
proven through three stages:
1. Stage-1 compiles `compiler/main.lm` to native.
2. Stage-2 delegates compilation requests to the stage-1 compiler.
3. Stage-3 is built by stage-2, compared byte-for-byte, and runs independently.

The stage-1 LLVM seed file is hidden; the C source-to-LLVM fallback has been
removed; the source-shape example dispatcher has been replaced with a delegate
path.

## Missing

- Full expression AST (currently uses token-shape heuristics in
  `RawExpression.parsed`, which is created but ignored by semantic analysis,
  type checking, and code generation)
- Stronger type checker (boolean conditions not enforced, no return-on-all-paths
  analysis, no use-before-initialization rejection)
- Async runtime (syntax reserved, lowers synchronously today)
- Better HTTP routing and production-ready runtime hardening
- A packaged `lumen` compiler binary command
