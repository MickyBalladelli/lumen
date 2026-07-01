import { TokenType } from '../lexer/TokenType.js'
import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes } from '../semantics/TypeSystem.js'
import { runtimeSignature } from '../runtime/BuiltinRegistry.js'

class BuiltinLowering {
  emitPrintln(tokens) {
    this.usesPrintf = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('println expects one argument', tokens[0].location, 'backend')
    }

    const arg = args[0]
    const constant = arg.irValue?.op === 'constant' &&
      arg.irValue.tokenType === TokenType.String
      ? {
          type: TokenType.String,
          literal: arg.irValue.value,
          location: arg.irValue.location
        }
      : null
    const stringToken = constant ?? (
      arg.length === 1 && arg[0].type === TokenType.String ? arg[0] : null
    )

    if (stringToken) {
      if (stringToken.literal.includes('${')) return this.emitInterpolatedPrintln(stringToken)

      const format = this.globalCString('%s\n')
      const value = this.globalCString(stringToken.literal)
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

  emitMinMax(tokens, mode) {
    const args = this.callArguments(tokens)

    if (args.length !== 2) {
      throw new Diagnostic(`${mode} expects two numbers`, tokens[0].location, 'backend')
    }

    const left = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const right = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })

    if (!this.typeSystem.isNumeric(left.type) || !this.typeSystem.isNumeric(right.type)) {
      throw new Diagnostic(`${mode} expects numeric arguments`, tokens[0].location, 'backend')
    }

    const type = this.typeSystem.widest(left.type, right.type)
    const predicate = type === LumenTypes.F32
      ? mode === 'min' ? 'olt' : 'ogt'
      : mode === 'min' ? 'slt' : 'sgt'
    const compare = this.nextTemp()
    const result = this.nextTemp()
    const instruction = type === LumenTypes.F32 ? 'fcmp' : 'icmp'
    const llvmType = this.llvmType(type)
    const leftValue = this.cast(left, type)
    const rightValue = this.cast(right, type)

    this.lines.push(`  ${compare} = ${instruction} ${predicate} ${llvmType} ${leftValue}, ${rightValue}`)
    this.lines.push(`  ${result} = select i1 ${compare}, ${llvmType} ${leftValue}, ${llvmType} ${rightValue}`)

    return {
      type,
      value: result
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

  emitDate(tokens) {
    const args = this.callArguments(tokens)

    if (args.length !== 0) {
      throw new Diagnostic('date expects no arguments', tokens[0].location, 'backend')
    }

    this.usesDate = true
    const value = this.nextTemp()
    this.lines.push(`  ${value} = call ptr @lumen_date()`)

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
      type: 'Result<string>',
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
      type: 'Result<string>',
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
    this.lines.push(`  ${result} = call ptr @lumen_arg_count()`)

    return {
      type: 'Result<i32>',
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

  emitOk(tokens) {
    this.usesResults = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('ok expects one value', tokens[0].location, 'backend')
    }

    const value = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const encoded = this.encodeValueAsString(value, tokens[0].location)
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_ok(ptr ${encoded.value})`)

    return {
      type: `Result<${value.type}>`,
      value: result
    }
  }

  emitErr(tokens) {
    this.usesResults = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('err expects one message', tokens[0].location, 'backend')
    }

    const message = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const encoded = this.encodeValueAsString(message, tokens[0].location)
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_err(ptr ${encoded.value})`)

    return {
      type: 'Result<unknown>',
      value: result
    }
  }

  emitSome(tokens) {
    this.usesOptions = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('some expects one value', tokens[0].location, 'backend')
    }

    const value = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const encoded = this.encodeValueAsString(value, tokens[0].location)
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_some(ptr ${encoded.value})`)

    return {
      type: `${value.type}?`,
      value: result
    }
  }

  emitValueOr(tokens) {
    this.usesOptions = true
    const args = this.callArguments(tokens)

    if (args.length !== 2) {
      throw new Diagnostic('valueOr expects option and fallback', tokens[0].location, 'backend')
    }

    const option = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const fallback = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const valueType = this.typeSystem.isNullable(option.type)
      ? this.typeSystem.nonNullable(option.type)
      : fallback.type
    const encodedFallback = this.encodeValueAsString(fallback, tokens[0].location)
    const raw = this.nextTemp()
    this.lines.push(`  ${raw} = call ptr @lumen_value_or(ptr ${option.value}, ptr ${encodedFallback.value})`)

    return this.decodeStringValue({
      type: LumenTypes.String,
      value: raw
    }, valueType)
  }

  emitStringCountCall(tokens, runtimeName, displayName) {
    this.usesStringRuntime = true
    const args = this.callArguments(tokens)

    if (args.length !== 2) {
      throw new Diagnostic(`${displayName} expects value and count`, tokens[0].location, 'backend')
    }

    const value = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const count = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @${runtimeName}(ptr ${value.value}, i32 ${this.cast(count, LumenTypes.I32)})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitStringPadCall(tokens, runtimeName, displayName) {
    this.usesStringRuntime = true
    const args = this.callArguments(tokens)

    if (args.length !== 3) {
      throw new Diagnostic(`${displayName} expects value, length, and fill`, tokens[0].location, 'backend')
    }

    const value = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const length = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const fill = this.emitExpression({
      tokens: args[2],
      location: tokens[0].location
    })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @${runtimeName}(ptr ${value.value}, i32 ${this.cast(length, LumenTypes.I32)}, ptr ${fill.value})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitResultValue(tokens) {
    this.usesResults = true
    const args = this.callArguments(tokens)

    if (args.length !== 1) {
      throw new Diagnostic('resultValue expects one result', tokens[0].location, 'backend')
    }

    const resultValue = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_result_value(ptr ${resultValue.value})`)

    const innerType = this.typeSystem.isGeneric(resultValue.type) && this.typeSystem.genericBase(resultValue.type) === 'Result'
      ? this.typeSystem.genericArgs(resultValue.type)[0]
      : LumenTypes.String

    return this.decodeStringValue({
      type: innerType,
      value: result
    }, innerType)
  }

  encodeValueAsString(value, location) {
    if (value.type === LumenTypes.String || value.type === LumenTypes.Json || this.typeSystem.isGeneric(value.type) || this.typeSystem.isNullable(value.type)) {
      return {
        type: LumenTypes.String,
        value: value.value
      }
    }

    if (value.type === LumenTypes.I32 || value.type === LumenTypes.Bool) {
      this.usesStringRuntime = true
      const result = this.nextTemp()
      this.lines.push(`  ${result} = call ptr @lumen_int_to_string(i32 ${this.cast(value, LumenTypes.I32)})`)
      return {
        type: LumenTypes.String,
        value: result
      }
    }

    throw new Diagnostic(`Cannot encode ${value.type} as string payload yet`, location, 'backend')
  }

  decodeStringValue(value, targetType) {
    if (targetType === LumenTypes.String || targetType === LumenTypes.Json || targetType === LumenTypes.Unknown || this.typeSystem.isGeneric(targetType) || this.typeSystem.isNullable(targetType)) {
      return {
        type: targetType,
        value: value.value
      }
    }

    if (targetType === LumenTypes.I32) {
      this.usesStringRuntime = true
      const result = this.nextTemp()
      this.lines.push(`  ${result} = call i32 @lumen_string_to_int(ptr ${value.value})`)
      return {
        type: LumenTypes.I32,
        value: result
      }
    }

    if (targetType === LumenTypes.Bool) {
      this.usesStringRuntime = true
      const parsed = this.nextTemp()
      const result = this.nextTemp()
      this.lines.push(`  ${parsed} = call i32 @lumen_string_to_int(ptr ${value.value})`)
      this.lines.push(`  ${result} = icmp ne i32 ${parsed}, 0`)
      return {
        type: LumenTypes.Bool,
        value: result
      }
    }

    return {
      type: targetType,
      value: value.value
    }
  }

  emitRuntimeCall(tokens, builtin) {
    const abi = runtimeSignature(builtin.runtime)
    if (!abi) throw new Diagnostic(`Missing runtime ABI for ${builtin.name}`, tokens[0].location, 'backend')
    this[abi.flag] = true

    const args = this.callArguments(tokens)
    if (args.length !== builtin.parameters.length) {
      throw new Diagnostic(`${builtin.name} expects ${builtin.parameters.length} argument(s)`, tokens[0].location, 'backend')
    }

    const values = args.map(arg => this.emitExpression({
      tokens: arg,
      location: tokens[0].location
    }))
    const result = this.nextTemp()
    const signature = values.map(() => 'ptr').join(', ')
    const callArgs = values.map(value => `ptr ${value.value}`).join(', ')
    const llvmReturnType = this.llvmType(builtin.returnType)

    this.lines.push(`  ${result} = call ${llvmReturnType} @${abi.symbol}(${signature ? `${callArgs}` : ''})`)

    return {
      type: builtin.returnType,
      value: result
    }
  }

  emitSourceSnippet(tokens) {
    this.usesStringRuntime = true
    const args = this.callArguments(tokens)
    if (args.length !== 3) throw new Diagnostic('sourceSnippet expects source, line, and column', tokens[0].location, 'backend')

    const source = this.emitExpression({ tokens: args[0], location: tokens[0].location })
    const line = this.emitExpression({ tokens: args[1], location: tokens[0].location })
    const column = this.emitExpression({ tokens: args[2], location: tokens[0].location })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_source_snippet(ptr ${source.value}, i32 ${this.cast(line, LumenTypes.I32)}, i32 ${this.cast(column, LumenTypes.I32)})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitListGet(tokens) {
    this.usesStringRuntime = true
    const args = this.callArguments(tokens)
    if (args.length !== 2) throw new Diagnostic('listGet expects list and index', tokens[0].location, 'backend')

    const list = this.emitExpression({ tokens: args[0], location: tokens[0].location })
    const index = this.emitExpression({ tokens: args[1], location: tokens[0].location })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_list_get(ptr ${list.value}, i32 ${this.cast(index, LumenTypes.I32)})`)

    return {
      type: LumenTypes.String,
      value: result
    }
  }

  emitIntToString(tokens) {
    this.usesStringRuntime = true
    const args = this.callArguments(tokens)
    if (args.length !== 1) throw new Diagnostic('intToString expects one value', tokens[0].location, 'backend')

    const value = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_int_to_string(i32 ${this.cast(value, LumenTypes.I32)})`)

    return {
      type: LumenTypes.String,
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
      type: 'Result<string>',
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
      type: 'Result<string>',
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

    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_read_file(ptr ${path.value})`)

    return {
      type: 'Result<string>',
      value: result
    }
  }

  emitExec(tokens) {
    this.usesProcess = true
    const args = this.callArguments(tokens)

    if (args.length !== 2) {
      throw new Diagnostic('exec expects program and argument array', tokens[0].location, 'backend')
    }

    const command = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    if (command.type !== LumenTypes.String) {
      throw new Diagnostic('exec program must be string', tokens[0].location, 'backend')
    }

    const argumentsValue = this.arrayPointerArgument(args[1], tokens[0].location, {
      allowEmpty: true
    })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_exec(ptr ${command.value}, ptr ${argumentsValue.pointer}, i32 ${argumentsValue.length})`)

    return {
      type: 'Result<i32>',
      value: result
    }
  }

  emitWriteFile(tokens) {
    this.usesFileIO = true
    const args = this.callArguments(tokens)

    if (args.length !== 2) {
      throw new Diagnostic('writeFile expects path and content', tokens[0].location, 'backend')
    }

    const path = this.emitExpression({
      tokens: args[0],
      location: tokens[0].location
    })
    const content = this.emitExpression({
      tokens: args[1],
      location: tokens[0].location
    })
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_write_file(ptr ${path.value}, ptr ${content.value})`)

    return {
      type: 'Result<i32>',
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

    this.lines.push(`  ${result} = call ptr @lumen_http_serve_files(i32 ${this.cast(port, LumenTypes.I32)}, ptr ${root.value})`)

    return {
      type: 'Result<i32>',
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

    this.lines.push(`  ${result} = call ptr @lumen_http_serve_api(i32 ${this.cast(port, LumenTypes.I32)}, ptr ${method.value}, ptr ${route.value}, ptr ${headers.value}, ptr ${body.value})`)

    return {
      type: 'Result<i32>',
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
    this.lines.push(`  ${result} = call ptr @lumen_http_serve_http(i32 ${this.cast(port, LumenTypes.I32)}, ptr ${root.value}, ptr ${methods.pointer}, ptr ${routes.pointer}, ptr ${headers.pointer}, ptr ${bodies.pointer}, i32 ${methods.length})`)

    return {
      type: 'Result<i32>',
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

    this.lines.push(`  ${result} = call ptr @lumen_socketio_serve_chat(i32 ${this.cast(port, LumenTypes.I32)}, ptr ${root.value})`)

    return {
      type: 'Result<i32>',
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
      type: 'Result<string>',
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
      type: 'Result<string>',
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
      type: 'Result<string>',
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
      type: 'Result<string>',
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
      type: 'Result<semaphore>',
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
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_semaphore_wait(ptr ${semaphore.value})`)

    return {
      type: 'Result<i32>',
      value: result
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
    const result = this.nextTemp()
    this.lines.push(`  ${result} = call ptr @lumen_semaphore_signal(ptr ${semaphore.value})`)

    return {
      type: 'Result<i32>',
      value: result
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
      type: 'Result<thread>',
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
    this.lines.push(`  ${result} = call ptr @lumen_thread_join(ptr ${thread.value})`)

    return {
      type: 'Result<i32>',
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
    this.lines.push(`  ${result} = call ptr @lumen_append_file(ptr ${path.value}, ptr ${message.value})`)

    return {
      type: 'Result<i32>',
      value: result
    }
  }

  arrayPointerArgument(tokens, location, { allowEmpty = false } = {}) {
    const name = this.singleIdentifierName({
      tokens,
      location
    })
    const symbol = this.resolve(name)

    if (!this.typeSystem.isArray(symbol.type) || symbol.length === null ||
      (!allowEmpty && symbol.length === 0)) {
      throw new Diagnostic('serveHttp expects non-empty array variables', location, 'backend')
    }

    if (symbol.length === 0) {
      return {
        pointer: 'null',
        length: 0
      }
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

    const checkedIndex = this.emitBoundsCheck(currentIndex, array.length)
    const elementPointer = this.nextTemp()
    const elementValue = this.nextTemp()
    this.lines.push(`  ${elementPointer} = getelementptr inbounds ${this.typeSystem.llvmArray(array.type, array.length)}, ptr ${array.pointer}, i32 0, i32 ${checkedIndex}`)
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

  singleIdentifierName(expression) {
    if (expression.tokens.irValue?.op === 'reference') {
      return expression.tokens.irValue.name
    }
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
}

export const builtinLowering = Object.getOwnPropertyDescriptors(BuiltinLowering.prototype)
delete builtinLowering.constructor
