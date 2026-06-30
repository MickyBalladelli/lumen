# Control Flow

Lumen provides six loop forms, three branching constructs, and `defer` for
cleanup. All control flow compiles to native branches and jumps — there is no
interpreter overhead.

## `if` / `else`

`if` evaluates a condition and takes one of two branches:

```lumen
if total > 10 {
  println("large")
} else {
  println("small")
}
```

The condition must be a `bool` expression. The `else` branch is optional:

```lumen
if ready {
  println("go")
}
```

`if`/`else` can be chained:

```lumen
if score >= 90 {
  println("A")
} else if score >= 80 {
  println("B")
} else {
  println("C")
}
```

At the LLVM level, `if`/`else` becomes a conditional branch with two basic
blocks. There is no truthiness coercion — you must write an explicit boolean
condition. (Note: the current type checker does not yet enforce that conditions
are `bool`; this is a known missing feature.)

## Classic `for` Loop

The classic C-style `for` loop has three clauses: initializer, condition, and
increment. Semicolons **must** separate the clauses inside the header:

```lumen
for (let i: i32 = 0; i < 5; i++) {
  println(i)
}
```

Output:
```text
0
1
2
3
4
```

**Execution order:**
1. Run the initializer (`let i: i32 = 0`) once
2. Evaluate the condition (`i < 5`). If false, exit the loop
3. Execute the body
4. Run the increment (`i++`)
5. Go to step 2

The initializer can declare a new variable with `let` or use an existing one.
The condition must be a comparison expression. The increment is typically
`i++` but can be any assignment.

## `for-of` Loop

`for-of` iterates over every element in an array:

```lumen
let values: i32[] = [10, 20, 30]
let total: i32 = 0

for (let value of values) {
  total = total + value
}

println(total)   // 60
```

The loop variable (`value`) takes each element's value in order. It is
read-only within the body — you can't assign to it.

`for-of` works with arrays of structs:

```lumen
struct Point {
  x: i32
  y: i32
}

let points: Point[] = [
  Point { x: 1, y: 2 },
  Point { x: 3, y: 4 }
]

for (let point of points) {
  println(point.y)    // prints 2, then 4
}
```

### `filter` With `for-of`

`filter` creates a view over an array, selecting only elements that match a
predicate:

```lumen
let values: i32[] = [1, 2, 3, 4, 5]
let total: i32 = 0

for (let value of filter(values, value => value > 2)) {
  println(value)         // prints 3, 4, 5
  total = total + value
}

println(total)           // 12
```

The predicate is a JS-like arrow function: `param => boolean_expression`.
Current filter lowering creates a view over the source array inside `for-of`
— it does not allocate a new array.

## Range Loop

Range loops count upward from a start value to an end value (exclusive):

```lumen
let total: i32 = 0

for i in 0..4 {
  total = total + i
}

println(total)   // 6  (0 + 1 + 2 + 3)
```

The syntax is `start..end`. The loop runs with `i` taking values `start`,
`start + 1`, ..., `end - 1`. The loop variable is implicitly typed as `i32`.

Range loops are syntactic sugar for a classic `for` loop. `for i in 0..4` is
equivalent to `for (let i: i32 = 0; i < 4; i++)`.

## `while-do` Loop

`while-do` checks a condition before each iteration:

```lumen
let i: i32 = 0

while i < 4 do {
  println(i)
  i++
}
```

Output:
```text
0
1
2
3
```

If the condition is false on the first check, the body never runs.

## `do-until` Loop

`do-until` runs the body first, then checks a stop condition:

```lumen
let total: i32 = 0

do {
  total = total + 1
} until total == 10

println(total)   // 10
```

The body always runs at least once. The loop stops when the condition becomes
**true** (unlike `while` which runs while the condition is true).

## `break` And `continue`

`break` exits the innermost loop immediately. `continue` skips the rest of the
current iteration and jumps to the next condition check.

```lumen
for (let i: i32 = 0; i < 10; i++) {
  if i == 2 {
    continue     // skip the rest when i == 2
  }

  if i == 5 {
    break        // exit the loop when i == 5
  }

  println(i)
}
```

Output:
```text
0
1
3
4
```

- When `i == 2`, `continue` skips the `println` and goes to `i++`
- When `i == 5`, `break` exits the loop entirely

`break` and `continue` work inside all loop forms: classic `for`, `for-of`,
range loops, `while-do`, and `do-until`. The self-host compiler's semantic
analyzer checks that `break` and `continue` only appear inside valid
control-flow regions.

## `match` Expression

`match` is an expression that returns a value. It branches on a value (usually
an enum or an integer) and evaluates one arm:

```lumen
enum Status {
  Ok
  Missing
  Broken
}

let status: Status = Missing

let label = match status {
  Ok => "ok"
  Missing => "missing"
  _ => "unknown"
}

println(label)   // "missing"
```

**How `match` works:**
- The expression after `match` is evaluated once
- Each arm has a pattern on the left of `=>` and a value expression on the
  right
- Arms are checked in order. The first matching arm's value is returned
- `_` is the wildcard pattern — it matches anything, so it should be last
- All arms must return values of the same type

For enums, variant names are used directly as patterns. For integers, you can
use numeric literals. The wildcard `_` catches any unmatched cases.

`match` can be used anywhere an expression is expected — variable
initialization, `return`, function arguments, etc.

## `switch` Statement

`switch` is a statement (not an expression) that branches on numeric, boolean,
or string values. Each case has a block body. `break` exits the switch:

```lumen
switch value {
  case 1 {
    println("one")
  }
  case 2 {
    println("two")
    break
  }
  case 3 {
    println("three")
  }
  default {
    println("many")
  }
}
```

**How `switch` works:**
- The expression after `switch` is evaluated once
- Each `case` value is compared in order
- When a match is found, execution enters that case's block
- **Fallthrough does not occur** — each case block is self-contained
- `break` inside a case exits the entire switch
- `default` catches any unmatched values (optional but recommended)

`switch` matches string values:

```lumen
switch command {
  case "start" {
    println("starting")
  }
  case "stop" {
    println("stopping")
    break
  }
  default {
    println("unknown command")
  }
}
```

And boolean values:

```lumen
switch ready {
  case true {
    println("go")
  }
  case false {
    println("wait")
  }
}
```

## `defer` Statement

`defer` schedules a statement to run when the enclosing block exits — whether
by reaching the end, by `return`, or by `break`/`continue`:

```lumen
function process(): void {
  defer println("cleanup")
  println("working")
}
```

Output:
```text
working
cleanup
```

The deferred statement runs in LIFO order (last-deferred runs first) when the
block scope ends. This is useful for resource cleanup, logging, or ensuring an
action always happens regardless of how a function exits.

```lumen
function main(): i32 {
  defer println("exiting main")

  if true {
    return 0      // "exiting main" prints before the return
  }

  return 1
}
```

## Control Flow Under The Hood

All control flow constructs compile directly to LLVM branches and basic blocks:

- `if`/`else` becomes a conditional branch (LLVM `br i1`)
- Loops become a pre-header block, a condition check block, a body block, and a
  latch block with a branch back to the condition
- `match` becomes a chain of comparisons followed by a select/phi node for the
  result value
- `switch` becomes a chain of comparisons with branches to case blocks
- `defer` inserts a call at every exit point from the enclosing block

There is no garbage collection, no boxing, and no interpreter loop. The
performance is close to what you'd get writing the equivalent C code.

## Missing

- **Loop labels** — no way to `break` or `continue` an outer loop from a nested
  loop.
- **Type checker enforcement** — `if` and loop conditions should be validated
  as `bool` by the type checker.
- **Self-host compiler limitations** — the self-host compiler currently only
  supports a narrow `while` shape.
- **Pattern matching** — `match` matches enum variants and literals, but not
  struct fields, nested patterns, or guards (`if` clauses on arms).
- **Parser errors** — malformed loop headers can produce confusing error
  messages.