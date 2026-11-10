import type { RootConfig } from '@/lib/public-config'

/**
 * Route `head()` builder for the TanStack Start host, replacing the Next
 * `getMeta` / `generateMetadata` pair (spec: Next API replacement table). The
 * site name and description are build-constant (`VITE_*`); canonical and Open
 * Graph URLs use the runtime `publicServerUrl` from the root loader, so each
 * instance advertises its own origin.
 */
export interface HeadOptions {
  title?: string
  description?: string
  path?: string
}

interface RouteMatchLike {
  routeId: string
  loaderData?: unknown
}

export const pageHead = (options: HeadOptions, matches: readonly RouteMatchLike[] = []) => {
  const siteName = import.meta.env.VITE_SITE_NAME
  const description = options.description ?? import.meta.env.VITE_SITE_DESCRIPTION
  const title = `${siteName} - ${options.title ?? 'Home'}`
  const root = matches.find((match) => match.routeId === '__root__')?.loaderData as
    | RootConfig
    | undefined
  const siteUrl = root?.publicConfig.publicServerUrl
  const url = siteUrl != null ? new URL(options.path ?? '/', siteUrl).href : undefined

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { name: 'application-name', content: siteName },
      { name: 'theme-color', content: '#050708' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      ...(url != null ? [{ property: 'og:url', content: url }] : []),
      { property: 'og:image', content: '/opengraph-image.png?v15' },
      { property: 'og:image:width', content: '2200' },
      { property: 'og:image:height', content: '1150' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: '/twitter-image.png?v15' },
    ],
    links: [
      { rel: 'manifest', href: '/site.webmanifest?v15' },
      ...(url != null ? [{ rel: 'canonical', href: url }] : []),
    ],
  }
}
