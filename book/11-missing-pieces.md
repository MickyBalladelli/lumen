# Missing Pieces

This chapter is the living roadmap for Lumen. It describes what remains to be
built, organized by priority. Completed items are tracked in the "Recently
Finished" section so the project's progress is visible.

## Recently Finished

- **Deterministic bootstrap checkpoint** — the JavaScript compiler embeds the
  stage-1 LLVM image. Stage-2 and stage-3 reproduce it byte-for-byte, and
  stage-3 runs independently against parity fixtures. Full source self-hosting
  remains unfinished.

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

- **Typed self-host AST** — `compiler/ast.lm` stores declarations, statements,
  type annotations, and expressions in growable node and child arenas.
  `parseProgram(...)` is the single bootstrap parser. It preserves arbitrary
  nesting, parent links, and source ranges, and its typed AST is passed to
  semantic analysis, type checking, and IR lowering.

- **Self-host semantic analyzer** — `SemanticResult` with checks for `main`,
  duplicate top-level symbols, unsupported bootstrap `while 1`, and
  `break`/`continue` outside valid control-flow regions.

- **Self-host type checker** — `TypeResult` with checks for simple annotated
  variable initializers plus first-argument function calls, including `none()`
  and `ok(...)` helper shapes.

- **Bootstrap IR summary** — typed `IrModule` structures hold module facts,
  instruction counts, return values, print counts, and call/binary/loop flags.
  AST lowering still creates the program-map and statement bridge used by
  emission.

- **Self-host LLVM emitter** — `emitIr(...)` entry point with the compiler
  calling that IR-based path. Internals still delegate through the legacy
  statement bridge for supported code generation.

- **Self-host module graph** — `compiler/modules.lm` parses files separately,
  discovers imports from typed AST nodes, resolves canonical local and Photon
  paths, checks exports, rejects cycles, and loads shared dependencies once.
  A token projection still feeds the later compatibility passes.

- **Stage-1 compiler checkpoint path** — the old C fallback has been removed.
  Compiler-mode emission returns the LLVM image embedded by the JavaScript
  compiler.

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

Parsed nodes now represent calls, members, assignments, unary/binary
operators, arrays, structs, matches, slices, arrows, and await. Semantic
analysis, type checking, IR, and code generation consume those nodes.

Remaining work is to remove the `RawExpression` statement-field wrapper and
make parsed expression nodes the direct AST representation everywhere.

### Extend The Type System

Boolean conditions, return-on-all-paths, use-before-initialization, match
coverage, generic variance, nullable rules, and collection element types are
checked today. Remaining work includes user-defined generics, function
overloading, and fully specified numeric conversions.

### Define A Built-in/Runtime ABI Registry

Completed. `BuiltinRegistry.js` is the canonical typed table. Compiler
consumers share it, runtime units are selected from it, and ABI tests reject
drift from C declarations and implementations.

### Make Diagnostics Module-Aware And Recoverable

Completed in the primary compiler. Diagnostics preserve files and ranges,
collect independent failures, render snippets and notes, and retain imported
file paths. The bootstrap compiler still reports only its smaller diagnostic
subset.

### JS/Bootstrap Parity Matrix

Completed for the currently claimed subset. `npm run test:parity` compares
diagnostics, LLVM requirements, and executable behavior. Claimed rows are
generated into [the support matrix](support-matrix.md).

### Bootstrap Compiler Expansion

- Replace the `compilerImage()` checkpoint with source-derived compiler output
- Prove the compiler can regenerate itself from `compiler/*.lm`
- Remove the AST-to-map compatibility bridge from the emitter internals —
  emit directly from IR
- Grow the parser to cover all JS compiler features
- Strengthen semantic checks to match JS compiler diagnostic coverage
- Strengthen type checks beyond simple annotated initializers and
  first-argument calls
- Replace the linked token projection with module-aware semantic and IR passes

## P1 — Runtime And Portability

### Linux Support

Linux process arguments, encryption/decryption, and WebSocket handshakes have
Linux-capable providers. Automated Linux CI is still required before treating
Linux as continuously verified.

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

Completed. An async call eagerly creates a native-thread `Task<T>`. Awaiting a
task blocks the caller. Pending cancellation prevents the body from starting;
running cancellation is observed with `taskCancelled()` and never kills an OS
thread. Uncaught task throws, startup failures, and cancellation flow through
`await` into `try/catch`, while returned `Result<T>` values remain values.
Arguments are copied into the task context, pointer-backed data remains shared,
and shutdown joins unawaited task threads.

## P1 — CLI, Editor, And Distribution

### Ship A Normal Compiler Command

Completed. The npm package exposes `lumen build`, `lumen emit`, and
`lumen run`, with explicit output, config, Clang, release, help, version, and
program-argument handling.

### Add An Installed-Package Smoke Test

Completed. `npm run test:package` packs into a clean temporary directory,
installs only that tarball, exercises every packaged command, compiles and runs
native programs, installs and imports a bundled Photon package, completes an
LSP initialize/shutdown handshake, and verifies the shipped README install link.

### Make LSP Compilation Use The Same Module Graph As CLI

Completed. The CLI and LSP share `Compiler.compileFile` and the same linked
module graph. Open buffers overlay disk modules, dependency edits rebuild open
roots, diagnostics are grouped by source file, rapid changes are debounced, and
stale builds cannot publish. `didClose` cancels pending work and clears
diagnostics. Every build uses a fresh compiler instance and reports the full
diagnostic collection.

### Add Language Intelligence

Completed. The language server builds a symbol index from compiler AST, linked
module, scope-resolution, inferred-type, diagnostic, and token metadata. It
provides go-to-definition, cross-file references and rename, hover types,
completion, document and workspace symbols, semantic tokens, and diagnostic or
formatting code actions. The VS Code extension is a thin LSP adapter and does
not re-parse source.

### Make Formatting Syntax-Aware And Idempotent

Completed. Formatting first validates the parsed program, then uses
trivia-aware tokens and delimiter structure for spacing and indentation.
Comments and multiline calls/literals are preserved, match and switch bodies
indent correctly, string contents do not affect brace depth, CRLF is
normalized, and malformed source is returned untouched. Format-twice tests
cover focused edge cases and every example.

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

### Collision-Safe Cached Build Artifacts

Completed. Default artifacts use canonical-path, target, compiler-version, and
flag keys plus a content fingerprint. `lmsh`, `lumen`, and the JavaScript
compile driver share the cache. LLVM, executable, and explicit output writes
use sibling temporary files and atomic rename.

### Remove Dead CompilerOptions

Completed. The unused public options class and export were removed. The only
implemented memory strategy is the runtime-owned process-lifetime model
documented in the compiler chapter.

### Generated Feature And Support Matrix

Completed. `book/support-matrix.md` is generated from parity data, support
metadata, and package manifests. README and book pages link to it instead of
maintaining separate support claims. Auth, JWT, outbound HTTPS, and URL
packages are marked experimental.

### Reduce The README To A Reliable Entry Page

Completed. README is a short install/status/quick-start page. Language,
packages, benchmarks, compiler internals, and roadmap content live in the book.
`npm run check:docs` verifies local links and anchors, compiles marked Lumen
snippets, and keeps README below the size limit.

### Add Contributor And Security Documents

Completed. `CONTRIBUTING.md` covers setup, architecture, test layers, pull
requests, and the current manual release process. `SECURITY.md` defines
best-effort version/platform support, private vulnerability reporting, and the
current trust limits of compiler, package, network, and crypto APIs.
