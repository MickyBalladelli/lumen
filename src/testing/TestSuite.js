import { fail, pass } from './TestReporter.js'

export class TestSuite {
  constructor(name) {
    this.name = name
    this.failures = 0
    this.tests = 0
  }

  async test(name, callback) {
    this.tests += 1

    try {
      await callback()
      console.log(pass(name))
    } catch (error) {
      this.failures += 1
      console.error(fail(name))
      console.error(error?.stack ?? error)
    }
  }

  finish() {
    if (this.failures > 0) {
      console.error(fail(`${this.failures}/${this.tests} ${this.name} tests failed`))
      process.exitCode = 1
      return
    }

    console.log(pass(`${this.tests}/${this.tests} ${this.name} tests passed`))
  }
}
