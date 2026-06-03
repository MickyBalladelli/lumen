# HTTP And Packages

## Static Files

```lumen
function main(): i32 {
  return serveFiles(8080, "examples/public")
}
```

## API Route

```lumen
function main(): i32 {
  return serveApi(
    8081,
    "GET",
    "/health",
    "Content-Type: application/json",
    '{"ok":true}'
  )
}
```

## Packages

Packages live under `packages/` and use `photon.json`.

```lumen
import { envOr } from "config"
```

## Missing

- HTTP routing is still small
- Client/server API docs need more examples
- Package versioning story is early
- Self-host module loading is not real yet

