# Lumen

Lumen is a pre-1.0 systems language with JavaScript-like syntax, static checks,
LLVM output, and native executables.

The primary compiler is written in Lumen and rebuilds itself through verified
bootstrap stages. JavaScript is used only as the explicit stage-0 recovery seed.

## Start Here

- [Install Lumen](book/install-lumen.md)
- [Read the book](book/table-of-contents.md)
- Check the [generated feature and support matrix](book/support-matrix.md)

Development currently targets macOS and Linux with Node.js 20+, npm, Clang,
POSIX APIs, and pthreads. Windows is not supported.

## Quick Start

Install the command-line tools from a checkout:

```bash
npm install -g .
```

Create `hello.lm`:

```lumen check
function main(): i32 {
  println("hello lumen")
  return 0
}
```

Compile and run it:

```bash
lumen run hello.lm
```

The installation also provides:

- **`lmsh`** — Interpreter-like script runner. Executes Lumen files directly,
  similar to `python` or `node`.
- **`photon`** — Package manager. Installs external packages from local paths
  or Git URLs into `.photon/packages/`. Commands include `init`, `add`,
  `install`, `search`, and `list`.
- **`lumen-format`** — Source code formatter for `.lm` files. Use `--check`
  for CI validation (exits non-zero if any file would change).
- **`lumen-lsp`** — Language server implementing the Language Server Protocol.
  Provides diagnostics, formatting, go-to-definition, references, hover,
  completion, rename, symbols, and semantic tokens for editor integration.

## Current Shape

- The Lumen-written native compiler handles normal builds. JavaScript remains
  the explicit stage-0 recovery seed.
- `lumen build`, `lumen emit`, and `lumen run` provide normal compiler flows.
- The installed `lumen` launcher is POSIX shell plus the native Lumen compiler;
  it does not start Node.js.
- Photon installs bundled, local, and Git packages.
- The formatter, language server, and VS Code extension provide editor tooling.
- The native runtime includes files, processes, threads, tasks, crypto, HTTP,
  WebSocket, JSON, strings, collections, and bounds checks.
- The compiler rebuilds itself from source through verified stage 2 and stage 3.

Exact compiler, platform, and package claims live only in the
[generated support matrix](book/support-matrix.md).

## Documentation

- Language guide: [values and functions](book/03-values-types-and-functions.md),
  [control flow](book/04-control-flow.md), and
  [collections](book/05-collections-and-structs.md)
- Runtime guide: [strings and JSON](book/06-strings-json-and-helpers.md),
  [files and CLI](book/07-files-env-cli.md), and
  [errors and results](book/09-errors-results-options.md)
- HTTP and package guide: [HTTP and Photon](book/08-http-and-packages.md)
- Compiler guide: [compiler and bootstrap](book/10-compiler-and-bootstrap.md)
- Performance notes: [benchmarks](book/benchmarks.md)
- Roadmap: [missing pieces](book/11-missing-pieces.md)

## Project

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [MIT license](LICENSE)
