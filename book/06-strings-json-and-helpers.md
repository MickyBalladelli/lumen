# Strings, JSON, And Helpers

## Strings

```lumen
let name = "lumen"
println("hello ${name}")
println("hello " + name)
```

String interpolation and concatenation work in expressions:

```lumen
let label = "hello " + "lumen"
let greeting = "hello ${name}"
```

String slice syntax:

```lumen
let part = "lumen"[1..4]
```

String helpers:

```lumen
println(stringLen("hello"))
println(stringEquals("a", "a"))
println(includes("lumen language", "lumen"))
```

`includes` also works with arrays:

```lumen
println(includes(values, 4))
```

Runtime bounds checking applies to string indexing and slicing.

## JSON

```lumen
let payload: json = json('{"name":"lumen","count":3}')
let next = jsonSet(payload, "ready", "true")

println(jsonGet(next, "name"))
println(jsonGet(next, "ready"))
println(jsonGetRaw(next, "count"))
println(jsonValid(payload))
```

JSON path helpers:

```lumen
let updated = jsonSetPath(payload, "nested.key", "value")
let quoted = jsonQuote("hello")
let text = jsonStringify(payload)
```

## System Helpers

`println(...)` prints a value and adds a newline. It lowers to native `printf`
in the LLVM backend.

```lumen
println("hello")
println(total)
println(ratio)
println(total < 10)
```

`min(...)` and `max(...)` return the smaller or larger numeric value:

```lumen
println(min(9, 4))
println(max(9, 4))
```

`uuid()` returns a UUID-like string:

```lumen
let id = uuid()
println(id)
```

`date()` returns the current local date and time as a string formatted like
`YYYY-MM-DD HH:MM:SS`:

```lumen
println(date())
```

`assert(condition, message?)` fails fast when a condition is false:

```lumen
assert(total == 6, "bad total")
```

## Encryption

`encrypt(value, key, protocol?)` encrypts a string and returns a portable
encoded string. `decrypt(value, key, protocol?)` reverses it.

```lumen
let encrypted = encrypt("hello lumen", "correct horse battery staple")
let decrypted = decrypt(encrypted, "correct horse battery staple")

println(includes(encrypted, "lumen:v1"))
println(decrypted)
```

The default protocol is `AES-256`, implemented as `AES-256-CTR-HMAC-SHA256`
with PBKDF2 key derivation, random salt, random nonce, and authentication
before decrypt.

## Compiler Bootstrap Helpers

`tokenizeSource(source)` and `parseSummary(source)` are Lumen-callable compiler
bootstrap helpers:

```lumen
let tokens = tokenizeSource(source)
let summary = parseSummary(source)
```

`sourceSnippet(source, line, column)` creates a diagnostic line plus caret.

## Missing

- Escape sequence handling is small
- JSON typing is loose
- More examples for nested JSON paths
- More string helper docs
- Linux support for crypto (currently macOS-only)