# Setup And First Program

Install the CLI tools first: [Install Lumen](install-lumen.md).

## Requirements

- Node.js 20 or newer
- npm
- `clang` on `PATH`

## Install

From a Lumen repo checkout:

```bash
npm install -g .
```

This installs `lmsh`, `photon`, `lumen-format`, and `lumen-lsp`.

For development, use `npm link` instead so global commands point at your
checkout.

## First Program

Create `hello.lm`:

```lumen
function main(): i32 {
  println("hello")
  return 0
}
```

`main` is the native entry point. The return value becomes the process exit
code.

## Run Like A Script

```bash
lmsh hello.lm
```

`lmsh` compiles, links, and runs a Lumen file in one command.

## Compile To Native

```bash
npm run bootstrap
npm run compile -- examples/basic.lm build/basic.ll
clang -Wno-override-module build/basic.ll src/runtime/http.c -pthread -o build/basic
./build/basic
```

The first command builds the self-host compiler. The second emits LLVM IR.
The third links the object and C runtime into a native executable.

## Emit LLVM Only

```bash
npm run compile -- examples/basic.lm --emit-llvm -o build/basic.ll
```

## Parse And Print AST

```bash
npm run parse -- examples/basic.lm
```

## Run All Tests

```bash
npm run test
```

This runs unit tests, compiles all examples, checks expected output, verifies
bootstrap stages (stage-1 through stage-3), and runs negative compile tests.

## Run Benchmarks

```bash
npm run speedtest
```

Compares Lumen, Rust, Python, and Node on benchmark programs.

## Missing

- Better CLI help output
- A packaged `lumen` binary command (currently only script-level `compile.js`)
- Cross-platform setup notes for Linux