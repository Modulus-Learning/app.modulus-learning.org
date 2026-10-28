import {
  createFileRoute,
  type FileRoutesByPath,
  notFound,
  Outlet,
  type ParseParamsFn,
  type ResolveParams,
  type StringifyParamsFn,
} from '@tanstack/react-router'

import { TranslationsProvider } from '@/i18n/client/translations-provider'
import { i18nConfig, type Locale } from '@/i18n/i18n-config'
import { getTranslations } from '@/i18n/translations/index'
import type { RouteParams } from '@/lib/route-params'

const isLocale = (value: string): value is Locale =>
  (i18nConfig.locales as readonly string[]).includes(value)

// The locale layout's params parser, typed as TanStack requires it. TanStack's
// check that parsed params fit the path's own params (`ValidateParsedParams`,
// not exported) cannot be proven for a host-supplied path, so it is restated
// here; the assertion is scoped to `parse`, and `lng` keeps the `Locale` type.
type LocaleParams = { lng: Locale }
type LocaleParse<TPath extends string> = ParseParamsFn<TPath, LocaleParams> &
  ([LocaleParams] extends [ResolveParams<TPath, any>] ? unknown : never)

/**
 * The localized tree (spec: Internationalisation). `$lng` is a REQUIRED
 * segment: the router's `rewrite.input` prepends `en` to bare localizable
 * paths before matching, so it is always present here. An unknown prefix
 * (`/xx/…`) 404s at the matcher. Negotiation happened earlier, in the server
 * entry, on the un-rewritten request.
 */
export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    // TanStack validates the parsed params against the path's own param shape,
    // which cannot be named inside the package; assert the exact signatures.
    params: {
      parse: ((raw: Record<string, string>) => {
        const lng = raw.lng ?? ''
        if (!isLocale(lng)) throw notFound()
        return { lng }
      }) as unknown as LocaleParse<FileRoutesByPath[TPath]['path']>,
      stringify: (({ lng }: { lng: Locale }) => ({ lng })) as unknown as StringifyParamsFn<
        FileRoutesByPath[TPath]['path'],
        { lng: Locale }
      >,
    },
    beforeLoad: ({ params }) => ({ locale: (params as RouteParams).lng }),
    loader: async ({ context }) => ({
      translations: await getTranslations((context as { locale: Locale }).locale),
    }),
    component: function LocaleLayout() {
      const { translations } = Route.useLoaderData()
      return (
        <TranslationsProvider translations={translations}>
          <Outlet />
        </TranslationsProvider>
      )
    },
  })
  return Route
}
