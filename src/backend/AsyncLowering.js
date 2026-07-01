import { LumenTypes } from '../semantics/TypeSystem.js'

class AsyncLowering {
  emitAsyncContextType(func) {
    const fields = func.params.map(param => this.llvmType(param.type)).join(', ')
    return `${this.asyncContextType(func)} = type { ${fields} }`
  }

  emitAsyncFunction(func) {
    this.usesTask = true
    return [
      ...this.emitAsyncWrapper(func),
      ...this.emitAsyncWorker(func),
      ...this.emitFunctionBody(func, `${func.name}.async.body`, 'private ')
    ]
  }

  emitAsyncWrapper(func) {
    const contextType = this.asyncContextType(func)
    const params = func.params
      .map(param => `${this.llvmType(param.type)} %${param.name}`)
      .join(', ')
    const lines = [
      `define ptr @${func.name}(${params}) {`,
      'entry:',
      `  %context.size.ptr = getelementptr ${contextType}, ptr null, i32 1`,
      '  %context.size = ptrtoint ptr %context.size.ptr to i64',
      '  %context = call ptr @lumen_task_context_alloc(i64 %context.size)'
    ]

    for (const [index, param] of func.params.entries()) {
      lines.push(`  %param.${index}.ptr = getelementptr inbounds ${contextType}, ptr %context, i32 0, i32 ${index}`)
      lines.push(`  store ${this.llvmType(param.type)} %${param.name}, ptr %param.${index}.ptr`)
    }

    lines.push(`  %task = call ptr @lumen_task_start(ptr @${func.name}.async.worker, ptr %context)`)
    lines.push('  ret ptr %task')
    lines.push('}')
    return lines
  }

  emitAsyncWorker(func) {
    const contextType = this.asyncContextType(func)
    const lines = [
      `define private ptr @${func.name}.async.worker(ptr %context) {`,
      'entry:'
    ]
    const callArguments = []

    for (const [index, param] of func.params.entries()) {
      const llvmType = this.llvmType(param.type)
      lines.push(`  %param.${index}.ptr = getelementptr inbounds ${contextType}, ptr %context, i32 0, i32 ${index}`)
      lines.push(`  %param.${index} = load ${llvmType}, ptr %param.${index}.ptr`)
      callArguments.push(`${llvmType} %param.${index}`)
    }

    if (func.returnType === LumenTypes.Void) {
      lines.push(`  call void @${func.name}.async.body(${callArguments.join(', ')})`)
      lines.push('  ret ptr null')
      lines.push('}')
      return lines
    }

    const llvmType = this.llvmType(func.returnType)
    lines.push(`  %value = call ${llvmType} @${func.name}.async.body(${callArguments.join(', ')})`)
    lines.push(`  %result.size.ptr = getelementptr ${llvmType}, ptr null, i32 1`)
    lines.push('  %result.size = ptrtoint ptr %result.size.ptr to i64')
    lines.push('  %result = call ptr @lumen_task_result_alloc(i64 %result.size)')
    lines.push(`  store ${llvmType} %value, ptr %result`)
    lines.push('  ret ptr %result')
    lines.push('}')
    return lines
  }

  emitAwaitNode(node) {
    this.usesTask = true
    const task = this.emitExpression(node.argument)
    const result = this.nextTemp()
    const error = this.nextTemp()
    const failed = this.nextTemp()
    const errorLabel = this.nextLabel('await.error')
    const readyLabel = this.nextLabel('await.ready')

    this.lines.push(`  ${result} = call ptr @lumen_task_await(ptr ${task.value})`)
    this.lines.push(`  ${error} = call ptr @lumen_task_error(ptr ${task.value})`)
    this.lines.push(`  ${failed} = icmp ne ptr ${error}, null`)
    this.lines.push(`  br i1 ${failed}, label %${errorLabel}, label %${readyLabel}`)
    this.lines.push(`${errorLabel}:`)

    const active = this.tryStack.at(-1)
    if (active) {
      this.lines.push(`  store ptr ${error}, ptr ${active.errorPointer}`)
      this.lines.push(`  br label %${active.catchLabel}`)
    } else {
      this.lines.push(`  call void @lumen_task_panic(ptr ${error})`)
      this.lines.push('  unreachable')
    }

    this.lines.push(`${readyLabel}:`)
    if (node.type === LumenTypes.Void) return { type: LumenTypes.Void, value: '' }

    const value = this.nextTemp()
    this.lines.push(`  ${value} = load ${this.llvmType(node.type)}, ptr ${result}`)
    return { type: node.type, value }
  }

  asyncContextType(func) {
    return `%lumen.async.${func.name}.context`
  }
}

export const asyncLowering = Object.getOwnPropertyDescriptors(AsyncLowering.prototype)
