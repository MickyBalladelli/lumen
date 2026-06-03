# Strings, JSON, And Helpers

## Strings

```lumen
let name = "lumen"
println("hello ${name}")
println("hello " + name)
println("lumen"[1..4])
```

Useful helpers:

```lumen
println(stringLen("hello"))
println(stringEquals("a", "a"))
println(includes("lumen language", "lumen"))
```

## JSON

```lumen
let payload: json = json('{"name":"lumen","count":3}')
let next = jsonSet(payload, "ready", "true")

println(jsonGet(next, "name"))
println(jsonGet(next, "ready"))
```

## Missing

- Escape sequence handling is small
- JSON typing is loose
- More examples for nested JSON paths
- More string helper docs

