import { Diagnostic } from '../diagnostics/Diagnostic.js'
import { LumenTypes } from '../semantics/TypeSystem.js'
import { SystemFunctions } from '../system/SystemLibrary.js'

class ControlFlowLowering {
  emitTryCatch(node) {
    const catchLabel = this.nextLabel('catch')
    const endLabel = this.nextLabel('try.end')
    const errorPointer = this.alloca(`.${node.catchParam.name}.error`, LumenTypes.String)

    this.tryStack.push({
      catchLabel,
      errorPointer
    })

    this.emitStatement(node.tryBlock)

    if (!this.hasTerminator()) {
      this.lines.push(`  br label %${endLabel}`)
    }

    this.tryStack.pop()
    this.lines.push(`${catchLabel}:`)

    this.pushScope()
    this.define(node.catchParam.name, {
      pointer: errorPointer,
      type: LumenTypes.String,
      length: null
    })
    this.emitStatement(node.catchBlock)
    this.popScope()

    if (!this.hasTerminator()) {
      this.lines.push(`  br label %${endLabel}`)
    }

    this.lines.push(`${endLabel}:`)
  }

  emitThrow(node) {
    const active = this.tryStack.at(-1)

    if (!active) {
      throw new Diagnostic('throw needs active try/catch', node.location, 'backend')
    }

    const value = this.emitExpression(node.value)

    if (value.type !== LumenTypes.String && value.type !== LumenTypes.Error) {
      throw new Diagnostic('throw expects string or error', node.location, 'backend')
    }

    this.lines.push(`  store ptr ${value.value}, ptr ${active.errorPointer}`)
    this.lines.push(`  br label %${active.catchLabel}`)
  }

  emitVariableDeclaration(node) {
    for (const declaration of node.declarations) {
      const type = declaration.type ?? LumenTypes.I32
      const pointer = this.alloca(declaration.name, type, {
        length: declaration.arrayLength,
        debugLocation: declaration.location ?? node.location
      })

      if (declaration.initializer) {
        if (declaration.initializer.op === 'array') {
          this.emitArrayInitializerNode(pointer, type, declaration.initializer)
          continue
        }

        if (declaration.initializer.op === 'struct') {
          this.emitStructInitializerNode(pointer, type, declaration.initializer)
          continue
        }

        const value = this.emitExpression(declaration.initializer)
        this.lines.push(`  store ${this.llvmType(type)} ${this.cast(value, type)}, ptr ${pointer}`)
      }
    }
  }

  emitReturn(node) {
    this.emitDeferred()

    if (!node.value) {
      this.lines.push('  ret void')
      return
    }

    const value = this.emitExpression(node.value)
    this.lines.push(`  ret ${this.llvmType(this.returnType)} ${this.cast(value, this.returnType)}`)
  }

  emitDefer(node) {
    this.deferStack.push(node.expression)
  }

  emitDeferred() {
    while (this.deferStack.length > 0) {
      this.emitExpression(this.deferStack.pop())
    }
  }

  emitBreak(node) {
    const breakLabel = this.breakStack.at(-1)
    if (!breakLabel) throw new Diagnostic('break needs active loop or switch', node.location, 'backend')
    this.lines.push(`  br label %${breakLabel}`)
  }

  emitContinue(node) {
    const loop = this.loopStack.at(-1)
    if (!loop) throw new Diagnostic('continue needs active loop', node.location, 'backend')
    this.lines.push(`  br label %${loop.continueLabel}`)
  }

  emitIf(node) {
    const selectedAssignment = this.emitSelectableIfAssignment(node)
    if (selectedAssignment) return selectedAssignment

    const thenLabel = this.nextLabel('if.then')
    const elseLabel = this.nextLabel('if.else')
    const endLabel = this.nextLabel('if.end')
    const condition = this.emitExpression(node.condition)

    this.lines.push(`  br i1 ${this.cast(condition, LumenTypes.Bool)}, label %${thenLabel}, label %${node.alternate ? elseLabel : endLabel}`)
    this.lines.push(`${thenLabel}:`)
    this.emitStatement(node.consequent)
    if (!this.hasTerminator()) this.lines.push(`  br label %${endLabel}`)

    if (node.alternate) {
      this.lines.push(`${elseLabel}:`)
      this.emitStatement(node.alternate)
      if (!this.hasTerminator()) this.lines.push(`  br label %${endLabel}`)
    }

    this.lines.push(`${endLabel}:`)
  }

  emitSelectableIfAssignment(node) {
    const assignment = this.selectableIfAssignment(node, {
      allowConditionRemainder: true
    })
    if (!assignment) return null

    const targetPointer = this.emitLValueNode(assignment.target)
    const value = this.emitSelectableIfValue(node, assignment.targetName)

    this.lines.push(`  store ${this.llvmType(targetPointer.type)} ${this.cast(value, targetPointer.type)}, ptr ${targetPointer.pointer}`)
    return {
      type: targetPointer.type,
      value: this.cast(value, targetPointer.type)
    }
  }

  emitSelectableIfValue(node, targetName) {
    const condition = this.emitExpression(node.condition)
    const consequent = this.emitSelectableBranchValue(node.consequent, targetName)
    const alternate = this.emitSelectableBranchValue(node.alternate, targetName)
    const type = this.typeSystem.widest(consequent.type, alternate.type)
    const selected = this.nextTemp()

    this.lines.push(`  ${selected} = select i1 ${this.cast(condition, LumenTypes.Bool)}, ${this.llvmType(type)} ${this.cast(consequent, type)}, ${this.llvmType(type)} ${this.cast(alternate, type)}`)
    return {
      type,
      value: selected
    }
  }

  emitSelectableBranchValue(branch, targetName) {
    const statement = this.singleBlockStatement(branch)
    if (statement.op === 'if') return this.emitSelectableIfValue(statement, targetName)

    return this.emitExpression(statement.expression.right)
  }

  selectableIfAssignment(node, { allowConditionRemainder = false } = {}) {
    if (!node.alternate || !this.isSideEffectFreeExpression(node.condition, { allowRemainder: allowConditionRemainder })) return null

    const consequent = this.selectableBranchAssignment(node.consequent)
    const alternate = this.selectableBranchAssignment(node.alternate)

    if (!consequent || !alternate) return null
    if (consequent.targetName !== alternate.targetName) return null

    return consequent
  }

  selectableBranchAssignment(branch) {
    const statement = this.singleBlockStatement(branch)
    if (!statement) return null

    if (statement.op === 'if') return this.selectableIfAssignment(statement)
    if (statement.op !== 'evaluate') return null

    const expression = statement.expression
    if (expression?.op !== 'assign' ||
      expression.left.op !== 'reference' ||
      !this.isSideEffectFreeExpression(expression.right)) return null

    return {
      targetName: expression.left.name,
      target: expression.left
    }
  }

  singleBlockStatement(statement) {
    if (!statement) return null
    if (statement.kind !== 'IRBasicBlock') return null
    if (statement.terminator.op !== 'fallthrough') return null
    return statement.instructions.length === 1 ? statement.instructions[0] : null
  }

  isSideEffectFreeExpression(expression, { allowRemainder = false } = {}) {
    if (!expression) return false
    if (expression.op === 'constant' || expression.op === 'reference') return true
    if (expression.op === 'unary') {
      return this.isSideEffectFreeExpression(expression.argument, { allowRemainder })
    }
    if (expression.op === 'binary') {
      if (expression.operator === '/' || (!allowRemainder && expression.operator === '%')) return false
      return this.isSideEffectFreeExpression(expression.left, { allowRemainder }) &&
        this.isSideEffectFreeExpression(expression.right, { allowRemainder })
    }
    if (expression.op === 'access') {
      return this.isSideEffectFreeExpression(expression.object, { allowRemainder }) &&
        (!expression.computed || this.isSideEffectFreeExpression(expression.property, { allowRemainder }))
    }
    return false
  }

  emitSwitch(node) {
    const endLabel = this.nextLabel('switch.end')
    const defaultLabel = node.defaultCase ? this.nextLabel('switch.default') : endLabel
    const testLabels = node.cases.map(() => this.nextLabel('switch.test'))
    const caseLabels = node.cases.map(() => this.nextLabel('switch.case'))
    const discriminant = this.emitExpression(node.discriminant)

    this.lines.push(`  br label %${testLabels[0] ?? defaultLabel}`)

    for (let index = 0; index < node.cases.length; index += 1) {
      const switchCase = node.cases[index]
      this.lines.push(`${testLabels[index]}:`)
      const caseValue = this.emitExpression(switchCase.test)
      const matches = this.emitEqualityComparison(discriminant, caseValue)
      const nextLabel = testLabels[index + 1] ?? defaultLabel
      this.lines.push(`  br i1 ${matches.value}, label %${caseLabels[index]}, label %${nextLabel}`)
      this.lines.push(`${caseLabels[index]}:`)
      this.breakStack.push(endLabel)
      this.emitStatement(switchCase.body)
      this.breakStack.pop()
      if (!this.hasTerminator()) this.lines.push(`  br label %${endLabel}`)
    }

    if (node.defaultCase) {
      this.lines.push(`${defaultLabel}:`)
      this.breakStack.push(endLabel)
      this.emitStatement(node.defaultCase)
      this.breakStack.pop()
      if (!this.hasTerminator()) this.lines.push(`  br label %${endLabel}`)
    }

    this.lines.push(`${endLabel}:`)
  }

  emitForRange(node) {
    this.pushScope()
    const itemPointer = this.alloca(node.item.name, LumenTypes.I32)
    const start = this.emitExpression(node.start)
    const end = this.emitExpression(node.end)
    const conditionLabel = this.nextLabel('range.cond')
    const bodyLabel = this.nextLabel('range.body')
    const updateLabel = this.nextLabel('range.update')
    const endLabel = this.nextLabel('range.end')

    this.lines.push(`  store i32 ${this.cast(start, LumenTypes.I32)}, ptr ${itemPointer}`)
    this.breakStack.push(endLabel)
    this.loopStack.push({
      breakLabel: endLabel,
      continueLabel: updateLabel
    })

    this.lines.push(`  br label %${conditionLabel}`)
    this.lines.push(`${conditionLabel}:`)
    const current = this.nextTemp()
    const inRange = this.nextTemp()
    this.lines.push(`  ${current} = load i32, ptr ${itemPointer}`)
    this.lines.push(`  ${inRange} = icmp slt i32 ${current}, ${this.cast(end, LumenTypes.I32)}`)
    this.lines.push(`  br i1 ${inRange}, label %${bodyLabel}, label %${endLabel}`)

    this.lines.push(`${bodyLabel}:`)
    this.emitStatement(node.body)
    if (!this.hasTerminator()) this.lines.push(`  br label %${updateLabel}`)

    this.lines.push(`${updateLabel}:`)
    const updateCurrent = this.nextTemp()
    const next = this.nextTemp()
    this.lines.push(`  ${updateCurrent} = load i32, ptr ${itemPointer}`)
    this.lines.push(`  ${next} = add i32 ${updateCurrent}, 1`)
    this.lines.push(`  store i32 ${next}, ptr ${itemPointer}`)
    this.lines.push(`  br label %${conditionLabel}`)

    this.lines.push(`${endLabel}:`)
    this.loopStack.pop()
    this.breakStack.pop()
    this.popScope()
  }

  emitFor(node) {
    this.pushScope()

    if (node.initializer?.kind === 'IRInstruction') {
      this.emitIRInstruction(node.initializer)
    } else if (node.initializer) {
      this.emitExpression(node.initializer)
    }

    const conditionLabel = this.nextLabel('for.cond')
    const bodyLabel = this.nextLabel('for.body')
    const updateLabel = this.nextLabel('for.update')
    const endLabel = this.nextLabel('for.end')
    this.breakStack.push(endLabel)
    this.loopStack.push({
      breakLabel: endLabel,
      continueLabel: updateLabel
    })

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
    this.loopStack.pop()
    this.breakStack.pop()
    this.popScope()
  }

  emitWhile(node) {
    const conditionLabel = this.nextLabel('while.cond')
    const bodyLabel = this.nextLabel('while.body')
    const endLabel = this.nextLabel('while.end')
    this.breakStack.push(endLabel)
    this.loopStack.push({
      breakLabel: endLabel,
      continueLabel: conditionLabel
    })

    this.lines.push(`  br label %${conditionLabel}`)
    this.lines.push(`${conditionLabel}:`)

    const condition = this.emitExpression(node.condition)
    this.lines.push(`  br i1 ${this.cast(condition, LumenTypes.Bool)}, label %${bodyLabel}, label %${endLabel}`)

    this.lines.push(`${bodyLabel}:`)
    this.emitStatement(node.body)
    if (!this.hasTerminator()) this.lines.push(`  br label %${conditionLabel}`)

    this.lines.push(`${endLabel}:`)
    this.loopStack.pop()
    this.breakStack.pop()
  }

  emitDoUntil(node) {
    const bodyLabel = this.nextLabel('do.body')
    const conditionLabel = this.nextLabel('do.cond')
    const endLabel = this.nextLabel('do.end')
    this.breakStack.push(endLabel)
    this.loopStack.push({
      breakLabel: endLabel,
      continueLabel: conditionLabel
    })

    this.lines.push(`  br label %${bodyLabel}`)
    this.lines.push(`${bodyLabel}:`)

    this.emitStatement(node.body)
    if (!this.hasTerminator()) this.lines.push(`  br label %${conditionLabel}`)

    this.lines.push(`${conditionLabel}:`)
    const condition = this.emitExpression(node.condition)
    this.lines.push(`  br i1 ${this.cast(condition, LumenTypes.Bool)}, label %${endLabel}, label %${bodyLabel}`)

    this.lines.push(`${endLabel}:`)
    this.loopStack.pop()
    this.breakStack.pop()
  }

  emitForOf(node) {
    const iterableNode = node.iterable
    if (iterableNode?.op === 'call' &&
      iterableNode.callee.op === 'reference' &&
      iterableNode.callee.name === SystemFunctions.Filter) {
      return this.emitFilteredForOf(node)
    }

    if (iterableNode?.op !== 'reference') {
      throw new Diagnostic('for-of iterable must be an array variable', node.iterable.location, 'backend')
    }
    const iterableName = iterableNode.name
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
    this.breakStack.push(endLabel)
    this.loopStack.push({
      breakLabel: endLabel,
      continueLabel: updateLabel
    })

    this.lines.push(`  store i32 0, ptr ${indexPointer}`)
    this.lines.push(`  br label %${conditionLabel}`)
    this.lines.push(`${conditionLabel}:`)

    const currentIndex = this.nextTemp()
    const condition = this.nextTemp()
    this.lines.push(`  ${currentIndex} = load i32, ptr ${indexPointer}`)
    this.lines.push(`  ${condition} = icmp slt i32 ${currentIndex}, ${iterable.length}`)
    this.lines.push(`  br i1 ${condition}, label %${bodyLabel}, label %${endLabel}`)
    this.lines.push(`${bodyLabel}:`)

    const checkedIndex = this.emitBoundsCheck(currentIndex, iterable.length)
    const elementPointer = this.nextTemp()
    const elementValue = this.nextTemp()
    this.lines.push(`  ${elementPointer} = getelementptr inbounds ${this.typeSystem.llvmArray(iterable.type, iterable.length)}, ptr ${iterable.pointer}, i32 0, i32 ${checkedIndex}`)
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
    this.loopStack.pop()
    this.breakStack.pop()
  }

  emitFilteredForOf(node) {
    const call = node.iterable
    const collection = call.arguments[0]
    const predicate = call.arguments[1]
    if (collection?.op !== 'reference' ||
      predicate?.op !== 'arrow' ||
      predicate.params.length !== 1) {
      throw new Diagnostic('filter expects array and predicate', node.iterable.location, 'backend')
    }

    const iterableName = collection.name
    const iterable = this.resolve(iterableName)

    if (!this.typeSystem.isArray(iterable.type) || iterable.length === null) {
      throw new Diagnostic('filter needs fixed array', node.location, 'backend')
    }

    const elementType = this.typeSystem.elementType(iterable.type)
    const indexPointer = this.alloca(`.${node.item.name}.index`, LumenTypes.I32)
    const itemPointer = this.alloca(node.item.name, elementType)
    this.define(predicate.params[0].name, {
      pointer: itemPointer,
      type: elementType,
      length: null
    })
    const conditionLabel = this.nextLabel('filter.cond')
    const predicateLabel = this.nextLabel('filter.pred')
    const bodyLabel = this.nextLabel('filter.body')
    const updateLabel = this.nextLabel('filter.update')
    const endLabel = this.nextLabel('filter.end')
    this.breakStack.push(endLabel)
    this.loopStack.push({
      breakLabel: endLabel,
      continueLabel: updateLabel
    })

    this.lines.push(`  store i32 0, ptr ${indexPointer}`)
    this.lines.push(`  br label %${conditionLabel}`)
    this.lines.push(`${conditionLabel}:`)

    const currentIndex = this.nextTemp()
    const condition = this.nextTemp()
    this.lines.push(`  ${currentIndex} = load i32, ptr ${indexPointer}`)
    this.lines.push(`  ${condition} = icmp slt i32 ${currentIndex}, ${iterable.length}`)
    this.lines.push(`  br i1 ${condition}, label %${predicateLabel}, label %${endLabel}`)
    this.lines.push(`${predicateLabel}:`)

    const checkedIndex = this.emitBoundsCheck(currentIndex, iterable.length)
    const elementPointer = this.nextTemp()
    const elementValue = this.nextTemp()
    this.lines.push(`  ${elementPointer} = getelementptr inbounds ${this.typeSystem.llvmArray(iterable.type, iterable.length)}, ptr ${iterable.pointer}, i32 0, i32 ${checkedIndex}`)
    this.lines.push(`  ${elementValue} = load ${this.llvmType(elementType)}, ptr ${elementPointer}`)
    this.lines.push(`  store ${this.llvmType(elementType)} ${elementValue}, ptr ${itemPointer}`)

    const passes = this.emitExpression(predicate.body)
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
    this.loopStack.pop()
    this.breakStack.pop()
  }
}

export const controlFlowLowering = Object.getOwnPropertyDescriptors(ControlFlowLowering.prototype)
delete controlFlowLowering.constructor
