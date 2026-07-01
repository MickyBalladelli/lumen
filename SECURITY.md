# Security Policy

## Project Status

Lumen is pre-1.0 software. It has native code, a compiler, a package installer,
HTTP/WebSocket servers, process execution, and in-tree crypto code. It has not
received an independent security audit.

Do not use Lumen as the only security boundary for hostile code, secrets, or an
internet-facing production service.

## Supported Versions And Platforms

| Version | Security support |
| --- | --- |
| Current `main` and current `0.1.x` package | Best-effort fixes |
| Older commits or packages | Not supported; fixes are not backported |

macOS and Linux are the supported development targets. Both require Node.js 20
or newer, Clang, POSIX APIs, and pthreads. Windows is not supported.

The project does not yet have macOS/Linux CI. Platform support is checked
manually through native examples, portable-provider tests, bootstrap tests, and
sanitizer runs.

## Reporting A Vulnerability

Do not publish vulnerability details in a normal GitHub issue.

Use GitHub's private vulnerability reporting for this repository:

<https://github.com/MickyBalladelli/lumen/security/advisories/new>

If that form is unavailable, contact the repository owner through GitHub and
ask for a private channel without including exploit details publicly.

Include:

- Affected commit, version, platform, and architecture
- A minimal reproducer or proof of concept
- Expected and actual impact
- Whether untrusted input or network access is required
- Any known workaround

The project has no guaranteed response SLA. The maintainer will confirm the
report when possible, investigate, prepare tests and a fix, and coordinate a
disclosure date with the reporter. Please allow time for a patched release
before public disclosure.

## Current Security Boundaries

### Compiler, Runtime, And Packages

- Lumen programs are native executables, not sandboxed programs. They can use
  filesystem, process, network, and thread APIs with the user's permissions.
- Compiling or running untrusted Lumen source is unsafe. Compiler and runtime
  parsers are tested, but they are not a sandbox.
- `exec` launches an argument vector without a shell, but still executes the
  requested program.
- Photon installs can clone code and pin Git commits through `photon.lock`.
  There is no package signature or trusted registry. Review dependencies and
  commit changes before compiling them.
- Native ASan/UBSan tests cover selected memory and bounds cases, not every
  runtime path.

### HTTP And WebSocket APIs

The native HTTP runtime has request/header/body limits, connection limits,
timeouts, protocol validation, partial I/O loops, canonical static-file path
checks, concurrent workers, clean signal shutdown, and parser fuzz targets.
These are defenses, not an audit.

Important limits:

- Servers bind to all IPv4 interfaces.
- Transport is plain HTTP. There is no TLS or HTTPS listener.
- There is no built-in authentication, authorization, rate limiting, or CSRF
  protection.
- The chat endpoints send wildcard CORS headers.
- WebSocket support is minimal, and the Socket.IO API is only Socket.IO-shaped.
- `httpRequest` and the `http-client` package build request text; they do not
  provide outbound HTTP or HTTPS transport.
- `auth` cannot complete token exchange, and `jwt-lite` does not verify
  signatures. Never use either package to protect access.

Put any exposed server behind a maintained reverse proxy that supplies TLS,
authentication, request filtering, and deployment-level limits. Restrict it
with a firewall when it should not be public.

### Crypto And Secret-Like APIs

`encrypt` currently uses the versioned
`AES-256-CTR-HMAC-SHA256` format with separate derived encryption and MAC keys,
PBKDF2-HMAC-SHA256 with 100,000 iterations, a random 16-byte salt, a random
16-byte IV, and MAC verification before decryption. macOS uses CommonCrypto.
Linux and forced-portable tests use the in-tree provider with `getrandom` or
`/dev/urandom`.

The implementation has test vectors and round-trip tests, but no independent
cryptographic review. It also has important limitations:

- The application owns key generation, strength, storage, rotation, and
  recovery.
- Secrets and derived keys are not locked in memory or explicitly zeroed.
- The macOS authentication-tag comparison uses `memcmp` and is not guaranteed
  constant-time. The portable provider has a constant-time comparison.
- The format is Lumen-specific and has no compatibility or long-term support
  guarantee.

For high-value data, use an audited platform cryptography library and a managed
key system until this implementation is reviewed.

`uuid()` uses the C `rand()` generator. It is not cryptographically secure.
Do not use `uuid()`, `crypto-extra.randomToken`, or `authNonce` for passwords,
session IDs, CSRF tokens, reset links, or other secrets.

## Security Updates

Security fixes land on the current development line. A release should identify
the affected versions, credit the reporter if desired, include regression
tests, and publish updated tarball/VSIX checksums. See
[CONTRIBUTING.md](CONTRIBUTING.md#release-process) for the current manual
release process.
