import { TokenType } from '../lexer/TokenType.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes } from '../semantics/TypeSystem.js'
import { SystemFunctions } from '../system/SystemLibrary.js'
import { FsFunctions } from '../fs/FsLibrary.js'
import { HttpFunctions } from '../http/HttpLibrary.js'
import { ThreadFunctions } from '../thread/ThreadLibrary.js'
import { builtinSignature } from '../runtime/BuiltinRegistry.js'

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

class ValueLowering {
  emitExpression(expression) {
    const node = expression?.kind === 'IRValue'
      ? expression
      : expression?.tokens?.irValue ?? null

    if (node) return this.emitExpressionNode(node)
    return this.emitTokenExpression(expression)
  }

  emitExpressionNode(node) {
    if (!node) return { type: LumenTypes.Void, value: '' }

    if (node.op === 'await') return this.emitAwaitNode(node)
    if (node.op === 'call') {
      return this.emitCallExpressionNode(node)
    }
    if (node.op === 'access') {
      return this.emitMemberNode(node)
    }
    if (node.op === 'assign') {
      return this.emitAssignmentNode(node)
    }
    if (node.op === 'update') {
      if (node.argument.op !== 'reference') {
        throw new Diagnostic('Update target must be an identifier', node.location, 'backend')
      }
      return this.emitUpdate(node.argument, node.operator)
    }
    if (node.op === 'match') return this.emitMatchNode(node)
    if (node.op === 'constant') {
      const token = {
        type: node.tokenType,
        lexeme: node.lexeme,
        literal: node.value,
        location: node.location
      }
      if (token.type === TokenType.String) {
        if (token.literal.includes('${')) return this.emitInterpolatedString(token)
        const value = this.globalCString(token.literal)
        return { type: LumenTypes.String, value: value.pointer }
      }
      if (token.lexeme === 'true' || token.lexeme === 'false') {
        return { type: LumenTypes.Bool, value: token.lexeme === 'true' ? '1' : '0' }
      }
      if (token.lexeme === 'null') return { type: LumenTypes.Unknown, value: 'null' }
      const type = this.numberLiteralType(token)
      return {
        type,
        value: type === LumenTypes.F32 ? this.floatConstant(token.literal) : String(token.literal)
      }
    }
    if (node.op === 'reference') {
      if (this.enumConstants.has(node.name)) return this.enumConstants.get(node.name)
      const symbol = this.resolve(node.name)
      const value = this.nextTemp()
      this.lines.push(`  ${value} = load ${this.llvmType(symbol.type)}, ptr ${symbol.pointer}`)
      return { type: symbol.type, value }
    }
    if (node.op === 'unary') {
      const value = this.emitExpression(node.argument)
      if (node.operator === '+') return value
      if (node.operator === '-') {
        return this.emitBinary(
          { lexeme: '-', location: node.location },
          { type: value.type, value: value.type === LumenTypes.F32 ? '0.000000e+00' : '0' },
          value
        )
      }
      if (node.operator === '!') {
        return this.emitBinary(
          { lexeme: '==', location: node.location },
          value,
          { type: LumenTypes.Bool, value: '0' }
        )
      }
    }
    if (node.op === 'binary') {
      const left = this.emitExpression(node.left)
      const right = this.emitExpression(node.right)
      if (node.operator === '&&' || node.operator === '||') {
        const value = this.nextTemp()
        const instruction = node.operator === '&&' ? 'and' : 'or'
        this.lines.push(`  ${value} = ${instruction} i1 ${this.cast(left, LumenTypes.Bool)}, ${this.cast(right, LumenTypes.Bool)}`)
        return { type: LumenTypes.Bool, value }
      }
      const operator = node.operator === '==='
        ? '=='
        : node.operator === '!=='
          ? '!='
          : node.operator
      return this.emitBinary({ lexeme: operator, location: node.location }, left, right)
    }

    throw new Diagnostic(`Unsupported IR value ${node.op}`, node.location, 'backend')
  }

  emitAssignmentNode(node) {
    const target = this.emitLValueNode(node.left)
    const value = this.emitExpression(node.right)
    const stored = this.cast(value, target.type)
    this.lines.push(`  store ${this.llvmType(target.type)} ${stored}, ptr ${target.pointer}`)
    return { type: target.type, value: stored }
  }

  emitCallExpressionNode(node) {
    if (node.callee.op !== 'reference') {
      throw new Diagnostic('Call target must be a function name', node.location, 'backend')
    }

    if (this.functionSignatures.has(node.callee.name)) {
      return this.emitUserCallNode(node)
    }

    this.irCallArguments.push({
      arguments: node.arguments.map(argument => {
        const tokens = []
        tokens.irValue = argument
        return tokens
      }),
      consumed: false,
      name: node.callee.name,
      matched: false
    })
    try {
      const tokens = [
        {
          type: TokenType.Identifier,
          lexeme: node.callee.name,
          literal: node.callee.name,
          location: node.location
        },
        { lexeme: '(', location: node.location },
        { lexeme: ')', location: node.location }
      ]
      return this.emitTokenExpression({
        tokens,
        location: node.location
      })
    } finally {
      this.irCallArguments.pop()
    }
  }

  emitUserCallNode(node) {
    const name = node.callee.name
    const signature = this.functionSignatures.get(name)
    if (!signature || node.arguments.length !== signature.params.length) {
      throw new Diagnostic(`Invalid call to ${name}`, node.location, 'backend')
    }

    const values = node.arguments.map(argument => this.emitExpression(argument))
    const returnType = signature.isAsync ? `Task<${signature.returnType}>` : signature.returnType
    const result = returnType === LumenTypes.Void ? null : this.nextTemp()
    const callArgs = values.map((value, index) => {
      const paramType = signature.params[index].type
      return `${this.llvmType(paramType)} ${this.cast(value, paramType)}`
    }).join(', ')
    const prefix = result ? `${result} = ` : ''
    this.lines.push(`  ${prefix}call ${this.llvmType(returnType)} @${name}(${callArgs})`)
    return {
      type: returnType,
      value: result ?? ''
    }
  }

  emitTokenExpression(expression) {
    if (!expression || expression.tokens.length === 0) {
      return { type: LumenTypes.Void, value: '' }
    }

    if (expression.tokens[0]?.lexeme === 'await') {
      return this.emitExpression({
        tokens: expression.tokens.slice(1),
        location: expression.tokens[0].location
      })
    }

    const registeredBuiltin = builtinSignature(expression.tokens[0]?.lexeme)
    if (registeredBuiltin?.lowering === 'runtime' &&
      this.isCall(expression.tokens, registeredBuiltin.name)) {
      return this.emitRuntimeCall(expression.tokens, registeredBuiltin)
    }

    if (this.isCall(expression.tokens, SystemFunctions.Println)) return this.emitPrintln(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Len)) return this.emitLen(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Min)) return this.emitMinMax(expression.tokens, 'min')
    if (this.isCall(expression.tokens, SystemFunctions.Max)) return this.emitMinMax(expression.tokens, 'max')
    if (this.isCall(expression.tokens, SystemFunctions.Includes)) return this.emitIncludes(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Uuid)) return this.emitUuid(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Date)) return this.emitDate(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Env)) return this.emitEnv(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Encrypt)) return this.emitEncrypt(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Decrypt)) return this.emitDecrypt(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Arg)) return this.emitArg(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.ArgCount)) return this.emitArgCount(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Map)) return this.emitMap(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Ok)) return this.emitOk(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Err)) return this.emitErr(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.ResultValue)) return this.emitResultValue(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Some)) return this.emitSome(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.None)) return this.emitNone(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.ValueOr)) return this.emitValueOr(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Assert)) return this.emitAssert(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Channel)) return this.emitChannel(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Send)) return this.emitSend(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Receive)) return this.emitReceive(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.NewError)) return this.emitNewError(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.ArraySum)) return this.emitArraySum(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.ArrayFirst)) return this.emitArrayEdge(expression.tokens, 'first')
    if (this.isCall(expression.tokens, SystemFunctions.ArrayLast)) return this.emitArrayEdge(expression.tokens, 'last')
    if (this.isCall(expression.tokens, SystemFunctions.ArrayJoin)) return this.emitArrayJoin(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Exec)) return this.emitExec(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.SourceSnippet)) return this.emitSourceSnippet(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.Repeat)) return this.emitStringCountCall(expression.tokens, 'lumen_string_repeat', 'repeat')
    if (this.isCall(expression.tokens, SystemFunctions.PadStart)) return this.emitStringPadCall(expression.tokens, 'lumen_string_pad_start', 'padStart')
    if (this.isCall(expression.tokens, SystemFunctions.PadEnd)) return this.emitStringPadCall(expression.tokens, 'lumen_string_pad_end', 'padEnd')
    if (this.isCall(expression.tokens, SystemFunctions.IntToString)) return this.emitIntToString(expression.tokens)
    if (this.isCall(expression.tokens, SystemFunctions.ListGet)) return this.emitListGet(expression.tokens)
    if (this.isCall(expression.tokens, FsFunctions.ReadFile)) return this.emitReadFile(expression.tokens)
    if (this.isCall(expression.tokens, FsFunctions.WriteFile)) return this.emitWriteFile(expression.tokens)
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

  emitIncrement(token) {
    return this.emitUpdate({
      name: token.lexeme,
      location: token.location
    }, '++')
  }

  emitUpdate(identifier, operator) {
    const token = {
      lexeme: identifier.name,
      location: identifier.location
    }
    const symbol = this.resolve(token.lexeme)
    const current = this.nextTemp()
    const next = this.nextTemp()
    const instruction = symbol.type === LumenTypes.F32
      ? operator === '++' ? 'fadd' : 'fsub'
      : operator === '++' ? 'add' : 'sub'
    const one = symbol.type === LumenTypes.F32 ? '1.000000e+00' : '1'

    this.lines.push(`  ${current} = load ${this.llvmType(symbol.type)}, ptr ${symbol.pointer}`)
    this.lines.push(`  ${next} = ${instruction} ${this.llvmType(symbol.type)} ${current}, ${one}`)
    this.lines.push(`  store ${this.llvmType(symbol.type)} ${next}, ptr ${symbol.pointer}`)

    return {
      type: symbol.type,
      value: next
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
    const returnType = signature.isAsync ? `Task<${signature.returnType}>` : signature.returnType
    const result = returnType === LumenTypes.Void ? null : this.nextTemp()
    const callArgs = values.map((value, index) => {
      const paramType = signature.params[index].type
      return `${this.llvmType(paramType)} ${this.cast(value, paramType)}`
    }).join(', ')
    const prefix = result ? `${result} = ` : ''

    this.lines.push(`  ${prefix}call ${this.llvmType(returnType)} @${tokens[0].lexeme}(${callArgs})`)

    return {
      type: returnType,
      value: result ?? ''
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

  emitMatchNode(node) {
    if (node.arms.length === 0) {
      throw new Diagnostic('match needs at least one arm', node.location, 'backend')
    }

    const discriminant = this.emitExpression(node.discriminant)
    const resultType = node.type ?? this.emitExpression(node.arms[0].value).type
    const resultPointer = this.alloca('.match.result', resultType)
    const endLabel = this.nextLabel('match.end')
    const defaultArm = node.arms.find(arm => arm.pattern === null)
    const testArms = node.arms.filter(arm => arm.pattern !== null)
    const testLabels = testArms.map(() => this.nextLabel('match.test'))
    const bodyLabels = testArms.map(() => this.nextLabel('match.body'))
    const defaultLabel = defaultArm ? this.nextLabel('match.default') : endLabel

    this.lines.push(`  br label %${testLabels[0] ?? defaultLabel}`)
    for (let index = 0; index < testArms.length; index += 1) {
      const arm = testArms[index]
      this.lines.push(`${testLabels[index]}:`)
      const test = this.emitExpression(arm.pattern)
      const matches = this.emitEqualityComparison(discriminant, test)
      this.lines.push(`  br i1 ${matches.value}, label %${bodyLabels[index]}, label %${testLabels[index + 1] ?? defaultLabel}`)
      this.lines.push(`${bodyLabels[index]}:`)
      const value = this.emitExpression(arm.value)
      this.lines.push(`  store ${this.llvmType(resultType)} ${this.cast(value, resultType)}, ptr ${resultPointer}`)
      this.lines.push(`  br label %${endLabel}`)
    }

    if (defaultArm) {
      this.lines.push(`${defaultLabel}:`)
      const value = this.emitExpression(defaultArm.value)
      this.lines.push(`  store ${this.llvmType(resultType)} ${this.cast(value, resultType)}, ptr ${resultPointer}`)
      this.lines.push(`  br label %${endLabel}`)
    }

    this.lines.push(`${endLabel}:`)
    const result = this.nextTemp()
    this.lines.push(`  ${result} = load ${this.llvmType(resultType)}, ptr ${resultPointer}`)
    return { type: resultType, value: result }
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
    const active = this.irCallArguments.at(-1)
    if (active && !active.matched) {
      if (active.name !== name) return false
      active.matched = true
      return true
    }

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

  callArguments(tokens) {
    const active = this.irCallArguments.at(-1)
    if (active && !active.consumed) {
      active.consumed = true
      return active.arguments
    }

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

  floatConstant(value) {
    return `${Number(value).toFixed(6)}e+00`
  }

  numberLiteralType(token) {
    if (token.lexeme.includes('.')) return LumenTypes.F32
    if (Math.abs(token.literal) > 2147483647) return LumenTypes.I64
    return LumenTypes.I32
  }
}

export const valueLowering = Object.getOwnPropertyDescriptors(ValueLowering.prototype)
delete valueLowering.constructor
