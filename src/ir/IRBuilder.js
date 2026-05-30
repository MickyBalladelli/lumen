import { IRFunction, IRModule } from './IR.js'

export class IRBuilder {
  build(program) {
    const structs = program.body
      .filter(node => node.kind === 'StructDeclaration')
      .map(node => ({
        name: node.name.name,
        fields: node.fields.map(field => ({
          name: field.name,
          type: field.typeAnnotation.name
        }))
      }))
    const functions = program.body
      .filter(node => node.kind === 'FunctionDeclaration')
      .map(node => this.buildFunction(node))

    return new IRModule(functions, structs)
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
