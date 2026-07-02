# Photon Auth

**Status: experimental.**

OIDC login-start helpers for Lumen apps.

This package does not finish authentication yet. Real Google, Apple, and Active
Directory login needs outbound HTTPS token exchange and JWT signature
verification. Lumen does not have those runtime pieces yet.

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
- State check: `authStateMatches(expected, actual)`

Token exchange and JWT verification need more Lumen HTTP/client crypto support.
