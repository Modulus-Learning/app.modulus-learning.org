import { detectLocale } from '@/i18n/detect-locale'
import { i18nConfig, type Locale } from '@/i18n/i18n-config'
import { isLocalizablePath } from '@/i18n/locale-rewrite'

/**
 * Server-entry locale negotiation and canonicalisation (spec:
 * Internationalisation). Runs in `src/server.ts` on the ORIGINAL request,
 * before the router's `rewrite.input` would hide whether the URL arrived bare.
 *
 * - **The URL wins.** A path with a non-default locale prefix is canonical and
 *   is never redirected away because of the cookie.
 * - **Canonicalisation.** An externally typed `/en/…` 301s to the clean form.
 * - **Negotiation.** A bare localizable path whose cookie or Accept-Language
 *   prefers a non-default locale 302s to `/<lng>/…`. A default-locale
 *   preference stays on the clean URL.
 * - GET only: form posts and server functions are never redirected.
 */

const readCookie = (header: string | null, name: string): string | undefined => {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim())
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

const isLocale = (value: string): value is Locale =>
  (i18nConfig.locales as readonly string[]).includes(value)

export function negotiateLocaleRedirect(request: Request): Response | null {
  if (request.method !== 'GET') return null

  const url = new URL(request.url)
  const { pathname } = url
  const first = pathname.split('/')[1] ?? ''

  if (isLocale(first)) {
    if (first === i18nConfig.defaultLocale) {
      const rest = pathname.slice(`/${first}`.length) || '/'
      return Response.redirect(new URL(`${rest}${url.search}`, url), 301)
    }
    return null
  }

  if (!isLocalizablePath(pathname)) return null

  const detected = detectLocale({
    cookie: readCookie(request.headers.get('cookie'), i18nConfig.cookieName),
    acceptLanguage: request.headers.get('accept-language'),
  })

  if (detected !== i18nConfig.defaultLocale) {
    const target = pathname === '/' ? `/${detected}` : `/${detected}${pathname}`
    return Response.redirect(new URL(`${target}${url.search}`, url), 302)
  }

  return null
}
