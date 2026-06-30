# Missing Pieces

This chapter is the living roadmap. It describes what is actually left, not
work already done.

## Recently Finished

- Real self-host parser, AST, semantic analyzer, type checker, IR builder, and
  LLVM emitter
- Stage-1 self-host delegate path with the old C fallback removed
- Stage-2 bootstrap equality against stage-1 output
- Stage-3 genuine self-hosting: stage-2 builds stage-3, compared byte-for-byte
- Module/import loading in the self-host path
- Structs, arrays, enums, match, switch, try/catch, async, loops, and source
  diagnostics in the self-host path
- Empty array literals for annotated array types
- Fresh mutable state for every compilation (compiler, LSP)
- Real module graph with cycle detection and private name isolation
- Runtime bounds and lifetime safety (array reads/writes/loops, string
  indexing/slicing, ASan+UBSan coverage)
- Formatter, language server, VS Code packaging checks, and focused unit tests
- Smoother package CLI install path for `lmsh`, `photon`, `lumen-format`, and
  `lumen-lsp`

## Compiler

- Finish the expression AST and stop using token-shape heuristics.
  `RawExpression.parsed` is created but ignored by semantic analysis, type
  checking, and code generation. Represent calls, access, assignment,
  unary/binary operators, arrays, structs, match, and await as real nodes.
- Build a real typed IR. Current `IRFunction.body` contains AST statements.
  Lower expressions and control flow into typed instructions/basic blocks,
  validate IR, and make the backend consume IR only.
- Split the 3,480-line LLVM emitter into focused lowering modules. Separate
  control flow, values, aggregates, built-ins, debug metadata, and runtime ABI
  declarations. Add small golden LLVM tests for each lowering family.
- Strengthen the type checker: require boolean conditions, prove non-void
  functions return on every path, reject use before initialization, fully
  validate match arms, and define generic, nullable, Result, and collection
  variance rules.
- Define one built-in/runtime ABI registry. Function names and signatures are
  duplicated across module registry, expression inspection, type checking,
  emitter code, and C. Generate or consume these tables from one typed
  definition and fail when implementations drift.
- Make diagnostics module-aware and recoverable: preserve file/range data
  through parsing, module loading, IR, and LLVM emission; report multiple
  diagnostics per run with snippets, notes, and imported-file paths.
- Create a JS/self-host parity matrix: differentially compile every supported
  feature with both compilers and compare diagnostics, LLVM behavior, and
  executable output. Do not mark a feature complete until both paths pass.
- Keep expanding focused parser, formatter, LSP, and type checker tests as
  bugs are found.
- Tighten self-host type checks for generics, collections, and function calls.
- Improve self-host diagnostics with richer snippets and recovery.
- Reduce remaining JS-only compiler assumptions until the self-host compiler
  can own the full path comfortably.

## Language

- Stronger generics
- Better typed collections
- More complete Result and Option behavior
- More complete async runtime (syntax reserved, lowers synchronously today)
- More complete pattern matching

## Runtime

- Better filesystem errors (replace empty-string sentinels with typed errors)
- More HTTP routing
- More portable path helpers
- Cleaner JSON typing
- Support Linux instead of returning silent fallbacks for `arg`, `argCount`,
  crypto, and WebSocket handshake helpers
- Split `src/runtime/http.c` into real runtime units (currently all 2,272 lines
  in one file despite split file comments)
- Replace empty-string and integer error sentinels with typed errors across
  file, environment, crypto, JSON, process, thread, and HTTP operations
- Remove shell-command execution from compiler internals: pass argument arrays
  to child processes instead of building commands by string concatenation
- Decide and implement the async model: specify tasks, scheduling,
  cancellation, errors, and thread interaction before expanding the syntax

## Tooling

- Ship a normal `lumen` compiler command for build/emit/run workflows.
  The npm package only exposes `lmsh`, `photon`, formatter, and LSP, while
  `compile.js` has no packaged command.
- Add an installed-package smoke test: pack to a clean temporary directory,
  install the tarball, compile and run a program, install a bundled Photon
  package, start an LSP handshake, and verify all documented commands.
- Keep packaged install docs current as npm and VS Code packaging change.
- Add clearer project init docs and examples.
- Keep Photon package UX growing beyond bundled-package search and `photon add`
  shortcuts.
- Make LSP compilation use the same module graph as CLI compilation. Local
  imports currently produce `Unknown module` in the editor. Also implement
  `didClose`, debounce/cancel stale diagnostics, report all errors, and isolate
  compiler state per document/build.
- Add useful language intelligence after correctness: go-to-definition,
  references, hover types, completion, rename, symbols, semantic tokens, and
  code actions from compiler data instead of re-parsing in the extension.
- Make formatting syntax-aware and idempotent: format from tokens/AST rather
  than line regexes. Add comments, nested literals, multiline calls,
  match/switch, strings containing braces, malformed input, CRLF, and
  format-twice tests.
- Complete package metadata and release automation: add license, repository,
  bugs/homepage, Node engine, publish checks, changelog, version
  synchronization with VS Code/LSP, checksums, and reproducible VSIX/tarball
  release artifacts.

## Tests And Infrastructure

- Add CI on macOS and Linux: run unit, example, negative, bootstrap, package,
  VS Code packaging, sanitizer, and clean-install tests. Cache tools without
  caching generated compiler outputs.
- Split the 1,131-line example test runner into focused suites and helpers so
  one failure does not hide unrelated results. Add direct unit coverage for
  tokenizer, module loader, semantic analyzer, emitter, runtime ABI, CLI
  errors, and repeated compiler use.
- Add parser/compiler fuzzing and property tests: assert the tokenizer/parser
  never hang or crash, formatting is idempotent, invalid programs never reach
  LLVM, and generated LLVM always passes `clang` verification.
- Make temporary outputs collision-safe and cacheable: key artifacts by
  canonical input path, target, compiler version, and flags; write atomically.

## Photon And Distribution

- Harden Photon installs: reject dependency names that escape
  `.photon/packages`, install through a temporary directory, swap atomically
  only after validation, and keep the old install on failure.
- Make `photon.lock` reproducible: read the lock during install, pin Git
  dependencies to exact commits, verify the checked-out commit, and define
  update/frozen-lock commands. The lock is currently rewritten but never used
  to resolve an install.
- Harden the HTTP and Socket.IO runtime before calling it production-ready:
  add request/body limits, partial read/write loops, timeouts, canonical-path
  checks, protocol validation, clean shutdown, and concurrent connection
  handling. Fuzz request and WebSocket parsers.

## Documentation

- Reconcile documentation with actual behavior. README and book disagree about
  full self-hosting, typed IR, supported bootstrap features, and portability.
  Keep one generated feature/support matrix and label auth, JWT, outbound
  HTTPS, and URL packages experimental until implemented.
- Reduce the README to a reliable entry page: move language reference, package
  catalog, benchmarks, compiler internals, and roadmap into maintained book
  pages. Test code snippets and internal links.
- Add contributor and security documents: document toolchain setup,
  architecture, test layers, release process, supported platforms,
  vulnerability reporting, and the security status of network/crypto APIs.
- Either wire `CompilerOptions` into behavior or remove it. Garbage collector,
  ownership, target, and safety settings are public placeholders that
  currently change nothing.