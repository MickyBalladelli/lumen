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
