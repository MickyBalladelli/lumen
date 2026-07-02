import { pathToFileURL } from 'node:url'
import { TokenType } from '../lexer/TokenType.js'
import { BuiltinSignatures } from '../runtime/BuiltinRegistry.js'

export const SemanticTokenTypes = [
  'namespace',
  'type',
  'class',
  'enum',
  'interface',
  'struct',
  'typeParameter',
  'parameter',
  'variable',
  'property',
  'enumMember',
  'event',
  'function',
  'method',
  'macro',
  'keyword',
  'modifier',
  'comment',
  'string',
  'number',
  'regexp',
  'operator',
  'decorator'
]

const keywords = [
  'function',
  'let',
  'const',
  'struct',
  'enum',
  'extern',
  'for',
  'of',
  'in',
  'import',
  'from',
  'match',
  'if',
  'else',
  'switch',
  'case',
  'default',
  'defer',
  'break',
  'continue',
  'while',
  'do',
  'until',
  'try',
  'catch',
  'throw',
  'async',
  'await',
  'return',
  'true',
  'false',
  'null'
]

export class LanguageIndex {
  constructor(modules) {
    this.modules = modules
    this.records = []
    this.declarations = new Map()
    this.occurrences = []
    this.semanticEntries = []
    this.sources = new Map()
    this.nextRecordId = 1

    for (const module of modules) {
      this.sources.set(module.uri, module.source)
      this.collectDeclarations(module.ast, module, null)
    }
    for (const module of modules) {
      this.collectReferences(module.ast, module)
      this.collectCompilerTokens(module)
    }
  }

  static fromCompilation(result, {
    uri = null,
    source = ''
  } = {}) {
    if (result.moduleGraph) return LanguageIndex.fromModuleGraph(result.moduleGraph)

    return new LanguageIndex([{
      ast: result.ast,
      reverseNames: new Map(),
      source,
      tokens: result.tokens ?? [],
      uri
    }])
  }

  static fromModuleGraph(graph) {
    return new LanguageIndex(graph.modules.map(module => ({
      ast: module.ast,
      reverseNames: new Map(
        [...module.names].map(([name, linkedName]) => [linkedName, name])
      ),
      source: module.source,
      tokens: module.tokens,
      uri: pathToFileURL(module.path).href
    })))
  }

  hasUri(uri) {
    return this.sources.has(uri)
  }

  definition(uri, position) {
    const occurrence = this.occurrenceAt(uri, position)
    if (!occurrence?.record) return null

    return {
      uri: occurrence.record.uri,
      range: occurrence.record.range
    }
  }

  references(uri, position, includeDeclaration = true) {
    const occurrence = this.occurrenceAt(uri, position)
    if (!occurrence?.record) return []

    return this.occurrences
      .filter(item => {
        return item.record === occurrence.record &&
          (includeDeclaration || !item.isDeclaration)
      })
      .map(item => ({
        uri: item.uri,
        range: item.range
      }))
  }

  hover(uri, position) {
    const occurrence = this.occurrenceAt(uri, position)
    if (!occurrence) return null

    const detail = occurrence.record?.detail ??
      (occurrence.type ? `type: ${cleanType(occurrence.type)}` : null)
    if (!detail) return null

    return {
      contents: {
        kind: 'markdown',
        value: `\`\`\`lumen\n${detail}\n\`\`\``
      },
      range: occurrence.range
    }
  }

  completion(uri) {
    const visibleRecords = new Set(
      this.records.filter(record => record.uri === uri)
    )
    for (const occurrence of this.occurrences) {
      if (occurrence.uri === uri && occurrence.context === 'import' && occurrence.record) {
        visibleRecords.add(occurrence.record)
      }
    }

    const items = [...visibleRecords].map(record => ({
      label: record.name,
      kind: completionKind(record.kind),
      detail: record.detail
    }))

    for (const builtin of BuiltinSignatures) {
      items.push({
        label: builtin.name,
        kind: 3,
        detail: `function ${builtin.name}(${builtin.parameters.join(', ')}): ${builtin.returnType}`
      })
    }
    for (const keyword of keywords) {
      items.push({
        label: keyword,
        kind: 14,
        detail: 'Lumen keyword'
      })
    }

    const seen = new Set()
    return items.filter(item => {
      if (seen.has(item.label)) return false
      seen.add(item.label)
      return true
    })
      .sort((left, right) => left.label.localeCompare(right.label))
  }

  rename(uri, position, newName) {
    const occurrence = this.occurrenceAt(uri, position)
    if (!occurrence?.record) return null

    const changes = {}
    for (const item of this.occurrences) {
      if (item.record !== occurrence.record) continue
      changes[item.uri] ??= []
      changes[item.uri].push({
        range: item.range,
        newText: newName
      })
    }

    return { changes }
  }

  documentSymbols(uri) {
    return this.records
      .filter(record => record.uri === uri)
      .map(record => ({
        name: record.name,
        kind: symbolKind(record.kind),
        location: {
          uri,
          range: record.range
        },
        containerName: record.container?.name
      }))
  }

  workspaceSymbols(query = '') {
    const needle = query.toLowerCase()
    return this.records
      .filter(record => !needle || record.name.toLowerCase().includes(needle))
      .map(record => ({
        name: record.name,
        kind: symbolKind(record.kind),
        location: {
          uri: record.uri,
          range: record.range
        },
        containerName: record.container?.name
      }))
  }

  semanticTokens(uri) {
    const entries = this.semanticEntries
      .filter(entry => entry.uri === uri && entry.range.start.line === entry.range.end.line)
      .sort(compareEntries)
    const data = []
    let previousLine = 0
    let previousCharacter = 0

    for (const entry of entries) {
      const line = entry.range.start.line
      const character = entry.range.start.character
      const length = Math.max(entry.range.end.character - character, 1)
      const deltaLine = line - previousLine
      const deltaCharacter = deltaLine === 0
        ? character - previousCharacter
        : character
      data.push(
        deltaLine,
        deltaCharacter,
        length,
        SemanticTokenTypes.indexOf(entry.type),
        0
      )
      previousLine = line
      previousCharacter = character
    }

    return { data }
  }

  collectDeclarations(node, module, container) {
    if (!isNode(node)) return

    if (node.kind === 'FunctionDeclaration' ||
      node.kind === 'ExternFunctionDeclaration') {
      const kind = node.kind === 'FunctionDeclaration' ? 'function' : 'extern'
      const record = this.addDeclaration(
        node,
        node.name,
        kind,
        module,
        container,
        functionDetail(node, module)
      )
      for (const param of node.params) {
        this.addDeclaration(
          param,
          param,
          'parameter',
          module,
          record,
          `${param.name}: ${cleanType(param.inferredType ?? param.typeAnnotation?.name ?? 'i32')}`
        )
      }
      this.collectDeclarations(node.body, module, record)
      return
    }

    if (node.kind === 'StructDeclaration') {
      const record = this.addDeclaration(
        node,
        node.name,
        'struct',
        module,
        container,
        `struct ${displayName(node.name.name, module)}`
      )
      for (const field of node.fields) {
        this.addDeclaration(
          field,
          field,
          'field',
          module,
          record,
          `${field.name}: ${cleanType(field.typeAnnotation?.name ?? 'unknown')}`
        )
      }
      return
    }

    if (node.kind === 'EnumDeclaration') {
      const record = this.addDeclaration(
        node,
        node.name,
        'enum',
        module,
        container,
        `enum ${displayName(node.name.name, module)}`
      )
      for (const variant of node.variants) {
        this.addDeclaration(
          variant,
          variant,
          'enumMember',
          module,
          record,
          `${record.name}.${displayName(variant.name, module)}`
        )
      }
      return
    }

    if (node.kind === 'VariableDeclaration') {
      for (const declaration of node.declarations) {
        const declarationKind = node.declarationKind === 'const' ? 'constant' : 'variable'
        this.addDeclaration(
          declaration,
          declaration.id,
          declarationKind,
          module,
          container,
          `${node.declarationKind} ${declaration.id.name}: ${cleanType(declaration.inferredType ?? declaration.typeAnnotation?.name ?? 'unknown')}`
        )
        this.collectDeclarations(declaration.initializer, module, container)
      }
      return
    }

    if (node.kind === 'ForOfStatement' || node.kind === 'ForRangeStatement') {
      this.addDeclaration(
        node.item,
        node.item,
        'variable',
        module,
        container,
        `${node.item.name}: ${cleanType(node.item.inferredType ?? 'i32')}`
      )
    }

    if (node.kind === 'TryCatchStatement') {
      this.addDeclaration(
        node.catchParam,
        node.catchParam,
        'variable',
        module,
        container,
        `${node.catchParam.name}: ${cleanType(node.catchParam.inferredType ?? 'string')}`
      )
    }

    if (node.kind === 'ArrowFunctionExpression') {
      for (const param of node.params) {
        this.addDeclaration(
          param,
          param,
          'parameter',
          module,
          container,
          `${param.name}: ${cleanType(param.inferredType ?? 'unknown')}`
        )
      }
    }

    for (const child of childNodes(node)) {
      this.collectDeclarations(child, module, container)
    }
  }

  collectReferences(node, module) {
    if (!isNode(node)) return

    if (node.kind === 'ImportDeclaration') {
      for (const imported of node.names) {
        this.addReference(imported, module, {
          context: 'import',
          declaration: imported.resolvedDeclaration,
          semanticType: semanticTypeForRecord(
            this.declarations.get(imported.resolvedDeclaration)
          )
        })
      }
    } else if (node.kind === 'IdentifierExpression') {
      this.addReference(node, module, {
        declaration: node.resolvedSymbol?.node ?? node.resolvedDeclaration,
        inferredType: node.inferredType
      })
    } else if (node.kind === 'TypeAnnotation') {
      this.addReference(node, module, {
        declaration: node.resolvedDeclaration,
        semanticType: 'type',
        inferredType: node.name
      })
    } else if (node.kind === 'StructExpression') {
      this.addReference(node, module, {
        declaration: node.resolvedDeclaration,
        semanticType: 'struct',
        inferredType: node.inferredType
      })
    } else if (node.kind === 'StructProperty') {
      this.addReference(node, module, {
        declaration: node.resolvedDeclaration,
        semanticType: 'property',
        inferredType: node.value?.inferredType
      })
    } else if (node.inferredType) {
      this.addReference(node, module, {
        inferredType: node.inferredType
      })
    }

    for (const child of childNodes(node)) this.collectReferences(child, module)
  }

  addDeclaration(node, nameNode, kind, module, container, detail) {
    const location = nameNode.location ?? node.location
    const name = displayName(nameNode.name ?? nameNode.key, module)
    const record = {
      id: this.nextRecordId,
      container,
      detail,
      kind,
      name,
      node,
      range: lspRange(location),
      uri: uriFor(location, module)
    }
    this.nextRecordId += 1
    this.records.push(record)
    this.declarations.set(node, record)
    this.declarations.set(nameNode, record)
    this.addOccurrence({
      isDeclaration: true,
      name,
      node: nameNode,
      range: record.range,
      record,
      semanticType: semanticTypeForRecord(record),
      type: inferredTypeFor(node),
      uri: record.uri
    })
    return record
  }

  addReference(node, module, {
    context = null,
    declaration = null,
    inferredType = null,
    semanticType = null
  }) {
    const record = this.declarations.get(declaration) ?? null
    this.addOccurrence({
      context,
      isDeclaration: false,
      name: record?.name ?? displayName(node.name ?? node.key, module),
      node,
      range: lspRange(node.location),
      record,
      semanticType: semanticType ?? semanticTypeForRecord(record),
      type: inferredType,
      uri: uriFor(node.location, module)
    })
  }

  addOccurrence(occurrence) {
    const exists = this.occurrences.some(item => {
      return item.uri === occurrence.uri &&
        item.range.start.line === occurrence.range.start.line &&
        item.range.start.character === occurrence.range.start.character &&
        item.record === occurrence.record
    })
    if (exists) return

    this.occurrences.push(occurrence)
    if (occurrence.semanticType) {
      this.addSemanticEntry(
        occurrence.uri,
        occurrence.range,
        occurrence.semanticType
      )
    }
  }

  collectCompilerTokens(module) {
    for (const token of module.tokens ?? []) {
      const type = semanticTypeForToken(token)
      if (!type) continue
      this.addSemanticEntry(
        uriFor(token.location, module),
        lspRange(token.location),
        type
      )
    }
  }

  addSemanticEntry(uri, range, type) {
    const existing = this.semanticEntries.find(entry => {
      return entry.uri === uri &&
        entry.range.start.line === range.start.line &&
        entry.range.start.character === range.start.character
    })
    if (existing) {
      if (semanticPriority(type) > semanticPriority(existing.type)) {
        existing.type = type
        existing.range = range
      }
      return
    }
    this.semanticEntries.push({ uri, range, type })
  }

  occurrenceAt(uri, position) {
    return this.occurrences
      .filter(occurrence => {
        return occurrence.uri === uri && contains(occurrence.range, position)
      })
      .sort((left, right) => rangeSize(left.range) - rangeSize(right.range))[0] ?? null
  }
}

function childNodes(node) {
  const children = []

  for (const [key, value] of Object.entries(node)) {
    if (['location', 'token', 'tokens'].includes(key)) continue
    if (Array.isArray(value)) {
      children.push(...value.filter(isNode))
    } else if (isNode(value)) {
      children.push(value)
    }
  }

  return children
}

function isNode(value) {
  return Boolean(value && typeof value === 'object' && typeof value.kind === 'string')
}

function displayName(name, module) {
  return module.reverseNames.get(name) ?? cleanType(name ?? '')
}

function cleanType(type) {
  return String(type ?? 'unknown').replace(/__lumen\.module\.\d+\.([A-Za-z_][A-Za-z0-9_]*)/g, '$1')
}

function functionDetail(node, module) {
  const prefix = node.isAsync ? 'async ' : node.kind === 'ExternFunctionDeclaration' ? 'extern ' : ''
  const params = node.params.map(param => {
    const type = cleanType(param.inferredType ?? param.typeAnnotation?.name ?? 'i32')
    return `${param.name}: ${type}`
  }).join(', ')
  const returnType = cleanType(node.inferredType ?? node.returnType?.name ?? 'i32')
  return `${prefix}function ${displayName(node.name.name, module)}(${params}): ${returnType}`
}

function inferredTypeFor(node) {
  return node.inferredType ??
    node.typeAnnotation?.name ??
    node.symbol?.type ??
    null
}

function uriFor(location, module) {
  const sourcePath = location?.sourcePath
  if (!sourcePath) return module.uri
  return sourcePath.includes('://') ? sourcePath : pathToFileURL(sourcePath).href
}

function lspRange(location) {
  const line = Math.max((location?.line ?? 1) - 1, 0)
  const character = Math.max((location?.column ?? 1) - 1, 0)
  return {
    start: { line, character },
    end: {
      line: Math.max((location?.endLine ?? location?.line ?? 1) - 1, line),
      character: Math.max(
        (location?.endColumn ?? (location?.column ?? 1) + 1) - 1,
        character + 1
      )
    }
  }
}

function contains(range, position) {
  if (position.line < range.start.line || position.line > range.end.line) return false
  if (position.line === range.start.line && position.character < range.start.character) return false
  if (position.line === range.end.line && position.character >= range.end.character) return false
  return true
}

function rangeSize(range) {
  return (range.end.line - range.start.line) * 100000 +
    range.end.character - range.start.character
}

function semanticTypeForRecord(record) {
  if (!record) return null
  if (record.kind === 'function' || record.kind === 'extern') return 'function'
  if (record.kind === 'parameter') return 'parameter'
  if (record.kind === 'field') return 'property'
  if (record.kind === 'enumMember') return 'enumMember'
  if (record.kind === 'struct') return 'struct'
  if (record.kind === 'enum') return 'enum'
  return 'variable'
}

function semanticTypeForToken(token) {
  if (token.type === TokenType.Keyword) return 'keyword'
  if (token.type === TokenType.String) return 'string'
  if (token.type === TokenType.Number) return 'number'
  if (token.type === TokenType.Operator) return 'operator'
  return null
}

function semanticPriority(type) {
  return ['keyword', 'string', 'number', 'operator'].includes(type) ? 1 : 2
}

function completionKind(kind) {
  if (kind === 'function' || kind === 'extern') return 3
  if (kind === 'field') return 5
  if (kind === 'struct') return 22
  if (kind === 'enum') return 13
  if (kind === 'enumMember') return 20
  if (kind === 'constant') return 21
  return 6
}

function symbolKind(kind) {
  if (kind === 'function' || kind === 'extern') return 12
  if (kind === 'field') return 8
  if (kind === 'struct') return 23
  if (kind === 'enum') return 10
  if (kind === 'enumMember') return 22
  if (kind === 'constant') return 14
  return 13
}

function compareEntries(left, right) {
  return left.range.start.line - right.range.start.line ||
    left.range.start.character - right.range.start.character
}
