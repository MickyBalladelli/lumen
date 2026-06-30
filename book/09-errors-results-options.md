# Errors, Results, And Options

## Errors

Typed errors carry a code and a message:

```lumen
let failure: error = newError(7, "disk locked")
println(errorCode(failure))
println(errorText(failure))
```

## Throw / Catch

`try/catch` catches Lumen `throw` values. This is branch-based Lumen control
flow, not native exception unwinding.

```lumen
try {
  throw "boom"
} catch error {
  println(error)
}
```

Current throw values must be strings.

## Result

Result helpers wrap success and failure:

```lumen
let good: Result<string> = ok("ready")
let bad: Result<string> = err("missing")

println(isOk(good))
println(errorMessage(bad))
```

Access the value from an ok result:

```lumen
let value = resultValue(good)
```

## Option

Option helpers wrap nullable values:

```lumen
let name: string? = some("lumen")
let empty: string? = none()

println(valueOr(name, "fallback"))
println(valueOr(empty, "fallback"))
println(hasValue(name))
```

## Missing

- Result and Option need stronger type checking
- Pattern matching with Result/Option needs examples
- Throw/catch docs need expansion
- Error handling should become less string-backed
- Replace empty-string and integer error sentinels with typed errors across
  file, environment, crypto, JSON, process, thread, and HTTP operations