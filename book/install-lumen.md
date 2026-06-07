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
npm install -g .
```

This installs:

- `lmsh`
- `photon`
- `lumen-format`
- `lumen-lsp`

Check the commands:

```bash
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
lmsh examples/cli-args.lm first second
photon list
lumen-format --check examples/basic.lm
```

Remove the link:

```bash
npm unlink -g lumen
```

## Install From A Tarball

Build a package tarball:

```bash
npm pack
```

Install that tarball globally:

```bash
npm install -g ./lumen-0.1.0.tgz
```

If the version changes, use the tarball name printed by `npm pack`.

## VS Code Extension

Package the extension:

```bash
cd vscode-lumen
npm install
npm run package
```

Install the generated VSIX:

```bash
code --install-extension lumen-language-0.1.0.vsix
```

If the version changes, use the VSIX name printed by `npm run package`.

The extension includes syntax highlighting, snippets, formatting, diagnostics through `lumen-lsp`, compile command, and native debug launch support.

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
