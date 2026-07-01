export const LumenTypes = Object.freeze({
  I32: 'i32',
  I64: 'i64',
  F32: 'f32',
  Bool: 'bool',
  String: 'string',
  Json: 'json',
  Error: 'error',
  Semaphore: 'semaphore',
  Thread: 'thread',
  Void: 'void',
  Unknown: 'unknown'
})

export class TypeSystem {
  constructor() {
    this.known = new Set(Object.values(LumenTypes))
    this.structs = new Map()
    this.enums = new Map()
  }

  registerStruct(name, fields) {
    this.known.add(name)
    this.structs.set(name, {
      name,
      fields
    })
  }

  registerEnum(name, variants) {
    this.known.add(name)
    this.enums.set(name, {
      name,
      variants
    })
  }

  normalize(typeName) {
    if (!typeName) return LumenTypes.Unknown
    if (typeName === 'number') return LumenTypes.I32
    return typeName
  }

  assertKnown(typeName) {
    const normalized = this.normalize(typeName)
    if (this.isNullable(normalized)) return this.assertKnown(this.nonNullable(normalized))
    if (this.isArray(normalized)) return this.assertKnown(this.elementType(normalized))
    if (this.isGeneric(normalized)) {
      const base = this.genericBase(normalized)
      const args = this.genericArgs(normalized)
      const arity = base === 'Result' ? 1 : base === 'Map' ? 2 : null

      return arity !== null &&
        args.length === arity &&
        args.every(arg => this.assertKnown(arg))
    }
    return this.known.has(normalized)
  }

  llvm(typeName) {
    const normalized = this.normalize(typeName)

    if (normalized === LumenTypes.I32) return 'i32'
    if (normalized === LumenTypes.I64) return 'i64'
    if (normalized === LumenTypes.F32) return 'float'
    if (normalized === LumenTypes.Bool) return 'i1'
    if (normalized === LumenTypes.Json) return 'ptr'
    if (normalized === LumenTypes.Error) return 'ptr'
    if (normalized === LumenTypes.Semaphore) return 'ptr'
    if (normalized === LumenTypes.Thread) return 'ptr'
    if (normalized === LumenTypes.Void) return 'void'
    if (this.isNullable(normalized)) return 'ptr'
    if (this.isGeneric(normalized)) return 'ptr'
    if (this.enums.has(normalized)) return 'i32'
    if (this.structs.has(normalized)) return `%${normalized}`

    return 'ptr'
  }

  isNumeric(typeName) {
    return [LumenTypes.I32, LumenTypes.I64, LumenTypes.F32].includes(this.normalize(typeName))
  }

  canAssign(fromType, toType) {
    const from = this.normalize(fromType)
    const to = this.normalize(toType)

    if (from === to) return true
    if (this.isNullable(from) || this.isNullable(to)) {
      if (!this.isNullable(to)) return false
      if (from === LumenTypes.Unknown) return true
      return this.isNullable(from)
        ? this.canAssign(this.nonNullable(from), this.nonNullable(to))
        : this.canAssign(from, this.nonNullable(to))
    }
    if (this.isArray(from) || this.isArray(to)) {
      if (this.isArray(from) && this.elementType(from) === LumenTypes.Unknown && this.isArray(to)) return true
      return this.isArray(from) &&
        this.isArray(to) &&
        this.sameType(this.elementType(from), this.elementType(to))
    }
    if (this.isGeneric(from) && this.isGeneric(to)) return this.canAssignGeneric(from, to)
    if (this.genericBase(to) === 'Map' && from === LumenTypes.String) return true
    if (this.genericBase(from) === 'Map' && to === LumenTypes.String) return true
    if (to === LumenTypes.Json && from === LumenTypes.String) return true
    if (to === LumenTypes.Error && from === LumenTypes.String) return true
    if (this.isGeneric(from) || this.isGeneric(to)) return from === to
    if (from === LumenTypes.I32 && [LumenTypes.I64, LumenTypes.F32].includes(to)) return true

    return false
  }

  sameType(leftType, rightType) {
    const left = this.normalize(leftType)
    const right = this.normalize(rightType)

    if (left === right) return true
    if (this.isArray(left) && this.isArray(right)) {
      return this.sameType(this.elementType(left), this.elementType(right))
    }
    if (this.isNullable(left) && this.isNullable(right)) {
      return this.sameType(this.nonNullable(left), this.nonNullable(right))
    }
    if (this.isGeneric(left) && this.isGeneric(right)) {
      return this.genericBase(left) === this.genericBase(right) &&
        this.genericArgs(left).length === this.genericArgs(right).length &&
        this.genericArgs(left).every((arg, index) => this.sameType(arg, this.genericArgs(right)[index]))
    }

    return false
  }

  widest(leftType, rightType) {
    const left = this.normalize(leftType)
    const right = this.normalize(rightType)

    if (left === LumenTypes.F32 || right === LumenTypes.F32) return LumenTypes.F32
    if (left === LumenTypes.I64 || right === LumenTypes.I64) return LumenTypes.I64
    return LumenTypes.I32
  }

  getStruct(name) {
    return this.structs.get(name) ?? null
  }

  getField(structName, fieldName) {
    return this.getStruct(structName)?.fields.find(field => field.name === fieldName) ?? null
  }

  getEnum(name) {
    return this.enums.get(name) ?? null
  }

  enumVariant(name) {
    for (const enumType of this.enums.values()) {
      const index = enumType.variants.findIndex(variant => variant.name === name)
      if (index >= 0) return {
        enumName: enumType.name,
        index
      }
    }

    return null
  }

  isArray(typeName) {
    return typeof typeName === 'string' && typeName.endsWith('[]')
  }

  isNullable(typeName) {
    return typeof typeName === 'string' && typeName.endsWith('?')
  }

  isGeneric(typeName) {
    return typeof typeName === 'string' && typeName.includes('<') && typeName.endsWith('>')
  }

  genericArgs(typeName) {
    if (!this.isGeneric(typeName)) return []
    const source = typeName.slice(typeName.indexOf('<') + 1, -1)
    const args = []
    let depth = 0
    let start = 0

    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === '<') depth += 1
      if (source[index] === '>') depth -= 1
      if (source[index] === ',' && depth === 0) {
        args.push(source.slice(start, index).trim())
        start = index + 1
      }
    }

    args.push(source.slice(start).trim())
    return args
  }

  genericBase(typeName) {
    return this.isGeneric(typeName) ? typeName.slice(0, typeName.indexOf('<')) : null
  }

  canAssignGeneric(from, to) {
    const base = this.genericBase(from)
    if (base !== this.genericBase(to)) return false

    const fromArgs = this.genericArgs(from)
    const toArgs = this.genericArgs(to)
    if (fromArgs.length !== toArgs.length) return false

    if (base === 'Map') {
      return fromArgs.every((arg, index) => this.sameType(arg, toArgs[index]))
    }

    if (base !== 'Result') return false

    return fromArgs.every((arg, index) => {
      return arg === LumenTypes.Unknown ||
        toArgs[index] === LumenTypes.Unknown ||
        this.canAssign(arg, toArgs[index])
    })
  }

  nonNullable(typeName) {
    return this.isNullable(typeName) ? typeName.slice(0, -1) : typeName
  }

  elementType(typeName) {
    return this.isArray(typeName) ? typeName.slice(0, -2) : null
  }

  llvmArray(typeName, length) {
    return `[${length} x ${this.llvm(this.elementType(typeName))}]`
  }
}
