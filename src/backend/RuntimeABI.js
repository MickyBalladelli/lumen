import { RuntimeSignatures, llvmDeclaration } from '../runtime/BuiltinRegistry.js'

export function emitRuntimeABI(emitter, externs) {
  return [
    ...RuntimeSignatures.map(signature => emitter[signature.flag] ? llvmDeclaration(signature) : ''),
    ...externs,
    emitter.debug ? 'declare void @llvm.dbg.declare(metadata, metadata, metadata)' : ''
  ]
}
