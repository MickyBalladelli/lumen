import { readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { Compiler } from '../compiler/Compiler.js'

const commands = new Set(['build', 'emit', 'run'])

export class LumenCommandError extends Error {}

export const lumenHelp = `usage: lumen <command> [file.lm] [options]

commands:
  build [file.lm]       build a native executable
  emit [file.lm]        emit LLVM IR
  run [file.lm]         build and run a program

options:
  -o, --output <path>   set executable or LLVM output path
  --config <path>       use a config file (default: lumen.json)
  --clang <path>        set the clang executable
  --release             enable optimized native builds
  -h, --help            show help
  -V, --version         show version

run arguments follow --:
  lumen run main.lm -- first second

When file.lm is omitted, lumen reads entry and output from lumen.json.`

export function parseLumenArguments(argv) {
  if (argv.length === 0 || argv[0] === 'help' || argv.includes('-h') || argv.includes('--help')) {
    return { help: true }
  }
  if (argv[0] === '-V' || argv[0] === '--version') return { version: true }

  const command = argv[0]
  if (!commands.has(command)) {
    throw new LumenCommandError(`Unknown command "${command}"`)
  }

  const options = {
    command,
    input: null,
    output: null,
    config: 'lumen.json',
    configExplicit: false,
    clang: null,
    release: false,
    programArgs: []
  }

  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index]

    if (value === '--') {
      options.programArgs = argv.slice(index + 1)
      break
    }
    if (value === '-V' || value === '--version') return { version: true }
    if (value === '-o' || value === '--output') {
      options.output = optionValue(argv, ++index, value)
      continue
    }
    if (value === '--config') {
      options.config = optionValue(argv, ++index, value)
      options.configExplicit = true
      continue
    }
    if (value === '--clang') {
      options.clang = optionValue(argv, ++index, value)
      continue
    }
    if (value === '--release') {
      options.release = true
      continue
    }
    if (value.startsWith('-')) {
      throw new LumenCommandError(`Unknown option "${value}"`)
    }
    if (options.input) {
      throw new LumenCommandError('Only one input file is allowed; put run arguments after --')
    }
    options.input = value
  }

  if (command !== 'run' && options.programArgs.length > 0) {
    throw new LumenCommandError(`${command} does not accept program arguments`)
  }

  return options
}

export async function runLumenCommand(options, {
  cwd = process.cwd(),
  env = process.env,
  compiler = new Compiler(),
  print = value => console.log(value),
  execute = executeProgram,
  loadFile = readFile
} = {}) {
  const project = await resolveProject(options, { cwd, loadFile })
  const clang = options.clang ?? env.LUMEN_CLANG ?? 'clang'

  if (options.command === 'emit') {
    await compiler.writeLLVMFile(project.input, project.output)
    print(project.output)
    return 0
  }

  await compiler.writeLLVMFile(project.input, project.llvm)
  await compiler.buildExecutable(project.llvm, project.output, {
    clang,
    optimize: options.release
  })

  if (options.command === 'build') {
    print(project.output)
    return 0
  }

  return await execute(project.output, options.programArgs, env)
}

export async function resolveProject(options, {
  cwd = process.cwd(),
  loadFile = readFile
} = {}) {
  let config = null
  let configDirectory = cwd

  if (!options.input || options.configExplicit) {
    const configPath = resolve(cwd, options.config)
    configDirectory = dirname(configPath)
    config = await readConfig(configPath, loadFile)
  }

  const input = options.input
    ? resolve(cwd, options.input)
    : resolveConfigPath(configDirectory, config?.entry, 'Config needs string "entry"')
  const configuredOutput = config && Object.hasOwn(config, 'output')
    ? resolveConfigPath(configDirectory, config.output, 'Config "output" must be a string')
    : null
  const baseOutput = options.output
    ? resolve(cwd, options.output)
    : configuredOutput
      ? configuredOutput
      : resolve(cwd, join('build', basename(input, '.lm')))

  if (options.command === 'emit') {
    const output = options.output
      ? baseOutput
      : baseOutput.endsWith('.ll')
        ? baseOutput
        : `${baseOutput}.ll`
    return { input, output, llvm: output }
  }

  return {
    input,
    output: baseOutput,
    llvm: `${baseOutput}.ll`
  }
}

function optionValue(argv, index, option) {
  const value = argv[index]
  if (!value || value === '--') {
    throw new LumenCommandError(`${option} needs a value`)
  }
  return value
}

async function readConfig(path, loadFile) {
  let source
  try {
    source = await loadFile(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new LumenCommandError(`No input file and no config at ${path}`)
    }
    throw error
  }

  try {
    const config = JSON.parse(source)
    if (!config || Array.isArray(config) || typeof config !== 'object') {
      throw new Error()
    }
    return config
  } catch {
    throw new LumenCommandError(`Invalid JSON config at ${path}`)
  }
}

function resolveConfigPath(directory, value, message) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new LumenCommandError(message)
  }
  return resolve(directory, value)
}

function executeProgram(path, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(resolve(path), args, {
      stdio: 'inherit',
      env
    })

    child.on('error', error => {
      reject(new LumenCommandError(`Cannot run ${path}: ${error.message}`))
    })
    child.on('close', code => {
      resolvePromise(code ?? 1)
    })
  })
}
