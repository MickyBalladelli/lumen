# Photon Auth

OIDC helpers for Lumen apps.

## Install

```bash
photon add auth ./packages/auth
```

## Use

```lumen
import { googleAuthorizeUrl, authNonce } from "auth"

function main(): i32 {
  let url = googleAuthorizeUrl("client-id", "http://localhost:3000/auth/callback", "state", authNonce())
  println(url)
  return 0
}
```

## Providers

- Google: `googleAuthorizeUrl(clientId, redirectUri, state, nonce)`
- Apple: `appleAuthorizeUrl(clientId, redirectUri, state, nonce)`
- Active Directory: `activeDirectoryAuthorizeUrl(tenant, clientId, redirectUri, state, nonce)`

This package starts the browser auth flow and keeps callback data. Token exchange and JWT verification need more Lumen HTTP/client crypto support.
