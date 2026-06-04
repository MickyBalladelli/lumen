# Missing Pieces

This chapter is the living roadmap.

## Compiler

- Replace checkpoint source-shape dispatch with real emit path
- Move emitter off the legacy AST-to-map bridge
- Grow self-host IR builder beyond module facts and statement flags
- Grow self-host semantic analyzer beyond symbol and control-flow checks
- Grow self-host type checker beyond simple annotations and first-argument calls
- Generalize self-host struct support beyond the current fixed smoke case
- Add self-host module loading
- Add better diagnostics

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
