export const HttpFunctions = Object.freeze({
  ServeFiles: 'serveFiles',
  ServeApi: 'serveApi',
  ServeHttp: 'serveHttp',
  ServeSocketIoChat: 'serveSocketIoChat',
  SocketIoEvent: 'socketIoEvent',
  SocketIoEmit: 'socketIoEmit'
})

export class HttpLibrary {
  constructor() {
    this.functions = new Set(Object.values(HttpFunctions))
  }

  has(name) {
    return this.functions.has(name)
  }
}
