# Errors, Results, And Options

## Errors

```lumen
let failure: error = newError(7, "disk locked")
println(errorCode(failure))
println(errorText(failure))
```

## Result

```lumen
let good: Result<string> = ok("ready")
let bad: Result<string> = err("missing")

println(isOk(good))
println(errorMessage(bad))
```

## Option

```lumen
let name: string? = some("lumen")
let empty: string? = none()

println(valueOr(name, "fallback"))
println(valueOr(empty, "fallback"))
```

## Missing

- Result and Option need stronger type checking
- Pattern matching with Result/Option needs examples
- Throw/catch docs need expansion
- Error handling should become less string-backed

