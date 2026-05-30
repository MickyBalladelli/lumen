import { TokenType } from '../lexer/TokenType.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes, TypeSystem } from '../semantics/TypeSystem.js'
import { SystemFunctions } from '../system/SystemLibrary.js'

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
    const typeDefinitions = irModule.structs.map(struct => this.emitStructType(struct))
    const functions = irModule.functions.flatMap(func => this.emitFunction(func))

    return [
      '; Lumen LLVM IR',
      ...typeDefinitions,
      ...this.globals,
      this.usesPrintf ? 'declare i32 @printf(ptr, ...)' : '',
      this.usesStrstr ? 'declare ptr @strstr(ptr, ptr)' : '',
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
      this.lines.push(this.defaultReturn(func.returnType))
    }

    this.lines.push('}')
    return this.lines
  }

  emitStatement(node) {
    if (node.kind === 'VariableDeclaration') return this.emitVariableDeclaration(node)
    if (node.kind === 'ExpressionStatement') return this.emitExpression(node.expression)
    if (node.kind === 'ReturnStatement') return this.emitReturn(node)
    if (node.kind === 'BlockStatement') return this.emitBlock(node)
    if (node.kind === 'ForOfStatement') return this.emitForOf(node)
    if (node.kind === 'ForStatement') return this.emitFor(node)

    throw new Diagnostic(`LLVM backend does not support ${node.kind}`, node.location, 'backend')
  }

  emitBlock(node) {
    this.pushScope()
    for (const statement of node.body) this.emitStatement(statement)
    this.popScope()
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
    if (!node.argument) {
      this.lines.push('  ret void')
      return
    }

    const value = this.emitExpression(node.argument)
    this.lines.push(`  ret ${this.llvmType(this.returnType)} ${this.cast(value, this.returnType)}`)
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
    this.popScope()
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
  }

  emitExpression(expression) {
    if (!expression || expression.tokens.length === 0) {
      return { type: LumenTypes.Void, value: '' }
    }

    if (this.isCall(expression.tokens, SystemFunctions.Println)) return this.emitPrintln(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Len)) return this.emitLen(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Includes)) return this.emitIncludes(expression.tokens)
    if (this.isFieldAccess(expression.tokens)) return this.emitFieldLoad(expression.tokens)
    if (this.isArrayAccess(expression.tokens)) return this.emitArrayLoad(expression.tokens)

    const assignmentIndex = this.findTopLevelOperator(expression.tokens, '=')
    if (assignmentIndex > 0) return this.emitAssignment(expression.tokens, assignmentIndex)

    if (expression.tokens.length === 2 &&
      expression.tokens[0].type === TokenType.Identifier &&
      expression.tokens[1].lexeme === '++') {
      return this.emitIncrement(expression.tokens[0])
    }

    return this.emitRpn(this.toRpn(expression.tokens), expression.location)
  }

  emitAssignment(tokens, index) {
    const target = tokens[index - 1]
    if (target.type !== TokenType.Identifier) {
      throw new Diagnostic('Assignment target must be an identifier', target.location, 'backend')
    }

    const symbol = this.resolve(target.lexeme)
    const value = this.emitRpn(this.toRpn(tokens.slice(index + 1)), target.location)

    this.lines.push(`  store ${this.llvmType(symbol.type)} ${this.cast(value, symbol.type)}, ptr ${symbol.pointer}`)
    return {
      type: symbol.type,
      value: this.cast(value, symbol.type)
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

  emitEqualityComparison(left, right) {
    const type = this.typeSystem.widest(left.type, right.type)
    const temp = this.nextTemp()

    if (type === LumenTypes.F32) {
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
    if (type === LumenTypes.String) return this.globalCString('%s\n')
    if (type === LumenTypes.I64) return this.globalCString('%lld\n')
    if (type === LumenTypes.F32) return this.globalCString('%f\n')
    return this.globalCString('%d\n')
  }

  printlnArgumentType(type) {
    if (type === LumenTypes.String) return 'ptr'
    if (type === LumenTypes.I64) return 'i64'
    if (type === LumenTypes.F32) return 'double'
    return 'i32'
  }

  printlnArgumentValue(value) {
    if (value.type === LumenTypes.String) return value.value
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
