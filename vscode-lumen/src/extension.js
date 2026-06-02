const vscode = require('vscode')
const path = require('path')
const fs = require('fs/promises')
const { spawn } = require('child_process')

async function activate(context) {
  const debugProvider = new LumenDebugConfigurationProvider(context)

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('lumen', debugProvider),
    vscode.commands.registerCommand('lumen.compileCurrentFile', () => compileCurrentFile(context)),
    vscode.commands.registerCommand('lumen.debugCurrentFile', () => debugCurrentFile(context))
  )
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

function deactivate() {}

module.exports = {
  activate,
  deactivate
}
