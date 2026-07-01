# Errors, Results, And Options

This chapter covers Lumen's error handling mechanisms: typed errors,
`throw`/`catch`, Result types for success/failure, and Option types for
nullable values.

## Typed Errors

Lumen has a first-class `error` type that carries a numeric code and a text
message:

```lumen
let failure: error = newError(7, "disk locked")
println(errorCode(failure))   // "7"
println(errorText(failure))   // "disk locked"
```

### Error Helpers

| Helper | Description | Example |
| --- | --- | --- |
| `newError(code, message)` | Creates a typed error | `newError(7, "disk locked")` |
| `errorCode(error)` | Returns the error code as a string | `errorCode(failure)` → `"7"` |
| `errorText(error)` | Returns the error message | `errorText(failure)` → `"disk locked"` |

Error codes are integers. By convention, use distinct codes for different
error categories (e.g., 1-9 for I/O, 10-19 for parsing, 20-29 for network).

### When To Use Typed Errors

Typed errors are useful when:
- You need to programmatically distinguish between error kinds
- You want to attach structured metadata (code) to an error
- The error might be handled differently based on its code

Fallible standard-library operations return `Result<T>`, including file,
environment, crypto, JSON, process, thread, and HTTP operations.

## `throw` And `catch`

Lumen has `throw`/`catch` for control-flow-based error handling. This is
**branch-based Lumen control flow**, not native C++/Java-style exception
unwinding. There is no stack unwinding, no destructor calling, and no
performance overhead from exception tables.

### Basic Throw/Catch

```lumen
try {
  throw "boom"
} catch error {
  println(error)       // "boom"
}
```

- `throw value` transfers control to the nearest enclosing `catch` block
- `catch error` binds the thrown value to the variable named `error`
- After the `catch` block executes, execution continues after the `try/catch`

### Throw Values

Currently, `throw` accepts string values:

```lumen
throw "file not found"
throw "connection refused"
throw "validation failed: ${reason}"
```

You can throw any string — error messages, codes, or descriptive text. The
self-host compiler supports `throw` of strings in its try/catch lowering.

### Nested Try/Catch

```lumen
try {
  try {
    throw "inner"
  } catch error {
    println("caught inner: ${error}")
    throw "outer"
  }
} catch error {
  println("caught outer: ${error}")
}
```

Output:
```text
caught inner: inner
caught outer: outer
```

Each `throw` unwinds to the nearest enclosing `catch` at the same nesting level.

### Catch-All Pattern

The `catch` variable is mandatory — you must name a variable to receive the
thrown value. There is no catch-all without a variable.

### Throw/Catch Under The Hood

Throw/catch compiles to LLVM branches, not exception handling tables. When the
compiler encounters `throw`, it:
1. Stores the thrown value
2. Branches to the catch block's basic block
3. The catch block reads the stored value and executes its body

This means there is zero cost for the happy path (no `throw` executed), and the
throw path is a simple branch. The trade-off is that `throw` cannot cross
function boundaries — it must be caught within the same function.

### Limitations

- **Values must be strings** — you cannot throw typed errors, integers, or
  other types.
- **No cross-function unwinding** — `throw` only works within the same function.
  Functions that call other functions that throw must manually propagate errors.
- **No finally** — there is no `finally` block for cleanup that runs regardless
  of whether a throw occurred. Use `defer` instead.

## Result Type

The Result type represents either a success value (`ok`) or a failure value
(`err`). It is a runtime-backed generic type: `Result<T>`.

### Creating Results

```lumen
let good: Result<string> = ok("ready")
let bad: Result<string> = err("missing")
```

- `ok(value)` creates a success result wrapping the value
- `err(message)` creates a failure result with an error message

### Checking Results

```lumen
println(isOk(good))              // "true"
println(isOk(bad))               // "false"
```

`isOk(result)` returns `"true"` or `"false"` as a string.

### Extracting Values

```lumen
println(resultValue(good))       // "ready"
println(errorMessage(bad))       // "missing"
```

- `resultValue(result)` extracts the value from an ok result. Behavior is
  undefined if called on an err result — check with `isOk` first.
- `errorMessage(result)` extracts the error message from an err result.

### Result Pattern

The typical usage pattern:

```lumen
function findUser(id: string): Result<string> {
  if id == "admin" {
    return ok("Admin User")
  }

  return err("user not found")
}

function main(): i32 {
  let user = findUser("admin")

  if isOk(user) == "true" {
    println("found: ${resultValue(user)}")
    return 0
  }

  println("error: ${errorMessage(user)}")
  return 1
}
```

### Result Limitations

- **Result is string-backed** — `Result<T>` syntax exists but both success
  values and error messages are strings. The type parameter `T` is not yet
  enforced by the type checker.
- **No pattern matching** — you must check `isOk` imperatively. There is no
  `match` on Result variants.
- **No chaining** — no `map`, `andThen`, or `orElse` for Result composition.
- **Type safety** — nothing prevents you from calling `resultValue` on an err
  result or `errorMessage` on an ok result.

## Option Type

The Option type represents a value that may or may not be present. It uses the
syntax `T?` for the type annotation and `some(value)`/`none()` for values.

### Creating Options

```lumen
let name: string? = some("lumen")
let empty: string? = none()
```

- `some(value)` wraps a present value
- `none()` represents absence

### Checking Options

```lumen
println(hasValue(name))    // "true"
println(hasValue(empty))   // "false"
```

`hasValue(option)` returns `"true"` or `"false"` as a string.

### Extracting Values

```lumen
println(valueOr(name, "fallback"))    // "lumen"
println(valueOr(empty, "fallback"))   // "fallback"
```

`valueOr(option, fallback)` returns the wrapped value if present, or the
fallback value if the option is `none()`.

### Option Pattern

```lumen
function findConfig(key: string): string? {
  if key == "port" {
    return some("8080")
  }

  return none()
}

function main(): i32 {
  let port = valueOr(findConfig("port"), "3000")
  println(port)   // "8080"
  return 0
}
```

### Option Limitations

- **String-backed** — all option values are strings regardless of the `T?`
  annotation.
- **No pattern matching** — no `match` on `some`/`none` variants.
- **No chaining** — no `map`, `andThen`, or `filter` for options.
- **Type annotations are documentation** — `T?` syntax is accepted but the
  type parameter is not enforced.

## Comparison: Errors vs Result vs Option

| Feature | When To Use |
| --- | --- |
| **Typed errors** (`error`) | When you need structured error metadata (code + message) |
| **`throw`/`catch`** | For immediate control flow within a function, when you want to jump to an error handler |
| **`Result<T>`** | When a function can either succeed with a value or fail with a message; the caller decides how to handle |
| **`Option<T>`** (`T?`) | When a value may or may not be present; there is no error message, just presence/absence |

In practice, many Lumen examples use a mix: `Result` for functions that can
fail, `throw`/`catch` for early-exit error handling within a function, and
`Option` for optional configuration or lookup results.

## Error Handling In The Standard Library

The standard library uses `Result<T>` for fallible operations. For example,
`readFile` returns `ok("")` for an empty file and an error for a missing file.
Use `isOk`, `resultValue`, and `errorMessage` to handle the result.

## Missing

- **Result/Option type checking** — the type parameters `T` in `Result<T>` and
  `T?` are not enforced.
- **Pattern matching** — no `match` on Result or Option variants. Checking
  requires imperative `isOk`/`hasValue` calls.
- **Chaining/composition** — no `map`, `andThen`, `orElse`, `unwrap`, or
  `expect` for Result and Option.
- **Throw value types** — only strings can be thrown. Cannot throw `error`
  objects or other types.
- **Cross-function throw** — throw cannot propagate up the call stack. Manual
  propagation required.
- **No finally** — use `defer` for cleanup that must run regardless of throw.
