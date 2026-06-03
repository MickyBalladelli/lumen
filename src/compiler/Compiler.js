import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Tokenizer } from '../lexer/Tokenizer.js'
import { Parser } from '../parser/Parser.js'
import { SemanticAnalyzer } from '../semantics/SemanticAnalyzer.js'
import { TypeChecker } from '../semantics/TypeChecker.js'
import { TypeSystem } from '../semantics/TypeSystem.js'
import { IRBuilder } from '../ir/IRBuilder.js'
import { LLVMEmitter } from '../backend/LLVMEmitter.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { ModuleLoader } from '../modules/ModuleLoader.js'
import { ModuleRegistry } from '../semantics/ModuleRegistry.js'

const runtimePath = fileURLToPath(new URL('../runtime/http.c', import.meta.url))

export class Compiler {
  constructor({
    tokenizer = Tokenizer,
    parser = Parser,
    semanticAnalyzer = new SemanticAnalyzer(),
    typeSystem = new TypeSystem(),
    typeChecker = new TypeChecker({ typeSystem }),
    irBuilder = new IRBuilder(),
    backend = new LLVMEmitter({ typeSystem })
  } = {}) {
    this.tokenizer = tokenizer
    this.parser = parser
    this.semanticAnalyzer = semanticAnalyzer
    this.typeChecker = typeChecker
    this.irBuilder = irBuilder
    this.backend = backend
  }

  compileSource(source, { sourcePath = null, semanticAnalyzer = this.semanticAnalyzer } = {}) {
    try {
      const tokens = new this.tokenizer(source).tokenize()
      const ast = new this.parser(tokens).parseProgram()

      semanticAnalyzer.analyze(ast)
      this.typeChecker.check(ast)

      const ir = this.irBuilder.build(ast)
      const llvm = this.backend.emit(ir, { sourcePath })

      return {
        tokens,
        ast,
        ir,
        llvm
      }
    } catch (error) {
      if (error instanceof Diagnostic) throw error.withSource(source)
      throw error
    }
  }

  async writeLLVM(source, outputPath, { sourcePath = null } = {}) {
    const result = this.compileSource(source, { sourcePath })
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, result.llvm)
    return result
  }

  async writeLLVMFile(inputPath, outputPath) {
    const source = await new ModuleLoader().load(inputPath)
    const moduleRegistry = await ModuleRegistry.fromPackageRoot()
    const semanticAnalyzer = new SemanticAnalyzer({ moduleRegistry })
    const result = this.compileSource(source, {
      sourcePath: resolve(inputPath),
      semanticAnalyzer
    })

    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, result.llvm)
    return result
  }

  async buildExecutable(llvmPath, outputPath, { clang = 'clang', selfHostFallback = false, optimize = false } = {}) {
    const flags = ['-Wno-override-module', '-g']
    if (optimize) flags.push('-O2')
    if (!selfHostFallback) flags.push('-DLUMEN_NO_SELF_HOST_FALLBACK')

    const objectPath = `${outputPath}.o`
    await this.run(clang, [...flags, '-c', llvmPath, '-o', objectPath])

    const sources = [objectPath]
    if (await this.needsRuntime(llvmPath)) sources.push(runtimePath)

    await this.run(clang, [...flags, ...sources, '-pthread', '-o', outputPath])
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
