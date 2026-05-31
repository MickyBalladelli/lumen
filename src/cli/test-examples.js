import { readdir, readFile, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import { Compiler } from '../compiler/Compiler.js'

const examplesDir = 'examples'
const negativeDir = 'tests/negative'
const outputDir = 'build'
const compiler = new Compiler()
const dataText = await readFile(join(examplesDir, 'data.txt'), 'utf8')
const compileOnly = new Set([
  'http-api',
  'http-files',
  'http-server',
  'socket-chat'
])

const expectations = new Map([
  ['advanced-foundation', {
    stdout: '12\nhello lumen\nhi compiler\n1\n',
    code: 12
  }],
  ['array', {
    stdout: '16\n',
    code: 16
  }],
  ['array-helpers', {
    stdout: '12\n3\n5\nlumen,native,chat\n',
    code: 12
  }],
  ['async-foundation', {
    stdout: '4\n',
    code: 4
  }],
  ['basic', {
    stdout: 'hello\n3\n',
    code: 3
  }],
  ['for-loop', {
    stdout: '10\n',
    code: 10
  }],
  ['crypto', {
    stdout: '1\nhello lumen\nhello lumen\n',
    code: 0
  }],
  ['cli-args', {
    stdout: '1\n3\n',
    code: 0
  }],
  ['control-flow', {
    stdout: 'sum 23\n',
    code: 23
  }],
  ['do-until', {
    stdout: '10\n',
    code: 10
  }],
  ['env', {
    stdout: 'from-env\nfrom-dotenv\n\n1\n1\n',
    code: 0
  }],
  ['error-type', {
    stdout: '7\ndisk locked\ndisk locked\n',
    code: 7
  }],
  ['for-of', {
    stdout: '26\n',
    code: 26
  }],
  ['library-features', {
    stdout: 'lumen\n1\n1\nbroken\n1\npresent\n0\nfallback\n',
    code: 0
  }],
  ['fs', {
    stdout: `${dataText}\n1\n`,
    code: 0
  }],
  ['http-helpers', {
    stdout: '1\n1\n',
    code: 0
  }],
  ['json', {
    stdout: 'lumen\n3\ntrue\n',
    code: 0
  }],
  ['native-main', {
    stdout: '10\n',
    code: 10
  }],
  ['module-app', {
    stdout: '12\n',
    code: 12
  }],
  ['newline-continuation', {
    stdout: '6\n',
    code: 6
  }],
  ['numbers', {
    stdout: '10000000032\n3.750000\n1\n',
    code: 0
  }],
  ['patterns', {
    stdout: 'missing\nume\n6\ncleanup\n',
    code: 6
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
    stdout: '5\n1\n0\n1\n0\n1\n3\n4\n5\n12\n',
    code: 12
  }],
  ['switch', {
    stdout: '23\n',
    code: 23
  }],
  ['socket-helpers', {
    stdout: '1\n',
    code: 0
  }],
  ['thread', {
    stdout: '1\n1\n1\n',
    code: 0
  }],
  ['try-catch', {
    stdout: 'boom\n7\n',
    code: 7
  }],
  ['while-do', {
    stdout: '6\n',
    code: 6
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
  await compiler.writeLLVMFile(inputPath, llvmPath)
  await compiler.buildExecutable(llvmPath, executablePath)

  if (name === 'thread') {
    await unlink(join(outputDir, 'thread-output.txt')).catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
  }

  if (compileOnly.has(name)) {
    console.log(`ok ${name} compile`)
    continue
  }

  const args = name === 'cli-args' ? ['first', 'second'] : []
  const result = await runExecutable(executablePath, args, {
    LUMEN_DOTENV_PATH: join(examplesDir, '.env.test'),
    LUMEN_TEST_ENV: 'from-env'
  })
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

const negativeFiles = await readdir(negativeDir).catch(() => [])
for (const file of negativeFiles.filter(file => file.endsWith('.lm')).sort()) {
  const source = await readFile(join(negativeDir, file), 'utf8')
  try {
    compiler.compileSource(source)
    failures += 1
    console.error(`failed negative ${file}`)
  } catch {
    console.log(`ok negative ${file}`)
  }
}

if (failures > 0) {
  console.error(`${failures} test failed`)
  process.exit(1)
}

function runExecutable(path, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(`./${path}`, args, {
      env: {
        ...process.env,
        ...env
      }
    })
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
