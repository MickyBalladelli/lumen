# Files, Environment, And CLI

## Files

```lumen
let text = readFile("examples/data.txt")
println(text)

writeFile("build/report.txt", "done")
```

## Environment

```lumen
let value = env("DATABASE_URL")
println(value)
```

`.env` files are supported for simple key-value entries.

## CLI Args

```lumen
println(arg(0))
println(argCount())
```

## Missing

- File errors need better typed behavior
- Directory helpers are thin
- CLI parsing package can grow flags and subcommands
- Need docs for path handling across platforms

