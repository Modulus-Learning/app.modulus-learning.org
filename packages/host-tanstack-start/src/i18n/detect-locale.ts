import { match } from '@formatjs/intl-localematcher'
import Negotiator from 'negotiator'

import { i18nConfig, type Locale } from '@/i18n/i18n-config'

/**
 * Pure locale detection, shared by both hosts (spec: Internationalisation).
 *
 * Priority: 1. the `lng` cookie, 2. the path locale (when the caller has one),
 * 3. Accept-Language negotiation, 4. the default locale. Always returns a
 * configured locale — a tampered cookie or path value is ignored, and a
 * malformed Accept-Language header falls back to the default instead of
 * throwing (the old Next code's comment records the 500 that used to cause).
 */
export interface DetectLocaleOptions {
  cookie?: string | null
  pathLocale?: string | null
  acceptLanguage?: string | null
}

const isLocale = (value: string | null | undefined): value is Locale =>
  value != null && (i18nConfig.locales as readonly string[]).includes(value)

export function detectLocale({
  cookie,
  pathLocale,
  acceptLanguage,
}: DetectLocaleOptions = {}): Locale {
  if (isLocale(cookie)) return cookie
  if (isLocale(pathLocale)) return pathLocale

  if (acceptLanguage) {
    try {
      const languages = new Negotiator({
        headers: { 'accept-language': acceptLanguage },
      }).languages()
      return match(
        languages,
        i18nConfig.locales as unknown as string[],
        i18nConfig.defaultLocale
      ) as Locale
    } catch {
      // Fall through to the default on any negotiation error.
    }
  }

  return i18nConfig.defaultLocale
}
