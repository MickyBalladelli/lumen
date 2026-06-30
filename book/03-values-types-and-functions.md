# Values, Types, And Functions

Use `let` for mutable values and `const` for fixed values.

```lumen
function add(left: i32, right: i32): i32 {
  return left + right
}

function main(): i32 {
  let total: i32 = add(1, 2)
  const label = "total"

  println(label)
  println(total)

  return total
}
```

Type annotations are optional in simple cases, but native examples should use
`main(): i32`.

## Built-in Types

- `i32`: 32-bit integer
- `i64`: 64-bit integer
- `f32`: 32-bit floating point number
- `bool`: boolean value
- `string`: string value for printing
- `json`: runtime JSON text with helper accessors
- `error`: typed runtime error payload
- `T?`: nullable option-shaped value
- `Result<T>`: generic result type
- `Map<K,V>`: generic runtime-backed map
- `void`: no value

```lumen
let count: i32 = 3
let big: i64 = 10000000000
let ratio: f32 = 1.5 + 2.25
let ready: bool = true
let name: string = "lumen"
let payload: json = json('{"name":"lumen","count":3}')
let failure: error = newError(7, "disk locked")
let maybe: string? = none()
let outcome: Result<string> = ok("ready")
```

## Functions

Functions use the `function` keyword. User-defined functions can call other
user-defined functions.

```lumen
function add(left: i32, right: i32): i32 {
  return left + right
}

function main(): i32 {
  return add(1, 2)
}
```

### Async Functions

`async function` and `await` are accepted as source-level markers. Today they
lower synchronously; the syntax is reserved for the future async runtime.

```lumen
async function value(): i32 {
  return 4
}

let answer = await value()
```

### Extern Functions

Extern declarations reserve native function symbols for runtime linking:

```lumen
extern "printf"
```

## Imports

Import declarations bring in symbols from modules:

```lumen
import { println } from "system"
```

Available modules today: `system`, `fs`, `http`, and `thread`.

Local file imports resolve relative paths:

```lumen
import { triple } from "./modules/math.lm"
```

The module graph parses imports separately, resolves by canonical path, rejects
cycles, honors package export lists, and keeps dependency-private names isolated.

## Expressions

Current compiled expressions support:

- assignment: `total = total + i`
- arithmetic: `+`, `-`, `*`, `/`, `%`
- comparisons: `<`, `<=`, `>`, `>=`, `==`, `!=`
- increment: `i++`
- user function calls: `add(1, 2)`

Semicolons are optional at statement ends. Classic `for` loops still require
semicolons inside the header.

## Assignment

Variables, struct fields, and array elements can be assigned:

```lumen
point.x = 4
values[0] = 8
```

## Missing

- More type inference
- User-defined generic types
- Stronger numeric conversion rules
- Full expression AST (currently uses token-shape heuristics)
- Async runtime implementation
- Stronger type checker with boolean conditions, return-on-all-paths