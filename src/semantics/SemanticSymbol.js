export class SemanticSymbol {
  constructor(id, name, kind, node, fields = {}) {
    this.id = id
    this.name = name
    this.kind = kind
    this.node = node
    Object.assign(this, fields)
  }
}
