# Control Flow

## If

```lumen
if total > 10 {
  println("large")
} else {
  println("small")
}
```

## For

```lumen
for (let i: i32 = 0; i < 5; i++) {
  println(i)
}
```

## While

```lumen
let i: i32 = 0

while i < 4 do {
  println(i)
  i++
}
```

## Match

```lumen
let label = match status {
  Ok => "ok"
  Missing => "missing"
  _ => "unknown"
}
```

## Missing

- Self-host compiler only supports a narrow while shape
- More complete `match` docs
- Loop labels
- Cleaner parser errors for malformed loops

