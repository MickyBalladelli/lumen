import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Compiler } from '../../src/compiler/Compiler.js'
import { analyzeCompilerSourceCoverage } from '../../src/testing/CompilerSourceCoverage.js'

test('typed bootstrap AST covers every syntax node used by compiler source', async () => {
  const [astSource, parserSource, compilation] = await Promise.all([
    readFile('compiler/ast.lm', 'utf8'),
    readFile('compiler/parser.lm', 'utf8'),
    new Compiler().compileFile('compiler/main.lm')
  ])
  const report = analyzeCompilerSourceCoverage(compilation)
  const typedAstSource = `${astSource}\n${parserSource}`
  const missing = report.inventory.syntaxNodes.filter(kind => {
    return !typedAstSource.includes(`"${kind}"`)
  })

  assert.deepEqual(missing, [])
})

test('AstProgram stores nodes and edges instead of summary counters', async () => {
  const source = await readFile('compiler/ast.lm', 'utf8')

  assert.match(source, /nodes: AstArena/)
  assert.match(source, /childStorage: string/)
  assert.match(source, /root: i32/)
  assert.doesNotMatch(source, /\b(?:syntax|function|statement|import|struct|if|while)Count:/)
  assert.doesNotMatch(source, /mainReturn(?:Kind|Value):/)
})

test('bootstrap pipeline shares the linked module AST', async () => {
  const [parser, modules, main, semantics, typechecker, ir] = await Promise.all([
    readFile('compiler/parser.lm', 'utf8'),
    readFile('compiler/modules.lm', 'utf8'),
    readFile('compiler/main.lm', 'utf8'),
    readFile('compiler/semantics.lm', 'utf8'),
    readFile('compiler/typechecker.lm', 'utf8'),
    readFile('compiler/ir.lm', 'utf8')
  ])

  assert.doesNotMatch(parser, /function parseAst\(/)
  assert.match(parser, /function parseProgram\(tokens: TokenArena\): AstProgram/)
  assert.match(modules, /let ast = parseProgram\(tokens\)/)
  assert.match(main, /let ast = graph\.program/)
  assert.doesNotMatch(main, /parseProgram\(/)
  assert.match(semantics, /function analyzeSemantics\(ast: AstProgram\)/)
  assert.match(typechecker, /function checkTypes\(ast: AstProgram\)/)
  assert.match(ir, /function buildIr\(ast: AstProgram\)/)
})

test('bootstrap semantics stores lexical symbol identities on AST nodes', async () => {
  const [containers, semantics] = await Promise.all([
    readFile('compiler/containers.lm', 'utf8'),
    readFile('compiler/semantics.lm', 'utf8')
  ])

  assert.match(containers, /symbolId: i32/)
  assert.match(semantics, /symbols: SymbolArena/)
  assert.match(semantics, /scopeStorage: string/)
  assert.match(semantics, /declarationId: declarationId/)
  assert.match(semantics, /semanticResolveName\(resolver, scopeId, node\.name\)/)
  assert.match(semantics, /semanticFieldKey\(ownerId, fieldName\)/)
})
