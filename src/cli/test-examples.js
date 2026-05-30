import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import { Compiler } from '../compiler/Compiler.js'

const examplesDir = 'examples'
const outputDir = 'build'
const compiler = new Compiler()
const dataText = await readFile(join(examplesDir, 'data.txt'), 'utf8')
const compileOnly = new Set([
  'http-api',
  'http-files',
  'http-server'
])

const expectations = new Map([
  ['array', {
    stdout: '16\n',
    code: 16
  }],
  ['basic', {
    stdout: 'hello\n3\n',
    code: 3
  }],
  ['for-loop', {
    stdout: '10\n',
    code: 10
  }],
  ['for-of', {
    stdout: '26\n',
    code: 26
  }],
  ['fs', {
    stdout: `${dataText}\n1\n`,
    code: 0
  }],
  ['native-main', {
    stdout: '10\n',
    code: 10
  }],
  ['newline-continuation', {
    stdout: '6\n',
    code: 6
  }],
  ['numbers', {
    stdout: '10000000032\n3.750000\n1\n',
    code: 0
  }],
  ['println', {
    stdout: 'total\n10\n',
    code: 10
  }],
  ['struct', {
    stdout: '11\n',
    code: 11
  }],
  ['system', {
    stdout: '5\n1\n0\n1\n0\n3\n4\n5\n12\n',
    code: 12
  }],
  ['try-catch', {
    stdout: 'boom\n7\n',
    code: 7
  }]
])

const files = (await readdir(examplesDir))
  .filter(file => file.endsWith('.lm'))
  .sort()

let failures = 0

for (const file of files) {
  const name = basename(file, '.lm')
  const inputPath = join(examplesDir, file)
  const llvmPath = join(outputDir, `${name}.ll`)
  const executablePath = join(outputDir, name)
  const source = await readFile(inputPath, 'utf8')

  await compiler.writeLLVM(source, llvmPath)
  await compiler.buildExecutable(llvmPath, executablePath)

  if (compileOnly.has(name)) {
    console.log(`ok ${name} compile`)
    continue
  }

  const result = await runExecutable(executablePath)
  const expected = expectations.get(name)

  if (!expected) {
    failures += 1
    console.error(`missing expectation for ${name}`)
    continue
  }

  if (result.stdout !== expected.stdout || result.code !== expected.code) {
    failures += 1
    console.error(`failed ${name}`)
    console.error(`expected code ${expected.code}, got ${result.code}`)
    console.error(`expected stdout ${JSON.stringify(expected.stdout)}, got ${JSON.stringify(result.stdout)}`)
    continue
  }

  console.log(`ok ${name}`)
}

if (failures > 0) {
  console.error(`${failures} example test failed`)
  process.exit(1)
}

console.log(`${files.length} example tests passed`)

function runExecutable(path) {
  return new Promise((resolve, reject) => {
    const child = spawn(`./${path}`)
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk
    })

    child.stderr.on('data', chunk => {
      stderr += chunk
    })

    child.on('error', reject)
    child.on('close', code => {
      if (stderr) process.stderr.write(stderr)
      resolve({
        stdout,
        code
      })
    })
  })
}
