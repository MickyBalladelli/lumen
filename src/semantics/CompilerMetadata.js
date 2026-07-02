export function setCompilerMetadata(node, key, value) {
  if (!node || typeof node !== 'object') return value

  Object.defineProperty(node, key, {
    configurable: true,
    enumerable: false,
    value,
    writable: true
  })
  return value
}
