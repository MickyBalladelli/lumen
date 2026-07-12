const RULES = {
  llvm: [
    rule('JavaScript compiler', /\bJavaScript\b|Compiler\.js|child_process/i),
    rule('Node compiler', /\bnode(?:js|\.exe)?\b[ \t]+[^\n]*\.m?js\b|node_modules|process\.execPath/i),
    rule(
      'subprocess compiler',
      /self-host compiler delegate|compiler\.self\.unsupported/i
    )
  ],
  binary: [
    rule('JavaScript compiler', /\bJavaScript\b|Compiler\.js|child_process/i),
    rule('Node compiler', /\bnode(?:js|\.exe)?\b[ \t]+[^\n]*\.m?js\b|node_modules|process\.execPath/i),
    rule(
      'subprocess compiler',
      /self-host compiler delegate|compiler\.self\.unsupported/i
    )
  ],
  symbols: [
    rule('JavaScript compiler', /\bJavaScript\b|Compiler\.js|child_process/i),
    rule('Node compiler', /\bnode(?:js|\.exe)?\b[ \t]+[^\n]*\.m?js\b|node_modules|process\.execPath/i),
    rule(
      'subprocess compiler',
      /self-host compiler delegate|compiler\.self\.unsupported/i
    )
  ],
  source: [
    rule('JavaScript compiler', /\bJavaScript\b|Compiler\.js|child_process/i),
    rule('Node compiler', /\bnode(?:js|\.exe)?\b[ \t]+[^\n]*\.m?js\b|node_modules|process\.execPath|exec\s*\(\s*["']node(?:js)?["']/i),
    rule(
      'subprocess compiler',
      /self-host compiler delegate|compiler\.self\.unsupported|exec\s*\(\s*["'](?:node|nodejs)/i
    )
  ]
}

export function findBootstrapDelegation(content, {
  kind,
  label
}) {
  const rules = RULES[kind]
  if (!rules) throw new Error(`Unknown bootstrap artifact kind ${kind}`)

  return rules
    .filter(({ pattern }) => pattern.test(content))
    .map(({ name }) => `${label}: ${name}`)
}

function rule(name, pattern) {
  return { name, pattern }
}
