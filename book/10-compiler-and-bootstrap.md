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

- `compiler/ast.lm`
- `compiler/modules.lm`
- `compiler/tokenizer.lm`
- `compiler/parser.lm`
- `compiler/semantics.lm`
- `compiler/typechecker.lm`
- `compiler/ir.lm`
- `compiler/emitter.lm`
- `compiler/main.lm`
- `src/cli/test-examples.js`

## Missing

- Replace checkpoint source-shape dispatch with real tiny AST emission
- Move emitter internals off the legacy AST-to-map bridge
- Grow `emitIr(...)` beyond the current bridge-backed LLVM emission
- Grow the self-host IR builder beyond module facts and statement flags
- Grow the self-host semantic analyzer beyond symbol and control-flow checks
- Grow the self-host type checker beyond simple annotations and first-argument calls
- Generalize self-host struct support beyond the first fixed smoke case
- Grow self-host module loading beyond local/package source concatenation
- Make diagnostics source-located

## Current Self-Host Coverage

The self-host parser has a typed AST entry point in `compiler/ast.lm` and
`parseAst(...)`. It recognizes imports, extern declarations, structs, enums,
async functions, `let` / `const`, `if`, classic `for`, for-of, range loops,
`while`, do-until, `switch`, `defer`, `break`, `continue`, `try` / `catch`,
`throw`, `return`, and match-expression initializers.

The stage compiler can emit the tiny bootstrap input, simple `let` / `println`
/ `return` programs, helper function calls, `if`, classic loop smoke cases,
while-loop smoke cases, and the first struct smoke case from `examples/struct.lm`.
That emit path still uses a compatibility map produced from the AST shape.

The self-host semantic analyzer has a `SemanticResult` and checks for `main`,
duplicate top-level symbols, unsupported bootstrap `while 1`, and `break` /
`continue` outside valid control-flow regions.

The self-host type checker has a `TypeResult` and checks simple annotated
variable initializers plus first-argument function calls, including `none()` and
`ok(...)` helper shapes.

The self-host IR builder has an `IrModule` and lowers the current AST/statement
bridge into module facts, instruction counts, return values, print counts, and
call/binary/loop flags before emission.

The self-host module loader lives in `compiler/modules.lm`. It recursively loads
local imports and bare package `main.lm` files, skips duplicate loads, removes
handled import declarations, and feeds the flattened source into the self-host
parser path.

The self-host LLVM emitter now has an `emitIr(...)` entry point and the compiler
calls that IR-based path. Its internals still delegate through the legacy
statement bridge for supported code generation.
