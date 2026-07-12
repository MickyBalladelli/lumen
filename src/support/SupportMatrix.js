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
    'supported',
    'Uses typed function, block, and value arenas. The Lumen LLVM emitter consumes this typed IR directly.'
  ),
  support(
    'bootstrap-stages',
    'Stage-2 and stage-3 bootstrap',
    'source bootstrap',
    'Stage-1 is built by the JavaScript seed. Stage-2 and stage-3 compile compiler/main.lm from source and are checked for equivalent LLVM and behavior.'
  ),
  support(
    'source-self-hosting',
    'Full source self-hosting',
    'supported subset',
    'The Lumen compiler regenerates itself from source through three stages. Language-wide parity remains limited to the documented fixtures.'
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
    'Has Linux runtime providers and automated three-stage bootstrap coverage.'
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
