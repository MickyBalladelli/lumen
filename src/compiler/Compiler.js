import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Tokenizer } from '../lexer/Tokenizer.js'
import { Parser } from '../parser/Parser.js'
import { SemanticAnalyzer } from '../semantics/SemanticAnalyzer.js'
import { TypeChecker } from '../semantics/TypeChecker.js'
import { TypeSystem } from '../semantics/TypeSystem.js'
import { IRBuilder } from '../ir/IRBuilder.js'
import { LLVMEmitter } from '../backend/LLVMEmitter.js'

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
  }

  async writeLLVM(source, outputPath) {
    const result = this.compileSource(source)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, result.llvm)
    return result
  }

  async buildExecutable(llvmPath, outputPath, { clang = 'clang' } = {}) {
    await this.run(clang, ['-Wno-override-module', llvmPath, '-o', outputPath])
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
