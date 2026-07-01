import { aggregateLowering } from './AggregateLowering.js'
import { asyncLowering } from './AsyncLowering.js'
import { builtinLowering } from './BuiltinLowering.js'
import { controlFlowLowering } from './ControlFlowLowering.js'
import { debugLowering } from './DebugLowering.js'
import { valueLowering } from './ValueLowering.js'
import { emitRuntimeABI } from './RuntimeABI.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes, TypeSystem } from '../semantics/TypeSystem.js'

export class LLVMEmitter {
  constructor({ typeSystem = new TypeSystem() } = {}) {
    this.typeSystem = typeSystem
  }

  emit(irModule, { sourcePath = null } = {}) {
    if (irModule?.kind !== 'IRModule') {
      throw new Diagnostic('LLVM backend expects validated IRModule', null, 'backend')
    }

    this.globals = []
    this.debug = this.createDebugContext(sourcePath)
    this.stringId = 0
    this.usesPrintf = false
    this.usesStrstr = false
    this.usesStrcmp = false
    this.usesFileIO = false
    this.usesAssert = false
    this.usesSlice = false
    this.usesBounds = false
    this.usesChannel = false
    this.usesHttp = false
    this.usesUuid = false
    this.usesDate = false
    this.usesEnv = false
    this.usesCrypto = false
    this.usesArgs = false
    this.usesProcess = false
    this.usesMaps = false
    this.usesResults = false
    this.usesOptions = false
    this.usesStringRuntime = false
    this.usesJsonRuntime = false
    this.usesErrorRuntime = false
    this.usesArrayRuntime = false
    this.usesThread = false
    this.usesTask = false
    this.irCallArguments = []
    this.functionSignatures = new Map([
      ...irModule.functions.map(func => [func.name, func]),
      ...(irModule.externs ?? []).map(func => [func.name, func])
    ])
    this.enumConstants = new Map()
    for (const enumType of irModule.enums ?? []) {
      for (const variant of enumType.variants) {
        this.enumConstants.set(variant.name, {
          type: enumType.name,
          value: String(variant.value)
        })
      }
    }
    const typeDefinitions = irModule.structs.map(struct => this.emitStructType(struct))
    const asyncContextTypes = irModule.functions
      .filter(func => func.isAsync)
      .map(func => this.emitAsyncContextType(func))
    const externs = (irModule.externs ?? []).map(func => this.emitExtern(func))
    const functions = irModule.functions.flatMap(func => this.emitFunction(func))

    return [
      '; Lumen LLVM IR',
      this.debug ? `source_filename = "${this.escapeDebugString(this.debug.filename)}"` : '',
      ...typeDefinitions,
      ...asyncContextTypes,
      ...this.globals,
      ...emitRuntimeABI(this, externs),
      '',
      ...functions,
      ...this.emitDebugMetadata(),
      ''
    ].filter(line => line !== null).join('\n')
  }

  emitStructType(struct) {
    const fields = struct.fields.map(field => this.llvmType(field.type)).join(', ')
    return `%${struct.name} = type { ${fields} }`
  }

  emitExtern(func) {
    const params = func.params.map(param => this.llvmType(param.type)).join(', ')
    return `declare ${this.llvmType(func.returnType)} @${func.name}(${params})`
  }

  emitFunction(func) {
    if (func.isAsync) return this.emitAsyncFunction(func)
    return this.emitFunctionBody(func, func.name)
  }

  emitFunctionBody(func, name, linkage = '') {
    this.temp = 0
    this.label = 0
    this.lines = this.createLineBuffer()
    this.scopes = [new Map()]
    this.tryStack = []
    this.loopStack = []
    this.breakStack = []
    this.deferStack = []
    this.returnType = func.returnType
    this.isAsyncBody = func.isAsync

    const params = func.params
      .map(param => `${this.llvmType(param.type)} %${param.name}`)
      .join(', ')

    const subprogram = this.createDebugSubprogram(func, name)
    this.currentDebugScope = subprogram

    this.lines.push(`define ${linkage}${this.llvmType(func.returnType)} @${name}(${params})${subprogram ? ` !dbg ${subprogram}` : ''} {`)
    this.lines.push('entry:')

    for (const param of func.params) {
      const pointer = this.alloca(param.name, param.type, {
        debugLocation: param.location,
        isParameter: true,
        argumentIndex: func.params.indexOf(param) + 1
      })
      this.lines.push(`  store ${this.llvmType(param.type)} %${param.name}, ptr ${pointer}`)
    }

    const entry = func.blocks.find(block => block.name === func.entry)
    if (!entry) throw new Diagnostic(`IR function ${func.name} has no entry block`, func.location, 'backend')

    for (const instruction of entry.instructions) this.emitIRInstruction(instruction)
    this.emitIRTerminator(entry.terminator)

    if (!this.hasTerminator()) {
      this.emitDeferred()
      this.lines.push(this.defaultReturn(func.returnType))
    }

    this.lines.push('}')
    this.currentDebugScope = null
    this.currentDebugFile = null
    this.isAsyncBody = false
    return this.lines
  }

  emitIRInstruction(instruction) {
    const previousDebugLocation = this.activeDebugLocation
    const debugLocation = this.createDebugLocation(instruction)
    if (debugLocation) this.activeDebugLocation = debugLocation

    try {
      if (instruction.op === 'declare') return this.emitVariableDeclaration(instruction)
      if (instruction.op === 'evaluate') return this.emitExpression(instruction.expression)
      if (instruction.op === 'defer') return this.emitDefer(instruction)
      if (instruction.op === 'block') return this.emitIRBlock(instruction.body)
      if (instruction.op === 'tryCatch') return this.emitTryCatch(instruction)
      if (instruction.op === 'if') return this.emitIf(instruction)
      if (instruction.op === 'switch') return this.emitSwitch(instruction)
      if (instruction.op === 'forOf') return this.emitForOf(instruction)
      if (instruction.op === 'forRange') return this.emitForRange(instruction)
      if (instruction.op === 'for') return this.emitFor(instruction)
      if (instruction.op === 'while') return this.emitWhile(instruction)
      if (instruction.op === 'doUntil') return this.emitDoUntil(instruction)

      throw new Diagnostic(`LLVM backend does not support IR instruction ${instruction.op}`, instruction.location, 'backend')
    } finally {
      this.activeDebugLocation = previousDebugLocation
    }
  }

  emitIRTerminator(terminator) {
    if (!terminator || terminator.op === 'fallthrough') return

    const previousDebugLocation = this.activeDebugLocation
    const debugLocation = this.createDebugLocation(terminator)
    if (debugLocation) this.activeDebugLocation = debugLocation

    try {
      if (terminator.op === 'return') return this.emitReturn(terminator)
      if (terminator.op === 'throw') return this.emitThrow(terminator)
      if (terminator.op === 'break') return this.emitBreak(terminator)
      if (terminator.op === 'continue') return this.emitContinue(terminator)
      throw new Diagnostic(`LLVM backend does not support IR terminator ${terminator.op}`, terminator.location, 'backend')
    } finally {
      this.activeDebugLocation = previousDebugLocation
    }
  }

  emitIRBlock(block, { scoped = true } = {}) {
    if (scoped) this.pushScope()
    for (const instruction of block.instructions) {
      if (this.hasTerminator()) break
      this.emitIRInstruction(instruction)
    }
    if (!this.hasTerminator()) this.emitIRTerminator(block.terminator)
    if (scoped) this.popScope()
  }

  emitStatement(node) {
    if (node?.kind === 'IRBasicBlock') return this.emitIRBlock(node)
    if (node?.kind === 'IRInstruction') return this.emitIRInstruction(node)
    if (node?.kind === 'IRTerminator') return this.emitIRTerminator(node)
    throw new Diagnostic('LLVM backend accepts IR nodes only', node?.location, 'backend')
  }

  globalCString(value) {
    const name = `@.str.${this.stringId}`
    this.stringId += 1
    const bytes = this.cStringBytes(value)
    const content = bytes.map(byte => this.escapeByte(byte)).join('')

    this.globals.push(`${name} = private unnamed_addr constant [${bytes.length} x i8] c"${content}"`)

    return {
      pointer: `getelementptr inbounds ([${bytes.length} x i8], ptr ${name}, i64 0, i64 0)`
    }
  }

  cStringBytes(value) {
    return [
      ...Array.from(value, char => char.charCodeAt(0)),
      0
    ]
  }

  escapeByte(byte) {
    if (byte === 10) return '\\0A'
    if (byte === 0) return '\\00'
    if (byte === 34) return '\\22'
    if (byte === 92) return '\\5C'
    if (byte >= 32 && byte <= 126) return String.fromCharCode(byte)
    return `\\${byte.toString(16).padStart(2, '0').toUpperCase()}`
  }

  alloca(name, type, {
    length = null,
    debugLocation = null,
    isParameter = false,
    argumentIndex = null
  } = {}) {
    const pointer = `%${name}.addr.${this.temp}`
    this.temp += 1
    const storageType = this.typeSystem.isArray(type)
      ? this.typeSystem.llvmArray(type, length)
      : this.llvmType(type)
    this.lines.push(`  ${pointer} = alloca ${storageType}`)
    this.emitDebugDeclare(name, pointer, type, debugLocation, {
      isParameter,
      argumentIndex
    })
    this.define(name, {
      pointer,
      type,
      length
    })
    return pointer
  }

  llvmType(type) {
    return this.typeSystem.llvm(type)
  }

  nextTemp() {
    const name = `%t${this.temp}`
    this.temp += 1
    return name
  }

  nextLabel(prefix) {
    const name = `${prefix}.${this.label}`
    this.label += 1
    return name
  }

  pushScope() {
    this.scopes.push(new Map())
  }

  popScope() {
    this.scopes.pop()
  }

  define(name, symbol) {
    this.scopes.at(-1).set(name, symbol)
  }

  resolve(name) {
    for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
      const symbol = this.scopes[index].get(name)
      if (symbol) return symbol
    }

    throw new Diagnostic(`Unknown symbol "${name}"`, null, 'backend')
  }

  hasTerminator() {
    const last = this.lines.at(-1) ?? ''
    return last.trim().startsWith('ret ') || last.trim().startsWith('br ')
  }

  defaultReturn(type) {
    if (type === LumenTypes.Void) return '  ret void'
    if (type === LumenTypes.F32) return '  ret float 0.000000e+00'
    return `  ret ${this.llvmType(type)} 0`
  }
}

Object.defineProperties(LLVMEmitter.prototype, {
  ...aggregateLowering,
  ...asyncLowering,
  ...builtinLowering,
  ...controlFlowLowering,
  ...debugLowering,
  ...valueLowering
})
