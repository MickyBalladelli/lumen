import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

export function runNative(path, args = []) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(resolve(path), args, {
      stdio: 'inherit',
      env: process.env
    })
    child.on('error', reject)
    child.on('close', code => resolveResult(code ?? 1))
  })
}
