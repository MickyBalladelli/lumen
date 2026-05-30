export class AstVisitor {
  visit(node) {
    const method = this[`visit${node.kind}`]
    if (method) return method.call(this, node)
    return this.visitChildren(node)
  }

  visitChildren(node) {
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) this.visitMaybeNode(child)
      } else {
        this.visitMaybeNode(value)
      }
    }
  }

  visitMaybeNode(value) {
    if (value && typeof value.accept === 'function') {
      return value.accept(this)
    }

    return null
  }
}
