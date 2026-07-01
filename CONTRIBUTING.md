# Contributing To Lumen

Lumen is a pre-1.0 language, compiler, and native runtime. Read
[SECURITY.md](SECURITY.md) before changing network, crypto, package-install, or
process-execution code.

## Toolchain Setup

Development currently targets macOS and Linux.

Required:

- Git
- Node.js 20 or newer
- npm
- `clang` on `PATH`
- A POSIX environment with pthreads

Optional:

- VS Code 1.85 or newer and CodeLLDB for extension work
- A Clang build with libFuzzer for native parser fuzzing
- Rust and Python for cross-language benchmarks

Set up a checkout:

```bash
git clone https://github.com/MickyBalladelli/lumen.git
cd lumen
npm install
npm run check:abi
npm run test:unit
```

Build the Lumen-written compiler:

```bash
npm run bootstrap
```

Generated files belong under `build/` and should not be committed.

## Architecture

The JavaScript compiler in `src/` is the primary implementation:

```text
source
  -> tokenizer
  -> parser and expression AST
  -> semantic analysis and type checking
  -> typed, validated IR
  -> LLVM lowering
  -> clang
  -> native executable plus selected C runtime units
```

Main areas:

| Path | Responsibility |
| --- | --- |
| `src/lexer`, `src/parser`, `src/ast` | Tokens and source AST |
| `src/semantics` | Names, scopes, types, and diagnostics |
| `src/ir` | Typed IR construction and validation |
| `src/backend` | Focused LLVM lowering modules and runtime ABI declarations |
| `src/runtime` | Native C11/POSIX runtime units selected by referenced symbols |
| `src/modules` | Local and Photon module graph |
| `src/compiler` | Pipeline orchestration and `clang` driver |
| `compiler` | Lumen-written self-host compiler |
| `src/cli`, `src/lsp` | Commands, package manager, formatter, and language server |
| `vscode-lumen` | VS Code extension |

Built-in names, types, LLVM declarations, and C symbols meet in
`src/runtime/BuiltinRegistry.js`. Any runtime ABI change must update that
registry, its C implementation, runtime-unit ownership, and tests together.

The self-host compiler supports a deliberate subset. Changes to shared language
behavior should preserve the feature matrix in `src/parity/FeatureMatrix.js`.

## Code Style

- Use ECMAScript modules and omit JavaScript semicolons.
- Keep compiler passes small and put new lowering families in focused files.
- Keep C runtime code C11-compatible and compile cleanly with `-Wall -Wextra
  -Werror`.
- Preserve source locations through AST, IR, and backend diagnostics.
- Add a regression test with every bug fix.
- Update the README or book when syntax, behavior, or support status changes.

Do not edit golden LLVM merely to hide an unexplained change. Inspect the
generated IR first.

## Test Layers

| Command | Layer |
| --- | --- |
| `npm run test:unit` | Parser, types, IR, LLVM goldens, modules, LSP, Photon, and ABI registry |
| `npm run check:abi` | Registry declarations against C runtime implementations |
| `npm run test:http-runtime` | C runtime, HTTP parser, WebSocket, platform, and crypto vectors |
| `node src/cli/test-examples.js` | Native examples, negative cases, LSP checks, and three-stage bootstrap equality |
| `npm run test:parity` | JS/self-host diagnostics, LLVM behavior, and executable parity |
| `npm run test:sanitizers` | Native ASan and UBSan runtime checks |
| `npm run fuzz:http` | HTTP-request and WebSocket parser fuzzing |
| `npm test` | All standard layers except the separate fuzz run |

The full suite builds many native executables and the stage-2/stage-3 compiler,
so it is much slower than unit tests.

Use the smallest useful test while working, then run `npm test` before handing
off a compiler or runtime change. Also run `npm run fuzz:http` for changes to
HTTP request or WebSocket parsing.

For VS Code extension changes:

```bash
cd vscode-lumen
npm install
npm run package
```

## Pull Requests

Before opening a pull request:

1. Explain the behavior change and its tradeoffs.
2. Add focused tests and update affected documentation.
3. Run the relevant focused suites and `npm test`.
4. Keep generated `build/`, tarball, and VSIX artifacts out of the commit.
5. Call out platform-specific behavior and security impact.

There is no automated CI yet. Include the tested OS, Node version, and Clang
version in the pull request.

## Release Process

Releases are manual. There is no CI release job, prepublish gate, automatic
changelog, or automatic checksum generation.

Only a maintainer should release:

1. Start from a clean checkout and choose a version.
2. Keep versions synchronized in `package.json`, `photon.json`,
   `vscode-lumen/package.json`, and `vscode-lumen/package-lock.json`.
3. Update user documentation and describe security-relevant changes.
4. Run:

   ```bash
   npm install
   npm run check:abi
   npm test
   npm run fuzz:http
   npm pack --dry-run
   cd vscode-lumen
   npm install
   npm run package
   ```

5. Return to the repository root and build the npm tarball with `npm pack`.
6. Test the tarball and VSIX in disposable, clean environments.
7. Generate SHA-256 checksums for the tarball and VSIX.
8. Create a signed or annotated `vX.Y.Z` tag and a GitHub release containing
   release notes, artifacts, and checksums.
9. Publish to npm or the VS Code Marketplace only after the attached artifacts
   match the tested files.

Until release automation exists, a second maintainer should verify versions,
test results, artifact contents, and checksums.
