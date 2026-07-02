import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

export function runCommand(command, args = [], env = {}, options = {}) {
  return runProcess(command, args, env, options)
}

export function runExecutable(path, args = [], env = {}, options = {}) {
  return runProcess(resolve(path), args, env, options)
}

function runProcess(command, args, env, {
  progressLabel = null,
  progressIntervalMs = 15000
} = {}) {
  return new Promise((resolveResult, reject) => {
    const startedAt = Date.now()
    let progressTimer = null

    if (progressLabel) {
      console.log(`${progressLabel}...`)
      progressTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        console.log(`${progressLabel}... ${elapsed}s`)
      }, progressIntervalMs)
      progressTimer.unref()
    }

    const child = spawn(command, args, {
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
    child.on('error', error => {
      if (progressTimer) clearInterval(progressTimer)
      reject(error)
    })
    child.on('close', code => {
      if (progressTimer) {
        clearInterval(progressTimer)
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        console.log(`${progressLabel} finished in ${elapsed}s`)
      }
      resolveResult({ code, stdout, stderr })
    })
  })
}
