import { Tokenizer } from '../lexer/Tokenizer.js'

const DECREASE_INDENT = /^(}|\]|\)|case\b|default\b)/
const INCREASE_INDENT = /({|\[|\(|\b(do|else|try)\b)$/
const COMPACT_PREFIX = /^(else|catch)\b/

export function formatSource(source, { indent = '  ' } = {}) {
  new Tokenizer(source).tokenize()

  const lines = source
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  const formatted = []
  let level = 0
  let blank = false

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()

    if (!trimmed) {
      if (!blank && formatted.length > 0) {
        formatted.push('')
        blank = true
      }
      continue
    }

    if (DECREASE_INDENT.test(trimmed)) level = Math.max(level - 1, 0)

    if (COMPACT_PREFIX.test(trimmed) && formatted.length > 0) {
      const previous = formatted[formatted.length - 1]
      if (previous.trim() === '}') {
        formatted[formatted.length - 1] = `${previous} ${trimmed}`
      } else {
        formatted.push(`${indent.repeat(level)}${trimmed}`)
      }
    } else {
      formatted.push(`${indent.repeat(level)}${trimmed}`)
    }

    blank = false

    if (opensBlock(trimmed)) level += 1
    if (closesInlineBlock(trimmed)) level = Math.max(level - 1, 0)
  }

  while (formatted[formatted.length - 1] === '') formatted.pop()

  return `${formatted.join('\n')}\n`
}

function opensBlock(line) {
  if (line.startsWith('//')) return false
  if (line.endsWith('}')) return false
  return INCREASE_INDENT.test(stripLineComment(line))
}

function closesInlineBlock(line) {
  const clean = stripLineComment(line)
  return clean.includes('{') && clean.endsWith('}')
}

function stripLineComment(line) {
  let inString = null

  for (let index = 0; index < line.length - 1; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if ((char === '"' || char === "'") && line[index - 1] !== '\\') {
      inString = inString === char ? null : inString ?? char
      continue
    }

    if (!inString && char === '/' && next === '/') {
      return line.slice(0, index).trimEnd()
    }
  }

  return line
}
