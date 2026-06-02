import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Tokenizer } from '../lexer/Tokenizer.js'
import { Parser } from '../parser/Parser.js'
import { SemanticAnalyzer } from '../semantics/SemanticAnalyzer.js'
import { TypeChecker } from '../semantics/TypeChecker.js'
import { TypeSystem } from '../semantics/TypeSystem.js'
import { IRBuilder } from '../ir/IRBuilder.js'
import { LLVMEmitter } from '../backend/LLVMEmitter.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { ModuleLoader } from '../modules/ModuleLoader.js'

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

  compileSource(source) {
    try {
      const tokens = new this.tokenizer(source).tokenize()
      const ast = new this.parser(tokens).parseProgram()

      this.semanticAnalyzer.analyze(ast)
      this.typeChecker.check(ast)

      const ir = this.irBuilder.build(ast)
      const llvm = this.backend.emit(ir)

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

  async writeLLVM(source, outputPath) {
    const result = this.compileSource(source)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, result.llvm)
    return result
  }

  async writeLLVMFile(inputPath, outputPath) {
    const source = await new ModuleLoader().load(inputPath)
    return this.writeLLVM(source, outputPath)
  }

  async buildExecutable(llvmPath, outputPath, { clang = 'clang', selfHostFallback = false, optimize = false } = {}) {
    const flags = ['-Wno-override-module']
    if (optimize) flags.push('-O2')
    if (!selfHostFallback) flags.push('-DLUMEN_NO_SELF_HOST_FALLBACK')

    await this.run(clang, [...flags, llvmPath, resolve('src/runtime/http.c'), '-pthread', '-o', outputPath])
    return outputPath
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
