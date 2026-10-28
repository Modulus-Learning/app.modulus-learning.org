import { IntlMessageFormat } from 'intl-messageformat'

import enRaw from './en.json?raw'
import esRaw from './es.json?raw'
import type { Locale } from '@/i18n/i18n-config'
import type enType from './en.json'

/**
 * Framework-agnostic translation loader for the TanStack Start host (spec:
 * Internationalisation; FORRU `translations/index.ts`).
 *
 * Locale files stay plain namespaced JSON. Vite's `?raw` inlines each as a
 * string at transform time, which sidesteps the Nitro dev-server 404 on
 * `./x.json?import`. Every non-default locale is merged over English per
 * namespace, so a missing key falls back to the English text, never the raw
 * key. Eager: two small locales; switch to a dynamic-import map if that grows.
 */

export type Translations = typeof enType
type TranslationOverrides = {
  [Namespace in keyof Translations]?: Partial<Translations[Namespace]>
}

const english = JSON.parse(enRaw) as Translations

const overlay = (overrides: TranslationOverrides): Translations =>
  Object.fromEntries(
    Object.entries(english).map(([namespace, messages]) => [
      namespace,
      { ...messages, ...overrides[namespace as keyof Translations] },
    ])
  ) as Translations

const translations: Record<Locale, Translations> = {
  en: english,
  es: overlay(JSON.parse(esRaw) as TranslationOverrides),
}

export const getTranslations = async (lng: Locale): Promise<Translations> =>
  translations[lng] ?? translations.en

/**
 * Imperative translator for loaders, `head()` and server functions. Components
 * use `useTranslations(namespace)` from the shared provider instead.
 */
export async function createTranslator<T extends keyof Translations>(lng: Locale, namespace: T) {
  const namespaced = (await getTranslations(lng))[namespace]
  return {
    t: (key: keyof Translations[T], values?: Record<string, unknown>): string => {
      const message = namespaced[key] ?? key
      return typeof message === 'string'
        ? (new IntlMessageFormat(message).format(values) as string)
        : String(message)
    },
  }
}
