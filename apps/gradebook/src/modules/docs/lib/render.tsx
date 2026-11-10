import type { ComponentProps, ReactNode } from 'react'

import { Table } from '@infonomic/uikit/react'
import type { Root as HastRoot } from 'hast'
import type { Components } from 'hast-util-to-jsx-runtime'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import type { Root as MdastRoot } from 'mdast'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

import { stripLeadingH1IfMatches } from './strip-leading-h1'

export interface RenderResult {
  content: ReactNode
}

function MdTable({ ref: _ref, ...props }: ComponentProps<'table'>) {
  return (
    <Table.Container>
      <Table {...props} />
    </Table.Container>
  )
}

const components: Partial<Components> = {
  table: MdTable,
  thead: Table.Header,
  tbody: Table.Body,
  tr: Table.Row,
  th: Table.HeadingCell,
  td: Table.Cell,
}

export async function renderMarkdown(body: string, title: string): Promise<RenderResult> {
  const mdast = unified().use(remarkParse).use(remarkGfm).parse(body) as MdastRoot
  const cleaned = stripLeadingH1IfMatches(mdast, title)
  const hast = (await unified().use(remarkRehype).run(cleaned)) as HastRoot
  const content = toJsxRuntime(hast, { Fragment, jsx, jsxs, components })
  return { content }
}

/**
 * Synchronous variant for client rendering (the TanStack Start docs pages render
 * from serialisable loader data): `remark-rehype` has no async plugins here.
 */
export function renderMarkdownSync(body: string, title: string): ReactNode {
  const mdast = unified().use(remarkParse).use(remarkGfm).parse(body) as MdastRoot
  const cleaned = stripLeadingH1IfMatches(mdast, title)
  const hast = unified().use(remarkRehype).runSync(cleaned) as HastRoot
  return toJsxRuntime(hast, { Fragment, jsx, jsxs, components })
}
