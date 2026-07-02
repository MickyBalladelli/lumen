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
| `npm run test:package` | Pack, clean-install, command, Photon, and LSP smoke test |
| `npm run test:integration` | All integration suites; continues after a suite fails |
| `npm run test:examples`, `test:cli`, `test:negative`, `test:lsp` | Focused native workflow suites |
| `npm run test:bootstrap` | Three-stage bootstrap behavior and output equality |
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

Include the tested OS, Node version, and Clang version in the pull request.

## Release Process

Only a maintainer should release:

1. Start from a clean checkout and update `CHANGELOG.md`.
2. Set the version with `npm version X.Y.Z`. The npm version hook synchronizes
   Photon and VS Code metadata. The LSP reads the npm package version directly.
3. Update user documentation and describe security-relevant changes.
4. Run the publish checks and build the release files:

   ```bash
   npm ci --prefix vscode-lumen
   npm run release:check
   npm run release:artifacts
   cd dist
   shasum -a 256 -c SHA256SUMS
   ```

5. Optionally run the separate HTTP fuzz suite for runtime parser changes.
6. Create and push a signed or annotated `vX.Y.Z` tag.
7. The release workflow checks the tag version, reruns publish checks, verifies
   two byte-identical builds, and creates a GitHub release containing the npm
   tarball, VSIX, and `SHA256SUMS`.
8. Publish to npm or the VS Code Marketplace only from the tested artifacts.

Running `npm publish` also invokes `release:check` through `prepublishOnly`.
