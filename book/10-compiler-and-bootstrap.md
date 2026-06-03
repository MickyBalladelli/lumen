# Compiler And Bootstrap

The main compiler is in `src/`.

Pipeline:

1. Tokenizer
2. Parser
3. Semantic analyzer
4. Type checker
5. IR builder
6. LLVM emitter
7. Native linker

The bootstrap compiler is in `compiler/`.

It is written in Lumen and compiles a small subset. It is tested through
stage-1 and stage-2 compiler checks.

Useful files:

- `compiler/tokenizer.lm`
- `compiler/parser.lm`
- `compiler/emitter.lm`
- `compiler/main.lm`
- `src/cli/test-examples.js`

## Missing

- Replace checkpoint source-shape dispatch with real tiny AST emission
- Support structs in self-host compiler
- Support imports/modules in self-host compiler
- Make diagnostics source-located

