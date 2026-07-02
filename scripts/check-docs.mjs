import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Compiler } from '../src/compiler/Compiler.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const markdownFiles = await findMarkdownFiles()
const errors = []
let checkedLinks = 0
let checkedSnippets = 0

for (const path of markdownFiles) {
  const source = await readFile(path, 'utf8')
  await checkLinks(path, source)
  checkSnippets(path, source)
}

const readme = await readFile(join(root, 'README.md'), 'utf8')
const readmeLines = readme.split('\n').length

if (readmeLines > 150) {
  errors.push(`README.md has ${readmeLines} lines; keep the entry page under 150`)
}

if (checkedSnippets < 3) {
  errors.push('documentation must keep at least three checked code snippets')
}

if (errors.length > 0) {
  throw new Error(`documentation checks failed:\n- ${errors.join('\n- ')}`)
}

console.log(
  `documentation OK: ${markdownFiles.length} files, ${checkedLinks} local links, ${checkedSnippets} compiled snippets`
)

async function findMarkdownFiles() {
  const paths = []
  const rootEntries = await readdir(root, { withFileTypes: true })

  for (const entry of rootEntries) {
    if (entry.isFile() && extname(entry.name) === '.md') {
      paths.push(join(root, entry.name))
    }
  }

  await collectMarkdown(join(root, 'book'), paths)

  const packageEntries = await readdir(join(root, 'packages'), {
    withFileTypes: true
  })

  for (const entry of packageEntries) {
    if (!entry.isDirectory()) continue
    const readmePath = join(root, 'packages', entry.name, 'README.md')

    if (await exists(readmePath)) paths.push(readmePath)
  }

  return paths.sort()
}

async function collectMarkdown(directory, paths) {
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      await collectMarkdown(path, paths)
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      paths.push(path)
    }
  }
}

async function checkLinks(sourcePath, source) {
  const links = source.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)

  for (const match of links) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, '')
    if (isExternal(rawTarget)) continue

    const [rawPath, rawAnchor = ''] = rawTarget.split('#', 2)
    const targetPath = rawPath
      ? resolve(dirname(sourcePath), decodeURIComponent(rawPath))
      : sourcePath
    checkedLinks += 1

    if (!isInsideRoot(targetPath)) {
      errors.push(`${display(sourcePath)} links outside the repository: ${rawTarget}`)
      continue
    }

    if (!await exists(targetPath)) {
      errors.push(`${display(sourcePath)} has missing link: ${rawTarget}`)
      continue
    }

    if (rawAnchor && extname(targetPath) === '.md') {
      const targetSource = await readFile(targetPath, 'utf8')
      const anchors = markdownAnchors(targetSource)
      const anchor = decodeURIComponent(rawAnchor).toLowerCase()

      if (!anchors.has(anchor)) {
        errors.push(`${display(sourcePath)} has missing anchor: ${rawTarget}`)
      }
    }
  }
}

function checkSnippets(sourcePath, source) {
  const fences = source.matchAll(/^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm)

  for (const match of fences) {
    const info = match[1].trim().split(/\s+/)
    if (!info.includes('check')) continue

    const language = info[0]
    const code = match[2]
    const line = source.slice(0, match.index).split('\n').length
    checkedSnippets += 1

    try {
      if (language === 'lumen') {
        new Compiler().compileSource(code, {
          sourcePath: `${display(sourcePath)}:${line}`
        })
      } else if (language === 'json') {
        JSON.parse(code)
      } else {
        errors.push(
          `${display(sourcePath)}:${line} has unsupported checked language: ${language}`
        )
      }
    } catch (error) {
      errors.push(
        `${display(sourcePath)}:${line} snippet failed: ${error.message}`
      )
    }
  }
}

function markdownAnchors(source) {
  const anchors = new Set()
  const counts = new Map()

  for (const match of source.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = headingSlug(match[1])
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    anchors.add(count === 0 ? base : `${base}-${count}`)
  }

  return anchors
}

function headingSlug(heading) {
  return heading
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

function isExternal(target) {
  return target.startsWith('#') === false &&
    /^[a-z][a-z\d+.-]*:/i.test(target)
}

function isInsideRoot(path) {
  const pathFromRoot = relative(root, path)
  return pathFromRoot === '' ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..')
}

function display(path) {
  return relative(root, path)
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
