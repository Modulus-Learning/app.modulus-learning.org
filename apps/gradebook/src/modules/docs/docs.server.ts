import { type DocFrontmatter, parseDocFile } from './lib/frontmatter'
import { parseFilename } from './lib/registry'

/**
 * Docs registry for the TanStack Start host. The markdown is bundled at build
 * time with `import.meta.glob`, so the image no longer depends on
 * `src/content` at a cwd-relative path (spec: Decisions → bundle the docs).
 * Ordering and slug rules match `lib/registry.ts`.
 */

const SOURCES = import.meta.glob('/src/content/docs/*.{md,markdown}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export interface DocSummary {
  slug: string
  filePath: string
  order?: number
  frontmatter: DocFrontmatter
}

const entries = (() => {
  const map = new Map<string, DocSummary & { source: string }>()
  for (const [filePath, source] of Object.entries(SOURCES)) {
    const { frontmatter } = parseDocFile(source, filePath)
    const { slug: fileSlug, order } = parseFilename(filePath.split('/').pop() ?? filePath)
    const slug = frontmatter.slug ?? fileSlug
    if (map.has(slug)) throw new Error(`docs registry: duplicate slug '${slug}' (in ${filePath})`)
    map.set(slug, { slug, filePath, order, frontmatter, source })
  }
  return map
})()

export const listDocs = (): DocSummary[] =>
  [...entries.values()]
    .map(({ source: _source, ...summary }) => summary)
    .sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order
      if (a.order !== undefined) return -1
      if (b.order !== undefined) return 1
      return a.frontmatter.title.localeCompare(b.frontmatter.title)
    })

export const getDoc = (slug: string): { summary: DocSummary; body: string } | null => {
  const entry = entries.get(slug)
  if (entry == null) return null
  const { source, ...summary } = entry
  return { summary, body: parseDocFile(source, entry.filePath).body }
}
