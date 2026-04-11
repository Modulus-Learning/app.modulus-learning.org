'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'

import { Accordion, HomeIcon } from '@infonomic/uikit/react'
import cx from 'classnames'
import { useSwipeable } from 'react-swipeable'

import { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
import { t } from '@/i18n/migrate-t'
import { pathWithoutLocale } from '@/i18n/utils'
import logo from '@/images/infonomic-type-logo-web-white.svg'
import menuRocket from '@/images/menu-rocket.svg'
import { LangLink } from '../../i18n/components/lang-link'
import type { Locale } from '@/i18n/i18n-config'

import './mobile-menu.css'

interface MenuItem {
  title: string
  path: string
  tagline?: string
  children: MenuItem[] | null
}

const menuItems: MenuItem[] = [
  {
    title: 'Docs',
    path: '/docs',
    children: null,
  },
  {
    title: 'Ximera',
    path: '/ximera',
    children: null,
  },
  {
    title: 'Registry',
    path: '/registry',
    children: null,
  },
  {
    title: 'Blog',
    path: '/blog',
    children: null,
  },
  {
    title: 'About',
    path: '/about',
    children: null,
  },
  {
    title: 'Contact Us',
    path: '/contact',
    children: null,
  },
]

interface MobileMenuProps {
  open: boolean
  lng: Locale
  onClose: () => void
  joinRef?: any
}

function getActive(pathname: string, path: string): boolean {
  const withoutLocale = pathWithoutLocale(pathname)
  if (path === '/') {
    return withoutLocale === path
  }
  return withoutLocale.startsWith(path)
}

export function MobileMenu({
  open,
  lng,
  onClose,
  joinRef,
  ...other
}: MobileMenuProps): React.JSX.Element {
  const { navigate } = useLangNavigation(lng)
  const pathname = usePathname()

  const handleMenuItemClick =
    (href: string | null) =>
    (event: any): void => {
      if (
        event != null &&
        event.type === 'keydown' &&
        (event.key === 'Tab' || event.key === 'Shift')
      ) {
        return
      }
      if (onClose != null) onClose()
      if (href != null) navigate({ href, smoothScrollToTop: true })
    }

  const handlers = useSwipeable({
    onSwipedRight: () => {
      if (onClose != null) onClose()
    },
  })

  return (
    <div
      id="mobile-menu"
      {...other}
      {...handlers}
      className="mobile-menu"
      data-open={open || undefined}
    >
      <div className="mobile-menu-inner">
        <LangLink prefetch={false} href="/" lng={lng}>
          <Image src={logo} width={140} alt="Infonomic" />
        </LangLink>
        <Accordion.Root
          render={<div className="component--scroller mobile-menu-scroller" />}
          className="mobile-menu-accordion"
        >
          <ul className="mobile-menu-nav-list">
            <Accordion.Item render={<li className="mobile-menu-nav-item" />} value="home">
              <Accordion.Trigger className="mobile-menu-trigger" onClick={handleMenuItemClick('/')}>
                <HomeIcon className="mobile-menu-home-icon" />
                <span>{t('Home')}</span>
              </Accordion.Trigger>
            </Accordion.Item>

            {menuItems?.map((item: MenuItem) => (
              <Accordion.Item
                key={item?.path}
                value={item?.path}
                render={<li className="mobile-menu-nav-item" />}
              >
                <Accordion.Trigger
                  render={
                    <button
                      type="button"
                      className={cx('mobile-menu-trigger', {
                        active: getActive(pathname, item.path),
                      })}
                      onClick={handleMenuItemClick(item.path)}
                    />
                  }
                >
                  {t(item.title)}
                </Accordion.Trigger>
              </Accordion.Item>
            ))}
          </ul>
        </Accordion.Root>
      </div>
      <div className="mobile-menu-rocket-section">
        <div className="mobile-menu-rocket-container image-container not-prose">
          <Image src={menuRocket} alt="Menu rocket" />
        </div>
      </div>
    </div>
  )
}
