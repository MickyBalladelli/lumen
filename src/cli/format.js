#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { formatSource } from '../formatter/Formatter.js'
import { green } from './TerminalStyle.js'

const args = process.argv.slice(2)
const check = args.includes('--check')
const stdout = args.includes('--stdout')
const stdin = args.includes('--stdin')
const files = args.filter(arg => !arg.startsWith('--'))

if (!stdin && files.length === 0) {
  console.error('usage: lumen-format [--check] [--stdout] file.lm ...')
  console.error('       lumen-format --stdin --stdout')
  process.exit(1)
}

if (stdin) {
  const source = await readStdin()
  process.stdout.write(formatSource(source))
  process.exit(0)
}

let changed = false

for (const file of files) {
  const source = await readFile(file, 'utf8')
  const formatted = formatSource(source)

  if (formatted !== source) {
    changed = true
    if (check) {
      console.error(`needs format ${file}`)
    } else if (stdout) {
      process.stdout.write(formatted)
    } else {
      await writeFile(file, formatted)
      console.log(`formatted ${file}`)
    }
  } else if (!check && !stdout) {
    console.log(green(`ok ${file}`))
  }
}

if (check && changed) process.exit(1)

function readStdin() {
  return new Promise((resolve, reject) => {
    let source = ''

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => {
      source += chunk
    })
    process.stdin.on('end', () => resolve(source))
    process.stdin.on('error', reject)
  })
}
