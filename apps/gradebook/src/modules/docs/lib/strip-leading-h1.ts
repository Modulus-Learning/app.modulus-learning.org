/**
 * Drop the body's leading H1 when its text matches the frontmatter
 * `title`. Frontmatter is the source of truth for the page title; if
 * the body also opens with the same H1 the rendered doc would display
 * the title twice.
 */

import type { Root } from 'mdast'
import { toString as mdastToString } from 'mdast-util-to-string'

export function stripLeadingH1IfMatches(root: Root, title: string): Root {
  const first = root.children[0]
  if (first?.type !== 'heading' || first.depth !== 1) return root
  const headingText = mdastToString(first).trim().toLowerCase()
  const wanted = title.trim().toLowerCase()
  if (headingText !== wanted) return root
  return { ...root, children: root.children.slice(1) }
}
