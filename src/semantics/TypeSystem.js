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
    if (this.isGeneric(normalized)) return this.genericArgs(normalized).every(arg => this.assertKnown(arg))
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
    if (this.isNullable(to) && this.canAssign(from, this.nonNullable(to))) return true
    if (from === LumenTypes.Unknown && this.isNullable(to)) return true
    if (this.isArray(from) || this.isArray(to)) {
      return this.isArray(from) &&
        this.isArray(to) &&
        this.canAssign(this.elementType(from), this.elementType(to))
    }
    if (this.isGeneric(from) && this.isGeneric(to)) return this.canAssignGeneric(from, to)
    if (this.isGeneric(to) && from === LumenTypes.String) return true
    if (this.isGeneric(from) && to === LumenTypes.String) return true
    if (to === LumenTypes.Json && from === LumenTypes.String) return true
    if (to === LumenTypes.Error && from === LumenTypes.String) return true
    if (this.isGeneric(from) || this.isGeneric(to)) return from === to
    if (from === LumenTypes.I32 && [LumenTypes.I64, LumenTypes.F32].includes(to)) return true
    if (from === LumenTypes.Bool && this.isNumeric(to)) return true

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
    return typeName.slice(typeName.indexOf('<') + 1, -1).split(',').map(type => type.trim())
  }

  genericBase(typeName) {
    return this.isGeneric(typeName) ? typeName.slice(0, typeName.indexOf('<')) : null
  }

  canAssignGeneric(from, to) {
    if (this.genericBase(from) !== this.genericBase(to)) return false

    const fromArgs = this.genericArgs(from)
    const toArgs = this.genericArgs(to)
    if (fromArgs.length !== toArgs.length) return false

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
