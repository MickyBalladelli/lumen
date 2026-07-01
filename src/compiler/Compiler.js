import { spawn } from 'node:child_process'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Tokenizer } from '../lexer/Tokenizer.js'
import { Parser } from '../parser/Parser.js'
import { SemanticAnalyzer } from '../semantics/SemanticAnalyzer.js'
import { TypeChecker } from '../semantics/TypeChecker.js'
import { TypeSystem } from '../semantics/TypeSystem.js'
import { IRBuilder } from '../ir/IRBuilder.js'
import { LLVMEmitter } from '../backend/LLVMEmitter.js'
import {
  Diagnostic,
  DiagnosticCollection,
  diagnosticsFrom,
  throwDiagnostics
} from '../diagnostics/Diagnostic.js'
import { ModuleLoader } from '../modules/ModuleLoader.js'
import { ModuleRegistry } from '../semantics/ModuleRegistry.js'
import { runtimeSourcesForLLVM } from '../runtime/RuntimeUnits.js'

export class Compiler {
  constructor({
    tokenizer = Tokenizer,
    parser = Parser,
    semanticAnalyzerFactory = () => new SemanticAnalyzer(),
    typeSystemFactory = () => new TypeSystem(),
    typeCheckerFactory = typeSystem => new TypeChecker({ typeSystem }),
    irBuilderFactory = () => new IRBuilder(),
    backendFactory = typeSystem => new LLVMEmitter({ typeSystem }),
    moduleLoaderFactory = options => new ModuleLoader(options)
  } = {}) {
    this.tokenizer = tokenizer
    this.parser = parser
    this.semanticAnalyzerFactory = semanticAnalyzerFactory
    this.typeSystemFactory = typeSystemFactory
    this.typeCheckerFactory = typeCheckerFactory
    this.irBuilderFactory = irBuilderFactory
    this.backendFactory = backendFactory
    this.moduleLoaderFactory = moduleLoaderFactory
  }

  compileSource(source, { sourcePath = null, semanticAnalyzer = null } = {}) {
    try {
      const tokens = new this.tokenizer(source, { sourcePath }).tokenize()
      const diagnostics = []
      const ast = new this.parser(tokens).parseProgram({ diagnostics })
      throwDiagnostics(diagnostics)
      return this.compileProgram(ast, {
        tokens,
        sourcePath,
        semanticAnalyzer
      })
    } catch (error) {
      if (error instanceof Diagnostic) throw error.withSource(source)
      if (error instanceof DiagnosticCollection) {
        throw error.withSources(new Map(sourcePath ? [[sourcePath, source]] : []), source)
      }
      throw error
    }
  }

  diagnoseSource(source, options = {}) {
    try {
      this.compileSource(source, options)
      return []
    } catch (error) {
      const diagnostics = diagnosticsFrom(error)
      if (diagnostics.length > 0) return diagnostics
      throw error
    }
  }

  compileProgram(ast, {
    tokens = [],
    sourcePath = null,
    semanticAnalyzer = null
  } = {}) {
    const typeSystem = this.typeSystemFactory()
    const analyzer = semanticAnalyzer ?? this.semanticAnalyzerFactory()
    const typeChecker = this.typeCheckerFactory(typeSystem)
    const irBuilder = this.irBuilderFactory()
    const backend = this.backendFactory(typeSystem)
    const diagnostics = []

    analyzer.analyze(ast, { diagnostics })
    typeChecker.check(ast, { diagnostics })
    throwDiagnostics(uniqueDiagnostics(diagnostics))

    const ir = irBuilder.build(ast)
    const llvm = backend.emit(ir, { sourcePath })

    return {
      tokens,
      ast,
      ir,
      llvm,
      diagnostics: []
    }
  }

  async writeLLVM(source, outputPath, { sourcePath = null } = {}) {
    const result = this.compileSource(source, { sourcePath })
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, result.llvm)
    return result
  }

  async writeLLVMFile(inputPath, outputPath) {
    const graph = await this.moduleLoaderFactory({
      tokenizer: this.tokenizer,
      parser: this.parser
    }).load(inputPath)
    const moduleRegistry = await ModuleRegistry.fromPackageRoot()
    const semanticAnalyzer = new SemanticAnalyzer({ moduleRegistry })
    let result

    try {
      result = this.compileProgram(graph.program, {
        tokens: graph.entry.tokens,
        sourcePath: graph.entry.path,
        semanticAnalyzer
      })
    } catch (error) {
      if (error instanceof Diagnostic) {
        const source = graph.sources.get(error.location?.sourcePath) ?? graph.entry.source
        throw error.withSource(source)
      }
      if (error instanceof DiagnosticCollection) {
        throw error.withSources(graph.sources, graph.entry.source)
      }
      throw error
    }

    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, result.llvm)
    return result
  }

  async buildExecutable(llvmPath, outputPath, {
    clang = 'clang',
    optimize = false,
    sanitizers = []
  } = {}) {
    const flags = ['-Wno-override-module', '-g']
    if (optimize) flags.push('-O2')
    if (sanitizers.length > 0) {
      flags.push(`-fsanitize=${sanitizers.join(',')}`, '-fno-omit-frame-pointer')
    }

    const llvm = await readFile(llvmPath, 'utf8')
    const objectPath = `${outputPath}.o`
    await this.run(clang, [...flags, '-c', llvmPath, '-o', objectPath])

    const sources = [objectPath]
    const generated = []

    try {
      if (/@lumen_compiler_image\(\)/.test(llvm)) {
        const imageSourcePath = `${outputPath}.compiler-image.c`
        const imageObjectPath = `${outputPath}.compiler-image.o`
        generated.push(imageSourcePath, imageObjectPath)
        await writeFile(imageSourcePath, createCompilerImageSource(llvm))
        await this.run(clang, [...flags, '-c', imageSourcePath, '-o', imageObjectPath])
        sources.push(imageObjectPath)
      }

      sources.push(...runtimeSourcesForLLVM(llvm))
      await this.run(clang, [...flags, ...sources, '-pthread', '-o', outputPath])
    } finally {
      await Promise.all(generated.map(path => unlink(path).catch(error => {
        if (error.code !== 'ENOENT') throw error
      })))
    }

    return outputPath
  }

  async needsRuntime(llvmPath) {
    const llvm = await readFile(llvmPath, 'utf8')
    return /@lumen_/.test(llvm)
  }

  run(command, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: 'inherit'
      })

      child.on('error', reject)
      child.on('exit', code => {
        if (code === 0) resolve()
        else reject(new Error(`${command} exited with ${code}`))
      })
    })
  }
}

function uniqueDiagnostics(diagnostics) {
  const seen = new Set()
  return diagnostics.filter(diagnostic => {
    const key = [
      diagnostic.phase,
      diagnostic.rawMessage,
      diagnostic.location?.sourcePath,
      diagnostic.location?.offset,
      diagnostic.location?.line,
      diagnostic.location?.column
    ].join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function createCompilerImageSource(llvm) {
  const bytes = Buffer.from(llvm, 'utf8')
  const rows = []

  for (let index = 0; index < bytes.length; index += 32) {
    rows.push(`  ${[...bytes.subarray(index, index + 32)].join(', ')},`)
  }

  return [
    'static const unsigned char lumen_compiler_image_bytes[] = {',
    ...rows,
    '  0',
    '};',
    '',
    'const char *lumen_compiler_image(void) {',
    '  return (const char *)lumen_compiler_image_bytes;',
    '}',
    ''
  ].join('\n')
}
