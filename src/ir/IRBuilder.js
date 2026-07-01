import {
  IRBasicBlock,
  IRFunction,
  IRInstruction,
  IRModule,
  IRTerminator,
  IRValue
} from './IR.js'
import { IRValidator } from './IRValidator.js'
import { LumenTypes } from '../semantics/TypeSystem.js'

export class IRBuilder {
  constructor({ validator = new IRValidator() } = {}) {
    this.validator = validator
  }

  build(program) {
    const structs = program.body
      .filter(node => node.kind === 'StructDeclaration')
      .map(node => ({
        name: node.name.name,
        location: cloneLocation(node.location),
        fields: node.fields.map(field => ({
          name: field.name,
          type: field.typeAnnotation.name,
          location: cloneLocation(field.location)
        }))
      }))
    const enums = program.body
      .filter(node => node.kind === 'EnumDeclaration')
      .map(node => ({
        name: node.name.name,
        location: cloneLocation(node.location),
        variants: node.variants.map((variant, index) => ({
          name: variant.name,
          value: index,
          location: cloneLocation(variant.location)
        }))
      }))
    const functions = program.body
      .filter(node => node.kind === 'FunctionDeclaration')
      .map(node => this.buildFunction(node))
    const externs = program.body
      .filter(node => node.kind === 'ExternFunctionDeclaration')
      .map(node => this.buildExtern(node))

    return this.validator.validate(new IRModule(
      functions,
      structs,
      enums,
      externs,
      cloneLocation(program.location)
    ))
  }

  buildFunction(node) {
    const entry = this.lowerBlock(node.body, 'entry')
    return new IRFunction(
      node.name.name,
      node.params.map(param => ({
        name: param.name,
        type: param.inferredType,
        location: cloneLocation(param.location)
      })),
      node.inferredType,
      [entry],
      entry.name,
      cloneLocation(node.location),
      node.isAsync
    )
  }

  buildExtern(node) {
    return new IRFunction(
      node.name.name,
      node.params.map(param => ({
        name: param.name,
        type: param.inferredType,
        location: cloneLocation(param.location)
      })),
      node.inferredType,
      [],
      null,
      cloneLocation(node.location)
    )
  }

  lowerBlock(node, name = 'block') {
    const statements = node?.kind === 'BlockStatement' ? node.body : node ? [node] : []
    const block = new IRBasicBlock(name, [], null, cloneLocation(node?.location))

    for (const statement of statements) {
      const instruction = this.lowerStatement(statement)
      if (instruction) block.instructions.push(instruction)
      if (statement.kind === 'ReturnStatement') {
        block.terminator = new IRTerminator(
          'return',
          { value: this.lowerExpression(statement.argument) },
          cloneLocation(statement.location)
        )
        break
      }
      if (statement.kind === 'ThrowStatement') {
        block.terminator = new IRTerminator(
          'throw',
          { value: this.lowerExpression(statement.argument) },
          cloneLocation(statement.location)
        )
        break
      }
      if (statement.kind === 'BreakStatement') {
        block.terminator = new IRTerminator('break', {}, cloneLocation(statement.location))
        break
      }
      if (statement.kind === 'ContinueStatement') {
        block.terminator = new IRTerminator('continue', {}, cloneLocation(statement.location))
        break
      }
    }

    block.terminator ??= new IRTerminator('fallthrough', {}, cloneLocation(node?.location))
    return block
  }

  lowerStatement(node) {
    const location = cloneLocation(node.location)

    if (node.kind === 'VariableDeclaration') {
      return new IRInstruction('declare', {
        declarationKind: node.declarationKind,
        declarations: node.declarations.map(declaration => ({
          name: declaration.id.name,
          type: declaration.inferredType,
          mutable: node.declarationKind === 'let',
          arrayLength: declaration.arrayLength ?? null,
          initializer: this.lowerExpression(declaration.initializer, declaration.inferredType),
          location: cloneLocation(declaration.location)
        }))
      }, location)
    }
    if (node.kind === 'ExpressionStatement') {
      return new IRInstruction('evaluate', {
        expression: this.lowerExpression(node.expression)
      }, location)
    }
    if (node.kind === 'DeferStatement') {
      return new IRInstruction('defer', {
        expression: this.lowerExpression(node.expression)
      }, location)
    }
    if (node.kind === 'ReturnStatement' || node.kind === 'ThrowStatement' ||
      node.kind === 'BreakStatement' || node.kind === 'ContinueStatement') {
      return null
    }
    if (node.kind === 'BlockStatement') {
      return new IRInstruction('block', {
        body: this.lowerBlock(node, 'block')
      }, location)
    }
    if (node.kind === 'IfStatement') {
      return new IRInstruction('if', {
        condition: this.lowerExpression(node.test),
        consequent: this.lowerBlock(node.consequent, 'if.then'),
        alternate: node.alternate ? this.lowerBlock(node.alternate, 'if.else') : null
      }, location)
    }
    if (node.kind === 'SwitchStatement') {
      return new IRInstruction('switch', {
        discriminant: this.lowerExpression(node.discriminant),
        cases: node.cases.map((item, index) => ({
          test: this.lowerExpression(item.test),
          body: this.lowerBlock(item.body, `switch.case.${index}`),
          location: cloneLocation(item.location)
        })),
        defaultCase: node.defaultCase
          ? this.lowerBlock(node.defaultCase, 'switch.default')
          : null
      }, location)
    }
    if (node.kind === 'ForStatement') {
      return new IRInstruction('for', {
        initializer: node.init?.kind === 'VariableDeclaration'
          ? this.lowerStatement(node.init)
          : this.lowerExpression(node.init),
        test: this.lowerExpression(node.test),
        update: this.lowerExpression(node.update),
        body: this.lowerBlock(node.body, 'for.body')
      }, location)
    }
    if (node.kind === 'ForOfStatement') {
      return new IRInstruction('forOf', {
        item: {
          name: node.item.name,
          type: node.item.inferredType,
          location: cloneLocation(node.item.location)
        },
        iterable: this.lowerExpression(node.iterable),
        body: this.lowerBlock(node.body, 'forof.body')
      }, location)
    }
    if (node.kind === 'ForRangeStatement') {
      return new IRInstruction('forRange', {
        item: {
          name: node.item.name,
          type: node.item.inferredType,
          location: cloneLocation(node.item.location)
        },
        start: this.lowerExpression(node.start),
        end: this.lowerExpression(node.end),
        body: this.lowerBlock(node.body, 'range.body')
      }, location)
    }
    if (node.kind === 'WhileStatement') {
      return new IRInstruction('while', {
        condition: this.lowerExpression(node.test),
        body: this.lowerBlock(node.body, 'while.body')
      }, location)
    }
    if (node.kind === 'DoUntilStatement') {
      return new IRInstruction('doUntil', {
        condition: this.lowerExpression(node.test),
        body: this.lowerBlock(node.body, 'do.body')
      }, location)
    }
    if (node.kind === 'TryCatchStatement') {
      return new IRInstruction('tryCatch', {
        tryBlock: this.lowerBlock(node.tryBlock, 'try.body'),
        catchParam: {
          name: node.catchParam.name,
          type: node.catchParam.inferredType,
          location: cloneLocation(node.catchParam.location)
        },
        catchBlock: this.lowerBlock(node.catchBlock, 'catch.body')
      }, location)
    }

    throw new Error(`IR builder does not support ${node.kind}`)
  }

  lowerExpression(expression, expectedType = null) {
    const node = expression?.kind === 'RawExpression' ? expression.parsed : expression
    if (!node) return null

    const location = cloneLocation(node.location)
    const inferredType = node.inferredType ?? inferFallbackType(node)
    const type = node.kind === 'ArrayExpression' &&
      node.elements.length === 0 &&
      expectedType
      ? expectedType
      : inferredType

    if (node.kind === 'LiteralExpression') {
      return new IRValue('constant', type, {
        value: node.token.literal,
        lexeme: node.token.lexeme,
        tokenType: node.token.type
      }, location)
    }
    if (node.kind === 'IdentifierExpression') {
      return new IRValue('reference', type, {
        name: node.name
      }, location)
    }
    if (node.kind === 'CallExpression') {
      return new IRValue('call', type, {
        callee: this.lowerExpression(node.callee),
        arguments: node.arguments.map(argument => this.lowerExpression(argument))
      }, location)
    }
    if (node.kind === 'MemberExpression') {
      return new IRValue('access', type, {
        object: this.lowerExpression(node.object),
        property: node.computed ? this.lowerExpression(node.property) : null,
        field: node.computed ? null : node.property.name,
        computed: node.computed
      }, location)
    }
    if (node.kind === 'AssignmentExpression') {
      return new IRValue('assign', type, {
        operator: node.operator,
        left: this.lowerExpression(node.left),
        right: this.lowerExpression(node.right)
      }, location)
    }
    if (node.kind === 'UpdateExpression') {
      return new IRValue('update', type, {
        operator: node.operator,
        argument: this.lowerExpression(node.argument),
        prefix: node.prefix
      }, location)
    }
    if (node.kind === 'UnaryExpression') {
      return new IRValue('unary', type, {
        operator: node.operator,
        argument: this.lowerExpression(node.argument)
      }, location)
    }
    if (node.kind === 'BinaryExpression') {
      return new IRValue('binary', type, {
        operator: node.operator,
        left: this.lowerExpression(node.left),
        right: this.lowerExpression(node.right)
      }, location)
    }
    if (node.kind === 'ArrayExpression') {
      return new IRValue('array', type, {
        elements: node.elements.map(element => this.lowerExpression(element))
      }, location)
    }
    if (node.kind === 'StructExpression') {
      return new IRValue('struct', type, {
        name: node.name,
        fields: node.fields.map(field => ({
          key: field.key,
          value: this.lowerExpression(field.value),
          location: cloneLocation(field.location)
        }))
      }, location)
    }
    if (node.kind === 'MatchExpression') {
      return new IRValue('match', type, {
        discriminant: this.lowerExpression(node.discriminant),
        arms: node.arms.map(arm => ({
          pattern: this.lowerExpression(arm.pattern),
          value: this.lowerExpression(arm.value),
          location: cloneLocation(arm.location)
        }))
      }, location)
    }
    if (node.kind === 'AwaitExpression') {
      return new IRValue('await', type, {
        argument: this.lowerExpression(node.argument)
      }, location)
    }
    if (node.kind === 'ArrowFunctionExpression') {
      return new IRValue('arrow', type, {
        params: node.params.map(param => ({
          name: param.name,
          type: param.inferredType ?? LumenTypes.Unknown,
          location: cloneLocation(param.location)
        })),
        body: this.lowerExpression(node.body)
      }, location)
    }
    if (node.kind === 'SliceExpression') {
      return new IRValue('slice', type, {
        start: this.lowerExpression(node.start),
        end: this.lowerExpression(node.end)
      }, location)
    }

    throw new Error(`IR builder does not support expression ${node.kind}`)
  }
}

function cloneLocation(location) {
  return location ? { ...location } : null
}

function inferFallbackType(node) {
  if (node.kind === 'LiteralExpression') {
    if (node.token.type === 'String') return LumenTypes.String
    if (node.token.lexeme === 'true' || node.token.lexeme === 'false') return LumenTypes.Bool
    if (node.token.lexeme === 'null') return LumenTypes.Unknown
    if (node.token.lexeme.includes('.')) return LumenTypes.F32
    return Math.abs(node.token.literal) > 2147483647 ? LumenTypes.I64 : LumenTypes.I32
  }
  if (node.kind === 'StructExpression') return node.name
  return LumenTypes.Unknown
}
