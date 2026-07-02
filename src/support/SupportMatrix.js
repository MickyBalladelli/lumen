export const CompilerSupportMatrix = Object.freeze([
  support(
    'javascript-pipeline',
    'JavaScript compiler pipeline',
    'supported',
    'Primary compiler: tokenizer, parser, semantic analysis, type checking, typed IR validation, and LLVM lowering.'
  ),
  support(
    'javascript-ir',
    'JavaScript compiler IR',
    'supported',
    'Uses typed IR modules, functions, blocks, instructions, values, and terminators. The LLVM backend consumes this IR.'
  ),
  support(
    'bootstrap-pipeline',
    'Lumen-written bootstrap compiler',
    'subset',
    'Parses and compiles only the features and diagnostics listed in the parity tables below.'
  ),
  support(
    'bootstrap-ir',
    'Bootstrap compiler IR',
    'partial',
    'Uses typed Lumen structs for an IR summary, but still relies on a program map and statement compatibility bridge. It is not the JavaScript compiler typed IR.'
  ),
  support(
    'bootstrap-stages',
    'Stage-2 and stage-3 bootstrap',
    'checkpoint',
    'Stage-1 is built by the JavaScript compiler. Later stages reproduce its embedded LLVM checkpoint byte for byte and run the parity fixtures.'
  ),
  support(
    'source-self-hosting',
    'Full source self-hosting',
    'not implemented',
    'Compiling compiler/main.lm returns the embedded stage-1 LLVM image through compilerImage(). The bootstrap compiler does not regenerate itself from its source.'
  )
])

export const PlatformSupportMatrix = Object.freeze([
  support(
    'macos',
    'macOS',
    'targeted',
    'Development target with Clang and POSIX runtime support.'
  ),
  support(
    'linux',
    'Linux',
    'targeted',
    'Has Linux argument, crypto, and WebSocket providers. Automated Linux CI is not present yet.'
  ),
  support(
    'windows',
    'Windows',
    'unsupported',
    'The native runtime and build flow require POSIX APIs and pthreads.'
  )
])

export const ExperimentalPackageSupport = Object.freeze({
  auth: Object.freeze({
    status: 'experimental',
    detail: 'Builds authorization URLs and checks state only. Token exchange and completed authentication are not implemented.'
  }),
  'http-client': Object.freeze({
    status: 'experimental',
    detail: 'Builds HTTP-shaped request payloads only. Outbound HTTP/HTTPS transport and TLS are not implemented.'
  }),
  'jwt-lite': Object.freeze({
    status: 'experimental',
    detail: 'Checks token shape only. JWT decoding, signature verification, and claims validation are not implemented.'
  }),
  url: Object.freeze({
    status: 'experimental',
    detail: 'Concatenates query strings only. URL parsing and percent-encoding are not implemented.'
  })
})

function support(id, area, status, detail) {
  return Object.freeze({ id, area, status, detail })
}
