# Collections And Structs

Lumen provides arrays, structs, enums, maps, lists, channels, and a string
builder. Arrays and structs compile to LLVM aggregate types. Maps, lists,
channels, and the string builder are runtime-backed helpers.

## Arrays

An array holds a fixed list of values with the same element type:

```lumen
let values: i32[] = [2, 3, 5]
```

The type annotation `i32[]` means "array of i32". Array literals use square
brackets with comma-separated elements.

### Accessing Elements

Index with square brackets. Indices start at 0:

```lumen
println(values[0])   // 2
println(values[1])   // 3
println(values[2])   // 5
```

### Array Length

`len()` returns the fixed length of an array:

```lumen
println(len(values))   // 3
```

### Assigning Elements

Array elements can be assigned by index:

```lumen
values[0] = 8
println(values[0])   // 8
```

### Empty Arrays

Empty array literals with an annotated type are supported:

```lumen
let empty: i32[] = []
println(len(empty))   // 0
```

The type annotation is required for empty arrays — the compiler needs to know
the element type.

### Arrays Of Structs

Arrays can hold structs:

```lumen
struct Point {
  x: i32
  y: i32
}

let points: Point[] = [
  Point { x: 4, y: 7 },
  Point { x: 1, y: 9 }
]

println(points[0].x)    // 4
println(points[1].y)    // 9
```

The type annotation is `Point[]` — "array of Point".

### Array Helpers

| Helper | Description | Example |
| --- | --- | --- |
| `arraySum(arr)` | Sum of all elements | `arraySum([1, 2, 3])` → `6` |
| `arrayFirst(arr)` | First element | `arrayFirst([1, 2, 3])` → `1` |
| `arrayLast(arr)` | Last element | `arrayLast([1, 2, 3])` → `3` |
| `arrayJoin(arr, sep)` | Join elements with separator | `arrayJoin(["a","b"], ",")` → `"a,b"` |
| `len(arr)` | Number of elements | `len([1, 2, 3])` → `3` |
| `includes(arr, val)` | Check if value is in array | `includes([1,2,3], 2)` → `true` |

### Bounds Checking

All array reads, writes, and loop indices are checked at runtime. An out-of-
bounds access produces a diagnostic and exits the program. This is verified by
sanitizer tests under ASan and UBSan.

## Structs

A struct defines a fixed object shape with named, typed fields:

```lumen
struct Point {
  x: i32
  y: i32
}
```

### Creating Instances

Use struct literal syntax — the struct name followed by `{ field: value, ... }`:

```lumen
let origin = Point { x: 0, y: 0 }
let moved = Point { x: 4, y: 7 }
```

All fields must be provided in the literal.

### Accessing Fields

Use dot notation:

```lumen
println(origin.x)            // 0
println(moved.x + moved.y)   // 11
```

### Assigning Fields

Struct fields are mutable if the variable is `let`:

```lumen
origin.x = 10
origin.y = 20
```

### Structs Under The Hood

Structs compile to LLVM aggregate types — they're real structs in memory with
proper alignment, not heap-allocated objects. A `Point` with two `i32` fields
is 8 bytes (on a typical platform). Accessing a field compiles to an LLVM
`getelementptr` and `load`/`store` instruction pair.

## Enums

Enums define a set of named integer-backed variants:

```lumen
enum Status {
  Ok
  Missing
  Broken
}
```

Variants are numbered sequentially from 0: `Ok = 0`, `Missing = 1`, `Broken =
2`.

### Using Enums

```lumen
let status: Status = Missing
```

Enums can be used with `match` to produce different values for each variant:

```lumen
let label = match status {
  Ok => "ok"
  Missing => "missing"
  _ => "unknown"
}
```

And with `switch` for block-based branching:

```lumen
switch status {
  case Ok {
    println("all good")
  }
  case Missing {
    println("not found")
  }
  default {
    println("other")
  }
}
```

Enums compile to integers in memory. There is no payload — just a discriminant.

## Maps

Maps are runtime-backed string-keyed containers. Create one with the `map()`
function, providing key-value pairs:

```lumen
let headers = map(
  "content-type", "application/json",
  "x-lumen", "yes"
)
```

### Reading From Maps

```lumen
println(mapGet(headers, "content-type"))   // "application/json"
println(mapHas(headers, "x-lumen"))        // "true"
```

- `mapGet(map, key)` returns the value for a key, or an empty string if the key
  is missing
- `mapHas(map, key)` returns `"true"` or `"false"` as a string

### Mutating Maps

Bootstrap mutation helpers return new map values:

```lumen
let symbols = map("main", "function")
symbols = mapSet(symbols, "total", "i32")
println(mapGet(symbols, "total"))   // "i32"

symbols = mapDelete(symbols, "total")
println(mapHas(symbols, "total"))   // "false"
```

- `mapSet(map, key, value)` adds or updates a key
- `mapDelete(map, key)` removes a key
- `mapKeys(map)` returns a string of comma-separated keys

Maps are currently string-backed: keys and values are both strings. They are
used by the self-host compiler for symbol tables and by programs for header
collections.

## Lists

Lists are dynamic string-backed sequences:

```lumen
let tokens = list()
tokens = listPush(tokens, "function")
tokens = listPush(tokens, "main")
tokens = listPush(tokens, "return")

println(listGet(tokens, 0))   // "function"
println(listGet(tokens, 1))   // "main"
println(listLen(tokens))      // 3
```

- `list()` creates an empty list
- `listPush(list, value)` appends a value and returns the updated list
- `listGet(list, index)` returns the element at an index
- `listLen(list)` returns the number of elements

Like maps, lists are string-backed. They are used by the self-host compiler for
token collections and similar sequences.

## Channels

Channels provide a small message-passing foundation for thread communication:

```lumen
let messages = channel()
send(messages, "ready")
println(receive(messages))   // "ready"
```

- `channel()` creates a new channel
- `send(channel, value)` sends a value into the channel
- `receive(channel)` blocks until a value is available and returns it

Channels are the primitive building block for higher-level thread
communication. A channel can have multiple senders and receivers. Values
currently must be strings.

## String Builder

The string builder is used by the compiler for incremental text emission:

```lumen
let out = stringBuilder()
out = stringBuilderAppend(out, "define ")
out = stringBuilderAppend(out, "i32 @main")
println(out)
```

- `stringBuilder()` creates an empty builder
- `stringBuilderAppend(builder, text)` appends text and returns the updated
  builder

The string builder accumulates text efficiently without creating intermediate
string objects. It's designed for the self-host emitter which builds LLVM IR
output line by line.

## Compiler Image

`compilerImage()` returns the self-host compiler's own LLVM image as a string.
This is the mechanism that enables genuine self-hosting: the native compiler
carries its deterministic LLVM image and reproduces it without an external
compiler or seed file.

```lumen
let image = compilerImage()
// image contains the LLVM IR of the compiler itself
```

## Missing

- **Self-host struct support** — the self-host compiler still rejects `struct`
  in some compilation paths.
- **Typed generic collections** — maps and lists are string-backed. `Map<K,V>`
  and `Result<T>` syntax exists but the underlying implementation doesn't yet
  support arbitrary key and value types.
- **Dynamic arrays** — arrays are fixed-size. Growing, shrinking, pushing, and
  popping need runtime support.
- **Map and list type safety** — values are strings. There's no compile-time
  type checking for what you put in a map or list.
- **Channel type checking** — channels currently only support string values.
- **Struct literal type checking in self-host** — the self-host compiler
  resolves struct field values rather than lowering to real storage in some
  paths.