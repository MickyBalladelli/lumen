export const LumenTypes = Object.freeze({
  I32: 'i32',
  I64: 'i64',
  F32: 'f32',
  Bool: 'bool',
  String: 'string',
  Void: 'void',
  Unknown: 'unknown'
})

export class TypeSystem {
  constructor() {
    this.known = new Set(Object.values(LumenTypes))
    this.structs = new Map()
  }

  registerStruct(name, fields) {
    this.known.add(name)
    this.structs.set(name, {
      name,
      fields
    })
  }

  normalize(typeName) {
    if (!typeName) return LumenTypes.Unknown
    if (typeName === 'number') return LumenTypes.I32
    return typeName
  }

  assertKnown(typeName) {
    const normalized = this.normalize(typeName)
    if (this.isArray(normalized)) return this.assertKnown(this.elementType(normalized))
    return this.known.has(normalized)
  }

  llvm(typeName) {
    const normalized = this.normalize(typeName)

    if (normalized === LumenTypes.I32) return 'i32'
    if (normalized === LumenTypes.I64) return 'i64'
    if (normalized === LumenTypes.F32) return 'float'
    if (normalized === LumenTypes.Bool) return 'i1'
    if (normalized === LumenTypes.Void) return 'void'
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
    if (this.isArray(from) || this.isArray(to)) {
      return this.isArray(from) &&
        this.isArray(to) &&
        this.canAssign(this.elementType(from), this.elementType(to))
    }
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

  isArray(typeName) {
    return typeof typeName === 'string' && typeName.endsWith('[]')
  }

  elementType(typeName) {
    return this.isArray(typeName) ? typeName.slice(0, -2) : null
  }

  llvmArray(typeName, length) {
    return `[${length} x ${this.llvm(this.elementType(typeName))}]`
  }
}
