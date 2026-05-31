export const FsFunctions = Object.freeze({
  ReadFile: 'readFile',
  WriteFile: 'writeFile'
})

export class FsLibrary {
  constructor() {
    this.functions = new Set(Object.values(FsFunctions))
  }

  has(name) {
    return this.functions.has(name)
  }
}
