'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'

import cx from 'classnames'

import { ProgressBar } from '@/context/progress-bar-provider'
import { useTranslations } from '@/i18n/client'
import { LanguageMenu } from '@/i18n/components/language-menu'
import { ThemeSwitch } from '@/ui/theme/theme-switch'
import { Branding } from './branding'
import type { Locale } from '@/i18n/i18n-config'

interface AppBarProps {
  className?: string
  lng: Locale
}
export type Ref = HTMLDivElement

export function AdminAppBarPublic({ className, lng, ...other }: AppBarProps) {
  const { t } = useTranslations('auth')
  const pathName = usePathname()

  const appBarBackground = 'bg-white dark:bg-primary-900'
  const appBarTextColor = 'text-black fill-black dark:text-white dark:fill-white'

  return (
    <header
      id="header"
      className={cx(
        'sticky top-0 z-30 w-full transition-colors duration-300',
        appBarBackground,
        className
      )}
      {...other}
    >
      <ProgressBar className="fixed h-1 shadow-lg z-50 shadow-primary-600/20 bg-primary-600 dark:bg-primary-100/85 top-0" />
      <div
        id="app-bar"
        className={cx(
          'app-bar sticky top-0 flex min-h-[50px] w-full items-center gap-2 pl-0 pr-[12px]',
          'sm:gap-2 sm:pl-0 sm:pr-[18px]',
          'transition-all duration-500 ease-out'
        )}
      >
        <div className="lg:flex-initial mr-auto">
          <Branding lng={lng} hasScrolled={true} pathName={pathName} />
        </div>
        <LanguageMenu lng={lng} color={appBarTextColor} />
        <Suspense>
          <ThemeSwitch className="mr-3" />
        </Suspense>
      </div>
    </header>
  )
}
