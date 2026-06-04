# Missing Pieces

This chapter is the living roadmap.

## Compiler

- Replace checkpoint source-shape dispatch with real emit path
- Move emitter internals off the legacy AST-to-map bridge
- Grow `emitIr(...)` beyond the current bridge-backed LLVM emission
- Grow self-host IR builder beyond module facts and statement flags
- Grow self-host semantic analyzer beyond symbol and control-flow checks
- Grow self-host type checker beyond simple annotations and first-argument calls
- Lower self-host struct literals to real storage instead of resolved field values
- Grow self-host module loading beyond local/package source concatenation
- Add source snippets/carets to self-host diagnostics

## Language

- Stronger generics
- Better typed collections
- More complete Result and Option behavior
- More complete async runtime
- More complete pattern matching

## Tooling

- Install command
- Project init command
- Formatter
- Language server
- Better VS Code docs

## Runtime

- Better filesystem errors
- More HTTP routing
- More portable path helpers
- Cleaner JSON typing
