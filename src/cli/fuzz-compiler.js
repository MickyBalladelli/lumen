#!/usr/bin/env node

import {
  isMainThread,
  parentPort,
  Worker,
  workerData
} from 'node:worker_threads'
import { runCompilerProperties } from '../testing/CompilerProperties.js'

if (isMainThread) {
  const options = parseOptions(process.argv.slice(2))
  try {
    const result = await runIsolated(options)
    console.log(
      `Compiler properties passed: seed ${result.seed}, ` +
      `${result.parserCases} parser, ${result.invalidPrograms} invalid, ` +
      `${result.llvmPrograms} LLVM`
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
} else {
  try {
    const result = await runCompilerProperties(workerData)
    parentPort.postMessage({ ok: true, result })
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      error: error.stack ?? error.message
    })
  }
}

function parseOptions(args) {
  const options = {
    seed: Date.now(),
    runs: 1000,
    timeout: 60_000,
    clang: process.env.LUMEN_CLANG ?? 'clang'
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--seed') options.seed = numberOption(args[++index], argument)
    else if (argument === '--runs') options.runs = numberOption(args[++index], argument)
    else if (argument === '--timeout') options.timeout = numberOption(args[++index], argument)
    else if (argument === '--clang') options.clang = valueOption(args[++index], argument)
    else throw new Error(`Unknown option ${argument}`)
  }

  return options
}

function runIsolated({ timeout, ...options }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: options
    })
    let settled = false
    const timer = setTimeout(async () => {
      if (settled) return
      settled = true
      await worker.terminate()
      reject(new Error(
        `Compiler fuzzing timed out after ${timeout}ms ` +
        `(seed ${options.seed}, ${options.runs} runs)`
      ))
    }, timeout)

    worker.on('message', message => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (message.ok) resolve(message.result)
      else reject(new Error(message.error))
    })
    worker.on('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    worker.on('exit', code => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`Compiler fuzz worker exited with ${code}`))
    })
  })
}

function numberOption(value, option) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error(`${option} needs a positive integer`)
  }
  return number
}

function valueOption(value, option) {
  if (!value) throw new Error(`${option} needs a value`)
  return value
}
