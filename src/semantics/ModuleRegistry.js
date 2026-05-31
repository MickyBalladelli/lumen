export class ModuleRegistry {
  constructor() {
    this.modules = new Map([
      ['system', new Set([
        'println',
        'len',
        'filter',
        'includes',
        'uuid',
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
        'receive'
      ])],
      ['fs', new Set(['readFile'])],
      ['http', new Set(['serveFiles', 'serveApi', 'serveHttp', 'serveSocketIoChat', 'socketIoEvent', 'socketIoEmit'])],
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

  has(moduleName, name) {
    return this.modules.get(moduleName)?.has(name) ?? false
  }

  hasModule(moduleName) {
    return this.modules.has(moduleName)
  }
}
