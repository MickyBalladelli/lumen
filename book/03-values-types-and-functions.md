# Values, Types, And Functions

## Variables: `let` And `const`

Lumen has two kinds of variable bindings.

**`let`** creates a mutable variable. You can reassign it later.

**`const`** creates an immutable binding. Once set, it cannot be reassigned.

```lumen check
function main(): i32 {
  let total: i32 = 0         // mutable, can change
  const limit: i32 = 10      // immutable, cannot change

  total = total + 1          // allowed: total is let
  // limit = 20              // ERROR: limit is const

  return total
}
```

Type annotations after the variable name are optional when the type can be
inferred from the initializer. For `main()` and native-exposed functions,
explicit types are recommended.

```lumen
let count = 3        // i32 inferred
let name = "lumen"   // string inferred
```

## Built-in Types

Lumen provides these primitive and compound types:

### Numeric Types

| Type | Description | Example |
| --- | --- | --- |
| `i32` | 32-bit signed integer | `let x: i32 = 42` |
| `i64` | 64-bit signed integer | `let big: i64 = 10000000000` |
| `f32` | 32-bit floating point | `let ratio: f32 = 1.5 + 2.25` |

Integer literals without a suffix default to `i32`. Large values that don't fit
in 32 bits require an `i64` annotation. Floating-point literals are `f32`.

Arithmetic operators work across numeric types:

```lumen
let a: i32 = 10 + 5      // 15
let b: i32 = 10 - 5      // 5
let c: i32 = 10 * 5      // 50
let d: i32 = 10 / 3      // 3 (integer division)
let e: i32 = 10 % 3      // 1 (modulo)
let f: f32 = 1.5 + 2.25  // 3.75
```

Increment with `++` is supported:

```lumen
i++   // adds 1 to i
```

### Boolean

`bool` holds `true` or `false`. Comparison operators return `bool`:

```lumen
let ready: bool = true
let done: bool = false
let larger: bool = total > 10
let same: bool = name == "lumen"
```

Comparisons: `<`, `<=`, `>`, `>=`, `==`, `!=`.

### String

`string` holds text. String literals use double quotes.

```lumen
let name: string = "lumen"
let empty: string = ""
```

Strings support interpolation with `${...}` and concatenation with `+`:

```lumen
let greeting = "hello ${name}"      // "hello lumen"
let label = "hello " + "lumen"      // "hello lumen"
```

Interpolation works inside `println` and in string expressions. The expression
inside `${}` is evaluated and its string representation is inserted.

### JSON

`json` is a first-class type for JSON data. Create it from a JSON string:

```lumen
let payload: json = json('{"name":"lumen","count":3}')
```

Note the single quotes around the JSON string — this avoids escaping the inner
double quotes. JSON values are runtime-owned and stay valid for the process
lifetime.

### Error

`error` is a typed error payload with a numeric code and a text message:

```lumen
let failure: error = newError(7, "disk locked")
```

### Nullable: `T?`

Any type can be made nullable by appending `?`. This creates an option-shaped
value that either holds a value or is empty:

```lumen
let maybeName: string? = some("lumen")
let empty: string? = none()
```

### Result: `Result<T>`

`Result<T>` represents either a success value or a failure:

```lumen
let good: Result<string> = ok("ready")
let bad: Result<string> = err("missing")
```

### Map: `Map<K,V>`

`Map<K,V>` is a runtime-backed key-value container:

```lumen
let headers: Map<string,string> = map("content-type", "application/json")
```

### Void

`void` means no value. Use it as the return type of functions that don't return
anything:

```lumen
function log(message: string): void {
  println(message)
}
```

## Structs

Structs define custom aggregate types with named, typed fields:

```lumen
struct Point {
  x: i32
  y: i32
}
```

Create an instance with struct literal syntax:

```lumen
let origin = Point { x: 0, y: 0 }
let moved = Point { x: 4, y: 7 }
```

Access fields with dot notation:

```lumen
println(origin.x)       // 0
println(moved.x + moved.y)  // 11
```

Struct fields can be assigned:

```lumen
origin.x = 10
```

Structs compile to LLVM aggregate types — they're real structs in memory, not
heap-allocated objects.

## Enums

Enums define a set of named integer-backed variants:

```lumen
enum Status {
  Ok
  Missing
  Broken
}
```

Use variants directly:

```lumen
let status: Status = Missing
```

Enums work with `match` (expression-style branching) and `switch` (block-based
branching). Variants are numbered starting from `0` (`Ok = 0`, `Missing = 1`,
`Broken = 2`).

## Functions

Functions use the `function` keyword, followed by the name, parameter list, and
return type:

```lumen
function add(left: i32, right: i32): i32 {
  return left + right
}
```

- **Parameters** have explicit types: `left: i32, right: i32`
- **Return type** comes after the parameter list: `: i32`
- **Body** is a block of statements
- **`return`** exits the function with a value

Functions can call other functions defined earlier or later in the file:

```lumen
function multiply(x: i32, y: i32): i32 {
  return x * y
}

function main(): i32 {
  let result = multiply(3, 4)
  println(result)
  return result
}
```

There is no forward-declaration requirement — the compiler resolves all
function names in the file before code generation.

### The `main` Function

Every native executable program must have a `main` function returning `i32`:

```lumen
function main(): i32 {
  return 0
}
```

The return value is the process exit code. `0` means success; nonzero means
error. The native linker expects this signature.

### Async Functions

Calling an `async function` starts it eagerly on a native OS thread. The call
returns `Task<T>`, where `T` is the function's declared return type. `await`
blocks the calling thread and unwraps the task value.

```lumen
async function value(input: i32): i32 {
  return input + 1
}

let task: Task<i32> = value(3)
let answer = await task
```

Tasks use these rules:

- Scheduling is eager and one native thread is created for each async call.
- `await` may be used in normal or async functions. It blocks that OS thread.
- `taskCancel(task)` marks a task cancelled. A pending task does not begin.
  Running native work is not forcibly killed; it can poll `taskCancelled()`
  and return early. Its eventual result is ignored.
- An uncaught throw in the task body, cancellation, or startup failure raises
  an error at `await`. `try/catch` handles it. Without a catch, the process
  exits.
- A returned `Result<T>` is a normal task value, not an implicit task failure.
- Parameters are copied by value into the task context. Pointer-backed values
  still share storage, so programs must synchronize shared mutation.
- Async functions cannot be `main` or be passed to `startThread`. Unawaited
  task threads are joined during process shutdown.

### Extern Functions

`extern` declares a native symbol for runtime linking. This allows calling C
functions from Lumen:

```lumen
extern "printf"
```

The declared symbol must exist in the linked C runtime or system libraries.

## Imports

Imports bring symbols in from named modules:

```lumen
import { println, len } from "system"
import { readFile } from "fs"
import { serveFiles } from "http"
import { createSemaphore } from "thread"
```

Available modules and their exports:

| Module | Exports |
| --- | --- |
| `system` | `println`, `len`, `min`, `max`, `filter`, `includes`, `uuid`, `date`, `env`, `encrypt`, `decrypt`, `arg`, `argCount`, `map`, `mapGet`, `mapHas`, `ok`, `err`, `isOk`, `resultValue`, `errorMessage`, `some`, `none`, `hasValue`, `valueOr`, `assert`, `channel`, `send`, `receive`, `json`, `jsonGet`, `jsonGetRaw`, `jsonSet`, `jsonSetPath`, `jsonQuote`, `jsonStringify`, `jsonValid`, `newError`, `errorCode`, `errorText`, `arraySum`, `arrayFirst`, `arrayLast`, `arrayJoin`, `exec`, `sourceSnippet`, `stringBuilder`, `stringBuilderAppend`, `stringLen`, `stringEquals`, `trim`, `lower`, `upper`, `startsWith`, `endsWith`, `replace`, `split`, `indexOf`, `lastIndexOf`, `contains`, `repeat`, `padStart`, `padEnd`, `intToString`, `stringToInt`, `parseI32`, `parseF32`, `list`, `listPush`, `listGet`, `listLen`, `mapSet`, `mapDelete`, `mapKeys`, `arenaNew`, `arenaAppend`, `arenaLen`, `arenaSetString`, `arenaSetI32`, `arenaGetString`, `arenaGetI32`, `tokenizeSource`, `parseSummary`, `compilerImage` |
| `fs` | `readFile`, `writeFile` |
| `http` | `serveFiles`, `serveApi`, `serveHttp`, `serveSocketIoChat`, `socketIoEvent`, `socketIoEmit`, `httpRequest`, `httpResponse` |
| `thread` | `createSemaphore`, `semaphoreWait`, `semaphoreSignal`, `startThread`, `joinThread`, `appendFile` |

### Local File Imports

Import from a relative path to another Lumen file:

```lumen
import { triple } from "./modules/math.lm"
```

The module graph resolves the file, parses it separately, and makes only the
explicitly imported names available. Import cycles are detected and rejected.

## The Module Graph

When the compiler encounters an import, it:

1. **Resolves** the import to a canonical file path (relative imports become
   absolute paths; module imports map to known modules)
2. **Parses** the imported file independently
3. **Deduplicates** — each file is loaded only once
4. **Detects cycles** — circular imports produce an error
5. **Isolates names** — only the symbols listed in the import are visible;
   symbols private to the dependency are not accessible

This means two files can both import the same module without duplication, and
no file can accidentally depend on a transitive dependency's internal symbols.

## Expressions

Lumen compiles these expression forms:

| Category | Operators / Forms |
| --- | --- |
| Assignment | `x = value` |
| Arithmetic | `+`, `-`, `*`, `/`, `%` |
| Comparison | `<`, `<=`, `>`, `>=`, `==`, `!=` |
| Increment | `i++` |
| Function call | `add(1, 2)` |
| String concat | `"a" + "b"` |
| Interpolation | `"hello ${name}"` |
| Struct literal | `Point { x: 4, y: 7 }` |
| Array literal | `[1, 2, 3]` |
| Index access | `arr[0]`, `point.x` |
| Match expression | `match x { ... }` |
| Slice | `"text"[1..4]` |

### Semicolons

Semicolons at statement ends are **optional**:

```lumen
let x = 1        // no semicolon needed
let y = 2
println(x + y)
```

The one exception: classic `for` loop headers **require** semicolons between
the three clauses:

```lumen
for (let i: i32 = 0; i < 10; i++) {   // semicolons required here
  println(i)
}
```

## Assignment

Variables, struct fields, and array elements can all be assigned:

```lumen
// variable assignment
total = total + 1

// struct field assignment
point.x = 4

// array element assignment
values[0] = 8
```

Assignment uses the `=` operator. The right side is evaluated first, then the
result is stored in the left side.

## Newline Continuation

Lumen allows expressions to continue across lines when the first line ends
with an incomplete expression. This makes multi-line calls readable:

```lumen
let result = add(
  1,
  2
)
```

The parser detects that `add(` is incomplete and continues reading the next
line.

## Missing

- **More type inference** — today type annotations are needed in many places
  where they could be inferred.
- **User-defined generic types** — generics are currently only available on the
  built-in `Result<T>`, `Task<T>`, and `Map<K,V>`.
- **Stronger numeric conversion rules** — implicit conversions between `i32`,
  `i64`, and `f32` are not fully defined.
- **Expression wrapper cleanup** — semantic analysis, type checking, IR, and
  code generation consume parsed expression nodes, but statement fields still
  carry a `RawExpression` wrapper around those nodes.
- **Function overloading** — no mechanism for multiple functions with the same
  name and different parameter types.
