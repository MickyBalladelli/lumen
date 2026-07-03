import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes } from '../semantics/TypeSystem.js'

class AggregateLowering {
  emitStructValueNode(node) {
    const struct = this.typeSystem.getStruct(node.type)
    if (!struct) {
      throw new Diagnostic(`Unknown struct "${node.type}"`, node.location, 'backend')
    }

    const values = new Map(node.fields.map(field => [field.key, field.value]))
    let aggregate = 'undef'

    for (let index = 0; index < struct.fields.length; index += 1) {
      const field = struct.fields[index]
      const valueNode = values.get(field.name)
      const value = valueNode?.op === 'struct'
        ? this.emitStructValueNode(valueNode)
        : this.emitExpression(valueNode)
      const next = this.nextTemp()
      this.lines.push(`  ${next} = insertvalue ${this.llvmType(node.type)} ${aggregate}, ${this.llvmType(field.type)} ${this.cast(value, field.type)}, ${index}`)
      aggregate = next
    }

    return {
      type: node.type,
      value: aggregate
    }
  }

  emitMemberNode(node) {
    if (node.computed && node.object.op === 'reference') {
      const base = this.resolve(node.object.name)
      if (base.type === LumenTypes.String) {
        this.usesBounds = true
        const source = this.nextTemp()
        this.lines.push(`  ${source} = load ptr, ptr ${base.pointer}`)

        if (node.property.op === 'slice') {
          this.usesSlice = true
          const start = this.emitExpression(node.property.start)
          const end = this.emitExpression(node.property.end)
          const result = this.nextTemp()
          this.lines.push(`  ${result} = call ptr @lumen_string_slice(ptr ${source}, i32 ${this.cast(start, LumenTypes.I32)}, i32 ${this.cast(end, LumenTypes.I32)})`)
          return { type: LumenTypes.String, value: result }
        }

        const index = this.emitExpression(node.property)
        const result = this.nextTemp()
        this.lines.push(`  ${result} = call ptr @lumen_string_at(ptr ${source}, i32 ${this.cast(index, LumenTypes.I32)})`)
        return { type: LumenTypes.String, value: result }
      }
    }

    const target = this.emitLValueNode(node)
    const value = this.nextTemp()
    this.lines.push(`  ${value} = load ${this.llvmType(target.type)}, ptr ${target.pointer}`)
    return { type: target.type, value }
  }

  emitLValueNode(node) {
    if (node.op === 'reference') {
      const symbol = this.resolve(node.name)
      return {
        pointer: symbol.pointer,
        type: symbol.type,
        length: symbol.length
      }
    }

    if (node.op !== 'access') {
      throw new Diagnostic('Assignment target must be identifier or access', node.location, 'backend')
    }

    const object = this.emitLValueNode(node.object)
    if (node.computed) {
      if (node.property.op === 'slice') {
        throw new Diagnostic('Slice cannot be assigned', node.location, 'backend')
      }
      if (!this.typeSystem.isArray(object.type) || object.length === null) {
        throw new Diagnostic('Array access needs fixed array', node.location, 'backend')
      }
      const index = this.emitExpression(node.property)
      const checked = this.emitBoundsCheck(this.cast(index, LumenTypes.I32), object.length)
      const pointer = this.nextTemp()
      this.lines.push(`  ${pointer} = getelementptr inbounds ${this.typeSystem.llvmArray(object.type, object.length)}, ptr ${object.pointer}, i32 0, i32 ${checked}`)
      return {
        pointer,
        type: this.typeSystem.elementType(object.type),
        length: null
      }
    }

    const field = this.typeSystem.getField(object.type, node.field)
    const struct = this.typeSystem.getStruct(object.type)
    if (!field || !struct) {
      throw new Diagnostic(`Unknown field "${node.field}"`, node.location, 'backend')
    }
    const pointer = this.nextTemp()
    const fieldIndex = struct.fields.indexOf(field)
    this.lines.push(`  ${pointer} = getelementptr inbounds ${this.llvmType(object.type)}, ptr ${object.pointer}, i32 0, i32 ${fieldIndex}`)
    return {
      pointer,
      type: field.type,
      length: null
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
      if (base.type === LumenTypes.String) {
        throw new Diagnostic('Strings cannot be changed through an index', tokens[0].location, 'backend')
      }
      if (!this.typeSystem.isArray(base.type) || base.length === null) {
        throw new Diagnostic('Array assignment needs fixed array', tokens[0].location, 'backend')
      }
      const closeIndex = this.findMatching(tokens, 1, '[', ']')
      const index = this.emitExpression({
        tokens: tokens.slice(2, closeIndex),
        location: tokens[0].location
      })
      const checkedIndex = this.emitBoundsCheck(
        this.cast(index, LumenTypes.I32),
        base.length
      )
      const pointer = this.nextTemp()
      this.lines.push(`  ${pointer} = getelementptr inbounds ${this.typeSystem.llvmArray(base.type, base.length)}, ptr ${base.pointer}, i32 0, i32 ${checkedIndex}`)
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

  emitStructInitializerNode(pointer, type, node) {
    const struct = this.typeSystem.getStruct(type)
    const values = new Map(node.fields.map(field => [field.key, field.value]))

    for (let index = 0; index < struct.fields.length; index += 1) {
      const field = struct.fields[index]
      const valueNode = values.get(field.name)
      const fieldPointer = this.nextTemp()
      this.lines.push(`  ${fieldPointer} = getelementptr inbounds ${this.llvmType(type)}, ptr ${pointer}, i32 0, i32 ${index}`)

      if (valueNode.op === 'struct') {
        this.emitStructInitializerNode(fieldPointer, field.type, valueNode)
        continue
      }

      const value = this.emitExpression(valueNode)
      this.lines.push(`  store ${this.llvmType(field.type)} ${this.cast(value, field.type)}, ptr ${fieldPointer}`)
    }
  }

  emitArrayInitializerNode(pointer, type, node) {
    const elementType = this.typeSystem.elementType(type)

    for (let index = 0; index < node.elements.length; index += 1) {
      const elementPointer = this.nextTemp()
      this.lines.push(`  ${elementPointer} = getelementptr inbounds ${this.typeSystem.llvmArray(type, node.elements.length)}, ptr ${pointer}, i32 0, i32 ${index}`)

      if (node.elements[index].op === 'struct') {
        this.emitStructInitializerNode(elementPointer, elementType, node.elements[index])
        continue
      }

      const value = this.emitExpression(node.elements[index])
      this.lines.push(`  store ${this.llvmType(elementType)} ${this.cast(value, elementType)}, ptr ${elementPointer}`)
    }
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

  emitBoundsCheck(index, length) {
    this.usesBounds = true
    const checked = this.nextTemp()
    this.lines.push(`  ${checked} = call i32 @lumen_bounds_check(i32 ${index}, i32 ${length})`)
    return checked
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
    const indexValue = this.cast(index, LumenTypes.I32)

    if (base.type === LumenTypes.String) {
      this.usesBounds = true
      const source = this.nextTemp()
      const result = this.nextTemp()
      this.lines.push(`  ${source} = load ptr, ptr ${base.pointer}`)
      this.lines.push(`  ${result} = call ptr @lumen_string_at(ptr ${source}, i32 ${indexValue})`)
      return {
        type: LumenTypes.String,
        value: result
      }
    }

    if (!this.typeSystem.isArray(base.type) || base.length === null) {
      throw new Diagnostic('Array access needs fixed array', tokens[0].location, 'backend')
    }

    const checkedIndex = this.emitBoundsCheck(indexValue, base.length)
    const elementType = this.typeSystem.elementType(base.type)
    const elementPointer = this.nextTemp()

    this.lines.push(`  ${elementPointer} = getelementptr inbounds ${this.typeSystem.llvmArray(base.type, base.length)}, ptr ${base.pointer}, i32 0, i32 ${checkedIndex}`)

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
}

export const aggregateLowering = Object.getOwnPropertyDescriptors(AggregateLowering.prototype)
delete aggregateLowering.constructor
