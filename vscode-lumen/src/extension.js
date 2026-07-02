const vscode = require('vscode')
const path = require('path')
const fs = require('fs/promises')
const { spawn } = require('child_process')

const semanticTokenTypes = [
  'namespace',
  'type',
  'class',
  'enum',
  'interface',
  'struct',
  'typeParameter',
  'parameter',
  'variable',
  'property',
  'enumMember',
  'event',
  'function',
  'method',
  'macro',
  'keyword',
  'modifier',
  'comment',
  'string',
  'number',
  'regexp',
  'operator',
  'decorator'
]

async function activate(context) {
  const debugProvider = new LumenDebugConfigurationProvider(context)
  const languageClient = new LumenLanguageClient(context)
  const semanticLegend = new vscode.SemanticTokensLegend(semanticTokenTypes, [])

  context.subscriptions.push(
    languageClient,
    vscode.debug.registerDebugConfigurationProvider('lumen', debugProvider),
    vscode.languages.registerDocumentFormattingEditProvider('lumen', {
      provideDocumentFormattingEdits: document => languageClient.format(document)
    }),
    vscode.languages.registerDefinitionProvider('lumen', {
      provideDefinition: (document, position) => languageClient.definition(document, position)
    }),
    vscode.languages.registerReferenceProvider('lumen', {
      provideReferences: (document, position, context) => {
        return languageClient.references(document, position, context)
      }
    }),
    vscode.languages.registerHoverProvider('lumen', {
      provideHover: (document, position) => languageClient.hover(document, position)
    }),
    vscode.languages.registerCompletionItemProvider('lumen', {
      provideCompletionItems: (document, position) => {
        return languageClient.completion(document, position)
      }
    }, '.'),
    vscode.languages.registerRenameProvider('lumen', {
      provideRenameEdits: (document, position, newName) => {
        return languageClient.rename(document, position, newName)
      }
    }),
    vscode.languages.registerDocumentSymbolProvider('lumen', {
      provideDocumentSymbols: document => languageClient.documentSymbols(document)
    }),
    vscode.languages.registerWorkspaceSymbolProvider({
      provideWorkspaceSymbols: query => languageClient.workspaceSymbols(query)
    }),
    vscode.languages.registerDocumentSemanticTokensProvider('lumen', {
      provideDocumentSemanticTokens: document => languageClient.semanticTokens(document)
    }, semanticLegend),
    vscode.languages.registerCodeActionsProvider('lumen', {
      provideCodeActions: (document, range, context) => {
        return languageClient.codeActions(document, range, context)
      }
    }, {
      providedCodeActionKinds: [
        vscode.CodeActionKind.QuickFix,
        new vscode.CodeActionKind('source.fixAll.lumen')
      ]
    }),
    vscode.commands.registerCommand('lumen.compileCurrentFile', () => compileCurrentFile(context)),
    vscode.commands.registerCommand('lumen.debugCurrentFile', () => debugCurrentFile(context))
  )

  languageClient.start().catch(error => languageClient.output(`${error.message}\n`))
}

async function compileCurrentFile(context) {
  const document = getLumenDocument()
  if (!document) return

  const output = await compileDocument(context, document)
  vscode.window.showInformationMessage(`Lumen built ${path.basename(output)}`)
}

async function debugCurrentFile(context) {
  const document = getLumenDocument()
  if (!document) return

  const debugConfig = {
    name: 'Debug Lumen File',
    type: 'lumen',
    request: 'launch',
    source: document.uri.fsPath,
    args: [],
    cwd: path.dirname(document.uri.fsPath),
    stopAtEntry: false
  }

  await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(document.uri), debugConfig)
}

class LumenDebugConfigurationProvider {
  constructor(context) {
    this.context = context
  }

  provideDebugConfigurations() {
    return [
      {
        name: 'Debug Lumen File',
        type: 'lumen',
        request: 'launch',
        source: '${file}',
        args: [],
        cwd: '${workspaceFolder}',
        stopAtEntry: false
      }
    ]
  }

  async resolveDebugConfiguration(folder, config) {
    const sourcePath = this.resolveSourcePath(folder, config)
    const document = await getLumenDocumentForPath(sourcePath)

    if (!document) {
      vscode.window.showWarningMessage('Open a Lumen .lm file first')
      return null
    }

    const settings = vscode.workspace.getConfiguration('lumen')
    const debuggerType = settings.get('debuggerType', 'lldb')
    const nativeDebuggerType = resolveNativeDebuggerType(debuggerType)

    if (!nativeDebuggerType) {
      vscode.window.showWarningMessage('Install CodeLLDB or Microsoft C/C++ to debug Lumen files')
      return null
    }

    const program = await compileDocument(this.context, document)

    return createDebugConfig(nativeDebuggerType, program, document.uri.fsPath, config)
  }

  resolveSourcePath(folder, config) {
    const editorPath = vscode.window.activeTextEditor?.document?.uri?.fsPath
    const workspacePath = folder?.uri.fsPath
    const source = config.source || config.program || editorPath

    if (!source || source === '${file}') return editorPath
    if (source === '${workspaceFolder}') return workspacePath
    if (typeof source !== 'string') return editorPath
    if (source.startsWith('${workspaceFolder}/') && workspacePath) {
      return path.join(workspacePath, source.slice('${workspaceFolder}/'.length))
    }
    if (path.isAbsolute(source)) return source
    if (workspacePath) return path.resolve(workspacePath, source)

    return path.resolve(source)
  }
}

function resolveNativeDebuggerType(debuggerType) {
  const hasLldb = Boolean(vscode.extensions.getExtension('vadimcn.vscode-lldb'))
  const hasCppdbg = Boolean(vscode.extensions.getExtension('ms-vscode.cpptools'))

  if (debuggerType === 'lldb') {
    if (hasLldb) return 'lldb'
    if (hasCppdbg) return 'cppdbg'
    return null
  }

  if (debuggerType === 'cppdbg') {
    if (hasCppdbg) return 'cppdbg'
    if (hasLldb) return 'lldb'
    return null
  }

  return null
}

function getLumenDocument() {
  const editor = vscode.window.activeTextEditor
  const document = editor?.document

  if (!document || document.languageId !== 'lumen') {
    vscode.window.showWarningMessage('Open a Lumen .lm file first')
    return null
  }

  return document
}

async function compileDocument(context, document) {
  if (document.isDirty) await document.save()

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  const workspaceRoot = workspaceFolder?.uri.fsPath ?? path.dirname(document.uri.fsPath)
  const config = vscode.workspace.getConfiguration('lumen')
  const buildDirectory = path.resolve(workspaceRoot, config.get('buildDirectory', '.lumen/build'))
  const baseName = path.basename(document.uri.fsPath, '.lm')
  const output = path.join(buildDirectory, baseName)

  await fs.mkdir(buildDirectory, { recursive: true })

  const compilerCli = path.join(context.extensionPath, 'compiler', 'src', 'cli', 'compile.js')
  const env = {
    ...process.env,
    LUMEN_CLANG: config.get('clangPath', 'clang')
  }

  await run(process.execPath, [compilerCli, document.uri.fsPath, '-o', output], {
    cwd: workspaceRoot,
    env
  })

  return output
}

async function getLumenDocumentForPath(sourcePath) {
  const activeDocument = vscode.window.activeTextEditor?.document

  if (!sourcePath && activeDocument?.languageId === 'lumen') return activeDocument
  if (!sourcePath) return null
  if (activeDocument?.uri.fsPath === sourcePath && activeDocument.languageId === 'lumen') return activeDocument

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(sourcePath))
  if (document.languageId !== 'lumen') return null

  return document
}

function createDebugConfig(debuggerType, program, sourcePath, lumenConfig = {}) {
  if (debuggerType === 'cppdbg') {
    return {
      name: 'Debug Lumen File',
      type: 'cppdbg',
      request: 'launch',
      program,
      args: lumenConfig.args || [],
      cwd: resolveCwd(lumenConfig.cwd, sourcePath),
      stopAtEntry: lumenConfig.stopAtEntry || false,
      MIMode: 'lldb'
    }
  }

  return {
    name: 'Debug Lumen File',
    type: 'lldb',
    request: 'launch',
    program,
    args: lumenConfig.args || [],
    cwd: resolveCwd(lumenConfig.cwd, sourcePath),
    stopOnEntry: lumenConfig.stopAtEntry || false
  }
}

function resolveCwd(cwd, sourcePath) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(sourcePath))
  const workspacePath = workspaceFolder?.uri.fsPath

  if (!cwd || cwd === '${fileDirname}') return path.dirname(sourcePath)
  if (cwd === '${workspaceFolder}' && workspacePath) return workspacePath
  if (typeof cwd !== 'string') return path.dirname(sourcePath)
  if (cwd.startsWith('${workspaceFolder}/') && workspacePath) {
    return path.join(workspacePath, cwd.slice('${workspaceFolder}/'.length))
  }
  if (path.isAbsolute(cwd)) return cwd
  if (workspacePath) return path.resolve(workspacePath, cwd)

  return path.resolve(path.dirname(sourcePath), cwd)
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const output = vscode.window.createOutputChannel('Lumen')
    output.show(true)
    output.appendLine(`$ ${command} ${args.join(' ')}`)

    const child = spawn(command, args, options)

    child.stdout.on('data', data => output.append(data.toString()))
    child.stderr.on('data', data => output.append(data.toString()))
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Lumen compile failed with exit code ${code}`))
      }
    })
  })
}

class LumenLanguageClient {
  constructor(context) {
    this.context = context
    this.nextId = 1
    this.pending = new Map()
    this.documents = new Set()
    this.buffer = Buffer.alloc(0)
    this.outputChannel = vscode.window.createOutputChannel('Lumen')
    this.diagnostics = vscode.languages.createDiagnosticCollection('lumen')

    this.subscriptions = [
      this.outputChannel,
      this.diagnostics,
      vscode.workspace.onDidOpenTextDocument(document => this.open(document)),
      vscode.workspace.onDidChangeTextDocument(event => this.change(event.document)),
      vscode.workspace.onDidSaveTextDocument(document => this.save(document)),
      vscode.workspace.onDidCloseTextDocument(document => this.close(document))
    ]
  }

  async start() {
    const server = await this.resolveServerPath()
    this.child = spawn(process.execPath, [server], {
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? this.context.extensionPath,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.child.stdout.on('data', chunk => this.read(chunk))
    this.child.stderr.on('data', chunk => this.output(chunk.toString()))
    this.child.on('error', error => this.output(error.message))
    this.child.on('exit', () => {
      this.child = null
    })

    await this.request('initialize', {
      processId: process.pid,
      rootUri: vscode.workspace.workspaceFolders?.[0]?.uri.toString(),
      capabilities: {}
    })
    this.notify('initialized', {})

    for (const document of vscode.workspace.textDocuments) {
      this.open(document)
    }
  }

  async resolveServerPath() {
    const packaged = path.join(this.context.extensionPath, 'compiler', 'src', 'cli', 'lsp.js')
    const source = path.resolve(this.context.extensionPath, '..', 'src', 'cli', 'lsp.js')

    if (await exists(packaged)) return packaged
    if (await exists(source)) return source

    throw new Error('Lumen language server not found')
  }

  async format(document) {
    if (document.languageId !== 'lumen') return []
    this.open(document)

    const edits = await this.request('textDocument/formatting', {
      textDocument: { uri: document.uri.toString() },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    })

    return edits.map(edit => new vscode.TextEdit(
      new vscode.Range(
        edit.range.start.line,
        edit.range.start.character,
        edit.range.end.line,
        edit.range.end.character
      ),
      edit.newText
    ))
  }

  async definition(document, position) {
    const result = await this.documentRequest(document, 'textDocument/definition', position)
    return result ? toLocation(result) : null
  }

  async references(document, position, context) {
    const result = await this.documentRequest(document, 'textDocument/references', position, {
      context: {
        includeDeclaration: context.includeDeclaration
      }
    })
    return result.map(toLocation)
  }

  async hover(document, position) {
    const result = await this.documentRequest(document, 'textDocument/hover', position)
    if (!result) return null

    const contents = typeof result.contents === 'string'
      ? result.contents
      : result.contents.value
    return new vscode.Hover(
      new vscode.MarkdownString(contents),
      toRange(result.range)
    )
  }

  async completion(document, position) {
    const result = await this.documentRequest(document, 'textDocument/completion', position)
    return result.map(item => {
      const completion = new vscode.CompletionItem(item.label, item.kind)
      completion.detail = item.detail
      if (item.insertText) completion.insertText = item.insertText
      return completion
    })
  }

  async rename(document, position, newName) {
    const result = await this.documentRequest(document, 'textDocument/rename', position, {
      newName
    })
    return result ? toWorkspaceEdit(result) : null
  }

  async documentSymbols(document) {
    this.open(document)
    const result = await this.request('textDocument/documentSymbol', {
      textDocument: {
        uri: document.uri.toString()
      }
    })
    return result.map(symbol => new vscode.SymbolInformation(
      symbol.name,
      symbol.kind,
      symbol.containerName || '',
      toLocation(symbol.location)
    ))
  }

  async workspaceSymbols(query) {
    const result = await this.request('workspace/symbol', { query })
    return result.map(symbol => new vscode.SymbolInformation(
      symbol.name,
      symbol.kind,
      symbol.containerName || '',
      toLocation(symbol.location)
    ))
  }

  async semanticTokens(document) {
    this.open(document)
    const result = await this.request('textDocument/semanticTokens/full', {
      textDocument: {
        uri: document.uri.toString()
      }
    })
    return new vscode.SemanticTokens(new Uint32Array(result.data))
  }

  async codeActions(document, range, context) {
    this.open(document)
    const result = await this.request('textDocument/codeAction', {
      textDocument: {
        uri: document.uri.toString()
      },
      range: fromRange(range),
      context: {
        diagnostics: context.diagnostics.map(fromDiagnostic)
      }
    })
    return result.map(item => {
      const action = new vscode.CodeAction(
        item.title,
        new vscode.CodeActionKind(item.kind)
      )
      action.edit = item.edit ? toWorkspaceEdit(item.edit) : undefined
      action.isPreferred = item.isPreferred
      return action
    })
  }

  async documentRequest(document, method, position, extra = {}) {
    this.open(document)
    return this.request(method, {
      textDocument: {
        uri: document.uri.toString()
      },
      position: {
        line: position.line,
        character: position.character
      },
      ...extra
    })
  }

  open(document) {
    if (document.languageId !== 'lumen' || !this.child) return
    const uri = document.uri.toString()

    if (this.documents.has(uri)) {
      this.change(document)
      return
    }

    this.documents.add(uri)
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'lumen',
        version: document.version,
        text: document.getText()
      }
    })
  }

  change(document) {
    if (document.languageId !== 'lumen' || !this.child) return
    const uri = document.uri.toString()
    if (!this.documents.has(uri)) return this.open(document)

    this.notify('textDocument/didChange', {
      textDocument: {
        uri,
        version: document.version
      },
      contentChanges: [{
        text: document.getText()
      }]
    })
  }

  save(document) {
    if (document.languageId !== 'lumen' || !this.child) return

    this.notify('textDocument/didSave', {
      textDocument: {
        uri: document.uri.toString()
      },
      text: document.getText()
    })
  }

  close(document) {
    if (document.languageId !== 'lumen') return
    const uri = document.uri.toString()
    this.documents.delete(uri)
    this.diagnostics.delete(document.uri)
    if (this.child) {
      this.notify('textDocument/didClose', {
        textDocument: { uri }
      })
    }
  }

  request(method, params) {
    const id = this.nextId
    this.nextId += 1

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.write({
        jsonrpc: '2.0',
        id,
        method,
        params
      })
    })
  }

  notify(method, params) {
    this.write({
      jsonrpc: '2.0',
      method,
      params
    })
  }

  read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return

      const header = this.buffer.slice(0, headerEnd).toString('utf8')
      const match = /Content-Length: (\d+)/i.exec(header)
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }

      const length = Number(match[1])
      const bodyStart = headerEnd + 4
      const bodyEnd = bodyStart + length
      if (this.buffer.length < bodyEnd) return

      const body = this.buffer.slice(bodyStart, bodyEnd).toString('utf8')
      this.buffer = this.buffer.slice(bodyEnd)
      this.handle(JSON.parse(body))
    }
  }

  handle(message) {
    if (message.method === 'textDocument/publishDiagnostics') {
      const uri = vscode.Uri.parse(message.params.uri)
      const diagnostics = message.params.diagnostics.map(diagnostic => new vscode.Diagnostic(
        new vscode.Range(
          diagnostic.range.start.line,
          diagnostic.range.start.character,
          diagnostic.range.end.line,
          diagnostic.range.end.character
        ),
        diagnostic.message,
        vscode.DiagnosticSeverity.Error
      ))
      this.diagnostics.set(uri, diagnostics)
      return
    }

    if (message.id === undefined) return

    const pending = this.pending.get(message.id)
    if (!pending) return

    this.pending.delete(message.id)
    if (message.error) pending.reject(new Error(message.error.message))
    else pending.resolve(message.result)
  }

  write(message) {
    if (!this.child) return

    const body = JSON.stringify(message)
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
  }

  output(message) {
    this.outputChannel.append(message)
  }

  dispose() {
    for (const item of this.subscriptions) item.dispose()

    if (this.child) {
      this.notify('shutdown', null)
      this.notify('exit', null)
      this.child.kill()
    }
  }
}

function toLocation(location) {
  return new vscode.Location(
    vscode.Uri.parse(location.uri),
    toRange(location.range)
  )
}

function toRange(range) {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character
  )
}

function fromRange(range) {
  return {
    start: {
      line: range.start.line,
      character: range.start.character
    },
    end: {
      line: range.end.line,
      character: range.end.character
    }
  }
}

function fromDiagnostic(diagnostic) {
  return {
    range: fromRange(diagnostic.range),
    severity: diagnostic.severity,
    message: diagnostic.message,
    source: diagnostic.source
  }
}

function toWorkspaceEdit(edit) {
  const workspaceEdit = new vscode.WorkspaceEdit()
  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    for (const item of edits) {
      workspaceEdit.replace(
        vscode.Uri.parse(uri),
        toRange(item.range),
        item.newText
      )
    }
  }
  return workspaceEdit
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
}
