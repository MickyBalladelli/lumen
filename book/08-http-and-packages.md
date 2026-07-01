# HTTP And Packages

This chapter covers HTTP serving (static files, API routes, combined servers),
Socket.IO-style chat, the Photon package manager, and all 30 bundled packages.

## HTTP Server Functions

All HTTP functions are in the `http` module. Servers run until stopped with
Ctrl-C.

### Static File Server

Serve a directory of static files:

```lumen
function main(): i32 {
  let server = serveFiles(8080, "examples/public")
  if !isOk(server) {
    println(errorMessage(server))
    return 1
  }
  return resultValue(server)
}
```

`serveFiles(port, root)` starts an HTTP server on the given port that serves
files from the given directory. Requests are mapped to file paths relative to
the root:

- `GET /` → `index.html`
- `GET /style.css` → `style.css`
- `GET /js/app.js` → `js/app.js`

MIME types are inferred from file extensions (.html, .css, .js, .json, .png,
.jpg, .svg, .txt).

### API Route Server

Serve a single API endpoint:

```lumen
function main(): i32 {
  let server = serveApi(
    8081,
    "GET",
    "/health",
    'Content-Type: application/json
X-Lumen: yes
',
    '{"ok":true}'
  )
  if !isOk(server) {
    return 1
  }
  return resultValue(server)
}
```

`serveApi(port, method, route, headers, body)` takes five arguments:

1. **Port** — the TCP port to listen on
2. **Method** — HTTP method as a string: `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`
3. **Route** — the URL path to match: `"/health"`, `"/api/users"`
4. **Headers** — response headers as a multi-line string. Each header is on its
   own line in `Name: value` format. End with a blank line.
5. **Body** — the response body as a string

Query parameters in the request URL are accepted but ignored for route matching.
`/health?format=json` matches the `/health` route.

The server responds to all requests that match the method and route. Non-
matching requests receive a default 404 response.

### Combined HTTP Server

Serve static files and multiple API routes from one server:

```lumen
function main(): i32 {
  let methods: string[] = ["GET", "GET"]
  let routes: string[] = ["/api/hello", "/api/status"]
  let headers: string[] = [
    'Content-Type: application/json

',
    'Content-Type: text/plain

'
  ]
  let bodies: string[] = [
    '{"message":"hello"}',
    "ok"
  ]

  let server = serveHttp(
    8088,
    "examples/http-public",
    methods,
    routes,
    headers,
    bodies
  )
  if !isOk(server) {
    return 1
  }
  return resultValue(server)
}
```

`serveHttp(port, root, methods, routes, headers, bodies)` combines both
concerns:

- Static files are served from `root` for paths that don't match an API route
- API routes are defined by parallel arrays: `methods[i]`, `routes[i]`,
  `headers[i]`, `bodies[i]` all correspond to the same endpoint
- All arrays must have the same length
- Route matching checks API routes first, then falls back to static files
- Each header string must end with a blank line

Run the full browser example:

```bash
npm run http
```

Then open `http://localhost:8088`.

### Run an HTTP Server

The `npm run http` command compiles and runs `examples/http-server.lm`:

```bash
npm run http
```

### HTTP Request/Response Payload Helpers

Build HTTP request and response strings for use in API code:

```lumen
let request = httpRequest("POST", "/api/hello", '{"name":"lumen"}')
if isOk(request) {
  println(resultValue(request))
}
```

These payload builders return `Result<string>`. They create formatted strings;
they do not make actual HTTP connections.

## Socket.IO-Style Chat

Lumen provides Socket.IO-shaped chat helpers for real-time browser
communication.

### Chat Server

```lumen
function main(): i32 {
  let server = serveSocketIoChat(8090, "examples/socket-chat-public")
  if !isOk(server) {
    return 1
  }
  return resultValue(server)
}
```

`serveSocketIoChat(port, root)` serves:
- Static files from the root directory
- A polling endpoint at `/socket.io/messages` for receiving messages
- An emit endpoint at `/socket.io/emit` for sending messages
- An experimental WebSocket endpoint at `/socket.io/ws`

### Payload Helpers

```lumen
let event = socketIoEvent("chat message", "hello everyone")
if isOk(event) {
  println(resultValue(event))
}
```

- `socketIoEvent(event, payload)` builds an event payload string
- `socketIoEmit(room, event, payload)` builds a room-scoped event payload string

### Run the Chat Server

```bash
npm run chat
```

Then open `http://localhost:8090`.

### Current Chat Transport

The chat uses simple HTTP polling on `/socket.io/messages` and
`/socket.io/emit`, with an experimental WebSocket endpoint. It is
Socket.IO-**shaped**, not the full Socket.IO wire protocol. This means:
- It uses Socket.IO-like endpoint paths and event format
- It does not implement the Engine.IO transport negotiation
- It does not implement Socket.IO namespaces, acknowledgements, or binary
  packets
- WebSocket support is experimental and minimal

### HTTP Runtime Limitations

- **No request/body limits** — large payloads can consume unbounded memory
- **No timeouts** — connections can hang indefinitely
- **No concurrent connection handling** — the server processes requests
  sequentially
- **No clean shutdown** — Ctrl-C terminates the process immediately
- **No partial read/write loops** — large file transfers may be incomplete
- **No canonical-path checks** — directory traversal via `../` in URL paths is
  not fully guarded

## Packages

Lumen ships with 30 bundled packages under `packages/`. Each package provides
focused helper functions that you import into your program.

### Bundled Package Catalog

| Package | Description | Key Exports |
| --- | --- | --- |
| `assert` | Assertion helpers | Extended assertion functions |
| `auth` | Authentication | Auth primitives (experimental) |
| `cache` | Caching | In-memory cache helpers |
| `cli` | CLI argument parsing | Flag and argument parsers |
| `collections` | Collection utilities | Map/list helpers |
| `config` | Configuration helpers | `envOr`, config loading |
| `crypto-extra` | Extended crypto | Additional encryption utilities |
| `csv` | CSV parsing | CSV reader/writer |
| `date-extra` | Date utilities | Date formatting and parsing |
| `dotenv` | .env file loading | Load and parse .env files |
| `env-extra` | Environment utilities | Environment helpers |
| `fs-extra` | Extended file system | Directory listing, file metadata |
| `html` | HTML generation | HTML builder helpers |
| `http-client` | HTTP client | Outbound HTTP requests (experimental) |
| `http-kit` | HTTP toolkit | HTTP utility functions |
| `json-extra` | Extended JSON helpers | JSON manipulation utilities |
| `jwt-lite` | JWT tokens | JWT encode/decode (experimental) |
| `logger` | Logging | Log level and formatting helpers |
| `math-extra` | Extended math | Additional math functions |
| `middleware` | Middleware patterns | HTTP middleware composition |
| `option` | Option type helpers | Option/Maybe utilities |
| `path` | Path manipulation | Path join, normalize, extension |
| `process` | Process management | Process spawning helpers |
| `result` | Result type helpers | Result/Either utilities |
| `router` | HTTP routing | Route matching and dispatch |
| `slug` | Slug generation | URL-safe slug from text |
| `string-extra` | Extended string helpers | Additional string utilities |
| `template` | Template engine | String template rendering |
| `testing` | Test helpers | Test assertion and runner |
| `time` | Time utilities | Time formatting and manipulation |
| `url` | URL parsing | URL parse and build (experimental) |
| `uuid` | UUID generation | UUID v4 generation |
| `validation` | Input validation | String/number validation rules |

### Using A Package

```lumen
import { envOr } from "config"

function main(): i32 {
  let port = envOr("PORT", "3000")
  println(port)
  return 0
}
```

### Package Status

Many packages are early-stage. Packages marked "experimental" have placeholder
implementations or limited functionality. The core packages (`assert`, `cli`,
`collections`, `config`, `dotenv`, `fs-extra`, `json-extra`, `logger`,
`math-extra`, `option`, `path`, `process`, `result`, `router`, `slug`,
`string-extra`, `template`, `testing`, `time`, `uuid`, `validation`) have
working implementations.

**Experimental** (auth, http-client, jwt-lite, url) — these packages exist in
the directory structure with skeleton code. They are reserved for future
implementation.

## Photon Package Manager

Photon manages external Lumen packages. It installs them from local paths or
Git URLs into `.photon/packages/`.

### Initialize A Project

```bash
photon init
```

Creates three files if they don't already exist:
- `photon.json` — package manifest
- `lumen.json` — compiler config (entry/output)
- `main.lm` — starter source file

To create a named project directory:

```bash
photon init my-app
```

### Photon.json Manifest

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "main.lm"
}
```

### Add A Package

From a local path:

```bash
photon add math ../lumen-math
```

From a Git URL with an optional ref:

```bash
photon add http git@github.com:you/lumen-http.git#v1.0.0
```

From bundled packages (by name):

```bash
photon add result
```

### Search Bundled Packages

```bash
photon search               # list all bundled packages
photon search result        # search for packages matching "result"
```

### Install Dependencies

```bash
photon install
```

Reads `photon.json`, resolves all dependencies, and installs them into
`.photon/packages/`.

### List Installed Packages

```bash
photon list
```

### Photon.lock

`photon install` writes a `photon.lock` file recording the exact versions and
Git commit hashes of installed packages. Currently, the lock is **written but
not read** — subsequent installs resolve dependencies again rather than using
the lock file. This is a known gap.

### Package Resolution

When you `import { triple } from "math"`, Photon resolves the package:

1. Checks `.photon/packages/` for a directory or file named `math`
2. If found, looks for `photon.json` inside the package to find the `main` file
3. If no manifest exists, loads `main.lm`
4. The module graph then parses and links the imported symbols

### Limitations

- **Lock file is not used** — `photon.lock` is rewritten but never consumed
  during install. Install behavior is not reproducible.
- **No version constraints** — `photon.json` doesn't specify version ranges.
  Git refs are manually specified.
- **No transitive dependency resolution** — each package's dependencies must be
  installed manually.
- **Escape safety** — dependency names that escape `.photon/packages` (e.g.,
  `../outside`) are not rejected.
- **Atomic install** — packages are installed directly into `.photon/packages/`
  rather than through a temporary directory with atomic swap. A failed install
  leaves partial state.
- **No publish command** — there is no `photon publish` for uploading packages
  to a registry.

## Missing

- **HTTP runtime hardening** — request/body limits, partial read/write loops,
  timeouts, canonical-path checks, protocol validation, clean shutdown,
  concurrent connection handling. Fuzzing for request and WebSocket parsers.
- **Client HTTP** — the `http-client` package is experimental. No outbound HTTP
  from Lumen programs.
- **Full WebSocket** — the Socket.IO chat uses polling with an experimental
  WebSocket endpoint. Not a complete WebSocket implementation.
- **Photon lock** — `photon.lock` is never used to resolve installs.
  Reproducible builds are not possible.
- **Photon versioning** — no version constraint syntax, no range resolution.
- **Photon publish** — no package registry or publish workflow.
- **Package maturity** — auth, JWT, outbound HTTPS, and URL packages are
  experimental stubs.
- **API routing** — `serveHttp` uses parallel arrays. There's no route pattern
  matching, path parameters, or middleware chaining.
