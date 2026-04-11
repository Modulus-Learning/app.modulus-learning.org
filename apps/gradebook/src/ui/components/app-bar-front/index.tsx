'use client'

import { forwardRef, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

import cx from 'classnames'

import { ProgressBar } from '@/context/progress-bar-provider'
import { useTranslations } from '@/i18n/client'
import { LanguageMenu } from '@/i18n/components/language-menu'
import { useUserSession } from '@/modules/app/session/provider'
import { ThemeSwitch } from '@/ui/theme/theme-switch'
import { UserMenu } from '../user-menu'
import { Branding } from './branding'
import { SignIn } from './sign-in-out'
import type { Locale } from '@/i18n/i18n-config'

interface AppBarProps {
  className?: string
  lng: Locale
}
export type Ref = HTMLDivElement

export const AppBarFront = forwardRef<Ref, AppBarProps>(function AppBar(
  { className, lng, ...other },
  ref
) {
  const { t } = useTranslations('auth')
  const session = useUserSession()
  const pathName = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [hasScrolled, setHasScrolled] = useState(false)

  const _handleToggleMobileMenu = (event: React.MouseEvent<HTMLButtonElement> | null): void => {
    if (event != null) event.stopPropagation()
    // e.preventDefault()
    setMobileMenuOpen(!mobileMenuOpen)
  }

  const _handleMobileMenuClose = (): void => {
    setMobileMenuOpen(false)
  }

  const handleWindowClick = (): void => {
    setMobileMenuOpen(false)
  }

  useEffect(() => {
    window.addEventListener('click', handleWindowClick)
    return () => {
      window.removeEventListener('click', handleWindowClick)
    }
  })

  const handleScroll = (): void => {
    // TODO - refine for correct locale detection
    // For now home / and anything with a two character path / locale will
    // work.
    if (pathName.length <= 3) {
      const position = window.scrollY
      if (position > 20) {
        setHasScrolled(true)
      } else {
        setHasScrolled(false)
      }
    }
  }

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  })

  const appBarBackground =
    hasScrolled || pathName.length > 3 ? 'bg-white dark:bg-primary-900' : 'bg-transparent'

  const appBarTextColor =
    hasScrolled || pathName.length > 3
      ? 'text-black fill-black dark:text-white dark:fill-white'
      : 'text-black fill-black dark:text-white dark:fill-white'

  const _hamburgerColor =
    hasScrolled || pathName.length > 3
      ? 'bg-black before:bg-black after:bg-black dark:bg-white dark:before:bg-white dark:after:bg-white'
      : 'bg-white before:bg-white after:bg-white'

  const _hamburgerColorMobileMenuOpen = 'bg-white before:bg-white after:bg-white'

  return (
    <header
      id="header"
      className={cx(
        'sticky top-0 z-30 w-full transition-colors duration-300',
        appBarBackground,
        className
      )}
      ref={ref}
      {...other}
    >
      <ProgressBar className="fixed h-1 shadow-lg z-50 shadow-primary-600/20 bg-primary-900 dark:bg-white top-0" />
      <div
        id="app-bar"
        className={cx(
          'app-bar sticky top-0 flex min-h-[50px] w-full items-center gap-2 pl-0 pr-[12px]',
          'sm:gap-2 sm:pl-0 sm:pr-[18px]',
          'transition-all duration-500 ease-out'
        )}
      >
        <div className="lg:flex-initial mr-auto">
          <Branding lng={lng} hasScrolled={hasScrolled} pathName={pathName} />
        </div>
        <LanguageMenu lng={lng} color={appBarTextColor} />
        <ThemeSwitch className="mr-3" />
        {session != null ? <UserMenu lng={lng} /> : <SignIn lng={lng} />}
      </div>
    </header>
  )
})
