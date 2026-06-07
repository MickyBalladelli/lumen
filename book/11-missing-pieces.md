# Missing Pieces

This chapter is the living roadmap. It should describe what is actually left, not old work already done.

## Recently Finished

- Real self-host parser, AST, semantic analyzer, type checker, IR builder, and LLVM emitter
- Stage-1 self-host delegate path with the old C fallback removed
- Stage-2 bootstrap equality against stage-1 output
- Module/import loading in the self-host path
- Structs, arrays, enums, match, switch, try/catch, async, loops, and source diagnostics in the self-host path
- Empty array literals for annotated array types
- Formatter, language server, VS Code packaging checks, and focused unit tests
- Smoother package CLI install path for `lmsh`, `photon`, `lumen-format`, and `lumen-lsp`

## Compiler

- Keep expanding focused parser, formatter, LSP, and type checker tests as bugs are found
- Tighten self-host type checks for generics, collections, and function calls
- Improve self-host diagnostics with richer snippets and recovery
- Reduce remaining JS-only compiler assumptions until the self-host compiler can own the full path comfortably

## Language

- Stronger generics
- Better typed collections
- More complete Result and Option behavior
- More complete async runtime
- More complete pattern matching

## Tooling

- Keep packaged install docs current as npm and VS Code packaging change
- Add clearer project init docs and examples
- Improve Photon package UX with search, local registry, or `photon add` shortcuts for bundled packages

## Runtime

- Better filesystem errors
- More HTTP routing
- More portable path helpers
- Cleaner JSON typing
