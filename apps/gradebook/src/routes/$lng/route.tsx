import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'

import { TranslationsProvider } from '@/i18n/client/translations-provider'
import { i18nConfig, type Locale } from '@/i18n/i18n-config'
import { getTranslations } from '@/i18n/translations'

const isLocale = (value: string): value is Locale =>
  (i18nConfig.locales as readonly string[]).includes(value)

/**
 * The localized tree (spec: Internationalisation). `$lng` is a REQUIRED
 * segment: the router's `rewrite.input` prepends `en` to bare localizable
 * paths before matching, so it is always present here. An unknown prefix
 * (`/xx/…`) 404s at the matcher. Negotiation happened earlier, in the server
 * entry, on the un-rewritten request.
 */
export const Route = createFileRoute('/$lng')({
  params: {
    parse: ({ lng }) => {
      if (!isLocale(lng)) throw notFound()
      return { lng }
    },
    stringify: ({ lng }) => ({ lng }),
  },
  beforeLoad: ({ params }) => ({ locale: params.lng }),
  loader: async ({ context }) => ({ translations: await getTranslations(context.locale) }),
  component: function LocaleLayout() {
    const { translations } = Route.useLoaderData()
    return (
      <TranslationsProvider translations={translations}>
        <Outlet />
      </TranslationsProvider>
    )
  },
})
