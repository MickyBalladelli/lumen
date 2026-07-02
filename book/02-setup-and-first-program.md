# Setup And First Program

## Requirements

- **Node.js 20 or newer** — the JS compiler runs on Node.
- **npm** — for installing packages and running scripts.
- **`clang` on `PATH`** — the LLVM backend emits `.ll` text; `clang` links it
  into native executables.
- **VS Code** (optional) — for editor support with syntax highlighting,
  diagnostics, formatting, and native debug launch.

Check your toolchain:

```bash
node --version    # should be v20.x or newer
npm --version
clang --version
```

## Install CLI Tools

Clone the Lumen repository and install globally:

```bash
git clone https://github.com/MickyBalladelli/lumen.git
cd lumen
npm install -g .
```

This installs five commands on your PATH:

| Command | Purpose |
| --- | --- |
| `lumen` | Build, emit LLVM, or run a Lumen program |
| `lmsh` | Compile, link, and run a Lumen file in one command |
| `photon` | Manage Lumen packages (init, add, install, search, list) |
| `lumen-format` | Format Lumen source files (`--check` for CI validation) |
| `lumen-lsp` | Language server for editor diagnostics and formatting |

Verify the installation:

```bash
lumen --version
lumen run examples/basic.lm
lmsh examples/basic.lm
photon list
lumen-format --check examples/basic.lm
lumen-lsp          # stop with Ctrl-C after it starts
```

### Developer Link

When editing the Lumen repo itself, use `npm link` so that global commands
point at your working checkout:

```bash
npm link
```

Now any source changes take effect immediately when you run `lumen`, `lmsh`,
`photon`, `lumen-format`, or `lumen-lsp`.

Remove the link when you're done:

```bash
npm unlink -g lumen
```

### Install From A Tarball

Build a portable `.tgz` package and install it:

```bash
npm pack
npm install -g ./lumen-0.1.0.tgz
```

## VS Code Extension

Package the extension from the `vscode-lumen/` directory:

```bash
cd vscode-lumen
npm install
npm run package
code --install-extension lumen-language-0.1.0.vsix
```

The extension provides:

- **Syntax highlighting** for `.lm` files
- **Snippets** for common patterns (functions, loops, structs)
- **Formatting** via `lumen-lsp` (format on save)
- **Diagnostics** via `lumen-lsp` (errors with source snippets and carets)
- **Compile command** from the editor
- **Native debug launch** support through CodeLLDB

## First Program

Create a file named `hello.lm`:

```lumen
function main(): i32 {
  println("hello")
  return 0
}
```

Every Lumen program needs a `main` function. It is the native entry point —
exactly like `main` in C. The return type `i32` means the function returns a
32-bit integer, which becomes the process exit code. A return of `0` means
success.

## Run Like A Script

```bash
lumen run hello.lm
```

`lumen run` performs three steps automatically:

1. **Compile** — the Lumen compiler reads `hello.lm` and emits LLVM IR
2. **Link** — `clang` links the LLVM IR with the C runtime into a native
   executable
3. **Run** — the executable runs and prints its output

This is the fastest way to iterate. No manual build steps needed.

## Compile To Native (Step By Step)

For more control, break the process into explicit steps:

### Step 1: Build The Self-Host Compiler

```bash
npm run bootstrap
```

This compiles `compiler/main.lm` (the Lumen-written compiler) into a native
executable at `build/lumen-compiler`. You only need to do this once, or when
the compiler itself changes.

### Step 2: Emit LLVM IR

```bash
npm run compile -- examples/basic.lm build/basic.ll
```

This runs the self-host compiler on your Lumen source and writes LLVM IR to
`build/basic.ll`. The `--` separates npm arguments from the arguments passed to
the compile script.

### Step 3: Link The Native Executable

```bash
clang -Wno-override-module build/basic.ll -o build/basic
```

What each flag does:
- `-Wno-override-module` — suppresses a warning about LLVM's target triple
  override, harmless for development
- `-o build/basic` — names the output executable

This basic program only uses libc-backed output, so it needs no Lumen runtime
unit. The JavaScript compiler driver selects required runtime units
automatically for programs that use them.

### Step 4: Run

```bash
./build/basic
```

Prints `hello` and `3` (from the example), then exits with code `3`.

## Emit LLVM Only

If you want to inspect the LLVM IR without linking:

```bash
lumen emit examples/basic.lm -o build/basic.ll
```

Open `build/basic.ll` to see the generated IR.

## Parse And Print AST

```bash
npm run parse -- examples/basic.lm
```

This runs the JS compiler's parser on the source file and prints the AST as
JSON. Useful for understanding how Lumen parses your code.

## Compile From lumen.json

Create a `lumen.json` in your project root:

```json
{
  "entry": "main.lm",
  "output": "build/app"
}
```

Then run the compiler without arguments:

```bash
lumen build
```

The compiler reads `lumen.json`, compiles `main.lm`, and writes the native
executable to `build/app`. `lumen emit` and `lumen run` use the same config.

## Run All Tests

```bash
npm run test
```

This comprehensive test suite runs:

1. **Unit tests** — JavaScript tests for the tokenizer, parser, semantic
   analyzer, type checker, module graph, formatter, and compiler
2. **Example tests** — compiles every example in `examples/`, links the
   binaries, runs them, and checks expected output
3. **Bootstrap tests** — builds the stage-1 compiler, verifies stage-2 and
   stage-3 byte-for-byte equality, runs the stage-3 compiler independently
4. **Negative tests** — verifies that invalid programs produce compiler errors
   with nonzero exit codes
5. **Sanitizer tests** — runs compiled programs under ASan and UBSan to verify
   runtime memory safety

## Run Benchmarks

```bash
npm run speedtest
```

This compiles and runs benchmark programs (sum, fib, branch, math, nested,
state) in Lumen, Rust, Python, and Node.js. Precompiled Lumen (`lumen`) and
`lmsh` compile-and-run mode are both measured. Results show best and median run
times in milliseconds. Set `LUMEN_SPEEDTEST_RUNS=5` to increase the number of
runs from the default 3. Each benchmark has its own section. The winning row is
green, section headings are cyan, and unavailable or invalid rows are yellow.

Missing toolchain entries (no `rustc`, `python3`, or `node`) are noted as
missing rather than failing the test.

## Format Source Files

Format a Lumen file:

```bash
lumen-format examples/basic.lm
```

Check formatting without changing files (useful in CI):

```bash
lumen-format --check examples/basic.lm
```

Also available as `npm run format`.

## Start The Language Server

```bash
lumen-lsp
```

The language server speaks LSP over stdio. Configure your editor to launch it
for `.lm` files, or install the VS Code extension which does this
automatically.

## Project Layout

A typical Lumen project after compilation:

```text
my-project/
  main.lm            your source
  lumen.json         compiler config (optional)
  photon.json        package manifest (optional)
  build/
    main.ll           emitted LLVM IR
    main              native executable
  .photon/
    packages/         installed Photon packages
```

## Available npm Scripts

| Script | Purpose |
| --- | --- |
| `npm run lumen -- <command>` | Run the packaged build/emit/run command |
| `npm run bootstrap` | Build the self-host compiler |
| `npm run compile -- <in> <out.ll>` | Compile a Lumen file with the self-host compiler |
| `npm run lmsh -- <file.lm> [args...]` | Compile, link, and run a Lumen file |
| `npm run parse -- <file.lm>` | Print the AST as JSON |
| `npm run format -- <file.lm>` | Format a Lumen file |
| `npm run format -- --check <file.lm>` | Check formatting |
| `npm run lsp` | Start the language server |
| `npm run http` | Run the HTTP example server |
| `npm run chat` | Run the Socket.IO chat example |
| `npm run speedtest` | Run benchmarks |
| `npm run test` | Run the full test suite |
| `npm run test:unit` | Run only unit tests |
| `npm run test:package` | Test the packed CLI from a clean temporary install |
| `npm run test:sanitizers` | Run only sanitizer tests |

## Missing

- Better CLI help output with subcommand descriptions and examples.
- Cross-platform setup notes for Linux.
