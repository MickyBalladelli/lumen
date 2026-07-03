export function canonicalizeBootstrapLLVM(llvm) {
  const lines = llvm.replaceAll('\r\n', '\n').split('\n')
  const canonical = []
  let previousBlank = false

  for (const rawLine of lines) {
    if (isHarmlessMetadataLine(rawLine)) continue

    const line = stripMetadataAttachments(rawLine).trimEnd()
    const blank = line === ''
    if (blank && (previousBlank || canonical.length === 0)) continue
    canonical.push(line)
    previousBlank = blank
  }

  while (canonical.at(-1) === '') canonical.pop()
  return `${canonical.join('\n')}\n`
}

function isHarmlessMetadataLine(line) {
  const trimmed = line.trimStart()
  return trimmed.startsWith('; ModuleID =') ||
    trimmed.startsWith('source_filename =') ||
    trimmed.startsWith('!') ||
    line.includes('@llvm.dbg.')
}

function stripMetadataAttachments(line) {
  return line.replace(
    /(?:,\s*)?![A-Za-z][A-Za-z0-9_.-]*\s+!\d+/g,
    ''
  )
}
