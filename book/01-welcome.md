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
grow the language until it can own more of its compiler. The self-host compiler
is now genuinely self-hosting — it reproduces its own LLVM image without an
external compiler or seed file.

## What Lumen Is Good At Now

- Small native executables with competitive performance
- Functions, types, variables with `let` and `const`
- Loops: classic `for`, `for-of`, `while-do`, `do-until`, range loops
- Branches: `if`/`else`, `match`, `switch`
- Structs, enums, and typed arrays
- Files, JSON, environment, process, and HTTP helpers
- Native threads with semaphores and channels
- Encryption, UUID, date, and assertion helpers
- Package management through Photon (bundled and external packages)
- Genuinely self-hosting compiler (stage-3 proven)
- Real module graph with cycle detection and private names
- Runtime bounds and lifetime safety
- Formatter, language server (LSP), and VS Code extension

## Missing

- Full expression AST (currently uses token-shape heuristics)
- Typed IR (currently AST statements in IR body)
- Stronger type checker (boolean conditions, return-on-all-paths, generics)
- Linux support for `arg`, crypto, and WebSocket (currently macOS-only)
- Async model (syntax reserved, lowers synchronously today)
- Better HTTP routing and production-ready runtime hardening