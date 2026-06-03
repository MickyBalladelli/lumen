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

Useful types:

- `i32`
- `i64`
- `f32`
- `bool`
- `string`
- `json`
- `error`
- `T?`
- `Result<T>`
- `void`

## Missing

- More type inference
- User-defined generic types
- Stronger numeric conversion rules
- Better function overload story

