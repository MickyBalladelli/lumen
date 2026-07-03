const RULES = {
  llvm: [
    rule('compilerImage builtin', /\bcompilerImage\b/i),
    rule('compiler image symbol', /lumen_compiler_image\b/i),
    rule('embedded compiler image', /compiler_image_bytes\b/i),
    rule('JavaScript compiler', /\bJavaScript\b|Compiler\.js|child_process/i),
    rule('Node compiler', /\bnode(?:js|\.exe)?\b[ \t]+[^\n]*\.m?js\b|node_modules|process\.execPath/i),
    rule(
      'subprocess compiler',
      /self-host compiler delegate|compiler\.self\.unsupported|call\b[^\n]*@lumen_exec\b/i
    )
  ],
  binary: [
    rule('compilerImage builtin', /\bcompilerImage\b/i),
    rule('compiler image symbol', /lumen_compiler_image\b/i),
    rule('embedded compiler image', /compiler_image_bytes\b/i),
    rule('JavaScript compiler', /\bJavaScript\b|Compiler\.js|child_process/i),
    rule('Node compiler', /\bnode(?:js|\.exe)?\b[ \t]+[^\n]*\.m?js\b|node_modules|process\.execPath/i),
    rule(
      'subprocess compiler',
      /self-host compiler delegate|compiler\.self\.unsupported/i
    )
  ],
  symbols: [
    rule('compiler image symbol', /lumen_compiler_image\b/i),
    rule('embedded compiler image', /compiler_image_bytes\b/i),
    rule('JavaScript compiler', /\bJavaScript\b|Compiler\.js|child_process/i),
    rule('Node compiler', /\bnode(?:js|\.exe)?\b[ \t]+[^\n]*\.m?js\b|node_modules|process\.execPath/i),
    rule(
      'subprocess compiler',
      /self-host compiler delegate|compiler\.self\.unsupported/i
    )
  ],
  source: [
    rule('compilerImage builtin', /\bcompilerImage\s*\(/i),
    rule('compiler image symbol', /lumen_compiler_image\b/i),
    rule('embedded compiler image', /compiler_image_bytes\b/i),
    rule('JavaScript compiler', /\bJavaScript\b|Compiler\.js|child_process/i),
    rule('Node compiler', /\bnode(?:js|\.exe)?\b[ \t]+[^\n]*\.m?js\b|node_modules|process\.execPath|exec\s*\(\s*["']node(?:js)?["']/i),
    rule(
      'subprocess compiler',
      /self-host compiler delegate|compiler\.self\.unsupported|exec\s*\(\s*["'](?:node|nodejs)/i
    ),
    rule(
      'input filename selects compiler behavior',
      /includes\s*\(\s*input\s*,\s*["']compiler\/main\.lm["']|["']compiler-main["']/i
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
