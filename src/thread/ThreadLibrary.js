export const ThreadFunctions = Object.freeze({
  CreateSemaphore: 'createSemaphore',
  SemaphoreWait: 'semaphoreWait',
  SemaphoreSignal: 'semaphoreSignal',
  StartThread: 'startThread',
  JoinThread: 'joinThread',
  AppendFile: 'appendFile'
})

export class ThreadLibrary {
  constructor() {
    this.functions = new Set(Object.values(ThreadFunctions))
  }

  has(name) {
    return this.functions.has(name)
  }
}
