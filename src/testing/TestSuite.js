import { green } from '../cli/TerminalStyle.js'

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
      console.log(green(`ok ${name}`))
    } catch (error) {
      this.failures += 1
      console.error(`failed ${name}`)
      console.error(error?.stack ?? error)
    }
  }

  finish() {
    if (this.failures > 0) {
      console.error(`${this.failures} ${this.name} test failed`)
      process.exitCode = 1
      return
    }

    console.log(`${this.tests} ${this.name} tests passed`)
  }
}
