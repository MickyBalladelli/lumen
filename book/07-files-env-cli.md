# Files, Environment, And CLI

This chapter covers file I/O, environment variables, command-line arguments,
process execution, the `lumen.json` config file, and native threads.

## File System

The file system functions are in the `fs` module (`readFile`, `writeFile`) and
the `thread` module (`appendFile`).

### Reading Files

```lumen
let text = readFile("examples/data.txt")
println(text)
```

`readFile(path)` reads the entire file and returns its contents as a string.
If the file does not exist, it returns an **empty string** — it does not throw
or return an error type. This is a known limitation: there is no way to
distinguish between an empty file and a missing file.

The path is relative to the current working directory (where you run the
program). Absolute paths work too.

### Writing Files

```lumen
writeFile("build/report.txt", "done")
```

`writeFile(path, content)` creates or overwrites a file with the given text
content. It returns `0` on success. Directories in the path are created
automatically if needed (e.g., `build/` in the example above).

### Appending To Files

```lumen
appendFile("build/log.txt", "line one\n")
```

`appendFile(path, content)` appends text to a file. If the file doesn't exist,
it is created. This function is in the `thread` module because it is designed
to be used with semaphore-guarded thread workers.

### File Limitations

- **No error typing** — `readFile` returns an empty string for missing files,
  making it impossible to distinguish "file not found" from "file is empty".
- **No binary I/O** — all file operations work with strings. There is no byte
  buffer type.
- **No directory listing** — there is no helper to list files in a directory.
- **No file metadata** — no stat, size, or modification time helpers.
- **No streaming** — `readFile` loads the entire file into memory.

## Environment Variables

### Reading Variables

```lumen
let url = env("DATABASE_URL")
println(url)
```

`env(name)` reads an environment variable. If the variable is set in the
process environment, its value is returned. If not, Lumen checks for a `.env`
file in the current directory.

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
println(arg(0))        // program name (e.g., "./build/app")
println(arg(1))        // first user argument
println(argCount())    // total number of arguments
```

`arg(index)` returns the argument at the given position as a string. `arg(0)`
is the program name (the path used to invoke the executable). User arguments
start at index 1.

`argCount()` returns the total number of arguments, including the program name.

Example — create `echo.lm`:

```lumen
function main(): i32 {
  let i: i32 = 1

  while i < argCount() do {
    println(arg(i))
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
- `arg` and `argCount` return empty/zero on Linux (currently implemented for
  macOS only).

## Process Execution

```lumen
let code = exec("clang build/out.ll -o build/app")
```

`exec(command)` runs a shell command and returns its exit code. This is the
hook used by the self-host compiler to invoke `clang` for linking.

### How It's Used

The bootstrap compiler uses `exec` to:

1. Emit LLVM IR to a `.ll` file
2. Call `exec("clang file.ll -o output")` to link
3. Check the return code to verify linking succeeded

```lumen
let code = exec("clang build/out.ll src/runtime/system.c src/runtime/fs.c -pthread -o build/app")
if code != 0 {
  println("link failed")
  return 1
}
```

### Limitations

- The command is passed as a single string to the shell — no argument array
  support. Paths with spaces or special characters may not work correctly.
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
  let semaphore = createSemaphore(1)

  let one = startThread(writeLine, "build/output.txt", "thread one\n", semaphore)
  let two = startThread(writeLine, "build/output.txt", "thread two\n", semaphore)
  let three = startThread(writeLine, "build/output.txt", "thread three\n", semaphore)

  joinThread(one)
  joinThread(two)
  joinThread(three)

  return 0
}
```

### Thread Functions

| Function | Description |
| --- | --- |
| `createSemaphore(count)` | Creates a semaphore with an initial count. `createSemaphore(1)` creates a mutex-like semaphore (one thread at a time). |
| `semaphoreWait(semaphore)` | Acquires the semaphore, blocking if the count is 0. Decrements the count. |
| `semaphoreSignal(semaphore)` | Releases the semaphore, incrementing the count. Wakes a waiting thread if any. |
| `startThread(func, ...args)` | Starts a new native thread running the given function with the provided arguments. Returns a thread handle. |
| `joinThread(handle)` | Waits for the thread to finish. Must be called for every started thread. |

### How Threads Work

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

- Threads run native OS threads — there is no green thread or async runtime.
- Functions passed to `startThread` must match the parameter types exactly.
- There is no thread-local storage or thread naming.
- Threads are created with default OS scheduling — no priority control.
- Channels (`send`/`receive`) provide message passing but are string-only.

## Missing

- **Typed file errors** — `readFile` returns an empty string for missing files.
  No way to distinguish error cases.
- **Directory helpers** — no `listDir`, `createDir`, `removeFile`, or `stat`.
- **Binary I/O** — all file operations are text-only.
- **CLI parsing** — no built-in flag or subcommand parser. The `cli` package
  exists but is basic.
- **Linux argv** — `arg` and `argCount` return empty/zero on Linux.
- **Process spawn** — `exec` uses shell string concatenation. No argument
  arrays, no output capture, no timeout.
- **Thread lifecycle** — no thread detach, no cancellation, no error recovery.
- **Path portability** — no path manipulation helpers beyond the `path` package
  (which is experimental).
