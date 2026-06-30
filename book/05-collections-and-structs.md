# Collections And Structs

## Arrays

Arrays hold a fixed list of values with the same element type.

```lumen
let values: i32[] = [2, 3, 5]

println(values[0])
println(len(values))
```

Arrays can also hold structs:

```lumen
let points: Point[] = [
  Point { x: 4, y: 7 },
  Point { x: 1, y: 9 }
]

println(points[1].y)
```

Empty array literals work with annotated array types:

```lumen
let empty: i32[] = []
```

Array helpers:

```lumen
println(arraySum(values))
println(arrayFirst(values))
println(arrayLast(values))
println(arrayJoin(names, ","))
```

Array elements can be assigned by index:

```lumen
values[0] = 8
```

Runtime bounds checking is applied to array reads, writes, and loop indices.

## Structs

Structs define a fixed object shape. They compile to LLVM aggregate types.

```lumen
struct Point {
  x: i32
  y: i32
}

function main(): i32 {
  let point = Point { x: 4, y: 7 }
  println(point.x + point.y)
  return 0
}
```

Struct fields can be assigned:

```lumen
point.x = 4
```

## Enums

Enums define named integer-backed variants:

```lumen
enum Status {
  Ok
  Missing
  Broken
}

let status: Status = Missing
```

Enums work with `match` and `switch` expressions.

## Maps And Lists

Bootstrap helpers use string-backed maps and lists for compiler symbol tables:

```lumen
let headers = map("content-type", "application/json", "x-lumen", "yes")
println(mapGet(headers, "content-type"))
println(mapHas(headers, "x-lumen"))
```

Mutation helpers: `mapSet(...)`, `mapDelete(...)`, and `mapKeys(...)`.

```lumen
let symbols = map("main", "function")
symbols = mapSet(symbols, "total", "i32")
println(mapGet(symbols, "total"))
```

Dynamic list helpers:

```lumen
let tokens = list()
tokens = listPush(tokens, "function")
println(listGet(tokens, 0))
println(listLen(tokens))
```

## String Builder

The compiler uses `stringBuilder()` and `stringBuilderAppend(...)` for text
emission:

```lumen
let out = stringBuilder()
out = stringBuilderAppend(out, "define ")
```

## Channels

`channel()`, `send(...)`, and `receive(...)` provide a small message-passing
foundation for thread communication:

```lumen
let messages = channel()
send(messages, "ready")
println(receive(messages))
```

## Missing

- Self-host compiler still rejects `struct` in some paths
- Generic collection types are runtime-backed, not full typed containers
- Dynamic arrays need stronger language-level support
- More mutation helpers need docs
- Map<K,V> and Result<T> generics need stronger type checking