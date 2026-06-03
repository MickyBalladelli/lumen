# Collections And Structs

## Arrays

```lumen
let values: i32[] = [2, 3, 5]

println(values[0])
println(len(values))
```

Helpers:

```lumen
println(arraySum(values))
println(arrayFirst(values))
println(arrayLast(values))
```

## Structs

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

## Maps And Lists

Bootstrap helpers use string-backed maps and lists:

```lumen
let tokens = list()
tokens = listPush(tokens, "function")
println(listGet(tokens, 0))
```

## Missing

- Self-host compiler still rejects `struct`
- Generic collection types are runtime-backed, not full typed containers
- Dynamic arrays need stronger language-level support
- More mutation helpers need docs

