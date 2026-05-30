import { IRFunction, IRModule } from './IR.js'

export class IRBuilder {
  build(program) {
    const functions = program.body
      .filter(node => node.kind === 'FunctionDeclaration')
      .map(node => this.buildFunction(node))

    return new IRModule(functions)
  }

  buildFunction(node) {
    return new IRFunction(
      node.name.name,
      node.params.map(param => ({
        name: param.name,
        type: param.inferredType
      })),
      node.inferredType,
      node.body.body
    )
  }
}
