import type * as React from 'react'
import { usePathname } from 'next/navigation'

import { NavigationMenu } from '@base-ui/react/navigation-menu'

import { useTranslations } from '@/i18n/client'
import { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
import { pathWithoutLocale } from '@/i18n/utils'
import type { Locale } from '@/i18n/i18n-config'

import './main-menu.css'

function getActive(pathname: string, path: string): boolean {
  const withoutLocale = pathWithoutLocale(pathname)
  if (path === '/') {
    return withoutLocale === path
  }
  return withoutLocale.startsWith(path)
}

export function MainMenu({ lng }: { lng: Locale }): React.JSX.Element {
  const { t } = useTranslations('common')
  return (
    <div className="main-menu-wrapper">
      <NavigationMenu.Root id="main-menu" className="main-menu-root">
        <NavigationMenu.List className="main-menu-list">
          <NavigationMenu.Item className="main-menu-item">
            <LinkItem href="/" lng={lng}>
              {t('Home')}
            </LinkItem>
          </NavigationMenu.Item>

          <NavigationMenu.Item className="main-menu-item">
            <LinkItem href="/" lng={lng}>
              Item 1
            </LinkItem>
          </NavigationMenu.Item>

          <NavigationMenu.Item className="main-menu-item">
            <LinkItem href="/" lng={lng}>
              Item 2
            </LinkItem>
          </NavigationMenu.Item>

          <NavigationMenu.Item className="main-menu-item">
            <LinkItem href="/" lng={lng}>
              Item 3
            </LinkItem>
          </NavigationMenu.Item>
        </NavigationMenu.List>
      </NavigationMenu.Root>
    </div>
  )
}

interface LinkItemProps extends React.ComponentPropsWithoutRef<'a'> {
  lng: Locale
}

const LinkItem = ({ href, lng, children }: LinkItemProps) => {
  const { navigate } = useLangNavigation(lng)
  const pathname = usePathname()
  const isActive = getActive(pathname, href as string)

  return (
    <NavigationMenu.Link
      className="main-menu-link-item"
      active={isActive}
      href={href}
      onClick={(_e) => {
        navigate({ href: href as string, smoothScrollToTop: true })
      }}
    >
      {children}
    </NavigationMenu.Link>
  )
}
