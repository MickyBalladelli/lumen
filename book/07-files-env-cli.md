# Files, Environment, And CLI

## Files

Read a file:

```lumen
let text = readFile("examples/data.txt")
println(text)
```

`readFile(...)` returns a string. Missing files currently return an empty
string.

Write a file:

```lumen
writeFile("build/report.txt", "done")
```

`writeFile(path, content)` writes text and returns `0` on success.

Append a file:

```lumen
appendFile("build/log.txt", "line one\n")
```

## Environment

Read an environment variable:

```lumen
let value = env("DATABASE_URL")
println(value)
```

If the variable is not in the process environment, Lumen also checks a `.env`
file in the current directory. Real process environment values win over `.env`
values.

`.env` files support simple dotenv-style entries:

```text
DATABASE_URL=postgres://localhost/lumen
export API_KEY="dev-key"
```

## CLI Args

```lumen
println(arg(0))
println(argCount())
```

`arg(0)` is the program name. User arguments start at `arg(1)`.

Example: `lmsh examples/cli-args.lm first second` makes `arg(1)` return
`"first"`.

## Process Execution

`exec(command)` runs a shell command and returns its process exit code. This is
used by the bootstrap compiler to call `clang`:

```lumen
let code = exec("clang build/out.ll -o build/app")
```

## Compile From Config

Create a `lumen.json`:

```json
{
  "entry": "main.lm",
  "output": "build/app"
}
```

Then compile with:

```bash
npm run compile
```

## Threads

The thread library can create a semaphore and run worker functions:

```lumen
function writeLine(path: string, message: string, semaphore: semaphore): void {
  semaphoreWait(semaphore)
  appendFile(path, message)
  semaphoreSignal(semaphore)
}

let semaphore = createSemaphore(1)
let one = startThread(writeLine, "build/thread-output.txt", "thread one", semaphore)
let two = startThread(writeLine, "build/thread-output.txt", "thread two", semaphore)
let three = startThread(writeLine, "build/thread-output.txt", "thread three", semaphore)

joinThread(one)
joinThread(two)
joinThread(three)
```

- `createSemaphore(1)` allows one thread into the critical section at a time
- `startThread(...)` starts a native thread with the worker function and arguments
- `joinThread(...)` waits for it to finish

## Missing

- File errors need better typed behavior (empty string sentinel can be mistaken
  for valid empty content)
- Directory helpers are thin
- CLI parsing package can grow flags and subcommands
- Need docs for path handling across platforms
- `arg`/`argCount` return empty or zero on Linux (currently macOS-only)
- Process execution uses shell concatenation, not argument arrays