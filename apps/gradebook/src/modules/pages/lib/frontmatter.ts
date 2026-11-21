/**
 * Frontmatter contract for the standalone pages in /src/content/pages/*.md.
 *
 * Required:  title
 * Optional:  slug, summary, locale, publishedOn
 *
 * `slug` overrides the default slug derived from the filename. Unknown
 * keys are tolerated (some files originate from the Byline importer
 * which understands a wider set), but only the fields below are read.
 */

import matter from 'gray-matter'

export interface PageFrontmatter {
  title: string
  slug?: string
  summary?: string
  locale?: string
  publishedOn?: Date
}

export interface ParsedPage {
  frontmatter: PageFrontmatter
  body: string
}

export function parsePageFile(source: string, filePath: string): ParsedPage {
  const parsed = matter(source)
  const data = parsed.data as Record<string, unknown>

  if (typeof data.title !== 'string' || data.title.trim().length === 0) {
    throw new Error(`${filePath}: frontmatter is missing required 'title' string.`)
  }

  const fm: PageFrontmatter = { title: data.title.trim() }

  const rawSlug = data.slug ?? data.path
  if (rawSlug !== undefined) {
    if (typeof rawSlug !== 'string' || rawSlug.trim().length === 0) {
      throw new Error(`${filePath}: 'slug' must be a non-empty string when provided.`)
    }
    fm.slug = rawSlug.trim().replace(/^\/+/, '')
  }

  if (data.summary !== undefined) {
    if (typeof data.summary !== 'string') {
      throw new Error(`${filePath}: 'summary' must be a string.`)
    }
    fm.summary = data.summary
  }

  if (data.locale !== undefined) {
    if (typeof data.locale !== 'string' || data.locale.trim().length === 0) {
      throw new Error(`${filePath}: 'locale' must be a non-empty string.`)
    }
    fm.locale = data.locale.trim()
  }

  if (data.publishedOn !== undefined) {
    const d =
      data.publishedOn instanceof Date ? data.publishedOn : new Date(String(data.publishedOn))
    if (Number.isNaN(d.getTime())) {
      throw new Error(`${filePath}: 'publishedOn' is not a valid date.`)
    }
    fm.publishedOn = d
  }

  return { frontmatter: fm, body: parsed.content }
}
