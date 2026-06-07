# Setup And First Program

Install the CLI tools first: [Install Lumen](install-lumen.md).

Use the JS compiler to compile a Lumen file:

```bash
node src/cli/compile.js examples/basic.lm -o build/basic
./build/basic
```

Emit LLVM only:

```bash
node src/cli/compile.js examples/basic.lm --emit-llvm -o build/basic.ll
```

Run all examples:

```bash
node src/cli/test-examples.js
```

## First Program

```lumen
function main(): i32 {
  println("hello")
  return 0
}
```

`main` is the native entry point. Return value becomes process exit code.

## Missing

- Better CLI help output
- Cross-platform setup notes
