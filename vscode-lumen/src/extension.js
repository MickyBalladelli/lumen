const vscode = require('vscode')
const path = require('path')
const fs = require('fs/promises')
const { spawn } = require('child_process')

async function activate(context) {
  context.subscriptions.push(
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

  const program = await compileDocument(context, document)
  const config = vscode.workspace.getConfiguration('lumen')
  const debuggerType = config.get('debuggerType', 'lldb')
  const debugConfig = createDebugConfig(debuggerType, program, document.uri.fsPath)

  await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(document.uri), debugConfig)
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

function createDebugConfig(debuggerType, program, sourcePath) {
  if (debuggerType === 'cppdbg') {
    return {
      name: 'Debug Lumen File',
      type: 'cppdbg',
      request: 'launch',
      program,
      args: [],
      cwd: path.dirname(sourcePath),
      stopAtEntry: false,
      MIMode: 'lldb'
    }
  }

  return {
    name: 'Debug Lumen File',
    type: 'lldb',
    request: 'launch',
    program,
    args: [],
    cwd: path.dirname(sourcePath)
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

function deactivate() {}

module.exports = {
  activate,
  deactivate
}
