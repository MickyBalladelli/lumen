# Install Lumen

This page is the official local install path for the Lumen CLI tools and VS Code extension.

## Requirements

- Node.js 20 or newer
- npm
- `clang` on `PATH`
- VS Code, only if you want editor support

Check the toolchain:

```bash
node --version
npm --version
clang --version
```

## Install CLI Tools

From a Lumen repo checkout:

```bash
npm run test:bootstrap:real
node scripts/stage-native-compiler.mjs
npm install -g .
```

This installs:

- `lumen`
- `lmsh`
- `photon`
- `lumen-format`
- `lumen-lsp`

Check the commands:

```bash
lumen --version
lumen run examples/basic.lm
lmsh examples/basic.lm
photon list
lumen-format --check examples/basic.lm
lumen-lsp
```

Stop `lumen-lsp` with `Ctrl-C` after the command starts.

## Developer Link

Use `npm link` when editing this repo and wanting global commands to point at your checkout:

```bash
npm link
```

Check the linked commands:

```bash
lumen emit examples/basic.lm -o build/basic.ll
lmsh examples/cli-args.lm first second
photon list
lumen-format --check examples/basic.lm
```

Remove the link:

```bash
npm unlink -g lumen
```

## Install From A Tarball

Download `lumen-X.Y.Z.tgz` and the `SHA256SUMS-<platform>-<architecture>` file
from the matching GitHub release, then verify it:

```bash
shasum -a 256 -c SHA256SUMS-darwin-arm64
```

Install that tarball globally:

```bash
npm install -g ./lumen-0.1.0.tgz
```

If the version changes, use the tarball name from that release.

Maintainers can create the tarball, VSIX, and checksum file locally:

```bash
npm ci --prefix vscode-lumen
npm run release:artifacts
cd dist
shasum -a 256 -c SHA256SUMS-darwin-arm64
```

The release command builds each artifact twice and stops if the bytes differ.

## VS Code Extension

Download `lumen-language-X.Y.Z.vsix` from the matching GitHub release, verify
it with the supplied platform checksum file, then install it:

```bash
code --install-extension lumen-language-0.1.0.vsix
```

To package only the extension from a checkout:

```bash
cd vscode-lumen
npm ci
npm run package
```

If the version changes, use the VSIX name printed by `npm run package`.

The extension includes syntax highlighting, snippets, formatting, diagnostics,
definition, references, hover, completion, rename, symbols, semantic tokens,
code actions through `lumen-lsp`, compile command, and native debug launch
support.

## Update

Update a global checkout install:

```bash
git pull
npm install -g .
```

Update a developer link:

```bash
git pull
npm link
```

Rebuild and reinstall the VS Code extension after compiler or extension changes:

```bash
cd vscode-lumen
npm run package
code --install-extension lumen-language-0.1.0.vsix --force
```
