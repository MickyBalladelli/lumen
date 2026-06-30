# Compiler And Bootstrap

## JS Compiler Pipeline

The main compiler is in `src/`. Pipeline:

1. **Tokenizer** (`src/lexer/Tokenizer.js`): source to tokens
2. **Parser** (`src/parser/Parser.js`): tokens to AST
3. **Semantic analyzer** (`src/semantics/SemanticAnalyzer.js`): scope and symbol checks
4. **Type checker** (`src/semantics/TypeChecker.js`): simple i32/bool/string/void typing
5. **IR builder** (`src/ir/IRBuilder.js`): typed AST to compiler IR
6. **LLVM emitter** (`src/backend/LLVMEmitter.js`): IR to LLVM text
7. **Native linker** (`clang`): LLVM to native executable

Supporting modules:

- `src/modules/ModuleGraph.js`: resolves imports, detects cycles, isolates private names
- `src/modules/ModuleLoader.js`: loads local and Photon module sources
- `src/semantics/ExpressionInspector.js`: inspects built-in function calls
- `src/semantics/ModuleRegistry.js`: registers available module names and exports
- `src/semantics/Scope.js`: scope tracking
- `src/semantics/TypeSystem.js`: type definitions
- `src/runtime/CompilerOptions.js`: ownership and safety settings (placeholders today)
- `src/compiler/Compiler.js`: end-to-end pipeline and clang driver
- `src/diagnostics/Diagnostic.js`: error formatting with source snippet and caret
- `src/formatter/Formatter.js`: source formatting

The C runtime is built as one translation unit for easy linking, organized
internally by system, fs, http, thread, crypto, string, map, result, option, and
CLI helper sections:

- `src/runtime/system.c`
- `src/runtime/fs.c`
- `src/runtime/http_runtime.c`
- `src/runtime/http.c` (contains all HTTP code despite split file comments)
- `src/runtime/thread.c`
- `src/runtime/crypto.c`
- `src/runtime/string.c`

Platform-specific bits use macOS guards and Linux-safe fallbacks where a native
provider is not wired yet.

Heap strings, JSON values, lists, maps, and runtime objects are runtime-owned.
Returned allocations stay valid for the process lifetime; internal temporary
allocations are released when no longer needed; all remaining owned values are
released at process exit.

## Self-Host Compiler

The bootstrap compiler is in `compiler/`. It is written in Lumen and compiles
a growing subset of the language.

Files:

- `compiler/tokenizer.lm`: tokenizes a Lumen subset
- `compiler/ast.lm`: typed AST entry point with `parseAst(...)`
- `compiler/parser.lm`: extracts a program model with functions, statements,
  calls, and expression metadata
- `compiler/semantics.lm`: `SemanticResult` — checks for `main`, duplicate
  top-level symbols, unsupported `while 1`, and `break`/`continue` outside
  valid control-flow regions
- `compiler/typechecker.lm`: `TypeResult` — checks simple annotated variable
  initializers plus first-argument function calls, including `none()` and
  `ok(...)` helper shapes
- `compiler/ir.lm`: `IrModule` — lowers AST/statement bridge into module facts,
  instruction counts, return values, print counts, and call/binary/loop flags
- `compiler/emitter.lm`: LLVM emission with `emitIr(...)` entry point
- `compiler/modules.lm`: recursively loads local imports and bare package
  `main.lm` files, skips duplicates, removes handled import declarations, and
  feeds flattened source into the self-host parser path
- `compiler/main.lm`: CLI-shaped tiny compiler

### Bootstrap Flow

The bootstrap is tested by `npm run test`. That command:

1. Builds the stage-1 compiler from `compiler/main.lm`
2. Compiles examples, links binaries, runs expected-output checks
3. Builds the stage-2 delegate compiler
4. Runs stage-2 against stage-3 and compares byte-for-byte
5. Runs the stage-3 compiler independently
6. Runs negative compile tests

The stage-1 LLVM seed file is hidden, proving it no longer reads
`build/lumen-compiler.ll`. The stage-2 compiler no longer contains the
source-shape example dispatcher; it delegates compile requests to the stage-1
self-host compiler executable and rejects compiler self-compilation explicitly.

Manual use:

```bash
npm run bootstrap
npm run compile -- examples/basic.lm build/basic-self.ll
clang -Wno-override-module build/basic-self.ll src/runtime/http.c -pthread -o build/basic-self
./build/basic-self
```

### Self-Host Coverage

The self-host parser recognizes imports, extern declarations, structs, enums,
async functions, `let`/`const`, `if`, classic `for`, for-of, range loops,
`while`, do-until, `switch`, `defer`, `break`, `continue`, `try`/`catch`,
`throw`, `return`, and match-expression initializers.

The stage compiler can emit: the tiny bootstrap input; simple `let`/`println`/
`return` programs; helper function calls; `if`; classic loop smoke cases;
while-loop smoke cases; struct literals with named integer fields and field
access; integer array literals/indexing; enum-backed match expressions;
numeric switch cases; throw/catch recovery; and awaiting simple async
functions.

The emit path uses a compatibility map produced from the AST shape. The
emitter now has an `emitIr(...)` entry point and the compiler calls that
IR-based path, though its internals still delegate through the legacy statement
bridge for supported code generation.

The command-line self-host compiler reports semantic and type errors with a
source line and nearby token.

## Module Graph

The module graph resolves imports separately for each file, deduplicates by
canonical path, rejects import cycles, honors package export lists, and exposes
only explicitly imported names while keeping dependency-private names isolated.
Local imports, bare package imports, and Photon-package imports all flow
through the same graph.

## Formatter

Format Lumen files:

```bash
lumen-format examples/basic.lm
lumen-format --check examples/basic.lm
```

Also available as `npm run format`.

## Language Server

Start the LSP server:

```bash
lumen-lsp
```

Also available as `npm run lsp`.

The VS Code extension bundles syntax highlighting, snippets, formatting,
diagnostics through `lumen-lsp`, compile command, and native debug launch
support.

## Use As A Library

```js
import { Parser, Tokenizer } from './src/index.js'

const source = `
function main() {
  let value = 1 + 2
  return value
}
`

const tokens = new Tokenizer(source).tokenize()
const ast = new Parser(tokens).parseProgram()

console.log(ast)
```

## Missing

- Finish the expression AST and stop using token-shape heuristics.
  `RawExpression.parsed` is created but ignored by semantic analysis, type
  checking, and code generation
- Build a real typed IR. Current `IRFunction.body` contains AST statements.
  Lower expressions and control flow into typed instructions/basic blocks
- Split the 3,480-line LLVM emitter into focused lowering modules
- Strengthen the type checker: require boolean conditions, prove non-void
  functions return on every path, reject use before initialization
- Define one built-in/runtime ABI registry instead of duplicating function
  names and signatures across module registry, expression inspection, type
  checking, emitter code, and C
- Make diagnostics module-aware and recoverable: preserve file/range data
  through parsing, module loading, IR, and LLVM emission; report multiple
  diagnostics per run
- Create a JS/self-host parity matrix: differentially compile every supported
  feature with both compilers and compare
- Support Linux instead of returning silent fallbacks for `arg`, `argCount`,
  crypto, and WebSocket
- Split `src/runtime/http.c` into real runtime units (currently all 2,272
  lines in one file despite split file comments)
- Grow the self-host compiler beyond the current AST-to-map bridge for
  emitter internals
- Make LSP compilation use the same module graph as CLI compilation (local
  imports currently produce `Unknown module` in the editor)
- Make formatting syntax-aware and idempotent (currently line regexes, not
  token/AST-based)
- Either wire `CompilerOptions` into behavior or remove it (GC, ownership,
  target, and safety settings are public placeholders)