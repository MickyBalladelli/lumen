import { basename, dirname } from 'node:path'
import { LumenTypes } from '../semantics/TypeSystem.js'

class DebugLowering {
  createLineBuffer() {
    const lines = []
    const originalPush = lines.push.bind(lines)

    lines.push = (...items) => originalPush(...items.map(line => this.attachDebugLocation(line)))

    return lines
  }

  attachDebugLocation(line) {
    if (!this.activeDebugLocation) return line
    if (!line.startsWith('  ')) return line
    if (line.includes('!dbg')) return line
    if (line.trim() === '') return line

    return `${line}, !dbg ${this.activeDebugLocation}`
  }

  createDebugContext(sourcePath) {
    if (!sourcePath) return null

    const metadata = []
    const context = {
      filename: basename(sourcePath),
      directory: dirname(sourcePath),
      metadata
    }

    context.empty = this.addDebugMetadata(context, '!{}')
    context.file = this.addDebugMetadata(
      context,
      `!DIFile(filename: "${this.escapeDebugString(context.filename)}", directory: "${this.escapeDebugString(context.directory)}")`
    )
    context.unit = this.addDebugMetadata(
      context,
      `distinct !DICompileUnit(language: DW_LANG_C_plus_plus, file: ${context.file}, producer: "Lumen", isOptimized: false, runtimeVersion: 0, emissionKind: FullDebug)`
    )
    context.subroutineType = this.addDebugMetadata(context, `!DISubroutineType(types: ${context.empty})`)
    context.dwarfVersion = this.addDebugMetadata(context, '!{i32 2, !"Dwarf Version", i32 4}')
    context.debugInfoVersion = this.addDebugMetadata(context, '!{i32 2, !"Debug Info Version", i32 3}')
    context.expression = this.addDebugMetadata(context, '!DIExpression()')
    context.types = new Map()
    context.files = new Map([[sourcePath, context.file]])

    return context
  }

  addDebugMetadata(context, value) {
    const id = `!${context.metadata.length}`
    context.metadata.push(`${id} = ${value}`)
    return id
  }

  createDebugSubprogram(func) {
    if (!this.debug) return null

    const line = func.location?.line ?? func.blocks[0]?.location?.line ?? 1
    const file = this.debugFile(func.location?.sourcePath)
    this.currentDebugFile = file
    return this.addDebugMetadata(
      this.debug,
      `distinct !DISubprogram(name: "${this.escapeDebugString(func.name)}", linkageName: "${this.escapeDebugString(func.name)}", scope: ${file}, file: ${file}, line: ${line}, type: ${this.debug.subroutineType}, scopeLine: ${line}, spFlags: DISPFlagDefinition, unit: ${this.debug.unit}, retainedNodes: ${this.debug.empty})`
    )
  }

  debugFile(sourcePath) {
    if (!this.debug || !sourcePath) return this.debug?.file ?? null
    if (this.debug.files.has(sourcePath)) return this.debug.files.get(sourcePath)

    const file = this.addDebugMetadata(
      this.debug,
      `!DIFile(filename: "${this.escapeDebugString(basename(sourcePath))}", directory: "${this.escapeDebugString(dirname(sourcePath))}")`
    )
    this.debug.files.set(sourcePath, file)
    return file
  }

  createDebugLocation(node) {
    if (!this.debug || !this.currentDebugScope || !node?.location) return

    const line = Math.max(1, node.location.line ?? 1)
    const column = Math.max(1, node.location.column ?? 1)
    return this.addDebugMetadata(
      this.debug,
      `!DILocation(line: ${line}, column: ${column}, scope: ${this.currentDebugScope})`
    )
  }

  createDebugVariable(name, type, location, { isParameter = false, argumentIndex = null } = {}) {
    if (!this.debug || !this.currentDebugScope || !location) return null

    const line = Math.max(1, location.line ?? 1)
    const typeMetadata = this.debugType(type)
    const argument = isParameter ? `arg: ${argumentIndex}, ` : ''
    return this.addDebugMetadata(
      this.debug,
      `!DILocalVariable(name: "${this.escapeDebugString(name)}", ${argument}scope: ${this.currentDebugScope}, file: ${this.currentDebugFile ?? this.debug.file}, line: ${line}, type: ${typeMetadata})`
    )
  }

  debugType(type) {
    if (!this.debug) return null

    const normalized = this.typeSystem.normalize(type)
    if (this.debug.types.has(normalized)) return this.debug.types.get(normalized)

    const primitive = {
      [LumenTypes.I32]: '!DIBasicType(name: "i32", size: 32, encoding: DW_ATE_signed)',
      [LumenTypes.I64]: '!DIBasicType(name: "i64", size: 64, encoding: DW_ATE_signed)',
      [LumenTypes.F32]: '!DIBasicType(name: "f32", size: 32, encoding: DW_ATE_float)',
      [LumenTypes.Bool]: '!DIBasicType(name: "bool", size: 1, encoding: DW_ATE_boolean)'
    }[normalized]

    if (primitive) {
      const metadata = this.addDebugMetadata(this.debug, primitive)
      this.debug.types.set(normalized, metadata)
      return metadata
    }

    const pointerType = this.addDebugMetadata(
      this.debug,
      `!DIDerivedType(tag: DW_TAG_pointer_type, name: "${this.escapeDebugString(normalized)}", baseType: null, size: 64)`
    )
    this.debug.types.set(normalized, pointerType)
    return pointerType
  }

  emitDebugDeclare(name, pointer, type, location, options = {}) {
    if (!this.debug || name.startsWith('.')) return

    const variable = this.createDebugVariable(name, type, location, options)
    if (!variable) return

    const dbg = this.createDebugLocation({ location })
    this.lines.push(`  call void @llvm.dbg.declare(metadata ptr ${pointer}, metadata ${variable}, metadata ${this.debug.expression})${dbg ? `, !dbg ${dbg}` : ''}`)
  }

  emitDebugMetadata() {
    if (!this.debug) return []

    return [
      '!llvm.dbg.cu = !{!2}',
      `!llvm.module.flags = !{${this.debug.dwarfVersion}, ${this.debug.debugInfoVersion}}`,
      ...this.debug.metadata
    ]
  }

  escapeDebugString(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  }
}

export const debugLowering = Object.getOwnPropertyDescriptors(DebugLowering.prototype)
delete debugLowering.constructor
