# Welcome

Lumen is a small systems language with JavaScript-like syntax and native LLVM
output.

Tiny program:

```lumen
function main(): i32 {
  println("hello lumen")
  return 0
}
```

The goal is simple: write readable programs, compile them to native code, and
grow the language until it can own more of its compiler.

## What Lumen Is Good At Now

- Small native executables
- Basic functions and types
- Loops and branches
- Structs and arrays
- Files, JSON, environment, and HTTP helpers
- Package examples through Photon
- Bootstrap compiler experiments

## Missing

- Full self-host compiler
- Real module/package compilation in the self-host path
- Better diagnostics in the tiny compiler
- More complete docs for every helper

