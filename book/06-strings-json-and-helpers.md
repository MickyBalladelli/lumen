# Strings, JSON, And Helpers

This chapter covers the string and JSON types, all system helper functions,
encryption, and the compiler bootstrap helpers that let Lumen programs
tokenize and parse Lumen source.

## Strings In Depth

### Creating Strings

String literals use double quotes:

```lumen
let name = "lumen"
let empty = ""
```

### Interpolation

Embed expressions inside strings with `${...}`:

```lumen
let name = "lumen"
let greeting = "hello ${name}"        // "hello lumen"

let count: i32 = 3
let label = "total: ${count}"         // "total: 3"
```

The expression inside `${}` is evaluated and its string representation is
inserted. Interpolation works in any string context — variable initialization,
function arguments, and inside `println`.

### Concatenation

Join strings with `+`:

```lumen
let label = "hello " + "lumen"        // "hello lumen"
let full = "a" + "b" + "c"            // "abc"
```

### Slicing

Extract a substring with `[start..end]`:

```lumen
let text = "lumen"
let part = text[1..4]                 // "ume"
```

The start index is inclusive, the end index is exclusive. Both indices are
bounds-checked at runtime.

### String Helpers

Every string helper operates on strings and returns strings or integers:

#### Length And Comparison

| Helper | Description | Example |
| --- | --- | --- |
| `stringLen(s)` | Number of characters | `stringLen("hi")` → `2` |
| `stringEquals(a, b)` | Equality check | `stringEquals("a", "a")` → `"true"` |

#### Case Conversion

| Helper | Description | Example |
| --- | --- | --- |
| `lower(s)` | Convert to lowercase | `lower("Hello")` → `"hello"` |
| `upper(s)` | Convert to uppercase | `upper("Hello")` → `"HELLO"` |

#### Whitespace

| Helper | Description | Example |
| --- | --- | --- |
| `trim(s)` | Remove leading/trailing whitespace | `trim(" hi ")` → `"hi"` |

#### Searching And Checking

| Helper | Description | Example |
| --- | --- | --- |
| `startsWith(s, prefix)` | Check prefix | `startsWith("lumen.v1:", "lumen")` → `"true"` |
| `endsWith(s, suffix)` | Check suffix | `endsWith("hello.lm", ".lm")` → `"true"` |
| `indexOf(s, sub)` | First occurrence index | `indexOf("abc", "b")` → `1` |
| `lastIndexOf(s, sub)` | Last occurrence index | `lastIndexOf("aba", "a")` → `2` |
| `contains(s, sub)` | Substring check | `contains("hello", "ell")` → `"true"` |
| `includes(s, sub)` | Same as contains | `includes("lumen", "ume")` → `"true"` |

`includes` also works with arrays. For arrays, it checks if an element exists:

```lumen
let values: i32[] = [1, 2, 3]
println(includes(values, 2))   // "true"
println(includes(values, 9))   // "false"
```

#### Mutation

These helpers return new strings:

| Helper | Description | Example |
| --- | --- | --- |
| `replace(s, old, new)` | Replace occurrences | `replace("a,b", ",", ";")` → `"a;b"` |
| `split(s, sep)` | Split by separator | `split("a,b", ",")` → `"a|b"` |
| `repeat(s, n)` | Repeat n times | `repeat("ha", 3)` → `"hahaha"` |
| `padStart(s, len, char)` | Pad to length at start | `padStart("7", 3, "0")` → `"007"` |
| `padEnd(s, len, char)` | Pad to length at end | `padEnd("7", 3, "0")` → `"700"` |

Notes:
- `split` currently returns a pipe-delimited string, not an array
- `replace` replaces all occurrences
- Repeat count is an integer; padding is character-based

#### Type Conversion

| Helper | Description | Example |
| --- | --- | --- |
| `intToString(n)` | Integer to string | `intToString(42)` → `"42"` |
| `stringToInt(s)` | String to integer | `stringToInt("42")` → `42` |
| `parseI32(s)` | Parse as i32 | `parseI32("42")` → `42` |
| `parseF32(s)` | Parse as f32 | `parseF32("3.14")` → `3.14` |

#### String Builder

For incremental text construction (used by the compiler):

```lumen
let out = stringBuilder()
out = stringBuilderAppend(out, "define i32 @main() {\n")
out = stringBuilderAppend(out, "  ret i32 0\n")
out = stringBuilderAppend(out, "}")
```

## JSON

JSON is a first-class type in Lumen. Values of type `json` hold runtime JSON
text with accessor helpers.

### Creating JSON

```lumen
let payload: json = json('{"name":"lumen","count":3}')
```

Use single quotes for the outer string to avoid escaping inner double quotes.
The `json()` helper parses the JSON string into a runtime value.

### Reading Fields

```lumen
println(jsonGet(payload, "name"))     // "lumen"
println(jsonGet(payload, "count"))    // "3"
```

`jsonGet` returns the field value as a string. For nested JSON objects, the
value is returned as a JSON string that you can `jsonGet` again.

`jsonGetRaw` returns the raw value without JSON quoting:

```lumen
println(jsonGetRaw(payload, "count"))  // 3 (as a number)
```

### Setting Fields

```lumen
let next = jsonSet(payload, "ready", "true")
println(jsonGet(next, "ready"))       // "true"
```

`jsonSet` returns a new JSON value with the field added or updated. The
original value is not modified.

### Nested Paths

`jsonSetPath` sets a value at a dot-separated nested path:

```lumen
let deep = json('{"a":{"b":1}}')
let updated = jsonSetPath(deep, "a.c", "2")
```

### Validation And Serialization

```lumen
println(jsonValid(payload))            // "true" or "false"
println(jsonStringify(payload))        // compact JSON string
println(jsonQuote("hello"))            // "\"hello\""
```

- `jsonValid(...)` checks if a string or JSON value is valid JSON
- `jsonStringify(...)` converts a JSON value to a compact JSON string
- `jsonQuote(...)` escapes and quotes a string for JSON embedding

### JSON Limitations

- JSON typing is loose — field values are returned as strings regardless of
  their JSON type
- There is no JSON array accessor yet
- Nested access requires chaining multiple `jsonGet` calls
- Error handling for malformed JSON is basic

## System Helpers

### Printing

`println(...)` prints any value followed by a newline. It accepts strings,
integers, floats, and booleans. At the LLVM level, it lowers to `printf` with
format strings.

```lumen
println("hello")
println(42)
println(3.14)
println(true)
println(total < 10)
```

String interpolation works inside `println`:

```lumen
let name = "lumen"
println("hello ${name}")
```

### Numeric Helpers

```lumen
println(min(9, 4))   // 4
println(max(9, 4))   // 9
```

### UUID

```lumen
let id = uuid()
println(id)            // e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

Returns a UUID-like string. The format follows UUID v4 conventions.

### Date

```lumen
println(date())        // e.g., "2026-06-30 13:05:00"
```

Returns the current local date and time in `YYYY-MM-DD HH:MM:SS` format.

### Assertion

```lumen
assert(total == 6, "bad total")    // exits if total != 6
assert(ready)                      // exits if ready is false
```

`assert` takes a condition and an optional message. If the condition is false,
it prints the message (or a default) and terminates the program with a nonzero
exit code. Use this for invariants that must never be violated.

### Filter

`filter` creates a view over an array for use in `for-of` loops:

```lumen
let values: i32[] = [1, 2, 3, 4, 5]

for (let value of filter(values, value => value > 2)) {
  println(value)         // 3, 4, 5
}
```

The predicate is a JS-like arrow function: `param => boolean_expression`.
Current filter lowering is a view over the source array — it does not allocate
a new array.

## Encryption

Lumen provides symmetric encryption with AES-256:

```lumen
let secret = encrypt("hello lumen", "correct horse battery staple")
if isOk(secret) {
  println(includes(resultValue(secret), "lumen:v1:"))
}
```

### How It Works

- **Default protocol**: `AES-256`
- **Implementation**: `AES-256-CTR-HMAC-SHA256`
- **Key derivation**: PBKDF2 with random salt
- **Random nonce**: generated per encryption
- **Authentication**: HMAC-SHA256 verified before decryption
- **Output format**: portable encoded string prefixed with `lumen:v1:`

### API

```
encrypt(value, key)          → Result<string>
encrypt(value, key, proto)   → Result<string>
decrypt(value, key)          → Result<string>
decrypt(value, key, proto)   → Result<string>
```

### Limitations

- Only the default protocol is implemented
- Key management (generation, storage, rotation) is left to the application

## Compiler Bootstrap Helpers

These helpers let Lumen programs interact with the compiler at runtime:

### Tokenizer And Parser

```lumen
let source = "function main(): i32 { return 0 }"

let tokens = tokenizeSource(source)
// tokens is a string representation of the token stream

let summary = parseSummary(source)
// summary is a string representation of the parsed AST
```

These are intentionally small foundations. The Lumen-written bootstrap
compiler remains a subset of the primary JavaScript compiler.

### Source Snippet

```lumen
let diagnostic = sourceSnippet(source, line, column)
// produces a line of source with a caret pointing at the error location
```

Used by the bootstrap compiler for error reporting.

### Compiler Image

```lumen
let image = compilerImage()
// returns the embedded stage-1 LLVM checkpoint as a string
```

This is the mechanism for deterministic checkpoint bootstrapping. The
JavaScript compiler embeds the stage-1 image; later stages reproduce it rather
than rebuilding the compiler from Lumen source.

## Missing

- **Escape sequences** — `\n`, `\t`, `\\`, and `\"` handling is small. Unicode
  escapes are not supported.
- **JSON typing** — all JSON field access returns strings. There's no type
  coercion to numbers or booleans.
- **JSON arrays** — no direct array indexing for JSON values.
- **String split result** — `split` returns a pipe-delimited string, not an
  array.
- **Linux date** — `date()` may return a different format or empty on Linux.
- **Filter allocation** — `filter` creates a view, not a new array. You can't
  store the result for later use.
- **String builder** — only available through the bootstrap helpers, not as a
  general-purpose string construction API.
