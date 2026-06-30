import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes, TypeSystem } from '../semantics/TypeSystem.js'

const INSTRUCTION_OPS = new Set([
  'declare',
  'evaluate',
  'defer',
  'block',
  'if',
  'switch',
  'for',
  'forOf',
  'forRange',
  'while',
  'doUntil',
  'tryCatch'
])
const TERMINATOR_OPS = new Set(['fallthrough', 'return', 'throw', 'break', 'continue'])
const VALUE_OPS = new Set([
  'constant',
  'reference',
  'call',
  'access',
  'assign',
  'update',
  'unary',
  'binary',
  'array',
  'struct',
  'match',
  'await',
  'arrow',
  'slice'
])

export class IRValidator {
  validate(module) {
    if (module?.kind !== 'IRModule') this.fail('Expected IRModule')
    this.typeSystem = new TypeSystem()
    for (const struct of module.structs) this.typeSystem.registerStruct(struct.name, struct.fields)
    for (const enumType of module.enums) this.typeSystem.registerEnum(enumType.name, enumType.variants)

    const functions = new Set()
    for (const func of [...module.functions, ...module.externs]) {
      if (functions.has(func.name)) this.fail(`Duplicate IR function ${func.name}`, func.location)
      functions.add(func.name)
      this.validateFunction(func, module.externs.includes(func))
    }
    return module
  }

  validateFunction(func, external) {
    if (func.kind !== 'IRFunction') this.fail('Expected IRFunction', func.location)
    if (!func.name || !func.returnType) this.fail('IR function needs name and return type', func.location)
    this.validateType(func.returnType, func.location)

    const params = new Set()
    for (const param of func.params) {
      if (!param.name || params.has(param.name)) {
        this.fail(`Duplicate or missing IR parameter ${param.name ?? ''}`.trim(), param.location)
      }
      params.add(param.name)
      this.validateType(param.type, param.location)
    }

    const blockNames = new Set()
    for (const block of func.blocks) {
      if (blockNames.has(block.name)) this.fail(`Duplicate IR block ${block.name}`, block.location)
      blockNames.add(block.name)
      this.validateBlock(block, func)
    }

    if (!external && !blockNames.has(func.entry)) {
      this.fail(`IR function ${func.name} has no entry block`, func.location)
    }
    if (external && func.blocks.length !== 0) {
      this.fail(`Extern IR function ${func.name} cannot have blocks`, func.location)
    }
  }

  validateBlock(block, func) {
    if (block.kind !== 'IRBasicBlock') this.fail('Expected IRBasicBlock', block.location)
    if (!block.name) this.fail('IR block needs name', block.location)
    if (!block.terminator) this.fail(`IR block ${block.name} has no terminator`, block.location)

    for (const instruction of block.instructions) {
      if (instruction.kind !== 'IRInstruction' || !INSTRUCTION_OPS.has(instruction.op)) {
        this.fail(`Invalid instruction in ${block.name}`, instruction.location)
      }
      this.validateInstruction(instruction, func)
    }
    if (block.terminator.kind !== 'IRTerminator' || !TERMINATOR_OPS.has(block.terminator.op)) {
      this.fail(`Invalid terminator in ${block.name}`, block.terminator.location)
    }
    if (block.terminator.op === 'return') {
      if (func.returnType === LumenTypes.Void && block.terminator.value) {
        this.fail('Void IR function cannot return a value', block.terminator.location)
      }
      if (func.returnType !== LumenTypes.Void && !block.terminator.value) {
        this.fail(`IR function ${func.name} must return ${func.returnType}`, block.terminator.location)
      }
      if (block.terminator.value) {
        this.validateValue(block.terminator.value)
        if (!this.typeSystem.canAssign(block.terminator.value.type, func.returnType)) {
          this.fail(`Cannot return IR value ${block.terminator.value.type} as ${func.returnType}`, block.terminator.location)
        }
      }
    } else if (block.terminator.op === 'throw') {
      if (!block.terminator.value) this.fail('IR throw needs value', block.terminator.location)
      this.validateValue(block.terminator.value)
    } else if (block.terminator.value) {
      this.fail(`IR ${block.terminator.op} cannot carry value`, block.terminator.location)
    }
  }

  validateInstruction(instruction, func) {
    if (instruction.op === 'declare') {
      if (!Array.isArray(instruction.declarations) || instruction.declarations.length === 0) {
        this.fail('IR declare needs declarations', instruction.location)
      }
      for (const declaration of instruction.declarations) {
        if (!declaration.name) this.fail('IR declaration needs name', declaration.location)
        this.validateType(declaration.type, declaration.location)
        if (declaration.initializer) {
          this.validateValue(declaration.initializer)
          if (!this.typeSystem.canAssign(declaration.initializer.type, declaration.type)) {
            this.fail(`Cannot initialize IR ${declaration.name} with ${declaration.initializer.type}`, declaration.location)
          }
        }
      }
    }
    if (instruction.value) this.validateValue(instruction.value)
    if (instruction.expression) this.validateValue(instruction.expression)
    if (instruction.condition) this.validateValue(instruction.condition)
    if (instruction.discriminant) this.validateValue(instruction.discriminant)
    if (instruction.initializer?.kind === 'IRInstruction') {
      this.validateInstruction(instruction.initializer, func)
    } else if (instruction.initializer) {
      this.validateValue(instruction.initializer)
    }
    if (instruction.start) this.validateValue(instruction.start)
    if (instruction.end) this.validateValue(instruction.end)
    if (instruction.test) this.validateValue(instruction.test)
    if (instruction.update) this.validateValue(instruction.update)
    if (instruction.iterable) this.validateValue(instruction.iterable)

    if (instruction.op === 'evaluate' || instruction.op === 'defer') {
      if (!instruction.expression) this.fail(`IR ${instruction.op} needs expression`, instruction.location)
    }
    if (instruction.op === 'block' && !instruction.body) {
      this.fail('IR block instruction needs body', instruction.location)
    }
    if (instruction.op === 'if' || instruction.op === 'while' || instruction.op === 'doUntil') {
      if (!instruction.condition || instruction.condition.type !== LumenTypes.Bool) {
        this.fail(`IR ${instruction.op} needs bool condition`, instruction.location)
      }
      const body = instruction.op === 'if' ? instruction.consequent : instruction.body
      if (!body) this.fail(`IR ${instruction.op} needs body`, instruction.location)
    }
    if (instruction.op === 'switch') {
      if (!instruction.discriminant || !Array.isArray(instruction.cases)) {
        this.fail('IR switch needs discriminant and cases', instruction.location)
      }
      for (const item of instruction.cases) {
        if (!item.test || !item.body) this.fail('IR switch case needs test and body', item.location)
      }
    }
    if (instruction.op === 'for' && !instruction.body) {
      this.fail('IR for needs body', instruction.location)
    }
    if (instruction.op === 'forOf') {
      this.validateBinding(instruction.item, instruction.location)
      if (!instruction.iterable || !instruction.body) {
        this.fail('IR forOf needs iterable and body', instruction.location)
      }
    }
    if (instruction.op === 'forRange') {
      this.validateBinding(instruction.item, instruction.location)
      if (!instruction.start || !instruction.end || !instruction.body) {
        this.fail('IR forRange needs bounds and body', instruction.location)
      }
    }
    if (instruction.op === 'tryCatch') {
      this.validateBinding(instruction.catchParam, instruction.location)
      if (!instruction.tryBlock || !instruction.catchBlock) {
        this.fail('IR tryCatch needs try and catch blocks', instruction.location)
      }
    }

    for (const block of nestedBlocks(instruction)) {
      this.validateBlock(block, func)
    }
  }

  validateValue(value) {
    if (!value || value.kind !== 'IRValue' || !VALUE_OPS.has(value.op) || !value.type) {
      this.fail('Invalid typed IR value', value?.location)
    }
    this.validateType(value.type, value.location)
    this.validateValueShape(value)

    for (const child of valueChildren(value)) this.validateValue(child)

    if (value.op === 'assign') {
      if (!['reference', 'access'].includes(value.left?.op)) {
        this.fail('IR assignment needs assignable target', value.location)
      }
      if (!this.typeSystem.canAssign(value.right.type, value.left.type) || value.type !== value.left.type) {
        this.fail('IR assignment types do not match', value.location)
      }
    }
    if (value.op === 'update' && value.type !== value.argument.type) {
      this.fail('IR update type does not match target', value.location)
    }
    if (value.op === 'array' && this.typeSystem.isArray(value.type)) {
      const elementType = this.typeSystem.elementType(value.type)
      if (value.elements.some(element => !this.typeSystem.canAssign(element.type, elementType))) {
        this.fail(`IR array contains value outside ${elementType}`, value.location)
      }
    }
  }

  validateType(type, location) {
    if (typeof type !== 'string' || !this.typeSystem.assertKnown(type)) {
      this.fail(`Unknown IR type ${type ?? ''}`.trim(), location)
    }
  }

  validateBinding(binding, location) {
    if (!binding?.name || !binding.type) this.fail('IR binding needs name and type', binding?.location ?? location)
    this.validateType(binding.type, binding.location ?? location)
  }

  validateValueShape(value) {
    const required = {
      reference: ['name'],
      call: ['callee', 'arguments'],
      access: ['object'],
      assign: ['left', 'right', 'operator'],
      update: ['argument', 'operator'],
      unary: ['argument', 'operator'],
      binary: ['left', 'right', 'operator'],
      array: ['elements'],
      struct: ['name', 'fields'],
      match: ['discriminant', 'arms'],
      await: ['argument'],
      arrow: ['params', 'body'],
      slice: ['start', 'end']
    }[value.op] ?? []

    for (const field of required) {
      if (value[field] === null || value[field] === undefined || value[field] === '') {
        this.fail(`IR ${value.op} needs ${field}`, value.location)
      }
    }
    if (value.op === 'access' && value.computed && !value.property) {
      this.fail('IR computed access needs property', value.location)
    }
    if (value.op === 'access' && !value.computed && !value.field) {
      this.fail('IR field access needs field', value.location)
    }
    if (value.op === 'call' && !Array.isArray(value.arguments)) {
      this.fail('IR call arguments must be array', value.location)
    }
    if (value.op === 'array' && !Array.isArray(value.elements)) {
      this.fail('IR array elements must be array', value.location)
    }
    if (value.op === 'struct' && !Array.isArray(value.fields)) {
      this.fail('IR struct fields must be array', value.location)
    }
    if (value.op === 'match' && !Array.isArray(value.arms)) {
      this.fail('IR match arms must be array', value.location)
    }
  }

  fail(message, location = null) {
    throw new Diagnostic(message, location, 'ir')
  }
}

function nestedBlocks(instruction) {
  return [
    instruction.body,
    instruction.consequent,
    instruction.alternate,
    instruction.tryBlock,
    instruction.catchBlock,
    instruction.defaultCase,
    ...(instruction.cases ?? []).map(item => item.body)
  ].filter(Boolean)
}

function valueChildren(value) {
  return [
    value.argument,
    value.left,
    value.right,
    value.object,
    value.property,
    value.start,
    value.end,
    value.discriminant,
    value.body,
    ...(value.arguments ?? []),
    ...(value.elements ?? []),
    ...(value.fields ?? []).map(field => field.value),
    ...(value.arms ?? []).flatMap(arm => [arm.pattern, arm.value])
  ].filter(Boolean)
}
