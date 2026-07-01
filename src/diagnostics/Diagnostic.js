export class Diagnostic extends Error {
  constructor(message, location = null, phase = 'compiler', source = null, notes = []) {
    super('')
    this.name = 'Diagnostic'
    this.rawMessage = message
    this.location = normalizeLocation(location)
    this.phase = phase
    this.source = source
    this.notes = [...notes]
    this.refreshMessage()
  }

  withSource(source) {
    this.source = source ?? this.source
    this.notes = this.notes.map(note => ({
      ...note,
      source: note.source ?? source
    }))
    this.refreshMessage()
    return this
  }

  withSources(sources, fallbackSource = null) {
    const source = sources?.get(this.location?.sourcePath) ?? fallbackSource
    if (source) this.source = source

    this.notes = this.notes.map(note => ({
      ...note,
      source: sources?.get(note.location?.sourcePath) ?? note.source ?? fallbackSource
    }))
    this.refreshMessage()
    return this
  }

  addNote(message, location = null, source = null) {
    this.notes.push({
      message,
      location: normalizeLocation(location),
      source
    })
    this.refreshMessage()
    return this
  }

  refreshMessage() {
    this.message = formatDiagnostic(this)
  }
}

export class DiagnosticCollection extends Error {
  constructor(diagnostics, sources = null) {
    const items = diagnostics.flatMap(diagnostic => {
      return diagnostic instanceof DiagnosticCollection
        ? diagnostic.diagnostics
        : [diagnostic]
    })
    if (sources) {
      for (const diagnostic of items) diagnostic.withSources(sources)
    }

    super(items.map(diagnostic => diagnostic.message).join('\n\n'))
    this.name = 'DiagnosticCollection'
    this.diagnostics = items
    this.location = items[0]?.location ?? null
    this.phase = 'compiler'
    this.rawMessage = `${items.length} diagnostics`
  }

  withSources(sources, fallbackSource = null) {
    for (const diagnostic of this.diagnostics) {
      diagnostic.withSources(sources, fallbackSource)
    }
    this.message = this.diagnostics.map(diagnostic => diagnostic.message).join('\n\n')
    return this
  }
}

export function diagnosticsFrom(error) {
  if (error instanceof DiagnosticCollection) return error.diagnostics
  if (error instanceof Diagnostic) return [error]
  return []
}

export function throwDiagnostics(diagnostics) {
  if (diagnostics.length === 0) return
  if (diagnostics.length === 1) throw diagnostics[0]
  throw new DiagnosticCollection(diagnostics)
}

export function formatDiagnostic(diagnostic) {
  const position = formatPosition(diagnostic.location)
  const header = position
    ? `${diagnostic.phase}: ${diagnostic.rawMessage} at ${position}`
    : `${diagnostic.phase}: ${diagnostic.rawMessage}`
  const parts = [header]
  const snippet = formatSnippet(diagnostic.source, diagnostic.location)
  if (snippet) parts.push(snippet)

  for (const note of diagnostic.notes) {
    const notePosition = formatPosition(note.location)
    parts.push(notePosition
      ? `note: ${note.message} at ${notePosition}`
      : `note: ${note.message}`)
    const noteSnippet = formatSnippet(note.source, note.location)
    if (noteSnippet) parts.push(noteSnippet)
  }

  return parts.join('\n')
}

function formatPosition(location) {
  if (!location) return null
  return [
    location.sourcePath,
    location.line,
    location.column
  ].filter(value => value !== null && value !== undefined).join(':')
}

function formatSnippet(source, location) {
  if (!source || !location?.line) return null
  const line = source.split(/\r?\n/)[location.line - 1] ?? ''
  const start = Math.max(location.column - 1, 0)
  const sameLine = !location.endLine || location.endLine === location.line
  const width = sameLine
    ? Math.max((location.endColumn ?? location.column + 1) - location.column, 1)
    : 1
  return `${line}\n${' '.repeat(start)}${'^'.repeat(width)}`
}

function normalizeLocation(location) {
  if (!location) return null
  const normalized = { ...location }
  normalized.endLine ??= normalized.line
  normalized.endColumn ??= normalized.column !== undefined ? normalized.column + 1 : undefined
  normalized.endOffset ??= normalized.offset !== undefined ? normalized.offset + 1 : undefined
  return normalized
}
