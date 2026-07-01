import { ProgramNode } from '../ast/nodes.js'
import { Diagnostic, throwDiagnostics } from '../diagnostics/Diagnostic.js'

const TOP_LEVEL_DECLARATIONS = new Set([
  'StructDeclaration',
  'EnumDeclaration',
  'FunctionDeclaration',
  'ExternFunctionDeclaration'
])

export class ModuleGraph {
  constructor({ entry, modules }) {
    this.entry = entry
    this.modules = modules
    this.sources = new Map(modules.map(module => [module.path, module.source]))
  }

  link() {
    this.diagnostics = []
    for (const module of this.modules) this.collectDeclarations(module)
    for (const module of this.modules) this.collectImports(module)
    throwDiagnostics(this.diagnostics)
    for (const module of this.modules) this.rewriteModule(module)

    const body = this.modules.flatMap(module => {
      return module.ast.body.filter(node => {
        if (node.kind !== 'ImportDeclaration') return true
        return !module.imports.some(edge => {
          return edge.declaration === node && edge.target
        })
      })
    })

    this.program = new ProgramNode(body, this.entry.ast.location)
    return this
  }

  collectDeclarations(module) {
    module.names = new Map()
    module.typeNames = new Map()
    module.declarations = new Map()

    for (const node of module.ast.body) {
      if (!TOP_LEVEL_DECLARATIONS.has(node.kind)) continue

      const name = node.name.name
      const linkedName = module === this.entry
        ? name
        : `__lumen.module.${module.index}.${name}`

      module.names.set(name, linkedName)
      module.declarations.set(name, node)
      if (node.kind === 'StructDeclaration' || node.kind === 'EnumDeclaration') {
        module.typeNames.set(name, linkedName)
      }

      if (node.kind === 'EnumDeclaration') {
        for (const variant of node.variants) {
          const variantName = module === this.entry
            ? variant.name
            : `__lumen.module.${module.index}.${variant.name}`
          module.names.set(variant.name, variantName)
        }
      }
    }
  }

  collectImports(module) {
    module.importNames = new Map()
    module.importTypeNames = new Map()
    module.importLocations = new Map()

    for (const edge of module.imports) {
      if (!edge.target) continue

      for (const imported of edge.declaration.names) {
        if (edge.allowedExports && !edge.allowedExports.has(imported.name)) {
          this.diagnostics.push(new Diagnostic(
            `Module "${edge.declaration.source}" has no export "${imported.name}"`,
            imported.location,
            'module'
          ).addNote('Import target is here', edge.target.ast.location, edge.target.source))
          continue
        }

        const declaration = edge.target.declarations.get(imported.name)
        if (!declaration) {
          this.diagnostics.push(new Diagnostic(
            `Module "${edge.declaration.source}" has no export "${imported.name}"`,
            imported.location,
            'module'
          ).addNote('Import target is here', edge.target.ast.location, edge.target.source))
          continue
        }

        if (module.names.has(imported.name) || module.importNames.has(imported.name)) {
          const diagnostic = new Diagnostic(
            `Duplicate imported symbol "${imported.name}"`,
            imported.location,
            'module'
          )
          const previous = module.importLocations.get(imported.name) ??
            module.declarations.get(imported.name)?.location
          if (previous) diagnostic.addNote('First definition is here', previous, module.source)
          this.diagnostics.push(diagnostic)
          continue
        }

        module.importNames.set(imported.name, edge.target.names.get(imported.name))
        module.importLocations.set(imported.name, imported.location)
        if (declaration.kind === 'StructDeclaration' || declaration.kind === 'EnumDeclaration') {
          module.importTypeNames.set(imported.name, edge.target.typeNames.get(imported.name))
        }

        if (declaration.kind === 'EnumDeclaration') {
          for (const variant of declaration.variants) {
            if (module.names.has(variant.name) || module.importNames.has(variant.name)) {
              const diagnostic = new Diagnostic(
                `Duplicate imported symbol "${variant.name}"`,
                imported.location,
                'module'
              )
              const previous = module.importLocations.get(variant.name) ??
                module.declarations.get(variant.name)?.location
              if (previous) diagnostic.addNote('First definition is here', previous, module.source)
              this.diagnostics.push(diagnostic)
              continue
            }
            module.importNames.set(variant.name, edge.target.names.get(variant.name))
            module.importLocations.set(variant.name, imported.location)
          }
        }
      }
    }
  }

  rewriteModule(module) {
    const names = new Map([
      ...module.names,
      ...module.importNames
    ])
    const typeNames = new Map([
      ...module.typeNames,
      ...module.importTypeNames
    ])

    for (const node of module.ast.body) {
      if (TOP_LEVEL_DECLARATIONS.has(node.kind)) {
        node.name.name = module.names.get(node.name.name)
      }

      if (node.kind === 'EnumDeclaration') {
        for (const variant of node.variants) {
          variant.name = module.names.get(variant.name)
        }
      }

      this.rewriteNode(node, names, typeNames, new Set())
    }
  }

  rewriteNode(node, names, typeNames, scope) {
    if (!node || typeof node !== 'object') return

    if (node.kind === 'ImportDeclaration') return
    if (node.kind === 'TypeAnnotation') {
      node.name = rewriteType(node.name, typeNames)
      return
    }
    if (node.kind === 'RawExpression') {
      this.rewriteExpression(node, names, scope)
      this.rewriteExpressionNode(node.parsed, names, typeNames, scope)
      return
    }
    if (node.kind === 'FunctionDeclaration' || node.kind === 'ExternFunctionDeclaration') {
      const functionScope = new Set(scope)
      for (const param of node.params) functionScope.add(param.name)
      for (const param of node.params) this.rewriteNode(param.typeAnnotation, names, typeNames, functionScope)
      this.rewriteNode(node.returnType, names, typeNames, functionScope)
      this.rewriteNode(node.body, names, typeNames, functionScope)
      return
    }
    if (node.kind === 'BlockStatement') {
      const blockScope = new Set(scope)
      for (const child of node.body) {
        this.rewriteNode(child, names, typeNames, blockScope)
        if (child.kind === 'VariableDeclaration') {
          for (const declaration of child.declarations) {
            blockScope.add(declaration.id.name)
          }
        }
      }
      return
    }
    if (node.kind === 'VariableDeclaration') {
      for (const declaration of node.declarations) {
        this.rewriteNode(declaration.typeAnnotation, names, typeNames, scope)
        this.rewriteNode(declaration.initializer, names, typeNames, scope)
      }
      return
    }
    if (node.kind === 'ForStatement') {
      const loopScope = new Set(scope)
      this.rewriteNode(node.init, names, typeNames, loopScope)
      if (node.init?.kind === 'VariableDeclaration') {
        for (const declaration of node.init.declarations) {
          loopScope.add(declaration.id.name)
        }
      }
      this.rewriteNode(node.test, names, typeNames, loopScope)
      this.rewriteNode(node.update, names, typeNames, loopScope)
      this.rewriteNode(node.body, names, typeNames, loopScope)
      return
    }
    if (node.kind === 'ForOfStatement' || node.kind === 'ForRangeStatement') {
      this.rewriteNode(node.iterable, names, typeNames, scope)
      this.rewriteNode(node.start, names, typeNames, scope)
      this.rewriteNode(node.end, names, typeNames, scope)
      const loopScope = new Set(scope)
      loopScope.add(node.item.name)
      this.rewriteNode(node.body, names, typeNames, loopScope)
      return
    }
    if (node.kind === 'TryCatchStatement') {
      this.rewriteNode(node.tryBlock, names, typeNames, scope)
      const catchScope = new Set(scope)
      catchScope.add(node.catchParam.name)
      this.rewriteNode(node.catchBlock, names, typeNames, catchScope)
      return
    }

    for (const [key, value] of Object.entries(node)) {
      if (['kind', 'location', 'name', 'parsed'].includes(key)) continue
      if (Array.isArray(value)) {
        for (const child of value) this.rewriteNode(child, names, typeNames, scope)
      } else {
        this.rewriteNode(value, names, typeNames, scope)
      }
    }
  }

  rewriteExpression(expression, names, scope) {
    for (let index = 0; index < expression.tokens.length; index += 1) {
      const token = expression.tokens[index]
      const previous = expression.tokens[index - 1]
      const next = expression.tokens[index + 1]

      if (!names.has(token.lexeme)) continue
      if (scope.has(token.lexeme)) continue
      if (previous?.lexeme === '.') continue
      if (next?.lexeme === ':') continue

      token.lexeme = names.get(token.lexeme)
      if (typeof token.literal === 'string') token.literal = token.lexeme
    }
  }

  rewriteExpressionNode(node, names, typeNames, scope) {
    if (!node) return

    if (node.kind === 'IdentifierExpression') {
      if (names.has(node.name) && !scope.has(node.name)) {
        node.name = names.get(node.name)
      }
      return
    }

    if (node.kind === 'StructExpression') {
      node.name = typeNames.get(node.name) ?? node.name
      for (const field of node.fields) {
        this.rewriteExpressionNode(field.value, names, typeNames, scope)
      }
      return
    }

    if (node.kind === 'ArrowFunctionExpression') {
      const arrowScope = new Set(scope)
      for (const param of node.params) arrowScope.add(param.name)
      this.rewriteExpressionNode(node.body, names, typeNames, arrowScope)
      return
    }

    if (node.kind === 'CallExpression') {
      this.rewriteExpressionNode(node.callee, names, typeNames, scope)
      for (const argument of node.arguments) {
        this.rewriteExpressionNode(argument, names, typeNames, scope)
      }
      return
    }

    if (node.kind === 'MemberExpression') {
      this.rewriteExpressionNode(node.object, names, typeNames, scope)
      if (node.computed) this.rewriteExpressionNode(node.property, names, typeNames, scope)
      return
    }

    if (node.kind === 'MatchExpression') {
      this.rewriteExpressionNode(node.discriminant, names, typeNames, scope)
      for (const arm of node.arms) {
        this.rewriteExpressionNode(arm.pattern, names, typeNames, scope)
        this.rewriteExpressionNode(arm.value, names, typeNames, scope)
      }
      return
    }

    const children = []
    if (node.argument) children.push(node.argument)
    if (node.left) children.push(node.left)
    if (node.right) children.push(node.right)
    if (node.start) children.push(node.start)
    if (node.end) children.push(node.end)
    if (node.elements) children.push(...node.elements)
    for (const child of children) {
      this.rewriteExpressionNode(child, names, typeNames, scope)
    }
  }
}

function rewriteType(typeName, typeNames) {
  let rewritten = typeName
  for (const [name, linkedName] of typeNames) {
    rewritten = rewritten.replace(
      new RegExp(`(^|[<,])${escapeRegExp(name)}(?=\\[\\]|\\?|[>,]|$)`, 'g'),
      (_, prefix) => `${prefix}${linkedName}`
    )
  }
  return rewritten
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
