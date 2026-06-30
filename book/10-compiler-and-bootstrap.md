# Compiler And Bootstrap

This chapter covers the full compiler architecture: the JavaScript compiler in
`src/`, the self-host compiler in `compiler/`, the module graph, the bootstrap
process, the formatter, the language server, and using the compiler as a
JavaScript library.

## JS Compiler Pipeline

The JavaScript compiler is the primary implementation. It lives in `src/` and
compiles Lumen source through seven stages:

### 1. Lexer — `src/lexer/`

The tokenizer converts source text into a stream of tokens.

| File | Purpose |
| --- | --- |
| `Tokenizer.js` | Main tokenizer — reads characters, produces tokens |
| `Token.js` | Token data structure (type, lexeme, location) |
| `TokenType.js` | Token type enum (keyword, identifier, number, string, operator, etc.) |

Keywords recognized: `function`, `let`, `const`, `if`, `else`, `for`, `of`,
`in`, `while`, `do`, `until`, `return`, `struct`, `enum`, `match`, `switch`,
`case`, `default`, `break`, `continue`, `defer`, `throw`, `try`, `catch`,
`import`, `from`, `extern`, `async`, `await`, `true`, `false`, `none`, `ok`,
`err`, `some`.

The tokenizer handles comments, string literals, numeric literals, identifiers,
operators, and whitespace. It tracks line and column for error reporting.

### 2. Parser — `src/parser/`

The parser converts tokens into an AST (Abstract Syntax Tree).

| File | Purpose |
| --- | --- |
| `Parser.js` | Main parser — recursive descent, builds AST nodes |
| `ExpressionParser.js` | Expression parsing with operator precedence |

The parser produces AST nodes for: program, function declaration, variable
declaration, assignment, binary expression, call expression, return statement,
if statement, for loop, for-of loop, range loop, while-do loop, do-until loop,
break, continue, match expression, switch statement, defer statement, throw
statement, try/catch, import declaration, extern declaration, struct
declaration, enum declaration, array literal, struct literal, index expression,
member expression, and string slice.

The expression parser uses a recursive descent approach. Currently,
`RawExpression.parsed` fields are created but **not used** by semantic analysis
or code generation — those stages currently inspect token shapes directly. This
is a known architectural gap.

### 3. AST — `src/ast/`

| File | Purpose |
| --- | --- |
| `nodes.js` | AST node class definitions (Program, FunctionDecl, VarDecl, etc.) |
| `AstNodeRegistry.js` | Node class registry for extensibility |
| `AstVisitor.js` | Visitor base class for compiler passes |

### 4. Semantic Analyzer — `src/semantics/`

The semantic analyzer checks scope, symbols, and semantic rules.

| File | Purpose |
| --- | --- |
| `SemanticAnalyzer.js` | Checks `main` existence, duplicate symbols, break/continue validity, return type compatibility |
| `Scope.js` | Scope tracking (block scopes, function scopes) |
| `TypeChecker.js` | Simple type checking for i32, bool, string, void |
| `TypeSystem.js` | Type definitions and compatibility rules |
| `ModuleRegistry.js` | Registers known module names and their exported functions |
| `ExpressionInspector.js` | Inspects expression shapes for built-in function call detection |

The semantic analyzer:
- Verifies `main` function exists for executable programs
- Checks for duplicate top-level declarations
- Validates `break` and `continue` are inside loop bodies
- Ensures return types match function declarations (for simple cases)
- Performs basic type compatibility checks

### 5. IR Builder — `src/ir/`

| File | Purpose |
| --- | --- |
| `IRBuilder.js` | Converts AST statements into an intermediate representation |
| `IR.js` | IR data structure definitions |

The IR is currently a simplified representation. `IRFunction.body` still
contains AST statements rather than fully typed instructions with basic blocks.
This is a known architectural gap — the goal is to lower expressions and
control flow into typed instructions before the backend consumes them.

### 6. LLVM Emitter — `src/backend/`

| File | Purpose |
| --- | --- |
| `LLVMEmitter.js` | Generates LLVM IR text from the compiler IR |

The emitter is the largest single file at ~3,480 lines. It handles:
- Function declarations and definitions
- Variable allocation (LLVM `alloca`)
- Binary operations (LLVM `add`, `sub`, `mul`, `sdiv`, `srem`, `fadd`, etc.)
- Comparison operations (LLVM `icmp`, `fcmp`)
- Control flow (conditional branches, loops)
- Struct and array lowering (LLVM aggregate types)
- Built-in function lowering (calls into the C runtime)
- String emission (global string constants)
- Module initialization and cleanup

### 7. Compiler Driver — `src/compiler/`

| File | Purpose |
| --- | --- |
| `Compiler.js` | End-to-end pipeline orchestration and `clang` invocation |

The compiler driver:
1. Runs the tokenizer, parser, semantic analyzer, type checker, IR builder, and
   LLVM emitter in sequence
2. Writes the LLVM IR to a `.ll` file
3. Invokes `clang` to compile and link the IR with the C runtime
4. Produces a native executable

Each compilation creates fresh instances of semantic, type, IR, and backend
components — there is no shared mutable state between compilations.

### Supporting Files

| File | Purpose |
| --- | --- |
| `src/modules/ModuleGraph.js` | Resolves imports, detects cycles, isolates private names |
| `src/modules/ModuleLoader.js` | Loads local and Photon module sources |
| `src/runtime/CompilerOptions.js` | Ownership mode, garbage collector, and safety settings (currently placeholders) |
| `src/diagnostics/Diagnostic.js` | Error formatting with source line and caret |
| `src/formatter/Formatter.js` | Source code formatting |
| `src/lsp/LspServer.js` | Language Server Protocol implementation |

### C Runtime — `src/runtime/`

The C runtime backs all built-in functions. Despite having split files, all C
code is compiled as one translation unit for easy linking:

| File | Purpose |
| --- | --- |
| `system.c` | Print, len, min, max, includes, uuid, date, env, encrypt, decrypt, arg, argCount, maps, results, options, channels, JSON, errors, arrays, string builder |
| `fs.c` | File read/write |
| `http_runtime.c` | HTTP helper logic |
| `http.c` | ~2,272 lines — contains ALL HTTP code (serveFiles, serveApi, serveHttp, chat, WebSocket). The split file comments exist but the code has not been separated |
| `thread.c` | Semaphores, threading, appendFile |
| `crypto.c` | AES-256 encryption/decryption |
| `string.c` | String helpers (len, equals, trim, lower, upper, startsWith, endsWith, replace, split, indexOf, lastIndexOf, contains, repeat, padStart, padEnd, intToString, stringToInt) |

### Library API — `src/index.js`

The compiler can be used as a JavaScript library:

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

This exports: `Parser`, `Tokenizer`, and other compiler components for
programmatic use. The module graph, type checker, and LLVM emitter are also
accessible.

## Module Graph

The module graph in `src/modules/` manages import resolution:

### How It Works

1. **Scan** — the compiler scans the source for `import` declarations
2. **Resolve** — each import path is resolved to a canonical file path:
   - Bare module names (`"system"`, `"fs"`, `"http"`, `"thread"`) map to
     registered modules
   - Relative paths (`"./modules/math.lm"`) are resolved relative to the
     importing file
   - Photon packages in `.photon/packages/` are checked for matching names
3. **Parse** — each imported file is parsed independently into its own AST
4. **Deduplicate** — each canonical path is loaded only once, even if imported
   by multiple files
5. **Detect cycles** — circular imports produce an error diagnostic
6. **Isolate names** — only the explicitly imported symbols are visible to the
   importing file. Dependency-private symbols are inaccessible

### Module Loading In The Self-Host Path

The self-host module loader (`compiler/modules.lm`) recursively loads:

- **Local imports** — files on disk relative to the importing file
- **Bare package `main.lm`** — packages that have a `main.lm` entry point
- **Duplicate skipping** — already-loaded paths are not reloaded
- **Import removal** — handled import declarations are stripped from the source
  before feeding the flattened program to the parser

## Self-Host Compiler

The bootstrap compiler in `compiler/` is written in Lumen. It compiles a
growing subset of the language and is verified through a three-stage bootstrap.

### Source Files

| File | Lines | Purpose |
| --- | --- | --- |
| `compiler/tokenizer.lm` | | Tokenizes a Lumen subset into tokens |
| `compiler/ast.lm` | | Typed AST entry point with `parseAst(...)` |
| `compiler/parser.lm` | | Parses tokens into program model: functions, statements, calls, expressions |
| `compiler/semantics.lm` | | `SemanticResult` — checks `main`, duplicate symbols, `while 1`, `break`/`continue` validity |
| `compiler/typechecker.lm` | | `TypeResult` — checks annotated variable initializers and first-argument function calls including `none()` and `ok(...)` shapes |
| `compiler/ir.lm` | | `IrModule` — lowers AST/statement bridge into module facts, instruction counts, return values, print counts, call/binary/loop flags |
| `compiler/emitter.lm` | | LLVM emission with `emitIr(...)` entry point. Internals still delegate through the legacy statement bridge |
| `compiler/modules.lm` | | Recursive module loader for local imports and package `main.lm` files |
| `compiler/main.lm` | | CLI entry point — reads source, runs pipeline, writes LLVM IR |

### Parser Coverage

The self-host parser recognizes:
- Imports, extern declarations
- Structs, enums
- Async functions
- `let`/`const` variable declarations
- `if`/`else` branching
- Classic `for`, for-of, range loops
- `while`, do-until
- `switch` with cases and default
- `defer`, `break`, `continue`
- `try`/`catch`, `throw`
- `return` statements
- Match expression initializers

### Code Generation Coverage

The stage compiler can emit LLVM for:
- The tiny bootstrap self-compilation input
- Simple `let`/`println`/`return` programs
- Helper function calls
- `if` branching
- Classic loop smoke cases
- While-loop smoke cases
- Struct literals with named integer fields and field access
- Integer array literals and indexing
- Enum-backed match expressions
- Numeric switch cases
- Throw/catch recovery
- Awaiting simple async functions

### Emitter Architecture

The emitter accepts an `IRModule` and dispatches typed IR instructions, values,
basic blocks, and terminators directly. AST statements do not cross the backend
boundary.

### Diagnostic Format

The command-line self-host compiler reports errors with:

```
Error: <message>
  at <file>:<line>:<column>
  <source line>
  <caret marker>
```

Semantic errors (missing `main`, duplicate symbols, invalid break/continue) and
type errors (mismatched variable initializer types) are both reported this way.

## Bootstrap Process

The bootstrap is verified by `npm run test`. It proves the compiler is
genuinely self-hosting through three stages:

### Stage 1

The JavaScript compiler compiles `compiler/main.lm` into a native executable
(`build/lumen-compiler`). This is the first self-host compiler. The LLVM seed
file is **hidden** during testing to prove the compiler does not depend on a
pre-existing binary or seed IR.

### Stage 2

The stage-1 compiler compiles `compiler/main.lm` again, producing a **second**
native executable. This second compiler delegates all compilation requests to
the stage-1 compiler. It explicitly **rejects** compiler self-compilation
requests, proving it is not using the same code path as stage 1.

The stage-2 compiler no longer contains the source-shape example dispatcher
that was present in earlier versions. The C source-to-LLVM fallback has been
completely removed from the runtime.

### Stage 3

The stage-2 compiler compiles a renamed copy of `compiler/main.lm`, producing
a **third** native executable. This stage-3 compiler is compared **byte for
byte** with the stage-2 compiler. If they match, the bootstrap is proven — the
compiler can reproduce itself deterministically.

The stage-3 compiler is then run independently to verify it can compile
example programs correctly.

### Manual Bootstrap

You can run the bootstrap manually:

```bash
# Build stage 1
npm run bootstrap

# Use the self-host compiler
npm run compile -- examples/basic.lm build/basic.ll

# Link and run
clang -Wno-override-module build/basic.ll src/runtime/http.c -pthread -o build/basic
./build/basic
```

## Formatter

The formatter (`src/formatter/Formatter.js`) formats Lumen source files.

### Usage

```bash
# Format a file in place
lumen-format examples/basic.lm

# Check formatting without modifying
lumen-format --check examples/basic.lm

# Via npm
npm run format -- examples/basic.lm
npm run format -- --check examples/basic.lm
```

### Formatting Rules

The formatter currently uses line-based regex patterns. It normalizes:
- Indentation (spaces)
- Spacing around operators and braces
- Line breaks between top-level declarations

### Limitations

- **Regex-based** — formatting is done with line regexes, not from tokens/AST.
  This means it cannot handle all syntactic edge cases correctly.
- **Comments** — comment formatting may not preserve original placement.
- **Nested literals** — complex nested expressions may not format correctly.
- **Strings with braces** — `"${...}"` interpolation inside strings may confuse
  brace matching.
- **CRLF** — line ending handling is not fully tested.
- **Idempotency** — formatting twice may produce different output in edge
  cases.

## Language Server (LSP)

The language server (`src/lsp/LspServer.js`) implements a subset of the
Language Server Protocol over stdio.

### Capabilities

- **Diagnostics** — reports compilation errors on file open and save
- **Formatting** — formats documents via the formatter
- **Compile** — VS Code extension provides a compile command

### Usage

```bash
# Start the LSP server
lumen-lsp

# Via npm
npm run lsp
```

The server listens on stdio for LSP messages. Configure your editor to launch
`lumen-lsp` for `.lm` files, or install the VS Code extension which does this
automatically.

### Known Gaps

- **Local imports** — `import { ... } from "./file.lm"` currently produces
  `Unknown module` in LSP diagnostics because the LSP uses a different
  compilation path than the CLI module graph.
- **No `didClose`** — closing a file does not clean up its diagnostics.
- **No debounce** — every keystroke triggers a full recompile; diagnostics are
  not debounced or cancelled.
- **Single document** — compiler state is not isolated per document/build.
- **No language intelligence** — go-to-definition, references, hover types,
  completion, rename, symbols, semantic tokens, and code actions are not
  implemented. The current extension re-parses files rather than using compiler
  data.

## VS Code Extension

The VS Code extension in `vscode-lumen/` provides:

| Feature | Description |
| --- | --- |
| **Syntax highlighting** | TextMate grammar for `.lm` files (keywords, types, strings, comments, numbers) |
| **Snippets** | Pre-built snippets for function, for, while, if, match, struct, enum |
| **Language configuration** | Auto-closing braces, brackets, quotes; comment toggling |
| **Formatting** | Format on save via `lumen-lsp` |
| **Diagnostics** | Error squiggles with source snippets and carets via `lumen-lsp` |
| **Compile** | Command palette action to compile the current file |
| **Debug** | Native debug launch configuration for CodeLLDB |

Package the extension:

```bash
cd vscode-lumen
npm install
npm run package
code --install-extension lumen-language-0.1.0.vsix
```

## Memory Management

The C runtime owns all heap-allocated values:

- **Strings** returned by helpers are owned by the runtime and stay valid for
  the process lifetime
- **JSON** values, **maps**, **lists**, and **runtime objects** are similarly
  owned
- **Internal temporaries** are freed when no longer needed
- **All remaining owned values** are released at process exit
- **Borrowed pointers** (arguments, environment strings, literals, static data)
  are not registered as owned — the runtime does not free them

`CompilerOptions` in `src/runtime/CompilerOptions.js` has exposed settings for
`ownership` with values `manual`, `arc`, `borrow`, `gc`, and `hybrid`. These
are **reserved placeholders** — changing them currently has no effect on
behavior.

## Bounds Checking

Runtime bounds checking applies to:

- **Array reads** — indexing out of bounds produces a diagnostic and exits
- **Array writes** — assigning out of bounds produces a diagnostic and exits
- **Loop indices** — for-of and range loop indices are bounded
- **String indexing** — slice indices are validated
- **String slicing** — start and end indices are bounds-checked

The sanitizer test suite runs compiled programs under ASan (AddressSanitizer)
and UBSan (UndefinedBehaviorSanitizer) to verify memory safety.

## Missing

### Architecture

- **Full expression AST** — `RawExpression.parsed` is created but ignored.
  Represent calls, access, assignment, unary/binary operators, arrays, structs,
  match, and await as real AST nodes consumed by semantic analysis, type
  checking, and code generation.
- **Split LLVM emitter** — the 3,480-line `LLVMEmitter.js` needs to be split
  into focused lowering modules: control flow, values, aggregates, built-ins,
  debug metadata, runtime ABI. Add golden LLVM tests per lowering family.
- **ABI registry** — function names and signatures are duplicated across
  `ModuleRegistry.js`, `ExpressionInspector.js`, `TypeChecker.js`,
  `LLVMEmitter.js`, and the C runtime. Generate from one typed definition.

### Type Checker

- **Boolean conditions** — `if` and loop conditions are not validated as `bool`
- **Return on all paths** — non-void functions are not checked for definite
  return
- **Use before initialization** — variables used before assignment are not
  caught
- **Match arms** — arms are not validated for exhaustiveness or type consistency
- **Generics** — `Result<T>`, `Map<K,V>`, and `T?` type parameters are not
  enforced

### Diagnostics

- **Module-aware errors** — file/range data is not preserved through parsing,
  module loading, IR, and LLVM emission
- **Multiple diagnostics** — only the first error is reported per compilation
- **Snippets** — errors include source line and caret but no notes or related
  file paths

### Self-Host Compiler

- **Emitter bridge** — the self-host emitter still uses the AST-to-map
  compatibility bridge internally
- **Parser coverage** — not all JS compiler features are covered by the
  self-host parser
- **Type checking** — only simple annotated initializers and first-argument
  calls are checked
- **Semantic checks** — only basic checks exist; many JS compiler diagnostic
  cases are not covered
- **Module loading** — only local and bare-package `main.lm` loading are
  supported in the self-host path

### Parity

- **JS/self-host matrix** — no differential testing that compiles every
  supported feature with both compilers and compares diagnostics, LLVM
  behavior, and executable output

### Platform Support

- **Linux** — `arg`, `argCount`, crypto, and WebSocket return empty or zero on
  Linux. Only macOS is fully supported.
- **Runtime split** — `src/runtime/http.c` contains all 2,272 lines of HTTP
  code despite having separate `http_runtime.c`, `system.c`, `fs.c`, etc. in
  the directory.

### Tooling

- **Formatter** — regex-based, not token/AST-based. Not idempotent in edge
  cases.
- **LSP** — local imports show `Unknown module`. No debounce, no `didClose`,
  state not isolated per document.
- **No `lumen` command** — the npm package only exposes `lmsh`, `photon`,
  `lumen-format`, and `lumen-lsp`. There is no packaged `lumen` binary for
  compilation workflows.
- **CompilerOptions** — ownership, GC, target, and safety settings are
  placeholders with no effect on behavior.
