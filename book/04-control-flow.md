# Control Flow

## If / Else

```lumen
if total > 10 {
  println("large")
} else {
  println("small")
}
```

`if`/`else` branches compile to native control flow.

## For (Classic)

Classic `for` loops compile to native code. Semicolons are required inside the
`for (...)` header.

```lumen
for (let i: i32 = 0; i < 5; i++) {
  println(i)
}
```

## For-Of

For-of loops iterate over arrays:

```lumen
for (let value of values) {
  total = total + value
}
```

They also work with arrays of structs:

```lumen
for (let point of points) {
  total = total + point.y
}
```

`filter` can be used in for-of with a JS-like arrow predicate:

```lumen
for (let value of filter(values, value => value > 2)) {
  total = total + value
}
```

Current filter lowering is a view over the source array inside `for-of`.

## Range Loop

Range loops count upward from start to end, excluding the end:

```lumen
for i in 0..10 {
  println(i)
}
```

## While-Do

While-do loops run while the condition is true:

```lumen
let i: i32 = 0

while i < 4 do {
  println(i)
  i++
}
```

## Do-Until

Do-until loops run the body first, then stop once the condition is true:

```lumen
do {
  total = total + 1
} until total == 10
```

## Break And Continue

Use `break` and `continue` inside loops:

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

## Match

`match` is expression-style branching that returns a value:

```lumen
let label = match status {
  Ok => "ok"
  Missing => "missing"
  _ => "unknown"
}
```

## Switch

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

## Defer

`defer` schedules a statement to run when the enclosing block exits:

```lumen
{
  defer println("done")
  println("working")
}
```

## Missing

- Self-host compiler only supports a narrow while shape
- More complete `match` docs
- Loop labels
- Cleaner parser errors for malformed loops
- Pattern matching with Result/Option needs examples