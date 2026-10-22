import { readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

import { type DocFrontmatter, parseDocFile } from './frontmatter'

const DOCS_DIR = join(process.cwd(), 'src', 'content', 'docs')
const MD_EXTENSIONS = new Set(['.md', '.markdown'])

// Strip a leading `NN-` / `NN_` ordering prefix from a basename. The captured
// number controls list order on the docs index; the rest becomes the slug.
const ORDER_PREFIX = /^(\d+)[-_]/

export interface DocEntry {
  slug: string
  filePath: string
  order?: number
  frontmatter: DocFrontmatter
}

export function parseFilename(file: string): { slug: string; order?: number } {
  const stem = basename(file, extname(file))
  const match = stem.match(ORDER_PREFIX)
  const order = match ? Number.parseInt(match[1], 10) : undefined
  const rest = match ? stem.slice(match[0].length) : stem
  const slug = rest
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return { slug, order }
}

let cache: Map<string, DocEntry> | null = null

function loadAll(): Map<string, DocEntry> {
  if (cache) return cache
  const map = new Map<string, DocEntry>()
  let entries: string[]
  try {
    entries = readdirSync(DOCS_DIR)
  } catch {
    cache = map
    return map
  }
  for (const file of entries) {
    if (!MD_EXTENSIONS.has(extname(file).toLowerCase())) continue
    const filePath = join(DOCS_DIR, file)
    const source = readFileSync(filePath, 'utf8')
    const { frontmatter } = parseDocFile(source, filePath)
    const { slug: fileSlug, order } = parseFilename(file)
    const slug = frontmatter.slug ?? fileSlug
    if (map.has(slug)) {
      throw new Error(`docs registry: duplicate slug '${slug}' (in ${filePath})`)
    }
    map.set(slug, { slug, filePath, order, frontmatter })
  }
  cache = map
  return map
}

export function listDocs(): DocEntry[] {
  // Ordering: prefixed files first (by order ascending), then unprefixed files
  // sorted alphabetically by title.
  return [...loadAll().values()].sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order
    if (a.order !== undefined) return -1
    if (b.order !== undefined) return 1
    return a.frontmatter.title.localeCompare(b.frontmatter.title)
  })
}

export function findDocBySlug(slug: string): DocEntry | undefined {
  return loadAll().get(slug)
}

export function readDocSource(entry: DocEntry): string {
  return readFileSync(entry.filePath, 'utf8')
}
