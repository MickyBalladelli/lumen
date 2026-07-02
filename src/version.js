import { readFileSync } from 'node:fs'

const packageManifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
)

export const lumenVersion = packageManifest.version
