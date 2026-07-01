# Files, Environment, And CLI

This chapter covers file I/O, environment variables, command-line arguments,
process execution, the `lumen.json` config file, and native threads.

## File System

The file system functions are in the `fs` module (`readFile`, `writeFile`) and
the `thread` module (`appendFile`).

### Reading Files

```lumen
let text = readFile("examples/data.txt")
if isOk(text) {
  println(resultValue(text))
}
```

`readFile(path)` returns `Result<string>`. Empty files produce `ok("")`;
missing or unreadable files produce an error.

The path is relative to the current working directory (where you run the
program). Absolute paths work too.

### Writing Files

```lumen
writeFile("build/report.txt", "done")
```

`writeFile(path, content)` creates or overwrites a file and returns
`Result<i32>`.

### Appending To Files

```lumen
appendFile("build/log.txt", "line one\n")
```

`appendFile(path, content)` appends text and returns `Result<i32>`.

### File Limitations

- **No binary I/O** — all file operations work with strings. There is no byte
  buffer type.
- **No directory listing** — there is no helper to list files in a directory.
- **No file metadata** — no stat, size, or modification time helpers.
- **No streaming** — `readFile` loads the entire file into memory.

## Environment Variables

### Reading Variables

```lumen
let url = env("DATABASE_URL")
if isOk(url) {
  println(resultValue(url))
}
```

`env(name)` returns `Result<string>`. If the variable is not in the process
environment, Lumen checks for a `.env` file.

### .env File Support

Create a `.env` file with simple key-value entries:

```text
DATABASE_URL=postgres://localhost/lumen
export API_KEY="dev-key"
PORT=3000
```

Supported formats:
- `KEY=value` — simple assignment
- `export KEY=value` — export-style assignment
- `KEY="value"` — double-quoted values (quotes are stripped)

**Precedence**: Process environment variables win over `.env` file values. If
`DATABASE_URL` is already set in the shell, `env("DATABASE_URL")` returns the
shell value, not the `.env` value.

### Limitations

- Only the current directory is checked for `.env`. There is no upward
  traversal.
- Values are always returned as strings, even if they look like numbers.
- No validation of `.env` syntax beyond key-value parsing.

## Command-Line Arguments

```lumen
let first = arg(1)
if isOk(first) {
  println(resultValue(first))
}
```

`arg(index)` returns `Result<string>`. `argCount()` returns `Result<i32>`.

Example — create `echo.lm`:

```lumen
function main(): i32 {
  let countResult = argCount()
  if !isOk(countResult) {
    return 1
  }
  let count = resultValue(countResult)
  let i: i32 = 1

  while i < count do {
    let value = arg(i)
    if isOk(value) {
      println(resultValue(value))
    }
    i++
  }

  return 0
}
```

Run it:

```bash
lmsh echo.lm hello world
```

Output:
```text
hello
world
```

### Limitations

- Arguments are strings. There is no type conversion or flag parsing built in.

## Process Execution

```lumen
let arguments: string[] = ["build/out.ll", "-o", "build/app"]
let code = exec("clang", arguments)
```

`exec(program, arguments)` launches a child process directly and returns
`Result<i32>`. No shell parses the program or arguments.

### How It's Used

The JavaScript compiler driver invokes `clang` with an argument array. The
self-host compiler reads and writes exact paths without constructing commands.

```lumen
let arguments: string[] = [
  "build/out.ll",
  "src/runtime/system.c",
  "src/runtime/fs.c",
  "-pthread",
  "-o",
  "build/app"
]
let code = exec("clang", arguments)
if !isOk(code) || resultValue(code) != 0 {
  println("link failed")
  return 1
}
```

### Limitations

- There is no timeout, no output capture, and no signal handling.
- The process blocks until the command completes.

## Compiling From lumen.json

Create a `lumen.json` config file in your project root:

```json
{
  "entry": "main.lm",
  "output": "build/app"
}
```

Then compile without any arguments:

```bash
npm run compile
```

The compiler reads `lumen.json`, compiles the entry file, and writes the native
executable. This is the simplest way to configure a project that should compile
the same way every time.

The self-host compiler currently supports `entry` and `output` keys. Other
config keys exist in the JS compiler options but are not yet exposed through
the self-host path.

## Native Threads

Lumen supports native OS threads with semaphore-guarded critical sections.

### The Full Pattern

```lumen
function writeLine(path: string, message: string, semaphore: semaphore): void {
  semaphoreWait(semaphore)
  appendFile(path, message)
  semaphoreSignal(semaphore)
}

function main(): i32 {
  let semaphoreResult = createSemaphore(1)
  if !isOk(semaphoreResult) {
    return 1
  }
  let semaphore = resultValue(semaphoreResult)

  let one = startThread(writeLine, "build/output.txt", "thread one\n", semaphore)
  if isOk(one) {
    joinThread(resultValue(one))
  }

  return 0
}
```

### Thread Functions

| Function | Description |
| --- | --- |
| `createSemaphore(count)` | Creates a semaphore with an initial count. `createSemaphore(1)` creates a mutex-like semaphore (one thread at a time). |
| `semaphoreWait(semaphore)` | Acquires the semaphore, blocking if the count is 0. Decrements the count. |
| `semaphoreSignal(semaphore)` | Releases the semaphore, incrementing the count. Wakes a waiting thread if any. |
| `startThread(func, ...args)` | Returns `Result<thread>`. |
| `joinThread(handle)` | Waits for the thread to finish. Must be called for every started thread. |

### How Threads Work

All thread operations return `Result<T>`.

1. **Create a semaphore** — `createSemaphore(1)` acts as a mutex, allowing one
   thread into the critical section at a time.
2. **Start threads** — `startThread` spawns a native OS thread. Each thread
   runs the worker function with the provided arguments.
3. **Critical section** — inside the worker, `semaphoreWait` acquires the lock,
   the thread does its work (e.g., writes to a file), and `semaphoreSignal`
   releases the lock.
4. **Join threads** — `joinThread` waits for a thread to finish. The main thread
   should join all started threads before exiting.

### Semaphore Internals

A semaphore with count `N` allows up to `N` threads into the critical section
simultaneously. With count `1`, it behaves like a mutex — exactly one thread
at a time.

The pattern:
```
semaphoreWait(semaphore)   // lock
  ... critical section ...
semaphoreSignal(semaphore) // unlock
```

### Limitations

- Threads and async tasks run native OS threads; there are no green threads.
- Each async call creates one eager task thread. `await` blocks its caller.
- Task cancellation is cooperative once task code has started.
- Functions passed to `startThread` must match the parameter types exactly.
- There is no thread-local storage or thread naming.
- Threads are created with default OS scheduling — no priority control.
- Channels (`send`/`receive`) provide message passing but are string-only.

## Missing

- **Directory helpers** — no `listDir`, `createDir`, `removeFile`, or `stat`.
- **Binary I/O** — all file operations are text-only.
- **CLI parsing** — no built-in flag or subcommand parser. The `cli` package
  exists but is basic.
- **Process spawn** — no output capture or timeout.
- **Thread lifecycle** — explicit `thread` handles have no detach or
  cancellation; `Task<T>` has cooperative cancellation and await errors.
- **Path portability** — no path manipulation helpers beyond the `path` package
  (which is experimental).
