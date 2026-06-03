import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export class ModuleRegistry {
  constructor() {
    this.modules = new Map([
      ['system', new Set([
        'println',
        'len',
        'min',
        'max',
        'filter',
        'includes',
        'uuid',
        'date',
        'env',
        'encrypt',
        'decrypt',
        'arg',
        'argCount',
        'map',
        'mapGet',
        'mapHas',
        'ok',
        'err',
        'isOk',
        'errorMessage',
        'some',
        'none',
        'hasValue',
        'valueOr',
        'assert',
        'channel',
        'send',
        'receive',
        'json',
        'jsonGet',
        'jsonGetRaw',
        'jsonSet',
        'jsonSetPath',
        'jsonQuote',
        'jsonStringify',
        'jsonValid',
        'newError',
        'errorCode',
        'errorText',
        'arraySum',
        'arrayFirst',
        'arrayLast',
        'arrayJoin',
        'exec',
        'sourceSnippet',
        'stringBuilder',
        'stringBuilderAppend',
        'stringLen',
        'stringEquals',
        'trim',
        'lower',
        'upper',
        'startsWith',
        'endsWith',
        'replace',
        'split',
        'indexOf',
        'lastIndexOf',
        'contains',
        'repeat',
        'padStart',
        'padEnd',
        'intToString',
        'stringToInt',
        'parseI32',
        'parseF32',
        'list',
        'listPush',
        'listGet',
        'listLen',
        'mapSet',
        'mapDelete',
        'mapKeys',
        'tokenizeSource',
        'parseSummary'
      ])],
      ['fs', new Set(['readFile', 'writeFile'])],
      ['http', new Set(['serveFiles', 'serveApi', 'serveHttp', 'serveSocketIoChat', 'socketIoEvent', 'socketIoEmit', 'httpRequest', 'httpResponse'])],
      ['thread', new Set([
        'createSemaphore',
        'semaphoreWait',
        'semaphoreSignal',
        'startThread',
        'joinThread',
        'appendFile'
      ])]
    ])
  }

  static async fromPackageRoot(packageRoot = '.photon/packages') {
    const registry = new ModuleRegistry()

    let names = []
    try {
      names = await readdir(packageRoot)
    } catch {
      return registry
    }

    for (const name of names) {
      const packagePath = join(packageRoot, name)
      let manifest = { main: 'main.lm' }

      try {
        manifest = JSON.parse(await readFile(join(packagePath, 'photon.json'), 'utf8'))
      } catch {
        manifest = { main: 'main.lm' }
      }

      if (Array.isArray(manifest.exports)) {
        registry.addModule(name, manifest.exports)
        continue
      }

      try {
        const source = await readFile(join(packagePath, manifest.main ?? 'main.lm'), 'utf8')
        registry.addModule(name, exportedFunctions(source))
      } catch {
        registry.addModule(name, [])
      }
    }

    return registry
  }

  addModule(moduleName, names) {
    this.modules.set(moduleName, new Set(names))
  }

  has(moduleName, name) {
    return this.modules.get(moduleName)?.has(name) ?? false
  }

  hasModule(moduleName) {
    return this.modules.has(moduleName)
  }
}

function exportedFunctions(source) {
  return [...source.matchAll(/^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)]
    .map(match => match[1])
}
