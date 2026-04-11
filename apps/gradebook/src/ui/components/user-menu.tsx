'use client'

import { startTransition, useActionState, useState } from 'react'

import {
  Avatar,
  DashboardIcon,
  Dropdown,
  IconButton,
  SignOutIcon,
  UserIcon,
} from '@infonomic/uikit/react'
import cx from 'classnames'

import { useTranslations } from '@/i18n/client'
import { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
import { signOut } from '@/modules/app/session/password-auth'
import { useUserSession } from '@/modules/app/session/provider'
import type { Locale } from '@/i18n/i18n-config'

type UserMenuIntrinsicProps = React.JSX.IntrinsicElements['div']
interface UserMenuProps extends UserMenuIntrinsicProps {
  className?: string
  shiftMenu?: boolean
  color?: string
  lng: Locale
}

export function UserMenu({ className, lng, shiftMenu = true }: UserMenuProps): React.JSX.Element {
  const { navigate } = useLangNavigation(lng)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [_formState, formAction, _isPending] = useActionState(signOut, '')
  const { t } = useTranslations('common')
  const session = useUserSession()
  const canAccessDashboard = session?.abilities.includes('access_dashboard')
  const initials = session?.user?.full_name ? session.user.full_name.slice(0, 2).toUpperCase() : ''

  const handleSignOut = () => {
    startTransition(() => {
      formAction()
    })
  }

  return (
    <div className={className}>
      <Dropdown.Root modal={false} open={userMenuOpen} onOpenChange={setUserMenuOpen}>
        <Dropdown.Trigger
          render={<IconButton size="sm" variant="filled" className="p-0 mt-1 w-[32px] h-[32px]" />}
        >
          <Avatar initials={initials} />
        </Dropdown.Trigger>

        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            sideOffset={shiftMenu ? 10 : 10}
            className={cx(
              'z-40 rounded radix-side-bottom:animate-slide-down radix-side-top:animate-slide-up',
              'w-[160px] px-1.5 py-1 shadow-md',
              'bg-white dark:bg-canvas-800 border dark:border-canvas-700 shadow'
            )}
          >
            {canAccessDashboard && (
              <Dropdown.Item
                className="flex items-center w-full"
                // NOTE: We need to use navigate in order to get BOTH
                // the select menu to close, and to navigate with a progress
                // indicator. We CANNOT use LangLink here.
                onClick={() => {
                  setUserMenuOpen(false)
                  navigate({ href: '/dashboard', smoothScrollToTop: true })
                }}
              >
                <span className="inline-block w-[28px]">
                  <DashboardIcon width="22px" height="22px" />
                </span>
                <span className="text-left inline-block leading-none w-full flex-1 text-black dark:text-gray-300">
                  Dashboard
                </span>
              </Dropdown.Item>
            )}

            <Dropdown.Item
              className="flex items-center w-full"
              // NOTE: We need to use navigate in order to get BOTH
              // the select menu to close, and to navigate with a progress
              // indicator. We CANNOT use LangLink here.
              onClick={() => {
                setUserMenuOpen(false)
                navigate({ href: '/account', smoothScrollToTop: true })
              }}
            >
              <span className="inline-block w-[28px]">
                <UserIcon width="22px" height="22px" />
              </span>
              <span className="text-left inline-block leading-none w-full flex-1 text-black dark:text-gray-300">
                Account
              </span>
            </Dropdown.Item>
            <Dropdown.Separator className="my-1 border-t border-t-gray-300 dark:border-t-gray-900 w-[90%] mx-auto" />
            <Dropdown.Item>
              <form action={formAction} noValidate className="flex items-center w-full">
                <button type="button" onClick={handleSignOut} className="flex items-center w-full">
                  <span className="inline-block w-[28px]">
                    <SignOutIcon />
                  </span>
                  <span className="text-left inline-block w-full flex-1 leading-none text-black dark:text-gray-300">
                    {t('Sign Out')}
                  </span>
                </button>
              </form>
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  )
}
