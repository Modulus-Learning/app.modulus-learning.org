/**
 * Framework adapter (spec: Execution Rules → shared components). Shared UI
 * imports its navigation and image primitives from `@/framework` instead of
 * `next/*`, so the same component runs in both hosts during the migration:
 *
 * - The Next host and the test suite resolve `@/framework` through tsconfig
 *   paths to THIS file, which re-exports the Next implementations unchanged.
 * - The TanStack Start host aliases `@/framework` to `./start.tsx` in
 *   `vite.config.ts`, which implements the same signatures on TanStack Router.
 *
 * Task 18 deletes this file and points the alias's consumers at the Start
 * implementation directly.
 */
export { default as Image } from 'next/image'
export { default as Link } from 'next/link'
export { usePathname, useRouter, useSearchParams } from 'next/navigation'

export { LangLink, type LangLinkProps } from '@/i18n/components/lang-link'
export { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
