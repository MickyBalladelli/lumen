import { TokenType } from '../lexer/TokenType.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes, TypeSystem } from '../semantics/TypeSystem.js'
import { SystemFunctions } from '../system/SystemLibrary.js'
import { FsFunctions } from '../fs/FsLibrary.js'
import { HttpFunctions } from '../http/HttpLibrary.js'
import { ThreadFunctions } from '../thread/ThreadLibrary.js'

const BINARY_PRECEDENCE = new Map([
  ['*', 40],
  ['/', 40],
  ['%', 40],
  ['+', 30],
  ['-', 30],
  ['<', 20],
  ['<=', 20],
  ['>', 20],
  ['>=', 20],
  ['==', 15],
  ['!=', 15]
])

export class LLVMEmitter {
  constructor({ typeSystem = new TypeSystem() } = {}) {
    this.typeSystem = typeSystem
  }

  emit(irModule) {
    this.globals = []
    this.stringId = 0
    this.usesPrintf = false
    this.usesStrstr = false
    this.usesStrcmp = false
    this.usesFileIO = false
    this.usesAssert = false
    this.usesSlice = false
    this.usesChannel = false
    this.usesHttp = false
    this.usesUuid = false
    this.usesEnv = false
    this.usesCrypto = false
    this.usesArgs = false
    this.usesMaps = false
    this.usesResults = false
    this.usesOptions = false
    this.usesStringRuntime = false
    this.usesJsonRuntime = false
    this.usesErrorRuntime = false
    this.usesArrayRuntime = false
    this.usesThread = false
    this.functionSignatures = new Map(irModule.functions.map(func => [func.name, func]))
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
    const functions = irModule.functions.flatMap(func => this.emitFunction(func))

    return [
      '; Lumen LLVM IR',
      ...typeDefinitions,
      ...this.globals,
      this.usesPrintf ? 'declare i32 @printf(ptr, ...)' : '',
      this.usesStrstr ? 'declare ptr @strstr(ptr, ptr)' : '',
      this.usesStrcmp ? 'declare i32 @strcmp(ptr, ptr)' : '',
      this.usesFileIO ? 'declare ptr @fopen(ptr, ptr)' : '',
      this.usesFileIO ? 'declare i32 @fseek(ptr, i64, i32)' : '',
      this.usesFileIO ? 'declare i64 @ftell(ptr)' : '',
      this.usesFileIO ? 'declare i64 @fread(ptr, i64, i64, ptr)' : '',
      this.usesFileIO ? 'declare ptr @malloc(i64)' : '',
      this.usesFileIO ? 'declare i32 @fclose(ptr)' : '',
      this.usesAssert ? 'declare void @lumen_assert(i1, ptr)' : '',
      this.usesSlice ? 'declare ptr @lumen_string_slice(ptr, i32, i32)' : '',
      this.usesChannel ? 'declare ptr @lumen_channel()' : '',
      this.usesChannel ? 'declare void @lumen_send(ptr, ptr)' : '',
      this.usesChannel ? 'declare ptr @lumen_receive(ptr)' : '',
      this.usesUuid ? 'declare ptr @lumen_uuid()' : '',
      this.usesEnv ? 'declare ptr @lumen_env(ptr)' : '',
      this.usesCrypto ? 'declare ptr @lumen_encrypt(ptr, ptr, ptr)' : '',
      this.usesCrypto ? 'declare ptr @lumen_decrypt(ptr, ptr, ptr)' : '',
      this.usesArgs ? 'declare ptr @lumen_arg(i32)' : '',
      this.usesArgs ? 'declare i32 @lumen_arg_count()' : '',
      this.usesMaps ? 'declare ptr @lumen_map(i32, ...)' : '',
      this.usesMaps ? 'declare ptr @lumen_map_get(ptr, ptr)' : '',
      this.usesMaps ? 'declare i1 @lumen_map_has(ptr, ptr)' : '',
      this.usesResults ? 'declare ptr @lumen_ok(ptr)' : '',
      this.usesResults ? 'declare ptr @lumen_err(ptr)' : '',
      this.usesResults ? 'declare i1 @lumen_is_ok(ptr)' : '',
      this.usesResults ? 'declare ptr @lumen_error_message(ptr)' : '',
      this.usesOptions ? 'declare ptr @lumen_some(ptr)' : '',
      this.usesOptions ? 'declare ptr @lumen_none()' : '',
      this.usesOptions ? 'declare i1 @lumen_has_value(ptr)' : '',
      this.usesOptions ? 'declare ptr @lumen_value_or(ptr, ptr)' : '',
      this.usesStringRuntime ? 'declare ptr @lumen_string_concat(ptr, ptr)' : '',
      this.usesJsonRuntime ? 'declare ptr @lumen_json(ptr)' : '',
      this.usesJsonRuntime ? 'declare ptr @lumen_json_get(ptr, ptr)' : '',
      this.usesJsonRuntime ? 'declare ptr @lumen_json_set(ptr, ptr, ptr)' : '',
      this.usesErrorRuntime ? 'declare ptr @lumen_error_new(i32, ptr)' : '',
      this.usesErrorRuntime ? 'declare i32 @lumen_error_code(ptr)' : '',
      this.usesErrorRuntime ? 'declare ptr @lumen_error_text(ptr)' : '',
      this.usesArrayRuntime ? 'declare ptr @lumen_array_join(i32, ptr, ptr)' : '',
      this.usesHttp ? 'declare i32 @lumen_http_serve_files(i32, ptr)' : '',
      this.usesHttp ? 'declare i32 @lumen_http_serve_api(i32, ptr, ptr, ptr, ptr)' : '',
      this.usesHttp ? 'declare i32 @lumen_http_serve_http(i32, ptr, ptr, ptr, ptr, ptr, i32)' : '',
      this.usesHttp ? 'declare i32 @lumen_socketio_serve_chat(i32, ptr)' : '',
      this.usesHttp ? 'declare ptr @lumen_socketio_event(ptr, ptr)' : '',
      this.usesHttp ? 'declare ptr @lumen_socketio_emit(ptr, ptr, ptr)' : '',
      this.usesHttp ? 'declare ptr @lumen_http_request(ptr, ptr, ptr)' : '',
      this.usesHttp ? 'declare ptr @lumen_http_response(i32, ptr, ptr)' : '',
      this.usesThread ? 'declare ptr @lumen_semaphore_create(i32)' : '',
      this.usesThread ? 'declare void @lumen_semaphore_wait(ptr)' : '',
      this.usesThread ? 'declare void @lumen_semaphore_signal(ptr)' : '',
      this.usesThread ? 'declare ptr @lumen_thread_start(ptr, ptr, ptr, ptr)' : '',
      this.usesThread ? 'declare i32 @lumen_thread_join(ptr)' : '',
      this.usesThread ? 'declare i32 @lumen_append_file(ptr, ptr)' : '',
      '',
      ...functions,
      ''
    ].filter(line => line !== null).join('\n')
  }

  emitStructType(struct) {
    const fields = struct.fields.map(field => this.llvmType(field.type)).join(', ')
    return `%${struct.name} = type { ${fields} }`
  }

  emitFunction(func) {
    this.temp = 0
    this.label = 0
    this.lines = []
    this.scopes = [new Map()]
    this.tryStack = []
    this.loopStack = []
    this.breakStack = []
    this.deferStack = []
    this.returnType = func.returnType

    const params = func.params
      .map(param => `${this.llvmType(param.type)} %${param.name}`)
      .join(', ')

    this.lines.push(`define ${this.llvmType(func.returnType)} @${func.name}(${params}) {`)
    this.lines.push('entry:')

    for (const param of func.params) {
      const pointer = this.alloca(param.name, param.type)
      this.lines.push(`  store ${this.llvmType(param.type)} %${param.name}, ptr ${pointer}`)
    }

    for (const statement of func.body) this.emitStatement(statement)

    if (!this.hasTerminator()) {
      this.emitDeferred()
      this.lines.push(this.defaultReturn(func.returnType))
    }

    this.lines.push('}')
    return this.lines
  }

  emitStatement(node) {
    if (node.kind === 'VariableDeclaration') return this.emitVariableDeclaration(node)
    if (node.kind === 'ExpressionStatement') return this.emitExpression(node.expression)
    if (node.kind === 'DeferStatement') return this.emitDefer(node)
    if (node.kind === 'ReturnStatement') return this.emitReturn(node)
    if (node.kind === 'BreakStatement') return this.emitBreak(node)
    if (node.kind === 'ContinueStatement') return this.emitContinue(node)
    if (node.kind === 'ThrowStatement') return this.emitThrow(node)
    if (node.kind === 'TryCatchStatement') return this.emitTryCatch(node)
    if (node.kind === 'IfStatement') return this.emitIf(node)
    if (node.kind === 'SwitchStatement') return this.emitSwitch(node)
    if (node.kind === 'BlockStatement') return this.emitBlock(node)
    if (node.kind === 'ForOfStatement') return this.emitForOf(node)
    if (node.kind === 'ForRangeStatement') return this.emitForRange(node)
    if (node.kind === 'ForStatement') return this.emitFor(node)
    if (node.kind === 'WhileStatement') return this.emitWhile(node)
    if (node.kind === 'DoUntilStatement') return this.emitDoUntil(node)

    throw new Diagnostic(`LLVM backend does not support ${node.kind}`, node.location, 'backend')
  }

  emitBlock(node) {
    this.pushScope()
    for (const statement of node.body) {
      if (this.hasTerminator()) break
      this.emitStatement(statement)
    }
    this.popScope()
  }

  emitTryCatch(node) {
    const catchLabel = this.nextLabel('catch')
    const endLabel = this.nextLabel('try.end')
    const errorPointer = this.alloca(`.${node.catchParam.name}.error`, LumenTypes.String)

    this.tryStack.push({
      catchLabel,
      errorPointer
    })

    this.emitStatement(node.tryBlock)

    if (!this.hasTerminator()) {
      this.lines.push(`  br label %${endLabel}`)
    }

    this.tryStack.pop()
    this.lines.push(`${catchLabel}:`)

    this.pushScope()
    this.define(node.catchParam.name, {
      pointer: errorPointer,
      type: LumenTypes.String,
      length: null
    })
    this.emitStatement(node.catchBlock)
    this.popScope()

    if (!this.hasTerminator()) {
      this.lines.push(`  br label %${endLabel}`)
    }

    this.lines.push(`${endLabel}:`)
  }

  emitThrow(node) {
    const active = this.tryStack.at(-1)

    if (!active) {
      throw new Diagnostic('throw needs active try/catch', node.location, 'backend')
    }

    const value = this.emitExpression(node.argument)

    if (value.type !== LumenTypes.String && value.type !== LumenTypes.Error) {
      throw new Diagnostic('throw expects string or error', node.location, 'backend')
    }

    this.lines.push(`  store ptr ${value.value}, ptr ${active.errorPointer}`)
    this.lines.push(`  br label %${active.catchLabel}`)
  }

  emitVariableDeclaration(node) {
    for (const declaration of node.declarations) {
      const type = declaration.inferredType ?? LumenTypes.I32
      const pointer = this.alloca(declaration.id.name, type, {
        length: declaration.arrayLength
      })

      if (declaration.initializer) {
        if (this.isArrayLiteral(declaration.initializer.tokens)) {
          this.emitArrayInitializer(pointer, type, declaration.initializer.tokens)
          continue
        }

        if (this.isStructLiteral(declaration.initializer.tokens)) {
          this.emitStructInitializer(pointer, type, declaration.initializer.tokens)
          continue
        }

        const value = this.emitExpression(declaration.initializer)
        this.lines.push(`  store ${this.llvmType(type)} ${this.cast(value, type)}, ptr ${pointer}`)
      }
    }
  }

  emitReturn(node) {
    this.emitDeferred()

    if (!node.argument) {
      this.lines.push('  ret void')
      return
    }

    const value = this.emitExpression(node.argument)
    this.lines.push(`  ret ${this.llvmType(this.returnType)} ${this.cast(value, this.returnType)}`)
  }

  emitDefer(node) {
    this.deferStack.push(node.expression)
  }

  emitDeferred() {
    while (this.deferStack.length > 0) {
      this.emitExpression(this.deferStack.pop())
    }
  }

  emitBreak(node) {
    const breakLabel = this.breakStack.at(-1)
    if (!breakLabel) throw new Diagnostic('break needs active loop or switch', node.location, 'backend')
    this.lines.push(`  br label %${breakLabel}`)
  }

  emitContinue(node) {
    const loop = this.loopStack.at(-1)
    if (!loop) throw new Diagnostic('continue needs active loop', node.location, 'backend')
    this.lines.push(`  br label %${loop.continueLabel}`)
  }

  emitIf(node) {
    const thenLabel = this.nextLabel('if.then')
    const elseLabel = this.nextLabel('if.else')
    const endLabel = this.nextLabel('if.end')
    const condition = this.emitExpression(node.test)

    this.lines.push(`  br i1 ${this.cast(condition, LumenTypes.Bool)}, label %${thenLabel}, label %${node.alternate ? elseLabel : endLabel}`)
    this.lines.push(`${thenLabel}:`)
    this.emitStatement(node.consequent)
    if (!this.hasTerminator()) this.lines.push(`  br label %${endLabel}`)

    if (node.alternate) {
      this.lines.push(`${elseLabel}:`)
      this.emitStatement(node.alternate)
      if (!this.hasTerminator()) this.lines.push(`  br label %${endLabel}`)
    }

    this.lines.push(`${endLabel}:`)
  }

  emitSwitch(node) {
    const endLabel = this.nextLabel('switch.end')
    const defaultLabel = node.defaultCase ? this.nextLabel('switch.default') : endLabel
    const testLabels = node.cases.map(() => this.nextLabel('switch.test'))
    const caseLabels = node.cases.map(() => this.nextLabel('switch.case'))
    const discriminant = this.emitExpression(node.discriminant)

    this.lines.push(`  br label %${testLabels[0] ?? defaultLabel}`)

    for (let index = 0; index < node.cases.length; index += 1) {
      const switchCase = node.cases[index]
      this.lines.push(`${testLabels[index]}:`)
      const caseValue = this.emitExpression(switchCase.test)
      const matches = this.emitEqualityComparison(discriminant, caseValue)
      const nextLabel = testLabels[index + 1] ?? defaultLabel
      this.lines.push(`  br i1 ${matches.value}, label %${caseLabels[index]}, label %${nextLabel}`)
      this.lines.push(`${caseLabels[index]}:`)
      this.breakStack.push(endLabel)
      this.emitStatement(switchCase.body)
      this.breakStack.pop()
      if (!this.hasTerminator()) this.lines.push(`  br label %${endLabel}`)
    }

    if (node.defaultCase) {
      this.lines.push(`${defaultLabel}:`)
      this.breakStack.push(endLabel)
      this.emitStatement(node.defaultCase)
      this.breakStack.pop()
      if (!this.hasTerminator()) this.lines.push(`  br label %${endLabel}`)
    }

    this.lines.push(`${endLabel}:`)
  }

  emitForRange(node) {
    this.pushScope()
    const itemPointer = this.alloca(node.item.name, LumenTypes.I32)
    const start = this.emitExpression(node.start)
    const end = this.emitExpression(node.end)
    const conditionLabel = this.nextLabel('range.cond')
    const bodyLabel = this.nextLabel('range.body')
    const updateLabel = this.nextLabel('range.update')
    const endLabel = this.nextLabel('range.end')

    this.lines.push(`  store i32 ${this.cast(start, LumenTypes.I32)}, ptr ${itemPointer}`)
    this.breakStack.push(endLabel)
    this.loopStack.push({
      breakLabel: endLabel,
      continueLabel: updateLabel
    })

    this.lines.push(`  br label %${conditionLabel}`)
    this.lines.push(`${conditionLabel}:`)
    const current = this.nextTemp()
    const inRange = this.nextTemp()
    this.lines.push(`  ${current} = load i32, ptr ${itemPointer}`)
    this.lines.push(`  ${inRange} = icmp slt i32 ${current}, ${this.cast(end, LumenTypes.I32)}`)
    this.lines.push(`  br i1 ${inRange}, label %${bodyLabel}, label %${endLabel}`)

    this.lines.push(`${bodyLabel}:`)
    this.emitStatement(node.body)
    if (!this.hasTerminator()) this.lines.push(`  br label %${updateLabel}`)

    this.lines.push(`${updateLabel}:`)
    const updateCurrent = this.nextTemp()
    const next = this.nextTemp()
    this.lines.push(`  ${updateCurrent} = load i32, ptr ${itemPointer}`)
    this.lines.push(`  ${next} = add i32 ${updateCurrent}, 1`)
    this.lines.push(`  store i32 ${next}, ptr ${itemPointer}`)
    this.lines.push(`  br label %${conditionLabel}`)

    this.lines.push(`${endLabel}:`)
    this.loopStack.pop()
    this.breakStack.pop()
    this.popScope()
  }

  emitFor(node) {
    this.pushScope()

    if (node.init?.kind === 'VariableDeclaration') {
      this.emitVariableDeclaration(node.init)
    } else if (node.init) {
      this.emitExpression(node.init)
    }

    const conditionLabel = this.nextLabel('for.cond')
    const bodyLabel = this.nextLabel('for.body')
    const updateLabel = this.nextLabel('for.update')
    const endLabel = this.nextLabel('for.end')
    this.breakStack.push(endLabel)
    this.loopStack.push({
      breakLabel: endLabel,
      continueLabel: updateLabel
    })

    this.lines.push(`  br label %${conditionLabel}`)
    this.lines.push(`${conditionLabel}:`)

    if (node.test) {
      const condition = this.emitExpression(node.test)
      this.lines.push(`  br i1 ${this.cast(condition, LumenTypes.Bool)}, label %${bodyLabel}, label %${endLabel}`)
    } else {
      this.lines.push(`  br label %${bodyLabel}`)
    }

    this.lines.push(`${bodyLabel}:`)
    this.emitStatement(node.body)
    if (!this.hasTerminator()) this.lines.push(`  br label %${updateLabel}`)

    this.lines.push(`${updateLabel}:`)
    if (node.update) this.emitExpression(node.update)
    this.lines.push(`  br label %${conditionLabel}`)

    this.lines.push(`${endLabel}:`)
    this.loopStack.pop()
    this.breakStack.pop()
    this.popScope()
  }

  emitWhile(node) {
    const conditionLabel = this.nextLabel('while.cond')
    const bodyLabel = this.nextLabel('while.body')
    const endLabel = this.nextLabel('while.end')
    this.breakStack.push(endLabel)
    this.loopStack.push({
      breakLabel: endLabel,
      continueLabel: conditionLabel
    })

    this.lines.push(`  br label %${conditionLabel}`)
    this.lines.push(`${conditionLabel}:`)

    const condition = this.emitExpression(node.test)
    this.lines.push(`  br i1 ${this.cast(condition, LumenTypes.Bool)}, label %${bodyLabel}, label %${endLabel}`)

    this.lines.push(`${bodyLabel}:`)
    this.emitStatement(node.body)
    if (!this.hasTerminator()) this.lines.push(`  br label %${conditionLabel}`)

    this.lines.push(`${endLabel}:`)
    this.loopStack.pop()
    this.breakStack.pop()
  }

  emitDoUntil(node) {
    const bodyLabel = this.nextLabel('do.body')
    const conditionLabel = this.nextLabel('do.cond')
    const endLabel = this.nextLabel('do.end')
    this.breakStack.push(endLabel)
    this.loopStack.push({
      breakLabel: endLabel,
      continueLabel: conditionLabel
    })

    this.lines.push(`  br label %${bodyLabel}`)
    this.lines.push(`${bodyLabel}:`)

    this.emitStatement(node.body)
    if (!this.hasTerminator()) this.lines.push(`  br label %${conditionLabel}`)

    this.lines.push(`${conditionLabel}:`)
    const condition = this.emitExpression(node.test)
    this.lines.push(`  br i1 ${this.cast(condition, LumenTypes.Bool)}, label %${endLabel}, label %${bodyLabel}`)

    this.lines.push(`${endLabel}:`)
    this.loopStack.pop()
    this.breakStack.pop()
  }

  emitForOf(node) {
    if (this.isCall(node.iterable.tokens, SystemFunctions.Filter)) {
      return this.emitFilteredForOf(node)
    }

    const iterableName = this.singleIdentifierName(node.iterable)
    const iterable = this.resolve(iterableName)

    if (!this.typeSystem.isArray(iterable.type) || iterable.length === null) {
      throw new Diagnostic('for-of backend needs fixed array', node.location, 'backend')
    }

    const elementType = this.typeSystem.elementType(iterable.type)
    const indexPointer = this.alloca(`.${node.item.name}.index`, LumenTypes.I32)
    const itemPointer = this.alloca(node.item.name, elementType)
    const conditionLabel = this.nextLabel('forof.cond')
    const bodyLabel = this.nextLabel('forof.body')
    const updateLabel = this.nextLabel('forof.update')
    const endLabel = this.nextLabel('forof.end')
    this.breakStack.push(endLabel)
    this.loopStack.push({
      breakLabel: endLabel,
      continueLabel: updateLabel
    })

    this.lines.push(`  store i32 0, ptr ${indexPointer}`)
    this.lines.push(`  br label %${conditionLabel}`)
    this.lines.push(`${conditionLabel}:`)

    const currentIndex = this.nextTemp()
    const condition = this.nextTemp()
    this.lines.push(`  ${currentIndex} = load i32, ptr ${indexPointer}`)
    this.lines.push(`  ${condition} = icmp slt i32 ${currentIndex}, ${iterable.length}`)
    this.lines.push(`  br i1 ${condition}, label %${bodyLabel}, label %${endLabel}`)
    this.lines.push(`${bodyLabel}:`)

    const elementPointer = this.nextTemp()
    const elementValue = this.nextTemp()
    this.lines.push(`  ${elementPointer} = getelementptr inbounds ${this.typeSystem.llvmArray(iterable.type, iterable.length)}, ptr ${iterable.pointer}, i32 0, i32 ${currentIndex}`)
    this.lines.push(`  ${elementValue} = load ${this.llvmType(elementType)}, ptr ${elementPointer}`)
    this.lines.push(`  store ${this.llvmType(elementType)} ${elementValue}, ptr ${itemPointer}`)

    this.emitStatement(node.body)
    if (!this.hasTerminator()) this.lines.push(`  br label %${updateLabel}`)

    this.lines.push(`${updateLabel}:`)
    const updateIndex = this.nextTemp()
    const nextIndex = this.nextTemp()
    this.lines.push(`  ${updateIndex} = load i32, ptr ${indexPointer}`)
    this.lines.push(`  ${nextIndex} = add i32 ${updateIndex}, 1`)
    this.lines.push(`  store i32 ${nextIndex}, ptr ${indexPointer}`)
    this.lines.push(`  br label %${conditionLabel}`)

    this.lines.push(`${endLabel}:`)
    this.loopStack.pop()
    this.breakStack.pop()
  }

  emitFilteredForOf(node) {
    const args = this.callArguments(node.iterable.tokens)
    const iterableName = this.singleIdentifierName({ tokens: args[0], location: node.iterable.location })
    const iterable = this.resolve(iterableName)

    if (!this.typeSystem.isArray(iterable.type) || iterable.length === null) {
      throw new Diagnostic('filter needs fixed array', node.location, 'backend')
    }

    const predicate = this.filterPredicate(args[1], node.iterable.location)
    const elementType = this.typeSystem.elementType(iterable.type)
    const indexPointer = this.alloca(`.${node.item.name}.index`, LumenTypes.I32)
    const itemPointer = this.alloca(node.item.name, elementType)
    const conditionLabel = this.nextLabel('filter.cond')
    const predicateLabel = this.nextLabel('filter.pred')
    const bodyLabel = this.nextLabel('filter.body')
    const updateLabel = this.nextLabel('filter.update')
    const endLabel = this.nextLabel('filter.end')
    this.breakStack.push(endLabel)
    this.loopStack.push({
      breakLabel: endLabel,
      continueLabel: updateLabel
    })

    this.lines.push(`  store i32 0, ptr ${indexPointer}`)
    this.lines.push(`  br label %${conditionLabel}`)
    this.lines.push(`${conditionLabel}:`)

    const currentIndex = this.nextTemp()
    const condition = this.nextTemp()
    this.lines.push(`  ${currentIndex} = load i32, ptr ${indexPointer}`)
    this.lines.push(`  ${condition} = icmp slt i32 ${currentIndex}, ${iterable.length}`)
    this.lines.push(`  br i1 ${condition}, label %${predicateLabel}, label %${endLabel}`)
    this.lines.push(`${predicateLabel}:`)

    const elementPointer = this.nextTemp()
    const elementValue = this.nextTemp()
    this.lines.push(`  ${elementPointer} = getelementptr inbounds ${this.typeSystem.llvmArray(iterable.type, iterable.length)}, ptr ${iterable.pointer}, i32 0, i32 ${currentIndex}`)
    this.lines.push(`  ${elementValue} = load ${this.llvmType(elementType)}, ptr ${elementPointer}`)
    this.lines.push(`  store ${this.llvmType(elementType)} ${elementValue}, ptr ${itemPointer}`)

    const passes = this.emitRpn(this.toRpn(predicate.tokens), node.iterable.location)
    this.lines.push(`  br i1 ${this.cast(passes, LumenTypes.Bool)}, label %${bodyLabel}, label %${updateLabel}`)
    this.lines.push(`${bodyLabel}:`)

    this.emitStatement(node.body)
    if (!this.hasTerminator()) this.lines.push(`  br label %${updateLabel}`)

    this.lines.push(`${updateLabel}:`)
    const updateIndex = this.nextTemp()
    const nextIndex = this.nextTemp()
    this.lines.push(`  ${updateIndex} = load i32, ptr ${indexPointer}`)
    this.lines.push(`  ${nextIndex} = add i32 ${updateIndex}, 1`)
    this.lines.push(`  store i32 ${nextIndex}, ptr ${indexPointer}`)
    this.lines.push(`  br label %${conditionLabel}`)

    this.lines.push(`${endLabel}:`)
    this.loopStack.pop()
    this.breakStack.pop()
  }

  emitExpression(expression) {
    if (!expression || expression.tokens.length === 0) {
      return { type: LumenTypes.Void, value: '' }
    }

    if (expression.tokens[0]?.lexeme === 'await') {
      return this.emitExpression({
        tokens: expression.tokens.slice(1),
        location: expression.tokens[0].location
      })
    }

    if (this.isCall(expression.tokens, SystemFunctions.Println)) return this.emitPrintln(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Len)) return this.emitLen(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Includes)) return this.emitIncludes(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Uuid)) return this.emitUuid(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Env)) return this.emitEnv(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Encrypt)) return this.emitEncrypt(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Decrypt)) return this.emitDecrypt(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Arg)) return this.emitArg(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.ArgCount)) return this.emitArgCount(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Map)) return this.emitMap(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.MapGet)) return this.emitRuntimeCall(expression.tokens, 'lumen_map_get', LumenTypes.String, 2, 'mapGet')
    if (this.isCall(expression.tokens, SystemFunctions.MapHas)) return this.emitRuntimeCall(expression.tokens, 'lumen_map_has', LumenTypes.Bool, 2, 'mapHas')
    if (this.isCall(expression.tokens, SystemFunctions.Ok)) return this.emitRuntimeCall(expression.tokens, 'lumen_ok', LumenTypes.String, 1, 'ok')
    if (this.isCall(expression.tokens, SystemFunctions.Err)) return this.emitRuntimeCall(expression.tokens, 'lumen_err', LumenTypes.String, 1, 'err')
    if (this.isCall(expression.tokens, SystemFunctions.IsOk)) return this.emitRuntimeCall(expression.tokens, 'lumen_is_ok', LumenTypes.Bool, 1, 'isOk')
    if (this.isCall(expression.tokens, SystemFunctions.ErrorMessage)) return this.emitRuntimeCall(expression.tokens, 'lumen_error_message', LumenTypes.String, 1, 'errorMessage')
    if (this.isCall(expression.tokens, SystemFunctions.Some)) return this.emitRuntimeCall(expression.tokens, 'lumen_some', LumenTypes.String, 1, 'some')
    if (this.isCall(expression.tokens, SystemFunctions.None)) return this.emitNone(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.HasValue)) return this.emitRuntimeCall(expression.tokens, 'lumen_has_value', LumenTypes.Bool, 1, 'hasValue')
    if (this.isCall(expression.tokens, SystemFunctions.ValueOr)) return this.emitRuntimeCall(expression.tokens, 'lumen_value_or', LumenTypes.String, 2, 'valueOr')
    if (this.isCall(expression.tokens, SystemFunctions.Assert)) return this.emitAssert(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Channel)) return this.emitChannel(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Send)) return this.emitSend(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Receive)) return this.emitReceive(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Json)) return this.emitRuntimeCall(expression.tokens, 'lumen_json', LumenTypes.Json, 1, 'json')
    if (this.isCall(expression.tokens, SystemFunctions.JsonGet)) return this.emitRuntimeCall(expression.tokens, 'lumen_json_get', LumenTypes.String, 2, 'jsonGet')
    if (this.isCall(expression.tokens, SystemFunctions.JsonSet)) return this.emitRuntimeCall(expression.tokens, 'lumen_json_set', LumenTypes.Json, 3, 'jsonSet')
    if (this.isCall(expression.tokens, SystemFunctions.NewError)) return this.emitNewError(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.ErrorCode)) return this.emitRuntimeCall(expression.tokens, 'lumen_error_code', LumenTypes.I32, 1, 'errorCode')
    if (this.isCall(expression.tokens, SystemFunctions.ErrorText)) return this.emitRuntimeCall(expression.tokens, 'lumen_error_text', LumenTypes.String, 1, 'errorText')
    if (this.isCall(expression.tokens, SystemFunctions.ArraySum)) return this.emitArraySum(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.ArrayFirst)) return this.emitArrayEdge(expression.tokens, 'first')
    if (this.isCall(expression.tokens, SystemFunctions.ArrayLast)) return this.emitArrayEdge(expression.tokens, 'last')
    if (this.isCall(expression.tokens, SystemFunctions.ArrayJoin)) return this.emitArrayJoin(expression.tokens)
    if (this.isCall(expression.tokens, FsFunctions.ReadFile)) return this.emitReadFile(expression.tokens)
    if (this.isCall(expression.tokens, HttpFunctions.ServeFiles)) return this.emitServeFiles(expression.tokens)
    if (this.isCall(expression.tokens, HttpFunctions.ServeApi)) return this.emitServeApi(expression.tokens)
    if (this.isCall(expression.tokens, HttpFunctions.ServeHttp)) return this.emitServeHttp(expression.tokens)
    if (this.isCall(expression.tokens, HttpFunctions.ServeSocketIoChat)) return this.emitServeSocketIoChat(expression.tokens)
    if (this.isCall(expression.tokens, HttpFunctions.SocketIoEvent)) return this.emitSocketIoEvent(expression.tokens)
    if (this.isCall(expression.tokens, HttpFunctions.SocketIoEmit)) return this.emitSocketIoEmit(expression.tokens)
    if (this.isCall(expression.tokens, HttpFunctions.HttpRequest)) return this.emitHttpRequest(expression.tokens)
    if (this.isCall(expression.tokens, HttpFunctions.HttpResponse)) return this.emitHttpResponse(expression.tokens)
    if (this.isCall(expression.tokens, ThreadFunctions.CreateSemaphore)) return this.emitCreateSemaphore(expression.tokens)
    if (this.isCall(expression.tokens, ThreadFunctions.SemaphoreWait)) return this.emitSemaphoreWait(expression.tokens)
    if (this.isCall(expression.tokens, ThreadFunctions.SemaphoreSignal)) return this.emitSemaphoreSignal(expression.tokens)
    if (this.isCall(expression.tokens, ThreadFunctions.StartThread)) return this.emitStartThread(expression.tokens)
    if (this.isCall(expression.tokens, ThreadFunctions.JoinThread)) return this.emitJoinThread(expression.tokens)
    if (this.isCall(expression.tokens, ThreadFunctions.AppendFile)) return this.emitAppendFile(expression.tokens)
    if (this.isUserCall(expression.tokens)) return this.emitUserCall(expression.tokens)
    if (this.isMatch(expression.tokens)) return this.emitMatch(expression.tokens, expression.location)
    if (this.isFieldAccess(expression.tokens)) return this.emitFieldLoad(expression.tokens)
    if (this.isArrayAccess(expression.tokens)) return this.emitArrayLoad(expression.tokens)

    const assignmentIndex = this.findTopLevelOperator(expression.tokens, '=')
    if (assignmentIndex > 0) return this.emitAssignment(expression.tokens, assignmentIndex)

    if (expression.tokens.length === 1 &&
      expression.tokens[0].type === TokenType.String &&
      expression.tokens[0].literal.includes('${')) {
      return this.emitInterpolatedString(expression.tokens[0])
    }

    if (expression.tokens.length === 2 &&
      expression.tokens[0].type === TokenType.Identifier &&
      expression.tokens[1].lexeme === '++') {
      return this.emitIncrement(expression.tokens[0])
    }

    return this.emitRpn(this.toRpn(expression.tokens), expression.location)
  }

  emitAssignment(tokens, index) {
    const targetTokens = tokens.slice(0, index)
    const target = targetTokens[0]
    if (target.type !== TokenType.Identifier) {
      throw new Diagnostic('Assignment target must be an identifier', target.location, 'backend')
    }

    const targetPointer = this.emitAssignmentTargetPointer(targetTokens)
    const value = this.emitExpression({
      tokens: tokens.slice(index + 1),
      location: target.location
    })

    this.lines.push(`  store ${this.llvmType(targetPointer.type)} ${this.cast(value, targetPointer.type)}, ptr ${targetPointer.pointer}`)
    return {
      type: targetPointer.type,
      value: this.cast(value, targetPointer.type)
    }
  }

  emitAssignmentTargetPointer(tokens) {
    if (this.isFieldAccess(tokens)) {
      const base = this.resolve(tokens[0].lexeme)
      const field = this.typeSystem.getField(base.type, tokens[2].lexeme)
      const fieldIndex = this.typeSystem.getStruct(base.type).fields.indexOf(field)
      const pointer = this.nextTemp()
      this.lines.push(`  ${pointer} = getelementptr inbounds ${this.llvmType(base.type)}, ptr ${base.pointer}, i32 0, i32 ${fieldIndex}`)
      return {
        pointer,
        type: field.type
      }
    }

    if (this.isArrayAccess(tokens)) {
      const base = this.resolve(tokens[0].lexeme)
      const closeIndex = this.findMatching(tokens, 1, '[', ']')
      const index = this.emitExpression({
        tokens: tokens.slice(2, closeIndex),
        location: tokens[0].location
      })
      const pointer = this.nextTemp()
      this.lines.push(`  ${pointer} = getelementptr inbounds ${this.typeSystem.llvmArray(base.type, base.length)}, ptr ${base.pointer}, i32 0, i32 ${this.cast(index, LumenTypes.I32)}`)
      return {
        pointer,
        type: this.typeSystem.elementType(base.type)
      }
    }

    const symbol = this.resolve(tokens[0].lexeme)
    return {
      pointer: symbol.pointer,
      type: symbol.type
    }
  }

  emitStructInitializer(pointer, type, tokens) {
    const struct = this.typeSystem.getStruct(type)
    const values = this.structLiteralFields(tokens)

    for (let index = 0; index < struct.fields.length; index += 1) {
      const field = struct.fields[index]
      const valueTokens = values.get(field.name)
      const value = this.emitRpn(this.toRpn(valueTokens), tokens[0].location)
      const fieldPointer = this.nextTemp()

      this.lines.push(`  ${fieldPointer} = getelementptr inbounds ${this.llvmType(type)}, ptr ${pointer}, i32 0, i32 ${index}`)
      this.lines.push(`  store ${this.llvmType(field.type)} ${this.cast(value, field.type)}, ptr ${fieldPointer}`)
    }
  }

  emitArrayInitializer(pointer, type, tokens) {
    const elementType = this.typeSystem.elementType(type)
    const elements = this.splitDelimited(tokens.slice(1, -1))

    for (let index = 0; index < elements.length; index += 1) {
      const elementPointer = this.nextTemp()
      this.lines.push(`  ${elementPointer} = getelementptr inbounds ${this.typeSystem.llvmArray(type, elements.length)}, ptr ${pointer}, i32 0, i32 ${index}`)

      if (this.isStructLiteral(elements[index])) {
        this.emitStructInitializer(elementPointer, elementType, elements[index])
        continue
      }

      const value = this.emitRpn(this.toRpn(elements[index]), tokens[0].location)
      this.lines.push(`  store ${this.llvmType(elementType)} ${this.cast(value, elementType)}, ptr ${elementPointer}`)
    }
  }

  emitIncrement(token) {
    const symbol = this.resolve(token.lexeme)
    const current = this.nextTemp()
    const next = this.nextTemp()
    const instruction = symbol.type === LumenTypes.F32 ? 'fadd' : 'add'
    const one = symbol.type === LumenTypes.F32 ? '1.000000e+00' : '1'

    this.lines.push(`  ${current} = load ${this.llvmType(symbol.type)}, ptr ${symbol.pointer}`)
    this.lines.push(`  ${next} = ${instruction} ${this.llvmType(symbol.type)} ${current}, ${one}`)
    this.lines.push(`  store ${this.llvmType(symbol.type)} ${next}, ptr ${symbol.pointer}`)

    return {
      type: symbol.type,
      value: next
    }
  }

  emitPrintln(tokens) {
    this.usesPrintf = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('println expects one argument', tokens[0].location, 'backend')
    }

    const arg = args[0]

    if (arg.length === 1 && arg[0].type === TokenType.String) {
      if (arg[0].literal.includes('${')) return this.emitInterpolatedPrintln(arg[0])

      const format = this.globalCString('%s\n')
      const value = this.globalCString(arg[0].literal)
      this.lines.push(`  call i32 (ptr, ...) @printf(ptr ${format.pointer}, ptr ${value.pointer})`)
      return {
        type: LumenTypes.Void,
        value: ''
      }
    }

    const value = this.emitExpression({
      tokens: arg,
      location: tokens[0].location
    })
    const format = this.printlnFormat(value.type)
    const argumentType = this.printlnArgumentType(value.type)
    const argumentValue = this.printlnArgumentValue(value)

    this.lines.push(`  call i32 (ptr, ...) @printf(ptr ${format.pointer}, ${argumentType} ${argumentValue})`)

    return {
      type: LumenTypes.Void,
      value: ''
    }
  }

  emitInterpolatedPrintln(token) {
    const parts = []
    const values = []
    let cursor = 0
    const pattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g
    let match = pattern.exec(token.literal)

    while (match) {
      parts.push(token.literal.slice(cursor, match.index))
      const symbol = this.resolve(match[1])
      values.push(symbol)
      parts.push(this.printlnInterpolationFormat(symbol.type))
      cursor = match.index + match[0].length
      match = pattern.exec(token.literal)
    }

    parts.push(token.literal.slice(cursor))
    const format = this.globalCString(`${parts.join('')}\n`)
    const args = values.map(symbol => {
      const value = this.nextTemp()
      this.lines.push(`  ${value} = load ${this.llvmType(symbol.type)}, ptr ${symbol.pointer}`)
      return `${this.printlnArgumentType(symbol.type)} ${this.printlnArgumentValue({
        type: symbol.type,
        value
      })}`
    })

    this.lines.push(`  call i32 (ptr, ...) @printf(ptr ${format.pointer}${args.length ? `, ${args.join(', ')}` : ''})`)

    return {
      type: LumenTypes.Void,
      value: ''
    }
  }

  emitInterpolatedString(token) {
    const variables = [...token.literal.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)]
    if (variables.length === 0) {
      const value = this.globalCString(token.literal)
      return {
        type: LumenTypes.String,
        value: value.pointer
      }
    }

    let cursor = 0
    let current = null

    for (const match of variables) {
      const prefix = token.literal.slice(cursor, match.index)
      if (prefix) {
        const literal = this.globalCString(prefix)
        current = current
          ? this.emitStringConcat(current, { type: LumenTypes.String, value: literal.pointer })
          : { type: LumenTypes.String, value: literal.pointer }
      }

      const symbol = this.resolve(match[1])
      const value = this.nextTemp()
      this.lines.push(`  ${value} = load ${this.llvmType(symbol.type)}, ptr ${symbol.pointer}`)
      current = current
        ? this.emitStringConcat(current, { type: symbol.type, value })
        : { type: symbol.type, value }
      cursor = match.index + match[0].length
    }

    const suffix = token.literal.slice(cursor)
    if (suffix) {
      const literal = this.globalCString(suffix)
      current = this.emitStringConcat(current, { type: LumenTypes.String, value: literal.pointer })
    }

    return current
  }

  emitLen(tokens) {
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('len expects one argument', tokens[0].location, 'backend')
    }

    const iterable = this.resolve(this.singleIdentifierName({
      tokens: args[0],
      location: tokens[0].location
    }))

    if (!this.typeSystem.isArray(iterable.type) || iterable.length === null) {
      throw new Diagnostic('len needs fixed array', tokens[0].location, 'backend')
    }

    return {
      type: LumenTypes.I32,
      value: String(iterable.length)
    }
  }

  emitUuid(tokens) {
    const args = this.callArguments(tokens)

    if (args.length !== 0) {
      throw new Diagnostic('uuid expects no arguments', tokens[0].location, 'backend')
    }

    this.usesUuid = true
    const value = this.nextTemp()
    this.lines.push(`  ${value} = call ptr @lumen_uuid()`)

    return {
      type: LumenTypes.String,
      value
    }
  }

  emitEnv(tokens) {
    this.usesEnv = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('env expects one variable name', tokens[0].location, 'backend')
    }

    const name = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })

    if (name.type !== LumenTypes.String) {
      throw new Diagnostic('env expects a string variable name', tokens[0].location, 'backend')
    }

    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_env(ptr ${name.value})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitArg(tokens) {
    this.usesArgs = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('arg expects index', tokens[0].location, 'backend')
    }

    const index = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_arg(i32 ${this.cast(index, LumenTypes.I32)})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitArgCount(tokens) {
    this.usesArgs = true
    const args = this.callArguments(tokens)

    if (args.length !== 0) {
      throw new Diagnostic('argCount expects no arguments', tokens[0].location, 'backend')
    }

    const result = this.nextTemp()
    this.lines.push(`  ${result} = call i32 @lumen_arg_count()`)

    return {
      type: LumenTypes.I32,
      value: result
    }
  }

  emitAssert(tokens) {
    this.usesAssert = true
    const args = this.callArguments(tokens)

    if (args.length < 1 || args.length > 2) {
      throw new Diagnostic('assert expects condition and optional message', tokens[0].location, 'backend')
    }

    const condition = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const message = args[1]
      ? this.emitExpression({
          tokens: args[1],
          location: tokens[0].location
        })
      : {
          type: LumenTypes.String,
          value: this.globalCString('assert failed').pointer
        }

    this.lines.push(`  call void @lumen_assert(i1 ${this.cast(condition, LumenTypes.Bool)}, ptr ${message.value})`)

    return {
      type: LumenTypes.Void,
      value: ''
    }
  }

  emitChannel(tokens) {
    this.usesChannel = true
    const args = this.callArguments(tokens)
    if (args.length !== 0) throw new Diagnostic('channel expects no arguments', tokens[0].location, 'backend')
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_channel()`)
    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitSend(tokens) {
    this.usesChannel = true
    const args = this.callArguments(tokens)
    if (args.length !== 2) throw new Diagnostic('send expects channel and message', tokens[0].location, 'backend')
    const channel = this.emitExpression({ tokens: args[0], location: tokens[0].location })
    const message = this.emitExpression({ tokens: args[1], location: tokens[0].location })
    this.lines.push(`  call void @lumen_send(ptr ${channel.value}, ptr ${message.value})`)
    return {
      type: LumenTypes.Void,
      value: ''
    }
  }

  emitReceive(tokens) {
    this.usesChannel = true
    const args = this.callArguments(tokens)
    if (args.length !== 1) throw new Diagnostic('receive expects channel', tokens[0].location, 'backend')
    const channel = this.emitExpression({ tokens: args[0], location: tokens[0].location })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_receive(ptr ${channel.value})`)
    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitMap(tokens) {
    this.usesMaps = true
    const args = this.callArguments(tokens)

    if (args.length === 0 || args.length % 2 !== 0) {
      throw new Diagnostic('map expects key/value string pairs', tokens[0].location, 'backend')
    }

    const values = args.map(arg => this.emitExpression({
      tokens: arg,
      location: tokens[0].location
    }))

    if (values.some(value => value.type !== LumenTypes.String)) {
      throw new Diagnostic('map expects string keys and values', tokens[0].location, 'backend')
    }

    const result = this.nextTemp()
    const pairs = values.map(value => `ptr ${value.value}`).join(', ')
    this.lines.push(`  ${result} = call ptr (i32, ...) @lumen_map(i32 ${args.length / 2}, ${pairs})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitNone(tokens) {
    this.usesOptions = true
    const args = this.callArguments(tokens)

    if (args.length !== 0) {
      throw new Diagnostic('none expects no arguments', tokens[0].location, 'backend')
    }

    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_none()`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitRuntimeCall(tokens, runtimeName, returnType, expectedCount, displayName) {
    if (['lumen_map_get', 'lumen_map_has'].includes(runtimeName)) this.usesMaps = true
    if (['lumen_ok', 'lumen_err', 'lumen_is_ok', 'lumen_error_message'].includes(runtimeName)) this.usesResults = true
    if (['lumen_some', 'lumen_has_value', 'lumen_value_or'].includes(runtimeName)) this.usesOptions = true
    if (['lumen_json', 'lumen_json_get', 'lumen_json_set'].includes(runtimeName)) this.usesJsonRuntime = true
    if (['lumen_error_code', 'lumen_error_text'].includes(runtimeName)) this.usesErrorRuntime = true

    const args = this.callArguments(tokens)
    if (args.length !== expectedCount) {
      throw new Diagnostic(`${displayName} expects ${expectedCount} argument(s)`, tokens[0].location, 'backend')
    }

    const values = args.map(arg => this.emitExpression({
      tokens: arg,
      location: tokens[0].location
    }))
    const result = this.nextTemp()
    const signature = values.map(() => 'ptr').join(', ')
    const callArgs = values.map(value => `ptr ${value.value}`).join(', ')
    const llvmReturnType = this.llvmType(returnType)

    this.lines.push(`  ${result} = call ${llvmReturnType} @${runtimeName}(${signature ? `${callArgs}` : ''})`)

    return {
      type: returnType,
      value: result
    }
  }

  emitNewError(tokens) {
    this.usesErrorRuntime = true
    const args = this.callArguments(tokens)

    if (args.length !== 2) {
      throw new Diagnostic('newError expects code and message', tokens[0].location, 'backend')
    }

    const code = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const message = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const result = this.nextTemp()

    this.lines.push(`  ${result} = call ptr @lumen_error_new(i32 ${this.cast(code, LumenTypes.I32)}, ptr ${message.value})`)

    return {
      type: LumenTypes.Error,
      value: result
    }
  }

  emitArraySum(tokens) {
    const args = this.callArguments(tokens)
    if (args.length !== 1) throw new Diagnostic('arraySum expects one array', tokens[0].location, 'backend')

    const name = this.singleIdentifierName({
      tokens: args[0],
      location: tokens[0].location
    })
    const symbol = this.resolve(name)
    const elementType = this.typeSystem.elementType(symbol.type)

    if (!this.typeSystem.isArray(symbol.type) || symbol.length === null || !this.typeSystem.isNumeric(elementType)) {
      throw new Diagnostic('arraySum needs fixed numeric array', tokens[0].location, 'backend')
    }

    let total = {
      type: elementType,
      value: elementType === LumenTypes.F32 ? '0.000000e+00' : '0'
    }

    for (let index = 0; index < symbol.length; index += 1) {
      const pointer = this.nextTemp()
      const loaded = this.nextTemp()
      const next = this.nextTemp()
      const op = elementType === LumenTypes.F32 ? 'fadd' : 'add'
      this.lines.push(`  ${pointer} = getelementptr inbounds ${this.typeSystem.llvmArray(symbol.type, symbol.length)}, ptr ${symbol.pointer}, i32 0, i32 ${index}`)
      this.lines.push(`  ${loaded} = load ${this.llvmType(elementType)}, ptr ${pointer}`)
      this.lines.push(`  ${next} = ${op} ${this.llvmType(elementType)} ${total.value}, ${loaded}`)
      total = {
        type: elementType,
        value: next
      }
    }

    return total
  }

  emitArrayEdge(tokens, edge) {
    const args = this.callArguments(tokens)
    if (args.length !== 1) throw new Diagnostic(`array${edge === 'first' ? 'First' : 'Last'} expects one array`, tokens[0].location, 'backend')

    const name = this.singleIdentifierName({
      tokens: args[0],
      location: tokens[0].location
    })
    const symbol = this.resolve(name)

    if (!this.typeSystem.isArray(symbol.type) || symbol.length === null || symbol.length === 0) {
      throw new Diagnostic('array edge helper needs fixed non-empty array', tokens[0].location, 'backend')
    }

    const elementType = this.typeSystem.elementType(symbol.type)
    const index = edge === 'first' ? 0 : symbol.length - 1
    const pointer = this.nextTemp()
    const loaded = this.nextTemp()

    this.lines.push(`  ${pointer} = getelementptr inbounds ${this.typeSystem.llvmArray(symbol.type, symbol.length)}, ptr ${symbol.pointer}, i32 0, i32 ${index}`)
    this.lines.push(`  ${loaded} = load ${this.llvmType(elementType)}, ptr ${pointer}`)

    return {
      type: elementType,
      value: loaded
    }
  }

  emitArrayJoin(tokens) {
    this.usesArrayRuntime = true
    const args = this.callArguments(tokens)
    if (args.length !== 2) throw new Diagnostic('arrayJoin expects array and separator', tokens[0].location, 'backend')

    const name = this.singleIdentifierName({
      tokens: args[0],
      location: tokens[0].location
    })
    const symbol = this.resolve(name)
    const separator = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })

    if (symbol.type !== 'string[]' || symbol.length === null) {
      throw new Diagnostic('arrayJoin needs fixed string array', tokens[0].location, 'backend')
    }

    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_array_join(i32 ${symbol.length}, ptr ${symbol.pointer}, ptr ${separator.value})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitUserCall(tokens) {
    const signature = this.functionSignatures.get(tokens[0].lexeme)
    const args = this.callArguments(tokens)

    if (!signature || args.length !== signature.params.length) {
      throw new Diagnostic(`Invalid call to ${tokens[0].lexeme}`, tokens[0].location, 'backend')
    }

    const values = args.map(arg => this.emitExpression({
      tokens: arg,
      location: tokens[0].location
    }))
    const result = signature.returnType === LumenTypes.Void ? null : this.nextTemp()
    const callArgs = values.map((value, index) => {
      const paramType = signature.params[index].type
      return `${this.llvmType(paramType)} ${this.cast(value, paramType)}`
    }).join(', ')
    const prefix = result ? `${result} = ` : ''

    this.lines.push(`  ${prefix}call ${this.llvmType(signature.returnType)} @${tokens[0].lexeme}(${callArgs})`)

    return {
      type: signature.returnType,
      value: result ?? ''
    }
  }

  emitEncrypt(tokens) {
    this.usesCrypto = true
    const args = this.callArguments(tokens)

    if (args.length !== 2 && args.length !== 3) {
      throw new Diagnostic('encrypt expects value, key, and optional protocol', tokens[0].location, 'backend')
    }

    const value = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const key = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const protocol = args[2]
      ? this.emitExpression({
          tokens: args[2],
          location: tokens[0].location
        })
      : {
          type: LumenTypes.String,
          value: this.globalCString('AES-256').pointer
        }

    if (value.type !== LumenTypes.String || key.type !== LumenTypes.String || protocol.type !== LumenTypes.String) {
      throw new Diagnostic('encrypt expects string arguments', tokens[0].location, 'backend')
    }

    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_encrypt(ptr ${value.value}, ptr ${key.value}, ptr ${protocol.value})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitDecrypt(tokens) {
    this.usesCrypto = true
    const args = this.callArguments(tokens)

    if (args.length !== 2 && args.length !== 3) {
      throw new Diagnostic('decrypt expects value, key, and optional protocol', tokens[0].location, 'backend')
    }

    const value = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const key = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const protocol = args[2]
      ? this.emitExpression({
          tokens: args[2],
          location: tokens[0].location
        })
      : {
          type: LumenTypes.String,
          value: this.globalCString('AES-256').pointer
        }

    if (value.type !== LumenTypes.String || key.type !== LumenTypes.String || protocol.type !== LumenTypes.String) {
      throw new Diagnostic('decrypt expects string arguments', tokens[0].location, 'backend')
    }

    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_decrypt(ptr ${value.value}, ptr ${key.value}, ptr ${protocol.value})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitIncludes(tokens) {
    const args = this.callArguments(tokens)

    if (args.length !== 2) {
      throw new Diagnostic('includes expects two arguments', tokens[0].location, 'backend')
    }

    const haystack = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })

    if (haystack.type === LumenTypes.String) {
      return this.emitStringIncludes(haystack, args[1], tokens[0].location)
    }

    const name = this.singleIdentifierName({
      tokens: args[0],
      location: tokens[0].location
    })

    return this.emitArrayIncludes(name, args[1], tokens[0].location)
  }

  emitReadFile(tokens) {
    this.usesFileIO = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('readFile expects one path', tokens[0].location, 'backend')
    }

    const path = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })

    if (path.type !== LumenTypes.String) {
      throw new Diagnostic('readFile path must be string', tokens[0].location, 'backend')
    }

    const resultPointer = this.alloca('.readFile.result', LumenTypes.String)
    const mode = this.globalCString('rb')
    const empty = this.globalCString('')
    const file = this.nextTemp()
    const isMissing = this.nextTemp()
    const missingLabel = this.nextLabel('read.missing')
    const openLabel = this.nextLabel('read.open')
    const endLabel = this.nextLabel('read.end')

    this.lines.push(`  ${file} = call ptr @fopen(ptr ${path.value}, ptr ${mode.pointer})`)
    this.lines.push(`  ${isMissing} = icmp eq ptr ${file}, null`)
    this.lines.push(`  br i1 ${isMissing}, label %${missingLabel}, label %${openLabel}`)

    this.lines.push(`${missingLabel}:`)
    this.lines.push(`  store ptr ${empty.pointer}, ptr ${resultPointer}`)
    this.lines.push(`  br label %${endLabel}`)

    this.lines.push(`${openLabel}:`)
    this.lines.push(`  call i32 @fseek(ptr ${file}, i64 0, i32 2)`)
    const size = this.nextTemp()
    this.lines.push(`  ${size} = call i64 @ftell(ptr ${file})`)
    this.lines.push(`  call i32 @fseek(ptr ${file}, i64 0, i32 0)`)
    const bufferSize = this.nextTemp()
    const buffer = this.nextTemp()
    const bytesRead = this.nextTemp()
    const terminator = this.nextTemp()
    this.lines.push(`  ${bufferSize} = add i64 ${size}, 1`)
    this.lines.push(`  ${buffer} = call ptr @malloc(i64 ${bufferSize})`)
    this.lines.push(`  ${bytesRead} = call i64 @fread(ptr ${buffer}, i64 1, i64 ${size}, ptr ${file})`)
    this.lines.push(`  ${terminator} = getelementptr inbounds i8, ptr ${buffer}, i64 ${bytesRead}`)
    this.lines.push(`  store i8 0, ptr ${terminator}`)
    this.lines.push(`  call i32 @fclose(ptr ${file})`)
    this.lines.push(`  store ptr ${buffer}, ptr ${resultPointer}`)
    this.lines.push(`  br label %${endLabel}`)

    this.lines.push(`${endLabel}:`)
    const result = this.nextTemp()
    this.lines.push(`  ${result} = load ptr, ptr ${resultPointer}`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitServeFiles(tokens) {
    this.usesHttp = true
    const args = this.callArguments(tokens)

    if (args.length !== 2) {
      throw new Diagnostic('serveFiles expects port and root', tokens[0].location, 'backend')
    }

    const port = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const root = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const result = this.nextTemp()

    this.lines.push(`  ${result} = call i32 @lumen_http_serve_files(i32 ${this.cast(port, LumenTypes.I32)}, ptr ${root.value})`)

    return {
      type: LumenTypes.I32,
      value: result
    }
  }

  emitServeApi(tokens) {
    this.usesHttp = true
    const args = this.callArguments(tokens)

    if (args.length !== 5) {
      throw new Diagnostic('serveApi expects port, method, route, headers, and body', tokens[0].location, 'backend')
    }

    const port = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const method = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const route = this.emitExpression({
      tokens: args[2],
      location: tokens[0].location
    })
    const headers = this.emitExpression({
      tokens: args[3],
      location: tokens[0].location
    })
    const body = this.emitExpression({
      tokens: args[4],
      location: tokens[0].location
    })
    const result = this.nextTemp()

    this.lines.push(`  ${result} = call i32 @lumen_http_serve_api(i32 ${this.cast(port, LumenTypes.I32)}, ptr ${method.value}, ptr ${route.value}, ptr ${headers.value}, ptr ${body.value})`)

    return {
      type: LumenTypes.I32,
      value: result
    }
  }

  emitServeHttp(tokens) {
    this.usesHttp = true
    const args = this.callArguments(tokens)

    if (args.length !== 6) {
      throw new Diagnostic('serveHttp expects port, root, methods, routes, headers, and bodies', tokens[0].location, 'backend')
    }

    const port = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const root = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const methods = this.arrayPointerArgument(args[2], tokens[0].location)
    const routes = this.arrayPointerArgument(args[3], tokens[0].location)
    const headers = this.arrayPointerArgument(args[4], tokens[0].location)
    const bodies = this.arrayPointerArgument(args[5], tokens[0].location)

    if (methods.length !== routes.length || methods.length !== headers.length || methods.length !== bodies.length) {
      throw new Diagnostic('serveHttp arrays must have same length', tokens[0].location, 'backend')
    }

    const result = this.nextTemp()
    this.lines.push(`  ${result} = call i32 @lumen_http_serve_http(i32 ${this.cast(port, LumenTypes.I32)}, ptr ${root.value}, ptr ${methods.pointer}, ptr ${routes.pointer}, ptr ${headers.pointer}, ptr ${bodies.pointer}, i32 ${methods.length})`)

    return {
      type: LumenTypes.I32,
      value: result
    }
  }

  emitServeSocketIoChat(tokens) {
    this.usesHttp = true
    const args = this.callArguments(tokens)

    if (args.length !== 2) {
      throw new Diagnostic('serveSocketIoChat expects port and root', tokens[0].location, 'backend')
    }

    const port = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const root = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const result = this.nextTemp()

    this.lines.push(`  ${result} = call i32 @lumen_socketio_serve_chat(i32 ${this.cast(port, LumenTypes.I32)}, ptr ${root.value})`)

    return {
      type: LumenTypes.I32,
      value: result
    }
  }

  emitSocketIoEvent(tokens) {
    this.usesHttp = true
    const args = this.callArguments(tokens)

    if (args.length !== 2) {
      throw new Diagnostic('socketIoEvent expects event and payload', tokens[0].location, 'backend')
    }

    const event = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const payload = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const result = this.nextTemp()

    this.lines.push(`  ${result} = call ptr @lumen_socketio_event(ptr ${event.value}, ptr ${payload.value})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitSocketIoEmit(tokens) {
    this.usesHttp = true
    const args = this.callArguments(tokens)

    if (args.length !== 3) {
      throw new Diagnostic('socketIoEmit expects room, event, and payload', tokens[0].location, 'backend')
    }

    const room = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const event = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const payload = this.emitExpression({
      tokens: args[2],
      location: tokens[0].location
    })
    const result = this.nextTemp()

    this.lines.push(`  ${result} = call ptr @lumen_socketio_emit(ptr ${room.value}, ptr ${event.value}, ptr ${payload.value})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitHttpRequest(tokens) {
    this.usesHttp = true
    const args = this.callArguments(tokens)

    if (args.length !== 3) {
      throw new Diagnostic('httpRequest expects method, path, and body', tokens[0].location, 'backend')
    }

    const values = args.map(arg => this.emitExpression({
      tokens: arg,
      location: tokens[0].location
    }))
    const result = this.nextTemp()

    this.lines.push(`  ${result} = call ptr @lumen_http_request(ptr ${values[0].value}, ptr ${values[1].value}, ptr ${values[2].value})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitHttpResponse(tokens) {
    this.usesHttp = true
    const args = this.callArguments(tokens)

    if (args.length !== 3) {
      throw new Diagnostic('httpResponse expects status, headers, and body', tokens[0].location, 'backend')
    }

    const status = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const headers = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const body = this.emitExpression({
      tokens: args[2],
      location: tokens[0].location
    })
    const result = this.nextTemp()

    this.lines.push(`  ${result} = call ptr @lumen_http_response(i32 ${this.cast(status, LumenTypes.I32)}, ptr ${headers.value}, ptr ${body.value})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitCreateSemaphore(tokens) {
    this.usesThread = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('createSemaphore expects one count', tokens[0].location, 'backend')
    }

    const count = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_semaphore_create(i32 ${this.cast(count, LumenTypes.I32)})`)

    return {
      type: LumenTypes.Semaphore,
      value: result
    }
  }

  emitSemaphoreWait(tokens) {
    this.usesThread = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('semaphoreWait expects semaphore', tokens[0].location, 'backend')
    }

    const semaphore = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    this.lines.push(`  call void @lumen_semaphore_wait(ptr ${semaphore.value})`)

    return {
      type: LumenTypes.I32,
      value: '0'
    }
  }

  emitSemaphoreSignal(tokens) {
    this.usesThread = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('semaphoreSignal expects semaphore', tokens[0].location, 'backend')
    }

    const semaphore = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    this.lines.push(`  call void @lumen_semaphore_signal(ptr ${semaphore.value})`)

    return {
      type: LumenTypes.I32,
      value: '0'
    }
  }

  emitStartThread(tokens) {
    this.usesThread = true
    const args = this.callArguments(tokens)

    if (args.length !== 4) {
      throw new Diagnostic('startThread expects function, path, message, semaphore', tokens[0].location, 'backend')
    }

    const functionName = this.singleIdentifierName({
      tokens: args[0],
      location: tokens[0].location
    })
    const path = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const message = this.emitExpression({
      tokens: args[2],
      location: tokens[0].location
    })
    const semaphore = this.emitExpression({
      tokens: args[3],
      location: tokens[0].location
    })
    const result = this.nextTemp()

    this.lines.push(`  ${result} = call ptr @lumen_thread_start(ptr @${functionName}, ptr ${path.value}, ptr ${message.value}, ptr ${semaphore.value})`)

    return {
      type: LumenTypes.Thread,
      value: result
    }
  }

  emitJoinThread(tokens) {
    this.usesThread = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('joinThread expects thread', tokens[0].location, 'backend')
    }

    const thread = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call i32 @lumen_thread_join(ptr ${thread.value})`)

    return {
      type: LumenTypes.I32,
      value: result
    }
  }

  emitAppendFile(tokens) {
    this.usesThread = true
    const args = this.callArguments(tokens)

    if (args.length !== 2) {
      throw new Diagnostic('appendFile expects path and message', tokens[0].location, 'backend')
    }

    const path = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const message = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call i32 @lumen_append_file(ptr ${path.value}, ptr ${message.value})`)

    return {
      type: LumenTypes.I32,
      value: result
    }
  }

  arrayPointerArgument(tokens, location) {
    const name = this.singleIdentifierName({
      tokens,
      location
    })
    const symbol = this.resolve(name)

    if (!this.typeSystem.isArray(symbol.type) || symbol.length === null) {
      throw new Diagnostic('serveHttp expects array variables', location, 'backend')
    }

    const pointer = this.nextTemp()
    this.lines.push(`  ${pointer} = getelementptr inbounds ${this.typeSystem.llvmArray(symbol.type, symbol.length)}, ptr ${symbol.pointer}, i32 0, i32 0`)

    return {
      pointer,
      length: symbol.length
    }
  }

  emitStringIncludes(haystack, needleTokens, location) {
    this.usesStrstr = true
    const needle = this.emitExpression({
      tokens: needleTokens,
      location
    })

    if (needle.type !== LumenTypes.String) {
      throw new Diagnostic('string includes needs string needle', location, 'backend')
    }

    const found = this.nextTemp()
    const result = this.nextTemp()
    this.lines.push(`  ${found} = call ptr @strstr(ptr ${haystack.value}, ptr ${needle.value})`)
    this.lines.push(`  ${result} = icmp ne ptr ${found}, null`)

    return {
      type: LumenTypes.Bool,
      value: result
    }
  }

  emitArrayIncludes(name, needleTokens, location) {
    const array = this.resolve(name)

    if (!this.typeSystem.isArray(array.type) || array.length === null) {
      throw new Diagnostic('array includes needs fixed array', location, 'backend')
    }

    const elementType = this.typeSystem.elementType(array.type)
    if (!this.typeSystem.isNumeric(elementType) && elementType !== LumenTypes.Bool) {
      throw new Diagnostic('array includes supports numeric and bool elements', location, 'backend')
    }

    const needle = this.emitExpression({
      tokens: needleTokens,
      location
    })
    const resultPointer = this.alloca('.includes.result', LumenTypes.Bool)
    const indexPointer = this.alloca('.includes.index', LumenTypes.I32)
    const conditionLabel = this.nextLabel('includes.cond')
    const bodyLabel = this.nextLabel('includes.body')
    const foundLabel = this.nextLabel('includes.found')
    const updateLabel = this.nextLabel('includes.update')
    const endLabel = this.nextLabel('includes.end')

    this.lines.push(`  store i1 0, ptr ${resultPointer}`)
    this.lines.push(`  store i32 0, ptr ${indexPointer}`)
    this.lines.push(`  br label %${conditionLabel}`)
    this.lines.push(`${conditionLabel}:`)

    const currentIndex = this.nextTemp()
    const inBounds = this.nextTemp()
    this.lines.push(`  ${currentIndex} = load i32, ptr ${indexPointer}`)
    this.lines.push(`  ${inBounds} = icmp slt i32 ${currentIndex}, ${array.length}`)
    this.lines.push(`  br i1 ${inBounds}, label %${bodyLabel}, label %${endLabel}`)
    this.lines.push(`${bodyLabel}:`)

    const elementPointer = this.nextTemp()
    const elementValue = this.nextTemp()
    this.lines.push(`  ${elementPointer} = getelementptr inbounds ${this.typeSystem.llvmArray(array.type, array.length)}, ptr ${array.pointer}, i32 0, i32 ${currentIndex}`)
    this.lines.push(`  ${elementValue} = load ${this.llvmType(elementType)}, ptr ${elementPointer}`)

    const comparison = this.emitEqualityComparison({
      type: elementType,
      value: elementValue
    }, needle)
    this.lines.push(`  br i1 ${comparison.value}, label %${foundLabel}, label %${updateLabel}`)
    this.lines.push(`${foundLabel}:`)
    this.lines.push(`  store i1 1, ptr ${resultPointer}`)
    this.lines.push(`  br label %${endLabel}`)
    this.lines.push(`${updateLabel}:`)

    const updateIndex = this.nextTemp()
    const nextIndex = this.nextTemp()
    this.lines.push(`  ${updateIndex} = load i32, ptr ${indexPointer}`)
    this.lines.push(`  ${nextIndex} = add i32 ${updateIndex}, 1`)
    this.lines.push(`  store i32 ${nextIndex}, ptr ${indexPointer}`)
    this.lines.push(`  br label %${conditionLabel}`)
    this.lines.push(`${endLabel}:`)

    const result = this.nextTemp()
    this.lines.push(`  ${result} = load i1, ptr ${resultPointer}`)

    return {
      type: LumenTypes.Bool,
      value: result
    }
  }

  emitRpn(rpn, location) {
    const stack = []

    for (const token of rpn) {
      if (token.type === TokenType.Number) {
        const type = this.numberLiteralType(token)
        stack.push({
          type,
          value: type === LumenTypes.F32 ? this.floatConstant(token.literal) : String(token.literal)
        })
        continue
      }

      if (token.type === TokenType.String) {
        const value = this.globalCString(token.literal)
        stack.push({
          type: LumenTypes.String,
          value: value.pointer
        })
        continue
      }

      if (token.type === TokenType.Keyword && token.lexeme === 'true') {
        stack.push({
          type: LumenTypes.Bool,
          value: '1'
        })
        continue
      }

      if (token.type === TokenType.Keyword && token.lexeme === 'false') {
        stack.push({
          type: LumenTypes.Bool,
          value: '0'
        })
        continue
      }

      if (token.type === TokenType.Identifier) {
        if (this.enumConstants.has(token.lexeme)) {
          const enumValue = this.enumConstants.get(token.lexeme)
          stack.push(enumValue)
          continue
        }

        if (token.fieldAccess) {
          stack.push(this.emitFieldLoad(token.fieldAccess))
          continue
        }

        if (token.arrayAccess) {
          stack.push(this.emitArrayLoad(token.arrayAccess))
          continue
        }

        const symbol = this.resolve(token.lexeme)
        const temp = this.nextTemp()
        this.lines.push(`  ${temp} = load ${this.llvmType(symbol.type)}, ptr ${symbol.pointer}`)
        stack.push({
          type: symbol.type,
          value: temp
        })
        continue
      }

      if (token.type === TokenType.Operator) {
        const right = stack.pop()
        const left = stack.pop()

        if (!left || !right) {
          throw new Diagnostic('Invalid expression', token.location, 'backend')
        }

        stack.push(this.emitBinary(token, left, right))
      }
    }

    if (stack.length !== 1) {
      throw new Diagnostic('Invalid expression', location, 'backend')
    }

    return stack[0]
  }

  emitBinary(token, left, right) {
    const op = token.lexeme
    const temp = this.nextTemp()

    if (op === '+' && left.type === LumenTypes.String && right.type === LumenTypes.String) {
      return this.emitStringConcat(left, right)
    }

    if (['+', '-', '*', '/', '%'].includes(op)) {
      const type = this.typeSystem.widest(left.type, right.type)
      const instruction = this.arithmeticInstruction(op, type)

      this.lines.push(`  ${temp} = ${instruction} ${this.llvmType(type)} ${this.cast(left, type)}, ${this.cast(right, type)}`)
      return {
        type,
        value: temp
      }
    }

    const type = this.typeSystem.widest(left.type, right.type)
    const predicate = this.comparePredicate(op, type)

    if (!predicate) {
      throw new Diagnostic(`Unsupported operator "${op}"`, token.location, 'backend')
    }

    const instruction = type === LumenTypes.F32 ? 'fcmp' : 'icmp'
    this.lines.push(`  ${temp} = ${instruction} ${predicate} ${this.llvmType(type)} ${this.cast(left, type)}, ${this.cast(right, type)}`)
    return {
      type: LumenTypes.Bool,
      value: temp
    }
  }

  emitStringConcat(left, right) {
    this.usesStringRuntime = true
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_string_concat(ptr ${left.value}, ptr ${right.value})`)
    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitMatch(tokens, location) {
    const open = tokens.findIndex(token => token.lexeme === '{')
    const close = tokens.length - 1
    const discriminant = this.emitExpression({
      tokens: tokens.slice(1, open),
      location
    })
    const arms = this.matchArms(tokens.slice(open + 1, close), location)
    const resultType = this.emitExpression({ tokens: arms[0].value, location }).type
    const resultPointer = this.alloca('.match.result', resultType)
    const endLabel = this.nextLabel('match.end')
    const defaultArm = arms.find(arm => arm.isDefault)
    const testArms = arms.filter(arm => !arm.isDefault)
    const testLabels = testArms.map(() => this.nextLabel('match.test'))
    const bodyLabels = testArms.map(() => this.nextLabel('match.body'))
    const defaultLabel = defaultArm ? this.nextLabel('match.default') : endLabel

    this.lines.push(`  br label %${testLabels[0] ?? defaultLabel}`)
    for (let index = 0; index < testArms.length; index += 1) {
      this.lines.push(`${testLabels[index]}:`)
      const arm = testArms[index]
      const test = this.emitExpression({ tokens: arm.test, location })
      const matches = this.emitEqualityComparison(discriminant, test)
      this.lines.push(`  br i1 ${matches.value}, label %${bodyLabels[index]}, label %${testLabels[index + 1] ?? defaultLabel}`)
      this.lines.push(`${bodyLabels[index]}:`)
      const value = this.emitExpression({ tokens: arm.value, location })
      this.lines.push(`  store ${this.llvmType(resultType)} ${this.cast(value, resultType)}, ptr ${resultPointer}`)
      this.lines.push(`  br label %${endLabel}`)
    }

    if (defaultArm) {
      this.lines.push(`${defaultLabel}:`)
      const value = this.emitExpression({ tokens: defaultArm.value, location })
      this.lines.push(`  store ${this.llvmType(resultType)} ${this.cast(value, resultType)}, ptr ${resultPointer}`)
      this.lines.push(`  br label %${endLabel}`)
    }

    this.lines.push(`${endLabel}:`)
    const result = this.nextTemp()
    this.lines.push(`  ${result} = load ${this.llvmType(resultType)}, ptr ${resultPointer}`)
    return {
      type: resultType,
      value: result
    }
  }

  matchArms(tokens, location) {
    const arms = []
    let index = 0

    while (index < tokens.length) {
      while (tokens[index]?.lexeme === ';') index += 1
      const isDefault = tokens[index]?.lexeme === '_'
      const test = []

      if (isDefault) {
        index += 1
      } else {
        while (index < tokens.length && tokens[index].lexeme !== '=>') {
          test.push(tokens[index])
          index += 1
        }
      }

      if (tokens[index]?.lexeme !== '=>') throw new Diagnostic('match arm needs =>', location, 'backend')
      index += 1
      const value = []
      let depth = 0
      while (index < tokens.length) {
        if (depth === 0 && tokens[index].type === TokenType.Semicolon) break
        if (depth === 0 && (tokens[index].lexeme === '_' || this.looksLikeMatchArm(tokens, index))) break
        if (['(', '[', '{'].includes(tokens[index].lexeme)) depth += 1
        if ([')', ']', '}'].includes(tokens[index].lexeme)) depth -= 1
        value.push(tokens[index])
        index += 1
      }

      arms.push({
        isDefault,
        test,
        value
      })
      while (tokens[index]?.type === TokenType.Semicolon) index += 1
    }

    return arms
  }

  looksLikeMatchArm(tokens, index) {
    return tokens[index + 1]?.lexeme === '=>'
  }

  emitEqualityComparison(left, right) {
    const type = this.typeSystem.widest(left.type, right.type)
    const temp = this.nextTemp()

    if (left.type === LumenTypes.String && right.type === LumenTypes.String) {
      this.usesStrcmp = true
      const comparison = this.nextTemp()
      this.lines.push(`  ${comparison} = call i32 @strcmp(ptr ${left.value}, ptr ${right.value})`)
      this.lines.push(`  ${temp} = icmp eq i32 ${comparison}, 0`)
    } else if (type === LumenTypes.F32) {
      this.lines.push(`  ${temp} = fcmp oeq float ${this.cast(left, type)}, ${this.cast(right, type)}`)
    } else {
      this.lines.push(`  ${temp} = icmp eq ${this.llvmType(type)} ${this.cast(left, type)}, ${this.cast(right, type)}`)
    }

    return {
      type: LumenTypes.Bool,
      value: temp
    }
  }

  toRpn(tokens) {
    const output = []
    const operators = []
    const normalized = this.normalizeAccessTokens(tokens)

    for (const token of normalized) {
      if ([TokenType.Number, TokenType.String, TokenType.Identifier, TokenType.Keyword].includes(token.type)) {
        output.push(token)
        continue
      }

      if (token.is(TokenType.Punctuation, '(')) {
        operators.push(token)
        continue
      }

      if (token.is(TokenType.Punctuation, ')')) {
        while (operators.length && !operators.at(-1).is(TokenType.Punctuation, '(')) {
          output.push(operators.pop())
        }
        operators.pop()
        continue
      }

      if (token.type === TokenType.Operator) {
        while (operators.length &&
          BINARY_PRECEDENCE.has(operators.at(-1).lexeme) &&
          BINARY_PRECEDENCE.get(operators.at(-1).lexeme) >= BINARY_PRECEDENCE.get(token.lexeme)) {
          output.push(operators.pop())
        }
        operators.push(token)
      }
    }

    while (operators.length) output.push(operators.pop())
    return output
  }

  findTopLevelOperator(tokens, operator) {
    let depth = 0

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]
      if (token.lexeme === '(') depth += 1
      if (token.lexeme === ')') depth -= 1
      if (depth === 0 && token.lexeme === operator) return index
    }

    return -1
  }

  isCall(tokens, name) {
    return tokens[0]?.lexeme === name &&
      tokens[1]?.lexeme === '(' &&
      tokens.at(-1)?.lexeme === ')'
  }

  isUserCall(tokens) {
    return tokens[0]?.type === TokenType.Identifier &&
      tokens[1]?.lexeme === '(' &&
      tokens.at(-1)?.lexeme === ')' &&
      this.functionSignatures.has(tokens[0].lexeme)
  }

  isMatch(tokens) {
    return tokens[0]?.lexeme === 'match'
  }

  isStructLiteral(tokens) {
    return tokens[0]?.type === TokenType.Identifier &&
      tokens[1]?.lexeme === '{' &&
      tokens.at(-1)?.lexeme === '}' &&
      this.typeSystem.getStruct(tokens[0].lexeme)
  }

  isArrayLiteral(tokens) {
    return tokens[0]?.lexeme === '[' && tokens.at(-1)?.lexeme === ']'
  }

  isArrayAccess(tokens) {
    if (tokens[0]?.type !== TokenType.Identifier || tokens[1]?.lexeme !== '[') return false

    const closeIndex = this.findMatching(tokens, 1, '[', ']')
    return closeIndex === tokens.length - 1 ||
      (tokens[closeIndex + 1]?.lexeme === '.' && closeIndex + 2 === tokens.length - 1)
  }

  isFieldAccess(tokens) {
    return tokens.length === 3 &&
      tokens[0]?.type === TokenType.Identifier &&
      tokens[1]?.lexeme === '.' &&
      tokens[2]?.type === TokenType.Identifier
  }

  emitFieldLoad(tokens) {
    const base = this.resolve(tokens[0].lexeme)
    const fieldName = tokens.length === 2 ? tokens[1].lexeme : tokens[2].lexeme
    const field = this.typeSystem.getField(base.type, fieldName)
    const index = this.typeSystem.getStruct(base.type).fields.indexOf(field)
    const fieldPointer = this.nextTemp()
    const value = this.nextTemp()

    this.lines.push(`  ${fieldPointer} = getelementptr inbounds ${this.llvmType(base.type)}, ptr ${base.pointer}, i32 0, i32 ${index}`)
    this.lines.push(`  ${value} = load ${this.llvmType(field.type)}, ptr ${fieldPointer}`)

    return {
      type: field.type,
      value
    }
  }

  emitArrayLoad(tokens) {
    const base = this.resolve(tokens[0].lexeme)
    const closeIndex = this.findMatching(tokens, 1, '[', ']')
    const indexTokens = tokens.slice(2, closeIndex)

    if (base.type === LumenTypes.String && indexTokens.some((token, index) => token.lexeme === '.' && indexTokens[index + 1]?.lexeme === '.')) {
      this.usesSlice = true
      const dots = indexTokens.findIndex((token, index) => token.lexeme === '.' && indexTokens[index + 1]?.lexeme === '.')
      const start = this.emitExpression({
        tokens: indexTokens.slice(0, dots),
        location: tokens[0].location
      })
      const end = this.emitExpression({
        tokens: indexTokens.slice(dots + 2),
        location: tokens[0].location
      })
      const result = this.nextTemp()
      const source = this.nextTemp()
      this.lines.push(`  ${source} = load ptr, ptr ${base.pointer}`)
      this.lines.push(`  ${result} = call ptr @lumen_string_slice(ptr ${source}, i32 ${this.cast(start, LumenTypes.I32)}, i32 ${this.cast(end, LumenTypes.I32)})`)
      return {
        type: LumenTypes.String,
        value: result
      }
    }

    const index = this.emitRpn(this.toRpn(indexTokens), tokens[0].location)
    const elementType = this.typeSystem.elementType(base.type)
    const elementPointer = this.nextTemp()

    this.lines.push(`  ${elementPointer} = getelementptr inbounds ${this.typeSystem.llvmArray(base.type, base.length)}, ptr ${base.pointer}, i32 0, i32 ${this.cast(index, LumenTypes.I32)}`)

    if (tokens[closeIndex + 1]?.lexeme === '.') {
      const fieldName = tokens[closeIndex + 2].lexeme
      const field = this.typeSystem.getField(elementType, fieldName)
      const fieldIndex = this.typeSystem.getStruct(elementType).fields.indexOf(field)
      const fieldPointer = this.nextTemp()
      const value = this.nextTemp()

      this.lines.push(`  ${fieldPointer} = getelementptr inbounds ${this.llvmType(elementType)}, ptr ${elementPointer}, i32 0, i32 ${fieldIndex}`)
      this.lines.push(`  ${value} = load ${this.llvmType(field.type)}, ptr ${fieldPointer}`)

      return {
        type: field.type,
        value
      }
    }

    const value = this.nextTemp()
    this.lines.push(`  ${value} = load ${this.llvmType(elementType)}, ptr ${elementPointer}`)

    return {
      type: elementType,
      value
    }
  }

  normalizeFieldAccessTokens(tokens) {
    const normalized = []

    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index]?.type === TokenType.Identifier &&
        tokens[index + 1]?.lexeme === '.' &&
        tokens[index + 2]?.type === TokenType.Identifier) {
        normalized.push({
          type: TokenType.Identifier,
          lexeme: `${tokens[index].lexeme}.${tokens[index + 2].lexeme}`,
          literal: null,
          location: tokens[index].location,
          fieldAccess: [tokens[index], tokens[index + 2]]
        })
        index += 2
        continue
      }

      normalized.push(tokens[index])
    }

    return normalized
  }

  normalizeAccessTokens(tokens) {
    const normalized = []

    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index]?.type === TokenType.Identifier && tokens[index + 1]?.lexeme === '[') {
        const closeIndex = this.findMatching(tokens, index + 1, '[', ']')
        let endIndex = closeIndex

        if (tokens[closeIndex + 1]?.lexeme === '.' && tokens[closeIndex + 2]?.type === TokenType.Identifier) {
          endIndex = closeIndex + 2
        }

        const accessTokens = tokens.slice(index, endIndex + 1)
        normalized.push({
          type: TokenType.Identifier,
          lexeme: accessTokens.map(token => token.lexeme).join(''),
          literal: null,
          location: tokens[index].location,
          arrayAccess: accessTokens
        })
        index = endIndex
        continue
      }

      if (tokens[index]?.type === TokenType.Identifier &&
        tokens[index + 1]?.lexeme === '.' &&
        tokens[index + 2]?.type === TokenType.Identifier) {
        normalized.push({
          type: TokenType.Identifier,
          lexeme: `${tokens[index].lexeme}.${tokens[index + 2].lexeme}`,
          literal: null,
          location: tokens[index].location,
          fieldAccess: [tokens[index], tokens[index + 2]]
        })
        index += 2
        continue
      }

      normalized.push(tokens[index])
    }

    return normalized
  }

  structLiteralFields(tokens) {
    const fields = new Map()
    let index = 2

    while (index < tokens.length - 1) {
      const name = tokens[index]?.lexeme
      index += 2
      const value = []
      let depth = 0

      while (index < tokens.length - 1) {
        const token = tokens[index]
        if (depth === 0 && token.lexeme === ',') break
        if (token.lexeme === '(' || token.lexeme === '{') depth += 1
        if (token.lexeme === ')' || token.lexeme === '}') depth -= 1
        value.push(token)
        index += 1
      }

      fields.set(name, value)
      if (tokens[index]?.lexeme === ',') index += 1
    }

    return fields
  }

  splitDelimited(tokens) {
    const parts = []
    let current = []
    let depth = 0

    for (const token of tokens) {
      if (depth === 0 && token.lexeme === ',') {
        parts.push(current)
        current = []
        continue
      }

      if (['(', '[', '{'].includes(token.lexeme)) depth += 1
      if ([')', ']', '}'].includes(token.lexeme)) depth -= 1
      current.push(token)
    }

    if (current.length > 0) parts.push(current)
    return parts
  }

  findMatching(tokens, start, open, close) {
    let depth = 0

    for (let index = start; index < tokens.length; index += 1) {
      if (tokens[index].lexeme === open) depth += 1
      if (tokens[index].lexeme === close) {
        depth -= 1
        if (depth === 0) return index
      }
    }

    return -1
  }

  singleIdentifierName(expression) {
    if (expression.tokens.length === 1 && expression.tokens[0].type === TokenType.Identifier) {
      return expression.tokens[0].lexeme
    }

    throw new Diagnostic('for-of iterable must be an array variable', expression.location, 'backend')
  }

  filterPredicate(tokens, location) {
    const arrow = tokens.findIndex(token => token.lexeme === '=>')

    if (arrow < 1) {
      throw new Diagnostic('filter expects arrow predicate', location, 'backend')
    }

    return {
      parameter: tokens[arrow - 1].lexeme,
      tokens: tokens.slice(arrow + 1)
    }
  }

  callArguments(tokens) {
    const args = []
    let current = []
    let depth = 0

    for (const token of tokens.slice(2, -1)) {
      if (token.lexeme === '(') depth += 1
      if (token.lexeme === ')') depth -= 1

      if (depth === 0 && token.lexeme === ',') {
        args.push(current)
        current = []
      } else {
        current.push(token)
      }
    }

    if (current.length > 0) args.push(current)
    return args
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

  printlnFormat(type) {
    if ([LumenTypes.String, LumenTypes.Json, LumenTypes.Error].includes(type)) return this.globalCString('%s\n')
    if (type === LumenTypes.I64) return this.globalCString('%lld\n')
    if (type === LumenTypes.F32) return this.globalCString('%f\n')
    return this.globalCString('%d\n')
  }

  printlnInterpolationFormat(type) {
    if (type === LumenTypes.String) return '%s'
    if (type === LumenTypes.I64) return '%lld'
    if (type === LumenTypes.F32) return '%f'
    return '%d'
  }

  printlnArgumentType(type) {
    if ([LumenTypes.String, LumenTypes.Json, LumenTypes.Error].includes(type)) return 'ptr'
    if (type === LumenTypes.I64) return 'i64'
    if (type === LumenTypes.F32) return 'double'
    return 'i32'
  }

  printlnArgumentValue(value) {
    if ([LumenTypes.String, LumenTypes.Json, LumenTypes.Error].includes(value.type)) return value.value
    if (value.type === LumenTypes.I64) return this.cast(value, LumenTypes.I64)
    if (value.type === LumenTypes.F32) return this.cast(value, 'f64')
    return this.cast(value, LumenTypes.I32)
  }

  arithmeticInstruction(op, type) {
    if (type === LumenTypes.F32) {
      return {
        '+': 'fadd',
        '-': 'fsub',
        '*': 'fmul',
        '/': 'fdiv',
        '%': 'frem'
      }[op]
    }

    return {
      '+': 'add',
      '-': 'sub',
      '*': 'mul',
      '/': 'sdiv',
      '%': 'srem'
    }[op]
  }

  comparePredicate(op, type) {
    if (type === LumenTypes.F32) {
      return {
        '<': 'olt',
        '<=': 'ole',
        '>': 'ogt',
        '>=': 'oge',
        '==': 'oeq',
        '!=': 'one'
      }[op]
    }

    return {
      '<': 'slt',
      '<=': 'sle',
      '>': 'sgt',
      '>=': 'sge',
      '==': 'eq',
      '!=': 'ne'
    }[op]
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

  alloca(name, type, { length = null } = {}) {
    const pointer = `%${name}.addr.${this.temp}`
    this.temp += 1
    const storageType = this.typeSystem.isArray(type)
      ? this.typeSystem.llvmArray(type, length)
      : this.llvmType(type)
    this.lines.push(`  ${pointer} = alloca ${storageType}`)
    this.define(name, {
      pointer,
      type,
      length
    })
    return pointer
  }

  cast(value, targetType) {
    if (value.type === targetType) return value.value

    if (value.type === LumenTypes.Bool && targetType === LumenTypes.I64) {
      const temp = this.nextTemp()
      this.lines.push(`  ${temp} = zext i1 ${value.value} to i64`)
      return temp
    }

    if (value.type === LumenTypes.Bool && targetType === LumenTypes.I32) {
      const temp = this.nextTemp()
      this.lines.push(`  ${temp} = zext i1 ${value.value} to i32`)
      return temp
    }

    if (this.typeSystem.isNumeric(value.type) && targetType === LumenTypes.Bool) {
      const temp = this.nextTemp()
      const zero = value.type === LumenTypes.F32 ? '0.000000e+00' : '0'
      const instruction = value.type === LumenTypes.F32 ? 'fcmp one' : 'icmp ne'
      this.lines.push(`  ${temp} = ${instruction} ${this.llvmType(value.type)} ${value.value}, ${zero}`)
      return temp
    }

    if (value.type === LumenTypes.I32 && targetType === LumenTypes.I64) {
      const temp = this.nextTemp()
      this.lines.push(`  ${temp} = sext i32 ${value.value} to i64`)
      return temp
    }

    if ([LumenTypes.I32, LumenTypes.I64, LumenTypes.Bool].includes(value.type) && targetType === LumenTypes.F32) {
      const temp = this.nextTemp()
      const sourceType = this.llvmType(value.type)
      const sourceValue = value.type === LumenTypes.Bool ? this.cast(value, LumenTypes.I32) : value.value
      const normalizedSourceType = value.type === LumenTypes.Bool ? 'i32' : sourceType
      this.lines.push(`  ${temp} = sitofp ${normalizedSourceType} ${sourceValue} to float`)
      return temp
    }

    if (value.type === LumenTypes.F32 && [LumenTypes.I32, LumenTypes.I64].includes(targetType)) {
      const temp = this.nextTemp()
      this.lines.push(`  ${temp} = fptosi float ${value.value} to ${this.llvmType(targetType)}`)
      return temp
    }

    if (value.type === LumenTypes.F32 && targetType === 'f64') {
      const temp = this.nextTemp()
      this.lines.push(`  ${temp} = fpext float ${value.value} to double`)
      return temp
    }

    return value.value
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

  floatConstant(value) {
    return `${Number(value).toFixed(6)}e+00`
  }

  numberLiteralType(token) {
    if (token.lexeme.includes('.')) return LumenTypes.F32
    if (Math.abs(token.literal) > 2147483647) return LumenTypes.I64
    return LumenTypes.I32
  }
}
