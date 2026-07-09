import { relative } from 'node:path'
import { builtinSignature } from '../runtime/BuiltinRegistry.js'

const SUPPORT = {
  syntaxNodes: support(
    [
      'BlockStatement',
      'IdentifierExpression',
      'LiteralExpression',
      'Program',
      'ReturnStatement'
    ],
    [
      'AssignmentExpression',
      'BinaryExpression',
      'BreakStatement',
      'CallExpression',
      'ContinueStatement',
      'ExpressionStatement',
      'FunctionDeclaration',
      'Identifier',
      'IfStatement',
      'ImportDeclaration',
      'MemberExpression',
      'RawExpression',
      'SliceExpression',
      'StructDeclaration',
      'StructExpression',
      'StructField',
      'StructProperty',
      'TypeAnnotation',
      'UnaryExpression',
      'VariableDeclaration',
      'VariableDeclarator',
      'WhileStatement'
    ]
  ),
  typeFamilies: support(
    ['bool', 'i32', 'string', 'void'],
    ['Result<T>', 'struct']
  ),
  irOperations: support(
    [],
    [
      'instruction:declare',
      'instruction:evaluate',
      'instruction:if',
      'instruction:while',
      'terminator:break',
      'terminator:continue',
      'terminator:fallthrough',
      'terminator:return',
      'value:access',
      'value:assign',
      'value:binary',
      'value:call',
      'value:constant',
      'value:reference',
      'value:slice',
      'value:struct',
      'value:unary'
    ]
  ),
  builtins: support(
    ['println'],
    []
  ),
  operators: support(
    [],
    ['!', '+', '-', '<', '<=', '=', '==', '>', '>=', '||']
  ),
  moduleFeatures: support(
    ['multi-module', 'named-imports', 'relative-imports', 'transitive-imports'],
    ['shared-dependency']
  )
}

const FIXTURE_PATTERNS = [
  fixture('known for-loop evaluator', /\brunKnownFor\b/),
  fixture('known while-loop evaluator', /\brunKnownWhile\b/),
  fixture('name-selected sum behavior', /includes\([^,\n]*(?:name|Name)[^,\n]*,\s*["']sum["']\)/),
  fixture('value-selected print behavior', /stringEquals\(value,\s*["']bad["']\)/),
  fixture('fixed loop bound', /icmp slt i32 %i\.cond, (?:5|8)/),
  fixture(
    'fixed variable result',
    /mapSet\(variables,\s*["'](?:total|recovered)["'],\s*["']number:(?:7|10|20)["']\)/
  )
]

export function analyzeCompilerSourceCoverage(compilation) {
  const customTypes = new Set(compilation.ir.structs.map(struct => struct.name))
  const inventory = {
    syntaxNodes: new Set(),
    typeNames: new Set(),
    typeFamilies: new Set(),
    irOperations: new Set(),
    builtins: new Set(),
    operators: new Set(),
    moduleFeatures: new Set()
  }

  for (const module of compilation.moduleGraph.modules) {
    inventoryAst(module.ast, inventory)
  }
  inventoryIR(compilation.ir, inventory)

  for (const type of inventory.typeNames) {
    inventory.typeFamilies.add(typeFamily(type, customTypes))
  }

  const modules = inventoryModules(compilation.moduleGraph, inventory)
  const fixturePaths = findFixturePaths(compilation.moduleGraph)
  const serialInventory = {
    syntaxNodes: sorted(inventory.syntaxNodes),
    typeNames: sorted(inventory.typeNames),
    typeFamilies: sorted(inventory.typeFamilies),
    irOperations: sorted(inventory.irOperations),
    builtins: sorted(inventory.builtins),
    operators: sorted(inventory.operators),
    moduleFeatures: sorted(inventory.moduleFeatures),
    modules
  }
  const gaps = coverageGaps(serialInventory)

  return {
    entry: relative(process.cwd(), compilation.moduleGraph.entry.path),
    ready: gaps.length === 0,
    inventory: serialInventory,
    gaps,
    fixturePaths
  }
}

export function formatCompilerSourceCoverage(report) {
  const lines = [
    `compiler source coverage: ${report.ready ? 'ready' : 'not ready'}`,
    `modules: ${report.inventory.modules.length}`,
    `syntax nodes: ${report.inventory.syntaxNodes.join(', ')}`,
    `types: ${report.inventory.typeNames.join(', ')}`,
    `IR operations: ${report.inventory.irOperations.join(', ')}`,
    `builtins: ${report.inventory.builtins.join(', ')}`,
    `module features: ${report.inventory.moduleFeatures.join(', ')}`
  ]

  for (const status of ['fixture', 'unsupported']) {
    const matches = report.gaps.filter(gap => gap.status === status)
    if (matches.length === 0) continue
    lines.push(`${status} coverage:`)
    for (const gap of matches) lines.push(`  ${gap.category}: ${gap.name}`)
  }

  if (report.fixturePaths.length > 0) {
    lines.push('fixture-specific paths:')
    for (const finding of report.fixturePaths) {
      lines.push(`  ${finding.path}:${finding.line}: ${finding.name}`)
    }
  }

  return lines.join('\n')
}

function inventoryAst(ast, inventory) {
  const seen = new Set()

  function visit(node) {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)

    if (typeof node.kind === 'string' && !node.kind.startsWith('IR')) {
      inventory.syntaxNodes.add(node.kind)
      addType(inventory, node.inferredType)
      addType(inventory, node.typeAnnotation?.name)
      if (node.kind === 'TypeAnnotation') addType(inventory, node.name)
      if (typeof node.operator === 'string') inventory.operators.add(node.operator)

      if (node.kind === 'CallExpression' &&
        node.callee?.kind === 'IdentifierExpression') {
        const builtin = builtinSignature(node.callee.name)
        if (builtin) inventory.builtins.add(builtin.name)
      }
    }

    for (const [key, child] of Object.entries(node)) {
      if (['location', 'token', 'tokens'].includes(key)) continue
      if (Array.isArray(child)) child.forEach(visit)
      else visit(child)
    }
  }

  visit(ast)
}

function inventoryIR(ir, inventory) {
  const seen = new Set()

  function visit(node) {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)

    if (['IRInstruction', 'IRTerminator', 'IRValue'].includes(node.kind)) {
      const family = node.kind.slice(2).toLowerCase()
      inventory.irOperations.add(`${family}:${node.op}`)
    }

    addType(inventory, node.type)
    addType(inventory, node.returnType)

    for (const [key, child] of Object.entries(node)) {
      if (key === 'location') continue
      if (Array.isArray(child)) child.forEach(visit)
      else visit(child)
    }
  }

  visit(ir)
}

function inventoryModules(graph, inventory) {
  const importCounts = new Map()
  let hasTransitiveImports = false

  for (const module of graph.modules) {
    if (module !== graph.entry && module.imports.length > 0) {
      hasTransitiveImports = true
    }

    for (const edge of module.imports) {
      if (edge.declaration.names.length > 0) {
        inventory.moduleFeatures.add('named-imports')
      }
      if (edge.declaration.source.startsWith('.')) {
        inventory.moduleFeatures.add('relative-imports')
      } else {
        inventory.moduleFeatures.add('package-imports')
      }
      if (edge.target) {
        importCounts.set(edge.target.path, (importCounts.get(edge.target.path) ?? 0) + 1)
      }
    }
  }

  if (graph.modules.length > 1) inventory.moduleFeatures.add('multi-module')
  if (hasTransitiveImports) inventory.moduleFeatures.add('transitive-imports')
  if ([...importCounts.values()].some(count => count > 1)) {
    inventory.moduleFeatures.add('shared-dependency')
  }

  return graph.modules.map(module => ({
    path: relative(process.cwd(), module.path),
    imports: module.imports.map(edge => edge.declaration.source).sort()
  }))
}

function findFixturePaths(graph) {
  const findings = []

  for (const module of graph.modules) {
    const path = relative(process.cwd(), module.path)
    const lines = module.source.split(/\r?\n/)

    for (const [index, line] of lines.entries()) {
      for (const pattern of FIXTURE_PATTERNS) {
        if (!pattern.expression.test(line)) continue
        findings.push({
          name: pattern.name,
          path,
          line: index + 1
        })
      }
    }
  }

  return findings
}

function coverageGaps(inventory) {
  const gaps = []

  for (const category of [
    'syntaxNodes',
    'typeFamilies',
    'irOperations',
    'builtins',
    'operators',
    'moduleFeatures'
  ]) {
    const coverage = SUPPORT[category]
    for (const name of inventory[category]) {
      if (coverage.generic.has(name)) continue
      gaps.push({
        category,
        name,
        status: coverage.fixture.has(name) ? 'fixture' : 'unsupported'
      })
    }
  }

  return gaps.sort((left, right) => {
    return left.status.localeCompare(right.status) ||
      left.category.localeCompare(right.category) ||
      left.name.localeCompare(right.name)
  })
}

function typeFamily(type, customTypes) {
  if (customTypes.has(type)) return 'struct'
  if (/^Result<.+>$/.test(type)) return 'Result<T>'
  if (type.endsWith('[]')) return 'array'
  if (type.endsWith('?')) return 'nullable'
  if (/^\(.+\)\s*->/.test(type)) return 'function'
  return type
}

function addType(inventory, type) {
  if (typeof type === 'string' && type !== '') inventory.typeNames.add(type)
}

function sorted(values) {
  return [...values].sort()
}

function support(generic, fixtureSpecific) {
  return {
    generic: new Set(generic),
    fixture: new Set(fixtureSpecific)
  }
}

function fixture(name, expression) {
  return { name, expression }
}
