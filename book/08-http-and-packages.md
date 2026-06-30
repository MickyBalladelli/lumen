# HTTP And Packages

## Static Files

```lumen
function main(): i32 {
  return serveFiles(8080, "examples/public")
}
```

Serves a directory of static files on the given port. Runs until stopped.

## API Route

```lumen
function main(): i32 {
  return serveApi(
    8081,
    "GET",
    "/health",
    'Content-Type: application/json
X-Lumen: yes
',
    '{"ok":true}'
  )
}
```

`serveApi` takes port, method, route, response headers, and response body.
Query params are accepted on requests and ignored for route matching.

## Full HTTP Server

Serve static files and API routes from one server:

```lumen
serveHttp(8088, "examples/http-public", methods, routes, headers, bodies)
```

Run the full browser example:

```bash
npm run http
```

Then open `http://localhost:8088`.

## HTTP Request/Response Helpers

```lumen
let request = httpRequest("POST", "/api/hello", '{"name":"lumen"}')
let response = httpResponse(200, '{"content-type":"application/json"}', '{"message":"hello"}')
```

## Socket.IO-Style Chat

Socket.IO-shaped chat helpers:

- `serveSocketIoChat(port, root)`: serves static files plus chat endpoints
- `socketIoEvent(event, payload)`: builds an event payload string
- `socketIoEmit(room, event, payload)`: builds a room event payload string

Run the chat browser example:

```bash
npm run chat
```

Then open `http://localhost:8090`.

Current chat transport is simple HTTP polling on `/socket.io/messages` and
`/socket.io/emit`, with an experimental WebSocket endpoint at `/socket.io/ws`.
It is Socket.IO-shaped, not the full Socket.IO wire protocol.

## Runtime Limits

The native server accepts at most 16 KiB of request headers, 1 MiB request
bodies, and 128 concurrent connections. Client reads and writes time out after
10 seconds. WebSocket messages are limited to 64 KiB.

Static paths must be canonical. Dot segments, repeated separators, trailing
separators, and symlinks are rejected. `SIGINT` and `SIGTERM` stop accepting
connections, close active clients, and wait for workers to finish.

Run native parser regression tests with `npm run test:http-runtime`. Run the
HTTP and WebSocket parser fuzz targets with `npm run fuzz:http`. Set
`LUMEN_FUZZ_RUNS` to change the default 10,000 iterations.

## Packages

Packages live under `packages/` and use `photon.json`.

```lumen
import { envOr } from "config"
```

Available bundled packages:

| Package | Description |
| --- | --- |
| `assert` | Assertion helpers |
| `auth` | Authentication |
| `cache` | Caching |
| `cli` | CLI argument parsing |
| `collections` | Collection utilities |
| `config` | Configuration helpers |
| `crypto-extra` | Extended crypto |
| `csv` | CSV parsing |
| `date-extra` | Date utilities |
| `dotenv` | .env file loading |
| `env-extra` | Environment utilities |
| `fs-extra` | Extended file system |
| `html` | HTML generation |
| `http-client` | HTTP client |
| `http-kit` | HTTP toolkit |
| `json-extra` | Extended JSON helpers |
| `jwt-lite` | JWT tokens |
| `logger` | Logging |
| `math-extra` | Extended math |
| `middleware` | Middleware patterns |
| `option` | Option type helpers |
| `path` | Path manipulation |
| `process` | Process management |
| `result` | Result type helpers |
| `router` | HTTP routing |
| `slug` | Slug generation |
| `string-extra` | Extended string helpers |
| `template` | Template engine |
| `testing` | Test helpers |
| `time` | Time utilities |
| `url` | URL parsing |
| `uuid` | UUID generation |
| `validation` | Input validation |

## Photon Package Manager

Photon installs external Lumen packages into `.photon/packages`.

Create a package manifest:

```bash
photon init
photon init my-app
```

`photon init` creates `photon.json`, `lumen.json`, and a starter `main.lm`
when those files do not already exist.

Add a package from a local path or Git URL:

```bash
photon add math ../lumen-math
photon add http git@github.com:you/lumen-http.git#v1.0.0
```

Search bundled packages:

```bash
photon search
photon search result
```

Add a bundled package by name:

```bash
photon add result
```

Install packages:

```bash
photon install
```

Normal installs reuse exact Git commits from `photon.lock`. Refresh Git refs
and lock them again with:

```bash
photon update
```

Require `photon.json` and `photon.lock` to match without rewriting the lock:

```bash
photon install --frozen-lock
# Short alias:
photon frozen-lock
```

Use a package:

```lumen
import { triple } from "math"
```

Package directories may include `photon.json`:

```json
{
  "name": "math",
  "version": "1.0.0",
  "main": "main.lm"
}
```

If no package manifest exists, Photon loads `main.lm`.

## Missing

- HTTP routing is still small
- Client/server API docs need more examples
- Package versioning story is early
- Self-host module loading is not real yet
- Photon lockfile is not used to resolve installs (currently rewritten but
  never consumed)
- HTTP runtime needs hardening: request/body limits, timeouts, concurrent
  connections, clean shutdown
- Many bundled packages are experimental stubs (auth, JWT, outbound HTTPS, URL)
