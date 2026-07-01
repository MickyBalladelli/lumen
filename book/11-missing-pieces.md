# Missing Pieces

This chapter is the living roadmap for Lumen. It describes what remains to be
built, organized by priority. Completed items are tracked in the "Recently
Finished" section so the project's progress is visible.

## Recently Finished

- **Genuinely self-hosting compiler** (stage-3 proven) — the native compiler
  carries its deterministic LLVM image and reproduces it without an external
  compiler or seed file. Stage-2 builds stage-3; the two are compared byte for
  byte; the stage-3 compiler runs independently.

- **Fresh mutable state per compilation** — `Compiler` creates fresh semantic,
  type, IR, and backend components through factories for every call. Regression
  tests cover valid and invalid compilations through one compiler/LSP instance.

- **Real module graph** — local and Photon modules parse separately, resolve
  once by canonical path, retain file locations, reject cycles, honor package
  export lists, and expose only explicitly imported names while keeping
  dependency-private names isolated.

- **Runtime bounds and lifetime safety** — dynamic array reads, writes, and
  loops use checked indices; string indexing and slicing reject invalid ranges.
  Runtime-owned strings, JSON, lists, maps, and objects stay valid until exit
  and are then freed. Native ASan+UBSan tests cover safe allocation plus array
  read/write, string, and slice bounds failures.

- **Self-host parser** — real typed AST entry point in `compiler/ast.lm` with
  `parseAst(...)`. Recognizes imports, extern declarations, structs, enums,
  async functions, `let`/`const`, `if`, classic `for`, for-of, range loops,
  `while`, do-until, `switch`, `defer`, `break`, `continue`, `try`/`catch`,
  `throw`, `return`, and match-expression initializers.

- **Self-host semantic analyzer** — `SemanticResult` with checks for `main`,
  duplicate top-level symbols, unsupported bootstrap `while 1`, and
  `break`/`continue` outside valid control-flow regions.

- **Self-host type checker** — `TypeResult` with checks for simple annotated
  variable initializers plus first-argument function calls, including `none()`
  and `ok(...)` helper shapes.

- **Self-host IR builder** — `IrModule` that lowers AST/statement bridge into
  module facts, instruction counts, return values, print counts, and
  call/binary/loop flags before emission.

- **Self-host LLVM emitter** — `emitIr(...)` entry point with the compiler
  calling that IR-based path. Internals still delegate through the legacy
  statement bridge for supported code generation.

- **Self-host module loader** — `compiler/modules.lm` recursively loads local
  imports and bare package `main.lm` files, skips duplicate loads, removes
  handled import declarations, and feeds flattened source into the parser.

- **Stage-1 self-host delegate path** — the old C fallback has been completely
  removed. Stage-2 bootstrap equality against stage-1 output.

- **Structs, arrays, enums, match, switch, try/catch, async, loops, and source
  diagnostics** in the self-host path.

- **Empty array literals** for annotated array types.

- **Formatter, language server, VS Code packaging checks, and focused unit
  tests.**

- **Smoother package CLI install path** for `lmsh`, `photon`, `lumen-format`,
  and `lumen-lsp`.

## P0 — Correctness And Safety

### Harden HTTP And Socket.IO Runtime

The HTTP runtime serves static files, API routes, and Socket.IO-shaped chat but
lacks production-ready safety measures:

- Add request and body size limits to prevent memory exhaustion
- Implement partial read/write loops for complete file transfers
- Add connection timeouts and idle timeouts
- Validate canonical paths to prevent directory traversal (`../` attacks)
- Validate HTTP protocol conformance on incoming requests
- Implement clean shutdown (graceful connection draining)
- Handle concurrent connections properly
- Fuzz request parsers and WebSocket handshake parsers

### Harden Photon Installs

- Reject dependency names that escape `.photon/packages` (e.g., `../../etc`)
- Install through a temporary directory, validate, then swap atomically
- Keep the old install on failure rather than leaving partial state

### Make photon.lock Reproducible

- Read the lock file during `photon install`
- Pin Git dependencies to exact commit hashes from the lock
- Verify the checked-out commit matches the lock
- Define `photon update` and `photon install --frozen-lock` commands
- Currently: the lock is rewritten on every install but never used to resolve
  dependencies

## P1 — Compiler Architecture

### Finish The Expression AST

`RawExpression.parsed` fields are created by the parser but completely ignored
by semantic analysis, type checking, and code generation. Those stages inspect
raw token shapes instead. This is the single largest architectural gap in the
compiler.

- Represent function calls as real AST nodes (not token-shape heuristics)
- Represent field access (`point.x`) as real AST nodes
- Represent assignment as real AST nodes
- Represent unary operators as real AST nodes
- Represent binary operators with precedence as real AST nodes
- Represent array literals, struct literals, match expressions, and await as
  real AST nodes
- Make semantic analysis, type checking, and code generation consume parsed
  expressions instead of inspecting token shapes directly

### Strengthen The Type Checker

- Require boolean expressions in `if` and loop conditions
- Prove non-void functions return on every control flow path
- Reject use of variables before they are initialized
- Fully validate match arms for exhaustiveness and type consistency
- Define generic type variance rules for `Result<T>`, `Map<K,V>`, and `T?`
- Define nullable type rules
- Validate collection element types

### Define A Built-in/Runtime ABI Registry

Function names and signatures are currently duplicated across five places:
`ModuleRegistry.js`, `ExpressionInspector.js`, `TypeChecker.js`,
`LLVMEmitter.js`, and the C runtime. This drift-prone.

- Define one typed table of all built-in functions with their signatures
- Generate or consume this table from all five locations
- Fail at build time when implementations drift from the registry

### Make Diagnostics Module-Aware And Recoverable

- Preserve file path and source range through all pipeline stages (parsing,
  module loading, IR building, LLVM emission)
- Report multiple diagnostics per compilation instead of stopping at the first
  error
- Include source snippets, carets, and notes pointing to related locations
- Include imported-file paths in error traces

### Create A JS/Self-Host Parity Matrix

- Differentially compile every supported language feature with both the JS
  compiler and the self-host compiler
- Compare diagnostics, LLVM IR output, and executable behavior
- Do not mark a feature as complete until both compilers produce
  indistinguishable results

### Self-Host Compiler Expansion

- Remove the AST-to-map compatibility bridge from the emitter internals —
  emit directly from IR
- Grow the parser to cover all JS compiler features
- Strengthen semantic checks to match JS compiler diagnostic coverage
- Strengthen type checks beyond simple annotated initializers and
  first-argument calls
- Grow module loading beyond local/package source concatenation

## P1 — Runtime And Portability

### Linux Support

Completed. Linux process arguments, encryption/decryption, and WebSocket
handshakes have portable providers. Runtime tests force these paths on macOS.

### Split The Runtime C Code

Completed. System, fs, string, collections, thread, crypto, and HTTP now have
separate implementations and headers. Runtime symbol references select the
units linked into each generated program.

### Replace Error Sentinels With Typed Errors

Completed. File, environment, crypto, JSON, process, thread, and HTTP
operations return `Result<T>`. Valid empty strings and zero values remain
successful values.

### Remove Shell Command Execution From Compiler Internals

Completed. The compiler driver and runtime process API launch programs with
argument arrays. Native and self-host tests cover spaces, quotes, semicolons,
and `$()` in paths and arguments.

### Decide And Implement The Async Model

`async function` and `await` are accepted as source-level markers but lower
synchronously — an async function runs exactly like a normal function today.

- Specify the async task model: tasks, scheduling, cancellation, errors
- Define thread interaction rules
- Implement the runtime before expanding the syntax

## P1 — CLI, Editor, And Distribution

### Ship A Normal Compiler Command

The npm package exposes `lmsh`, `photon`, `lumen-format`, and `lumen-lsp` but
there is no packaged `lumen` binary for build/emit/run workflows. `compile.js`
is script-level only.

- Add a supported `lumen` binary for: compile a file, emit LLVM only, compile
  from `lumen.json`, run a compiled program

### Add An Installed-Package Smoke Test

- Pack to a clean temporary directory
- Install the tarball globally
- Compile and run a Lumen program
- Install a bundled Photon package
- Start an LSP handshake
- Verify all documented commands work from the installed package

### Make LSP Compilation Use The Same Module Graph As CLI

- Local imports (`import { ... } from "./file.lm"`) currently produce
  `Unknown module` in LSP diagnostics
- Implement `didClose` to clean up diagnostics when files close
- Debounce and cancel stale diagnostic requests
- Report all errors, not just the first
- Isolate compiler state per document/build

### Add Language Intelligence

After correctness is solid:
- Go-to-definition for functions, variables, types
- Find references
- Hover types
- Completion suggestions
- Rename refactoring
- Document symbols
- Semantic token coloring
- Code actions (quick fixes)

All should use compiler data rather than re-parsing in the VS Code extension.

### Make Formatting Syntax-Aware And Idempotent

- Format from tokens/AST rather than line regexes
- Handle comments correctly (preserve placement)
- Handle nested literals and complex expressions
- Handle multiline function calls
- Handle match and switch formatting
- Handle strings containing braces (`${...}`)
- Handle malformed input gracefully (don't destroy the file)
- Handle CRLF line endings
- Add format-twice idempotency tests

### Complete Package Metadata And Release Automation

- Add `license`, `repository`, `bugs`, `homepage` to `package.json`
- Add Node engine requirement
- Add prepublish checks
- Generate changelogs
- Synchronize versions between npm package, VS Code extension, and LSP
- Generate checksums for releases
- Make VSIX and tarball artifacts reproducible

## P2 — Tests, Docs, And Maintenance

### Add CI On macOS And Linux

- Run unit, example, negative, bootstrap, package, VS Code packaging,
  sanitizer, and clean-install tests
- Cache toolchain dependencies without caching generated compiler outputs
- Run on every push and pull request

### Split The Example Test Runner

The test runner in `src/cli/test-examples.js` is ~1,131 lines and runs as a
single monolithic suite. One failure hides unrelated results.

- Create focused test suites: tokenizer, parser, semantic, type checker,
  emitter, module loader
- Add direct unit test coverage for each compiler stage
- Add CLI error case tests
- Add repeated-compiler-use tests

### Add Fuzzing And Property Tests

- Assert the tokenizer never hangs or crashes on any input
- Assert the parser never hangs or crashes on any token stream
- Assert formatting is idempotent (format twice = same output)
- Assert invalid programs never reach LLVM emission (caught by semantic/type
  analysis)
- Assert generated LLVM always passes `clang` verification

### Make Temporary Outputs Collision-Safe

- Key build artifacts by canonical input path, target, compiler version, and
  flags
- Write atomically (write to temp file, rename)
- Avoid `lmsh` and compile flows sharing basenames in build directories

### Either Wire CompilerOptions Or Remove It

`CompilerOptions` exposes `ownership` (`manual`, `arc`, `borrow`, `gc`,
`hybrid`), `target`, and safety settings. These are public placeholders that
currently change nothing.

- Either implement the settings so they affect compilation
- Or remove the options and document the current memory management model as
  intentional

### Reconcile Documentation With Actual Behavior

- The README claims features that differ from the book's description
- There is no single source of truth for what features exist
- Create one generated feature/support matrix
- Label experimental packages (auth, JWT, outbound HTTPS, URL) clearly until
  implemented

### Reduce The README To A Reliable Entry Page

- Move language reference into maintained book pages
- Move package catalog into the packages chapter
- Move benchmark results into a dedicated page
- Move compiler internals into the compiler chapter
- Move roadmap into this chapter
- Test all code snippets and internal links

### Add Contributor And Security Documents

- `CONTRIBUTING.md`: toolchain setup, architecture overview, test layers,
  release process
- `SECURITY.md`: supported platforms, vulnerability reporting, security status
  of network and crypto APIs
